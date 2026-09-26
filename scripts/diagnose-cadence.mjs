import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// 环境对照，不替代地图的正式性能验收；原始采样独立保存。
const cases = [
  ['chromium-shell', chromium, {}],
  ['chromium-new-headless', chromium, { channel: 'chromium' }],
  ['chromium-headed', chromium, { channel: 'chromium', headless: false }],
  ['system-chrome-headless', chromium, { channel: 'chrome' }],
  ['system-chrome-headed', chromium, { channel: 'chrome', headless: false }],
  ['firefox', firefox, {}],
  ['webkit', webkit, {}],
];
const results = [];
const selected = process.argv.slice(2);
if (selected.some(name => !cases.some(item => item[0] === name))) throw Error('未知浏览器对照项');
for (const [name, engine, options] of cases.filter(item => !selected.length || selected.includes(item[0]))) {
  let browser;
  try {
    browser = await engine.launch(options);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent('<!doctype html><title>CodeMap frame cadence probe</title><body style="height:40000px;background:linear-gradient(white,#497)"><p>CodeMap 刷新节奏对照</p></body>');
    await page.bringToFront();
    const measure = () => page.evaluate(async () => {
      const samples = [], start = performance.now(); let previous;
      await new Promise(resolve => {
        function frame(now) {
          if (previous !== undefined) samples.push(now - previous);
          previous = now;
          if (now - start >= 2000) resolve(); else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      return { samples, visibility: document.visibilityState, scrollY };
    });
    const idle = await measure();
    await page.mouse.move(600, 400);
    const active = measure(), start = Date.now();
    while (Date.now() - start < 2100) {
      await page.mouse.wheel(0, 8);
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    const wheel = await active;
    const p95 = phase => [...phase.samples].sort((a, b) => a - b)[Math.ceil(phase.samples.length * .95) - 1];
    const result = { name, version: browser.version(), options, idle: { ...idle, p95Ms: p95(idle) }, wheel: { ...wheel, p95Ms: p95(wheel) } };
    results.push(result);
    console.log(JSON.stringify({ name, version: result.version, idleP95: result.idle.p95Ms, wheelP95: result.wheel.p95Ms, scrollY: wheel.scrollY }));
  } catch (error) { results.push({ name, error: String(error) }); console.error(name, String(error)); process.exitCode = 1; }
  finally { if (browser) await browser.close(); }
}
await mkdir('artifacts/benchmark/diagnostics', { recursive: true });
await writeFile(`artifacts/benchmark/diagnostics/cadence${selected.length ? '-' + selected.join('-') : ''}.json`, JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2) + '\n');
