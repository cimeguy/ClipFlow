// Run once: node create-icon.js
// Creates a simple 22x22 tray icon as icon.png
const fs = require('fs')

// Minimal 22x22 grayscale PNG (clipboard shape) hand-crafted
// We'll use a known-good 1x1 white PNG and let Electron resize,
// but it's better to just embed the SVG as a data URL in nativeImage.
// This file is not needed — icon generation is handled inline in main.js.
console.log('Icon handled inline.')
