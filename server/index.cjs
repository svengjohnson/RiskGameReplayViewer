const express = require('express');
const path = require('path');
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');
const { insertReplay, getReplay } = require('./db.cjs');
const MAP_CONNECTIONS = require('./map-connections.cjs');

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


function computeVisibleTerritories(mapState, connections, playerId, alliances) {
  const visible = new Set();
  const allies = new Set([playerId]);
  const allianceList = alliances?.[String(playerId)];
  if (allianceList) {
    for (const a of allianceList) allies.add(a);
  }

  const ownedByFriendly = [];
  for (const [name, terr] of Object.entries(mapState)) {
    if (allies.has(terr.ownedBy)) {
      ownedByFriendly.push(name);
      visible.add(name);
    }
  }

  for (const name of ownedByFriendly) {
    const conns = connections[name];
    if (conns) {
      for (const neighbor of conns) visible.add(neighbor);
    }
  }

  return visible;
}

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

  // Add background rect and pattern definitions after opening <svg> tag
  const svgPatterns = `
    <defs>
      <pattern id="pattern-blizzard" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
        <rect width="40" height="40" fill="#e8e8f0"/>
        <rect width="20" height="40" fill="#ffffff"/>
      </pattern>
      <pattern id="pattern-fog" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
        <rect width="40" height="40" fill="#2a2520"/>
        <rect width="20" height="40" fill="#342e28"/>
      </pattern>
    </defs>`;
  svg = svg.replace(
    /(<svg[^>]*>)/,
    `$1${svgPatterns}<rect x="-5000" y="-5000" width="15000" height="15000" fill="#2b2b2b"/>`
  );

  // Determine fog visibility if applicable
  const isFog = !!replay.gameInfo.fog;
  const localPlayer = replay.gameInfo.localPlayer;
  const connections = MAP_CONNECTIONS[replay.gameInfo.map];
  const round0 = replay.roundInfo['0'] || replay.roundInfo[Object.keys(replay.roundInfo).sort((a, b) => a - b)[0]];

  let visibleSet = null;
  if (isFog && localPlayer != null && round0?.mapState && connections) {
    visibleSet = computeVisibleTerritories(
      round0.mapState, connections, localPlayer, round0.alliances || {}
    );
  }

  // Helper to set fill and stroke on an SVG element by id
  function styleTerritory(id, color) {
    const idPattern = new RegExp(`(id="${id}"[^>]*?)(?:fill="[^"]*")`, 'g');
    svg = svg.replace(idPattern, `$1fill="${color}"`);
    if (!new RegExp(`id="${id}"[^>]*fill=`).test(svg)) {
      svg = svg.replace(new RegExp(`(id="${id}")`), `$1 fill="${color}"`);
    }
    if (!new RegExp(`id="${id}"[^>]*stroke=`).test(svg)) {
      svg = svg.replace(new RegExp(`(id="${id}")`), `$1 stroke="#1a1208" stroke-width="4"`);
    }
  }

  // Color blizzard territories (not in mapState, listed separately)
  const troopLabels = [];
  const blizzardNames = replay.blizzards || [];
  for (const name of blizzardNames) {
    const id = nameToId(name);
    styleTerritory(id, 'url(#pattern-blizzard)');
    troopLabels.push({ id, units: null, blizzard: true });
  }

  // Color territories from round 0 state and collect troop counts
  if (round0?.mapState) {
    for (const [name, terr] of Object.entries(round0.mapState)) {
      const id = nameToId(name);
      const fogged = visibleSet && !visibleSet.has(name);

      const color = fogged
        ? 'url(#pattern-fog)'
        : (PLAYER_COLORS[replay.players[String(terr.ownedBy)]?.colour] || UNOWNED_COLOR);

      styleTerritory(id, color);

      if (!fogged && terr.units != null) {
        troopLabels.push({ id, units: terr.units, blizzard: false });
      }
    }
  }

  // Add troop count labels by finding territory element bounding boxes from path data
  if (troopLabels.length > 0) {
    // Parse viewBox dimensions for font sizing
    const vbParts = viewBox.split(/\s+/).map(Number);
    const vbW = vbParts[2] || 3840;
    const fontSize = Math.round(vbW / 80);
    const boxPad = Math.round(fontSize * 0.4);

    let labels = '';
    for (const { id, units, blizzard } of troopLabels) {
      // Find the path/rect element's d or x/y/width/height to approximate center
      // Try to extract a bounding center from the path's d attribute
      const elMatch = svg.match(new RegExp(`<(?:path|rect)[^>]*id="${id}"[^>]*>`, 's'))
        || svg.match(new RegExp(`<(?:path|rect)[^>]*id="${id}"[^/]*/>`, 's'));
      if (!elMatch) continue;

      const elStr = elMatch[0];
      let cx, cy;

      // For rect elements
      const rxm = elStr.match(/\bx="([^"]+)"/);
      const rym = elStr.match(/\by="([^"]+)"/);
      const rwm = elStr.match(/\bwidth="([^"]+)"/);
      const rhm = elStr.match(/\bheight="([^"]+)"/);
      if (rxm && rym && rwm && rhm) {
        cx = parseFloat(rxm[1]) + parseFloat(rwm[1]) / 2;
        cy = parseFloat(rym[1]) + parseFloat(rhm[1]) / 2;
      } else {
        // For path elements, parse d attribute to extract coordinate pairs
        const dMatch = elStr.match(/\bd="([^"]+)"/);
        if (!dMatch) continue;
        const d = dMatch[1];
        // Extract coordinates by parsing M/L/Z commands (our SVGs use absolute coords)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const coordRe = /([ML])\s*([\d.e+-]+)[,\s]+([\d.e+-]+)|[Zz]/gi;
        let cm;
        while ((cm = coordRe.exec(d)) !== null) {
          if (!cm[1]) continue; // Z command
          const x = parseFloat(cm[2]);
          const y = parseFloat(cm[3]);
          if (isFinite(x) && isFinite(y)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
        // Fallback: also handle comma-separated coordinate sequences after M/L
        if (!isFinite(minX)) {
          const nums = d.match(/-?\d+\.?\d*/g);
          if (!nums || nums.length < 4) continue;
          for (let i = 0; i < nums.length - 1; i += 2) {
            const x = parseFloat(nums[i]);
            const y = parseFloat(nums[i + 1]);
            if (isFinite(x) && isFinite(y)) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!isFinite(minX)) continue;
        cx = (minX + maxX) / 2;
        cy = (minY + maxY) / 2;
      }

      if (blizzard) {
        labels += `<text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" fill="white">&#x2744;</text>`;
      } else {
        const text = String(units);
        const textW = text.length * fontSize * 0.6;
        const boxW = textW + boxPad * 2;
        const boxH = fontSize + boxPad * 2;

        labels += `<rect x="${cx - boxW / 2}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" rx="4" fill="rgba(0,0,0,0.55)"/>`;
        labels += `<text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${text}</text>`;
      }
    }

    // Insert labels before closing </svg>
    svg = svg.replace('</svg>', `${labels}</svg>`);
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
app.use(express.static(distDir, { index: false }));

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return s > 0 ? `${h}h ${m}m ${s}s` : `${h}h ${m}m`;
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
    const hostPlayer = Object.values(data.players).find(p => p.lobbyIndex === 0);
    const localPlayer = gi.localPlayer != null ? data.players[String(gi.localPlayer)] : null;
    return {
      map: gi.map,
      gameMode: gi.gameMode,
      cardType: gi.cardType,
      duration: formatDuration(gi.gameDuration),
      rounds,
      players,
      playedBy: localPlayer?.name || null,
      hostedBy: hostPlayer?.name || null,
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

  const title = `${meta.map} · ${meta.gameMode} · ${meta.cardType}`;
  const lines = [`${meta.players.length} players · ${meta.rounds} rounds · ${meta.duration}`];
  if (meta.playedBy) lines.push(`Played By: ${meta.playedBy}`);
  if (meta.hostedBy) lines.push(`Hosted By: ${meta.hostedBy}`);
  lines.push(meta.players.join(', '));
  const desc = lines.join('\n');
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
