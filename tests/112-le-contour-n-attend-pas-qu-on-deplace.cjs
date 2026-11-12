// LE CONTOUR N'ATTEND PAS QU'ON DÉPLACE LA FENÊTRE.
//
//   « Certaines fenêtres n'ont un contour franc que quand on les déplace. »
//
// Mesuré sur les quatre-vingt-neuf boutons d'outils : quarante ouvrent une
// fenêtre à eux, et CINQ n'avaient aucun trait au repos — Formules
// Mathématiques, la Frise Historique, l'Atelier cartes, le Tableau de Signes
// et la Fabrique à Flèches. Toutes les cinq en « position: relative ».
//
// Les deux systèmes se contredisaient. « equiperVraiment » pose la barre de
// titre en absolu, donc il lui faut un repère : il écrit « position =
// relative » sur toute fenêtre restée statique. Le poseur de contour, lui,
// n'acceptait pour une fenêtre que « fixed » ou « absolute ». Le système de
// fenêtres fabriquait exactement l'état que le système de contour refusait.
//
// Et prendre la fenêtre par sa barre appelle « figerLaPlace », qui la passe en
// « fixed » : l'observateur voyait alors passer un changement, et le trait
// arrivait. D'où le symptôme, à la lettre.
//
// CE CHAPITRE NE DÉPLACE RIEN. C'est tout son propos : il ouvre, il regarde,
// il n'appelle jamais la souris. Un chapitre qui prendrait la fenêtre par sa
// barre avant de mesurer passerait même avec le défaut, puisque c'est
// justement le déplacement qui posait le trait.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Les cinq qui n'en avaient pas, et trois qui en avaient : sans ces
// dernières, une mesure cassée qui ne voit plus AUCUN anneau passerait pour
// un progrès.
const SANS_TRAIT_AUTREFOIS = ['Formules Mathématiques', 'Frise Historique',
    'Atelier cartes', 'Tableau Signes & Variations', 'Fabrique à Flèches'];
const DEJA_TRAITEES = ['Sonomètre de Classe', 'Métronome Pro', 'Molécules 2D'];

module.exports = async function (browser) {
    const r = creerRapport('Le contour n\'attend pas qu\'on déplace');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // Le nom du bouton voyage : « title » au départ, puis « data-tooltip » et
    // « aria-label » dès que l'infobulle maison s'en empare. On passe donc par
    // la clé du plugin, qui, elle, ne bouge pas.
    const ouvrir = (nom) => page.evaluate((n) => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === n);
        if (!b) return false;
        b.click();
        return true;
    }, nom);

    const refermer = () => page.evaluate(() => {
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (!f.getClientRects().length) return;
            const x = f.querySelector('.fen-fermer');
            if (x) x.click(); else f.style.display = 'none';
        });
    });

    // UN CONTOUR FRANC SE MESURE, IL NE SE DEVINE PAS : c'est un trait SANS
    // FLOU posé au ras de la boîte, qu'il vienne d'une bordure ou d'une ombre
    // à rayon nul. Les deux comptent — une fenêtre qui avait déjà sa bordure
    // garde la sienne, l'application ne lui en pose pas une seconde.
    const regarderLaDerniere = () => page.evaluate(() => {
        let fen = null;
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (f.getClientRects().length) fen = f;
        });
        if (!fen) return null;
        const c = getComputedStyle(fen);
        const ombre = c.boxShadow || '';
        return {
            position: c.position,
            bord: parseFloat(c.borderTopWidth) || 0,
            anneau: /(^|,)\s*rgb[^)]*\)\s+0px\s+0px\s+0px\s+\d/.test(ombre)
                 || /\d+px\s+0px\s+0px\s+0px/.test(ombre),
            classee: fen.classList.contains('contour-fenetre')
        };
    });

    const releve = [];
    for (const nom of SANS_TRAIT_AUTREFOIS.concat(DEJA_TRAITEES)) {
        const ok = await ouvrir(nom);
        if (!ok) { releve.push({ nom, erreur: 'bouton introuvable' }); continue; }
        await page.waitForTimeout(500);
        const vu = await regarderLaDerniere();
        releve.push({ nom, vu });
        await refermer();
        await page.waitForTimeout(200);
    }

    // ------------------------------------------------------------------
    // 1. CHACUNE DES HUIT OUVRE BIEN UNE FENÊTRE.
    //
    //    Sans ce contrôle, un bouton qui n'ouvrirait plus rien rendrait le
    //    chapitre muet : pas de fenêtre, pas de fenêtre sans trait.
    // ------------------------------------------------------------------
    const muettes = releve.filter(x => x.erreur || !x.vu).map(x => x.nom);
    r.egal('les huit outils ouvrent chacun une fenêtre', muettes.length, 0,
        muettes.join(', '));

    // ------------------------------------------------------------------
    // 2. AUCUNE N'EST SANS TRAIT, ET PERSONNE N'A TOUCHÉ LA SOURIS.
    // ------------------------------------------------------------------
    const nues = releve.filter(x => x.vu && !x.vu.anneau && !(x.vu.bord >= 1)).map(x => x.nom);
    r.egal('aucune fenêtre n\'est sans contour au repos', nues.length, 0, nues.join(', '));

    // ------------------------------------------------------------------
    // 3. ET LE TRAIT NE DÉPEND PAS DE LA FAÇON DONT LA FENÊTRE EST POSÉE.
    //
    //    C'est la correction même : une fenêtre en « relative » en a un.
    //    Si plus aucune n'est en « relative », ce contrôle ne mesure plus
    //    rien — il le dit, plutôt que de passer en silence.
    // ------------------------------------------------------------------
    const relatives = releve.filter(x => x.vu && x.vu.position === 'relative');
    r.verifie('au moins une fenêtre est encore posée en « relative »',
        relatives.length > 0,
        'sinon ce chapitre ne mesure plus la correction : '
        + JSON.stringify(releve.map(x => x.vu && x.vu.position)));
    const relativesNues = relatives.filter(x => !x.vu.anneau && !(x.vu.bord >= 1)).map(x => x.nom);
    r.egal('les fenêtres en « relative » ont leur trait comme les autres',
        relativesNues.length, 0, relativesNues.join(', '));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
