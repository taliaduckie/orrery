/* sky.js — the backdrop: ~320 baked stars on an offscreen canvas, and the
   constellation layout — placed once, random, non-overlapping, ringed *around*
   the orrery so they never sit under a planet. Drawing them each frame is
   render.js's job; this owns where they are. */
import { state } from './state.js';
import { CONSTELLATIONS, CONST_INFO } from './astro.js';

export const bgCanvas = document.createElement('canvas');
const bgctx = bgCanvas.getContext('2d');

const scatter = [];
for(let i=0;i<320;i++){
  scatter.push({ fx:Math.random(), fy:Math.random(), r:0.3+Math.random()*0.9, a:0.04+Math.random()*0.13 });
}

export function buildBackground(){
  const { W, H, DPR } = state;
  if(!W || !H) return;
  bgCanvas.width = W*DPR; bgCanvas.height = H*DPR;
  bgctx.setTransform(DPR,0,0,DPR,0,0);

  // darrrrk desaturated blue night sky
  const g = bgctx.createRadialGradient(W*0.5, H*0.42, 0, W*0.5, H*0.5, Math.max(W,H)*0.85);
  g.addColorStop(0,    '#0d1626');
  g.addColorStop(0.55, '#0a101e');
  g.addColorStop(1,    '#05080f');
  bgctx.fillStyle = g; bgctx.fillRect(0,0,W,H);

  scatter.forEach(s=>{
    bgctx.beginPath();
    bgctx.arc(s.fx*W, s.fy*H, s.r, 0, Math.PI*2);
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
  const { W, H } = state;
  const minDim = Math.min(W,H), pad = 10;
  const cx = W/2, cy = H/2;
  const keepOut = state.systemExtent*state.fitScale + 14;   // the orrery's reach on screen — stay off it
  const order = CONSTELLATIONS.map(c=>({ c, r: constLocalRadius(c)*minDim }))
                              .sort((a,b)=> b.r - a.r);   // biggest first
  const done = [];
  for(const it of order){
    const r = it.r;
    const minX=r+pad, maxX=Math.max(r+pad, W-r-pad);
    const minY=r+pad, maxY=Math.max(r+pad, H-r-pad);
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
    if(ok){ done.push({ x:bx, y:by, r }); it.c.ax = bx/W; it.c.ay = by/H; }
  }
  constPlaced = true;
}

// {pts:[{bx,by,op}], edges, name, starNames} per placed constellation, in screen px.
// mutated in place on rebuild so importers keep a live reference.
export const constItems = [];
export function buildConstellations(){
  if(!constPlaced) placeConstellations();
  constItems.length = 0;
  const { W, H } = state;
  const minDim = Math.min(W,H);
  CONSTELLATIONS.forEach((c,i)=>{
    if(!c.placed) return;
    const size = c.scale*minDim, ax = c.ax*W, ay = c.ay*H;
    const cos = Math.cos(c.rot||0), sin = Math.sin(c.rot||0);
    const pts = c.stars.map(([lx,ly])=>{
      const dx = lx-0.5, dy = ly-0.5;
      return { bx: ax + (dx*cos - dy*sin)*size, by: ay + (dx*sin + dy*cos)*size, op: 0.16 };
    });
    const info = CONST_INFO[i] || {};
    constItems.push({ pts, edges: c.edges, name: info.name || '', starNames: info.stars || [] });
  });
}
