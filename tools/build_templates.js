#!/usr/bin/env node
// Generates the seven starter-template JSON files and templates/manifest.json.
// Runtime is plain Node (no deps). Re-run after editing geometry to refresh files.
//
//   node tools/build_templates.js
//
// Each emitted file is a layout document conforming to docs/schemas/layout-v2.md.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '2.0.0';
const SEAT_SIZE_CU = 14;
const PX_PER_M = 50;
const NOW = '2026-05-08T12:00:00Z';

function uuid() { return crypto.randomUUID(); }
function alpha(n) { let s=''; while(n>0){n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26);} return s; }

function makeLayout({ name, type, width_m, depth_m }) {
  const layerStage   = uuid();
  const layerSeating = uuid();
  const layerAisles  = uuid();
  const layerLabels  = uuid();
  return {
    schema_version: SCHEMA_VERSION,
    venue: {
      id: uuid(), name, type,
      dimensions: { width_m, depth_m },
      owner_id: '00000000-0000-4000-8000-000000000001',
      created_at: NOW, updated_at: NOW
    },
    sections: [], seats: [], categories: [], objects: [],
    layers: [
      { id: layerStage,   name: 'stage',   visible: true, locked: false, z_order: 0  },
      { id: layerSeating, name: 'seating', visible: true, locked: false, z_order: 10 },
      { id: layerAisles,  name: 'aisles',  visible: true, locked: false, z_order: 20 },
      { id: layerLabels,  name: 'labels',  visible: true, locked: false, z_order: 30 }
    ],
    _layerIds: { stage: layerStage, seating: layerSeating, aisles: layerAisles, labels: layerLabels }
  };
}

function category(name, color, price) { return { id: uuid(), name, color, default_price: price }; }
function section(name, label, x, y, w, h) {
  return { id: uuid(), name, label, origin: { x, y }, bounds: { width: w, height: h }, rotation_deg: 0 };
}
function seat({ section_id, x, y, row, number, category_id }) {
  return {
    id: uuid(), section_id,
    x: x - SEAT_SIZE_CU / 2, y: y - SEAT_SIZE_CU / 2,
    row: String(row || ''), number: String(number || ''),
    category_id, price_override: null,
    accessibility: { wheelchair: false, companion: false },
    seat_type: 'standard', status: 'available', notes: ''
  };
}
function obj({ type, x, y, width, height, label, layer_id, section_id }) {
  return {
    id: uuid(), type, section_id: section_id || null,
    x, y, width, height, rotation_deg: 0,
    label: label || '', z_index: 0, layer_id
  };
}

// ───────────────────────────── Templates ─────────────────────────────

function classicTheater() {
  const L = makeLayout({ name: 'Classic Theater', type: 'theater', width_m: 30, depth_m: 22 });
  L._description = '200 seats, ten raked rows split by a center aisle. Left and right orchestra are separate sections; front rows are VIP.';
  const leftSec  = section('orchestra_left',  'Left Orchestra',  0, 0, 14 * PX_PER_M, 22 * PX_PER_M);
  const rightSec = section('orchestra_right', 'Right Orchestra', 16 * PX_PER_M, 0, 14 * PX_PER_M, 22 * PX_PER_M);
  L.sections.push(leftSec, rightSec);
  const cats = [
    category('Bronze', '#d97706', 15),
    category('Silver', '#94a3b8', 25),
    category('Gold',   '#f59e0b', 40),
    category('VIP',    '#f472b6', 80)
  ];
  L.categories.push(...cats);
  L.objects.push(obj({ type:'stage', x: 6 * PX_PER_M, y: 1 * PX_PER_M, width: 18 * PX_PER_M, height: 1 * PX_PER_M, label:'STAGE', layer_id: L._layerIds.stage }));
  const rowSpacing = 1.6 * PX_PER_M;
  const seatSpacing = 1.0 * PX_PER_M;
  const aisleGap = 1.4 * PX_PER_M;
  const startY = 4 * PX_PER_M;
  const rows = 10;
  const halfCols = 10;
  const halfWidth = halfCols * seatSpacing;
  const totalWidth = halfWidth * 2 + aisleGap;
  const startX = (30 * PX_PER_M - totalWidth) / 2;
  function catFor(r) {
    if (r < 2) return cats[3].id;
    if (r < 5) return cats[2].id;
    if (r < 8) return cats[1].id;
    return cats[0].id;
  }
  for (let r = 0; r < rows; r++) {
    const rowLabel = alpha(r + 1);
    const c = catFor(r);
    const y = startY + r * rowSpacing;
    for (let i = 0; i < halfCols; i++) {
      const xLeft  = startX + i * seatSpacing + seatSpacing / 2;
      const xRight = startX + halfWidth + aisleGap + i * seatSpacing + seatSpacing / 2;
      L.seats.push(seat({ section_id: leftSec.id,  x: xLeft,  y, row: rowLabel, number: String(halfCols - i),     category_id: c }));
      L.seats.push(seat({ section_id: rightSec.id, x: xRight, y, row: rowLabel, number: String(halfCols + i + 1), category_id: c }));
    }
  }
  return L;
}

