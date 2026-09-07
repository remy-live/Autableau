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
        const p = (type, x, y) => new PointerEvent(type, {
            bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, clientX: x, clientY: y
        });
        poignee.dispatchEvent(p('pointerdown', depart.x, depart.y));
        // 100 pixels d'écran à 50 % = 200 unités de plan
        document.dispatchEvent(p('pointermove', depart.x + 100, depart.y));
        document.dispatchEvent(p('pointerup', depart.x + 100, depart.y));
        await new Promise(res => setTimeout(res, 150));
        return { avant, apres: { x: t.x, y: t.y }, deplacement: t.x - avant.x, style: table.style.left };
    });
    r.verifie('cent pixels d\'écran à 50 % déplacent la table de deux cents unités',
        Math.abs(glisse.deplacement - 200) <= 20,
        JSON.stringify(glisse));

    // LA MOLETTE NE DOIT PLUS S'EMBALLER. Un cran de souris vaut une centaine
    // de pixels ; un pavé tactile en envoie des dizaines de tout petits. Quand
    // chacun valait un cran entier, le moindre effleurement du pavé faisait
    // bondir le plan.
    const molette = await page.evaluate(async (c) => {
        const cadre = document.querySelector('.sp-canvas-wrap');
        const lire = () => parseFloat((String(document.querySelector('#sp-canvas').style.transform)
            .match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
        const poser = (v) => {
            const s = document.querySelector('#sp-zoom');
            s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const tourner = (delta, fois) => {
            for (let i = 0; i < fois; i++) {
                cadre.dispatchEvent(new WheelEvent('wheel', {
                    bubbles: true, cancelable: true, deltaY: delta, deltaMode: 0,
                    clientX: c.x, clientY: c.y
                }));
            }
        };
        poser(60); await new Promise(res => setTimeout(res, 120));
        const depart = lire();
        tourner(-100, 1);
        const unCran = lire();
        poser(60); await new Promise(res => setTimeout(res, 120));
        tourner(-4, 10);          // dix relevés de pavé tactile
        const unPavé = lire();
        poser(60); await new Promise(res => setTimeout(res, 120));
        tourner(-100, 3);
        const troisCrans = lire();
        return { depart, unCran, unPavé, troisCrans };
    }, centre);
    r.verifie('un cran de molette agrandit doucement, pas de 10 %',
        molette.unCran > molette.depart && molette.unCran < molette.depart * 1.09,
        JSON.stringify(molette));
    r.verifie('dix relevés de pavé tactile ne valent pas dix crans de souris',
        molette.unPavé < molette.unCran, JSON.stringify(molette));
    r.verifie('mais la molette continue d\'avancer cran après cran',
        molette.troisCrans > molette.unCran, JSON.stringify(molette));

    // LE PINCEMENT À DEUX DOIGTS : l'écart règle le facteur, le milieu des
    // doigts entraîne le cadre.
    const pince = await page.evaluate(async () => {
        const cadre = document.querySelector('.sp-canvas-wrap');
        const lire = () => parseFloat((String(document.querySelector('#sp-canvas').style.transform)
            .match(/scale\(([\d.]+)\)/) || [0, 1])[1]);
        const s = document.querySelector('#sp-zoom');
        s.value = '70'; s.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(res => setTimeout(res, 120));
        cadre.scrollLeft = 60; cadre.scrollTop = 60;
        const b = cadre.getBoundingClientRect();
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const doigt = (type, id, x, y) => cadre.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
            isPrimary: id === 1, clientX: x, clientY: y
        }));
        const depart = lire();
        doigt('pointerdown', 1, cx - 50, cy);
        doigt('pointerdown', 2, cx + 50, cy);
        // On écarte jusqu'à taper la butée haute…
        doigt('pointermove', 1, cx - 150, cy);
        doigt('pointermove', 2, cx + 150, cy);
        const ecarte = lire();
        // … puis on revient exactement à l'écart de départ. Le plan doit
        // revenir à sa taille de départ : la butée ne doit pas avoir mangé le
        // chemin parcouru.
        doigt('pointermove', 1, cx - 50, cy);
        doigt('pointermove', 2, cx + 50, cy);
        const revenu = lire();
        doigt('pointerup', 1, cx - 50, cy);
        doigt('pointerup', 2, cx + 50, cy);
        await new Promise(res => setTimeout(res, 500));
        const cls = await ClassesStore.loadAll();
        return { depart, ecarte, revenu, retenu: cls.find(c => c.id === 'cz').seatingPlan.zoom };
    });
    r.verifie('écarter deux doigts agrandit le plan',
        pince.ecarte > pince.depart * 1.5, JSON.stringify(pince));
    r.verifie('les rapprocher d\'autant ramène à la taille de départ',
        Math.abs(pince.revenu - pince.depart) < 0.03, JSON.stringify(pince));
    r.verifie('le facteur atteint au doigt est retenu avec le plan',
        Math.abs(pince.retenu - pince.revenu) < 0.02, JSON.stringify(pince));

    // LES DEUX DOIGTS DÉPLACENT AUSSI : à écart constant, le plan suit.
    const balade = await page.evaluate(async () => {
        const cadre = document.querySelector('.sp-canvas-wrap');
        const s = document.querySelector('#sp-zoom');
        s.value = '140'; s.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(res => setTimeout(res, 150));
        cadre.scrollLeft = 100; cadre.scrollTop = 100;
        const scroll0 = cadre.scrollLeft;
        const b = cadre.getBoundingClientRect();
        const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const doigt = (type, id, x, y) => cadre.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
            isPrimary: id === 1, clientX: x, clientY: y
        }));
        doigt('pointerdown', 1, cx - 40, cy);
        doigt('pointerdown', 2, cx + 40, cy);
        // Les deux doigts glissent ensemble de 70 px vers la gauche.
        doigt('pointermove', 1, cx - 110, cy);
        doigt('pointermove', 2, cx - 30, cy);
        const apres = cadre.scrollLeft;
        doigt('pointerup', 1, cx - 110, cy);
        doigt('pointerup', 2, cx - 30, cy);
        return { scroll0, apres, marge: cadre.scrollWidth - cadre.clientWidth };
    });
    r.verifie('deux doigts qui glissent déplacent le plan',
        balade.apres > balade.scroll0 + 40, JSON.stringify(balade));

    // UN SECOND DOIGT PENDANT UN GLISSER DE TABLE : c'est un pincement, la
    // table ne doit pas partir avec le premier doigt.
    const pendant = await page.evaluate(async () => {
        const cadre = document.querySelector('.sp-canvas-wrap');
        const poignee = document.querySelector('.sp-table-handle');
        const cls = await ClassesStore.loadAll();
        const plan = cls.find(c => c.id === 'cz').seatingPlan;
        const t = plan.tables.find(x => x.id === poignee.dataset.table);
        const avant = t.x;
        const b = poignee.getBoundingClientRect();
        const doigt = (cible, type, id, x, y) => cible.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
            isPrimary: id === 1, clientX: x, clientY: y
        }));
        doigt(poignee, 'pointerdown', 1, b.x + 10, b.y + 5);
        doigt(cadre, 'pointerdown', 2, b.x + 200, b.y + 100);
        doigt(document, 'pointermove', 1, b.x + 210, b.y + 5);
        doigt(document, 'pointerup', 1, b.x + 210, b.y + 5);
        doigt(cadre, 'pointerup', 2, b.x + 200, b.y + 100);
        await new Promise(res => setTimeout(res, 120));
        return { avant, apres: t.x };
    });
    r.egal('un second doigt annule le glisser de la table', pendant.apres, pendant.avant);

    // LE RÉGLAGE DU ZOOM SE TIENT SUR LE PLAN, pas au fond de la colonne.
    const place = await page.evaluate(() => {
        const boite = document.querySelector('.sp-zoom-boite');
        const cadre = document.querySelector('.sp-canvas-wrap').getBoundingClientRect();
        const b = boite.getBoundingClientRect();
        return {
            dansLaScene: !!boite.closest('.sp-scene'),
            surLePlan: b.x >= cadre.x - 2 && b.right <= cadre.right + 2 && b.bottom <= cadre.bottom + 2,
            visible: b.width > 0 && b.height > 0
        };
    });
    r.egal('le curseur de zoom flotte au-dessus du plan',
        place, { dansLaScene: true, surLePlan: true, visible: true });

    // =====================================================================
    // « EN CLASSE » : LE PLAN COMME SURFACE DU QUOTIDIEN
    // Préparer la salle et s'en servir sont deux moments différents. Pendant
    // l'heure, on regarde la salle : on tape les chaises vides pour faire
    // l'appel, on interroge, et surtout rien ne doit bouger par mégarde.
    // =====================================================================
    const enClasse = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        document.querySelector('.sp-mode[data-mode="classe"]').click();
        await attendre(300);
        const cls = await ClassesStore.loadAll();
        const c = cls.find(x => x.id === 'cz');
        return {
            retenu: c.seatingPlan.mode,
            colonne: !!document.querySelector('#sp-tirer'),
            plusDOrganisation: !document.querySelector('#sp-autofill'),
            // Les places ne se glissent plus, les tables non plus.
            placesGlissables: document.querySelectorAll('.sp-seat.filled[draggable="true"]').length,
            poigneesFigees: document.querySelectorAll('.sp-table-handle.fige').length,
            corbeilles: document.querySelectorAll('.sp-table-del').length,
            resume: (document.querySelector('#sp-appel-resume') || {}).textContent
        };
    });
    r.egal('le mode « En classe » est retenu avec la classe', enClasse.retenu, 'classe');
    r.egal('il remplace les outils d\'organisation par ceux de l\'heure',
        { classe: enClasse.colonne, organisation: enClasse.plusDOrganisation },
        { classe: true, organisation: true });
    r.egal('et rien ne peut plus être déplacé ni supprimé par mégarde',
        { places: enClasse.placesGlissables, corbeilles: enClasse.corbeilles },
        { places: 0, corbeilles: 0 });
    r.verifie('les poignées des tables sont figées', enClasse.poigneesFigees >= 6,
        String(enClasse.poigneesFigees));
    r.egal('l\'appel commence entier', enClasse.resume, '12 présents');

    // UNE TABLE NE SE DÉPLACE PLUS : la vérification qui compte, puisque
    // c'est le geste qu'on fait sans le vouloir en montrant le plan.
    const figee = await page.evaluate(async () => {
        const poignee = document.querySelector('.sp-table-handle');
        const cls = await ClassesStore.loadAll();
        const t = cls.find(x => x.id === 'cz').seatingPlan.tables.find(x => x.id === poignee.dataset.table);
        const avant = t.x;
        const b = poignee.getBoundingClientRect();
        const p = (type, x) => new PointerEvent(type, {
            bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, clientX: x, clientY: b.y + 5
        });
        poignee.dispatchEvent(p('pointerdown', b.x + 10));
        document.dispatchEvent(p('pointermove', b.x + 160));
        document.dispatchEvent(p('pointerup', b.x + 160));
        await new Promise(res => setTimeout(res, 150));
        return { avant, apres: t.x };
    });
    r.egal('la table reste où elle est pendant l\'heure', figee.apres, figee.avant);

    // L'APPEL SUR LES CHAISES : le geste du début d'heure.
    const appel = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const nomDe = () => document.querySelectorAll('.sp-seat.filled')[0].dataset.student;
        const premier = nomDe();
        document.querySelectorAll('.sp-seat.filled')[0].click();
        await attendre(250);
        const cls1 = await ClassesStore.loadAll();
        const e1 = cls1.find(x => x.id === 'cz').students.find(s => s.id === premier);
        const apresUn = {
            absent: !!e1.absent,
            journal: (e1.journal || []).filter(x => x.t === 'a').length,
            resume: document.querySelector('#sp-appel-resume').textContent,
            barree: document.querySelectorAll('.sp-seat.absent').length,
            listeDroite: document.querySelectorAll('.sp-chip-absent').length
        };
        // Un second clic corrige : l'élève redevient présent, et la trace part.
        document.querySelectorAll('.sp-seat.filled')[0].click();
        await attendre(250);
        const cls2 = await ClassesStore.loadAll();
        const e2 = cls2.find(x => x.id === 'cz').students.find(s => s.id === premier);
        return {
            apresUn,
            apresDeux: {
                absent: !!e2.absent,
                journal: (e2.journal || []).filter(x => x.t === 'a').length,
                resume: document.querySelector('#sp-appel-resume').textContent
            }
        };
    });
    r.egal('un clic sur une place marque l\'absence, et la journée est datée',
        { absent: appel.apresUn.absent, journal: appel.apresUn.journal, resume: appel.apresUn.resume },
        { absent: true, journal: 1, resume: '11 présents, 1 absent' });
    r.egal('la place et la colonne de droite le montrent',
        { barree: appel.apresUn.barree, liste: appel.apresUn.listeDroite }, { barree: 1, liste: 1 });
    r.egal('un second clic corrige l\'appel, trace comprise',
        appel.apresDeux, { absent: false, journal: 0, resume: '12 présents' });

    // LE TIRAGE : chacun son tour, et pas les absents.
    const tirage = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        document.querySelector('#sp-tirage-reset').click();
        await attendre(200);
        // Deux absents : ils ne doivent jamais sortir du chapeau.
        const absents = [];
        for (const i of [3, 8]) {
            const s = document.querySelectorAll('.sp-seat.filled')[i];
            absents.push(s.dataset.student);
            s.click();
            await attendre(150);
        }
        const tires = [];
        for (let n = 0; n < 10; n++) {
            document.querySelector('#sp-tirer').click();
            await attendre(120);
            tires.push(document.querySelector('.sp-seat.interroge').dataset.student);
        }
        // Le onzième repart d'un chapeau plein.
        document.querySelector('#sp-tirer').click();
        await attendre(120);
        const onzieme = document.querySelector('.sp-seat.interroge').dataset.student;
        const cls = await ClassesStore.loadAll();
        return {
            distincts: new Set(tires).size,
            combien: tires.length,
            absentsTires: tires.filter(id => absents.includes(id)).length,
            recommence: (cls.find(x => x.id === 'cz').seatingPlan.tirage || []).length,
            onziemeConnu: tires.includes(onzieme)
        };
    });
    r.egal('dix tirages donnent dix élèves différents, jamais un absent',
        { distincts: tirage.distincts, combien: tirage.combien, absents: tirage.absentsTires },
        { distincts: 10, combien: 10, absents: 0 });
    r.egal('tout le monde passé, le chapeau se remplit à nouveau',
        { reste: tirage.recommence, deja: tirage.onziemeConnu }, { reste: 1, deja: true });

    // --- DONNER UN POINT DEPUIS LE PLAN ---
    // Les mêmes points que la feuille : mêmes compteurs, même journal daté,
    // même pile d'annulation. Sinon le bilan compterait deux fois, ou pas.
    const donner = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const lire = async (id) => {
            const cls = await ClassesStore.loadAll();
            const e = cls.find(x => x.id === 'cz').students.find(s => s.id === id);
            return {
                plus: (e.pts || {}).plus || 0, moins: (e.pts || {}).moins || 0,
                p: (e.journal || []).filter(x => x.t === 'p').length,
                o: (e.journal || []).filter(x => x.t === 'o' && x.v === 'devoirs').length,
                absent: !!e.absent
            };
        };
        document.querySelector('#sp-tous-presents').click();
        await attendre(250);

        const dit = () => document.querySelector('#sp-clic-dit').textContent.trim();
        const auDepart = dit();

        // On arme le bonus, puis on clique une place.
        const boutons = [...document.querySelectorAll('.sp-donne')];
        boutons[0].click();
        await attendre(200);
        const arme = { dit: dit(), actifs: document.querySelectorAll('.sp-donne.actif').length };

        const cible = document.querySelectorAll('.sp-seat.filled')[0].dataset.student;
        const avant = await lire(cible);
        document.querySelectorAll('.sp-seat.filled')[0].click();
        await attendre(300);
        const apres = await lire(cible);

        // L'annulation de la feuille défait un point donné depuis le plan.
        document.querySelector('#sp-annuler-point').click();
        await attendre(300);
        const annule = await lire(cible);

        // Un oubli : même chemin, autre nature.
        const oubliBtn = boutons.find(b => b.textContent.trim() === 'Devoirs');
        oubliBtn.click();
        await attendre(200);
        document.querySelectorAll('.sp-seat.filled')[0].click();
        await attendre(300);
        const avecOubli = await lire(cible);

        // Un second clic sur le bouton désarme : le clic redevient l'appel.
        oubliBtn.click();
        await attendre(200);
        const desarme = { dit: dit(), actifs: document.querySelectorAll('.sp-donne.actif').length };
        document.querySelectorAll('.sp-seat.filled')[0].click();
        await attendre(300);
        const apresDesarme = await lire(cible);

        return { auDepart, arme, avant, apres, annule, avecOubli, desarme, apresDesarme };
    });
    r.egal('sans rien d\'armé, le clic est annoncé comme l\'appel', donner.auDepart, "fait l'appel");
    r.egal('armer le bonus change ce que le clic fera',
        { dit: donner.arme.dit, actifs: donner.arme.actifs },
        { dit: 'donne un point bonus', actifs: 1 });
    r.egal('le point donné depuis le plan compte comme celui de la feuille',
        { plus: donner.apres.plus, journal: donner.apres.p },
        { plus: donner.avant.plus + 1, journal: donner.avant.p + 1 });
    r.egal('et il ne touche pas à l\'appel', donner.apres.absent, false);
    r.egal('« annuler le dernier » le défait, trace comprise',
        { plus: donner.annule.plus, journal: donner.annule.p },
        { plus: donner.avant.plus, journal: donner.avant.p });
    r.egal('un oubli armé se note daté, sur le bon motif', donner.avecOubli.o, 1);
    r.egal('désarmer rend le clic à l\'appel',
        { dit: donner.desarme.dit, actifs: donner.desarme.actifs, absent: donner.apresDesarme.absent },
        { dit: "fait l'appel", actifs: 0, absent: true });

    // ON NE DONNE RIEN À QUELQU'UN QUI N'ÉTAIT PAS LÀ.
    const absentIntouchable = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const place = document.querySelectorAll('.sp-seat.filled')[0];
        const id = place.dataset.student;          // laissé absent juste avant
        document.querySelectorAll('.sp-donne')[0].click();   // bonus
        await attendre(200);
        const cls0 = await ClassesStore.loadAll();
        const avant = ((cls0.find(x => x.id === 'cz').students.find(s => s.id === id).pts) || {}).plus || 0;
        place.click();
        await attendre(300);
        const cls1 = await ClassesStore.loadAll();
        const e = cls1.find(x => x.id === 'cz').students.find(s => s.id === id);
        document.querySelectorAll('.sp-donne')[0].click();   // on désarme
        await attendre(150);
        return { avant, apres: (e.pts || {}).plus || 0, toujoursAbsent: !!e.absent };
    });
    r.egal('un élève noté absent ne reçoit rien',
        { points: absentIntouchable.apres, absent: absentIntouchable.toujoursAbsent },
        { points: absentIntouchable.avant, absent: true });

    // --- DE QUEL CÔTÉ LE PLAN S'OUVRE ---
    // Il s'ouvrait toujours sur « Organiser » : le professeur qui vient faire
    // l'appel tombait sur les boutons pour ajouter des tables, et ne trouvait
    // pas l'appel. Une salle déjà faite s'ouvre du côté où l'on s'en sert.
    const ouverture = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const modeAffiche = () => (document.querySelector('.sp-mode.actif') || {}).dataset?.mode;
        const rouvrir = async (id) => {
            const m = document.getElementById('seating-plan-modal');
            document.querySelectorAll('.modal-backdrop').forEach(x => {
                if (x.querySelector('#sp-canvas')) x.remove();
            });
            if (m) m.remove();
            await openSeatingPlanEditor(id);
            await attendre(500);
            return modeAffiche();
        };
        const cls = await ClassesStore.loadAll();
        const c = cls.find(x => x.id === 'cz');

        // 1. Une salle faite, sans choix retenu : on vient s'en servir.
        delete c.seatingPlan.mode;
        const faite = await rouvrir('cz');

        // 2. Une salle vide : il n'y a rien à faire d'autre que la préparer.
        cls.push({
            id: 'cvide', name: 'Vide', students: [{ id: 'v1', name: 'Solo' }],
            seatingPlan: { tables: [{ id: 'tv', x: 40, y: 60, capacity: 2, cols: 2, seats: [null, null] }] }
        });
        await ClassesStore.saveAll(cls);
        const vide = await rouvrir('cvide');

        // 3. Le choix retenu l'emporte sur les deux.
        c.seatingPlan.mode = 'organiser';
        await ClassesStore.saveAll(cls);
        const retenu = await rouvrir('cz');
        return { faite, vide, retenu };
    });
    r.egal('une salle déjà faite s\'ouvre du côté « En classe »', ouverture.faite, 'classe');
    r.egal('une salle vide s\'ouvre du côté « Organiser »', ouverture.vide, 'organiser');
    r.egal('mais le choix retenu l\'emporte toujours', ouverture.retenu, 'organiser');

    // --- SE DÉPLACER SANS PRENDRE D'OUTIL ---
    // Glisser à côté des tables pousse le plan. Il fallait aller chercher
    // l'outil Main, qu'on ne pense pas à prendre quand on veut simplement
    // voir le fond de la salle.
    const pousser = await page.evaluate(async () => {
        const attendre = ms => new Promise(res => setTimeout(res, ms));
        const cadre = document.querySelector('.sp-canvas-wrap');
        // Un plan qui déborde, et l'outil Sélection — pas la Main.
        document.querySelector('.sp-mode[data-mode="organiser"]').click();
        await attendre(300);
        document.querySelector('.sp-tool-btn[data-tool="select"]').click();
        const s = document.querySelector('#sp-zoom');
        s.value = '140'; s.dispatchEvent(new Event('input', { bubbles: true }));
        await attendre(200);
        cadre.scrollLeft = 120;
        const avant = cadre.scrollLeft;
        const b = cadre.getBoundingClientRect();
        // Un point du cadre où il n'y a pas de table
        const vide = { x: b.right - 12, y: b.bottom - 12 };
        const p = (type, x) => new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
            isPrimary: true, button: 0, clientX: x, clientY: vide.y
        });
        const surLeVide = document.elementFromPoint(vide.x, vide.y);
        cadre.dispatchEvent(p('pointerdown', vide.x));
        document.dispatchEvent(p('pointermove', vide.x - 70));
        document.dispatchEvent(p('pointerup', vide.x - 70));
        await attendre(150);
        const apres = cadre.scrollLeft;

        // Sur une table, en revanche, le plan ne bouge pas : c'est la table
        // qu'on déplace.
        const tableEl = document.querySelector('.sp-table');
        const table = tableEl.getBoundingClientRect();
        cadre.scrollLeft = 120;
        const avantTable = cadre.scrollLeft;
        tableEl.dispatchEvent(p('pointerdown', table.left + 8));
        document.dispatchEvent(p('pointermove', table.left - 60));
        document.dispatchEvent(p('pointerup', table.left - 60));
        await attendre(150);
        return {
            avant, apres, avantTable, apresTable: cadre.scrollLeft,
            surUneTable: !!(surLeVide && surLeVide.closest('.sp-table')),
            curseur: getComputedStyle(cadre).cursor
        };
    });
    r.egal('un point vide du cadre est bien vide', pousser.surUneTable, false);
    r.verifie('glisser à côté des tables pousse le plan, sans prendre la Main',
        pousser.apres > pousser.avant + 40, JSON.stringify(pousser));
    r.egal('mais glisser une table ne pousse pas le plan',
        pousser.apresTable, pousser.avantTable);
    r.egal('et le curseur dit que le fond se prend', pousser.curseur, 'grab');

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
