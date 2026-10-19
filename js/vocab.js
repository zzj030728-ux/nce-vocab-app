// vocab.js — vocabulary lookup + SRS storage
const Vocab = {
  data: {},

  async load(book) {
    if (this.data[book]) return;
    try {
      const res = await fetch(`data/vocab-${book}.json`);
      if (res.ok) {
        const raw = await res.json();
        if (Array.isArray(raw)) {
          this.data[book] = raw;
        } else if (raw && typeof raw === "object") {
          this.data[book] = raw[book] || raw.nce1 || raw.nce2 || raw.nce3 || raw.nce4 || Object.values(raw).find(Array.isArray) || [];
        } else {
          this.data[book] = [];
        }
        return;
      }
    } catch (e) {}
    this.data[book] = [];
  },

  lookup(book, word) {
    const list = this.data[book] || [];
    const w = (word || "").toLowerCase().replace(/[^a-z'-]/gi, "");
    if (!w) return null;
    return list.find(item => (item.word || "").toLowerCase() === w) || null;
  },

  getSaved() {
    try { return JSON.parse(localStorage.getItem("nce-saved") || "[]"); }
    catch { return []; }
  },

  saveWord(entry) {
    const saved = this.getSaved();
    if (!saved.some(w => w.word === entry.word)) {
      saved.unshift({
        ...entry,
        interval: 0,
        due: Date.now(),
        reps: 0,
        savedAt: Date.now()
      });
      localStorage.setItem("nce-saved", JSON.stringify(saved));
    }
  },

  removeWord(word) {
    const saved = this.getSaved().filter(w => w.word !== word);
    localStorage.setItem("nce-saved", JSON.stringify(saved));
  },

  getDue() {
    const now = Date.now();
    return this.getSaved().filter(w => (w.due || 0) <= now);
  },

  review(word, rating) {
    const saved = this.getSaved();
    const item = saved.find(w => w.word === word);
    if (!item) return;
    const intervals = { 1: 0, 2: Math.max(1, (item.interval || 0) * 2 || 1), 3: Math.max(3, (item.interval || 0) * 3 || 3) };
    item.interval = intervals[rating] || 1;
    item.due = Date.now() + item.interval * 24 * 3600 * 1000;
    item.reps = (item.reps || 0) + 1;
    localStorage.setItem("nce-saved", JSON.stringify(saved));
  },

  getProgress() {
    try { return JSON.parse(localStorage.getItem("nce-progress") || "{}"); }
    catch { return {}; }
  },

  markDone(lessonId) {
    const p = this.getProgress();
    p[lessonId] = Date.now();
    localStorage.setItem("nce-progress", JSON.stringify(p));
  },

  isDone(lessonId) {
    return !!this.getProgress()[lessonId];
  }
};

window.Vocab = Vocab;
