// write.js — 短写练习：本课造句 + 小作文；草稿 localStorage；复制批改提示词；可选本机 DSH
const Write = {
  DRAFTS_KEY: "nce-write-drafts",
  ENDPOINT_KEY: "nce-dsh-endpoint",
  HISTORY_MAX: 20,

  lessonKey(lesson) {
    if (!lesson) return "unknown";
    if (lesson.id) return String(lesson.id);
    return String(lesson.book || "x") + ":" + String(lesson.title || "");
  },

  getEndpoint() {
    try {
      return String(localStorage.getItem(this.ENDPOINT_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  },

  setEndpoint(url) {
    const v = String(url || "").trim();
    if (v) localStorage.setItem(this.ENDPOINT_KEY, v);
    else localStorage.removeItem(this.ENDPOINT_KEY);
  },

  _allDrafts() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.DRAFTS_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (e) {
      return {};
    }
  },

  _saveAll(map) {
    localStorage.setItem(this.DRAFTS_KEY, JSON.stringify(map));
  },

  loadDrafts(lessonId) {
    const all = this._allDrafts();
    const slot = all[lessonId] || {};
    return {
      sentence: typeof slot.sentence === "string" ? slot.sentence : "",
      essay: typeof slot.essay === "string" ? slot.essay : "",
      history: Array.isArray(slot.history) ? slot.history : [],
      updatedAt: slot.updatedAt || 0
    };
  },

  saveDraft(lessonId, type, text) {
    const id = String(lessonId || "unknown");
    const t = type === "essay" ? "essay" : "sentence";
    const all = this._allDrafts();
    const slot = all[id] || { sentence: "", essay: "", history: [] };
    const trimmed = String(text || "");
    slot[t] = trimmed;
    slot.updatedAt = Date.now();
    if (trimmed.trim()) {
      const hist = Array.isArray(slot.history) ? slot.history.slice() : [];
      hist.unshift({
        type: t,
        text: trimmed.trim().slice(0, 500),
        at: Date.now()
      });
      while (hist.length > this.HISTORY_MAX) hist.pop();
      // de-dupe consecutive identical
      if (hist.length > 1 && hist[0].text === hist[1].text && hist[0].type === hist[1].type) {
        hist.splice(1, 1);
      }
      slot.history = hist;
    }
    all[id] = slot;
    this._saveAll(all);
    return slot;
  },

  /**
   * Heuristic prompts from lesson EN/CN (no NLP / no remote LLM).
   * @returns {{ sentence: {id,title,instruction,hints,sourceEn,sourceCn}, essay: {...}, lessonTitle }}
   */
  generatePrompts(lesson) {
    const title = (lesson && lesson.title) || "本课";
    const sents = (lesson && Array.isArray(lesson.sentences)) ? lesson.sentences : [];
    const enList = [];
    const cnList = [];
    const words = [];
    const seenW = new Set();
    const stop = new Set([
      "the","a","an","to","of","in","on","at","for","and","or","but","is","are","am","was","were",
      "i","you","he","she","we","they","it","my","your","his","her","our","their","this","that",
      "do","does","did","have","has","had","will","would","can","could","not","no","yes","so","as",
      "with","from","by","up","out","about","into","very","much","thank","thanks","please","pardon",
      "excuse","me","too","just","also","here","there"
    ]);

    sents.forEach(s => {
      const en = String((s && s.en) || "").replace(/\s+/g, " ").trim();
      const cn = String((s && s.cn) || "").replace(/\s+/g, " ").trim();
      if (en) enList.push(en);
      if (cn) cnList.push(cn);
      en.split(/\s+/).forEach(tok => {
        const clean = tok.replace(/^[^\w']+|[^\w']+$/g, "");
        const lower = clean.toLowerCase();
        if (!clean || clean.length < 4 || stop.has(lower)) return;
        if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(clean)) return;
        if (seenW.has(lower)) return;
        seenW.add(lower);
        words.push(clean);
      });
    });

    // pick a mid-length model sentence for imitation
    let model = enList.find(e => {
      const n = e.split(/\s+/).length;
      return n >= 5 && n <= 14;
    }) || enList[0] || "";
    let modelCn = "";
    if (model) {
      const idx = enList.indexOf(model);
      modelCn = cnList[idx] || cnList[0] || "";
    }

    const hintWords = words.slice(0, 6);
    const topicCn = cnList.slice(0, 3).join("；") || title;
    const topicEn = enList.slice(0, 2).join(" / ") || title;

    const sentence = {
      id: "sentence",
      title: "造句",
      instruction:
        "请用本课相关词汇或句型，写 1 句完整、通顺的英文（不要照抄原句）。" +
        (model ? " 可参考结构，但换成新内容。" : ""),
      hints: hintWords,
      sourceEn: model,
      sourceCn: modelCn,
      guide: model
        ? `参考原句：${model}${modelCn ? "（" + modelCn + "）" : ""}`
        : "结合本课主题自由造句。"
    };

    const essay = {
      id: "essay",
      title: "小作文（40～60 词）",
      instruction:
        "根据本课主题写一段英文小作文，约 40～60 个英文单词。可用第一人称；注意时态一致、句子完整。",
      hints: hintWords.slice(0, 4),
      sourceEn: topicEn,
      sourceCn: topicCn,
      guide: `主题线索：${topicCn}${topicEn ? " / " + topicEn : ""}`
    };

    return { sentence, essay, lessonTitle: title };
  },

  wordCount(text) {
    const t = String(text || "").trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  },

  /**
   * Build a paste-ready critique prompt (Chinese instructions + English student text).
   * @param {object} prompt - one of generatePrompts().sentence / .essay
   * @param {string} userText
   * @param {string} [lessonTitle]
   */
  buildCritiquePrompt(prompt, userText, lessonTitle) {
    const p = prompt || {};
    const title = lessonTitle || "NCE lesson";
    const kind = p.id === "essay" ? "小作文（目标约 40～60 词）" : "造句（1 句）";
    const body = String(userText || "").trim() || "（学生尚未填写）";
    const wc = this.wordCount(body);
    const lines = [
      "你是一位耐心的英语写作老师。请用【中文】批改下面这篇学生短写，并给出可执行的改进建议。",
      "",
      "【课文】" + title,
      "【题型】" + kind,
      "【题目要求】" + (p.instruction || ""),
      p.guide ? "【参考线索】" + p.guide : "",
      p.hints && p.hints.length ? "【可用词汇提示】" + p.hints.join(", ") : "",
      "",
      "【学生英文习作】（约 " + wc + " 词）",
      body,
      "",
      "请按以下结构回复：",
      "1. 总体评价（1～2 句）",
      "2. 语法与用词问题（逐条列出：原文片段 → 问题 → 修改建议）",
      "3. 润色后的参考范文（保持学生原意，难度贴近新概念）",
      "4. 下一句可练的表达（2～3 个短语或句型）",
      "",
      "语气鼓励、具体，不要只给分数。"
    ];
    return lines.filter(l => l !== "").join("\n");
  },

  async copyText(text) {
    const t = String(text || "");
    if (!t) return false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(t);
        return true;
      } catch (e) { /* fall through */ }
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  },

  /**
   * Optional: POST critique prompt to user-configured local DeepSeek Harness.
   * Expected to fail on phone / remote Pages (cannot reach user's localhost).
   */
  async sendToLocalCritique(endpoint, payload) {
    const url = String(endpoint || "").trim();
    if (!url) throw new Error("未配置本机批改地址");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || ("HTTP " + res.status);
        throw new Error(msg);
      }
      return data;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("本机批改超时。手机/云端 Pages 无法直连你电脑的 localhost，请改用「复制批改提示词」。");
      }
      const m = (err && err.message) || String(err);
      if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m) || m === "Failed to fetch") {
        throw new Error("无法连接本机批改服务。仅本机浏览器访问 localhost 时可用；手机请用「复制批改提示词」粘贴到 DeepSeek/ChatGPT。");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  formatHistoryTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, "0");
    return (d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
};

window.Write = Write;
