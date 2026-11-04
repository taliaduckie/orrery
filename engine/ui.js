/* ui.js — everything that lives in the DOM rather than on the canvas: the
   tooltip + hover state, the focus ladder (focusPlanet / pullBack), the moon and
   about cards (real dialogs: named, focus moves in and comes back out), photo
   peeks, the hint line, the corner social bar, the hidden a11y outline, and the
   hash router. focusPlanet, pullBack and openMoon are only ever reached through
   applyHashState, so the URL is the single entry point for every transition and
   back/forward + sharing a specific thing work for free. */
import { SUN, PLANETS, CONTENT } from './astro.js';
import { state, view, target, par, toScreen, planetFocusScale } from './state.js';
import { canvas, tipEl, tipName, tipDesc, moonPanel, mDomain, mTitle, mBody, mLinks,
         aboutPanel, peekEl, peekImg, backBtn, hintEl } from './dom.js';

/* ---- hint line under the orrery ---- */
const hintDefault = hintEl.innerHTML;
export function setHint(html){ hintEl.innerHTML = html; }
export function resetHint(){ hintEl.innerHTML = hintDefault; }
export function setHintOpacity(v){ hintEl.style.opacity = v; }

export function moonOpen(){ return moonPanel.classList.contains('show'); }
export function aboutOpen(){ return aboutPanel.classList.contains('show'); }
export function anyPanelOpen(){ return moonOpen() || aboutOpen(); }

/* ---- tooltip + hover ---- */
function showTip(obj){
  const isSun = obj===SUN;   // the sun's name already sits under it permanently
  tipName.textContent = isSun ? '' : (obj.name || obj.label || '');
  tipName.style.display = isSun ? 'none' : '';
  tipDesc.textContent = obj.desc || '';
  tipDesc.style.display = obj.desc ? '' : 'none';
  tipEl.classList.add('show');
}
export function hideTip(){ tipEl.classList.remove('show'); }
export function showConstTip(item){
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
export function positionConstTip(item){
  let minY=Infinity, sumX=0;
  for(const p of item.pts){ sumX += p.bx; if(p.by<minY) minY=p.by; }
  placeTip(sumX/item.pts.length + par.bg.x, minY + par.bg.y - 12);
}
export function positionTip(){
  const h = state.hoverObj;
  if(!h) return;
  if(h.type==='ufo'){ if(h.pos) placeTip(h.pos.x, h.pos.y - 16); return; }   // pos is the live ufo
  let wx,wy,r,off;
  if(h.type==='sun'){ wx=0;wy=0;r=SUN.r; off=par.sun; }
  else { wx=h.obj.wx; wy=h.obj.wy; r=h.obj.r; off=par.planet; }
  const s = toScreen(wx,wy,off.x,off.y);
  placeTip(s.x, s.y - r*view.scale - 14);
}

export function setHover(obj){
  const cur = state.hoverObj;
  if(obj===cur || (obj && cur && obj.obj===cur.obj)) {
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

/* ---- focus ladder ---- */
function focusPlanet(p){
  state.mode='planet'; state.focused=p;
  closeMoon();
  state.focusTargetScale = planetFocusScale(p);
  target.scale = state.focusTargetScale;
  target.cx = p.wx; target.cy = p.wy;
  backBtn.classList.add('show');
  setHintOpacity('0');
  setHover(null);
}
function pullBack(){
  state.mode='system'; state.focused=null;
  target.scale = state.fitScale; target.cx=0; target.cy=0;
  backBtn.classList.remove('show');
  closeMoon();
  setHintOpacity('0.7');
  setHover(null);
}

/* ---- panels ---- */
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
  const { W, H } = state;
  const s = toScreen(m.wx,m.wy);
  const cw = moonPanel.offsetWidth || 320, ch = moonPanel.offsetHeight || 200;
  let left = s.x + 24, top = s.y - ch/2;
  if(left + cw > W-16) left = s.x - cw - 24;
  if(left < 16) left = Math.min(W-cw-16, Math.max(16,(W-cw)/2));
  top = Math.max(16, Math.min(H-ch-16, top));
  moonPanel.style.left = left+'px';
  moonPanel.style.top = top+'px';
  panelOpened(moonPanel);
}
function closeMoon(){ state.openMoonObj = null; moonPanel.classList.remove('show'); hidePeek(); panelClosed(moonPanel); }
// a moon can carry `links: [{label, href}, ...]` for several, or a single `href`
function moonLinks(m){
  if(Array.isArray(m.links)) return m.links.filter(l=>l && l.href && l.href!=='#');
  if(m.href && m.href!=='#') return [{ label:'open', href:m.href }];
  return [];
}

// card body — phrases listed in a moon's `photos` map become hover-to-peek terms
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

function openAbout(){ closeMoon(); aboutPanel.classList.add('show'); setHintOpacity('0'); setHover(null); panelOpened(aboutPanel); }
function closeAbout(){ aboutPanel.classList.remove('show'); if(state.mode==='system') setHintOpacity('0.7'); panelClosed(aboutPanel); }

/* ---- built once from content.js ---- */
export function buildAbout(){
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

export function buildSocial(){
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
export function buildA11y(){
  const el = document.getElementById('a11y');
  const outline = globalThis.a11yOutline;   // a11y.js is a classic script, shared with prerender.js
  if(!el || typeof outline !== 'function') return;
  el.innerHTML = outline(CONTENT);
}

/* ---- url hash <-> state (so back/forward work) ---- */
function currentHash(){ return decodeURIComponent(location.hash.replace(/^#/,'')); }
export function writeHash(h){
  const want = h || '';
  if(currentHash() !== want){
    if(want) location.hash = '#'+want;
    else history.replaceState(null, '', location.pathname + location.search);
  }
  applyHashState();
}
export function applyHashState(){
  const h = currentHash();
  const slash = h.indexOf('/');
  const pslug = slash<0 ? h : h.slice(0,slash);
  const mslug = slash<0 ? '' : h.slice(slash+1);
  if(!h){
    if(aboutOpen()) closeAbout();
    if(moonOpen()) closeMoon();
    if(state.focused) pullBack();
    return;
  }
  if(pslug==='about'){
    if(state.focused) pullBack();
    closeMoon();
    if(!aboutOpen()) openAbout();
    return;
  }
  const p = PLANETS.find(x=>x.slug===pslug);
  if(!p){ writeHash(''); return; }
  if(aboutOpen()) closeAbout();
  if(state.focused!==p) focusPlanet(p);
  const m = mslug ? p.moons.find(x=>x.slug===mslug) : null;
  if(m) openMoon(m, p); else closeMoon();
}

export function installUI(){
  moonPanel.querySelector('.m-close').addEventListener('click', ()=>writeHash(state.focused?state.focused.slug:''));
  aboutPanel.querySelector('.a-close').addEventListener('click', ()=>writeHash(''));
  backBtn.addEventListener('click', ()=>writeHash(''));
  mBody.addEventListener('mouseover', e=>{ const t = e.target.closest('.m-photo'); if(t) showPeek(t); });
  mBody.addEventListener('mouseout',  e=>{ if(e.target.closest('.m-photo')) hidePeek(); });
  mBody.addEventListener('click',     e=>{ const t = e.target.closest('.m-photo'); if(!t) return; peekEl.classList.contains('show') ? hidePeek() : showPeek(t); }); // tap toggles
  window.addEventListener('hashchange', applyHashState);
}
