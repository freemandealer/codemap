import type { CodeMap, MapNode, Rect, Scene, SceneNode } from './types.js';
export const VERSION = '0.1.0';
export const LIMITS = Object.freeze({ nodes: 500, relations: 1500, flows: 3000, entities: 1500, ports: 3000, evidence: 5000, snippets: 1500, files: 80, depth: 32, inputBytes: 8_000_000, sourceBytes: 2_000_000, htmlBytes: 5_000_000, fileBytes: 10_000_000, totalFileBytes: 64_000_000, visibleNodes: 80, visibleEdges: 200 });
export const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const indexById = <T extends { id: string }>(items: T[]): Record<string, T> => Object.assign(Object.create(null), Object.fromEntries(items.map(item => [item.id, item])));
export function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort(compareId).map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function childrenOf(map: CodeMap): Record<string, MapNode[]> {
  const children = Object.fromEntries(map.nodes.map(n => [n.id, [] as MapNode[]]));
  for (const n of map.nodes) if (n.parentId !== null) children[n.parentId].push(n);
  for (const items of Object.values(children)) items.sort((a, b) => a.order - b.order || compareId(a.id, b.id));
  return children;
}
export function compileLayout(map: CodeMap): Scene {
  const children = childrenOf(map);
  const nodes: Record<string, SceneNode> = Object.create(null);
  const entities = indexById(map.entities), evidence = indexById(map.evidence);
  function visit(node: MapNode, local: Rect, ancestors: string[]) {
    const kids = children[node.id];
    // Step groups follow ordered rows; responsibility regions use a fixed ordered grid.
    const isSteps = kids.length > 1 && kids.every(n => n.kind === 'step' || n.kind === 'code' || n.kind === 'boundary');
    const columns = isSteps ? Math.min(2, kids.length) : Math.max(1, Math.ceil(Math.sqrt(kids.length)));
    const rows = Math.max(1, Math.ceil(kids.length / columns));
    nodes[node.id] = { id: node.id, parentId: node.parentId, children: kids.map(n => n.id), ancestors, depth: ancestors.length, local,
      minExpandWidth: Math.max(360, columns * 190 + 50), minExpandHeight: Math.max(220, rows * 125 + 75),
      searchText: [node.label, node.summary, ...node.entityIds.map(id => entities[id].symbol ?? entities[id].label), ...node.evidenceIds.map(id => evidence[id].path)].join(' ').toLowerCase() };
    const gap = 0.025, padding = 0.035, top = 0.14;
    // Equal normalized width/height retains the parent aspect ratio and permits exact camera rebasing.
    const size = Math.min((1 - 2 * padding - (columns - 1) * gap) / columns, (1 - top - padding - (rows - 1) * gap) / rows);
    const left = (1 - columns * size - (columns - 1) * gap) / 2;
    kids.forEach((kid, i) => visit(kid, { x: left + (i % columns) * (size + gap), y: top + Math.floor(i / columns) * (size + gap), width: size, height: size }, [...ancestors, node.id]));
  }
  visit(map.nodes.find(n => n.id === map.rootNodeId)!, { x: 0, y: 0, width: 1, height: 1 }, []);
  return { version: 'regions-1', rootNodeId: map.rootNodeId, nodes };
}
export function rectIn(scene: Scene, id: string, anchor = scene.rootNodeId): Rect | null {
  if (id === anchor) return { x: 0, y: 0, width: 1, height: 1 };
  const chain: SceneNode[] = [];
  let node = scene.nodes[id];
  while (node && node.id !== anchor) { chain.unshift(node); node = scene.nodes[node.parentId!]; }
  if (!node) return null;
  const result = { x: 0, y: 0, width: 1, height: 1 };
  for (const part of chain) { result.x += part.local.x * result.width; result.y += part.local.y * result.height; result.width *= part.local.width; result.height *= part.local.height; }
  return result;
}
export function intersects(a: Rect, b: Rect): boolean { return a.x + a.width >= b.x && a.y + a.height >= b.y && a.x <= b.x + b.width && a.y <= b.y + b.height; }
export function frontier(scene: Scene, expanded: ReadonlySet<string>): string[] {
  const out: string[] = [];
  function visit(id: string) { const n = scene.nodes[id]; if (expanded.has(id) && n.children.length) n.children.forEach(visit); else out.push(id); }
  visit(scene.rootNodeId); return out;
}
export interface Endpoint { nodeId: string; port: string; boundary: boolean }
export function resolveNode(scene: Scene, origin: string, expanded: ReadonlySet<string>, port?: string): Endpoint {
  const chain = [...scene.nodes[origin].ancestors, origin];
  for (const id of chain) if (!expanded.has(id) || !scene.nodes[id].children.length) return { nodeId: id, port: id === origin && port ? port : 'boundary', boundary: false };
  return { nodeId: origin, port: port ?? 'boundary', boundary: true };
}
export interface ProjectedEdge {
  id: string; source: Endpoint; target: Endpoint; type: string; claimStatus: string; role: string;
  memberRelationIds: string[]; recursive: boolean;
}
export interface Projection {
  edges: ProjectedEdge[]; internal: Record<string, string[]>; filtered: string[]; offscreen: string[]; overflow: ProjectedEdge[];
}
export function projectRelations(map: CodeMap, scene: Scene, expanded: ReadonlySet<string>, options: { types?: ReadonlySet<string>; visible?: ReadonlySet<string>; edgeBudget?: number; selectedRelationId?: string } = {}): Projection {
  const entities = indexById(map.entities), ports = indexById(map.ports);
  const groups = new Map<string, ProjectedEdge>();
  const result: Projection = { edges: [], internal: Object.create(null), filtered: [], offscreen: [], overflow: [] };
  const endpoint = (entityId: string, portId?: string) => {
    const origin = (portId && ports[portId]?.detailNodeId) || entities[entityId].canonicalNodeId;
    return resolveNode(scene, origin, expanded, portId);
  };
  for (const relation of [...map.relations].sort((a, b) => compareId(a.id, b.id))) {
    if (options.types && !options.types.has(relation.type)) { result.filtered.push(relation.id); continue; }
    const source = endpoint(relation.sourceEntityId, relation.sourcePortId), target = endpoint(relation.targetEntityId, relation.targetPortId);
    if (options.visible && !options.visible.has(source.nodeId) && !options.visible.has(target.nodeId)) { result.offscreen.push(relation.id); continue; }
    const recursive = relation.sourceEntityId === relation.targetEntityId;
    if (source.nodeId === target.nodeId && !recursive && !source.boundary && !target.boundary) { (result.internal[source.nodeId] ??= []).push(relation.id); continue; }
    const key = JSON.stringify([source, target, relation.type, relation.claimStatus, relation.role, recursive]);
    let group = groups.get(key);
    if (!group) { group = { id: `edge:${relation.id}`, source, target, type: relation.type, claimStatus: relation.claimStatus, role: relation.role, recursive, memberRelationIds: [] }; groups.set(key, group); }
    group.memberRelationIds.push(relation.id);
  }
  const ordered = [...groups.values()].sort((a, b) => Number(b.memberRelationIds.includes(options.selectedRelationId ?? '')) - Number(a.memberRelationIds.includes(options.selectedRelationId ?? '')) || Number(b.role === 'main') - Number(a.role === 'main') || compareId(a.id, b.id));
  result.edges = ordered.slice(0, options.edgeBudget ?? LIMITS.visibleEdges);
  result.overflow = ordered.slice(options.edgeBudget ?? LIMITS.visibleEdges);
  return result;
}
export interface ProjectedFlow { ownerNodeId: string; source: Endpoint; target: Endpoint; kind: string; label: string; memberFlowIds: string[] }
export function projectFlows(map: CodeMap, scene: Scene, expanded: ReadonlySet<string>): { edges: ProjectedFlow[]; internal: Record<string, string[]> } {
  const groups = new Map<string, ProjectedFlow>(), internal: Record<string, string[]> = Object.create(null);
  for (const flow of map.flows) {
    const source = resolveNode(scene, flow.fromNodeId, expanded), target = resolveNode(scene, flow.toNodeId, expanded);
    if (!expanded.has(flow.ownerNodeId) || source.nodeId === target.nodeId) { (internal[resolveNode(scene, flow.ownerNodeId, expanded).nodeId] ??= []).push(flow.id); continue; }
    const key = JSON.stringify([flow.ownerNodeId, source, target, flow.kind, flow.label]);
    const group = groups.get(key) ?? { ownerNodeId: flow.ownerNodeId, source, target, kind: flow.kind, label: flow.label, memberFlowIds: [] };
    group.memberFlowIds.push(flow.id); groups.set(key, group);
  }
  return { edges: [...groups.values()], internal };
}
export function zoomAt(camera: { x: number; y: number; k: number }, point: { x: number; y: number }, factor: number) {
  const k = Math.max(0.12, Math.min(100_000, camera.k * factor)), ratio = k / camera.k;
  return { x: point.x - (point.x - camera.x) * ratio, y: point.y - (point.y - camera.y) * ratio, k };
}
