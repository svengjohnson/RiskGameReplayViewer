import './style.css';
import type { ReplayFile, ReplayState } from './types';
import { createReplayState, goToRound, goToSnapshot, getCurrentSnapshotPlayerId } from './replay';
import { getMapDefinition } from './maps/index';
import { MapRenderer } from './renderer';
import { buildPlayerPanel, updatePlayerPanel, buildTimeline, buildGameInfo, buildFogControls } from './ui';
import type { FogSettings } from './fog';
import { computeVisibleTerritories } from './fog';

const app = document.getElementById('app')!;

showDropZone();

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
  const mapDef = getMapDefinition(replay.gameInfo.map);
  if (!mapDef) {
    app.innerHTML = `<div id="drop-zone"><p>Unknown map: ${replay.gameInfo.map}</p><p>Only these maps are supported: Alcatraz</p></div>`;
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
  buildPlayerPanel(playerPanel, replay);

  const renderer = new MapRenderer(mapDef, replay);
  await renderer.mount(mapContainer);

  const { updateTimeline } = buildTimeline(
    timelineEl,
    state,
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
    if (e.key === ' ') {
      e.preventDefault();
      const btn = document.getElementById('btn-play-pause');
      btn?.click();
    }
  });

  render();
}
