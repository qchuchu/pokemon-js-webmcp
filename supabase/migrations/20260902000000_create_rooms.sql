-- One row per shared world. The room survives every agent disconnecting, so a
-- world is no longer lost the moment the last tab closes.
create table if not exists public.rooms (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

-- The anon key is shipped in the client bundle, so these policies are
-- deliberately open: anyone who can load the game can read and write any
-- room. That is the sharing model this game wants - agents join a room by
-- name and share one save. Do not store anything private in this table.
drop policy if exists "anyone can read a room" on public.rooms;
create policy "anyone can read a room"
  on public.rooms for select to anon using (true);

drop policy if exists "anyone can create a room" on public.rooms;
create policy "anyone can create a room"
  on public.rooms for insert to anon with check (true);

drop policy if exists "anyone can update a room" on public.rooms;
create policy "anyone can update a room"
  on public.rooms for update to anon using (true) with check (true);
