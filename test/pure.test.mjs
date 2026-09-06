import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseReleaseName, localDateStamp, computeReleaseName, scanReleases, decodeLine, parseWebVersion, bumpWebVersion, versionText, resolveRemotePath, parseUproject, isVersionAssociation, ueVersionKey, parseLauncherInstalled, latestRemoteZipName, applyRemoteFloor, normalizeReleasePrefix, resolveEffectiveReleaseProjectName, releasePrefixCandidates } from '../lib/pure.js';

test('resolveEffectiveReleaseProjectName: custom wins, then history tail, then directory', () => {
  assert.deepEqual(resolveEffectiveReleaseProjectName({ override: 'MyGame', history: ['Old'], directoryName: 'Folder' }), { name: 'MyGame', source: 'custom' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({ override: '', history: ['A', 'B'], directoryName: 'Folder' }), { name: 'B', source: 'history' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({ override: '  ', history: ['Only'], directoryName: 'Folder' }), { name: 'Only', source: 'history' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({ override: '', history: [], directoryName: 'Folder' }), { name: 'Folder', source: 'directory' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({ history: ['', '  ', null, undefined] }), { name: '', source: 'directory' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({}), { name: '', source: 'directory' });
  assert.deepEqual(resolveEffectiveReleaseProjectName({ history: 'not-an-array', directoryName: 'Dir' }), { name: 'Dir', source: 'directory' });
});

test('releasePrefixCandidates: normalized, deduped, no built-in prefix injected', () => {
  assert.deepEqual(
    releasePrefixCandidates({ projectName: 'XCC-Deluxe', directoryName: 'XCC-Deluxe', historicalNames: ['XCC-DeluxeT', 'XCC-Deluxe'] }),
    ['XCC-Deluxe-', 'XCC-DeluxeT-']);
  assert.deepEqual(
    releasePrefixCandidates({ projectName: 'MyGame', directoryName: 'MyGame', historicalNames: ['OldName'] }),
    ['MyGame-', 'OldName-']);
  // the historical default (XCC-Deluxe) must never be injected on its own
  const candidates = releasePrefixCandidates({ projectName: 'MyGame', directoryName: 'Folder', historicalNames: [] });
  assert.deepEqual(candidates, ['MyGame-', 'Folder-']);
  assert.ok(!candidates.some((p) => p.toLowerCase().startsWith('xcc-deluxe')), 'no hardcoded default prefix may be injected');
  // dedup is case-insensitive, first spelling wins
  assert.deepEqual(releasePrefixCandidates({ projectName: 'xcc-deluxe', directoryName: 'XCC-Deluxe' }), ['xcc-deluxe-']);
  // trailing hyphens normalized, junk input dropped
  assert.deepEqual(releasePrefixCandidates({ projectName: 'foo-', directoryName: '', historicalNames: [null, 42] }), ['foo-']);
  assert.deepEqual(releasePrefixCandidates({}), []);
});

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

test('latestRemoteZipName: ranks by name (date desc, number desc), ignoring mtimes and order', () => {
  // deliberately shuffled with misleading mtime/size fields — the pick must
  // come from the parsed NAME only
  const entries = [
    { name: 'XCC-Deluxe-20260922-1.zip', isdir: 0, server_mtime: 9999999999 },
    { name: 'XCC-Deluxe-20260922.zip', isdir: 0, server_mtime: 1 },
    { name: 'XCC-Deluxe-20260921-9.zip', isdir: 0 },
    { name: 'XCC-Deluxe-20260923-2.zip', isdir: 0 },
    { name: 'XCC-Deluxe-20260923-10.zip', isdir: 0 },
    { name: 'XCC-Deluxe-20260923-3.zip', isdir: 0 },
  ];
  assert.deepEqual(latestRemoteZipName(entries), { name: 'XCC-Deluxe-20260923-10.zip', date: '20260923', number: 10 });
});

test('latestRemoteZipName: plain name counts as number 0 and loses to -1', () => {
  const entries = [
    { name: 'XCC-Deluxe-20260922.zip', isdir: 0 },
    { name: 'XCC-Deluxe-20260922-1.zip', isdir: 0 },
  ];
  assert.deepEqual(latestRemoteZipName(entries), { name: 'XCC-Deluxe-20260922-1.zip', date: '20260922', number: 1 });
});

test('latestRemoteZipName: ignores dirs, non-zips, foreign prefixes and malformed names', () => {
  const entries = [
    { name: 'XCC-Deluxe-20260922-5.zip', isdir: 1 },      // a folder named like a zip
    { name: 'XCC-Deluxe-20260922-6.zip.tmp', isdir: 0 },  // not .zip
    { name: 'OtherProject-20260925-7.zip', isdir: 0 },    // foreign prefix
    { name: 'XCC-Deluxe-202609221.zip', isdir: 0 },       // 9-digit date
    { name: 'XCC-Deluxe-20260922-abc.zip', isdir: 0 },    // non-numeric suffix
    { name: '', isdir: 0 },
    { name: 'XCC-Deluxe-20260924.zip', isdir: 0 },
  ];
  assert.deepEqual(latestRemoteZipName(entries), { name: 'XCC-Deluxe-20260924.zip', date: '20260924', number: 0 });
});

test('latestRemoteZipName: empty or non-array input yields null', () => {
  assert.equal(latestRemoteZipName([]), null);
  assert.equal(latestRemoteZipName(undefined), null);
  assert.equal(latestRemoteZipName([{ name: 'readme.txt', isdir: 0 }]), null);
});

test('applyRemoteFloor: remote null keeps the local name untouched', () => {
  const next = computeReleaseName([], '20260922', undefined);
  const out = applyRemoteFloor(next, null, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922');
  assert.equal(out.adjusted, false);
  assert.equal(out.remote, null);
});

test('applyRemoteFloor: A < B on the same date advances to B + 1', () => {
  const next = computeReleaseName([], '20260922', undefined); // A = plain (0)
  const remote = { name: 'XCC-Deluxe-20260922-3.zip', date: '20260922', number: 3 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922-4');
  assert.equal(out.number, 4);
  assert.equal(out.adjusted, true);
  assert.equal(out.remote, remote.name);
  assert.deepEqual(out.collisions, []);
});

test('applyRemoteFloor: A == B advances to B + 1', () => {
  const next = computeReleaseName([], '20260922', 3); // A = -3
  const remote = { name: 'XCC-Deluxe-20260922-3.zip', date: '20260922', number: 3 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922-4');
  assert.equal(out.adjusted, true);
});

test('applyRemoteFloor: A > B keeps A (manual number wins)', () => {
  const next = computeReleaseName([], '20260922', 9);
  const remote = { name: 'XCC-Deluxe-20260922-3.zip', date: '20260922', number: 3 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922-9');
  assert.equal(out.adjusted, false);
  assert.equal(out.remote, remote.name);
});

test('applyRemoteFloor: today beats yesterday — A > B by date keeps A', () => {
  const next = computeReleaseName([], '20260922', undefined);
  const remote = { name: 'XCC-Deluxe-20260921-5.zip', date: '20260921', number: 5 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922');
  assert.equal(out.adjusted, false);
});

test('applyRemoteFloor: newer remote date carries over into the adjusted name', () => {
  const next = computeReleaseName([], '20260922', 1);
  const remote = { name: 'XCC-Deluxe-20260923-2.zip', date: '20260923', number: 2 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260923-3');
  assert.equal(out.date, '20260923');
  assert.equal(out.number, 3);
  assert.equal(out.adjusted, true);
});

test('applyRemoteFloor: plain remote name advances to -1', () => {
  const next = computeReleaseName([], '20260922', undefined);
  const remote = { name: 'XCC-Deluxe-20260922.zip', date: '20260922', number: 0 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-');
  assert.equal(out.name, 'XCC-Deluxe-20260922-1');
  assert.equal(out.adjusted, true);
});

test('applyRemoteFloor: adjusted name is re-checked against local releases', () => {
  const releases = [
    { date: '20260922', number: 4, name: 'XCC-Deluxe-20260922-4', isDir: true },
  ];
  const next = computeReleaseName([], '20260922', undefined);
  const remote = { name: 'XCC-Deluxe-20260922-3.zip', date: '20260922', number: 3 };
  const out = applyRemoteFloor(next, remote, 'XCC-Deluxe-', releases);
  assert.equal(out.name, 'XCC-Deluxe-20260922-4');
  assert.ok(out.collisions.some((c) => c.includes('发布目录 XCC-Deluxe-20260922-4 已存在')));
  // and a clean name reports no collisions
  const clean = applyRemoteFloor(next, { name: 'XCC-Deluxe-20260922-2.zip', date: '20260922', number: 2 }, 'XCC-Deluxe-', releases);
  assert.deepEqual(clean.collisions, []);
});

test('applyRemoteFloor: normalized prefix matches custom project names', () => {
  const next = { date: '20260922', number: undefined, name: 'MyGame-20260922', collisions: [] };
  const remote = { name: 'MyGame-20260922-2.zip', date: '20260922', number: 2 };
  const out = applyRemoteFloor(next, remote, 'MyGame');
  assert.equal(out.name, 'MyGame-20260922-3');
  assert.equal(normalizeReleasePrefix('MyGame'), 'MyGame-');
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
    await mk('XCC-Deluxe-20260919', false); // matching name, but a regular file
    await mk('unrelated.txt', false);
    await mk('XCC-Deluxe-202609221.zip', false); // 9 digits — ignored
    const entries = await scanReleases(dir);
    assert.deepEqual(entries.map((e) => e.name), [
      'XCC-Deluxe-20260922-2', // newest date, number desc, dir before zip for same name
      'XCC-Deluxe-20260922-1',
      'XCC-Deluxe-20260922',
      'XCC-Deluxe-20260921',
      'XCC-Deluxe-20260920',
      'XCC-Deluxe-20260919',
    ]);
    const impostor = entries.find((e) => e.name === 'XCC-Deluxe-20260919');
    assert.equal(impostor.isDir, false);
    assert.equal(computeReleaseName(entries, '20260919').name, 'XCC-Deluxe-20260919');
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
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3}'), { major: 1, minor: 2, patch: 3, mode: undefined });
  assert.deepEqual(parseWebVersion('{"major":0,"minor":0,"patch":0}'), { major: 0, minor: 0, patch: 0, mode: undefined });
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3,"mode":"prod"}'), { major: 1, minor: 2, patch: 3, mode: 'prod' });
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3,"mode":"development"}'), { major: 1, minor: 2, patch: 3, mode: 'dev' });
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3,"mode":"production"}'), { major: 1, minor: 2, patch: 3, mode: 'prod' });
  assert.deepEqual(parseWebVersion('{"major":1,"minor":2,"patch":3,"mode":"staging"}'), { major: 1, minor: 2, patch: 3, mode: undefined }); // unknown mode ignored
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
