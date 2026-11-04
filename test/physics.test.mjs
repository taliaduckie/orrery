/* physics.test.mjs — engine/simulation.js, driven through the real game loop.
   The invariant that matters most: a course's drawn line is a launch that was
   integrated through the frozen field at SIM_H, and the aim prediction and the
   live run (game.tickGame) integrate the same way, so following the line wins.
   Run: node --test test/ */
import './env.mjs';
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../engine/utils.js';
import { SUN, PLANETS } from '../engine/astro.js';
import { state, view, target, game } from '../engine/state.js';
import { ellipsePos, updateOrbits, updateCamera, G, SUN_MASS, SIM_H, SIM_SPEED,
         gravityAt, escaped, hitsBody, buildCourse, predictPath } from '../engine/simulation.js';
import { LEVELS, tickGame } from '../engine/game.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b} (eps ${eps})`);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

function resetGame(){
  Object.assign(game, { on:false, aiming:false, aim:null, firstPull:true, simAcc:0, course:null, comet:null,
    gateIdx:0, tries:0, runMsg:'', lastHint:'', traceT:0, winT:0, pendingNext:false, freeShoot:false, savedCourse:null, level:0 });
  game.bodies.length = 0;
}
function resetFocus(){ state.focused = null; state.hoverObj = null; state.openMoonObj = null; state.mode = 'system'; }
// what enterGame relies on: bodies placed, then the field frozen
function freezeField(){ game.on = false; updateOrbits(0); game.on = true; }
const angles = () => PLANETS.map(p => [p.angle, ...p.moons.map(m => m.angle)]);

/* the course does not store its launch velocity, but pts[1] was produced from
   pts[0] by exactly one SIM_H step, so the velocity can be read back off it */
function launchOf(course){
  const p0 = course.pts[0], p1 = course.pts[1], g = gravityAt(p0.x, p0.y);
  return { vx: (p1.x - p0.x)/SIM_H - g.ax*SIM_H, vy: (p1.y - p0.y)/SIM_H - g.ay*SIM_H };
}

describe('ellipsePos', () => {
  test('a circle is a circle', () => {
    const p = ellipsePos(10, 10, Math.PI/2, 0);
    near(p.x, 0, 1e-12, 'x'); near(p.y, 10, 1e-12, 'y');
  });
  test('rot turns the ellipse', () => {
    const p = ellipsePos(10, 5, 0, Math.PI/2);
    near(p.x, 0, 1e-12, 'x'); near(p.y, 10, 1e-12, 'y');
  });
});

describe('gravityAt', () => {
  before(() => { resetGame(); resetFocus(); updateOrbits(0); });
  test('finite at the sun and at every planet centre (softening)', () => {
    for(const [x, y] of [[0, 0], ...PLANETS.map(p => [p.wx, p.wy])]){
      const g = gravityAt(x, y);
      assert.ok(Number.isFinite(g.ax) && Number.isFinite(g.ay), `at ${x},${y}`);
    }
  });
  test('far away it is the sun, roughly Newtonian, falling off as 1/r²', () => {
    const r = 8000, g1 = gravityAt(r, 0), g2 = gravityAt(2*r, 0);
    assert.ok(g1.ax < 0, 'pulls toward the origin');
    assert.ok(Math.abs(g1.ay) < 0.1*Math.abs(g1.ax), 'and not much sideways');
    const sunOnly = G*SUN_MASS/(r*r), mag1 = Math.hypot(g1.ax, g1.ay), mag2 = Math.hypot(g2.ax, g2.ay);
    assert.ok(mag1 > sunOnly*0.9 && mag1 < sunOnly*1.6, `magnitude ${mag1} vs sun-only ${sunOnly} (planets add a bit)`);
    assert.ok(mag1/mag2 > 3.6 && mag1/mag2 < 4.4, `inverse square: ratio ${mag1/mag2}`);
  });
  test('next to a planet, the planet wins', () => {
    const p = PLANETS.reduce((a, b) => (a.r > b.r ? a : b));
    const d = p.r*1.15 + 5, len = Math.hypot(p.wx, p.wy);
    const x = p.wx + p.wx/len*d, y = p.wy + p.wy/len*d;   // just outside it, on the far side from the sun
    const g = gravityAt(x, y);
    const toPlanet = Math.atan2(p.wy - y, p.wx - x), got = Math.atan2(g.ay, g.ax);
    let diff = Math.abs(toPlanet - got); if(diff > Math.PI) diff = 2*Math.PI - diff;
    assert.ok(diff < 0.25, `pull is ${diff.toFixed(3)} rad off the planet`);
  });
  test('the field holds still while the game is on', () => {
    const before = PLANETS.map(p => [p.wx, p.wy]);
    game.on = true; updateOrbits(1);
    assert.deepEqual(PLANETS.map(p => [p.wx, p.wy]), before);
    game.on = false; updateOrbits(1);
    assert.notDeepEqual(PLANETS.map(p => [p.wx, p.wy]), before);
  });
});

