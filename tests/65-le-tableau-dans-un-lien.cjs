// UN TABLEAU DANS UN LIEN, ET LE RYTHME AVEC
//
// « On pourrait stocker un tableau dans une URL, dans quelle limite ? Je
// présume que c'est mort pour les images. » Puis : « on essaie, et il faut une
// temporisation aussi si on veut rejouer ».
//
// Deux choses en une, et elles se tiennent. Le lecteur avançait à cadence
// CONSTANTE : chaque étape durait le même temps, qu'elle ait été un trait vif
// ou une pause de deux minutes pendant qu'on expliquait. Rejouer une
// construction donnait un défilé régulier qui ne ressemblait à rien de ce qui
// s'était passé. Et un tableau ne savait voyager que par fichier.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — chaque étape du film retient QUAND elle a eu lieu ;
//   — le lecteur respecte les écarts réels, entre un plancher et un plafond ;
//   — un tableau sans rythme retombe sur la cadence constante, sans casser ;
//   — refaire le film depuis l'historique JETTE le rythme au lieu de l'inventer ;
//   — un tableau tient dans une adresse, son film et son rythme compris ;
//   — les tracés y sont écrits en écarts entiers, et reviennent intacts ;
//   — une image embarquée n'y tient pas, on la retire ET on le dit ;
//   — une image qui vit à une adresse, elle, voyage par sa référence ;
//   — ouvrir le lien montre le tableau, sans premier écran ni reprise ;
//   — et n'écrase pas le travail de celui qui ouvre.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le tableau dans un lien');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    const vider = () => page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        texts.length = 0; freehands.length = 0; curves.length = 0; polygons.length = 0;
        images.length = 0; arcs.length = 0;
        history.length = 0; filmPas.length = 0; filmTemps.length = 0; historyIndex = -1;
        panX = 0; panY = 0; zoom = 1; selectedItems = [];
        draw();
    });

    // ==========================================================
    // 1. CHAQUE ÉTAPE RETIENT QUAND ELLE A EU LIEU
    // ==========================================================
    await vider();
    const rythme = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(k => setTimeout(k, ms));
        points.push({ id: nextId++, x: 100, y: 100 }); saveState();
        await attendre(150);
        points.push({ id: nextId++, x: 200, y: 100 }); saveState();
        await attendre(800);
        points.push({ id: nextId++, x: 300, y: 100 }); saveState();
        return {
            etapes: history.length, instants: filmTemps.length,
            ecarts: filmTemps.slice(1).map((t, i) => t - filmTemps[i])
        };
    });
    r.egal('le film compte autant d\'instants que d\'étapes',
        { etapes: rythme.etapes, instants: rythme.instants }, { etapes: 3, instants: 3 });
    // On ne mesure pas une durée au millimètre sur une machine partagée : on
    // vérifie que les deux écarts sont bien DIFFÉRENTS et dans le bon ordre.
    r.verifie('et il retient des écarts réels, pas une cadence',
        rythme.ecarts[0] >= 120 && rythme.ecarts[0] < 500
        && rythme.ecarts[1] >= 700 && rythme.ecarts[1] < 1400,
        JSON.stringify(rythme.ecarts));

    // ==========================================================
    // 2. LE LECTEUR S'EN SERT, ENTRE DEUX BORNES
    //
    // Sans plancher, une rafale de points posés en dix millisecondes passe
    // sans qu'on voie rien — on veut MONTRER la construction, pas la faire
    // clignoter. Sans plafond, la pause pendant laquelle on répondait à un
    // élève se rejoue intégralement, et la classe regarde un tableau immobile.
    // ==========================================================
    const bornes = await page.evaluate(() => {
        // On pose des instants à la main : éprouver un plafond de deux minutes
        // et demie en attendant deux minutes et demie serait absurde.
        const t0 = Date.now();
        filmTemps.length = 0;
        filmTemps.push(t0, t0 + 5, t0 + 405, t0 + 405 + 180000);
        history.length = 0;
        for (let i = 0; i < 4; i++) history.push('{}');
        lectureVitesse = 1;
        return {
            rafale: delaiAvantLEtape(1),      // 5 ms → plancher
            normal: delaiAvantLEtape(2),      // 400 ms → tel quel
            pause: delaiAvantLEtape(3),       // 3 minutes → plafond
            constant: delaiDeLecture()
        };
    });
    r.egal('une rafale de cinq millisecondes est ralentie au plancher', bornes.rafale, 60);
    r.egal('un écart ordinaire est rendu tel quel', bornes.normal, 400);
    r.egal('et une pause de trois minutes est ramenée au plafond', bornes.pause, 2500);

    // LA VITESSE GARDE TOUT SON SENS : elle multiplie le rythme d'origine au
    // lieu de l'écraser. C'est ce qui distingue « rejouer deux fois plus vite »
    // de « rejouer à cadence fixe ».
    const vitesse = await page.evaluate(() => {
        lectureVitesse = 2;
        const double = delaiAvantLEtape(2);
        lectureVitesse = 1;
        return { double, simple: delaiAvantLEtape(2) };
    });
    r.egal('doubler la vitesse divise le rythme réel par deux',
        { double: vitesse.double, simple: vitesse.simple }, { double: 200, simple: 400 });

    // ==========================================================
    // 3. SANS RYTHME, ON RETOMBE SUR LA CADENCE — SANS CASSER
    // ==========================================================
    r.egal('un tableau sans instants repart à la cadence constante',
        await page.evaluate(() => {
            filmTemps.length = 0;
            return { avec: delaiAvantLEtape(1), attendu: delaiDeLecture() };
        }), await page.evaluate(() => ({ avec: delaiDeLecture(), attendu: delaiDeLecture() })));

    // REFAIRE LE FILM JETTE LE RYTHME, ET C'EST VOULU. L'historique dit CE QUI
    // a changé, jamais QUAND : des instants reconstruits mentiraient sur ce qui
    // s'est passé devant la classe.
    await vider();
    const refait = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(k => setTimeout(k, ms));
        points.push({ id: nextId++, x: 10, y: 10 }); saveState(); await attendre(80);
        points.push({ id: nextId++, x: 20, y: 20 }); saveState();
        const avant = filmTemps.length;
        refaireLeFilm();
        return { avant, apres: filmTemps.length, etapes: filmPas.length };
    });
    r.egal('refaire le film garde les étapes mais jette les instants',
        refait, { avant: 2, apres: 0, etapes: 2 });

    // ==========================================================
    // 4. LE TABLEAU TIENT DANS UNE ADRESSE
    // ==========================================================
    await vider();
    const fabrique = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(k => setTimeout(k, ms));
        const a = { id: nextId++, x: 100, y: 100 }, b = { id: nextId++, x: 280, y: 100 },
              c = { id: nextId++, x: 190, y: 250 };
        points.push(a, b, c);
        polygons.push({ id: nextId++, points: [a.id, b.id, c.id], color: '#e74c3c',
                        width: 3, isClosed: true, z: globalZ++ });
        saveState(); await attendre(120);
        texts.push({ id: nextId++, x: 60, y: 320, text: 'Somme des angles', content: 'Somme des angles',
                     color: '#2d3436', fontSize: 26, z: globalZ++ });
        saveState(); await attendre(300);
        // De l'écriture : c'est elle qui pèse, et c'est pour elle que les
        // tracés sont écrits en écarts entiers.
        let g = 7; const alea = () => { g = (g * 1103515245 + 12345) & 0x7fffffff; return g / 0x7fffffff; };
        for (let k = 0; k < 6; k++) {
            const pts = []; let x = 100 + alea() * 40, y = 400 + k * 14;
            for (let i = 0; i < 120; i++) {
                x += 1.6 + (alea() - 0.5) * 3.2; y += (alea() - 0.5) * 5.5;
                pts.push({ x: +x.toFixed(1), y: +y.toFixed(1), p: 0.5 });
            }
            freehands.push({ id: nextId++, points: pts, color: '#2d3436', width: 3, z: globalZ++ });
            saveState();
        }
        const avec = await fabriquerLeLien({ avecLeFilm: true });
        const sans = await fabriquerLeLien({});
        return { avec, sans, traits: freehands.length,
                 pointsDuPremier: freehands[0].points.length,
                 // On emporte le tracé d'origine : c'est à LUI qu'il faudra
                 // comparer ce qui revient du lien.
                 origine: freehands[0].points.map(q => [q.x, q.y]) };
    });

    // LA BORNE DISCRIMINE. Six traits de cent vingt points écrits en écarts
    // pèsent environ deux mille cinq cents caractères ; en coordonnées
    // absolues ils en pèsent près du double. Un seuil de trente-deux mille
    // n'aurait rien prouvé du tout.
    r.verifie('un tableau écrit à la main tient dans un lien, et tient PETIT',
        fabrique.avec.taille > 0 && fabrique.avec.taille < 4000,
        fabrique.avec.taille + ' caractères');
    // LE FILM NE COÛTE PRESQUE RIEN : il ne stocke que des différences d'étape.
    // C'est ce qui rend le replay partageable, et non seulement l'état final.
    r.verifie('et son film ne coûte qu\'une fraction de plus que l\'état seul',
        fabrique.avec.taille < fabrique.sans.taille * 1.6,
        'sans film ' + fabrique.sans.taille + ', avec film ' + fabrique.avec.taille);
    r.verifie('le lien annonce son verdict de longueur',
        /sûr partout|lien|coupé|trop long/.test(fabrique.avec.verdict), fabrique.avec.verdict);
    r.egal('et il porte bien toutes les étapes', fabrique.avec.etapes, 8);

    // ==========================================================
    // 5. ET IL REVIENT INTACT
    // ==========================================================
    const relu = await page.evaluate(async (lien) => {
        const ok = await ouvrirDepuisLeLien(lien);
        return {
            ok, points: points.length, polygones: polygons.length, textes: texts.length,
            traits: freehands.length, pointsDuPremier: (freehands[0] || {}).points?.length,
            etapes: history.length, instants: filmTemps.length,
            ecarts: filmTemps.slice(1, 3).map((t, i) => t - filmTemps[i]),
            // Les tracés sont arrondis au pixel : on vérifie que les points
            // sont des entiers, et qu'ils restent dans le tableau.
            entiers: (freehands[0] || {}).points?.every(q => Number.isInteger(q.x) && Number.isInteger(q.y)),
            revenus: (freehands[0] || {}).points?.map(q => [q.x, q.y])
        };
    }, fabrique.avec.lien);
    r.egal('le lien rend le tableau entier',
        { ok: relu.ok, points: relu.points, polygones: relu.polygones,
          textes: relu.textes, traits: relu.traits },
        { ok: true, points: 3, polygones: 1, textes: 1, traits: 6 });
    r.egal('chaque tracé retrouve tous ses points',
        relu.pointsDuPremier, fabrique.pointsDuPremier);
    r.verifie('arrondis au pixel, ce qui ne se voit pas mais divise la taille par six',
        relu.entiers === true, String(relu.entiers));

    // ET AU BON ENDROIT. Compter les points ne prouve rien : un sabotage qui
    // écrivait des coordonnées ABSOLUES là où le code attend des écarts —
    // donc un tracé qui repart en vrille dès le deuxième point — passait
    // inaperçu, puisqu'il rendait le bon NOMBRE de points, tous entiers. On
    // compare donc au tracé d'origine, à un pixel près, celui de l'arrondi.
    const ecart = (() => {
        if (!relu.revenus || relu.revenus.length !== fabrique.origine.length) return Infinity;
        let pire = 0;
        for (let i = 0; i < fabrique.origine.length; i++) {
            pire = Math.max(pire,
                Math.abs(relu.revenus[i][0] - fabrique.origine[i][0]),
                Math.abs(relu.revenus[i][1] - fabrique.origine[i][1]));
        }
        return pire;
    })();
    r.verifie('et chaque point revient là où il était, à l\'arrondi près',
        ecart <= 1, 'écart maximal ' + ecart + ' px');
    r.egal('le film revient avec ses étapes et son rythme',
        { etapes: relu.etapes, instants: relu.instants }, { etapes: 8, instants: 8 });
    r.verifie('et les écarts d\'origine sont préservés',
        relu.ecarts[0] >= 100 && relu.ecarts[0] < 600
        && relu.ecarts[1] >= 250 && relu.ecarts[1] < 900,
        JSON.stringify(relu.ecarts));

    // ==========================================================
    // 6. LES IMAGES : LA LIMITE, ET LE CONTOURNEMENT
    //
    // Mesuré : une page A4 de PDF rendue à 150 dpi pèse 417 000 caractères
    // d'URL, vingt fois le praticable. Un PNG est déjà compressé — le repasser
    // au « deflate » ne gagne qu'un tiers là où le reste gagne neuf fois.
    // ==========================================================
    await vider();
    const avecImages = await page.evaluate(async () => {
        texts.push({ id: nextId++, x: 40, y: 40, text: 'Exercice', content: 'Exercice',
                     color: '#000', fontSize: 20, z: globalZ++ });
        images.push({ id: nextId++, x: 100, y: 100, w: 100, h: 80, cx: 0, cy: 0, cw: 100, ch: 80,
                      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', z: globalZ++ });
        images.push({ id: nextId++, x: 300, y: 100, w: 100, h: 80, cx: 0, cy: 0, cw: 100, ch: 80,
                      src: 'https://exemple.test/poly.png', z: globalZ++ });
        saveState();
        const r = await fabriquerLeLien({});
        return { taille: r.taille, retirees: r.imagesRetirees, lien: r.lien };
    });
    r.egal('une image embarquée ne tient pas dans une adresse, et on le compte',
        avecImages.retirees, 1);
    const apresImages = await page.evaluate(async (lien) => {
        await ouvrirDepuisLeLien(lien);
        return { images: images.length, sources: images.map(i => i.src) };
    }, avecImages.lien);
    r.egal('mais celle qui vit à une adresse voyage par sa référence',
        apresImages, { images: 1, sources: ['https://exemple.test/poly.png'] });

    // ==========================================================
    // 7. UN LIEN ABÎMÉ NE CASSE RIEN
    // ==========================================================
    await vider();
    const abime = await page.evaluate(async () => {
        texts.push({ id: nextId++, x: 10, y: 10, text: 'avant', content: 'avant',
                     color: '#000', fontSize: 20, z: globalZ++ });
        const ok = await ouvrirDepuisLeLien('http://x/#t1=CECI_NEST_PAS_UN_TABLEAU');
        return { ok, textes: texts.length };
    });
    r.egal('un lien illisible est refusé, et le tableau reste en place',
        abime, { ok: false, textes: 1 });
    r.egal('une adresse sans tableau n\'est pas prise pour un lien',
        await page.evaluate(() => ouvrirDepuisLeLien('http://x/index.html')), false);

    // ==========================================================
    // 8. L'OUVRIR POUR DE VRAI — comme un élève depuis Pronote
    // ==========================================================
    const lienDeCours = await page.evaluate(async () => {
        points.length = 0; texts.length = 0; polygons.length = 0; images.length = 0;
        freehands.length = 0; history.length = 0; filmPas.length = 0; filmTemps.length = 0;
        historyIndex = -1;
        const a = { id: nextId++, x: 100, y: 100 }, b = { id: nextId++, x: 280, y: 100 };
        points.push(a, b);
        segments.push({ id: nextId++, p1_id: a.id, p2_id: b.id, color: '#e74c3c', width: 3, z: globalZ++ });
        saveState();
        texts.push({ id: nextId++, x: 60, y: 200, text: 'Le segment [AB]', content: 'Le segment [AB]',
                     color: '#2d3436', fontSize: 26, z: globalZ++ });
        saveState();
        return (await fabriquerLeLien({ avecLeFilm: true })).lien;
    });

    const eleve = await context.newPage();
    const erreursEleve = [];
    eleve.on('pageerror', e => erreursEleve.push(e.message.slice(0, 160)));
    await eleve.goto(lienDeCours);
    await eleve.waitForFunction(() => window.PluginManager
        && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await eleve.waitForTimeout(1200);
    const vuParLEleve = await eleve.evaluate(() => ({
        points: points.length, segments: segments.length, textes: texts.length,
        etapes: history.length,
        // TROIS PORTES DEVANT CE QU'ON EST VENU VOIR, CE SERAIT TROIS DE TROP :
        // ni reprise de la séance d'hier, ni premier écran.
        premierEcran: (() => { const e = document.getElementById('premier-ecran');
            return e ? getComputedStyle(e).display !== 'none' : false; })(),
        reprise: (() => { const e = document.getElementById('restore-modal');
            return e ? getComputedStyle(e).display !== 'none' : false; })()
    }));
    r.egal('ouvrir le lien montre le tableau, et rien d\'autre',
        vuParLEleve, { points: 2, segments: 1, textes: 1, etapes: 2,
                       premierEcran: false, reprise: false });
    r.verifie('et aucune erreur chez celui qui reçoit', erreursEleve.length === 0,
        erreursEleve.join(' | '));

    // ==========================================================
    // 9. ET ON N'ÉCRASE PAS LE TRAVAIL DE CELUI QUI OUVRE
    //
    // Un enseignant qui colle un lien dans l'onglet où il préparait son cours
    // perdrait sa préparation. Le tableau partagé arrive sur une PAGE NEUVE dès
    // qu'il y a déjà quelque chose.
    // ==========================================================
    const garde = await eleve.evaluate(async () => {
        // On se remet dans l'état de quelqu'un qui travaille.
        initPages();
        texts.push({ id: nextId++, x: 30, y: 30, text: 'ma préparation', content: 'ma préparation',
                     color: '#000', fontSize: 20, z: globalZ++ });
        saveState();
        const pagesAvant = pages.length;
        await ouvrirLeLienDuDemarrage();
        return {
            pagesAvant, pagesApres: pages.length, ou: currentPageIndex,
            surLaPageNeuve: texts.map(t => t.text || t.content),
            surLaPremiere: (pages[0].texts || []).map(t => t.text || t.content)
        };
    });
    r.egal('le tableau reçu ouvre une page de plus, et la préparation reste sur la sienne',
        garde, { pagesAvant: 1, pagesApres: 2, ou: 1,
                 surLaPageNeuve: ['Le segment [AB]'], surLaPremiere: ['ma préparation'] });

    await eleve.close();
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
