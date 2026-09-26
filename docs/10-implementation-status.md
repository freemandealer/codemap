# 10 · 实施与验收状态

核验日期：2026-09-26。这里区分实现、自动检查与发布验收；不把设计目标写成已经测得的效果。

## 已有交付

| 内容 | 当前证据 |
| --- | --- |
| Schema、引用、树、端口、片段与源码核验 | `npm test` 包含正反例、源文件改动和收据不匹配测试 |
| 确定性布局、混合深度与关系投影 | 关系 ID 守恒、预算、递归、别名、内部边、局部流程及布局复现测试 |
| CLI 与离线 HTML | validate/build/inspect/snapshot/extract；校验失败保留旧 HTML，产物指纹、内嵌转义与篡改检查 |
| 阅读器事件与内容逻辑 | DOM 回归覆盖导读、搜索、源码、省略、关系证据、返回、慢速双击目标保留与向父层缩小；不代表真实浏览器验收 |
| 独立 Skill | `npm run package:skill` 在临时目录、不依赖仓库 node_modules 的条件下完成 validate/build/inspect |
| 流程与架构视角 | [Skill 选择规则](../skills/codemap/SKILL.md)及[架构方法](../skills/codemap/references/architecture-playbook.md)；可选 `scope.viewpoint`，旧地图保持兼容，架构内可保留局部流程 |
| MiniFS 教学地图 | [源数据](../examples/minifs/map.codemap.json)，`npm run demo` 生成 `artifacts/minifs/map.html` |
| 同源 MiniFS 架构地图 | [源数据](../examples/minifs/architecture.codemap.json)，生成 [离线 HTML](../artifacts/minifs-architecture/map.html)；4 个模块、23 个节点、9 条实体关系，核验接口依赖与共享对象读写 |
| CodeMap 实际项目地图 | [地图与阅读说明](../examples/codemap-build/README.md)：3 个源文件、18 个节点、10 条关系，源码一致性进入测试 |
| 另外两个实际项目地图 | [fast-deep-equal](../examples/fast-deep-equal/README.md)：16 节点、6 关系；[json-schema-traverse](../examples/json-schema-traverse/README.md)：19 节点、7 关系。锁定版本原文与完整许可随图保存，语义探针检查递归、短路、回调顺序和异常边界 |
| 性能基准程序 | [脚本](../scripts/benchmark.ts)与固定 500 节点 / 1,500 关系负载；生成约 0.93 MB HTML，结构与源码核验通过 |
| 自动验收入口 | `npm run verify:release` 依次执行单元检查、五份地图构建、独立 Skill 检查、浏览器环境检查、三个引擎的交互与性能检查；保存每次执行的独立收据和日志 |

本轮架构扩展的 `npm test` **39 / 39** 通过，覆盖视角枚举与旧地图兼容、模块展开后的关系守恒、双向依赖/读写、导读及接口源码展示。五份地图的 validate/build/inspect 和包含双视角样例的独立 Skill 包检查均通过。架构样例仍是 MiniFS 教学代码，Linux I/O 名称仅用于提示词示例；不宣称已有真实 Linux 架构图，也不宣称宿主模型在所有提示词下的选择已通过独立行为评测。

本轮按用户授权在宿主机普通 Terminal 执行 `npm run verify:release`，实际退出码为 **1**。完整输出见 [2026-09-26T02-56-00-572Z](../artifacts/release/2026-09-26T02-56-00-572Z/results.json)：39 项本地测试、五份地图、独立包及三个浏览器启动检查通过；浏览器交互 **30 / 30** 通过，每引擎 10 项，无跳过或不稳定项，包含新架构视角。已抽查 [Chromium 架构概览](../artifacts/release/2026-09-26T02-56-00-572Z/browser/chromium-architecture.png) 和 [WebKit 架构概览](../artifacts/release/2026-09-26T02-56-00-572Z/browser/webkit-architecture.png)；概览空间不足的 5 个关系标签收起，可在关系列表读取。

