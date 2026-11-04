/* astro.js — astronomical data.
   The system: SUN + PLANETS normalized from content.js's SITE (colors parsed,
   ring defaults filled, orbit geometry precomputed). Edit content.js, not this.
   The sky: real constellation asterisms in local 0..1 space (y down), edges by
   index, and their member star names in the same order. sky.js places them. */
import { hexRgb, mix, slugify, reduced } from './utils.js';

/* global SITE */
// content.js is a classic script, so its top-level const is a global visible here
export const CONTENT = SITE;

export const SUN = {
  label: SITE.sun.label,
  desc:  SITE.sun.desc,
  color: hexRgb(SITE.sun.color),
  r:     SITE.sun.r
};

export const PLANETS = SITE.planets.map((p,idx)=>({
  name:p.name, desc:p.desc, color:hexRgb(p.color), r:p.r, slug:slugify(p.name),
  a:p.a, e:p.e, period:p.period, rot:p.rot,
  pattern: p.pattern || 'glass', seed: idx+1,   // pattern:'none' to disable
  ring: p.ring ? {
    inner: p.ring.inner!=null ? p.ring.inner : 1.4,
    outer: p.ring.outer!=null ? p.ring.outer : 2.1,
    tilt:  p.ring.tilt!=null  ? p.ring.tilt  : 0.33,
    angle: p.ring.angle!=null ? p.ring.angle : -0.5,
    alpha: p.ring.alpha!=null ? p.ring.alpha : 1,
    color: hexRgb(p.ring.color || '#bfae8c')
  } : null,
  moons: p.moons.map(m=>({
    name:m.name, dr:m.dr, period:m.period, e:m.e, rot:m.rot,
    body:m.body, href:m.href||'#', links:m.links||null, slug:slugify(m.name),
    photos: m.photos || null,
    angle:m.rot, r: 7.2 + m.dr*0.012
  }))
}));

const ORBIT_SPEED = reduced ? 0 : 1;   // 1 = original, lower = calmer; 0 = frozen for reduced motion
PLANETS.forEach(p=>{
  p.b = p.a * Math.sqrt(1 - p.e*p.e);
  p.angle = p.rot * 1.7; // staggered phases
  p.angSpeed = (Math.PI*2)/p.period * ORBIT_SPEED;
  p.wx = 0; p.wy = 0;
  p.moons.forEach(m=>{
    m.b = m.dr * Math.sqrt(1 - m.e*m.e);
    m.angSpeed = (Math.PI*2)/m.period * ORBIT_SPEED;
    m.color = mix(p.color, {r:150,g:138,b:122}, 0.45);
    m.wx=0; m.wy=0;
  });
});

