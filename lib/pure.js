/**
 * dsh-xcc-pack-tools — pure helpers (no harness imports, unit-testable).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const RELEASE_PREFIX = 'XCC-Deluxe-';
export const RELEASE_RE = /^XCC-Deluxe-(\d{8})(?:-(\d+))?$/;

/** Normalize a project-specific release prefix to a trailing hyphen. */
export function normalizeReleasePrefix(prefix = RELEASE_PREFIX) {
  const raw = String(prefix ?? '').trim().replace(/-+$/, '');
  return `${raw || RELEASE_PREFIX.replace(/-+$/, '')}-`;
}

/** Decode one line buffer: UTF-8 strictly, fall back to GBK (Windows consoles). */
export function decodeLine(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

export function localDateStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** Parse Web/version.json content into { major, minor, patch } or null. */
export function parseWebVersion(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const v = JSON.parse(raw);
    const major = Number(v.major);
    const minor = Number(v.minor);
    const patch = Number(v.patch);
    if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) return null;
    // version.json carries the build mode ("dev"/"prod", written by
    // copy-dist-common.ps1); tolerate the full ValidateSet spellings too.
    const m = String(v.mode ?? '');
    const mode = m === 'dev' || m === 'development' ? 'dev' : m === 'prod' || m === 'production' ? 'prod' : undefined;
    return { major, minor, patch, mode };
  } catch {
    return null;
  }
}

/** Next version after a copy-dist-common.ps1 build (same rollover rules). */
export function bumpWebVersion(v) {
  let { major, minor, patch } = v;
  patch += 1;
  if (patch > 999) { patch = 1; minor += 1; }
  if (minor > 99) { minor = 1; major += 1; }
  return { major, minor, patch };
}

export function versionText(v) {
  if (!v) return '';
  return `v${v.major}.${v.minor}.${v.patch}`;
}

/** Parse a release entry name into { date, number } or null. */
export function parseReleaseName(raw, releasePrefix = RELEASE_PREFIX) {
  if (typeof raw !== 'string') return null;
  const prefix = normalizeReleasePrefix(releasePrefix);
  if (!raw.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const m = /^(\d{8})(?:-(\d+))?$/.exec(raw.slice(prefix.length));
  if (m === null) return null;
  return { date: m[1], number: m[2] !== undefined ? Number(m[2]) : undefined };
}

/**
 * Compute the next release name for `date` (yyyyMMdd).
 * Rule (user-confirmed): first release of the day has NO number
 * (`<project>-20260922`); subsequent ones get -1, -2, … (plain counts as 0,
 * next = max + 1). A manual `manualNumber` (>= 1) overrides the auto value.
 * Returns { date, number, name, collisions } — collisions lists existing
 * dir/zip names that would clash with the computed name (never throws for
 * collisions; throws badRequest only for an invalid manual number).
 */
export function computeReleaseName(releases, date, manualNumber, releasePrefix = RELEASE_PREFIX) {
  const normalizedPrefix = normalizeReleasePrefix(releasePrefix);
  const prefix = `${normalizedPrefix}${date}`;
  const sameDay = releases.filter((r) => {
    if (r.date !== date) return false;
    if (r.releasePrefix) return normalizeReleasePrefix(r.releasePrefix).toLowerCase() === normalizedPrefix.toLowerCase();
    // Entries produced by older callers did not carry releasePrefix. When a
    // name is present, use it to avoid mixing another project's releases into
    // the current sequence; nameless legacy entries retain the old fallback.
    if (typeof r.name === 'string' && r.name !== '') return parseReleaseName(r.name, normalizedPrefix) !== null;
    return true;
  });
  const eligible = sameDay.filter((r) => r.isDir || r.isZip === true || r.isZip === undefined);
  const key = (value) => String(value).toLowerCase();
  const takenDirs = new Set(eligible.filter((r) => r.isDir).map((r) => key(r.name)));
  // Older callers may provide only isDir, so retain that fallback while
  // excluding scanned regular files that merely resemble release names.
  const takenZips = new Set(eligible.filter((r) => r.isZip === true || (r.isZip === undefined && !r.isDir)).map((r) => key(r.name)));
  let number;
  if (manualNumber !== undefined && manualNumber !== null && String(manualNumber).trim() !== '') {
    number = Number(manualNumber);
    if (!Number.isInteger(number) || number < 1) {
      throw Object.assign(new Error('编号必须是正整数（如 1、2）。留空则自动编号。'), { code: 'bad-request', status: 400 });
    }
  } else {
    number = eligible.length === 0 ? undefined : Math.max(...eligible.map((r) => r.number ?? 0)) + 1;
  }
  const name = number === undefined ? prefix : `${prefix}-${number}`;
  const collisions = [];
  if (takenDirs.has(key(name))) collisions.push(`发布目录 ${name} 已存在`);
  if (takenZips.has(key(name))) collisions.push(`${name}.zip 已存在`);
  return { date, number, name, collisions };
}

/**
 * Pick the newest netdisk upload name from a raw directory listing.
 * `entries` are { name, isdir } objects (e.g. from the Baidu PCS list API);
 * folders, non-.zip files and names that do not match `<prefix><yyyyMMdd>(-N).zip`
 * are ignored. "Newest" is decided ONLY by the parsed (date, number) tuple —
 * plain names count as number 0 — never by file create/modify timestamps.
 * Returns { name, date, number } or null when nothing matches.
 */
export function latestRemoteZipName(entries, releasePrefix = RELEASE_PREFIX) {
  const prefix = normalizeReleasePrefix(releasePrefix);
  let best = null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object' || entry.isdir === true) continue;
    const raw = String(entry.name ?? entry.filename ?? '');
    if (!raw.toLowerCase().endsWith('.zip')) continue;
    const parsed = parseReleaseName(raw.slice(0, -4), prefix);
    if (parsed === null) continue;
    const number = parsed.number ?? 0;
    if (best === null || parsed.date > best.date || (parsed.date === best.date && number > best.number)) {
      best = { name: raw, date: parsed.date, number };
    }
  }
  return best;
}

