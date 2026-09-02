// Les raccourcis clavier des outils : une touche par outil, écrite dans
// l'infobulle du bouton et reprise dans l'aide. Une seule table les décrit
// tous les trois — ce test vérifie qu'ils disent bien la même chose.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Raccourcis clavier');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof RACCOURCIS_OUTILS !== 'undefined', { timeout: 20000 });
    await page.waitForTimeout(1000);           // les barres flottantes se recopient

    // --- LA TABLE ELLE-MÊME ---
    const table = await page.evaluate(() => {
        const touches = RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).map(x => x.touche);
        const modesConnus = Array.from(document.querySelectorAll('.btn[data-mode]'))
            .map(b => b.dataset.mode);
        return {
            outils: RACCOURCIS_OUTILS.length,
            gestes: RACCOURCIS_GESTES.length,
            doublons: touches.length - new Set(touches).size,
            majuscules: touches.every(t => t === t.toUpperCase()),
            orphelins: RACCOURCIS_OUTILS.filter(o => !modesConnus.includes(o.mode)).map(o => o.mode),
            sansBouton: RACCOURCIS_GESTES.filter(g => g.bouton && !document.getElementById(g.bouton)).map(g => g.bouton),
            // Un geste sans bouton doit nommer une manœuvre qui existe
            actionsMortes: RACCOURCIS_GESTES.filter(g => !g.bouton
                && typeof window[g.action] !== 'function').map(g => g.touche),
            nommes: RACCOURCIS_OUTILS.concat(RACCOURCIS_GESTES).every(x => !!x.nom)
        };
    });
    r.verifie('tous les outils courants ont leur touche', table.outils >= 15, JSON.stringify(table));
    r.egal('aucune touche n\'est attribuée deux fois', table.doublons, 0);
    r.verifie('elles sont toutes écrites en majuscule', table.majuscules);
    r.egal('chaque raccourci vise un outil qui existe', table.orphelins, []);
    r.egal('et chaque geste vise un bouton qui existe', table.sansBouton, []);
    r.egal('ou une manœuvre qui existe', table.actionsMortes, []);
    r.verifie('chacun porte un nom lisible pour l\'aide', table.nommes);

    // --- LES TOUCHES CHANGENT VRAIMENT D'OUTIL ---
    const essais = [['c', 'freehand'], ['t', 'text'], ['g', 'eraser'], ['n', 'postit'],
                    ['p', 'laser'], ['1', 'point'], ['2', 'segment'], ['5', 'circle'],
                    ['7', 'polygon'], ['s', 'pointer']];
    const obtenus = [];
    for (const [touche] of essais) {
        await page.keyboard.press(touche);
        await page.waitForTimeout(90);
        obtenus.push(await page.evaluate(() => mode));
    }
    essais.forEach(([touche, attendu], i) => {
        r.egal(`« ${touche.toUpperCase()} » choisit ${attendu}`, obtenus[i], attendu);
    });

    // La majuscule marche aussi : on ne perd pas l'outil parce qu'on tient Maj
    await page.keyboard.press('G');
    await page.waitForTimeout(90);
    r.egal('la majuscule fait la même chose', await page.evaluate(() => mode), 'eraser');
    await page.keyboard.press('s');
    await page.waitForTimeout(90);

    // --- LES GESTES ---
    const gestes = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    await page.keyboard.press('l'); await page.waitForTimeout(120);
    await page.keyboard.press('a'); await page.waitForTimeout(120);
    await page.keyboard.press('x'); await page.waitForTimeout(120);
    const apres = await page.evaluate(() => ({ loupe: isLoupeActive, aimant: magnetMode, axes: showAxes }));
    r.verifie('« L » allume la loupe', apres.loupe !== gestes.loupe, JSON.stringify(apres));
    r.verifie('« A » bascule l\'aimant', apres.aimant !== gestes.aimant, JSON.stringify(apres));
    r.verifie('« X » fait avancer les axes', apres.axes !== gestes.axes, JSON.stringify(apres));
    await page.keyboard.press('l'); await page.keyboard.press('a');
    await page.waitForTimeout(120);

    // --- ON N'INTERCEPTE PAS CE QUE L'ON ÉCRIT ---
    const enSaisie = await page.evaluate(() => {
        const champ = document.createElement('input');
        document.body.appendChild(champ);
        champ.focus();
        const avant = mode;
        champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        champ.remove();
        return { avant, apres };
    });
    r.egal('taper dans un champ ne change pas d\'outil', enSaisie.apres, enSaisie.avant);

    const avecCtrl = await page.evaluate(() => {
        setMode('pointer');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
        return mode;
    });
    r.egal('Ctrl+C reste Copier, il ne prend pas le crayon', avecCtrl, 'pointer');

    const souslaModale = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const avant = mode;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
        const apres = mode;
        document.getElementById('help-modal').style.display = 'none';
        return { avant, apres };
    });
    r.egal('une fenêtre ouverte garde le clavier pour elle', souslaModale.apres, souslaModale.avant);

    // --- LA TOUCHE SE LIT SUR LE BOUTON ---
    const surLesBoutons = await page.evaluate(() => {
        const manquants = RACCOURCIS_OUTILS.filter(o =>
            !document.querySelector('.btn[data-mode="' + o.mode + '"][data-raccourci="' + o.touche + '"]'));
        return {
            poses: document.querySelectorAll('[data-raccourci]').length,
            manquants: manquants.map(m => m.mode),
            // « data-tooltip » sert aussi de nom sous l'icône : il doit rester net
            tooltipPropre: !Array.from(document.querySelectorAll('[data-raccourci]'))
                .some(b => /\(\s*[A-Z0-9]\s*\)$/.test(b.getAttribute('data-tooltip') || ''))
        };
    });
    r.egal('chaque bouton d\'outil porte sa touche', surLesBoutons.manquants, []);
    r.verifie('toutes les copies des barres flottantes aussi', surLesBoutons.poses >= 20, String(surLesBoutons.poses));
    r.verifie('sans polluer le nom affiché sous l\'icône', surLesBoutons.tooltipPropre);

    await page.hover('.btn[data-mode="freehand"]');
    await page.waitForTimeout(800);
    const bulle = await page.evaluate(() => {
        const t = document.getElementById('dt-tooltip');
        return {
            visible: t.classList.contains('visible'),
            touche: (t.querySelector('.dt-touche') || {}).textContent,
            texte: t.textContent
        };
    });
    r.verifie('l\'infobulle s\'ouvre sur un outil', bulle.visible, JSON.stringify(bulle));
    r.egal('et montre sa touche', bulle.touche, 'C');
    r.verifie('à côté du nom de l\'outil, pas à la place', /Tracé|Libre/i.test(bulle.texte), bulle.texte);

    // --- L'AIDE DIT LA MÊME CHOSE QUE LE CLAVIER ---
    const aide = await page.evaluate(async () => {
        document.getElementById('btn-help').click();
        await new Promise(r => setTimeout(r, 300));
        const lire = (id) => Array.from(document.querySelectorAll('#' + id + ' div'))
            .map(d => ({ touche: d.querySelector('code').textContent, nom: d.textContent.trim() }));
        const outils = lire('aide-raccourcis-outils');
        const gestes = lire('aide-raccourcis-gestes');
        document.getElementById('help-modal').style.display = 'none';
        return {
            outils: outils.length, gestes: gestes.length,
            fidele: outils.every((l, i) => l.touche === RACCOURCIS_OUTILS[i].touche)
                 && gestes.every((l, i) => l.touche === RACCOURCIS_GESTES[i].touche),
            nomme: outils.every(l => l.nom.length > 2)
        };
    });
    r.egal('l\'aide liste tous les outils', aide.outils, table.outils);
    r.egal('et tous les gestes', aide.gestes, table.gestes);
    r.verifie('avec exactement les touches du clavier', aide.fidele, JSON.stringify(aide));
    r.verifie('et le nom de chacun', aide.nomme);

    // ==========================================================
    // PALETTE DE COMMANDES (Ctrl+K)
    // L'index n'est écrit nulle part : il est récolté dans la page. Une
    // commande ajoutée à l'interface doit donc être trouvable sans que
    // personne ait pensé à l'inscrire quelque part.
    // ==========================================================
    const recolte = await page.evaluate(() => {
        const c = recolterLesCommandes();
        const lieux = {};
        c.forEach(x => { lieux[x.lieu] = (lieux[x.lieu] || 0) + 1; });
        return {
            total: c.length,
            lieux: Object.keys(lieux).sort(),
            doublons: c.length - new Set(c.map(x => x.cle)).size,
            sansNom: c.filter(x => !x.nom.trim()).length,
            avecTouche: c.filter(x => x.touche).length
        };
    });
    r.verifie('la palette récolte largement plus de commandes que les seuls plugins',
        recolte.total > 150, 'récoltées : ' + recolte.total);
    r.verifie('elle couvre les outils, les plugins, la barre du bas, les styles et l\'explorateur',
        ['Outils', 'Barre du bas', 'Styles', 'Explorateur', 'Jeux'].every(l => recolte.lieux.includes(l)),
        recolte.lieux.join(', '));
    r.egal('aucune commande n\'apparaît deux fois', recolte.doublons, 0);
    r.egal('aucune commande sans nom', recolte.sansNom, 0);
    r.verifie('les outils affichent leur touche de clavier', recolte.avecTouche >= 15,
        'avec touche : ' + recolte.avecTouche);

    const recherches = await page.evaluate(() => {
        const trouver = (q) => filtrerLesCommandes(q, recolterLesCommandes());
        return {
            compas: trouver('compas').map(x => x.nom),
            classes: trouver('classes').map(x => x.nom),
            // Chercher le nom d'une catégorie sort les plugins qu'elle contient
            parCategorie: trouver('physique').map(x => x.lieu),
            // Deux mots dans le désordre trouvent la même chose
            ordre1: trouver('exporter tableau').map(x => x.nom),
            ordre2: trouver('tableau exporter').map(x => x.nom),
            rien: trouver('zzzzz').length,
            vide: trouver('   ').length
        };
    });
    r.verifie('« compas » trouve le compas', recherches.compas.includes('Compas'),
        JSON.stringify(recherches.compas));
    r.verifie('« classes » trouve « Mes classes »', recherches.classes.includes('Mes classes'),
        JSON.stringify(recherches.classes));
    r.verifie('chercher une catégorie sort ses plugins',
        recherches.parCategorie.includes('Physique-Chimie'), JSON.stringify(recherches.parCategorie));
    r.egal('l\'ordre des mots tapés n\'a pas d\'importance', recherches.ordre1, recherches.ordre2);
    r.egal('un mot introuvable ne rend rien', recherches.rien, 0);
    r.egal('une recherche vide non plus', recherches.vide, 0);

    // Le geste complet : Ctrl+K, on tape, on choisit, la commande part
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(120);
    let pal = await page.evaluate(() => ({
        ouverte: !document.getElementById('palette-commandes').hidden,
        focus: document.activeElement && document.activeElement.id
    }));
    r.verifie('Ctrl+K ouvre la palette', pal.ouverte);
    r.egal('le curseur est déjà dans le champ', pal.focus, 'pal-saisie');

    await page.keyboard.type('compas');
    await page.waitForTimeout(120);
    const liste = await page.evaluate(() => ({
        n: document.querySelectorAll('#pal-resultats .pal-item').length,
        premierActif: !!document.querySelector('#pal-resultats .pal-item.actif'),
        lieuAffiche: (document.querySelector('#pal-resultats .pal-lieu') || {}).textContent
    }));
    r.verifie('taper filtre la liste', liste.n >= 1 && liste.n <= 12, 'résultats : ' + liste.n);
    r.verifie('le premier résultat est déjà choisi', liste.premierActif);
    r.egal('et le résultat dit où la commande se trouve', liste.lieuAffiche, 'Outils');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    pal = await page.evaluate(() => ({
        fermee: document.getElementById('palette-commandes').hidden,
        compasArme: typeof activeWidgets !== 'undefined' && !!activeWidgets['compass']
    }));
    r.verifie('Entrée referme la palette', pal.fermee);
    r.verifie('et lance vraiment la commande', pal.compasArme);

    // Échap referme sans rien lancer
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const apresEchap = await page.evaluate(() =>
        document.getElementById('palette-commandes').hidden);
    r.verifie('Échap la referme', apresEchap);

    // Ctrl+K une seconde fois la referme : c'est une bascule
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(100);
    const bascule = await page.evaluate(() =>
        document.getElementById('palette-commandes').hidden);
    r.verifie('et Ctrl+K la referme aussi', bascule);

    // Refermée, elle ne doit plus rien intercepter : « display: flex »
    // l'emporte sur l'attribut « hidden », et le voile restait en travers
    // de la page à avaler les clics.
    const voile = await page.evaluate(() => {
        const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        return { id: (el && el.id) || '', dansLaPalette: !!(el && el.closest('#palette-commandes')) };
    });
    r.verifie('et refermée, elle ne reste pas en travers de la page',
        !voile.dansLaPalette, 'sous le curseur : ' + voile.id);

    // Ctrl+K ne doit pas se faire voler la touche par le raccourci d'outil
    const pasDeVol = await page.evaluate(() => mode);
    r.verifie('la touche K n\'a pas changé d\'outil au passage',
        pasDeVol !== 'freehand', 'mode : ' + pasDeVol);


    // ==========================================================
    // LES COMBINAISONS : couleur, plein écran, document en pleine page
    // Elles passent PARTOUT, y compris pendant qu'on écrit — c'est même
    // là que la couleur sert le plus.
    // ==========================================================
    const palette = await page.evaluate(() => couleursDeLaPalette());
    r.verifie('la palette est relevée dans la page, pas recopiée',
        palette.length >= 7, palette.join(' '));

    // Ctrl+Maj+chiffre pendant la saisie d'un texte. On range d'abord le compas
    // qu'un test précédent a posé sur le tableau : il attraperait le clic.
    await page.evaluate(() => {
        if (typeof activeWidgets !== 'undefined') {
            Object.keys(activeWidgets).forEach(k => { delete activeWidgets[k]; });
        }
        texts.length = 0; images.length = 0; selectedItems = [];
        setMode('text'); draw();
    });
    await page.mouse.click(500, 400);
    await page.waitForTimeout(250);
    await page.keyboard.type('Bonjour');
    await page.keyboard.press('Control+Shift+Digit4');
    await page.waitForTimeout(120);
    const couleurEnSaisie = await page.evaluate(() => {
        const z = document.getElementById('wysiwyg-text');
        // La couleur RÉELLEMENT affichée pour « Bonjour » : c'est elle qui
        // compte, et non le balisage — repeindre le bloc entier se faisait par
        // le style du conteneur, invisible dans innerHTML.
        const porteur = z.firstChild && (z.firstChild.nodeType === 3 ? z.parentElement && z.firstChild.parentElement : z.firstChild);
        return {
            actif: activeStyle.strokeColor,
            pastille: getComputedStyle(document.getElementById('tt-color-dot')).backgroundColor,
            ouverte: z.style.display === 'block',
            texte: z.textContent,
            rendueBonjour: getComputedStyle(porteur || z).color
        };
    });
    r.egal('Ctrl+Maj+4 arme la quatrième couleur', couleurEnSaisie.actif, palette[3]);
    r.egal('et la pastille de la barre la montre', couleurEnSaisie.pastille, 'rgb(46, 204, 113)');
    r.verifie('la saisie n\'est pas interrompue', couleurEnSaisie.ouverte);
    r.egal('rien n\'est tapé dans le texte', couleurEnSaisie.texte, 'Bonjour');
    r.verifie('ce qui est déjà écrit n\'est pas repeint',
        couleurEnSaisie.rendueBonjour !== 'rgb(46, 204, 113)', couleurEnSaisie.rendueBonjour);

    // ... mais la suite de la frappe, elle, prend la couleur
    await page.keyboard.type(' suite');
    await page.waitForTimeout(120);
    const apresFrappe = await page.evaluate(() => document.getElementById('wysiwyg-text').innerHTML);
    r.verifie('la suite de la frappe prend la nouvelle couleur',
        /2ecc71|46,\s*204,\s*113/.test(apresFrappe), apresFrappe);
    r.verifie('et « Bonjour » reste dans la couleur d\'origine',
        /^Bonjour/.test(apresFrappe.replace(/<[^>]*>/g, '')) && apresFrappe.indexOf('Bonjour') <
            (apresFrappe.search(/2ecc71|46,\s*204,\s*113/) + 1 || Infinity), apresFrappe);

    // La pastille suit le curseur : replacé dans « Bonjour », qui n'a pas
    // changé de couleur, elle redevient celle-là.
    const pastilleAuCurseur = await page.evaluate(() => {
        const z = document.getElementById('wysiwyg-text');
        const n = z.firstChild;
        const r2 = document.createRange();
        r2.setStart(n, 3); r2.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r2);
        syncBadgesTexte();
        return getComputedStyle(document.getElementById('tt-color-dot')).backgroundColor;
    });
    r.verifie('la pastille suit le curseur : de retour dans « Bonjour », elle quitte le vert',
        pastilleAuCurseur !== 'rgb(46, 204, 113)', pastilleAuCurseur);

    // Avec un mot surligné, elle ne va qu'à lui
    const surligne = await page.evaluate((c) => {
        const z = document.getElementById('wysiwyg-text');
        const n = z.firstChild;               // le nœud « Bonjour »
        const r2 = document.createRange();
        r2.setStart(n, 0); r2.setEnd(n, 7);   // « Bonjour »
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r2);
        couleurParRaccourci(3);
        return { html: z.innerHTML,
                 pastille: getComputedStyle(document.getElementById('tt-color-dot')).backgroundColor,
                 attendu: c };
    }, palette[2]);
    r.verifie('surligné, seul le mot choisi change de couleur',
        /f1c40f|241,\s*196,\s*15/.test(surligne.html) && /2ecc71|46,\s*204,\s*113/.test(surligne.html),
        surligne.html);
    r.egal('et la pastille suit le mot surligné', surligne.pastille, 'rgb(241, 196, 15)');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Hors saisie, la même touche agit sur l'outil
    await page.keyboard.press('Control+Shift+Digit2');
    await page.waitForTimeout(120);
    r.egal('hors saisie, Ctrl+Maj+2 change la couleur de l\'outil',
        await page.evaluate(() => activeStyle.strokeColor), palette[1]);

    // Le chiffre se lit sur la TOUCHE, pas sur le caractère produit : avec un
    // modificateur, un clavier Mac renvoie « „ » et un clavier américain « ! ».
    // C'est ce qui faisait écrire un caractère spécial au lieu de changer la
    // couleur. On rejoue les deux cas tels que le navigateur les envoie.
    const parLeCode = await page.evaluate((attendu) => {
        const essai = (key, code) => {
            activeStyle.strokeColor = '#000000';
            const ev = new KeyboardEvent('keydown', { key, code, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
            window.dispatchEvent(ev);
            return { couleur: activeStyle.strokeColor, bloque: ev.defaultPrevented };
        };
        return { mac: essai('„', 'Digit3'), us: essai('#', 'Digit3'), attendu };
    }, palette[2]);
    r.egal('clavier Mac : Ctrl+Maj+3 lit la touche 3, pas le « „ » qu\'elle compose',
        parLeCode.mac.couleur, palette[2]);
    r.egal('clavier américain : idem pour le « # »', parLeCode.us.couleur, palette[2]);
    r.verifie('et la frappe est bloquée, donc aucun caractère n\'est écrit',
        parLeCode.mac.bloque && parLeCode.us.bloque, JSON.stringify(parLeCode));

    // Un chiffre seul reste le raccourci d'un outil géométrique
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(150);
    r.egal('un chiffre SANS modificateur choisit toujours son outil',
        await page.evaluate(() => mode), 'segment');

    // Le document en pleine page. On part d'un document ROGNÉ, comme il l'est
    // dès qu'on a réglé son cadre ou zoomé la page dedans : c'est là que la
    // présentation coupait les bords en plein milieu d'un mot.
    const presentation = await page.evaluate(() => {
        setMode('pointer');
        // Table rase : le fond sombre se mesure au pixel, un texte oublié par
        // un test précédent viendrait s'asseoir dessus.
        images.length = 0; texts.length = 0; freehands.length = 0; selectedItems = [];
        // Un canevas fait un document d'essai que le tableau sait dessiner ;
        // on lui pose les mesures naturelles que le code va relire.
        const feuille = document.createElement('canvas');
        feuille.width = 1600; feuille.height = 1131;
        feuille.naturalWidth = 1600; feuille.naturalHeight = 1131;
        imageCache['doc-essai'] = feuille;
        images.push({ id: nextId++, x: 0, y: 0, w: 800, h: 700,
            cx: 300, cy: 200, cw: 1000, ch: 875, src: 'doc-essai', z: globalZ++,
            pluginData: { id: 'pdfDoc', cle: 'x', page: 1, pages: 3 } });
        panX = 0; panY = 0; zoom = 1;
        document.body.classList.remove('focus-mode');
        const rogneAvant = documentEstRogne(images[0]);
        const ok = presenterLeDocument();
        const c = document.getElementById('board');
        const doc = images[0];
        return {
            ok, mode: modeDocument, rogneAvant,
            focus: document.body.classList.contains('focus-mode'),
            choisi: selectedItems.length === 1 && selectedItems[0].id === doc.id,
            rogneApres: documentEstRogne(doc),
            // Le cadre a repris les proportions de la page
            proportions: Math.abs(doc.h / doc.w - 1131 / 1600) < 0.001,
            // Le document doit tenir dans l'écran, et le remplir vraiment
            tientDedans: doc.w * zoom <= c.clientWidth + 1 && doc.h * zoom <= c.clientHeight + 1,
            remplit: Math.max(doc.w * zoom / c.clientWidth, doc.h * zoom / c.clientHeight) > 0.999,
            centre: Math.abs((doc.x + doc.w / 2) * zoom + panX - c.clientWidth / 2) < 2
        };
    });
    r.verifie('la présentation du document part', presentation.ok);
    r.egal('en mode page, pour pouvoir naviguer dedans', presentation.mode, 'page');
    r.verifie('avec l\'interface effacée', presentation.focus);
    r.verifie('le document est choisi', presentation.choisi);
    r.verifie('le document était bien rogné au départ', presentation.rogneAvant);
    r.verifie('la présentation montre la page ENTIÈRE, bords compris',
        !presentation.rogneApres, JSON.stringify(presentation));
    r.verifie('et le cadre reprend les proportions de la page', presentation.proportions);
    r.verifie('il tient dans l\'écran', presentation.tientDedans);
    r.verifie('et le remplit jusqu\'aux bords', presentation.remplit, JSON.stringify(presentation));
    r.verifie('centré', presentation.centre);

    // Le pourtour de la page est peint sombre : une page A4 sur un écran 16/9
    // laisse forcément du vide sur les côtés, autant que ce vide se lise comme
    // un fond et non comme deux bandes blanches restées là.
    const fond = await page.evaluate(() => {
        draw();
        const g = document.getElementById('board').getContext('2d');
        const doc = images[0];
        const bord = g.getImageData(4, Math.round(document.getElementById('board').clientHeight / 2), 1, 1).data;
        const dedans = g.getImageData(Math.round(doc.x * zoom + panX + doc.w * zoom / 2),
                                      Math.round(doc.y * zoom + panY + doc.h * zoom / 2), 1, 1).data;
        return { bord: [bord[0], bord[1], bord[2]], dedans: [dedans[0], dedans[1], dedans[2]],
                 enCours: presentationEnCours === doc.id };
    });
    r.verifie('la présentation est en cours', fond.enCours);
    r.verifie('le pourtour de la page est sombre',
        fond.fond !== undefined || fond.bord.every(v => v < 60), JSON.stringify(fond.bord));
    r.verifie('et la page, elle, n\'est pas assombrie',
        fond.dedans.some(v => v > 150), JSON.stringify(fond.dedans));

    // Un second « D » prend toute la largeur, un troisième revient à la page
    const largeur = await page.evaluate(() => {
        const c = document.getElementById('board');
        presenterLeDocument();
        const doc = images[0];
        const enLargeur = { cadrage: cadrageDePresentation,
                            remplitLargeur: Math.abs(doc.w * zoom - c.clientWidth) < 1.5,
                            gauche: Math.round(doc.x * zoom + panX) };
        presenterLeDocument();
        const revenu = { cadrage: cadrageDePresentation,
                         tientEnHauteur: doc.h * zoom <= c.clientHeight + 1 };
        return { enLargeur, revenu };
    });
    r.egal('un second « D » passe en pleine largeur', largeur.enLargeur.cadrage, 'largeur');
    r.verifie('la page remplit alors l\'écran d\'un bord à l\'autre',
        largeur.enLargeur.remplitLargeur && Math.abs(largeur.enLargeur.gauche) < 1.5,
        JSON.stringify(largeur.enLargeur));
    r.egal('un troisième revient à la page entière', largeur.revenu.cadrage, 'page');
    r.verifie('qui tient à nouveau en hauteur', largeur.revenu.tientEnHauteur);

    // Quitter le mode Focus met fin à la présentation, fond sombre compris
    const sortie = await page.evaluate(() => {
        toggleFocusMode();
        draw();
        const g = document.getElementById('board').getContext('2d');
        const bord = g.getImageData(4, 4, 1, 1).data;
        return { enCours: presentationEnCours, clair: bord[0] > 150, px: [bord[0],bord[1],bord[2]], focus: document.body.classList.contains('focus-mode') };
    });
    r.verifie('quitter le mode Focus met fin à la présentation', !sortie.enCours);
    r.verifie('et le fond sombre s\'en va avec elle', sortie.clair, JSON.stringify(sortie));

    await page.evaluate(() => { if (!document.body.classList.contains('focus-mode')) toggleFocusMode(); });

    // Le cœur « Soutenir le projet » ne reste pas devant la classe.
    // Il s'efface en fondu : on laisse la transition se terminer.
    await page.waitForTimeout(400);
    const cacheEnFocus = await page.evaluate(() =>
        getComputedStyle(document.getElementById('donate-float-btn')).opacity === '0');
    await page.evaluate(() => document.body.classList.remove('focus-mode'));
    await page.waitForTimeout(400);
    const coeur = {
        cache: cacheEnFocus,
        visibleHorsFocus: await page.evaluate(() =>
            getComputedStyle(document.getElementById('donate-float-btn')).opacity !== '0')
    };
    r.verifie('le bouton « Soutenir » s\'efface en mode Focus', coeur.cache);
    r.verifie('et revient quand on en sort', coeur.visibleHorsFocus);

    // La touche « D » au clavier : c'est elle le vrai raccourci, Ctrl+L
    // n'étant pas récupérable au navigateur.
    const parLaTouche = await page.evaluate(() => {
        document.body.classList.remove('focus-mode');
        modeDocument = 'cadre';
        panX = 0; panY = 0; zoom = 1;
        setMode('pointer'); selectedItems = [];
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
        return { mode: modeDocument, focus: document.body.classList.contains('focus-mode') };
    });
    r.egal('« D » met le document en pleine page', parLaTouche.mode, 'page');
    r.verifie('et efface l\'interface', parLaTouche.focus);

    // Sans document, on le dit plutôt que de ne rien faire
    const sansDoc = await page.evaluate(() => {
        images.length = 0; selectedItems = [];
        return presenterLeDocument();
    });
    r.verifie('sans document, la présentation ne fait rien', sansDoc === false);

    // Les combinaisons sont écrites dans l'aide
    const aideCombines = await page.evaluate(() => {
        remplirAideRaccourcis();
        const t = (document.getElementById('aide-raccourcis-combines') || {}).textContent || '';
        return { t, n: RACCOURCIS_COMBINES.length };
    });
    // L'aide se cherche : un champ filtre tout, les rubriques défilent
    const recherche = await page.evaluate(() => {
        document.getElementById('btn-help').click();
        const sections = Array.from(document.querySelectorAll('#aide-pages .aide-section'));
        const visibles = () => sections.filter(s => !s.hidden).length;
        const lignesVisibles = () =>
            Array.from(document.querySelectorAll('#aide-pages li, #aide-pages .aide-rac'))
                .filter(l => !l.hidden).length;
        const auDebut = { sections: sections.length, visibles: visibles(), lignes: lignesVisibles() };

        filtrerLAide('post-it');
        const postit = { visibles: visibles(), lignes: lignesVisibles(),
                         textes: Array.from(document.querySelectorAll('#aide-pages li:not([hidden]), #aide-pages .aide-rac:not([hidden])'))
                             .map(l => l.textContent.slice(0, 40)) };

        filtrerLAide('zzzz introuvable');
        const rien = { visibles: visibles(), message: !document.getElementById('aide-rien').hidden };

        filtrerLAide('');
        const remis = { visibles: visibles(), lignes: lignesVisibles() };

        // Une seule colonne : plus de grille à deux colonnes
        const colonnes = getComputedStyle(document.getElementById('aide-pages')).gridTemplateColumns;
        // Le titre de rubrique reste collé en haut pendant qu'on défile
        const collant = getComputedStyle(sections[0].querySelector('h3')).position;
        document.getElementById('help-modal').style.display = 'none';
        return { auDebut, postit, rien, remis, colonnes, collant };
    });
    r.egal('sept rubriques, toutes lisibles d\'une traite',
        [recherche.auDebut.sections, recherche.auDebut.visibles], [7, 7]);
    r.verifie('l\'aide n\'est plus en onglets : tout défile',
        recherche.auDebut.lignes > 40, String(recherche.auDebut.lignes));
    r.verifie('chercher « post-it » ne garde que ce qui en parle',
        recherche.postit.lignes > 0 && recherche.postit.lignes < recherche.auDebut.lignes
        && recherche.postit.textes.every(t => /post-it|Note/i.test(t)),
        JSON.stringify(recherche.postit.textes));
    r.verifie('et referme les rubriques devenues vides',
        recherche.postit.visibles < 7, String(recherche.postit.visibles));
    r.verifie('une recherche sans réponse le dit',
        recherche.rien.visibles === 0 && recherche.rien.message, JSON.stringify(recherche.rien));
    r.egal('effacer la recherche rend toute l\'aide',
        [recherche.remis.visibles, recherche.remis.lignes],
        [recherche.auDebut.visibles, recherche.auDebut.lignes]);
    r.verifie('l\'aide n\'est plus en deux colonnes',
        !/\d+px\s+\d+px/.test(recherche.colonnes), recherche.colonnes);
    r.egal('le titre de rubrique reste collé en haut', recherche.collant, 'sticky');

    // Apprendre les raccourcis en travaillant : le logiciel souffle la touche
    // quand on clique le bouton, et se tait dès qu'elle est acquise.
    const appris = await page.evaluate(() => {
        localStorage.removeItem('auTableau_raccourcis_v1');
        localStorage.removeItem('auTableau_souffler_raccourcis');
        // On repart d'une mémoire vide
        Object.keys(window.memoireRaccourcis || {}).forEach(k => delete window.memoireRaccourcis[k]);
        const bouton = document.querySelector('.btn[data-raccourci="C"]');
        const bulle = () => document.getElementById('bulle-raccourci');
        const visible = () => !!(bulle() && bulle().classList.contains('visible'));

        // Un premier clic compte, mais n'a pas encore de raison de souffler :
        // la bulle attend qu'on ait pris l'habitude du bouton.
        bouton.click();
        const apres1 = { etat: etatDuRaccourci('C'), souris: ficheRaccourci('C').souris };
        // Un second : on clique souvent, jamais au clavier — on souffle
        const soufflé = soufflerLaTouche(bouton, 'C');
        const texte = bulle() ? bulle().textContent : '';

        // Trois usages au clavier : acquis, et l'on se tait pour de bon
        noterUsage('C', 'clavier'); noterUsage('C', 'clavier'); noterUsage('C', 'clavier');
        const acquis = etatDuRaccourci('C');
        const encore = soufflerLaTouche(bouton, 'C');

        // L'interrupteur coupe tout
        Object.keys(window.memoireRaccourcis).forEach(k => delete window.memoireRaccourcis[k]);
        reglerSouffler(false);
        const coupe = soufflerLaTouche(bouton, 'C');
        reglerSouffler(true);
        return { apres1, soufflé, texte, acquis, encore, coupe, visibleAvant: visible() };
    });
    r.egal('cliquer un bouton compte comme un usage à la souris', appris.apres1.souris, 1);
    r.verifie('la touche est soufflée quand on préfère la souris', appris.soufflé);
    r.verifie('et la bulle porte la touche', /C/.test(appris.texte) && /même chose/.test(appris.texte), appris.texte);
    r.egal('deux clics sans clavier : le raccourci passe « à essayer »',
        await page.evaluate(() => {
            Object.keys(window.memoireRaccourcis).forEach(k => delete window.memoireRaccourcis[k]);
            noterUsage('C', 'souris'); noterUsage('C', 'souris');
            return etatDuRaccourci('C');
        }), 'a-essayer');
    r.egal('trois usages au clavier : acquis', appris.acquis, 'acquis');
    r.verifie('une fois acquis, on ne souffle plus', appris.encore === false);
    r.verifie('et l\'interrupteur coupe les bulles', appris.coupe === false);

    // Le raccourci clique le bouton lui-même : cela ne doit pas compter
    // comme un clic de souris, sinon on se soufflerait la touche à soi-même.
    const auClavier = await page.evaluate(() => {
        Object.keys(window.memoireRaccourcis).forEach(k => delete window.memoireRaccourcis[k]);
        setMode('pointer');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
        return { ...ficheRaccourci('C'), mode };
    });
    r.egal('la touche C choisit bien le crayon', auClavier.mode, 'freehand');
    r.egal('elle est comptée au clavier', auClavier.clavier, 1);
    r.egal('et pas à la souris, bien qu\'elle clique le bouton', auClavier.souris, 0);

    // La jauge dit où l'on en est
    const jauge = await page.evaluate(() => {
        Object.keys(window.memoireRaccourcis).forEach(k => delete window.memoireRaccourcis[k]);
        ['C', 'T', 'S'].forEach(t => { noterUsage(t, 'clavier'); noterUsage(t, 'clavier'); noterUsage(t, 'clavier'); });
        remplirAideRaccourcis();
        return {
            texte: document.getElementById('aide-progres-texte').textContent,
            largeur: document.querySelector('#aide-progres .aide-jauge > i').style.width,
            marques: document.querySelectorAll('#aide-pages .aide-rac.acquis').length
        };
    });
    r.verifie('la jauge annonce les raccourcis acquis', /^3 raccourcis sur \d+/.test(jauge.texte), jauge.texte);
    r.verifie('et se remplit', parseFloat(jauge.largeur) > 0, jauge.largeur);
    r.egal('les trois sont marqués « acquis » dans la liste', jauge.marques, 3);

    r.egal('quatre combinaisons documentées', aideCombines.n, 4);
    r.verifie('et l\'aide les affiche toutes',
        /Ctrl\+Maj\+1/.test(aideCombines.t) && /Ctrl\+Maj\+F/.test(aideCombines.t)
        && /Ctrl\+K/.test(aideCombines.t) && /Ctrl\+Maj\+L/.test(aideCombines.t), aideCombines.t);

    await page.evaluate(() => {
        document.body.classList.remove('focus-mode');
        images.length = 0; texts.length = 0; selectedItems = [];
        modeDocument = 'cadre'; setMode('pointer'); draw();
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
