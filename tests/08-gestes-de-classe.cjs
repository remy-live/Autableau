// Gestes de classe : dupliquer un objet, masquer avec le rideau, éclairer
// une zone avec le projecteur.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Gestes de classe');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // --- DUPLIQUER ---
    // Une figure ne porte pas ses sommets : elle renvoie à des points. La
    // copie doit avoir les siens, sinon la déplacer déplacerait l'original.
    const figure = await page.evaluate(() => {
        [points, segments, circles, rectangles, curves, polygons, freehands, texts, images]
            .forEach(a => a.length = 0);
        const p1 = { id: nextId++, x: 0, y: 0, color: '#000', z: globalZ++ };
        const p2 = { id: nextId++, x: 100, y: 50, color: '#000', z: globalZ++ };
        points.push(p1, p2);
        segments.push({ id: nextId++, p1_id: p1.id, p2_id: p2.id, lineType: 'segment', color: '#000', width: 3, z: globalZ++ });
        selectedItems = [{ type: 'segment', id: segments[0].id }];
        saveState();
        duplicateSelection();
        const copie = segments[1];
        const avant = p1.x;
        const copieP1 = getObjectById('point', copie.p1_id);
        copieP1.x += 500;                       // on bouge la copie...
        return {
            segments: segments.length,
            points: points.length,
            sommetsPartages: copie.p1_id === p1.id || copie.p2_id === p2.id,
            originalIntact: p1.x === avant,     // ...l'original ne doit pas suivre
            selectionSurLaCopie: selectedItems.length === 1 && selectedItems[0].id === copie.id
        };
    });
    r.egal('dupliquer : un second segment', figure.segments, 2);
    r.egal('dupliquer : les sommets sont recopiés', figure.points, 4);
    r.verifie('dupliquer : aucun sommet partagé avec l\'original', !figure.sommetsPartages);
    r.verifie('déplacer la copie laisse l\'original en place', figure.originalIntact);
    r.verifie('la copie devient la sélection', figure.selectionSurLaCopie);

    // Un groupe se duplique entier, sous un nouveau groupe
    const groupe = await page.evaluate(() => {
        [points, segments, freehands, texts].forEach(a => a.length = 0);
        const g = 'g-essai';
        freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 3, groupId: g, z: globalZ++ });
        texts.push({ id: nextId++, x: 0, y: 0, content: 'A', fontSize: 20, lineHeight: 24, color: '#000', fontFamily: 'sans-serif', align: 'left', groupId: g, z: globalZ++ });
        selectedItems = [{ type: 'freehand', id: freehands[0].id }];
        duplicateSelection();
        return {
            membres: freehands.length + texts.length,
            nouveauGroupe: freehands[1].groupId !== g && freehands[1].groupId === texts[1].groupId
        };
    });
    r.egal('dupliquer un groupe : les deux membres suivent', groupe.membres, 4);
    r.verifie('la copie forme un groupe distinct', groupe.nouveauGroupe);

    // Un objet verrouillé n'est pas dupliqué
    const verrou = await page.evaluate(() => {
        [freehands, texts].forEach(a => a.length = 0);
        freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 3, locked: true, z: globalZ++ });
        selectedItems = [{ type: 'freehand', id: freehands[0].id }];
        return { fait: duplicateSelection(), n: freehands.length };
    });
    r.verifie('un objet verrouillé n\'est pas dupliqué', verrou.fait === false && verrou.n === 1, JSON.stringify(verrou));

    // Ctrl+D depuis le clavier, et l'annulation revient en arrière
    await tableauVierge(page);
    await page.evaluate(() => {
        freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 40, y: 40 }], color: '#000', width: 3, z: globalZ++ });
        setMode('pointer'); selectedItems = [{ type: 'freehand', id: freehands[0].id }]; saveState(); draw();
    });
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(300);
    r.egal('Ctrl+D duplique', await page.evaluate(() => freehands.length), 2);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    r.egal('la duplication s\'annule', await page.evaluate(() => freehands.length), 1);

    // --- RIDEAU ---
    await page.click('#btn-rideau');
    await page.waitForTimeout(250);
    const plein = await page.evaluate(() => {
        const e = document.getElementById('rideau');
        const b = e.getBoundingClientRect();
        return { ouvert: !e.hidden, couvre: Math.round(b.width) >= window.innerWidth && Math.round(b.height) >= window.innerHeight };
    });
    r.verifie('le rideau s\'ouvre en couvrant tout', plein.ouvert && plein.couvre, JSON.stringify(plein));

    const poignee = await page.evaluate(() => {
        const b = document.querySelector('.rideau-poignee[data-bord="haut"]').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.move(poignee.x, poignee.y);
    await page.mouse.down();
    await page.mouse.move(poignee.x, poignee.y + 250, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const decouvert = await page.evaluate(() => Math.round(document.getElementById('rideau').getBoundingClientRect().top));
    r.verifie('la poignée dévoile le haut du tableau', decouvert > 200, `bord haut à ${decouvert} px`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    r.verifie('Échap referme le rideau', await page.evaluate(() => document.getElementById('rideau').hidden));
    r.egal('le rideau ne change pas l\'outil en cours', await page.evaluate(() => mode), 'pointer');

    // --- PROJECTEUR ---
    await page.click('#btn-spot');
    await page.waitForTimeout(250);
    const spot0 = await page.evaluate(() => {
        const b = document.getElementById('spot-trou').getBoundingClientRect();
        return { ouvert: !document.getElementById('spot-calque').hidden, d: Math.round(b.width) };
    });
    r.verifie('le projecteur s\'ouvre', spot0.ouvert && spot0.d > 100, JSON.stringify(spot0));

    await page.mouse.move(300, 250);
    await page.mouse.down();
    await page.mouse.move(320, 270, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const suivi = await page.evaluate(() => {
        const b = document.getElementById('spot-trou').getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    r.verifie('le projecteur suit le pointeur', Math.abs(suivi.x - 320) < 6 && Math.abs(suivi.y - 270) < 6, JSON.stringify(suivi));

    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200);
    const grossi = await page.evaluate(() => Math.round(document.getElementById('spot-trou').getBoundingClientRect().width));
    r.verifie('la molette règle le diamètre', grossi > spot0.d, `${spot0.d} -> ${grossi}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    r.verifie('Échap referme le projecteur', await page.evaluate(() => document.getElementById('spot-calque').hidden));

    // Ni l'un ni l'autre ne laissent de trace dans le tableau enregistré
    const propre = await page.evaluate(() => {
        const s = JSON.stringify(stateForStorage());
        return !s.includes('rideau') && !s.includes('spot-');
    });
    r.verifie('rideau et projecteur restent hors de la sauvegarde', propre);

    // --- LA SÉLECTION MULTIPLE ---
    const selection = await page.evaluate(() => {
        [points, segments, circles, texts, freehands, images].forEach(a => a.length = 0);
        selectedItems = [];
        panX = 400; panY = 300; zoom = 1;
        setMode('pointer');
        const P = (x, y) => { const p = { id: nextId++, x, y, shape: 'cross', z: globalZ++ }; points.push(p); return p; };
        const a = P(-200, -100), b = P(100, 50), c = P(-150, 120), d = P(150, -60);
        segments.push({ id: nextId++, p1_id: a.id, p2_id: b.id, z: globalZ++ });
        segments.push({ id: nextId++, p1_id: c.id, p2_id: d.id, z: globalZ++ });

        const clic = (x, y, avecCtrl) => {
            const p = { clientX: panX + x * zoom, clientY: panY + y * zoom };
            canvas.dispatchEvent(new PointerEvent('pointerdown', Object.assign(
                { bubbles: true, pointerId: 1, isPrimary: true, button: 0, ctrlKey: !!avecCtrl }, p)));
            canvas.dispatchEvent(new PointerEvent('pointerup', Object.assign(
                { bubbles: true, pointerId: 1, isPrimary: true }, p)));
        };

        clic(-50, -25, false);
        const seul = selectedItems.length;
        clic(0, 30, true);
        const deux = selectedItems.length;
        clic(0, 30, true);
        const retire = selectedItems.length;

        // Cliquer l'extrémité d'un segment déjà pris ne doit pas réduire la
        // sélection à ce seul point : on veut encore pouvoir déplacer le lot.
        selectedItems = [{ type: 'segment', id: segments[0].id }, { type: 'segment', id: segments[1].id }];
        clic(-200, -100, false);
        const surExtremite = selectedItems.length;

        // Ctrl+clic dans le vide ne vide pas la sélection
        clic(600, 600, true);
        const dansLeVide = selectedItems.length;
        return { seul, deux, retire, surExtremite, dansLeVide };
    });
    r.egal('un clic sélectionne un objet', selection.seul, 1);
    r.egal('Ctrl+clic en ajoute un deuxième', selection.deux, 2);
    r.egal('et Ctrl+clic dessus l\'enlève', selection.retire, 1);
    r.egal('cliquer une extrémité ne casse plus la sélection', selection.surExtremite, 2);
    r.egal('Ctrl+clic dans le vide ne vide pas la sélection', selection.dansLeVide, 2);

    // --- UN POINT SANS FORME RESTE VISIBLE ---
    const pointNu = await page.evaluate(() => {
        [points, segments].forEach(a => a.length = 0);
        selectedItems = [];
        panX = 400; panY = 300; zoom = 1;
        points.push({ id: nextId++, x: 0, y: 0, color: '#e74c3c', z: globalZ++ });   // aucune forme
        draw();
        const d = ctx.getImageData(392, 292, 16, 16).data;
        let encre = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) encre++;
        return { forme: formeDuPoint(points[0]), pixels: encre, inconnue: formeDuPoint({ shape: 'zigzag' }) };
    });
    r.egal('une forme absente vaut la croix', pointNu.forme, 'cross');
    r.egal('une forme inconnue aussi', pointNu.inconnue, 'cross');
    r.verifie('et le point se dessine vraiment', pointNu.pixels > 20, `${pointNu.pixels} pixels`);

    // --- LE MODE FOCUS : CHAQUE TIROIR SORT PAR SON BORD ---
    const focus = await page.evaluate(async () => {
        const bas = document.getElementById('bottom-drawer');
        const haut = document.getElementById('bar-plugins');
        const centre = (el) => { const b = el.getBoundingClientRect(); return Math.round(b.left + b.width / 2); };
        const avant = { bas: centre(bas), hautY: haut.getBoundingClientRect().top, basY: bas.getBoundingClientRect().top };
        toggleFocusMode();
        await new Promise(r => setTimeout(r, 600));
        const apres = { bas: centre(bas), hautY: haut.getBoundingClientRect().top, basY: bas.getBoundingClientRect().top };
        const croix = document.getElementById('exit-focus-cross');
        const sortie = !!(croix && getComputedStyle(croix).opacity === '1');
        toggleFocusMode();
        await new Promise(r => setTimeout(r, 600));
        return { avant, apres, sortie, revenu: centre(bas) };
    });
    r.egal('le tiroir du bas reste centré en s\'effaçant', focus.apres.bas, focus.avant.bas);
    r.verifie('il sort par le bas', focus.apres.basY > focus.avant.basY + 40, JSON.stringify(focus));
    r.verifie('et celui du haut par le haut', focus.apres.hautY < focus.avant.hautY - 40, JSON.stringify(focus));
    r.verifie('une croix permet de quitter le mode Focus', focus.sortie);
    r.egal('et tout revient en place', focus.revenu, focus.avant.bas);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // --- Au doigt, sur tablette ---
    const tab = await ouvrirApp(browser, { tactile: true, viewport: { width: 768, height: 1024 } });
    const cdp = await tab.context.newCDPSession(tab.page);
    const touche = async (type, pts) => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
        await tab.page.waitForTimeout(45);
    };

    // Un objet sélectionné : son menu rapide ne doit pas flotter sur le rideau
    await tab.page.evaluate(() => {
        freehands.push({ id: nextId++, points: [{ x: -60, y: -40 }, { x: 60, y: 40 }], color: '#000', width: 5, z: globalZ++ });
        setMode('pointer'); selectedItems = [{ type: 'freehand', id: freehands[0].id }]; draw();
    });
    await tab.page.waitForTimeout(300);
    r.verifie('menu rapide visible avant le rideau',
        await tab.page.evaluate(() => document.getElementById('quick-edit-menu').classList.contains('visible')));

    await tab.page.evaluate(() => document.getElementById('btn-rideau').click());
    await tab.page.waitForTimeout(400);

    const couverture = await tab.page.evaluate(() => {
        const haut = document.elementFromPoint(window.innerWidth / 2, 40);
        const coin = document.elementFromPoint(window.innerWidth - 40, window.innerHeight - 40);
        return {
            barreCouverte: !!(haut && haut.closest('#rideau')),
            coinCouvert: !!(coin && coin.closest('#rideau')),
            menu: document.getElementById('quick-edit-menu').classList.contains('visible'),
            croix: document.getElementById('masque-fermer').classList.contains('visible')
        };
    });
    r.verifie('le rideau passe au-dessus des barres d\'outils', couverture.barreCouverte, JSON.stringify(couverture));
    r.verifie('le rideau couvre jusqu\'aux coins', couverture.coinCouvert);
    r.verifie('le menu rapide s\'efface derrière le rideau', !couverture.menu);
    r.verifie('une croix de fermeture apparaît', couverture.croix);

    const croix = await tab.page.evaluate(() => {
        const b = document.getElementById('masque-fermer').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    const surLaCroix = await tab.page.evaluate((c) => {
        const el = document.elementFromPoint(c.x, c.y);
        return !!(el && (el.id === 'masque-fermer' || el.closest('#masque-fermer')));
    }, croix);
    r.verifie('la croix reste atteignable au-dessus du rideau', surLaCroix);

    await touche('touchStart', [croix]);
    await touche('touchEnd', []);
    await tab.page.waitForTimeout(350);
    r.verifie('un appui sur la croix referme le rideau',
        await tab.page.evaluate(() => document.getElementById('rideau').hidden));
    r.verifie('le menu rapide revient ensuite',
        await tab.page.evaluate(() => document.getElementById('quick-edit-menu').classList.contains('visible')));

    // Le projecteur se ferme de la même façon, sans clavier
    await tab.page.evaluate(() => document.getElementById('btn-spot').click());
    await tab.page.waitForTimeout(350);
    await touche('touchStart', [croix]);
    await touche('touchEnd', []);
    await tab.page.waitForTimeout(350);
    r.verifie('un appui sur la croix referme le projecteur',
        await tab.page.evaluate(() => document.getElementById('spot-calque').hidden));

    // Puis on rouvre le rideau pour l'essai au doigt sur les poignées
    await tab.page.evaluate(() => document.getElementById('btn-rideau').click());
    await tab.page.waitForTimeout(300);
    const pt = await tab.page.evaluate(() => {
        const b = document.querySelector('.rideau-poignee[data-bord="haut"]').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await touche('touchStart', [{ x: pt.x, y: pt.y }]);
    for (let i = 1; i <= 8; i++) await touche('touchMove', [{ x: pt.x, y: pt.y + i * 30 }]);
    await touche('touchEnd', []);
    const auDoigt = await tab.page.evaluate(() => Math.round(document.getElementById('rideau').getBoundingClientRect().top));
    r.verifie('le rideau se tire au doigt', auDoigt > 150, `bord haut à ${auDoigt} px`);

    r.verifie('aucune erreur JS au doigt', tab.erreurs.length === 0, tab.erreurs.join(' | '));
    await tab.context.close();

    return r.bilan();
};
