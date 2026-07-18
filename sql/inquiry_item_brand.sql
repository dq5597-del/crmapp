-- 詢價品項加品牌欄（比照報價單）
alter table inquiry_items add column if not exists brand text;
