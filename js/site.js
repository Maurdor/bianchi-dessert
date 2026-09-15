// ============================================================
//  Bianchi Dessert — logique du site client (design « vitrine du jour », 5 langues)
// ============================================================
(function () {
  const api = window.BianchiAPI;
  const L = window.I18N;
  const t = (k, v) => L.t(k, v);
  const c = (o, f) => L.c(o, f);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const money = (n) => L.money(n);
  const priceHtml = (n, old) => `<span class="price">${old ? `<span class="price-old num">${esc(money(old))}</span>` : ""}<span class="num">${Number(n || 0).toLocaleString(L.locale(), { maximumFractionDigits: 2 })} <small>${esc(L.devise())}</small></span></span>`;
  const TR = window.BIANCHI_TRADUCTIONS || {};
  const ICON = {
    pin: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
    clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    bike: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h6l3-7h3M9 10h4l3 7"/></svg>`,
    bag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`,
    photo: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>`,
    wa: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-13.2 8L3 21l1.1-4.6A9 9 0 1 1 21 12Z"/></svg>`,
  };

  let data = { categories: [], produits: [], bannieres: [], parametres: {} };
  let cart = loadCart();
  let recherche = "";
  let confirmation = null;
  let clientInfo = loadClient();
  let gps = null;
  let gpsRefuse = false;
  const CRENEAUX = ["asap", "morning", "afternoon", "evening"];
  const CRENEAU_FR = { asap: "Dès que possible", morning: "Matin (10h–13h)", afternoon: "Après-midi (13h–18h)", evening: "Soir (18h–22h)" };
  function loadLast() { try { return JSON.parse(localStorage.getItem("bianchi_last_order") || "null"); } catch { return null; } }
  function saveLast(o) { try { if (o) localStorage.setItem("bianchi_last_order", JSON.stringify(o)); else localStorage.removeItem("bianchi_last_order"); } catch {} }

  // ---------- Persistance légère ----------
  function loadCart() { try { return JSON.parse(localStorage.getItem("bianchi_cart") || "{}"); } catch { return {}; } }
  function saveCart() { try { localStorage.setItem("bianchi_cart", JSON.stringify(cart)); } catch {} }
  function loadClient() { try { return JSON.parse(localStorage.getItem("bianchi_client") || "{}"); } catch { return {}; } }
  function saveClient(ci) { clientInfo = ci; try { localStorage.setItem("bianchi_client", JSON.stringify(ci)); } catch {} }

  // ---------- Helpers ----------
  const produit = (id) => data.produits.find((p) => p.id === id);
  const catDe = (p) => data.categories.find((x) => x.id === p.categorie_id);
  const dispo = (p) => !p.suivre_stock || (p.stock || 0) > 0;
  const stockMax = (p) => (p.suivre_stock ? Math.max(0, p.stock || 0) : 99);
  const ouvert = () => data.parametres.commandes_ouvertes !== false;
  const emojiDe = (p) => (catDe(p)?.emoji) || "🍰";
  const nomP = (p) => c(p, "nom");
  const promoTxt = (p) => { const lbl = p.promo_label; if (!lbl) return ""; const tr = p.traductions?.[L.lang]?.promo_label; if (tr) return tr; return TR.promo_labels?.[lbl]?.[L.lang] || lbl; };
  const stockKind = (p) => !p.suivre_stock ? "order" : (p.stock || 0) <= 0 ? "bad" : (p.stock || 0) <= 3 ? "warn" : "good";
  const stockTxt = (p) => ({ order: t("stock_on_order"), bad: t("out_today"), warn: (p.stock === 1 ? t("stock_last") : t("stock_left", { n: p.stock })), good: t("stock_available", { n: p.stock }) })[stockKind(p)];
  const waNum = () => String(data.parametres.whatsapp || "").replace(/\D/g, "");
  const notifyLink = (p) => `<a class="notify" target="_blank" rel="noopener" href="https://wa.me/${waNum()}?text=${encodeURIComponent(t("notify_msg", { name: nomP(p) }))}">${esc(t("notify_me"))}</a>`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dateDuJour = () => cap(L.date(new Date()));
  const shopName = () => data.parametres.nom || "Bianchi Dessert";

  function toast(msg, err) {
    const el = $("#toast");
    el.textContent = msg; el.classList.toggle("err", !!err); el.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  const photoHtml = (p, extra = "") => `<div class="photo" data-open="${p.id}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(nomP(p))}" loading="lazy">` : `<div class="ph"><span class="emoji">${emojiDe(p)}</span></div>`}<span class="tag tag-${stockKind(p)}">${esc(stockTxt(p))}</span>${p.vedette ? `<span class="promo">★ ${esc(t("featured"))}</span>` : ""}${p.promo_label ? `<span class="promo">${esc(promoTxt(p))}</span>` : ""}${extra}</div>`;

  // ---------- Textes statiques ----------
  function applyStatic() {
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    $("#closeDrawer").setAttribute("aria-label", t("close"));
    const sel = $("#langSelect");
    if (!sel.options.length) {
      sel.innerHTML = Object.entries(L.LANGS).map(([k, v]) => `<option value="${k}">${v.flag} ${k.toUpperCase()}</option>`).join("");
      sel.onchange = () => { L.set(sel.value); applyStatic(); renderAll(); };
    }
    sel.value = L.lang;
    sel.setAttribute("aria-label", t("language"));
    $("#tagline").textContent = `${t("tagline")}${data.parametres.adresse ? " · " + c(data.parametres, "adresse") : ""}`;
    $("#dateDesk").textContent = dateDuJour();
    $("#dateMob").textContent = dateDuJour();
  }

  // ---------- Infos boutique ----------
  function renderInfos() {
    const p = data.parametres || {};
    document.title = shopName();
    $("#slogan").textContent = p.slogan || "";
    $("#shopName").textContent = shopName();
    const statusTxt = ouvert() ? `${t("orders_open")}${c(p, "horaires") ? " · " + c(p, "horaires") : ""}` : t("orders_closed");
    $("#statusDesk").textContent = ouvert() ? t("orders_open") : t("orders_closed"); $("#statusMob").textContent = statusTxt;
    $("#dotDesk").classList.toggle("ferme", !ouvert()); $("#dotMob").classList.toggle("ferme", !ouvert());
    $("#delaiMob").textContent = c(p, "delai_texte") || "";
    const wa = "https://wa.me/" + String(p.whatsapp || "").replace(/\D/g, "");
    $("#btnWaMob").href = wa; $("#btnWaDesk").href = wa; $("#btnWaDesk").hidden = !p.whatsapp;
    const closed = $("#closedBanner"); closed.hidden = ouvert(); $("#closedMsg").textContent = c(p, "message_ferme") || "";

    const maps = p.lien_maps || (p.adresse ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.adresse + " " + shopName()) : "");
    const infos = [
      p.adresse ? `<li>${ICON.pin}<a href="${esc(maps)}" target="_blank" rel="noopener">${esc(c(p, "adresse"))} · ${esc(t("directions"))}</a></li>` : "",
      c(p, "horaires") ? `<li>${ICON.clock}<span>${esc(c(p, "horaires"))}</span></li>` : "",
      p.livraison_active ? `<li>${ICON.bike}<span>${esc(t("delivery"))} ${Number(p.frais_livraison) ? esc(money(p.frais_livraison)) : ""}${c(p, "delai_texte") ? " · " + esc(c(p, "delai_texte")) : ""}</span></li>` : "",
    ].join("");
    $("#infosDesk").innerHTML = infos;
    $("#footInfo").innerHTML = infos + `<li class="slogan">${esc(p.slogan || "")}</li><li><a href="admin.html">${esc(t("admin_link"))}</a></li>`;

    const ann = $("#annonce");
    const annonce = c(p, "annonce");
    clearInterval(renderInfos._rot);
    if (annonce) {
      const items = annonce.split(/\s*·\s*/).filter(Boolean); let i = 0;
      const el = $("#annonceTxt"); el.textContent = items[0]; ann.hidden = false;
      if (items.length > 1) renderInfos._rot = setInterval(() => { el.classList.add("fade"); setTimeout(() => { i = (i + 1) % items.length; el.textContent = items[i]; el.classList.remove("fade"); }, 350); }, 5000);
    } else ann.hidden = true;

    const b = (data.bannieres || []).filter((x) => x.actif).sort((x, y) => (x.ordre || 0) - (y.ordre || 0));
    const bh = b.map((x) => `<div class="banniere banniere-${esc(x.style || "blanc")}"><div class="banniere-icon">${esc(x.icone || "✨")}</div><div><h3>${esc(c(x, "titre"))}</h3>${c(x, "texte") ? `<p>${esc(c(x, "texte"))}</p>` : ""}</div></div>`).join("");
    $("#bannieres").innerHTML = bh;
  }

  // ---------- Catalogue ----------
  function renderCatalogue() {
    const q = recherche.trim().toLowerCase();
    const cats = (data.categories || []).filter((x) => x.actif !== false).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const visibles = (data.produits || []).filter((p) => p.actif !== false)
      .filter((p) => !q || (nomP(p) + " " + c(p, "description") + " " + p.nom + " " + (p.description || "")).toLowerCase().includes(q))
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    const dispoNow = visibles.filter((p) => p.suivre_stock && (p.stock || 0) > 0).sort((a, b) => (b.vedette ? 1 : 0) - (a.vedette ? 1 : 0));
    const vedette = !q ? dispoNow.find((p) => p.vedette) : null;
    const nbDispo = dispoNow.length;
    $("#countMob").textContent = t("n_available", { n: nbDispo });

    const sections = [];
    cats.forEach((cat) => {
      const ps = visibles.filter((p) => p.categorie_id === cat.id);
      if (ps.length) sections.push({ id: "cat-" + cat.id, nom: c(cat, "nom"), sub: c(cat, "sous_titre"), produits: ps, rows: ps.every((p) => !p.suivre_stock) });
    });
    const orphelins = visibles.filter((p) => !cats.some((x) => x.id === p.categorie_id));
    if (orphelins.length) sections.push({ id: "autres", nom: t("others"), produits: orphelins });

    const navHtml = sections.map((s, i) => `<a href="#${s.id}" data-target="${s.id}"${i === 0 ? ' class="active"' : ""}>${esc(s.nom)}</a>`).join("");
    $("#catnav").innerHTML = navHtml;

    const main = $("#catalogue");
    if (!sections.length) { main.innerHTML = `<p class="empty">${q ? esc(t("no_match", { q: recherche })) : esc(t("catalogue_soon"))}</p>`; return; }
    main.innerHTML = `<div class="head-count"><h2>${esc(t("n_available", { n: nbDispo }))}</h2></div>${vedette ? featuredCard(vedette) : ""}` + sections.map((s, i) => {
      const avail = s.produits.filter(dispo), sold = s.produits.filter((p) => !dispo(p));
      return `<section class="section${i === 0 ? " first" : ""}" id="${s.id}">
        <div class="section-head"><h2>${esc(s.nom)}</h2>${s.sub ? `<p>${esc(s.sub)}</p>` : ""}</div>
        ${s.rows ? `<div class="rows">${avail.map(rowItem).join("")}</div>` : avail.length ? `<div class="grid">${avail.map((p) => carte(p, p === vedette)).join("")}</div>` : ""}
        ${sold.length ? `<details class="soldout"><summary>${esc(t("soldout_n", { n: sold.length }))}</summary><div class="grid">${sold.map((p) => carte(p)).join("")}</div></details>` : ""}
      </section>`;
    }).join("");
  }

  function actionHtml(p, size = "") {
    if (!dispo(p)) return notifyLink(p);
    const q = cart[p.id] || 0;
    return q > 0
      ? `<span class="stepper ${size}"><button data-moins="${p.id}" aria-label="${esc(t("less"))}">−</button><span class="num">${q}</span><button data-plus="${p.id}" aria-label="${esc(t("more"))}">+</button></span>`
      : `<button class="plus" data-plus="${p.id}" aria-label="${esc(t("add_named", { name: nomP(p) }))}">+</button>`;
  }
  function carte(p, isFeatured = false) {
    return `<article class="card${dispo(p) ? "" : " epuise"}${isFeatured ? " is-featured" : ""}" data-id="${p.id}">
      ${photoHtml(p)}
      <div class="card-body">
        <div class="card-title" data-open="${p.id}">${esc(nomP(p))}</div>
        ${c(p, "description") ? `<p class="card-desc">${esc(c(p, "description"))}</p>` : ""}
        <div class="card-foot">${priceHtml(p.prix, p.ancien_prix)}${actionHtml(p)}</div>
      </div>
    </article>`;
  }
  function featuredCard(p) {
    const q = cart[p.id] || 0;
    const action = q > 0 ? actionHtml(p) : `<button class="btn btn-ink btn-sm" data-plus="${p.id}">${esc(t("add"))}</button>`;
    return `<article class="featured" data-id="${p.id}">
      ${photoHtml(p)}
      <div class="featured-body">
        <div class="row"><h3 data-open="${p.id}">${esc(nomP(p))}</h3>${priceHtml(p.prix, p.ancien_prix)}</div>
        ${c(p, "description") ? `<p>${esc(c(p, "description"))}</p>` : ""}
        <div class="foot"><span class="stock-inline ${stockKind(p)}">${esc(stockTxt(p))}</span>${action}</div>
      </div>
    </article>`;
  }
  function rowItem(p) {
    return `<div class="row-item" data-id="${p.id}">
      <div class="n" data-open="${p.id}"><b>${esc(nomP(p))}</b>${c(p, "description") ? `<small>${esc(c(p, "description"))}</small>` : ""}</div>
      <div class="a">${priceHtml(p.prix, p.ancien_prix)}${actionHtml(p)}</div>
    </div>`;
  }

  // ---------- Panier ----------
  function addToCart(id, n = 1) {
    const p = produit(id);
    if (!p || !dispo(p)) { toast(t("toast_out"), true); return; }
    const cur = cart[id] || 0, max = stockMax(p);
    if (cur + n > max) { toast(t("toast_max", { n: max, name: nomP(p) }), true); cart[id] = max; }
    else { cart[id] = cur + n; toast(t("toast_added", { name: nomP(p) })); }
    saveCart(); refreshCartUI(); renderCatalogue();
  }
  function removeFromCart(id, n = 1) {
    if (!cart[id]) return;
    cart[id] -= n; if (cart[id] <= 0) delete cart[id];
    saveCart(); refreshCartUI(); renderCatalogue();
  }
  const cartLines = () => Object.entries(cart).map(([id, qte]) => ({ p: produit(id), qte })).filter((l) => l.p);
  const sousTotal = () => cartLines().reduce((s, l) => s + l.p.prix * l.qte, 0);
  const seuilOffert = () => Number(data.parametres.livraison_offerte_des || 0);
  const fraisLivraison = (mode) => {
    if (mode !== "livraison" || !data.parametres.livraison_active) return 0;
    if (seuilOffert() > 0 && sousTotal() >= seuilOffert()) return 0;
    return Number(data.parametres.frais_livraison || 0);
  };
  // Suggestions « Complétez votre commande » : complément de format, pièce du jour, autres catégories à petit prix, rareté
  function suggestionsHtml(lines) {
    if (!lines.length || lines.length >= 4) return "";
    const inCart = new Set(lines.map((l) => l.p.id)), catsIn = new Set(lines.map((l) => l.p.categorie_id));
    const pool = data.produits.filter((p) => p.actif !== false && dispo(p) && !inCart.has(p.id));
    const picks = [];
    const push = (p) => { if (p && !picks.includes(p) && picks.length < 3) picks.push(p); };
    lines.forEach((l) => { const suf = (String(l.p.nom).split(" — ")[1] || "").trim(); if (suf) pool.filter((p) => p.categorie_id === l.p.categorie_id && p.prix <= 5 && String(p.nom).endsWith("— " + suf)).forEach(push); });
    pool.filter((p) => p.vedette).forEach(push);
    // Autres catégories à petit prix (les suppléments à moins de 5 DH ne s'affichent qu'avec leur glace, règle 1)
    pool.filter((p) => !catsIn.has(p.categorie_id) && p.prix <= 15 && p.prix > 5).sort((a, b) => a.prix - b.prix).forEach(push);
    pool.filter((p) => stockKind(p) === "warn" && p.prix > 5).forEach(push);
    if (!picks.length) return "";
    return `<div class="suggest"><div class="eyebrow">${esc(t("complete_order"))}</div>${picks.map((p) => `<div class="suggest-item"><div class="n" data-open="${p.id}"><b>${esc(nomP(p))}</b><small class="${stockKind(p)}">${esc(stockTxt(p))}</small></div><div class="a">${priceHtml(p.prix)}${actionHtml(p)}</div></div>`).join("")}</div>`;
  }

  function refreshCartUI() {
    const n = cartLines().reduce((s, l) => s + l.qte, 0);
    $("#cartCount").textContent = n;
    $("#cartFabTotal").textContent = n ? money(sousTotal()) : "";
    $("#cartN").textContent = n ? t("items_count", { n }) : "";
    $("#cartFab").classList.toggle("hidden", n === 0);
    if ($("#drawer").classList.contains("open")) renderDrawer();
  }

  // ---------- GPS ----------
  const mapsUrl = (g) => `https://maps.google.com/?q=${Number(g.lat).toFixed(6)},${Number(g.lng).toFixed(6)}`;
  function gpsHtml() {
    if (gps) return `<div class="gps-ok">📍 <b>${esc(gps.manuel ? t("gps_adjusted") : t("gps_ok"))}</b> ${gps.manuel ? "" : `<small>(${esc(t("gps_precision", { m: Math.round(gps.precision || 0) }))})</small>`}<a href="${mapsUrl(gps)}" target="_blank" rel="noopener">${esc(t("gps_view"))}</a></div>
      <div class="gps-actions"><button type="button" class="btn btn-ghost btn-sm" id="gpsAdjust">🗺️ ${esc(t("gps_adjust"))}</button><button type="button" class="linkish" id="gpsRetry">${esc(t("gps_retry"))}</button></div>
      <div id="gpsMapWrap" hidden><div class="gps-map" id="gpsMap"></div><div class="gps-map-hint">${esc(t("gps_adjust_hint"))}</div></div>`;
    return `<button type="button" class="btn btn-ghost btn-block" id="gpsBtn">📍 ${esc(t("share_gps"))}</button>`;
  }
  // Carte Leaflet chargée à la demande (OpenStreetMap, gratuit)
  let leafletReady = null;
  function loadLeaflet() {
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((res, rej) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const js = document.createElement("script"); js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; js.onload = res; js.onerror = rej; document.head.appendChild(js);
    });
    return leafletReady;
  }
  async function ouvrirCarte() {
    const wrap = $("#gpsMapWrap"); if (!wrap || !gps) return;
    wrap.hidden = false;
    try { await loadLeaflet(); } catch { toast(t("gps_err"), true); return; }
    const map = window.L.map("gpsMap", { zoomControl: true }).setView([gps.lat, gps.lng], 18);
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const marker = window.L.marker([gps.lat, gps.lng], { draggable: true }).addTo(map);
    const maj = (ll) => { gps = { lat: ll.lat, lng: ll.lng, precision: 0, manuel: true }; const ok = $("#gpsBloc .gps-ok"); if (ok) ok.innerHTML = `📍 <b>${esc(t("gps_adjusted"))}</b><a href="${mapsUrl(gps)}" target="_blank" rel="noopener">${esc(t("gps_view"))}</a>`; };
    marker.on("dragend", () => maj(marker.getLatLng()));
    map.on("click", (e) => { marker.setLatLng(e.latlng); maj(e.latlng); });
    setTimeout(() => map.invalidateSize(), 100);
  }
  function demanderGps(silencieux) {
    const bloc = $("#gpsBloc"); if (!bloc) return;
    if (!navigator.geolocation) { if (!silencieux) toast(t("gps_err"), true); $("#adresseField").hidden = false; return; }
    bloc.innerHTML = `<button type="button" class="btn btn-ghost btn-block" disabled>⏳ ${esc(t("gps_locating"))}</button>`;
    navigator.geolocation.getCurrentPosition(
      (pos) => { gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }; gpsRefuse = false; saveClient({ ...clientInfo, gpsOk: true }); const b = $("#gpsBloc"); if (b) { b.innerHTML = gpsHtml(); $("#adresseField").hidden = true; wireGps(); } },
      () => { gps = null; gpsRefuse = true; const b = $("#gpsBloc"); if (b) { b.innerHTML = gpsHtml(); $("#adresseField").hidden = false; wireGps(); } if (!silencieux) toast(t("gps_err"), true); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }
  function wireGps() {
    const b = $("#gpsBtn"); if (b) b.onclick = () => demanderGps(false);
    const r = $("#gpsRetry"); if (r) r.onclick = () => demanderGps(false);
    const a = $("#gpsAdjust"); if (a) a.onclick = () => { a.disabled = true; ouvrirCarte(); };
  }

  // ---------- Tiroir ----------
  function renderDrawer() {
    const body = $("#drawerBody"), foot = $("#drawerFoot");
    if (confirmation) { renderConfirmation(); return; }
    const lines = cartLines();
    if (!lines.length) {
      body.innerHTML = `<div class="cart-empty"><div class="big">🍰</div><p>${esc(t("cart_empty"))}<br>${esc(t("cart_empty_sub"))}</p></div>`;
      foot.innerHTML = `<button class="btn btn-ghost btn-block" id="continuer">${esc(t("see_desserts"))}</button>`;
      $("#continuer").onclick = closeDrawer;
      return;
    }
    const p = data.parametres;
    const mode = clientInfo.mode || (p.livraison_active ? "" : "retrait");
    const minDate = new Date().toISOString().slice(0, 10);
    const maxDate = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    body.innerHTML = `
      <div>${lines.map((l) => `
        <div class="line">
          <div class="line-name"><b>${esc(nomP(l.p))}</b><small class="num">${esc(t("unit_price", { price: money(l.p.prix) }))}${l.p.suivre_stock ? ` · ${esc(l.p.stock - l.qte <= 1 ? t("suggest_last") : t("in_stock", { n: l.p.stock }))}` : ""}</small><button class="remove" data-remove="${l.p.id}">${esc(t("remove"))}</button></div>
          <span class="stepper"><button data-moins="${l.p.id}" aria-label="${esc(t("less"))}">−</button><span class="num">${l.qte}</span><button data-plus="${l.p.id}" aria-label="${esc(t("more"))}">+</button></span>
          <span class="line-price num">${esc(money(l.p.prix * l.qte))}</span>
        </div>`).join("")}</div>
      ${suggestionsHtml(lines)}

      <form class="form" id="formCommande" novalidate>
        <div class="eyebrow">${esc(t("your_details"))}</div>
        <div class="field"><label for="cNom">${esc(t("name"))} <span class="req">*</span></label><input id="cNom" name="nom" required placeholder="${esc(t("name_ph"))}" value="${esc(clientInfo.nom || "")}" autocomplete="name"></div>
        <div class="field"><label for="cTel">${esc(t("whatsapp_number"))} <span class="req">*</span> <small>${esc(t("whatsapp_hint"))}</small></label>
          <div class="phone-row">
            <select name="indicatif" id="cInd">${["+212", "+33", "+34", "+32", "+31", "+49", "+39", "+44", "+971", "+1"].map((i) => `<option value="${i}"${(clientInfo.indicatif || "+212") === i ? " selected" : ""}>${i}</option>`).join("")}</select>
            <input id="cTel" name="tel" type="tel" inputmode="tel" required placeholder="6 12 34 56 78" value="${esc(clientInfo.tel || "")}" autocomplete="tel-national">
          </div></div>
        <div class="eyebrow" style="margin-top:8px">${esc(t("pickup"))}</div>
        <div class="modes">
          ${p.livraison_active ? `<label><input type="radio" name="mode" value="livraison"${mode === "livraison" ? " checked" : ""}>${ICON.bike} ${esc(t("delivery"))}${Number(p.frais_livraison) ? ` · ${esc(money(p.frais_livraison))}` : ""}</label>` : ""}
          <label><input type="radio" name="mode" value="retrait"${mode === "retrait" ? " checked" : ""}>${ICON.bag} ${esc(t("takeaway"))}</label>
        </div>
        <div id="livraisonBloc"${mode === "livraison" ? "" : " hidden"}>
          <div class="gps" id="gpsBloc">${gpsHtml()}</div>
          <div class="field" style="margin-top:10px"><label for="cCompl">${esc(t("address_extra"))} <small>${esc(t("optional"))}</small></label><input id="cCompl" name="complement" value="${esc(clientInfo.complement || "")}" placeholder="${esc(t("address_ph"))}"></div>
          <div class="field" id="adresseField" style="margin-top:10px"${gps ? " hidden" : ""}><label for="cAdr">${esc(t("delivery_address"))} <span class="req">*</span></label><textarea id="cAdr" name="adresse" placeholder="${esc(t("address_ph"))}">${esc(clientInfo.adresse || "")}</textarea></div>
        </div>
        <div class="row2">
          <div class="field"><label for="cDate">${esc(t("when"))} <small>${esc(t("optional"))}</small></label><input id="cDate" name="date" type="date" min="${minDate}" max="${maxDate}"></div>
          <div class="field"><label for="cCren">${esc(t("slot"))}</label><select id="cCren" name="creneau">${CRENEAUX.map((k) => `<option value="${k}">${esc(t("slot_" + k))}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="cRem">${esc(t("remark"))} <small>${esc(t("optional"))}</small></label><input id="cRem" name="remarque" placeholder="${esc(t("remark_ph"))}"></div>
        ${c(p, "delai_texte") ? `<div class="note">${ICON.clock}<span>${esc(c(p, "delai_texte"))}</span></div>` : ""}
      </form>`;

    const fl = fraisLivraison(mode), total = sousTotal() + fl;
    const min = Number(p.commande_min || 0), sousMin = min > 0 && sousTotal() < min;
    const seuil = seuilOffert(), reste = seuil - sousTotal();
    const livraisonLigne = mode === "livraison" && p.livraison_active ? `<div><span>${esc(t("delivery"))}</span><span class="num">${fl ? esc(money(fl)) : esc(t("free_delivery"))}</span></div>` : "";
    const progress = mode === "livraison" && seuil > 0 && reste > 0 ? `<div class="progress"><div class="bar"><span style="width:${Math.round(sousTotal() / seuil * 100)}%"></span></div><small>${esc(t("free_delivery_left", { amount: money(reste) }))}</small></div>` : "";
    foot.innerHTML = `
      ${progress}
      <div class="totals">
        ${livraisonLigne ? `<div><span>${esc(t("subtotal"))}</span><span class="num">${esc(money(sousTotal()))}</span></div>${livraisonLigne}` : ""}
        <div class="grand"><span>${esc(t("total"))}</span><span class="num">${esc(money(total))}</span></div>
      </div>
      ${!ouvert() ? `<div class="note bad">🌙 <span><b>${esc(t("closed_now"))}</b> ${esc(c(p, "message_ferme"))}</span></div>` : ""}
      ${sousMin ? `<div class="note">ℹ️ <span>${esc(t("min_order", { amount: money(min) }))}</span></div>` : ""}
      <button class="btn btn-ink btn-block" id="envoyer"${!ouvert() || sousMin ? " disabled" : ""}>${esc(t("reserve_cart"))}</button>
      <div class="hint">${esc(t("step1_hint"))}<br>${esc(t("footer_line"))}</div>`;

    $("#formCommande").addEventListener("change", (e) => {
      if (e.target.name === "mode") {
        const m = e.target.value; saveClient({ ...clientInfo, mode: m }); renderDrawer();
        // Position demandée automatiquement au moment où le client choisit la livraison
        if (m === "livraison" && !gps && !gpsRefuse) demanderGps(true);
      }
    });
    $("#envoyer").onclick = envoyerCommande;
    wireGps();
    // Client déjà connu qui avait accepté la localisation : on la redemande sans clic
    if (mode === "livraison" && !gps && !gpsRefuse && clientInfo.gpsOk && ouvert()) demanderGps(true);
  }

  async function envoyerCommande() {
    const f = $("#formCommande");
    const nom = f.nom.value.trim();
    const tel = f.tel.value.replace(/[^\d]/g, "");
    const indicatif = f.indicatif.value;
    const mode = f.mode.value;
    const adresse = (f.adresse?.value || "").trim();
    const complement = (f.complement?.value || "").trim();
    const date = f.date.value;
    const creneau = f.creneau ? f.creneau.value : "asap";
    const remarque = f.remarque.value.trim();
    if (!nom) return toast(t("err_name"), true), f.nom.focus();
    if (!mode) return toast(t("choose_mode"), true);
    if (tel.length < 8) return toast(t("err_phone"), true), f.tel.focus();
    if (mode === "livraison" && !gps && !adresse) { $("#adresseField").hidden = false; return toast(t("err_location"), true), f.adresse.focus(); }

    saveClient({ nom, tel: f.tel.value.trim(), indicatif, mode, adresse, complement });
    const btn = $("#envoyer"); btn.disabled = true; btn.textContent = t("saving");

    const client = {
      client_nom: nom, client_tel: indicatif + tel.replace(/^0/, ""), mode,
      adresse: mode === "livraison" ? [gps ? "" : adresse, complement].filter(Boolean).join(" · ") : "",
      gps_lat: mode === "livraison" && gps ? gps.lat : null, gps_lng: mode === "livraison" && gps ? gps.lng : null,
      date_souhaitee: date || null, creneau, remarque, langue: L.lang,
    };
    const articles = cartLines().map((l) => ({ produit_id: l.p.id, qte: l.qte }));
    try {
      const res = await api.passerCommande({ client, articles });
      confirmation = { ...res, client, mode, date, creneau, remarque, heure: new Date().toISOString() };
      cart = {}; saveCart();
      saveLast({ id: res.id, numero: res.code || res.numero, msg: messageWhatsApp(confirmation), ts: Date.now(), envoyee: false });
      await recharger();
      renderDrawer();
      $("#drawerBody").scrollTop = 0;
    } catch (e) {
      const m = String(e.message || e);
      if (m.startsWith("STOCK|")) {
        const [, pnom, reste] = m.split("|");
        const pr = data.produits.find((x) => x.nom === pnom);
        toast(t("err_stock", { n: reste, name: pr ? nomP(pr) : pnom }), true);
        await recharger();
        for (const id of Object.keys(cart)) { const p = produit(id); if (p && p.suivre_stock) { cart[id] = Math.min(cart[id], p.stock || 0); if (!cart[id]) delete cart[id]; } }
        saveCart(); refreshCartUI(); renderDrawer();
      } else if (m.startsWith("INDISPONIBLE|")) {
        const pnom = m.split("|")[1]; const pr = data.produits.find((x) => x.nom === pnom);
        toast(t("err_unavailable", { name: pr ? nomP(pr) : pnom }), true);
        await recharger(); renderDrawer();
      } else if (m.startsWith("MINIMUM|")) {
        toast(t("min_order", { amount: money(Number(m.split("|")[1]) || 0) }), true); await recharger(); renderDrawer();
      } else if (m.startsWith("FERME")) {
        toast(t("err_closed"), true); await recharger(); renderDrawer();
      } else {
        console.error(e); toast(t("err_generic"), true); renderDrawer();
      }
    }
  }

  // Message WhatsApp : en français pour le pâtissier, noms de produits en français, langue du client indiquée.
  function messageWhatsApp(cf) {
    const fmt = (n) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} DH`;
    const ref = cf.code || cf.numero;
    const lignes = cf.articles.map((l) => `- ${l.qte} x ${l.nom} : ${fmt(l.prix * l.qte)}`).join("\n");
    const fl = fraisLivraison(cf.mode);
    const dateFr = cf.date ? new Date(cf.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "aujourd'hui";
    const quand = new Date(cf.heure || Date.now()).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const langue = L.LANGS[L.lang] ? L.LANGS[L.lang].nom : L.lang;
    return [
      `*COMMANDE ${shopName().toUpperCase()} n° ${ref}*`,
      `Passee sur le site le ${quand}`,
      ``,
      `Client : ${cf.client.client_nom} - ${cf.client.client_tel}`,
      cf.mode === "livraison" ? (cf.client.gps_lat ? `Livraison (position GPS) : ${mapsUrl({ lat: cf.client.gps_lat, lng: cf.client.gps_lng })}` : `Livraison`) : `A emporter`,
      cf.mode === "livraison" && cf.client.adresse ? `Adresse / complement : ${cf.client.adresse}` : null,
      `Pour : ${dateFr} - ${CRENEAU_FR[cf.creneau] || CRENEAU_FR.asap}`,
      L.lang !== "fr" ? `Langue du client : ${langue}` : null,
      ``,
      lignes,
      fl ? `- Livraison : ${fmt(fl)}` : (cf.mode === "livraison" ? `- Livraison offerte` : null),
      ``,
      `*TOTAL : ${fmt(cf.total)}* (a regler a la reception)`,
      cf.remarque ? `Remarque : ${cf.remarque}` : null,
      ``,
      `Stock reserve. Ouvrir la commande : ${location.origin}${location.pathname.replace(/[^/]*$/, "")}admin.html#cmd=${ref}`,
    ].filter((x) => x !== null).join("\n");
  }

  function renderConfirmation() {
    const cf = confirmation;
    const msg = messageWhatsApp(cf);
    const url = "https://wa.me/" + String(data.parametres.whatsapp || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(msg);
    $("#drawerBody").innerHTML = `
      <div class="confirm">
        <div class="check">✓</div>
        <div class="eyebrow">${esc(t("order_no", { n: cf.code || cf.numero }))}</div>
        <h3>${esc(t("stock_reserved_a"))} <em>${esc(t("stock_reserved_b"))}</em></h3>
        <p>${esc(t("confirm_text", { shop: shopName() }))}</p>
        ${L.lang !== "fr" ? `<p><small>${esc(t("confirm_lang_note"))}</small></p>` : ""}
        <div class="recap" dir="ltr">${esc(msg).replace(/\*/g, "")}</div>
        <div class="grazie">${esc(t("grazie"))}</div>
      </div>`;
    $("#drawerFoot").innerHTML = `
      <div class="eyebrow" style="text-align:center">${esc(t("step2"))}</div>
      <a class="btn btn-wa btn-block" href="${url}" target="_blank" rel="noopener" id="waLink">${ICON.wa} ${esc(t("send_on_whatsapp"))}</a>
      <div class="hint">${esc(t("pay_on_delivery", { amount: money(cf.total) }))}</div>
      <button class="linkish" id="nouvelle">${esc(t("back_to_shop"))}</button>`;
    $("#nouvelle").onclick = () => { confirmation = null; closeDrawer(); };
    $("#waLink").onclick = () => { marquerEnvoyee(cf.id); setTimeout(() => toast(t("thanks", { shop: shopName() })), 500); };
    setTimeout(() => $("#waLink")?.focus(), 300);
  }

  function marquerEnvoyee(id) {
    const last = loadLast(); if (last && last.id === id) { last.envoyee = true; saveLast(last); }
    renderPending();
    if (api.marquerEnvoyee) api.marquerEnvoyee(id).catch(() => {});
  }
  // Commande réservée mais récapitulatif jamais envoyé (rechargement, retour depuis WhatsApp) : bandeau de relance
  function renderPending() {
    const el = $("#pendingBanner"); if (!el) return;
    const last = loadLast();
    if (!last || last.envoyee || Date.now() - last.ts > 24 * 3600e3) { el.hidden = true; return; }
    const url = "https://wa.me/" + waNum() + "?text=" + encodeURIComponent(last.msg);
    el.hidden = false;
    el.innerHTML = `<span class="ic">⏳</span><div><b>${esc(t("pending_order", { n: last.numero }))}</b><span>${esc(t("step2"))}</span></div><a class="btn btn-wa btn-sm" href="${url}" target="_blank" rel="noopener" id="pendingWa">${esc(t("send_on_whatsapp"))}</a><button class="linkish" id="pendingDismiss">${esc(t("dismiss"))}</button>`;
    $("#pendingWa").onclick = () => marquerEnvoyee(last.id);
    $("#pendingDismiss").onclick = () => { saveLast(null); renderPending(); };
  }
  function openDrawer() { $("#drawer").classList.add("open"); $("#overlay").classList.add("open"); renderDrawer(); document.body.style.overflow = "hidden"; }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#overlay").classList.remove("open"); document.body.style.overflow = ""; refreshCartUI(); }

  // ---------- Fiche produit ----------
  let modalQty = 1;
  function openModal(id) {
    const p = produit(id); if (!p) return;
    modalQty = 1;
    const ok = dispo(p);
    $("#modalCard").innerHTML = `
      <button class="modal-close" id="modalClose" aria-label="${esc(t("close"))}">×</button>
      ${photoHtml(p).replace('data-open="' + p.id + '"', "")}
      <div class="modal-body">
        <span class="stock-inline ${stockKind(p)}">${esc(stockTxt(p))}</span>
        <div class="row"><h3>${esc(nomP(p))}</h3>${priceHtml(p.prix, p.ancien_prix)}</div>
        ${c(p, "description") ? `<p>${esc(c(p, "description"))}</p>` : ""}
        ${c(p, "allergenes") ? `<div class="allergenes"><b>${esc(t("allergens"))}</b> ${esc(c(p, "allergenes"))}</div>` : ""}
        <div class="modal-foot">
          <span class="stepper lg"><button id="mMoins" aria-label="${esc(t("less"))}">−</button><span id="mQty" class="num">1</span><button id="mPlus" aria-label="${esc(t("more"))}">+</button></span>
          <button class="btn btn-ink" id="mAdd"${ok ? "" : " disabled"}>${ok ? `${esc(t("add"))} · <span class="num" id="mTotal">${esc(money(p.prix))}</span>` : esc(t("out_today"))}</button>
        </div>
      </div>`;
    $("#modal").classList.add("open");
    const upd = () => { $("#mQty").textContent = modalQty; const el = $("#mTotal"); if (el) el.textContent = money(p.prix * modalQty); };
    $("#mMoins").onclick = () => { modalQty = Math.max(1, modalQty - 1); upd(); };
    $("#mPlus").onclick = () => { const max = Math.max(1, stockMax(p) - (cart[p.id] || 0)); if (modalQty >= max) { toast(t("max_stock", { n: stockMax(p) }), true); return; } modalQty++; upd(); };
    $("#mAdd").onclick = () => { addToCart(p.id, modalQty); closeModal(); };
    $("#modalClose").onclick = closeModal;
  }
  function closeModal() { $("#modal").classList.remove("open"); }

  // ---------- Événements ----------
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-plus],[data-moins],[data-remove],[data-open],[data-target]");
    if (!el) return;
    if (el.dataset.plus) { e.preventDefault(); addToCart(el.dataset.plus); }
    else if (el.dataset.moins) { e.preventDefault(); removeFromCart(el.dataset.moins); }
    else if (el.dataset.remove) removeFromCart(el.dataset.remove, 999);
    else if (el.dataset.open) openModal(el.dataset.open);
    else if (el.dataset.target) {
      e.preventDefault();
      $$("[data-target]").forEach((a) => a.classList.toggle("active", a.dataset.target === el.dataset.target));
      document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("#cartFab").onclick = openDrawer;
  $("#closeDrawer").onclick = closeDrawer;
  $("#overlay").onclick = closeDrawer;
  $("#modal").addEventListener("click", (e) => { if (e.target === $("#modal")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeDrawer(); } });
  ["#recherche", "#rechercheMob"].forEach((sel) => { const el = $(sel); if (el) el.addEventListener("input", (e) => { recherche = e.target.value; $$("#recherche, #rechercheMob").forEach((o) => { if (o !== e.target) o.value = recherche; }); renderCatalogue(); }); });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) $$("[data-target]").forEach((a) => a.classList.toggle("active", a.dataset.target === en.target.id)); });
  }, { rootMargin: "-90px 0px -70% 0px" });
  const observeSections = () => $$(".section").forEach((s) => io.observe(s));

  function renderAll() { renderInfos(); renderCatalogue(); refreshCartUI(); observeSections(); renderPending(); $("#reassure").textContent = t("footer_line") + " · " + t("steps"); }

  // ---------- Chargement ----------
  async function recharger() {
    try {
      data = await api.getCatalogue();
      for (const id of Object.keys(cart)) {
        const p = produit(id);
        if (!p || p.actif === false) delete cart[id];
        else if (p.suivre_stock) { cart[id] = Math.min(cart[id], p.stock || 0); if (!cart[id]) delete cart[id]; }
      }
      saveCart();
      applyStatic(); renderAll();
    } catch (e) {
      console.error(e);
      $("#catalogue").innerHTML = `<p class="empty">${esc(t("load_error"))}</p>`;
    }
  }
  applyStatic();
  recharger();
  api.onChange(() => recharger());
  if (api.mode === "demo") console.info("Bianchi Dessert : mode démo (localStorage). Renseignez js/config.js pour activer Supabase.");
})();
