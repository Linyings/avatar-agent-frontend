# NarratoAI 更新日志

所有重要的项目变更都将记录在此文件中。

## [1.4.4] - 2026-07-17

### 新增

- 为 Web 与桌面端共用的剪辑工作流增加运行标识、客户端实例标识和可持久化检查点，用于在页面刷新、应用重启或临时网络中断后恢复未完成任务。
- 增加工作流运行客户端与本地作用域支持，使同一后端账号下的网页项目和 PC 本地任务可以使用独立的运行记录。

### 修复与改进

- 为工作流步骤增加预注册租约协议，避免客户端登记步骤后首次调用 Provider 被误判为“步骤正在执行”。
- 配音按解说片段使用稳定的工作流子步骤标识，避免多段配音共用同一个步骤租约而发生冲突。
- 恢复任务时跳过已完成的聚合配音步骤；最终视频已生成且积分已确认时，只重试项目保存，不会重新执行付费 AI 步骤。
- 最终结果确认后停止运行心跳，避免已完成工作流继续续租。
- 将前端反向代理的工作流读取、发送与响应超时调整为 10 分钟，降低长时间模型调用被代理提前断开的概率。

### 兼容性说明

- 本版本依赖后端提供 `workflow-runs`、工作流步骤租约和幂等完成接口；前后端必须配套发布。
- 任务恢复不会自动重新执行已完成步骤。用户主动取消或最终结果尚未生成时，不应确认最终积分消费。

### 验证记录

- 已通过工作流定向测试：18 项测试全部通过。
- 已通过生产构建：`npm run build`。
- 完整前端测试仍有两项既有失败，分别为资源页 canonical URL 的本地环境断言，以及调试页历史文案断言；均不属于本版本工作流改动范围。


### [1.4.2](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.4.1...v1.4.2) (2026-04-16)


### ✨ 新增功能

* **错误处理:** 改进API错误处理和错误信息展示 ([1e77864](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/1e778647103f787b3136e10c3d709a48132ffba7))


### 📝 文档更新

* 更新ICP备案号至蜀ICP备2024085955号-5 ([9159942](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/9159942af4e0bd7920ac0f9a311bb6e1b90ebbc4))


### ♻️ 代码重构

* 清理代码并优化多个功能 ([e4eb218](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/e4eb21887766d25d4cb4e3f64f038681e130ac0a))

### [1.4.1](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.4.0...v1.4.1) (2025-12-21)


### 🐛 问题修复

* 修复build ([6dca793](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/6dca79344eda3d75c5f2a7d4d7c10a39cbe2084f))
* 增加轮询时间间隔 ([cb4da93](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/cb4da9320154a1c3b69a7865d8444442550b56c3))
* 异步接口适配 ([db8eb10](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/db8eb100f622f0488fbe4aab527a9a9f21508c8d))
* 新增 Qwen3 asr 引擎 ([f1e1f55](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/f1e1f55b9b06a5674546662cd908a1d5349c053b))

## [1.4.0](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.3.1...v1.4.0) (2025-11-28)


### ✨ 新增功能

* 添加图片压缩功能以优化上传效率 ([be062a2](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/be062a26bb4cddaf6534952da76d2509f626c6d6))


### 🐛 问题修复

