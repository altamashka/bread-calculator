# Bread Bench

A private, self-hosted bread dough calculator for Ben. Independently written, inspired by BRDCLC. No analytics, third-party scripts, package dependencies or internet connection needed for calculations. Mealie integration is optional.

## Use it

Change flour weight to scale every ingredient, or edit any ingredient in grams or baker’s percentages. The percentage basis is **flour added to the bowl**, matching BRDCLC. Set total dough weight to scale a batch, or set total water hydration to solve for the added water. Adjust starter hydration, whole wheat/rye blend and portions. Save named recipes with method notes on the server; export JSON for backup or manual Mealie import. Print from the browser.

The default is Ben’s recipe: 1,000 g added flour, 750 g water, 20 g salt and 200 g starter at 100% hydration. It weighs 1,970 g and has **77.2727% total water hydration**. The water setting of 75% uses added flour; total hydration counts starter flour and water. Display values are rounded; calculations retain precision. Portions are raw dough weights, not baked weights.

Old BRDCLC query parameters work on this service, including `?flour=1000&water=75&salt=2&leaven=20`. `starter` and `poolish` are combined with `leaven` and assumed to be 100% hydration unless `starterHydration` is set. They become one shared preferment; multiple independently hydrated preferments are outside v1.

## Development

Use Node 24 or newer. No installation step is required.

```sh
npm test
npm start
```

Open http://127.0.0.1:8080. Local recipes go into ignored `data/`. `HOST`, `PORT` and `DATA_DIR` override defaults. The Mac preview used Node 26; CI and Docker use Node 24 LTS.

## Docker

```sh
docker compose config --quiet
docker compose up -d --build bread-calculator
docker compose ps
curl -fsS http://127.0.0.1:8078/healthz
```

The image runs as an unprivileged user, with a read-only root filesystem, dropped capabilities, a healthcheck and a named persistent recipes volume. The port binds only to loopback. Watchtower is disabled. Only start this service; no media stack restart is needed. Follow [deployment.md](docs/deployment.md) for server rollout, HTTPS, backup and rollback.

## Mealie

Verified the running server’s Mealie **v3.10.2** OpenAPI schema on 2026-10-15. Uses `POST /api/recipes/create/html-or-json` with `{ "data": "<schema.org Recipe JSON string>" }`. Live export was verified on 2026-10-15 using the existing server-side Mealie credential with Ben’s explicit approval. “Everyday sourdough” is saved in Mealie with the correct ingredient weight text, two servings and 77.27% hydration in its description. Mealie imports the weighed ingredients as text; use this calculator to rescale the dough.

Create a token in Mealie’s user profile → API tokens. On the server only, copy `.env.example` to `.env`, put the token there and restrict its permissions. Never paste it into chat, browser code or Git. The backend alone sends it to the configured Mealie origin. HTTPS is verified; redirects are refused. Configure `MEALIE_URL` with the base origin, without a path prefix. Do not expose the app to the public internet: anyone able to reach it can save recipes and use its configured Mealie connection.

Sending first saves a local recipe, then creates a snapshot in Mealie. Repeated sends of the same saved recipe are blocked; use **Save as copy** for a new version. This is deliberate one-way export, not synchronization. Mealie may not retain the calculator’s editable formula; the local saved recipe and downloaded JSON do. After a timeout, inspect Mealie before retrying, as it may have accepted the recipe. No automatic retries are made.

Without a token, download JSON and import it using Mealie’s JSON recipe import. The extra `breadBench` field carries the editable formula for this app’s Restore control; the remaining fields form a schema.org Recipe. Notes become method steps. No baking schedule is invented.

## Data and privacy

The named volume is the authoritative local recipe store, shared across devices. Individual files are atomically replaced; this app is for a single household and has no account system or multiuser conflict resolution. Later saves to the same recipe win. No delete endpoint is provided. Back up the volume and protect backups as personal data. There is no promise of automatic backups until server scheduling is configured.

Recipe links contain names, quantities and notes; they can appear in browser history. Do not put secrets in notes. A private HTTPS reverse proxy such as existing Tailscale Serve provides transport security and access control. HTTP on loopback is intentional; a LAN HTTP address is not the finished HTTPS setup.

See [research.md](docs/research.md) for sources, conventions and scope.
