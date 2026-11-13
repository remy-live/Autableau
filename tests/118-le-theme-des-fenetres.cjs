// LE THÈME DES FENÊTRES.
//
//   « Permets justement plusieurs thèmes. »
//   « Dans les paramètres, dans le tiroir des plugins, tu mets une ligne qui
//     ouvre une modale. »
//
// Six habits, huit jetons chacun, et toutes les barres de titre changent en
// même temps — celles des quarante fenêtres d'outils comme celle de la boîte
// commune des réglages.
//
// LA LIGNE NE COÛTE PAS UNE LIGNE. Le menu « ⋯ » du tiroir n'a que SIX
// PIXELS de marge avant de se remettre à défiler sur un écran de 800 × 500 :
// mesuré, et deux chapitres l'interdisent. La ligne « Apparence des
// fenêtres… » prend donc exactement la place de la rangée du contour, qui
// déménage dans la fenêtre avec sa couleur et son épaisseur — ce qui parle du
// même sujet se regarde ensemble, et le menu ne gagne pas un pixel.
//
// LE DÉFAUT N'EST PAS UN THÈME, C'EST « COMME AVANT ». Qui ne choisit rien
// garde le dessin d'aujourd'hui. C'est le premier contrôle de ce chapitre :
// refaire l'apparence au nom de quelqu'un qui n'a rien demandé serait le pire
// des services.
const { creerRapport, ouvrirApp, tableauVierge, rechargerApp } = require('./harness.cjs');

