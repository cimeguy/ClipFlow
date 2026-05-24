# ClipFlow

A macOS clipboard history manager that lives in your menu bar. Automatically captures every copy, lets you compose multiple clips into one, and accumulates text continuously across copies. Built-in OCR, AI image recognition, and AI chat powered by Claude. Export to Markdown in one click. Keep your clipboard flowing, not forgetting.

![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Electron](https://img.shields.io/badge/electron-42-blue)

## Download

**[→ Latest Release](https://github.com/cimeguy/ClipFlow/releases)**

Download the `.dmg`, open it, and drag ClipFlow.app to your Applications folder.

## Features

### Clipboard Management
- **Clipboard history** — automatically captures text and images as you copy
- **Multi-select & compose** — select multiple items and join them with a custom separator
- **Export to Markdown** — export selected items as a `.md` file, with `---` dividers between entries; images are saved as PNG files alongside
- **BibTeX generation** — paste an arXiv URL, DOI, or paper title to auto-generate a BibTeX citation via CrossRef / arXiv API
- **Continuous copy mode** — multiple copies accumulate into one buffer before being saved as a single history entry
- **Drag to reorder** — drag history items to rearrange them

### AI & Recognition
- **OCR recognition** — local macOS Vision framework OCR, supports Chinese & English, fast and offline
- **AI image recognition** — Claude API vision for intelligent image content understanding
- **AI chat (image)** — ask questions about images with streaming responses, conversation history cached
- **AI chat (text)** — ask questions based on copied text content with streaming responses
- **Speech/writing assistant** — Claude-powered streaming text generation

### Image Viewer
- **Dedicated viewer window** — large window (66% width × 80% height) with image preview, OCR results, and AI chat
- **Full-screen image preview** — click image to open in a separate full-view window
- **Clipboard history sidebar** — right-side panel with resizable splitter, hover preview popup, click to copy
- **Pin & minimize** — always-on-top toggle and minimize support

### System Integration
- **Menu bar app** — lives in the menu bar, hidden from Dock (LSUIElement)
- **Dark mode** — follows macOS system appearance
- **Persistent storage** — history, settings, OCR results, and chat history survive restarts

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
npx electron-packager . ClipFlow --platform=darwin --arch=arm64 --overwrite --out=dist \
  --extend-info=extend-info.plist
```

The packaged app will be in `dist/ClipFlow-darwin-arm64/`.

## AI Configuration

To enable AI features (image recognition, AI chat), configure Claude API settings:

1. Open Settings in the app
2. Set the path to your `settings.json` containing:
   - `ANTHROPIC_BASE_URL` — API endpoint
   - `ANTHROPIC_AUTH_TOKEN` — authentication token
   - `ANTHROPIC_MODEL` — model name (e.g., `Claude-Sonnet-4.6`)

## Usage

1. Launch the app — a butterfly icon appears in the menu bar
2. **Click** the icon to open/close the history panel
3. **Double-click** any item to copy it back to clipboard
4. For images: click the eye icon to open the Image Viewer with OCR and AI chat
5. For text: click the AI button to open a text-based AI chat window
6. Click **多选** to enter multi-select mode, then pick items and click **拼接** to join and copy, or **导出 .md** to save as Markdown
7. Click **设置** to configure history limits, Markdown export directory, Claude API settings, and to quit the app
8. **Right-click** the tray icon → Quit to exit

## Data Storage

History and settings are stored in:
```
~/Library/Application Support/clipflow/
```

## License

MIT
