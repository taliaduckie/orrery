/* orrery.js — the engine, as an ES module (so it can be split into engine/ modules
   step by step). Reads the SITE object from content.js; content should be changed there. */
import { state, view, target, game, computeFit, planetFocusScale } from './engine/state.js';
import { canvas, cometCanvas } from './engine/dom.js';
import { buildBackground, buildConstellations } from './engine/sky.js';
import { updateOrbits, updateCamera } from './engine/simulation.js';
import { positionTip, applyHashState, buildAbout, buildSocial, buildA11y, installUI } from './engine/ui.js';
import { tickGame, lookAtCourse } from './engine/game.js';
import { tickEffects } from './engine/effects.js';
import { installInput, tickConstellationDwell } from './engine/input.js';
import { render } from './engine/render.js';

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
  if(game.on && game.course){ lookAtCourse(); }
  else if(state.mode==='system'){ target.scale=state.fitScale; target.cx=0; target.cy=0; }
  else if(state.focused){ target.scale = planetFocusScale(state.focused); }
}
window.addEventListener('resize', resize);

let lastT = performance.now();

function update(dt){
  updateOrbits(dt);

  tickGame(dt);
  updateCamera(dt);

  tickEffects(dt);

  tickConstellationDwell(dt);
}

function frame(now){
  let dt = (now-lastT)/1000; lastT = now;
  if(dt>0.05) dt=0.05; // clamp after tab-switch
  update(dt);
  render();
  positionTip();
  requestAnimationFrame(frame);
}

/* boot ur boot */
function boot(){
  buildAbout();
  buildSocial();
  buildA11y();
  installUI();
  installInput();
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
