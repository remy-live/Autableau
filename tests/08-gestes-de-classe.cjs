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

    // --- LE CALQUE FIGÉ : ÉCRIRE VITE SUR UN TABLEAU CHARGÉ ---
    // Tout redessiner à chaque image coûte en proportion de ce qu'il y a à
    // l'écran : mille deux cents traits demandaient 280 ms par image, soit un
    // tableau qui ne suit plus la main. Pendant qu'on écrit, tout le reste est
    // pourtant immobile : on garde une copie de l'écran et l'on ne repeint que
    // le trait en cours. Encore faut-il que l'image soit LA MÊME.
    const calque = await page.evaluate(() => {
        points.length = 0; segments.length = 0; texts.length = 0; freehands.length = 0;
        images.length = 0; circles.length = 0; rectangles.length = 0; polygons.length = 0;
        // Un tableau vraiment chargé : sept cents traits serrés, tous à
        // l'écran. C'est cette forme-là — beaucoup de courts segments visibles
        // en même temps — qui fait s'effondrer le repeint complet.
        for (let i = 0; i < 700; i++) {
            freehands.push({ id: nextId++, color: ['#000', '#c0392b', '#2980b9'][i % 3],
                width: 2 + (i % 3), z: globalZ++,
                points: Array.from({ length: 40 }, (_, k) => ({
                    x: 30 + (i % 1200), y: 70 + k * 4 + Math.sin(k) * 3,
                    p: 0.4 + (i % 3) * 0.1 })) });
        }
        texts.push({ id: nextId++, x: 180, y: 560, content: 'Leçon du jour', color: '#000',
                     fontSize: 30, fontFamily: 'sans-serif', z: globalZ++ });
        draw();

        const empreinte = () => {
            const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let h = 0;
            for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0;
            return h;
        };
        const chrono = (f, m) => { const t = performance.now(); for (let i = 0; i < m; i++) f(); return (performance.now() - t) / m; };

        const resultats = {};
        resultats.complet = +chrono(() => draw(), 4).toFixed(1);

        ['freehand', 'highlighter'].forEach(outil => {
            setMode(outil);
            figerLeCalque();
            isDrawingFreehand = true;
            currentFreehand = { id: nextId++, color: '#e17055', z: globalZ++,
                width: outil === 'highlighter' ? 16 : 4,
                isHighlighter: outil === 'highlighter',
                points: Array.from({ length: 22 }, (_, k) => ({
                    x: 300 + k * 22, y: 300 + Math.sin(k / 2) * 70, p: 0.3 + (k % 5) * 0.12 })) };
            draw();
            resultats[outil + 'Empreinte'] = empreinte();
            resultats[outil + 'Actif'] = calqueUtilisable();
            if (outil === 'freehand') resultats.rapide = +chrono(() => draw(), 20).toFixed(1);
            // le même dessin, mais sans le calque
            libererLeCalque();
            draw();
            resultats[outil + 'Reference'] = empreinte();
            isDrawingFreehand = false; currentFreehand = null; libererLeCalque();
        });

        // Le calque doit se refuser dès que quelque chose d'autre peut bouger.
        setMode('freehand');
        figerLeCalque();
        isDrawingFreehand = true;
        currentFreehand = { id: nextId++, points: [{ x: 10, y: 10, p: .5 }], color: '#000', width: 3, z: globalZ++ };
        resultats.avantZoom = calqueUtilisable();
        const z0 = zoom; zoom = z0 * 1.5;
        resultats.apresZoom = calqueUtilisable();
        zoom = z0;
        const p0 = panX; panX = p0 + 40;
        resultats.apresDeplacement = calqueUtilisable();
        panX = p0;
        isDrawingFreehand = false;
        resultats.horsTrace = calqueUtilisable();
        currentFreehand = null; libererLeCalque();
        setMode('pointer'); draw();
        return resultats;
    });

    // L'IMAGE D'ABORD. Un calque périmé se verrait à l'écran, et une image
    // fausse est bien pire qu'une image lente.
    r.verifie('avec le calque, le crayon donne exactement la même image',
        calque.freehandEmpreinte === calque.freehandReference,
        JSON.stringify({ calque: calque.freehandEmpreinte, complet: calque.freehandReference }));
    r.verifie('et le surligneur aussi',
        calque.highlighterEmpreinte === calque.highlighterReference,
        JSON.stringify({ calque: calque.highlighterEmpreinte, complet: calque.highlighterReference }));

    // LE GAIN. Sur ce tableau, le repeint complet demande une centaine de
    // millisecondes ; avec le calque, l'image ne dépend plus de ce qu'il y a
    // dessus.
    r.verifie('écrire ne repeint plus tout le tableau',
        calque.rapide < calque.complet / 5 && calque.rapide < 12,
        `${calque.rapide} ms avec le calque contre ${calque.complet} ms sans`);

    // LES GARDE-FOUS. Le calque ne vaut que pour l'instant précis où l'on
    // écrit et où rien d'autre ne bouge.
    r.egal('le calque ne sert que pendant un trait, et seulement s\'il est à jour',
        { pendant: calque.avantZoom, apresZoom: calque.apresZoom,
          apresDeplacement: calque.apresDeplacement, horsTrace: calque.horsTrace },
        { pendant: true, apresZoom: false, apresDeplacement: false, horsTrace: false });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    // --- COPIER, COUPER, DUPLIQUER, COLLER ---
    // Les raccourcis existaient depuis toujours ; rien ne les montrait, et sur
    // tablette il n'y a pas de clavier pour les faire.
    const boutons = await page.evaluate(() => {
        [points, segments].forEach(a => a.length = 0);
        const a = { id: nextId++, x: 100, y: 100, z: globalZ++ };
        const c = { id: nextId++, x: 300, y: 200, z: globalZ++ };
        points.push(a, c);
        const seg = { id: nextId++, p1_id: a.id, p2_id: c.id, z: globalZ++ };
        segments.push(seg);
        selectedItems = [{ type: 'segment', id: seg.id }];
        updateStyleBarContext();
        const grp = document.querySelector('#bar-style .group-edition');
        // La DUPLICATION a quitté ce groupe pour le menu flottant : elle agit
        // sur l'objet, elle ne le décrit pas. Restent les trois du
        // presse-papiers, qui n'ont pas d'équivalent ailleurs.
        const trois = ['btn-copier', 'btn-couper', 'btn-coller'];
        return {
            presents: trois.filter(i => document.getElementById(i)).length,
            // le groupe était dans le HTML mais aucune règle ne l'affichait :
            // les boutons existaient sans que personne puisse les voir
            groupeAffiche: grp && getComputedStyle(grp).display,
            vus: trois.filter(i => document.getElementById(i).getClientRects().length).length,
            dupliquerAilleurs: !!document.getElementById('btn-quick-duplicate')
        };
    });
    r.egal('les trois du presse-papiers sont dans la barre contextuelle', boutons.presents, 3);
    r.egal('et le groupe est bien affiché quand la barre l\'est', boutons.groupeAffiche, 'flex');
    r.egal('les trois se voient vraiment à l\'écran', boutons.vus, 3);
    r.verifie('et la duplication se trouve dans le menu flottant de l\'objet',
        boutons.dupliquerAilleurs);

    // Coller doit rester atteignable sans rien de sélectionné : la barre de
    // sélection, elle, disparaît dès qu'on désélectionne.
    const collerSansSelection = await page.evaluate(() => {
        selectedItems = [];
        updateStyleBarContext();
        const bas = document.getElementById('btn-coller-tableau');
        return { enBas: !!bas, visible: !!(bas && bas.getClientRects().length),
                 barreCachee: !document.getElementById('bar-style').classList.contains('visible') };
    });
    r.verifie('un bouton « coller » vit dans la barre du bas', collerSansSelection.enBas);
    r.verifie('il reste visible sans sélection', collerSansSelection.visible,
        JSON.stringify(collerSansSelection));

    const gestes = await page.evaluate(() => {
        [points, segments, texts, images, freehands].forEach(a => a.length = 0);
        const P = (x, y) => { const p = { id: nextId++, x, y, z: globalZ++ }; points.push(p); return p; };
        const a = P(100, 100), c = P(300, 200);
        const seg = { id: nextId++, p1_id: a.id, p2_id: c.id, z: globalZ++ };
        segments.push(seg);
        selectedItems = [{ type: 'segment', id: seg.id }, { type: 'point', id: a.id }, { type: 'point', id: c.id }];

        document.getElementById('btn-copier').click();
        document.getElementById('btn-coller').click();
        const colle = {
            points: points.length, segments: segments.length,
            // la copie doit s'appuyer sur SES points, pas sur ceux de l'original
            relie: !!(segments[1] && segments[1].p1_id !== seg.p1_id && getObjectById('point', segments[1].p1_id)),
            decale: !!(segments[1] && getObjectById('point', segments[1].p1_id).x !== a.x)
        };

        const memoire = boardClipboard.items.map(i => i.type).join(',');
        selectedItems = [{ type: 'segment', id: seg.id }];
        // La duplication est passée dans le menu flottant de l'objet, qui
        // répond au pointeur et non au clic.
        updateQuickMenu();
        document.getElementById('btn-quick-duplicate').dispatchEvent(
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
        const duplique = { segments: segments.length,
                           pressePapierIntact: boardClipboard.items.map(i => i.type).join(',') === memoire };

        selectedItems = [{ type: 'segment', id: segments[segments.length - 1].id }];
        document.getElementById('btn-couper').click();
        const coupe = segments.length;

        selectedItems = [];
        const sansRien = copierSelection();
        return { colle, duplique, coupe, sansRien };
    });
    r.egal('copier puis coller ajoute une copie', gestes.colle.segments, 2);
    r.egal('avec ses propres points', gestes.colle.points, 4);
    r.verifie('la copie est reliée à ses points, pas à ceux de l\'original', gestes.colle.relie,
        JSON.stringify(gestes.colle));
    r.verifie('et posée à côté, pas par-dessus', gestes.colle.decale);
    r.egal('dupliquer pose une copie de plus', gestes.duplique.segments, 3);
    r.verifie('sans écraser ce qu\'on avait copié avant', gestes.duplique.pressePapierIntact);
    r.egal('couper retire l\'objet', gestes.coupe, 2);
    r.verifie('sans sélection, copier ne fait rien et le dit', gestes.sansRien === false);

    // --- RÉORDONNER LES PAGES EN TIRANT LEUR VIGNETTE ---
    const vignettes = await page.evaluate(async () => {
        while (pages.length > 1) pages.pop();
        const vide = () => ({ points: [], segments: [], circles: [], rectangles: [], texts: [], freehands: [],
            curves: [], polygons: [], images: [], arcs: [], htmlPostits: [], history: [], historyIndex: -1,
            panX: 0, panY: 0, zoom: 1 });
        pages.push(vide()); pages.push(vide());
        pages.forEach((p, i) => { p.repere = 'page' + (i + 1); });
        currentPageIndex = 0;
        document.getElementById('page-indicator').click();      // ouvre le trieur
        await new Promise(r => setTimeout(r, 500));
        const d = document.getElementById('thumbnail-drawer');
        return { ouvert: !!d, boites: d ? d.querySelectorAll('[data-index]').length : 0 };
    });
    r.verifie('le trieur de diapositives s\'ouvre', vignettes.ouvert);
    r.egal('une vignette par page', vignettes.boites, 3);

    const glisse = await page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        const boites = Array.from(d.querySelectorAll('[data-index]'));
        const src = boites[0].getBoundingClientRect();
        const dst = boites[2].getBoundingClientRect();
        const ev = (t, x, y, cible) => (cible || window).dispatchEvent(
            new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
        ev('pointerdown', src.x + 20, src.y + 20, boites[0]);
        ev('pointermove', src.x + 20, dst.bottom - 4);
        const repere = !!d.querySelector('.vignette-repere');
        ev('pointerup', src.x + 20, dst.bottom - 4);
        return { repere, ordre: pages.map(p => p.repere), courante: currentPageIndex };
    });
    r.verifie('un repère montre où la page va atterrir', glisse.repere, JSON.stringify(glisse));
    r.egal('la page tirée change bien de rang', glisse.ordre, ['page2', 'page3', 'page1']);
    r.egal('et la page ouverte reste la page ouverte', glisse.courante, 2);

    const dehors = await page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        const boites = Array.from(d.querySelectorAll('[data-index]'));
        const src = boites[0].getBoundingClientRect();
        const ev = (t, x, y, cible) => (cible || window).dispatchEvent(
            new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
        const avant = pages.map(p => p.repere).join(',');
        ev('pointerdown', src.x + 20, src.y + 20, boites[0]);
        ev('pointermove', src.x + 600, src.y + 200);
        ev('pointerup', src.x + 600, src.y + 200);
        return { avant, apres: pages.map(p => p.repere).join(',') };
    });
    r.egal('relâcher loin du trieur ne déplace rien', dehors.apres, dehors.avant);

    // ==========================================================
    // L'ENCRE QUI S'ACCROCHE
    // On entoure un mot, on déplace le texte : le rond restait sur place.
    // Ce test dessine et déplace à la vraie souris — c'est le seul moyen
    // d'éprouver le crochet posé dans la boucle de déplacement.
    // ==========================================================
    const cadre = await page.evaluate(() => {
        texts.length = 0; images.length = 0; freehands.length = 0;
        selectedItems = []; panX = 0; panY = 0; zoom = 1;
        texts.push({
            id: nextId++, x: 260, y: 220, content: 'Le chat dort',
            fontSize: 34, lineHeight: 44, color: '#2d3436',
            fontFamily: 'sans-serif', align: 'left', z: globalZ++
        });
        draw();
        const t = texts[0];
        setMode('freehand');
        return {
            x: t._cachedStartX, y: t.y,
            w: t._cachedW, h: t._cachedH,
            cx: t._cachedStartX + t._cachedW / 2, cy: t.y + t._cachedH / 2
        };
    });

    // Un rond tracé autour du mot, à la souris
    await page.mouse.move(cadre.cx, cadre.y - 12);
    await page.mouse.down();
    for (let a = -Math.PI / 2; a < Math.PI * 1.6; a += 0.3) {
        await page.mouse.move(cadre.cx + Math.cos(a) * (cadre.w / 2 + 14),
                              cadre.cy + Math.sin(a) * (cadre.h / 2 + 14));
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    const accroche = await page.evaluate(() => ({
        traits: freehands.length,
        surObjet: freehands[0] && freehands[0].surObjet,
        texteId: texts[0].id
    }));
    r.egal('le tracé est bien posé', accroche.traits, 1);
    r.verifie('et il s\'accroche au texte qu\'il entoure',
        accroche.surObjet && accroche.surObjet.type === 'text'
        && accroche.surObjet.id === accroche.texteId, JSON.stringify(accroche.surObjet));

    // On déplace le texte à la souris : le rond doit partir avec lui
    const departDeLEncre = await page.evaluate(() => {
        setMode('pointer');
        return { x0: freehands[0].points[0].x, y0: freehands[0].points[0].y };
    });
    await page.mouse.move(cadre.cx, cadre.cy);
    await page.mouse.down();
    await page.mouse.move(cadre.cx + 150, cadre.cy + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    const apres = await page.evaluate(() => ({
        texteX: texts[0].x,
        traitX: freehands[0].points[0].x,
        traitY: freehands[0].points[0].y
    }));
    r.verifie('le texte a bien été déplacé', apres.texteX > 300, 'x = ' + apres.texteX);
    r.verifie('et l\'encre a suivi du même mouvement',
        Math.abs((apres.traitX - departDeLEncre.x0) - 150) < 3 && Math.abs((apres.traitY - departDeLEncre.y0) - 90) < 3,
        JSON.stringify({ dx: apres.traitX - departDeLEncre.x0, dy: apres.traitY - departDeLEncre.y0 }));

    // Un trait tracé LOIN du texte reste indépendant
    await page.evaluate(() => { setMode('freehand'); });
    await page.mouse.move(820, 640);
    await page.mouse.down();
    await page.mouse.move(890, 690, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const libre = await page.evaluate(() => ({
        n: freehands.length,
        dernierAccroche: !!freehands[freehands.length - 1].surObjet
    }));
    r.egal('le second tracé est posé', libre.n, 2);
    r.verifie('un trait tracé à l\'écart ne s\'accroche à rien', !libre.dernierAccroche);

    // Le réglage éteint le comportement, et il tient d'une séance à l'autre
    const eteint = await page.evaluate(() => {
        basculerEncreAccrochee();
        const memoire = localStorage.getItem('board_encre_accrochee');
        freehands.length = 0;
        const t = texts[0];
        const trait = { id: nextId++, color: '#000', width: 3, z: globalZ++, points: [] };
        for (let a = 0; a < 6; a += 0.5) {
            trait.points.push({ x: t._cachedStartX + t._cachedW / 2 + Math.cos(a) * 10,
                                y: t.y + t._cachedH / 2 + Math.sin(a) * 10 });
        }
        freehands.push(trait);
        const h = accrocherLeTrait(trait);
        basculerEncreAccrochee();       // on rallume pour la suite
        return { memoire, accroche: h };
    });
    r.egal('le réglage est retenu', eteint.memoire, '0');
    r.egal('éteint, plus rien ne s\'accroche', eteint.accroche, null);

    // L'hôte supprimé : l'encre reste, mais redevient libre
    const orpheline = await page.evaluate(() => {
        freehands.length = 0;
        const t = texts[0];
        const trait = { id: nextId++, color: '#000', width: 3, z: globalZ++,
            points: [{ x: t._cachedStartX + 4, y: t.y + 4 },
                     { x: t._cachedStartX + t._cachedW - 4, y: t.y + t._cachedH - 4 }] };
        freehands.push(trait);
        accrocherLeTrait(trait);
        const avant = !!trait.surObjet;
        deleteObject('text', t.id);
        return { avant, survit: freehands.length === 1, encoreAccrochee: !!freehands[0].surObjet };
    });
    r.verifie('un trait posé sur le texte s\'y accroche', orpheline.avant);
    r.verifie('supprimer le texte ne supprime pas l\'annotation', orpheline.survit);
    r.verifie('elle redevient simplement libre', !orpheline.encoreAccrochee);

    await page.evaluate(() => {
        texts.length = 0; freehands.length = 0; images.length = 0;
        selectedItems = []; setMode('pointer'); draw();
    });

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
