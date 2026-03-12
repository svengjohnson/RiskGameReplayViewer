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
  const pts1 = samplePerimeter(el1, 200);
  const pts2 = samplePerimeter(el2, 200);
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

  // Cluster touch points using distance-based grouping to separate
  // distinct shared edge segments (e.g. L-shaped borders).
  const CLUSTER_GAP = 40;
  const CLUSTER_GAP_SQ = CLUSTER_GAP * CLUSTER_GAP;
  const clusters: { x: number; y: number }[][] = [];

  for (const p of touchPoints) {
    let added = false;
    for (const cluster of clusters) {
      for (const cp of cluster) {
        if ((p.x - cp.x) ** 2 + (p.y - cp.y) ** 2 < CLUSTER_GAP_SQ) {
          cluster.push(p);
          added = true;
          break;
        }
      }
      if (added) break;
    }
    if (!added) clusters.push([p]);
  }

  // Return one midpoint per cluster (so L-shaped borders get 2 dots)
  // Filter out tiny clusters (noise) — keep clusters with at least 20% of max cluster size
  const maxLen = Math.max(...clusters.map(c => c.length));
  const minLen = Math.max(2, maxLen * 0.2);

  return clusters
    .filter(c => c.length >= minLen)
    .map(cluster => {
      let sx = 0, sy = 0;
      for (const p of cluster) { sx += p.x; sy += p.y; }
      return { x: sx / cluster.length, y: sy / cluster.length };
    });
}

