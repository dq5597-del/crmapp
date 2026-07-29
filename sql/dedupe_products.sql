-- ============================================================
-- 移除重複產品（依「型號 model」判定，保留最早建立的一筆）
-- 規則：
--   1. 只比對「型號非空白」的產品；空白型號一律不動。
--   2. 型號相同(不分大小寫、去頭尾空白)視為同一組。
--   3. 每組保留 created_at 最早那筆，其餘視為重複。
--   4. 重複品若被報價單/銷貨單/庫存等外鍵引用 → 自動跳過不刪（保護歷史資料）。
--
-- 用法：先跑【第 1 段預覽】確認要刪什麼，沒問題再跑【第 2 段刪除】。
-- ============================================================


-- ── 第 1 段：預覽（不會刪任何東西）────────────────────────────
-- 「動作」欄：保留 = 會留下；刪除 = 屬於重複、將嘗試刪除（被引用者仍會被跳過）
WITH ranked AS (
  SELECT
    id, brand, product_name, model, created_at,
    row_number() OVER (PARTITION BY upper(trim(model)) ORDER BY created_at ASC, id ASC) AS rn,
    count(*)     OVER (PARTITION BY upper(trim(model)))                                  AS grp_cnt
  FROM products
  WHERE model IS NOT NULL AND trim(model) <> ''
)
SELECT
  CASE WHEN rn = 1 THEN '保留' ELSE '刪除' END AS 動作,
  model         AS 型號,
  product_name  AS 名稱,
  brand         AS 品牌,
  created_at    AS 建立時間,
  id
FROM ranked
WHERE grp_cnt > 1
ORDER BY upper(trim(model)), rn;


-- ── 第 2 段：實際刪除（不可逆，請先跑完第 1 段確認）──────────────
-- 逐筆嘗試刪除；若被外鍵引用（報價單/銷貨單/庫存等）則跳過該筆，
-- 並在下方 Messages/NOTICE 顯示被跳過的 id。
DO $$
DECLARE
  r          RECORD;
  deleted    int := 0;
  skipped    int := 0;
BEGIN
  FOR r IN
    SELECT id FROM (
      SELECT id,
             row_number() OVER (PARTITION BY upper(trim(model)) ORDER BY created_at ASC, id ASC) AS rn
      FROM products
      WHERE model IS NOT NULL AND trim(model) <> ''
    ) t
    WHERE rn > 1
  LOOP
    BEGIN
      -- 先清掉「屬於這個產品自己」的附屬資料（圖片/下載/特色/供應商）
      DELETE FROM product_images    WHERE product_id = r.id;
      DELETE FROM product_downloads WHERE product_id = r.id;
      DELETE FROM product_features  WHERE product_id = r.id;
      DELETE FROM product_vendors   WHERE product_id = r.id;
      -- 刪產品本身
      DELETE FROM products WHERE id = r.id;
      deleted := deleted + 1;
    EXCEPTION WHEN foreign_key_violation THEN
      -- 被報價單/銷貨單/庫存等引用 → 整筆回滾、跳過不刪
      skipped := skipped + 1;
      RAISE NOTICE '跳過（被引用）：%', r.id;
    END;
  END LOOP;

  RAISE NOTICE '完成：已刪除 % 筆重複品，跳過（被引用）% 筆。', deleted, skipped;
END $$;


-- ── 第 3 段：驗證（可選）── 再看一次是否還有型號重複 ──────────────
-- SELECT model AS 型號, count(*) AS 筆數
-- FROM products
-- WHERE model IS NOT NULL AND trim(model) <> ''
-- GROUP BY upper(trim(model)), model
-- HAVING count(*) > 1
-- ORDER BY 筆數 DESC;
