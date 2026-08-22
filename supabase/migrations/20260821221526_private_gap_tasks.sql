-- 空檔任務屬於個人資料：任何帳號都只能存取自己建立的空檔任務。
-- 一般行程沿用原本的組織可見性規則，避免影響主管的團隊行程看板。

alter table public.schedules enable row level security;

drop policy if exists "authenticated users can do all" on public.schedules;
drop policy if exists schedules_select on public.schedules;
drop policy if exists schedules_insert on public.schedules;
drop policy if exists schedules_update on public.schedules;
drop policy if exists schedules_delete on public.schedules;

create policy schedules_select on public.schedules
  for select
  to authenticated
  using (
    case
      when is_gap_task then created_by = (select auth.uid())
      else public.can_see_own(created_by)
    end
  );

create policy schedules_insert on public.schedules
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy schedules_update on public.schedules
  for update
  to authenticated
  using (not is_gap_task or created_by = (select auth.uid()))
  with check (not is_gap_task or created_by = (select auth.uid()));

create policy schedules_delete on public.schedules
  for delete
  to authenticated
  using (not is_gap_task or created_by = (select auth.uid()));
