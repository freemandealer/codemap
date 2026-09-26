import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalJSON, LIMITS } from './core.js';
import type { Diagnostic, Snapshot } from './types.js';

export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export class CodeMapError extends Error {
  constructor(public diagnostic: Diagnostic) { super(diagnostic.message); }
}
export function fail(code: string, message: string, exitCode: Diagnostic['exitCode'] = 3, pointer = '', objectId?: string): never {
  throw new CodeMapError({ code, message, exitCode, pointer, objectId, hint: '按诊断定位输入；重新提取或修正后再次校验。' });
}
export function safePath(path: string): boolean {
  return !!path && !isAbsolute(path) && !/[\\:\x00-\x1f]/u.test(path) && path.split('/').every(p => p !== '..' && p !== '.' && p !== '');
}
export function sourceAllowed(path: string): boolean {
  return !path.split('/').some(p => p === '.git' || p === '.ssh' || p === '.aws' || p === 'node_modules' || /^\.env(?:\.|$)/u.test(p) || /^(?:id_rsa|id_ed25519|credentials)$/u.test(p));
}
export function physicalLines(text: string): string[] {
  if (!text.length) return [];
  const lines = text.split(/\r\n|\n|\r/u);
  if (/(?:\n|\r)$/u.test(text)) lines.pop();
  return lines;
}
export async function readSource(repo: string, path: string): Promise<{ path: string; sha256: string; lines: string[]; bytes: number }> {
  if (!safePath(path) || !sourceAllowed(path)) fail('E_SOURCE_PATH', `拒绝范围外或敏感文件路径：${path}`, 3, '/snapshot/files');
  const root = await realpath(repo);
  const resolved = await realpath(resolve(root, path));
  const rel = relative(root, resolved);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('E_SOURCE_PATH', `符号链接越出输入目录：${path}`, 3, '/snapshot/files');
  if (!sourceAllowed(rel.split(sep).join('/'))) fail('E_SOURCE_PATH', `拒绝指向敏感文件的符号链接：${path}`, 3, '/snapshot/files');
  const info = await stat(resolved);
  if (!info.isFile() || info.size > LIMITS.fileBytes) fail('E_SOURCE_BUDGET', `不是常规文件或超过 ${LIMITS.fileBytes} 字节：${path}`, 4, '/snapshot/files');
  const bytes = await readFile(resolved);
  if (bytes.length > LIMITS.fileBytes) fail('E_SOURCE_BUDGET', `文件超过读取预算：${path}`, 4);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail('E_SOURCE_ENCODING', `不是有效 UTF-8：${path}`); }
  return { path, sha256: sha256(bytes), lines: physicalLines(text), bytes: bytes.length };
}
export function gitState(repo: string): { revision: string; dirty: boolean } | null {
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, maxBuffer: LIMITS.inputBytes }).trim();
  try { return { revision: git('rev-parse', '--verify', 'HEAD'), dirty: git('status', '--porcelain', '--untracked-files=normal').length > 0 }; }
  catch { return null; }
}
export async function createSnapshot(repo: string, files: string[], configuration: string[] = []): Promise<Snapshot> {
  const paths = [...new Set(files)].sort();
  if (!paths.length || paths.length > LIMITS.files) fail('E_FILE_BUDGET', `请选择 1–${LIMITS.files} 个输入文件。`, 4);
  const entries: Snapshot['files'] = []; let bytes = 0;
  for (const path of paths) {
    const file = await readSource(repo, path); bytes += file.bytes;
    if (bytes > LIMITS.totalFileBytes) fail('E_SOURCE_BUDGET', '输入文件总量超过预算。', 4);
    entries.push({ path, sha256: file.sha256 });
  }
  const git = gitState(repo);
  const content = { kind: git ? 'git' as const : 'content' as const, ...(git ?? { dirty: false }), configuration, files: entries };
  return { id: `snap-${sha256(canonicalJSON(content)).slice(0, 16)}`, ...content };
}
export async function extractSource(repo: string, path: string, startLine: number, endLine: number) {
  const file = await readSource(repo, path);
  if (!Number.isSafeInteger(startLine) || !Number.isSafeInteger(endLine) || startLine < 1 || endLine < startLine || endLine > file.lines.length) fail('E_SOURCE_RANGE', `行范围必须位于 1–${file.lines.length}。`);
  return { path, sha256: file.sha256, segment: { kind: 'source' as const, startLine, endLine, text: file.lines.slice(startLine - 1, endLine).join('\n') } };
}
