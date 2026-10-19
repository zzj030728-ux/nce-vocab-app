// app.js — 英语词库：词库浏览 + 点读（新概念/我的教材）+ 生词/复习
let currentBook = "nce1";
let currentLesson = null;
let catalogCache = {};
let deferredInstall = null;
let currentCategoryId = null;
let currentVaultBook = null;
let wordPage = 1;
let wordQuery = "";
let loadedEntries = [];
let cardMode = false;
let flashIndex = 0;
let flashFlipped = false;
let listenSub = "nce"; // nce | materials
let readerBackTarget = "listen"; // where back from reader goes
let materialObjectUrl = null;
let modalSpeakWord = "";

function $(id) { return document.getElementById(id); }

function toast(msg) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1600);
}

function setHeader(title, sub) {
  $("header-title").textContent = title || "英语词库";
  $("header-sub").textContent = sub || "全库浏览 · 点读 · 间隔复习";
}

function showView(name) {
  const views = ["vault", "books", "book", "today", "listen", "reader", "vocab", "review"];
  views.forEach(v => {
    const el = $(v + "-view");
    if (!el) return;
    if (v === "reader") {
      el.classList.toggle("active", name === "reader");
      el.style.display = name === "reader" ? "block" : "none";
    } else {
      el.style.display = name === v ? "block" : "none";
    }
  });
  const tabMap = {
    vault: "vault", books: "vault", book: "vault", today: "vault",
    listen: "listen", reader: "listen",
    vocab: "vocab", review: "review"
  };
  const activeTab = tabMap[name] || name;
  document.querySelectorAll(".bottom-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortCatName(name) {
  return name.replace(/^\d+\./, "");
}

function shortSource(s) {
  if (!s) return "";
  if (s.startsWith("nce:")) return "新概念 · " + s.slice(4).toUpperCase();
  if (s.startsWith("material:")) return "我的教材 · " + s.slice(9);
  const parts = s.split("/");
  const last = parts[parts.length - 1] || s;
  return last.replace(/\.(xlsx|xls|txt)$/i, "") || s;
}

function speakEnglish(word) {
  const text = (word || "").trim();
  if (!text) return;
  if (!window.speechSynthesis) {
    toast("当前浏览器不支持语音合成");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function savedWordSet() {
  const set = new Set();
  Vocab.getSaved().forEach(w => {
    if (w && w.word) set.add(String(w.word).toLowerCase());
  });
  return set;
}

function isSavedWord(word) {
  const w = (word || "").toLowerCase().replace(/[^a-z'-]/gi, "");
  if (!w) return false;
  return savedWordSet().has(w) || Vocab.getSaved().some(s => (s.word || "").toLowerCase() === w);
}

function truncateDef(def, n) {
  const s = String(def || "").replace(/\s+/g, " ").trim();
  if (!s) return "暂无释义";
  if (s.length <= (n || 48)) return s;
  return s.slice(0, n || 48) + "…";
}

function renderWordSpans(text) {
  const saved = savedWordSet();
  return text.split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part;
    const clean = part.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!/[a-zA-Z]/.test(clean)) return part;
    const inVocab = saved.has(clean.toLowerCase()) ? " in-vocab" : "";
    return `<span class="word${inVocab}" data-word="${escapeHtml(clean)}">${part}</span>`;
  }).join("");
}

function currentSentenceEn() {
  if (!currentLesson || !Player || Player.currentIndex < 0) return "";
  const s = currentLesson.sentences[Player.currentIndex];
  return (s && s.en) || "";
}

function lookupLoadedEntry(word) {
  const w = (word || "").toLowerCase().replace(/[^a-z'-]/gi, "");
  if (!w || !loadedEntries.length) return null;
  return loadedEntries.find(e => (e.word || "").toLowerCase() === w) || null;
}

/* ========== 词库 ========== */
async function renderVaultHome(q) {
  const grid = $("category-grid");
  grid.innerHTML = `<div class="empty">正在加载词库目录…</div>`;
  showView("vault");
  setHeader("英语词库", "按需加载 · 不打包词表");
  refreshTodayCard();
  try {
    await Catalog.load();
    const cats = Catalog.filteredCategories(q);
    const total = Catalog.totalBooks();
    setHeader("英语词库", `${Catalog.data.categories.length} 个分类 · ${total} 本词书`);
    if (!cats.length) {
      grid.innerHTML = `<div class="empty">没有匹配的分类</div>`;
      return;
    }
    grid.innerHTML = cats.map(c => `
      <button type="button" class="category-card" data-id="${c.id}">
        <span class="cat-icon">${Catalog.categoryIcon(c.name)}</span>
        <span class="cat-name">${escapeHtml(shortCatName(c.name))}</span>
        <span class="cat-count">${Catalog.bookCount(c)} 本</span>
      </button>
    `).join("");
    grid.querySelectorAll(".category-card").forEach(btn => {
      btn.onclick = () => openCategory(btn.dataset.id);
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty">目录加载失败<br>${escapeHtml(err.message || String(err))}</div>`;
  }
}

function openCategory(id) {
  currentCategoryId = id;
  $("books-search").value = "";
  renderBooksList("");
}

function renderBooksList(q) {
  const cat = Catalog.findCategory(currentCategoryId);
  if (!cat) {
    renderVaultHome("");
    return;
  }
  showView("books");
  $("books-title").textContent = cat.name;
  setHeader(shortCatName(cat.name), `${Catalog.bookCount(cat)} 本词书`);
  const books = Catalog.filteredBooks(cat, q);
  const list = $("books-list");
  if (!books.length) {
    list.innerHTML = `<div class="empty">没有匹配的词书</div>`;
    return;
  }
  list.innerHTML = books.map((b, i) => `
    <button type="button" class="book-card" data-idx="${i}">
      <div class="book-card-main">
        <div class="book-card-name">${escapeHtml(b.name)}</div>
        <div class="book-card-meta">${(b.ext || "").toUpperCase()} · ${Catalog.formatSize(b.size)}</div>
      </div>
      <span class="chevron">›</span>
    </button>
  `).join("");
  list.querySelectorAll(".book-card").forEach(btn => {
    btn.onclick = () => openVaultBook(books[parseInt(btn.dataset.idx, 10)]);
  });
}

async function openVaultBook(book) {
  currentVaultBook = book;
  wordPage = 1;
  wordQuery = "";
  loadedEntries = [];
  flashIndex = 0;
  flashFlipped = false;
  $("word-search").value = "";
  $("card-mode-toggle").checked = cardMode;
  showView("book");
  $("book-title").textContent = book.name;
  $("book-meta").textContent = "正在从 GitHub 拉取并解析…";
  $("word-list").innerHTML = `<div class="empty">加载中…</div>`;
  $("word-pager").innerHTML = "";
  $("card-mode-panel").style.display = "none";
  setHeader(book.name.replace(/\.(xlsx|xls|txt)$/i, ""), "词表浏览");
  try {
    const result = await BookLoader.load(book);
    loadedEntries = result.entries;
    $("book-meta").textContent = `共 ${loadedEntries.length} 词 · 来自 lilinji/English`;
    renderWordPage();
  } catch (err) {
    $("book-meta").textContent = "";
    $("word-list").innerHTML = `<div class="empty">${escapeHtml(err.message || String(err))}<br><br>可检查网络，或稍后重试</div>`;
  }
}

function getFilteredEntries() {
  return BookLoader.filterEntries(loadedEntries, wordQuery);
}

function renderWordPage() {
  const filtered = getFilteredEntries();
  if (cardMode) {
    $("word-list").style.display = "none";
    $("word-pager").style.display = "none";
    $("card-mode-panel").style.display = "block";
    if (!filtered.length) {
      $("card-mode-panel").innerHTML = `<div class="empty">没有匹配的单词</div>`;
      return;
    }
    // restore panel structure if wiped
    if (!$("flash-card")) {
      $("card-mode-panel").innerHTML = `
        <div id="flash-card" class="flash-card" tabindex="0">
          <div class="flash-front">
            <div class="flash-word" id="flash-word"></div>
            <div class="flash-hint">点按翻面</div>
          </div>
          <div class="flash-back">
            <div class="flash-word-sm" id="flash-word-back"></div>
            <div class="flash-ipa" id="flash-ipa"></div>
            <div class="flash-def" id="flash-def"></div>
            <div class="flash-example" id="flash-example"></div>
          </div>
        </div>
        <div class="flash-nav">
          <button type="button" id="flash-prev" class="pager-btn">上一词</button>
          <div class="pager-info" id="flash-pos"></div>
          <button type="button" id="flash-next" class="pager-btn">下一词</button>
        </div>
        <div class="flash-actions">
          <button type="button" id="flash-speak" class="btn-secondary">发音</button>
          <button type="button" id="flash-save" class="btn-primary">加入生词本</button>
        </div>`;
      bindFlashControls();
    }
    if (flashIndex >= filtered.length) flashIndex = filtered.length - 1;
    if (flashIndex < 0) flashIndex = 0;
    renderFlashCard();
    return;
  }

  $("word-list").style.display = "";
  $("word-pager").style.display = "";
  $("card-mode-panel").style.display = "none";

  const page = BookLoader.page(filtered, wordPage);
  wordPage = page.page;
  const list = $("word-list");
  if (!page.items.length) {
    list.innerHTML = `<div class="empty">没有匹配的单词</div>`;
    $("word-pager").innerHTML = "";
    return;
  }
  list.innerHTML = page.items.map((e, i) => {
    const abs = (page.page - 1) * page.size + i;
    const defLine = truncateDef(e.definition, 56);
    return `
    <button type="button" class="word-row" data-i="${abs}">
      <div class="word-row-top">
        <strong>${escapeHtml(e.word)}</strong>
        <span class="word-ipa">${escapeHtml(e.ipa || "")}</span>
      </div>
      <div class="word-def">${escapeHtml(defLine)}</div>
    </button>`;
  }).join("");
  list.querySelectorAll(".word-row").forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.i, 10);
      const entry = filtered[idx];
      if (entry) openEntryModal(entry, currentVaultBook);
    };
  });
  const pager = $("word-pager");
  if (page.pages <= 1) {
    pager.innerHTML = `<div class="pager-info">${page.total} 词</div>`;
  } else {
    pager.innerHTML = `
      <button type="button" class="pager-btn" id="pager-prev" ${page.page <= 1 ? "disabled" : ""}>上一页</button>
      <div class="pager-info">${page.page} / ${page.pages} · ${page.total} 词</div>
      <button type="button" class="pager-btn" id="pager-next" ${page.page >= page.pages ? "disabled" : ""}>下一页</button>
    `;
    const prev = $("pager-prev");
    const next = $("pager-next");
    if (prev) prev.onclick = () => { wordPage = Math.max(1, wordPage - 1); renderWordPage(); window.scrollTo(0, 0); };
    if (next) next.onclick = () => { wordPage = wordPage + 1; renderWordPage(); window.scrollTo(0, 0); };
  }
}

function bindFlashControls() {
  const card = $("flash-card");
  if (card) {
    card.onclick = () => {
      flashFlipped = !flashFlipped;
      card.classList.toggle("flipped", flashFlipped);
    };
  }
  const prev = $("flash-prev");
  const next = $("flash-next");
  if (prev) prev.onclick = () => {
    flashIndex = Math.max(0, flashIndex - 1);
    flashFlipped = false;
    renderFlashCard();
  };
  if (next) next.onclick = () => {
    const filtered = getFilteredEntries();
    flashIndex = Math.min(filtered.length - 1, flashIndex + 1);
    flashFlipped = false;
    renderFlashCard();
  };
  const speak = $("flash-speak");
  if (speak) speak.onclick = (e) => {
    e.stopPropagation();
    const filtered = getFilteredEntries();
    const entry = filtered[flashIndex];
    if (entry) speakEnglish(entry.word);
  };
  const save = $("flash-save");
  if (save) save.onclick = (e) => {
    e.stopPropagation();
    const filtered = getFilteredEntries();
    const entry = filtered[flashIndex];
    if (!entry) return;
    Vocab.saveWord({
      ...entry,
      bookSource: currentVaultBook ? (currentVaultBook.path || currentVaultBook.name) : ""
    });
    toast("已加入生词本");
  };
}

function renderFlashCard() {
  const filtered = getFilteredEntries();
  if (!filtered.length) return;
  const entry = filtered[flashIndex];
  const card = $("flash-card");
  if (!card) {
    bindFlashControls();
  }
  const c = $("flash-card");
  if (c) c.classList.toggle("flipped", flashFlipped);
  $("flash-word").textContent = entry.word;
  $("flash-word-back").textContent = entry.word;
  $("flash-ipa").textContent = entry.ipa || "";
  $("flash-def").textContent = entry.definition || "暂无释义";
  const ex = $("flash-example");
  if (entry.example) {
    ex.textContent = entry.example;
    ex.style.display = "block";
  } else {
    ex.textContent = "";
    ex.style.display = "none";
  }
  $("flash-pos").textContent = `${flashIndex + 1} / ${filtered.length}`;
  const prev = $("flash-prev");
  const next = $("flash-next");
  if (prev) prev.disabled = flashIndex <= 0;
  if (next) next.disabled = flashIndex >= filtered.length - 1;
}

function openEntryModal(entry, book) {
  const overlay = $("modal-overlay");
  modalSpeakWord = entry.word || "";
  $("modal-word").textContent = entry.word;
  $("modal-ipa").textContent = entry.ipa || "";
  $("modal-def").textContent = entry.definition || "暂无释义";
  if (entry.example) {
    $("modal-example").textContent = entry.example;
    $("modal-example").style.display = "block";
  } else {
    $("modal-example").textContent = "";
    $("modal-example").style.display = "none";
  }
  $("save-btn").textContent = "加入生词本";
  $("save-btn").onclick = () => {
    Vocab.saveWord({
      ...entry,
      bookSource: book ? (book.path || book.name) : ""
    });
    overlay.classList.remove("active");
    toast("已加入生词本");
  };
  overlay.classList.add("active");
}

/* ========== 今日学习路径 ========== */
async function refreshTodayCard() {
  const titleEl = $("today-card-title");
  const subEl = $("today-card-sub");
  const streakEl = $("today-card-streak");
  if (!titleEl) return;
  try {
    const task = await Path.getTodayTask();
    if (!task || !task.step) {
      titleEl.textContent = "分级路径 · 每天一课";
      subEl.textContent = "点此查看今天学什么";
      if (streakEl) streakEl.textContent = "";
      return;
    }
    const stageName = task.stage.title;
    titleEl.textContent = task.doneToday
      ? `今日已完成 · ${stageName}`
      : `今日：${task.step.title}`;
    subEl.textContent = task.doneToday
      ? `连续 ${task.streak} 天 · 下一步可继续`
      : `${stageName} · 第 ${task.stepIndex + 1}/${task.total} 步 · 建议记 ${task.step.vocabHint || 20} 词`;
    if (streakEl) {
      streakEl.textContent = task.streak > 0 ? `🔥 ${task.streak} 天` : "";
    }
  } catch (err) {
    titleEl.textContent = "分级路径 · 每天一课";
    subEl.textContent = "点此进入（需能访问新概念目录）";
    if (streakEl) streakEl.textContent = "";
  }
}

async function renderTodayPage() {
  showView("today");
  setHeader("今日学习", "分级路径");
  const panel = $("today-panel");
  panel.innerHTML = `<div class="empty">加载路径中…</div>`;
  try {
    await Path.load();
    const task = await Path.getTodayTask();
    if (!task || !task.stage) {
      panel.innerHTML = `<div class="empty">路径配置不可用</div>`;
      return;
    }
    const stages = Path.data.stages || [];
    const stageOpts = stages.map(s =>
      `<option value="${escapeHtml(s.id)}" ${s.id === task.stage.id ? "selected" : ""}>${escapeHtml(s.title)} — ${escapeHtml(s.desc)}</option>`
    ).join("");

    let body;
    if (!task.step) {
      body = `<div class="empty">当前阶段暂无课文（请检查网络或换阶段）</div>`;
    } else if (task.pastEnd && task.doneToday) {
      body = `
        <div class="today-done-banner">🎉 本阶段任务已全部完成</div>
        <p class="today-desc">可在下方切换到下一阶段继续。</p>`;
    } else {
      const doneClass = task.doneToday ? " is-done" : "";
      body = `
        <div class="today-task-card${doneClass}">
          <div class="today-stage-label">${escapeHtml(task.stage.title)} · 第 ${task.stepIndex + 1} / ${task.total} 步</div>
          <h3 class="today-lesson-title">${escapeHtml(task.step.title)}</h3>
          <p class="today-desc">${escapeHtml(task.stage.desc || "")}</p>
          <ul class="today-checklist">
            <li>${task.doneToday ? "✅" : "☐"} 点读本课（听原音 + 跟读）</li>
            <li>☐ 建议复习约 ${task.step.vocabHint || 20} 个单词（词库任选）</li>
          </ul>
          <div class="today-actions">
            <button type="button" class="btn-primary" id="today-start-lesson">开始今日课文</button>
            <button type="button" class="btn-secondary" id="today-complete" ${task.doneToday ? "disabled" : ""}>
              ${task.doneToday ? "今日已完成" : "完成今日"}
            </button>
          </div>
          ${task.streak > 0 ? `<div class="today-streak-line">连续学习 <strong>${task.streak}</strong> 天</div>` : ""}
        </div>`;
    }

    panel.innerHTML = `
      ${body}
      <div class="today-settings">
        <label class="today-settings-label">选择起点阶段</label>
        <select id="today-stage-select">${stageOpts}</select>
        <p class="today-settings-hint">切换阶段会从该阶段第 1 步重新开始（不影响已学课标记）。</p>
      </div>`;

    const startBtn = $("today-start-lesson");
    if (startBtn && task.step) {
      startBtn.onclick = () => openPathLesson(task.step);
    }
    const completeBtn = $("today-complete");
    if (completeBtn) {
      completeBtn.onclick = () => {
        const res = Path.completeToday();
        if (res.already) toast("今日已打卡");
        else toast(`已完成 · 连续 ${res.progress.streak} 天`);
        renderTodayPage();
        refreshTodayCard();
      };
    }
    const sel = $("today-stage-select");
    if (sel) {
      sel.onchange = () => {
        Path.setStage(sel.value);
        toast("已切换阶段");
        renderTodayPage();
        refreshTodayCard();
      };
    }
  } catch (err) {
    panel.innerHTML = `<div class="empty">路径加载失败<br>${escapeHtml(err.message || String(err))}<br>请确认能访问 nce.mleo.site</div>`;
  }
}

async function openPathLesson(step) {
  if (!step) return;
  currentBook = step.book;
  try {
    const list = await Lessons.loadCatalog(step.book);
    catalogCache[step.book] = list;
    const meta = list.find(l => l.id === step.id) || list.find(l => l.index === step.index);
    if (!meta) {
      toast("找不到该课");
      return;
    }
    await openLesson(meta.id, { back: "today" });
  } catch (err) {
    toast(err.message || String(err));
  }
}

function updateShadowUI(state) {
  const bar = $("shadow-bar");
  const modeBtn = $("shadow-mode-btn");
  const recBtn = $("shadow-rec");
  const playBtn = $("shadow-play");
  const hint = $("shadow-hint");
  if (!bar || !modeBtn) return;
  bar.style.display = state.mode ? "flex" : "none";
  modeBtn.classList.toggle("on", state.mode);
  modeBtn.textContent = state.mode ? "跟读中" : "跟读";
  if (recBtn) {
    recBtn.textContent = state.recording ? "停止" : "录音";
    recBtn.classList.toggle("recording", state.recording);
  }
  if (playBtn) playBtn.disabled = !state.hasTake || state.recording;
  if (hint) {
    if (state.recording) hint.textContent = "正在录音… 说完后点「停止」";
    else if (state.hasTake) hint.textContent = "可点「播放我的」回听，或再录";
    else hint.textContent = "先点选一句，再听原音 / 录音";
  }
}

/* ========== 点读：新概念 ========== */

function renderListenHome() {
  showView("listen");
  setHeader("点读", listenSub === "nce" ? "新概念英语" : "我的教材");
  document.querySelectorAll("#listen-sub-tabs .sub-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.sub === listenSub);
  });
  $("nce-pane").style.display = listenSub === "nce" ? "block" : "none";
  $("materials-pane").style.display = listenSub === "materials" ? "block" : "none";
  if (listenSub === "nce") {
    renderBookTabs();
    renderLessonList();
  } else {
    renderMaterialsList();
  }
}

function renderBookTabs() {
  const tabs = $("book-tabs");
  tabs.innerHTML = Object.keys(LessonSource.books).map(b =>
    `<button class="book-tab ${b === currentBook ? "active" : ""}" data-book="${b}">${Lessons.bookLabel(b)}</button>`
  ).join("");
  tabs.querySelectorAll(".book-tab").forEach(btn => {
    btn.onclick = () => {
      currentBook = btn.dataset.book;
      renderBookTabs();
      renderLessonList();
    };
  });
}

async function renderLessonList() {
  const container = $("lesson-list");
  container.innerHTML = `<div class="empty">正在加载目录…</div>`;
  try {
    await Vocab.load(currentBook);
    const list = await Lessons.loadCatalog(currentBook);
    catalogCache[currentBook] = list;
    if (!list.length) {
      container.innerHTML = `<div class="empty">暂无课文目录</div>`;
      return;
    }
    container.innerHTML = list.map(l => {
      const done = Vocab.isDone(l.id);
      return `
        <div class="lesson-card" data-id="${l.id}">
          <div>
            <h3>${escapeHtml(l.title)}</h3>
            <div class="meta">第 ${l.index} 课 · 点读+音频</div>
          </div>
          <div class="progress-dot ${done ? "done" : ""}"></div>
        </div>`;
    }).join("");
    container.querySelectorAll(".lesson-card").forEach(card => {
      card.onclick = () => openLesson(card.dataset.id);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty">目录加载失败<br>${escapeHtml(err.message || String(err))}<br>请确认能访问外网</div>`;
  }
}

async function openLesson(id, opts) {
  const meta = (catalogCache[currentBook] || []).find(l => l.id === id);
  if (!meta) return;
  readerBackTarget = (opts && opts.back) || "listen";
  listenSub = "nce";
  Shadow.dispose();
  updateShadowUI({ mode: false, recording: false, hasTake: false });
  const container = $("sentences");
  $("lesson-title").textContent = meta.title;
  container.innerHTML = `<div class="empty">正在加载课文与音频…</div>`;
  showView("reader");
  setHeader("新概念英语", meta.title);
  $("mark-done").style.display = "";
  try {
    await Vocab.load(meta.book);
    const lesson = await Lessons.loadLesson(meta);
    currentLesson = lesson;
    revokeMaterialUrl();
    if (!lesson.sentences.length) {
      container.innerHTML = `<div class="empty">该课暂无字幕</div>`;
      Player.load(lesson.audio, []);
      return;
    }
    container.innerHTML = lesson.sentences.map((s, i) => `
      <div class="sentence" data-index="${i}">
        <div class="en">${renderWordSpans(s.en)}</div>
        <div class="cn">${escapeHtml(s.cn || "")}</div>
      </div>
    `).join("");
    Player.load(lesson.audio, lesson.sentences);
    $("play-btn").textContent = "▶";
  } catch (err) {
    container.innerHTML = `<div class="empty">课文加载失败<br>${escapeHtml(err.message || String(err))}</div>`;
  }
}

function revokeMaterialUrl() {
  if (materialObjectUrl) {
    try { URL.revokeObjectURL(materialObjectUrl); } catch (e) {}
    materialObjectUrl = null;
  }
}

/* ========== 点读：我的教材 ========== */
async function renderMaterialsList() {
  const list = $("materials-list");
  list.innerHTML = `<div class="empty">加载中…</div>`;
  try {
    const items = await Materials.list();
    if (!items.length) {
      list.innerHTML = `<div class="empty">还没有导入教材<br>选择同名的 .mp3 与 .lrc 即可</div>`;
      return;
    }
    list.innerHTML = items.map(m => `
      <div class="lesson-card materials-card" data-id="${escapeHtml(m.id)}">
        <div class="materials-card-main" data-open="${escapeHtml(m.id)}">
          <h3>${escapeHtml(m.title)}</h3>
          <div class="meta">本机导入 · ${new Date(m.createdAt).toLocaleDateString("zh-CN")}</div>
        </div>
        <button type="button" class="mat-del" data-del="${escapeHtml(m.id)}" title="删除">删除</button>
      </div>
    `).join("");
    list.querySelectorAll("[data-open]").forEach(el => {
      el.onclick = () => openMaterialLesson(el.dataset.open);
    });
    list.querySelectorAll("[data-del]").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm("删除此教材？")) return;
        await Materials.remove(btn.dataset.del);
        toast("已删除");
        renderMaterialsList();
      };
    });
  } catch (err) {
    list.innerHTML = `<div class="empty">无法读取本机教材<br>${escapeHtml(err.message || String(err))}</div>`;
  }
}

