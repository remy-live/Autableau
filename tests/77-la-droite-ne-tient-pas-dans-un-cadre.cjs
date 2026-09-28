// LA DROITE NE TIENT PAS DANS UN CADRE.
//
// « J'ai un bug : j'ai tracé une ligne sur un pdf, en le bougeant, la ligne
// disparaît et réapparaît. » Puis, la fois d'après : « j'avais dessiné une
// droite et j'ai déplacé la page du pdf qui était en plein écran. »
//
// CE QUI SE PASSAIT, MESURÉ. Une page rognée coupe l'encre qu'on a posée
// dessus — c'était la réponse à un autre défaut, « quand je croppe et que je
// déplace, des bouts de ce qui était dans le pdf sortent du cadre ». Pour ne
// pas couper AUSSI le trait qu'on a volontairement tiré dans la marge d'une
// page déjà rognée, chaque annotation note ce que la page montrait quand on
// l'a posée : tant que la page montre la même chose, on ne coupe rien.
//
// Cette note ne bougeait jamais. Or faire COULISSER la page change ce qu'elle
// montre au premier pixel. Dès le plus petit glissement, tout ce qu'on avait
// écrit se coupait donc net aux bords de la page. Sur un trait qui tient dans
// la page, cela ne se voyait pas. Sur une DROITE, qui va d'un bord du tableau
// à l'autre, les trois quarts s'éteignaient d'un coup — et revenaient si l'on
// ramenait la page à sa place. Mesuré avant correction : 7788 pixels rouges
// au repos, 3597 après quarante pixels de glissement.
//
// DEUX CHOSES SONT CORRIGÉES, ET CE CHAPITRE LES TIENT :
//
//   1. Une droite et une demi-droite ne se coupent pas au cadre d'une page.
//      Elles n'ont pas de bout : ce ne sont pas des morceaux d'encre posés
//      SUR une région, ce sont des constructions qui traversent le tableau.
//   2. L'affinage d'une page — le redessin plus fin qu'elle se fait toute
//      seule quand on la regarde de près — remet tous ses cadrages dans une
//      nouvelle unité. La note de chaque annotation change d'unité avec eux,
//      sinon elle désignait une région disparue et la coupe s'allumait toute
//      seule, sans que personne n'ait rien touché.
//
// ET CE QUI NE CHANGE PAS : l'encre ordinaire posée sur une page entière,
// puis rognée au ciseau, se coupe toujours au cadre. C'était le défaut
// d'origine, et il reste corrigé.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

// Le rouge à l'écran : c'est la seule preuve qui compte. Ce qui est déclaré
// dans les objets ne dit pas ce qu'on voit.
const COMPTER_LE_ROUGE = () => {
    const cv = document.getElementById('board');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 150 && d[i + 1] < 90 && d[i + 2] < 90) n++;
    }
    return n;
};

