-- Migration 13 : connexion des caisses enregistreuses (SumUp pour commencer)
-- caisse_connexions : visible par le patron (sans la clé).
-- caisse_cles : la clé API de la caisse, lisible uniquement par le serveur (fonction « caisse »).

create table if not exists public.caisse_connexions (
  etab_id      uuid primary key references public.etablissements(id) on delete cascade,
  fournisseur  text not null check (fournisseur in ('sumup')),
  compte       text,                 -- identifiant du compte chez la caisse (ex. code marchand SumUp)
  nom_compte   text,                 -- nom affiché par la caisse
  derniere_synchro timestamptz,
  erreur       text,
  cree_le      timestamptz not null default now()
);
create table if not exists public.caisse_cles (
  etab_id uuid primary key references public.etablissements(id) on delete cascade,
  cle     text not null
);

alter table public.caisse_connexions enable row level security;
alter table public.caisse_cles enable row level security;
drop policy if exists caisse_lire on public.caisse_connexions;
create policy caisse_lire on public.caisse_connexions for select to authenticated using (public.est_patron(etab_id));
revoke all on public.caisse_connexions, public.caisse_cles from anon, authenticated;
grant select on public.caisse_connexions to authenticated;
grant select, insert, update, delete on public.caisse_connexions, public.caisse_cles to service_role;
