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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
