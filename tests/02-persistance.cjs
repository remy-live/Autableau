// Sauvegarde, historique d'annulation et mutualisation des images.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Persistance');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Tableau chargé : 12 tampons identiques + 1 différent, puis 200 actions
    const mesures = await page.evaluate(() => {
        const mk = (graine) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
            Array.from({ length: 3000 }, (_, i) => `<rect x="${i % 55 * 7}" y="${Math.floor(i / 55) * 7}" width="6" height="6" fill="#${((i * graine) % 16777215).toString(16).padStart(6, '0')}"/>`).join('') +
            '</svg>');
        const a = mk(7919), b = mk(104729);
        [a, b].forEach(src => { const im = new Image(); im.src = src; imageCache[src] = im; });
        for (let i = 0; i < 12; i++) images.push({ id: nextId++, x: i * 40, y: i * 30, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400, src: a, z: globalZ++ });
        images.push({ id: nextId++, x: 900, y: 100, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400, src: b, z: globalZ++ });

        const t0 = performance.now();
        for (let i = 0; i < 200; i++) { images[0].x += 1; saveState(); }
        const parAction = (performance.now() - t0) / 200;

        const brut = JSON.stringify({ pages: [{ images }], nextId, globalZ, currentBgIndex }).length;
        const paye = JSON.stringify(stateForStorage()).length;
        return {
            parActionMs: +parAction.toFixed(2),
            entrees: history.length,
            historiqueMo: +(history.reduce((x, s) => x + s.length, 0) / 1048576).toFixed(2),
            brutMo: +(brut / 1048576).toFixed(2),
            payeMo: +(paye / 1048576).toFixed(2)
        };
    });
    r.verifie('temps par action sous 3 ms', mesures.parActionMs < 3, `${mesures.parActionMs} ms`);
    r.verifie('historique sous 5 Mo', mesures.historiqueMo < 5, `${mesures.historiqueMo} Mo pour ${mesures.entrees} entrées`);
    r.verifie('historique plafonné', mesures.entrees <= 200, `${mesures.entrees} entrées`);
    r.verifie('images mutualisées dans la sauvegarde', mesures.payeMo < mesures.brutMo / 2, `${mesures.payeMo} Mo contre ${mesures.brutMo} Mo`);

    // La sauvegarde ne contient pas l'historique
    const contenu = await page.evaluate(() => {
        const s = stateForStorage();
        return { pageAvecHistorique: s.pages.some(p => 'history' in p), aTableImages: !!s.assets && Object.keys(s.assets).length > 0 };
    });
    r.verifie('historique absent de la sauvegarde', !contenu.pageAvecHistorique);
    r.verifie('table d\'images présente', contenu.aTableImages);

    // Enregistrement puis rechargement complet de la page
    await page.evaluate(async () => { await writeAppLocal(); });
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await page.waitForTimeout(400);
    const recharge = await page.evaluate(async () => {
        const saved = await localforage.getItem('AuTableau_AutoSave');
        restoreState(saved);
        await new Promise(res => setTimeout(res, 500));
        return {
            images: images.length,
            sourcesValides: images.every(i => typeof i.src === 'string' && i.src.startsWith('data:image')),
            sansReference: images.every(i => !i.srcRef),
            distinctes: new Set(images.map(i => i.src)).size
        };
    });
    r.egal('images retrouvées après rechargement', recharge.images, 13);
    r.verifie('sources d\'images restaurées', recharge.sourcesValides);
    r.verifie('aucune référence résiduelle', recharge.sansReference);
    r.egal('deux images distinctes', recharge.distinctes, 2);

    // Annuler / rétablir avec des images
    const annuler = await page.evaluate(() => {
        const n0 = images.length;
        images.push({ id: nextId++, x: 5, y: 5, w: 50, h: 50, cx: 0, cy: 0, cw: 50, ch: 50, src: images[0].src, z: globalZ++ });
        saveState();
        undo(); const apresAnnuler = images.length;
        redo(); const apresRetablir = images.length;
        return { n0, apresAnnuler, apresRetablir, sourcesIntactes: images.every(i => typeof i.src === 'string' && i.src.length > 100) };
    });
    r.egal('annuler revient en arrière', annuler.apresAnnuler, annuler.n0);
    r.egal('rétablir revient en avant', annuler.apresRetablir, annuler.n0 + 1);
    r.verifie('sources intactes après annuler/rétablir', annuler.sourcesIntactes);

    // Un fichier de l'ancien format (src en clair) se charge toujours
    const ancien = await page.evaluate(async () => {
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="35" fill="red"/></svg>');
        restoreState({
            pages: [{
                points: [], segments: [], circles: [], rectangles: [], texts: [], freehands: [], curves: [], polygons: [], arcs: [], htmlPostits: [],
                images: [{ id: 1, x: 0, y: 0, w: 80, h: 80, cx: 0, cy: 0, cw: 80, ch: 80, src, z: 1 }], panX: 640, panY: 400, zoom: 1
            }], nextId: 2, globalZ: 2, currentBgIndex: 0
        });
        await new Promise(res => setTimeout(res, 300));
        return { images: images.length, source: images[0] && images[0].src.startsWith('data:image') };
    });
    r.egal('ancien format : image chargée', ancien.images, 1);
    r.verifie('ancien format : source intacte', ancien.source);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
