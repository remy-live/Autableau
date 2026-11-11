// AGRANDIR OU RÉTRÉCIR CE QU'ON TIENT.
//
// « Lorsque je sélectionne un objet ou une zone du tableau, est-il possible de
// l'agrandir ou de la rétrécir ? » — avec, en image, un trait à main levée
// sélectionné et sa barre flottante : verrouiller, dupliquer, tourner,
// retourner, lien, supprimer. Rien pour la taille.
//
// La réponse était non, et elle surprenait à juste titre. Les poignées de coin
// n'existent que pour QUATRE familles — image, texte, rectangle, ellipse
// libre. Un trait à main levée, une figure de géométrie, un groupe d'objets
// n'avaient aucun moyen de changer de taille.
//
// Le calcul, lui, existait déjà : quand on fait coulisser une page de PDF,
// toute l'encre accrochée la suit ET se met à l'échelle. Il manquait le geste.
//
// LE GESTE EST UNE POIGNÉE, ET RIEN D'AUTRE. J'avais commencé par deux
// boutons dans la barre flottante. « Pour agrandir et diminuer un trait, il
// faut des poignées, pas des icônes comme il existe déjà : c'est absurde. »
// C'est juste : une image se tire par ses coins depuis toujours, et offrir un
// second geste pour la même idée — selon ce qu'on tient — c'est demander
// d'apprendre deux fois la même chose. Les boutons sont partis.
//
// CE CHAPITRE MESURE CE QUE « AGRANDIR » VEUT DIRE, et ce n'est pas seulement
// « plus loin du centre ». Un dessin deux fois plus grand tracé au même crayon
// fin n'a pas été agrandi : il a été étiré. Un texte dont les lettres ne
// changent pas non plus. On vérifie donc les POSITIONS et les TAILLES —
// épaisseurs, corps de police, rayons — famille par famille.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Agrandir une sélection');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    // Un tableau qui porte une de chaque : c'est là que les oublis se voient.
    const poser = () => page.evaluate(() => {
        const pt = (x, y) => { const p = { id: nextId++, x, y, z: globalZ++ }; points.push(p); return p.id; };
        const a = pt(0, 0), b = pt(100, 0), c = pt(0, 60);
        segments.push({ id: nextId++, p1_id: a, p2_id: b, color: '#000', width: 3, z: globalZ++ });
        freehands.push({ id: nextId++, points: [{ x: 0, y: 100 }, { x: 50, y: 150 }, { x: 100, y: 100 }],
                         color: '#c0392b', width: 4, z: globalZ++ });
        texts.push({ id: nextId++, x: 200, y: 0, content: 'Énoncé', fontSize: 20,
                     lineHeight: 26, color: '#000', z: globalZ++ });
        arcs.push({ id: nextId++, cx: 300, cy: 200, radius: 40, startAngle: 0,
                    endAngle: 2, color: '#000', width: 2, z: globalZ++ });
        // « libre » est ce qui distingue l'ellipse dessinée du cercle construit
        // par deux points : sans ce drapeau, l'application la cherche par ses
        // points — qu'elle n'a pas — et le contrôle mesure autre chose.
        circles.push({ id: nextId++, libre: true, cx: 0, cy: 300, rx: 50, ry: 30,
                       color: '#000', width: 2, z: globalZ++ });
        saveState();
        return { c };
    });
    await poser();
    await page.waitForTimeout(200);

    const releve = () => page.evaluate(() => {
        const f = freehands[0], t = texts[0], arc = arcs[0], el = circles[0], sg = segments[0];
        const p1 = getObjectById('point', sg.p1_id), p2 = getObjectById('point', sg.p2_id);
        return {
            trait: { x0: f.points[0].x, x2: f.points[2].x, largeur: +f.width.toFixed(3) },
            texte: { x: t.x, corps: +t.fontSize.toFixed(3), interligne: +t.lineHeight.toFixed(3) },
            arc: { cx: +arc.cx.toFixed(3), rayon: +arc.radius.toFixed(3), largeur: +arc.width.toFixed(3) },
            ellipse: { cx: +el.cx.toFixed(3), rx: +el.rx.toFixed(3), ry: +el.ry.toFixed(3),
                       largeur: +el.width.toFixed(3) },
            segment: { ax: +p1.x.toFixed(3), bx: +p2.x.toFixed(3), largeur: +sg.width.toFixed(3) }
        };
    });

    const toutPrendre = () => page.evaluate(() => {
        selectedItems = []
            .concat(points.map(o => ({ type: 'point', id: o.id })))
            .concat(segments.map(o => ({ type: 'segment', id: o.id })))
            .concat(freehands.map(o => ({ type: 'freehand', id: o.id })))
            .concat(texts.map(o => ({ type: 'text', id: o.id })))
            .concat(arcs.map(o => ({ type: 'arc', id: o.id })))
            .concat(circles.map(o => ({ type: 'circle', id: o.id })));
        return selectedItems.length;
    });

    // ------------------------------------------------------------------
    // 1. LE GESTE EST UNE POIGNÉE, DU MÊME IDIOME QUE CELLES DE L'IMAGE.
    //
    // Quatre coins, et rien que les coins : les côtés étireraient — ils
    // changent une largeur sans l'autre —, et un dessin étiré n'est pas un
    // dessin agrandi. Les familles qui ont leurs propres poignées de côté les
    // gardent, parce que là un côté veut dire quelque chose : la colonne d'un
    // texte, le rognage d'une image.
    // ------------------------------------------------------------------
    const laBoite = await page.evaluate(() => {
        selectedItems = [{ type: 'freehand', id: freehands[0].id }];
        const b = boiteAPoigneesDeLaSelection();
        if (!b) return null;
        const coins = coinsDeLaBoiteDeSelection(b);
        const f = freehands[0];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        f.points.forEach(p => {
            x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
            y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        });
        return { coins: coins.map(c => c.nom), nombre: coins.length,
                 entoure: b.x <= x0 + 0.01 && b.y <= y0 + 0.01
                          && b.x + b.w >= x1 - 0.01 && b.y + b.h >= y1 - 0.01 };
    });
    r.verifie('un trait à main levée sélectionné reçoit une boîte à poignées',
        !!laBoite, 'aucune boîte');
    r.egal('quatre coins, et rien que les coins',
        laBoite && [laBoite.nombre, laBoite.coins],
        [4, ['SEL_TL', 'SEL_TR', 'SEL_BR', 'SEL_BL']], JSON.stringify(laBoite));
    r.egal('et la boîte entoure bien ce qu\'on tient', laBoite && laBoite.entoure, true,
        JSON.stringify(laBoite));

    // ON LA SAISIT LÀ OÙ ON LA VOIT. C'est « findObjectAt » qui la rend, avant
    // les points : un sommet posé sous un coin ne doit pas prendre le geste.
    const saisie = await page.evaluate(() => {
        const b = boiteAPoigneesDeLaSelection();
        return coinsDeLaBoiteDeSelection(b).map(c => {
            const o = findObjectAt(c.x, c.y);
            return o && o.type === 'handle' ? o.name : (o ? o.type : null);
        });
    });
    r.egal('chacun des quatre coins se laisse prendre',
        saisie, ['SEL_TL', 'SEL_TR', 'SEL_BR', 'SEL_BL'], JSON.stringify(saisie));

    // ET UNE IMAGE SEULE GARDE LES SIENNES : deux jeux de poignées sur le même
    // objet se disputeraient le même pixel.
    const pasDeDoublon = await page.evaluate(() => {
        const im = { id: nextId++, x: 500, y: 500, w: 100, h: 80, cx: 0, cy: 0,
                     cw: 100, ch: 80, src: '', z: globalZ++ };
        images.push(im);
        selectedItems = [{ type: 'image', id: im.id }];
        const b = boiteAPoigneesDeLaSelection();
        // et à deux, la boîte revient : l'image n'est plus seule.
        selectedItems = [{ type: 'image', id: im.id },
                         { type: 'freehand', id: freehands[0].id }];
        const b2 = boiteAPoigneesDeLaSelection();
        images.pop();
        return { imageSeule: !!b, aDeux: !!b2 };
    });
    r.egal('une image seule garde ses propres poignées, sans boîte en plus',
        pasDeDoublon.imageSeule, false, JSON.stringify(pasDeDoublon));
    r.egal('mais dès qu\'on en tient deux, la boîte paraît',
        pasDeDoublon.aDeux, true, JSON.stringify(pasDeDoublon));

    // ------------------------------------------------------------------
    // 2. UN TRAIT À MAIN LEVÉE SEUL — exactement le cas de la capture.
    // ------------------------------------------------------------------
    const avantTrait = await releve();
    await page.evaluate(() => {
        selectedItems = [{ type: 'freehand', id: freehands[0].id }];
        agrandirLaSelection();
    });
    await page.waitForTimeout(150);
    const apresTrait = await releve();
    const etendue = (t) => t.trait.x2 - t.trait.x0;
    r.verifie('LE TRAIT À MAIN LEVÉE S\'AGRANDIT — c\'était la question',
        Math.abs(etendue(apresTrait) - etendue(avantTrait) * 1.25) < 0.01,
        JSON.stringify([avantTrait.trait, apresTrait.trait]));
    r.verifie('ET SON CRAYON AVEC : un dessin plus grand au même trait fin serait étiré, pas agrandi',
        Math.abs(apresTrait.trait.largeur - avantTrait.trait.largeur * 1.25) < 0.01,
        JSON.stringify([avantTrait.trait, apresTrait.trait]));

    // Et le rétrécissement rend exactement ce qu'il a pris.
    await page.evaluate(() => retrecirLaSelection());
    await page.waitForTimeout(150);
    const revenu = await releve();
    r.verifie('rétrécir après agrandir redonne la taille de départ',
        Math.abs(etendue(revenu) - etendue(avantTrait)) < 0.01
        && Math.abs(revenu.trait.largeur - avantTrait.trait.largeur) < 0.01,
        JSON.stringify([avantTrait.trait, revenu.trait]));

    // ------------------------------------------------------------------
    // 3. UNE SÉLECTION DE TOUT — « ou une zone du tableau ».
    //    Chaque famille doit grandir, position ET taille.
    // ------------------------------------------------------------------
    const avant = await releve();
    const combien = await toutPrendre();
    r.verifie('on tient bien une sélection de plusieurs familles', combien >= 6,
        String(combien));
    await page.evaluate(() => agrandirLaSelection());
    await page.waitForTimeout(200);
    const apres = await releve();

    const presque = (a, b) => Math.abs(a - b) < 0.02;
    r.verifie('le texte grossit : son corps ET son interligne',
        presque(apres.texte.corps, avant.texte.corps * 1.25)
        && presque(apres.texte.interligne, avant.texte.interligne * 1.25),
        JSON.stringify([avant.texte, apres.texte]));
    r.verifie('l\'arc grossit : son rayon et son trait',
        presque(apres.arc.rayon, avant.arc.rayon * 1.25)
        && presque(apres.arc.largeur, avant.arc.largeur * 1.25),
        JSON.stringify([avant.arc, apres.arc]));
    r.verifie('l\'ellipse grossit : ses deux rayons et son trait',
        presque(apres.ellipse.rx, avant.ellipse.rx * 1.25)
        && presque(apres.ellipse.ry, avant.ellipse.ry * 1.25)
        && presque(apres.ellipse.largeur, avant.ellipse.largeur * 1.25),
        JSON.stringify([avant.ellipse, apres.ellipse]));
    r.verifie('le segment s\'allonge, et son trait s\'épaissit',
        presque(apres.segment.bx - apres.segment.ax,
                (avant.segment.bx - avant.segment.ax) * 1.25)
        && presque(apres.segment.largeur, avant.segment.largeur * 1.25),
        JSON.stringify([avant.segment, apres.segment]));

    // L'ÉPAISSEUR NE SE MULTIPLIE PAS DEUX FOIS. L'ellipse libre est épaissie
    // dans son propre bloc, avec ses rayons ; un second passage lui aurait
    // appliqué le facteur au carré — quatre fois plus épais pour un double.
    r.verifie('et aucune épaisseur n\'a été multipliée deux fois',
        presque(apres.ellipse.largeur, avant.ellipse.largeur * 1.25),
        'carré attendu si doublon : ' + (avant.ellipse.largeur * 1.5625));

    // ------------------------------------------------------------------
    // 4. CE QU'ON REGARDE RESTE OÙ ON LE REGARDE. On agrandit autour du
    //    CENTRE de la sélection : sinon le dessin part vers le bas à droite à
    //    chaque appui, et devant une classe on le rattrape à la main.
    // ------------------------------------------------------------------
    const centre = await page.evaluate(() => {
        const b = getSelectionLogicalBounds();
        const c = { x: b.bx + b.bw / 2, y: b.by + b.bh / 2 };
        agrandirLaSelection();
        const b2 = getSelectionLogicalBounds();
        const c2 = { x: b2.bx + b2.bw / 2, y: b2.by + b2.bh / 2 };
        return { avant: [Math.round(c.x), Math.round(c.y)],
                 apres: [Math.round(c2.x), Math.round(c2.y)],
                 grandi: +(b2.bw / b.bw).toFixed(3) };
    });
    await page.waitForTimeout(150);
    r.verifie('le centre de la sélection ne bouge pas',
        Math.abs(centre.apres[0] - centre.avant[0]) <= 1
        && Math.abs(centre.apres[1] - centre.avant[1]) <= 1, JSON.stringify(centre));
    r.verifie('et la sélection a bien grandi d\'un quart',
        Math.abs(centre.grandi - 1.25) < 0.02, JSON.stringify(centre));

    // ------------------------------------------------------------------
    // 5. UN OBJET VERROUILLÉ NE CHANGE PAS DE TAILLE, comme il ne tourne pas.
    // ------------------------------------------------------------------
    const verrou = await page.evaluate(() => {
        const f = freehands[0];
        f.locked = true;
        delete f.groupId;
        selectedItems = [{ type: 'freehand', id: f.id }];
        const avantL = f.points[2].x - f.points[0].x;
        const rendu = agrandirLaSelection();
        const apresL = f.points[2].x - f.points[0].x;
        f.locked = false;
        return { rendu, bouge: Math.abs(apresL - avantL) > 0.01 };
    });
    r.egal('un trait verrouillé refuse de grandir', [verrou.rendu, verrou.bouge],
        [false, false], JSON.stringify(verrou));

    // ------------------------------------------------------------------
    // 6. RIEN DE TENU, RIEN NE SE PASSE — et surtout, rien ne lève.
    // ------------------------------------------------------------------
    const vide = await page.evaluate(() => {
        selectedItems = [];
        try { return { rendu: agrandirLaSelection(), leve: false }; }
        catch (e) { return { rendu: null, leve: e.message }; }
    });
    r.egal('sans sélection, agrandir ne fait rien et ne lève pas',
        [vide.rendu, vide.leve], [false, false], JSON.stringify(vide));

    // ------------------------------------------------------------------
    // 7. ET L'ON TIRE VRAIMENT LA POIGNÉE — c'est le geste, pas la fonction.
    //
    // Tout ce qui précède appelle le calcul directement. Ici on pose le doigt
    // sur un coin et on le tire : c'est le seul contrôle qui éprouve la chaîne
    // entière — la détection du coin, la prise, le facteur lu d'une image à
    // l'autre, le coin opposé qui ne bouge pas.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        // Un tableau net : un seul trait, bien au milieu de l'écran.
        points.length = 0; segments.length = 0; freehands.length = 0;
        texts.length = 0; arcs.length = 0; circles.length = 0;
        freehands.push({ id: nextId++, color: '#000', width: 4, z: globalZ++,
            points: [{ x: -150, y: -80 }, { x: 0, y: 40 }, { x: 150, y: -80 }] });
        selectedItems = [{ type: 'freehand', id: freehands[0].id }];
        zoom = 1; panX = window.innerWidth / 2; panY = window.innerHeight / 2;
        saveState(); draw();
    });
    await page.waitForTimeout(150);

    const ou = await page.evaluate(() => {
        const b = boiteAPoigneesDeLaSelection();
        const c = coinsDeLaBoiteDeSelection(b).find(x => x.nom === 'SEL_BR');
        const ancre = ancreDuCoinOppose('SEL_BR', b);
        return {
            coinEcran: [c.x * zoom + panX, c.y * zoom + panY],
            ancreMonde: [ancre.x, ancre.y],
            avant: { w: +b.w.toFixed(2), h: +b.h.toFixed(2),
                     largeur: +freehands[0].width.toFixed(3) }
        };
    });

    // On tire le coin bas-droit de soixante pixels en diagonale.
    await page.mouse.move(ou.coinEcran[0], ou.coinEcran[1]);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(ou.coinEcran[0] + i * 5, ou.coinEcran[1] + i * 5);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);

    // ON NE DÉRÉFÉRENCE PAS LA BOÎTE SANS L'AVOIR. Si la poignée n'est plus
    // saisissable, le geste devient un lasso qui vide la sélection : il n'y a
    // alors plus de boîte, et un contrôle qui l'ignore PLANTE au lieu de
    // TOMBER. Un test qui plante n'accuse rien — il emporte avec lui tous les
    // autres contrôles du chapitre, et l'on ne sait plus ce qui marchait.
    const tire = await page.evaluate(() => {
        const b = boiteAPoigneesDeLaSelection();
        const f = freehands[0];
        return { prise: !!b,
                 w: b ? +b.w.toFixed(2) : 0, h: b ? +b.h.toFixed(2) : 0,
                 largeur: f ? +f.width.toFixed(3) : 0,
                 x0: f ? +f.points[0].x.toFixed(2) : 0,
                 y0: f ? +f.points[0].y.toFixed(2) : 0 };
    });
    r.egal('la poignée a bien été prise — sans quoi le geste n\'était qu\'un lasso',
        tire.prise, true, JSON.stringify(tire));
    r.verifie('TIRER LA POIGNÉE AGRANDIT VRAIMENT — c\'était la demande',
        tire.w > ou.avant.w * 1.05 && tire.h > ou.avant.h * 1.05,
        JSON.stringify([ou.avant, tire]));
    r.verifie('la boîte garde ses proportions : on agrandit, on n\'étire pas',
        Math.abs((tire.w / ou.avant.w) - (tire.h / ou.avant.h)) < 0.02,
        JSON.stringify([ou.avant, tire]));
    r.verifie('et le crayon a suivi',
        tire.largeur > ou.avant.largeur * 1.05, JSON.stringify([ou.avant, tire]));
    // LE COIN OPPOSÉ NE BOUGE PAS : c'est l'idiome de l'image et du texte, et
    // c'est ce qui fait qu'on sait où le dessin va grandir avant de tirer.
    r.verifie('le coin opposé est resté en place',
        Math.abs(tire.x0 - ou.ancreMonde[0]) < 1.5
        && Math.abs(tire.y0 - ou.ancreMonde[1]) < 1.5,
        JSON.stringify([ou.ancreMonde, [tire.x0, tire.y0]]));

    // ET UN SEUL PAS D'ANNULATION POUR UN SEUL GESTE. Le calcul est appelé à
    // chaque image du glissement ; s'il écrivait l'historique à chaque fois,
    // les cent étapes du tableau seraient remplies en deux secondes et Ctrl+Z
    // ne rendrait qu'un pixel.
    const retour = await page.evaluate(() => {
        const b0 = boiteAPoigneesDeLaSelection();
        undo();
        const b1 = boiteAPoigneesDeLaSelection();
        return { avant: b0 ? +b0.w.toFixed(2) : null,
                 apres: b1 ? +b1.w.toFixed(2) : null };
    });
    r.verifie('une seule annulation rend toute la taille de départ',
        retour.apres !== null && Math.abs(retour.apres - ou.avant.w) < 1.5,
        JSON.stringify([ou.avant.w, retour]));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
