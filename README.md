# Avatar Agent Frontend

独立版本管理的数字人口播前端，采用 React、TypeScript、Vite 与 Mantine。本目录拥有自己的 `.git`、提交、标签和远程仓库；Go 后端和部署编排属于另一个 `avatar-agent-backend` 仓库。本仓库可以独立克隆、安装依赖和构建。

```powershell
npm ci
npm run build
npm test -- --run
```

日常开发执行 `npm run dev`；API 地址在本地 `.env.local` 配置 `VITE_API_BASE_URL=http://localhost:8080`，与现有 WSL 服务连接。模型密钥只保存在 WSL 服务端，不能写入任何 `VITE_*` 配置。依赖和包名沿用已有锁文件。

更新本机实际部署：从后端仓库执行 `deploy/wsl2/deploy.ps1 -Service frontend -FrontendPath <本仓库绝对路径>`。服务仍使用 `Ubuntu-24.04` 的 Docker，入口为 `http://localhost:8080/avatar-mvp`；仅前端更新不重建或重启 API。若本仓库位于后端工作区的 `frontend/`，可省略 `-FrontendPath`。部署后需实测页面与 API 可访问性。

前端的提交和推送只在本仓库中执行；不要在后端仓库强制添加 `frontend/`。默认分支为 `main`，`origin` 为私有仓库 [Linyings/avatar-agent-frontend](https://github.com/Linyings/avatar-agent-frontend)。配套后端为 [Linyings/avatar-agent-backend](https://github.com/Linyings/avatar-agent-backend)。

上游来源见 [UPSTREAM.json](UPSTREAM.json)，原始文档保留在 [docs/upstream-README.md](docs/upstream-README.md)。以下是保留的上游技术说明；其中产品名、域名和云发布方式不代表本项目的实际部署。原云发布 workflow 仅手动触发，本项目默认采用上述 WSL 部署入口。

---

# NarratoAI - 智能视频解说工具

<p align="left">
  <img src="https://img.shields.io/badge/version-1.4.4-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/React-19-61dafb.svg" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-8-646cff.svg" alt="Vite">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

基于 Mediabunny 的现代化视频分析工具，专为短剧解说和视频内容创作设计。

## 🛠️ 技术栈

### 前端
- **核心框架**: React 19.1 + TypeScript 5.8
- **构建工具**: Vite 8 + `@vitejs/plugin-react`
- **路由体系**: React Router 7（`BrowserRouter` + 路由懒加载）
- **样式系统**: Mantine 9.1 + `MantineProvider` + 统一主题配置
- **UI 组件**: Mantine Core / Hooks / Form / Notifications / Modals + 自定义业务组件
- **动效与可视化**: Framer Motion、Tabler Icons
- **媒体处理**: Mediabunny 1.40+、`@mediabunny/mp3-encoder`、`browser-image-compression`、JSZip
- **工程质量**: ESLint 9、Vitest、Testing Library、Playwright

### 后端（独立部署）
https://github.com/linyqh/NarratoAI-SaaS-B

### AI 接口响应契约

前端只接受两类 AI 接口形态：

- 端到端流式：前端使用 `text/event-stream` 时，后端也必须使用上游模型的流式请求并逐块转发，例如脚本生成、timeline 决策、timeline 图片分析和剧情理解。
- 普通 JSON 或异步轮询：供应商不支持流式时，前端应按 JSON、二进制响应或提交任务后轮询处理。

禁止新增“后端非流式等待完整模型响应，再用 SSE 包装给前端”的接口。此类场景会让 UI 看似流式但实际仍被后端阻塞，应改成端到端流式或普通 JSON/轮询。

### 部署
- **前端**: EdgeOne Pages（CDN 全球加速）/ Vercel / Docker
- **后端**: 独立服务器 / 云函数

---

## 🚀 快速开始

### 环境要求

- Node.js 20+
- npm 或 yarn

### 本地开发

```bash
# 1. 克隆项目
# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.local.example .env.local
# 编辑 .env.local，填入本地后端地址

# 4. 启动开发服务器
npm run dev

# 5. 访问 http://localhost:5173
```

### 构建测试

```bash
# 构建生产版本
npm run build

# 本地预览构建结果
npm run preview

# e2e 测试
npm run test:e2e
```

---

## 🌐 前端部署

当前前端是 Vite SPA，生产构建统一输出到 `dist`，并在构建后执行
`scripts/generate-resource-static.mjs` 生成资源中心静态页面、`sitemap.xml` 和
`robots.txt`。EdgeOne 与 Vercel 共用同一套构建命令：

```bash
npm ci
npm run build
```

### EdgeOne Pages

#### 必需的环境变量

在 EdgeOne 控制台配置以下环境变量：

```bash
VITE_SITE_URL=https://narratoai.cn
VITE_API_BASE_URL=https://api.narratoai.cn
VITE_R2_BASE_URL=https://r2.narratoai.cn
```

部署配置由 `edgeone.json` 管理：`/assets/*` 使用长期缓存，其余页面请求回退到
`/index.html` 以支持 React Router 深链。

### Vercel

Vercel 配置由 `vercel.json` 管理：

- Framework Preset: `Vite`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`

在 Vercel Project Settings 的 Environment Variables 中配置与 EdgeOne 相同的
Vite 环境变量。若 Vercel 绑定的是 `narratoai.co`，这里的公开站点域名应使用
`.co`，这样构建产物里的 `sitemap.xml`、`robots.txt`、canonical、Open Graph 与
JSON-LD 会全部指向 `narratoai.co`：

```bash
VITE_SITE_URL=https://narratoai.co
VITE_API_BASE_URL=https://api.narratoai.cn
VITE_R2_BASE_URL=https://r2.narratoai.cn
```

同一份静态构建产物不能同时为 `narratoai.cn` 和 `narratoai.co` 生成不同的
`/sitemap.xml`。两个域名都要收录时，应为两个域名单独触发构建，并分别设置
`VITE_SITE_URL`；如果只是备用域名，则建议将备用域名 301 跳转到主域名。

`vercel.json` 同样保留 `/assets/*` 长期缓存，并将未命中静态文件的路由重写到
`/index.html`，用于支持 `/projects`、`/admin/*` 等前端深链。

## 🏷️ 版本管理

项目采用 **changelogen** 和 **Conventional Commits** 进行自动化版本管理，遵循 [语义化版本规范](https://semver.org/lang/zh-CN/)。

### 发布新版本

#### 手动指定版本类型

```bash
# 修复 Bug（1.4.3 → 1.4.4）
npm run release:patch

# 新增功能（1.4.3 → 1.5.0）
npm run release:minor

# 重大更新（1.4.3 → 2.0.0）
npm run release:major

# 推送到远程
git push --follow-tags origin main
```

---

## 🔧 项目结构

```text
.
├── public/                         # 静态资源
├── src/
│   ├── assets/                     # 图片与静态素材
│   ├── config/                     # 功能开关与运行时配置
│   ├── contexts/                   # 全局上下文
│   ├── features/                   # 按业务域拆分的核心模块
│   │   ├── admin/                  # 管理后台能力
│   │   ├── auth/                   # 登录、注册、鉴权与路由守卫
│   │   ├── capcut-export/          # 剪映导出相关能力
│   │   ├── invitations/            # 邀请码相关能力
│   │   ├── projects/               # 项目、分镜、素材与处理流程
│   │   └── subscriptions/          # 套餐与订阅能力
│   ├── lib/                        # 基础工具库
│   ├── pages/                      # 页面级组件
│   │   └── admin/                  # 管理端页面
│   ├── routes/                     # 路由定义与懒加载入口
│   ├── shared/                     # 跨业务共享资源
│   │   ├── components/
│   │   │   ├── animations/         # 动效组件
│   │   │   ├── effects/            # 视觉效果组件
│   │   │   ├── feedback/           # Toast、加载态等反馈组件
│   │   │   ├── layout/             # 应用布局组件
│   │   │   ├── tts/                # 语音相关组件
│   │   │   ├── ui/                 # 基础 UI 原子组件与通用业务组件
│   │   │   └── video/              # 视频展示组件
│   │   ├── constants/              # 共享常量
│   │   ├── contexts/               # 共享上下文
│   │   ├── hooks/                  # 共享 hooks
│   │   ├── services/               # 共享服务
│   │   ├── shims/                  # 兼容层与 polyfill
│   │   ├── styles/                 # 样式扩展
│   │   ├── types/                  # 共享类型
│   │   └── utils/                  # 通用工具函数
│   ├── test/                       # 单元测试初始化
│   ├── App.tsx                     # 应用根组件
│   └── main.tsx                    # 应用入口
├── tests/
│   └── e2e/                        # Playwright 端到端测试
├── docs/                           # 项目文档
├── vite.config.ts                  # Vite 配置（别名、分包、代理）
├── vitest.config.ts                # Vitest 配置
└── playwright.config.ts            # Playwright 配置
```

---
