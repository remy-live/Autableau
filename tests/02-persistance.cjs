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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
