import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { CodeMap } from '../src/types.js';
import { buildHTML, readAssets } from '../src/packager.js';
import { validateMap } from '../src/validator.js';
import { example, repo } from './helpers.js';

// DOM 回归只证明事件和内容逻辑；不替代浏览器布局、手势、离线及视觉检查。
async function reader(hash = '', coarsePointer = false, map?: CodeMap) {
  map ??= await example();
  const built = buildHTML(map, await validateMap(map, repo), await readAssets(pathToFileURL(join(repo, 'dist/'))));
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(built.html, {
    url: `https://maps.example.org/map.html${hash}`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(window) {
      window.matchMedia = (() => ({ matches: coarsePointer })) as any;
      window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
      window.CSS ??= {} as any; window.CSS.escape = (value: string) => value;
      Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => 830 });
      Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: () => 720 });
    },
  });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.deepEqual(errors, []);
  return { dom, document: dom.window.document, errors };
}

test('DOM：架构导读、接口源码和共享状态关系可读，未标视角的旧地图仍可打开', async t => {
  const map: CodeMap = JSON.parse(await readFile(new URL('../examples/minifs/architecture.codemap.json', import.meta.url), 'utf8'));
  const { dom, document, errors } = await reader('', false, map); t.after(() => dom.window.close());
  assert.equal(document.querySelector('.map-context .eyebrow')!.textContent, '架构视角');
  assert.equal(document.querySelectorAll('.summary-card.module').length, 4);
  assert.match(document.querySelector('.route-section')!.textContent!, /模块与联系/);
  assert.match(document.querySelector('#details')!.textContent!, /已覆盖的职责与联系/);
  document.querySelector<HTMLButtonElement>('[data-outline-node="n-backend"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-outline-node="n-ops"]')!.click();
  assert.match(document.querySelector('#details .snippet')!.textContent!, /struct FileOps/);
  dom.window.location.hash = '#v=1&relation=r-backend-file';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  assert.match(document.querySelector('#details')!.textContent!, /写入/);
  assert.match(document.querySelector('#details')!.textContent!, /backend_failure 为 0/);
  assert.deepEqual(errors, []);
  delete map.scope.viewpoint;
  const legacy = await reader('', false, map); t.after(() => legacy.dom.window.close());
  assert.equal(legacy.document.querySelector('.map-context .eyebrow')!.textContent, 'CODE LANDSCAPE');
  assert.equal(legacy.document.querySelectorAll('.summary-card').length, 4);
});

test('DOM：概览沿导读到源码，原文、省略、面包屑和返回保持一致', async t => {
  const { dom, document, errors } = await reader(); t.after(() => dom.window.close());
  assert.equal(document.querySelector('.map-context .eyebrow')!.textContent, '流程视角');
  assert.equal(document.querySelectorAll('.summary-card').length, 4);
  const click = (selector: string) => { const target = document.querySelector<HTMLButtonElement>(selector); assert.ok(target, selector); target.click(); };
  click('[data-outline-node="n-entry"]');
  click('[data-outline-node="n-open"]');
  assert.equal(document.querySelector('#details h2')!.textContent, 'minifs_open');
  assert.match(document.querySelector('#details')!.textContent!, /release_file/);
  assert.match(document.querySelector('#details .omission')!.textContent!, /63/);
  click('[data-outline-node="n-dispatch"]');
  click('[data-outline-node="n-dispatch-code"]');
  assert.ok(document.querySelector('#details .snippet code'));
  assert.match(document.querySelector('#breadcrumbs')!.textContent!, /分派/);
  click('#up'); click('#fit');
  assert.equal(document.querySelectorAll('.summary-card').length, 4);
  assert.deepEqual(errors, []);
});

test('DOM：搜索深层符号、关系证据和失效深链接可用', async t => {
  const { dom, document, errors } = await reader('#v=1&node=missing'); t.after(() => dom.window.close());
  assert.match(document.querySelector('#toast')!.textContent!, /失效/);
  const search = document.querySelector<HTMLInputElement>('#search')!;
  search.value = 'backend_open'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector<HTMLButtonElement>('#search-results button')!.click();
  assert.match(document.querySelector('#details')!.textContent!, /backend/);
  dom.window.location.hash = '#v=1&relation=r-open-dispatch';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  assert.match(document.querySelector('#details')!.textContent!, /分派/);
  assert.ok(document.querySelector('#details .evidence-item'));
  document.querySelector<HTMLButtonElement>('#relation-list')!.click();
  assert.match(document.querySelector('#details')!.textContent!, /实体关系 · 4/);
  assert.match(document.querySelector('#details')!.textContent!, /局部流程 · 9/);
  assert.deepEqual(errors, []);
});

test('DOM：第一次点击保留双击目标；深层焦点可用滚轮缩回上层', async t => {
  const { dom, document, errors } = await reader(); t.after(() => dom.window.close());
  const title = document.querySelector<HTMLButtonElement>('[data-node="n-entry"] .card-title')!;
  title.click(); await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(document.querySelector('[data-node="n-entry"] .card-title'), title);
  title.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(document.querySelector('#details h2')!.textContent, '打开请求的责任');
  document.querySelector<HTMLButtonElement>('[data-outline-node="n-open"]')!.click();
  const stage = document.querySelector<HTMLElement>('#stage')!;
  for (let i = 0; i < 4; i++) {
    stage.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 500, clientX: 415, clientY: 360, bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  assert.match(document.querySelector('#scope-label')!.textContent!, /^主题/);
  assert.deepEqual(errors, []);
});

test('DOM：探索前与退出后归还滚轮，激活期间才改变相机', async t => {
  const { dom, document, errors } = await reader('', true); t.after(() => dom.window.close());
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const level = () => document.querySelector('#zoom-level')!.textContent;
  const wheel = async () => {
    const event = new dom.window.WheelEvent('wheel', { deltaY: -100, clientX: 415, clientY: 360, bubbles: true, cancelable: true });
    stage.dispatchEvent(event); await new Promise(resolve => setTimeout(resolve, 40));
    return event.defaultPrevented;
  };
  const initial = level();
  assert.equal(await wheel(), false); assert.equal(level(), initial);
  for (let i = 0; i < 2; i++) {
    const before = level();
    document.querySelector<HTMLButtonElement>('#explore')!.click();
    assert.equal(await wheel(), true); assert.notEqual(level(), before);
    if (i === 0) stage.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else document.querySelector<HTMLButtonElement>('#leave-explore')!.click();
    const stopped = level();
    assert.equal(await wheel(), false); assert.equal(level(), stopped);
  }
  assert.deepEqual(errors, []);
});
