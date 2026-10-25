# 店家頭像與資料更新

1. 沿用使用者既定最小修改範圍，保留其他店家欄位與既有修改。
2. 每次完成店家資料編輯、提交最終 `stores.json` 前，從 website 根目錄執行 `python3 scripts/store-avatar-sync.py prepare`，檢查全部啟用店家並記錄失敗／缺來源項目。局部 `--only` 僅供診斷，不能代替發布前檢查。
3. 頭像正式檔名固定為 `assets/store-avatars/<店家ID>.png`。來源內容改變才覆寫；相同內容不改正式圖片或網址。保留原始官方 `shopPhoto.source`，`shopPhoto.url` 使用 GitHub Raw 的 `minicoursedev/tainan-ai-buffet/main/public/puma_oshen_wave/assets/store-avatars/` 完整 HTTPS 網址及內容版本參數；不改 App 資料模型或 `mapMarker`。
4. 發布順序為：準備圖片與候選資料 → 提交／推送圖片與同步紀錄 → 執行 `python3 scripts/store-avatar-sync.py apply` 驗證所有 GitHub Raw 圖片 → 檢查 JSON 差異與縣市分檔 → 提交／推送資料。禁止直接用 `.avatar-sync/stores.candidate.json` 取代正式資料或跳過公開驗證。
5. 純頭像、同步紀錄、店家主檔及縣市 JSON 更新已由部署 workflow 的 paths-ignore 排除；提交／推送即可公開，無須建置、手動觸發或等待 GitHub Pages 部署。Raw 快取尚未更新時保留舊資料，稍後重試 apply。
6. 完整命令、依賴、來源驗證與失敗處理見本目錄 README 的「店家頭像同步與資料發布」。缺來源／無法確認的頭像須保留待辦，不自行用其他圖片補位。

7. Logo 發布規格為最長邊 256 px，來源達 256 px 即足夠；不追求最大原圖、不放大小圖、不將小圖補進固定 512 px 透明畫布。較大來源僅用於本機縮圖。人工瀏覽器候選須保存官方帳號／頭像證據與原檔 SHA-256，使用 `--reviewed-sources` 驗證後才整合。
