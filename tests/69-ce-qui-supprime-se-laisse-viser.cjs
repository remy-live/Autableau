// CE QUI SUPPRIME SE LAISSE VISER, ET SE LIT
//
// « Tu peux lancer un agent pour vérifier que c'est user friendly pour tous les
// plugin. » L'audit des quatre-vingt-sept outils a trouvé, entre autres, neuf
// croix de suppression plus petites que vingt-quatre pixels — une de 8 × 11
// dans le tableau de proportionnalité, une de 12 × 16 dans l'éditeur de signes,
// neuf de 18 × 18 dans la frise — et trois boutons destructeurs qui ne disaient
// pas leur nom : ni titre, ni « aria-label », et un « ✕ » pour tout texte.
//
// ON LES VISE AU DOIGT. C'est un tableau interactif : une cible de huit pixels
// de large n'est pas petite, elle est hors d'atteinte — et quand on finit par
// l'attraper, c'est une suppression. Vingt-quatre pixels est le plancher de la
// règle WCAG 2.5.8, et c'est celui qu'on tient ici.
//
// ET LES DEUX BOUTONS DE TOUTES LES FENÊTRES avec elles : 22 × 22 à demi
// effacés, le « ✕ » à 2,93:1 en clair et 1,79:1 en sombre — sous le plancher de
// 3:1 qu'on demande à un symbole. Ils mesurent 28 × 28 et s'encrent pleinement.
//
// CE CHAPITRE OUVRE LES QUATRE-VINGT-SEPT OUTILS et mesure tout ce qui
// supprime. Il ne juge pas sur une liste écrite à la main : il cherche les
// boutons dont le texte ou le nom PARLE de supprimer, et les mesure tous.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Ce qui supprime se laisse viser');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    const releve = await page.evaluate(async () => {
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
        // CE QUI SUPPRIME SE RECONNAÎT À CE QU'IL DIT : une croix pour tout
        // texte, ou un nom qui parle de supprimer, d'effacer, de vider, de
        // retirer. C'est plus large qu'une liste d'identifiants, et cela
        // attrapera les outils qu'on écrira demain.
        const DESTRUCTIF = /^[×✕✖⨯xX✗❌🗑️🗑]$|supprim|effac|vider|retirer|enlever/i;
        const nomDe = (el) => (el.getAttribute('aria-label') || el.title
            || el.dataset.tooltip || '').trim();
        const petites = [], sansNom = [];
        const tailles = new Set();
        let destructeurs = 0;

        const examiner = (etiquette) => {
            document.querySelectorAll('button, [role="button"], .btn').forEach(el => {
                if (!vu(el)) return;
                const b = el.getBoundingClientRect();
                if (!b.width || !b.height) return;
                const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                const nom = nomDe(el);
                // Les deux boutons des fenêtres sont mesurés à part, plus bas.
                if (el.classList.contains('fen-fermer') || el.classList.contains('fen-plein')) {
                    tailles.add(Math.round(b.width) + 'x' + Math.round(b.height));
                    return;
                }
                if (!DESTRUCTIF.test(txt) && !DESTRUCTIF.test(nom)) return;
                destructeurs++;
                const quoi = etiquette + ' / « ' + (txt || '∅') + ' » nom=« ' + (nom || '∅')
                    + ' » ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' '
                    + String(el.id || (typeof el.className === 'string' ? el.className : '')
                        || el.tagName).slice(0, 40);
                if (b.width < 24 || b.height < 24) {
                    if (!petites.includes(quoi)) petites.push(quoi);
                }
                // UN « ✕ » N'EST PAS UN NOM. Lu à voix haute par un lecteur
                // d'écran, ou survolé par un professeur qui hésite, il ne dit
                // rien de ce qu'il va détruire.
                if (!nom && txt.length <= 2) {
                    if (!sansNom.includes(quoi)) sansNom.push(quoi);
                }
            });
        };

        toutRefermer();
        const grille = document.getElementById('plugins-grid');
        if (grille) grille.style.display = 'grid';
        const boutons = [...document.querySelectorAll('#plugins-grid .btn')];
        for (const bouton of boutons) {
            const quoi = (bouton.dataset.pluginKey || bouton.getAttribute('data-tooltip')
                || bouton.title || '?').slice(0, 26);
            try { bouton.click(); } catch (e) { /* cet outil refuse de s'ouvrir */ }
            await attendre(150);
            examiner(quoi);
            toutRefermer();
        }
        return { petites, sansNom, tailles: [...tailles], destructeurs, outils: boutons.length };
    });

    // LES GARDE-FOUS D'ABORD : un chapitre qui n'ouvre rien passerait tout seul.
    r.verifie('les quatre-vingt-sept outils ont été ouverts',
        releve.outils >= 80, String(releve.outils));
    r.verifie('et l\'on a bien rencontré des boutons qui suppriment',
        releve.destructeurs >= 20, String(releve.destructeurs));

    r.egal('aucune cible de suppression sous vingt-quatre pixels', releve.petites, []);
    r.egal('et aucune qui ne dise ce qu\'elle détruit', releve.sansNom, []);
    r.egal('les deux boutons des fenêtres mesurent 28 × 28', releve.tailles, ['28x28']);

    // ------------------------------------------------------------------
    // ET LA CROIX SE LIT, DE JOUR COMME DE NUIT
    // ------------------------------------------------------------------
    // On calcule le contraste sur les couleurs déclarées, opacité comprise :
    // c'est ce que la feuille de style promet, et c'est là que le défaut vivait.
    const lire = async () => page.evaluate(() => {
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const nb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const melange = (f, o, fond) => f.map((v, i) => v * o + fond[i] * (1 - o));
        // Une fenêtre équipée, n'importe laquelle : la barre est la même partout.
        const tete = document.querySelector('.fen-tete');
        if (!tete) return null;
        const croix = tete.querySelector('.fen-fermer');
        const plein = document.querySelector('.fen-plein');
        const fond = nb(getComputedStyle(tete).backgroundColor);
        const ratio = (el) => {
            if (!el) return null;
            const s = getComputedStyle(el);
            const encre = melange(nb(s.color), parseFloat(s.opacity || '1'), fond);
            const l1 = lum(encre), l2 = lum(fond);
            return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
        };
        return { croix: ratio(croix), plein: ratio(plein), fond: getComputedStyle(tete).backgroundColor };
    });

    // On ouvre un outil qui porte une fenêtre : sans fenêtre, rien à mesurer.
    const ouverte = await page.evaluate(async () => {
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        const p = PluginManager.plugins['funcPlotter'] || PluginManager.plugins['tableStudioTool'];
        for (const verbe of ['ouvrir', 'open', 'ouvrirFenetre', 'afficher', 'show']) {
            if (p && typeof p[verbe] === 'function' && p[verbe].length === 0) {
                try { p[verbe](); } catch (e) { /* tant pis */ }
                break;
            }
        }
        // À défaut, n'importe quel outil de la grille fera une fenêtre.
        await new Promise(ok => setTimeout(ok, 400));
        if (!document.querySelector('.fen-tete')) {
            for (const b of [...document.querySelectorAll('#plugins-grid .btn')].slice(0, 12)) {
                b.click();
                await new Promise(ok => setTimeout(ok, 200));
                if (document.querySelector('.fen-tete')) break;
            }
        }
        return !!document.querySelector('.fen-tete');
    });
    r.verifie('une fenêtre est là pour qu\'on mesure sa barre', ouverte, String(ouverte));

    const jour = await lire();
    r.verifie('de jour, la croix se lit : au moins 3:1',
        jour && jour.croix >= 3, JSON.stringify(jour));
    r.verifie('et le plein écran aussi',
        jour && jour.plein >= 3, JSON.stringify(jour));

    await page.evaluate(() => document.body.classList.add('dark-mode'));
    await page.waitForTimeout(200);
    const nuit = await lire();
    await page.evaluate(() => document.body.classList.remove('dark-mode'));
    // C'ÉTAIT 1,79:1 : le rouge du jour posé sur un bandeau sombre. La nuit
    // n'est pas un cas particulier qu'on traite après, c'est la moitié des
    // usages — un tableau allumé dans une salle qu'on vient d'obscurcir.
    r.verifie('de nuit, la croix se lit toujours : au moins 3:1',
        nuit && nuit.croix >= 3, JSON.stringify(nuit));
    r.verifie('et le bandeau sombre n\'est pas le même que le clair : on a bien changé de monde',
        jour && nuit && jour.fond !== nuit.fond, JSON.stringify({ jour: jour && jour.fond, nuit: nuit && nuit.fond }));

    // ------------------------------------------------------------------
    // ET LES PASTILLES DE COULEUR DISENT LEUR COULEUR
    // ------------------------------------------------------------------
    // Relevé pendant l'audit : quatre-vingt-quatre pastilles sans un nom — ni
    // titre, ni « aria-label » —, et un rond de vingt-six pixels ne dit rien à
    // qui ne voit pas bien, rien du tout à un lecteur d'écran. « #6c5ce7 » non
    // plus ne dit rien à personne : ce sont des mots de professeur qu'il faut,
    // « bleu », « vert foncé », « violet clair ».
    const mots = await page.evaluate(() => {
        if (typeof nommerLaCouleur !== 'function') return null;
        const out = {};
        ['#2d3436', '#0984e3', '#d63031', '#00b894', '#e17055', '#6c5ce7', '#ffffff',
         '#b2bec3', '#636e72', '#dfe6e9', '#fdcb6e', '#a29bfe', '#795548', '#e84393',
         'rgb(46, 204, 113)'].forEach(c => { out[c] = nommerLaCouleur(c); });
        return out;
    });
    r.egal('chaque couleur de l\'application a son mot', mots, {
        '#2d3436': 'noir', '#0984e3': 'bleu', '#d63031': 'rouge', '#00b894': 'turquoise',
        '#e17055': 'orange', '#6c5ce7': 'violet', '#ffffff': 'blanc', '#b2bec3': 'gris',
        '#636e72': 'gris foncé', '#dfe6e9': 'gris clair', '#fdcb6e': 'jaune',
        '#a29bfe': 'violet clair', '#795548': 'brun', '#e84393': 'rose',
        'rgb(46, 204, 113)': 'vert'
    });
    // ET L'HEXADÉCIMAL SE LIT DEUX SIGNES PAR DEUX SIGNES. Le premier essai
    // lisait « les chiffres de la chaîne » : sur « #6c5ce7 » il trouvait 6, 5 et
    // 7, et nommait un noir presque parfait. C'est le genre de faute qui donne
    // un résultat plausible partout et faux partout.
    r.egal('« #f00 » vaut bien « #ff0000 », et « #6c5ce7 » n\'est pas noir',
        await page.evaluate(() => [nommerLaCouleur('#f00'), nommerLaCouleur('#ff0000'),
                                   nommerLaCouleur('#6c5ce7')]),
        ['rouge', 'rouge', 'violet']);

    const pastilles = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        let total = 0, sansNom = 0, sansClavier = 0;
        const exemples = [];
        for (const b of [...document.querySelectorAll('#plugins-grid .btn')]) {
            try { b.click(); } catch (e) { /* tant pis */ }
            await attendre(150);
            document.querySelectorAll('.swatch').forEach(s => {
                total++;
                const nom = (s.getAttribute('aria-label') || s.title || '').trim();
                if (!nom) sansNom++;
                else if (exemples.length < 4) exemples.push(nom);
                if (s.tabIndex !== 0) sansClavier++;
            });
            const boite = document.getElementById('custom-prompt-modal');
            if (boite) boite.style.display = 'none';
        }
        return { total, sansNom, sansClavier, exemples };
    });
    r.verifie('on a bien rencontré des pastilles de couleur',
        pastilles.total >= 80, JSON.stringify(pastilles));
    r.egal('aucune pastille ne reste sans nom', pastilles.sansNom, 0);
    r.egal('et chacune se prend au clavier', pastilles.sansClavier, 0);

    // ------------------------------------------------------------------
    // LES COMMANDES DE LA BARRE DE TITRE SONT DE LA MÊME MAIN
    // ------------------------------------------------------------------
    // « L'icône de fermeture et de plein écran font vieillot. » La croix était
    // un « ✕ » PRIS DANS LA POLICE : sa taille, son épaisseur et sa forme
    // changeaient d'une machine à l'autre, et à côté du plein écran — dessiné,
    // fin, aux bouts arrondis — elle faisait tache. Les deux étaient de plus
    // posées sur des pastilles teintées en permanence, un rouge et un gris, qui
    // attiraient l'œil bien plus que ce qu'elles font ne le mérite.
    //
    // ON MESURE CE QUI FAIT QU'ELLES VONT ENSEMBLE : toutes deux dessinées, au
    // même format, de la même épaisseur de trait, sans fond au repos — et
    // lisibles sur leur bandeau, de jour comme de nuit.
    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    // ON ATTEND LA FENÊTRE, ON NE LA CHRONOMÈTRE PAS. Six cents millisecondes
    // suffisaient presque toujours — et une fois sur une suite entière, non :
    // le relevé de jour rendait « null » quand celui de nuit, pris quatre
    // cents millisecondes plus tard, trouvait tout. Un délai fixe en face d'une
    // ouverture asynchrone finit toujours par mentir.
    // Et si elle ne vient JAMAIS, l'attente ne doit pas faire exploser le
    // chapitre : on la laisse expirer, et les contrôles d'en dessous disent
    // proprement ce qui manque. Une absence se rapporte, elle ne se crashe pas.
    await page.waitForFunction(
        () => !!document.querySelector('#calc-widget > .fen-tete .fen-fermer'),
        { timeout: 15000 }).catch(() => { });

    const commandes = await page.evaluate(async () => {
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = (s) => { const v = s.match(/[\d.]+/g).map(Number); return 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]); };
        const relever = () => {
            const tete = document.querySelector('#calc-widget > .fen-tete');
            if (!tete) return null;
            const fond = lum(getComputedStyle(tete).backgroundColor);
            const lire = (c) => {
                const b = tete.querySelector('.' + c);
                if (!b) return null;
                const s = getComputedStyle(b);
                const svg = b.querySelector('svg');
                const trait = svg ? svg.querySelector('path') : null;
                const r = b.getBoundingClientRect();
                const e = lum(s.color);
                return {
                    dessinee: !!svg,
                    texte: b.textContent.trim(),
                    epaisseur: trait ? trait.getAttribute('stroke-width') : null,
                    format: svg ? svg.getAttribute('viewBox') : null,
                    cible: [Math.round(r.width), Math.round(r.height)],
                    sansFondAuRepos: /rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor),
                    contraste: (Math.max(e, fond) + 0.05) / (Math.min(e, fond) + 0.05),
                };
            };
            return { fermer: lire('fen-fermer'), plein: lire('fen-plein') };
        };
        const jour = relever();
        document.body.classList.add('dark-mode');
        await new Promise(ok => setTimeout(ok, 400));
        const nuit = relever();
        document.body.classList.remove('dark-mode');
        return { jour, nuit };
    });

    if (!commandes.jour || !commandes.jour.fermer || !commandes.jour.plein) {
        r.verifie('la barre de titre porte ses deux commandes', false, JSON.stringify(commandes));
    } else {
        const f = commandes.jour.fermer, p = commandes.jour.plein;
        r.egal('la croix est dessinée et non écrite', [f.dessinee, f.texte], [true, '']);
        r.egal('le plein écran aussi', p.dessinee, true);
        r.egal('les deux dessins ont le même format', f.format, p.format);
        r.egal('et la même épaisseur de trait', f.epaisseur, p.epaisseur);
        r.egal('les deux cibles ont la même taille', f.cible, p.cible);
        r.verifie('et elles se laissent viser',
            f.cible[0] >= 24 && f.cible[1] >= 24, JSON.stringify(f.cible));
        r.egal('aucune n\'est une pastille de couleur au repos',
            [f.sansFondAuRepos, p.sansFondAuRepos], [true, true]);
        // Le plancher d'une commande — un dessin, pas du texte — est de 3:1.
        r.verifie('elles se lisent de jour',
            Math.min(f.contraste, p.contraste) >= 3,
            'croix ' + f.contraste.toFixed(2) + ', plein écran ' + p.contraste.toFixed(2));
        const fn = commandes.nuit.fermer, pn = commandes.nuit.plein;
        r.verifie('et elles se lisent de nuit',
            Math.min(fn.contraste, pn.contraste) >= 3,
            'croix ' + fn.contraste.toFixed(2) + ', plein écran ' + pn.contraste.toFixed(2));
    }

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