async function openMaterialLesson(id) {
  readerBackTarget = "listen";
  listenSub = "materials";
  Shadow.dispose();
  updateShadowUI({ mode: false, recording: false, hasTake: false });
  const container = $("sentences");
  container.innerHTML = `<div class="empty">正在打开…</div>`;
  showView("reader");
  $("mark-done").style.display = "none";
  try {
    revokeMaterialUrl();
    const lesson = await Materials.loadLesson(id);
    materialObjectUrl = lesson._objectUrl || null;
    currentLesson = lesson;
    $("lesson-title").textContent = lesson.title;
    setHeader("我的教材", lesson.title);
    if (!lesson.sentences.length) {
      container.innerHTML = `<div class="empty">该教材暂无字幕</div>`;
      Player.load(lesson.audio, []);
      return;
    }
    container.innerHTML = lesson.sentences.map((s, i) => `
      <div class="sentence" data-index="${i}">
        <div class="en">${renderWordSpans(s.en)}</div>
        <div class="cn">${escapeHtml(s.cn || "")}</div>
      </div>
    `).join("");
    Player.load(lesson.audio, lesson.sentences);
    $("play-btn").textContent = "▶";
  } catch (err) {
    container.innerHTML = `<div class="empty">打开失败<br>${escapeHtml(err.message || String(err))}</div>`;
  }
}

