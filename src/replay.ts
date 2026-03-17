import type { ReplayFile, ReplayState, TerritoryState } from './types';

export function createReplayState(replay: ReplayFile): ReplayState {
  const round0 = replay.roundInfo['0'];
  return {
    replay,
    currentRound: 0,
    currentSnapshotIndex: -1,
    currentPlayerTurn: 1,
    mapState: structuredClone(round0.mapState),
    alliances: structuredClone(round0.alliances),
  };
}

/** Get all territory names including blizzards */
export function getAllTerritories(replay: ReplayFile): string[] {
  const fromMap = Object.keys(replay.roundInfo['0'].mapState);
  return [...fromMap, ...replay.blizzards];
}

/** Total number of rounds (0-indexed) */
export function totalRounds(replay: ReplayFile): number {
  return Object.keys(replay.roundInfo).length;
}

/** Get the flat list of all snapshots in a round across all player turns, in order */
export interface FlatSnapshot {
  playerId: number;
  snapshotIndex: number;
  snapshot: import('./types').Snapshot;
}

/** Check if a territory snapshot only contains portal state changes (no ownership/unit changes) */
function isPortalOnlySnapshot(snap: import('./types').Snapshot): boolean {
  if (snap.type !== 'territory') return false;
  for (const t of Object.values(snap.territories)) {
    if (t.previouslyOwnedBy !== undefined) return false;
    if (t.previousUnits !== undefined && t.previousUnits !== t.units) return false;
  }
  return true;
}

/** Detect manual placement: round 0 where multiple players' territory snapshots are interleaved by time */
export function isManualPlacementRound(round: import('./types').RoundData): boolean {
  if (!round?.playerTurns) return false;
  const entries = Object.entries(round.playerTurns);
  if (entries.length < 2) return false;
  // Get first territory snapshot time per player
  const firstTerrTimes: number[] = [];
  for (const [, turn] of entries) {
    const first = turn.snapshots.find(s => s.type === 'territory');
    firstTerrTimes.push(first?.time ?? Infinity);
  }
  // Get second territory snapshot time for first player
  const p1Terrs = entries[0][1].snapshots.filter(s => s.type === 'territory');
  const secondTerrTime = p1Terrs[1]?.time;
  if (secondTerrTime == null) return false;
  // If any other player's first territory snap is before player 1's second, it's interleaved
  return firstTerrTimes.some((t, i) => i > 0 && t < secondTerrTime);
}

/** Build flat snapshot list, optionally sorted by time for manual placement */
function buildFlatSnapshots(round: import('./types').RoundData, sortByTime: boolean): FlatSnapshot[] {
  if (!round?.playerTurns) return [];

  const flat: FlatSnapshot[] = [];
  for (const [pid, turn] of Object.entries(round.playerTurns)) {
    for (let i = 0; i < turn.snapshots.length; i++) {
      flat.push({
        playerId: Number(pid),
        snapshotIndex: i,
        snapshot: turn.snapshots[i],
      });
    }
  }

  if (sortByTime) {
    flat.sort((a, b) => a.snapshot.time - b.snapshot.time);
  }

  return flat.filter(s => !isPortalOnlySnapshot(s.snapshot));
}

export function getFlatSnapshots(state: ReplayState): FlatSnapshot[] {
  const round = state.replay.roundInfo[String(state.currentRound)];
  if (!round) return [];
  const sortByTime = state.currentRound === 0 && isManualPlacementRound(round);
  return buildFlatSnapshots(round, sortByTime);
}

/** Compute the map state at a given round + snapshot position */
export function computeStateAt(
  replay: ReplayFile,
  round: number,
  snapshotPosition: number // -1 = round start, 0+ = after nth flat snapshot
): { mapState: Record<string, TerritoryState>; alliances: Record<string, number[]> } {
  const roundData = replay.roundInfo[String(round)];
  const mapState = structuredClone(roundData.mapState);
  let alliances = structuredClone(roundData.alliances);

  if (snapshotPosition < 0) {
    return { mapState, alliances };
  }

  // Build ordered snapshot list (time-sorted for manual placement rounds)
  const sortByTime = round === 0 && isManualPlacementRound(roundData);
  const flat = buildFlatSnapshots(roundData, sortByTime);

  // Apply snapshots in order up to snapshotPosition
  // Portal state (isPortal/isActivePortal) is preserved from round start — changes deferred to next round
  for (let idx = 0; idx <= snapshotPosition && idx < flat.length; idx++) {
    const snap = flat[idx].snapshot;
    if (snap.type === 'territory') {
      for (const [name, terr] of Object.entries(snap.territories)) {
        mapState[name] = {
          ownedBy: terr.ownedBy,
          isCapital: terr.isCapital,
          isPortal: mapState[name]?.isPortal ?? terr.isPortal,
          isActivePortal: mapState[name]?.isActivePortal ?? terr.isActivePortal,
          units: terr.units,
        };
      }
    } else if (snap.type === 'alliance') {
      alliances = structuredClone(snap.alliances);
    }
  }

  return { mapState, alliances };
}

export function goToRound(state: ReplayState, round: number): void {
  state.currentRound = round;
  state.currentSnapshotIndex = -1;
  const { mapState, alliances } = computeStateAt(state.replay, round, -1);
  state.mapState = mapState;
  state.alliances = alliances;
}

export function goToSnapshot(state: ReplayState, snapshotPosition: number): void {
  state.currentSnapshotIndex = snapshotPosition;
  const { mapState, alliances } = computeStateAt(
    state.replay,
    state.currentRound,
    snapshotPosition
  );
  state.mapState = mapState;
  state.alliances = alliances;
}

/** Get the player ID whose turn the current snapshot belongs to, or null */
export function getCurrentSnapshotPlayerId(state: ReplayState): number | null {
  if (state.currentSnapshotIndex < 0) return null;
  const flat = getFlatSnapshots(state);
  const snap = flat[state.currentSnapshotIndex];
  return snap?.playerId ?? null;
}
