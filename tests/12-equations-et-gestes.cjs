// Équations à deux membres (ax + b = cx + d) dans les deux générateurs,
// appui long sur les boutons qui cachent des réglages, et cadrage sur la
// feuille quand on choisit un fond « page ».
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Vérifie qu'une solution annoncée résout vraiment l'équation écrite : on
// remplace « 3x » par « (3*SOL) » et on évalue les deux membres.
// La fonction est envoyée au navigateur telle quelle (pas de chaîne échappée
// à la main : les expressions régulières n'y survivent pas).
function verifieEquation(enonce, reponse) {
    const sol = parseFloat(String(reponse).match(/-?\d+(\.\d+)?/)[0]);
    // « ➔ x = » ne se retire QU'À LA FIN : au milieu, c'est l'équation elle-même
    // (3x = -x + 28) et on la couperait en deux.
    const nettoye = String(enonce)
        .replace('Résoudre :', '')
        .replace(/➔\s*x\s*=\s*$/, '')
        .replace(/−/g, '-').trim();
    const membres = nettoye.split('=').map(m => m.trim()
        .replace(/(^|[+\-])\s*(\d*)x/g, (s, signe, n) => (signe || '+') + '(' + (n === '' ? 1 : n) + '*SOL)')
        .replace(/\s/g, ''));
    if (membres.length !== 2) return false;
    const ev = (e) => Function('SOL', 'return ' + e)(sol);
    return Math.abs(ev(membres[0]) - ev(membres[1])) < 1e-9;
}

const SRC_VERIF = verifieEquation.toString();

