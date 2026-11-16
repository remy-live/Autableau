// CE QU'UN OUTIL POSE APPARTIENT À LA PAGE QU'ON REGARDAIT.
//
//   « J'ai tapé une opération posée sur la page 1 ; quand je suis passé à la
//     page 2 de mon PDF en plein écran, elle s'est retrouvée sur la page 2. »
//
// Elle ne s'est pas déplacée : elle n'appartenait À AUCUNE page, et ce qui
// n'appartient à aucune page se voit sur toutes. Mesuré : l'opération posée
// arrivait au tableau avec « surPage: null ».
//
// L'ENCRE ET LE TEXTE LE SAVAIENT DÉJÀ — « noterLaPage » existe depuis
// longtemps. Mais les quatre-vingt-neuf outils poussent leur tampon dans
// « images » chacun chez soi, et aucun ne passait par là.
//
// ET IL Y AVAIT UNE SECONDE CAUSE, plus retorse : « documentPorteur » rend
// l'image du DESSUS sous un point. Pour un trait ou un texte cela suffit — ils
// ne sont pas des images. Mais un tampon EN EST UNE, et il vient de naître
// au-dessus de tout : il se trouvait donc LUI-MÊME, concluait « ce n'est pas
// un PDF feuilletable », et repartait sans page. Un objet ne doit pas se
// cacher sa propre page.
const { creerRapport, ouvrirApp, tableauVierge, pdfA4 } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Ce qu\'on pose appartient à sa page');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);

    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function', { timeout: 20000 });
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0; texts.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'deux.pdf', { type: 'application/pdf' }));
        await new Promise(k => setTimeout(k, 900));
    }, { octets: Array.from(pdfA4(2)) });
    await page.waitForTimeout(600);

    const leDoc = await page.evaluate(() => {
        const p = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        return p ? { pages: p.pluginData.pages, page: p.pluginData.page } : null;
    });
    r.verifie('un polycopié de deux pages est posé',
        !!leDoc && leDoc.pages === 2 && leDoc.page === 1, JSON.stringify(leDoc));

    // ------------------------------------------------------------------
    // 1. UN TAMPON POSÉ SUR LA PAGE 1 LUI APPARTIENT.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        const bt = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(x => /opération posée/i.test(x.dataset.pluginKey || x.title || ''));
        if (bt) bt.click();
    });
    await page.waitForTimeout(800);
    r.verifie('l\'outil « Opération posée » ouvre sa boîte',
        await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            return !!(m && m.getClientRects().length);
        }), 'boîte absente');
    await page.evaluate(() => {
        const ok = document.getElementById('custom-prompt-ok');
        if (ok) ok.click();
    });
    await page.waitForTimeout(900);

    // On tamponne au MILIEU de la page, là où le professeur écrit.
    const milieu = await page.evaluate(() => {
        const p = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        return [Math.round((p.x + p.w / 2) * zoom + panX), Math.round((p.y + p.h / 2) * zoom + panY)];
    });
    await page.mouse.click(milieu[0], milieu[1]);
    await page.waitForTimeout(800);

    const pose = await page.evaluate(() => images
        .filter(i => (i.pluginData || {}).id !== 'pdfDoc')
        .map(i => ({ plugin: (i.pluginData || {}).id, surPage: i.surPage || null })));
    r.egal('un tampon est posé', pose.length, 1, JSON.stringify(pose));
    r.verifie('et il appartient à la page 1',
        pose[0] && pose[0].surPage && pose[0].surPage.page === 1,
        JSON.stringify(pose) + ' — « surPage: null » avant');

    // ------------------------------------------------------------------
    // 2. ON TOURNE LA PAGE : IL S'EN VA AVEC ELLE, ET IL REVIENT.
    // ------------------------------------------------------------------
    const voitOn = () => page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id !== 'pdfDoc');
        if (!o) return null;
        return !(typeof surUneAutrePage === 'function' && surUneAutrePage(o));
    });
    const allerA = (n) => page.evaluate(async (k) => {
        const pdf = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        await allerALaPage(pdf, k);
    }, n);

    await allerA(2);
    await page.waitForTimeout(900);
    r.egal('sur la page 2, il n\'est plus là', await voitOn(), false, '');
    await allerA(1);
    await page.waitForTimeout(900);
    r.egal('et il revient avec la page 1', await voitOn(), true, '');

    // ------------------------------------------------------------------
    // 3. POSÉ À CÔTÉ DU POLYCOPIÉ, IL N'APPARTIENT À PERSONNE.
    //
    //    Le tableau autour de la page n'est pas la page : ce qu'on y met
    //    reste là quand on feuillette, et c'est voulu — on y range ses
    //    rappels, sa leçon, son matériel.
    // ------------------------------------------------------------------
    const dehors = await page.evaluate(() => {
        const pdf = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const avant = nextId;
        const o = { id: nextId++, x: pdf.x + pdf.w + 300, y: pdf.y + 100, w: 120, h: 80,
                    cx: 0, cy: 0, cw: 120, ch: 80, src: '', z: globalZ++,
                    pluginData: { id: 'essaiTool' } };
        images.push(o);
        rattacherALaPage(avant);
        const res = { surPage: o.surPage || null };
        images.splice(images.indexOf(o), 1);
        return res;
    });
    r.egal('ce qu\'on pose à côté n\'appartient à aucune page', dehors.surPage, null,
        JSON.stringify(dehors));

    // ------------------------------------------------------------------
    // 4. MÊME QUAND L'OUTIL GARDE SON TAMPON ARMÉ.
    //
    //    Les outils faits pour tamponner en rafale reviennent plus tôt dans
    //    le geste — et ce sont justement ceux qu'on utilise le plus sur un
    //    polycopié. Le rattachement se fait donc AVANT ce retour.
    // ------------------------------------------------------------------
    const enRafale = await page.evaluate(() => {
        const pdf = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        // on arme un tampon, comme un outil de rafale
        const outil = PluginManager.plugins.operationPoseeTool;
        const garde = outil.currentStamp;
        outil.currentStamp = { src: '', w: 10, h: 10 };
        const arme = (typeof hasPendingStamp === 'function') && hasPendingStamp();
        const avant = nextId;
        const o = { id: nextId++, x: pdf.x + pdf.w / 2, y: pdf.y + pdf.h / 2, w: 100, h: 60,
                    cx: 0, cy: 0, cw: 100, ch: 60, src: '', z: globalZ++,
                    pluginData: { id: 'essaiTool' } };
        images.push(o);
        apresPoseDeTampon(avant);
        const res = { arme, surPage: o.surPage || null };
        images.splice(images.indexOf(o), 1);
        outil.currentStamp = garde;
        return res;
    });
    r.verifie('le tampon était bien armé', enRafale.arme === true, JSON.stringify(enRafale));
    r.verifie('et ce qu\'on pose en rafale appartient quand même à sa page',
        enRafale.surPage && enRafale.surPage.page === 1, JSON.stringify(enRafale));

    // ------------------------------------------------------------------
    // 5. ET UNE PAGE NE S'APPARTIENT PAS À ELLE-MÊME.
    // ------------------------------------------------------------------
    const leDocLuiMeme = await page.evaluate(() => {
        const pdf = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const garde = pdf.surPage;
        delete pdf.surPage;
        const idVrai = pdf.id;
        pdf.id = nextId++;            // on le fait passer pour tout neuf
        rattacherALaPage(pdf.id);
        const res = pdf.surPage || null;
        pdf.id = idVrai;
        if (garde) pdf.surPage = garde;
        return res;
    });
    r.egal('le polycopié ne se range pas dans sa propre page', leDocLuiMeme, null,
        JSON.stringify(leDocLuiMeme));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
