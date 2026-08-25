-- ============================================================
-- 產品模糊比對 — 找出「疑似同一項但寫法不同」的產品
--
-- 與 dedupe_products.sql 的差別：
--   dedupe_products.sql  = 型號「完全相同」才算重複
--   本檔                 = 型號／名稱「相近」就撈出來，交給人判斷
--
-- 全部都是唯讀查詢，不會修改或刪除任何資料。
-- 建議照第 1 → 2 → 3 段順序跑，命中率由高到低。
-- ============================================================


-- ── 第 0 段：先看資料量（決定第 3 段跑不跑得動）──────────────
SELECT count(*) AS 產品總筆數 FROM products;


-- ── 第 1 段：型號正規化比對（最高命中率，建議必跑）─────────────
-- 去掉所有非英數字元並轉大寫後比對。
-- 抓得到：QL-1 / QL 1 / ql1 / QL_1 被當成不同產品的情況。
SELECT
  regexp_replace(upper(model), '[^A-Z0-9]', '', 'g')       AS 正規化型號,
  count(*)                                                 AS 筆數,
  string_agg(DISTINCT model, ' ｜ ')                        AS 原始型號寫法,
  string_agg(brand || ' ' || product_name, ' ｜ ')          AS 品項
FROM products
WHERE model IS NOT NULL
  AND regexp_replace(upper(model), '[^A-Z0-9]', '', 'g') <> ''
GROUP BY 1
HAVING count(*) > 1
   -- 只留「寫法不一致」的，完全相同的重複交給 dedupe_products.sql
   AND count(DISTINCT upper(trim(model))) > 1
ORDER BY 筆數 DESC;


-- ── 第 2 段：產品名稱正規化比對 ────────────────────────────
-- 去掉空白與全半形符號後比對名稱，抓「同名但空格/符號不同」。
SELECT
  regexp_replace(upper(product_name), '[[:space:]()（）\-_/／]', '', 'g') AS 正規化名稱,
  count(*)                                                  AS 筆數,
  string_agg(DISTINCT product_name, ' ｜ ')                  AS 原始名稱寫法,
  string_agg(coalesce(brand,'') || ' ' || coalesce(model,''), ' ｜ ') AS 品牌型號
FROM products
WHERE product_name IS NOT NULL AND trim(product_name) <> ''
GROUP BY 1
HAVING count(*) > 1
   AND count(DISTINCT upper(trim(product_name))) > 1
ORDER BY 筆數 DESC;


-- ── 第 3 段：真・模糊比對（pg_trgm 相似度）──────────────────
-- 需要先啟用擴充功能（Supabase 支援，執行一次即可）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 注意：這是自我 JOIN，成本約 O(n²)。
--   產品 < 2000 筆  → 直接跑
--   產品 > 2000 筆  → 解開下方 a.brand = b.brand 那行，只比對同品牌，快很多
SELECT
  round(greatest(
    similarity(a.product_name, b.product_name),
    similarity(coalesce(a.model,''), coalesce(b.model,''))
  )::numeric, 2)                                    AS 相似度,
  a.brand AS 品牌A, a.product_name AS 品項A, a.model AS 型號A,
  b.brand AS 品牌B, b.product_name AS 品項B, b.model AS 型號B,
  a.id AS idA, b.id AS idB
FROM products a
JOIN products b
  ON a.id < b.id                       -- 每組只出現一次，且不跟自己比
  -- AND a.brand = b.brand              -- ← 資料量大時解開這行
WHERE a.product_name IS NOT NULL
  AND b.product_name IS NOT NULL
  AND (
        similarity(a.product_name, b.product_name) > 0.55
     OR (
          coalesce(a.model,'') <> '' AND coalesce(b.model,'') <> ''
          AND similarity(a.model, b.model) > 0.70
        )
      )
ORDER BY 相似度 DESC
LIMIT 200;


-- ── 調整門檻 ────────────────────────────────────────────
-- 0.55 / 0.70 是起手值：
--   撈太多雜訊 → 調高（0.7 / 0.85）
--   漏掉明顯的 → 調低（0.4 / 0.6）
--
-- 中文品名注意：pg_trgm 以字元三連組計算相似度，
-- 中文字數少時分數偏低，中文為主的品名建議門檻降到 0.3–0.4 再看結果。
