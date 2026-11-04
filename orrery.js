/* orrery.js — the engine, as an ES module (so it can be split into engine/ modules
   step by step). Reads the SITE object from content.js; content should be changed there. */
import { hexRgb, rgba, lighten, darken, mix, rng, reduced } from './engine/utils.js';
import { CONTENT, SUN, PLANETS, CONSTELLATIONS, CONST_INFO } from './engine/astro.js';
import { state, view, target, mouse, par, game, computeFit, planetFocusScale, toScreen, toWorld } from './engine/state.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const tipEl = document.getElementById('tip');
const tipName = tipEl.querySelector('.t-name');
const tipDesc = tipEl.querySelector('.t-desc');
const moonPanel = document.getElementById('moonPanel');
const mDomain = moonPanel.querySelector('.m-domain');
const mTitle = moonPanel.querySelector('.m-title');
const mBody = moonPanel.querySelector('.m-body');
const mLinks = moonPanel.querySelector('.m-links');
const aboutPanel = document.getElementById('aboutPanel');
const backBtn = document.getElementById('backBtn');
const hintEl = document.getElementById('hint');
const hintDefault = hintEl.innerHTML;

const SHADOW = {r:34, g:28, b:25};

const bgCanvas = document.createElement('canvas');
const bgctx = bgCanvas.getContext('2d');

const scatter = [];
for(let i=0;i<320;i++){
  scatter.push({ fx:Math.random(), fy:Math.random(), r:0.3+Math.random()*0.9, a:0.04+Math.random()*0.13 });
}

function buildBackground(){
  if(!state.W || !state.H) return;
  bgCanvas.width = state.W*state.DPR; bgCanvas.height = state.H*state.DPR;
  bgctx.setTransform(state.DPR,0,0,state.DPR,0,0);

  // darrrrk desaturated blue night sky
  const g = bgctx.createRadialGradient(state.W*0.5, state.H*0.42, 0, state.W*0.5, state.H*0.5, Math.max(state.W,state.H)*0.85);
  g.addColorStop(0,    '#0d1626');
  g.addColorStop(0.55, '#0a101e');
  g.addColorStop(1,    '#05080f');
  bgctx.fillStyle = g; bgctx.fillRect(0,0,state.W,state.H);

  scatter.forEach(s=>{
    bgctx.beginPath();
    bgctx.arc(s.fx*state.W, s.fy*state.H, s.r, 0, Math.PI*2);
    bgctx.fillStyle = 'rgba(205,214,230,'+s.a+')';
    bgctx.fill();
  });
}

let constPlaced = false;
function constLocalRadius(c){    // half-size as a fraction of minDim
  let m=0;
  for(const s of c.stars){ const dx=s[0]-0.5, dy=s[1]-0.5; m=Math.max(m, Math.hypot(dx,dy)); }
  return m * c.scale;
}
function placeConstellations(){
  const minDim = Math.min(state.W,state.H), pad = 10;
  const cx = state.W/2, cy = state.H/2;
  const keepOut = state.systemExtent*state.fitScale + 14;   // the orrery's reach on screen — stay off it
  const order = CONSTELLATIONS.map(c=>({ c, r: constLocalRadius(c)*minDim }))
                              .sort((a,b)=> b.r - a.r);   // biggest first
  const done = [];
  for(const it of order){
    const r = it.r;
    const minX=r+pad, maxX=Math.max(r+pad, state.W-r-pad);
    const minY=r+pad, maxY=Math.max(r+pad, state.H-r-pad);
    let bx=0, by=0, ok=false;
    for(let a=0;a<1200;a++){
      const x = minX + Math.random()*(maxX-minX);
      const y = minY + Math.random()*(maxY-minY);
      if(Math.hypot(x-cx, y-cy) < keepOut + r) continue;   // would sit over the orrery
      let good = true;
      for(const p of done){ if(Math.hypot(x-p.x,y-p.y) < r+p.r+pad){ good=false; break; } }
      if(good){ bx=x; by=y; ok=true; break; }
    }
    it.c.placed = ok;   // no room out here? leave it out of the sky entirely
    if(ok){ done.push({ x:bx, y:by, r }); it.c.ax = bx/state.W; it.c.ay = by/state.H; }
  }
  constPlaced = true;
}

function buildConstellations(){
  if(!constPlaced) placeConstellations();
  constItems = [];
  const minDim = Math.min(state.W,state.H);
  CONSTELLATIONS.forEach((c,i)=>{
    if(!c.placed) return;
    const size = c.scale*minDim, ax = c.ax*state.W, ay = c.ay*state.H;
    const cos = Math.cos(c.rot||0), sin = Math.sin(c.rot||0);
    const pts = c.stars.map(([lx,ly])=>{
      const dx = lx-0.5, dy = ly-0.5;
      return { bx: ax + (dx*cos - dy*sin)*size, by: ay + (dx*sin + dy*cos)*size, op: 0.16 };
    });
    const info = CONST_INFO[i] || {};
    constItems.push({ pts, edges: c.edges, name: info.name || '', starNames: info.stars || [] });
  });
}

function resize(){
  state.DPR = Math.min(window.devicePixelRatio||1, 2);
  state.W = window.innerWidth; state.H = window.innerHeight;
  canvas.width = state.W*state.DPR; canvas.height = state.H*state.DPR;
  canvas.style.width = state.W+'px'; canvas.style.height = state.H+'px';
  cometCanvas.width = state.W*state.DPR; cometCanvas.height = state.H*state.DPR;
  cometCanvas.style.width = state.W+'px'; cometCanvas.style.height = state.H+'px';
  computeFit();
  buildBackground();
  buildConstellations();
  if(game.on && game.course){ target.scale=courseScale(); target.cx=0; target.cy=0; }
  else if(state.mode==='system'){ target.scale=state.fitScale; target.cx=0; target.cy=0; }
  else if(state.focused){ target.scale = planetFocusScale(state.focused); }
}
window.addEventListener('resize', resize);

let lastT = performance.now();

let pmx=0, pmy=0, pmtx=0, pmty=0;                  // smoothed + target, [-1,1]
const PX_BG=2, PX_SUN=3, PX_RING=4, PX_PLANET=6;  // max shift per depth layer
let constItems = [];
const trail = [];             // {x,y,life}
const cometCanvas = document.getElementById('comet');
const cctx = cometCanvas.getContext('2d');

let meteor = null, nextMeteorIn = 12 + Math.random()*22;   // ambient shooting stars

// slower than meteor bc u gotta catch it (gotta catch em all?
// tap it 50/50 sandbox or ZOOMM AWAY
let ufo = null, nextUfoIn = 20 + Math.random()*25;
const UFO_TIP = { name:'ufo', desc:'tap it' };   // shown on hover/hold so it reads as tappable
const UFO_HIT = 30;   // fat tap radius, it's tiny and moving

// hidden comet sandbox (konami) — tune to taste
const G=1, SUN_MASS=9e5, PLANET_MASS=2600, LAUNCH=0.5;
// SOFT is a softening length of ~16 units. planets are r18-31, so close passes really deflect
const SOFT=260, SIM_H=1/120, SIM_SPEED=5;   // fixed step, run at 5x so a route is ~7-14s
// harder each time: more looping, tighter rings, less of the path predicted for you
const LEVELS = [
  { turn:Math.PI*1.6, spacing:680, gate:58, preview:2200 },
  { turn:Math.PI*2.1, spacing:780, gate:50, preview:1700 },
  { turn:Math.PI*2.6, spacing:880, gate:43, preview:1250 },
  { turn:Math.PI*3.1, spacing:980, gate:36, preview:850  }
];

