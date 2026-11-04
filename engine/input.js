/* input.js — pointer, touch and keyboard. Live hit-testing against the scene
   (ufo first: it floats above the world), the click ladder (planet → moon →
   card; empty space, esc and the back button all step out one rung, via the
   hash), hold-to-hover on touch (300ms), the comet game's pull-and-release aim,
   the constellation dwell, and the three secret entrances: konami, typing
   "comet", tapping the ufo. */
import { SUN, PLANETS } from './astro.js';
import { state, view, mouse, par, game, toScreen, toWorld } from './state.js';
import { canvas } from './dom.js';
import { reduced } from './utils.js';
import { constItems } from './sky.js';
import { setHover, hideTip, showConstTip, positionConstTip, writeHash, resetHint, moonOpen, aboutOpen } from './ui.js';
import { hitUfo, ufoHover, tapUfo, pointerMoved } from './effects.js';
import { enterGame, exitGame, toggleFree, launchBody } from './game.js';

export function hitTest(sx,sy){
  if(hitUfo(sx,sy)) return ufoHover();   // screen space, so it goes first
  const w = toWorld(sx,sy,par.planet.x,par.planet.y);
  const f = state.focused;
  if(f){
    for(const m of f.moons){
      const rr = Math.max(m.r, 14/view.scale); // generous touch target
      if(Math.hypot(w.x-m.wx, w.y-m.wy) <= rr*1.25) return {type:'moon', obj:m, parent:f};
    }
    const pr = Math.max(f.r, 16/view.scale);
    if(Math.hypot(w.x-f.wx, w.y-f.wy) <= pr) return {type:'planet', obj:f};
    return null;
  }
  let best=null, bestD=Infinity;
  for(const p of PLANETS){
    const rr = Math.max(p.r, 18/view.scale);
    const d = Math.hypot(w.x-p.wx, w.y-p.wy);
    if(d<=rr*1.2 && d<bestD){ best={type:'planet',obj:p}; bestD=d; }
  }
  if(best) return best;
  const ws = toWorld(sx,sy,par.sun.x,par.sun.y); // sun is its own layer
  if(Math.hypot(ws.x, ws.y) <= SUN.r*1.1) return {type:'sun', obj:SUN};
  return null;
}

// a body under/near the cursor wins over the constellation dwell (planets orbit, so
// hoverObj can go stale between pointermoves and a constellation would sneak through)
function nearInteractive(){
  const pad = 26;
  const f = state.focused;
  if(f){
    let s = toScreen(f.wx, f.wy, par.planet.x, par.planet.y);
    if(Math.hypot(mouse.x-s.x, mouse.y-s.y) < f.r*view.scale + pad) return true;
    for(const m of f.moons){
      s = toScreen(m.wx, m.wy, par.planet.x, par.planet.y);
      if(Math.hypot(mouse.x-s.x, mouse.y-s.y) < Math.max(m.r*view.scale, 10) + pad) return true;
    }
    return false;
  }
  for(const p of PLANETS){
    const s = toScreen(p.wx, p.wy, par.planet.x, par.planet.y);
    if(Math.hypot(mouse.x-s.x, mouse.y-s.y) < p.r*view.scale + pad) return true;
  }
  const ss = toScreen(0,0, par.sun.x, par.sun.y);
  return Math.hypot(mouse.x-ss.x, mouse.y-ss.y) < SUN.r*view.scale + pad;
}

// hover-a-constellation-long-enough → list its stars
const CONST_HOVER_R = 70, CONST_DWELL = 0.6;   // px radius, seconds
let constHover = null, constDwell = 0, constShown = false;
export function tickConstellationDwell(dt){
  if(!game.on && mouse.active && !state.hoverObj && !nearInteractive()){
    let best=null, bestD=CONST_HOVER_R;
    for(const item of constItems){
      for(const p of item.pts){
        const d = Math.hypot((p.bx+par.bg.x)-mouse.x, (p.by+par.bg.y)-mouse.y);
        if(d < bestD){ bestD = d; best = item; }
      }
    }
    if(best === constHover){ if(best) constDwell += dt; }
    else { if(constShown){ hideTip(); constShown=false; } constHover = best; constDwell = 0; }
    if(constHover && !constShown && constDwell >= CONST_DWELL){ showConstTip(constHover); constShown = true; }
    if(!constHover && constShown){ hideTip(); constShown = false; }
    if(constShown) positionConstTip(constHover);
  } else {
    if(constShown){ if(!state.hoverObj) hideTip(); constShown = false; }
    constHover = null; constDwell = 0;
  }
}

