// L'ARBRE DE CALCUL
//
// « Savez-vous où je peux trouver ces types d'arbres de calculs éditables,
// avant que je ne me lance sur leur fabrication chronophage ? » — « Tu pourrais
// me faire un plugin qui crée cela. Facile pratique avec undo redo. »
//
// CE CHAPITRE MESURE UN PLAN, PAS UNE IMAGE. Un arbre de calcul est juste ou
// faux pour deux raisons seulement : les nombres qu'il affiche, et la place de
// chaque case. Le greffon rend donc un PLAN — une liste de nœuds avec leur
// rang, leur abscisse et leur valeur — et c'est ce plan qu'on interroge.
// Comparer des pixels dirait « ça ressemble à un arbre » ; lire les rangs dit
// « le −0,4 attend sur la même rangée que le produit, pas une de plus ».
//
// TROIS MESURES PORTENT LE RESTE.
//
//   — LES DEUX ARBRES DU MANUEL, au chiffre et au rang près. Ce sont eux qu'on
//     a sous les yeux ; s'ils sortent justes, la mécanique tient.
//   — LES NOMBRES SONT EXACTS, et cela se mesure sur le RAPPORT GARDÉ, pas sur
//     le texte affiché. L'arrondi du rendu rattrape à lui seul une erreur
//     flottante de 1e−16 : le banc de sabotage l'a prouvé en remplaçant toute
//     l'arithmétique par des flottants sans qu'un seul caractère de « 2,6 »
//     bouge. Ce qui tient vraiment, c'est « treize cinquièmes », et la fraction
//     rendue quand le quotient ne tombe pas juste.
//   — ET LA CASE DE RÉSULTAT NE DIT PAS LA LONGUEUR DE SA RÉPONSE. Mesurée sur
//     son texte, elle serait large pour « −10,5 » et étroite pour « 3 » :
//     l'élève lirait la réponse dans la taille du rectangle.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport("L'arbre de calcul");
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 860 } });
    await page.waitForFunction(
        () => window.PluginManager && PluginManager.plugins['arbreDeCalculTool'], { timeout: 20000 });
    await tableauVierge(page);

    // Le plan d'un arbre, plus de quoi l'interroger.
    //
    // UN REFUS DOIT FAIRE TOMBER UNE VÉRIFICATION, PAS PLANTER LE CHAPITRE.
    // « run.cjs » enveloppe le chapitre dans un try/catch : une exception y
    // compte « 1 échec sur 1 » et toutes les vérifications disparaissent — on
    // lirait « le test a planté » au lieu de lire CE QUI est cassé. On rend donc
    // la forme COMPLÈTE sur un refus, et chaque mesure tombe en se nommant.
    const plan = (txt) => page.evaluate((t) => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const plan = p.poser(t);
        if (plan.erreur) return { erreur: plan.erreur, noeuds: [], resultat: null, hauteur: null, l: 0, h: 0 };
        return {
            resultat: plan.resultat, hauteur: plan.hauteur,
            // LA VALEUR BRUTE DE LA RÉPONSE, telle qu'elle est gardée : c'est
            // la seule façon de mesurer l'arithmétique elle-même, et non le
            // rendu qui la rattrape.
            rapport: plan.racine && plan.racine.valeur
                ? [plan.racine.valeur.n, plan.racine.valeur.d] : null,
            l: Math.round(plan.l), h: Math.round(plan.h),
            noeuds: plan.noeuds.map(n => ({
                op: n.op || null, texte: n.texte, rang: n.rang,
                cx: Math.round(n.cx), l: Math.round(n.l)
            }))
        };
    }, txt);

    // Le rang d'un nœud qu'on désigne par ce qu'il porte.
    const rangDe = (p, texte) => {
        const n = (p.noeuds || []).find(k => k.texte === texte);
        return n ? n.rang : null;
    };

    // =====================================================================
    // 1. LIRE LE CALCUL
    // =====================================================================
    // LE VOCABULAIRE EST CELUI DE L'OPÉRATION POSÉE, et c'est une seule table
    // pour les deux outils. Deux tables jumelles auraient divergé au premier
    // signe ajouté, et le professeur aurait eu un outil qui comprend « 2x3 » et
    // un autre qui le refuse — sans rien pour le lui dire.
    const signes = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        return ['2 + 3', '2-3', '2 − 3', '2 x 3', '2X3', '2 × 3', '2*3',
                '2 / 3', '2:3', '2 ÷ 3', '2 + 3 =', '  2 + 3  ']
            .map(t => { const a = p.analyser(t); return a.erreur || (a.noeud && a.noeud.op); });
    });
    r.egal('tout ce qui s\'écrit « plus », « moins », « fois » et « divisé par » est compris',
        signes, ['+', '−', '−', '×', '×', '×', '×', '÷', '÷', '÷', '+', '+']);
    // ON NE DÉRÉFÉRENCE PAS CE QUI PEUT MANQUER. « analyser » rend « noeud » ou
    // « erreur », jamais les deux : écrit « .noeud.op » tout cru, ce contrôle
    // levait une exception dès que la lecture cassait — et « run.cjs » compte
    // alors « 1 échec sur 1 », les cinquante-sept vérifications évanouies. On
    // lisait « le test a planté » au lieu de lire CE QUI est cassé. Mesuré sur
    // deux sabotages du banc, qui devaient tomber et qui emportaient tout.
    const partagee = await page.evaluate(() => {
        const a = PluginManager.plugins['arbreDeCalculTool'].analyser('2 x 3');
        const b = PluginManager.plugins['operationPoseeTool'].SIGNES;
        return { lu: (a.noeud && a.noeud.op) || a.erreur || null, attendu: b && b['x'] };
    });
    r.egal('ET C\'EST LA MÊME TABLE QUE L\'OPÉRATION POSÉE, pas une jumelle',
        partagee.lu, partagee.attendu, JSON.stringify(partagee));

    const nombres = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const t = (x) => { const n = p.lireUnNombre(x); return n ? p.enTexte(n) : null; };
        return { entier: t('347'), virgule: t('12,5'), point: t('12.5'),
                 espaces: t('1 234'), lettres: t('12a'), vide: t('') };
    });
    r.egal('un nombre se lit avec sa virgule, son point ou ses espaces de milliers',
        [nombres.entier, nombres.virgule, nombres.point, nombres.espaces],
        ['347', '12,5', '12,5', '1234']);
    r.egal('et ce qui n\'est pas un nombre est refusé proprement',
        [nombres.lettres, nombres.vide], [null, null]);

    // CE QUI NE SE POSE PAS SE DIT, ET LE DIT PRÉCISÉMENT. Un aperçu vide
    // laisserait croire que l'outil est cassé ; chaque refus nomme ce qui
    // cloche, pour qu'on corrige sans deviner.
    const refus = {
        vide: await plan(''),
        parenthese: await plan('(2 + 3'),
        deTrop: await plan('2 + 3)'),
        moinsSurParenthese: await plan('−(3 + 2)'),
        zero: await plan('5 ÷ 0'),
        lettres: await plan('2 + a'),
        coupe: await plan('2 +')
    };
    r.verifie('une parenthèse qui manque se dit', /parenthèse fermante/.test(refus.parenthese.erreur || ''),
        refus.parenthese.erreur);
    r.verifie('une parenthèse de trop aussi', !!refus.deTrop.erreur, refus.deTrop.erreur);
    r.verifie('on ne divise pas par zéro', /z.ro/i.test(refus.zero.erreur || ''), refus.zero.erreur);
    r.verifie('ce qui n\'est pas un nombre est nommé', /n.est pas un nombre/.test(refus.lettres.erreur || ''),
        refus.lettres.erreur);
    r.verifie('un calcul qui s\'arrête au milieu le dit', !!refus.coupe.erreur, refus.coupe.erreur);
    r.verifie('et un calcul vide propose un exemple', /par exemple/.test(refus.vide.erreur || ''),
        refus.vide.erreur);
    // UN MOINS NE PORTE QUE SUR UN NOMBRE, et c'est une limite VOULUE : « −5 »
    // est une case de l'arbre, tandis que « −(3 + 2) » est une opération de plus
    // qui n'a pas de case où se dessiner. On le dit au lieu de deviner.
    r.verifie('UN MOINS NE PORTE QUE SUR UN NOMBRE, et le refus explique quoi écrire',
        /moins/i.test(refus.moinsSurParenthese.erreur || '')
        && /0 −/.test(refus.moinsSurParenthese.erreur || ''),
        refus.moinsSurParenthese.erreur);

    // =====================================================================
    // 2. LES DEUX ARBRES DU MANUEL
    // =====================================================================
    // « (−0,6 × −5) + (−0,4) » multiplié par « −8 − 2 ». Le cœur de la mesure
    // n'est pas le résultat mais LES RANGS : chaque nœud tombe d'un cran sous
    // ses enfants, si bien que « −0,4 » se pose sur la même rangée que le
    // produit qu'il attend — et non tout en haut avec les autres nombres.
    const a = await plan('((−0,6 × −5) + −0,4) × (−8 − 2)');
    r.egal('l\'arbre du manuel donne moins vingt-six', a.resultat, '−26', JSON.stringify(a.noeuds));
    r.egal('il a quatre rangées', a.hauteur, 3, JSON.stringify(a.noeuds));
    r.egal('LES DEUX PREMIERS NOMBRES SONT SEULS EN HAUT',
        [rangDe(a, '−0,6'), rangDe(a, '−5')], [0, 0], JSON.stringify(a.noeuds));
    r.egal('ET « −0,4 » ATTEND SUR LA RANGÉE DU PRODUIT QU\'IL SERT, pas tout en haut',
        [rangDe(a, '−0,4'), rangDe(a, '3')], [1, 1], JSON.stringify(a.noeuds));
    r.egal('« −8 » et « 2 » aussi, puisqu\'ils servent un cran plus bas',
        [rangDe(a, '−8'), rangDe(a, '2')], [1, 1], JSON.stringify(a.noeuds));
    r.egal('les deux sommes se rejoignent au rang suivant',
        [rangDe(a, '2,6'), rangDe(a, '−10')], [2, 2], JSON.stringify(a.noeuds));
    r.egal('et la réponse est tout en bas', rangDe(a, '−26'), 3, JSON.stringify(a.noeuds));

    const b = await plan('((−7 − −3) × −0,8) ÷ (−5,5 + −10,5)');
    r.egal('le second arbre du manuel donne moins zéro virgule deux', b.resultat, '−0,2',
        JSON.stringify(b.noeuds));
    r.egal('avec ses quatre étapes justes',
        ['−4', '3,2', '−16', '−0,2'].map(t => rangDe(b, t)), [1, 2, 2, 3],
        JSON.stringify(b.noeuds));

    // LES PRIORITÉS DU COLLÈGE FONT L'ARBRE QUAND ON NE PARENTHÈSE PAS. C'est la
    // matière même de l'exercice — « écrire l'expression en ligne
    // correspondante » —, donc l'outil doit lire comme on écrit.
    const sansParentheses = await plan('2 + 3 × 4');
    r.egal('« 2 + 3 × 4 » vaut quatorze, pas vingt', sansParentheses.resultat, '14',
        JSON.stringify(sansParentheses.noeuds));
    r.egal('et le produit se fait AVANT, donc un rang plus haut',
        [rangDe(sansParentheses, '12'), rangDe(sansParentheses, '14')], [1, 2],
        JSON.stringify(sansParentheses.noeuds));
    const avecParentheses = await plan('(2 + 3) × 4');
    r.egal('LES PARENTHÈSES CHANGENT L\'ARBRE, et c\'est tout l\'intérêt',
        avecParentheses.resultat, '20', JSON.stringify(avecParentheses.noeuds));
    r.egal('le quatre attend alors la somme, au lieu de la précéder',
        [rangDe(avecParentheses, '4'), rangDe(avecParentheses, '5')], [1, 1],
        JSON.stringify(avecParentheses.noeuds));

    // =====================================================================
    // 3. LES NOMBRES SONT EXACTS
    // =====================================================================
    // EN VIRGULE FLOTTANTE, « 3 + (−0,4) » VAUT 2,5999999999999996. L'outil
    // travaille donc en fractions d'entiers.
    //
    // ET L'ON MESURE LE RAPPORT, PAS SEULEMENT CE QUI S'AFFICHE — c'est le banc
    // de sabotage qui l'a exigé. J'avais écrit que la comparaison des textes
    // était « le contrôle le plus important du chapitre » : c'était faux, et le
    // sabotage l'a dit en passant VERT. L'arrondi de l'affichage rattrape à lui
    // seul une erreur de l'ordre de 1e−16 : remplacer toute l'arithmétique par
    // des flottants ne changeait pas un caractère de « 2,6 ».
    //
    // Ce que les textes tiennent, c'est donc le RENDU — la virgule, le signe,
    // l'absence de zéro de politesse. Ce qui tient l'arithmétique, ce sont les
    // deux mesures d'en dessous : le rapport gardé, et la fraction.
    const exacts = {};
    for (const [cle, calcul] of [['decimal', '(−0,6 × −5) + −0,4'], ['dixiemes', '0,1 + 0,2'],
                                 ['entier', '−8 ÷ 2'], ['centiemes', '0,07 × 100'],
                                 ['tiers', '1 ÷ 3'], ['neuvieme', '1 ÷ 9']]) {
        exacts[cle] = (await plan(calcul)).resultat;
    }
    r.egal('trois plus moins zéro virgule quatre font deux virgule six, et rien d\'autre',
        exacts.decimal, '2,6');
    // LE RAPPORT GARDÉ EST EXACT, ET RÉDUIT. C'est ici que l'arithmétique se
    // mesure : treize cinquièmes, et non deux millions cinq cent quatre-vingt-
    // dix-neuf mille neuf cent quatre-vingt-dix-neuf virgule neuf millionièmes.
    const rapports = {};
    for (const [cle, calcul] of [['decimal', '(−0,6 × −5) + −0,4'], ['dixiemes', '0,1 + 0,2'],
                                 ['tiers', '1 ÷ 3']]) {
        rapports[cle] = (await plan(calcul)).rapport;
    }
    r.egal('LA RÉPONSE EST GARDÉE COMME UN RAPPORT EXACT ET RÉDUIT, pas comme un flottant',
        [rapports.decimal, rapports.dixiemes, rapports.tiers],
        [[13, 5], [3, 10], [1, 3]], JSON.stringify(rapports));
    r.egal('un dixième et deux dixièmes font trois dixièmes', exacts.dixiemes, '0,3');
    r.egal('et un entier s\'écrit sans virgule de politesse', [exacts.entier, exacts.centiemes],
        ['−4', '7']);
    // ET CE QUI N'EST PAS DÉCIMAL S'ÉCRIT EN FRACTION. Afficher « 0,333 »
    // enseignerait un arrondi sous couvert d'un résultat ; la fraction est la
    // réponse juste, et c'est celle qu'un élève doit voir.
    r.egal('UN QUOTIENT QUI NE TOMBE PAS JUSTE S\'ÉCRIT EN FRACTION, pas en arrondi',
        [exacts.tiers, exacts.neuvieme], ['1/3', '1/9']);

    // =====================================================================
    // 4. CE QUI SE DESSINE
    // =====================================================================
    const dessin = (reglages, calcul) => page.evaluate(([g, c]) => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const base = { cases: '#bcd9f0', encre: '#2d3436', police: 'sans-serif',
                       etapes: false, resultat: false };
        const plan = p.poser(c || '((−0,6 × −5) + −0,4) × (−8 − 2)');
        // UN REFUS NE DOIT PAS FAIRE EXPLOSER LA SONDE. « poser » rend un plan
        // OU une erreur, et « dessiner » ne sait pas dessiner une erreur : sans
        // cette garde, un sabotage de la lecture emportait le chapitre entier
        // au lieu de faire tomber les lignes qu'il casse.
        if (plan.erreur) {
            return { erreur: plan.erreur, textes: [], rouge: 0, rects: 0, bulles: 0,
                     pointes: 0, commenceParSvg: false, finitParSvg: false };
        }
        const svg = p.dessiner(plan, Object.assign(base, g), true);
        // Ce qui est ÉCRIT dans le dessin, et non ce qu'on y a mis : les
        // textes des cases, et les signes des bulles.
        const textes = (svg.match(/>([^<>]+)<\/text>/g) || []).map(m => m.slice(1, -7));
        return {
            textes,
            rouge: (svg.match(/fill="#e03131"/g) || []).length,
            rects: (svg.match(/<rect /g) || []).length,
            bulles: (svg.match(/<circle /g) || []).length,
            pointes: (svg.match(/<polygon /g) || []).length,
            commenceParSvg: svg.indexOf('<svg xmlns="http://www.w3.org/2000/svg"') === 0,
            finitParSvg: svg.slice(-6) === '</svg>'
        };
    }, [reglages, calcul]);

    const nu = await dessin({});
    r.verifie('le dessin est un SVG complet, autonome',
        nu.commenceParSvg && nu.finitParSvg, JSON.stringify(nu));
    r.egal('neuf cases, quatre bulles', [nu.rects, nu.bulles], [9, 4], JSON.stringify(nu));
    r.egal('UNE SEULE CASE ROUGE, celle de la réponse', nu.rouge, 1, JSON.stringify(nu));
    // CHAQUE BULLE A SES TROIS FLÈCHES : deux qui entrent, une qui sort. C'est
    // ce qui fait lire l'arbre dans le bon sens, du haut vers le bas.
    r.egal('et chaque bulle porte ses trois flèches', nu.pointes, 12, JSON.stringify(nu));
    // ARBRE NU : seuls les nombres de départ sont écrits, sinon ce ne serait
    // plus un exercice. Cinq nombres, quatre signes, aucun résultat.
    r.egal('ARBRE NU, LES RÉSULTATS NE SONT PAS ÉCRITS',
        nu.textes.sort(), ['+', '2', '×', '×', '−', '−0,4', '−0,6', '−5', '−8'].sort(),
        JSON.stringify(nu.textes));

    const rempli = await dessin({ etapes: true, resultat: true });
    r.verifie('ET REMPLI, CHAQUE CASE PORTE SA VALEUR',
        ['3', '2,6', '−10', '−26'].every(t => rempli.textes.includes(t)),
        JSON.stringify(rempli.textes));
    const seulementLaFin = await dessin({ resultat: true });
    r.verifie('on peut ne révéler que la réponse, pour la corriger d\'un coup',
        seulementLaFin.textes.includes('−26') && !seulementLaFin.textes.includes('2,6'),
        JSON.stringify(seulementLaFin.textes));

    // UNE CASE DE RÉSULTAT NE DIT PAS LA LONGUEUR DE SA RÉPONSE, et la mise en
    // page ne bouge pas quand on coche « remplir ». Les deux tiennent par la
    // même mesure : la largeur des cases ne dépend pas de ce qu'on montre.
    // LE DÉCOR DOIT DISCRIMINER, et le mien ne le faisait pas : j'avais pris un
    // arbre dont toutes les réponses tenaient en un chiffre, si bien qu'elles
    // avaient la même largeur AVEC OU SANS la règle. Le sabotage passait vert.
    // Il faut donc des réponses de longueurs DIFFÉRENTES dans le même arbre —
    // « 2 » d'un côté, « 4000 » de l'autre.
    const largeurs = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const inegal = p.poser('(1 + 1) × (2000 + 2000)');
        const long = p.poser('(1 + 1) × (1000,25 + 1000,25)');
        const resultat = (plan) => (plan.noeuds || []).filter(n => n.op)
            .map(n => ({ texte: n.texte, l: Math.round(n.l) }));
        return { inegal: resultat(inegal), long: resultat(long) };
    });
    r.verifie('la mesure discrimine : les réponses de cet arbre n\'ont pas la même longueur',
        new Set(largeurs.inegal.map(n => n.texte.length)).size > 1, JSON.stringify(largeurs.inegal));
    r.egal('LES CASES DE RÉSULTAT ONT TOUTES LA MÊME LARGEUR, « 2 » comme « 4000 »',
        new Set(largeurs.inegal.map(n => n.l)).size, 1, JSON.stringify(largeurs.inegal));
    r.verifie('et une réponse qui déborde élargit sa case au lieu d\'être rognée',
        Math.max(...largeurs.long.map(n => n.l)) > Math.max(...largeurs.inegal.map(n => n.l)),
        JSON.stringify(largeurs));

    // LA BULLE EST DE LA FAMILLE DE SES CASES, ET SON SIGNE S'Y LIT. Les deux
    // vont ensemble : relever la saturation sans condition donnait une bulle
    // ROUGE sur des cases blanches — la teinte vaut zéro quand il n'y a pas de
    // couleur, et zéro est le rouge. Et sur une famille jaune, la bulle sort
    // claire : le signe blanc y disparaissait.
    const couleurs = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const lum = (hex) => {
            const c = String(hex).slice(1);
            const [x, y, z] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
            return (x * 299 + y * 587 + z * 114) / 1000;
        };
        const teinte = (hex) => {
            const c = String(hex).slice(1);
            const [x, y, z] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
            const hi = Math.max(x, y, z), lo = Math.min(x, y, z), d = hi - lo;
            if (!d) return null;
            if (hi === x) return (((y - z) / d + (y < z ? 6 : 0)) / 6 + 1) % 1;
            if (hi === y) return ((z - x) / d + 2) / 6;
            return ((x - y) / d + 4) / 6;
        };
        // ON LIT LE DESSIN, PAS LA FONCTION QUI CHOISIT LA COULEUR. Interroger
        // « encrePosee » directement laissait passer un « dessiner » qui ne
        // l'appellerait pas : mesuré au banc, le sabotage « signe toujours
        // blanc » ne faisait rien tomber. On extrait donc du SVG la couleur de
        // la bulle ET celle du signe qu'elle porte.
        return ['#bcd9f0', '#ffe38d', '#ffcaea', '#ffffff', '#333333'].map(c => {
            const plan = p.poser('2 + 3');
            const svg = plan.erreur ? '' : p.dessiner(plan,
                { cases: c, encre: '#2d3436', police: 'sans-serif', etapes: true, resultat: true }, true);
            const laBulle = (svg.match(/<circle[^>]*fill="(#[0-9a-f]{6})"/i) || [])[1];
            const leSigne = (svg.match(/font-weight="700"[^>]*fill="(#[0-9a-f]{6})"/i) || [])[1];
            return { case: c, bulle: laBulle, signe: leSigne,
                     memeTeinte: !laBulle ? false : (teinte(c) === null ? teinte(laBulle) === null
                        : Math.abs((teinte(laBulle) || 0) - teinte(c)) < 0.03),
                     contraste: (laBulle && leSigne) ? Math.round(Math.abs(lum(laBulle) - lum(leSigne))) : 0 };
        });
    });
    r.verifie('LA BULLE GARDE LA TEINTE DE SES CASES, et une case sans couleur n\'en reçoit pas une',
        couleurs.every(c => c.memeTeinte), JSON.stringify(couleurs));
    r.verifie('ET LE SIGNE SE LIT SUR ELLE, quelle que soit la famille choisie',
        couleurs.every(c => c.contraste >= 90), JSON.stringify(couleurs));

    // =====================================================================
    // 5. UN OUTIL COMME LES AUTRES
    // =====================================================================
    const barre = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => x.dataset.pluginId === 'arbreDeCalculTool');
        const nom = b ? (b.getAttribute('data-tooltip') || b.dataset.libelle || b.title) : null;
        let dansLaBarre = null;
        if (typeof createFloatingToolbar === 'function' && nom) {
            createFloatingToolbar(420, 320, [nom]);
            const barres = document.querySelectorAll('#custom-bars-container .custom-toolbar');
            const derniere = barres[barres.length - 1];
            dansLaBarre = Array.from(derniere.querySelectorAll('.btn'))
                .some(x => (x.getAttribute('data-tooltip') || x.dataset.pluginKey || '') === nom);
        }
        return { nom, cle: b && b.dataset.pluginKey,
                 glissable: b && b.dataset.dragGhostBound === 'true', dansLaBarre };
    });
    r.egal('l\'outil porte le même nom partout', [barre.nom, barre.cle],
        ['Arbre de calcul', 'Arbre de calcul'], JSON.stringify(barre));
    r.verifie('il se glisse dans une barre comme les autres', barre.glissable, JSON.stringify(barre));
    r.verifie('ET UNE BARRE FLOTTANTE L\'ACCEPTE', barre.dansLaBarre === true, JSON.stringify(barre));

    // ON POSE, ON ANNULE, ON REFAIT. « Facile pratique avec undo redo » : le
    // tampon doit entrer dans l'historique du tableau comme n'importe quel
    // objet, sinon un arbre posé par erreur ne se reprend pas.
    const poser = await page.evaluate(async () => {
        images.length = 0;
        if (typeof saveState === 'function') saveState();
        const avant = images.length;
        PluginManager.plugins['arbreDeCalculTool'].construire(
            ['(2 + 3) × 4', true, true, '#bcd9f0', '#2d3436', 'serif'], null);
        for (let i = 0; i < 80 && images.length === avant; i++) await new Promise(k => setTimeout(k, 50));
        const attendue = PluginManager.plugins['arbreDeCalculTool'].poser('(2 + 3) × 4');
        if (attendue.erreur) return { avant, refus: attendue.erreur,
            pose: { n: images.length, id: null, args: null, taille: null, voulue: null },
            apresAnnuler: null, apresRefaire: null };
        const pose = { n: images.length, id: images[0] && images[0].pluginData && images[0].pluginData.id,
                       args: images[0] && images[0].pluginData && images[0].pluginData.args,
                       taille: images[0] ? [Math.round(images[0].w), Math.round(images[0].h)] : null,
                       voulue: [Math.round(attendue.l), Math.round(attendue.h)] };
        undo();
        const apresAnnuler = images.length;
        redo();
        return { avant, pose, apresAnnuler, apresRefaire: images.length };
    });
    r.egal('UN CLIC POSE L\'ARBRE SUR LE TABLEAU', poser.pose.n, 1, JSON.stringify(poser));
    r.egal('et il sait de quel outil il vient', poser.pose.id, 'arbreDeCalculTool',
        JSON.stringify(poser.pose));
    // IL ARRIVE À LA TAILLE DE SON DESSIN, et c'est un piège nommé :
    // « createStampFromSVG » lit « img.naturalWidth », donc une racine SVG qui
    // n'aurait que son « viewBox » sortirait le tampon à 300 × 150 — la taille
    // par défaut d'une image sans dimensions. Rien d'autre ne le dirait : le
    // dessin serait juste, simplement écrasé.
    r.egal('ET IL ARRIVE À LA TAILLE DE SON DESSIN, pas à celle d\'une image sans dimensions',
        poser.pose.taille, poser.pose.voulue, JSON.stringify(poser.pose));
    r.egal('ANNULER LE RETIRE', poser.apresAnnuler, 0, JSON.stringify(poser));
    r.egal('ET REFAIRE LE REMET', poser.apresRefaire, 1, JSON.stringify(poser));

    // ET IL SE RÉOUVRE SUR SES PROPRES RÉGLAGES : c'est la façon de poser
    // l'arbre nu devant la classe, de le faire chercher, puis de révéler les
    // cases sans rien retaper.
    const reedition = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        // RIEN À ROUVRIR N'EST PAS UNE EXCEPTION, C'EST UN ÉCHEC. Si la pose
        // d'au-dessus n'a rien donné — ce qui arrive dès qu'on casse la lecture
        // du calcul —, « images[0] » est absent et « edit » explosait, emportant
        // le chapitre. On rend une forme vide : les lignes d'en dessous tombent
        // alors chacune en se nommant.
        if (!images.length) return { rien: true, titre: null, calcul: null,
                                     etapes: null, resultat: null, police: null, etiquettes: [] };
        p.edit(images[0]);
        const champs = Array.from(document.querySelectorAll('#custom-prompt-inputs input'));
        const listes = Array.from(document.querySelectorAll('#custom-prompt-inputs select'));
        const etiquettes = Array.from(document.querySelectorAll('#custom-prompt-inputs label, #custom-prompt-inputs .prompt-label'))
            .map(e => e.textContent.trim());
        return {
            titre: (document.getElementById('custom-prompt-title') || {}).innerText,
            calcul: champs[0] && champs[0].value,
            etapes: champs[1] && champs[1].checked,
            resultat: champs[2] && champs[2].checked,
            police: listes[0] && listes[0].value,
            etiquettes
        };
    });
    r.egal('la réédition retrouve le calcul et ses deux cases',
        [reedition.calcul, reedition.etapes, reedition.resultat],
        ['(2 + 3) × 4', true, true], JSON.stringify(reedition));
    r.egal('et aussi sa police', reedition.police, 'serif', JSON.stringify(reedition));
    r.verifie('et elle le dit dans son titre', /Modifier/.test(reedition.titre || ''), reedition.titre);
    // L'ÉTIQUETTE DIT CE QUI FAIT L'ARBRE. Le champ s'ouvre toujours REMPLI,
    // donc son fantôme ne paraît jamais : une indication mise là n'existerait
    // pour personne. C'est la leçon de l'opération posée, où l'erreur a été
    // commise puis mesurée.
    r.verifie('LA BOÎTE DIT QUE LES PARENTHÈSES FONT L\'ARBRE, dans une étiquette',
        reedition.etiquettes.some(e => /parenth/i.test(e)), JSON.stringify(reedition.etiquettes));
    r.verifie('et le champ s\'ouvre REMPLI — c\'est pourquoi son fantôme ne pouvait pas l\'annoncer',
        !!reedition.calcul && reedition.calcul.length > 0, JSON.stringify(reedition));

    // RÉVÉLER LES CASES REMPLACE LE DESSIN SUR PLACE : même objet, même coin.
    const revele = await page.evaluate(async () => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const centre = (im) => [Math.round(im.x + im.w / 2), Math.round(im.y + im.h / 2)];
        if (!images.length) return { rien: true, avant: { n: 0, src: null, centre: null },
                                     apres: { n: 0, change: false, centre: null, etapes: null } };
        const avant = { n: images.length, src: images[0].src, centre: centre(images[0]) };
        p.construire(['(2 + 3) × 4', false, false, '#bcd9f0', '#2d3436', 'serif'], images[0]);
        for (let i = 0; i < 80 && images[0].src === avant.src; i++) await new Promise(k => setTimeout(k, 50));
        return { avant, apres: { n: images.length, change: images[0].src !== avant.src,
                                 centre: centre(images[0]),
                                 etapes: images[0].pluginData.args[1] } };
    });
    r.egal('cacher les cases ne pose PAS un second arbre', revele.apres.n, revele.avant.n,
        JSON.stringify(revele));
    r.verifie('mais remplace le dessin du premier', revele.apres.change, JSON.stringify(revele));
    r.egal('sans le déplacer', revele.apres.centre, revele.avant.centre, JSON.stringify(revele));
    r.egal('et le réglage part avec lui', revele.apres.etapes, false, JSON.stringify(revele));

    // =====================================================================
    // 6. L'APERÇU EST UN ÉDITEUR DE BLOCS
    //
    // « C'est pas pratique, il faudrait deux icônes, on drag-drop des blocs pour
    // les nombres et les opérations, et on a une icône relier, une icône
    // sélectionner pour l'alignement, on peut choisir la bordure des blocs et
    // leur arrondi. »
    //
    // L'ÉDITEUR D'AVANT PARTAIT D'UN ARBRE DÉJÀ FAIT : ses gestes ne savaient
    // que le défaire ou en réunir les morceaux. On ne pouvait pas POSER une case
    // à l'endroit voulu, ni laisser un trou — c'est pourtant ainsi qu'on
    // fabrique un exercice.
    //
    // CE QUE CES LIGNES TIENNENT : les deux sources posent un bloc là où on le
    // lâche ET au simple clic ; relier dit ce qu'il refuse, phrase par phrase ;
    // choisir déplace, encadre et aligne ; la bordure et l'arrondi se voient
    // dans le tampon ; et la DISPOSITION voyage avec lui, sans quoi la rouvrir
    // perdrait tout alignement fait à la main.
    // =====================================================================
    await page.evaluate(() => { images.length = 0; });

    const ouvrirSur = (ligne) => page.evaluate((l) => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [], liens: [] };
        p.selection = []; p.relierDepuis = null; p.outil = 'choisir';
        p.derniereLigneEcrite = null; p.erreurCourante = null;
        p.ouvrir([l, false, false, '#bcd9f0', '#2d3436', 'sans-serif']);
    }, ligne);

    const etatDeLEditeur = () => page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const b = document.getElementById('custom-prompt-modal');
        const champ = document.querySelector('#custom-prompt-inputs input.prompt-input');
        const ap = document.getElementById('custom-prompt-preview');
        const zone = document.querySelector('#arbre-zone');
        const r = (e) => e ? e.getBoundingClientRect() : null;
        const rb = r(b), ra = r(ap), rz = r(zone);
        const rr = r(document.getElementById('custom-prompt-inputs'));
        const dit = (k) => k.genre === 'operation' ? k.op : k.texte;
        return {
            blocs: p.graphe.blocs.map(dit),
            liens: p.graphe.liens.map(l => {
                const d = p.graphe.blocs.find(k => k.id === l.de);
                const v = p.graphe.blocs.find(k => k.id === l.vers);
                return (d ? dit(d) : '?') + '→' + (v ? dit(v) : '?');
            }).sort(),
            ligne: p.laLigneDuGraphe(),
            champ: champ && champ.value,
            choisis: p.graphe.blocs.filter(k => p.selection.indexOf(k.id) >= 0).map(dit).sort(),
            outil: p.outil,
            large: !!b && b.classList.contains('boite-large'),
            largeurBoite: rb ? Math.round(rb.width) : null,
            // L'APERÇU EST-IL À DROITE DES RÉGLAGES ? On le compare AUX RÉGLAGES
            // et non au milieu de la boîte : leur colonne fait 300 px d'une
            // boîte de 920, donc son bord droit tombe bien avant le milieu —
            // mesurer là disait « non » alors que l'aperçu était à droite.
            apercuADroite: !!(ra && rr) && ra.x >= rr.x + rr.width - 1,
            apercuHaut: ra ? Math.round(ra.height) : null,
            poignees: document.querySelectorAll('#arbre-zone .bloc').length,
            coupes: document.querySelectorAll('#arbre-zone .coupe').length,
            dessin: !!document.querySelector('#arbre-zone svg'),
            // LE CHANTIER TIENT-IL DANS LA ZONE ? « On voit mal l'arbre en
            // entier » était la plainte : on mesure donc que rien ne déborde.
            deborde: !!rz && Array.from(document.querySelectorAll('#arbre-zone .bloc')).some(k => {
                const q = k.getBoundingClientRect();
                return q.right > rz.right + 1 || q.bottom > rz.bottom + 1;
            })
        };
    });

    // La boîte d'un élément, relue JUSTE AVANT chaque geste : la fenêtre se
    // recentre quand son contenu change de taille, et une mesure prise trois
    // gestes plus tôt viserait à côté.
    const boiteDe = (sel) => page.evaluate((s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: q.x, y: q.y, w: q.width, h: q.height };
    }, sel);

    const echelle = () => page.evaluate(
        () => PluginManager.plugins['arbreDeCalculTool'].echelleDuGraphe || 1);

    await ouvrirSur('((−0,6 × −5) + −0,4) × (−8 − 2)');
    await page.waitForTimeout(300);
    const ouvert = await etatDeLEditeur();
    r.verifie('LA BOÎTE S\'ÉLARGIT pour cet outil', ouvert.large === true && ouvert.largeurBoite > 700,
        JSON.stringify({ large: ouvert.large, largeur: ouvert.largeurBoite }));
    r.verifie('ET L\'APERÇU PASSE À DROITE DES RÉGLAGES', ouvert.apercuADroite === true,
        JSON.stringify({ aDroite: ouvert.apercuADroite, largeur: ouvert.largeurBoite }));
    r.verifie('il est assez haut pour un arbre de quatre rangées — il faisait 140 px',
        ouvert.apercuHaut >= 400, String(ouvert.apercuHaut));
    // TAPER RESTE LA FAÇON RAPIDE D'AVOIR UN ARBRE ENTIER : les blocs ne
    // remplacent pas la frappe, ils la prolongent.
    r.egal('TAPER UNE LIGNE POSE LES BLOCS, un par case et un par signe',
        [ouvert.blocs.slice().sort().join(' '), ouvert.liens.length, ouvert.poignees],
        ['+ 2 × × − −0,4 −0,6 −5 −8', 8, 9], JSON.stringify(ouvert));
    r.verifie('ET LE CHANTIER NE DÉBORDE PAS DE SA ZONE : c\'était la plainte',
        ouvert.deborde === false, JSON.stringify({ deborde: ouvert.deborde }));
    r.verifie('le dessin est là, et c\'est celui du tampon', ouvert.dessin === true,
        JSON.stringify({ dessin: ouvert.dessin }));

    // LA PALETTE TIENT LA DEMANDE, OUTIL PAR OUTIL.
    const palette = await page.evaluate(() => {
        const lire = (s) => Array.from(document.querySelectorAll('#arbre-editeur ' + s))
            .map(b => b.dataset.genre || b.dataset.outil || b.dataset.geste || b.dataset.aligner);
        return { sources: lire('.source'), outils: lire('[data-outil]'),
                 alignements: lire('[data-aligner]'),
                 icones: document.querySelectorAll('#arbre-editeur .outil svg').length };
    });
    r.egal('DEUX SOURCES À TIRER : une case de nombre, un signe', palette.sources,
        ['nombre', 'operation'], JSON.stringify(palette));
    r.egal('UNE ICÔNE RELIER ET UNE ICÔNE CHOISIR', palette.outils, ['relier', 'choisir'],
        JSON.stringify(palette));
    r.egal('ET QUATRE ALIGNEMENTS, puisque choisir sert à aligner', palette.alignements,
        ['gauche', 'centre', 'haut', 'repartir'], JSON.stringify(palette));
    r.verifie('chaque bouton porte une icône, et non un mot',
        palette.icones >= 11, JSON.stringify(palette));

    // ---- ON TIRE UNE SOURCE DANS LA ZONE ----
    //
    // LE BLOC ARRIVE OÙ ON LE LÂCHE. C'est toute la différence avec l'assembleur
    // d'avant, qui posait ses briques dans l'ordre où on les créait : ici, la
    // place qu'on donne au bloc EST la mise en page du tampon.
    await page.evaluate(() => PluginManager.plugins['arbreDeCalculTool'].vider());
    await page.waitForTimeout(150);
    // UNE ZONE VIDE DESSINE À L'ÉCHELLE UN. L'échelle restait celle du dernier
    // arbre affiché : après « Vider », le premier bloc tiré était posé à ses
    // coordonnées divisées par 0,75, un tiers plus loin que le pointeur. C'est
    // la mesure qui l'a dit, pas la relecture — le bloc était « à peu près là ».
    r.egal('UNE ZONE VIDE DESSINE À L\'ÉCHELLE UN, sans quoi le premier bloc tombe à côté',
        await echelle(), 1, 'échelle après « Vider »');

    const tirerDansLaZone = async (genre, vx, vy) => {
        const src = await boiteDe('#arbre-editeur .source[data-genre="' + genre + '"]');
        const zone = await boiteDe('#arbre-zone');
        if (!src || !zone) return { rien: true };
        await page.mouse.move(src.x + src.w / 2, src.y + src.h / 2);
        await page.mouse.down();
        await page.mouse.move(zone.x + vx, zone.y + vy, { steps: 8 });
        // LA ZONE ET L'ÉCHELLE SE RELISENT AU MOMENT DU LÂCHER : poser le bloc
        // précédent a pu faire grandir la fenêtre, donc la bouger — et faire
        // rapetisser le dessin. Ce qu'on juge, c'est la vue QU'ON AVAIT SOUS LES
        // YEUX en lâchant.
        const zb = await boiteDe('#arbre-zone');
        const eb = await echelle();
        await page.mouse.up();
        await page.waitForTimeout(150);
        return await page.evaluate(([z, vX, vY, ech]) => {
            const p = PluginManager.plugins['arbreDeCalculTool'];
            const b = p.graphe.blocs[p.graphe.blocs.length - 1];
            if (!b || !z) return { rien: true, ecart: null, genre: null, dit: null, pas: 5 };
            const q = document.querySelector('#arbre-zone').getBoundingClientRect();
            // CE QU'ON MESURE : le milieu du bloc tombe là où le pointeur a
            // lâché, à un cran de grille près — c'est le seul écart qu'on
            // s'autorise, et il vaut cinq pixels.
            const c = p.boiteDuBloc(b);
            const vise = { x: (z.x + vX - q.x) / ech, y: (z.y + vY - q.y) / ech };
            return { rien: false, genre: b.genre, dit: b.genre === 'operation' ? b.op : b.texte,
                     ecart: [Math.round(Math.abs(c.x + c.l / 2 - vise.x)),
                             Math.round(Math.abs(c.y + c.h / 2 - vise.y))],
                     pas: p.PAS_GRILLE };
        }, [zb, vx, vy, eb]);
    };

    const pose1 = await tirerDansLaZone('nombre', 90, 70);
    r.egal('TIRER LA SOURCE « NOMBRE » POSE UNE CASE, vide de tout calcul',
        [pose1.genre, pose1.dit], ['nombre', '0'], JSON.stringify(pose1));
    r.verifie('ET ELLE ARRIVE LÀ OÙ ON L\'A LÂCHÉE, à un cran de grille près',
        !!pose1.ecart && pose1.ecart[0] <= pose1.pas && pose1.ecart[1] <= pose1.pas,
        JSON.stringify(pose1));
    const pose2 = await tirerDansLaZone('nombre', 270, 70);
    const pose3 = await tirerDansLaZone('operation', 180, 210);
    r.verifie('la prémisse de la suite : la seconde case est bien posée',
        pose2.rien !== true, JSON.stringify(pose2));
    r.egal('TIRER LA SOURCE « SIGNE » POSE UNE BULLE ET SA CASE DE RÉSULTAT',
        [pose3.genre, pose3.dit], ['operation', '+'], JSON.stringify(pose3));
    r.verifie('elle aussi arrive là où on l\'a lâchée',
        !!pose3.ecart && pose3.ecart[0] <= pose3.pas && pose3.ecart[1] <= pose3.pas,
        JSON.stringify(pose3));
    const troisBlocs = await etatDeLEditeur();
    r.egal('TROIS BLOCS SONT POSÉS, ET AUCUN N\'EST RELIÉ — c\'est un chantier',
        [troisBlocs.blocs.length, troisBlocs.liens.length, troisBlocs.poignees],
        [3, 0, 3], JSON.stringify(troisBlocs));

    // UN SIMPLE CLIC POSE AUSSI. Tout le monde ne tire pas : un pavé tactile,
    // un doigt, une main qui tremble. Un outil muet au clic passe pour cassé.
    const auClic = await (async () => {
        const avant = (await etatDeLEditeur()).blocs.length;
        await page.click('#arbre-editeur .source[data-genre="nombre"]');
        await page.waitForTimeout(150);
        const e = await etatDeLEditeur();
        return { avant, apres: e.blocs.length, deborde: e.deborde, choisis: e.choisis };
    })();
    r.egal('UN SIMPLE CLIC SUR LA SOURCE POSE AUSSI UN BLOC', auClic.apres, auClic.avant + 1,
        JSON.stringify(auClic));
    r.verifie('il se pose à côté de ce qui existe, sans sortir de la zone',
        auClic.deborde === false, JSON.stringify(auClic));
    r.egal('et c\'est lui qu\'on tient : la barre du choix parle de lui',
        auClic.choisis, ['0'], JSON.stringify(auClic));
    await page.evaluate(() => PluginManager.plugins['arbreDeCalculTool'].supprimerLaSelection());
    await page.waitForTimeout(140);

    // ---- RELIER ----
    //
    // ON CLIQUE LE BLOC DE DÉPART, PUIS LE SIGNE QUI LE MANGE — et l'on clique
    // les VRAIES poignées, à la souris : c'est la correspondance entre le dessin
    // et les poignées qui a déjà menti une fois, toutes portant le chemin de la
    // racine, si bien que cliquer n'importe quelle bulle défaisait tout l'arbre.
    await page.click('#arbre-editeur [data-outil="relier"]');
    await page.waitForTimeout(140);
    const rangsDesBlocs = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        return p.graphe.blocs.map(b => [b.id, b.genre]);
    });
    // ON VISE LA POIGNÉE PAR SON BLOC, ET JAMAIS PAR SON RANG DANS LA ZONE : le
    // dessin est le premier enfant de la zone, donc « nth-of-type » décale tout
    // d'un cran et désigne le voisin — un contrôle qui tombe sans rien mesurer.
    const cliquerLeBloc = async (genre, n) => {
        const t = rangsDesBlocs.filter(k => k[1] === genre)[n];
        if (!t) return false;
        const b = await boiteDe('#arbre-zone .bloc[data-bloc="' + t[0] + '"]');
        if (!b) return false;
        await page.mouse.click(b.x + b.w / 2, b.y + 6);
        await page.waitForTimeout(140);
        return true;
    };
    const premierClic = await (async () => {
        const fait = await cliquerLeBloc('nombre', 0);
        const vu = await page.evaluate(() => {
            const p = PluginManager.plugins['arbreDeCalculTool'];
            return { depuis: p.relierDepuis,
                     marque: !!document.querySelector('#arbre-zone .bloc.source-du-lien') };
        });
        return Object.assign({ fait }, vu);
    })();
    r.verifie('LE PREMIER CLIC CHOISIT LE DÉPART, et cela se voit',
        premierClic.fait === true && !!premierClic.depuis && premierClic.marque === true,
        JSON.stringify(premierClic));
    await cliquerLeBloc('operation', 0);
    const unLien = await etatDeLEditeur();
    r.egal('LE SECOND CLIC TIRE LA FLÈCHE, du bloc vers le signe', unLien.liens, ['0→+'],
        JSON.stringify(unLien));
    await cliquerLeBloc('nombre', 1);
    await cliquerLeBloc('operation', 0);
    const deuxLiens = await etatDeLEditeur();
    r.egal('ET LE SIGNE NOURRI DE SES DEUX BLOCS DEVIENT UN CALCUL',
        [deuxLiens.liens, deuxLiens.champ], [['0→+', '0→+'], '0 + 0'], JSON.stringify(deuxLiens));

    // CHAQUE REFUS A SA PHRASE. « Ça ne marche pas » n'apprend rien à qui tient
    // la souris : ce qu'il faut dire, c'est le geste qui débloque.
    const refusDeRelier = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const n = p.graphe.blocs.filter(b => b.genre !== 'operation').map(b => b.id);
        const o = p.graphe.blocs.filter(b => b.genre === 'operation').map(b => b.id);
        if (n.length < 2 || !o.length) return { pret: false };
        const compte = p.graphe.liens.length;
        const dit = {
            pret: true,
            dejaNourri: p.relierLesBlocs(n[0], o[0]),
            pasUnSigne: p.relierLesBlocs(o[0], n[0]),
            luiMeme: p.relierLesBlocs(n[0], n[0]),
            inconnu: p.relierLesBlocs('bZZ', o[0])
        };
        dit.liensInchanges = p.graphe.liens.length === compte;
        return dit;
    });
    r.verifie('un bloc qui nourrit déjà un signe le dit, et dit quoi faire',
        /nourrit déjà/.test(refusDeRelier.dejaNourri || ''), JSON.stringify(refusDeRelier));
    r.verifie('une flèche qui n\'arrive pas sur un signe le dit',
        /sur un signe/.test(refusDeRelier.pasUnSigne || ''), JSON.stringify(refusDeRelier));
    r.verifie('et un bloc ne se relie pas à lui-même',
        /deux blocs différents/.test(refusDeRelier.luiMeme || ''), JSON.stringify(refusDeRelier));
    r.verifie('AUCUN REFUS NE LAISSE DE FLÈCHE DERRIÈRE LUI',
        refusDeRelier.liensInchanges === true, JSON.stringify(refusDeRelier));

    // UN CALCUL NE TOURNE PAS EN ROND. Le cycle est le seul refusDeRelier qu'on ne voit
    // pas venir : deux signes qui se nourrissent l'un l'autre se dessinent très
    // bien et ne valent rien.
    const rond = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [
            { id: 'x1', genre: 'operation', op: '+', x: 20, y: 20, l: 74 },
            { id: 'x2', genre: 'operation', op: '×', x: 160, y: 20, l: 74 }
        ], liens: [{ de: 'x1', vers: 'x2' }] };
        return { dit: p.relierLesBlocs('x2', 'x1'), liens: p.graphe.liens.length };
    });
    r.verifie('DEUX SIGNES QUI SE MANGENT L\'UN L\'AUTRE SONT REFUSÉS',
        /tourne pas en rond/.test(rond.dit || '') && rond.liens === 1, JSON.stringify(rond));

    // ---- COUPER ----
    await ouvrirSur('1 + 2');
    await page.waitForTimeout(280);
    const avantCoupe = await etatDeLEditeur();
    await page.click('#arbre-editeur [data-outil="relier"]');
    await page.waitForTimeout(150);
    const enRelier = await etatDeLEditeur();
    r.egal('LES PASTILLES À COUPER N\'EXISTENT QU\'AVEC L\'OUTIL QUI RELIE',
        [avantCoupe.coupes, enRelier.coupes], [0, 2],
        JSON.stringify({ avant: avantCoupe.coupes, enRelier: enRelier.coupes }));
    const coupe = await (async () => {
        const b = await boiteDe('#arbre-zone .coupe');
        if (!b) return { rien: true, liens: null, ligne: null, blocs: [] };
        await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
        await page.waitForTimeout(150);
        return await etatDeLEditeur();
    })();
    r.egal('CLIQUER UNE PASTILLE COUPE SA FLÈCHE, et le calcul redevient un chantier',
        [coupe.liens && coupe.liens.length, coupe.ligne, coupe.blocs.length],
        [1, '', 3], JSON.stringify(coupe));

    // ---- CHOISIR, DÉPLACER, ENCADRER, ALIGNER ----
    //
    // LA POIGNÉE DOIT COUVRIR LA CASE QU'ELLE NOMME. C'est l'erreur déjà commise
    // une fois : les poignées étaient posées d'après un arbre RELU, donc
    // d'autres objets que ceux qu'on dessinait, et toutes désignaient la racine.
    // On clique donc le NOMBRE QU'ON VOIT, et l'on regarde qui est choisi.
    await ouvrirSur('(−0,6 × −5) + 7');
    await page.waitForTimeout(300);
    const surLeDessin = await (async () => {
        const vise = await page.evaluate(() => {
            const t = Array.from(document.querySelectorAll('#arbre-zone svg text'))
                .find(k => k.textContent === '−5');
            if (!t) return null;
            const q = t.getBoundingClientRect();
            return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
        });
        if (!vise) return { rien: true, choisis: ['(aucun texte −5 dans le dessin)'] };
        await page.mouse.click(vise.x, vise.y);
        await page.waitForTimeout(150);
        return await etatDeLEditeur();
    })();
    r.egal('CLIQUER LE NOMBRE QU\'ON VOIT CHOISIT LE BLOC QUI LE PORTE',
        surLeDessin.choisis, ['−5'], JSON.stringify(surLeDessin));

    // LA BARRE DU CHOIX PARLE DU BLOC QU'ON TIENT, ET DE LUI SEUL.
    const barreNombre = await page.evaluate(() => {
        const champ = document.querySelector('#arbre-barre-choix .nombre-du-bloc');
        return { champ: !!champ, valeur: champ && champ.value,
                 signes: document.querySelectorAll('#arbre-barre-choix .signe').length };
    });
    r.egal('UNE CASE CHOISIE OUVRE SON NOMBRE DANS LA BARRE, déjà rempli',
        [barreNombre.champ, barreNombre.valeur, barreNombre.signes], [true, '−5', 0],
        JSON.stringify(barreNombre));
    const change = await page.evaluate(() => {
        const champ = document.querySelector('#arbre-barre-choix .nombre-du-bloc');
        if (!champ) return { rien: true, texte: null, ligne: null, dansLeDessin: null };
        champ.value = '-4';
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const b = p.graphe.blocs.find(k => k.genre !== 'operation' && /4/.test(k.texte || ''));
        return { texte: b && b.texte, ligne: p.laLigneDuGraphe(),
                 dansLeDessin: !!Array.from(document.querySelectorAll('#arbre-zone svg text'))
                     .find(t => t.textContent === '−4') };
    });
    // LE MOINS DU CLAVIER N'EST PAS CELUI QU'ON DESSINE : le trait d'union est
    // plus court, et deux moins différents dans un même arbre se voient.
    r.egal('LE CHANGER CHANGE LE BLOC, LE CALCUL ET LE DESSIN — et le trait d\'union devient un vrai moins',
        [change.texte, change.ligne, change.dansLeDessin],
        ['−4', '(−0,6 × −4) + 7', true], JSON.stringify(change));

    const barreSigne = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const b = p.graphe.blocs.find(k => k.genre === 'operation' && k.op === '×');
        if (!b) return { rien: true, combien: 0, actif: null, champ: null, apres: null };
        p.selection = [b.id];
        p.rendreLEditeur();
        const signes = Array.from(document.querySelectorAll('#arbre-barre-choix .signe'));
        const actif = signes.find(s => s.classList.contains('actif'));
        const plus = signes.find(s => s.dataset.signe === '+');
        if (plus) plus.click();
        return { combien: signes.length, actif: actif && actif.dataset.signe,
                 champ: !!document.querySelector('#arbre-barre-choix .nombre-du-bloc'),
                 apres: p.laLigneDuGraphe() };
    });
    r.egal('UN SIGNE CHOISI OUVRE LES QUATRE SIGNES, celui qu\'il porte en évidence',
        [barreSigne.combien, barreSigne.actif, barreSigne.champ], [4, '×', false],
        JSON.stringify(barreSigne));
    r.egal('ET EN CHOISIR UN AUTRE CHANGE LE CALCUL SANS RIEN DÉPLACER',
        barreSigne.apres, '(−0,6 + −4) + 7', JSON.stringify(barreSigne));

    // LA CASE S'ÉLARGIT AVEC SON NOMBRE. La largeur était copiée une fois pour
    // toutes au moment de poser les blocs ; dès qu'on changeait le nombre, le
    // texte débordait de son rectangle — et la poignée, qui épouse le bloc,
    // ratait la moitié de la case qu'elle recouvre.
    const largeurQuiSuit = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const b = p.graphe.blocs.find(k => k.genre !== 'operation' && k.texte === '7');
        if (!b) return { rien: true };
        p.changerLeTexteDUnBloc(b.id, '123456');
        const h = document.querySelector('#arbre-zone .bloc[data-bloc="' + b.id + '"]');
        const t = Array.from(document.querySelectorAll('#arbre-zone svg text'))
            .find(k => k.textContent === '123456');
        if (!h || !t) return { rien: true, poignee: null, texte: null, case: null };
        const rh = h.getBoundingClientRect(), rt = t.getBoundingClientRect();
        const rc = Array.from(document.querySelectorAll('#arbre-zone svg rect'))
            .map(k => k.getBoundingClientRect())
            .find(k => Math.abs(k.x - rh.x) < 2 && Math.abs(k.y - rh.y) < 2);
        return { poignee: Math.round(rh.width), texte: Math.round(rt.width),
                 case: rc ? Math.round(rc.width) : null };
    });
    r.verifie('LA CASE S\'ÉLARGIT AVEC SON NOMBRE : le texte ne déborde pas de son rectangle',
        !!largeurQuiSuit.case && largeurQuiSuit.texte + 4 <= largeurQuiSuit.case,
        JSON.stringify(largeurQuiSuit));
    r.verifie('et la poignée épouse la case élargie, sinon on viserait à côté',
        !!largeurQuiSuit.case && Math.abs(largeurQuiSuit.poignee - largeurQuiSuit.case) <= 1,
        JSON.stringify(largeurQuiSuit));

    // ON DÉPLACE CE QU'ON TIENT, ET LE DESSIN SUIT. Le déplacement vaut ce qu'on
    // a tiré : la grille de cinq ne fait que ranger, elle ne décide pas.
    //
    // ET ON LE MESURE SUR UN DESSIN RÉDUIT, c'est-à-dire la seule situation où
    // l'échelle compte. Sur un dessin à l'échelle un, diviser ou non par elle
    // donne le même résultat : le contrôle passait alors même en l'ôtant, donc
    // il ne mesurait rien. Deux blocs très éloignés forcent la réduction.
    const deplace = await (async () => {
        const avant = await page.evaluate(() => {
            const p = PluginManager.plugins['arbreDeCalculTool'];
            p.graphe = { blocs: [
                { id: 'd1', genre: 'nombre', texte: '1', x: 40, y: 20, l: 54 },
                { id: 'd2', genre: 'nombre', texte: '2', x: 40, y: 560, l: 54 }
            ], liens: [] };
            p.selection = ['d1'];
            p.publier();
            return { id: 'd1', ech: p.echelleDuGraphe };
        });
        const h = await boiteDe('#arbre-zone .bloc[data-bloc="d1"]');
        if (!h) return { rien: true, x: null, y: null, ech: avant.ech };
        await page.mouse.move(h.x + h.w / 2, h.y + h.h / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.w / 2 + 60 * avant.ech, h.y + h.h / 2 + 25 * avant.ech,
            { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(160);
        const ou = await page.evaluate(() => {
            const b = PluginManager.plugins['arbreDeCalculTool'].graphe.blocs
                .find(k => k.id === 'd1');
            return { x: b && b.x, y: b && b.y };
        });
        return { x: ou.x, y: ou.y, ech: avant.ech };
    })();
    r.verifie('la prémisse : le dessin est réduit, sans quoi l\'échelle ne mesure rien',
        deplace.ech < 0.9, JSON.stringify(deplace));
    r.egal('TIRER UN BLOC LE DÉPLACE D\'AUTANT QU\'ON A TIRÉ, à l\'échelle du dessin',
        [deplace.x, deplace.y], [100, 45], JSON.stringify(deplace));
    const retourDuDeplacement = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.annulerLeDernierGeste();
        const b = p.graphe.blocs.find(k => k.id === 'd1');
        return { x: b && b.x, y: b && b.y };
    });
    r.egal('ET ANNULER LE REMET OÙ IL ÉTAIT', [retourDuDeplacement.x, retourDuDeplacement.y],
        [40, 20], JSON.stringify(retourDuDeplacement));

    // ENCADRER CHOISIT CE QUE LE CADRE TOUCHE, ET RIEN D'AUTRE : c'est la seule
    // façon d'en tenir plusieurs à la fois pour les aligner.
    const encadre = await (async () => {
        await page.evaluate(() => {
            const p = PluginManager.plugins['arbreDeCalculTool'];
            p.graphe = { blocs: [
                { id: 'e1', genre: 'nombre', texte: '1', x: 20, y: 20, l: 54 },
                { id: 'e2', genre: 'nombre', texte: '2', x: 120, y: 20, l: 54 },
                { id: 'e3', genre: 'nombre', texte: '3', x: 20, y: 260, l: 54 }
            ], liens: [] };
            p.selection = [];
            p.publier();
        });
        await page.waitForTimeout(160);
        const zone = await boiteDe('#arbre-zone');
        const ech = await echelle();
        await page.mouse.move(zone.x + 4, zone.y + 4);
        await page.mouse.down();
        await page.mouse.move(zone.x + 4 + 250 * ech, zone.y + 4 + 150 * ech, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(160);
        return await etatDeLEditeur();
    })();
    r.egal('ENCADRER CHOISIT LES BLOCS TOUCHÉS, ET LAISSE LES AUTRES',
        encadre.choisis, ['1', '2'], JSON.stringify(encadre));
    const videLeChoix = await (async () => {
        const zone = await boiteDe('#arbre-zone');
        await page.mouse.click(zone.x + zone.w - 6, zone.y + zone.h - 6);
        await page.waitForTimeout(150);
        return await etatDeLEditeur();
    })();
    r.egal('ET UN CLIC DANS LE VIDE REND LES MAINS LIBRES', videLeChoix.choisis, [],
        JSON.stringify(videLeChoix));

    // LES QUATRE ALIGNEMENTS, sur trois blocs posés exprès de travers et de
    // largeurs différentes — car aligner trois cases de même largeur ne
    // départagerait pas « par le bord » de « par le milieu ».
    const alignements = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const planter = () => {
            p.graphe = { blocs: [
                { id: 'a1', genre: 'nombre', texte: '1', x: 30, y: 10, l: 54 },
                { id: 'a2', genre: 'nombre', texte: '2', x: 100, y: 60, l: 54 },
                { id: 'a3', genre: 'nombre', texte: '300', x: 220, y: 30, l: 57 }
            ], liens: [] };
            p.selection = ['a1', 'a2', 'a3'];
            p.poserLesValeurs(p.graphe);
        };
        const out = {};
        ['gauche', 'centre', 'haut', 'repartir'].forEach(quoi => {
            planter();
            const fait = p.aligner(quoi);
            const b = p.graphe.blocs;
            out[quoi] = { fait, x: b.map(k => k.x), y: b.map(k => k.y),
                          milieux: b.map(k => k.x + k.l / 2),
                          ecarts: [b[1].x - (b[0].x + b[0].l), b[2].x - (b[1].x + b[1].l)],
                          droite: Math.max.apply(null, b.map(k => k.x + k.l)),
                          largeurs: b.map(k => k.l) };
        });
        planter();
        p.selection = ['a1'];
        out.seul = p.aligner('gauche');
        out.ecartDuManuel = p.ECART_H;
        return out;
    });
    r.egal('ALIGNER À GAUCHE MET TOUS LES BORDS GAUCHES SUR LE PLUS À GAUCHE',
        alignements.gauche.x, [30, 30, 30], JSON.stringify(alignements.gauche));
    // LE MILIEU EST LE MILIEU DES MILIEUX, et les trois cases n'ont pas la même
    // largeur : les aligner par leur bord ne les centrerait pas.
    r.verifie('ALIGNER LES MILIEUX LES MET SUR UNE MÊME VERTICALE',
        Math.max.apply(null, alignements.centre.milieux)
        - Math.min.apply(null, alignements.centre.milieux) <= 1
        && alignements.centre.x[0] !== alignements.centre.x[2],
        JSON.stringify(alignements.centre));
    r.egal('ALIGNER LES HAUTS LES MET SUR UNE MÊME HORIZONTALE',
        alignements.haut.y, [10, 10, 10], JSON.stringify(alignements.haut));
    // RÉPARTIR DONNE LE MÊME ÉCART À TOUS, DANS LA PLACE DÉJÀ PRISE : il range,
    // il n'étale pas — et il ne serre jamais plus que l'écart du manuel, sinon
    // deux cases finiraient par se toucher.
    r.verifie('RÉPARTIR DONNE LE MÊME ÉCART À TOUS, sans changer la place prise',
        alignements.repartir.ecarts[0] === alignements.repartir.ecarts[1]
        && alignements.repartir.ecarts[0] >= alignements.ecartDuManuel
        && alignements.repartir.droite === 277,
        JSON.stringify(alignements.repartir));
    r.verifie('ON N\'ALIGNE PAS UN BLOC TOUT SEUL : il n\'y a rien à aligner',
        alignements.seul === false, String(alignements.seul));

    // SUPPRIMER EMPORTE LES FLÈCHES DU BLOC. Un lien dont une extrémité n'existe
    // plus ne se dessine pas, mais il compte encore pour « ce signe a déjà ses
    // deux blocs » : on ne pourrait plus rien rebrancher à sa place.
    const supprime = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [
            { id: 's1', genre: 'nombre', texte: '1', x: 20, y: 20, l: 54 },
            { id: 's2', genre: 'nombre', texte: '2', x: 100, y: 20, l: 54 },
            { id: 's3', genre: 'nombre', texte: '3', x: 180, y: 20, l: 54 },
            { id: 's4', genre: 'operation', op: '+', x: 60, y: 120, l: 74 }
        ], liens: [{ de: 's1', vers: 's4' }, { de: 's2', vers: 's4' }] };
        p.selection = ['s1'];
        const combien = p.supprimerLaSelection();
        return { combien, blocs: p.graphe.blocs.length, liens: p.graphe.liens.length,
                 rebranche: p.relierLesBlocs('s3', 's4'),
                 apres: p.graphe.liens.length };
    });
    r.egal('SUPPRIMER UN BLOC EMPORTE SES FLÈCHES',
        [supprime.combien, supprime.blocs, supprime.liens], [1, 3, 1],
        JSON.stringify(supprime));
    r.egal('et la place libérée se rebranche : le signe n\'avait plus qu\'une entrée',
        [supprime.rebranche, supprime.apres], [null, 2], JSON.stringify(supprime));

    // ON REVIENT EN ARRIÈRE DANS L'ÉDITEUR, ET PAS SEULEMENT SUR LE TABLEAU.
    // « Vider » et « Supprimer » effacent sans rien demander, et l'annuler du
    // tableau ne voit que les tampons posés : pendant qu'on construit, il n'y
    // avait rien derrière soi. Un clic de travers perdait un arbre arrangé case
    // par case.
    const retour = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [], liens: [] };
        p.memoire = [];
        const a = p.poserUnBloc('nombre', 20, 20);
        const b = p.poserUnBloc('nombre', 120, 20);
        const o = p.poserUnBloc('operation', 60, 140);
        p.relierLesBlocs(a, o);
        // UN REFUS NE MANGE PAS UN RETOUR EN ARRIÈRE : il n'a rien changé.
        const refuse = p.relierLesBlocs(a, o);
        const apresLeRefus = p.memoire.length;
        const avant = { blocs: p.graphe.blocs.length, liens: p.graphe.liens.length };
        p.annulerLeDernierGeste();
        const unCoup = { blocs: p.graphe.blocs.length, liens: p.graphe.liens.length };
        p.annulerLeDernierGeste();
        const deuxCoups = { blocs: p.graphe.blocs.length, liens: p.graphe.liens.length };
        return { refuse: !!refuse, apresLeRefus, avant, unCoup, deuxCoups, b };
    });
    r.egal('ANNULER REND LE CHANTIER TEL QU\'IL ÉTAIT, geste par geste',
        [retour.avant, retour.unCoup, retour.deuxCoups],
        [{ blocs: 3, liens: 1 }, { blocs: 3, liens: 0 }, { blocs: 2, liens: 0 }],
        JSON.stringify(retour));
    r.egal('ET UN REFUS NE MANGE PAS UN RETOUR EN ARRIÈRE : il n\'a rien changé',
        [retour.refuse, retour.apresLeRefus], [true, 4], JSON.stringify(retour));
    const viderSeRattrape = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [], liens: [] };
        p.semerDepuisLaLigne('1 + 2');
        p.memoire = [];
        p.rendreLEditeur();
        const eteintAuDepart = !!(document.querySelector('#arbre-editeur [data-geste="annuler"]') || {}).disabled;
        p.vider();
        const vide = p.graphe.blocs.length;
        const allume = !(document.querySelector('#arbre-editeur [data-geste="annuler"]') || {}).disabled;
        p.annulerLeDernierGeste();
        return { eteintAuDepart, vide, allume, blocs: p.graphe.blocs.length,
                 liens: p.graphe.liens.length, ligne: p.laLigneDuGraphe() };
    });
    r.egal('« VIDER » SE RATTRAPE : l\'arbre revient entier',
        [viderSeRattrape.vide, viderSeRattrape.blocs, viderSeRattrape.liens, viderSeRattrape.ligne],
        [0, 3, 2, '1 + 2'], JSON.stringify(viderSeRattrape));
    r.egal('ET LE BOUTON S\'ÉTEINT QUAND IL N\'Y A RIEN DERRIÈRE SOI',
        [viderSeRattrape.eteintAuDepart, viderSeRattrape.allume], [true, true],
        JSON.stringify(viderSeRattrape));

    // RANGER REPOSE L'ARBRE COMME LE MANUEL. Les blocs vont où l'on veut, mais
    // une fois l'arbre complet on veut la mise en page du livre sans la refaire
    // à la main — et cela n'est possible que parce que la ligne se lit des
    // blocs : on la relit, et on la repose.
    const range = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [], liens: [] };
        p.semerDepuisLaLigne('(2 + 3) × 4');
        // ON DÉRANGE LES HAUTEURS, PAS L'ORDRE DE LECTURE : l'abscisse DIT quel
        // bloc passe à gauche du signe, donc la bousculer changerait le calcul
        // — ce qui est voulu, et se mesure deux lignes plus bas.
        p.graphe.blocs.forEach((b, i) => { b.y = 300 - i * 23; });
        const fait = p.ranger();
        const plan = p.poser('(2 + 3) × 4');
        const trier = (t) => t.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return { fait,
                 obtenu: trier(p.graphe.blocs.map(b => [Math.round(b.x), Math.round(b.y)])),
                 voulu: plan.erreur ? [plan.erreur] : trier(plan.noeuds.map(n => [Math.round(n.x),
                     Math.round(n.op ? n.yBulle - p.R_BULLE : n.y)])),
                 ligne: p.laLigneDuGraphe() };
    });
    r.egal('RANGER REPOSE L\'ARBRE EXACTEMENT COMME LA LIGNE LE POSERAIT',
        range.obtenu, range.voulu, JSON.stringify(range));
    r.egal('et le calcul n\'a pas bougé d\'un signe', range.ligne, '(2 + 3) × 4',
        JSON.stringify({ ligne: range.ligne }));

    // L'ORDRE DE LECTURE SUIT LA PLACE DES BLOCS. C'est la règle de la gauche,
    // et elle vaut pour « − » et « ÷ » : échanger deux cases de place échange
    // les deux termes. Sans cela, déplacer un bloc serait un geste décoratif,
    // et le dessin dirait autre chose que le calcul.
    const laGauche = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [], liens: [] };
        p.semerDepuisLaLigne('8 − 2');
        const avant = p.laLigneDuGraphe();
        const cases = p.graphe.blocs.filter(b => b.genre !== 'operation')
            .sort((a, b) => a.x - b.x);
        const x = cases[0].x, l = cases[0].l;
        cases[0].x = cases[1].x; cases[0].l = cases[1].l;
        cases[1].x = x; cases[1].l = l;
        return { avant, apres: p.laLigneDuGraphe() };
    });
    r.egal('ÉCHANGER DEUX CASES DE PLACE ÉCHANGE LES DEUX TERMES',
        [laGauche.avant, laGauche.apres], ['8 − 2', '2 − 8'], JSON.stringify(laGauche));
    const rangeEnChantier = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe = { blocs: [
            { id: 'c1', genre: 'nombre', texte: '1', x: 20, y: 20, l: 54 },
            { id: 'c2', genre: 'nombre', texte: '2', x: 200, y: 20, l: 54 }
        ], liens: [] };
        return { fait: p.ranger(), places: p.graphe.blocs.map(b => [b.x, b.y]) };
    });
    r.egal('ON NE RANGE QU\'UN ARBRE ENTIER : deux blocs libres restent où ils sont',
        [rangeEnChantier.fait, rangeEnChantier.places], [false, [[20, 20], [200, 20]]],
        JSON.stringify(rangeEnChantier));

    // ---- LA LIGNE RESTE LA VÉRITÉ QUAND IL Y EN A UNE ----
    await ouvrirSur('(1 + 2) × 3');
    await page.waitForTimeout(280);
    const vaEtVient = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const forme = (plan) => plan.erreur ? [plan.erreur]
            : plan.noeuds.map(n => (n.op || 'n') + ':' + n.texte + '@r' + n.rang).sort();
        // ON CHANGE L'ARBRE AU DOIGT, puis on relit la ligne qu'il écrit : c'est
        // la mesure centrale. L'éditeur n'a pas sa fabrique à lui.
        const b = p.graphe.blocs.find(k => k.genre === 'operation' && k.op === '+');
        if (b) p.changerLeSigneDUnBloc(b.id, '−');
        const ligne = p.laLigneDuGraphe();
        return { ligne, editee: forme(p.poser(ligne)), aLaMain: forme(p.poser('(1 − 2) × 3')) };
    });
    r.egal('L\'ARBRE MODIFIÉ AU DOIGT EST CELUI QU\'ON TAPE À LA MAIN, nœud pour nœud',
        [vaEtVient.ligne, vaEtVient.editee], ['(1 − 2) × 3', vaEtVient.aLaMain],
        JSON.stringify(vaEtVient));

    // ET LA FRAPPE REPREND LA MAIN. L'éditeur écrit dans le champ sans réveiller
    // son écouteur — sinon l'aperçu relirait la ligne et reposerait les blocs
    // qu'on vient d'arranger. Mais quand c'est le PROFESSEUR qui tape, les blocs
    // doivent suivre : sans cela, le champ et le dessin diraient deux choses.
    const aLaFrappe = await page.evaluate(() => {
        const champ = document.querySelector('#custom-prompt-inputs input.prompt-input');
        champ.value = '7 × (8 + 9)';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        const p = PluginManager.plugins['arbreDeCalculTool'];
        return { ligne: p.laLigneDuGraphe(), blocs: p.graphe.blocs.length,
                 poignees: document.querySelectorAll('#arbre-zone .bloc').length };
    });
    r.egal('QUAND LE PROFESSEUR TAPE, LES BLOCS SUIVENT SA LIGNE',
        [aLaFrappe.ligne, aLaFrappe.blocs, aLaFrappe.poignees], ['7 × (8 + 9)', 5, 5],
        JSON.stringify(aLaFrappe));

    // ET TOUCHER UN RÉGLAGE NE DÉTRUIT PAS LE CHANTIER. L'aperçu est rappelé à
    // CHAQUE réglage touché — une case cochée, une couleur, la police. S'il
    // reposait les blocs depuis la ligne à chaque fois, un chantier à moitié
    // relié s'effondrerait pour avoir cliqué une pastille de couleur.
    const chantier = await page.evaluate(async () => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        p.graphe.liens = [];
        p.publier();
        const avant = { blocs: p.graphe.blocs.length, liens: p.graphe.liens.length };
        const cases = Array.from(document.querySelectorAll('#custom-prompt-inputs input[type=checkbox]'));
        if (cases[0]) { cases[0].checked = true; cases[0].dispatchEvent(new Event('change', { bubbles: true })); }
        await new Promise(k => setTimeout(k, 80));
        return { avant, apres: { blocs: p.graphe.blocs.length, liens: p.graphe.liens.length } };
    });
    r.egal('TOUCHER UN RÉGLAGE NE DÉTRUIT PAS LE CHANTIER EN COURS',
        [chantier.avant, chantier.apres], [{ blocs: 5, liens: 0 }, { blocs: 5, liens: 0 }],
        JSON.stringify(chantier));

    // ---- LA BORDURE ET L'ARRONDI ----
    //
    // « On peut choisir la bordure des blocs et leur arrondi. » Un polycopié
    // imprimé en noir et blanc perd les fonds de couleur : sans trait, les cases
    // y disparaissent — c'est à cela que sert le réglage.
    const habits = await page.evaluate(() => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const svg = (bordure, arrondi) => p.dessiner(p.poser('2 + 3'),
            { expression: '2 + 3', cases: '#bcd9f0', encre: '#2d3436', police: 'sans-serif',
              bordure, arrondi }, true);
        const rx = (s) => { const m = /<rect[^>]*rx="([-\d.]+)"/.exec(s); return m ? parseFloat(m[1]) : null; };
        const trait = (s) => { const m = /<rect[^>]*stroke-width="([\d.]+)"/.exec(s); return m ? parseFloat(m[1]) : 0; };
        return {
            listes: Array.from(document.querySelectorAll('#custom-prompt-inputs select'))
                .map(s => Array.from(s.options).map(o => o.value).join(',')),
            aucune: trait(svg('aucune', 'leger')),
            fine: trait(svg('fine', 'leger')),
            epaisse: trait(svg('epaisse', 'leger')),
            droit: rx(svg('fine', 'droit')),
            leger: rx(svg('fine', 'leger')),
            arrondi: rx(svg('fine', 'arrondi')),
            pilule: rx(svg('fine', 'pilule')),
            hauteur: p.H_CASE
        };
    });
    r.verifie('LA BOÎTE OFFRE LA BORDURE ET L\'ARRONDI, chacun dans sa liste',
        habits.listes.indexOf('aucune,fine,epaisse') >= 0
        && habits.listes.indexOf('droit,leger,arrondi,pilule') >= 0,
        JSON.stringify(habits.listes));
    r.egal('TROIS BORDURES, ET « AUCUNE » N\'EN DESSINE AUCUNE',
        [habits.aucune, habits.fine, habits.epaisse], [0, 1.5, 3], JSON.stringify(habits));
    // LA PILULE NE DÉBORDE PAS DE SA CASE : un rayon plus grand que la
    // demi-hauteur dessinerait n'importe quoi, et « 999 » est écrit en toutes
    // lettres dans la table des rayons.
    r.egal('QUATRE ARRONDIS, ET LA PILULE S\'ARRÊTE À LA DEMI-HAUTEUR',
        [habits.droit, habits.leger, habits.arrondi, habits.pilule],
        [0, 3, 10, habits.hauteur / 2], JSON.stringify(habits));

    // ---- LE TAMPON EMPORTE LES BLOCS ----
    //
    // Sans cela, rouvrir un arbre arrangé à la main le remettrait en rang
    // d'oignons — et l'on rouvre précisément pour révéler les cases devant la
    // classe, une fois l'arbre posé au tableau.
    const voyage = await page.evaluate(async () => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const args = ['(2 + 3) × 4', false, true, '#bcd9f0', '#2d3436', 'serif', 'epaisse', 'pilule'];
        images.length = 0;
        if (typeof saveState === 'function') saveState();
        p.graphe = { blocs: [], liens: [] };
        p.derniereLigneEcrite = null;
        p.ouvrir(args);
        await new Promise(k => setTimeout(k, 220));
        // ON ARRANGE : un seul bloc part à droite. Une translation de TOUT le
        // monde ne mesurerait rien — le recadrage la rendrait, et un tampon qui
        // ignorerait les blocs pour relire la ligne passerait quand même.
        const bouge = p.graphe.blocs[p.graphe.blocs.length - 1];
        bouge.x += 220;
        const arrange = p.graphe.blocs.map(b => [b.id, Math.round(b.x), Math.round(b.y)]);
        p.construire(args, null);
        for (let i = 0; i < 80 && !images.length; i++) await new Promise(k => setTimeout(k, 50));
        if (!images.length) return { rien: true, arrange, dans: null, apres: null, ligne: null };
        const im = images[0];
        const dans = JSON.parse(im.pluginData.args[8] || '{}');
        p.graphe = { blocs: [], liens: [] };
        p.derniereLigneEcrite = null;
        p.edit(im);
        await new Promise(k => setTimeout(k, 260));
        return {
            arrange,
            dans: { blocs: (dans.blocs || []).length, liens: (dans.liens || []).length },
            apres: p.graphe.blocs.map(b => [b.id, Math.round(b.x), Math.round(b.y)]),
            ligne: p.laLigneDuGraphe(),
            reglages: im.pluginData.args.slice(5, 8)
        };
    });
    r.egal('LES BLOCS VOYAGENT DANS LE TAMPON, avec leurs flèches',
        [voyage.dans && voyage.dans.blocs, voyage.dans && voyage.dans.liens], [5, 4],
        JSON.stringify(voyage.dans));
    r.egal('ET LA RÉÉDITION RETROUVE LA DISPOSITION, bloc par bloc',
        voyage.apres, voyage.arrange, JSON.stringify(voyage));
    r.egal('avec le même calcul et les mêmes habits', [voyage.ligne, voyage.reglages],
        ['(2 + 3) × 4', ['serif', 'epaisse', 'pilule']], JSON.stringify(voyage));

    // LE TAMPON SE RECADRE SUR SES BLOCS : un arbre arrangé à droite de la zone
    // garderait sinon deux cents pixels de blanc à sa gauche, et c'est l'image
    // ENTIÈRE qu'on pose sur le tableau.
    const recadre = await page.evaluate(async () => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const args = ['(2 + 3) × 4', false, false, '#bcd9f0', '#2d3436', 'sans-serif'];
        images.length = 0;
        p.graphe = { blocs: [], liens: [] };
        p.derniereLigneEcrite = null;
        p.ouvrir(args);
        await new Promise(k => setTimeout(k, 220));
        p.graphe.blocs.forEach(b => { b.x += 260; b.y += 90; });
        p.construire(args, null);
        for (let i = 0; i < 80 && !images.length; i++) await new Promise(k => setTimeout(k, 50));
        const plan = p.poser('(2 + 3) × 4');
        return { taille: images.length ? [Math.round(images[0].w), Math.round(images[0].h)] : null,
                 voulue: plan.erreur ? [plan.erreur] : [Math.round(plan.l), Math.round(plan.h)] };
    });
    r.egal('UN ARBRE POUSSÉ DANS UN COIN SE RECADRE : l\'image n\'emporte pas le blanc',
        recadre.taille, recadre.voulue, JSON.stringify(recadre));

    // UN CHANTIER SE POSE AUSSI, et c'est l'exercice à trous : l'arbre nu au
    // tableau, que la classe remplit. Aucun bloc n'y est « la » réponse, donc
    // aucun ne se peint en rouge.
    const aTrous = await page.evaluate(async () => {
        const p = PluginManager.plugins['arbreDeCalculTool'];
        const args = ['2 + 3', false, true, '#bcd9f0', '#2d3436', 'sans-serif'];
        images.length = 0;
        p.graphe = { blocs: [], liens: [] };
        p.derniereLigneEcrite = null;
        p.ouvrir(args);
        await new Promise(k => setTimeout(k, 220));
        p.graphe.liens = [];
        p.publier();
        p.construire(args, null);
        for (let i = 0; i < 80 && !images.length; i++) await new Promise(k => setTimeout(k, 50));
        const im = images[0];
        const svg = im ? decodeURIComponent(im.src.slice(im.src.indexOf(',') + 1)) : '';
        return { pose: !!im, rouge: /e03131/i.test(svg),
                 blocs: im ? (JSON.parse(im.pluginData.args[8] || '{}').blocs || []).length : 0,
                 liens: im ? (JSON.parse(im.pluginData.args[8] || '{}').liens || []).length : 0 };
    });
    r.egal('UN CHANTIER SE POSE QUAND MÊME : c\'est l\'exercice à trous',
        [aTrous.pose, aTrous.blocs, aTrous.liens], [true, 3, 0], JSON.stringify(aTrous));
    r.verifie('ET AUCUN BLOC N\'Y EST PEINT EN ROUGE : rien n\'y est encore le résultat',
        aTrous.rouge === false, JSON.stringify(aTrous));

    // ET LA BOÎTE REDEVIENT ÉTROITE EN SE FERMANT. Une classe posée et jamais
    // retirée donnerait cette largeur aux quarante autres réglages de
    // l'application, dont l'aperçu se perdrait dans une colonne vide.
    const apresFermeture = await page.evaluate(() => {
        const b = document.getElementById('custom-prompt-modal');
        b.style.display = 'none';
        return new Promise(ok => setTimeout(() => ok({
            large: b.classList.contains('boite-large'), largeur: b.style.width
        }), 80));
    });
    r.verifie('LA BOÎTE REDEVIENT ÉTROITE EN SE FERMANT : les autres réglages n\'héritent de rien',
        apresFermeture.large === false && apresFermeture.largeur === '320px',
        JSON.stringify(apresFermeture));

    await page.evaluate(() => {
        const b = document.getElementById('custom-prompt-modal');
        if (b) b.style.display = 'none';
        images.length = 0; draw();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
