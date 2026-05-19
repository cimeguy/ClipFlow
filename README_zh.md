# ClipFlow

macOS 剪贴板历史管理工具，常驻菜单栏。自动记录每一次复制，支持多选拼接、连续累积模式，一键导出为 Markdown。让剪贴板里的内容流动起来，而不是消失。

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/electron-42-blue)

## 下载

**[→ 最新版本下载](https://github.com/cimeguy/ClipFlow/releases)**

下载 `.dmg` 文件，打开后将 ClipFlow.app 拖入应用程序文件夹即可。

## 功能特性

- **剪贴板历史** — 自动捕获每一次文字和图片复制，持久化保存
- **多选拼接** — 选中多条历史，按自定义分隔符合并成一段文字，一键复制
- **连续复制模式** — 开启后多次复制的内容自动累积为一个缓冲区，完成后存入历史
- **导出 Markdown** — 将选中内容导出为 `.md` 文件，各条之间以 `---` 分隔；图片自动保存为 PNG 并在 Markdown 中引用
- **BibTeX 生成** — 粘贴 arXiv 链接、DOI 或论文标题，自动通过 CrossRef / arXiv API 生成 BibTeX 引用
- **拖拽排序** — 拖动历史条目自由调整顺序
- **深色模式** — 跟随 macOS 系统外观自动切换
- **数据持久化** — 历史记录和设置在重启后保留

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
npx electron-packager . ClipFlow --platform=darwin --arch=arm64 --overwrite --out=dist
```

打包结果在 `dist/ClipFlow-darwin-arm64/` 目录下。

## 使用方法

1. 启动应用 — 菜单栏出现回形针图标
2. **单击**图标打开 / 关闭历史面板
3. **双击**任意条目将其重新复制到剪贴板
4. 点击**多选**进入多选模式，勾选条目后点击**拼接**合并复制，或点击**导出 .md** 保存为 Markdown
5. 点击**设置**可配置历史条数上限、Markdown 导出目录，以及退出应用
6. **右键**菜单栏图标 → 退出

## 数据存储位置

```
~/Library/Application Support/clipboardmanager/
```

## License

MIT
