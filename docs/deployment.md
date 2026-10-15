# altamacmini deployment

The application lives in its own private GitHub repository. The server repository owns only the deployment wrapper and service documentation. The first application and deployment PRs are merged. The container is running on 127.0.0.1:8078. Health and original-recipe persistence across a container restart were verified on 2026-10-15. The dedicated private HTTPS name still awaits Tailscale console registration and host approval; the console requires Ben’s sign-in. Mealie export remains disabled until a user-created token is configured and verified.

## First rollout

Review the application PR and successful CI. On the server, check out its reviewed commit under `~/apps/bread-calculator`, retaining the revision for rollback. The server repository’s `bread-calculator/docker-compose.yml` uses that source as its build context. Validate the wrapper with `docker compose ... config --quiet`. Build an image tagged with the reviewed commit using `BREAD_REVISION=<commit>` and start only `bread-calculator` with the same setting. Check its health, the page, a named test recipe save, browser reload and JSON export. Keep the service private and disabled from Watchtower.

Docker administration requires Ben’s approval under the workspace rules. There is no local Docker installation on the editing Mac; CI builds and checks the actual Linux container. Do not use sudo.

## HTTPS and access

The port is `127.0.0.1:8078`. Before changing Tailscale Serve, save `tailscale serve status` and `tailscale serve get-config` privately on the host. Inspect the installed help and current service configuration. Register and approve a dedicated `bread` service in the admin console if required. Map its private HTTPS endpoint to this loopback port, preserving all existing mappings. Never use `tailscale serve reset`. New service registration/access needs Ben’s approval. Verify HTTPS from the Mac and from another Tailscale-connected device.

Until that registration is completed, an SSH tunnel is a private development fallback:

```sh
ssh -N -L 8078:127.0.0.1:8078 altamacmini
```

Open http://127.0.0.1:8078 on the Mac. This does not by itself provide a day-to-day phone HTTPS endpoint.

## Mealie

Create a user API token and store it in the server-only environment file. Token creation is an access change requiring Ben’s approval. Do not retrieve tokens from the Mealie database or commit any token. Configure the URL and token as described in README.md, recreate this container only, and send a named test recipe. Verify ingredients, actual hydration, yield and notes in Mealie. Keep any created recipe unless Ben approves its deletion.

## Backup and rollback

Recipe JSON files live in the Compose named volume `bread-calculator_recipes` (the wrapper sets a fixed project name). Before changing saved-data format or applying any change that could rewrite recipes, stop only this service and archive that volume to a protected host backup directory, preserving permissions. A Docker backup helper can mount this volume read-only and a separate backups directory writable. Verify archive contents before restart. Keep a dated copy of `.env` separately with restricted permissions; never include it in application images or Git.

For normal image rollback, retain the previous commit-tagged image. Set `BREAD_REVISION` to that commit, run Compose config validation, and recreate only this service without `--build`. Check health and saved recipes. v1 has no migrations; future changes must document data compatibility. Never remove the volume to roll back. Backup scheduling and restore drill remain a tracked follow-up until configured and verified on the server.

## Source transfer on this host

The server has no HTTPS Git credential for the new private repository. The initial rollout used a Git bundle made from the exact merged GitHub `main` commit, transferred over SSH and cloned into `~/apps/bread-calculator`. The origin points to GitHub for source identity, but an unattended HTTPS pull will fail until access is explicitly configured. For later updates, fetch the reviewed merged commit on the Mac, create a bundle from `main`, transfer it over SSH, fetch it into the clean server app checkout and fast-forward `main`. Verify the resulting commit before building. Do not add a broader GitHub credential as a workaround.

`~/docker/bread-calculator/.env` stores the deployed `BREAD_REVISION` with mode 600. Preserve this value and any later Mealie settings across updates. The original named recipe is “Everyday sourdough”.

Pending acceptance is tracked in [issue #3](https://github.com/altamashka/bread-calculator/issues/3); scheduled backup and restore verification is [issue #2](https://github.com/altamashka/bread-calculator/issues/2). The alternate node-hostname Serve change was rejected by automatic approval review and was not applied. The approved dedicated `svc:bread` proxy is configured and awaits its console registration/approval.
