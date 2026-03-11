# Contributing

## Adding a New Map

Each map lives in `src/maps/<MapName>/` and consists of an SVG file and a TypeScript definition. Here's a step-by-step guide.

### 1. Prepare the SVG

The SVG file should contain `<path>` elements for each territory. Requirements:

- **Element IDs**: Each territory path must have an `id` matching its name, with spaces replaced by hyphens. For example, `Northern Europe` becomes `id="Northern-Europe"`.
- **Display names**: If the ID uses hyphens, add `serif:id="Northern Europe"` (or similar) for reference. The renderer maps names to IDs via the `nameToId()` function (spaces to hyphens).
- **ViewBox**: Use `viewBox="0 0 3840 2160"` (or your preferred dimensions). The renderer uses this for initial zoom.
- **No text elements needed**: The renderer generates labels and troop counts automatically by finding anchor points inside each territory shape.

#### Wrap-around territories

If a territory appears on both sides of the map (e.g., Alaska on a world map), include two path elements:
- The main one with the standard ID (e.g., `id="Alaska"`)
- A duplicate with a different ID (e.g., `id="Alaska1"`)

Both will be colored and highlighted together. See the `duplicates` property below.

### 2. Create the Map Definition

Create `src/maps/<MapName>/index.ts`:

```typescript
import type { MapDefinition } from '../../types';
import svgUrl from './<MapName>.svg?url';

export function create<MapName>Map(): MapDefinition {
  return {
    name: '<MapName>',
    svgUrl,
    viewBox: '0 0 3840 2160',
    territories: {
      'Territory Name': { connections: ['Neighbor A', 'Neighbor B'] },
      // ... all territories
    },
    continents: {
      'Continent Name': {
        territories: ['Territory A', 'Territory B', ...],
      },
      // ... all continents
    },
  };
}
```

### 3. Register the Map

Add the map to `src/maps/index.ts`:

```typescript
import { create<MapName>Map } from './<MapName>';

const maps: Record<string, () => MapDefinition> = {
  Alcatraz: createAlcatrazMap,
  Classic: createClassicMap,
  <MapName>: create<MapName>Map,  // add this
};
```

The key must match the map name as it appears in replay JSON files (`replay.gameInfo.map`).

### 4. Build and Test

```bash
npm run dev
```

Load a replay file that uses your map. Check that:
- All territories are colored and labeled correctly
- Connection dots appear on shared borders
- Continent highlighting works
- Fog of war hides/reveals the correct territories

## MapDefinition Reference

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Map name (must match replay `gameInfo.map`) |
| `svgUrl` | `string` | Yes | SVG file import (use `?url` suffix) |
| `viewBox` | `string` | Yes | SVG viewBox (e.g., `"0 0 3840 2160"`) |
| `territories` | `Record<string, TerritoryDefinition>` | Yes | Territory names mapped to their connections |
| `continents` | `Record<string, ContinentDefinition>` | Yes | Continent names mapped to their territory lists |
| `duplicates` | `Record<string, string[]>` | No | Maps a territory name to extra SVG element IDs for wrap-around rendering |
| `renderConnectionDots` | `boolean` | No | Show dots on shared borders (default: `true`) |
| `renderConnectionLines` | `boolean` | No | Show dashed lines for non-adjacent connections (default: `true`) |
| `cardLabels` | `Record<string, string>` | No | Map card codes to display names. Defaults: `A` = Infantry, `B` = Cavalry, `C` = Artillery, `wild` = Wild |

## Tips

- **Connection indicators**: If the auto-detected connection dots/lines don't look right, you can disable them with `renderConnectionDots: false` and/or `renderConnectionLines: false` and add your own indicators directly in the SVG.
- **Territory positions**: The renderer automatically finds label anchor points inside territory shapes by sampling a grid and picking the most interior point. Irregular shapes may need larger path definitions for good label placement.
- **Card labels**: Different maps use different card names (e.g., Classic uses Infantry/Cavalry/Artillery while Alcatraz uses Soldier/Car/Truck). Set `cardLabels` to override the defaults.
- **Connections must be bidirectional**: If A connects to B, both `A.connections` must include `'B'` and `B.connections` must include `'A'`.
