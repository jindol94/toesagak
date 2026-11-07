-- Toesagak initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '퇴사각 유저',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hourly_wage integer not null default 17290 check (hourly_wage >= 0),
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  break_minutes integer not null default 60 check (break_minutes between 0 and 720),
  overtime_rate numeric(4,2) not null default 1.50 check (overtime_rate between 1 and 5),
  night_rate numeric(4,2) not null default 0.50 check (night_rate between 0 and 5),
  holiday_rate numeric(4,2) not null default 1.50 check (holiday_rate between 0 and 5),
  fixed_monthly_allowance integer not null default 0 check (fixed_monthly_allowance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null default '새 오피스',
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8),'hex'),1,8)),
  created_at timestamptz not null default now()
);

create table if not exists public.office_members (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default '근무' check (state in ('출근','근무','점심','휴식','야근','퇴근','휴일')),
  status_message varchar(40) not null default '',
  joined_at timestamptz not null default now(),
  unique (office_id, user_id)
);
create index if not exists office_members_office_id_idx on public.office_members(office_id);

create table if not exists public.office_messages (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body varchar(500) not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists office_messages_office_created_idx on public.office_messages(office_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.work_settings (user_id) values (new.id);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_toesagak on auth.users;
create trigger on_auth_user_created_toesagak after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_office_member(p_office_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.office_members where office_id=p_office_id and user_id=auth.uid());
$$;

create or replace function public.create_office(p_name text default '새 오피스')
returns table(office_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  insert into public.offices(name,owner_id) values(coalesce(nullif(trim(p_name),''),'새 오피스'),auth.uid())
  returning id, offices.invite_code into v_id,v_code;
  insert into public.office_members(office_id,user_id) values(v_id,auth.uid());
  return query select v_id,v_code;
end;
$$;

create or replace function public.join_office_by_code(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_office_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  select id into v_office_id from public.offices where invite_code = upper(trim(p_invite_code));
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
grant execute on function public.create_office(text) to authenticated;
grant execute on function public.join_office_by_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.work_settings enable row level security;
alter table public.offices enable row level security;
alter table public.office_members enable row level security;
alter table public.office_messages enable row level security;

create policy "profiles visible to office peers" on public.profiles for select to authenticated
  using (id=auth.uid() or exists(
    select 1 from public.office_members mine
    join public.office_members peer on peer.office_id=mine.office_id
    where mine.user_id=auth.uid() and peer.user_id=profiles.id
  ));
create policy "users update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "users read own work settings" on public.work_settings for select to authenticated using (user_id=auth.uid());
create policy "users insert own work settings" on public.work_settings for insert to authenticated with check (user_id=auth.uid());
create policy "users update own work settings" on public.work_settings for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "office members can view their offices" on public.offices for select to authenticated using (public.is_office_member(id) or owner_id=auth.uid());
create policy "users create own offices" on public.offices for insert to authenticated with check (owner_id=auth.uid());
create policy "owners update their offices" on public.offices for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "members view office roster" on public.office_members for select to authenticated using (public.is_office_member(office_id));
create policy "users update own office presence" on public.office_members for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "office members read messages" on public.office_messages for select to authenticated using (public.is_office_member(office_id));
create policy "office members send messages" on public.office_messages for insert to authenticated with check (user_id=auth.uid() and public.is_office_member(office_id));

do $$ begin
  alter publication supabase_realtime add table public.office_members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.office_messages;
exception when duplicate_object then null; end $$;
