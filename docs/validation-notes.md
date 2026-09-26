# 文档与附件核验记录

核验日期：2026-09-25。这里记录本次已经执行的检查，和 06 中尚待产品实现后执行的验收计划分开。

## 1. 文档包

早期设计阶段交付了 README、9 篇需求/设计/参考文档、JSON Schema、MiniFS 教学样例与样例核验脚本，以及一张独立 HTML 架构图。之后已补齐本地 Skill、CLI、离线阅读器与自动检查；当前交付和缺口见 [实施与验收状态](10-implementation-status.md)。尚未部署生成网站或公网分享地址。

设计阶段核验包括本地 Markdown 文件链接、代码围栏配对、数据字段与文档的对应关系。实现阶段另有源码、打包、关系投影与 DOM 回归；真实浏览器与性能尚未验收，设计中的阈值仍是目标。

## 2. 数据契约与教学样例

使用 Python 3.14.7、jsonschema 4.26.0 的 Draft202012Validator 执行 [verify.py](../examples/verify.py)，退出码 0：

| 检查 | 结果 |
| --- | --- |
| Schema 自身符合 Draft 2020-12 | 通过 |
| MiniFS JSON 符合 Schema | 通过 |
| 唯一 ID、引用、单根无环树、规范节点与端口归属 | 通过 |
| 流程端点在所属单元内 | 通过 |
| 输入文件 SHA-256、快照与证据行范围 | 通过 |
| 7 段原文与文件一致；1 段省略；区间完整划分 | 通过 |

样例规模为 7 个实体、20 个讲解节点、5 个端口、4 条实体关系、9 条流程边、13 条证据和 6 个片段。检查覆盖结构和原文一致性，不自动证明自然语言解释、完整性或运行时行为。

另执行 `cc -std=c11 -Wall -Wextra -Werror -fsyntax-only examples/minifs/minifs.c`，退出码 0。这里只核验 C 语法和告警，没有声称编译运行了 Linux 或做过真实文件系统测试。

依赖安装在临时独立 Python 环境中，未给本仓库引入产品依赖清单。复查方式见[样例说明](../examples/minifs/README.md)。

## 3. 系统架构图

图表使用本地 [Archify Skill](https://github.com/tt-a1i/archify/blob/main/archify/SKILL.md) 从[图表源数据](diagrams/codemap-system.architecture.json)生成。它用于解释 CodeMap 的系统设计，不是 CodeMap 语义地图原型。

[确定性交付收据](diagrams/delivery-receipt.json)记录：9/9 showcase 检查通过，布局组合检查 0 错误、0 警告；一次局部修正处理了两个标签与节点的重叠。

```text
diagram_type: architecture
output: docs/diagrams/codemap-system.html
specification_sha256: fa83ddcd46254c40dd9f2baa32438c22c758b95696b960bb8eefbd7d65087ae5
artifact_sha256: 94371b90bc916c8dcf7daaf700234b927a7c2f6874b9e978c88189e1b9b3d777
validation: 9/9 showcase, 0 errors, 0 warnings
browser_evidence: failed
visual_review: 未完成（浏览器未能启动，未取得截图）
correction_rounds: 1
```

已运行官方 `visual-check`，但 Chrome 进程以 SIGABRT 退出，未得到视口测量或截图。[自动浏览器检查收据](diagrams/codemap-system.visual-check.json)保留了失败原因。不能将其写成通过或声称已经目视审阅；这项环境限制不改变前述结构与布局检查通过的事实。

使用有可用浏览器的环境可重新运行 Archify 的 visual-check，再审阅截图。不要仅凭 9/9 的结构检查，就宣称图表在所有屏幕上都已验证。

## 4. 未被核验的产品能力

局部语义缩放、关系投影、离线运行时和 iframe 交互已有实现，纯函数与 DOM 检查已有通过证据。真实浏览器手势、布局截图、iframe 行为及端到端性能尚未通过验收；测试浏览器现已下载，Chromium 所需的 Mach 服务被执行沙箱拒绝。三个实际项目候选已生成并核对源码，但独立试用、固定 Linux VFS 版本地图和用户理解收益尚未完成，不以教学或合成样例替代。