module.exports = async function (browser) {
    const r = creerRapport('Équations et gestes');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins.flashMathTool, { timeout: 20000 });

    // --- QUESTIONS FLASH : cinq niveaux d'équations ---
    const variantes = await page.evaluate(() =>
        PluginManager.plugins.flashMathTool.themeMeta.equations.variants.map(v => v.id));
    ['somme', 'produit', 'affine', 'deuxmembres', 'relatifs'].forEach(v =>
        r.verifie(`questions flash : le niveau « ${v} » existe`, variantes.includes(v), variantes.join(', ')));

    const flash = await page.evaluate((src) => {
        const verifie = eval('(' + src + ')');
        const t = PluginManager.plugins.flashMathTool;
        const res = {};
        ['somme', 'produit', 'affine', 'deuxmembres', 'relatifs'].forEach(v => {
            const essais = [];
            for (let i = 0; i < 60; i++) essais.push(t.generators.equations(t, 2, v));
            res[v] = {
                exemple: essais[0].q.replace('Résoudre : ', ''),
                justes: essais.every(e => verifie(e.q, e.a)),
                entieres: essais.every(e => /^x = -?\d+$/.test(e.a)),
                expliquees: essais.every(e => e.exp && e.exp.length > 20),
                deuxMembres: essais.filter(e => (e.q.match(/x/g) || []).length >= 2).length
            };
        });
        return res;
    }, SRC_VERIF);

    ['somme', 'produit', 'affine', 'deuxmembres', 'relatifs'].forEach(v => {
        r.verifie(`« ${v} » : la réponse résout l'équation`, flash[v].justes, flash[v].exemple);
        r.verifie(`« ${v} » : la solution est entière`, flash[v].entieres, flash[v].exemple);
        r.verifie(`« ${v} » : une explication accompagne`, flash[v].expliquees);
    });
    r.verifie('« deuxmembres » met bien l\'inconnue des deux côtés',
        flash.deuxmembres.deuxMembres === 60, `${flash.deuxmembres.deuxMembres}/60 — ${flash.deuxmembres.exemple}`);
    r.verifie('« relatifs » aussi', flash.relatifs.deuxMembres === 60, flash.relatifs.exemple);

    // Le niveau « deux membres » n'est proposé qu'à partir de la 4e
    const parClasse = await page.evaluate(() => {
        const t = PluginManager.plugins.flashMathTool;
        const avant = t.state.levels;
        t.state.levels = [6, 5];
        const petits = t.activeVariants('equations').map(v => v.id);
        t.state.levels = [4, 3];
        const grands = t.activeVariants('equations').map(v => v.id);
        t.state.levels = avant;
        return { petits, grands };
    });
    r.verifie('en 6e-5e, pas d\'équations à deux membres',
        !parClasse.petits.includes('deuxmembres'), parClasse.petits.join(', '));
    r.verifie('en 4e-3e, elles apparaissent',
        parClasse.grands.includes('deuxmembres'), parClasse.grands.join(', '));

    // --- GÉNÉRATEUR D'EXERCICES ---
    const gen = await page.evaluate((src) => {
        const verifie = eval('(' + src + ')');
        const t = PluginManager.plugins.globalExerciseGenerator;
        const res = {};
        ['equation_2m', 'equation_2m_neg'].forEach(type => {
            const qs = t.generateQuestions('equation', [type], null, 60);
            res[type] = {
                exemple: qs[0].q,
                justes: qs.every(q => verifie(q.q, q.a)),
                entieres: qs.every(q => /^-?\d+$/.test(q.a)),
                deuxMembres: qs.filter(q => (q.q.match(/x/g) || []).length >= 2).length
            };
        });
        return res;
    }, SRC_VERIF);

    ['equation_2m', 'equation_2m_neg'].forEach(type => {
        r.verifie(`générateur « ${type} » : les réponses sont justes`, gen[type].justes, gen[type].exemple);
        r.verifie(`générateur « ${type} » : solutions entières`, gen[type].entieres, gen[type].exemple);
        r.verifie(`générateur « ${type} » : l'inconnue des deux côtés`, gen[type].deuxMembres === 60,
            `${gen[type].deuxMembres}/60`);
    });

    // --- APPUI LONG ---
    for (const [id, titre] of [['btn-cycle', 'Fond du tableau'], ['btn-axes', 'Axes'], ['btn-classes-menu', 'Mes classes']]) {
        const marque = await page.evaluate((x) => {
            const b = document.getElementById(x);
            return b ? b.dataset.appuiLong === 'oui' && b.classList.contains('a-appui-long') : false;
        }, id);
        r.verifie(`« ${titre} » : le bouton porte son repère d'appui long`, marque, id);

        const boite = await page.evaluate((x) => {
            const b = document.getElementById(x);
            const r = b.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, id);
        await page.mouse.move(boite.x, boite.y);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
        await page.waitForTimeout(200);

        const panneau = await page.evaluate(() => {
            const p = document.getElementById('panneau-appui');
            if (!p) return null;
            const b = p.getBoundingClientRect();
            return {
                titre: p.querySelector('.rp-titre').innerText,
                choix: p.querySelectorAll('.rp-choix').length,
                dansEcran: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1
            };
        });
        r.verifie(`« ${titre} » : l'appui long ouvre son panneau`,
            !!panneau && panneau.titre.toLowerCase() === titre.toLowerCase(),   // la feuille de style met en capitales
            JSON.stringify(panneau));
        r.verifie(`« ${titre} » : le panneau tient dans l'écran`, !!panneau && panneau.dansEcran, JSON.stringify(panneau));
        r.verifie(`« ${titre} » : il propose des choix`, !!panneau && panneau.choix >= 2, JSON.stringify(panneau));

        await page.mouse.click(5, 400);
        await page.waitForTimeout(200);
    }

    // Un appui long sur « Fonds » ne doit PAS faire défiler le fond au passage
    const sansEffet = await page.evaluate(() => currentBgIndex);
    const boiteFond = await page.evaluate(() => {
        const b = document.getElementById('btn-cycle').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.move(boiteFond.x, boiteFond.y);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(250);
    r.egal('un appui long ne déclenche pas l\'action courte', await page.evaluate(() => currentBgIndex), sansEffet);
    await page.mouse.click(5, 400);
    await page.waitForTimeout(200);

    // --- CADRAGE SUR LA FEUILLE ---
    const cadrage = await page.evaluate(() => {
        panX = -3000; panY = -1500; zoom = 1.6;          // on était parti travailler ailleurs
        currentBgIndex = backgrounds.indexOf('copie');
        cadrerSurLaFeuille();
        draw();
        const cv = document.getElementById('board');
        const gauche = panX, haut = panY;
        const droite = panX + PAGE_L * zoom, bas = panY + PAGE_H * zoom;
        const largeur = droite - gauche;
        return {
            // La feuille prend la largeur du tableau, avec une marge de part
            // et d'autre : elle n'est plus rapetissée pour tenir en hauteur.
            profiteDeLaLargeur: largeur > cv.clientWidth * 0.8 && largeur < cv.clientWidth - 20,
            margeGauche: Math.round(gauche),
            margeDroite: Math.round(cv.clientWidth - droite),
            centree: Math.abs(gauche - (cv.clientWidth - largeur) / 2) < 3,
            hautVisible: haut > 20 && haut < cv.clientHeight / 2,
            uneSeuleFeuille: feuillesVisibles(-8000, 20000).length,
            zoom: Math.round(zoom * 100) / 100
        };
    });
    r.verifie('la feuille profite de la largeur du tableau', cadrage.profiteDeLaLargeur, JSON.stringify(cadrage));
    r.verifie('en laissant une vraie marge de chaque côté',
        cadrage.margeGauche > 20 && Math.abs(cadrage.margeGauche - cadrage.margeDroite) <= 1,
        JSON.stringify(cadrage));
    r.verifie('et la centre', cadrage.centree, JSON.stringify(cadrage));
    r.verifie('son en-tête reste sous la barre du haut, pas dessous', cadrage.hautVisible, JSON.stringify(cadrage));
    r.egal('le fond ne se répète pas : une feuille, une seule', cadrage.uneSeuleFeuille, 1);

    // Sur une page où l'on a déjà travaillé, la vue ne doit PAS bouger :
    // recadrer déplaçait tout le tracé sous les yeux du professeur.
    const avecDuTravail = await page.evaluate(() => {
        points.push({ id: nextId++, x: 100, y: 100, z: globalZ++ });
        freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 50, y: 60 }], color: '#000', width: 3, z: globalZ++ });
        panX = 120; panY = 90; zoom = 1.3;
        currentBgIndex = backgrounds.indexOf('seyes-marge');
        const avant = { panX, panY, zoom };
        cadrerSurLaFeuille();
        const bouge = avant.panX !== panX || avant.panY !== panY || avant.zoom !== zoom;
        const vide = pageEstVide();
        points.length = 0; freehands.length = 0;
        return { vide, bouge };
    });
    r.verifie('une page où l\'on a tracé n\'est plus considérée vide', !avecDuTravail.vide);
    r.verifie('et changer de fond n\'y déplace plus le travail', !avecDuTravail.bouge, JSON.stringify(avecDuTravail));

    // …mais la feuille doit apparaître AUTOUR du travail, pas à l'origine du
    // tableau : sinon elle surgissait à côté, voire hors de l'écran.
    const feuilleAutour = await page.evaluate(() => {
        [points, segments, freehands, texts, images].forEach(a => a.length = 0);
        origineFeuille = { x: 0, y: 0 };
        const P = (x, y) => { const p = { id: nextId++, x, y, z: globalZ++ }; points.push(p); return p; };
        const a = P(2000, 1400), b = P(2600, 1800);
        segments.push({ id: nextId++, p1_id: a.id, p2_id: b.id, z: globalZ++ });
        currentBgIndex = backgrounds.indexOf('copie');
        cadrerSurLaFeuille();
        const t = boiteDuTravail();
        const dedans = t.x >= origineFeuille.x && t.x + t.l <= origineFeuille.x + PAGE_L
                    && t.y >= origineFeuille.y && t.y + t.h <= origineFeuille.y + PAGE_H;
        const centree = Math.abs((origineFeuille.x + PAGE_L / 2) - (t.x + t.l / 2)) < 2;
        // et elle se retient d'une page à l'autre
        syncPage();
        const retenue = !!(pages[currentPageIndex].origineFeuille
            && pages[currentPageIndex].origineFeuille.x === origineFeuille.x);
        [points, segments].forEach(arr => arr.length = 0);
        origineFeuille = { x: 0, y: 0 };
        return { origine: { x: Math.round(origineFeuille.x), y: Math.round(origineFeuille.y) }, dedans, centree, retenue };
    });
    r.verifie('la feuille se pose autour de ce qui est déjà tracé', feuilleAutour.dedans, JSON.stringify(feuilleAutour));
    r.verifie('le tracé est centré en largeur sur la feuille', feuilleAutour.centree, JSON.stringify(feuilleAutour));
    r.verifie('et la page retient où sa feuille est posée', feuilleAutour.retenue, JSON.stringify(feuilleAutour));

    // Les axes vivaient à l'origine du tableau : allumés après avoir travaillé
    // ailleurs, ils naissaient de travers. Ils se posent au milieu de la vue,
    // sur un croisement du quadrillage pour que les graduations tombent juste.
    const axesCentres = await page.evaluate(async () => {
        currentBgIndex = backgrounds.indexOf('carreau');
        panX = -1400; panY = -900; zoom = 1;
        showAxes = 0;
        origineAxes = { x: 0, y: 0 };
        document.getElementById('btn-axes').click();          // 0 → 1
        await new Promise(r => setTimeout(r, 150));
        const cv = document.getElementById('board');
        const vise = { x: (cv.clientWidth / 2 - panX) / zoom, y: (cv.clientHeight / 2 - panY) / zoom };
        const pas = pasDesGraduations();
        const pose = { x: origineAxes.x, y: origineAxes.y };

        // un second clic (graduations) ne doit pas les redéplacer
        document.getElementById('btn-axes').click();          // 1 → 2
        await new Promise(r => setTimeout(r, 150));
        const stable = origineAxes.x === pose.x && origineAxes.y === pose.y;
        syncPage();
        const retenue = !!(pages[currentPageIndex].origineAxes
            && pages[currentPageIndex].origineAxes.x === pose.x);

        showAxes = 0;
        origineAxes = { x: 0, y: 0 };
        panX = 0; panY = 0; zoom = 1;
        return {
            pose, pas, stable, retenue,
            ecart: { x: Math.abs(pose.x - vise.x), y: Math.abs(pose.y - vise.y) },
            surLeQuadrillage: pose.x % pas === 0 && pose.y % pas === 0
        };
    });
    r.verifie('les axes naissent au milieu de ce que l\'on regarde',
        axesCentres.ecart.x <= axesCentres.pas / 2 && axesCentres.ecart.y <= axesCentres.pas / 2,
        JSON.stringify(axesCentres));
    r.verifie('leur origine tombe sur un croisement du quadrillage',
        axesCentres.surLeQuadrillage, JSON.stringify(axesCentres));
    r.verifie('afficher les graduations ne les redéplace pas', axesCentres.stable);
    r.verifie('et la page retient où ses axes sont posés', axesCentres.retenue);

    const surPageVide = await page.evaluate(() => {
        panX = 120; panY = 90; zoom = 1.3;
        currentBgIndex = backgrounds.indexOf('copie');
        const avant = { panX, panY, zoom };
        cadrerSurLaFeuille();
        return { vide: pageEstVide(), bouge: avant.panX !== panX || avant.zoom !== zoom };
    });
    r.verifie('sur une feuille vierge, le cadrage se fait toujours',
        surPageVide.vide && surPageVide.bouge, JSON.stringify(surPageVide));

    const pasDeCadrage = await page.evaluate(() => {
        currentBgIndex = backgrounds.indexOf('seyes');
        const avant = { panX, panY, zoom };
        cadrerSurLaFeuille();
        return avant.panX === panX && avant.panY === panY && avant.zoom === zoom;
    });
    r.verifie('un fond ordinaire ne bouge pas la vue', pasDeCadrage);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
