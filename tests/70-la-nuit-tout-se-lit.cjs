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
// ET LA PALETTE A ÉTÉ ASSOMBRIE, elle aussi — mais c'était une DÉCISION, pas un
// rattrapage : « le blanc sur le vert des boutons Poser au tableau rend 2,54:1,
// et c'est pareil de jour. Que veux-tu que j'en fasse ? — Assombrir les fonds. »
// Le vert #00b894 est devenu #00866c, le vert vif #2ecc71 est devenu #1e874b, et
// ainsi de suite : onze couleurs, chacune assombrie juste assez pour que le blanc
// y rende 4,5:1. Les tuiles algébriques, elles, ont gardé leurs couleurs — c'est
// le matériel qu'on manipule — et c'est l'encre de leur libellé qui s'adapte.
// Ce chapitre garde donc DEUX planchers, et ce sont deux questions différentes :
// sur un fond neutre, le rattrapage d'encre répond ; sur une couleur, la palette.
// Ce qui reste entre 3 et 4,5 — le bleu #0984e3 à 3,87, le rouge #e74c3c à
// 3,82 — n'a pas été touché : c'est le visage de l'application, et l'assombrir
// se décide à son tour.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La nuit, tout se lit encore');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    // ON BALAIE DEUX FOIS : de jour, puis de nuit. Le rattrapage d'encre
    // s'applique dans les deux thèmes, et c'est en plein jour qu'on a trouvé la
    // faute de mesure qui aurait pu tout fausser — une pastille de message,
    // posée sur un fond à quatre-vingt-dix pour cent, passait pour du blanc sur
    // du blanc. Un seul des deux balayages n'aurait rien dit.
    const balayer = () => page.evaluate(async () => {
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
        // ON COMPOSE LES FONDS TRANSLUCIDES : une pastille de message est posée
        // sur « rgba(45, 52, 54, 0.9) », et sauter ce fond-là ferait croire que
        // son texte blanc est écrit sur le blanc de la page — 1,08:1 au lieu de
        // 10:1. Une épreuve qui se trompe de fond accuse ce qui va bien.
        const fondDe = (el) => {
            const couches = [];
            let n = el, porteur = null;
            while (n && n.nodeType === 1) {
                const c = nb(getComputedStyle(n).backgroundColor);
                const a = c ? (c.length === 4 ? c[3] : 1) : 0;
                if (c && a > 0.02) {
                    couches.push({ rgb: c.slice(0, 3), a });
                    if (!porteur) porteur = n;
                    if (a > 0.98) break;
                }
                n = n.parentElement;
            }
            let fond = [255, 255, 255];
            for (let i = couches.length - 1; i >= 0; i--) {
                fond = couches[i].rgb.map((v, k) => v * couches[i].a + fond[k] * (1 - couches[i].a));
            }
            return { rgb: fond, porteur };
        };
        // Quarante-cinq points d'écart : un blanc, un gris, un presque-noir, une
        // ardoise à peine bleutée — le bleu-nuit des Studios en fait
        // trente-quatre. Un vert de marque en fait cent quatre-vingt-quatre.
        const neutre = (rgb) => Math.max(...rgb) - Math.min(...rgb) <= 45;

        const illisibles = [], surCouleur = [];
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
                    textesVus++;
                    const vue = encre.slice(0, 3).map((v, i) => v * opacite + fond[i] * (1 - opacite));
                    const l1 = lum(vue), l2 = lum(fond);
                    const rap = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                    if (rap >= 3) return;
                    const quoi = etiquette + ' | ' + s.color + ' sur rgb(' + fond.map(Math.round).join(',')
                        + ') = ' + rap.toFixed(2) + ' | « '
                        + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) + ' »';
                    // DEUX LISTES, PARCE QUE CE SONT DEUX QUESTIONS. Sur un fond
                    // neutre, c'est le rattrapage d'encre qui répond. Sur une
                    // couleur de la palette, c'est la palette elle-même : elle a
                    // été assombrie pour que le blanc s'y lise, et ce contrôle
                    // garde le plancher de 3:1 qu'on a gagné.
                    if (neutre(fond)) {
                        if (!illisibles.includes(quoi)) illisibles.push(quoi);
                    } else if (!surCouleur.includes(quoi)) {
                        surCouleur.push(quoi);
                    }
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
        return { illisibles, surCouleur, textesVus, outils: boutons.length };
    });

    const jour = await balayer();
    r.verifie('les quatre-vingt-sept outils ont été ouverts, de jour',
        jour.outils >= 80, String(jour.outils));
    r.verifie('et l\'on a bien mesuré des textes sur des fonds neutres',
        jour.textesVus >= 300, String(jour.textesVus));
    r.egal('de jour, aucun texte sous 3:1 sur un fond neutre', jour.illisibles, []);
    r.egal('et aucun sous 3:1 sur une couleur de la palette', jour.surCouleur, []);

    await page.evaluate(() => {
        if (typeof toggleDarkMode === 'function' && !document.body.classList.contains('dark-mode')) {
            toggleDarkMode();
        }
    });
    await page.waitForTimeout(300);
    r.verifie('le tableau est bien passé à la nuit',
        await page.evaluate(() => document.body.classList.contains('dark-mode')), 'dark-mode');

    const nuit = await balayer();
    r.verifie('et les quatre-vingt-sept ont été rouverts, la nuit',
        nuit.outils >= 80, String(nuit.outils));
    r.egal('de nuit non plus, aucun texte sous 3:1 sur un fond neutre', nuit.illisibles, []);
    r.egal('ni sur une couleur de la palette', nuit.surCouleur, []);

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
