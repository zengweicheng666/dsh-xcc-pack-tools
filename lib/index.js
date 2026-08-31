/**
 * dsh-xcc-pack-tools — XCC-Deluxe project pack/build/release tools for
 * DeepSeek Harness.
 *
 * Registers xcc_pack / xcc_web_build / xcc_release / xcc_job as agent tools,
 * and a fenced JSON API under /pack/api/* consumed by the client-side
 * sidebar panel (registered into dsh-better-sidebar as the 'pack' tab).
 *
 * Operations (all spawned as background jobs, polled by the client):
 *   - UE packaging : project root package.ps1 (UAT BuildCookRun → Saved\Windows)
 *   - Web build    : Web\copy-dist-dev.ps1 | copy-dist-prod.ps1
 *   - Release      : copy Saved\Windows → Saved\XCC-Deluxe-{yyyyMMdd}(-N)\
 *                    then zip it as Saved\XCC-Deluxe-{yyyyMMdd}(-N).zip
 *                    (zip carries the release folder itself as top entry,
 *                    matching the existing archive convention).
 */
import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { decodeLine, localDateStamp, scanReleases, computeReleaseName, parseWebVersion, bumpWebVersion, versionText } from './pure.js';

export const name = 'dsh-xcc-pack-tools';
export const inject = ['tools', 'webServer', 'sessions', 'webRuntime'];

const PS = process.platform === 'win32' ? 'powershell.exe' : 'powershell';
const MAX_BODY = 1024 * 1024;

// ---------------------------------------------------------- trust fence
// Same-origin request fence (mirrors dsh-svn-tools): the Host must be ours
// (loopback or a configured trusted host) and any browser markers must be
// same-origin.

function header(headers, name) {
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
}

function parseAuthority(authority) {
  try {
    return new URL(`http://${authority}`);
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function canonicalAuthority(entry, entryUrl) {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port;
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}

function isTrustedAuthority(hostUrl, trustedHosts) {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry);
    if (entryUrl === undefined) return false;
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
  });
}

function isTrustedApiRequest(request, trustedHosts) {
  const host = header(request.headers, 'host');
  if (host === undefined) return false;
  const hostUrl = parseAuthority(host);
  if (hostUrl === undefined) return false;
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).hostname === hostUrl.hostname;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- helpers

/** Read a JSON request body (bounded). */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data.trim() === '' ? {} : JSON.parse(data));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function writeJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}

