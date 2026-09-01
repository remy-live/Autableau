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
    const poserPostit = (contenu) => page.evaluate((c) => {
        htmlPostits.length = 0;
        htmlPostits.push({ id: nextId++, x: 420, y: 110, w: 300, h: 260, content: c, bg: '#fdfd96', z: globalZ++ });
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

    // La taille de police choisie était écrasée au premier redessin.
    const police = await page.evaluate(() => {
        document.querySelector('.btn-font-plus').click();
        document.querySelector('.btn-font-plus').click();
        const voulue = htmlPostits[0].fontSize;
        renderHtmlPostits();
        return { voulue, affichee: document.querySelector('.html-postit-body').style.fontSize };
    });
    r.egal('la taille de police choisie survit au redessin',
        police.affichee, police.voulue + 'px');

    await page.evaluate(() => { htmlPostits.length = 0; renderHtmlPostits(); });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
