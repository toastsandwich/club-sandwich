// Local notes viewer.
//   node server.js
//   node server.js --notes ~/notes --port 8787

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const MAX_NOTE = 2_000_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export function parseArgs(argv, env = process.env) {
  let notes = env.NOTES_DIR || path.join(env.HOME || "", "notes");
  let port = Number(env.PORT || 8787);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--notes") notes = argv[++i];
    else if (arg === "--port") port = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") return { help: true, notes, port };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`);
  }
  return { help: false, notes: path.resolve(notes), port };
}

export function prettyRoot(root, home = process.env.HOME || "") {
  if (home && (root === home || root.startsWith(home + path.sep))) {
    return `~${root.slice(home.length)}`;
  }
  return root;
}

export function loadVault(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    const error = new Error(`Notes folder not found: ${root}`);
    error.code = "ENOENT";
    throw error;
  }
  const base = fs.realpathSync(root);
  const notes = [];

  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.resolve(dir, entry.name);
      if (abs !== base && !abs.startsWith(base + path.sep)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      let stat;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > MAX_NOTE) continue;
      notes.push({
        path: rel,
        mtime: stat.mtimeMs,
        content: fs.readFileSync(abs, "utf8"),
      });
    }
  };

  walk(base, "");
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return { root: base, notes };
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  fs.readFile(file, (error, data) => {
    if (error) {
      send(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Failed to read file");
      return;
    }
    send(res, 200, data, MIME[ext] || "application/octet-stream");
  });
}

export function createServer(notesDir) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }

    if (url.pathname === "/api/vault") {
      try {
        const vault = loadVault(notesDir);
        const body = JSON.stringify({
          root: prettyRoot(vault.root),
          notes: vault.notes,
        });
        if (req.method === "HEAD") {
          send(res, 200, "", "application/json; charset=utf-8");
          return;
        }
        send(res, 200, body, "application/json; charset=utf-8");
      } catch (error) {
        const status = error.code === "ENOENT" ? 404 : 500;
        send(res, status, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
      }
      return;
    }

    let pathname = "/";
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      send(res, 400, "Bad path");
      return;
    }

    if (pathname === "/" || pathname.startsWith("/n/")) {
      sendFile(res, path.join(PUBLIC, "index.html"));
      return;
    }

    const file = path.normalize(path.join(PUBLIC, pathname));
    if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
      send(res, 403, "Forbidden");
      return;
    }
    sendFile(res, file);
  });
}

function printHelp() {
  console.log(`Club Sandwich — a viewer for a folder of markdown notes

  node server.js [--notes DIR] [--port PORT]

  --notes   Notes folder. Default: ~/notes or $NOTES_DIR
  --port    Listen port. Default: 8787 or $PORT
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const server = createServer(args.notes);
  server.listen(args.port, "127.0.0.1", () => {
    console.log(`Club Sandwich  http://127.0.0.1:${args.port}`);
    console.log(`Reading notes from ${prettyRoot(args.notes)}`);
  });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main();
