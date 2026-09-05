// Sauvegarde, historique d'annulation et mutualisation des images.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Persistance');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Tableau chargé : 12 tampons identiques + 1 différent, puis 200 actions
    const mesures = await page.evaluate(() => {
        const mk = (graine) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">' +
            Array.from({ length: 3000 }, (_, i) => `<rect x="${i % 55 * 7}" y="${Math.floor(i / 55) * 7}" width="6" height="6" fill="#${((i * graine) % 16777215).toString(16).padStart(6, '0')}"/>`).join('') +
            '</svg>');
        const a = mk(7919), b = mk(104729);
        [a, b].forEach(src => { const im = new Image(); im.src = src; imageCache[src] = im; });
        for (let i = 0; i < 12; i++) images.push({ id: nextId++, x: i * 40, y: i * 30, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400, src: a, z: globalZ++ });
        images.push({ id: nextId++, x: 900, y: 100, w: 400, h: 400, cx: 0, cy: 0, cw: 400, ch: 400, src: b, z: globalZ++ });

        const t0 = performance.now();
        for (let i = 0; i < 200; i++) { images[0].x += 1; saveState(); }
        const parAction = (performance.now() - t0) / 200;

        const brut = JSON.stringify({ pages: [{ images }], nextId, globalZ, currentBgIndex }).length;
        const paye = JSON.stringify(stateForStorage()).length;
        return {
            parActionMs: +parAction.toFixed(2),
            entrees: history.length,
            historiqueMo: +(history.reduce((x, s) => x + s.length, 0) / 1048576).toFixed(2),
            brutMo: +(brut / 1048576).toFixed(2),
            payeMo: +(paye / 1048576).toFixed(2)
        };
    });
    r.verifie('temps par action sous 3 ms', mesures.parActionMs < 3, `${mesures.parActionMs} ms`);
    r.verifie('historique sous 5 Mo', mesures.historiqueMo < 5, `${mesures.historiqueMo} Mo pour ${mesures.entrees} entrées`);
    r.verifie('historique plafonné', mesures.entrees <= 200, `${mesures.entrees} entrées`);
    r.verifie('images mutualisées dans la sauvegarde', mesures.payeMo < mesures.brutMo / 2, `${mesures.payeMo} Mo contre ${mesures.brutMo} Mo`);

    // La sauvegarde ne contient pas l'historique
    const contenu = await page.evaluate(() => {
        const s = stateForStorage();
        return { pageAvecHistorique: s.pages.some(p => 'history' in p), aTableImages: !!s.assets && Object.keys(s.assets).length > 0 };
    });
    r.verifie('historique absent de la sauvegarde', !contenu.pageAvecHistorique);
    r.verifie('table d\'images présente', contenu.aTableImages);

    // Enregistrement puis rechargement complet de la page
    await page.evaluate(async () => { await writeAppLocal(); });
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await page.waitForTimeout(400);
    const recharge = await page.evaluate(async () => {
        const saved = await localforage.getItem('AuTableau_AutoSave');
        restoreState(saved);
        await new Promise(res => setTimeout(res, 500));
        return {
            images: images.length,
            sourcesValides: images.every(i => typeof i.src === 'string' && i.src.startsWith('data:image')),
            sansReference: images.every(i => !i.srcRef),
            distinctes: new Set(images.map(i => i.src)).size
        };
    });
    r.egal('images retrouvées après rechargement', recharge.images, 13);
    r.verifie('sources d\'images restaurées', recharge.sourcesValides);
    r.verifie('aucune référence résiduelle', recharge.sansReference);
    r.egal('deux images distinctes', recharge.distinctes, 2);

    // Annuler / rétablir avec des images
    const annuler = await page.evaluate(() => {
        const n0 = images.length;
        images.push({ id: nextId++, x: 5, y: 5, w: 50, h: 50, cx: 0, cy: 0, cw: 50, ch: 50, src: images[0].src, z: globalZ++ });
        saveState();
        undo(); const apresAnnuler = images.length;
        redo(); const apresRetablir = images.length;
        return { n0, apresAnnuler, apresRetablir, sourcesIntactes: images.every(i => typeof i.src === 'string' && i.src.length > 100) };
    });
    r.egal('annuler revient en arrière', annuler.apresAnnuler, annuler.n0);
    r.egal('rétablir revient en avant', annuler.apresRetablir, annuler.n0 + 1);
    r.verifie('sources intactes après annuler/rétablir', annuler.sourcesIntactes);

    // Un fichier de l'ancien format (src en clair) se charge toujours
    const ancien = await page.evaluate(async () => {
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="35" fill="red"/></svg>');
        restoreState({
            pages: [{
                points: [], segments: [], circles: [], rectangles: [], texts: [], freehands: [], curves: [], polygons: [], arcs: [], htmlPostits: [],
                images: [{ id: 1, x: 0, y: 0, w: 80, h: 80, cx: 0, cy: 0, cw: 80, ch: 80, src, z: 1 }], panX: 640, panY: 400, zoom: 1
            }], nextId: 2, globalZ: 2, currentBgIndex: 0
        });
        await new Promise(res => setTimeout(res, 300));
        return { images: images.length, source: images[0] && images[0].src.startsWith('data:image') };
    });
    r.egal('ancien format : image chargée', ancien.images, 1);
    r.verifie('ancien format : source intacte', ancien.source);

    // --- UNE SAUVEGARDE EST-ELLE JUGÉE VIDE ? ---
    // Au démarrage, l'application décide si la sauvegarde vaut la peine d'être
    // proposée. Elle ne regardait que trois listes : points, images et tracés
    // à main levée. Une séance faite uniquement de post-its, de blocs de texte
    // ou de figures géométriques était donc jugée vide et jetée sans un mot —
    // alors qu'elle était bien enregistrée.
    const vide = { points: [], segments: [], circles: [], rectangles: [], texts: [],
                   freehands: [], curves: [], polygons: [], images: [], arcs: [], htmlPostits: [] };
    const jugement = await page.evaluate((modele) => {
        const avec = (quoi) => ({ pages: [Object.assign({}, modele, quoi)] });
        return {
            rienDuTout: sauvegardeAvecDuContenu(avec({})),
            postits: sauvegardeAvecDuContenu(avec({ htmlPostits: [{ id: 1, content: 'Devoirs' }] })),
            textes: sauvegardeAvecDuContenu(avec({ texts: [{ id: 1, content: 'Leçon' }] })),
            geometrie: sauvegardeAvecDuContenu(avec({ segments: [{ id: 1 }] })),
            cercles: sauvegardeAvecDuContenu(avec({ circles: [{ id: 1 }] })),
            polygones: sauvegardeAvecDuContenu(avec({ polygons: [{ id: 1 }] })),
            arcs: sauvegardeAvecDuContenu(avec({ arcs: [{ id: 1 }] })),
            points: sauvegardeAvecDuContenu(avec({ points: [{ id: 1 }] })),
            // le vieux format sans « pages » se juge aussi
            ancienFormat: sauvegardeAvecDuContenu(Object.assign({}, modele, { texts: [{ id: 1 }] })),
            rien: sauvegardeAvecDuContenu(null)
        };
    }, vide);
    r.verifie('une sauvegarde sans rien est bien vide', !jugement.rienDuTout);
    r.verifie('un post-it suffit à la rendre précieuse', jugement.postits);
    r.verifie('un bloc de texte aussi', jugement.textes);
    r.verifie('un segment aussi', jugement.geometrie);
    r.verifie('un cercle aussi', jugement.cercles);
    r.verifie('un polygone aussi', jugement.polygones);
    r.verifie('un arc aussi', jugement.arcs);
    r.verifie('un point, évidemment', jugement.points);
    r.verifie('le vieux format sans « pages » est jugé pareil', jugement.ancienFormat);
    r.verifie('et rien du tout ne casse rien', !jugement.rien);

    // Le vrai parcours : on écrit, on recharge la page, on doit retrouver.
    const allerRetour = await page.evaluate(async () => {
        htmlPostits.length = 0;
        [points, segments, texts, images, freehands].forEach(a => a.length = 0);
        htmlPostits.push({ id: nextId++, x: 200, y: 200, w: 300, h: 220,
                           content: 'Devoirs pour lundi', bg: '#fdfd96', z: globalZ++ });
        syncPage();
        await writeAppLocal();
        const s = await localforage.getItem('AuTableau_AutoSave');
        return {
            surLeDisque: s && s.pages && (s.pages[currentPageIndex].htmlPostits || []).length,
            juge: sauvegardeAvecDuContenu(s)
        };
    });
    r.egal('un tableau qui ne porte qu\'un post-it s\'enregistre', allerRetour.surLeDisque, 1);
    r.verifie('et le démarrage le reconnaîtra comme du travail à restaurer', allerRetour.juge,
        JSON.stringify(allerRetour));

    // --- LE POIDS ANNONCÉ, ET LES FICHIERS QUI MANQUENT ---
    const poids = await page.evaluate(() => ({
        octets: formatSize(300),
        ko: formatSize(4200),
        mo: formatSize(3.2 * 1024 * 1024),
        // calculateObjectSize compte en octets, comme tout le reste
        mesure: calculateObjectSize({ a: 'x'.repeat(1000) })
    }));
    r.egal('les petits poids s\'écrivent en octets', poids.octets, '300 octets');
    r.egal('puis en kilooctets', poids.ko, '4,1 Ko');
    r.egal('puis en mégaoctets', poids.mo, '3,2 Mo');
    r.verifie('et la mesure est bien en octets, pas en mégaoctets',
        poids.mesure > 1000 && poids.mesure < 1100, String(poids.mesure));

    // Une image un peu grosse quitte l'objet pour une table commune : le
    // fichier exporté doit emporter cette table, sinon il perd ses images.
    const exporte = await page.evaluate(() => {
        images.length = 0;
        const src = 'data:image/png;base64,' + 'A'.repeat(3000);
        images.push({ id: nextId++, x: 0, y: 0, w: 60, h: 60, cx: 0, cy: 0, cw: 32, ch: 32,
                      src, fileName: 'photo.png', z: globalZ++ });
        syncPage();
        const etat = stateForStorage();
        const pagesExp = etat.pages.map(p => ({ images: p.images || [] }));
        const table = collectAssets(pagesExp);
        const complet = JSON.stringify({ data: { pages: pagesExp, assets: table } });
        return {
            objetAllege: !!(etat.pages[currentPageIndex].images[0].srcRef),
            tableRemplie: Object.keys(table).length,
            complet: complet.length,
            emporteLaSource: complet.includes('AAAA')
        };
    });
    r.verifie('l\'objet ne porte qu\'une référence', exporte.objetAllege, JSON.stringify(exporte));
    r.egal('et la table des images en contient la source', exporte.tableRemplie, 1);
    r.verifie('le fichier exporté emporte bien cette table',
        exporte.emporteLaSource && exporte.complet > 3000, JSON.stringify(exporte));

    const trous = await page.evaluate(() => {
        images.length = 0;
        images.push({ id: nextId++, x: -100, y: -60, w: 200, h: 120, cx: 0, cy: 0, cw: 200, ch: 120,
                      src: '', fileName: 'lecon-3.png', z: globalZ++ });
        syncPage();
        const manquantes = imagesManquantes();
        // le dessin ne doit pas laisser un trou muet
        const ecrits = [];
        const vrai = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...q) { ecrits.push(String(t)); return vrai.call(this, t, ...q); };
        draw();
        CanvasRenderingContext2D.prototype.fillText = vrai;
        // et saisir une poignée ne doit pas planter
        let plante = false;
        try {
            selectedItems = [{ type: 'image', id: images[0].id }];
            draggedHandle = 'R';
            draggingItem = { type: 'image', id: images[0].id };
            const o = images[0];
            const source = imageCache[o.src];
            const natW = source ? source.naturalWidth : (o.cw || o.w);
            if (!(natW > 0)) plante = true;
        } catch (e) { plante = true; }
        draggedHandle = null; draggingItem = null; selectedItems = [];
        return {
            combien: manquantes.length,
            nom: manquantes[0] && manquantes[0].obj.fileName,
            leDit: ecrits.some(t => /manquant/i.test(t)),
            nommeLeFichier: ecrits.includes('lecon-3.png'),
            plante,
            menu: !!document.getElementById('btn-retrouver-images')
        };
    });
    r.egal('une image sans fichier est repérée', trous.combien, 1);
    r.egal('avec le nom du fichier qui manque', trous.nom, 'lecon-3.png');
    r.verifie('le tableau le dit à la place de l\'image', trous.leDit, JSON.stringify(trous));
    r.verifie('et nomme le fichier attendu', trous.nommeLeFichier, JSON.stringify(trous));
    r.verifie('saisir sa poignée ne plante pas', !trous.plante, JSON.stringify(trous));
    r.verifie('le menu Importer propose de les retrouver', trous.menu);

    const rendu = await page.evaluate(async () => {
        const b64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJUlEQVR42u3NMQEAAAgDoC252R0eDCRQcndVAQCA/QMAAAAAgAcXvQQBtZPGigAAAABJRU5ErkJggg==';
        const bin = atob(b64); const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        // un fichier au mauvais nom ne rend rien
        retrouverLesImages([new File([u], 'autre-chose.png', { type: 'image/png' })]);
        await new Promise(r => setTimeout(r, 400));
        const apresMauvais = imagesManquantes().length;
        retrouverLesImages([new File([u], 'lecon-3.png', { type: 'image/png' })]);
        await new Promise(r => setTimeout(r, 600));
        return {
            apresMauvais,
            restantes: imagesManquantes().length,
            source: (images[0].src || '').slice(0, 15),
            dessinable: !!imageCache[images[0].src]
        };
    });
    r.egal('un fichier qui ne correspond pas ne rend rien', rendu.apresMauvais, 1);
    r.egal('le bon fichier rend son image', rendu.restantes, 0);
    r.verifie('elle retrouve sa source et redevient dessinable',
        rendu.source.startsWith('data:image') && rendu.dessinable, JSON.stringify(rendu));

    // --- LE POST-IT EN LISTE À COCHER ---
    // Le même papier, deux usages : la note qu'on écrit d'un trait, et la
    // liste de l'heure dont on raye les lignes au fur et à mesure.
    // Les essais précédents laissent une modale ouverte : elle couvrirait
    // le post-it et avalerait les clics de souris de ce qui suit.
    await page.evaluate(() => {
        // On masque, on ne supprime pas : les modales de la page (export,
        // confirmation…) servent aux essais suivants. Seules celles que le
        // code fabrique à la volée s'enlèvent.
        document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
        const cm = document.getElementById('class-manager-modal');
        if (cm) cm.remove();
    });

    const poserPostit = (contenu) => page.evaluate((c) => {
        htmlPostits.length = 0;
        htmlPostits.push({ id: nextId++, x: 200, y: 300, w: 320, h: 280, content: c, bg: '#fdfd96', z: globalZ++ });
        panX = 0; panY = 0; zoom = 1;
        renderHtmlPostits();
    }, contenu);

    await poserPostit('Rendre les copies\nDistribuer le DM\nAppeler les parents');
    await page.waitForTimeout(200);

    const enListe = await page.evaluate(() => {
        const bouton = document.querySelector('.btn-liste-postit');
        if (!bouton) return null;
        bouton.click();
        const p = htmlPostits[0];
        return {
            mode: p.mode,
            taches: p.taches.map(t => t.t),
            aucuneFaite: p.taches.every(t => !t.fait),
            lignes: document.querySelectorAll('.postit-tache').length,
            compteur: document.querySelector('.postit-avancement').textContent,
            noteCachee: getComputedStyle(document.querySelector('.html-postit-body')).display === 'none',
            ajouter: !!document.querySelector('.postit-ajouter')
        };
    });
    r.verifie('le post-it propose de devenir une liste', !!enListe, 'bouton absent');
    r.egal('chaque ligne écrite devient une tâche', enListe.taches,
        ['Rendre les copies', 'Distribuer le DM', 'Appeler les parents']);
    r.verifie('aucune n\'est faite au départ', enListe.aucuneFaite);
    r.egal('une ligne par tâche à l\'écran', enListe.lignes, 3);
    r.egal('l\'en-tête dit où l\'on en est', enListe.compteur, '0/3');
    r.verifie('la note libre s\'efface au profit de la liste', enListe.noteCachee);
    r.verifie('et l\'on peut ajouter une tâche', enListe.ajouter);

    // À LA VRAIE SOURIS. Les événements fabriqués ne déclenchent pas la
    // capture de pointeur : c'est justement elle qui cassait tout, l'en-tête
    // du post-it happait le clic de tout bouton qu'il ne connaissait pas
    // nommément. Ce passage doit donc rester en vraies entrées.
    const auMilieu = (sel, i) => page.evaluate(([s, n]) => {
        const el = document.querySelectorAll(s)[n];
        if (!el) throw new Error('absent : ' + s + ' #' + n);
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2, l: b.width, h: b.height };
    }, [sel, i || 0]);

    await page.evaluate(() => {                 // on repart d'une note libre
        document.querySelector('.btn-liste-postit').click();
        htmlPostits[0].content = 'Rendre les copies\nDistribuer le DM\nAppeler les parents';
        document.querySelector('.html-postit-body').value = htmlPostits[0].content;
    });
    await page.waitForTimeout(120);
    const posAvant = await page.evaluate(() => ({ x: htmlPostits[0].x, y: htmlPostits[0].y }));

    const surBouton = await auMilieu('.btn-liste-postit');
    await page.mouse.click(surBouton.x, surBouton.y);
    await page.waitForTimeout(250);
    const parLaSouris = await page.evaluate(() => ({
        mode: htmlPostits[0].mode,
        cases: document.querySelectorAll('.postit-case').length,
        x: htmlPostits[0].x, y: htmlPostits[0].y
    }));
    r.egal('un vrai clic sur ☑ passe la note en liste', parLaSouris.mode, 'liste');
    r.egal('avec une case par ligne', parLaSouris.cases, 3);
    r.verifie('et sans déplacer le post-it au passage',
        parLaSouris.x === posAvant.x && parLaSouris.y === posAvant.y,
        JSON.stringify({ posAvant, parLaSouris }));

    const surCase = await auMilieu('.postit-case', 1);
    await page.mouse.click(surCase.x, surCase.y);
    await page.waitForTimeout(250);
    const caseCochee = await page.evaluate(() => ({
        etats: htmlPostits[0].taches.map(t => t.fait),
        compteur: document.querySelector('.postit-avancement').textContent
    }));
    r.egal('un vrai clic sur une case la coche', caseCochee.etats, [false, true, false]);
    r.egal('et le compteur suit', caseCochee.compteur, '1/3');

    await page.evaluate(() => {                 // on rend la liste à ce qui suit
        htmlPostits[0].taches.forEach(t => { t.fait = false; });
        renderHtmlPostits();
        document.querySelector('.btn-liste-postit').click();
        document.querySelector('.btn-liste-postit').click();
    });
    await page.waitForTimeout(150);

    const cocher = await page.evaluate(() => {
        document.querySelectorAll('.postit-case')[0].click();
        const p = htmlPostits[0];
        return {
            fait: p.taches[0].fait,
            compteur: document.querySelector('.postit-avancement').textContent,
            rayee: document.querySelectorAll('.postit-tache')[0].classList.contains('faite'),
            lisible: document.querySelectorAll('.postit-tache-texte')[0].textContent
        };
    });
    r.verifie('cocher une case marque la tâche faite', cocher.fait);
    r.egal('le compteur suit', cocher.compteur, '1/3');
    r.verifie('la ligne est rayée', cocher.rayee);
    r.egal('mais reste lisible', cocher.lisible, 'Rendre les copies');

    const clavier = await page.evaluate(() => {
        const t = document.querySelectorAll('.postit-tache-texte')[2];
        t.focus();
        t.textContent = 'Appeler les parents de Léa';
        t.dispatchEvent(new Event('input', { bubbles: true }));
        t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        const apresEntree = htmlPostits[0].taches.length;
        // une ligne vide effacée avec Retour arrière disparaît
        const vide = document.querySelectorAll('.postit-tache-texte')[3];
        vide.focus();
        vide.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
        return {
            apresEntree, apresRetour: htmlPostits[0].taches.length,
            texteGarde: htmlPostits[0].taches[2].t
        };
    });
    r.egal('Entrée ouvre la ligne suivante', clavier.apresEntree, 4);
    r.egal('Retour arrière sur une ligne vide la referme', clavier.apresRetour, 3);
    r.egal('sans abîmer la ligne d\'avant', clavier.texteGarde, 'Appeler les parents de Léa');

    const toutFait = await page.evaluate(() => {
        document.querySelectorAll('.postit-case').forEach(c => {
            const ligne = c.closest('.postit-tache');
            if (!ligne.classList.contains('faite')) c.click();
        });
        const a = document.querySelector('.postit-avancement');
        return { texte: a.textContent, fini: a.classList.contains('fini') };
    });
    r.egal('tout coché, le compteur est plein', toutFait.texte, '3/3');
    r.verifie('et il se voit', toutFait.fini);

    const retour = await page.evaluate(() => {
        document.querySelector('.btn-liste-postit').click();
        const p = htmlPostits[0];
        return {
            mode: p.mode, contenu: p.content,
            valeur: document.querySelector('.html-postit-body').value,
            visible: getComputedStyle(document.querySelector('.html-postit-body')).display !== 'none',
            compteur: document.querySelector('.postit-avancement').textContent
        };
    });
    r.egal('on revient à la note libre', retour.mode, 'texte');
    r.verifie('sans rien perdre : chaque tâche redevient une ligne',
        /Rendre les copies/.test(retour.contenu) && /Appeler les parents de Léa/.test(retour.contenu),
        retour.contenu);
    r.verifie('celles qui étaient faites gardent leur marque',
        (retour.contenu.match(/✔/g) || []).length === 3, retour.contenu);
    r.verifie('le texte est bien celui qu\'on lit dans le post-it', retour.valeur === retour.contenu);
    r.verifie('la note redevient visible', retour.visible);
    r.egal('et le compteur s\'efface', retour.compteur, '');

    const relecture = await page.evaluate(async () => {
        // On repasse en liste, on enregistre, et on refait le tableau à neuf :
        // un post-it rouvert doit retrouver ses cases.
        document.querySelector('.btn-liste-postit').click();
        saveState();
        const copie = JSON.parse(JSON.stringify(htmlPostits));
        htmlPostits.length = 0;
        renderHtmlPostits();
        copie.forEach(c => htmlPostits.push(c));
        renderHtmlPostits();
        await new Promise(r => setTimeout(r, 250));
        return {
            mode: htmlPostits[0].mode,
            lignes: document.querySelectorAll('.postit-tache').length,
            compteur: document.querySelector('.postit-avancement').textContent
        };
    });
    r.egal('rouvert, le post-it est toujours une liste', relecture.mode, 'liste');
    r.egal('avec ses tâches', relecture.lignes, 3);
    r.egal('et son avancement', relecture.compteur, '3/3');

    // --- CE QU'ON TAPE DANS UN POST-IT ARRIVE-T-IL SUR LE DISQUE ? ---
    // La saisie n'ajoutait volontairement pas d'entrée d'annulation (ce serait
    // illisible), mais elle ne déclenchait aucun enregistrement non plus : le
    // texte ne partait sur le disque qu'au moment où l'on cliquait ailleurs.
    // Taper puis recharger le perdait.
    const frappe = await page.evaluate(async () => {
        const o = htmlPostits[0];
        o.mode = 'texte'; o.content = '';
        const el = document.querySelector('.html-postit');
        if (el) el.dataset.modeAffiche = '';
        renderHtmlPostits();
        await new Promise(r => setTimeout(r, 100));

        // On vide la file d'attente : sans cela, une sauvegarde déjà
        // programmée par un essai précédent écrirait le texte toute seule et
        // l'essai passerait même si la saisie n'enregistre rien.
        await saveAppLocal(true);

        const zone = document.querySelector('.html-postit-body');
        zone.value = 'Tapé sans quitter le post-it';
        zone.dispatchEvent(new Event('input', { bubbles: true }));   // aucun blur, aucun change
        await new Promise(r => setTimeout(r, 2200));                  // la temporisation fait son travail

        const s = await localforage.getItem('AuTableau_AutoSave');
        const pst = s && s.pages && s.pages[currentPageIndex] && s.pages[currentPageIndex].htmlPostits;
        const memePostit = (pst || []).find(x => x.id === o.id);
        return { enMemoire: o.content, surLeDisque: memePostit && memePostit.content };
    });
    r.egal('le texte tapé est bien en mémoire', frappe.enMemoire, 'Tapé sans quitter le post-it');
    r.egal('et il arrive sur le disque sans qu\'on ait cliqué ailleurs',
        frappe.surLeDisque, 'Tapé sans quitter le post-it');

    const frappeListe = await page.evaluate(async () => {
        const o = htmlPostits[0];
        o.mode = 'liste'; o.taches = [{ t: 'Avant', fait: false }];
        const el = document.querySelector('.html-postit');
        if (el) el.dataset.modeAffiche = '';
        renderHtmlPostits();
        await new Promise(r => setTimeout(r, 100));

        await saveAppLocal(true);

        const ligne = document.querySelector('.postit-tache-texte');
        ligne.textContent = 'Tâche écrite';
        ligne.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 2200));

        const s = await localforage.getItem('AuTableau_AutoSave');
        const pst = s && s.pages && s.pages[currentPageIndex] && s.pages[currentPageIndex].htmlPostits;
        const memePostit = (pst || []).find(x => x.id === o.id);
        return memePostit && memePostit.taches && memePostit.taches[0] && memePostit.taches[0].t;
    });
    r.egal('une tâche écrite arrive aussi sur le disque', frappeListe, 'Tâche écrite');

    // --- LA BARRE DU POST-IT ---
    // Les trois boutons de police encombraient une barre de 28 px pour un
    // réglage qu'on touche une fois par an. Le titre les remplace.
    const barre = await page.evaluate(() => ({
        boutonsPolice: document.querySelectorAll('.btn-font-plus, .btn-font-minus, .btn-font-cycle').length,
        copier: !!document.querySelector('.btn-copier-postit'),
        coller: !!document.querySelector('.btn-coller-postit'),
        // « cursive » retombait sur une serif d'imprimerie sur la plupart des
        // machines : le post-it avait l'air d'un vieux livre.
        police: getComputedStyle(document.querySelector('.html-postit-body')).fontFamily
    }));
    r.egal('les boutons de police ont disparu de la barre', barre.boutonsPolice, 0);
    r.verifie('un bouton copier les remplace', barre.copier);
    r.verifie('et un bouton coller', barre.coller);
    r.verifie('la note s\'écrit dans la police de l\'application, pas en serif',
        // « sans-serif » en dernier recours est très bien ; c'est « serif »
        // tout court, et « cursive », qui donnaient l'air vieillot.
        /Nunito/.test(barre.police) && !/cursive/.test(barre.police)
        && !/(^|,\s*)serif\s*$/.test(barre.police.trim()), barre.police);

    const titre = await page.evaluate(() => {
        const entete = document.querySelector('.html-postit-header');
        entete.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        const champ = document.querySelector('.postit-titre-champ');
        if (!champ) return { champ: false };
        champ.value = 'Séance de lundi';
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        return {
            champ: true,
            enMemoire: htmlPostits[0].titre,
            affiche: (document.querySelector('.postit-titre') || {}).textContent,
            refermé: !document.querySelector('.postit-titre-champ')
        };
    });
    r.verifie('un double-clic sur la barre ouvre le titre', titre.champ, JSON.stringify(titre));
    r.egal('le titre saisi est retenu', titre.enMemoire, 'Séance de lundi');
    r.egal('et affiché dans la barre', titre.affiche, 'Séance de lundi');
    r.verifie('le champ se referme après Entrée', titre.refermé);

    // Un texte venu d'un traitement de texte arrive en CRLF, souvent avec une
    // ligne vide entre chaque ligne : la note doublait de longueur.
    const colle = await page.evaluate(() => {
        const o = htmlPostits[0];
        o.mode = 'texte'; o.content = 'Départ'; o.taches = [];
        renderHtmlPostits();
        const zone = document.querySelector('.html-postit-body');
        zone.value = 'Départ';
        const presse = new DataTransfer();
        presse.setData('text/plain', 'Un\r\n\r\nDeux\r\n\r\nTrois\r\n');
        zone.selectionStart = zone.selectionEnd = zone.value.length;
        zone.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: presse }));
        return { valeur: zone.value, enMemoire: htmlPostits[0].content };
    });
    r.egal('le collage ne laisse pas une ligne vide sur deux',
        colle.valeur, 'DépartUn\nDeux\nTrois');
    r.egal('et la note retient ce qu\'elle affiche', colle.enMemoire, colle.valeur);

    // La liste n'est repeinte que lorsque le mode change — c'est voulu, sinon
    // on effacerait ce que l'enseignant est en train d'écrire. Dans les essais,
    // on modifie les tâches par la bande : il faut donc forcer le repeint.
    // Les cases se calculaient sur la police par défaut des boutons (13,3 px)
    // et non sur celle de la tâche : trop petites, et 4,5 px trop haut.
    const alignement = await page.evaluate(() => {
        const o = htmlPostits[0];
        o.mode = 'liste'; o.taches = [{ t: 'Rendre les copies', fait: false }];
        const el = document.querySelector('.html-postit'); if (el) el.dataset.modeAffiche = '';
        renderHtmlPostits();
        const c = document.querySelector('.postit-case');
        const t = document.querySelector('.postit-tache-texte');
        const rc = c.getBoundingClientRect(), rt = t.getBoundingClientRect();
        return {
            memePolice: getComputedStyle(c).fontSize === getComputedStyle(t).fontSize,
            ecart: Math.abs((rc.top + rc.height / 2) - (rt.top + rt.height / 2))
        };
    });
    r.verifie('la case reprend la police de la tâche', alignement.memePolice, JSON.stringify(alignement));
    r.verifie('elle est centrée sur la ligne', alignement.ecart < 1.5, String(alignement.ecart));

    // Le tableau interdit la sélection partout ; dans la liste on la rend,
    // sinon on ne peut rien prendre pour le coller dans un autre logiciel.
    const selection = await page.evaluate(() => {
        const o = htmlPostits[0];
        o.mode = 'liste';
        o.taches = [{ t: 'Un', fait: false }, { t: 'Deux', fait: false }];
        const el = document.querySelector('.html-postit'); if (el) el.dataset.modeAffiche = '';
        renderHtmlPostits();
        const liste = document.querySelector('.html-postit-liste');
        const t = document.querySelector('.postit-tache-texte');
        const r2 = document.createRange();
        r2.selectNodeContents(liste);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r2);
        return {
            selectionnable: getComputedStyle(liste).userSelect === 'text'
                         && getComputedStyle(t).userSelect === 'text',
            traverse: /Un[\s\S]*Deux/.test(sel.toString()),
            // une ligne n'est éditable qu'au clic : c'est ce qui rend la
            // sélection possible d'une ligne à l'autre
            editableAuRepos: t.getAttribute('contenteditable'),
            croixHorsSelection: getComputedStyle(document.querySelector('.postit-tache-oter')).userSelect === 'none'
        };
    });
    r.verifie('la liste est sélectionnable', selection.selectionnable, JSON.stringify(selection));
    r.verifie('et la sélection traverse les lignes', selection.traverse, JSON.stringify(selection));
    r.egal('une ligne au repos n\'est pas une zone d\'édition', selection.editableAuRepos, null);
    r.verifie('les croix de suppression ne partent pas dans la copie', selection.croixHorsSelection);

    const saisie = await page.evaluate(() => {
        const t = document.querySelector('.postit-tache-texte');
        t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
        const pendant = t.getAttribute('contenteditable');
        t.textContent = 'Un modifié';
        t.dispatchEvent(new Event('blur'));
        return { pendant, apres: t.getAttribute('contenteditable'), retenu: htmlPostits[0].taches[0].t };
    });
    r.egal('cliquer dedans ouvre la saisie', saisie.pendant, 'true');
    r.egal('quitter la referme', saisie.apres, null);
    r.egal('et ce qu\'on a écrit est retenu', saisie.retenu, 'Un modifié');

    const colleListe = await page.evaluate(() => {
        const o = htmlPostits[0];
        o.mode = 'liste'; o.taches = [{ t: 'Déjà là', fait: false }];
        const el = document.querySelector('.html-postit'); if (el) el.dataset.modeAffiche = '';
        renderHtmlPostits();
        const ligne = document.querySelector('.postit-tache-texte');
        const presse = new DataTransfer();
        presse.setData('text/plain', 'Quatre\r\n\r\nCinq\r\nSix');
        ligne.textContent = '';
        ligne.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: presse }));
        return htmlPostits[0].taches.map(t => t.t);
    });
    r.egal('collé dans une liste, chaque ligne devient une tâche',
        colleListe, ['Quatre', 'Cinq', 'Six']);

    await page.evaluate(() => { htmlPostits.length = 0; renderHtmlPostits(); });

    // --- L'ANCRE : AU TABLEAU OU À L'ÉCRAN ---
    // Deux usages opposés du même papier. Une consigne d'exercice appartient à
    // l'endroit du tableau où l'exercice est posé ; le plan de l'heure, lui,
    // doit rester sous les yeux quoi qu'on regarde.
    const ancre = await page.evaluate(async () => {
        htmlPostits.length = 0;
        htmlPostits.push({ id: nextId++, x: 300, y: 250, w: 300, h: 220, bg: '#fdfd96',
                           z: globalZ++, content: 'Consigne' });
        panX = 0; panY = 0; zoom = 1;
        renderHtmlPostits();
        await new Promise(r => setTimeout(r, 150));
        const el = () => document.querySelector('.html-postit');
        const ou = () => { const r = el().getBoundingClientRect();
                           return { x: Math.round(r.left), y: Math.round(r.top), l: Math.round(r.width) }; };

        const depart = ou();
        panX = -150; panY = -80; renderHtmlPostits();
        const apresDeplacement = ou();
        zoom = 1.5; renderHtmlPostits();
        const apresZoom = ou();

        panX = 0; panY = 0; zoom = 1; renderHtmlPostits();
        document.querySelector('.btn-ancre-postit').click();
        await new Promise(r => setTimeout(r, 150));
        const fixe = { ou: ou(), ancre: htmlPostits[0].ancre,
                       icone: document.querySelector('.btn-ancre-postit').textContent,
                       lisere: el().classList.contains('postit-fixe') };

        panX = -400; panY = -300; zoom = 2; renderHtmlPostits();
        const fixeApres = ou();

        document.querySelector('.btn-ancre-postit').click();
        await new Promise(r => setTimeout(r, 150));
        const revenu = htmlPostits[0].ancre;

        panX = 0; panY = 0; zoom = 1; htmlPostits.length = 0; renderHtmlPostits();
        return { depart, apresDeplacement, apresZoom, fixe, fixeApres, revenu };
    });
    r.egal('attaché au tableau, il suit le déplacement',
        ancre.apresDeplacement, { x: 150, y: 170, l: 300 });
    r.egal('et grandit avec le zoom', ancre.apresZoom.l, 450);
    r.egal('un clic sur l\'épingle le fixe à l\'écran', ancre.fixe.ancre, 'ecran');
    r.egal('l\'épingle change', ancre.fixe.icone, '📍');
    r.verifie('un liséré le distingue', ancre.fixe.lisere);
    r.egal('fixé, il ne bouge pas d\'un pixel quand le tableau se déplace et zoome',
        ancre.fixeApres, ancre.fixe.ou);
    r.egal('et l\'épingle le rend au tableau', ancre.revenu, 'tableau');

    // --- LA TAILLE ANNONCÉE À L'EXPORT ---
    // « savedTableaux » n'est que la liste des tableaux : leur contenu vit à
    // part, sous « data_<id> ». On lisait t.data, qui n'existe pas, et l'on
    // annonçait « 0 octets » quel que soit le travail enregistré.
    const tailleExport = await page.evaluate(async () => {
        const gros = { pages: [{ points: [], segments: [], circles: [], rectangles: [], texts: [],
            freehands: [{ id: 1, points: Array.from({ length: 400 }, (_, i) => ({ x: i, y: i })), z: 1 }],
            curves: [], polygons: [], arcs: [], htmlPostits: [],
            images: [{ id: 2, x: 0, y: 0, w: 10, h: 10, cx: 0, cy: 0, cw: 10, ch: 10, srcRef: 'a', z: 2 }] }],
            assets: { a: 'data:image/png;base64,' + 'B'.repeat(4000) }, nextId: 3, globalZ: 3, currentBgIndex: 0 };
        await localforage.setItem('data_gros', gros);
        savedTableaux = [{ id: 'gros', name: 'Un vrai cours', timestamp: Date.now() }];

        await promptExportWorkspace();
        const texte = document.getElementById('ws-options-text').innerText;
        const boutons = Array.from(document.querySelectorAll('#workspace-options-modal button'))
            .map(b => b.textContent.trim());
        document.getElementById('workspace-options-modal').style.display = 'none';
        return { texte, boutons };
    });
    r.verifie('la taille annoncée n\'est plus nulle',
        !/0 octets/.test(tailleExport.texte), tailleExport.texte.replace(/\s+/g, ' ').slice(0, 120));
    r.verifie('elle compte les images dans la version complète',
        /Avec images\/PDFs *: *[0-9]/.test(tailleExport.texte.replace(/\s+/g, ' ')),
        tailleExport.texte.replace(/\s+/g, ' ').slice(0, 120));
    r.verifie('les boutons portent eux aussi un poids réel',
        tailleExport.boutons.some(b => /Complet \([0-9]/.test(b))
        && !tailleExport.boutons.some(b => /\(0 octets\)/.test(b)),
        tailleExport.boutons.join(' | '));

    // --- UN TABLEAU ENREGISTRÉ AVANT QUE LA FEUILLE SACHE OÙ ELLE EST ---
    // Sa feuille se dessinait à l'origine du tableau, à mille pixels du
    // travail : on rouvrait son cours et l'écran paraissait vide.
    const vieuxFichier = await page.evaluate(async () => {
        const vieux = { nextId: 50, globalZ: 50, currentBgIndex: backgrounds.indexOf('seyes-marge'),
            pages: [{ points: [{ id: 1, x: 1700, y: 1200, z: 1 }, { id: 2, x: 2100, y: 1500, z: 2 }],
                segments: [{ id: 3, p1_id: 1, p2_id: 2, z: 3 }],
                circles: [], rectangles: [], texts: [], freehands: [], curves: [], polygons: [],
                images: [], arcs: [], htmlPostits: [], panX: -1500, panY: -1000, zoom: 1 }] };
        await localforage.setItem('data_vieux', vieux);
        savedTableaux = [{ id: 'vieux', name: 'Cours de l\'an dernier', timestamp: Date.now() }];
        loadBoard('vieux');
        await new Promise(r => setTimeout(r, 500));
        const t = boiteDuTravail();
        return {
            fond: backgrounds[currentBgIndex],
            feuille: { x: Math.round(origineFeuille.x), y: Math.round(origineFeuille.y) },
            surLaFeuille: !!(t && t.x >= origineFeuille.x && t.x + t.l <= origineFeuille.x + PAGE_L
                          && t.y >= origineFeuille.y && t.y + t.h <= origineFeuille.y + PAGE_H),
            retenue: pages[0].origineFeuille && Math.round(pages[0].origineFeuille.x)
        };
    });
    r.egal('le fond enregistré revient bien', vieuxFichier.fond, 'seyes-marge');
    r.verifie('sa feuille se replace autour du travail plutôt qu\'à l\'origine',
        vieuxFichier.feuille.x !== 0 && vieuxFichier.surLaFeuille, JSON.stringify(vieuxFichier));
    r.egal('et la position réparée est retenue', vieuxFichier.retenue, vieuxFichier.feuille.x);

    // --- Sélection par lot dans l'explorateur ---
    const poserDesTableaux = () => page.evaluate(() => {
        savedTableaux = [
            { id: 'dossier_a', type: 'folder', name: 'Sixièmes', timestamp: 9 },
            { id: 's1', name: 'Séance 1', timestamp: 8 },
            { id: 's2', name: 'Séance 2', timestamp: 7 },
            { id: 's3', name: 'Séance 3', timestamp: 6 },
            { id: 's4', name: 'Séance 4', timestamp: 5 }
        ];
        currentExplorerTab = 'tableaux';
        lotExplorateur.clear(); dernierClique = null;
        document.getElementById('explorer-search-bar').value = '';
        renderExplorerLists();
    });
    const clic = (id, mods = {}) => page.evaluate(([i, m]) => {
        const lignes = Array.from(document.querySelectorAll('#file-tree-container .tree-item'));
        const cible = lignes.find(l => (l.querySelector('.label') || {}).textContent === i);
        if (!cible) return false;
        cible.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true }, m)));
        return true;
    }, [id, mods]);
    const etatDuLot = () => page.evaluate(() => ({
        lot: [...lotExplorateur].sort(),
        peints: document.querySelectorAll('#file-tree-container .tree-item.du-lot').length,
        barre: !document.getElementById('exp-lot').hidden,
        compte: document.getElementById('exp-lot-compte').textContent
    }));

    await poserDesTableaux();
    await clic('Séance 1');
    await clic('Séance 3', { ctrlKey: true });
    let lot = await etatDuLot();
    r.egal('Ctrl+clic ajoute un second tableau au lot', lot.lot, ['s1', 's3']);
    r.egal('les deux lignes sont marquées', lot.peints, 2);
    r.verifie('et la barre du lot apparaît', lot.barre && /2 tableaux/.test(lot.compte), lot.compte);

    await clic('Séance 3', { ctrlKey: true });
    lot = await etatDuLot();
    r.egal('un second Ctrl+clic le retire', lot.lot, ['s1']);
    r.egal('un lot réduit à un seul fichier ne se peint plus en lot', lot.peints, 0);
    r.verifie('et la barre se referme sous deux éléments', !lot.barre);

    await poserDesTableaux();
    await clic('Séance 1');
    await clic('Séance 4', { shiftKey: true });
    lot = await etatDuLot();
    r.egal('Maj+clic prend toute la tranche', lot.lot, ['s1', 's2', 's3', 's4']);

    // Ranger le lot : la destination vient de la boîte de réglages maison
    const range = await page.evaluate(() => {
        rangerLeLot();
        const titre = document.getElementById('custom-prompt-title').innerText;
        const select = document.querySelector('#custom-prompt-inputs select');
        const choix = Array.from(select.options).map(o => o.textContent);
        select.value = 'dossier_a';
        document.getElementById('custom-prompt-ok').click();
        return {
            titre, choix,
            ranges: savedTableaux.filter(t => t.parentId === 'dossier_a').map(t => t.id).sort(),
            lot: lotExplorateur.size
        };
    });
    r.verifie('« Ranger » propose la racine et les dossiers',
        range.choix.length === 2 && /Sixi/.test(range.choix[1]), JSON.stringify(range.choix));
    r.egal('les quatre séances atterrissent dans le dossier', range.ranges, ['s1', 's2', 's3', 's4']);
    r.egal('et le lot est relâché après le rangement', range.lot, 0);

    // Supprimer le lot : une seule question, dans la modale du logiciel
    await poserDesTableaux();
    await clic('Séance 2');
    await clic('Séance 4', { shiftKey: true });
    const jete = await page.evaluate(async () => {
        const p = jeterLeLot();
        await new Promise(r => setTimeout(r, 50));
        const boite = document.getElementById('confirm-modal');
        const visible = getComputedStyle(boite).display === 'flex';
        const texte = document.getElementById('confirm-text').innerText;
        document.getElementById('confirm-yes-btn').click();
        await p;
        return {
            visible, texte,
            corbeille: savedTableaux.filter(t => t.deleted).map(t => t.id).sort(),
            restants: savedTableaux.filter(t => !t.deleted && t.type !== 'folder').map(t => t.id)
        };
    });
    r.verifie('la suppression passe par la modale, pas par confirm()',
        jete.visible && /3 éléments/.test(jete.texte), JSON.stringify(jete));
    r.egal('les trois séances partent à la corbeille', jete.corbeille, ['s2', 's3', 's4']);
    r.egal('la première est intacte', jete.restants, ['s1']);

    // GLISSER LE LOT DANS LA CORBEILLE. On pouvait composer une sélection de
    // douze tableaux, la tirer vers la corbeille, et n'en voir partir qu'UN :
    // le glissement ne portait que la ligne tenue, le reste restait en place
    // sans que rien ne le dise.
    await poserDesTableaux();
    await clic('Séance 1');
    await clic('Séance 3', { shiftKey: true });
    const tireDansLaCorbeille = await page.evaluate(() => {
        const lot = [...lotExplorateur];
        // On rejoue ce que fait le navigateur : on prend une ligne du lot,
        // puis on lâche sur la corbeille.
        const ligne = [...document.querySelectorAll('#file-tree-container .tree-item')]
            .find(el => /Séance 2/.test(el.textContent));
        const paquet = { effectAllowed: '', setData: () => { } };
        ligne.ondragstart({ dataTransfer: paquet, preventDefault: () => { } });
        const tenu = Array.isArray(lotGlisse) ? lotGlisse.length : 0;
        handleTrashDrop({
            preventDefault: () => { },
            currentTarget: { style: {} }
        });
        return {
            lot: lot.length, tenu,
            corbeille: savedTableaux.filter(t => t.deleted).map(t => t.id).sort(),
            restants: savedTableaux.filter(t => !t.deleted && t.type !== 'folder').map(t => t.id).sort(),
            lotRelache: lotExplorateur.size
        };
    });
    r.egal('le glissement emporte tout le lot, pas la seule ligne tenue',
        { lot: tireDansLaCorbeille.lot, tenu: tireDansLaCorbeille.tenu }, { lot: 3, tenu: 3 });
    r.egal('les trois séances tirées atterrissent à la corbeille',
        tireDansLaCorbeille.corbeille, ['s1', 's2', 's3']);
    r.egal('celle qu\'on n\'avait pas prise reste en place', tireDansLaCorbeille.restants, ['s4']);
    r.egal('et le lot est relâché après le geste', tireDansLaCorbeille.lotRelache, 0);

    // Une ligne HORS du lot ne doit emporter qu'elle-même : sinon glisser un
    // tableau après en avoir sélectionné d'autres en jetterait douze.
    await poserDesTableaux();
    await clic('Séance 1');
    await clic('Séance 2', { ctrlKey: true });
    const horsLot = await page.evaluate(() => {
        const ligne = [...document.querySelectorAll('#file-tree-container .tree-item')]
            .find(el => /Séance 4/.test(el.textContent));
        ligne.ondragstart({ dataTransfer: { effectAllowed: '', setData: () => { } }, preventDefault: () => { } });
        handleTrashDrop({ preventDefault: () => { }, currentTarget: { style: {} } });
        return {
            corbeille: savedTableaux.filter(t => t.deleted).map(t => t.id).sort(),
            restants: savedTableaux.filter(t => !t.deleted && t.type !== 'folder').map(t => t.id).sort()
        };
    });
    r.egal('glisser une ligne hors du lot n\'emporte qu\'elle',
        { c: horsLot.corbeille, r: horsLot.restants },
        { c: ['s4'], r: ['s1', 's2', 's3'] });

    // Renoncer laisse tout en place
    await poserDesTableaux();
    await clic('Séance 1');
    await clic('Séance 2', { ctrlKey: true });
    const renonce = await page.evaluate(async () => {
        const p = jeterLeLot();
        await new Promise(r => setTimeout(r, 50));
        document.getElementById('confirm-cancel-btn').click();
        await p;
        return savedTableaux.filter(t => t.deleted).length;
    });
    r.egal('« Annuler » ne jette rien', renonce, 0);

    // Plus aucune boîte du navigateur : elles figent la page au vidéoprojecteur
    const natives = await page.evaluate(() => ({
        alerte: typeof window.__natifAppele, // jamais défini : garde-fou du test
        aide: typeof demanderConfirmation === 'function'
            && typeof demanderUneLigne === 'function'
            && typeof prevenir === 'function'
    }));
    r.verifie('les trois modales maison sont disponibles', natives.aide);

    // La boîte de confirmation retrouve ses deux boutons après un détournement
    const reparee = await page.evaluate(async () => {
        promptDeleteItem('s1', 'tableaux');   // remplace les boutons par les siens
        document.getElementById('confirm-modal').style.display = 'none';
        let ouverte = false;
        const p = demanderConfirmation('Question', 'Une question ordinaire')
            .then(v => { ouverte = v; });
        await new Promise(r => setTimeout(r, 30));
        const boutons = {
            oui: !!document.getElementById('confirm-yes-btn'),
            non: !!document.getElementById('confirm-cancel-btn')
        };
        document.getElementById('confirm-yes-btn').click();
        await p;
        return { boutons, ouverte };
    });
    r.verifie('après une modale sur mesure, la question ordinaire retrouve ses boutons',
        reparee.boutons.oui && reparee.boutons.non, JSON.stringify(reparee));
    r.verifie('et le « Confirmer » répond bien oui', reparee.ouverte === true);

    // --- Un glissement dans l'arborescence ne doit rien figer ---
    // Le clic simple repeint l'arbre 300 ms plus tard : s'il aboutissait
    // pendant le glissement, il arrachait du DOM la ligne tenue par la souris,
    // le navigateur restait coincé en glissement et plus rien ne répondait.
    await poserDesTableaux();
    const glisse = await page.evaluate(async () => {
        const ligne = (nom) => Array.from(document.querySelectorAll('#file-tree-container .tree-item'))
            .find(l => (l.querySelector('.label') || {}).textContent === nom);
        const source = ligne('Séance 1');
        source.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // arme le minuteur
        const dt = new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        await new Promise(r => setTimeout(r, 400));                          // le minuteur tombe
        const survitAuMinuteur = document.contains(source);

        const dossier = ligne('Sixièmes');
        dossier.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
        const survitAuDepot = document.contains(source);
        source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        await new Promise(r => setTimeout(r, 20));

        return {
            survitAuMinuteur, survitAuDepot,
            range: (savedTableaux.find(t => t.id === 's1') || {}).parentId,
            repeint: !document.contains(source),
            voile: getComputedStyle(document.getElementById('drop-overlay')).display,
            enCours: glissementDansLArbre
        };
    });
    r.verifie('la ligne glissée survit au minuteur du clic simple', glisse.survitAuMinuteur);
    r.verifie('et au dépôt lui-même', glisse.survitAuDepot);
    r.egal('le tableau est bien rangé dans le dossier', glisse.range, 'dossier_a');
    r.verifie('l\'arbre se repeint une fois le glissement fini', glisse.repeint);
    r.verifie('le glissement est refermé', glisse.enCours === false);

    // Le voile « Relâchez l'image ou le PDF ici » ne s'invite pas dans le
    // tiroir, et il disparaît quoi qu'il arrive au glissement.
    const voile = await page.evaluate(async () => {
        const voileEl = document.getElementById('drop-overlay');
        const dt = new DataTransfer();
        dt.setData('application/json', JSON.stringify({ type: 'board', id: 's2' }));
        const dansLeTiroir = document.querySelector('#file-tree-container .tree-item');
        dansLeTiroir.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
        const surLeTiroir = getComputedStyle(voileEl).display;

        document.getElementById('board').dispatchEvent(
            new DragEvent('dragover', { bubbles: true, dataTransfer: dt }));
        const surLaFeuille = getComputedStyle(voileEl).display;

        // Glissement abandonné : ni dépôt, ni sortie de fenêtre, juste Échap
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return { surLeTiroir, surLaFeuille, apresEchap: getComputedStyle(voileEl).display };
    });
    r.egal('le voile de dépôt reste absent au-dessus du tiroir', voile.surLeTiroir, 'none');
    r.egal('mais s\'affiche bien au-dessus de la feuille', voile.surLaFeuille, 'flex');
    r.egal('et Échap le fait disparaître', voile.apresEchap, 'none');

    // --- LE LECTEUR : REJOUER LA SÉANCE ---
    // L'historique garde déjà les états successifs du tableau. Les repasser
    // dans l'ordre, c'est refaire la construction devant la classe.
    await page.evaluate(() => {
        points.length = 0; segments.length = 0; texts.length = 0; freehands.length = 0;
        images.length = 0; circles.length = 0; rectangles.length = 0; polygons.length = 0;
        history.length = 0; historyIndex = -1;
        saveState();
        for (let i = 0; i < 6; i++) {
            freehands.push({ id: nextId++, points: [{ x: 100 + i * 60, y: 200, p: .5 }, { x: 140 + i * 60, y: 320, p: .5 }],
                             color: '#000', width: 4, z: globalZ++ });
            saveState();
        }
        draw();
    });
    const etatLecteur = () => page.evaluate(() => ({
        ouvert: lectureOuverte, index: lectureIndex, etapes: history.length,
        traits: freehands.length, marche: lectureEnMarche,
        bande: getComputedStyle(document.getElementById('bande-lecture')).display !== 'none',
        compte: (document.getElementById('lecture-compte') || {}).textContent
    }));

    await page.click('#btn-lecture');
    await page.waitForTimeout(200);
    const ouvert = await etatLecteur();
    r.verifie('le bouton lecture ouvre la bande', ouvert.ouvert && ouvert.bande, JSON.stringify(ouvert));
    r.egal('elle s\'ouvre là où l\'on en est, pas au début', ouvert.compte, '7 / 7');

    // Revenir au début : le tableau se vide, puisque c'est ainsi qu'il a commencé.
    await page.evaluate(() => poserEtapeDeLecture(0));
    await page.waitForTimeout(150);
    const debut = await etatLecteur();
    r.egal('revenir au début rend le tableau vide', debut.traits, 0);

    // LA BARRE D'ESPACE avance d'une étape : c'est le geste qu'on veut devant
    // une classe — on commente, on appuie, on commente.
    await page.evaluate(() => document.getElementById('board').focus());
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const troisPas = await etatLecteur();
    r.egal('trois appuis sur Espace font paraître trois traits', troisPas.traits, 3);
    await page.keyboard.press('Shift+Space');
    await page.waitForTimeout(150);
    r.egal('Maj+Espace revient d\'une étape', (await etatLecteur()).traits, 2);

    // LA LECTURE AUTOMATIQUE : elle avance seule, et s'arrête au bout.
    await page.evaluate(() => { reglerLaVitesse(10); poserEtapeDeLecture(0); lireOuPause(); });
    await page.waitForTimeout(300);
    const enMarche = await etatLecteur();
    r.verifie('la lecture automatique démarre', enMarche.marche, JSON.stringify(enMarche));
    await page.waitForTimeout(2600);
    const finie = await etatLecteur();
    r.verifie('elle va jusqu\'au bout puis s\'arrête toute seule',
        !finie.marche && finie.index === finie.etapes - 1, JSON.stringify(finie));

    // CE QUI COMPTE LE PLUS : rejouer ne doit RIEN abîmer. Ni le travail en
    // cours, ni ce qui est enregistré sur le disque. Un enseignant doit pouvoir
    // rejouer au milieu d'un cours sans rien risquer.
    const pendant = await page.evaluate(async () => {
        const vraie = window.saveAppLocal;
        let ecritures = 0;
        window.saveAppLocal = function (...a) { ecritures++; return vraie.apply(this, a); };
        const avantHist = history.length;
        poserEtapeDeLecture(0);
        poserEtapeDeLecture(3);
        lireOuPause(); await new Promise(ok => setTimeout(ok, 800)); arreterLaLecture();
        window.saveAppLocal = vraie;
        return { ecritures, histAvant: avantHist, histApres: history.length };
    });
    r.egal('rejouer n\'écrit jamais sur le disque', pendant.ecritures, 0);
    r.egal('et n\'ajoute aucune étape à l\'historique', pendant.histApres, pendant.histAvant);

    // LE CURSEUR D'IMAGE SE TIRE À LA MAIN. Il ne bougeait pas : la lecture
    // était arrêtée AVANT que l'on lise la valeur, or arrêter repeint la bande
    // et remet le curseur où il était — on relisait donc toujours l'ancienne
    // position, et il revenait sous le doigt.
    await page.evaluate(() => {
        poserEtapeDeLecture(history.length - 1);
        // Les bulles seulement : leur conteneur, lui, reste en place.
        document.querySelectorAll('.toast').forEach(t => t.remove());
    });
    const rail = await page.locator('#lecture-curseur').boundingBox();
    await page.mouse.move(rail.x + rail.width * 0.9, rail.y + rail.height / 2);
    await page.mouse.down();
    await page.mouse.move(rail.x + rail.width * 0.1, rail.y + rail.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const tire = await etatLecteur();
    r.verifie('le curseur d\'image se tire à la main, et le tableau suit',
        tire.index < 2 && tire.traits === tire.index, JSON.stringify(tire));

    // ===================================================================
    // LA VITESSE, EN ÉCHELLE LOGARITHMIQUE
    // Le curseur allait de ×0,5 à ×5 par crans réguliers : le « lent » faisait
    // 1,4 s par étape, alors qu'on commente une construction au rythme de
    // plusieurs SECONDES par geste. Et l'échelle régulière donnait tout son
    // parcours au rapide.
    // ===================================================================
    const vitesses = await page.evaluate(() => {
        const lu = () => document.getElementById('lecture-vitesse-lue').textContent;
        const auCran = (p) => { reglerLaVitesseAuCran(p); return { cran: p, delai: delaiDeLecture(), facteur: +lectureVitesse.toFixed(3), lu: lu() }; };
        const releve = [0, 25, 50, 75, 100].map(auCran);
        reglerLaVitesse(1);
        return { releve, unDelai: delaiDeLecture(), unCran: cranDepuisLeFacteur(1) };
    });
    const lent = vitesses.releve[0], vif = vitesses.releve[4];
    r.verifie('le plus lent tient largement plusieurs secondes par étape',
        lent.delai >= 10000, `${lent.delai} ms par étape au cran le plus lent`);
    r.verifie('bien plus lent que l\'ancien minimum de 1,4 s',
        lent.delai > 1400 * 5, `${lent.delai} ms contre 1400 ms autrefois`);
    r.verifie('et le plus vif survole la séance', vif.delai < 150, `${vif.delai} ms`);
    r.verifie('les crans se suivent du lent au vif, sans retour en arrière',
        vitesses.releve.every((v, i) => i === 0 || v.delai < vitesses.releve[i - 1].delai),
        JSON.stringify(vitesses.releve.map(v => v.delai)));

    // L'échelle est logarithmique : un même déplacement vaut partout le même
    // RAPPORT. C'est ce qui donne autant de place au lent qu'au vif.
    const rapports = [1, 2, 3, 4].map(i => vitesses.releve[i - 1].delai / vitesses.releve[i].delai);
    r.verifie('un même déplacement change la durée dans le même rapport, partout',
        rapports.every(x => Math.abs(x / rapports[0] - 1) < 0.06),
        JSON.stringify(rapports.map(x => +x.toFixed(2))));

    r.egal('la référence ×1 tombe bien à 700 ms', vitesses.unDelai, 700);
    r.verifie('et le curseur sait où la placer',
        vitesses.unCran > 40 && vitesses.unCran < 80, String(vitesses.unCran));
    r.verifie('ce qui s\'affiche dit le facteur ET la durée d\'une étape',
        /^×0,05 · 14 s$/.test(lent.lu) && /·/.test(vif.lu),
        `lent « ${lent.lu} », vif « ${vif.lu} »`);

    // Mesuré pour de bon : à ×0,1, trois secondes ne suffisent pas à avancer.
    const vraimentLent = await page.evaluate(async () => {
        reglerLaVitesse(0.1);
        poserEtapeDeLecture(0);
        lireOuPause();
        await new Promise(res => setTimeout(res, 3000));
        const ou = lectureIndex;
        arreterLaLecture();
        return { ou, delai: delaiDeLecture() };
    });
    r.egal('à ×0,1, on a trois secondes pour commenter une seule étape',
        vraimentLent.ou, 0);

    // LA BOUCLE : la classe recopie, le film repasse.
    const enBoucle = await page.evaluate(async () => {
        reglerLaVitesse(8);
        basculerLaBoucle(true);
        poserEtapeDeLecture(history.length - 3);
        lireOuPause();
        await new Promise(res => setTimeout(res, 2200));
        const etat = { enMarche: lectureEnMarche, ou: lectureIndex, total: history.length,
                       bouton: document.getElementById('lecture-boucle').classList.contains('actif') };
        arreterLaLecture(); basculerLaBoucle(false);
        return etat;
    });
    r.verifie('en boucle, la lecture repart du début au lieu de s\'arrêter',
        enBoucle.enMarche && enBoucle.ou < enBoucle.total - 1,
        JSON.stringify(enBoucle));
    r.verifie('et le bouton de boucle s\'allume', enBoucle.bouton);

    const sansBoucle = await page.evaluate(async () => {
        reglerLaVitesse(8);
        poserEtapeDeLecture(history.length - 3);
        lireOuPause();
        await new Promise(res => setTimeout(res, 1600));
        return { enMarche: lectureEnMarche, ou: lectureIndex, total: history.length };
    });
    r.verifie('sans boucle, elle s\'arrête à la fin comme avant',
        !sansBoucle.enMarche && sansBoucle.ou === sansBoucle.total - 1,
        JSON.stringify(sansBoucle));

    // LES TOUCHES : on ne devrait pas viser un bouton en parlant à une classe.
    // ET ELLES DOIVENT SURVIVRE AUX CURSEURS. Le canevas ne sait pas prendre le
    // focus : sitôt qu'on avait touché la vitesse ou la position, la frappe
    // partait du curseur, le garde-fou « pas de raccourci dans un champ »
    // l'écartait, et plus une seule touche du lecteur ne répondait.
    await page.evaluate(() => { reglerLaVitesse(1); poserEtapeDeLecture(6); });
    await page.focus('#lecture-curseur');
    const ouEstLeFocus = await page.evaluate(() =>
        document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '');
    r.egal('la mise en situation tient : le focus est bien sur un curseur',
        ouEstLeFocus, 'lecture-curseur');
    await page.keyboard.press('Home');
    await page.waitForTimeout(120);
    const auDebut = await page.evaluate(() => lectureIndex);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    const deuxPas = await page.evaluate(() => lectureIndex);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);
    const unRetour = await page.evaluate(() => lectureIndex);
    await page.keyboard.press('End');
    await page.waitForTimeout(120);
    const aLaFin = await page.evaluate(() => ({ i: lectureIndex, n: history.length }));
    r.egal('Début, →, ← et Fin conduisent le film, curseur en main',
        { auDebut, deuxPas, unRetour, fin: aLaFin.i === aLaFin.n - 1 },
        { auDebut: 0, deuxPas: 2, unRetour: 1, fin: true });

    // Espace aussi, et Échap referme la bande.
    await page.focus('#lecture-vitesse');
    await page.keyboard.press('Home');
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    r.egal('Espace avance encore, la vitesse en main',
        await page.evaluate(() => lectureIndex), 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    r.verifie('Échap referme le lecteur et rend le tableau',
        await page.evaluate(() => !lectureOuverte));
    await page.evaluate(() => ouvrirLeLecteur(true));

    // CE QU'IL RESTE À JOUER : on le sait avant de lancer.
    const reste = await page.evaluate(() => {
        reglerLaVitesse(0.5); poserEtapeDeLecture(0);
        const debut = document.getElementById('lecture-duree').textContent;
        poserEtapeDeLecture(history.length - 1);
        return { debut, fin: document.getElementById('lecture-duree').textContent };
    });
    r.verifie('la bande dit ce qu\'il reste à jouer, et « fin » à la fin',
        /reste .*s/.test(reste.debut) && reste.fin === 'fin', JSON.stringify(reste));

    await page.evaluate(() => reglerLaVitesse(1));

    // ===================================================================
    // LA BANDE : SA TAILLE, SA PLACE, SA RÉDUCTION
    // ===================================================================
    const boiteDeLaBande = () => page.evaluate(() => {
        const b = document.getElementById('bande-lecture').getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), l: Math.round(b.width),
                 h: Math.round(b.height), bas: Math.round(window.innerHeight - b.bottom) };
    });

    const taille = await boiteDeLaBande();
    r.verifie('la bande tient dans une hauteur de barre d\'outils',
        taille.h <= 50, `${taille.h} px de haut`);
    r.verifie('et ne mange pas la moitié de l\'écran',
        taille.l < 800, `${taille.l} px de large`);

    // ELLE SUIT LE TIROIR DU BAS. La mesure n'était prise qu'à l'ouverture du
    // lecteur : replier le tiroir ensuite laissait la bande flotter loin du
    // bord, et le rouvrir la faisait chevaucher les boutons.
    const tiroirOuvert = await boiteDeLaBande();
    await page.evaluate(() => toggleBottomDrawer());
    await page.waitForTimeout(700);
    const tiroirFerme = await boiteDeLaBande();
    await page.evaluate(() => toggleBottomDrawer());
    await page.waitForTimeout(700);
    const tiroirRouvert = await boiteDeLaBande();
    r.verifie('le tiroir se ferme, la bande descend',
        tiroirFerme.bas < tiroirOuvert.bas - 40,
        `${tiroirOuvert.bas} px du bas → ${tiroirFerme.bas} px`);
    r.verifie('le tiroir remonte, la bande remonte avec lui',
        Math.abs(tiroirRouvert.bas - tiroirOuvert.bas) <= 2,
        `${tiroirFerme.bas} px → ${tiroirRouvert.bas} px, attendu ${tiroirOuvert.bas}`);

    // ON LA DÉPLACE PAR SA POIGNÉE, et elle cesse alors de suivre le tiroir :
    // une place choisie à la main ne doit pas être reprise.
    const priseDeLaPoignee = () => page.evaluate(() => {
        const b = document.getElementById('lecture-poignee').getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    let poignee = await priseDeLaPoignee();
    await page.mouse.move(poignee.x, poignee.y);
    await page.mouse.down();
    await page.mouse.move(320, 210, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const deplacee = await boiteDeLaBande();
    r.verifie('la bande se déplace où l\'on veut',
        Math.abs(deplacee.y - tiroirOuvert.y) > 200 && deplacee.y > 0,
        JSON.stringify(deplacee));

    await page.evaluate(() => toggleBottomDrawer());
    await page.waitForTimeout(700);
    const deplaceeEtTiroir = await boiteDeLaBande();
    await page.evaluate(() => toggleBottomDrawer());
    await page.waitForTimeout(700);
    r.egal('une fois déplacée, le tiroir ne la reprend plus',
        deplaceeEtTiroir.y, deplacee.y);

    poignee = await priseDeLaPoignee();
    await page.mouse.dblclick(poignee.x, poignee.y);
    await page.waitForTimeout(400);
    const remise = await boiteDeLaBande();
    r.verifie('un double-clic sur la poignée la remet à sa place',
        Math.abs(remise.y - tiroirOuvert.y) <= 2 && Math.abs(remise.bas - tiroirOuvert.bas) <= 2,
        JSON.stringify({ remise, attendu: tiroirOuvert }));

    // RÉDUITE, IL NE RESTE QUE LA LECTURE.
    await page.click('#lecture-reduire');
    await page.waitForTimeout(250);
    const reduite = await page.evaluate(() => {
        const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
        const bande = document.getElementById('bande-lecture');
        return { l: Math.round(bande.getBoundingClientRect().width),
                 visibles: Array.from(bande.children).filter(vis).map(e => e.id).filter(Boolean) };
    });
    r.verifie('réduite, la bande tient en un coin',
        reduite.l < taille.l / 3, `${reduite.l} px contre ${taille.l}`);
    r.egal('et il ne reste que lire, réduire, déplacer et fermer',
        reduite.visibles.slice().sort(),
        ['lecture-fermer', 'lecture-jouer', 'lecture-poignee', 'lecture-reduire']);

    await page.click('#lecture-jouer');
    await page.waitForTimeout(400);
    r.verifie('et la lecture se commande encore', await page.evaluate(() => lectureEnMarche));
    await page.evaluate(() => arreterLaLecture());
    await page.click('#lecture-reduire');
    await page.waitForTimeout(250);
    r.verifie('on la rouvre entière', (await boiteDeLaBande()).l === taille.l);

    // ===================================================================
    // LE PASSAGE D'UNE ÉTAPE À L'AUTRE
    // Sec, le saut se lit mal quand un seul trait change au milieu d'une
    // figure : on garde l'image d'avant sur un calque et on l'efface.
    // ===================================================================
    const fondu = await page.evaluate(async () => {
        reglerLaTransition('fondu'); reglerLaVitesse(1);
        poserEtapeDeLecture(0);
        poserEtapeDeLecture(5);
        const c = document.getElementById('calque-passage');
        const pendant = { affiche: c && c.style.display, opacite: c ? +c.style.opacity : -1 };
        await new Promise(res => setTimeout(res, 700));
        return { pendant, apres: c ? c.style.display : 'absent' };
    });
    r.egal('en fondu, l\'image d\'avant reste un instant puis s\'efface',
        { affiche: fondu.pendant.affiche, opaque: fondu.pendant.opacite > 0.9, apres: fondu.apres },
        { affiche: 'block', opaque: true, apres: 'none' });

    // Le balayage découvre la nouvelle image de la gauche vers la droite :
    // à mi-course, il doit rester bien plus d'ancienne image à DROITE.
    const balaye = await page.evaluate(async () => {
        reglerLaTransition('balayage');
        poserEtapeDeLecture(0);
        poserEtapeDeLecture(8);
        const c = document.getElementById('calque-passage');
        // Pas de calque du tout : on le dit dans la ligne qui le concerne,
        // plutôt que de planter et d'emporter les cent autres avec.
        if (!c) return { gauche: -1, droite: -1, apres: 'absent' };
        await new Promise(res => setTimeout(res, 170));   // à peu près la mi-course
        const g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let gauche = 0, droite = 0;
        for (let y = 0; y < c.height; y += 4) {
            for (let x = 0; x < c.width; x += 4) {
                const i = (y * c.width + x) * 4;
                if (d[i + 3] > 10) { if (x < c.width / 2) gauche++; else droite++; }
            }
        }
        await new Promise(res => setTimeout(res, 700));
        return { gauche, droite, apres: c.style.display };
    });
    r.verifie('le balayage découvre la nouvelle image par la gauche',
        balaye.droite > balaye.gauche * 1.5,
        `${balaye.gauche} points restants à gauche, ${balaye.droite} à droite`);
    r.egal('et il ne laisse rien traîner sur le tableau', balaye.apres, 'none');

    const net = await page.evaluate(async () => {
        reglerLaTransition('aucune');
        poserEtapeDeLecture(0);
        poserEtapeDeLecture(4);
        const c = document.getElementById('calque-passage');
        return c ? c.style.display : 'absent';
    });
    r.verifie('« Net » ne pose aucun calque', net === 'none' || net === 'absent', net);

    // Refermer le lecteur ne doit pas laisser une image figée par-dessus.
    await page.evaluate(() => {
        reglerLaTransition('fondu');
        poserEtapeDeLecture(0); poserEtapeDeLecture(6);
        ouvrirLeLecteur(false);
    });
    await page.waitForTimeout(200);
    r.egal('refermer le lecteur retire le calque du passage',
        await page.evaluate(() => {
            const c = document.getElementById('calque-passage');
            return c ? c.style.display : 'absent';
        }), 'none');
    await page.evaluate(() => { reglerLaTransition('aucune'); ouvrirLeLecteur(true); });

    // PENDANT LE FILM, LE TABLEAU EST UN FILM.
    // Dessiner sur un état rembobiné écrivait dans l'historique un état du
    // PASSÉ — et l'envoyait sur le disque. Rembobiné à la deuxième étape, un
    // trait de plus et l'historique ne contenait plus que trois traits alors
    // que le tableau en avait six : un seul Ctrl+Z, et la moitié du cours
    // disparaissait.
    await page.evaluate(() => { poserEtapeDeLecture(2); setMode('freehand'); });
    await page.waitForTimeout(150);
    const avantTentative = await page.evaluate(() => ({
        traits: freehands.length, etapes: history.length, index: historyIndex }));
    await page.mouse.move(700, 620);
    await page.mouse.down();
    await page.mouse.move(860, 690, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    await page.evaluate(() => document.getElementById('board').focus());
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const apresTentative = await page.evaluate(() => ({
        traits: freehands.length, etapes: history.length, index: historyIndex }));
    r.egal('on ne peut rien dessiner ni effacer pendant la lecture', apresTentative, avantTentative);
    await page.evaluate(() => setMode('pointer'));

    await page.click('#lecture-fermer');
    await page.waitForTimeout(250);
    const referme = await etatLecteur();
    r.verifie('fermer le lecteur rend le tableau tel qu\'on l\'avait laissé',
        !referme.ouvert && !referme.bande && referme.traits === 6, JSON.stringify(referme));

    // Sans rien à rejouer, le lecteur le dit plutôt que d'ouvrir une bande vide.
    const rienARejouer = await page.evaluate(() => {
        history.length = 0; historyIndex = -1;
        const ouvre = ouvrirLeLecteur(true);
        return { ouvre, ouvert: lectureOuverte };
    });
    r.egal('sans rien à rejouer, la bande ne s\'ouvre pas',
        { ouvre: rienARejouer.ouvre, ouvert: rienARejouer.ouvert }, { ouvre: false, ouvert: false });

    // =========================================================================
    // LE FILM SURVIT À L'ENREGISTREMENT
    // L'ordre des gestes partait à la poubelle à chaque sauvegarde : on
    // rouvrait son tableau et le lecteur n'avait plus rien à rejouer.
    // =========================================================================
    const IMG = 'data:image/png;base64,' + 'A'.repeat(2000);
    const enregistre = await page.evaluate((IMG) => {
        // on repart d'un tableau propre
        pages = [createNewPage()]; currentPageIndex = -1; loadPage(0);
        history.length = 0; historyIndex = -1; filmPas.length = 0;

        // une image posée puis effacée : elle ne traverse QUE le film
        images.push({ id: nextId++, src: IMG, x: 0, y: 0, w: 100, h: 100, z: globalZ++ });
        saveState();
        images.length = 0;
        saveState();
        for (let n = 0; n < 30; n++) {
            const pts = [];
            for (let k = 0; k < 40; k++) pts.push({ x: n * 3 + k, y: 100 + k });
            freehands.push({ id: nextId++, points: pts, color: '#222222', width: 3, z: globalZ++ });
            saveState();
        }
        showAxes = 2; pasAxes = 5; gridWeight = 2.5;
        bgColors.default = '#fdf6e3';
        activeWidgets.ruler = true;
        widgets.ruler = new RulerWidget(250, 260);
        widgets.ruler.angle = 0.4;
        syncPage();

        const paquet = stateForStorage();
        return {
            etapes: history.length,
            pasDuFilm: (paquet.pages[0].film || []).length,
            aLHistorique: 'history' in paquet.pages[0],
            octetsHistorique: history.reduce((s, e) => s + e.length, 0),
            octetsPaquet: new Blob([JSON.stringify(paquet)]).size,
            images: Object.keys(paquet.assets).length,
            etats: history.slice(),
            paquet: JSON.stringify(paquet)
        };
    }, IMG);

    r.verifie('le film compte autant de pas que l\'historique a d\'étapes',
        enregistre.pasDuFilm === enregistre.etapes && enregistre.etapes === 32,
        `${enregistre.pasDuFilm} pas pour ${enregistre.etapes} étapes`);
    r.verifie('la pile d\'états complets, elle, ne part pas sur le disque',
        enregistre.aLHistorique === false);
    r.verifie('le film pèse une fraction de l\'historique',
        enregistre.octetsPaquet < enregistre.octetsHistorique / 4,
        `paquet ${Math.round(enregistre.octetsPaquet / 1024)} Ko contre ${Math.round(enregistre.octetsHistorique / 1024)} Ko d'historique`);
    r.verifie('une image effacée en cours de route part quand même avec le film',
        enregistre.images === 1, `${enregistre.images} image(s) en réserve`);

    // On recharge dans un onglet NEUF : c'est la vraie condition du « je
    // rouvre mon tableau de la semaine dernière ».
    const { context: ctx2, page: page2, erreurs: err2 } = await ouvrirApp(browser);
    const rejoue = await page2.evaluate(brut => {
        restoreState(JSON.parse(brut));
        let sourceImage = -1;
        for (const e of history) {
            const s = JSON.parse(e);
            if (s.images && s.images.length) { sourceImage = (unpackImages(s.images)[0].src || '').length; break; }
        }
        return {
            etapes: history.length, pasDuFilm: filmPas.length, index: historyIndex,
            traits: freehands.length,
            etats: history.slice(),
            sourceImage,
            showAxes, pasAxes, gridWeight, teinte: bgColors.default,
            regle: !!activeWidgets.ruler,
            reglePos: widgets.ruler ? { x: Math.round(widgets.ruler.x), a: +(widgets.ruler.angle || 0).toFixed(2) } : null,
            lecteurSOuvre: ouvrirLeLecteur(true)
        };
    }, enregistre.paquet);

    r.egal('rechargé, le tableau retrouve toutes ses étapes',
        { etapes: rejoue.etapes, film: rejoue.pasDuFilm }, { etapes: 32, film: 32 });
    r.verifie('et chaque étape est identique à l\'originale, au caractère près',
        JSON.stringify(rejoue.etats) === JSON.stringify(enregistre.etats),
        'les états rejoués diffèrent de ceux enregistrés');
    r.verifie('le lecteur s\'ouvre sur un tableau qui vient du disque',
        rejoue.lecteurSOuvre === true);
    r.verifie('l\'image effacée en cours de route se rejoue entière',
        rejoue.sourceImage > 1000, `source de ${rejoue.sourceImage} caractères`);

    // L'audit du fond : ce qui se voyait au tableau doit se revoir.
    r.egal('le repère, son pas, le quadrillage et la teinte du papier reviennent',
        { a: rejoue.showAxes, p: rejoue.pasAxes, g: rejoue.gridWeight, t: rejoue.teinte },
        { a: 2, p: 5, g: 2.5, t: '#fdf6e3' });
    r.egal('la règle reste posée là où on l\'avait laissée',
        { regle: rejoue.regle, pos: rejoue.reglePos }, { regle: true, pos: { x: 250, a: 0.4 } });

    // Le film doit résister à ce qui bouscule l'historique : annuler puis
    // repartir tronque la pile, et le plafond des deux cents étapes la rogne
    // par le début.
    const bouscule = await page2.evaluate(() => {
        ouvrirLeLecteur(false);
        for (let i = 0; i < 5; i++) undo();
        segments.push({ id: nextId++, x1: 999, y1: 0, x2: 999, y2: 50, color: '#f00', width: 2, z: globalZ++ });
        saveState();
        const apresAnnulation = { etapes: history.length, film: filmPas.length };
        for (let n = 0; n < 220; n++) {
            segments.push({ id: nextId++, x1: n, y1: 0, x2: n, y2: 9, color: '#000', width: 2, z: globalZ++ });
            saveState();
        }
        syncPage();
        const paquet = stateForStorage();
        return {
            apresAnnulation,
            apresPlafond: { etapes: history.length, film: filmPas.length },
            premierPas: (paquet.pages[0].film || [])[0] || null,
            etats: history.slice(),
            paquet: JSON.stringify(paquet)
        };
    });
    r.verifie('annuler puis repartir laisse le film aligné sur l\'historique',
        bouscule.apresAnnulation.etapes === bouscule.apresAnnulation.film,
        JSON.stringify(bouscule.apresAnnulation));
    r.verifie('le plafond des deux cents étapes rogne le film comme l\'historique',
        bouscule.apresPlafond.etapes === bouscule.apresPlafond.film && bouscule.apresPlafond.etapes <= 200,
        JSON.stringify(bouscule.apresPlafond));
    r.verifie('la nouvelle première étape est redonnée entière, pas en différence',
        bouscule.premierPas && Array.isArray(bouscule.premierPas.segments) && bouscule.premierPas.segments.length > 0,
        JSON.stringify(bouscule.premierPas && Object.keys(bouscule.premierPas)));

    const { context: ctx3, page: page3 } = await ouvrirApp(browser);
    const rogne = await page3.evaluate(brut => {
        restoreState(JSON.parse(brut));
        return { etats: history.slice(), segments: segments.length };
    }, bouscule.paquet);
    r.verifie('un historique rogné se rejoue quand même à l\'identique',
        JSON.stringify(rogne.etats) === JSON.stringify(bouscule.etats),
        `${rogne.etats.length} étapes rechargées contre ${bouscule.etats.length}`);
    await ctx3.close();

    r.verifie('aucune erreur JS au rejouement', err2.length === 0, err2.join(' | '));
    await ctx2.close();

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
