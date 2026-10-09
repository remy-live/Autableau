// LA PAGE NETTE
//
// « Le PDF inclus n'est pas très précis, je trouve qu'il fait un peu flou. »
//
// On a d'abord cherché du côté de la densité de l'écran, puis du codec de
// l'image. Les deux sont hors de cause, et c'est mesuré :
//
//   — le JPEG ne perd rien d'appréciable sur du trait : erreur moyenne 0,03
//     sur 256, et 224 pixels sur 6,3 millions écartés de plus de 16 ;
//   — la lisseuse du canevas est déjà réglée au plus fin.
//
// LE DÉFAUT ÉTAIT QU'IL Y AVAIT TROP DE PIXELS, et d'un rapport bâtard. Une
// page gardée à 2975 pixels et montrée sur 1196 oblige le navigateur à réduire
// de 2,49 — un rapport qu'il ne sait pas faire proprement, car il réduit par
// MOITIÉS successives. Mesuré à taille d'affichage égale, par la pente moyenne
// entre pixels voisins (plus elle est forte, plus l'arête est franche) :
//
//     rapport 1     pente 0,625      24 ko
//     rapport 2     pente 0,596      63 ko
//     rapport 2,49  pente 0,510      87 ko   ← avant
//     rapport 3     pente 0,545     115 ko
//     rapport 4     pente 0,614     181 ko
//
// La courbe est en U et ne suit PAS la quantité de pixels : 3 ne vaut pas
// mieux que 2,49. Seules les puissances de deux sont propres.
//
// CE CHAPITRE MESURE DEUX CHOSES SÉPARÉMENT, et il le faut : que la règle soit
// vraie (un rapport en puissance de deux rend une image plus franche), et que
// l'application la SUIVE. Vérifier seulement la seconde laisserait croire
// qu'on a compris quelque chose ; vérifier seulement la première ne dirait
// rien du tableau.
const { creerRapport, ouvrirApp, tableauVierge, polyDense } = require('./harness.cjs');

// Une puissance de deux, à deux pour cent près : le rendu arrondit au pixel.
const puissanceDeDeux = (r) => {
    if (!(r > 0)) return false;
    const l = Math.log2(r);
    return Math.abs(l - Math.round(l)) < 0.03;
};

