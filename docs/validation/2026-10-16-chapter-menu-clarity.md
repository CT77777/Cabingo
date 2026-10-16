# 章節選單層級辨識

2026-10-16 · `codex/targeted-retry`

## 調整

- 展開時標題為「選擇章節」；收合時附上目前選取的章節名稱。
- 所有章節維持同層級，目前章節顯示「✓ 已選取」並保留原本的最佳星等或可遊玩狀態。
- 章節代碼移到下方介紹區，搭配獨立的中文章節標題及分隔線，避免誤認選單項目為目前章節的子章節。
- 沿用原生 details/summary、按鈕及 aria-pressed。

## 驗證

- `npm run test:all` 中的全部 Node 測試通過（含登機完整路線與 12 個 guided seeds）；隨後的系統 Python 版面步驟因缺少 lxml 結束，該步驟另用隨附 Python 執行並通過，未安裝額外套件。
- `node tests/preflight-3d-input.test.cjs`：107/107 通過。
- 靜態版面測試：307/307 通過。系統 Python 缺少 lxml，改用 Codex 隨附 Python 執行 `tests/preflight-3d-layout.test.py`。
- `npm run build`、`git diff --check` 通過。
- 本機瀏覽器 `http://127.0.0.1:4173/`：Enter 展開、空白鍵收合；鍵盤選擇登機後，章節標題、介紹、開始按鈕及選取狀態同步更新，再切回巡艙。
- 390×844 viewport override 下檢查展開及收合；瀏覽器縮放後實際 CSS viewport 為 325×703，沒有文件水平溢出。這是尺寸模擬，沒有手機實機驗收。
- 已恢復原本瀏覽器尺寸，保留第 2 章展開畫面；主控台未捕捉到 error。
- 截圖：`artifacts/chapter-menu-clarity.jpg`（忽略檔案）。

本次未執行真人完整通關或重新確認正式部署。
