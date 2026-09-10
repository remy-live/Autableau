// « Ce qu'on tape est ce qui sort » : pour chaque scénario, on compare ligne à
// ligne la zone de saisie (HTML) et le rendu du tableau (canvas) — nombre de
// lignes, largeur, espacement, couleur et taille.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Mesure des lignes réellement affichées dans la zone de saisie
const MESURE_HTML = `(() => {
    const z = document.getElementById('wysiwyg-text');
    const morceaux = [];
    const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
        const n = w.currentNode;
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const el = n.parentElement;
        const cs = getComputedStyle(el);
        const r = document.createRange();
        r.selectNodeContents(n);
        Array.from(r.getClientRects()).forEach(rc => {
            if (rc.width <= 0) return;
            morceaux.push({ haut: rc.top, bas: rc.bottom, gauche: rc.left, droite: rc.right,
                            couleur: cs.color, taille: parseFloat(cs.fontSize) });
        });
    }
    // Deux morceaux de tailles différentes posés sur la même ligne n'ont pas le
    // même « top » : on les regroupe s'ils se chevauchent verticalement.
    morceaux.sort((a, b) => a.haut - b.haut || a.gauche - b.gauche);
    const lignes = [];
    morceaux.forEach(m => {
        const L = lignes.find(l => {
            const chevauche = Math.min(l.bas, m.bas) - Math.max(l.haut, m.haut);
            return chevauche > 0.5 * Math.min(l.bas - l.haut, m.bas - m.haut);
        });
        if (!L) { lignes.push({ haut: m.haut, bas: m.bas, gauche: m.gauche, droite: m.droite, couleurs: [m.couleur], taille: m.taille }); return; }
        L.haut = Math.min(L.haut, m.haut); L.bas = Math.max(L.bas, m.bas);
        L.gauche = Math.min(L.gauche, m.gauche); L.droite = Math.max(L.droite, m.droite);
        L.taille = Math.max(L.taille, m.taille);
        if (!L.couleurs.includes(m.couleur)) L.couleurs.push(m.couleur);
    });
    // Repère commun aux deux rendus : le haut de la ligne, c'est-à-dire le haut
    // du plus gros morceau (côté canvas, c'est exactement « y » de la ligne).
    return lignes.sort((a, b) => a.haut - b.haut)
        .map(L => ({ top: L.haut, largeur: L.droite - L.gauche, couleurs: L.couleurs, taille: L.taille }));
})()`;

// Mêmes mesures, côté tableau
const MESURE_CANVAS = `(() => {
    const t = texts[texts.length - 1];
    if (!t) return null;
    const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
    const enRgb = (c) => {
        if (!c) return null;
        if (c.startsWith('rgb')) return c;
        const d = document.createElement('span');
        d.style.color = c; document.body.appendChild(d);
        const v = getComputedStyle(d).color; document.body.removeChild(d);
        return v;
    };
    return {
        base: t.fontSize,
        lignes: lay.lines.map(L => ({
            top: L.y,
            largeur: L.contentW - (L.markerW || 0),
            couleurs: Array.from(new Set(L.segs.filter(s => s.text.trim()).map(s => enRgb((s.style && s.style.color) || t.color)))),
            taille: L.tailleMax || L.size
        }))
    };
})()`;

