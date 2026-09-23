// LE BLANC EFFACE LÀ OÙ IL NE SE VERRAIT PAS
//
// « Quand on dessine en blanc, en fait on ne voit rien, je me serais bien
// servi du blanc comme couleur de gomme. » Puis, aussitôt : « oui mais le
// blanc sur un PDF noir doit faire du blanc. »
//
// Les deux phrases disent ensemble la règle, et ce n'est pas le mode sombre
// qui la porte — c'est CE QU'IL Y A DESSOUS. Sur un document, le blanc est un
// cache : on masque un mot, on cache une réponse, et sur un PDF noir c'est
// même la seule encre qui se lise. Sur le tableau NU, il n'y a rien à masquer
// et le blanc ne se voit pas : le seul usage qui reste est d'effacer.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — sur le tableau nu, un geste blanc emporte ce qu'il traverse ;
//   — il les emporte TOUS : on dessine, donc on balaie ;
//   — sur un document, le même geste peint, et le trait naît blanc ;
//   — en mode sombre, le blanc reste l'encre, jamais la gomme ;
//   — le curseur annonce la gomme AVANT qu'on appuie ;
//   — et la gomme se repose au relâcher : le clic suivant n'efface pas.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le blanc efface');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForTimeout(600);

    // Des tracés DENSES, comme de vrais gribouillis : la recherche de l'objet
    // sous le doigt teste la distance aux points enregistrés, et un trait de
    // trois points espacés de soixante pixels ne serait trouvé nulle part
    // entre eux — ce serait éprouver une main qui n'existe pas.
    const poserTroisTraits = () => page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        freehands.length = 0; images.length = 0; texts.length = 0; selectedItems = [];
        for (let k = 0; k < 3; k++) {
            const pts = [];
            for (let x = 200; x <= 420; x += 3) pts.push({ x, y: 280 + k * 40 });
            freehands.push({ id: nextId++, points: pts, color: '#e74c3c', width: 6, z: globalZ++ });
        }
        setMode('freehand');
        activeStyle.strokeColor = '#ffffff';
        draw();
        return freehands.length;
    });

    const coinDuTableau = () => page.evaluate(() => {
        const b = document.getElementById('board').getBoundingClientRect();
        return { x: b.left, y: b.top };
    });

    // --- 1. SUR LE TABLEAU NU, LE BLANC EFFACE ---
    r.egal('trois traits au tableau', await poserTroisTraits(), 3);
    r.egal('et la règle dit bien que le blanc y efface',
        await page.evaluate(() => leBlancEffaceIci({ x: 300, y: 300 })), true);

    const coin = await coinDuTableau();
    // ON BALAIE, comme avec une vraie gomme : le geste traverse les trois.
    await page.mouse.move(coin.x + 300, coin.y + 270);
    await page.mouse.down();
    await page.mouse.move(coin.x + 300, coin.y + 370, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    r.egal('un geste blanc qui traverse trois traits les emporte TOUS LES TROIS',
        await page.evaluate(() => freehands.length), 0);

    // --- 2. ET LA GOMME SE REPOSE ---
    // Le drapeau ne se rabaissait que dans le filet de sécurité du survol, qui
    // ne passe pas pour un geste ordinaire : il restait levé après le
    // relâcher, et le clic SUIVANT effaçait sans qu'on ait rien demandé.
    r.egal('la gomme est reposée dès le relâcher',
        await page.evaluate(() => gommeBlancheEnCours), false);

    // --- 3. SUR UN DOCUMENT, LE MÊME GESTE PEINT ---
    await page.evaluate(async () => {
        freehands.length = 0; images.length = 0; selectedItems = [];
        // Une page bien noire : c'est le cas que l'on nous a opposé.
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
                  + '<rect width="400" height="300" fill="#111111"/></svg>';
        const src = 'data:image/svg+xml;base64,' + btoa(svg);
        await new Promise(ok => { const i = new Image(); i.onload = () => { imageCache[src] = i; ok(); }; i.src = src; });
        images.push({ id: nextId++, x: 150, y: 200, w: 400, h: 300,
                      cx: 0, cy: 0, cw: 400, ch: 300, src, z: globalZ++ });
        setMode('freehand');
        activeStyle.strokeColor = '#ffffff';
        selectedItems = [];
        draw();
    });
    await page.waitForTimeout(250);
    r.egal('sur la page, le blanc n\'efface pas : c\'est un cache',
        await page.evaluate(() => leBlancEffaceIci({ x: 300, y: 300 })), false);
    r.egal('mais juste à côté, sur le tableau nu, il efface toujours',
        await page.evaluate(() => leBlancEffaceIci({ x: 80, y: 80 })), true);

    await page.mouse.move(coin.x + 250, coin.y + 300);
    await page.mouse.down();
    await page.mouse.move(coin.x + 450, coin.y + 340, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    r.egal('et le geste y laisse un vrai trait blanc',
        await page.evaluate(() => ({ traits: freehands.length, couleur: (freehands[0] || {}).color })),
        { traits: 1, couleur: '#ffffff' });

    // --- 4. LE MODE SOMBRE NE CHANGE PAS DE CAMP ---
    // Sur fond sombre, le blanc EST l'encre : s'il effaçait, on ne pourrait
    // plus rien écrire du tout.
    const enSombre = await page.evaluate(() => {
        images.length = 0; freehands.length = 0;
        const avant = isDarkMode;
        isDarkMode = true;
        const efface = leBlancEffaceIci({ x: 300, y: 300 });
        isDarkMode = avant;
        return efface;
    });
    r.egal('en mode sombre, le blanc reste de l\'encre', enSombre, false);

    // --- 5. UNE AUTRE COULEUR N'EFFACE JAMAIS ---
    r.egal('le rouge n\'efface rien, où qu\'il soit',
        await page.evaluate(() => {
            const avant = activeStyle.strokeColor;
            activeStyle.strokeColor = '#e74c3c';
            const e = leBlancEffaceIci({ x: 300, y: 300 });
            activeStyle.strokeColor = avant;
            return e;
        }), false);
    // Les trois écritures du blanc valent le blanc : la palette en pose une,
    // le navigateur en rend une autre, et le nuancier une troisième.
    r.egal('« #fff », « white » et « rgb(255,255,255) » sont le même blanc',
        await page.evaluate(() => ['#fff', '#FFFFFF', 'white', 'rgb(255, 255, 255)', '#e74c3c']
            .map(c => estDuBlanc(c))),
        [true, true, true, true, false]);

    // --- 6. LE GESTE S'ANNONCE AVANT DE SE FAIRE ---
    // On veut savoir ce qu'on va faire avant de l'avoir fait, pas après.
    await poserTroisTraits();
    await page.mouse.move(coin.x + 700, coin.y + 600);
    await page.waitForTimeout(250);
    r.verifie('le curseur prend la forme de la gomme pendant qu\'on survole le tableau nu',
        await page.evaluate(() => document.getElementById('board').classList.contains('cursor-eraser')),
        await page.evaluate(() => document.getElementById('board').className));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
