// LA COPIE REVIENT D'ELLE-MÊME
//
// « Au collège, on a un cloud interne… en gros, quelle que soit ma salle,
// j'ai accès à mon fichier autableau. »
//
// La moitié « enregistrer » était déjà faite : la copie du jour se réécrit
// toute seule dès que quelque chose change, au plus toutes les deux minutes,
// dans un fichier qui porte la date. C'est la moitié « revenir » qui
// manquait. On arrive en salle 4, autre machine, tableau blanc — et le
// fichier d'hier est là, sur l'espace réseau, sans que rien ne le propose.
//
// ET EN L'ÉCRIVANT, UN DÉFAUT PLUS GRAVE S'EST MONTRÉ. Toutes les écritures
// d'une même journée tombent sur le MÊME fichier, puisque son nom porte la
// date. Or le démarrage appelle l'écriture en force dès que le dossier est
// retrouvé, et au démarrage le tableau peut être encore vide : la séance
// d'hier attend qu'on réponde « Reprendre », un fichier n'a pas fini de se
// charger. Une seule écriture dans cette fenêtre-là, et le travail de la
// matinée était remplacé par un tableau blanc — dans le fichier même qui
// devait le protéger.
//
// CE CHAPITRE TIENT LES DEUX, et le garde-fou d'abord : perdre une journée de
// cours est pire que devoir cliquer pour la retrouver.
//
// Le dossier est ici un dossier FEINT, écrit en quelques lignes : le
// sélecteur du navigateur demande un geste humain qu'une épreuve n'a pas. Ce
// qui est mesuré n'en est pas moins vrai — c'est le code du tableau qui
// tourne, sur des poignées qui répondent comme celles du système.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un dossier qu'on peut lire, écrire et parcourir, posé dans la page.
const DOSSIER_FEINT = function (fichiers) {
    const contenu = Object.assign({}, fichiers);
    const poignee = (nom) => ({
        kind: 'file', name: nom,
        getFile: async () => ({
            size: contenu[nom].length,
            text: async () => contenu[nom]
        }),
        createWritable: async () => {
            let tampon = '';
            return {
                write: async (d) => { tampon += d; },
                close: async () => { contenu[nom] = tampon; }
            };
        }
    });
    return {
        name: 'Mon espace',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        getFileHandle: async (nom, opt) => {
            if (!(nom in contenu)) {
                if (!opt || !opt.create) throw new Error('absent');
                contenu[nom] = '';
            }
            return poignee(nom);
        },
        removeEntry: async (nom) => { delete contenu[nom]; },
        values: async function* () {
            for (const n of Object.keys(contenu)) yield poignee(n);
        },
        __lire: () => contenu
    };
};

// Un espace de travail qui porte vraiment quelque chose, et un autre vide.
const PLEIN = JSON.stringify({
    version: '1.0', timestamp: 1,
    tableaux: [{ id: 'b1', name: 'Le cours d\'hier' }],
    boardsData: { b1: { pages: [{ texts: [{ id: 1, content: 'Chapitre 3' }] }] } },
    autoSave: { pages: [{ texts: [{ id: 1, content: 'Chapitre 3' }] }] }
});
const VIDE = JSON.stringify({
    version: '1.0', timestamp: 1, tableaux: [], boardsData: {}, autoSave: null
});

