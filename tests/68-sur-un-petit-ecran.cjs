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
    // ET AUCUNE COMMANDE NE RESTE HORS D'ATTEINTE
    // ------------------------------------------------------------------
    // Borner la hauteur d'une fenêtre l'empêche de pendre sous l'écran ; cela ne
    // dit pas où passe ce qui ne tient plus. Les fenêtres des outils portent
    // « overflow: hidden » : c'était coupé, donc perdu.
    //
    // ON MESURE LES COMMANDES, ET NON « JUSQU'OÙ DESCEND LE CONTENU ». C'est la
    // leçon de ce relevé : à compter les pixels, Scratch semblait perdre deux
    // mille deux cents pixels de contenu — un calque de glissement invisible. À
    // compter les BOUTONS qu'on ne peut pas atteindre, il n'en perdait aucun.
    // En 1280 × 800, aucune commande perdue sur les quatre-vingt-sept outils ;
    // en 1024 × 600, une seule — le « JOUER » de la taupe, posé à y = 594 dans
    // une fenêtre qui s'arrête à 592. Un seul bouton, mais celui qui lance le
    // jeu, et rien pour aller le chercher : la fenêtre bornée défile désormais.
    const commandes = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const vu = (el) => {
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden'
                && parseFloat(s.opacity || '1') > 0.05;
        };
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
        // Un cadre qui défile entre la commande et le dehors : on peut l'y amener.
        // La fenêtre elle-même en fait partie, depuis qu'elle défile.
        const onPeutLAmener = (c, f) => {
            let n = c.parentElement;
            while (n && n !== f.parentElement) {
                const s = getComputedStyle(n);
                const defile = /auto|scroll/.test(s.overflowY) || /auto|scroll/.test(s.overflow);
                if (defile && n.scrollHeight > n.clientHeight + 2) return true;
                n = n.parentElement;
            }
            return false;
        };
        const perdues = [];
        const examiner = (etiquette) => {
            document.querySelectorAll('[data-equipee="1"]').forEach(f => {
                if (!vu(f) || !f.getClientRects().length) return;
                const b = f.getBoundingClientRect();
                if (b.width < 80 || b.height < 60) return;
                f.querySelectorAll('button, input, select, textarea, [role="button"], .btn')
                    .forEach(c => {
                        if (!vu(c)) return;
                        const rc = c.getBoundingClientRect();
                        if (rc.width < 4 || rc.height < 4) return;
                        const dehors = rc.top > b.bottom - 4 || rc.bottom > b.bottom + 4
                            || rc.top > innerHeight - 4 || rc.bottom > innerHeight + 4;
                        if (!dehors || onPeutLAmener(c, f)) return;
                        const quoi = etiquette + ' / « '
                            + ((c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20)
                               || c.id || c.type || c.tagName)
                            + ' » à ' + Math.round(rc.top) + ', fenêtre jusqu\'à '
                            + Math.round(b.bottom) + ', écran ' + innerHeight;
                        if (!perdues.includes(quoi)) perdues.push(quoi);
                    });
            });
        };
        toutRefermer();
        const grille = document.getElementById('plugins-grid');
        if (grille) grille.style.display = 'grid';
        const boutons = [...document.querySelectorAll('#plugins-grid .btn')];
        for (const b of boutons) {
            const quoi = (b.dataset.pluginKey || b.getAttribute('data-tooltip') || b.title || '?').slice(0, 24);
            try { b.click(); } catch (e) { /* refuse de s'ouvrir */ }
            await attendre(150);
            examiner(quoi);
            toutRefermer();
        }
        return { perdues, outils: boutons.length };
    });
    r.verifie('les outils ont été rouverts pour chercher les commandes perdues',
        commandes.outils >= 80, String(commandes.outils));
    r.egal('aucune commande hors d\'atteinte', commandes.perdues, []);

    // ET LA BARRE RESTE EN HAUT QUAND LA FENÊTRE DÉFILE. C'est la contrepartie
    // du défilement : la barre de titre et le coin bas sont posés « absolute »
    // et s'en vont avec le contenu. Sans rien pour les retenir, le premier tour
    // de molette emporte la croix hors de l'écran — on aurait échangé un
    // cul-de-sac contre un autre.
    const enDefilant = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        const b = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(x => /taupe/i.test(x.getAttribute('data-tooltip') || x.title || ''));
        if (!b) return null;
        b.click();
        await attendre(700);
        const f = [...document.querySelectorAll('[data-equipee="1"]')]
            .find(x => x.getClientRects().length && x.scrollHeight > x.clientHeight + 2);
        if (!f) return { defilante: false };
        const lire = () => {
            const tete = f.querySelector(':scope > .fen-tete');
            const croix = tete && tete.querySelector('.fen-fermer');
            const outils = f.querySelector(':scope > .fen-outils');
            const rb = f.getBoundingClientRect();
            const rt = tete.getBoundingClientRect();
            const rc = croix && croix.getBoundingClientRect();
            const ro = outils && outils.getBoundingClientRect();
            const sous = rc ? document.elementFromPoint(rc.left + rc.width / 2,
                                                        rc.top + rc.height / 2) : null;
            return {
                barreEnHaut: Math.round(rt.top - rb.top),
                coinEnBas: ro ? Math.round(rb.bottom - ro.bottom) : null,
                croixAtteinte: !!(sous && croix
                    && (sous === croix || croix.contains(sous) || sous.contains(croix)))
            };
        };
        const avant = lire();
        f.scrollTop = 9999;
        await attendre(250);
        return { defilante: true, avant, apres: lire(), aDefile: Math.round(f.scrollTop) };
    });
    if (enDefilant && enDefilant.defilante) {
        r.verifie('la fenêtre a bien défilé', enDefilant.aDefile > 10, JSON.stringify(enDefilant));
        r.egal('la barre de titre reste à sa place', enDefilant.apres.barreEnHaut,
            enDefilant.avant.barreEnHaut, JSON.stringify(enDefilant));
        r.egal('le coin bas aussi', enDefilant.apres.coinEnBas,
            enDefilant.avant.coinEnBas, JSON.stringify(enDefilant));
        r.egal('et la croix se laisse toujours viser', enDefilant.apres.croixAtteinte, true,
            JSON.stringify(enDefilant));
    } else {
        r.verifie('une fenêtre qui défile a bien été trouvée', false, JSON.stringify(enDefilant));
    }

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

    // ------------------------------------------------------------------
    // ET SI L'ÉCRAN RÉTRÉCIT EN COURS DE ROUTE
    // ------------------------------------------------------------------
    // Cela arrive pour de vrai : on branche le vidéoprojecteur et la résolution
    // change, on fait pivoter une tablette, on partage l'écran en deux. Rien ne
    // suivait : les fenêtres gardaient leur place, et celles qui tenaient tout
    // juste se retrouvaient dehors, barre de titre comprise.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
    const ouvertes = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        let posees = 0;
        // Quelques outils qui portent de grandes fenêtres : c'est sur elles que
        // le rétrécissement se voit.
        for (const cle of ['tableStudioTool', 'evolutionStudioTool', 'funcPlotter',
                           'moleculeStudioTool', 'pixelStudioTool']) {
            const p = PluginManager.plugins[cle];
            if (!p) continue;
            for (const verbe of ['ouvrir', 'open', 'ouvrirFenetre', 'afficher', 'show']) {
                if (typeof p[verbe] === 'function' && p[verbe].length === 0) {
                    try { p[verbe](); posees++; } catch (e) { /* tant pis */ }
                    break;
                }
            }
            await attendre(250);
        }
        return posees;
    });
    r.verifie('des fenêtres sont bien ouvertes avant qu\'on rétrécisse',
        ouvertes >= 2, String(ouvertes));
    await page.setViewportSize({ width: 800, height: 520 });
    await page.waitForTimeout(600);
    const apresRetrecissement = await page.evaluate(() => {
        const dehors = [], inatteignables = [];
        document.querySelectorAll('[data-equipee="1"]').forEach(f => {
            if (!f.getClientRects().length) return;
            const s = getComputedStyle(f);
            if (s.visibility === 'hidden') return;
            const b = f.getBoundingClientRect();
            if (b.width < 80 || b.height < 60) return;
            const tete = f.querySelector(':scope > .fen-tete');
            if (!tete) return;
            const nom = ((tete.textContent || f.id || '?').replace(/\s+/g, ' ').trim()).slice(0, 26);
            if (b.top < -1 || b.left < -1 || b.bottom > innerHeight + 1 || b.right > innerWidth + 1) {
                dehors.push(nom + ' [' + Math.round(b.left) + ',' + Math.round(b.top) + ' '
                    + Math.round(b.width) + 'x' + Math.round(b.height) + ']');
            }
            const croix = tete.querySelector('.fen-fermer');
            if (croix) {
                const rc = croix.getBoundingClientRect();
                const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
                const sous = document.elementFromPoint(x, y);
                const saCroix = sous && (croix === sous || croix.contains(sous) || sous.contains(croix));
                // CINQ FENÊTRES OUVERTES EN MÊME TEMPS SE RECOUVRENT, et c'est
                // normal : ramenées dans un écran de 800 × 520, elles se posent
                // toutes à la même place. Une croix cachée par UNE AUTRE FENÊTRE
                // n'est pas perdue — on déplace celle du dessus, ou on la ferme.
                // Ce qui serait perdu, c'est une croix que plus RIEN ne reçoit,
                // ou qu'un voile intercepte.
                const uneAutreFenetre = sous && sous.closest('[data-equipee="1"]')
                    && sous.closest('[data-equipee="1"]') !== f;
                if (!saCroix && !uneAutreFenetre) {
                    inatteignables.push(nom + ' en ' + Math.round(x) + ',' + Math.round(y)
                        + ' → ' + (sous ? String(sous.id || (typeof sous.className === 'string'
                            ? sous.className : '') || sous.tagName) : 'personne'));
                }
            }
        });
        return { dehors, inatteignables, ecran: [innerWidth, innerHeight] };
    });
    r.egal('après le rétrécissement, aucune fenêtre n\'est restée dehors',
        apresRetrecissement.dehors, []);
    r.egal('et chaque croix se laisse encore viser',
        apresRetrecissement.inatteignables, []);

    // LA BOÎTE DE RÉGLAGES DES TAMPONS SUIT AUSSI. Elle naît à « left: 200px » :
    // sur un écran de 320 px de large, elle sortait par la droite avec ses
    // boutons.
    const boite = await page.evaluate(async () => {
        if (typeof openCustomPrompt !== 'function') return null;
        openCustomPrompt('Essai', [{ label: 'Nombre', type: 'number', value: '3' }], null,
            () => {}, () => {});
        await new Promise(ok => setTimeout(ok, 300));
        const m = document.getElementById('custom-prompt-modal');
        return m && m.getClientRects().length ? true : false;
    });
    if (boite) {
        await page.setViewportSize({ width: 420, height: 520 });
        await page.waitForTimeout(500);
        const place = await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            const b = m.getBoundingClientRect();
            return { g: Math.round(b.left), d: Math.round(b.right), h: Math.round(b.top),
                     bas: Math.round(b.bottom), ecran: [innerWidth, innerHeight] };
        });
        r.verifie('la boîte de réglages reste dans l\'écran rétréci',
            place.g >= 0 && place.d <= place.ecran[0] + 1 && place.h >= 0,
            JSON.stringify(place));
        await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            if (m) m.style.display = 'none';
        });
    } else {
        r.verifie('la boîte de réglages a bien pu être ouverte', false, 'non');
    }

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
