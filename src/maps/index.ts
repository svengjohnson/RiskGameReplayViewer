import type { MapDefinition } from '../types';
import { createAlcatrazMap } from './alcatraz';

const maps: Record<string, () => MapDefinition> = {
  Alcatraz: createAlcatrazMap,
};

export function getMapDefinition(mapName: string): MapDefinition | null {
  const factory = maps[mapName];
  return factory ? factory() : null;
}

export function hasMap(mapName: string): boolean {
  return mapName in maps;
}
