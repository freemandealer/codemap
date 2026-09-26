import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { buildHTML, readAssets } from '../../src/packager.js';
import { validateMap } from '../../src/validator.js';
import { example, repo } from '../helpers.js';
import { isolateFileContext } from '../../scripts/offline-browser.js';

const url = pathToFileURL(resolve('artifacts/minifs/map.html')).href;
test('架构视角：模块概览、接口源码、反向读写联系与导读', async ({ page, context, browserName }, info) => {
  const isolation = await isolateFileContext(context, browserName);
  info.annotations.push({ type: 'network-isolation', description: isolation.mode });
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  const architectureURL = pathToFileURL(resolve('artifacts/minifs-architecture/map.html')).href;
  await page.goto(architectureURL);
  await expect(page.locator('.map-context .eyebrow')).toHaveText('架构视角');
  await expect(page.locator('.summary-card.module')).toHaveCount(4);
  await expect(page.locator('.route-section > p')).toContainText('模块与联系');
  await mkdir('artifacts/browser', { recursive: true });
  await page.screenshot({ path: `artifacts/browser/${browserName}-architecture.png` });
  await page.locator('[data-outline-node="n-backend"]').click();
  await page.locator('[data-outline-node="n-ops"]').click();
  await expect(page.locator('#details .snippet').first()).toContainText('struct FileOps');
  await page.goto(architectureURL + '#v=1&relation=r-backend-file');
  await expect(page.locator('#details')).toContainText('后端写入 File.ready');
  await expect(page.locator('#details')).toContainText('backend_failure 为 0');
  await page.locator('#relation-list').click();
  await expect(page.locator('#details h2')).toHaveText('实体关系 · 9');
  await expect(page.locator('#details')).toContainText('依赖');
  await page.goto(architectureURL);
  await page.locator('#route-start').click();
  await page.locator('.route-next').click();
  await expect(page.locator('#details h2')).toHaveText('后端协议与实现');
  expect(errors).toEqual([]); expect(requests.filter(request => /^https?:/.test(request))).toEqual([]);
  expect(isolation.blockedRequests).toEqual([]);
});

