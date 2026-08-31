// L'aimant à trois sources : le quadrillage, les outils de géométrie posés sur
// le tableau, et les points d'intersection des tracés (le « point fantôme »).
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Aimantation');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof positionAimantee === 'function', { timeout: 20000 });

    // --- LE SOUS-MENU DE L'AIMANT ---
    const boite = await page.evaluate(() => {
        const b = document.getElementById('btn-magnet').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
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
            titre: p.querySelector('.rp-titre').innerText.toLowerCase(),
            choix: Array.from(p.querySelectorAll('.rp-choix')).map(c => c.innerText),
            actifs: p.querySelectorAll('.rp-choix.actif').length,
            dansEcran: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1
        };
    });
    r.verifie('un appui long sur l\'aimant ouvre ses réglages', !!panneau && panneau.titre === 'aimant', JSON.stringify(panneau));
    r.verifie('il propose les trois sources', !!panneau && panneau.choix.length === 3, panneau && panneau.choix.join(' · '));
    r.verifie('le quadrillage, les outils et les intersections',
        !!panneau && /quadrillage/i.test(panneau.choix[0]) && /outils/i.test(panneau.choix[1]) && /intersection/i.test(panneau.choix[2]),
        panneau && panneau.choix.join(' · '));
    r.verifie('les trois sont allumées au départ', !!panneau && panneau.actifs === 3, JSON.stringify(panneau));
    r.verifie('et l\'aimant s\'allume tout seul quand on règle une source',
        await page.evaluate(() => magnetMode === false), 'l\'aimant n\'est pas encore allumé');

    // Éteindre le quadrillage : le réglage est mémorisé et l'aimant s'allume
    const eteint = await page.evaluate(() => {
        Array.from(document.querySelectorAll('#panneau-appui .rp-choix')).find(c => /quadrillage/i.test(c.innerText)).click();
        return { grille: aimant.grille, magnet: magnetMode, memoire: localStorage.getItem('board_aimant') };
    });
    r.egal('on peut éteindre le quadrillage', eteint.grille, false);
    r.verifie('l\'aimant est allumé du même geste', eteint.magnet);
    r.verifie('le réglage est mémorisé', /"grille":false/.test(eteint.memoire || ''), eteint.memoire);

    await page.waitForTimeout(150);
    const rouvert = await page.evaluate(() => !!document.getElementById('panneau-appui'));
    r.verifie('le panneau reste ouvert pour régler les autres sources', rouvert);

    const jamaisVide = await page.evaluate(() => {
        aimant.grille = false; aimant.outils = false; aimant.intersections = true;
        const p = document.getElementById('panneau-appui');
        Array.from(p.querySelectorAll('.rp-choix')).find(c => /intersection/i.test(c.innerText)).click();
        return { intersections: aimant.intersections };
    });
    r.verifie('on ne peut pas tout éteindre : il resterait un aimant qui n\'aimante rien',
        jamaisVide.intersections === true, JSON.stringify(jamaisVide));

    await page.evaluate(() => {
        const p = document.getElementById('panneau-appui'); if (p) p.remove();
        aimant = { grille: true, outils: true, intersections: true };
        magnetMode = true;
        document.getElementById('btn-magnet').classList.add('active');
    });

    // --- LES INTERSECTIONS ---
    await tableauVierge(page);
    const croix = await page.evaluate(() => {
        // Deux segments qui se croisent en (300, 300)
        points.push({ id: 1, x: 100, y: 300 }, { id: 2, x: 500, y: 300 },
                     { id: 3, x: 300, y: 100 }, { id: 4, x: 300, y: 500 });
        segments.push({ id: 5, p1_id: 1, p2_id: 2 }, { id: 6, p1_id: 3, p2_id: 4 });
        nextId = 10;
        zoom = 1;
        const pres = positionAimantee({ x: 305, y: 296 });
        const loin = positionAimantee({ x: 380, y: 296 });
        return { pres, loin };
    });
    r.verifie('le curseur près d\'un croisement s\'y accroche',
        croix.pres.source === 'intersection' && croix.pres.x === 300 && croix.pres.y === 300, JSON.stringify(croix.pres));
    r.verifie('loin du croisement, c\'est le quadrillage qui reprend la main',
        croix.loin.source === 'grille', JSON.stringify(croix.loin));

    // Le croisement doit tomber SUR les deux segments, pas sur leur prolongement
    const horsSegment = await page.evaluate(() => {
        points.length = 0; segments.length = 0;
        points.push({ id: 1, x: 100, y: 300 }, { id: 2, x: 200, y: 300 },   // s'arrête avant
                     { id: 3, x: 300, y: 100 }, { id: 4, x: 300, y: 500 });
        segments.push({ id: 5, p1_id: 1, p2_id: 2 }, { id: 6, p1_id: 3, p2_id: 4 });
        return positionAimantee({ x: 302, y: 301 }).source;
    });
    r.verifie('deux segments qui ne se touchent pas ne créent pas de croisement',
        horsSegment !== 'intersection', String(horsSegment));

    const droiteInfinie = await page.evaluate(() => {
        segments[0].lineType = 'droite';    // la droite, elle, se prolonge
        return positionAimantee({ x: 302, y: 301 });
    });
    r.verifie('une droite, elle, croise bien au-delà de ses points',
        droiteInfinie.source === 'intersection' && droiteInfinie.x === 300 && droiteInfinie.y === 300,
        JSON.stringify(droiteInfinie));

    // Droite et cercle : deux points, on prend le plus proche du curseur
    const avecCercle = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 0, y: 300 }, { id: 2, x: 600, y: 300 },     // horizontale y = 300
                     { id: 3, x: 300, y: 300 }, { id: 4, x: 300, y: 400 }); // cercle de centre (300,300), rayon 100
        // le point du bord est placé en bas : les deux croisements avec la
        // droite ne sont donc portés par aucun point existant
        segments.push({ id: 5, p1_id: 1, p2_id: 2 });
        circles.push({ id: 6, center_id: 3, edge_id: 4 });
        return {
            droite: positionAimantee({ x: 402, y: 301 }),
            gauche: positionAimantee({ x: 198, y: 302 })
        };
    });
    r.verifie('une droite coupe un cercle en deux points : celui de droite',
        avecCercle.droite.source === 'intersection' && Math.abs(avecCercle.droite.x - 400) < 0.01,
        JSON.stringify(avecCercle.droite));
    r.verifie('et celui de gauche', avecCercle.gauche.source === 'intersection' && Math.abs(avecCercle.gauche.x - 200) < 0.01,
        JSON.stringify(avecCercle.gauche));

    // Deux cercles : la construction de la médiatrice au compas
    const deuxCercles = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 200, y: 300 }, { id: 2, x: 400, y: 300 },
                     { id: 3, x: 400, y: 300 }, { id: 4, x: 600, y: 300 });
        circles.push({ id: 5, center_id: 1, edge_id: 2 }, { id: 6, center_id: 3, edge_id: 4 });
        // Les deux cercles de rayon 200, centres (200,300) et (400,300),
        // se coupent en (300, 300 ± √(200² − 100²)) ≈ (300, 300 ± 173,2)
        const haut = positionAimantee({ x: 301, y: 127 });
        return { haut, attendu: 300 - Math.sqrt(200 * 200 - 100 * 100) };
    });
    r.verifie('deux cercles se croisent aussi (la médiatrice au compas)',
        deuxCercles.haut.source === 'intersection'
        && Math.abs(deuxCercles.haut.x - 300) < 0.01
        && Math.abs(deuxCercles.haut.y - deuxCercles.attendu) < 0.01,
        JSON.stringify(deuxCercles));

    // Poser un point tombe pile sur le croisement
    await tableauVierge(page);
    const pose = await page.evaluate(() => {
        points.push({ id: 1, x: 300, y: 200 }, { id: 2, x: 700, y: 200 },
                     { id: 3, x: 500, y: 100 }, { id: 4, x: 500, y: 400 });
        segments.push({ id: 5, p1_id: 1, p2_id: 2 }, { id: 6, p1_id: 3, p2_id: 4 });
        nextId = 20; zoom = 1; panX = 0; panY = 0;
        setMode('point');
        draw();
        return points.length;
    });
    await page.mouse.click(505, 204);
    await page.waitForTimeout(150);
    const nouveau = await page.evaluate(() => {
        const p = points[points.length - 1];
        return { total: points.length, x: p.x, y: p.y };
    });
    r.egal('un clic près du croisement pose un point', nouveau.total, pose + 1);
    r.verifie('et il tombe pile dessus', nouveau.x === 500 && nouveau.y === 200, JSON.stringify(nouveau));

    // --- LE QUADRILLAGE SEUL ---
    const grilleSeule = await page.evaluate(() => {
        aimant.intersections = false;
        const p = positionAimantee({ x: 505, y: 204 });
        aimant.intersections = true;
        return p;
    });
    r.verifie('intersections éteintes, le quadrillage reprend',
        grilleSeule.source === 'grille' && grilleSeule.x % 30 === 0, JSON.stringify(grilleSeule));

    // --- LES OUTILS DE GÉOMÉTRIE ---
    const regle = await page.evaluate(() => {
        document.querySelector('.btn[data-widget="ruler"]').click();
        const w = widgets.ruler;
        // un point à 4 px sous le bord supérieur de la règle
        const bord = w.toGlobal(120, 4);
        const p = positionAimantee(bord);
        const local = w.toLocal(p.x, p.y);
        return { actif: activeWidgets.ruler, ecart: Math.abs(local.y), source: p.source, epaisseur: activeStyle.lineWidth };
    });
    r.verifie('la règle est bien posée sur le tableau', regle.actif);
    r.verifie('le tracé se colle contre le bord de la règle',
        regle.source === 'outil' && regle.ecart <= regle.epaisseur, JSON.stringify(regle));

    const sansOutils = await page.evaluate(() => {
        aimant.outils = false;
        const p = positionAimantee(widgets.ruler.toGlobal(120, 4));
        aimant.outils = true;
        return p.source;
    });
    r.verifie('on peut débrayer l\'aimantation aux outils', sansOutils !== 'outil', String(sansOutils));

    // --- L'OUTIL QU'ON DÉPLACE SE CALE AUSSI (repris de GeoMaster) ---
    const outilSurPoint = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 600, y: 400 });
        const w = widgets.ruler;
        const pose = poserOutil(w, { x: 607, y: 396 });          // 8 px du point
        const loin = poserOutil(w, { x: 900, y: 400 });
        return { pose, loin };
    });
    r.verifie('une règle déplacée se pose sur un point de la figure',
        outilSurPoint.pose.x === 600 && outilSurPoint.pose.y === 400, JSON.stringify(outilSurPoint.pose));
    r.verifie('mais pas quand elle en est loin',
        outilSurPoint.loin.x === 900, JSON.stringify(outilSurPoint.loin));

    const outilSurTrace = await page.evaluate(() => {
        points.length = 0; segments.length = 0;
        points.push({ id: 1, x: 200, y: 500 }, { id: 2, x: 800, y: 500 });
        segments.push({ id: 3, p1_id: 1, p2_id: 2 });
        return poserOutil(widgets.ruler, { x: 500, y: 508 });     // 8 px au-dessus du trait
    });
    r.verifie('elle se pose aussi LE LONG d\'un trait',
        outilSurTrace.x === 500 && outilSurTrace.y === 500, JSON.stringify(outilSurTrace));

    const outilSurCercle = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 500, y: 500 }, { id: 2, x: 700, y: 500 });
        circles.push({ id: 3, center_id: 1, edge_id: 2 });
        const p = poserOutil(widgets.ruler, { x: 500, y: 308 });  // rayon 200, donc bord à y = 300
        return { p, ecart: Math.abs(Math.hypot(p.x - 500, p.y - 500) - 200) };
    });
    r.verifie('et sur le bord d\'un cercle', outilSurCercle.ecart < 0.01, JSON.stringify(outilSurCercle));

    // Règle et équerre s'alignent : le geste des parallèles
    const alignement = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        document.querySelector('.btn[data-widget="setsquare"]').click();
        const eq = widgets.setsquare, regle = widgets.ruler;
        eq.x = 400; eq.y = 400; eq.angle = 0.5;
        regle.angle = 0.5 + 0.03;                 // ~1,7° d'écart : dans la tolérance de 4°
        const pose = poserOutil(regle, { x: eq.x + 200 * Math.cos(0.5) + 6, y: eq.y + 200 * Math.sin(0.5) + 6 });
        const surLaDroite = Math.abs((pose.x - eq.x) * Math.sin(0.5) - (pose.y - eq.y) * Math.cos(0.5));
        return { angleRegle: regle.angle, angleEquerre: eq.angle, surLaDroite };
    });
    r.verifie('la règle s\'aligne exactement sur l\'équerre',
        Math.abs(alignement.angleRegle - alignement.angleEquerre) < 1e-9, JSON.stringify(alignement));
    r.verifie('et glisse le long de son bord', alignement.surLaDroite < 0.01, JSON.stringify(alignement));

    const perpendiculaire = await page.evaluate(() => {
        const eq = widgets.setsquare, regle = widgets.ruler;
        eq.angle = 0.5;
        regle.angle = 0.5 + Math.PI / 2 + 0.02;    // presque perpendiculaire
        poserOutil(regle, { x: eq.x + 4, y: eq.y + 4 });
        const ecart = Math.abs(regle.angle - (eq.angle + Math.PI / 2));
        return { ecart, angle: regle.angle };
    });
    r.verifie('presque perpendiculaire devient exactement perpendiculaire',
        perpendiculaire.ecart < 1e-9, JSON.stringify(perpendiculaire));

    // La pointe du compas se pose sur le zéro de la règle (report de longueur)
    const compasSurRegle = await page.evaluate(() => {
        document.querySelector('.btn[data-widget="compass"]').click();
        const zero = widgets.ruler.toGlobal(0, 0);
        const pose = poserOutil(widgets.compass, { x: zero.x + 6, y: zero.y - 5 });
        return { pose, zero };
    });
    r.verifie('la pointe du compas se pose sur le zéro de la règle',
        Math.abs(compasSurRegle.pose.x - compasSurRegle.zero.x) < 0.01
        && Math.abs(compasSurRegle.pose.y - compasSurRegle.zero.y) < 0.01,
        JSON.stringify(compasSurRegle));

    // L'écartement du compas se prend sur un point : la longueur est exacte
    const ecartement = await page.evaluate(() => {
        points.length = 0;
        points.push({ id: 1, x: 900, y: 300 });
        const w = widgets.compass;
        w.x = 600; w.y = 300;
        const bout = pointerCompasVers(w, 894, 306);
        return { bout, longueurExacte: Math.hypot(bout.x - w.x, bout.y - w.y) };
    });
    r.verifie('le compas prend son écartement sur un point de la figure',
        ecartement.longueurExacte === 300, JSON.stringify(ecartement));

    await page.evaluate(() => {
        ['setsquare', 'compass'].forEach(n => document.querySelector(`.btn[data-widget="${n}"]`).click());
        points.length = 0;
    });

    // --- LE TRACÉ À MAIN LEVÉE RESTE LIBRE ---
    await page.evaluate(() => {
        document.querySelector('.btn[data-widget="ruler"]').click();   // on range la règle
        setMode('freehand');
        [freehands].forEach(a => a.length = 0);
        draw();
    });
    await page.mouse.move(400, 500);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) await page.mouse.move(400 + i * 7, 500 + Math.sin(i) * 11);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const libre = await page.evaluate(() => {
        const f = freehands[freehands.length - 1];
        if (!f) return null;
        const surGrille = f.points.filter(p => p.x % 30 === 0 && p.y % 30 === 0).length;
        return { total: f.points.length, surGrille };
    });
    r.verifie('un tracé à main levée n\'est pas ramené sur les carreaux',
        !!libre && libre.total > 4 && libre.surGrille < libre.total / 2,
        JSON.stringify(libre));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
