// UNE FEUILLE S'INSÈRE ENTRE DEUX.
//
// « Ce serait super si on pouvait ajouter des feuilles entre deux existantes
// et pas obligatoirement à la fin, et éventuellement avoir une barre de
// défilement des pages. »
//
// Les trois « ＋ » de l'application — celui du coin de l'écran, celui du
// tiroir du bas, celui du trieur de pages — faisaient tous « pages.push » :
// la feuille partait au bout, et il ne restait qu'à la ramener à la main en
// tirant sa vignette, à supposer qu'on sache que le trieur existe. Or on
// ajoute une feuille PARCE QU'ON EST LÀ : on manque de place au milieu de son
// cours, pas à la fin.
//
// INSÉRER APRÈS LA PAGE COURANTE NE RETIRE RIEN. Sur la dernière page — le cas
// de qui construit son cours dans l'ordre — c'est exactement l'ancien
// comportement, au même rang : ce chapitre le vérifie aussi. Le geste ne
// change que là où l'ancien ne répondait pas au besoin.
//
// ET LE TRIEUR SE LAISSE VISER AU DOIGT. Sa corbeille et son « ＋ » ne
// paraissaient qu'au SURVOL de la vignette — un geste qui n'existe pas sur un
// tableau tactile : devant la classe, ils étaient introuvables. Mesuré :
// opacité zéro au repos. Ils sont maintenant là en permanence, discrets.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Une feuille s\'insère entre deux');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 }, tactile: true });
    await tableauVierge(page);

    // Chaque feuille porte son nom : c'est à cela qu'on lit l'ordre.
    const marquer = (mot) => page.evaluate((m) => {
        texts.push({ id: nextId++, x: 0, y: 0, content: m, fontSize: 24, z: globalZ++ });
        if (typeof saveState === 'function') saveState();
    }, mot);
    const ordre = () => page.evaluate(() => {
        if (typeof syncPage === 'function') syncPage();
        return {
            feuilles: pages.map(p => (p.texts || []).map(t => t.content).join('') || '·'),
            ici: currentPageIndex
        };
    });

    await marquer('UNE');
    await page.evaluate(() => ajouterUnePageVierge());
    await marquer('DEUX');
    await page.evaluate(() => ajouterUnePageVierge());
    await marquer('TROIS');
    await page.waitForTimeout(200);

    const depart = await ordre();
    r.egal('trois feuilles, dans l\'ordre où on les a faites',
        depart.feuilles, ['UNE', 'DEUX', 'TROIS'], JSON.stringify(depart));
    r.egal('AJOUTER DEPUIS LA DERNIÈRE AJOUTE AU BOUT, comme avant',
        depart.ici, 2, JSON.stringify(depart));

    // ------------------------------------------------------------------
    // 1. LA DEMANDE : une feuille entre la 1 et la 2.
    // ------------------------------------------------------------------
    await page.evaluate(() => loadPage(0));
    await page.waitForTimeout(150);
    await page.evaluate(() => ajouterUnePageVierge());
    await page.waitForTimeout(200);
    const insere = await ordre();
    r.egal('depuis la feuille 1, la neuve se glisse ENTRE la 1 et la 2',
        insere.feuilles, ['UNE', '·', 'DEUX', 'TROIS'], JSON.stringify(insere));
    r.egal('et c\'est sur elle qu\'on arrive, pas au bout du tableau',
        insere.ici, 1, JSON.stringify(insere));

    // ------------------------------------------------------------------
    // 2. LE « ＋ » D'UNE VIGNETTE DÉSIGNE OÙ, sans y aller d'abord.
    //    Pour glisser une feuille entre la 2 et la 3 quand on travaille sur
    //    la dernière, il fallait aller en 2, insérer, puis revenir.
    // ------------------------------------------------------------------
    await page.evaluate(() => loadPage(3));            // la dernière, « TROIS »
    await page.waitForTimeout(150);
    await page.evaluate(() => window.ouvrirLeTrieur(true));
    await page.waitForTimeout(500);

    const vignettes = () => page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        if (!d) return null;
        return Array.from(d.children)
            .filter(e => e.dataset && e.dataset.index !== undefined).length;
    });
    r.egal('le trieur montre une vignette par feuille', await vignettes(), 4,
        JSON.stringify(await ordre()));

    // CE QU'ON PEUT VISER AU DOIGT : les deux boutons de la vignette doivent
    // se voir SANS survol — c'est le seul geste qu'un tableau tactile n'a pas.
    const opacites = await page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        const boites = Array.from(d.children).filter(e => e.dataset && e.dataset.index !== undefined);
        const b = boites[0];
        const lire = (signe) => {
            const el = Array.from(b.children).find(c => c.innerHTML === signe);
            if (!el) return null;
            return Number(getComputedStyle(el).opacity);
        };
        return { plus: lire('＋'), corbeille: lire('🗑️') };
    });
    r.verifie('le ＋ de la vignette se voit sans survol (tableau tactile)',
        opacites.plus !== null && opacites.plus > 0.3, JSON.stringify(opacites));
    r.verifie('la corbeille de la vignette aussi',
        opacites.corbeille !== null && opacites.corbeille > 0.3, JSON.stringify(opacites));

    // On insère après la DEUXIÈME vignette, en restant sur la dernière page.
    const avant = await ordre();
    await page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        const boites = Array.from(d.children).filter(e => e.dataset && e.dataset.index !== undefined);
        const cible = boites[1];                       // la feuille vierge insérée plus haut
        const plus = Array.from(cible.children).find(c => c.innerHTML === '＋');
        plus.click();
    });
    await page.waitForTimeout(350);
    const apresVignette = await ordre();
    r.egal('le ＋ d\'une vignette insère APRÈS CETTE vignette-là',
        apresVignette.feuilles, ['UNE', '·', '·', 'DEUX', 'TROIS'],
        JSON.stringify([avant, apresVignette]));
    r.egal('et nous emmène sur la feuille qu\'il vient de créer',
        apresVignette.ici, 2, JSON.stringify(apresVignette));

    // ------------------------------------------------------------------
    // 3. LE « + Nouvelle » DU TRIEUR FAIT LE MÊME GESTE QUE LES AUTRES.
    //    Il avait sa propre copie — « pages.push » — et ajoutait donc au bout
    //    quand le coin, lui, insérait : deux « ＋ » qui ne font pas la même
    //    chose sont deux gestes à apprendre.
    // ------------------------------------------------------------------
    await page.evaluate(() => loadPage(0));
    await page.waitForTimeout(200);
    await page.evaluate(() => {
        const d = document.getElementById('thumbnail-drawer');
        const btn = Array.from(d.children).find(e => e.innerHTML === '+ Nouvelle');
        btn.click();
    });
    await page.waitForTimeout(350);
    const parLeTrieur = await ordre();
    r.egal('« + Nouvelle » insère après la page courante, comme le coin',
        parLeTrieur.feuilles, ['UNE', '·', '·', '·', 'DEUX', 'TROIS'],
        JSON.stringify(parLeTrieur));
    r.egal('et l\'on arrive bien dessus', parLeTrieur.ici, 1,
        JSON.stringify(parLeTrieur));

    // ------------------------------------------------------------------
    // 4. CE QU'ON AVAIT ÉCRIT N'A PAS BOUGÉ DE FEUILLE. Une insertion décale
    //    les rangs : si quelque chose s'y accrochait par son numéro, c'est
    //    ici que cela se verrait.
    // ------------------------------------------------------------------
    const contenus = await page.evaluate(() => {
        if (typeof syncPage === 'function') syncPage();
        return pages.map(p => (p.texts || []).length);
    });
    r.egal('les trois feuilles écrites ont gardé leur contenu, et les vierges sont vides',
        contenus, [1, 0, 0, 0, 1, 1], JSON.stringify(contenus));

    // ------------------------------------------------------------------
    // 5. ET LA PAGE D'EXERCICES D'UN DOCUMENT NAÎT CONTRE LUI.
    //
    // Quand on découpe un polycopié, les bouts partent sur « la page
    // d'exercices de ce document », fabriquée au besoin. Elle l'était par
    // « pages.push » : sur un tableau de six feuilles, découper depuis la
    // deuxième envoyait les exercices en septième position, loin du cours dont
    // ils sortent. « Découper sur la page 1, coller sur la page 2 » — elle
    // naît donc juste après la page d'où l'on découpe.
    //
    // On appelle le repérage directement, avec un bout de polycopié pour tout
    // décor : ce qu'on mesure ici, c'est OÙ la page est fabriquée, pas le
    // découpage lui-même — le chapitre 15 s'en charge de bout en bout.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        // Un tableau de six feuilles, et l'on travaille sur la deuxième.
        while (pages.length < 6) ajouterUnePageVierge();
        loadPage(1);
        // La page courante ne doit pas être vide : une page blanche où l'on se
        // trouve est déjà une réponse à « où ? », et le repérage s'arrête là.
        texts.push({ id: nextId++, x: 0, y: 0, content: 'LE POLYCOPIÉ', fontSize: 24, z: globalZ++ });
        saveState();
    });
    const nee = await page.evaluate(() => {
        const avant = { total: pages.length, ici: currentPageIndex };
        const bouge = ouvrirLaPageDesMorceaux({ cle: 'poly-de-la-seance' });
        return { avant, bouge, total: pages.length, ici: currentPageIndex,
                 marquee: !!(pages[currentPageIndex] && pages[currentPageIndex].pageDesMorceaux) };
    });
    r.egal('la page des exercices est fabriquée JUSTE APRÈS celle du polycopié',
        { bouge: nee.bouge, ici: nee.ici, total: nee.total, marquee: nee.marquee },
        { bouge: true, ici: nee.avant.ici + 1, total: nee.avant.total + 1, marquee: true },
        JSON.stringify(nee));
    r.verifie('et non au bout du tableau',
        nee.ici !== nee.total - 1, JSON.stringify(nee));

    // ET ELLE SE RETROUVE : le bout suivant doit rejoindre CETTE page-là, sans
    // qu'une seconde soit fabriquée.
    const retrouvee = await page.evaluate(() => {
        const laNeuve = currentPageIndex;
        loadPage(1);                                   // on retourne au polycopié
        const bouge = ouvrirLaPageDesMorceaux({ cle: 'poly-de-la-seance' });
        return { laNeuve, bouge, ici: currentPageIndex, total: pages.length };
    });
    r.egal('le bout suivant REJOINT cette page-là, sans en fabriquer une autre',
        { ici: retrouvee.ici, total: retrouvee.total },
        { ici: retrouvee.laNeuve, total: nee.total },
        JSON.stringify(retrouvee));

    // ------------------------------------------------------------------
    // 6. « LA PLUS RÉCENTE » NE SE LIT PLUS DANS LE RANG.
    //
    // Le repérage parcourait les pages À REBOURS : la dernière du tableau
    // étant forcément la dernière marquée, le premier marquage rencontré en
    // remontant était le bon. L'insertion a rendu cette prémisse fausse — une
    // page insérée est récente SANS être au bout.
    //
    // On met donc le repérage dans la situation qu'il ne savait pas lire :
    // DEUX pages d'exercices du même document, la plus récente ayant le rang
    // le PLUS PETIT. Le parcours à rebours retrouve alors la plus ANCIENNE, et
    // les bouts s'empilent sur une page que l'enseignant croyait rangée.
    // ------------------------------------------------------------------
    const deuxPages = await page.evaluate(() => {
        const ancienne = currentPageIndex;             // marquée la première
        loadPage(1);                                   // le polycopié
        ajouterUnePageVierge();                        // s'insère en 2 ; l'ancienne glisse
        const neuveVierge = currentPageIndex;
        // Une page blanche où l'on se trouve devient la page d'exercices : le
        // repérage le dit lui-même, et rend « false » puisqu'on y est déjà.
        const surPlace = ouvrirLaPageDesMorceaux({ cle: 'poly-de-la-seance' });
        const rangs = pages.map(p => (p && p.pageDesMorceaux) ? (p.pageDesMorceauxRang || 0) : null);
        return { ancienne, neuveVierge, surPlace, rangs, total: pages.length };
    });
    r.egal('deux pages d\'exercices, et la plus récente n\'est PAS la dernière du tableau',
        { marquees: deuxPages.rangs.filter(x => x !== null).length,
          recenteAvantAncienne: deuxPages.neuveVierge < deuxPages.total - 1 },
        { marquees: 2, recenteAvantAncienne: true }, JSON.stringify(deuxPages));

    const laquelle = await page.evaluate(() => {
        loadPage(1);                                   // on repart du polycopié
        ouvrirLaPageDesMorceaux({ cle: 'poly-de-la-seance' });
        return { ici: currentPageIndex, total: pages.length };
    });
    r.egal('LE BOUT SUIVANT VA SUR LA PLUS RÉCENTE, pas sur la dernière du tableau',
        laquelle.ici, deuxPages.neuveVierge,
        JSON.stringify([laquelle, deuxPages]));
    r.egal('et aucune page n\'a été fabriquée pour autant',
        laquelle.total, deuxPages.total, JSON.stringify(laquelle));

    // ------------------------------------------------------------------
    // 7. LE TABLEAU QU'ON VIENT D'OUVRIR EST DÉJÀ UNE PAGE.
    //
    // « Ça fait un peu chargé » — et sur la capture, le coin disait « 0/0 ».
    //
    // La liste des pages ne se remplit qu'au premier changement de feuille :
    // avant cela, le tableau vit dans les tableaux vivants, « pages.length »
    // vaut zéro et le rang vaut moins un. Le coin lisait ces deux nombres tels
    // quels et annonçait « zéro page sur zéro » à qui venait d'ouvrir
    // l'application, devant un tableau sur lequel on peut écrire.
    // ------------------------------------------------------------------
    const avantToutePage = await page.evaluate(() => {
        // L'état d'une application qu'on vient d'ouvrir, reconstitué.
        pages.length = 0;
        currentPageIndex = -1;
        if (typeof majLesPagesDeLEcran === 'function') majLesPagesDeLEcran();
        if (typeof majLaPageDuTiroir === 'function') majLaPageDuTiroir();
        const r = (typeof rangDeLaPage === 'function') ? rangDeLaPage() : null;
        return {
            coin: (document.getElementById('ecran-page-rang') || {}).textContent,
            tiroir: (document.getElementById('bm-page') || {}).textContent,
            compte: r
        };
    });
    r.egal('le coin dit « 1/1 », et non « 0/0 », sur un tableau qu\'on vient d\'ouvrir',
        avantToutePage.coin, '1/1', JSON.stringify(avantToutePage));
    r.egal('et le tiroir dit la même chose que lui',
        avantToutePage.tiroir, avantToutePage.coin, JSON.stringify(avantToutePage));
    r.egal('le compte lui-même ne rend jamais zéro',
        avantToutePage.compte, { rang: 1, total: 1 }, JSON.stringify(avantToutePage));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
