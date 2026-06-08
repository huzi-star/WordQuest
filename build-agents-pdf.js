// Convert AGENTS.md → AGENTS.pdf using locally installed Chrome (headless).
// No npm install needed — uses only built-in modules + a tiny inline markdown render.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const MD = path.join(ROOT, 'AGENTS.md');
const HTML = path.join(ROOT, 'AGENTS.html');
const PDF = path.join(ROOT, 'AGENTS.pdf');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inTable = false;
  let inCode = false;
  let inList = null; // 'ul' | 'ol' | null
  let inBlockquote = false;

  function closeList() {
    if (inList) { out.push(`</${inList}>`); inList = null; }
  }
  function closeBlockquote() {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    if (ln.startsWith('```')) {
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { closeList(); closeBlockquote(); out.push('<pre><code>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(ln)); continue; }

    // Table detection (line with at least 2 pipes + next line is separator)
    if (ln.includes('|') && !inTable && lines[i + 1] && /^\s*\|?\s*[-: ]+\s*(\|\s*[-: ]+\s*)+\|?\s*$/.test(lines[i + 1])) {
      closeList(); closeBlockquote();
      inTable = true;
      const headers = ln.split('|').map((c) => c.trim()).filter((c, idx, a) => !(idx === 0 && c === '') && !(idx === a.length - 1 && c === ''));
      out.push('<table><thead><tr>');
      headers.forEach((h) => out.push(`<th>${inline(h)}</th>`));
      out.push('</tr></thead><tbody>');
      i++; // skip separator
      continue;
    }
    if (inTable) {
      if (!ln.includes('|') || ln.trim() === '') {
        out.push('</tbody></table>');
        inTable = false;
      } else {
        const cells = ln.split('|').map((c) => c.trim()).filter((c, idx, a) => !(idx === 0 && c === '') && !(idx === a.length - 1 && c === ''));
        out.push('<tr>');
        cells.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
        continue;
      }
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (h) { closeList(); closeBlockquote(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(ln.trim())) { closeList(); closeBlockquote(); out.push('<hr/>'); continue; }

    // Blockquote
    if (ln.startsWith('> ')) {
      closeList();
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      out.push(`<p>${inline(ln.slice(2))}</p>`);
      continue;
    } else closeBlockquote();

    // Lists
    const ol = /^(\d+)\.\s+(.*)$/.exec(ln);
    const ul = /^[-*]\s+(.*)$/.exec(ln);
    if (ol) {
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    if (ul) {
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    if (ln.trim() === '') { closeList(); out.push(''); continue; }

    // Paragraph
    out.push(`<p>${inline(ln)}</p>`);
  }
  closeList();
  closeBlockquote();
  if (inTable) out.push('</tbody></table>');
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

const md = fs.readFileSync(MD, 'utf8');
const body = mdToHtml(md);

const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>WordQuest — AI Agent Reference</title>
<style>
  @page { margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:#1f2937; line-height:1.55; font-size:11.5pt; }
  h1 { font-size:26pt; color:#0f766e; border-bottom:3px solid #0d9488; padding-bottom:8px; margin-top:0; }
  h2 { font-size:17pt; color:#0c4a6e; margin-top:28px; border-left:4px solid #0ea5e9; padding-left:10px; }
  h3 { font-size:13pt; color:#374151; margin-top:18px; }
  h4 { font-size:11.5pt; color:#475569; margin-top:14px; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 10px 22px; }
  li { margin: 3px 0; }
  code { background:#f1f5f9; color:#be185d; padding:1px 5px; border-radius:4px; font-family:"Consolas","Courier New",monospace; font-size:0.92em; }
  pre { background:#0f172a; color:#e2e8f0; padding:12px 16px; border-radius:8px; overflow-x:auto; font-size:0.92em; }
  pre code { background:transparent; color:inherit; padding:0; }
  a { color:#0369a1; text-decoration:none; border-bottom:1px dotted #0369a1; }
  blockquote { border-left:4px solid #f59e0b; background:#fffbeb; padding:8px 14px; margin:10px 0; color:#78350f; border-radius:4px; }
  hr { border:none; border-top:1px solid #cbd5e1; margin:24px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10.5pt; }
  th { background:#0f766e; color:#fff; padding:8px 10px; text-align:left; border:1px solid #134e4a; }
  td { padding:7px 10px; border:1px solid #cbd5e1; vertical-align: top; }
  tr:nth-child(even) td { background:#f8fafc; }
  strong { color:#0f172a; }
</style></head><body>
${body}
</body></html>`;

fs.writeFileSync(HTML, html);
console.log('HTML written:', HTML);

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cmd = `"${CHROME}" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="${PDF}" "file:///${HTML.replace(/\\/g, '/')}"`;
console.log('Running Chrome headless...');
execSync(cmd, { stdio: 'inherit' });
console.log('PDF written:', PDF);
