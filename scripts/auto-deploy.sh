#!/usr/bin/env bash
# Installed host-side after approval. No Git/source or Mealie credentials needed.
set -euo pipefail
umask 077
registry_image=ghcr.io/altamashka/bread-calculator:main
wrapper="${BREAD_DEPLOY_WRAPPER:-$HOME/docker/bread-calculator/docker-compose.yml}"
state="${BREAD_DEPLOY_STATE:-$HOME/.local/state/bread-deploy}"
container="${BREAD_CONTAINER:-bread-calculator-bread-calculator-1}"
volume="${BREAD_VOLUME:-bread-calculator_recipes}"
mkdir -p "$state"
chmod 700 "$state"
exec 9>"$state/lock"
flock -n 9 || exit 0
# Share the scheduled backup lock; never race its pause/unpause sequence.
backup_dir="${BREAD_BACKUP_DIR:-$HOME/backups/bread-calculator/scheduled}"
mkdir -p "$backup_dir"
exec 8>"$backup_dir/.lock"
flock -w 120 8 || { echo 'Bread backup lock unavailable.' >&2; exit 1; }
# Pull before any interruption. Failed authentication cannot disturb the service.
docker pull "$registry_image" >/dev/null
image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$registry_image")
[[ "$image" =~ ^ghcr.io/altamashka/bread-calculator@sha256:[0-9a-f]{64}$ ]] || { echo 'Unexpected image digest.' >&2; exit 1; }
previous=$(docker inspect --format '{{.Image}}' "$container")
candidate=$(docker image inspect --format '{{.Id}}' "$image")
[[ "$previous" != "$candidate" ]] || exit 0
if [[ -f "$state/failed-image" && "$(cat "$state/failed-image")" == "$image" ]]; then
  echo 'This Bread image previously failed; operator review required before retry.' >&2
  exit 1
fi
[[ "$(docker inspect --format '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]] || { echo 'Bread must be running and unpaused.' >&2; exit 1; }
actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")
[[ "$actual_volume" == "$volume" ]] || { echo 'Unexpected Bread data volume.' >&2; exit 1; }
compose() { docker compose -f "$wrapper" -f "$state/image.yaml" "$@"; }
set_image() {
  printf 'services:\n  bread-calculator:\n    image: "%s"\n' "$1" > "$state/image.yaml.tmp"
  mv "$state/image.yaml.tmp" "$state/image.yaml"
}
# Validate the override before pausing. Never print resolved Compose secrets.
set_image "$image"
if ! compose config --quiet; then
  set_image "$previous"
  exit 1
fi
archive="$state/before-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
paused=0
switched=0
healthy() {
  for ((attempt=0; attempt<30; attempt++)); do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$container")" == healthy ]] &&
       curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8078/healthz &&
       curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8078/ &&
       curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8078/methods &&
       curl --max-time 5 --fail --silent --output /dev/null http://127.0.0.1:8078/bakes; then return 0; fi
    sleep 2
  done
  return 1
}
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$paused" == 1 ]]; then docker unpause "$container" >/dev/null || result=1; fi
  if [[ "$result" != 0 ]]; then
    set_image "$previous"
    if [[ "$switched" == 1 ]]; then
      printf '%s\n' "$image" > "$state/failed-image"
      echo 'Bread deployment failed; restoring previous image.' >&2
      if compose up -d --no-build --pull never --no-deps bread-calculator && healthy; then
        echo 'Previous Bread image restored. Data volume retained.' >&2
      else
        echo 'Bread rollback needs operator attention.' >&2
      fi
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Consistent backup with the old image, read-only source, no network or credentials.
docker pause "$container" >/dev/null
paused=1
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user node --entrypoint tar --mount "type=volume,src=$volume,dst=/source,readonly" \
  "$previous" -C /source -czf - . > "$archive.partial"
docker unpause "$container" >/dev/null
paused=0
gzip -t "$archive.partial"
tar -tzf "$archive.partial" >/dev/null
mv "$archive.partial" "$archive"
sha256sum "$archive" > "$archive.sha256"
switched=1
compose up -d --no-build --pull never --no-deps bread-calculator
healthy
rm -f "$state/failed-image"
printf 'Bread deployed: %s\n' "$image"
# Keep previous images and deployment backups for deliberate operator rollback.
