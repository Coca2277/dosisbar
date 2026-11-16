-- Migration 9 : café, thé et boissons chaudes : unité des produits (cl, g, pièce), type de recette,
--               produits « ingrédient seul » (prix 0, ex. lait) cachés du mode Service

alter table public.produits add column if not exists unite text not null default 'cl';
alter table public.produits drop constraint if exists produits_unite_check;
alter table public.produits add constraint produits_unite_check check (unite in ('cl','g','pce'));

alter table public.cocktails add column if not exists categorie text not null default 'Cocktails';
alter table public.cocktails drop constraint if exists cocktails_categorie_check;
alter table public.cocktails add constraint cocktails_categorie_check check (categorie in ('Cocktails','Sans alcool','Boissons chaudes'));

create or replace function public.carte_service(p_etab uuid)
returns table(item_type char(1), item_id uuid, nom text, categorie text, prix_ttc numeric, disponible boolean)
language sql stable security definer set search_path = public as $$
  select 'p'::char(1), p.id, p.nom || coalesce(' · ' || nullif(p.format_nom, ''), ''), p.categorie, p.prix_vente_ttc, p.stock * p.contenance_cl >= p.dose_cl
    from produits p where p.etab_id = p_etab and est_membre(p_etab) and p.prix_vente_ttc > 0
  union all
  select 'f'::char(1), f.id, p.nom || ' · ' || f.nom, p.categorie, f.prix_ttc, p.stock * p.contenance_cl >= f.dose_cl
    from produit_formats f join produits p on p.id = f.produit_id where f.etab_id = p_etab and est_membre(p_etab) and f.prix_ttc > 0
  union all
  select 'k'::char(1), c.id, c.nom, c.categorie, c.prix_vente_ttc,
         not exists(select 1 from cocktail_ingredients i join produits p on p.id = i.produit_id
                    where i.cocktail_id = c.id and p.stock * p.contenance_cl < i.cl)
    from cocktails c where c.etab_id = p_etab and est_membre(p_etab)
  order by 4, 3;
$$;
