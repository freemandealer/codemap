import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CodeMap, MapNode } from '../src/types.js';
export const repo = fileURLToPath(new URL('..', import.meta.url));
export async function example(): Promise<CodeMap> { return JSON.parse(await readFile(new URL('../examples/minifs/map.codemap.json', import.meta.url), 'utf8')); }
export function node(id: string, parentId: string | null, order = 0): MapNode { return { id, parentId, kind: parentId ? 'function' : 'topic', label: id, summary: id, entityIds: [], evidenceIds: [], claimStatus: 'editorial', order, importance: 'primary', snippetIds: [] }; }
export async function graphFixture(): Promise<CodeMap> {
  const map = await example(); map.rootNodeId = 'root'; map.primaryPath = ['root', 'A', 'a1']; map.scope.entryEntityIds = ['ea1']; map.flows = []; map.ports = [];
  map.nodes = [node('root', null), node('A', 'root'), node('B', 'root', 1), node('a1', 'A'), node('a2', 'A', 1), node('b1', 'B'), node('b2', 'B', 1), node('alias', 'B', 2), node('a-detail', 'a1')];
  map.entities = ['a1', 'a2', 'b1', 'b2'].map(id => { map.nodes.find(n => n.id === id)!.entityIds = [`e${id}`]; return { id: `e${id}`, kind: 'function', label: id, canonicalNodeId: id, evidenceIds: ['ev-open'] }; });
  map.nodes.find(n => n.id === 'alias')!.entityIds = ['ea1'];
  map.relations = [['ea1', 'eb1'], ['ea1', 'eb2'], ['ea2', 'eb2']].map(([sourceEntityId, targetEntityId], i) => ({ id: `r${i}`, sourceEntityId, targetEntityId, type: 'call', label: `call ${i}`, role: 'main', claimStatus: 'source', evidenceIds: ['ev-open'] }));
  return map;
}
