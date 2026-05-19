# ClipboardManager

A macOS clipboard history manager built with Electron. Lives in the menu bar as a paperclip icon.

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/electron-42-blue)

## Features

- **Clipboard history** — automatically captures text and images as you copy
- **Multi-select & compose** — select multiple items and join them with a custom separator
- **Export to Markdown** — export selected items as a `.md` file, with `---` dividers between entries; images are saved as PNG files alongside
- **BibTeX generation** — paste an arXiv URL, DOI, or paper title to auto-generate a BibTeX citation via CrossRef / arXiv API
- **Continuous copy mode** — multiple copies accumulate into one buffer before being saved as a single history entry
- **Drag to reorder** — drag history items to rearrange them
- **Dark mode** — follows macOS system appearance
- **Persistent storage** — history and settings survive restarts

## Requirements

- macOS (Apple Silicon or Intel)
- Node.js 18+

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm start
```

## Build

```bash
# Package for macOS (arm64)
npx electron-packager . ClipboardManager --platform=darwin --arch=arm64 --overwrite --out=dist
```

The packaged app will be in `dist/ClipboardManager-darwin-arm64/`.

## Usage

1. Launch the app — a paperclip icon (📎) appears in the menu bar
2. **Click** the icon to open/close the history panel
3. **Double-click** any item to copy it back to clipboard
4. Click **多选** to enter multi-select mode, then pick items and click **拼接** to join and copy, or **导出 .md** to save as Markdown
5. Click **设置** to configure history limits, Markdown export directory, and to quit the app
6. **Right-click** the tray icon → Quit to exit

## Data Storage

History and settings are stored in:
```
~/Library/Application Support/clipboardmanager/
```

## License

MIT
