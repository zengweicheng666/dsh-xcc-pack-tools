/**
 * Integration test: mounts the plugin's /pack/api route against a stubbed
 * ctx and drives the full release flow on a FAKE XCC-Deluxe project tree
 * (copy + zip + numbering), plus read-only checks against the REAL project
 * (D:\Work\HoloX\XCC-Deluxe) and job-machinery error paths.
 *
 * Run: node --test test/integration.test.mjs
 * Requires the local stub node_modules/@deepseek-ai/dsh-tools (dev only).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply } from '../lib/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const REAL_PROJECT = 'D:\\Work\\HoloX\\XCC-Deluxe';

// Inject a FAKE bdpan CLI (a where.exe copy) via BDPAN_BIN so upload tests
// are deterministic regardless of whether the machine has bdpan installed.
const FAKE_BDPAN = path.join(os.tmpdir(), `dsh-pack-test-bdpan-${process.pid}.exe`);
await fs.copyFile(
  path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'where.exe'),
  FAKE_BDPAN,
);
process.env.BDPAN_BIN = FAKE_BDPAN;
process.on('exit', () => {
  try { fs.rmSync(FAKE_BDPAN, { force: true }); } catch { /* best effort */ }
});

let route = null;
const registeredTools = [];
const ctx = {
  sessions: { get: () => ({ header: { cwd: CURRENT_CWD } }) },
  webRuntime: { trustedHosts: [] },
  webServer: { register: (d) => { route = d; } },
  tools: { register: (t) => { registeredTools.push(t); } },
  effect: (fn) => fn(),
};
apply(ctx);

let CURRENT_CWD = process.cwd();

function makeReq(apiMethod, bodyObj) {
  const body = JSON.stringify(bodyObj || {});
  let dataCb = null;
  let endCb = null;
  const req = {
    method: 'POST',
    url: '/pack/api/' + apiMethod,
    headers: { host: '127.0.0.1:3080' },
    destroy: () => {},
    on: (ev, cb) => {
      if (ev === 'data') dataCb = cb;
      if (ev === 'end') endCb = cb;
      return req;
    },
  };
  req.__start = () => {
    dataCb(Buffer.from(body));
    endCb();
  };
  return req;
}

function makeRes() {
  return {
    status: 0,
    body: '',
    writeHead(s) { this.status = s; },
    end(b) { this.body = b || ''; },
  };
}

async function call(method, body) {
  const req = makeReq(method, body);
  const res = makeRes();
  const pending = route.handler(req, res);
  req.__start();
  await pending;
  return { status: res.status, json: JSON.parse(res.body) };
}

async function waitJob(pollMethod, jobId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status, json } = await call(pollMethod, { jobId });
    assert.equal(status, 200);
    const v = json.value;
    if (!v.running && v.done) return v;
    if (Date.now() > deadline) throw new Error(`job ${jobId} did not finish in ${timeoutMs}ms (last: ${JSON.stringify(v)})`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function makeFakeProject() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pack-fake-'));
  const proj = path.join(root, 'XCC-Deluxe');
  const win = path.join(proj, 'Saved', 'Windows');
  const saved = path.join(proj, 'Saved');
  await fs.mkdir(path.join(win, 'XCC', 'HTML', 'dist'), { recursive: true });
  await fs.mkdir(path.join(win, 'Engine', 'Binaries'), { recursive: true });
  await fs.mkdir(path.join(proj, 'Web'), { recursive: true });
  await fs.writeFile(path.join(proj, 'XCC.uproject'), '{"EngineAssociation": "9.9"}');
  await fs.writeFile(path.join(win, 'XCC.exe'), 'fake exe');
  await fs.writeFile(path.join(win, 'Manifest_UFSFiles_Win64.txt'), 'm');
  await fs.writeFile(path.join(win, 'XCC', 'HTML', 'dist', 'index.html'), '<html>fake</html>');
  await fs.writeFile(path.join(win, 'Engine', 'Binaries', 'dummy.dll'), 'dll');
  await fs.writeFile(path.join(proj, 'Web', 'version.json'), '{"major":1,"minor":2,"patch":3}');
  // pre-existing release from a previous day
  await fs.mkdir(path.join(saved, 'XCC-Deluxe-20260921'), { recursive: true });
  await fs.writeFile(path.join(saved, 'XCC-Deluxe-20260921', 'XCC.exe'), 'old');
  return { root, proj, saved, win };
}

