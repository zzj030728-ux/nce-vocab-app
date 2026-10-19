// drill.js — 句型口头练习 + 听写默写（启发式，无 NLP）
const Drill = {
  MISSED_KEY: "nce-missed",
  PRACTICED_KEY: "nce-drill-practiced",

  STOPWORDS: new Set([
    "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or", "but",
    "is", "are", "am", "was", "were", "be", "been", "being",
    "i", "you", "he", "she", "we", "they", "it", "my", "your", "his", "her", "our", "their",
    "this", "that", "these", "those", "there", "here",
    "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "should", "may", "might",
    "not", "no", "yes", "so", "as", "if", "than", "then", "with", "from", "by", "up", "out", "about",
    "into", "over", "after", "before", "between", "under", "again", "further", "once",
    "what", "which", "who", "whom", "whose", "where", "when", "why", "how",
    "all", "each", "few", "more", "most", "other", "some", "such", "only", "own", "same",
    "too", "very", "just", "also", "mr", "mrs", "ms", "dr"
  ]),

  HINT_BANK: [
    "a book", "my friend", "the park", "coffee", "happy", "tired",
    "to school", "every day", "at home", "with me", "a letter", "the door",
    "music", "tea", "breakfast", "tomorrow", "yesterday", "in the morning"
  ],

  CONTENTISH: /^(?!i$|you$|he$|she$|we$|they$|it$)[a-zA-Z][a-zA-Z'-]{2,}$/,

  /** @returns {{ template, original, hints, sentenceIndex, blankWord, id }[]} */
  extractPatterns(sentences) {
    const list = Array.isArray(sentences) ? sentences : [];
    const pronounRe = /^(I|You|He|She|We|They|It)\b/i;
    const verbRe = /\b(am|is|are|was|were|have|has|had|do|does|did|can|will|would|like|likes|want|wants|go|goes|went|see|saw|come|came|make|made|get|got|need|needs|live|lives|work|works|buy|bought|eat|ate|drink|drank|speak|read|write|play|watch|look|feel|think|know|say|said|take|took|give|gave|put|open|opened|close|closed)\b/i;

    const scored = [];
    list.forEach((s, i) => {
      const en = String((s && s.en) || "").replace(/\s+/g, " ").trim();
      if (!en) return;
      const words = en.split(/\s+/);
      if (words.length < 4 || words.length > 16) return;
      let score = 0;
      if (pronounRe.test(en)) score += 2;
      if (verbRe.test(en)) score += 2;
      if (words.length >= 5 && words.length <= 12) score += 1;
      if (score < 2) return;
      scored.push({ en, cn: (s && s.cn) || "", index: i, score, words });
    });

    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    // diversify: skip near-duplicates (same first 3 words)
    const picked = [];
    const seen = new Set();
    for (const c of scored) {
      const key = c.words.slice(0, 3).join(" ").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(c);
      if (picked.length >= 5) break;
    }
    if (picked.length < 3) {
      for (const c of scored) {
        if (picked.includes(c)) continue;
        picked.push(c);
        if (picked.length >= 3) break;
      }
    }

    const lessonWords = this._collectContentWords(list);
    return picked.slice(0, 5).map((c, pi) => {
      const blankIdx = this._pickBlankIndex(c.words);
      const blankRaw = c.words[blankIdx];
      const blankClean = blankRaw.replace(/^[^\w']+|[^\w']+$/g, "");
      const templateWords = c.words.slice();
      templateWords[blankIdx] = "____";
      const template = templateWords.join(" ");
      const hints = this._buildHints(blankClean, lessonWords, c.en);
      return {
        id: "p" + pi + "-" + c.index,
        template,
        original: c.en,
        cn: c.cn,
        hints,
        sentenceIndex: c.index,
        blankWord: blankClean
      };
    });
  },

  _pickBlankIndex(words) {
    // Prefer a mid/late content word (noun-ish heuristic)
    const candidates = [];
    for (let i = 1; i < words.length; i++) {
      const clean = words[i].replace(/^[^\w']+|[^\w']+$/g, "");
      const lower = clean.toLowerCase();
      if (!clean || this.STOPWORDS.has(lower)) continue;
      if (!this.CONTENTISH.test(clean)) continue;
      // skip trailing punctuation-only
      candidates.push(i);
    }
    if (!candidates.length) return Math.max(1, words.length - 2);
    // prefer last third
    const late = candidates.filter(i => i >= Math.floor(words.length * 0.4));
    const pool = late.length ? late : candidates;
    return pool[pool.length - 1];
  },

  _collectContentWords(sentences) {
    const out = [];
    const seen = new Set();
    (sentences || []).forEach(s => {
      const en = String((s && s.en) || "");
      en.split(/\s+/).forEach(tok => {
        const clean = tok.replace(/^[^\w']+|[^\w']+$/g, "");
        const lower = clean.toLowerCase();
        if (!clean || this.STOPWORDS.has(lower)) return;
        if (!this.CONTENTISH.test(clean)) return;
        if (seen.has(lower)) return;
        seen.add(lower);
        out.push(clean);
      });
    });
    return out;
  },

  _buildHints(blankWord, lessonWords, original) {
    const hints = [];
    const lowerBlank = (blankWord || "").toLowerCase();
    for (const w of lessonWords) {
      if (w.toLowerCase() === lowerBlank) continue;
      if (hints.length >= 2) break;
      // short phrase-ish: just the word
      hints.push(w);
    }
    for (const h of this.HINT_BANK) {
      if (hints.length >= 3) break;
      if (h.toLowerCase() === lowerBlank) continue;
      if (hints.some(x => x.toLowerCase() === h.toLowerCase())) continue;
      // avoid hint that already appears identically as whole sentence fragment only
      if (original.toLowerCase().includes(h.toLowerCase()) && h.split(/\s+/).length > 1) continue;
      hints.push(h);
    }
    while (hints.length < 2) {
      const extra = this.HINT_BANK[hints.length % this.HINT_BANK.length];
      if (!hints.includes(extra)) hints.push(extra);
      else break;
    }
    return hints.slice(0, 3);
  },

  /**
   * @param {Array} sentences
   * @param {number} n
   * @returns {{ word, sentenceHint, sentenceIndex }[]}
   */
  extractDictationWords(sentences, n) {
    const want = Math.max(5, Math.min(8, n || 6));
    const list = Array.isArray(sentences) ? sentences : [];
    const bag = []; // { word, sentenceHint, sentenceIndex, len }
    const seen = new Set();

    list.forEach((s, i) => {
      const en = String((s && s.en) || "").replace(/\s+/g, " ").trim();
      if (!en) return;
      en.split(/\s+/).forEach(tok => {
        const clean = tok.replace(/^[^\w']+|[^\w']+$/g, "");
        const lower = clean.toLowerCase();
        if (!clean || this.STOPWORDS.has(lower)) return;
        if (clean.length < 3) return;
        if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(clean)) return;
        if (seen.has(lower)) return;
        seen.add(lower);
        bag.push({
          word: clean,
          sentenceHint: en.length > 72 ? en.slice(0, 70) + "…" : en,
          sentenceIndex: i,
          len: clean.length
        });
      });
    });

    // Prefer mid-length content words (4–10), deprioritize light verbs, spread across sentences
    const light = new Set(["like","likes","want","wants","go","goes","get","gets","make","makes","see","saw","come","came","take","took","give","gave","put","say","said"]);
    bag.sort((a, b) => {
      const score = (w) => {
        let s = 0;
        if (w.len >= 4 && w.len <= 10) s += 2;
        if (w.len >= 3 && w.len <= 12) s += 1;
        if (light.has(w.word.toLowerCase())) s -= 2;
        return s;
      };
      return score(b) - score(a) || a.sentenceIndex - b.sentenceIndex;
    });

    const picked = [];
    const usedSent = new Set();
    // first pass: one per sentence
    for (const item of bag) {
      if (picked.length >= want) break;
      if (usedSent.has(item.sentenceIndex)) continue;
      usedSent.add(item.sentenceIndex);
      picked.push({ word: item.word, sentenceHint: item.sentenceHint, sentenceIndex: item.sentenceIndex });
    }
    // fill
    for (const item of bag) {
      if (picked.length >= want) break;
      if (picked.some(p => p.word.toLowerCase() === item.word.toLowerCase())) continue;
      picked.push({ word: item.word, sentenceHint: item.sentenceHint, sentenceIndex: item.sentenceIndex });
    }
    return picked.slice(0, want);
  },

  /* —— 错词本 localStorage nce-missed —— */
  getMissed() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.MISSED_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  },

  addMissed(word, meta) {
    const w = String(word || "").trim();
    if (!w) return;
    const list = this.getMissed();
    const lower = w.toLowerCase();
    const existing = list.find(x => (x.word || "").toLowerCase() === lower);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastAt = Date.now();
      if (meta && meta.sentenceHint) existing.sentenceHint = meta.sentenceHint;
      if (meta && meta.lessonId) existing.lessonId = meta.lessonId;
    } else {
      list.unshift({
        word: w,
        sentenceHint: (meta && meta.sentenceHint) || "",
        lessonId: (meta && meta.lessonId) || "",
        count: 1,
        lastAt: Date.now()
      });
    }
    while (list.length > 200) list.pop();
    localStorage.setItem(this.MISSED_KEY, JSON.stringify(list));
  },

  removeMissed(word) {
    const lower = String(word || "").toLowerCase();
    const list = this.getMissed().filter(x => (x.word || "").toLowerCase() !== lower);
    localStorage.setItem(this.MISSED_KEY, JSON.stringify(list));
  },

  /* —— 句型「练过」勾选 —— */
  _practicedMap() {
    try {
      return JSON.parse(localStorage.getItem(this.PRACTICED_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  },

  isPatternPracticed(lessonKey, patternId) {
    const m = this._practicedMap();
    const lesson = m[lessonKey] || {};
    return !!(lesson.patterns && lesson.patterns[patternId]);
  },

  setPatternPracticed(lessonKey, patternId, on) {
    const m = this._practicedMap();
    if (!m[lessonKey]) m[lessonKey] = { patterns: {} };
    if (!m[lessonKey].patterns) m[lessonKey].patterns = {};
    if (on) m[lessonKey].patterns[patternId] = true;
    else delete m[lessonKey].patterns[patternId];
    localStorage.setItem(this.PRACTICED_KEY, JSON.stringify(m));
  },

  lessonKey(lesson) {
    if (!lesson) return "unknown";
    if (lesson.id) return String(lesson.id);
    return String(lesson.book || "x") + ":" + String(lesson.title || "");
  },

  speak(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (!window.speechSynthesis) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  },

  normalizeAnswer(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z'-]/g, "");
  }
};

window.Drill = Drill;
