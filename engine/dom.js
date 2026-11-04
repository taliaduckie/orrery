/* dom.js — the handful of elements index.html provides, looked up once.
   What happens on them lives elsewhere: ui.js (cards, tooltip, hint, peeks),
   render.js (the stage), effects.js (the comet overlay), input.js (listeners). */

export const canvas = document.getElementById('stage');
export const ctx = canvas.getContext('2d');
export const cometCanvas = document.getElementById('comet');
export const cctx = cometCanvas.getContext('2d');

export const tipEl = document.getElementById('tip');
export const tipName = tipEl.querySelector('.t-name');
export const tipDesc = tipEl.querySelector('.t-desc');

export const moonPanel = document.getElementById('moonPanel');
export const mDomain = moonPanel.querySelector('.m-domain');
export const mTitle = moonPanel.querySelector('.m-title');
export const mBody = moonPanel.querySelector('.m-body');
export const mLinks = moonPanel.querySelector('.m-links');
export const aboutPanel = document.getElementById('aboutPanel');

export const peekEl = document.getElementById('photoPeek');
export const peekImg = peekEl.querySelector('img');

export const backBtn = document.getElementById('backBtn');
export const hintEl = document.getElementById('hint');
