-- ============================================================
-- 修正：協力廠商 / 臨時工 在「從名冊選人」下拉選單顯示「未命名」
-- 原因：hr_roster view 只取 company_name / contact_name 組姓名，
--       完全沒有讀取「協力廠商/臨時工」建檔表單裡實際填寫的「名稱」(name) 欄位，
--       所以只填「名稱」、沒填「公司名稱」或「聯絡人」的資料就會 fallback 成「未命名」。
-- 修法：改成優先使用 c.name，其次才是 company_name / contact_name。
-- 執行位置：Supabase Dashboard → SQL Editor（直接貼上執行即可，不需要任何前置動作）
-- ============================================================

create or replace view public.hr_roster as
  select e.id,
         '員工'::text            as kind,
         e.full_name             as name,
         e.phone                 as phone,
         e.title                 as skill,
         0::numeric              as day_rate
  from public.hr_employees e
  where coalesce(e.status, '在職') = '在職'
  union all
  select c.id,
         coalesce(c.kind, '臨時工') as kind,
         coalesce(nullif(c.name, ''), nullif(c.company_name, ''), c.contact_name, '未命名') as name,
         c.phone                 as phone,
         c.skill                 as skill,
         coalesce(c.day_rate, 0) as day_rate
  from public.hr_contractors c
  where coalesce(c.is_active, true);

grant select on public.hr_roster to authenticated;

notify pgrst, 'reload schema';
