import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/auto-deploy.sh');
const digest = 'ghcr.io/altamashka/bread-calculator@sha256:' + 'a'.repeat(64);
for (const scenario of ['success', 'unchanged', 'pull-fails', 'backup-fails', 'unhealthy', 'config-fails', 'wrong-volume']) {
  test(`automatic deployment: ${scenario}`, async t => {
    const dir = await mkdtemp(`${tmpdir()}/bread-deploy-`);
    t.after(() => rm(dir, { recursive: true }));
    await mkdir(`${dir}/bin`);
    await mkdir(`${dir}/state`);
    await mkdir(`${dir}/scheduled`);
    await writeFile(`${dir}/active`, scenario === 'unchanged' ? 'candidate' : 'previous');
    // Fake only host commands. Real gzip/tar/checksum verify the produced backup.
    const fake = `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const a = process.argv.slice(2), dir = process.env.FIXTURE, scenario = process.env.SCENARIO;
fs.appendFileSync(dir+'/calls', JSON.stringify(a)+'\\n');
const active = () => fs.readFileSync(dir+'/active','utf8');
if (a[0] === 'pull') process.exit(scenario === 'pull-fails' ? 1 : 0);
if (a[0] === 'image') { console.log(a.includes('{{.Id}}') ? 'candidate' : ${JSON.stringify(digest)}); process.exit(0); }
if (a[0] === 'inspect') {
 const f = a[2];
 console.log(f === '{{.Image}}' ? active() : f.includes('Running') ? 'true false' : f.includes('Mounts') ? (scenario === 'wrong-volume' ? 'other' : 'bread-calculator_recipes') : (scenario === 'unhealthy' && active() === 'candidate' ? 'unhealthy' : 'healthy'));
 process.exit(0);
}
if (a[0] === 'compose') {
 if (a.includes('config')) process.exit(scenario === 'config-fails' ? 1 : 0);
 const override = fs.readFileSync(dir+'/state/image.yaml','utf8');
 fs.writeFileSync(dir+'/active', override.includes('sha256:') ? 'candidate' : 'previous');
 process.exit(0);
}
if (a[0] === 'run') {
 if (scenario === 'backup-fails') process.exit(1);
 fs.writeSync(1, require('node:zlib').gzipSync(cp.execFileSync('tar',['-cf','-','--files-from','/dev/null'])));
 process.exit(0);
}
if (!['pause','unpause'].includes(a[0])) process.exit(2);
`;
    await writeFile(`${dir}/bin/docker`, fake, { mode: 0o700 });
    // Avoid waiting on health retries and network calls in fixture tests.
    for (const command of ['curl', 'sleep', 'flock'])
      await writeFile(`${dir}/bin/${command}`, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const res = spawnSync('bash', [script], {
      env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, FIXTURE: dir, SCENARIO: scenario, BREAD_DEPLOY_STATE: `${dir}/state`, BREAD_BACKUP_DIR: `${dir}/scheduled`, BREAD_DEPLOY_WRAPPER: `${dir}/wrapper.yaml` }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(res.status, ['success', 'unchanged'].includes(scenario) ? 0 : 1, res.stderr);
    const calls = (await readFile(`${dir}/calls`, 'utf8')).trim().split('\n').map(JSON.parse);
    const updates = calls.filter(a => a[0] === 'compose' && a.includes('up'));
    assert.equal(updates.length, scenario === 'success' ? 1 : scenario === 'unhealthy' ? 2 : 0);
    assert.equal(await readFile(`${dir}/active`, 'utf8'), ['success','unchanged'].includes(scenario) ? 'candidate' : 'previous');
    if (['backup-fails','unhealthy','success'].includes(scenario)) {
      assert.ok(calls.some(a => a[0] === 'unpause'));
      assert.ok(calls.some(a => a[0] === 'run' && a.includes('none') && a.includes('--read-only')));
    }
    if (scenario === 'unhealthy') {
      assert.match(await readFile(`${dir}/state/image.yaml`, 'utf8'), /previous/);
      assert.match(res.stderr, /Previous Bread image restored/);
      assert.equal((await readFile(`${dir}/state/failed-image`, 'utf8')).trim(), digest);
      const retry = spawnSync('bash', [script], {
        env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}`, FIXTURE: dir, SCENARIO: scenario, BREAD_DEPLOY_STATE: `${dir}/state`, BREAD_BACKUP_DIR: `${dir}/scheduled`, BREAD_DEPLOY_WRAPPER: `${dir}/wrapper.yaml` }, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(retry.status, 1);
      assert.match(retry.stderr, /previously failed/);
      const after = (await readFile(`${dir}/calls`, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(after.filter(a => a[0] === 'compose' && a.includes('up')).length, 2);
    }
    for (const args of updates) {
      assert.ok(args.includes('--no-deps'));
      assert.ok(args.includes('--no-build'));
      assert.deepEqual(args.slice(-1), ['bread-calculator']);
    }
  });
}