async function handleMaterialsImport(fileList) {
  try {
    const results = await Materials.importFiles(fileList);
    const ok = results.filter(r => r.ok).length;
    const fail = results.filter(r => !r.ok);
    if (ok) toast(`成功导入 ${ok} 组`);
    if (fail.length) {
      toast(fail.map(f => f.title + ": " + f.reason).join("；"));
    }
    renderMaterialsList();
  } catch (err) {
    toast(err.message || String(err));
  }
}

/* ========== 查词弹层（点读联动） ========== */
function openWordModal(word) {
  const overlay = $("modal-overlay");
  const clean = (word || "").replace(/^[^\w']+|[^\w']+$/g, "");
  // 1) local NCE vocab
  let entry = Vocab.lookup(currentBook, clean);
  // also try other nce books briefly if current empty
  if (!entry) {
    for (const b of ["nce1", "nce2", "nce3", "nce4"]) {
      if (b === currentBook) continue;
      entry = Vocab.lookup(b, clean);
      if (entry) break;
    }
  }
  // 2) currently opened vault book
  if (!entry) entry = lookupLoadedEntry(clean);

  const sentenceEn = currentSentenceEn();
  const bookSource = currentLesson && currentLesson.book === "materials"
    ? "material:" + (currentLesson.title || "")
    : "nce:" + (currentLesson && currentLesson.book ? currentLesson.book : currentBook);

  modalSpeakWord = (entry && entry.word) || clean;

  if (entry) {
    $("modal-word").textContent = entry.word;
    $("modal-ipa").textContent = entry.ipa || "";
    $("modal-def").textContent = entry.definition || "暂无释义";
    const example = entry.example || sentenceEn || "";
    if (example) {
      $("modal-example").textContent = example;
      $("modal-example").style.display = "block";
    } else {
      $("modal-example").textContent = "";
      $("modal-example").style.display = "none";
    }
    $("save-btn").textContent = "加入生词本";
    $("save-btn").onclick = () => {
      const toSave = {
        ...entry,
        example: entry.example || sentenceEn || "",
        bookSource
      };
      Vocab.saveWord(toSave);
      overlay.classList.remove("active");
      toast("已加入生词本");
      refreshSentenceMarks();
    };
  } else {
    $("modal-word").textContent = clean;
    $("modal-ipa").textContent = "";
    $("modal-def").textContent = "词库中暂无此词，仍可收藏";
    if (sentenceEn) {
      $("modal-example").textContent = sentenceEn;
      $("modal-example").style.display = "block";
    } else {
      $("modal-example").textContent = "";
      $("modal-example").style.display = "none";
    }
    $("save-btn").textContent = "收藏生词";
    $("save-btn").onclick = () => {
      Vocab.saveWord({
        word: clean,
        ipa: "",
        definition: "（手动收藏）",
        example: sentenceEn || "",
        bookSource
      });
      overlay.classList.remove("active");
      toast("已收藏");
      refreshSentenceMarks();
    };
  }
  overlay.classList.add("active");
}

