-- schedules: 部内の活動予定・部会・作業会などを管理するカレンダー。
-- events は「外部イベント同行者募集」用なので、部の予定は schedules として分ける。

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.members(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  schedule_date date not null,
  activity_time text not null default '' check (char_length(activity_time) <= 120),
  location text not null default '' check (char_length(location) <= 200),
  category text not null default 'regular' check (
    category in ('regular', 'focus', 'external', 'prep', 'presentation', 'review')
  ),
  memo text not null default '' check (char_length(memo) <= 4000),
  minutes text not null default '' check (char_length(minutes) <= 12000),
  photo_urls text not null default '' check (char_length(photo_urls) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schedules_org_date_idx
  on public.schedules (organization_id, schedule_date);
create index schedules_created_by_idx on public.schedules(created_by);

create or replace function public.set_schedule_creator_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator record;
begin
  select organization_id, status
  into creator
  from public.members
  where id = new.created_by;

  if creator is null or creator.status <> 'active' then
    raise exception 'schedule creator must be an active member';
  end if;

  if new.organization_id <> creator.organization_id then
    raise exception 'schedule organization must match creator organization';
  end if;

  return new;
end;
$$;

comment on function public.set_schedule_creator_metadata()
is 'Validates the schedule creator is an active member and organization_id matches their membership.';

revoke all on function public.set_schedule_creator_metadata() from public;

create trigger set_schedule_creator_metadata
before insert or update of organization_id, created_by
on public.schedules
for each row
execute function public.set_schedule_creator_metadata();

create or replace function public.touch_schedule_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_schedule_updated_at() from public;

create trigger touch_schedule_updated_at
before update
on public.schedules
for each row
execute function public.touch_schedule_updated_at();

alter table public.schedules enable row level security;

create policy "Members can read schedules in their organization"
on public.schedules
for select
to authenticated
using (organization_id = public.current_member_organization_id());

create policy "Members can create schedules in their organization"
on public.schedules
for insert
to authenticated
with check (
  created_by = auth.uid()
  and organization_id = public.current_member_organization_id()
);

create policy "Members can update schedules in their organization"
on public.schedules
for update
to authenticated
using (organization_id = public.current_member_organization_id())
with check (organization_id = public.current_member_organization_id());

create policy "Members can delete schedules in their organization"
on public.schedules
for delete
to authenticated
using (organization_id = public.current_member_organization_id());

grant select (
  id,
  organization_id,
  created_by,
  title,
  description,
  schedule_date,
  activity_time,
  location,
  category,
  memo,
  minutes,
  photo_urls,
  created_at,
  updated_at
) on public.schedules to authenticated;

grant insert (
  organization_id,
  created_by,
  title,
  description,
  schedule_date,
  activity_time,
  location,
  category,
  memo,
  minutes,
  photo_urls
) on public.schedules to authenticated;

grant update (
  title,
  description,
  schedule_date,
  activity_time,
  location,
  category,
  memo,
  minutes,
  photo_urls
) on public.schedules to authenticated;

grant delete on public.schedules to authenticated;
grant all on public.schedules to service_role;

do $$
begin
  alter publication supabase_realtime add table public.schedules;
exception
  when duplicate_object then null;
end $$;
