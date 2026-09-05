// LE PLAN DE CLASSE : LE VOIR EN ENTIER, ET LE REMPLIR DU BON CÔTÉ.
// Trente élèves sur quinze tables débordaient de l'écran — ni le fond de la
// classe ni la colonne de droite n'étaient visibles. Et le remplissage
// automatique par colonne n'allait que de la gauche vers la droite : une salle
// n'a pas toujours sa porte du même côté.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Une grille de tables doubles, posée à la main : trois colonnes, deux rangées.
// `cols` compte — sans lui, les positions des sièges valent NaN et tout tri
// devient un tirage au sort (l'erreur est venue d'une sonde, pas du produit).
const PLAN_DEMO = (rangees, colonnes) => {
    const tables = [];
    let n = 0;
    for (let r = 0; r < rangees; r++) {
        for (let c = 0; c < colonnes; c++) {
            tables.push({ id: 't' + (n++), x: 40 + c * 420, y: 60 + r * 260, capacity: 2, cols: 2, seats: [null, null] });
        }
    }
    return { tables };
};

module.exports = async function (browser) {
    const r = creerRapport('Plan de classe');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1100, height: 800 } });
    await page.waitForFunction(() => typeof openSeatingPlanEditor === 'function', { timeout: 20000 });

    await page.evaluate(async (plan) => {
        const noms = Array.from({ length: 12 }, (_, i) => 'E' + String(i + 1).padStart(2, '0'));
        await ClassesStore.saveAll([{
            id: 'cz', name: '4A',
            students: noms.map((x, i) => ({ id: 's' + i, name: x })),
            seatingPlan: plan
        }]);
        await openSeatingPlanEditor('cz');
        await new Promise(res => setTimeout(res, 900));
    }, PLAN_DEMO(2, 3));

    // =====================================================================
    // LE REMPLISSAGE : QUATRE SENS, ET ILS DOIVENT DIFFÉRER
    // =====================================================================
    const remplir = (sens) => page.evaluate(async (s) => {
        document.querySelector('#sp-order').value = 'alpha';
        document.querySelector('#sp-direction').value = s;
        document.querySelector('#sp-respect-front').checked = false;
        document.querySelector('#sp-autofill').click();
        await new Promise(res => setTimeout(res, 450));
        const cls = await ClassesStore.loadAll();
        const c = cls.find(x => x.id === 'cz');
        const nom = id => (c.students.find(e => e.id === id) || {}).name || '·';
        // Les tables lues comme on les voit : de haut en bas, de gauche à droite
        return c.seatingPlan.tables.slice().sort((a, b) => a.y - b.y || a.x - b.x)
            .map(t => t.seats.map(nom).join(','));
    }, sens);

    const rangeeGD = await remplir('row');
    r.egal('par rangée, de gauche à droite : le premier élève à gauche du premier rang',
        rangeeGD, ['E01,E02', 'E03,E04', 'E05,E06', 'E07,E08', 'E09,E10', 'E11,E12']);

    const rangeeDG = await remplir('row-rev');
    r.egal('par rangée, de droite à gauche : le premier élève à DROITE du premier rang',
        rangeeDG, ['E06,E05', 'E04,E03', 'E02,E01', 'E12,E11', 'E10,E09', 'E08,E07']);

    const colonneGD = await remplir('col');
    r.egal('par colonne, de gauche à droite : on descend avant de passer à côté',
        colonneGD, ['E01,E03', 'E05,E07', 'E09,E11', 'E02,E04', 'E06,E08', 'E10,E12']);

    const colonneDG = await remplir('col-rev');
    r.egal('par colonne, de droite à gauche : la colonne de droite d\'abord',
        colonneDG, ['E11,E09', 'E07,E05', 'E03,E01', 'E12,E10', 'E08,E06', 'E04,E02']);

    r.verifie('les quatre sens donnent quatre plans différents',
        new Set([rangeeGD, rangeeDG, colonneGD, colonneDG].map(x => x.join('|'))).size === 4);

    // LE CHOIX SE RETIENT. Le plan est redessiné après chaque remplissage :
    // sans mémoire, on retombait sur le premier réglage à chaque fois.
    const memoire = await page.evaluate(async () => {
        const cls = await ClassesStore.loadAll();
        return {
            retenu: cls.find(c => c.id === 'cz').seatingPlan.remplissage,
            affiche: document.querySelector('#sp-direction').value
        };
    });
    r.egal('le sens choisi est retenu et réaffiché',
        { sens: memoire.retenu.sens, affiche: memoire.affiche },
        { sens: 'col-rev', affiche: 'col-rev' });

    // =====================================================================
    // LE ZOOM : au curseur, à la molette, et « tout voir »
    // =====================================================================
    const zoom = () => page.evaluate(() => {
        const c = document.querySelector('#sp-canvas');
        const k = parseFloat((String(c.style.transform).match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
        return {
            k: +k.toFixed(2),
            lu: (document.querySelector('#sp-zoom-lu') || {}).textContent,
            curseur: (document.querySelector('#sp-zoom') || {}).value
        };
    });

    await page.evaluate(() => {
        const s = document.querySelector('#sp-zoom');
        s.value = '60'; s.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(250);
    r.egal('le curseur met le plan à l\'échelle, et le dit',
        await zoom(), { k: 0.6, lu: '60 %', curseur: '60' });

    const centre = await page.evaluate(() => {
        const b = document.querySelector('.sp-canvas-wrap').getBoundingClientRect();
        return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(250);
    const apresMolette = await zoom();
    r.verifie('la molette vers le haut agrandit', apresMolette.k > 0.6, JSON.stringify(apresMolette));
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    const apresRetour = await zoom();
    r.verifie('et vers le bas, réduit', apresRetour.k < apresMolette.k, JSON.stringify(apresRetour));
    r.egal('le curseur suit ce que fait la molette',
        apresRetour.curseur, String(Math.round(apresRetour.k * 100)));

    // « TOUT VOIR » : le plan entier entre dans le cadre.
    const ajuste = await page.evaluate(async () => {
        document.querySelector('#sp-zoom-ajuster').click();
        await new Promise(res => setTimeout(res, 300));
        const c = document.querySelector('#sp-canvas'), w = document.querySelector('.sp-canvas-wrap');
        const k = parseFloat((String(c.style.transform).match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
        return { k: +k.toFixed(2), deborde: c.getBoundingClientRect().width > w.clientWidth + 4 };
    });
    r.verifie('« tout voir » fait entrer le plan entier dans le cadre',
        !ajuste.deborde && ajuste.k < 1, JSON.stringify(ajuste));

    // LE ZOOM SUIT LA CLASSE : on ne le rerègle pas à chaque ouverture.
    const retenu = await page.evaluate(async () => {
        const cls = await ClassesStore.loadAll();
        return cls.find(c => c.id === 'cz').seatingPlan.zoom;
    });
    r.verifie('et il est retenu avec le plan',
        typeof retenu === 'number' && Math.abs(retenu - ajuste.k) < 0.02, String(retenu));

    // UNE TABLE SE DÉPLACE JUSTE MÊME DÉZOOMÉE : les tables vivent en unités de
    // plan, le pointeur en pixels d'écran. Sans diviser par le zoom, une table
    // à 50 % partait deux fois trop loin sous le doigt.
    const glisse = await page.evaluate(async () => {
        const s = document.querySelector('#sp-zoom');
        s.value = '50'; s.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(res => setTimeout(res, 200));
        const poignee = document.querySelector('.sp-table-handle');
        const table = poignee.closest('.sp-table');
        const cls = await ClassesStore.loadAll();
        const plan = cls.find(c => c.id === 'cz').seatingPlan;
        const t = plan.tables.find(x => x.id === poignee.dataset.table);
        const avant = { x: t.x, y: t.y };
        const b = poignee.getBoundingClientRect();
        const depart = { x: b.x + 10, y: b.y + 5 };
        poignee.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: depart.x, clientY: depart.y }));
        // 100 pixels d'écran à 50 % = 200 unités de plan
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: depart.x + 100, clientY: depart.y }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(res => setTimeout(res, 150));
        return { avant, apres: { x: t.x, y: t.y }, deplacement: t.x - avant.x, style: table.style.left };
    });
    r.verifie('cent pixels d\'écran à 50 % déplacent la table de deux cents unités',
        Math.abs(glisse.deplacement - 200) <= 20,
        JSON.stringify(glisse));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
