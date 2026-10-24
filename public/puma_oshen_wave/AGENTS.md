# 店家頭像與資料更新

1. 沿用使用者既定最小修改範圍，保留其他店家欄位與既有修改。
2. 每次完成店家資料編輯、提交最終 `stores.json` 前，從 website 根目錄執行 `python3 scripts/store-avatar-sync.py prepare`，檢查全部啟用店家並記錄失敗／缺來源項目。局部 `--only` 僅供診斷，不能代替發布前檢查。
3. 頭像正式檔名固定為 `assets/store-avatars/<店家ID>.png`。來源內容改變才覆寫；相同內容不改正式圖片或網址。保留原始官方 `shopPhoto.source`，`shopPhoto.url` 使用本站完整 HTTPS 網址及內容版本參數；不改 App 資料模型或 `mapMarker`。
4. 發布順序為：準備圖片與候選資料 → 先部署圖片 → 執行 `python3 scripts/store-avatar-sync.py apply` 驗證所有公開圖片 → 檢查 JSON 差異與縣市分檔 → 提交／推送資料。禁止直接用 `.avatar-sync/stores.candidate.json` 取代正式資料或跳過公開驗證。
5. 若只是資料更新、正式圖片沒有變更，不需重建網站。若新增或更換圖片，JSON-only 推送無法發布圖片，須依使用者當次授權處理圖片部署；不可假定過去 JSON-only 授權涵蓋部署。
6. 完整命令、依賴、來源驗證與失敗處理見本目錄 README 的「店家頭像同步與資料發布」。缺來源／無法確認的頭像須保留待辦，不自行用其他圖片補位。
