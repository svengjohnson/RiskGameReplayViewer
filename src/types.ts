export interface ReplayFile {
  metadata: {
    version: number;
    date: string;
  };
  gameInfo: GameInfo;
  players: Record<string, PlayerInfo>;
  blizzards: string[];
  continents: Record<string, number>;
  roundInfo: Record<string, RoundData>;
}

export interface GameInfo {
  id: string;
  map: string;
  alliances: boolean;
  fog: boolean;
  blizzards: boolean;
  gameMode: string;
  cardType: string;
  dice: string;
  inactivityBehavior: string;
  portals: string;
  gameDuration: number;
}

export interface PlayerInfo {
  lobbyIndex: number;
  userId: number;
  deviceId: string;
  name: string;
  colour: string;
  rank: string;
  rank1v1: string;
  battlePoints: number;
  isBotted: boolean;
}

export interface TerritoryState {
  ownedBy: number;
  isCapital: boolean;
  isPortal: boolean;
  isActivePortal: boolean;
  units: number;
  previouslyOwnedBy?: number;
  previousUnits?: number;
}

export interface PlayerRoundState {
  isDead: boolean;
  isTakenOverByAI: boolean;
  isBotFlagged: boolean;
  isQuit: boolean;
  territories: number;
  capitals: number;
  units: number;
  cards: string[];
}

export interface TerritorySnapshot {
  type: 'territory';
  territories: Record<string, TerritoryState>;
  time: number;
}

export interface PlayerKilledSnapshot {
  type: 'player_killed';
  player: {
    id: number;
    cards: string[];
    [key: string]: unknown;
  };
  time: number;
}

export interface AllianceSnapshot {
  type: 'alliance';
  alliances: Record<string, number[]>;
  time: number;
}

export interface GameOverSnapshot {
  type: 'game_over';
  time: number;
  [key: string]: unknown;
}

export interface CardsTradedSnapshot {
  type: 'cards_traded';
  cards: string[];
  time: number;
}

export type Snapshot = TerritorySnapshot | AllianceSnapshot | GameOverSnapshot | CardsTradedSnapshot | PlayerKilledSnapshot;

export interface PlayerTurn {
  income: number;
  territories: number;
  capitals: number;
  units: number;
  cardsAtTurnStart: string[];
  snapshots: Snapshot[];
  cardsAfterTurn: string[];
}

export interface RoundData {
  mapState: Record<string, TerritoryState>;
  players: Record<string, PlayerRoundState>;
  alliances: Record<string, number[]>;
  playerTurns: Record<string, PlayerTurn>;
}

export interface ContinentDefinition {
  territories: string[];
}

export interface MapDefinition {
  name: string;
  svgUrl: string;
  viewBox: string;
  territories: Record<string, TerritoryDefinition>;
  continents: Record<string, ContinentDefinition>;
  /** Extra SVG element IDs that mirror a territory (e.g. wrap-around Alaska) */
  duplicates?: Record<string, string[]>;
  /** Whether to render dots on shared borders (default true) */
  renderConnectionDots?: boolean;
  /** Whether to render dashed lines for non-adjacent connections (default true) */
  renderConnectionLines?: boolean;
  /** Map card codes (A, B, C) to display names. Defaults to Classic (Infantry, Cavalry, Artillery). */
  cardLabels?: Record<string, string>;
}

export interface TerritoryDefinition {
  connections: string[];
}

export interface ReplayState {
  replay: ReplayFile;
  currentRound: number;
  currentSnapshotIndex: number; // -1 = round start (mapState), 0+ = after nth snapshot
  currentPlayerTurn: number; // which player's turn we're viewing snapshots for
  mapState: Record<string, TerritoryState>; // computed current state
  alliances: Record<string, number[]>;
}
