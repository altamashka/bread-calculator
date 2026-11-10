# Reusing the deployment pattern

[Back to README](../README.md) · [Bread rollout](deployment.md#automatic-releases)

Use this guide to adapt Bread Bench's updater to another private app. It grants no permission to change other repositories, credentials, servers or schedules. Read the target's contributor and deployment rules first.

## Inspect the target

Use read-only checks to establish Compose/service/container names, wrapper path, image source, healthchecks, data stores, network bindings, secret locations, backup schedule and rollback procedure. Check credential access without printing values. Separate recorded history from current verification.

Identify workers and startup side effects, including email, publishing, imports and database migrations. Test with fake providers and isolated storage; preview containers must not send messages or run production jobs. Do not assume another app shares Bread's architecture.

## Test and publish

Reference: [CI workflow](../.github/workflows/check.yml).

- Run tests, Compose validation, a real non-root Linux image smoke test and backup/restore checks.
- Publish only after required default-branch push checks pass. PRs and feature branches must not publish the release tag.
- Transfer the exact tested image between jobs; do not rebuild it for publication.
- Give only the publisher `packages: write` and `contents: read`. Use temporary `GITHUB_TOKEN` authentication through standard input. Never log secrets or resolved Compose configuration.
- Publish commit and moving release tags, label source/revision, serialize publication and skip superseded revisions. Verify private package access before activation.

References: GitHub's [image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images) and [registry permissions](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Update one service safely

Reference: [updater](../scripts/auto-deploy.sh). Adapt every fixed path, registry, volume/container check and health URL.

1. Poll with a host login scoped to package reads. No public webhook, inbound runner or source credential is needed.
2. Lock deployments and backups. Pull and resolve the digest; exit without restarting if unchanged.
3. Verify the running service and exact data mounts; validate Compose without exposing secrets.
4. Take and verify a consistent backup. Bread pauses one JSON writer; databases may need their supported snapshot/export procedure. Protect secrets separately.
5. Pin a private Compose override to the digest and replace only the intended service. Preserve access, networks, non-root operation, volumes and credentials. Document the override for manual operations.
6. Bound health/application checks and verify the actual access path. Checks must not write data, expose records or trigger jobs.
7. On failure, restore and verify the previous image, still return failure, and suppress repeated attempts at that digest. Never automatically restore/delete data.
8. Set an approved retention policy, disk monitoring and failure notifications. Bread retains deployment backups and images; a local log is not an alert service.

Schema-breaking releases need an explicit migration/rollback plan: older images may not understand newer data. Watchtower alone does not provide these safeguards.

## Validate and activate

Use [deployment fixtures](../test/deploy.test.mjs) to cover unchanged images, authentication failure, wrong volumes, invalid configuration, backup failure/unpause, success, failed health checks, rollback and failed-digest suppression. Add target-specific worker/migration failures. Mocks check sequencing; isolated Docker checks must verify real health and restore behavior. Never mount production data or call real write APIs in synthetic tests. Keep credentials and personal data out of Git, images, test output and CI artifacts.

Prepare a branch/PR with tests, installation commands, schedule, rollback and limitations. Review the staged diff, push intended files, wait for CI and record unfinished work in issues. Request required approval only when those changes are reviewable, specifying server operations and credential scope. Do not add a host runner or expose a private app just to simplify deployment.

After approval and merge, verify publication, install with restricted permissions, preserve other scheduled jobs and observe one deployment. Check digest, health, access, data and backup; repeat to prove no-op behavior. If registry access fails, stop before changing the app. Record verified results and remaining approval/access needs.
