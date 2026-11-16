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
// ET IL A FALLU LE METTRE DANS LE BON ORDRE. L'affinage de la page tourne lui
// aussi quand le geste se pose, et il change l'image du document : un calque
// calculé AVANT lui naissait périmé et n'était jamais posé. Tout le travail
// était fait, et le flou restait entier — mesuré 11 060 pixels de gris avant
// comme après. Le calque attend donc 420 millisecondes là où l'affinage en
// attend 260 : rendre une page ne rend pas la main, le rendu tient toute sa
// tâche, et un minuteur armé plus tard ne part qu'une fois l'affinage fini.
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
    // 6. TOURNER LA PAGE LE PÉRIME.
    //
    //    Un calque de la page 1 posé sur la page 2, c'est le texte d'une
    //    autre page collé sur celle qu'on lit.
    // ------------------------------------------------------------------
    await allerVoir(0.125, 0.7667, 16);
    await poserLeGeste();
    const apresLaPage = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        const avant = calqueEncoreBon(o);
        const pages = (o.pluginData || {}).pages || 1;
        if (pages > 1) await allerALaPage(o, 2);
        else { o.src = o.src + '#autre'; }   // la fiche n'a qu'une page : on change son image
        return { avant, apres: calqueEncoreBon(o), pages };
    });
    r.verifie('le calque vaut pour la page où il est né', apresLaPage.avant === true,
        JSON.stringify(apresLaPage));
    r.egal('et plus quand l\'image du document change', apresLaPage.apres, false,
        JSON.stringify(apresLaPage));

    // ------------------------------------------------------------------
    // 7. UNE PAGE DE TRAVERS N'A PAS DE CALQUE.
    //
    //    Sa région visible ne se dit plus en rectangles du tableau. Un calque
    //    posé de travers est pire qu'un calque absent : elle garde son flou,
    //    et c'est voulu.
    // ------------------------------------------------------------------
    const deTravers = await page.evaluate(async () => {
        const o = images.find(i => (i.pluginData || {}).id === 'pdfDoc');
        if (o.src.endsWith('#autre')) o.src = o.src.slice(0, -6);
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
        o.src = o.src + '#tourne';                  // la page change dans l'intervalle
        const rendu = await enRoute;
        const res = { rendu, calque: !!calqueNet };
        o.src = o.src.slice(0, -7);
        return res;
    });
    r.egal('une page qui change pendant le rendu ne donne pas de calque',
        pendantLeRendu.rendu, false, JSON.stringify(pendantLeRendu));
    r.egal('et il n\'en est posé aucun', pendantLeRendu.calque, false,
        JSON.stringify(pendantLeRendu));

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

    // ------------------------------------------------------------------
    // 13. SUR UN GRAND ÉCRAN, LE PLAFOND SERT.
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
