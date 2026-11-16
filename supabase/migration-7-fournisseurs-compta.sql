-- Migration 7 : fournisseurs, commandes / achats, relevés de stock (bilan du mois pour le comptable)

create table if not exists public.fournisseurs (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  data       jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists fournisseurs_etab on public.fournisseurs(etab_id);

alter table public.produits add column if not exists fournisseur_id uuid references public.fournisseurs(id) on delete set null;

create table if not exists public.commandes (
  id         uuid primary key default gen_random_uuid(),
  etab_id    uuid not null references public.etablissements(id) on delete cascade,
  le         timestamptz not null default now(),
  statut     text not null default 'brouillon' check (statut in ('brouillon','envoyee','recue')),
  recue_le   timestamptz,
  total_ht   numeric(12,2) not null default 0,
  data       jsonb not null,
  modifie_le timestamptz not null default now()
);
create index if not exists commandes_etab_le on public.commandes(etab_id, le desc);

create table if not exists public.stock_releves (
  id        bigint generated always as identity primary key,
  etab_id   uuid not null references public.etablissements(id) on delete cascade,
  le        timestamptz not null default now(),
  valeur_ht numeric(12,2) not null,
  origine   text not null default 'auto' check (origine in ('auto','inventaire'))
);
create index if not exists stock_releves_etab_le on public.stock_releves(etab_id, le desc);

alter table public.fournisseurs  enable row level security;
alter table public.commandes     enable row level security;
alter table public.stock_releves enable row level security;
create policy fournisseurs_patron on public.fournisseurs for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
create policy commandes_patron on public.commandes for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
create policy stock_releves_patron on public.stock_releves for all to authenticated
  using (public.est_patron(etab_id)) with check (public.est_patron(etab_id));
revoke all on public.fournisseurs, public.commandes, public.stock_releves from anon;
grant select, insert, update, delete on public.fournisseurs, public.commandes, public.stock_releves to authenticated;
