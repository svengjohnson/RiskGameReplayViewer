import type { ReplayFile, ReplayState, MapDefinition } from './types';
import { getPlayerColor } from './colors';
import { getFlatSnapshots } from './replay';
import type { FogSettings } from './fog';
import { getHeldContinents } from './continents';

const CARD_LABELS: Record<string, string> = {
  infantry: 'Inf',
  cavalry: 'Cav',
  artillery: 'Art',
  wild: 'Wild',
};

function formatGameTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function cardLabel(card: string): string {
  return CARD_LABELS[card.toLowerCase()] ?? card;
}

function cardClass(card: string): string {
  return `card-${card.toLowerCase()}`;
}

export function buildPlayerPanel(container: HTMLElement, replay: ReplayFile): void {
  container.innerHTML = '';
  for (const [id, player] of Object.entries(replay.players)) {
    const div = document.createElement('div');
    div.className = 'player-card';
    div.dataset.playerId = id;
    const color = getPlayerColor(player.colour);
    div.style.borderLeftColor = color;
    div.innerHTML = `
      <div class="player-header">
        <span class="player-name">${player.name}</span>
        <span class="player-rank">${player.rank}</span>
      </div>
      <div class="player-stats">
        <span class="stat" data-stat="territories">Territories: -</span>
        <span class="stat" data-stat="units">Troops: -</span>
        <span class="stat" data-stat="capitals">Capitals: -</span>
        <span class="stat" data-stat="income">Income: -</span>
      </div>
      <div class="player-cards"></div>
      <div class="player-continents"></div>
      <div class="player-alliances"></div>
      <div class="player-status"></div>
    `;
    container.appendChild(div);
  }
}

export function updatePlayerPanel(container: HTMLElement, state: ReplayState, mapDef: MapDefinition): void {
  const roundData = state.replay.roundInfo[String(state.currentRound)];
  if (!roundData) return;

  // Compute live stats from mapState
  const liveCounts: Record<string, { territories: number; units: number; capitals: number }> = {};
  for (const [id] of Object.entries(roundData.players)) {
    liveCounts[id] = { territories: 0, units: 0, capitals: 0 };
  }
  for (const terr of Object.values(state.mapState)) {
    const key = String(terr.ownedBy);
    if (liveCounts[key]) {
      liveCounts[key].territories++;
      liveCounts[key].units += terr.units;
      if (terr.isCapital) liveCounts[key].capitals++;
    }
  }

  // Figure out which player turn & snapshot we're inside to determine cards
  const playerCards = computeCardsAtSnapshot(roundData, state.currentSnapshotIndex);

  for (const [id, playerState] of Object.entries(roundData.players)) {
    const card = container.querySelector(`[data-player-id="${id}"]`);
    if (!card) continue;

    const setStat = (name: string, value: string) => {
      const el = card.querySelector(`[data-stat="${name}"]`);
      if (el) el.textContent = value;
    };

    const live = liveCounts[id] ?? { territories: 0, units: 0, capitals: 0 };
    setStat('territories', `Territories: ${live.territories}`);
    setStat('units', `Troops: ${live.units}`);
    setStat('capitals', `Capitals: ${live.capitals}`);

    const turn = roundData.playerTurns?.[id];
    setStat('income', `Income: ${turn?.income ?? '-'}`);

    // Cards
    const cards = playerCards[id] ?? playerState.cards;
    const cardsEl = card.querySelector('.player-cards') as HTMLElement;
    if (cards.length > 0) {
      cardsEl.innerHTML = cards
        .map(c => `<span class="card-badge ${cardClass(c)}">${cardLabel(c)}</span>`)
        .join('');
    } else {
      cardsEl.innerHTML = '<span class="no-cards">No cards</span>';
    }

    // Continents
    const continentsEl = card.querySelector('.player-continents') as HTMLElement;
    const heldContinents = getHeldContinents(state, mapDef);
    const playerContinents = heldContinents[id] ?? [];
    if (playerContinents.length > 0) {
      continentsEl.innerHTML = playerContinents
        .map(c => `<span class="continent-badge">+${c.bonus} ${c.name}</span>`)
        .join('');
    } else {
      continentsEl.innerHTML = '';
    }

    // Alliances (from live state)
    const alliancesEl = card.querySelector('.player-alliances') as HTMLElement;
    const allyIds = state.alliances[id] ?? [];
    if (allyIds.length > 0) {
      const allyItems = allyIds.map(aid => {
        const ally = state.replay.players[String(aid)];
        if (!ally) return `<li>#${aid}</li>`;
        const color = getPlayerColor(ally.colour);
        return `<li><span class="ally-dot" style="background: ${color}"></span>${ally.name}</li>`;
      });
      alliancesEl.innerHTML = `<div class="alliance-label">Allies</div><ul class="ally-list">${allyItems.join('')}</ul>`;
    } else {
      alliancesEl.innerHTML = '';
    }

    const statusEl = card.querySelector('.player-status') as HTMLElement;
    const statuses: string[] = [];
    if (playerState.isDead) statuses.push('DEAD');
    if (playerState.isQuit) statuses.push('QUIT');
    if (playerState.isTakenOverByAI) statuses.push('AI');
    if (playerState.isBotFlagged) statuses.push('BOT');
    statusEl.textContent = statuses.join(' | ');
    statusEl.className = 'player-status' + (playerState.isDead ? ' dead' : '');
  }
}

