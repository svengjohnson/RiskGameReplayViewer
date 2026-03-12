const PLAYER_COLORS: Record<string, string> = {
  color_blue: '#00bfff',     // DeepSkyBlue
  color_red: '#cc3333',      // Softened Red
  color_green: '#2e8b57',    // SeaGreen
  color_yellow: '#daa520',   // Goldenrod
  color_orange: '#ff8c00',   // DarkOrange
  color_royale: '#9370db',   // MediumPurple
  color_white: '#d3d3d3',    // LightGray
  color_black: '#333333',    // Dark Gray
  color_pink: '#ff1493',     // DeepPink
};

export const BLIZZARD_COLOR = '#ffffff';
export const NEUTRAL_COLOR = '#888888';
export const UNOWNED_COLOR = '#c0b090';

export function getPlayerColor(colourKey: string): string {
  return PLAYER_COLORS[colourKey] ?? NEUTRAL_COLOR;
}

/** Brighten a hex color by mixing it toward white. factor 0–1 (0 = unchanged, 1 = white). */
export function brightenColor(hex: string, factor = 0.45): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const r = Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * factor);
  const g = Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * factor);
  const b = Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
