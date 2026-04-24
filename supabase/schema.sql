create table if not exists public.leaderboard_entries (
  player_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 2 and 24),
  auth_mode text not null default 'nickname' check (auth_mode in ('nickname', 'google')),
  best_score bigint not null default 0 check (best_score >= 0),
  breads_baked bigint not null default 0 check (breads_baked >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.game_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null check (char_length(player_name) between 2 and 24),
  auth_mode text not null default 'nickname' check (auth_mode in ('nickname', 'google')),
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.leaderboard_entries enable row level security;
alter table public.game_saves enable row level security;

create policy "Leaderboard is readable by everyone"
on public.leaderboard_entries
for select
to anon, authenticated
using (true);

create policy "Authenticated users can insert their own leaderboard row"
on public.leaderboard_entries
for insert
to authenticated
with check ((select auth.uid()) = player_id);

create policy "Authenticated users can update their own leaderboard row"
on public.leaderboard_entries
for update
to authenticated
using ((select auth.uid()) = player_id)
with check ((select auth.uid()) = player_id);

create policy "Authenticated users can read their own game save"
on public.game_saves
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can insert their own game save"
on public.game_saves
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Authenticated users can update their own game save"
on public.game_saves
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