/**
 * Determine each player's cards at a given flat snapshot index.
 *
 * Before a player's turn starts: cardsAtTurnStart
 * After a player's turn ends: cardsAfterTurn
 * During a player's turn (between snapshots): cardsAtTurnStart
 *   (cards are traded at the start before snapshots, so cardsAtTurnStart
 *    reflects post-trade hand; cardsAfterTurn may differ if they earned one)
 *
 * For players whose turn hasn't started yet: round-start cards.
 * For players whose turn is done: cardsAfterTurn.
 */
function computeCardsAtSnapshot(
  roundData: import('./types').RoundData,
  snapshotIndex: number
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  // Start with round-start cards for all players
  for (const [id, ps] of Object.entries(roundData.players)) {
    result[id] = ps.cards;
  }

  if (snapshotIndex < 0 || !roundData.playerTurns) return result;

  // Walk through player turns in order, counting flat snapshots
  let flatIdx = 0;
  for (const [pid, turn] of Object.entries(roundData.playerTurns)) {
    const turnStart = flatIdx;
    const turnEnd = flatIdx + turn.snapshots.length - 1;

    if (snapshotIndex < turnStart) {
      // Haven't reached this player's turn yet — keep round-start cards
      break;
    }

    if (snapshotIndex >= turnStart) {
      // We're at or past this player's turn start — they've traded cards
      result[pid] = turn.cardsAtTurnStart;
    }

    if (snapshotIndex > turnEnd) {
      // Past this player's turn — use after-turn cards
      result[pid] = turn.cardsAfterTurn;
    }

    flatIdx += turn.snapshots.length;
  }

  return result;
}

export interface PlaybackControls {
  updateTimeline: () => void;
  stopPlayback: () => void;
}

