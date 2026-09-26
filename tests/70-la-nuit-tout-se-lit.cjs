// LA NUIT, TOUT SE LIT ENCORE
//
// « Tu peux lancer un agent pour vérifier que c'est user friendly pour tous les
// plugin. » Mesuré en mode sombre, sur les quatre-vingt-sept outils : cent
// quatre-vingt-seize textes sous 3:1 — le plancher qu'on demande à un simple
// symbole, et loin des 4,5:1 d'un texte. Le motif était toujours le même :
//
//   un outil écrit le fond de son panneau EN DUR — blanc, #f8f9fa, #f1f2f6 —
//   et n'écrit pas la couleur du texte. Celle-ci vient alors du corps de la
//   page, qui passe au gris clair la nuit : #dfe6e9 sur #f1f2f6 donne 1,13:1.
//   Rien n'est faux dans l'outil pris seul ; c'est la rencontre de deux choix
//   qui l'est, et il y a quatre-vingt-sept outils où elle peut avoir lieu.
//
// DEUX CAUSES PARTAGÉES en portaient cent trente : la boîte de réglages des
// tampons, qui n'avait pas de nuit, et deux états vides de l'arborescence
// écrits en gris fixe. Le reste est rattrapé à l'ouverture de chaque panneau :
// sous 3:1 sur un fond NEUTRE, l'encre est poussée vers le clair ou le sombre
// jusqu'à ce qu'elle se voie — sa teinte est gardée, car les étiquettes de
// l'analyse grammaticale sont un code de couleurs.
//
// CE QUE CE CHAPITRE NE DEMANDE PAS : le blanc sur le vert des boutons
// « Poser au tableau » rend 2,54:1, et c'est pareil de jour. C'est la palette de
// l'application, pas un défaut de la nuit ; la changer se décide, cela ne se
// rattrape pas. On mesure donc ce qui est posé sur un fond NEUTRE.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La nuit, tout se lit encore');
    const { page, context, erreurs } = await ouvrirApp(browser, {});
    await page.evaluate(() => {
        if (typeof toggleDarkMode === 'function' && !document.body.classList.contains('dark-mode')) {
            toggleDarkMode();
        }
    });
    await page.waitForTimeout(300);
    r.verifie('le tableau est bien passé à la nuit',
        await page.evaluate(() => document.body.classList.contains('dark-mode')), 'dark-mode');

    const releve = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const vu = (el) => {
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden';
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
        // On refait le calcul du contraste DANS L'ÉPREUVE, sans rien emprunter à
        // l'application : si elle se trompait de formule, une épreuve qui
        // réutilise sa formule se tromperait avec elle.
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = ([r0, g0, b0]) => 0.2126 * lin(r0) + 0.7152 * lin(g0) + 0.0722 * lin(b0);
        const nb = (s) => { const v = (s || '').match(/[\d.]+/g); return v ? v.map(Number) : null; };
        const fondDe = (el) => {
            let n = el;
            while (n && n.nodeType === 1) {
                const c = nb(getComputedStyle(n).backgroundColor);
                if (c && (c.length < 4 || c[3] > 0.92)) return { rgb: c.slice(0, 3), porteur: n };
                n = n.parentElement;
            }
            return { rgb: [255, 255, 255], porteur: null };
        };
        const neutre = (rgb) => Math.max(...rgb) - Math.min(...rgb) <= 24;

        const illisibles = [];
        let textesVus = 0;
        const examiner = (etiquette) => {
            document.querySelectorAll('div, span, label, p, td, th, li, button, h1, h2, h3, h4, strong, small, a')
                .forEach(el => {
                    if (!vu(el)) return;
                    if (el.closest('#board, .toolbar, .drawer, #plugins-grid, #thumbnail-drawer')) return;
                    let propre = false;
                    for (const n of el.childNodes) {
                        if (n.nodeType === 3 && n.nodeValue.trim().length > 1) { propre = true; break; }
                    }
                    if (!propre) return;
                    const boite = el.getBoundingClientRect();
                    if (boite.width < 6 || boite.height < 6) return;
                    const s = getComputedStyle(el);
                    const opacite = parseFloat(s.opacity || '1');
                    // Ce qu'un outil cache derrière son opacité — les réponses de
                    // « Questions Flash » — n'est pas un texte illisible, c'est un
                    // texte qu'on ne montre pas encore.
                    if (opacite < 0.35) return;
                    const encre = nb(s.color);
                    if (!encre) return;
                    const { rgb: fond, porteur } = fondDe(el);
                    if (!porteur || porteur === document.body || porteur === document.documentElement) return;
                    if (!neutre(fond)) return;      // la palette de l'application, voir l'en-tête
                    textesVus++;
                    const vue = encre.slice(0, 3).map((v, i) => v * opacite + fond[i] * (1 - opacite));
                    const l1 = lum(vue), l2 = lum(fond);
                    const rap = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                    if (rap >= 3) return;
                    const quoi = etiquette + ' | ' + s.color + ' sur rgb(' + fond.join(',') + ') = '
                        + rap.toFixed(2) + ' | « '
                        + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) + ' »';
                    if (!illisibles.includes(quoi)) illisibles.push(quoi);
                });
        };

        toutRefermer();
        const grille = document.getElementById('plugins-grid');
        if (grille) grille.style.display = 'grid';
        const boutons = [...document.querySelectorAll('#plugins-grid .btn')];
        for (const b of boutons) {
            const quoi = (b.dataset.pluginKey || b.getAttribute('data-tooltip') || b.title || '?').slice(0, 26);
            try { b.click(); } catch (e) { /* cet outil refuse de s'ouvrir */ }
            await attendre(150);
            examiner(quoi);
            toutRefermer();
        }
        return { illisibles, textesVus, outils: boutons.length };
    });

    r.verifie('les quatre-vingt-sept outils ont été ouverts, la nuit',
        releve.outils >= 80, String(releve.outils));
    r.verifie('et l\'on a bien mesuré des textes sur des fonds neutres',
        releve.textesVus >= 300, String(releve.textesVus));
    r.egal('aucun texte sous 3:1 sur un fond neutre', releve.illisibles, []);

    // ------------------------------------------------------------------
    // CE QU'UN OUTIL CACHE RESTE CACHÉ
    // ------------------------------------------------------------------
    // Ce contrôle est né d'une faute qu'on a failli commettre : le rattrapage
    // d'encre rendait son opacité à tout texte trop pâle — et les réponses de
    // « Questions Flash », gardées derrière « opacity: 0 » jusqu'à ce que le
    // professeur les révèle, s'affichaient donc AVANT la question. Mesuré, puis
    // corrigé : sous 0,35 d'opacité, le rattrapage passe son chemin.
    const reponses = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins['flashQuestionsTool'] || Object.values(PluginManager.plugins)
            .find(p => p && p.widgetEl !== undefined && /flash/i.test(p.id || ''));
        const bouton = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(b => /Questions Flash/i.test(b.getAttribute('data-tooltip') || b.title || ''));
        if (!bouton) return { trouve: false };
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        bouton.click();
        await attendre(700);
        const gen = document.getElementById('fl-btn-gen');
        if (gen) { gen.click(); await attendre(600); }
        const cache = [...document.querySelectorAll('.fl-q-ans')];
        const opacites = cache.slice(0, 4).map(e => parseFloat(getComputedStyle(e).opacity || '1'));
        const bascule = document.getElementById('fl-btn-toggle-ans');
        if (bascule) { bascule.click(); await attendre(400); }
        const apres = [...document.querySelectorAll('.fl-q-ans')].slice(0, 4)
            .map(e => parseFloat(getComputedStyle(e).opacity || '1'));
        return { trouve: true, combien: cache.length, opacites, apres, P: !!P };
    });
    if (reponses.trouve && reponses.combien > 0) {
        r.verifie('les réponses de « Questions Flash » restent cachées tant qu\'on ne les demande pas',
            reponses.opacites.every(o => o < 0.35), JSON.stringify(reponses));
        r.verifie('et la bascule les révèle',
            reponses.apres.every(o => o > 0.9), JSON.stringify(reponses));
    } else {
        r.verifie('« Questions Flash » a bien été ouvert et a produit des réponses à cacher',
            false, JSON.stringify(reponses));
    }

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