describe('escaped', () => {
  const R = 1000;
  test('outside the boundary and heading out', () => assert.equal(escaped(R + 1, 0, 1, 0, R), true));
  test('outside but falling back in is not gone', () => assert.equal(escaped(R + 1, 0, -1, 0, R), false));
  test('inside is never gone', () => assert.equal(escaped(R - 1, 0, 1, 0, R), false));
  test('any direction', () => assert.equal(escaped(0, -(R + 1), 0, -1, R), true));
});

describe('hitsBody', () => {
  before(() => { resetGame(); resetFocus(); updateOrbits(0); });
  test('the sun', () => {
    assert.equal(hitsBody(0, 0), true);
    assert.equal(hitsBody(SUN.r*0.95 + 1, 0), false);
  });
  test('every planet centre', () => {
    for(const p of PLANETS) assert.equal(hitsBody(p.wx, p.wy), true, p.name);
  });
  test('empty space', () => assert.equal(hitsBody(0, 5000), false));
});

describe('updateOrbits', () => {
  beforeEach(() => { resetGame(); resetFocus(); });
  test('bodies stay on their ellipses', () => {
    updateOrbits(0.5);
    for(const p of PLANETS){
      const r = Math.hypot(p.wx, p.wy);
      assert.ok(r >= p.a*(1 - p.e) - 1e-6 && r <= p.a*(1 + p.e) + 1e-6, `${p.name} at ${r}`);
      for(const m of p.moons){
        const d = Math.hypot(m.wx - p.wx, m.wy - p.wy);
        assert.ok(d >= m.dr*(1 - m.e) - 1e-6 && d <= m.dr*(1 + m.e) + 1e-6, `${m.name} at ${d} from ${p.name}`);
      }
    }
  });
  test('angles advance by angSpeed·dt', () => {
    const a0 = PLANETS.map(p => p.angle);
    updateOrbits(2);
    PLANETS.forEach((p, i) => near(p.angle, a0[i] + p.angSpeed*2, 1e-12, p.name));
    assert.ok(PLANETS.every(p => p.angSpeed > 0), 'not reduced motion in tests');
  });
  test('a focused planet holds still, the rest move', () => {
    state.focused = PLANETS[2]; state.mode = 'planet';
    const a0 = angles(); updateOrbits(1); const a1 = angles();
    PLANETS.forEach((p, i) => {
      if(i === 2) assert.equal(a1[i][0], a0[i][0], 'focused frozen');
      else assert.notEqual(a1[i][0], a0[i][0], p.name + ' moves');
    });
  });
  test('a hovered planet holds still', () => {
    state.hoverObj = { type:'planet', obj:PLANETS[4] };
    const a0 = PLANETS[4].angle; updateOrbits(1);
    assert.equal(PLANETS[4].angle, a0);
  });
  test('an open or hovered moon holds its orbit while its planet keeps going', () => {
    const p = PLANETS[1], m = p.moons[1];
    state.openMoonObj = m;
    const pa = p.angle, ma = m.angle, other = p.moons[0].angle;
    updateOrbits(1);
    assert.equal(m.angle, ma, 'open moon frozen');
    assert.notEqual(p.angle, pa, 'planet moves');
    assert.notEqual(p.moons[0].angle, other, 'sibling moon moves');
    state.openMoonObj = null; state.hoverObj = { type:'moon', obj:m };
    updateOrbits(1);
    assert.equal(m.angle, ma, 'hovered moon frozen');
  });
  test('game on freezes everything', () => {
    game.on = true;
    const a0 = angles(); updateOrbits(1);
    assert.deepEqual(angles(), a0);
  });
});

describe('updateCamera', () => {
  beforeEach(() => { resetGame(); resetFocus(); Object.assign(view, { scale:1, cx:0, cy:0 }); Object.assign(target, { scale:1, cx:0, cy:0 }); });
  test('the view eases onto the target', () => {
    Object.assign(target, { scale:2.5, cx:300, cy:-120 });
    updateCamera(1/60);
    assert.ok(view.cx > 0 && view.cx < 300, 'part way after one frame: ' + view.cx);
    for(let i = 0; i < 600; i++) updateCamera(1/60);
    near(view.scale, 2.5, 1e-3, 'scale'); near(view.cx, 300, 1e-3, 'cx'); near(view.cy, -120, 1e-3, 'cy');
  });
  test('a focused planet drags the target with it', () => {
    updateOrbits(0);
    state.focused = PLANETS[3]; state.mode = 'planet';
    updateCamera(1/60);
    assert.equal(target.cx, PLANETS[3].wx); assert.equal(target.cy, PLANETS[3].wy);
    updateOrbits(1); updateCamera(1/60);   // focused planet is frozen, so the target should not move either
    assert.equal(target.cx, PLANETS[3].wx);
  });
});

