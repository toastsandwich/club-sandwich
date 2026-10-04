// Pure helpers for the notes viewer. No DOM, no markdown parser.

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizePath(value) {
  const parts = [];
  for (const part of String(value).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

const LABELS = {
  "asm-theory": "Assembly theory",
  "lsm-theory": "LSM theory",
  luna: "Luna",
  changelog: "Changelog",
  architecture: "Architecture",
  guides: "Guides",
};

export function labelFor(name) {
  if (!name) return "Vault";
  if (LABELS[name]) return LABELS[name];
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function noteHref(notePath, jump = "") {
  const path = "/n/" + notePath.split("/").map(encodeURIComponent).join("/");
  return jump ? `${path}#${encodeURIComponent(jump)}` : path;
}

export function formatUpdated(iso) {
  if (!iso) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

export function mtimeLabel(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const iso = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return formatUpdated(iso);
}

function stripMd(value) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim();
}

function applyFrontmatter(raw, meta) {
  const lines = raw.split("\n");
  let inTags = false;
  for (const line of lines) {
    const title = /^title:\s*(.*?)\s*$/.exec(line);
    if (title && title[1]) {
      meta.title = title[1].replace(/^["']|["']$/g, "");
      inTags = false;
      continue;
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    const inline = /^tags:\s*\[(.*)\]\s*$/.exec(line);
    if (inline) {
      meta.tags = inline[1]
        .split(",")
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      inTags = false;
      continue;
    }
    if (inTags) {
      const item = /^\s*-\s*(.+?)\s*$/.exec(line);
      if (item) {
        meta.tags.push(item[1].replace(/^["']|["']$/g, ""));
        continue;
      }
      inTags = false;
    }
  }
}

export function parseNote(raw, notePath) {
  let text = String(raw).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const meta = { title: "", tags: [], updated: "" };

  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 3);
    if (end !== -1) {
      applyFrontmatter(text.slice(4, end), meta);
      text = text.slice(end + 5);
    }
  }

  text = text.replace(/^\n+/, "");
  if (text.startsWith("# ")) {
    const nl = text.indexOf("\n");
    const heading = (nl === -1 ? text.slice(2) : text.slice(2, nl)).trim();
    if (!meta.title) meta.title = stripMd(heading);
    text = nl === -1 ? "" : text.slice(nl + 1);
  }

  const lines = text.replace(/^\n+/, "").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const updated = /^Updated:\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(line);
    const tags = /^Tags:\s*(.+?)\s*$/.exec(line);
    if (updated) {
      meta.updated = updated[1];
      index += 1;
      continue;
    }
    if (tags && meta.tags.length === 0) {
      meta.tags = tags[1].split(",").map((tag) => tag.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    break;
  }

  if (!meta.title) {
    meta.title = notePath
      .split("/")
      .pop()
      .replace(/\.md$/i, "")
      .replace(/-/g, " ");
  }

  return {
    path: notePath,
    title: meta.title,
    tags: meta.tags,
    updated: meta.updated,
    body: lines.slice(index).join("\n").replace(/^\n+/, ""),
  };
}

export function plainText(markdown) {
  return String(markdown)
    .replace(/```[^\n]*\n/g, " ")
    .replace(/```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\[\[[^\]|]+\|([^\]]+)]]/g, "$1")
    .replace(/\[\[([^\]]+)]]/g, (_, target) => target.split("/").pop().replace(/\.md$/i, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\|/g, " ")
    .replace(/<[^>\n]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isIndex(notePath) {
  return /(^|\/)index\.md$/i.test(notePath);
}

export function listTitle(note) {
  if (isIndex(note.path) && note.path.includes("/")) return "Overview";
  return note.title;
}

export function compareNotes(a, b, folderName) {
  const aIndex = isIndex(a.path);
  const bIndex = isIndex(b.path);
  if (aIndex !== bIndex) return aIndex ? -1 : 1;
  if (folderName === "changelog") return b.path.localeCompare(a.path);
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function makeNode(name) {
  return { name, label: labelFor(name), notes: [], folders: new Map() };
}

export function buildTree(notes) {
  const root = makeNode("");
  for (const note of notes) {
    const parts = note.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!node.folders.has(part)) node.folders.set(part, makeNode(part));
      node = node.folders.get(part);
    }
    node.notes.push(note);
  }

  const sortNode = (node) => {
    node.notes.sort((a, b) => compareNotes(a, b, node.name));
    const folders = [...node.folders.values()].sort((a, b) => a.label.localeCompare(b.label));
    node.folders = folders;
    folders.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

export function siblingNav(note, notes) {
  const dir = note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "";
  const folderName = dir.split("/").pop() || "";
  const same = notes.filter((item) => {
    const itemDir = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
    return itemDir === dir;
  });
  same.sort((a, b) => compareNotes(a, b, folderName));
  const index = same.findIndex((item) => item.path === note.path);
  return {
    prev: index > 0 ? same[index - 1] : null,
    next: index >= 0 && index < same.length - 1 ? same[index + 1] : null,
  };
}

function asList(paths) {
  return paths instanceof Set ? [...paths] : paths;
}

function findPath(paths, candidate) {
  const list = asList(paths);
  if (list.includes(candidate)) return candidate;
  const lower = candidate.toLowerCase();
  return list.find((item) => item.toLowerCase() === lower) || null;
}

export function resolveWiki(target, from, paths) {
  let needle = String(target).trim().replace(/\\/g, "/");
  if (!needle) return null;
  if (needle.startsWith("/")) needle = needle.slice(1);
  needle = needle.replace(/\.md$/i, "");
  if (!needle) return null;

  const list = asList(paths);
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const relative = findPath(list, normalizePath(`${dir ? `${dir}/` : ""}${needle}.md`));
  if (relative) return relative;
  const absolute = findPath(list, normalizePath(`${needle}.md`));
  if (absolute) return absolute;

  const folded = needle.toLowerCase();
  const matches = list.filter((item) => {
    const stem = item.replace(/\.md$/i, "").toLowerCase();
    return stem === folded || stem.endsWith(`/${folded}`);
  });
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const top = from.split("/")[0];
  const sameFolder = matches.filter((item) => item === top || item.startsWith(`${top}/`));
  return (sameFolder.length ? sameFolder : matches)[0];
}

function splitHash(href) {
  const index = href.indexOf("#");
  if (index === -1) return { path: href, hash: "" };
  return { path: href.slice(0, index), hash: href.slice(index + 1) };
}

export function resolveMdHref(href, from, paths) {
  const trimmed = String(href || "").trim();
  if (!trimmed) return { kind: "missing", path: "" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (/^(https?:|mailto:)/i.test(trimmed)) return { kind: "external", href: trimmed };
    return { kind: "missing", path: trimmed };
  }

  const { path: pathPart, hash } = splitHash(trimmed);
  if (!pathPart) return { kind: "hash", hash: hash ? slugify(hash) : "" };

  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  let combined = pathPart.startsWith("/")
    ? pathPart.replace(/^\/+/, "")
    : normalizePath(`${dir ? `${dir}/` : ""}${pathPart}`);
  if (!/\.[a-z0-9]+$/i.test(combined)) combined += ".md";
  if (!/\.md$/i.test(combined)) return { kind: "external", href: trimmed };

  const found = findPath(asList(paths), combined);
  if (!found) return { kind: "missing", path: combined };
  return { kind: "note", path: found, hash: hash ? slugify(hash) : "" };
}

export function replaceWiki(inner, from, paths) {
  let target = inner.trim();
  let label = "";
  const pipe = target.indexOf("|");
  if (pipe !== -1) {
    label = target.slice(pipe + 1).trim();
    target = target.slice(0, pipe).trim();
  }
  let hash = "";
  const hashAt = target.indexOf("#");
  if (hashAt !== -1) {
    hash = target.slice(hashAt + 1).trim();
    target = target.slice(0, hashAt).trim();
  }
  if (!label) {
    const base = (target || hash).split("/").pop() || "note";
    label = base.replace(/\.md$/i, "");
  }
  label = label.replace(/[\[\]]/g, "");
  const resolved = target ? resolveWiki(target, from, paths) : from;
  if (!resolved) return label;
  // Leading slash marks a vault path so the link renderer does not
  // resolve it again relative to the current note.
  const href = `/${resolved}${hash ? `#${slugify(hash)}` : ""}`;
  return `[${label}](${href})`;
}

export function preprocessWikis(body, from, paths) {
  const parts = String(body).split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => replaceWiki(inner, from, paths));
    })
    .join("");
}

export function searchNotes(notes, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  for (const note of notes) {
    const title = note.title.toLowerCase();
    const titleAt = title.indexOf(needle);
    const bodyAt = note.plain.toLowerCase().indexOf(needle);
    if (titleAt === -1 && bodyAt === -1) continue;
    let snippet = "";
    if (bodyAt !== -1) {
      const start = Math.max(0, bodyAt - 48);
      const end = Math.min(note.plain.length, bodyAt + needle.length + 88);
      snippet = `${start > 0 ? "…" : ""}${note.plain.slice(start, end).trim()}${end < note.plain.length ? "…" : ""}`;
    } else {
      snippet = note.plain.slice(0, 120);
    }
    hits.push({
      note,
      snippet,
      rank: titleAt === -1 ? 2 : titleAt === 0 ? 0 : 1,
    });
  }
  hits.sort((a, b) => a.rank - b.rank || a.note.title.localeCompare(b.note.title));
  return hits;
}

export function highlight(text, query) {
  const needle = query.trim();
  if (!needle) return escapeHtml(text);
  const lower = text.toLowerCase();
  const folded = needle.toLowerCase();
  let index = 0;
  let html = "";
  while (index < text.length) {
    const at = lower.indexOf(folded, index);
    if (at === -1) {
      html += escapeHtml(text.slice(index));
      break;
    }
    html += escapeHtml(text.slice(index, at));
    html += `<mark>${escapeHtml(text.slice(at, at + folded.length))}</mark>`;
    index = at + folded.length;
  }
  return html;
}

export function homePath(notes) {
  return notes.find((note) => /^index\.md$/i.test(note.path))?.path || notes[0]?.path || "";
}

export function routeFromLocation(pathname) {
  if (!pathname.startsWith("/n/")) return "";
  try {
    return pathname
      .slice(3)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return pathname.slice(3);
  }
}
