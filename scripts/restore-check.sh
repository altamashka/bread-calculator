#!/usr/bin/env bash
# Restore only to a fresh, isolated volume. Never mounts the production volume.
set -euo pipefail
umask 077
archive=$(realpath "${1:?Pass a protected bread backup archive}")
image="${2:?Pass the bread image to check}"
(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
name="bread-restore-check-$(date -u +%Y%m%dT%H%M%SZ)-$$"
if docker volume inspect "$name" >/dev/null 2>&1; then echo 'Restore volume already exists.' >&2; exit 1; fi
docker volume create --label bread.restore-check=true "$name" >/dev/null
# Mount at /app/data so Docker initializes ownership from the non-root image.
docker run --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=volume,src=$name,dst=/app/data" --entrypoint tar "$image" -C /app/data -xzf - < "$archive"
docker run -d --name "$name" --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp --mount "type=volume,src=$name,dst=/app/data" "$image" >/dev/null
cleanup() { docker stop "$name" >/dev/null; }
trap cleanup EXIT
# No ports, network, Mealie URL or token. Only read APIs are exercised.
for attempt in $(seq 1 30); do
  if docker exec "$name" node -e 'fetch("http://127.0.0.1:8080/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then break; fi
  sleep 1
done
docker exec -i "$name" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {validate,calculate,validateBlend} from './public/math.mjs';
import {validateMethod} from './public/methods-model.mjs';
import {validateBake} from './public/bakes-model.mjs';
import {validateBakeSession} from './public/bake-mode-model.mjs';
const base='http://127.0.0.1:8080';
const get=async path=>{const r=await fetch(base+path);assert.equal(r.status,200);return r.json()};
assert.equal((await get('/api/config')).mealie,false);
const archive=await get('/api/archive');
const pattern=/^[0-9a-f-]{36}\.json$/;
for (const [collection,directory,field,check,endpoint=collection] of [
  ['blends','/app/data/blends','blend',validateBlend],['recipes','/app/data','recipe',validate],['methods','/app/data/methods','method',validateMethod],['bakes','/app/data/bakes','bake',validateBake],
  ['bakeSessions','/app/data/bake-sessions','session',validateBakeSession,'bake-sessions']]) {
  const names=(await readdir(directory)).filter(n=>pattern.test(n));
  const disk=await Promise.all(names.map(async n=>JSON.parse(await readFile(`${directory}/${n}`,'utf8'))));
  const sorted=rows=>rows.sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(sorted(archive[collection]),sorted(disk));
  assert.deepEqual(sorted(await get('/api/'+endpoint)),sorted(disk));
  for (const record of disk) {
    check(record[field]);
    if(field==='recipe') assert.ok(Number.isFinite(calculate(record.recipe).hydration));
  }
  console.log(`${collection}: ${disk.length} restored records verified, including complete snapshots and link metadata`);
}
for (const path of ['/','/methods','/bakes']) assert.equal((await fetch(base+path)).status,200);
JS
printf 'Restore verified. Isolated container and volume retained (stopped): %s\n' "$name"
