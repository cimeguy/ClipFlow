const { app, BrowserWindow, Tray, Menu, clipboard, nativeImage, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')

const POLL_INTERVAL = 500
const DATA_FILE = path.join(app.getPath('userData'), 'history.json')
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')

let settings = { maxText: 50, maxImage: 20, markdownExportPath: '', markdownFilename: 'clipboard-history.md', markdownExportMode: 'append', claudeSettingsPath: '' }

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
let speechWins = []
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
      headers: { 'User-Agent': 'ClipFlow/1.0 (mailto:user@example.com)' }
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

// ── Claude API ────────────────────────────────────────────────────────────────

function loadClaudeConfig() {
  const settingsPath = settings.claudeSettingsPath
    ? settings.claudeSettingsPath.replace(/^~/, require('os').homedir())
    : path.join(require('os').homedir(), '.claude', 'settings.json')
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    return {
      apiKey: raw.env?.ANTHROPIC_AUTH_TOKEN || '',
      baseUrl: raw.env?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
      model: raw.env?.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
    }
  } catch (e) {
    throw new Error(`无法读取 Claude 配置: ${e.message}`)
  }
}

function claudeRequest(cfg, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body))
    const baseUrl = new URL(cfg.baseUrl)
    const isHttps = baseUrl.protocol === 'https:'
    const lib = isHttps ? https : http
    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (isHttps ? 443 : 80),
      path: (baseUrl.pathname.replace(/\/$/, '')) + '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      }
    }
    const req = lib.request(options, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(payload)
    req.end()
  })
}

function claudeRequestStream(cfg, body, onChunk) {
  let activeReq = null
  const promise = new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify({ ...body, stream: true }))
    const baseUrl = new URL(cfg.baseUrl)
    const isHttps = baseUrl.protocol === 'https:'
    const lib = isHttps ? https : http
    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || (isHttps ? 443 : 80),
      path: (baseUrl.pathname.replace(/\/$/, '')) + '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      }
    }
    const req = lib.request(options, res => {
      if (res.statusCode !== 200) {
        let body = ''
        res.on('data', d => body += d)
        res.on('end', () => {
          let msg = `API 返回 ${res.statusCode}`
          try { msg = JSON.parse(body)?.error?.message || msg } catch {}
          reject(new Error(msg))
        })
        return
      }
      let buf = ''
      res.on('data', chunk => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const evt = JSON.parse(data)
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              onChunk(evt.delta.text)
            }
          } catch {}
        }
      })
      res.on('end', () => resolve())
    })
    req.on('error', e => {
      if (e.code === 'ECONNRESET' || e.message === 'aborted') resolve()
      else reject(e)
    })
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(payload)
    req.end()
    activeReq = req
  })
  promise.abort = () => { if (activeReq) activeReq.destroy() }
  return promise
}

const activeSpeechRequests = new Map()

ipcMain.on('claude-speech-stream', async (event, content, stylePrompt, refText) => {
  if (event.sender.isDestroyed()) return
  const id = event.sender.id
  if (activeSpeechRequests.has(id)) { activeSpeechRequests.get(id).abort(); activeSpeechRequests.delete(id) }
  try {
    const cfg = loadClaudeConfig()
    if (!cfg.apiKey) throw new Error('未找到 ANTHROPIC_AUTH_TOKEN，请检查 Claude 配置路径')
    const stylePart = stylePrompt || '语言自然口语化，像平时说话一样，重点说清楚就行，长度300字左右。'
    const refPart = refText
      ? `\n\n以下是该用户平时的真实口头表达样本，请仔细模仿其用词习惯、句式风格、语气和节奏，让生成结果听起来像是他本人说的：\n"""\n${refText}\n"""`
      : ''
    const req = claudeRequestStream(cfg, {
      model: cfg.model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `你是一个帮人准备组会口头汇报的助手。根据下面的工作要点，帮我生成一段自然的口头汇报内容，像是在组会上直接说出来的，不要太正式，不要像演讲稿，语气自然随意一点，但要把要点说清楚。风格要求：${stylePart}${refPart}\n\n工作要点：\n${content}`
      }]
    }, chunk => {
      try { if (!event.sender.isDestroyed()) event.sender.send('speech-chunk', chunk) } catch {}
    })
    activeSpeechRequests.set(id, req)
    await req
    activeSpeechRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('speech-done') } catch {}
  } catch (e) {
    activeSpeechRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('speech-error', e.message) } catch {}
  }
})

