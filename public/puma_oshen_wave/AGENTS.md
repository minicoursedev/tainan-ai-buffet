# 店家頭像與資料更新

1. 沿用使用者既定最小修改範圍，保留其他店家欄位與既有修改。
2. 沿用既有頭像，不為其他資料更新重查頭像；只有指定新增或更新頭像時才準備該批圖片。純圖片網址遷移只比對既有檔案，不重新抓取官方社群。
3. 頭像正式檔名固定為 `assets/<店家ID>/logo.webp`。來源內容改變才覆寫；相同內容不改正式圖片或網址。保留原始官方 `shopPhoto.source`，`shopPhoto.url` 使用 `https://minicourse.dev/puma_oshen_wave/assets/` 完整 HTTPS 網址及內容版本參數；不改 App 資料模型或 `mapMarker`。
4. 發布順序為：準備圖片與候選資料 → 執行 `apply --bundled` 驗證本機圖片並更新 JSON → 檢查 JSON 差異與縣市分檔 → 圖片及 JSON 一起提交／推送 → 等待 GitHub Pages 部署並驗證 minicourse.dev 圖片與 JSON。禁止直接用 `.avatar-sync/stores.candidate.json` 取代正式資料或跳過公開驗證。
5. 圖片與所有 web JSON 統一由 minicourse.dev 供應，任何圖片或 JSON 更新必須觸發 GitHub Pages 部署。前端 JSON 請求使用 cache: no-store；圖片保留內容版本號。推送後執行 `python3 scripts/verify-site-publication.py --commit <新提交> --base <推送前遠端提交>`；正式站內容與提交相符才回報發布完成。
6. 完整命令、依賴、來源驗證與失敗處理見本目錄 README 的「店家頭像同步與資料發布」。缺來源／無法確認的頭像須保留待辦，不自行用其他圖片補位。

7. Logo 發布規格為最長邊 256 px，來源達 256 px 即足夠；不追求最大原圖、不放大小圖、不將小圖補進固定 512 px 透明畫布。較大來源僅用於本機縮圖。人工瀏覽器候選須保存官方帳號／頭像證據與原檔 SHA-256，使用 `--reviewed-sources` 驗證後才整合。

8. 使用者指定的 WebP 縮圖規格：Logo 最長邊 256 px，作品最長邊 800 px，每張最多 100 KB。店家 Logo 與設計師圖片分別使用各自 ID 目錄，作品為 1.webp、2.webp 等序號；保留原始來源與未遷移的舊檔。

9. 作者 OG 圖由固定建置流程產生至 `dist/puma_oshen_wave/assets/<id>/og.jpg`：1200×630 白底，左側為現有 Logo（等比例完整放入 470×470 區域，不裁切），右側為作者名字與已提供的簡介；無簡介就留空，不自動補寫，不加網站名稱或網址頁尾。沿用已核對的本機 Logo，不為 OG 圖重查社群，不改 Logo 原檔；簡介僅依使用者提供內容更新。缺 Logo 時保留既有首張作品備援；兩者皆缺則沿用展覽分享圖。字型與授權保存在 `scripts/fonts/`，建置不依賴系統字型或網路。版本號依完整 OG 圖內容產生，Logo、名字或簡介改變時更新版本；未變時網址保持一致。`npm run build` 與 `npm run check` 都必須產生 OG 圖與 `dist/puma_oshen_wave/designer/og-images.json`，bot 發布同樣執行此流程。
