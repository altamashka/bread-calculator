# Agent guide: automatic deployment for private household apps

Use this guide when adapting Bread Bench's automatic release design to repositories such as Music Digest or Taste Map. This is a reference implementation, not permission to change another repository, grant credentials, modify a server or install a schedule. Read that repository's AGENTS.md and deployment documentation first. Bread's own rollout is documented in [deployment.md](deployment.md#automatic-releases-implementation-activation-pending).

## Establish the actual deployment

Inspect the target repository and read-only server state before designing changes. Record the deployed architecture, Compose project/service/container names, wrapper path, image origin, healthcheck, persistent stores, network bindings, secrets location, backup job and rollback procedure. Inspect credential presence/access without printing credential values. Distinguish historical documentation from current verification. Do not assume Music Digest or Taste Map use Bread's ports, Docker network, data format, startup behavior or credentials.

Identify background workers and external writes. A digest app might send email or publish output when it starts; a taste app might have database migrations, uploads or scheduled imports. A container healthcheck alone cannot establish that these operations are safe. Use fake providers and isolated storage to test them, and prevent preview containers from sending real messages or running production jobs.

## CI: test, then publish the tested image

Reference: [Bread workflow](../.github/workflows/check.yml).

- Run application tests and Compose validation on branches and PRs. Build and smoke-test the real non-root Linux image with isolated data. Include meaningful backup/restore checks.
- Publish only after every required check succeeds on a push to the default branch. PRs and feature branches must never publish the production tag.
- Preserve the exact tested image between jobs using a short-lived workflow artifact; do not rebuild a potentially different base/dependency version for publication.
- Give only the publishing job `packages: write` and `contents: read`. Authenticate to GHCR with the job's temporary `GITHUB_TOKEN` via standard input. Never put a permanent server credential in CI or log a resolved Compose configuration.
- Publish a commit tag for traceability and a moving release tag for discovery. Serialize publication and skip superseded default-branch revisions. Label the image with its source repository and commit.
- Confirm private image visibility and repository access before activation. A successful source merge is not proof of a successful publish or deployment.

GitHub's primary references: [Publishing images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [Container registry authentication and permissions](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## Host: update with backup and rollback

Reference: [Bread updater](../scripts/auto-deploy.sh). Adapt its fixed registry, paths, volume/container checks, health URLs and expected service name. It is deliberately scoped to one application.

1. Poll the private release image using a host registry login with read-only package access. No inbound webhook, public deployment endpoint, GitHub-hosted runner access to the private server, or source checkout credential is required.
2. Lock deployments and coordinate with existing backups. Pull first, resolve the immutable registry digest, and compare image IDs. If unchanged, do nothing.
3. Verify the running service and its exact data mounts. Refuse unexpected state. Validate the Compose override without displaying secrets.
4. Take a consistent application-aware backup. Bread pauses one writer and archives a JSON volume. A database-backed app may require its database's supported snapshot/export method; pausing an app alone may be insufficient. Verify backup integrity before replacement. Keep secrets separately protected.
5. Pin a private Compose override to the digest and recreate only the intended service, preserving networks, loopback bindings, non-root user, volumes and credentials. Record how the override affects subsequent manual operations.
6. Require bounded container health and application checks. Use read-only checks that do not log personal records or trigger side effects. Check the actual public/private access path separately during rollout.
7. On failure restore the previous retained image, verify it, and return failure even if rollback succeeds. Never automatically restore or delete application data. Record the failed digest to avoid repeatedly restarting a broken release; permit a new release or an explicit operator retry.
8. Retain old images and verified backups according to an approved policy. Bread's deployment backups are not automatically pruned. Plan disk monitoring, retention and failure notifications for the target app; a local log is not a notification service.

A previous image may not understand data written by a new version. Schema-breaking changes need an explicit migration and rollback strategy before release. A generic container updater cannot solve that compatibility problem.

## Test failure paths before installing

Reference: [Bread deployment fixtures](../test/deploy.test.mjs).

Test unchanged-image no-op, pull/authentication failure, wrong data volume, configuration failure, backup failure with guaranteed unpause, successful replacement, unhealthy candidate with successful rollback, and suppression of repeated failed-image attempts. Extend coverage for the target's workers, database migrations and partial-startup failures. Use an isolated Docker environment for actual image health and backup/restore checks; mocks validate command sequencing but cannot prove a live rollout.

Never mount production data in synthetic tests or call real external write APIs. Preserve credentials and personal data outside Git, images, test output and CI artifacts.

## Review and activation

Prepare a scoped branch and PR with source changes, tests, concrete installation commands, schedule, rollback procedure and operational limitations. Review the staged diff, push only intended files and wait for CI. Record unfinished operational work in a GitHub issue.

Ask for required approval only after the implementation is reviewable. Describe the exact server installation, restart/schedule and any new credential scope. Reuse existing authorization when applicable, but do not infer approval for unrelated apps or broader access. Do not install a host runner or expose a private app merely to simplify deployment.

After approval and merge, verify the published artifact, install the reviewed script with restricted permissions, preserve the existing schedule and add only the app's job. Run one observed deployment. Verify the image digest, health, private access, data availability and backup; demonstrate no-op behavior on a second run. Record what was actually verified, and identify anything still awaiting approval or access. If the registry login fails, stop before changing the running app and resolve access explicitly.

Watchtower can discover and replace registry images, but that alone does not implement the backup, application checks, failed-release suppression or rollback described here. If using it for another app, design and test equivalent lifecycle behavior before enabling it; do not simply copy an enable label.
