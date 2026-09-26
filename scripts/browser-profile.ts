import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

// 仅用于诊断；正式验收不打开 tracing，避免采集开销影响性能结果。
export async function startBrowserProfile(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
  return async (path: string) => {
    const completed = new Promise<{ stream?: string }>(resolve => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.end');
    const { stream } = await completed;
    if (!stream) throw Error('浏览器追踪未返回数据流');
    const chunks: Buffer[] = [];
    while (true) {
      const chunk = await session.send('IO.read', { handle: stream });
      chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8'));
      if (chunk.eof) break;
    }
    await session.send('IO.close', { handle: stream });
    await writeFile(path, Buffer.concat(chunks));
    await session.detach();
  };
}
