import { chromium, firefox, webkit } from '@playwright/test';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { headed: { type: 'boolean', default: false } } });

// 环境检查失败立即停止，避免让整套用例重复同一个启动错误。
const checks = [];
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  let browser;
  try {
    browser = await engine.launch({ timeout: 15_000, headless: !values.headed });
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    await page.setContent('<!doctype html><p id="ready">ready</p>');
    if (await page.locator('#ready').textContent() !== 'ready') throw Error('无法读取测试页面');
    checks.push({ browser: name, passed: true, version: browser.version(), headless: !values.headed });
  } catch (error) {
    checks.push({ browser: name, passed: false, error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
  if (process.exitCode) break;
}
console.log(JSON.stringify({ passed: checks.length === 3 && checks.every(c => c.passed), checkedAt: new Date().toISOString(), checks }, null, 2));
