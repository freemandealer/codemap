# json-schema-traverse · 递归访问与 JSON Pointer

阅读目标：理解 `json-schema-traverse@1.0.0` 如何选择子 Schema、调用 pre/post，并构造属性路径。运行 `npm run demo`，打开 `artifacts/json-schema-traverse/map.html`；本说明随产物交付时，直接打开同目录 `map.html`。

导读：主题 → 按类型和关键词递归 → _traverse → 分支选择 → 属性容器 → 原始源码。关键词表和 escapeJsonPtr 位于独立职责区域；三条递归调用分别保存端口和触发条件。

地图含 19 个节点、5 个实体、7 条关系和 5 条局部流程。原始入口的 93 行保存在 `examples/json-schema-traverse/source/index.cjs`，与锁文件依赖的 `index.js` 逐字节一致；没有运行目标项目的安装、构建或启动脚本。MIT 许可和署名内嵌于 HTML，并另附 LICENSE。

已核对源码、回调绑定、分支和异常边界。自动语义探针验证前后序、`~`/`/` 属性名转义、allKeys、数据关键词、未知数组和布尔 Schema 跳过规则，以及子层抛错时 post 不保证运行。业务回调具体实现保留未知；不宣称验证 Schema、解析 $ref、等待异步回调或支持循环 Schema。

这是源码与语义检查通过的阅读候选，浏览器目视检查和独立读者试用尚未完成。`validation.json` 记录源码核验，`build-receipt.json` 记录产物指纹，`provenance.json` 记录包名和版本。源文件或版本变化后须重新审阅，不得只更新指纹。

HTML 包含所选源码及完整许可，可单文件离线阅读。公网地址需自行静态托管，本地文件路径不可直接分享。
