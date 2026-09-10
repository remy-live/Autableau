// LES GRILLES OÙ L'ON POSE DES CHIFFRES.
//
// « Pour les plugins la numération et la conversion, tu pourrais mettre un
// joli input au-dessus caché par un petit bouton et on peut taper 12,5 cm et
// ça se place ou bien le nombre et ça se place, on peut aussi double-cliquer
// pour éditer chacune des cases et tabulation pour passer à la suivante et
// possibilité d'augmenter le nombre de ligne comme ce que tu as fait pour les
// tableaux. »
//
// Les deux tableaux étaient des DESSINS : une grille vide, rien dedans, et
// rien à y mettre autrement qu'au crayon. Ils ne pouvaient donc ni placer un
// nombre, ni relire ce qu'on y avait écrit d'une séance à l'autre.
//
// CE QUE CETTE SUITE TIENT :
//
//   — un nombre écrit à la main se lit : virgule ou point, espaces des
//     milliers, unité collée ou non ;
//   — il se POSE aux bonnes cases : le chiffre des unités sur la case des
//     unités, l'entier vers la gauche, les décimales vers la droite ;
//   — et dans le tableau de conversion, l'UNITÉ compte : « 12,5 cm » ne se
//     pose pas où se pose « 12,5 m » ;
//   — ce qui déborde de la grille est DIT, pas tu ;
//   — chaque case s'édite d'un double-clic, et la tabulation mène à la
//     suivante ;
//   — le nombre de lignes se règle sur le tableau, comme pour les tableaux.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Grilles de chiffres');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(
        () => window.GrilleDeChiffres && window.PluginManager
            && PluginManager.plugins['cduGeneratorTool'] && PluginManager.plugins['conversionTool'],
        { timeout: 25000 });

    // =====================================================================
    // LIRE UN NOMBRE ÉCRIT À LA MAIN
    // Un élève tape ce qu'il voit au tableau, un autre ce qu'il voit sur sa
    // calculatrice : la virgule et le point valent l'une pour l'autre.
    // =====================================================================
    const lecture = await page.evaluate(() => {
        const G = window.GrilleDeChiffres;
        const l = (t) => G.lireLeNombre(t);
        return {
            entier: l('345'),
            virgule: l('12,5'),
            point: l('12.5'),
            unite: l('12,5 cm'),
            uniteCollee: l('3,4kg'),
            milliers: l('1 234'),
            zero: l('0,75'),
            vide: l('   '),
            mot: l('bonjour'),
            melange: l('12a34')
        };
    });
    r.egal('« 345 » : un entier, sans décimale ni unité',
        { e: lecture.entier.entier, d: lecture.entier.decimal, u: lecture.entier.unite },
        { e: '345', d: '', u: '' });
    r.egal('la virgule et le point disent la même chose',
        [lecture.virgule, lecture.point].map(n => n.entier + '|' + n.decimal),
        ['12|5', '12|5']);
    r.egal('l\'unité se lit, collée ou non',
        [lecture.unite.unite, lecture.uniteCollee.unite], ['cm', 'kg']);
    r.egal('les espaces des milliers ne gênent pas', lecture.milliers.entier, '1234');
    r.egal('« 0,75 » garde son zéro',
        { e: lecture.zero.entier, d: lecture.zero.decimal }, { e: '0', d: '75' });
    r.egal('et ce qui n\'est pas un nombre est refusé, sans rien casser',
        [lecture.vide, lecture.mot, lecture.melange], [null, null, null]);

    // =====================================================================
    // LE TABLEAU DE NUMÉRATION
    // =====================================================================
    const poserCDU = (spec, lignes) => page.evaluate(async ([s, l]) => {
        const t = PluginManager.plugins['cduGeneratorTool'];
        panX = 0; panY = 0; zoom = 1; images.length = 0; selectedItems = [];
        setMode('pointer');
        t.buildCDUTable(s, l, 'couleur', {});
        await new Promise(ok => setTimeout(ok, 400));
        selectedItems = [{ type: 'image', id: images[0].id }];
        updateQuickMenu(); draw();
        const m = t.mesurerLeTableau(s, l);
        return { cols: m.cols, rows: m.rows, unites: m.caseDesUnites,
                 x: images[0].x, y: images[0].y, w: images[0].w, h: images[0].h };
    }, [spec, lignes]);

    const cdu = await poserCDU('milliers,dixiemes,centiemes', '3');
    r.egal('le tableau de numération sait où est sa case des unités',
        { cols: cdu.cols, unites: cdu.unites }, { cols: 8, unites: 5 });

    await page.waitForTimeout(250);
    const barreCDU = await page.evaluate(() =>
        [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')]
            .map(b => ({ texte: b.textContent, titre: b.title, eteint: b.disabled })));
    r.egal('sa barre porte quatre gestes : poser un nombre, deux lignes, effacer',
        barreCDU.map(b => b.texte), ['123', '＋⬓', '－⬓', '⌫']);
    r.verifie('et « effacer » est éteint tant que rien n\'est écrit',
        barreCDU[3].eteint, JSON.stringify(barreCDU));

    // LE CHAMP CACHÉ DERRIÈRE SON PETIT BOUTON. Il ne sert pas à chaque
    // tableau, et une barre encombrée se lit mal.
    const champCDU = await page.evaluate(async () => {
        const avant = document.querySelectorAll('.gr-champ-case').length;
        [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][0]
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        await new Promise(ok => setTimeout(ok, 200));
        const c = document.querySelector('.gr-champ-case');
        if (!c) return { avant, apres: 0 };
        const b = c.getBoundingClientRect();
        const t = images[0].getBoundingClientRect ? null : images[0];
        return { avant, apres: 1, indice: c.placeholder,
                 // Il se pose AU-DESSUS du tableau, pas dessus.
                 auDessus: b.bottom <= t.y + 4,
                 aLaLargeur: Math.abs(b.width - t.w) < 3 };
    });
    r.egal('rien n\'est offert tant qu\'on n\'a pas appuyé sur le petit bouton',
        champCDU.avant, 0);
    r.egal('puis un champ paraît AU-DESSUS du tableau, à sa largeur',
        { apres: champCDU.apres, auDessus: champCDU.auDessus, large: champCDU.aLaLargeur },
        { apres: 1, auDessus: true, large: true });
    r.verifie('et il dit quoi y taper',
        /12,5/.test(champCDU.indice || ''), JSON.stringify(champCDU));

    await page.keyboard.type('12,5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(450);
    // Le dessin, quelle que soit la façon dont l'URL l'a emballé.
    await page.evaluate(() => {
        window.lireLeDessin = (src) => {
            try {
                if (/;base64,/.test(src)) return decodeURIComponent(escape(atob(src.split(';base64,')[1])));
                return decodeURIComponent(src);
            } catch (e) { return String(src); }
        };
    });
    const pose125 = await page.evaluate(() => {
        const svg = window.lireLeDessin(images[0].src);
        // Les trois chiffres, écrits par-dessus la grille : on les cherche
        // dans des <text> qui ne sont ni les titres ni les en-têtes.
        const chiffres = (svg.match(/>([0-9])</g) || []).map(m => m[1]);
        return {
            cases: images[0].pluginData.args[3],
            champParti: !document.querySelector('.gr-champ-case'),
            dessines: ['1', '2', '5'].every(c => chiffres.includes(c))
        };
    });
    // Huit colonnes : milliers C D U (0,1,2), unités C D U (3,4,5), dixièmes (6),
    // centièmes (7). « 12,5 » met le 2 sur les unités, le 1 sur les dizaines,
    // le 5 sur les dixièmes.
    r.egal('« 12,5 » se place : 1 aux dizaines, 2 aux unités, 5 aux dixièmes',
        pose125.cases, { '0,4': '1', '0,5': '2', '0,6': '5' });
    r.egal('et le champ s\'en va', pose125.champParti, true);
    // ET LES CHIFFRES SONT VRAIMENT DESSINÉS. Les ranger dans la fiche du
    // tampon ne suffit pas : c'est l'image que la classe regarde.
    r.verifie('les chiffres sont dessinés sur le tableau, pas seulement rangés',
        pose125.dessines, JSON.stringify({ dessines: pose125.dessines }));

    // CE QUI DÉBORDE EST DIT. Un tableau qui avale silencieusement les
    // chiffres qu'il ne peut pas montrer ment à l'élève.
    const deborde = await page.evaluate(async () => {
        const messages = [];
        const vrai = window.showToast;
        window.showToast = (t) => messages.push(String(t));
        const t = PluginManager.plugins['cduGeneratorTool'];
        // Neuf chiffres dans un tableau qui n'en tient que six à gauche.
        t.demanderUnNombre(images[0]);
        await new Promise(ok => setTimeout(ok, 150));
        const champ = document.querySelector('.gr-champ-case');
        champ.value = '123456789';
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(ok => setTimeout(ok, 450));
        window.showToast = vrai;
        return { messages, cases: Object.keys(images[0].pluginData.args[3]).length };
    });
    r.verifie('un nombre trop long pour la grille est signalé, pas avalé',
        deborde.messages.some(m => /gauche|chiffre/i.test(m)), JSON.stringify(deborde));

    // UNE CASE S'ÉDITE D'UN DOUBLE-CLIC, ET LA TABULATION MÈNE À LA SUIVANTE.
    const viseeCDU = await page.evaluate(() => {
        const t = PluginManager.plugins['cduGeneratorTool'];
        t.refaireLeTableau(images[0], { contenu: {} });
        const b = t.boiteDeLaCase(images[0], 1, 2);
        return { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) };
    });
    await page.waitForTimeout(400);
    await page.mouse.dblclick(viseeCDU.x, viseeCDU.y);
    await page.waitForTimeout(250);
    const editionCDU = await page.evaluate(() => ({
        champ: !!document.querySelector('.gr-champ-case'),
        // L'atelier ne s'est pas ouvert pour autant.
        boite: getComputedStyle(document.getElementById('custom-prompt-modal')).display
    }));
    r.egal('un double-clic dans une case du tableau de numération l\'ouvre, pas la fenêtre',
        editionCDU, { champ: true, boite: 'none' });

    await page.keyboard.type('7');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const apresTab = await page.evaluate(() => {
        const c = document.querySelector('.gr-champ-case');
        const t = PluginManager.plugins['cduGeneratorTool'];
        const suivante = t.boiteDeLaCase(images[0], 1, 3);
        const b = c ? c.getBoundingClientRect() : null;
        return { ecrit: images[0].pluginData.args[3]['1,2'],
                 champ: !!c,
                 surLaSuivante: b ? Math.abs(b.left - suivante.x) < 4 : false };
    });
    r.egal('la tabulation valide ce qu\'on a tapé', apresTab.ecrit, '7');
    r.egal('et ouvre la case d\'après, sans lâcher le clavier',
        { champ: apresTab.champ, surLaSuivante: apresTab.surLaSuivante },
        { champ: true, surLaSuivante: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // LE NOMBRE DE LIGNES SE RÈGLE SUR LE TABLEAU, comme pour les tableaux.
    const lignesCDU = await page.evaluate(async () => {
        const appuyer = async (i) => {
            [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][i]
                .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            await new Promise(ok => setTimeout(ok, 400));
            return { lignes: images[0].pluginData.args[1], h: Math.round(images[0].h) };
        };
        const depart = { lignes: images[0].pluginData.args[1], h: Math.round(images[0].h) };
        const plus = await appuyer(1);
        const moins = await appuyer(2);
        return { depart, plus, moins, garde: images[0].pluginData.args[3]['1,2'] };
    });
    r.egal('« une ligne de plus » agit, et le tableau grandit',
        { lignes: lignesCDU.plus.lignes, plusHaut: lignesCDU.plus.h > lignesCDU.depart.h },
        { lignes: '4', plusHaut: true });
    r.egal('« une ligne de moins » aussi', lignesCDU.moins.lignes, '3');
    r.egal('et le chiffre écrit survit au réglage', lignesCDU.garde, '7');

    // =====================================================================
    // LE TABLEAU DE CONVERSION : L'UNITÉ COMPTE
    // =====================================================================
    const poserConv = (type, lignes) => page.evaluate(async ([t, l]) => {
        const p = PluginManager.plugins['conversionTool'];
        panX = 0; panY = 0; zoom = 1; images.length = 0; selectedItems = [];
        setMode('pointer');
        const svg = p.generateSVG(t, '#0984e3', l, true, {});
        return await new Promise(ok => createStampFromSVG(svg, (stamp) => {
            images.push({ id: nextId++, x: 150, y: 300, w: stamp.w, h: stamp.h, cx: 0, cy: 0,
                cw: stamp.w, ch: stamp.h, src: stamp.src, z: globalZ++,
                pluginData: { id: 'conversionTool', args: [t, '#0984e3', l, {}] } });
            selectedItems = [{ type: 'image', id: images[0].id }];
            updateQuickMenu(); draw();
            ok({ w: Math.round(stamp.w), h: Math.round(stamp.h) });
        }));
    }, [type, lignes]);

    await poserConv('len', '3');
    const unites = await page.evaluate(() => {
        const p = PluginManager.plugins['conversionTool'];
        const longueurs = ['len', '#0984e3', '3', {}];
        const aires = ['area', '#0984e3', '3', {}];
        return {
            cm: p.caseDeLUnite(longueurs, 'cm'),
            m: p.caseDeLUnite(longueurs, 'm'),
            km: p.caseDeLUnite(longueurs, 'km'),
            // Sans unité : on vise l'unité de référence, celle du milieu.
            rien: p.caseDeLUnite(longueurs, ''),
            // Une unité étrangère au tableau : on le DIT, et l'on retombe sur
            // l'unité de référence plutôt que de ne rien faire.
            etrangere: p.caseDeLUnite(longueurs, 'kg'),
            // Les aires ont deux sous-colonnes par unité : le chiffre des
            // unités de « m² » va dans la seconde.
            m2: p.caseDeLUnite(aires, 'm²'),
            casesAires: p.mesuresDuTampon(aires).nbCases
        };
    });
    r.egal('chaque unité a sa case : km, m, cm',
        [unites.km.case, unites.m.case, unites.cm.case], [0, 3, 5]);
    r.egal('sans unité, on vise celle de référence', unites.rien.unite, 'm');
    r.egal('une unité étrangère au tableau est signalée, pas ignorée',
        { reconnue: unites.etrangere.reconnue, repli: unites.etrangere.unite },
        { reconnue: false, repli: 'm' });
    r.egal('et sur les aires, deux sous-colonnes par unité',
        { case: unites.m2.case, total: unites.casesAires }, { case: 7, total: 14 });

    await page.waitForTimeout(250);
    await page.evaluate(async () => {
        [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][0]
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        await new Promise(ok => setTimeout(ok, 150));
    });
    await page.keyboard.type('12,5 cm');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const conv125 = await page.evaluate(() => {
        const svg = window.lireLeDessin(images[0].src);
        const chiffres = (svg.match(/>([0-9])</g) || []).map(m => m[1]);
        return { cases: images[0].pluginData.args[3],
                 dessines: ['1', '2', '5'].every(c => chiffres.includes(c)) };
    });
    r.egal('« 12,5 cm » : 1 en dm, 2 en cm, 5 en mm — l\'exercice même',
        conv125.cases, { '0,4': '1', '0,5': '2', '0,6': '5' });
    r.verifie('et le tampon de conversion les porte vraiment, lui aussi',
        conv125.dessines, JSON.stringify({ dessines: conv125.dessines }));

    // LA MÊME MESURE, DANS UNE AUTRE UNITÉ, NE VA PAS AU MÊME ENDROIT.
    const conv125m = await page.evaluate(async () => {
        const p = PluginManager.plugins['conversionTool'];
        p.refaireLeTampon(images[0], { contenu: {} });
        await new Promise(ok => setTimeout(ok, 400));
        p.demanderUnNombre(images[0]);
        await new Promise(ok => setTimeout(ok, 150));
        const champ = document.querySelector('.gr-champ-case');
        champ.value = '12,5 m';
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(ok => setTimeout(ok, 450));
        return images[0].pluginData.args[3];
    });
    r.egal('« 12,5 m » : 1 en dam, 2 en m, 5 en dm',
        conv125m, { '0,2': '1', '0,3': '2', '0,4': '5' });

    // ET L'ÉDITION D'UNE CASE, AVEC LA TABULATION.
    const viseeConv = await page.evaluate(async () => {
        const p = PluginManager.plugins['conversionTool'];
        p.refaireLeTampon(images[0], { contenu: {} });
        await new Promise(ok => setTimeout(ok, 400));
        const b = p.boiteDeLaCase(images[0], 0, 2);
        return { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) };
    });
    await page.mouse.dblclick(viseeConv.x, viseeConv.y);
    await page.waitForTimeout(250);
    await page.keyboard.type('4');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    const tabConv = await page.evaluate(() => {
        const p = PluginManager.plugins['conversionTool'];
        const c = document.querySelector('.gr-champ-case');
        const suivante = p.boiteDeLaCase(images[0], 0, 3);
        const b = c ? c.getBoundingClientRect() : null;
        return { ecrit: images[0].pluginData.args[3]['0,2'], champ: !!c,
                 surLaSuivante: b ? Math.abs(b.left - suivante.x) < 4 : false };
    });
    r.egal('dans le tableau de conversion aussi, la tabulation valide et avance',
        tabConv, { ecrit: '4', champ: true, surLaSuivante: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // LE NOMBRE DE LIGNES, ICI AUSSI.
    const lignesConv = await page.evaluate(async () => {
        const appuyer = async (i) => {
            [...document.querySelectorAll('#quick-plugin-actions .qpa-btn')][i]
                .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            await new Promise(ok => setTimeout(ok, 400));
            return { lignes: images[0].pluginData.args[2], h: Math.round(images[0].h) };
        };
        const depart = { lignes: images[0].pluginData.args[2], h: Math.round(images[0].h) };
        const plus = await appuyer(1);
        return { depart, plus, garde: images[0].pluginData.args[3]['0,2'] };
    });
    r.egal('le tableau de conversion se règle en lignes sur le tableau',
        { lignes: lignesConv.plus.lignes, plusHaut: lignesConv.plus.h > lignesConv.depart.h },
        { lignes: '4', plusHaut: true });
    r.egal('et ce qui est écrit survit', lignesConv.garde, '4');

    await page.evaluate(() => {
        images.length = 0; selectedItems = [];
        document.querySelectorAll('.gr-champ-case').forEach(e => e.remove());
        updateQuickMenu(); draw();
    });
    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
