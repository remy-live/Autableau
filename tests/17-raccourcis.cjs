// Les raccourcis clavier des outils : une touche par outil, écrite dans
// l'infobulle du bouton et reprise dans l'aide. Une seule table les décrit
// tous les trois — ce test vérifie qu'ils disent bien la même chose.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Raccourcis clavier');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof RACCOURCIS_OUTILS !== 'undefined', { timeout: 20000 });
    await page.waitForTimeout(1000);           // les barres flottantes se recopient

    // --- LA TABLE ELLE-MÊME ---
    const table = await page.evaluate(() => {
        const touches = RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).map(x => x.touche);
        const modesConnus = Array.from(document.querySelectorAll('.btn[data-mode]'))
            .map(b => b.dataset.mode);
        return {
            outils: RACCOURCIS_OUTILS.length,
            gestes: RACCOURCIS_GESTES.length,
            doublons: touches.length - new Set(touches).size,
            majuscules: touches.every(t => t === t.toUpperCase()),
            orphelins: RACCOURCIS_OUTILS.filter(o => !modesConnus.includes(o.mode)).map(o => o.mode),
            sansBouton: RACCOURCIS_GESTES.filter(g => !document.getElementById(g.bouton)).map(g => g.bouton),
            nommes: RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).every(x => !!x.nom)
        };
    });
    r.verifie('tous les outils courants ont leur touche', table.outils >= 15, JSON.stringify(table));
    r.egal('aucune touche n\'est attribuée deux fois', table.doublons, 0);
    r.verifie('elles sont toutes écrites en majuscule', table.majuscules);
    r.egal('chaque raccourci vise un outil qui existe', table.orphelins, []);
    r.egal('et chaque geste vise un bouton qui existe', table.sansBouton, []);
    r.verifie('chacun porte un nom lisible pour l\'aide', table.nommes);

    // --- LES TOUCHES CHANGENT VRAIMENT D'OUTIL ---
    const essais = [['c', 'freehand'], ['t', 'text'], ['g', 'eraser'], ['n', 'postit'],
                    ['p', 'laser'], ['1', 'point'], ['2', 'segment'], ['5', 'circle'],
                    ['7', 'polygon'], ['s', 'pointer']];
    const obtenus = [];
    for (const [touche] of essais) {
        await page.keyboard.press(touche);
        await page.waitForTimeout(90);
        obtenus.push(await page.evaluate(() => mode));
    }
    essais.forEach(([touche, attendu], i) => {
        r.egal(`« ${touche.toUpperCase()} » choisit ${attendu}`, obtenus[i], attendu);
    });

    // La majuscule marche aussi : on ne perd pas l'outil parce qu'on tient Maj
    await page.keyboard.press('G');
    await page.waitForTimeout(90);
    r.egal('la majuscule fait la même chose', await page.evaluate(() => mode), 'eraser');
    await page.keyboard.press('s');
    await page.waitForTimeout(90);

    // --- LES GESTES ---
    const gestes = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    await page.keyboard.press('l'); await page.waitForTimeout(120);
    await page.keyboard.press('a'); await page.waitForTimeout(120);
    await page.keyboard.press('x'); await page.waitForTimeout(120);
    const apres = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    r.verifie('« L » allume la loupe', apres.loupe !== gestes.loupe, JSON.stringify(apres));
    r.verifie('« A » bascule l\'aimant', apres.aimant !== gestes.aimant, JSON.stringify(apres));
    r.verifie('« X » fait avancer les axes', apres.axes !== gestes.axes, JSON.stringify(apres));
    await page.keyboard.press('l'); await page.keyboard.press('a');
    await page.waitForTimeout(120);

    // --- ON N'INTERCEPTE PAS CE QUE L'ON ÉCRIT ---
    const enSaisie = await page.evaluate(() => {
        const champ = document.createElement('input');
        document.body.appendChild(champ);
        champ.focus();
        const avant = mode;
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        champ.remove();
        return { avant, apres };
    });
    r.egal('taper dans un champ ne change pas d\'outil', enSaisie.apres, enSaisie.avant);

    const avecCtrl = await page.evaluate(() => {
        setMode('pointer');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        return mode;
    });
    r.egal('Ctrl+C reste Copier, il ne prend pas le crayon', avecCtrl, 'pointer');

    const souslaModale = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const avant = mode;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        document.getElementById('help-modal').style.display = 'none';
        return { avant, apres };
    });
    r.egal('une fenêtre ouverte garde le clavier pour elle', souslaModale.apres, souslaModale.avant);

    // --- LA TOUCHE SE LIT SUR LE BOUTON ---
    const surLesBoutons = await page.evaluate(() => {
        const manquants = RACCOURCIS_OUTILS.filter(o =>
            !document.querySelector('.btn[data-mode="' + o.mode + '"][data-raccourci="' + o.touche + '"]'));
        return {
            poses: document.querySelectorAll('[data-raccourci]').length,
            manquants: manquants.map(m => m.mode),
            // « data-tooltip » sert aussi de nom sous l'icône : il doit rester net
            tooltipPropre: !Array.from(document.querySelectorAll('[data-raccourci]'))
                .some(b => /\(\s*[A-Z0-9]\s*\)$/.test(b.getAttribute('data-tooltip') || ''))
        };
    });
    r.egal('chaque bouton d\'outil porte sa touche', surLesBoutons.manquants, []);
    r.verifie('toutes les copies des barres flottantes aussi', surLesBoutons.poses >= 20, String(surLesBoutons.poses));
    r.verifie('sans polluer le nom affiché sous l\'icône', surLesBoutons.tooltipPropre);

    await page.hover('.btn[data-mode="freehand"]');
    await page.waitForTimeout(800);
    const bulle = await page.evaluate(() => {
        const t = document.getElementById('dt-tooltip');
        return {
            visible: t.classList.contains('visible'),
            touche: (t.querySelector('.dt-touche') || {}).textContent,
            texte: t.textContent
        };
    });
    r.verifie('l\'infobulle s\'ouvre sur un outil', bulle.visible, JSON.stringify(bulle));
    r.egal('et montre sa touche', bulle.touche, 'C');
    r.verifie('à côté du nom de l\'outil, pas à la place', /Tracé|Libre/i.test(bulle.texte), bulle.texte);

    // --- L'AIDE DIT LA MÊME CHOSE QUE LE CLAVIER ---
    const aide = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const lire = (id) => Array.from(document.querySelectorAll('#' + id + ' div'))
            .map(d => ({ touche: d.querySelector('code').textContent, nom: d.textContent.trim() }));
        const outils = lire('aide-raccourcis-outils');
        const gestes = lire('aide-raccourcis-gestes');
        document.getElementById('help-modal').style.display = 'none';
        return {
            outils: outils.length, gestes: gestes.length,
            fidele: outils.every((l, i) => l.touche === RACCOURCIS_OUTILS[i].touche)
                 && gestes.every((l, i) => l.touche === RACCOURCIS_GESTES[i].touche),
            nomme: outils.every(l => l.nom.length > 2)
        };
    });
    r.egal('l\'aide liste tous les outils', aide.outils, table.outils);
    r.egal('et tous les gestes', aide.gestes, table.gestes);
    r.verifie('avec exactement les touches du clavier', aide.fidele, JSON.stringify(aide));
    r.verifie('et le nom de chacun', aide.nomme);

    // ==========================================================
    // PALETTE DE COMMANDES (Ctrl+K)
    // L'index n'est écrit nulle part : il est récolté dans la page. Une
    // commande ajoutée à l'interface doit donc être trouvable sans que
    // personne ait pensé à l'inscrire quelque part.
    // ==========================================================
    const recolte = await page.evaluate(() => {
        const c = recolterLesCommandes();
        const lieux = {};
        c.forEach(x => { lieux[x.lieu] = (lieux[x.lieu] || 0) + 1; });
        return {
            total: c.length,
            lieux: Object.keys(lieux).sort(),
            doublons: c.length - new Set(c.map(x => x.cle)).size,
            sansNom: c.filter(x => !x.nom.trim()).length,
            avecTouche: c.filter(x => x.touche).length
        };
    });
    r.verifie('la palette récolte largement plus de commandes que les seuls plugins',
        recolte.total > 150, 'récoltées : ' + recolte.total);
    r.verifie('elle couvre les outils, les plugins, la barre du bas, les styles et l\'explorateur',
        ['Outils', 'Barre du bas', 'Styles', 'Explorateur', 'Jeux'].every(l => recolte.lieux.includes(l)),
        recolte.lieux.join(', '));
    r.egal('aucune commande n\'apparaît deux fois', recolte.doublons, 0);
    r.egal('aucune commande sans nom', recolte.sansNom, 0);
    r.verifie('les outils affichent leur touche de clavier', recolte.avecTouche >= 15,
        'avec touche : ' + recolte.avecTouche);

    const recherches = await page.evaluate(() => {
        const trouver = (q) => filtrerLesCommandes(q, recolterLesCommandes());
        return {
            compas: trouver('compas').map(x => x.nom),
            classes: trouver('classes').map(x => x.nom),
            // Chercher le nom d'une catégorie sort les plugins qu'elle contient
            parCategorie: trouver('physique').map(x => x.lieu),
            // Deux mots dans le désordre trouvent la même chose
            ordre1: trouver('exporter tableau').map(x => x.nom),
            ordre2: trouver('tableau exporter').map(x => x.nom),
            rien: trouver('zzzzz').length,
            vide: trouver('   ').length
        };
    });
    r.verifie('« compas » trouve le compas', recherches.compas.includes('Compas'),
        JSON.stringify(recherches.compas));
    r.verifie('« classes » trouve « Mes classes »', recherches.classes.includes('Mes classes'),
        JSON.stringify(recherches.classes));
    r.verifie('chercher une catégorie sort ses plugins',
        recherches.parCategorie.includes('Physique-Chimie'), JSON.stringify(recherches.parCategorie));
    r.egal('l\'ordre des mots tapés n\'a pas d\'importance', recherches.ordre1, recherches.ordre2);
    r.egal('un mot introuvable ne rend rien', recherches.rien, 0);
    r.egal('une recherche vide non plus', recherches.vide, 0);

    // Le geste complet : Ctrl+K, on tape, on choisit, la commande part
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(120);
    let pal = await page.evaluate(() => ({
        ouverte: !document.getElementById('palette-commandes').hidden,
        focus: document.activeElement && document.activeElement.id
    }));
    r.verifie('Ctrl+K ouvre la palette', pal.ouverte);
    r.egal('le curseur est déjà dans le champ', pal.focus, 'pal-saisie');

    await page.keyboard.type('compas');
    await page.waitForTimeout(120);
    const liste = await page.evaluate(() => ({
        n: document.querySelectorAll('#pal-resultats .pal-item').length,
        premierActif: !!document.querySelector('#pal-resultats .pal-item.actif'),
        lieuAffiche: (document.querySelector('#pal-resultats .pal-lieu') || {}).textContent
    }));
    r.verifie('taper filtre la liste', liste.n >= 1 && liste.n <= 12, 'résultats : ' + liste.n);
    r.verifie('le premier résultat est déjà choisi', liste.premierActif);
    r.egal('et le résultat dit où la commande se trouve', liste.lieuAffiche, 'Outils');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    pal = await page.evaluate(() => ({
        fermee: document.getElementById('palette-commandes').hidden,
        compasArme: typeof activeWidgets !== 'undefined' && !!activeWidgets['compass']
    }));
    r.verifie('Entrée referme la palette', pal.fermee);
    r.verifie('et lance vraiment la commande', pal.compasArme);

    // Échap referme sans rien lancer
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const apresEchap = await page.evaluate(() =>
        document.getElementById('palette-commandes').hidden);
    r.verifie('Échap la referme', apresEchap);

    // Ctrl+K une seconde fois la referme : c'est une bascule
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(100);
    const bascule = await page.evaluate(() =>
        document.getElementById('palette-commandes').hidden);
    r.verifie('et Ctrl+K la referme aussi', bascule);

    // Ctrl+K ne doit pas se faire voler la touche par le raccourci d'outil
    const pasDeVol = await page.evaluate(() => mode);
    r.verifie('la touche K n\'a pas changé d\'outil au passage',
        pasDeVol !== 'freehand', 'mode : ' + pasDeVol);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
