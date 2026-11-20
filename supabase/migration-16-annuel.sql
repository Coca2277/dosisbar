-- Migration 16 : paiement à l'année (2 mois offerts)
alter table public.abonnements add column if not exists annuel boolean not null default false;
