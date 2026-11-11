// L'EXPORT DE TOUTES LES PAGES SE TROUVE.
//
// « Je ne l'utilise mais je n'ai pas trouvé l'export pdf des pages... Je m'en
// servais avec mon précédent logiciel pour partager le cours avec mes élèves.
// On peut exporter seulement une page mais pas une collection de pages, j'ai
// l'impression. »
//
// LA FONCTION EXISTAIT, ET ELLE MARCHE : « exportAllPagesPdf » tourne même les
// pages d'un polycopié feuilletable, qui tient sur une seule feuille de
// tableau. Rien à construire. Trois endroits la rendaient invisible, et tous
// les trois promettaient UNE page :
//
//   l'entrée du menu disait « Exporter la page… » ;
//   le titre de la fenêtre disait « Exporter la page courante » ;
//   et le choix « Toutes les pages » ne paraissait QU'APRÈS avoir cliqué
//   « PDF » — un détour qu'il fallait deviner.
//
// Qui ouvrait cette fenêtre y voyait des formats, lisait deux fois « la
// page », et concluait très raisonnablement que cela n'existait pas. C'est le
// même mal que le trieur de pages : une capacité réelle, derrière un mot qui
// dit le contraire.
//
// CE CHAPITRE NE MESURE PAS QUE LES MOTS. Un libellé peut être juste et le
// chemin rester fermé : on éprouve donc aussi que le choix est ATTEIGNABLE dès
// l'ouverture, et que demander toutes les pages suffit — le format se choisit
// tout seul, parce que l'enseignant a dit ce qu'il voulait, pas par quel
// moyen.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Exporter toutes les pages se trouve');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    const ouvrirLaFenetre = async () => {
        await page.evaluate(() => {
            const b = document.getElementById('btn-export-page');
            if (b) b.click();
        });
        await page.waitForTimeout(250);
    };
    const fermerLaFenetre = async () => {
        await page.evaluate(() => {
            const p = document.getElementById('export-popover');
            if (p) p.classList.remove('visible');
        });
        await page.waitForTimeout(120);
    };
    const etat = () => page.evaluate(() => {
        const sc = document.getElementById('export-scope-container');
        const vu = (el) => !!(el && el.offsetParent !== null);
        return {
            titre: (document.getElementById('export-popover-title') || {}).innerText || '',
            porteeVisible: vu(sc),
            regleVisible: vu(document.getElementById('export-portee-pdf')),
            choix: Array.from(document.querySelectorAll('.btn-scope-choice'))
                .map(b => b.dataset.scope),
            format: typeof selectedFormat !== 'undefined' ? selectedFormat : null,
            portee: typeof selectedScope !== 'undefined' ? selectedScope : null,
            bouton: (document.getElementById('btn-do-export') || {}).innerText || ''
        };
    });

    // ------------------------------------------------------------------
    // 1. LE MENU NE PROMET PLUS UNE SEULE PAGE.
    // ------------------------------------------------------------------
    const entree = await page.evaluate(() => {
        const b = document.getElementById('btn-export-page');
        return b ? b.textContent.trim() : null;
    });
    r.verifie('l\'entrée du menu ne dit plus « la page »',
        entree && !/\bla page\b/i.test(entree), entree);
    r.verifie('et elle nomme le PDF, qui est ce qu\'on vient y chercher',
        entree && /pdf/i.test(entree), entree);

    // ------------------------------------------------------------------
    // 2. SUR UN TABLEAU D'UNE SEULE PAGE, RIEN NE MENT NI N'ENCOMBRE.
    //    Le choix de la portée n'a aucun sens là : il ne paraît pas.
    // ------------------------------------------------------------------
    await ouvrirLaFenetre();
    const seule = await etat();
    r.egal('sur une page unique, la portée ne paraît pas',
        seule.porteeVisible, false, JSON.stringify(seule));
    r.verifie('et le titre ne parle que de cette page',
        /cette page/i.test(seule.titre) && !/toutes/i.test(seule.titre), seule.titre);
    await fermerLaFenetre();

    // ------------------------------------------------------------------
    // 3. DÈS QU'IL Y A PLUSIEURS PAGES, LE CHOIX EST LÀ — SANS RIEN CLIQUER.
    //    C'est le cœur du défaut : il fallait d'abord trouver « PDF ».
    // ------------------------------------------------------------------
    await page.evaluate(() => { ajouterUnePageVierge(); ajouterUnePageVierge(); });
    await page.waitForTimeout(250);
    await ouvrirLaFenetre();
    const plusieurs = await etat();
    r.egal('à trois pages, le choix de la portée est visible DÈS L\'OUVERTURE',
        plusieurs.porteeVisible, true, JSON.stringify(plusieurs));
    r.egal('et il propose bien les deux portées',
        plusieurs.choix, ['page', 'all'], JSON.stringify(plusieurs));
    r.verifie('le titre annonce les deux, au lieu de promettre une page',
        /toutes/i.test(plusieurs.titre), plusieurs.titre);
    r.egal('aucun format n\'a encore été choisi : le choix n\'en dépend pas',
        plusieurs.format, null, JSON.stringify(plusieurs));
    r.egal('et la règle est dite : plusieurs pages ne sortent qu\'en PDF',
        plusieurs.regleVisible, true, JSON.stringify(plusieurs));

    // ------------------------------------------------------------------
    // 4. DEMANDER TOUTES LES PAGES SUFFIT : LE FORMAT SE CHOISIT TOUT SEUL.
    //
    //    L'enseignant a dit ce qu'il voulait ; le format n'est qu'un moyen, et
    //    lui demander de réparer une contrainte qu'il n'a pas choisie, c'est
    //    lui laisser le travail de la machine.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        document.querySelector('.btn-scope-choice[data-scope="all"]').click();
    });
    await page.waitForTimeout(250);
    const toutes = await etat();
    r.egal('demander toutes les pages choisit le PDF', toutes.format, 'pdf',
        JSON.stringify(toutes));
    r.egal('et la portée reste bien « toutes »', toutes.portee, 'all',
        JSON.stringify(toutes));
    r.verifie('le bouton d\'action le dit en toutes lettres',
        /toutes les pages/i.test(toutes.bouton), toutes.bouton);
    r.egal('la règle se tait, puisqu\'elle est satisfaite',
        toutes.regleVisible, false, JSON.stringify(toutes));

    // ------------------------------------------------------------------
    // 5. UN FORMAT QUI NE SAIT PAS FAIRE PLUSIEURS PAGES NE FAIT PAS
    //    DISPARAÎTRE LE CHOIX — il le ramène sur « cette page ». Le cacher,
    //    c'était effacer la capacité de l'écran dès qu'on regardait ailleurs.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        document.querySelector('.btn-format-choice[data-format="png"]').click();
    });
    await page.waitForTimeout(250);
    const enPng = await etat();
    r.egal('en PNG, le choix de la portée reste à l\'écran',
        enPng.porteeVisible, true, JSON.stringify(enPng));
    r.egal('mais il est revenu sur « cette page »', enPng.portee, 'page',
        JSON.stringify(enPng));
    r.egal('et la règle reparaît pour dire pourquoi',
        enPng.regleVisible, true, JSON.stringify(enPng));

    // Et l'on peut repartir de là vers toutes les pages, d'un seul geste.
    await page.evaluate(() => {
        document.querySelector('.btn-scope-choice[data-scope="all"]').click();
    });
    await page.waitForTimeout(250);
    const retour = await etat();
    r.egal('un seul geste ramène aux toutes les pages, PDF compris',
        [retour.portee, retour.format], ['all', 'pdf'], JSON.stringify(retour));

    // ------------------------------------------------------------------
    // 6. ET LA FONCTION EST BIEN CELLE QUI TOURNE LES PAGES. On ne lance pas
    //    l'export — il écrit un fichier — mais on vérifie que le chemin existe
    //    et que c'est lui qui sera pris.
    // ------------------------------------------------------------------
    const moteur = await page.evaluate(() => ({
        existe: typeof exportAllPagesPdf === 'function',
        plusieurs: typeof plusieursPagesASortir === 'function' ? plusieursPagesASortir() : null
    }));
    r.egal('l\'export de toutes les pages existe et sera appelé',
        [moteur.existe, moteur.plusieurs], [true, true], JSON.stringify(moteur));
    await fermerLaFenetre();

    // ------------------------------------------------------------------
    // 7. UN POLYCOPIÉ FEUILLETABLE COMPTE AUSSI. Il tient sur UNE feuille de
    //    tableau mais porte douze pages : « Toutes les pages » les tourne, et
    //    le choix doit donc paraître même sur un tableau d'une seule feuille.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        while (pages.length > 1) { pages.pop(); }
        currentPageIndex = 0;
        images.length = 0;
        images.push({ id: nextId++, x: 0, y: 0, w: 100, h: 140, cx: 0, cy: 0,
                      cw: 100, ch: 140, src: 'x', z: globalZ++,
                      pluginData: { id: 'pdfDoc', cle: 'k', pages: 12, page: 1, nom: 'poly' } });
    });
    await ouvrirLaFenetre();
    const feuilletable = await etat();
    r.egal('un polycopié de douze pages sur une seule feuille montre le choix',
        feuilletable.porteeVisible, true, JSON.stringify(feuilletable));
    r.verifie('et le titre ne promet pas une page unique',
        /toutes/i.test(feuilletable.titre), feuilletable.titre);
    await fermerLaFenetre();

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
