# Cabingo

繁體中文的 3D 機艙巡艙小遊戲。這份專案只包含 3D v0.4.2：在機艙中走動、觀察現場、處理三項安全檢查與三個旅客服務需求，再回前方回報。

這是虛構的教育遊戲，**不是經認證的航空訓練，也不是任何航空公司的作業程序**。

## 本機啟動

需要 Python 3。於專案根目錄執行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 -d public
```

在瀏覽器開啟 <http://localhost:4173/>。若已安裝 Node.js，也可用 `npm start` 啟動同一個伺服器。請透過 HTTP 開啟；直接雙擊 HTML 的 `file://` 模式可能無法載入 ES modules。

瀏覽器必須支援 WebGL 2，且裝置與瀏覽器政策允許圖形加速。若無法建立 WebGL 場景，頁面會顯示錯誤提示與重新載入按鈕。

不需要 `npm install`、帳號、API key、後端或 CDN。Three.js 已附在 `public/vendor/`，執行時不向外部網站載入模型、貼圖或聲音。本版本使用自製合成事件音效，以及隨專案附帶的 Carefree — Kevin MacLeod（CC BY 4.0）錄音配樂；不播放機艙底噪。音樂在首次啟用後從本機載入，載入失敗不影響遊玩與操作音效。首次點擊開始後才啟用聲音；可在上方的同一組喇叭與滑桿靜音或調整總音量，在暫停選單獨立調整音樂音量；操作說明收在右上方 ⓘ。已閱讀的說明會存在此瀏覽器的 localStorage；拒絕儲存仍可遊玩。

## 操作與玩法

- WASD / 方向鍵 / 螢幕方向鍵：依畫面方向走動，兩種鏡頭方向一致
- E / 互動按鈕：進入標記圈後互動；處理時依提示點按，或按住至綠區再放開。操作失敗可重試，不扣判斷分
- 前景處理不再要求被動等候；正式 100 秒與同事交接 12 秒仍保留
- 機艙左／右依旅客面向表示，走道事件沿用原旅客位置
- 1–3 / 數字鍵盤：選擇當前選項
- C / 鏡頭按鈕：切換跟隨鏡頭與全艙總覽
- Esc / 暫停按鈕：暫停；ⓘ 按鈕：需要時查看操作說明
- 離開視窗自動顯示全畫面暫停遮罩，回來後點擊繼續或按 Enter／空白鍵；不會自行恢復。原本已手動暫停時，先返回原暫停畫面
- 正式巡艙有 100 秒行動時間；閱讀、說明、暫停與失焦不扣時
- 不計時練習不計罰分，可先熟悉六個任務
- 一次交接額度、各需求一次等候延長；安全失誤與服務修正保留至結算
- 全部完成後必須在倒數結束前回前方回報

## 結算錯題重練

在登機或巡艙的結算畫面，下滑至「哪裡做錯，就再練一次」，可直接重練本局曾選錯的題目，不必整章重玩。保留答錯當下的線索、登機圖卡與選項；支援點選、數字鍵 1–3 和數字鍵盤，Esc 返回結算。

答對後比較本局與重練的選錯次數，可再次重練。這是原題的判斷練習，不會實際執行送達等動作，不計時、不計分，也不改動正式成績、章節進度或收藏。錯題與重練結果僅保留於當次結算，重新開局或重新載入後不保留；單題答對不代表通過正式考核。

## 專案結構

```text
public/
  index.html                  頁面與介面
  style.css                   響應式 HUD、面板與控制區
  main.js                     輸入、介面與遊戲迴圈
  preflight.mjs               巡艙規則及可測試的遊戲狀態
  scene.js                    原創機艙幾何、鏡頭與動畫
  presentation.mjs            姿態、鏡頭、圖示避讓及動作音效里程碑
  audio.mjs                   本機配樂播放與合成事件音效
  assets/audio/carefree.mp3    Carefree — Kevin MacLeod（CC BY 4.0）
  results.mjs                 星等、改善建議及本機紀錄比較
  favicon.svg                 原創圖示
  THIRD_PARTY_NOTICES.txt      第三方與素材來源說明
  vendor/                     Three.js 0.180.0 及完整授權
tests/                        遊戲邏輯、輸入、場景及靜態版面測試
build.cjs                     將 public/ 複製為 dist/
```

## 測試與建置

JavaScript 測試需要 Node.js 20 或以上，沒有額外 npm 套件。靜態 DOM/CSS 測試需要 Python 3.10 或以上及 lxml：

