const { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

const POLL_INTERVAL = 500
const DATA_FILE = path.join(app.getPath('userData'), 'history.json')
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')

let settings = { maxText: 50, maxImage: 20, markdownExportPath: '', markdownFilename: 'clipboard-history.md', markdownExportMode: 'append' }

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE))
      settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }
  } catch {}
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings), 'utf8')
}

let tray = null
let win = null
let history = []
let lastText = ''
let lastImageHash = ''
let continuousMode = false
let continuousBuffer = ''
let suppressNext = false

// ── Persistence ───────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      history = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    }
  } catch {}
}

function saveHistory() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(history), 'utf8')
  } catch {}
}

// ── Clipboard polling ─────────────────────────────────────────────────────────

function pollClipboard() {
  if (suppressNext) {
    suppressNext = false
    return
  }

  const text = clipboard.readText()
  const img = clipboard.readImage()
  const imageHash = img.isEmpty() ? '' : img.toDataURL().slice(0, 64)

  console.log('[poll] text:', JSON.stringify(text?.slice(0,40)), '| lastText:', JSON.stringify(lastText?.slice(0,40)), '| changed:', text !== lastText)

  if (text && text !== lastText) {
    lastText = text
    lastImageHash = ''
    if (continuousMode) {
      continuousBuffer = continuousBuffer ? continuousBuffer + '\n' + text : text
      suppressNext = true
      clipboard.writeText(continuousBuffer)
      lastText = continuousBuffer
      sendToWindow('continuous-buffer', continuousBuffer)
    } else {
      addItem({ type: 'text', value: text, ts: Date.now() })
    }
  } else if (!img.isEmpty() && imageHash !== lastImageHash) {
    lastImageHash = imageHash
    lastText = ''
    addItem({ type: 'image', value: img.toDataURL(), ts: Date.now() })
  }
}

function addItem(item) {
  history.unshift(item)
  const maxT = settings.maxText, maxI = settings.maxImage
  let tc = 0, ic = 0
  history = history.filter(h => {
    if (h.type === 'text') { tc++; return tc <= maxT }
    else { ic++; return ic <= maxI }
  })
  saveHistory()
  appendMarkdown(item)
  sendToWindow('history-update', history)
}

function itemToMarkdownBlock(item, dir) {
  const ts = new Date(item.ts).toLocaleString('zh-CN', { hour12: false })
  if (item.type === 'text') {
    return `\n## ${ts}\n\n${item.value}\n`
  } else {
    const imgFilename = `clipboard-img-${item.ts}.png`
    const imgPath = path.join(dir, imgFilename)
    const b64 = item.value.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(imgPath, Buffer.from(b64, 'base64'))
    return `\n## ${ts}\n\n![image](./${imgFilename})\n`
  }
}

function appendMarkdown(item) {
  const dir = settings.markdownExportPath
  if (!dir) return
  try {
    const filename = settings.markdownFilename || 'clipboard-history.md'
    const file = path.join(dir, filename)
    if (settings.markdownExportMode === 'overwrite') {
      // Rewrite entire file from current history
      const content = history.map(h => itemToMarkdownBlock(h, dir)).join('')
      fs.writeFileSync(file, `# 剪贴板历史\n${content}`, 'utf8')
    } else {
      // Append only the new item
      const block = itemToMarkdownBlock(item, dir)
      fs.appendFileSync(file, block, 'utf8')
    }
  } catch (e) {
    console.error('markdown export failed:', e.message)
  }
}

function sendToWindow(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'ClipboardManager/1.0 (mailto:user@example.com)' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject)
      }
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ── BibTeX generation ─────────────────────────────────────────────────────────

function extractArxivId(text) {
  const m = text.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]+(?:v\d+)?)/i)
      || text.match(/\b([0-9]{4}\.[0-9]{4,5}(?:v\d+)?)\b/)
  return m ? m[1].replace(/v\d+$/, '') : null
}

