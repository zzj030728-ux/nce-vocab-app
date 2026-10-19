// app.js — 英语词库总站：词库浏览 + 新概念点读 + 生词/复习
let currentBook = "nce1";
let currentLesson = null;
let catalogCache = {};
let deferredInstall = null;
let currentCategoryId = null;
let currentVaultBook = null;
let wordPage = 1;
let wordQuery = "";
let loadedEntries = [];

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
  $("header-sub").textContent = sub || "全库浏览 · 新概念点读 · 间隔复习";
}

function showView(name) {
  const views = ["vault", "books", "book", "lessons", "reader", "vocab", "review"];
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
  const tabMap = { vault: "vault", books: "vault", book: "vault", lessons: "lessons", reader: "lessons", vocab: "vocab", review: "review" };
  const activeTab = tabMap[name] || name;
  document.querySelectorAll(".bottom-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });
}

function renderWordSpans(text) {
  return text.split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part;
    const clean = part.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!/[a-zA-Z]/.test(clean)) return part;
    return `<span class="word" data-word="${clean}">${part}</span>`;
  }).join("");
}

/* ========== 词库 ========== */
async function renderVaultHome(q) {
  const grid = $("category-grid");
  grid.innerHTML = `<div class="empty">正在加载词库目录…</div>`;
  showView("vault");
  setHeader("英语词库", "按需加载 · 不打包词表");
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

function shortCatName(name) {
  // "1.全国各大教材版本中小学同步" -> keep readable
  return name.replace(/^\d+\./, "");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  $("word-search").value = "";
  showView("book");
  $("book-title").textContent = book.name;
  $("book-meta").textContent = "正在从 GitHub 拉取并解析…";
  $("word-list").innerHTML = `<div class="empty">加载中…</div>`;
  $("word-pager").innerHTML = "";
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

function renderWordPage() {
  const filtered = BookLoader.filterEntries(loadedEntries, wordQuery);
  const page = BookLoader.page(filtered, wordPage);
  wordPage = page.page;
  const list = $("word-list");
  if (!page.items.length) {
    list.innerHTML = `<div class="empty">没有匹配的单词</div>`;
    $("word-pager").innerHTML = "";
    return;
  }
  list.innerHTML = page.items.map((e, i) => `
    <button type="button" class="word-row" data-i="${(page.page - 1) * page.size + i}">
      <div class="word-row-top">
        <strong>${escapeHtml(e.word)}</strong>
        <span class="word-ipa">${escapeHtml(e.ipa || "")}</span>
      </div>
      <div class="word-def">${escapeHtml(e.definition || "暂无释义")}</div>
    </button>
  `).join("");
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

function openEntryModal(entry, book) {
  const overlay = $("modal-overlay");
  $("modal-word").textContent = entry.word;
  $("modal-ipa").textContent = entry.ipa || "";
  $("modal-def").textContent = entry.definition || "暂无释义";
  if (entry.example) {
    $("modal-example").textContent = entry.example;
    $("modal-example").style.display = "block";
  } else {
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

/* ========== 新概念 ========== */
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

async function openLesson(id) {
  const meta = (catalogCache[currentBook] || []).find(l => l.id === id);
  if (!meta) return;
  const container = $("sentences");
  $("lesson-title").textContent = meta.title;
  container.innerHTML = `<div class="empty">正在加载课文与音频…</div>`;
  showView("reader");
  setHeader("新概念英语", meta.title);
  try {
    await Vocab.load(meta.book);
    const lesson = await Lessons.loadLesson(meta);
    currentLesson = lesson;
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

function openWordModal(word) {
  const entry = Vocab.lookup(currentBook, word);
  const overlay = $("modal-overlay");
  if (entry) {
    $("modal-word").textContent = entry.word;
    $("modal-ipa").textContent = entry.ipa || "";
    $("modal-def").textContent = entry.definition || "暂无释义";
    $("modal-example").textContent = entry.example || "";
    $("modal-example").style.display = entry.example ? "block" : "none";
    $("save-btn").textContent = "加入生词本";
    $("save-btn").onclick = () => {
      Vocab.saveWord({ ...entry, bookSource: "nce:" + currentBook });
      overlay.classList.remove("active");
      toast("已加入生词本");
    };
  } else {
    $("modal-word").textContent = word;
    $("modal-ipa").textContent = "";
    $("modal-def").textContent = "词库中暂无此词，仍可收藏";
    $("modal-example").style.display = "none";
    $("save-btn").textContent = "收藏生词";
    $("save-btn").onclick = () => {
      Vocab.saveWord({ word, ipa: "", definition: "（手动收藏）", example: "", bookSource: "nce:" + currentBook });
      overlay.classList.remove("active");
      toast("已收藏");
    };
  }
  overlay.classList.add("active");
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

function shortSource(s) {
  if (!s) return "";
  if (s.startsWith("nce:")) return "新概念 · " + s.slice(4).toUpperCase();
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
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
  renderVaultHome("");

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
      renderWordPage();
    }, 200);
  });

  $("books-back").onclick = () => {
    $("vault-search").value = "";
    renderVaultHome("");
  };
  $("book-back").onclick = () => {
    if (currentCategoryId) renderBooksList($("books-search").value);
    else renderVaultHome("");
  };

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

  $("modal-overlay").addEventListener("click", e => {
    if (e.target.id === "modal-overlay") e.target.classList.remove("active");
  });
  $("close-modal").onclick = () => $("modal-overlay").classList.remove("active");

  document.querySelectorAll(".bottom-nav button").forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === "vault") {
        Player.pause();
        renderVaultHome($("vault-search").value);
      } else if (tab === "lessons") {
        Player.pause();
        showView("lessons");
        setHeader("新概念英语", "点词查词 · 课文点读");
        renderBookTabs();
        renderLessonList();
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
    if (currentLesson) {
      Vocab.markDone(currentLesson.id);
      toast("已标记学完");
    }
  };
  $("back-btn").onclick = () => {
    Player.pause();
    showView("lessons");
    setHeader("新概念英语", "点词查词 · 课文点读");
    renderLessonList();
  };
}

document.addEventListener("DOMContentLoaded", init);
