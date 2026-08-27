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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
