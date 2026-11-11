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
    // 1. LE GESTE EXISTE, ET IL EST DANS LA BARRE DE L'OBJET.
    // ------------------------------------------------------------------
    const boutons = await page.evaluate(() => {
        const p = document.getElementById('btn-quick-plus');
        const m = document.getElementById('btn-quick-moins');
        return { plus: !!p, moins: !!m,
                 bullePlus: p ? (p.getAttribute('data-tooltip') || p.title || '') : '',
                 bulleMoins: m ? (m.getAttribute('data-tooltip') || m.title || '') : '' };
    });
    r.egal('les deux boutons sont dans la barre flottante de l\'objet',
        [boutons.plus, boutons.moins], [true, true], JSON.stringify(boutons));
    r.verifie('et chacun dit ce qu\'il fait',
        /agrandir/i.test(boutons.bullePlus) && /rétrécir/i.test(boutons.bulleMoins),
        JSON.stringify(boutons));

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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
