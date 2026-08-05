-- ============================================================
-- 主管自助綁定下屬（2026-08）
-- 執行位置：Supabase → SQL Editor → 新的空白查詢 → 貼上執行
-- 可重複執行（idempotent）
--
-- 設計原則：
--   1. 綁定規則寫在資料庫端的 SECURITY DEFINER function，前端無法繞過。
--   2. 主管只能「加入目前無上級的人」與「移除自己的直屬」，
--      要從別的主管手上調人，必須走人資戰情室（避免互相搶人）。
--   3. 每一次異動都寫進 org_change_log，可回溯誰在何時把誰換到哪。
-- ============================================================

-- ── 1. 組織異動紀錄 ─────────────────────────────────────────
create table if not exists public.org_change_log (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.user_profiles(id) on delete cascade,
  old_manager_id uuid references public.user_profiles(id) on delete set null,
  new_manager_id uuid references public.user_profiles(id) on delete set null,
  action         text not null check (action in ('bind', 'unbind', 'hr-edit')),
  changed_by     uuid references public.user_profiles(id) on delete set null,
  source         text not null default 'room',   -- room = 主管戰情室；hr = 人資戰情室
  changed_at     timestamptz not null default now()
);

create index if not exists idx_org_change_log_person on public.org_change_log(person_id, changed_at desc);
create index if not exists idx_org_change_log_by     on public.org_change_log(changed_by, changed_at desc);

alter table public.org_change_log enable row level security;

-- 已登入者可讀（組織異動屬於內部透明資訊，不含薪資等敏感欄位）
drop policy if exists org_change_log_read on public.org_change_log;
create policy org_change_log_read on public.org_change_log
  for select to authenticated using (true);

-- 不開放任何 insert/update/delete policy：
-- 只能透過下方 SECURITY DEFINER function 寫入，確保紀錄無法被竄改。

-- ── 2. 加入下屬 ─────────────────────────────────────────────
create or replace function public.bind_subordinate(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_old    uuid;
  v_active boolean;
  v_cur    uuid;
  v_hops   int := 0;
begin
  if v_me is null then
    raise exception '未登入';
  end if;
  if p_person = v_me then
    raise exception '不能把自己加入自己的團隊';
  end if;

  select manager_id, is_active into v_old, v_active
    from user_profiles where id = p_person;
  if not found then
    raise exception '查無此人員';
  end if;
  if v_active is false then
    raise exception '該人員已離職或停用，無法加入團隊';
  end if;
  if v_old is not null then
    raise exception '該人員已有上級主管，請洽人資戰情室調整';
  end if;

  -- 防迴圈：對方不得是我的上級鏈中任何一人（例如把董事長掛在自己底下）
  v_cur := v_me;
  while v_cur is not null and v_hops < 50 loop
    if v_cur = p_person then
      raise exception '不能把自己的上級主管加入自己底下';
    end if;
    select manager_id into v_cur from user_profiles where id = v_cur;
    v_hops := v_hops + 1;
  end loop;

  update user_profiles set manager_id = v_me where id = p_person;

  insert into org_change_log (person_id, old_manager_id, new_manager_id, action, changed_by, source)
  values (p_person, v_old, v_me, 'bind', v_me, 'room');
end;
$$;

-- ── 3. 移除下屬 ─────────────────────────────────────────────
create or replace function public.unbind_subordinate(p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_old uuid;
begin
  if v_me is null then
    raise exception '未登入';
  end if;

  select manager_id into v_old from user_profiles where id = p_person;
  if not found then
    raise exception '查無此人員';
  end if;
  if v_old is distinct from v_me then
    raise exception '只能移除自己的直屬人員';
  end if;

  update user_profiles set manager_id = null where id = p_person;

  insert into org_change_log (person_id, old_manager_id, new_manager_id, action, changed_by, source)
  values (p_person, v_old, null, 'unbind', v_me, 'room');
end;
$$;

-- ── 4. 人資／管理員改上級（不受「必須無上級」限制，但一樣留紀錄） ──
create or replace function public.hr_set_manager(p_person uuid, p_manager uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_role text;
  v_old  uuid;
  v_cur  uuid;
  v_hops int := 0;
begin
  if v_me is null then
    raise exception '未登入';
  end if;

  select role into v_role from user_profiles where id = v_me;
  if v_role is distinct from 'admin' and v_role is distinct from '管理員' then
    raise exception '只有管理員可以調整他人的上級主管';
  end if;
  if p_person = p_manager then
    raise exception '不能指定自己為上級';
  end if;

  select manager_id into v_old from user_profiles where id = p_person;
  if not found then
    raise exception '查無此人員';
  end if;

  -- 防迴圈：新上級的上級鏈中不得出現 p_person
  v_cur := p_manager;
  while v_cur is not null and v_hops < 50 loop
    if v_cur = p_person then
      raise exception '組織樹會形成循環，請先調整對方的上級';
    end if;
    select manager_id into v_cur from user_profiles where id = v_cur;
    v_hops := v_hops + 1;
  end loop;

  update user_profiles set manager_id = p_manager where id = p_person;

  insert into org_change_log (person_id, old_manager_id, new_manager_id, action, changed_by, source)
  values (p_person, v_old, p_manager, 'hr-edit', v_me, 'hr');
end;
$$;

-- ── 5. 授權 ─────────────────────────────────────────────────
revoke all on function public.bind_subordinate(uuid)      from public, anon;
revoke all on function public.unbind_subordinate(uuid)    from public, anon;
revoke all on function public.hr_set_manager(uuid, uuid)  from public, anon;
grant execute on function public.bind_subordinate(uuid)     to authenticated;
grant execute on function public.unbind_subordinate(uuid)   to authenticated;
grant execute on function public.hr_set_manager(uuid, uuid) to authenticated;
