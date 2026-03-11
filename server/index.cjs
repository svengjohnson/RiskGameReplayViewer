const express = require('express');
const path = require('path');
const fs = require('fs');
const { insertReplay, getReplay } = require('./db.cjs');

const app = express();
const portArg = process.argv.find(a => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : process.env.PORT || 3005;

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

app.use(express.json({ limit: '10mb' }));

// Upload a replay
app.post('/api/upload', (req, res) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_SIZE) {
    return res.status(413).json({ error: 'File too large. Maximum size is 10 MB.' });
  }

  const replay = req.body;
  const gameId = replay?.gameInfo?.id;

  if (!gameId || !UUID_RE.test(gameId)) {
    return res.status(400).json({ error: 'Invalid or missing game ID. Must be a valid UUID.' });
  }

  // Check if already exists
  const existing = getReplay.get(gameId);
  if (existing) {
    return res.json({ gameId, url: `/?gameId=${gameId}`, exists: true });
  }

  const fileName = `${gameId}.json`;
  const filePath = path.join(uploadsDir, fileName);

  try {
    fs.writeFileSync(filePath, JSON.stringify(replay));
    insertReplay.run(gameId, fileName);
    res.json({ gameId, url: `/?gameId=${gameId}`, exists: false });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to save replay.' });
  }
});

// Retrieve a replay
app.get('/api/replay/:gameId', (req, res) => {
  const { gameId } = req.params;

  if (!UUID_RE.test(gameId)) {
    return res.status(400).json({ error: 'Invalid game ID format.' });
  }

  const row = getReplay.get(gameId);
  if (!row) {
    return res.status(404).json({ error: 'Replay not found.' });
  }

  const filePath = path.join(uploadsDir, row.fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Replay file missing.' });
  }

  res.sendFile(filePath);
});

// Serve static frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
