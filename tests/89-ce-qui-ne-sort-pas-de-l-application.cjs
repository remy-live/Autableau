// CE QUI NE SORT PAS DE L'APPLICATION
//
// « Est ce que le code est bricolé pour avoir toutes ces galères sur l'édition
// de texte » — l'audit a répondu non, et il a trouvé en chemin quatre défauts
// dont le premier est plus coûteux que tous ceux de la semaine réunis.
//
//   1. UNE FORMULE AU TABLEAU DÉTRUISAIT L'ENREGISTREMENT, EN SILENCE.
//      L'image d'une formule est un élément du navigateur posé sur l'objet
//      texte. Elle s'appelait « mathImg », sans trait de soulignement, et
//      partait donc avec l'état. Mesuré :
//
//          DataCloneError: HTMLImageElement object could not be cloned
//          sur le disque après l'écriture : RIEN
//          horodatage « enregistré » : MIS À JOUR QUAND MÊME
//
//      Le professeur écrivait une formule, travaillait une heure, fermait
//      l'onglet sur un « Enregistré à l'instant » — et tout avait disparu.
//      Rien ne pouvait le lui dire.
//
//   2. ET AU RETOUR EN ARRIÈRE, LE TABLEAU CESSAIT DE SE PEINDRE.
//      « JSON.stringify » d'une image rend « {} » : l'historique portait un
//      objet VIDE mais VRAI, que le peintre passait à « drawImage ». Le
//      « try » de « draw » se referme sur un « finally » sans « catch » :
//      l'écran restait à moitié peint, et chaque repeinture levait à son tour.
//
//   3. LA TOUCHE TAB DÉCALAIT DANS LA BOÎTE, PAS SUR LE TABLEAU. Elle appelle
//      « indent », qui fabrique un BLOCKQUOTE — une quinzième balise, que le
//      lecteur du canevas ne connaissait pas. Mesuré : deuxième ligne à x=540
//      dans la boîte quand la première est à x=500, et les deux à x=0 sur le
//      tableau. Le retrait était dans les données, invisible au tableau.
//
//   4. LE CHAMP DE TAILLE PROMETTAIT 4 ET RENDAIT 10. Deux fonctions bornaient
//      différemment, derrière des champs qui promettaient tous deux 4 à 400.
//
// CE CHAPITRE NE VÉRIFIE PAS QUE DU CODE EXISTE, IL MESURE CE QUI SORT. Il
// écrit vraiment sur le disque et le relit ; il compare le retrait de la boîte
// à celui du moteur du canevas, en pixels ; il tape un nombre et relit la
// taille obtenue.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// MathJax est livré avec l'application : la formule se dessine sans réseau,
// mais pas instantanément.
const attendreLaFormule = (page) => page.waitForFunction(
    () => !!(texts[0] && typeof aUneImageDeFormule === 'function' && aUneImageDeFormule(texts[0])),
    null, { timeout: 20000 }).then(() => true).catch(() => false);

