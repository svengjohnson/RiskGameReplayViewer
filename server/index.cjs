const express = require('express');
const path = require('path');
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const { insertReplay, getReplay } = require('./db.cjs');

const app = express();
const portArg = process.argv.find(a => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : process.env.PORT || 3005;

const uploadsDir = path.join(__dirname, '..', 'uploads');
const previewsDir = path.join(__dirname, '..', 'uploads', 'previews');
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(previewsDir, { recursive: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const PLAYER_COLORS = {
  color_blue: '#00bfff',
  color_red: '#cc3333',
  color_green: '#2e8b57',
  color_yellow: '#daa520',
  color_orange: '#ff8c00',
  color_royale: '#9370db',
  color_white: '#d3d3d3',
  color_black: '#333333',
  color_pink: '#ff1493',
};
const UNOWNED_COLOR = '#c0b090';
const BLIZZARD_COLOR = '#ffffff';

const MAP_SVGS = {
  Alcatraz: path.join(__dirname, '..', 'src', 'maps', 'Alcatraz', 'Alcatraz.svg'),
  Classic: path.join(__dirname, '..', 'src', 'maps', 'Classic', 'Classic.svg'),
  'Europe Advanced': path.join(__dirname, '..', 'src', 'maps', 'EuropeAdvanced', 'EuropeAdvanced.svg'),
};

function nameToId(name) {
  return name.replace(/ /g, '-');
}

// Request logging
const logFile = path.join(__dirname, 'requests.log');
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}\n`;
    fs.appendFileSync(logFile, line);
  });
  next();
});

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

// Preview image generation
function generatePreview(gameId) {
  const cachedPath = path.join(previewsDir, `${gameId}.png`);
  if (fs.existsSync(cachedPath)) return cachedPath;

  const row = getReplay.get(gameId);
  if (!row) return null;

  const replayPath = path.join(uploadsDir, row.fileName);
  if (!fs.existsSync(replayPath)) return null;

  let replay;
  try {
    replay = JSON.parse(fs.readFileSync(replayPath, 'utf8'));
  } catch {
    return null;
  }

  const svgPath = MAP_SVGS[replay.gameInfo.map];
  if (!svgPath || !fs.existsSync(svgPath)) return null;

  let svg = fs.readFileSync(svgPath, 'utf8');

  // Extract viewBox or default
  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch ? vbMatch[1] : '0 0 3840 2160';

  // Add background rect after opening <svg> tag
  svg = svg.replace(
    /(<svg[^>]*>)/,
    `$1<rect x="-5000" y="-5000" width="15000" height="15000" fill="#2b2b2b"/>`
  );

  // Color territories from round 0 state
  const round0 = replay.roundInfo['0'];
  if (round0?.mapState) {
    const blizzardSet = new Set(replay.blizzards || []);
    for (const [name, terr] of Object.entries(round0.mapState)) {
      const id = nameToId(name);
      const color = blizzardSet.has(name)
        ? BLIZZARD_COLOR
        : (PLAYER_COLORS[replay.players[String(terr.ownedBy)]?.colour] || UNOWNED_COLOR);
      // Replace fill on elements with matching id
      const idPattern = new RegExp(`(id="${id}"[^>]*?)(?:fill="[^"]*")`, 'g');
      svg = svg.replace(idPattern, `$1fill="${color}"`);
      // If no fill attribute exists, add one
      if (!new RegExp(`id="${id}"[^>]*fill=`).test(svg)) {
        svg = svg.replace(
          new RegExp(`(id="${id}")`),
          `$1 fill="${color}"`
        );
      }
    }
  }

  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
      background: '#2b2b2b',
    });
    const png = resvg.render().asPng();
    fs.writeFileSync(cachedPath, png);
    return cachedPath;
  } catch (err) {
    console.error('Preview generation error:', err);
    return null;
  }
}

app.get('/api/preview/:gameId.png', (req, res) => {
  const { gameId } = req.params;
  if (!UUID_RE.test(gameId)) {
    return res.status(400).send('Invalid game ID');
  }

  const pngPath = generatePreview(gameId);
  if (!pngPath) {
    return res.status(404).send('Preview not available');
  }

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(pngPath);
});

// Serve static frontend
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function getReplayMeta(gameId) {
  if (!gameId || !UUID_RE.test(gameId)) return null;
  const row = getReplay.get(gameId);
  if (!row) return null;
  const filePath = path.join(uploadsDir, row.fileName);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const gi = data.gameInfo;
    const rounds = Object.keys(data.roundInfo).length;
    const players = Object.values(data.players).map(p => p.name);
    return {
      map: gi.map,
      gameMode: gi.gameMode,
      cardType: gi.cardType,
      duration: formatDuration(gi.gameDuration),
      rounds,
      players,
    };
  } catch {
    return null;
  }
}

// SPA fallback with OpenGraph meta injection
app.get('*', (req, res) => {
  const indexPath = path.join(distDir, 'index.html');
  const gameId = req.query.gameId;
  const meta = gameId ? getReplayMeta(gameId) : null;

  if (!meta) {
    return res.sendFile(indexPath);
  }

  const title = `${meta.map} — ${meta.gameMode}`;
  const desc = `${meta.players.length} players · ${meta.rounds} rounds · ${meta.duration}\nCards: ${meta.cardType} · ${meta.players.join(', ')}`;
  const fullUrl = `${req.protocol}://${req.get('host')}`;
  const imageUrl = `${fullUrl}/api/preview/${escapeHtml(gameId)}.png`;

  let html = fs.readFileSync(indexPath, 'utf8');
  const ogTags = [
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="675" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
    `<meta name="theme-color" content="#2b2b2b" />`,
  ].join('\n    ');

  html = html.replace('</head>', `    ${ogTags}\n  </head>`);
  html = html.replace('<title>RISK Replay Viewer</title>', `<title>${escapeHtml(title)} — RISK Replay Viewer</title>`);
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
