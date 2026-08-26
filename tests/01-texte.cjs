// Mise en page du texte : repli, listes, titres, poignées.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

const PARA = "Le complément du nom est un groupe de mots qui apporte une précision sur le nom qu il complète. Il est introduit par une préposition : de, à, en, pour, avec.";

module.exports = async function (browser) {
    const r = creerRapport('Texte');
    const { context, page, erreurs } = await ouvrirApp(browser);

    const poser = (contenu, extra = {}) => page.evaluate(([c, e]) => {
        texts.length = 0;
        texts.push(Object.assign({
            id: nextId++, x: -400, y: -250, content: c, fontSize: 24, lineHeight: 29,
            color: '#2d3436', fontFamily: 'sans-serif', align: 'left', z: globalZ++
        }, e));
        draw();
        return { w: Math.round(texts[0]._cachedW), h: Math.round(texts[0]._cachedH) };
    }, [contenu, extra]);

    // Sans colonne, le comportement historique est conservé (une seule ligne)
    const sansColonne = await poser(PARA);
    r.verifie('sans colonne : une seule ligne', sansColonne.h < 40, `hauteur ${sansColonne.h}`);

    // Avec colonne, le texte se replie et ne dépasse jamais la largeur demandée
    const avecColonne = await poser(PARA, { colWidth: 500 });
    r.verifie('colonne 500 : largeur respectée', avecColonne.w === 500, `largeur ${avecColonne.w}`);
    r.verifie('colonne 500 : plusieurs lignes', avecColonne.h >= 87, `hauteur ${avecColonne.h}`);

    // Les listes produisent une ligne par item
    const liste = await poser('<ul><li>un</li><li>deux</li><li>trois</li></ul>');
    r.egal('liste à puces : 3 lignes', Math.round(liste.h / 29), 3);

    // Un titre est plus grand que le corps
    const titre = await poser('<h1>Titre</h1><div>corps</div>');
    r.verifie('titre plus haut que deux lignes de corps', titre.h > 58, `hauteur ${titre.h}`);

    // Poignées : côtés = colonne (police inchangée), coins = échelle
    await poser(PARA, { colWidth: 400 });
    await page.evaluate(() => { selectedItems = [{ type: 'text', id: texts[0].id }]; draw(); });
    const pos = await page.evaluate(() => {
        const t = texts[0];
        return { rx: (t._cachedStartX + t._cachedW) * zoom + panX, ry: (t.y + t._cachedH / 2) * zoom + panY };
    });
    await page.mouse.move(pos.rx, pos.ry);
    await page.mouse.down();
    await page.mouse.move(pos.rx + 180, pos.ry, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const cote = await page.evaluate(() => ({ col: Math.round(texts[0].colWidth), size: texts[0].fontSize }));
    r.verifie('poignée latérale : élargit la colonne', cote.col > 520, `colonne ${cote.col}`);
    r.egal('poignée latérale : police inchangée', cote.size, 24);

    const coin = await page.evaluate(() => { const t = texts[0]; return { x: (t._cachedStartX + t._cachedW) * zoom + panX, y: (t.y + t._cachedH) * zoom + panY }; });
    await page.mouse.move(coin.x, coin.y);
    await page.mouse.down();
    await page.mouse.move(coin.x + 150, coin.y + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const apres = await page.evaluate(() => ({ col: Math.round(texts[0].colWidth), size: Math.round(texts[0].fontSize) }));
    r.verifie('poignée d\'angle : agrandit la police', apres.size > 24, `taille ${apres.size}`);
    r.verifie('poignée d\'angle : colonne mise à l\'échelle', Math.abs(apres.col / apres.size - cote.col / cote.size) < 0.6,
        `rapport ${(apres.col / apres.size).toFixed(2)} vs ${(cote.col / cote.size).toFixed(2)}`);

    // Saisie : repli automatique quand la ligne atteint le bord
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type(PARA);
    await page.waitForTimeout(300);
    const frappe = await page.evaluate(() => {
        const w = document.getElementById('wysiwyg-text').getBoundingClientRect();
        return { colonne: tempTextLogicalPos && tempTextLogicalPos.colWidth, depasse: w.right > window.innerWidth };
    });
    r.verifie('frappe : colonne posée automatiquement', !!frappe.colonne, `colonne ${frappe.colonne}`);
    r.verifie('frappe : la saisie ne sort pas de l\'écran', !frappe.depasse);

    // Raccourcis de frappe
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);   // laisse la validation du texte se terminer
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('# Titre');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item');
    await page.waitForTimeout(200);
    const html = await page.evaluate(() => document.getElementById('wysiwyg-text').innerHTML);
    r.verifie('raccourci « # » : titre', /<h1>/.test(html), html.slice(0, 90));
    r.verifie('raccourci « - » : liste', /<li>/.test(html), html.slice(0, 90));
    await page.keyboard.press('Escape');

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
