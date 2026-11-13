// UNE FENÊTRE BORNÉE SE LAISSE ATTEINDRE — DANS LES DEUX SENS.
//
//   « Quelques fenêtres qui posent problème : celles qui sont tronquées. »
//
// Une fenêtre plus grande que l'écran est bornée, et c'est juste : garder une
// taille qu'on ne peut pas afficher ne respecte aucun choix, cela rend
// l'outil inutilisable. Mais la borne ne s'accompagnait d'un moyen d'atteindre
// ce qu'elle coupe que pour la HAUTEUR. Bornée en largeur, la fenêtre se
// faisait couper à droite, et ce qui était coupé n'existait plus pour
// personne : ni barre, ni molette, ni clavier.
//
// Mesuré sur un écran de 760 × 620, les deux pires : « Algorithmes (Scratch) »
// perdait CENT DIX pixels de largeur, le Laboratoire Aléatoire
// SOIXANTE-SEIZE. Sa colonne de droite — les réglages du tirage — était
// simplement absente.
//
// Borner sans donner le moyen d'atteindre ce qu'on borne, ce n'est pas
// protéger l'outil : c'est l'amputer en silence.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Les deux qui dépassaient, et deux témoins qui tiennent largement : sans
// eux, une mesure cassée qui ne verrait plus rien passerait pour un progrès.
const LARGES = ['Algorithmes (Scratch)', 'Laboratoire Aléatoire'];
const TEMOINS = ['Horloge Pédagogique', 'Jeu du Pendu'];

module.exports = async function (browser) {
    const r = creerRapport('Une fenêtre bornée se laisse atteindre');
    // L'ÉCRAN EST ÉTROIT EXPRÈS : c'est le seul endroit où le défaut existe.
    // Sur un grand écran, aucune de ces fenêtres n'est bornée, et le chapitre
    // ne mesurerait rien.
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 760, height: 620 } });
    await tableauVierge(page);

    const regarder = async (nom) => {
        await page.evaluate((n) => {
            const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
                .find(x => (x.dataset.pluginKey || x.title || '') === n);
            if (b) b.click();
        }, nom);
        await page.waitForTimeout(800);
        const vu = await page.evaluate(() => {
            let fen = null;
            document.querySelectorAll('[data-equipee="1"]').forEach(f => {
                if (f.getClientRects().length) fen = f;
            });
            if (!fen) return null;
            const c = getComputedStyle(fen);
            const r = fen.getBoundingClientRect();
            const peut = (v) => v === 'auto' || v === 'scroll';
            // CE QUI DÉPASSE SANS QU'ON PUISSE Y ALLER, en pixels.
            const inatteignable = {
                largeur: peut(c.overflowX) ? 0 : Math.max(0, fen.scrollWidth - fen.clientWidth),
                hauteur: peut(c.overflowY) ? 0 : Math.max(0, fen.scrollHeight - fen.clientHeight)
            };
            // et l'on vérifie que le défilement MARCHE vraiment, pas seulement
            // qu'il est permis
            let atteint = null;
            if (peut(c.overflowX) && fen.scrollWidth > fen.clientWidth) {
                fen.scrollLeft = 99999;
                atteint = fen.scrollLeft > 0
                    && fen.scrollLeft + fen.clientWidth >= fen.scrollWidth - 2;
                fen.scrollLeft = 0;
            }
            return {
                taille: [Math.round(r.width), Math.round(r.height)],
                bornee: r.width >= window.innerWidth - 20,
                defileX: peut(c.overflowX), defileY: peut(c.overflowY),
                inatteignable, atteintLeBord: atteint
            };
        });
        await page.evaluate(() => {
            const c = document.getElementById('custom-prompt-cancel');
            if (c) c.click();
            document.querySelectorAll('[data-equipee="1"]').forEach(f => {
                if (!f.getClientRects().length) return;
                const x = f.querySelector('.fen-fermer');
                if (x) x.click(); else f.style.display = 'none';
            });
        });
        await page.waitForTimeout(250);
        return vu;
    };

    const larges = [];
    for (const nom of LARGES) larges.push({ nom, vu: await regarder(nom) });

    // ------------------------------------------------------------------
    // 1. LES DEUX S'OUVRENT, ET ELLES SONT BIEN BORNÉES PAR L'ÉCRAN.
    //
    //    Si elles ne l'étaient plus, ce chapitre ne mesurerait plus rien —
    //    il le dit, plutôt que de passer en silence.
    // ------------------------------------------------------------------
    const muettes = larges.filter(x => !x.vu).map(x => x.nom);
    r.egal('les deux fenêtres larges s\'ouvrent', muettes.length, 0, muettes.join(', '));
    const bornees = larges.filter(x => x.vu && x.vu.bornee).length;
    r.verifie('et l\'écran étroit les borne bien, sinon rien n\'est mesuré',
        bornees === larges.length, JSON.stringify(larges));

    // ------------------------------------------------------------------
    // 2. RIEN N'EST COUPÉ SANS QU'ON PUISSE Y ALLER.
    // ------------------------------------------------------------------
    const perdus = larges.filter(x => x.vu
        && (x.vu.inatteignable.largeur > 2 || x.vu.inatteignable.hauteur > 2))
        .map(x => x.nom + ' : ' + JSON.stringify(x.vu.inatteignable));
    r.egal('aucun pixel coupé n\'est hors d\'atteinte', perdus.length, 0, perdus.join(' | '));

    // ------------------------------------------------------------------
    // 3. ET LE DÉFILEMENT VA VRAIMENT JUSQU'AU BORD.
    //
    //    Permettre de défiler et défiler pour de bon sont deux choses : une
    //    fenêtre à qui l'on donne « overflow:auto » sans que son contenu
    //    dépasse ne bouge pas d'un pixel.
    // ------------------------------------------------------------------
    const auBord = larges.filter(x => x.vu && x.vu.atteintLeBord === true).length;
    r.verifie('au moins une se laisse défiler jusqu\'à son bord droit',
        auBord >= 1, JSON.stringify(larges.map(x => ({ n: x.nom, a: x.vu && x.vu.atteintLeBord }))));

    // ------------------------------------------------------------------
    // 4. ET L'ON N'A PAS DONNÉ DES BARRES À TOUT LE MONDE.
    //
    //    Une fenêtre qui tient dans l'écran n'a aucune raison de défiler :
    //    une barre de défilement inutile mange de la place et se voit.
    // ------------------------------------------------------------------
    const petits = [];
    for (const nom of TEMOINS) petits.push({ nom, vu: await regarder(nom) });
    const inutiles = petits.filter(x => x.vu && x.vu.defileX
        && x.vu.taille[0] < 740).map(x => x.nom);
    r.egal('les fenêtres qui tiennent n\'ont pas gagné de barre inutile',
        inutiles.length, 0, JSON.stringify(petits));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
