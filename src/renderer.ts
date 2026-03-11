import type { ReplayFile, ReplayState, MapDefinition } from './types';
import { getPlayerColor, brightenColor, BLIZZARD_COLOR, UNOWNED_COLOR } from './colors';
import { getHeldContinents } from './continents';
import { getFlatSnapshots } from './replay';

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT_FONT_SIZE = 42;
const LABEL_FONT_SIZE = 20;
const LABEL_GAP = 8;
const CAPITAL_STROKE = 6;
const MARGIN = 40;
const FOG_COLOR = '#1a1510';
const FOG_OPACITY = '0.75';

/**
 * Sample points along an SVG shape's perimeter.
 */
function samplePerimeter(el: SVGGeometryElement, count: number): { x: number; y: number }[] {
  const len = el.getTotalLength();
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const p = el.getPointAtLength((len * i) / count);
    pts.push({ x: p.x, y: p.y });
  }
  return pts;
}

/**
 * Find shared boundary points between two territory shapes.
 * Returns one midpoint per distinct shared edge segment (so L-shaped
 * connections get 2 dots instead of 1 misplaced dot at the corner).
 */
function findSharedBoundaries(
  el1: SVGGeometryElement,
  el2: SVGGeometryElement,
): { x: number; y: number }[] {
  const pts1 = samplePerimeter(el1, 160);
  const pts2 = samplePerimeter(el2, 160);
  const MAX_GAP = 14;
  const MAX_GAP_SQ = MAX_GAP * MAX_GAP;

  const touchPoints: { x: number; y: number }[] = [];

  for (const p1 of pts1) {
    for (const p2 of pts2) {
      const dsq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
      if (dsq < MAX_GAP_SQ) {
        touchPoints.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
        break;
      }
    }
  }

  if (touchPoints.length === 0) return [];

  // Separate touch points into vertical edges (similar X) vs horizontal edges (similar Y)
  // Then pick the group with more points (the longer shared edge)
  const xSpread = Math.max(...touchPoints.map(p => p.x)) - Math.min(...touchPoints.map(p => p.x));
  const ySpread = Math.max(...touchPoints.map(p => p.y)) - Math.min(...touchPoints.map(p => p.y));

  let filtered: { x: number; y: number }[];
  if (xSpread < 15 && ySpread < 15) {
    // Small cluster — just use all points
    filtered = touchPoints;
  } else if (ySpread > xSpread) {
    // Points spread more vertically — this is a vertical shared edge
    // Filter to points with X near the median X (discard horizontal edge outliers)
    const xs = touchPoints.map(p => p.x).sort((a, b) => a - b);
    const medX = xs[Math.floor(xs.length / 2)];
    filtered = touchPoints.filter(p => Math.abs(p.x - medX) < 15);
  } else {
    // Points spread more horizontally — this is a horizontal shared edge
    const ys = touchPoints.map(p => p.y).sort((a, b) => a - b);
    const medY = ys[Math.floor(ys.length / 2)];
    filtered = touchPoints.filter(p => Math.abs(p.y - medY) < 15);
  }

  if (filtered.length === 0) filtered = touchPoints;

  let sx = 0, sy = 0;
  for (const p of filtered) { sx += p.x; sy += p.y; }
  return [{ x: sx / filtered.length, y: sy / filtered.length }];
}

/**
 * Find the midpoint of the facing edge of a shape toward another shape.
 * Picks the edge of bb1 whose minimum distance to bb2 is smallest,
 * then averages the perimeter points on that edge.
 */
