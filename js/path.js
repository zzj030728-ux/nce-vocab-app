// path.js — graded learning path (今日学习)
const Path = {
  STORAGE_KEY: "nce-path-progress",
  data: null,

  async load() {
    if (this.data) return this.data;
    const res = await fetch("data/path.json");
    if (!res.ok) throw new Error("路径配置加载失败 (" + res.status + ")");
    this.data = await res.json();
    return this.data;
  },

  defaultProgress() {
    return {
      stageId: "stage0",
      stepIndex: 0,
      lastCompletedDate: null,
      completedDates: [],
      streak: 0
    };
  },

  getProgress() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return this.defaultProgress();
      const p = JSON.parse(raw);
      return Object.assign(this.defaultProgress(), p);
    } catch (e) {
      return this.defaultProgress();
    }
  },

  saveProgress(p) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(p));
  },

  todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  },

  getStage(stageId) {
    if (!this.data || !this.data.stages) return null;
    return this.data.stages.find(s => s.id === stageId) || this.data.stages[0] || null;
  },

  /** Expand stage segments into concrete lesson steps. count 0 / omitted = to end of book. */
  async expandStage(stage) {
    if (!stage || !stage.segments) return [];
    const steps = [];
    for (const seg of stage.segments) {
      const list = await Lessons.loadCatalog(seg.book);
      if (!list.length) continue;
      const start = Math.max(1, seg.startIndex || 1);
      let end;
      if (!seg.count || seg.count <= 0) {
        end = list.length;
      } else {
        end = Math.min(list.length, start + seg.count - 1);
      }
      if (start > list.length) continue;
      for (let i = start; i <= end; i++) {
        const meta = list.find(l => l.index === i) || list[i - 1];
        if (!meta) continue;
        steps.push({
          type: "lesson",
          book: meta.book,
          index: meta.index,
          id: meta.id,
          title: meta.title,
          vocabHint: seg.vocabHint || 20
        });
      }
    }
    return steps;
  },

  async getCurrentSteps() {
    await this.load();
    const prog = this.getProgress();
    const stage = this.getStage(prog.stageId);
    if (!stage) return { stage: null, steps: [], prog };
    const steps = await this.expandStage(stage);
    return { stage, steps, prog };
  },

  async getTodayTask() {
    const { stage, steps, prog } = await this.getCurrentSteps();
    if (!stage) return null;
    let stepIndex = prog.stepIndex || 0;
    // If stage finished (stepIndex past end), still show last lesson as reference
    const pastEnd = steps.length > 0 && stepIndex >= steps.length;
    if (stepIndex >= steps.length) stepIndex = Math.max(0, steps.length - 1);
    const step = steps[stepIndex] || null;
    const today = this.todayStr();
    const doneToday = prog.lastCompletedDate === today;
    const streak = this.recomputeStreak(prog);
    return {
      stage,
      steps,
      step,
      stepIndex,
      total: steps.length,
      doneToday,
      streak,
      prog,
      pastEnd,
      finishedAll: pastEnd && doneToday
    };
  },

  setStage(stageId) {
    const p = this.getProgress();
    p.stageId = stageId;
    p.stepIndex = 0;
    this.saveProgress(p);
    return p;
  },

  /** Mark today complete and advance one step. Idempotent same calendar day. */
  completeToday() {
    const p = this.getProgress();
    const today = this.todayStr();
    if (p.lastCompletedDate === today) {
      p.streak = this.recomputeStreak(p);
      return { already: true, progress: p };
    }
    const dates = Array.isArray(p.completedDates) ? p.completedDates.slice() : [];
    if (!dates.includes(today)) dates.push(today);
    while (dates.length > 90) dates.shift();
    p.completedDates = dates;
    p.lastCompletedDate = today;
    p.stepIndex = (p.stepIndex || 0) + 1;
    p.streak = this.recomputeStreak(p);
    this.saveProgress(p);
    return { already: false, progress: p };
  },

  recomputeStreak(p) {
    const dates = new Set(p.completedDates || []);
    let streak = 0;
    const d = new Date();
    const today = this.todayStr();
    if (!dates.has(today)) d.setDate(d.getDate() - 1);
    for (;;) {
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if (!dates.has(key)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
    p.streak = streak;
    return streak;
  }
};

window.Path = Path;
