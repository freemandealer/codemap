import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildHTML, inspectHTML, readAssets } from '../src/packager.js';
import { validateMap } from '../src/validator.js';
import { example, repo } from './helpers.js';

const assets = () => readAssets(pathToFileURL(join(repo, 'dist/')));
test('相同 IR、收据和运行时产生逐字节一致的离线 HTML', async () => { const map = await example(), receipt = await validateMap(map, repo), runtime = await assets(); const a = buildHTML(map, receipt, runtime), b = buildHTML(map, receipt, runtime); assert.equal(a.html, b.html); assert.deepEqual(inspectHTML(a.html), a.receipt); assert.ok(a.receipt.bytes < 5_000_000); assert.ok(!/<script[^>]+src=/i.test(a.html)); });
test('内嵌数据中的脚本闭合标签、HTML 和分隔符被当成文本', async () => {
  const map = await example(); map.title = '</script><img src=x onerror=alert(1)>\u2028&'; map.nodes[0].summary = '<svg onload=alert(1)>';
  const build = buildHTML(map, await validateMap(map, repo), await assets());
  assert.ok(!build.html.includes('<img src=x')); assert.ok(!build.html.includes('<svg onload=')); assert.ok(build.html.includes('\\u003c/script\\u003e')); assert.deepEqual(inspectHTML(build.html), build.receipt);
});
test('inspect 检测数据、样式、运行时与 HTML 外壳篡改', async () => { const map = await example(), built = buildHTML(map, await validateMap(map, repo), await assets());
  for (const altered of [built.html.replace('MiniFS', 'Tampered'), built.html.replace('<body>', '<body><script>alert(1)</script>'), built.html.replace('--bg:', '--changed:'), built.html.replace('id="codemap-runtime">', 'id="codemap-runtime">/*changed*/')]) assert.throws(() => inspectHTML(altered), /不匹配/);
});
test('CLI 失败保留旧 HTML；无效输入返回稳定错误码；bundle 可运行', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'codemap-build-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const mapPath = join(dir, 'map.json'), receipt = join(dir, 'validation.json'), out = join(dir, 'map.html');
  const cli = (...args: string[]) => spawnSync(process.execPath, [join(repo, 'dist/cli.js'), ...args], { encoding: 'utf8', cwd: repo });
  await writeFile(mapPath, JSON.stringify(await example()));
  assert.equal(cli('validate', mapPath, '--repo', repo, '--out', receipt, '--json').status, 0);
  const built = cli('build', mapPath, '--validation', receipt, '--out', out, '--json'); assert.equal(built.status, 0, built.stdout + built.stderr);
  const before = await readFile(out, 'utf8');
  const map = await example(); map.title = 'changed'; await writeFile(mapPath, JSON.stringify(map));
  const failed = cli('build', mapPath, '--validation', receipt, '--out', out, '--json'); assert.equal(failed.status, 3); assert.equal(JSON.parse(failed.stdout).diagnostics[0].code, 'E_VALIDATION_RECEIPT'); assert.equal(await readFile(out, 'utf8'), before);
  await writeFile(mapPath, '{'); assert.equal(cli('validate', mapPath, '--json').status, 2);
  assert.equal(cli('build', mapPath, '--unknown').status, 2); assert.equal(cli('inspect', out, '--json').status, 0);
});

test('CLI snapshot 和 extract 拒绝用输出覆盖读取的源码', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'codemap-readonly-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'sample.ts'), original = 'export const answer = 42;\n';
  await writeFile(source, original);
  await symlink(dir, join(dir, 'alias'));
  for (const command of ['snapshot', 'extract']) for (const output of [source, join(dir, 'alias/sample.ts')]) {
    const args = [command, '--repo', dir, '--file', 'sample.ts', '--out', output, '--json'];
    if (command === 'extract') args.push('--start', '1', '--end', '1');
    const result = spawnSync(process.execPath, [join(repo, 'dist/cli.js'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'E_OUTPUT_PATH');
    assert.equal(await readFile(source, 'utf8'), original);
  }
});
