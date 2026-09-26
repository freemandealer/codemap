export type ClaimStatus = 'source' | 'inferred' | 'unknown' | 'editorial';
export interface Entity {
  id: string; kind: 'function' | 'type' | 'interface' | 'state' | 'external' | 'concept';
  label: string; symbol?: string; canonicalNodeId: string; evidenceIds: string[];
}
export interface MapNode {
  id: string; parentId: string | null;
  kind: 'topic' | 'module' | 'mechanism' | 'function' | 'step' | 'code' | 'boundary';
  label: string; summary: string; entityIds: string[]; evidenceIds: string[];
  claimStatus: ClaimStatus; claimReason?: string; order: number;
  importance: 'primary' | 'supporting'; snippetIds: string[];
  details?: { inputs?: string[]; outputs?: string[]; invariants?: string[] };
}
export interface Port {
  id: string; entityId: string; label: string; kind: 'input' | 'output' | 'callsite' | 'interface'; detailNodeId?: string;
}
export type RelationType = 'call' | 'dispatch' | 'read' | 'write' | 'produce' | 'consume' | 'control' | 'ownership' | 'return' | 'dependency';
export interface Relation {
  id: string; sourceEntityId: string; targetEntityId: string; type: RelationType;
  label: string; role: 'main' | 'branch' | 'failure' | 'supporting';
  claimStatus: Exclude<ClaimStatus, 'editorial'>; claimReason?: string; evidenceIds: string[];
  condition?: string; sourcePortId?: string; targetPortId?: string;
}
export interface Flow {
  id: string; ownerNodeId: string; fromNodeId: string; toNodeId: string;
  kind: 'next' | 'branch' | 'loop' | 'exception'; label: string; evidenceIds: string[];
}
export interface Evidence {
  id: string; snapshotId: string; path: string; startLine: number; endLine: number;
  verification: 'matched' | 'unverified'; note?: string;
}
export type Segment = { kind: 'source'; startLine: number; endLine: number; text: string } |
  { kind: 'omission'; startLine: number; endLine: number; reason: string };
export interface Snippet {
  id: string; evidenceId: string; label: string; language: string; segments: Segment[]; preservedSemantics: string[];
}
export interface Snapshot {
  id: string; kind: 'git' | 'content'; revision?: string; dirty: boolean; repositoryUrl?: string;
  configuration: string[]; files: { path: string; sha256: string }[];
}
export interface CodeMap {
  schemaVersion: '0.1'; mapId: string; title: string; language: string;
  scope: { question: string; audience: string; viewpoint?: 'flow' | 'architecture'; inScope: string[]; outOfScope: string[]; assumptions: string[]; entryEntityIds: string[] };
  snapshot: Snapshot; rootNodeId: string; entities: Entity[]; nodes: MapNode[]; ports: Port[];
  relations: Relation[]; flows: Flow[]; evidence: Evidence[]; snippets: Snippet[]; primaryPath: string[];
  coverage: { completePaths: string[]; partialPaths: string[]; excludedPaths: string[]; openQuestions: string[] };
}
export interface Diagnostic { code: string; objectId?: string; pointer: string; message: string; hint: string; exitCode: 2 | 3 | 4 | 5 }
export interface ValidationReceipt {
  format: 'codemap-validation-1'; compilerVersion: string; inputSha256: string; snapshotId: string;
  passed: boolean; checks: { schema: boolean; references: boolean; sources: boolean };
  files: { path: string; sha256: string; lineCount: number }[]; matchedEvidenceIds: string[];
  diagnostics: Diagnostic[];
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface SceneNode {
  id: string; parentId: string | null; children: string[]; ancestors: string[]; depth: number;
  local: Rect; minExpandWidth: number; minExpandHeight: number; searchText: string;
}
export interface Scene { version: 'regions-1'; rootNodeId: string; nodes: Record<string, SceneNode> }
export interface BuildReceipt {
  format: 'codemap-build-1'; compilerVersion: string; layoutVersion: string; inputSha256: string;
  validationSha256: string; payloadSha256: string; runtimeSha256: string; styleSha256: string;
  shellSha256: string; artifactSha256: string; bytes: number;
}
export interface MapPayload { map: CodeMap; scene: Scene; validation: ValidationReceipt }
