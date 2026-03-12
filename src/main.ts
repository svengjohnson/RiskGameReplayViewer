import './style.css';
import type { ReplayFile, ReplayState } from './types';
import { createReplayState, goToRound, goToSnapshot, getCurrentSnapshotPlayerId } from './replay';
import { getMapDefinition } from './maps/index';
import { MapRenderer } from './renderer';
import type { MapDefinition } from './types';
import { buildPlayerPanel, updatePlayerPanel, buildTimeline, buildGameInfo, buildFogControls, showBattleLog } from './ui';
import type { FogSettings } from './fog';
import { computeVisibleTerritories } from './fog';

const app = document.getElementById('app')!;

// Check for ?gameId= query param to auto-load from server
const params = new URLSearchParams(window.location.search);
const gameIdParam = params.get('gameId');

if (gameIdParam) {
  loadFromServer(gameIdParam);
} else {
  showDropZone();
}

async function loadFromServer(gameId: string): Promise<void> {
  app.innerHTML = `<div id="drop-zone"><p>Loading replay...</p></div>`;
  try {
    const resp = await fetch(`/api/replay/${encodeURIComponent(gameId)}`);
    if (!resp.ok) throw new Error(`Replay not found (${resp.status})`);
    const replay: ReplayFile = await resp.json();
    await initViewer(replay);
  } catch (err) {
    app.innerHTML = `
      <div id="drop-zone">
        <p style="color: #f08080;">Failed to load replay: ${(err as Error).message}</p>
        <p style="margin-top: 12px;">You can still load a file manually:</p>
        <button id="btn-fallback-upload" style="margin-top: 8px;">Browse files</button>
      </div>
    `;
    document.getElementById('btn-fallback-upload')!.addEventListener('click', () => {
      window.history.replaceState({}, '', '/');
      showDropZone();
    });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// Tracks the background upload promise so Share can await it
let uploadPromise: Promise<string | null> | null = null;

function tryAutoUpload(replay: ReplayFile): void {
  const gameId = replay?.gameInfo?.id;
  if (!gameId || !UUID_RE.test(gameId)) return;

  const body = JSON.stringify(replay);
  if (body.length > MAX_UPLOAD_SIZE) return;

  // Already loaded from server — already uploaded
  if (window.location.search.includes(`gameId=${gameId}`)) {
    uploadPromise = Promise.resolve(`/?gameId=${gameId}`);
    return;
  }

  uploadPromise = (async () => {
    try {
      const resp = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      // Update URL bar without reload
      window.history.replaceState({}, '', data.url);
      return data.url as string;
    } catch {
      return null;
    }
  })();
}

async function shareReplay(): Promise<void> {
  if (!uploadPromise) {
    showToast('This replay cannot be shared.', true);
    return;
  }

  const url = await uploadPromise;
  if (!url) {
    showToast('Upload failed — cannot share.', true);
    return;
  }

  const fullUrl = `${window.location.origin}${url}`;
  try {
    await navigator.clipboard.writeText(fullUrl);
    showToast('Link copied to clipboard!');
  } catch {
    showToast('Could not copy link.', true);
  }
}

function showToast(message: string, isError = false): void {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function showDropZone(): void {
  app.innerHTML = `
    <div id="drop-zone">
      <p>Drop a replay JSON file here</p>
      <p>or</p>
      <button id="browse-btn">Browse files</button>
      <input type="file" id="file-input" accept=".json" />
    </div>
  `;

  const dropZone = document.getElementById('drop-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const browseBtn = document.getElementById('browse-btn')!;

  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) loadFile(file);
  });
}

async function loadFile(file: File): Promise<void> {
  const text = await file.text();
  const replay: ReplayFile = JSON.parse(text);
  await initViewer(replay);
}

async function initViewer(replay: ReplayFile): Promise<void> {
  tryAutoUpload(replay);

  const mapDef = getMapDefinition(replay.gameInfo.map);
  if (!mapDef) {
    // Unsupported map — offer battle log with a stub map definition
    const stubMap: MapDefinition = {
      name: replay.gameInfo.map,
      svgUrl: '',
      viewBox: '0 0 1 1',
      territories: {},
      continents: {},
    };
    const gi = replay.gameInfo;
    const totalSecs = Math.floor(gi.gameDuration / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const dur = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`;
    app.innerHTML = `
      <div id="drop-zone">
        <h2>${gi.map} - ${gi.gameMode}</h2>
        <div class="game-details" style="justify-content: center; margin: 8px 0;">
          <span>ID: ${gi.id}</span>
          <span>Cards: ${gi.cardType}</span>
          <span>Dice: ${gi.dice}</span>
          <span>Fog: ${gi.fog ? 'Yes' : 'No'}</span>
          <span>Blizzards: ${gi.blizzards ? 'Yes' : 'No'}</span>
          <span>Duration: ${dur}</span>
        </div>
        <p style="margin: 8px 0; color: #f0a050;">Unsupported map — rendering is not available.</p>
        <p style="margin: 4px 0;">
          <a href="https://github.com/svengjohnson/RiskGameReplayViewer/blob/main/CONTRIBUTING.md" target="_blank" style="color: #6cb4ee;">You can contribute!</a>
        </p>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button id="btn-stub-share">Share</button>
          <button id="btn-stub-log">View Battle Log</button>
          <button id="btn-stub-upload">Upload Another Replay</button>
        </div>
      </div>
    `;
    document.getElementById('btn-stub-share')!.addEventListener('click', () => shareReplay());
    document.getElementById('btn-stub-log')!.addEventListener('click', () => showBattleLog(replay, stubMap));
    document.getElementById('btn-stub-upload')!.addEventListener('click', () => {
      window.history.replaceState({}, '', '/');
      showDropZone();
    });
    return;
  }

  const state: ReplayState = createReplayState(replay);
  const fog: FogSettings = {
    enabled: !!replay.gameInfo.fog,
    playerId: 1,
    followPlayer: true,
  };

  app.innerHTML = `
    <div id="game-info"></div>
    <div id="map-container"></div>
    <div id="player-panel"></div>
    <div id="timeline"></div>
  `;

  const gameInfoEl = document.getElementById('game-info')!;
  const mapContainer = document.getElementById('map-container')!;
  const playerPanel = document.getElementById('player-panel')!;
  const timelineEl = document.getElementById('timeline')!;

  buildGameInfo(gameInfoEl, replay);
  document.getElementById('btn-share')!.addEventListener('click', () => shareReplay());
  document.getElementById('btn-upload-another')!.addEventListener('click', () => {
    window.history.replaceState({}, '', '/');
    showDropZone();
  });
  document.getElementById('btn-battle-log')!.addEventListener('click', () => showBattleLog(replay, mapDef));
  buildPlayerPanel(playerPanel, replay);

  const renderer = new MapRenderer(mapDef, replay);
  await renderer.mount(mapContainer);

  const { updateTimeline } = buildTimeline(
    timelineEl,
    state,
    mapDef,
    (round) => {
      goToRound(state, round);
      render();
    },
    (snapIdx) => {
      goToSnapshot(state, snapIdx);
      render();
    }
  );

  buildFogControls(timelineEl, replay, fog, render);

  function render(): void {
    // Follow-player fog: switch fog perspective to current snapshot's player
    if (fog.enabled && fog.followPlayer) {
      const snapPlayer = getCurrentSnapshotPlayerId(state);
      if (snapPlayer !== null) {
        fog.playerId = snapPlayer;
        // Update the fog player dropdown to reflect
        const fogSelect = document.getElementById('fog-player') as HTMLSelectElement | null;
        if (fogSelect) fogSelect.value = String(snapPlayer);
      }
    }

    let visible: Set<string> | undefined;
    if (fog.enabled && fog.playerId !== null) {
      visible = computeVisibleTerritories(state, mapDef!, fog.playerId);
    }
    renderer.update(state, visible);
    updatePlayerPanel(playerPanel, state, mapDef!);
    updateTimeline();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      // Blur sliders so their native arrow handling doesn't also fire
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (e.key === ' ') document.getElementById('btn-play-pause')?.click();
      else if (e.key === 'ArrowLeft') document.getElementById('btn-step-back')?.click();
      else document.getElementById('btn-step-fwd')?.click();
    }
  });

  render();
}