module.exports = async function (browser) {
    const r = creerRapport('La droite ne tient pas dans un cadre');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof cadreQuiRogneCetObjet === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    // Un PDF posé, assez grand pour qu'une droite tracée dedans dépasse
    // largement de ses quatre côtés.
    const poserLeDocument = async () => page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; freehands.length = 0; texts.length = 0;
        segments.length = 0; points.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1200));
        const doc = images[0];
        doc.x = 300; doc.y = 100; doc.w = 600; doc.h = 450;
        selectedItems = [{ type: 'image', id: doc.id }];
        modeDocument = 'page';
        majBarreDocument();
        activeStyle.strokeColor = '#ff0000';
        activeStyle.lineWidth = 6;
        draw();
        return doc.id;
    }, { octets });

    await poserLeDocument();

    // ==================================================================
    // 1. LA PAGE QUI COULISSE N'ÉTEINT PLUS LA DROITE
    // ==================================================================
    // On zoome d'abord DANS la page — sans cela elle est entière, ne
    // coulisse pas, et le défaut n'a pas lieu d'être.
    const zoome = await page.evaluate(async () => {
        const doc = images[0];
        zoomerPage(doc, { x: doc.x + doc.w / 2, y: doc.y + doc.h / 2 }, 2);
        await new Promise(ok => setTimeout(ok, 700));   // on laisse l'affinage se poser
        draw();
        return { rognee: documentEstRogne(doc) };
    });
    r.verifie('la page zoomée est rognée : elle peut coulisser', zoome.rognee,
        JSON.stringify(zoome));

    const poserUneDroite = async (type) => page.evaluate((type) => {
        segments.length = 0; points.length = 0;
        const doc = images[0];
        const a = { id: nextId++, x: doc.x + doc.w * 0.35, y: doc.y + doc.h * 0.45 };
        const b = { id: nextId++, x: doc.x + doc.w * 0.65, y: doc.y + doc.h * 0.55 };
        points.push(a, b);
        const d = { id: nextId++, p1_id: a.id, p2_id: b.id, lineType: type,
                    color: '#ff0000', width: 6, z: globalZ++ };
        segments.push(d);
        accrocherLesNouvellesFormes(d.id - 2);
        selectedItems = [];
        draw();
        return { accrochee: !!(d.surObjet && d.surObjet.type === 'image'),
                 coupee: !!cadreQuiRogneCetObjet(d) };
    }, type);

    const glisser = async (dx, dy) => page.evaluate(async ({ dx, dy }) => {
        const doc = images[0];
        const p = { x: doc.x + doc.w / 2, y: doc.y + doc.h / 2 };
        demarrerGlissePage(doc, p);
        poursuivreGlissePage({ x: p.x + dx, y: p.y + dy });
        glissePage = null;
        draw();
        await new Promise(ok => requestAnimationFrame(ok));
        const d = segments[0];
        return { coupee: !!cadreQuiRogneCetObjet(d), cy: Math.round(doc.cy) };
    }, { dx, dy });

    const depart = await poserUneDroite('droite');
    r.verifie('la droite s\'accroche bien à la page', depart.accrochee, JSON.stringify(depart));
    const rougeAuRepos = await page.evaluate(COMPTER_LE_ROUGE);
    r.verifie('et elle traverse le tableau de part en part',
        rougeAuRepos > 5000, String(rougeAuRepos));

    const petitGlissement = await glisser(0, -40);
    const rougeApresUnPeu = await page.evaluate(COMPTER_LE_ROUGE);
    r.verifie('la page a bien coulissé', petitGlissement.cy !== 0,
        JSON.stringify(petitGlissement));
    r.verifie('quarante pixels de glissement n\'éteignent rien',
        rougeApresUnPeu > rougeAuRepos * 0.95,
        `${rougeAuRepos} au repos, ${rougeApresUnPeu} après`);
    r.verifie('et la droite n\'est pas coupée au cadre de la page',
        petitGlissement.coupee === false, JSON.stringify(petitGlissement));

    // On continue de tirer dans tous les sens : à aucun moment le trait ne
    // s'éteint. C'est le geste de la plainte, répété.
    const parcours = [];
    for (const [dx, dy] of [[0, -60], [-80, 0], [0, 70], [90, 0], [0, -120], [-140, 0]]) {
        await glisser(dx, dy);
        parcours.push(await page.evaluate(COMPTER_LE_ROUGE));
    }
    r.verifie('et rien ne s\'éteint au long du parcours',
        parcours.every(n => n > rougeAuRepos * 0.9), JSON.stringify(parcours));

    // La demi-droite part et ne s'arrête pas non plus.
    await poserLeDocument();
    await page.evaluate(async () => {
        const doc = images[0];
        zoomerPage(doc, { x: doc.x + doc.w / 2, y: doc.y + doc.h / 2 }, 2);
        await new Promise(ok => setTimeout(ok, 700));
        draw();
    });
    await poserUneDroite('demi-droite');
    const demiAuRepos = await page.evaluate(COMPTER_LE_ROUGE);
    const demiGlissee = await glisser(0, -60);
    const demiApres = await page.evaluate(COMPTER_LE_ROUGE);
    r.verifie('la demi-droite non plus ne se coupe pas au cadre',
        demiGlissee.coupee === false, JSON.stringify(demiGlissee));
    r.verifie('et elle garde sa longueur en faisant coulisser la page',
        demiApres > demiAuRepos * 0.95, `${demiAuRepos} puis ${demiApres}`);

    // ==================================================================
    // 2. CE QU'ON A ÉCRIT SUR LA PARTIE RETIRÉE SE COUPE TOUJOURS
    //
    // L'autre moitié de la règle. Sans ce contrôle, la correction ci-dessus
    // pourrait avoir été obtenue en supprimant la coupe, ce qui rendrait le
    // défaut d'origine : « quand je croppe et que je déplace, des bouts de ce
    // qui était dans le pdf sortent du cadre ».
    // ==================================================================
    await poserLeDocument();
    const bavure = await page.evaluate(async () => {
        const doc = images[0];
        const nat = imageCache[doc.src];
        // Page ENTIÈRE, et un trait au crayon qui court d'un bord à l'autre,
        // bien au-delà des futurs bords.
        doc.cx = 0; doc.cy = 0; doc.cw = nat.naturalWidth; doc.ch = nat.naturalHeight;
        const trait = { id: nextId++, color: '#ff0000', width: 8, z: globalZ++,
            points: [] };
        for (let i = 0; i <= 40; i++) {
            trait.points.push({ x: doc.x - 200 + i * (doc.w + 400) / 40,
                                y: doc.y + doc.h * 0.5 });
        }
        freehands.push(trait);
        encreAccrochee = true;
        accrocherLeTrait(trait);
        selectedItems = [];
        draw();
        await new Promise(ok => requestAnimationFrame(ok));
        return { accroche: !!(trait.surObjet && trait.surObjet.type === 'image'),
                 coupe: !!cadreQuiRogneCetObjet(trait) };
    });
    r.verifie('le trait au crayon s\'accroche à la page', bavure.accroche,
        JSON.stringify(bavure));
    r.verifie('sur une page entière, rien n\'est coupé — ce qui dépasse est voulu',
        bavure.coupe === false, JSON.stringify(bavure));
    const rougeEtale = await page.evaluate(COMPTER_LE_ROUGE);

    // Puis on rogne au ciseau : la page ne montre plus que son milieu.
    const apresLeCiseau = await page.evaluate(async () => {
        const doc = images[0];
        const nat = imageCache[doc.src];
        doc.cx = nat.naturalWidth * 0.25; doc.cw = nat.naturalWidth * 0.5;
        doc.cy = nat.naturalHeight * 0.25; doc.ch = nat.naturalHeight * 0.5;
        draw();
        await new Promise(ok => requestAnimationFrame(ok));
        return { coupe: !!cadreQuiRogneCetObjet(freehands[0]) };
    });
    const rougeCoupe = await page.evaluate(COMPTER_LE_ROUGE);
    r.verifie('une fois la page rognée, le trait est coupé à son cadre',
        apresLeCiseau.coupe === true, JSON.stringify(apresLeCiseau));
    r.verifie('et ce qui débordait ne se voit plus',
        rougeCoupe < rougeEtale * 0.75, `${rougeEtale} étalé, ${rougeCoupe} coupé`);

    // ==================================================================
    // 3. L'AFFINAGE SEUL N'ALLUME PAS LA COUPE
    //
    // Une page se redessine plus finement dès qu'on la regarde de près. La
    // même région se compte alors en plus de pixels, et tous les cadrages du
    // document changent d'unité. La note de chaque annotation doit changer
    // avec eux : sinon elle désigne une région qui n'existe plus, et la coupe
    // s'allume toute seule. Mesuré avant correction : une page rendue trois
    // fois plus fine suffisait.
    // ==================================================================
    await poserLeDocument();
    const affinage = await page.evaluate(async () => {
        const doc = images[0];
        const nat = imageCache[doc.src];
        doc.cx = nat.naturalWidth * 0.2; doc.cw = nat.naturalWidth * 0.6;
        doc.cy = nat.naturalHeight * 0.2; doc.ch = nat.naturalHeight * 0.6;
        // Un trait au crayon POSÉ MAINTENANT : en connaissance de cause.
        const trait = { id: nextId++, color: '#ff0000', width: 8, z: globalZ++,
            points: [{ x: doc.x + 40, y: doc.y + 100 }, { x: doc.x + 400, y: doc.y + 160 }] };
        freehands.push(trait);
        encreAccrochee = true;
        accrocherLeTrait(trait);
        const avant = { coupe: !!cadreQuiRogneCetObjet(trait),
                        cw: Math.round(doc.cw),
                        vu: Math.round(trait.surObjet.rogne.cw) };
        // On regarde la page de bien plus près : elle se redessine.
        zoom = 3; draw();
        const fait = await affinerLaPage(doc);
        await new Promise(ok => setTimeout(ok, 200));
        return { avant, fait,
                 apres: { coupe: !!cadreQuiRogneCetObjet(trait),
                          cw: Math.round(doc.cw),
                          vu: Math.round(trait.surObjet.rogne.cw) } };
    });
    r.verifie('la page se redessine bien plus finement', affinage.fait === true,
        JSON.stringify(affinage));
    r.verifie('et son cadrage change d\'unité', affinage.apres.cw > affinage.avant.cw * 1.5,
        JSON.stringify(affinage));
    r.verifie('la note de l\'encre change d\'unité avec lui',
        affinage.apres.vu === affinage.apres.cw, JSON.stringify(affinage));
    r.egal('avant l\'affinage, rien n\'était coupé', affinage.avant.coupe, false,
        JSON.stringify(affinage));
    r.egal('après l\'affinage non plus : personne n\'a rien touché',
        affinage.apres.coupe, false, JSON.stringify(affinage));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
