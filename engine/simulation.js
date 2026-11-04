/* simulation.js — the physics.
   For the orrery: positions on the ellipses (an orbit freezes on hover, on focus,
   and for everything while the game is on) and the eased camera.
   For the comet game: one gravity field shared by the course generator, the aim
   prediction and the live run. All three step at the same fixed SIM_H, because
   with variable frame dt a perfect launch diverges from the drawn line near the
   sun, where forces are huge. buildCourse doesn't draw a path, it replays a launch
   that survived, so the line is always followable by construction. */
import { SUN, PLANETS } from './astro.js';
import { state, view, target, game } from './state.js';
import { reduced } from './utils.js';

export function ellipsePos(a,b,angle,rot){
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

export function updateOrbits(dt){
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
}

// the camera chases its target; a focused planet drags the target along with it
export function updateCamera(dt){
  if(state.focused){ target.cx = state.focused.wx; target.cy = state.focused.wy; }
  // ease camera shit
  const k = reduced ? 1 : (1 - Math.pow(0.0009, dt));   // reduced motion: snap instead of ease
  view.scale += (target.scale - view.scale)*k;
  view.cx    += (target.cx    - view.cx)*k;
  view.cy    += (target.cy    - view.cy)*k;
}

/* ---- gravity, for the comet game — tune to taste ---- */
export const G=1, SUN_MASS=9e5, PLANET_MASS=2600, LAUNCH=0.5;
// SOFT is a softening length of ~16 units. planets are r18-31, so close passes really deflect
export const SOFT=260, SIM_H=1/120, SIM_SPEED=5;   // fixed step, run at 5x so a route is ~7-14s

// one field, used by both the course generator and the live run
export function gravityAt(x,y){
  let ax=0, ay=0, dx, dy, d2, inv;
  dx=-x; dy=-y; d2=dx*dx+dy*dy+SOFT; inv=G*SUN_MASS/(d2*Math.sqrt(d2)); ax+=dx*inv; ay+=dy*inv;
  for(const p of PLANETS){ dx=p.wx-x; dy=p.wy-y; d2=dx*dx+dy*dy+SOFT; inv=G*(p.r*PLANET_MASS)/(d2*Math.sqrt(d2)); ax+=dx*inv; ay+=dy*inv; }
  return {ax:ax, ay:ay};
}
// past the boundary and still heading out = gone. no getting dragged back in.
// has to be directional: the slingshot anchor itself sits outside the last planet.
export function escaped(x,y,vx,vy,escR){
  return (x*x+y*y) > escR*escR && (x*vx + y*vy) > 0;
}
export function hitsBody(x,y){
  if(x*x+y*y < (SUN.r*0.95)*(SUN.r*0.95)) return true;
  for(const p of PLANETS){ const dx=p.wx-x, dy=p.wy-y; if(dx*dx+dy*dy < (p.r*1.15)*(p.r*1.15)) return true; }
  return false;
}
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
// L is a level spec from game.js: { turn, spacing, gate, preview }
export function buildCourse(L){
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
export function predictPath(course,vx,vy,steps){
  let x=course.start.x, y=course.start.y; const out=[];
  for(let i=0;i<steps;i++){
    const g=gravityAt(x,y);
    vx+=g.ax*SIM_H; vy+=g.ay*SIM_H; x+=vx*SIM_H; y+=vy*SIM_H;
    if(hitsBody(x,y) || escaped(x,y,vx,vy,course.outR)) break;
    if(i%22===0) out.push({x:x,y:y});
  }
  return out;
}
