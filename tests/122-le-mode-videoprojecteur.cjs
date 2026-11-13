// LE MODE VIDÉOPROJECTEUR.
//
//   « Rajoute un mode projecteur (comme dans GeoMaster) qui augmente un peu
//     les traits (et aussi des cahiers), paramétrables. »
//
// Un trait de trois pixels est net sur l'écran du bureau, à cinquante
// centimètres. Le même, étalé par un vidéoprojecteur sur deux mètres de mur
// et regardé du fond de la salle, est un cheveu.
//
// CE CHAPITRE NE LIT PAS LES RÉGLAGES, IL COMPTE LES PIXELS ENCRÉS. Vérifier
// que « EPAISSEUR_AU_TABLEAU vaut 1,6 » ne dirait rien : c'est la variable
// qui se relit elle-même. On trace un trait, on lit la colonne de pixels qui
// le traverse, et l'on compte ceux qui diffèrent du fond. C'est ce que voit
// l'élève du fond, et c'est la seule mesure qui compte.
//
// ET L'ESSENTIEL EST LE CONTRÔLE QUI NE DOIT PAS BOUGER : l'interface — le
// cadre de sélection, les poignées, les guides — est dessinée en pixels
// d'ÉCRAN, « lw » valant 1/zoom. Elle a déjà la bonne taille ; la grossir
// mangerait la figure qu'on montre. Le quatrième contrôle mesure qu'elle
// garde exactement le même poids, mode allumé ou éteint.
const { creerRapport, ouvrirApp, tableauVierge, rechargerApp } = require('./harness.cjs');

// Combien de pixels d'une colonne diffèrent du fond. Le fond est la couleur
// la PLUS FRÉQUENTE de la colonne, et non le pixel du haut : sur une page de
// Seyès, le pixel du haut tombe une fois sur dix sur une ligne de réglure, et
// toute la mesure s'inversait.
const COMPTER = `(() => {
    const c = document.getElementById('board');
    const g = c.getContext('2d');
    const col = Math.round(panX + 500 * zoom);
    const d = g.getImageData(col, 0, 1, c.height).data;
    const vus = {};
    for (let y = 0; y < c.height; y++) {
        const i = y * 4;
        const k = d[i] + ',' + d[i+1] + ',' + d[i+2];
        vus[k] = (vus[k] || 0) + 1;
    }
    const fond = Object.entries(vus).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    let n = 0;
    for (let y = 0; y < c.height; y++) {
        const i = y * 4;
        if (Math.abs(d[i] - fond[0]) + Math.abs(d[i+1] - fond[1]) + Math.abs(d[i+2] - fond[2]) > 12) n++;
    }
    return n;
})()`;

