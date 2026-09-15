// ============================================================
//  Couche de données Bianchi Dessert
//  Une seule interface (window.BianchiAPI), deux implémentations :
//   - Supabase  : production, données partagées entre tous les clients
//   - Démo      : localStorage, pour tester sans rien configurer
// ============================================================
(function () {
  const cfg = window.BIANCHI_CONFIG || {};
  const useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ----------------------------------------------------------
  //  MODE DÉMO (localStorage)
  // ----------------------------------------------------------
  const LS_KEY = "bianchi_demo_v1";
  function loadLocal() {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) return appliquerTraductions(JSON.parse(s));
    } catch (e) {}
    return appliquerTraductions(clone(window.BIANCHI_DEMO));
  }
  // Ajoute le champ `traductions` aux contenus de démo à partir de catalogue-traductions.js
  function appliquerTraductions(d) {
    const TR = window.BIANCHI_TRADUCTIONS || {};
    (d.categories || []).forEach((c) => { if (!c.traductions && TR.categories && TR.categories[c.nom]) c.traductions = clone(TR.categories[c.nom]); });
    (d.produits || []).forEach((p) => { if (!p.traductions && TR.produits && TR.produits[p.nom]) p.traductions = clone(TR.produits[p.nom]); });
    (d.bannieres || []).forEach((b) => { if (!b.traductions && TR.bannieres && TR.bannieres[b.titre]) b.traductions = clone(TR.bannieres[b.titre]); });
    if (d.parametres && !d.parametres.traductions && TR.parametres) d.parametres.traductions = clone(TR.parametres);
    // Nouveaux paramètres ajoutés après une première utilisation de la démo : valeurs par défaut
    d.parametres = { ...clone(window.BIANCHI_DEMO.parametres), ...(d.parametres || {}) };
    return d;
  }
  function saveLocal(d) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (e) {}
    window.dispatchEvent(new CustomEvent("bianchi:change"));
  }

  const demo = {
    mode: "demo",
    async getCatalogue() {
      const d = loadLocal();
      return { categories: d.categories, produits: d.produits, bannieres: d.bannieres, parametres: d.parametres };
    },
    onChange(cb) {
      const h = (e) => { if (!e.key || e.key === LS_KEY) cb(); };
      window.addEventListener("storage", h);
      window.addEventListener("bianchi:change", h);
      return () => { window.removeEventListener("storage", h); window.removeEventListener("bianchi:change", h); };
    },
    async passerCommande({ client, articles }) {
      const d = loadLocal();
      let total = 0;
      const lignes = [];
      for (const a of articles) {
        const p = d.produits.find((x) => x.id === a.produit_id);
        if (!p || !p.actif) throw new Error("INDISPONIBLE|" + (p ? p.nom : "Produit"));
        if (p.suivre_stock && (p.stock || 0) < a.qte) throw new Error("STOCK|" + p.nom + "|" + (p.stock || 0));
        lignes.push({ produit_id: p.id, nom: p.nom, prix: p.prix, qte: a.qte });
        total += p.prix * a.qte;
      }
      for (const l of lignes) {
        const p = d.produits.find((x) => x.id === l.produit_id);
        if (p.suivre_stock) p.stock = (p.stock || 0) - l.qte;
      }
      const seuil = Number(d.parametres.livraison_offerte_des || 0);
      if (client.mode === "livraison" && d.parametres.livraison_active && !(seuil > 0 && total >= seuil)) total += Number(d.parametres.frais_livraison || 0);
      const numero = (d.commandes.reduce((m, c) => Math.max(m, c.numero || 0), 0) || 0) + 1;
      const commande = {
        id: uid(), numero, ...client, articles: lignes, total, statut: "en_attente", whatsapp_envoye: false,
        created_at: new Date().toISOString(),
      };
      d.commandes.unshift(commande);
      saveLocal(d);
      return { id: commande.id, numero, total, articles: lignes };
    },

    async marquerEnvoyee(id) { const d = loadLocal(); const cmd = d.commandes.find((x) => x.id === id); if (cmd) { cmd.whatsapp_envoye = true; saveLocal(d); } },

    // ---- Admin ----
    async login(email, motDePasse) {
      if (motDePasse === (cfg.DEMO_PIN || "1234")) { sessionStorage.setItem("bianchi_admin", "1"); return { ok: true }; }
      return { ok: false, error: "Code incorrect (mode démo : " + (cfg.DEMO_PIN || "1234") + ")" };
    },
    async logout() { sessionStorage.removeItem("bianchi_admin"); },
    async isLoggedIn() { return sessionStorage.getItem("bianchi_admin") === "1"; },
    async upsertProduit(p) {
      const d = loadLocal();
      const i = d.produits.findIndex((x) => x.id === p.id);
      if (i >= 0) d.produits[i] = { ...d.produits[i], ...p }; else d.produits.push({ ...p, id: p.id || uid() });
      saveLocal(d);
    },
    async setStock(id, stock) {
      const d = loadLocal();
      const p = d.produits.find((x) => x.id === id);
      if (p) { p.stock = stock; saveLocal(d); }
    },
    async setVedette(id, vedette) {
      const d = loadLocal();
      const p = d.produits.find((x) => x.id === id);
      if (p) { p.vedette = !!vedette; saveLocal(d); }
    },
    async deleteProduit(id) { const d = loadLocal(); d.produits = d.produits.filter((x) => x.id !== id); saveLocal(d); },
    async upsertCategorie(c) {
      const d = loadLocal();
      const i = d.categories.findIndex((x) => x.id === c.id);
      if (i >= 0) d.categories[i] = { ...d.categories[i], ...c };
      else d.categories.push({ ...c, id: Math.max(0, ...d.categories.map((x) => x.id)) + 1 });
      saveLocal(d);
    },
    async deleteCategorie(id) {
      const d = loadLocal();
      d.categories = d.categories.filter((x) => x.id !== id);
      d.produits.forEach((p) => { if (p.categorie_id === id) p.categorie_id = null; });
      saveLocal(d);
    },
    async upsertBanniere(b) {
      const d = loadLocal();
      const i = d.bannieres.findIndex((x) => x.id === b.id);
      if (i >= 0) d.bannieres[i] = { ...d.bannieres[i], ...b }; else d.bannieres.push({ ...b, id: b.id || uid() });
      saveLocal(d);
    },
    async deleteBanniere(id) { const d = loadLocal(); d.bannieres = d.bannieres.filter((x) => x.id !== id); saveLocal(d); },
    async saveParametres(p) { const d = loadLocal(); d.parametres = { ...d.parametres, ...p, id: 1 }; saveLocal(d); },
    async getCommandes() { return loadLocal().commandes; },
    async changerStatut(id, statut) {
      const d = loadLocal();
      const c = d.commandes.find((x) => x.id === id);
      if (!c) return;
      const etaitAnnulee = c.statut === "annulee";
      const devientAnnulee = statut === "annulee";
      if (!etaitAnnulee && devientAnnulee) {
        c.articles.forEach((l) => { const p = d.produits.find((x) => x.id === l.produit_id); if (p && p.suivre_stock) p.stock = (p.stock || 0) + l.qte; });
      } else if (etaitAnnulee && !devientAnnulee) {
        c.articles.forEach((l) => { const p = d.produits.find((x) => x.id === l.produit_id); if (p && p.suivre_stock) p.stock = (p.stock || 0) - l.qte; });
      }
      c.statut = statut;
      saveLocal(d);
    },
    async uploadImage(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    },
    async resetDemo() { localStorage.removeItem(LS_KEY); window.dispatchEvent(new CustomEvent("bianchi:change")); },
  };

  // ----------------------------------------------------------
  //  MODE SUPABASE
  // ----------------------------------------------------------
  function makeSupabase() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const check = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    return {
      mode: "supabase",
      client: sb,
      async getCatalogue() {
        const [categories, produits, bannieres, parametres] = await Promise.all([
          sb.from("categories").select("*").order("ordre").then(check),
          sb.from("produits").select("*").order("ordre").then(check),
          sb.from("bannieres").select("*").order("ordre").then(check),
          sb.from("parametres").select("*").eq("id", 1).maybeSingle().then(check),
        ]);
        return { categories, produits, bannieres, parametres: parametres || {} };
      },
      onChange(cb) {
        const ch = sb.channel("catalogue")
          .on("postgres_changes", { event: "*", schema: "public", table: "produits" }, cb)
          .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, cb)
          .on("postgres_changes", { event: "*", schema: "public", table: "bannieres" }, cb)
          .on("postgres_changes", { event: "*", schema: "public", table: "parametres" }, cb)
          .subscribe();
        // Sécurité : si le temps réel n'est pas activé, on rafraîchit au retour sur l'onglet
        const onFocus = () => { if (document.visibilityState === "visible") cb(); };
        document.addEventListener("visibilitychange", onFocus);
        return () => { sb.removeChannel(ch); document.removeEventListener("visibilitychange", onFocus); };
      },
      async passerCommande({ client, articles }) {
        const { data, error } = await sb.rpc("passer_commande", { p_client: client, p_articles: articles });
        if (error) throw new Error(error.message);
        return data;
      },

      async marquerEnvoyee(id) { const { error } = await sb.rpc("marquer_envoyee", { p_id: id }); if (error) throw new Error(error.message); },

      // ---- Admin ----
      async login(email, motDePasse) {
        const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
        return error ? { ok: false, error: "Email ou mot de passe incorrect" } : { ok: true };
      },
      async logout() { await sb.auth.signOut(); },
      async isLoggedIn() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async upsertProduit(p) {
        const row = { ...p };
        if (!row.id) delete row.id;
        check(await sb.from("produits").upsert(row));
      },
      async setStock(id, stock) { check(await sb.from("produits").update({ stock }).eq("id", id)); },
      async setVedette(id, vedette) { check(await sb.from("produits").update({ vedette: !!vedette }).eq("id", id)); },
      async deleteProduit(id) { check(await sb.from("produits").delete().eq("id", id)); },
      async upsertCategorie(c) { const row = { ...c }; if (!row.id) delete row.id; check(await sb.from("categories").upsert(row)); },
      async deleteCategorie(id) { check(await sb.from("categories").delete().eq("id", id)); },
      async upsertBanniere(b) { const row = { ...b }; if (!row.id) delete row.id; check(await sb.from("bannieres").upsert(row)); },
      async deleteBanniere(id) { check(await sb.from("bannieres").delete().eq("id", id)); },
      async saveParametres(p) { check(await sb.from("parametres").upsert({ ...p, id: 1 })); },
      async getCommandes() { return check(await sb.from("commandes").select("*").order("created_at", { ascending: false }).limit(300)); },
      async changerStatut(id, statut) { const { error } = await sb.rpc("changer_statut", { p_id: id, p_statut: statut }); if (error) throw new Error(error.message); },
      async uploadImage(file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = "produits/" + uid() + "." + ext;
        check(await sb.storage.from("images").upload(path, file, { upsert: false, contentType: file.type }));
        return sb.storage.from("images").getPublicUrl(path).data.publicUrl;
      },
    };
  }

  window.BianchiAPI = useSupabase ? makeSupabase() : demo;
})();
