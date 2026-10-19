// book.js — fetch & parse remote xlsx/xls/txt word lists via SheetJS
const BookLoader = {
  RAW_BASE: "https://raw.githubusercontent.com/lilinji/English/main/",
  cache: {},
  PAGE_SIZE: 80,

  encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  },

  rawUrl(path) {
    return this.RAW_BASE + this.encodePath(path);
  },

  normalizeHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, "");
  },

  mapColumns(headers) {
    const norms = headers.map(h => this.normalizeHeader(h));
    const find = (...cands) => {
      for (const c of cands) {
        const i = norms.findIndex(n => n === c || n.includes(c));
        if (i >= 0) return i;
      }
      return -1;
    };
    return {
      word: find("单词", "词", "word", "vocabulary", "lemma", "english", "英文"),
      ipa: find("英音", "美音", "音标", "phonetic", "ipa", "pronunciation", "发音"),
      ipaUk: find("英音", "uk", "brE", "british"),
      ipaUs: find("美音", "us", "amE", "american"),
      definition: find("释义", "定义", "definition", "meaning", "中文", "翻译", "解释", "词义"),
      example: find("例句", "example", "句", "sentence", "样例")
    };
  },

  pickIpa(row, map) {
    const parts = [];
    if (map.ipaUk >= 0 && row[map.ipaUk]) parts.push(String(row[map.ipaUk]).trim());
    if (map.ipaUs >= 0 && row[map.ipaUs] && map.ipaUs !== map.ipaUk) {
      const us = String(row[map.ipaUs]).trim();
      if (us && !parts.includes(us)) parts.push(us);
    }
    if (!parts.length && map.ipa >= 0 && row[map.ipa]) {
      parts.push(String(row[map.ipa]).trim());
    }
    return parts.filter(Boolean).join(" / ");
  },

  rowToEntry(row, map) {
    if (!Array.isArray(row)) return null;
    const wi = map.word >= 0 ? map.word : 0;
    const word = String(row[wi] != null ? row[wi] : "").trim();
    if (!word || !/[a-zA-Z]/.test(word)) return null;
    // skip header-like rows
    const wl = word.toLowerCase();
    if (["单词", "词", "word", "vocabulary", "lemma"].includes(wl)) return null;
    const definition = map.definition >= 0 ? String(row[map.definition] || "").trim() : "";
    const example = map.example >= 0 ? String(row[map.example] || "").trim() : "";
    const ipa = this.pickIpa(row, map);
    return { word, ipa, definition, example };
  },

  parseSheet(workbook) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    if (!rows.length) return [];
    // find header row among first 5
    let headerIdx = 0;
    let map = this.mapColumns(rows[0] || []);
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const m = this.mapColumns(rows[i] || []);
      if (m.word >= 0) {
        headerIdx = i;
        map = m;
        break;
      }
    }
    let start = 0;
    if (map.word >= 0) {
      start = headerIdx + 1;
    } else {
      // fallback: first column is word, second definition-ish
      map = { word: 0, ipa: -1, ipaUk: -1, ipaUs: -1, definition: 1, example: -1 };
      start = 0;
      const probe = String((rows[0] || [])[0] || "").toLowerCase();
      if (["单词", "词", "word", "vocabulary"].includes(probe)) start = 1;
    }
    const entries = [];
    const seen = new Set();
    for (let i = start; i < rows.length; i++) {
      const entry = this.rowToEntry(rows[i], map);
      if (!entry) continue;
      const key = entry.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
    return entries;
  },

  parseTxt(text) {
    const lines = String(text || "").split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    // try tab / comma / pipe
    const sep = lines[0].includes("\t") ? "\t" : lines[0].includes("|") ? "|" : ",";
    const rows = lines.map(l => l.split(sep).map(c => c.trim()));
    let map = this.mapColumns(rows[0]);
    let start = 0;
    if (map.word >= 0) start = 1;
    else map = { word: 0, ipa: -1, ipaUk: -1, ipaUs: -1, definition: Math.min(1, (rows[0] || []).length - 1), example: -1 };
    const entries = [];
    const seen = new Set();
    for (let i = start; i < rows.length; i++) {
      const entry = this.rowToEntry(rows[i], map);
      if (!entry) continue;
      const key = entry.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
    return entries;
  },

  async load(book) {
    const path = book.path || book;
    if (this.cache[path]) return this.cache[path];
    if (typeof XLSX === "undefined") {
      throw new Error("表格解析库未加载，请检查网络后刷新");
    }
    const url = this.rawUrl(path);
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      throw new Error("网络请求失败，无法从 GitHub 拉取词表（国内可能需代理）");
    }
    if (!res.ok) {
      throw new Error("词表下载失败 (" + res.status + ")");
    }
    const ext = (book.ext || path.split(".").pop() || "").toLowerCase();
    let entries;
    if (ext === "txt") {
      const text = await res.text();
      entries = this.parseTxt(text);
    } else {
      const buf = await res.arrayBuffer();
      let workbook;
      try {
        workbook = XLSX.read(buf, { type: "array" });
      } catch (e) {
        throw new Error("表格解析失败，文件格式可能不兼容");
      }
      entries = this.parseSheet(workbook);
    }
    if (!entries.length) {
      throw new Error("未解析到单词，可能是空表或列名无法识别");
    }
    const result = { path, entries, name: book.name || path.split("/").pop() };
    this.cache[path] = result;
    return result;
  },

  filterEntries(entries, q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return entries;
    return entries.filter(e =>
      e.word.toLowerCase().includes(s) ||
      (e.definition || "").toLowerCase().includes(s) ||
      (e.ipa || "").toLowerCase().includes(s)
    );
  },

  page(entries, page, size) {
    const ps = size || this.PAGE_SIZE;
    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / ps));
    const p = Math.min(Math.max(1, page || 1), pages);
    const start = (p - 1) * ps;
    return {
      items: entries.slice(start, start + ps),
      page: p,
      pages,
      total,
      size: ps
    };
  }
};

window.BookLoader = BookLoader;
