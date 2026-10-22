import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { defaults, validateBlend, applyBlend, calculate, scale, toQuery, fromQuery } from '../public/math.mjs';
import { validateBake } from '../public/bakes-model.mjs';

test('blend copies preserve mass, arbitrary starter hydration, links and historical bakes', () => {
  const blend = { name: 'House blend', wholeWheat: 20, rye: 10 };
  for (const hydration of [0, 50, 100, 250, 500]) {
    const original = { ...defaults(), starterHydration: hydration };
    const recipe = applyBlend(original, blend);
    assert.deepEqual(calculate(recipe), calculate(original));
    assert.deepEqual(fromQuery(toQuery(recipe)), recipe);
    const scaled = scale(recipe, 3940);
    assert.equal(scaled.wholeWheat, 20);
    assert.equal(scaled.rye, 10);
    assert.ok(Math.abs(calculate(scaled).dough - 3940) < 1e-9);
    const bake = validateBake({ date: '2026-10-22', recipe });
    const changed = applyBlend(recipe, { ...blend, wholeWheat: 40 });
    assert.equal(recipe.wholeWheat, 20);
    assert.equal(bake.recipe.wholeWheat, 20);
    assert.equal(changed.wholeWheat, 40);
  }
  assert.equal(calculate(defaults()).dough, 1970);
  assert.ok(Math.abs(calculate(defaults()).hydration - 77.27272727) < 1e-7);
});
test('blend validation rejects invalid proportions and strips unrelated fields', () => {
  const blend = { name: ' White ', wholeWheat: 0, rye: 0 };
  assert.deepEqual(validateBlend({ ...blend, flour: 999 }), { ...blend, name: 'White' });
  for (const bad of [null, [], {}, { ...blend, name: ' ' }, { ...blend, rye: '10' }, { ...blend, rye: NaN }, { ...blend, rye: -1 }, { ...blend, rye: 101 }, { ...blend, wholeWheat: 70, rye: 31 }])
    assert.throws(() => validateBlend(bad));
});
test('blend API persists across restart and archive includes updated preset without rewriting recipe', async t => {
  process.env.DATA_DIR = await mkdtemp(`${tmpdir()}/bread-blends-`);
  const { createServer } = await import('../server.mjs');
  let server;
  t.after(async () => { if (server) await new Promise(r => server.close(r)); await rm(process.env.DATA_DIR, { recursive: true }); });
  async function start() {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start();
  const post = async (path, value, expected = 200) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal(res.status, expected); return res.json();
  };
  const blend = { name: 'House', wholeWheat: 20, rye: 10 };
  const preset = await post('/api/blends', { blend });
  const recipe = await post('/api/recipes', { recipe: applyBlend(defaults(), blend) });
  await post('/api/blends', { id: preset.id, blend: { ...blend, rye: 30 } });
  await post('/api/blends', { blend: { ...blend, rye: 90 } }, 400);
  await new Promise(r => server.close(r));
  base = await start();
  const archive = await (await fetch(base + '/api/archive')).json();
  assert.equal(archive.blends.length, 1);
  assert.equal(archive.blends[0].blend.rye, 30);
  assert.deepEqual(archive.recipes[0], recipe);
  assert.deepEqual(await (await fetch(base + '/api/blends')).json(), archive.blends);
});
