-- 個人清單對一般帳號隔離，但系統管理員保留全域檢視與管理權限。

drop policy if exists todos_select on public.todos;
drop policy if exists todos_insert on public.todos;
drop policy if exists todos_update on public.todos;
drop policy if exists todos_delete on public.todos;

create policy todos_select on public.todos for select to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));
create policy todos_insert on public.todos for insert to authenticated
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy todos_update on public.todos for update to authenticated
  using (public.is_admin() or created_by = (select auth.uid()))
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy todos_delete on public.todos for delete to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));

drop policy if exists goals_select on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;

create policy goals_select on public.goals for select to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));
create policy goals_insert on public.goals for insert to authenticated
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated
  using (public.is_admin() or created_by = (select auth.uid()))
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy goals_delete on public.goals for delete to authenticated
  using (public.is_admin() or created_by = (select auth.uid()));

drop policy if exists schedules_select on public.schedules;
drop policy if exists schedules_insert on public.schedules;
drop policy if exists schedules_update on public.schedules;
drop policy if exists schedules_delete on public.schedules;

create policy schedules_select on public.schedules for select to authenticated
  using (
    case
      when is_gap_task then public.is_admin() or created_by = (select auth.uid())
      else public.can_see_own(created_by)
    end
  );
create policy schedules_insert on public.schedules for insert to authenticated
  with check (public.is_admin() or created_by = (select auth.uid()));
create policy schedules_update on public.schedules for update to authenticated
  using (not is_gap_task or public.is_admin() or created_by = (select auth.uid()))
  with check (not is_gap_task or public.is_admin() or created_by = (select auth.uid()));
create policy schedules_delete on public.schedules for delete to authenticated
  using (not is_gap_task or public.is_admin() or created_by = (select auth.uid()));