function cinema() {
  const L = makeLayout({ name: 'Cinema', type: 'cinema', width_m: 24, depth_m: 18 });
  L._description = '180 seats with a slight curve and two side aisles, screen at the front.';
  const sec = section('auditorium', 'Auditorium', 0, 0, 24 * PX_PER_M, 18 * PX_PER_M);
  L.sections.push(sec);
  const cats = [
    category('Standard', '#7dd3fc', 12),
    category('Premium',  '#a78bfa', 18),
    category('VIP',      '#f472b6', 25)
  ];
  L.categories.push(...cats);
  L.objects.push(obj({ type:'screen', x: 4 * PX_PER_M, y: 0.6 * PX_PER_M, width: 16 * PX_PER_M, height: 0.8 * PX_PER_M, label:'SCREEN', layer_id: L._layerIds.stage }));
  // 10 rows × 18 seats with slight bowed curve (concave toward stage)
  const rows = 10;
  const cols = 18; // 3 + 12 + 3
  const rowSpacing = 1.5 * PX_PER_M;
  const seatSpacing = 0.95 * PX_PER_M;
  const aisleGap = 0.6 * PX_PER_M;
  const startY = 3 * PX_PER_M;
  // Layout: 3 left | aisle | 12 middle | aisle | 3 right
  const lefts = 3, mids = 12, rights = 3;
  const totalW = (lefts + mids + rights) * seatSpacing + 2 * aisleGap;
  const startX = (24 * PX_PER_M - totalW) / 2;
  function catFor(r) {
    if (r < 2) return cats[2].id;
    if (r < 7) return cats[1].id;
    return cats[0].id;
  }
  for (let r = 0; r < rows; r++) {
    const rowLabel = alpha(r + 1);
    const cId = catFor(r);
    const yBase = startY + r * rowSpacing;
    let n = 1;
    function place(group, count, baseX) {
      for (let i = 0; i < count; i++) {
        const x = baseX + i * seatSpacing + seatSpacing / 2;
        // bow: row depth scales with how far x is from center (stronger curve in back rows)
        const center = 12 * PX_PER_M;
        const d = (x - center) / (12 * PX_PER_M);
        const bow = Math.abs(d) * 8 * (r / (rows - 1) * 0.6 + 0.4);
        L.seats.push(seat({ section_id: sec.id, x, y: yBase + bow, row: rowLabel, number: String(n++), category_id: cId }));
      }
    }
    place('left',  lefts, startX);
    place('mid',   mids,  startX + lefts * seatSpacing + aisleGap);
    place('right', rights,startX + (lefts + mids) * seatSpacing + 2 * aisleGap);
  }
  return L;
}

