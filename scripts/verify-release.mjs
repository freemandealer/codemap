import { mkdir, writeFile, readFile, open, stat, cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { headed: { type: 'boolean', default: false }, list: { type: 'boolean', default: false } } });

const steps = [
  { name: 'unit', args: ['run', 'test'] },
  { name: 'maps', args: ['run', 'demo'] },
  { name: 'skill', args: ['run', 'package:skill'] },
  { name: 'browsers', args: ['run', 'check:browsers', ...(values.headed ? ['--', '--headed'] : [])] },
  { name: 'interaction', args: ['run', 'test:e2e'] },
  ...['chromium', 'firefox', 'webkit'].map(browser => ({ name: `benchmark-${browser}`, args: ['run', 'benchmark', '--', '--browser', browser, ...(values.headed ? ['--headed'] : [])] })),
];
if (values.list) {
  console.log(steps.map(step => `${step.name}: npm ${step.args.join(' ')}`).join('\n'));
  process.exit(0);
}
const npm = process.env.npm_execpath;
if (!npm) throw Error('请使用 npm run verify:release，以便使用当前 npm 执行各检查。');
const startedAt = new Date().toISOString(), run = startedAt.replace(/[:.]/g, '-');
const directory = resolve('artifacts/release', run);
await mkdir(directory, { recursive: true });
const result = {
  startedAt, node: process.version, benchmarkMode: values.headed ? 'headed' : 'headless', automatedChecksPassed: false,
  manualAcceptance: '尚需独立读者、实际触控板和触屏验收；自动检查成功不代表整体验收完成。',
  steps: steps.map(step => ({ name: step.name, command: `npm ${step.args.join(' ')}`, status: 'not-run' })),
};
async function save() {
  await writeFile(`${directory}/results.json`, JSON.stringify(result, null, 2) + '\n');
  await writeFile('artifacts/release/latest.json', JSON.stringify({ run, report: `${run}/results.json` }, null, 2) + '\n');
}
async function collectEvidence(step, started) {
  const interaction = step.name === 'interaction', benchmark = step.name.startsWith('benchmark-');
  if (!interaction && !benchmark) return;
  const browser = step.name.slice('benchmark-'.length);
  const source = interaction ? 'artifacts/browser-results.json' : `artifacts/benchmark/${browser}-results.json`;
  if ((await stat(source)).mtimeMs < started) throw Error(`报告不是本次执行生成的：${source}`);
  const body = await readFile(source, 'utf8'), report = JSON.parse(body);
  await writeFile(`${directory}/${interaction ? 'browser-results.json' : `${browser}-benchmark.json`}`, body);
  if (interaction) {
    for (const [path, target] of [['test-results', 'test-results'], ['artifacts/browser', 'browser']]) {
      try { await cp(path, `${directory}/${target}`, { recursive: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return report;
}
await save();
for (const [index, step] of steps.entries()) {
  const record = result.steps[index], log = await open(`${directory}/${step.name}.log`, 'wx');
  const started = Date.now(); record.status = 'running'; await save();
  console.log(`检查 ${step.name}；日志 artifacts/release/${run}/${step.name}.log`);
  try {
    const outcome = await new Promise(resolve => {
      const child = spawn(process.execPath, [npm, ...step.args], { stdio: ['ignore', log.fd, log.fd] });
      child.once('error', error => resolve({ exitCode: null, error: error.message }));
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    Object.assign(record, outcome, { durationMs: Date.now() - started });
    let report;
    try { report = await collectEvidence(step, started); }
    catch (error) { record.evidenceError = error instanceof Error ? error.message : String(error); }
    if (step.name === 'interaction' && report) record.browserStats = report.stats;
    if (outcome.exitCode !== 0) {
      const detail = record.browserStats ? `；浏览器通过 ${record.browserStats.expected}，失败 ${record.browserStats.unexpected}，跳过 ${record.browserStats.skipped}` : '';
      throw Error((outcome.error ?? `进程返回 ${outcome.exitCode}，信号 ${outcome.signal ?? '无'}`) + detail);
    }
    if (record.evidenceError) throw Error(record.evidenceError);
    if (step.name === 'interaction') {
      const tests = [];
      const visit = suite => { for (const spec of suite.specs ?? []) tests.push(...spec.tests); for (const child of suite.suites ?? []) visit(child); };
      report.suites.forEach(visit);
      if (!tests.length || tests.some(t => t.results.at(-1)?.status !== 'passed') || report.stats.skipped || report.stats.unexpected || report.stats.flaky) throw Error('浏览器用例存在缺失、跳过、失败或不稳定结果');
      if (['chromium', 'firefox', 'webkit'].some(name => !tests.some(t => t.projectName === name))) throw Error('浏览器报告未覆盖三个要求的引擎');
      record.evidence = { tests: tests.length, projects: [...new Set(tests.map(t => t.projectName))] };
    }
    if (step.name.startsWith('benchmark-')) {
      if (report.passed !== true) throw Error('基准报告未通过');
      if (report.environment?.browser !== step.name.slice('benchmark-'.length) || report.environment?.headless !== !values.headed || report.diagnosticProfile !== false) throw Error('基准引擎、窗口模式或性能采集设置不匹配');
    }
    record.status = 'passed';
    console.log(`通过 ${step.name}（${(record.durationMs / 1000).toFixed(1)} 秒）`);
  } catch (error) {
    record.status = 'failed'; record.error = error instanceof Error ? error.message : String(error);
    console.error(`失败 ${step.name}：${record.error}`);
    console.error(`详情：${directory}/${step.name}.log`);
    process.exitCode = 1;
  } finally { await log.close(); await save(); }
  if (record.status === 'failed') break;
}
result.automatedChecksPassed = result.steps.every(step => step.status === 'passed');
result.finishedAt = new Date().toISOString();
await save();
console.log(result.automatedChecksPassed ? '自动检查全部通过；读者与实际设备验收仍需另行完成。' : `验收未通过；后续 ${result.steps.filter(step => step.status === 'not-run').length} 项未执行。`);
console.log(`检查记录：${directory}/results.json`);
if (!result.automatedChecksPassed) process.exitCode = 1;