module.exports = async function (browser) {
    const r = creerRapport("Ce qui ne sort pas de l'application");
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1500, height: 940 } });
    await tableauVierge(page);

    // ==================================================================
    // 1. LE CONTRAT DE SÉRIALISATION
    // ==================================================================

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1; panX = 0; panY = 0; zoom = 1;
        draw(); saveState(); setMode('text');
    });
    await page.mouse.click(500, 400);
    await page.waitForTimeout(240);
    await page.keyboard.type('$x^2+1$');
    await page.waitForTimeout(140);
    await page.evaluate(() => { finalizeText(); setMode('pointer'); });
    const dessinee = await attendreLaFormule(page);
    const formule = await page.evaluate(() => ({
        dessinee: aUneImageDeFormule(texts[0]),
        largeur: texts[0] && texts[0]._mathW,
        uneVraieImage: !!(texts[0] && texts[0]._mathImg instanceof HTMLImageElement),
    }));
    r.verifie('LA FORMULE SE DESSINE : rien de ce qui suit ne mesurerait sans cela',
        dessinee && formule.dessinee && formule.uneVraieImage && formule.largeur > 0,
        JSON.stringify(formule));

    // Le cœur du chapitre : on écrit sur le disque, et on relit ce qui y est.
    const disque = await page.evaluate(async () => {
        let echec = null;
        try { await writeAppLocal(); } catch (e) { echec = (e && e.name) + ': ' + String(e && e.message).slice(0, 90); }
        let d = null, lecture = null;
        try { d = await localforage.getItem(AUTO_SAVE_KEY); } catch (e) { lecture = e.name; }
        const t = d && d.pages && d.pages[0] && d.pages[0].texts && d.pages[0].texts[0];
        return { echec, lecture, surLeDisque: !!t, contenu: t ? t.content : null,
            clesSoulignees: t ? Object.keys(t).filter(k => k.charAt(0) === '_') : null };
    });
    r.verifie('UNE FORMULE AU TABLEAU N\'EMPÊCHE PLUS D\'ENREGISTRER',
        disque.echec === null && disque.surLeDisque === true && /\$/.test(disque.contenu || ''),
        JSON.stringify(disque));
    r.verifie('ET RIEN DE SOULIGNÉ NE PART SUR LE DISQUE',
        Array.isArray(disque.clesSoulignees) && disque.clesSoulignees.length === 0,
        JSON.stringify(disque.clesSoulignees));

    // L'historique non plus — vérifié ici avec une formule, qui est le seul
    // champ qui violait la convention.
    const histoire = await page.evaluate(() => {
        saveState();
        const t = JSON.parse(history[history.length - 1]).texts[0] || {};
        return { cles: Object.keys(t).filter(k => k.charAt(0) === '_'),
                 surLObjet: Object.keys(texts[0]).filter(k => k.charAt(0) === '_') };
    });
    r.verifie('NI DANS L\'HISTORIQUE, alors que l\'objet vivant les porte bien',
        histoire.cles.length === 0 && histoire.surLObjet.length > 0,
        JSON.stringify(histoire));

    // Et le retour en arrière, qui plantait le peintre.
    const retour = await page.evaluate(() => {
        points.push({ id: 9501, type: 'point', x: 150, y: 150, color: '#000' });
        draw(); saveState();
        let plante = null;
        try { undo(); } catch (e) { plante = (e && e.name) + ': ' + String(e && e.message).slice(0, 90); }
        let planteAuDessin = null;
        try { draw(); } catch (e) { planteAuDessin = (e && e.name) + ': ' + String(e && e.message).slice(0, 90); }
        return { plante, planteAuDessin, pts: points.length, blocs: texts.length };
    });
    r.verifie('UN RETOUR EN ARRIÈRE AVEC UNE FORMULE NE CASSE PLUS LE DESSIN',
        retour.plante === null && retour.planteAuDessin === null
        && retour.pts === 0 && retour.blocs === 1,
        JSON.stringify(retour));

    // Puisque l'image ne voyage plus avec l'état, elle doit SE REFAIRE : sans
    // cela on aurait troqué un plantage contre « la formule redevient du
    // texte brut au premier Ctrl+Z ».
    const revenue = await attendreLaFormule(page);
    const apresRetour = await page.evaluate(() => ({
        dessinee: aUneImageDeFormule(texts[0]),
        largeur: texts[0] && texts[0]._mathW,
        contenu: texts[0] && texts[0].content,
    }));
    r.verifie('ET LA FORMULE SE REFAIT D\'ELLE-MÊME, elle ne redevient pas du texte brut',
        revenue && apresRetour.dessinee && apresRetour.largeur > 0,
        JSON.stringify(apresRetour));

    // ET REDEMANDER L'IMAGE NE VEUT PAS DIRE LA RECOMPOSER.
    //
    // C'est le coût caché du contrat : puisque l'image ne sort plus avec
    // l'état, il faut la redemander à chaque changement d'état — et « rejouer
    // la séance » applique un état par pas. Sans mémoire, une leçon de deux
    // cents étapes avec cinq formules relancerait MathJax mille fois.
    const recompositions = await page.evaluate(async () => {
        const vraie = MathJax.tex2svgPromise;
        let appels = 0;
        MathJax.tex2svgPromise = function () { appels++; return vraie.apply(this, arguments); };
        try {
            const etat = history[historyIndex];
            for (let i = 0; i < 6; i++) {
                appliquerEtatDuTableau(etat, false);
                await new Promise(r => setTimeout(r, 40));
            }
            return { appels, dessinee: aUneImageDeFormule(texts[0]) };
        } finally { MathJax.tex2svgPromise = vraie; }
    });
    r.verifie('SIX RETOURS D\'ÉTAT NE RECOMPOSENT PAS SIX FOIS LA MÊME FORMULE',
        recompositions.appels === 0 && recompositions.dessinee === true,
        JSON.stringify(recompositions));

    // LE FICHIER EXPORTÉ EST LA QUATRIÈME SORTIE, et c'était la dernière où la
    // règle manquait.
    //
    // ON APPELLE LA VRAIE FONCTION D'EXPORT, pas une charge utile remontée
    // ici : ma première version de cette vérification reconstruisait l'objet
    // elle-même, et sabotée, elle ne tombait pas — elle mesurait l'outil, pas
    // l'application. On intercepte donc la boîte de dialogue qui demande le
    // nom du fichier, et l'on regarde ce qu'elle a reçu.
    //
    // Les DEUX branches de la fonction se mesurent : avec un nom de tableau,
    // elle monte la page courante seule ; sans nom, elle parcourt toutes les
    // pages. Chacune écrivait sa propre charge utile.
    const fichier = await page.evaluate(() => {
        // Deux points d'interception, chacun le premier à voir la charge utile
        // de son chemin : « promptExportName » pour l'un, « hasMedias » pour
        // l'autre — qui le reçoit avant d'ouvrir la moindre fenêtre. On
        // intercepte au plus près de la construction, jamais après un
        // dialogue : ce qui nous intéresse est l'objet, pas le fichier.
        const vraiNommage = window.promptExportName, vraiMedias = window.hasMedias;
        const vraieFenetre = window.showExportNameModal;
        let attrape = null;
        window.promptExportName = (m, board) => { attrape = attrape || board; };
        window.hasMedias = (data) => { attrape = attrape || { data }; return false; };
        // On n'ouvre AUCUNE fenêtre : la charge utile est déjà attrapée, et une
        // modale restée ouverte empêcherait l'outil texte de s'ouvrir dans la
        // vérification suivante. (C'est ce qui s'est passé à mon premier essai :
        // le chapitre entier plantait trois vérifications plus loin.)
        window.showExportNameModal = () => {};
        const lire = () => {
            const relu = JSON.parse(JSON.stringify(attrape.data));
            const t = (relu.pages[0].texts || [])[0] || {};
            return { cles: Object.keys(t).filter(k => k.charAt(0) === '_'), contenu: t.content };
        };
        const nomDAvant = currentBoardName, idDAvant = selectedBoardId;
        selectedBoardId = null;
        try {
            // « exportCurrentBoard » : la page courante seule.
            currentBoardName = 'tableau de controle';
            attrape = null; exportCurrentBoard(true, null);
            const uneSeulePage = attrape ? lire() : { cles: ['appel manqué'], contenu: null };
            // « promptExportCurrentBoard » : toutes les pages, et c'est une
            // SECONDE charge utile, écrite ailleurs dans le fichier.
            attrape = null;
            // La fenêtre de nommage s'ouvre après : on a déjà ce qu'il faut,
            // et ce qui s'y passe ne nous regarde pas.
            try { if (typeof promptExportCurrentBoard === 'function') promptExportCurrentBoard(); }
            catch (e) { /* la charge utile est attrapée bien avant */ }
            const toutesLesPages = attrape ? lire() : { cles: ['appel manqué'], contenu: null };
            return { uneSeulePage, toutesLesPages, surLObjetVivant: aUneImageDeFormule(texts[0]) };
        } finally {
            window.promptExportName = vraiNommage;
            window.hasMedias = vraiMedias;
            window.showExportNameModal = vraieFenetre;
            currentBoardName = nomDAvant; selectedBoardId = idDAvant;
        }
    });
    r.verifie('LE FICHIER EXPORTÉ NE PORTE AUCUNE CLÉ SOULIGNÉE, par ses deux chemins',
        fichier.uneSeulePage.cles.length === 0 && /\$/.test(fichier.uneSeulePage.contenu || '')
        && fichier.toutesLesPages.cles.length === 0 && /\$/.test(fichier.toutesLesPages.contenu || '')
        && fichier.surLObjetVivant === true,
        JSON.stringify(fichier));

    // ET LE GARDE-FOU DU PEINTRE, MESURÉ POUR LUI-MÊME.
    //
    // Les quatre filtres ci-dessus ferment la porte ; celui-ci est la ceinture
    // qui va avec les bretelles, et il garde l'endroit où la chute est la plus
    // chère : « draw » n'a pas de « catch », donc un objet non dessinable passé
    // à « drawImage » n'abîme pas une formule, il arrête TOUT le tableau.
    //
    // La charge utile montée ici est celle qu'un fichier .autableau ou un lien
    // de partage portait AVANT que la quatrième sortie soit filtrée : un champ
    // d'image devenu « {} » par le passage en JSON. C'est aussi ce que
    // porterait demain une cinquième sortie qu'on ajouterait sans la règle.
    // On ne prétend pas que l'application le produise encore : on vérifie
    // qu'un tableau ainsi reçu SE PEINT au lieu de s'éteindre.
    const recuAbime = await page.evaluate(() => {
        const t = texts[0];
        const vraie = t._mathImg;
        t._mathImg = {}; t._mathW = 70; t._mathH = 30;   // ce que rend JSON d'une image
        let plante = null;
        try { draw(); } catch (e) { plante = (e && e.name) + ': ' + String(e && e.message).slice(0, 90); }
        const compte = aUneImageDeFormule(t);
        t._mathImg = vraie;
        return { plante, compte };
    });
    r.verifie('UN TABLEAU REÇU AVEC UNE IMAGE ABÎMÉE SE PEINT, il ne s\'éteint pas',
        recuAbime.plante === null && recuAbime.compte === false,
        JSON.stringify(recuAbime));

    // ==================================================================
    // 2. LA TOUCHE TAB : LE MÊME RETRAIT DES DEUX CÔTÉS
    // ==================================================================

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1; panX = 0; panY = 0; zoom = 1;
        draw(); saveState(); setMode('text');
    });
    await page.mouse.click(500, 400);
    await page.waitForTimeout(240);
    await page.keyboard.type('ligne normale');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('ligne decalee');
    await page.waitForTimeout(160);
    const dansLaBoite = await page.evaluate(() => {
        const gauche = [];
        wysiwygText.querySelectorAll('div, blockquote').forEach(e => {
            const b = e.getBoundingClientRect();
            if (b.width) gauche.push({ balise: e.tagName, x: Math.round(b.left) });
        });
        const cq = wysiwygText.querySelector('blockquote');
        return { gauche, bord: Math.round(wysiwygText.getBoundingClientRect().left),
                 margeEnLigne: cq ? cq.style.marginLeft : 'pas de blockquote',
                 filet: cq ? cq.style.borderStyle || cq.style.border : null };
    });
    const premier = dansLaBoite.gauche[0] ? dansLaBoite.gauche[0].x : 0;
    const decale = dansLaBoite.gauche.find(g => g.balise === 'BLOCKQUOTE');
    const retraitBoite = decale ? decale.x - premier : 0;
    r.verifie('TAB DÉCALE DANS LA BOÎTE, et sa marge est écrite dans l\'unité du texte',
        retraitBoite > 20 && /em$/.test(dansLaBoite.margeEnLigne || ''),
        'retrait ' + retraitBoite + ' px ' + JSON.stringify(dansLaBoite));

    const surLeCanevas = await page.evaluate(() => {
        finalizeText(); setMode('pointer'); draw();
        const t = texts[0];
        const l = layoutTextObject(t, canvas.getContext('2d'));
        return { contenu: (t.content || '').slice(0, 180),
            lignes: l.lines.map(L => ({ retrait: Math.round(L.indent || 0),
                texte: (L.segs || []).map(s => s.text).join('').slice(0, 24) })) };
    });
    const l1 = surLeCanevas.lignes[0] || {}, l2 = surLeCanevas.lignes[1] || {};
    r.verifie('ET LE TABLEAU LE DESSINE AU MÊME ENDROIT QUE LA BOÎTE, au pixel',
        surLeCanevas.lignes.length === 2 && l1.retrait === 0 && l2.retrait > 20
        && Math.abs(l2.retrait - retraitBoite) <= 2,
        'boîte ' + retraitBoite + ' px, canevas ' + l2.retrait + ' px — ' + JSON.stringify(surLeCanevas));

    // ET LA MÊME MESURE POUR UNE LISTE À PUCES, qui est l'autre porteuse du
    // cran de retrait. C'est elle qui prouve que la constante partagée sert :
    // sans elle, j'aurais remplacé un nombre écrit deux fois par une variable
    // que rien ne mesure — un progrès sur le papier seulement.
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('text');
    });
    await page.mouse.click(520, 560);
    await page.waitForTimeout(240);
    await page.keyboard.type('- premier');
    await page.waitForTimeout(160);
    const liste = await page.evaluate(() => {
        const li = wysiwygText.querySelector('li');
        const bord = Math.round(wysiwygText.getBoundingClientRect().left);
        const dansLaBoite = li ? Math.round(li.getBoundingClientRect().left) - bord : null;
        finalizeText(); setMode('pointer'); draw();
        const t = texts[0];
        const L = t ? layoutTextObject(t, canvas.getContext('2d')).lines[0] : null;
        return { dansLaBoite, puce: L ? L.marker : null,
                 surLeTableau: L ? Math.round(L.indent || 0) : null,
                 contenu: t ? (t.content || '').slice(0, 80) : null };
    });
    r.verifie('UNE PUCE SE RETROUVE AU MÊME CRAN DANS LA BOÎTE ET SUR LE TABLEAU',
        liste.dansLaBoite > 10 && liste.surLeTableau > 10
        && Math.abs(liste.dansLaBoite - liste.surLeTableau) <= 2,
        JSON.stringify(liste));

    // On revient au bloc de Tab pour la mesure suivante.
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('pointer');
        texts.push({ id: 'TAB', type: 'text', x: 400, y: 300, fontSize: 32, lineHeight: 38,
            content: 'avant<div><blockquote style="margin: 0 0 0 1.4em; border: none; padding: 0px;"><div>apres</div></blockquote></div>',
            color: '#2d3436', fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        draw();
    });

    // Le retrait suit la police : c'est à cela que sert l'unité relative.
    // Quarante pixels fixes ne l'auraient pas fait.
    const enGrossissant = await page.evaluate(() => {
        const t = texts[0];
        const petit = layoutTextObject(t, canvas.getContext('2d')).lines[1].indent;
        t.fontSize = (t.fontSize || 24) * 2;
        const grand = layoutTextObject(t, canvas.getContext('2d')).lines[1].indent;
        t.fontSize = t.fontSize / 2;
        return { petit: Math.round(petit), grand: Math.round(grand) };
    });
    r.verifie('LE RETRAIT SUIT LA POLICE : il double quand les lettres doublent',
        enGrossissant.grand > enGrossissant.petit * 1.8,
        JSON.stringify(enGrossissant));

    // LA LEÇON D'HIER, ROUVERTE AUJOURD'HUI. Un bloc écrit avant cette
    // correction porte sa marge en pixels fixes, écrite EN LIGNE : aucune
    // règle de feuille de style ne peut la contredire, et la boîte montrerait
    // 40 px là où le tableau dessine 34. C'est la lacune qu'un sabotage a
    // révélée — la correction du jour ne couvrait que la frappe.
    const hier = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('pointer');
        texts.push({ id: 'HIER', type: 'text', x: 400, y: 300, fontSize: 32, lineHeight: 38,
            // Exactement ce qu'« indent » écrivait, et ce que portent les
            // fichiers déjà enregistrés.
            content: 'avant<div><blockquote style="margin: 0 0 0 40px; border: none; padding: 0px;"><div>apres</div></blockquote></div>',
            color: '#2d3436', fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        draw();
        const ouvert = rouvrirLeTexte(texts[0]);
        const cq = wysiwygText.querySelector('blockquote');
        const bord = Math.round(wysiwygText.getBoundingClientRect().left);
        const vuDansLaBoite = cq ? Math.round(cq.getBoundingClientRect().left) - bord : null;
        const surLeTableau = Math.round(
            layoutTextObject(texts[0], canvas.getContext('2d')).lines[1].indent || 0);
        const marge = cq ? cq.style.marginLeft : null;
        finalizeText();
        return { ouvert, marge, vuDansLaBoite, surLeTableau };
    });
    r.verifie('UN BLOC ÉCRIT HIER SE RECALE EN S\'OUVRANT, il ne garde pas ses pixels fixes',
        hier.ouvert !== false && /em$/.test(hier.marge || '')
        && hier.vuDansLaBoite > 20 && Math.abs(hier.vuDansLaBoite - hier.surLeTableau) <= 2,
        JSON.stringify(hier));

    // ==================================================================
    // 3. LES BORNES DE LA TAILLE DISENT CE QUE LE CHAMP PROMET
    // ==================================================================

    const bornes = await page.evaluate(() => {
        const champ = (id) => { const e = document.getElementById(id); return e ? { min: +e.min, max: +e.max } : null; };
        const promis = champ('font-size-num') || champ('text-size-display-2');
        const obtenu = (px) => { poserLaTailleDuTexte(px); return activeStyle.fontSize; };
        return { promis, huit: obtenu(8), auPlusPetit: obtenu(promis ? promis.min : 4),
                 enDessous: obtenu(1), auPlusGrand: obtenu(promis ? promis.max : 400),
                 auDessus: obtenu(9999) };
    });
    r.verifie('ON TAPE 8, ON OBTIENT 8 — et le champ ne promet plus ce qu\'il ne tient pas',
        bornes.huit === 8 && bornes.auPlusPetit === bornes.promis.min
        && bornes.enDessous === bornes.promis.min
        && bornes.auPlusGrand === bornes.promis.max && bornes.auDessus === bornes.promis.max,
        JSON.stringify(bornes));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1; setMode('pointer');
        activeStyle.fontSize = 24;
        updateStyleBarContext(); draw(); saveState();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
