import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../schemas/codemap.schema.json' with { type: 'json' };
import { canonicalJSON, indexById, LIMITS, VERSION } from './core.js';
import { CodeMapError, gitState, physicalLines, readSource, safePath, sha256, sourceAllowed } from './source.js';
import type { CodeMap, Diagnostic, ValidationReceipt } from './types.js';

const schemaCheck = new Ajv2020({ allErrors: true, strict: false }).compile<CodeMap>(schema);
const tables = ['entities', 'nodes', 'ports', 'relations', 'flows', 'evidence', 'snippets'] as const;
export function validateStructure(input: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const add = (code: string, pointer: string, message: string, objectId?: string, exitCode: Diagnostic['exitCode'] = 3) => diagnostics.push({ code, pointer, message, objectId, exitCode, hint: '修正对应对象后重新运行 validate；不要修改 verification 来绕过核验。' });
  if (!input || typeof input !== 'object' || Array.isArray(input)) { add('E_SCHEMA', '', '地图必须是 JSON 对象。', undefined, 2); return diagnostics; }
  // Bound untrusted trees before schema traversal or canonical serialization.
  const stack: { value: unknown; depth: number }[] = [{ value: input, depth: 0 }]; let values = 0, bytes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++values > 200_000 || depth > 64) { add('E_INPUT_BUDGET', '', 'JSON 嵌套或字段数量超出预算。', undefined, 4); return diagnostics; }
    if (typeof value === 'string') { bytes += Buffer.byteLength(value); if (value.length > 200_000 || bytes > LIMITS.inputBytes) { add('E_INPUT_BUDGET', '', '输入文本超过预算。', undefined, 4); return diagnostics; } }
    else if (value && typeof value === 'object') for (const item of Object.values(value)) stack.push({ value: item, depth: depth + 1 });
  }
  for (const table of tables) {
    const items = (input as Record<string, unknown>)[table];
    if (Array.isArray(items) && items.length > LIMITS[table]) add('E_OBJECT_BUDGET', `/${table}`, `${table} 超过 ${LIMITS[table]} 个对象。`, undefined, 4);
  }
  if (diagnostics.length) return diagnostics;
  if (!schemaCheck(input)) {
    for (const err of (schemaCheck.errors ?? []).slice(0, 60)) add('E_SCHEMA', err.instancePath, `${err.message ?? '结构错误'} (${JSON.stringify(err.params)})`, undefined, 2);
    return diagnostics;
  }
  const map = input;
  const sets = Object.fromEntries(tables.map(table => [table, new Set(map[table].map(item => item.id))])) as Record<typeof tables[number], Set<string>>;
  for (const table of tables) {
    const seen = new Set<string>();
    map[table].forEach((item, i) => { if (seen.has(item.id)) add('E_DUPLICATE_ID', `/${table}/${i}/id`, '同表 ID 必须唯一。', item.id); seen.add(item.id); });
  }
  const refs = (table: typeof tables[number], ids: (string | undefined)[], pointer: string, objectId?: string) => {
    for (const id of ids) if (id !== undefined && !sets[table].has(id)) add('E_REFERENCE', pointer, `${table} 中不存在 ${id}。`, objectId);
  };
  const nodes = indexById(map.nodes), entities = indexById(map.entities), ports = indexById(map.ports), evidence = indexById(map.evidence);
  refs('nodes', [map.rootNodeId, ...map.primaryPath], '/primaryPath'); refs('entities', map.scope.entryEntityIds, '/scope/entryEntityIds');
  const roots = map.nodes.filter(n => n.parentId === null);
  if (roots.length !== 1 || roots[0].id !== map.rootNodeId) add('E_TREE_ROOT', '/rootNodeId', '讲解树必须只有一个根且与 rootNodeId 一致。');
  const ancestors = new Map<string, Set<string>>();
  for (const [i, node] of map.nodes.entries()) {
    refs('nodes', node.parentId === null ? [] : [node.parentId], `/nodes/${i}/parentId`, node.id);
    refs('entities', node.entityIds, `/nodes/${i}/entityIds`, node.id); refs('evidence', node.evidenceIds, `/nodes/${i}/evidenceIds`, node.id); refs('snippets', node.snippetIds, `/nodes/${i}/snippetIds`, node.id);
    const chain = new Set<string>(); let cursor: string | null = node.id;
    while (cursor !== null && nodes[cursor]) {
      if (chain.has(cursor)) { add('E_TREE_CYCLE', `/nodes/${i}/parentId`, '讲解树存在父子环。', node.id); break; }
      chain.add(cursor);
      if (chain.size > LIMITS.depth) { add('E_DEPTH_BUDGET', `/nodes/${i}`, `讲解树超过 ${LIMITS.depth} 层。`, node.id, 4); break; }
      cursor = nodes[cursor].parentId;
    }
    if (!chain.has(map.rootNodeId)) add('E_TREE_DISCONNECTED', `/nodes/${i}`, '节点不可从根到达。', node.id);
    ancestors.set(node.id, chain);
  }
  for (const [i, entity] of map.entities.entries()) {
    refs('nodes', [entity.canonicalNodeId], `/entities/${i}/canonicalNodeId`, entity.id); refs('evidence', entity.evidenceIds, `/entities/${i}/evidenceIds`, entity.id);
    if (nodes[entity.canonicalNodeId] && !nodes[entity.canonicalNodeId].entityIds.includes(entity.id)) add('E_CANONICAL_NODE', `/entities/${i}/canonicalNodeId`, '规范节点必须引用该实体。', entity.id);
  }
  for (const [i, port] of map.ports.entries()) {
    refs('entities', [port.entityId], `/ports/${i}/entityId`, port.id); refs('nodes', [port.detailNodeId], `/ports/${i}/detailNodeId`, port.id);
    if (port.detailNodeId && entities[port.entityId] && !ancestors.get(port.detailNodeId)?.has(entities[port.entityId].canonicalNodeId)) add('E_PORT_SUBTREE', `/ports/${i}/detailNodeId`, '端口必须在实体规范子树内。', port.id);
  }
  for (const [i, relation] of map.relations.entries()) {
    refs('entities', [relation.sourceEntityId, relation.targetEntityId], `/relations/${i}`, relation.id); refs('evidence', relation.evidenceIds, `/relations/${i}/evidenceIds`, relation.id);
    for (const side of ['source', 'target'] as const) {
      const portId = relation[`${side}PortId`]; refs('ports', [portId], `/relations/${i}/${side}PortId`, relation.id);
      if (portId && ports[portId] && ports[portId].entityId !== relation[`${side}EntityId`]) add('E_PORT_OWNER', `/relations/${i}/${side}PortId`, '关系端口与实体归属不符。', relation.id);
    }
  }
  for (const [i, flow] of map.flows.entries()) {
    refs('nodes', [flow.ownerNodeId, flow.fromNodeId, flow.toNodeId], `/flows/${i}`, flow.id); refs('evidence', flow.evidenceIds, `/flows/${i}/evidenceIds`, flow.id);
    for (const id of [flow.fromNodeId, flow.toNodeId]) if (id === flow.ownerNodeId || !ancestors.get(id)?.has(flow.ownerNodeId)) add('E_FLOW_OWNER', `/flows/${i}`, '流程端点必须是 ownerNodeId 的后代。', flow.id);
  }
  if (map.snapshot.files.length > LIMITS.files) add('E_FILE_BUDGET', '/snapshot/files', `文件超过 ${LIMITS.files} 个。`, undefined, 4);
  const paths = new Set<string>();
  map.snapshot.files.forEach((file, i) => {
    if (paths.has(file.path)) add('E_DUPLICATE_FILE', `/snapshot/files/${i}`, '快照文件重复。'); paths.add(file.path);
    if (!safePath(file.path) || !sourceAllowed(file.path)) add('E_SOURCE_PATH', `/snapshot/files/${i}/path`, '必须使用范围内、非敏感文件的相对路径。');
  });
  if (map.snapshot.repositoryUrl) {
    try { const url = new URL(map.snapshot.repositoryUrl); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error(); }
    catch { add('E_REPOSITORY_URL', '/snapshot/repositoryUrl', '仓库地址必须是无凭据、无查询参数的 HTTPS URL。'); }
  }
  for (const [i, ev] of map.evidence.entries()) {
    if (ev.snapshotId !== map.snapshot.id) add('E_SNAPSHOT', `/evidence/${i}/snapshotId`, '证据不属于当前快照。', ev.id);
    if (!paths.has(ev.path)) add('E_EVIDENCE_FILE', `/evidence/${i}/path`, '证据文件未在快照登记。', ev.id);
    if (!Number.isSafeInteger(ev.endLine) || ev.endLine < ev.startLine) add('E_SOURCE_RANGE', `/evidence/${i}`, '证据行范围无效。', ev.id);
  }
  let sourceBytes = 0;
  for (const [i, snippet] of map.snippets.entries()) {
    refs('evidence', [snippet.evidenceId], `/snippets/${i}/evidenceId`, snippet.id);
    const ev = evidence[snippet.evidenceId]; if (!ev) continue;
    let cursor = ev.startLine;
    snippet.segments.forEach((segment, j) => {
      if (!Number.isSafeInteger(segment.endLine) || segment.startLine !== cursor || segment.endLine < segment.startLine || segment.endLine > ev.endLine) add('E_SNIPPET_PARTITION', `/snippets/${i}/segments/${j}`, '片段必须连续、不重叠地划分证据范围。', snippet.id);
      if (segment.kind === 'source') {
        sourceBytes += Buffer.byteLength(segment.text);
        // The last physical line may be empty; source segments omit only the range terminator.
        if (segment.text.includes('\r') || segment.text.split('\n').length !== segment.endLine - segment.startLine + 1) add('E_SOURCE_LINES', `/snippets/${i}/segments/${j}`, '原文必须规范化为 LF，且行数与区间一致。', snippet.id);
      }
      cursor = segment.endLine + 1;
    });
    if (cursor !== ev.endLine + 1) add('E_SNIPPET_PARTITION', `/snippets/${i}/segments`, '片段未完整划分证据范围。', snippet.id);
  }
  if (sourceBytes > LIMITS.sourceBytes) add('E_SOURCE_BUDGET', '/snippets', '内嵌源码超过 2MB；请收窄地图范围。', undefined, 4);
  return diagnostics;
}

