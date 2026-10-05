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
    const prod = await plan('47 × 26', { resultat: true, etapes: true, decalage: 'rien' });
    r.egal('la multiplication est juste', prod.resultat, '1222');
    r.egal('les produits partiels sont écrits et décalés',
        prod.lignesLues.filter(Boolean), ['47', '×26', '282', '+94', '1222']);
    // UN DÉTAIL QU'ON NE RECALCULE PAS EST UN DESSIN : les partiels doivent
    // s'additionner sur le produit, décalage compris.
    const verifPartiels = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const pl = p.poser('47 × 26', { resultat: true, etapes: true, decalage: 'rien' });
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

    const unChiffre = await plan('47 × 6', { resultat: true, etapes: true, decalage: 'rien' });
    r.egal('UN SEUL CHIFFRE AU MULTIPLICATEUR, PAS DE LIGNE EN DOUBLE',
        unChiffre.lignesLues.filter(Boolean), ['47', '×6', '282']);

    const zeroDedans = await plan('47 × 206', { resultat: true, etapes: true, decalage: 'rien' });
    r.egal('un zéro au multiplicateur donne un produit partiel nul, et le compte est bon',
        [zeroDedans.resultat, zeroDedans.lignesLues.filter(Boolean).length], ['9682', 6]);

    const prodDec = await plan('1,5 × 2,5', { resultat: true, etapes: true, decalage: 'rien' });
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
        plan('47 × 26', { etapes: true, decalage: 'rien' }),
        plan('734 ÷ 8', { etapes: true, decimales: 0 })
    ]);
    r.egal('COCHER LES ÉTAPES MONTRE LE RÉSULTAT, pour les quatre opérations',
        etapesSeules.map(p => p.lignesLues.filter(Boolean).length), [3, 3, 5, 5],
        JSON.stringify(etapesSeules.map(p => p.lignesLues)));

    // =====================================================================
    // 6 bis. LE DÉCALAGE SE MARQUE
    // =====================================================================
    // « Rajoute les points ou les zéros par ligne quand tu décales. » Une
    // place laissée vide se compte mal : on glisse d'un rang et l'on pose le
    // quatre-vingt-quatorze sous les unités.
    const decalages = await Promise.all(['rien', 'point', 'zero'].map(d =>
        plan('47 × 26', { resultat: true, etapes: true, decalage: d })));
    r.egal('sans marque, la place décalée reste vide',
        decalages[0].lignesLues.filter(Boolean), ['47', '×26', '282', '+94', '1222']);
    r.egal('AVEC UN POINT, la place décalée se voit',
        decalages[1].lignesLues.filter(Boolean), ['47', '×26', '282', '+94·', '1222']);
    r.egal('AVEC UN ZÉRO, la ligne devient le vrai produit — quarante-sept fois vingt',
        decalages[2].lignesLues.filter(Boolean), ['47', '×26', '282', '+940', '1222']);
    r.egal('et la marque ne change ni le résultat ni la largeur',
        decalages.map(d => [d.resultat, d.colonnes]),
        [['1222', 5], ['1222', 5], ['1222', 5]]);

    const troisRangs = await plan('47 × 206', { resultat: true, etapes: true, decalage: 'zero' });
    r.egal('deux rangs de décalage donnent deux zéros',
        troisRangs.lignesLues.filter(Boolean), ['47', '×206', '282', '+00', '+9400', '9682']);

    // LA SOMME DES LIGNES RESTE VRAIE, décalage écrit ou non : c'est ce qui
    // dit que les zéros sont à leur place et non posés pour faire joli.
    const sommeDesLignes = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        return ['rien', 'point', 'zero'].map(d => {
            const pl = p.poser('47 × 206', { resultat: true, etapes: true, decalage: d });
            const chiffres = (l) => pl.grains.filter(g => g.r === l && !g.petit && /[0-9]/.test(g.t))
                .sort((a, b) => a.c - b.c);
            const dernier = pl.lignes - 1;
            const finDu = (l) => Math.max(...chiffres(l).map(g => g.c));
            const valeur = (l) => parseInt(chiffres(l).map(g => g.t).join(''), 10);
            let total = 0;
            for (let l = 2; l < dernier; l++) total += valeur(l) * Math.pow(10, finDu(dernier) - finDu(l));
            return [total, valeur(dernier)];
        });
    });
    r.egal('LA SOMME DES LIGNES PARTIELLES EST LE PRODUIT, avec ou sans les marques',
        sommeDesLignes, [[9682, 9682], [9682, 9682], [9682, 9682]]);

    // =====================================================================
    // 6 ter. LA POLICE SE CHOISIT, ET N'ALIGNE RIEN DE TRAVERS
    // =====================================================================
    const polices = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const plan = p.poser('999 + 1', { resultat: true, etapes: true });
        return {
            proposees: p.POLICES.map(o => o.value),
            dessins: p.POLICES.map(o => {
                const s = p.dessiner(plan, '#2d3436', true, o.value);
                const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
                const t = doc.querySelector('text');
                return { famille: t ? t.getAttribute('font-family') : null,
                         malforme: !!doc.querySelector('parsererror'),
                         largeur: doc.documentElement.getAttribute('width') };
            })
        };
    });
    r.egal('les quatre polices de la barre du texte sont proposées, et les mêmes',
        polices.proposees, ['sans-serif', 'serif', 'monospace', "'Comic Sans MS', cursive"]);
    r.verifie('chacune donne un dessin valide qui la porte',
        polices.dessins.every((d, i) => !d.malforme && d.famille === polices.proposees[i]),
        JSON.stringify(polices.dessins));
    // LA COLONNE NE DÉPEND PAS DE LA POLICE : c'est tout l'intérêt d'avoir posé
    // à la colonne plutôt qu'au texte. Les quatre dessins ont la même largeur.
    r.egal('ET LA MISE EN COLONNES NE BOUGE PAS D\'UNE POLICE À L\'AUTRE',
        new Set(polices.dessins.map(d => d.largeur)).size, 1,
        JSON.stringify(polices.dessins.map(d => d.largeur)));

    // Un ancien tampon n'avait que cinq réglages, la couleur en cinquième.
    const ancien = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        return { vieux: p.lireLesReglages(['47 × 26', true, true, '0', '#c0392b']),
                 neuf: p.lireLesReglages(['47 × 26', true, true, '0', 'zero', 'serif', '#c0392b']),
                 vide: p.lireLesReglages() };
    });
    r.egal('UN ANCIEN TAMPON SE ROUVRE SUR SA COULEUR, et non sur un décalage',
        [ancien.vieux.couleur, ancien.vieux.decalage, ancien.vieux.police],
        ['#c0392b', 'rien', 'sans-serif'], JSON.stringify(ancien.vieux));
    r.egal('un tampon neuf se relit à l\'identique',
        [ancien.neuf.couleur, ancien.neuf.decalage, ancien.neuf.police],
        ['#c0392b', 'zero', 'serif']);
    r.egal('et sans rien, le point est la marque par défaut',
        [ancien.vide.decalage, ancien.vide.police, ancien.vide.couleur],
        ['point', 'sans-serif', '#2d3436']);

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
            listes: champs.filter(c => c.tagName === 'SELECT').length,
            apercu: (document.getElementById('custom-prompt-preview') || {}).innerHTML.indexOf('<svg') > -1
        };
    });
    r.verifie('l\'outil a son bouton dans la grille des plugins', ouverture.bouton);
    r.verifie('qui ouvre la boîte de réglages', ouverture.ouverte, JSON.stringify(ouverture));
    r.egal('avec les deux cases demandées — le résultat, et les étapes', ouverture.cases, 2);
    r.egal('et le champ des chiffres après la virgule', ouverture.nombres, 1);
    r.egal('et les deux listes — le décalage et la police', ouverture.listes, 2);
    r.verifie('l\'aperçu montre l\'opération avant de la poser', ouverture.apercu, JSON.stringify(ouverture));

    // L'aperçu suit la frappe, et une saisie fautive s'y explique.
    const apercus = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        return {
            bon: p.apercu(['47 × 26', true, true, '0', 'point', 'serif', '#2d3436']).indexOf('<svg') === 0,
            police: p.apercu(['47 × 26', true, true, '0', 'point', 'serif', '#2d3436']).indexOf('font-family="serif"') > -1,
            mauvais: p.apercu(['bonjour', true, true, '0', 'point', 'serif', '#2d3436'])
        };
    });
    r.verifie('l\'aperçu dessine ce qui se pose', apercus.bon);
    r.verifie('et dans la police choisie', apercus.police);
    r.verifie('et DIT ce qui ne se pose pas, au lieu de rester blanc',
        apercus.mauvais.indexOf('<svg') === -1 && apercus.mauvais.length > 40, apercus.mauvais);

    // ON VALIDE : l'opération ne tombe pas au milieu de l'écran, elle attend
    // qu'on montre où. C'est le geste des autres tampons de la grille.
    const arme = await page.evaluate(async () => {
        images.length = 0;
        const p = PluginManager.plugins['operationPoseeTool'];
        p.currentStamp = null;
        p.construire(['734 ÷ 8', true, false, '2', 'point', 'sans-serif', '#c0392b'], null);
        for (let i = 0; i < 60 && !p.currentStamp; i++) await new Promise(r => setTimeout(r, 50));
        return { arme: !!p.currentStamp, mode: typeof mode !== 'undefined' ? mode : null, rienDePose: images.length,
                 enAttente: typeof hasPendingStamp === 'function' ? hasPendingStamp() : null };
    });
    r.verifie('valider arme un tampon au lieu de poser au hasard',
        arme.arme && arme.rienDePose === 0, JSON.stringify(arme));
    r.egal('le tableau passe dans le mode de cet outil', arme.mode, 'operationPosee');
    r.verifie('et la pastille d\'annulation sait qu\'un tampon attend', arme.enAttente === true);

    const pose = await page.evaluate(() => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const pris = p.onPointerDown({ x: 300, y: 200 });
        const im = images[images.length - 1] || null;
        return { pris, n: images.length, mode: typeof mode !== 'undefined' ? mode : null, encoreArme: !!p.currentStamp,
                 id: im && im.pluginData && im.pluginData.id, args: im && im.pluginData && im.pluginData.args,
                 centre: im ? [Math.round(im.x + im.w / 2), Math.round(im.y + im.h / 2)] : null,
                 l: im ? Math.round(im.w) : 0, h: im ? Math.round(im.h) : 0 };
    });
    r.verifie('un clic pose l\'opération et rend la main', pose.pris && !pose.encoreArme && pose.mode === 'pointer',
        JSON.stringify(pose));
    r.egal('LÀ OÙ L\'ON A CLIQUÉ, et nulle part ailleurs', pose.centre, [300, 200]);
    r.egal('avec ses réglages', [pose.id, pose.args && pose.args[0]], ['operationPoseeTool', '734 ÷ 8']);
    r.verifie('et une taille', pose.l > 60 && pose.h > 30, JSON.stringify(pose));

    // =====================================================================
    // 7 bis. DANS UN CADRE DU DOCUMENT, ELLE LE REMPLIT
    // =====================================================================
    // C'est la même reconnaissance de zones que le remplissage au clavier :
    // un cadre de polycopié est l'endroit où l'opération doit tomber, à la
    // taille du cadre — et le fantôme montre où elle ira AVANT le clic.
    const remplissage = await page.evaluate(async () => {
        const p = PluginManager.plugins['operationPoseeTool'];
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        // Un faux document avec une zone déclarée : on n'a pas besoin d'un vrai
        // PDF pour éprouver la règle, seulement d'une page qui porte des zones.
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#fff"/></svg>');
        await img.decode();
        imageCache[img.src] = img;
        const doc = { id: nextId++, x: 100, y: 100, w: 600, h: 400, cx: 0, cy: 0, cw: 600, ch: 400,
                      src: img.src, z: globalZ++,
                      pluginData: { id: 'pdfDoc', zones: [{ genre: 'cadre', x: 0.1, y: 0.1, l: 0.5, h: 0.25 }] } };
        images.push(doc);
        p.currentStamp = null;
        p.construire(['347 + 258', true, false, '0', 'point', 'sans-serif', '#2d3436'], null);
        for (let i = 0; i < 60 && !p.currentStamp; i++) await new Promise(r => setTimeout(r, 50));
        // UNE ABSENCE SE SIGNALE, elle ne fait pas tomber tout ce qui suit :
        // sans tampon armé, il n'y a rien à viser, et c'est ce qu'on dit.
        if (!p.currentStamp) return { aucunTampon: true };
        const nat = { w: p.currentStamp.w, h: p.currentStamp.h };
        const dedans = { x: 100 + 600 * 0.2, y: 100 + 400 * 0.15 };
        const dehors = { x: 900, y: 600 };
        const viseDedans = p.poseVisee(dedans);
        const viseDehors = p.poseVisee(dehors);
        p.onPointerDown(dedans);
        const im = images[images.length - 1];
        const cadre = { x: 100 + 600 * 0.1, y: 100 + 400 * 0.1, l: 600 * 0.5, h: 400 * 0.25 };
        return {
            nat, cadre,
            cadreVu: !!(viseDedans && viseDedans.cadre),
            cadreHorsZone: !!(viseDehors && viseDehors.cadre),
            // Le fantôme et la pose doivent dire la même chose.
            fantome: viseDedans ? [Math.round(viseDedans.x), Math.round(viseDedans.y),
                                   Math.round(viseDedans.w), Math.round(viseDedans.h)] : null,
            posee: [Math.round(im.x), Math.round(im.y), Math.round(im.w), Math.round(im.h)],
            tient: im.w <= cadre.l && im.h <= cadre.h,
            centre: [Math.round(im.x + im.w / 2), Math.round(im.y + im.h / 2)],
            centreDuCadre: [Math.round(cadre.x + cadre.l / 2), Math.round(cadre.y + cadre.h / 2)],
            proportions: Math.abs((im.w / im.h) - (nat.w / nat.h)) < 0.01
        };
    });
    r.verifie('un cadre du document est reconnu sous le pointeur', remplissage.cadreVu,
        JSON.stringify(remplissage));
    r.verifie('et hors du document il n\'y en a pas', !remplissage.cadreHorsZone);
    r.egal('LE FANTÔME MONTRE EXACTEMENT CE QUE LE CLIC POSERA',
        remplissage.fantome, remplissage.posee);
    r.verifie('l\'opération tient dans le cadre', remplissage.tient, JSON.stringify(remplissage));
    r.egal('et s\'y centre', remplissage.centre, remplissage.centreDuCadre);
    r.verifie('sans se déformer', remplissage.proportions, JSON.stringify(remplissage));

    // UN CADRE TROP PETIT NE SE REMPLIT PAS : une opération réduite de plus de
    // moitié ne se lit plus, et une case de table d'addition fait trente
    // pixels. Mieux vaut la poser entière à côté.
    const troPetit = await page.evaluate(async () => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const src = images[0].src;
        images.length = 0;
        images.push({ id: nextId++, x: 0, y: 0, w: 600, h: 400, cx: 0, cy: 0, cw: 600, ch: 400,
                      src, z: globalZ++,
                      pluginData: { id: 'pdfDoc', zones: [{ genre: 'case', x: 0.1, y: 0.1, l: 0.05, h: 0.05 }] } });
        p.currentStamp = null;
        p.construire(['347 + 258', true, false, '0', 'point', 'sans-serif', '#2d3436'], null);
        for (let i = 0; i < 60 && !p.currentStamp; i++) await new Promise(r => setTimeout(r, 50));
        if (!p.currentStamp) return { aucunTampon: true };
        const v = p.poseVisee({ x: 70, y: 45 });
        p.currentStamp = null;
        return { cadre: !!v.cadre, taille: [Math.round(v.w), Math.round(v.h)] };
    });
    r.verifie('une case trop petite laisse l\'opération entière', !troPetit.cadre,
        JSON.stringify(troPetit));

    // =====================================================================
    // 7 ter. UN OUTIL COMME LES AUTRES : LA BARRE
    // =====================================================================
    const barre = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => x.dataset.pluginId === 'operationPoseeTool');
        const nom = b ? (b.getAttribute('data-tooltip') || b.dataset.libelle || b.title) : null;
        let dansLaBarre = null;
        if (typeof createFloatingToolbar === 'function' && nom) {
            createFloatingToolbar(420, 320, [nom]);
            const barres = document.querySelectorAll('#custom-bars-container .custom-toolbar');
            const derniere = barres[barres.length - 1];
            dansLaBarre = Array.from(derniere.querySelectorAll('.btn'))
                .some(x => (x.getAttribute('data-tooltip') || x.dataset.pluginKey || '') === nom);
        }
        return { nom, cle: b && b.dataset.pluginKey, favori: b && b.dataset.favoriteBound !== undefined,
                 glissable: b && b.dataset.dragGhostBound === 'true', dansLaBarre };
    });
    r.egal('l\'outil porte le même nom partout', [barre.nom, barre.cle],
        ['Opération posée', 'Opération posée'], JSON.stringify(barre));
    r.verifie('il se glisse dans une barre comme les autres', barre.glissable, JSON.stringify(barre));
    r.verifie('ET UNE BARRE FLOTTANTE L\'ACCEPTE', barre.dansLaBarre === true, JSON.stringify(barre));

    // ET IL SE RÉOUVRE SUR SES PROPRES RÉGLAGES : c'est la façon de révéler la
    // solution devant la classe.
    const reedition = await page.evaluate(async () => {
        const p = PluginManager.plugins['operationPoseeTool'];
        images.length = 0;
        p.currentStamp = null;
        p.construire(['734 ÷ 8', true, false, '2', 'zero', 'serif', '#c0392b'], null);
        for (let i = 0; i < 60 && !p.currentStamp; i++) await new Promise(r => setTimeout(r, 50));
        if (p.currentStamp) p.onPointerDown({ x: 400, y: 300 });
        if (!images.length) return { aucunTampon: true };
        p.edit(images[0]);
        const champs = Array.from(document.querySelectorAll('#custom-prompt-inputs input'));
        const listes = Array.from(document.querySelectorAll('#custom-prompt-inputs select'));
        return {
            titre: (document.getElementById('custom-prompt-title') || {}).innerText,
            operation: champs[0] && champs[0].value,
            resultat: champs[1] && champs[1].checked,
            etapes: champs[2] && champs[2].checked,
            decimales: champs[3] && champs[3].value,
            decalage: listes[0] && listes[0].value,
            police: listes[1] && listes[1].value
        };
    });
    r.egal('la réédition retrouve l\'opération, ses cases et ses décimales',
        [reedition.operation, reedition.resultat, reedition.etapes, reedition.decimales],
        ['734 ÷ 8', true, false, '2'], JSON.stringify(reedition));
    r.egal('et aussi son décalage et sa police', [reedition.decalage, reedition.police],
        ['zero', 'serif'], JSON.stringify(reedition));
    r.verifie('et elle le dit dans son titre', /Modifier/.test(reedition.titre || ''), reedition.titre);

    // Révéler les étapes remplace le dessin SUR PLACE : même objet, même coin.
    const revele = await page.evaluate(async () => {
        const p = PluginManager.plugins['operationPoseeTool'];
        const centre = (im) => [Math.round(im.x + im.w / 2), Math.round(im.y + im.h / 2)];
        const avant = { n: images.length, src: images[0].src, centre: centre(images[0]), h: images[0].h };
        p.construire(['734 ÷ 8', true, true, '2', 'zero', 'serif', '#c0392b'], images[0]);
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
