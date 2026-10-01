// LA COURBE S'ATTRAPE PAR SON TRACÉ — ET LES BOUTONS MORTS S'EN VONT
//
// « Je n'arrive pas en cliquant sur un Bézier à la sélectionner. »
// « À quoi sert le couper copier coller de la barre de style ? C'est
// inutilisable pendant un tracé. »
//
// DEUX DÉFAUTS DE MÊME NATURE : quelque chose était là où il ne servait à
// rien, et rien n'était là où il fallait.
//
//   — Le test de clic d'une courbe ne regardait QUE SES POINTS DE CONTRÔLE :
//     « pour chaque point, si le clic en est proche, c'est elle ». Entre deux
//     points, rien — et sur une courbe tracée à la main, deux points voisins
//     sont souvent à plusieurs centaines de pixels l'un de l'autre. La courbe
//     se voyait partout et ne s'attrapait qu'en quatre endroits. Les
//     polygones, eux, testent les segments entre leurs sommets depuis
//     toujours : la courbe avait été oubliée parce qu'elle n'est pas faite de
//     segments mais d'une spline.
//   — Les trois boutons « copier / couper / coller » paraissaient dès que la
//     barre était là, donc dès qu'on tenait un crayon. Sans sélection et sans
//     presse-papier, ils ne pouvaient rien faire.
//
// LE CONTRÔLE DE LA COURBE CHERCHE UN PIXEL PEINT. C'est ce qui le rend
// difficile à satisfaire par hasard : on relit la toile, on y trouve un point
// où la courbe est VRAIMENT dessinée, loin de tout point de contrôle, et l'on
// exige qu'un clic à cet endroit-là la sélectionne. Si la formule du dessin et
// celle du test de clic se séparent un jour, ce contrôle tombe — aucun des
// deux ne peut bouger sans l'autre.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La courbe s\'attrape par son tracé');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof echantillonsDeLaCourbe === 'function', { timeout: 20000 });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. UNE COURBE, ET UN PIXEL D'ELLE LOIN DE SES POINTS
    // ------------------------------------------------------------------
    const cible = await page.evaluate(() => {
        panX = 700; panY = 450; zoom = 1;
        [points, curves, segments, freehands].forEach(a => a.length = 0);
        selectedItems = [];
        setMode('pointer');
        const ids = [];
        // Quatre points très écartés : c'est le cas qui faisait échouer le
        // clic, et c'est celui d'une courbe tracée à main levée.
        [[-400, 100], [-120, -220], [160, 180], [430, -140]].forEach(([x, y]) => {
            const id = nextId++;
            points.push({ id, x, y, color: '#e74c3c', shape: 'aucun', z: globalZ++ });
            ids.push(id);
        });
        curves.push({ id: nextId++, points: ids, color: '#e74c3c', width: 4,
                      dash: 'solid', closed: false, z: globalZ++ });
        draw();

        const pts = ids.map(i => getObjectById('point', i));
        const fond = (() => { const d = ctx.getImageData(30, 30, 1, 1).data; return [d[0], d[1], d[2]]; })();
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const L = canvas.width;
        const loinDesPoints = (wx, wy) => pts.every(p => Math.hypot(p.x - wx, p.y - wy) > 80);
        const trouves = [];
        for (let y = 0; y < canvas.height; y += 3) {
            for (let x = 0; x < L; x += 3) {
                const i = (y * L + x) * 4;
                const d = img.data;
                if (Math.abs(d[i] - fond[0]) + Math.abs(d[i + 1] - fond[1])
                    + Math.abs(d[i + 2] - fond[2]) < 90) continue;
                const wx = (x - panX) / zoom, wy = (y - panY) / zoom;
                if (loinDesPoints(wx, wy)) trouves.push({ x, y });
            }
        }
        return { combien: trouves.length,
                 // Celui du milieu : ni le départ ni l'arrivée.
                 pixel: trouves.length ? trouves[Math.floor(trouves.length / 2)] : null,
                 idCourbe: curves[0].id };
    });
    r.verifie('la courbe est bien peinte loin de ses points de contrôle',
        cible.combien > 50, cible.combien + ' pixels trouvés');

    // ------------------------------------------------------------------
    // 2. ET UN CLIC SUR CE PIXEL LA SÉLECTIONNE
    // ------------------------------------------------------------------
    await page.mouse.click(cible.pixel.x, cible.pixel.y);
    await page.waitForTimeout(250);
    const pris = await page.evaluate(() => selectedItems.map(s => s.type + '#' + s.id));
    r.egal('UN CLIC SUR LE TRACÉ SÉLECTIONNE LA COURBE', pris, ['curve#' + cible.idCourbe]);

    // ------------------------------------------------------------------
    // 3. MAIS PAS N'IMPORTE OÙ
    //
    // Sans ce contrôle, un test de clic qui dirait « oui » partout passerait
    // le précédent sans rien mesurer.
    // ------------------------------------------------------------------
    const loin = await page.evaluate(() => {
        selectedItems = [];
        // Un coin de l'écran où l'on vient de vérifier qu'il n'y a rien.
        const fond = (() => { const d = ctx.getImageData(30, 30, 1, 1).data; return [d[0], d[1], d[2]]; })();
        const d = ctx.getImageData(60, 820, 1, 1).data;
        return { vide: Math.abs(d[0] - fond[0]) + Math.abs(d[1] - fond[1]) + Math.abs(d[2] - fond[2]) < 30 };
    });
    r.verifie('le coin visé est bien vide', loin.vide, JSON.stringify(loin));
    await page.mouse.click(60, 820);
    await page.waitForTimeout(200);
    r.egal('et un clic dans le vide ne sélectionne rien',
        await page.evaluate(() => selectedItems.length), 0);

    // ------------------------------------------------------------------
    // 4. L'ÉCHANTILLONNAGE SUIT LA COURBE, IL NE LA DEVINE PAS
    //
    // Deux points font une droite, et il ne faut pas plus de deux échantillons
    // pour la dire. Quatre points font une spline, qu'on découpe.
    // ------------------------------------------------------------------
    const formes = await page.evaluate(() => {
        const faire = (coords, closed) => {
            const ids = coords.map(([x, y]) => {
                const id = nextId++;
                points.push({ id, x, y, color: '#000', shape: 'aucun', z: globalZ++ });
                return id;
            });
            return { id: nextId++, points: ids, closed: !!closed };
        };
        const droite = faire([[0, 0], [100, 0]]);
        const spline = faire([[0, 0], [50, 80], [120, -40], [200, 10]]);
        const boucle = faire([[0, 0], [60, 60], [120, 0]], true);
        return { droite: echantillonsDeLaCourbe(droite).length,
                 spline: echantillonsDeLaCourbe(spline).length,
                 boucle: echantillonsDeLaCourbe(boucle).length,
                 vide: echantillonsDeLaCourbe({ points: [] }).length };
    });
    r.egal('deux points donnent deux échantillons', formes.droite, 2);
    r.verifie('une spline de quatre points en donne beaucoup plus',
        formes.spline > 30, String(formes.spline));
    r.verifie('et une courbe fermée fait le tour',
        formes.boucle > formes.spline / 2, String(formes.boucle));
    r.egal('une courbe sans point n\'en donne aucun', formes.vide, 0);

    // ------------------------------------------------------------------
    // 5. COPIER / COUPER / COLLER NE PARAISSENT QUE S'ILS PEUVENT AGIR
    //
    // « C'est inutilisable pendant un tracé. » Trois boutons sous les doigts
    // de quelqu'un qui trace, et qui ne font rien : une commande sans effet ne
    // fait pas qu'encombrer, elle ment.
    // ------------------------------------------------------------------
    const edition = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const lu = {};
        const voir = () => {
            const g = document.querySelector('#bar-style .group-edition');
            return g ? getComputedStyle(g).display : '(absent)';
        };
        boardClipboard = { items: [], points: [] };
        selectedItems = [];
        setMode('curve');                      // un outil en main, rien de pris
        updateStyleBarContext(); await attendre(150);
        lu.enTracant = voir();

        selectedItems = [{ type: 'curve', id: curves[0].id }];
        updateStyleBarContext(); await attendre(150);
        lu.avecSelection = voir();

        copierSelection();
        selectedItems = [];
        updateStyleBarContext(); await attendre(150);
        lu.pressePapierRempli = voir();

        boardClipboard = { items: [], points: [] };
        selectedItems = [];
        updateStyleBarContext(); await attendre(150);
        lu.toutVide = voir();
        return lu;
    });
    r.egal('EN TRAÇANT, LES TROIS BOUTONS NE SONT PAS LÀ', edition.enTracant, 'none',
        JSON.stringify(edition));
    r.egal('avec une sélection, ils paraissent', edition.avecSelection, 'flex', JSON.stringify(edition));
    r.egal('et avec de quoi coller aussi, même sans sélection',
        edition.pressePapierRempli, 'flex', JSON.stringify(edition));
    r.egal('tout vide, ils s\'en vont de nouveau', edition.toutVide, 'none', JSON.stringify(edition));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