// hover-a-constellation-long-enough → list its stars
const CONST_HOVER_R = 70, CONST_DWELL = 0.6;   // px radius, seconds
let constHover = null, constDwell = 0, constShown = false;

function applyWorld(offx,offy){
  ctx.setTransform(state.DPR,0,0,state.DPR,0,0);
  ctx.translate(state.W/2+offx, state.H/2+offy);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.cx, -view.cy);
}

// "blown-glass ?" surface: marbled streaks + a glossy sheen, clipped, seeded
function drawGlass(x,y,r,base,alpha,seed){
  const rnd = rng(seed);
  let dx=-x, dy=-y, len=Math.hypot(dx,dy)||1; const nx=dx/len, ny=dy/len;
  ctx.save();
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.clip();
  for(let i=0;i<7;i++){
    const ang = rnd()*Math.PI;
    const rx = r*(0.45+rnd()*0.75), ry = r*(0.12+rnd()*0.38);
    const ox = (rnd()-0.5)*r*0.6, oy = (rnd()-0.5)*r*0.6;
    ctx.beginPath();
    ctx.ellipse(x+ox, y+oy, rx, ry, ang, 0, Math.PI*2);
    ctx.lineWidth = r*(0.03+rnd()*0.06);
    const tint = (i%2===0) ? lighten(base,0.32) : darken(base,0.34);
    ctx.strokeStyle = rgba(tint, 0.085*alpha);
    ctx.stroke();
  }
  const hx = x + nx*r*0.42, hy = y + ny*r*0.42;
  const sheen = ctx.createRadialGradient(hx,hy, 0, hx,hy, r*0.62);
  sheen.addColorStop(0, 'rgba(255,251,242,'+(0.18*alpha)+')');
  sheen.addColorStop(1, 'rgba(255,251,242,0)');
  ctx.fillStyle = sheen; ctx.fillRect(x-r,y-r,r*2,r*2);
  ctx.restore();
}

function drawBody(x,y,r,base,alpha,opts){
  if(alpha<=0) return;
  // soft colored bloom around the galactic bods
  const gl = ctx.createRadialGradient(x,y, r*0.82, x,y, r*1.95);
  gl.addColorStop(0, rgba(lighten(base,0.22), 0.17*alpha));
  gl.addColorStop(1, rgba(lighten(base,0.22), 0));
  ctx.beginPath(); ctx.arc(x,y, r*1.95, 0, Math.PI*2);
  ctx.fillStyle = gl; ctx.fill();
  // light toward sun (origin)
  let dx = -x, dy = -y, len = Math.hypot(dx,dy)||1;
  const nx = dx/len, ny = dy/len;
  const hlx = x + nx*r*0.5, hly = y + ny*r*0.5;

  const g = ctx.createRadialGradient(hlx,hly, r*0.06, x, y, r*1.18);
  g.addColorStop(0,   rgba(lighten(base,0.52), alpha));
  g.addColorStop(0.42,rgba(base, alpha));
  g.addColorStop(0.82,rgba(darken(base,0.30), alpha));
  g.addColorStop(1,   rgba(mix(darken(base,0.50), SHADOW, 0.15), alpha));
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = g; ctx.fill();

  // terminator shadow, clipped
  ctx.save();
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.clip();
  const shx = x - nx*r*0.55, shy = y - ny*r*0.55;
  const sg = ctx.createRadialGradient(shx,shy, r*0.1, shx,shy, r*1.85);
  sg.addColorStop(0,   rgba(mix(darken(base,0.55), SHADOW, 0.18), 0.45*alpha));
  sg.addColorStop(0.6, rgba(SHADOW, 0));
  ctx.fillStyle = sg; ctx.fillRect(x-r,y-r,r*2,r*2);
  ctx.restore();

  if(opts && opts.pattern==='glass') drawGlass(x,y,r,base,alpha,opts.seed||1);

  // faint rim
  ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
  ctx.lineWidth = Math.max(0.6, 1.1/view.scale);
  ctx.strokeStyle = rgba(darken(base,0.6), 0.45*alpha);
  ctx.stroke();
}

// saturn-style ring (not uranus!!): back half before body, front half after
function drawRingHalf(x,y,r,alpha,ring,half){
  alpha *= (ring.alpha!=null ? ring.alpha : 1);
  const ro = r*ring.outer, ri = r*ring.inner, sq = ring.tilt, ang = ring.angle;
  const BIG = ro*3;
  ctx.save();
  ctx.translate(x,y); ctx.rotate(ang);
  ctx.beginPath();
  if(half==='front') ctx.rect(-BIG, 0, BIG*2, BIG);
  else               ctx.rect(-BIG, -BIG, BIG*2, BIG);
  ctx.clip();
  ctx.rotate(-ang); ctx.translate(-x,-y);
  // annulus hehe (even-odd)
  ctx.beginPath();
  ctx.ellipse(x,y, ro, ro*sq, ang, 0, Math.PI*2);
  ctx.ellipse(x,y, ri, ri*sq, ang, 0, Math.PI*2);
  ctx.fillStyle = rgba(ring.color, 0.42*alpha);
  ctx.fill('evenodd');
  // lil bit of edge definition
  ctx.beginPath();
  ctx.ellipse(x,y, ro, ro*sq, ang, 0, Math.PI*2);
  ctx.lineWidth = Math.max(0.5, 1/view.scale);
  ctx.strokeStyle = rgba(darken(ring.color,0.45), 0.28*alpha);
  ctx.stroke();
  ctx.restore();
}
function drawRingedBody(x,y,r,base,alpha,ring,opts){
  drawRingHalf(x,y,r,alpha,ring,'back');
  drawBody(x,y,r,base,alpha,opts);
  drawRingHalf(x,y,r,alpha,ring,'front');
}

function drawSun(){
  const r = SUN.r, base = SUN.color;
  // no halo (i can see ur halooooo)
  const g = ctx.createRadialGradient(-r*0.28, -r*0.28, r*0.05, 0, 0, r*1.12);
  g.addColorStop(0,   rgba(lighten(base,0.55),1));
  g.addColorStop(0.45,rgba(base,1));
  g.addColorStop(0.85,rgba(darken(base,0.32),1));
  g.addColorStop(1,   rgba(darken(base,0.55),1));
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2);
  ctx.lineWidth = Math.max(0.6,1/view.scale);
  ctx.strokeStyle = rgba(darken(base,0.45),0.5);
  ctx.stroke();
}

function drawOrbit(a,b,rot, alpha){
  if(alpha<=0) return;
  ctx.save();
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0,0,a,b,0,0,Math.PI*2);
  ctx.lineWidth = 1.5/view.scale;
  ctx.strokeStyle = 'rgba(180,160,124,'+(0.20*alpha)+')';
  ctx.shadowColor = 'rgba(198,174,130,'+(0.55*alpha)+')';
  ctx.shadowBlur = 7;
  ctx.stroke();
  ctx.shadowBlur = 14;   // second pass blooms the glow
  ctx.strokeStyle = 'rgba(180,160,124,'+(0.10*alpha)+')';
  ctx.stroke();
  ctx.restore();
}

function ellipsePos(a,b,angle,rot){
  const ex = a*Math.cos(angle), ey = b*Math.sin(angle);
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: ex*c - ey*s, y: ex*s + ey*c };
}

function isPlanetPaused(p){
  if(game.on) return true;   // course mode needs a static field or the line is a lie
  if(p===state.focused) return true;
  if(state.hoverObj && state.hoverObj.type==='planet' && state.hoverObj.obj===p) return true;
  return false;
}
function isMoonPaused(m){
  if(game.on) return true;
  if(m === state.openMoonObj) return true;
  return state.hoverObj && state.hoverObj.type==='moon' && state.hoverObj.obj===m;
}

