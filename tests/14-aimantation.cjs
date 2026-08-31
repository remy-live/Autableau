// L'aimant à trois sources : le quadrillage, les outils de géométrie posés sur
// le tableau, et les points d'intersection des tracés (le « point fantôme »).
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Aimantation');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof positionAimantee === 'function', { timeout: 20000 });

    // --- LES TROIS SOURCES SONT DANS LA BARRE ---
    const bande = await page.evaluate(() => {
        const b = document.getElementById('aimant-sources');
        const cache = b ? getComputedStyle(b).display === 'none' : null;
        document.getElementById('btn-magnet').click();
        const visible = getComputedStyle(b).display !== 'none';
        const actifs = b.querySelectorAll('.aimant-source.active').length;
        const dansEcran = (() => {
            const r = b.getBoundingClientRect();
            return r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
        })();
        return { cache, visible, actifs, dansEcran, magnet: magnetMode };
    });
    r.verifie('aimant éteint : la barre reste simple', bande.cache === true, JSON.stringify(bande));
    r.verifie('aimant allumé : les trois sources apparaissent dans la barre',
        bande.visible && bande.actifs === 3, JSON.stringify(bande));
    r.verifie('et elles tiennent dans l\'écran', bande.dansEcran, JSON.stringify(bande));

    const bascule = await page.evaluate(() => {
        document.getElementById('btn-aimant-grille').click();
        const apres = {
            grille: aimant.grille,
            marque: document.getElementById('btn-aimant-grille').classList.contains('active'),
            memoire: localStorage.getItem('board_aimant')
        };
        document.getElementById('btn-aimant-grille').click();
        return apres;
    });
    r.egal('un clic éteint le quadrillage', bascule.grille, false);
    r.verifie('le bouton ne se marque plus', !bascule.marque);
    r.verifie('et le réglage est mémorisé', /"grille":false/.test(bascule.memoire || ''), bascule.memoire);

    const derniere = await page.evaluate(() => {
        ['btn-aimant-grille', 'btn-aimant-outils', 'btn-aimant-points'].forEach(id => document.getElementById(id).click());
        const etat = { magnet: magnetMode, sources: Object.assign({}, aimant) };
        // on remet tout en route pour la suite
        aimant.grille = aimant.outils = aimant.intersections = true;
        magnetMode = false;
        majBoutonsAimant();
        return etat;
    });
    r.verifie('éteindre la dernière source éteint l\'aimant', derniere.magnet === false, JSON.stringify(derniere));
    r.verifie('sans laisser un aimant qui n\'attire rien',
        derniere.sources.grille || derniere.sources.outils || derniere.sources.intersections, JSON.stringify(derniere));

    // --- LE SOUS-MENU DE L'AIMANT (toujours là, pour la tablette) ---
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

    // --- LES ARCS DU COMPAS CROISENT AUSSI ---
    // Un arc n'est qu'un cercle dont on ne garde qu'un morceau : il doit
    // croiser les droites, les cercles et les autres arcs — mais seulement là
    // où il existe vraiment.
    const avecArcs = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; arcs.length = 0;
        const P = (x, y) => { const p = { id: nextId++, x, y, z: globalZ++ }; points.push(p); return p; };
        const a = P(-200, 0), b = P(200, 0);
        segments.push({ id: nextId++, p1_id: a.id, p2_id: b.id, z: globalZ++ });
        // le demi-cercle du HAUT (y négatif à l'écran) : de 180° à 360°
        arcs.push({ id: nextId++, type: 'arc', cx: 0, cy: 0, radius: 100,
                    startAngle: Math.PI, endAngle: Math.PI * 2, z: globalZ++ });
        // un cercle entier, dessiné au compas lui aussi
        arcs.push({ id: nextId++, type: 'arc', cx: 150, cy: 0, radius: 100,
                    startAngle: 0, endAngle: Math.PI * 2, z: globalZ++ });

        const formes = cerclesGeometriques(null, 0);
        const droites = droitesGeometriques(null, 0);
        const arrondi = (l) => l.map(p => [Math.round(p.x), Math.round(p.y)]).sort((u, v) => u[0] - v[0]);
        return {
            comptees: formes.length,
            surLeSegment: arrondi(interDroiteCercle(droites[0], formes[0])),
            arcContreArc: arrondi(interCercles(formes[0], formes[1])),
            // le cercle entier est centré en (150,0) : il coupe l'axe en 50 et
            // 250, mais 250 tombe au-delà du bout du segment
            toutLeCercle: arrondi(interDroiteCercle(droites[0], formes[1]))
        };
    });
    r.egal('les arcs comptent parmi les formes qui peuvent se croiser', avecArcs.comptees, 2);
    r.egal('un arc croise un segment à ses deux bouts', avecArcs.surLeSegment, [[-100, 0], [100, 0]]);
    r.egal('deux arcs ne se croisent que là où ils existent tous les deux',
        avecArcs.arcContreArc, [[75, -66]]);
    r.egal('un tour complet croise là où le segment existe encore', avecArcs.toutLeCercle, [[50, 0]]);

    const accrocheArc = await page.evaluate(() => {
        aimant = { grille: false, outils: false, intersections: true };
        zoom = 1;
        const p = positionAimantee({ x: -97, y: 3 });
        return { source: p.source, x: Math.round(p.x), y: Math.round(p.y) };
    });
    r.verifie('le curseur s\'accroche au croisement d\'un arc',
        accrocheArc.source === 'intersection' && accrocheArc.x === -100 && accrocheArc.y === 0,
        JSON.stringify(accrocheArc));

    const horsArc = await page.evaluate(() => {
        // sous le demi-cercle du haut, le croisement n'existe pas
        arcs[0].startAngle = Math.PI * 1.2;
        arcs[0].endAngle = Math.PI * 1.8;      // un petit arc en haut, loin du segment
        return positionAimantee({ x: -97, y: 3 }).source;
    });
    r.verifie('un arc trop court ne croise rien', horsArc !== 'intersection', String(horsArc));

    const pointQuiSuit = await page.evaluate(() => {
        arcs[0].startAngle = Math.PI; arcs[0].endAngle = Math.PI * 2;
        const trouve = intersectionProche({ x: -101, y: 2 }, 12);
        if (!trouve) return { trouve: false };
        const p = { id: nextId++, x: trouve.x, y: trouve.y, depend: { refs: trouve.refs }, z: globalZ++ };
        points.push(p);
        const genres = trouve.refs.map(r => r.k).sort();
        arcs[0].cx = 40;                       // on déplace l'arc
        majPointsDependants();
        const apres = { x: Math.round(p.x), y: Math.round(p.y) };
        arcs.length = 0;                       // l'arc disparaît
        majPointsDependants();
        return { trouve: true, genres, apres, libere: p.depend === undefined };
    });

    // On rend le tableau tel qu'on l'a trouvé : les vérifications suivantes
    // partent d'un aimant complet et d'une figure vide.
    await page.evaluate(() => {
        arcs.length = 0; points.length = 0; segments.length = 0; circles.length = 0;
        aimant = { grille: true, outils: true, intersections: true };
    });
    r.verifie('le croisement sait qu\'il appartient à un arc', pointQuiSuit.trouve, JSON.stringify(pointQuiSuit));
    r.egal('et à quoi d\'autre', pointQuiSuit.genres, ['arc', 'segment']);
    r.egal('le point suit l\'arc quand celui-ci se déplace', pointQuiSuit.apres, { x: -60, y: 0 });
    r.verifie('et redevient libre si l\'arc est effacé', pointQuiSuit.libere, JSON.stringify(pointQuiSuit));

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

    // --- UN POINT D'INTERSECTION APPARTIENT AUX DEUX OBJETS ---
    const lie = await page.evaluate(() => {
        const pose = points[points.length - 1];
        return { depend: !!pose.depend, refs: pose.depend ? pose.depend.refs.map(r => r.k) : [] };
    });
    r.verifie('le point posé sur un croisement retient ses deux objets',
        lie.depend && lie.refs.length === 2, JSON.stringify(lie));

    const suit = await page.evaluate(() => {
        const pose = points[points.length - 1];
        const avant = { x: pose.x, y: pose.y };
        // on déplace la barre horizontale de 60 px vers le bas
        [1, 2].forEach(id => { getObjectById('point', id).y += 60; });
        draw();
        return { avant, apres: { x: pose.x, y: pose.y } };
    });
    r.verifie('quand un objet bouge, le point d\'intersection suit',
        suit.apres.x === 500 && suit.apres.y === 260, JSON.stringify(suit));

    const pasDeplacable = await page.evaluate(() => {
        const pose = points[points.length - 1];
        selectedItems = [{ type: 'point', id: pose.id }];
        const avant = { x: pose.x, y: pose.y };
        // on simule le déplacement d'une sélection
        isDraggingObjs = true;
        const p = getObjectById('point', pose.id);
        if (!p.depend) p.x += 100;                 // le code de déplacement ignore les points liés
        isDraggingObjs = false;
        selectedItems = [];
        draw();
        return { avant, apres: { x: pose.x, y: pose.y } };
    });
    r.verifie('et on ne peut pas l\'arracher de son croisement',
        pasDeplacable.apres.x === pasDeplacable.avant.x, JSON.stringify(pasDeplacable));

    const cercleSuit = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 100, y: 400 }, { id: 2, x: 900, y: 400 },   // droite y = 400
                     { id: 3, x: 500, y: 400 }, { id: 4, x: 500, y: 500 }); // cercle r = 100
        segments.push({ id: 5, p1_id: 1, p2_id: 2 });
        circles.push({ id: 6, center_id: 3, edge_id: 4 });
        nextId = 30;
        setMode('point');
        magnetMode = true;
        const p = positionAimantee({ x: 598, y: 403 });   // près de (600, 400)
        const pose = { id: nextId++, x: p.x, y: p.y, depend: p.refs ? { refs: p.refs } : null };
        points.push(pose);
        // on agrandit le cercle : le rayon passe de 100 à 200
        getObjectById('point', 4).y = 600;
        draw();
        return { source: p.source, x: pose.x, y: pose.y };
    });
    r.verifie('un point sur un cercle suit aussi quand le rayon change',
        cercleSuit.source === 'intersection' && cercleSuit.x === 700 && cercleSuit.y === 400,
        JSON.stringify(cercleSuit));

    const libere = await page.evaluate(() => {
        const pose = points[points.length - 1];
        circles.length = 0;                       // on efface le cercle
        draw();
        return { depend: !!pose.depend, x: pose.x, y: pose.y };
    });
    r.verifie('si un objet est effacé, le point reste où il est et redevient libre',
        !libere.depend && libere.x === 700, JSON.stringify(libere));

    // --- LES POINTS SONT DES CROIX PAR DÉFAUT ---
    const forme = await page.evaluate(() => {
        const icone = document.getElementById('icon-shape');
        return {
            style: activeStyle.pointShape,
            icone: icone ? icone.innerHTML.includes('line') : false,
            pose: points.length ? points[points.length - 1].shape : null
        };
    });
    r.egal('le style de point est la croix', forme.style, 'cross');
    r.verifie('et l\'icône de la barre montre une croix', forme.icone, JSON.stringify(forme));

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

    // Le compas, lui, pose sa pointe sur le bord d'un cercle (la règle non :
    // une règle ne se colle pas à un cercle, et l'aimant serait collant).
    const outilSurCercle = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 500, y: 500 }, { id: 2, x: 700, y: 500 });
        circles.push({ id: 3, center_id: 1, edge_id: 2 });
        document.querySelector('.btn[data-widget="compass"]').click();
        const p = poserOutil(widgets.compass, { x: 500, y: 306 });   // rayon 200, donc bord à y = 300
        const regle = poserOutil(widgets.ruler, { x: 500, y: 306 });
        document.querySelector('.btn[data-widget="compass"]').click();
        return { p, ecart: Math.abs(Math.hypot(p.x - 500, p.y - 500) - 200), regleLibre: Math.abs(regle.y - 306) < 0.01 };
    });
    r.verifie('le compas pose sa pointe sur le bord d\'un cercle', outilSurCercle.ecart < 0.01, JSON.stringify(outilSurCercle));
    r.verifie('la règle, elle, n\'est pas attirée par un cercle', outilSurCercle.regleLibre, JSON.stringify(outilSurCercle));

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

    // --- LE GESTE DE LA PARALLÈLE : L'ÉQUERRE GLISSE LE LONG D'UNE DROITE ---
    const glisse = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        points.push({ id: 1, x: 200, y: 400 }, { id: 2, x: 800, y: 460 });   // droite légèrement inclinée
        segments.push({ id: 3, p1_id: 1, p2_id: 2 });
        const angleTrait = Math.atan2(60, 600);

        const eq = widgets.setsquare || (document.querySelector('.btn[data-widget="setsquare"]').click(), widgets.setsquare);
        eq.angle = angleTrait + 0.02;                 // presque parallèle : ~1,1°
        const pose = poserOutil(eq, { x: 400, y: 424 });   // 4 px au-dessus du trait
        const surLaDroite = Math.abs((pose.y - 400) - (pose.x - 200) * 60 / 600);

        // on glisse ensuite plus loin : l'équerre doit rester collée
        const plusLoin = poserOutil(eq, { x: 700, y: 452 });
        const encoreDessus = Math.abs((plusLoin.y - 400) - (plusLoin.x - 200) * 60 / 600);

        // et si elle n'est pas parallèle du tout, elle ne se colle pas
        eq.angle = angleTrait + 0.6;
        const libre = poserOutil(eq, { x: 400, y: 424 });

        return {
            angle: eq.angle, angleTrait, surLaDroite, encoreDessus,
            glissee: plusLoin.x > pose.x + 200,
            libre: Math.abs(libre.x - 400) < 0.01 && Math.abs(libre.y - 424) < 0.01
        };
    });
    r.verifie('presque parallèle, l\'équerre se colle sur la droite', glisse.surLaDroite < 0.01, JSON.stringify(glisse));
    r.verifie('et elle glisse le long sans la quitter',
        glisse.glissee && glisse.encoreDessus < 0.01, JSON.stringify(glisse));
    r.verifie('mal orientée, elle reste libre', glisse.libre, JSON.stringify(glisse));

    // --- LE COMPAS PREND SON ÉCARTEMENT SUR LES GRADUATIONS ---
    const graduations = await page.evaluate(() => {
        points.length = 0; segments.length = 0;
        const regle = widgets.ruler;
        regle.x = 300; regle.y = 600; regle.angle = 0;
        const compas = widgets.compass || (document.querySelector('.btn[data-widget="compass"]').click(), widgets.compass);
        const zero = regle.toGlobal(0, 0);
        // la pointe se pose sur le zéro de la règle
        const pointe = poserOutil(compas, { x: zero.x + 5, y: zero.y - 4 });
        compas.x = pointe.x; compas.y = pointe.y;
        // on ouvre le compas en visant un peu au-dessus de la règle
        const bout = pointerCompasVers(compas, compas.x + 187, compas.y - 9);
        return {
            surLeZero: Math.abs(pointe.x - zero.x) < 0.01 && Math.abs(pointe.y - zero.y) < 0.01,
            ecartY: Math.abs(bout.y - compas.y),
            longueur: Math.round((bout.x - compas.x) * 10) / 10
        };
    });
    r.verifie('la pointe du compas se pose sur le zéro de la règle', graduations.surLeZero, JSON.stringify(graduations));
    r.verifie('la mine reste sur la graduation, pas au-dessus', graduations.ecartY < 0.01, JSON.stringify(graduations));
    r.egal('et l\'écartement tombe au millimètre', graduations.longueur, 185);

    // --- ON ATTRAPE UN INSTRUMENT SANS PERDRE SON OUTIL ---
    const attrape = await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0;
        panX = 0; panY = 0; zoom = 1;
        const w = widgets.ruler;
        w.x = 300; w.y = 500; w.angle = 0;
        setMode('segment');
        draw();
        return { mode: mode, x: w.x, y: w.y, dedans: { x: w.x + 100, y: w.y + 30 } };
    });
    await page.mouse.move(attrape.dedans.x, attrape.dedans.y);
    await page.mouse.down();
    const pendant = await page.evaluate(() => ({
        attrape: !!draggedWidget, zone: draggedWidgetMode, mode: mode, points: points.length
    }));
    await page.mouse.move(attrape.dedans.x + 90, attrape.dedans.y + 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const apres = await page.evaluate(() => ({
        mode: mode, x: Math.round(widgets.ruler.x), points: points.length, segments: segments.length
    }));
    r.verifie('en mode segment, on attrape quand même la règle',
        pendant.attrape && pendant.zone === 'move', JSON.stringify(pendant));
    r.egal('aucun point n\'est posé au passage', pendant.points, 0);
    r.verifie('la règle a bien bougé', apres.x > 350, JSON.stringify(apres));
    r.egal('et on est toujours en mode segment', apres.mode, 'segment');
    r.egal('sans avoir commencé de tracé', apres.segments, 0);

    const curseur = await page.evaluate(() => {
        const w = widgets.ruler;
        lastRawX = w.x + 100; lastRawY = w.y + 30;
        updateCursor();
        return document.getElementById('board').style.cursor;
    });
    r.verifie('le curseur annonce qu\'on peut la déplacer', /move/.test(curseur), curseur);

    await page.evaluate(() => { setMode('pointer'); draw(); });

    // --- LE COMPAS : PASTILLE D'OUVERTURE ET TRACÉ QUI NE S'EFFACE PAS ---
    const pastille = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        setMode('pointer');
        if (!activeWidgets.compass) document.querySelector('.btn[data-widget="compass"]').click();
        const w = widgets.compass;
        w.x = 500; w.y = 450; w.radius = 220; w.angle = 0;
        // on espionne les textes écrits sur le tableau, pendant l'écartement
        const ecrits = [];
        const vrai = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { ecrits.push(String(t)); return vrai.call(this, t, ...r); };
        draggedWidgetMode = 'resize';
        draw();
        w.radius = 75;
        draw();
        draggedWidgetMode = null;
        CanvasRenderingContext2D.prototype.fillText = vrai;
        return ecrits;
    });
    r.verifie('le compas affiche son ouverture en centimètres',
        pastille.includes('4,4 cm'), pastille.filter(t => /cm/.test(t)).join(' · '));
    r.verifie('et elle suit l\'écartement', pastille.includes('1,5 cm'),
        pastille.filter(t => /cm/.test(t)).join(' · '));

    // Pendant qu'on écarte, la pastille s'allume : c'est là qu'on la cherche
    const pastilleVive = await page.evaluate(() => {
        const w = widgets.compass;
        const fonds = [];
        const vraiFill = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
        const espionner = () => {
            Object.defineProperty(CanvasRenderingContext2D.prototype, 'fillStyle', {
                configurable: true,
                set(v) { fonds.push(String(v)); vraiFill.set.call(this, v); },
                get() { return vraiFill.get.call(this); }
            });
        };
        const textes = [];
        const vraiTexte = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...q) { textes.push(String(t)); return vraiTexte.call(this, t, ...q); };
        espionner();
        draggedWidgetMode = null;
        draw();
        const auRepos = textes.slice();
        fonds.length = 0; textes.length = 0;
        draggedWidgetMode = 'resize';
        draw();
        const enCours = fonds.slice();
        draggedWidgetMode = null;
        Object.defineProperty(CanvasRenderingContext2D.prototype, 'fillStyle', vraiFill);
        CanvasRenderingContext2D.prototype.fillText = vraiTexte;
        return {
            reposSansValeur: !auRepos.some(t => /\d\scm$/.test(t)),
            enCoursAccent: enCours.includes('#0984e3')
        };
    });
    r.verifie('au repos, la valeur ne s\'affiche pas : le compas reste net',
        pastilleVive.reposSansValeur, JSON.stringify(pastilleVive));
    r.verifie('pendant qu\'on écarte, elle apparaît en bleu', pastilleVive.enCoursAccent, JSON.stringify(pastilleVive));

    // La poignée ↔ : elle se voit, et c'est elle qu'on attrape
    const poignee = await page.evaluate(() => {
        const w = widgets.compass;
        w.x = 500; w.y = 450; w.radius = 200; w.angle = 0;
        const centre = w.toGlobal(w.radius + POIGNEE_ECART, -35);
        const dessinee = [];
        const vrai = CanvasRenderingContext2D.prototype.arc;
        CanvasRenderingContext2D.prototype.arc = function (x, y, r, ...q) { dessinee.push(Math.round(r)); return vrai.call(this, x, y, r, ...q); };
        draw();
        CanvasRenderingContext2D.prototype.arc = vrai;
        return {
            zone: w.getHitZone(centre.x, centre.y),
            aCote: w.getHitZone(centre.x + 40, centre.y),
            pastilleDessinee: dessinee.includes(11),
            // la poignée suit l'ouverture
            centreX: centre.x,
            apresOuverture: (() => { w.radius = 300; return w.toGlobal(w.radius + POIGNEE_ECART, -35).x; })()
        };
    });
    r.egal('la poignée d\'écartement s\'attrape', poignee.zone, 'resize');
    r.verifie('elle est bien dessinée à côté de la molette', poignee.pastilleDessinee, JSON.stringify(poignee));
    r.verifie('et à côté d\'elle, on n\'attrape rien', poignee.aCote === null, String(poignee.aCote));
    r.verifie('elle suit l\'ouverture du compas', poignee.apresOuverture > poignee.centreX,
        JSON.stringify(poignee));

    // Prendre la poignée ne doit pas ouvrir le compas d'un coup
    const priseDouce = await page.evaluate(() => {
        const w = widgets.compass;
        w.x = 400; w.y = 400; w.radius = 200; w.angle = 0;
        aimant.outils = false; aimant.intersections = false;
        const centre = w.toGlobal(w.radius + POIGNEE_ECART, -35);
        const ecran = (p) => ({ clientX: panX + p.x * zoom, clientY: panY + p.y * zoom });
        const depart = ecran(centre);
        canvas.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ bubbles: true, pointerId: 1, isPrimary: true, button: 0 }, depart)));
        const justeApres = w.radius;
        canvas.dispatchEvent(new PointerEvent('pointermove', Object.assign({ bubbles: true, pointerId: 1, isPrimary: true },
            { clientX: depart.clientX + 50, clientY: depart.clientY })));
        const apresGlissement = w.radius;
        canvas.dispatchEvent(new PointerEvent('pointerup', Object.assign({ bubbles: true, pointerId: 1, isPrimary: true }, depart)));
        return { avant: 200, justeApres: Math.round(justeApres), apresGlissement: Math.round(apresGlissement) };
    });
    r.verifie('prendre la poignée n\'ouvre pas le compas d\'un coup',
        Math.abs(priseDouce.justeApres - 200) < 3, JSON.stringify(priseDouce));
    r.verifie('mais le glissement l\'ouvre bien',
        priseDouce.apresGlissement > 240 && priseDouce.apresGlissement < 260, JSON.stringify(priseDouce));

    const trace = await page.evaluate(() => {
        arcs.length = 0;
        const w = widgets.compass;
        w.x = 500; w.y = 450; w.radius = 220; w.angle = 0;
        activeStyle.strokeColor = '#e74c3c';
        draw();
        return { x: w.x, y: w.y, r: w.radius };
    });
    const surLeCercle = (deg) => ({
        x: trace.x + trace.r * Math.cos(deg * Math.PI / 180),
        y: trace.y + trace.r * Math.sin(deg * Math.PI / 180)
    });
    const depart = surLeCercle(0);
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    for (let a = 5; a <= 120; a += 5) { const p = surLeCercle(a); await page.mouse.move(p.x, p.y); }
    const avance = await page.evaluate(() => currentTracingArc
        ? Math.round((currentTracingArc.endAngle - currentTracingArc.startAngle) * 180 / Math.PI) : null);
    for (let a = 115; a >= 30; a -= 5) { const p = surLeCercle(a); await page.mouse.move(p.x, p.y); }
    const retour = await page.evaluate(() => currentTracingArc
        ? Math.round((currentTracingArc.endAngle - currentTracingArc.startAngle) * 180 / Math.PI) : null);
    for (let a = 25; a >= -40; a -= 5) { const p = surLeCercle(a); await page.mouse.move(p.x, p.y); }
    const audela = await page.evaluate(() => currentTracingArc ? {
        etendue: Math.round((currentTracingArc.endAngle - currentTracingArc.startAngle) * 180 / Math.PI),
        debut: Math.round(currentTracingArc.startAngle * 180 / Math.PI)
    } : null);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const arcPose = await page.evaluate(() => arcs.length
        ? Math.round((arcs[arcs.length - 1].endAngle - arcs[arcs.length - 1].startAngle) * 180 / Math.PI) : null);

    r.verifie('le compas trace un arc de 120°', avance >= 115 && avance <= 125, String(avance));
    r.verifie('revenir sur ses pas n\'efface pas le trait déjà tracé',
        retour >= 115 && retour <= 125, `${retour}° après être revenu à 30°`);
    r.verifie('repartir au-delà du départ allonge l\'arc de l\'autre côté',
        !!audela && audela.etendue >= 155 && audela.etendue <= 165 && audela.debut <= -35,
        JSON.stringify(audela));
    r.verifie('et l\'arc posé garde toute son étendue', arcPose >= 155 && arcPose <= 165, String(arcPose));

    await page.evaluate(() => {
        document.querySelector('.btn[data-widget="compass"]').click();
        arcs.length = 0; draw();
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
