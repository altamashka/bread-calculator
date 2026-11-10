import http from "node:http";
import {
  readFile,
  mkdir,
  writeFile,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { validate, validateBlend } from "./public/math.mjs";
import { validateMethod, InputError } from "./public/methods-model.mjs";
import { validateBake } from "./public/bakes-model.mjs";
import { validateBakeSession } from "./public/bake-mode-model.mjs";

import { syncMealie, MealieError, recipeHash } from "./mealie.mjs";

const dataDir = process.env.DATA_DIR || "./data";
const staticDir = fileURLToPath(new URL("./public/", import.meta.url));
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.mjs": ["app.mjs", "text/javascript"],
  "/temperature.mjs": ["temperature.mjs", "text/javascript"],
  "/math.mjs": ["math.mjs", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
  "/methods": ["methods.html", "text/html; charset=utf-8"],
  "/bakes": ["bakes.html", "text/html; charset=utf-8"],
  "/methods.mjs": ["methods.mjs", "text/javascript"],
  "/methods-model.mjs": ["methods-model.mjs", "text/javascript"],
  "/bakes.mjs": ["bakes.mjs", "text/javascript"],
  "/bakes-model.mjs": ["bakes-model.mjs", "text/javascript"],
  "/bake": ["bake-mode.html", "text/html; charset=utf-8"],
  "/bake-mode.mjs": ["bake-mode.mjs", "text/javascript"],
  "/bake-mode-model.mjs": ["bake-mode-model.mjs", "text/javascript"],
  "/bake-timing-model.mjs": ["bake-timing-model.mjs", "text/javascript"],
  "/drafts.mjs": ["drafts.mjs", "text/javascript"],
  "/ui.mjs": ["ui.mjs", "text/javascript"],
};
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pending = new Set();
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("Use application/json.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 524288)
      throw new InputError("The saved item is too large (maximum 512 KB).");
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("A recipe request object is required.");
  return parsed;
}
async function listRecords(directory) {
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter(
    (n) => n.endsWith(".json") && idPattern.test(n.slice(0, -5)),
  );
  return Promise.all(
    names.map(async (n) =>
      JSON.parse(await readFile(`${directory}/${n}`, "utf8")),
    ),
  );
}
async function atomicRecord(directory, record) {
  await mkdir(directory, { recursive: true });
  const tmp = `${directory}/${record.id}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
    await rename(tmp, `${directory}/${record.id}.json`);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export function createServer() {
  return http.createServer(async (req, res) => {
    const send = (code, value) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (!["GET", "HEAD"].includes(req.method)) {
        if (req.headers["sec-fetch-site"] === "cross-site")
          return send(403, { error: "Cross-site request refused." });
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          return send(403, { error: "Origin does not match this service." });
      }
      if (path === "/healthz" && req.method === "GET")
        return send(200, { ok: true });
      if (path === "/api/config" && req.method === "GET")
        return send(200, {
          mealie: !!(process.env.MEALIE_URL && process.env.MEALIE_TOKEN),
        });
      const collections = {
        "/api/blends": { field: "blend", check: validateBlend, directory: `${dataDir}/blends` },
        "/api/methods": {
          field: "method",
          check: validateMethod,
          directory: `${dataDir}/methods`,
        },
        "/api/bakes": {
          field: "bake",
          check: validateBake,
          directory: `${dataDir}/bakes`,
        },
      };
      if (path === "/api/archive" && req.method === "GET")
        return send(200, {
          version: 1,
          exportedAt: new Date().toISOString(),
          recipes: await listRecords(dataDir),
          methods: await listRecords(`${dataDir}/methods`),
          blends: await listRecords(`${dataDir}/blends`),
          bakes: await listRecords(`${dataDir}/bakes`),
          bakeSessions: await listRecords(`${dataDir}/bake-sessions`),
        });
      if (path === "/api/bake-sessions") {
        const directory = `${dataDir}/bake-sessions`;
        if (req.method === "GET") return send(200, await listRecords(directory));
        if (req.method === "POST") {
          const input = await body(req), id = input.id ?? randomUUID();
          if (!idPattern.test(id)) return send(400, { error: "Invalid baking session ID." });
          let session;
          try { session = validateBakeSession(input.session); }
          catch { throw new InputError("Enter a valid baking session."); }
          if (!idPattern.test(session.recipeId)) throw new InputError("Choose a valid recipe.");
          if (input.resultId != null && !idPattern.test(input.resultId))
            throw new InputError("Choose a valid bake result.");
          const lock = `session:${id}`;
          if (pending.has(lock)) return send(409, { error: "This bake is already being saved. Try again." });
          pending.add(lock);
          try {
            let previous;
            try { previous = JSON.parse(await readFile(`${directory}/${id}.json`, "utf8")); }
            catch (e) { if (e.code !== "ENOENT") throw e; }
            if (previous) {
              if (input.revision !== previous.revision)
                return send(409, { error: "This bake changed elsewhere. Reload it before saving again." });
              if (session.recipeId !== previous.session.recipeId || session.capturedAt !== previous.session.capturedAt ||
                  JSON.stringify(session.recipe) !== JSON.stringify(previous.session.recipe))
                return send(400, { error: "A bake's starting recipe cannot be changed." });
              if (previous.resultId && previous.resultId !== input.resultId)
                return send(400, { error: "This bake already has a recorded result." });
            } else if (input.revision != null) {
              return send(404, { error: "This bake could not be found." });
            }
            if (input.resultId) {
              try { await readFile(`${dataDir}/bakes/${input.resultId}.json`, "utf8"); }
              catch (e) { if (e.code === "ENOENT") return send(400, { error: "Save the bake result first." }); throw e; }
            }
            const record = { id, session, revision: (previous?.revision ?? 0) + 1,
              updatedAt: new Date().toISOString(), resultId: input.resultId ?? null };
            await atomicRecord(directory, record);
            return send(200, record);
          } finally { pending.delete(lock); }
        }
      }
      if (collections[path]) {
        const c = collections[path];
        if (req.method === "GET")
          return send(200, await listRecords(c.directory));
        if (req.method === "POST") {
          const input = await body(req),
            value = c.check(input[c.field]),
            id = input.id ?? randomUUID();
          if (!idPattern.test(id))
            return send(400, { error: "Invalid saved item ID." });
          const lock = `${c.field}:${id}`;
          if (pending.has(lock))
            return send(409, { error: "This item is already being saved." });
          pending.add(lock);
          try {
            const record = {
              id,
              [c.field]: value,
              updatedAt: new Date().toISOString(),
            };
            await atomicRecord(c.directory, record);
            return send(200, record);
          } finally {
            pending.delete(lock);
          }
        }
      }
      if (path === "/api/recipes" && req.method === "GET") {
        await mkdir(dataDir, { recursive: true });
        const names = (await readdir(dataDir)).filter(
          (n) =>
            idPattern.test(n.replace(/\.json$/, "")) && n.endsWith(".json"),
        );
        return send(
          200,
          await Promise.all(
            names.map(async (n) =>
              JSON.parse(await readFile(`${dataDir}/${n}`, "utf8")),
            ),
          ),
        );
      }
      if (path === "/api/recipes" && req.method === "POST") {
        const input = await body(req),
          recipe = validate(input.recipe);
        const id = input.id ?? randomUUID();
        if (!idPattern.test(id))
          return send(400, { error: "Invalid recipe ID." });
        if (pending.has(id))
          return send(409, {
            error:
              "This recipe is being sent to Mealie. Please wait before saving.",
          });
        pending.add(id);
        try {
          await mkdir(dataDir, { recursive: true });
          const record = { id, recipe, updatedAt: new Date().toISOString() },
            tmp = `${dataDir}/${id}.${randomUUID()}.tmp`;
          try {
            const previous = JSON.parse(
              await readFile(`${dataDir}/${id}.json`, "utf8"),
            );
            for (const key of [
              "mealieExportedAt",
              "mealieSlug",
              "mealieRecipeId",
              "mealieHash",
              "mealiePendingCreate",
              "mealieLegacyRecipe",
              "mealieEnabled",
            ])
              if (key in previous) record[key] = previous[key];
            if (previous.mealieExportedAt && !previous.mealieSlug)
              record.mealieLegacyRecipe =
                previous.mealieLegacyRecipe ?? previous.recipe;
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          if (input.mealieEnabled !== undefined) {
            if (typeof input.mealieEnabled !== "boolean")
              throw new InputError("Choose whether to save in Mealie.");
            record.mealieEnabled = input.mealieEnabled;
          }
          try {
            await writeFile(tmp, JSON.stringify(record, null, 2), {
              mode: 0o600,
            });
            await rename(tmp, `${dataDir}/${id}.json`);
          } finally {
            await unlink(tmp).catch(() => {});
          }
          return send(200, record);
        } finally {
          pending.delete(id);
        }
      }
      if (path === "/api/mealie/status" && req.method === "GET") {
        const id = new URL(req.url, "http://localhost").searchParams.get("id");
        if (!idPattern.test(id ?? "")) return send(400, { error: "Choose a saved recipe." });
        let record;
        try { record = JSON.parse(await readFile(`${dataDir}/${id}.json`, "utf8")); }
        catch (e) { if (e.code === "ENOENT") return send(404, { error: "Recipe not found." }); throw e; }
        return send(200, {
          synced: record.mealieHash === recipeHash(record.recipe),
          exportedAt: record.mealieExportedAt ?? null,
          pending: !!record.mealiePendingCreate,
        });
      }
      if (path === "/api/mealie" && req.method === "POST") {
        if (!process.env.MEALIE_URL || !process.env.MEALIE_TOKEN)
          return send(503, {
            error:
              "Mealie needs a server-side URL and API token. JSON export is available now.",
          });
        const input = await body(req);
        if (!idPattern.test(input.id))
          return send(400, { error: "Save this recipe locally first." });
        if (pending.has(input.id))
          return send(409, {
            error: "This recipe is already being sent. Please wait.",
          });
        pending.add(input.id);
        try {
          const record = JSON.parse(
            await readFile(`${dataDir}/${input.id}.json`, "utf8"),
          );
          return send(
            200,
            await syncMealie(record, (r) => atomicRecord(dataDir, r)),
          );
        } finally {
          pending.delete(input.id);
        }
      }
      if (files[path] && req.method === "GET") {
        const [name, type] = files[path];
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-cache",
        });
        return res.end(await readFile(staticDir + name));
      }
      send(404, { error: "Not found." });
    } catch (error) {
      const client =
        error instanceof SyntaxError ||
        error instanceof InputError ||
        /^(Enter |Use |A recipe|Recipe is too large|Unsupported |Flour |Whole wheat|Starter hydration)/.test(
          error.message,
        );
      send(client ? 400 : error instanceof MealieError ? 502 : 500, {
        error:
          client || error instanceof MealieError
            ? error.message
            : "Request failed. Your saved recipes have been retained. A Mealie timeout may still have created a recipe; check Mealie before retrying.",
      });
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createServer().listen(
    Number(process.env.PORT || 8080),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `Bread calculator: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 8080}`,
      ),
  );
