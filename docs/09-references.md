# 参考资料与使用范围

查阅日期：2026-09-25。下列是官方项目/文档来源。网页会继续变化；正式开发应记录实际依赖版本，分析目标仓库时必须固定代码提交。

| 来源 | 本文档采用的内容 | 未作出的推断 |
| --- | --- | --- |
| [Archify 官方仓库](https://github.com/tt-a1i/archify) | 结构化源、程序校验、独立 HTML 和生成/阅读边界 | 不声称 Archify 已有本文定义的代码语义缩放引擎 |
| [Agent Skills 格式规范](https://agentskills.io/specification) | SKILL.md 与按需脚本、参考资料目录 | 不保证所有 Agent 宿主具有完全相同工具权限 |
| [D3 Zoom 官方文档](https://d3js.org/d3-zoom) | 平移、缩放与输入适配的候选基础能力 | 不把语义层次、聚合边或布局归功于 d3-zoom |
| [MDN wheel 事件](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event) | 滚轮/触控板事件与取消行为需要适配 | 不保证未测试浏览器和硬件的统一行为 |
| [Linux 内核 VFS 概览](https://docs.kernel.org/filesystems/vfs.html) | 建立案例的对象与接口术语背景 | 不将文档背景冒充实际仓库取证或精确调用链 |

CodeMap 的数据模型、局部展开、关系守恒、预算和验收指标是本次设计建议，不是上述来源已经验证的产品特性。方案未固定第三方库版本，也未引用第三方性能结果来证明自己的性能目标。