function extractDoi(text) {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i)
  return m ? m[1] : null
}

function crossrefToBibtex(item) {
  const type = item.type === 'journal-article' ? 'article' :
               item.type === 'proceedings-article' ? 'inproceedings' :
               item.type === 'book' ? 'book' : 'misc'

  const authors = (item.author || []).map(a => {
    const last = a.family || a.name || 'Unknown'
    const first = a.given || ''
    return first ? `${last}, ${first}` : last
  })

  const titleStr = (item.title || ['Untitled'])[0]
  const year = item.published?.['date-parts']?.[0]?.[0]
      || item['published-print']?.['date-parts']?.[0]?.[0]
      || item['published-online']?.['date-parts']?.[0]?.[0]
      || ''
  const journal = (item['container-title'] || [])[0] || ''
  const volume = item.volume || ''
  const number = item.issue || ''
  const pages = item.page || ''
  const doi = item.DOI || ''
  const url = item.URL || ''

  const lastName = (item.author?.[0]?.family || 'unknown').toLowerCase().replace(/[^a-z]/g, '')
  const key = `${lastName}${year}${titleStr.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}`

  const fields = []
  if (authors.length) fields.push(`  author    = {${authors.join(' and ')}}`)
  fields.push(`  title     = {${titleStr}}`)
  if (year) fields.push(`  year      = {${year}}`)
  if (journal) fields.push(`  journal   = {${journal}}`)
  if (volume) fields.push(`  volume    = {${volume}}`)
  if (number) fields.push(`  number    = {${number}}`)
  if (pages) fields.push(`  pages     = {${pages}}`)
  if (doi) fields.push(`  doi       = {${doi}}`)
  if (url) fields.push(`  url       = {${url}}`)

  return `@${type}{${key},\n${fields.join(',\n')}\n}`
}

function arxivToBibtex(entry) {
  const id = entry.id?.match(/(\d{4}\.\d+)/)?.[1] || 'unknown'
  const title = entry.title?.replace(/\s+/g, ' ').trim() || 'Untitled'
  const authors = (entry.author instanceof Array ? entry.author : [entry.author])
    .map(a => a?.name || '').filter(Boolean)
  const year = entry.published?.slice(0, 4) || ''
  const arxivId = entry.id?.match(/abs\/(.+)/)?.[1] || id

  const lastName = authors[0]?.split(' ').pop()?.toLowerCase().replace(/[^a-z]/g, '') || 'unknown'
  const key = `${lastName}${year}${title.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}`

  const fields = []
  if (authors.length) fields.push(`  author        = {${authors.join(' and ')}}`)
  fields.push(`  title         = {${title}}`)
  if (year) fields.push(`  year          = {${year}}`)
  fields.push(`  archivePrefix = {arXiv}`)
  fields.push(`  eprint        = {${arxivId}}`)
  fields.push(`  primaryClass  = {${entry.arxiv_primary_category?.term || 'cs'}}`)

  return `@misc{${key},\n${fields.join(',\n')}\n}`
}

async function fetchBibtex(text) {
  // 1. arXiv
  const arxivId = extractArxivId(text)
  if (arxivId) {
    const url = `https://export.arxiv.org/api/query?id_list=${arxivId}`
    const res = await httpGet(url)
    if (res.status === 200) {
      const entry = parseArxivAtom(res.body)
      if (entry) return { bib: arxivToBibtex(entry), matchedTitle: entry.title, isSearch: false }
    }
  }

  // 2. DOI via CrossRef
  const doi = extractDoi(text)
  if (doi) {
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
    const res = await httpGet(url)
    if (res.status === 200) {
      const data = JSON.parse(res.body)
      const bib = crossrefToBibtex(data.message)
      return { bib, matchedTitle: (data.message.title || [''])[0], isSearch: false }
    }
  }

  // 3. Title search via CrossRef — return candidates for user to pick
  const q = encodeURIComponent(text.slice(0, 200))
  const url = `https://api.crossref.org/works?query.bibliographic=${q}&rows=5&select=title,author,published,type,DOI,URL,container-title,volume,issue,page`
  const res = await httpGet(url)
  if (res.status === 200) {
    const data = JSON.parse(res.body)
    const items = data.message?.items
    if (items?.length) {
      return {
        needsPick: true,
        candidates: items.map(item => ({
          title: (item.title || ['Untitled'])[0],
          year: item.published?.['date-parts']?.[0]?.[0] || '',
          authors: (item.author || []).slice(0, 2).map(a => a.family || '').filter(Boolean).join(', '),
          bib: crossrefToBibtex(item)
        }))
      }
    }
  }

  throw new Error('未找到匹配的文献')
}

