/* env.mjs — the least browser the engine will boot in. Import it FIRST in a test
   file (ESM evaluates imports in order), before anything under engine/.
   content.js and a11y.js are classic scripts, so they are eval'd the way
   prerender.js does it; the DOM is a few inert objects with the methods the
   modules call at load time. Nothing here draws: canvas contexts swallow calls. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// a canvas context that accepts anything and returns itself
const sink = new Proxy(function(){}, {
  get(t, k){ if(k === Symbol.toPrimitive) return () => 0; if(k === 'then') return undefined; return sink; },
  apply(){ return sink; }, set(){ return true; }, construct(){ return sink; }
});

const els = new Map();
export function el(id){
  if(els.has(id)) return els.get(id);
  const kids = new Map(), attrs = new Map(), listeners = new Map();
  const o = {
    id, style:{}, dataset:{}, innerHTML:'', textContent:'', src:'', alt:'', href:'',
    offsetWidth:0, offsetHeight:0, width:0, height:0,
    classList:{ _s:new Set(), add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); }, contains(c){ return this._s.has(c); } },
    setAttribute(k, v){ attrs.set(k, String(v)); }, getAttribute(k){ return attrs.has(k) ? attrs.get(k) : null; },
    addEventListener(t, f){ (listeners.get(t) || listeners.set(t, []).get(t)).push(f); },
    dispatch(t, e = {}){ (listeners.get(t) || []).forEach(f => f(e)); },
    querySelector(sel){ if(!kids.has(sel)) kids.set(sel, el(id + ' ' + sel)); return kids.get(sel); },
    appendChild(){}, focus(){}, blur(){}, contains(){ return false; },
    getContext(){ return sink; }, getBoundingClientRect(){ return { left:0, top:0, width:0, height:0, bottom:0 }; }
  };
  els.set(id, o);
  return o;
}

globalThis.window = globalThis;
globalThis.document = {
  getElementById: el,
  createElement: () => el('anon' + Math.random()),
  createTextNode: () => ({}),
  activeElement: el('body'),
  contains: () => false
};
globalThis.location = { hash:'', pathname:'/', search:'' };
globalThis.history = { replaceState(){ location.hash = ''; } };   // like a browser: replacing the path drops the hash
globalThis.innerWidth = 1280; globalThis.innerHeight = 800; globalThis.devicePixelRatio = 2;
const winListeners = new Map();
globalThis.addEventListener = (t, f) => { (winListeners.get(t) || winListeners.set(t, []).get(t)).push(f); };
export const windowDispatch = (t, e = {}) => (winListeners.get(t) || []).forEach(f => f(e));
globalThis.focus = () => {};
globalThis.matchMedia = undefined;   // so utils.reduced is false
globalThis.requestAnimationFrame = () => {};

(0, eval)(read('content.js').replace('const SITE', 'globalThis.SITE'));
(0, eval)(read('a11y.js'));
