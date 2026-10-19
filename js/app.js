// app.js — phone-first NCE reader
let currentBook = "nce1";
let currentLesson = null;
let catalogCache = {};
let deferredInstall = null;

function $(id) { return document.getElementById(id); }

function renderWordSpans(text) {
  return text.split(/(\s+)/).map(part => {
    if (/^\s+$/.test(part)) return part;
    const clean = part.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!/[a-zA-Z]/.test(clean)) return part;
    return `<span class="word" data-word="${clean}">${part}</span>`;
  }).join("");
}

function showView(name) {
  ["lessons", "reader", "vocab", "review"].forEach(v => {
    const el = $(v + "-view");
    if (!el) return;
    if (v === "reader") {
      el.classList.toggle("active", name === "reader");
      el.style.display = name === "reader" ? "block" : "none";
    } else {
      el.style.display = name === v ? "block" : "none";
    }
  });
  document.querySelectorAll(".bottom-nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
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
            <h3>${l.title}</h3>
            <div class="meta">第 ${l.index} 课 · 点读+音频</div>
          </div>
          <div class="progress-dot ${done ? "done" : ""}"></div>
        </div>`;
    }).join("");
    container.querySelectorAll(".lesson-card").forEach(card => {
      card.onclick = () => openLesson(card.dataset.id);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty">目录加载失败<br>${err.message || err}<br>请确认手机能访问外网</div>`;
  }
}

async function openLesson(id) {
  const meta = (catalogCache[currentBook] || []).find(l => l.id === id);
  if (!meta) return;
  const container = $("sentences");
  $("lesson-title").textContent = meta.title;
  container.innerHTML = `<div class="empty">正在加载课文与音频…</div>`;
  showView("reader");
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
        <div class="cn">${s.cn || ""}</div>
      </div>
    `).join("");
    Player.load(lesson.audio, lesson.sentences);
    $("play-btn").textContent = "▶";
  } catch (err) {
    container.innerHTML = `<div class="empty">课文加载失败<br>${err.message || err}</div>`;
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
      Vocab.saveWord(entry);
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
      Vocab.saveWord({ word, ipa: "", definition: "（手动收藏）", example: "" });
      overlay.classList.remove("active");
      toast("已收藏");
    };
  }
  overlay.classList.add("active");
}

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

function renderVocabList() {
  const saved = Vocab.getSaved();
  const container = $("vocab-items");
  if (!saved.length) {
    container.innerHTML = `<div class="empty">还没有生词<br>在课文中点击单词即可收藏</div>`;
    return;
  }
  container.innerHTML = saved.map(w => `
    <div class="vocab-item">
      <strong>${w.word}</strong>
      <span style="color:var(--primary);margin-left:8px;">${w.ipa || ""}</span>
      <div style="margin-top:4px;">${w.definition || ""}</div>
      ${w.example ? `<div style="margin-top:4px;color:var(--muted);font-size:.9rem;">${w.example}</div>` : ""}
      <button data-remove="${w.word}" class="btn-secondary remove-btn">移除</button>
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
  if (!due.length) {
    container.innerHTML = `<div class="empty">暂无需要复习的生词<br>继续学习课文吧</div>`;
    return;
  }
  container.innerHTML = due.slice(0, 20).map(w => `
    <div class="review-item" data-word="${w.word}">
      <strong>${w.word}</strong>
      <span style="color:var(--primary);margin-left:8px;">${w.ipa || ""}</span>
      <div style="margin-top:6px;" class="answer">${w.definition || ""}</div>
      <div class="review-actions">
        <button class="btn-again" data-r="1" data-w="${w.word}">忘了</button>
        <button class="btn-good" data-r="2" data-w="${w.word}">认识</button>
        <button class="btn-easy" data-r="3" data-w="${w.word}">简单</button>
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
  renderBookTabs();
  renderLessonList();
  showView("lessons");
  setupInstall();

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
      if (tab === "lessons") {
        Player.pause();
        showView("lessons");
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
    renderLessonList();
  };
}

document.addEventListener("DOMContentLoaded", init);
