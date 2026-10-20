# 台南AI爽

一個針對 AI 的小型聚會。每一個主題，大家都能喊卡、都能聚焦。帶著你遇到的問題，一起聊聊。

[官方網站](https://minicourse.dev/) · [第一場簡報：AI 說可以](https://minicourse.dev/event/20260909/)

## 網站架構

官網使用 Astro 產生純靜態 HTML，由 GitHub Pages 透過自訂網域 `minicourse.dev` 提供。頁面不使用 React、Vue 或用戶端 hydration。

- `src/pages/`：首頁、串門子、JSON 與 sitemap 輸出。
- `src/components/`：共用導覽、頁尾、活動卡與 Skill 卡。
- `src/layouts/BaseLayout.astro`：共用 metadata 與網站外框。
- `src/data/`：活動、友站活動與 Skill 的單一資料來源。
- `src/lib/data.ts`：建置時 schema 驗證與活動分類。
- `public/`：需要保留原網址的 CSS、JavaScript、簡報、CNAME、robots.txt 與 Search Console 驗證檔。
- `scripts/check-build.mjs`：驗證正式路由、CNAME、sitemap 與公開 JSON。

## 本機開發

需要 Node.js 24 以上。

```bash
npm install
npm run dev
```

完整驗證：

```bash
npm run check
```

這會依序執行 Astro 型別檢查、靜態建置與公開路由相容性檢查。產物位於 `dist/`，不提交進 Git。

## 公開路由

以下路由是相容性要求，不可在一般改版中變更：

- `/`
- `/friends.html`
- `/event/20260909/`
- `/data/events.json`
- `/data/friends.json`
- `/data/skills.json`
- `/sitemap.xml`
- `/robots.txt`
- `/google0dd0e2c38ab50487.html`

Astro 使用 `build.format: 'preserve'`，同時保留 `friends.html` 與簡報目錄式網址。

## 新增自辦活動

1. 在 `src/data/events.json` 新增場次。
2. 若已有簡報，放在 `public/event/YYYYMMDD/index.html`，並將 `slides` 設為 `event/YYYYMMDD/`。
3. 執行 `npm run check`。

`endsAt` 使用含台灣時區的 ISO 8601 時間，例如 `2026-10-06T21:00:00+08:00`。首頁建置時會產生完整活動 HTML；`archive.js` 仍會在開頁時依瀏覽者的當下時間更新歷次活動，不需要為活動結束額外發布。

## 部署

Push 到 `main` 後，`.github/workflows/deploy.yml` 會：

1. 執行 `npm run check`。
2. 上傳 `dist/` 為 GitHub Pages artifact。
3. 部署到 GitHub Pages。

Repository 的 Pages 來源需設為 **GitHub Actions**，Custom domain 保留 `minicourse.dev`。`public/CNAME` 作為專案內的網域紀錄，正式綁定仍以 GitHub Pages 設定為準。
