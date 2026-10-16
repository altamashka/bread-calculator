#!/usr/bin/env bash
# Host-side backup; requires the existing user's Docker access. Never use sudo.
set -euo pipefail
umask 077
backup_dir="${BREAD_BACKUP_DIR:-$HOME/backups/bread-calculator/scheduled}"
container="${BREAD_CONTAINER:-bread-calculator-bread-calculator-1}"
volume="${BREAD_VOLUME:-bread-calculator_recipes}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
exec 9>"$backup_dir/.lock"
flock -n 9 || exit 0
image=$(docker inspect --format '{{.Config.Image}}' "$container")
actual_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}' "$container")
[[ "$actual_volume" == "$volume" ]] || { echo 'Bread data volume does not match; backup stopped.' >&2; exit 1; }
[[ "$(docker inspect --format '{{.State.Running}} {{.State.Paused}}' "$container")" == 'true false' ]] || { echo 'Bread must be running and unpaused.' >&2; exit 1; }
archive="bread-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
paused=0
cleanup() {
  if [[ "$paused" == 1 ]]; then docker unpause "$container" >/dev/null; fi
  if [[ -f "$backup_dir/$archive.partial" ]]; then unlink "$backup_dir/$archive.partial"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Pause only Bread while taking a consistent full-volume snapshot.
docker pause "$container" >/dev/null
paused=1
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user node --entrypoint tar --mount "type=volume,src=$volume,dst=/source,readonly" \
  "$image" -C /source -czf - . > "$backup_dir/$archive.partial"
docker unpause "$container" >/dev/null
paused=0
# Read the whole compressed stream before publishing a backup as complete.
gzip -t "$backup_dir/$archive.partial"
tar -tzf "$backup_dir/$archive.partial" >/dev/null
mv "$backup_dir/$archive.partial" "$backup_dir/$archive"
(cd "$backup_dir" && sha256sum "$archive" > "$archive.sha256")
# Only this script's complete timestamped archives are eligible for retention.
mapfile -t archives < <(find "$backup_dir" -maxdepth 1 -type f -name 'bread-????????T??????Z.tar.gz' -printf '%f\n' | sort -r)
for ((i=30; i<${#archives[@]}; i++)); do
  unlink "$backup_dir/${archives[i]}"
  if [[ -f "$backup_dir/${archives[i]}.sha256" ]]; then unlink "$backup_dir/${archives[i]}.sha256"; fi
done
printf 'Bread backup verified: %s\n' "$archive"
