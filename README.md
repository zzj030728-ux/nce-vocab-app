# 英语词库

手机优先 PWA：**词库总站**浏览 [lilinji/English](https://github.com/lilinji/English) 全部分类与词书（按需从 GitHub raw 拉取 xlsx/xls/txt，不把 960+ 词表打进仓库）；**新概念**为独立学习分支（目录 + LRC + MP3 来自 `https://nce.mleo.site`）；生词本与间隔复习全局共用 localStorage。

## 功能

| Tab | 说明 |
|-----|------|
| 词库 | 分类卡片 → 词书列表（可搜索）→ SheetJS 解析词表，分页浏览，点词加入生词本 |
| 新概念 | 四册目录远程加载，课文点读、点词查词（本地 `data/vocab-nce*.json`） |
| 生词 / 复习 | 与现有 `nce-saved` / `nce-progress` 兼容 |

轻量目录：`data/catalog.json`（分类 + 书名 + path + size + ext）。

## 在线使用

GitHub Pages：https://zzj030728-ux.github.io/nce-vocab-app/

Safari / Chrome：「添加到主屏幕」即可当 App 用。

## 本机预览

```bash
cd nce-vocab-app
python -m http.server 8080
```

同一 Wi‑Fi 下手机访问 `http://<电脑局域网IP>:8080`。

## 数据来源与限制

- 词书内容来自 lilinji/English，浏览器直接 `fetch` raw.githubusercontent.com（CORS `*`）。
- **中国大陆**访问 GitHub raw 可能较慢或需代理；解析失败时界面会提示。
- 新概念课文/音频不打包进仓库，仅按需加载公开资源。
- SheetJS 通过 CDN 加载；离线时依赖 Service Worker 缓存。

## 技术

- 纯静态 HTML/CSS/JS + PWA（`sw.js` cache `nce-vault-v1`）
- SheetJS 0.20.3 解析表格
