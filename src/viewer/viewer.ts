import { compareId, frontier, indexById, intersects, LIMITS, projectFlows, projectRelations, rectIn, zoomAt } from '../core.js';
import type { Endpoint, ProjectedEdge } from '../core.js';
import type { MapPayload, MapNode, Rect, Relation, Snippet } from '../types.js';

const payload = JSON.parse(document.getElementById('codemap-data')!.textContent!) as MapPayload;
const { map, scene, validation } = payload;
const nodes = indexById(map.nodes), entities = indexById(map.entities), snippets = indexById(map.snippets), evidence = indexById(map.evidence), relations = indexById(map.relations);
const matched = new Set(validation.matchedEvidenceIds);
const kindLabel: Record<string, string> = { topic: '主题', module: '职责', mechanism: '机制', function: '函数', step: '步骤', code: '源码', boundary: '边界' };
const claimLabel: Record<string, string> = { source: '源码依据', inferred: '推断', unknown: '未确认', editorial: '阅读编排' };
const typeLabel: Record<string, string> = { call: '调用', dispatch: '分派', read: '读取', write: '写入', produce: '产生', consume: '消费', control: '控制', ownership: '持有', return: '返回', dependency: '依赖' };
const app = document.getElementById('app')!;
// This template is constant. Every author-controlled value is inserted with textContent.
app.innerHTML = `<header class="topbar"><a class="brand" href="#" aria-label="CodeMap 回到全图"><span class="brand-icon">⌘</span>CodeMap<span class="version">LOCAL READER</span></a><div class="top-title"></div><button id="theme" aria-label="切换配色">◐</button><button id="share" class="share">分享地图 ↗</button></header>
<div class="workspace"><aside class="outline-panel"><div class="eyebrow">EXPLORE THE CODE</div><h1 id="title"></h1><p id="question"></p><label class="search-box"><span>⌕</span><input id="search" type="search" placeholder="搜索符号、标题或路径" aria-label="搜索符号、标题或路径"><kbd>/</kbd></label><div id="search-results" aria-label="搜索结果" hidden></div><div class="outline-heading"><span>阅读大纲</span><span id="node-count"></span></div><nav id="outline" aria-label="阅读大纲"></nav><section class="route-section"><div class="eyebrow">SUGGESTED ROUTE</div><p>从问题走到实现</p><button id="route-start">沿推荐路径阅读 <span>→</span></button></section><div class="snapshot-note"><span class="status-dot"></span>离线地图 · 源码已核验<br><small id="snapshot"></small></div></aside>
<main class="main"><div class="navigation"><button id="outline-toggle" aria-label="切换阅读大纲">☰</button><nav id="breadcrumbs" aria-label="当前位置"></nav><button id="up" title="返回上层（Escape）">↑ 上层</button><button id="details-toggle" aria-label="切换详情">详情</button></div><section id="stage" tabindex="0" aria-label="代码地图；Enter 进入选中节点，+ 或 - 缩放，0 返回全图"><div class="map-context"><span class="eyebrow">CODE LANDSCAPE</span><span id="scope-label"></span></div><svg id="edges" aria-hidden="true"><defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="currentColor"/></marker></defs><g id="edge-lines"></g></svg><div id="cards"></div><div id="edge-labels"></div><div id="explore-overlay"><button id="explore">点击探索地图 <span>↗</span></button><small>页面滚动保持正常；探索后按 Escape 退出</small></div><div class="map-controls"><button id="zoom-out" aria-label="缩小">−</button><output id="zoom-level">100%</output><button id="zoom-in" aria-label="放大">＋</button><span class="divider"></span><button id="fit" title="适配全图（0）">全图</button><select id="wheel-mode" aria-label="滚轮行为"><option value="zoom">滚轮缩放</option><option value="pan">滚轮平移</option></select><button id="leave-explore" hidden>退出探索</button><button id="fullscreen" aria-label="全屏">⛶</button></div><div class="map-hint">拖动空白平移 · 滚轮缩放 · 双击进入</div></section><footer><button id="relation-list">关系列表</button><span class="legend-source">实线：源码依据</span><span class="legend-inferred">虚线：推断 / 未确认</span><span id="counts"></span></footer></main>
<aside id="details" class="details-panel" aria-label="节点与证据详情" tabindex="-1"></aside></div><div id="announcement" class="sr-only" aria-live="polite"></div><div id="toast" role="status" hidden></div><dialog id="share-dialog"><div class="dialog-heading"><h2>分享这张代码地图</h2><button id="close-share" aria-label="关闭分享">×</button></div><p id="share-note"></p><label>当前位置链接<textarea id="share-url" readonly rows="3"></textarea></label><button id="copy-url">复制链接</button><label>iframe 内嵌示例<textarea id="embed-code" readonly rows="7"></textarea></label><p class="muted">将 HTML 放到你已有的静态站点；文件包含本图选择的源码。内嵌时点击探索才接管手势。</p></dialog>`;
function get<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; }
function button(text: string, action: () => void, className = '') { const result = el('button', className, text); result.type = 'button'; result.addEventListener('click', action); return result; }
function appendList(parent: HTMLElement, title: string, values: string[]) { if (!values.length) return; parent.append(el('h3', '', title)); const list = el('ul'); for (const value of values) list.append(el('li', '', value)); parent.append(list); }
function toast(message: string) { get('toast').textContent = message; get('toast').hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { get('toast').hidden = true; }, 4200); }
let toastTimer = 0;
get('title').textContent = map.title; get('question').textContent = map.scope.question;
if (map.scope.viewpoint) {
  const architecture = map.scope.viewpoint === 'architecture';
  document.querySelector('.map-context .eyebrow')!.textContent = architecture ? '架构视角' : '流程视角';
  document.querySelector('.route-section > p')!.textContent = architecture ? '先看模块与联系，再深入实现' : '沿关键路径理解执行与分支';
  if (architecture) kindLabel.module = '模块';
}
get('route-start').title = '推荐阅读顺序，不表示执行时序';
document.querySelector('.top-title')!.textContent = map.title;
get('node-count').textContent = String(map.nodes.length);
get('snapshot').textContent = `${map.snapshot.kind === 'git' ? map.snapshot.revision!.slice(0, 12) + (map.snapshot.dirty ? ' · 含未提交内容' : '') : map.snapshot.id} · ${map.snapshot.files.length} 个文件`;
const stage = get('stage'), cards = get('cards'), edgeLabels = get('edge-labels'), edgeLines = document.getElementById('edge-lines')!;
const embedded = window.self !== window.top;
let exploring = !embedded && !matchMedia('(pointer: coarse)').matches;
let anchor = map.rootNodeId, selected = map.rootNodeId, selectedRelation: string | null = null;
let expanded = new Set([map.rootNodeId]);
if (scene.nodes[map.rootNodeId].children.length > LIMITS.visibleNodes) expanded.clear();
let camera = { x: 32, y: 42, k: 1 }, width = 800, height = 700, frame = 0, lodTimer = 0;
const BASE_WIDTH = 1000, BASE_HEIGHT = 720;
const enabledTypes = new Set(map.relations.map(r => r.type));
const outlineOpen = new Set([map.rootNodeId]);
const outlineButtons = new Map<string, HTMLButtonElement>();
function screenRect(id: string): Rect | null {
  const rect = rectIn(scene, id, anchor); if (!rect) return null;
  return { x: camera.x + rect.x * BASE_WIDTH * camera.k, y: camera.y + rect.y * BASE_HEIGHT * camera.k, width: rect.width * BASE_WIDTH * camera.k, height: rect.height * BASE_HEIGHT * camera.k };
}
function fitScale() { return Math.max(0.12, Math.min((width - 64) / BASE_WIDTH, (height - 116) / BASE_HEIGHT)); }
function fitCamera() { camera = { k: fitScale(), x: 32, y: 54 }; }
function announce(text: string) { get('announcement').textContent = text; }
function updateExplore() {
  get('explore-overlay').hidden = exploring;
  get('leave-explore').hidden = !exploring || (!embedded && !matchMedia('(pointer: coarse)').matches);
  stage.classList.toggle('exploring', exploring);
  // 未探索时不注册会阻塞原生滚动的监听；退出后恢复 iframe 的滚动交接。
  stage.removeEventListener('wheel', handleWheel);
  if (exploring) stage.addEventListener('wheel', handleWheel, { passive: false });
}
function schedule(lod = false) {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  if (lod) { window.clearTimeout(lodTimer); lodTimer = window.setTimeout(updateLOD, 120); }
}
function updateLOD() {
  let changed = false;
  // 缩小时恢复父坐标系，保留当前节点在屏幕上的位置；从深层焦点也能连续返回概览。
  while (scene.nodes[anchor].parentId && camera.k < fitScale() * 0.75) {
    const node = scene.nodes[anchor], local = node.local, k = camera.k / local.width;
    camera = { k, x: camera.x - local.x * BASE_WIDTH * k, y: camera.y - local.y * BASE_HEIGHT * k };
    anchor = node.parentId!; expanded.add(anchor); changed = true;
  }
  const visibleRect = { x: -80, y: -80, width: width + 160, height: height + 160 };
  const candidates = Object.values(scene.nodes).filter(n => n.id === anchor || n.ancestors.includes(anchor)).sort((a, b) => a.depth - b.depth || compareId(a.id, b.id));
  for (const node of candidates) {
    if (!node.children.length || node.ancestors.some(id => !expanded.has(id))) continue;
    const r = screenRect(node.id); if (!r || !intersects(r, visibleRect)) continue;
    const density = Math.min(r.width / node.minExpandWidth, r.height / node.minExpandHeight);
    if (expanded.has(node.id) && density <= 0.8) { expanded.delete(node.id); changed = true; }
    else if (!expanded.has(node.id) && density >= 1 && frontier(scene, expanded).length - 1 + node.children.length <= LIMITS.visibleNodes) { expanded.add(node.id); changed = true; }
  }
  // Rebase before very large camera scales lose precision. Local child coordinates are retained.
  if (camera.k > 16) {
    const center = { x: width / 2, y: height / 2 };
    const candidate = candidates.filter(n => expanded.has(n.id) && n.id !== anchor).reverse().find(n => { const r = screenRect(n.id)!; return r && center.x > r.x && center.x < r.x + r.width && center.y > r.y && center.y < r.y + r.height; });
    if (candidate) { const r = screenRect(candidate.id)!; anchor = candidate.id; camera = { x: r.x, y: r.y, k: r.width / BASE_WIDTH }; changed = true; }
  }
  if (changed) { render(); renderBreadcrumbs(); }
}
function currentHash(node = selected, relation = selectedRelation) { const params = new URLSearchParams({ v: '1', map: map.mapId }); if (relation) params.set('relation', relation); else params.set('node', node); if (nodes[node]?.snippetIds.length) params.set('detail', 'code'); return `#${params}`; }
function writeHistory() { const hash = currentHash(); if (location.hash === hash) return; try { history.pushState(null, '', hash); } catch { /* Opaque sandbox origins still use copyable semantic links. */ } }
function navigate(id: string, options: { history?: boolean; expand?: boolean; focus?: boolean } = {}) {
  if (!nodes[id]) return;
  selected = id; selectedRelation = null; anchor = id;
  expanded = new Set(scene.nodes[id].ancestors);
  if (options.expand !== false && scene.nodes[id].children.length && scene.nodes[id].children.length <= LIMITS.visibleNodes) expanded.add(id);
  for (const parent of scene.nodes[id].ancestors) outlineOpen.add(parent);
  outlineOpen.add(id); fitCamera(); renderOutline(); renderDetails(); renderBreadcrumbs(); render();
  if (options.history !== false) writeHistory();
  if (options.focus !== false) { const target = cards.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"] .card-title`) ?? get('details'); target.focus({ preventScroll: true }); }
  announce(`${nodes[id].label}，${kindLabel[nodes[id].kind]}，${scene.nodes[id].children.length} 个子层。`);
}
function selectNode(id: string) {
  selected = id; selectedRelation = null; renderDetails(); renderBreadcrumbs(); highlightOutline();
  // 保留点击目标，避免第一次点击后的重绘拆掉 DOM，吞掉较慢的第二次点击。
  for (const card of cards.querySelectorAll<HTMLElement>('[data-node]')) card.classList.toggle('selected', card.dataset.node === id);
}
function up() { const parent = scene.nodes[anchor].parentId; navigate(parent ?? map.rootNodeId); }
function renderBreadcrumbs() {
  const parent = get('breadcrumbs'); parent.replaceChildren();
  const trail = [...scene.nodes[selected].ancestors, selected];
  trail.forEach((id, i) => { if (i) parent.append(el('span', 'crumb-separator', '/')); const crumb = button(nodes[id].label, () => navigate(id)); if (id === selected) crumb.setAttribute('aria-current', 'location'); parent.append(crumb); });
  get('scope-label').textContent = `${kindLabel[nodes[anchor].kind]} / ${nodes[anchor].label}`;
}
function highlightOutline() { for (const [id, item] of outlineButtons) { item.classList.toggle('selected', id === selected); item.setAttribute('aria-current', id === selected ? 'true' : 'false'); } }
function renderOutline() {
  const parent = get('outline'); parent.replaceChildren(); outlineButtons.clear();
  function visit(id: string, depth: number) {
    const node = nodes[id], children = scene.nodes[id].children, row = el('div', 'outline-row'); row.style.paddingLeft = `${Math.min(depth, 8) * 12}px`;
    const toggle = button(children.length ? (outlineOpen.has(id) ? '⌄' : '›') : '·', () => { if (outlineOpen.has(id)) outlineOpen.delete(id); else outlineOpen.add(id); renderOutline(); }, 'outline-expander');
    toggle.setAttribute('aria-label', `${outlineOpen.has(id) ? '收起' : '展开'} ${node.label}`); toggle.disabled = !children.length; if (children.length) toggle.setAttribute('aria-expanded', String(outlineOpen.has(id)));
    const item = button(node.label, () => navigate(id), 'outline-item'); item.dataset.outlineNode = id;
    item.addEventListener('keydown', event => {
      const items = [...outlineButtons.values()], index = items.indexOf(item);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); }
      if (event.key === 'ArrowRight' && children.length) { event.preventDefault(); outlineOpen.add(id); renderOutline(); outlineButtons.get(children[0])?.focus(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); if (outlineOpen.has(id)) { outlineOpen.delete(id); renderOutline(); outlineButtons.get(id)?.focus(); } else if (node.parentId) outlineButtons.get(node.parentId)?.focus(); }
    });
    outlineButtons.set(id, item); row.append(toggle, item); parent.append(row);
    if (outlineOpen.has(id)) children.forEach(child => visit(child, depth + 1));
  }
  visit(map.rootNodeId, 0); highlightOutline();
}
function snippetView(snippet: Snippet, compact = false): HTMLElement {
  const wrap = el('section', compact ? 'snippet compact' : 'snippet'); const ev = evidence[snippet.evidenceId];
  wrap.append(el('div', 'code-path', `${ev.path}:${ev.startLine}–${ev.endLine}`));
  const body = el('div', 'code-scroll');
  for (const segment of snippet.segments) {
    if (segment.kind === 'omission') { body.append(el('div', 'omission', `⋯ ${segment.startLine}–${segment.endLine} 省略：${segment.reason}`)); continue; }
    const source = el('pre');
    segment.text.split('\n').forEach((line, i) => { const row = el('div', 'code-line'), number = el('span', 'line-number', String(segment.startLine + i)); number.setAttribute('aria-hidden', 'true'); row.append(number, el('code', '', line || ' ')); source.append(row); });
    body.append(source);
  }
  wrap.append(body); if (!compact) appendList(wrap, '保留的语义', snippet.preservedSemantics); return wrap;
}
function evidenceView(ids: string[]): HTMLElement {
  const wrap = el('div', 'evidence-list');
  for (const id of [...new Set(ids)]) { const ev = evidence[id]; const item = el('div', 'evidence-item'); item.append(el('span', 'evidence-status', matched.has(id) ? '✓ 原文已核验' : '未核验'), el('code', '', `${ev.path}:${ev.startLine}–${ev.endLine}`)); if (ev.note) item.append(el('p', '', ev.note)); wrap.append(item); }
  return wrap;
}
function relationButton(relation: Relation) { return button(`${entities[relation.sourceEntityId].symbol ?? entities[relation.sourceEntityId].label} → ${entities[relation.targetEntityId].symbol ?? entities[relation.targetEntityId].label} · ${typeLabel[relation.type]}`, () => showRelation(relation.id), 'related-link'); }
function renderDetails() {
  const parent = get('details'); parent.replaceChildren(); parent.classList.remove('relation-detail');
  const node = nodes[selected];
  parent.append(el('div', 'eyebrow', `${kindLabel[node.kind]} / ${claimLabel[node.claimStatus]}`), el('h2', '', node.label), el('p', 'detail-summary', node.summary));
  if (node.claimReason) parent.append(el('div', `claim-note ${node.claimStatus}`, node.claimReason));
  const childIds = scene.nodes[node.id].children;
  if (childIds.length) parent.append(button(`进入下一层 · ${childIds.length} 个节点 →`, () => navigate(node.id), 'primary-button'));
  const routeIndex = map.primaryPath.indexOf(node.id);
  if (routeIndex >= 0 && routeIndex < map.primaryPath.length - 1) parent.append(button(`导读下一站：${nodes[map.primaryPath[routeIndex + 1]].label}`, () => navigate(map.primaryPath[routeIndex + 1]), 'route-next'));
  if (node.id === map.rootNodeId) {
    appendList(parent, '本图回答', map.scope.inScope); appendList(parent, '范围之外', map.scope.outOfScope); appendList(parent, '阅读假设', map.scope.assumptions);
    appendList(parent, map.scope.viewpoint === 'architecture' ? '已覆盖的职责与联系' : '完整路径', map.coverage.completePaths); appendList(parent, '尚未闭合', [...map.coverage.partialPaths, ...map.coverage.openQuestions]); appendList(parent, '未展开', map.coverage.excludedPaths);
    appendList(parent, '代码条件', map.snapshot.configuration); parent.append(el('p', 'muted', `输入快照：${map.snapshot.id}。源码核验表示文件与片段一致，解释仍需语义审阅。`));
  }
  if (node.details) { appendList(parent, '输入', node.details.inputs ?? []); appendList(parent, '输出', node.details.outputs ?? []); appendList(parent, '关键约束', node.details.invariants ?? []); }
  for (const id of node.entityIds) { const entity = entities[id]; if (entity.canonicalNodeId !== node.id) parent.append(button(`同一实现：定位 ${entity.symbol ?? entity.label} ↗`, () => navigate(entity.canonicalNodeId), 'alias-link')); }
  if (node.snippetIds.length) { parent.append(el('h3', '', '核心源码')); for (const id of node.snippetIds) parent.append(snippetView(snippets[id])); }
  if (node.evidenceIds.length) { parent.append(el('h3', '', '源码证据')); parent.append(evidenceView(node.evidenceIds)); }
  if (childIds.length) { const list = el('div', 'child-list'); parent.append(el('h3', '', '继续深入')); for (const id of childIds) list.append(button(`${kindLabel[nodes[id].kind]} · ${nodes[id].label} →`, () => navigate(id))); parent.append(list); }
  const entityIds = new Set(node.entityIds);
  const related = map.relations.filter(r => entityIds.has(r.sourceEntityId) || entityIds.has(r.targetEntityId));
  if (related.length) { parent.append(el('h3', '', `实体关系 · ${related.length}`)); related.forEach(r => parent.append(relationButton(r))); }
}
function showRelation(id: string, write = true) {
  const relation = relations[id]; if (!relation) return;
  selectedRelation = id;
  const source = entities[relation.sourceEntityId].canonicalNodeId, target = entities[relation.targetEntityId].canonicalNodeId;
  const sourceChain = [...scene.nodes[source].ancestors, source], targetChain = [...scene.nodes[target].ancestors, target];
  anchor = sourceChain.filter(node => targetChain.includes(node)).at(-1) ?? map.rootNodeId;
  expanded = new Set(scene.nodes[anchor].ancestors); expanded.add(anchor); fitCamera(); selected = source;
  renderBreadcrumbs(); highlightOutline(); render(); renderRelationMembers([id]); if (write) writeHistory();
}
function renderRelationMembers(ids: string[]) {
  const parent = get('details'); parent.replaceChildren(); parent.classList.add('relation-detail');
  parent.append(el('div', 'eyebrow', 'RELATION EVIDENCE'), el('h2', '', `${ids.length} 条原子关系`), el('p', 'muted', '数量代表已建模的调用点或关系命题，不是运行次数。'));
  for (const id of ids) { const relation = relations[id], item = el('section', 'relation-member');
    item.dataset.relation = id; item.append(el('h3', '', `${typeLabel[relation.type]} · ${relation.label}`), el('span', `claim-tag ${relation.claimStatus}`, claimLabel[relation.claimStatus]));
    for (const [label, entityId] of [['起点', relation.sourceEntityId], ['终点', relation.targetEntityId]]) { const entity = entities[entityId]; item.append(button(`${label}：${entity.symbol ?? entity.label} ↗`, () => navigate(entity.canonicalNodeId), 'related-link')); }
    if (relation.condition) item.append(el('p', 'condition', `条件：${relation.condition}`)); if (relation.claimReason) item.append(el('p', 'claim-note', relation.claimReason));
    item.append(evidenceView(relation.evidenceIds)); item.append(button('定位并分享这条关系', () => showRelation(id), 'small-link')); parent.append(item);
  }
  document.body.classList.remove('details-hidden');
}
function showAllRelations() {
  const parent = get('details'); parent.replaceChildren(); parent.append(el('div', 'eyebrow', 'RELATION INDEX'), el('h2', '', `实体关系 · ${map.relations.length}`));
  const filters = el('div', 'relation-filters');
  for (const type of [...new Set(map.relations.map(r => r.type))]) { const label = el('label'), input = el('input'); input.type = 'checkbox'; input.checked = enabledTypes.has(type); input.addEventListener('change', () => { if (input.checked) enabledTypes.add(type); else enabledTypes.delete(type); schedule(); }); label.append(input, document.createTextNode(typeLabel[type])); filters.append(label); }
  parent.append(filters); for (const relation of map.relations) parent.append(relationButton(relation));
  parent.append(el('h3', '', `局部流程 · ${map.flows.length}（另行计数）`));
  for (const flow of map.flows) parent.append(button(`${nodes[flow.fromNodeId].label} → ${nodes[flow.toNodeId].label}：${flow.label}`, () => { navigate(flow.ownerNodeId); const detail = get('details'); detail.prepend(el('p', 'condition', flow.label), evidenceView(flow.evidenceIds)); }, 'related-link'));
  document.body.classList.remove('details-hidden');
}
function paintCard(id: string, container: boolean, internal: string[], flowCount: number) {
  const rect = screenRect(id); if (!rect || !intersects(rect, { x: -80, y: -80, width: width + 160, height: height + 160 })) return;
  if (rect.width < 18 || rect.height < 18) return;
  const node = nodes[id], card = el('article', `map-card ${container ? 'container' : 'summary-card'} ${node.kind} ${id === selected ? 'selected' : ''}`);
  card.dataset.node = id; card.style.left = `${rect.x}px`; card.style.top = `${rect.y}px`; card.style.width = `${rect.width}px`; card.style.height = `${rect.height}px`;
  const heading = el('div', 'card-heading'), title = button(node.label, () => selectNode(id), 'card-title');
  title.title = `${node.label} · ${node.summary}`; title.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); navigate(id); } });
  heading.append(el('span', 'node-kind', kindLabel[node.kind]), title);
  if (scene.nodes[id].children.length) { const enter = button(container ? '↗' : '→', () => navigate(id), 'enter-node'); enter.setAttribute('aria-label', `进入 ${node.label}`); heading.append(enter); }
  card.append(heading);
  if (!container && rect.width >= 145 && rect.height >= 100) {
    card.append(el('p', 'card-summary', node.summary));
    const foot = el('div', 'card-foot'); foot.append(el('span', `claim-tag ${node.claimStatus}`, claimLabel[node.claimStatus]));
    if (scene.nodes[id].children.length) foot.append(el('span', '', `${scene.nodes[id].children.length} 个子层`));
    if (internal.length) foot.append(button(`内部关系 ${internal.length}`, () => renderRelationMembers(internal), 'internal-badge'));
    if (flowCount) foot.append(el('span', '', `局部流程 ${flowCount}`)); card.append(foot);
    if (node.snippetIds.length && rect.width >= 360 && rect.height >= 250) card.append(snippetView(snippets[node.snippetIds[0]], true));
  }
  card.addEventListener('click', event => { if (!(event.target as Element).closest('button, pre, .code-scroll')) selectNode(id); });
  card.addEventListener('dblclick', event => { if (!(event.target as Element).closest('pre, .code-scroll')) { event.preventDefault(); navigate(id); } });
  cards.append(card);
}
function endpointPosition(endpoint: Endpoint, side: 'source' | 'target', other?: Endpoint) {
  const r = screenRect(endpoint.nodeId);
  if (!r) return { x: side === 'source' ? 14 : width - 14, y: Math.min(height - 85, Math.max(72, height / 2)), outside: true };
  const otherRect = other ? screenRect(other.nodeId) : null;
  const towardsRight = otherRect ? otherRect.x + otherRect.width / 2 >= r.x + r.width / 2 : side === 'source';
  const x = towardsRight ? r.x + r.width : r.x, y = r.y + (endpoint.boundary ? Math.min(30, r.height / 2) : r.height / 2);
  return { x: Math.max(14, Math.min(width - 14, x)), y: Math.max(65, Math.min(height - 85, y)), outside: x < 0 || x > width || y < 0 || y > height };
}
type LabelCandidate = { tag: HTMLButtonElement; points: { x: number; y: number }[] };
let labelCandidates: LabelCandidate[] = [];
function drawEdge(source: Endpoint, target: Endpoint, label: string, action: () => void, className: string, count: number, lane: number, id: string) {
  const a = endpointPosition(source, 'source', target), b = endpointPosition(target, 'target', source);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const shift = (lane % 5 - 2) * 9;
  const same = source.nodeId === target.nodeId;
  const bend = Math.max(32, Math.min(120, Math.abs(b.x - a.x) * 0.45));
  const d = same ? `M${a.x} ${a.y} C${a.x + 64} ${a.y - 72} ${a.x + 64} ${a.y + 72} ${a.x} ${a.y + 12}` : `M${a.x} ${a.y + shift} C${a.x + bend} ${a.y + shift},${b.x - bend} ${b.y + shift},${b.x} ${b.y + shift}`;
  svg.setAttribute('d', d); svg.setAttribute('class', className); svg.setAttribute('marker-end', 'url(#arrow)'); svg.setAttribute('stroke-width', String(Math.min(4, 1 + Math.log2(1 + count)))); svg.dataset.edge = id; edgeLines.append(svg);
  const tag = button(`${label}${count > 1 ? ` ×${count}` : ''}${a.outside || b.outside ? ' ↗' : ''}`, action, `edge-label ${className}`);
  tag.dataset.edge = id; tag.title = `${nodes[source.nodeId]?.label ?? '视口外'} → ${nodes[target.nodeId]?.label ?? '视口外'} · ${label}；${count} 个成员${a.outside || b.outside ? '；另一端在当前视口外' : ''}`;
  tag.setAttribute('aria-label', tag.title);
  for (const event of ['mouseenter', 'focus']) tag.addEventListener(event, () => svg.classList.add('highlighted'));
  for (const event of ['mouseleave', 'blur']) tag.addEventListener(event, () => svg.classList.remove('highlighted'));
  edgeLabels.append(tag);
  const control = same ? [{ x: a.x, y: a.y }, { x: a.x + 64, y: a.y - 72 }, { x: a.x + 64, y: a.y + 72 }, { x: a.x, y: a.y + 12 }] : [{ x: a.x, y: a.y + shift }, { x: a.x + bend, y: a.y + shift }, { x: b.x - bend, y: b.y + shift }, { x: b.x, y: b.y + shift }];
  const points = [.5, .35, .65, .2, .8, .1, .9].map(t => {
    const weights = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
    return { x: control.reduce((sum, p, i) => sum + p.x * weights[i], 0), y: control.reduce((sum, p, i) => sum + p.y * weights[i], 0) };
  });
  labelCandidates.push({ tag, points });
}
function placeEdgeLabels() {
  const origin = stage.getBoundingClientRect();
  // 批量读取尺寸后再定位，避开正文和控件；空间不足时保留连线与关系列表入口。
  const obstacles: Rect[] = [...stage.querySelectorAll<HTMLElement>('.card-heading,.card-summary,.card-foot > *,.compact,.map-controls,.map-context,.map-hint')].map(element => {
    const r = element.getBoundingClientRect(); return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
  }).filter(r => r.width > 0 && r.height > 0);
  const measured = labelCandidates.map(item => ({ ...item, size: item.tag.getBoundingClientRect(), span: Math.max(...item.points.map(p => p.x)) - Math.min(...item.points.map(p => p.x)) + Math.max(...item.points.map(p => p.y)) - Math.min(...item.points.map(p => p.y)) }));
  // 先给短边安排标签，长边可沿曲线移动；流程标签让位于实体关系。
  measured.sort((a, b) => Number(a.tag.classList.contains('flow')) - Number(b.tag.classList.contains('flow')) || a.span - b.span);
  let hidden = 0;
  for (const { tag, points, size } of measured) {
    const rect = points.map(p => ({ x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height })).find(r =>
      r.x >= 8 && r.y >= 56 && r.x + r.width <= width - 8 && r.y + r.height <= height - 96 &&
      !obstacles.some(other => intersects({ x: r.x - 3, y: r.y - 3, width: r.width + 6, height: r.height + 6 }, other)));
    tag.hidden = !rect;
    if (!rect) { hidden++; continue; }
    tag.style.left = `${rect.x + rect.width / 2}px`; tag.style.top = `${rect.y + rect.height / 2}px`;
    obstacles.push(rect);
  }
  return hidden;
}
function render() {
  const focusedId = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-node]')?.dataset.node;
  cards.replaceChildren(); edgeLabels.replaceChildren(); edgeLines.replaceChildren(); labelCandidates = [];
  const front = frontier(scene, expanded);
  const visible = new Set<string>();
  for (const id of [...front, ...expanded]) { const r = screenRect(id); if (r && intersects(r, { x: 0, y: 0, width, height })) visible.add(id); }
  const projection = projectRelations(map, scene, expanded, { types: enabledTypes, visible, edgeBudget: LIMITS.visibleEdges, selectedRelationId: selectedRelation ?? undefined });
  const flows = projectFlows(map, scene, expanded);
  const containers = [...expanded].filter(id => scene.nodes[id].children.length && scene.nodes[id].ancestors.every(p => expanded.has(p))).sort((a, b) => scene.nodes[a].depth - scene.nodes[b].depth);
  for (const id of containers) paintCard(id, true, [], 0);
  for (const id of front.slice(0, LIMITS.visibleNodes)) paintCard(id, false, projection.internal[id] ?? [], flows.internal[id]?.length ?? 0);
  projection.edges.forEach((edge, i) => drawEdge(edge.source, edge.target, `${edge.recursive ? '递归 · ' : ''}${typeLabel[edge.type]}`, () => { selectedRelation = edge.memberRelationIds[0]; renderRelationMembers(edge.memberRelationIds); }, `relation ${edge.claimStatus} ${edge.role}`, edge.memberRelationIds.length, i, edge.id));
  const activeFlows = flows.edges.filter(flow => visible.has(flow.source.nodeId) || visible.has(flow.target.nodeId));
  activeFlows.slice(0, Math.max(0, LIMITS.visibleEdges - projection.edges.length)).forEach((flow, i) => drawEdge(flow.source, flow.target, flow.label, () => { const parent = get('details'); parent.replaceChildren(el('h2', '', flow.label), el('p', '', `局部流程 · ${flow.kind} · ${flow.memberFlowIds.length} 个成员`), evidenceView(flow.memberFlowIds.flatMap(id => map.flows.find(f => f.id === id)!.evidenceIds))); }, `flow ${flow.kind}`, flow.memberFlowIds.length, i, `flow:${flow.memberFlowIds[0]}`));
  const internal = Object.values(projection.internal).flat().length, overflow = projection.overflow.flatMap(e => e.memberRelationIds).length;
  const hiddenFlows = Math.max(0, activeFlows.length - Math.max(0, LIMITS.visibleEdges - projection.edges.length));
  const hiddenLabels = placeEdgeLabels();
  get('counts').textContent = `${visible.size} 个可见区域 · ${map.relations.length} 条实体关系${internal ? ` / 内部 ${internal}` : ''}${projection.filtered.length ? ` / 筛除 ${projection.filtered.length}` : ''}${projection.offscreen.length ? ` / 视口外 ${projection.offscreen.length}` : ''}${overflow ? ` / 预算折叠 ${overflow}` : ''}${hiddenFlows ? ` / 折叠流程 ${hiddenFlows}` : ''}${hiddenLabels ? ` / 收起 ${hiddenLabels} 个标签，见关系列表` : ''}`;
  get('counts').title = '所有成员可在关系列表中检查；实体关系与局部流程分别计数。';
  get('zoom-level').textContent = `${Math.round(camera.k * 100)}%`;
  stage.dataset.frontier = front.join(','); stage.dataset.expanded = [...expanded].join(','); stage.dataset.relationTotal = String(map.relations.length);
  if (focusedId) { const focusTarget = cards.querySelector<HTMLButtonElement>(`[data-node="${CSS.escape(focusedId)}"] .card-title`); if (focusTarget) focusTarget.focus({ preventScroll: true }); else stage.focus({ preventScroll: true }); }
}
function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.size && ((params.get('v') && params.get('v') !== '1') || (params.get('map') && params.get('map') !== map.mapId))) { navigate(map.rootNodeId, { history: false, focus: false }); toast('链接版本或地图不匹配，已回到概览。'); return; }
  const relation = params.get('relation'), node = params.get('node');
  if (relation && relations[relation]) { showRelation(relation, false); return; }
  if (node && nodes[node]) { navigate(node, { history: false, focus: false }); return; }
  navigate(map.rootNodeId, { history: false, focus: false }); if (relation || node) toast('链接对象已失效，已回到概览。');
}
get<HTMLInputElement>('search').addEventListener('input', event => {
  const query = (event.target as HTMLInputElement).value.trim().toLowerCase(), parent = get('search-results'); parent.replaceChildren(); parent.hidden = !query;
  if (!query) return;
  const found = Object.values(scene.nodes).filter(n => n.searchText.includes(query));
  parent.append(el('p', 'search-count', `${found.length} 个结果`));
  for (const n of found.slice(0, 50)) { const result = button(nodes[n.id].label, () => { navigate(n.id); parent.hidden = true; }, 'search-result'); result.append(el('small', '', [...n.ancestors, n.id].map(id => nodes[id].label).join(' / '))); parent.append(result); }
});
get('search').addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); get('search-results').querySelector<HTMLButtonElement>('button')?.focus(); } if (event.key === 'Escape') { get('search-results').hidden = true; stage.focus(); event.stopPropagation(); } });
function zoom(factor: number, point = { x: width / 2, y: height / 2 }) { camera = zoomAt(camera, point, factor); schedule(true); }
function handleWheel(event: WheelEvent) {
  if (!exploring || (event.target as Element).closest('.code-scroll,.map-controls')) return;
  if (event.cancelable) event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
  if (get<HTMLSelectElement>('wheel-mode').value === 'pan' && !event.ctrlKey) { camera.x -= event.deltaX * unit; camera.y -= event.deltaY * unit; schedule(true); }
  else { const rect = stage.getBoundingClientRect(); zoom(Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top }); }
}
const pointers = new Map<number, { x: number; y: number }>();
stage.addEventListener('pointerdown', event => {
  if (!exploring || (event.target as Element).closest('button,select,input,.map-card,.map-controls')) return;
  stage.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); stage.classList.add('dragging');
});
stage.addEventListener('pointermove', event => {
  const previous = pointers.get(event.pointerId); if (!previous) return;
  const before = [...pointers.values()]; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); const after = [...pointers.values()];
  if (after.length === 1) { camera.x += event.clientX - previous.x; camera.y += event.clientY - previous.y; }
  else if (after.length === 2) {
    const distance = (p: typeof after) => Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
    const center = (p: typeof after) => ({ x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
    const a = center(before), b = center(after), rect = stage.getBoundingClientRect();
    camera = zoomAt(camera, { x: a.x - rect.left, y: a.y - rect.top }, distance(after) / Math.max(1, distance(before))); camera.x += b.x - a.x; camera.y += b.y - a.y;
  }
  schedule(true);
});
function endPointer(event: PointerEvent) { pointers.delete(event.pointerId); if (!pointers.size) stage.classList.remove('dragging'); }
stage.addEventListener('pointerup', endPointer); stage.addEventListener('pointercancel', endPointer);
get('zoom-in').addEventListener('click', () => zoom(1.35)); get('zoom-out').addEventListener('click', () => zoom(1 / 1.35));
get('fit').addEventListener('click', () => navigate(map.rootNodeId)); get('up').addEventListener('click', up);
document.querySelector('.brand')!.addEventListener('click', event => { event.preventDefault(); navigate(map.rootNodeId); });
get('route-start').addEventListener('click', () => navigate(map.primaryPath[0])); get('relation-list').addEventListener('click', showAllRelations);
get('explore').addEventListener('click', () => { exploring = true; updateExplore(); stage.focus(); });
get('leave-explore').addEventListener('click', () => { exploring = false; updateExplore(); });
get('outline-toggle').addEventListener('click', () => { document.body.classList.toggle('outline-hidden'); resize(); });
get('details-toggle').addEventListener('click', () => { document.body.classList.toggle('details-hidden'); resize(); });
get('theme').addEventListener('click', () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; });
get('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('当前宿主不支持全屏，请独立打开 HTML。'); } });
const shareDialog = get<HTMLDialogElement>('share-dialog');
get('share').addEventListener('click', () => {
  const local = location.protocol === 'file:', base = location.href.split('#')[0], url = base + currentHash();
  get('share-note').textContent = local ? '当前为本地文件。先上传 HTML 到你的静态站点，再用站点 URL 分享；本地路径不能供他人访问。' : '链接保留当前语义位置；接收者打开同一份 HTML 即可继续阅读。';
  get<HTMLTextAreaElement>('share-url').value = url;
  const hosted = local ? `https://maps.example.org/map.html${currentHash()}` : url;
  get<HTMLTextAreaElement>('embed-code').value = `<iframe src="${hosted.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" title="CodeMap 代码地图" loading="lazy" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" allowfullscreen style="width:100%;height:720px;border:1px solid #d1d5db;border-radius:12px"></iframe>`;
  shareDialog.showModal();
});
get('close-share').addEventListener('click', () => shareDialog.close());
get('copy-url').addEventListener('click', async () => { const field = get<HTMLTextAreaElement>('share-url'); try { await navigator.clipboard.writeText(field.value); toast('链接已复制。'); } catch { field.focus(); field.select(); toast('请复制已选中的链接文本。'); } });
document.addEventListener('keydown', event => {
  if (shareDialog.open || (event.target as Element).closest('input,textarea,select,[contenteditable=true]')) return;
  if (event.key === '/') { event.preventDefault(); get('search').focus(); }
  else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.35); }
  else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.35); }
  else if (event.key === '0') { event.preventDefault(); navigate(map.rootNodeId); }
  else if (event.key === 'Escape') { event.preventDefault(); if (exploring && (embedded || matchMedia('(pointer: coarse)').matches)) { exploring = false; updateExplore(); } else up(); }
  else if (event.key === 'Enter' && event.target === stage) { event.preventDefault(); navigate(selected); }
});
window.addEventListener('popstate', applyHash); window.addEventListener('hashchange', applyHash);
function resize() { width = stage.clientWidth; height = stage.clientHeight; fitCamera(); schedule(); }
new ResizeObserver(resize).observe(stage);
resize(); updateExplore(); renderOutline(); applyHash();
