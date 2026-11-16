-- Migration 10 : abonnements Mollie (lecture seule pour le patron ; écritures uniquement par les fonctions serveur)

create table if not exists public.abonnements (
  etab_id             uuid primary key references public.etablissements(id) on delete cascade,
  formule             text check (formule in ('pilote','bar','pro')),
  resto               boolean not null default false,
  statut              text not null default 'aucun' check (statut in ('aucun','en_attente','actif','impaye','annule')),
  montant_ttc         numeric(10,2),
  paye_jusqu          date,
  mollie_client       text,
  mollie_abonnement   text,
  maj                 timestamptz not null default now()
);
alter table public.abonnements enable row level security;
create policy abonnements_lire on public.abonnements for select to authenticated using (public.est_patron(etab_id));
revoke all on public.abonnements from anon;
revoke insert, update, delete on public.abonnements from authenticated;
grant select on public.abonnements to authenticated;

create table if not exists public.paiements (
  id          text primary key,              -- identifiant Mollie (tr_…)
  etab_id     uuid not null references public.etablissements(id) on delete cascade,
  le          timestamptz not null default now(),
  montant_ttc numeric(10,2) not null,
  statut      text not null,
  libelle     text
);
create index if not exists paiements_etab_le on public.paiements(etab_id, le desc);
alter table public.paiements enable row level security;
create policy paiements_lire on public.paiements for select to authenticated using (public.est_patron(etab_id));
revoke all on public.paiements from anon;
revoke insert, update, delete on public.paiements from authenticated;
grant select on public.paiements to authenticated;
