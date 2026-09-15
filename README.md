# Bianchi Dessert — site de commande

Site de commande en ligne pour Bianchi Dessert : catalogue avec **stock du jour en temps réel**, panier, commande envoyée sur **WhatsApp**, et un **espace pâtissier** pour gérer stocks, prix, photos, promotions, bannières et commandes.

Tout est gratuit : hébergement **Netlify** (plan Free) + base de données **Supabase** (plan Free).

## Design

Direction validée le 15/09/2026 sur le canevas Claude Design : mise en page « vitrine du jour » sur fond crème, cartes blanches, or foncé pour prix et accents, logo en pièce maîtresse, navigation soulignée, pièce du jour choisie par le pâtissier (étoile dans l'admin). Les jetons de couleur sont en tête de `css/site.css`. Après toute modification de CSS ou JS, incrémentez le `?v=` des liens dans `index.html` pour forcer les navigateurs à recharger.

## Contenu

```
index.html          Site client
admin.html          Espace pâtissier (connexion requise)
css/                Styles (base partagée, site, admin)
js/config.js        ← À REMPLIR avec les clés Supabase
js/data.js          Couche de données (Supabase, ou démo locale si non configuré)
js/site.js          Logique du site client
js/admin.js         Logique de l'admin
js/demo-data.js     Catalogue de démonstration (mode démo uniquement)
js/i18n.js          Textes de l'interface en 5 langues
js/catalogue-traductions.js  Traductions du catalogue de départ
assets/logo.png     Logo officiel
supabase/schema.sql Script à exécuter une fois dans Supabase
netlify.toml        Config Netlify
```

## Site en ligne

- **Site** : https://maurdor.github.io/bianchi-dessert/
- **Espace pâtissier** : https://maurdor.github.io/bianchi-dessert/admin.html
- **Code** : https://github.com/Maurdor/bianchi-dessert (hébergé gratuitement par GitHub Pages, branche `main`). Chaque `git push` remet le site à jour en une minute.

Tant que les clés Supabase ne sont pas renseignées dans `js/config.js`, le site en ligne tourne en **mode démo** : chaque visiteur voit le catalogue de départ dans son propre navigateur, rien n'est partagé. L'étape 1 ci-dessous (Supabase) est donc indispensable avant de donner l'adresse aux clients.

## Tester tout de suite (mode démo)

Ouvrez `index.html` dans un navigateur (ou servez le dossier avec `python3 -m http.server`). Sans clés Supabase, le site tourne en **mode démo** : les données restent dans le navigateur. L'admin est accessible sur `admin.html` avec le code **1234** (modifiable dans `js/config.js`).

## Mise en production (≈ 20 minutes)

### 1. Créer la base Supabase (gratuit)

1. Créez un compte sur https://supabase.com puis **New project** (choisissez une région proche, ex. *West EU*). Notez le mot de passe de la base, il ne sert pas au site.
2. Menu **SQL Editor** → **New query** → collez tout le contenu de `supabase/schema.sql` → **Run**. Cela crée les tables, la sécurité, les fonctions de commande, le stockage des photos et le catalogue de départ.
3. Menu **Authentication** → **Users** → **Add user** → *Create new user* : l'email et le mot de passe du pâtissier (cochez *Auto confirm user*). C'est son identifiant pour `admin.html`.
4. Toujours dans **Authentication** → **Sign In / Providers** → **Email** : désactivez **Allow new users to sign up** (personne d'autre ne pourra créer de compte).
5. Menu **Project Settings** → **API** (ou **Data API**) : copiez **Project URL** et la clé **anon public**.

### 2. Configurer le site

Ouvrez `js/config.js` et renseignez :

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

La clé *anon* est publique par conception : la sécurité repose sur les règles RLS créées par le script SQL (lecture publique du catalogue, écriture réservée au compte connecté, commandes uniquement via la fonction sécurisée).

### 3. Mettre en ligne sur Netlify (gratuit)

Option simple : https://app.netlify.com/drop → glissez-déposez le dossier `bianchi-dessert`. Le site est en ligne en quelques secondes avec une adresse `xxx.netlify.app` (renommable dans *Site settings → Change site name*).

Option Git : poussez le dossier sur GitHub, puis Netlify → *Add new site → Import an existing project*. Chaque `git push` redéploie automatiquement.

### 4. Premiers réglages dans l'admin

Sur `https://votre-site.netlify.app/admin.html`, connectez-vous puis :

- **Paramètres** : numéro WhatsApp (format `2126XXXXXXXX`, sans `+`), adresse, horaires, frais de livraison.
- **Produits** : ajoutez les photos (elles sont réduites automatiquement et stockées gratuitement dans Supabase).
- **Stock du jour** : l'écran du quotidien. Les clients voient les changements sans recharger.

## Comment fonctionne une commande

1. Le client compose son panier ; les quantités sont limitées au stock affiché. En livraison, il partage sa **position GPS** en un clic (lien Google Maps dans le message et dans l'admin) et peut ajouter un complément (étage, sonnette) ; s'il refuse la localisation, un champ adresse apparaît.
2. À l'envoi, la fonction `passer_commande` (côté base) vérifie le stock de chaque article, le **réserve** (décrémente), calcule le total avec les prix en base et enregistre la commande (`n°`).
3. Le client est redirigé vers WhatsApp avec le récapitulatif pré-rempli pour confirmer avec le pâtissier.
4. Dans l'admin → **Commandes**, le pâtissier suit le statut. **Annuler** une commande remet automatiquement les articles en stock.

Produits « sur commande » (glaces) : décochez *Suivre le stock* ; ils sont toujours commandables.

## Conversion et upsell (audit e-commerce du 15/09/2026)

- **Deux étapes claires** : « Réserver mon panier » (étape 1/2, stock réservé) puis « Envoyer sur WhatsApp » (étape 2/2, obligatoire). Si le client recharge la page ou revient de WhatsApp sans avoir envoyé, un bandeau de relance lui repropose l'envoi pendant 24 h.
- **Suivi côté pâtissier** : chaque commande indique si le récapitulatif WhatsApp a été ouvert (« Récap non envoyé »), avec un bouton « Relancer le client ». Boutons « Confirmer sur WhatsApp » et « Prévenir : c'est prêt » qui changent le statut et ouvrent un message pré-rédigé dans la langue du client. Le message WhatsApp contient un lien direct vers la commande dans l'admin.
- **Complétez votre commande** : jusqu'à 3 suggestions dans le panier (supplément assorti à une glace, pièce du jour, petits prix d'autres catégories, produits presque épuisés).
- **Livraison offerte à partir de X DH** (Paramètres) : barre de progression dans le panier, règle appliquée aussi côté base.
- **Créneau de récupération** (dès que possible, matin, après-midi, soir) transmis au pâtissier.
- **Épuisés repliés** en bas de chaque catégorie avec un lien « Me prévenir » qui ouvre WhatsApp avec un message pré-rempli.
- **Réassurance** : paiement à la réception, les 3 étapes, zone et délais visibles sur mobile ; balises Open Graph pour l'aperçu du lien partagé. `assets/og.jpg` (1200×630) est une version par défaut générée à partir du logo : remplacez-la par une belle photo de dessert, et une fois le site en ligne mettez l'adresse complète dans la balise `og:image` de `index.html` (ex. `https://bianchi-dessert.pages.dev/assets/og.jpg`), WhatsApp exige une adresse absolue.
- **Allergènes** : champ facultatif par produit (Produits → Modifier), traduisible ; affiché dans la fiche produit uniquement s'il est rempli.
- Le mode de récupération n'est plus présélectionné : la position GPS est demandée au moment où le client choisit « Livraison ».

## Audits UX/UI et vente (15/09/2026, seconde passe)

Appliqués : mise en page bureau contenue à 1280 px, en-tête compact avec recherche, sections à carte unique en format paysage, épuisés dépliés quand rien n'est disponible, date affichée une seule fois, offre en tête de colonne, chiffres de prix lisibles, cibles tactiles de 42 à 44 px, zones de sécurité iPhone, contraste des étiquettes, champs du panier conservés lors d'un changement de quantité, mode Livraison présélectionné avec position GPS demandée au moment de réserver (et ajustable sur une carte OpenStreetMap), suggestions expliquées (complément, livraison offerte, deuxième parfum, pièce du jour, dernières pièces), raccourci ×4 sur les petits prix, offre cookies 3+1 ajoutée automatiquement à la remarque, message WhatsApp en texte simple avec accents, réponses admin avec montant, mode et créneau, bouton « Annuler et libérer le stock » après une heure sans envoi.

Numéro de commande : année (2 chiffres) + mois + jour + rang du jour, ex. `269151` = 1re commande du 15/9/2026. Il figure dans la confirmation, le message WhatsApp, l'admin et le lien direct `admin.html#cmd=269151`.

## Cinq langues

Tout le texte visible par les clients existe en **français, arabe, anglais, allemand et néerlandais** ; l'arabe s'affiche de droite à gauche. Le sélecteur de langue est en haut du site et la langue est mémorisée ; au premier passage, celle du navigateur est choisie.

- **Interface** (boutons, panier, messages, formulaire) : traduite dans `js/i18n.js`.
- **Contenus du pâtissier** (produits, catégories, bannières, horaires, texte défilant, message de fermeture) : chaque élément a un bloc « 🌐 Traductions » dans l'admin. Un champ vide affiche le texte français. Le bouton « Traduire automatiquement » propose une traduction gratuite (service MyMemory, sans clé, limite d'environ 5 000 caractères par jour) à relire avant publication.
- Le catalogue de départ est déjà traduit (`js/catalogue-traductions.js`, repris dans `supabase/schema.sql`).
- Les **messages WhatsApp arrivent toujours en français** au pâtissier, avec les noms de produits français et une ligne « Langue du client » quand celui-ci a commandé dans une autre langue. L'admin affiche aussi cette langue sur chaque commande.

## Logo et photos

Le logo officiel est dans `assets/logo.png`. Les 15 photos de `assets/produits/` ont été extraites des reels Instagram de @bianchi_desserts pour la présentation (cookies, tiramisù, beignets, glaces) ; le pâtissier pourra les remplacer par ses propres photos depuis l'admin (onglet Produits → Modifier → Photo) : elles sont réduites automatiquement et stockées gratuitement dans Supabase. Le script SQL référence ces photos par leur adresse GitHub Pages. L'image de partage `assets/og.jpg` utilise le cookie praliné pistache.

## Limites du plan gratuit (largement suffisant)

- Supabase Free : 500 Mo de base, 1 Go de photos, 50 000 utilisateurs actifs. Le projet est mis en pause après 7 jours sans aucune requête : ouvrir le site le réactive en une minute. Pour éviter la pause, un simple visiteur par semaine suffit.
- Netlify Free : 100 Go de bande passante / mois.