export async function validateMap(input: unknown, repo?: string): Promise<ValidationReceipt> {
  const diagnostics = validateStructure(input);
  const map = input as CodeMap;
  const receipt: ValidationReceipt = { format: 'codemap-validation-1', compilerVersion: VERSION, inputSha256: '', snapshotId: map?.snapshot?.id ?? '', passed: false,
    checks: { schema: !diagnostics.some(d => d.exitCode === 2), references: diagnostics.length === 0, sources: false }, files: [], matchedEvidenceIds: [], diagnostics };
  if (diagnostics.some(d => d.code === 'E_INPUT_BUDGET')) return receipt;
  receipt.inputSha256 = sha256(canonicalJSON(input));
  if (diagnostics.length) return receipt;
  const add = (code: string, pointer: string, message: string, objectId?: string) => diagnostics.push({ code, pointer, message, objectId, exitCode: 3, hint: '从记录的代码快照重新提取并验证。' });
  if (!repo) { add('E_SOURCE_REQUIRED', '/snapshot', '需要 --repo 指向可读取的源码快照；IR 自报 matched 不构成验证。'); return receipt; }
  if (map.snapshot.kind === 'git') {
    const state = gitState(repo);
    if (!state || state.revision !== map.snapshot.revision || (!map.snapshot.dirty && state.dirty)) add('E_GIT_SNAPSHOT', '/snapshot', 'Git 基线提交或 clean 状态与输入目录不匹配。');
  }
  const contents = new Map<string, Awaited<ReturnType<typeof readSource>>>(); let bytes = 0;
  for (const [i, file] of map.snapshot.files.entries()) {
    try {
      const source = await readSource(repo, file.path); bytes += source.bytes;
      if (bytes > LIMITS.totalFileBytes) { diagnostics.push({ code: 'E_SOURCE_BUDGET', pointer: '/snapshot/files', message: '读取源码总量超过预算。', hint: '收窄文件范围。', exitCode: 4 }); break; }
      if (source.sha256 !== file.sha256) add('E_SOURCE_HASH', `/snapshot/files/${i}/sha256`, `文件内容指纹不一致：${file.path}`);
      else { contents.set(file.path, source); receipt.files.push({ path: file.path, sha256: source.sha256, lineCount: source.lines.length }); }
    } catch (err) {
      if (err instanceof CodeMapError) diagnostics.push(err.diagnostic);
      else add('E_SOURCE_READ', `/snapshot/files/${i}`, `无法读取 ${file.path}：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const [i, ev] of map.evidence.entries()) {
    const file = contents.get(ev.path);
    if (file && ev.endLine <= file.lines.length) receipt.matchedEvidenceIds.push(ev.id);
    else add('E_SOURCE_RANGE', `/evidence/${i}`, '无法验证证据行范围或文件指纹。', ev.id);
  }
  const evidence = indexById(map.evidence);
  for (const [i, snippet] of map.snippets.entries()) {
    const ev = evidence[snippet.evidenceId], file = contents.get(ev.path); if (!file) continue;
    snippet.segments.forEach((segment, j) => {
      if (segment.kind === 'source' && segment.text !== file.lines.slice(segment.startLine - 1, segment.endLine).join('\n')) add('E_SOURCE_TEXT_MISMATCH', `/snippets/${i}/segments/${j}`, `原文不符：${ev.path}:${segment.startLine}–${segment.endLine}`, snippet.id);
    });
  }
  receipt.files.sort((a, b) => a.path < b.path ? -1 : 1); receipt.matchedEvidenceIds.sort();
  receipt.checks.sources = diagnostics.length === 0; receipt.passed = diagnostics.length === 0;
  return receipt;
}

export function validateReceipt(map: CodeMap, value: unknown): asserts value is ValidationReceipt {
  const r = value as ValidationReceipt | null;
  const bad = () => { throw new CodeMapError({ code: 'E_VALIDATION_RECEIPT', pointer: '', message: '验证收据缺失、失败、版本过期或与当前地图不匹配。', hint: '重新运行 validate --repo 并使用新的 JSON 收据。', exitCode: 3 }); };
  if (!r || r.format !== 'codemap-validation-1' || r.compilerVersion !== VERSION || !r.passed || r.inputSha256 !== sha256(canonicalJSON(map)) || r.snapshotId !== map.snapshot.id || !r.checks?.schema || !r.checks.references || !r.checks.sources || !Array.isArray(r.diagnostics) || r.diagnostics.length || !Array.isArray(r.files) || !Array.isArray(r.matchedEvidenceIds)) bad();
  if (canonicalJSON(r!.matchedEvidenceIds.slice().sort()) !== canonicalJSON(map.evidence.map(e => e.id).sort())) bad();
  if (r!.files.length !== map.snapshot.files.length) bad();
  for (const file of map.snapshot.files) {
    const found = r!.files.filter(f => f.path === file.path);
    if (found.length !== 1 || found[0].sha256 !== file.sha256 || !Number.isSafeInteger(found[0].lineCount) || found[0].lineCount < 0) bad();
    if (map.evidence.some(ev => ev.path === file.path && ev.endLine > found[0].lineCount)) bad();
  }
}