module.exports = async function (browser) {
    const r = creerRapport('WYSIWYG');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // Ouvre une saisie neuve et joue une suite d'actions, puis compare
    async function scenario(nom, actions, options = {}) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        await tableauVierge(page);
        await page.evaluate(() => setMode('text'));
        await page.mouse.click(260, 280);
        await page.waitForTimeout(300);

        await actions();
        await page.waitForTimeout(200);

        const html = await page.evaluate(MESURE_HTML);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const canvas = await page.evaluate(MESURE_CANVAS);

        if (!canvas) { r.verifie(`${nom} : le texte est bien posé`, false, 'aucun objet créé'); return; }
        r.egal(`${nom} : même nombre de lignes`, canvas.lignes.length, html.length);

        const n = Math.min(canvas.lignes.length, html.length);
        let largeurOk = true, espaceOk = true, couleurOk = true, tailleOk = true;
        let detail = '';
        for (let i = 0; i < n; i++) {
            const c = canvas.lignes[i], h = html[i];
            if (Math.abs(c.largeur - h.largeur) > (options.tolLargeur || 3)) {
                largeurOk = false; detail += `L${i + 1} largeur ${c.largeur.toFixed(1)} vs ${h.largeur.toFixed(1)}; `;
            }
            if (i > 0) {
                const dc = c.top - canvas.lignes[0].top;
                const dh = h.top - html[0].top;
                if (Math.abs(dc - dh) > 1.5) { espaceOk = false; detail += `L${i + 1} écart ${dc.toFixed(1)} vs ${dh.toFixed(1)}; `; }
            }
            if (c.couleurs.sort().join('|') !== h.couleurs.sort().join('|')) {
                couleurOk = false; detail += `L${i + 1} couleurs ${c.couleurs} vs ${h.couleurs}; `;
            }
            if (Math.abs(c.taille - h.taille) > 0.6) {
                tailleOk = false; detail += `L${i + 1} taille ${c.taille.toFixed(1)} vs ${h.taille.toFixed(1)}; `;
            }
        }
        r.verifie(`${nom} : largeur des lignes`, largeurOk, detail);
        r.verifie(`${nom} : espacement des lignes`, espaceOk, detail);
        r.verifie(`${nom} : couleurs`, couleurOk, detail);
        r.verifie(`${nom} : tailles`, tailleOk, detail);
    }

    const couleur = async (hex) => {
        await page.click('#text-toolbar .tt-tab[data-panel="color"]');
        await page.waitForTimeout(120);
        await page.click(`#text-toolbar .tt-panel[data-panel="color"] .color-dot[data-color="${hex}"]`);
        await page.waitForTimeout(120);
        await page.click('#text-toolbar .tt-tab[data-panel="color"]'); // referme le tiroir
        await page.waitForTimeout(100);
    };

    const surligner = (recherche) => page.evaluate((mot) => {
        const z = document.getElementById('wysiwyg-text');
        const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
            const n = w.currentNode;
            const i = n.nodeValue.indexOf(mot);
            if (i >= 0) {
                const r = document.createRange();
                r.setStart(n, i); r.setEnd(n, i + mot.length);
                const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
                return true;
            }
        }
        return false;
    }, recherche);

    await scenario('deux lignes', async () => {
        await page.keyboard.type('Premiere ligne');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Deuxieme ligne');
    });

    await scenario('couleur en cours de frappe', async () => {
        await page.keyboard.type('Avant');
        await page.keyboard.press('Enter');
        await couleur('#e74c3c');
        await page.keyboard.type('Apres en rouge');
    });

    await scenario('gras et italique', async () => {
        await page.keyboard.type('normal ');
        await page.click('#text-toolbar .btn-format[data-command="bold"]');
        await page.keyboard.type('gras');
        await page.click('#text-toolbar .btn-format[data-command="bold"]');
        await page.keyboard.press('Enter');
        await page.keyboard.type('suite');
    });

    await scenario('un mot agrandi', async () => {
        await page.keyboard.type('petit grand');
        await surligner('grand');
        await page.click('#text-toolbar .tt-tab[data-panel="size"]');
        await page.waitForTimeout(120);
        for (let i = 0; i < 8; i++) await page.click('#btn-size-up');
    });

    await scenario('un mot coloré', async () => {
        await page.keyboard.type('mot cle important');
        await surligner('cle');
        await couleur('#3498db');
    });

    await scenario('liste à puces', async () => {
        await page.keyboard.type('- pommes');
        await page.keyboard.press('Enter');
        await page.keyboard.type('poires');
    });

    await scenario('titre puis corps', async () => {
        await page.keyboard.type('# Ma lecon');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Le corps du texte');
    });

    await scenario('mélange complet', async () => {
        await page.keyboard.type('# Titre');
        await page.keyboard.press('Enter');
        await page.keyboard.type('- premier');
        await page.keyboard.press('Enter');
        await page.keyboard.type('second');
        await surligner('second');
        await couleur('#2ecc71');
    });

    // Réédition : on rouvre un bloc existant, on ajoute une ligne d'une autre
    // couleur — l'ancienne ne doit pas être repeinte.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(260, 280);
    await page.waitForTimeout(300);
    await page.keyboard.type('Premiere');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const pt = await page.evaluate(() => {
        setMode('pointer');
        const t = texts[0];
        return { x: (t._cachedStartX + t._cachedW / 2) * zoom + panX, y: (t.y + t._cachedH / 2) * zoom + panY };
    });
    await page.mouse.dblclick(pt.x, pt.y);
    await page.waitForTimeout(400);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await couleur('#9b59b6');
    await page.keyboard.type('Ajoutee');
    await page.waitForTimeout(200);

    const htmlRe = await page.evaluate(MESURE_HTML);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const canvasRe = await page.evaluate(MESURE_CANVAS);
    r.egal('réédition : même nombre de lignes', canvasRe.lignes.length, htmlRe.length);
    const memeCouleurs = canvasRe.lignes.every((L, i) =>
        htmlRe[i] && L.couleurs.sort().join('|') === htmlRe[i].couleurs.sort().join('|'));
    r.verifie('réédition : couleurs conservées',
        memeCouleurs, JSON.stringify({ canvas: canvasRe.lignes.map(l => l.couleurs), html: htmlRe.map(l => l.couleurs) }));

    // Position VERTICALE de la première ligne dans son bloc : le navigateur
    // centre chaque ligne dans son interligne, le tableau doit faire pareil.
    // Sans cela, le texte remonte dès qu'on élargit l'interligne.
    const interlignes = await page.evaluate(() => {
        const cas = [[24, 29], [40, 48], [40, 80], [24, 60], [60, 66]];
        return cas.map(([fs, lh]) => {
            texts.length = 0;
            const t = { id: nextId++, x: 0, y: 0, content: 'Ligne un<div>Ligne deux</div>',
                        fontSize: fs, lineHeight: lh, color: '#000', fontFamily: 'sans-serif', align: 'left', z: globalZ++ };
            texts.push(t); draw();
            const lay = layoutTextObject(t, document.getElementById('board').getContext('2d'));
            const canvas = lay.lines[0].y + (lay.lines[0].demiInterligne || 0);

            const clone = document.getElementById('wysiwyg-text').cloneNode(false);
            Object.assign(clone.style, { display: 'block', position: 'absolute', left: '-9999px', top: '0px',
                fontSize: fs + 'px', fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', width: '600px' });
            clone.style.lineHeight = String(lh / fs);
            clone.style.setProperty('--tt-lh', lh + 'px');
            clone.innerHTML = t.content;
            document.body.appendChild(clone);
            const base = clone.getBoundingClientRect();
            const n = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT).nextNode();
            const rr = document.createRange(); rr.selectNodeContents(n);
            const html = rr.getBoundingClientRect().top - base.top;
            document.body.removeChild(clone);
            return { fs, lh, ecart: Math.round((canvas - html) * 10) / 10 };
        });
    });
    interlignes.forEach(c => {
        r.verifie(`première ligne au bon niveau (police ${c.fs}, interligne ${c.lh})`,
            Math.abs(c.ecart) <= 1, `${c.ecart} px d'écart`);
    });

    // Un bloc centré AVEC une colonne : x est le bord gauche des deux côtés.
    // C'est là que la réédition partait une demi-colonne trop loin.
    const centreEnColonne = await page.evaluate(() => {
        texts.length = 0;
        const t = { id: nextId++, x: -300, y: -100, content: 'fdsdsfddfsfds<div>fdsfds</div>',
                    fontSize: 40, lineHeight: 48, colWidth: 600, align: 'center',
                    color: '#e74c3c', fontFamily: 'sans-serif', align: 'center', z: globalZ++ };
        texts.push(t); draw();
        return { gauche: Math.round(t._cachedStartX), x: t.x, largeur: Math.round(t._cachedW) };
    });
    r.egal('bloc centré avec colonne : x reste le bord gauche', centreEnColonne.gauche, centreEnColonne.x);
    r.egal('bloc centré avec colonne : la largeur est la colonne', centreEnColonne.largeur, 600);

    // Double-clic pour éditer : le bloc quitte le tableau et passe dans la zone
    // de saisie. Si l'on ne repeint pas tout de suite, les lettres du canevas
    // restent sous celles de la saisie — le fameux doublon en léger décalage,
    // qui s'effaçait tout seul au premier mouvement de souris. On mesure donc
    // l'encre APRÈS le double-clic et SANS bouger la souris ensuite.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await tableauVierge(page);
    const cible = await page.evaluate(() => {
        setMode('pointer');
        texts.length = 0;
        panX = 0; panY = 0; zoom = 1;
        const t = { id: nextId++, x: 200, y: 200, content: 'Doublon au double-clic',
                    fontSize: 34, lineHeight: 42, color: '#e74c3c',
                    fontFamily: 'sans-serif', align: 'left', z: globalZ++ };
        texts.push(t); draw();
        // On compte deux choses dans la zone du bloc, largement débordée pour
        // attraper les poignées : l'encre rouge du texte, et le violet du
        // cadre de sélection et de ses poignées.
        const compter = () => {
            const g = document.getElementById('board').getContext('2d');
            const d = g.getImageData(t.x + panX - 40, t.y + panY - 45,
                                     Math.round(t._cachedW * zoom) + 80,
                                     Math.round(t._cachedH * zoom) + 90).data;
            let encre = 0, cadre = 0;
            for (let i = 0; i < d.length; i += 4) {
                const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]];
                if (rr > 150 && gg < 140 && bb < 140) encre++;
                else if (bb > 150 && bb - rr > 25 && bb - gg > 40) cadre++;
            }
            return { encre, cadre };
        };
        window.__etatDuBloc = compter;
        // Le bloc est choisi : c'est l'état d'où part un double-clic pour
        // éditer, cadre et poignées compris.
        selectedItems = [{ type: 'text', id: t.id }];
        if (typeof updateQuickMenu === 'function') updateQuickMenu();
        draw();
        return { x: t._cachedStartX + t._cachedW / 2, y: t.y + t._cachedH / 2,
                 avant: compter(),
                 menu: !!document.querySelector('#quick-edit-menu.visible') };
    });
    r.verifie('le bloc est bien peint avant le double-clic', cible.avant.encre > 200, JSON.stringify(cible.avant));
    r.verifie('avec son cadre de sélection et ses poignées', cible.avant.cadre > 200, JSON.stringify(cible.avant));
    r.verifie('et son menu rapide', cible.menu);
    // On lit l'encre dans la même tâche que le double-clic : aucune image
    // suivante ne peut passer entre les deux. C'est bien ce que voit l'œil
    // tant que rien d'autre ne provoque de repeinture.
    const apres = await page.evaluate(({ x, y }) => {
        const board = document.getElementById('board');
        const r = board.getBoundingClientRect();
        const ev = (nom) => board.dispatchEvent(new MouseEvent(nom, {
            bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, detail: 2
        }));
        ev('dblclick');
        return { enSaisie: !!editingTextId, ...window.__etatDuBloc(),
                 menu: !!document.querySelector('#quick-edit-menu.visible') };
    }, { x: cible.x, y: cible.y });
    r.verifie('le double-clic ouvre bien la saisie', apres.enSaisie, JSON.stringify(apres));
    r.verifie('plus de doublon : le tableau est repeint sans attendre l\'image suivante',
        apres.encre === 0, `${apres.encre} pixels d'encre restés sous la zone de saisie`);
    r.verifie('ni cadre de sélection ni poignées pendant qu\'on écrit',
        apres.cadre === 0, `${apres.cadre} pixels de cadre restés`);
    r.verifie('et le menu rapide s\'efface', !apres.menu, JSON.stringify(apres));
    // La saisie prend le focus 10 ms après le double-clic : on la laisse
    // s'installer avant de la refermer, sinon l'Échap part dans le vide.
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Le tiroir des symboles : le « fois » des mathématiques (×) n'est ni la
    // lettre x ni l'astérisque, et le « divisé » (÷) n'est pas la barre
    // oblique — le clavier ne les donne pas.
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('12 ');
    const symboles = await page.evaluate(() => {
        const clic = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.click();
            return true;
        };
        const onglet = clic('#text-toolbar .tt-tab[data-panel="symb"]');
        const ouvert = !!document.querySelector('#text-toolbar .tt-panel[data-panel="symb"].tt-open');
        clic('#text-toolbar .tt-symb[data-symbole="×"]');
        // Le tiroir reste ouvert : on en pose souvent plusieurs de suite
        const resteOuvert = !!document.querySelector('#text-toolbar .tt-panel[data-panel="symb"].tt-open');
        return { onglet, ouvert, resteOuvert,
                 texte: document.getElementById('wysiwyg-text').textContent };
    });
    r.verifie('la barre de texte a un onglet Symboles', symboles.onglet);
    r.verifie('qui ouvre son tiroir', symboles.ouvert);
    r.egal('le × s\'écrit à la suite du texte', symboles.texte, '12 ×');
    r.verifie('et le tiroir reste ouvert pour le suivant', symboles.resteOuvert);

    await page.keyboard.type(' 4 ');
    const suite = await page.evaluate(() => {
        insererSymbole('÷');
        return document.getElementById('wysiwyg-text').textContent;
    });
    r.egal('puis le ÷ au bon endroit', suite, '12 × 4 ÷');

    // Ce qu'on a posé se retrouve tel quel sur le tableau
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    r.egal('les symboles arrivent intacts sur le tableau',
        await page.evaluate(() => (texts[0] || {}).content.replace(/<[^>]*>/g, '')), '12 × 4 ÷');

    // Passer par le tiroir pour chaque « fois » d'une table de multiplication
    // serait une corvée : le symbole arrive à la frappe.
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('7 * 8 // 2 <= 9 != 3 -> 4 ... ^2');
    await page.waitForTimeout(150);
    r.egal('le * devient ×, le // devient ÷, et le reste suit',
        await page.evaluate(() => document.getElementById('wysiwyg-text').textContent),
        '7 × 8 ÷ 2 ≤ 9 ≠ 3 → 4 … ²');

    // Une date garde ses barres obliques : c'est « // » qui déclenche, pas « / »
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await tableauVierge(page);
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('Né le 19/06/2013, 3.5 et a..b');
    await page.waitForTimeout(150);
    r.egal('une date, un nombre décimal et deux points ne sont pas touchés',
        await page.evaluate(() => document.getElementById('wysiwyg-text').textContent),
        'Né le 19/06/2013, 3.5 et a..b');

    // Et l'on peut toujours écrire une vraie astérisque
    await page.keyboard.type(' *');
    await page.waitForTimeout(100);
    const avantRetour = await page.evaluate(() => document.getElementById('wysiwyg-text').textContent);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const apresRetour = await page.evaluate(() => document.getElementById('wysiwyg-text').textContent);
    r.verifie('le * s\'est bien transformé', /×$/.test(avantRetour), avantRetour.slice(-6));
    r.verifie('un Retour arrière juste après rend l\'astérisque',
        /\*$/.test(apresRetour), apresRetour.slice(-6));
    // Un second Retour arrière efface pour de bon : on n'est pas piégé
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    r.verifie('et le suivant l\'efface',
        await page.evaluate(() => /\s$/.test(document.getElementById('wysiwyg-text').textContent)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // L'aide est écrite depuis la même table que le clavier
    const aide = await page.evaluate(() => {
        remplirAideRaccourcis();
        const el = document.getElementById('aide-remplacements-texte');
        return { t: el ? el.textContent : '', n: REMPLACEMENTS_TEXTE.length };
    });
    r.verifie('l\'aide liste les transformations à la frappe',
        aide.n === 11 && /\*/.test(aide.t) && /×/.test(aide.t) && /÷/.test(aide.t), aide.t);

    // =====================================================================
    // AVEC L'OUTIL TEXTE EN MAIN, LE CLIC EST UN CURSEUR
    // Il fermait la saisie et s'arrêtait là : pour écrire la ligne suivante,
    // il fallait sortir de l'outil, le reprendre, puis re-cliquer — trois
    // gestes pour une ligne de plus, en direct devant la classe.
    // =====================================================================
    const enchaine = await page.evaluate(async () => {
        const c = document.getElementById('board');
        const w = document.getElementById('wysiwyg-text');
        texts.length = 0;
        setMode('text');
        const cliquer = (x, y) => {
            ['pointerdown', 'pointerup'].forEach(t => c.dispatchEvent(new PointerEvent(t, {
                bubbles: true, cancelable: true, clientX: x, clientY: y,
                pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0,
                buttons: t === 'pointerdown' ? 1 : 0 })));
        };
        const ouverte = () => w.style.display === 'block';

        cliquer(420, 300);
        await new Promise(r => setTimeout(r, 60));
        const premier = ouverte();
        w.innerText = 'première ligne';

        // On clique AILLEURS : ce qui est écrit se pose, et la saisie rouvre
        // sous le pointeur — on tape aussitôt, sans reprendre l'outil.
        cliquer(420, 460);
        await new Promise(r => setTimeout(r, 60));
        // Un bloc de texte garde ce qu'on a écrit dans « content ».
        const contenu = (t) => t.content || '';
        const apres = { ouverte: ouverte(), outil: mode, poses: texts.map(contenu) };
        w.innerText = 'seconde ligne';

        // Et la nouvelle saisie est bien à l'endroit désigné, pas restée
        // là où était la première.
        const bougee = tempTextLogicalPos
            && Math.abs((panY + tempTextLogicalPos.y * zoom) - 460) < 60;

        // Échap la referme pour de bon : on doit pouvoir en sortir.
        w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 60));
        const sortie = { ouverte: ouverte(), poses: texts.length };
        texts.length = 0; setMode('pointer'); draw();
        return { premier, apres, bougee, sortie };
    });
    r.egal('le clic ouvre la saisie, et le clic suivant pose la ligne ET en rouvre une',
        { premier: enchaine.premier, encore: enchaine.apres.ouverte,
          outil: enchaine.apres.outil, poses: enchaine.apres.poses },
        { premier: true, encore: true, outil: 'text', poses: [enchaine.apres.poses[0]] });
    r.verifie('et c\'est bien ce qu\'on venait d\'écrire qui s\'est posé',
        /première ligne/.test(enchaine.apres.poses[0] || ''),
        JSON.stringify(enchaine.apres.poses));
    r.verifie('et elle rouvre là où l\'on a cliqué, pas là où était la précédente',
        enchaine.bougee, String(enchaine.bougee));
    r.egal('Échap la referme pour de bon, en posant ce qui était écrit',
        enchaine.sortie, { ouverte: false, poses: 2 });

    // =====================================================================
    // LE MÊME ENCHAÎNEMENT, MAIS À LA VRAIE SOURIS
    // Les événements fabriqués à la main ne font pas tout : après le
    // « pointerdown » que nous traitons, un vrai clic envoie encore son
    // « mousedown », qui retire le focus du bloc de saisie. Ce blur-là
    // refermait la zone à peine rouverte — on tapait dans le vide, et pas un
    // test ne le voyait. On refait donc le geste pour de bon, au clavier et à
    // la souris, sans jamais toucher au DOM.
    // =====================================================================
    await page.evaluate(() => {
        texts.length = 0; panX = 0; panY = 0; zoom = 1;
        selectedItems = []; setMode('text'); draw();
    });
    await page.mouse.click(430, 300);
    await page.waitForTimeout(150);
    await page.keyboard.type('première ligne');
    await page.mouse.click(430, 430);
    await page.waitForTimeout(200);
    const vraiClic = await page.evaluate(() => ({
        ouverte: document.getElementById('wysiwyg-text').style.display === 'block',
        focus: document.activeElement ? document.activeElement.id : '',
        posees: texts.length
    }));
    r.verifie('à la vraie souris, le clic ailleurs rouvre bel et bien la saisie',
        vraiClic.ouverte, JSON.stringify(vraiClic));
    r.verifie('et le curseur y est déjà : le clic ne le fait pas fuir',
        vraiClic.focus === 'wysiwyg-text', JSON.stringify(vraiClic));

    await page.keyboard.type('seconde ligne');
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const deuxLignes = await page.evaluate(() => texts.map(t => (t.content || '').replace(/<[^>]*>/g, '')));
    r.verifie('on tape aussitôt, sans re-cliquer, et les deux lignes sont posées',
        deuxLignes.length === 2 && /première ligne/.test(deuxLignes[0] || '')
        && /seconde ligne/.test(deuxLignes[1] || ''), JSON.stringify(deuxLignes));

    await page.evaluate(() => { texts.length = 0; setMode('pointer'); draw(); });

    // =====================================================================
    // ET LE CLIC SUR UNE LIGNE DÉJÀ ÉCRITE LA ROUVRE
    // L'outil Texte en main, cliquer sur un texte posé basculait sur la
    // flèche et se mettait à le traîner : pour corriger un mot, il fallait
    // sortir de l'outil et double-cliquer. À la vraie souris, là encore : le
    // blur du clic ne doit pas refermer ce que le clic vient d'ouvrir.
    // =====================================================================
    await page.evaluate(() => {
        texts.length = 0; panX = 0; panY = 0; zoom = 1;
        selectedItems = []; isDraggingObjs = false; setMode('text'); draw();
    });
    await page.mouse.click(430, 320);
    await page.waitForTimeout(150);
    await page.keyboard.type('le mot a corriger');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const posee = await page.evaluate(() => {
        const t = texts[0];
        return t ? { id: t.id, x: panX + t.x * zoom, y: panY + t.y * zoom, h: t._cachedH || 20 } : null;
    });
    r.verifie('la ligne est posée avant qu\'on y revienne', !!posee, JSON.stringify(posee));

    await page.mouse.click(posee.x + 14, posee.y + posee.h / 2);
    await page.waitForTimeout(200);
    const reprise = await page.evaluate(() => ({
        ouverte: document.getElementById('wysiwyg-text').style.display === 'block',
        focus: document.activeElement ? document.activeElement.id : '',
        edite: editingTextId,
        outil: mode,
        dedans: document.getElementById('wysiwyg-text').innerText,
        nombre: texts.length,
        traine: !!isDraggingObjs
    }));
    r.verifie('l\'outil Texte en main, cliquer sur une ligne écrite la rouvre',
        reprise.ouverte && reprise.edite === posee.id, JSON.stringify(reprise));
    r.verifie('le curseur y est, prêt à corriger, sans second clic',
        reprise.focus === 'wysiwyg-text', JSON.stringify(reprise));
    r.verifie('on y retrouve ce qui était écrit',
        /le mot a corriger/.test(reprise.dedans || ''), JSON.stringify(reprise));
    r.verifie('sans basculer sur la flèche ni se mettre à la traîner',
        reprise.outil === 'text' && reprise.traine === false, JSON.stringify(reprise));
    r.verifie('et sans poser une seconde ligne par-dessus',
        reprise.nombre === 1, JSON.stringify(reprise));

    // La correction tapée remplace bien l'ancienne ligne, sans en créer une
    await page.keyboard.type(' !');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const corrigee = await page.evaluate(() => texts.map(t => (t.content || '').replace(/<[^>]*>/g, '')));
    r.verifie('la correction remplace la ligne au lieu d\'en ajouter une',
        corrigee.length === 1 && /le mot a corriger !/.test(corrigee[0] || ''), JSON.stringify(corrigee));

    // Et le cas qui les enchaîne : on écrit une ligne, et sans la valider on
    // va cliquer sur une ligne d'avant pour la corriger. Le clic pose la
    // nouvelle ET rouvre l'ancienne, d'un seul geste.
    await page.evaluate(() => { texts.length = 0; setMode('text'); draw(); });
    await page.mouse.click(430, 320);
    await page.waitForTimeout(150);
    await page.keyboard.type('ancienne');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const ancienne = await page.evaluate(() => {
        const t = texts[0];
        return t ? { id: t.id, x: panX + t.x * zoom, y: panY + t.y * zoom, h: t._cachedH || 20 } : null;
    });
    await page.mouse.click(430, 480);
    await page.waitForTimeout(150);
    await page.keyboard.type('toute fraiche');
    await page.mouse.click(ancienne.x + 14, ancienne.y + ancienne.h / 2);
    await page.waitForTimeout(220);
    const enchainee = await page.evaluate(() => ({
        ouverte: document.getElementById('wysiwyg-text').style.display === 'block',
        focus: document.activeElement ? document.activeElement.id : '',
        edite: editingTextId,
        dedans: document.getElementById('wysiwyg-text').innerText,
        posees: texts.map(t => (t.content || '').replace(/<[^>]*>/g, ''))
    }));
    r.verifie('en pleine saisie, le clic sur une ligne d\'avant la rouvre',
        enchainee.ouverte && enchainee.edite === ancienne.id
        && /ancienne/.test(enchainee.dedans || ''), JSON.stringify(enchainee));
    r.verifie('le curseur l\'a suivie, et la ligne en cours s\'est posée au passage',
        enchainee.focus === 'wysiwyg-text' && enchainee.posees.length === 2
        && enchainee.posees.some(t => /toute fraiche/.test(t)), JSON.stringify(enchainee));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.evaluate(() => { texts.length = 0; setMode('pointer'); isDraggingObjs = false; draw(); });

    // =====================================================================
    // UNE SEULE BARRE POUR LE MOT QU'ON ÉCRIT
    // « Pourquoi la barre de style apparaît alors qu'au-dessus du texte ça
    //   apparaît ? » — deux barres pour le même mot : celle du texte flotte
    //   au-dessus du bloc et porte le gras, la taille, la couleur ; celle du
    //   style affichait les mêmes réglages en haut de l'écran.
    // =====================================================================
    const deuxBarresDuTexte = await page.evaluate(async () => {
        texts.length = 0; panX = 0; panY = 0; zoom = 1; selectedItems = [];
        setMode('text'); updateStyleBarContext();
        await new Promise(r => setTimeout(r, 100));
        const vu = (id) => {
            const e = document.getElementById(id);
            const s = getComputedStyle(e);
            return s.display !== 'none' && parseFloat(s.opacity) > 0.05
                && e.getBoundingClientRect().height > 4;
        };
        const avant = vu('bar-style');
        // On ouvre la saisie : la barre du texte prend le relais. On ne
        // rappelle RIEN à la main — c'est justement ce qui manquait : la barre
        // de style était rendue muette au bon endroit, mais personne ne
        // repassait par là une fois la saisie ouverte.
        ouvrirLaSaisie(null, { x: 300, y: 300 });
        await new Promise(r => setTimeout(r, 200));
        const pendant = { style: vu('bar-style'), saisie: wysiwygText.style.display === 'block' };
        wysiwygText.innerText = 'un mot';
        finalizeText();
        await new Promise(r => setTimeout(r, 120));
        const apres = { style: vu('bar-style'), poses: texts.length };
        texts.length = 0; setMode('pointer'); draw();
        return { avant, pendant, apres };
    });
    r.verifie('l\'outil Texte en main, la barre de style est là',
        deuxBarresDuTexte.avant, JSON.stringify(deuxBarresDuTexte));
    r.egal('mais elle se tait pendant qu\'on écrit : la barre du texte suffit',
        deuxBarresDuTexte.pendant, { style: false, saisie: true });
    r.egal('et elle reprend la parole une fois le bloc posé',
        deuxBarresDuTexte.apres, { style: true, poses: 1 });

    // ET LE MÊME GESTE À LA VRAIE SOURIS. « Aucun intérêt des 3 barres » : la
    // barre de style était rendue muette au bon endroit, mais personne ne
    // repassait par là une fois la saisie ouverte — elle restait affichée avec
    // la taille et la couleur pendant que la barre du texte disait la même
    // chose au-dessus du mot.
    await page.evaluate(() => {
        texts.length = 0; panX = 0; panY = 0; zoom = 1; selectedItems = [];
        setMode('text'); draw();
    });
    await page.waitForTimeout(150);
    const barresVues = () => page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            if (!e) return false;
            const s = getComputedStyle(e);
            return s.display !== 'none' && parseFloat(s.opacity) > 0.05
                && e.getBoundingClientRect().height > 4;
        };
        return { texte: vu('text-toolbar'), style: vu('bar-style') };
    });
    await page.mouse.click(420, 320);
    await page.waitForTimeout(300);
    await page.keyboard.type('un mot');
    await page.waitForTimeout(200);
    const enEcrivant = await barresVues();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    const apresEcrit = await barresVues();
    await page.evaluate(() => { texts.length = 0; setMode('pointer'); draw(); });
    r.egal('à la vraie souris, écrire ne laisse QUE la barre du texte',
        enEcrivant, { texte: true, style: false });
    r.egal('et le bloc posé, la barre de style revient seule',
        apresEcrit, { texte: false, style: true });

    // =====================================================================
    // LE TIROIR PEND DE SON PROPRE BOUTON
    // « Taille, police, interligne » s'ouvrait collé au bord GAUCHE de la
    // barre, quel que soit l'onglet : le panneau paraissait à l'autre bout
    // de l'icône qui venait de l'ouvrir.
    // =====================================================================
    const tiroir = await page.evaluate(async () => {
        const tt = document.getElementById('text-toolbar');
        tt.style.display = 'flex';
        tt.style.left = '360px';
        tt.style.top = '300px';
        const ouvrirEtMesurer = async (nom) => {
            const onglet = tt.querySelector(`.tt-tab[data-panel="${nom}"]`);
            const panneau = tt.querySelector(`.tt-panel[data-panel="${nom}"]`);
            if (!onglet || !panneau) return 'introuvable';
            if (panneau.classList.contains('tt-open')) onglet.click();
            onglet.click();
            await new Promise(r => setTimeout(r, 40));
            const p = panneau.getBoundingClientRect();
            const m = { gauche: Math.round(p.left), droite: Math.round(p.right) };
            onglet.click();
            return m;
        };
        // AUX DEUX BORDS DE L'ÉCRAN, il ne doit pas sortir : centré sur son
        // bouton, un tiroir plus large que ce qui reste passerait dehors.
        tt.style.left = '0px';
        const auBordGauche = await ouvrirEtMesurer('size');
        tt.style.left = (window.innerWidth - tt.getBoundingClientRect().width) + 'px';
        const auBordDroit = await ouvrirEtMesurer('size');
        tt.style.left = '360px';

        const mesures = { auBordGauche, auBordDroit, ecran: window.innerWidth };
        for (const nom of ['size', 'para', 'align']) {
            const onglet = tt.querySelector(`.tt-tab[data-panel="${nom}"]`);
            const panneau = tt.querySelector(`.tt-panel[data-panel="${nom}"]`);
            if (!onglet || !panneau) { mesures[nom] = 'introuvable'; continue; }
            if (panneau.classList.contains('tt-open')) onglet.click();
            onglet.click();
            await new Promise(r => setTimeout(r, 40));
            const o = onglet.getBoundingClientRect(), p = panneau.getBoundingClientRect();
            mesures[nom] = {
                ecart: Math.round(Math.abs((o.left + o.width / 2) - (p.left + p.width / 2))),
                dansLEcran: p.left >= 0 && p.right <= window.innerWidth
            };
            onglet.click();
        }
        tt.style.display = 'none';
        return mesures;
    });
    r.verifie('chaque tiroir s\'ouvre centré sur l\'icône qui l\'a ouvert',
        ['size', 'para', 'align'].every(n => tiroir[n] && tiroir[n].ecart <= 2),
        JSON.stringify(tiroir));
    r.verifie('et aucun ne sort de l\'écran, même aux deux bords',
        ['size', 'para', 'align'].every(n => tiroir[n] && tiroir[n].dansLEcran)
        && tiroir.auBordGauche.gauche >= 0
        && tiroir.auBordDroit.droite <= tiroir.ecran,
        JSON.stringify({ gauche: tiroir.auBordGauche, droite: tiroir.auBordDroit }));

    // NI PAR LE HAUT. Le tiroir s'ouvre du côté opposé au texte pour ne pas
    // tomber dessus ; la barre collée au bord haut de la fenêtre l'ouvrait donc
    // vers le haut, et « les options étaient tronquées par le haut de la
    // fenêtre ». Il choisit maintenant le côté qui a la place.
    const enHautDeLEcran = await page.evaluate(async () => {
        const tt = document.getElementById('text-toolbar');
        const z = document.getElementById('wysiwyg-text');
        tt.style.display = 'flex';
        tt.style.left = '360px';
        // La barre tout en haut, et le bloc de saisie EN DESSOUS d'elle :
        // c'est le cas qui la faisait ouvrir vers le haut.
        tt.style.top = '2px';
        z.style.display = 'block';
        z.style.left = '360px';
        z.style.top = '200px';
        const onglet = tt.querySelector('.tt-tab[data-panel="size"]');
        const panneau = tt.querySelector('.tt-panel[data-panel="size"]');
        if (panneau.classList.contains('tt-open')) onglet.click();
        onglet.click();
        await new Promise(r => setTimeout(r, 60));
        const p = panneau.getBoundingClientRect();
        const m = { haut: Math.round(p.top), bas: Math.round(p.bottom),
                    vers: panneau.classList.contains('tt-up') ? 'haut' : 'bas',
                    ecran: window.innerHeight };
        onglet.click();
        tt.style.display = 'none';
        z.style.display = 'none';
        return m;
    });
    r.verifie('barre collée en haut, le tiroir descend au lieu d\'être tronqué',
        enHautDeLEcran.haut >= 0 && enHautDeLEcran.bas <= enHautDeLEcran.ecran,
        JSON.stringify(enHautDeLEcran));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
