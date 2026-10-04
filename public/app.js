import {
  buildTree,
  escapeHtml,
  formatUpdated,
  highlight,
  homePath,
  labelFor,
  listTitle,
  mtimeLabel,
  noteHref,
  parseNote,
  plainText,
  routeFromLocation,
  searchNotes,
  siblingNav,
} from "./lib.js";
import { createMarkdown } from "./render.js";

const markedLib = globalThis.marked;
const article = document.querySelector("#article");
const treeEl = document.querySelector("#tree");
const outlineEl = document.querySelector("#outline");
const search = document.querySelector("#search");
const sidebar = document.querySelector("#sidebar");
const scrim = document.querySelector("#scrim");
const menu = document.querySelector("#menu");
const countEl = document.querySelector("#count");
const rootLabel = document.querySelector("#root-label");
const topTitle = document.querySelector("#top-title");
const reload = document.querySelector("#reload");

if (!markedLib) {
  article.innerHTML = `<p class="status">The markdown parser did not load.</p>`;
  throw new Error("marked missing");
}

const renderMarkdown = createMarkdown(markedLib);
const state = {
  notes: [],
  byPath: new Map(),
  paths: [],
  tree: null,
  root: "",
  current: "",
};

function setStatus(message) {
  outlineEl.hidden = true;
  outlineEl.innerHTML = "";
  article.innerHTML = `<p class="status">${escapeHtml(message)}</p>`;
  topTitle.textContent = "Club Sandwich";
  document.title = "Club Sandwich";
}

function isMobile() {
  return window.matchMedia("(max-width: 800px)").matches;
}

function openSidebar() {
  if (!isMobile()) return;
  sidebar.classList.add("open");
  scrim.hidden = false;
  menu.setAttribute("aria-expanded", "true");
  document.body.classList.add("nav-open");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  scrim.hidden = true;
  menu.setAttribute("aria-expanded", "false");
  document.body.classList.remove("nav-open");
}

function go(notePath, jump = "") {
  const url = noteHref(notePath, jump);
  if (`${location.pathname}${location.hash}` === url) {
    showCurrent();
    return;
  }
  history.pushState(null, "", url);
  showCurrent();
}

function crumbFor(notePath) {
  return notePath
    .split("/")
    .slice(0, -1)
    .map((part) => labelFor(part))
    .join("  ·  ");
}

function renderFolder(node) {
  const notes = node.notes
    .map((note) => {
      return `<a class="note-link" data-path="${escapeHtml(note.path)}" href="${escapeHtml(noteHref(note.path))}">${escapeHtml(listTitle(note))}</a>`;
    })
    .join("");
  const folders = node.folders
    .map((folder) => {
      return `<section class="folder">
        <p class="folder-label" data-folder="${escapeHtml(folder.name)}">${escapeHtml(folder.label)}</p>
        ${renderFolder(folder)}
      </section>`;
    })
    .join("");
  return notes + folders;
}

function renderSearch(query) {
  const hits = searchNotes(state.notes, query);
  if (hits.length === 0) {
    treeEl.innerHTML = `<p class="empty">No notes match “${escapeHtml(query.trim())}”.</p>`;
    return;
  }
  treeEl.innerHTML = `<p class="result-count">${hits.length} ${hits.length === 1 ? "note" : "notes"}</p>${hits
    .map(({ note, snippet }) => {
      return `<a class="result" data-path="${escapeHtml(note.path)}" href="${escapeHtml(noteHref(note.path))}">
        <span class="result-title">${highlight(note.title, query)}</span>
        <span class="result-where">${escapeHtml(crumbFor(note.path) || "Vault")}</span>
        ${snippet ? `<span class="result-snippet">${highlight(snippet, query)}</span>` : ""}
      </a>`;
    })
    .join("")}`;
}

function renderTree() {
  const query = search.value.trim();
  if (query) {
    renderSearch(query);
  } else if (!state.tree) {
    treeEl.innerHTML = "";
  } else {
    treeEl.innerHTML = renderFolder(state.tree);
  }
  markCurrentLink();
}