function stadiumCurved() {
  const L = makeLayout({ name: 'Stadium Curved', type: 'stadium', width_m: 220, depth_m: 180 });
  L._description = 'About 8,000 seats across four curved tiers around the pitch. One terrace category.';
  const cats = [ category('Terrace', '#7dd3fc', 8) ];
  L.categories.push(...cats);
  // Pitch in the centre
  const cx = 110 * PX_PER_M, cy = 90 * PX_PER_M;
  L.objects.push(obj({ type:'pitch', x: cx - 40 * PX_PER_M, y: cy - 25 * PX_PER_M, width: 80 * PX_PER_M, height: 50 * PX_PER_M, label:'PITCH', layer_id: L._layerIds.stage }));
  // Four sections (N, E, S, W). Each spans a quadrant arc.
  // Each section: 20 rows × 100 seats over 90 degrees → 2,000 seats × 4 = 8,000 seats.
  const sectionsDef = [
    { name: 'north',  label: 'North',  midDeg: 270 },  // top of canvas
    { name: 'east',   label: 'East',   midDeg: 0   },  // right
    { name: 'south',  label: 'South',  midDeg: 90  },
    { name: 'west',   label: 'West',   midDeg: 180 }
  ];
  const innerR = 50 * PX_PER_M;
  const rowDR = 1.4 * PX_PER_M;
  const tierRows = 20;
  const seatsPerRow = 100;
  const sweepDeg = 90;
  sectionsDef.forEach(sd => {
    const sec = section(sd.name, sd.label, 0, 0, 220 * PX_PER_M, 180 * PX_PER_M);
    L.sections.push(sec);
    for (let r = 0; r < tierRows; r++) {
      const radius = innerR + r * rowDR;
      const rowLabel = alpha(r + 1);
      for (let i = 0; i < seatsPerRow; i++) {
        const t = i / (seatsPerRow - 1);
        const angDeg = sd.midDeg - sweepDeg / 2 + t * sweepDeg;
        const ang = angDeg * Math.PI / 180;
        const x = cx + radius * Math.cos(ang);
        const y = cy + radius * Math.sin(ang);
        L.seats.push(seat({ section_id: sec.id, x, y, row: rowLabel, number: String(i + 1), category_id: cats[0].id }));
      }
    }
  });
  return L;
}

