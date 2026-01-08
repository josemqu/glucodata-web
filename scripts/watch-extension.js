const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 8899;
const WATCH_DIR = path.resolve(__dirname, '../chrome-extension');

let lastChange = Date.now();

// Simple HTTP server to serve the last change timestamp
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/timestamp') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ timestamp: lastChange }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\x1b[32m[Watcher] Server listening on http://localhost:${PORT}/timestamp\x1b[0m`);
  console.log(`\x1b[34m[Watcher] Watching directory: ${WATCH_DIR}\x1b[0m`);
});

// Watch directory for changes
let timeout = null;
fs.watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
  if (filename) {
    // Debounce changes
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      lastChange = Date.now();
      console.log(`\x1b[33m[Watcher] Change detected in ${filename}. Reloading extensions...\x1b[0m`);
    }, 100);
  }
});
