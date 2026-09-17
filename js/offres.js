// Offres promotionnelles (partagé site + admin + mode démo) : mêmes règles que la fonction SQL passer_commande.
// Deux types : « n_plus_1 » (N achetés, M offerts : les pièces les moins chères sont offertes) et « pourcent » (−X % sur la cible).
// La cible est une catégorie (categorie_id) ou un produit précis (produit_id).
(function () {
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const cible = (o, p) => !!p && (o.produit_id ? String(p.id) === String(o.produit_id) : (o.categorie_id != null && String(p.categorie_id) === String(o.categorie_id)));
  const actives = (offres) => (offres || []).filter((o) => o.actif !== false);
  const params = (o) => ({ a: Math.max(1, Number(o.achetes) || 3), f: Math.max(1, Number(o.offerts) || 1), pct: Number(o.pourcent) || 0 });

  // lignes : [{ p, qte }] (produits du panier). Retour : { remise, details:[{ offre, lignes:[{ p, offert, remise }], remise }], par:{ [id]: { offert, remise } } }
  function calc(lignes, offres) {
    const res = { remise: 0, details: [], par: {} };
    const add = (id, offert, remise) => { const e = res.par[id] || (res.par[id] = { offert: 0, remise: 0 }); e.offert += offert; e.remise = round2(e.remise + remise); };
    actives(offres).forEach((o) => {
      const ls = (lignes || []).filter((l) => l.p && l.qte > 0 && cible(o, l.p));
      if (!ls.length) return;
      const { a, f, pct } = params(o);
      const d = { offre: o, lignes: [], remise: 0 };
      if (o.type === "pourcent") {
        if (pct <= 0) return;
        ls.forEach((l) => { const r = round2(l.p.prix * l.qte * pct / 100); if (r > 0) { d.lignes.push({ p: l.p, offert: 0, remise: r }); d.remise += r; add(l.p.id, 0, r); } });
      } else {
        const units = []; ls.forEach((l) => { for (let i = 0; i < l.qte; i++) units.push(l.p); });
        const n = Math.floor(units.length / (a + f)) * f;
        if (!n) return;
        units.sort((x, y) => x.prix - y.prix);
        units.slice(0, n).forEach((p) => { let e = d.lignes.find((x) => x.p === p); if (!e) { e = { p, offert: 0, remise: 0 }; d.lignes.push(e); } e.offert++; e.remise += p.prix; d.remise += p.prix; add(p.id, 1, p.prix); });
      }
      d.remise = round2(d.remise);
      if (d.remise > 0) { res.details.push(d); res.remise += d.remise; }
    });
    res.remise = round2(res.remise);
    return res;
  }

  // Pour une offre n_plus_1 : combien de pièces manquent pour que la prochaine soit offerte (0 = la prochaine ajoutée est offerte)
  function manque(lignes, o) {
    if (o.type === "pourcent") return null;
    const { a, f } = params(o);
    const n = (lignes || []).filter((l) => l.p && cible(o, l.p)).reduce((s, l) => s + l.qte, 0);
    const r = n % (a + f);
    return r >= a ? 0 : a - r;
  }

  window.BIANCHI_OFFRES = { calc, cible, manque, params, round2 };
})();
