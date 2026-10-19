// materials.js — user-imported MP3+LRC pairs in IndexedDB (compliant: no bundled textbooks)
const Materials = {
  DB_NAME: "nce-materials",
  DB_VER: 1,
  STORE: "lessons",
  _db: null,

  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error || new Error("IndexedDB 打开失败"));
    });
  },

  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, "readonly");
      const req = tx.objectStore(this.STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result || []).map(r => ({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt,
          hasAudio: !!r.audioBlob,
          hasLrc: !!r.lrcText
        }));
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, "readonly");
      const req = tx.objectStore(this.STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async save(record) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).put(record);
      tx.oncomplete = () => resolve(record.id);
      tx.onerror = () => reject(tx.error);
    });
  },

  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, "readwrite");
      tx.objectStore(this.STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  basename(name) {
    return String(name || "").replace(/\.[^.]+$/, "").trim();
  },

  /** Pair .mp3/.lrc by basename; return [{title, mp3File, lrcFile}] */
  pairFiles(fileList) {
    const files = Array.from(fileList || []);
    const mp3 = {};
    const lrc = {};
    for (const f of files) {
      const base = this.basename(f.name).toLowerCase();
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      if (ext === "mp3" || ext === "m4a" || ext === "wav" || ext === "ogg") mp3[base] = f;
      else if (ext === "lrc") lrc[base] = f;
    }
    const keys = new Set([...Object.keys(mp3), ...Object.keys(lrc)]);
    const pairs = [];
    for (const k of keys) {
      pairs.push({
        title: this.basename((mp3[k] || lrc[k]).name),
        mp3File: mp3[k] || null,
        lrcFile: lrc[k] || null
      });
    }
    return pairs;
  },

  async importFiles(fileList) {
    const pairs = this.pairFiles(fileList);
    if (!pairs.length) throw new Error("未找到 .mp3 / .lrc 文件");
    const results = [];
    for (const p of pairs) {
      if (!p.mp3File || !p.lrcFile) {
        results.push({ title: p.title, ok: false, reason: "需同名 .mp3 与 .lrc 成对" });
        continue;
      }
      const lrcText = await p.lrcFile.text();
      const sentences = parseLrc(lrcText);
      if (!sentences.length) {
        results.push({ title: p.title, ok: false, reason: "LRC 无有效字幕行" });
        continue;
      }
      const id = "mat-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      await this.save({
        id,
        title: p.title,
        createdAt: Date.now(),
        audioBlob: p.mp3File,
        lrcText,
        mime: p.mp3File.type || "audio/mpeg"
      });
      results.push({ title: p.title, ok: true, id, lines: sentences.length });
    }
    return results;
  },

  /** Build lesson object + object URL for Player */
  async loadLesson(id) {
    const rec = await this.get(id);
    if (!rec) throw new Error("教材不存在");
    const sentences = parseLrc(rec.lrcText || "");
    const audioUrl = rec.audioBlob ? URL.createObjectURL(rec.audioBlob) : "";
    return {
      id: rec.id,
      book: "materials",
      title: rec.title,
      sentences,
      audio: audioUrl,
      _objectUrl: audioUrl
    };
  }
};

window.Materials = Materials;
