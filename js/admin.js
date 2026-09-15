// ============================================================
//  Bianchi Dessert — espace pâtissier
// ============================================================
(function () {
  const api = window.BianchiAPI;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dhTxt = (n) => `${Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} DH`;
  const STATUTS = { en_attente: "En attente", confirmee: "Confirmée", prete: "Prête", livree: "Livrée / retirée", annulee: "Annulée" };
  const CRENEAU_FR = { asap: "dès que possible", morning: "matin (10h–13h)", afternoon: "après-midi (13h–18h)", evening: "soir (18h–22h)" };
  // Messages WhatsApp pré-remplis pour répondre au client dans sa langue
  const REPONSES = {
    fr: { confirmee: "Bonjour {nom}, c'est confirmé : commande n° {n}, {total} à régler à la réception, {mode}, {creneau}. On vous écrit dès que c'est prêt. Bianchi Dessert", prete: "Bonjour {nom}, votre commande n° {n} est prête ({mode}). Prévoyez {total} en espèces. Bianchi Dessert", relance: "Bonjour {nom}, votre commande n° {n} ({total}) est réservée sur notre site. Répondez OUI pour la confirmer ; sans réponse d'ici 2 h, les pièces seront remises en vente. Bianchi Dessert", annulee: "Bonjour {nom}, votre commande n° {n} est annulée, les pièces sont remises en vente. À bientôt. Bianchi Dessert" },
    ar: { confirmee: "مرحباً {nom}، تم التأكيد: الطلب رقم {n}، {total} تُدفع عند الاستلام، {mode}، {creneau}. سنراسلك عندما يجهز. Bianchi Dessert", prete: "مرحباً {nom}، طلبك رقم {n} جاهز ({mode}). جهّز {total} نقداً. Bianchi Dessert", relance: "مرحباً {nom}، طلبك رقم {n} ({total}) محجوز على موقعنا. أجب بـ نعم للتأكيد؛ بدون رد خلال ساعتين ستعود القطع للبيع. Bianchi Dessert", annulee: "مرحباً {nom}، تم إلغاء طلبك رقم {n} وأعيدت القطع للبيع. إلى اللقاء. Bianchi Dessert" },
    en: { confirmee: "Hello {nom}, confirmed: order no. {n}, {total} to pay on delivery, {mode}, {creneau}. We'll message you when it's ready. Bianchi Dessert", prete: "Hello {nom}, your order no. {n} is ready ({mode}). Please have {total} in cash. Bianchi Dessert", relance: "Hello {nom}, your order no. {n} ({total}) is reserved on our website. Reply YES to confirm; without a reply within 2 hours the items go back on sale. Bianchi Dessert", annulee: "Hello {nom}, your order no. {n} has been cancelled and the items are back on sale. See you soon. Bianchi Dessert" },
    de: { confirmee: "Hallo {nom}, bestätigt: Bestellung Nr. {n}, {total} bei Übergabe zu zahlen, {mode}, {creneau}. Wir melden uns, sobald sie fertig ist. Bianchi Dessert", prete: "Hallo {nom}, Ihre Bestellung Nr. {n} ist fertig ({mode}). Bitte {total} in bar bereithalten. Bianchi Dessert", relance: "Hallo {nom}, Ihre Bestellung Nr. {n} ({total}) ist auf unserer Website reserviert. Antworten Sie mit JA zur Bestätigung; ohne Antwort innerhalb von 2 Stunden werden die Stücke wieder verkauft. Bianchi Dessert", annulee: "Hallo {nom}, Ihre Bestellung Nr. {n} wurde storniert, die Stücke sind wieder im Verkauf. Bis bald. Bianchi Dessert" },
    nl: { confirmee: "Hallo {nom}, bevestigd: bestelling nr. {n}, {total} te betalen bij ontvangst, {mode}, {creneau}. We berichten u zodra het klaar is. Bianchi Dessert", prete: "Hallo {nom}, uw bestelling nr. {n} is klaar ({mode}). Houd {total} contant bij de hand. Bianchi Dessert", relance: "Hallo {nom}, uw bestelling nr. {n} ({total}) is gereserveerd op onze website. Antwoord JA om te bevestigen; zonder antwoord binnen 2 uur gaan de stukken weer in de verkoop. Bianchi Dessert", annulee: "Hallo {nom}, uw bestelling nr. {n} is geannuleerd, de stukken zijn weer te koop. Tot snel. Bianchi Dessert" },
  };
  const MODE_L = { fr: { livraison: "livraison à votre adresse", retrait: "à retirer en boutique" }, ar: { livraison: "توصيل إلى عنوانك", retrait: "استلام من المحل" }, en: { livraison: "delivery to your address", retrait: "pick-up at the shop" }, de: { livraison: "Lieferung an Ihre Adresse", retrait: "Abholung im Geschäft" }, nl: { livraison: "bezorging op uw adres", retrait: "afhalen in de winkel" } };
  const CRENEAU_L = { ar: { asap: "في أقرب وقت", morning: "صباحاً", afternoon: "بعد الظهر", evening: "مساءً" }, en: { asap: "as soon as possible", morning: "morning", afternoon: "afternoon", evening: "evening" }, de: { asap: "so bald wie möglich", morning: "vormittags", afternoon: "nachmittags", evening: "abends" }, nl: { asap: "zo snel mogelijk", morning: "ochtend", afternoon: "middag", evening: "avond" } };
  function reponseWa(c, type) {
    const l = REPONSES[c.langue] ? c.langue : "fr";
    const cren = l === "fr" ? (CRENEAU_FR[c.creneau] || CRENEAU_FR.asap) : (CRENEAU_L[l]?.[c.creneau] || CRENEAU_L[l]?.asap || "");
    const txt = REPONSES[l][type].replace("{nom}", c.client_nom).replace("{n}", c.code || c.numero).replace("{creneau}", cren).replace("{total}", dhTxt(c.total)).replace("{mode}", MODE_L[l][c.mode === "livraison" ? "livraison" : "retrait"]);
    return "https://wa.me/" + String(c.client_tel || "").replace(/\D/g, "") + "?text=" + encodeURIComponent(txt);
  }
  const STYLES = { or: "Or", noir: "Noir", rouge: "Rouge", vert: "Vert", blanc: "Blanc" };
  const LANGS_TR = { ar: "العربية (arabe)", en: "English", de: "Deutsch", nl: "Nederlands" };

  // ---------- Traductions (contenus visibles par les clients) ----------
  // Champs `tr__<lang>__<champ>` dans un <details>. Vide = le français est affiché.
  function trFields(obj, fields) {
    const tr = (obj && obj.traductions) || {};
    return `<details class="tr-box"><summary>🌐 Traductions (arabe, anglais, allemand, néerlandais)</summary>
      <p class="hint">Laissez vide pour afficher le texte français. « Traduire automatiquement » propose une traduction que vous pouvez corriger.</p>
      <div class="form-actions" style="justify-content:flex-start"><button type="button" class="btn btn-ghost btn-sm" data-autotr>✨ Traduire automatiquement les champs vides</button><span class="saving" data-autotr-status></span></div>
      ${Object.entries(LANGS_TR).map(([l, nom]) => `<div class="tr-lang"><div class="tr-lang-title">${nom}</div>${fields.map((f) => `<div class="field"><label>${f.label}</label>${f.tall ? `<textarea name="tr__${l}__${f.key}" dir="${l === "ar" ? "rtl" : "ltr"}">${esc(tr[l]?.[f.key] || "")}</textarea>` : `<input name="tr__${l}__${f.key}" dir="${l === "ar" ? "rtl" : "ltr"}" value="${esc(tr[l]?.[f.key] || "")}">`}</div>`).join("")}</div>`).join("")}
    </details>`;
  }
  function readTr(form, fields) {
    const out = {};
    for (const l of Object.keys(LANGS_TR)) {
      const o = {};
      for (const f of fields) { const v = (form.elements[`tr__${l}__${f.key}`]?.value || "").trim(); if (v) o[f.key] = v; }
      if (Object.keys(o).length) out[l] = o;
    }
    return out;
  }
  // Traduction automatique gratuite (MyMemory, sans clé, ~5 000 caractères / jour). À relire avant publication.
  async function traduire(texte, vers) {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texte)}&langpair=fr|${vers}`);
    const j = await r.json();
    const t = j?.responseData?.translatedText;
    if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error("Service de traduction indisponible (limite quotidienne atteinte ?)");
    return t;
  }
  function wireAutoTr(form, fields, sourceOf) {
    const btn = form.querySelector("[data-autotr]"), st = form.querySelector("[data-autotr-status]");
    if (!btn) return;
    btn.onclick = async () => {
      btn.disabled = true; let n = 0, err = null;
      for (const l of Object.keys(LANGS_TR)) for (const f of fields) {
        const el = form.elements[`tr__${l}__${f.key}`]; const src = (sourceOf(f.key) || "").trim();
        if (!el || el.value.trim() || !src) continue;
        st.textContent = `Traduction ${LANGS_TR[l]} · ${f.label}…`;
        try { el.value = await traduire(src, l); n++; } catch (e) { err = e.message; break; }
      }
      st.textContent = err ? "⚠️ " + err : `${n} champ${n > 1 ? "s" : ""} traduit${n > 1 ? "s" : ""}, à relire.`;
      btn.disabled = false;
    };
  }

  let data = { categories: [], produits: [], bannieres: [], parametres: {} };
  let commandes = [];
  let tab = "stock";
  let filtreCmd = "actives";

  function toast(msg, err) {
    const t = $("#toast");
    t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }
  const cats = () => [...data.categories].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  const catNom = (id) => data.categories.find((c) => c.id === id)?.nom || "Sans catégorie";
  const catEmoji = (id) => data.categories.find((c) => c.id === id)?.emoji || "🍰";

  // ---------- Connexion ----------
  async function initLogin() {
    if (api.mode === "demo") { $("#emailField").hidden = true; $("#passLabel").textContent = "Code d'accès"; $("#demoHint").hidden = false; $("#pass").setAttribute("inputmode", "numeric"); $("#pass").setAttribute("autocomplete", "one-time-code"); }
    if (await api.isLoggedIn()) return enter();
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      $("#loginErr").textContent = "";
      const r = await api.login($("#email").value.trim(), $("#pass").value);
      if (r.ok) enter(); else $("#loginErr").textContent = r.error || "Connexion impossible";
    };
  }
  async function enter() {
    $("#login").hidden = true; $("#app").hidden = false;
    $("#logout").onclick = async () => { await api.logout(); location.reload(); };
    $("#tabs").onclick = (e) => { const b = e.target.closest(".tab"); if (!b) return; tab = b.dataset.tab; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === b)); render(); };
    if (location.hash.startsWith("#cmd=")) { tab = "commandes"; filtreCmd = "toutes"; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "commandes")); }
    await recharger();
    if (location.hash.startsWith("#cmd=")) document.getElementById("cmd-" + location.hash.slice(5))?.scrollIntoView({ behavior: "smooth", block: "center" });
    api.onChange(() => recharger());
  }
  async function recharger() {
    try {
      data = await api.getCatalogue();
      commandes = await api.getCommandes();
      const attente = commandes.filter((c) => c.statut === "en_attente").length;
      $("#badgeCmd").textContent = attente; $("#badgeCmd").hidden = !attente;
      render();
    } catch (e) { console.error(e); toast("Erreur de chargement : " + e.message, true); }
  }
  function modeBanner() {
    return api.mode === "demo"
      ? `<div class="mode-banner mode-demo">🧪 <span><b>Mode démo.</b> Les données restent dans ce navigateur. Configurez Supabase dans <code>js/config.js</code> pour partager les stocks avec vos clients.</span></div>`
      : `<div class="mode-banner mode-prod">✅ <span>Connecté à la base : chaque modification est visible immédiatement par vos clients.</span></div>`;
  }

  function render() {
    const page = $("#page");
    ({ stock: renderStock, commandes: renderCommandes, produits: renderProduits, promos: renderPromos, parametres: renderParametres }[tab] || renderStock)(page);
  }

  // ---------- STOCK DU JOUR ----------
  function renderStock(page) {
    const p = data.parametres;
    const groupes = cats().map((c) => ({ c, ps: data.produits.filter((x) => x.categorie_id === c.id).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)) })).filter((g) => g.ps.length);
    page.innerHTML = `
      ${modeBanner()}
      <div class="page-head"><div><h2>Stock du jour</h2><p>Mettez à jour les quantités : le site se met à jour instantanément.</p></div>
        <div class="page-actions"><button class="btn btn-ghost btn-sm" id="toutZero">Tout mettre à 0</button></div></div>
      ${commandes.filter((x) => x.statut === "en_attente" && !x.whatsapp_envoye).length ? `<div class="mode-banner mode-demo">🔔 <span><b>${commandes.filter((x) => x.statut === "en_attente" && !x.whatsapp_envoye).length} commande(s) réservée(s) sans récapitulatif WhatsApp.</b> Elles bloquent du stock : relancez ou annulez-les dans l'onglet Commandes.</span></div>` : ""}
      <p class="hint" style="margin:-6px 0 14px">★ = pièce mise en avant en haut du site (« vitrine du jour »). Indépendant des étiquettes promo.</p>
      <label class="switch big" style="margin-bottom:16px"><div><b>Accepter les commandes</b><small>${p.commandes_ouvertes !== false ? "Les clients peuvent commander." : "Le bouton de commande est désactivé sur le site."}</small></div><input type="checkbox" id="swOuvert"${p.commandes_ouvertes !== false ? " checked" : ""}><span class="sw"></span></label>
      ${groupes.map((g) => `
        <div class="stock-group">
          <div class="stock-group-head"><span>${esc(g.c.emoji || "")}</span><h3>${esc(g.c.nom)}</h3><small>${g.ps.filter((x) => x.suivre_stock && (x.stock || 0) > 0).length} dispo</small></div>
          ${g.ps.map((x) => `
            <div class="stock-row${x.actif === false ? " inactif" : ""}" data-id="${x.id}">
              <button class="star${x.vedette ? " on" : ""}" data-vedette="${x.id}" title="${x.vedette ? "Retirer de la vitrine du jour" : "Mettre en avant (vitrine du jour)"}" aria-label="Mettre en avant">${x.vedette ? "★" : "☆"}</button>
              <div class="stock-name"><b>${esc(x.nom)}</b><small class="num">${dhTxt(x.prix)}</small>${x.actif === false ? `<span class="pill pill-line">Masqué</span>` : ""}${!x.suivre_stock ? `<span class="pill pill-good">Sur commande</span>` : (x.stock || 0) <= 0 ? `<span class="pill pill-bad">Épuisé</span>` : ""}</div>
              <span class="stepper${x.suivre_stock ? "" : " off"}"><button data-d="-1" aria-label="Moins">−</button><input type="number" min="0" value="${x.suivre_stock ? (x.stock || 0) : ""}" aria-label="Stock"><button data-d="1" aria-label="Plus">+</button></span>
              <button class="zero" title="Mettre à 0"${x.suivre_stock ? "" : " disabled"}>0</button>
            </div>`).join("")}
        </div>`).join("")}
      ${!groupes.length ? `<p class="empty">Aucun produit. Ajoutez-en dans l'onglet Produits.</p>` : ""}`;

    $("#swOuvert").onchange = async (e) => { await api.saveParametres({ ...p, commandes_ouvertes: e.target.checked }); toast(e.target.checked ? "Commandes ouvertes" : "Commandes fermées"); recharger(); };
    $("#toutZero").onclick = async () => {
      if (!confirm("Mettre le stock de tous les produits suivis à 0 ?")) return;
      for (const x of data.produits) if (x.suivre_stock && (x.stock || 0) !== 0) await api.setStock(x.id, 0);
      toast("Tous les stocks sont à 0"); recharger();
    };
    page.querySelectorAll("[data-vedette]").forEach((b) => b.onclick = async () => {
      const x = data.produits.find((y) => y.id === b.dataset.vedette);
      try { await api.setVedette(x.id, !x.vedette); toast(x.vedette ? "Retiré de la vitrine du jour" : `« ${x.nom} » mis en avant`); recharger(); } catch (e) { toast(e.message, true); }
    });
    page.querySelectorAll(".stock-row").forEach((row) => {
      const id = row.dataset.id, input = row.querySelector("input");
      const save = debounce(async (v) => { try { await api.setStock(id, v); toast("Stock enregistré"); recharger(); } catch (e) { toast(e.message, true); } }, 500);
      row.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { input.value = Math.max(0, (parseInt(input.value) || 0) + parseInt(b.dataset.d)); save(parseInt(input.value)); });
      input.onchange = () => { input.value = Math.max(0, parseInt(input.value) || 0); save(parseInt(input.value)); };
      row.querySelector(".zero").onclick = () => { input.value = 0; save(0); };
    });
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- COMMANDES ----------
  function renderCommandes(page) {
    const liste = commandes.filter((c) => filtreCmd === "toutes" ? true : filtreCmd === "actives" ? !["livree", "annulee"].includes(c.statut) : c.statut === filtreCmd);
    page.innerHTML = `
      <div class="page-head"><div><h2>Commandes</h2><p>Chaque commande a déjà réservé son stock. Annuler une commande remet les articles en stock.</p></div>
        <div class="page-actions"><button class="btn btn-ghost btn-sm" id="refreshCmd">↻ Actualiser</button></div></div>
      <div class="filters">${[["actives", "En cours"], ["en_attente", "En attente"], ["prete", "Prêtes"], ["livree", "Livrées"], ["annulee", "Annulées"], ["toutes", "Toutes"]].map(([k, l]) => `<button class="chip${filtreCmd === k ? " active" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
      <div class="list">${liste.map(commandeCard).join("") || `<p class="empty">Aucune commande ici.</p>`}</div>`;
    $("#refreshCmd").onclick = recharger;
    page.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { filtreCmd = b.dataset.f; render(); });
    page.querySelectorAll("[data-rep]").forEach((a) => a.addEventListener("click", async () => {
      try { await api.changerStatut(a.dataset.cmdId, a.dataset.rep); toast("Statut : " + STATUTS[a.dataset.rep]); setTimeout(recharger, 800); } catch (e) { toast(e.message, true); }
    }));
    page.querySelectorAll("select[data-cmd]").forEach((s) => s.onchange = async () => {
      try { await api.changerStatut(s.dataset.cmd, s.value); toast("Statut : " + STATUTS[s.value]); recharger(); } catch (e) { toast(e.message, true); }
    });
  }
  function commandeCard(c) {
    const d = new Date(c.created_at);
    const tel = String(c.client_tel || "").replace(/\D/g, "");
    const arts = Array.isArray(c.articles) ? c.articles : [];
    const dateS = c.date_souhaitee ? new Date(c.date_souhaitee + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";
    const cren = CRENEAU_FR[c.creneau] || "";
    const nonEnvoye = c.statut === "en_attente" && !c.whatsapp_envoye;
    const actions = c.statut === "en_attente" ? `<a class="btn btn-wa btn-sm" data-rep="confirmee" data-cmd-id="${c.id}" href="${reponseWa(c, "confirmee")}" target="_blank" rel="noopener">✅ Confirmer sur WhatsApp</a>${nonEnvoye ? `<a class="btn btn-ghost btn-sm" href="${reponseWa(c, "relance")}" target="_blank" rel="noopener">🔔 Relancer le client</a>${Date.now() - new Date(c.created_at).getTime() > 3600e3 ? `<a class="btn btn-danger btn-sm" data-rep="annulee" data-cmd-id="${c.id}" href="${reponseWa(c, "annulee")}" target="_blank" rel="noopener">Annuler et libérer le stock</a>` : ""}` : ""}` : c.statut === "confirmee" ? `<a class="btn btn-wa btn-sm" data-rep="prete" data-cmd-id="${c.id}" href="${reponseWa(c, "prete")}" target="_blank" rel="noopener">🍰 Prévenir : c'est prêt</a>` : "";
    const ref = c.code || c.numero;
    return `<div class="order${location.hash === "#cmd=" + ref ? " hl" : ""}" id="cmd-${ref}">
      <div class="order-head"><b>Commande n° ${esc(ref)}</b><span class="when">${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>${nonEnvoye ? `<span class="pill pill-warn" title="Le client n'a pas ouvert WhatsApp avec le récapitulatif">Récap non envoyé</span>` : ""}<span class="spacer"></span>
        <select data-cmd="${c.id}" class="st-${esc(c.statut)}">${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}"${c.statut === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="order-client"><span>👤 <b>${esc(c.client_nom)}</b></span>${c.langue && c.langue !== "fr" ? `<span title="Langue du client">🌐 ${esc(({ ar: "arabe", en: "anglais", de: "allemand", nl: "néerlandais" })[c.langue] || c.langue)}</span>` : ""}<a href="https://wa.me/${tel}" target="_blank" rel="noopener">💬 ${esc(c.client_tel)}</a><span>${c.mode === "livraison" ? "🛵 Livraison" + (c.adresse ? " : " + esc(c.adresse) : "") : "🛍️ À emporter"}</span>${c.mode === "livraison" && c.gps_lat ? `<a href="https://maps.google.com/?q=${Number(c.gps_lat).toFixed(6)},${Number(c.gps_lng).toFixed(6)}" target="_blank" rel="noopener">📍 Ouvrir la position GPS</a>` : ""}${dateS || cren ? `<span>📅 ${esc([dateS, cren].filter(Boolean).join(" · "))}</span>` : ""}</div>
      <div class="order-lines">${arts.map((l) => `<div><span>${l.qte}× ${esc(l.nom)}</span><span class="num">${dhTxt(l.prix * l.qte)}</span></div>`).join("")}<div class="tot"><span>Total</span><span class="num">${dhTxt(c.total)}</span></div></div>
      ${c.remarque ? `<div style="font-size:13px">📝 ${esc(c.remarque)}</div>` : ""}
      ${actions ? `<div class="order-actions">${actions}</div>` : ""}
    </div>`;
  }

  // ---------- PRODUITS ----------
  function renderProduits(page) {
    const groupes = cats().map((c) => ({ c, ps: data.produits.filter((x) => x.categorie_id === c.id).sort((a, b) => (a.ordre || 0) - (b.ordre || 0)) }));
    const orphelins = data.produits.filter((x) => !data.categories.some((c) => c.id === x.categorie_id));
    page.innerHTML = `
      <div class="page-head"><div><h2>Produits & catégories</h2><p>Prix, descriptions, photos, étiquettes promo.</p></div>
        <div class="page-actions"><button class="btn btn-ghost btn-sm" id="addCat">+ Catégorie</button><button class="btn btn-ink btn-sm" id="addProd">+ Produit</button></div></div>
      ${groupes.map((g) => `
        <div class="group-title">${esc(g.c.emoji || "")} ${esc(g.c.nom)} <small>${g.ps.length} produit${g.ps.length > 1 ? "s" : ""}</small><button class="icon-btn" data-editcat="${g.c.id}" title="Modifier la catégorie">✏️</button></div>
        <div class="list">${g.ps.map(produitItem).join("") || `<p class="hint" style="color:var(--muted);font-size:13px">Aucun produit dans cette catégorie.</p>`}</div>`).join("")}
      ${orphelins.length ? `<div class="group-title">Sans catégorie</div><div class="list">${orphelins.map(produitItem).join("")}</div>` : ""}`;
    $("#addProd").onclick = () => formProduit({});
    $("#addCat").onclick = () => formCategorie({});
    page.querySelectorAll("[data-editcat]").forEach((b) => b.onclick = () => formCategorie(data.categories.find((c) => c.id == b.dataset.editcat)));
    page.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => formProduit(data.produits.find((p) => p.id === b.dataset.edit)));
    page.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      const p = data.produits.find((x) => x.id === b.dataset.del);
      if (!confirm(`Supprimer « ${p.nom} » définitivement ? (Vous pouvez aussi simplement le masquer.)`)) return;
      await api.deleteProduit(p.id); toast("Produit supprimé"); recharger();
    });
    page.querySelectorAll("[data-toggle]").forEach((b) => b.onclick = async () => {
      const p = data.produits.find((x) => x.id === b.dataset.toggle);
      await api.upsertProduit({ ...p, actif: p.actif === false }); toast(p.actif === false ? "Produit visible" : "Produit masqué"); recharger();
    });
  }
  function produitItem(p) {
    return `<div class="item${p.actif === false ? " inactif" : ""}">
      <div class="item-thumb">${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : catEmoji(p.categorie_id)}</div>
      <div class="item-main"><b>${esc(p.nom)}</b><small>${esc(p.description || "")}</small>
        <div class="pills">${p.vedette ? `<span class="pill pill-ink">★ Vitrine du jour</span>` : ""}${p.promo_label ? `<span class="pill pill-gold">${esc(p.promo_label)}</span>` : ""}${p.ancien_prix ? `<span class="pill pill-line">avant ${dhTxt(p.ancien_prix)}</span>` : ""}${p.suivre_stock ? `<span class="pill ${(p.stock || 0) > 0 ? "pill-good" : "pill-bad"}">${p.stock || 0} en stock</span>` : `<span class="pill pill-line">Sur commande</span>`}${p.actif === false ? `<span class="pill pill-line">Masqué</span>` : ""}</div></div>
      <div class="item-price num">${dhTxt(p.prix)}</div>
      <div class="item-actions"><button class="icon-btn" data-toggle="${p.id}" title="${p.actif === false ? "Rendre visible" : "Masquer du site"}">${p.actif === false ? "🙈" : "👁️"}</button><button class="icon-btn" data-edit="${p.id}" title="Modifier">✏️</button><button class="icon-btn danger" data-del="${p.id}" title="Supprimer">🗑️</button></div>
    </div>`;
  }

  function openModal(html) { $("#amodalCard").innerHTML = html; $("#amodal").classList.add("open"); }
  function closeModal() { $("#amodal").classList.remove("open"); }
  $("#amodal").addEventListener("click", (e) => { if (e.target === $("#amodal")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  const PROD_TR = [{ key: "nom", label: "Nom" }, { key: "description", label: "Description", tall: true }, { key: "promo_label", label: "Étiquette promo" }, { key: "allergenes", label: "Allergènes" }];
  const CAT_TR = [{ key: "nom", label: "Nom" }, { key: "sous_titre", label: "Sous-titre" }];
  const BAN_TR = [{ key: "titre", label: "Titre" }, { key: "texte", label: "Texte", tall: true }];
  const PARAM_TR = [{ key: "horaires", label: "Horaires" }, { key: "delai_texte", label: "Délai affiché dans le panier" }, { key: "annonce", label: "Texte défilant", tall: true }, { key: "message_ferme", label: "Message quand les commandes sont fermées" }];
  function formProduit(p) {
    const isNew = !p.id;
    let imageUrl = p.image_url || "";
    openModal(`
      <h3>${isNew ? "Nouveau produit" : "Modifier le produit"}</h3>
      <form id="fp" class="panel" style="box-shadow:none;padding:0;margin:0">
        <div class="field"><label>Nom <span class="req">*</span></label><input name="nom" required value="${esc(p.nom || "")}" placeholder="Tiramisu Pistache"></div>
        <div class="row2">
          <div class="field"><label>Catégorie</label><select name="categorie_id">${cats().map((c) => `<option value="${c.id}"${p.categorie_id === c.id ? " selected" : ""}>${esc(c.emoji || "")} ${esc(c.nom)}</option>`).join("")}</select></div>
          <div class="field"><label>Ordre d'affichage</label><input name="ordre" type="number" value="${p.ordre ?? 0}"></div>
        </div>
        <div class="field"><label>Description <small>(courte)</small></label><textarea name="description" placeholder="Mascarpone et crème de pistache…">${esc(p.description || "")}</textarea></div>
        <div class="row2">
          <div class="field"><label>Prix (DH) <span class="req">*</span></label><input name="prix" type="number" step="0.5" min="0" required value="${p.prix ?? ""}"></div>
          <div class="field"><label>Ancien prix <small>(barré, facultatif)</small></label><input name="ancien_prix" type="number" step="0.5" min="0" value="${p.ancien_prix ?? ""}" placeholder="Pour afficher une réduction"></div>
        </div>
        <div class="field"><label>Allergènes <small>(facultatif · affiché dans la fiche produit seulement si rempli)</small></label><input name="allergenes" value="${esc(p.allergenes || "")}" placeholder="Gluten, lait, œufs, fruits à coque…" list="allergenesList"><datalist id="allergenesList"><option>Gluten, lait, œufs</option><option>Gluten, lait, œufs, fruits à coque</option><option>Lait, œufs</option><option>Gluten, lait, œufs, soja</option><option>Lait, fruits à coque</option></datalist></div>
        <div class="field"><label>Étiquette promo <small>(facultatif)</small></label><input name="promo_label" value="${esc(p.promo_label || "")}" placeholder="Nouveau · -20% · Best-seller · Édition limitée" list="promos"><datalist id="promos"><option>Nouveau</option><option>Best-seller</option><option>-20%</option><option>Promo</option><option>Édition limitée</option></datalist></div>
        <label class="switch"><div><b>Suivre le stock</b><small>Décoché = « sur commande », toujours commandable.</small></div><input type="checkbox" name="suivre_stock"${p.suivre_stock !== false ? " checked" : ""}><span class="sw"></span></label>
        <div class="field" id="stockField"><label>Quantité en stock</label><input name="stock" type="number" min="0" value="${p.stock ?? 0}"></div>
        <div class="field"><label>Photo</label>
          <div class="img-pick"><div class="item-thumb" id="thumb">${imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : catEmoji(p.categorie_id)}</div>
            <div class="btns"><label class="btn btn-ghost btn-sm">📷 Choisir une photo<input type="file" accept="image/*" id="imgFile" hidden></label><button type="button" class="btn btn-ghost btn-sm" id="imgUrlBtn">🔗 Coller un lien</button>${imageUrl ? `<button type="button" class="btn btn-danger btn-sm" id="imgDel">Retirer</button>` : ""}</div></div></div>
        <label class="switch"><div><b>Visible sur le site</b></div><input type="checkbox" name="actif"${p.actif !== false ? " checked" : ""}><span class="sw"></span></label>
        <label class="switch"><div><b>★ Mettre en avant</b><small>Affiché en grand dans « La vitrine du jour », en haut du site.</small></div><input type="checkbox" name="vedette"${p.vedette ? " checked" : ""}><span class="sw"></span></label>
        ${trFields(p, PROD_TR)}
        <div class="form-actions"><button type="button" class="btn btn-ghost" id="annuler">Annuler</button><button class="btn btn-ink" type="submit">Enregistrer</button></div>
      </form>`);
    const f = $("#fp");
    wireAutoTr(f, PROD_TR, (k) => ({ nom: f.nom.value, description: f.description.value, promo_label: f.promo_label.value, allergenes: f.allergenes.value })[k]);
    const setThumb = () => { $("#thumb").innerHTML = imageUrl ? `<img src="${esc(imageUrl)}" alt="">` : catEmoji(p.categorie_id); };
    const syncStock = () => { $("#stockField").hidden = !f.suivre_stock.checked; };
    syncStock(); f.suivre_stock.onchange = syncStock;
    $("#annuler").onclick = closeModal;
    $("#imgFile").onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 4 * 1024 * 1024) return toast("Photo trop lourde (max 4 Mo)", true);
      try { toast("Envoi de la photo…"); imageUrl = await api.uploadImage(await compresser(file)); setThumb(); toast("Photo ajoutée"); } catch (err) { toast("Envoi impossible : " + err.message, true); }
    };
    $("#imgUrlBtn").onclick = () => { const u = prompt("Adresse (URL) de l'image :", imageUrl); if (u !== null) { imageUrl = u.trim(); setThumb(); } };
    if ($("#imgDel")) $("#imgDel").onclick = () => { imageUrl = ""; setThumb(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const row = {
        id: p.id, nom: f.nom.value.trim(), categorie_id: Number(f.categorie_id.value), ordre: Number(f.ordre.value) || 0,
        description: f.description.value.trim(), prix: Number(f.prix.value), ancien_prix: f.ancien_prix.value ? Number(f.ancien_prix.value) : null,
        promo_label: f.promo_label.value.trim(), allergenes: f.allergenes.value.trim(), suivre_stock: f.suivre_stock.checked, stock: f.suivre_stock.checked ? Number(f.stock.value) || 0 : null,
        image_url: imageUrl, actif: f.actif.checked, vedette: f.vedette.checked, traductions: readTr(f, PROD_TR),
      };
      if (!row.nom || isNaN(row.prix)) return toast("Nom et prix obligatoires", true);
      try { await api.upsertProduit(row); toast("Produit enregistré"); closeModal(); recharger(); } catch (err) { toast(err.message, true); }
    };
  }

  // Réduit la photo (max 1200px, JPEG) avant envoi : plus rapide et gratuit en stockage
  async function compresser(file) {
    if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const max = 1200, r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  function formCategorie(c) {
    const isNew = !c.id;
    openModal(`
      <h3>${isNew ? "Nouvelle catégorie" : "Modifier la catégorie"}</h3>
      <form id="fc" class="panel" style="box-shadow:none;padding:0;margin:0">
        <div class="row2">
          <div class="field"><label>Emoji</label><input name="emoji" value="${esc(c.emoji || "")}" placeholder="🍰" maxlength="4"></div>
          <div class="field"><label>Ordre</label><input name="ordre" type="number" value="${c.ordre ?? (data.categories.length + 1)}"></div>
        </div>
        <div class="field"><label>Nom <span class="req">*</span></label><input name="nom" required value="${esc(c.nom || "")}" placeholder="Tiramisù & Mousses"></div>
        <div class="field"><label>Sous-titre <small>(facultatif)</small></label><input name="sous_titre" value="${esc(c.sous_titre || "")}" placeholder="En verrine individuelle"></div>
        <label class="switch"><div><b>Visible sur le site</b></div><input type="checkbox" name="actif"${c.actif !== false ? " checked" : ""}><span class="sw"></span></label>
        ${trFields(c, CAT_TR)}
        <div class="form-actions">${!isNew ? `<button type="button" class="btn btn-danger" id="delCat">Supprimer</button>` : ""}<button type="button" class="btn btn-ghost" id="annuler">Annuler</button><button class="btn btn-ink" type="submit">Enregistrer</button></div>
      </form>`);
    const f = $("#fc");
    wireAutoTr(f, CAT_TR, (k) => ({ nom: f.nom.value, sous_titre: f.sous_titre.value })[k]);
    $("#annuler").onclick = closeModal;
    if ($("#delCat")) $("#delCat").onclick = async () => {
      if (!confirm(`Supprimer la catégorie « ${c.nom} » ? Ses produits passeront en « Sans catégorie ».`)) return;
      await api.deleteCategorie(c.id); toast("Catégorie supprimée"); closeModal(); recharger();
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const row = { id: c.id, nom: f.nom.value.trim(), emoji: f.emoji.value.trim(), ordre: Number(f.ordre.value) || 0, sous_titre: f.sous_titre.value.trim(), actif: f.actif.checked, traductions: readTr(f, CAT_TR) };
      if (!row.nom) return toast("Le nom est obligatoire", true);
      try { await api.upsertCategorie(row); toast("Catégorie enregistrée"); closeModal(); recharger(); } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- PROMOTIONS ----------
  function renderPromos(page) {
    const p = data.parametres;
    const bs = [...data.bannieres].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    page.innerHTML = `
      <div class="page-head"><div><h2>Promotions</h2><p>Bannières en haut du site et texte défilant.</p></div>
        <div class="page-actions"><button class="btn btn-ink btn-sm" id="addBan">+ Bannière</button></div></div>
      <div class="panel">
        <h3>Texte défilant</h3>
        <p class="hint">Affiché sous les infos du magasin. Séparez les messages par « · ». Laissez vide pour le masquer.</p>
        <div class="field"><textarea id="annonce" placeholder="Livraison offerte dès 150 DH · Nouveau : tiramisu pistache">${esc(p.annonce || "")}</textarea></div>
        <div class="form-actions"><button class="btn btn-ink" id="saveAnnonce">Enregistrer</button></div>
      </div>
      <h3 style="font-size:22px;margin:6px 0 10px">Bannières</h3>
      <div class="list">${bs.map((b) => `
        <div class="item${b.actif === false ? " inactif" : ""}">
          <div class="item-main"><div class="banniere-preview banniere-${esc(b.style || "or")}"><span style="font-size:24px">${esc(b.icone || "✨")}</span><div><h4>${esc(b.titre)}</h4>${b.texte ? `<p>${esc(b.texte)}</p>` : ""}</div></div></div>
          <div class="item-actions"><button class="icon-btn" data-btoggle="${b.id}" title="${b.actif === false ? "Activer" : "Désactiver"}">${b.actif === false ? "🙈" : "👁️"}</button><button class="icon-btn" data-bedit="${b.id}">✏️</button><button class="icon-btn danger" data-bdel="${b.id}">🗑️</button></div>
        </div>`).join("") || `<p class="empty">Aucune bannière. Créez-en une pour mettre une offre en avant.</p>`}</div>`;
    $("#saveAnnonce").onclick = async () => { await api.saveParametres({ ...p, annonce: $("#annonce").value.trim() }); toast("Texte défilant enregistré"); recharger(); };
    $("#addBan").onclick = () => formBanniere({});
    page.querySelectorAll("[data-bedit]").forEach((b) => b.onclick = () => formBanniere(data.bannieres.find((x) => x.id === b.dataset.bedit)));
    page.querySelectorAll("[data-bdel]").forEach((b) => b.onclick = async () => { if (!confirm("Supprimer cette bannière ?")) return; await api.deleteBanniere(b.dataset.bdel); toast("Bannière supprimée"); recharger(); });
    page.querySelectorAll("[data-btoggle]").forEach((b) => b.onclick = async () => { const x = data.bannieres.find((y) => y.id === b.dataset.btoggle); await api.upsertBanniere({ ...x, actif: x.actif === false }); recharger(); });
  }
  function formBanniere(b) {
    openModal(`
      <h3>${b.id ? "Modifier la bannière" : "Nouvelle bannière"}</h3>
      <form id="fb" class="panel" style="box-shadow:none;padding:0;margin:0">
        <div class="row2">
          <div class="field"><label>Icône (emoji)</label><input name="icone" value="${esc(b.icone || "✨")}" maxlength="4"></div>
          <div class="field"><label>Couleur</label><select name="style">${Object.entries(STYLES).map(([k, l]) => `<option value="${k}"${(b.style || "or") === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>Titre <span class="req">*</span></label><input name="titre" required value="${esc(b.titre || "")}" placeholder="Offre du week-end"></div>
        <div class="field"><label>Texte</label><textarea name="texte" placeholder="3 cookies achetés = le 4ᵉ offert">${esc(b.texte || "")}</textarea></div>
        <div class="field"><label>Ordre</label><input name="ordre" type="number" value="${b.ordre ?? (data.bannieres.length + 1)}"></div>
        <label class="switch"><div><b>Active</b></div><input type="checkbox" name="actif"${b.actif !== false ? " checked" : ""}><span class="sw"></span></label>
        ${trFields(b, BAN_TR)}
        <div class="form-actions"><button type="button" class="btn btn-ghost" id="annuler">Annuler</button><button class="btn btn-ink" type="submit">Enregistrer</button></div>
      </form>`);
    const f = $("#fb");
    wireAutoTr(f, BAN_TR, (k) => ({ titre: f.titre.value, texte: f.texte.value })[k]);
    $("#annuler").onclick = closeModal;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const row = { id: b.id, icone: f.icone.value.trim(), style: f.style.value, titre: f.titre.value.trim(), texte: f.texte.value.trim(), ordre: Number(f.ordre.value) || 0, actif: f.actif.checked, traductions: readTr(f, BAN_TR) };
      if (!row.titre) return toast("Le titre est obligatoire", true);
      try { await api.upsertBanniere(row); toast("Bannière enregistrée"); closeModal(); recharger(); } catch (err) { toast(err.message, true); }
    };
  }

  // ---------- PARAMÈTRES ----------
  function renderParametres(page) {
    const p = data.parametres;
    page.innerHTML = `
      <div class="page-head"><div><h2>Paramètres</h2><p>Informations affichées sur le site et règles de commande.</p></div></div>
      <form id="fparam">
        <div class="panel">
          <h3>Boutique</h3>
          <div class="row2">
            <div class="field"><label>Nom</label><input name="nom" value="${esc(p.nom || "")}"></div>
            <div class="field"><label>Slogan</label><input name="slogan" value="${esc(p.slogan || "")}"></div>
          </div>
          <div class="field"><label>Numéro WhatsApp <small>(format international sans +, ex. 2126XXXXXXXX)</small></label><input name="whatsapp" inputmode="numeric" value="${esc(p.whatsapp || "")}"></div>
          <div class="row2">
            <div class="field"><label>Adresse / ville</label><input name="adresse" value="${esc(p.adresse || "")}"></div>
            <div class="field"><label>Lien Google Maps <small>(facultatif)</small></label><input name="lien_maps" value="${esc(p.lien_maps || "")}" placeholder="https://maps.app.goo.gl/…"></div>
          </div>
          <div class="row2">
            <div class="field"><label>Horaires <small>(texte libre)</small></label><input name="horaires" value="${esc(p.horaires || "")}" placeholder="Tous les jours · 10h – 22h"></div>
            <div class="field"><label>Délai affiché dans le panier</label><input name="delai_texte" value="${esc(p.delai_texte || "")}" placeholder="Prêt en 24h"></div>
          </div>
        </div>
        <div class="panel">
          <h3>Commandes</h3>
          <label class="switch"><div><b>Livraison proposée</b><small>Sinon, uniquement à emporter.</small></div><input type="checkbox" name="livraison_active"${p.livraison_active !== false ? " checked" : ""}><span class="sw"></span></label>
          <div class="row2">
            <div class="field"><label>Frais de livraison (DH)</label><input name="frais_livraison" type="number" min="0" step="0.5" value="${p.frais_livraison ?? 0}"></div>
            <div class="field"><label>Commande minimum (DH) <small>(0 = aucun)</small></label><input name="commande_min" type="number" min="0" step="0.5" value="${p.commande_min ?? 0}"></div>
          </div>
          <div class="field"><label>Livraison offerte à partir de (DH) <small>(0 = jamais · le panier affiche « plus que X DH pour la livraison offerte »)</small></label><input name="livraison_offerte_des" type="number" min="0" step="0.5" value="${p.livraison_offerte_des ?? 0}"></div>
          <div class="field"><label>Message quand les commandes sont fermées</label><input name="message_ferme" value="${esc(p.message_ferme || "")}"></div>
        </div>
        <div class="panel">
          <h3>Langues</h3>
          <p class="hint">Le site est proposé en français, arabe, anglais, allemand et néerlandais. Les textes de l'interface sont déjà traduits ; ici, traduisez vos propres textes. Les commandes WhatsApp vous arrivent toujours en français, avec la langue du client indiquée.</p>
          ${trFields(p, PARAM_TR)}
        </div>
        <div class="form-actions"><button class="btn btn-ink" type="submit">Enregistrer les paramètres</button></div>
      </form>
      ${api.mode === "demo" ? `<div class="panel" style="margin-top:20px"><h3>Mode démo</h3><p class="hint">Remet le catalogue de démonstration d'origine (produits, stocks, commandes).</p><div class="form-actions"><button class="btn btn-danger" id="resetDemo">Réinitialiser la démo</button></div></div>` : ""}`;
    const f = $("#fparam");
    wireAutoTr(f, PARAM_TR, (k) => f.elements[k]?.value);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const row = {
        ...p, nom: f.nom.value.trim(), slogan: f.slogan.value.trim(), whatsapp: f.whatsapp.value.replace(/\D/g, ""), adresse: f.adresse.value.trim(), lien_maps: f.lien_maps.value.trim(),
        horaires: f.horaires.value.trim(), delai_texte: f.delai_texte.value.trim(), livraison_active: f.livraison_active.checked,
        frais_livraison: Number(f.frais_livraison.value) || 0, commande_min: Number(f.commande_min.value) || 0, livraison_offerte_des: Number(f.livraison_offerte_des.value) || 0, message_ferme: f.message_ferme.value.trim(),
        traductions: readTr(f, PARAM_TR),
      };
      try { await api.saveParametres(row); toast("Paramètres enregistrés"); recharger(); } catch (err) { toast(err.message, true); }
    };
    if ($("#resetDemo")) $("#resetDemo").onclick = async () => { if (confirm("Réinitialiser toutes les données de démo ?")) { await api.resetDemo(); toast("Démo réinitialisée"); recharger(); } };
  }

  initLogin();
})();