* deep 新增微信视频压缩算法 ([c82873b](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c82873b919f636fd1f45f0a6f9e78a9197d8e5da))
* 优化提示 ([35af292](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/35af2923237e66bb8f53cb68d8e930597c4e4bc4))
* 优化细节 ([6a65e25](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/6a65e256e5ee579ba601467a2eb31c8063fc8124))
* 修复 build ([ac5501b](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/ac5501b8e5cb87295a06932de731a1e45bd7a003))
* 修复取消任务接口 ([193ce45](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/193ce459d1a0ab505562a25f96b96d8b1a0317ac))
* 先更新一版，现在视频大小为1G ([47b48c1](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/47b48c1986e1ebfd3ce7130c53a0b2c54eef66fb))
* 延长倒计时时间 ([5f0e0ea](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/5f0e0ea3abaff28214f5ba985ee9dc6254b55b0b))
* 放大时间戳字体 ([65095b5](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/65095b5b264597edace24f376dcf19b123deceda))
* 新增 OCR 分批上传逻辑 ([dbacec4](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/dbacec44af0375948af5a448281cf3e29cc7654f))
* 新增删除加载动画 ([d9ccab9](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/d9ccab9b2aaed9d75d6827be80d09cf7def98608))
* 新增定价策略说明 ([4da23cb](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/4da23cb3400003cea28807cb959e4df1e46748b7))
* 新增工单反馈 ([6a24d58](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/6a24d584eed035be3cc5212260e9007f8fd470c8))
* 新增手动输入文案 ([912e654](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/912e654867da0ddeb226ea2af1cb824040527c56))
* 新增法律条款 ([c8e30d7](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c8e30d7f28ddb3af601dd3a89a48754884e5baa6))
* 新增深度推理接口请求 ([f1fbe77](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/f1fbe777b92756c0f80507af0fe407661f49361a))
* 新增自定义解说风格提示词 ([8ca1f5f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/8ca1f5f12a784694185ae790990a5adb624c4e0c))
* 添加草稿路径规范化和绝对路径构建功能 ([7ce10b7](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/7ce10b7a606bde303382e141f93e16809ab93995))
* 视频 url 拼接 ([518af9e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/518af9eee1943be3a996d967f62d0b11e1dee738))
* 美化文案预览 ([d79f200](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/d79f200f84feff3857a1466363dc0c7a9e21d500))
* 美化解说风格卡片 ([4d2e9b3](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/4d2e9b31c1e1f64524913a01db534c5a092911d0))
* 调整生成弹窗标题 ([1ba1141](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/1ba1141ca5fdc7b94ee3fcf2f783f1a3166bff26))
* 适配接口新入参 ([d67fb83](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/d67fb836b2d7b47c494107100fabb2c6733bbab7))
* 配音页面新增音频下载重试机制 ([d09fa82](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/d09fa82f96dbe0373dea6b697fcba109d55cb3ce))
* 重构config代码，清理generate_* 相关代码 ([6decb3a](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/6decb3a2ea58f59b5da047e5497f3585303f7962))

### [1.3.1](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.3.0...v1.3.1) (2025-11-07)


### 🐛 问题修复

* 优化字幕识别程序上传重试 ([11903e5](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/11903e50bf6998ff7997af979df7c666daeb1554))
* 优化配音页面链接失效问题 ([29bd32f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/29bd32fd278d55bd0d17596a128e232f1c88a693))
* 区分仅解说，仅原片，原片穿插的解说风格提示词模板 ([45bf7da](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/45bf7da2a4c3ca0a96e4ba6e6a45dc85f61d885c))
* 同步音频上传路径 ([a5a5fe7](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a5a5fe7c4802c11583b985b6a5e5faa6f91bfa70))
* 新增开发开关状态控制 ([12ec70f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/12ec70f44524bc3aedfd89df66e89af56d0221be))
* 配音结束自动校准时间戳 ([7274404](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/7274404e376fd911e58f88692524b056e98f5298))

## [1.3.0](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.2.3...v1.3.0) (2025-11-04)


### 🐛 问题修复

