import { escapeHtml, noteHref, preprocessWikis, resolveMdHref, slugify } from "./lib.js";

const LANG = {
  bash: "shell",
  sh: "shell",
  shell: "shell",
  text: "text",
  json: "json",
  nasm: "nasm",
  mermaid: "diagram",
  md: "markdown",
  javascript: "js",
  js: "js",
};

export function createMarkdown(marked) {
  const renderer = new marked.Renderer();
  marked.setOptions({
    renderer,
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false,
  });

  return function renderMarkdown(body, from, paths) {
    const used = new Map();
    renderer.heading = (text, level, raw) => {
      let id = slugify(raw) || "section";
      const seen = used.get(id) || 0;
      used.set(id, seen + 1);
      if (seen) id = `${id}-${seen + 1}`;
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    };
    renderer.link = (href, title, text) => {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      const resolved = resolveMdHref(href, from, paths);
      if (resolved.kind === "note") {
        return `<a href="${escapeHtml(noteHref(resolved.path, resolved.hash))}"${titleAttr}>${text}</a>`;
      }
      if (resolved.kind === "hash") {
        return `<a href="#${escapeHtml(resolved.hash)}"${titleAttr}>${text}</a>`;
      }
      if (resolved.kind === "external") {
        return `<a href="${escapeHtml(resolved.href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return `<span class="missing">${text}</span>`;
    };
    renderer.code = (code, infostring, escaped) => {
      const lang = (infostring || "").trim().split(/\s+/)[0] || "";
      const label = LANG[lang] || lang;
      const bodyHtml = escaped ? code : escapeHtml(code);
      const badge = label ? `<span class="lang">${escapeHtml(label)}</span>` : "";
      return `<div class="codeblock">${badge}<pre><code>${bodyHtml}</code></pre></div>\n`;
    };
    // Notes contain literals such as <task> and <sys/errno.h>. Show them as text.
    renderer.html = (html) => escapeHtml(html);

    return marked.parse(preprocessWikis(body, from, paths));
  };
}
