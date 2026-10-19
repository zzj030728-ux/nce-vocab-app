// player.js — sentence-aware audio player
const Player = {
  audio: null,
  sentences: [],
  currentIndex: -1,
  loopSentence: false,
  speed: 1,
  _onPlayState: null,

  init() {
    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.crossOrigin = "anonymous";
    this.audio.addEventListener("timeupdate", () => this.onTimeUpdate());
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("play", () => this._emitPlay(true));
    this.audio.addEventListener("pause", () => this._emitPlay(false));
    this.audio.addEventListener("error", () => console.warn("Audio load failed"));
  },

  onPlayState(fn) { this._onPlayState = fn; },
  _emitPlay(playing) { if (this._onPlayState) this._onPlayState(playing); },

  load(url, sentences) {
    this.sentences = sentences || [];
    this.currentIndex = -1;
    this.audio.pause();
    if (url) {
      this.audio.src = url;
      this.audio.load();
    } else {
      this.audio.removeAttribute("src");
    }
  },

  play() {
    if (this.audio.src) this.audio.play().catch(() => {});
  },

  pause() { this.audio.pause(); },

  toggle() {
    if (!this.audio.src) return;
    if (this.audio.paused) this.play();
    else this.pause();
  },

  setSpeed(s) {
    this.speed = s;
    this.audio.playbackRate = s;
  },

  jumpTo(index) {
    if (!this.sentences[index]) return;
    this.currentIndex = index;
    const s = this.sentences[index];
    if (this.audio.src && s.start != null) {
      this.audio.currentTime = Math.max(0, s.start);
      this.play();
    }
    this.highlight(index);
  },

  highlight(index) {
    document.querySelectorAll(".sentence").forEach((el, i) => {
      el.classList.toggle("active", i === index);
    });
    const el = document.querySelector(`.sentence[data-index="${index}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  },

  onTimeUpdate() {
    if (!this.sentences.length || !this.audio.src) return;
    const t = this.audio.currentTime;
    if (this.loopSentence && this.currentIndex >= 0) {
      const cur = this.sentences[this.currentIndex];
      if (cur && t >= (cur.end || Infinity) - 0.05) {
        this.audio.currentTime = cur.start || 0;
        return;
      }
    }
    let idx = this.sentences.findIndex(s => t >= (s.start || 0) && t < (s.end || Infinity));
    if (idx === -1 && this.sentences.length) {
      idx = this.sentences.reduce((best, s, i) => (s.start <= t ? i : best), 0);
    }
    if (idx !== this.currentIndex && idx >= 0) {
      this.currentIndex = idx;
      this.highlight(idx);
    }
  },

  onEnded() {
    if (this.loopSentence && this.currentIndex >= 0) {
      this.jumpTo(this.currentIndex);
    } else {
      this._emitPlay(false);
    }
  }
};

window.Player = Player;
