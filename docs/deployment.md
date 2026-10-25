# altamacmini deployment

The application lives in its own private GitHub repository. The server repository owns only the deployment wrapper and service documentation. The first application and deployment PRs are merged. The container is running on 127.0.0.1:8078. Health and original-recipe persistence across a container restart were verified on 2026-10-15. The private HTTPS endpoint `https://bread.tail10db36.ts.net` is approved and verified from the Mac, including its certificate and health endpoint. Mealie export is enabled and was verified on 2026-10-15: the original recipe is saved with its ingredient weights, two servings and hydration. Ben explicitly authorized reuse of the existing server-side Mealie credential.

## First rollout

Review the application PR and successful CI. On the server, check out its reviewed commit under `~/apps/bread-calculator`, retaining the revision for rollback. The server repository’s `bread-calculator/docker-compose.yml` uses that source as its build context. Validate the wrapper with `docker compose ... config --quiet`. Build an image tagged with the reviewed commit using `BREAD_REVISION=<commit>` and start only `bread-calculator` with the same setting. Check health, Calculator, Methods and Bake log, browser reload and the full JSON archive. Test new records with isolated data before deployment; do not add synthetic methods or bake logs to production. For the existing original recipe, verify that first linked Mealie sync retains the same remote ID and that repeating it reports no change. Keep the service private and disabled from Watchtower.

Docker administration requires Ben’s approval under the workspace rules. There is no local Docker installation on the editing Mac; CI builds and checks the actual Linux container. Do not use sudo.

## HTTPS and access

The port is `127.0.0.1:8078`. Before changing Tailscale Serve, save `tailscale serve status` and `tailscale serve get-config` privately on the host. Inspect the installed help and current service configuration. Register and approve a dedicated `bread` service in the admin console if required. Map its private HTTPS endpoint to this loopback port, preserving all existing mappings. Never use `tailscale serve reset`. New service registration/access needs Ben’s approval. Verify HTTPS from the Mac and from another Tailscale-connected device.

Until that registration is completed, an SSH tunnel is a private development fallback:

```sh
ssh -N -L 8078:127.0.0.1:8078 altamacmini
```

Open http://127.0.0.1:8078 on the Mac. This does not by itself provide a day-to-day phone HTTPS endpoint.

## Mealie

The live backend uses `http://mealie:9000` on the shared Docker `web` network. Its protected `.env` holds the authorized existing API credential; the browser receives only a configured/unconfigured flag. The original recipe is available in Mealie as `everyday-sourdough`. The import preserves gram weights as ingredient text and parses the yield as two servings. Scale in the bread calculator and save changes to update the linked Mealie recipe. An explicit duplicate creates a separate calculator recipe and must use a different Mealie name.

Create a user API token and store it in the server-only environment file. Token creation is an access change requiring Ben’s approval. Do not retrieve tokens from the Mealie database or commit any token. Configure the URL and token as described in README.md, recreate this container only, and send a named test recipe. Verify ingredients, actual hydration, yield and notes in Mealie. Keep any created recipe unless Ben approves its deletion.

## Backup and rollback

Recipes, methods and bake logs live in the Compose named volume `bread-calculator_recipes` (the wrapper sets a fixed project name). Before changing saved-data format or applying any change that could rewrite recipes, stop only this service and archive that volume to a protected host backup directory, preserving permissions. A Docker backup helper can mount this volume read-only and a separate backups directory writable. Verify archive contents before restart. Keep a dated copy of `.env` separately with restricted permissions; never include it in application images or Git.

For normal image rollback, retain the previous commit-tagged image. Set `BREAD_REVISION` to that commit, run Compose config validation, and recreate only this service without `--build`. Check health and saved recipes. Recipes remain JSON files at the volume root; methods and bakes use separate subdirectories. Older recipes acquire optional fields only when saved. Recipe and bake method snapshots are preserved when the method library changes. An image rollback retains all volume files; older images do not display methods or bake logs. Never remove the volume to roll back. Backup scheduling and restore drill remain a tracked follow-up until configured and verified on the server.

## Source transfer on this host

The server has no HTTPS Git credential for the new private repository. The initial rollout used a Git bundle made from the exact merged GitHub `main` commit, transferred over SSH and cloned into `~/apps/bread-calculator`. The origin points to GitHub for source identity, but an unattended HTTPS pull will fail until access is explicitly configured. For later updates, fetch the reviewed merged commit on the Mac, create a bundle from `main`, transfer it over SSH, fetch it into the clean server app checkout and fast-forward `main`. Verify the resulting commit before building. Do not add a broader GitHub credential as a workaround.

`~/docker/bread-calculator/.env` stores the deployed `BREAD_REVISION` with mode 600. Preserve this value and any later Mealie settings across updates. The original named recipe is “Everyday sourdough”.

