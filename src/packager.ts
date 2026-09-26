import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalJSON, compileLayout, LIMITS, VERSION } from './core.js';
import { CodeMapError, fail, sha256 } from './source.js';
import { validateReceipt, validateStructure } from './validator.js';
import type { BuildReceipt, CodeMap, MapPayload, ValidationReceipt } from './types.js';

export const safeJSON = (value: unknown) => canonicalJSON(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const receiptMarker = '__CODEMAP_BUILD_RECEIPT__';
export async function readAssets(base = new URL('.', import.meta.url)) {
  return { js: await readFile(new URL('viewer.js', base), 'utf8'), css: await readFile(new URL('viewer.css', base), 'utf8') };
}
export function buildHTML(map: CodeMap, receipt: ValidationReceipt, assets: { js: string; css: string }): { html: string; receipt: BuildReceipt; payload: MapPayload } {
  const diagnostics = validateStructure(map);
  if (diagnostics.length) throw new CodeMapError(diagnostics[0]);
  validateReceipt(map, receipt);
  if (/<\/script/i.test(assets.js) || /<\/style/i.test(assets.css)) fail('E_RUNTIME', '运行时包含不允许的 HTML 终止标记。', 2);
  const payload: MapPayload = { map, scene: compileLayout(map), validation: receipt };
  const data = safeJSON(payload);
  const shell = `<!doctype html>
<html lang="${escapeHTML(map.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(map.title)} · CodeMap</title><style id="codemap-style">${assets.css}</style></head>
<body><div id="app"><noscript>这份地图需要 JavaScript 才能缩放和搜索；所有数据与源码都已内嵌，不需要网络。</noscript></div><script id="codemap-data" type="application/json">${data}</script><script id="codemap-build" type="application/json">${receiptMarker}</script><script id="codemap-runtime">${assets.js}</script></body></html>\n`;
  const manifest = { format: 'codemap-build-1' as const, compilerVersion: VERSION, layoutVersion: payload.scene.version, inputSha256: sha256(canonicalJSON(map)), validationSha256: sha256(canonicalJSON(receipt)), payloadSha256: sha256(data), runtimeSha256: sha256(assets.js), styleSha256: sha256(assets.css), shellSha256: sha256(shell) };
  const html = shell.replace(receiptMarker, safeJSON(manifest));
  if (Buffer.byteLength(html) > LIMITS.htmlBytes) fail('E_HTML_BUDGET', 'HTML 超过 5MB；请减少所选代码或拆分阅读目标。', 4);
  return { html, payload, receipt: { ...manifest, artifactSha256: sha256(html), bytes: Buffer.byteLength(html) } };
}
export function inspectHTML(html: string): BuildReceipt {
  if (Buffer.byteLength(html) > LIMITS.htmlBytes) fail('E_HTML_BUDGET', '产物超过读取预算。', 4);
  function content(tag: 'style' | 'script', id: string, json = false) {
    const start = `<${tag} id="${id}"${json ? ' type="application/json"' : ''}>`;
    const at = html.indexOf(start), end = html.indexOf(`</${tag}>`, at + start.length);
    if (at < 0 || end < 0 || html.indexOf(start, at + 1) !== -1) fail('E_ARTIFACT', `产物区块缺失或重复：${id}`, 2);
    return { text: html.slice(at + start.length, end), start: at + start.length, end };
  }
  try {
    const data = content('script', 'codemap-data', true), runtime = content('script', 'codemap-runtime'), style = content('style', 'codemap-style'), build = content('script', 'codemap-build', true);
    const receipt = JSON.parse(build.text) as Omit<BuildReceipt, 'bytes' | 'artifactSha256'>;
    const payload = JSON.parse(data.text) as MapPayload;
    const shell = html.slice(0, build.start) + receiptMarker + html.slice(build.end);
    if (receipt.format !== 'codemap-build-1' || receipt.compilerVersion !== VERSION || receipt.payloadSha256 !== sha256(data.text) || receipt.runtimeSha256 !== sha256(runtime.text) || receipt.styleSha256 !== sha256(style.text) || receipt.shellSha256 !== sha256(shell) || receipt.inputSha256 !== sha256(canonicalJSON(payload.map)) || receipt.validationSha256 !== sha256(canonicalJSON(payload.validation))) fail('E_ARTIFACT_INTEGRITY', '产物内容与构建清单不匹配。', 3);
    const diagnostics = validateStructure(payload.map); if (diagnostics.length) throw new CodeMapError(diagnostics[0]);
    validateReceipt(payload.map, payload.validation);
    if (canonicalJSON(compileLayout(payload.map)) !== canonicalJSON(payload.scene)) fail('E_ARTIFACT_LAYOUT', '产物布局与地图不匹配。', 3);
    return { ...receipt, artifactSha256: sha256(html), bytes: Buffer.byteLength(html) };
  } catch (err) { if (err instanceof CodeMapError) throw err; fail('E_ARTIFACT', '无法解析 CodeMap HTML 产物。', 2); }
}
export async function writeAtomic(path: string, content: string): Promise<void> {
  const target = resolve(path); await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: 'wx' }); await rename(temporary, target); }
  finally { await unlink(temporary).catch(() => {}); }
}