function operaHall() {
  const L = makeLayout({ name: 'Opera Hall', type: 'opera', width_m: 36, depth_m: 32 });
  L._description = 'Multi-tier opera hall: orchestra, mezzanine, balcony, and side boxes.';
  const cats = [
    category('Orchestra', '#f472b6', 90),
    category('Mezzanine', '#f59e0b', 70),
    category('Balcony',   '#94a3b8', 45),
    category('Box',       '#a78bfa', 120)
  ];
  L.categories.push(...cats);
  L.objects.push(obj({ type:'stage', x: 8 * PX_PER_M, y: 1 * PX_PER_M, width: 20 * PX_PER_M, height: 1.5 * PX_PER_M, label:'STAGE', layer_id: L._layerIds.stage }));
  // Orchestra: 8 rows × 20 cols
  const orch = section('orchestra', 'Orchestra', 0, 0, 36 * PX_PER_M, 14 * PX_PER_M);
  L.sections.push(orch);
  {
    const rows = 8, cols = 20;
    const rs = 1.4 * PX_PER_M, cs = 0.9 * PX_PER_M;
    const w = cols * cs;
    const x0 = (36 * PX_PER_M - w) / 2;
    const y0 = 4 * PX_PER_M;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * cs + cs/2, y = y0 + r * rs;
      L.seats.push(seat({ section_id: orch.id, x, y, row: alpha(r+1), number: String(c+1), category_id: cats[0].id }));
    }
  }
  // Mezzanine: 6 rows × 18 cols
  const mez = section('mezzanine', 'Mezzanine', 0, 14 * PX_PER_M, 36 * PX_PER_M, 9 * PX_PER_M);
  L.sections.push(mez);
  {
    const rows = 6, cols = 18;
    const rs = 1.3 * PX_PER_M, cs = 0.95 * PX_PER_M;
    const w = cols * cs;
    const x0 = (36 * PX_PER_M - w) / 2;
    const y0 = 14.5 * PX_PER_M;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * cs + cs/2, y = y0 + r * rs;
      L.seats.push(seat({ section_id: mez.id, x, y, row: alpha(r+1), number: String(c+1), category_id: cats[1].id }));
    }
  }
  // Balcony: 5 rows × 20 cols
  const bal = section('balcony', 'Balcony', 0, 23 * PX_PER_M, 36 * PX_PER_M, 8 * PX_PER_M);
  L.sections.push(bal);
  {
    const rows = 5, cols = 20;
    const rs = 1.3 * PX_PER_M, cs = 0.85 * PX_PER_M;
    const w = cols * cs;
    const x0 = (36 * PX_PER_M - w) / 2;
    const y0 = 24 * PX_PER_M;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * cs + cs/2, y = y0 + r * rs;
      L.seats.push(seat({ section_id: bal.id, x, y, row: alpha(r+1), number: String(c+1), category_id: cats[2].id }));
    }
  }
  // Side boxes: 8 boxes × 4 seats. Four on each side (left/right) of mezzanine.
  const boxes = section('boxes', 'Side Boxes', 0, 0, 36 * PX_PER_M, 32 * PX_PER_M);
  L.sections.push(boxes);
  {
    const seatsPerBox = 4;
    const boxRowSpacing = 1.7 * PX_PER_M;
    const startY = 4 * PX_PER_M;
    for (let bi = 0; bi < 4; bi++) {
      const yTop = startY + bi * boxRowSpacing * 2;
      // left side
      for (let s = 0; s < seatsPerBox; s++) {
        const x = 1.5 * PX_PER_M + (s % 2) * 0.9 * PX_PER_M;
        const y = yTop + Math.floor(s/2) * 0.9 * PX_PER_M;
        L.seats.push(seat({ section_id: boxes.id, x, y, row: 'L'+(bi+1), number: String(s+1), category_id: cats[3].id }));
      }
      // right side
      for (let s = 0; s < seatsPerBox; s++) {
        const x = 33 * PX_PER_M + (s % 2) * 0.9 * PX_PER_M;
        const y = yTop + Math.floor(s/2) * 0.9 * PX_PER_M;
        L.seats.push(seat({ section_id: boxes.id, x, y, row: 'R'+(bi+1), number: String(s+1), category_id: cats[3].id }));
      }
    }
  }
  return L;
}

function circleHall() {
  const L = makeLayout({ name: 'Circle Hall', type: 'circle', width_m: 24, depth_m: 24 });
  L._description = '300 seats in a five-ring full circle around a central stage.';
  const cats = [
    category('Inner', '#f472b6', 60),
    category('Mid',   '#f59e0b', 35),
    category('Outer', '#94a3b8', 20)
  ];
  L.categories.push(...cats);
  const cx = 12 * PX_PER_M, cy = 12 * PX_PER_M;
  L.objects.push(obj({ type:'stage', x: cx - 1.5 * PX_PER_M, y: cy - 1.5 * PX_PER_M, width: 3 * PX_PER_M, height: 3 * PX_PER_M, label:'STAGE', layer_id: L._layerIds.stage }));
  const sec = section('ring', 'Ring', 0, 0, 24 * PX_PER_M, 24 * PX_PER_M);
  L.sections.push(sec);
  const rings = 5, perRing = 60;
  const innerR = 3 * PX_PER_M;
  const dR = 0.8 * PX_PER_M;
  for (let r = 0; r < rings; r++) {
    const radius = innerR + r * dR + 0.4 * PX_PER_M;
    const cId = r < 2 ? cats[0].id : (r < 4 ? cats[1].id : cats[2].id);
    const rowLabel = alpha(r + 1);
    for (let i = 0; i < perRing; i++) {
      const ang = (i / perRing) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(ang);
      const y = cy + radius * Math.sin(ang);
      L.seats.push(seat({ section_id: sec.id, x, y, row: rowLabel, number: String(i + 1), category_id: cId }));
    }
  }
  return L;
}

