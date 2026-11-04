/* state.js — the shared mutable state every other module reads and writes:
   screen size, camera, what is focused / hovered / open, and the comet game.
   Scalars sit on objects because ES module bindings are read-only from the
   importing side; mutating a property of an exported object is fine. */
import { PLANETS } from './astro.js';

export const state = {
  W:0, H:0, DPR:1,
  fitScale:1,              // scale that fits the whole system on screen
  systemExtent:600,        // the orrery's reach in world units
  focusTargetScale:1,      // scale the camera is heading for when a planet is focused
  mode:'system',           // 'system' | 'planet'
  focused:null,
  hoverObj:null,           // {type, obj, parent?} — or {type:'ufo', obj, pos}
  openMoonObj:null,        // the moon whose card is up, so it holds still while u read
  idleT:0, nudgeT:0        // idle timer + how long the ufo nudge stays up
};

export const view   = { scale:1, cx:0, cy:0 };   // where the camera is
export const target = { scale:1, cx:0, cy:0 };   // where it's easing to
export const mouse  = { x:0, y:0, active:false };
export const par = { bg:{x:0,y:0}, sun:{x:0,y:0}, ring:{x:0,y:0}, planet:{x:0,y:0} };   // parallax shift per depth layer

// hidden comet sandbox (konami) — see game.js for the machine, simulation.js for the physics
export const game = {
  on:false, aiming:false, aim:null, firstPull:true,
  bodies:[],               // free-shoot comets
  simAcc:0,                // fixed-step accumulator for the live run
  course:null, comet:null, gateIdx:0, tries:0, runMsg:'', lastHint:'',
  traceT:0,                // 0>1 draws the route, 1>1.4 fades the rings in after
  winT:0,                  // celebration clock, 0 = not celebrating
  pendingNext:false,
  freeShoot:false, savedCourse:null,
  level:0
};

export function computeFit(){
  state.systemExtent = 0;
  PLANETS.forEach(p=>{ const er = p.ring ? p.r*p.ring.outer : p.r; state.systemExtent = Math.max(state.systemExtent, p.a*(1+p.e) + er); });
  state.fitScale = Math.min(state.W,state.H) / (2*(state.systemExtent + 48)) * 0.96;
}
export function planetFocusScale(p){
  let maxMoon = 0;
  p.moons.forEach(m=>{ maxMoon = Math.max(maxMoon, m.dr*(1+m.e) + m.r); });
  return Math.min(state.W,state.H) / (2*(maxMoon + p.r + 36)) * 0.82;
}

/* projection timeeeee */
export function toScreen(wx,wy,ox,oy){
  return { x: state.W/2 + (ox||0) + (wx-view.cx)*view.scale, y: state.H/2 + (oy||0) + (wy-view.cy)*view.scale };
}
export function toWorld(sx,sy,ox,oy){
  return { x: (sx-state.W/2-(ox||0))/view.scale + view.cx, y: (sy-state.H/2-(oy||0))/view.scale + view.cy };
}