失败发生在 [Chromium 无头性能检查](../artifacts/release/2026-09-26T02-56-00-572Z/chromium-benchmark.json)：打开 P95 **116.5 ms**、停止后更新 **54.4 ms** 均通过，帧间隔 P95 **83.3 ms > 33 ms** 未通过；空白页与静止地图 P95 均约 **66.7 ms**。语义细化、节点/连线预算、离线及运行时检查通过。失败停止使 Firefox、WebKit 性能检查未执行，不借用旧报告补齐。本轮未改变模式或门槛；完整验收未通过。

先前 Agent 执行环境的三引擎启动失败保留在 [原始记录](../artifacts/viewpoint-check/browser-results.json)；该限制不代表宿主机启动失败。下方的首版有窗口性能结果属于历史对照，不覆盖本次默认无头验收。

首版已修复 JSON Schema 导入导致的浏览器测试加载失败、取证输出可能覆盖源文件（含符号链接目录别名）、较慢双击的目标被重绘替换、深层焦点无法用缩小返回父坐标系。README 提供可执行命令与真实交付路径。

首版上一轮 `npm test` 为 36 项全部通过，包括探索模式退出、完整验收的失败停止、跳过用例、缺失引擎、失败证据归档、陈旧报告拒绝和窗口模式一致性。当时四份地图的 validate/build/inspect 均通过。三个实际项目候选已完成实现者语义审阅，其中两个依赖项目另有可执行语义探针；这不替代独立读者或源码审阅者的接受。生成工作读取 3 / 1 / 1 个实际源文件，并另读包元数据和许可；模型耗时与 token 成本未计量，不提供推算值。

首版曾在用户授权的宿主机普通 Terminal 执行 `npm run verify:release -- --headed`。历史记录为 [2026-09-25T16-26-22-858Z](../artifacts/release/2026-09-25T16-26-22-858Z/results.json)，Terminal 确认退出码 **0**：36 项本地测试、四份地图、独立 Skill、浏览器启动均通过；三个引擎各 9 项浏览器检查通过，合计 **27 / 27**，无跳过或不稳定项；三个有窗口性能基准全部通过。交互检查仍使用无头模式，性能检查显式使用有窗口模式，不能混为同一环境结论。

标题断言现按真实节点校验面包屑与详情；滚轮监听仅在探索期间启用；iframe 用例确认探索前和退出后能滚动父页面、探索时缩放地图。补齐缩放按钮绘制等待后，三个引擎均通过。WebKit 的文件测试及性能程序阻断 HTTP(S)，并保留零网络请求断言；独立页面验证请求确由阻断器拒绝。Chromium / Firefox 额外启用离线模拟，报告记录隔离方法；这些措施不代替设备断网试用。

基准先编译再用 Node 执行，避免 tsx 注入的 `__name` 进入浏览器回调；中途异常也写失败报告。滚轮位移现按时间计算，低帧率不再缩短同一条缩放路径。30 秒执行 5 次放大与缩小、交替平移，记录完整输入轨迹、空白页与静止地图对照。正式测量不启用性能追踪。

以下结果在 Apple M5 Pro / 48 GiB、Darwin 25.5.0、1440×900、可见且有焦点的浏览器窗口测得，三者使用相同 HTML 指纹。已从原始数组重算 P95 并核对阈值，见[复核记录](../artifacts/release/2026-09-25T16-26-22-858Z/metrics-audit.json)。

| 引擎及原始数据 | 打开 P95 | 帧间隔 P95 | 帧样本数 | 停止后的最后 DOM 更新 |
| --- | --- | --- | --- | --- |
| [Chromium 153.0.8010.12](../artifacts/release/2026-09-25T16-26-22-858Z/chromium-benchmark.json) | 85.4 ms | 9.3 ms | 3,465 | 9.2 ms |
| [Firefox 155.0](../artifacts/release/2026-09-25T16-26-22-858Z/firefox-benchmark.json) | 311 ms | 9.1 ms | 3,483 | 8 ms |
| [WebKit 26.6](../artifacts/release/2026-09-25T16-26-22-858Z/webkit-benchmark.json) | 124 ms | 18 ms | 1,794 | 16 ms |

门槛仍为打开 P95 ≤ 2,000 ms、帧间隔 P95 ≤ 33 ms、停止后更新 ≤ 150 ms；三个引擎均出现 2 种语义前沿，最多 13 张卡片 / 116 条边，低于 80 / 200 上限；错误与 HTTP(S) 请求均为 0。

