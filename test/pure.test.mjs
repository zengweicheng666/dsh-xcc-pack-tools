import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReleaseName, localDateStamp, computeReleaseName, scanReleases, decodeLine, parseWebVersion, bumpWebVersion, versionText, resolveRemotePath, parseUproject, isVersionAssociation, ueVersionKey, parseLauncherInstalled } from '../lib/pure.js';

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

test('parseWebVersion', () => {
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3}'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseWebVersion('{"major":0,"minor":0,"patch":0}'), { major: 0, minor: 0, patch: 0 });
  assert.equal(parseWebVersion('not json'), null);
  assert.equal(parseWebVersion('{"major":1,"minor":2}'), null);      // missing patch
  assert.equal(parseWebVersion('{"major":"x","minor":2,"patch":3}'), null);
  assert.equal(parseWebVersion(''), null);
  assert.equal(parseWebVersion(null), null);
});

test('bumpWebVersion: mirrors copy-dist-common.ps1 rollover rules', () => {
  assert.deepEqual(bumpWebVersion({ major: 1, minor: 2, patch: 3 }), { major: 1, minor: 2, patch: 4 });
  assert.deepEqual(bumpWebVersion({ major: 1, minor: 2, patch: 999 }), { major: 1, minor: 3, patch: 1 });
  assert.deepEqual(bumpWebVersion({ major: 1, minor: 99, patch: 999 }), { major: 2, minor: 1, patch: 1 });
  assert.deepEqual(bumpWebVersion({ major: 0, minor: 0, patch: 0 }), { major: 0, minor: 0, patch: 1 });
});

test('versionText', () => {
  assert.equal(versionText({ major: 1, minor: 2, patch: 3 }), 'v1.2.3');
  assert.equal(versionText(null), '');
});

test('resolveRemotePath: appends the zip name to a directory', () => {
  assert.equal(resolveRemotePath('XCC-Deluxe/', 'XCC-Deluxe-20260901.zip'), 'XCC-Deluxe/XCC-Deluxe-20260901.zip');
  assert.equal(resolveRemotePath('XCC-Deluxe', 'x.zip'), 'XCC-Deluxe/x.zip');
  assert.equal(resolveRemotePath('a/b/c/', 'x.zip'), 'a/b/c/x.zip');
});

test('resolveRemotePath: full file path passes through', () => {
  assert.equal(resolveRemotePath('backup/x.zip', 'x.zip'), 'backup/x.zip');
  assert.equal(resolveRemotePath('XCC-Deluxe-20260901.ZIP', 'y.zip'), 'XCC-Deluxe-20260901.ZIP'); // case-insensitive .zip
});

test('resolveRemotePath: backslashes are normalized to slashes', () => {
  assert.equal(resolveRemotePath('XCC-Deluxe\\2026', 'x.zip'), 'XCC-Deluxe/2026/x.zip');
  assert.equal(resolveRemotePath('XCC-Deluxe\\2026\\', 'x.zip'), 'XCC-Deluxe/2026/x.zip');
  assert.equal(resolveRemotePath('a\\b\\c.zip', 'x.zip'), 'a/b/c.zip');
  assert.equal(resolveRemotePath(' XCC-Deluxe\\2026 ', 'x.zip'), 'XCC-Deluxe/2026/x.zip'); // trims whitespace
});

test('resolveRemotePath: rejects traversal, drive letters and weird input', () => {
  assert.throws(() => resolveRemotePath('', 'x.zip'), /请填写/);
  assert.throws(() => resolveRemotePath('   ', 'x.zip'), /请填写/);
  assert.throws(() => resolveRemotePath('../foo', 'x.zip'), /\.\./);
  assert.throws(() => resolveRemotePath('a/../b', 'x.zip'), /\.\./);
  assert.throws(() => resolveRemotePath('XCC-Deluxe/..', 'x.zip'), /\.\./);
  assert.throws(() => resolveRemotePath('~foo', 'x.zip'), /~/);
  assert.throws(() => resolveRemotePath('/apps/bdpan/', 'x.zip'), /\/ 开头/);
  assert.throws(() => resolveRemotePath('D:\\foo', 'x.zip'), /盘符/);
  assert.throws(() => resolveRemotePath('C:/bar', 'x.zip'), /盘符/);
});

