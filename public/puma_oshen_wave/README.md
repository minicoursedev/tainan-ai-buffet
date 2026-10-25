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

已完成同步的頭像保存於 repository 的 `public/puma_oshen_wave/assets/store-avatars/<店家ID>.png`，網站與 App 直接讀取 `https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/main/public/puma_oshen_wave/assets/store-avatars/<店家ID>.png?v=<圖片 SHA-256 前 16 碼>`。發布圖最長邊 256 px，內容等比例完整置中；方形畫布不大於縮圖的最長邊，小圖不放大、不補成 512 px 透明畫布，透明度保留。來源較大的圖片只供本機縮圖，不直接讓網站或 App 載入。每家店只有一個正式檔名，內容改變時覆寫，網址版本隨內容更新，以供網站與 iOS App 更新快取。內容與輸出尺寸相同不覆寫圖片、不更動網址；同一 Logo 從舊分享縮圖換成足夠解析度來源，或套用 256 px 發布規格時，應更新正式檔案。未移轉成功的資料保留原有網址並列入同步紀錄；`verified` 不代表遠端網址永久可用。

### 店家頭像同步與資料發布

1. 每次店家資料更新完成、提交最終 `stores.json` 前，先執行全量頭像檢查。使用 Python 3.9+、curl、Pillow 11.3.0；需要安裝時執行 `python3 -m pip install -r scripts/requirements-avatars.txt`。在 website 根目錄執行：

   ```sh
   python3 scripts/store-avatar-sync.py prepare
   ```

2. `prepare` 只檢查啟用店家，先從既有 `shopPhoto.source` 讀取官方帳號頁並確認帳號與頭像標記，優先解析同帳號公開資料的頭像版本、LINE 明示原圖欄位；不足時檢查資料內其他官方社群或 Instagram 頁面實際提供的同帳號 Threads 外連。取得至少 256 px 的原生圖片即足夠，不追求最大原圖。不採用一般封面或貼文圖，不使用登入憑證。缺少來源、未確認頭像或不支援的網站規則，列為待處理。逾時、限流、來源失效或解碼失敗不破壞舊圖與 JSON。
3. 腳本先使用同一網址提供的 ETag／Last-Modified；無法可靠確認未變更時，暫時取得圖片並比對解碼後的可見內容。忽略 metadata 與保守範圍內的輕微轉碼差異；CDN 簽章或參數變更不直接視為換頭像。預設請求間隔 0.6 秒、逾時 20 秒；暫時性連線錯誤最多重試一次，403／429 不立即重試。
4. 同步紀錄為 `scripts/store-avatar-sync-state.json`；本次檢查、待發布欄位差異及公開驗證證據位於被 Git 忽略的 `.avatar-sync/plan.json`；可審閱的完整候選資料為 `.avatar-sync/stores.candidate.json`。`prepare` 不寫入正式 `stores.json`。`--only <ID,ID>` 僅供局部診斷，局部結果不能發布。完整檢查後可執行 `python3 scripts/store-avatar-sync.py retry`，只重試失敗或低解析度項目、保留成功結果；若資料已變更則重新 prepare。
5. 有圖片變更時，先提交圖片與同步紀錄並推送，直接由 GitHub Raw 公開，不需要建置或部署網站。此時正式 `stores.json` 仍使用先前網址。之後執行：

   ```sh
   python3 scripts/store-avatar-sync.py apply
   ```

6. `apply` 逐張 GET GitHub Raw 圖片，確認 HTTP 200、repository 路徑、檔案指紋與不超過 256 px 的方形尺寸全部通過後，才更新 `stores.json` 的 `shopPhoto`。一張失敗就停止，正式 JSON 不變。保留來源頁面、平台及所有其他店家欄位；若頭像或啟用狀態在檢查後被修改，要求重新 `prepare`。Raw 快取尚未更新時稍後重試 apply，不以重新部署網站處理。
7. 檢查 `stores.json` 差異，依下方縣市分檔流程執行 `python3 scripts/split-stores.py`，再提交與推送資料。不得直接複製候選 JSON 覆寫正式檔案，也不得在圖片尚未公開前發布新網址。部署 workflow 已排除純頭像、同步紀錄、店家主檔及縣市 JSON 更新，因此這類更新不會觸發 GitHub Pages；Raw 與 App 快取仍可能延遲更新。
8. 僅供人工查證補充：若官方大頭貼只有在既有登入瀏覽器中可見，從實際頭像 DOM 取得完整網址，下載並解碼後製作 JSON 陣列，包含 `id`、`source`、`platform`、`imageUrl`、當日 `checkedAt`、原檔 `sha256`、官方帳號及頭像的 `evidence`。執行 `prepare --reviewed-sources <檔案>`；腳本重新下載核對 SHA-256，仍只發布縮小圖片。該清單是人工審核輸入，必須先核對官方來源，不能拿未查證圖片、貼文或封面代替。保存查證證據於輸出資料夾，不加入登入憑證。這不代表免登入流程可取得同一大圖；下次無法自動取得時保留已發布 Logo 並記錄待查。
9. 自動驗證命令：`python3 -m unittest discover -s scripts -p 'test_store_avatar_sync.py'`。正式驗收仍須查看實際店家圖片與網站／App 顯示結果。

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

### WebP 縮圖（2026-10-25）

店家與設計師 Logo 統一存於 `assets/<ID>/logo.webp`；設計師作品為 `assets/<ID>/1.webp`、`2.webp` 等，作品數不限。Logo 最長邊 256 px、作品最長邊 800 px，不放大，每張最多 100 KB。資料引用帶內容版本參數的 GitHub Raw 網址，原始來源保留。舊版 PNG 檔保留供既有引用相容；新增與重製採用 WebP。
