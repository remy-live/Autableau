// Deux demandes d'enseignants : un fond de cahier avec marge rouge (et un fond
// « copie d'examen »), et des icônes qu'on reconnaît sans les survoler.
// Les libellés sont un essai derrière une adresse : par défaut, rien ne bouge.
const { creerRapport, ouvrirApp, APP_URL, CHROMIUM } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Fonds et libellés');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // --- LES FONDS ---
    const fonds = await page.evaluate(() => backgrounds.slice());
    r.verifie('le fond « Seyès avec marge » existe', fonds.includes('seyes-marge'), fonds.join(', '));
    r.verifie('le fond « copie d\'examen » existe', fonds.includes('copie'), fonds.join(', '));

    // On compte l'encre rouge : la marge doit être là, et seulement sur ces fonds
    const encreRouge = async (nomFond) => page.evaluate((nom) => {
        currentBgIndex = backgrounds.indexOf(nom);
        zoom = 1; panX = 200; panY = 200;
        [texts, freehands, images].forEach(a => a.length = 0);
        draw();
        const cv = document.getElementById('board');
        const d = cv.getContext('2d').getImageData(0, 0, Math.min(1000, cv.width), Math.min(600, cv.height)).data;
        let rouge = 0;
        for (let i = 0; i < d.length; i += 4) {
            // le rouge de la marge est translucide : il vire au rose sur blanc,
            // on le reconnaît à l'écart entre le rouge et les deux autres canaux
            if (d[i] > 170 && d[i] - d[i + 1] > 60 && d[i] - d[i + 2] > 60 && d[i + 3] > 60) rouge++;
        }
        return rouge;
    }, nomFond);

    const rougeSeyes = await encreRouge('seyes');
    const rougeMarge = await encreRouge('seyes-marge');
    const rougeCopie = await encreRouge('copie');
    r.verifie('Seyès simple : pas de marge rouge', rougeSeyes === 0, `${rougeSeyes} pixels rouges`);
    r.verifie('Seyès avec marge : la marge est tracée', rougeMarge > 200, `${rougeMarge} pixels rouges`);
    r.verifie('copie d\'examen : la marge est tracée', rougeCopie > 200, `${rougeCopie} pixels rouges`);

    // La copie doit porter son en-tête : on compare la même vue avec et sans.
    // Le cadre et les intitulés font une encre grise que le cahier n'a pas.
    const encreEnTete = (nom) => page.evaluate((n) => {
        currentBgIndex = backgrounds.indexOf(n);
        zoom = 0.5; panX = 300; panY = 40;
        draw();
        const cv = document.getElementById('board');
        const d = cv.getContext('2d').getImageData(300, 40, 800, 160).data;   // le haut de la feuille
        let encre = 0, blanc = 0, gris = 0;
        for (let i = 0; i < d.length; i += 4) {
            const [x, y, z] = [d[i], d[i + 1], d[i + 2]];
            const neutre = Math.abs(x - y) < 14 && Math.abs(y - z) < 14;
            if (neutre && x > 90 && x < 205) encre++;          // cadre et intitulés
            if (x > 248 && y > 248 && z > 248) blanc++;         // la feuille
        }
        // le fond autour de la feuille, mesuré à gauche
        const g = cv.getContext('2d').getImageData(20, 300, 200, 200).data;
        for (let i = 0; i < g.length; i += 4) {
            if (g[i] > 215 && g[i] < 245 && Math.abs(g[i] - g[i + 2]) < 12) gris++;
        }
        return { encre, blanc, gris };
    }, nom);

    const enTeteCopie = await encreEnTete('copie');
    const enTeteCahier = await encreEnTete('seyes-marge');
    r.verifie('la copie porte un en-tête que le cahier n\'a pas',
        enTeteCopie.encre > enTeteCahier.encre + 400,
        `copie ${enTeteCopie.encre}, cahier ${enTeteCahier.encre}`);
    r.verifie('la copie est une feuille blanche', enTeteCopie.blanc > 30000, `${enTeteCopie.blanc} pixels blancs`);
    r.verifie('avec du gris clair tout autour', enTeteCopie.gris > 20000, `${enTeteCopie.gris} pixels gris`);
    r.verifie('le cahier aussi est posé sur du gris', enTeteCahier.gris > 20000, `${enTeteCahier.gris} pixels gris`);

    // Le pas de la grille suit, sinon l'aimant et l'interligne tomberaient à côté
    const pas = await page.evaluate(() => {
        const mesures = {};
        ['seyes', 'seyes-marge', 'copie'].forEach(nom => {
            currentBgIndex = backgrounds.indexOf(nom);
            mesures[nom] = snapToGrid(97, 97);
        });
        return mesures;
    });
    r.egal('« Seyès avec marge » s\'aimante comme le Seyès', pas['seyes-marge'], pas['seyes']);
    r.egal('« copie » s\'aimante comme le Seyès', pas['copie'], pas['seyes']);

    // Le bouton « Fonds » parcourt bien les huit fonds sans casser
    const tour = await page.evaluate(() => {
        const vus = [];
        for (let i = 0; i < backgrounds.length; i++) {
            document.getElementById('btn-cycle').click();
            vus.push(backgrounds[currentBgIndex]);
        }
        return vus;
    });
    r.egal('le bouton « Fonds » fait le tour complet', tour.length, fonds.length);

    r.verifie('aucune erreur JS sur les fonds', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // --- LES LIBELLÉS, DERRIÈRE L'ADRESSE ---
    const mesurerGrille = async (suffixe) => {
        const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
        const p = await ctx.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
        await p.goto(APP_URL + suffixe);
        await p.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
        await p.evaluate(() => {
            const d = document.getElementById('bar-plugins');
            if (d) d.classList.add('open');
            const onglet = Array.from(document.querySelectorAll('.btn'))
                .find(b => (b.getAttribute('data-tooltip') || b.title || '') === 'Maths - Numérique');
            if (onglet) onglet.click();
        });
        await p.waitForTimeout(500);
        const m = await p.evaluate(() => {
            const g = document.getElementById('plugins-grid');
            const r = g.getBoundingClientRect();
            const visibles = Array.from(g.querySelectorAll('.btn')).filter(b => b.offsetParent);
            const premier = visibles[0];
            const apres = premier ? getComputedStyle(premier, '::after') : null;
            return {
                classe: document.body.classList.contains('libelles-outils'),
                couleur: document.body.classList.contains('libelles-couleur'),
                largeurBouton: premier ? Math.round(premier.getBoundingClientRect().width) : 0,
                hauteurBouton: premier ? Math.round(premier.getBoundingClientRect().height) : 0,
                libelle: apres ? apres.content : '',
                fondBouton: premier ? getComputedStyle(premier).backgroundColor : '',
                debordeBas: r.bottom > window.innerHeight,
                debordeDroite: r.right > window.innerWidth + 2,
                visibles: visibles.length
            };
        });
        await ctx.close();
        return { m, errs };
    };

    const parDefaut = await mesurerGrille('');
    r.verifie('sans paramètre : aucun libellé', !parDefaut.m.classe && parDefaut.m.largeurBouton <= 44,
        JSON.stringify(parDefaut.m));
    r.verifie('sans paramètre : le bouton garde sa taille', parDefaut.m.hauteurBouton <= 44, `${parDefaut.m.hauteurBouton} px`);

    const avecLibelles = await mesurerGrille('?libelles');
    r.verifie('« ?libelles » : le nom apparaît sous l\'icône',
        avecLibelles.m.classe && /Fraction|Matériel|Tableau|Axe/.test(avecLibelles.m.libelle || ''),
        JSON.stringify(avecLibelles.m.libelle));
    r.verifie('« ?libelles » : le bouton s\'agrandit juste ce qu\'il faut',
        avecLibelles.m.hauteurBouton > 44 && avecLibelles.m.hauteurBouton <= 56,
        `${avecLibelles.m.hauteurBouton} px`);
    r.verifie('« ?libelles » : les noms trop longs sont raccourcis',
        !/Proportionnalité|Générateur de|Jeu d/.test(avecLibelles.m.libelle || '') , avecLibelles.m.libelle);
    r.verifie('« ?libelles » : rien ne déborde de l\'écran',
        !avecLibelles.m.debordeBas && !avecLibelles.m.debordeDroite, JSON.stringify(avecLibelles.m));
    r.verifie('« ?libelles » : tous les outils restent affichés', avecLibelles.m.visibles === parDefaut.m.visibles,
        `${avecLibelles.m.visibles} contre ${parDefaut.m.visibles}`);
    r.verifie('« ?libelles » : sans teinte de rubrique', !avecLibelles.m.couleur);

    const avecCouleur = await mesurerGrille('?libelles=couleur');
    r.verifie('« ?libelles=couleur » : la rubrique se voit à la teinte',
        avecCouleur.m.couleur && avecCouleur.m.fondBouton !== parDefaut.m.fondBouton,
        `${avecCouleur.m.fondBouton} contre ${parDefaut.m.fondBouton}`);

    // La pastille « Libellés » : trois états, et le réglage se retient
    const ctxP = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const pageP = await ctxP.newPage();
    const errsP = [];
    pageP.on('pageerror', e => errsP.push(e.message.slice(0, 120)));
    await pageP.goto(APP_URL);
    await pageP.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await pageP.keyboard.press('Escape');
    await pageP.waitForTimeout(400);

    const etat = () => pageP.evaluate(() => ({
        actif: document.body.classList.contains('libelles-outils'),
        couleur: document.body.classList.contains('libelles-couleur'),
        memoire: localStorage.getItem('board_libelles'),
        pastille: document.getElementById('btn-libelles').classList.contains('active')
    }));
    const cliquer = async () => {
        await pageP.evaluate(() => document.getElementById('btn-libelles').click());
        await pageP.waitForTimeout(250);
    };

    const depart = await etat();
    r.verifie('au démarrage, pas de libellés', !depart.actif && !depart.pastille, JSON.stringify(depart));
    await cliquer();
    const un = await etat();
    r.verifie('un clic : les noms apparaissent', un.actif && !un.couleur && un.pastille, JSON.stringify(un));
    await cliquer();
    const deux = await etat();
    r.verifie('deux clics : les couleurs de rubrique aussi', deux.actif && deux.couleur, JSON.stringify(deux));
    await cliquer();
    const trois = await etat();
    r.verifie('trois clics : retour à l\'affichage d\'origine', !trois.actif && !trois.couleur, JSON.stringify(trois));

    await cliquer();
    await pageP.reload();
    await pageP.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await pageP.waitForTimeout(600);
    const apresRechargement = await etat();
    r.verifie('le réglage survit au rechargement', apresRechargement.actif, JSON.stringify(apresRechargement));

    // Un bloc de deux ou trois rangées, pas une bande d'un bout à l'autre
    const bloc = await pageP.evaluate(() => {
        const d = document.getElementById('bar-plugins'); if (d) d.classList.add('open');
        const o = Array.from(document.querySelectorAll('.btn')).find(x => (x.getAttribute('data-tooltip') || '') === 'Maths - Numérique');
        if (o) o.click();
        const r = document.getElementById('plugins-grid').getBoundingClientRect();
        return { largeur: Math.round(r.width), hauteur: Math.round(r.height), ecran: window.innerWidth };
    });
    await pageP.waitForTimeout(300);
    r.verifie('la grille reste un bloc compact', bloc.largeur <= 780 && bloc.largeur < bloc.ecran * 0.7,
        `${bloc.largeur} px de large pour un écran de ${bloc.ecran}`);
    r.verifie('deux ou trois rangées', bloc.hauteur >= 90 && bloc.hauteur <= 200, `${bloc.hauteur} px de haut`);
    await ctxP.close();

    const toutesErreurs = [...parDefaut.errs, ...avecLibelles.errs, ...avecCouleur.errs, ...errsP];
    r.verifie('aucune erreur JS sur les libellés', toutesErreurs.length === 0, toutesErreurs.slice(0, 3).join(' | '));

    return r.bilan();
};
