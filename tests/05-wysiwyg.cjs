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
        await page.click(`#text-toolbar .tt-panel[data-panel="color"] .swatch[data-color="${hex}"]`);
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
        await couleur('#d63031');
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
        await couleur('#0984e3');
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
        await couleur('#00b894');
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
    await couleur('#6c5ce7');
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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
