-- Offres promotionnelles gérées depuis l'admin (sans code) :
--   n_plus_1  : N achetés, M offerts (les pièces les moins chères sont offertes)
--   pourcent  : −X % sur la cible
-- Cible : une catégorie (categorie_id) ou un produit (produit_id).
create table if not exists public.offres (
  id           uuid primary key default gen_random_uuid(),
  type         text not null default 'n_plus_1',
  categorie_id int references public.categories(id) on delete cascade,
  produit_id   uuid references public.produits(id) on delete cascade,
  achetes      int default 3,
  offerts      int default 1,
  pourcent     numeric(5,2),
  actif        boolean default true,
  ordre        int default 0,
  created_at   timestamptz default now()
);
alter table public.offres enable row level security;
drop policy if exists "offres lecture publique" on public.offres;
create policy "offres lecture publique" on public.offres for select using (true);
drop policy if exists "offres ecriture patissier" on public.offres;
create policy "offres ecriture patissier" on public.offres for all to authenticated using (true) with check (true);
grant select on public.offres to anon, authenticated;
grant all on public.offres to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'offres') then
    alter publication supabase_realtime add table public.offres;
  end if;
end $$;

alter table public.commandes add column if not exists remise numeric(10,2) default 0;

-- Offre historique « 3 cookies achetés, le 4ᵉ offert » migrée dans le nouveau système (une seule fois)
insert into public.offres (type, categorie_id, achetes, offerts, actif, ordre)
select 'n_plus_1', c.id, 3, 1, true, 1 from public.categories c
where c.nom ilike 'cookies %' and not exists (select 1 from public.offres);

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
  v_remise   numeric(10,2) := 0;
  v_lignes   jsonb := '[]'::jsonb;
  v_new      jsonb;
  v_l        jsonb;
  v_off      public.offres%rowtype;
  v_n        int;
  v_free     int;
  v_r        numeric(10,2);
  v_ids      jsonb;
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
    v_lignes := v_lignes || jsonb_build_object('produit_id', v_prod.id, 'nom', v_prod.nom, 'prix', v_prod.prix, 'qte', v_qte,
                                               'categorie_id', v_prod.categorie_id, 'offert', 0, 'remise', 0);
  end loop;

  -- Minimum de commande : comparé au sous-total des articles (même règle que le site)
  if coalesce(v_param.commande_min, 0) > 0 and v_total < v_param.commande_min then
    raise exception 'MINIMUM|%', v_param.commande_min;
  end if;

  -- Offres : même règle que js/offres.js (pièces les moins chères offertes, ou −X %)
  for v_off in select * from public.offres where actif is true order by ordre loop
    if v_off.type = 'pourcent' then
      if coalesce(v_off.pourcent, 0) > 0 then
        v_new := '[]'::jsonb;
        for v_l in select * from jsonb_array_elements(v_lignes) loop
          if (v_off.produit_id is not null and (v_l->>'produit_id')::uuid = v_off.produit_id)
             or (v_off.produit_id is null and v_off.categorie_id is not null and (v_l->>'categorie_id')::int = v_off.categorie_id) then
            v_r := round((v_l->>'prix')::numeric * (v_l->>'qte')::int * v_off.pourcent / 100, 2);
            v_remise := v_remise + v_r;
            v_l := jsonb_set(v_l, '{remise}', to_jsonb(((v_l->>'remise')::numeric + v_r)));
          end if;
          v_new := v_new || v_l;
        end loop;
        v_lignes := v_new;
      end if;
    else
      select count(*) into v_n from jsonb_array_elements(v_lignes) l
        cross join generate_series(1, (l->>'qte')::int)
        where (v_off.produit_id is not null and (l->>'produit_id')::uuid = v_off.produit_id)
           or (v_off.produit_id is null and v_off.categorie_id is not null and (l->>'categorie_id')::int = v_off.categorie_id);
      v_free := floor(v_n / (greatest(1, coalesce(v_off.achetes, 3)) + greatest(1, coalesce(v_off.offerts, 1)))) * greatest(1, coalesce(v_off.offerts, 1));
      if v_free > 0 then
        select coalesce(sum(u.prix), 0), coalesce(jsonb_agg(u.produit_id), '[]'::jsonb) into v_r, v_ids from (
          select l->>'produit_id' as produit_id, (l->>'prix')::numeric as prix
          from jsonb_array_elements(v_lignes) l
          cross join generate_series(1, (l->>'qte')::int)
          where (v_off.produit_id is not null and (l->>'produit_id')::uuid = v_off.produit_id)
             or (v_off.produit_id is null and v_off.categorie_id is not null and (l->>'categorie_id')::int = v_off.categorie_id)
          order by (l->>'prix')::numeric asc
          limit v_free
        ) u;
        v_remise := v_remise + v_r;
        v_new := '[]'::jsonb;
        for v_l in select * from jsonb_array_elements(v_lignes) loop
          select count(*) into v_n from jsonb_array_elements_text(v_ids) x where x = v_l->>'produit_id';
          if v_n > 0 then
            v_l := jsonb_set(v_l, '{offert}', to_jsonb((v_l->>'offert')::int + v_n));
            v_l := jsonb_set(v_l, '{remise}', to_jsonb((v_l->>'remise')::numeric + v_n * (v_l->>'prix')::numeric));
          end if;
          v_new := v_new || v_l;
        end loop;
        v_lignes := v_new;
      end if;
    end if;
  end loop;
  v_remise := round(v_remise, 2);
  v_total := round(v_total - v_remise, 2);
  -- La livraison est facturée à la réception selon la distance : le total ne l'inclut pas.

  select count(*) + 1 into v_rang from public.commandes
    where (created_at at time zone 'Africa/Casablanca')::date = v_jour;
  v_code := to_char(v_jour, 'YY') || extract(month from v_jour)::int || extract(day from v_jour)::int || v_rang;

  insert into public.commandes (code, client_nom, client_tel, mode, adresse, gps_lat, gps_lng, date_souhaitee, creneau, remarque, articles, total, remise, langue)
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
    v_lignes, v_total, v_remise,
    left(coalesce(p_client->>'langue', 'fr'), 5)
  ) returning id, numero into v_id, v_numero;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'code', v_code, 'total', v_total, 'remise', v_remise, 'articles', v_lignes);
end;
$$;
grant execute on function public.passer_commande(jsonb, jsonb) to anon, authenticated;
