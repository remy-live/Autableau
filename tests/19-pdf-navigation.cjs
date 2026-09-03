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

    // --- LE VOLET : LES VIGNETTES ---
    // Le crayon avait vidé la sélection : on reprend le document en main,
    // sans quoi la barre — et son bouton — ne sont pas là.
    await page.evaluate(async () => {
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        await allerALaPage(images[0], 1);
        majBarreDocument();
    });
    await page.waitForSelector('#barre-document.visible', { timeout: 5000 });
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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
