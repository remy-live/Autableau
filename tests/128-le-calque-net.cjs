// LE CALQUE NET : RESTER PROPRE QUAND ON ZOOME TRÈS TRÈS FORT.
//
//   « Si un PDF est en vectoriel, est-ce possible de rester toujours propre et
//     non pixélisé si on zoome très très fort ? »
//   « À l'export, on sait faire du vectoriel, c'est ce que l'on fait, donc à
//     l'écran seulement. »
//
// Agrandir la PAGE ENTIÈRE ne marche pas : mesuré sur une fiche A4, la garder
// nette au zoom 8 demanderait 53 mégapixels (212 Mo), au zoom 16 deux cent
// douze (847 Mo). C'est pourquoi la page rendue est plafonnée, et c'est de là
// que vient le flou.
//
// CE QUI MARCHE, C'EST DE NE REDESSINER QUE CE QU'ON VOIT : l'écran, lui, ne
// grandit pas. Le calque coûte la surface de l'écran, et rien de plus, quel
// que soit le grossissement.
//
// ET IL PASSE DEVANT L'AFFINAGE DE LA PAGE. « C'est pas hyper fluide, on voit
// que c'est flou puis après lissé. » Deux causes, mesurées : le calque
// n'arrivait qu'à 699 millisecondes — il attendait l'affinage, parce que sa
// signature comptait les pixels de l'image de page — et l'affinage gelait le
// fil principal 292 millisecondes juste après le geste, car rendre une page ne
// rend pas la main.
//
// Le calque ne doit rien à l'image de page : il vient des vecteurs. Il arrive
// donc maintenant en 113 millisecondes, et c'est l'AFFINAGE qui attend son
// tour — il ne sert plus que de filet pour l'instant où l'on sort du calque.
// Un seul gel reste, à 729 millisecondes, c'est-à-dire quand le professeur
// s'est arrêté ; et s'il bouge encore, le geste suivant le repousse.
const { creerRapport, ouvrirApp, tableauVierge, fichePdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le calque net');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);

    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function', { timeout: 20000 });
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0; freehands.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'fiche.pdf',
            { type: 'application/pdf' }));
        await new Promise(k => setTimeout(k, 1400));
    }, { octets: Array.from(fichePdf()) });
    await page.waitForTimeout(700);

    // UN TABLEAU NEUF, AVEC SA FICHE ENCORE GROSSIÈRE. Deux contrôles en ont
    // besoin : une page déjà affinée jusqu'au plafond n'a plus rien à affiner,
    // donc plus rien à mesurer.
    const tableauNeuf = async () => {
        const n = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
        await tableauVierge(n.page);
        await n.page.waitForFunction(() => typeof poserPdfFeuilletable === 'function',
            { timeout: 20000 });
        await n.page.evaluate(async ({ octets }) => {
            panX = 0; panY = 0; zoom = 1; images.length = 0;
            await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'fiche.pdf',
                { type: 'application/pdf' }));
            await new Promise(k => setTimeout(k, 1400));
        }, { octets: Array.from(fichePdf()) });
        await n.page.waitForTimeout(700);
        return n;
    };

    const laPage = () => page.evaluate(() =>
        images.some(i => (i.pluginData || {}).id === 'pdfDoc'));
    r.verifie('une fiche vectorielle est posée au tableau', await laPage(), 'aucun pdfDoc');

    // On regarde le corps du texte : c'est là que le flou se voit.
    const allerVoir = (px, py, z) => page.evaluate(({ px, py, z }) => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        zoom = z;
        panX = -(o.x + o.w * px) * zoom + canvas.width / 2;
        panY = -(o.y + o.h * py) * zoom + canvas.height / 2;
        draw();
    }, { px, py, z });

    // Le geste se pose : l'affinage de la page ET le calque suivent.
    const poserLeGeste = async () => {
        await page.evaluate(() => demanderAffinageDeLaVue());
        await page.waitForTimeout(2800);
    };

    // LA MESURE. Un caractère net, c'est du noir sur du blanc ; un caractère
    // étiré, c'est une bouillie de gris. On compte donc les pixels gris de la
    // zone de texte — moins il y en a, plus c'est propre — et l'on compare le
    // MÊME dessin avec et sans le calque, pour ne mesurer que lui.
    const comparer = () => page.evaluate(() => {
        const g = document.getElementById('board').getContext('2d');
        const compter = () => {
            const d = g.getImageData(350, 200, 700, 500).data;
            let gris = 0, noirs = 0;
            for (let i = 0; i < d.length; i += 4) {
                const v = d[i];
                if (v < 30) noirs++; else if (v <= 225) gris++;
            }
            return { gris, noirs };
        };
        const garde = calqueNet;
        const avec = compter();
        calqueNet = null; draw();
        const sans = compter();
        calqueNet = garde; draw();
        return { calque: !!garde, avec, sans };
    });

    // ------------------------------------------------------------------
    // 1. À TAILLE NORMALE, LA PAGE SUFFIT : PAS DE CALQUE.
    //
    //    Un pixel d'image par pixel d'écran, il n'y a rien à gagner — et un
    //    calque qu'on calcule pour rien, c'est du chauffage.
    // ------------------------------------------------------------------
    await allerVoir(0.5, 0.5, 1);
    await poserLeGeste();
    const auRepos = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        return { calque: !!calqueNet, dejaNette: laPageEstDejaNette(o) };
    });
    r.verifie('à taille normale, la page est déjà nette', auRepos.dejaNette === true,
        JSON.stringify(auRepos));
    r.egal('et aucun calque n\'est calculé', auRepos.calque, false, JSON.stringify(auRepos));

    // ------------------------------------------------------------------
    // 2. AU ZOOM 16, LE CALQUE NAÎT TOUT SEUL ET LE GRIS S'EN VA.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const fort = await comparer();
    r.verifie('au zoom 16, un calque net est né sans qu\'on le demande',
        fort.calque === true, JSON.stringify(fort));
    r.verifie('et le gris du texte fond de plus d\'un tiers',
        fort.avec.gris < fort.sans.gris * 0.66,
        'avec ' + fort.avec.gris + ' gris, sans ' + fort.sans.gris
        + ' — 11 060 dans les deux cas quand le calque naissait périmé');
    r.verifie('le noir, lui, revient',
        fort.avec.noirs > fort.sans.noirs,
        'avec ' + fort.avec.noirs + ', sans ' + fort.sans.noirs);

    // ------------------------------------------------------------------
    // 3. IL COÛTE LA TAILLE DE L'ÉCRAN, ET NON CELLE DU ZOOM.
    //
    //    C'est tout l'argument : on peut zoomer sans fin parce que ce qu'on
    //    redessine, c'est l'écran.
    // ------------------------------------------------------------------
    const surfaceAu = async (z) => {
        await allerVoir(0.125, 0.7667, z);
        await poserLeGeste();
        return page.evaluate(() => calqueNet
            ? { px: calqueNet.largeur * calqueNet.hauteur, z: calqueNet.zoom } : null);
    };
    const a8 = await surfaceAu(8);
    const a32 = await surfaceAu(32);
    r.verifie('un calque au zoom 8 et un au zoom 32', !!a8 && !!a32,
        JSON.stringify({ a8, a32 }));
    // Quadrupler le grossissement multiplierait la surface par seize si l'on
    // agrandissait la page ; ici elle ne bouge pas — c'est l'écran qu'on rend.
    r.verifie('quadrupler le zoom ne grossit pas le calque d\'un quart',
        a8 && a32 && a32.px < a8.px * 1.25,
        JSON.stringify({ a8, a32 }) + ' — seize fois plus si l\'on agrandissait la page');
    // Et sa taille, c'est celle de l'écran et de son quart de marge. Les deux
    // ne sont pas identiques au pixel : au zoom 8 la marge bute sur le bord
    // de la feuille et s'y fait rogner — 197 unités de tableau au lieu de 219.
    r.verifie('et sa surface est celle de l\'écran, à un quart près',
        a8 && a32 && [a8, a32].every(m =>
            m.px <= 1400 * 1.25 * 900 * 1.25 && m.px >= 1400 * 900 * 0.75),
        JSON.stringify({ a8, a32, ecran: 1400 * 900 }));
    r.verifie('qui ne dépasse pas quatre mégapixels',
        a8 && a32 && a8.px <= 4e6 && a32.px <= 4e6, JSON.stringify({ a8, a32 }));

    // ------------------------------------------------------------------
    // 4. IL EST ANCRÉ AU TABLEAU, PAS À L'ÉCRAN.
    //
    //    Sa région est retenue en coordonnées de tableau et prise un quart
    //    plus large que le regard : glisser de quelques pixels ne doit rien
    //    redemander, sinon le moindre déplacement rallumerait un rendu.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const bougerDe = (dx) => page.evaluate((d) => {
        panX -= d; draw();
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        return calqueEncoreBon(o);
    }, dx);
    r.egal('un petit glissement ne périme pas le calque', await bougerDe(40), true, '');
    r.egal('un grand glissement, oui', await bougerDe(2000), false, '');

    // ------------------------------------------------------------------
    // 5. ET UN CRAN DE ZOOM LE PÉRIME AUSSI.
    //
    //    Sans quoi l'on étirerait le calque à son tour : le flou aurait
    //    changé de place sans disparaître.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const apresZoom = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const avant = calqueEncoreBon(o);
        // ON ZOOME SANS BOUGER DU TOUT : si l'on se contentait de changer le
        // grossissement, la vue glisserait aussi, et c'est le cadrage — non
        // le cran de zoom — qui périmerait le calque. Le contrôle passerait
        // alors pour une raison qui n'est pas la sienne.
        const cx = (canvas.width / 2 - panX) / zoom, cy = (canvas.height / 2 - panY) / zoom;
        zoom = zoom * 1.6;
        panX = canvas.width / 2 - cx * zoom;
        panY = canvas.height / 2 - cy * zoom;
        draw();
        return { avant, apres: calqueEncoreBon(o) };
    });
    r.verifie('le calque vaut pour le zoom où il est né', apresZoom.avant === true,
        JSON.stringify(apresZoom));
    r.egal('et plus au-delà d\'un cran', apresZoom.apres, false, JSON.stringify(apresZoom));

    // ------------------------------------------------------------------
    // 6. TOURNER LA PAGE LE PÉRIME — AFFINER LA PAGE, NON.
    //
    //    « C'est pas hyper fluide, on voit que c'est flou puis après lissé. »
    //
    //    C'était là. Le calque est rendu depuis les VECTEURS du PDF : il ne
    //    doit rien à l'image de page. Mais sa signature comptait les pixels de
    //    cette image, qu'un affinage multiplie tous d'un coup sans rien changer
    //    à ce qui est montré — il se faisait donc jeter à chaque affinage, et
    //    il fallait attendre ce dernier pour en calculer un qui tienne. Mesuré
    //    623 millisecondes avant l'image neuve, 699 avant le calque ; 113
    //    maintenant.
    //
    //    CE QUI COMPTE VRAIMENT : la page montrée, la place du document au
    //    tableau, et le rognage — mais le rognage dit en FRACTIONS de la page,
    //    non en pixels de son image.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const changerDePage = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const avant = calqueEncoreBon(o);
        const garde = o.pluginData.page;
        o.pluginData.page = garde + 1;            // comme si l'on tournait la page
        const apres = calqueEncoreBon(o);
        o.pluginData.page = garde;
        return { avant, apres };
    });
    r.verifie('le calque vaut pour la page où il est né', changerDePage.avant === true,
        JSON.stringify(changerDePage));
    r.egal('et pas pour la page suivante', changerDePage.apres, false,
        JSON.stringify(changerDePage));

    // L'AFFINAGE POUR DE VRAI : on calcule un calque sur une page encore
    // grossière, puis on laisse la page s'affiner sous lui.
    const surSaFiche = await tableauNeuf();
    const apresAffinage = await surSaFiche.page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const g = document.getElementById('board').getContext('2d');
        const grisDe = () => {
            const d = g.getImageData(350, 200, 700, 500).data;
            let gris = 0;
            for (let i = 0; i < d.length; i += 4) {
                const v = d[i];
                if (v >= 30 && v <= 225) gris++;
            }
            return gris;
        };
        zoom = 16;
        panX = -(o.x + o.w * 0.125) * zoom + canvas.width / 2;
        panY = -(o.y + o.h * 0.7667) * zoom + canvas.height / 2;
        draw();
        const fait = await calculerLeCalqueNet(o);
        const avant = { bon: calqueEncoreBon(o), gris: grisDe(),
                        finesse: +(o.cw / o.w).toFixed(2) };
        const affine = await affinerLaPage(o);
        draw();
        return { fait, affine, avant, bon: calqueEncoreBon(o), gris: grisDe(),
                 finesse: +(o.cw / o.w).toFixed(2) };
    });
    r.verifie('la page s\'affine bel et bien sous le calque',
        apresAffinage.affine === true
        && apresAffinage.finesse > apresAffinage.avant.finesse,
        JSON.stringify(apresAffinage));
    r.verifie('ET LE CALQUE Y SURVIT', apresAffinage.bon === true,
        JSON.stringify(apresAffinage) + ' — jeté quand sa signature comptait les pixels de l\'image');
    r.verifie('le texte reste net de part en part',
        apresAffinage.gris < apresAffinage.avant.gris * 1.1,
        'avant ' + apresAffinage.avant.gris + ' gris, après ' + apresAffinage.gris);
    r.verifie('aucune erreur pendant l\'affinage', surSaFiche.erreurs.length === 0,
        surSaFiche.erreurs.join(' | '));
    await surSaFiche.context.close();

    // LE ROGNAGE, LUI, LE PÉRIME : le cadre ne montre plus la même part de la
    // page, et le calque y serait décalé.
    const apresRognage = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const avant = calqueEncoreBon(o);
        const garde = { cx: o.cx, cw: o.cw };
        o.cx = o.cx + o.cw * 0.1; o.cw = o.cw * 0.8;
        const apres = calqueEncoreBon(o);
        o.cx = garde.cx; o.cw = garde.cw;
        return { avant, apres };
    });
    r.verifie('le calque vaut pour le cadrage où il est né',
        apresRognage.avant === true, JSON.stringify(apresRognage));
    r.egal('et plus si l\'on rogne la page', apresRognage.apres, false,
        JSON.stringify(apresRognage));

    // ------------------------------------------------------------------
    // 7. UNE PAGE DE TRAVERS N'A PAS DE CALQUE.
    //
    //    Sa région visible ne se dit plus en rectangles du tableau. Un calque
    //    posé de travers est pire qu'un calque absent : elle garde son flou,
    //    et c'est voulu.
    // ------------------------------------------------------------------
    const deTravers = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const garde = o.angle;
        calqueNet = null;
        o.angle = 0.3;
        const rendu = await calculerLeCalqueNet(o);
        const res = { rendu, calque: !!calqueNet };
        o.angle = garde;
        return res;
    });
    r.egal('une page inclinée ne rend pas de calque', deTravers.rendu, false,
        JSON.stringify(deTravers));
    r.egal('et il n\'en reste aucun en place', deTravers.calque, false,
        JSON.stringify(deTravers));

    // ------------------------------------------------------------------
    // 8. L'ENCRE DU PROFESSEUR RESTE PAR-DESSUS.
    //
    //    Le calque se pose dans le repère de l'image, juste après elle. S'il
    //    était posé en fin de dessin, il recouvrirait ce qu'on vient
    //    d'écrire — et l'on ne peut pas annoter un polycopié ainsi.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const encre = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const centre = { x: o.x + o.w * 0.125, y: o.y + o.h * 0.7667 };
        freehands.push({
            id: nextId++, color: '#ff00ff', width: 3 / zoom, z: globalZ++,
            points: [
                { x: centre.x - 20, y: centre.y, p: 1 },
                { x: centre.x + 20, y: centre.y, p: 1 }
            ]
        });
        draw();
        const g = document.getElementById('board').getContext('2d');
        const d = g.getImageData(350, 200, 700, 500).data;
        let rose = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 200) rose++;
        }
        return { calque: !!calqueNet, rose };
    });
    r.verifie('le calque est bien là quand on écrit dessus', encre.calque === true,
        JSON.stringify(encre));
    r.verifie('et le trait du professeur se voit par-dessus', encre.rose > 200,
        encre.rose + ' pixels d\'encre');

    // ------------------------------------------------------------------
    // 9. À L'ÉCRAN SEULEMENT.
    //
    //    « À l'export, on sait faire du vectoriel, c'est ce que l'on fait » :
    //    l'export n'a rien à gagner d'une image, même nette, et il ne doit
    //    surtout pas en hériter une.
    // ------------------------------------------------------------------
    const aLExport = await page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const cadre = { x: o.x, y: o.y, w: o.w, h: o.h };
        const garde = calqueNet;
        const avec = generateSVGString(cadre, true);
        calqueNet = null;
        const sans = generateSVGString(cadre, true);
        calqueNet = garde;
        return { calque: !!garde, pareil: avec === sans,
                 ecart: Math.abs(avec.length - sans.length) };
    });
    r.verifie('un calque est en place au moment de l\'export', aLExport.calque === true,
        JSON.stringify(aLExport));
    r.verifie('et l\'export est le même, avec ou sans lui', aLExport.pareil === true,
        JSON.stringify(aLExport));

    // ------------------------------------------------------------------
    // 10. LE PROFESSEUR NE S'ARRÊTE PAS PENDANT QUE ÇA CALCULE.
    //
    //     Rendre une page prend des millisecondes, et il peut tourner sa page
    //     ou rezoomer dans cet intervalle. Le calque qui en sort ne parle
    //     alors plus de ce qu'on voit : on le jette plutôt que de le poser.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    const pendantLeRendu = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        calqueNet = null;
        const enRoute = calculerLeCalqueNet(o);     // on ne l'attend pas
        const garde = o.pluginData.page;
        o.pluginData.page = garde + 1;              // il tourne la page dans l'intervalle
        const rendu = await enRoute;
        const res = { rendu, calque: !!calqueNet };
        o.pluginData.page = garde;
        return res;
    });
    r.egal('une page tournée pendant le rendu ne donne pas de calque',
        pendantLeRendu.rendu, false, JSON.stringify(pendantLeRendu));
    r.egal('et il n\'en est posé aucun', pendantLeRendu.calque, false,
        JSON.stringify(pendantLeRendu));

    // ET UN ROGNAGE PENDANT LE RENDU NON PLUS : le calque serait décalé de ce
    // qu'on a coupé.
    const rogneEnPleinRendu = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        calqueNet = null;
        const enRoute = calculerLeCalqueNet(o);
        const garde = { cx: o.cx, cw: o.cw };
        o.cx = o.cx + o.cw * 0.1; o.cw = o.cw * 0.8;
        const rendu = await enRoute;
        const res = { rendu, calque: !!calqueNet };
        o.cx = garde.cx; o.cw = garde.cw;
        return res;
    });
    r.egal('une page rognée pendant le rendu ne donne pas de calque',
        rogneEnPleinRendu.rendu, false, JSON.stringify(rogneEnPleinRendu));

    // ------------------------------------------------------------------
    // CALCULER UN CALQUE NE RÉCLAME PAS D'AFFINAGE DE SON PROPRE CHEF.
    //
    //    Le calque REPOUSSE l'affinage déjà demandé ; il ne doit pas en
    //    inventer un. Sans quoi regarder de près une page suffirait à
    //    déclencher un rendu de seize mégapixels que personne n'a demandé —
    //    et ses trois cents millisecondes de gel avec.
    // ------------------------------------------------------------------
    const sansRienDemander = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        clearTimeout(affinageDeLaVue);
        affinageVoulu = false;
        calqueNet = null;
        await calculerLeCalqueNet(o);
        const repousse = repousserLAffinageDeLaVue();
        const srcAvant = o.src;
        await new Promise(k => setTimeout(k, 900));
        return { calque: !!calqueNet, repousse, pageTouchee: o.src !== srcAvant };
    });
    r.verifie('un calque se calcule sans qu\'on ait demandé d\'affinage',
        sansRienDemander.calque === true, JSON.stringify(sansRienDemander));
    r.egal('et il n\'en réclame aucun', sansRienDemander.repousse, false,
        JSON.stringify(sansRienDemander));
    r.egal('la page n\'est pas refaite pour autant', sansRienDemander.pageTouchee, false,
        JSON.stringify(sansRienDemander));

    // ------------------------------------------------------------------
    // 11. ET S'IL REZOOME PENDANT LE CALCUL, ON REPASSE.
    //
    //     Une demande tombée pendant un rendu était simplement perdue : on
    //     gardait l'ancien calque — refusé au dessin, donc sans effet, mais
    //     jamais remplacé. Le professeur restait dans le flou jusqu'à son
    //     geste suivant.
    //
    //     ON NE PEUT PAS ÉPIER UN RENDU DE L'EXTÉRIEUR : pdf.js dessine sans
    //     rendre la main, tout dans la même tâche, si bien qu'aucun minuteur
    //     ne s'exécute pendant ce temps — mesuré quarante relevés à deux
    //     millisecondes d'intervalle, aucun ne voit le calcul en cours. On
    //     pose donc l'occupation soi-même, puis on la lève.
    // ------------------------------------------------------------------
    const pendantLeCalcul = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        zoom = 16;
        panX = -(o.x + o.w * 0.125) * zoom + canvas.width / 2;
        panY = -(o.y + o.h * 0.7667) * zoom + canvas.height / 2;
        draw();
        calqueNet = null;
        calqueEnCours = true;                   // un rendu occupe la place
        demanderLeCalqueNet(10);
        await new Promise(k => setTimeout(k, 250));
        const pendant = !!calqueNet;
        calqueEnCours = false;                  // la place se libère
        await new Promise(k => setTimeout(k, 1200));
        return { pendant, apres: !!calqueNet,
                 zoomDuCalque: calqueNet ? calqueNet.zoom : null };
    });
    r.egal('tant qu\'un rendu occupe la place, rien ne se calcule par-dessus',
        pendantLeCalcul.pendant, false, JSON.stringify(pendantLeCalcul));
    r.egal('mais la demande n\'est pas perdue : le calque arrive après',
        pendantLeCalcul.zoomDuCalque, 16,
        JSON.stringify(pendantLeCalcul) + ' — aucun calque quand la demande se perdait');

    // ------------------------------------------------------------------
    // 12. LE CALQUE PORTE LE GROSSISSEMENT POUR LEQUEL IL A ÉTÉ CALCULÉ.
    //
    //     Et non celui qu'on avait à la fin de son rendu. Étiqueté du zoom
    //     d'arrivée, un calque calculé pour le zoom 16 se laissait poser au
    //     zoom 48 : il décrit pourtant une tout autre vue, et le crédit de
    //     netteté qu'on lui fait est faux.
    // ------------------------------------------------------------------
    const zoomQuiChange = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const viser = (z) => {
            zoom = z;
            panX = -(o.x + o.w * 0.125) * zoom + canvas.width / 2;
            panY = -(o.y + o.h * 0.7667) * zoom + canvas.height / 2;
            draw();
        };
        calqueNet = null;
        viser(16);
        const enRoute = calculerLeCalqueNet(o);
        viser(48);                       // il zoome avant même que le rendu démarre
        const rendu = await enRoute;
        return { rendu, zoomDuCalque: calqueNet ? calqueNet.zoom : null,
                 accepte: calqueEncoreBon(o) };
    });
    r.egal('le calque garde le grossissement de son calcul',
        zoomQuiChange.zoomDuCalque, 16, JSON.stringify(zoomQuiChange));
    r.egal('et il se refuse donc au grossissement d\'arrivée',
        zoomQuiChange.accepte, false,
        JSON.stringify(zoomQuiChange) + ' — accepté quand il portait le zoom final');

    r.verifie('aucune erreur de calque', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // LA CHRONOLOGIE SE MESURE SUR UN TABLEAU TOUT NEUF : ailleurs dans ce
    // chapitre la page a déjà été affinée jusqu'au plafond, et il ne reste
    // alors plus rien à affiner — donc plus rien à chronométrer.
    const neuf = await tableauNeuf();

    // ------------------------------------------------------------------
    // 13. LA CHRONOLOGIE DU GESTE, QUI EST CE QUE LE PROFESSEUR VOIT.
    //
    //     « C'est pas hyper fluide, on voit que c'est flou puis après lissé. »
    //
    //     Le calque arrive le premier, et de loin — c'est lui qu'on lit. Et
    //     l'affinage de la page, qui gèle le fil principal le temps de son
    //     rendu, attend que le relais soit pris : mesuré 109 millisecondes de
    //     gel jusqu'à quatre fois la page, 296 à 367 au plafond des seize
    //     mégapixels.
    // ------------------------------------------------------------------
    const chrono = await neuf.page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        zoom = 16;
        panX = -(o.x + o.w * 0.125) * zoom + canvas.width / 2;
        panY = -(o.y + o.h * 0.7667) * zoom + canvas.height / 2;
        const srcAvant = o.src, t0 = performance.now();
        let calqueA = null, imageA = null, gelMax = 0, gelQuand = null;
        let dernier = t0, fini = false;
        const suivre = () => {
            const t = performance.now(), ecart = t - dernier;
            if (ecart > gelMax) { gelMax = ecart; gelQuand = Math.round(dernier - t0); }
            dernier = t;
            if (calqueA === null && calqueNet) calqueA = Math.round(t - t0);
            if (imageA === null && o.src !== srcAvant) imageA = Math.round(t - t0);
            if (!fini) requestAnimationFrame(suivre);
        };
        requestAnimationFrame(suivre);
        draw();
        demanderAffinageDeLaVue();
        await new Promise(k => setTimeout(k, 2600));
        fini = true;
        return { calqueA, imageA, gelMax: Math.round(gelMax), gelQuand };
    });
    r.verifie('le calque est là en moins d\'un quart de seconde',
        chrono.calqueA !== null && chrono.calqueA < 250,
        JSON.stringify(chrono) + ' — 699 ms quand il attendait l\'affinage');
    r.verifie('et il arrive AVANT l\'image affinée de la page',
        chrono.imageA !== null && chrono.imageA > chrono.calqueA,
        JSON.stringify(chrono));
    // LES SEUILS SONT PRIS SUR LA MESURE, et non au doigt mouillé : sans le
    // report, l'image affinée arrive à 545-555 ms et le gel tombe à 315 ;
    // avec, l'image est à 996 et le gel à 729. Un seuil à 500 ms ne séparait
    // donc rien — il laissait passer les deux, et le sabotage était muet.
    r.verifie('l\'affinage, lui, attend que le relais soit pris',
        chrono.imageA > 800,
        JSON.stringify(chrono) + ' — 545 à 555 ms quand il ne laissait pas passer');
    r.verifie('et son gel ne tombe pas dans la demi-seconde qui suit le calque',
        chrono.gelQuand !== null && chrono.gelQuand > chrono.calqueA + 400,
        JSON.stringify(chrono) + ' — gel à 315 ms quand il ne laissait pas passer');

    r.verifie('aucune erreur de chronologie', neuf.erreurs.length === 0,
        neuf.erreurs.join(' | '));
    await neuf.context.close();

    // ------------------------------------------------------------------
    // 14. SUR UN GRAND ÉCRAN, LE PLAFOND SERT.
    //
    //     Un vidéoprojecteur de classe monte à 2560 × 1440 : l'écran et son
    //     quart de marge font alors 5,8 mégapixels, et rendre cela à chaque
    //     geste n'est plus tenable. Le plafond de quatre mégapixels rabat le
    //     calque — un peu moins net qu'un pixel pour un pixel, et toujours
    //     très loin du flou d'origine.
    // ------------------------------------------------------------------
    const grand = await ouvrirApp(browser, { viewport: { width: 2560, height: 1440 } });
    await tableauVierge(grand.page);
    await grand.page.waitForFunction(() => typeof poserPdfFeuilletable === 'function',
        { timeout: 20000 });
    await grand.page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'fiche.pdf',
            { type: 'application/pdf' }));
        await new Promise(k => setTimeout(k, 1400));
    }, { octets: Array.from(fichePdf()) });
    await grand.page.waitForTimeout(700);
    await grand.page.evaluate(() => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        zoom = 16;
        panX = -(o.x + o.w * 0.125) * zoom + canvas.width / 2;
        panY = -(o.y + o.h * 0.7667) * zoom + canvas.height / 2;
        draw(); demanderAffinageDeLaVue();
    });
    await grand.page.waitForTimeout(3200);
    const surGrandEcran = await grand.page.evaluate(() => {
        const L = canvas.width, H = canvas.height;
        return calqueNet
            ? { px: calqueNet.largeur * calqueNet.hauteur, sansPlafond: Math.round(L * 1.25) * Math.round(H * 1.25) }
            : null;
    });
    r.verifie('un calque naît aussi sur un grand écran', !!surGrandEcran,
        JSON.stringify(surGrandEcran));
    r.verifie('l\'écran et sa marge dépasseraient le plafond',
        surGrandEcran && surGrandEcran.sansPlafond > 4e6, JSON.stringify(surGrandEcran));
    r.verifie('et le calque s\'y rabat', surGrandEcran && surGrandEcran.px <= 4e6,
        JSON.stringify(surGrandEcran));
    r.verifie('aucune erreur sur grand écran', grand.erreurs.length === 0,
        grand.erreurs.join(' | '));
    await grand.context.close();

    return r.bilan();
};
