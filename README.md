# 英语词库

手机优先 PWA：**词库总站**浏览 [lilinji/English](https://github.com/lilinji/English) 全部分类与词书（按需从 GitHub raw 拉取 xlsx/xls/txt，不把 960+ 词表打进仓库）；**点读**含新概念公开源 + 用户自备教材导入；生词本与间隔复习全局共用 localStorage。

## 功能

| Tab | 说明 |
|-----|------|
| 词库 | 分类 → 词书 → 词表；释义摘要一行截断；弹层发音（`speechSynthesis` en-US）；**卡片模式**翻面记词；加入生词本带 `bookSource` |
| 点读 | 顶部子 Tab：**新概念**（mleo LRC/MP3）/ **我的教材**（本机导入 `.mp3`+`.lrc`，IndexedDB） |
| 生词 / 复习 | 显示来源（新概念 / 词书名 / 我的教材）；与 `nce-saved` / `nce-progress` 兼容 |

### A. 词库释义体验

- 词条卡片同时显示释义摘要（一行截断）
- 弹层「发音」按钮：浏览器语音合成读英文，无音频文件
- **卡片模式**：大卡片只显示英文 → 点翻面看音标+释义+例句；上一词/下一词（或左右方向键）
- 加入生词本时写入 `bookSource`（词书 path/name）
- 有例句才展示，无例句不占空位

### B. 新概念点读与生词联动

- 已在生词本的单词加下划线 + 小绿点标记
- 从课文点词加入时，若词库无例句则把当前句子英文写入 `entry.example`
- `openWordModal`：先查本地 `vocab-nce*.json`，再查当前打开词书 `loadedEntries`，再兜底可收藏
- 生词本列表显示来源标签

### C. 其它教材点读（合规）

**不把星火真题 / 四级等整包音频抄进仓库。**

- **新概念**：沿用 `https://nce.mleo.site` 公开 CORS 资源
- **我的教材**：用户导入自有正版 `.mp3` + 同名 `.lrc`，存 IndexedDB，复用 Player + `lrc.js` 的 `parseLrc` 点句播放
- 未发现稳定 CORS 的 VOA 等公开听力源，故未加「公开听力」分类
- **四级、星火、各类真题听力请自行购买正版后导入**；本站只提供播放与点读能力

## 在线使用

GitHub Pages：https://zzj030728-ux.github.io/nce-vocab-app/

Safari / Chrome：「添加到主屏幕」即可当 App 用。

## 本机预览

```bash
cd nce-vocab-app
python -m http.server 8080
```

同一 Wi‑Fi 下手机访问 `http://<电脑局域网IP>:8080`。

### 卡片模式怎么用

1. 打开任一词书 → 右上角打开「卡片模式」
2. 大卡片正面只有英文；点按翻面看音标/释义/例句
3. 「上一词 / 下一词」或键盘 ← →；空格/回车也可翻面
4. 「发音」「加入生词本」在卡片下方

### 导入我的教材

1. 底部「点读」→「我的教材」
2. 选择成对的 `Lesson01.mp3` + `Lesson01.lrc`（basename 相同）
3. 列表中进入即可点句播放、点词查词

## 数据来源与限制

- 词书内容来自 lilinji/English，浏览器直接 `fetch` raw.githubusercontent.com（CORS `*`）
- **中国大陆**访问 GitHub raw 可能较慢或需代理
- 新概念课文/音频不打包进仓库，仅按需加载公开资源
- 用户导入的音频仅存本机 IndexedDB，不上传
- SheetJS 通过 CDN 加载；离线时依赖 Service Worker 缓存（`nce-vault-v2`）

## 技术

- 纯静态 HTML/CSS/JS + PWA
- SheetJS 0.20.3 解析表格
- IndexedDB（`nce-materials`）存用户教材
