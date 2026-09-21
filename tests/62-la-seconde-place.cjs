// LA SECONDE PLACE : L'ÉCRAN PROJETÉ PORTE DEUX CHOSES.
//
// « Quand on pose à côté, il est difficile de revenir sur la vue du PDF ou
// globale. » Et, plus tard : « Et si on importe deux pages PDF côte à côte ? »
//
// Les deux questions n'en font qu'une. La marge où l'on posait un morceau n'a
// jamais été une pièce de l'application : c'était le vide laissé par une A4 sur
// un écran 16/9, et la pleine largeur par défaut l'a refermé.
//
// MESURÉ, CE VIDE VALAIT UNE SECONDE PAGE — c'est la mesure qui a décidé de
// tout, et ce chapitre la refait : deux pages côte à côte ne coûtent presque
// rien en taille, chacune reste aussi grande qu'une page projetée seule.
//
// LA DISPOSITION EST UN CALCUL, PAS UN RÉGLAGE : on essaie côte à côte et l'un
// sous l'autre, et l'on garde ce qui rend les deux documents les plus grands.
// Le test refait le calcul de son côté plutôt que d'écrire la réponse en dur —
// sans quoi il ne vérifierait que sa propre recopie.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La seconde place');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // DEUX A4 PORTRAIT SE METTENT CÔTE À CÔTE
    // ------------------------------------------------------------------
    const portraits = await page.evaluate(() => {
        const a = { x: 100, y: 200, w: 1000, h: 1414 };
        const b = { x: 9000, y: 9000, w: 300, h: 424 };     // la même forme, plus petit
        const d = disposerLesDeux(a, b);
        return {
            aCote: d.aCote,
            memeHauteur: Math.abs(b.h - a.h) < 0.5,
            formeGardee: Math.abs((b.w / b.h) - (300 / 424)) < 0.01,
            aDroite: b.x > a.x + a.w,
            memeHaut: Math.abs(b.y - a.y) < 0.5,
            boiteContientLesDeux: d.boite.x <= a.x && d.boite.y <= a.y
                && d.boite.x + d.boite.w >= b.x + b.w - 0.5
                && d.boite.y + d.boite.h >= b.y + b.h - 0.5
        };
    });
    r.verifie('deux pages portrait se mettent côte à côte', portraits.aCote, JSON.stringify(portraits));
    r.verifie('le voisin prend la hauteur du principal', portraits.memeHauteur, JSON.stringify(portraits));
    r.verifie('sans se déformer', portraits.formeGardee, JSON.stringify(portraits));
    r.verifie('il se pose à sa droite, aligné sur le haut',
        portraits.aDroite && portraits.memeHaut, JSON.stringify(portraits));
    r.verifie('et la boîte des deux les contient tous les deux',
        portraits.boiteContientLesDeux, JSON.stringify(portraits));

    // ET UN VOISIN D'UNE AUTRE FORME NE S'ÉCRASE PAS DANS LA PLACE. Deux A4
    // ont la même forme : une déformation y passerait inaperçue, et c'est
    // exactement ce qu'un sabotage a montré. On met donc à côté d'une page
    // portrait un document large, et l'on regarde s'il garde sa forme.
    const formeAutre = await page.evaluate(() => {
        const a = { x: 0, y: 0, w: 1000, h: 1414 };
        const b = { x: 9000, y: 9000, w: 800, h: 600 };
        const d = disposerLesDeux(a, b);
        return {
            aCote: d.aCote,
            forme: b.w / b.h,
            formeDuPrincipal: a.w / a.h,
            memeHauteur: Math.abs(b.h - a.h) < 0.5
        };
    });
    r.verifie('un voisin d\'une autre forme garde la sienne',
        Math.abs(formeAutre.forme - 800 / 600) < 0.01,
        `${formeAutre.forme.toFixed(3)} au lieu de ${(800 / 600).toFixed(3)}`);
    r.verifie('et il ne prend pas celle du principal',
        Math.abs(formeAutre.forme - formeAutre.formeDuPrincipal) > 0.1,
        JSON.stringify(formeAutre));
    r.verifie('il occupe tout de même la même hauteur',
        formeAutre.aCote && formeAutre.memeHauteur, JSON.stringify(formeAutre));

    // ------------------------------------------------------------------
    // L'EMPILEMENT NE GAGNE QUE POUR CE QUI EST PLUS LARGE QUE L'ÉCRAN
    //
    // Deux A4 EN PAYSAGE tiennent encore côte à côte : c'est contre-intuitif,
    // et c'est le calcul qui tranche. Le point de bascule est la forme de
    // l'écran lui-même — tant qu'un document est moins large que lui, deux
    // exemplaires côte à côte restent plus grands qu'empilés, parce que
    // l'empilement rend la paire plus haute que l'écran avant de la rendre
    // plus large.
    // ------------------------------------------------------------------
    const paysages = await page.evaluate(() => {
        const a = { x: 0, y: 0, w: 1414, h: 1000 };
        const b = { x: 9000, y: 9000, w: 707, h: 500 };
        const d = disposerLesDeux(a, b);
        return { aCote: d.aCote, memeHauteur: Math.abs(b.h - a.h) < 0.5 };
    });
    r.egal('deux pages en paysage tiennent encore côte à côte', paysages.aCote, true);
    r.verifie('à la même hauteur', paysages.memeHauteur, JSON.stringify(paysages));

    const panorama = await page.evaluate(() => {
        const toile = document.getElementById('board');
        const forme = toile.clientWidth / toile.clientHeight;
        // Plus large que l'écran : là, et seulement là, l'empilement gagne.
        const a = { x: 0, y: 0, w: 3000, h: 800 };
        const b = { x: 9000, y: 9000, w: 1500, h: 400 };
        const d = disposerLesDeux(a, b);
        return {
            formeDeLEcran: forme,
            formeDuDocument: 3000 / 800,
            aCote: d.aCote,
            memeLargeur: Math.abs(b.w - a.w) < 0.5,
            dessous: b.y > a.y + a.h,
            memeGauche: Math.abs(b.x - a.x) < 0.5
        };
    });
    r.verifie('le point de bascule est bien la forme de l\'écran',
        panorama.formeDuDocument > panorama.formeDeLEcran,
        `document ${panorama.formeDuDocument.toFixed(2)} contre écran ${panorama.formeDeLEcran.toFixed(2)}`);
    r.egal('un document plus large que l\'écran, lui, s\'empile', panorama.aCote, false);
    r.verifie('le voisin prend alors la largeur du principal',
        panorama.memeLargeur, JSON.stringify(panorama));
    r.verifie('et se pose dessous, aligné à gauche',
        panorama.dessous && panorama.memeGauche, JSON.stringify(panorama));

    // LE CALCUL EST REFAIT ICI : on ne vérifie pas que la réponse est celle
    // qu'on attendait, mais qu'elle est bien LA PLUS GRANDE des deux.
    const leMeilleur = await page.evaluate(() => {
        const toile = document.getElementById('board');
        const L = toile.clientWidth, H = toile.clientHeight;
        const essai = (pw, ph, vw, vh) => {
            const a = { x: 0, y: 0, w: pw, h: ph };
            const b = { x: 5000, y: 5000, w: vw, h: vh };
            const d = disposerLesDeux(a, b);
            const ecart = pw * 0.04;
            const forme = vw / vh;
            const bc = { w: pw + ecart + ph * forme, h: ph };
            const bs = { w: pw, h: ph + ecart + pw / forme };
            const zc = Math.min(L / bc.w, H / bc.h);
            const zs = Math.min(L / bs.w, H / bs.h);
            return { choisi: d.aCote, attendu: zc >= zs, zc, zs };
        };
        return [
            essai(1000, 1414, 1000, 1414),     // deux A4 portrait
            essai(1414, 1000, 1414, 1000),     // deux paysages
            essai(1000, 1414, 1414, 1000),     // un de chaque
            essai(1414, 1000, 1000, 1414),     // et dans l'autre sens
            essai(1000, 1000, 400, 1600),      // un carré et une bande étroite
            essai(3000, 800, 3000, 800),       // deux panoramas, plus larges que l'écran
            essai(3000, 800, 1000, 1414)       // un panorama et une A4
        ];
    });
    r.egal('la disposition retenue est toujours celle qui montre le plus grand',
        leMeilleur.map(e => e.choisi), leMeilleur.map(e => e.attendu));
    r.verifie('et les deux dispositions ne donnent pas toujours le même résultat',
        leMeilleur.some(e => e.choisi) && leMeilleur.some(e => !e.choisi),
        JSON.stringify(leMeilleur.map(e => e.choisi)));

    // ------------------------------------------------------------------
    // LA MESURE QUI A DÉCIDÉ DE TOUT
    //
    // Une A4 projetée en page entière est limitée par la HAUTEUR de l'écran :
    // elle n'occupe qu'une fraction de la largeur, et il reste très exactement
    // la place d'une seconde. Deux pages côte à côte ne coûtent donc presque
    // rien en taille — c'est cela qu'on vérifie, en pixels.
    // ------------------------------------------------------------------
    const mesure = await page.evaluate(() => {
        const toile = document.getElementById('board');
        const L = toile.clientWidth, H = toile.clientHeight;
        const A4 = () => ({ x: 0, y: 0, w: 1000, h: 1414 });

        const seule = A4();
        cadrerSurLObjet(seule, 1);
        const largeurSeule = seule.w * zoom;
        const hauteurSeule = seule.h * zoom;

        const gauche = A4(), droite = { x: 5000, y: 5000, w: 1000, h: 1414 };
        cadrerSurLesDeux(gauche, droite);
        const largeurAdeux = gauche.w * zoom;

        // Et les deux tiennent dans l'écran, bords compris.
        const boite = { x1: gauche.x * zoom + panX, y1: gauche.y * zoom + panY,
                        x2: (droite.x + droite.w) * zoom + panX,
                        y2: (droite.y + droite.h) * zoom + panY };
        return {
            L, H, largeurSeule, hauteurSeule, largeurAdeux,
            part: largeurAdeux / largeurSeule,
            placeQuiRestait: L - largeurSeule,
            tiennent: boite.x1 >= -1 && boite.y1 >= -1 && boite.x2 <= L + 1 && boite.y2 <= H + 1
        };
    });
    r.verifie('une page seule est bridée par la hauteur : il reste de la place à côté',
        mesure.placeQuiRestait > mesure.largeurSeule * 0.8,
        `page ${Math.round(mesure.largeurSeule)} px sur ${mesure.L}, il reste ${Math.round(mesure.placeQuiRestait)}`);
    r.verifie('à deux, chaque page garde au moins 95 % de sa taille',
        mesure.part >= 0.95,
        `${Math.round(mesure.largeurAdeux)} px contre ${Math.round(mesure.largeurSeule)} — ${Math.round(mesure.part * 100)} %`);
    r.verifie('et les deux tiennent dans l\'écran', mesure.tiennent, JSON.stringify(mesure));

    // ------------------------------------------------------------------
    // LE VOILE ÉPARGNE LE VOISIN — UNE SEULE FOIS
    //
    // Le voile se troue en « pair-impair » : un rectangle posé DEUX fois
    // s'annule, et l'on peindrait alors par-dessus ce qu'on voulait montrer.
    // C'est exactement le cas du morceau qui occupe la seconde place.
    // ------------------------------------------------------------------
    const voile = await page.evaluate(() => {
        images.length = 0;
        const doc = { id: 901, x: 0, y: 0, w: 1000, h: 1414,
                      pluginData: { id: 'pdfDoc', cle: 'poly-1' } };
        const bout = { id: 902, x: 2000, y: 0, w: 300, h: 200,
                       pluginData: { id: 'morceau', cle: 'poly-1', source: 901 } };
        const etranger = { id: 903, x: 4000, y: 0, w: 300, h: 200,
                           pluginData: { id: 'pdfDoc', cle: 'autre' } };
        images.push(doc, bout, etranger);

        presentationEnCours = doc.id;

        presentationVoisine = null;
        const sansVoisin = boitesEpargneesParLeVoile(doc).map(o => o.id);

        // Le voisin est le morceau qu'on épargnait déjà : il ne doit compter
        // qu'une fois, sans quoi le voile le recouvrirait.
        presentationVoisine = bout.id;
        const voisinDejaLa = boitesEpargneesParLeVoile(doc).map(o => o.id);

        // Un document étranger, lui, s'ajoute.
        presentationVoisine = etranger.id;
        const voisinNouveau = boitesEpargneesParLeVoile(doc).map(o => o.id);

        // Et un voisin effacé libère la place au lieu de laisser un trou.
        presentationVoisine = 999;
        const voisinDisparu = { liste: boitesEpargneesParLeVoile(doc).map(o => o.id),
                                place: presentationVoisine };

        presentationEnCours = null;
        presentationVoisine = null;
        images.length = 0;
        return { sansVoisin, voisinDejaLa, voisinNouveau, voisinDisparu };
    });
    r.egal('sans voisin, le voile épargne les morceaux de la page',
        voile.sansVoisin, [902]);
    r.egal('un morceau déjà épargné ne compte pas deux fois',
        voile.voisinDejaLa, [902]);
    r.egal('un document étranger posé à côté rejoint les épargnés',
        voile.voisinNouveau.sort(), [902, 903]);
    r.egal('un voisin effacé ne laisse pas de trou', voile.voisinDisparu.liste, [902]);
    r.egal('et la place se libère d\'elle-même', voile.voisinDisparu.place, null);

    // ------------------------------------------------------------------
    // SORTIR LIBÈRE LA PLACE
    // ------------------------------------------------------------------
    const sortie = await page.evaluate(() => {
        images.length = 0;
        const doc = { id: 911, x: 0, y: 0, w: 1000, h: 1414, pluginData: { id: 'pdfDoc', cle: 'p' } };
        const voisin = { id: 912, x: 2000, y: 0, w: 1000, h: 1414, pluginData: { id: 'pdfDoc', cle: 'q' } };
        images.push(doc, voisin);
        presentationEnCours = doc.id;
        presentationVoisine = voisin.id;
        const avant = { projection: presentationEnCours, place: presentationVoisine };
        quitterLaPresentation();
        const apres = { projection: presentationEnCours, place: presentationVoisine };
        images.length = 0;
        return { avant, apres };
    });
    r.egal('la place était prise', voile.sansVoisin.length >= 0 && sortie.avant.place, 912);
    r.egal('quitter la projection la libère', sortie.apres.place, null);
    r.egal('et il n\'y a plus de projection non plus', sortie.apres.projection, null);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
