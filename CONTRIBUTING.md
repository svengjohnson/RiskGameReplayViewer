# Contributing

## Adding a New Map

Each map lives in `src/maps/<MapName>/` and consists of an SVG file and a TypeScript definition. Here's a step-by-step guide.

For a real-world example, see the commit that added SMG Spaceport: [b162f15](https://github.com/svengjohnson/RiskGameReplayViewer/commit/b162f15bf456cd02cae021bdd4eb758e9485c3fa).

### 1. Prepare the SVG

The SVG file should contain `<path>` elements for each territory. Requirements:

- **Element IDs**: Each territory path must have an `id` matching its name, with spaces replaced by hyphens. For example, `Northern Europe` becomes `id="Northern-Europe"`.
- **Display names**: If the ID uses hyphens, add `serif:id="Northern Europe"` (or similar) for reference. The renderer maps names to IDs via the `nameToId()` function (spaces to hyphens).
- **ViewBox**: Use `viewBox="0 0 3840 2160"` (or your preferred dimensions). The renderer uses this for initial zoom.
- **No text elements needed**: The renderer generates labels and troop counts automatically by finding anchor points inside each territory shape.
- **Territories must not overlap**: Territory shapes must be adjacent but not overlap each other. The renderer uses territory boundaries for continent border detection and fog — overlapping shapes will cause visual artifacts.
- **Borders**: Don't worry about styling territory or continent borders in the SVG. The renderer handles all stroke widths and continent boundary rendering automatically.

#### Connection dots and lines

The renderer can auto-generate connection indicators (dots on shared borders, dashed lines for non-adjacent connections), but it doesn't do a great job on complex maps. **Manual placement of connection dots/lines directly in the SVG is preferred.** If you add your own, disable the renderer's auto-generation:

```typescript
renderConnectionDots: false,
renderConnectionLines: false,
```

Any non-territory SVG elements (circles, lines, groups, etc.) will be automatically moved above the fog layer so they remain visible.

#### Wrap-around territories

If a territory appears on both sides of the map (e.g., Alaska on the Classic map), include two path elements:
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
    renderConnectionDots: false,   // if using manual SVG indicators
    renderConnectionLines: false,  // if using manual SVG indicators
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
  'Europe Advanced': createEuropeAdvancedMap,
  '<Map Name>': create<MapName>Map,  // add this
};
```

The key must match the map name as it appears in replay JSON files (`replay.gameInfo.map`). Note: map names with spaces need to be quoted (e.g., `'Europe Advanced'`).

### 4. Build and Test

```bash
npm run dev
```

Load a replay file that uses your map. Check that:
- All territories are colored and labeled correctly
- Connection indicators appear correctly (auto-generated or manual)
- Continent border highlighting works when a player holds a continent
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
| `renderConnectionDots` | `boolean` | No | Show auto-generated dots on shared borders (default: `true`). Disable if using manual SVG indicators. |
| `renderConnectionLines` | `boolean` | No | Show auto-generated dashed lines for non-adjacent connections (default: `true`). Disable if using manual SVG indicators. |
| `cardLabels` | `Record<string, string>` | Yes | Map card codes to display names (e.g., `{ A: 'Infantry', B: 'Cavalry', C: 'Artillery' }`) |
| `backgroundUrl` | `string` | No | URL to a background image for the map. If not set, a flat dark background is used. |

## Tips

- **Manual connection indicators are preferred**: The auto-detection works for simple maps but struggles with complex territory layouts. Place `<circle>`, `<ellipse>`, or `<line>` elements directly in the SVG for best results.
- **Territory positions**: The renderer automatically finds label anchor points inside territory shapes by sampling a grid and picking the most interior point. Irregular shapes may need larger path definitions for good label placement.
- **Card labels**: Different maps use different card names (e.g., Classic uses Infantry/Cavalry/Artillery while Alcatraz uses Soldier/Car/Truck). Set `cardLabels` to override the defaults.
- **Connections must be bidirectional**: If A connects to B, both `A.connections` must include `'B'` and `B.connections` must include `'A'`.
