-- ============================================================
-- 打卡紀錄 → 出勤紀錄 自動同步（v2，2026-07-24）
-- ------------------------------------------------------------
-- v1 已建立觸發器，但同步不到資料，原因：
--   打卡帳號沒有「綁定員工卡」，只能退而用姓名比對；
--   而員工卡姓名「莊景翔（Adi）」≠ 登入姓名「莊景翔」，完全相等比對失敗。
-- v2 修正：比對時「去掉括號後」再比，例如
--   「莊景翔（Adi）」→「莊景翔」＝ 登入姓名「莊景翔」→ 對上。
--   （王懿友這類沒括號的姓名本來就會對上。）
-- 直接覆蓋 v1 即可，並會自動回補既有打卡。
-- 執行位置：Supabase Dashboard → SQL Editor（可重複執行）
-- ============================================================

create or replace function public.sync_punch_to_hr_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_id uuid;
  v_start  time;
  v_in_t   time;
  v_out_t  time;
  v_hours  numeric(5,2);
  v_status text;
begin
  -- 1) 找對應員工卡：先用「綁定登入帳號」，找不到再用「去括號後的姓名」比對
  select e.id into v_emp_id
  from public.hr_employees e
  where e.user_id = NEW.user_id
  limit 1;

  if v_emp_id is null then
    select e.id into v_emp_id
    from public.hr_employees e
    join public.user_profiles p on p.id = NEW.user_id
    where btrim(coalesce(p.full_name, '')) <> ''
      and btrim(regexp_replace(e.full_name,      '[（(].*$', '')) =
          btrim(regexp_replace(coalesce(p.full_name,''), '[（(].*$', ''))
    limit 1;
  end if;

  -- 對不到員工就跳過（此登入帳號沒有對應的員工卡）
  if v_emp_id is null then
    return NEW;
  end if;

  -- 2) 上班時間設定（預設 09:00）
  select coalesce(nullif(work_start_time, '')::time, time '09:00')
    into v_start
  from public.system_settings
  limit 1;
  if v_start is null then v_start := time '09:00'; end if;

  -- 3) 打卡時間轉台北當地 time（clock_in/out 是 timestamptz）
  v_in_t  := (NEW.clock_in  at time zone 'Asia/Taipei')::time;
  v_out_t := (NEW.clock_out at time zone 'Asia/Taipei')::time;

  -- 4) 工時：有上下班才計算（原始時數，不自動扣午休）
  if NEW.clock_in is not null and NEW.clock_out is not null then
    v_hours := round((extract(epoch from (NEW.clock_out - NEW.clock_in)) / 3600.0)::numeric, 2);
  else
    v_hours := null;
  end if;

  -- 5) 狀態：上班晚於設定時間 → 遲到
  v_status := case
    when v_in_t is not null and v_in_t > v_start then '遲到'
    else '正常'
  end;

  -- 6) 寫入 hr_attendance（同員工同一天一筆；已存在則更新）
  insert into public.hr_attendance
    (employee_id, work_date, clock_in, clock_out, work_hours, status)
  values
    (v_emp_id, NEW.work_date, v_in_t, v_out_t, v_hours, v_status)
  on conflict (employee_id, work_date) do update set
    clock_in   = excluded.clock_in,
    clock_out  = excluded.clock_out,
    work_hours = coalesce(excluded.work_hours, public.hr_attendance.work_hours),
    -- 只覆蓋自動類狀態(正常/遲到)，人資手動設定的請假/出差/曠職/休假/早退保留不動
    status     = case
                   when public.hr_attendance.status in ('正常','遲到')
                     then excluded.status
                   else public.hr_attendance.status
                 end,
    updated_at = now();

  return NEW;
end;
$$;

drop trigger if exists trg_sync_punch_to_hr on public.attendance_records;
create trigger trg_sync_punch_to_hr
  after insert or update on public.attendance_records
  for each row execute function public.sync_punch_to_hr_attendance();

-- ── 一次性回補：把既有打卡（含你今天 10:11 那筆）同步進出勤紀錄 ──
update public.attendance_records set work_date = work_date;

notify pgrst, 'reload schema';

-- 執行完，重新整理「人資 → 出勤紀錄」頁面即可看到。