function facingEdgeMidpoint(
  el: SVGGeometryElement,
  otherEl: SVGGeometryElement
): { x: number; y: number } {
  const bb1 = el.getBBox();
  const bb2 = otherEl.getBBox();

  // For each side, compute the true 2D distance from the edge midpoint to the
  // closest point on bb2, considering perpendicular overlap.
  const r = bb1.x + bb1.width;
  const b = bb1.y + bb1.height;
  const r2 = bb2.x + bb2.width;
  const b2 = bb2.y + bb2.height;
  const cx2 = bb2.x + bb2.width / 2;
  const cy2 = bb2.y + bb2.height / 2;

  // Edge midpoints of bb1
  const edgeMids: { side: string; x: number; y: number }[] = [
    { side: 'right',  x: r,    y: bb1.y + bb1.height / 2 },
    { side: 'left',   x: bb1.x, y: bb1.y + bb1.height / 2 },
    { side: 'bottom', x: bb1.x + bb1.width / 2, y: b },
    { side: 'top',    x: bb1.x + bb1.width / 2, y: bb1.y },
  ];

  // Only consider edges where bb2 is on that side
  const candidates = edgeMids.filter(e => {
    if (e.side === 'right')  return cx2 > bb1.x + bb1.width / 2;
    if (e.side === 'left')   return cx2 < bb1.x + bb1.width / 2;
    if (e.side === 'bottom') return cy2 > bb1.y + bb1.height / 2;
    return cy2 < bb1.y + bb1.height / 2;
  });

  // Distance from each edge midpoint to closest point on bb2
  function distToBox(px: number, py: number): number {
    const cx = Math.max(bb2.x, Math.min(px, r2));
    const cy = Math.max(bb2.y, Math.min(py, b2));
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  // Weight: actual distance + penalty for misalignment with center-to-center direction
  const cx1 = bb1.x + bb1.width / 2;
  const cy1 = bb1.y + bb1.height / 2;
  const dirLen = Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2);
  const dirX = dirLen > 0 ? (cx2 - cx1) / dirLen : 0;
  const dirY = dirLen > 0 ? (cy2 - cy1) / dirLen : 0;

  // Normal vector for each side (pointing outward)
  const sideNormals: Record<string, { x: number; y: number }> = {
    right: { x: 1, y: 0 }, left: { x: -1, y: 0 },
    bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 },
  };

  function edgeScore(e: { side: string; x: number; y: number }): number {
    const dist = distToBox(e.x, e.y);
    // Dot product: how aligned is this side's outward normal with center-to-center direction
    const n = sideNormals[e.side];
    const alignment = n.x * dirX + n.y * dirY; // 1 = perfect, -1 = opposite
    // Penalize poorly aligned edges
    return dist - alignment * 200;
  }

  const pool = candidates.length > 0 ? candidates : edgeMids;
  pool.sort((a, _b) => edgeScore(a) - edgeScore(_b));

  const bestSide = pool[0].side;

  const pts = samplePerimeter(el, 120);
  const TOLERANCE = 3;
  let edgePts: { x: number; y: number }[];

  if (bestSide === 'right') {
    const maxX = Math.max(...pts.map(p => p.x));
    edgePts = pts.filter(p => p.x > maxX - TOLERANCE);
  } else if (bestSide === 'left') {
    const minX = Math.min(...pts.map(p => p.x));
    edgePts = pts.filter(p => p.x < minX + TOLERANCE);
  } else if (bestSide === 'bottom') {
    const maxY = Math.max(...pts.map(p => p.y));
    edgePts = pts.filter(p => p.y > maxY - TOLERANCE);
  } else {
    const minY = Math.min(...pts.map(p => p.y));
    edgePts = pts.filter(p => p.y < minY + TOLERANCE);
  }

  if (edgePts.length > 0) {
    let sx = 0, sy = 0;
    for (const p of edgePts) { sx += p.x; sy += p.y; }
    return { x: sx / edgePts.length, y: sy / edgePts.length };
  }

  const cx = bb1.x + bb1.width / 2;
  const cy = bb1.y + bb1.height / 2;
  return { x: cx, y: cy };
}

function facingPerimeterPair(
  el1: SVGGeometryElement,
  el2: SVGGeometryElement
): { p1: { x: number; y: number }; p2: { x: number; y: number } } {
  return {
    p1: facingEdgeMidpoint(el1, el2),
    p2: facingEdgeMidpoint(el2, el1),
  };
}

/**
 * Check if a straight line between two points would cross any territory shape
 * other than the two connected ones.
 */