/**
 * Align a locally computed release name (`next`, the computeReleaseName
 * result) with the newest netdisk upload (`remote`, a latestRemoteZipName
 * result or null). Rule: when next <= remote — compared as (date, number)
 * tuples — the new name continues from remote with number + 1; otherwise
 * next is kept unchanged. Collisions for an adjusted name are re-checked
 * against the local `releases` list. Returns { date, number, name,
 * collisions, adjusted, remote } where remote carries the netdisk name that
 * triggered the adjustment (null when no floor applied).
 */
export function applyRemoteFloor(next, remote, releasePrefix = RELEASE_PREFIX, releases = []) {
  if (!remote || typeof remote.date !== 'string') {
    return { ...next, adjusted: false, remote: null };
  }
  const aDate = String(next.date);
  const aNum = next.number ?? 0;
  const bDate = String(remote.date);
  const bNum = remote.number ?? 0;
  if (aDate > bDate || (aDate === bDate && aNum > bNum)) {
    return { ...next, adjusted: false, remote: remote.name ?? null };
  }
  const prefix = normalizeReleasePrefix(releasePrefix);
  const number = bNum + 1;
  const name = `${prefix}${bDate}-${number}`;
  const collisions = [];
  const wanted = name.toLowerCase();
  for (const release of Array.isArray(releases) ? releases : []) {
    if (typeof release?.name === 'string' && release.name.toLowerCase() === wanted) {
      if (release.isDir) collisions.push(`发布目录 ${name} 已存在`);
      else if (release.isZip === true || release.isZip === undefined) collisions.push(`${name}.zip 已存在`);
    }
  }
  return { date: bDate, number, name, collisions, adjusted: true, remote: remote.name ?? null };
}

/**
 * Scan a Saved\ directory for release dirs and zips matching one or more
 * project prefixes.
 * Returns entries sorted newest first (date desc, number desc, dirs first).
 */
export async function scanReleases(savedDir, releasePrefix = RELEASE_PREFIX) {
  const prefixes = (Array.isArray(releasePrefix) ? releasePrefix : [releasePrefix])
    .map((prefix) => normalizeReleasePrefix(prefix));
  const out = [];
  let names;
  try {
    names = await fs.readdir(savedDir);
  } catch {
    return out;
  }
  for (const raw of names) {
    const isZipName = raw.toLowerCase().endsWith('.zip');
    const base = isZipName ? raw.slice(0, -4) : raw;
    let parsed = null;
    let matchedPrefix = null;
    for (const prefix of prefixes) {
      parsed = parseReleaseName(base, prefix);
      if (parsed !== null) {
        matchedPrefix = prefix;
        break;
      }
    }
    if (parsed === null) continue;
    const full = path.join(savedDir, raw);
    const entry = {
      name: base,
      isZip: isZipName,
      date: parsed.date,
      number: parsed.number,
      isDir: false,
      path: full,
      mtime: undefined,
      size: undefined,
    };
    // Keep this implementation detail available to computeReleaseName while
    // preserving the historical enumerable shape returned by scanReleases.
    // Some callers compare entries structurally and do not expect metadata
    // that was added for multi-prefix compatibility.
    Object.defineProperty(entry, 'releasePrefix', {
      value: matchedPrefix,
      enumerable: false,
      writable: false,
      configurable: true,
    });
    try {
      const st = await fs.stat(full);
      // The release name is only a naming hint. Use the actual filesystem
      // type so a regular file named like a release cannot be treated as a
      // copyable directory by release/run consumers.
      entry.isDir = st.isDirectory();
      entry.mtime = st.mtime.toISOString();
      if (!entry.isDir) entry.size = st.size;
    } catch { /* stat failed — keep entry */ }
    out.push(entry);
  }
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const an = a.number ?? 0;
    const bn = b.number ?? 0;
    if (an !== bn) return an < bn ? 1 : -1;
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name < b.name ? 1 : -1;
  });
  return out;
}

