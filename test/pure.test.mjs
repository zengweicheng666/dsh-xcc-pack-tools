import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReleaseName, localDateStamp, computeReleaseName, scanReleases, decodeLine } from '../lib/pure.js';

test('parseReleaseName', () => {
  assert.deepEqual(parseReleaseName('XCC-Deluxe-20260922'), { date: '20260922', number: undefined });
  assert.deepEqual(parseReleaseName('XCC-Deluxe-20260922-1'), { date: '20260922', number: 1 });
  assert.deepEqual(parseReleaseName('XCC-Deluxe-20260922-12'), { date: '20260922', number: 12 });
  assert.equal(parseReleaseName('foo'), null);
  assert.equal(parseReleaseName('XCC-Deluxe-202609221'), null); // 9 digits
  assert.equal(parseReleaseName('XCC-Deluxe-20260922-x'), null); // non-numeric suffix
  assert.equal(parseReleaseName('XCC-Deluxe-20260922-'), null);
});

test('localDateStamp', () => {
  assert.equal(localDateStamp(new Date(2026, 8, 5)), '20260905'); // Sep = month index 8
  assert.equal(localDateStamp(new Date(2026, 0, 1)), '20260101');
  assert.match(localDateStamp(), /^\d{8}$/);
});

test('computeReleaseName: first of the day is plain', () => {
  const r = computeReleaseName([], '20260922', undefined);
  assert.equal(r.name, 'XCC-Deluxe-20260922');
  assert.equal(r.number, undefined);
  assert.deepEqual(r.collisions, []);
});

test('computeReleaseName: auto increments after plain', () => {
  const releases = [{ date: '20260922', number: undefined, name: 'XCC-Deluxe-20260922', isDir: true }];
  assert.equal(computeReleaseName(releases, '20260922', undefined).name, 'XCC-Deluxe-20260922-1');
});

test('computeReleaseName: auto increments after -1', () => {
  const releases = [
    { date: '20260922', number: undefined, name: 'XCC-Deluxe-20260922', isDir: true },
    { date: '20260922', number: 1, name: 'XCC-Deluxe-20260922-1', isDir: true },
  ];
  assert.equal(computeReleaseName(releases, '20260922', undefined).name, 'XCC-Deluxe-20260922-2');
});

test('computeReleaseName: zips count for the sequence', () => {
  const releases = [{ date: '20260922', number: 1, name: 'XCC-Deluxe-20260922-1', isDir: false }];
  assert.equal(computeReleaseName(releases, '20260922', undefined).name, 'XCC-Deluxe-20260922-2');
});

test('computeReleaseName: other days do not affect the number', () => {
  const releases = [
    { date: '20260921', number: undefined, name: 'XCC-Deluxe-20260921', isDir: true },
    { date: '20260921', number: 3, name: 'XCC-Deluxe-20260921-3', isDir: true },
  ];
  assert.equal(computeReleaseName(releases, '20260922', undefined).name, 'XCC-Deluxe-20260922');
});

test('computeReleaseName: manual number', () => {
  const releases = [{ date: '20260922', number: undefined, name: 'XCC-Deluxe-20260922', isDir: true }];
  const r = computeReleaseName(releases, '20260922', 7);
  assert.equal(r.name, 'XCC-Deluxe-20260922-7');
  assert.deepEqual(r.collisions, []);
});

test('computeReleaseName: manual collisions are reported, not thrown', () => {
  const releases = [
    { date: '20260922', number: 1, name: 'XCC-Deluxe-20260922-1', isDir: true },
    { date: '20260922', number: 1, name: 'XCC-Deluxe-20260922-1', isDir: false },
  ];
  const r = computeReleaseName(releases, '20260922', 1);
  assert.equal(r.name, 'XCC-Deluxe-20260922-1');
  assert.ok(r.collisions.some((c) => c.includes('发布目录')));
  assert.ok(r.collisions.some((c) => c.includes('.zip')));
});

test('computeReleaseName: zip-only collision lists only the zip', () => {
  const releases = [{ date: '20260922', number: 1, name: 'XCC-Deluxe-20260922-1', isDir: false }];
  const r = computeReleaseName(releases, '20260922', 1);
  assert.equal(r.collisions.length, 1);
  assert.ok(r.collisions[0].includes('.zip'));
});

test('computeReleaseName: invalid manual numbers throw', () => {
  assert.throws(() => computeReleaseName([], '20260922', 0), /正整数/);
  assert.throws(() => computeReleaseName([], '20260922', 1.5), /正整数/);
  assert.throws(() => computeReleaseName([], '20260922', 'abc'), /正整数/);
  // empty string means auto
  assert.equal(computeReleaseName([], '20260922', '').name, 'XCC-Deluxe-20260922');
  assert.equal(computeReleaseName([], '20260922', null).name, 'XCC-Deluxe-20260922');
});

test('scanReleases: shape and ordering', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pack-test-'));
  try {
    const mk = (name, isDir) => isDir
      ? fs.mkdir(path.join(dir, name), { recursive: true })
      : fs.writeFile(path.join(dir, name), 'x');
    await mk('XCC-Deluxe-20260920', true);
    await mk('XCC-Deluxe-20260922', true);
    await mk('XCC-Deluxe-20260922-1', true);
    await mk('XCC-Deluxe-20260922-2.zip', false);
    await mk('XCC-Deluxe-20260921.zip', false);
    await mk('unrelated.txt', false);
    await mk('XCC-Deluxe-202609221.zip', false); // 9 digits — ignored
    const entries = await scanReleases(dir);
    assert.deepEqual(entries.map((e) => e.name), [
      'XCC-Deluxe-20260922-2', // newest date, number desc, dir before zip for same name
      'XCC-Deluxe-20260922-1',
      'XCC-Deluxe-20260922',
      'XCC-Deluxe-20260921',
      'XCC-Deluxe-20260920',
    ]);
    const z = entries.find((e) => e.name === 'XCC-Deluxe-20260922-2');
    assert.equal(z.isDir, false);
    assert.equal(z.size, 1);
    assert.ok(z.mtime);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('scanReleases: missing dir yields empty list', async () => {
  const entries = await scanReleases(path.join(os.tmpdir(), 'dsh-pack-no-such-dir-xyz'));
  assert.deepEqual(entries, []);
});

test('decodeLine: utf8 passthrough and gbk fallback', () => {
  assert.equal(decodeLine(Buffer.from('打包完成', 'utf8')), '打包完成');
  // GBK bytes for 打包完成 (打=B4F2 包=B0FC 完=CDEA 成=B3C9) → TextDecoder('gbk') fallback
  const gbk = Buffer.from([0xB4, 0xF2, 0xB0, 0xFC, 0xCD, 0xEA, 0xB3, 0xC9]);
  const decoded = decodeLine(gbk);
  assert.ok(!decoded.includes('\uFFFD'));
  assert.equal(decoded, '打包完成');
});
