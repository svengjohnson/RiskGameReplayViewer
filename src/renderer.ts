import type { ReplayFile, ReplayState, MapDefinition } from './types';
import { getPlayerColor, BLIZZARD_COLOR, UNOWNED_COLOR } from './colors';

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT_FONT_SIZE = 42;
const LABEL_FONT_SIZE = 20;
const LABEL_GAP = 8;
const CAPITAL_STROKE = 6;
const MARGIN = 40;
const FOG_COLOR = '#1a1510';
const FOG_OPACITY = '0.75';

function nameToId(name: string): string {
  return name.replace(/ /g, '-');
}

/**
 * Find the best label anchor inside a territory shape.
 * Samples a dense grid, filters to points inside the fill AND at least MARGIN
 * px from the bounding-box edges (approximating distance from shape edges),
 * then picks the one closest to the centroid of those valid points.
 */
function findLabelAnchor(el: SVGGraphicsElement, svg: SVGSVGElement): { x: number; y: number } {
  const bbox = el.getBBox();
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  if (el.tagName === 'rect') return { x: cx, y: cy };

  // For paths, do a dense sample
  const pt = svg.createSVGPoint();
  const inside: { x: number; y: number }[] = [];
  const steps = 16;
  for (let iy = 0; iy <= steps; iy++) {
    for (let ix = 0; ix <= steps; ix++) {
      const sx = bbox.x + (bbox.width * ix) / steps;
      const sy = bbox.y + (bbox.height * iy) / steps;
      pt.x = sx;
      pt.y = sy;
      if ((el as SVGGeometryElement).isPointInFill?.(pt)) {
        inside.push({ x: sx, y: sy });
      }
    }
  }

  if (inside.length === 0) return { x: cx, y: cy };

  // Filter to points with margin from shape boundary
  // We check that surrounding points are also inside
  const padded = inside.filter(p => {
    // Check a few points around in cardinal directions at MARGIN distance
    for (const [dx, dy] of [[MARGIN, 0], [-MARGIN, 0], [0, MARGIN], [0, -MARGIN]]) {
      pt.x = p.x + dx;
      pt.y = p.y + dy;
      if (!(el as SVGGeometryElement).isPointInFill?.(pt)) return false;
    }
    return true;
  });

  const candidates = padded.length > 0 ? padded : inside;

  // Find centroid of candidates
  let avgX = 0, avgY = 0;
  for (const p of candidates) { avgX += p.x; avgY += p.y; }
  avgX /= candidates.length;
  avgY /= candidates.length;

  // Pick the candidate closest to the centroid
  let best = candidates[0];
  let bestDist = Infinity;
  for (const p of candidates) {
    const d = (p.x - avgX) ** 2 + (p.y - avgY) ** 2;
    if (d < bestDist) { bestDist = d; best = p; }
  }

  return best;
}

export class MapRenderer {
  mapDef: MapDefinition;
  replay: ReplayFile;
  svg!: SVGSVGElement;
  territoryElements: Map<string, SVGElement> = new Map();
  capitalRings: Map<string, SVGElement> = new Map();
  unitElements: Map<string, SVGTextElement> = new Map();
  nameLabels: Map<string, SVGTextElement> = new Map();
  fogOverlays: Map<string, SVGElement> = new Map();
  overlayGroup!: SVGGElement;
  fogGroup!: SVGGElement;

  // Pan & zoom state
  viewBox = { x: 0, y: 0, w: 3840, h: 2160 };
  isPanning = false;
  panStart = { x: 0, y: 0 };

  constructor(mapDef: MapDefinition, replay: ReplayFile) {
    this.mapDef = mapDef;
    this.replay = replay;
    const [x, y, w, h] = mapDef.viewBox.split(' ').map(Number);
    this.viewBox = { x, y, w, h };
  }

  async mount(container: HTMLElement): Promise<void> {
    const resp = await fetch(this.mapDef.svgUrl);
    const svgText = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    this.svg = doc.documentElement as unknown as SVGSVGElement;

    this.svg.setAttribute('viewBox', this.mapDef.viewBox);
    this.svg.setAttribute('class', 'map-svg');
    this.svg.removeAttribute('width');
    this.svg.removeAttribute('height');

    // Dark background
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '-5000');
    bg.setAttribute('y', '-5000');
    bg.setAttribute('width', '15000');
    bg.setAttribute('height', '15000');
    bg.setAttribute('fill', '#2a2118');
    this.svg.insertBefore(bg, this.svg.firstChild);