/**
 * Parse a .uproject file's JSON content into { engineAssociation } or null.
 * Strips a UTF-8 BOM; returns null for invalid JSON or when the file carries
 * no EngineAssociation field (mirrors how Unreal's own launcher reads it).
 */
export function parseUproject(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object' && typeof obj.EngineAssociation === 'string' && obj.EngineAssociation !== '') {
      return { engineAssociation: obj.EngineAssociation };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * True for launcher-style version associations ("5.7", "4.27", optionally
 * with a patch segment like "5.7.1"). Source-build engines associate their
 * .uproject with a GUID instead — that fails this check.
 */
export function isVersionAssociation(value) {
  return typeof value === 'string' && /^\d+\.\d+(?:\.\d+)?$/.test(value.trim());
}

/**
 * UE install folder name for a version association: "5.7" → "UE_5.7".
 * Returns null for non-version input (e.g. a source-build GUID).
 */
export function ueVersionKey(version) {
  if (!isVersionAssociation(version)) return null;
  return `UE_${version.trim()}`;
}

/**
 * Parse Epic Games Launcher's LauncherInstalled.dat content into the engine
 * installs it lists: entries whose AppName is a plain engine marker
 * ("UE_5.7") → [{ version: "5.7", dir }]. Marketplace/plugin entries whose
 * AppName merely embeds a version ("FabPlugin_5.7", "QuixelBridge_5.7")
 * are ignored, and duplicate install dirs are dropped.
 */
export function parseLauncherInstalled(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let data;
  try {
    data = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data?.InstallationList) ? data.InstallationList : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const appName = typeof item.AppName === 'string' ? item.AppName : '';
    const dir = typeof item.InstallLocation === 'string' ? item.InstallLocation.trim() : '';
    const m = /^UE_(\d+\.\d+)$/.exec(appName);
    if (m === null || dir === '' || seen.has(dir)) continue;
    seen.add(dir);
    out.push({ version: m[1], dir });
  }
  return out;
}

/**
 * Resolve the final Baidu Netdisk remote path for a single-file upload.
 * `remoteDir` is user input relative to /apps/bdpan/ (e.g. "XCC-Deluxe/").
 * bdpan requires a single-file upload's remote path to be a FILE path (not
 * ending in /), so the zip file name is appended unless `remoteDir` already
 * looks like a full file path (ends with .zip).
 * Windows-style backslashes are normalized to `/` automatically; only real
 * dangers are rejected: `~`, `..` segments, leading `/`, and local drive
 * prefixes (D:/...). Throws badRequest on those or on empty input.
 */
export function resolveRemotePath(remoteDir, zipName) {
  let dir = String(remoteDir ?? '').trim();
  if (dir === '') {
    throw Object.assign(new Error('请填写网盘目标路径（相对 /apps/bdpan/）'), { code: 'bad-request', status: 400 });
  }
  // Windows users type backslashes — normalize them to slashes
  dir = dir.replace(/\\/g, '/');
  if (dir.startsWith('/')) {
    throw Object.assign(new Error('网盘目标路径不能以 / 开头（请填相对 /apps/bdpan/ 的路径，如 XCC-Deluxe/）'), { code: 'bad-request', status: 400 });
  }
  if (/^[a-zA-Z]:\//.test(dir)) {
    throw Object.assign(new Error('网盘目标路径不能是本地盘符路径（如 D:/xxx）'), { code: 'bad-request', status: 400 });
  }
  if (dir.includes('~')) {
    throw Object.assign(new Error('网盘目标路径不能包含 ~'), { code: 'bad-request', status: 400 });
  }
  if (dir.split('/').includes('..')) {
    throw Object.assign(new Error('网盘目标路径不能包含 ..（禁止路径穿越）'), { code: 'bad-request', status: 400 });
  }
  const trimmed = dir.replace(/\/+$/, '');
  const remote = trimmed.toLowerCase().endsWith('.zip') ? trimmed : `${trimmed}/${zipName}`;
  if (remote.split('/').includes('..') || remote.includes('~')) {
    throw Object.assign(new Error('拼接后的网盘路径不合法'), { code: 'bad-request', status: 400 });
  }
  return remote;
}