export function buildTimeline(
  container: HTMLElement,
  state: ReplayState,
  onRoundChange: (round: number) => void,
  onSnapshotChange: (index: number) => void
): PlaybackControls {
  container.innerHTML = '';

  const totalRounds = Object.keys(state.replay.roundInfo).length;

  // Round slider
  const roundRow = document.createElement('div');
  roundRow.className = 'timeline-row';
  roundRow.innerHTML = `
    <label>Round: <span id="round-display">0</span> / ${totalRounds - 1}</label>
    <input type="range" id="round-slider" min="0" max="${totalRounds - 1}" value="0" />
  `;
  container.appendChild(roundRow);

  // Snapshot slider
  const snapRow = document.createElement('div');
  snapRow.className = 'timeline-row';
  snapRow.innerHTML = `
    <label>Snapshot: <span id="snap-display">Start</span></label>
    <input type="range" id="snap-slider" min="-1" max="0" value="-1" />
  `;
  container.appendChild(snapRow);

  // Playback controls row
  const controlsRow = document.createElement('div');
  controlsRow.className = 'timeline-row playback-row';
  controlsRow.innerHTML = `
    <div class="playback-buttons">
      <button id="btn-round-start" title="Jump to round start">⏮</button>
      <button id="btn-step-back" title="Step back">◀</button>
      <button id="btn-play-pause" title="Play/Pause">▶</button>
      <button id="btn-step-fwd" title="Step forward">▶▶</button>
      <button id="btn-round-end" title="Jump to round end">⏭</button>
    </div>
    <div class="playback-speed">
      <label>Speed:
        <select id="playback-speed">
          <option value="2000">0.5x</option>
          <option value="1000" selected>1x</option>
          <option value="500">2x</option>
          <option value="250">4x</option>
          <option value="100">10x</option>
        </select>
      </label>
    </div>
  `;
  container.appendChild(controlsRow);

  // Snapshot info
  const snapInfo = document.createElement('div');
  snapInfo.id = 'snap-info';
  snapInfo.className = 'snap-info';
  container.appendChild(snapInfo);

  const roundSlider = container.querySelector('#round-slider') as HTMLInputElement;
  const snapSlider = container.querySelector('#snap-slider') as HTMLInputElement;
  const btnRoundStart = container.querySelector('#btn-round-start') as HTMLButtonElement;
  const btnStepBack = container.querySelector('#btn-step-back') as HTMLButtonElement;
  const btnPlayPause = container.querySelector('#btn-play-pause') as HTMLButtonElement;
  const btnStepFwd = container.querySelector('#btn-step-fwd') as HTMLButtonElement;
  const btnRoundEnd = container.querySelector('#btn-round-end') as HTMLButtonElement;
  const speedSelect = container.querySelector('#playback-speed') as HTMLSelectElement;

  let playing = false;
  let playTimer: ReturnType<typeof setInterval> | null = null;

  function getSpeed(): number {
    return Number(speedSelect.value);
  }

  function stepForward(): boolean {
    const flat = getFlatSnapshots(state);
    if (state.currentSnapshotIndex < flat.length - 1) {
      onSnapshotChange(state.currentSnapshotIndex + 1);
      return true;
    }
    // Move to next round
    if (state.currentRound < totalRounds - 1) {
      onRoundChange(state.currentRound + 1);
      return true;
    }
    return false; // end of replay
  }

  function stepBack(): void {
    if (state.currentSnapshotIndex > -1) {
      onSnapshotChange(state.currentSnapshotIndex - 1);
    } else if (state.currentRound > 0) {
      onRoundChange(state.currentRound - 1);
      // Jump to end of previous round
      const flat = getFlatSnapshots(state);
      if (flat.length > 0) {
        onSnapshotChange(flat.length - 1);
      }
    }
  }

  function startPlayback(): void {
    if (playing) return;
    playing = true;
    btnPlayPause.textContent = '⏸';
    playTimer = setInterval(() => {
      if (!stepForward()) {
        stopPlayback();
      }
    }, getSpeed());
  }

  function stopPlayback(): void {
    playing = false;
    btnPlayPause.textContent = '▶';
    if (playTimer !== null) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  // Restart interval when speed changes during playback
  speedSelect.addEventListener('change', () => {
    if (playing) {
      stopPlayback();
      startPlayback();
    }
  });

  btnPlayPause.addEventListener('click', () => {
    if (playing) stopPlayback(); else startPlayback();
  });

  btnStepFwd.addEventListener('click', () => {
    stopPlayback();
    stepForward();
  });

  btnStepBack.addEventListener('click', () => {
    stopPlayback();
    stepBack();
  });

  btnRoundStart.addEventListener('click', () => {
    stopPlayback();
    onSnapshotChange(-1);
  });

  btnRoundEnd.addEventListener('click', () => {
    stopPlayback();
    const flat = getFlatSnapshots(state);
    onSnapshotChange(flat.length - 1);
  });

  roundSlider.addEventListener('input', () => {
    stopPlayback();
    onRoundChange(Number(roundSlider.value));
  });

  snapSlider.addEventListener('input', () => {
    stopPlayback();
    onSnapshotChange(Number(snapSlider.value));
  });

  function updateTimeline() {
    const roundDisplay = container.querySelector('#round-display')!;
    const snapDisplay = container.querySelector('#snap-display')!;
    roundSlider.value = String(state.currentRound);
    roundDisplay.textContent = String(state.currentRound);

    const flat = getFlatSnapshots(state);
    snapSlider.max = String(flat.length - 1);
    snapSlider.min = '-1';
    snapSlider.value = String(state.currentSnapshotIndex);

    if (state.currentSnapshotIndex < 0) {
      snapDisplay.textContent = 'Round Start';
      snapInfo.textContent = '';
    } else {
      const snap = flat[state.currentSnapshotIndex];
      if (snap) {
        const playerName = state.replay.players[String(snap.playerId)]?.name ?? `Player ${snap.playerId}`;
        const time = formatGameTime(snap.snapshot.time);
        snapDisplay.textContent = `${state.currentSnapshotIndex + 1} / ${flat.length}`;
        let desc: string;
        if (snap.snapshot.type === 'territory') {
          const conquered = Object.entries(snap.snapshot.territories)
            .filter(([, t]) => t.previouslyOwnedBy !== undefined)
            .map(([name]) => name);
          const changed = Object.keys(snap.snapshot.territories);
          desc = conquered.length ? 'Attacked ' + conquered.join(', ') : 'Placed troops on ' + changed.join(', ');
        } else {
          desc = 'Alliance change';
        }
        snapInfo.textContent = `[${time}] ${playerName}: ${desc}`;
      }
    }
  }

  return { updateTimeline, stopPlayback };
}

export function buildFogControls(
  container: HTMLElement,
  replay: ReplayFile,
  fog: FogSettings,
  onChange: () => void
): void {
  // Only show fog controls if the game has fog
  if (!replay.gameInfo.fog) return;

  const row = document.createElement('div');
  row.className = 'timeline-row fog-row';

  const toggle = document.createElement('label');
  toggle.className = 'fog-toggle';
  toggle.innerHTML = `<input type="checkbox" id="fog-checkbox" ${fog.enabled ? 'checked' : ''} /> Fog of War`;
  row.appendChild(toggle);

  const select = document.createElement('select');
  select.id = 'fog-player';
  select.disabled = !fog.enabled || fog.followPlayer;
  for (const [id, player] of Object.entries(replay.players)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = player.name;
    opt.style.color = getPlayerColor(player.colour);
    if (fog.playerId === Number(id)) opt.selected = true;
    select.appendChild(opt);
  }
  row.appendChild(select);

  const followLabel = document.createElement('label');
  followLabel.className = 'fog-toggle';
  followLabel.innerHTML = `<input type="checkbox" id="fog-follow" ${fog.followPlayer ? 'checked' : ''} /> Follow turn`;
  row.appendChild(followLabel);

  container.appendChild(row);

  const checkbox = row.querySelector('#fog-checkbox') as HTMLInputElement;
  const followCheckbox = row.querySelector('#fog-follow') as HTMLInputElement;

  function updateDisabledState(): void {
    select.disabled = !fog.enabled || fog.followPlayer;
    followCheckbox.disabled = !fog.enabled;
  }

  checkbox.addEventListener('change', () => {
    fog.enabled = checkbox.checked;
    updateDisabledState();
    onChange();
  });

  select.addEventListener('change', () => {
    fog.playerId = Number(select.value);
    onChange();
  });

  followCheckbox.addEventListener('change', () => {
    fog.followPlayer = followCheckbox.checked;
    updateDisabledState();
    onChange();
  });
}

export function buildGameInfo(container: HTMLElement, replay: ReplayFile): void {
  const gi = replay.gameInfo;
  const duration = Math.floor(gi.gameDuration / 1000);
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  container.innerHTML = `
    <div class="game-info">
      <h2>${gi.map} - ${gi.gameMode}</h2>
      <div class="game-details">
        <span>Cards: ${gi.cardType}</span>
        <span>Dice: ${gi.dice}</span>
        <span>Fog: ${gi.fog ? 'Yes' : 'No'}</span>
        <span>Blizzards: ${gi.blizzards ? 'Yes' : 'No'}</span>
        <span>Duration: ${mins}m ${secs}s</span>
      </div>
    </div>
  `;
}