// constellations: stars in local 0..1 space (y down), edges by index
export const CONSTELLATIONS = [
  { // Orion
    ax:0.10, ay:0.32, scale:0.16, rot:0.05,
    stars:[[0.30,0.15],[0.62,0.18],[0.40,0.50],[0.50,0.53],[0.60,0.56],[0.34,0.88],[0.70,0.85]],
    edges:[[0,1],[0,2],[1,4],[2,3],[3,4],[2,5],[4,6]]
  },
  { // Ursa Major (Big Dipper)
    ax:0.70, ay:0.33, scale:0.18, rot:-0.06,
    stars:[[0.62,0.20],[0.62,0.42],[0.45,0.47],[0.46,0.27],[0.32,0.30],[0.18,0.37],[0.05,0.47]],
    edges:[[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]]
  },
  { // Cassiopeia (W)
    ax:0.92, ay:0.70, scale:0.17, rot:0.04,
    stars:[[0.05,0.30],[0.28,0.62],[0.50,0.25],[0.72,0.64],[0.95,0.28]],
    edges:[[0,1],[1,2],[2,3],[3,4]]
  },
  { // Cygnus (Northern Cross)
    ax:0.74, ay:0.87, scale:0.16, rot:-0.05,
    stars:[[0.50,0.05],[0.50,0.55],[0.50,0.95],[0.15,0.50],[0.85,0.45]],
    edges:[[0,1],[1,2],[3,1],[1,4]]
  },
  { // Lyra
    ax:0.49, ay:0.31, scale:0.09, rot:0.0,
    stars:[[0.50,0.08],[0.35,0.45],[0.64,0.50],[0.40,0.88],[0.69,0.92]],
    edges:[[0,1],[0,2],[1,3],[2,4],[3,4]]
  },
  { // Scorpius
    ax:0.53, ay:0.91, scale:0.18, rot:0.03,
    stars:[[0.12,0.10],[0.26,0.20],[0.40,0.30],[0.47,0.46],[0.52,0.62],[0.62,0.74],[0.74,0.77],[0.82,0.66]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7]]
  },
  { // Taurus
    ax:0.29, ay:0.09, scale:0.15, rot:0.0,
    stars:[[0.50,0.55],[0.40,0.48],[0.30,0.38],[0.18,0.20],[0.58,0.48],[0.70,0.38],[0.85,0.22]],
    edges:[[0,1],[1,2],[2,3],[0,4],[4,5],[5,6]]
  },
  { // Pegasus + Andromeda chain
    ax:0.53, ay:0.12, scale:0.16, rot:-0.03,
    stars:[[0.30,0.22],[0.68,0.20],[0.70,0.58],[0.32,0.60],[0.90,0.12],[0.82,0.40]],
    edges:[[0,1],[1,2],[2,3],[3,0],[1,5],[5,4]]
  },
  { // Bootes (kite)
    ax:0.93, ay:0.34, scale:0.15, rot:0.04,
    stars:[[0.50,0.92],[0.34,0.62],[0.30,0.38],[0.50,0.18],[0.70,0.34],[0.66,0.60]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,5]]
  },
  { // Crux (Southern Cross)
    ax:0.93, ay:0.91, scale:0.07, rot:0.0,
    stars:[[0.50,0.05],[0.50,0.95],[0.15,0.55],[0.85,0.45]],
    edges:[[0,1],[2,3]]
  },
  { // Ursa Minor (Little Dipper)
    ax:0.94, ay:0.14, scale:0.15, rot:0.06,
    stars:[[0.20,0.85],[0.32,0.66],[0.44,0.48],[0.56,0.40],[0.68,0.30],[0.70,0.52],[0.58,0.60]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  { // Draco (winding)
    ax:0.31, ay:0.68, scale:0.18, rot:0.0,
    stars:[[0.10,0.80],[0.22,0.62],[0.30,0.45],[0.42,0.35],[0.55,0.40],[0.60,0.55],[0.52,0.68],[0.62,0.78],[0.78,0.72],[0.86,0.55],[0.78,0.40]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,8]]
  },
  { // Cepheus (house)
    ax:0.34, ay:0.28, scale:0.11, rot:-0.05,
    stars:[[0.50,0.10],[0.20,0.40],[0.25,0.80],[0.75,0.80],[0.80,0.40]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,0]]
  },
  { // Perseus
    ax:0.31, ay:0.53, scale:0.14, rot:0.04,
    stars:[[0.50,0.10],[0.45,0.35],[0.40,0.55],[0.30,0.75],[0.55,0.65],[0.65,0.80],[0.58,0.45]],
    edges:[[0,1],[1,2],[2,3],[2,4],[4,5],[1,6]]
  },
  { // Auriga (pentagon)
    ax:0.74, ay:0.09, scale:0.13, rot:0.0,
    stars:[[0.50,0.08],[0.78,0.35],[0.66,0.75],[0.30,0.78],[0.20,0.38]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,0]]
  },
  { // Canis Major
    ax:0.11, ay:0.90, scale:0.13, rot:-0.04,
    stars:[[0.40,0.30],[0.55,0.45],[0.45,0.60],[0.30,0.55],[0.65,0.70],[0.50,0.80],[0.70,0.40]],
    edges:[[0,1],[1,2],[2,3],[3,0],[2,4],[4,5],[1,6]]
  },
  { // Corona Borealis (arc)
    ax:0.52, ay:0.70, scale:0.08, rot:0.0,
    stars:[[0.10,0.50],[0.20,0.35],[0.35,0.28],[0.50,0.30],[0.65,0.38],[0.78,0.50],[0.88,0.66]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
  },
  { // Hercules (keystone)
    ax:0.72, ay:0.48, scale:0.12, rot:0.03,
    stars:[[0.40,0.35],[0.60,0.32],[0.66,0.55],[0.44,0.58],[0.30,0.18],[0.74,0.16],[0.24,0.78],[0.80,0.80]],
    edges:[[0,1],[1,2],[2,3],[3,0],[0,4],[1,5],[3,6],[2,7]]
  },
  { // Aquarius
    ax:0.07, ay:0.13, scale:0.14, rot:0.0,
    stars:[[0.15,0.40],[0.35,0.35],[0.50,0.45],[0.55,0.30],[0.68,0.40],[0.80,0.55],[0.60,0.60]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[2,6]]
  },
  { // Delphinus (small)
    ax:0.50, ay:0.49, scale:0.05, rot:0.0,
    stars:[[0.40,0.30],[0.55,0.22],[0.62,0.38],[0.48,0.46],[0.55,0.62]],
    edges:[[0,1],[1,2],[2,3],[3,0],[3,4]]
  },
  { // Aquila (eagle)
    ax:0.07, ay:0.70, scale:0.12, rot:0.03,
    stars:[[0.50,0.45],[0.50,0.20],[0.50,0.70],[0.28,0.40],[0.72,0.50],[0.20,0.30],[0.80,0.60]],
    edges:[[1,0],[0,2],[3,0],[0,4],[5,3],[4,6]]
  },
  { // Corvus (the crow)
    ax:0.71, ay:0.71, scale:0.10, rot:-0.04,
    stars:[[0.30,0.20],[0.65,0.25],[0.72,0.65],[0.38,0.70],[0.20,0.45]],
    edges:[[0,1],[1,2],[2,3],[3,0],[3,4]]
  },
  { // Andromeda
    ax:0.40, ay:0.20, scale:0.16, rot:0.03,
    stars:[[0.08,0.55],[0.30,0.50],[0.52,0.45],[0.72,0.38],[0.90,0.28],[0.60,0.65]],
    edges:[[0,1],[1,2],[2,3],[3,4],[2,5]]
  },
  { // Ophiuchus
    ax:0.55, ay:0.55, scale:0.16, rot:0.0,
    stars:[[0.50,0.08],[0.68,0.30],[0.60,0.60],[0.40,0.70],[0.22,0.55],[0.20,0.30],[0.35,0.40]],
    edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[4,6]]
  },
  { // Triangulum
    ax:0.60, ay:0.30, scale:0.09, rot:0.0,
    stars:[[0.20,0.70],[0.80,0.60],[0.50,0.20]],
    edges:[[0,1],[1,2],[2,0]]
  },
  { // Sagitta (the arrow)
    ax:0.45, ay:0.45, scale:0.07, rot:0.0,
    stars:[[0.10,0.55],[0.45,0.48],[0.80,0.40],[0.62,0.62]],
    edges:[[0,1],[1,2],[1,3]]
  },
  { // Lacerta
    ax:0.35, ay:0.62, scale:0.11, rot:0.0,
    stars:[[0.10,0.30],[0.30,0.60],[0.48,0.35],[0.66,0.62],[0.86,0.35]],
    edges:[[0,1],[1,2],[2,3],[3,4]]
  },
  { // Canis Minor
    ax:0.20, ay:0.40, scale:0.07, rot:0.0,
    stars:[[0.30,0.65],[0.70,0.35]],
    edges:[[0,1]]
  }
];
// name + member stars per constellation, same order as CONSTELLATIONS
export const CONST_INFO = [
  { name:'Orion',          stars:['Betelgeuse','Bellatrix','Alnitak','Alnilam','Mintaka','Saiph','Rigel'] },
  { name:'Ursa Major',     stars:['Dubhe','Merak','Phecda','Megrez','Alioth','Mizar','Alkaid'] },
  { name:'Cassiopeia',     stars:['Caph','Schedar','Cih','Ruchbah','Segin'] },
  { name:'Cygnus',         stars:['Deneb','Sadr','Albireo','Gienah','Fawaris'] },
  { name:'Lyra',           stars:['Vega','Sheliak','Sulafat','Aladfar','Zeta Lyrae'] },
  { name:'Scorpius',       stars:['Dschubba','Acrab','Fang','Antares','Alniyat','Larawag','Sargas','Shaula'] },
  { name:'Taurus',         stars:['Aldebaran','Elnath','Ain','Chamukuy','Prima Hyadum','Secunda Hyadum','Tianguan'] },
  { name:'Pegasus',        stars:['Markab','Scheat','Algenib','Enif','Alpheratz','Matar'] },
  { name:'Boötes',         stars:['Arcturus','Izar','Muphrid','Seginus','Nekkar','Rho Boötis'] },
  { name:'Crux',           stars:['Acrux','Mimosa','Gacrux','Imai'] },
  { name:'Ursa Minor',     stars:['Polaris','Yildun','Epsilon UMi','Zeta UMi','Pherkad','Kochab','Anwar al Farkadain'] },
  { name:'Draco',          stars:['Thuban','Eltanin','Rastaban','Altais','Aldhibah','Edasich','Grumium','Tyl','Giausar','Athebyne','Dziban'] },
  { name:'Cepheus',        stars:['Alderamin','Alfirk','Errai','Kurhah','Zeta Cephei'] },
  { name:'Perseus',        stars:['Mirfak','Algol','Atik','Menkib','Miram','Gorgonea Tertia','Misam'] },
  { name:'Auriga',         stars:['Capella','Menkalinan','Mahasim','Hassaleh','Almaaz'] },
  { name:'Canis Major',    stars:['Sirius','Mirzam','Muliphein','Wezen','Adhara','Aludra','Furud'] },
  { name:'Corona Borealis',stars:['Alphecca','Nusakan','Theta CrB','Gamma CrB','Delta CrB','Epsilon CrB','Iota CrB'] },
  { name:'Hercules',       stars:['Kornephoros','Rasalgethi','Sarin','Maasym','Zeta Herculis','Pi Herculis','Eta Herculis','Mu Herculis'] },
  { name:'Aquarius',       stars:['Sadalsuud','Sadalmelik','Skat','Albali','Sadachbia','Ancha','Hydor'] },
  { name:'Delphinus',      stars:['Rotanev','Sualocin','Deneb Dulfim','Delta Delphini','Aldulfin'] },
  { name:'Aquila',         stars:['Altair','Tarazed','Alshain','Okab','Deneb el Okab','Al Thalimain','Bezek'] },
  { name:'Corvus',         stars:['Alchiba','Kraz','Gienah Corvi','Algorab','Minkar'] },
  { name:'Andromeda',      stars:['Alpheratz','Delta Andromedae','Mirach','Mu Andromedae','Almach','Nu Andromedae'] },
  { name:'Ophiuchus',      stars:['Rasalhague','Cebalrai','Sabik','Theta Ophiuchi','Yed Prior','Yed Posterior','Han'] },
  { name:'Triangulum',     stars:['Mothallah','Beta Trianguli','Gamma Trianguli'] },
  { name:'Sagitta',        stars:['Sham','Beta Sagittae','Gamma Sagittae','Delta Sagittae'] },
  { name:'Lacerta',        stars:['Alpha Lacertae','4 Lacertae','Beta Lacertae','5 Lacertae','2 Lacertae'] },
  { name:'Canis Minor',    stars:['Procyon','Gomeisa'] }
];
