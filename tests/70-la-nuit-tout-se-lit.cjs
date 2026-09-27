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
// écrits en gris fixe. Tout le reste est rattrapé à l'ouverture de chaque
// panneau — et c'est aujourd'hui UNE SEULE RÈGLE, pour les quatre-vingt-sept
// outils, les deux thèmes et n'importe quel fond.
//
// COMMENT ON EN EST ARRIVÉ À UNE SEULE RÈGLE. On avait d'abord assombri les
// fonds : onze couleurs de la palette, chacune juste assez pour que le blanc y
// rende 4,5:1. « J'aime bien l'ancien. » Les couleurs vives sont donc revenues
// — toutes —, et c'est l'ENCRE qui cède désormais, partout, comme elle le
// faisait déjà sur les tuiles algébriques, dont la couleur n'avait jamais bougé.
// Onze exceptions écrites à la main ont laissé la place à une règle qu'on
// mesure : « Fais tout ce qui donne une cohérence au projet. »
//
// LE BARÈME EST CELUI DE LA NORME, et il en a deux : un texte demande 4,5:1, un
// GRAND texte — vingt-quatre pixels, ou dix-neuf en gras — n'en demande que 3,
// parce qu'à cette taille l'œil rattrape ce que le contraste ne donne pas. Les
// gros boutons des jeux gardent ainsi leur blanc sur leur couleur vive ; les
// petits libellés prennent une encre qui se lit. Une encre sans teinte — du
// blanc, du noir — emprunte celle de son fond : un vert très foncé sur un vert
// vif, jamais du gris, sinon le bouton perd sa couleur.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La nuit, tout se lit encore');
    const { page, context, erreurs } = await ouvrirApp(browser, {});
    // ON MESURE LA COULEUR AU REPOS, PAS EN PLEIN FONDU. Les libellés ont une
    // transition de 0,15 s : relevés trop tôt après le rattrapage, ils rendaient
    // encore leur ancienne couleur, et le chapitre accusait une correction qui
    // avait bel et bien eu lieu — vérifié, une demi-seconde plus tard la couleur
    // était la bonne. Couper les transitions est ici la seule façon de mesurer
    // ce que le professeur finit par voir.
    await page.addStyleTag({
        content: '*, *::before, *::after { transition: none !important; animation: none !important; }'
    });

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
        // LE PLANCHER QUE LA NORME DONNE À CE TEXTE-LÀ : 4,5:1, ou 3:1 s'il est
        // grand — vingt-quatre pixels, ou dix-neuf en gras. L'épreuve le recalcule
        // chez elle : une épreuve qui emprunterait sa formule à l'application se
        // tromperait avec elle.
        const plancher = (s) => {
            const taille = parseFloat(s.fontSize) || 16;
            const gras = (parseInt(s.fontWeight, 10) || 400) >= 700;
            return (taille >= 24 || (gras && taille >= 18.66)) ? 3 : 4.5;
        };

        const illisibles = [];
        let textesVus = 0;
        const examiner = (etiquette, vus) => {
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
                    const cible = plancher(s);
                    if (rap >= cible) return;
                    const qui = etiquette + '|' + String(el.id || (typeof el.className === 'string'
                        ? el.className : '') || el.tagName) + '|'
                        + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34);
                    vus.set(qui, etiquette + ' | ' + s.color + ' sur rgb(' + fond.map(Math.round).join(',')
                        + ') = ' + rap.toFixed(2) + ' (plancher ' + cible + ') | « '
                        + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) + ' »');
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
            // ON REGARDE DEUX FOIS, ET L'ON NE RETIENT QUE CE QUI PERSISTE.
            //
            // Mesuré : le panneau des Studios naît SOMBRE et passe au clair une
            // fraction de seconde plus tard ; le rattrapage d'encre suit, et
            // corrige soixante-dix millisecondes après. Relevé une seule fois,
            // l'écart apparaissait une fois sur deux — et il accusait une
            // correction qui avait bien lieu. Un texte qui se corrige tout seul
            // dans la foulée n'est pas illisible ; ce qui l'est encore au second
            // regard, si.
            const premier = new Map();
            examiner(quoi, premier);
            await attendre(300);
            const second = new Map();
            examiner(quoi, second);
            for (const [cle, texte] of second) {
                if (premier.has(cle) && !illisibles.includes(texte)) illisibles.push(texte);
            }
            toutRefermer();
        }
        return { illisibles, textesVus, outils: boutons.length };
    });

    const jour = await balayer();
    r.verifie('les quatre-vingt-sept outils ont été ouverts, de jour',
        jour.outils >= 80, String(jour.outils));
    r.verifie('et l\'on a bien mesuré des textes sur des fonds neutres',
        jour.textesVus >= 300, String(jour.textesVus));
    r.egal('de jour, chaque texte atteint le plancher que la norme lui donne', jour.illisibles, []);

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
    r.egal('et la nuit aussi, sur n\'importe quel fond', nuit.illisibles, []);

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
