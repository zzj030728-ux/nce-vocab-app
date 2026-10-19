// shadow.js — sentence shadow-reading recorder (MediaRecorder, in-memory only)
const Shadow = {
  mode: false,
  recorder: null,
  chunks: [],
  blobUrl: null,
  stream: null,
  recording: false,
  _onState: null,

  onState(fn) { this._onState = fn; },
  _emit() {
    if (this._onState) {
      this._onState({
        mode: this.mode,
        recording: this.recording,
        hasTake: !!this.blobUrl
      });
    }
  },

  setMode(on) {
    this.mode = !!on;
    if (!this.mode) this.stopRecording(false);
    this._emit();
  },

  toggleMode() {
    this.setMode(!this.mode);
    return this.mode;
  },

  clearTake() {
    if (this.blobUrl) {
      try { URL.revokeObjectURL(this.blobUrl); } catch (e) {}
      this.blobUrl = null;
    }
    this.chunks = [];
    this._emit();
  },

  async startRecording() {
    if (this.recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("当前浏览器不支持录音。请使用 HTTPS（推荐 GitHub Pages）或较新的 Safari / Chrome。");
    }
    if (typeof MediaRecorder === "undefined") {
      throw new Error("当前浏览器不支持 MediaRecorder。");
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err && err.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        throw new Error("麦克风权限被拒绝。请在浏览器设置中允许本站使用麦克风后重试。");
      }
      if (name === "NotFoundError") {
        throw new Error("未检测到麦克风设备。");
      }
      throw new Error("无法打开麦克风：" + (err.message || String(err)));
    }
    this.clearTake();
    this.chunks = [];
    let mime = "";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
    else if (MediaRecorder.isTypeSupported("audio/webm")) mime = "audio/webm";
    else if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
    try {
      this.recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    } catch (e) {
      this.recorder = new MediaRecorder(this.stream);
    }
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      this.recording = false;
      try {
        if (this.chunks.length) {
          const type = (this.recorder && this.recorder.mimeType) || "audio/webm";
          const blob = new Blob(this.chunks, { type });
          this.blobUrl = URL.createObjectURL(blob);
        }
      } catch (e) {}
      this._stopStream();
      this._emit();
    };
    this.recorder.start();
    this.recording = true;
    this._emit();
  },

  stopRecording(keep) {
    if (keep === false) {
      // cancel
      if (this.recorder && this.recording) {
        try { this.recorder.onstop = null; this.recorder.stop(); } catch (e) {}
      }
      this.recording = false;
      this._stopStream();
      this.clearTake();
      return;
    }
    if (this.recorder && this.recording) {
      try { this.recorder.stop(); } catch (e) {
        this.recording = false;
        this._stopStream();
        this._emit();
      }
    }
  },

  _stopStream() {
    if (this.stream) {
      try { this.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      this.stream = null;
    }
  },

  playMine() {
    if (!this.blobUrl) return false;
    const a = new Audio(this.blobUrl);
    a.play().catch(() => {});
    return true;
  },

  dispose() {
    this.stopRecording(false);
    this.clearTake();
    this.mode = false;
    this._emit();
  }
};

window.Shadow = Shadow;
