// Tampons de plugins : recoloration, épaisseur, opacité, réédition au double-clic.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Tampons de plugins');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Pose une fraction (tampon SVG avec remplissage translucide)
    await page.evaluate(async () => {
        const P = PluginManager.plugins.fractionTool;
        const svg = P.generateSVG(3, 5, 'pie', '#6c5ce7', true);
        await new Promise(res => createStampFromSVG(svg, st => { P.currentStamp = st; P.currentArgs = [3, 5, 'pie', '#6c5ce7']; res(); }));
        setMode('fraction');
        PluginManager.trigger('onPointerDown', { x: 0, y: 0 });
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateStyleBarContext(); draw();
    });
    await page.waitForTimeout(200);

    const caps = await page.evaluate(() => ({
        couleur: isRecolorablePluginImage(images[0]),
        epaisseur: isRestrokablePluginImage(images[0]),
        remplissage: isFillOpacityStamp(images[0])
    }));
    r.verifie('fraction : recolorable', caps.couleur);
    r.verifie('fraction : épaisseur réglable', caps.epaisseur);
    r.verifie('fraction : opacité de remplissage réglable', caps.remplissage);

    // Recoloration
    await page.evaluate(() => applyPluginStampStyle({ color: '#d63031' }));
    await page.waitForTimeout(400);
    const recolore = await page.evaluate(() => ({
        args: images[0].pluginData.args,
        rouge: decodeURIComponent(images[0].src).includes('#d63031'),
        violet: decodeURIComponent(images[0].src).includes('#6c5ce7'),
        n: images.length
    }));
    r.verifie('recoloration appliquée au dessin', recolore.rouge && !recolore.violet);
    r.egal('un seul tampon après recoloration', recolore.n, 1);

    // Opacité : à fond, le remplissage doit être pleinement opaque
    await page.evaluate(() => applyPluginStampOpacity(1, true));
    await page.waitForTimeout(400);
    const opaque = await page.evaluate(() => {
        const svg = decodeURIComponent(images[0].src);
        return (svg.match(/fill-opacity="([\d.]+)"/g) || []).every(m => /="1"/.test(m));
    });
    r.verifie('opacité 100 % : remplissage plein', opaque);

    // Épaisseur
    const avant = await page.evaluate(() => parseFloat((decodeURIComponent(images[0].src).match(/stroke-width="([\d.]+)"/) || [])[1]));
    await page.evaluate(() => applyPluginStampStyle({ widthScale: 8 / 3 }));
    await page.waitForTimeout(400);
    const apres = await page.evaluate(() => parseFloat((decodeURIComponent(images[0].src).match(/stroke-width="([\d.]+)"/) || [])[1]));
    r.verifie('épaisseur augmentée', apres > avant, `${avant} -> ${apres}`);

    // Réédition au double-clic : le tampon existant est remplacé, pas dupliqué
    await tableauVierge(page);
    await page.evaluate(() => { PluginManager.plugins.divisionTool.buildDivision(456, 3, '#2d3436'); });
    await page.waitForTimeout(500);
    const cible = await page.evaluate(() => {
        const o = images[0];
        return { x: (o.x + o.w / 2) * zoom + panX, y: (o.y + o.h / 2) * zoom + panY, args: o.pluginData && o.pluginData.args };
    });
    r.verifie('division : arguments mémorisés', Array.isArray(cible.args), JSON.stringify(cible.args));

    await page.mouse.dblclick(cible.x, cible.y);
    await page.waitForTimeout(400);
    const modale = await page.evaluate(() => {
        const m = document.getElementById('custom-prompt-modal');
        return { visible: !!(m && getComputedStyle(m).display !== 'none'), titre: document.getElementById('custom-prompt-title').innerText };
    });
    r.verifie('double-clic : la modale se rouvre', modale.visible, modale.titre);
    r.verifie('double-clic : intitulé de modification', /Modifier/i.test(modale.titre), modale.titre);

    await page.evaluate(() => {
        const i = document.querySelector('#custom-prompt-inputs .prompt-input');
        i.value = '999'; i.dispatchEvent(new Event('input'));
        document.getElementById('custom-prompt-ok').click();
    });
    await page.waitForTimeout(600);
    const rendu = await page.evaluate(() => ({ n: images.length, args: images[0].pluginData.args }));
    r.egal('réédition : toujours un seul tampon', rendu.n, 1);
    r.verifie('réédition : arguments mis à jour', String(rendu.args[0]) === '999', JSON.stringify(rendu.args));

    // --- APRÈS LA POSE : LA FLÈCHE, ET L'OBJET SÉLECTIONNÉ ---
    const apresPose = await page.evaluate(async () => {
        [images, texts, points, segments].forEach(a => a.length = 0);
        selectedItems = [];
        panX = 400; panY = 300; zoom = 1;
        const outil = PluginManager.plugins.fractionTool;
        if (!outil) return { absent: true };
        // on arme le tampon à la main, comme le fait la boîte de réglages
        await new Promise(res => createStampFromSVG(
            outil.generateSVG(1, 2, 'barre', '#2d3436', true),
            (stamp) => { outil.currentStamp = stamp; outil.currentArgs = [1, 2, 'barre', '#2d3436']; res(); }));
        setMode('fraction');
        const p = { clientX: 500, clientY: 400 };
        canvas.dispatchEvent(new PointerEvent('pointerdown', Object.assign(
            { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }, p)));
        canvas.dispatchEvent(new PointerEvent('pointerup', Object.assign(
            { bubbles: true, pointerId: 1, isPrimary: true }, p)));
        await new Promise(r => setTimeout(r, 150));
        return {
            posee: images.length,
            mode,
            selection: selectedItems.length,
            surLaBonne: selectedItems[0] && images[0] && selectedItems[0].id === images[0].id
        };
    });
    if (!apresPose.absent) {
        r.egal('le tampon se pose', apresPose.posee, 1);
        r.egal('et on repasse à l\'outil de sélection', apresPose.mode, 'pointer');
        r.egal('l\'objet posé est sélectionné', apresPose.selection, 1);
        r.verifie('et c\'est bien celui qu\'on vient de poser', apresPose.surLaBonne, JSON.stringify(apresPose));
    }

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
