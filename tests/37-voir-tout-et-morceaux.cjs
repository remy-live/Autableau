// RETROUVER SON TABLEAU, ET DÉPLACER CE QU'ON VIENT DE DÉCOUPER.
//
// « De base quand on coupe un exercice, mets-le en mode déplacement, pas en
// mode où on peut glisser la page dans le cadre. On n'a aucun bouton pour que
// tout soit vu sur le canvas — je pense à cela car j'ai mis un bout de
// l'exercice, je l'ai mis en plein écran, puis pour revenir au pdf de base
// avec le bout d'exercice dessus, quelle galère. »
//
// DEUX DÉFAUTS, ET LE SECOND EXPLIQUE LE PREMIER.
//
// La présentation met le document en mode « page » — en plein écran, glisser
// fait coulisser la page dans son cadre, et c'est bien le geste attendu
// là-bas. Mais elle ne le rendait pas en sortant, et l'on sort par plusieurs
// portes : le bouton, la touche, le mode Focus qu'on éteint. On revenait donc
// au tableau, on prenait le morceau qu'on venait de découper pour le poser
// ailleurs — et c'est la page qui coulissait sous lui. Rien ne le disait.
//
// Et le tableau est infini : rien ne permettait de tout ramener à l'écran.
//
// CE QUE CETTE SUITE TIENT :
//
//   — un morceau posé se prend en main : mode déplacement, pas coulissement ;
//   — la présentation rend le mode qu'elle a trouvé, par toutes ses portes ;
//   — « Tout voir » ramène TOUT dans l'écran, document et morceaux compris,
//     sans rien coller sous les barres ;
//   — il sort de la présentation, qui retient la vue sur la page ;
//   — et sur un tableau vide, il revient simplement au repère.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Tout voir et morceaux');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    // Un document posé, et un morceau qui attend au tiroir.
    const preparer = () => page.evaluate(async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560">'
            + '<rect width="400" height="560" fill="#ffffff" stroke="#333333"/></svg>';
        images.length = 0; texts.length = 0; points.length = 0; freehands.length = 0;
        selectedItems = []; panX = 100; panY = 100; zoom = 1;
        setMode('pointer');
        morceauxEnAttente = [];
        const st = await new Promise(ok => createStampFromSVG(svg, ok));
        images.push({ id: nextId++, x: 0, y: 0, w: 400, h: 560, cx: 0, cy: 0,
            cw: st.w, ch: st.h, src: st.src, z: globalZ++, fileName: 'doc.pdf',
            pluginData: { id: 'pdfDoc', page: 1, pages: 1, cle: 'k' } });
        morceauxEnAttente.push({ id: nextId++, w: 200, h: 120, cx: 0, cy: 0,
            cw: st.w, ch: st.h, src: st.src, nom: 'doc', source: 'doc.pdf', page: 1 });
        draw();
        return images[0].id;
    });

    const mode = () => page.evaluate(() => modeDocument);

    // ---------------------------------------------------------------
    // 1. Un morceau posé se DÉPLACE
    // ---------------------------------------------------------------
    await preparer();
    const apresLaPose = await page.evaluate(() => {
        modeDocument = 'page';                 // comme au sortir d'une présentation
        const o = poserLeMorceau(morceauxEnAttente[0], { x: 900, y: 1200 });
        return { mode: modeDocument, tenu: JSON.stringify(selectedItems),
                 estUnMorceau: !!(o.pluginData && o.pluginData.id === 'morceau') };
    });
    r.egal('un morceau posé se prend en main, il ne coulisse pas',
        { mode: apresLaPose.mode, morceau: apresLaPose.estUnMorceau }, { mode: 'cadre', morceau: true });
    r.verifie('et il est tenu, prêt à être placé',
        apresLaPose.tenu.includes('"type":"image"'), apresLaPose.tenu);

    // Poser TOUT le tiroir d'un coup : même règle.
    await preparer();
    const apresToutPoser = await page.evaluate(() => {
        modeDocument = 'page';
        poserTousLesMorceaux();
        return modeDocument;
    });
    r.egal('poser tout le tiroir laisse aussi la main sur le cadre', apresToutPoser, 'cadre');

    // ---------------------------------------------------------------
    // 2. La présentation rend le mode qu'elle a trouvé
    // ---------------------------------------------------------------
    await preparer();
    const allerRetour = [];
    for (const depart of ['cadre', 'page']) {
        allerRetour.push(await page.evaluate((d) => {
            modeDocument = d;
            selectedItems = [{ type: 'image', id: images[0].id }];
            presenterLeDocument();
            const dedans = modeDocument;
            quitterLaPresentation();
            return { depart: d, dedans, sortie: modeDocument };
        }, depart));
        await page.waitForTimeout(200);
    }
    r.egal('en présentation, la page coulisse — et le mode d\'avant revient à la sortie',
        allerRetour, [
            { depart: 'cadre', dedans: 'page', sortie: 'cadre' },
            { depart: 'page', dedans: 'page', sortie: 'page' }
        ]);

    // L'AUTRE PORTE. On sort aussi de la présentation en éteignant le mode
    // Focus : ce chemin-là ne passe pas par « quitter la présentation », et
    // c'est celui qu'on prend sans y penser.
    await preparer();
    const parLeFocus = await page.evaluate(() => {
        modeDocument = 'cadre';
        selectedItems = [{ type: 'image', id: images[0].id }];
        presenterLeDocument();
        const dedans = modeDocument;
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        return { dedans, sortie: modeDocument, presentation: presentationEnCours };
    });
    await page.waitForTimeout(250);
    r.egal('éteindre le mode Focus rend le mode du document, lui aussi',
        { dedans: parLeFocus.dedans, sortie: parLeFocus.sortie, presentation: parLeFocus.presentation },
        { dedans: 'page', sortie: 'cadre', presentation: null });

    // ---------------------------------------------------------------
    // 3. « Tout voir » ramène tout dans l'écran
    // ---------------------------------------------------------------
    await preparer();
    await page.evaluate(() => {
        poserLeMorceau(morceauxEnAttente[0], { x: 1400, y: 1800 });
        texts.push({ id: nextId++, x: -600, y: -400, content: 'Note', fontSize: 24, color: '#000', z: globalZ++ });
        // Perdu à l'autre bout du tableau, et zoomé de près.
        panX = -9000; panY = -9000; zoom = 3;
        draw();
    });

    const bouton = await page.evaluate(() => !!document.getElementById('btn-voir-tout'));
    r.verifie('un bouton « Tout voir » existe dans le tiroir du bas', bouton, String(bouton));

    await page.evaluate(() => document.getElementById('btn-voir-tout').click());
    await page.waitForTimeout(250);

    // ON MESURE LA BOÎTE DE TOUT LE TRAVAIL, pas les objets un à un : le
    // morceau posé loin, le document, et la note écrite en haut à gauche —
    // hors de l'écran, elle ne compterait pas dans un relevé image par image,
    // et c'est justement elle qu'on ne retrouvait plus.
    const vu = await page.evaluate(() => {
        const L = canvas.clientWidth, H = canvas.clientHeight;
        const b = boiteDuTravail();
        const ecran = { x1: panX + b.x * zoom, y1: panY + b.y * zoom,
            x2: panX + (b.x + b.l) * zoom, y2: panY + (b.y + b.h) * zoom };
        const bande = (sel) => {
            const e = document.querySelector(sel);
            if (!e || !e.getClientRects().length) return null;
            const r = e.getBoundingClientRect();
            return { haut: r.top, bas: r.bottom };
        };
        const enHaut = bande('#bar-plugins');
        const enBas = bande('#bottom-drawer');
        return {
            ecran, L, H, zoom: Number(zoom.toFixed(3)),
            dansLEcran: ecran.x1 >= 0 && ecran.y1 >= 0 && ecran.x2 <= L && ecran.y2 <= H,
            sousLaBarreDuHaut: !!enHaut && ecran.y1 < enHaut.bas,
            sousLaBarreDuBas: !!enBas && ecran.y2 > enBas.haut,
            barres: { enHaut, enBas }
        };
    });
    r.verifie('tout est revenu dans l\'écran — document, morceau et note comprise',
        vu.dansLEcran, JSON.stringify(vu));
    r.verifie('rien ne se cache sous la barre du haut', vu.sousLaBarreDuHaut === false, JSON.stringify(vu));
    r.verifie('ni sous celle du bas', vu.sousLaBarreDuBas === false, JSON.stringify(vu));

    // UN PETIT DESSIN NE SE MET PAS À OCCUPER TOUT L'ÉCRAN. « Tout voir » sert
    // à retrouver son travail, pas à le grossir douze fois : un trait de deux
    // centimètres tiendrait l'écran entier, méconnaissable.
    const surDuPetit = await page.evaluate(() => {
        points.length = 0; images.length = 0; texts.length = 0; freehands.length = 0;
        selectedItems = []; panX = 0; panY = 0; zoom = 1;
        points.push({ id: nextId++, x: 0, y: 0, z: globalZ++ });
        points.push({ id: nextId++, x: 20, y: 12, z: globalZ++ });
        voirToutLeTableau();
        return { zoom: Number(zoom.toFixed(3)),
                 vus: points.every(p => panX + p.x * zoom >= 0 && panX + p.x * zoom <= canvas.clientWidth) };
    });
    r.verifie('un petit dessin ne se met pas à occuper tout l\'écran',
        surDuPetit.zoom <= 2 && surDuPetit.zoom > 0.05, String(surDuPetit.zoom));
    r.verifie('et il reste tout de même dans l\'écran', surDuPetit.vus, JSON.stringify(surDuPetit));

    // ---------------------------------------------------------------
    // 4. Il sort de la présentation, qui retient la vue
    // ---------------------------------------------------------------
    await preparer();
    const depuisLaPresentation = await page.evaluate(() => {
        selectedItems = [{ type: 'image', id: images[0].id }];
        presenterLeDocument();
        const dedans = presentationEnCours;
        voirToutLeTableau();
        return { dedans: dedans !== null, apres: presentationEnCours };
    });
    r.egal('« Tout voir » sort de la présentation, qui retenait la vue',
        depuisLaPresentation, { dedans: true, apres: null });

    // ---------------------------------------------------------------
    // 5. Un tableau vide revient au repère
    // ---------------------------------------------------------------
    const surLeVide = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        texts.length = 0; freehands.length = 0; curves.length = 0; polygons.length = 0;
        images.length = 0; arcs.length = 0; htmlPostits.length = 0;
        selectedItems = []; panX = -9000; panY = -9000; zoom = 3.7;
        voirToutLeTableau();
        return { zoom, panX: Math.round(panX), panY: Math.round(panY),
                 L: canvas.clientWidth, H: canvas.clientHeight };
    });
    r.egal('sur un tableau vide, on revient au repère à taille normale',
        { zoom: surLeVide.zoom, panX: surLeVide.panX, panY: surLeVide.panY },
        { zoom: 1, panX: Math.round(surLeVide.L / 2), panY: Math.round(surLeVide.H / 2) });

    // ------------------------------------------------------------------
    // CE QU'ON POSE OCCUPE L'ÉCRAN — AVEC UN PEU DE MARGE, ET PAS PLUS
    //
    // « J'aimerais bien que ce que je découpe sur un PDF et que je dépose sur
    // une page occupe le maximum de l'espace de l'écran, avec un peu de marge. »
    //
    // Mesuré avant d'y toucher, trois exercices découpés et posés : le pavé
    // faisait SOIXANTE-DOUZE pour cent de la largeur et soixante-deux de la
    // hauteur. Il remplissait pourtant déjà toute la place qu'on lui laissait —
    // le mal était ailleurs, en deux endroits :
    //
    //   LES DEUX TIROIRS OUVERTS réservaient deux cent cinquante-deux pixels de
    //   hauteur, vingt-huit pour cent de l'écran. Poser ses exercices est un
    //   geste de monstration ; les tiroirs servent à préparer. Ils se rangent
    //   donc, comme en projetant, et leur languette les rend d'un doigt.
    //
    //   ET ON RANGEAIT DANS UN RECTANGLE QUI N'ÉTAIT PAS CELUI OÙ L'ON
    //   REGARDE : forme de l'écran d'un côté, zone de lecture de l'autre, deux
    //   marges l'une dans l'autre. Les deux se calculent désormais au même
    //   endroit (« zoneDeLectureDesMorceaux »).
    //
    // Et le plafond d'agrandissement — trois fois, « au-delà on ne montre plus
    // que du flou » — ne vaut plus pour ce qui vient d'un PDF : le morceau
    // garde la clé de sa page et la redemande rendue plus fine, jusqu'à douze
    // fois. Il valait pour une découpe d'IMAGE, qui n'a rien à redemander ;
    // elle le garde.
    // ------------------------------------------------------------------
    const occupation = await page.evaluate(async ({ combien }) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        // Une image blanche, comme le reste du chapitre : on mesure de la
        // géométrie, pas des pixels d'encre.
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="160">'
            + '<rect width="900" height="160" fill="#ffffff" stroke="#333333"/></svg>';
        const st = await new Promise(ok => createStampFromSVG(svg, ok));
        while (pages.length > 1) pages.pop();
        loadPage(0);
        images.length = 0; selectedItems = []; morceauxEnAttente = [];
        panX = 0; panY = 0; zoom = 1;
        majLeTiroirDesMorceaux();
        // Les deux tiroirs sont OUVERTS : c'est l'état ordinaire, et c'est lui
        // qui mangeait l'écran.
        const bas = document.getElementById('bottom-drawer');
        const haut = document.getElementById('bar-plugins');
        if (bas.classList.contains('closed')) toggleBottomDrawer();
        if (haut.classList.contains('closed')) togglePluginDrawer();
        await attendre(500);
        // Des morceaux qui viennent d'un PDF : ils portent une clé, donc ils
        // savent se redemander nets.
        for (let i = 0; i < combien; i++) {
            morceauxEnAttente.push({ id: nextId++, w: 900, h: 160, cx: 0, cy: 0,
                                     cw: st.w, ch: st.h, src: st.src,
                                     nom: 'poly.pdf', page: 1, cle: 'poly:1',
                                     pdfRef: 'poly', source: 'doc' });
        }
        majLeTiroirDesMorceaux();
        poserTousLesMorceaux();
        await attendre(700);
        const L = canvas.clientWidth, H = canvas.clientHeight;
        const poses = images.filter(o => o.pluginData && o.pluginData.id === 'morceau');
        if (!poses.length) return null;
        const bords = poses.map(o => [o.x * zoom + panX, o.y * zoom + panY,
                                      o.w * zoom, o.h * zoom]);
        const x1 = Math.min(...bords.map(b => b[0])), y1 = Math.min(...bords.map(b => b[1]));
        const x2 = Math.max(...bords.map(b => b[0] + b[2])), y2 = Math.max(...bords.map(b => b[1] + b[3]));
        return {
            combien: poses.length,
            partDeLaLargeur: Math.round(1000 * (x2 - x1) / L) / 10,
            partDeLaHauteur: Math.round(1000 * (y2 - y1) / H) / 10,
            // La marge : ce qui reste de chaque côté, en pixels d'écran.
            margeGauche: Math.round(x1), margeDroite: Math.round(L - x2),
            margeHaut: Math.round(y1), margeBas: Math.round(H - y2),
            tiroirsRanges: document.getElementById('bottom-drawer').classList.contains('closed')
                && document.getElementById('bar-plugins').classList.contains('closed')
        };
    }, { combien: 3 });

    r.verifie('TROIS EXERCICES POSÉS OCCUPENT L\'ÉCRAN : 72 % de la largeur avant, parce qu\'on cadrait sous deux tiroirs ouverts et dans une zone qui n\'était pas celle où l\'on regarde',
        occupation && occupation.partDeLaLargeur > 90, JSON.stringify(occupation));
    r.verifie('et ils en prennent la hauteur aussi, autant que leur forme le permet',
        occupation && occupation.partDeLaHauteur > 75, JSON.stringify(occupation));
    // « AVEC UN PEU DE MARGE » : il y en a une, et elle reste petite.
    //
    // De côté, c'est la marge du cadrage, au pixel — quarante-cinq ici, cinq
    // pour cent du petit côté. En haut et en bas s'y ajoutent le bandeau de
    // trente pixels que l'écran garde toujours, et le reste du centrage quand
    // la forme du pavé ne remplit pas tout : quatre-vingt-cinq mesurés. Une
    // première version de ce contrôle demandait soixante-dix au plus partout
    // et tombait là-dessus — elle réclamait que la marge verticale ignore des
    // bandeaux qui existent.
    r.verifie('AVEC UN PEU DE MARGE, ET PAS PLUS : la marge de côté est celle du cadrage, au pixel, et aucune ne dépasse le dixième de l\'écran',
        occupation && occupation.margeGauche === occupation.margeDroite
        && occupation.margeGauche >= 20 && occupation.margeGauche <= 70
        && [occupation.margeHaut, occupation.margeBas].every(m => m >= 20 && m <= 110),
        JSON.stringify(occupation));
    r.verifie('les tiroirs se sont rangés, comme en projetant — leur languette les rend d\'un doigt',
        occupation && occupation.tiroirsRanges, JSON.stringify(occupation));

    // UN TIROIR RANGÉ NE RÉSERVE PLUS RIEN. Il gardait son rectangle entier une
    // fois coulissé dehors : on cadrait sous un meuble absent, et ce qu'on
    // montrait à la classe était plus petit de cent vingt pixels pour rien.
    const bandeaux = await page.evaluate(() => {
        const bas = document.getElementById('bottom-drawer');
        const haut = document.getElementById('bar-plugins');
        if (!bas.classList.contains('closed')) toggleBottomDrawer();
        if (!haut.classList.contains('closed')) togglePluginDrawer();
        return bandeauxDeLEcran();
    });
    r.egal('UN TIROIR RANGÉ NE RÉSERVE PLUS DE HAUTEUR : il gardait son rectangle une fois sorti de l\'écran, et l\'on cadrait sous un meuble absent',
        [bandeaux.enHaut, bandeaux.enBas], [30, 30], JSON.stringify(bandeaux));

    // ET LE PLAFOND REGARDE CE QU'IL PROTÈGE. Un morceau de PDF se redemande
    // net jusqu'à douze fois ; une découpe d'image n'a rien à redemander.
    const plafonds = await page.evaluate(() => ({
        venuDUnPdf: plafondDAgrandissement([{ pluginData: { cle: 'poly:1' } }]),
        venuDUneImage: plafondDAgrandissement([{ pluginData: {} }]),
        lesDeux: plafondDAgrandissement([{ pluginData: { cle: 'poly:1' } }, { pluginData: {} }])
    }));
    r.egal('UN MORCEAU DE PDF S\'AGRANDIT JUSQU\'À DOUZE FOIS : il garde la clé de sa page et la redemande rendue plus fine — le plafond de trois ne le protégeait de rien, il le rapetissait',
        plafonds.venuDUnPdf, 12, JSON.stringify(plafonds));
    r.egal('UNE DÉCOUPE D\'IMAGE GARDE SON PLAFOND DE TROIS : ses pixels sont ceux qu\'on a, et au-delà on ne montre plus que du flou',
        plafonds.venuDUneImage, 3, JSON.stringify(plafonds));
    r.egal('et un lot mêlé prend le plus petit des deux : une seule échelle pour tout le monde, c\'est le plus fragile qui commande',
        plafonds.lesDeux, 3, JSON.stringify(plafonds));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
