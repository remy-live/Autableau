// TOURNER ET RETOURNER CE QU'ON TIENT.
//
// « Dans la petite barre, rajoute peut-être un bouton de rotation de 90° et un
// flip vertical et horizontal. C'est toujours pratique. »
//
// Trois gestes, une seule mécanique : une transformation du plan appliquée à
// tout ce qui est tenu. Le quart de tour se fait autour du CENTRE DE LA
// SÉLECTION, le retournement est une symétrie par rapport à son axe médian —
// deux objets tenus ensemble se retournent l'un par rapport à l'autre, et non
// chacun dans son coin.
//
// CE QUE CETTE SUITE TIENT :
//
//   — sur une figure, c'est la symétrie axiale EXACTE : ce sont les points qui
//     bougent, et deux miroirs de suite rendent la figure intacte ;
//   — une image tourne et se retourne pour de vrai — on le lit sur les pixels
//     du tableau, pas seulement dans un drapeau posé sur l'objet ;
//   — et à l'export : ce qu'on montre et ce qu'on distribue sont la même page ;
//   — l'encre posée sur un objet le suit, comme au déplacement ;
//   — le texte reste lisible : son bloc se reflète, ses lettres non ;
//   — un arc reflété se parcourt à l'envers, sinon le miroir montrerait le
//     morceau complémentaire ;
//   — un objet verrouillé ne bouge pas, et tout cela s'annule d'un Ctrl+Z.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Tourner et retourner');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    const vierge = () => page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        texts.length = 0; freehands.length = 0; curves.length = 0; polygons.length = 0;
        images.length = 0; arcs.length = 0; htmlPostits.length = 0;
        selectedItems = []; panX = 400; panY = 350; zoom = 1;
        setMode('pointer'); draw();
    });

    // ---------------------------------------------------------------
    // 1. Sur une figure : la symétrie axiale, exacte
    // ---------------------------------------------------------------
    // Un triangle rectangle, bien reconnaissable : (0,0) (120,0) (0,60).
    const poserLeTriangle = () => page.evaluate(() => {
        points.length = 0; segments.length = 0; selectedItems = [];
        const a = { id: nextId++, x: 0, y: 0, z: globalZ++ };
        const b = { id: nextId++, x: 120, y: 0, z: globalZ++ };
        const c = { id: nextId++, x: 0, y: 60, z: globalZ++ };
        points.push(a, b, c);
        [[a, b], [b, c], [c, a]].forEach(([p, q]) =>
            segments.push({ id: nextId++, p1_id: p.id, p2_id: q.id, color: '#000', width: 3, z: globalZ++ }));
        selectedItems = segments.map(s => ({ type: 'segment', id: s.id }));
        draw();
        return points.map(p => [p.x, p.y]);
    });
    const sommets = () => page.evaluate(() => points.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]));

    await poserLeTriangle();
    await page.evaluate(() => retournerLaSelection('h'));
    // La boîte va de x = 0 à x = 120 : son axe médian est x = 60.
    r.egal('le miroir gauche-droite reflète les points, un à un',
        await sommets(), [[120, 0], [0, 0], [120, 60]]);

    await page.evaluate(() => retournerLaSelection('h'));
    r.egal('deux miroirs de suite rendent la figure intacte',
        await sommets(), [[0, 0], [120, 0], [0, 60]]);

    await page.evaluate(() => retournerLaSelection('v'));
    r.egal('le miroir haut-bas se prend sur l\'axe médian horizontal',
        await sommets(), [[0, 60], [120, 60], [0, 0]]);

    // Un quart de tour autour du centre de la boîte (60, 30).
    await poserLeTriangle();
    await page.evaluate(() => tournerLaSelection(1));
    r.egal('le quart de tour se fait autour du centre de la sélection',
        await sommets(), [[90, -30], [90, 90], [30, -30]]);

    await page.evaluate(() => { tournerLaSelection(1); tournerLaSelection(1); tournerLaSelection(1); });
    r.egal('quatre quarts de tour rendent la figure intacte',
        await sommets(), [[0, 0], [120, 0], [0, 60]]);

    await poserLeTriangle();
    await page.evaluate(() => { tournerLaSelection(-1); tournerLaSelection(1); });
    r.egal('le sens inverse défait le quart de tour', await sommets(), [[0, 0], [120, 0], [0, 60]]);

    // UN SOMMET PARTAGÉ NE TOURNE PAS DEUX FOIS. Les trois segments se tiennent
    // par leurs extrémités : à traiter chaque figure pour elle-même, chaque
    // point aurait subi la rotation deux ou trois fois, et le triangle serait
    // parti en morceaux.
    await poserLeTriangle();
    await page.evaluate(() => tournerLaSelection(1));
    const cotes = await page.evaluate(() => {
        const l = (s) => {
            const p = getObjectById('point', s.p1_id), q = getObjectById('point', s.p2_id);
            return Math.round(Math.hypot(q.x - p.x, q.y - p.y));
        };
        return segments.map(l);
    });
    r.egal('les longueurs sont conservées : aucun point n\'a tourné deux fois',
        cotes, [120, Math.round(Math.hypot(120, 60)), 60]);

    // ---------------------------------------------------------------
    // 2. Sur une image : ce qu'on voit change vraiment
    // ---------------------------------------------------------------
    // Une image large avec une bande rouge à GAUCHE : après le miroir, la
    // bande doit être à droite. On le lit sur les pixels du tableau.
    const poserLImage = () => page.evaluate(async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">'
            + '<rect width="200" height="100" fill="#3498db"/>'
            + '<rect x="0" y="0" width="40" height="100" fill="#e74c3c"/></svg>';
        images.length = 0; selectedItems = []; panX = 400; panY = 350; zoom = 1;
        setMode('pointer');
        const st = await new Promise(ok => createStampFromSVG(svg, ok));
        images.push({ id: nextId++, x: 0, y: 0, w: 200, h: 100, cx: 0, cy: 0,
            cw: st.w, ch: st.h, src: st.src, z: globalZ++ });
        selectedItems = [{ type: 'image', id: images[0].id }];
        draw();
    });
    // Rouge ou bleu, au point du tableau donné ?
    const teinteEn = (lx, ly) => page.evaluate(([x, y]) => {
        draw();
        const d = ctx.getImageData(Math.round(panX + x * zoom), Math.round(panY + y * zoom), 1, 1).data;
        if (d[0] > 150 && d[1] < 110 && d[2] < 110) return 'rouge';
        if (d[2] > 150 && d[0] < 130) return 'bleu';
        return 'autre';
    }, [lx, ly]);

    await poserLImage();
    r.egal('au départ, la bande est à gauche',
        [await teinteEn(20, 50), await teinteEn(180, 50)], ['rouge', 'bleu']);

    await page.evaluate(() => retournerLaSelection('h'));
    r.egal('le miroir gauche-droite fait passer la bande à droite',
        [await teinteEn(20, 50), await teinteEn(180, 50)], ['bleu', 'rouge']);

    const drapeaux = await page.evaluate(() => ({
        h: !!images[0].retourneH, v: !!images[0].retourneV, a: images[0].angle || 0,
        x: images[0].x, y: images[0].y
    }));
    r.egal('l\'image n\'a pas bougé de place pour autant',
        { x: drapeaux.x, y: drapeaux.y, a: drapeaux.a }, { x: 0, y: 0, a: 0 });
    r.egal('et le retournement est bien noté sur elle', { h: drapeaux.h, v: drapeaux.v }, { h: true, v: false });

    // Le miroir haut-bas, sur la même image : la bande reste à droite.
    await page.evaluate(() => retournerLaSelection('v'));
    r.egal('les deux miroirs se cumulent',
        await page.evaluate(() => ({ h: !!images[0].retourneH, v: !!images[0].retourneV })),
        { h: true, v: true });

    // Le quart de tour : la bande passe du côté droit vers le bas.
    await poserLImage();
    await page.evaluate(() => tournerLaSelection(1));
    const tournee = await page.evaluate(() => ({
        a: Number((images[0].angle || 0).toFixed(4)),
        cx: images[0].x + images[0].w / 2, cy: images[0].y + images[0].h / 2
    }));
    r.egal('un quart de tour incline l\'image d\'un quart de tour, sans la déplacer',
        tournee, { a: Number((Math.PI / 2).toFixed(4)), cx: 100, cy: 50 });
    // UNE IMAGE INCLINÉE DÉBORDE DE SA BOÎTE, et c'est normal : le modèle garde
    // 200 x 100, le dessin occupe 100 x 200 autour du même centre. La bande
    // rouge, qui était à gauche, se lit donc AU-DESSUS de la boîte — à y = -30.
    r.egal('et ce qui était à gauche se retrouve en haut',
        [await teinteEn(100, -30), await teinteEn(100, 100)], ['rouge', 'bleu']);

    // ---------------------------------------------------------------
    // 3. À L'EXPORT AUSSI
    // ---------------------------------------------------------------
    const exporte = await page.evaluate(() => {
        images.length = 0; selectedItems = [];
        images.push({ id: nextId++, x: 0, y: 0, w: 200, h: 100, cx: 0, cy: 0,
            cw: 200, ch: 100, src: 'data:image/png;base64,AAA', z: globalZ++, retourneH: true });
        const svg = generateSVGString({ x: -50, y: -50, width: 400, height: 300 }, false);
        return typeof svg === 'string' ? svg : '';
    });
    r.verifie('l\'image retournée s\'exporte retournée',
        /scale\(-1,\s*1\)/.test(exporte), exporte.slice(0, 200));

    // ---------------------------------------------------------------
    // 4. L'encre posée dessus suit son hôte
    // ---------------------------------------------------------------
    await vierge();
    const encre = await page.evaluate(() => {
        images.push({ id: nextId++, x: 0, y: 0, w: 200, h: 100, cx: 0, cy: 0,
            cw: 200, ch: 100, src: '', z: globalZ++ });
        const hote = images[0].id;
        freehands.push({ id: nextId++, points: [{ x: 10, y: 10 }, { x: 30, y: 10 }],
            color: '#000', width: 3, z: globalZ++, surObjet: { type: 'image', id: hote } });
        texts.push({ id: nextId++, x: 20, y: 60, content: 'note', fontSize: 20, color: '#000',
            z: globalZ++, surObjet: { type: 'image', id: hote } });
        selectedItems = [{ type: 'image', id: hote }];
        retournerLaSelection('h');
        // Un bloc de texte se reflète PAR SON CENTRE : sans largeur mesurée,
        // celle par défaut vaut cent, et son centre part de 70 pour arriver
        // à 130 — l'image occupe 0 à 200, son axe médian est en 100.
        return { trait: freehands[0].points.map(p => Math.round(p.x)),
                 centreDuTexte: texts[0].x + 50 };
    });
    r.egal('le trait posé sur l\'image se reflète avec elle', encre.trait, [190, 170]);
    r.egal('et le bloc de texte aussi, par son centre', encre.centreDuTexte, 130);

    // ---------------------------------------------------------------
    // 5. Le texte reste lisible
    // ---------------------------------------------------------------
    await vierge();
    const texteSeul = await page.evaluate(() => {
        texts.push({ id: nextId++, x: 0, y: 0, content: 'Bonjour', fontSize: 24, color: '#000',
            angle: 0, z: globalZ++, _cachedStartX: 0, _cachedW: 100, _cachedH: 30 });
        selectedItems = [{ type: 'text', id: texts[0].id }];
        retournerLaSelection('h');
        const apresMiroir = texts[0].angle || 0;
        tournerLaSelection(1);
        return { apresMiroir, apresQuart: Number((texts[0].angle || 0).toFixed(4)) };
    });
    r.egal('un miroir ne met pas le texte à l\'envers', texteSeul.apresMiroir, 0);
    r.egal('mais un quart de tour le couche bien', texteSeul.apresQuart,
        Number((Math.PI / 2).toFixed(4)));

    // ---------------------------------------------------------------
    // 6. Un arc reflété se parcourt à l'envers
    // ---------------------------------------------------------------
    await vierge();
    const arc = await page.evaluate(() => {
        arcs.push({ id: nextId++, cx: 0, cy: 0, radius: 50, startAngle: 0,
            endAngle: Math.PI / 2, counterClockwise: false, color: '#000', width: 3, z: globalZ++ });
        selectedItems = [{ type: 'arc', id: arcs[0].id }];
        retournerLaSelection('h');
        const a = arcs[0];
        return { debut: Number(a.startAngle.toFixed(4)), fin: Number(a.endAngle.toFixed(4)),
                 sens: a.counterClockwise };
    });
    r.egal('le miroir reflète les angles de l\'arc et renverse son sens',
        arc, { debut: Number(Math.PI.toFixed(4)), fin: Number((Math.PI / 2).toFixed(4)), sens: true });

    // ---------------------------------------------------------------
    // 7. Ce qui ne doit pas céder, et ce qui s'annule
    // ---------------------------------------------------------------
    await poserLeTriangle();
    const verrouille = await page.evaluate(() => {
        segments.forEach(s => { s.locked = true; });
        const fait = retournerLaSelection('h');
        segments.forEach(s => { delete s.locked; });
        return { fait, sommets: points.map(p => [p.x, p.y]) };
    });
    r.egal('une figure verrouillée ne se retourne pas',
        { fait: verrouille.fait, sommets: verrouille.sommets },
        { fait: false, sommets: [[0, 0], [120, 0], [0, 60]] });

    await poserLeTriangle();
    await page.evaluate(() => { saveState(); tournerLaSelection(1); });
    await page.waitForTimeout(150);
    await page.evaluate(() => undo());
    await page.waitForTimeout(150);
    r.egal('un quart de tour s\'annule d\'un Ctrl+Z', await sommets(), [[0, 0], [120, 0], [0, 60]]);

    // ---------------------------------------------------------------
    // 8. Les boutons, dans la barre de l'objet
    // ---------------------------------------------------------------
    await poserLeTriangle();
    await page.evaluate(() => updateQuickMenu());
    await page.waitForTimeout(200);
    const boutons = await page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            if (!e) return null;
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
        };
        return { rot: vu('btn-quick-rotate'), h: vu('btn-quick-flip-h'), v: vu('btn-quick-flip-v') };
    });
    r.egal('les trois boutons sont dans la barre de l\'objet, et visibles',
        boutons, { rot: true, h: true, v: true });

    const parLeBouton = await page.evaluate(() => {
        document.getElementById('btn-quick-flip-h')
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        return points.map(p => [p.x, p.y]);
    });
    r.egal('et le bouton du miroir agit pour de vrai',
        parLeBouton, [[120, 0], [0, 0], [120, 60]]);

    // Maj sur le bouton de rotation tourne dans l'autre sens.
    await poserLeTriangle();
    const avecMaj = await page.evaluate(() => {
        document.getElementById('btn-quick-rotate')
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, shiftKey: true }));
        return points.map(p => [Math.round(p.x), Math.round(p.y)]);
    });
    r.egal('Maj tourne dans l\'autre sens', avecMaj, [[30, 90], [30, -30], [90, 90]]);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
