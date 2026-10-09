// LE PAPIER, ET L'IMPRESSION
//
// « 0 window.print(), 0 @media print » : un professeur qui prépare un exercice
// au tableau et veut le distribuer sur papier n'avait aucun chemin. Mais avant
// d'ouvrir ce chemin, l'étude a trouvé deux défauts qui existaient DÉJÀ, et qui
// auraient fait de l'impression un gâchis d'encre.
//
//   1. UN JPEG N'A PAS DE TRANSPARENCE. « Garder le fond du tableau » décoché,
//      le tableau est peint sur une toile vidée — c'est ce qu'il faut, et le
//      PNG le rend fidèlement. Mais le JPEG compose alors sur du NOIR. Mesuré
//      au même instant, sur la même toile :
//
//          coin du PNG  : [0, 0, 0, 0]     transparent, correct
//          coin du JPEG : [0, 0, 0, 255]   NOIR
//
//      Un professeur qui exporte « sans fond » pour imprimer recevait une
//      feuille noire. Une cartouche pour un exercice.
//
//   2. EN MODE NUIT, L'ENCRE EST BLANCHE. « generateSVGString » émet
//      « fill="#ffffff" » pour les traits comme pour chaque morceau de texte :
//      sur du papier blanc, invisible.
//
// CE QUI SE MESURE ICI EST L'IMAGE PRODUITE, pas l'intention. On capte ce que
// l'export encode, on le relit, et on lit les pixels : le coin doit être blanc,
// et l'encre doit avoir survécu. Cette seconde moitié n'est pas une politesse —
// peindre le blanc PAR-DESSUS au lieu de PAR-DESSOUS rendrait le coin blanc et
// la feuille vide, et la première vérification seule passerait.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport("Le papier, et l'impression");
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await tableauVierge(page);

    // Un décor sombre et net : deux points et un segment épais, en mode clair.
    const poser = () => page.evaluate(() => {
        if (typeof isDarkMode !== 'undefined' && isDarkMode
            && typeof toggleDarkMode === 'function') toggleDarkMode();
        points.length = 0; segments.length = 0; freehands.length = 0; texts.length = 0;
        selectedItems = []; panX = 0; panY = 0; zoom = 1;
        points.push({ id: 7001, type: 'point', x: 300, y: 300, color: '#2d3436', shape: 'none' });
        points.push({ id: 7002, type: 'point', x: 700, y: 520, color: '#2d3436', shape: 'none' });
        segments.push({ id: 7003, type: 'segment', p1: 7001, p2: 7002,
            strokeColor: '#2d3436', width: 6, strokeOpacity: 1 });
        draw();
    });

    // Capte ce que l'export encode, relit l'image, et rend deux pixels : un
    // coin resté vide, et un point pris SUR le trait.
    const mesurer = (type) => page.evaluate(async (leType) => {
        const vrai = HTMLCanvasElement.prototype.toDataURL;
        const prises = [];
        HTMLCanvasElement.prototype.toDataURL = function (t, q) {
            const url = vrai.call(this, t, q);
            prises.push({ type: t || 'image/png', url });
            return url;
        };
        // On neutralise le téléchargement : c'est l'image qui nous intéresse.
        const vraiJsPDF = window.jspdf && window.jspdf.jsPDF;
        if (vraiJsPDF) {
            function Espion(...a) { const o = new vraiJsPDF(...a); o.save = function () { }; return o; }
            Espion.prototype = vraiJsPDF.prototype;
            window.jspdf.jsPDF = Espion;
        }
        const ancre = document.createElement('a');
        const vraiClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { };
        try {
            const boite = document.getElementById('export-bg');
            if (boite) boite.checked = false;            // « sans fond »
            const q = document.getElementById('export-quality');
            if (q) q.value = '1';
            await performCapture(leType === 'image/png' ? 'png' : 'pdf-image');
            await new Promise(res => setTimeout(res, 150));
        } finally {
            HTMLCanvasElement.prototype.toDataURL = vrai;
            if (vraiJsPDF) window.jspdf.jsPDF = vraiJsPDF;
            HTMLAnchorElement.prototype.click = vraiClick;
        }
        const prise = prises.filter(p => p.type === leType).pop();
        if (!prise) return { manque: 'aucune prise ' + leType, types: prises.map(p => p.type) };
        const img = new Image();
        await new Promise(res => { img.onload = res; img.onerror = res; img.src = prise.url; });
        if (!img.width) return { manque: 'image illisible' };
        const t = document.createElement('canvas');
        t.width = img.width; t.height = img.height;
        const g = t.getContext('2d');
        g.drawImage(img, 0, 0);
        const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
        // L'encre : on cherche le pixel le plus sombre de l'image, qui est
        // forcément sur le trait. Sa seule existence dit que l'encre a survécu.
        const d = g.getImageData(0, 0, img.width, img.height).data;
        let plusSombre = 999, opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 128) continue;
            opaque++;
            const l = d[i] + d[i + 1] + d[i + 2];
            if (l < plusSombre) plusSombre = l;
        }
        // LES QUATRE COINS, ET NON UN SEUL. La toile d'un export de qualité
        // vaut « largeur × échelle » : remplir le rectangle LOGIQUE laisserait
        // un L noir en bas et à droite, qu'un seul coin en haut à gauche ne
        // verrait pas. Mesuré — ce sabotage-là ne tombait pas.
        return { coin: px(2, 2), largeur: img.width, hauteur: img.height,
                 coinBasDroite: px(img.width - 3, img.height - 3),
                 coinHautDroite: px(img.width - 3, 2),
                 coinBasGauche: px(2, img.height - 3),
                 plusSombre, opaque, prises: prises.map(p => p.type) };
    }, type);

    // --- LE JPEG : le coin doit être BLANC, et l'encre doit être là ---
    await poser();
    const jpeg = await mesurer('image/jpeg');
    const blanc = (c) => !!c && c[0] > 240 && c[1] > 240 && c[2] > 240;
    r.verifie('UN EXPORT « SANS FOND » NE REND PLUS UNE FEUILLE NOIRE, à ses quatre coins',
        !jpeg.manque && blanc(jpeg.coin) && blanc(jpeg.coinBasDroite)
        && blanc(jpeg.coinHautDroite) && blanc(jpeg.coinBasGauche),
        JSON.stringify(jpeg));
    // Le blanc est posé DESSOUS : si on l'avait posé dessus, le coin serait
    // blanc lui aussi et la feuille serait vide. C'est la vérification qui
    // distingue les deux.
    r.verifie('ET L\'ENCRE A SURVÉCU : le papier est posé DESSOUS, pas par-dessus',
        !jpeg.manque && jpeg.plusSombre < 200,
        JSON.stringify(jpeg));

    // --- LE PNG : il garde sa transparence, on n'y touche pas ---
    await poser();
    const png = await mesurer('image/png');
    r.verifie('LE PNG, LUI, GARDE SA TRANSPARENCE : le papier ne s\'y invite pas',
        !png.manque && png.coin && png.coin[3] === 0,
        JSON.stringify(png));
    r.verifie('et son encre est là aussi', !png.manque && png.plusSombre < 200,
        JSON.stringify(png));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
