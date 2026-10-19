// catalog.js — lilinji/English category + book browser
const Catalog = {
  data: null,
  currentCategory: null,
  filter: "",

  async load() {
    if (this.data) return this.data;
    const res = await fetch("data/catalog.json");
    if (!res.ok) throw new Error("词库目录加载失败 (" + res.status + ")");
    this.data = await res.json();
    return this.data;
  },

  bookCount(cat) {
    return (cat.books || []).length;
  },

  totalBooks() {
    if (!this.data) return 0;
    return this.data.categories.reduce((n, c) => n + this.bookCount(c), 0);
  },

  findCategory(id) {
    return (this.data && this.data.categories || []).find(c => c.id === id) || null;
  },

  filteredCategories(q) {
    const list = (this.data && this.data.categories) || [];
    const s = (q || "").trim().toLowerCase();
    if (!s) return list;
    return list.filter(c => {
      if (c.name.toLowerCase().includes(s)) return true;
      return (c.books || []).some(b => b.name.toLowerCase().includes(s));
    }).map(c => {
      if (c.name.toLowerCase().includes(s)) return c;
      return {
        ...c,
        books: c.books.filter(b => b.name.toLowerCase().includes(s)),
        _matchedBooks: true
      };
    });
  },

  filteredBooks(cat, q) {
    const books = (cat && cat.books) || [];
    const s = (q || "").trim().toLowerCase();
    if (!s) return books;
    return books.filter(b => b.name.toLowerCase().includes(s) || (b.path || "").toLowerCase().includes(s));
  },

  formatSize(n) {
    if (!n || n < 1024) return (n || 0) + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  },

  categoryIcon(name) {
    const n = name || "";
    if (n.startsWith("1.")) return "🏫";
    if (n.startsWith("2.")) return "📝";
    if (n.startsWith("3.")) return "🎓";
    if (n.startsWith("4.")) return "📘";
    if (n.startsWith("5.")) return "🎯";
    if (n.startsWith("6.")) return "🔬";
    if (n.startsWith("7.")) return "✈️";
    if (n.startsWith("8.")) return "💼";
    if (n.startsWith("9.")) return "📦";
    return "📚";
  }
};

window.Catalog = Catalog;
