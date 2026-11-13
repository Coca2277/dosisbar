# Dosis Bar

L'app qui montre aux patrons de bar et de restaurant ce que chaque verre leur rapporte vraiment :
marge au verre (TVA 10 % / 20 %), Dosis Score, mode Service en direct, cocktails, surdosage,
simulateur de hausse de prix, stock et inventaire avec écarts.

## Fonctionnement

- Application web installable (PWA), sans étape de compilation : `index.html`, `css/`, `js/`.
- Données en ligne avec [Supabase](https://supabase.com) (base PostgreSQL + comptes).
- Sans configuration Supabase, l'app tourne en **mode essai** (données dans le navigateur).

## Mise en route

1. Créer un projet Supabase, ouvrir **SQL Editor** et exécuter `supabase/schema.sql`.
2. Dans **Authentication > URL Configuration**, mettre `https://dosisbar.com` comme Site URL.
3. Copier l'URL du projet et la clé publique `anon` dans `js/config.js`.

## Sécurité

- Le **patron** voit et modifie tout (prix d'achat, marges, inventaires).
- Le **barman** ne lit jamais les tables : il passe par des fonctions qui lui donnent seulement la carte
  (noms, prix de vente) et enregistrent ses ventes. Il ne voit ni prix d'achat ni marges.
- La clé `anon` de `js/config.js` est publique par conception ; l'accès est contrôlé par les règles RLS.

© Dosis Bar. Bibliothèque `supabase-js` sous licence MIT (voir `js/vendor/supabase.LICENSE.txt`).
