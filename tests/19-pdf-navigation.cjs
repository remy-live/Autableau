// Naviguer dans un PDF posé sur le tableau : garder les pages rendues,
// aller droit à un numéro, feuilleter au clavier et au doigt, l'encre qui
// appartient à sa page, le volet des vignettes et la recherche dans le texte.
const { creerRapport, ouvrirApp, petitPdf, fichePdf, polyDense, polyEnCases, polyEnCouleur, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Navigation dans les PDF');
    const { context, page, erreurs } = await ouvrirApp(browser, { tactile: true });
    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function'
        && typeof allerALaPage === 'function', { timeout: 20000 });

    const octets = Array.from(petitPdf());

    // Attendre sans faire tomber la suite : une régression doit se lire dans
    // la ligne qui la concerne, pas emporter les quarante autres avec elle.
    const attendre = async (fn, arg, ms = 8000) => {
        try { await page.waitForFunction(fn, arg, { timeout: ms }); } catch (e) { /* on dira l'état réel */ }
    };
    const pageCourante = async (n) => {
        await attendre(p => images[0].pluginData.page === p, n);
        return page.evaluate(() => images[0].pluginData.page);
    };

    // On compte les rendus pour de bon : c'est la seule façon de distinguer
    // une page gardée d'une page redessinée à l'identique.
    const pose = await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; freehands.length = 0; texts.length = 0;
        window.__rendus = 0;
        const vrai = window.dessinerPagePdf;
        window.dessinerPagePdf = function (...a) { window.__rendus++; return vrai.apply(null, a); };
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 1200));   // le temps de préparer les voisines
        const d = documentsPdf.get(images[0].pluginData.cle);
        return { pages: images[0].pluginData.pages, rendus: window.__rendus,
                 gardees: d.rendus ? Array.from(d.rendus.keys()).sort() : [] };
    }, { octets });
    r.egal('le document est posé avec ses trois pages', pose.pages, 3);
    r.egal('la page suivante est préparée pendant qu\'on lit celle-ci', pose.gardees, [1, 2]);
    r.egal('deux rendus, pas un de plus', pose.rendus, 2);

    // --- LES PAGES GARDÉES ---
    const allerRetour = await page.evaluate(async () => {
        const img = images[0];
        const avant = window.__rendus;
        await allerALaPage(img, 2);
        await new Promise(r => setTimeout(r, 600));    // prépare la 3
        const apres2 = window.__rendus;
        await allerALaPage(img, 1);
        await new Promise(r => setTimeout(r, 600));
        return { avant, apres2, apres1: window.__rendus, page: img.pluginData.page };
    });
    r.egal('aller à une page déjà préparée ne redessine rien', allerRetour.apres2 - allerRetour.avant, 1);
    r.egal('et revenir en arrière non plus', allerRetour.apres1 - allerRetour.apres2, 0);
    r.egal('on est bien revenu page 1', allerRetour.page, 1);

    const plafond = await page.evaluate(() => {
        const d = documentsPdf.get(images[0].pluginData.cle);
        for (let n = 1; n <= 40; n++) d.rendus.set(1000 + n, { src: '', l: 1, h: 1 });
        // (le plafond s'applique à l'écriture ; ici on vérifie la constante)
        return { plafond: PAGES_GARDEES, taille: d.rendus.size };
    });
    r.verifie('le nombre de pages gardées est borné', plafond.plafond > 0 && plafond.plafond <= 16,
        JSON.stringify(plafond));

    // --- ALLER DROIT À UNE PAGE ---
    await page.evaluate(() => {
        const d = documentsPdf.get(images[0].pluginData.cle);
        for (const k of Array.from(d.rendus.keys())) if (k > 100) d.rendus.delete(k);
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
    });
    const champ = await page.evaluate(() => {
        const c = document.getElementById('doc-page-num');
        return { existe: !!c, valeur: c && c.value,
                 total: document.getElementById('doc-total').textContent };
    });
    r.verifie('le numéro de page est un champ', champ.existe, JSON.stringify(champ));
    r.egal('qui montre la page courante', champ.valeur, '1');
    r.egal('et le total à côté', champ.total, '/3');

    await page.click('#doc-page-num');
    await page.fill('#doc-page-num', '3');
    await page.keyboard.press('Enter');
    r.egal('on tape un numéro, on y est', await pageCourante(3), 3);

    // Un numéro hors du document ne doit pas emmener n'importe où
    await page.click('#doc-page-num');
    await page.fill('#doc-page-num', '99');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const horsBornes = await page.evaluate(() => ({
        page: images[0].pluginData.page,
        champ: document.getElementById('doc-page-num').value
    }));
    r.egal('un numéro trop grand s\'arrête à la dernière page', horsBornes.page, 3);
    r.egal('et le champ revient à la page réelle', horsBornes.champ, '3');

    const pendantLaFrappe = await page.evaluate(() => {
        const c = document.getElementById('doc-page-num');
        c.focus(); c.value = '1';
        majBarreDocument();          // le tableau se redessine pendant qu'on tape
        const garde = c.value;
        c.blur();
        return { garde, apresSortie: c.value };
    });
    r.egal('ce qu\'on tape n\'est pas réécrit sous les doigts', pendantLaFrappe.garde, '1');
    r.egal('mais sortir du champ le remet d\'aplomb', pendantLaFrappe.apresSortie, '3');

    // --- FEUILLETER AU CLAVIER ---
    await page.evaluate(async () => { await allerALaPage(images[0], 1); });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('board').focus());
    await page.keyboard.press('ArrowRight');
    r.egal('→ avance d\'une page', await pageCourante(2), 2);
    await page.keyboard.press('PageDown');
    r.egal('Page↓ aussi', await pageCourante(3), 3);
    await page.keyboard.press('ArrowLeft');
    r.egal('← recule', await pageCourante(2), 2);
    await page.keyboard.press('PageUp');
    r.egal('Page↑ aussi', await pageCourante(1), 1);

    // Dans le champ du numéro, les flèches déplacent le curseur : elles ne
    // doivent surtout pas tourner la page sous les doigts de qui corrige.
    await page.click('#doc-page-num');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const dansLeChamp = await page.evaluate(() => {
        document.getElementById('doc-page-num').blur();
        return images[0].pluginData.page;
    });
    r.egal('les flèches dans le champ ne tournent pas la page', dansLeChamp, 1);

    // --- FEUILLETER AU DOIGT ---
    const cdp = await context.newCDPSession(page);
    const doigts = async (type, pts) => {
        await cdp.send('Input.dispatchTouchEvent', {
            type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 }))
        });
    };
    const milieu = await page.evaluate(() => {
        const c = document.getElementById('board').getBoundingClientRect();
        return { x: Math.round(c.left + c.width / 2), y: Math.round(c.top + c.height / 2) };
    });
    // Deux doigts qui glissent ensemble vers la gauche : page suivante
    await doigts('touchStart', [{ x: milieu.x + 60, y: milieu.y }, { x: milieu.x + 160, y: milieu.y }]);
    for (let d = 20; d <= 140; d += 20) {
        await doigts('touchMove', [{ x: milieu.x + 60 - d, y: milieu.y }, { x: milieu.x + 160 - d, y: milieu.y }]);
    }
    await doigts('touchEnd', []);
    await page.waitForTimeout(700);
    const balayage = await page.evaluate(() => ({ page: images[0].pluginData.page, zoom: Math.round(zoom * 100) }));
    r.egal('un balayage à deux doigts vers la gauche tourne la page', balayage.page, 2);
    r.egal('et il ne zoome pas au passage', balayage.zoom, 100);

    // Un pincement reste un pincement : l'écart change, la page ne bouge pas
    await page.evaluate(() => { zoom = 1; panX = 0; panY = 0; draw(); });
    await doigts('touchStart', [{ x: milieu.x - 40, y: milieu.y }, { x: milieu.x + 40, y: milieu.y }]);
    for (let d = 20; d <= 140; d += 20) {
        await doigts('touchMove', [{ x: milieu.x - 40 - d, y: milieu.y }, { x: milieu.x + 40 + d, y: milieu.y }]);
    }
    await doigts('touchEnd', []);
    await page.waitForTimeout(500);
    const pincement = await page.evaluate(() => ({ page: images[0].pluginData.page, zoom }));
    r.egal('un pincement ne tourne pas la page', pincement.page, 2);
    r.verifie('il zoome, comme avant', pincement.zoom > 1.2, String(pincement.zoom));

    // --- L'ENCRE APPARTIENT À SA PAGE ---
    const encre = await page.evaluate(async () => {
        // Le repère au centre de l'écran : sans cela le document, posé en
        // coordonnées négatives, tomberait hors de la fenêtre.
        zoom = 1; panX = window.innerWidth / 2; panY = window.innerHeight / 2;
        freehands.length = 0; texts.length = 0;
        const img = images[0];
        // Le document, bien au milieu de l'écran et grand
        img.x = -300; img.y = -220; img.w = 600; img.h = 440;
        await allerALaPage(img, 1);
        draw();
        return { page: img.pluginData.page, x: img.x, y: img.y, w: img.w, h: img.h };
    });
    const versEcran = (lx, ly) => page.evaluate(({ lx, ly }) =>
        ({ x: Math.round(panX + lx * zoom), y: Math.round(panY + ly * zoom) }), { lx, ly });

    const depart = await versEcran(encre.x + 120, encre.y + 200);
    const arrivee = await versEcran(encre.x + 420, encre.y + 210);
    await page.evaluate(() => { setMode('freehand'); activeStyle.strokeColor = '#e6194b'; activeStyle.lineWidth = 8; });
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    await page.mouse.move(arrivee.x, arrivee.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const trace = await page.evaluate(() => ({
        traits: freehands.length,
        surPage: freehands[0] && freehands[0].surPage,
        page: images[0].pluginData.page
    }));
    r.egal('le trait est posé', trace.traits, 1);
    r.verifie('et il sait de quelle page il est',
        !!(trace.surPage && trace.surPage.page === 1), JSON.stringify(trace));

    // Une couleur relevée sur le trait : c'est elle qui doit disparaître
    const surLeTrait = { x: Math.round((depart.x + arrivee.x) / 2), y: Math.round((depart.y + arrivee.y) / 2) };
    const lire = () => page.evaluate(({ x, y }) => {
        draw();
        const c = document.getElementById('board');
        const g = c.getContext('2d');
        const d = g.getImageData(Math.round(x * (c.width / c.clientWidth)),
                                 Math.round(y * (c.height / c.clientHeight)), 1, 1).data;
        return [d[0], d[1], d[2]];
    }, surLeTrait);
    const avantDeTourner = await lire();
    r.verifie('on voit bien l\'encre sur la page 1', avantDeTourner[0] > 150 && avantDeTourner[1] < 120,
        JSON.stringify(avantDeTourner));

    await page.evaluate(async () => { await allerALaPage(images[0], 2); });
    await page.waitForTimeout(500);
    const surLaSuivante = await lire();
    const cachee = await page.evaluate(() => {
        const f = freehands[0];
        if (!f) return { autrePage: null, existeEncore: 0, designe: null };
        const p = f.points[Math.floor(f.points.length / 2)];
        const trouve = findObjectAt(p.x, p.y);
        return {
            autrePage: surUneAutrePage(f),
            existeEncore: freehands.length,
            designe: trouve && trouve.type
        };
    });
    r.verifie('l\'encre de la page 1 ne se voit pas sur la page 2',
        !(surLaSuivante[0] > 150 && surLaSuivante[1] < 120), JSON.stringify(surLaSuivante));
    r.verifie('le trait n\'est pas perdu pour autant', cachee.existeEncore === 1, JSON.stringify(cachee));
    r.verifie('et il ne se désigne pas au clic, invisible', cachee.designe !== 'freehand', JSON.stringify(cachee));

    await page.evaluate(async () => { await allerALaPage(images[0], 1); });
    await page.waitForTimeout(500);
    const deRetour = await lire();
    r.verifie('revenu page 1, on retrouve son encre', deRetour[0] > 150 && deRetour[1] < 120,
        JSON.stringify(deRetour));

    // Un bloc de texte écrit sur la page appartient à la page lui aussi
    const bloc = await page.evaluate(async () => {
        const img = images[0];
        const t = { id: nextId++, x: img.x + 60, y: img.y + 60, content: 'Correction', color: '#000',
                    fontSize: 24, fontFamily: 'sans-serif', z: globalZ++ };
        noterLaPage(t, t.x, t.y);
        texts.push(t);
        const surPage1 = t.surPage && t.surPage.page;
        await allerALaPage(img, 3);
        await new Promise(r => setTimeout(r, 400));
        return { surPage1, cacheAilleurs: surUneAutrePage(t), toujoursLa: texts.length };
    });
    r.egal('un texte écrit sur la page 1 lui appartient', bloc.surPage1, 1);
    r.verifie('il s\'efface quand on tourne la page', bloc.cacheAilleurs, JSON.stringify(bloc));
    r.egal('sans être supprimé', bloc.toujoursLa, 1);

    // --- CE QU'ON ÉCRIT SUR LE DOCUMENT PART AVEC LUI ---
    // L'encre se collait à ce qu'elle annotait, les blocs de texte non : on
    // déplaçait le PDF et les corrections écrites restaient en l'air.
    const colleAuDoc = await page.evaluate(async () => {
        setMode('pointer');
        texts.length = 0; freehands.length = 0;
        const img = images[0];
        img.x = -300; img.y = -220; img.w = 600; img.h = 440; img.angle = 0;
        await allerALaPage(img, 1);
        const t = { id: nextId++, x: img.x + 80, y: img.y + 90, content: 'Correction',
                    color: '#000', fontSize: 24, lineHeight: 29, fontFamily: 'sans-serif',
                    align: 'left', z: globalZ++ };
        accrocherLeTexte(t);
        texts.push(t);
        const accroche = t.surObjet && t.surObjet.type === 'image' && t.surObjet.id === img.id;

        // Déplacement : la même distance, exactement
        const avant = { x: t.x, y: t.y };
        selectedItems = [{ type: 'image', id: img.id }];
        deplacerLesTextes('image', img.id, 40, -25);
        img.x += 40; img.y -= 25;
        const suivi = { dx: Math.round(t.x - avant.x), dy: Math.round(t.y - avant.y) };

        // Agrandissement : la place SUR le document et la taille de la police
        const boiteAvant = boiteDeLHote('image', img);
        const relX = (t.x - img.x) / img.w, relY = (t.y - img.y) / img.h;
        img.w *= 2; img.h *= 2;
        etirerLesTextes('image', img.id, boiteAvant, boiteDeLHote('image', img));
        const apresEtirement = {
            relX: Math.round(((t.x - img.x) / img.w) * 1000) / 1000,
            relY: Math.round(((t.y - img.y) / img.h) * 1000) / 1000,
            attenduX: Math.round(relX * 1000) / 1000, attenduY: Math.round(relY * 1000) / 1000,
            taille: Math.round(t.fontSize), interligne: Math.round(t.lineHeight)
        };

        // L'hôte s'en va : le bloc reste, mais redevient libre
        decrocherLesTraits('image', img.id);
        return { accroche, suivi, apresEtirement, libre: !t.surObjet };
    });
    r.verifie('un bloc écrit sur le document lui appartient', colleAuDoc.accroche,
        JSON.stringify(colleAuDoc));
    r.egal('il suit le document quand on le déplace', colleAuDoc.suivi, { dx: 40, dy: -25 });
    r.egal('il garde sa place sur la page quand on agrandit le document',
        [colleAuDoc.apresEtirement.relX, colleAuDoc.apresEtirement.relY],
        [colleAuDoc.apresEtirement.attenduX, colleAuDoc.apresEtirement.attenduY]);
    r.egal('et sa police suit l\'échelle', colleAuDoc.apresEtirement.taille, 48);
    r.egal('l\'interligne avec elle', colleAuDoc.apresEtirement.interligne, 58);
    r.verifie('le document retiré, le bloc reste mais redevient libre', colleAuDoc.libre,
        JSON.stringify(colleAuDoc));

    // Le vrai chemin, du clic au déplacement à la souris : écrire sur le
    // document avec l'outil Texte, puis tirer le document et voir le bloc
    // partir avec lui. (Appeler les fonctions à la main ne prouve pas
    // qu'elles sont branchées.)
    const bout = await page.evaluate(async () => {
        texts.length = 0; freehands.length = 0;
        const img = images[0];
        img.x = -300; img.y = -220; img.w = 600; img.h = 440; img.angle = 0;
        montrerToutLeDocument(img);
        selectedItems = []; setMode('text');
        zoom = 1; panX = window.innerWidth / 2; panY = window.innerHeight / 2;
        return { x: Math.round(panX + (img.x + 120) * zoom), y: Math.round(panY + (img.y + 120) * zoom),
                 prise: { x: Math.round(panX + (img.x + 480) * zoom), y: Math.round(panY + (img.y + 380) * zoom) } };
    });
    await page.mouse.click(bout.x, bout.y);
    await page.waitForTimeout(150);
    await page.keyboard.type('Corrigé');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const ecrit = await page.evaluate(() => ({
        blocs: texts.length,
        accroche: texts[0] && texts[0].surObjet ? texts[0].surObjet.type + ':' + (texts[0].surObjet.id === images[0].id) : null,
        x: texts[0] && Math.round(texts[0].x), y: texts[0] && Math.round(texts[0].y)
    }));
    r.egal('le bloc écrit à l\'outil Texte est posé', ecrit.blocs, 1);
    r.egal('et il s\'accroche tout seul au document', ecrit.accroche, 'image:true');

    await page.evaluate(() => {
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        draw();
    });
    await page.mouse.move(bout.prise.x, bout.prise.y);
    await page.mouse.down();
    await page.mouse.move(bout.prise.x + 70, bout.prise.y + 45, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const traine = await page.evaluate(() => ({
        image: Math.round(images[0].x), texte: Math.round(texts[0].x),
        dyTexte: Math.round(texts[0].y)
    }));
    r.verifie('tirer le document emmène le bloc avec lui',
        traine.texte === ecrit.x + 70 && traine.dyTexte === ecrit.y + 45,
        JSON.stringify({ ecrit, traine }));

    // --- TOUS LES OUTILS, ET LA RÈGLE DU « HORS DU DOCUMENT » ---
    // Une seule règle : ce dont le MILIEU tombe sur le document lui appartient.
    // Ce qu'on pose à côté reste au tableau — il ne bouge pas avec le document
    // et se voit quelle que soit la page ouverte.
    const outils = await page.evaluate(async () => {
        // (pas « images » : le document doit rester en place)
        [points, segments, circles, rectangles, texts, freehands, curves,
         polygons, arcs].forEach(t => { t.length = 0; });
        const img = images[0];
        img.x = -300; img.y = -220; img.w = 600; img.h = 440; img.angle = 0;
        montrerToutLeDocument(img);
        await allerALaPage(img, 1);

        const pt = (x, y) => { const p = { id: nextId++, x, y, z: globalZ++ }; points.push(p); return p.id; };
        // Sur le document
        const depuis = nextId;
        segments.push({ id: nextId++, p1_id: pt(img.x + 80, img.y + 60), p2_id: pt(img.x + 260, img.y + 90),
                        color: '#000', width: 3, z: globalZ++ });
        circles.push({ id: nextId++, center_id: pt(img.x + 300, img.y + 200), edge_id: pt(img.x + 360, img.y + 200),
                       color: '#000', width: 3, z: globalZ++ });
        rectangles.push({ id: nextId++, p1_id: pt(img.x + 60, img.y + 300), p2_id: pt(img.x + 200, img.y + 380),
                          color: '#000', width: 3, z: globalZ++ });
        polygons.push({ id: nextId++, points: [pt(img.x + 400, img.y + 60), pt(img.x + 470, img.y + 120),
                                               pt(img.x + 420, img.y + 180)], color: '#000', width: 3, z: globalZ++ });
        curves.push({ id: nextId++, points: [pt(img.x + 120, img.y + 200), pt(img.x + 180, img.y + 240),
                                             pt(img.x + 240, img.y + 200)], color: '#000', width: 3, z: globalZ++ });
        arcs.push({ id: nextId++, cx: img.x + 480, cy: img.y + 320, radius: 50,
                    startAngle: 0, endAngle: 2, color: '#000', width: 3, z: globalZ++ });
        // À côté, franchement dehors
        const dehors = nextId;
        segments.push({ id: nextId++, p1_id: pt(img.x + img.w + 120, img.y + 40),
                        p2_id: pt(img.x + img.w + 260, img.y + 80), color: '#000', width: 3, z: globalZ++ });
        arcs.push({ id: nextId++, cx: img.x - 220, cy: img.y + 100, radius: 40,
                    startAngle: 0, endAngle: 2, color: '#000', width: 3, z: globalZ++ });
        // À cheval, mais dont le milieu est sur la page : elle appartient encore
        const cheval = nextId;
        segments.push({ id: nextId++, p1_id: pt(img.x + img.w - 5, img.y + 420),
                        p2_id: pt(img.x + img.w + 45, img.y + 430), color: '#000', width: 3, z: globalZ++ });

        accrocherLesNouvellesFormes(depuis);

        const etat = (id) => {
            for (const [famille, tableau] of [['segment', segments], ['circle', circles],
                    ['rectangle', rectangles], ['polygon', polygons], ['curve', curves], ['arc', arcs]]) {
                const o = tableau.find(x => x.id === id);
                if (o) return { famille, accroche: !!(o.surObjet && o.surObjet.id === img.id),
                                page: o.surPage ? o.surPage.page : null };
            }
            return null;
        };
        const surLeDoc = [depuis, depuis + 3, depuis + 6, depuis + 9, depuis + 13, depuis + 17].map(etat);
        return {
            surLeDoc,
            dehors: [etat(dehors), etat(dehors + 3)],
            cheval: etat(cheval),
            depuis, dehors_: dehors, cheval_: cheval
        };
    });
    r.egal('les six familles de figures s\'accrochent au document',
        outils.surLeDoc.map(e => e && e.accroche), [true, true, true, true, true, true]);
    r.egal('et chacune sait de quelle page elle est',
        outils.surLeDoc.map(e => e && e.page), [1, 1, 1, 1, 1, 1]);
    r.egal('les familles couvertes sont bien les six',
        outils.surLeDoc.map(e => e && e.famille),
        ['segment', 'circle', 'rectangle', 'polygon', 'curve', 'arc']);
    r.egal('ce qui est tracé à côté reste libre',
        outils.dehors.map(e => e && (e.accroche || e.page !== null)), [false, false]);
    r.verifie('et ce qui déborde un peu appartient encore à la page',
        !!(outils.cheval && outils.cheval.accroche), JSON.stringify(outils));

    // Elles suivent le document, et se rangent avec leur page
    const suivent = await page.evaluate(async (dehorsId) => {
        const img = images[0];
        const seg = segments[0];
        const p1 = getObjectById('point', seg.p1_id);
        const avant = { x: p1.x, y: p1.y };
        const arc = arcs[0];
        const arcAvant = { x: arc.cx, y: arc.cy };

        selectedItems = [{ type: 'image', id: img.id }];
        deplacerLesFormes('image', img.id, 55, -30);
        img.x += 55; img.y -= 30;
        const bouge = { dx: Math.round(p1.x - avant.x), dy: Math.round(p1.y - avant.y),
                        arcDx: Math.round(arc.cx - arcAvant.x) };

        await allerALaPage(img, 2);
        const rangees = {
            figure: surUneAutrePage(seg),
            sonPoint: surUneAutrePage(p1),
            libre: surUneAutrePage(segments.find(x => x.id === dehorsId) || {}),
            designe: (() => { const t = findObjectAt(p1.x, p1.y); return t && t.type; })()
        };
        await allerALaPage(img, 1);
        return { bouge, rangees, revenue: !surUneAutrePage(seg) };
    }, outils.dehors_);
    r.egal('une figure du document suit son déplacement', suivent.bouge, { dx: 55, dy: -30, arcDx: 55 });
    r.verifie('elle se range quand on tourne la page',
        suivent.rangees.figure && suivent.rangees.sonPoint, JSON.stringify(suivent));
    r.verifie('ses points ne se désignent plus, invisibles',
        suivent.rangees.designe !== 'point', JSON.stringify(suivent));
    r.verifie('une figure tracée à côté, elle, reste visible',
        suivent.rangees.libre === false, JSON.stringify(suivent));
    r.verifie('et la figure revient avec sa page', suivent.revenue, JSON.stringify(suivent));

    // Le vrai chemin pour une figure : deux clics avec l'outil Rectangle sur le
    // document, puis on tire le document. (Appeler les fonctions à la main ne
    // prouve pas qu'elles sont branchées.)
    const bouteEnBout = await page.evaluate(async () => {
        // (pas « images » : le document doit rester en place)
        [points, segments, circles, rectangles, texts, freehands, curves,
         polygons, arcs].forEach(t => { t.length = 0; });
        const img = images[0];
        img.x = -300; img.y = -220; img.w = 600; img.h = 440; img.angle = 0;
        montrerToutLeDocument(img);
        await allerALaPage(img, 1);
        zoom = 1; panX = window.innerWidth / 2; panY = window.innerHeight / 2;
        selectedItems = []; setMode('rectangle');
        const ecran = (lx, ly) => ({ x: Math.round(panX + lx * zoom), y: Math.round(panY + ly * zoom) });
        return { a: ecran(img.x + 90, img.y + 90), b: ecran(img.x + 240, img.y + 200),
                 prise: ecran(img.x + 500, img.y + 400) };
    });
    // Un rectangle se trace d'un glissement, comme à la main
    await page.mouse.move(bouteEnBout.a.x, bouteEnBout.a.y);
    await page.mouse.down();
    await page.mouse.move(bouteEnBout.b.x, bouteEnBout.b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const tracee = await page.evaluate(() => ({
        combien: rectangles.length,
        tous: rectangles.map(r => {
            const a = getObjectById('point', r.p1_id), b = getObjectById('point', r.p2_id);
            return a && b ? [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)] : null;
        }),
        accroche: rectangles[0] && rectangles[0].surObjet
            ? rectangles[0].surObjet.id === images[0].id : false,
        page: rectangles[0] && rectangles[0].surPage ? rectangles[0].surPage.page : null,
        x: rectangles[0] ? Math.round(getObjectById('point', rectangles[0].p1_id).x) : null
    }));
    r.verifie('le rectangle tracé à la souris est posé', tracee.combien === 1, JSON.stringify(tracee));
    r.verifie('il s\'accroche tout seul au document', tracee.accroche, JSON.stringify(tracee));
    r.egal('et il sait de quelle page il est', tracee.page, 1);

    await page.evaluate(() => {
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        draw();
    });
    await page.mouse.move(bouteEnBout.prise.x, bouteEnBout.prise.y);
    await page.mouse.down();
    await page.mouse.move(bouteEnBout.prise.x + 60, bouteEnBout.prise.y + 35, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const suivi = await page.evaluate(() => ({
        x: rectangles[0] ? Math.round(getObjectById('point', rectangles[0].p1_id).x) : null
    }));
    r.egal('et tirer le document l\'emmène avec lui', suivi.x, tracee.x + 60);

    // --- ZOOMER LA PAGE DANS SON CADRE ---
    // Ce zoom-là n'est pas celui du tableau : le cadre ne bouge pas, c'est
    // l'image qui défile dessous. L'annotation doit rester sur SON mot.
    const zoomPage = await page.evaluate(async () => {
        setMode('pointer');
        texts.length = 0; freehands.length = 0;
        const img = images[0];
        img.x = -300; img.y = -220; img.w = 600; img.h = 440; img.angle = 0;
        montrerToutLeDocument(img);
        const t = { id: nextId++, x: img.x + 150, y: img.y + 120, content: 'ici',
                    color: '#000', fontSize: 24, lineHeight: 29, fontFamily: 'sans-serif',
                    align: 'left', z: globalZ++ };
        accrocherLeTexte(t); texts.push(t);
        const trait = { id: nextId++, points: [{ x: img.x + 200, y: img.y + 200 },
                                               { x: img.x + 260, y: img.y + 205 }],
                        color: '#e6194b', width: 6, z: globalZ++ };
        trait.surObjet = { type: 'image', id: img.id };
        freehands.push(trait);

        // Le pixel d'image que l'annotation désigne : c'est lui qui ne doit
        // pas changer, quoi qu'on fasse au cadrage.
        const pixel = (X, Y) => ({
            x: Math.round(img.cx + (X - img.x) * (img.cw / img.w)),
            y: Math.round(img.cy + (Y - img.y) * (img.ch / img.h))
        });
        const avantTexte = pixel(t.x, t.y);
        const avantTrait = pixel(trait.points[0].x, trait.points[0].y);

        zoomerPage(img, { x: img.x + img.w / 2, y: img.y + img.h / 2 }, 1.8);
        const apresZoom = { texte: pixel(t.x, t.y), trait: pixel(trait.points[0].x, trait.points[0].y),
                            taille: Math.round(t.fontSize), epaisseur: Math.round(trait.width) };

        // Puis on fait coulisser la page dans son cadre
        demarrerGlissePage(img, { x: img.x + 100, y: img.y + 100 });
        poursuivreGlissePage({ x: img.x + 160, y: img.y + 140 });
        glissePage = null;
        const apresGlisse = { texte: pixel(t.x, t.y), trait: pixel(trait.points[0].x, trait.points[0].y) };

        // Et « page entière » remet tout d'aplomb
        montrerToutLeDocument(img);
        const apresEntiere = { texte: pixel(t.x, t.y) };
        return { avantTexte, avantTrait, apresZoom, apresGlisse, apresEntiere };
    });
    r.egal('en zoomant la page, le texte reste sur son mot',
        zoomPage.apresZoom.texte, zoomPage.avantTexte);
    r.egal('et le trait sur le sien', zoomPage.apresZoom.trait, zoomPage.avantTrait);
    r.verifie('l\'annotation grossit avec la page',
        zoomPage.apresZoom.taille > 30 && zoomPage.apresZoom.epaisseur > 8, JSON.stringify(zoomPage));
    r.egal('en faisant coulisser la page, elle reste dessus aussi',
        zoomPage.apresGlisse.texte, zoomPage.avantTexte);
    r.egal('« page entière » ne l\'égare pas non plus',
        zoomPage.apresEntiere.texte, zoomPage.avantTexte);

    // --- ZOOMER, DESSINER, DÉZOOMER : ON DOIT RETROUVER SA PAGE ---
    // En plein écran, la molette zoome la PAGE dans son cadre. Prendre le
    // crayon vidait la sélection : on zoomait avec un geste et l'on dézoomait
    // avec un autre, si bien que la page restait rognée sur ce qu'on venait
    // d'agrandir. On mesure la PART de page montrée, qui ne dépend pas de la
    // finesse du rendu.
    const allerRetourZoom = await page.evaluate(async () => {
        const img = images[0];
        setMode('pointer');
        selectedItems = [{ type: 'image', id: img.id }];
        if (!document.body.classList.contains('focus-mode')) toggleFocusMode();
        modeDocument = 'page';
        montrerToutLeDocument(img);
        majBarreDocument();
        const part = () => Math.round((img.cw / imageCache[img.src].naturalWidth) * 100) / 100;

        const cv = document.getElementById('board');
        const molette = (d) => cv.dispatchEvent(new WheelEvent('wheel', {
            deltaY: d, clientX: Math.round(panX + (img.x + img.w / 2) * zoom),
            clientY: Math.round(panY + (img.y + img.h / 2) * zoom),
            bubbles: true, cancelable: true }));

        const depart = part();
        for (let i = 0; i < 6; i++) molette(-100);          // je zoome
        await new Promise(r => setTimeout(r, 800));
        const zoome = part();

        setMode('freehand');                                // je dessine
        const enMain = !!(documentDeLaBarre() && documentDeLaBarre().id === img.id);
        const choisi = selectedItems.length;

        for (let i = 0; i < 10; i++) molette(100);          // je dézoome
        await new Promise(r => setTimeout(r, 800));
        const revenu = part();

        setMode('pointer');
        if (document.body.classList.contains('focus-mode')) toggleFocusMode();
        modeDocument = 'cadre';
        return { depart, zoome, enMain, choisi, revenu };
    });
    r.egal('au départ, la page entière est montrée', allerRetourZoom.depart, 1);
    r.verifie('la molette zoome bien dans la page', allerRetourZoom.zoome < 0.7,
        JSON.stringify(allerRetourZoom));
    r.egal('prendre le crayon vide la sélection', allerRetourZoom.choisi, 0);
    r.verifie('mais le document reste celui de la barre', allerRetourZoom.enMain,
        JSON.stringify(allerRetourZoom));
    r.egal('et dézoomer rend la page entière, non rognée', allerRetourZoom.revenu, 1);

    // --- ZOOMER FORT NE DOIT PAS PIXELLISER ---
    const finesse = await page.evaluate(async () => {
        const img = images[0];
        montrerToutLeDocument(img);
        const d = documentsPdf.get(img.pluginData.cle);
        // On zoome dans la page : un quart de sa largeur remplit le cadre
        img.w = 600; zoom = 1;
        img.cw = imageCache[img.src].naturalWidth / 4; img.ch = img.cw * (img.h / img.w);
        const avant = { l: imageCache[img.src].naturalWidth, cw: img.cw,
                        echelle: d.rendus.get(img.pluginData.page).echelle };
        const demande = finesseDemandee(img);
        const refait = await affinerLaPage(img);
        const apres = { l: imageCache[img.src].naturalWidth, cw: img.cw,
                        echelle: d.rendus.get(img.pluginData.page).echelle };
        // La part de page montrée doit être EXACTEMENT la même
        return { avant, apres, demande, refait,
                 partAvant: Math.round((avant.cw / avant.l) * 1000),
                 partApres: Math.round((apres.cw / apres.l) * 1000) };
    });
    r.verifie('zoomer fort demande plus de pixels que la page n\'en a',
        finesse.demande > 2, JSON.stringify(finesse));
    r.verifie('la page est alors redessinée plus finement', finesse.refait
        && finesse.apres.echelle > finesse.avant.echelle
        && finesse.apres.l > finesse.avant.l, JSON.stringify(finesse));
    r.egal('et l\'on montre exactement la même part de page', finesse.partApres, finesse.partAvant);

    // Dézoomer : une page rendue six fois trop grande puis montrée petite est
    // granuleuse — le navigateur jette cinq pixels sur six. Elle redescend.
    const degrossi = await page.evaluate(async () => {
        const img = images[0];
        const d = documentsPdf.get(img.pluginData.cle);
        montrerToutLeDocument(img);
        img.w = 200; zoom = 1;              // la page est montrée petite
        const avant = d.rendus.get(img.pluginData.page).echelle;
        const refait = await affinerLaPage(img);
        const apres = d.rendus.get(img.pluginData.page).echelle;
        // Une deuxième fois : il n'y a plus rien à faire
        const encore = await affinerLaPage(img);
        return { demande: Math.round(finesseDemandee(img) * 100) / 100, avant, apres, refait, encore,
                 base: currentPdfQuality,
                 part: Math.round((img.cw / imageCache[img.src].naturalWidth) * 1000) };
    });
    r.verifie('montrée petite, la page redescend en finesse',
        degrossi.refait && degrossi.apres < degrossi.avant, JSON.stringify(degrossi));
    r.egal('sans jamais descendre sous la qualité de base', degrossi.apres, degrossi.base);
    r.egal('et l\'on montre toujours la même part de page', degrossi.part, 1000);
    r.verifie('une fois d\'aplomb, elle n\'est plus redessinée pour rien',
        degrossi.encore === false, JSON.stringify(degrossi));

    // La molette : toutes ne parlent pas la même unité, et un cran ne saute pas
    const molette = await page.evaluate(() => ({
        pixels: Math.round(facteurDeMolette({ deltaY: -100, deltaMode: 0 }, 900) * 1000) / 1000,
        lignes: Math.round(facteurDeMolette({ deltaY: -100 / 16, deltaMode: 1 }, 900) * 1000) / 1000,
        pages: Math.round(facteurDeMolette({ deltaY: -100 / 400, deltaMode: 2 }, 900) * 1000) / 1000,
        arriere: Math.round(facteurDeMolette({ deltaY: 100, deltaMode: 0 }, 900) * 1000) / 1000,
        brutal: Math.round(facteurDeMolette({ deltaY: -3000, deltaMode: 0 }, 900) * 1000) / 1000,
        sansBorne: Math.round(Math.exp(3000 / 900) * 1000) / 1000
    }));
    r.egal('la molette en lignes fait le même pas qu\'en pixels', molette.lignes, molette.pixels);
    r.egal('et la molette en pages aussi', molette.pages, molette.pixels);
    r.verifie('un pas de molette reste doux', molette.pixels < 1.13 && molette.pixels > 1.05,
        JSON.stringify(molette));
    r.verifie('en arrière, le pas est l\'exact inverse',
        Math.abs(molette.arriere * molette.pixels - 1) < 0.002, JSON.stringify(molette));
    r.verifie('et même un geste brutal ne fait pas un bond',
        molette.brutal < 1.2 && molette.sansBorne > 20, JSON.stringify(molette));

    // --- LE VOLET : LES VIGNETTES ---
    // Le crayon avait vidé la sélection : on reprend le document en main,
    // sans quoi la barre — et son bouton — ne sont pas là.
    await page.evaluate(async () => {
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        await allerALaPage(images[0], 1);
        majBarreDocument();
    });
    await page.waitForSelector('#bar-style.ctx-document', { timeout: 5000 });
    await page.click('#doc-volet-btn');
    await attendre(() => {
        const im = document.querySelectorAll('#dv-liste img[data-vignette]');
        return document.getElementById('doc-volet').classList.contains('visible')
            && im.length === 3 && Array.from(im).every(i => (i.src || '').startsWith('data:image'));
    }, undefined, 25000);
    const vignettesDessinees = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#dv-liste img[data-vignette]'))
            .filter(i => (i.src || '').startsWith('data:image')).length);
    r.egal('chaque vignette finit par se dessiner', vignettesDessinees, 3);
    const volet = await page.evaluate(() => ({
        pages: document.querySelectorAll('#dv-liste .dv-page').length,
        courante: document.querySelector('#dv-liste .dv-page.courante')
            ? Number(document.querySelector('#dv-liste .dv-page.courante').dataset.page) : null,
        nom: document.getElementById('dv-nom').textContent
    }));
    r.egal('le volet montre une vignette par page', volet.pages, 3);
    r.egal('la page où l\'on est se distingue', volet.courante, 1);
    r.egal('et le volet dit de quel document il parle', volet.nom, 'cours.pdf');

    await page.click('#dv-liste .dv-page[data-page="3"]');
    r.egal('cliquer une vignette y emmène', await pageCourante(3), 3);
    const apresClic = await page.evaluate(() => {
        const e = document.querySelector('#dv-liste .dv-page.courante');
        return e ? Number(e.dataset.page) : null;
    });
    r.egal('et la vignette de cette page se met en avant', apresClic, 3);

    // --- LE VOLET : CHERCHER UN MOT ---
    await page.fill('#dv-chercher', 'deux');
    await attendre(() => {
        const l = document.querySelectorAll('#dv-liste .dv-page');
        return l.length === 1 && l[0].dataset.page === '2';
    }, undefined, 25000);
    const trouve = await page.evaluate(() => ({
        pages: Array.from(document.querySelectorAll('#dv-liste .dv-page')).map(e => e.dataset.page),
        extrait: (document.querySelector('#dv-liste .dv-extrait') || {}).textContent || '',
        etat: document.getElementById('dv-etat').textContent
    }));
    r.egal('« deux » ne se trouve que sur la page 2', trouve.pages, ['2']);
    r.verifie('avec un extrait de ce qu\'il y a autour', /deux/i.test(trouve.extrait), trouve.extrait);
    r.verifie('et le compte des pages trouvées', /1 page/.test(trouve.etat), trouve.etat);

    await page.click('#dv-liste .dv-page[data-page="2"]');
    await pageCourante(2);
    await page.waitForTimeout(600);
    const surligne = await page.evaluate(() => {
        const s = images[0].pluginData.surlignes || [];
        return { combien: s.length, premier: s[0] || null };
    });
    r.verifie('le mot est montré là où il est sur la page', surligne.combien > 0, JSON.stringify(surligne));
    r.verifie('et le repère a une taille sensée',
        !!surligne.premier && surligne.premier.l > 1 && surligne.premier.h > 1, JSON.stringify(surligne));

    // Le surlignage doit épouser les LETTRES. Vérité de terrain : l'encre
    // réellement peinte sur la page rendue. La bande partait du haut de la
    // police et s'arrêtait à la ligne de base — posée trop haut, elle coupait
    // le bas des mots : on les croyait biffés plutôt qu'éclairés.
    const colle = await page.evaluate(async () => {
        const img = images[0];
        const d = documentsPdf.get(img.pluginData.cle);
        const fiche = await texteDeLaPage(d, 2);
        const ligne = zonesDuMot(fiche, 'Page deux')[0];
        const debut = zonesDuMot(fiche, 'Page')[0];
        const fin = zonesDuMot(fiche, 'deux')[0];
        // La boîte de l'encre de la page rendue
        const im = imageCache[img.src];
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 128) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
        const r = z => ({ g: Math.round(z.x), d: Math.round(z.x + z.l),
                          h: Math.round(z.y), b: Math.round(z.y + z.h) });
        return { encre: { g: x0, d: x1, h: y0, b: y1 }, ligne: r(ligne), debut: r(debut), fin: r(fin) };
    });
    r.verifie('la bande commence au haut des lettres, pas au-dessus',
        Math.abs(colle.ligne.h - colle.encre.h) <= 4, JSON.stringify(colle));
    r.verifie('et descend jusqu\'au bas des jambages',
        colle.ligne.b >= colle.encre.b - 1 && colle.ligne.b <= colle.encre.b + 5, JSON.stringify(colle));
    r.verifie('elle couvre le mot sans le déborder franchement',
        colle.ligne.g <= colle.encre.g && colle.ligne.g >= colle.encre.g - 14
        && colle.ligne.d >= colle.encre.d && colle.ligne.d <= colle.encre.d + 14, JSON.stringify(colle));
    r.verifie('le premier mot est surligné à gauche de la ligne',
        Math.abs(colle.debut.g - colle.ligne.g) <= 6 && colle.debut.d < colle.ligne.d - 40,
        JSON.stringify(colle));
    r.verifie('et le dernier à droite',
        Math.abs(colle.fin.d - colle.ligne.d) <= 6 && colle.fin.g > colle.ligne.g + 40,
        JSON.stringify(colle));

    const efface = await page.evaluate(async () => {
        await allerALaPage(images[0], 1);
        return (images[0].pluginData.surlignes || []).length;
    });
    r.egal('le surlignage reste sur sa page', efface, 0);

    // Un mot absent le dit, sans vider l'écran de toute réponse
    await page.fill('#dv-chercher', 'hippopotame');
    await attendre(() => /ne figure pas/.test(document.getElementById('dv-etat').textContent), undefined, 25000);
    const rien = await page.evaluate(() => ({
        pages: document.querySelectorAll('#dv-liste .dv-page').length,
        etat: document.getElementById('dv-etat').textContent
    }));
    r.egal('un mot absent ne laisse aucune page', rien.pages, 0);
    r.verifie('et le dit clairement', /ne figure pas/.test(rien.etat), rien.etat);

    await page.fill('#dv-chercher', '');
    await attendre(() => document.querySelectorAll('#dv-liste .dv-page').length === 3, undefined, 25000);
    const revenu = await page.evaluate(() => document.querySelectorAll('#dv-liste .dv-page').length);
    r.egal('effacer la recherche rend toutes les pages', revenu, 3);

    // Sans accent comme avec : « Elève » doit répondre à « élève »
    const accents = await page.evaluate(() => ({
        a: sansAccents('Élève'), b: sansAccents('eleve')
    }));
    r.egal('la recherche ignore accents et majuscules', accents.a, accents.b);

    await page.click('#dv-fermer');
    const ferme = await page.evaluate(() => document.getElementById('doc-volet').classList.contains('visible'));
    r.verifie('le volet se ferme', !ferme);

    // Compter les lettres ne suffit pas : un « M » vaut trois « i ». On pose
    // une page qui met les deux côte à côte, et l'on prend pour vérité les
    // deux paquets d'encre que l'espace sépare.
    const largeurs = await page.evaluate(async ({ octets }) => {
        images.length = 0; selectedItems = [];
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'largeurs.pdf', { type: 'application/pdf' }));
        await new Promise(r => setTimeout(r, 900));
        const img = images[0];
        const d = documentsPdf.get(img.pluginData.cle);
        const fiche = await texteDeLaPage(d, 1);
        const zone = zonesDuMot(fiche, 'MMMM')[0];
        const im = imageCache[img.src];
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        // Colonnes qui portent de l'encre, puis les paquets qu'elles forment
        const pleines = [];
        for (let x = 0; x < c.width; x++) {
            for (let y = 0; y < c.height; y++) {
                const i = (y * c.width + x) * 4;
                if ((px[i] + px[i + 1] + px[i + 2]) / 3 < 128) { pleines.push(x); break; }
            }
        }
        const paquets = [];
        pleines.forEach(x => {
            const dernier = paquets[paquets.length - 1];
            if (dernier && x - dernier.d <= 18) dernier.d = x; else paquets.push({ g: x, d: x });
        });
        const naif = fiche.morceaux[0]
            ? Math.round(fiche.morceaux[0].x + (5 / 9) * fiche.morceaux[0].l) : null;
        return { paquets, zone: zone ? { g: Math.round(zone.x), d: Math.round(zone.x + zone.l) } : null, naif };
    }, { octets: Array.from(petitPdf(['iiii MMMM'])) });
    r.egal('la page d\'essai porte bien deux paquets d\'encre', largeurs.paquets.length, 2);
    r.verifie('le surlignage tombe sur les M, pas au milieu de la ligne',
        !!largeurs.zone && largeurs.paquets.length === 2
        && Math.abs(largeurs.zone.g - largeurs.paquets[1].g) <= 12
        && Math.abs(largeurs.zone.d - largeurs.paquets[1].d) <= 12, JSON.stringify(largeurs));
    r.verifie('là où compter les lettres se serait trompé de beaucoup',
        largeurs.paquets.length === 2 && Math.abs(largeurs.naif - largeurs.paquets[1].g) > 60,
        JSON.stringify(largeurs));


    // --- LES ZONES À REMPLIR ---
    // Un polycopié propre porte ses zones DANS son fichier : les lignes à
    // écrire sont de vrais tracés, les cases de vrais rectangles. La fiche
    // d'essai en a trois de chaque sorte, plus ce qu'il faut écarter : un
    // bandeau de titre coloré, une case déjà remplie, une grille de lettres.
    const detection = await page.evaluate(async () => {
        const cle = [...documentsPdf.keys()][0];
        const d = documentsPdf.get(cle);
        return d ? (await zonesDeLaPage(d, 1)).length : -1;
    });

    await tableauVierge(page);
    const [choixFiche] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.evaluate(() => document.getElementById('btn-import-pdf').click())
    ]);
    await choixFiche.setFiles({ name: 'fiche.pdf', mimeType: 'application/pdf', buffer: fichePdf() });
    await page.waitForFunction(() => images.length === 1 && images[0].pluginData, { timeout: 15000 });
    await page.waitForTimeout(400);

    const zones = await page.evaluate(async () => {
        const d = documentsPdf.get(images[0].pluginData.cle);
        const z = await zonesDeLaPage(d, 1);
        // Le repère est en PROPORTIONS de la page : il survit au réaffinage,
        // qui change la taille du rendu sans changer la page.
        const dansLaPage = z.every(u => u.x >= 0 && u.y >= 0 && u.x + u.l <= 1.001 && u.y + u.h <= 1.001);
        // trois lignes réglées : larges et plates, dans le haut de la page
        const lignes = z.filter(u => u.l > 0.4 && u.h < 0.09 && u.y < 0.5).length;
        // trois cases vides : petites, au milieu — dont une tracée en quatre
        // segments plutôt qu'avec l'opérateur « rectangle ».
        const cases = z.filter(u => u.l < 0.25 && u.y > 0.45 && u.y < 0.85).length;
        // La case tracée en QUATRE SEGMENTS : reconnue comme une case, elle
        // donne son intérieur (haut) ; lue seulement comme un trait, elle ne
        // donnerait qu'une bande fine au-dessus de son bord.
        const enSegments = z.filter(u => u.l < 0.25 && u.h > 0.07).length;
        // La méthode travaille sur la page PEINTE : elle ne lit pas le fichier,
        // elle regarde. Un scan est donc traité comme le reste — et les
        // POINTILLÉS, que les tracés ne donnent jamais comme un trait, se
        // voient aussi. On note le genre de chaque zone.
        const genres = z.map(u => u.genre).sort().join(',');
        return { n: z.length, dansLaPage, lignes, cases, enSegments, genres };
    });
    r.egal('la détection trouve les six zones de la fiche', zones.n, 6);
    r.egal('les trois lignes réglées', zones.lignes, 3);
    r.egal('et les trois cases vides', zones.cases, 3);
    r.egal('dont une tracée en quatre segments, reconnue comme une case entière',
        zones.enSegments, 1);
    r.verifie('les repères sont en proportions de la page', zones.dansLaPage, JSON.stringify(zones));
    r.verifie('chaque zone dit son genre : ligne à écrire ou case à remplir',
        zones.genres.split(',').every(g => ['ligne', 'case', 'cadre'].includes(g)), zones.genres);

    // Ce qui NE doit PAS être retenu : le bandeau de titre (coloré, avec du
    // texte), la case qui porte déjà un A, la grille de six lettres. Cinq
    // zones en tout, donc aucune des neuf autres n'est passée.
    r.verifie('le bandeau, la case remplie et la grille sont écartés',
        zones.n === 6, JSON.stringify(zones));

    // LE BOUTON EST DANS LA BARRE DU DOCUMENT, sur le document qu'il
    // concerne. Rangé dans le panneau général, derrière la petite roue du
    // tiroir des plugins, personne ne le trouvait.
    const bouton = await page.evaluate(() => {
        zonesActives = false;
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext();
        const b2 = document.getElementById('doc-zones');
        const dansLaBarre = !!(b2 && b2.closest('#bar-style'));
        const visible = !!(b2 && b2.getClientRects().length);
        b2.click();
        const apres = { actif: zonesActives, allume: b2.classList.contains('actif'),
                        accord: document.getElementById('rp-zones').classList.contains('actif') };
        b2.click();
        return { dansLaBarre, visible, apres, eteint: !zonesActives };
    });
    r.verifie('le bouton des zones vit dans la barre du document, et se voit',
        bouton.dansLaBarre && bouton.visible, JSON.stringify(bouton));
    r.verifie('il allume le repérage et s\'allume avec',
        bouton.apres.actif && bouton.apres.allume, JSON.stringify(bouton.apres));
    r.verifie('et le panneau général dit la même chose',
        bouton.apres.accord, JSON.stringify(bouton.apres));
    r.verifie('un second clic l\'éteint', bouton.eteint, JSON.stringify(bouton));

    // Sur une image ordinaire, il n'a rien à chercher : il ne se propose pas.
    const surUneImage = await page.evaluate(() => {
        images.push({ id: nextId++, x: 0, y: 0, w: 40, h: 40, cx: 0, cy: 0, cw: 40, ch: 40, src: '', z: globalZ++ });
        selectedItems = [{ type: 'image', id: images[images.length - 1].id }];
        updateStyleBarContext();
        const v = document.getElementById('doc-zones').getClientRects().length > 0;
        images.pop();
        return v;
    });
    r.verifie('sur une image ordinaire, le bouton ne se propose pas', !surUneImage);

    // UN POINTILLÉ, la vraie raison d'être de cette méthode : dans le fichier,
    // ce sont des dizaines de segments minuscules, chacun bien trop court pour
    // ressembler à une ligne à remplir. Sur la page peinte, c'est une suite de
    // colonnes fines — et cela se voit.
    const pointilles = await page.evaluate(async () => {
        // une page avec un seul pointillé, et rien d'autre
        const flux = 'BT /F1 10 Tf 20 200 Td (Nom :) Tj ET\n'
            + [...Array(40)].map((_, i) => `${60 + i * 5} 198 m ${62 + i * 5} 198 l S`).join('\n');
        const objs = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
            `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`
        ];
        let out = '%PDF-1.4\n'; const pos = [];
        objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
        const xref = out.length;
        out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
        pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
        out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        const u8 = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 0xff;
        const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
        const z = await zonesDeLaPage({ doc }, 1);
        return { n: z.length, zones: z.map(u => ({ g: u.genre, x: +u.x.toFixed(3), y: +u.y.toFixed(3),
                 l: +u.l.toFixed(3), h: +u.h.toFixed(3) })),
                 large: z.length ? +Math.max(...z.map(u => u.l)).toFixed(2) : 0 };
    });
    r.egal('un pointillé est reconnu comme une ligne à remplir', pointilles.n, 1);
    r.verifie('et sur toute sa longueur, pas segment par segment',
        pointilles.large > 0.3, JSON.stringify(pointilles));

    // UN POLYCOPIÉ FAIT DE TABLEAUX — le cas qui manquait presque tout. Chaque
    // ligne à remplir est posée DANS une case, huit points au-dessus de la
    // bordure basse. Cette bordure, horizontale et proche, était comptée comme
    // un « montant » aux deux bouts du trait : il passait pour le bord d'un
    // rectangle et disparaissait. Zéro zone trouvée sur dix-huit.
    const enCases = await page.evaluate(async (b64) => {
        const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
        const z = await zonesDeLaPage({ doc }, 1);
        return { n: z.length, lignes: z.filter(u => u.genre === 'ligne').length };
    }, polyEnCases().toString('base64'));
    r.egal('un poly fait de tableaux : les dix-huit lignes sont trouvées', enCases.lignes, 18);
    r.egal('et rien de plus', enCases.n, 18);

    // UNE PAGE DENSE EN TROIS COLONNES, comme un vrai polycopié : vingt-quatre
    // courtes lignes après leur libellé. Les seuils se mesurent en hauteurs de
    // TEXTE — en proportions de la page, « 4 % de la largeur » faisait
    // quarante-huit points sur un A4 paysage, et tout tombait.
    const dense = await page.evaluate(async (b64) => {
        const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
        const z = await zonesDeLaPage({ doc }, 1);
        return { n: z.length, haut: z.filter(u => u.y < 0.055).length,
                 courtes: z.filter(u => u.l < 0.045).length };
    }, polyDense().toString('base64'));
    r.egal('une page dense en trois colonnes : les vingt-sept lignes', dense.n, 27);
    // Les trois plus COURTES — trente-cinq points — ne survivent que parce que
    // les seuils se mesurent en hauteurs de texte : en proportions de la page,
    // le minimum valait quarante-huit points sur ce format.
    r.egal('y compris les trois très courtes', dense.courtes, 3);
    // Le HAUT des lettres d'un titre forme lui aussi une suite de colonnes
    // fines : sans la récusation par le texte, trois faux traits paraissaient
    // au-dessus des trois titres de colonne.
    r.egal('et aucun faux trait sur les titres de colonne', dense.haut, 0);

    // UN POLYCOPIÉ EN COULEUR — le vrai, celui d'un collègue qui soigne ses
    // fiches. Trois pièges d'un coup : des lignes SAUMON trop claires pour le
    // seuil d'encre, des cases MAUVE PÂLE plus sombres que ces lignes-là, et
    // des mots SOULIGNÉS qui passaient pour des lignes à remplir.
    const couleur = await page.evaluate(async (b64) => {
        const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const doc = await pdfjsLib.getDocument({ data: u8 }).promise;
        const z = await zonesDeLaPage({ doc }, 1);
        return { n: z.length,
                 // les cinq de la colonne de gauche, en saumon
                 gauche: z.filter(u => u.x < 0.4).length,
                 courtes: z.filter(u => u.l < 0.035).length,
                 // rien au milieu (cases teintées, filet gris) ni à droite (soulignés)
                 milieu: z.filter(u => u.x >= 0.38 && u.x < 0.7).length,
                 droite: z.filter(u => u.x >= 0.7).length };
    }, polyEnCouleur().toString('base64'));
    // Luminance 189 : au-dessus du seuil d'encre hérité, donc invisibles. La
    // page entière ne rendait que les zones tracées en noir.
    r.egal('les lignes tracées en saumon sont trouvées', couleur.gauche, 5);
    // Dix-huit points : une fois et demie la hauteur du texte. Le minimum en
    // valait deux fois deux dixièmes et l'écartait.
    r.egal('y compris la plus courte', couleur.courtes, 1);
    // Mauve pâle rgb(209,196,233) : luminance 204, donc PLUS SOMBRE que le bord
    // de la ligne saumon (210). Ce n'est pas la luminance qui les sépare, c'est
    // la saturation — un trait imprimé est franc, un fond de case est délavé.
    // Le filet gris décoratif tombe par la même règle.
    r.egal('les cases teintées et le filet gris ne sont pas des zones', couleur.milieu, 0);
    // Un souligné n'a que l'interligne au-dessus de lui : on ne peut pas y
    // écrire, donc ce n'est pas une zone. C'est toute la règle.
    r.egal('les mots soulignés ne sont pas des lignes à remplir', couleur.droite, 0);
    r.egal('et rien de plus sur la page', couleur.n, 5);

    // Option éteinte : rien ne s'éclaire, rien ne se cherche.
    const eteint = await page.evaluate(() => {
        zonesActives = false;
        setMode('text');
        delete images[0].pluginData.zones;
        draw();
        return { zones: images[0].pluginData.zones || null, vise: zoneVisee({ x: 0, y: 0 }) };
    });
    r.egal('option éteinte, aucune zone n\'est cherchée', eteint.zones, null);
    r.egal('et rien n\'est visé', eteint.vise, null);

    // Option allumée, outil Texte, clic dans la première ligne réglée : le
    // bloc s'ouvre DANS la zone, à sa taille.
    const rempli = await page.evaluate(async () => {
        zonesActives = true;
        const obj = images[0];
        const d = documentsPdf.get(obj.pluginData.cle);
        obj.pluginData.zones = await zonesDeLaPage(d, 1);
        obj.pluginData.zonesPage = 1;
        setMode('text');
        // Une taille de départ VOLONTAIREMENT hors sujet : si le clic ne visait
        // pas la zone, elle resterait telle quelle.
        activeStyle.fontSize = 64;
        activeStyle.lineHeight = 77;
        draw();
        // la première ligne réglée, ramenée sur le tableau
        const ligne = obj.pluginData.zones
            .map(z => zoneSurLeTableau(obj, z))
            .filter(Boolean)
            .sort((a, b) => a.y - b.y)[0];
        return {
            ligne: { x: Math.round(ligne.x), y: Math.round(ligne.y),
                     l: Math.round(ligne.l), h: Math.round(ligne.h) },
            ecran: { x: Math.round(panX + (ligne.x + ligne.l / 2) * zoom),
                     y: Math.round(panY + (ligne.y + ligne.h / 2) * zoom) }
        };
    });
    await page.mouse.click(rempli.ecran.x, rempli.ecran.y);
    await page.waitForTimeout(200);
    const saisie = await page.evaluate(() => ({
        ouvert: getComputedStyle(document.getElementById('wysiwyg-text')).display !== 'none',
        pos: tempTextLogicalPos && { x: Math.round(tempTextLogicalPos.x), y: Math.round(tempTextLogicalPos.y) },
        taille: activeStyle.fontSize
    }));
    r.verifie('le clic dans une zone ouvre la saisie', saisie.ouvert, JSON.stringify(pose));
    // On a cliqué au MILIEU de la ligne : le bloc doit s'ouvrir à son BORD
    // GAUCHE, sinon il n'a pas visé la zone mais le point du clic.
    r.verifie('le bloc s\'ouvre au bord gauche de la zone, pas là où l\'on a cliqué',
        saisie.pos && Math.abs(saisie.pos.x - rempli.ligne.x) < rempli.ligne.l * 0.2,
        JSON.stringify({ saisie, ligne: rempli.ligne }));
    r.verifie('et sa taille descend de 64 à la hauteur de la ligne',
        saisie.taille > 4 && saisie.taille <= rempli.ligne.h && saisie.taille < 64,
        JSON.stringify({ taille: saisie.taille, hauteur: rempli.ligne.h }));

    // --- L'ORDRE DE LECTURE ---
    // Trouver les trous ne suffit pas : il faut savoir lequel vient après
    // lequel, puisque c'est cet ordre-là qui fait passer de l'un à l'autre à la
    // tabulation. Un polycopié est fait de COLONNES, et lu ligne par ligne il
    // les entremêle.
    const ordre = await page.evaluate(() => {
        const zone = (x, y) => ({ x, y, l: 0.28, h: 0.03 });
        // Trois colonnes de page : les hauteurs n'ont aucun rapport de l'une à
        // l'autre — c'est du texte suivi, chacune va son train.
        const colonnes = rangerLesZones([
            zone(0.68, 0.20), zone(0.03, 0.10), zone(0.36, 0.80),
            zone(0.03, 0.55), zone(0.68, 0.62), zone(0.36, 0.88)
        ]);
        // Un TABLEAU de trois colonnes : chaque case a sa jumelle à la même
        // hauteur. Il se lit en RANGÉES, de gauche à droite.
        const tableau = [];
        for (let l = 0; l < 3; l++) for (let c = 2; c >= 0; c--) tableau.push(zone(0.03 + c * 0.33, 0.1 + l * 0.3));
        const range = rangerLesZones(tableau);
        return {
            colonnes: colonnes.map(z => `${z.x.toFixed(2)}/${z.y.toFixed(2)}`),
            tableau: range.map(z => `${z.x.toFixed(2)}/${z.y.toFixed(2)}`)
        };
    });
    r.egal('trois colonnes se lisent colonne par colonne, de haut en bas', ordre.colonnes,
        ['0.03/0.10', '0.03/0.55', '0.36/0.80', '0.36/0.88', '0.68/0.20', '0.68/0.62']);
    // Ni la largeur des gouttières ni la hauteur des paquets ne distinguent
    // une page en colonnes d'un tableau : sur un vrai poly, les gouttières de
    // la page sont même plus étroites que celles du tableau qu'elle contient.
    // C'est l'ALIGNEMENT des rangées qui les sépare.
    r.egal('un tableau se lit en rangées, de gauche à droite', ordre.tableau,
        ['0.03/0.10', '0.36/0.10', '0.69/0.10',
         '0.03/0.40', '0.36/0.40', '0.69/0.40',
         '0.03/0.70', '0.36/0.70', '0.69/0.70']);

    // --- RETOUCHER LES ZONES ---
    // La détection ne sera jamais parfaite. Un appui long sur le bouton ouvre
    // la retouche : on dessine ce qui manque, on rattrape ce qui tombe à côté,
    // on efface ce qui est de trop.
    await tableauVierge(page);
    const [choixCouleur] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.evaluate(() => document.getElementById('btn-import-pdf').click())
    ]);
    await choixCouleur.setFiles({ name: 'couleur.pdf', mimeType: 'application/pdf', buffer: polyEnCouleur() });
    await page.waitForFunction(() => images.length === 1 && images[0].pluginData, { timeout: 15000 });
    await page.waitForTimeout(500);

    // LA TAILLE D'ÉCRITURE se règle sur le document : on ne remplit pas un
    // polycopié de sixième avec la même écriture qu'on annote un plan.
    const taille11 = await page.evaluate(() => activeStyle.fontSize);

    await page.evaluate(() => {
        zonesActives = true;
        selectedItems = [{ type: 'image', id: images[0].id }];
        if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
        demanderLesZones(images[0]);
        draw();
    });
    await page.waitForFunction(() => (images[0].pluginData.zones || []).length > 0, { timeout: 10000 });
    const avant = await page.evaluate(() => images[0].pluginData.zones.length);

    // L'APPUI LONG sur le bouton des zones ouvre la retouche ; le clic bref,
    // lui, garde son office — allumer et éteindre le repérage.
    const boite = await page.locator('#doc-zones').boundingBox();
    await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const enRetouche = await page.evaluate(() => zonesEdition === true);
    r.verifie('un appui long sur le bouton des zones ouvre la retouche', enRetouche, '');
    // Tout ce qui suit a besoin du mode. S'il ne s'est pas ouvert, on l'ouvre
    // à la main : les autres vérifications diront alors ce qu'elles ont à dire
    // au lieu d'entraîner la suite dans leur chute.
    if (!enRetouche) await page.evaluate(() => basculerEditionDesZones(true));
    r.verifie('et les trois boutons de retouche paraissent',
        await page.evaluate(() => getComputedStyle(document.getElementById('doc-zones-trier')).display !== 'none'), '');

    // TRACER UN RECTANGLE dans un coin vide du document : une zone de plus.
    const vide = await page.evaluate(() => {
        const o = images[0];
        // le bas du document, sous tout ce qui a été trouvé
        const zs = o.pluginData.zones || [];
        const bas = zs.length ? Math.max(...zs.map(z => z.y + z.h)) : 0.5;
        const ecran = (x, y) => ({ x: Math.round(panX + x * zoom), y: Math.round(panY + y * zoom) });
        const img = imageCache[o.src];
        const y = o.y + (bas * img.naturalHeight - o.cy) * (o.h / o.ch) + 20;
        return { a: ecran(o.x + 30, y), b: ecran(o.x + 220, y + 40) };
    });
    // UN CLIC N'EST PAS UN RECTANGLE — et au doigt, un clic bouge toujours de
    // deux ou trois pixels. Sans un seuil de taille, chaque hésitation poserait
    // une zone grande comme rien, où l'on ne pourrait rien écrire. On l'essaie
    // AVANT de tracer, sur un fond bien vide : à côté d'une zone déjà tenue, on
    // attraperait sa poignée et l'on ne mesurerait rien du tout.
    await page.mouse.move(vide.a.x, vide.a.y);
    await page.mouse.down();
    await page.mouse.move(vide.a.x + 4, vide.a.y + 3, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    r.egal('un clic qui tremble un peu n\'ajoute pas de zone minuscule',
        await page.evaluate(() => (images[0].pluginData.zones || []).length), avant);

    await page.mouse.move(vide.a.x, vide.a.y);
    await page.mouse.down();
    await page.mouse.move(vide.b.x, vide.b.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const apresTrace = await page.evaluate(() => ({
        n: (images[0].pluginData.zones || []).length,
        tenue: zoneChoisie
    }));
    r.egal('un rectangle tracé ajoute une zone', apresTrace.n, avant + 1);
    r.egal('elle est aussitôt tenue, prête à être ajustée', apresTrace.tenue, avant);

    // LES RETOUCHES SONT GARDÉES AVEC LE DOCUMENT, et la détection ne reprend
    // jamais la main dessus : sans cela, éteindre puis rallumer le repérage —
    // ou simplement tourner la page et revenir — effacerait tout ce qu'on a
    // dessiné à la main.
    const apresBascule = await page.evaluate(() => {
        basculerLesZones();          // éteint : les zones trouvées sont oubliées
        basculerLesZones();          // rallumé
        const z = demanderLesZones(images[0]);
        return z ? z.length : -1;
    });
    r.egal('éteindre et rallumer le repérage ne perd pas la zone dessinée',
        apresBascule, avant + 1);

    // REDIMENSIONNER : on tire le coin bas-droit de la zone tenue.
    const poignee = await page.evaluate(() => {
        const o = images[0];
        const zs = o.pluginData.zones || [];
        if (!zs.length) return { l: 0, h: 0, coin: { x: 0, y: 0 } };
        const z = zs[zs.length - 1];
        const b = zoneSurLeTableau(o, z);
        zoneChoisie = o.pluginData.zones.length - 1;
        docDesZones = o; draw();
        return { l: b.l, h: b.h,
                 coin: { x: Math.round(panX + (b.x + b.l) * zoom), y: Math.round(panY + (b.y + b.h) * zoom) } };
    });
    await page.mouse.move(poignee.coin.x, poignee.coin.y);
    await page.mouse.down();
    await page.mouse.move(poignee.coin.x + 90, poignee.coin.y + 30, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const apresPoignee = await page.evaluate(() => {
        const o = images[0];
        const zs = o.pluginData.zones || [];
        const b = zs.length ? zoneSurLeTableau(o, zs[zs.length - 1]) : { l: 0, h: 0 };
        return { l: Math.round(b.l), h: Math.round(b.h) };
    });
    r.verifie('tirer une poignée élargit la zone',
        apresPoignee.l > poignee.l + 40 && apresPoignee.h > poignee.h + 10,
        JSON.stringify({ avant: { l: Math.round(poignee.l), h: Math.round(poignee.h) }, apres: apresPoignee }));

    // DÉPLACER : on saisit la zone en son milieu.
    const glisse = await page.evaluate(() => {
        const o = images[0];
        const zs = o.pluginData.zones || [];
        const b = zs.length ? zoneSurLeTableau(o, zs[zs.length - 1]) : { x: 0, y: 0, l: 0, h: 0 };
        return { x: b.x, y: b.y,
                 milieu: { x: Math.round(panX + (b.x + b.l / 2) * zoom), y: Math.round(panY + (b.y + b.h / 2) * zoom) } };
    });
    await page.mouse.move(glisse.milieu.x, glisse.milieu.y);
    await page.mouse.down();
    await page.mouse.move(glisse.milieu.x + 60, glisse.milieu.y - 25, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const deplacee = await page.evaluate((d) => {
        const o = images[0];
        const zs = o.pluginData.zones || [];
        const b = zs.length ? zoneSurLeTableau(o, zs[zs.length - 1]) : { x: d.x, y: d.y };
        return { dx: Math.round(b.x - d.x), dy: Math.round(b.y - d.y) };
    }, { x: glisse.x, y: glisse.y });
    r.verifie('glisser une zone la déplace, sans la déformer',
        Math.abs(deplacee.dx - 60 / (await page.evaluate(() => zoom))) < 8
        && Math.abs(deplacee.dy + 25 / (await page.evaluate(() => zoom))) < 8,
        JSON.stringify(deplacee));

    // EFFACER la zone tenue — et ELLE SEULE. Laissée passer, la touche Suppr
    // s'en prenait au document : on perdait le polycopié pour avoir voulu
    // retirer un rectangle de trop.
    await page.evaluate(() => { canvas.focus(); });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(120);
    r.egal('Suppr efface la zone tenue, et laisse le document', await page.evaluate(() => ({
        docs: images.length,
        n: images[0] && images[0].pluginData.zones ? images[0].pluginData.zones.length : -1
    })), { docs: 1, n: avant });
    // Aucune zone tenue : la touche ne doit rien emporter d'autre.
    await page.keyboard.press('Delete');
    await page.waitForTimeout(120);
    r.egal('et sans zone tenue, elle n\'emporte rien', await page.evaluate(() => images.length), 1);

    // NUMÉROTER À LA MAIN : on clique les zones dans l'ordre voulu, et chacune
    // vient prendre le rang suivant.
    const numerote = await page.evaluate(() => {
        const o = images[0];
        // On prend la DERNIÈRE zone dans l'ordre courant, et on ira la cliquer
        // en premier : elle doit remonter en tête.
        const zs = o.pluginData.zones || [];
        const derniere = zs[zs.length - 1] || { x: 0, y: 0, l: 0, h: 0 };
        const b = zoneSurLeTableau(o, derniere) || { x: 0, y: 0, l: 0, h: 0 };
        basculerNumerotationDesZones();
        return { repere: JSON.stringify(derniere),
                 milieu: { x: Math.round(panX + (b.x + b.l / 2) * zoom), y: Math.round(panY + (b.y + b.h / 2) * zoom) } };
    });
    await page.mouse.click(numerote.milieu.x, numerote.milieu.y);
    await page.waitForTimeout(120);
    r.egal('cliquer une zone en mode numérotation la met au premier rang',
        await page.evaluate(() => JSON.stringify(images[0].pluginData.zones[0])), numerote.repere);

    // TRIER remet l'ordre de lecture — et défait donc ce reclassement.
    const apresTri = await page.evaluate(() => {
        zoneNumerotation = false;
        trierLesZones();
        const zs = images[0].pluginData.zones || [];
        return { premiere: JSON.stringify(zs[0]),
                 // Une fois trié, retrier ne change plus rien : c'est ce qui
                 // dit que le rangement a bien été ÉCRIT dans le document, et
                 // pas seulement calculé puis jeté.
                 stable: JSON.stringify(zs) === JSON.stringify(rangerLesZones(zs)) };
    });
    r.verifie('« Trier » défait le classement à la main', apresTri.premiere !== numerote.repere, '');
    r.verifie('et laisse les zones dans l\'ordre de lecture', apresTri.stable, '');

    await page.evaluate(() => basculerEditionDesZones(false));
    r.verifie('le bouton « Terminer » referme la retouche',
        await page.evaluate(() => zonesEdition === false), '');

    // --- D'UN TROU AU SUIVANT, À LA TABULATION ---
    // C'est à cela que sert l'ordre de lecture : remplir une fiche sans lever
    // la main du clavier pour aller viser la ligne d'après.
    const premiereZone = await page.evaluate(() => {
        setMode('text');
        const o = images[0];
        const zs = o.pluginData.zones || [];
        const b = zs.length ? zoneSurLeTableau(o, zs[0]) : { x: 0, y: 0, l: 0, h: 0 };
        return { x: Math.round(panX + (b.x + b.l / 2) * zoom), y: Math.round(panY + (b.y + b.h / 2) * zoom) };
    });
    await page.mouse.click(premiereZone.x, premiereZone.y);
    await page.waitForTimeout(200);
    r.egal('le clic ouvre la saisie sur la première zone',
        await page.evaluate(() => tempTextLogicalPos && tempTextLogicalPos.zoneRang), 0);
    await page.keyboard.type('12');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
    const apresTab = await page.evaluate(() => ({
        rang: tempTextLogicalPos && tempTextLogicalPos.zoneRang,
        ouvert: getComputedStyle(document.getElementById('wysiwyg-text')).display !== 'none',
        ecrit: texts.length
    }));
    r.egal('la tabulation passe à la zone suivante', apresTab.rang, 1);
    r.verifie('la saisie reste ouverte', apresTab.ouvert, JSON.stringify(apresTab));
    r.egal('et ce qui était écrit est posé sur le tableau', apresTab.ecrit, 1);
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(250);
    r.egal('Maj+Tab revient à la précédente',
        await page.evaluate(() => tempTextLogicalPos && tempTextLogicalPos.zoneRang), 0);
    await page.evaluate(() => { finalizeText(); zonesActives = false; setMode('pointer'); });

    // LA TAILLE D'ÉCRITURE suit celle du document : la même fiche composée en
    // vingt-deux points doit ouvrir une écriture deux fois plus grande.
    await tableauVierge(page);
    await page.evaluate(() => { activeStyle.fontSize = 64; });
    const [choixGrand] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.evaluate(() => document.getElementById('btn-import-pdf').click())
    ]);
    await choixGrand.setFiles({ name: 'grand.pdf', mimeType: 'application/pdf', buffer: polyEnCouleur(22) });
    await page.waitForFunction(() => images.length === 1 && images[0].pluginData, { timeout: 15000 });
    await page.waitForTimeout(600);
    const taille22 = await page.evaluate(() => activeStyle.fontSize);
    r.verifie('la taille d\'écriture descend de 64 à celle du document',
        taille11 > 4 && taille11 < 40, JSON.stringify({ taille11 }));
    // Le TITRE de la fiche est en vingt-six points, mais en cinq lettres : si
    // l'on prenait la plus grande police, ou la moyenne, on écrirait trop gros.
    r.verifie('c\'est la police la plus RÉPANDUE, pas la plus grande',
        Math.abs(taille22 / taille11 - 2) < 0.35,
        JSON.stringify({ taille11, taille22, rapport: +(taille22 / taille11).toFixed(2) }));
    await page.evaluate(() => { zonesActives = false; setMode('pointer'); });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