function facingPerimeterPair(
  el1: SVGGeometryElement,
  el2: SVGGeometryElement
): { p1: { x: number; y: number }; p2: { x: number; y: number } } {
  // Find the closest pair of perimeter points between the two shapes
  const pts1 = samplePerimeter(el1, 200);
  const pts2 = samplePerimeter(el2, 200);
  let bestDist = Infinity;
  let bestP1 = pts1[0];
  let bestP2 = pts2[0];

  for (const p1 of pts1) {
    for (const p2 of pts2) {
      const dsq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
      if (dsq < bestDist) {
        bestDist = dsq;
        bestP1 = p1;
        bestP2 = p2;
      }
    }
  }

  return { p1: bestP1, p2: bestP2 };
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
  labelAnchors: Map<string, { x: number; unitY: number; boxPad: number; boxH: number }> = new Map();
  fogOverlays: Map<string, SVGElement> = new Map();
  flashOverlays: Map<string, SVGElement> = new Map();
  duplicateElements: Map<string, SVGElement[]> = new Map();
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

    // Background: image if provided, otherwise flat color
    if (this.mapDef.backgroundUrl) {
      // Remove any existing background rects from the SVG source (no id, typically first rect)
      const firstChildren = Array.from(this.svg.children);
      for (const child of firstChildren) {
        if (child.tagName === 'rect' && !child.id) {
          child.remove();
        }
      }
      const [, , vbW, vbH] = this.mapDef.viewBox.split(' ').map(Number);
      const bgImg = document.createElementNS(SVG_NS, 'image');
      bgImg.setAttribute('href', this.mapDef.backgroundUrl);
      bgImg.setAttribute('x', '0');
      bgImg.setAttribute('y', '0');
      bgImg.setAttribute('width', String(vbW));
      bgImg.setAttribute('height', String(vbH));
      bgImg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      this.svg.insertBefore(bgImg, this.svg.firstChild);
    } else {
      const bg = document.createElementNS(SVG_NS, 'rect');
      bg.setAttribute('x', '-5000');
      bg.setAttribute('y', '-5000');
      bg.setAttribute('width', '15000');
      bg.setAttribute('height', '15000');
      bg.setAttribute('fill', '#2b2b2b');
      this.svg.insertBefore(bg, this.svg.firstChild);
    }

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

    // Find and style duplicate elements (e.g. wrap-around territories)
    if (this.mapDef.duplicates) {
      for (const [name, dupIds] of Object.entries(this.mapDef.duplicates)) {
        const dups: SVGElement[] = [];
        for (const dupId of dupIds) {
          const el = this.svg.getElementById(dupId);
          if (el) {
            el.setAttribute('fill', UNOWNED_COLOR);
            el.setAttribute('stroke', '#1a1208');
            el.setAttribute('stroke-width', '4');
      
            (el as SVGElement).style.cursor = 'pointer';
            dups.push(el as SVGElement);
          }
        }
        if (dups.length > 0) this.duplicateElements.set(name, dups);
      }
    }

    // Continent overlay group (below labels)
    this.continentGroup = document.createElementNS(SVG_NS, 'g');
    this.continentGroup.style.pointerEvents = 'none';
    this.svg.appendChild(this.continentGroup);

    // Overlay group (labels, units, capitals)
    this.overlayGroup = document.createElementNS(SVG_NS, 'g');
    this.svg.appendChild(this.overlayGroup);

    // Connections group — appended after fog later so it renders above fog
    const connectionsGroup = document.createElementNS(SVG_NS, 'g');
    connectionsGroup.style.pointerEvents = 'none';

    // Must be in DOM before getBBox/isPointInFill work
    container.appendChild(this.svg);

    // Collect all SVG elements for a territory (main + duplicates)
    const getAllElements = (tName: string): SVGGeometryElement[] => {
      const els: SVGGeometryElement[] = [];
      const main = this.territoryElements.get(tName) as SVGGeometryElement | undefined;
      if (main) els.push(main);
      const dups = this.duplicateElements.get(tName);
      if (dups) els.push(...(dups as SVGGeometryElement[]));
      return els;
    };

    // Draw connections
    const drawDots = this.mapDef.renderConnectionDots !== false;
    const drawLines = this.mapDef.renderConnectionLines !== false;

    if (drawDots || drawLines) {
    const drawnConnections = new Set<string>();
    for (const [name, def] of Object.entries(this.mapDef.territories)) {
      if (blizzardSet.has(name)) continue;
      const els1 = getAllElements(name);
      if (els1.length === 0) continue;
      for (const neighbor of def.connections) {
        if (blizzardSet.has(neighbor)) continue;
        const key = [name, neighbor].sort().join('|');
        if (drawnConnections.has(key)) continue;
        drawnConnections.add(key);

        const els2 = getAllElements(neighbor);
        if (els2.length === 0) continue;

        // Try all element pairs and pick the one with shared boundaries,
        // or the closest pair if none share boundaries
        let bestBoundaries: { x: number; y: number }[] = [];
        let bestEl1: SVGGeometryElement = els1[0];
        let bestEl2: SVGGeometryElement = els2[0];
        let bestDist = Infinity;

        for (const e1 of els1) {
          for (const e2 of els2) {
            let boundaries = findSharedBoundaries(e1, e2);
            if (boundaries.length === 0) boundaries = findSharedBoundaries(e2, e1);
            if (boundaries.length > 0 && bestBoundaries.length === 0) {
              bestBoundaries = boundaries;
              bestEl1 = e1;
              bestEl2 = e2;
            } else if (bestBoundaries.length === 0) {
              const bb1 = e1.getBBox();
              const bb2 = e2.getBBox();
              const dx = (bb1.x + bb1.width / 2) - (bb2.x + bb2.width / 2);
              const dy = (bb1.y + bb1.height / 2) - (bb2.y + bb2.height / 2);
              const dist = dx * dx + dy * dy;
              if (dist < bestDist) {
                bestDist = dist;
                bestEl1 = e1;
                bestEl2 = e2;
              }
            }
          }
        }

        const el1 = bestEl1;
        const el2 = bestEl2;
        const boundaries = bestBoundaries;

        if (boundaries.length > 0) {
          // Adjacent territories — draw dots on shared border
          if (drawDots) {
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
          }
        } else if (drawLines) {
          // Non-adjacent — draw dashed line between closest perimeter points
          const { p1, p2 } = facingPerimeterPair(el1, el2);

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
      this.labelAnchors.set(name, { x: anchor.x, unitY, boxPad, boxH });

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

    // Snowflake labels for blizzard territories
    for (const name of this.replay.blizzards) {
      const el = this.territoryElements.get(name);
      if (!el) continue;
      const gfx = el as SVGGraphicsElement;
      const anchor = findLabelAnchor(gfx, this.svg);
      const blockH = LABEL_FONT_SIZE + LABEL_GAP + UNIT_FONT_SIZE;
      const topY = anchor.y - blockH / 2;
      const unitY = topY + LABEL_FONT_SIZE + LABEL_GAP;

      // Territory name for blizzard
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

      const snowflake = document.createElementNS(SVG_NS, 'text');
      snowflake.setAttribute('x', String(anchor.x));
      snowflake.setAttribute('y', String(unitY + UNIT_FONT_SIZE / 2));
      snowflake.setAttribute('text-anchor', 'middle');
      snowflake.setAttribute('dominant-baseline', 'central');
      snowflake.setAttribute('font-size', String(UNIT_FONT_SIZE));
      snowflake.style.pointerEvents = 'none';
      snowflake.style.userSelect = 'none';
      snowflake.textContent = '\u2744\uFE0F';
      this.overlayGroup.appendChild(snowflake);
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

    // Move SVG-embedded non-territory elements (e.g. manually-added connection dots) above fog.
    // Collect all known territory/blizzard elements so we can identify decorations.
    const knownElements = new Set<Element>();
    for (const el of this.territoryElements.values()) knownElements.add(el);
    for (const dups of this.duplicateElements.values()) {
      for (const el of dups) knownElements.add(el);
    }
    const ourGroups = new Set<Element>([this.overlayGroup, this.continentGroup, this.flashGroup, this.fogGroup, connectionsGroup]);
    const decorations: Element[] = [];
    const collectDecorations = (parent: Element) => {
      for (const child of Array.from(parent.children)) {
        if (knownElements.has(child) || ourGroups.has(child)) continue;
        const tag = child.tagName.toLowerCase();
        if (tag === 'defs' || tag === 'rect' || tag === 'image') continue; // keep defs, background rects/images in place
        decorations.push(child);
      }
    };
    collectDecorations(this.svg);
    for (const el of decorations) this.svg.appendChild(el);

    // Re-append overlay group (labels/units) above fog so text is always visible
    this.svg.appendChild(this.overlayGroup);

    // Connections above fog so they remain visible
    this.svg.appendChild(connectionsGroup);

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
    const changedTerritories = new Map<string, { prevUnits?: number; conquered: boolean }>();
    if (state.currentSnapshotIndex >= 0) {
      const flat = getFlatSnapshots(state);
      const snap = flat[state.currentSnapshotIndex];
      if (snap?.snapshot.type === 'territory') {
        for (const [name, t] of Object.entries(snap.snapshot.territories)) {
          changedTerritories.set(name, {
            prevUnits: t.previousUnits,
            conquered: t.previouslyOwnedBy !== undefined,
          });
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

      // Helper to sync duplicate elements
      const syncDuplicates = (fillColor: string) => {
        const dups = this.duplicateElements.get(name);
        if (dups) for (const dup of dups) dup.setAttribute('fill', fillColor);
      };

      if (fogged) {
        el.setAttribute('fill', '#4a4035');
        syncDuplicates('#4a4035');
        const capBox = this.capitalBoxes.get(name);
        if (capBox) capBox.setAttribute('display', 'none');
        const contOverlay = this.continentOverlays.get(name);
        if (contOverlay) contOverlay.setAttribute('display', 'none');
        const unitEl = this.unitElements.get(name);
        if (unitEl) { unitEl.textContent = '?'; unitEl.setAttribute('opacity', '0.5'); }
        const nameLabel = this.nameLabels.get(name);
        if (nameLabel) nameLabel.setAttribute('opacity', '0.5');
      } else {
        const playerInfo = state.replay.players[String(terr.ownedBy)];
        const color = playerInfo ? getPlayerColor(playerInfo.colour) : UNOWNED_COLOR;
        el.setAttribute('fill', color);
        syncDuplicates(color);

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
          unitEl.setAttribute('opacity', '1');
          const change = changedTerritories.get(name);
          if (change?.prevUnits != null && change.prevUnits !== terr.units && !change.conquered) {
            unitEl.textContent = `${change.prevUnits}→${terr.units}`;
          } else {
            unitEl.textContent = String(terr.units);
          }

          // Dynamically resize capital box to fit text
          if (capBox && terr.isCapital) {
            const anchor = this.labelAnchors.get(name);
            if (anchor) {
              const textLen = unitEl.getComputedTextLength();
              const boxW = Math.max(UNIT_FONT_SIZE * 1.4, textLen + anchor.boxPad * 6);
              capBox.setAttribute('x', String(anchor.x - boxW / 2));
              capBox.setAttribute('width', String(boxW));
            }
          }
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
    for (const [, dups] of this.duplicateElements) {
      for (const dup of dups) dup.style.filter = '';
    }
    for (const name of names) {
      const el = this.territoryElements.get(name);
      if (el) el.style.filter = 'brightness(1.3)';
      const dups = this.duplicateElements.get(name);
      if (dups) for (const dup of dups) dup.style.filter = 'brightness(1.3)';
    }
  }
}
