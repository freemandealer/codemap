#!/usr/bin/env node
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { LIMITS, VERSION } from './core.js';
import { CodeMapError, createSnapshot, extractSource, fail } from './source.js';
import { validateMap } from './validator.js';
import { buildHTML, inspectHTML, readAssets, writeAtomic } from './packager.js';
import type { CodeMap, ValidationReceipt } from './types.js';

const help = `CodeMap ${VERSION} — 从源码证据构建离线代码地图（Node.js 22+）

codemap validate <map.json> --repo <目录> [--out validation.json] [--json]
codemap build <map.json> --validation <validation.json> --out <map.html> [--repo <目录>] [--json]
codemap inspect <map.html> [--json]
codemap snapshot --repo <目录> --file <相对文件> [--file <相对文件>] [--out snapshot.json]
codemap extract --repo <目录> --file <相对文件> --start <行号> --end <行号> [--out segment.json]

validate 必须读取源码。build 消费匹配收据并重查 IR；附加 --repo 时也重新核对源码。
源码与解释均由宿主 Agent 选定；CLI 不调用模型、不执行目标项目脚本。
退出码：0 成功，2 输入错误，3 引用/源码不符，4 预算超限，5 I/O 错误。
`;
async function readBounded(path: string, limit: number = LIMITS.inputBytes) {
  const info = await stat(path); if (!info.isFile() || info.size > limit) fail('E_INPUT_BUDGET', '输入不是普通文件或超过字节预算。', 4);
  const text = await readFile(path, 'utf8'); if (Buffer.byteLength(text) > limit) fail('E_INPUT_BUDGET', '输入超过字节预算。', 4); return text;
}
async function readJSON(path: string): Promise<unknown> {
  const text = await readBounded(path);
  try { return JSON.parse(text); } catch { fail('E_JSON', `无效 JSON：${path}`, 2); }
}
async function destination(path: string): Promise<string> {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(absolute) === absolute) throw error;
    return join(await destination(dirname(absolute)), basename(absolute));
  }
}
async function main() {
  let args;
  try { args = parseArgs({ allowPositionals: true, options: { repo: { type: 'string' }, validation: { type: 'string' }, out: { type: 'string' }, receipt: { type: 'string' }, json: { type: 'boolean' }, file: { type: 'string', multiple: true }, start: { type: 'string' }, end: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' } } }); }
  catch (err) { fail('E_ARGUMENT', String(err), 2); }
  const { positionals, values: v } = args;
  if (v.version) { console.log(VERSION); return; }
  if (v.help || !positionals.length) { console.log(help); return; }
  const [command, input] = positionals;
  const allowed: Record<string, string[]> = { validate: ['repo', 'out', 'json'], build: ['repo', 'validation', 'out', 'receipt', 'json'], inspect: ['json'], snapshot: ['repo', 'file', 'out', 'json'], extract: ['repo', 'file', 'start', 'end', 'out', 'json'] };
  if (!allowed[command] || Object.keys(v).some(key => !allowed[command].includes(key)) || positionals.length > (['snapshot', 'extract'].includes(command) ? 1 : 2)) fail('E_ARGUMENT', '子命令或参数无效。运行 codemap --help 查看用法。', 2);
  const required = (value: string | undefined, label: string) => value || fail('E_ARGUMENT', `缺少 ${label}。`, 2);
  const protect = async (outputs: string[], inputs: string[]) => {
    const all = await Promise.all(outputs.map(destination)), sources = await Promise.all(inputs.map(destination));
    if (new Set(all).size !== all.length || all.some(p => sources.includes(p))) fail('E_OUTPUT_PATH', '输出不能覆盖输入、验证收据或其他产物。', 2);
  };
  const emit = async (result: unknown) => { const json = JSON.stringify(result, null, 2) + '\n'; if (v.out) await writeAtomic(v.out, json); console.log(v.json || !v.out ? json.trimEnd() : `已写入 ${v.out}`); };
  if (command === 'snapshot') {
    const repo = required(v.repo, '--repo');
    if (v.out) await protect([v.out], (v.file ?? []).map(file => resolve(repo, file)));
    await emit(await createSnapshot(repo, v.file ?? [])); return;
  }
  if (command === 'extract') {
    if (v.file?.length !== 1) fail('E_ARGUMENT', 'extract 需要一个 --file。', 2);
    const repo = required(v.repo, '--repo');
    if (v.out) await protect([v.out], [resolve(repo, v.file[0])]);
    await emit(await extractSource(repo, v.file[0], Number(required(v.start, '--start')), Number(required(v.end, '--end')))); return;
  }
  const path = required(input, '输入路径');
  if (command === 'validate') {
    if (v.out) await protect([v.out], [path]);
    const result = await validateMap(await readJSON(path), v.repo); await emit(result);
    process.exitCode = result.passed ? 0 : result.diagnostics[0]?.exitCode ?? 3; return;
  }
  if (command === 'build') {
    const validationPath = required(v.validation, '--validation'), out = required(v.out, '--out'), receiptOut = v.receipt ?? join(dirname(out), 'build-receipt.json');
    await protect([out, receiptOut], [path, validationPath]);
    const map = await readJSON(path) as CodeMap, validation = await readJSON(validationPath) as ValidationReceipt;
    if (v.repo) { const current = await validateMap(map, v.repo); if (!current.passed) throw new CodeMapError(current.diagnostics[0]); }
    const result = buildHTML(map, validation, await readAssets());
    if (v.repo) await protect([out, receiptOut], map.snapshot.files.map(file => resolve(v.repo!, file.path)));
    // Inspect candidate before replacing the previous valid HTML.
    inspectHTML(result.html);
    await writeAtomic(receiptOut, JSON.stringify(result.receipt, null, 2) + '\n');
    await writeAtomic(out, result.html);
    console.log(v.json ? JSON.stringify(result.receipt, null, 2) : `已生成 ${out}（${result.receipt.bytes} 字节）；构建收据 ${receiptOut}`); return;
  }
  const result = inspectHTML(await readBounded(path, LIMITS.htmlBytes));
  console.log(v.json ? JSON.stringify(result, null, 2) : `产物完整 · CodeMap ${result.compilerVersion} · ${result.bytes} 字节\n${result.artifactSha256}`);
}
main().catch(err => {
  const diagnostic = err instanceof CodeMapError ? err.diagnostic : { code: 'E_IO', pointer: '', message: err instanceof Error ? err.message : String(err), hint: '检查输入路径和输出目录权限。', exitCode: 5 };
  if (process.argv.includes('--json')) console.log(JSON.stringify({ passed: false, diagnostics: [diagnostic] }, null, 2));
  else console.error(`${diagnostic.code} ${diagnostic.pointer}: ${diagnostic.message}\n${diagnostic.hint}`);
  process.exitCode = diagnostic.exitCode;
});