test('file:// 离线阅读、四种内容深入、源码原文与省略说明', async ({ page, context, browserName }, info) => {
  const isolation = await isolateFileContext(context, browserName);
  info.annotations.push({ type: 'network-isolation', description: isolation.mode });
  if (browserName === 'webkit') {
    // 用独立页面证明请求由阻断器拒绝；仅依赖请求失败会把 DNS 失败误算为阻断成功。
    const probe = await context.newPage(), probeURL = 'https://codemap-offline-probe.invalid/';
    try {
      await expect(probe.goto(probeURL)).rejects.toThrow();
      expect(isolation.blockedRequests).toEqual([probeURL]);
    } finally { await probe.close(); }
    isolation.blockedRequests.length = 0;
  }
  const errors: string[] = [], requests: string[] = [], map = await example();
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  await page.goto(url); await expect(page.locator('#title')).toContainText('MiniFS');
  await expect(page.locator('.map-context .eyebrow')).toHaveText('流程视角');
  await expect(page.locator('.summary-card')).toHaveCount(4);
  for (const id of ['n-entry', 'n-open', 'n-dispatch', 'n-dispatch-code']) {
    await page.locator(`[data-node="${id}"] .card-title`).dblclick();
    const label = map.nodes.find(node => node.id === id)!.label;
    await expect(page.locator('#breadcrumbs [aria-current="location"]')).toHaveText(label);
    await expect(page.locator('#details h2')).toHaveText(label);
  }
  await expect(page.locator('#details .snippet code').first()).toBeVisible();
  await expect(page.locator('#details .code-path').first()).toContainText('minifs.c');
  await page.goto(url + '#v=1&node=n-open'); await expect(page.locator('#details .omission')).toContainText('63');
  await expect(page.locator('#details')).toContainText('release_file');
  expect(errors).toEqual([]); expect(requests.filter(request => /^https?:/.test(request))).toEqual([]);
  expect(isolation.blockedRequests).toEqual([]);
});
test('搜索、键盘、上层、历史与失效深链接', async ({ page }) => {
  await page.goto(url); await page.keyboard.press('/'); await expect(page.locator('#search')).toBeFocused();
  await page.locator('#search').fill('backend_open'); await page.locator('#search-results button').first().click();
  await expect(page.locator('#details')).toContainText('backend');
  await page.locator('#fit').click(); await expect(page.locator('#breadcrumbs')).toContainText('MiniFS');
  await page.locator('[data-outline-node="n-entry"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#stage')).toHaveAttribute('data-expanded', /n-entry/);
  await page.keyboard.press('Escape'); await expect(page.locator('#stage')).toHaveAttribute('data-frontier', /n-path/);
  await page.goto(url + '#v=1&node=gone'); await expect(page.locator('#toast')).toContainText('失效'); await expect(page.locator('.summary-card')).toHaveCount(4);
  await page.goto(url + '#v=1&node=n-open'); await page.locator('#up').click(); await page.goBack(); await expect(page.locator('#details h2')).toHaveText('minifs_open');
});
test('滚轮会切换语义层次，往返不丢关系；代码滚动不改变相机', async ({ page }) => {
  await page.goto(url); const stage = page.locator('#stage'), box = (await stage.boundingBox())!;
  const before = await stage.getAttribute('data-frontier'); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -600); await page.waitForTimeout(240);
  await expect(stage).not.toHaveAttribute('data-frontier', before!);
  await expect(stage).toHaveAttribute('data-relation-total', '4');
  await page.locator('#fit').click(); await expect(stage).toHaveAttribute('data-frontier', before!);
  await page.goto(url + '#v=1&node=n-open'); const level = await page.locator('#zoom-level').textContent(); await page.locator('#details .code-scroll').first().hover(); await page.mouse.wheel(0, 220); await expect(page.locator('#zoom-level')).toHaveText(level!);
});
test('关系成员、条件与原文证据可以定位和分享', async ({ page }) => {
  await page.goto(url + '#v=1&relation=r-open-dispatch'); await expect(page.locator('#details')).toContainText('分派');
  await expect(page.locator('#details .evidence-item').first()).toBeVisible();
  await page.locator('#share').click(); await expect(page.locator('#share-url')).toHaveValue(/relation=r-open-dispatch/); await expect(page.locator('#share-note')).toContainText('本地');
  await expect(page.locator('#embed-code')).toHaveValue(/sandbox="allow-scripts/); await page.locator('#close-share').click();
  await page.locator('#relation-list').click(); await expect(page.locator('#details h2')).toHaveText('实体关系 · 4'); await expect(page.locator('#details')).toContainText('局部流程 · 9');
});
test('慢速双击仍能进入；从函数连续缩小能恢复主题坐标系', async ({ page }) => {
  await page.goto(url);
  await page.locator('[data-node="n-entry"] .card-title').dblclick({ delay: 80 });
  await expect(page.locator('#details h2')).toHaveText('打开请求的责任');
  await page.goto(url + '#v=1&node=n-open');
  await page.locator('#stage').hover();
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(180); }
  await expect(page.locator('#scope-label')).toContainText('主题 /');
});
test('注入文本不会执行，减少动态效果与窄屏均能阅读', async ({ page }) => {
  const map = await example(); map.title = '</script><script>globalThis.injected=true</script>'; map.nodes[0].summary = '<img src=x onerror="globalThis.injected=true">';
  const built = buildHTML(map, await validateMap(map, repo), await readAssets(pathToFileURL(resolve('dist/') + '/')));
  await mkdir('artifacts/browser', { recursive: true }); const path = resolve('artifacts/browser/injection.html'); await writeFile(path, built.html);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(pathToFileURL(path).href);
  await expect(page.locator('#title')).toHaveText(map.title); expect(await page.evaluate(() => (globalThis as any).injected)).toBeUndefined();
  expect(await page.locator('img').count()).toBe(0); await expect(page.locator('#details')).toContainText('<img');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('静态托管 iframe 默认归还页面滚动，激活后缩放，Escape 退出', async ({ page }, info) => {
  const html = await readFile(resolve('artifacts/minifs/map.html'));
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(req.url?.startsWith('/map.html') ? html : '<!doctype html><html><body style="height:2200px"><h1>Article</h1><iframe title="map" src="/map.html#v=1&node=n-open" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" style="width:100%;height:700px"></iframe></body></html>'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const frame = page.frameLocator('iframe');
  try {
    await page.goto(`http://127.0.0.1:${address.port}`); await expect(frame.locator('#explore-overlay')).toBeVisible(); await expect(frame.locator('#details h2')).toHaveText('minifs_open');
    await frame.locator('#stage').evaluate(stage => {
      const evidence: unknown[] = []; (window as any).__wheelEvidence = evidence;
      window.addEventListener('wheel', event => evidence.push({ target: (event.target as Element).id, prevented: event.defaultPrevented, exploring: stage.classList.contains('exploring'), deltaY: event.deltaY }), { passive: true });
    });
    const initialZoom = await frame.locator('#zoom-level').textContent();
    await frame.locator('#stage').hover(); await page.mouse.wheel(0, 260); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(frame.locator('#zoom-level')).toHaveText(initialZoom!);
    await page.evaluate(() => scrollTo(0, 0)); await frame.locator('#explore').click(); await expect(frame.locator('#explore-overlay')).toBeHidden();
    await frame.locator('#stage').hover(); await page.mouse.wheel(0, -100);
    await expect(frame.locator('#zoom-level')).not.toHaveText(initialZoom!);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const beforeButtonZoom = await frame.locator('#zoom-level').textContent();
    await frame.locator('#zoom-in').click();
    // 按钮在下一帧绘制缩放值，先确认该动作完成再记录退出后的基线。
    await expect(frame.locator('#zoom-level')).not.toHaveText(beforeButtonZoom!);
    await page.keyboard.press('Escape'); await expect(frame.locator('#explore-overlay')).toBeVisible();
    const stoppedZoom = await frame.locator('#zoom-level').textContent();
    await frame.locator('#stage').hover(); await page.mouse.wheel(0, 260); await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(frame.locator('#zoom-level')).toHaveText(stoppedZoom!);
  } finally {
    try {
      if (await page.locator('iframe').count()) await info.attach('iframe-scroll.json', {
        contentType: 'application/json', body: JSON.stringify({
          parentScroll: await page.evaluate(() => scrollY),
          frame: await frame.locator('#stage').evaluate(stage => ({
            scrollY, innerHeight, documentHeight: document.documentElement.scrollHeight,
            stageScroll: { x: stage.scrollLeft, y: stage.scrollTop },
            wheel: (window as any).__wheelEvidence,
          })),
        }, null, 2),
      });
    } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
  }
});
test('桌面概览与源码截图', async ({ page }, info) => {
  await page.goto(url); await page.screenshot({ path: `artifacts/browser/${info.project.name}-overview.png` });
  await page.goto(url + '#v=1&node=n-open'); await page.screenshot({ path: `artifacts/browser/${info.project.name}-source.png` });
});

test('关系标签避开彼此与正文，窄屏收起的标签仍可从列表读取', async ({ page }, info) => {
  await page.goto(url); await expect(page.locator('.edge-label.relation:visible')).toHaveCount(4);
  const collisions = () => page.evaluate(() => {
    const labels = [...document.querySelectorAll<HTMLElement>('.edge-label')].filter(el => !el.hidden).map(el => ({ name: el.title, box: el.getBoundingClientRect() }));
    const obstacles = [...document.querySelectorAll<HTMLElement>('#stage .card-heading,#stage .card-summary,#stage .card-foot > *,#stage .compact,#stage .map-controls,#stage .map-context,#stage .map-hint')].map(el => ({ name: el.className, box: el.getBoundingClientRect() }));
    const stage = document.querySelector('#stage')!.getBoundingClientRect(), failures: string[] = [];
    labels.forEach((label, i) => {
      const a = label.box;
      if (a.left < stage.left || a.right > stage.right || a.top < stage.top || a.bottom > stage.bottom) failures.push(`越界：${label.name}`);
      for (const other of [...labels.slice(i + 1), ...obstacles]) {
        const b = other.box;
        if (b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) failures.push(`${label.name} 遮挡 ${other.name}`);
      }
    });
    return failures;
  });
  expect(await collisions()).toEqual([]);
  await page.locator('.edge-label.relation:visible').first().focus();
  await expect(page.locator('#edge-lines path.highlighted')).toHaveCount(1);
  await page.keyboard.press('Enter'); await expect(page.locator('#details .relation-member')).toHaveCount(1);
  await page.locator('#theme').click(); await page.screenshot({ path: `artifacts/browser/${info.project.name}-dark.png` });
  await page.locator('#theme').click(); await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#stage').evaluate(el => el.clientWidth)).toBe(390);
  await page.waitForTimeout(100); expect(await collisions()).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/browser/${info.project.name}-narrow.png`, fullPage: true });
  await page.locator('#relation-list').click(); await expect(page.locator('#details h2')).toHaveText('实体关系 · 4');
  await expect(page.locator('#details > .related-link')).toHaveCount(13);
});
