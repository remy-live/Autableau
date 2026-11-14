// « ÇA DÉBORDE. »
//
// Deux outils, deux débordements, et le même mot pour les dire.
//
//   — LA BOÎTE DE RÉGLAGES. Mesuré sur un écran de 760 pixels de haut :
//     l'axe mathématique et ses douze réglages demandent 587 pixels pour 457
//     de place. La rangée « Couleur des dixièmes » se faisait couper EN DEUX
//     par le bord de l'aperçu, et rien ne disait qu'on pouvait faire défiler.
//     Une rangée coupée net ne se lit pas comme une liste qui continue : elle
//     se lit comme une boîte cassée.
//
//   — LES CARTES À JOUER. La grille des cinquante-deux cartes demande 692
//     pixels et n'en recevait que 665. C'est la colonne des ROIS qui passait
//     sous le bord — et elle défilait, mais silencieusement : on ne cherche
//     pas un ascenseur dans un tableau qu'on croit entier.
//
// TROIS LEVIERS, DANS CET ORDRE, pour la boîte : l'aperçu rend sa place
// jusqu'à son plancher, la boîte s'élargit d'une colonne tant que l'écran le
// permet, et ce qui dépasse encore s'estompe au lieu d'être tranché.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Ça déborde');

    // ------------------------------------------------------------------
    // 1. LA BOÎTE DE RÉGLAGES SUR UN ÉCRAN COURT.
    // ------------------------------------------------------------------
    {
        const { context, page, erreurs } = await ouvrirApp(browser,
            { viewport: { width: 1500, height: 760 } });
        await tableauVierge(page);
        await page.evaluate(() => {
            const bt = [...document.querySelectorAll('#plugins-grid .btn')]
                .find(x => (x.dataset.pluginKey || x.title || '') === 'Axe Mathématique');
            if (bt) bt.click();
        });
        await page.waitForTimeout(900);

        const vu = await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            const reg = m.querySelector('.prompt-reglages');
            const ap = m.querySelector('[id^="custom-prompt-preview"]');
            const b = m.getBoundingClientRect();
            const cases = [...m.querySelectorAll('.prompt-case')];
            const basDesReglages = reg.getBoundingClientRect().bottom;
            // une rangée COUPÉE : elle commence dans la zone et finit dehors
            const coupees = cases.filter(c => {
                const q = c.getBoundingClientRect();
                return q.top < basDesReglages - 2 && q.bottom > basDesReglages + 2;
            }).length;
            return {
                boite: [Math.round(b.width), Math.round(b.height)],
                ecran: [window.innerWidth, window.innerHeight],
                dansLEcran: b.top >= 0 && b.bottom <= window.innerHeight + 1
                    && b.left >= 0 && b.right <= window.innerWidth + 1,
                defile: reg.scrollHeight > reg.clientHeight + 1,
                ditQuElleDefile: reg.classList.contains('reglages-defilent'),
                apercu: ap ? Math.round(ap.getBoundingClientRect().height) : null,
                colonnes: getComputedStyle(m.querySelector('#custom-prompt-inputs'))
                    .gridTemplateColumns.split(' ').length,
                coupees
            };
        });

        r.verifie('la boîte tient dans l\'écran', vu.dansLEcran === true, JSON.stringify(vu));
        // ELLE S'ÉLARGIT PLUTÔT QUE DE S'ENTASSER : la règle d'avant comptait
        // les réglages et s'arrêtait à quatre colonnes, sans regarder l'écran.
        r.verifie('elle a pris des colonnes pour gagner des rangées',
            vu.colonnes > 4, JSON.stringify(vu) + ' — quatre avant, quoi qu\'il arrive');
        // ET PAS AU-DELÀ DE SIX : chaque rubrique occupe une rangée entière, et
        // les réglages qui la suivent sont trois ou quatre. Passé six colonnes
        // on n'enlève plus une rangée, on étale la boîte pour y laisser du vide.
        r.verifie('mais pas plus de six', vu.colonnes <= 6, JSON.stringify(vu));
        // L'APERÇU SUIT, SANS QU'ON AIT RIEN À LUI DIRE : il se dimensionne
        // déjà sur la hauteur des réglages, donc il est petit précisément
        // quand ils sont longs. Il prenait 162 pixels quand la boîte
        // s'entassait sur quatre colonnes ; elle s'étale, il se range.
        r.verifie('l\'aperçu ne mange plus la place des réglages',
            vu.apercu !== null && vu.apercu <= 140, JSON.stringify(vu) + ' — 162 px avant');
        // ET S'IL DÉFILE ENCORE, IL LE DIT.
        r.verifie('ce qui défile le dit',
            vu.defile === false || vu.ditQuElleDefile === true, JSON.stringify(vu));
        r.egal('et aucune rangée n\'est tranchée en deux', vu.coupees, 0, JSON.stringify(vu));

        r.verifie('aucune erreur de page (la boîte)', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    // ------------------------------------------------------------------
    // 2. LES CINQUANTE-DEUX CARTES TIENNENT DANS LEUR GRILLE.
    // ------------------------------------------------------------------
    {
        const { context, page, erreurs } = await ouvrirApp(browser,
            { viewport: { width: 1500, height: 900 } });
        await tableauVierge(page);
        const ouvert = await page.evaluate(() => {
            const bt = [...document.querySelectorAll('#plugins-grid .btn')]
                .find(x => /cartes? à jouer/i.test(x.dataset.pluginKey || x.title || ''));
            if (bt) bt.click();
            return !!bt;
        });
        r.verifie('l\'outil des cartes à jouer existe', ouvert, 'bouton introuvable');
        await page.waitForTimeout(900);

        const cartes = await page.evaluate(() => {
            const w = document.getElementById('pc-wrap');
            if (!w) return { absent: true };
            const g = w.querySelector('#pc-grid');
            const cellules = [...g.querySelectorAll('.pc-cell')];
            const bord = g.getBoundingClientRect().right;
            return {
                cartes: cellules.length,
                manque: g.scrollWidth - g.clientWidth,
                dehors: cellules.filter(c => c.getBoundingClientRect().right > bord + 1).length,
                fenetre: Math.round(w.getBoundingClientRect().width)
            };
        });
        r.egal('les cinquante-deux cartes sont là', cartes.cartes, 52, JSON.stringify(cartes));
        r.egal('aucune ne passe sous le bord', cartes.dehors, 0,
            JSON.stringify(cartes) + ' — les quatre rois avant');
        r.verifie('et la grille n\'a plus rien à cacher',
            cartes.manque <= 0, JSON.stringify(cartes) + ' — vingt-sept pixels de trop avant');

        r.verifie('aucune erreur de page (les cartes)', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
    }

    return r.bilan();
};