function markCurrentLink() {
  const current = state.current;
  for (const link of treeEl.querySelectorAll("[data-path]")) {
    const on = link.dataset.path === current;
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function metaLine(note) {
  const bits = [];
  if (note.updated) bits.push(`Updated ${formatUpdated(note.updated)}`);
  else if (note.mtime) bits.push(`Edited ${mtimeLabel(note.mtime)}`);
  return bits.join("  ·  ");
}

function tagsHtml(note) {
  if (!note.tags.length) return "";
  return `<ul class="tags">${note.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
}

function pagerHtml(prev, next) {
  if (!prev && !next) return "";
  const cell = (note, direction, label) => {
    if (!note) return "<span></span>";
    return `<a class="${direction}" href="${escapeHtml(noteHref(note.path))}" rel="${direction}">
      <span class="dir">${label}</span>
      <span class="pager-title">${escapeHtml(note.title)}</span>
    </a>`;
  };
  return `<nav class="pager" aria-label="Nearby notes">${cell(prev, "prev", "Previous")}${cell(next, "next", "Next")}</nav>`;
}

function enhanceArticle() {
  for (const table of article.querySelectorAll(".prose table")) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.appendChild(table);
    for (const cell of table.querySelectorAll("td")) {
      const text = cell.textContent.trim();
      if (text.length > 0 && text.length <= 32 && !/\s/.test(text)) {
        cell.classList.add("nowrap");
      }
    }
  }
  for (const block of article.querySelectorAll(".codeblock")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy";
    button.textContent = "Copy";
    button.addEventListener("click", async () => {
      const code = block.querySelector("code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy failed";
      }
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1200);
    });
    block.appendChild(button);
  }
}

function renderOutline() {
  const heads = [...article.querySelectorAll(".prose h2, .prose h3")];
  if (heads.length < 2) {
    outlineEl.hidden = true;
    outlineEl.innerHTML = "";
    return;
  }
  outlineEl.hidden = false;
  outlineEl.innerHTML = `<p class="outline-label">On this page</p><ol>${heads
    .map((head) => {
      const cls = head.tagName === "H3" ? " class=\"deep\"" : "";
      return `<li${cls}><a href="#${escapeHtml(head.id)}">${escapeHtml(head.textContent || "")}</a></li>`;
    })
    .join("")}</ol>`;
}

function showNote(note, jump) {
  const changed = state.current !== note.path;
  state.current = note.path;
  const { prev, next } = siblingNav(note, state.notes);
  const crumb = crumbFor(note.path);
  const meta = metaLine(note);
  article.innerHTML = `
    ${crumb ? `<p class="crumb">${escapeHtml(crumb)}</p>` : `<p class="crumb">Vault</p>`}
    <h1>${escapeHtml(note.title)}</h1>
    ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
    ${tagsHtml(note)}
    <div class="prose">${renderMarkdown(note.body, note.path, state.paths)}</div>
    <p class="source">${escapeHtml(note.path)}</p>
    ${pagerHtml(prev, next)}
  `;
  enhanceArticle();
  renderOutline();
  markCurrentLink();
  document.title = `${note.title} · Club Sandwich`;
  topTitle.textContent = note.title;

  if (changed) {
    const active = treeEl.querySelector(`[data-path="${CSS.escape(note.path)}"]`);
    active?.scrollIntoView({ block: "nearest" });
    closeSidebar();
  }

  if (jump) {
    const target = document.getElementById(jump);
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  } else if (changed) {
    window.scrollTo(0, 0);
  }
  spyOutline();
}

function showMissing(notePath) {
  state.current = "";
  outlineEl.hidden = true;
  outlineEl.innerHTML = "";
  const home = homePath(state.notes);
  article.innerHTML = `
    <p class="crumb">Missing</p>
    <h1>No note here</h1>
    <p class="status">Nothing in the vault is named ${escapeHtml(notePath)}.</p>
    ${home ? `<p><a class="back" href="${escapeHtml(noteHref(home))}">Back to the index</a></p>` : ""}
  `;
  document.title = "Missing note · Club Sandwich";
  topTitle.textContent = "Missing note";
  markCurrentLink();
}

function showCurrent() {
  if (state.notes.length === 0) {
    setStatus(`No markdown notes in ${state.root || "the notes folder"}.`);
    return;
  }
  const requested = routeFromLocation(location.pathname);
  const path = requested || homePath(state.notes);
  if (!requested && path) {
    history.replaceState(null, "", noteHref(path));
  }
  let jump = "";
  if (location.hash.length > 1) {
    try {
      jump = decodeURIComponent(location.hash.slice(1));
    } catch {
      jump = location.hash.slice(1);
    }
  }
  const note = state.byPath.get(path);
  if (!note) {
    showMissing(path);
    return;
  }
  showNote(note, jump);
}

function adoptVault(payload) {
  state.root = payload.root || "";
  state.notes = (payload.notes || []).map((raw) => {
    const parsed = parseNote(raw.content, raw.path);
    const plain = plainText(`${parsed.title}\n${parsed.body}`);
    return { ...parsed, mtime: raw.mtime, plain };
  });
  state.byPath = new Map(state.notes.map((note) => [note.path, note]));
  state.paths = state.notes.map((note) => note.path);
  state.tree = buildTree(state.notes);
  rootLabel.textContent = state.root || "notes";
  countEl.textContent = `${state.notes.length} ${state.notes.length === 1 ? "note" : "notes"}`;
  renderTree();
  showCurrent();
}

async function loadVault() {
  setStatus("Loading notes…");
  const response = await fetch("/api/vault", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(payload.error || "Could not read the notes folder.");
    treeEl.innerHTML = "";
    countEl.textContent = "";
    return;
  }
  adoptVault(payload);
}

function spyOutline() {
  const links = [...outlineEl.querySelectorAll("a")];
  if (links.length === 0) return;
  let current = links[0].getAttribute("href")?.slice(1) || "";
  for (const link of links) {
    const id = link.getAttribute("href")?.slice(1);
    const head = id ? document.getElementById(id) : null;
    if (head && head.getBoundingClientRect().top < 96) current = id;
  }
  for (const link of links) {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  }
}

search.addEventListener("input", () => {
  search.parentElement.classList.toggle("has-query", search.value.length > 0);
  renderTree();
});

reload.addEventListener("click", () => {
  loadVault().catch((error) => setStatus(error.message));
});

menu.addEventListener("click", () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
});
scrim.addEventListener("click", closeSidebar);

document.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link || link.target === "_blank") return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const url = new URL(link.href, location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/n/")) return;
  event.preventDefault();
  history.pushState(null, "", `${url.pathname}${url.hash}`);
  showCurrent();
});

window.addEventListener("popstate", showCurrent);
window.addEventListener("hashchange", showCurrent);
document.addEventListener("scroll", spyOutline, { passive: true });

document.addEventListener("keydown", (event) => {
  const typing = event.target.closest("input, textarea");
  if (event.key === "Escape") {
    if (search.value) {
      search.value = "";
      search.parentElement.classList.remove("has-query");
      renderTree();
    }
    closeSidebar();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (isMobile()) openSidebar();
    search.focus();
    search.select();
    return;
  }
  if (typing) return;
  if (event.key === "/") {
    event.preventDefault();
    if (isMobile()) openSidebar();
    search.focus();
    return;
  }
  if (event.key === "[" || event.key === "]") {
    const note = state.byPath.get(state.current);
    if (!note) return;
    const { prev, next } = siblingNav(note, state.notes);
    const target = event.key === "[" ? prev : next;
    if (!target) return;
    event.preventDefault();
    go(target.path);
  }
});

loadVault().catch((error) => setStatus(error.message));
