// TROIS GESTES QUI BUTAIENT.
//
// « Quand on est tout en bas et que l'on force avec la molette, on passe à la
// page suivante (idem pour la précédente). » La molette défilait jusqu'au bas
// de la page, et là plus rien : il fallait lâcher la souris pour aller
// chercher la flèche de la barre, ou connaître Page↓.
//
// « Pointeur laser qui rame sur PDF. » Chaque frisson du faisceau repeignait
// TOUT — la page du document comprise, des millions de pixels, soixante fois
// par seconde. Le chemin court existait déjà pour le crayon ; le laser en a
// plus besoin encore, puisqu'il se redessine même quand la main ne bouge
// plus, le temps qu'il s'efface.
//
// « Pour la démonstration, le crayon ne trace plus rien si c'est blanc, il
// faut veiller à la couleur. » La visite écrit avec la couleur du moment ;
// sur sa page blanche, un enseignant qui venait d'écrire en blanc sur fond
// sombre la regardait tracer dans le vide.
const { creerRapport, ouvrirApp, petitPdf, pdfA4 } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Molette, laser et encre');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    // =================================================================
    // 1. LA MOLETTE TOURNE LA PAGE — QUAND ON INSISTE
    // =================================================================
    const octets = Array.from(petitPdf(['Une', 'Deux', 'Trois']));
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1600));
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id });
        presenterLeDocument();
    }, { octets });
    await page.waitForTimeout(600);

    const numero = () => page.evaluate(() => images[0].pluginData.page);
    const auBord = (versLeBas) => page.evaluate((bas) => {
        pousseeDansLeVide = 0; derniereTournee = 0;
        cadrerLeBordDeLaPage(documentPresente(), !bas);
    }, versLeBas);
    // Un cran de molette, comme le navigateur l'envoie.
    const molette = (dy) => page.evaluate((d) => {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: d, deltaMode: 0, bubbles: true, cancelable: true }));
    }, dy);

    r.egal('on présente bien la première page', await numero(), 1);

    // Au bord du bas, un seul petit cran ne doit RIEN tourner : sinon on
    // saute les trois dernières lignes de l'exercice qu'on était en train
    // de lire.
    await auBord(true);
    await molette(40);
    await page.waitForTimeout(150);
    r.egal('un petit cran au bord ne tourne pas la page', await numero(), 1);

    // On insiste : la page tourne.
    await molette(120);
    await page.waitForTimeout(500);
    r.egal('en forçant, on passe à la suivante', await numero(), 2);

    // ET PAS DEUX D'UN COUP. Le pavé tactile continue sur son erre : quatre
    // crans coup sur coup, c'est UN geste, pas quatre pages. On compte les
    // tours et non le numéro, car la page suivante se rend en différé.
    await auBord(true);
    const enfilade = await page.evaluate(() => {
        let tours = 0;
        const vrai = window.tournerLaPageDuDocument;
        window.tournerLaPageDuDocument = function () {
            const r = vrai.apply(this, arguments);
            if (r) tours++;
            return r;
        };
        pousseeDansLeVide = 0; derniereTournee = 0;
        const cran = () => canvas.dispatchEvent(new WheelEvent('wheel',
            { deltaY: 400, deltaMode: 0, bubbles: true, cancelable: true }));
        cran(); cran(); cran(); cran();
        window.tournerLaPageDuDocument = vrai;
        return tours;
    });
    r.egal('quatre crans coup sur coup ne tournent qu\'une page', enfilade, 1);

    // Dans l'autre sens, depuis le haut de la page 2.
    await page.evaluate(async () => { await allerALaPage(documentPresente(), 2); });
    await page.waitForTimeout(300);
    await auBord(false);
    await molette(-60);
    await molette(-120);
    await page.waitForTimeout(500);
    r.egal('vers le haut, on revient à la précédente', await numero(), 1);

    // CHANGER DE SENS REMET LE COMPTEUR À ZÉRO : ce qu'on a poussé vers le
    // bas ne doit pas servir à remonter.
    const change = await page.evaluate(() => {
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(100);       // presque assez, vers le bas
        const apresLeBas = pousseeDansLeVide;
        tournerSiOnForce(-40);       // on repart dans l'autre sens
        return { apresLeBas, apresLeChangement: pousseeDansLeVide };
    });
    r.egal('changer de sens repart de zéro', change, { apresLeBas: 100, apresLeChangement: -40 });

    // TANT QUE LA PAGE A DU MOU, LE COMPTEUR REPART DE ZÉRO. On pousse
    // presque assez au bord, puis on remonte DANS la page — elle défile, donc
    // on n'est plus au bord —, puis on repousse un peu. Sans cette remise à
    // zéro, les deux poussées s'ajouteraient et la page tournerait pour un
    // demi-geste, alors qu'on vient de relire un paragraphe entre les deux.
    const duMou = await page.evaluate(() => {
        let tours = 0;
        const vrai = window.tournerLaPageDuDocument;
        window.tournerLaPageDuDocument = function () { tours++; return true; };
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(100);       // au bord, presque assez
        tournerSiOnForce(0);         // la page a repris du mou
        const apresLeMou = pousseeDansLeVide;
        tournerSiOnForce(60);        // on repousse un peu : pas de quoi tourner
        window.tournerLaPageDuDocument = vrai;
        return { apresLeMou, tours, compteur: pousseeDansLeVide };
    });
    r.egal('la page reprise en main remet le compteur à zéro',
        duMou, { apresLeMou: 0, tours: 0, compteur: 60 });

    // À la dernière page, on le dit au lieu de tourner dans le vide.
    const auBout = await page.evaluate(async () => {
        const doc = documentPresente();
        await allerALaPage(doc, doc.pluginData.pages);
        let dit = null; const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        pousseeDansLeVide = 0; derniereTournee = 0;
        tournerSiOnForce(300);
        window.showToast = vrai;
        return { page: doc.pluginData.page, dit };
    });
    r.egal('à la dernière page, on le dit',
        { page: auBout.page, fin: /fin du document/i.test(auBout.dit || '') },
        { page: 3, fin: true });

    await page.evaluate(() => quitterLaPresentation());
    await page.waitForTimeout(300);

    // =================================================================
    // 2. LE LASER NE REPEINT PLUS TOUT LE TABLEAU
    // =================================================================
    const gros = Array.from(pdfA4(1));
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0; laserStrokes.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'gros.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1800));
        setMode('pointer');
    }, { octets: gros });

    const balayage = await page.evaluate(async () => {
        setMode('laser');
        let courts = 0, longs = 0;
        const vrai = window.calqueUtilisable;
        window.calqueUtilisable = function () {
            const r = vrai.apply(this, arguments);
            if (r) courts++; else longs++;
            return r;
        };
        const ev = (t, x, y, appuie) => canvas.dispatchEvent(new PointerEvent(t, {
            clientX: x, clientY: y, buttons: appuie ? 1 : 0,
            bubbles: true, pointerId: 1, isPrimary: true
        }));
        ev('pointerdown', 300, 300, true);
        for (let i = 0; i < 30; i++) {
            ev('pointermove', 300 + i * 9, 300 + Math.sin(i / 3) * 40, true);
            await new Promise(ok => requestAnimationFrame(ok));
        }
        ev('pointerup', 570, 300, false);
        await new Promise(ok => setTimeout(ok, 200));
        window.calqueUtilisable = vrai;
        return { courts, longs };
    });
    r.verifie('le faisceau se pose sur une image figée, au lieu de tout repeindre',
        balayage.courts > 50 && balayage.longs <= 3, JSON.stringify(balayage));

    // LA PHOTO NE CONTIENT AUCUN FAISCEAU. Prise avec un trait dessus, il y
    // resterait gravé et ne s'effacerait jamais.
    const sansFaisceau = await page.evaluate(async () => {
        laserStrokes.length = 0;
        setMode('laser');
        // Un premier faisceau, bien visible.
        laserStrokes.push([{ x: 100, y: 100, time: Date.now() }, { x: 400, y: 160, time: Date.now() }]);
        draw();
        figerLeCalqueSansLaser();
        // On lit la photo : elle ne doit porter aucune trace de rouge laser.
        const g = calqueFige.getContext('2d');
        const d = g.getImageData(0, 0, calqueFige.width, calqueFige.height).data;
        let rouges = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 90 && d[i + 3] > 40) rouges++;
        }
        laserStrokes.length = 0;
        return rouges;
    });
    r.egal('et la photo figée ne garde aucun faisceau', sansFaisceau, 0);

    // Hors du mode laser, le chemin court reste réservé au crayon : un
    // faisceau qui s'efface change l'image sous le trait qu'on écrit.
    const horsLaser = await page.evaluate(() => {
        setMode('freehand');
        laserStrokes.push([{ x: 10, y: 10, time: Date.now() }]);
        figerLeCalque();
        isDrawingFreehand = true; currentFreehand = { points: [{ x: 0, y: 0 }], color: '#000', width: 3 };
        const r = calqueUtilisable();
        isDrawingFreehand = false; currentFreehand = null; laserStrokes.length = 0;
        setMode('pointer');
        return r;
    });
    r.egal('un faisceau qui s\'efface interdit le chemin court au crayon', horsLaser, false);

    // =================================================================
    // 3. UNE ENCRE QU'ON VOIT SUR LE FOND QU'ON A
    // =================================================================
    const encres = await page.evaluate(() => {
        const essai = (couleur, sombre) => {
            isDarkMode = !!sombre;
            activeStyle.strokeColor = couleur;
            const change = encreLisibleSurLeFond();
            return { change, apres: activeStyle.strokeColor };
        };
        const out = {
            blancSurClair: essai('#ffffff', false),
            bleuSurClair: essai('#3498db', false),
            ardoiseSurSombre: essai('#2d3436', true),
            blancSurSombre: essai('#ffffff', true)
        };
        isDarkMode = false;
        return out;
    });
    r.egal('le blanc sur une page blanche est remplacé',
        encres.blancSurClair, { change: true, apres: '#2d3436' });
    r.egal('mais le bleu de l\'enseignant est laissé tel quel',
        encres.bleuSurClair, { change: false, apres: '#3498db' });
    r.egal('sur fond sombre, c\'est l\'ardoise qui se perd',
        encres.ardoiseSurSombre, { change: true, apres: '#ffffff' });
    r.egal('et le blanc y est parfait', encres.blancSurSombre, { change: false, apres: '#ffffff' });

    // UNE COULEUR QU'ON NE SAIT PAS LIRE NE FAIT RIEN CHANGER — sur les deux
    // fonds. Sans garde-fou, une clarté « inconnue » vaut zéro au moment de
    // comparer : sur fond sombre, elle passait pour une encre noire et la
    // couleur de l'enseignant était remplacée sans raison.
    r.egal('une couleur illisible ne déclenche rien, sur l\'un comme sur l\'autre fond',
        await page.evaluate(() => {
            const essai = (sombre) => {
                isDarkMode = sombre;
                activeStyle.strokeColor = 'rouge-brique';
                const c = encreLisibleSurLeFond();
                return { change: c, apres: activeStyle.strokeColor };
            };
            const out = { clair: essai(false), sombre: essai(true) };
            isDarkMode = false; activeStyle.strokeColor = '#2d3436';
            return out;
        }),
        { clair: { change: false, apres: 'rouge-brique' },
          sombre: { change: false, apres: 'rouge-brique' } });

    // =================================================================
    // LE SURLIGNEUR MONTRE SON EMPREINTE, ET SON BOUT SE CHOISIT
    //
    // « Quand on utilise le surligneur, ce serait bien d'avoir un curseur rond
    // à la bonne taille, et la possibilité que ce soit carré plutôt que rond
    // (appui long sur l'icône). » Il traçait une bande six fois plus large que
    // le trait réglé, derrière une croix de quelques pixels : on ne savait pas
    // ce qu'on allait couvrir avant de l'avoir couvert.
    // =================================================================
    const lireLeCurseur = () => page.evaluate(() => {
        updateCursor();
        const brut = canvas.style.cursor;
        const dedans = decodeURIComponent((brut.match(/utf8,([^']*)/) || [])[1] || '');
        const pointe = (brut.match(/\)\s*(\d+)\s+(\d+)/) || []).slice(1).map(Number);
        return { brut, dedans, pointe };
    });

    await page.evaluate(() => {
        if (typeof quitterLaPresentation === 'function' && presentationEnCours) quitterLaPresentation();
        images.length = 0; freehands.length = 0; selectedItems = [];
        panX = 0; panY = 0; zoom = 1;
        changerLeBoutDuSurligneur('rond');
        activeStyle.lineWidth = 4; activeStyle.strokeColor = '#f1c40f';
        setMode('highlighter');
    });

    const rond = await lireLeCurseur();
    // 4 de trait, six fois plus large au surligneur : 24 px de large, donc 12 de rayon.
    r.verifie('le surligneur montre un rond, et non une croix',
        /<circle/.test(rond.dedans) && !/<rect/.test(rond.dedans), rond.dedans);
    r.verifie('à la taille de ce qu\'il couvre vraiment',
        /r="12"/.test(rond.dedans), rond.dedans);
    r.verifie('de la couleur qu\'on a choisie', /%23f1c40f|#f1c40f/i.test(rond.dedans), rond.dedans);
    // LE CENTRE EST TOUJOURS LE CENTRE ; c'est l'image qui a grandi de deux
    // pixels, le liseré étant désormais compté des deux côtés — il l'était
    // d'un seul, et le rond mordait donc le bord de son image.
    r.egal('et l\'on vise son centre', rond.pointe, [16, 16]);

    await page.evaluate(() => { zoom = 2; });
    const zoome = await lireLeCurseur();
    r.verifie('le tableau zoomé, le rond grandit d\'autant',
        /r="24"/.test(zoome.dedans), zoome.dedans);
    await page.evaluate(() => { zoom = 1; });

    const carre = await page.evaluate(() => {
        changerLeBoutDuSurligneur('carre');
        updateCursor();
        return { dedans: decodeURIComponent((canvas.style.cursor.match(/utf8,([^']*)/) || [])[1] || ''),
                 memoire: localStorage.getItem('board_bout_surligneur') };
    });
    r.verifie('le bout carré donne un curseur carré, de même côté',
        /<rect[^>]*width="24"/.test(carre.dedans) && !/<circle/.test(carre.dedans), carre.dedans);
    r.egal('et le choix est retenu d\'une séance à l\'autre', carre.memoire, 'carre');

    // ET LE MÊME CHOIX SE VOIT DANS LA BARRE DE STYLE. L'appui long sur
    // l'icône partage celle-ci avec le déplacement de l'outil : un geste ne se
    // devine pas, et il fallait une commande qu'on voie.
    const barre = await page.evaluate(() => {
        changerLeBoutDuSurligneur('rond');
        setMode('highlighter'); selectedItems = []; updateStyleBarContext();
        const b = document.getElementById('btn-bout-surligneur');
        const montre = (el) => !!(el && el.getClientRects().length);
        const vuAuSurligneur = montre(b);
        const rond = b.querySelector('circle') ? 'rond' : (b.querySelector('rect') ? 'carre' : '?');
        b.click();
        const apres = { reglage: boutDuSurligneur,
                        dessin: b.querySelector('rect') ? 'carre' : (b.querySelector('circle') ? 'rond' : '?') };
        b.click();
        const retour = boutDuSurligneur;
        setMode('freehand'); updateStyleBarContext();
        const vuAuCrayon = montre(b);
        setMode('highlighter'); updateStyleBarContext();
        return { vuAuSurligneur, vuAuCrayon, rond, apres, retour };
    });
    r.verifie('le bouton du bout paraît quand on prend le surligneur', barre.vuAuSurligneur, '');
    r.verifie('et se tait pour le crayon, qui n\'a pas de bout à choisir', !barre.vuAuCrayon, '');
    r.egal('son dessin montre le bout en cours', barre.rond, 'rond');
    r.egal('un appui le change, et le dessin suit',
        barre.apres, { reglage: 'carre', dessin: 'carre' });
    r.egal('un second appui revient au rond', barre.retour, 'rond');

    // ET LA BARRE REND CE QUI NE SERT PAS. « Pourquoi avoir les options
    // extrémité de ligne (flèche) et pointillés, ils ne servent pas ? » Les
    // pointes de flèche sont écartées à chaque rendu d'un trait de surligneur,
    // et le pointillé est invisible par construction : quatre pixels de trou
    // sous une bande de vingt-quatre, dont les bouts débordent de douze de
    // chaque côté. On le MESURE plutôt que de le croire — c'est ce qui
    // autorise à retirer les commandes.
    const inutiles = await page.evaluate(async () => {
        const c = document.getElementById('board');
        const g = c.getContext('2d', { willReadFrequently: true });
        const encre = (x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                                  return d[0] < 245 || d[1] < 245 || d[2] < 245; };
        const tracer = async () => {
            freehands.length = 0;
            const env = (t, x, y) => c.dispatchEvent(new PointerEvent(t,
                { pointerId: 4, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
            env('pointerdown', 300, 400);
            for (let x = 310; x <= 500; x += 10) env('pointermove', x, 400);
            env('pointerup', 500, 400);
            await new Promise(ok => setTimeout(ok, 150)); draw();
            await new Promise(ok => setTimeout(ok, 150));
            let trous = 0;
            for (let x = 312; x <= 488; x++) if (!encre(x, 400)) trous++;
            return trous;
        };
        panX = 0; panY = 0; zoom = 1; setMode('highlighter'); selectedItems = [];
        activeStyle.lineWidth = 4; activeStyle.strokeColor = '#f1c40f';
        changerLeBoutDuSurligneur('rond');

        activeStyle.lineDash = 'solid'; activeStyle.arrowStart = 0; activeStyle.arrowEnd = 0;
        const plein = await tracer();
        activeStyle.lineDash = 'dashed';
        const pointille = await tracer();
        activeStyle.lineDash = 'solid'; activeStyle.arrowStart = 2; activeStyle.arrowEnd = 2;
        await tracer();
        // Une pointe de flèche dépasserait franchement au-dessus de la bande,
        // qui ne monte qu'à douze pixels du trait.
        const pointe = [18, 22, 26].some(d => encre(500, 400 - d));

        activeStyle.lineDash = 'solid'; activeStyle.arrowStart = 0; activeStyle.arrowEnd = 0;
        freehands.length = 0; draw();
        return { plein, pointille, pointe };
    });
    r.egal('la bande pleine ne laisse aucun trou', inutiles.plein, 0);
    r.egal('et le pointillé n\'en fait pas davantage : il ne se voit pas',
        inutiles.pointille, 0);
    r.verifie('la flèche demandée ne pose aucune pointe', !inutiles.pointe, JSON.stringify(inutiles));

    const rendus = await page.evaluate(() => {
        // ON MESURE CE QUI EST MONTRÉ, et non le « display » du bouton : un
        // enfant de parent caché garde le sien, et l'on croirait le voir.
        const vu = (id) => !!document.getElementById(id).getClientRects().length;
        setMode('highlighter'); selectedItems = []; updateStyleBarContext();
        const auSurligneur = { dash: vu('btn-dash'), debut: vu('btn-arrow-start'), fin: vu('btn-arrow-end') };
        setMode('freehand'); updateStyleBarContext();
        const auCrayon = { dash: vu('btn-dash'), debut: vu('btn-arrow-start'), fin: vu('btn-arrow-end') };
        setMode('highlighter'); updateStyleBarContext();
        return { auSurligneur, auCrayon };
    });
    r.egal('la barre du surligneur ne montre plus ces trois-là',
        rendus.auSurligneur, { dash: false, debut: false, fin: false });
    r.verifie('le crayon, lui, les garde : chez lui elles agissent',
        Object.values(rendus.auCrayon).every(v => v === true), JSON.stringify(rendus.auCrayon));

    // UN SURLIGNAGE DÉJÀ POSÉ QU'ON REPREND : la barre parle de LUI. Sans
    // cela, le bouton du bout paraissait au-dessus d'un trait sélectionné et
    // ne touchait que le suivant — et les trois commandes mortes revenaient.
    const repris = await page.evaluate(async () => {
        freehands.length = 0;
        const c = document.getElementById('board');
        setMode('highlighter'); changerLeBoutDuSurligneur('rond');
        const env = (t, x, y) => c.dispatchEvent(new PointerEvent(t,
            { pointerId: 5, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
        env('pointerdown', 300, 500); env('pointermove', 420, 500); env('pointerup', 420, 500);
        await new Promise(ok => setTimeout(ok, 150));
        const trait = freehands[0];
        setMode('pointer');
        selectedItems = [{ type: 'freehand', id: trait.id }];
        updateStyleBarContext();
        const vu = (id) => !!document.getElementById(id).getClientRects().length;
        const barre = { bout: vu('btn-bout-surligneur'), dash: vu('btn-dash') };
        document.getElementById('btn-bout-surligneur').click();
        const apres = trait.bout;
        const dessin = document.getElementById('icon-bout-surligneur').querySelector('rect') ? 'carre' : 'rond';
        selectedItems = []; freehands.length = 0; setMode('pointer'); updateStyleBarContext(); draw();
        return { barre, apres, dessin };
    });
    r.egal('reprendre un surlignage montre son bout, et tait les trois autres',
        repris.barre, { bout: true, dash: false });
    r.egal('et le bouton retaille CE trait-là', repris.apres, 'carre');
    r.egal('le dessin du bouton montre alors le bout du trait repris', repris.dessin, 'carre');

    // ET UN TRAIT DE CRAYON N'EST PAS UN SURLIGNAGE. Les deux sont des
    // « freehand » : sans y regarder de plus près, reprendre un trait au
    // crayon lui retirerait ses flèches et son pointillé, qui chez lui
    // marchent très bien.
    const auCrayonRepris = await page.evaluate(async () => {
        freehands.length = 0;
        const c = document.getElementById('board');
        setMode('freehand');
        const env = (t, x, y) => c.dispatchEvent(new PointerEvent(t,
            { pointerId: 6, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
        env('pointerdown', 300, 600); env('pointermove', 420, 600); env('pointerup', 420, 600);
        await new Promise(ok => setTimeout(ok, 150));
        const trait = freehands[0];
        setMode('pointer');
        selectedItems = [{ type: 'freehand', id: trait.id }];
        updateStyleBarContext();
        const vu = (id) => !!document.getElementById(id).getClientRects().length;
        const etat = { surligneur: trait.isHighlighter === true, bout: vu('btn-bout-surligneur'),
                       dash: vu('btn-dash'), fin: vu('btn-arrow-end') };
        selectedItems = []; freehands.length = 0; setMode('pointer'); updateStyleBarContext(); draw();
        return etat;
    });
    r.egal('reprendre un trait de crayon lui laisse tout ce qui lui sert',
        auCrayonRepris,
        { surligneur: false, bout: false, dash: true, fin: true });

    // Le trait emporte son bout : changer le réglage ne retaille pas ce qui
    // est déjà surligné.
    const traces = await page.evaluate(async () => {
        const trait = async () => {
            const c = document.getElementById('board');
            c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 300, clientY: 400, bubbles: true, isPrimary: true }));
            c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 420, clientY: 400, bubbles: true, isPrimary: true }));
            c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 420, clientY: 400, bubbles: true, isPrimary: true }));
            await new Promise(ok => setTimeout(ok, 120));
        };
        freehands.length = 0; selectedItems = [];
        setMode('highlighter');     // le bloc ne dépend pas de l'outil que le précédent a laissé
        changerLeBoutDuSurligneur('carre');
        await trait();                       // celui-ci au bout carré
        changerLeBoutDuSurligneur('rond');
        await trait();                       // celui-là au bout rond
        return freehands.map(f => ({ bout: f.bout, surligneur: !!f.isHighlighter }));
    });
    r.egal('deux traits de surligneur sont posés',
        traces.map(t => t.surligneur), [true, true]);
    r.egal('chacun garde le bout qu\'il avait au moment du geste',
        traces.map(t => t.bout), ['carre', 'rond']);

    // Et ce que l'on exporte porte le même bout que ce que l'on voit. Le bout
    // carré n'est plus un simple stroke-linecap — il tournerait avec la
    // tangente locale, comme au tableau — mais un tampon rempli, jamais
    // tourné : c'est un remplissage plein (pas de trait) qui le distingue du
    // bout rond, resté un trait à bout arrondi.
    const exporte = await page.evaluate(() => {
        const svg = generateSVGString({ x: 0, y: 0, w: 1400, h: 900 }, false);
        return {
            carre: /fill="[^"]+" stroke="none" style="mix-blend-mode: multiply/.test(svg),
            rond: /stroke-linecap="round" stroke-linejoin="round"/.test(svg)
        };
    });
    r.verifie('le SVG exporté distingue les deux bouts',
        exporte.carre && exporte.rond, JSON.stringify(exporte));

    // ET C'EST BIEN L'ENCRE QUI CHANGE, pas seulement ce qu'on note sur le
    // trait. Au coin du bout carré il y a de la couleur ; au même endroit, le
    // bout rond n'en met pas — c'est toute la différence entre les deux, et
    // elle se mesure là.
    const coins = await page.evaluate(async (COIN) => {
        const c = document.getElementById('board');
        const g = c.getContext('2d', { willReadFrequently: true });
        const encreAu = (x, y) => {
            const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            // Le fond est blanc : toute teinte posée l'assombrit quelque part.
            return (d[0] < 245 || d[1] < 245 || d[2] < 245);
        };
        const poser = async (bout) => {
            freehands.length = 0; selectedItems = [];
            setMode('highlighter');
            changerLeBoutDuSurligneur(bout);
            const env = (t, x, y) => c.dispatchEvent(new PointerEvent(t,
                { pointerId: 3, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
            env('pointerdown', 300, 400); env('pointermove', 420, 400); env('pointerup', 420, 400);
            await new Promise(ok => setTimeout(ok, 150));
            draw();
            await new Promise(ok => setTimeout(ok, 150));
            // Le trait fait 24 px de large (4 × 6) : son bout carré déborde de
            // douze pixels au-delà du point d'arrivée, coins compris.
            return { coin: encreAu(420 + COIN, 400 - COIN), milieu: encreAu(360, 400) };
        };
        const carre = await poser('carre');
        const rond = await poser('rond');
        freehands.length = 0; draw();
        return { carre, rond };
    }, 9);
    r.verifie('les deux traits marquent bien le tableau',
        coins.carre.milieu && coins.rond.milieu, JSON.stringify(coins));
    r.verifie('le bout carré pose de l\'encre jusque dans son coin',
        coins.carre.coin, JSON.stringify(coins));
    r.verifie('le bout rond n\'en met pas au même endroit',
        !coins.rond.coin, JSON.stringify(coins));

    // LE CARRÉ EFFECTUE UNE ROTATION — sur un trait oblique, un bout carré
    // qui tourne avec la tangente locale devient un losange : son coin pointe
    // dans la direction du geste, et les coins d'un vrai carré (à axes fixes)
    // restent vides. On trace un trait à 45°, et on regarde un coin du carré
    // à axes fixes, à l'écart de la pointe que ferait un losange.
    const oblique = await page.evaluate(async () => {
        freehands.length = 0; selectedItems = [];
        setMode('highlighter'); changerLeBoutDuSurligneur('carre');
        const c = document.getElementById('board');
        const g = c.getContext('2d', { willReadFrequently: true });
        const encreAu = (x, y) => {
            const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            return (d[0] < 245 || d[1] < 245 || d[2] < 245);
        };
        const env = (t, x, y) => c.dispatchEvent(new PointerEvent(t,
            { pointerId: 4, clientX: x, clientY: y, bubbles: true, isPrimary: true }));
        env('pointerdown', 300, 300); env('pointermove', 400, 400); env('pointerup', 400, 400);
        await new Promise(ok => setTimeout(ok, 150));
        draw();
        await new Promise(ok => setTimeout(ok, 150));
        // Trait de 24 px (4 × 6), demi-largeur 12 : le coin du carré à axes
        // fixes est à peu près (410, 390) — à l'écart de la pointe qu'un
        // losange tourné projetterait vers (408, 408).
        const coinDuCarre = encreAu(410, 390);
        freehands.length = 0; draw();
        return { coinDuCarre };
    });
    r.verifie('sur un trait oblique, le bout carré garde ses coins à axes fixes',
        oblique.coinDuCarre, JSON.stringify(oblique));

    await page.evaluate(() => {
        freehands.length = 0; selectedItems = []; setMode('pointer');
        changerLeBoutDuSurligneur('rond'); draw();
    });


    // =================================================================
    // ET LE CRAYON MONTRE SON EMPREINTE, LUI AUSSI
    //
    // « Le crayon et le surligneur ne semblent plus arrondis (linéarisé ?),
    // l'épaisseur du crayon ne fonctionne pas. »
    //
    // Les deux reproches n'en font qu'un, et c'est le curseur. Relevé : le
    // surligneur montrait bien son rond — il grandissait de 3 à 30 —, mais le
    // crayon n'avait qu'une classe CSS, « cursor-pencil », qui valait
    // « crosshair ». Deux traits droits qui se croisent : rien d'arrondi, et
    // surtout RIEN QUI CHANGE quand on règle l'épaisseur. On choisissait un
    // trait de trente et l'on visait avec la même croix qu'à trois.
    // =================================================================
    const auCrayon = async (epaisseur) => page.evaluate((e) => {
        selectedItems = [];
        activeStyle.strokeColor = '#e17055';
        setMode('freehand');
        // On passe par la commande d'épaisseur, celle que le professeur
        // touche — pas par la variable.
        reglerEpaisseurTrait(e, 'sonde');
        const brut = canvas.style.cursor;
        const dedans = decodeURIComponent((brut.match(/utf8,([^']*)/) || [])[1] || '');
        // Le rond de l'encre est le DERNIER cercle plein : le halo, lui, est
        // sans remplissage.
        const rayons = [...dedans.matchAll(/<circle[^>]*r="([\d.]+)"/g)].map(m => Number(m[1]));
        const largeur = Number((dedans.match(/<svg[^>]*width="([\d.]+)"/) || [])[1] || 0);
        return { epaisseur: e, brut: brut.slice(0, 30), dedans,
                 estUneImage: brut.startsWith('url'),
                 rond: /<circle/.test(dedans), croix: /crosshair/.test(brut) && !brut.startsWith('url'),
                 rayonDeLEncre: rayons.length ? Math.min(...rayons) : null,
                 rayonMax: rayons.length ? Math.max(...rayons) : null,
                 largeur,
                 aLaCouleur: /%23e17055|#e17055/i.test(dedans) };
    }, epaisseur);

    const c30 = await auCrayon(30);
    r.verifie('le crayon montre un rond, et non une croix',
        c30.estUneImage && c30.rond && !c30.croix, JSON.stringify({ brut: c30.brut, rond: c30.rond }));
    r.verifie('à la taille de ce qu\'il dépose vraiment',
        c30.rayonDeLEncre === 15, c30.dedans);
    r.verifie('et de la couleur qu\'on a choisie', c30.aLaCouleur, c30.dedans);

    const c6 = await auCrayon(6);
    const c12 = await auCrayon(12);
    // LE CŒUR DE L'AFFAIRE : trois épaisseurs, trois ronds différents.
    r.verifie('un trait plus fin donne un rond plus petit, et cela se voit',
        c6.rayonDeLEncre < c12.rayonDeLEncre && c12.rayonDeLEncre < c30.rayonDeLEncre,
        JSON.stringify([c6.rayonDeLEncre, c12.rayonDeLEncre, c30.rayonDeLEncre]));

    // ET IL RESTE TROUVABLE À L'ŒIL. Un curseur fidèle mais invisible ne vaut
    // rien : à l'épaisseur deux, le rond fait deux pixels et se perd sur un
    // polycopié chargé. Un cercle fin, toujours de la même taille, le
    // rattrape — sans rien ôter à la fidélité de l'empreinte.
    const c2 = await auCrayon(2);
    r.verifie('le trait le plus fin garde une empreinte fidèle',
        c2.rayonDeLEncre === 1, c2.dedans);
    r.verifie('et un halo qui le rend trouvable à l\'œil',
        c2.largeur >= 13 && c2.rayonMax > c2.rayonDeLEncre,
        JSON.stringify({ largeur: c2.largeur, encre: c2.rayonDeLEncre, halo: c2.rayonMax }));
    // Le gros trait n'en a pas besoin : il se voit tout seul.
    r.verifie('le gros trait, lui, se passe de halo',
        c30.rayonMax === c30.rayonDeLEncre, c30.dedans);

    // LE CURSEUR SUIT SANS QU'ON REPASSE SUR LE TABLEAU. On règle l'épaisseur
    // dans la barre, on regarde le curseur : il a déjà changé. Sans cela il
    // fallait d'abord aller bouger la souris sur le tableau pour voir ce
    // qu'on venait de choisir.
    const vivant = await page.evaluate(() => {
        setMode('freehand');
        reglerEpaisseurTrait(4, 'sonde');
        const avant = canvas.style.cursor;
        // On ne touche à RIEN d'autre : pas de « pointermove », pas de
        // « updateCursor » à la main.
        reglerEpaisseurTrait(40, 'sonde');
        return { avant: avant.length, apres: canvas.style.cursor.length,
                 change: avant !== canvas.style.cursor };
    });
    r.verifie('régler l\'épaisseur change le curseur sur-le-champ',
        vivant.change, JSON.stringify(vivant));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
