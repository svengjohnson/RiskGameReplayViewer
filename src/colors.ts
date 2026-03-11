const PLAYER_COLORS: Record<string, string> = {
  color_blue: '#00bfff',     // DeepSkyBlue
  color_red: '#ff0000',      // Red
  color_green: '#2e8b57',    // SeaGreen
  color_yellow: '#daa520',   // Goldenrod
  color_orange: '#ff8c00',   // DarkOrange
  color_royale: '#9370db',   // MediumPurple
  color_white: '#d3d3d3',    // LightGray
  color_black: '#000000',    // Black
  color_pink: '#ff1493',     // DeepPink
};

export const BLIZZARD_COLOR = '#ffffff';
export const NEUTRAL_COLOR = '#888888';
export const UNOWNED_COLOR = '#c0b090';

export function getPlayerColor(colourKey: string): string {
  return PLAYER_COLORS[colourKey] ?? NEUTRAL_COLOR;
}