function lineCrossesTerritory(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  skipNames: Set<string>,
  territoryElements: Map<string, SVGElement>,
  svg: SVGSVGElement
): boolean {
  const pt = svg.createSVGPoint();
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    pt.x = p1.x + (p2.x - p1.x) * t;
    pt.y = p1.y + (p2.y - p1.y) * t;
    for (const [name, el] of territoryElements) {
      if (skipNames.has(name)) continue;
      if ((el as SVGGeometryElement).isPointInFill?.(pt)) return true;
    }
  }
  return false;
}

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
  capitalBoxes: Map<string, SVGRectElement> = new Map();
  continentOverlays: Map<string, SVGElement> = new Map();
  continentBorders: Map<string, SVGElement> = new Map();
  continentGroup!: SVGGElement;
  unitElements: Map<string, SVGTextElement> = new Map();
  nameLabels: Map<string, SVGTextElement> = new Map();
  fogOverlays: Map<string, SVGElement> = new Map();
  flashOverlays: Map<string, SVGElement> = new Map();
  overlayGroup!: SVGGElement;
  fogGroup!: SVGGElement;
  flashGroup!: SVGGElement;

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

    // Continent overlay group (below connections)
    this.continentGroup = document.createElementNS(SVG_NS, 'g');
    this.continentGroup.style.pointerEvents = 'none';
    this.svg.appendChild(this.continentGroup);

    // Connections group (above continent overlays)
    const connectionsGroup = document.createElementNS(SVG_NS, 'g');
    connectionsGroup.style.pointerEvents = 'none';
    this.svg.appendChild(connectionsGroup);

    // Overlay group (labels, units, capitals)
    this.overlayGroup = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.overlayGroup);

    // Must be in DOM before getBBox/isPointInFill work
    container.appendChild(this.svg);

    // Draw connections
    const drawnConnections = new Set<string>();
    for (const [name, def] of Object.entries(this.mapDef.territories)) {
      if (blizzardSet.has(name)) continue;
      const el1 = this.territoryElements.get(name) as SVGGeometryElement | undefined;
      if (!el1) continue;
      for (const neighbor of def.connections) {
        if (blizzardSet.has(neighbor)) continue;
        const key = [name, neighbor].sort().join('|');
        if (drawnConnections.has(key)) continue;
        drawnConnections.add(key);

        const el2 = this.territoryElements.get(neighbor) as SVGGeometryElement | undefined;
        if (!el2) continue;

        // Try to find shared boundary segments
        let boundaries = findSharedBoundaries(el1, el2);
        if (boundaries.length === 0) boundaries = findSharedBoundaries(el2, el1);

        if (boundaries.length > 0) {
          for (const mid of boundaries) {
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', String(mid.x));
            dot.setAttribute('cy', String(mid.y));
            dot.setAttribute('r', '6');
            dot.setAttribute('fill', '#ccc');
            dot.setAttribute('stroke', '#1a1208');
            dot.setAttribute('stroke-width', '2');
            connectionsGroup.appendChild(dot);
          }
        } else {
          // No shared boundary — draw a line between facing perimeter points
          const { p1, p2 } = facingPerimeterPair(el1, el2);

          // Dots at both endpoints
          for (const ep of [p1, p2]) {
            const dot = document.createElementNS(SVG_NS, 'circle');
            dot.setAttribute('cx', String(ep.x));
            dot.setAttribute('cy', String(ep.y));
            dot.setAttribute('r', '6');
            dot.setAttribute('fill', '#ccc');
            dot.setAttribute('stroke', '#1a1208');
            dot.setAttribute('stroke-width', '2');
            connectionsGroup.appendChild(dot);
          }

          const skipSet = new Set([name, neighbor]);
          const crosses = lineCrossesTerritory(p1, p2, skipSet, this.territoryElements, this.svg);

          const path = document.createElementNS(SVG_NS, 'path');
          if (crosses) {
            // Curve away: offset control point perpendicular to the line
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / len;
            const ny = dx / len;
            const offset = len * 0.4;
            let cpx = mx + nx * offset;
            let cpy = my + ny * offset;
            // Pick the side that avoids other territories
            const pt = this.svg.createSVGPoint();
            pt.x = cpx; pt.y = cpy;
            let inTerritory = false;
            for (const [tName, tEl] of this.territoryElements) {
              if (skipSet.has(tName)) continue;
              if ((tEl as SVGGeometryElement).isPointInFill?.(pt)) { inTerritory = true; break; }
            }
            if (inTerritory) {
              cpx = mx - nx * offset;
              cpy = my - ny * offset;
            }
            path.setAttribute('d', `M${p1.x},${p1.y} Q${cpx},${cpy} ${p2.x},${p2.y}`);
          } else {
            path.setAttribute('d', `M${p1.x},${p1.y} L${p2.x},${p2.y}`);
          }
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', '#aaa');
          path.setAttribute('stroke-width', '3');
          path.setAttribute('stroke-dasharray', '8 6');
          path.setAttribute('opacity', '0.6');
          connectionsGroup.appendChild(path);
        }
      }
    }

    // Build labels
    for (const name of Object.keys(this.mapDef.territories)) {
      const el = this.territoryElements.get(name);
      if (!el) continue;

      const gfx = el as SVGGraphicsElement;
      const anchor = findLabelAnchor(gfx, this.svg);

      // Total text block height: label + gap + unit
      const blockH = LABEL_FONT_SIZE + LABEL_GAP + UNIT_FONT_SIZE;
      const topY = anchor.y - blockH / 2;

      // Continent bonus overlay: darkening + colored border following territory shape
      const contGroupEl = document.createElementNS(SVG_NS, 'g');
      contGroupEl.setAttribute('display', 'none');
      contGroupEl.style.pointerEvents = 'none';

      const contBrighten = el.cloneNode(false) as SVGElement;
      contBrighten.removeAttribute('id');
      contBrighten.setAttribute('fill', '#fff');
      contBrighten.setAttribute('opacity', '0.15');
      contBrighten.setAttribute('stroke', 'none');
      contGroupEl.appendChild(contBrighten);

      const contBorder = el.cloneNode(false) as SVGElement;
      contBorder.removeAttribute('id');
      contBorder.setAttribute('fill', 'none');
      contBorder.setAttribute('stroke', '#5fff5f');
      contBorder.setAttribute('stroke-width', String(CAPITAL_STROKE));
      contGroupEl.appendChild(contBorder);

      this.continentGroup.appendChild(contGroupEl);
      this.continentOverlays.set(name, contGroupEl);
      this.continentBorders.set(name, contBorder);

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

      // Capital box (rect around troop number area)
      const unitY = topY + LABEL_FONT_SIZE + LABEL_GAP;
      const boxPad = 3;
      const boxW = UNIT_FONT_SIZE * 1.4;
      const boxH = UNIT_FONT_SIZE + boxPad * 2;
      const capBox = document.createElementNS(SVG_NS, 'rect');
      capBox.setAttribute('x', String(anchor.x - boxW / 2));
      capBox.setAttribute('y', String(unitY - boxPad));
      capBox.setAttribute('width', String(boxW));
      capBox.setAttribute('height', String(boxH));
      capBox.setAttribute('rx', '4');
      capBox.setAttribute('fill', 'rgba(0,0,0,0.35)');
      capBox.setAttribute('stroke', '#fff');
      capBox.setAttribute('stroke-width', '3');
      capBox.setAttribute('display', 'none');
      capBox.style.pointerEvents = 'none';
      this.overlayGroup.appendChild(capBox);
      this.capitalBoxes.set(name, capBox);

      // Unit count — vertically centered in the capital box area
      const boxCenterY = unitY - boxPad + boxH / 2;
      const unitText = document.createElementNS(SVG_NS, 'text');
      unitText.setAttribute('x', String(anchor.x));
      unitText.setAttribute('y', String(boxCenterY));
      unitText.setAttribute('text-anchor', 'middle');
      unitText.setAttribute('dominant-baseline', 'central');
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

    // Flash overlay group (above labels, below fog)
    this.flashGroup = document.createElementNS(SVG_NS, 'g');
    this.flashGroup.style.pointerEvents = 'none';
    this.svg.appendChild(this.flashGroup);

    for (const name of Object.keys(this.mapDef.territories)) {
      const el = this.territoryElements.get(name);
      if (!el) continue;

      const flashEl = el.cloneNode(false) as SVGElement;
      flashEl.removeAttribute('id');
      flashEl.setAttribute('fill', '#000');
      flashEl.setAttribute('opacity', '0');
      flashEl.setAttribute('stroke', 'none');
      flashEl.setAttribute('display', 'none');
      flashEl.style.pointerEvents = 'none';
      this.flashGroup.appendChild(flashEl);
      this.flashOverlays.set(name, flashEl);
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

    // Compute held continent territories for highlighting
    const heldContinents = getHeldContinents(state, this.mapDef);
    // When fog is active, only show continent if all its territories are visible
    const continentTerritories = new Set<string>();
    const continentOwnerColors = new Map<string, string>(); // territory → owner color
    for (const [pid, held] of Object.entries(heldContinents)) {
      const playerInfo = state.replay.players[pid];
      const color = playerInfo ? getPlayerColor(playerInfo.colour) : '#5fff5f';
      for (const cont of held) {
        // Under fog, skip if any continent territory is hidden
        if (visibleTerritories) {
          const allVisible = cont.territories.every(t => blizzardSet.has(t) || visibleTerritories.has(t));
          if (!allVisible) continue;
        }
        for (const t of cont.territories) {
          continentTerritories.add(t);
          continentOwnerColors.set(t, brightenColor(color, 0.4));
        }
      }
    }

    // Determine which territories changed in the current snapshot (for flash effect)
    const changedTerritories = new Set<string>();
    if (state.currentSnapshotIndex >= 0) {
      const flat = getFlatSnapshots(state);
      const snap = flat[state.currentSnapshotIndex];
      if (snap?.snapshot.type === 'territory') {
        for (const name of Object.keys(snap.snapshot.territories)) {
          changedTerritories.add(name);
        }
      }
    }

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
        el.setAttribute('fill', '#4a4035');
        const capBox = this.capitalBoxes.get(name);
        if (capBox) capBox.setAttribute('display', 'none');
        const contOverlay = this.continentOverlays.get(name);
        if (contOverlay) contOverlay.setAttribute('display', 'none');
        const unitEl = this.unitElements.get(name);
        if (unitEl) unitEl.textContent = '?';
        const nameLabel = this.nameLabels.get(name);
        if (nameLabel) nameLabel.setAttribute('opacity', '0.3');
      } else {
        const playerInfo = state.replay.players[String(terr.ownedBy)];
        const color = playerInfo ? getPlayerColor(playerInfo.colour) : UNOWNED_COLOR;
        el.setAttribute('fill', color);

        // Capital: player-colored box around troop number
        const capBox = this.capitalBoxes.get(name);
        if (capBox) {
          if (terr.isCapital) {
            capBox.setAttribute('display', 'inline');
            capBox.setAttribute('stroke', brightenColor(color, 0.5));
          } else {
            capBox.setAttribute('display', 'none');
          }
        }

        // Continent bonus: dark overlay + player-colored border on territory shape
        const contOverlay = this.continentOverlays.get(name);
        if (contOverlay) {
          const inHeldContinent = continentTerritories.has(name);
          contOverlay.setAttribute('display', inHeldContinent ? 'inline' : 'none');
          if (inHeldContinent) {
            const contBorder = this.continentBorders.get(name);
            if (contBorder) {
              contBorder.setAttribute('stroke', continentOwnerColors.get(name) ?? '#5fff5f');
            }
          }
        }

        const unitEl = this.unitElements.get(name);
        if (unitEl) {
          unitEl.textContent = String(terr.units);
        }

        const nameLabel = this.nameLabels.get(name);
        if (nameLabel) nameLabel.setAttribute('opacity', '1');
      }
    }

    // Flash changed territories
    for (const [name, flashEl] of this.flashOverlays) {
      const fogged = visibleTerritories && !visibleTerritories.has(name);
      if (changedTerritories.has(name) && !fogged) {
        flashEl.setAttribute('display', 'inline');
        // Remove existing animate if any
        while (flashEl.firstChild) flashEl.removeChild(flashEl.firstChild);
        const anim = document.createElementNS(SVG_NS, 'animate');
        anim.setAttribute('attributeName', 'opacity');
        anim.setAttribute('values', '0;0.4;0');
        anim.setAttribute('dur', '0.333s');
        anim.setAttribute('repeatCount', 'indefinite');
        flashEl.appendChild(anim);
        anim.beginElement();
      } else {
        flashEl.setAttribute('display', 'none');
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
