# 工作流画布新增组件来源

- React Flow (`@xyflow/react` 12.12.1) 与 `@xyflow/system` 0.0.84：xyflow，MIT；源码 https://github.com/xyflow/xyflow ，本地只读参考 `D:/pro/ai_cat/参考/xyflow`，提交 `1bc405cd113618c17fd181b931a9fe573bec9fee`。
- ELK.js (`elkjs` 0.12.1)：Eclipse Layout Kernel 项目，用于自动布局。本项目按 EPL-2.0 使用其未修改的发行包；源码 https://github.com/kieler/elkjs/tree/0.12.1 。

依赖通过 package.json / package-lock.json 固定，应用使用正式 npm 发布包，未修改上游源码。参考了 xyflow 的 CustomNode 和 SaveRestore 示例所示组件用法，应用节点、依赖映射和数据连接在本项目实现。

完整许可证随前端部署发布在 `public/licenses/xyflow-MIT.txt`、`public/licenses/elkjs-EPL-2.0.txt`；来源索引为 `public/licenses/workflow-sources.txt`。React Flow 画布保留其默认 attribution。