module.exports = async function (browser) {
    const r = creerRapport('La copie revient d\'elle-même');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof ecrireLaSauvegardeDeSecurite === 'function', { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.addScriptTag({ content: 'window.DOSSIER_FEINT = ' + DOSSIER_FEINT.toString() + ';' });

    // Un tableau vraiment vide, côté stockage comme côté écran.
    const viderLEspace = () => page.evaluate(async () => {
        await localforage.removeItem('auTableau_tableaux_list');
        await localforage.removeItem('AuTableau_AutoSave');
        document.getElementById('bandeau-securite')?.remove();
    });

    // ------------------------------------------------------------------
    // 1. LE GARDE-FOU : UNE COPIE VIDE N'ÉCRASE PAS UNE COPIE PLEINE
    // ------------------------------------------------------------------
    await viderLEspace();
    const garde = await page.evaluate(async ({ PLEIN }) => {
        const nom = nomDuFichierDeSecurite();
        dossierSecurite = window.DOSSIER_FEINT({ [nom]: PLEIN });
        const avant = dossierSecurite.__lire()[nom].length;
        // « force » : exactement ce que fait le démarrage.
        const ecrit = await ecrireLaSauvegardeDeSecurite(true);
        const apres = dossierSecurite.__lire()[nom].length;
        return { nom, ecrit, avant, apres, intact: dossierSecurite.__lire()[nom] === PLEIN };
    }, { PLEIN });
    r.egal('l\'écriture est refusée', garde.ecrit, false, JSON.stringify(garde));
    r.egal('LA COPIE PLEINE EST INTACTE', garde.intact, true,
        garde.avant + ' octets → ' + garde.apres);

    // ------------------------------------------------------------------
    // 2. ET ELLE NE CRÉE MÊME PAS DE FICHIER VIDE
    //
    // Le demander avec « create » poserait une copie vide que la reprise du
    // lendemain trouverait comme la plus récente : on proposerait de reprendre
    // un tableau blanc.
    // ------------------------------------------------------------------
    const rien = await page.evaluate(async () => {
        dossierSecurite = window.DOSSIER_FEINT({});
        const ecrit = await ecrireLaSauvegardeDeSecurite(true);
        return { ecrit, fichiers: Object.keys(dossierSecurite.__lire()) };
    });
    r.egal('sur un dossier vide, rien n\'est écrit', rien.ecrit, false);
    r.egal('ET AUCUN FICHIER N\'EST CRÉÉ', rien.fichiers, []);

    // ------------------------------------------------------------------
    // 3. MAIS CE QUI PORTE QUELQUE CHOSE S'ÉCRIT, LUI
    //
    // Sans ce contrôle, un garde-fou qui refuserait TOUT passerait les deux
    // précédents sans rien protéger du tout.
    // ------------------------------------------------------------------
    const vrai = await page.evaluate(async () => {
        await localforage.setItem('auTableau_tableaux_list', [{ id: 'b9', name: 'Aujourd\'hui' }]);
        await localforage.setItem('data_b9', { pages: [{ texts: [{ id: 1, content: 'Exercice 4' }] }] });
        dossierSecurite = window.DOSSIER_FEINT({});
        const ecrit = await ecrireLaSauvegardeDeSecurite(true);
        const fichiers = Object.keys(dossierSecurite.__lire());
        const dedans = fichiers.length ? dossierSecurite.__lire()[fichiers[0]] : '';
        return { ecrit, fichiers, porte: dedans.includes('Exercice 4'), taille: dedans.length };
    });
    r.egal('un espace qui porte du travail s\'écrit', vrai.ecrit, true, JSON.stringify(vrai));
    r.egal('dans un fichier daté du jour', vrai.fichiers.length, 1, JSON.stringify(vrai.fichiers));
    r.verifie('et la copie contient bien le travail', vrai.porte, JSON.stringify(vrai));

    // ------------------------------------------------------------------
    // 4. LA REPRISE : TABLEAU VIDE, COPIE D'HIER → ON PROPOSE
    // ------------------------------------------------------------------
    await viderLEspace();
    const offre = await page.evaluate(async ({ PLEIN }) => {
        dossierSecurite = window.DOSSIER_FEINT({ 'Au Tableau — 2026-09-30.autableau': PLEIN });
        const propose = await proposerDeRouvrirLaCopie();
        const b = document.getElementById('bandeau-securite');
        return { propose, texte: b ? b.querySelector('span').textContent : null,
                 boutons: b ? [...b.querySelectorAll('button')].map(x => x.textContent) : [] };
    }, { PLEIN });
    r.egal('le bandeau paraît', offre.propose, true, JSON.stringify(offre));
    r.verifie('il nomme le dossier et la date de la copie',
        !!offre.texte && /Mon espace/.test(offre.texte) && /30\/09\/2026/.test(offre.texte),
        JSON.stringify(offre.texte));
    r.egal('et il laisse le choix', offre.boutons, ['Reprendre', 'Page blanche']);

    // ------------------------------------------------------------------
    // 5. JAMAIS PAR-DESSUS DU TRAVAIL
    //
    // C'est la règle entière : qui arrive avec sa séance en cours ne doit rien
    // voir. Un bandeau qui propose d'écraser ce qu'on a sous les yeux serait
    // un piège, pas un service.
    // ------------------------------------------------------------------
    const silence = await page.evaluate(async ({ PLEIN }) => {
        document.getElementById('bandeau-securite')?.remove();
        await localforage.setItem('auTableau_tableaux_list', [{ id: 'b2', name: 'En cours' }]);
        await localforage.setItem('data_b2', { pages: [{ texts: [{ id: 2, content: 'Déjà là' }] }] });
        dossierSecurite = window.DOSSIER_FEINT({ 'Au Tableau — 2026-09-30.autableau': PLEIN });
        const propose = await proposerDeRouvrirLaCopie();
        return { propose, bandeau: !!document.getElementById('bandeau-securite') };
    }, { PLEIN });
    r.egal('avec du travail en cours, on ne propose rien', silence.propose, false);
    r.egal('et aucun bandeau ne paraît', silence.bandeau, false);

    // ------------------------------------------------------------------
    // 6. UNE COPIE VIDE N'EST PAS PROPOSÉE
    //
    // Même la plus récente : « Reprendre » rendrait alors un tableau blanc,
    // ce qui est exactement la peur qu'on vient calmer.
    // ------------------------------------------------------------------
    await viderLEspace();
    const creuse = await page.evaluate(async ({ VIDE, PLEIN }) => {
        dossierSecurite = window.DOSSIER_FEINT({
            'Au Tableau — 2026-09-28.autableau': PLEIN,
            'Au Tableau — 2026-09-30.autableau': VIDE
        });
        const propose = await proposerDeRouvrirLaCopie();
        const b = document.getElementById('bandeau-securite');
        return { propose, texte: b ? b.querySelector('span').textContent : null };
    }, { VIDE, PLEIN });
    r.egal('on propose quand même quelque chose', creuse.propose, true, JSON.stringify(creuse));
    r.verifie('MAIS LA COPIE DU 28, PAS CELLE DU 30 QUI EST VIDE',
        !!creuse.texte && /28\/09\/2026/.test(creuse.texte), JSON.stringify(creuse.texte));

    // ------------------------------------------------------------------
    // 7. ET RIEN DU TOUT QUAND LE DOSSIER NE GARDE QUE DU VIDE
    // ------------------------------------------------------------------
    const neant = await page.evaluate(async ({ VIDE }) => {
        document.getElementById('bandeau-securite')?.remove();
        dossierSecurite = window.DOSSIER_FEINT({ 'Au Tableau — 2026-09-30.autableau': VIDE });
        const propose = await proposerDeRouvrirLaCopie();
        return { propose, bandeau: !!document.getElementById('bandeau-securite') };
    }, { VIDE });
    r.egal('un dossier qui ne garde que du vide ne propose rien', neant.propose, false);
    r.egal('et ne pose pas de bandeau', neant.bandeau, false);

    await page.evaluate(() => {
        document.getElementById('bandeau-securite')?.remove();
        dossierSecurite = null;
    });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
