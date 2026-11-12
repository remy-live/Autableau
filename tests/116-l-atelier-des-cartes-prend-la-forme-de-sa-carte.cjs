// L'ATELIER DES CARTES PREND LA FORME DE SA CARTE.
//
//   « Pour l'atelier carte, corrige les proportions. »
//
// Mesuré : le bac du dessin faisait 711 × 587 pour une carte de 711 × 298.
// Deux cent quatre-vingt-neuf pixels de vide sous le monde — plus de la
// moitié du bac —, et la fenêtre haute de 756 px ne tenait pas sur un
// vidéoprojecteur de 1024 × 600.
//
// LA CAUSE N'EST PAS LA CARTE, C'EST LA FENÊTRE. Le rapport d'une carte
// n'est pas un choix de dessinateur : il vient des terres qu'elle montre.
// Le monde sans l'Antarctique fait 2,38 ; l'Europe, 1,62. Une fenêtre à
// hauteur écrite d'avance — 720 px — ne peut donc tomber juste que par
// hasard, et le bac, qui prenait « tout le reste », gardait la différence.
//
// (La projection, elle, était bonne : 360 unités de large pour 152 de haut
// entre le nord du Groenland et la Terre de Feu, soit 2,37 — exactement ce
// qu'on mesure. Il ne fallait pas y toucher.)
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'atelier des cartes prend la forme de sa carte');
    // L'écran d'un vidéoprojecteur de classe, et non un grand écran de
    // bureau : c'est là que la hauteur figée faisait mal.
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1024, height: 600 } });
    await tableauVierge(page);

    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Atelier cartes');
        if (b) b.click();
    });
    await page.waitForTimeout(1600);

    const lire = () => page.evaluate(() => {
        const f = document.getElementById('carte-fenetre');
        const d = document.getElementById('carte-dessin');
        if (!f || !d) return null;
        const s = d.querySelector('svg');
        const rf = f.getBoundingClientRect(), rd = d.getBoundingClientRect();
        const rs = s ? s.getBoundingClientRect() : null;
        const vb = s ? (s.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number) : null;
        return {
            fenetre: [Math.round(rf.width), Math.round(rf.height)],
            dansLEcran: rf.top >= -1 && rf.bottom <= window.innerHeight + 1
                && rf.left >= -1 && rf.right <= window.innerWidth + 1,
            bac: [Math.round(rd.width), Math.round(rd.height)],
            carte: rs ? [Math.round(rs.width), Math.round(rs.height)] : null,
            vide: rs ? Math.round(rd.height - rs.height) : null,
            rapportDuDessin: (vb && vb.length === 4 && vb[3]) ? +(vb[2] / vb[3]).toFixed(3) : null
        };
    });

    const monde = await lire();
    r.verifie('l\'atelier des cartes s\'ouvre et dessine le monde',
        !!monde && !!monde.carte, JSON.stringify(monde));

    // ------------------------------------------------------------------
    // 1. PLUS DE BANDE VIDE SOUS LA CARTE.
    //
    //    On ne mesure pas une hauteur, qui dépend de l'écran : on mesure
    //    l'écart entre le bac et ce qu'il porte. C'est lui, le défaut.
    // ------------------------------------------------------------------
    r.verifie('le bac ne garde plus de bande vide sous la carte',
        monde.vide !== null && monde.vide <= 8,
        'bac ' + monde.bac.join('×') + ', carte ' + (monde.carte || []).join('×')
        + ', vide ' + monde.vide + ' px (289 px avant)');

    // ------------------------------------------------------------------
    // 2. ET LA FENÊTRE TIENT SUR UN VIDÉOPROJECTEUR.
    // ------------------------------------------------------------------
    r.verifie('la fenêtre tient tout entière dans un écran de 1024 × 600',
        monde.dansLEcran === true, JSON.stringify(monde));

    // ------------------------------------------------------------------
    // 3. UNE AUTRE CARTE, UNE AUTRE FORME, UNE AUTRE HAUTEUR.
    //
    //    C'est la preuve que la fenêtre suit vraiment sa carte, et qu'elle
    //    n'a pas seulement été rapetissée une bonne fois. L'Europe est bien
    //    plus haute que large comparée au monde : 1,62 contre 2,38.
    // ------------------------------------------------------------------
    const aChange = await page.evaluate(() => {
        const sel = document.getElementById('carte-fond-choix');
        if (!sel) return false;
        const opt = Array.from(sel.options).find(o => /europe/i.test(o.value));
        if (!opt) return false;
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    });
    r.verifie('le choix d\'un continent existe', aChange === true, '');
    await page.waitForTimeout(1100);
    const europe = await lire();

    r.verifie('l\'Europe ne se dessine pas au même rapport que le monde',
        !!europe && europe.rapportDuDessin && monde.rapportDuDessin
        && europe.rapportDuDessin < monde.rapportDuDessin,
        'monde ' + monde.rapportDuDessin + ', europe ' + (europe && europe.rapportDuDessin));
    r.verifie('et la fenêtre a changé de hauteur avec elle',
        !!europe && europe.fenetre[1] > monde.fenetre[1],
        'monde ' + monde.fenetre.join('×') + ', europe ' + (europe && europe.fenetre.join('×')));
    r.verifie('sans bande vide, et toujours dans l\'écran',
        !!europe && europe.vide <= 8 && europe.dansLEcran === true, JSON.stringify(europe));

    // ------------------------------------------------------------------
    // 4. ET L'ATELIER VOISIN N'A RIEN PRIS AU PASSAGE.
    //
    //    La Frise Historique partage la même classe de fenêtre. Une
    //    correction écrite sur la classe au lieu de l'atelier des cartes
    //    l'aurait emportée avec elle — et une frise vide ne se voit pas
    //    dans un chapitre qui ne parle que de cartes.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const x = document.getElementById('carte-fermer');
        if (x) x.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Frise Historique');
        if (b) b.click();
    });
    await page.waitForTimeout(1400);
    const frise = await page.evaluate(() => {
        const f = document.getElementById('frise-fenetre');
        if (!f) return null;
        const r = f.getBoundingClientRect();
        return { taille: [Math.round(r.width), Math.round(r.height)],
                 contenu: (f.textContent || '').trim().length,
                 visible: r.width > 100 && r.height > 100 };
    });
    r.verifie('la Frise Historique s\'ouvre toujours, avec son contenu',
        !!frise && frise.visible && frise.contenu > 40, JSON.stringify(frise));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
