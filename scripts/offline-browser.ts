import type { BrowserContext } from '@playwright/test';

// Playwright 1.63 的 WebKit 离线模拟会在加载 file:// 时提前失败。
// 三个引擎都阻断 HTTP(S)；Chromium / Firefox 另外启用离线模拟。
// 此检查不等同于断开设备网络，真实设备离线仍需人工验收。
export async function isolateFileContext(context: BrowserContext, browserName: string) {
  const blockedRequests: string[] = [];
  await context.route(/^https?:\/\//, async route => {
    blockedRequests.push(route.request().url());
    await route.abort('internetdisconnected');
  });
  const emulateOffline = browserName !== 'webkit';
  await context.setOffline(emulateOffline);
  return { mode: emulateOffline ? 'offline-emulation-and-http-blocking' : 'http-blocking', blockedRequests };
}
