// Static integration test for Prompt 4 changes. Run with:
//   node tools/test_prompt4.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.indexOf('Kursi editor v2 (Prompt 4) loaded');
if (m < 0) { console.error('marker not found'); process.exit(2); }
const startTag = html.lastIndexOf('<script>', m);
const endTag = html.indexOf('</script>', m);
const js = html.slice(startTag + '<script>'.length, endTag);
const patched = js.replace('window.kursiV2={', 'globalThis.kursiV2={');

// Build a node-side shim for browser APIs the IIFE touches at load.
const shim = `
var window = { addEventListener: () => {} };
globalThis.window = window;
var document = {
  getElementById: () => null,
  addEventListener: () => {},
  documentElement: { classList: { contains: () => false } },
  readyState: 'complete',
  body: { classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} } },
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({
    appendChild: () => {}, style: {},
    getContext: () => ({
      fillRect: () => {}, strokeRect: () => {}, fillText: () => {},
      save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, quadraticCurveTo: () => {}, closePath: () => {},
      fill: () => {}, stroke: () => {}, setTransform: () => {}, clearRect: () => {}
    }),
    toDataURL: () => 'data:image/png;base64,'
  })
};
const _store = {};
var localStorage = {
  data: _store,
  getItem(k){ return _store[k] || null; },
  setItem(k,v){ _store[k] = String(v); },
  removeItem(k){ delete _store[k]; },
  key: i => Object.keys(_store)[i],
  get length(){ return Object.keys(_store).length; }
};
var location = { hash: '', pathname: '/', search: '' };
var history = { replaceState: () => {} };
var ResizeObserver = class { observe(){} disconnect(){} };
var crypto = globalThis.crypto;
var Konva = undefined;
`;

new Function(shim + patched)();
const v2 = globalThis.kursiV2;

const dir = path.join(__dirname, '..', 'templates');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

let allClean = true;
for (const t of manifest) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, t.file), 'utf8'));
  let errs = v2.validateLayout(data);
  if (errs.length) { console.log('✗', t.file, 'pre-regen:', errs.slice(0,2)); allClean = false; continue; }
  v2.regenLayoutIds(data);
  errs = v2.validateLayout(data);
  if (errs.length) { console.log('✗', t.file, 'post-regen:', errs.slice(0,2)); allClean = false; continue; }
  // Round-trip via JSON.stringify
  const restored = JSON.parse(JSON.stringify(data));
  errs = v2.validateLayout(restored);
  if (errs.length) { console.log('✗', t.file, 'round-trip:', errs.slice(0,2)); allClean = false; continue; }
  console.log('✓', t.file, '(regen + round-trip OK,', t.seats, 'seats,', t.sections, 'sections)');
}
console.log(allClean ? '\nAll templates pass regen + round-trip.' : '\nSome templates failed.');

// Quick check that the manifest covers exactly the JSON files in /templates/
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'manifest.json').sort();
const manifestFiles = manifest.map(t => t.file).sort();
console.log('\nFiles match manifest?', JSON.stringify(files) === JSON.stringify(manifestFiles));

process.exit(allClean ? 0 : 1);
