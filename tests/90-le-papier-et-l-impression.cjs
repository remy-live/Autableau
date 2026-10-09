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
const { creerRapport, ouvrirApp, tableauVierge, pdfA4 } = require('./harness.cjs');

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

    // ==================================================================
    // SUR DU PAPIER, L'ENCRE BLANCHE N'EXISTE PAS
    //
    // En mode nuit, le tableau est sombre et l'encre claire — juste à l'écran.
    // Mais une feuille sort BLANCHE, et l'export écrivait « fill="#ffffff" »
    // pour les traits comme pour chaque morceau de texte. Le professeur
    // imprimait une page vide et croyait à une panne.
    //
    // CE QU'IL FAUT MESURER N'EST PAS « STROKE ». Un texte SVG n'a jamais de
    // contour : il porte un « fill », et chaque morceau porte le sien dans un
    // « tspan ». Une vérification qui ne chercherait qu'un « stroke="#fff" »
    // absent serait verte sur une feuille vide — c'est le piège de cette
    // correction, et c'est ici qu'il se referme : on relève TOUS les attributs
    // de couleur, « stroke » comme « fill », sur toute la chaîne.
    //
    // ET LES BLANCS VOULUS DOIVENT SURVIVRE : le remplissage d'un cadre blanc
    // est un choix du professeur, sa bordure seule est de l'encre.
    // ==================================================================
    const papier = await page.evaluate(() => {
        if (typeof isDarkMode !== 'undefined' && !isDarkMode
            && typeof toggleDarkMode === 'function') toggleDarkMode();
        points.length = 0; segments.length = 0; freehands.length = 0;
        texts.length = 0; rectangles.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        // De l'encre claire partout : un trait, un point, et un texte dont le
        // morceau porte SA propre couleur blanche.
        points.push({ id: 7101, type: 'point', x: 200, y: 200, color: '#ffffff', shape: 'circle' });
        points.push({ id: 7102, type: 'point', x: 500, y: 400, color: '#ffffff', shape: 'circle' });
        // « p1_id » / « p2_id », et non « p1 » / « p2 » : avec les mauvais noms,
        // le segment n'entrait pas dans la liste d'affichage de l'export et ma
        // mesure portait sur un décor à moitié absent. Mesuré, pas supposé.
        segments.push({ id: 7103, type: 'segment', p1_id: 7101, p2_id: 7102,
            strokeColor: '#ffffff', width: 4, strokeOpacity: 1, z: 1 });
        texts.push({ id: 7104, type: 'text', x: 250, y: 300, fontSize: 28, lineHeight: 34,
            content: '<span style="color: #ffffff">craie</span>', color: '#ffffff',
            strokeColor: '#ffffff', fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        // Et un blanc VOULU : un cadre rempli de blanc, bordé de sombre.
        points.push({ id: 7106, type: 'point', x: 700, y: 200, color: '#2d3436', shape: 'none' });
        points.push({ id: 7107, type: 'point', x: 820, y: 280, color: '#2d3436', shape: 'none' });
        rectangles.push({ id: 7105, type: 'rectangle', p1_id: 7106, p2_id: 7107,
            strokeColor: '#2d3436', fillColor: '#ffffff', isFilled: true,
            fillOpacity: 1, width: 2, strokeOpacity: 1, z: 1 });
        draw();
        const rect = { x: 0, y: 0, w: 1000, h: 700 };
        const sortie = (mode) => generateSVGString(rect, mode);
        const svgPapier = sortie('papier');
        const svgEcran = sortie(true);
        // CHAQUE ÉLÉMENT, NOMMÉ. Un COMPTE de couleurs blanches peut tomber
        // juste par accident — et c'est exactement ainsi qu'un contrôle passe
        // pour la mauvaise raison. On relève donc la couleur DE CHAQUE BALISE,
        // « stroke » comme « fill », et l'on nomme ce qu'on attend d'elle.
        const lire = (s) => {
            const attr = (b, n) => { const m = new RegExp(n + '="([^"]*)"').exec(b); return m ? m[1].toLowerCase() : null; };
            const balises = s.match(/<(line|circle|rect|tspan)\b[^>]*>/g) || [];
            const par = (nom) => balises.filter(b => b.startsWith('<' + nom));
            return {
                fond: attr((par('rect')[0] || ''), 'fill'),
                // Les deux points du segment, dessinés en cercles pleins.
                pastilles: par('circle').map(b => attr(b, 'fill')),
                // Le trait : son encre est un « stroke ».
                trait: attr((par('line')[0] || ''), 'stroke'),
                // Le texte : son encre est un « fill », et il n'a JAMAIS de
                // « stroke ». Une vérification qui chercherait un
                // « stroke="#fff" » absent serait verte sur une feuille vide.
                texte: attr((par('tspan')[0] || ''), 'fill'),
                // Le cadre : sa bordure est de l'encre, son remplissage est un
                // choix du professeur et doit rester blanc.
                cadreBordure: attr((par('rect')[1] || ''), 'stroke'),
                cadreInterieur: attr((par('rect')[1] || ''), 'fill')
            };
        };
        return { surPapier: lire(svgPapier), aLEcran: lire(svgEcran),
                 sombreDansPapier: /#1e272e/i.test(svgPapier) };
    });
    const P = papier.surPapier, E = papier.aLEcran;
    const sombre = (c) => c === '#2d3436';
    const clair = (c) => !!c && /^(#ffffff|#fff|rgb\(255, ?255, ?255\))$/.test(c);
    r.verifie('EN MODE PAPIER, LA FEUILLE EST BLANCHE et ne porte plus le tableau noir',
        P.fond === '#ffffff' && papier.sombreDansPapier === false,
        JSON.stringify(papier));
    r.verifie('ET CHAQUE ENCRE CLAIRE EST RABATTUE : le trait, les deux points, ET LE TEXTE',
        sombre(P.trait) && P.pastilles.length === 2 && P.pastilles.every(sombre)
        && sombre(P.texte),
        JSON.stringify(P));
    r.verifie('MAIS LE BLANC VOULU TIENT : un cadre blanc reste blanc, sa bordure reste encre',
        /^rgba\(255, ?255, ?255/.test(P.cadreInterieur || '') && sombre(P.cadreBordure),
        JSON.stringify(P));
    r.verifie('L\'ÉCRAN, LUI, GARDE SA CRAIE BLANCHE : on n\'a rien changé au tableau',
        E.fond === '#1e272e' && clair(E.trait) && E.pastilles.every(clair) && clair(E.texte),
        JSON.stringify(E));

    await page.evaluate(() => {
        if (typeof isDarkMode !== 'undefined' && isDarkMode
            && typeof toggleDarkMode === 'function') toggleDarkMode();
        points.length = 0; segments.length = 0; texts.length = 0; rectangles.length = 0;
        selectedItems = []; draw();
    });

    // ==================================================================
    // IMPRIMER : L'EXPORT PDF, PLUS UN BOUTON
    //
    // On ne vérifie pas qu'un bouton existe — le gardien des raccourcis le
    // fait déjà. On vérifie ce que le professeur REÇOIT : un seul document,
    // une feuille par page du polycopié, marqué pour s'imprimer à l'ouverture,
    // et fabriqué en mode papier.
    // ==================================================================
    const octets = pdfA4(3);
    const impression = await page.evaluate(async ({ oct }) => {
        panX = 0; panY = 0; zoom = 1;
        images.length = 0; texts.length = 0; points.length = 0; segments.length = 0;
        rectangles.length = 0; selectedItems = [];
        if (typeof isDarkMode !== 'undefined' && !isDarkMode
            && typeof toggleDarkMode === 'function') toggleDarkMode();
        await poserPdfFeuilletable(new File([new Uint8Array(oct)], 'poly.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1200));
        const doc = images.find(i => i.pluginData && i.pluginData.id === 'pdfDoc');
        if (!doc) return { manque: 'aucun document posé' };
        await allerALaPage(doc, 2);
        await new Promise(res => setTimeout(res, 200));
        // De la craie blanche par-dessus, pour voir si elle est rabattue.
        texts.push({ id: 7201, type: 'text', x: doc.x + 20, y: doc.y + 40, fontSize: 26,
            lineHeight: 32, content: 'corrige', color: '#ffffff', strokeColor: '#ffffff',
            fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 5 });
        draw();

        // L'espion : on garde les documents nés, on compte les marquages, et
        // l'on neutralise le téléchargement.
        const nes = [];
        let marquages = 0, enregistrements = 0;
        const Vrai = window.jspdf.jsPDF;
        function Espion(...a) {
            const o = new Vrai(...a);
            const vraiAuto = o.autoPrint ? o.autoPrint.bind(o) : null;
            o.autoPrint = function () { marquages++; return vraiAuto ? vraiAuto() : this; };
            o.save = function () { enregistrements++; };
            nes.push(o);
            return o;
        }
        Espion.prototype = Vrai.prototype;
        window.jspdf.jsPDF = Espion;
        // Le fond demandé pendant la sortie, relevé au passage.
        const fonds = [];
        const vraiSvg = window.generateSVGString;
        window.generateSVGString = function (rect, mode) { fonds.push(mode); return vraiSvg(rect, mode); };
        // Le format bitmap AVANT : l'impression doit le refuser.
        selectedFormat = 'pdf-image';
        let ok = null;
        try { ok = await imprimerLeTableau(); }
        finally {
            window.jspdf.jsPDF = Vrai;
            window.generateSVGString = vraiSvg;
        }
        let feuilles = -1;
        try { feuilles = nes.length ? nes[nes.length - 1].internal.getNumberOfPages() : 0; }
        catch (e) { feuilles = -1; }
        return { ok, documents: nes.length, marquages, enregistrements, feuilles,
                 fonds: [...new Set(fonds)], formatApres: selectedFormat,
                 papierRetombe: window.sortieSurPapier(),
                 pageApres: doc.pluginData.page };
    }, { oct: Array.from(octets) });

    r.verifie('IMPRIMER SORT UN SEUL DOCUMENT, une feuille par page du polycopié',
        !impression.manque && impression.ok === true
        && impression.documents === 1 && impression.feuilles === 3,
        JSON.stringify(impression));
    r.verifie('ET IL EST MARQUÉ POUR S\'IMPRIMER — une fois, pas une par page',
        impression.marquages === 1 && impression.enregistrements === 1,
        JSON.stringify(impression));
    r.verifie('LA FEUILLE EST FABRIQUÉE EN MODE PAPIER, pas en mode écran',
        Array.isArray(impression.fonds) && impression.fonds.length === 1
        && impression.fonds[0] === 'papier',
        JSON.stringify(impression));
    r.verifie('LE FORMAT BITMAP EST REFUSÉ : l\'encre resterait illisible sur le papier',
        impression.formatApres === 'pdf-image' && impression.papierRetombe === false,
        JSON.stringify(impression));
    r.verifie('ET LA CLASSE RETROUVE SA PAGE : imprimer ne déplace pas ce qu\'elle regarde',
        impression.pageApres === 2, JSON.stringify(impression));

    // Ctrl+P appartient au tableau, pas au navigateur.
    await page.evaluate(() => {
        window.__impressionsDemandees = 0;
        window.__vraieImpression = window.imprimerLeTableau;
        window.imprimerLeTableau = () => { window.__impressionsDemandees++; return Promise.resolve(true); };
    });
    const ctrlP = await page.evaluate(() => {
        const e = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
        window.dispatchEvent(e);
        return { empeche: e.defaultPrevented, demandes: window.__impressionsDemandees };
    });
    r.verifie('CTRL+P IMPRIME LE TABLEAU, et empêche le navigateur d\'imprimer la page',
        ctrlP.empeche === true && ctrlP.demandes === 1, JSON.stringify(ctrlP));
    await page.evaluate(() => {
        window.imprimerLeTableau = window.__vraieImpression;
        images.length = 0; texts.length = 0; selectedItems = [];
        if (typeof isDarkMode !== 'undefined' && isDarkMode
            && typeof toggleDarkMode === 'function') toggleDarkMode();
        draw();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
