# 新概念英语 · 点词学习

手机优先 PWA：四册目录远程加载，LRC 点读 + MP3 跟读，本地词库点词查词，生词本与间隔复习。

课文与音频来自公开可 CORS 资源 `https://nce.mleo.site`（按需加载，不把教材整本打进仓库）。

## 手机使用

1. 打开 GitHub Pages 地址（见仓库 Settings → Pages）
2. Safari / Chrome：「添加到主屏幕」安装
3. 选册 → 选课 → 点句子跳转播放，点单词查词/收藏

## 本机预览

```bash
python -m http.server 8080
```

同一 Wi‑Fi 下手机访问 `http://<电脑局域网IP>:8080`