    // Find and style territory elements
    const blizzardSet = new Set(this.replay.blizzards);
    const allNames = [
      ...Object.keys(this.mapDef.territories),
      ...this.replay.blizzards,
    ];

    for (const name of allNames) {
      const el = this.svg.getElementById(nameToId(name));
      if (!el) {
        console.warn(`Territory not found in SVG: ${name}`);
        continue;
      }
      el.setAttribute('fill', blizzardSet.has(name) ? BLIZZARD_COLOR : UNOWNED_COLOR);
      el.setAttribute('stroke', '#1a1208');
      el.setAttribute('stroke-width', '4');
      (el as SVGElement).style.cursor = 'pointer';
      this.territoryElements.set(name, el as SVGElement);
    }

    // Overlay group
    this.overlayGroup = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.overlayGroup);

    // Must be in DOM before getBBox/isPointInFill work
    container.appendChild(this.svg);

    // Build labels
    for (const name of Object.keys(this.mapDef.territories)) {
      const el = this.territoryElements.get(name);
      if (!el) continue;

      const gfx = el as SVGGraphicsElement;
      const anchor = findLabelAnchor(gfx, this.svg);

      // Total text block height: label + gap + unit
      const blockH = LABEL_FONT_SIZE + LABEL_GAP + UNIT_FONT_SIZE;
      const topY = anchor.y - blockH / 2;

      // Capital indicator: darkening overlay + gold border following territory shape
      const capGroup = document.createElementNS(SVG_NS, 'g');
      capGroup.setAttribute('display', 'none');
      capGroup.style.pointerEvents = 'none';

      // Dark overlay to darken the territory fill
      const darkOverlay = el.cloneNode(false) as SVGElement;
      darkOverlay.removeAttribute('id');
      darkOverlay.setAttribute('fill', '#000');
      darkOverlay.setAttribute('opacity', '0.3');
      darkOverlay.setAttribute('stroke', 'none');
      capGroup.appendChild(darkOverlay);

      // Gold stroke following the actual shape
      const ring = el.cloneNode(false) as SVGElement;
      ring.removeAttribute('id');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#ffd700');
      ring.setAttribute('stroke-width', String(CAPITAL_STROKE));
      ring.setAttribute('stroke-alignment', 'inside');
      capGroup.appendChild(ring);

      this.overlayGroup.appendChild(capGroup);
      this.capitalRings.set(name, capGroup);

      // Territory name
      const nameText = document.createElementNS(SVG_NS, 'text');
      nameText.setAttribute('x', String(anchor.x));
      nameText.setAttribute('y', String(topY + LABEL_FONT_SIZE));
      nameText.setAttribute('text-anchor', 'middle');
      nameText.setAttribute('fill', '#fff');
      nameText.setAttribute('stroke', '#000');
      nameText.setAttribute('stroke-width', '4');
      nameText.setAttribute('paint-order', 'stroke');
      nameText.setAttribute('font-family', "'Segoe UI', Roboto, Arial, sans-serif");
      nameText.setAttribute('font-size', String(LABEL_FONT_SIZE));
      nameText.setAttribute('font-weight', '600');
      nameText.setAttribute('letter-spacing', '0.5');
      nameText.style.pointerEvents = 'none';
      nameText.style.userSelect = 'none';
      nameText.textContent = name;
      this.overlayGroup.appendChild(nameText);
      this.nameLabels.set(name, nameText);

      // Unit count
      const unitText = document.createElementNS(SVG_NS, 'text');
      unitText.setAttribute('x', String(anchor.x));
      unitText.setAttribute('y', String(topY + LABEL_FONT_SIZE + LABEL_GAP + UNIT_FONT_SIZE));
      unitText.setAttribute('text-anchor', 'middle');
      unitText.setAttribute('fill', '#fff');
      unitText.setAttribute('stroke', '#000');
      unitText.setAttribute('stroke-width', '6');
      unitText.setAttribute('paint-order', 'stroke');
      unitText.setAttribute('font-family', "'Segoe UI', Roboto, Arial, sans-serif");
      unitText.setAttribute('font-weight', '800');
      unitText.setAttribute('font-size', String(UNIT_FONT_SIZE));
      unitText.style.pointerEvents = 'none';
      unitText.style.userSelect = 'none';
      this.overlayGroup.appendChild(unitText);
      this.unitElements.set(name, unitText);
    }

    // Fog overlay group (on top of everything)
    this.fogGroup = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.fogGroup);

    // Clone territory shapes for fog overlays (no blizzards - always visible)
    for (const name of Object.keys(this.mapDef.territories)) {
      const el = this.territoryElements.get(name);
      if (!el) continue;

      const fogEl = el.cloneNode(false) as SVGElement;
      fogEl.removeAttribute('id');
      fogEl.setAttribute('fill', FOG_COLOR);
      fogEl.setAttribute('opacity', FOG_OPACITY);
      fogEl.setAttribute('stroke', 'none');
      fogEl.setAttribute('display', 'none');
      fogEl.style.pointerEvents = 'none';
      this.fogGroup.appendChild(fogEl);
      this.fogOverlays.set(name, fogEl);
    }

    // Set up pan & zoom
    this.setupPanZoom(container);
  }

  setupPanZoom(container: HTMLElement): void {
    const svg = this.svg;

    // Convert screen px delta to SVG coordinate delta
    const screenToSvg = (dx: number, dy: number) => {
      const rect = svg.getBoundingClientRect();
      return {
        dx: (dx / rect.width) * this.viewBox.w,
        dy: (dy / rect.height) * this.viewBox.h,
      };
    };

    // Wheel zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;

      // Zoom towards mouse position
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * this.viewBox.w + this.viewBox.x;
      const my = ((e.clientY - rect.top) / rect.height) * this.viewBox.h + this.viewBox.y;

      const newW = this.viewBox.w * factor;
      const newH = this.viewBox.h * factor;

      // Clamp: don't zoom out beyond original
      const [, , origW, origH] = this.mapDef.viewBox.split(' ').map(Number);
      if (newW > origW * 1.2 || newH > origH * 1.2) return;
      // Don't zoom in too far
      if (newW < 200 || newH < 100) return;

      this.viewBox.x = mx - (mx - this.viewBox.x) * (newW / this.viewBox.w);
      this.viewBox.y = my - (my - this.viewBox.y) * (newH / this.viewBox.h);
      this.viewBox.w = newW;
      this.viewBox.h = newH;
      this.applyViewBox();
    }, { passive: false });

    // Pan with middle mouse or left mouse drag
    container.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 1) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      const svgDelta = screenToSvg(-dx, -dy);
      this.viewBox.x += svgDelta.dx;
      this.viewBox.y += svgDelta.dy;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.applyViewBox();
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        container.style.cursor = '';
      }
    });

    // Double-click to reset zoom
    container.addEventListener('dblclick', () => {
      const [x, y, w, h] = this.mapDef.viewBox.split(' ').map(Number);
      this.viewBox = { x, y, w, h };
      this.applyViewBox();
    });
  }

  applyViewBox(): void {
    this.svg.setAttribute(
      'viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`
    );
  }

  update(state: ReplayState, visibleTerritories?: Set<string>): void {
    const blizzardSet = new Set(state.replay.blizzards);

    for (const [name, el] of this.territoryElements) {
      const isBlizzard = blizzardSet.has(name);
      const fogged = !isBlizzard && visibleTerritories && !visibleTerritories.has(name);

      // Fog overlay
      const fogRect = this.fogOverlays.get(name);
      if (fogRect) {
        fogRect.setAttribute('display', fogged ? 'inline' : 'none');
      }

      if (isBlizzard) continue;

      const terr = state.mapState[name];
      if (!terr) continue;

      if (fogged) {
        // Show territory as unknown
        el.setAttribute('fill', '#4a4035');
        const ring = this.capitalRings.get(name);
        if (ring) ring.setAttribute('display', 'none');
        const unitEl = this.unitElements.get(name);
        if (unitEl) unitEl.textContent = '?';
        const nameLabel = this.nameLabels.get(name);
        if (nameLabel) nameLabel.setAttribute('opacity', '0.3');
      } else {
        const playerInfo = state.replay.players[String(terr.ownedBy)];
        const color = playerInfo ? getPlayerColor(playerInfo.colour) : UNOWNED_COLOR;
        el.setAttribute('fill', color);

        const ring = this.capitalRings.get(name);
        if (ring) {
          ring.setAttribute('display', terr.isCapital ? 'inline' : 'none');
        }

        const unitEl = this.unitElements.get(name);
        if (unitEl) {
          unitEl.textContent = String(terr.units);
        }

        const nameLabel = this.nameLabels.get(name);
        if (nameLabel) nameLabel.setAttribute('opacity', '1');
      }
    }
  }

  highlightTerritories(names: string[]): void {
    for (const [, el] of this.territoryElements) {
      el.style.filter = '';
    }
    for (const name of names) {
      const el = this.territoryElements.get(name);
      if (el) el.style.filter = 'brightness(1.3)';
    }
  }
}
