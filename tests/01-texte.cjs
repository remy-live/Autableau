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
    // Dix, et non plus neuf : le dixième est celui qui décide où la barre vit
    // — rangée dans celle du haut, ou suivant le texte. Il compte parmi les
    // contrôles, et le reste doit donc tenir en neuf.
    r.verifie('barre d\'édition : contrôles regroupés', barre.boutons <= 10, `${barre.boutons} boutons`);
    r.verifie('barre d\'édition : tiroirs présents', barre.tiroirs === 6, `${barre.tiroirs} tiroirs`);

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
    // LA PASTILLE DE COULEUR A CHANGÉ DE CAMP. Elle était rangée ici parmi les
    // contrôles INERTES — « la couleur d'un texte se règle dans la barre
    // d'édition » —, et cette vérification défendait son absence. C'était vrai
    // pendant la frappe et faux après : un bloc seulement sélectionné n'a pas
    // de barre d'édition, et il n'existait alors AUCUN endroit pour le
    // recolorer. « De plus la couleur ne fonctionne plus. » Elle agit, elle
    // reste ; ce qui n'agit pas s'en va toujours.
    const agit = await page.evaluate(() => {
        const avant = texts[0].color;
        choisirLaCouleur('#e84393');
        return { avant, apres: texts[0].color };
    });
    r.verifie('texte sélectionné : la pastille de couleur est là', barreStyle.couleur,
        JSON.stringify(barreStyle));
    r.verifie('et elle agit vraiment sur le bloc tenu',
        agit.apres.toLowerCase() === '#e84393' && agit.avant !== agit.apres,
        JSON.stringify(agit));
    r.verifie('texte sélectionné : pas de pastilles sous l\'objet', !barreStyle.pastilles);
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
    await page.waitForTimeout(250);

    // Centrer une ligne seule doit produire un effet visible : sans cadre, le
    // bloc fait exactement la largeur du texte et le bouton semble mort.
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(220, 380);
    await page.waitForTimeout(400);
    await page.keyboard.type('df fsdf');
    await page.waitForTimeout(150);
    await page.click('#text-toolbar .tt-tab[data-panel="align"]');
    await page.waitForTimeout(200);

    const tiroir = await page.evaluate(() => {
        const p = document.querySelector('.tt-panel[data-panel="align"]').getBoundingClientRect();
        const w = document.getElementById('wysiwyg-text').getBoundingClientRect();
        return {
            recouvre: !(p.bottom <= w.top || p.top >= w.bottom || p.right <= w.left || p.left >= w.right),
            dansEcran: p.top >= 0 && p.bottom <= window.innerHeight && p.left >= 0 && p.right <= window.innerWidth
        };
    });
    r.verifie('tiroir ouvert : ne recouvre pas le texte', !tiroir.recouvre);
    r.verifie('tiroir ouvert : reste dans l\'écran', tiroir.dansEcran);

    await page.click('#text-toolbar .btn-align[data-align="center"]');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const centre = await page.evaluate(() => {
        const t = texts[0];
        const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
        const L = lay.lines[0];
        return { bloc: Math.round(lay.width), ligne: Math.round(L.contentW), align: L.align, decalage: Math.round((lay.width - L.contentW) / 2) };
    });
    r.egal('centrage : la ligne porte l\'alignement', centre.align, 'center');
    r.verifie('centrage : le bloc reçoit un cadre plus large', centre.bloc > centre.ligne + 40, `bloc ${centre.bloc}, ligne ${centre.ligne}`);
    r.verifie('centrage : décalage visible', centre.decalage > 20, `${centre.decalage} px`);

    // Police et taille sur une portion sélectionnée : le reste du bloc ne bouge pas
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('alpha beta');
    await page.waitForTimeout(150);

    // Sélectionne « alpha » uniquement
    await page.evaluate(() => {
        const z = document.getElementById('wysiwyg-text');
        const n = z.firstChild.nodeType === 3 ? z.firstChild : z.firstChild.firstChild;
        const r = document.createRange();
        r.setStart(n, 0); r.setEnd(n, 5);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.click('#text-toolbar .tt-tab[data-panel="size"]');
    await page.waitForTimeout(150);
    await page.click('#text-toolbar .tt-police[data-police="monospace"]');
    await page.waitForTimeout(100);
    // La taille est une RÉGLETTE depuis que les « − » et « + » sont partis :
    // on la pousse d'un geste au lieu de compter les clics.
    await page.evaluate((v) => {
        const r2 = document.getElementById('tt-taille');
        r2.value = v;
        r2.dispatchEvent(new Event('input', { bubbles: true }));
    }, 34);
    await page.waitForTimeout(200);

    const badge = await page.evaluate(() => ({
        taille: document.getElementById('text-size-display').innerText,
        bloc: texts[0] ? texts[0].fontSize : null
    }));
    r.egal('sélection : la barre affiche la taille de la portion', badge.taille, '34');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);

    const seg = await page.evaluate(() => {
        const t = texts[0];
        const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
        const segs = lay.lines[0].segs.map(s => ({
            txt: s.text,
            taille: s.style && s.style.fontSize ? Math.round(s.style.fontSize) : null,
            police: (s.style && s.style.fontFamily) || null
        }));
        return { segs, base: t.fontSize, lignes: lay.lines.length };
    });
    const premier = seg.segs[0] || {};
    const dernier = seg.segs[seg.segs.length - 1] || {};
    r.verifie('sélection : le bloc garde sa taille de base', seg.base === 24, `base ${seg.base}`);
    r.verifie('sélection : la portion grandit', premier.taille === 34, JSON.stringify(seg.segs));
    r.verifie('sélection : la portion prend la police demandée', premier.police === 'monospace', JSON.stringify(seg.segs));
    r.verifie('sélection : le reste du texte est intact', seg.segs.length > 1 && !dernier.taille, JSON.stringify(seg.segs));

    // LES QUATRE POLICES SE MONTRENT. Un unique bouton « Aa » les faisait
    // défiler à l'aveugle : rien ne disait qu'il y avait une chasse fixe,
    // celle qui aligne les chiffres d'une ligne à l'autre. Et ce bouton
    // « 100 % de large » posé dans une ligne à libellé débordait du tiroir
    // de la largeur exacte du libellé.
    await page.waitForTimeout(250);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(320, 320);
    await page.waitForTimeout(300);
    await page.keyboard.type('12 345');
    await page.waitForTimeout(150);
    await page.click('#text-toolbar .tt-tab[data-panel="size"]');
    await page.waitForTimeout(250);

    const pastilles = await page.evaluate(() => {
        const panneau = document.querySelector('#text-toolbar .tt-panel[data-panel="size"]');
        const boite = panneau.getBoundingClientRect();
        return Array.from(panneau.querySelectorAll('.tt-police')).map(b => {
            const r = b.getBoundingClientRect();
            return {
                famille: b.dataset.police,
                ecrite: getComputedStyle(b).fontFamily.replace(/"/g, "'"),
                nom: b.innerText.trim(),
                deborde: Math.round(r.right - boite.right)
            };
        });
    });
    r.egal('quatre polices sont proposées', pastilles.length, 4);
    r.verifie('la chasse fixe en fait partie, et elle porte un nom',
        pastilles.some(p => p.famille === 'monospace' && p.nom.length > 2), JSON.stringify(pastilles));
    r.verifie('chacune est écrite dans sa propre lettre',
        pastilles.length > 0 && pastilles.every(p => p.ecrite === p.famille), JSON.stringify(pastilles));
    r.verifie('et aucune ne déborde du tiroir',
        pastilles.length > 0 && pastilles.every(p => p.deborde <= 0), JSON.stringify(pastilles));

    const etatDesPolices = () => page.evaluate(() => ({
        marquees: Array.from(document.querySelectorAll('#text-toolbar .tt-police.active')).map(b => b.dataset.police),
        style: activeStyle.fontFamily,
        bloc: editingTextId ? (getObjectById('text', editingTextId) || {}).fontFamily : null
    }));

    await page.click('#text-toolbar .tt-police[data-police="serif"]');
    await page.waitForTimeout(250);
    const enSerif = await etatDesPolices();
    r.egal('cliquer une police la marque, elle seule', enSerif.marquees.join('|'), 'serif');
    r.egal('et c\'est elle qu\'on écrit', enSerif.style, 'serif');

    await page.click('#text-toolbar .tt-police[data-police="monospace"]');
    await page.waitForTimeout(250);
    const enFixe = await etatDesPolices();
    r.egal('en changer déplace la marque', enFixe.marquees.join('|'), 'monospace');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const poseEnFixe = await page.evaluate(() => (texts[0] || {}).fontFamily || null);
    r.egal('et le texte posé garde la chasse fixe', poseEnFixe, 'monospace');

    // Rouvrir un bloc déjà posé et lui changer sa police doit changer LE BLOC,
    // et pas seulement ce que l'on tapera la prochaine fois.
    const cible = await page.evaluate(() => {
        setMode('pointer');
        const t = texts[0];
        return { x: (t._cachedStartX + t._cachedW / 2) * zoom + panX, y: (t.y + t._cachedH / 2) * zoom + panY };
    });
    await page.mouse.dblclick(cible.x, cible.y);
    await page.waitForTimeout(400);
    await page.mouse.click(cible.x, cible.y);      // un clic simple repose le curseur : plus rien de surligné
    await page.waitForTimeout(200);
    await page.evaluate(() => {
        const tab = document.querySelector('#text-toolbar .tt-tab[data-panel="size"]');
        const pan = document.querySelector('#text-toolbar .tt-panel[data-panel="size"]');
        if (tab && pan && getComputedStyle(pan).display === 'none') tab.click();
    });
    await page.waitForTimeout(200);
    await page.click('#text-toolbar .tt-police[data-police="serif"]');
    await page.waitForTimeout(250);
    const reedite = await page.evaluate(() => ({
        edite: !!editingTextId,
        bloc: editingTextId ? (getObjectById('text', editingTextId) || {}).fontFamily : null
    }));
    r.verifie('on rouvre le bloc déjà posé', reedite.edite, JSON.stringify(reedite));
    r.egal('en changer la police change le bloc lui-même', reedite.bloc, 'serif');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);

    // Changer la taille d'un mot ne doit pas effacer les couleurs déjà posées
    // ailleurs, ni déteindre sur le reste du bloc.
    await page.waitForTimeout(250);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('rouge vert');
    await page.waitForTimeout(150);

    const choisir = (d, f) => page.evaluate(([d, f]) => {
        const z = document.getElementById('wysiwyg-text');
        const n = document.createTreeWalker(z, NodeFilter.SHOW_TEXT).nextNode();
        const r = document.createRange();
        r.setStart(n, d); r.setEnd(n, f);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }, [d, f]);

    await choisir(0, 5);                       // « rouge »
    await page.click('#text-toolbar .tt-tab[data-panel="color"]');
    await page.waitForTimeout(150);
    await page.click('#text-toolbar .tt-panel[data-panel="color"] .color-dot[data-color="#e74c3c"]');
    await page.waitForTimeout(150);

    // Puis on agrandit « vert » seulement
    await page.evaluate(() => {
        const z = document.getElementById('wysiwyg-text');
        const noeuds = [];
        const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) noeuds.push(w.currentNode);
        const cible = noeuds.find(n => n.nodeValue.includes('vert'));
        const i = cible.nodeValue.indexOf('vert');
        const r = document.createRange();
        r.setStart(cible, i); r.setEnd(cible, i + 4);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.click('#text-toolbar .tt-tab[data-panel="size"]');
    await page.waitForTimeout(150);
    // La taille est une RÉGLETTE depuis que les « − » et « + » sont partis :
    // on la pousse d'un geste au lieu de compter les clics.
    await page.evaluate((v) => {
        const r2 = document.getElementById('tt-taille');
        r2.value = v;
        r2.dispatchEvent(new Event('input', { bubbles: true }));
    }, 30);
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);

    const mixte = await page.evaluate(() => {
        const t = texts[0];
        const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
        return {
            base: t.fontSize,
            segs: lay.lines[0].segs.map(s => ({
                txt: s.text,
                couleur: (s.style && s.style.color) || null,
                taille: s.style && s.style.fontSize ? Math.round(s.style.fontSize) : null
            }))
        };
    });
    const rouge = mixte.segs.find(s => s.txt.includes('rouge'));
    const vert = mixte.segs.find(s => s.txt.includes('vert'));
    r.verifie('taille d\'un mot : la couleur de l\'autre survit', !!(rouge && rouge.couleur), JSON.stringify(mixte.segs));
    r.verifie('taille d\'un mot : le mot coloré garde sa taille', !!rouge && !rouge.taille, JSON.stringify(mixte.segs));
    r.verifie('taille d\'un mot : seul ce mot grandit', !!vert && vert.taille === 30, JSON.stringify(mixte.segs));
    r.verifie('taille d\'un mot : le bloc ne bouge pas', mixte.base === 24, `base ${mixte.base}`);

    // Pendant la saisie, le cadre de sélection figé sur les anciennes
    // dimensions ne doit plus s'afficher (ni le menu rapide).
    await page.waitForTimeout(250);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(340, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('Bonjour');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const pt = await page.evaluate(() => {
        setMode('pointer');
        const t = texts[0];
        return { x: (t._cachedStartX + t._cachedW / 2) * zoom + panX, y: (t.y + t._cachedH / 2) * zoom + panY };
    });
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(300);
    const avant = await page.evaluate(() => ({
        sel: selectedItems.length,
        menu: document.getElementById('quick-edit-menu').classList.contains('visible')
    }));
    r.verifie('clic simple : objet sélectionné', avant.sel === 1);
    r.verifie('clic simple : menu rapide affiché', avant.menu);

    await page.mouse.dblclick(pt.x, pt.y);
    await page.waitForTimeout(400);
    const pendant = await page.evaluate(() => ({
        edite: !!editingTextId,
        menu: document.getElementById('quick-edit-menu').classList.contains('visible')
    }));
    r.verifie('réédition : la saisie est ouverte', pendant.edite);
    r.verifie('réédition : plus de menu rapide en travers', !pendant.menu);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const finSaisie = await page.evaluate(() => ({ edite: !!editingTextId }));
    r.verifie('après la saisie : édition close', !finSaisie.edite);

    // --- COLLER DEPUIS UN TRAITEMENT DE TEXTE ---
    // LibreOffice et Word envoient leur feuille de style avec le texte, et
    // séparent leurs paragraphes par un saut de ligne. Réduit à une espace,
    // ce saut devenait une LIGNE VIDE entre chaque ligne : le texte arrivait
    // sur le tableau à double interligne.
    const LIBRE_OFFICE = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html><head><meta http-equiv="content-type" content="text/html; charset=utf-8"/><title></title>
<meta name="generator" content="LibreOffice 7.4 (Linux)"/>
<style type="text/css">@page { size: 21cm 29.7cm; margin: 2cm }
p { line-height: 115%; margin-bottom: 0.25cm }</style></head>
<body lang="fr-FR" dir="ltr"><p style="line-height: 100%"><font face="Liberation Serif, serif">Le th&eacute;or&egrave;me de Pythagore</font></p>
<p style="line-height: 100%"><font face="Liberation Serif, serif"><b>Rappel</b> : le carr&eacute; de l'hypot&eacute;nuse&hellip;</font></p></body></html>`;

    const nettoye = await page.evaluate((h) => nettoyerHtmlColle(h), LIBRE_OFFICE);
    r.verifie('la feuille de style du document ne se colle pas sur le tableau',
        !/@page|line-height|margin-bottom/.test(nettoye), nettoye.slice(0, 140));
    r.egal('les deux paragraphes se suivent, sans ligne vide entre eux',
        nettoye, '<div>Le théorème de Pythagore</div><div><b>Rappel</b> : le carré de l\'hypoténuse…</div>');
    r.verifie('le gras du document est conservé', /<b>Rappel<\/b>/.test(nettoye), nettoye);

    const surLeTableau = await page.evaluate((h) => {
        texts.length = 0;
        const ok = collerTexteSurLeTableau(h, 'Le théorème de Pythagore\nRappel : le carré de l\'hypoténuse…');
        return { ok, blocs: texts.length, contenu: (texts[0] || {}).content,
                 selectionne: selectedItems.length === 1 && selectedItems[0].type === 'text' };
    }, LIBRE_OFFICE);
    r.verifie('un collage venu de LibreOffice pose bien un bloc', surLeTableau.ok && surLeTableau.blocs === 1,
        JSON.stringify(surLeTableau));
    r.verifie('et le bloc posé est sélectionné', surLeTableau.selectionne);
    r.verifie('sans ligne vide en trop', !/<div><br><\/div>/.test(surLeTableau.contenu), surLeTableau.contenu);

    // Sans mise en forme : une ligne du presse-papiers = une ligne du tableau.
    const brut = await page.evaluate(() =>
        texteBrutEnHtml('Un\r\n\r\nDeux\r\n\r\n\r\nTrois\r\n\r\n'));
    r.egal('les lignes vides en série sont ramenées à une seule',
        brut, '<div>Un</div><div><br></div><div>Deux</div><div><br></div><div>Trois</div>');

    const rienDeColable = await page.evaluate(() => {
        texts.length = 0;
        const dt = new DataTransfer();
        dt.setData('text/plain', '');
        const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });
        Object.defineProperty(ev, 'target', { value: document.getElementById('board') });
        window.dispatchEvent(ev);
        return texts.length;
    });
    r.egal('un presse-papiers vide ne pose rien', rienDeColable, 0);

    // --- Le cadre d'export doit contenir le texte en entier ---
    // Il supposait 300 × 100 pour n'importe quel bloc : un long texte sortait
    // du cadre et le PDF le tranchait en plein mot.
    const cadre = await page.evaluate(() => {
        [points, segments, circles, rectangles, texts, freehands, curves,
          polygons, images, arcs].forEach(t => { t.length = 0; });
        const lignes = [
            'Les courbes de ta peau se dessinent sous mes doigts',
            'comme une carte que je connais par coeur,',
            'et chaque grain est une ville ou je me perds',
            'sans jamais vouloir retrouver mon chemin.',
            'Le temps s\'arrete a la lisiere de ton epaule,',
            'la ou le jour hesite encore a se lever.',
            'Je compte les silences entre deux respirations',
            'et j\'y trouve la mesure exacte du bonheur.'
        ];
        texts.push({
            id: nextId++, x: 100, y: 100,
            content: lignes.map(l => '<div>' + l + '</div>').join(''),
            fontSize: 34, lineHeight: 44, color: '#2d3436',
            fontFamily: 'sans-serif', align: 'left', z: globalZ++
        });
        draw();
        const b = boiteDuTexte(texts[0]);
        const box = getAutoBoundingBox(40);
        // Le cadre revient en pixels écran : on le repasse en coordonnées du tableau
        const c = {
            x1: (box.startX - panX) / zoom, y1: (box.startY - panY) / zoom,
            x2: (box.endX - panX) / zoom, y2: (box.endY - panY) / zoom
        };
        return {
            large: b.w > 600, haut: b.h > 300,
            couvre: c.x1 <= b.x && c.y1 <= b.y && c.x2 >= b.x + b.w && c.y2 >= b.y + b.h,
            detail: JSON.stringify({ texte: b, cadre: c })
        };
    });
    r.verifie('un poème de huit lignes est mesuré à sa vraie taille',
        cadre.large && cadre.haut, cadre.detail);
    r.verifie('et le cadre d\'export le contient en entier', cadre.couvre, cadre.detail);

    // Une bulle, une image penchée et un arc comptent aussi dans le cadre
    const autres = await page.evaluate(() => {
        [points, segments, circles, rectangles, texts, freehands, curves,
          polygons, images, arcs].forEach(t => { t.length = 0; });
        arcs.push({ id: nextId++, cx: 900, cy: 900, radius: 120, startAngle: 0, endAngle: 3, z: globalZ++ });
        const box = getAutoBoundingBox(0);
        const arc = { x2: (box.endX - panX) / zoom, y2: (box.endY - panY) / zoom };
        arcs.length = 0;
        images.push({ id: nextId++, x: 0, y: 0, w: 400, h: 40, angle: Math.PI / 2,
                      cx: 0, cy: 0, cw: 400, ch: 40, src: '', z: globalZ++ });
        const box2 = getAutoBoundingBox(0);
        const img = { y1: (box2.startY - panY) / zoom, y2: (box2.endY - panY) / zoom };
        return { arc, img };
    });
    r.verifie('un arc n\'est plus oublié par le recadrage',
        autres.arc.x2 >= 1020 && autres.arc.y2 >= 1020, JSON.stringify(autres.arc));
    r.verifie('une image pivotée est mesurée dans sa position réelle',
        autres.img.y2 - autres.img.y1 > 390, JSON.stringify(autres.img));

    // --- Survol et sélection : plus de halo bavant autour des lettres ---
    const halo = await page.evaluate(() => {
        [points, segments, circles, rectangles, texts, freehands, curves,
          polygons, images, arcs].forEach(t => { t.length = 0; });
        selectedItems = []; hoveredObj = null;
        panX = 200; panY = 200; zoom = 1;
        texts.push({
            id: nextId++, x: 60, y: 60, content: 'Et quand on evoque',
            fontSize: 26, lineHeight: 34, color: '#e74c3c',
            fontFamily: 'sans-serif', align: 'left', z: globalZ++
        });
        const t = texts[0];
        const board = document.getElementById('board');
        const g = board.getContext('2d');
        // Combien de pixels ne sont ni le fond ni l'encre pleine ? Un halo en
        // sème des centaines tout autour des lettres.
        const flous = () => {
            const d = g.getImageData(t.x + panX - 12, t.y + panY - 12, 340, 60).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]];
                const fond = rr > 245 && gg > 245 && bb > 245;
                const encre = rr > 180 && gg < 130 && bb < 130;
                if (!fond && !encre) n++;
            }
            return n;
        };
        draw(); const repos = flous();
        hoveredObj = { type: 'text', id: t.id }; draw(); const survol = flous();
        hoveredObj = null; selectedItems = [{ type: 'text', id: t.id }]; draw();
        const choisi = flous();
        selectedItems = [];
        return { repos, survol, choisi };
    });
    // Les lettres restent aussi nettes qu'au repos ; le cadre de survol, lui,
    // n'ajoute qu'un fin pointillé sur le pourtour de la zone mesurée.
    r.verifie('survolé, le texte ne prend pas de halo autour des lettres',
        halo.survol < halo.repos + 1500, JSON.stringify(halo));
    r.verifie('sélectionné non plus',
        halo.choisi < halo.repos + 2000, JSON.stringify(halo));

    // Le clic est un curseur de texte : la première ligne l'enfourche. Elle
    // pendait dessous, et le cadre s'ouvrait plus bas que l'endroit désigné.
    await tableauVierge(page);
    const viseur = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        activeStyle.fontSize = 40; activeStyle.lineHeight = 48;
        setMode('text');
        const board = document.getElementById('board');
        const r = board.getBoundingClientRect();
        // APPUI ET RELÂCHEMENT, car c'est le relâchement qui tranche depuis
        // qu'un tracé fait une colonne : l'appui seul ne dit pas encore si l'on
        // pose un curseur ou si l'on dessine un cadre. Sans le second
        // événement, ce contrôle attendait une saisie qui n'ouvre plus là.
        const geste = (quoi, boutons) => board.dispatchEvent(new PointerEvent(quoi, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: boutons, clientX: r.left + 500, clientY: r.top + 400
        }));
        geste('pointerdown', 1);
        geste('pointerup', 0);
        const zone = document.getElementById('wysiwyg-text');
        const rz = zone.getBoundingClientRect();
        return {
            ouverte: zone.style.display === 'block',
            clic: 400,
            haut: Math.round(rz.top - r.top),
            milieu: Math.round(rz.top - r.top + 48 / 2),
            ancre: tempTextLogicalPos ? Math.round(tempTextLogicalPos.y) : null
        };
    });
    r.verifie('cliquer avec l\'outil Texte ouvre la saisie', viseur.ouverte);
    r.verifie('la première ligne enfourche le clic, elle ne pend pas dessous',
        Math.abs(viseur.milieu - viseur.clic) <= 2, JSON.stringify(viseur));
    r.verifie('le cadre s\'ouvre donc au-dessus du point désigné',
        viseur.haut < viseur.clic, JSON.stringify(viseur));

    // Le trait qu'on VOIT doit enfourcher la ligne lui aussi. Son point de
    // clic était son sommet : on visait le milieu du trait, et le texte
    // apparaissait une demi-hauteur trop haut — d'autant plus qu'on écrivait
    // gros. Le dessin disait une chose, le code en faisait une autre.
    const viseurDessine = await page.evaluate(() => {
        const lire = (taille, z) => {
            activeStyle.fontSize = taille; zoom = z;
            setMode('text');
            lastRawX = 99999; lastRawY = 99999;      // loin de tout objet
            updateCursor();
            const c = document.getElementById('board').style.cursor;
            const m = c.match(/height%3D%22(\d+(?:\.\d+)?)%22/);
            const pt = c.match(/\)\s+(\d+)\s+(\d+)\s*,/);
            return { hauteur: m ? Number(m[1]) : null, x: pt ? Number(pt[1]) : null,
                     y: pt ? Number(pt[2]) : null, curseur: c.slice(0, 40) };
        };
        return { petit: lire(24, 1), grand: lire(90, 1), zoome: lire(40, 2) };
    });
    ['petit', 'grand', 'zoome'].forEach(cas => {
        const v = viseurDessine[cas];
        r.verifie(`le trait de saisie (${cas}) a bien une hauteur`, v.hauteur > 0, JSON.stringify(v));
        r.egal(`et l'on clique en son milieu (${cas})`, v.y, Math.round(v.hauteur / 2));
    });
    r.verifie('le trait grandit avec la police',
        viseurDessine.grand.hauteur > viseurDessine.petit.hauteur, JSON.stringify(viseurDessine));

    await page.evaluate(() => { zoom = 1; activeStyle.fontSize = 40; });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // La taille du texte se lit et se tape : le curseur seul ne la disait pas,
    // et s'arrêtait à 12 — impossible de descendre plus bas.
    const taille = await page.evaluate(() => {
        const curseur = document.getElementById('font-size');
        const nombre = document.getElementById('font-size-num');
        const poser = (v) => {
            nombre.value = String(v);
            nombre.dispatchEvent(new Event('input', { bubbles: true }));
        };
        poser(8);
        const petit = { style: activeStyle.fontSize, curseur: curseur.value };
        poser(160);   // au-delà de la course du curseur
        const grand = { style: activeStyle.fontSize, curseur: curseur.value, nombre: nombre.value };
        curseur.value = '30';
        curseur.dispatchEvent(new Event('input', { bubbles: true }));
        const parLeCurseur = { style: activeStyle.fontSize, nombre: nombre.value };
        activeStyle.fontSize = 24;
        return { min: Number(curseur.min), petit, grand, parLeCurseur };
    });
    r.verifie('le curseur descend sous 12', taille.min <= 8, String(taille.min));
    r.egal('taper 8 donne une police de 8', taille.petit.style, 8);
    r.egal('le curseur suit', taille.petit.curseur, '8');
    r.egal('taper 160 passe outre la course du curseur', taille.grand.style, 160);
    r.egal('le curseur se range alors à son maximum', taille.grand.curseur, '120');
    r.egal('et le nombre garde la vraie valeur', taille.grand.nombre, '160');
    r.egal('bouger le curseur écrit le nombre', taille.parLeCurseur.nombre, '30');
    r.egal('et règle la police', taille.parLeCurseur.style, 30);

    // L'interligne suit la police. Il ne bougeait pas : un bloc écrit en 24
    // avec 29 px d'interligne gardait ses 29 px une fois passé en 60 (lignes
    // qui se chevauchent) ou en 12 (gouffres entre les lignes).
    const interligne = await page.evaluate(() => {
        const nombre = document.getElementById('font-size-num');
        const poser = (v) => {
            nombre.value = String(v);
            nombre.dispatchEvent(new Event('input', { bubbles: true }));
            return { fs: activeStyle.fontSize, lh: activeStyle.lineHeight };
        };
        activeStyle.fontSize = 24; activeStyle.lineHeight = 29;
        activeStyle.interligneRatio = null;
        const grand = poser(60);
        const petit = poser(12);
        // Une longue série ne doit pas faire enfler le rapport : le redéduire
        // à chaque fois des valeurs ARRONDIES le poussait vers le haut.
        [90, 30, 100, 18, 45, 24, 72, 16, 24].forEach(poser);
        const apresLaSerie = { fs: activeStyle.fontSize, lh: activeStyle.lineHeight };
        return { grand, petit, apresLaSerie };
    });
    r.verifie('agrandir la police écarte les lignes d\'autant',
        Math.abs(interligne.grand.lh / 60 - 29 / 24) < 0.03, JSON.stringify(interligne.grand));
    r.verifie('la réduire les resserre d\'autant',
        Math.abs(interligne.petit.lh / 12 - 29 / 24) < 0.05, JSON.stringify(interligne.petit));
    r.verifie('et dix changements de taille ne le font pas dériver',
        Math.abs(interligne.apresLaSerie.lh - 29) <= 1, JSON.stringify(interligne.apresLaSerie));

    // Un interligne réglé à la main est un choix : c'est SON rapport qui suit
    const choisi = await page.evaluate(() => {
        activeStyle.fontSize = 20; activeStyle.lineHeight = 24;
        activeStyle.interligneRatio = null;
        editingTextId = null; selectedItems = [];
        poserLInterligne(40);                                 // 24 → 40, soit ×2
        const large = { fs: activeStyle.fontSize, lh: activeStyle.lineHeight };
        const nombre = document.getElementById('font-size-num');
        nombre.value = '40'; nombre.dispatchEvent(new Event('input', { bubbles: true }));
        return { large, apres: { fs: activeStyle.fontSize, lh: activeStyle.lineHeight } };
    });
    r.egal('régler l\'interligne à la main l\'écarte', choisi.large.lh, 40);
    r.egal('et ce choix survit au changement de police', choisi.apres.lh, 80);

    // Reprendre un bloc existant, c'est reprendre SON interligne
    const repris = await page.evaluate(() => {
        texts.length = 0;
        const t = { id: nextId++, x: 0, y: 0, content: 'a', fontSize: 30, lineHeight: 36,
                    color: '#000', fontFamily: 'sans-serif', align: 'left', z: globalZ++ };
        texts.push(t); draw();
        selectedItems = [{ type: 'text', id: t.id }];
        if (typeof syncStyleFromSelection === 'function') syncStyleFromSelection();
        else if (typeof updateQuickMenu === 'function') updateQuickMenu();
        const nombre = document.getElementById('font-size-num');
        nombre.value = '60'; nombre.dispatchEvent(new Event('input', { bubbles: true }));
        selectedItems = [];
        return { fs: texts[0].fontSize, lh: texts[0].lineHeight };
    });
    r.egal('changer la taille d\'un bloc choisi emporte son interligne',
        [repris.fs, repris.lh], [60, 72]);

    // --- UN SIGNE DOLLAR NE DOIT RIEN CASSER ---
    // Trois endroits appelaient « createMathImage », et cette fonction
    // n'existait nulle part. Écrire « 12 $ environ » levait donc une erreur AU
    // MILIEU de la validation : le bloc était déjà posé, la saisie ne se
    // refermait pas, et le texte se retrouvait EN DOUBLE sur le tableau.
    await page.evaluate(() => {
        texts.length = 0; freehands.length = 0; images.length = 0;
        finalizeText(); setMode('text'); draw();
    });
    await page.mouse.click(520, 380);
    await page.waitForTimeout(250);
    await page.keyboard.type('Le prix est de 12 $ environ');
    await page.mouse.click(220, 640);
    await page.waitForTimeout(450);
    const dollar = await page.evaluate(() => ({
        blocs: texts.length,
        contenu: (texts[0] && texts[0].content || '').replace(/<[^>]*>/g, ''),
        resteEcrit: document.getElementById('wysiwyg-text').innerText.trim()
    }));
    r.egal('un dollar isolé ne pose qu\'UN bloc de texte', dollar.blocs, 1);
    // La validation doit aller à son terme : le bloc est posé et la zone
    // repart VIDE. (Elle repart, et ne se referme pas : l'outil Texte en main,
    // le clic ailleurs rouvre une saisie sous le pointeur — c'est voulu. Ce
    // qu'on traque ici, c'est l'erreur en plein milieu, qui laissait le texte
    // dans la zone tout en le posant déjà sur le tableau.)
    r.verifie('et la validation va à son terme : la saisie repart vide',
        dollar.resteEcrit === '', JSON.stringify(dollar));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const refermee = await page.evaluate(() => ({
        blocs: texts.length,
        fermee: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'none'
    }));
    r.verifie('et Échap la referme sans rien poser de plus',
        refermee.fermee && refermee.blocs === 1, JSON.stringify(refermee));
    r.verifie('le texte est intact', dollar.contenu.indexOf('12 $ environ') >= 0, dollar.contenu);

    // Et la formule, elle, se compose vraiment : c'est ce que ces appels
    // attendaient depuis le début.
    const formule = await page.evaluate(() => new Promise(ok => {
        let fait = false;
        createMathImage('Soit $x^2 + 1$ la fonction', '#1b3a6b', 30, (img, l, h) => {
            if (fait) return; fait = true;
            ok({ image: !!img, large: l > 40, haute: h > 10 });
        });
        setTimeout(() => { if (!fait) { fait = true; ok({ image: false, large: false, haute: false }); } }, 5000);
    }));
    r.egal('une vraie formule donne bien une image', formule, { image: true, large: true, haute: true });
    // Un texte sans formule n'en fabrique pas : sinon toute phrase deviendrait
    // une image, et l'on perdrait le choix de la police et de l'alignement.
    const sansFormule = await page.evaluate(() => new Promise(ok => {
        createMathImage('une phrase ordinaire', '#000', 24, (img) => ok(!!img));
        setTimeout(() => ok('délai'), 3000);
    }));
    r.egal('un texte sans formule reste du texte', sansFormule, false);
    await page.evaluate(() => { setMode('pointer'); texts.length = 0; draw(); });

    // ==================================================================
    // DEUX GESTES POUR UN OUTIL : LE CURSEUR, ET LA COLONNE
    //
    // « Un simple clic on pose le curseur, et un clic sans relâcher puis
    // relâcher on fait une zone de texte, c'est possible ? »
    //
    // C'était possible parce que la moitié existait : un bloc a déjà une
    // largeur de colonne — le repli automatique la pose quand la ligne atteint
    // le bord, les poignées latérales l'ajustent, et le champ de saisie sait
    // s'y conformer. Il ne manquait que le geste qui la fixe D'AVANCE.
    //
    // LES DEUX COMMENCENT PAR LE MÊME APPUI : on ne tranche donc qu'au
    // relâchement, sur la distance parcourue. C'est ce qui s'éprouve ici — les
    // deux moitiés, sans quoi « la boîte marche » ne dirait pas si le clic,
    // lui, marche encore.
    // ==================================================================
    const aPlat = () => page.evaluate(() => {
        texts.length = 0; images.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        setMode('text'); draw();
    });
    const leTexte = () => page.evaluate(() => texts.map(t => ({
        x: Math.round(t.x), y: Math.round(t.y), col: t.colWidth || null,
        lignes: (t._cachedH && t.lineHeight) ? Math.round(t._cachedH / t.lineHeight) : null
    })));

    // 1. LE CLIC RESTE UN CURSEUR — et la ligne l'enfourche, elle ne pend pas
    //    dessous : le bloc s'ouvre une demi-interligne PLUS HAUT que le clic.
    await aPlat();
    await page.mouse.click(400, 300);
    await page.waitForTimeout(250);
    await page.keyboard.type('un clic');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const parLeClic = await leTexte();
    r.verifie('un simple clic pose toujours un curseur, sans colonne',
        parLeClic.length === 1 && parLeClic[0].col === null
        && parLeClic[0].x === 400 && parLeClic[0].y < 300,
        JSON.stringify(parLeClic));

    // 2. TIRER DESSINE UNE COLONNE. Le bloc naît à son coin — et non au milieu
    //    d'une ligne — avec la largeur tracée, et le texte s'y replie.
    await aPlat();
    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(700, 340, { steps: 8 });
    const pendantLeTrace = await page.evaluate(() => ({
        enCours: !!boiteTexte,
        // Rien n'est encore posé : la saisie n'ouvre qu'au relâchement.
        champOuvert: getComputedStyle(document.getElementById('wysiwyg-text')).display !== 'none'
    }));
    await page.mouse.up();
    await page.waitForTimeout(250);
    const aLOuverture = await page.evaluate(() => ({
        col: tempTextLogicalPos ? tempTextLogicalPos.colWidth : null,
        champ: Math.round(document.getElementById('wysiwyg-text').getBoundingClientRect().width)
    }));
    r.egal('pendant le tracé, rien n\'est encore ouvert',
        pendantLeTrace, { enCours: true, champOuvert: false });
    r.egal('le champ s\'ouvre à la largeur tracée', [aLOuverture.col, aLOuverture.champ], [400, 400]);

    await page.keyboard.type('une phrase assez longue pour devoir revenir à la ligne toute seule dans sa colonne');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const parLaBoite = await leTexte();
    r.verifie('le bloc garde sa colonne, naît à son coin, et le texte s\'y replie',
        parLaBoite.length === 1 && parLaBoite[0].col === 400
        && parLaBoite[0].x === 300 && parLaBoite[0].y === 200
        && parLaBoite[0].lignes >= 2,
        JSON.stringify(parLaBoite));

    // 3. ET LA MAIN GARDE LE DERNIER MOT. Le repli automatique ne touche jamais
    //    une colonne choisie : c'est ce qui rend le geste utile — sans quoi la
    //    largeur tracée serait reprise dès la première ligne un peu longue.
    const aLArrivee = await page.evaluate(() => (texts[0] || {}).colWidth);
    r.egal('la largeur tracée survit à la frappe', aLArrivee, 400);

    // UNE COLONNE TRACÉE JUSQU'AU BORD N'EST PAS RÉTRÉCIE PAR LA MACHINE.
    //
    // C'est le seul endroit où les deux se disputent la même largeur : le repli
    // automatique se déclenche quand la ligne déborde de ce qu'il reste à
    // droite, et une colonne dessinée jusqu'au bord déborde par construction.
    // Sans le garde-fou, elle se ferait reprendre au premier mot un peu long —
    // et l'on aurait dessiné pour rien.
    //
    // Il a fallu METTRE LA SCÈNE EN PLACE pour le voir : appeler le repli à la
    // main ne suffisait pas, la boîte de saisie étant refermée, sa largeur vaut
    // alors zéro et le repli renonce avant même d'atteindre le garde-fou.
    // Le geste est envoyé DIRECTEMENT au tableau : pour déborder, la colonne
    // doit finir à moins de trente pixels du bord droit, et c'est là que vit la
    // languette du tiroir — elle intercepterait le relâchement d'une vraie
    // souris, et l'on éprouverait le tiroir au lieu du texte.
    await aPlat();
    const auBord = await page.evaluate(async () => {
        const board = document.getElementById('board');
        const b = board.getBoundingClientRect();
        const fin = window.innerWidth - 6;
        const geste = (quoi, x, boutons) => board.dispatchEvent(new PointerEvent(quoi, {
            bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: boutons, clientX: x, clientY: b.top + 250
        }));
        geste('pointerdown', 100, 1);
        geste('pointermove', fin, 1);
        geste('pointerup', fin, 0);
        await new Promise(ok => setTimeout(ok, 250));
        return {
            col: tempTextLogicalPos ? tempTextLogicalPos.colWidth : null,
            // Ce qu'il reste à droite : c'est à cela que le repli compare.
            reste: Math.round((window.innerWidth
                - document.getElementById('wysiwyg-text').getBoundingClientRect().left - 30) / zoom)
        };
    });
    r.verifie('la colonne tracée dépasse bien ce qui reste à droite — sinon on n\'éprouve rien',
        auBord.col > auBord.reste, JSON.stringify(auBord));
    await page.keyboard.type('un mot puis un autre et encore un autre pour remplir la ligne entière');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    r.egal('et le repli automatique ne la rétrécit pas',
        await page.evaluate(() => (texts[0] || {}).colWidth), auBord.col);

    // 4. UN TREMBLEMENT N'EST PAS UNE BOÎTE. La main qui tient une craie ne
    //    tient pas un point parfaitement immobile : quelques pixels restent un
    //    clic, sinon le geste le plus courant deviendrait le plus rare.
    await aPlat();
    await page.mouse.move(500, 400);
    await page.mouse.down();
    await page.mouse.move(503, 402);
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.keyboard.type('tremblé');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const tremble = await leTexte();
    r.verifie('trois pixels de tremblement restent un curseur',
        tremble.length === 1 && tremble[0].col === null, JSON.stringify(tremble));

    // 5. ET UNE BOÎTE COMMENCÉE NE SURVIT PAS AU CHANGEMENT D'OUTIL.
    await aPlat();
    await page.mouse.move(300, 500);
    await page.mouse.down();
    await page.mouse.move(600, 560, { steps: 4 });
    const abandon = await page.evaluate(() => {
        const avant = !!boiteTexte;
        setMode('freehand');
        return { avant, apres: !!boiteTexte };
    });
    await page.mouse.up();
    await page.waitForTimeout(200);
    r.egal('changer d\'outil en plein tracé range la boîte', abandon, { avant: true, apres: false });
    r.egal('et rien n\'est écrit', await page.evaluate(() => texts.length), 0);

    await page.evaluate(() => { setMode('pointer'); texts.length = 0; draw(); });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
