import type { ReplayFile, ReplayState, MapDefinition } from './types';
import { getPlayerColor } from './colors';
import { getFlatSnapshots, computeStateAt, getCurrentSnapshotPlayerId } from './replay';
import type { FogSettings } from './fog';
import { getHeldContinents } from './continents';

const DEFAULT_CARD_LABELS: Record<string, string> = {
  A: 'Infantry',
  B: 'Cavalry',
  C: 'Artillery',
  wild: 'Wild',
};

let activeCardLabels: Record<string, string> = DEFAULT_CARD_LABELS;

function setCardLabels(mapDef: MapDefinition): void {
  activeCardLabels = { ...DEFAULT_CARD_LABELS, ...mapDef.cardLabels };
}

function formatGameTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const COLOR_DISPLAY_NAMES: Record<string, string> = {
  royale: 'Purple',
};

function colorName(colourKey: string): string {
  const key = colourKey.replace('color_', '');
  return COLOR_DISPLAY_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function playerLabel(replay: ReplayFile, playerId: string | number): string {
  const p = replay.players[String(playerId)];
  if (!p) return `Player ${playerId}`;
  return `${p.name} (${colorName(p.colour)})`;
}

function cardLabel(card: string): string {
  return activeCardLabels[card] ?? activeCardLabels[card.toLowerCase()] ?? card;
}

/**
 * Describe an attack from a territory snapshot entry.
 * Finds the attacker among neighbors (if map connections available) or
 * among other changed territories in the same snapshot.
 */
function describeAttack(
  name: string,
  t: import('./types').TerritoryState,
  snapTerritories: Record<string, import('./types').TerritoryState>,
  connections: string[],
  prevMapState?: Record<string, import('./types').TerritoryState>,
): string {
  const capitalTag = t.isCapital ? ' (Capital)' : '';
  let attackerName: string | null = null;
  let attackerCapitalTag = '';

  // Strategy 1: check connected neighbors (if connections known)
  for (const neighbor of connections) {
    const neighborInSnap = snapTerritories[neighbor];
    if (neighborInSnap && neighborInSnap.previousUnits != null &&
        neighborInSnap.units < neighborInSnap.previousUnits &&
        neighborInSnap.ownedBy === t.ownedBy) {
      attackerName = neighbor;
      attackerCapitalTag = neighborInSnap.isCapital ? ' (Capital)' : '';
      break;
    }
    const neighborPrev = prevMapState?.[neighbor];
    if (!neighborInSnap && neighborPrev && neighborPrev.ownedBy === t.ownedBy) {
      attackerName = neighbor;
      attackerCapitalTag = neighborPrev.isCapital ? ' (Capital)' : '';
    }
  }

  // Strategy 2: if no connections, search all changed territories in the snapshot
  if (!attackerName) {
    for (const [otherName, other] of Object.entries(snapTerritories)) {
      if (otherName === name) continue;
      if (other.ownedBy === t.ownedBy &&
          other.previousUnits != null &&
          other.units < other.previousUnits) {
        attackerName = otherName;
        attackerCapitalTag = other.isCapital ? ' (Capital)' : '';
        break;
      }
    }
  }

  const defKilled = t.previousUnits ?? 0;
  const attackerSnap = attackerName ? snapTerritories[attackerName] : undefined;
  let atkLostStr: string;
  if (attackerSnap?.previousUnits != null) {
    const troopsMoved = attackerSnap.previousUnits - attackerSnap.units;
    atkLostStr = String(troopsMoved - t.units);
  } else {
    atkLostStr = '?';
  }

  const atkLabel = attackerName ? `${attackerName}${attackerCapitalTag}` : '?';
  return `${atkLabel} attacked ${name}${capitalTag}. Lost: ${atkLostStr}, Killed: ${defKilled}, Remaining: ${t.units}`;
}

/**
 * Detect and describe a failed attack from a territory snapshot.
 * Cases:
 * 1) Single territory that lost troops (no ownership change) — attacker lost troops, defender survived
 * 2) 2+ territories from different owners, both losing troops
 * Returns an array of attack descriptions, or empty if not a failed attack.
 */
function describeFailedAttacks(
  territories: Record<string, import('./types').TerritoryState>,
  connections: (name: string) => string[],
): string[] {
  const entries = Object.entries(territories);

  // Case 1: single territory lost troops — attacker's territory, defender unknown
  if (entries.length === 1) {
    const [name, t] = entries[0];
    if (t.previousUnits != null && t.units < t.previousUnits) {
      const capTag = t.isCapital ? ' (Capital)' : '';
      const lost = t.previousUnits - t.units;
      return [`${name}${capTag} attacked ? (failed). Lost: ${lost}, Killed: 0, Remaining: ${t.units}`];
    }
    return [];
  }

  // Group territories by owner, only those that lost troops
  const losers = entries.filter(([, t]) => t.previousUnits != null && t.units < t.previousUnits);
  if (losers.length < 2) return [];

  // Check that there are at least 2 different owners among losers
  const owners = new Set(losers.map(([, t]) => t.ownedBy));
  if (owners.size < 2) return [];

  // Find attacker-defender pairs: attacker is the snapshot's active player (the one whose turn it is).
  // The attacker's territory loses troops AND belongs to a different owner than the defender.
  const results: string[] = [];
  const usedDefenders = new Set<string>();

  for (const [atkName, atk] of losers) {
    // Find a defender: different owner, also lost troops, connected or in same snapshot
    const conns = new Set(connections(atkName));
    for (const [defName, def] of losers) {
      if (defName === atkName || def.ownedBy === atk.ownedBy || usedDefenders.has(defName)) continue;
      // Prefer connected, but accept any pair
      if (conns.size > 0 && !conns.has(defName)) continue;

      usedDefenders.add(defName);
      const atkCapTag = atk.isCapital ? ' (Capital)' : '';
      const defCapTag = def.isCapital ? ' (Capital)' : '';
      const atkLost = (atk.previousUnits ?? atk.units) - atk.units;
      const defKilled = (def.previousUnits ?? def.units) - def.units;
      results.push(`${atkName}${atkCapTag} attacked ${defName}${defCapTag} (failed). Lost: ${atkLost}, Killed: ${defKilled}, Remaining: ${atk.units}`);
      break;
    }
  }

  // If connections were too strict and we didn't pair, retry without connection filter
  if (results.length === 0) {
    usedDefenders.clear();
    for (const [atkName, atk] of losers) {
      for (const [defName, def] of losers) {
        if (defName === atkName || def.ownedBy === atk.ownedBy || usedDefenders.has(defName)) continue;
        usedDefenders.add(defName);
        const atkCapTag = atk.isCapital ? ' (Capital)' : '';
        const defCapTag = def.isCapital ? ' (Capital)' : '';
        const atkLost = (atk.previousUnits ?? atk.units) - atk.units;
        const defKilled = (def.previousUnits ?? def.units) - def.units;
        results.push(`${atkName}${atkCapTag} attacked ${defName}${defCapTag} (failed). Lost: ${atkLost}, Killed: ${defKilled}, Remaining: ${atk.units}`);
        break;
      }
    }
  }

  return results;
}

function cardClass(card: string): string {
  if (card.toLowerCase() === 'wild') return 'card-wild';
  return 'card-badge';
}

export function buildPlayerPanel(container: HTMLElement, replay: ReplayFile): void {
  container.innerHTML = '';
  for (const [id, player] of Object.entries(replay.players)) {
    const div = document.createElement('div');
    div.className = 'player-card';
    div.dataset.playerId = id;
    const color = getPlayerColor(player.colour);
    div.style.borderLeftColor = color;
    div.style.setProperty('--player-color', color);
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

  // Track players killed up to the current snapshot
  const killedThisRound = new Set<string>();
  if (state.currentSnapshotIndex >= 0 && roundData.playerTurns) {
    let flatIdx = 0;
    for (const [, turn] of Object.entries(roundData.playerTurns)) {
      for (const snap of turn.snapshots) {
        if (flatIdx > state.currentSnapshotIndex) break;
        if (snap.type === 'player_killed') {
          killedThisRound.add(String(snap.player.id));
        }
        flatIdx++;
      }
    }
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
    const isDead = playerState.isDead || killedThisRound.has(id);
    if (isDead) statuses.push('DEAD');
    if (playerState.isQuit) statuses.push('QUIT');
    if (playerState.isTakenOverByAI) statuses.push('AI');
    if (playerState.isBotFlagged) statuses.push('FLAGGED');
    statusEl.textContent = statuses.join(' | ');
    statusEl.className = 'player-status' + (isDead ? ' dead' : '');
  }

  // Highlight active player's turn
  const activePlayerId = getCurrentSnapshotPlayerId(state);
  for (const card of container.querySelectorAll('.player-card')) {
    const el = card as HTMLElement;
    el.classList.toggle('active-turn', el.dataset.playerId === String(activePlayerId));
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

    // Start with post-trade hand for this player's turn
    let cards = [...turn.cardsAtTurnStart];

    // Walk through snapshots up to current position to apply mid-turn card changes
    for (let i = 0; i < turn.snapshots.length && (flatIdx + i) <= snapshotIndex; i++) {
      const snap = turn.snapshots[i];
      if (snap.type === 'player_killed') {
        // Killer receives the killed player's cards
        cards.push(...snap.player.cards);
        // Clear killed player's cards
        result[String(snap.player.id)] = [];
      } else if (snap.type === 'cards_traded') {
        // Standalone card trade event
        for (const traded of snap.cards) {
          const idx = cards.indexOf(traded);
          if (idx !== -1) cards.splice(idx, 1);
        }
      }
    }

    // If past this player's turn entirely, use the definitive after-turn cards
    if (snapshotIndex > turnEnd) {
      cards = [...turn.cardsAfterTurn];
    }

    result[pid] = cards;
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
  mapDef: MapDefinition,
  onRoundChange: (round: number) => void,
  onSnapshotChange: (index: number) => void
): PlaybackControls {
  setCardLabels(mapDef);
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
      <button id="btn-step-back" title="Step back">◀◀</button>
      <button id="btn-play-pause" title="Play/Pause">▶</button>
      <button id="btn-step-fwd" title="Step forward">▶▶</button>
      <button id="btn-round-end" title="Jump to round end">⏭</button>
    </div>
    <div class="playback-speed">
      <label>Speed:
        <select id="playback-speed">
          <option value="4000">4s</option>
          <option value="2000">2s</option>
          <option value="1000" selected>1s</option>
          <option value="500">0.5s</option>
          <option value="250">0.25s</option>
          <option value="100">0.1s</option>
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
          const attacks: string[] = [];
          const placements: string[] = [];

          const prevComputed = computeStateAt(state.replay, state.currentRound, state.currentSnapshotIndex - 1);

          for (const [name, t] of Object.entries(snap.snapshot.territories)) {
            if (t.previouslyOwnedBy !== undefined) {
              const connections = mapDef.territories[name]?.connections ?? [];
              attacks.push(describeAttack(name, t, snap.snapshot.territories, connections, prevComputed.mapState));
            } else {
              const prev = t.previousUnits ?? t.units;
              const placed = t.units - prev;
              const capTag = t.isCapital ? ' (Capital)' : '';
              placements.push(`${name}${capTag} ${prev}→${t.units} (${placed >= 0 ? '+' : ''}${placed})`);
            }
          }

          // Detect failed attacks among "placements"
          if (attacks.length === 0 && placements.length >= 1) {
            const failed = describeFailedAttacks(
              snap.snapshot.territories,
              (n) => mapDef.territories[n]?.connections ?? [],
            );
            if (failed.length > 0) attacks.push(...failed);
          }

          if (attacks.length > 0) {
            desc = attacks.join(' | ');
          } else {
            desc = 'Placed troops: ' + placements.join(', ');
          }
        } else if (snap.snapshot.type === 'player_killed') {
          const killedId = String(snap.snapshot.player.id);
          const killedName = state.replay.players[killedId]?.name ?? `Player ${killedId}`;
          desc = 'Killed ' + killedName;
        } else if (snap.snapshot.type === 'alliance') {
          // Diff all alliances to find what changed
          const prevState = computeStateAt(state.replay, state.currentRound, state.currentSnapshotIndex - 1);
          let foundDesc = '';
          for (const [pid, newList] of Object.entries(snap.snapshot.alliances)) {
            const newSet = new Set(newList);
            const prevSet = new Set(prevState.alliances[pid] ?? []);
            const added = [...newSet].filter(a => !prevSet.has(a));
            const removed = [...prevSet].filter(a => !newSet.has(a));
            if (added.length > 0) {
              const p1 = state.replay.players[pid]?.name ?? `Player ${pid}`;
              const p2 = state.replay.players[String(added[0])]?.name ?? `Player ${added[0]}`;
              foundDesc = `${p1} allied ${p2}`;
              break;
            }
            if (removed.length > 0) {
              const p1 = state.replay.players[pid]?.name ?? `Player ${pid}`;
              const p2 = state.replay.players[String(removed[0])]?.name ?? `Player ${removed[0]}`;
              foundDesc = `Alliance broken: ${p1} and ${p2}`;
              break;
            }
          }
          desc = foundDesc || 'Alliance change';
        } else if (snap.snapshot.type === 'cards_traded') {
          desc = 'Traded cards: ' + snap.snapshot.cards.join(', ');
        } else if (snap.snapshot.type === 'game_over') {
          desc = 'Game Over';
        } else {
          desc = String((snap.snapshot as { type: string }).type);
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
  const totalSecs = Math.floor(gi.gameDuration / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const durationStr = hrs > 0
    ? `${hrs}h ${mins}m ${secs}s`
    : `${mins}m ${secs}s`;
  container.innerHTML = `
    <div class="game-info">
      <div class="game-info-left">
        <h2>${gi.map} - ${gi.gameMode}</h2>
        <div class="game-details">
          <span>ID: ${gi.id}</span>
          <span>Cards: ${gi.cardType}</span>
          <span>Dice: ${gi.dice}</span>
          <span>Fog: ${gi.fog ? 'Yes' : 'No'}</span>
          <span>Blizzards: ${gi.blizzards ? 'Yes' : 'No'}</span>
          <span>Duration: ${durationStr}</span>
        </div>
      </div>
      <div class="game-info-buttons">
        <button class="btn-header" id="btn-share">Share</button>
        <a class="btn-header btn-header-link" href="https://github.com/svengjohnson/RiskGameRecorder/releases" target="_blank">Download Recorder</a>
        <a class="btn-header btn-header-link" href="https://github.com/svengjohnson/RiskGameReplayViewer/blob/main/CONTRIBUTING.md" target="_blank">Map Contributions Welcome!</a>
        <button class="btn-header" id="btn-battle-log">Battle Log</button>
        <button class="btn-header" id="btn-upload-another">Upload Another Replay</button>
      </div>
    </div>
  `;
}

export function generateBattleLog(replay: ReplayFile, mapDef: MapDefinition): string {
  setCardLabels(mapDef);
  const lines: string[] = [];
  const totalRnds = Object.keys(replay.roundInfo).length;

  for (let round = 0; round < totalRnds; round++) {
    const roundData = replay.roundInfo[String(round)];
    if (!roundData) continue;

    lines.push(`=== ROUND ${round} ===`);

    if (!roundData.playerTurns) continue;

    let flatIdx = 0;
    let prevMapState = structuredClone(roundData.mapState);
    let prevAlliances = structuredClone(roundData.alliances);

    let lastTime = '';
    let isFirstTurn = true;

    for (const [pid, turn] of Object.entries(roundData.playerTurns)) {
      const pLabel = playerLabel(replay, pid);

      if (!isFirstTurn) lines.push('');
      isFirstTurn = false;

      // Find the first timestamp in this turn's snapshots
      const firstSnap = turn.snapshots[0];
      if (firstSnap) lastTime = formatGameTime(firstSnap.time);

      lines.push(`[${lastTime}] ${pLabel}: Earned ${turn.income} troops`);

      for (const snap of turn.snapshots) {
        lastTime = formatGameTime(snap.time);

        if (snap.type === 'territory') {
          const attacks: string[] = [];
          const placements: string[] = [];

          for (const [name, t] of Object.entries(snap.territories)) {
            if (t.previouslyOwnedBy !== undefined) {
              const connections = mapDef.territories[name]?.connections ?? [];
              attacks.push(describeAttack(name, t, snap.territories, connections, prevMapState));
            } else {
              const prev = t.previousUnits ?? t.units;
              const placed = t.units - prev;
              const capTag = t.isCapital ? ' (Capital)' : '';
              placements.push(`${name}${capTag} ${prev}→${t.units} (${placed >= 0 ? '+' : ''}${placed})`);
            }
          }

          // Detect failed attacks among "placements"
          if (attacks.length === 0 && placements.length >= 1) {
            const failed = describeFailedAttacks(
              snap.territories,
              (n) => mapDef.territories[n]?.connections ?? [],
            );
            if (failed.length > 0) {
              attacks.push(...failed);
              placements.length = 0; // clear placements, they're part of the failed attack
            }
          }

          if (attacks.length > 0) {
            for (const atk of attacks) lines.push(`[${lastTime}] ${pLabel}: ${atk}`);
          }
          if (placements.length > 0) {
            lines.push(`[${lastTime}] ${pLabel}: Placed troops: ${placements.join(', ')}`);
          }

          // Apply snapshot to track state
          for (const [name, t] of Object.entries(snap.territories)) {
            prevMapState[name] = {
              ownedBy: t.ownedBy,
              isCapital: t.isCapital,
              isPortal: t.isPortal,
              isActivePortal: t.isActivePortal,
              units: t.units,
            };
          }
        } else if (snap.type === 'player_killed') {
          const killedLabel = playerLabel(replay, snap.player.id);
          lines.push(`[${lastTime}] ${pLabel}: Killed ${killedLabel}`);
        } else if (snap.type === 'alliance') {
          for (const [apid, newList] of Object.entries(snap.alliances)) {
            const newSet = new Set(newList);
            const prevSet = new Set(prevAlliances[apid] ?? []);
            const added = [...newSet].filter(a => !prevSet.has(a));
            const removed = [...prevSet].filter(a => !newSet.has(a));
            if (added.length > 0) {
              lines.push(`[${lastTime}] ${playerLabel(replay, apid)} allied ${playerLabel(replay, added[0])}`);
              break;
            }
            if (removed.length > 0) {
              lines.push(`[${lastTime}] Alliance broken: ${playerLabel(replay, apid)} and ${playerLabel(replay, removed[0])}`);
              break;
            }
          }
          prevAlliances = structuredClone(snap.alliances);
        } else if (snap.type === 'cards_traded') {
          lines.push(`[${lastTime}] ${pLabel}: Traded cards: ${snap.cards.map(c => cardLabel(c)).join(', ')}`);
        } else if (snap.type === 'game_over') {
          lines.push(`[${lastTime}] Game Over`);
        }

        flatIdx++;
      }

      // Cards earned at end of turn
      if (turn.cardsAfterTurn.length > turn.cardsAtTurnStart.length) {
        const startSet = [...turn.cardsAtTurnStart];
        const earned: string[] = [];
        for (const c of turn.cardsAfterTurn) {
          const idx = startSet.indexOf(c);
          if (idx !== -1) {
            startSet.splice(idx, 1);
          } else {
            earned.push(cardLabel(c));
          }
        }
        if (earned.length > 0) {
          lines.push(`[${lastTime}] ${pLabel} earned card: ${earned.join(', ')}`);
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function showBattleLog(replay: ReplayFile, mapDef: MapDefinition): void {
  // Remove existing modal if any
  document.getElementById('battle-log-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'battle-log-modal';
  modal.className = 'battle-log-modal';
  modal.innerHTML = `
    <div class="battle-log-content">
      <div class="battle-log-header">
        <h3>Battle Log</h3>
        <button class="btn-header" id="btn-close-log">Close</button>
      </div>
      <pre class="battle-log-text"></pre>
    </div>
  `;
  document.body.appendChild(modal);

  const pre = modal.querySelector('.battle-log-text')!;
  pre.textContent = generateBattleLog(replay, mapDef);

  modal.querySelector('#btn-close-log')!.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}