function refreshSentenceMarks() {
  const container = $("sentences");
  if (!container || !currentLesson) return;
  container.querySelectorAll(".sentence").forEach(el => {
    const idx = parseInt(el.dataset.index, 10);
    const s = currentLesson.sentences[idx];
    if (!s) return;
    const en = el.querySelector(".en");
    if (en) en.innerHTML = renderWordSpans(s.en);
  });
}

/* ========== 生词 / 复习 ========== */
function renderVocabList() {
  const saved = Vocab.getSaved();
  const container = $("vocab-items");
  setHeader("生词本", `${saved.length} 个生词`);
  if (!saved.length) {
    container.innerHTML = `<div class="empty">还没有生词<br>在词库或课文中点击单词即可收藏</div>`;
    return;
  }
  container.innerHTML = saved.map(w => `
    <div class="vocab-item">
      <strong>${escapeHtml(w.word)}</strong>
      <span style="color:var(--primary);margin-left:8px;">${escapeHtml(w.ipa || "")}</span>
      <div style="margin-top:4px;">${escapeHtml(w.definition || "")}</div>
      ${w.example ? `<div style="margin-top:4px;color:var(--muted);font-size:.9rem;">${escapeHtml(w.example)}</div>` : ""}
      ${w.bookSource ? `<div class="source-tag">${escapeHtml(shortSource(w.bookSource))}</div>` : ""}
      <button data-remove="${escapeHtml(w.word)}" class="btn-secondary remove-btn">移除</button>
    </div>
  `).join("");
  container.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => {
      Vocab.removeWord(btn.dataset.remove);
      renderVocabList();
    };
  });
}

