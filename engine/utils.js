/* utils.js — tiny pure helpers every module shares, plus the one environment
   flag (prefers-reduced-motion) that simulation, effects and input all key off. */

export function hexRgb(h){ h=h.replace('#',''); return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)}; }
export function rgba(c,a){ return 'rgba('+(c.r|0)+','+(c.g|0)+','+(c.b|0)+','+(a===undefined?1:a)+')'; }
export function lighten(c,f){ return {r:c.r+(255-c.r)*f, g:c.g+(255-c.g)*f, b:c.b+(255-c.b)*f}; }
export function darken(c,f){ return {r:c.r*(1-f), g:c.g*(1-f), b:c.b*(1-f)}; }
export function mix(a,b,t){ return {r:a.r+(b.r-a.r)*t, g:a.g+(b.g-a.g)*t, b:a.b+(b.b-a.b)*t}; }
export function rng(seed){ let s=(seed*2654435761)%2147483647; if(s<=0) s+=2147483646; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; } // bebb
export function slugify(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

export const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
