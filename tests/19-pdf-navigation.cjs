// Naviguer dans un PDF posé sur le tableau : garder les pages rendues,
// aller droit à un numéro, feuilleter au clavier et au doigt, l'encre qui
// appartient à sa page, le volet des vignettes et la recherche dans le texte.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

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


    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
