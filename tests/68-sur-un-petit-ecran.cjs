// SUR UN PETIT ÉCRAN, AUCUN OUTIL NE DEVIENT UN CUL-DE-SAC
//
// « Tu peux lancer un agent pour vérifier que c'est user friendly pour tous les
// plugin. » L'audit a rendu un verdict rassurant sur l'essentiel — aucune erreur
// de page sur les quatre-vingt-sept outils, aucun bouton muet — et un défaut
// qu'on ne voyait pas parce qu'on ne regardait pas là : sur un vidéoprojecteur
// en 1024 × 600, quatre Studios naissaient AU-DESSUS du bord haut de l'écran.
// Barre de titre à y = −42, croix hors d'atteinte : plus moyen de fermer, ni de
// déplacer, et Échap n'y peut rien. Au milieu d'un cours, c'est l'outil qui
// prend le tableau en otage.
//
// POURQUOI 1024 × 600 : c'est la résolution de beaucoup de vidéoprojecteurs de
// salle, et celle où les fenêtres qui se donnent 950 × 650 dans leur style ne
// tiennent plus. La suite entière mesure en 1280 × 800, où tout va bien — c'est
// exactement pour cela que le défaut a vécu si longtemps.
//
// CE CHAPITRE OUVRE LES QUATRE-VINGT-SEPT OUTILS, un par un, et exige de
// chaque fenêtre qui paraît :
//
//   — qu'elle tienne dans l'écran, bord à bord ;
//   — que sa barre de titre soit visible ;
//   — que sa croix soit ATTEIGNABLE, et non seulement présente : on vise son
//     centre et l'on regarde qui répond ;
//   — que le voile qui la porte reste transparent — « je ne veux pas de voile
//     transparent » veut dire : pas de voile du tout à l'œil.
//
// Et que la barre des outils, qui porte désormais les noms sous les icônes, ne
// déborde pas non plus de cet écran-là.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Sur un petit écran');
    const { page, context, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1024, height: 600 } });

    const toutes = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const vu = (el) => {
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden'
                && parseFloat(s.opacity || '1') > 0.05;
        };
        // Les meubles du tableau ne sont pas des fenêtres : ils se posent
        // par-dessus la page sans rien encadrer.
        const MEUBLES = ['plugins-grid', 'thumbnail-drawer', 'custom-bars-container',
                         'html-postits-container', 'demo-barre', 'demo-liste'];
        const toutRefermer = () => {
            document.querySelectorAll('body > *').forEach(el => {
                if (!vu(el) || MEUBLES.includes(el.id)) return;
                if (el.closest('#board, .toolbar, .drawer')) return;
                const s = getComputedStyle(el);
                if (s.position !== 'fixed' && s.position !== 'absolute') return;
                if (el.getBoundingClientRect().width < 150) return;
                el.style.display = 'none';
            });
        };
        const nom = (f) => {
            const t = f.querySelector(':scope > .fen-tete .barre-nom')
                || f.querySelector(':scope > .fen-tete');
            return ((t && t.textContent) || f.id || '(sans id)')
                .replace(/\s+/g, ' ').trim().slice(0, 34);
        };

        const dehors = [], barreHorsEcran = [], croixInatteignable = [], voilesOpaques = [];
        const vues = new Set();

        const examiner = () => {
            document.querySelectorAll('[data-equipee="1"]').forEach(f => {
                if (!vu(f)) return;
                const tete = f.querySelector(':scope > .fen-tete');
                if (!tete) return;
                const b = f.getBoundingClientRect();
                // Une télécommande n'est pas une fenêtre : rien à y encadrer.
                if (b.width < 80 || b.height < 60) return;
                vues.add(nom(f));
                const quoi = nom(f) + ' [' + Math.round(b.left) + ',' + Math.round(b.top)
                    + ' ' + Math.round(b.width) + 'x' + Math.round(b.height)
                    + ' / écran ' + innerWidth + 'x' + innerHeight + ']';
                if (b.top < -1 || b.left < -1 || b.bottom > innerHeight + 1
                    || b.right > innerWidth + 1) {
                    if (!dehors.includes(quoi)) dehors.push(quoi);
                }
                const rt = tete.getBoundingClientRect();
                if (rt.top < 0 || rt.bottom > innerHeight) {
                    const s = nom(f) + ' barre de ' + Math.round(rt.top) + ' à ' + Math.round(rt.bottom);
                    if (!barreHorsEcran.includes(s)) barreHorsEcran.push(s);
                }
                // LA CROIX SE VISE. Présente et recouverte, elle ne ferme rien :
                // on demande donc à la page QUI répond au centre de la croix.
                const croix = tete.querySelector('.fen-fermer');
                if (croix) {
                    const rc = croix.getBoundingClientRect();
                    const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
                    const sous = document.elementFromPoint(x, y);
                    const atteinte = sous && (croix === sous || croix.contains(sous) || sous.contains(croix));
                    if (!atteinte) {
                        const s = nom(f) + ' croix visée en ' + Math.round(x) + ',' + Math.round(y)
                            + ' → ' + (sous ? (sous.className || sous.tagName) : 'personne');
                        if (!croixInatteignable.includes(s)) croixInatteignable.push(s);
                    }
                }
                // LE VOILE QUI LA PORTE RESTE TRANSPARENT.
                const v = f.parentElement;
                if (v && v !== document.body && vu(v)) {
                    const sv = getComputedStyle(v);
                    const fond = sv.backgroundColor || '';
                    const parts = (fond.match(/rgba?\(([^)]+)\)/) || [, ''])[1].split(',');
                    const alpha = parts.length === 4 ? parseFloat(parts[3])
                        : (fond === 'transparent' || !fond ? 0 : 1);
                    const flou = sv.backdropFilter && sv.backdropFilter !== 'none';
                    if (alpha > 0.02 || flou) {
                        const s = nom(f) + ' voile ' + fond + ', flou ' + sv.backdropFilter;
                        if (!voilesOpaques.includes(s)) voilesOpaques.push(s);
                    }
                }
            });
        };

        toutRefermer();
        const grille = document.getElementById('plugins-grid');
        if (grille) grille.style.display = 'grid';
        const boutons = [...document.querySelectorAll('#plugins-grid .btn')];
        for (const bouton of boutons) {
            try { bouton.click(); } catch (e) { /* cet outil refuse de s'ouvrir */ }
            await attendre(150);
            examiner();
            toutRefermer();
        }
        return { dehors, barreHorsEcran, croixInatteignable, voilesOpaques,
                 outils: boutons.length, vues: vues.size };
    });

    // SANS CES DEUX GARDE-FOUS, le chapitre passerait en n'ouvrant rien — et un
    // test vert qui ne mesure rien est pire qu'un test absent.
    r.verifie('les quatre-vingt-sept outils ont bien été ouverts',
        toutes.outils >= 80, String(toutes.outils));
    r.verifie('et assez de fenêtres ont paru pour que la mesure ait un sens',
        toutes.vues >= 25, String(toutes.vues));

    r.egal('aucune fenêtre ne naît hors de l\'écran', toutes.dehors, []);
    r.egal('aucune barre de titre au-dessus du bord haut', toutes.barreHorsEcran, []);
    r.egal('et chaque croix se laisse viser', toutes.croixInatteignable, []);
    r.egal('aucun voile ne reste visible derrière une fenêtre', toutes.voilesOpaques, []);

    // ------------------------------------------------------------------
    // LA BARRE DES OUTILS, AVEC SES NOMS, TIENT DANS CET ÉCRAN-LÀ
    // ------------------------------------------------------------------
    // Les noms sous les icônes font des rangées de 48 px là où elles en
    // mesuraient 32. C'est sur un petit écran que cela se paierait, s'il y
    // avait quelque chose à payer : on le mesure sur chaque rubrique.
    const tiroir = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const barre = document.getElementById('bar-plugins');
        const grille = document.getElementById('plugins-grid');
        grille.style.display = 'grid';
        const onglets = [...document.querySelectorAll('#plugin-tabs .btn')];
        const coupes = [], debordent = [];
        let rubriques = 0, boutonsVus = 0;
        for (const o of onglets) {
            o.click();
            await attendre(180);
            rubriques++;
            const rb = barre.getBoundingClientRect();
            const rg = grille.getBoundingClientRect();
            if (rb.top < -1 || rb.bottom > innerHeight + 1) {
                debordent.push((o.dataset.cat || o.textContent.trim())
                    + ' : barre de ' + Math.round(rb.top) + ' à ' + Math.round(rb.bottom));
            }
            [...grille.querySelectorAll('.btn')].forEach(x => {
                if (getComputedStyle(x).display === 'none') return;
                boutonsVus++;
                const r = x.getBoundingClientRect();
                // Dans la grille, qui défile chez elle — mais pas sous l'écran.
                if (r.right > rg.right + 1 || r.left < rg.left - 1 || r.bottom > innerHeight + 1) {
                    const s = (o.dataset.cat || '?') + ' / '
                        + (x.dataset.plugin || x.title || '?')
                        + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ']';
                    if (!coupes.includes(s)) coupes.push(s);
                }
            });
        }
        return { coupes, debordent, rubriques, boutonsVus };
    });
    r.verifie('toutes les rubriques ont été passées en revue',
        tiroir.rubriques >= 8 && tiroir.boutonsVus >= 60,
        JSON.stringify(tiroir));
    r.egal('la barre des outils reste dans l\'écran, rubrique après rubrique',
        tiroir.debordent, []);
    r.egal('et aucun outil n\'est coupé par le bord', tiroir.coupes, []);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
