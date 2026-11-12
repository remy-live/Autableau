// UNE SEULE BARRE DE TITRE POUR TOUTES LES FENÊTRES.
//
//   « Garde la même cohérence entre toutes les fenêtres de plugin. »
//
// Mesuré sur les quatre-vingt-neuf outils : quarante ouvrent une fenêtre à
// eux et reçoivent la barre commune — claire, 34 pixels, le nom à gauche, la
// croix à droite. Quarante-deux passent par la boîte commune des réglages,
// qui portait un bandeau NOIR de 35 pixels, écrit à la main dans la page,
// avec son propre corps de texte. Deux barres pour une seule application :
// on voyait par quelle porte on était entré avant d'avoir lu le titre.
//
// CE CHAPITRE NE FIGE AUCUNE COULEUR. Il compare les deux barres l'une à
// l'autre : le jour où la barre commune changera d'habit, la boîte devra
// changer avec elle, et c'est exactement ce qu'on veut garder.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Une seule barre de titre');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    const ouvrir = (nom) => page.evaluate((n) => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === n);
        if (!b) return false;
        b.click();
        return true;
    }, nom);

    // ON COMPARE AUSSI LE NOM, ET NON SEULEMENT LA BARRE : le corps du texte
    // se lit sur le nom, pas sur la boîte qui le porte — celle-ci garde le
    // seize pixels du document, que personne ne voit.
    const habits = (selBarre, selNom) => page.evaluate(([sb, sn]) => {
        const el = document.querySelector(sb);
        if (!el) return null;
        const c = getComputedStyle(el);
        const n = document.querySelector(sn);
        const cn = n ? getComputedStyle(n) : null;
        return {
            hauteur: Math.round(el.getBoundingClientRect().height),
            fond: c.backgroundColor,
            encre: cn ? cn.color : c.color,
            traitBas: c.borderBottomWidth + ' ' + c.borderBottomColor,
            corps: cn ? cn.fontSize : null,
            graisse: cn ? cn.fontWeight : null,
            main: c.cursor
        };
    }, [selBarre, selNom]);

    // La barre commune, sur une fenêtre d'outil ordinaire.
    r.verifie('un outil à fenêtre s\'ouvre', await ouvrir('Sonomètre de Classe'), '');
    await page.waitForTimeout(700);
    const commune = await habits('.fen-tete', '.fen-tete .fen-nom');
    await page.evaluate(() => {
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (!f.getClientRects().length) return;
            const x = f.querySelector('.fen-fermer');
            if (x) x.click(); else f.style.display = 'none';
        });
    });
    await page.waitForTimeout(300);

    // Celle de la boîte commune des réglages.
    r.verifie('un outil à boîte commune s\'ouvre', await ouvrir('Tableau de Numération'), '');
    await page.waitForTimeout(600);
    const boite = await habits('.drag-handle-prompt', '#custom-prompt-title');

    r.verifie('les deux barres existent', !!commune && !!boite,
        JSON.stringify({ commune, boite }));

    // ------------------------------------------------------------------
    // 1. LE MÊME FOND, LA MÊME ENCRE, LE MÊME TRAIT.
    // ------------------------------------------------------------------
    r.egal('la boîte des réglages a le fond de la barre commune',
        boite && boite.fond, commune && commune.fond, JSON.stringify({ commune, boite }));
    r.egal('et son encre', boite && boite.encre, commune && commune.encre,
        JSON.stringify({ commune: commune && commune.encre, boite: boite && boite.encre }));
    r.egal('et son trait du bas', boite && boite.traitBas, commune && commune.traitBas,
        JSON.stringify({ commune: commune && commune.traitBas, boite: boite && boite.traitBas }));
    r.egal('et le corps du titre', boite && boite.corps, commune && commune.corps,
        JSON.stringify({ commune: commune && commune.corps, boite: boite && boite.corps }));
    r.egal('et sa graisse', boite && boite.graisse, commune && commune.graisse,
        JSON.stringify({ commune: commune && commune.graisse, boite: boite && boite.graisse }));

    // ------------------------------------------------------------------
    // 2. ET LA MÊME HAUTEUR, À UN PIXEL PRÈS.
    //
    //    Un pixel de tolérance parce que la boîte garde sa place dans le fil
    //    de la fenêtre là où la barre commune se pose en absolu : le trait
    //    du bas compte d'un côté et pas de l'autre.
    // ------------------------------------------------------------------
    r.verifie('et la même hauteur, à un pixel près',
        !!commune && !!boite && Math.abs(commune.hauteur - boite.hauteur) <= 1,
        'commune ' + (commune && commune.hauteur) + ' px, boîte ' + (boite && boite.hauteur) + ' px');

    // ------------------------------------------------------------------
    // 3. ET LES DEUX SE PRENNENT EN MAIN DE LA MÊME FAÇON.
    // ------------------------------------------------------------------
    r.egal('on les saisit toutes les deux par la barre',
        boite && boite.main, commune && commune.main,
        JSON.stringify({ commune: commune && commune.main, boite: boite && boite.main }));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
