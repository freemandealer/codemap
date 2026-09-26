# CodeMap

**围绕一个阅读目标，把复杂代码组织成可逐级缩放、可追溯到源码的交互地图。**

产品名暂用 **CodeMap**；`ZoomI/O` 保留为品牌候选。当前已有 v0.1 本地 Skill、CLI、源码校验器、确定性布局与离线阅读器，以及教学样例和设计文档。Skill 支持按执行流程或模块架构组织地图，独立读者和真实设备验收尚未完成，实际检查与历史性能结果见[实施与验收状态](docs/10-implementation-status.md)。

## 运行与交付

需要 Node.js 22+。在本仓库执行：

```sh
npm ci
npm test
npm run demo
```

直接打开 [MiniFS 离线地图](artifacts/minifs/map.html)。`artifacts/minifs/` 同时包含语义 JSON、源码验证收据、构建收据和阅读说明；`artifacts/` 是本地生成目录，不纳入版本控制。

同一份源码还会生成 [MiniFS 架构地图](artifacts/minifs-architecture/map.html)：按打开接口、后端协议与实现、文件槽位、名称空间分区，展示调用、依赖与共享对象读写。可以和流程图对照阅读。

同一次命令还会生成 [CodeMap 自身构建流程地图](artifacts/codemap-build/map.html)，可从职责层一直读到当前项目的原始 TypeScript。该地图固定实际源码快照，源码变化后需重新核对证据，不能只更新指纹。

另外两份实际项目候选是 [fast-deep-equal 深比较](artifacts/fast-deep-equal/map.html)与 [json-schema-traverse 递归访问](artifacts/json-schema-traverse/map.html)。它们使用锁定版本的原始源码，完整 MIT 许可随 HTML 内嵌。三个实际项目均通过源码核验；独立读者试用尚未完成。

```sh
# 用真实源码验证地图，再构建并检查离线 HTML
node dist/cli.js validate examples/minifs/map.codemap.json --repo . --out artifacts/minifs/validation.json --json
node dist/cli.js build examples/minifs/map.codemap.json --validation artifacts/minifs/validation.json --repo . --out artifacts/minifs/map.html --json
node dist/cli.js inspect artifacts/minifs/map.html --json

# 生成不依赖本仓库 node_modules 的 Skill 包，并自动运行可携带性检查
npm run package:skill
```

独立包位于 [artifacts/codemap-skill/codemap](artifacts/codemap-skill/codemap)，按宿主 Agent 的 Skill 安装约定复制这个完整目录。包中包含 `SKILL.md`、参考资料、CLI、阅读器、Schema 和教学样例；生成地图使用宿主模型，CLI 与 HTML 不调用模型。

浏览器验收和压力基准需先安装匹配的测试浏览器：

```sh
npx playwright install chromium firefox webkit
npm run test:e2e
npm run benchmark
# 可选：测量其他浏览器引擎
npm run benchmark -- --browser firefox
npm run benchmark -- --browser webkit

# 完整自动验收；任一步失败即停止，保存每次执行的独立日志
npm run verify:release
# 有窗口性能验收，需要桌面会话；交互测试仍使用无头模式
npm run verify:release -- --headed
# 只查看检查步骤，不启动浏览器
npm run verify:release -- --list
```

基准生成固定 500 节点 / 1,500 关系地图，记录 10 次新浏览器上下文打开与 30 秒脚本化手势。位移按时间计算，避免低帧率使缩放距离变短；报告另存空白页、静止地图的帧间隔、输入轨迹、浏览器版本和窗口模式。报告位于 `artifacts/benchmark/<browser>-results.json`；浏览器无法启动时输出失败记录与空指标，不会将未测量标成通过。单引擎可用 `npm run benchmark -- --browser chromium --headed`，诊断采集另加 `--profile`（仅 Chromium），采集结果不进入正式验收。

