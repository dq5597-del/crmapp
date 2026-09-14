# 光輝系統部署檢查表

## 1. 資料庫先行

本版本的程式會使用 `approval_instances.routing_user_id`、EIP、報銷及內控資料表，因此必須先套用 Supabase migrations，再部署網站。

```powershell
npx supabase login
npx supabase link --project-ref <你的 project ref>
npx supabase migration list
npx supabase db push
```

套用後請在 Supabase SQL Editor 確認最新 migration 為：

- `20260909131300_integrate_eip_workflow_internal_controls.sql`
- `20260910001047_harden_api_workflow_and_rls.sql`

## 2. 環境變數

以 `.env.local.example` 為清單。正式環境至少必須有：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`（啟用提醒排程時）
- `WC_WEBHOOK_SECRET`（啟用官網訂單回寫時）

所有 service role、API secret、private key 都不得使用 `NEXT_PUBLIC_` 前綴。

## 3. 部署前驗證

```powershell
npm install
npm audit --omit=dev
npm run lint -- --quiet
npx tsc --noEmit --incremental false
npm run build
```

四個指令都必須成功，且安全掃描應顯示 `found 0 vulnerabilities`。

## 4. 部署順序

1. Supabase `db push`
2. 設定正式環境變數
3. 部署 Next.js
4. 用管理員、一般員工、主管、會計與 HR 帳號各驗一次權限
5. 建立測試報銷／採購／請假單，確認依權責表路由且核准後不可竄改

若資料庫尚未連結，請勿只部署前端；新程式與舊資料庫 schema 不一致會讓簽核 API 失敗。