test('plugin applies: route + 4 agent tools registered', () => {
  assert.ok(route);
  assert.equal(route.kind, 'prefix');
  assert.equal(route.path, '/pack/api');
  const names = registeredTools.map((t) => t.name);
  for (const n of ['xcc_pack', 'xcc_web_build', 'xcc_release', 'xcc_job']) {
    assert.ok(names.includes(n), `missing tool ${n}`);
  }
  // xcc_pack must not expose the removed inline-Web-build switch anymore
  const packTool = registeredTools.find((t) => t.name === 'xcc_pack');
  assert.ok(packTool, 'xcc_pack tool registered');
  assert.ok(!JSON.stringify(packTool).includes('skipWebBuild'), 'xcc_pack must not expose skipWebBuild');
});

async function zipEntries(zipPath) {
  const out = [];
  const child = spawn('tar.exe', ['-tf', zipPath], { windowsHide: true });
  child.stdout.on('data', (c) => out.push(c.toString('utf8')));
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)));
  });
  return out.join('').split(/\r?\n/).filter(Boolean);
}

/** Recursive rm with retries (spawned children may briefly hold cwd handles). */
async function rmForce(dir) {
  for (let i = 0; i < 6; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

test('root + nextName + release flow on a fake project', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;

    const root = await call('root', {});
    assert.equal(root.status, 200);
    assert.equal(root.json.value.projectRoot, fake.proj);
    assert.equal(root.json.value.outputDir, fake.win);
    assert.equal(root.json.value.hasBuild, true);
    assert.deepEqual(root.json.value.webVersion, { current: 'v1.2.3', next: 'v1.2.4' });
    assert.ok(['7z', 'dotnet'].includes(root.json.value.zipTool), `zipTool should be 7z|dotnet, got ${root.json.value.zipTool}`);
    if (root.json.value.zipTool === '7z') assert.ok(root.json.value.sevenZip, 'sevenZip path should be reported when 7z is the tool');
    const names = root.json.value.releases.map((r) => r.name);
    assert.deepEqual(names, ['XCC-Deluxe-20260921']);

    // 1. first of the day → plain name
    const n1 = await call('nextName', { date: '20260922' });
    assert.equal(n1.status, 200);
    assert.equal(n1.json.value.name, 'XCC-Deluxe-20260922');
    assert.equal(n1.json.value.number, undefined);

    // 2. release without zip
    const r1 = await call('releaseStart', { date: '20260922', zip: false });
    assert.equal(r1.status, 200);
    const job1 = await waitJob('releasePoll', r1.json.value.jobId);
    assert.equal(job1.stage, 'done');
    assert.equal(job1.error, undefined);
    assert.equal(job1.result.dir, path.join(fake.saved, 'XCC-Deluxe-20260922'));
    const copiedExe = await fs.readFile(path.join(fake.saved, 'XCC-Deluxe-20260922', 'XCC.exe'), 'utf8');
    assert.equal(copiedExe, 'fake exe');

    // 3. next after plain → -1
    const n2 = await call('nextName', { date: '20260922' });
    assert.equal(n2.json.value.name, 'XCC-Deluxe-20260922-1');

    // 4. release with zip (auto tool) → zip has the release folder as its top entry
    const r2 = await call('releaseStart', { date: '20260922', zip: true });
    assert.equal(r2.status, 200);
    const job2 = await waitJob('releasePoll', r2.json.value.jobId, 60000);
    assert.equal(job2.stage, 'done');
    assert.equal(job2.result.zip, path.join(fake.saved, 'XCC-Deluxe-20260922-1.zip'));
    assert.ok(['7z', 'dotnet'].includes(job2.result.zipTool));
    const entries = await zipEntries(job2.result.zip);
    assert.ok(entries.every((e) => e.startsWith('XCC-Deluxe-20260922-1/')), `zip entries should be under the release folder, got: ${entries.slice(0, 5).join(', ')}`);

    // 5. manual number collision → 409
    const coll = await call('releaseStart', { date: '20260922', number: 1, zip: false });
    assert.equal(coll.status, 409);

    // 6. next after -1 → -2
    const n3 = await call('nextName', { date: '20260922' });
    assert.equal(n3.json.value.name, 'XCC-Deluxe-20260922-2');
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('release zip tool selection: explicit dotnet, explicit 7z, invalid', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;
    const root = await call('root', {});
    const sevenZipAvailable = root.json.value.zipTool === '7z';

    // explicit dotnet → deterministic .NET path
    const r = await call('releaseStart', { date: '20260923', zipTool: 'dotnet' });
    assert.equal(r.status, 200);
    assert.equal(r.json.value.zipTool, 'dotnet');
    const job = await waitJob('releasePoll', r.json.value.jobId, 60000);
    assert.equal(job.stage, 'done');
    assert.equal(job.error, undefined);
    assert.equal(job.result.zipTool, 'dotnet');
    const e1 = await zipEntries(job.result.zip);
    assert.ok(e1.every((x) => x.startsWith('XCC-Deluxe-20260923/')), `dotnet zip entries under folder, got: ${e1.slice(0, 3).join(', ')}`);

    // explicit 7z → succeeds when 7-Zip is installed, else 409
    const r2 = await call('releaseStart', { date: '20260924', zipTool: '7z' });
    if (sevenZipAvailable) {
      assert.equal(r2.status, 200);
      assert.equal(r2.json.value.zipTool, '7z');
      const job2 = await waitJob('releasePoll', r2.json.value.jobId, 60000);
      assert.equal(job2.stage, 'done');
      assert.equal(job2.error, undefined);
      assert.equal(job2.result.zipTool, '7z');
      const e2 = await zipEntries(job2.result.zip);
      assert.ok(e2.every((x) => x.startsWith('XCC-Deluxe-20260924/')), `7z zip entries under folder, got: ${e2.slice(0, 3).join(', ')}`);
    } else {
      assert.equal(r2.status, 409);
    }

    // invalid zipTool → 400
    const bad = await call('releaseStart', { date: '20260925', zipTool: 'rar' });
    assert.equal(bad.status, 400);
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('packStart: engine gates reject synchronously when no engine can be resolved', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;
    // association 9.9 is not installed anywhere → 409 before a job exists
    const p = await call('packStart', { buildConfig: 'Development' });
    assert.equal(p.status, 409);
    assert.equal(p.json.error.code, 'engine-not-found');
    assert.ok(p.json.error.message.includes('EngineAssociation'), p.json.error.message);

    // explicit engine dir that is not a UE root → 409 with reason
    const bad = await call('packStart', { ue5Dir: path.join(fake.proj, 'not-an-engine') });
    assert.equal(bad.status, 409);

    // no pack job may have been created by the sync rejections
    const act = await call('activeJobs', {});
    assert.ok(act.json.value.jobs.every((j) => j.kind !== 'pack'));
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('webBuildStart still standalone: script error surfaces in the job (no engine needed)', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;
    const w = await call('webBuildStart', { mode: 'dev' });
    assert.equal(w.status, 200);
    const wj = await waitJob('webBuildPoll', w.json.value.jobId, 30000);
    assert.notEqual(wj.exitCode, 0);
    assert.ok(wj.error, 'webBuild job should report an error (copy-dist-dev.ps1 missing)');

    // invalid mode → 400
    const bad = await call('webBuildStart', { mode: 'nope' });
    assert.equal(bad.status, 400);
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('packEngineSet roundtrip + pack job over a saved fake engine root', async () => {
  const fake = await makeFakeProject();
  const engine = path.join(fake.root, 'FakeEngine');
  await fs.mkdir(path.join(engine, 'Engine', 'Build', 'BatchFiles'), { recursive: true });
  await fs.writeFile(path.join(engine, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat'),
    '@echo off\r\necho FAKE-UAT-RAN\r\nexit /b 0\r\n');
  try {
    CURRENT_CWD = fake.proj;

    // saving a non-engine dir → 409
    const bad = await call('packEngineSet', { engineDir: path.join(fake.proj, 'tmp') });
    assert.equal(bad.status, 409);

    // root before saving: association parsed, no engine resolvable
    let r = await call('root', {});
    assert.equal(r.status, 200);
    assert.equal(r.json.value.ueVersion, '9.9');
    assert.equal(r.json.value.ueAssociation, '9.9');
    assert.equal(r.json.value.ueDir, null);
    assert.equal(r.json.value.ueSource, null);
    assert.equal(r.json.value.ueSavedDir, null);
    assert.ok(r.json.value.uproject.endsWith('XCC.uproject'));

    // save → root resolves through the persisted path
    const set = await call('packEngineSet', { engineDir: engine });
    assert.equal(set.status, 200);
    assert.equal(set.json.value.engineDir, engine);
    r = await call('root', {});
    assert.equal(r.json.value.ueDir, engine);
    assert.equal(r.json.value.ueSource, 'saved');
    assert.equal(r.json.value.ueSavedDir, engine);

    // pack over the fake engine: UBT missing → -nocompile fallback; the fake
    // RunUAT.bat echoes FAKE-UAT-RAN and exits 0 → job succeeds
    const p = await call('packStart', { buildConfig: 'Development' });
    assert.equal(p.status, 200);
    const pj = await waitJob('packPoll', p.json.value.jobId, 30000);
    assert.equal(pj.stage, 'done');
    assert.equal(pj.error, undefined);
    assert.equal(pj.exitCode, 0);
    assert.equal(pj.result.outputDir, path.join(fake.proj, 'Saved', 'Windows'));
    const joined = pj.lines.join('\n');
    assert.ok(joined.includes('FAKE-UAT-RAN'), `UAT output should appear in the log: ${joined.slice(-400)}`);

    // clearing the saved path → unresolvable again
    const clr = await call('packEngineSet', { engineDir: '' });
    assert.equal(clr.status, 200);
    assert.equal(clr.json.value.engineDir, null);
    r = await call('root', {});
    assert.equal(r.json.value.ueDir, null);
    assert.equal(r.json.value.ueSource, null);
    assert.equal(r.json.value.ueSavedDir, null);
  } finally {
    // always remove the per-project engine path this test created
    CURRENT_CWD = fake.proj;
    await call('packEngineSet', { engineDir: '' }).catch(() => {});
    // drop the now-empty enginePaths container if this test created it, so
    // the user's real settings file stays untouched
    try {
      const sp = path.join(os.homedir(), '.dsh', 'dsh-xcc-pack-tools-settings.json');
      const s = JSON.parse(await fs.readFile(sp, 'utf8'));
      if (s.enginePaths && typeof s.enginePaths === 'object' && Object.keys(s.enginePaths).length === 0) {
        delete s.enginePaths;
        await fs.writeFile(sp, JSON.stringify(s, null, 2), 'utf8');
      }
    } catch { /* best effort */ }
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('pack compile step runs UBT when present (regression: never spawns the .uproject)', async () => {
  const fake = await makeFakeProject();
  const engine = path.join(fake.root, 'FakeEngine');
  // Fake engine WITH a UBT exe (a where.exe copy — exits non-zero for our
  // arg patterns, so the compile step must fail with the UBT exit code).
  // This exercises the compile branch that the earlier fake-engine test
  // skipped (UBT missing → -nocompile); before the arg-order fix the step
  // spawned the .uproject path itself → "spawn ...XCC.uproject ENOENT".
  await fs.mkdir(path.join(engine, 'Engine', 'Build', 'BatchFiles'), { recursive: true });
  await fs.writeFile(path.join(engine, 'Engine', 'Build', 'BatchFiles', 'RunUAT.bat'),
    '@echo off\r\necho FAKE-UAT-RAN\r\nexit /b 0\r\n');
  const ubtDir = path.join(engine, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool');
  await fs.mkdir(ubtDir, { recursive: true });
  await fs.copyFile(path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'where.exe'),
    path.join(ubtDir, 'UnrealBuildTool.exe'));
  try {
    CURRENT_CWD = fake.proj;
    await call('packEngineSet', { engineDir: engine });
    // compile NOT skipped → UBT step runs first and must fail on its own
    const p = await call('packStart', { buildConfig: 'Development' });
    assert.equal(p.status, 200);
    const pj = await waitJob('packPoll', p.json.value.jobId, 30000);
    assert.ok(pj.done, 'job should finish');
    assert.ok(pj.error, 'fake UBT exits non-zero → compile failure expected');
    assert.ok(!pj.error.includes('ENOENT'), `must not spawn the uproject as a program: ${pj.error}`);
    assert.ok(pj.error.includes('编译失败'), `error should be the UBT failure: ${pj.error}`);
    const joined = pj.lines.join('\n');
    assert.ok(joined.includes('UBT:'), 'compile step should log the UBT command line');
    assert.ok(joined.includes('-Project='), 'UBT args should carry -Project=<uproject>');
  } finally {
    CURRENT_CWD = fake.proj;
    await call('packEngineSet', { engineDir: '' }).catch(() => {});
    try {
      const sp = path.join(os.homedir(), '.dsh', 'dsh-xcc-pack-tools-settings.json');
      const s = JSON.parse(await fs.readFile(sp, 'utf8'));
      if (s.enginePaths && typeof s.enginePaths === 'object' && Object.keys(s.enginePaths).length === 0) {
        delete s.enginePaths;
        await fs.writeFile(sp, JSON.stringify(s, null, 2), 'utf8');
      }
    } catch { /* best effort */ }
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('run API: launch build exe, validate targets', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;
    // replace the placeholder with a REAL runnable exe (where.exe exits instantly)
    const whereExe = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'where.exe');
    await fs.copyFile(whereExe, path.join(fake.win, 'XCC.exe'));

    const ok = await call('run', { target: 'build' });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.value.started, true);
    assert.equal(ok.json.value.exe, path.join(fake.win, 'XCC.exe'));
    assert.ok(Number.isInteger(ok.json.value.pid) && ok.json.value.pid > 0);

    // bad target → 400
    const badTarget = await call('run', { target: 'nope' });
    assert.equal(badTarget.status, 400);

    // traversal attempt → 400 (name regex rejects slashes)
    const trav = await call('run', { target: 'release', name: '..\\..\\foo' });
    assert.equal(trav.status, 400);

    // release folder without an exe → 409
    await fs.mkdir(path.join(fake.saved, 'XCC-Deluxe-20260919'), { recursive: true });
    const missing = await call('run', { target: 'release', name: 'XCC-Deluxe-20260919' });
    assert.equal(missing.status, 409);

    // release folder with a REAL exe → starts
    await fs.mkdir(path.join(fake.saved, 'XCC-Deluxe-20260920'), { recursive: true });
    await fs.copyFile(whereExe, path.join(fake.saved, 'XCC-Deluxe-20260920', 'XCC.exe'));
    const rel = await call('run', { target: 'release', name: 'XCC-Deluxe-20260920' });
    assert.equal(rel.status, 200);
    assert.equal(rel.json.value.started, true);

    // invalid exe (text file) → 500 with error message
    await fs.writeFile(path.join(fake.win, 'XCC.exe'), 'not an exe');
    const bad = await call('run', { target: 'build' });
    assert.equal(bad.status, 500);
    assert.ok(bad.json.error && bad.json.error.message);
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('upload: latestZip matching, remote path validation, fake bdpan flow', async () => {
  const fake = await makeFakeProject();
  try {
    CURRENT_CWD = fake.proj;
    // Direct API status is intentionally independent from installed bdpan CLI.
    const st = await call('baiduStatus', {});
    assert.equal(st.status, 200);
    // This machine's ~/.dsh settings may already hold Baidu app credentials
    // (the upload feature was configured for real) — assert only the
    // deterministic shape, and probe the "blocked until configured" paths
    // only on a clean machine.
    assert.equal(typeof st.json.value.configured, 'boolean');
    if (!st.json.value.configured) {
      assert.equal(st.json.value.authorized, false);

      // Direct upload is correctly blocked until app configuration exists.
      const up = await call('uploadStart', { remoteDir: 'XCC-Deluxe/' });
      assert.equal(up.status, 409);
      assert.ok(up.json.error.message.includes('App Key'), up.json.error.message);

      // Legacy remote-path validation is config-independent in intent.
      const miss = await call('uploadStart', { remoteDir: '../evil/', localPath: 'nope.zip' });
      assert.equal(miss.status, 409);
    }

    // create release zips: latest = XCC-Deluxe-20260928-1.zip
    await fs.writeFile(path.join(fake.saved, 'XCC-Deluxe-20260927.zip'), 'z1');
    await fs.writeFile(path.join(fake.saved, 'XCC-Deluxe-20260928-1.zip'), 'z2');

    const root = await call('root', {});
    assert.equal(root.status, 200);
    assert.equal(root.json.value.latestZip.name, 'XCC-Deluxe-20260928-1');
    assert.equal(root.json.value.latestZip.isDir, false);
    assert.equal(root.json.value.latestZip.path, path.join(fake.saved, 'XCC-Deluxe-20260928-1.zip'));

    // settings roundtrip (restore afterwards)
    const before = await call('settingsGet', {});
    assert.equal(before.status, 200);
    const oldVal = before.json.value.settings.bdpanRemoteDir;
    try {
      const set = await call('settingsSet', { bdpanRemoteDir: 'XCC-Deluxe/测试' });
      assert.equal(set.status, 200);
      assert.equal(set.json.value.settings.bdpanRemoteDir, 'XCC-Deluxe/测试');
      const get = await call('settingsGet', {});
      assert.equal(get.json.value.settings.bdpanRemoteDir, 'XCC-Deluxe/测试');
    } finally {
      await call('settingsSet', { bdpanRemoteDir: oldVal ?? '' });
    }

    // activeJobs: shape check (no jobs should be running at this point)
    const act = await call('activeJobs', {});
    assert.equal(act.status, 200);
    assert.ok(Array.isArray(act.json.value.jobs));
    assert.ok(act.json.value.jobs.every((j) => j.jobId && typeof j.kind === 'string'));
  } finally {
    CURRENT_CWD = process.cwd();
    rmForce(fake.root);
  }
});
test('read-only root against the REAL project', async () => {
  if (!(await fs.access(REAL_PROJECT).then(() => true).catch(() => false))) {
    console.log('real project not found — skipping');
    return;
  }
  try {
    CURRENT_CWD = REAL_PROJECT;
    const root = await call('root', {});
    assert.equal(root.status, 200);
    const v = root.json.value;
    assert.equal(v.projectRoot, REAL_PROJECT);
    assert.equal(v.hasBuild, true);
    assert.ok(v.webVersion && /^v\d+\.\d+\.\d+$/.test(v.webVersion.current), `webVersion.current should be vX.Y.Z, got ${v.webVersion?.current}`);
    // engine state must be derived from the real uproject
    assert.equal(v.ueVersion, '5.7', 'XCC.uproject EngineAssociation should read as 5.7');
    assert.equal(v.ueAssociation, '5.7');
    assert.ok([null, 'saved', 'registry', 'launcher', 'scan', 'env', 'requested'].includes(v.ueSource), `unexpected ueSource: ${v.ueSource}`);
    assert.ok(v.releases.length >= 1, 'real Saved should contain releases');
    assert.ok(v.releases.every((r) => /^XCC-Deluxe-\d{8}(?:-\d+)?$/.test(r.name)));
    const today = v.now;
    const n = await call('nextName', { date: today });
    assert.equal(n.status, 200);
    assert.ok(/^XCC-Deluxe-\d{8}(?:-\d+)?$/.test(n.json.value.name));
    console.log(`real project: releases=${v.releases.length}, next=${n.json.value.name}, ueVersion=${v.ueVersion}, ueDir=${v.ueDir || '(not resolved)'} (${v.ueSource || 'none'})`);
  } finally {
    CURRENT_CWD = process.cwd();
  }
});

console.log(`plugin root: ${PLUGIN_ROOT}`);