完整验收的日志与 JSON 位于 `artifacts/release/<时间>/`，`latest.json` 指向最近一次执行。终端直接显示每项通过或失败；失败时也保存浏览器报告、截图与轨迹。它会先检查三种浏览器是否可启动，再执行交互和性能测试；浏览器用例跳过、缺少某个引擎、陈旧报告、窗口模式不符或基准失败均不能通过。有窗口与无头结果分别记录，程序不会因失败自动切换模式或调整门槛。

架构扩展后，宿主机普通 Terminal 的 `npm run verify:release` 退出 **1**：39 项本地测试、五份地图、独立 Skill 和三引擎的 **30 项交互检查**通过；Chromium 无头帧间隔 P95 为 **83.3 ms**，超过 33 ms 门槛，Firefox / WebKit 性能检查因失败停止未执行。完整输出见[本轮验收记录](artifacts/release/2026-09-26T02-56-00-572Z/results.json)。

首版历史有窗口验收 `npm run verify:release -- --headed` 曾退出 **0**：36 项本地测试、27 项浏览器检查、四份地图、独立 Skill 和三个引擎的性能检查全部通过。Chromium / Firefox / WebKit 的帧间隔 P95 分别为 **9.3 / 9.1 / 18 ms**（门槛 33 ms），三者均触发语义细化。完整证据见[历史验收记录](artifacts/release/2026-09-25T16-26-22-858Z/results.json)，不代替本轮结果。

本机 Chromium 153 无头模式的空白页帧间隔仍约 66.7 ms；同版本有窗口对照正常。本次通过仅覆盖显式有窗口性能验收，不表示默认无头命令已经通过，原始失败及对照证据见[验收状态](docs/10-implementation-status.md)。WebKit 使用 HTTP(S) 请求阻断，其他两种引擎额外启用离线模拟；真实设备断网仍需人工验证。独立读者、稳定浏览器与设备试用见[首次阅读试用方案](docs/11-reader-study.md)。

## 产品是什么

用户给 Code Agent 一个代码目录和一个问题，例如：“帮我理解 Linux VFS 如何把打开文件的请求交给具体文件系统。”CodeMap Skill 指导 Agent 读取真实代码、选择相关范围、建立讲解层次、标注关系与证据。确定性程序再把这些数据转换为一个无需 LLM 即可阅读的 HTML 地图。

读者从“这个功能解决什么问题”开始，沿着职责模块、实现机制、函数和函数内步骤逐步放大，最终读到保留原始行号的核心源码。缩小后重新看到职责分工与模块关系。层级依据理解任务组织，可以递归，允许不同分支有不同深度。

**缩放改变内容；位置维持上下文；每个实现结论都有可检查的依据。**

## 按阅读意图选择视角

| 提示词示例 | Skill 的组织方式 |
| --- | --- |
| “一次打开怎样完成，失败怎样清理？” | 流程思路：关键阶段、条件、分派与返回 |
| “有哪些模块，各自职责、接口和依赖是什么？” | 架构思路：职责分区与模块网络，再深入各模块的实现 |
| “先看总体架构，再展开一次读取。” | 架构总览，相关模块内展示局部流程 |

例如可以提出：“按架构思路绘制 Linux I/O 的 CodeMap，关注 VFS、具体 FS、Block I/O、Driver 的职责与联系。”Skill 会以这些名称作为候选边界，读取指定版本的真实源码后确认关系；它们不是预设的四个执行步骤。

明确指定的视角优先；未指定时按问题重心选择，系统概览默认从架构开始。新地图在 `scope.viewpoint` 记录 `flow` 或 `architecture`，阅读器显示相应导读，旧地图可省略。该选择发生在生成时，修改标记不会自动把一棵流程树改成架构树；模块划分和关系仍需源码分析。

当前提供同源 MiniFS 双视角教学样例；固定版本的 Linux I/O 实图仍需对应代码库。详细规则见 [CodeMap Skill](skills/codemap/SKILL.md) 和 [架构组织方法](skills/codemap/references/architecture-playbook.md)。