function writeError(res, error) {
  const status = typeof error?.status === 'number' ? error.status : 500;
  writeJson(res, status, {
    ok: false,
    error: {
      code: error?.code ?? 'error',
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'bad-request', status: 400 });
}

function busyError(message) {
  return Object.assign(new Error(message), { code: 'busy', status: 409 });
}

function conflictError(message) {
  return Object.assign(new Error(message), { code: 'conflict', status: 409 });
}

/** Resolve the session's authoritative working directory. */
function sessionCwdOf(ctx, sessionId, clientCwd) {
  try {
    const headerCwd = ctx.sessions?.get(sessionId)?.header?.cwd;
    if (headerCwd && headerCwd !== '') return headerCwd;
  } catch { /* session store unavailable */ }
  if (clientCwd && clientCwd !== '' && path.isAbsolute(clientCwd)) return clientCwd;
  return process.cwd();
}

/** Walk up from `start` until a directory containing XCC.uproject is found. */
async function findProjectRoot(start) {
  let dir = path.resolve(start || '.');
  for (;;) {
    try {
      await fs.access(path.join(dir, 'XCC.uproject'));
      return dir;
    } catch { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw badRequest(`未找到 XCC.uproject（从 ${path.resolve(start || '.')} 向上查找无果）。请在会话中打开 XCC-Deluxe 工作区，或在界面中手动填写项目根路径。`);
}

/** Resolve the UE 5.7 root with the same candidates as package.ps1. */
async function resolveUeDir(requested) {
  const candidates = [
    requested,
    process.env.XCC_UE_DIR,
    'E:\\Program Files\\Epic Games\\UE_5.7',
    'D:\\EpicLib\\UE_5.7',
  ].filter(Boolean);
  for (const c of [...new Set(candidates)]) {
    try {
      const resolved = path.resolve(c);
      await fs.access(path.join(resolved, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat'));
      return resolved;
    } catch { /* try next */ }
  }
  return null;
}

// ------------------------------------------------- 7-Zip detection

let sevenZipCache; // undefined = not probed yet, null = not found, string = path

const SEVEN_ZIP_PATH_CANDIDATES = [
  process.env.SEVEN_ZIP,
  path.join(process.env.ProgramFiles || 'C:\\Program Files', '7-Zip', '7z.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', '7-Zip', '7z.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', '7-Zip', '7z.exe'),
].filter(Boolean);

function whereExe(name) {
  return new Promise((resolve) => {
    execFile('where.exe', [name], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      const line = String(stdout).split(/\r?\n/).map((s) => s.trim()).find((s) => s !== '');
      resolve(line || null);
    });
  });
}

/** Detect a usable 7z.exe: fixed install paths first, then PATH lookup. Cached. */
async function detectSevenZip() {
  if (sevenZipCache !== undefined) return sevenZipCache;
  for (const candidate of SEVEN_ZIP_PATH_CANDIDATES) {
    try {
      await fs.access(candidate);
      sevenZipCache = candidate;
      return candidate;
    } catch { /* try next */ }
  }
  sevenZipCache = await whereExe('7z.exe');
  return sevenZipCache;
}

/** Resolve the release zip tool: explicit '7z'/'dotnet', else auto (7-Zip first). */
async function resolveZipTool(requested) {
  if (requested !== undefined && requested !== null && String(requested).trim() !== '' && requested !== 'auto') {
    if (requested !== '7z' && requested !== 'dotnet') throw badRequest('zipTool 必须是 7z 或 dotnet（留空自动）');
    if (requested === '7z' && !(await detectSevenZip())) {
      throw conflictError('未检测到 7-Zip（7z.exe）。请安装 7-Zip，或改用 zipTool=dotnet。');
    }
    return requested;
  }
  return (await detectSevenZip()) ? '7z' : 'dotnet';
}

/** Resolve the UE 5.7 root with the same candidates as package.ps1. */
async function dirSize(root) {
  let total = 0;
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          total += (await fs.stat(full)).size;
        } catch { /* skip */ }
      }
    }
  }
  await walk(root);
  return total;
}

// --------------------------------------------------------------- jobs

const jobs = new Map();     // jobId -> job
const active = new Map();   // kind -> jobId (single-flight per kind)

/**
 * Spawn a child process, stream its output (UTF-8 → GBK per line) into the
 * job's line buffer, resolve with its exit code. Rejects on spawn failure.
 */
function spawnChild(job, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      windowsHide: true,
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    job.children.add(child);
    let buf = Buffer.alloc(0);
    const feed = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let idx;
      while ((idx = buf.indexOf(0x0a)) !== -1) {
        const line = decodeLine(buf.subarray(0, idx)).replace(/\r$/, '').trimEnd();
        buf = buf.subarray(idx + 1);
        if (line !== '') {
          job.lines.push(line);
          if (job.lines.length > 200) job.lines.shift();
        }
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => {
      job.children.delete(child);
      reject(e);
    });
    child.on('close', (code) => {
      job.children.delete(child);
      // flush any trailing partial line
      if (buf.length > 0) {
        const line = decodeLine(buf).replace(/\r$/, '').trimEnd();
        if (line !== '') {
          job.lines.push(line);
          if (job.lines.length > 200) job.lines.shift();
        }
      }
      resolve(code ?? -1);
    });
  });
}

function createJob(kind) {
  const existing = active.get(kind);
  if (existing !== undefined && jobs.get(existing)?.running) {
    throw busyError(`已有「${kind}」任务在运行（${existing}），请等待完成或先取消。`);
  }
  const jobId = randomUUID();
  const job = {
    jobId,
    kind,
    running: true,
    stage: 'starting',
    lines: [],
    startedAt: Date.now(),
    exitCode: undefined,
    error: undefined,
    killed: false,
    result: undefined,
    children: new Set(),
  };
  jobs.set(jobId, job);
  active.set(kind, jobId);
  return job;
}

function finishJob(job, { exitCode, error }) {
  job.running = false;
  if (exitCode !== undefined) job.exitCode = exitCode;
  if (error !== undefined) job.error = error instanceof Error ? error.message : String(error);
  if (active.get(job.kind) === job.jobId) active.delete(job.kind);
  setTimeout(() => jobs.delete(job.jobId), 30 * 60 * 1000).unref?.();
}

