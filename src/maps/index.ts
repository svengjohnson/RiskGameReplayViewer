import type { MapDefinition } from '../types';
import { createAlcatrazMap } from './Alcatraz';
import { createClassicMap } from './Classic';
import { createEuropeAdvancedMap } from './EuropeAdvanced';
import { createSMGSpaceportMap } from './SMGSpaceport';
import { createSupermaxPrisonMap } from './SupermaxPrison';

const maps: Record<string, () => MapDefinition> = {
  Alcatraz: createAlcatrazMap,
  Classic: createClassicMap,
  'Europe Advanced': createEuropeAdvancedMap,
  'SMG Spaceport': createSMGSpaceportMap,
  'Supermax Prison': createSupermaxPrisonMap,
};

export function getMapDefinition(mapName: string): MapDefinition | null {
  const factory = maps[mapName];
  return factory ? factory() : null;
}

export function hasMap(mapName: string): boolean {
  return mapName in maps;
}
