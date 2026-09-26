# MiniFS · 数据契约教学样例

这份小型 C 程序和对应 JSON 用来验证 CodeMap 的数据表达与阅读闭环，不是 Linux VFS 实现。仓库根目录运行 `npm run demo` 后，打开 [离线地图](../../artifacts/minifs/map.html) 即可逐层阅读。

- [minifs.c](minifs.c)：一个静态文件槽位，查找、检查、分配、操作表分派和失败释放。
- [map.codemap.json](map.codemap.json)：7 个实体、20 个讲解节点、4 条实体关系、9 条局部流程边、13 条源码证据和 6 个片段。
- [architecture.codemap.json](architecture.codemap.json)：同源架构视角，8 个实体、23 个讲解节点、9 条实体关系、9 条局部流程、14 条证据和 9 个片段。运行 demo 后打开 [架构地图](../../artifacts/minifs-architecture/map.html)。
- [Schema](../../schemas/codemap.schema.json)：与文档 03 一致的结构草案。
- [verify.py](../verify.py)：只检查这份设计样例的字段、引用、树、端口、文件指纹和代码文本，不是产品 CLI。

## 可以检验什么

两张地图使用同一个源码快照。流程视角重点解释一次打开与失败处理；架构视角按打开接口、后端协议与实现、文件槽位、名称空间组织，展示操作表依赖、File/Inode 引用及共享对象读写。架构导读先看后端接口，再深入实现源码；打开步骤仍在局部模块内，顶层没有强加执行顺序。它们均不能代表真实 Linux I/O。

`n-root → n-entry → n-open → n-dispatch → n-dispatch-code` 给出从主题、职责、函数、步骤到代码的五种内容。其他分支深度不同，没有为了整齐补空层。

`n-open-alias` 引用与 `n-open` 相同的实体，但默认实体关系只投影到规范节点。`r-open-dispatch` 同时引用调用点、操作表定义和对象初始化，避免只看到函数指针调用就猜目标。

`s-open` 保留有效性检查、错误返回和失败清理，只省略第 63 行的无副作用审计占位调用。源码不是把 Agent 写出的代码当作原文；每段文字可以重新与文件逐行核对。

程序没有真实路径解析、并发、引用计数或句柄表。模拟后端失败状态只用于测试夹具设置；此处的所有语义都不能直接移植为 Linux 事实。

## 核验方式

在仓库根目录执行。Schema 检查依赖 Python 的 `jsonschema`，建议使用独立环境；下面的环境路径可以自行更换：

```sh
python3 -m venv /tmp/codemap-example-check
/tmp/codemap-example-check/bin/python -m pip install jsonschema
/tmp/codemap-example-check/bin/python examples/verify.py
cc -std=c11 -Wall -Wextra -Werror -fsyntax-only examples/minifs/minifs.c
```

`verify.py` 使用真实 Draft 2020-12 校验器校验 Schema 及样例，并额外检查跨对象与源码一致性。它不运行 C 程序，不实现布局/关系投影，也不证明解释充分。C 命令只做语法与告警检查。

修改 C 文件后，不应直接更新指纹让检查变绿；应重新核对所有证据范围、片段、调用与自然语言结论，再更新 JSON。已生成地图始终解释它记录的快照。