```sh
python3 -m venv .venv
# macOS / Linux
. .venv/bin/activate
# Windows PowerShell 改用：.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt

npm test
npm run test:layout
npm run build
```

`npm run test:all` 會依序執行兩組測試。建置輸出是 `dist/`，可由任何一般靜態 HTTP 伺服器提供；Cloudflare 透過 GitHub 整合監聽 main 分支建置與部署（設定在 Cloudflare Dashboard）。

- 遊戲測試：任務生成、走動路線、等待、交接、修正、評分、暫停與練習流程
- 輸入測試：使用正式控制器搭配 DOM/storage 測試替身，檢查鍵盤、觸控、重複觸發與錯誤復原
- 場景測試：使用真實 Three.js 幾何與投影數學，但 WebGLRenderer 以測試替身取代
- 版面測試：靜態 DOM、CSS cascade 與宣告尺寸計算；不是瀏覽器像素測試

測試會在被 Git 忽略的 `artifacts/` 產生結果 JSON；建置檔、測試結果、截圖和機器專用設定不納入原始碼。

## v0.3 演出與回饋

- 24 位旅客有分相位的待機、轉頭與錯選／完成反應；走到走道的旅客不會同時留在座位上。
- 行李、餐桌、安全帶與服務交付配合組員與旅客手勢；處理以點按及按住後放開完成，安全評價限制保留。
- 安全判斷使用近景與下方半透明玻璃選單；快速服務保留巡艙鏡頭。
- 遠處需求以頭頂 SVG 圖示表示，靠近才展開文字，圖示避開其他圖示與 HUD。
- 交接前即顯示每輪一次、確認交接後送達需 12 秒的說明。
- 正式結算顯示 0–3 星、改善建議與「此瀏覽器最佳紀錄」；練習、未完成或 0 星結果不寫入正式紀錄。
- 靜音、音量與最佳紀錄保存在本機；儲存或 Web Audio 不可用不影響遊玩。
- 尊重減少動態效果設定；暫停與失焦停止音訊及處理進度。

## 驗證範圍

自動測試分別覆蓋規則、實際控制器、真實 Three.js 幾何與投影、聲音生命週期、標籤避讓及最佳紀錄。場景測試使用替代 WebGLRenderer，音訊測試使用替代 AudioContext；兩者皆不能取代實際 GPU 畫面與聽感檢查。

本輪可在本機 Chrome 顯示 WebGL 機艙，並檢查桌面與 390×844 版面。實際測試結果與尚未驗證項目以交付驗證記錄為準，不沿用 v0.2.1 的 120 fps 測試結果。此版本仍是低多邊形原型，未加入第二章、外部人物模型、完整配音或完整語音。

## 上傳到 GitHub

目標倉庫：<https://github.com/CT77777/Cabingo>。

1. 解壓縮 ZIP，進入含有 `README.md`、`package.json`、`public/`、`tests/` 的資料夾。
2. 用有寫入權限的 GitHub 帳號開啟目標倉庫，先確認倉庫目前的內容。
3. 若仍是空倉庫，使用頁面上的「uploading an existing file」；若已有內容，使用「Add file → Upload files」。
4. 上傳解壓後的檔案與資料夾，讓 `README.md` 和 `package.json` 直接位於倉庫根目錄。不要只上傳 ZIP，也不要多包一層外層資料夾。記得包含隱藏檔 `.gitignore`。
5. 若倉庫已經有內容，先拉取／下載最新版本，確認沒有同名檔案會覆寫現有工作；使用新分支並開 Pull Request 檢查差異。保留原有授權與檔案，遇到衝突先處理，不要 force push。
6. 填入提交訊息（例如 `Import standalone Cabingo 3D source`）並提交；完成後檢查 `public/index.html` 與 `public/vendor/THREE-LICENSE.txt` 都存在。

不需要把 `dist/`、`artifacts/`、`.venv/` 或 `node_modules/` 上傳到 GitHub。此倉庫已由 Cloudflare Git 整合監聽 main。部署狀態可查看該 commit 的 Workers Builds 檢查。

## 素材與授權

機艙幾何、角色、圖示、情境邏輯與介面為此原型原創。沒有複製參考專案的程式碼、模型、角色、聲音或其他素材。完整來源說明見 [第三方聲明](public/THIRD_PARTY_NOTICES.txt)。

唯一附帶的第三方執行期程式庫是 Three.js 0.180.0，使用 MIT License；完整授權保留於 [THREE-LICENSE.txt](public/vendor/THREE-LICENSE.txt)。該授權僅涵蓋對應的第三方程式碼。本專案的原創程式碼尚未指定開源授權。
