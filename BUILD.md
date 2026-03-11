# Risk Game Replay Viewer

A web-based replay viewer for Risk board games. Load a replay JSON file and watch the game unfold on an interactive SVG map with full playback controls, fog of war, and detailed player stats.

## Features

- Interactive SVG map with pan & zoom (scroll to zoom, drag to pan, double-click to reset)
- Timeline with round/snapshot sliders and playback controls (play/pause, step, jump)
- Variable playback speed (0.5x - 10x)
- Fog of war with "follow turn" mode (auto-switches perspective to the active player)
- Player panel with live territory counts, troops, capitals, income, cards, alliances, and continent bonuses
- Territory connection indicators (dots for shared borders, dashed lines for distant connections)
- Continent ownership highlighting with player-colored borders
- Flash animation on territories that changed state
- Capital indicators with player-colored borders

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens a local dev server (default http://localhost:5173). Changes hot-reload automatically.

## Build

```bash
npm run build
```

Outputs a production build to `dist/`. This runs TypeScript type-checking followed by Vite bundling.

## Preview production build

```bash
npm run preview
```

Serves the `dist/` folder locally to verify the production build.

## Usage

1. Open the app in a browser
2. Drag and drop a replay JSON file onto the page, or click "Browse files"
3. Use the timeline controls to navigate through the game
4. Toggle fog of war to view the game from a specific player's perspective

## Adding maps

Map definitions live in `src/maps/<MapName>/`. Each map needs:

- An SVG file with territory shapes identified by ID (spaces replaced with hyphens)
- An `index.ts` exporting a function that returns a `MapDefinition` with territories, connections, and continents
- Registration in `src/maps/index.ts`

## Project structure

```
src/
  main.ts          Entry point, file loading, render loop
  renderer.ts      SVG map rendering, connections, overlays, flash effects
  replay.ts        Replay state management, snapshot navigation
  ui.ts            Player panel, timeline, fog controls
  fog.ts           Fog of war visibility computation
  continents.ts    Continent ownership computation
  colors.ts        Player color mapping
  types.ts         TypeScript interfaces
  style.css        Styling
  maps/
    index.ts       Map registry
    Alcatraz/      Alcatraz map definition + SVG
```
