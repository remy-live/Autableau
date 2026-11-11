// LE TRAIT À MAIN LEVÉE SE PREND SUR SON TRACÉ, PAS SUR SES POINTS.
//
// « On a aussi beaucoup de mal à sélectionner un trait libre quand on clique
// sur le trait. »
//
// On testait la distance aux POINTS ENREGISTRÉS, un par un. Or un geste vif
// n'en laisse pas beaucoup : le pointeur n'est échantillonné que quelques
// dizaines de fois par seconde. Mesuré sur un tracé ordinaire — trois
// mouvements francs — QUATORZE points espacés de SOIXANTE pixels, pour une
// zone de prise de huit. Le trait était donc saisissable sur seize pixels tous
// les soixante.
//
// Mesuré avant correctif : sur soixante-dix-huit clics posés EXACTEMENT sur le
// tracé, quarante-huit le manquaient — 62 %. On pose le doigt sur son dessin,
// et il ne se passe rien. Deux fois sur trois.
//
// C'est le défaut que la COURBE, juste au-dessus dans le même fichier, a déjà
// connu et déjà réparé : « elle était dessinée partout et saisissable en
// quatre endroits ». Le trait libre était resté en arrière, et c'est pourtant
// l'objet qu'on trace le plus souvent au tableau.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le trait se prend sur son tracé');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. ON TRACE COMME EN CLASSE : un geste franc, rapide. C'est la vitesse
    //    qui écarte les points, et c'est elle qu'il faut reproduire — un tracé
    //    lent, point par point, ne montrerait rien du défaut.
    // ------------------------------------------------------------------
    await page.evaluate(() => setMode('freehand'));
    await page.mouse.move(300, 400);
    await page.mouse.down();
    await page.mouse.move(500, 300, { steps: 4 });
    await page.mouse.move(700, 450, { steps: 4 });
    await page.mouse.move(900, 320, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const trait = await page.evaluate(() => {
        const f = freehands[freehands.length - 1];
        if (!f) return null;
        const ecarts = [];
        for (let i = 1; i < f.points.length; i++) {
            ecarts.push(Math.hypot(f.points[i].x - f.points[i - 1].x,
                                   f.points[i].y - f.points[i - 1].y));
        }
        ecarts.sort((a, b) => a - b);
        return { points: f.points.length, epaisseur: f.width,
                 ecartMedian: Math.round(ecarts[Math.floor(ecarts.length / 2)]) };
    });
    r.verifie('un geste vif laisse ses points très écartés — c\'est la cause',
        trait && trait.points >= 4 && trait.ecartMedian >= 25, JSON.stringify(trait));

    // ------------------------------------------------------------------
    // 2. ON CLIQUE SUR LE TRACÉ, PARTOUT. Pas près du tracé : DESSUS — sur le
    //    segment qui joint deux points enregistrés, là où l'encre est posée et
    //    où l'enseignant croit, à raison, pouvoir l'attraper.
    // ------------------------------------------------------------------
    const surLeTrace = await page.evaluate(() => {
        const f = freehands[freehands.length - 1];
        setMode('pointer');
        let trouves = 0, total = 0;
        const rates = [];
        for (let i = 1; i < f.points.length; i++) {
            const a = f.points[i - 1], b = f.points[i];
            for (let t = 0; t <= 1; t += 0.1) {
                const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
                total++;
                const o = findObjectAt(x, y);
                if (o && o.type === 'freehand' && o.id === f.id) trouves++;
                else if (rates.length < 6) rates.push([Math.round(x), Math.round(y)]);
            }
        }
        return { total, trouves, rates };
    });
    r.egal('TOUS LES CLICS POSÉS SUR LE TRACÉ LE TROUVENT — c\'était la plainte',
        surLeTrace.trouves, surLeTrace.total,
        'ratés : ' + JSON.stringify(surLeTrace.rates));

    // ------------------------------------------------------------------
    // 3. ET LE MILIEU DE CHAQUE SEGMENT, QUI EST LE PIRE CAS — le point le
    //    plus loin des deux échantillons, celui que l'ancienne façon ne
    //    pouvait jamais atteindre dès que l'écart dépassait seize pixels.
    // ------------------------------------------------------------------
    const auMilieu = await page.evaluate(() => {
        const f = freehands[freehands.length - 1];
        let trouves = 0, total = 0;
        for (let i = 1; i < f.points.length; i++) {
            const a = f.points[i - 1], b = f.points[i];
            total++;
            const o = findObjectAt((a.x + b.x) / 2, (a.y + b.y) / 2);
            if (o && o.type === 'freehand' && o.id === f.id) trouves++;
        }
        return { total, trouves };
    });
    r.egal('y compris au MILIEU de chaque segment, le plus loin des points',
        auMilieu.trouves, auMilieu.total, JSON.stringify(auMilieu));

    // ------------------------------------------------------------------
    // 4. ON NE PREND PAS CE QU'ON NE VISE PAS. Élargir la prise ne doit pas
    //    rendre le trait collant : à trente pixels de son tracé, il ne doit
    //    rien attraper — sinon on sélectionnerait son dessin en cliquant à
    //    côté pour désélectionner.
    // ------------------------------------------------------------------
    const aCote = await page.evaluate(() => {
        const f = freehands[freehands.length - 1];
        // La distance VRAIE au tracé entier, et non au seul segment visé : à
        // un virage, la normale d'un segment retombe près du segment voisin,
        // et une sonde qu'on croit « à trente pixels » est en réalité sur
        // l'encre. Ce serait de la géométrie prise pour de la glu.
        const distance = (x, y) => {
            let d = Infinity;
            for (let i = 1; i < f.points.length; i++) {
                const a = f.points[i - 1], b = f.points[i];
                const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
                let t = l2 ? ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / l2 : 0;
                t = Math.max(0, Math.min(1, t));
                d = Math.min(d, Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y))));
            }
            return d;
        };
        let pris = 0, essais = 0;
        for (let i = 1; i < f.points.length; i++) {
            const a = f.points[i - 1], b = f.points[i];
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
            const nx = -dy / L * 30, ny = dx / L * 30;
            [[mx + nx, my + ny], [mx - nx, my - ny]].forEach(([x, y]) => {
                if (distance(x, y) < 20) return;      // la sonde est en fait sur l'encre
                essais++;
                const o = findObjectAt(x, y);
                if (o && o.type === 'freehand' && o.id === f.id) pris++;
            });
        }
        return { essais, pris };
    });
    r.egal('et à trente pixels à côté, il ne se laisse pas prendre',
        aCote.pris, 0, JSON.stringify(aCote));

    // ------------------------------------------------------------------
    // 5. CE QU'ON VOIT, ON DOIT POUVOIR L'ATTRAPER. Un surligneur large de
    //    trente pixels se vise de loin ; lui donner la même zone de prise
    //    qu'un trait fin obligeait à viser son axe au pixel près.
    // ------------------------------------------------------------------
    const gras = await page.evaluate(() => {
        const f = { id: nextId++, points: [{ x: -400, y: -200 }, { x: -200, y: -200 }],
                    color: '#f1c40f', width: 30, z: globalZ++ };
        freehands.push(f);
        saveState();
        // à dix pixels de l'axe : largement DANS le trait, qui en fait trente
        const o = findObjectAt(-300, -190);
        // et à trente pixels : dehors
        const dehors = findObjectAt(-300, -230);
        return { dedans: !!(o && o.type === 'freehand' && o.id === f.id),
                 dehors: !!(dehors && dehors.type === 'freehand' && dehors.id === f.id) };
    });
    r.egal('un trait épais s\'attrape dans toute son épaisseur',
        gras.dedans, true, JSON.stringify(gras));
    r.egal('mais pas au-delà', gras.dehors, false, JSON.stringify(gras));

    // ------------------------------------------------------------------
    // 6. UN TRAIT D'UN SEUL POINT — le point posé d'un clic de crayon — reste
    //    saisissable. La boucle sur les segments n'en a aucun à parcourir.
    // ------------------------------------------------------------------
    const unSeulPoint = await page.evaluate(() => {
        const f = { id: nextId++, points: [{ x: 600, y: -300 }], color: '#000',
                    width: 6, z: globalZ++ };
        freehands.push(f);
        saveState();
        const o = findObjectAt(600, -300);
        return !!(o && o.type === 'freehand' && o.id === f.id);
    });
    r.egal('un trait réduit à un point se prend encore', unSeulPoint, true);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