function jobPoll(jobId) {
  const job = jobs.get(jobId);
  if (job === undefined) {
    return {
      running: false,
      done: true,
      stage: 'gone',
      lines: [],
      error: '任务已过期或不存在（服务器可能已重启）。',
    };
  }
  return {
    running: job.running,
    done: !job.running,
    stage: job.stage,
    lines: job.lines.slice(-12),
    exitCode: job.exitCode,
    error: job.error,
    killed: job.killed || undefined,
    result: job.result,
    elapsedMs: Date.now() - job.startedAt,
  };
}

/** Cancel a job: taskkill every child process tree. */
function killJob(jobId) {
  const job = jobs.get(jobId);
  if (job === undefined) throw badRequest('任务不存在或已过期');
  job.killed = true;
  for (const child of job.children) {
    if (child.pid !== undefined) {
      try {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      } catch { /* best effort */ }
    }
  }
  return { jobId, killed: true };
}

/**
 * Launch an executable fully detached (own process group, stdio ignored,
 * unref'd) so it outlives the dsh web server and never blocks its event
 * loop. Resolves once the process has actually started; rejects on spawn
 * failure (e.g. invalid exe). Windows: the child survives parent exit.
 */
function startDetached(exe, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, [], { cwd, detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', reject);
    child.on('spawn', () => {
      try { child.unref(); } catch { /* already closed */ }
      resolve({ pid: child.pid });
    });
  });
}

// ---------------------------------------------------------- api layer