ipcMain.on('claude-speech-abort', (event) => {
  try {
    if (event.sender.isDestroyed()) return
    const id = event.sender.id
    if (activeSpeechRequests.has(id)) { activeSpeechRequests.get(id).abort(); activeSpeechRequests.delete(id) }
  } catch {}
})

ipcMain.handle('recognize-image', async (_, dataUrl) => {
  try {
    const cfg = loadClaudeConfig()
    if (!cfg.apiKey) return { error: '未找到 ANTHROPIC_AUTH_TOKEN，请检查 Claude 配置路径' }
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!match) return { error: '无效的图片数据' }
    const mediaType = match[1]
    const b64 = match[2]
    const res = await claudeRequest(cfg, {
      model: cfg.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: '请识别并提取这张图片中的所有文字内容，保持原始排版格式。如果图片中没有文字，请简短描述图片内容。' }
        ]
      }]
    })
    if (res.status !== 200) {
      const err = JSON.parse(res.body)
      return { error: err.error?.message || `API 错误 (${res.status})` }
    }
    const data = JSON.parse(res.body)
    const text = data.content?.map(c => c.text).join('') || ''
    return { text }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('ocr-image', async (_, dataUrl) => {
  try {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!match) return { error: '无效的图片数据' }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
    const tmpFile = path.join(app.getPath('temp'), `clipflow-ocr-${Date.now()}.${ext}`)
    fs.writeFileSync(tmpFile, Buffer.from(match[2], 'base64'))
    const { execFile } = require('child_process')
    const text = await new Promise((resolve, reject) => {
      execFile('swift', [path.join(__dirname, 'ocr.swift'), tmpFile], { timeout: 15000 }, (err, stdout, stderr) => {
        fs.unlinkSync(tmpFile)
        if (err) reject(new Error(stderr || err.message))
        else resolve(stdout.trim())
      })
    })
    return { text }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('ai-ask-image', async (_, dataUrl, question) => {
  return { stream: true }
})

const activeAskRequests = new Map()

ipcMain.on('ai-ask-stream', async (event, dataUrl, question) => {
  if (event.sender.isDestroyed()) return
  const id = event.sender.id
  if (activeAskRequests.has(id)) { activeAskRequests.get(id).abort(); activeAskRequests.delete(id) }
  try {
    const cfg = loadClaudeConfig()
    if (!cfg.apiKey) throw new Error('未找到 ANTHROPIC_AUTH_TOKEN，请检查 Claude 配置路径')
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!match) throw new Error('无效的图片数据')
    const mediaType = match[1]
    const b64 = match[2]
    const req = claudeRequestStream(cfg, {
      model: cfg.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: question }
        ]
      }]
    }, text => {
      try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-chunk', text) } catch {}
    })
    activeAskRequests.set(id, req)
    await req
    if (!activeAskRequests.has(id)) return
    activeAskRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-done') } catch {}
  } catch (e) {
    activeAskRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-error', e.message) } catch {}
  }
})

ipcMain.on('ai-ask-abort', (event) => {
  try {
    if (event.sender.isDestroyed()) return
    const id = event.sender.id
    if (activeAskRequests.has(id)) { activeAskRequests.get(id).abort(); activeAskRequests.delete(id) }
  } catch {}
})

ipcMain.on('ai-text-stream', async (event, contextText, question) => {
  if (event.sender.isDestroyed()) return
  const id = event.sender.id
  if (activeAskRequests.has(id)) { activeAskRequests.get(id).abort(); activeAskRequests.delete(id) }
  try {
    const cfg = loadClaudeConfig()
    if (!cfg.apiKey) throw new Error('未找到 ANTHROPIC_AUTH_TOKEN，请检查 Claude 配置路径')
    const req = claudeRequestStream(cfg, {
      model: cfg.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `以下是一段文本内容：\n\n"""\n${contextText}\n"""\n\n${question}`
      }]
    }, text => {
      try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-chunk', text) } catch {}
    })
    activeAskRequests.set(id, req)
    await req
    if (!activeAskRequests.has(id)) return
    activeAskRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-done') } catch {}
  } catch (e) {
    activeAskRequests.delete(id)
    try { if (!event.sender.isDestroyed()) event.sender.send('ai-ask-error', e.message) } catch {}
  }
})

