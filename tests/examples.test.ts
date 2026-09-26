import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMap } from '../src/validator.js';
import { example, repo } from './helpers.js';
import { createRequire } from 'node:module';
import { compileLayout, projectFlows, projectRelations } from '../src/core.js';
import type { CodeMap } from '../src/types.js';

test('架构样例与流程共用源码；跨模块依赖、读写与局部流程保持独立且可追溯', async () => {
  const map: CodeMap = JSON.parse(await readFile(new URL('../examples/minifs/architecture.codemap.json', import.meta.url), 'utf8'));
  const result = await validateMap(map, repo);
  assert.deepEqual(result.diagnostics, []); assert.equal(result.passed, true);
  assert.deepEqual(map.snapshot, (await example()).snapshot);
  const scene = compileLayout(map), overview = new Set([map.rootNodeId]);
  assert.deepEqual(map.nodes.filter(n => n.parentId === map.rootNodeId).map(n => n.kind), ['module', 'module', 'module', 'module']);
  const coarse = projectRelations(map, scene, overview);
  assert.ok(coarse.edges.some(e => e.source.nodeId === 'n-lifetime' && e.target.nodeId === 'n-backend' && e.type === 'dependency'));
  assert.ok(coarse.edges.some(e => e.source.nodeId === 'n-backend' && e.target.nodeId === 'n-lifetime' && e.type === 'write'));
  assert.equal(projectFlows(map, scene, overview).edges.length, 0);
  const expanded = new Set(map.nodes.filter(n => scene.nodes[n.id].children.length).map(n => n.id));
  const fine = projectRelations(map, scene, expanded);
  assert.deepEqual(fine.edges.flatMap(e => e.memberRelationIds).sort(), map.relations.map(r => r.id).sort());
  assert.ok(fine.edges.some(e => e.memberRelationIds.includes('r-backend-file') && e.target.nodeId === 'n-file'));
  // Layout/read order never creates runtime relations; only explicit facts are projected.
  map.primaryPath.reverse(); map.nodes.forEach(n => n.order = map.nodes.length - n.order);
  assert.deepEqual(projectRelations(map, compileLayout(map), overview), coarse);
});

test('真实 CodeMap 构建地图的快照、引用和所有片段与当前源码一致', async () => {
  const map = JSON.parse(await readFile(new URL('../examples/codemap-build/map.codemap.json', import.meta.url), 'utf8'));
  const result = await validateMap(map, repo);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.passed, true);
});

for (const name of ['fast-deep-equal', 'json-schema-traverse']) {
  test(`${name}：地图证据和许可完整，保存的源码与锁定依赖逐字节一致`, async () => {
    const base = new URL(`../examples/${name}/`, import.meta.url);
    const map = JSON.parse(await readFile(new URL('map.codemap.json', base), 'utf8'));
    const result = await validateMap(map, repo);
    assert.deepEqual(result.diagnostics, []); assert.equal(result.passed, true);
    assert.deepEqual(await readFile(new URL('source/index.cjs', base)), await readFile(new URL(`../node_modules/${name}/index.js`, import.meta.url)));
    const license = await readFile(new URL('source/LICENSE', base), 'utf8');
    assert.equal(map.snippets.find((s: { id: string }) => s.id === 's-license').segments[0].text + '\n', license);
    const provenance = JSON.parse(await readFile(new URL('source/provenance.json', base), 'utf8'));
    const installed = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8'));
    assert.equal(provenance.version, installed.version);
  });
}

const require = createRequire(import.meta.url);
test('深比较样例的关键解释：数组次序、NaN、正则、转换短路和键范围', () => {
  const equal = require('../examples/fast-deep-equal/source/index.cjs');
  assert.equal(equal([1, { value: NaN }], [1, { value: NaN }]), true);
  assert.equal(equal([1, 2], [2, 1]), false);
  assert.equal(equal(/a/gi, /a/g), false);
  const calls: string[] = [];
  const a = { value: 1, valueOf() { calls.push('a'); return 7; } };
  const b = { value: 2, valueOf() { calls.push('b'); return 7; } };
  assert.equal(equal(a, b), true); assert.deepEqual(calls, ['a', 'b']);
  assert.equal(equal({ [Symbol('hidden')]: 1 }, {}), true);
  assert.throws(() => equal({ valueOf() { throw Error('conversion'); } }, b), /conversion/);
});

test('遍历样例的关键解释：前后序、属性转义、allKeys 与布尔节点边界', () => {
  const traverse = require('../examples/json-schema-traverse/source/index.cjs');
  const visits: string[] = [];
  const schema = { properties: { 'a~/b': { type: 'string' }, ignored: true }, allOf: [{ type: 'number' }], default: { type: 'string' }, custom: { type: 'boolean' }, unknownArray: [{ type: 'string' }] };
  traverse(schema, { allKeys: true, cb: { pre: (_: unknown, ptr: string) => visits.push(`pre:${ptr}`), post: (_: unknown, ptr: string) => visits.push(`post:${ptr}`) } });
  assert.deepEqual(visits, ['pre:', 'pre:/properties/a~0~1b', 'post:/properties/a~0~1b', 'pre:/allOf/0', 'post:/allOf/0', 'pre:/custom', 'post:/custom', 'post:']);
  const after: string[] = [];
  assert.throws(() => traverse(schema, { cb: { pre: (_: unknown, ptr: string) => { if (ptr) throw Error('callback'); }, post: (_: unknown, ptr: string) => after.push(ptr) } }), /callback/);
  assert.deepEqual(after, []);
});