// Le contraste d'un texte sur son fond, par la formule de la norme : un thème
// dont on ne lit pas le titre n'est pas un thème, c'est une panne.
function contraste(avant, arriere) {
    const lum = (rgb) => {
        const n = (String(rgb).match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2];
    };
    const a = lum(avant), b = lum(arriere);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

module.exports = async function (browser) {
    const r = creerRapport('Le thème des fenêtres');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. UNE LIGNE DANS LE MENU DU TIROIR, QUI OUVRE UNE FENÊTRE.
    // ------------------------------------------------------------------
    const ouverture = await page.evaluate(async () => {
        document.getElementById('btn-reglages-barre').click();
        await new Promise(k => setTimeout(k, 300));
        const ligne = document.getElementById('rp-apparence');
        if (!ligne) return { erreur: 'pas de ligne dans le menu' };
        ligne.click();
        await new Promise(k => setTimeout(k, 500));
        const f = document.getElementById('reglages-apparence');
        if (!f) return { erreur: 'pas de fenêtre' };
        const nom = f.querySelector('.fen-nom');
        return {
            ouverte: getComputedStyle(f).display !== 'none',
            // ELLE N'A PAS DEMANDÉ SA BARRE : elle a la forme d'une fenêtre,
            // et le système la lui pose. C'est la démonstration de ce qu'on
            // veut partout.
            equipee: f.dataset.equipee === '1',
            barre: !!f.querySelector('.fen-tete'),
            titre: nom ? nom.innerText.trim() : null,
            contour: f.classList.contains('contour-fenetre'),
            // les réglages du trait ont bien déménagé avec elle
            contoursFrancs: !!f.querySelector('#rp-contours'),
            couleur: !!f.querySelector('#rp-contour-couleur'),
            // CEUX DU TRAIT, et non tous ceux de la fenêtre : le mode
            // vidéoprojecteur en a trois à lui, qui comptaient double ici.
            crans: f.querySelectorAll('#rp-epaisseur .rp-epaisseur-choix').length,
            // et les deux intertitres se lisent
            rubriques: Array.from(f.querySelectorAll('.af-rubrique'))
                .filter(e => e.getClientRects().length).length,
            vignettes: f.querySelectorAll('.af-theme').length
        };
    });
    r.verifie('la ligne du menu ouvre la fenêtre de l\'apparence',
        ouverture.ouverte === true, JSON.stringify(ouverture));
    r.verifie('elle reçoit la barre commune sans l\'avoir demandée',
        ouverture.equipee && ouverture.barre && ouverture.titre === 'Apparence'
        && ouverture.contour, JSON.stringify(ouverture));
    r.verifie('les réglages du trait ont déménagé avec elle',
        ouverture.contoursFrancs && ouverture.couleur && ouverture.crans === 3,
        JSON.stringify(ouverture));
    // TROIS INTERTITRES DEPUIS QUE LE VIDÉOPROJECTEUR EST ARRIVÉ : le trait
    // des fenêtres, le thème, et le tableau. La fenêtre ne s'appelle plus
    // « Apparence des fenêtres » mais « Apparence » — ce qu'on y règle n'est
    // plus seulement les fenêtres.
    r.egal('et ses trois intertitres se lisent', ouverture.rubriques, 3, JSON.stringify(ouverture));
    r.egal('six habits sont proposés', ouverture.vignettes, 6, JSON.stringify(ouverture));

    // ------------------------------------------------------------------
    // 2. LE MENU N'A PAS GRANDI.
    //
    //    C'est la raison d'être de la fenêtre. Le chapitre 11 tient la
    //    hauteur du menu ; ici on tient le NOMBRE D'ENTRÉES, qui est la
    //    façon dont il grandit — une ligne à la fois.
    // ------------------------------------------------------------------
    const menu = await page.evaluate(async () => {
        const p = document.getElementById('reglages-barre');
        if (!p.classList.contains('visible')) document.getElementById('btn-reglages-barre').click();
        await new Promise(k => setTimeout(k, 250));
        const n = p.querySelectorAll('.rp-choix').length;
        const resteDuTrait = p.querySelectorAll('#rp-contours, #rp-contour-couleur, .rp-epaisseur-choix').length;
        p.classList.remove('visible');
        return { n, resteDuTrait };
    });
    r.egal('le menu offre toujours dix entrées, pas onze', menu.n, 10, JSON.stringify(menu));
    r.egal('et il ne garde rien de la rangée du trait', menu.resteDuTrait, 0, JSON.stringify(menu));

    // ------------------------------------------------------------------
    // 3. LE THÈME CHANGE VRAIMENT LA BARRE D'UNE FENÊTRE D'OUTIL.
    //
    //    On ouvre un outil ordinaire et l'on regarde SA barre : un thème qui
    //    ne repeindrait que sa propre fenêtre ne servirait à rien.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Sonomètre de Classe');
        if (b) b.click();
    });
    await page.waitForTimeout(700);

    const lireLaBarre = () => page.evaluate(() => {
        const t = document.querySelector('#sound-modal .fen-tete');
        if (!t) return null;
        const n = t.querySelector('.fen-nom');
        const boite = document.querySelector('.drag-handle-prompt');
        return {
            fond: getComputedStyle(t).backgroundColor,
            encre: n ? getComputedStyle(n).color : null,
            fondDeLaBoite: boite ? getComputedStyle(boite).backgroundColor : null
        };
    });

    const auDepart = await lireLaBarre();
    r.verifie('la fenêtre de l\'outil a bien sa barre', !!auDepart, JSON.stringify(auDepart));

    const habits = [];
    for (const id of ['papier', 'ecole', 'ardoise', 'nuit', 'contraste']) {
        await page.evaluate((x) => window.choisirLeThemeDesFenetres(x), id);
        await page.waitForTimeout(160);
        habits.push({ id, vu: await lireLaBarre() });
    }

    const inchangés = habits.filter(h => !h.vu || h.vu.fond === auDepart.fond).map(h => h.id);
    r.egal('les cinq habits repeignent la barre de l\'outil', inchangés.length, 0,
        JSON.stringify(habits));

    // TOUS DIFFÉRENTS LES UNS DES AUTRES : deux thèmes qui se ressemblent au
    // point d'être identiques seraient un seul thème offert deux fois.
    const fonds = new Set(habits.map(h => h.vu && h.vu.fond));
    r.egal('et aucun ne se confond avec un autre', fonds.size, habits.length,
        JSON.stringify([...fonds]));

    // ET LA BOÎTE COMMUNE SUIT LE MÊME HABIT. C'est tout l'objet d'un thème :
    // une seule apparence pour les deux familles de fenêtres.
    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Tableau de Numération');
        if (b) b.click();
    });
    await page.waitForTimeout(600);
    const ensemble = await page.evaluate(() => {
        const t = document.querySelector('#sound-modal .fen-tete');
        const b = document.querySelector('.drag-handle-prompt');
        return { outil: t ? getComputedStyle(t).backgroundColor : null,
                 boite: b ? getComputedStyle(b).backgroundColor : null };
    });
    r.egal('la boîte commune porte le même habit que la fenêtre d\'outil',
        ensemble.boite, ensemble.outil, JSON.stringify(ensemble));

    // ------------------------------------------------------------------
    // 4. ON LIT LE TITRE DANS CHACUN DES SIX.
    //
    //    Un thème dont on ne lit pas le titre n'est pas un thème, c'est une
    //    panne — et elle ne se verrait que chez celui qui l'a choisi.
    // ------------------------------------------------------------------
    const lisibilite = [];
    for (const id of ['auto', 'papier', 'ecole', 'ardoise', 'nuit', 'contraste']) {
        await page.evaluate((x) => window.choisirLeThemeDesFenetres(x), id);
        await page.waitForTimeout(140);
        const v = await lireLaBarre();
        lisibilite.push({ id, c: v ? +contraste(v.encre, v.fond).toFixed(2) : 0 });
    }
    const illisibles = lisibilite.filter(x => x.c < 4.5);
    r.egal('le titre se lit dans les six habits', illisibles.length, 0, JSON.stringify(lisibilite));

    // ------------------------------------------------------------------
    // 5. « COMME LE TABLEAU » REND EXACTEMENT LE DESSIN D'AVANT.
    // ------------------------------------------------------------------
    await page.evaluate(() => window.choisirLeThemeDesFenetres('auto'));
    await page.waitForTimeout(200);
    const revenu = await lireLaBarre();
    r.egal('revenir à « comme le tableau » rend le fond d\'avant',
        revenu && revenu.fond, auDepart.fond, JSON.stringify({ auDepart, revenu }));
    const attribut = await page.evaluate(() => document.body.getAttribute('data-theme-fenetre'));
    r.egal('et il ne laisse aucun habit accroché au corps de la page', attribut, null, String(attribut));

    // ------------------------------------------------------------------
    // 6. ET L'HABIT CHOISI SURVIT AU RECHARGEMENT.
    // ------------------------------------------------------------------
    await page.evaluate(() => window.choisirLeThemeDesFenetres('ardoise'));
    await page.waitForTimeout(200);
    await rechargerApp(page);
    await page.waitForTimeout(700);
    const apres = await page.evaluate(() => document.body.getAttribute('data-theme-fenetre'));
    r.egal('l\'habit choisi survit au rechargement', apres, 'ardoise', String(apres));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