function createSpeechWindow(initData) {
  const w = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 380,
    minHeight: 500,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.setAlwaysOnTop(true, 'floating')
  const hash = initData ? '#' + encodeURIComponent(JSON.stringify(initData)) : ''
  w.loadFile('speech.html', { hash })
  const wcId = w.webContents.id
  w.on('closed', () => {
    const i = speechWins.indexOf(w)
    if (i !== -1) speechWins.splice(i, 1)
    activeSpeechRequests.delete(wcId)
  })
  speechWins.push(w)
  return w
}

ipcMain.on('open-speech-window', () => {
  if (speechWins.length === 0) createSpeechWindow()
  else { speechWins[0].show(); speechWins[0].focus() }
})

ipcMain.on('new-speech-window', (_, initData) => {
  createSpeechWindow(initData)
})

ipcMain.on('close-speech-window', (event) => {
  try {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (w && !w.isDestroyed()) w.close()
  } catch {}
})

const TITLEBAR_H = 36

ipcMain.on('speech-set-collapsed', (event, collapsed) => {
  try {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w || w.isDestroyed()) return
    const [x, y, width, height] = [...w.getPosition(), ...w.getSize()]
    if (collapsed) {
      w._expandedBounds = { x, y, width, height }
      w.setMinimumSize(200, TITLEBAR_H)
      w.setResizable(false)
      w.setBounds({ x, y, width, height: TITLEBAR_H }, true)
    } else {
      const b = w._expandedBounds || { x, y, width, height: 680 }
      w.setMinimumSize(380, 500)
      w.setResizable(true)
      w.setBounds(b, true)
    }
  } catch {}
})

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

    const baseName = (filename || 'clipboard-export.md').replace(/\.md$/i, '')
    let file = path.join(targetDir, baseName + '.md')
    const content = buildContent(targetDir)
    if (mode === 'overwrite') {
      if (fs.existsSync(file)) {
        const now = new Date()
        const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`
        file = path.join(targetDir, `${baseName}_${ts}.md`)
      }
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

ipcMain.handle('export-ai-md', async (_, text) => {
  try {
    const dir = settings.markdownExportPath
    if (!dir) {
      const { filePath } = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || win, {
        title: '导出 AI 回复为 Markdown',
        defaultPath: 'ai-response.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (!filePath) return { ok: false }
      fs.writeFileSync(filePath, text + '\n', 'utf8')
      return { ok: true }
    }
    const filename = settings.markdownFilename || 'clipboard-history.md'
    const file = path.join(dir, filename)
    const exists = fs.existsSync(file) && fs.statSync(file).size > 0
    fs.appendFileSync(file, (exists ? '\n\n---\n\n' : '') + text + '\n', 'utf8')
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
    if (!win.webContents.isDevToolsOpened()) {
      setTimeout(() => {
        const focused = BrowserWindow.getFocusedWindow()
        if (!focused || focused === win) win.hide()
      }, 100)
    }
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

ipcMain.on('discard-continuous-buffer', () => {
  continuousBuffer = ''
  lastText = clipboard.readText()
  sendToWindow('continuous-buffer', '')
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

ipcMain.on('save-ocr-result', (_, ts, ocrText) => {
  const item = history.find(h => h.ts === ts)
  if (item) {
    item.ocrText = ocrText
    saveHistory()
    sendToWindow('history-update', history)
  }
})

ipcMain.on('save-chat-history', (_, ts, chatMessages) => {
  const item = history.find(h => h.ts === ts)
  if (item) {
    item.chatHistory = chatMessages
    saveHistory()
  }
})

let savedBounds = null
ipcMain.on('set-preview-mode', (_, enabled) => {
  if (!win) return
  if (enabled) {
    savedBounds = win.getBounds()
    const { screen } = require('electron')
    const display = screen.getDisplayNearestPoint({ x: savedBounds.x, y: savedBounds.y })
    const area = display.workArea
    const newW = Math.min(700, area.width - 40)
    const newH = Math.min(600, area.height - 40)
    const x = savedBounds.x - Math.round((newW - savedBounds.width) / 2)
    const y = savedBounds.y - Math.round((newH - savedBounds.height) / 2)
    win.setResizable(true)
    win.setBounds({ x: Math.max(area.x, x), y: Math.max(area.y, y), width: newW, height: newH })
  } else if (savedBounds) {
    win.setBounds(savedBounds)
    win.setResizable(false)
    savedBounds = null
  }
})

ipcMain.on('minimize-window', (event) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (w) w.minimize()
})

ipcMain.on('set-always-on-top', (event, flag) => {
  const w = BrowserWindow.fromWebContents(event.sender)
  if (w) w.setAlwaysOnTop(flag, flag ? 'floating' : 'normal')
})

ipcMain.on('open-text-chat', (_, data) => {
  const { width: screenW, height: screenH } = require('electron').screen.getPrimaryDisplay().workAreaSize
  const chatWin = new BrowserWindow({
    width: Math.round(screenW * 0.8),
    height: Math.round(screenH * 0.85),
    minWidth: 500,
    minHeight: 300,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  const encodedData = encodeURIComponent(JSON.stringify(data))
  chatWin.loadFile('text-chat.html', { hash: encodedData })
})

let previewPopupWin = null
ipcMain.on('show-preview-popup', (event, { html, x, y, width, height }) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender)
  if (!senderWin) return
  const [winX, winY] = senderWin.getPosition()
  const absX = winX + x
  const absY = winY + y
  if (previewPopupWin && !previewPopupWin.isDestroyed()) {
    previewPopupWin.setBounds({ x: absX, y: absY, width, height })
    previewPopupWin.webContents.executeJavaScript(`document.getElementById('content').innerHTML = ${JSON.stringify(html)}`)
    previewPopupWin.showInactive()
  } else {
    previewPopupWin = new BrowserWindow({
      x: absX, y: absY, width, height,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: true,
      webPreferences: { contextIsolation: true },
    })
    previewPopupWin.setIgnoreMouseEvents(true)
    const page = `<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: transparent; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      #content { background: #fff; border-radius: 10px; padding: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08); max-height: 100%; overflow: hidden; }
      #content img { max-width: 100%; max-height: 180px; border-radius: 6px; object-fit: contain; display: block; }
      .preview-text { font-size: 11px; line-height: 1.5; color: #333; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow: hidden; }
    </style></head><body><div id="content">${html}</div></body></html>`
    previewPopupWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page))
    previewPopupWin.showInactive()
    previewPopupWin.on('closed', () => { previewPopupWin = null })
  }
})

ipcMain.on('hide-preview-popup', () => {
  if (previewPopupWin && !previewPopupWin.isDestroyed()) {
    previewPopupWin.hide()
  }
})

ipcMain.on('open-image-viewer', (_, data) => {
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const winW = Math.round(area.width * 0.88)
  const winH = Math.round(area.height * 0.9)
  const viewerWin = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 420,
    minHeight: 380,
    frame: false,
    alwaysOnTop: false,
    visibleOnAllWorkspaces: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  const encodedData = encodeURIComponent(JSON.stringify(data))
  viewerWin.loadFile('image-viewer.html', { hash: encodedData })
})

ipcMain.on('open-image-full', (_, dataUrl) => {
  const { screen } = require('electron')
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const winW = Math.round(area.width * 0.6)
  const winH = Math.round(area.height * 0.65)
  const x = Math.round(area.x + (area.width - winW) / 2)
  const y = area.y + Math.round((area.height - winH) * 0.25)
  const fullWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: x,
    y: y,
    minWidth: 300,
    minHeight: 200,
    frame: false,
    alwaysOnTop: false,
    webPreferences: { contextIsolation: true },
  })
  const html = `<!DOCTYPE html><html><head><style>
    *{margin:0;padding:0}
    body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;border-radius:8px;overflow:hidden;flex-direction:column;}
    .topbar{position:fixed;top:0;left:0;right:0;display:flex;justify-content:flex-end;padding:8px 12px;-webkit-app-region:drag;z-index:10;}
    .close-btn{-webkit-app-region:no-drag;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    .close-btn:hover{background:rgba(255,95,87,0.8);}
    img{max-width:100%;max-height:100%;object-fit:contain;}
  </style></head><body>
    <div class="topbar"><button class="close-btn" onclick="window.close()">✕</button></div>
    <img src="${dataUrl.replace(/"/g, '&quot;')}"/>
  </body></html>`
  fullWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const appIconPath = path.join(__dirname, 'app-icon.png')
  if (app.dock && fs.existsSync(appIconPath)) {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath))
  }
  loadSettings()
  loadHistory()

  const butterflyPath = path.join(__dirname, 'tray-butterfly.png')
  const iconPath = path.join(__dirname, 'tray-icon.png')
  let trayIcon
  if (fs.existsSync(butterflyPath)) {
    trayIcon = nativeImage.createFromPath(butterflyPath).resize({ width: 22, height: 22 })
    trayIcon.setTemplateImage(true)
  } else if (fs.existsSync(iconPath)) {
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
