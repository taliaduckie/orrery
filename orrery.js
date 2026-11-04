/* orrery.js — entry point. content.js (the words/numbers) and a11y.js load as
   classic scripts before this; the engine lives in engine/ as ES modules:

     utils.js       colour helpers, seeded rng, slugify, the reduced-motion flag
     astro.js       astronomical data: sun + planets from SITE, constellation catalogue
     state.js       shared mutable state: screen, camera, focus/hover, the comet game
     dom.js         the elements index.html provides
     sky.js         baked star background + constellation placement
     simulation.js  orbital motion, camera easing, gravity physics for the game
     ui.js          tooltip, cards, hint line, social bar, a11y outline, hash router
     game.js        the comet game's state machine
     effects.js     parallax, cursor comet trail, shooting stars, the ufo
     input.js       pointer / touch / keyboard, hit-testing, secret entrances
     render.js      draws a frame

   This file owns only the loop: resize, update, render, boot. */
import { state, view, target, game, computeFit, planetFocusScale } from './engine/state.js';
import { canvas, cometCanvas } from './engine/dom.js';
import { buildBackground, buildConstellations } from './engine/sky.js';
import { updateOrbits, updateCamera } from './engine/simulation.js';
import { tickEffects } from './engine/effects.js';
import { tickGame, lookAtCourse } from './engine/game.js';
import { render } from './engine/render.js';
import { installInput, tickConstellationDwell } from './engine/input.js';
import { installUI, buildAbout, buildSocial, buildA11y, applyHashState, positionTip } from './engine/ui.js';

function resize(){
  state.DPR = Math.min(window.devicePixelRatio||1, 2);
  state.W = window.innerWidth; state.H = window.innerHeight;
  const { W, H, DPR } = state;
  canvas.width = W*DPR; canvas.height = H*DPR;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  cometCanvas.width = W*DPR; cometCanvas.height = H*DPR;
  cometCanvas.style.width = W+'px'; cometCanvas.style.height = H+'px';
  computeFit();
  buildBackground();
  buildConstellations();
  if(game.on && game.course){ lookAtCourse(); }
  else if(state.mode==='system'){ target.scale=state.fitScale; target.cx=0; target.cy=0; }
  else if(state.focused){ target.scale = planetFocusScale(state.focused); }
}

// one tick: positions, then the game (it can retarget the camera), then the
// camera chases, then the ambient layer, then the constellation dwell
function update(dt){
  updateOrbits(dt);
  tickGame(dt);
  updateCamera(dt);
  tickEffects(dt);
  tickConstellationDwell(dt);
}

let lastT = performance.now();
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
  window.addEventListener('resize', resize);
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
