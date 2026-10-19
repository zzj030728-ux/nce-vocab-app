# 英语词库

手机优先 PWA：**词库总站**浏览 [lilinji/English](https://github.com/lilinji/English) 全部分类与词书（按需从 GitHub raw 拉取 xlsx/xls/txt，不把 960+ 词表打进仓库）；**点读**含新概念公开源 + 用户自备教材导入；**今日学习**分级路径；生词本与间隔复习全局共用 localStorage。

## 功能

| Tab | 说明 |
|-----|------|
| 词库 | 分类 → 词书 → 词表；顶部「今日学习」入口；释义摘要；卡片模式；加入生词本 |
| 点读 | 顶部子 Tab：**新概念**（mleo LRC/MP3）/ **我的教材**；课文页支持**跟读录音**、**句型/听写/短写** |
| 生词 / 复习 | 显示来源（新概念 / 词书名 / 我的教材）；与 `nce-saved` / `nce-progress` 兼容 |

### 今日学习（分级路径）

零基础不迷路：词库首页顶部大卡片进入「今日学习」。

1. 路径分四阶段（`data/path.json`）：入门（NCE1 1–20）→ 基础 → 进阶 → 高阶
2. 每天显示当前阶段的一课任务 + 建议记词数量
3. 「开始今日课文」跳转新概念点读；「今日练习」打开句型/听写；「今日短写」打开短写 Tab；学完后点「完成今日」推进下一步并累计连续天数（`localStorage` 键 `nce-path-progress`）
4. 可在页面底部手动「选择起点阶段」

### 跟读录音

在点读阅读器中：

1. 点「跟读」打开跟读条
2. 点选当前句 →「听原音」播该句 →「录音」用麦克风跟读 →「停止」后「播放我的」回听
3. 录音仅存本机内存（blob），不上传；可反复重录
4. **优先使用 GitHub Pages（HTTPS）**。本机 `http://192.168.x` 在部分手机（尤其 iOS Safari）上麦克风可能被浏览器限制

### 句型口头练习 + 听写默写

面向有一点基础的学习者，在点读阅读器中点「练习」（跟读旁）：

1. **句型**：从本课英文句启发式抽出 3～5 条可替换句型（模板含 `____` +「试着换成」提示）。可「听模板」（浏览器 TTS）、录音口头说（复用跟读 MediaRecorder）、勾选「练过」（`localStorage nce-drill-practiced`）
2. **听写**：抽出 5～8 个实词，先听 TTS 再拼写；对错即时反馈；错词写入 `localStorage nce-missed`；可「加入生词本」
3. **今日学习**页有「今日练习」入口，打开当日课文并自动展开练习面板
4. **生词**页底部展示听写错词本

### 短写练习（造句 + 小作文）

练习面板第三 Tab「短写」，或今日页「今日短写」：

1. **本课提示**（本地启发式，不调远程 LLM）：根据当前课文中英文生成 **1 道造句** + **1 道 40～60 词小作文**
2. 在 App 内写作，草稿按 `lessonId` 存 `localStorage`（键 `nce-write-drafts`），并保留简略历史
3. **复制批改提示词**：把题目 + 你的作文包成可粘贴到 DeepSeek / ChatGPT 的批改 prompt（中文说明 + 英文习作）。**手机推荐流程**：写完 → 复制 → 打开 DeepSeek App / 网页粘贴
4. **可选本机批改**：若在设置框填写并「记住」地址（存 `localStorage nce-dsh-endpoint`，默认空），出现「发送到本机批改」；`fetch` POST 到该地址。失败则提示仅 localhost 可用、请用复制——**不强依赖 DeepSeek Harness**
5. **重要限制**：DeepSeek Harness 若跑在 Windows 本机 `http://localhost:3080`，云端 GitHub Pages / 手机浏览器 **无法直连你电脑的本机 API**。手机请一律用「复制批改提示词」；仅当你用**同一台电脑的浏览器**打开本站，且 Harness 已监听时，本机发送才可能成功


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

> **麦克风提示**：跟读录音依赖 `getUserMedia`，在非 HTTPS 的局域网 IP 上可能不可用。完整跟读请用上方 Pages 链接。

### 卡片模式怎么用

1. 打开任一词书 → 右上角打开「卡片模式」
2. 大卡片正面只有英文；点按翻面看音标/释义/例句
3. 「上一词 / 下一词」或键盘 ← →；空格/回车也可翻面
4. 「发音」「加入生词本」在卡片下方

### 导入我的教材

1. 底部「点读」→「我的教材」
2. 选择成对的 `Lesson01.mp3` + `Lesson01.lrc`（basename 相同）
3. 列表中进入即可点句播放、点词查词、跟读录音

## 数据来源与限制

- 词书内容来自 lilinji/English，浏览器直接 `fetch` raw.githubusercontent.com（CORS `*`）
- **中国大陆**访问 GitHub raw 可能较慢或需代理
- 新概念课文/音频不打包进仓库，仅按需加载公开资源
- 用户导入的音频仅存本机 IndexedDB，不上传
- 跟读录音仅存内存 blob，刷新页面即清空
- SheetJS 通过 CDN 加载；离线时依赖 Service Worker 缓存（`nce-vault-v5`）

## 技术

- 纯静态 HTML/CSS/JS + PWA
- SheetJS 0.20.3 解析表格
- IndexedDB（`nce-materials`）存用户教材
- MediaRecorder + getUserMedia 跟读 / 句型录音（HTTPS 推荐）
- speechSynthesis 听写与句型 TTS；错词本 `nce-missed`
- 短写草稿 `nce-write-drafts`；可选本机批改地址 `nce-dsh-endpoint`
