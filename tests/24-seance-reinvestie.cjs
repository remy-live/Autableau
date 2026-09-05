// LA SÉANCE : UNE PRÉPARATION, PLUSIEURS TRACES.
// On fait le même cours à quatre classes. Un tableau porte deux choses mêlées :
// la PRÉPARATION — l'énoncé, le document, les figures posées avant le cours —
// et la TRACE DE CLASSE, ce qui a été écrit devant les élèves. Pour refaire la
// séance, il fallait rouvrir la précédente et effacer à la main, en espérant ne
// pas effacer l'énoncé au passage.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Séance réinvestie');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await tableauVierge(page);

    // Une séance : d'abord la préparation, puis le cours par-dessus.
    const posee = await page.evaluate(async () => {
        await ClassesStore.saveAll([
            { id: 'c41', name: '4e 1', students: [] },
            { id: 'c42', name: '4e 2', students: [] },
            { id: 'c43', name: '4e 3', students: [] }
        ]);
        texts.push({ id: nextId++, x: 20, y: 20, content: 'Théorème de Thalès', fontSize: 30, color: '#000', z: globalZ++ });
        segments.push({ id: nextId++, x1: 0, y1: 100, x2: 300, y2: 100, color: '#000', width: 2, z: globalZ++ });
        saveState();
        const pages_marquees = marquerLaPreparation();

        // Ce qu'on écrit devant les élèves
        for (let i = 0; i < 6; i++) {
            freehands.push({ id: nextId++, points: [{ x: i * 20, y: 200 }, { x: i * 20 + 15, y: 260 }], color: '#d63031', width: 5, z: globalZ++ });
            saveState();
        }
        savedTableaux = [];
        syncPage();
        await localforage.setItem('data_tb_seance', stateForStorage());
        savedTableaux.push({ id: 'tb_seance', name: 'Thalès — 4e 1', timestamp: Date.now(),
                             classeId: 'c41', classeNom: '4e 1' });
        await localforage.setItem('auTableau_tableaux_list', savedTableaux);
        return { pages_marquees, textes: texts.length, traits: freehands.length };
    });
    r.egal('marquer la préparation retient toutes les pages', posee.pages_marquees, 1);
    r.egal('la séance faite compte l\'énoncé ET la trace du cours',
        { textes: posee.textes, traits: posee.traits }, { textes: 1, traits: 6 });

    // --- RÉINVESTIR AVEC UNE AUTRE CLASSE ---
    const refaite = await page.evaluate(async () => {
        const fiche = await reinvestirLaSeance('tb_seance', 'c42', '4e 2');
        const neuf = await localforage.getItem('data_' + fiche.id);
        const origine = await localforage.getItem('data_tb_seance');
        const p = neuf.pages[0], po = origine.pages[0];
        return {
            id: fiche.id, nom: fiche.name, classe: fiche.classeNom, origine: fiche.seanceOrigine,
            reprise: {
                textes: (p.texts || []).length, segments: (p.segments || []).length,
                traits: (p.freehands || []).length,
                titre: (p.texts || [])[0] ? p.texts[0].content : null,
                gardeSaPreparation: !!p.preparation,
                film: (p.film || []).length, historique: (p.history || []).length
            },
            intacte: { textes: (po.texts || []).length, traits: (po.freehands || []).length }
        };
    });

    // CE QUI FAIT TOUT L'INTÉRÊT : l'énoncé revient, le cours non.
    r.egal('la séance refaite retrouve la préparation entière',
        { textes: refaite.reprise.textes, segments: refaite.reprise.segments, titre: refaite.reprise.titre },
        { textes: 1, segments: 1, titre: 'Théorème de Thalès' });
    r.egal('et rien de ce qui a été écrit devant l\'autre classe',
        refaite.reprise.traits, 0);
    r.egal('la séance d\'origine, elle, ne bouge pas',
        refaite.intacte, { textes: 1, traits: 6 });

    // Un film qui rejouerait la construction de l'autre classe n'aurait pas de sens.
    r.egal('la séance refaite repart sans le film de la précédente',
        { film: refaite.reprise.film, historique: refaite.reprise.historique }, { film: 0, historique: 0 });

    // Elle garde SA préparation : on pourra la refaire une troisième fois.
    r.verifie('elle garde sa préparation, pour la classe suivante',
        refaite.reprise.gardeSaPreparation);

    r.egal('elle porte le nom du cours et celui de la classe', refaite.nom, 'Thalès — 4e 2');
    r.egal('et elle sait d\'où elle vient', refaite.origine, 'tb_seance');

    // --- UNE TROISIÈME CLASSE, DEPUIS LA DEUXIÈME ---
    const troisieme = await page.evaluate(async (idDeux) => {
        const fiche = await reinvestirLaSeance(idDeux, 'c43', '4e 3');
        // Refusée : on le dit dans la ligne qui le concerne, plutôt que de
        // planter et d'emporter le reste de la suite.
        if (!fiche) return { nom: null, origine: null, textes: -1, famille: [] };
        const neuf = await localforage.getItem('data_' + fiche.id);
        return {
            nom: fiche.name,
            // La racine reste la PREMIÈRE séance, pas celle dont on part :
            // sinon la famille se casserait en morceaux à chaque reprise.
            origine: fiche.seanceOrigine,
            textes: (neuf.pages[0].texts || []).length,
            famille: seancesDeLaMemeFamille(fiche.id).map(s => s.classeNom).sort()
        };
    }, refaite.id);
    r.egal('on repart d\'une séance déjà refaite sans perdre le fil',
        { nom: troisieme.nom, origine: troisieme.origine, textes: troisieme.textes },
        { nom: 'Thalès — 4e 3', origine: 'tb_seance', textes: 1 });
    r.egal('les trois classes forment une même famille de séances',
        troisieme.famille, ['4e 1', '4e 2', '4e 3']);

    // --- SANS PRÉPARATION, ON NE RÉINVESTIT PAS ---
    const sansPrep = await page.evaluate(async () => {
        const brut = await localforage.getItem('data_tb_seance');
        const copie = JSON.parse(JSON.stringify(brut));
        copie.pages.forEach(p => { delete p.preparation; });
        await localforage.setItem('data_tb_nu', copie);
        savedTableaux.push({ id: 'tb_nu', name: 'Sans préparation', timestamp: Date.now() });
        const avant = savedTableaux.length;
        const fiche = await reinvestirLaSeance('tb_nu', 'c42', '4e 2');
        return { fiche, memeNombre: savedTableaux.length === avant };
    });
    r.egal('un tableau sans préparation marquée ne se réinvestit pas',
        { fiche: sansPrep.fiche, memeNombre: sansPrep.memeNombre }, { fiche: null, memeNombre: true });

    // --- LA CLASSE SE VOIT DANS L'EXPLORATEUR ---
    const liste = await page.evaluate(() => {
        renderExplorerLists();
        const marques = [...document.querySelectorAll('#file-tree-container .tree-classe')]
            .map(e => e.textContent.trim());
        const boutons = document.querySelectorAll('#file-tree-container .tree-action-btn[title^="Refaire"]').length;
        return { marques: marques.sort(), boutons };
    });
    r.egal('chaque séance dit à quelle classe elle a été faite',
        liste.marques, ['4e 1', '4e 2', '4e 3']);
    r.verifie('et chacune propose de la refaire ailleurs', liste.boutons >= 3, String(liste.boutons));

    // --- LA PRÉPARATION SE VOIT DANS LA LISTE ---
    // Le bouton 👥 s'affichait sur toutes les séances, y compris celles qui
    // n'ont pas de préparation : on ne savait qu'en cliquant, et la réponse
    // était un refus. Une séance prête porte maintenant un 📌.
    const marquage = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(res => setTimeout(res, ms));
        savedTableaux = [];
        await localforage.setItem('auTableau_tableaux_list', savedTableaux);
        selectedBoardId = null;
        pages.forEach(p => { delete p.preparation; });

        // Une séance enregistrée SANS préparation.
        document.getElementById('project-name-input').value = 'Pythagore';
        saveCurrentBoard();
        await attendre(500);
        const sans = savedTableaux.find(t => t.name === 'Pythagore');
        renderExplorerLists();
        const avantEpingles = document.querySelectorAll('#file-tree-container .tree-prep').length;

        // On garde la préparation : la séance déjà enregistrée doit être
        // remise à jour toute seule, sinon la marque mentirait.
        marquerLaPreparation();
        await attendre(500);
        const avec = savedTableaux.find(t => t.id === sans.id);
        const donnees = await localforage.getItem('data_' + sans.id);
        renderExplorerLists();
        return {
            avant: sans.aPreparation,
            apres: avec.aPreparation,
            dansLesDonnees: (donnees.pages || []).some(p => p && p.preparation),
            avantEpingles,
            epingles: document.querySelectorAll('#file-tree-container .tree-prep').length,
            pretes: document.querySelectorAll('#file-tree-container .tree-action-btn.prete').length
        };
    });
    r.egal('une séance enregistrée sans préparation n\'est pas marquée',
        { drapeau: marquage.avant, epingles: marquage.avantEpingles }, { drapeau: false, epingles: 0 });
    r.egal('garder la préparation réenregistre la séance et la marque',
        { drapeau: marquage.apres, dansLesDonnees: marquage.dansLesDonnees },
        { drapeau: true, dansLesDonnees: true });
    r.egal('et la liste montre le 📌 et son bouton 👥 en évidence',
        { epingles: marquage.epingles, pretes: marquage.pretes }, { epingles: 1, pretes: 1 });

    // --- RAPPELER LA PRÉPARATION DEPUIS LE MENU, SANS PASSER PAR LA LISTE ---
    // On garde la préparation dans le menu Séance ; on cherchait au même
    // endroit comment la rappeler, et la réponse n'était que dans
    // l'explorateur. Le nouveau tableau doit aussi s'OUVRIR : avant, seul
    // l'enregistrement changeait de cible et le cours suivant écrasait le
    // précédent.
    const parLeMenu = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        texts.length = 0; freehands.length = 0; segments.length = 0;
        pages.forEach(p => { delete p.preparation; });
        savedTableaux = [];
        await localforage.setItem('auTableau_tableaux_list', savedTableaux);
        selectedBoardId = null;

        // La préparation : l'énoncé, posé avant le cours.
        texts.push({ id: nextId++, x: 20, y: 20, content: 'Somme des angles', fontSize: 30, color: '#000', z: globalZ++ });
        syncPage();
        document.getElementById('project-name-input').value = 'Angles';
        await saveCurrentBoard(true);
        marquerLaPreparation();
        await attendre(400);
        const source = selectedBoardId;

        // Le cours devant la première classe.
        for (let i = 0; i < 4; i++) {
            freehands.push({ id: nextId++, points: [{ x: i * 10, y: 150 }, { x: i * 10 + 8, y: 190 }], color: '#d63031', width: 4, z: globalZ++ });
        }
        syncPage();
        hasUnsavedChanges = true;

        // « Refaire cette séance avec une autre classe »
        document.getElementById('btn-refaire').click();
        await attendre(500);
        const titre = document.getElementById('custom-prompt-title').innerText;
        const select = document.querySelector('#custom-prompt-inputs select');
        const proposees = [...select.options].map(o => o.textContent.trim());
        select.value = 'c43';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('custom-prompt-ok').click();
        await attendre(900);

        const traceSource = await localforage.getItem('data_' + source);
        return {
            titre, proposees,
            ouvert: selectedBoardId !== source,
            nom: (savedTableaux.find(t => t.id === selectedBoardId) || {}).name,
            titreAffiche: document.getElementById('project-name-input').value,
            // Ce qui est à l'écran : l'énoncé, et rien du cours précédent.
            aLEcran: { textes: texts.length, traits: freehands.length },
            // La séance de la première classe garde sa trace.
            source: { traits: (traceSource.pages[0].freehands || []).length }
        };
    });
    r.egal('le menu propose de refaire la séance ouverte',
        parLeMenu.titre, 'Refaire « Angles » avec une autre classe');
    r.verifie('et laisse choisir la classe',
        parLeMenu.proposees.length === 4 && parLeMenu.proposees.includes('4e 3'),
        JSON.stringify(parLeMenu.proposees));
    r.egal('la nouvelle séance s\'ouvre à l\'écran, prête pour la classe suivante',
        { ouvert: parLeMenu.ouvert, nom: parLeMenu.nom, titre: parLeMenu.titreAffiche },
        { ouvert: true, nom: 'Angles — 4e 3', titre: 'Angles — 4e 3' });
    r.egal('on y retrouve l\'énoncé, sans le cours fait à l\'autre classe',
        parLeMenu.aLEcran, { textes: 1, traits: 0 });
    r.egal('et la séance quittée a gardé sa trace, enregistrée au passage',
        parLeMenu.source.traits, 4);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