module.exports = async function (browser) {
    const r = creerRapport('La page nette');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1500, height: 940 } });
    await tableauVierge(page);
    const octets = Array.from(polyDense());

    // ------------------------------------------------------------------
    // 1. LA RÈGLE : un rapport en puissance de deux rend l'arête plus franche
    // ------------------------------------------------------------------
    const regle = await page.evaluate(async ({ oct }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(oct)], 'poly.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1500));
        const obj = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc');
        if (!obj) return { manque: 'pas de document' };
        const d = documentsPdf.get(obj.pluginData.cle);
        const pdfPage = await d.doc.getPage(obj.pluginData.page || 1);
        const nature = pdfPage.getViewport({ scale: 1 });
        const LARGE = Math.round(obj.w * zoom);

        const reduitDepuis = async (rapport) => {
            const vp = pdfPage.getViewport({ scale: (LARGE * rapport) / nature.width });
            const src = document.createElement('canvas');
            src.width = Math.round(vp.width); src.height = Math.round(vp.height);
            const gs = src.getContext('2d');
            gs.fillStyle = '#fff'; gs.fillRect(0, 0, src.width, src.height);
            await pdfPage.render({ canvasContext: gs, viewport: vp }).promise;
            const t = document.createElement('canvas');
            t.width = LARGE; t.height = Math.round(LARGE * src.height / src.width);
            const gt = t.getContext('2d');
            gt.imageSmoothingEnabled = true; gt.imageSmoothingQuality = 'high';
            gt.fillStyle = '#fff'; gt.fillRect(0, 0, t.width, t.height);
            gt.drawImage(src, 0, 0, t.width, t.height);
            const px = gt.getImageData(0, 0, t.width, t.height).data;
            let somme = 0, n = 0;
            for (let y = 0; y < t.height; y++) {
                for (let x = 1; x < t.width; x++) {
                    const i = (y * t.width + x) * 4;
                    somme += Math.abs(px[i] - px[i - 4]); n++;
                }
            }
            return +(somme / n).toFixed(3);
        };
        return { propre: await reduitDepuis(2), batard: await reduitDepuis(2.49) };
    }, { oct: octets });
    r.verifie('UN RAPPORT EN PUISSANCE DE DEUX DONNE UNE ARÊTE PLUS FRANCHE qu\'un rapport bâtard',
        !regle.manque && regle.propre > regle.batard * 1.05,
        'rapport 2 : pente ' + regle.propre + ' | rapport 2,49 : pente ' + regle.batard);

    // ------------------------------------------------------------------
    // 2. L'APPLICATION LA SUIT
    // ------------------------------------------------------------------
    const etat = () => page.evaluate(() => {
        const o = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc');
        if (!o) return { manque: true };
        const im = imageCache[o.src];
        const garde = im ? im.naturalWidth : 0;
        const affiche = Math.round(o.w * zoom);
        const d = documentsPdf.get(o.pluginData.cle);
        return { garde, affiche, rapport: garde / affiche,
                 naturel: (d && d.largeurNaturelle) || null,
                 pixels: im ? im.naturalWidth * im.naturalHeight : 0 };
    });
    const regler = (z) => page.evaluate((zz) => {
        zoom = zz; draw(); demanderAffinageDeLaVue();
    }, z).then(() => page.waitForTimeout(2600));

    await regler(1);
    const repos = await etat();
    r.verifie('AU REPOS, LA PAGE EST GARDÉE À UN RAPPORT EN PUISSANCE DE DEUX',
        !repos.manque && puissanceDeDeux(repos.rapport),
        JSON.stringify(Object.assign({}, repos, { rapport: +repos.rapport.toFixed(3) })));
    // Le plancher du papier : l'export et l'impression réutilisent CETTE image.
    // Un A4 de 1190 points gardé à deux fois, c'est 288 points par pouce.
    r.verifie('ET JAMAIS SOUS DEUX FOIS LA PAGE : l\'export et l\'impression s\'y servent',
        !repos.manque && repos.garde >= 2 * 1190 * 0.98,
        JSON.stringify({ garde: repos.garde, plancher: Math.round(2 * 1190) }));
    // ON NE GARDE PAS PLUS QUE CE QU'ON MONTRE — et cette vérification-ci
    // remplace une première version fausse, qu'il faut raconter : j'avais
    // écrit « et plus légère qu'avant », en comparant à un nombre de pixels
    // relevé pour UNE taille d'affichage. C'est vrai quand le document est
    // montré à peu près à sa taille naturelle, et faux quand il est montré
    // plus grand : le rapport 2 demande alors PLUS de pixels que l'ancien
    // plancher. Le gain est la netteté ; le poids, lui, suit la taille à
    // l'écran, et c'est normal. Ce qui se vérifie en toute circonstance, c'est
    // qu'on ne garde pas davantage que le rapport visé.
    r.verifie('ON NE GARDE PAS PLUS QUE LE RAPPORT VISÉ : pas de pixels pour rien',
        !repos.manque && repos.rapport <= 2.05 && repos.pixels <= 16e6,
        JSON.stringify(Object.assign({}, repos, { rapport: +repos.rapport.toFixed(3) })));

    await regler(0.4);
    const petit = await etat();
    r.verifie('DÉZOOMÉ, LE RAPPORT RESTE PROPRE — c\'est là qu\'on voyait le grain',
        !petit.manque && puissanceDeDeux(petit.rapport) && petit.garde >= 2 * 1190 * 0.98,
        JSON.stringify(Object.assign({}, petit, { rapport: +petit.rapport.toFixed(3) })));

    await page.evaluate(() => { zoom = 1; panX = 0; panY = 0; images.length = 0; draw(); });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
