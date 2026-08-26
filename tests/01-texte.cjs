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

    // Saisie et rendu doivent tomber exactement au même endroit
    const ecarts = await page.evaluate(() => {
        const cas = [
            ['texte simple', 'Une ligne de texte'],
            ['deux lignes', 'Ligne un<div>Ligne deux</div>'],
            ['titre + corps', '<h1>Titre</h1><div>corps</div>'],
            ['sous-titre', '<h2>Sous-titre</h2><div>corps</div>'],
            ['liste', '<ul><li>un</li><li>deux</li></ul>'],
            ['titre + liste', '<h1>Titre</h1><ul><li>un</li><li>deux</li></ul>']
        ];
        return cas.map(([nom, h]) => {
            texts.length = 0;
            const t = { id: nextId++, x: -300, y: -200, content: h, fontSize: 24, lineHeight: 29, color: '#2d3436', fontFamily: 'sans-serif', align: 'left', z: globalZ++ };
            texts.push(t); draw();
            const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));

            const clone = document.getElementById('wysiwyg-text').cloneNode(false);
            Object.assign(clone.style, { display: 'block', position: 'absolute', left: '-9999px', fontSize: '24px', fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', width: '600px' });
            clone.style.lineHeight = String(29 / 24);
            clone.style.setProperty('--tt-lh', '29px');
            clone.innerHTML = h;
            document.body.appendChild(clone);
            const htmlH = clone.getBoundingClientRect().height;
            document.body.removeChild(clone);
            return { nom, ecart: Math.round(lay.height - htmlH) };
        });
    });
    ecarts.forEach(e => r.verifie(`saisie et rendu identiques : ${e.nom}`, Math.abs(e.ecart) <= 1, `${e.ecart} px d'écart`));

    // Barre d'édition : compacte et tenant sur une tablette
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 400);
    await page.waitForTimeout(300);
    const barre = await page.evaluate(() => {
        const t = document.getElementById('text-toolbar');
        const rc = t.getBoundingClientRect();
        return { largeur: Math.round(rc.width), boutons: t.querySelectorAll(':scope > .btn').length, tiroirs: t.querySelectorAll('.tt-panel').length };
    });
    r.verifie('barre d\'édition compacte', barre.largeur < 420, `${barre.largeur} px`);
    r.verifie('barre d\'édition : contrôles regroupés', barre.boutons <= 9, `${barre.boutons} boutons`);
    r.verifie('barre d\'édition : tiroirs présents', barre.tiroirs === 5, `${barre.tiroirs} tiroirs`);

    // Le style de paragraphe s'applique (l'ancienne liste déroulante ne s'ouvrait pas)
    await page.keyboard.type('Ma leçon');
    await page.click('#text-toolbar .tt-tab[data-panel="para"]');
    await page.waitForTimeout(200);
    await page.click('#text-toolbar [data-block="h1"]');
    await page.waitForTimeout(250);
    const applique = await page.evaluate(() => document.getElementById('wysiwyg-text').innerHTML);
    r.verifie('bouton « Titre » applique le style', /<h1>/.test(applique), applique.slice(0, 80));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Sur un texte sélectionné, pas de contrôles inertes dans la barre de style
    await page.evaluate(() => {
        texts.length = 0;
        texts.push({ id: nextId++, x: -100, y: -50, content: 'Ma leçon', fontSize: 24, color: '#2d3436', fontFamily: 'sans-serif', align: 'left', z: globalZ++ });
        setMode('pointer'); selectedItems = [{ type: 'text', id: texts[0].id }];
        updateStyleBarContext(); draw();
    });
    await page.waitForTimeout(250);
    const barreStyle = await page.evaluate(() => {
        const vis = (el) => el ? getComputedStyle(el).display !== 'none' : false;
        return {
            couleur: vis(document.getElementById('btn-color-popover')),
            epaisseur: vis(document.getElementById('line-width').closest('.slider-container')),
            pastilles: vis(document.getElementById('quick-colors-container'))
        };
    });
    r.verifie('texte sélectionné : pas de pastilles de couleur', !barreStyle.couleur && !barreStyle.pastilles);
    r.verifie('texte sélectionné : pas de curseur d\'épaisseur', !barreStyle.epaisseur);

    // Alignement ligne par ligne (et non plus tout le bloc d'un coup)
    const lignes = await page.evaluate(() => {
        texts.length = 0;
        const t = {
            id: nextId++, x: -300, y: -200, fontSize: 24, lineHeight: 29, color: '#2d3436', fontFamily: 'sans-serif', align: 'left', z: globalZ++,
            content: '<div>gauche</div><div style="text-align:center">centre</div><div style="text-align:right">droite</div>'
        };
        texts.push(t); draw();
        const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
        return lay.lines.map(l => ({ txt: l.segs.map(s => s.text).join(''), align: l.align }));
    });
    r.egal('alignement par ligne', lignes.map(l => l.align), [null, 'center', 'right']);
    r.egal('alignement : pas de ligne parasite', lignes.map(l => l.txt), ['gauche', 'centre', 'droite']);

    // Lignes vides : ni perdues, ni dupliquées
    const vides = await page.evaluate(() => {
        const essai = (h) => {
            texts.length = 0;
            const t = { id: nextId++, x: 0, y: 0, content: h, fontSize: 24, lineHeight: 29, color: '#2d3436', fontFamily: 'sans-serif', align: 'left', z: globalZ++ };
            texts.push(t);
            return layoutTextObject(t, document.getElementById('board').getContext('2d')).lines.map(l => l.segs.map(s => s.text).join(''));
        };
        return {
            une: essai('<div>un</div><div><br></div><div>deux</div>'),
            deux: essai('<div>un</div><div><br></div><div><br></div><div>deux</div>'),
            suite: essai('<div>un</div><div>deux</div>')
        };
    });
    r.egal('une ligne vide reste une ligne vide', vides.une, ['un', '', 'deux']);
    r.egal('deux lignes vides restent deux', vides.deux, ['un', '', '', 'deux']);
    r.egal('deux paragraphes : pas de vide entre eux', vides.suite, ['un', 'deux']);

    // La barre d'édition ne doit jamais recouvrir le texte qu'on écrit
    for (const [nom, y, nbLignes] of [['en haut', 60, 2], ['au milieu', 350, 2], ['en bas', 640, 1], ['bloc haut', 120, 12]]) {
        await page.evaluate(() => { texts.length = 0; selectedItems = []; draw(); });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        await page.evaluate(() => setMode('text'));
        await page.mouse.click(300, y);
        await page.waitForTimeout(280);
        for (let i = 0; i < nbLignes; i++) {
            await page.keyboard.type('Ligne ' + (i + 1));
            if (i < nbLignes - 1) await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(200);
        const place = await page.evaluate(() => {
            const t = document.getElementById('text-toolbar').getBoundingClientRect();
            const w = document.getElementById('wysiwyg-text').getBoundingClientRect();
            const chevauche = !(t.bottom <= w.top || t.top >= w.bottom || t.right <= w.left || t.left >= w.right);
            return { chevauche, dansEcran: t.top >= 0 && t.bottom <= window.innerHeight };
        });
        r.verifie(`barre d'édition ne masque pas le texte (${nom})`, !place.chevauche);
        r.verifie(`barre d'édition dans l'écran (${nom})`, place.dansEcran);
    }
    await page.keyboard.press('Escape');

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
