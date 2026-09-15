-- ============================================================
--  Bianchi Dessert — schéma Supabase
--  À coller tel quel dans : Supabase > SQL Editor > New query > Run
--  (gratuit, plan "Free"). Crée les tables, la sécurité, les fonctions
--  de commande, le stockage des photos et le catalogue de départ.
-- ============================================================

-- ---------- TABLES ----------
create table if not exists public.categories (
  id          serial primary key,
  nom         text not null,
  emoji       text default '',
  sous_titre  text default '',
  ordre       int  default 0,
  actif       boolean default true,
  traductions jsonb default '{}'::jsonb
);

create table if not exists public.produits (
  id            uuid primary key default gen_random_uuid(),
  categorie_id  int references public.categories(id) on delete set null,
  nom           text not null,
  description   text default '',
  prix          numeric(10,2) not null check (prix >= 0),
  ancien_prix   numeric(10,2),
  promo_label   text default '',
  allergenes    text default '',   -- affiché dans la fiche produit seulement si rempli
  stock         int,
  suivre_stock  boolean default true,
  image_url     text default '',
  actif         boolean default true,
  vedette       boolean default false,   -- pièce mise en avant en haut du site (choix du pâtissier)
  supplement    boolean default false,   -- option rattachée aux produits de sa catégorie (même format), jamais vendue seule
  ordre         int default 0,
  traductions   jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

create table if not exists public.bannieres (
  id      uuid primary key default gen_random_uuid(),
  titre   text not null,
  texte   text default '',
  icone   text default '✨',
  style   text default 'or',
  actif   boolean default true,
  ordre   int default 0,
  traductions jsonb default '{}'::jsonb
);

create table if not exists public.parametres (
  id                 int primary key default 1 check (id = 1),
  nom                text default 'Bianchi Dessert',
  slogan             text default 'Per l''amor del gusto',
  whatsapp           text default '',
  adresse            text default '',
  lien_maps          text default '',
  horaires           text default '',
  delai_texte        text default '',
  commandes_ouvertes boolean default true,
  message_ferme      text default '',
  livraison_active   boolean default true,
  frais_livraison    numeric(10,2) default 0,
  commande_min       numeric(10,2) default 0,
  livraison_offerte_des numeric(10,2) default 0,   -- 0 = jamais offerte
  annonce            text default '',
  traductions        jsonb default '{}'::jsonb
);

create table if not exists public.commandes (
  id             uuid primary key default gen_random_uuid(),
  numero         serial,
  code           text,                       -- AAMJN : 269151 = 1re commande du 15/9/2026
  client_nom     text not null,
  client_tel     text not null,
  mode           text not null default 'retrait',
  adresse        text default '',
  gps_lat        double precision,
  gps_lng        double precision,
  date_souhaitee date,
  creneau        text default 'asap',
  remarque       text default '',
  articles       jsonb not null,
  total          numeric(10,2) not null,
  statut         text not null default 'en_attente',
  langue         text default 'fr',
  whatsapp_envoye boolean default false,
  created_at     timestamptz default now()
);

-- ---------- SÉCURITÉ (RLS) ----------
-- Tout le monde peut LIRE le catalogue ; seul un utilisateur connecté
-- (le pâtissier) peut le MODIFIER. Les commandes ne se créent que par la
-- fonction passer_commande, et ne se lisent que connecté.
alter table public.categories enable row level security;
alter table public.produits   enable row level security;
alter table public.bannieres  enable row level security;
alter table public.parametres enable row level security;
alter table public.commandes  enable row level security;

drop policy if exists "lecture publique" on public.categories;
drop policy if exists "lecture publique" on public.produits;
drop policy if exists "lecture publique" on public.bannieres;
drop policy if exists "lecture publique" on public.parametres;
create policy "lecture publique" on public.categories for select using (true);
create policy "lecture publique" on public.produits   for select using (true);
create policy "lecture publique" on public.bannieres  for select using (true);
create policy "lecture publique" on public.parametres for select using (true);

drop policy if exists "admin" on public.categories;
drop policy if exists "admin" on public.produits;
drop policy if exists "admin" on public.bannieres;
drop policy if exists "admin" on public.parametres;
drop policy if exists "admin" on public.commandes;
create policy "admin" on public.categories for all to authenticated using (true) with check (true);
create policy "admin" on public.produits   for all to authenticated using (true) with check (true);
create policy "admin" on public.bannieres  for all to authenticated using (true) with check (true);
create policy "admin" on public.parametres for all to authenticated using (true) with check (true);
create policy "admin" on public.commandes  for all to authenticated using (true) with check (true);

-- ---------- FONCTION : passer une commande ----------
-- Vérifie le stock de chaque article, le décrémente, calcule le total
-- à partir des prix en base (jamais ceux envoyés par le navigateur),
-- puis enregistre la commande. Tout est atomique : si un article manque,
-- rien n'est décrémenté.
create or replace function public.passer_commande(p_client jsonb, p_articles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_param    public.parametres%rowtype;
  v_art      jsonb;
  v_prod     public.produits%rowtype;
  v_qte      int;
  v_total    numeric(10,2) := 0;
  v_lignes   jsonb := '[]'::jsonb;
  v_id       uuid;
  v_numero   int;
  v_code     text;
  v_jour     date := (now() at time zone 'Africa/Casablanca')::date;
  v_rang     int;
  v_mode     text := coalesce(p_client->>'mode', 'retrait');
begin
  select * into v_param from public.parametres where id = 1;
  if v_param.commandes_ouvertes is false then
    raise exception 'FERME|Les commandes sont fermées pour le moment';
  end if;
  if jsonb_array_length(p_articles) = 0 then
    raise exception 'INVALIDE|Panier vide';
  end if;

  for v_art in select * from jsonb_array_elements(p_articles) loop
    v_qte := greatest(1, coalesce((v_art->>'qte')::int, 1));
    select * into v_prod from public.produits
      where id = (v_art->>'produit_id')::uuid for update;
    if not found or v_prod.actif is false then
      raise exception 'INDISPONIBLE|%', coalesce(v_prod.nom, 'Produit');
    end if;
    if v_prod.suivre_stock and coalesce(v_prod.stock, 0) < v_qte then
      raise exception 'STOCK|%|%', v_prod.nom, coalesce(v_prod.stock, 0);
    end if;
    if v_prod.suivre_stock then
      update public.produits set stock = stock - v_qte where id = v_prod.id;
    end if;
    v_total := v_total + v_prod.prix * v_qte;
    v_lignes := v_lignes || jsonb_build_object('produit_id', v_prod.id, 'nom', v_prod.nom, 'prix', v_prod.prix, 'qte', v_qte);
  end loop;

  -- Minimum de commande : comparé au sous-total des articles (même règle que le site)
  if coalesce(v_param.commande_min, 0) > 0 and v_total < v_param.commande_min then
    raise exception 'MINIMUM|%', v_param.commande_min;
  end if;
  -- Frais de livraison, offerts au-delà du seuil
  if v_mode = 'livraison' and v_param.livraison_active
     and not (coalesce(v_param.livraison_offerte_des, 0) > 0 and v_total >= v_param.livraison_offerte_des) then
    v_total := v_total + coalesce(v_param.frais_livraison, 0);
  end if;

  select count(*) + 1 into v_rang from public.commandes
    where (created_at at time zone 'Africa/Casablanca')::date = v_jour;
  v_code := to_char(v_jour, 'YY') || extract(month from v_jour)::int || extract(day from v_jour)::int || v_rang;

  insert into public.commandes (code, client_nom, client_tel, mode, adresse, gps_lat, gps_lng, date_souhaitee, creneau, remarque, articles, total, langue)
  values (
    v_code,
    left(coalesce(p_client->>'client_nom', ''), 120),
    left(coalesce(p_client->>'client_tel', ''), 30),
    v_mode,
    left(coalesce(p_client->>'adresse', ''), 500),
    nullif(p_client->>'gps_lat', '')::double precision,
    nullif(p_client->>'gps_lng', '')::double precision,
    nullif(p_client->>'date_souhaitee', '')::date,
    left(coalesce(p_client->>'creneau', 'asap'), 20),
    left(coalesce(p_client->>'remarque', ''), 500),
    v_lignes, v_total,
    left(coalesce(p_client->>'langue', 'fr'), 5)
  ) returning id, numero into v_id, v_numero;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'code', v_code, 'total', v_total, 'articles', v_lignes);
end;
$$;
grant execute on function public.passer_commande(jsonb, jsonb) to anon, authenticated;

-- ---------- FONCTION : le client a ouvert WhatsApp avec le récapitulatif ----------
-- Ne fait que poser un drapeau ; permet au pâtissier de repérer les commandes réservées jamais envoyées.
create or replace function public.marquer_envoyee(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.commandes set whatsapp_envoye = true where id = p_id;
$$;
grant execute on function public.marquer_envoyee(uuid) to anon, authenticated;

-- ---------- FONCTION : changer le statut (admin) ----------
-- Annuler une commande remet les articles en stock ; la « dé-annuler »
-- les retire à nouveau.
create or replace function public.changer_statut(p_id uuid, p_statut text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmd  public.commandes%rowtype;
  v_art  jsonb;
begin
  if auth.uid() is null then
    raise exception 'Non autorisé';
  end if;
  if p_statut not in ('en_attente', 'confirmee', 'prete', 'livree', 'annulee') then
    raise exception 'Statut inconnu';
  end if;
  select * into v_cmd from public.commandes where id = p_id for update;
  if not found then raise exception 'Commande introuvable'; end if;

  if v_cmd.statut <> 'annulee' and p_statut = 'annulee' then
    for v_art in select * from jsonb_array_elements(v_cmd.articles) loop
      update public.produits set stock = coalesce(stock, 0) + (v_art->>'qte')::int
        where id = (v_art->>'produit_id')::uuid and suivre_stock;
    end loop;
  elsif v_cmd.statut = 'annulee' and p_statut <> 'annulee' then
    for v_art in select * from jsonb_array_elements(v_cmd.articles) loop
      update public.produits set stock = coalesce(stock, 0) - (v_art->>'qte')::int
        where id = (v_art->>'produit_id')::uuid and suivre_stock;
    end loop;
  end if;
  update public.commandes set statut = p_statut where id = p_id;
end;
$$;
grant execute on function public.changer_statut(uuid, text) to authenticated;

-- ---------- TEMPS RÉEL ----------
-- Les clients voient le stock changer sans recharger la page.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.produits;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.bannieres;
alter publication supabase_realtime add table public.parametres;

-- ---------- PHOTOS (Storage) ----------
insert into storage.buckets (id, name, public) values ('images', 'images', true)
on conflict (id) do nothing;
drop policy if exists "photos publiques" on storage.objects;
drop policy if exists "photos admin" on storage.objects;
create policy "photos publiques" on storage.objects for select using (bucket_id = 'images');
create policy "photos admin" on storage.objects for all to authenticated
  using (bucket_id = 'images') with check (bucket_id = 'images');

-- ---------- CATALOGUE DE DÉPART ----------
insert into public.parametres (id, nom, slogan, whatsapp, adresse, horaires, delai_texte, commandes_ouvertes, message_ferme, livraison_active, frais_livraison, commande_min, livraison_offerte_des, annonce)
values (1, 'Bianchi Dessert', 'Per l''amor del gusto', '212708302308', 'Diar Tamouda – Wiqayah, Tétouan', 'Mardi – Dimanche · 9h – 20h', 'Retrait ou livraison le jour même selon le stock', true, 'Les commandes reprennent demain matin. À très vite !', true, 10, 0, 60, '')
on conflict (id) do nothing;

insert into public.categories (id, nom, emoji, sous_titre, ordre) values
  (1, 'Charlottes', '🍎', 'La pièce signature, à partager', 1),
  (2, 'Beignets', '🍩', 'Moelleux, garnis à la commande', 4),
  (3, 'Cookies & Biscuits', '🍪', 'Croustillants dehors, fondants dedans', 3),
  (4, 'Tiramisù & Mousses', '🍰', 'En verrine individuelle', 2),
  (5, 'Cheesecakes', '🧁', 'Base biscuitée, crème onctueuse', 5),
  (6, 'Glaces & Cookies glacés', '🍨', 'Préparés à la commande, toujours disponibles', 6),
  (7, 'Boissons maison', '🥤', 'Pressées et préparées à la commande', 7)
on conflict (id) do nothing;
select setval('public.categories_id_seq', (select max(id) from public.categories));

insert into public.produits (categorie_id, nom, description, prix, promo_label, stock, suivre_stock, ordre) values
  (1, 'Charlotte aux pommes cannelle', 'Biscuits cuillère, compotée de pommes à la cannelle et crème légère.', 30, 'Best-seller', 4, true, 1),
  (2, 'Mini Beignet Pomme', 'Beignet moelleux garni de compotée de pommes.', 8, '', 3, true, 1),
  (2, 'Mini Beignet Nutella', 'Beignet moelleux, cœur Nutella généreux.', 8, '', 8, true, 2),
  (2, 'Mini Beignet Spéculoos', 'Beignet moelleux, crème de spéculoos.', 8, '', 0, true, 3),
  (2, 'Mini Beignet Bueno', 'Beignet moelleux, crème noisette façon Bueno.', 8, '', 2, true, 4),
  (2, 'Mini Beignet Pistache', 'Beignet moelleux, crème de pistache.', 13, '', 0, true, 5),
  (2, 'Mini Beignet Framboise', 'Beignet moelleux, confit de framboise.', 13, '', 0, true, 6),
  (2, 'Gros Beignet Nutella', 'Le grand format, généreusement garni de Nutella.', 15, '', 2, true, 7),
  (3, 'Palet Breton', 'Sablé pur beurre, épais et friable.', 15, '', 0, true, 1),
  (3, 'Cookie 3 Chocolats', 'Chocolat noir, lait et blanc dans une pâte fondante.', 25, '', 4, true, 2),
  (3, 'Cookie Praliné Noisette', 'Cœur coulant praliné noisette maison.', 27, '', 0, true, 3),
  (3, 'Cookie Kinder', 'Éclats de Kinder et cœur fondant.', 27, '', 0, true, 4),
  (3, 'Cookie Praliné Pistache', 'Cœur coulant praliné pistache.', 29, '', 0, true, 5),
  (4, 'Tiramisu Nutella', 'Mascarpone, biscuits imbibés et Nutella.', 20, '', 3, true, 1),
  (4, 'Tiramisu Café', 'Le classique : mascarpone, café et cacao.', 20, '', 2, true, 2),
  (4, 'Tiramisu Mangue / Citron', 'Version fruitée et acidulée.', 25, '', 0, true, 3),
  (4, 'Tiramisu Pistache', 'Mascarpone et crème de pistache.', 29, '', 0, true, 4),
  (4, 'Mousse au chocolat', 'Chocolat noir intense, texture aérienne.', 25, '', 5, true, 5),
  (5, 'Cheesecake Lotus', 'Base spéculoos et nappage Lotus.', 20, '', 0, true, 1),
  (5, 'Cheesecake Nutella', 'Crème onctueuse et nappage Nutella.', 20, '', 0, true, 2),
  (5, 'Cheesecake Oreo', 'Base et éclats d''Oreo.', 20, '', 0, true, 3),
  (5, 'Cheesecake Bueno', 'Crème noisette et éclats de Bueno.', 20, '', 0, true, 4),
  (6, 'Glace Vanille Bourbon — Petit', 'Glace artisanale à la vanille Bourbon, petit format.', 12, '', null, false, 1),
  (6, 'Glace Vanille Bourbon — Grand', 'Glace artisanale à la vanille Bourbon, grand format.', 20, '', null, false, 2),
  (6, 'Caramel beurre salé maison — Petit', 'Caramel au beurre salé fait maison, nappé sur votre glace ou votre cookie glacé.', 2, '', null, false, 3),
  (6, 'Caramel beurre salé maison — Grand', 'Caramel au beurre salé fait maison, nappé généreusement sur le grand format.', 4, '', null, false, 4),
  (6, 'Cookie glacé vanille caramel — Petit', 'Cookie maison garni de glace vanille et caramel.', 15, '', null, false, 5),
  (6, 'Cookie glacé vanille caramel — Grand', 'Grand cookie garni de glace vanille et caramel.', 28, '', null, false, 6),
  (7, 'Jus d''orange pressé maison', 'Oranges pressées à la demande, sans sucre ajouté.', 15, '', null, false, 1),
  (7, 'Mojito menthe glacé', 'Menthe fraîche, citron pressé, glace pilée. Sans alcool.', 20, '', null, false, 2);

insert into public.bannieres (titre, texte, icone, style, ordre) values
  ('Offre cookies : 3 achetés, le 4ᵉ offert', 'Ajoutée automatiquement à votre commande dès 3 cookies.', '4ᵉ', 'or', 1);

-- ---------- MISE À JOUR d'une base déjà créée (sans effet si les colonnes existent) ----------
alter table public.categories add column if not exists traductions jsonb default '{}'::jsonb;
alter table public.produits   add column if not exists traductions jsonb default '{}'::jsonb;
alter table public.produits   add column if not exists vedette boolean default false;
alter table public.produits   add column if not exists allergenes text default '';
alter table public.produits   add column if not exists supplement boolean default false;
alter table public.bannieres  add column if not exists traductions jsonb default '{}'::jsonb;
alter table public.parametres add column if not exists traductions jsonb default '{}'::jsonb;
alter table public.commandes  add column if not exists langue text default 'fr';
alter table public.commandes  add column if not exists gps_lat double precision;
alter table public.commandes  add column if not exists gps_lng double precision;
alter table public.commandes  add column if not exists creneau text default 'asap';
alter table public.commandes  add column if not exists code text;
alter table public.commandes  add column if not exists whatsapp_envoye boolean default false;
alter table public.parametres add column if not exists livraison_offerte_des numeric(10,2) default 0;

update public.produits set vedette = true where nom = 'Charlotte aux pommes cannelle';


-- ---------- PHOTOS extraites des reels Instagram (à remplacer par les photos du pâtissier) ----------
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/cookie-praline-pistache.jpg' where nom = 'Cookie Praliné Pistache';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/cookie-3-chocolats.jpg' where nom = 'Cookie 3 Chocolats';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/cookie-praline-noisette.jpg' where nom = 'Cookie Praliné Noisette';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/tiramisu-pistache.jpg' where nom = 'Tiramisu Pistache';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/tiramisu-cafe.jpg' where nom = 'Tiramisu Café';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/mini-beignet-pomme.jpg' where nom = 'Mini Beignet Pomme';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/mini-beignet-nutella.jpg' where nom = 'Mini Beignet Nutella';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/gros-beignet-nutella.jpg' where nom = 'Gros Beignet Nutella';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/palet-breton.jpg' where nom = 'Palet Breton';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/glace-vanille-petit.jpg' where nom = 'Glace Vanille Bourbon — Petit';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/glace-vanille-grand.jpg' where nom = 'Glace Vanille Bourbon — Grand';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/supplement-caramel.jpg' where nom = 'Caramel beurre salé maison — Petit';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/supplement-caramel.jpg' where nom = 'Caramel beurre salé maison — Grand';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/cookie-glace-petit.jpg' where nom = 'Cookie glacé vanille caramel — Petit';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/cookie-glace-grand.jpg' where nom = 'Cookie glacé vanille caramel — Grand';
update public.produits set stock = 6, promo_label = 'Nouveau' where nom = 'Tiramisu Pistache';
update public.produits set vedette = true where nom = 'Charlotte aux pommes cannelle';

-- ---------- TRADUCTIONS du catalogue de départ (ar · en · de · nl) ----------
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/charlotte-pommes.jpg' where nom = 'Charlotte aux pommes cannelle';
update public.produits set supplement = true where nom like 'Caramel beurre salé maison%';

-- ---------- TRADUCTIONS du catalogue de départ (ar · en · de · nl) ----------
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/jus-orange.jpg' where nom = 'Jus d''orange pressé maison';
update public.produits set image_url = 'https://maurdor.github.io/bianchi-dessert/assets/produits/mojito-menthe.jpg' where nom = 'Mojito menthe glacé';

-- ---------- TRADUCTIONS du catalogue de départ (ar · en · de · nl) ----------
update public.categories set traductions = '{"ar":{"nom":"شارلوت","sous_titre":"القطعة المميزة، للمشاركة"},"en":{"nom":"Charlottes","sous_titre":"The signature piece, to share"},"de":{"nom":"Charlottes","sous_titre":"Das Signature-Stück, zum Teilen"},"nl":{"nom":"Charlottes","sous_titre":"Het paradepaardje, om te delen"}}'::jsonb where nom = 'Charlottes';
update public.categories set traductions = '{"ar":{"nom":"بينيي (دونات)","sous_titre":"طرية، تُحشى عند الطلب"},"en":{"nom":"Doughnuts","sous_titre":"Soft, filled to order"},"de":{"nom":"Krapfen","sous_titre":"Locker, auf Bestellung gefüllt"},"nl":{"nom":"Beignets","sous_titre":"Luchtig, gevuld op bestelling"}}'::jsonb where nom = 'Beignets';
update public.categories set traductions = '{"ar":{"nom":"كوكيز وبسكويت","sous_titre":"مقرمشة من الخارج، طرية من الداخل"},"en":{"nom":"Cookies & Biscuits","sous_titre":"Crisp outside, soft inside"},"de":{"nom":"Cookies & Kekse","sous_titre":"Außen knusprig, innen weich"},"nl":{"nom":"Koekjes & Biscuits","sous_titre":"Krokant vanbuiten, zacht vanbinnen"}}'::jsonb where nom = 'Cookies & Biscuits';
update public.categories set traductions = '{"ar":{"nom":"تيراميسو وموس","sous_titre":"في كأس فردي"},"en":{"nom":"Tiramisù & Mousses","sous_titre":"In individual glasses"},"de":{"nom":"Tiramisù & Mousses","sous_titre":"Im Einzelglas"},"nl":{"nom":"Tiramisù & Mousses","sous_titre":"In individuele glaasjes"}}'::jsonb where nom = 'Tiramisù & Mousses';
update public.categories set traductions = '{"ar":{"nom":"تشيزكيك","sous_titre":"قاعدة بسكويت، كريمة ناعمة"},"en":{"nom":"Cheesecakes","sous_titre":"Biscuit base, silky cream"},"de":{"nom":"Cheesecakes","sous_titre":"Keksboden, cremige Füllung"},"nl":{"nom":"Cheesecakes","sous_titre":"Koekjesbodem, romige vulling"}}'::jsonb where nom = 'Cheesecakes';
update public.categories set traductions = '{"ar":{"nom":"مشروبات منزلية","sous_titre":"تُعصر وتُحضّر عند الطلب"},"en":{"nom":"Homemade drinks","sous_titre":"Squeezed and prepared to order"},"de":{"nom":"Hausgemachte Getränke","sous_titre":"Frisch gepresst und auf Bestellung zubereitet"},"nl":{"nom":"Huisgemaakte dranken","sous_titre":"Vers geperst en op bestelling bereid"}}'::jsonb where nom = 'Boissons maison';
update public.categories set traductions = '{"ar":{"nom":"مثلجات وكوكيز مثلج","sous_titre":"تُحضّر عند الطلب، متوفرة دائماً"},"en":{"nom":"Ice cream & Ice cream cookies","sous_titre":"Made to order, always available"},"de":{"nom":"Eis & Eis-Cookies","sous_titre":"Auf Bestellung, immer verfügbar"},"nl":{"nom":"IJs & IJskoekjes","sous_titre":"Op bestelling gemaakt, altijd beschikbaar"}}'::jsonb where nom = 'Glaces & Cookies glacés';
update public.produits set traductions = '{"ar":{"nom":"شارلوت بالتفاح والقرفة","description":"بسكويت الملعقة، تفاح مطهو بالقرفة وكريمة خفيفة."},"en":{"nom":"Apple cinnamon charlotte","description":"Ladyfingers, cinnamon apple compote and light cream."},"de":{"nom":"Apfel-Zimt-Charlotte","description":"Löffelbiskuits, Apfel-Zimt-Kompott und leichte Creme."},"nl":{"nom":"Charlotte met appel en kaneel","description":"Lange vingers, appelcompote met kaneel en lichte room."}}'::jsonb where nom = 'Charlotte aux pommes cannelle';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بالتفاح","description":"بينيي طري محشو بالتفاح المطهو."},"en":{"nom":"Mini apple doughnut","description":"Soft doughnut filled with apple compote."},"de":{"nom":"Mini-Krapfen Apfel","description":"Lockerer Krapfen mit Apfelkompott."},"nl":{"nom":"Mini beignet appel","description":"Luchtige beignet gevuld met appelcompote."}}'::jsonb where nom = 'Mini Beignet Pomme';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بالنوتيلا","description":"بينيي طري بقلب نوتيلا سخي."},"en":{"nom":"Mini Nutella doughnut","description":"Soft doughnut with a generous Nutella heart."},"de":{"nom":"Mini-Krapfen Nutella","description":"Lockerer Krapfen mit großzügigem Nutella-Kern."},"nl":{"nom":"Mini beignet Nutella","description":"Luchtige beignet met een royaal Nutella-hart."}}'::jsonb where nom = 'Mini Beignet Nutella';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بالسبيكولوس","description":"بينيي طري بكريمة السبيكولوس."},"en":{"nom":"Mini speculoos doughnut","description":"Soft doughnut with speculoos cream."},"de":{"nom":"Mini-Krapfen Spekulatius","description":"Lockerer Krapfen mit Spekulatiuscreme."},"nl":{"nom":"Mini beignet speculoos","description":"Luchtige beignet met speculoospasta."}}'::jsonb where nom = 'Mini Beignet Spéculoos';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بوينو","description":"بينيي طري بكريمة البندق على طريقة بوينو."},"en":{"nom":"Mini Bueno doughnut","description":"Soft doughnut with Bueno-style hazelnut cream."},"de":{"nom":"Mini-Krapfen Bueno","description":"Lockerer Krapfen mit Haselnusscreme nach Bueno-Art."},"nl":{"nom":"Mini beignet Bueno","description":"Luchtige beignet met hazelnootcrème in Bueno-stijl."}}'::jsonb where nom = 'Mini Beignet Bueno';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بالفستق","description":"بينيي طري بكريمة الفستق."},"en":{"nom":"Mini pistachio doughnut","description":"Soft doughnut with pistachio cream."},"de":{"nom":"Mini-Krapfen Pistazie","description":"Lockerer Krapfen mit Pistaziencreme."},"nl":{"nom":"Mini beignet pistache","description":"Luchtige beignet met pistachecrème."}}'::jsonb where nom = 'Mini Beignet Pistache';
update public.produits set traductions = '{"ar":{"nom":"بينيي صغير بالتوت","description":"بينيي طري بمربى التوت."},"en":{"nom":"Mini raspberry doughnut","description":"Soft doughnut with raspberry confit."},"de":{"nom":"Mini-Krapfen Himbeere","description":"Lockerer Krapfen mit Himbeerkonfit."},"nl":{"nom":"Mini beignet framboos","description":"Luchtige beignet met frambozenconfit."}}'::jsonb where nom = 'Mini Beignet Framboise';
update public.produits set traductions = '{"ar":{"nom":"بينيي كبير بالنوتيلا","description":"الحجم الكبير، محشو بسخاء بالنوتيلا."},"en":{"nom":"Large Nutella doughnut","description":"The large size, generously filled with Nutella."},"de":{"nom":"Großer Nutella-Krapfen","description":"Das große Format, großzügig mit Nutella gefüllt."},"nl":{"nom":"Grote beignet Nutella","description":"Het grote formaat, royaal gevuld met Nutella."}}'::jsonb where nom = 'Gros Beignet Nutella';
update public.produits set traductions = '{"ar":{"nom":"بالي بروتون","description":"بسكويت بالزبدة الخالصة، سميك وهش."},"en":{"nom":"Palet Breton","description":"Pure butter shortbread, thick and crumbly."},"de":{"nom":"Palet Breton","description":"Butter-Mürbegebäck, dick und mürbe."},"nl":{"nom":"Palet Breton","description":"Zandkoekje van pure boter, dik en kruimelig."}}'::jsonb where nom = 'Palet Breton';
update public.produits set traductions = '{"ar":{"nom":"كوكي بثلاث شوكولاتات","description":"شوكولاتة داكنة وبالحليب وبيضاء في عجينة طرية."},"en":{"nom":"Triple chocolate cookie","description":"Dark, milk and white chocolate in a soft dough."},"de":{"nom":"Cookie 3 Schokoladen","description":"Zartbitter-, Vollmilch- und weiße Schokolade in weichem Teig."},"nl":{"nom":"Cookie 3 chocolades","description":"Pure, melk- en witte chocolade in een zacht deeg."}}'::jsonb where nom = 'Cookie 3 Chocolats';
update public.produits set traductions = '{"ar":{"nom":"كوكي برالين البندق","description":"قلب سائل من برالين البندق المنزلي."},"en":{"nom":"Hazelnut praline cookie","description":"Molten homemade hazelnut praline heart."},"de":{"nom":"Cookie Haselnuss-Praliné","description":"Flüssiger Kern aus hausgemachtem Haselnuss-Praliné."},"nl":{"nom":"Cookie hazelnootpraliné","description":"Vloeibaar hart van huisgemaakte hazelnootpraliné."}}'::jsonb where nom = 'Cookie Praliné Noisette';
update public.produits set traductions = '{"ar":{"nom":"كوكي كيندر","description":"قطع كيندر وقلب طري."},"en":{"nom":"Kinder cookie","description":"Kinder pieces and a melting heart."},"de":{"nom":"Cookie Kinder","description":"Kinder-Stückchen und weicher Kern."},"nl":{"nom":"Cookie Kinder","description":"Stukjes Kinder en een smeltend hart."}}'::jsonb where nom = 'Cookie Kinder';
update public.produits set traductions = '{"ar":{"nom":"كوكي برالين الفستق","description":"قلب سائل من برالين الفستق."},"en":{"nom":"Pistachio praline cookie","description":"Molten pistachio praline heart."},"de":{"nom":"Cookie Pistazien-Praliné","description":"Flüssiger Kern aus Pistazien-Praliné."},"nl":{"nom":"Cookie pistachepraliné","description":"Vloeibaar hart van pistachepraliné."}}'::jsonb where nom = 'Cookie Praliné Pistache';
update public.produits set traductions = '{"ar":{"nom":"تيراميسو نوتيلا","description":"ماسكاربوني، بسكويت مبلل ونوتيلا."},"en":{"nom":"Nutella tiramisu","description":"Mascarpone, soaked ladyfingers and Nutella."},"de":{"nom":"Tiramisu Nutella","description":"Mascarpone, getränkte Biskuits und Nutella."},"nl":{"nom":"Tiramisu Nutella","description":"Mascarpone, gedrenkte lange vingers en Nutella."}}'::jsonb where nom = 'Tiramisu Nutella';
update public.produits set traductions = '{"ar":{"nom":"تيراميسو بالقهوة","description":"الكلاسيكي: ماسكاربوني، قهوة وكاكاو."},"en":{"nom":"Coffee tiramisu","description":"The classic: mascarpone, coffee and cocoa."},"de":{"nom":"Tiramisu Kaffee","description":"Der Klassiker: Mascarpone, Kaffee und Kakao."},"nl":{"nom":"Tiramisu koffie","description":"De klassieker: mascarpone, koffie en cacao."}}'::jsonb where nom = 'Tiramisu Café';
update public.produits set traductions = '{"ar":{"nom":"تيراميسو مانجو / ليمون","description":"نسخة بالفواكه ومنعشة الحموضة."},"en":{"nom":"Mango / lemon tiramisu","description":"A fruity, tangy version."},"de":{"nom":"Tiramisu Mango / Zitrone","description":"Fruchtige, spritzige Variante."},"nl":{"nom":"Tiramisu mango / citroen","description":"Fruitige, frisse versie."}}'::jsonb where nom = 'Tiramisu Mangue / Citron';
update public.produits set traductions = '{"ar":{"nom":"تيراميسو بالفستق","description":"ماسكاربوني وكريمة الفستق."},"en":{"nom":"Pistachio tiramisu","description":"Mascarpone and pistachio cream."},"de":{"nom":"Tiramisu Pistazie","description":"Mascarpone und Pistaziencreme."},"nl":{"nom":"Tiramisu pistache","description":"Mascarpone en pistachecrème."}}'::jsonb where nom = 'Tiramisu Pistache';
update public.produits set traductions = '{"ar":{"nom":"موس الشوكولاتة","description":"شوكولاتة داكنة غنية، قوام هوائي."},"en":{"nom":"Chocolate mousse","description":"Intense dark chocolate, airy texture."},"de":{"nom":"Mousse au chocolat","description":"Intensive Zartbitterschokolade, luftige Textur."},"nl":{"nom":"Chocolademousse","description":"Intense pure chocolade, luchtige textuur."}}'::jsonb where nom = 'Mousse au chocolat';
update public.produits set traductions = '{"ar":{"nom":"تشيزكيك لوتس","description":"قاعدة سبيكولوس وطبقة لوتس."},"en":{"nom":"Lotus cheesecake","description":"Speculoos base and Lotus topping."},"de":{"nom":"Cheesecake Lotus","description":"Spekulatiusboden und Lotus-Topping."},"nl":{"nom":"Cheesecake Lotus","description":"Speculoosbodem en Lotus-topping."}}'::jsonb where nom = 'Cheesecake Lotus';
update public.produits set traductions = '{"ar":{"nom":"تشيزكيك نوتيلا","description":"كريمة ناعمة وطبقة نوتيلا."},"en":{"nom":"Nutella cheesecake","description":"Silky cream and Nutella topping."},"de":{"nom":"Cheesecake Nutella","description":"Cremige Füllung und Nutella-Topping."},"nl":{"nom":"Cheesecake Nutella","description":"Romige vulling en Nutella-topping."}}'::jsonb where nom = 'Cheesecake Nutella';
update public.produits set traductions = '{"ar":{"nom":"تشيزكيك أوريو","description":"قاعدة وقطع أوريو."},"en":{"nom":"Oreo cheesecake","description":"Oreo base and pieces."},"de":{"nom":"Cheesecake Oreo","description":"Oreo-Boden und Oreo-Stückchen."},"nl":{"nom":"Cheesecake Oreo","description":"Oreo-bodem en stukjes Oreo."}}'::jsonb where nom = 'Cheesecake Oreo';
update public.produits set traductions = '{"ar":{"nom":"تشيزكيك بوينو","description":"كريمة البندق وقطع بوينو."},"en":{"nom":"Bueno cheesecake","description":"Hazelnut cream and Bueno pieces."},"de":{"nom":"Cheesecake Bueno","description":"Haselnusscreme und Bueno-Stückchen."},"nl":{"nom":"Cheesecake Bueno","description":"Hazelnootcrème en stukjes Bueno."}}'::jsonb where nom = 'Cheesecake Bueno';
update public.produits set traductions = '{"ar":{"nom":"مثلجات فانيليا بوربون — صغير","description":"مثلجات حرفية بفانيليا بوربون، حجم صغير."},"en":{"nom":"Bourbon vanilla ice cream — Small","description":"Artisan Bourbon vanilla ice cream, small size."},"de":{"nom":"Bourbon-Vanilleeis — Klein","description":"Handwerkliches Bourbon-Vanilleeis, kleine Größe."},"nl":{"nom":"Bourbon-vanille-ijs — Klein","description":"Ambachtelijk Bourbon-vanille-ijs, klein formaat."}}'::jsonb where nom = 'Glace Vanille Bourbon — Petit';
update public.produits set traductions = '{"ar":{"nom":"مثلجات فانيليا بوربون — كبير","description":"مثلجات حرفية بفانيليا بوربون، حجم كبير."},"en":{"nom":"Bourbon vanilla ice cream — Large","description":"Artisan Bourbon vanilla ice cream, large size."},"de":{"nom":"Bourbon-Vanilleeis — Groß","description":"Handwerkliches Bourbon-Vanilleeis, große Größe."},"nl":{"nom":"Bourbon-vanille-ijs — Groot","description":"Ambachtelijk Bourbon-vanille-ijs, groot formaat."}}'::jsonb where nom = 'Glace Vanille Bourbon — Grand';
update public.produits set traductions = '{"ar":{"nom":"كراميل بالزبدة المملحة منزلي — صغير","description":"كراميل بالزبدة المملحة محضّر في المحل، يُسكب على مثلجاتك أو الكوكي المثلج."},"en":{"nom":"Homemade salted butter caramel — Small","description":"Salted butter caramel made in-house, poured over your ice cream or ice cream cookie."},"de":{"nom":"Hausgemachtes Salzkaramell — Klein","description":"Im Haus gekochtes Salzbutter-Karamell, über Ihr Eis oder Ihren Eis-Cookie gegossen."},"nl":{"nom":"Huisgemaakte gezouten karamel — Klein","description":"In huis gemaakte karamel met gezouten boter, over uw ijs of ijskoekje."}}'::jsonb where nom = 'Caramel beurre salé maison — Petit';
update public.produits set traductions = '{"ar":{"nom":"كراميل بالزبدة المملحة منزلي — كبير","description":"كراميل بالزبدة المملحة محضّر في المحل، بسخاء على الحجم الكبير."},"en":{"nom":"Homemade salted butter caramel — Large","description":"Salted butter caramel made in-house, poured generously over the large size."},"de":{"nom":"Hausgemachtes Salzkaramell — Groß","description":"Im Haus gekochtes Salzbutter-Karamell, großzügig über das große Format."},"nl":{"nom":"Huisgemaakte gezouten karamel — Groot","description":"In huis gemaakte karamel met gezouten boter, royaal over het grote formaat."}}'::jsonb where nom = 'Caramel beurre salé maison — Grand';
update public.produits set traductions = '{"ar":{"nom":"كوكي مثلج فانيليا كراميل — صغير","description":"كوكي منزلي محشو بمثلجات الفانيليا والكراميل."},"en":{"nom":"Vanilla caramel ice cream cookie — Small","description":"Homemade cookie filled with vanilla ice cream and caramel."},"de":{"nom":"Eis-Cookie Vanille-Karamell — Klein","description":"Hausgemachter Cookie mit Vanilleeis und Karamell."},"nl":{"nom":"IJskoekje vanille-karamel — Klein","description":"Huisgemaakt koekje gevuld met vanille-ijs en karamel."}}'::jsonb where nom = 'Cookie glacé vanille caramel — Petit';
update public.produits set traductions = '{"ar":{"nom":"كوكي مثلج فانيليا كراميل — كبير","description":"كوكي كبير محشو بمثلجات الفانيليا والكراميل."},"en":{"nom":"Vanilla caramel ice cream cookie — Large","description":"Large cookie filled with vanilla ice cream and caramel."},"de":{"nom":"Eis-Cookie Vanille-Karamell — Groß","description":"Großer Cookie mit Vanilleeis und Karamell."},"nl":{"nom":"IJskoekje vanille-karamel — Groot","description":"Groot koekje gevuld met vanille-ijs en karamel."}}'::jsonb where nom = 'Cookie glacé vanille caramel — Grand';
update public.produits set traductions = '{"ar":{"nom":"عصير برتقال طازج","description":"برتقال يُعصر عند الطلب، بدون سكر مضاف."},"en":{"nom":"Fresh-squeezed orange juice","description":"Oranges squeezed to order, no added sugar."},"de":{"nom":"Frisch gepresster Orangensaft","description":"Auf Bestellung gepresste Orangen, ohne Zuckerzusatz."},"nl":{"nom":"Vers geperst sinaasappelsap","description":"Op bestelling geperste sinaasappels, zonder toegevoegde suiker."}}'::jsonb where nom = 'Jus d''orange pressé maison';
update public.produits set traductions = '{"ar":{"nom":"موهيتو بالنعناع المثلج","description":"نعناع طازج، ليمون معصور، ثلج مجروش. بدون كحول."},"en":{"nom":"Iced mint mojito","description":"Fresh mint, squeezed lemon, crushed ice. Alcohol-free."},"de":{"nom":"Eisgekühlter Minz-Mojito","description":"Frische Minze, gepresste Zitrone, Crushed Ice. Alkoholfrei."},"nl":{"nom":"IJskoude munt-mojito","description":"Verse munt, geperste citroen, gemalen ijs. Alcoholvrij."}}'::jsonb where nom = 'Mojito menthe glacé';
update public.bannieres set traductions = '{"ar":{"titre":"عرض الكوكيز: اشترِ 3 والرابع مجاناً","texte":"تُضاف تلقائياً إلى طلبك بدءاً من 3 كوكيز."},"en":{"titre":"Cookie offer: buy 3, get the 4th free","texte":"Added automatically to your order from 3 cookies."},"de":{"titre":"Cookie-Angebot: 3 kaufen, das 4. gratis","texte":"Ab 3 Cookies automatisch zu Ihrer Bestellung hinzugefügt."},"nl":{"titre":"Koekjesactie: koop 3, de 4e gratis","texte":"Automatisch toegevoegd aan uw bestelling vanaf 3 koekjes."}}'::jsonb where titre = 'Offre cookies : 3 achetés, le 4ᵉ offert';
update public.parametres set traductions = '{"ar":{"horaires":"الثلاثاء – الأحد · 9:00 – 20:00","delai_texte":"استلام أو توصيل في نفس اليوم حسب المخزون","annonce":"توصيل 10 د.م. في تطوان، مجاني من 60 د.م. · الدفع عند الاستلام · مخزون اليوم مباشر","message_ferme":"تستأنف الطلبات صباح الغد. إلى اللقاء قريباً!"},"en":{"horaires":"Tuesday – Sunday · 9am – 8pm","delai_texte":"Same-day pick-up or delivery, depending on stock","annonce":"Delivery 10 DH in Tétouan, free from 60 DH · Pay on delivery · Today''s stock, live","message_ferme":"Orders resume tomorrow morning. See you soon!"},"de":{"horaires":"Dienstag – Sonntag · 9 – 20 Uhr","delai_texte":"Abholung oder Lieferung am selben Tag, je nach Bestand","annonce":"Lieferung 10 DH in Tétouan, kostenlos ab 60 DH · Zahlung bei Übergabe · Tagesbestand live","message_ferme":"Bestellungen sind ab morgen früh wieder möglich. Bis bald!"},"nl":{"horaires":"Dinsdag – zondag · 9 – 20 u","delai_texte":"Afhalen of bezorging op dezelfde dag, afhankelijk van de voorraad","annonce":"Bezorging 10 DH in Tétouan, gratis vanaf 60 DH · Betaling bij ontvangst · Voorraad van vandaag, live","message_ferme":"Bestellen kan morgenochtend weer. Tot snel!"}}'::jsonb where id = 1;
