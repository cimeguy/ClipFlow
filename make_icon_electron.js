// Run: node node_modules/.bin/electron make_icon_electron.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 512, height: 512,
    show: false,
    webPreferences: { offscreen: true }
  })

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <!-- Deep space background removed — transparent -->

    <!-- Neon glow filter -->
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softglow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="innerglow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Gradient for main body -->
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1b2a"/>
      <stop offset="100%" stop-color="#1a0a2e"/>
    </linearGradient>

    <!-- Electric gradient for stroke -->
    <linearGradient id="strokeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#00f5ff"/>
      <stop offset="50%" stop-color="#7b2fff"/>
      <stop offset="100%" stop-color="#00f5ff"/>
    </linearGradient>

    <!-- Glow gradient for inner content -->
    <radialGradient id="innerGlow" cx="50%" cy="55%" r="45%">
      <stop offset="0%" stop-color="#00f5ff" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#7b2fff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- ── Clipboard body ── -->
  <!-- Shadow layer -->
  <rect x="72" y="118" width="380" height="350" rx="32" ry="32"
        fill="#7b2fff" opacity="0.25" filter="url(#softglow)"/>

  <!-- Main body fill -->
  <rect x="64" y="112" width="380" height="348" rx="30" ry="30"
        fill="url(#bodyGrad)" stroke="url(#strokeGrad)" stroke-width="3.5"/>

  <!-- Inner glow overlay -->
  <rect x="64" y="112" width="380" height="348" rx="30" ry="30"
        fill="url(#innerGlow)"/>

  <!-- Top edge highlight -->
  <rect x="64" y="112" width="380" height="2" rx="1"
        fill="#00f5ff" opacity="0.6"/>

  <!-- ── Tab ── -->
  <!-- Tab shadow -->
  <rect x="183" y="54" width="148" height="74" rx="18"
        fill="#7b2fff" opacity="0.3" filter="url(#softglow)"/>
  <!-- Tab body -->
  <rect x="178" y="48" width="156" height="72" rx="18"
        fill="url(#bodyGrad)" stroke="url(#strokeGrad)" stroke-width="3.5"/>
  <!-- Tab clip hole -->
  <ellipse cx="256" cy="78" rx="22" ry="14"
           fill="none" stroke="#00f5ff" stroke-width="2.5" opacity="0.8"
           filter="url(#innerglow)"/>
  <!-- Tab connector sides (cover the main rect top border) -->
  <rect x="64" y="112" width="114" height="6" fill="url(#bodyGrad)"/>
  <rect x="334" y="112" width="110" height="6" fill="url(#bodyGrad)"/>

  <!-- ── Circuit board grid (subtle) ── -->
  <g opacity="0.08" stroke="#00f5ff" stroke-width="1">
    <!-- Horizontal lines -->
    <line x1="90" y1="180" x2="422" y2="180"/>
    <line x1="90" y1="210" x2="422" y2="210"/>
    <line x1="90" y1="270" x2="422" y2="270"/>
    <line x1="90" y1="330" x2="422" y2="330"/>
    <line x1="90" y1="390" x2="422" y2="390"/>
    <!-- Vertical lines -->
    <line x1="140" y1="140" x2="140" y2="440"/>
    <line x1="200" y1="140" x2="200" y2="440"/>
    <line x1="260" y1="140" x2="260" y2="440"/>
    <line x1="320" y1="140" x2="320" y2="440"/>
    <line x1="380" y1="140" x2="380" y2="440"/>
  </g>
  <!-- Circuit nodes -->
  <g opacity="0.18" fill="#00f5ff">
    <circle cx="140" cy="180" r="3"/><circle cx="200" cy="180" r="3"/>
    <circle cx="260" cy="180" r="3"/><circle cx="320" cy="180" r="3"/>
    <circle cx="140" cy="270" r="3"/><circle cx="380" cy="270" r="3"/>
    <circle cx="200" cy="330" r="3"/><circle cx="320" cy="330" r="3"/>
    <circle cx="260" cy="390" r="3"/>
  </g>

  <!-- ── Central ">" prompt ── -->
  <!-- Glow layer -->
  <polyline points="118,225 185,285 118,345"
            fill="none" stroke="#00f5ff" stroke-width="28"
            stroke-linecap="round" stroke-linejoin="round"
            opacity="0.12" filter="url(#softglow)"/>
  <!-- Main chevron -->
  <polyline points="118,225 185,285 118,345"
            fill="none" stroke="#00f5ff" stroke-width="11"
            stroke-linecap="round" stroke-linejoin="round"
            filter="url(#glow)" opacity="0.95"/>

  <!-- Underscore cursor -->
  <!-- Glow layer -->
  <line x1="207" y1="345" x2="330" y2="345"
        stroke="#7b2fff" stroke-width="22" stroke-linecap="round"
        opacity="0.2" filter="url(#softglow)"/>
  <!-- Main line -->
  <line x1="207" y1="345" x2="330" y2="345"
        stroke="#c77dff" stroke-width="10" stroke-linecap="round"
        filter="url(#glow)" opacity="0.95"/>

  <!-- Blinking cursor block (part of the prompt aesthetic) -->
  <rect x="338" y="318" width="16" height="34" rx="2"
        fill="#00f5ff" opacity="0.7" filter="url(#innerglow)"/>

  <!-- ── Corner accent dots ── -->
  <circle cx="86"  cy="134" r="4" fill="#00f5ff" opacity="0.5" filter="url(#innerglow)"/>
  <circle cx="426" cy="134" r="4" fill="#00f5ff" opacity="0.5" filter="url(#innerglow)"/>
  <circle cx="86"  cy="448" r="4" fill="#7b2fff" opacity="0.5" filter="url(#innerglow)"/>
  <circle cx="426" cy="448" r="4" fill="#7b2fff" opacity="0.5" filter="url(#innerglow)"/>

  <!-- ── Scanlines overlay ── -->
  <g opacity="0.04">
    <rect x="64" y="112" width="380" height="348" rx="30"
          fill="none" stroke="#00f5ff" stroke-width="0"
          style="background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,245,255,0.1) 3px, rgba(0,245,255,0.1) 4px)"/>
  </g>
</svg>`

  win.loadURL('data:text/html,<html style="margin:0;padding:0;background:transparent"><body style="margin:0;padding:0;background:transparent">' +
    '<canvas id="c" width="512" height="512"></canvas>' +
    '<script>const img=new Image();img.onload=()=>{const c=document.getElementById("c");const ctx=c.getContext("2d");ctx.clearRect(0,0,512,512);ctx.drawImage(img,0,0);window._done=true;};img.src="data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') + '";</script>' +
    '</body></html>')

  win.webContents.on('did-finish-load', () => {
    const check = setInterval(() => {
      win.webContents.executeJavaScript('!!window._done').then(done => {
        if (!done) return
        clearInterval(check)
        setTimeout(() => {
          win.webContents.capturePage().then(img => {
            fs.writeFileSync('app-icon.png', img.toPNG())
            console.log('icon saved:', img.getSize())
            app.quit()
          })
        }, 300)
      })
    }, 100)
  })
})
