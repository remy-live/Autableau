// Les raccourcis clavier des outils : une touche par outil, écrite dans
// l'infobulle du bouton et reprise dans l'aide. Une seule table les décrit
// tous les trois — ce test vérifie qu'ils disent bien la même chose.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Raccourcis clavier');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof RACCOURCIS_OUTILS !== 'undefined', { timeout: 20000 });
    await page.waitForTimeout(1000);           // les barres flottantes se recopient

    // --- LA TABLE ELLE-MÊME ---
    const table = await page.evaluate(() => {
        const touches = RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).map(x => x.touche);
        const modesConnus = Array.from(document.querySelectorAll('.btn[data-mode]'))
            .map(b => b.dataset.mode);
        return {
            outils: RACCOURCIS_OUTILS.length,
            gestes: RACCOURCIS_GESTES.length,
            doublons: touches.length - new Set(touches).size,
            majuscules: touches.every(t => t === t.toUpperCase()),
            orphelins: RACCOURCIS_OUTILS.filter(o => !modesConnus.includes(o.mode)).map(o => o.mode),
            sansBouton: RACCOURCIS_GESTES.filter(g => !document.getElementById(g.bouton)).map(g => g.bouton),
            nommes: RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).every(x => !!x.nom)
        };
    });
    r.verifie('tous les outils courants ont leur touche', table.outils >= 15, JSON.stringify(table));
    r.egal('aucune touche n\'est attribuée deux fois', table.doublons, 0);
    r.verifie('elles sont toutes écrites en majuscule', table.majuscules);
    r.egal('chaque raccourci vise un outil qui existe', table.orphelins, []);
    r.egal('et chaque geste vise un bouton qui existe', table.sansBouton, []);
    r.verifie('chacun porte un nom lisible pour l\'aide', table.nommes);

    // --- LES TOUCHES CHANGENT VRAIMENT D'OUTIL ---
    const essais = [['c', 'freehand'], ['t', 'text'], ['g', 'eraser'], ['n', 'postit'],
                    ['p', 'laser'], ['1', 'point'], ['2', 'segment'], ['5', 'circle'],
                    ['7', 'polygon'], ['s', 'pointer']];
    const obtenus = [];
    for (const [touche] of essais) {
        await page.keyboard.press(touche);
        await page.waitForTimeout(90);
        obtenus.push(await page.evaluate(() => mode));
    }
    essais.forEach(([touche, attendu], i) => {
        r.egal(`« ${touche.toUpperCase()} » choisit ${attendu}`, obtenus[i], attendu);
    });

    // La majuscule marche aussi : on ne perd pas l'outil parce qu'on tient Maj
    await page.keyboard.press('G');
    await page.waitForTimeout(90);
    r.egal('la majuscule fait la même chose', await page.evaluate(() => mode), 'eraser');
    await page.keyboard.press('s');
    await page.waitForTimeout(90);

    // --- LES GESTES ---
    const gestes = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    await page.keyboard.press('l'); await page.waitForTimeout(120);
    await page.keyboard.press('a'); await page.waitForTimeout(120);
    await page.keyboard.press('x'); await page.waitForTimeout(120);
    const apres = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    r.verifie('« L » allume la loupe', apres.loupe !== gestes.loupe, JSON.stringify(apres));
    r.verifie('« A » bascule l\'aimant', apres.aimant !== gestes.aimant, JSON.stringify(apres));
    r.verifie('« X » fait avancer les axes', apres.axes !== gestes.axes, JSON.stringify(apres));
    await page.keyboard.press('l'); await page.keyboard.press('a');
    await page.waitForTimeout(120);

    // --- ON N'INTERCEPTE PAS CE QUE L'ON ÉCRIT ---
    const enSaisie = await page.evaluate(() => {
        const champ = document.createElement('input');
        document.body.appendChild(champ);
        champ.focus();
        const avant = mode;
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        champ.remove();
        return { avant, apres };
    });
    r.egal('taper dans un champ ne change pas d\'outil', enSaisie.apres, enSaisie.avant);

    const avecCtrl = await page.evaluate(() => {
        setMode('pointer');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        return mode;
    });
    r.egal('Ctrl+C reste Copier, il ne prend pas le crayon', avecCtrl, 'pointer');

    const souslaModale = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const avant = mode;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        document.getElementById('help-modal').style.display = 'none';
        return { avant, apres };
    });
    r.egal('une fenêtre ouverte garde le clavier pour elle', souslaModale.apres, souslaModale.avant);

    // --- LA TOUCHE SE LIT SUR LE BOUTON ---
    const surLesBoutons = await page.evaluate(() => {
        const manquants = RACCOURCIS_OUTILS.filter(o =>
            !document.querySelector('.btn[data-mode="' + o.mode + '"][data-raccourci="' + o.touche + '"]'));
        return {
            poses: document.querySelectorAll('[data-raccourci]').length,
            manquants: manquants.map(m => m.mode),
            // « data-tooltip » sert aussi de nom sous l'icône : il doit rester net
            tooltipPropre: !Array.from(document.querySelectorAll('[data-raccourci]'))
                .some(b => /\(\s*[A-Z0-9]\s*\)$/.test(b.getAttribute('data-tooltip') || ''))
        };
    });
    r.egal('chaque bouton d\'outil porte sa touche', surLesBoutons.manquants, []);
    r.verifie('toutes les copies des barres flottantes aussi', surLesBoutons.poses >= 20, String(surLesBoutons.poses));
    r.verifie('sans polluer le nom affiché sous l\'icône', surLesBoutons.tooltipPropre);

    await page.hover('.btn[data-mode="freehand"]');
    await page.waitForTimeout(800);
    const bulle = await page.evaluate(() => {
        const t = document.getElementById('dt-tooltip');
        return {
            visible: t.classList.contains('visible'),
            touche: (t.querySelector('.dt-touche') || {}).textContent,
            texte: t.textContent
        };
    });
    r.verifie('l\'infobulle s\'ouvre sur un outil', bulle.visible, JSON.stringify(bulle));
    r.egal('et montre sa touche', bulle.touche, 'C');
    r.verifie('à côté du nom de l\'outil, pas à la place', /Tracé|Libre/i.test(bulle.texte), bulle.texte);

    // --- L'AIDE DIT LA MÊME CHOSE QUE LE CLAVIER ---
    const aide = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const lire = (id) => Array.from(document.querySelectorAll('#' + id + ' div'))
            .map(d => ({ touche: d.querySelector('code').textContent, nom: d.textContent.trim() }));
        const outils = lire('aide-raccourcis-outils');
        const gestes = lire('aide-raccourcis-gestes');
        document.getElementById('help-modal').style.display = 'none';
        return {
            outils: outils.length, gestes: gestes.length,
            fidele: outils.every((l, i) => l.touche === RACCOURCIS_OUTILS[i].touche)
                 && gestes.every((l, i) => l.touche === RACCOURCIS_GESTES[i].touche),
            nomme: outils.every(l => l.nom.length > 2)
        };
    });
    r.egal('l\'aide liste tous les outils', aide.outils, table.outils);
    r.egal('et tous les gestes', aide.gestes, table.gestes);
    r.verifie('avec exactement les touches du clavier', aide.fidele, JSON.stringify(aide));
    r.verifie('et le nom de chacun', aide.nomme);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
