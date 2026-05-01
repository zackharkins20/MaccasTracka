-- Costi Cohen × McDonald's Site Finder — shared review schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL → New Query)

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

-- Enable Row Level Security with permissive team-access policy
-- (Tighten this later if you want auth — for now anyone with the anon key reads/writes.)
alter table site_reviews enable row level security;

drop policy if exists "team_read" on site_reviews;
create policy "team_read" on site_reviews for select using (true);

drop policy if exists "team_write" on site_reviews;
create policy "team_write" on site_reviews for insert with check (true);

drop policy if exists "team_update" on site_reviews;
create policy "team_update" on site_reviews for update using (true);

drop policy if exists "team_delete" on site_reviews;
create policy "team_delete" on site_reviews for delete using (true);

-- Enable realtime on the table so teammates see live changes
alter publication supabase_realtime add table site_reviews;
