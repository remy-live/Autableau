// TABLEAU STUDIO : LE TABLEAU SE MODIFIE SUR LE TABLEAU.
//
// « Améliore Tableau Studio ; d'ailleurs si on peut même modifier le tableau
// directement sur le canvas ce serait top (nombre de colonnes, lignes,
// couleur, édition des cellules). »
//
// Pour ajouter une ligne à une grille posée, il fallait rouvrir l'atelier —
// une fenêtre qui couvre tout l'écran —, changer une chose, et la refermer.
// Devant la classe, à chaque fois. Et pour taper un mot dans une case, la
// même fenêtre : c'était le geste le plus coûteux de l'outil, et le plus
// fréquent.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le dessin de la grille se fabrique SANS la fenêtre : sans cela, rien
//     ne pourrait se modifier depuis le tableau ;
//   — la barre de l'objet porte les gestes courants — une ligne, une
//     colonne, la couleur des traits — et ils agissent pour de vrai ;
//   — un double-clic dans une case l'écrit, sur place ;
//   — et l'atelier reste ce qu'il était : ce qu'on modifie sur le tableau ne
//     déborde pas sur la grille qu'on est peut-être en train de préparer.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Tableau Studio');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins['tableStudioTool'],
        { timeout: 25000 });

    // Poser une grille de trois sur trois, comme l'atelier le fait.
    const poser = () => page.evaluate(async () => {
        const t = PluginManager.plugins['tableStudioTool'];
        panX = 0; panY = 0; zoom = 1; images.length = 0; selectedItems = [];
        t.state = { rows: 3, cols: 3, rowH: [50, 50, 50], colW: [120, 120, 120],
                    cells: {}, hBorders: {}, vBorders: {} };
        // La bordure porte sa couleur dans « c » et son pointillé dans « d » :
        // c'est le nom que lit le dessin.
        for (let r = 0; r <= 3; r++) for (let c = 0; c < 3; c++) t.state.hBorders[r + ',' + c] = { w: 1, c: '#2d3436', d: '' };
        for (let r = 0; r < 3; r++) for (let c = 0; c <= 3; c++) t.state.vBorders[r + ',' + c] = { w: 1, c: '#2d3436', d: '' };
        t.editingImage = null;
        const svg = t.dessinDuTableau();
        return await new Promise(ok => {
            createStampFromSVG(svg, (stamp) => {
                images.push({ id: nextId++, x: 200, y: 200, w: stamp.w, h: stamp.h,
                    cx: 0, cy: 0, cw: stamp.w, ch: stamp.h, src: stamp.src, z: globalZ++,
                    pluginData: { id: 'tableStudioTool', state: JSON.parse(JSON.stringify(t.state)) } });
                selectedItems = [{ type: 'image', id: images[0].id }];
                updateQuickMenu(); draw();
                ok({ w: Math.round(stamp.w), h: Math.round(stamp.h) });
            });
        });
    });

    // =====================================================================
    // LE DESSIN SE FABRIQUE SANS LA FENÊTRE
    // Il se fabriquait au moment de FERMER l'atelier, mêlé au reste : on ne
    // pouvait pas refaire la grille depuis le tableau lui-même.
    // =====================================================================
    const pose = await poser();
    r.verifie('une grille de trois sur trois se pose, dessinée hors de l\'atelier',
        pose.w > 300 && pose.h > 130, JSON.stringify(pose));
    const fenetre = await page.evaluate(() =>
        getComputedStyle(document.getElementById('tab-backdrop')).display);
    r.egal('et l\'atelier n\'a jamais eu à s\'ouvrir', fenetre, 'none');

    // =====================================================================
    // LA BARRE DE L'OBJET PORTE LES GESTES COURANTS
    // =====================================================================
    await page.waitForTimeout(250);
    const barre = await page.evaluate(() => ({
        boutons: [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')].map(b => b.textContent),
        titres: [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')].map(b => b.title),
        couleur: (document.querySelector('#quick-plugin-actions .qpa-couleur') || {}).value,
        vue: getComputedStyle(document.getElementById('quick-plugin-actions')).display
    }));
    r.egal('quatre gestes et une pastille de couleur paraissent',
        { combien: barre.boutons.length, couleur: barre.couleur, vue: barre.vue },
        { combien: 4, couleur: '#2d3436', vue: 'flex' });
    r.verifie('et chacun dit ce qu\'il fait',
        barre.titres.every(t => /ligne|colonne/i.test(t)), JSON.stringify(barre.titres));

    const gestes = await page.evaluate(async () => {
        const appuyer = async (i) => {
            const b = [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][i];
            if (!b) throw new Error('geste ' + i + ' absent (sélection : ' + selectedItems.length + ')');
            b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 320));
            return { lignes: images[0].pluginData.state.rows,
                     colonnes: images[0].pluginData.state.cols,
                     h: Math.round(images[0].h), w: Math.round(images[0].w) };
        };
        const depart = { lignes: images[0].pluginData.state.rows,
                         colonnes: images[0].pluginData.state.cols,
                         h: Math.round(images[0].h), w: Math.round(images[0].w) };
        const plusLigne = await appuyer(0);
        const plusColonne = await appuyer(2);
        const moinsLigne = await appuyer(1);
        const moinsColonne = await appuyer(3);
        return { depart, plusLigne, plusColonne, moinsLigne, moinsColonne };
    });
    r.egal('« une ligne de plus » en ajoute vraiment une, et la grille grandit',
        { lignes: gestes.plusLigne.lignes, plusHaute: gestes.plusLigne.h > gestes.depart.h },
        { lignes: 4, plusHaute: true });
    r.egal('« une colonne de plus » de même, en largeur',
        { colonnes: gestes.plusColonne.colonnes, plusLarge: gestes.plusColonne.w > gestes.depart.w },
        { colonnes: 4, plusLarge: true });
    r.egal('et l\'on en retire aussi bien',
        { lignes: gestes.moinsLigne.lignes, colonnes: gestes.moinsColonne.colonnes },
        { lignes: 3, colonnes: 3 });
    // LA GRILLE RESTE PRISE EN MAIN entre deux gestes. Refaire le tampon
    // rendait l'outil au pointeur, ce qui LÂCHE la sélection : la barre s'en
    // allait à chaque clic, et il fallait reprendre la grille entre deux
    // lignes. Les quatre gestes enchaînés ci-dessus ne tiennent que grâce à ça.
    const tenue = await page.evaluate(() => ({
        selection: selectedItems.length,
        cible: selectedItems[0] && selectedItems[0].id === images[0].id,
        barre: document.querySelectorAll('#quick-plugin-actions .qpa-btn').length
    }));
    r.egal('et la grille reste prise en main : la barre ne s\'en va pas entre deux gestes',
        tenue, { selection: 1, cible: true, barre: 4 });

    // LA DERNIÈRE LIGNE NE SE RETIRE PAS. Une grille sans ligne n'est plus une
    // grille : le bouton s'éteint au lieu de la faire disparaître.
    const plancher = await page.evaluate(async () => {
        const t = PluginManager.plugins['tableStudioTool'];
        images[0].pluginData.state.rows = 1;
        images[0].pluginData.state.rowH = [50];
        images[0].pluginData.state.cols = 1;
        images[0].pluginData.state.colW = [120];
        updateQuickMenu();
        await new Promise(r => setTimeout(r, 120));
        const btns = [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')];
        return { moinsLigne: btns[1].disabled, moinsColonne: btns[3].disabled,
                 plusLigne: btns[0].disabled };
    });
    r.egal('à une seule ligne et une seule colonne, on ne peut plus en retirer',
        plancher, { moinsLigne: true, moinsColonne: true, plusLigne: false });

    // LA COULEUR DES TRAITS, SUR PLACE.
    const couleur = await page.evaluate(async () => {
        const t = PluginManager.plugins['tableStudioTool'];
        images.length = 0; selectedItems = [];
        return null;
    });
    await poser();
    await page.waitForTimeout(250);
    const repeinte = await page.evaluate(async () => {
        const champ = document.querySelector('#quick-plugin-actions .qpa-couleur');
        const avant = champ.value;
        champ.value = '#e74c3c';
        champ.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));
        const etat = images[0].pluginData.state;
        const traits = Object.keys(etat.hBorders).map(k => etat.hBorders[k] && etat.hBorders[k].c);
        return { avant, couleurs: [...new Set(traits.filter(Boolean))],
                 // Et le dessin porte vraiment la nouvelle couleur.
                 dansLeDessin: /e74c3c/i.test(images[0].src) };
    });
    r.egal('la pastille repeint tous les traits de la grille',
        { avant: repeinte.avant, apres: repeinte.couleurs }, { avant: '#2d3436', apres: ['#e74c3c'] });
    r.verifie('et le dessin posé sur le tableau la porte',
        repeinte.dansLeDessin, JSON.stringify(repeinte));

    // =====================================================================
    // UN DOUBLE-CLIC DANS UNE CASE L'ÉCRIT
    // =====================================================================
    await poser();
    await page.waitForTimeout(250);
    const visee = await page.evaluate(() => {
        const t = PluginManager.plugins['tableStudioTool'];
        // Le milieu de la case du milieu : deuxième ligne, deuxième colonne.
        const b = t.caseSousLePoint(images[0], { x: 200 + 10 + 120 + 60, y: 200 + 10 + 50 + 25 });
        return b ? { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), r: b.r, c: b.c } : null;
    });
    r.egal('on sait quelle case est sous un point du tableau',
        visee && { r: visee.r, c: visee.c }, { r: 1, c: 1 });
    await page.mouse.dblclick(visee.x, visee.y);
    await page.waitForTimeout(250);
    const champOuvert = await page.evaluate(() => {
        const c = document.querySelector('.gr-champ-case');
        if (!c) return { la: false };
        const b = c.getBoundingClientRect();
        return { la: true, vide: c.value === '', large: Math.round(b.width),
                 // L'atelier ne s'est pas ouvert pour autant.
                 atelier: getComputedStyle(document.getElementById('tab-backdrop')).display };
    });
    r.egal('un double-clic dans une case ouvre un champ SUR la case, pas l\'atelier',
        { la: champOuvert.la, vide: champOuvert.vide, atelier: champOuvert.atelier },
        { la: true, vide: true, atelier: 'none' });
    r.verifie('et ce champ a la largeur de la case', champOuvert.large > 100,
        JSON.stringify(champOuvert));

    await page.keyboard.type('Lundi');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    const ecrit = await page.evaluate(() => ({
        cellule: images[0].pluginData.state.cells['1,1'],
        champParti: !document.querySelector('.gr-champ-case'),
        // Le dessin peut être encodé en base64 ou posé en clair dans l'URL :
        // on lit celui qu'on a, sans supposer lequel.
        dansLeDessin: (() => {
            const src = images[0].src || '';
            try {
                if (/;base64,/.test(src)) {
                    return /Lundi/.test(decodeURIComponent(escape(atob(src.split(';base64,')[1]))));
                }
                return /Lundi/.test(decodeURIComponent(src));
            } catch (e) { return /Lundi/.test(src); }
        })()
    }));
    r.egal('Entrée écrit le mot dans la case', ecrit.cellule && ecrit.cellule.t, 'Lundi');
    r.egal('le champ s\'en va', ecrit.champParti, true);
    r.verifie('et le mot est vraiment dessiné sur le tableau', ecrit.dansLeDessin,
        JSON.stringify({ cellule: ecrit.cellule }));

    // ÉCHAP N'ÉCRIT RIEN. On doit pouvoir se raviser.
    await page.mouse.dblclick(visee.x, visee.y);
    await page.waitForTimeout(200);
    await page.keyboard.type('Mardi');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const rien = await page.evaluate(() => ({
        cellule: images[0].pluginData.state.cells['1,1'].t,
        champParti: !document.querySelector('.gr-champ-case')
    }));
    r.egal('Échap referme sans rien changer', rien, { cellule: 'Lundi', champParti: true });

    // =====================================================================
    // CE QU'ON FAIT SUR LE TABLEAU NE TOUCHE PAS À L'ATELIER
    // Deux grilles à la fois — celle qu'on prépare et celle qui est posée —
    // ne doivent pas se mélanger.
    // =====================================================================
    const cloison = await page.evaluate(async () => {
        const t = PluginManager.plugins['tableStudioTool'];
        // Une grille en préparation dans l'atelier, bien différente.
        t.state = { rows: 7, cols: 2, rowH: [30, 30, 30, 30, 30, 30, 30], colW: [90, 90],
                    cells: { '0,0': { t: 'En préparation' } }, hBorders: {}, vBorders: {} };
        const avant = JSON.stringify(t.state);
        const b = [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][0];
        if (!b) throw new Error('cloison : geste absent');
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 350));
        return { intact: JSON.stringify(t.state) === avant,
                 lignesDeLAtelier: t.state.rows,
                 lignesPosees: images[0].pluginData.state.rows,
                 enEdition: t.editingImage };
    });
    r.egal('la grille en préparation dans l\'atelier n\'a pas bougé d\'une ligne',
        { intact: cloison.intact, lignes: cloison.lignesDeLAtelier, enEdition: cloison.enEdition },
        { intact: true, lignes: 7, enEdition: null });
    r.egal('alors que celle du tableau a bien gagné la sienne', cloison.lignesPosees, 4);

    // UNE GRILLE VERROUILLÉE NE SE RETOUCHE PAS. C'est tout l'objet du verrou.
    const verrouillee = await page.evaluate(async () => {
        images[0].locked = true;
        updateQuickMenu();
        await new Promise(r => setTimeout(r, 120));
        const gestes = document.querySelectorAll('#quick-plugin-actions .qpa-btn').length;
        images[0].locked = false;
        updateQuickMenu();
        await new Promise(r => setTimeout(r, 120));
        return { verrouillee: gestes,
                 rendue: document.querySelectorAll('#quick-plugin-actions .qpa-btn').length };
    });
    r.egal('verrouillée, la grille ne montre plus ses gestes ; déverrouillée, ils reviennent',
        verrouillee, { verrouillee: 0, rendue: 4 });

    await page.evaluate(() => {
        images.length = 0; selectedItems = [];
        document.querySelectorAll('.gr-champ-case').forEach(e => e.remove());
        updateQuickMenu(); draw();
    });
    // L'ATELIER POSE TOUJOURS SA GRILLE. Le dessin s'y fabriquait au moment de
    // fermer la fenêtre ; il est maintenant à part, pour servir aussi au
    // tableau — encore faut-il que l'ancien chemin marche toujours.
    const parLAtelier = await page.evaluate(async () => {
        const t = PluginManager.plugins['tableStudioTool'];
        images.length = 0; selectedItems = []; draw();
        t.editingImage = null;
        t.state = { rows: 2, cols: 4, rowH: [40, 40], colW: [100, 100, 100, 100],
                    cells: { '0,0': { t: 'Depuis l\'atelier' } }, hBorders: {}, vBorders: {} };
        for (let r = 0; r <= 2; r++) for (let c = 0; c < 4; c++) t.state.hBorders[r + ',' + c] = { w: 1, c: '#0984e3', d: '' };
        for (let r = 0; r < 2; r++) for (let c = 0; c <= 4; c++) t.state.vBorders[r + ',' + c] = { w: 1, c: '#0984e3', d: '' };
        t.exportToBoard();
        await new Promise(r => setTimeout(r, 400));
        return { tampon: !!t.currentStamp,
                 largeur: t.currentStamp ? Math.round(t.currentStamp.w) : 0,
                 fenetre: getComputedStyle(document.getElementById('tab-backdrop')).display };
    });
    r.egal('l\'atelier prépare toujours son tampon, et se referme',
        { tampon: parLAtelier.tampon, fenetre: parLAtelier.fenetre },
        { tampon: true, fenetre: 'none' });
    r.verifie('et ce tampon a la largeur des quatre colonnes',
        parLAtelier.largeur > 400, JSON.stringify(parLAtelier));
    // ON RANGE LE TAMPON EN ATTENTE. Tant qu'il en pend un, le prochain clic
    // le POSE : c'est ce que fait Échap dans la vraie vie, et c'est ce qu'il
    // faut faire ici avant d'aller tirer une colonne.
    await page.evaluate(() => {
        PluginManager.plugins['tableStudioTool'].currentStamp = null;
        setMode('pointer');
    });

    // =====================================================================
    // LA LARGEUR D'UNE COLONNE SE TIRE SUR LE TABLEAU
    // « Le tampon posé, on peut modifier la taille des colonnes avec la souris
    // sur le canvas ou dans le plugin. » Dans l'atelier, oui, depuis
    // toujours ; sur le tableau, il fallait le rouvrir pour élargir une
    // colonne d'un centimètre — et le rouvrir couvre l'écran.
    // =====================================================================
    await poser();
    await page.waitForTimeout(250);
    const bords = await page.evaluate(() => {
        const t = PluginManager.plugins['tableStudioTool'];
        setMode('pointer');
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateQuickMenu(); draw();
        const o = images[0];
        // ON VISE LE BAS DE LA GRILLE : la barre de l'objet flotte au-dessus
        // d'elle, et un clic qui tombe sur cette barre-là n'atteint jamais le
        // tableau — ce n'est pas un défaut du geste, c'est un piège de mesure.
        const y = Math.round(o.y + o.h - 30);
        return {
            // Le trait entre la première et la deuxième colonne.
            trait: { x: Math.round(o.x + 10 + 120), y },
            // Une case ordinaire : le geste doit y rester un déplacement.
            plein: t.separationSousLePoint(o, { x: o.x + 10 + 60, y }),
            surLeTrait: t.separationSousLePoint(o, { x: o.x + 10 + 120, y }),
            // Le bord DROIT n'est pas une séparation : le tirer redimensionne
            // l'objet, et le lui voler serait pire que de ne rien offrir.
            bordDroit: t.separationSousLePoint(o, { x: o.x + 10 + 360, y }),
            colW: images[0].pluginData.state.colW.slice(),
            large: Math.round(o.w)
        };
    });
    r.egal('on ne prend le geste que sur le trait, jamais au milieu d\'une case',
        { surLeTrait: bords.surLeTrait && bords.surLeTrait.idx, plein: bords.plein },
        { surLeTrait: 0, plein: null });
    r.egal('et le bord droit reste au redimensionnement de l\'objet', bords.bordDroit, null);

    await page.mouse.move(bords.trait.x, bords.trait.y);
    await page.mouse.down();
    await page.mouse.move(bords.trait.x + 70, bords.trait.y, { steps: 8 });
    await page.waitForTimeout(150);
    const pendantLeGlissement = await page.evaluate(() => {
        const g = PluginManager.plugins['tableStudioTool'].glisseColonne;
        return { enCours: !!g, largeur: g ? Math.round(g.largeur) : 0,
                 // La grille n'est pas refaite à chaque pixel : c'est un trait
                 // de repère qu'on montre, et la colonne n'a pas encore bougé.
                 pasEncore: images[0].pluginData.state.colW[0] };
    });
    r.egal('tirer le trait montre où la colonne va tomber, sans refaire la grille',
        { enCours: pendantLeGlissement.enCours, large: pendantLeGlissement.largeur > 180,
          pasEncore: pendantLeGlissement.pasEncore },
        { enCours: true, large: true, pasEncore: 120 });

    await page.mouse.up();
    await page.waitForTimeout(450);
    const apresLeGlissement = await page.evaluate(() => ({
        colW: images[0].pluginData.state.colW,
        large: Math.round(images[0].w),
        fini: !PluginManager.plugins['tableStudioTool'].glisseColonne,
        selection: selectedItems.length
    }));
    r.verifie('au relâchement, la colonne a vraiment gagné sa largeur',
        apresLeGlissement.colW[0] > 180 && apresLeGlissement.colW[1] === 120,
        JSON.stringify(apresLeGlissement));
    r.egal('la grille s\'élargit d\'autant, et reste prise en main',
        { plusLarge: apresLeGlissement.large > bords.large,
          fini: apresLeGlissement.fini, selection: apresLeGlissement.selection },
        { plusLarge: true, fini: true, selection: 1 });

    // UNE COLONNE NE SE REFERME PAS SUR RIEN. Tirée jusqu'au-delà du bord
    // gauche, elle s'arrête à ce qu'on peut encore lire.
    await page.evaluate(() => {
        const o = images[0];
        setMode('pointer');
        selectedItems = [{ type: 'image', id: o.id }];
        updateQuickMenu(); draw();
    });
    const bord2 = await page.evaluate(() => {
        const o = images[0];
        const etat = o.pluginData.state;
        const pad = 10;
        const large = etat.colW.reduce((a, b) => a + b, 0) + pad * 2;
        const ex = o.w / large;
        return { x: Math.round(o.x + (pad + etat.colW[0]) * ex), y: Math.round(o.y + o.h - 30) };
    });
    await page.mouse.move(bord2.x, bord2.y);
    await page.mouse.down();
    await page.mouse.move(bord2.x - 400, bord2.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    const plancherColonne = await page.evaluate(() => images[0].pluginData.state.colW[0]);
    r.verifie('tirée trop loin, la colonne s\'arrête au lieu de disparaître',
        plancherColonne >= 20 && plancherColonne <= 30, String(plancherColonne));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
