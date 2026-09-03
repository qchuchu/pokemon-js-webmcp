-- One row per tab that joins a room, and one more the first time that tab is
-- driven by a tool. Enough to answer "how many people found this, and how many
-- of them brought an agent", and nothing else.
--
-- Deliberately no IP and no user agent: there is nothing here tied to a person,
-- so there is nothing to disclose, consent to, or leak. agent_id is the random
-- per-tab string the game already generates and forgets on reload.
create table if not exists public.visits (
  id bigint generated always as identity primary key,
  room text not null,
  agent_id text not null,
  -- 'connect' when a tab joins, 'agent' the first time it calls a WebMCP tool.
  kind text not null default 'connect',
  at timestamptz not null default now()
);

create index if not exists visits_at_idx on public.visits (at desc);

alter table public.visits enable row level security;

-- Insert only. The anon key ships in the client bundle, so a tab has to be able
-- to record itself - but nothing shipped to a browser can read the stats back,
-- and no one can rewrite history. Read it with the service role (the Supabase
-- dashboard) instead.
drop policy if exists "a tab can record itself" on public.visits;
create policy "a tab can record itself"
  on public.visits for insert to anon with check (true);
