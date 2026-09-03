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
    // La marge rouge appartient au cahier : une copie d'examen n'en a pas.
    r.verifie('copie d\'examen : pas de marge rouge', rougeCopie === 0, `${rougeCopie} pixels rouges`);

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
        ['seyes', 'seyes-marge', 'copie', 'carreau'].forEach(nom => {
            currentBgIndex = backgrounds.indexOf(nom);
            mesures[nom] = snapToGrid(97, 97);
        });
        return mesures;
    });
    r.egal('« Seyès avec marge » s\'aimante comme le Seyès', pas['seyes-marge'], pas['seyes']);
    // La copie est quadrillée : elle s'aimante sur ses carreaux
    r.egal('« copie » s\'aimante sur ses carreaux', pas['copie'], pas['carreau']);

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
    await pageP.evaluate(() => {
        const d = document.getElementById('bar-plugins'); if (d) d.classList.add('open');
        const o = Array.from(document.querySelectorAll('.btn')).find(x => (x.getAttribute('data-tooltip') || '') === 'Maths - Numérique');
        if (o) o.click();
    });
    await pageP.waitForTimeout(600);   // la répartition se recalcule à la frame suivante
    const bloc = await pageP.evaluate(() => {
        const r = document.getElementById('plugins-grid').getBoundingClientRect();
        return { largeur: Math.round(r.width), hauteur: Math.round(r.height), ecran: window.innerWidth };
    });
    r.verifie('la grille reste un bloc compact', bloc.largeur <= 780 && bloc.largeur < bloc.ecran * 0.7,
        `${bloc.largeur} px de large pour un écran de ${bloc.ecran}`);
    r.verifie('deux ou trois rangées', bloc.hauteur >= 90 && bloc.hauteur <= 220, `${bloc.hauteur} px de haut`);

    // --- LA BARRE DU BAS : DES ICÔNES, DES PASTILLES, DES TÉMOINS ---
    const barre = await pageP.evaluate(() => ({
        zoom: (document.getElementById('zoom-valeur') || {}).innerText,
        grille: (document.getElementById('grille-valeur') || {}).innerText,
        zoomDessine: !!document.querySelector('#btn-zoom-toggle svg'),
        grilleDessine: !!document.querySelector('#btn-grid-toggle svg'),
        rangerEnIcone: !!document.querySelector('#btn-ranger svg'),
        tableauxEnIcone: !!document.querySelector('#btn-tableaux svg'),
        pastillesRestantes: Array.from(document.querySelectorAll('#categories-bottom .category-pill'))
            .map(b => b.id),
        temoins: document.querySelectorAll('#categories-bottom .temoin').length
    }));
    r.verifie('le zoom garde son dessin et porte sa valeur',
        barre.zoomDessine && barre.zoom === '100%', JSON.stringify(barre));
    r.verifie('le quadrillage aussi', barre.grilleDessine && barre.grille === '1,0', JSON.stringify(barre));
    r.verifie('« Ranger l\'espace » et « Mes tableaux » sont montés en icônes',
        barre.rangerEnIcone && barre.tableauxEnIcone, JSON.stringify(barre));
    r.egal('il ne reste en bas que les trois interrupteurs',
        barre.pastillesRestantes, ['btn-focus', 'btn-libelles', 'btn-nuit']);
    r.egal('chacun porte son témoin', barre.temoins, 3);

    const vivant = await pageP.evaluate(() => {
        const curseur = document.getElementById('zoom-slider');
        // La course du curseur est logarithmique : il porte un cran, pas un
        // grossissement. On demande donc le cran qui vaut 140 %.
        curseur.value = String(positionDuCurseur(1.4));
        curseur.dispatchEvent(new Event('input', { bubbles: true }));
        const g = document.getElementById('grid-weight-slider');
        g.value = '2.5';
        g.dispatchEvent(new Event('input', { bubbles: true }));
        return {
            zoom: document.getElementById('zoom-valeur').innerText,
            grille: document.getElementById('grille-valeur').innerText
        };
    });
    r.egal('la pastille du zoom suit le curseur', vivant.zoom, '140%');

    // --- LE ZOOM VA PLUS LOIN, ET IL Y GLISSE ---
    // De 1 à 40 en ligne droite, les trois quarts de la course du curseur
    // seraient au-delà de 1000 % : elle est donc logarithmique, un même
    // déplacement multipliant toujours par le même facteur.
    const course = await pageP.evaluate(() => ({
        min: Math.round(zoomDuCurseur(0) * 100) / 100,
        max: Math.round(zoomDuCurseur(1000)),
        milieu: Math.round(zoomDuCurseur(500) * 100) / 100,
        cranDe1: positionDuCurseur(1),
        // Deux déplacements égaux doivent multiplier par le même facteur
        facteurBas: Math.round((zoomDuCurseur(300) / zoomDuCurseur(200)) * 1000) / 1000,
        facteurHaut: Math.round((zoomDuCurseur(900) / zoomDuCurseur(800)) * 1000) / 1000,
        allerRetour: Math.round(zoomDuCurseur(positionDuCurseur(3.7)) * 10) / 10
    }));
    r.egal('le zoom descend à 20 %', course.min, 0.2);
    r.egal('et monte à 4000 %', course.max, 40);
    r.egal('un même déplacement multiplie toujours par le même facteur',
        course.facteurBas, course.facteurHaut);
    r.egal('le curseur retrouve le zoom qu\'on lui donne', course.allerRetour, 3.7);
    r.verifie('l\'échelle 1 tombe dans la première moitié de la course',
        course.cranDe1 > 200 && course.cranDe1 < 400, String(course.cranDe1));

    // Une course de 20 % à 4000 % sur cent cinquante pixels rendait le réglage
    // fin impossible : un millimètre de doigt sautait des centaines de pour cent.
    const largeurCurseur = await pageP.evaluate(() => {
        const c = document.getElementById('zoom-slider');
        const popup = document.getElementById('popup-zoom');
        const avant = popup.style.display;
        popup.style.display = 'flex';
        const r = c.getBoundingClientRect();
        const pouce = getComputedStyle(c).height;
        popup.style.display = avant;
        return { largeur: Math.round(r.width), hauteur: pouce,
                 parCran: Math.round((40 - 0.2) / 1000 * 1000) / 1000 };
    });
    r.verifie('le curseur du zoom est assez long pour se régler au doigt',
        largeurCurseur.largeur >= 240, JSON.stringify(largeurCurseur));

    // Le zoom ne saute plus : il glisse vers la valeur visée, en gardant sous
    // le pointeur le point du tableau qu'on y avait.
    const glisse = await pageP.evaluate(async () => {
        zoom = 1; panX = 400; panY = 300;
        const ecranX = 700, ecranY = 500;
        const vise = 4;
        const logX = (ecranX - panX) / zoom, logY = (ecranY - panY) / zoom;
        viserLeZoom(vise, ecranX, ecranY);
        // Quelques images plus tard : le zoom est en chemin, pas arrivé.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const justeApres = zoom;
        await new Promise(r => setTimeout(r, 900));    // le temps d'y glisser
        return {
            justeApres: Math.round(justeApres * 1000) / 1000,
            arrive: Math.round(zoom * 1000) / 1000,
            // le point visé est-il resté sous le pointeur ?
            ecartX: Math.round(Math.abs(panX + logX * zoom - ecranX)),
            ecartY: Math.round(Math.abs(panY + logY * zoom - ecranY)),
            curseur: Number(document.getElementById('zoom-slider').value),
            attendu: positionDuCurseur(4)
        };
    });
    r.verifie('le zoom ne saute pas d\'un coup à la valeur visée',
        glisse.justeApres > 1 && glisse.justeApres < 4, JSON.stringify(glisse));
    r.egal('mais il y arrive', glisse.arrive, 4);
    r.verifie('et le point visé reste sous le pointeur',
        glisse.ecartX <= 1 && glisse.ecartY <= 1, JSON.stringify(glisse));
    r.egal('le curseur suit le mouvement', glisse.curseur, glisse.attendu);

    await pageP.evaluate(() => { zoom = 1; panX = 0; panY = 0; majCurseurZoom(); draw(); });
    r.egal('celle du quadrillage aussi, à la française', vivant.grille, '2,5');

    const interrupteurs = await pageP.evaluate(() => {
        const lu = (id) => document.getElementById(id).classList.contains('allume');
        const avant = { focus: lu('btn-focus'), nuit: lu('btn-nuit') };
        document.getElementById('btn-focus').click();
        document.getElementById('btn-nuit').click();
        const apres = { focus: lu('btn-focus'), nuit: lu('btn-nuit') };
        document.getElementById('btn-focus').click();
        document.getElementById('btn-nuit').click();
        return { avant, apres, eteints: !lu('btn-focus') && !lu('btn-nuit') };
    });
    r.verifie('au départ les témoins sont éteints',
        !interrupteurs.avant.focus && !interrupteurs.avant.nuit, JSON.stringify(interrupteurs));
    r.verifie('Focus et Mode Nuit s\'allument quand on les enclenche',
        interrupteurs.apres.focus && interrupteurs.apres.nuit, JSON.stringify(interrupteurs));
    r.verifie('et s\'éteignent quand on les relâche', interrupteurs.eteints, JSON.stringify(interrupteurs));

    await ctxP.close();

    const toutesErreurs = [...parDefaut.errs, ...avecLibelles.errs, ...avecCouleur.errs, ...errsP];
    r.verifie('aucune erreur JS sur les libellés', toutesErreurs.length === 0, toutesErreurs.slice(0, 3).join(' | '));

    return r.bilan();
};