* codex深度推理页面逻辑存档 ([2e84df2](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/2e84df20493b61a6670965e282cb5c5f9d3ac9eb))
* ocr图片存储 ([8e20408](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/8e20408148b6f09f1ec0f6c5600a3d217f4d909a))
* 优化 docker 部署 ([297e8de](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/297e8de47596ce0a4a9cfeb1cc7269d7501925c6))
* 优化 fast 字数选择 ([e93aa35](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/e93aa357a002255c7b5cb90993eb1ece5f596bd9))
* 优化取消解说流程 ([55ea02c](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/55ea02c659c9353b2fe25264d0fa15ee3206d20e))
* 优化深度推理流程-简化代码 ([1192a0e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/1192a0e649ee7625b26b7098f6e4609be334138f))
* 修复 build 报错 ([bb7a423](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/bb7a4236a2cee3c28a239a7c74690a941b93f3b4))
* 修复 deep 模式的 bug ([4caa4dd](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/4caa4dd091942feb34d70e4d1c0a713154bf3ec5))
* 修复下一步按钮禁用 bug ([5e931b0](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/5e931b0dba2aa31616d3c45d2bc1d6115cde5747))
* 同步更新docker 配置 ([8fdefa7](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/8fdefa73a8dd3a5a52b244a30be45f7fa6f67f54))
* 存储 ocr 图片到 R2 ([2a79f17](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/2a79f17e442cd79cad7bd61ae8b5a36f03c507f7))
* 完成 OCR 字幕提取功能 ([60ae84f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/60ae84f8cef2914c55730ed47a685ebf8e907b8e))
* 完成字幕提取操作 ([a6bf9b0](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a6bf9b0d731cde15f0ad4ffc5dbfdddd26c97e59))
* 密钥失效返回登录页面 ([aa6a05b](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/aa6a05baae0414306631c9cd0c35d46d3e69113a))
* 快速推理填写文案字数 ([53517a6](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/53517a67c3599e9106a09a63117e5f424c1a23d3))
* 截取选中区域，但画质偏低 ([abbf04c](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/abbf04c05558cabfa9a48d8320abf262a88448b2))
* 支持 url 识别 ocr ([78be26d](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/78be26d6c47cea3b01975dbd00088edb514fba08))
* 支持调节帧组参数 ([015df8d](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/015df8d7f4677304f04111b34c021dee81493ce4))
* 新增上传操作 ([aec7dcf](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/aec7dcf878eb08e15d238c7a0fd4313b354f249a))
* 新增取消按钮 ([b788009](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/b78800902f9ef1462dd799c939b228bfe331b8c6))
* 新增收费版 asr 服务 ([ecf53b3](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/ecf53b33f17714d55efdeb3228c2f780510b011d))
* 显示后端提示词模板 ([a3934ba](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a3934ba4580d6bbe38e081477fb5cf80037c4f02))
* 更新 docker ([7c29222](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/7c292224916741c69a4693fc7ddb34bf56926cc7))
* 移除 tos 存储，修改为 R2 预签名方式 ([67b5bcb](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/67b5bcb821fda3fb61ce5f0ea476b4b6700f5851))
* 移除第三个无意义页面 ([be94c49](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/be94c49a5a68f105698c5d9524513fb0ddd60aa3))
* 美化帧组预览布局 ([e13036b](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/e13036bf41e3d5ddf33efce4c2cd9d5a46a24ff2))
* 进行项目新增加载动画 ([5eb3964](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/5eb396459e9bdb941fa1c7536e4abab1318961a0))
* 适配提示词模板框架 ([987fff3](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/987fff3318a1c9a2c4431ea712b776515e4723c0))
* 重构推理参数配置页面 ([dccc940](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/dccc9409859473f0eb2f9d331f98a8b13606cd67))
* 重构深度推理和逐帧分析 ([198d701](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/198d70169675c2c7c468053f6e58f85d2620e9dc))


### ✨ 新增功能

* 修复 build 报错 ([f267e6f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/f267e6f8cf74c54440fdb66528b9701a02ad1241))

### [1.2.3](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.2.2...v1.2.3) (2025-10-28)


### 🐛 问题修复

