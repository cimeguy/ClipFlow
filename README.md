# ClipFlow

macOS 剪贴板历史管理工具，常驻菜单栏。自动记录每一次复制，支持多选拼接、连续累积模式，内置 OCR 识别、AI 图片识别与 AI 问询（基于 Claude），一键导出 Markdown。让剪贴板里的内容流动起来，而不是消失。

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/electron-42-blue)

[English](README_en.md)

## 下载

**[→ 最新版本下载](https://github.com/cimeguy/ClipFlow/releases)**

下载 `.dmg` 文件，打开后将 ClipFlow.app 拖入应用程序文件夹即可。

## 功能特性

### 剪贴板管理
- **剪贴板历史** — 自动捕获每一次文字和图片复制，持久化保存
- **多选拼接** — 选中多条历史，按自定义分隔符合并成一段文字，一键复制
- **连续复制模式** — 开启后多次复制的内容自动累积为一个缓冲区，完成后存入历史
- **导出 Markdown** — 将选中内容导出为 `.md` 文件，各条之间以 `---` 分隔；图片自动保存为 PNG 并在 Markdown 中引用
- **BibTeX 生成** — 粘贴 arXiv 链接、DOI 或论文标题，自动通过 CrossRef / arXiv API 生成 BibTeX 引用
- **拖拽排序** — 拖动历史条目自由调整顺序

### AI & 识别
- **OCR 识别** — 基于 macOS Vision 框架的本地 OCR，支持中英文，速度快、无需联网
- **AI 图片识别** — 调用 Claude API Vision 能力，智能理解图片内容
- **AI 问询（图片）** — 基于图片向 AI 提问，流式输出回复，对话记录自动缓存
- **AI 问询（文字）** — 基于复制的文本内容向 AI 提问，流式输出回复
- **演讲稿/写作助手** — Claude 驱动的流式文本生成

### 图片查看器
- **独立查看窗口** — 大窗口（66% 宽 × 80% 高），上方图片预览 + 下方左右分栏（OCR 结果 / AI 问询）
- **图片缩放** — 放大镜光标，点击图片在该位置放大，支持滚轮、触控板捏合缩放及双击复位
- **拖拽平移** — 放大后按住拖动浏览图片细节
- **原生快速预览** — 点击剪贴板历史中的图片缩略图，直接调用 macOS Quick Look 弹出预览
- **剪贴板历史侧栏** — 右侧面板，可拖拽分隔栏调整宽度，悬停弹出预览气泡，点击直接复制
- **置顶 & 最小化** — 支持窗口置顶固定和最小化

### 系统集成
- **菜单栏应用** — 常驻菜单栏，不显示在 Dock 中
- **深色模式** — 跟随 macOS 系统外观自动切换
- **数据持久化** — 历史记录、设置、OCR 结果、对话记录均在重启后保留

## 环境要求

- macOS（Apple Silicon 或 Intel）
- Node.js 18+

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式运行
npm start
```

## 打包构建

```bash
# 打包为 macOS arm64 应用
npx electron-packager . ClipFlow --platform=darwin --arch=arm64 --overwrite --out=dist \
  --extend-info=extend-info.plist
```

打包结果在 `dist/ClipFlow-darwin-arm64/` 目录下。

## AI 配置

启用 AI 功能（图片识别、AI 问询）需要配置 Claude API：

1. 打开应用设置
2. 设置 `settings.json` 路径，其中包含：
   - `ANTHROPIC_BASE_URL` — API 端点地址
   - `ANTHROPIC_AUTH_TOKEN` — 认证 Token
   - `ANTHROPIC_MODEL` — 模型名称（如 `Claude-Sonnet-4.6`）

## 使用方法

1. 启动应用 — 菜单栏出现蝴蝶图标
2. **单击**图标打开 / 关闭历史面板
3. **双击**任意条目将其重新复制到剪贴板
4. 图片条目：点击眼睛图标打开图片查看器，可进行 OCR 识别和 AI 问询
5. 文字条目：点击 AI 按钮打开文字 AI 问询窗口
6. 点击**多选**进入多选模式，勾选条目后点击**拼接**合并复制，或点击**导出 .md** 保存为 Markdown
7. 点击**设置**可配置历史条数上限、Markdown 导出目录、Claude API 设置，以及退出应用
8. **右键**菜单栏图标 → 退出

## 数据存储位置

```
~/Library/Application Support/clipflow/
```

## License

MIT
