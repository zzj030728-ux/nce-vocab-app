// lessons.js — load catalogs + LRC/MP3 from public CORS sources (not bundled textbooks)
// parseLrc lives in lrc.js
const LessonSource = {
  BASE: "https://nce.mleo.site",
  books: {
    nce1: { key: "NCE1", label: "第一册" },
    nce2: { key: "NCE2", label: "第二册" },
    nce3: { key: "NCE3", label: "第三册" },
    nce4: { key: "NCE4", label: "第四册" }
  },
  catalogs: {},
  lessonCache: {}
};

function encodePath(name) {
  return encodeURIComponent(name).replace(/%2F/g, "/");
}

const Lessons = {
  async loadCatalog(book) {
    if (LessonSource.catalogs[book]) return LessonSource.catalogs[book];
    const meta = LessonSource.books[book];
    if (!meta) return [];
    const url = `${LessonSource.BASE}/${meta.key}/book.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`目录加载失败 (${res.status})`);
    const data = await res.json();
    const units = (data.units || []).map((u, i) => {
      const filename = u.filename || u.title;
      const title = u.title || filename;
      return {
        id: `${book}-${i + 1}`,
        book,
        index: i + 1,
        title,
        filename,
        audioUrl: `${LessonSource.BASE}/${meta.key}/${encodePath(filename)}.mp3`,
        lrcUrl: `${LessonSource.BASE}/${meta.key}/${encodePath(filename)}.lrc`
      };
    });
    LessonSource.catalogs[book] = units;
    return units;
  },

  async loadLesson(meta) {
    const cacheKey = meta.id;
    if (LessonSource.lessonCache[cacheKey]) return LessonSource.lessonCache[cacheKey];
    const res = await fetch(meta.lrcUrl);
    if (!res.ok) throw new Error(`课文加载失败 (${res.status})`);
    const text = await res.text();
    const sentences = parseLrc(text);
    const lesson = {
      ...meta,
      sentences,
      audio: meta.audioUrl
    };
    LessonSource.lessonCache[cacheKey] = lesson;
    return lesson;
  },

  bookLabel(book) {
    return (LessonSource.books[book] && LessonSource.books[book].label) || book.toUpperCase();
  }
};

window.Lessons = Lessons;
window.LessonSource = LessonSource;
