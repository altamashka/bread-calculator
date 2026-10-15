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
import { validate, schemaRecipe } from "./public/math.mjs";

const dataDir = process.env.DATA_DIR || "./data";
const staticDir = fileURLToPath(new URL("./public/", import.meta.url));
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.mjs": ["app.mjs", "text/javascript"],
  "/math.mjs": ["math.mjs", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
};
const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const pending = new Set();
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("Use application/json.");
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (Buffer.byteLength(s) > 32768) throw Error("Recipe is too large.");
  }
  const parsed = JSON.parse(s);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw Error("A recipe request object is required.");
  return parsed;
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
            if (previous.mealieExportedAt)
              record.mealieExportedAt = previous.mealieExportedAt;
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
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
          if (record.mealieExportedAt)
            return send(409, {
              error:
                "This saved recipe has already been exported to Mealie. Save a copy to export another version.",
            });
          const url = new URL(
            "/api/recipes/create/html-or-json",
            process.env.MEALIE_URL,
          );
          const upstream = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(20000),
            headers: {
              Authorization: `Bearer ${process.env.MEALIE_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              data: JSON.stringify(schemaRecipe(record.recipe)),
            }),
          });
          if (!upstream.ok)
            return send(502, {
              error: `Mealie returned HTTP ${upstream.status}. Check the token and Mealie logs.`,
            });
          record.mealieExportedAt = new Date().toISOString();
          const tmp = `${dataDir}/${input.id}.${randomUUID()}.tmp`;
          await writeFile(tmp, JSON.stringify(record, null, 2), {
            mode: 0o600,
          });
          await rename(tmp, `${dataDir}/${input.id}.json`);
          return send(200, { ok: true });
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
        /^(Enter |Use |A recipe|Recipe is too large|Unsupported |Flour |Whole wheat|Starter hydration)/.test(
          error.message,
        );
      send(client ? 400 : 500, {
        error: client
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
