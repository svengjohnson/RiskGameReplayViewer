import type { MapDefinition } from '../types';
import { createAlcatrazMap } from './Alcatraz';
import { createClassicMap } from './Classic';
import { createEuropeAdvancedMap } from './EuropeAdvanced';

const maps: Record<string, () => MapDefinition> = {
  Alcatraz: createAlcatrazMap,
  Classic: createClassicMap,
  'Europe Advanced': createEuropeAdvancedMap,
};

export function getMapDefinition(mapName: string): MapDefinition | null {
  const factory = maps[mapName];
  return factory ? factory() : null;
}

export function hasMap(mapName: string): boolean {
  return mapName in maps;
}
