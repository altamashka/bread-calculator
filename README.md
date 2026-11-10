# Bread Bench

A private bread calculator for Ben: edit dough formulas, reuse methods, follow a bake and record results. Independently written, inspired by BRDCLC. No analytics, third-party scripts or runtime dependencies.

[Calculator](https://bread.tail10db36.ts.net) · [Methods](https://bread.tail10db36.ts.net/methods) · [Bake log](https://bread.tail10db36.ts.net/bakes) — private Tailscale access required.

## Use it

1. **Calculate:** enter grams or percentages, adjust starter hydration and scale the batch.
2. **Save:** choose a method and optionally save a linked copy in Mealie.
3. **Bake:** weigh ingredients by step, record action times and resume on any device.
4. **Record:** save observations and compare past bakes.

Percentages use **added flour**; total hydration includes starter flour and water. The default formula weighs 1,970 g at 77.2727% total water hydration. Planned rests are reminders to check the dough, not fermentation predictions.

See the [user guide](docs/usage.md) for detailed controls, drafts, exports and backups.

## Run locally

Use Node 24 or newer. No package installation is needed.

```sh
npm test
npm start
```

Open [localhost:8080](http://127.0.0.1:8080). `HOST`, `PORT` and `DATA_DIR` override the defaults; local `data/` is ignored by Git.

Validate Docker configuration with `docker compose config --quiet`. For container builds, private access and server updates, follow the [deployment guide](docs/deployment.md).

## Documentation

| Guide | Contents |
| --- | --- |
| [User guide](docs/usage.md) | Calculator, methods, baking, results and data |
| [Calculations and research](docs/research.md) | Equations, examples, sources and design limits |
| [Mealie integration](docs/mealie.md) | Setup, sync rules and installed API quirks |
| [Deployment](docs/deployment.md) | Server setup, backups, releases and rollback |
| [Deployment pattern](docs/automatic-deployment-guide.md) | Adapting the updater to another app |
| [Interface design](docs/interface-design.md) | Layout decisions and validation |
| [Contributor rules](AGENTS.md) | Code ownership, safety and required checks |
