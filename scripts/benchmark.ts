import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus, platform, release, totalmem } from 'node:os';
import { parseArgs } from 'node:util';
import { chromium, firefox, webkit } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { benchmarkFixture } from './benchmark-fixture.js';
import { validateMap } from '../src/validator.js';
import { buildHTML, inspectHTML, readAssets } from '../src/packager.js';
import { isolateFileContext } from './offline-browser.js';
import { startBrowserProfile } from './browser-profile.js';

const { values } = parseArgs({ options: { browser: { type: 'string', default: 'chromium' }, profile: { type: 'boolean', default: false }, headed: { type: 'boolean', default: false }, channel: { type: 'string' } } });
const name = values.browser!;
if (!['chromium', 'firefox', 'webkit'].includes(name)) throw Error('--browser 只能是 chromium、firefox 或 webkit');
if (values.profile && name !== 'chromium') throw Error('--profile 当前仅支持 Chromium；正式验收不启用采集');
if (values.channel && (name !== 'chromium' || !['chrome', 'chromium'].includes(values.channel))) throw Error('--channel 只支持 Chromium 的 chrome / chromium 渠道');
const engine = { chromium, firefox, webkit }[name as 'chromium' | 'firefox' | 'webkit'];
const directory = resolve('artifacts/benchmark');
const map = await benchmarkFixture(directory);
const validation = await validateMap(map, directory);
if (!validation.passed) throw Error(JSON.stringify(validation.diagnostics));
const build = buildHTML(map, validation, await readAssets(pathToFileURL(resolve('dist/') + '/')));
inspectHTML(build.html);
for (const [file, value] of Object.entries({ 'map.codemap.json': map, 'validation.json': validation, 'build-receipt.json': build.receipt })) await writeFile(`${directory}/${file}`, JSON.stringify(value, null, 2) + '\n');
await writeFile(`${directory}/map.html`, build.html);
let browser: Browser;
try { browser = await engine.launch({ headless: !values.headed, ...(values.channel ? { channel: values.channel } : {}) }); }
catch (error) {
  const result = { passed: false, status: 'browser-unavailable', browser: name, measuredAt: new Date().toISOString(), fixture: { nodes: map.nodes.length, relations: map.relations.length, htmlBytes: build.receipt.bytes }, startup: null, gestures: null, error: error instanceof Error ? error.message : String(error) };
  await writeFile(`${directory}/${name}-results.json`, JSON.stringify(result, null, 2) + '\n');
  console.error(`性能未测量：${name} 无法启动。详见 artifacts/benchmark/${name}-results.json`);
  process.exit(1);
}
const percentile = (items: number[], p: number) => [...items].sort((a, b) => a - b)[Math.ceil(items.length * p) - 1];
const startupMs: number[] = [], errors: string[] = [], network: string[] = [];
let isolationMode = '';
let finishProfile: Awaited<ReturnType<typeof startBrowserProfile>> | undefined;
async function fileContext() {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const isolation = await isolateFileContext(context, name);
  isolationMode = isolation.mode;
  context.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  return context;
}
async function frameBaseline(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const samples: number[] = [];
    const start = performance.now(); let previous: number | undefined;
    await new Promise<void>(resolve => {
      function frame(now: number) {
        if (previous !== undefined) samples.push(now - previous);
        previous = now;
        if (now - start >= 2000) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    return { samplesMs: samples, visibility: document.visibilityState, focused: document.hasFocus() };
  });
}
try {
  const blankContext = await fileContext(), blankPage = await blankContext.newPage();
  await blankPage.setContent('<!doctype html><title>Frame baseline</title>');
  await blankPage.bringToFront();
  const blankFrames = await frameBaseline(blankPage);
  await blankContext.close();
  // 每次使用新的浏览器上下文；进程与操作系统文件缓存不清空，报告明确这一边界。
  for (let i = 0; i < 10; i++) {
    const context = await fileContext();
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(`${directory}/map.html`).href);
    await page.waitForFunction(() => document.querySelector('#stage')?.hasAttribute('data-frontier'));
    startupMs.push(await page.evaluate(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return performance.now();
    }));
    await context.close();
  }
  const context = await fileContext();
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(`${directory}/map.html`).href);
  await page.bringToFront();
  await page.waitForFunction(() => document.querySelector('#stage')?.hasAttribute('data-frontier'));
  const idleFrames = await frameBaseline(page);
  if (values.profile) finishProfile = await startBrowserProfile(page);
  const gestures = await page.evaluate(async () => {
    const stage = document.querySelector<HTMLElement>('#stage')!;
    const rect = stage.getBoundingClientRect();
    const frameMs: number[] = [], frontierStates = new Set<string>();
    let maxCards = 0, maxEdges = 0, lastMutation = 0, inputEvents = 0, zoomDelta = 0, absoluteZoomDelta = 0;
    const path: { elapsedMs: number; zoom: string; frontierCount: number }[] = [];
    let nextSample = 0, previousElapsed = 0;
    // 位移按经过的时间计算；低帧率不能让同一条缩放路径变短。
    const zoomDistance = (elapsed: number) => {
      const phase = elapsed % 6000;
      return (-Math.min(phase, 1800) + Math.min(Math.max(0, phase - 2600), 1800)) * 0.48;
    };
    const panDistance = (elapsed: number) => {
      const phase = elapsed % 6000;
      return phase < 5000 ? 0 : 30 * (1 - Math.cos((phase - 5000) / 1000 * 2 * Math.PI));
    };
    const observer = new MutationObserver(() => { lastMutation = performance.now(); });
    observer.observe(stage, { subtree: true, childList: true, attributes: true });
    const start = performance.now(); let previous: number | undefined;
    await new Promise<void>(resolve => {
      function frame(now: number) {
        if (previous !== undefined) frameMs.push(now - previous);
        previous = now;
        frontierStates.add(stage.dataset.frontier!);
        maxCards = Math.max(maxCards, document.querySelectorAll('.summary-card').length);
        maxEdges = Math.max(maxEdges, document.querySelectorAll('#edge-lines>path').length);
        const elapsed = Math.max(0, Math.min(30_000, now - start));
        if (elapsed >= nextSample) {
          path.push({ elapsedMs: elapsed, zoom: document.querySelector('#zoom-level')!.textContent!, frontierCount: stage.dataset.frontier!.split(',').length });
          nextSample += 500;
        }
        // 缩放、等待语义细化、反向缩放、平移；实际触发产品的输入处理器。
        const deltaY = zoomDistance(elapsed) - zoomDistance(previousElapsed);
        const deltaX = panDistance(elapsed) - panDistance(previousElapsed);
        if (deltaY) {
          stage.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, bubbles: true, cancelable: true }));
          inputEvents++; zoomDelta += deltaY; absoluteZoomDelta += Math.abs(deltaY);
        }
        if (deltaX) {
          const mode = document.querySelector<HTMLSelectElement>('#wheel-mode')!;
          mode.value = 'pan';
          stage.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY: 0, bubbles: true, cancelable: true }));
          mode.value = 'zoom';
          inputEvents++;
        }
        previousElapsed = elapsed;
        if (elapsed >= 30_000) { resolve(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    const stopped = performance.now();
    await new Promise(resolve => setTimeout(resolve, 250));
    observer.disconnect();
    return { frameMs, frontierStates: frontierStates.size, maxCards, maxEdges, stopToLastMutationMs: Math.max(0, lastMutation - stopped), durationMs: stopped - start, input: { inputEvents, zoomDelta, absoluteZoomDelta, zoomPixelsPerSecond: 480 }, path };
  });
  if (finishProfile) { await finishProfile(`${directory}/chromium-trace.json`); finishProfile = undefined; }
  const checks = {
    startupP95: percentile(startupMs, .95) <= 2000,
    frameP95: percentile(gestures.frameMs, .95) <= 33,
    stoppedUpdates: gestures.stopToLastMutationMs <= 150,
    cardBudget: gestures.maxCards <= 80, edgeBudget: gestures.maxEdges <= 200,
    semanticChanges: gestures.frontierStates > 1, offline: network.length === 0, runtime: errors.length === 0,
  };
  const report = {
    passed: Object.values(checks).every(Boolean), checks,
    environment: { measuredAt: new Date().toISOString(), node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, memoryGiB: totalmem() / 2 ** 30, browser: name, browserVersion: browser.version(), channel: values.channel ?? 'default', viewport: { width: 1440, height: 900 }, headless: !values.headed, networkIsolation: isolationMode },
    fixture: { nodes: map.nodes.length, relations: map.relations.length, htmlBytes: build.receipt.bytes, artifactSha256: build.receipt.artifactSha256 },
    startup: { samplesMs: startupMs, medianMs: percentile(startupMs, .5), p95Ms: percentile(startupMs, .95) },
    gestures: { ...gestures, frameMedianMs: percentile(gestures.frameMs, .5), frameP95Ms: percentile(gestures.frameMs, .95) },
    baseline: { blank: { ...blankFrames, p95Ms: percentile(blankFrames.samplesMs, .95) }, idleMap: { ...idleFrames, p95Ms: percentile(idleFrames.samplesMs, .95) } },
    diagnosticProfile: values.profile,
    errors, network,
    limitations: ['合成压力样例；不证明真实项目解释质量。', '10 次新浏览器上下文打开；浏览器进程和操作系统缓存未清空。', '手势为 30 秒脚本化 wheel 输入；帧时间来自 requestAnimationFrame，不是物理触控板延迟。', '停止更新延迟为输入停止后 250ms 观察窗内的最后一次 DOM 变动；不等于光子显示延迟。', '自动化结果不能替代实际触控板和触屏人工验收；有窗口与无头模式分别记录，不相互替代。'],
  };
  await writeFile(`${directory}/${name}-results.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, baseline: { blank: { ...report.baseline.blank, samplesMs: `${blankFrames.samplesMs.length} samples; see results JSON` }, idleMap: { ...report.baseline.idleMap, samplesMs: `${idleFrames.samplesMs.length} samples; see results JSON` } }, gestures: { ...report.gestures, path: `${gestures.path.length} samples; see results JSON`, frameMs: `${gestures.frameMs.length} samples; see results JSON` } }, null, 2));
  if (!report.passed) process.exitCode = 1;
  await context.close();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await writeFile(`${directory}/${name}-results.json`, JSON.stringify({
    passed: false, status: 'measurement-failed', browser: name, measuredAt: new Date().toISOString(),
    fixture: { nodes: map.nodes.length, relations: map.relations.length, htmlBytes: build.receipt.bytes },
    startup: { samplesMs: startupMs, complete: startupMs.length === 10 }, gestures: null,
    networkIsolation: isolationMode, errors, network, error: message,
  }, null, 2) + '\n');
  console.error(`性能测量失败：${message}`); process.exitCode = 1;
} finally {
  if (finishProfile) await finishProfile(`${directory}/chromium-trace.json`);
  await browser.close();
}