function renderReview() {
  const due = Vocab.getDue();
  const container = $("review-items");
  setHeader("今日复习", due.length ? `${due.length} 个待复习` : "暂无待复习");
  if (!due.length) {
    container.innerHTML = `<div class="empty">暂无需要复习的生词<br>继续浏览词库或学习课文吧</div>`;
    return;
  }
  container.innerHTML = due.slice(0, 20).map(w => `
    <div class="review-item" data-word="${escapeHtml(w.word)}">
      <strong>${escapeHtml(w.word)}</strong>
      <span style="color:var(--primary);margin-left:8px;">${escapeHtml(w.ipa || "")}</span>
      <div style="margin-top:6px;" class="answer">${escapeHtml(w.definition || "")}</div>
      <div class="review-actions">
        <button class="btn-again" data-r="1" data-w="${escapeHtml(w.word)}">忘了</button>
        <button class="btn-good" data-r="2" data-w="${escapeHtml(w.word)}">认识</button>
        <button class="btn-easy" data-r="3" data-w="${escapeHtml(w.word)}">简单</button>
      </div>
    </div>
  `).join("");
  container.querySelectorAll("[data-r]").forEach(btn => {
    btn.onclick = () => {
      Vocab.review(btn.dataset.w, parseInt(btn.dataset.r, 10));
      renderReview();
    };
  });
}