The initial HTTPS and Mealie acceptance checks are tracked in [issue #3](https://github.com/altamashka/bread-calculator/issues/3); scheduled backup and restore verification remains in [issue #2](https://github.com/altamashka/bread-calculator/issues/2). Existing Tailscale service mappings are retained.

## Scheduled backups (configured 2026-10-16)

Ben approved nightly backups, an isolated restore drill, deployment and retention of 30 automatic copies. The application-owned `scripts/backup.sh` is installed as `~/.local/bin/bread-backup` (mode 700). It archives all of `bread-calculator_recipes` into `~/backups/bread-calculator/scheduled` (directory 700; archives/checksums 600). Credentials are excluded. Existing protected environment/manual backups are separate and untouched.

The existing user crontab runs this at **03:30 Europe/Berlin**, covering summer and winter UTC offsets without changing the host timezone or other jobs:

```cron
30 1,2 * * * [ "$(TZ=Europe/Berlin date +\%H)" = 03 ] && /home/benmccash/.local/bin/bread-backup >> /home/benmccash/backups/bread-calculator/scheduled/backup.log 2>&1
```

The previous crontab is protected alongside the backups. A user systemd timer was tested but disabled because login lingering is off; cron does not depend on a login session. The job uses a lock, verifies the mounted volume, briefly pauses only Bread, unpauses on failure, checks gzip/tar integrity and records SHA-256. Only this job's oldest timestamped archives/checksums beyond 30 copies are removed. Other/manual backups and failed logs are not pruned. Check `backup.log`, the newest archive date, `sha256sum -c <archive>.sha256` and `/healthz` when investigating a missed backup. A backup failure exits nonzero and remains in the protected log. These same-disk copies are not an off-host disaster backup.

Run a fresh backup with `~/.local/bin/bread-backup`. For an isolated restore, use the installed copy of `scripts/restore-check.sh`:

```sh
~/.local/bin/bread-restore-check /absolute/protected/bread-YYYYMMDDTHHMMSSZ.tar.gz bread-calculator:<revision>
```

Its checksum sidecar must be adjacent. It creates a fresh `bread-restore-check-<timestamp>-<pid>` volume/container, mounts no production volume and has no network, published ports or Mealie settings. It verifies raw restored records against `/api/archive` and each collection API, including complete formula/method snapshots and link metadata, then stops the container and retains it and its volume for inspection. It cannot overwrite the live store. Restoring production is a separate deliberate operation requiring approval and a fresh safety backup; do not point the app at a restored test volume as a shortcut.

Verified on 2026-10-16: the live volume restored with all three recipes and Mealie identity metadata unchanged. Because production had no methods or bakes, synthetic method/recipe/bake records were created only in the isolated restore, its method library edited, and that volume backed up and restored again: four recipes, one method, one bake validated. Historical recipe/bake methods retained their original steps/rests. The isolated copies are protected personal-data backups, not source files; no production records or remote Mealie recipes were created or modified by the drill.

## Automatic releases (implementation; activation pending)

After this deployment PR is merged, successful `main` checks publish **the exact tested image** to private `ghcr.io/altamashka/bread-calculator:<commit>` and `:main`. Pull-request and other branch checks never publish. Publishing is serialized and superseded main revisions are skipped. Publication failures leave the existing server image running. Package access inherits this private repository; do not make the image public.

`scripts/auto-deploy.sh` is a host-side polling updater. It needs an existing Docker login with read access to the private package, not a source-repository checkout credential. A read-only inspection on 2026-10-22 found an existing GHCR login on altamacmini; whether it can read this new package remains to be verified. Do not copy registry credentials into this repository or GitHub logs.

Activation requires Ben's approval for installing the updater and its schedule. Once approved and this PR is merged:

1. Confirm the main publishing job succeeded and package visibility/access is private. Test `docker pull ghcr.io/altamashka/bread-calculator:main` using the existing server login. If it fails, stop and request approval for a narrowly scoped registry credential; do not reuse a broader source token.
2. Copy the reviewed script to `~/.local/bin/bread-auto-deploy` with mode 700. It runs as the existing Docker-capable user, never root. Its default paths match the deployed Bread wrapper, container and data volume. Keep the wrapper and protected `.env` unchanged.
3. Preserve a mode-600 copy of the existing user crontab in `~/.local/state/bread-deploy/`. Add this line without replacing other jobs:

   ```cron
   */5 * * * * /home/benmccash/.local/bin/bread-auto-deploy >> /home/benmccash/.local/state/bread-deploy/deploy.log 2>&1
   ```

4. Run the updater once under observation. Check the log, container image digest and health, private HTTPS, saved recipe availability, Methods, Bake log, flour blends and full archive. Do not save synthetic records to production or call Mealie write APIs. Confirm the server's Docker credential configuration and application `.env` remain protected.

Each run obtains a deployment lock and the scheduled backup lock, pulls the candidate, and exits without a restart when the running image matches. Before replacement it verifies the expected running container/data volume, validates Compose without printing secrets, briefly pauses only Bread, and verifies a complete gzip/tar backup plus SHA-256. Backups are mode 600 in `~/.local/state/bread-deploy/`; automatic deployment backups and old images are retained, not pruned. Monitor disk usage and arrange any retention change explicitly.

The updater writes a private Compose override at `~/.local/state/bread-deploy/image.yaml` pinned to a registry digest. It runs Compose with both the original wrapper and this override, `--no-build --pull never --no-deps`, targeting only Bread. Existing loopback ports, Mealie environment, external network, named volume, non-root user and Watchtower exclusion remain in effect. `BREAD_REVISION` in `.env` remains the historical locally built revision; the override identifies the active release. **All later manual Compose operations must include this override** or they may switch back to the historical local image.

A replacement failure or failed health/page checks restores the previous local image ID without restoring or deleting data. A failed digest is recorded in `failed-image` and is not retried on each poll; a newer published digest can deploy normally. A rollback failure exits nonzero and logs that operator attention is needed. The log/cron exit is local reporting, not an external alert service. Inspect it after activation and when investigating updates.

To stop automatic deployment, remove only its cron line, preserving backups and other jobs. To roll back manually, pause that schedule, retain the current override, set its image to the previous retained image ID/digest, run Compose with both files and verify health and private HTTPS. Never run `down -v` or restore a data backup automatically. A rollback can leave records written by the newer app in place; future schema-breaking changes require a migration/rollback plan before merge. After investigating a failed release, remove only the updater's `failed-image` marker to allow an intentional retry.

Cross-repository implementation guidance: [Agent guide](automatic-deployment-guide.md).
