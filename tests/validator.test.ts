import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshot, extractSource, physicalLines, readSource } from '../src/source.js';
import { validateMap, validateReceipt, validateStructure } from '../src/validator.js';
import { example, graphFixture, node, repo } from './helpers.js';

test('金样例通过结构、引用、源码和片段核验；不修改输入', async () => {
  const map = await example(), before = JSON.stringify(map); const receipt = await validateMap(map, repo);
  assert.deepEqual(receipt.diagnostics, []); assert.equal(receipt.passed, true); assert.equal(receipt.matchedEvidenceIds.length, 13); assert.equal(JSON.stringify(map), before); validateReceipt(map, receipt);
});
test('自报 matched 无法替代快照读取', async () => { const result = await validateMap(await example()); assert.equal(result.passed, false); assert.equal(result.diagnostics[0].code, 'E_SOURCE_REQUIRED'); });
test('阅读视角可选；支持流程与架构，拒绝无效枚举且保留旧地图兼容性', async () => {
  const map = await example();
  delete map.scope.viewpoint;
  assert.deepEqual(validateStructure(map), []);
  for (const viewpoint of ['flow', 'architecture'] as const) {
    map.scope.viewpoint = viewpoint;
    assert.deepEqual(validateStructure(map), []);
  }
  (map.scope as any).viewpoint = 'auto';
  assert.ok(validateStructure(map).some(d => d.code === 'E_SCHEMA' && d.pointer === '/scope/viewpoint'));
});
test('未知字段、错误版本、缺失 source 证据、推断原因都被拒绝', async () => {
  for (const mutate of [(m: any) => m.unknown = true, (m: any) => m.schemaVersion = '1.0', (m: any) => m.nodes[2].evidenceIds = [], (m: any) => delete m.nodes[1].claimReason]) {
    const map = await example(); mutate(map); assert.ok(validateStructure(map).some(d => d.code === 'E_SCHEMA'));
  }
});
test('断引用、重复 ID、树环、端口归属、跨 owner 流程给出对象与 pointer', async () => {
  for (const [code, mutate] of [
    ['E_REFERENCE', (m: any) => m.primaryPath.push('missing')], ['E_DUPLICATE_ID', (m: any) => m.nodes.push(m.nodes[0])],
    ['E_TREE_CYCLE', (m: any) => m.nodes[0].parentId = m.nodes[1].id], ['E_CANONICAL_NODE', (m: any) => m.entities[0].canonicalNodeId = 'n-root'],
    ['E_PORT_SUBTREE', (m: any) => m.ports[0].detailNodeId = 'n-path'], ['E_PORT_OWNER', (m: any) => m.ports[0].entityId = 'e-lookup'],
    ['E_FLOW_OWNER', (m: any) => m.flows[0].toNodeId = 'n-path'], ['E_SOURCE_PATH', (m: any) => m.snapshot.files[0].path = '../secret'],
    ['E_SNAPSHOT', (m: any) => m.evidence[0].snapshotId = 'different'], ['E_REPOSITORY_URL', (m: any) => m.snapshot.repositoryUrl = 'https://user:secret@example.org/project'],
  ] as const) { const map = await example(); mutate(map); const found = validateStructure(map).find(d => d.code === code); assert.ok(found, `${code}: ${JSON.stringify(validateStructure(map))}`); assert.ok(found.pointer.startsWith('/')); }
});
test('合法实体图允许环、递归、别名及跨表同名 ID', async () => {
  const map = await graphFixture(); map.relations.push({ ...map.relations[0], id: 'root', sourceEntityId: 'eb1', targetEntityId: 'ea1' }, { ...map.relations[0], id: 'recur', targetEntityId: 'ea1' }); assert.deepEqual(validateStructure(map), []);
});
test('片段篡改、区间缺口、文件改动、伪造行范围不可通过', async () => {
  const map = await example(); const segment = map.snippets[0].segments.find(s => s.kind === 'source')!; if (segment.kind === 'source') segment.text = segment.text.replace('int', 'void');
  assert.ok((await validateMap(map, repo)).diagnostics.some(d => d.code === 'E_SOURCE_TEXT_MISMATCH'));
  segment.startLine++; assert.ok(validateStructure(map).some(d => d.code === 'E_SNIPPET_PARTITION'));
  const changed = await example(); changed.snapshot.files[0].sha256 = '0'.repeat(64); assert.ok((await validateMap(changed, repo)).diagnostics.some(d => d.code === 'E_SOURCE_HASH'));
  const range = await example(); range.evidence[0].endLine = 999999; range.snippets = range.snippets.filter(s => s.evidenceId !== range.evidence[0].id); range.nodes.forEach(n => n.snippetIds = n.snippetIds.filter(id => range.snippets.some(s => s.id === id))); assert.ok((await validateMap(range, repo)).diagnostics.some(d => d.code === 'E_SOURCE_RANGE'));
});
test('收据绑定 IR、版本、全部证据和精确文件集合', async () => {
  const map = await example(), receipt = await validateMap(map, repo);
  for (const change of [(r: any) => r.inputSha256 = '0'.repeat(64), (r: any) => r.compilerVersion = 'old', (r: any) => r.matchedEvidenceIds.pop(), (r: any) => r.files.push(r.files[0]), (r: any) => r.files[0].lineCount = 0]) { const wrong = structuredClone(receipt); change(wrong); assert.throws(() => validateReceipt(map, wrong), /收据/); }
  map.title += ' changed'; assert.throws(() => validateReceipt(map, receipt), /收据/);
});
test('资源预算包括对象数与 32 层讲解树', async () => {
  const map = await graphFixture(); for (let i = 0; i < 33; i++) map.nodes.push(node(`deep${i}`, i === 0 ? 'a1' : `deep${i - 1}`));
  assert.ok(validateStructure(map).some(d => d.code === 'E_DEPTH_BUDGET'));
  while (map.nodes.length < 501) map.nodes.push(node(`extra${map.nodes.length}`, 'root'));
  assert.ok(validateStructure(map).some(d => d.code === 'E_OBJECT_BUDGET'));
  assert.ok(validateStructure({ long: 'x'.repeat(200001) }).some(d => d.code === 'E_INPUT_BUDGET'));
});
test('取证处理 CRLF、空物理行、UTF-8、路径与符号链接边界', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'codemap-source-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'file.c'), 'a\r\n\r\nb\r\n');
  assert.deepEqual(physicalLines('a\r\n\r\nb\r\n'), ['a', '', 'b']);
  assert.equal((await extractSource(dir, 'file.c', 1, 3)).segment.text, 'a\n\nb');
  const snapshot = await createSnapshot(dir, ['file.c', 'file.c']); assert.equal(snapshot.kind, 'content'); assert.equal(snapshot.files.length, 1); assert.deepEqual(await createSnapshot(dir, ['file.c']), snapshot);
  await writeFile(join(dir, 'bad.c'), new Uint8Array([0xff])); await assert.rejects(readSource(dir, 'bad.c'), /UTF-8/);
  await symlink('/etc/hosts', join(dir, 'escape')); await assert.rejects(readSource(dir, 'escape'), /越出/);
  for (const path of ['../file.c', '/etc/hosts', '.env', 'x/../../file', 'a\\b', '.git/config']) await assert.rejects(readSource(dir, path), /拒绝/);
  await assert.rejects(extractSource(dir, 'file.c', 1, 4), /行范围/);
});
