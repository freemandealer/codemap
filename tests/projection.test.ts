import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLayout, frontier, projectRelations, projectFlows, rectIn, resolveNode, zoomAt } from '../src/core.js';
import { example, graphFixture } from './helpers.js';

test('三条粗线成员拆分、混合深度与反向聚合保留精确 ID 集', async () => {
  const map = await graphFixture(), scene = compileLayout(map);
  const coarse = projectRelations(map, scene, new Set(['root'])); assert.equal(coarse.edges.length, 1); assert.deepEqual(coarse.edges[0].memberRelationIds, ['r0', 'r1', 'r2']);
  const mixed = projectRelations(map, scene, new Set(['root', 'A'])); assert.equal(mixed.edges.length, 2); assert.deepEqual(mixed.edges.map(e => e.memberRelationIds.length).sort(), [1, 2]); assert.ok(mixed.edges.every(e => e.target.nodeId === 'B'));
  const fine = projectRelations(map, scene, new Set(['root', 'A', 'B'])); assert.equal(fine.edges.length, 3);
  for (let i = 0; i < 20; i++) { projectRelations(map, scene, new Set(['root', 'A', 'B'])); assert.deepEqual(projectRelations(map, scene, new Set(['root'])), coarse); }
});
test('边界端点不会捏造内部步骤；端口只在实际可见时分开', async () => {
  const map = await graphFixture(), scene = compileLayout(map), expanded = new Set(['root', 'A', 'B', 'a1']);
  assert.deepEqual(resolveNode(scene, 'a1', expanded), { nodeId: 'a1', port: 'boundary', boundary: true });
  map.ports.push({ id: 'p', entityId: 'ea1', label: '调用点', kind: 'callsite', detailNodeId: 'a-detail' }); map.relations[0].sourcePortId = 'p';
  assert.equal(projectRelations(map, scene, expanded).edges[0].source.nodeId, 'a-detail');
  const coarse = projectRelations(map, scene, new Set(['root'])); assert.equal(coarse.edges.length, 1); assert.equal(coarse.edges[0].source.port, 'boundary');
});
test('内部关系、递归、方向、未知与别名分别保留', async () => {
  const map = await graphFixture(); map.relations.push(
    { ...map.relations[0], id: 'internal', targetEntityId: 'ea2' }, { ...map.relations[0], id: 'recursive', targetEntityId: 'ea1' },
    { ...map.relations[0], id: 'reverse', sourceEntityId: 'eb1', targetEntityId: 'ea1' }, { ...map.relations[0], id: 'unknown', claimStatus: 'unknown', claimReason: '目标未经绑定确认' });
  const result = projectRelations(map, compileLayout(map), new Set(['root']));
  assert.deepEqual(result.internal.A, ['internal']); assert.equal(result.edges.find(e => e.recursive)!.memberRelationIds[0], 'recursive');
  assert.equal(result.edges.find(e => e.claimStatus === 'unknown')!.memberRelationIds[0], 'unknown'); assert.equal(result.edges.find(e => e.source.nodeId === 'B')!.memberRelationIds[0], 'reverse');
  assert.equal(result.edges.flatMap(e => e.memberRelationIds).filter(id => id === 'r0').length, 1);
});
test('随机展开、筛选、裁剪和预算状态下全部原子关系恰好归属一个桶', async () => {
  const map = await graphFixture(); for (let i = 0; i < 100; i++) map.relations.push({ ...map.relations[i % 3], id: `copy${i}`, type: i % 2 ? 'read' : 'write' });
  const scene = compileLayout(map); let seed = 1397;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 200; i++) {
    const expanded = new Set(map.nodes.filter(() => next() > .5).map(n => n.id));
    const visible = new Set(map.nodes.filter(() => next() > .4).map(n => n.id));
    const result = projectRelations(map, scene, expanded, { visible, types: new Set(i % 2 ? ['call', 'write'] : ['call', 'read', 'write']), edgeBudget: i % 5 });
    const ids = [...result.edges.flatMap(e => e.memberRelationIds), ...Object.values(result.internal).flat(), ...result.filtered, ...result.offscreen, ...result.overflow.flatMap(e => e.memberRelationIds)];
    assert.equal(new Set(ids).size, map.relations.length); assert.equal(ids.length, map.relations.length); assert.deepEqual(ids.sort(), map.relations.map(r => r.id).sort());
  }
});
test('局部流程只在 owner 展开时呈现；条件不会丢失或与调用相加', async () => {
  const map = await example(), scene = compileLayout(map);
  const closed = projectFlows(map, scene, new Set(['n-root'])); assert.equal(closed.edges.length, 0); assert.equal(Object.values(closed.internal).flat().length, map.flows.length);
  const open = projectFlows(map, scene, new Set(['n-root', 'n-entry', 'n-open']));
  assert.equal(open.edges.flatMap(e => e.memberFlowIds).length + Object.values(open.internal).flat().length, map.flows.length); assert.ok(open.edges.every(e => e.label.length));
});
test('确定性布局、父子包含与焦点坐标重基准', async () => {
  const map = await example(), scene = compileLayout(map); assert.deepEqual(compileLayout(map), scene);
  const reordered = structuredClone(map); reordered.nodes.reverse(); assert.deepEqual(compileLayout(reordered), scene);
  for (const node of Object.values(scene.nodes)) {
    const r = node.local; assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1.0000001 && r.y + r.height <= 1.0000001);
    assert.ok(rectIn(scene, node.id)); if (node.parentId) assert.deepEqual(rectIn(scene, node.id, node.parentId), r);
  }
  assert.deepEqual(rectIn(scene, 'n-dispatch-code', 'n-dispatch-code'), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(rectIn(scene, 'n-path', 'n-entry'), null);
});
test('缩放固定指针下的世界坐标', () => { const camera = { x: 37, y: -23, k: 2.5 }, point = { x: 193, y: 287 }; const next = zoomAt(camera, point, 1.4); assert.ok(Math.abs((point.x - camera.x) / camera.k - (point.x - next.x) / next.k) < 1e-10); assert.ok(Math.abs((point.y - camera.y) / camera.k - (point.y - next.y) / next.k) < 1e-10); });
