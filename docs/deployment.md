# Deployment and recovery

[Back to README](../README.md) · [Reusable deployment pattern](automatic-deployment-guide.md)

## Recorded setup

These are recorded checks, not a fresh inspection of the server.

| Item | Recorded state |
| --- | --- |
| Host | `altamacmini`; app source at `~/apps/bread-calculator` |
| Deployment wrapper | `~/docker/bread-calculator/docker-compose.yml` in the server repository |
| Access | `127.0.0.1:8078`; private [Tailscale HTTPS](https://bread.tail10db36.ts.net), certificate and health verified 2026-10-15 |
| Data | Named volume `bread-calculator_recipes`; persistence across restart verified 2026-10-15 |
| Mealie | `http://mealie:9000` on Docker network `web`; existing credential reuse approved by Ben |
| Backups | Nightly schedule and isolated restore verified 2026-10-16 |
| Automatic updater | Implemented; server activation awaits approval |

The app has its own private repository; the server repository owns the wrapper. Keep loopback binding, private HTTPS, the non-root user, read-only root filesystem, dropped capabilities, resource limits, healthcheck and Watchtower exclusion.

Ask Ben before server administration, access changes or personal data deletion. No sudo. Do not restart unrelated services or save synthetic records to production. Historical acceptance work is in [issue #3](https://github.com/altamashka/bread-calculator/issues/3) and [backup issue #2](https://github.com/altamashka/bread-calculator/issues/2).

## Manual release

The editing Mac has no Docker installation; CI checks the real Linux image. After approval for server operations:

1. Review the merged commit and successful CI. Transfer that exact source to the clean server checkout and retain the previous commit/image.
2. Preserve the protected `.env` (mode 600), including `BREAD_REVISION` and Mealie settings. Set `BREAD_REVISION` to the reviewed commit for the locally built image.
3. Validate the server wrapper with `docker compose ... config --quiet`, build and recreate only `bread-calculator`.
4. Check `/healthz`, private HTTPS, Calculator, Methods, Bake log, baking view, flour blends, reload and the full archive. Use isolated data for write tests. When explicitly testing an existing Mealie link, verify the same remote ID and an unchanged repeat save.

The repository's local Compose checks are:

```sh
docker compose config --quiet
docker compose up -d --build bread-calculator
docker compose ps
curl -fsS http://127.0.0.1:8078/healthz
```

On the server, supply its wrapper path. **Once the automatic updater is active, every manual Compose operation must also include its image override**; see [automatic releases](#automatic-releases).

### Source transfer

The server has no HTTPS Git credential for this private repository. Initial rollout used an exact-commit Git bundle over SSH. For later manual updates, fetch merged `main` on the Mac, bundle it, transfer it, fetch into the clean server checkout and fast-forward `main`. Verify the commit before building. Do not add broader credentials as a workaround.

### Private access and Mealie

Before an approved Tailscale change, save `tailscale serve status` and `tailscale serve get-config` privately. Inspect installed help and preserve existing mappings. Never use `tailscale serve reset`. New service registration/access needs approval; verify HTTPS from the Mac and another Tailscale device.

An SSH tunnel is a development fallback:

```sh
ssh -N -L 8078:127.0.0.1:8078 altamacmini
```

Open [localhost:8078](http://127.0.0.1:8078); the tunnel does not provide phone HTTPS.

Use the existing authorized Mealie credential. A new profile token requires approval; never extract one from the database. Keep tokens server-only and preserve them during updates. Follow the [Mealie guide](mealie.md) for schema and identity requirements. Any approved live test recipe must remain unless Ben approves deletion.

## Scheduled backups

Configured on 2026-10-16 with Ben's approval. `scripts/backup.sh` is installed as `~/.local/bin/bread-backup` (700). It archives the entire data volume to `~/backups/bread-calculator/scheduled` (700); archives/checksums are 600. Credentials and existing manual/environment backups stay separate.

The existing user crontab runs at **03:30 Europe/Berlin**, handling both UTC offsets without changing the host timezone or other jobs:

```cron
30 1,2 * * * [ "$(TZ=Europe/Berlin date +\%H)" = 03 ] && /home/benmccash/.local/bin/bread-backup >> /home/benmccash/backups/bread-calculator/scheduled/backup.log 2>&1
```

Cron is used because user-systemd login lingering is off; the tested timer is disabled. The prior crontab is protected alongside backups.

The script locks, verifies the volume, briefly pauses only Bread, guarantees unpause on failure, verifies gzip/tar integrity and writes SHA-256. It retains 30 timestamped automatic copies; manual backups and failed logs are not pruned. Failures exit nonzero into the protected log. Inspect `backup.log`, archive age, `sha256sum -c <archive>.sha256` and `/healthz` after a missed backup. Same-disk backups do not protect against host-disk loss.

Run a fresh backup with `~/.local/bin/bread-backup`. Test an archive using the installed `scripts/restore-check.sh`:

```sh
~/.local/bin/bread-restore-check /absolute/protected/bread-YYYYMMDDTHHMMSSZ.tar.gz bread-calculator:<revision>
```

Keep its checksum sidecar adjacent. The helper creates a separate `bread-restore-check-<timestamp>-<pid>` volume/container with no network, ports, production mount or Mealie settings. It compares restored files with `/api/archive` and collection APIs, including snapshots and link metadata. It stops and retains the test container/volume for inspection.

The 2026-10-16 drill preserved three live recipes and Mealie identities. A second isolated drill used synthetic records to verify immutable recipe/method/bake snapshots after library edits. Production and remote recipes were untouched. Backup design follows [Docker's volume guidance](https://docs.docker.com/engine/storage/volumes/).

## Rollback and production restore

Before a data-format change or possible recipe rewrite, stop only Bread and archive the volume to protected storage; verify it before restarting. Run backup helpers offline as the application user, with source data mounted read-only. Protect a separate `.env` copy.

For image rollback, retain the previous image, validate Compose and recreate only Bread without `--build`. For local images, set the prior `BREAD_REVISION`; with the updater active, use its override instead. Check health and saved data. Never remove the volume or run `down -v`. Older images may not display newer collections or understand newer formats; schema-breaking changes need a migration/rollback plan.

Production data restoration is separate: obtain approval and take a fresh safety backup first. Do not switch production to a restore-test volume or automatically restore/delete data during image rollback.

## Automatic releases

CI publishes the **exact tested image** after successful `main` push checks to private `ghcr.io/altamashka/bread-calculator:<commit>` and `:main`. PRs/other branches never publish. Publication is serialized and skips superseded revisions; failure leaves the running server unchanged.

`scripts/auto-deploy.sh` polls from the host as the existing Docker-capable user, never root. It needs package-read access, not source access. A GHCR login was present on 2026-10-22; access to this package still needs verification.

### Activate after approval

1. Verify merged CI publication and private package access. Try `docker pull ghcr.io/altamashka/bread-calculator:main` with the existing login. If denied, stop before changing Bread and request narrowly scoped access.
2. Install the reviewed updater as `~/.local/bin/bread-auto-deploy` (700). Preserve the wrapper and `.env`.
3. Save a mode-600 crontab copy in `~/.local/state/bread-deploy/`, then add only this job:

   ```cron
   */5 * * * * /home/benmccash/.local/bin/bread-auto-deploy >> /home/benmccash/.local/state/bread-deploy/deploy.log 2>&1
   ```

4. Observe one run. Verify digest, health, private HTTPS, pages, saved data, archive, backup and protected credentials. Do not write synthetic records or call Mealie write APIs. Run again to verify no restart when unchanged.

### Updater behavior and recovery

The updater locks deployments and scheduled backups, pulls the candidate and exits if unchanged. It checks the running container/volume, validates Compose privately and verifies a complete pre-update archive plus SHA-256. Deployment backups are mode 600 under `~/.local/state/bread-deploy/`; backups and old images are retained without pruning. Monitor disk space.

`~/.local/state/bread-deploy/image.yaml` pins the digest. Compose uses the original wrapper plus this override with `--no-build --pull never --no-deps`, targeting only Bread. `.env` retains the historical locally built `BREAD_REVISION`; omitting the override can switch back to that image.

Failed replacement/health checks restore the previous local image without changing data and record `failed-image` to suppress repeated attempts. A newer digest can proceed. Rollback failure needs operator attention. Cron/log output is local reporting, not an external alert.

To stop updates, remove only the updater cron line. For manual rollback, pause that schedule, retain the override, set its image to the prior retained ID/digest, then run Compose with both files and verify health/HTTPS. After investigating a failed release, remove only `failed-image` for an intentional retry. Preserve backups and other jobs.
