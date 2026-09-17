-- Cadrage des photos produit choisi dans l'admin : point de mise au point (object-position) et zoom
alter table public.produits add column if not exists image_pos text default '50% 50%';
alter table public.produits add column if not exists image_zoom numeric(4,2) default 1;
