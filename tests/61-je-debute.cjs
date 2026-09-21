// « JE DÉBUTE » : UNE ENTRÉE PAR LE MÉTIER, ET NON PAR LE CATALOGUE.
//
// « Je pense que ce qui serait top, c'est dans l'aide proposer un "je débute".
// On dit qu'on est prof de telle ou telle matière, ou prof des écoles, et il
// nous montre ce qui est disponible comme plugin. Qu'en penses-tu ? »
//
// Quatre-vingt-dix outils rangés en douze rubriques, c'est un catalogue de
// vente par correspondance : on ne sait pas par où commencer, et l'on referme.
// On demande donc une seule chose — ce qu'on enseigne — et l'on ne montre que
// ce qui sert, avec de quoi en faire une barre d'un geste.
//
// LA GARDE LA PLUS IMPORTANTE EST LA DERNIÈRE. La table des métiers est écrite
// à la main ; le catalogue, lui, se lit dans la page. Deux listes côte à côte
// finissent toujours par diverger : une rubrique ajoutée demain et oubliée ici
// serait invisible pour tout le monde, et une rubrique écrite ici mais
// disparue là-bas serait une promesse vide. On vérifie donc les deux sens.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Je débute');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // LA PORTE : DANS L'AIDE, À CÔTÉ DE LA DÉMONSTRATION
    // ------------------------------------------------------------------
    const porte = await page.evaluate(async () => {
        const b = document.getElementById('btn-je-debute');
        return {
            la: !!b,
            texte: b ? b.innerText.trim() : '',
            dansLAide: !!(b && b.closest('#help-modal'))
        };
    });
    r.verifie('« Je débute » a son bouton', porte.la, JSON.stringify(porte));
    r.verifie('dans l\'aide', porte.dansLAide, JSON.stringify(porte));
    r.verifie('et il le dit en toutes lettres', /débute/i.test(porte.texte), porte.texte);

    const ouverte = await page.evaluate(async () => {
        ouvrirJeDebute();
        await new Promise(ok => setTimeout(ok, 150));
        const metiers = [...document.querySelectorAll('.debut-metier')];
        return {
            vue: getComputedStyle(document.getElementById('debut-modal')).display !== 'none',
            question: document.getElementById('debut-question').innerText,
            metiers: metiers.map(m => m.querySelector('.debut-metier-nom').innerText),
            resultatVide: document.getElementById('debut-resultat').innerText.trim(),
            composerVu: getComputedStyle(document.getElementById('debut-composer')).display !== 'none'
        };
    });
    r.verifie('la fenêtre s\'ouvre', ouverte.vue, JSON.stringify(ouverte));
    r.verifie('sur une seule question', /enseign/i.test(ouverte.question), ouverte.question);
    r.verifie('le professeur des écoles y est',
        ouverte.metiers.some(m => /écoles/i.test(m)), JSON.stringify(ouverte.metiers));
    r.verifie('les mathématiques aussi',
        ouverte.metiers.some(m => /math/i.test(m)), JSON.stringify(ouverte.metiers));
    r.verifie('et « autre chose », pour ceux qu\'aucune case ne contient',
        ouverte.metiers.some(m => /autre/i.test(m)), JSON.stringify(ouverte.metiers));
    r.egal('rien n\'est montré tant qu\'on n\'a pas répondu', ouverte.resultatVide, '');
    r.egal('et il n\'y a pas de barre à composer', ouverte.composerVu, false);

    // ------------------------------------------------------------------
    // CE QU'ON MONTRE DÉPEND DE CE QU'ON ENSEIGNE
    // ------------------------------------------------------------------
    const parMetier = await page.evaluate(async () => {
        const choisir = async (cle) => {
            document.querySelector('.debut-metier[data-metier="' + cle + '"]').click();
            await new Promise(ok => setTimeout(ok, 150));
            // ON LIT CE QUI EST ÉCRIT, ET NON CE QUI EST PEINT. La feuille de
            // style met les titres de rubrique en capitales : « innerText » les
            // rendrait ainsi, et une recherche de « Français » y échouerait —
            // pire, une recherche de ce qui NE DOIT PAS y être réussirait pour
            // de mauvaises raisons.
            return {
                rubriques: [...document.querySelectorAll('.debut-groupe-titre')].map(t => t.textContent),
                outils: [...document.querySelectorAll('.debut-outil:not(.debut-reste)')].map(o => o.textContent.trim()),
                // Ce que le métier reçoit vraiment, et non ce que l'aperçu montre.
                combien: outilsDuMetier(metierDeCle(cle)).length,
                compte: document.getElementById('debut-compte').textContent,
                composerVu: getComputedStyle(document.getElementById('debut-composer')).display !== 'none',
                choisi: document.querySelector('.debut-metier.choisi').dataset.metier
            };
        };
        return {
            ecole: await choisir('ecole'),
            musique: await choisir('musique'),
            autre: await choisir('autre'),
            total: catalogueDesOutils().length
        };
    });

    const rubriquesEcole = parMetier.ecole.rubriques.join(' | ');
    r.verifie('le professeur des écoles reçoit du français',
        /Français/.test(rubriquesEcole), rubriquesEcole);
    r.verifie('et des mathématiques', /Maths/.test(rubriquesEcole), rubriquesEcole);
    r.verifie('mais pas la physique-chimie du collège',
        !/Physique/.test(rubriquesEcole), rubriquesEcole);
    r.verifie('le choix fait est marqué', parMetier.ecole.choisi === 'ecole', parMetier.ecole.choisi);

    const rubriquesMusique = parMetier.musique.rubriques.join(' | ');
    r.verifie('l\'éducation musicale reçoit sa rubrique',
        /Musique/.test(rubriquesMusique), rubriquesMusique);
    r.verifie('et pas le français', !/Français/.test(rubriquesMusique), rubriquesMusique);
    r.verifie('le piano est bien dans la liste',
        /[Pp]iano/.test(parMetier.musique.outils.join(' | ')), parMetier.musique.outils.join(' | '));

    // LES OUTILS COMMUNS SONT POUR TOUT LE MONDE : on écrit et on trace quelle
    // que soit la matière, et le tirage au sort ne connaît pas les disciplines.
    ['ecole', 'musique', 'autre'].forEach(cle => {
        const rubriques = parMetier[cle].rubriques.join(' | ');
        r.verifie('« ' + cle + ' » garde les outils du professeur',
            /Outils Profs/.test(rubriques), rubriques);
        r.verifie('« ' + cle + ' » garde de quoi écrire et tracer',
            /Écrire et tracer/.test(rubriques), rubriques);
    });

    r.verifie('« autre chose » ne reçoit que les outils communs',
        !/Musique|Français|Maths|Physique|Histoire|Informatique/.test(parMetier.autre.rubriques.join(' | ')),
        parMetier.autre.rubriques.join(' | '));
    r.verifie('chacun en reçoit moins que tout le catalogue',
        parMetier.ecole.outils.length < parMetier.total
        && parMetier.autre.outils.length < parMetier.ecole.outils.length,
        JSON.stringify({ ecole: parMetier.ecole.outils.length, autre: parMetier.autre.outils.length, total: parMetier.total }));

    // LE COMPTE ANNONCÉ DOIT ÊTRE LE VRAI. Un chiffre décoratif est pire que
    // pas de chiffre : on le croit.
    // ON NE DÉVERSE PLUS LA LISTE ENTIÈRE. « Tu fais la liste des outils, on ne
    // comprend pas » : cinquante noms à la suite, c'est le catalogue déguisé.
    // Chaque rubrique montre son compte et quatre noms, le reste est annoncé.
    r.verifie('le compte annoncé est celui du métier, et il est juste',
        parMetier.ecole.compte.includes(String(parMetier.ecole.combien)),
        parMetier.ecole.compte + ' — pour ' + parMetier.ecole.combien + ' outils');
    r.verifie('on en montre quelques-uns, pas tous',
        parMetier.ecole.outils.length < parMetier.ecole.combien,
        parMetier.ecole.outils.length + ' montrés sur ' + parMetier.ecole.combien);
    r.verifie('chaque rubrique dit combien elle en porte',
        parMetier.ecole.rubriques.every(t => /— \d+ outils?$/.test(t)),
        JSON.stringify(parMetier.ecole.rubriques));
    r.verifie('et il dit aussi combien l\'application en compte',
        parMetier.ecole.compte.includes(String(parMetier.total)),
        parMetier.ecole.compte + ' — sur ' + parMetier.total);
    r.verifie('la barre à composer paraît une fois qu\'on a répondu',
        parMetier.ecole.composerVu, JSON.stringify(parMetier.ecole));

    // ------------------------------------------------------------------
    // DE LA LISTE À LA BARRE, D'UN GESTE
    // ------------------------------------------------------------------
    const barre = await page.evaluate(async () => {
        document.querySelector('.debut-metier[data-metier="musique"]').click();
        await new Promise(ok => setTimeout(ok, 120));
        const attendus = [...document.querySelectorAll('.debut-outil')].length;
        document.getElementById('debut-composer').click();
        await new Promise(ok => setTimeout(ok, 250));
        const compo = document.getElementById('compositeur-de-barre');
        return {
            ouvert: !!compo,
            debutFerme: getComputedStyle(document.getElementById('debut-modal')).display === 'none',
            coches: compo ? compo.querySelectorAll('.compo-outil input:checked').length : 0,
            attendus,
            nom: compo ? compo.querySelector('#compo-nom').value : '',
            filtre: compo ? compo.querySelector('#compo-chercher').value : '',
            total: compo ? compo.querySelectorAll('.compo-outil').length : 0,
            montres: compo ? [...compo.querySelectorAll('.compo-outil')]
                .filter(l => l.style.display !== 'none').length : 0,
            compte: compo ? compo.querySelector('#compo-compte').textContent : ''
        };
    });
    r.verifie('« Composer ma barre » ouvre le compositeur', barre.ouvert, JSON.stringify(barre));
    r.verifie('et referme la fenêtre de départ', barre.debutFerme, JSON.stringify(barre));
    // ET IL EN COCHE SIX, PAS CINQUANTE. « Après, tu surcharges la toolbar de
    // base de gauche, pas ouf. » Cocher les cinquante outils d'un métier
    // faisait une barre illisible ; n'en cocher aucun rendait à un débutant la
    // question qu'il venait de poser. Les six essentiels sont le milieu : on
    // part de quelque chose, on enlève ce qu'on ne veut pas.
    r.egal('les six essentiels sont cochés, et eux seuls', barre.coches, 6);
    r.verifie('le compositeur le dit', /6 outils/i.test(barre.compte), barre.compte);
    r.verifie('mais il s\'ouvre filtré sur la matière',
        /musique/i.test(barre.filtre), barre.filtre);
    r.verifie('et ce qu\'il montre est bien moins que tout le catalogue',
        barre.montres > 0 && barre.montres < barre.total,
        barre.montres + ' montrés sur ' + barre.total);
    r.verifie('et la barre porte déjà un nom',
        /musical|musique/i.test(barre.nom), barre.nom);

    await page.evaluate(() => {
        const c = document.getElementById('compositeur-de-barre');
        if (c) c.querySelector('#compo-annuler').click();
    });

    // ------------------------------------------------------------------
    // LES DEUX LISTES NE DOIVENT PAS DIVERGER
    // ------------------------------------------------------------------
    const listes = await page.evaluate(() => {
        const catalogue = catalogueDesOutils();
        const duCatalogue = new Set(catalogue.map(o => o.categorie));
        const reclamees = new Set(DEBUT_COMMUNES);
        DEBUT_METIERS.forEach(m => m.rubriques.forEach(x => reclamees.add(x)));
        return {
            orphelines: [...duCatalogue].filter(c => !reclamees.has(c)),
            fantomes: [...reclamees].filter(c => !duCatalogue.has(c)),
            metiers: DEBUT_METIERS.length
        };
    });
    r.egal('aucune rubrique du catalogue n\'est oubliée par tous les métiers',
        listes.orphelines, []);
    r.egal('et aucune rubrique réclamée ici n\'a disparu du catalogue',
        listes.fantomes, []);
    r.verifie('les métiers sont assez nombreux pour que la question ait un sens',
        listes.metiers >= 6, String(listes.metiers));

    // ==================================================================
    // LES SIX ESSENTIELS
    //
    // « Tu fais la liste des outils, on ne comprend pas. » La rubrique, son
    // compte et les quatre premiers noms qu'elle contient : c'était encore le
    // catalogue, simplement découpé en parts. Six outils NOMMÉS par métier, et
    // dans l'ordre où l'on s'en sert.
    //
    // LA GARDE EST QU'ILS SOIENT RETROUVÉS, et non qu'il y en ait six. Ils ont
    // d'abord été écrits en clés de plugin — « pianoTool » — alors que le
    // catalogue s'identifie par les noms français : la liste revenait vide,
    // le compositeur s'ouvrait sans rien de coché, et TOUT LE CHAPITRE PASSAIT
    // comme avant. Un défaut qui ne casse rien est celui qu'il faut nommer.
    // ==================================================================
    const six = await page.evaluate(() => {
        const catalogue = catalogueDesOutils();
        const ids = new Set(catalogue.map(o => o.id));
        const introuvables = {};
        const comptes = {};
        Object.keys(DEBUT_ESSENTIELS).forEach(cle => {
            const liste = DEBUT_ESSENTIELS[cle];
            comptes[cle] = liste.length;
            const perdus = liste.filter(x => !ids.has(x));
            if (perdus.length) introuvables[cle] = perdus;
        });
        return {
            introuvables, comptes,
            metiers: Object.keys(DEBUT_ESSENTIELS).sort(),
            attendus: DEBUT_METIERS.map(m => m.cle).sort(),
            // Ce que la fonction rend vraiment, et non ce que la table promet.
            rendus: DEBUT_METIERS.map(m => essentielsDuMetier(m).length),
            // Deux fois le même outil dans une barre de six, c'est une place
            // perdue sur six.
            doublons: Object.keys(DEBUT_ESSENTIELS)
                .filter(c => new Set(DEBUT_ESSENTIELS[c]).size !== DEBUT_ESSENTIELS[c].length)
        };
    });
    r.egal('chaque outil essentiel existe bel et bien dans le catalogue',
        six.introuvables, {});
    r.egal('chaque métier a les siens', six.metiers, six.attendus);
    r.verifie('ils sont six partout',
        Object.keys(six.comptes).every(c => six.comptes[c] === 6), JSON.stringify(six.comptes));
    r.verifie('et six sont vraiment rendus, pas cinq ni zéro',
        six.rendus.every(n => n === 6), JSON.stringify(six.rendus));
    r.egal('aucun n\'est nommé deux fois', six.doublons, []);

    // ON LES VOIT, AVEC LEUR DESSIN. Un nom seul ne dit rien ; le dessin, lui,
    // est celui qu'on retrouvera dans le tiroir des outils.
    const vus = await page.evaluate(async () => {
        ouvrirJeDebute();
        document.querySelector('.debut-metier[data-metier="lettres"]').click();
        await new Promise(ok => setTimeout(ok, 150));
        const cartes = [...document.querySelectorAll('.debut-six-outil')];
        const bloc = document.getElementById('debut-six');
        const resultat = document.getElementById('debut-resultat');
        return {
            combien: cartes.length,
            noms: cartes.map(c => c.querySelector('.debut-six-nom').textContent),
            avecDessin: cartes.filter(c => c.querySelector('.debut-six-icone svg')).length,
            // Ils passent AVANT les rubriques : c'est par eux qu'on commence.
            avantLesRubriques: !!bloc && [...resultat.children].indexOf(bloc) === 0,
            creerVu: getComputedStyle(document.getElementById('debut-creer')).display !== 'none',
            creerTexte: document.getElementById('debut-creer').textContent.trim(),
            composerTexte: document.getElementById('debut-composer').textContent.trim()
        };
    });
    r.egal('les six paraissent', vus.combien, 6);
    r.verifie('le conjugueur est du nombre, pour le professeur de lettres',
        vus.noms.some(n => /[Cc]onjug/.test(n)), JSON.stringify(vus.noms));
    r.verifie('et la dictée aussi',
        vus.noms.some(n => /dict/i.test(n)), JSON.stringify(vus.noms));
    r.egal('chacun montre son dessin', vus.avecDessin, 6);
    r.verifie('ils passent avant les rubriques', vus.avantLesRubriques, JSON.stringify(vus));
    r.verifie('le bouton qui fait la barre est là', vus.creerVu, JSON.stringify(vus));
    r.verifie('et il dit qu\'il la crée', /cr[ée]er/i.test(vus.creerTexte), vus.creerTexte);
    r.verifie('l\'autre laisse choisir soi-même', /choisir/i.test(vus.composerTexte),
        vus.composerTexte);

    // UN APPUI, UNE BARRE. On ne rend pas un compositeur de quatre-vingt-dix
    // cases à quelqu'un qui vient de demander par où commencer.
    const faite = await page.evaluate(async () => {
        localStorage.removeItem('board_floating_toolbars');
        renderFloatingToolbars();
        document.querySelector('.debut-metier[data-metier="musique"]').click();
        await new Promise(ok => setTimeout(ok, 120));
        // La barre principale du tableau existe toujours, et se refait toute
        // seule : on compte donc CE QUI S'AJOUTE, et l'on cherche la sienne
        // par son nom plutôt que par son rang.
        const avant = getStoredFloatingToolbars().length;
        const fait = creerLaBarreDuMetier();
        await new Promise(ok => setTimeout(ok, 200));
        const barres = getStoredFloatingToolbars();
        const mienne = barres.find(b => /musi/i.test(b.name || ''));
        return {
            fait, avant, combien: barres.length, laTrouve: !!mienne,
            nom: mienne ? mienne.name : '',
            outils: mienne ? mienne.items.length : 0,
            colonnes: mienne ? mienne.cols : 0,
            repliee: mienne ? !!mienne.minimized : null,
            aDroite: mienne ? mienne.x > window.innerWidth / 2 : null,
            dessinee: mienne ? document.querySelectorAll('#custom-bars-container .custom-toolbar[data-toolbar-id="' + mienne.id + '"]').length : 0,
            debutFerme: getComputedStyle(document.getElementById('debut-modal')).display === 'none'
        };
    });
    r.verifie('un appui pose la barre', faite.fait === true, JSON.stringify(faite));
    r.verifie('on la retrouve à son nom', faite.laTrouve, JSON.stringify(faite));
    r.egal('une barre de plus, pas deux', faite.combien, faite.avant + 1);
    r.egal('elle porte les six', faite.outils, 6);
    r.verifie('elle porte le nom du métier', /musi/i.test(faite.nom), faite.nom);
    r.egal('sur deux colonnes, pour qu\'on la lise d\'un coup d\'œil', faite.colonnes, 2);
    r.verifie('elle n\'arrive pas repliée', faite.repliee === false, JSON.stringify(faite));
    r.verifie('et à droite, loin de la barre d\'écriture', faite.aDroite, JSON.stringify(faite));
    r.verifie('elle est vraiment dessinée', faite.dessinee >= 1, JSON.stringify(faite));
    r.verifie('et la fenêtre se referme', faite.debutFerme, JSON.stringify(faite));

    // ON N'EN FAIT PAS DEUX. Revenir et appuyer à nouveau remplace la sienne
    // plutôt que d'en empiler une seconde, identique, par-dessus.
    const deuxFois = await page.evaluate(async () => {
        ouvrirJeDebute();
        document.querySelector('.debut-metier[data-metier="musique"]').click();
        await new Promise(ok => setTimeout(ok, 120));
        creerLaBarreDuMetier();
        await new Promise(ok => setTimeout(ok, 150));
        const deMetier = () => getStoredFloatingToolbars()
            .filter(b => DEBUT_METIERS.some(m => m.nom === b.name));
        const apresMeme = deMetier().length;
        ouvrirJeDebute();
        document.querySelector('.debut-metier[data-metier="lettres"]').click();
        await new Promise(ok => setTimeout(ok, 120));
        creerLaBarreDuMetier();
        await new Promise(ok => setTimeout(ok, 150));
        return { apresMeme, apresAutre: deMetier().length,
                 noms: deMetier().map(b => b.name) };
    });
    r.egal('appuyer deux fois pour le même métier ne fait qu\'une barre', deuxFois.apresMeme, 1);
    r.egal('mais un autre métier a la sienne', deuxFois.apresAutre, 2);

    // « CHOISIR MOI-MÊME » PART DES SIX, et non de rien.
    const aLaMain = await page.evaluate(async () => {
        ouvrirJeDebute();
        document.querySelector('.debut-metier[data-metier="musique"]').click();
        await new Promise(ok => setTimeout(ok, 120));
        document.getElementById('debut-composer').click();
        await new Promise(ok => setTimeout(ok, 250));
        const compo = document.getElementById('compositeur-de-barre');
        const coches = compo ? [...compo.querySelectorAll('.compo-outil input:checked')] : [];
        return {
            ouvert: !!compo,
            coches: coches.length,
            // ET CE QU'ON A COCHÉ NE SE CACHE PAS DERRIÈRE LE FILTRE : deux
            // des six sont hors de la matière, et le filtre les effaçait — on
            // lisait « 6 outils » en n'en voyant que quatre.
            cochesVisibles: coches.filter(i => {
                const l = i.closest('.compo-outil');
                return l && l.style.display !== 'none';
            }).length,
            filtre: compo ? compo.querySelector('#compo-chercher').value : '',
            compte: compo ? compo.querySelector('#compo-compte').textContent : ''
        };
    });
    r.verifie('« Choisir moi-même » ouvre bien le compositeur', aLaMain.ouvert, JSON.stringify(aLaMain));
    r.egal('les six y sont déjà cochés', aLaMain.coches, 6);
    r.egal('et tous les six se voient, malgré le filtre', aLaMain.cochesVisibles, 6);
    r.verifie('qui reste posé sur la matière', /musi/i.test(aLaMain.filtre), aLaMain.filtre);
    r.verifie('et le compte annoncé est celui-là', /6/.test(aLaMain.compte), aLaMain.compte);

    await page.evaluate(() => {
        const c = document.getElementById('compositeur-de-barre');
        if (c) c.querySelector('#compo-annuler').click();
        localStorage.removeItem('board_floating_toolbars');
        renderFloatingToolbars();
        fermerJeDebute();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
