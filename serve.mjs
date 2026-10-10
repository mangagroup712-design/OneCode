import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "./worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(status, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function proxyWorker(req, res) {
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await new Promise((resolve, reject) => {
          const chunks = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        });
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body,
  });
  const response = await worker.fetch(request, {});
  res.writeHead(response.status, Object.fromEntries(response.headers));
  const responseBody = Buffer.from(await response.arrayBuffer());
  res.end(responseBody);
}

const server = http.createServer(async (req, res) => {
  if ((req.url || "").split("?")[0].startsWith("/api/")) {
    try {
      await proxyWorker(req, res);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safe);

  if (safe.endsWith("/") || !path.extname(safe)) {
    const asIndex = path.join(filePath, "index.html");
    if (fs.existsSync(asIndex)) {
      send(res, 200, asIndex);
      return;
    }
    if (!path.extname(safe) && fs.existsSync(`${filePath}.html`)) {
      send(res, 200, `${filePath}.html`);
      return;
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    send(res, 200, filePath);
    return;
  }

  if (!safe.includes("/") && !path.extname(safe)) {
    try {
      await proxyWorker(req, res);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.message);
    }
    return;
  }

  // GitHub Pages / Cloudflare Pages と同じく、無いパスは 404.html を返す
  const fallback = path.join(root, "404.html");
  send(res, 404, fallback);
});

server.listen(port, host, () => {
  console.log(`OneCode local server: http://localhost:${port}`);
  console.log(`LAN access: http://<your-ip>:${port}`);
});
