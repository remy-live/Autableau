// LA BANDE DES PAGES, DÉPLIÉE PAR LE RANG.
//
// « Éventuellement avoir une barre de défilement des pages. »
//
// Le coin n'avait que deux flèches : pour aller de la onzième feuille à la
// troisième, il fallait appuyer huit fois. Et le trieur, qui montre tout,
// dormait derrière une entrée de menu que personne ne trouvait — c'est
// d'ailleurs pour cela qu'on demandait une barre qui existait déjà, à moitié.
//
// TROIS FAÇONS ONT ÉTÉ MAQUETTÉES, LARGEURS MESURÉES :
//
//   P — les numéros DANS le coin. La plus directe, mais le coin grandit avec
//       le tableau : 140 px à deux pages, 215 à cinq, 290 à quatorze — pris
//       sur la page au moment précis où l'on veut l'écran nu.
//   R — une bande à vignettes en bas, comme celle du lecteur. On VOIT les
//       pages, mais c'est un cinquième meuble flottant et 48 px de hauteur
//       repris sur la page : le reproche même qui avait fait naître le rail.
//   Q — le coin ne bouge pas d'un pixel ; le rang dit qu'il s'ouvre, et la
//       rangée paraît le temps du geste.
//
// Q a été retenue : c'est la seule qui ne prend RIEN au repos, et le repos
// c'est quatre-vingt-quinze pour cent du temps de classe, projection comprise.
//
// ET CE N'EST PAS UN MEUBLE DE PLUS. Le panneau du rang existait déjà, avec
// ses trois actions, et il sait déjà poser une RANGÉE de petites cases —
// c'est ce qui sert aux couleurs et aux épaisseurs ailleurs. Les pages en
// sont une. Rien de neuf à apprendre, ni pour l'enseignant, ni pour qui
// relira. Ce chapitre vérifie surtout qu'on n'a RIEN RETIRÉ au passage : les
// trois actions portent chacune une demande écrite.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La bande des pages');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    const ouvrirLeRang = async () => {
        await page.evaluate(() => {
            const p = document.getElementById('panneau-appui');
            if (p) p.remove();
            document.getElementById('ecran-page-rang').click();
        });
        await page.waitForTimeout(250);
    };
    const lirePanneau = () => page.evaluate(() => {
        const p = document.getElementById('panneau-appui');
        if (!p) return null;
        const rangee = p.querySelector('.rp-rangee');
        return {
            titre: (p.querySelector('.rp-titre') || {}).textContent || '',
            pastilles: rangee ? Array.from(rangee.querySelectorAll('button'))
                .map(b => ({ mot: b.textContent.trim(), actif: b.classList.contains('actif'),
                             nom: b.title || '' })) : [],
            actions: Array.from(p.querySelectorAll('.rp-choix')).map(b => b.textContent.trim())
        };
    });

    // ------------------------------------------------------------------
    // 1. LE COIN NE BOUGE PAS D'UN PIXEL — c'est tout le choix de Q.
    //    On le mesure à une page, puis à douze : la même largeur.
    // ------------------------------------------------------------------
    const largeurDuCoin = () => page.evaluate(() => {
        const e = document.getElementById('ecran-pages');
        return e ? Math.round(e.getBoundingClientRect().width) : null;
    });
    const aUne = await largeurDuCoin();
    await page.evaluate(() => { for (let i = 0; i < 11; i++) ajouterUnePageVierge(); });
    await page.waitForTimeout(350);
    const aDouze = await largeurDuCoin();
    r.egal('le coin garde la même largeur à une page et à douze',
        aDouze, aUne, JSON.stringify({ aUne, aDouze }));
    r.verifie('et il reste un petit meuble : moins de 200 px',
        aUne !== null && aUne < 200, String(aUne));

    // LE RANG DIT QU'IL S'OUVRE — par un chevron DESSINÉ, pas écrit : six
    // contrôles ailleurs lisent le texte de ce bouton pour savoir où l'on est,
    // et « 2/3 » ne doit pas devenir « 2/3 ▾ ».
    const leRang = await page.evaluate(() => {
        const b = document.getElementById('ecran-page-rang');
        const ap = getComputedStyle(b, '::after');
        return { texte: b.textContent.trim(),
                 chevron: (ap.content || '').replace(/["']/g, ''),
                 bulle: b.getAttribute('data-tooltip') || b.title || '' };
    });
    r.verifie('le rang ne porte qu\'un nombre, sans ornement dans son texte',
        /^\d+\/\d+$/.test(leRang.texte), JSON.stringify(leRang));
    r.egal('le chevron est dessiné par la feuille de style', leRang.chevron, '▾',
        JSON.stringify(leRang));
    r.verifie('et son infobulle ne parle plus que de supprimer',
        /aller|pages du tableau/i.test(leRang.bulle) && /trier/i.test(leRang.bulle),
        leRang.bulle);

    // ------------------------------------------------------------------
    // 2. LA RANGÉE DES PAGES EST LÀ, ET ELLE DIT OÙ L'ON EST.
    // ------------------------------------------------------------------
    await page.evaluate(() => loadPage(10));
    await page.waitForTimeout(200);
    await ouvrirLeRang();
    const ouvert = await lirePanneau();
    r.verifie('le rang ouvre un panneau', !!ouvert, 'aucun panneau');
    r.egal('qui porte une pastille par page', ouvert && ouvert.pastilles.length, 12,
        JSON.stringify(ouvert && ouvert.pastilles.map(p => p.mot)));
    r.egal('numérotées de 1 à 12',
        ouvert && ouvert.pastilles.map(p => p.mot),
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        JSON.stringify(ouvert && ouvert.pastilles.map(p => p.mot)));
    r.egal('et celle où l\'on est est marquée',
        ouvert && ouvert.pastilles.map(p => p.actif).indexOf(true), 10,
        JSON.stringify(ouvert && ouvert.pastilles));
    // ON NE DÉRÉFÉRENCE PAS UNE PASTILLE QU'ON N'A PAS. Sans rangée, cette
    // ligne PLANTAIT le chapitre au lieu de le faire tomber — et un test qui
    // plante emporte tous les autres contrôles avec lui, si bien qu'on ne sait
    // plus ce qui marchait.
    r.verifie('chaque pastille porte son nom en toutes lettres, pour l\'infobulle',
        !!(ouvert && ouvert.pastilles[2] && /^Page 3 sur 12$/.test(ouvert.pastilles[2].nom)),
        JSON.stringify(ouvert && ouvert.pastilles[2]));

    // ------------------------------------------------------------------
    // 3. UNE PASTILLE Y MÈNE — EN UN SEUL APPUI.
    //
    //    C'est la demande : de la onzième à la troisième, huit appuis sur le
    //    ▶ d'avant, un seul ici.
    // ------------------------------------------------------------------
    const saut = await page.evaluate(() => {
        const avant = currentPageIndex;
        const p = document.getElementById('panneau-appui');
        const rangee = p ? p.querySelector('.rp-rangee') : null;
        const cases = rangee ? Array.from(rangee.querySelectorAll('button')) : [];
        if (cases[2]) cases[2].click();         // la page 3
        return { avant, apres: currentPageIndex, pastilles: cases.length,
                 panneauFerme: !document.getElementById('panneau-appui') };
    });
    await page.waitForTimeout(250);
    r.egal('un appui sur « 3 » mène à la page 3', saut.apres, 2, JSON.stringify(saut));
    r.egal('et le panneau se referme, le geste étant fait',
        saut.panneauFerme, true, JSON.stringify(saut));
    r.verifie('là où le ▶ en demandait huit',
        Math.abs(saut.avant - saut.apres) === 8, JSON.stringify(saut));

    // ------------------------------------------------------------------
    // 4. ON N'A RIEN RETIRÉ. Les trois actions du panneau portent chacune une
    //    demande écrite : le « ＋ » sorti du menu exprès, le trieur qu'on ne
    //    trouvait pas, et « supprimer facilement une page en mode plein écran
    //    (clic sur le numéro de page 2/3) ».
    // ------------------------------------------------------------------
    await ouvrirLeRang();
    const actions = await lirePanneau();
    r.verifie('« Nouvelle page » est toujours là',
        actions.actions.some(a => /nouvelle page/i.test(a)), JSON.stringify(actions.actions));
    r.verifie('« Trier les pages… » aussi',
        actions.actions.some(a => /trier/i.test(a)), JSON.stringify(actions.actions));
    r.verifie('et « Supprimer cette page » aussi',
        actions.actions.some(a => /supprimer/i.test(a)), JSON.stringify(actions.actions));
    r.verifie('le titre dit toujours où l\'on est',
        /^Page 3 sur 12$/.test(actions.titre), actions.titre);

    // ------------------------------------------------------------------
    // 5. SUR UNE PAGE SEULE, PAS DE RANGÉE : une bande d'un seul numéro est
    //    une bande de décor, et le panneau garde ses actions.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        pages.length = 1; currentPageIndex = 0;
        if (typeof majLesPagesDeLEcran === 'function') majLesPagesDeLEcran();
    });
    await ouvrirLeRang();
    const seule = await lirePanneau();
    r.egal('à une seule page, aucune pastille', seule.pastilles.length, 0,
        JSON.stringify(seule));
    r.verifie('mais les trois actions restent',
        seule.actions.some(a => /nouvelle page/i.test(a))
        && seule.actions.some(a => /supprimer/i.test(a)), JSON.stringify(seule.actions));
    await page.evaluate(() => {
        const p = document.getElementById('panneau-appui');
        if (p) p.remove();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
