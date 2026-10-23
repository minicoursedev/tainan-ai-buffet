# 洋流地圖 puma_oshen_wave

2026-10-18 重新製作。HTML、CSS、JavaScript 全部重新撰寫，移除舊海報首頁、舊版型及示範模式。

視覺以使用者提供的原始圖片為依據：粉紅／綠色粗圓主標、白描邊、黃色星形、愛心、天空藍雲朵、斜向緞帶、圓潤面板。網站標題為「洋流地圖」，搜尋與店家地圖接在標題之後；不沿用原海報的活動標題、日期和地點。原始圖片保存在 assets/key-visual.png 作為設計來源。

## 資料維護

編輯 stores.json 的 stores 陣列。店家欄位：id（唯一）、category、giftStatus、name、address、social（facebook、instagram、threads）。小物資訊為靜態資料，giftStatus 固定為「可能有小物」，不提供狀態篩選或回報功能。社群沒有資料則留空字串。文字以 textContent 呈現，社群外連只接受 HTTPS。

目前花田 HANA DA 的店名、地址、Facebook 是既有查證資料；「可能有小物」為靜態提示，不代表即時庫存。保留資料來源與查證日期於 JSON。

## 縣市邊界原始資料來源

1. **提供機關與資料集**：內政部國土測繪中心「[直轄市、縣市界線（TWD97 經緯度）](https://data.gov.tw/dataset/7442)」，共 22 個縣市。
2. **官方下載**：[國土測繪圖資服務雲下載頁](https://maps.nlsc.gov.tw/pro/download.jsp)，原始 ZIP 為 <https://maps.nlsc.gov.tw/download/縣市界線(TWD97經緯度).zip>。
3. **採用版本**：2026-10-23 下載，ZIP 內的原始檔為 `COUNTY_MOI_1090820`（2020 年版本）；下載日期不代表圖資版本日期。ZIP SHA-256：`0c6fca34a92b92ef3e9a41957e403cb89e814bb64942ca7c7e51c746f913d49d`。
4. **座標與代碼**：來源為 TWD97 經緯度（EPSG:3824），轉為 WGS84（EPSG:4326）的 GeoJSON，座標順序為 `[經度, 緯度]`。`COUNTYCODE` 直接保留官方原始欄位，以字串儲存，保留前導零，例如連江縣 `09007`、臺南市 `67000`、高雄市 `64000`。
5. **轉換與簡化**：使用 pyshp 3.1.6 讀取 SHP、pyproj 3.8.0 轉換座標，再以 Mapshaper 0.7.97 的 Douglas–Peucker 方法、`interval=100m keep-shapes` 簡化。先輸出至小數點五位，再重新讀入，以 `-clean gap-width=0` 修復交界重疊。100 公尺是簡化參數，不是定位準確度保證；邊界附近可能判到鄰縣市。
6. **授權與顯名**：原始資料依[政府資料開放授權條款第 1 版](https://data.gov.tw/license)釋出，可依條款使用、修改及商用；使用原始資料或衍生資料時應保留來源與授權聲明。簡化版 GeoJSON 已加入 `copyright`、`source`、`license` 欄位。

顯名聲明：內政部國土測繪中心，2020 年「直轄市、縣市界線（TWD97 經緯度）」，原始檔 `COUNTY_MOI_1090820`。本專案已轉換為 GeoJSON 並以 100 公尺參數簡化邊界。原始資料依政府資料開放授權條款第 1 版進行公眾釋出，使用者於遵守該條款各項規定之前提下，得利用之。授權條款：<https://data.gov.tw/license>。

簡化版現存於 `data/taiwan-counties.geojson`，總表為 `data/store-index.json`，各縣市店家資料位於 `data/stores/`；尚未接入前端定位流程。店家總表與分檔採相同 `COUNTYCODE`，分檔命名為 `tw_{countycode}_store.json`；這些店家資料來自既有 `stores.json`，並非國土測繪中心提供。

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

## 縣市店家分檔

在 website 目錄執行：

```sh
python3 scripts/split-stores.py
```

1. script 以自身位置解析預設路徑，讀取 `public/puma_oshen_wave/stores.json` 與 `public/puma_oshen_wave/data/store-index.json`，輸出至 `public/puma_oshen_wave/data/stores/`，不依賴執行時的工作目錄。可用 `--source`、`--index`、`--output-dir` 覆寫路徑。
2. 依地址中的縣市名稱分檔，將「台／臺」視為相同。無法唯一辨識縣市時，在寫檔前報錯。總表以五碼 COUNTYCODE 字串為索引，保留前導零。
3. `display` 不影響轉檔；全部 22 個縣市皆產製，沒有店家者保留空陣列。分別處理 `stores`、`pendingStores`，並保留 disabled 店家與原始欄位。
4. 原始頂層 metadata（含地圖名稱與中心點）原樣保留。維護時修改來源 `stores.json` 再重跑 script，不手動修改分檔。重跑會覆寫分檔，不改來源或總表。
5. 官方原始 SHP、完整 GeoJSON 與其他簡化測試版留在網站外的工作區 `output/taiwan-counties/`。

## 小遊戲：農漁保鮮線

入口位於頁首「玩遊戲・農漁保鮮線」，遊戲路徑為 `/puma_oshen_wave/games/fresh-route/`，返回地圖連結使用同站路徑。本地與正式網站使用相同路由。

此整合版以 `games/fresh-route/` 下的 HTML、CSS、JavaScript 與 assets 為維護來源，隨 Astro public 目錄直接建置，不依賴網站倉庫以外的檔案。原型仍保留在工作區上層的 `games/fresh-route/`。