module.exports = async function (browser) {
    const r = creerRapport('Le mode vidéoprojecteur');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    const compter = () => page.evaluate(COMPTER);
    const poser = (on, force) => page.evaluate(([o, f]) => {
        modeVideoprojecteur = o;
        if (f) grossissementDuTrait = f;
        poserLeVideoprojecteur();
    }, [on, force || null]);

    // ------------------------------------------------------------------
    // 1. LE TRAIT DESSINÉ S'ÉPAISSIT, ET LES TROIS CRANS SE DISTINGUENT.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        freehands.length = 0; segments.length = 0; rectangles.length = 0;
        selectedItems = [];
        freehands.push({ id: nextId++, points: [{ x: 300, y: 300, p: 0.5 }, { x: 700, y: 300, p: 0.5 }],
                         color: '#000000', width: 3, z: globalZ++ });
        draw();
    });
    await poser(false);
    const repos = await compter();
    const crans = [];
    for (const g of [1.3, 1.6, 2.1]) { await poser(true, g); crans.push(await compter()); }
    await poser(false);
    const revenu = await compter();

    r.verifie('au repos, le trait garde son épaisseur',
        repos > 0 && revenu === repos, 'repos ' + repos + ', revenu ' + revenu);
    r.verifie('projeté, il s\'épaissit',
        crans[2] > repos, 'repos ' + repos + ' px, ×2,1 ' + crans[2] + ' px');
    r.verifie('et les crans vont bien en montant',
        crans[0] <= crans[1] && crans[1] < crans[2],
        '×1,3 ' + crans[0] + ' · ×1,6 ' + crans[1] + ' · ×2,1 ' + crans[2] + ' px');

    // ------------------------------------------------------------------
    // 2. LA RÉGLURE DU CAHIER SUIT.
    //
    //    « Et aussi des cahiers. » La réglure du Seyès est le trait le plus
    //    fin de toute l'application — un pixel à quinze pour cent d'opacité —
    //    et c'est le premier à disparaître sur un mur.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        freehands.length = 0;
        currentBgIndex = backgrounds.indexOf('seyes');
        draw();
    });
    await poser(false);
    const cahierRepos = await compter();
    await poser(true, 2.1);
    const cahierProjete = await compter();
    r.verifie('la réglure du cahier s\'épaissit elle aussi',
        cahierProjete > cahierRepos,
        'repos ' + cahierRepos + ' px encrés, projetée ' + cahierProjete);

    // ------------------------------------------------------------------
    // 3. ET L'INTERFACE, ELLE, NE BOUGE PAS D'UN PIXEL.
    //
    //    C'est le contrôle qui tient tout le reste. Le cadre de sélection et
    //    ses poignées sont dessinés en pixels d'ÉCRAN : ils ont déjà la bonne
    //    taille, et les grossir mangerait la figure qu'on montre.
    //
    //    MESURÉ : un rectangle choisi porte un halo de vingt-six pixels qui
    //    couvre entièrement son trait. On lit donc la colonne qui le
    //    traverse, et le halo doit faire exactement la même largeur dans les
    //    deux modes — au pixel près. Que le halo cache le trait ne gêne pas :
    //    l'épaississement du trait, lui, est déjà mesuré plus haut, sur une
    //    forme qu'on n'a pas choisie.
    // ------------------------------------------------------------------
    const poserLaForme = (choisie) => page.evaluate((c) => {
        currentBgIndex = backgrounds.indexOf('blanc');
        freehands.length = 0;
        rectangles.length = 0;
        points.length = 0;
        // Les deux sommets sont hors de la colonne mesurée (x = 500) : on ne
        // compte que les deux côtés horizontaux du rectangle, et ce que la
        // sélection ajoute par-dessus.
        const a = { id: nextId++, x: 300, y: 250, z: globalZ++ };
        const b = { id: nextId++, x: 700, y: 350, z: globalZ++ };
        points.push(a, b);
        const f = { id: nextId++, p1_id: a.id, p2_id: b.id,
                    color: '#000000', width: 3, z: globalZ++ };
        rectangles.push(f);
        selectedItems = c ? [{ type: 'rectangle', id: f.id }] : [];
        draw();
    }, choisie);

    await poserLaForme(false);
    await poser(false); const formeRepos = await compter();
    await poser(true, 2.1); const formeProjetee = await compter();
    await poserLaForme(true);
    await poser(false); const choisieRepos = await compter();
    await poser(true, 2.1); const choisieProjetee = await compter();

    r.verifie('la forme seule, elle, s\'épaissit bien',
        formeProjetee > formeRepos,
        'rectangle ' + formeRepos + ' px au repos, ' + formeProjetee + ' projeté');
    r.verifie('la forme choisie porte bien son halo',
        choisieRepos > formeRepos,
        'forme ' + formeRepos + ' px, forme choisie ' + choisieRepos);
    r.verifie('le cadre de sélection ne grossit pas d\'un pixel',
        choisieProjetee === choisieRepos,
        'halo ' + choisieRepos + ' px au repos, ' + choisieProjetee + ' projeté');

    // ------------------------------------------------------------------
    // 4. CHOISIR UN CRAN ALLUME LE MODE.
    //
    //    Régler la force d'un mode éteint ne montre rien : on cliquerait
    //    trois fois sans rien voir, et l'on conclurait que ça ne marche pas.
    // ------------------------------------------------------------------
    const allumage = await page.evaluate(() => {
        modeVideoprojecteur = false;
        poserLeVideoprojecteur();
        const avant = modeVideoprojecteur;
        choisirLeGrossissement(1.3);
        return { avant, apres: modeVideoprojecteur, force: grossissementDuTrait };
    });
    r.verifie('choisir une force allume le mode',
        allumage.avant === false && allumage.apres === true && Math.abs(allumage.force - 1.3) < 1e-9,
        JSON.stringify(allumage));

    const refus = await page.evaluate(() => {
        const avant = grossissementDuTrait;
        choisirLeGrossissement(9);
        return { avant, apres: grossissementDuTrait };
    });
    r.verifie('une force inconnue est refusée',
        Math.abs(refus.avant - refus.apres) < 1e-9, JSON.stringify(refus));

    // ------------------------------------------------------------------
    // 5. LA FENÊTRE DE L'APPARENCE LE PORTE, ET LE MENU NE GRANDIT PAS.
    // ------------------------------------------------------------------
    const dansLaFenetre = await page.evaluate(() => {
        const ligne = document.getElementById('rp-apparence');
        if (!ligne) return { erreur: 'la ligne du menu a disparu' };
        ligne.click();
        const f = document.getElementById('reglages-apparence');
        if (!f) return { erreur: 'la fenêtre a disparu' };
        const b = document.getElementById('rp-videoprojecteur');
        const crans = document.querySelectorAll('#rp-grossissement .rp-epaisseur-choix');
        const r = f.getBoundingClientRect();
        return {
            montree: getComputedStyle(f).display !== 'none',
            bouton: !!b && !!b.closest('#reglages-apparence'),
            crans: crans.length,
            // la rangée tient sur une ligne : le libellé et les trois crans
            surUneLigne: b ? Math.abs(b.getBoundingClientRect().top
                - (crans[0] ? crans[0].getBoundingClientRect().top : 0)) < 12 : false,
            // « ×1,3 » dans un carré prévu pour « 1 » débordait : les trois
            // libellés se chevauchaient et le cran choisi se lisait « ×1,( ».
            rognes: Array.from(crans).filter(c => c.scrollWidth > c.clientWidth + 1).length,
            dansLEcran: r.top >= 0 && r.bottom <= window.innerHeight
        };
    });
    r.verifie('la fenêtre « Apparence » porte le mode vidéoprojecteur',
        dansLaFenetre.montree === true && dansLaFenetre.bouton === true && dansLaFenetre.crans === 3,
        JSON.stringify(dansLaFenetre));
    r.verifie('et sa rangée tient sur une seule ligne',
        dansLaFenetre.surUneLigne === true, JSON.stringify(dansLaFenetre));
    r.verifie('les trois crans se lisent en entier',
        dansLaFenetre.rognes === 0, JSON.stringify(dansLaFenetre));
    r.verifie('la fenêtre tient dans l\'écran',
        dansLaFenetre.dansLEcran === true, JSON.stringify(dansLaFenetre));

    // ------------------------------------------------------------------
    // 6. LE RÉGLAGE SURVIT À LA SÉANCE SUIVANTE.
    //
    //    On branche le vidéoprojecteur une fois pour l'année, pas une fois
    //    par heure.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        modeVideoprojecteur = true; grossissementDuTrait = 2.1;
        try {
            localStorage.setItem('auTableau_videoprojecteur', 'true');
            localStorage.setItem('auTableau_grossissement_trait', '2.1');
        } catch (e) { /* stockage refusé */ }
    });
    await rechargerApp(page);
    const garde = await page.evaluate(() => ({
        on: modeVideoprojecteur, force: grossissementDuTrait, unite: EPAISSEUR_AU_TABLEAU
    }));
    r.verifie('le mode et sa force sont retrouvés au démarrage',
        garde.on === true && Math.abs(garde.force - 2.1) < 1e-9
        && Math.abs(garde.unite - 2.1) < 1e-9, JSON.stringify(garde));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
