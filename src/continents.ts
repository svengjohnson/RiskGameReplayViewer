import type { MapDefinition, ReplayState } from './types';

export interface HeldContinent {
  name: string;
  bonus: number;
  territories: string[];
}

/**
 * Compute which continents each player fully holds.
 * Blizzard territories are excluded from continent requirements.
 */
export function getHeldContinents(
  state: ReplayState,
  mapDef: MapDefinition
): Record<string, HeldContinent[]> {
  const blizzardSet = new Set(state.replay.blizzards);
  const bonuses = state.replay.gameInfo.continents ?? {};
  const result: Record<string, HeldContinent[]> = {};

  for (const [contName, contDef] of Object.entries(mapDef.continents)) {
    // Filter out blizzard territories from the requirement
    const required = contDef.territories.filter(t => !blizzardSet.has(t));
    if (required.length === 0) continue;

    // Check who owns all required territories
    const owners = new Set<number>();
    let singleOwner = true;
    let owner = -1;

    for (const tName of required) {
      const terr = state.mapState[tName];
      if (!terr) { singleOwner = false; break; }
      if (owner === -1) {
        owner = terr.ownedBy;
      } else if (terr.ownedBy !== owner) {
        singleOwner = false;
        break;
      }
      owners.add(terr.ownedBy);
    }

    if (singleOwner && owner > 0) {
      const pid = String(owner);
      if (!result[pid]) result[pid] = [];
      result[pid].push({
        name: contName,
        bonus: bonuses[contName] ?? contDef.bonus ?? 0,
        territories: contDef.territories,
      });
    }
  }

  return result;
}
