// Parcours complets : outils de dessin, gestes au doigt, raccourcis, pages,
// export, restauration de session. Ce sont les chemins qu'un prof emprunte
// tous les jours.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Parcours');
    const { context, page, erreurs } = await ouvrirApp(browser);

    const compte = () => page.evaluate(() => points.length + segments.length + circles.length
        + rectangles.length + curves.length + polygons.length + freehands.length);
    const vider = () => page.evaluate(() => {
        creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; mouseLogicalPos = null;
        [points, segments, circles, rectangles, curves, polygons, freehands, texts, images].forEach(a => a.length = 0);
        selectedItems = []; draw();
    });

    // --- Chaque outil de dessin produit quelque chose ---
    const OUTILS = ['freehand', 'highlighter', 'point', 'segment', 'demi-droite', 'droite',
                    'circle', 'rectangle', 'curve', 'polygon'];
    for (const outil of OUTILS) {
        await vider();
        await page.evaluate(m => setMode(m), outil);
        await page.mouse.move(300, 300);
        await page.mouse.down();
        await page.mouse.move(420, 380, { steps: 6 });
        await page.mouse.up();
        await page.mouse.click(500, 420);
        if (outil === 'polygon' || outil === 'curve') {
            await page.mouse.click(560, 300);
            await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(120);
        r.verifie(`outil « ${outil} » : un objet est créé`, await compte() > 0);
    }

    // Le laser ne laisse rien derrière lui
    await vider();
    await page.evaluate(() => setMode('laser'));
    await page.mouse.move(300, 300); await page.mouse.down();
    await page.mouse.move(420, 380, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(150);
    r.egal('le laser ne crée pas d\'objet', await compte(), 0);

    // --- Échap quitte un mode spécial (annoncé dans l'aide) ---
    await page.evaluate(() => setMode('laser'));
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    r.egal('Échap revient à la flèche', await page.evaluate(() => mode), 'pointer');

    // Mais un premier Échap annule d'abord la construction en cours
    await vider();
    await page.evaluate(() => setMode('polygon'));
    await page.mouse.click(300, 300); await page.mouse.click(380, 340);
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const apresPremierEchap = await page.evaluate(() => ({ mode, restants: currentPolygonPoints.length }));
    r.egal('Échap annule d\'abord le point en cours', apresPremierEchap.mode, 'polygon');

    // --- Un point de départ disparu ne doit pas figer le tableau ---
    const rendu = await page.evaluate(() => {
        setMode('segment');
        creationStartPointId = 999999;      // point inexistant
        mouseLogicalPos = { x: 10, y: 10 };
        try { draw(); return 'ok'; } catch (e) { return e.message; }
    });
    r.egal('un tracé orphelin ne casse pas le rendu', rendu, 'ok');
    await page.evaluate(() => { creationStartPointId = null; setMode('pointer'); draw(); });

    // --- Raccourcis ---
    await vider();
    await page.evaluate(() => {
        saveState();   // le tableau vide devient le point de repère de l'historique
        freehands.push({ id: nextId++, points: [{ x: -50, y: -20 }, { x: 40, y: 30 }], color: '#000', width: 3, z: globalZ++ });
        saveState(); draw();
    });
    await page.keyboard.press('Control+z'); await page.waitForTimeout(220);
    const apresAnnuler = await compte();
    await page.keyboard.press('Control+y'); await page.waitForTimeout(220);
    const apresRefaire = await compte();
    r.egal('Ctrl+Z annule', apresAnnuler, 0);
    r.egal('Ctrl+Y refait', apresRefaire, 1);

    await page.evaluate(() => { setMode('pointer'); selectedItems = [{ type: 'freehand', id: freehands[0].id }]; draw(); });
    await page.keyboard.press('Delete'); await page.waitForTimeout(250);
    r.egal('Suppr efface la sélection', await compte(), 0);

    await page.evaluate(() => { panX = 400; panY = 300; zoom = 1; draw(); });
    await page.keyboard.down('Space');
    await page.mouse.move(500, 400); await page.mouse.down();
    await page.mouse.move(620, 470, { steps: 6 }); await page.mouse.up();
    await page.keyboard.up('Space');
    await page.waitForTimeout(200);
    const pan = await page.evaluate(() => panX);
    r.verifie('Espace + glisser déplace la vue', Math.abs(pan - 400) > 50, `panX ${pan}`);

    // --- Pages ---
    await tableauVierge(page);
    const p0 = await page.evaluate(() => ({ n: pages.length, i: currentPageIndex }));
    await page.evaluate(() => {
        freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: '#000', width: 3, z: globalZ++ });
        saveState(); draw();
        document.getElementById('btn-add-page').click();
    });
    await page.waitForTimeout(450);
    const p1 = await page.evaluate(() => ({ n: pages.length, dessins: freehands.length }));
    r.egal('nouvelle page ajoutée', p1.n, p0.n + 1);
    r.egal('la nouvelle page est vierge', p1.dessins, 0);
    await page.evaluate(() => document.getElementById('btn-prev-page').click());
    await page.waitForTimeout(450);
    r.egal('la page précédente retrouve son contenu', await page.evaluate(() => freehands.length), 1);

    r.verifie('aucune erreur JS sur les parcours', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // --- Gestes au doigt, sur une tablette ---
    const tab = await ouvrirApp(browser, { tactile: true, viewport: { width: 768, height: 1024 } });
    const cdp = await tab.context.newCDPSession(tab.page);
    const touche = async (type, pts) => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) });
        await tab.page.waitForTimeout(45);
    };

    await tab.page.evaluate(() => { zoom = 1; panX = 384; panY = 512; draw(); });
    const vue0 = await tab.page.evaluate(() => ({ panX, panY, zoom }));
    await touche('touchStart', [{ x: 300, y: 500 }, { x: 420, y: 500 }]);
    for (let i = 1; i <= 6; i++) await touche('touchMove', [{ x: 300 + i * 15, y: 500 + i * 10 }, { x: 420 + i * 15, y: 500 + i * 10 }]);
    await touche('touchEnd', []);
    const vue1 = await tab.page.evaluate(() => ({ panX, panY, zoom }));
    r.verifie('deux doigts déplacent la vue',
        Math.abs(vue1.panX - vue0.panX) > 30 && Math.abs(vue1.panY - vue0.panY) > 30,
        `${JSON.stringify(vue0)} -> ${JSON.stringify(vue1)}`);
    r.verifie('deux doigts qui glissent ne zooment pas', Math.abs(vue1.zoom - vue0.zoom) < 0.05, `zoom ${vue1.zoom}`);

    // Pincer : le point du tableau saisi reste sous les doigts
    await tab.page.evaluate(() => { zoom = 1; panX = 384; panY = 512; draw(); });
    const avantPince = await tab.page.evaluate(() => ({ x: (380 - panX) / zoom, y: (500 - panY) / zoom }));
    await touche('touchStart', [{ x: 340, y: 500 }, { x: 420, y: 500 }]);
    for (let i = 1; i <= 8; i++) await touche('touchMove', [{ x: 340 - i * 14, y: 500 }, { x: 420 + i * 14, y: 500 }]);
    await touche('touchEnd', []);
    const pince = await tab.page.evaluate((p) => ({
        zoom, ecart: Math.hypot(p.x * zoom + panX - 380, p.y * zoom + panY - 500)
    }), avantPince);
    r.verifie('pincer agrandit', pince.zoom > 1.2, `zoom ${pince.zoom.toFixed(2)}`);
    r.verifie('le point pincé reste sous les doigts', pince.ecart < 12, `${pince.ecart.toFixed(1)} px d'écart`);

    r.verifie('aucune erreur JS au doigt', tab.erreurs.length === 0, tab.erreurs.join(' | '));
    await tab.context.close();

    // --- Reprise de session après un rechargement ---
    const rep = await ouvrirApp(browser);
    await rep.page.evaluate(async () => {
        freehands.push({ id: nextId++, points: [{ x: -60, y: -30 }, { x: 40, y: 30 }], color: '#2d3436', width: 4, z: globalZ++ });
        saveState(); draw();
        await writeAppLocal();
    });
    await rep.page.waitForTimeout(400);
    await rep.page.reload();
    await rep.page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await rep.page.waitForTimeout(500);

    const modale = await rep.page.evaluate(() => getComputedStyle(document.getElementById('restore-modal')).display);
    r.verifie('rechargement : la reprise est proposée', modale !== 'none', `display ${modale}`);

    // Échap ou un clic à côté ne doivent pas escamoter le choix : sinon le
    // tableau resterait sans page.
    await rep.page.keyboard.press('Escape');
    await rep.page.mouse.click(20, 20);
    await rep.page.waitForTimeout(300);
    r.verifie('la reprise ne s\'escamote pas par mégarde',
        await rep.page.evaluate(() => getComputedStyle(document.getElementById('restore-modal')).display) !== 'none');

    await rep.page.evaluate(() => confirmRestore());
    await rep.page.waitForTimeout(800);
    const restaure = await rep.page.evaluate(() => ({ pages: pages.length, traces: freehands.length }));
    r.egal('« Restaurer » retrouve le travail', restaure.traces, 1);

    // « Nouveau tableau » ne doit pas détruire la session précédente
    await rep.page.evaluate(async () => { await writeAppLocal(); });
    await rep.page.waitForTimeout(400);
    await rep.page.reload();
    await rep.page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await rep.page.waitForTimeout(500);
    await rep.page.evaluate(() => cancelRestore());
    await rep.page.waitForTimeout(1200);

    const apresNouveau = await rep.page.evaluate(async () => {
        const liste = await localforage.getItem('auTableau_tableaux_list') || [];
        const derniere = liste.find(t => /Session du/.test(t.name || ''));
        const data = derniere ? await localforage.getItem('data_' + derniere.id) : null;
        return {
            pages: pages.length, traces: freehands.length,
            rangee: !!derniere,
            contenuRange: data && data.pages ? (data.pages[0].freehands || []).length : -1
        };
    });
    r.egal('« Nouveau tableau » donne une page vierge', apresNouveau.traces, 0);
    r.verifie('une page existe bien', apresNouveau.pages === 1, `${apresNouveau.pages} pages`);
    r.verifie('la session précédente est rangée dans « Mes tableaux »', apresNouveau.rangee);
    r.egal('et elle est intacte', apresNouveau.contenuRange, 1);

    r.verifie('aucune erreur JS à la reprise', rep.erreurs.length === 0, rep.erreurs.join(' | '));
    await rep.context.close();

    return r.bilan();
};
