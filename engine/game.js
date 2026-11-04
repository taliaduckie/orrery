/* game.js — the hidden comet game's state machine. Four routes (LEVELS), each a
   solved launch replayed as a dotted line with rings along it: pull back from the
   fixed anchor, release, clear the rings in order. Enter/exit, win/fail, free
   shoot, the hint line, and the per-frame step of the live comet. The physics it
   steps with is simulation.js's; the state it mutates is state.js's `game`.
   Planets freeze while game.on (simulation.isPlanetPaused): the line is a launch
   through a static field, so a moving field would make it unfollowable. */
import { SUN } from './astro.js';
import { state, target, game } from './state.js';
import { SIM_H, SIM_SPEED, LAUNCH, gravityAt, hitsBody, escaped, buildCourse } from './simulation.js';
import { writeHash, setHint, resetHint, setHintOpacity } from './ui.js';

// harder each time: more looping, tighter rings, less of the path predicted for you
export const LEVELS = [
  { turn:Math.PI*1.6, spacing:680, gate:58, preview:2200 },
  { turn:Math.PI*2.1, spacing:780, gate:50, preview:1700 },
  { turn:Math.PI*2.6, spacing:880, gate:43, preview:1250 },
  { turn:Math.PI*3.1, spacing:980, gate:36, preview:850  }
];

function courseFor(lv){ return buildCourse(LEVELS[Math.min(lv, LEVELS.length-1)]); }
function courseScale(){ return Math.min(state.W,state.H) / (2*(game.course.viewR + 50)) * 0.96; }
// pull the camera back so the whole line is on screen
export function lookAtCourse(){ target.scale = courseScale(); target.cx = 0; target.cy = 0; }
function lookAtSystem(){ target.scale = state.fitScale; target.cx = 0; target.cy = 0; }

function winCourse(){
  game.comet = null; game.winT = 0.0001; game.pendingNext = true;
  game.level++;
  game.runMsg = (game.level >= LEVELS.length)
    ? 'all four routes flown &nbsp;&middot;&nbsp; that was the hard way'
    : 'route ' + game.level + ' of ' + LEVELS.length + ' &nbsp;&middot;&nbsp; a harder one is coming';
}
// f drops the route and just lets you fling comets, then picks the route back up
export function toggleFree(){
  if(!game.on) return;
  game.comet = null; game.bodies.length = 0; game.aim = null; game.aiming = false; game.lastHint = '';
  if(game.freeShoot){
    game.freeShoot = false;
    game.course = game.savedCourse || courseFor(game.level); game.savedCourse = null;
    if(game.course){ for(const g of game.course.gates) g.hit = false; lookAtCourse(); }
    game.traceT = 1.4; game.gateIdx = 0; game.runMsg = '';   // route already traced, don't redraw it
  } else {
    game.freeShoot = true; game.savedCourse = game.course; game.course = null; game.runMsg = '';
    lookAtSystem();
  }
}
function advanceLevel(){
  if(!game.on) return;
  if(game.level >= LEVELS.length){ exitGame(); return; }   // done: back to the orrery, comets and all
  game.course = courseFor(game.level);
  if(game.course) lookAtCourse();
  game.traceT = 0; game.gateIdx = 0; game.comet = null; game.tries = 0; game.runMsg = ''; game.lastHint = '';
}
function courseHint(){
  if(game.freeShoot) return 'free shoot &nbsp;&middot;&nbsp; fling as many as u like &nbsp;&middot;&nbsp; f for routes &nbsp;&middot;&nbsp; esc to exit';
  if(!game.course) return 'comet sandbox &nbsp;&middot;&nbsp; pull back &amp; release to launch &nbsp;&middot;&nbsp; esc to exit';
  if(game.runMsg) return game.runMsg;
  return 'route ' + (game.level+1) + '/' + LEVELS.length + ' &nbsp;&middot;&nbsp; ' + game.gateIdx + '/' + game.course.gates.length + ' &nbsp;&middot;&nbsp; tries ' + game.tries + ' &nbsp;&middot;&nbsp; f free shoot &nbsp;&middot;&nbsp; esc';
}
function syncHint(){ const h=courseHint(); if(h!==game.lastHint){ setHint(h); game.lastHint=h; } }
function resetRun(){ game.gateIdx=0; for(const g of game.course.gates) g.hit=false; }
function failRun(why){ game.comet=null; game.tries++; resetRun(); game.runMsg = why + ' &nbsp;&middot;&nbsp; pull back to try again'; }