describe('LEVELS', () => {
  test('four routes, each harder than the last', () => {
    assert.equal(LEVELS.length, 4);
    for(let i = 1; i < LEVELS.length; i++){
      const a = LEVELS[i - 1], b = LEVELS[i];
      assert.ok(b.turn > a.turn, `level ${i} turns more`);
      assert.ok(b.gate < a.gate, `level ${i} rings are smaller`);
      assert.ok(b.preview < a.preview, `level ${i} predicts less`);
    }
  });
});

describe('courses: the drawn line is a launch that wins', () => {
  const realRandom = Math.random;
  before(() => { resetGame(); resetFocus(); freezeField(); });
  after(() => { Math.random = realRandom; resetGame(); });

  const SEEDS = [1, 2, 3];
  for(const seed of SEEDS) LEVELS.forEach((L, lv) => {
    test(`level ${lv + 1}, seed ${seed}`, () => {
      Math.random = rng(seed*31 + lv);
      const course = buildCourse(L);
      assert.ok(course, 'buildCourse found a route');
      const { pts, gates, start } = course;

      // shape
      assert.ok(gates.length >= 5, `${gates.length} gates`);
      assert.equal(course.gateR, L.gate); assert.equal(course.preview, L.preview);
      assert.deepEqual(pts[0], start, 'the line starts at the anchor');
      const reach = Math.max(...PLANETS.map(p => p.a*(1 + p.e) + p.r));
      assert.ok(Math.hypot(start.x, start.y) > reach, 'the anchor sits outside the last orbit');
      assert.ok(course.outR > Math.hypot(start.x, start.y), 'and inside the escape boundary');
      near(course.viewR, Math.max(...pts.map(q => Math.hypot(q.x, q.y))), 1e-9, 'viewR is the line\'s reach');

      // gates sit on the line, in order, and the line never touches a body
      let last = -1;
      for(const g of gates){
        const i = pts.findIndex((q, k) => k > last && dist(q, g) < 1e-9);
        assert.ok(i > last, 'gate is on the line, after the previous gate');
        last = i;
      }
      assert.ok(!pts.some(q => hitsBody(q.x, q.y)), 'no point of the line is inside a body');

      // the aim prediction steps the same field at the same SIM_H, so its dots lie on the line
      const v0 = launchOf(course);
      const dots = predictPath(course, v0.vx, v0.vy, pts.length - 1);
      assert.equal(dots.length, Math.ceil((pts.length - 1)/22), 'prediction ran the whole line without dying');
      let worst = 0;
      dots.forEach((d, k) => { worst = Math.max(worst, dist(d, pts[22*k + 1])); });
      assert.ok(worst < 1e-6, `prediction strays ${worst} from the line`);

      // the live run: feed the recovered launch through tickGame and it should clear every ring
      game.course = course; game.level = lv; game.gateIdx = 0; game.tries = 0; game.winT = 0; game.simAcc = 0; game.pendingNext = false;
      for(const g of gates) g.hit = false;
      game.comet = { x:start.x, y:start.y, vx:v0.vx, vy:v0.vy, trail:[] };
      const STEPS_PER_TICK = 10, dt = (STEPS_PER_TICK*SIM_H + 1e-9)/SIM_SPEED;
      let stray = 0, ticks = 0;
      while(game.comet && ticks < 5000){
        tickGame(dt); ticks++;
        const k = ticks*STEPS_PER_TICK;
        if(game.comet && k < pts.length) stray = Math.max(stray, dist(game.comet, pts[k]));
      }
      assert.equal(game.tries, 0, 'the run never crashed or escaped: ' + game.runMsg);
      assert.ok(game.winT > 0, 'the run won');
      assert.equal(game.gateIdx, gates.length); assert.ok(gates.every(g => g.hit), 'every ring hit');
      assert.ok(stray < 1e-6, `live run strays ${stray} from the line`);
      game.winT = 0; game.pendingNext = false;   // don't let tickGame advance levels on its own
    });
  });

  test('and a wrong launch does not win (the test can fail)', () => {
    Math.random = rng(99);
    const course = buildCourse(LEVELS[0]);
    const v0 = launchOf(course);
    game.course = course; game.level = 0; game.gateIdx = 0; game.tries = 0; game.winT = 0; game.simAcc = 0;
    for(const g of course.gates) g.hit = false;
    game.comet = { x:course.start.x, y:course.start.y, vx:v0.vx*0.6, vy:v0.vy*0.6, trail:[] };
    let ticks = 0;
    while(game.comet && ticks < 5000){ tickGame(1/60); ticks++; }
    assert.equal(game.winT, 0, 'did not win');
    assert.equal(game.tries, 1, 'failed once: ' + game.runMsg);
    assert.equal(game.gateIdx, 0, 'rings reset after a fail');
  });
});
