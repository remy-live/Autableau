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

    await page.evaluate(() => { images.length = 0; draw(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
