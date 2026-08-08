-- 訊息依通訊處隔離：同處才能成為對話成員；經理只能聯絡同處主任／工程師。
-- 可重複執行。

alter table public.chat_threads
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

update public.chat_threads t
set branch_id = p.branch_id
from public.user_profiles p
where p.id = t.created_by and t.branch_id is null;

create index if not exists idx_chat_threads_branch_id on public.chat_threads(branch_id);
create index if not exists idx_chat_members_user_thread on public.chat_members(user_id, thread_id);
create index if not exists idx_chat_messages_thread_created on public.chat_messages(thread_id, created_at);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_chat_thread_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.created_by := (select auth.uid());
  select branch_id into new.branch_id
  from public.user_profiles
  where id = (select auth.uid()) and coalesce(is_active, true);
  return new;
end;
$$;

drop trigger if exists trg_chat_thread_scope on public.chat_threads;
create trigger trg_chat_thread_scope
before insert on public.chat_threads
for each row execute function private.set_chat_thread_scope();

create or replace function private.chat_thread_access(p_thread uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_threads t
    join public.chat_members m on m.thread_id = t.id
    join public.user_profiles me on me.id = (select auth.uid())
    where t.id = p_thread
      and m.user_id = (select auth.uid())
      and coalesce(me.is_active, true)
      and (
        (me.branch_id is not null and t.branch_id = me.branch_id)
        or (me.branch_id is null and t.created_by = (select auth.uid()))
      )
  );
$$;

create or replace function private.chat_can_add_member(p_thread uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.chat_threads t
    join public.user_profiles actor on actor.id = (select auth.uid())
    join public.user_profiles target on target.id = p_user
    where t.id = p_thread
      and t.created_by = (select auth.uid())
      and coalesce(actor.is_active, true)
      and coalesce(target.is_active, true)
      and (
        p_user = (select auth.uid())
        or (
          actor.branch_id is not null
          and target.branch_id = actor.branch_id
          and t.branch_id = actor.branch_id
          and (
            actor.title <> '經理'
            or target.title in ('主任', '業務主任', '工程師', '資深工程師', '總工程師', '技術主管')
          )
        )
      )
  );
$$;

-- 名單從資料庫端就縮到同一通訊處；經理再縮到主任／工程師。
drop function if exists public.account_roster();
create function public.account_roster()
returns table(id uuid, full_name text, role text, title text, branch_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select id, branch_id, title
    from public.user_profiles
    where id = (select auth.uid()) and coalesce(is_active, true)
  )
  select p.id, p.full_name, p.role, p.title, p.branch_id
  from public.user_profiles p, me
  where coalesce(p.is_active, true)
    and (
      p.id = me.id
      or (
        me.branch_id is not null
        and p.branch_id = me.branch_id
        and (
          me.title <> '經理'
          or p.title in ('主任', '業務主任', '工程師', '資深工程師', '總工程師', '技術主管')
        )
      )
    )
  order by p.full_name;
$$;
revoke all on function public.account_roster() from public, anon;
grant execute on function public.account_roster() to authenticated;

drop policy if exists chat_threads_select on public.chat_threads;
drop policy if exists chat_threads_insert on public.chat_threads;
drop policy if exists chat_threads_update on public.chat_threads;
drop policy if exists chat_threads_delete on public.chat_threads;
create policy chat_threads_select on public.chat_threads for select to authenticated
  using ((select private.chat_thread_access(id)) or created_by = (select auth.uid()));
create policy chat_threads_insert on public.chat_threads for insert to authenticated
  with check (created_by = (select auth.uid()) and branch_id is not distinct from (
    select branch_id from public.user_profiles where id = (select auth.uid())
  ));
create policy chat_threads_update on public.chat_threads for update to authenticated
  using ((select private.chat_thread_access(id)))
  with check ((select private.chat_thread_access(id)));
create policy chat_threads_delete on public.chat_threads for delete to authenticated
  using ((select private.chat_thread_access(id)) or created_by = (select auth.uid()));

drop policy if exists chat_members_select on public.chat_members;
drop policy if exists chat_members_insert on public.chat_members;
drop policy if exists chat_members_update on public.chat_members;
drop policy if exists chat_members_delete on public.chat_members;
create policy chat_members_select on public.chat_members for select to authenticated
  using ((select private.chat_thread_access(thread_id)) or user_id = (select auth.uid()));
create policy chat_members_insert on public.chat_members for insert to authenticated
  with check ((select private.chat_can_add_member(thread_id, user_id)));
create policy chat_members_update on public.chat_members for update to authenticated
  using (user_id = (select auth.uid()) and (select private.chat_thread_access(thread_id)))
  with check (user_id = (select auth.uid()) and (select private.chat_thread_access(thread_id)));
create policy chat_members_delete on public.chat_members for delete to authenticated
  using ((select private.chat_thread_access(thread_id)));

drop policy if exists chat_messages_select on public.chat_messages;
drop policy if exists chat_messages_insert on public.chat_messages;
drop policy if exists chat_messages_delete on public.chat_messages;
create policy chat_messages_select on public.chat_messages for select to authenticated
  using ((select private.chat_thread_access(thread_id)));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select private.chat_thread_access(thread_id)));
create policy chat_messages_delete on public.chat_messages for delete to authenticated
  using (sender_id = (select auth.uid()) and (select private.chat_thread_access(thread_id)));

notify pgrst, 'reload schema';
