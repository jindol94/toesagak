-- Run after 202611070001_initial_schema.sql.
alter table public.offices add column if not exists is_matchable boolean not null default false;

drop policy if exists "users update own office presence" on public.office_members;
create policy "users update own office presence" on public.office_members for update to authenticated
  using (user_id = auth.uid() and public.is_office_member(office_id))
  with check (user_id = auth.uid() and public.is_office_member(office_id));

create or replace function public.join_office_by_code(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_office_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select id into v_office_id from public.offices
    where invite_code = upper(trim(p_invite_code)) for update;
  if v_office_id is null then raise exception '초대 코드를 찾을 수 없습니다.'; end if;
  if (select count(*) from public.office_members where office_id = v_office_id) >= 6
     and not exists(select 1 from public.office_members where office_id=v_office_id and user_id=auth.uid()) then
    raise exception '오피스가 만석입니다.';
  end if;
  insert into public.office_members(office_id,user_id) values(v_office_id,auth.uid())
    on conflict(office_id,user_id) do nothing;
  return v_office_id;
end;
$$;
grant execute on function public.join_office_by_code(text) to authenticated;

create or replace function public.find_random_office()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_office_id uuid; v_member_count integer;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if exists(select 1 from public.office_members where user_id=auth.uid()) then
    raise exception '이미 오피스에 입장해 있습니다.';
  end if;
  loop
    select id into v_office_id from public.offices
      where is_matchable = true
      order by created_at asc
      limit 1
      for update skip locked;
    exit when v_office_id is null;
    select count(*) into v_member_count from public.office_members where office_id=v_office_id;
    if v_member_count < 6 then exit; end if;
    v_office_id := null;
  end loop;
  if v_office_id is null then
    insert into public.offices(name,owner_id,is_matchable)
      values('랜덤 매칭 오피스',auth.uid(),true) returning id into v_office_id;
  end if;
  insert into public.office_members(office_id,user_id) values(v_office_id,auth.uid());
  return v_office_id;
end;
$$;
grant execute on function public.find_random_office() to authenticated;
