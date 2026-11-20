-- Migration 17 : lecture automatique des factures fournisseurs (journal + limite par jour)
create table if not exists public.factures_lues (
  id          bigserial primary key,
  etab_id     uuid not null references public.etablissements(id) on delete cascade,
  le          timestamptz not null default now(),
  fournisseur text,
  lignes      int,
  ok          boolean not null default true
);
create index if not exists factures_lues_etab_le on public.factures_lues(etab_id, le desc);
alter table public.factures_lues enable row level security;   -- aucune règle : réservé au serveur
grant select, insert on public.factures_lues to service_role;
grant usage, select on sequence public.factures_lues_id_seq to service_role;
