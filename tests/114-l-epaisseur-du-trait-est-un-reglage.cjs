// L'ÉPAISSEUR DU TRAIT EST UN RÉGLAGE, COMME SA COULEUR.
//
//   « Pouvoir régler la bordure et garder ou non le contour franc. »
//
// Le contour franc existait déjà, et sa couleur aussi. Son ÉPAISSEUR, non :
// elle était écrite en dur à un pixel, à deux endroits qui ne se parlaient
// pas — la bordure posée sur les fenêtres qui n'en avaient pas, et l'anneau
// sans flou que portent les barres, les tiroirs et les fenêtres.
//
// Un pixel se voit très bien sur un écran de bureau. Projeté en 1024 de large
// sur un mur de classe, vu du fond de la salle, il se devine. Trois crans, et
// le fin reste le défaut : épaissir le trait de tout le monde sans qu'on
// l'ait demandé serait refaire le dessin de l'application.
//
// CE CHAPITRE MESURE LES DEUX TRAITS ENSEMBLE. C'est tout son intérêt :
// n'en régler qu'un donnerait une fenêtre au trait épais cerclée d'un anneau
// fin, ce qui se voit immédiatement et ne se rattrape nulle part.
const { creerRapport, ouvrirApp, tableauVierge, rechargerApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'épaisseur du trait est un réglage');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // Une fenêtre d'outil à qui l'application POSE son trait : c'est celle-là
    // qui montre les deux à la fois, la bordure et l'anneau.
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Atelier cartes');
        if (b) b.click();
    });
    await page.waitForTimeout(700);

    const lire = () => page.evaluate(() => {
        let fen = null;
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (f.getClientRects().length) fen = f;
        });
        if (!fen) return null;
        const c = getComputedStyle(fen);
        const ombre = c.boxShadow || '';
        // l'anneau : un trait sans flou, au ras de la boîte
        const m = /rgb[^)]*\)\s+0px\s+0px\s+0px\s+(\d+(?:\.\d+)?)px/.exec(ombre);
        return {
            variable: getComputedStyle(document.documentElement)
                .getPropertyValue('--contour-trait').trim(),
            bord: Math.round(parseFloat(c.borderTopWidth) || 0),
            anneau: m ? Math.round(parseFloat(m[1])) : 0
        };
    });

    // ------------------------------------------------------------------
    // 1. LE DÉFAUT NE BOUGE PAS. Qui ne demande rien garde le dessin
    //    d'aujourd'hui : un pixel.
    // ------------------------------------------------------------------
    const depart = await lire();
    r.verifie('une fenêtre d\'outil est bien ouverte', !!depart, JSON.stringify(depart));
    r.egal('au départ, le trait fait un pixel', depart && depart.variable, '1px',
        JSON.stringify(depart));

    // ------------------------------------------------------------------
    // 2. LES TROIS CRANS DÉPLACENT LA BORDURE *ET* L'ANNEAU.
    // ------------------------------------------------------------------
    const vus = [];
    for (const n of [2, 3, 1]) {
        await page.evaluate((v) => window.choisirLEpaisseurDuContour(v), n);
        await page.waitForTimeout(180);
        vus.push({ demande: n, vu: await lire() });
    }
    const desaccords = vus.filter(x => !x.vu || x.vu.bord !== x.demande || x.vu.anneau !== x.demande);
    r.egal('la bordure et l\'anneau suivent le cran demandé, tous les deux',
        desaccords.length, 0, JSON.stringify(vus));

    // ET UN CRAN QUI N'EXISTE PAS NE CASSE RIEN : on reste où l'on était.
    await page.evaluate(() => window.choisirLEpaisseurDuContour(9));
    await page.waitForTimeout(150);
    const apresAbsurde = await lire();
    r.egal('un cran inconnu laisse le réglage où il était',
        apresAbsurde && apresAbsurde.variable, '1px', JSON.stringify(apresAbsurde));

    // ------------------------------------------------------------------
    // 3. LE PANNEAU D'APPARENCE DIT LEQUEL EST CHOISI.
    //
    //    Trois boutons dont aucun n'est allumé, c'est un réglage qu'on ne
    //    peut pas lire — et le panneau s'ouvre devant une classe.
    // ------------------------------------------------------------------
    await page.evaluate(() => window.choisirLEpaisseurDuContour(3));
    await page.waitForTimeout(150);
    const panneau = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#rp-epaisseur .rp-epaisseur-choix'));
        return { combien: b.length,
                 allumes: b.filter(x => x.classList.contains('actif')).map(x => x.dataset.trait),
                 dits: b.filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.dataset.trait) };
    });
    r.egal('le panneau offre les trois crans', panneau.combien, 3, JSON.stringify(panneau));
    r.egal('et un seul est allumé — celui qui est choisi',
        JSON.stringify(panneau.allumes), JSON.stringify(['3']), JSON.stringify(panneau));
    r.egal('il le dit aussi à qui ne voit pas l\'écran',
        JSON.stringify(panneau.dits), JSON.stringify(['3']), JSON.stringify(panneau));

    // ------------------------------------------------------------------
    // 4. ET IL S'EN SOUVIENT. Un réglage d'apparence qu'il faut reposer à
    //    chaque cours n'est pas un réglage.
    // ------------------------------------------------------------------
    await rechargerApp(page);
    await page.waitForTimeout(600);
    const apres = await page.evaluate(() => getComputedStyle(document.documentElement)
        .getPropertyValue('--contour-trait').trim());
    r.egal('le cran choisi survit au rechargement', apres, '3px', apres);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