## 首版约定

- 本地 Skill + 独立校验、布局、打包程序；生成时使用宿主 Agent 的模型，阅读时不调用模型。
- 一个地图解释一个边界明确的问题，支持复杂系统代码，使用 Linux VFS 作为主要设计案例。
- 平移、滚轮/双指缩放、逐级细化、关系聚合与拆分、核心代码、面包屑、搜索和证据检查进入首版。
- 交付单文件离线 HTML；部署到用户的静态站点后提供分享 URL 和 iframe。没有托管就没有公网链接。
- 内容编辑、用户加链接、在线上传与生成、模型 API 设置、收费与协作均不进入首版。

## 文档导航

| 文档 | 回答的问题 |
| --- | --- |
| [01 产品需求](docs/01-product-requirements.md) | 为谁解决什么问题，首版做到什么程度，怎样验收？ |
| [02 概要设计](docs/02-system-architecture.md) | Skill、数据、编译器、阅读器怎样分工？ |
| [03 数据契约](docs/03-map-data-contract.md) | 抽象树、代码实体、关系、证据和源码如何表达？ |
| [04 缩放与交互详细设计](docs/04-semantic-zoom-and-interaction.md) | 怎样像地图一样细化内容和连线，同时不迷路？ |
| [05 Skill 分析与生成流程](docs/05-skill-analysis-pipeline.md) | Agent 怎样选择代码、建立层次并检验解释？ |
| [06 交付、验收与实施计划](docs/06-delivery-quality-and-roadmap.md) | 怎样输出 HTML、分享、测试并分阶段开发？ |
| [07 Linux VFS 阅读案例](docs/07-linux-vfs-walkthrough.md) | 用户的原始案例会变成怎样的阅读路径？ |
| [08 设计决策](docs/08-decisions-and-open-questions.md) | 哪些是明确约束，哪些是建议，哪些需实验？ |
| [参考资料](docs/09-references.md) | 哪些外部能力和设计借鉴已核实？ |
| [实施与验收状态](docs/10-implementation-status.md) | 哪些功能和检查已完成，还缺哪些发布验收？ |
| [首次阅读试用方案](docs/11-reader-study.md) | 怎样验证真实读者能回答问题并定位源码？ |

建议先读 01、02、04，再按实现职责阅读 03、05、06。07 是产品体验讨论入口。

## 可查看的附件

- [交互式系统架构图](docs/diagrams/codemap-system.html)：可以缩放、聚焦和查看关系；这是 CodeMap 的系统设计图，**不代表 CodeMap 的语义缩放功能已经实现**。
- [地图 JSON Schema 草案](schemas/codemap.schema.json)：定义结构验证边界，业务不变量见 03。
- [最小地图数据样例](examples/minifs/map.codemap.json)与[对应教学代码](examples/minifs/minifs.c)：演示函数、调用、步骤、片段及证据的对应关系，不是 Linux 源码。
- [样例说明](examples/minifs/README.md)：说明可核验范围、剩余限制及验证方式。
- [文档与附件核验记录](docs/validation-notes.md)：区分已经执行的检查和未来产品验收目标。

## 与 Archify 的关系

借鉴 Archify 的“Agent 编写结构化数据，再由程序验证并交付独立 HTML”的工作方式；CodeMap 另外设计代码证据、递归语义层次、局部缩放和跨尺度关系投影。这里没有把 Archify 的现有查看器当作已经具备这些能力的 CodeMap 引擎。[Archify 官方仓库](https://github.com/tt-a1i/archify)

设计文档中的性能阈值和用户效果是验收目标，实际结果以核验记录为准。CLI 已实现 `validate`、`build`、`inspect`、`snapshot`、`extract`；用 `node dist/cli.js --help` 查看当前参数。发布公网链接需自行将 HTML 放到静态站点，阅读器的分享按钮提供节点链接与 iframe 示例。
