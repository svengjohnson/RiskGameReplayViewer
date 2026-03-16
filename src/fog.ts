import type { ReplayState, MapDefinition, TerritoryState } from './types';

export interface FogSettings {
  enabled: boolean;
  playerId: number | null; // which player's perspective
  followPlayer: boolean;   // auto-switch fog to current turn's player
}

/**
 * Compute which territories are visible to a player under fog of war.
 *
 * Visible means:
 *  1. Territories the player owns
 *  2. Territories adjacent to any the player owns
 *  3. If allied: territories the ally owns
 *  4. Territories adjacent to any the ally owns
 */
export function computeVisibleTerritories(
  state: ReplayState,
  mapDef: MapDefinition,
  playerId: number
): Set<string> {
  const visible = new Set<string>();
  const mapState = state.mapState;

  // Gather owned territories for this player and allies
  const allies = new Set<number>();
  allies.add(playerId);
  const allianceList = state.alliances[String(playerId)];
  if (allianceList) {
    for (const a of allianceList) allies.add(a);
  }

  // All territories owned by the player or allies
  const ownedByFriendly: string[] = [];
  for (const [name, terr] of Object.entries(mapState)) {
    if (allies.has(terr.ownedBy)) {
      ownedByFriendly.push(name);
      visible.add(name);
    }
  }

  // Collect active portals for portal-to-portal visibility
  const activePortals: string[] = [];
  for (const [name, terr] of Object.entries(mapState)) {
    if (terr.isPortal && terr.isActivePortal) {
      activePortals.push(name);
    }
  }

  // Add neighbors of all friendly territories
  for (const name of ownedByFriendly) {
    const def = mapDef.territories[name];
    if (def) {
      for (const neighbor of def.connections) {
        visible.add(neighbor);
      }
    }
    // Active portals connect to all other active portals
    if (mapState[name]?.isPortal && mapState[name]?.isActivePortal) {
      for (const portal of activePortals) {
        visible.add(portal);
      }
    }
  }

  return visible;
}

/**
 * For fogged territories, return a masked version of the territory state
 * showing only neutral info (unknown owner, unknown units).
 */
export function getFoggedTerritoryState(): TerritoryState {
  return {
    ownedBy: 0, // no owner
    isCapital: false,
    isPortal: false,
    isActivePortal: false,
    units: 0,
  };
}