function update(dt){
  PLANETS.forEach(p=>{
    if(!isPlanetPaused(p)) p.angle += p.angSpeed*dt;
    const pos = ellipsePos(p.a,p.b,p.angle,p.rot);
    p.wx = pos.x; p.wy = pos.y;
    p.moons.forEach(m=>{
      if(!isMoonPaused(m)) m.angle += m.angSpeed*dt;
      const mp = ellipsePos(m.dr,m.b,m.angle,m.rot);
      m.wx = p.wx + mp.x; m.wy = p.wy + mp.y;
    });
  });

  if(game.winT > 0){ game.winT += dt; if(game.winT > 3.4){ game.winT = 0; if(game.pendingNext){ game.pendingNext = false; advanceLevel(); } } }
  if(state.focused){ target.cx = state.focused.wx; target.cy = state.focused.wy; }

  // ease camera shit
  const k = reduced ? 1 : (1 - Math.pow(0.0009, dt));   // reduced motion: snap instead of ease
  view.scale += (target.scale - view.scale)*k;
  view.cx    += (target.cx    - view.cx)*k;
  view.cy    += (target.cy    - view.cy)*k;

  if(!mouse.active){ pmtx=0; pmty=0; }
  pmx += (pmtx-pmx)*0.05; pmy += (pmty-pmy)*0.05;
  par.bg.x=pmx*PX_BG;         par.bg.y=pmy*PX_BG;
  par.sun.x=pmx*PX_SUN;       par.sun.y=pmy*PX_SUN;
  par.ring.x=pmx*PX_RING;     par.ring.y=pmy*PX_RING;
  par.planet.x=pmx*PX_PLANET; par.planet.y=pmy*PX_PLANET;

  for(let i=trail.length-1;i>=0;i--){ trail[i].life *= 0.9; if(trail[i].life < 0.03) trail.splice(i,1); }

  if(!reduced){
    if(meteor){
      meteor.x += meteor.vx*dt; meteor.y += meteor.vy*dt; meteor.life -= dt;
      if(meteor.life<=0 || meteor.y>state.H+120 || meteor.x<-120 || meteor.x>state.W+120) meteor = null;
    } else {
      nextMeteorIn -= dt;
      if(nextMeteorIn<=0){ spawnMeteor(); nextMeteorIn = 90 + Math.random()*120; }
    }

    if(ufo){
      ufo.t += dt;
      ufo.x += ufo.vx*dt;
      if(ufo.beam > 0){
        ufo.beam -= dt*1.6;
        if(ufo.beam <= 0){                       // beam done, pay out the coin flip
          const what = ufo.pending;
          if(what === 'game'){ ufo = null; enterGame(); }
          else { ufo.pending = 'gone'; ufo.vx *= 7; }   // spooked, gone
          // stays truthy so hitUfo won't let you chase it down and re-roll the coin
        }
      }
      if(ufo && (ufo.x < -90 || ufo.x > state.W+90)) ufo = null;
    } else if(!game.on){                          // no new arrivals mid-sandbox
      nextUfoIn -= dt;
      if(nextUfoIn<=0){ spawnUfo(); nextUfoIn = 60 + Math.random()*40; }
    }
    if(!ufo && state.hoverObj && state.hoverObj.type==='ufo') setHover(null);

    // nobody finds the sandbox on their own, so nudge lingerers toward the ufo
    if(state.nudgeT > 0){
      state.nudgeT -= dt;
      if(state.nudgeT <= 0) hintEl.innerHTML = hintDefault;
    } else if(!game.on && !state.focused && !moonPanel.classList.contains('show') && !aboutPanel.classList.contains('show')){
      state.idleT += dt;
      if(state.idleT >= 40){ state.idleT = -60; state.nudgeT = 6; hintEl.innerHTML = 'psst &nbsp;&middot;&nbsp; catch the ufo'; }
    }
  }

  if(game.on && game.course){
    if(game.traceT < 1.4) game.traceT = Math.min(1.4, game.traceT + dt/2.4);
    if(game.comet){
      game.simAcc += dt*SIM_SPEED;
      let n = 0;
      while(game.comet && game.simAcc >= SIM_H && n < 24){
        game.simAcc -= SIM_H; n++;
        const g = gravityAt(game.comet.x, game.comet.y);
        game.comet.vx += g.ax*SIM_H; game.comet.vy += g.ay*SIM_H;
        game.comet.x  += game.comet.vx*SIM_H; game.comet.y += game.comet.vy*SIM_H;
        game.comet.trail.push({x:game.comet.x,y:game.comet.y}); if(game.comet.trail.length>140) game.comet.trail.shift();
        const gt = game.course.gates[game.gateIdx];
        if(gt && Math.hypot(game.comet.x-gt.x, game.comet.y-gt.y) < game.course.gateR){ gt.hit = true; game.gateIdx++; }
        if(game.gateIdx >= game.course.gates.length){
          winCourse();
        } else if(hitsBody(game.comet.x, game.comet.y)){ failRun('crashed'); }
        else if(escaped(game.comet.x, game.comet.y, game.comet.vx, game.comet.vy, game.course.outR)){ failRun('lost to space'); }
      }
    } else game.simAcc = 0;
    syncHint();
  } else if(game.on){
    for(let bi=game.bodies.length-1; bi>=0; bi--){
      const bd = game.bodies[bi];
      const g = gravityAt(bd.x, bd.y);
      bd.vx+=g.ax*dt; bd.vy+=g.ay*dt;
      bd.x+=bd.vx*dt; bd.y+=bd.vy*dt;
      bd.trail.push({x:bd.x,y:bd.y}); if(bd.trail.length>36) bd.trail.shift();
      const r2 = bd.x*bd.x + bd.y*bd.y;
      if(r2 < (SUN.r*0.9)*(SUN.r*0.9) || r2 > 4000*4000) game.bodies.splice(bi,1);
    }
    syncHint();
  }

  // dwell on a constellation (when nothing else is hovered) to reveal its stars
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

function render(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#05080f'; ctx.fillRect(0,0,state.W*state.DPR,state.H*state.DPR);
  ctx.drawImage(bgCanvas, par.bg.x*state.DPR, par.bg.y*state.DPR);
  ctx.setTransform(state.DPR,0,0,state.DPR,0,0);

  drawConstellations();
  if(meteor) drawMeteor();

  let prog = 0;
  if(state.focused){
    prog = (view.scale - state.fitScale) / (state.focusTargetScale - state.fitScale);
    prog = Math.max(0, Math.min(1, prog));
  }
  const otherAlpha = state.focused ? (1 - prog*0.92) : 1;

  // this is taking FOREVER wauhgh
  applyWorld(par.ring.x, par.ring.y);
  PLANETS.forEach(p=>{
    const a = (p===state.focused) ? prog*0.5 + (1-prog)*1 : otherAlpha;
    drawOrbit(p.a,p.b,p.rot, a*0.9);
  });
  if(game.winT>0) PLANETS.forEach((p,i)=>{ const w=winRing(i); if(w>0) drawOrbit(p.a,p.b,p.rot,w); });
  if(state.focused && prog>0.02){
    ctx.save();
    ctx.translate(state.focused.wx, state.focused.wy);
    state.focused.moons.forEach(m=>{ drawOrbit(m.dr,m.b,m.rot, prog*0.85); });
    ctx.restore();
  }

  applyWorld(par.sun.x, par.sun.y);
  drawSun();
  if(game.winT>0 && game.winT<2.2){            // the flare going out
    const k = game.winT/2.2, rr = SUN.r*(1 + k*7);
    ctx.strokeStyle = 'rgba(217,152,90,'+(0.5*(1-k))+')'; ctx.lineWidth = 2.5/view.scale;
    ctx.beginPath(); ctx.arc(0,0,rr,0,Math.PI*2); ctx.stroke();
  }

  applyWorld(par.planet.x, par.planet.y);
  PLANETS.forEach(p=>{
    const a = (p===state.focused) ? 1 : otherAlpha;
    const opts = p.pattern ? {pattern:p.pattern, seed:p.seed} : null;
    if(p.ring) drawRingedBody(p.wx,p.wy,p.r,p.color,a,p.ring,opts);
    else drawBody(p.wx,p.wy,p.r,p.color,a,opts);
  });
  if(state.focused && prog>0.02){
    state.focused.moons.forEach(m=>{ drawBody(m.wx,m.wy,m.r,m.color,prog); });
  }
  if(game.on) drawSandbox();

  ctx.setTransform(state.DPR,0,0,state.DPR,0,0);
  drawLabels(prog, otherAlpha);
  if(ufo) drawUfo();   // last: it's a screen-space overlay, and handleClick gives it hit priority

  drawComet();
}

function drawConstellations(){
  const ox = par.bg.x, oy = par.bg.y;
  ctx.lineWidth = 1;
  for(const item of constItems){
    const pts = item.pts;
    for(const p of pts){
      let tgt = 0.16 + winBoost();
      if(mouse.active){
        const d = Math.hypot((p.bx+ox)-mouse.x, (p.by+oy)-mouse.y);
        if(d < 90) tgt = 0.16 + (0.7-0.16)*(1 - d/90);
      }
      p.op += (tgt - p.op)*0.08;
    }
    for(const e of item.edges){
      const a = pts[e[0]], b = pts[e[1]];
      const la = Math.min(a.op, b.op)*0.5;
      ctx.strokeStyle = 'rgba(150,170,205,'+la+')';
      ctx.beginPath(); ctx.moveTo(a.bx+ox,a.by+oy); ctx.lineTo(b.bx+ox,b.by+oy); ctx.stroke();
    }
    for(const p of pts){
      ctx.beginPath(); ctx.arc(p.bx+ox, p.by+oy, 1.2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(214,222,238,'+p.op+')'; ctx.fill();
    }
  }
}

function drawComet(){
  cctx.setTransform(state.DPR,0,0,state.DPR,0,0);
  cctx.clearRect(0,0,state.W,state.H);
  for(const t of trail){
    const rad = Math.max(0.1, 7*t.life);
    const g = cctx.createRadialGradient(t.x,t.y,0, t.x,t.y, rad);
    g.addColorStop(0, 'rgba(255,250,236,'+(0.5*t.life)+')');
    g.addColorStop(1, 'rgba(255,250,236,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(t.x,t.y,rad,0,Math.PI*2); cctx.fill();
  }
}

function spawnMeteor(){
  const dir = Math.random()<0.5 ? 1 : -1;
  const ang = Math.PI*0.18 + Math.random()*Math.PI*0.16;   // below horizontal
  const speed = (state.W+state.H)*0.32;
  meteor = {
    x: state.W*(0.15+Math.random()*0.7), y: state.H*(Math.random()*0.3),
    vx: dir*Math.cos(ang)*speed, vy: Math.sin(ang)*speed,
    life: 1, len: 80+Math.random()*70
  };
}
function drawMeteor(){
  const sp = Math.hypot(meteor.vx,meteor.vy)||1;
  const ux = meteor.vx/sp, uy = meteor.vy/sp;
  const hx = meteor.x, hy = meteor.y, tx = hx-ux*meteor.len, ty = hy-uy*meteor.len;
  const a = Math.max(0, Math.min(1, meteor.life))*0.7;
  const g = ctx.createLinearGradient(hx,hy,tx,ty);
  g.addColorStop(0, 'rgba(255,250,236,'+a+')');
  g.addColorStop(1, 'rgba(255,250,236,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(tx,ty); ctx.stroke();
  ctx.lineCap = 'butt';
}

function spawnUfo(){
  const dir = Math.random()<0.5 ? 1 : -1;
  ufo = {
    x: dir>0 ? -50 : state.W+50,
    y: state.H*(0.12 + Math.random()*0.45),
    vx: dir*(state.W+state.H)*0.035,   // slow enough to actually be tapped
    t: 0,
    beam: 0,               // counts down while the tractor beam is lit
    pending: null          // what to do once the beam finishes: 'game' | 'flee'
  };
}

function hitUfo(sx,sy){
  return !!ufo && !ufo.pending && Math.hypot(sx-ufo.x, sy-ufo.y) <= UFO_HIT;
}

function tapUfo(){
  setHover(null);
  ufo.beam = 1;
  ufo.pending = Math.random()<0.5 ? 'game' : 'flee';   // coin flip, so it stays a surprise
}

function drawUfo(){
  const bob = Math.sin(ufo.t*1.9)*3;
  const x = ufo.x, y = ufo.y + bob;

  if(ufo.beam > 0){
    const a = Math.max(0, Math.min(1, ufo.beam));
    const g = ctx.createLinearGradient(x, y, x, y+120);
    g.addColorStop(0, 'rgba(217,152,90,'+(0.42*a)+')');
    g.addColorStop(1, 'rgba(217,152,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x-6, y+4); ctx.lineTo(x+6, y+4);
    ctx.lineTo(x+30, y+120); ctx.lineTo(x-30, y+120);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = 'rgba(233,228,220,0.30)';            // dome
  ctx.beginPath(); ctx.ellipse(x, y-4, 8, 7, 0, Math.PI, 0); ctx.fill();

  ctx.fillStyle = 'rgba(233,228,220,0.82)';            // saucer
  ctx.beginPath(); ctx.ellipse(x, y, 17, 5.5, 0, 0, Math.PI*2); ctx.fill();

  for(let i=-1; i<=1; i++){                            // running lights
    const lit = 0.45 + 0.55*Math.abs(Math.sin(ufo.t*3 + i));
    ctx.fillStyle = 'rgba(217,152,90,'+lit+')';
    ctx.beginPath(); ctx.arc(x + i*9, y+2.5, 1.5, 0, Math.PI*2); ctx.fill();
  }
}

// one field, used by both the course generator and the live run
function gravityAt(x,y){
  let ax=0, ay=0, dx, dy, d2, inv;
  dx=-x; dy=-y; d2=dx*dx+dy*dy+SOFT; inv=G*SUN_MASS/(d2*Math.sqrt(d2)); ax+=dx*inv; ay+=dy*inv;
  for(const p of PLANETS){ dx=p.wx-x; dy=p.wy-y; d2=dx*dx+dy*dy+SOFT; inv=G*(p.r*PLANET_MASS)/(d2*Math.sqrt(d2)); ax+=dx*inv; ay+=dy*inv; }
  return {ax:ax, ay:ay};
}
// past the boundary and still heading out = gone. no getting dragged back in.
// has to be directional: the slingshot anchor itself sits outside the last planet.
function escaped(x,y,vx,vy,escR){
  return (x*x+y*y) > escR*escR && (x*vx + y*vy) > 0;
}
function hitsBody(x,y){
  if(x*x+y*y < (SUN.r*0.95)*(SUN.r*0.95)) return true;
  for(const p of PLANETS){ const dx=p.wx-x, dy=p.wy-y; if(dx*dx+dy*dy < (p.r*1.15)*(p.r*1.15)) return true; }
  return false;
}
// fly a candidate through the frozen field, null if it dies or wanders off
// fly a candidate through the frozen field, null if it dies or wanders off.
// SIM_H must match the live run exactly or the drawn line can't actually be followed.
function flyPath(x,y,vx,vy,steps,outR,turnTarget){
  const pts=[{x:x,y:y}]; let turned=0, px=x, py=y;
  for(let i=0;i<steps;i++){
    const g=gravityAt(x,y);
    vx+=g.ax*SIM_H; vy+=g.ay*SIM_H; x+=vx*SIM_H; y+=vy*SIM_H;
    if(hitsBody(x,y)) return null;
    if(escaped(x,y,vx,vy,outR)) return null;
    turned += Math.abs(Math.atan2(py*x-px*y, px*x+py*y));
    px=x; py=y; pts.push({x:x,y:y});
    if(turned >= turnTarget) return {pts:pts};
  }
  return null;
}
// the line IS a solved launch, so it can always be followed.
// aim inward: diving through the planets is where the slingshots and the danger are.
function buildCourse(lv){
  const L = LEVELS[Math.min(lv, LEVELS.length-1)];
  let R0=0; for(const p of PLANETS) if(p.a>R0) R0=p.a;
  R0 *= 1.15;
  const start={x:0,y:R0}, outR=R0*1.12, vc=Math.sqrt(G*SUN_MASS/R0);
  const inward = Math.atan2(-start.y, -start.x);
  // second pass drops the turn target: better an easier route than none at all
  for(const turn of [L.turn, L.turn*0.78]){
    for(let k=0;k<2500;k++){
      const sp  = vc*(0.45+Math.random()*1.05);
      const ang = inward + (Math.random()-0.5)*1.5;
      const path = flyPath(start.x,start.y,Math.cos(ang)*sp,Math.sin(ang)*sp,12000,outR,turn);
      if(path){
        const gates=[];
        for(let i=440;i<path.pts.length-80;i+=L.spacing) gates.push({x:path.pts[i].x, y:path.pts[i].y, hit:false});
        if(gates.length>=5){
          let viewR=0; for(const q of path.pts){ const r=Math.hypot(q.x,q.y); if(r>viewR) viewR=r; }
          return {start:start, pts:path.pts, gates:gates, outR:outR, viewR:viewR,
                  gateR:L.gate, preview:L.preview};
        }
      }
    }
  }
  return null;   // never found one, fall back to the free sandbox
}
// angry-birds dots: the live prediction for the current pull, same physics as the real run
function predictPath(vx,vy,steps){
  let x=game.course.start.x, y=game.course.start.y; const out=[];
  for(let i=0;i<steps;i++){
    const g=gravityAt(x,y);
    vx+=g.ax*SIM_H; vy+=g.ay*SIM_H; x+=vx*SIM_H; y+=vy*SIM_H;
    if(hitsBody(x,y) || escaped(x,y,vx,vy,game.course.outR)) break;
    if(i%22===0) out.push({x:x,y:y});
  }
  return out;
}
function courseScale(){ return Math.min(state.W,state.H) / (2*(game.course.viewR + 50)) * 0.96; }
function winCourse(){
  game.comet = null; game.winT = 0.0001; game.pendingNext = true;
  game.level++;
  game.runMsg = (game.level >= LEVELS.length)
    ? 'all four routes flown &nbsp;&middot;&nbsp; that was the hard way'
    : 'route ' + game.level + ' of ' + LEVELS.length + ' &nbsp;&middot;&nbsp; a harder one is coming';
}
// f drops the route and just lets you fling comets, then picks the route back up
function toggleFree(){
  if(!game.on) return;
  game.comet = null; game.bodies.length = 0; game.aim = null; game.aiming = false; game.lastHint = '';
  if(game.freeShoot){
    game.freeShoot = false;
    game.course = game.savedCourse || buildCourse(game.level); game.savedCourse = null;
    if(game.course){ for(const g of game.course.gates) g.hit = false; target.scale = courseScale(); target.cx = 0; target.cy = 0; }
    game.traceT = 1.4; game.gateIdx = 0; game.runMsg = '';   // route already traced, don't redraw it
  } else {
    game.freeShoot = true; game.savedCourse = game.course; game.course = null; game.runMsg = '';
    target.scale = state.fitScale; target.cx = 0; target.cy = 0;
  }
}
function advanceLevel(){
  if(!game.on) return;
  if(game.level >= LEVELS.length){ exitGame(); return; }   // done: back to the orrery, comets and all
  game.course = buildCourse(game.level);
  if(game.course){ target.scale = courseScale(); target.cx = 0; target.cy = 0; }
  game.traceT = 0; game.gateIdx = 0; game.comet = null; game.tries = 0; game.runMsg = ''; game.lastHint = '';
}
// sequenced flare: sun first, then each orbit ring outward
function winRing(i){
  if(game.winT<=0) return 0;
  const t = game.winT - 0.45 - i*0.16;
  if(t<=0 || t>=0.9) return 0;
  return Math.sin(t/0.9*Math.PI)*0.55;
}
function winBoost(){
  if(game.winT<=0) return 0;
  const t = game.winT - 0.3;
  if(t<=0 || t>=1.6) return 0;
  return Math.sin(t/1.6*Math.PI)*0.42;
}
function courseHint(){
  if(game.freeShoot) return 'free shoot &nbsp;&middot;&nbsp; fling as many as u like &nbsp;&middot;&nbsp; f for routes &nbsp;&middot;&nbsp; esc to exit';
  if(!game.course) return 'comet sandbox &nbsp;&middot;&nbsp; pull back &amp; release to launch &nbsp;&middot;&nbsp; esc to exit';
  if(game.runMsg) return game.runMsg;
  return 'route ' + (game.level+1) + '/' + LEVELS.length + ' &nbsp;&middot;&nbsp; ' + game.gateIdx + '/' + game.course.gates.length + ' &nbsp;&middot;&nbsp; tries ' + game.tries + ' &nbsp;&middot;&nbsp; f free shoot &nbsp;&middot;&nbsp; esc';
}
function syncHint(){ const h=courseHint(); if(h!==game.lastHint){ hintEl.innerHTML=h; game.lastHint=h; } }
function resetRun(){ game.gateIdx=0; for(const g of game.course.gates) g.hit=false; }
function failRun(why){ game.comet=null; game.tries++; resetRun(); game.runMsg = why + ' &nbsp;&middot;&nbsp; pull back to try again'; }

// konami unlocks a little gravity sandbox: drag to launch a comet
function enterGame(){
  writeHash(''); game.on = true; game.bodies.length = 0; game.aim = null; game.aiming = false; game.firstPull = true;
  game.comet = null; game.gateIdx = 0; game.tries = 0; game.runMsg = ''; game.lastHint = ''; game.traceT = 0;
  game.level = 0; game.pendingNext = false; game.freeShoot = false; game.savedCourse = null;
  game.course = buildCourse(0);   // planets are frozen by now, so the line stays true all game
  if(game.course){ target.scale = courseScale(); target.cx = 0; target.cy = 0; }   // pull back to show the whole line
  hintEl.innerHTML = courseHint(); game.lastHint = courseHint();
  hintEl.style.opacity = '0.85';
}
function exitGame(){
  game.on = false; game.bodies.length = 0; game.aim = null; game.aiming = false;
  game.course = null; game.comet = null; game.runMsg = ''; game.lastHint = '';
  game.pendingNext = false; game.winT = 0; game.freeShoot = false; game.savedCourse = null;
  target.scale = state.fitScale; target.cx = 0; target.cy = 0;
  hintEl.innerHTML = hintDefault;
  hintEl.style.opacity = (state.mode==='system') ? '0.7' : '0';
}
function launchBody(){
  if(!game.aim) return;
  game.firstPull = false;   // teaching arrow only shows until the first launch
  if(game.course){          // one comet, from the anchor, opposite the pull
    game.comet = { x:game.course.start.x, y:game.course.start.y, vx:(game.aim.x0-game.aim.x1)*LAUNCH, vy:(game.aim.y0-game.aim.y1)*LAUNCH, trail:[] };
    resetRun(); game.runMsg = '';
    return;
  }
  // slingshot: fling opposite the pull-back
  game.bodies.push({ x:game.aim.x0, y:game.aim.y0, vx:(game.aim.x0-game.aim.x1)*LAUNCH, vy:(game.aim.y0-game.aim.y1)*LAUNCH, trail:[] });
  if(game.bodies.length > 40) game.bodies.shift();
}
function drawCourse(){
  const pts = game.course.pts;
  const drawn = Math.max(1, Math.floor(Math.min(game.traceT,1) * (pts.length-1)));

  ctx.setLineDash([7/view.scale, 9/view.scale]);
  ctx.strokeStyle='rgba(217,152,90,0.30)'; ctx.lineWidth=1.7/view.scale;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=3;i<drawn;i+=3) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);

  if(game.traceT < 1){   // the tracer drawing the route
    const h = pts[drawn];
    ctx.beginPath(); ctx.arc(h.x, h.y, 4/view.scale, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,244,224,0.95)'; ctx.fill();
  }

  if(game.aim && game.aiming){   // small circles: where this pull actually goes
    const pv = predictPath((game.aim.x0-game.aim.x1)*LAUNCH, (game.aim.y0-game.aim.y1)*LAUNCH, game.course.preview);
    for(let i=0;i<pv.length;i++){
      ctx.beginPath(); ctx.arc(pv[i].x, pv[i].y, 2.4/view.scale, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,250,238,'+(0.8 - 0.55*(i/Math.max(1,pv.length)))+')'; ctx.fill();
    }
  }

  const gAlpha = Math.max(0, Math.min(1, (game.traceT-1)/0.4));
  for(let i=0;i<game.course.gates.length && gAlpha>0;i++){
    const g = game.course.gates[i];
    ctx.beginPath(); ctx.arc(g.x, g.y, game.course.gateR, 0, Math.PI*2);
    if(g.hit){ ctx.strokeStyle='rgba(217,152,90,'+(0.9*gAlpha)+')';  ctx.lineWidth=2.4/view.scale; }
    else if(i===game.gateIdx){ ctx.strokeStyle='rgba(233,228,220,'+(0.6*gAlpha)+')'; ctx.lineWidth=1.8/view.scale; }
    else { ctx.strokeStyle='rgba(233,228,220,'+(0.22*gAlpha)+')'; ctx.lineWidth=1.1/view.scale; }
    ctx.stroke();
  }

  if(game.comet){
    const t = game.comet.trail;
    for(let i=1;i<t.length;i++){
      ctx.strokeStyle='rgba(255,248,232,'+((i/t.length)*0.6)+')'; ctx.lineWidth=1.5/view.scale;
      ctx.beginPath(); ctx.moveTo(t[i-1].x,t[i-1].y); ctx.lineTo(t[i].x,t[i].y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(game.comet.x, game.comet.y, 3.4/view.scale, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,250,238,0.95)'; ctx.fill();
  }

  ctx.beginPath(); ctx.arc(game.course.start.x, game.course.start.y, 4.5/view.scale, 0, Math.PI*2);
  ctx.fillStyle = game.comet ? 'rgba(255,250,238,0.35)' : 'rgba(255,250,238,0.95)'; ctx.fill();
}

function drawSandbox(){
  if(game.course) drawCourse();
  for(const bd of game.bodies){
    const t = bd.trail;
    for(let i=1;i<t.length;i++){
      ctx.strokeStyle = 'rgba(255,248,232,'+((i/t.length)*0.5)+')';
      ctx.lineWidth = 1.3/view.scale;
      ctx.beginPath(); ctx.moveTo(t[i-1].x,t[i-1].y); ctx.lineTo(t[i].x,t[i].y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(bd.x,bd.y, 3/view.scale, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,250,238,0.95)'; ctx.fill();
  }
  if(game.aim){
    // the pull-back (elastic), dashed
    ctx.setLineDash([6/view.scale, 6/view.scale]);
    ctx.strokeStyle = 'rgba(255,250,236,0.4)'; ctx.lineWidth = 1.2/view.scale;
    ctx.beginPath(); ctx.moveTo(game.aim.x0,game.aim.y0); ctx.lineTo(game.aim.x1,game.aim.y1); ctx.stroke();
    ctx.setLineDash([]);

    // first-pull teaching cue: a small arrow + tag pointing the launch way
    const dx = game.aim.x0-game.aim.x1, dy = game.aim.y0-game.aim.y1, len = Math.hypot(dx,dy);
    if(game.firstPull && len*view.scale > 6){
      const ux=dx/len, uy=dy/len, s=34/view.scale, hw=7/view.scale, px=-uy, py=ux;
      const tx=game.aim.x0+ux*s, ty=game.aim.y0+uy*s;
      ctx.strokeStyle='rgba(255,250,236,0.75)'; ctx.lineWidth=1.4/view.scale;
      ctx.beginPath();
      ctx.moveTo(game.aim.x0,game.aim.y0); ctx.lineTo(tx,ty);
      ctx.moveTo(tx,ty); ctx.lineTo(tx-ux*hw+px*hw*0.6, ty-uy*hw+py*hw*0.6);
      ctx.moveTo(tx,ty); ctx.lineTo(tx-ux*hw-px*hw*0.6, ty-uy*hw-py*hw*0.6);
      ctx.stroke();
      const sp = toScreen(tx,ty,par.planet.x,par.planet.y);
      ctx.save();
      ctx.setTransform(state.DPR,0,0,state.DPR,0,0);
      ctx.font='400 11px "IM Fell English", serif';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(255,250,236,0.7)';
      ctx.fillText('launch', sp.x + 7, sp.y);
      ctx.restore();
    }

    // the comet waiting at the anchor
    ctx.beginPath(); ctx.arc(game.aim.x0,game.aim.y0, 3.2/view.scale, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,250,238,0.95)'; ctx.fill();
  }
}

function drawLabels(prog, otherAlpha){
  ctx.textAlign='center';
  ctx.textBaseline='top';

  {
    const s = toScreen(0,0,par.sun.x,par.sun.y);
    const a = (state.focused ? otherAlpha : 1);
    ctx.font = '15px "IM Fell English", serif';   // matches the #social links
    ctx.letterSpacing = '.4px';
    ctx.fillStyle = rgba(hexRgb('#f6f3ee'), 0.78*a);
    ctx.fillText(SUN.label, s.x, s.y + SUN.r*view.scale + 12);
    ctx.letterSpacing = '0px';                    // canvas state persists, don't leak into planet labels
  }

  // planet name only as the "you are here" heading when focused (hover uses the tooltip)
  PLANETS.forEach(p=>{
    const a = (p===state.focused) ? prog : 0;
    if(a<=0.03) return;
    const s = toScreen(p.wx,p.wy,par.planet.x,par.planet.y);
    ctx.font = '700 ' + Math.round(15 + p.r*0.10) + 'px "IM Fell English", serif';
    ctx.fillStyle = rgba(hexRgb('#f6f3ee'), a);
    ctx.fillText(p.name, s.x, s.y + p.r*view.scale + 10);
  });
}

function frame(now){
  let dt = (now-lastT)/1000; lastT = now;
  if(dt>0.05) dt=0.05; // clamp after tab-switch
  update(dt);
  render();
  if(state.hoverObj) positionTip();
  requestAnimationFrame(frame);
}

function hitTest(sx,sy){
  if(hitUfo(sx,sy)) return {type:'ufo', obj:UFO_TIP};   // screen space, so it goes first
  const w = toWorld(sx,sy,par.planet.x,par.planet.y);
  if(state.focused){
    for(const m of state.focused.moons){
      const rr = Math.max(m.r, 14/view.scale); // generous touch target
      if(Math.hypot(w.x-m.wx, w.y-m.wy) <= rr*1.25) return {type:'moon', obj:m, parent:state.focused};
    }
    const pr = Math.max(state.focused.r, 16/view.scale);
    if(Math.hypot(w.x-state.focused.wx, w.y-state.focused.wy) <= pr) return {type:'planet', obj:state.focused};
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

function showTip(obj){
  const isSun = obj===SUN;   // the sun's name already sits under it permanently
  tipName.textContent = isSun ? '' : (obj.name || obj.label || '');
  tipName.style.display = isSun ? 'none' : '';
  tipDesc.textContent = obj.desc || '';
  tipDesc.style.display = obj.desc ? '' : 'none';
  tipEl.classList.add('show');
}
function hideTip(){ tipEl.classList.remove('show'); }
// a body under/near the cursor wins over the constellation dwell (planets orbit, so
// hoverObj can go stale between pointermoves and a constellation would sneak through)
function nearInteractive(){
  const pad = 26;
  if(state.focused){
    let s = toScreen(state.focused.wx, state.focused.wy, par.planet.x, par.planet.y);
    if(Math.hypot(mouse.x-s.x, mouse.y-s.y) < state.focused.r*view.scale + pad) return true;
    for(const m of state.focused.moons){
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
function showConstTip(item){
  tipName.textContent = item.name;
  tipName.style.display = '';
  tipDesc.textContent = item.starNames.join(' · ');
  tipDesc.style.display = '';
  tipEl.classList.add('show');
  positionConstTip(item);
}
// one #tip so one placer, clamped here so both callers can't drift apart
function placeTip(cx, ty){
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 10;
  tipEl.style.left = Math.max(m + w/2, Math.min(state.W - m - w/2, cx)) + 'px';
  tipEl.style.top  = Math.max(m + h,   Math.min(state.H - m,       ty)) + 'px';
}
function positionConstTip(item){
  let minY=Infinity, sumX=0;
  for(const p of item.pts){ sumX += p.bx; if(p.by<minY) minY=p.by; }
  placeTip(sumX/item.pts.length + par.bg.x, minY + par.bg.y - 12);
}
function positionTip(){
  if(!state.hoverObj) return;
  const o = state.hoverObj.obj;
  let wx,wy,r,off;
  if(state.hoverObj.type==='ufo'){ if(ufo) placeTip(ufo.x, ufo.y - 16); return; }
  if(state.hoverObj.type==='sun'){ wx=0;wy=0;r=SUN.r; off=par.sun; }
  else { wx=o.wx; wy=o.wy; r=o.r; off=par.planet; }
  const s = toScreen(wx,wy,off.x,off.y);
  placeTip(s.x, s.y - r*view.scale - 14);
}

function setHover(obj){
  if(obj===state.hoverObj || (obj && state.hoverObj && obj.obj===state.hoverObj.obj)) {
    state.hoverObj = obj; return;
  }
  state.hoverObj = obj;
  if(obj){
    canvas.style.cursor = 'pointer';
    showTip(obj.type==='sun'?SUN:obj.obj);
    positionTip();
  } else {
    canvas.style.cursor = 'default';
    hideTip();
  }
}

function focusPlanet(p){
  state.mode='planet'; state.focused=p;
  closeMoon();
  state.focusTargetScale = planetFocusScale(p);
  target.scale = state.focusTargetScale;
  target.cx = p.wx; target.cy = p.wy;
  backBtn.classList.add('show');
  hintEl.style.opacity = '0';
  setHover(null);
}
function pullBack(){
  state.mode='system'; state.focused=null;
  target.scale = state.fitScale; target.cx=0; target.cy=0;
  backBtn.classList.remove('show');
  closeMoon();
  hintEl.style.opacity = '0.7';
  setHover(null);
}

// panels are real dialogs: named, focus moves in, focus comes back out.
// deliberately NOT aria-modal, because the canvas behind stays live to a mouse
// and claiming modality the app doesn't enforce would be a lie to AT.
let lastFocus = null;
function panelOpened(el){
  if(el.getAttribute('aria-hidden') === 'false') return;   // already open, don't re-steal focus
  lastFocus = document.activeElement;
  el.setAttribute('aria-hidden','false');
  try { el.focus({preventScroll:true}); } catch(_){ el.focus(); }
}
function panelClosed(el){
  if(el.getAttribute('aria-hidden') === 'true') return;
  const had = el.contains(document.activeElement) || document.activeElement === el;
  el.setAttribute('aria-hidden','true');
  if(had){
    if(lastFocus && document.contains(lastFocus)) { try { lastFocus.focus({preventScroll:true}); } catch(_){} }
    else if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  lastFocus = null;
}

function openMoon(m, parent){
  state.openMoonObj = m;
  mDomain.textContent = parent.name;
  mTitle.textContent = m.name;
  renderMoonBody(m);
  mLinks.innerHTML = '';                              // one, many, or no links per moon
  for(const l of moonLinks(m)){
    const a = document.createElement('a');
    a.className = 'm-link'; a.href = l.href;
    a.target = '_blank'; a.rel = 'noopener';          // outbound links open in a new tab
    a.innerHTML = (l.label || 'open') + ' &rarr;';
    mLinks.appendChild(a);
  }
  moonPanel.classList.add('show');
  // place near moon, clamped to view
  const s = toScreen(m.wx,m.wy);
  const cw = moonPanel.offsetWidth || 320, ch = moonPanel.offsetHeight || 200;
  let left = s.x + 24, top = s.y - ch/2;
  if(left + cw > state.W-16) left = s.x - cw - 24;
  if(left < 16) left = Math.min(state.W-cw-16, Math.max(16,(state.W-cw)/2));
  top = Math.max(16, Math.min(state.H-ch-16, top));
  moonPanel.style.left = left+'px';
  moonPanel.style.top = top+'px';
  panelOpened(moonPanel);
}
function closeMoon(){ state.openMoonObj = null; moonPanel.classList.remove('show'); hidePeek(); panelClosed(moonPanel); }
moonPanel.querySelector('.m-close').addEventListener('click', ()=>writeHash(state.focused?state.focused.slug:''));
// a moon can carry `links: [{label, href}, ...]` for several, or a single `href`
function moonLinks(m){
  if(Array.isArray(m.links)) return m.links.filter(l=>l && l.href && l.href!=='#');
  if(m.href && m.href!=='#') return [{ label:'open', href:m.href }];
  return [];
}

// card body — phrases listed in a moon's `photos` map become hover-to-peek terms
const peekEl = document.getElementById('photoPeek');
const peekImg = peekEl.querySelector('img');
function appendText(node, text){   // \n → line break, *phrase* → italic
  String(text).split('\n').forEach((line, li)=>{
    if(li) node.appendChild(document.createElement('br'));
    line.split(/\*([^*]+)\*/g).forEach((seg, i)=>{
      if(!seg) return;
      if(i % 2){ const em = document.createElement('em'); em.textContent = seg; node.appendChild(em); }
      else node.appendChild(document.createTextNode(seg));
    });
  });
}
function renderMoonBody(m){
  mBody.textContent = '';
  mBody.style.display = m.body ? '' : 'none';   // no empty gap for links-only moons
  if(!m.photos){ appendText(mBody, m.body || ''); return; }
  const found = [];
  for(const term in m.photos){
    const i = m.body.indexOf(term);
    if(i >= 0) found.push({ i, term, src: m.photos[term] });
  }
  found.sort((a,b)=>a.i-b.i);
  let pos = 0;
  for(const f of found){
    if(f.i < pos) continue;
    if(f.i > pos) mBody.appendChild(document.createTextNode(m.body.slice(pos, f.i)));
    const sp = document.createElement('span');
    sp.className = 'm-photo';
    sp.textContent = f.term;
    sp.dataset.img = f.src;
    mBody.appendChild(sp);
    pos = f.i + f.term.length;
  }
  mBody.appendChild(document.createTextNode(m.body.slice(pos)));
}
function showPeek(t){
  peekImg.src = t.dataset.img;
  peekImg.alt = t.textContent;          // the phrase that triggered it
  peekEl.setAttribute('aria-hidden','false');
  const r = t.getBoundingClientRect();
  peekEl.style.left = Math.max(135, Math.min(state.W-135, r.left + r.width/2)) + 'px';
  if(r.top > 240){ peekEl.style.top = (r.top - 10)+'px'; peekEl.style.transform = 'translate(-50%,-100%)'; }
  else            { peekEl.style.top = (r.bottom + 10)+'px'; peekEl.style.transform = 'translate(-50%,0)'; }
  peekEl.classList.add('show');
}
function hidePeek(){ peekEl.classList.remove('show'); peekEl.setAttribute('aria-hidden','true'); }
mBody.addEventListener('mouseover', e=>{ const t = e.target.closest('.m-photo'); if(t) showPeek(t); });
mBody.addEventListener('mouseout',  e=>{ if(e.target.closest('.m-photo')) hidePeek(); });
mBody.addEventListener('click',     e=>{ const t = e.target.closest('.m-photo'); if(!t) return; peekEl.classList.contains('show') ? hidePeek() : showPeek(t); }); // tap toggles

function openAbout(){ closeMoon(); aboutPanel.classList.add('show'); hintEl.style.opacity='0'; setHover(null); panelOpened(aboutPanel); }
function closeAbout(){ aboutPanel.classList.remove('show'); if(state.mode==='system') hintEl.style.opacity='0.7'; panelClosed(aboutPanel); }
aboutPanel.querySelector('.a-close').addEventListener('click', ()=>writeHash(''));

function buildAbout(){
  const a = CONTENT.sun.about || {};
  const kickerEl = aboutPanel.querySelector('.a-kicker');
  kickerEl.textContent = a.kicker || '';
  kickerEl.style.display = a.kicker ? '' : 'none';
  aboutPanel.querySelector('.a-name').textContent = a.name || '';
  const bodyEl = aboutPanel.querySelector('.a-body');
  bodyEl.innerHTML = '';
  (a.paragraphs||[]).forEach(txt=>{
    const p = document.createElement('p'); p.textContent = txt; bodyEl.appendChild(p);
  });
  const linksEl = aboutPanel.querySelector('.a-links');
  linksEl.innerHTML = '';
  (a.links||[]).forEach(l=>{
    const el = document.createElement('a');
    el.className = 'a-link'; el.href = l.href || '#';
    el.innerHTML = l.label + ' &rarr;';
    if((l.href||'#')==='#') el.addEventListener('click', e=>e.preventDefault());
    linksEl.appendChild(el);
  });
}

function buildSocial(){
  const el = document.getElementById('social');
  if(!el) return;
  el.innerHTML = '';
  (CONTENT.social||[]).forEach(l=>{
    const a = document.createElement('a');
    a.href = l.href || '#';
    a.textContent = l.label;
    a.target = '_blank'; a.rel = 'noopener';
    if((l.href||'#')==='#') a.addEventListener('click', e=>e.preventDefault());
    el.appendChild(a);
  });
}

// hidden text outline for search engines & screen readers (a11y.js is the single source)
function buildA11y(){
  const el = document.getElementById('a11y');
  if(!el || typeof a11yOutline !== 'function') return;
  el.innerHTML = a11yOutline(CONTENT);
}

// url hash <-> state (so back/forward work)
function currentHash(){ return decodeURIComponent(location.hash.replace(/^#/,'')); }
function writeHash(h){
  const want = h || '';
  if(currentHash() !== want){
    if(want) location.hash = '#'+want;
    else history.replaceState(null, '', location.pathname + location.search);
  }
  applyHashState();
}
function applyHashState(){
  const h = currentHash();
  const slash = h.indexOf('/');
  const pslug = slash<0 ? h : h.slice(0,slash);
  const mslug = slash<0 ? '' : h.slice(slash+1);
  if(!h){
    if(aboutPanel.classList.contains('show')) closeAbout();
    if(moonPanel.classList.contains('show')) closeMoon();
    if(state.focused) pullBack();
    return;
  }
  if(pslug==='about'){
    if(state.focused) pullBack();
    closeMoon();
    if(!aboutPanel.classList.contains('show')) openAbout();
    return;
  }
  const p = PLANETS.find(x=>x.slug===pslug);
  if(!p){ writeHash(''); return; }
  if(aboutPanel.classList.contains('show')) closeAbout();
  if(state.focused!==p) focusPlanet(p);
  const m = mslug ? p.moons.find(x=>x.slug===mslug) : null;
  if(m) openMoon(m, p); else closeMoon();
}
window.addEventListener('hashchange', applyHashState);

function handleClick(sx,sy){
  if(hitUfo(sx,sy)){ tapUfo(); return; }   // before everything: it floats above the world,
                                           // and shan't read as a tap on empty space
  const hit = hitTest(sx,sy);
  if(!hit){
    // tapping empty space backs out one level — same ladder as esc
    if(moonPanel.classList.contains('show')) writeHash(state.focused?state.focused.slug:'');
    else if(aboutPanel.classList.contains('show')) writeHash('');
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
  pmtx = Math.max(-1, Math.min(1, (x - state.W/2)/(state.W/2)));
  pmty = Math.max(-1, Math.min(1, (y - state.H/2)/(state.H/2)));
  trail.push({x, y, life:1});
  if(trail.length > 12) trail.shift();
}

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
  if(state.nudgeT > 0){ state.nudgeT = 0; hintEl.innerHTML = hintDefault; }
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

backBtn.addEventListener('click', ()=>writeHash(''));

window.addEventListener('keydown', e=>{
  if(game.on && (e.key==='f' || e.key==='F')){ toggleFree(); return; }
  if(e.key==='Escape'){
    if(game.on){ exitGame(); return; }
    if(moonPanel.classList.contains('show')) writeHash(state.focused?state.focused.slug:'');
    else if(aboutPanel.classList.contains('show')) writeHash('');
    else if(state.mode==='planet') writeHash('');
  }
});

// ↑ ↑ ↓ ↓ ← → ← → b a
const KONAMI = ['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
let konamiIdx = 0;
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if(k === KONAMI[konamiIdx]){
    if(++konamiIdx === KONAMI.length){ konamiIdx = 0; game.on ? exitGame() : enterGame(); }
  } else {
    konamiIdx = (k === KONAMI[0]) ? 1 : 0;
  }
});

// friendlier secret: just type "comet"
let typed = '';
window.addEventListener('keydown', e=>{
  if(e.key.length !== 1) return;
  typed = (typed + e.key.toLowerCase()).slice(-5);
  if(typed === 'comet'){ typed = ''; game.on ? exitGame() : enterGame(); }
});

/* boot ur boot */
function boot(){
  buildAbout();
  buildSocial();
  buildA11y();
  resize();
  view.scale = state.fitScale; target.scale = state.fitScale;
  view.cx=0; view.cy=0; target.cx=0; target.cy=0;
  update(0);
  applyHashState();
  try { window.focus(); } catch(_){}   // so key presses reach the page right away
  lastT = performance.now();
  requestAnimationFrame(frame);
}
boot();