// konami unlocks a little gravity sandbox: drag to launch a comet
export function enterGame(){
  writeHash(''); game.on = true; game.bodies.length = 0; game.aim = null; game.aiming = false; game.firstPull = true;
  game.comet = null; game.gateIdx = 0; game.tries = 0; game.runMsg = ''; game.lastHint = ''; game.traceT = 0;
  game.level = 0; game.pendingNext = false; game.freeShoot = false; game.savedCourse = null;
  game.course = courseFor(0);   // planets are frozen by now, so the line stays true all game
  if(game.course) lookAtCourse();
  game.lastHint = courseHint(); setHint(game.lastHint);
  setHintOpacity('0.85');
}
export function exitGame(){
  game.on = false; game.bodies.length = 0; game.aim = null; game.aiming = false;
  game.course = null; game.comet = null; game.runMsg = ''; game.lastHint = '';
  game.pendingNext = false; game.winT = 0; game.freeShoot = false; game.savedCourse = null;
  lookAtSystem();
  resetHint();
  setHintOpacity(state.mode==='system' ? '0.7' : '0');
}
export function launchBody(){
  const aim = game.aim;
  if(!aim) return;
  game.firstPull = false;   // teaching arrow only shows until the first launch
  if(game.course){          // one comet, from the anchor, opposite the pull
    game.comet = { x:game.course.start.x, y:game.course.start.y, vx:(aim.x0-aim.x1)*LAUNCH, vy:(aim.y0-aim.y1)*LAUNCH, trail:[] };
    resetRun(); game.runMsg = '';
    return;
  }
  // slingshot: fling opposite the pull-back
  game.bodies.push({ x:aim.x0, y:aim.y0, vx:(aim.x0-aim.x1)*LAUNCH, vy:(aim.y0-aim.y1)*LAUNCH, trail:[] });
  if(game.bodies.length > 40) game.bodies.shift();
}

export function tickGame(dt){
  if(game.winT > 0){ game.winT += dt; if(game.winT > 3.4){ game.winT = 0; if(game.pendingNext){ game.pendingNext = false; advanceLevel(); } } }
  if(!game.on) return;

  const course = game.course;
  if(course){
    if(game.traceT < 1.4) game.traceT = Math.min(1.4, game.traceT + dt/2.4);
    if(game.comet){
      game.simAcc += dt*SIM_SPEED;
      let n = 0;
      while(game.comet && game.simAcc >= SIM_H && n < 24){
        game.simAcc -= SIM_H; n++;
        const c = game.comet;
        const g = gravityAt(c.x, c.y);
        c.vx += g.ax*SIM_H; c.vy += g.ay*SIM_H;
        c.x  += c.vx*SIM_H; c.y += c.vy*SIM_H;
        c.trail.push({x:c.x,y:c.y}); if(c.trail.length>140) c.trail.shift();
        const gt = course.gates[game.gateIdx];
        if(gt && Math.hypot(c.x-gt.x, c.y-gt.y) < course.gateR){ gt.hit = true; game.gateIdx++; }
        if(game.gateIdx >= course.gates.length){
          winCourse();
        } else if(hitsBody(c.x, c.y)){ failRun('crashed'); }
        else if(escaped(c.x, c.y, c.vx, c.vy, course.outR)){ failRun('lost to space'); }
      }
    } else game.simAcc = 0;
  } else {
    // free shoot: variable step is fine here, nothing has to match a drawn line
    for(let bi=game.bodies.length-1; bi>=0; bi--){
      const bd = game.bodies[bi];
      const g = gravityAt(bd.x, bd.y);
      bd.vx+=g.ax*dt; bd.vy+=g.ay*dt;
      bd.x+=bd.vx*dt; bd.y+=bd.vy*dt;
      bd.trail.push({x:bd.x,y:bd.y}); if(bd.trail.length>36) bd.trail.shift();
      const r2 = bd.x*bd.x + bd.y*bd.y;
      if(r2 < (SUN.r*0.9)*(SUN.r*0.9) || r2 > 4000*4000) game.bodies.splice(bi,1);
    }
  }
  syncHint();
}
