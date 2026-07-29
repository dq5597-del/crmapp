-- ============================================================
-- 打卡紀錄 → 出勤紀錄 自動同步（2026-07-24）
-- ------------------------------------------------------------
-- 【問題】側邊欄「上班/下班打卡」寫入的是 attendance_records，
--         但「人資 → 出勤紀錄」頁面讀的是 hr_attendance，
--         兩張表完全沒有連動，所以打卡永遠不會出現在出勤紀錄。
-- 【解法】在 attendance_records 加一個觸發器：每次打卡（上/下班）
--         自動同步一筆到 hr_attendance。SECURITY DEFINER 可繞過
--         hr_attendance 的 RLS，讓一般員工打卡也能寫入。
-- 【特性】自動判定「遲到」、自動算工時、保留人資手動設定的
--         請假/出差/曠職/休假/早退狀態不被覆蓋。
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
  -- 1) 找出對應的員工資料卡：優先用「綁定登入帳號」，找不到再用姓名比對
  select e.id into v_emp_id
  from public.hr_employees e
  where e.user_id = NEW.user_id
  limit 1;

  if v_emp_id is null then
    select e.id into v_emp_id
    from public.hr_employees e
    join public.user_profiles p on p.full_name = e.full_name
    where p.id = NEW.user_id
    limit 1;
  end if;

  -- 對不到員工就跳過（此登入帳號尚未建立或綁定員工資料卡）
  if v_emp_id is null then
    return NEW;
  end if;

  -- 2) 上班時間設定（預設 09:00）
  select coalesce(nullif(work_start_time, '')::time, time '09:00')
    into v_start
  from public.system_settings
  limit 1;
  if v_start is null then v_start := time '09:00'; end if;

  -- 3) 打卡時間轉台北當地時間（clock_in/out 是 timestamptz）
  v_in_t  := (NEW.clock_in  at time zone 'Asia/Taipei')::time;
  v_out_t := (NEW.clock_out at time zone 'Asia/Taipei')::time;

  -- 4) 工時：有上下班才計算（原始時數，不自動扣午休）
  if NEW.clock_in is not null and NEW.clock_out is not null then
    v_hours := round((extract(epoch from (NEW.clock_out - NEW.clock_in)) / 3600.0)::numeric, 2);
  else
    v_hours := null;
  end if;

  -- 5) 狀態：上班時間晚於設定 → 遲到
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

-- ── 一次性回補：把「今天以前的既有打卡」同步進出勤紀錄 ──
-- （no-op 更新即可觸發上面的 AFTER UPDATE，套用完全相同的邏輯）
update public.attendance_records set work_date = work_date;

notify pgrst, 'reload schema';

-- ============================================================
-- 【驗證用】以下兩段可選擇性執行，用來確認同步是否成功
-- ------------------------------------------------------------
-- (A) 檢查打卡帳號有沒有對應到員工資料卡（對不到的人不會同步）：
--     select ar.user_id, up.full_name as 登入姓名,
--            e.id as 員工卡ID, e.full_name as 員工卡姓名,
--            e.user_id as 已綁定帳號
--     from attendance_records ar
--     left join user_profiles up on up.id = ar.user_id
--     left join hr_employees e
--            on e.user_id = ar.user_id or e.full_name = up.full_name
--     group by ar.user_id, up.full_name, e.id, e.full_name, e.user_id;
--
-- (B) 看今天已同步的出勤紀錄：
--     select a.work_date, e.full_name, a.clock_in, a.clock_out,
--            a.work_hours, a.status
--     from hr_attendance a
--     join hr_employees e on e.id = a.employee_id
--     order by a.work_date desc, e.full_name;
-- ============================================================
