// L'OPÉRATION POSÉE
//
// « Tu pourras me faire un plugin où on écrit l'opération et il la pose, on
// peut activer ou non la solution (détaillée) et pour la division demander le
// nombre de chiffres après la virgule. »
//
// CE CHAPITRE MESURE DES COLONNES, PAS DES IMAGES. Une opération posée est
// juste ou fausse pour une seule raison : les unités sont, ou ne sont pas,
// sous les unités. Le plugin rend donc un PLAN — une liste de chiffres avec
// leur colonne et leur ligne — et c'est ce plan qu'on interroge. Comparer des
// pixels dirait « ça ressemble à une addition » ; compter des colonnes dit
// « le 7 et le 8 sont dans la même ».
//
// TROIS MESURES PORTENT LE RESTE.
//
//   — LES RANGS SE SUPERPOSENT. « 999 + 1 » n'a pas le même nombre de
//     chiffres en haut et en bas, et c'est exactement le cas où une opération
//     écrite en texte glisse. On exige que le 9 des unités, le 1 et le 0 du
//     résultat partagent une colonne, et que la virgule de « 12,5 + 3,75 »
//     tombe au même rang sur les trois lignes.
//   — LE DÉTAIL EST VRAI, pas décoratif. Les produits partiels doivent
//     s'additionner sur le résultat, et les soustractions successives de la
//     potence doivent toutes valoir « chiffre du quotient × diviseur ».
//     Un détail qu'on ne recalcule pas est un dessin.
//   — ET LE TAMPON SE RÉOUVRE SUR SES PROPRES RÉGLAGES : c'est la manière de
//     poser l'opération nue devant la classe, puis de révéler la solution
//     sans rien retaper.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport("L'opération posée");
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 860 } });
    await page.waitForFunction(
        () => window.PluginManager && PluginManager.plugins['operationPoseeTool'], { timeout: 20000 });
    await tableauVierge(page);

    // Le plan d'une opération, plus de quoi l'interroger : le contenu d'une
    // case, et la colonne où tombe un chiffre donné d'une ligne.
    const plan = (txt, opts) => page.evaluate(([txt, opts]) => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const plan = p.poser(txt, opts);
        if (plan.erreur) return plan;
        // Une ligne lue de gauche à droite, virgule comprise.
        plan.lignesLues = [];
        for (let l = 0; l < plan.lignes; l++) {
            const dans = plan.grains.filter(g => g.r === l && !g.petit)
                .sort((a, b) => (a.c + (a.dx > 0 ? 0.5 : 0)) - (b.c + (b.dx > 0 ? 0.5 : 0)));
            plan.lignesLues.push(dans.map(g => g.t).join(''));
        }
        // La colonne de chaque chiffre, ligne par ligne : c'est ce qui dit si
        // les rangs se superposent.
        plan.colonnesDe = plan.lignesLues.map((_, l) =>
            plan.grains.filter(g => g.r === l && !g.petit && g.t !== ',')
                .map(g => g.c).sort((a, b) => a - b));
        plan.petits = plan.grains.filter(g => g.petit).map(g => ({ c: g.c, r: g.r, t: g.t }));
        return plan;
    }, [txt, opts || {}]);

    // =====================================================================
    // 1. LIRE L'OPÉRATION
    // =====================================================================
    const signes = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const essais = ['12 + 3', '12-3', '12 − 3', '12 x 3', '12X3', '12 × 3', '12*3',
                        '12 / 3', '12:3', '12 ÷ 3', '12 + 3 =', '  12 + 3  '];
        return essais.map(t => (p.analyser(t).signe || p.analyser(t).erreur));
    });
    r.egal('tout ce qui s\'écrit « plus », « moins », « fois » et « divisé par » est compris',
        signes, ['+', '−', '−', '×', '×', '×', '×', '÷', '÷', '÷', '+', '+']);

    const nombres = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        return {
            entier: p.lireUnNombre('347'),
            virgule: p.lireUnNombre('12,5'),
            point: p.lireUnNombre('12.5'),
            espaces: p.lireUnNombre('1 234'),
            lettres: p.lireUnNombre('12a'),
            vide: p.lireUnNombre(''),
            deuxVirgules: p.lireUnNombre('1,2,3')
        };
    });
    r.egal('un nombre à virgule se lit en chiffres et en rang de virgule',
        [nombres.entier, nombres.virgule, nombres.point],
        [{ chiffres: '347', virgule: 0 }, { chiffres: '125', virgule: 1 }, { chiffres: '125', virgule: 1 }]);
    r.egal('les espaces des milliers ne gênent pas', nombres.espaces, { chiffres: '1234', virgule: 0 });
    r.egal('et ce qui n\'est pas un nombre est refusé proprement',
        [nombres.lettres, nombres.vide, nombres.deuxVirgules], [null, null, null]);

    const refus = await Promise.all([
        plan('bonjour', {}), plan('12', {}), plan('-5 + 3', {}),
        plan('5 ÷ 0', { resultat: true }), plan('437 - 912', { resultat: true })
    ]);
    r.verifie('une saisie qui n\'est pas une opération donne une phrase, pas un dessin vide',
        refus.slice(0, 3).every(p => p.erreur && p.erreur.length > 10),
        JSON.stringify(refus.slice(0, 3)));
    r.verifie('on ne divise pas par zéro', /z.ro/i.test(refus[3].erreur || ''), refus[3].erreur);
    r.verifie('et une soustraction qui passerait sous zéro se refuse en le disant',
        /plus grand/i.test(refus[4].erreur || ''), refus[4].erreur);

    // =====================================================================
    // 2. L'ADDITION — ET LA SUPERPOSITION DES RANGS
    // =====================================================================
    const somme = await plan('347 + 258', { resultat: true, etapes: true });
    r.egal('l\'addition est juste', somme.resultat, '605');
    r.egal('et elle se lit ligne à ligne', somme.lignesLues.filter(Boolean), ['347', '+258', '605']);

    // LE CŒUR DU CHAPITRE : trois lignes de longueurs différentes, un seul
    // rang des unités.
    const inegal = await plan('999 + 1', { resultat: true, etapes: true });
    const colUnites = (p) => p.colonnesDe.map(cs => cs.length ? cs[cs.length - 1] : null).filter(c => c !== null);
    r.egal('« 999 + 1 » vaut mille', inegal.resultat, '1000');
    r.egal('LES UNITÉS SONT DANS LA MÊME COLONNE SUR LES TROIS LIGNES',
        new Set(colUnites(inegal)).size, 1, JSON.stringify(inegal.colonnesDe));
    r.egal('et le résultat déborde d\'une colonne vers la gauche, comme il doit',
        inegal.colonnesDe[3][0], inegal.colonnesDe[1][0] - 1, JSON.stringify(inegal.colonnesDe));

    const retenues = await plan('347 + 258', { resultat: true, etapes: true });
    r.egal('LA RETENUE SE POSE AU-DESSUS DE LA COLONNE OÙ ELLE S\'AJOUTE',
        retenues.petits.map(p => p.c).sort(), [1, 2], JSON.stringify(retenues.petits));
    const sansEtapes = await plan('347 + 258', { resultat: true });
    r.egal('sans les étapes, aucune retenue n\'est écrite', sansEtapes.petits.length, 0);

    const virgules = await plan('12,5 + 3,75', { resultat: true, etapes: true });
    r.egal('on complète par des zéros pour aligner les virgules',
        virgules.lignesLues.filter(Boolean), ['12,50', '+3,75', '16,25']);
    const colVirgule = (p) => p.grains.filter(g => g.t === ',').map(g => g.c);
    r.egal('LA VIRGULE EST AU MÊME RANG SUR LES TROIS LIGNES',
        new Set(colVirgule(virgules)).size, 1, JSON.stringify(colVirgule(virgules)));

    const petitesDecimales = await plan('0,05 + 0,07', { resultat: true });
    r.egal('un résultat qui n\'a plus de partie entière garde son zéro',
        petitesDecimales.lignesLues.filter(Boolean)[2], '0,12');

    // =====================================================================
    // 3. LA SOUSTRACTION ET SES RETENUES
    // =====================================================================
    const diff = await plan('912 - 437', { resultat: true, etapes: true });
    r.egal('la soustraction est juste', diff.resultat, '475');
    r.egal('et elle se lit ligne à ligne', diff.lignesLues.filter(Boolean), ['912', '−437', '475']);
    // Méthode des programmes : dix de plus en haut, un de plus en bas de la
    // colonne de GAUCHE. Les deux marques vont donc par paires décalées d'un
    // cran, et c'est cela qu'on mesure.
    const hauts = diff.petits.filter(p => p.r === 0).map(p => p.c).sort();
    const bas = diff.petits.filter(p => p.r === 1).map(p => p.c).sort();
    r.egal('deux emprunts en haut', hauts.length, 2, JSON.stringify(diff.petits));
    r.egal('LA RETENUE DU BAS EST UNE COLONNE À GAUCHE DE CELLE DU HAUT',
        bas, hauts.map(c => c - 1), JSON.stringify(diff.petits));

    const cascade = await plan('1000 - 1', { resultat: true, etapes: true });
    r.egal('un emprunt en cascade donne bien neuf cent quatre-vingt-dix-neuf', cascade.resultat, '999');
    r.egal('et il laisse trois marques en haut', cascade.petits.filter(p => p.r === 0).length, 3);

    const sansRetenue = await plan('5 - 5', { resultat: true, etapes: true });
    r.egal('une soustraction sans emprunt n\'écrit aucune marque', sansRetenue.petits.length, 0);
    r.egal('et elle donne zéro', sansRetenue.resultat, '0');

    const diffVirgule = await plan('1,50 - 0,50', { resultat: true });
    r.egal('une différence de décimaux garde ses rangs', diffVirgule.resultat, '1,00');

    // =====================================================================
    // 4. LA MULTIPLICATION ET SES PRODUITS PARTIELS
    // =====================================================================
    const prod = await plan('47 × 26', { resultat: true, etapes: true });
    r.egal('la multiplication est juste', prod.resultat, '1222');
    r.egal('les produits partiels sont écrits et décalés',
        prod.lignesLues.filter(Boolean), ['47', '×26', '282', '+94', '1222']);
    // UN DÉTAIL QU'ON NE RECALCULE PAS EST UN DESSIN : les partiels doivent
    // s'additionner sur le produit, décalage compris.
    const verifPartiels = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const pl = p.poser('47 × 26', { resultat: true, etapes: true });
        // Le rang se lit à la colonne du dernier chiffre de chaque ligne.
        const fin = l => Math.max(...pl.grains.filter(g => g.r === l && !g.petit).map(g => g.c));
        const lire = l => pl.grains.filter(g => g.r === l && !g.petit && g.t !== ',')
            .sort((a, b) => a.c - b.c).map(g => g.t).join('');
        const dernier = pl.lignes - 1;
        let total = 0;
        for (let l = 2; l < dernier; l++) total += parseInt(lire(l), 10) * Math.pow(10, fin(dernier) - fin(l));
        return { total, produit: parseInt(lire(dernier), 10) };
    });
    r.egal('ET LEUR SOMME, DÉCALAGE COMPRIS, EST BIEN LE PRODUIT',
        verifPartiels.total, verifPartiels.produit, JSON.stringify(verifPartiels));

    const unChiffre = await plan('47 × 6', { resultat: true, etapes: true });
    r.egal('UN SEUL CHIFFRE AU MULTIPLICATEUR, PAS DE LIGNE EN DOUBLE',
        unChiffre.lignesLues.filter(Boolean), ['47', '×6', '282']);

    const zeroDedans = await plan('47 × 206', { resultat: true, etapes: true });
    r.egal('un zéro au multiplicateur donne un produit partiel nul, et le compte est bon',
        [zeroDedans.resultat, zeroDedans.lignesLues.filter(Boolean).length], ['9682', 6]);

    const prodDec = await plan('1,5 × 2,5', { resultat: true, etapes: true });
    r.egal('les rangs des virgules s\'additionnent dans le produit', prodDec.resultat, '3,75');
    r.egal('et les produits partiels, eux, se posent en entiers comme au cahier',
        prodDec.lignesLues.filter(Boolean).slice(2, 4), ['75', '+30']);

    const toutPetit = await plan('0,5 × 0,5', { resultat: true });
    r.egal('un produit plus petit que l\'unité reprend son zéro et sa virgule', toutPetit.resultat, '0,25');

    // =====================================================================
    // 5. LA DIVISION, SA POTENCE ET SES DÉCIMALES
    // =====================================================================
    const divEntiere = await plan('734 ÷ 8', { resultat: true, etapes: true, decimales: 0 });
    r.egal('la division entière donne son quotient et son reste',
        [divEntiere.resultat, divEntiere.reste], ['91', '6']);
    r.verifie('la potence a son montant', (divEntiere.montants || []).length === 1,
        JSON.stringify(divEntiere.montants));
    r.verifie('et un trait sous le diviseur', divEntiere.traits.some(t => t.r === 0 && t.c1 === divEntiere.montants[0].c),
        JSON.stringify(divEntiere.traits));

    // LE NOMBRE DE CHIFFRES APRÈS LA VIRGULE EST CELUI QU'ON DEMANDE.
    const decimales = await Promise.all([0, 1, 2, 3].map(n =>
        plan('734 ÷ 8', { resultat: true, decimales: n })));
    r.egal('on obtient exactement le nombre de décimales demandé',
        decimales.map(d => d.resultat), ['91', '91,7', '91,75', '91,750']);
    r.egal('ET LE DIVIDENDE PORTE LES ZÉROS QU\'ON VA ABAISSER',
        decimales.map(d => d.lignesLues[0].split(/\s/)[0]),
        ['7348', '734,08', '734,008', '734,0008'],
        'le diviseur est lu sur la même ligne, à droite du montant');

    const troncature = await plan('100 ÷ 7', { resultat: true, etapes: true, decimales: 3 });
    r.egal('on tronque, on n\'arrondit pas : poser une division c\'est s\'arrêter',
        [troncature.resultat, troncature.reste], ['14,285', '5']);

    const petitQuotient = await plan('12 ÷ 50', { resultat: true, etapes: true, decimales: 2 });
    r.egal('un quotient plus petit que un garde UN zéro, et pas deux',
        petitQuotient.resultat, '0,24');

    const diviseurDecimal = await plan('8 ÷ 0,25', { resultat: true, etapes: true, decimales: 0 });
    r.egal('UN DIVISEUR À VIRGULE SE RAMÈNE À UN ENTIER en décalant les deux nombres',
        [diviseurDecimal.resultat, diviseurDecimal.lignesLues[0].replace(/\s/g, '')], ['32', '80025']);

    // Chaque soustraction de la potence doit valoir « chiffre du quotient ×
    // diviseur » : sinon ce sont des nombres posés au hasard sous un trait.
    const potence = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const pl = p.poser('9876 ÷ 12', { resultat: true, etapes: true, decimales: 0 });
        const lire = (l) => pl.grains.filter(g => g.r === l && !g.petit && g.t !== ',' && g.t !== '−' && g.c <= 4)
            .sort((a, b) => a.c - b.c).map(g => g.t).join('');
        const produits = pl.traits.filter(t => t.r > 0).map(t => parseInt(lire(t.r), 10));
        return { produits, quotient: pl.resultat, reste: pl.reste, lignes: pl.lignes };
    });
    r.egal('la potence est juste', [potence.quotient, potence.reste], ['823', '0']);
    r.egal('ET CHAQUE SOUSTRACTION VAUT UN CHIFFRE DU QUOTIENT FOIS LE DIVISEUR',
        potence.produits, [8 * 12, 2 * 12, 3 * 12], JSON.stringify(potence));

    // SANS LES ÉTAPES, LE RESTE SE MET QUAND MÊME : « 91 » n'est pas la
    // réponse à « 734 ÷ 8 ».
    const nue = await plan('734 ÷ 8', { resultat: true, decimales: 0 });
    r.egal('un quotient sans son reste n\'est pas une réponse',
        nue.lignesLues[1].replace(/\s/g, ''), '691');
    r.verifie('et sans les étapes la potence reste courte', nue.lignes === 2, 'lignes ' + nue.lignes);

    const vide = await plan('734 ÷ 8', { decimales: 2 });
    r.egal('sans résultat, la potence est posée et vide : à l\'élève de jouer',
        vide.lignesLues.filter(Boolean).length, 1, JSON.stringify(vide.lignesLues));

    // =====================================================================
    // 6. LES ÉTAPES ENTRAÎNENT LE RÉSULTAT
    // =====================================================================
    const etapesSeules = await Promise.all([
        plan('347 + 258', { etapes: true }),
        plan('912 - 437', { etapes: true }),
        plan('47 × 26', { etapes: true }),
        plan('734 ÷ 8', { etapes: true, decimales: 0 })
    ]);
    r.egal('COCHER LES ÉTAPES MONTRE LE RÉSULTAT, pour les quatre opérations',
        etapesSeules.map(p => p.lignesLues.filter(Boolean).length), [3, 3, 5, 5],
        JSON.stringify(etapesSeules.map(p => p.lignesLues)));

    // =====================================================================
    // 7. LE DESSIN, PUIS LE TAMPON
    // =====================================================================
    const svg = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const s = p.dessiner(p.poser('734 ÷ 8', { resultat: true, etapes: true, decimales: 2 }), '#2d3436', true);
        const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
        return {
            malforme: !!doc.querySelector('parsererror'),
            chiffres: doc.querySelectorAll('text').length,
            traits: doc.querySelectorAll('line').length,
            couleur: s.indexOf('#2d3436') > -1
        };
    });
    r.verifie('le dessin est un SVG valide', !svg.malforme && svg.chiffres > 20 && svg.traits > 4,
        JSON.stringify(svg));
    r.verifie('et il porte la couleur demandée', svg.couleur);

    // Le bouton de la grille ouvre bien la boîte de réglages.
    const ouverture = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => x.dataset.pluginId === 'operationPoseeTool');
        if (!b) return { bouton: false };
        b.style.display = 'flex';
        b.click();
        const boite = document.getElementById('custom-prompt-modal');
        const champs = Array.from(document.querySelectorAll('#custom-prompt-inputs input, #custom-prompt-inputs select'));
        return {
            bouton: true,
            ouverte: !!boite && getComputedStyle(boite).display !== 'none',
            titre: (document.getElementById('custom-prompt-title') || {}).innerText,
            cases: champs.filter(c => c.type === 'checkbox').length,
            nombres: champs.filter(c => c.type === 'number').length,
            apercu: (document.getElementById('custom-prompt-preview') || {}).innerHTML.indexOf('<svg') > -1
        };
    });
    r.verifie('l\'outil a son bouton dans la grille des plugins', ouverture.bouton);
    r.verifie('qui ouvre la boîte de réglages', ouverture.ouverte, JSON.stringify(ouverture));
    r.egal('avec les deux cases demandées — le résultat, et les étapes', ouverture.cases, 2);
    r.egal('et le champ des chiffres après la virgule', ouverture.nombres, 1);
    r.verifie('l\'aperçu montre l\'opération avant de la poser', ouverture.apercu, JSON.stringify(ouverture));

    // L'aperçu suit la frappe, et une saisie fautive s'y explique.
    const apercus = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        return {
            bon: p.apercu(['47 × 26', true, true, '0', '#2d3436']).indexOf('<svg') === 0,
            mauvais: p.apercu(['bonjour', true, true, '0', '#2d3436']),
        };
    });
    r.verifie('l\'aperçu dessine ce qui se pose', apercus.bon);
    r.verifie('et DIT ce qui ne se pose pas, au lieu de rester blanc',
        apercus.mauvais.indexOf('<svg') === -1 && apercus.mauvais.length > 40, apercus.mauvais);

    // On valide : un tampon se pose sur le tableau, avec ses réglages.
    const pose = await page.evaluate(async () => {
        images.length = 0;
        const p = PluginManager.plugins['operationPoseeTool'];
        p.construire(['734 ÷ 8', true, false, '2', '#c0392b'], null);
        for (let i = 0; i < 60 && !images.length; i++) await new Promise(r => setTimeout(r, 50));
        const im = images[0];
        return im ? { id: im.pluginData && im.pluginData.id, args: im.pluginData && im.pluginData.args,
                      l: Math.round(im.w), h: Math.round(im.h) } : { aucun: true };
    });
    r.egal('valider pose un tampon qui se souvient de son opération',
        [pose.id, pose.args && pose.args[0]], ['operationPoseeTool', '734 ÷ 8']);
    r.verifie('et qui a une taille', pose.l > 60 && pose.h > 30, JSON.stringify(pose));

    // ET IL SE RÉOUVRE SUR SES PROPRES RÉGLAGES : c'est la façon de révéler la
    // solution devant la classe.
    const reedition = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        p.edit(images[0]);
        const champs = Array.from(document.querySelectorAll('#custom-prompt-inputs input'));
        return {
            titre: (document.getElementById('custom-prompt-title') || {}).innerText,
            operation: champs[0] && champs[0].value,
            resultat: champs[1] && champs[1].checked,
            etapes: champs[2] && champs[2].checked,
            decimales: champs[3] && champs[3].value
        };
    });
    r.egal('la réédition retrouve l\'opération, ses cases et ses décimales',
        [reedition.operation, reedition.resultat, reedition.etapes, reedition.decimales],
        ['734 ÷ 8', true, false, '2'], JSON.stringify(reedition));
    r.verifie('et elle le dit dans son titre', /Modifier/.test(reedition.titre || ''), reedition.titre);

    // Révéler les étapes remplace le dessin SUR PLACE : même objet, même coin.
    const revele = await page.evaluate(async () => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const centre = (im) => [Math.round(im.x + im.w / 2), Math.round(im.y + im.h / 2)];
        const avant = { n: images.length, src: images[0].src, centre: centre(images[0]), h: images[0].h };
        p.construire(['734 ÷ 8', true, true, '2', '#c0392b'], images[0]);
        for (let i = 0; i < 60 && images[0].src === avant.src; i++) await new Promise(r => setTimeout(r, 50));
        return { avant, apres: { n: images.length, change: images[0].src !== avant.src,
                 centre: centre(images[0]), h: images[0].h, etapes: images[0].pluginData.args[2] } };
    });
    r.egal('révéler les étapes ne pose PAS un second tampon', revele.apres.n, revele.avant.n);
    r.verifie('mais remplace le dessin du premier', revele.apres.change);
    // Le dessin détaillé est PLUS HAUT : c'est le centre qui ne bouge pas, et
    // c'est ce qu'il faut — sinon révéler la solution ferait sauter l'image.
    r.egal('sans le déplacer', revele.apres.centre, revele.avant.centre,
        'hauteurs ' + revele.avant.h + ' puis ' + revele.apres.h);
    r.verifie('alors que le dessin détaillé est plus haut', revele.apres.h > revele.avant.h,
        revele.avant.h + ' puis ' + revele.apres.h);
    r.egal('et la case cochée est retenue', revele.apres.etapes, true);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
