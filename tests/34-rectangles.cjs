// LE RECTANGLE SE REPREND À LA SOURIS.
//
// « Il faut pouvoir modifier les figures dessinées (rectangle) en taille et
// autre pour les rectangles ; pas la peine de mettre une croix pour le premier
// point. »
//
// Un rectangle est fait de DEUX POINTS, et ces deux points ne se montrent plus
// depuis qu'on a retiré les croix de ses coins. La figure n'offrait donc plus
// aucune prise : pour l'agrandir, il fallait deviner où étaient ses coins
// invisibles et espérer tomber dessus. Sélectionné, il montre maintenant les
// huit poignées d'une boîte, comme une image.
//
// CE QUE CETTE SUITE TIENT :
//
//   — un rectangle sélectionné seul offre ses huit poignées, et elles se
//     désignent bien là où elles se dessinent ;
//   — tirer une poignée change la taille de la figure, du bon côté : le côté
//     opposé ne bouge pas ;
//   — un rectangle verrouillé ne se déforme pas, et un coin qui est un point
//     d'intersection non plus ;
//   — le rectangle ne descend pas sous une taille où l'on ne pourrait plus le
//     rattraper ;
//   — la croix du premier coin ne paraît pas entre les deux clics, mais un
//     point qui sert AUSSI ailleurs se montre toujours.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Rectangles');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });

    // Un rectangle posé à la main, aux coordonnées du tableau, et sélectionné.
    const poser = (x1, y1, x2, y2) => page.evaluate(([x1, y1, x2, y2]) => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        curves.length = 0; polygons.length = 0; texts.length = 0; images.length = 0;
        panX = 100; panY = 100; zoom = 1;
        const a = { id: nextId++, x: x1, y: y1, z: globalZ++ };
        const b = { id: nextId++, x: x2, y: y2, z: globalZ++ };
        points.push(a, b);
        const rect = { id: nextId++, p1_id: a.id, p2_id: b.id, color: '#000', width: 3, z: globalZ++ };
        rectangles.push(rect);
        setMode('pointer');
        selectedItems = [{ type: 'rectangle', id: rect.id }];
        draw();
        return { rect: rect.id, p1: a.id, p2: b.id };
    }, [x1, y1, x2, y2]);

    const boite = () => page.evaluate(() => {
        const rect = rectangles[0];
        const p1 = getObjectById('point', rect.p1_id), p2 = getObjectById('point', rect.p2_id);
        return {
            x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
            w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y)
        };
    });

    // ---------------------------------------------------------------
    // 1. Les huit poignées existent, et se désignent
    // ---------------------------------------------------------------
    await poser(100, 100, 300, 200);

    const noms = await page.evaluate(() => {
        const rect = rectangles[0];
        const b = boiteDuRectangle(rect);
        const hx = [b.x, b.x + b.w / 2, b.x + b.w, b.x + b.w, b.x + b.w, b.x + b.w / 2, b.x, b.x];
        const hy = [b.y, b.y, b.y, b.y + b.h / 2, b.y + b.h, b.y + b.h, b.y + b.h, b.y + b.h / 2];
        return hx.map((x, i) => getHandleAt(x, hy[i], rect, 'rectangle'));
    });
    r.egal('les huit poignées se désignent là où elles se dessinent',
        noms, ['TL', 'T', 'TR', 'R', 'BR', 'B', 'BL', 'L']);

    const auMilieu = await page.evaluate(() => {
        const rect = rectangles[0];
        const b = boiteDuRectangle(rect);
        return getHandleAt(b.x + b.w / 2, b.y + b.h / 2, rect, 'rectangle');
    });
    r.verifie('le centre du rectangle n\'est pas une poignée', auMilieu === null, String(auMilieu));

    // Une figure à deux points n'a pas d'angle : pas de poignée de rotation.
    const rotation = await page.evaluate(() => {
        const rect = rectangles[0];
        const b = boiteDuRectangle(rect);
        return getHandleAt(b.x + b.w / 2, b.y - 30, rect, 'rectangle');
    });
    r.verifie('un rectangle n\'a pas de poignée de rotation', rotation === null, String(rotation));

    // Et le repérage général les fait passer AVANT les points cachés des coins.
    const parLeReperage = await page.evaluate(() => {
        const b = boiteDuRectangle(rectangles[0]);
        return findObjectAt(b.x, b.y);
    });
    r.verifie('le coin sélectionné répond « poignée » et non « point »',
        parLeReperage && parLeReperage.type === 'handle' && parLeReperage.name === 'TL',
        JSON.stringify(parLeReperage));

    // ET ELLES SE DESSINENT VRAIMENT. Au milieu du côté du haut, il y a le
    // trait noir de la figure ; la poignée, blanche, s'y pose par-dessus. La
    // couleur lue à cet endroit dit donc si elle a été peinte.
    const auTraitDuHaut = () => page.evaluate(() => {
        draw();
        const b = boiteDuRectangle(rectangles[0]);
        const sx = Math.round(panX + (b.x + b.w / 2) * zoom);
        const sy = Math.round(panY + b.y * zoom);
        const d = ctx.getImageData(sx, sy, 1, 1).data;
        return Math.min(d[0], d[1], d[2]);
    });
    const avecPoignee = await auTraitDuHaut();
    r.verifie('la poignée du haut est peinte sur le trait de la figure',
        avecPoignee > 200, 'clarté ' + avecPoignee);

    const sansPoignee = await page.evaluate(async () => {
        selectedItems = [];
        return null;
    }).then(auTraitDuHaut);
    r.verifie('sans sélection, le trait du haut reste le trait de la figure',
        sansPoignee < 120, 'clarté ' + sansPoignee);
    await page.evaluate(() => { selectedItems = [{ type: 'rectangle', id: rectangles[0].id }]; draw(); });

    // Non sélectionné, il n'a pas de poignées : elles ne se dessinent pas.
    const sansSelection = await page.evaluate(() => {
        selectedItems = [];
        const b = boiteDuRectangle(rectangles[0]);
        const trouve = findObjectAt(b.x, b.y);
        selectedItems = [{ type: 'rectangle', id: rectangles[0].id }];
        return trouve && trouve.type;
    });
    r.verifie('sans sélection, le coin ne répond pas « poignée »', sansSelection !== 'handle', String(sansSelection));

    // ---------------------------------------------------------------
    // 2. Tirer une poignée change la taille — et le côté opposé tient
    // ---------------------------------------------------------------
    await poser(100, 100, 300, 200);
    await page.evaluate(() => etirerLeRectangle(rectangles[0], 'BR', { x: 400, y: 260 }));
    r.egal('la poignée bas-droite étire vers le bas et la droite',
        await boite(), { x: 100, y: 100, w: 300, h: 160 });

    await poser(100, 100, 300, 200);
    await page.evaluate(() => etirerLeRectangle(rectangles[0], 'TL', { x: 60, y: 40 }));
    r.egal('la poignée haut-gauche déplace le coin haut-gauche seul',
        await boite(), { x: 60, y: 40, w: 240, h: 160 });

    await poser(100, 100, 300, 200);
    await page.evaluate(() => etirerLeRectangle(rectangles[0], 'R', { x: 500, y: 999 }));
    r.egal('la poignée droite ne touche pas la hauteur',
        await boite(), { x: 100, y: 100, w: 400, h: 100 });

    await poser(100, 100, 300, 200);
    await page.evaluate(() => etirerLeRectangle(rectangles[0], 'T', { x: 999, y: 20 }));
    r.egal('la poignée du haut ne touche pas la largeur',
        await boite(), { x: 100, y: 20, w: 200, h: 180 });

    // Le rectangle posé « à l'envers » — le second point en haut à gauche —
    // s'étire pareillement : c'est le cas de tous ceux tracés de bas en haut.
    await poser(300, 200, 100, 100);
    await page.evaluate(() => etirerLeRectangle(rectangles[0], 'BR', { x: 400, y: 260 }));
    r.egal('un rectangle tracé à l\'envers s\'étire comme les autres',
        await boite(), { x: 100, y: 100, w: 300, h: 160 });

    // ET CHAQUE POINT RESTE DE SON CÔTÉ. Le premier point de ce rectangle-là
    // tient le coin bas-droit ; s'il sautait à l'autre bout, tout ce qui s'y
    // accroche — un segment, un cercle — sauterait avec lui, sans qu'on ait
    // touché à autre chose que la taille de la figure.
    const cotes = await page.evaluate(() => {
        const rect = rectangles[0];
        const p1 = getObjectById('point', rect.p1_id), p2 = getObjectById('point', rect.p2_id);
        return { p1: [p1.x, p1.y], p2: [p2.x, p2.y] };
    });
    r.egal('le premier point garde le coin qu\'il tenait', cotes, { p1: [400, 260], p2: [100, 100] });

    // ---------------------------------------------------------------
    // 3. Ce qui ne doit pas céder
    // ---------------------------------------------------------------
    await poser(100, 100, 300, 200);
    const ecrase = await page.evaluate(() => etirerLeRectangle(rectangles[0], 'R', { x: 0, y: 0 }));
    const apresEcrasement = await boite();
    r.verifie('le rectangle garde un côté saisissable',
        ecrase === true && apresEcrasement.w >= 8 && apresEcrasement.x === 100,
        JSON.stringify(apresEcrasement));

    await poser(100, 100, 300, 200);
    const verrouille = await page.evaluate(() => {
        rectangles[0].locked = true;
        const pris = etirerLeRectangle(rectangles[0], 'BR', { x: 900, y: 900 });
        const poignee = getHandleAt(300, 200, rectangles[0], 'rectangle');
        return { pris, poignee };
    });
    r.verifie('un rectangle verrouillé ne se déforme pas et n\'offre pas de poignée',
        verrouille.pris === false && verrouille.poignee === null, JSON.stringify(verrouille));
    r.egal('et il garde sa taille', await boite(), { x: 100, y: 100, w: 200, h: 100 });

    await poser(100, 100, 300, 200);
    const dependant = await page.evaluate(() => {
        getObjectById('point', rectangles[0].p2_id).depend = true;
        return etirerLeRectangle(rectangles[0], 'BR', { x: 900, y: 900 });
    });
    r.verifie('un coin qui est un point d\'intersection ne se tire pas', dependant === false, String(dependant));
    r.egal('et le rectangle ne bouge pas', await boite(), { x: 100, y: 100, w: 200, h: 100 });

    // ---------------------------------------------------------------
    // 4. Le geste complet, à la souris
    // ---------------------------------------------------------------
    await poser(100, 100, 300, 200);
    const ecran = await page.evaluate(() => {
        const b = boiteDuRectangle(rectangles[0]);
        return { x: panX + (b.x + b.w) * zoom, y: panY + (b.y + b.h) * zoom };
    });
    await page.mouse.move(ecran.x, ecran.y);
    await page.mouse.down();
    await page.mouse.move(ecran.x + 80, ecran.y + 40, { steps: 6 });
    await page.mouse.up();
    const tiree = await boite();
    r.verifie('tirer la poignée à la souris agrandit la figure',
        Math.abs(tiree.w - 280) < 3 && Math.abs(tiree.h - 140) < 3 && tiree.x === 100 && tiree.y === 100,
        JSON.stringify(tiree));

    const enregistre = await page.evaluate(() => {
        const dernier = JSON.parse(history[historyIndex]);
        const rect = dernier.rectangles[0];
        const p1 = dernier.points.find(p => p.id === rect.p1_id);
        const p2 = dernier.points.find(p => p.id === rect.p2_id);
        return Math.abs(Math.abs(p2.x - p1.x) - 280) < 3;
    });
    r.verifie('la nouvelle taille entre dans l\'historique', enregistre, String(enregistre));

    // ---------------------------------------------------------------
    // 5. Pas de croix au premier coin, entre les deux clics
    // ---------------------------------------------------------------
    const premierCoin = await page.evaluate(() => {
        points.length = 0; rectangles.length = 0; segments.length = 0;
        circles.length = 0; curves.length = 0; polygons.length = 0;
        selectedItems = [];
        setMode('rectangle');
        const p = { id: nextId++, x: 400, y: 400, z: globalZ++ };
        points.push(p);
        creationStartPointId = p.id;
        const caches = new Set();
        cacherLesCoinsDesRectangles(caches);
        return { cache: caches.has(p.id), id: p.id };
    });
    r.verifie('le premier coin ne porte pas de croix', premierCoin.cache, JSON.stringify(premierCoin));

    // Mais s'il sert aussi à une autre figure, c'est un vrai point : il reste.
    const coinPartage = await page.evaluate(() => {
        const p = getObjectById('point', creationStartPointId);
        const autre = { id: nextId++, x: 500, y: 500, z: globalZ++ };
        points.push(autre);
        segments.push({ id: nextId++, p1_id: p.id, p2_id: autre.id, z: globalZ++ });
        const caches = new Set();
        cacherLesCoinsDesRectangles(caches);
        const dedans = caches.has(p.id);
        segments.length = 0;
        return dedans;
    });
    r.verifie('un coin qui tient déjà un segment garde sa croix', coinPartage === false, String(coinPartage));

    // Un cercle commence lui aussi par un point posé : c'est son CENTRE, un
    // vrai point de construction, et il doit se voir pendant qu'on écarte le
    // rayon. Ce n'est que le coin d'un rectangle qui ne s'annonce pas.
    const centreDeCercle = await page.evaluate(() => {
        points.length = 0; rectangles.length = 0; segments.length = 0;
        setMode('circle');
        const p = { id: nextId++, x: 400, y: 400, z: globalZ++ };
        points.push(p);
        creationStartPointId = p.id;
        const caches = new Set();
        cacherLesCoinsDesRectangles(caches);
        const dedans = caches.has(p.id);
        creationStartPointId = null; setMode('pointer');
        return dedans;
    });
    r.verifie('le centre d\'un cercle en cours garde sa croix', centreDeCercle === false, String(centreDeCercle));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
