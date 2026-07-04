-- Shared app data blob for cross-browser / cross-device sync.
-- One row per store (id = 'createdDocs', 'attendance', …); the client mirrors its
-- localStorage blob into `doc`. Idempotent so it is safe to re-run.

create table if not exists public.app_state (
  id text primary key,
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

-- Open access via the anon key (matches the app's current no-real-auth model).
-- Tighten with Supabase Auth later if needed.
drop policy if exists "app_state read" on public.app_state;
create policy "app_state read" on public.app_state for select using (true);

drop policy if exists "app_state insert" on public.app_state;
create policy "app_state insert" on public.app_state for insert with check (true);

drop policy if exists "app_state update" on public.app_state;
create policy "app_state update" on public.app_state for update using (true) with check (true);

-- Live updates across open tabs/browsers.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;
