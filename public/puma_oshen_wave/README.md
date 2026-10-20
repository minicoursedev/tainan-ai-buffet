# 洋流地圖 puma_oshen_wave

2026-10-18 重新製作。HTML、CSS、JavaScript 全部重新撰寫，移除舊海報首頁、舊版型及示範模式。

視覺以使用者提供的原始圖片為依據：粉紅／綠色粗圓主標、白描邊、黃色星形、愛心、天空藍雲朵、斜向緞帶、圓潤面板。網站標題為「洋流地圖」，搜尋與店家地圖接在標題之後；不沿用原海報的活動標題、日期和地點。原始圖片保存在 assets/key-visual.png 作為設計來源。

## 資料維護

編輯 stores.json 的 stores 陣列。店家欄位：id（唯一）、category、giftStatus、name、address、social（facebook、instagram、threads）。小物資訊為靜態資料，giftStatus 固定為「可能有小物」，不提供狀態篩選或回報功能。社群沒有資料則留空字串。文字以 textContent 呈現，社群外連只接受 HTTPS。

目前花田 HANA DA 的店名、地址、Facebook 是既有查證資料；「可能有小物」為靜態提示，不代表即時庫存。保留資料來源與查證日期於 JSON。

## 店家照片

每筆店家使用 `shopPhoto` 欄位記錄官方社群的公開頭像；頭像顯示於店家詳細資訊右上角，與返回按鈕同列，固定 64 × 64 像素，以 `object-fit: cover` 裁切；無照片或載入失敗時不顯示。

1. `url`：已確認的頭像圖片 HTTPS 網址；無法確認時留空字串，不以貼文圖片代替。
2. `source`：實際查核的社群帳號頁面。
3. `platform`：`facebook`、`instagram`、`threads` 或 `line`；無來源時留空。
4. `status`：`verified` 表示已確認頭像；`unavailable` 表示本次未能取得或確認。
5. `checkedAt`：本次查核日期（台灣日期）。
6. `note`：辨識依據或無法確認的原因。

圖片直接引用社群提供的網址，不複製至本站。社群圖片網址可能到期或限制外站引用，`verified` 僅代表查核當時已確認來源，不代表永久可用。

## 地圖

Google Maps JavaScript API 顯示店家標記，依分類篩選並以選取店家或台南火車站置中。火車站不顯示標記，清單按距車站直線距離排序。導航由 Google Maps URLs 開啟。圖資需要網路，嵌入受阻時可用頁面外連。車站中心為 22.997137,120.21295（臺南市政府旅遊服務中心資料）。

## 執行

隨現有 Astro 網站建置，路徑 /puma_oshen_wave/。使用上層網站 npm run build。
本機可在 website/public 執行 python3 -m http.server 4322 --bind 127.0.0.1，再開啟 http://127.0.0.1:4322/puma_oshen_wave/ 。不支援 file://，因店家資料透過 fetch 讀取。尚未部署。

## API 金鑰

目前頁面不讀取 `map-config.json`，專案不包含 Google API 金鑰。此設定檔已加入 Git 忽略規則，請勿提交金鑰。Google Maps 導航外連不需要 API 金鑰。

店家資訊在左側切換顯示，可返回清單，文字可選取複製。導航連結不指定起點，由 Google Maps 使用目前位置或讓使用者選擇起點。