function parseArxivAtom(xml) {
  // Minimal XML parser for arXiv Atom feed
  const get = (tag, src) => src?.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim()
  const getAll = (tag, src) => [...(src?.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g')) || [])].map(m => m[1].trim())
  const getAttr = (tag, attr, src) => src?.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`))?.[1]

  const entry = get('entry', xml)
  if (!entry) return null

  const authors = getAll('name', entry).map(name => ({ name }))
  const categories = [...(entry.matchAll(/<arxiv:primary_category[^>]*term="([^"]+)"/g) || [])].map(m => ({ term: m[1] }))

  return {
    id: get('id', entry),
    title: get('title', entry),
    author: authors,
    published: get('published', entry),
    arxiv_primary_category: categories[0] || { term: 'cs' }
  }
}

// ── IPC: BibTeX ───────────────────────────────────────────────────────────────

ipcMain.handle('fetch-bibtex', async (_, text) => {
  try {
    const result = await fetchBibtex(text)
    return { ok: true, ...result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('pick-export-dir', async () => {
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: '选择 Markdown 导出目录',
    properties: ['openDirectory', 'createDirectory']
  })
  return filePaths?.[0] || null
})

ipcMain.handle('save-compose-md', async (_, { items, mode, filename, defaultDir }) => {
  try {
    function buildContent(targetDir) {
      return (items || []).map(item => {
        if (item.type === 'text') return item.value
        const imgFilename = `clipboard-img-${item.ts}.png`
        const b64 = item.value.replace(/^data:image\/\w+;base64,/, '')
        fs.writeFileSync(path.join(targetDir, imgFilename), Buffer.from(b64, 'base64'))
        return `![image](./${imgFilename})`
      }).join('\n\n---\n\n')
    }

    let targetDir = defaultDir
    if (!targetDir) {
      const { filePath } = await dialog.showSaveDialog(win, {
        title: '导出拼接结果为 Markdown',
        defaultPath: filename || 'clipboard-export.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (!filePath) return { ok: false }
      targetDir = path.dirname(filePath)
      fs.writeFileSync(filePath, buildContent(targetDir) + '\n', 'utf8')
      return { ok: true }
    }

    const file = path.join(targetDir, filename || 'clipboard-export.md')
    const content = buildContent(targetDir)
    if (mode === 'overwrite') {
      fs.writeFileSync(file, content + '\n', 'utf8')
    } else {
      const exists = fs.existsSync(file) && fs.statSync(file).size > 0
      fs.appendFileSync(file, (exists ? '\n\n---\n\n' : '') + content + '\n', 'utf8')
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('save-bib-file', async (_, content) => {
  const { filePath } = await dialog.showSaveDialog(win, {
    title: '导出 BibTeX',
    defaultPath: 'references.bib',
    filters: [{ name: 'BibTeX', extensions: ['bib'] }]
  })
  if (!filePath) return { ok: false }
  fs.writeFileSync(filePath, content, 'utf8')
  return { ok: true, path: filePath }
})

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 380,
    height: 540,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  win.loadFile('index.html')
  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })
}

function toggleWindow() {
  if (!win) return
  if (win.isVisible()) { win.hide(); return }
  const trayBounds = tray.getBounds()
  const winBounds = win.getBounds()
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  const y = trayBounds.y > 400 ? trayBounds.y - winBounds.height - 4 : trayBounds.y + trayBounds.height + 4
  win.setPosition(x, y)
  win.show()
  win.focus()
}

// ── IPC: clipboard / history ──────────────────────────────────────────────────

ipcMain.handle('get-history', () => history)
ipcMain.handle('get-continuous-state', () => ({ enabled: continuousMode, buffer: continuousBuffer }))
ipcMain.handle('get-settings', () => settings)
ipcMain.on('save-settings', (_, s) => {
  settings = { ...settings, ...s }
  saveSettings()
  // re-trim history with new limits
  let tc = 0, ic = 0
  history = history.filter(h => {
    if (h.type === 'text') { tc++; return tc <= settings.maxText }
    else { ic++; return ic <= settings.maxImage }
  })
  saveHistory()
  sendToWindow('history-update', history)
})

ipcMain.on('write-clipboard', (_, text) => {
  suppressNext = true
  clipboard.writeText(text)
  lastText = text
})

ipcMain.on('recopy', (_, item) => {
  suppressNext = true
  if (item.type === 'text') {
    clipboard.writeText(item.value)
    lastText = item.value
  } else {
    const img = nativeImage.createFromDataURL(item.value)
    clipboard.writeImage(img)
    lastText = ''
    lastImageHash = item.value.slice(0, 64)
  }
  // do not modify history — just put it on clipboard silently
})

ipcMain.on('set-continuous-mode', (_, enabled) => {
  if (!enabled && continuousBuffer) {
    flushContinuousBuffer()
  }
  continuousMode = enabled
  if (enabled) { continuousBuffer = ''; sendToWindow('continuous-buffer', '') }
})

ipcMain.on('flush-continuous-buffer', () => {
  if (continuousBuffer) flushContinuousBuffer()
})

function flushContinuousBuffer() {
  const final = continuousBuffer
  suppressNext = true
  clipboard.writeText(final)
  lastText = final
  addItem({ type: 'text', value: final, ts: Date.now() })
  continuousBuffer = ''
  sendToWindow('continuous-buffer', '')
}

ipcMain.on('set-tray-icon', (_, dataUrl) => {
  const img = nativeImage.createFromDataURL(dataUrl, { scaleFactor: 2.0 })
  img.setTemplateImage(true)
  tray.setImage(img)
})

ipcMain.on('quit-app', () => app.quit())

ipcMain.on('clear-history', () => {
  history = []
  saveHistory()
  sendToWindow('history-update', history)
})

ipcMain.on('delete-item', (_, ts) => {
  history = history.filter(h => h.ts !== ts)
  saveHistory()
  sendToWindow('history-update', history)
})

ipcMain.on('reorder-history', (_, newOrder) => {
  history = newOrder
  saveHistory()
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.dock?.hide()
  loadSettings()
  loadHistory()

  const iconPath = path.join(__dirname, 'tray-icon.png')
  let trayIcon
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath)
  } else {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4jWNgYGD4z8BQDwAAAP//AwBi2gMkAABHuQAAAABJRU5ErkJggg==', 'base64')
    fs.writeFileSync(iconPath, png)
    trayIcon = nativeImage.createFromPath(iconPath)
  }
  trayIcon.setTemplateImage(true)

  tray = new Tray(trayIcon)
  tray.setToolTip('Clipboard Manager')
  tray.on('click', toggleWindow)
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: '退出', click: () => app.quit() }
    ]))
  })

  createWindow()

  lastText = clipboard.readText()
  const initImg = clipboard.readImage()
  lastImageHash = initImg.isEmpty() ? '' : initImg.toDataURL().slice(0, 64)

  setInterval(pollClipboard, POLL_INTERVAL)
})

app.on('window-all-closed', () => {})