function handleClick(sx,sy){
  if(hitUfo(sx,sy)){ tapUfo(); return; }   // before everything: it floats above the world,
                                           // and shan't read as a tap on empty space
  const hit = hitTest(sx,sy);
  const f = state.focused;
  if(!hit){
    // tapping empty space backs out one level — same ladder as esc
    if(moonOpen()) writeHash(f?f.slug:'');
    else if(aboutOpen()) writeHash('');
    else if(state.mode==='planet') writeHash('');
    return;
  }
  if(hit.type==='planet' && state.mode==='system'){ writeHash(hit.obj.slug); }
  else if(hit.type==='moon'){ writeHash(hit.parent.slug + '/' + hit.obj.slug); }
  else if(hit.type==='planet' && state.mode==='planet'){ /* already focused */ }
  else if(hit.type==='sun'){ writeHash(state.mode==='planet' ? '' : 'about'); }
}

// pointer / touch handling
let down=null, holdTimer=null, holdActive=false, moved=false;
const HOLD_MS=300, MOVE_TOL=12;

function onMouseMove(x,y){
  mouse.x=x; mouse.y=y; mouse.active=true;   // hover still works under reduced motion
  if(reduced) return;                        // ...but no parallax drift or comet trail
  pointerMoved(x,y);
}

// ↑ ↑ ↓ ↓ ← → ← → b a
const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
let konamiIdx = 0;
let typed = '';   // friendlier secret: just type "comet"

export function installInput(){
  canvas.addEventListener('pointermove', e=>{
    if(game.on){
      if(e.pointerType==='mouse') onMouseMove(e.clientX, e.clientY);
      if(game.aiming && game.aim){ const w=toWorld(e.clientX,e.clientY,par.planet.x,par.planet.y); game.aim.x1=w.x; game.aim.y1=w.y; }
      return;
    }
    if(e.pointerType==='mouse'){
      onMouseMove(e.clientX, e.clientY);
      setHover(hitTest(e.clientX, e.clientY));
      return;
    }
    if(down){
      const dist = Math.hypot(e.clientX-down.x, e.clientY-down.y);
      if(dist>MOVE_TOL){ moved=true; if(holdTimer){clearTimeout(holdTimer);holdTimer=null;} }
    }
    if(holdActive){ setHover(hitTest(e.clientX, e.clientY)); }
  });

  canvas.addEventListener('pointerdown', e=>{
    if(game.on){ const w=toWorld(e.clientX,e.clientY,par.planet.x,par.planet.y);
      const a = game.course ? game.course.start : w;   // course mode has a fixed slingshot
      game.aim={x0:a.x,y0:a.y,x1:w.x,y1:w.y}; game.aiming=true; return; }
    down = {x:e.clientX, y:e.clientY, t:performance.now()};
    state.idleT = 0;
    if(state.nudgeT > 0){ state.nudgeT = 0; resetHint(); }
    moved=false; holdActive=false;
    if(e.pointerType!=='mouse'){
      holdTimer = setTimeout(()=>{
        holdActive=true;
        setHover(hitTest(down.x, down.y)); // hold == hover
      }, HOLD_MS);
    }
  });

  canvas.addEventListener('pointerup', e=>{
    if(game.on){ if(game.aiming) launchBody(); game.aiming=false; game.aim=null; return; }
    if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
    const wasHold = holdActive;
    const small = down && Math.hypot(e.clientX-down.x, e.clientY-down.y) <= MOVE_TOL;
    if(wasHold){
      if(e.pointerType!=='mouse') setHover(null);
    } else if(small && !moved){
      handleClick(e.clientX, e.clientY); // tap / click
    }
    holdActive=false; down=null;
  });
  canvas.addEventListener('pointercancel', ()=>{
    if(game.on){ game.aiming=false; game.aim=null; return; }
    if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}
    holdActive=false; down=null; setHover(null);
  });
  canvas.addEventListener('pointerleave', e=>{
    if(game.on){ game.aiming=false; game.aim=null; if(e.pointerType==='mouse') mouse.active=false; return; }
    if(e.pointerType==='mouse'){ setHover(null); mouse.active=false; }
  });

  window.addEventListener('keydown', e=>{
    if(game.on && (e.key==='f' || e.key==='F')){ toggleFree(); return; }
    if(e.key==='Escape'){
      if(game.on){ exitGame(); return; }
      if(moonOpen()) writeHash(state.focused?state.focused.slug:'');
      else if(aboutOpen()) writeHash('');
      else if(state.mode==='planet') writeHash('');
    }
  });

  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    if(k === KONAMI[konamiIdx]){
      if(++konamiIdx === KONAMI.length){ konamiIdx = 0; game.on ? exitGame() : enterGame(); }
    } else {
      konamiIdx = (k === KONAMI[0]) ? 1 : 0;
    }
  });

  window.addEventListener('keydown', e=>{
    if(e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if(typed === 'comet'){ typed = ''; game.on ? exitGame() : enterGame(); }
  });
}
