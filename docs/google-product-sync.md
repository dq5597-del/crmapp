# Google 試算表產品同步

Google 試算表是系統管理員的產品批次編輯介面；CRM 仍是正式主資料來源。官網發布維持獨立步驟，不會因試算表修改而直接上架。

## 試算表

- 文件：`光輝系統_產品資料同步表`
- 工作表：`產品匯入`
- 第 1 列是固定表頭，第 2 列是欄位說明，第 3 列開始一列一個 SKU。
- `CRM產品ID`、`CRM更新時間`、`同步狀態`、`最後同步時間`、`同步訊息` 是系統欄位，不可手動修改。
- 同商品的變體仍以相同「系列代碼」分組；每個 SKU 的型號與官網 SKU 必須不同。
- 圖片自動同步請使用「主圖網址／其他圖片網址」。在 Google 試算表直接貼入的圖片暫不由第一版自動傳送。

## Vercel 環境變數

在 Production、Preview、Development 都加入：

```text
GOOGLE_PRODUCT_SHEET_ID=Google 試算表 ID
GOOGLE_PRODUCT_SYNC_SECRET=至少 24 字元的獨立隨機密鑰
SUPABASE_SERVICE_ROLE_KEY=既有的 Supabase service role key
```

同步密鑰不得放進 Git、試算表儲存格或聊天內容。

## 安裝 Apps Script

1. 打開 Google 試算表，選擇「擴充功能 → Apps Script」。
2. 將 `google-apps-script/product-sync.gs` 全部貼入並儲存。
3. 回到試算表重新整理，選擇「光輝系統 → 設定同步連線」。
4. 輸入正式 CRM 網址與 Vercel 中相同的同步密鑰，完成 Google 授權。
5. 第一次先執行「從 CRM 更新試算表」，讓既有商品取得 CRM ID 與版本時間。

## 同步規則

- 編輯產品欄位後，資料列會標記為「待同步」。
- 每分鐘最多同步 100 筆；也能手動同步選取列。
- 若 CRM 在試算表上次拉取後被別人修改，該列會顯示「衝突」，不會覆蓋 CRM。
- 刪除試算表資料列不會刪除 CRM 商品；要停用商品請把「啟用」改為「否」。
- 同步端點只接受設定的試算表 ID 與密鑰，使用 service role 執行，僅供系統管理員的總表使用。