无头模式的失败没有改写为通过。[历史完整验收](../artifacts/release/2026-09-25T15-58-46-260Z/results.json)退出 1；修正输入后的[无头追踪](../artifacts/benchmark/diagnostics/headless-shell-profile/chromium-results.json)已触发语义细化，但空白页与地图 P95 均约 66.7 ms。同版本 Chromium 153 的[新无头模式](../artifacts/benchmark/diagnostics/cadence-chromium-new-headless.json)仍为 66.7 ms，[有窗口对照](../artifacts/benchmark/diagnostics/cadence-chromium-headed.json)为 16.7 ms。现有证据将帧节奏异常缩小到本机该版本的无头运行模式，底层原因尚未确认；默认无头命令不自动降级或更换浏览器。`--headed` 是显式选择的另一种测量环境。

关系标签现在沿各自曲线寻找空位，避开其他标签、卡片文字与控件；优先安排短边，空间不足时收起标签并显示数量，所有成员仍可在关系列表查看。键盘聚焦或悬停会突出对应连线。新增三引擎几何与键盘回归，已抽查 MiniFS 的[桌面概览](../artifacts/release/2026-09-25T16-26-22-858Z/browser/chromium-overview.png)、[源码](../artifacts/release/2026-09-25T16-26-22-858Z/browser/chromium-source.png)、[暗色](../artifacts/release/2026-09-25T16-26-22-858Z/browser/firefox-dark.png)与[窄屏](../artifacts/release/2026-09-25T16-26-22-858Z/browser/webkit-narrow.png)截图。窄屏卡片标题仍会截短，可通过大纲及详情读取完整标题；截图抽查不替代读者效果验证。

## 仍需完成

| 优先级 | 工作 | 通过条件 |
| --- | --- | --- |
| 1 | 实际项目与读者验证 | 三个候选已有实现者源码与语义检查；尚需独立抽审和 5 位目标读者试用，步骤及问题见 [试用方案](11-reader-study.md) |
| 2 | 设备与稳定浏览器验收 | 实际触控板与一种触屏设备；记录稳定版 Chrome / Firefox / Safari，验证离线、键盘、iframe 滚动与深链接 |
| 3 | 无头环境兼容 | Chromium 153 无头帧节奏原因仍待定位；有窗口性能通过不替代该项，保留环境对照及原始失败 |
| 4 | 更广泛视觉与内容验证 | 对三个候选的实际阅读路径、密集关系和窄屏可理解性开展独立试读，记录阻断项及复查 |

宿主机 Terminal 已确认三种测试引擎均可启动。上述版本为 Playwright 浏览器构建，不冒充用户稳定版浏览器或物理设备验收。`artifacts/environment/browser-blocker.json` 保留的是 Agent 执行沙箱的历史限制，不代表宿主机不可用。

## 复查与证据位置

```sh
npm test
npm run demo
npm run package:skill
npx playwright install chromium firefox webkit
npm run test:e2e
npm run benchmark
npm run verify:release
npm run verify:release -- --headed
```

自动检查使用 Node.js v26.9.0。浏览器报告位于 `artifacts/browser-results.json`，独立包检查位于 `artifacts/skill-package-check.json`，性能报告位于 `artifacts/benchmark/<browser>-results.json`。完整验收记录位于 `artifacts/release/<时间>/`；命令直接打印每项通过或失败、未执行数量及日志路径，并在失败时归档浏览器 JSON、截图、轨迹和基准报告。以同一次运行目录判断结果，不能混用旧报告凑成通过。

基准是合成图；新浏览器上下文不等于清空操作系统缓存；脚本化 wheel 与 requestAnimationFrame 不等于真实触控板或触屏延迟。两个依赖样例均为小型 JavaScript 库，不能据此声称已证明大型、多语言系统的生成质量。真实项目地图目前由本次实现者审阅，尚无独立用户接受证据。

## 首版范围

先完成上述本地生成与离线阅读闭环。固定版本的 Linux VFS 地图尚未制作；在线上传、托管服务、编辑器、模型设置、账号、付费和协作仍按设计后置。当前产物可以本地试用，但不宣称 v0.1 全部发布验收已经通过。
