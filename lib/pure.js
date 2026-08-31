/**
 * dsh-xcc-pack-tools — pure helpers (no harness imports, unit-testable).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const RELEASE_PREFIX = 'XCC-Deluxe-';
export const RELEASE_RE = /^XCC-Deluxe-(\d{8})(?:-(\d+))?$/;

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
    return { major, minor, patch };
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
export function parseReleaseName(raw) {
  const m = RELEASE_RE.exec(raw);
  if (m === null) return null;
  return { date: m[1], number: m[2] !== undefined ? Number(m[2]) : undefined };
}

/**
 * Compute the next release name for `date` (yyyyMMdd).
 * Rule (user-confirmed): first release of the day has NO number
 * (`XCC-Deluxe-20260922`); subsequent ones get -1, -2, … (plain counts as 0,
 * next = max + 1). A manual `manualNumber` (>= 1) overrides the auto value.
 * Returns { date, number, name, collisions } — collisions lists existing
 * dir/zip names that would clash with the computed name (never throws for
 * collisions; throws badRequest only for an invalid manual number).
 */
export function computeReleaseName(releases, date, manualNumber) {
  const prefix = `${RELEASE_PREFIX}${date}`;
  const sameDay = releases.filter((r) => r.date === date);
  const takenDirs = new Set(sameDay.filter((r) => r.isDir).map((r) => r.name));
  const takenZips = new Set(sameDay.filter((r) => !r.isDir).map((r) => r.name));
  let number;
  if (manualNumber !== undefined && manualNumber !== null && String(manualNumber).trim() !== '') {
    number = Number(manualNumber);
    if (!Number.isInteger(number) || number < 1) {
      throw Object.assign(new Error('编号必须是正整数（如 1、2）。留空则自动编号。'), { code: 'bad-request', status: 400 });
    }
  } else {
    number = sameDay.length === 0 ? undefined : Math.max(...sameDay.map((r) => r.number ?? 0)) + 1;
  }
  const name = number === undefined ? prefix : `${prefix}-${number}`;
  const collisions = [];
  if (takenDirs.has(name)) collisions.push(`发布目录 ${name} 已存在`);
  if (takenZips.has(name)) collisions.push(`${name}.zip 已存在`);
  return { date, number, name, collisions };
}

/**
 * Scan a Saved\ directory for XCC-Deluxe-* release dirs and zips.
 * Returns entries sorted newest first (date desc, number desc, dirs first).
 */
export async function scanReleases(savedDir) {
  const out = [];
  let names;
  try {
    names = await fs.readdir(savedDir);
  } catch {
    return out;
  }
  for (const raw of names) {
    const isZip = raw.toLowerCase().endsWith('.zip');
    const base = isZip ? raw.slice(0, -4) : raw;
    const parsed = parseReleaseName(base);
    if (parsed === null) continue;
    const full = path.join(savedDir, raw);
    const entry = {
      name: base,
      date: parsed.date,
      number: parsed.number,
      isDir: !isZip,
      path: full,
      mtime: undefined,
      size: isZip ? undefined : undefined,
    };
    try {
      const st = await fs.stat(full);
      entry.mtime = st.mtime.toISOString();
      if (isZip) entry.size = st.size;
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