* 优化剪映草稿导出，支持直接选择草稿目录 ([52caa08](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/52caa086d152b20cdb6a858db38e30b2618b1cea))
* 优化配音提示，新增音量调节 ([2d0d1bf](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/2d0d1bfab25855c49832bc52f49d0e3af295d073))
* 修复深度推理模式没有正常跳转页面 bug ([35a6b0e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/35a6b0ee1d3301f16f550b0b193f11fa51db0c46))
* 前端实现文件上传 tos ([61e1706](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/61e1706aab4adb9ace372c91a49c9483e139fd88))
* 新增删除逻辑 ([92f67ac](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/92f67ac5ef9da275548eefaaf836f29e57733c29))
* 生成脚本页面拦截页面退出 ([297ad0f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/297ad0f355798711816416761c67515c1e150729))
* 视频链接失效，优化提示日志 ([8860853](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/8860853ec8dc8afd0c30af66159e9492695626af))

### [1.2.2](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.2.1...v1.2.2) (2025-10-25)


### 🐛 问题修复

* 修复 Windows 导出剪映音频丢失 bug ([17f4fe2](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/17f4fe2dc8eb0eb13ac97574791233bf79b3064f))
* 修改单价为视频数目 ([14e21f2](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/14e21f21fcfd51d18bcbbc7d2c9f0c45f2b985b2))
* 修改首页功能展示 ([da8bf08](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/da8bf081003825f4ebe444a7bcfe21e16f30980e))
* 新增管理用户管理 ([156cfe8](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/156cfe86336d98f9201cbe9ccf25560a59183afe))
* 新增统计分析页面 ([85aa312](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/85aa312b961e9f249d6c52e120d02a096ac343a7))

### [1.2.1](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.2.0...v1.2.1) (2025-10-23)


### 🐛 问题修复

* 为剪映草稿路径新增存储缓存 ([7db1425](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/7db1425b0745c026d283f0d1340b28f609cb1456))
* 同步适配按量付费的后端接口 ([b8fac19](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/b8fac19c94f9621e56b0aba0fa409118e04c0b3e))
* 新增首次上传字幕 ([84da5eb](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/84da5eb60c4f449e1bae1bdf3668e917be207944))

## [1.2.0](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.1.1...v1.2.0) (2025-10-23)


### 🐛 问题修复

* 修复只能支持 3G 视频报错 ([112dd9e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/112dd9e9b8b8a6766e2fc969cbb1d3492a5155df))


### ✨ 新增功能

* 新增 docker compose 备用部署方案 ([78cea02](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/78cea02d206b8171d047d3cc7915d3ba7d9c432a))
* 新增 tokens 历史记录查询 ([af28f4f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/af28f4f15911a263c5782d0044b5a50e04545441))

### [1.1.1](https://github-personal/linyqh/NarratoAI-SaaS-F/compare/v1.1.0...v1.1.1) (2025-10-22)


### 🐛 问题修复

* 新增版本号管理 ([0cc8931](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/0cc8931a35d933d67c085b488c2aaffcb7d9df43))

## 1.1.0 (2025-10-22)


### 💄 样式更新

* 三种模式添加前端引导 ([ee96c1e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/ee96c1e74658b7d5ebd2ae36a2f2717a388bd39d))
* 修复配音页面按钮颜色与主题不符 ([9ca5a86](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/9ca5a864e403b0d41df830a8ced5cc5a85ee9baa))
* 修改 logo ([060c33e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/060c33eaa0fd6e5ec2818ce1e6cacd34bc88bfd4))
* 普通推理模式进度条优化 ([98f30ab](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/98f30abbf48ed5b2b69d9e6515a88ab0384ce441))
* 生成解说进度详情展示 ([1ac41a4](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/1ac41a4eb97ba6a6aae802530bf2acde1fe6404e))
* 美化字幕识别动画 ([c675b9a](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c675b9a0a903565245d3a2eb55759063fc733d59))
* 美化导出剪映弹窗 ([8323046](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/8323046240541e83dc6ddba34fd55f67135b2f0d))
* 调整批量分析图片进度样式 ([f98a385](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/f98a385584fcc55d7bb1a298639583bc8e6e0599))
* 项目页面 logo 调整 ([6838753](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/6838753782bbdf3cee2c767e971ca7f7ae173fc1))


