-- Costi Cohen × McDonald's Site Finder — shared review schema (v2: auth-aware)
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.

create table if not exists site_reviews (
  address       text primary key,
  status        text check (status in ('suitable','maybe','rejected')),
  score         integer check (score between 0 and 10),
  notes         text,
  reviewer      text,
  updated_at    timestamptz not null default now()
);

create index if not exists site_reviews_status_idx on site_reviews(status);
create index if not exists site_reviews_updated_idx on site_reviews(updated_at desc);

-- Auto-update timestamp on edit
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists site_reviews_touch on site_reviews;
create trigger site_reviews_touch before update on site_reviews
  for each row execute function touch_updated_at();

-- ===== Auth-aware RLS =====
-- v1 had permissive `using (true)` policies that let any anon-key holder
-- read/write. v2 requires an authenticated user (via Supabase Auth) for
-- writes, so only logged-in team members can mutate the table.

alter table site_reviews enable row level security;

-- Drop legacy permissive policies if they exist
drop policy if exists "team_read"   on site_reviews;
drop policy if exists "team_write"  on site_reviews;
drop policy if exists "team_update" on site_reviews;
drop policy if exists "team_delete" on site_reviews;

-- New auth-gated policies
drop policy if exists "auth_read"   on site_reviews;
drop policy if exists "auth_insert" on site_reviews;
drop policy if exists "auth_update" on site_reviews;
drop policy if exists "auth_delete" on site_reviews;

-- Anyone with a valid Supabase Auth session can read/write
create policy "auth_read"   on site_reviews for select using (auth.uid() is not null);
create policy "auth_insert" on site_reviews for insert with check (auth.uid() is not null);
create policy "auth_update" on site_reviews for update using (auth.uid() is not null);
create policy "auth_delete" on site_reviews for delete using (auth.uid() is not null);

-- Realtime publication (idempotent)
do $$
begin
  perform 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_reviews';
  if not found then
    alter publication supabase_realtime add table site_reviews;
  end if;
end $$;
