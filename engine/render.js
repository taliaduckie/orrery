/* render.js — draws one frame on #stage, back to front: the baked sky bitmap
   (parallaxed), constellations, a meteor if there is one, orbit rings, the sun,
   planets + moons, the comet game overlay, labels, then the ufo on top.
   drawBody is the planet look: radial gradient lit from the sun's direction, a
   darkened terminator on the far side, soft bloom, optional seeded glass marbling
   (seeded so it's stable, not shimmering). Rings go in two passes (drawRingHalf
   back/front) so the planet occludes the far arc. */
import { SUN, PLANETS } from './astro.js';
import { state, view, mouse, par, game, toScreen } from './state.js';
import { ctx } from './dom.js';
import { hexRgb, rgba, lighten, darken, mix, rng } from './utils.js';
import { bgCanvas, constItems } from './sky.js';
import { drawMeteor, drawUfo, drawComet } from './effects.js';
import { LAUNCH, predictPath } from './simulation.js';

const SHADOW = {r:34, g:28, b:25};

function applyWorld(offx,offy){
  const { W, H, DPR } = state;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.translate(W/2+offx, H/2+offy);
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

// celebration: sequenced flare, sun first, then each orbit ring outward
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

/* ---- comet game overlay (world space) ---- */
function drawCourse(){
  const course = game.course, aim = game.aim, comet = game.comet, traceT = game.traceT;
  const pts = course.pts;
  const drawn = Math.max(1, Math.floor(Math.min(traceT,1) * (pts.length-1)));

  ctx.setLineDash([7/view.scale, 9/view.scale]);
  ctx.strokeStyle='rgba(217,152,90,0.30)'; ctx.lineWidth=1.7/view.scale;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=3;i<drawn;i+=3) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash([]);

  if(traceT < 1){   // the tracer drawing the route
    const h = pts[drawn];
    ctx.beginPath(); ctx.arc(h.x, h.y, 4/view.scale, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,244,224,0.95)'; ctx.fill();
  }

  if(aim && game.aiming){   // small circles: where this pull actually goes
    const pv = predictPath(course, (aim.x0-aim.x1)*LAUNCH, (aim.y0-aim.y1)*LAUNCH, course.preview);
    for(let i=0;i<pv.length;i++){
      ctx.beginPath(); ctx.arc(pv[i].x, pv[i].y, 2.4/view.scale, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,250,238,'+(0.8 - 0.55*(i/Math.max(1,pv.length)))+')'; ctx.fill();
    }
  }

  const gAlpha = Math.max(0, Math.min(1, (traceT-1)/0.4));
  for(let i=0;i<course.gates.length && gAlpha>0;i++){
    const g = course.gates[i];
    ctx.beginPath(); ctx.arc(g.x, g.y, course.gateR, 0, Math.PI*2);
    if(g.hit){ ctx.strokeStyle='rgba(217,152,90,'+(0.9*gAlpha)+')';  ctx.lineWidth=2.4/view.scale; }
    else if(i===game.gateIdx){ ctx.strokeStyle='rgba(233,228,220,'+(0.6*gAlpha)+')'; ctx.lineWidth=1.8/view.scale; }
    else { ctx.strokeStyle='rgba(233,228,220,'+(0.22*gAlpha)+')'; ctx.lineWidth=1.1/view.scale; }
    ctx.stroke();
  }

  if(comet){
    const t = comet.trail;
    for(let i=1;i<t.length;i++){
      ctx.strokeStyle='rgba(255,248,232,'+((i/t.length)*0.6)+')'; ctx.lineWidth=1.5/view.scale;
      ctx.beginPath(); ctx.moveTo(t[i-1].x,t[i-1].y); ctx.lineTo(t[i].x,t[i].y); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(comet.x, comet.y, 3.4/view.scale, 0, Math.PI*2);
    ctx.fillStyle='rgba(255,250,238,0.95)'; ctx.fill();
  }

  ctx.beginPath(); ctx.arc(course.start.x, course.start.y, 4.5/view.scale, 0, Math.PI*2);
  ctx.fillStyle = comet ? 'rgba(255,250,238,0.35)' : 'rgba(255,250,238,0.95)'; ctx.fill();
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
  const aim = game.aim;
  if(aim){
    // the pull-back (elastic), dashed
    ctx.setLineDash([6/view.scale, 6/view.scale]);
    ctx.strokeStyle = 'rgba(255,250,236,0.4)'; ctx.lineWidth = 1.2/view.scale;
    ctx.beginPath(); ctx.moveTo(aim.x0,aim.y0); ctx.lineTo(aim.x1,aim.y1); ctx.stroke();
    ctx.setLineDash([]);

    // first-pull teaching cue: a small arrow + tag pointing the launch way
    const dx = aim.x0-aim.x1, dy = aim.y0-aim.y1, len = Math.hypot(dx,dy);
    if(game.firstPull && len*view.scale > 6){
      const ux=dx/len, uy=dy/len, s=34/view.scale, hw=7/view.scale, px=-uy, py=ux;
      const tx=aim.x0+ux*s, ty=aim.y0+uy*s;
      ctx.strokeStyle='rgba(255,250,236,0.75)'; ctx.lineWidth=1.4/view.scale;
      ctx.beginPath();
      ctx.moveTo(aim.x0,aim.y0); ctx.lineTo(tx,ty);
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
    ctx.beginPath(); ctx.arc(aim.x0,aim.y0, 3.2/view.scale, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,250,238,0.95)'; ctx.fill();
  }
}

/* ---- labels (screen space) ---- */
function drawLabels(prog, otherAlpha){
  const focused = state.focused;
  ctx.textAlign='center';
  ctx.textBaseline='top';

  {
    const s = toScreen(0,0,par.sun.x,par.sun.y);
    const a = (focused ? otherAlpha : 1);
    ctx.font = '15px "IM Fell English", serif';   // matches the #social links
    ctx.letterSpacing = '.4px';
    ctx.fillStyle = rgba(hexRgb('#f6f3ee'), 0.78*a);
    ctx.fillText(SUN.label, s.x, s.y + SUN.r*view.scale + 12);
    ctx.letterSpacing = '0px';                    // canvas state persists, don't leak into planet labels
  }

  // planet name only as the "you are here" heading when focused (hover uses the tooltip)
  PLANETS.forEach(p=>{
    const a = (p===focused) ? prog : 0;
    if(a<=0.03) return;
    const s = toScreen(p.wx,p.wy,par.planet.x,par.planet.y);
    ctx.font = '700 ' + Math.round(15 + p.r*0.10) + 'px "IM Fell English", serif';
    ctx.fillStyle = rgba(hexRgb('#f6f3ee'), a);
    ctx.fillText(p.name, s.x, s.y + p.r*view.scale + 10);
  });
}

export function render(){
  const { W, H, DPR } = state;
  const focused = state.focused;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#05080f'; ctx.fillRect(0,0,W*DPR,H*DPR);
  ctx.drawImage(bgCanvas, par.bg.x*DPR, par.bg.y*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);

  drawConstellations();
  drawMeteor();

  let prog = 0;
  if(focused){
    prog = (view.scale - state.fitScale) / (state.focusTargetScale - state.fitScale);
    prog = Math.max(0, Math.min(1, prog));
  }
  const otherAlpha = focused ? (1 - prog*0.92) : 1;

  // this is taking FOREVER wauhgh
  applyWorld(par.ring.x, par.ring.y);
  PLANETS.forEach(p=>{
    const a = (p===focused) ? prog*0.5 + (1-prog)*1 : otherAlpha;
    drawOrbit(p.a,p.b,p.rot, a*0.9);
  });
  if(game.winT>0) PLANETS.forEach((p,i)=>{ const w=winRing(i); if(w>0) drawOrbit(p.a,p.b,p.rot,w); });
  if(focused && prog>0.02){
    ctx.save();
    ctx.translate(focused.wx, focused.wy);
    focused.moons.forEach(m=>{ drawOrbit(m.dr,m.b,m.rot, prog*0.85); });
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
    const a = (p===focused) ? 1 : otherAlpha;
    const opts = p.pattern ? {pattern:p.pattern, seed:p.seed} : null;
    if(p.ring) drawRingedBody(p.wx,p.wy,p.r,p.color,a,p.ring,opts);
    else drawBody(p.wx,p.wy,p.r,p.color,a,opts);
  });
  if(focused && prog>0.02){
    focused.moons.forEach(m=>{ drawBody(m.wx,m.wy,m.r,m.color,prog); });
  }
  if(game.on) drawSandbox();

  ctx.setTransform(DPR,0,0,DPR,0,0);
  drawLabels(prog, otherAlpha);
  drawUfo();   // last: it's a screen-space overlay, and input gives it hit priority

  drawComet();
}
