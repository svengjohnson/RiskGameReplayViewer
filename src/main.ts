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
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button id="btn-stub-log">View Battle Log</button>
          <button id="btn-stub-upload">Upload Another Replay</button>
        </div>
      </div>
    `;
    document.getElementById('btn-stub-log')!.addEventListener('click', () => showBattleLog(replay, stubMap));
    document.getElementById('btn-stub-upload')!.addEventListener('click', showDropZone);
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
  document.getElementById('btn-upload-another')!.addEventListener('click', showDropZone);
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
    if (e.key === ' ') {
      e.preventDefault();
      document.getElementById('btn-play-pause')?.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      document.getElementById('btn-step-back')?.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      document.getElementById('btn-step-fwd')?.click();
    }
  });

  render();
}
