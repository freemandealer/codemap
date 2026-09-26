import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo } from './helpers.js';

// 临时目录中的进程替身只测试验收编排，不启动浏览器，不写真实验收目录。
const stub = `
const fs = require('node:fs');
const step = process.argv[3], scenario = process.env.CODEMAP_RELEASE_TEST;
fs.appendFileSync('calls.txt', step + '\\n');
if (scenario === 'command-failure' && step === 'test') process.exit(7);
if ((step === 'test:e2e' && scenario !== 'stale-report') || (step === 'test' && scenario === 'stale-report')) {
  const names = scenario === 'missing-engine' ? ['chromium', 'firefox'] : ['chromium', 'firefox', 'webkit'];
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/browser-results.json', JSON.stringify({
    stats: { expected: scenario === 'failed-interaction' ? 2 : names.length, skipped: scenario === 'skipped' ? 1 : 0, unexpected: scenario === 'failed-interaction' ? 1 : 0, flaky: 0 },
    suites: [{ specs: [{ tests: names.map(projectName => ({ projectName, results: [{ status: 'passed' }] })) }] }]
  }));
  if (scenario === 'stale-report') fs.utimesSync('artifacts/browser-results.json', new Date(0), new Date(0));
  if (scenario === 'failed-interaction') process.exit(2);
}
if (step === 'benchmark') {
  const browser = process.argv[process.argv.indexOf('--browser') + 1];
  fs.mkdirSync('artifacts/benchmark', { recursive: true });
  fs.writeFileSync('artifacts/benchmark/' + browser + '-results.json', JSON.stringify({
    passed: true, diagnosticProfile: false,
    environment: { browser, headless: scenario === 'mode-mismatch' || !process.argv.includes('--headed') }
  }));
}
`;
async function check(scenario: string, args: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), 'codemap-release-test-'));
  try {
    const npm = join(directory, 'npm-stub.cjs'); await writeFile(npm, stub);
    const child = spawnSync(process.execPath, [join(repo, 'scripts/verify-release.mjs'), ...args], { cwd: directory, encoding: 'utf8', timeout: 15_000, env: { ...process.env, npm_execpath: npm, CODEMAP_RELEASE_TEST: scenario } });
    assert.equal(child.status, scenario === 'headed-pass' ? 0 : 1, child.stdout + child.stderr);
    const latest = JSON.parse(await readFile(join(directory, 'artifacts/release/latest.json'), 'utf8'));
    const result = JSON.parse(await readFile(join(directory, 'artifacts/release', latest.report), 'utf8'));
    const evidence = await readFile(join(directory, 'artifacts/release', latest.run, 'browser-results.json'), 'utf8').catch(() => undefined);
    return { result, evidence, output: child.stdout + child.stderr, calls: (await readFile(join(directory, 'calls.txt'), 'utf8')).trim().split('\n') };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('完整验收保留非零退出码，命令失败后后续检查不启动', async () => {
  const { result, calls } = await check('command-failure');
  assert.deepEqual(calls, ['test']);
  assert.equal(result.automatedChecksPassed, false);
  assert.equal(result.steps[0].status, 'failed'); assert.equal(result.steps[0].exitCode, 7);
  assert.ok(result.steps.slice(1).every((step: { status: string }) => step.status === 'not-run'));
});

test('完整验收拒绝跳过用例或缺少引擎的浏览器报告，即使命令退出码为零', async () => {
  for (const scenario of ['skipped', 'missing-engine']) {
    const { result, calls } = await check(scenario);
    assert.equal(result.automatedChecksPassed, false);
    assert.equal(result.steps.find((step: { name: string }) => step.name === 'interaction').status, 'failed');
    assert.equal(calls.at(-1), 'test:e2e');
    assert.ok(result.steps.filter((step: { name: string }) => step.name.startsWith('benchmark')).every((step: { status: string }) => step.status === 'not-run'));
  }
});

test('完整验收在浏览器失败后仍归档证据，并直接打印失败项', async () => {
  const { result, evidence, output, calls } = await check('failed-interaction');
  assert.equal(result.steps.find((step: { name: string }) => step.name === 'interaction').exitCode, 2);
  assert.equal(JSON.parse(evidence!).stats.unexpected, 1);
  assert.match(output, /失败 interaction/); assert.match(output, /浏览器通过 2，失败 1/);
  assert.match(output, /后续 3 项未执行/); assert.equal(calls.at(-1), 'test:e2e');
});

test('完整验收不把上次残留的浏览器报告当作本次通过', async () => {
  const { result, output, evidence } = await check('stale-report');
  const step = result.steps.find((step: { name: string }) => step.name === 'interaction');
  assert.equal(step.exitCode, 0); assert.equal(step.status, 'failed');
  assert.match(output, /报告不是本次执行生成的/); assert.equal(evidence, undefined);
});

test('有窗口验收为三个基准传递显式模式，并保存一致的运行记录', async () => {
  const { result } = await check('headed-pass', ['--headed']);
  assert.equal(result.benchmarkMode, 'headed'); assert.equal(result.automatedChecksPassed, true);
  assert.equal(result.steps.filter((step: { name: string; command: string; status: string }) => step.name.startsWith('benchmark-') && step.command.endsWith('--headed') && step.status === 'passed').length, 3);
});

test('有窗口验收拒绝用无头报告代替，即使基准报告声称通过', async () => {
  const { result, output } = await check('mode-mismatch', ['--headed']);
  assert.equal(result.automatedChecksPassed, false);
  assert.match(output, /窗口模式或性能采集设置不匹配/);
  assert.equal(result.steps.find((step: { name: string }) => step.name === 'benchmark-firefox').status, 'not-run');
});
