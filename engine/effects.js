/* effects.js — the depth-and-ambience layer, all in screen space: mouse parallax
   (eased, so it lags), the comet trail evaporating behind the cursor on the
   #comet overlay, the odd shooting star, and the ufo. meteor and ufo share one
   spawn/move/draw shape; the ufo is ~10x slower because, unlike a shooting star,
   you're meant to catch it — it's the only way into the comet game without a
   keyboard, and it's a coin flip. */
import { state, mouse, par, game } from './state.js';
import { ctx, cctx } from './dom.js';
import { reduced } from './utils.js';
import { setHover, setHint, resetHint, anyPanelOpen } from './ui.js';
import { enterGame } from './game.js';

// parallax: smoothed + target, [-1,1]
let pmx=0, pmy=0, pmtx=0, pmty=0;
const PX_BG=2, PX_SUN=3, PX_RING=4, PX_PLANET=6;  // max shift per depth layer

const trail = [];             // {x,y,life}

// input calls this on real mouse movement (never under reduced motion)
export function pointerMoved(x,y){
  pmtx = Math.max(-1, Math.min(1, (x - state.W/2)/(state.W/2)));
  pmty = Math.max(-1, Math.min(1, (y - state.H/2)/(state.H/2)));
  trail.push({x, y, life:1});
  if(trail.length > 12) trail.shift();
}

let meteor = null, nextMeteorIn = 12 + Math.random()*22;   // ambient shooting stars

// slower than meteor bc u gotta catch it (gotta catch em all?
// tap it 50/50 sandbox or ZOOMM AWAY
let ufo = null, nextUfoIn = 20 + Math.random()*25;
export const UFO_TIP = { name:'ufo', desc:'tap it' };   // shown on hover/hold so it reads as tappable
const UFO_HIT = 30;   // fat tap radius, it's tiny and moving

function spawnMeteor(){
  const { W, H } = state;
  const dir = Math.random()<0.5 ? 1 : -1;
  const ang = Math.PI*0.18 + Math.random()*Math.PI*0.16;   // below horizontal
  const speed = (W+H)*0.32;
  meteor = {
    x: W*(0.15+Math.random()*0.7), y: H*(Math.random()*0.3),
    vx: dir*Math.cos(ang)*speed, vy: Math.sin(ang)*speed,
    life: 1, len: 80+Math.random()*70
  };
}

function spawnUfo(){
  const { W, H } = state;
  const dir = Math.random()<0.5 ? 1 : -1;
  ufo = {
    x: dir>0 ? -50 : W+50,
    y: H*(0.12 + Math.random()*0.45),
    vx: dir*(W+H)*0.035,   // slow enough to actually be tapped
    t: 0,
    beam: 0,               // counts down while the tractor beam is lit
    pending: null          // what to do once the beam finishes: 'game' | 'flee'
  };
}

export function hitUfo(sx,sy){
  return !!ufo && !ufo.pending && Math.hypot(sx-ufo.x, sy-ufo.y) <= UFO_HIT;
}
// the hover record for the ufo; pos is the live ufo so the tooltip can follow it
export function ufoHover(){ return { type:'ufo', obj:UFO_TIP, pos:ufo }; }

export function tapUfo(){
  setHover(null);
  ufo.beam = 1;
  ufo.pending = Math.random()<0.5 ? 'game' : 'flee';   // coin flip, so it stays a surprise
}

export function tickEffects(dt){
  const { W, H } = state;
  if(!mouse.active){ pmtx=0; pmty=0; }
  pmx += (pmtx-pmx)*0.05; pmy += (pmty-pmy)*0.05;
  par.bg.x=pmx*PX_BG;         par.bg.y=pmy*PX_BG;
  par.sun.x=pmx*PX_SUN;       par.sun.y=pmy*PX_SUN;
  par.ring.x=pmx*PX_RING;     par.ring.y=pmy*PX_RING;
  par.planet.x=pmx*PX_PLANET; par.planet.y=pmy*PX_PLANET;

  for(let i=trail.length-1;i>=0;i--){ trail[i].life *= 0.9; if(trail[i].life < 0.03) trail.splice(i,1); }

  if(reduced) return;   // no shooting stars, no ufo, no nudge toward it

  if(meteor){
    meteor.x += meteor.vx*dt; meteor.y += meteor.vy*dt; meteor.life -= dt;
    if(meteor.life<=0 || meteor.y>H+120 || meteor.x<-120 || meteor.x>W+120) meteor = null;
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
    if(ufo && (ufo.x < -90 || ufo.x > W+90)) ufo = null;
  } else if(!game.on){                          // no new arrivals mid-sandbox
    nextUfoIn -= dt;
    if(nextUfoIn<=0){ spawnUfo(); nextUfoIn = 60 + Math.random()*40; }
  }
  if(!ufo && state.hoverObj && state.hoverObj.type==='ufo') setHover(null);

  // nobody finds the sandbox on their own, so nudge lingerers toward the ufo
  if(state.nudgeT > 0){
    state.nudgeT -= dt;
    if(state.nudgeT <= 0) resetHint();
  } else if(!game.on && !state.focused && !anyPanelOpen()){
    state.idleT += dt;
    if(state.idleT >= 40){ state.idleT = -60; state.nudgeT = 6; setHint('psst &nbsp;&middot;&nbsp; catch the ufo'); }
  }
}

export function drawMeteor(){
  if(!meteor) return;
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

// drawn last in render so it sits above the planets, matching the hit priority input gives it
export function drawUfo(){
  if(!ufo) return;
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

// the cursor's comet trail, on its own overlay canvas
export function drawComet(){
  const { W, H, DPR } = state;
  cctx.setTransform(DPR,0,0,DPR,0,0);
  cctx.clearRect(0,0,W,H);
  for(const t of trail){
    const rad = Math.max(0.1, 7*t.life);
    const g = cctx.createRadialGradient(t.x,t.y,0, t.x,t.y, rad);
    g.addColorStop(0, 'rgba(255,250,236,'+(0.5*t.life)+')');
    g.addColorStop(1, 'rgba(255,250,236,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(t.x,t.y,rad,0,Math.PI*2); cctx.fill();
  }
}
