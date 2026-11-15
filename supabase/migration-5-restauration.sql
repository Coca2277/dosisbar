-- Migration 5 : option Restauration (ingrédients, préparations, plats) et options de l'établissement
alter table public.etablissements add column if not exists options jsonb not null default '{}'::jsonb;

create table if not exists public.cuisine (
  id uuid primary key default gen_random_uuid(),
  etab_id uuid not null references public.etablissements(id) on delete cascade,
  type text not null check (type in ('i','r','d')),
  data jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists cuisine_etab on public.cuisine(etab_id);
alter table public.cuisine enable row level security;
drop policy if exists cuisine_patron on public.cuisine;
create policy cuisine_patron on public.cuisine for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.cuisine from anon;
grant select, insert, update, delete on public.cuisine to authenticated;
