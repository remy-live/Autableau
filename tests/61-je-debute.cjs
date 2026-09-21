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
                outils: [...document.querySelectorAll('.debut-outil')].map(o => o.textContent.trim()),
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
    r.verifie('le compte annoncé est celui de la liste',
        parMetier.ecole.compte.includes(String(parMetier.ecole.outils.length)),
        parMetier.ecole.compte + ' — pour ' + parMetier.ecole.outils.length + ' outils');
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
            compte: compo ? compo.querySelector('#compo-compte').textContent : ''
        };
    });
    r.verifie('« Composer ma barre » ouvre le compositeur', barre.ouvert, JSON.stringify(barre));
    r.verifie('et referme la fenêtre de départ', barre.debutFerme, JSON.stringify(barre));
    r.egal('avec les outils du métier déjà cochés', barre.coches, barre.attendus);
    r.verifie('le compteur du compositeur les a comptés',
        barre.compte.includes(String(barre.attendus)), barre.compte);
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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
