/* Router and keyboard integration tests. env.mjs supplies a small simulated DOM. */
import { windowDispatch } from './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS } from '../engine/astro.js';
import { state } from '../engine/state.js';
import { moonOpen } from '../engine/ui.js';

test('malformed URL fragments do not stop boot or subsequent navigation', async () => {
  const planet = PLANETS.find(p => p.moons.length);
  const moon = planet.moons[0];
  let frameRequests = 0;
  globalThis.requestAnimationFrame = () => { frameRequests++; };

  location.hash = '#%';
  await import('../orrery.js');
  assert.equal(frameRequests, 1, 'the first animation frame is scheduled');
  assert.equal(location.hash, '');
  assert.equal(state.mode, 'system');

  const link = `#${planet.slug}/${moon.slug}`;
  location.hash = link;
  windowDispatch('hashchange');
  assert.equal(state.focused, planet);
  assert.equal(state.openMoonObj, moon);
  assert.ok(moonOpen());

  location.hash = `#${planet.slug}/%E0%A4%A`;
  windowDispatch('hashchange');
  assert.equal(location.hash, '');
  assert.equal(state.mode, 'system');
  assert.equal(state.focused, null);
  assert.equal(moonOpen(), false);

  location.hash = link;
  windowDispatch('hashchange');
  windowDispatch('keydown', { key: 'Escape' });
  assert.equal(location.hash, `#${planet.slug}`);
  assert.equal(state.focused, planet);
  assert.equal(moonOpen(), false);
  windowDispatch('keydown', { key: 'Escape' });
  assert.equal(location.hash, '');
  assert.equal(state.mode, 'system');
});
