// lrc.js — shared LRC parser (used by NCE lessons + user materials)
function parseLrcTime(tag) {
  const m = String(tag || "").match(/(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseFloat(m[2]);
}

function parseLrc(text) {
  const lines = [];
  for (const raw of (text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[(\d+:\d+(?:\.\d+)?)\](.*)$/);
    if (!m) continue;
    const start = parseLrcTime(m[1]);
    let body = (m[2] || "").trim();
    if (!body) continue;
    let en = body;
    let cn = "";
    const pipe = body.indexOf("|");
    if (pipe >= 0) {
      en = body.slice(0, pipe).trim();
      cn = body.slice(pipe + 1).trim();
    }
    if (!en) continue;
    lines.push({ en, cn, start });
  }
  for (let i = 0; i < lines.length; i++) {
    lines[i].end = i + 1 < lines.length ? lines[i + 1].start : lines[i].start + 4;
  }
  return lines;
}

window.parseLrc = parseLrc;
window.parseLrcTime = parseLrcTime;