### ✨ 新增功能

* 新增内置音色 ([c77a4a8](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c77a4a8d9eb2aeee864f281bbd23a377ed2995dc))
* 新增内置音色管理界面 ([a4363e8](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a4363e8d11b9a093fbd9ff6e01534661854874c8))
* 新增前端导出剪映草稿逻辑 ([0fc626b](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/0fc626b831becb01d149e1ebc84aaaff02bb802c))
* 新增案例展示页面 ([c93e0be](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c93e0be6e696d8dbd00163d99518dd76086dca63))
* 新增用户友好提示 ([5567eea](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/5567eea52bf53d2f5ae02d0454cf71301a93fcd1))
* 新增裁剪视频片头片尾组件 ([fcc28e8](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/fcc28e80341a65f9cca9806a09985283b2d8fe06))
* 新增音频时长显示 ([33961fa](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/33961fa3c5646e40ef97d9a218a15bf7a8518d31))


### 🐛 问题修复

* 优化时间戳校准逻辑-使用现有的时间数据 ([27dc9ec](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/27dc9ec15d097d8d146d3f53088dff7cd62287fc))
* 优化深度推理画面批次和字幕上下文 ([73d2877](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/73d28772a1beddfa0db42242cf9f3fb22c3158d4))
* 优化额度不足情况下前端错误提示 ([580cfa4](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/580cfa459e4486f26588ca219d83caff1c52ea2c))
* 修复 build 报错 ([660997d](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/660997d61dc6d415db94d72354025fe396a6b40a))
* 修复 build 报错 ([9774013](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/97740130dc187e7e9eb91fbf23679e4f56e5da7a))
* 修复偶尔遇到视频时长无效的 bug ([55a7c01](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/55a7c01a20e1f39c99f88244dae7cbcb9f690039))
* 修复分析完成后上下文未报错 bug ([090abd8](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/090abd89e2b288fee5d9dfb31954ecb87180d1e2))
* 修复分析页面下一步按钮 bug ([85b3826](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/85b38268011b6da85fd15c2e5b87ecef162d0846))
* 修复导出剪映按钮消失问题 ([aa12d1c](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/aa12d1c2b69995bf562cfec07c3e4d75be85a344))
* 修复系统配置页面数据加载 ([c38e0fc](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/c38e0fc3bb4686ce9f2a612bd65843724fd4573d))
* 修复配音重试逻辑 ([a516cec](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a516cecd599aedc63f628f2041e3eef0e0171922))
* 修复配音页面音频保存失败的问题 ([3134f71](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/3134f71c6ee8211c603f8f5cb4efe015e0ab52d4))
* 修改项目内页标题 ([40c420f](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/40c420fb9ae2dfd05bbea07bd81ecb0918309cbe))
* 新增邮箱验证码注册 ([1f55086](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/1f550865cbb28739be4bf214bdb5f3171fe06e5a))
* 深度推理和逐帧推理页面上传最大 5GB 的视频文件 ([3e091e4](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/3e091e402054e4a384694a29cfd11d0acfde1306))
* 生成视频步骤优化小 bug ([15c4aa5](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/15c4aa5193c01060fa3a813ba118eb1867d9e79e))
* 解决合并视频音频偏移 bug ([7f7b01e](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/7f7b01e78e2f81dbcb731a666ab6839e28c799a6))
* 解决音频链接跨越问题 ([8498657](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/84986576d03208214ea0fca17965349e4987233d))
* 配音页面生产环境直接播放音频 ([a2eba32](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/a2eba32e2ddfc2ac8a3cfee3cc2daacd8dc273f7))
* 门户定价数据获取 ([b81f044](https://github-personal/linyqh/NarratoAI-SaaS-F/commit/b81f044c339d26088649ebcf8011d9d42e691f56))
