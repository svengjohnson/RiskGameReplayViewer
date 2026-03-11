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

export function getFlatSnapshots(state: ReplayState): FlatSnapshot[] {
  const round = state.replay.roundInfo[String(state.currentRound)];
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
  return flat;
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

  // Apply snapshots in order up to snapshotPosition
  let idx = 0;
  for (const [, turn] of Object.entries(roundData.playerTurns)) {
    for (const snap of turn.snapshots) {
      if (idx > snapshotPosition) return { mapState, alliances };
      if (snap.type === 'territory') {
        for (const [name, terr] of Object.entries(snap.territories)) {
          mapState[name] = {
            ownedBy: terr.ownedBy,
            isCapital: terr.isCapital,
            isPortal: terr.isPortal,
            isActivePortal: terr.isActivePortal,
            units: terr.units,
          };
        }
      } else if (snap.type === 'alliance') {
        alliances = structuredClone(snap.alliances);
      }
      idx++;
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