function buildApi(ctx) {
  const api = {};

  api.root = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    const outputDir = path.join(projectRoot, 'Saved', 'Windows');
    const hasBuild = await fs.access(path.join(outputDir, 'XCC.exe')).then(() => true).catch(() => false);
    const ueDir = await resolveUeDir(p.ue5Dir);
    const releases = await scanReleases(path.join(projectRoot, 'Saved'));
    // Web UI version (Web/version.json, bumped by copy-dist-common.ps1 on every build)
    let webVersion = null;
    try {
      const raw = await fs.readFile(path.join(projectRoot, 'Web', 'version.json'), 'utf8');
      const v = parseWebVersion(raw);
      if (v) webVersion = { current: versionText(v), next: versionText(bumpWebVersion(v)) };
    } catch { /* no version.json */ }
    const sevenZip = await detectSevenZip();
    return {
      projectRoot,
      uproject: path.join(projectRoot, 'XCC.uproject'),
      webDir: path.join(projectRoot, 'Web'),
      packageScript: path.join(projectRoot, 'package.ps1'),
      outputDir,
      hasBuild,
      ueDir,
      ueAutoCandidates: [process.env.XCC_UE_DIR, 'E:\\Program Files\\Epic Games\\UE_5.7', 'D:\\EpicLib\\UE_5.7'].filter(Boolean),
      releases,
      webVersion,
      sevenZip,
      zipTool: sevenZip ? '7z' : 'dotnet',
      now: localDateStamp(),
    };
  };

  api.nextName = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    const releases = await scanReleases(path.join(projectRoot, 'Saved'));
    const date = p.date && /^\d{8}$/.test(p.date) ? p.date : localDateStamp();
    const info = computeReleaseName(releases, date, p.number);
    return {
      ...info,
      dir: path.join(projectRoot, 'Saved', info.name),
      zip: path.join(projectRoot, 'Saved', `${info.name}.zip`),
    };
  };

  api.packStart = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    const script = path.join(projectRoot, 'package.ps1');
    const args = [];
    const buildConfig = p.buildConfig ?? 'Development';
    if (!['Development', 'Shipping', 'Debug'].includes(buildConfig)) throw badRequest('buildConfig 必须是 Development / Shipping / Debug');
    if (p.skipCompile) args.push('-SkipCompile');
    if (p.skipWebBuild) args.push('-SkipWebBuild');
    if (p.cleanCook) args.push('-CleanCook');
    if (p.closeEditor) args.push('-CloseEditor');
    args.push('-BuildConfig', buildConfig);
    if (p.ue5Dir) args.push('-UE5Dir', p.ue5Dir);
    const job = createJob('pack');
    job.stage = 'packaging';
    (async () => {
      try {
        job.lines.push(`powershell -File ${script} ${args.join(' ')}`);
        const code = await spawnChild(job, PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { cwd: projectRoot });
        if (code !== 0) throw new Error(`package.ps1 退出码 ${code}，打包失败。`);
        job.stage = 'done';
        job.result = { outputDir: path.join(projectRoot, 'Saved', 'Windows') };
        finishJob(job, { exitCode: code });
      } catch (e) {
        finishJob(job, { error: e });
      }
    })();
    return { jobId: job.jobId, kind: 'pack' };
  };

  api.packPoll = (p) => jobPoll(p.jobId);

  api.webBuildStart = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    const mode = p.mode ?? 'dev';
    if (!['dev', 'prod'].includes(mode)) throw badRequest('mode 必须是 dev 或 prod');
    const script = path.join(projectRoot, 'Web', mode === 'prod' ? 'copy-dist-prod.ps1' : 'copy-dist-dev.ps1');
    const args = [];
    if (p.targetDir) args.push('-TargetDir', p.targetDir);
    const job = createJob('webBuild');
    job.stage = 'building';
    (async () => {
      try {
        job.lines.push(`powershell -File ${script} ${args.join(' ')}`);
        const code = await spawnChild(job, PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { cwd: path.join(projectRoot, 'Web') });
        if (code !== 0) throw new Error(`Web 构建退出码 ${code}，构建失败。`);
        job.stage = 'done';
        job.result = { mode };
        finishJob(job, { exitCode: code });
      } catch (e) {
        finishJob(job, { error: e });
      }
    })();
    return { jobId: job.jobId, kind: 'webBuild' };
  };

  api.webBuildPoll = (p) => jobPoll(p.jobId);

  api.releaseStart = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    const src = path.join(projectRoot, 'Saved', 'Windows');
    if (!(await fs.access(path.join(src, 'XCC.exe')).then(() => true).catch(() => false))) {
      throw conflictError('打包产物不存在：Saved\\Windows\\XCC.exe 未找到。请先执行 UE 打包。');
    }
    const releases = await scanReleases(path.join(projectRoot, 'Saved'));
    const date = p.date && /^\d{8}$/.test(p.date) ? p.date : localDateStamp();
    const info = computeReleaseName(releases, date, p.number);
    if (info.collisions.length > 0) {
      throw conflictError(`${info.collisions.join('；')}。请更换编号或删除旧产物。`);
    }
    // disk-space sanity: need ~2x build size (copy + zip) plus slack
    try {
      const st = await fs.statfs(src);
      const free = st.bavail * st.bsize;
      const size = await dirSize(src);
      if (free < size * 2 + 1024 * 1024 * 1024) {
        throw conflictError(`磁盘空间不足：发布约需 ${(size * 2 / 1073741824).toFixed(1)} GB，当前可用 ${(free / 1073741824).toFixed(1)} GB。`);
      }
    } catch (e) {
      if (e?.code === 'conflict') throw e;
      // statfs/dirSize unavailable — proceed without the check
    }
    const dst = path.join(projectRoot, 'Saved', info.name);
    const zipPath = `${dst}.zip`;
    const doZip = p.zip !== false;
    const zipTool = await resolveZipTool(p.zipTool); // validated before the job starts
    const job = createJob('release');
    job.stage = 'copying';
    (async () => {
      try {
        const rc = await spawnChild(job, 'robocopy', [src, dst, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/R:2', '/W:1'], { cwd: projectRoot });
        if (rc >= 8) throw new Error(`发布复制失败（robocopy 退出码 ${rc}）。`);
        job.lines.push(`复制完成：${dst}`);
        if (!doZip) {
          job.stage = 'done';
          job.result = { dir: dst, name: info.name, zip: undefined };
          job.lines.push(`发布目录已生成（未压缩）：${dst}`);
          finishJob(job, { exitCode: 0 });
          return;
        }
        job.stage = 'zipping';
        if (zipTool === '7z') {
          // 7z a adds the (relative) dir name as the zip top entry →
          // entries are XCC-Deluxe-{name}/..., same convention as before.
          const sevenZip = await detectSevenZip();
          job.lines.push(`7-Zip: ${sevenZip} a -tzip -mx=9 ${zipPath} ${info.name}`);
          const zc = await spawnChild(job, sevenZip, ['a', '-tzip', '-mx=9', '-y', zipPath, info.name], { cwd: path.join(projectRoot, 'Saved') });
          if (zc !== 0 && zc !== 1) throw new Error(`压缩失败（7-Zip 退出码 ${zc}）。发布目录已生成，可重试压缩。`);
        } else {
          const zipCmd = `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
            `[System.IO.Compression.ZipFile]::CreateFromDirectory('${dst}','${zipPath}',[System.IO.Compression.CompressionLevel]::Optimal,$true)`;
          const zc = await spawnChild(job, PS, ['-NoProfile', '-Command', zipCmd], { cwd: projectRoot });
          if (zc !== 0) throw new Error(`压缩失败（退出码 ${zc}）。发布目录已生成，可重试压缩。`);
        }
        job.stage = 'done';
        job.result = { dir: dst, zip: zipPath, name: info.name, zipTool };
        job.lines.push(`发布完成：${zipPath}（${zipTool === '7z' ? '7-Zip' : '.NET ZipFile'}）`);
        finishJob(job, { exitCode: 0 });
      } catch (e) {
        finishJob(job, { error: e });
      }
    })();
    return { jobId: job.jobId, kind: 'release', name: info.name, dir: dst, zip: doZip ? zipPath : undefined, zipTool };
  };

  api.releasePoll = (p) => jobPoll(p.jobId);

  api.releases = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    return { releases: await scanReleases(path.join(projectRoot, 'Saved')) };
  };

  /**
   * Launch XCC.exe detached (fire-and-forget, not a monitored job):
   * target 'build' → Saved\Windows\XCC.exe; target 'release' → Saved\<name>\XCC.exe.
   * The release name is regex-validated, so no path traversal is possible.
   */
  api.run = async (p) => {
    const cwd = sessionCwdOf(ctx, p.sessionId, p.cwd);
    const projectRoot = await findProjectRoot(p.projectRoot || cwd);
    let exe;
    let dir;
    if (p.target === 'build') {
      dir = path.join(projectRoot, 'Saved', 'Windows');
      exe = path.join(dir, 'XCC.exe');
    } else if (p.target === 'release') {
      const name = String(p.name ?? '');
      if (!/^XCC-Deluxe-\d{8}(?:-\d+)?$/.test(name)) throw badRequest('发布名格式非法（应为 XCC-Deluxe-{yyyyMMdd} 或 XCC-Deluxe-{yyyyMMdd}-N）');
      dir = path.join(projectRoot, 'Saved', name);
      exe = path.join(dir, 'XCC.exe');
    } else {
      throw badRequest('target 必须是 build 或 release');
    }
    try {
      await fs.access(exe);
    } catch {
      throw conflictError(`未找到可运行程序：${exe}`);
    }
    const { pid } = await startDetached(exe, dir);
    return { started: true, exe, pid, dir };
  };

  api.kill = (p) => killJob(p.jobId);

  return api;
}

// --------------------------------------------------------------- tools

function renderResult(value) {
  if (value === undefined || value === null) return '(no output)';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => renderResult(v)).join('\n');
  const lines = [];
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      if (typeof v[0] === 'object' && v[0] !== null) {
        lines.push(`${key}:`);
        for (const item of v) lines.push(`  ${renderResult(item).replace(/\n/g, '\n  ')}`);
      } else {
        lines.push(`${key}: ${v.join(', ')}`);
      }
    } else if (typeof v === 'object') {
      lines.push(`${key}: ${renderResult(v).replace(/\n/g, '\n  ')}`);
    } else {
      lines.push(`${key}: ${String(v)}`);
    }
  }
  return lines.join('\n');
}

function tool({ name: toolName, description, params, readOnly, execute }) {
  return defineTool({
    name: toolName,
    description,
    parameters: params,
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
    },
    timeoutMs: 120000,
    isConcurrencySafe: readOnly ? () => true : undefined,
    async execute(args, exec) {
      try {
        return await execute(args, exec);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    },
  });
}

function toolCwd(exec) {
  return exec.agent?.session?.header?.cwd;
}

export function apply(ctx) {
  const api = buildApi(ctx);

  // ------------------------------------------------------- agent tools
  ctx.tools.register(tool({
    name: 'xcc_pack',
    description: 'Start the XCC-Deluxe UE packaging job (calls the project root package.ps1, UAT BuildCookRun into Saved\\Windows). Returns a jobId immediately; poll with xcc_job. closeEditor=true explicitly allows closing a running Unreal Editor.',
    params: {
      skipCompile: { type: 'boolean', description: 'Skip UE C++ compile (Web UI only change).' },
      skipWebBuild: { type: 'boolean', description: 'Skip the internal production Web UI build step.' },
      cleanCook: { type: 'boolean', description: 'Delete cook cache before cooking (slow).' },
      closeEditor: { type: 'boolean', description: 'Explicitly allow closing a running Unreal Editor.' },
      buildConfig: { type: 'string', enum: ['Development', 'Shipping', 'Debug'], description: 'UE build config (default Development).' },
      ue5Dir: { type: 'string', description: 'Optional UE 5.7 root override.' },
    },
    readOnly: false,
    execute: async (args, exec) => api.packStart({ sessionId: exec.agent?.session?.id, cwd: toolCwd(exec), ...args }),
  }));

  ctx.tools.register(tool({
    name: 'xcc_web_build',
    description: 'Start the XCC-Deluxe Web UI build job (Web\\copy-dist-dev.ps1 for mode dev, copy-dist-prod.ps1 for mode prod; deploys to HTML\\dist and Saved\\Windows\\XCC\\HTML\\dist). Returns a jobId; poll with xcc_job. Project rule: the repo HTML\\dist must be built with dev mode; prod is only for production releases.',
    params: {
      mode: { type: 'string', enum: ['dev', 'prod'], description: 'Build mode (default dev).' },
      targetDir: { type: 'string', description: 'Optional extra target directory override (default ..\\HTML\\dist).' },
    },
    readOnly: false,
    execute: async (args, exec) => api.webBuildStart({ sessionId: exec.agent?.session?.id, cwd: toolCwd(exec), ...args }),
  }));

  ctx.tools.register(tool({
    name: 'xcc_release',
    description: 'Start the XCC-Deluxe release job: copy the packaged build Saved\\Windows to Saved\\XCC-Deluxe-{yyyyMMdd} (first of the day, no number) or XCC-Deluxe-{yyyyMMdd}-N (next auto number), then zip it as the same-name .zip (release folder as the zip top entry). Returns { jobId, name, dir, zip }; poll with xcc_job.',
    params: {
      number: { type: 'integer', description: 'Optional manual release number (>=1). Empty = auto (first of day plain, then -1, -2...).' },
      zip: { type: 'boolean', description: 'Also zip the release directory (default true).' },
      zipTool: { type: 'string', enum: ['7z', 'dotnet'], description: 'Zip tool: 7z (7-Zip, requires installed 7-Zip) or dotnet (.NET ZipFile). Empty = auto (7-Zip first, dotnet fallback).' },
    },
    readOnly: false,
    execute: async (args, exec) => api.releaseStart({ sessionId: exec.agent?.session?.id, cwd: toolCwd(exec), ...args }),
  }));

  ctx.tools.register(tool({
    name: 'xcc_job',
    description: 'Poll an xcc_pack / xcc_web_build / xcc_release job by jobId: running state, stage, recent log lines, exit code, error, elapsed time.',
    params: {
      jobId: { type: 'string', required: true, description: 'Job id returned by the start tool.' },
    },
    readOnly: true,
    execute: async (args) => jobPoll(args.jobId),
  }));

  // ------------------------------------------------------------- web API
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/pack/api',
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req, ctx.webRuntime?.trustedHosts ?? [])) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } });
        return;
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
      const method = pathname.startsWith('/pack/api/') ? pathname.slice('/pack/api/'.length) : undefined;
      if (method === undefined || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown pack API method' } });
        return;
      }
      try {
        const payload = await readJsonBody(req);
        const camel = method.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const handler = api[camel];
        if (handler === undefined) {
          writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown pack API method "${method}"` } });
          return;
        }
        writeOk(res, await handler(payload));
      } catch (error) {
        writeError(res, error);
      }
    },
  }), 'dsh-xcc-pack-tools: /pack/api routes');
}
