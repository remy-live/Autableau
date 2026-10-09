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
        .map(L => ({ top: L.haut, gauche: L.gauche, largeur: L.droite - L.gauche, couleurs: L.couleurs, taille: L.taille }));
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
            // Où le TEXTE commence : le cran. La puce vit dans la gouttière,
            // à gauche, et n'entre donc pas dans ce repère (voir « markerW »
            // dans layoutTextObject).
            gauche: L.indent || 0,
            // « contentW » EST la largeur du texte, et c'est exactement ce que
            // mesure le côté DOM. La soustraction qui était ici défaisait
            // l'ancienne convention, où la puce était comptée comme du contenu
            // — convention abandonnée le jour où l'on a mesuré que le texte
            // d'une puce partait quinze pixels trop à droite sur le tableau.
            // Une correction de moins des deux côtés, la même grandeur comparée.
            largeur: L.contentW,
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
        let largeurOk = true, espaceOk = true, couleurOk = true, tailleOk = true, departOk = true;
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
            // ET LA MÊME CHOSE À L'HORIZONTALE, qui manquait : ce chapitre
            // comparait les hauteurs, les largeurs, les couleurs et les
            // tailles — jamais le point de DÉPART d'une ligne. C'est ainsi
            // qu'un retrait de liste a pu diverger de quinze pixels sans que
            // rien ne tombe. Comme pour le vertical, on compare l'écart à la
            // PREMIÈRE ligne : les deux rendus ne partent pas du même repère
            // absolu, mais leurs décalages internes doivent se répondre.
            {
                const gc = (c.gauche || 0) - (canvas.lignes[0].gauche || 0);
                const gh = (h.gauche || 0) - (html[0].gauche || 0);
                if (Math.abs(gc - gh) > 1.5) {
                    departOk = false; detail += `L${i + 1} départ ${gc.toFixed(1)} vs ${gh.toFixed(1)}; `;
                }
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
        r.verifie(`${nom} : position horizontale des lignes`, departOk, detail);
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
        // La taille est une réglette : on la pousse d'un geste.
        await page.evaluate(() => {
            const r2 = document.getElementById('tt-taille');
            r2.value = 32;
            r2.dispatchEvent(new Event('input', { bubbles: true }));
        });
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

    // ------------------------------------------------------------------
    // CHAQUE SYMBOLE MONTRE CE QU'IL POSE, ET IL EN POSE UN
    //
    // « Il manque le symbole n'appartient pas dans les caractères spéciaux. »
    // Il était le seul de la grille à n'avoir pas son contraire : ≠ répond
    // à =, ≤ et ≥ se font face, et ∈ restait seul.
    //
    // Le contrôle ne tient pas une liste — une liste se périme. Il vérifie
    // que CHAQUE bouton porte un symbole, et que ce qu'il montre est bien ce
    // qu'il écrit : un bouton muet ou qui ment se repère tout seul, y compris
    // celui qu'on ajoutera demain. Et il nomme la seule paire que l'usage
    // réclamait.
    // ------------------------------------------------------------------
    const grille = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('#text-toolbar .tt-symb')];
        const lus = btns.map(b => ({
            pose: b.getAttribute('data-symbole') || '',
            montre: (b.textContent || '').trim(),
            nom: b.getAttribute('title') || ''
        }));
        // L'espace insécable des guillemets ne se voit pas sur le bouton :
        // on compare donc hors espaces.
        const sansBlancs = (t) => t.replace(/[\s ]/g, '');
        return {
            combien: lus.length,
            muets: lus.filter(s => !s.pose).map(s => s.montre || '(vide)'),
            sansNom: lus.filter(s => !s.nom).map(s => s.montre),
            menteurs: lus.filter(s => sansBlancs(s.pose) !== sansBlancs(s.montre))
                .map(s => s.montre + ' pose « ' + s.pose + ' »'),
            appartenance: lus.filter(s => s.pose === '∈' || s.pose === '∉').map(s => s.pose)
        };
    });
    r.verifie('la grille des symboles est bien garnie', grille.combien >= 25, String(grille.combien));
    r.egal('aucun bouton ne pose le vide', grille.muets, []);
    r.egal('aucun bouton n\'est sans nom', grille.sansNom, []);
    r.egal('et aucun ne montre autre chose que ce qu\'il écrit', grille.menteurs, []);
    r.egal('L\'APPARTENANCE A SES DEUX FACES', grille.appartenance, ['∈', '∉']);

    // ------------------------------------------------------------------
    // ET CHAQUE SYMBOLE SE DESSINE VRAIMENT
    //
    // Un caractère que la police ne connaît pas s'affiche en « tofu » — le
    // petit rectangle — et un bouton qui propose un rectangle est pire qu'un
    // bouton absent. Le risque n'est pas théorique : les ensembles de nombres
    // ℕ ℤ ℚ ℝ vivent dans les « lettres de forme », mais 𝔻, celui des
    // décimaux, vit hors du plan de base et manque dans bien des polices.
    //
    // ON NE MESURE PAS LA LARGEUR — premier jet, et il accusait π, À et Ç :
    // la largeur du glyphe manquant coïncide avec celle de beaucoup de vrais
    // caractères. On dessine chaque symbole sur une toile et l'on compare SES
    // PIXELS à ceux de caractères non attribués.
    //
    // CE QUE CELA PROUVE, ET CE QUE CELA NE PROUVE PAS : que les polices de
    // CETTE machine les connaissent. Une police plus pauvre ailleurs rendrait
    // encore des rectangles — mais au moins on ne publie plus un symbole que
    // personne ici ne peut voir.
    // ------------------------------------------------------------------
    const dessines = await page.evaluate(() => {
        const btn = document.querySelector('#text-toolbar .tt-symb');
        const police = btn ? getComputedStyle(btn).font : '17px sans-serif';
        const c = document.createElement('canvas');
        c.width = 48; c.height = 48;
        const g = c.getContext('2d');
        const empreinte = (ch) => {
            g.clearRect(0, 0, 48, 48);
            g.font = police; g.fillStyle = '#000';
            g.textBaseline = 'middle'; g.textAlign = 'center';
            g.fillText(ch, 24, 24);
            const d = g.getImageData(0, 0, 48, 48).data;
            let h = 0, encre = 0;
            for (let i = 3; i < d.length; i += 4) { if (d[i]) { encre++; h = (h * 31 + i + d[i]) >>> 0; } }
            return { h, encre };
        };
        const tofus = ['\uFFFF', '\u0870'].map(empreinte).map(e => e.h);
        const liste = [...document.querySelectorAll('#text-toolbar .tt-symb')]
            .map(b => b.getAttribute('data-symbole'));
        const vus = liste.map(ch => ({ ch, e: empreinte(ch) }));
        return {
            combien: vus.length,
            sansEncre: vus.filter(v => v.e.encre === 0).map(v => v.ch),
            commeUnTofu: vus.filter(v => tofus.includes(v.e.h)).map(v => v.ch)
        };
    });
    r.verifie('il y a bien des symboles à dessiner', dessines.combien >= 25, String(dessines.combien));
    r.egal('aucun symbole ne reste sans encre', dessines.sansEncre, []);
    r.egal('ET AUCUN NE SE REND COMME UN GLYPHE MANQUANT', dessines.commeUnTofu, []);

    // Et il s'écrit pour de bon, comme les autres.
    await page.keyboard.type(' 3 ');
    r.egal('le ∉ s\'écrit à la suite',
        await page.evaluate(() => {
            insererSymbole('∉');
            return document.getElementById('wysiwyg-text').textContent;
        }), '12 × 4 ÷ 3 ∉');
    // On rend au texte ce que la suite attend : les deux symboles d'origine.
    await page.evaluate(() => {
        const el = document.getElementById('wysiwyg-text');
        el.textContent = '12 × 4 ÷';
        const r2 = document.createRange(); r2.selectNodeContents(el); r2.collapse(false);
        const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r2);
    });

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
    //   apparaît ? » — deux barres pour le même mot : celle du texte flottait
    //   au-dessus du bloc et portait le gras, la taille, la couleur ; celle du
    //   style affichait les mêmes réglages en haut de l'écran.
    //
    // Elles n'en font plus qu'une : « il faut utiliser celle du haut ». La
    // barre du texte est RANGÉE dans la barre de style, qui reste donc là
    // pendant la saisie — c'est toujours une seule barre, mais c'est l'autre
    // qui se tait. Qui préfère l'ancienne disposition la retrouve d'un bouton,
    // et c'est le second bloc ci-dessous qui la mesure.
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
        const tb = document.getElementById('text-toolbar');
        const pendant = {
            style: vu('bar-style'), saisie: wysiwygText.style.display === 'block',
            // Le point : la barre du texte n'est pas un SECOND meuble posé
            // par-dessus, elle est dans le premier.
            dansLAutre: tb.parentNode.id === 'bar-style',
            flottante: getComputedStyle(tb).position !== 'static'
        };
        wysiwygText.innerText = 'un mot';
        finalizeText();
        await new Promise(r => setTimeout(r, 120));
        const apres = { style: vu('bar-style'), poses: texts.length };
        texts.length = 0; setMode('pointer'); draw();
        return { avant, pendant, apres };
    });
    r.verifie('l\'outil Texte en main, la barre de style est là',
        deuxBarresDuTexte.avant, JSON.stringify(deuxBarresDuTexte));
    r.egal('et elle reste pendant qu\'on écrit : c\'est elle qui porte le texte',
        deuxBarresDuTexte.pendant,
        { style: true, saisie: true, dansLAutre: true, flottante: false });
    r.egal('le bloc posé, elle est toujours là, sans les réglages du texte',
        deuxBarresDuTexte.apres, { style: true, poses: 1 });

    // ET LE MÊME GESTE À LA VRAIE SOURIS, POUR QUI A RENDU LA BARRE AU TEXTE.
    // « Aucun intérêt des 3 barres » : la barre de style était rendue muette
    // au bon endroit, mais personne ne repassait par là une fois la saisie
    // ouverte — elle restait affichée avec la taille et la couleur pendant que
    // la barre du texte disait la même chose au-dessus du mot. C'est la règle
    // de l'ancienne disposition, et elle doit y tenir encore.
    await page.evaluate(() => {
        basculerLAncrageDuTexte(false);
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
    // La barre reste RENDUE AU TEXTE pour les deux blocs qui suivent : ils la
    // déplacent au pixel près pour éprouver ses tiroirs aux quatre bords de
    // l'écran, ce qu'un meuble rangé dans un autre ne saurait faire.

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

    // ET ELLE SAIT REVENIR. Une disposition qu'on quitte et qui ne se laisse
    // pas reprendre est un piège : on remet la barre en haut, telle qu'elle
    // est livrée, et l'on vérifie qu'elle y est bien retournée.
    const remiseEnHaut = await page.evaluate(() => {
        basculerLAncrageDuTexte(true);
        const tt = document.getElementById('text-toolbar');
        return { parent: tt.parentNode.id, ancree: tt.classList.contains('tt-ancree') };
    });
    r.egal('et la barre du texte sait revenir se ranger en haut',
        remiseEnHaut, { parent: 'bar-style', ancree: true });

    // ==================================================================
    // CE QU'ON TAPE EST LÀ OÙ ÇA SE POSE
    //
    // « Quand on édite ou valide du texte, il y a un décalage entre le texte
    // tapé et validé, ou quand on revient dans la zone d'édition ; c'est très
    // léger. » Quatre pixels. Trois conventions se mélangeaient : la mise en
    // page centre la ligne d'après la BOÎTE DE POLICE — c'est ce que fait le
    // navigateur —, le canevas peignait avec « textBaseline: top », qui vise
    // le haut de l'EM SQUARE, et l'export SVG visait encore ailleurs avec
    // « dominant-baseline: hanging ». Le code mesurait juste, puis peignait
    // selon une autre règle que celle qu'il venait de mesurer.
    //
    // ON NE COMPARE PAS DES BOÎTES, ON COMPARE DE L'ENCRE. La boîte de ligne
    // du DOM déborde les lettres par le haut ; la mesurer contre l'empreinte
    // du canevas ferait apparaître un écart là où il n'y en a pas, et
    // l'inverse. On photographie donc l'écran aux trois moments et l'on
    // regarde où sont les pixels sombres.
    // ==================================================================
    const CLIP = { x: 440, y: 330, width: 260, height: 140 };
    const encreDe = async (b64) => page.evaluate(({ src, clip }) => (async () => {
        const im = new Image();
        im.src = 'data:image/png;base64,' + src;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const fond = [d[0], d[1], d[2]];   // le coin haut-gauche : pas de lettre là
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (Math.abs(d[i] - fond[0]) + Math.abs(d[i + 1] - fond[1]) + Math.abs(d[i + 2] - fond[2]) > 60) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        }
        return x1 < 0 ? null : { g: x0 + clip.x, h: y0 + clip.y, d: x1 + clip.x, b: y1 + clip.y };
    })(), { src: b64, clip: CLIP });

    await page.evaluate(() => {
        texts.length = 0; images.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1; editingTextId = null;
        if (wysiwygText) wysiwygText.style.display = 'none';
        setMode('text'); draw();
    });
    await page.mouse.click(500, 400);
    await page.waitForTimeout(250);
    await page.keyboard.type('Hamburg');
    await page.waitForTimeout(300);
    const enSaisie = await encreDe((await page.screenshot({ clip: CLIP })).toString('base64'));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const auRendu = await encreDe((await page.screenshot({ clip: CLIP })).toString('base64'));

    await page.evaluate(() => setMode('pointer'));
    await page.mouse.dblclick(540, 400);
    await page.waitForTimeout(500);
    const auRetour = await encreDe((await page.screenshot({ clip: CLIP })).toString('base64'));
    const rouvert = await page.evaluate(() => !!editingTextId);

    r.verifie('les trois moments laissent bien une trace à mesurer',
        !!(enSaisie && auRendu && auRetour) && rouvert,
        JSON.stringify({ enSaisie, auRendu, auRetour, rouvert }));
    // UN PIXEL DE TOLÉRANCE, pas plus : c'est ce que l'anticrénelage peut
    // faire varier. Quatre, c'était le défaut.
    r.verifie('le texte validé se pose là où on l\'a tapé',
        Math.abs(auRendu.h - enSaisie.h) <= 1 && Math.abs(auRendu.g - enSaisie.g) <= 1,
        'écart dx=' + (auRendu.g - enSaisie.g) + ' dy=' + (auRendu.h - enSaisie.h));
    r.verifie('et rouvrir la zone d\'édition ne le déplace pas non plus',
        Math.abs(auRetour.h - auRendu.h) <= 1 && Math.abs(auRetour.g - auRendu.g) <= 1,
        'écart dx=' + (auRetour.g - auRendu.g) + ' dy=' + (auRetour.h - auRendu.h));

    await page.evaluate(() => {
        editingTextId = null;
        if (wysiwygText) wysiwygText.style.display = 'none';
        texts.length = 0; selectedItems = []; setMode('pointer'); draw();
    });

    // ==================================================================
    // LA SAISIE PASSE SOUS LES BARRES, ET LE TABLEAU LUI FAIT LA PLACE
    //
    // « Parfois le texte passe au-dessus des toolbars. » La zone de saisie
    // était à cinq mille quand les barres sont à mille : elle recouvrait la
    // barre de style et celle du texte — précisément celles dont on se sert
    // PENDANT qu'on écrit. Et le texte passait devant la barre pendant la
    // frappe, derrière une fois validé : la promesse « ce qu'on tape est là où
    // ça se pose » se rompait d'une autre façon.
    //
    // ELLE PASSE DONC DESSOUS. Mais rien ne doit être caché pour autant : le
    // tableau glisse du strict nécessaire quand le bloc vient toucher une
    // barre, comme un éditeur qui suit son curseur. C'est cela qu'on éprouve —
    // les deux moitiés, car l'une sans l'autre serait pire que le mal.
    // ==================================================================
    await page.evaluate(() => {
        texts.length = 0; images.length = 0; selectedItems = [];
        editingTextId = null;
        if (wysiwygText) wysiwygText.style.display = 'none';
        panX = 0; panY = 0; zoom = 1; setMode('text'); draw();
    });
    await page.mouse.click(600, 300);
    await page.waitForTimeout(300);
    await page.keyboard.type('Réponse');
    await page.waitForTimeout(250);

    const dessous = await page.evaluate(() => {
        const w = document.getElementById('wysiwyg-text');
        return { saisie: Number(getComputedStyle(w).zIndex),
                 barre: Number(getComputedStyle(document.getElementById('bar-style')).zIndex),
                 ouvert: w.style.display };
    });
    r.verifie('la saisie est ouverte et passe SOUS les barres',
        dessous.ouvert === 'block' && dessous.saisie < dessous.barre, JSON.stringify(dessous));

    // ON AMÈNE LE BLOC SOUS LES BARRES DU HAUT. Un clic ne le pourrait pas —
    // la barre prendrait le clic : c'est en déplaçant la vue, ou en voyant une
    // barre paraître, que le cas se présente.
    const degage = await page.evaluate(async () => {
        panY -= 260; draw(); updateWysiwygPosition();
        const avant = document.getElementById('wysiwyg-text').getBoundingClientRect().top;
        const plafond = plafondQuiGeneLaSaisie();
        const bouge = degagerLaSaisie();
        await new Promise(ok => setTimeout(ok, 120));
        const apres = document.getElementById('wysiwyg-text').getBoundingClientRect().top;
        return { avant: Math.round(avant), plafond, apres: Math.round(apres), bouge };
    });
    r.verifie('sous une barre, le bloc était bien caché',
        degage.avant < degage.plafond, JSON.stringify(degage));
    r.verifie('et le tableau lui fait la place : il repasse sous le plancher des barres',
        degage.bouge && degage.apres >= degage.plafond, JSON.stringify(degage));

    // ET IL NE BOUGE PAS QUAND RIEN NE LE GÊNE : déplacer la vue à chaque
    // ouverture serait pire que le mal.
    const tranquille = await page.evaluate(() => {
        const y = panY;
        const bouge = degagerLaSaisie();
        return { bouge, memePanY: Math.round(panY) === Math.round(y) };
    });
    r.egal('et il ne bouge pas quand rien ne le gêne',
        tranquille, { bouge: false, memePanY: true });

    // ET LE BORD HAUT DE L'ÉCRAN EST UN PLANCHER COMME UNE BARRE. En plein
    // écran il n'y a plus de barre à dégager — le plafond vaut zéro —, et le
    // secours ne s'armait QUE s'il y avait une barre : « si (haut) ». Or le
    // bord de l'écran cache aussi bien qu'une barre. Un bloc remonté
    // au-dessus du bord doit redescendre, en plein écran comme ailleurs.
    const enPlein = await page.evaluate(async () => {
        // On met le plafond des barres à zéro — c'est exactement ce que
        // répond l'application en plein écran — sans dépendre de l'état où
        // les vérifications précédentes ont laissé les barres.
        const vrai = window.plafondQuiGeneLaSaisie;
        window.plafondQuiGeneLaSaisie = () => 0;
        try {
            panY -= 260; draw(); updateWysiwygPosition();
            const avant = document.getElementById('wysiwyg-text').getBoundingClientRect().top;
            const plafond = plafondQuiGeneLaSaisie();
            const bouge = degagerLaSaisie();
            await new Promise(ok => setTimeout(ok, 120));
            const apres = document.getElementById('wysiwyg-text').getBoundingClientRect().top;
            return { avant: Math.round(avant), plafond, apres: Math.round(apres), bouge };
        } finally { window.plafondQuiGeneLaSaisie = vrai; }
    });
    r.egal('sans barre en travers, le plafond vaut zéro', enPlein.plafond, 0,
        JSON.stringify(enPlein));
    r.verifie('et le bloc était bien sorti par le haut de l\'écran',
        enPlein.avant < 0, JSON.stringify(enPlein));
    r.verifie('LE BORD DE L\'ÉCRAN LE RATTRAPE QUAND MÊME',
        enPlein.bouge && enPlein.apres >= 0, JSON.stringify(enPlein));

    // ==================================================================
    // ÉCRIRE TOUT EN HAUT, SANS QUE LA PAGE SAUTE
    //
    // « Quand j'ai voulu taper du texte tout en haut, en plein écran, le
    // curseur s'est mis en dessous. » La ligne ENFOURCHE le clic : sa moitié
    // haute est au-dessus du point qu'on montre, et en grand corps cette
    // moitié fait quarante pixels. Tout en haut, elle sortait de l'écran — on
    // ne voyait que sa moitié basse, qui commence plus bas que le clic.
    //
    // DEUX EXIGENCES, ET IL FAUT LES DEUX. La ligne entière se voit, ET le
    // tableau ne bouge pas : faire sauter toute la page sous la main de celui
    // qui vient de montrer un endroit serait un autre défaut, pas une
    // correction. C'est en GRAND CORPS que cela se mesure — en corps
    // vingt-quatre la moitié d'interligne ne fait que quatorze pixels, et le
    // défaut se cache.
    // ==================================================================
    await page.evaluate(() => {
        if (typeof toggleFocusMode === 'function' && !document.body.classList.contains('focus-mode')) toggleFocusMode();
    });
    await page.waitForTimeout(350);
    const enHaut = [];
    for (const taille of [24, 48, 96]) {
        for (const y of [10, 25, 50]) {
            await page.evaluate(([t]) => {
                if (typeof finalizeText === 'function') finalizeText();
                texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
                setMode('text');
                if (typeof reglerTailleTexte === 'function') reglerTailleTexte(t, 'essai');
                else { activeStyle.fontSize = t; activeStyle.lineHeight = Math.round(t * 1.2); }
                draw();
            }, [taille]);
            await page.mouse.click(700, y);
            await page.waitForTimeout(130);
            enHaut.push(await page.evaluate(([t, y]) => {
                const w = document.getElementById('wysiwyg-text');
                if (getComputedStyle(w).display !== 'block') return { corps: t, y, pasDeSaisie: true };
                const r = w.getBoundingClientRect();
                return { corps: t, y, haut: Math.round(r.top), panY: Math.round(panY),
                         plafond: typeof plafondQuiGeneLaSaisie === 'function' ? plafondQuiGeneLaSaisie() : 0 };
            }, [taille, y]));
        }
    }
    r.verifie('LA LIGNE NE COMMENCE JAMAIS HORS DE L\'ÉCRAN, même en grand corps',
        enHaut.every(e => !e.pasDeSaisie && e.haut >= e.plafond),
        JSON.stringify(enHaut));
    r.verifie('ET LE TABLEAU NE SAUTE PAS SOUS LA MAIN : il ne bouge d\'aucun pixel',
        enHaut.every(e => e.panY === 0), JSON.stringify(enHaut));
    // Et plus bas, rien ne change : la ligne enfourche le clic comme avant.
    const loinDuBord = enHaut.filter(e => e.y === 50 && e.corps === 24)[0];
    r.egal('loin du bord, la ligne enfourche toujours le point montré',
        loinDuBord && loinDuBord.haut, 36, JSON.stringify(loinDuBord));


    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        if (typeof toggleFocusMode === 'function' && document.body.classList.contains('focus-mode')) toggleFocusMode();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0;
        if (typeof reglerTailleTexte === 'function') reglerTailleTexte(24, 'essai');
        setMode('pointer'); draw();
    });
    await page.waitForTimeout(250);

    // ==================================================================
    // ET ÉCRIRE TOUT EN BAS NE DOIT PAS DAVANTAGE FAIRE SAUTER LA PAGE
    //
    // « Je mets le pdf, je le mets en plein écran, je zoome avec la molette, je
    // prends le T de la toolbar à gauche, je clique : tout le pdf se décale
    // vers le haut et le curseur aussi. »
    //
    // La règle du bord HAUT, juste au-dessus, n'avait jamais été écrite pour le
    // bord BAS : la branche basse de « degagerLaSaisie » déplaçait le TABLEAU.
    // Mesuré avant correction, sur un tableau vierge en plein écran à zoom 1 :
    // −21,5 px ; sur la vraie fiche projetée à zoom 3,2 : −14,9 / −29,9 / −39,9
    // px selon la hauteur du clic. Et c'est CUMULATIF.
    //
    // DEUX PORTES MÈNENT AU DÉFAUT, et il faut les deux ici : la vraie
    // condition n'est pas le plein écran d'un document mais « le plancher des
    // barres du bas est au-dessus du bord de l'écran ». Projeter un document y
    // mène ; le seul mode d'affichage « plein écran » y mène aussi, sans
    // aucune image. Une vérification écrite sur le seul cas du document aurait
    // laissé la moitié du défaut ouverte.
    // ==================================================================
    const enBas = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; images.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        if (typeof poserLAffichage === 'function') poserLAffichage(2);   // plein écran
        if (typeof reglerTailleTexte === 'function') reglerTailleTexte(24, 'essai');
        setMode('text');
        if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
        draw();
        return { plancher: plafondDesBarresDuBas(), ecran: window.innerHeight,
                 focus: document.body.classList.contains('focus-mode') };
    });
    await page.waitForTimeout(450);
    // UN VRAI PLANCHER, PAS UN PIXEL. Relevé pendant un sabotage, le décor
    // rendait parfois un plancher à 730 pour un écran de 731 : les clics qui
    // suivent n'éprouvaient alors presque rien. On exige donc une barre qui
    // mange vraiment le bas, sans quoi la vérification échoue bruyamment au
    // lieu de passer en ne mesurant rien.
    r.verifie('le plein écran pose bien une barre en bas : il y a un plancher à dégager',
        enBas.focus && enBas.plancher < enBas.ecran - 30, JSON.stringify(enBas));

    const basses = [];
    for (const y of [enBas.plancher - 60, enBas.plancher - 20, enBas.plancher - 10, enBas.plancher - 1]) {
        await page.evaluate(() => {
            if (typeof finalizeText === 'function') finalizeText();
            texts.length = 0; panY = 0; draw();
        });
        await page.mouse.click(700, y);
        await page.waitForTimeout(170);
        basses.push(await page.evaluate(([y]) => {
            const w = document.getElementById('wysiwyg-text');
            if (getComputedStyle(w).display !== 'block') return { y, pasDeSaisie: true };
            const r2 = w.getBoundingClientRect();
            return { y, panY: Math.round(panY), haut: Math.round(r2.top),
                     bas: Math.round(r2.bottom), plancher: plafondDesBarresDuBas() };
        }, [y]));
    }
    r.verifie('ÉCRIRE TOUT EN BAS : LE TABLEAU NE BOUGE D\'AUCUN PIXEL',
        basses.every(b => !b.pasDeSaisie && b.panY === 0), JSON.stringify(basses));
    r.verifie('et la ligne entière se voit : elle se pose CONTRE le plancher, jamais dessous',
        basses.every(b => !b.pasDeSaisie && b.bas <= b.plancher - 8 + 1), JSON.stringify(basses));

    // LE CUMUL, qui est ce que le professeur subit vraiment : trois annotations
    // au même endroit emportaient cent cinq pixels de polycopié.
    const cumul = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; panY = 0; draw();
        return Math.round(panY);
    });
    const apresCumul = [];
    for (let i = 0; i < 3; i++) {
        await page.mouse.click(700, enBas.plancher - 15);
        await page.waitForTimeout(170);
        await page.keyboard.type('7');
        await page.evaluate(() => { if (typeof finalizeText === 'function') finalizeText(); });
        await page.waitForTimeout(140);
        apresCumul.push(await page.evaluate(() => Math.round(panY)));
    }
    r.verifie('TROIS ANNOTATIONS DE SUITE NE DÉPLACENT PAS LA PAGE',
        apresCumul.every(v => v === cumul), JSON.stringify({ depart: cumul, apresCumul }));

    // LE CONTRE-CAS. On ne déplace que ce qui est à nous : un bloc DÉJÀ ÉCRIT
    // qu'on rouvre garde sa place, et c'est le tableau qui se range — le
    // déplacer reviendrait à déplacer le texte du professeur.
    const contre = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; panY = 0;
        const bas2 = plafondDesBarresDuBas();
        const t = { id: nextId++, type: 'text', x: (300 - panX) / zoom, y: (bas2 - 20 - panY) / zoom,
            fontSize: 24, lineHeight: 29, content: 'deja ecrit', color: '#2d3436',
            strokeColor: '#2d3436', fontFamily: 'sans-serif', align: 'left', opacity: 1, z: globalZ++ };
        texts.push(t); selectedItems = [{ type: 'text', id: t.id }];
        const avant = { panY: Math.round(panY), ty: +t.y.toFixed(2) };
        rouvrirLeTexte(t);
        return { avant, id: t.id };
    });
    await page.waitForTimeout(300);
    const apresContre = await page.evaluate(([id]) => {
        const t = texts.find(x => x.id === id);
        return { panY: Math.round(panY), ty: t ? +t.y.toFixed(2) : null };
    }, [contre.id]);
    r.verifie('EN REVANCHE UN BLOC DÉJÀ ÉCRIT GARDE SA PLACE : c\'est le tableau qui se range',
        apresContre.panY !== contre.avant.panY && apresContre.ty === contre.avant.ty,
        JSON.stringify({ contre, apresContre }));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        if (typeof poserLAffichage === 'function') poserLAffichage(0);
        texts.length = 0; images.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1; setMode('pointer'); draw();
    });
    await page.waitForTimeout(400);

    // ==================================================================
    // ROUVRIR UN BLOC NE DOIT RIEN LUI PRENDRE
    //
    // « Gros bug quand on tape le texte et qu'on le resélectionne. » Un
    // objectif indenté à la main — dix espaces avant l'étoile — revenait
    // collé à la marge : la boîte de saisie était en « white-space: nowrap »,
    // qui écrase les suites d'espaces, alors que le canevas les garde. Le
    // bloc rouvert valait donc moins que le bloc posé, et cela se voyait à
    // la première réouverture.
    // ==================================================================
    const AVEC_ESPACES = 'Objectifs : * Connaitre le vocabulaire'
        + '<div>          * Poser des additions</div>';
    const blocRouvert = await page.evaluate((html) => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        texts.push({ id: 'TR', type: 'text', x: 150, y: 150, fontSize: 24,
                     lineHeight: 29, content: html, color: '#2d3436',
                     strokeColor: '#2d3436', opacity: 1 });
        selectedItems = [{ type: 'text', id: 'TR' }];
        rouvrirLeTexte(texts[0]);
        const w = document.getElementById('wysiwyg-text');
        return { blanc: getComputedStyle(w).whiteSpace, dansLaBoite: w.innerText };
    }, AVEC_ESPACES);
    r.verifie('LA BOÎTE DE SAISIE GARDE LES SUITES D\'ESPACES',
        /\n {10}\* Poser/.test(blocRouvert.dansLaBoite),
        `blanc=${blocRouvert.blanc} boîte=${JSON.stringify(blocRouvert.dansLaBoite)}`);
    const referme = await page.evaluate(() => {
        finalizeText(); draw();
        return texts.length ? texts[texts.length - 1].content : null;
    });
    r.verifie('et refermer sans rien taper rend le bloc INTACT',
        referme === AVEC_ESPACES, JSON.stringify(referme));

    // ET LE TABLEAU LES DESSINE AUSSI — c'est la moitié qui manquait.
    //
    // La correction d'hier n'avait réparé que la BOÎTE. Le canevas, lui,
    // continuait de jeter les espaces de tête : « le repli ne met pas d'espace
    // en tête de ligne » valait aussi pour la PREMIÈRE ligne d'un paragraphe,
    // où ces espaces sont l'indentation voulue par le professeur. Mesuré :
    // dix espaces dans la boîte, zéro sur le tableau — on éditait un texte et
    // l'on en voyait un autre.
    //
    // On éprouve les deux à la fois : l'indentation se dessine, ET un vrai
    // repli de colonne ne traîne pas d'espace en tête de sa continuation.
    const espacesDessines = await page.evaluate((html) => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        const lire = (t) => layoutTextObject(t, ctx).lines.map(l => {
            const txt = (l.segs || []).map(s => s.text).join('');
            return (txt.match(/^ */) || [''])[0].length;
        });
        const libre = { id: nextId++, type: 'text', x: 100, y: 100, fontSize: 24, lineHeight: 29,
            content: html, color: '#2d3436', strokeColor: '#2d3436',
            fontFamily: 'sans-serif', align: 'left', opacity: 1, z: globalZ++ };
        texts.push(libre);
        // Le même texte dans une COLONNE étroite : il se replie, et les
        // continuations ne doivent pas commencer par un espace.
        const enColonne = { ...libre, id: nextId++, y: 400, colWidth: 150 };
        texts.push(enColonne);
        draw();
        return { libre: lire(libre), colonne: lire(enColonne) };
    }, AVEC_ESPACES);
    r.egal('LE TABLEAU DESSINE L\'INDENTATION, comme la boîte la montre',
        espacesDessines.libre, [0, 10], JSON.stringify(espacesDessines));
    // EN COLONNE, LE RELEVÉ EST [0, 0, 0, 10, 0] : le premier paragraphe se
    // replie en trois lignes, puis le second COMMENCE par son indentation, et
    // sa continuation n'en porte pas. La règle tient donc en une phrase : une
    // seule ligne porte l'indentation — celle qui ouvre le paragraphe — et
    // toutes les autres commencent à la marge.
    r.verifie('et en colonne, UNE SEULE ligne porte l\'indentation : celle qui ouvre le paragraphe',
        espacesDessines.colonne.filter(n => n === 10).length === 1
        && espacesDessines.colonne.filter(n => n !== 0 && n !== 10).length === 0
        && espacesDessines.colonne.length > 3,
        JSON.stringify(espacesDessines));

    // ==================================================================
    // RECOLORER UN TEXTE DÉJÀ POSÉ
    //
    // « De plus la couleur ne fonctionne plus. » La pastille de couleur était
    // escamotée dès qu'on tenait un texte, au motif que sa couleur se règle
    // dans la barre d'édition — vrai pendant la frappe, faux après : un bloc
    // seulement sélectionné n'a pas de barre d'édition. Il n'existait donc
    // AUCUN endroit pour recolorer un texte déjà écrit.
    //
    // Et la pastille seule ne suffit pas : le canevas honore les couleurs
    // posées DANS le contenu, de sorte qu'un bloc coloré mot à mot ne bougeait
    // pas d'un pixel. Les deux se mesurent ici.
    // ==================================================================
    const avantCouleur = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        setMode('pointer');
        texts.push({ id: 'TC', type: 'text', x: 200, y: 300, fontSize: 48,
            lineHeight: 58,
            content: '<span style="color: rgb(231, 76, 60);">trois</span> plus '
                   + '<span style="color: rgb(52, 152, 219);">deux</span>',
            color: '#2d3436', strokeColor: '#2d3436', opacity: 1 });
        selectedItems = [{ type: 'text', id: 'TC' }];
        if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
        draw();
        const compte = (test) => {
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
            return n;
        };
        const past = document.getElementById('btn-color-popover');
        return {
            pastille: !!past && past.offsetParent !== null,
            rouge: compte((r2, g, b) => r2 > 150 && g < 110 && b < 110),
            vert: compte((r2, g, b) => g > 150 && r2 < 110 && b < 160)
        };
    });
    r.verifie('LA PASTILLE DE COULEUR PARAÎT SUR UN BLOC DE TEXTE SÉLECTIONNÉ',
        avantCouleur.pastille, JSON.stringify(avantCouleur));
    r.verifie('avant : le bloc porte bien ses couleurs mot à mot',
        avantCouleur.rouge > 100 && avantCouleur.vert < 40, JSON.stringify(avantCouleur));

    const apresCouleur = await page.evaluate(() => {
        choisirLaCouleur('#2ecc71');
        draw();
        const compte = (test) => {
            const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
            return n;
        };
        return {
            couleur: texts[0].color, contenu: texts[0].content,
            rouge: compte((r2, g, b) => r2 > 150 && g < 110 && b < 110),
            vert: compte((r2, g, b) => g > 150 && r2 < 110 && b < 160)
        };
    });
    r.verifie('et CHOISIR UNE COULEUR REPEINT LE BLOC ENTIER, couleurs internes comprises',
        apresCouleur.rouge === 0 && apresCouleur.vert > 100, JSON.stringify(apresCouleur));
    r.verifie('plus aucune couleur ne traîne dans le contenu',
        !/color\s*:/i.test(apresCouleur.contenu || ''), JSON.stringify(apresCouleur.contenu));

    // PENDANT LA FRAPPE, C'EST L'AUTRE PASTILLE QUI COMMANDE. La barre du
    // texte a la sienne — celle qui ne colore que le mot sélectionné —, et la
    // pastille générale s'efface pour ne pas proposer deux fois le même
    // réglage avec deux effets différents. C'est à cette règle que tient tout
    // le reste : si elle tombait, choisir une couleur en écrivant repeindrait
    // le bloc entier au lieu du mot visé.
    await page.evaluate(() => {
        texts.length = 0; selectedItems = []; setMode('text');
    });
    await page.mouse.click(500, 500);
    await page.waitForTimeout(200);
    const pendantLaFrappe = await page.evaluate(() => {
        const past = document.getElementById('btn-color-popover');
        const sienne = document.querySelector('#text-toolbar .tt-tab[data-panel="color"]');
        const bs = document.getElementById('bar-style');
        return {
            saisieOuverte: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'block',
            contexte: bs ? bs.className : null,
            generale: !!past && past.offsetParent !== null,
            celleDuTexte: !!sienne && sienne.offsetParent !== null
        };
    });
    // Une seule vérification pour les deux moitiés de la règle : la pastille
    // de la barre du texte a déjà la sienne plus haut, où l'on ouvre son
    // tiroir. Ce qui se mesure ici, c'est que l'autre s'efface.
    r.verifie('EN ÉCRIVANT, la pastille générale s\'efface : un seul réglage à la fois',
        pendantLaFrappe.saisieOuverte && pendantLaFrappe.celleDuTexte
        && !pendantLaFrappe.generale, JSON.stringify(pendantLaFrappe));

    // ==================================================================
    // LA BARRE DEBOUT OUVRE SES TIROIRS SUR LE CÔTÉ
    //
    // « Quand j'ai ça et que je clique sur la taille de la police, la petite
    // popup n'apparaît pas. » Debout, la barre fait cinq cents pixels de
    // haut, et le tiroir pendait de SA hauteur : il sortait de l'écran par le
    // haut. Mesuré avant correction, sur un écran de 1430×895 : « Taille »
    // s'ouvrait de −16 à 201, « Symboles » de −41 à 201.
    //
    // On ne vérifie pas seulement qu'il tient dans la fenêtre — un tiroir
    // collé en haut de l'écran y tiendrait aussi : il doit sortir À LA
    // HAUTEUR DE SON PROPRE BOUTON, sans quoi on ne fait plus le lien.
    // ==================================================================
    for (const debout of [false, true]) {
        await page.evaluate((d) => {
            if (typeof finalizeText === 'function') finalizeText();
            texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
            if (typeof basculerLAncrageDuTexte === 'function') basculerLAncrageDuTexte(true);
            if (typeof barreStyleDebout !== 'undefined') barreStyleDebout = d;
            if (typeof placerLaBarreStyle === 'function') placerLaBarreStyle();
            const bs = document.getElementById('bar-style');
            if (bs) bs.classList.toggle('vertical', d);
            setMode('text'); draw();
        }, debout);
        await page.mouse.click(600, 420);
        await page.waitForTimeout(200);
        const tiroirs = [];
        for (const nom of ['size', 'color', 'para', 'symb']) {
            tiroirs.push(await page.evaluate((n) => {
                const tab = document.querySelector(`#text-toolbar .tt-tab[data-panel="${n}"]`);
                const p = document.querySelector(`#text-toolbar .tt-panel[data-panel="${n}"]`);
                if (!tab || !p) return { nom: n, absent: true };
                tab.click();
                const r = p.getBoundingClientRect(), b = tab.getBoundingClientRect();
                // ÊTRE BIEN PLACÉ NE SUFFIT PAS : IL FAUT ÊTRE PEINT.
                // « Rien ne se passe quand je clique sur la couleur » — et
                // pourtant le tiroir s'ouvrait à la bonne place, entièrement
                // dans l'écran. Il était découpé par le « overflow » de sa
                // barre debout, et aucune de ces mesures ne pouvait le voir.
                // On demande donc au navigateur QUI est au-dessus au milieu
                // du tiroir : si ce n'est pas le tiroir, il n'existe pas.
                const dessus = document.elementFromPoint(
                    Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
                return {
                    nom: n, ouvert: p.classList.contains('tt-open'),
                    boite: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
                    dedans: r.top >= 0 && r.left >= 0
                        && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
                    peint: !!dessus && p.contains(dessus),
                    // Le tiroir et son bouton se regardent : leurs bandes
                    // horizontales se croisent.
                    enFace: r.bottom >= b.top - 2 && r.top <= b.bottom + 2
                };
            }, nom));
        }
        const ou = debout ? 'DEBOUT' : 'couchée';
        r.verifie(`barre ${ou} : chaque tiroir de la barre de texte s'ouvre`,
            tiroirs.every(t => t.ouvert), JSON.stringify(tiroirs));
        r.verifie(`barre ${ou} : AUCUN TIROIR NE SORT DE L'ÉCRAN`,
            tiroirs.every(t => t.dedans), JSON.stringify(tiroirs));
        r.verifie(`barre ${ou} : ET CHAQUE TIROIR EST VRAIMENT PEINT, pas découpé`,
            tiroirs.every(t => t.peint), JSON.stringify(tiroirs));
        if (debout) {
            r.verifie('barre DEBOUT : et chacun sort À LA HAUTEUR DE SON BOUTON',
                tiroirs.every(t => t.enFace), JSON.stringify(tiroirs));
        }
    }
    await page.evaluate(() => {
        if (typeof fermerTiroirsTexte === 'function') fermerTiroirsTexte();
        if (typeof barreStyleDebout !== 'undefined') barreStyleDebout = false;
        const bs = document.getElementById('bar-style');
        if (bs) bs.classList.remove('vertical');
        if (typeof placerLaBarreStyle === 'function') placerLaBarreStyle();
    });

    await page.evaluate(() => {
        editingTextId = null;
        if (wysiwygText) { wysiwygText.innerHTML = ''; wysiwygText.style.display = 'none'; }
        texts.length = 0; selectedItems = []; panX = 0; panY = 0;
        setMode('pointer'); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