test('parseUproject: engine association extraction', () => {
  assert.deepEqual(parseUproject('{\n\t"FileVersion": 3,\n\t"EngineAssociation": "5.7"\n}'), { engineAssociation: '5.7' });
  assert.deepEqual(parseUproject('\uFEFF{"EngineAssociation":"5.7"}'), { engineAssociation: '5.7' }); // BOM
  assert.deepEqual(parseUproject('{"EngineAssociation": "5.7", "Modules": []}'), { engineAssociation: '5.7' });
  assert.equal(parseUproject('{"FileVersion":3}'), null);                       // no association
  assert.equal(parseUproject('{"EngineAssociation": ""}'), null);               // empty association
  assert.equal(parseUproject('not json'), null);
  assert.equal(parseUproject(''), null);
  assert.equal(parseUproject(null), null);
  // source-build GUID association is still returned verbatim (caller decides)
  assert.deepEqual(parseUproject('{"EngineAssociation":"{ABC12345-0000-1111-2222-333344445555}"}'),
    { engineAssociation: '{ABC12345-0000-1111-2222-333344445555}' });
});

test('isVersionAssociation / ueVersionKey', () => {
  assert.equal(isVersionAssociation('5.7'), true);
  assert.equal(isVersionAssociation('4.27'), true);
  assert.equal(isVersionAssociation('5.7.1'), true);
  assert.equal(isVersionAssociation(' 5.7 '), true);      // trimmed
  assert.equal(isVersionAssociation('UE_5.7'), false);
  assert.equal(isVersionAssociation('{ABC12345-0000-1111-2222-333344445555}'), false);
  assert.equal(isVersionAssociation('5'), false);
  assert.equal(isVersionAssociation('5.x'), false);
  assert.equal(isVersionAssociation(''), false);
  assert.equal(isVersionAssociation(null), false);

  assert.equal(ueVersionKey('5.7'), 'UE_5.7');
  assert.equal(ueVersionKey('4.27'), 'UE_4.27');
  assert.equal(ueVersionKey('5.7.1'), 'UE_5.7.1');
  assert.equal(ueVersionKey('{ABC12345-0000-1111-2222-333344445555}'), null);
  assert.equal(ueVersionKey(null), null);
});

test('parseLauncherInstalled: engine entries only, deduped', () => {
  const raw = JSON.stringify({
    InstallationList: [
      { AppName: 'UE_5.7', InstallLocation: 'D:\\EpicLib\\UE_5.7', ArtifactId: 'UE_5.7' },
      { AppName: 'UE_5.2', InstallLocation: 'D:\\EpicLib\\UE_5.2', ArtifactId: 'UE_5.2' },
      { AppName: 'FabPlugin_5.7', InstallLocation: 'D:\\EpicLib\\UE_5.7', ArtifactId: 'FabPlugin_5.7' },  // plugin — ignored
      { AppName: 'QuixelBridge_5.7', InstallLocation: 'D:\\EpicLib\\UE_5.7', ArtifactId: 'x' },           // plugin — ignored
      { AppName: 'UE_5.7', InstallLocation: 'D:\\EpicLib\\UE_5.7', ArtifactId: 'ue' },                    // engine dupe — dropped
      { AppName: 'UE_4.27', InstallLocation: 'D:\\EpicLib\\UE_4.27' },
      { AppName: 'BlueprintAssist_5.2', InstallLocation: 'D:\\EpicLib\\UE_5.2' },                          // plugin — ignored
    ],
  });
  assert.deepEqual(parseLauncherInstalled(raw), [
    { version: '5.7', dir: 'D:\\EpicLib\\UE_5.7' },
    { version: '5.2', dir: 'D:\\EpicLib\\UE_5.2' },
    { version: '4.27', dir: 'D:\\EpicLib\\UE_4.27' },
  ]);
});

test('parseLauncherInstalled: junk input yields empty list', () => {
  assert.deepEqual(parseLauncherInstalled(''), []);
  assert.deepEqual(parseLauncherInstalled('not json'), []);
  assert.deepEqual(parseLauncherInstalled('{"InstallationList": null}'), []);
  assert.deepEqual(parseLauncherInstalled('{"InstallationList": [{"AppName": "UE_5.7"}]}'), []); // no dir
  assert.deepEqual(parseLauncherInstalled(null), []);
});
