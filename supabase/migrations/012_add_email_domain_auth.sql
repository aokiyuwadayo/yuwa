-- 大学メールドメイン判別ログイン（メール OTP）用のスキーマ。
--
-- organizations.allowed_email_domains に大学メールのドメイン（例: {fit.ac.jp}）を
-- 登録しておくと、そのドメインのメールアドレスで OTP ログインしたユーザーは
-- 招待コードなしで member として自動加入できる（requirements-v0.2 以降の
-- 他大学展開を見据えた入部経路）。既存の招待コード + Google ログイン経路
-- （migration 011 / signup.ts）はそのまま併存する。

alter table public.organizations
  add column allowed_email_domains text[] not null default '{}';

comment on column public.organizations.allowed_email_domains
  is '自動入部を許可する大学メールドメイン（小文字で登録。例: {fit.ac.jp, bene.fit.ac.jp}）。ログイン時のドメイン判別に使用。';

-- ドメイン一致検索（@> / any）用。組織数が少ないうちは実質不要だが将来の多組織向け。
create index organizations_allowed_email_domains_idx
  on public.organizations using gin (allowed_email_domains);

-- メールドメインから組織を判別して member を作成する。
-- migration 011 の redeem_invite_and_create_member と同じ設計方針:
--   - 冪等（既存 member なら 'exists'）
--   - anonymous_hash の生成まで 1 トランザクション
--   - service_role 専用（サーバー側の管理クライアントからのみ呼ぶ）
-- 同一ドメインが複数組織に登録されている場合は最も古い組織に加入する
-- （現状は 1 ドメイン = 1 組織運用を前提。docs/setup-checklist.md 参照）。
create or replace function public.create_member_by_email_domain(
  p_user_id uuid,
  p_email text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain text;
  v_org uuid;
  v_hash text;
begin
  -- 冪等: 既に member なら何もしない（再ログイン）。
  if exists (select 1 from public.members where id = p_user_id) then
    return 'exists';
  end if;

  v_domain := lower(split_part(p_email, '@', 2));
  if v_domain is null or v_domain = '' then
    return 'no_org';
  end if;

  select id into v_org
    from public.organizations
   where v_domain = any (allowed_email_domains)
   order by created_at
   limit 1;

  if v_org is null then
    return 'no_org';
  end if;

  v_hash := public.generate_member_anonymous_hash(p_user_id, v_org);
  if v_hash is null then
    raise exception 'failed to generate anonymous_hash for organization %', v_org;
  end if;

  insert into public.members (
    id,
    organization_id,
    display_name,
    role,
    invite_code,
    anonymous_hash,
    status
  )
  values (
    p_user_id,
    v_org,
    p_display_name,
    'member',
    null,
    v_hash,
    'active'
  );

  return 'created';
end;
$$;

comment on function public.create_member_by_email_domain(uuid, text, text)
is 'Creates a member by matching the email domain against organizations.allowed_email_domains. Idempotent; returns created / exists / no_org.';

revoke all on function public.create_member_by_email_domain(uuid, text, text) from public;
grant execute on function public.create_member_by_email_domain(uuid, text, text) to service_role;
