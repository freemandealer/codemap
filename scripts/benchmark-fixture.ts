import { mkdir, writeFile } from 'node:fs/promises';
import { createSnapshot, extractSource } from '../src/source.js';
import type { CodeMap, MapNode } from '../src/types.js';

// 固定合成负载：1 个主题、7 个职责、49 个机制、443 个函数、1,500 个调用点。
// 只用于渲染性能，不作为真实项目生成质量的证据；不会执行 fixture.ts。
export async function benchmarkFixture(directory: string): Promise<CodeMap> {
  await mkdir(directory, { recursive: true });
  const targets = Array.from({ length: 443 }, () => [] as number[]);
  for (let i = 0; i < 1500; i++) targets[i % 443].push((i * 37 + 17) % 443);
  const lines = targets.map((calls, i) => `export function unit${i}(value: number): number { return ${calls.map(j => `unit${j}(value)`).join(' + ')}; }`);
  await writeFile(`${directory}/fixture.ts`, lines.join('\n') + '\n');
  const snapshot = await createSnapshot(directory, ['fixture.ts']);
  const nodes: MapNode[] = [];
  const add = (id: string, parentId: string | null, kind: MapNode['kind'], order: number) => nodes.push({
    id, parentId, kind, order, label: id, summary: '固定合成负载，用于验证分层缩放和关系预算，不表示真实业务逻辑。',
    entityIds: [], evidenceIds: [], claimStatus: 'editorial', importance: 'primary', snippetIds: [],
  });
  add('root', null, 'topic', 0);
  for (let i = 0; i < 7; i++) add(`module${i}`, 'root', 'module', i);
  for (let i = 0; i < 49; i++) add(`mechanism${i}`, `module${i % 7}`, 'mechanism', i);
  const entities: CodeMap['entities'] = [], evidence: CodeMap['evidence'] = [], snippets: CodeMap['snippets'] = [];
  for (let i = 0; i < 443; i++) {
    const id = `unit${i}`, ev = `ev${i}`;
    add(id, `mechanism${i % 49}`, 'function', i);
    Object.assign(nodes.at(-1)!, { entityIds: [id], evidenceIds: [ev], snippetIds: [id], claimStatus: 'source' });
    entities.push({ id, kind: 'function', label: id, symbol: id, canonicalNodeId: id, evidenceIds: [ev] });
    evidence.push({ id: ev, snapshotId: snapshot.id, path: 'fixture.ts', startLine: i + 1, endLine: i + 1, verification: 'unverified' });
    snippets.push({ id, evidenceId: ev, label: id, language: 'typescript', segments: [(await extractSource(directory, 'fixture.ts', i + 1, i + 1)).segment], preservedSemantics: ['完整合成函数；可能形成递归，不执行。'] });
  }
  return {
    schemaVersion: '0.1', mapId: 'benchmark-500-1500', title: 'CodeMap 固定压力样例', language: 'zh-CN',
    scope: { question: '500 个节点与 1,500 条关系的离线阅读器性能如何？', audience: '性能测试', inScope: ['固定合成函数与调用关系'], outOfScope: ['真实项目解释质量'], assumptions: ['合成源码仅供取证与渲染，不执行'], entryEntityIds: ['unit0'] },
    snapshot, rootNodeId: 'root', nodes, entities, ports: [], flows: [], evidence, snippets,
    relations: Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}`, sourceEntityId: `unit${i % 443}`, targetEntityId: `unit${(i * 37 + 17) % 443}`, type: 'call', label: `合成调用 ${i}`, role: 'main', claimStatus: 'source', evidenceIds: [`ev${i % 443}`] })),
    primaryPath: ['root', 'module0', 'mechanism0', 'unit0'],
    coverage: { completePaths: ['固定合成负载'], partialPaths: [], excludedPaths: ['实际业务与运行行为'], openQuestions: [] },
  };
}