function setupInstall() {
  const banner = $("install-banner");
  const btn = $("install-btn");
  const dismiss = $("install-dismiss");
  if (!banner || !btn) return;
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstall = e;
    if (!localStorage.getItem("nce-install-dismissed")) banner.classList.add("show");
  });
  btn.onclick = async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    banner.classList.remove("show");
  };
  if (dismiss) {
    dismiss.onclick = () => {
      localStorage.setItem("nce-install-dismissed", "1");
      banner.classList.remove("show");
    };
  }
}

function init() {
  Player.init();
  Player.onPlayState(playing => {
    $("play-btn").textContent = playing ? "⏸" : "▶";
  });
  setupInstall();
  updateShadowUI({ mode: false, recording: false, hasTake: false });
  renderVaultHome("");
  bindFlashControls();

  let vaultSearchTimer = null;
  $("vault-search").addEventListener("input", e => {
    clearTimeout(vaultSearchTimer);
    vaultSearchTimer = setTimeout(() => renderVaultHome(e.target.value), 200);
  });
  $("books-search").addEventListener("input", e => {
    renderBooksList(e.target.value);
  });
  let wordSearchTimer = null;
  $("word-search").addEventListener("input", e => {
    clearTimeout(wordSearchTimer);
    wordSearchTimer = setTimeout(() => {
      wordQuery = e.target.value;
      wordPage = 1;
      flashIndex = 0;
      flashFlipped = false;
      renderWordPage();
    }, 200);
  });

  $("card-mode-toggle").addEventListener("change", e => {
    cardMode = !!e.target.checked;
    flashFlipped = false;
    flashIndex = 0;
    renderWordPage();
  });

  $("books-back").onclick = () => {
    $("vault-search").value = "";
    renderVaultHome("");
  };
  $("book-back").onclick = () => {
    if (currentCategoryId) renderBooksList($("books-search").value);
    else renderVaultHome("");
  };

  document.querySelectorAll("#listen-sub-tabs .sub-tab").forEach(btn => {
    btn.onclick = () => {
      listenSub = btn.dataset.sub;
      Player.pause();
      renderListenHome();
    };
  });

  $("materials-file").addEventListener("change", e => {
    const files = e.target.files;
    if (files && files.length) handleMaterialsImport(files);
    e.target.value = "";
  });

  document.addEventListener("click", e => {
    const wordEl = e.target.closest(".word");
    if (wordEl) {
      e.stopPropagation();
      openWordModal(wordEl.dataset.word);
      return;
    }
    const sent = e.target.closest(".sentence");
    if (sent) {
      const idx = parseInt(sent.dataset.index, 10);
      Player.jumpTo(idx);
    }
  });

  // keyboard for flash cards
  document.addEventListener("keydown", e => {
    if ($("card-mode-panel").style.display === "none" || !cardMode) return;
    if (e.key === "ArrowLeft") {
      $("flash-prev") && $("flash-prev").click();
    } else if (e.key === "ArrowRight") {
      $("flash-next") && $("flash-next").click();
    } else if (e.key === " " || e.key === "Enter") {
      if (document.activeElement && document.activeElement.tagName === "INPUT") return;
      e.preventDefault();
      flashFlipped = !flashFlipped;
      const c = $("flash-card");
      if (c) c.classList.toggle("flipped", flashFlipped);
    }
  });

  $("modal-overlay").addEventListener("click", e => {
    if (e.target.id === "modal-overlay") e.target.classList.remove("active");
  });
  $("close-modal").onclick = () => $("modal-overlay").classList.remove("active");
  $("speak-btn").onclick = () => speakEnglish(modalSpeakWord || $("modal-word").textContent);

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === "vault") {
        Player.pause();
        renderVaultHome($("vault-search").value);
      } else if (tab === "listen") {
        Player.pause();
        renderListenHome();
      } else if (tab === "vocab") {
        showView("vocab");
        renderVocabList();
      } else if (tab === "review") {
        showView("review");
        renderReview();
      }
    };
  });

  $("play-btn").onclick = () => Player.toggle();
  $("loop-btn").onclick = () => {
    Player.loopSentence = !Player.loopSentence;
    $("loop-btn").classList.toggle("on", Player.loopSentence);
    toast(Player.loopSentence ? "单句循环开" : "单句循环关");
  };
  $("speed-btn").onclick = () => {
    const speeds = [0.75, 1, 1.25, 1.5];
    const i = speeds.indexOf(Player.speed);
    const next = speeds[(i + 1) % speeds.length];
    Player.setSpeed(next);
    $("speed-btn").textContent = next + "x";
  };
  $("mark-done").onclick = () => {
    if (currentLesson && currentLesson.book !== "materials") {
      Vocab.markDone(currentLesson.id);
      toast("已标记学完");
    }
  };
  $("back-btn").onclick = () => {
    Player.pause();
    Shadow.dispose();
    updateShadowUI({ mode: false, recording: false, hasTake: false });
    revokeMaterialUrl();
    currentLesson = null;
    const back = readerBackTarget;
    readerBackTarget = "listen";
    if (back === "today") renderTodayPage();
    else renderListenHome();
  };

  $("today-card").onclick = () => renderTodayPage();
  $("today-back").onclick = () => renderVaultHome($("vault-search").value || "");

  Shadow.onState(updateShadowUI);
  $("shadow-mode-btn").onclick = () => {
    const on = Shadow.toggleMode();
    toast(on ? "跟读模式开：点选句子后听原音/录音" : "跟读模式关");
    updateShadowUI({ mode: Shadow.mode, recording: Shadow.recording, hasTake: !!Shadow.blobUrl });
  };
  $("shadow-listen").onclick = () => {
    if (Player.currentIndex < 0) {
      toast("请先点选一句");
      return;
    }
    Player.jumpTo(Player.currentIndex);
  };
  $("shadow-rec").onclick = async () => {
    if (Shadow.recording) {
      Shadow.stopRecording(true);
      toast("录音完成");
      return;
    }
    if (Player.currentIndex < 0) {
      toast("请先点选一句");
      return;
    }
    Player.pause();
    try {
      await Shadow.startRecording();
      toast("开始录音");
    } catch (err) {
      toast(err.message || String(err));
    }
  };
  $("shadow-play").onclick = () => {
    if (!Shadow.playMine()) toast("还没有录音");
  };
}

document.addEventListener("DOMContentLoaded", init);