function conferenceHall() {
  const L = makeLayout({ name: 'Conference Hall', type: 'conference', width_m: 22, depth_m: 18 });
  L._description = '150 classroom-style seats facing a stage, ten rows of fifteen.';
  const cats = [ category('General', '#94a3b8', 0) ];
  L.categories.push(...cats);
  const sec = section('main', 'Main Hall', 0, 0, 22 * PX_PER_M, 18 * PX_PER_M);
  L.sections.push(sec);
  L.objects.push(obj({ type:'stage', x: 5 * PX_PER_M, y: 0.8 * PX_PER_M, width: 12 * PX_PER_M, height: 1 * PX_PER_M, label:'STAGE', layer_id: L._layerIds.stage }));
  const rows = 10, cols = 15;
  const rs = 1.4 * PX_PER_M, cs = 1 * PX_PER_M;
  const w = cols * cs;
  const x0 = (22 * PX_PER_M - w) / 2;
  const y0 = 3 * PX_PER_M;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    L.seats.push(seat({ section_id: sec.id, x: x0 + c * cs + cs/2, y: y0 + r * rs, row: alpha(r+1), number: String(c+1), category_id: cats[0].id }));
  }
  return L;
}

function talkShowStudio() {
  const L = makeLayout({ name: 'Talk Show Studio', type: 'talk_show', width_m: 18, depth_m: 16 });
  L._description = '80 seats wrapping three-quarters around a central host area.';
  const cats = [
    category('Front',  '#f59e0b', 40),
    category('Back',   '#94a3b8', 20)
  ];
  L.categories.push(...cats);
  const cx = 9 * PX_PER_M, cy = 9 * PX_PER_M;
  L.objects.push(obj({ type:'stage', x: cx - 2 * PX_PER_M, y: cy - 1.5 * PX_PER_M, width: 4 * PX_PER_M, height: 3 * PX_PER_M, label:'HOST', layer_id: L._layerIds.stage }));
  const sec = section('audience', 'Audience', 0, 0, 18 * PX_PER_M, 16 * PX_PER_M);
  L.sections.push(sec);
  // Wrap 270° (from -135° to +135° around the host, leaving the stage entrance behind)
  const startDeg = -135, sweepDeg = 270;
  const rows = 4;
  const seatsPerRow = 20;
  const innerR = 3 * PX_PER_M;
  const dR = 1 * PX_PER_M;
  for (let r = 0; r < rows; r++) {
    const radius = innerR + r * dR;
    const rowLabel = alpha(r + 1);
    const cId = r < 2 ? cats[0].id : cats[1].id;
    for (let i = 0; i < seatsPerRow; i++) {
      const t = i / (seatsPerRow - 1);
      const ang = (startDeg + t * sweepDeg) * Math.PI / 180;
      const x = cx + radius * Math.cos(ang);
      const y = cy + radius * Math.sin(ang);
      L.seats.push(seat({ section_id: sec.id, x, y, row: rowLabel, number: String(i + 1), category_id: cId }));
    }
  }
  return L;
}

// ───────────────────────────── Driver ─────────────────────────────

const builders = [
  ['classic_theater',    classicTheater],
  ['cinema',             cinema],
  ['stadium_curved',     stadiumCurved],
  ['opera_hall',         operaHall],
  ['circle_hall',        circleHall],
  ['conference_hall',    conferenceHall],
  ['talk_show_studio',   talkShowStudio]
];

const outDir = path.join(__dirname, '..', 'templates');
fs.mkdirSync(outDir, { recursive: true });

const manifest = [];
for (const [slug, fn] of builders) {
  const layout = fn();
  const description = layout._description || '';
  delete layout._description;
  delete layout._layerIds;
  const filename = slug + '.json';
  fs.writeFileSync(path.join(outDir, filename), JSON.stringify(layout, null, 2));
  manifest.push({
    slug,
    name: layout.venue.name,
    type: layout.venue.type,
    description,
    sections: layout.sections.length,
    seats: layout.seats.length,
    file: filename
  });
  console.log(`✓ ${filename} — ${layout.seats.length} seats / ${layout.sections.length} sections`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n→ Wrote ${manifest.length} templates and manifest.json to /templates/`);
