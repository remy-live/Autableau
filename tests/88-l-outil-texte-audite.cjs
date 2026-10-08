// L'OUTIL TEXTE, AUDITÉ
//
// « Je te montre quand on édite ou pas. Je pense qu'il faut lancer un audit sur
// l'outil texte, vraiment avec gestion des styles, couleurs, réaction des
// toolbar. »
//
// L'audit a trouvé quatre choses, toutes mesurées :
//
//   1. DIX RÉGLAGES SUR TREIZE S'ÉVANOUISSAIENT quand on lâchait le bloc.
//      En écrivant : ¶, gras, italique, souligné, listes, alignement,
//      symboles, taille/police/interligne, couleur. Sur le bloc posé :
//      couleur, taille, plan. Pour mettre un mot en gras dans une leçon de la
//      veille, il fallait deviner le double-clic — rien ne le disait.
//   2. LA BARRE DU TEXTE, MONTRÉE DE FORCE sur un bloc tenu, NE FAISAIT RIEN :
//      gras, alignement, police, taille, titre, puces, tous mesurés sans
//      effet. Ses boutons passent par « execCommand », qui exige un curseur.
//   3. DEUX BLOCS DE TEXTE TENUS faisaient basculer la barre en contexte
//      « ligne » : pointillé et deux pointes de flèche offerts sur du texte —
//      des réglages qu'un texte ne dessine jamais —, et la taille du texte
//      disparaissait.
//   4. UN BLOC VERROUILLÉ offrait couleur, taille et opacité, et aucune des
//      trois n'agissait : on voit le nombre changer et le texte ne pas suivre.
//
// CE CHAPITRE NE REGARDE PAS LES BOUTONS, IL LES PRESSE. Un inventaire dirait
// « la commande est là » ; ce qu'il faut savoir, c'est si elle AGIT. Chaque
// vérification clique un vrai bouton et relit l'objet.
//
// IL COUVRE AUSSI LES RÉGLETTES REPLIÉES, venues de la même conversation :
// « pour les sliders de l'opacité ou de la taille des polices on pourrait les
// voir que quand on clique sur opacité ou taille, et idem pour taille de
// police, interligne : j'aimerais bien des sliders avec à côté la valeur qu'on
// peut éditer ». Ce qui s'y mesure n'est pas qu'elles se replient — c'est que
// le bouton qui les remplace PORTE LA VALEUR. Sans cela on retomberait sur ce
// que ce dépôt condamne deux fois : « un réglage qu'il faut aller chercher
// derrière un bouton n'existe pas. »
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Un bloc de deux lignes, rouge, comme celui des captures.
const CONTENU = 'jhkhjkh<div>hjkhjk dsd</div>';

module.exports = async function (browser) {
    const r = creerRapport("L'outil texte, audité");
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1500, height: 940 } });
    await tableauVierge(page);
    await page.evaluate(() => {
        if (typeof basculerLAncrageDuTexte === 'function') basculerLAncrageDuTexte(true);
    });

    // Pose un bloc et le tient. Rend l'état de la barre.
    const tenirUnBloc = (contenu, extra) => page.evaluate(([c, x]) => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        texts.push(Object.assign({
            id: 'T', type: 'text', x: 200, y: 250, fontSize: 32, lineHeight: 38,
            content: c, color: '#e74c3c', strokeColor: '#e74c3c',
            fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1
        }, x || {}));
        setMode('pointer'); selectedItems = [{ type: 'text', id: 'T' }];
        updateStyleBarContext(); draw();
        return document.getElementById('bar-style').className;
    }, [contenu, extra]);

    // Presse un bouton de la barre et relit l'objet. « tiroir » ouvre d'abord
    // le volet qui le contient : un bouton replié ne se clique pas, et le
    // laisser passer ferait croire à une commande sans effet.
    const presser = (selecteur, lecture, tiroir) => page.evaluate(([s, l, p]) => {
        const t = texts[0];
        if (p) {
            const onglet = document.querySelector(`#text-toolbar .tt-tab[data-panel="${p}"]`);
            if (!onglet) return { ongletAbsent: p };
            if (onglet.offsetParent === null) return { ongletCache: p };
            // L'onglet est une BASCULE : rouvrir un volet déjà ouvert le
            // referme, et le bouton visé redeviendrait inatteignable.
            const volet = document.querySelector(`#text-toolbar .tt-panel[data-panel="${p}"]`);
            if (!volet || !volet.classList.contains('tt-open')) onglet.click();
        }
        const b = document.querySelector(s);
        if (!b) return { absent: true };
        if (b.offsetParent === null) return { cache: true };
        const avant = String(eval(l));
        b.click();
        const apres = String(eval(l));
        return { avant, apres, bouge: avant !== apres };
    }, [selecteur, lecture, tiroir || null]);

    // ------------------------------------------------------------------
    // 1. UN BLOC POSÉ GARDE SES RÉGLAGES
    // ------------------------------------------------------------------
    await tenirUnBloc(CONTENU);
    const presents = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return {
            barreDuTexte: vu('#text-toolbar'),
            paragraphe: vu('#text-toolbar .tt-tab[data-panel="para"]'),
            gras: vu('#text-toolbar [data-command="bold"]'),
            italique: vu('#text-toolbar [data-command="italic"]'),
            souligne: vu('#text-toolbar [data-command="underline"]'),
            listes: vu('#text-toolbar .tt-tab[data-panel="list"]'),
            alignement: vu('#text-toolbar .tt-tab[data-panel="align"]'),
            policeEtInterligne: vu('#text-toolbar .tt-tab[data-panel="size"]'),
            couleur: vu('#btn-color-popover'),
            // La taille est REPLIÉE derrière son bouton : c'est lui le
            // contrôle visible, et il porte la valeur en clair.
            taille: vu('#btn-taille')
        };
    });
    r.verifie('UN BLOC POSÉ GARDE LA BARRE DU TEXTE', presents.barreDuTexte, JSON.stringify(presents));
    r.verifie('avec le niveau, le gras, l\'italique et le souligné',
        presents.paragraphe && presents.gras && presents.italique && presents.souligne,
        JSON.stringify(presents));
    r.verifie('les listes, l\'alignement, la police et l\'interligne',
        presents.listes && presents.alignement && presents.policeEtInterligne,
        JSON.stringify(presents));
    r.verifie('et la couleur et la taille, qui ne l\'avaient jamais quitté',
        presents.couleur && presents.taille, JSON.stringify(presents));

    // ------------------------------------------------------------------
    // 2. ET CHAQUE COMMANDE AGIT VRAIMENT
    // ------------------------------------------------------------------
    await tenirUnBloc(CONTENU);
    const gras = await presser('#text-toolbar [data-command="bold"]', 't.content');
    r.verifie('LE GRAS HABILLE LE BLOC ENTIER, lignes comprises',
        gras.bouge && /<b>jhkhjkh<\/b>/.test(gras.apres) && /<b>hjkhjk dsd<\/b>/.test(gras.apres),
        JSON.stringify(gras));
    // Et c'est une BASCULE : le même bouton rend le bloc maigre.
    const degras = await presser('#text-toolbar [data-command="bold"]', 't.content');
    r.egal('et le même bouton le rend maigre', degras.apres, CONTENU, JSON.stringify(degras));

    await tenirUnBloc(CONTENU);
    const italique = await presser('#text-toolbar [data-command="italic"]', 't.content');
    r.verifie('l\'italique aussi', italique.bouge && /<i>/.test(italique.apres),
        JSON.stringify(italique));

    await tenirUnBloc(CONTENU);
    const aligne = await presser('#text-toolbar [data-align="center"]', 't.align', 'align');
    r.egal('L\'ALIGNEMENT AGIT SUR L\'OBJET', aligne.apres, 'center', JSON.stringify(aligne));

    await tenirUnBloc(CONTENU);
    const police = await presser('#text-toolbar .tt-police[data-police="serif"]', 't.fontFamily', 'size');
    r.egal('LA POLICE AGIT', police.apres, 'serif', JSON.stringify(police));

    await tenirUnBloc(CONTENU);
    // L'interligne est une RÉGLETTE depuis que les « − » et « + » sont partis :
    // on la pousse comme un doigt la pousserait.
    const interligne = await page.evaluate(() => {
        const onglet = document.querySelector('#text-toolbar .tt-tab[data-panel="size"]');
        const volet = document.querySelector('#text-toolbar .tt-panel[data-panel="size"]');
        if (onglet && volet && !volet.classList.contains('tt-open')) onglet.click();
        const r2 = document.getElementById('tt-interligne');
        if (!r2) return { absent: true };
        if (r2.offsetParent === null) return { cache: true };
        const avant = texts[0].lineHeight;
        r2.value = 72;
        r2.dispatchEvent(new Event('input', { bubbles: true }));
        return { avant, apres: texts[0].lineHeight, bouge: texts[0].lineHeight !== avant,
                 nombre: document.getElementById('text-lh-display').value };
    });
    r.egal('L\'INTERLIGNE AGIT, et son nombre dit la même chose',
        { interligne: interligne.apres, nombre: interligne.nombre }, { interligne: 72, nombre: '72' },
        JSON.stringify(interligne));

    await tenirUnBloc(CONTENU);
    const titre = await presser('#text-toolbar [data-block="h1"]', 't.content', 'para');
    r.verifie('LE NIVEAU DE PARAGRAPHE AGIT, ligne par ligne',
        titre.bouge && (titre.apres.match(/<h1>/g) || []).length === 2, JSON.stringify(titre));
    // Et « Corps » ramène le bloc d'où il vient : sans cela on ne pourrait pas
    // défaire un titre posé par erreur.
    const corps = await presser('#text-toolbar [data-block="p"]', 't.content', 'para');
    r.verifie('et « Corps » le ramène', !/<h1>/.test(corps.apres), JSON.stringify(corps));

    await tenirUnBloc(CONTENU);
    const puces = await presser('#text-toolbar [data-list="insertUnorderedList"]', 't.content', 'list');
    r.verifie('LES PUCES AGISSENT, une ligne par puce',
        puces.bouge && (puces.apres.match(/<li>/g) || []).length === 2, JSON.stringify(puces));
    const sansPuces = await presser('#text-toolbar [data-list="insertUnorderedList"]', 't.content', 'list');
    r.verifie('et le même bouton les retire', !/<li>/.test(sansPuces.apres), JSON.stringify(sansPuces));

    // La taille : c'est la réglette de la barre de style qui la porte sur un
    // bloc posé, et la rangée du tiroir s'efface — un réglage, un endroit.
    await tenirUnBloc(CONTENU);
    const taille = await page.evaluate(() => {
        const t = texts[0], avant = t.fontSize;
        reglerTailleTexte(58, 'essai');
        // On OUVRE le tiroir avant de regarder : replié, tout y est caché, et
        // la vérification dirait « un seul endroit » quoi qu'il arrive.
        const onglet = document.querySelector('#text-toolbar .tt-tab[data-panel="size"]');
        const volet = document.querySelector('#text-toolbar .tt-panel[data-panel="size"]');
        if (onglet && volet && !volet.classList.contains('tt-open')) onglet.click();
        const rangee = document.querySelector('#text-toolbar .tt-row-taille');
        return { avant, apres: t.fontSize,
                 tiroirOuvert: !!volet && volet.classList.contains('tt-open'),
                 rangeeDuTiroir: !!rangee && rangee.offsetParent !== null };
    });
    r.verifie('le tiroir s\'ouvre bien, donc la mesure suivante porte',
        taille.tiroirOuvert, JSON.stringify(taille));
    r.egal('LA TAILLE AGIT', taille.apres, 58, JSON.stringify(taille));
    r.verifie('et elle ne se règle qu\'à un seul endroit',
        !taille.rangeeDuTiroir, JSON.stringify(taille));

    // ------------------------------------------------------------------
    // 3. CE QUI EXIGE UN CURSEUR S'EFFACE
    // Les symboles s'insèrent À UN ENDROIT, et la pastille du texte colore UNE
    // PORTION. Sans curseur, le premier n'aurait pas où aller, et la seconde
    // ferait double emploi avec la pastille générale, qui sait peindre le bloc
    // entier. Les montrer serait promettre ce qu'on ne tient pas.
    // ------------------------------------------------------------------
    await tenirUnBloc(CONTENU);
    const curseurRequis = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return { symboles: vu('#text-toolbar .tt-tab[data-panel="symb"]'),
                 pastilleDuTexte: vu('#text-toolbar .tt-tab[data-panel="color"]'),
                 pastilleGenerale: vu('#btn-color-popover') };
    });
    r.verifie('les symboles et la pastille du texte s\'effacent sur un bloc posé',
        !curseurRequis.symboles && !curseurRequis.pastilleDuTexte, JSON.stringify(curseurRequis));
    r.verifie('et la pastille générale prend le relais pour la couleur',
        curseurRequis.pastilleGenerale, JSON.stringify(curseurRequis));

    // ET CELA VAUT AUSSI QUAND LA BARRE A ÉTÉ RENDUE AU TEXTE. Elle sort alors
    // de la barre de style : une règle accrochée au meuble ne l'atteindrait
    // plus, et les deux commandes inertes seraient revenues pour la moitié des
    // professeurs — ceux qui préfèrent la barre flottante.
    await page.evaluate(() => {
        if (typeof basculerLAncrageDuTexte === 'function') basculerLAncrageDuTexte(false);
    });
    await tenirUnBloc(CONTENU);
    const rendue = await page.evaluate(() => {
        const tt = document.getElementById('text-toolbar');
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        const r2 = tt.getBoundingClientRect();
        return { horsDuMeuble: tt.parentNode.id !== 'bar-style',
                 montree: getComputedStyle(tt).display !== 'none',
                 dansLEcran: r2.top >= 0 && r2.left >= 0
                     && r2.bottom <= window.innerHeight && r2.right <= window.innerWidth,
                 gras: vu('#text-toolbar [data-command="bold"]'),
                 symboles: vu('#text-toolbar .tt-tab[data-panel="symb"]'),
                 pastilleDuTexte: vu('#text-toolbar .tt-tab[data-panel="color"]') };
    });
    r.verifie('LA BARRE RENDUE AU TEXTE suit le bloc tenu, et reste à l\'écran',
        rendue.horsDuMeuble && rendue.montree && rendue.dansLEcran && rendue.gras,
        JSON.stringify(rendue));
    r.verifie('et elle y perd les mêmes deux commandes',
        !rendue.symboles && !rendue.pastilleDuTexte, JSON.stringify(rendue));
    await page.evaluate(() => {
        if (typeof basculerLAncrageDuTexte === 'function') basculerLAncrageDuTexte(true);
    });

    // ------------------------------------------------------------------
    // 4. DEUX BLOCS DE TEXTE RESTENT DU TEXTE
    // ------------------------------------------------------------------
    const deux = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = [];
        for (const id of ['D1', 'D2']) {
            texts.push({ id, type: 'text', x: 200, y: id === 'D1' ? 250 : 450, fontSize: 32,
                lineHeight: 38, content: 'une ligne', color: '#e74c3c', strokeColor: '#e74c3c',
                fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        }
        setMode('pointer');
        selectedItems = texts.map(t => ({ type: 'text', id: t.id }));
        updateStyleBarContext(); draw();
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return {
            contexte: document.getElementById('bar-style').className,
            pointilles: vu('#btn-dash'),
            flecheDebut: vu('#btn-arrow-start'), flecheFin: vu('#btn-arrow-end'),
            taille: vu('#btn-taille'), gras: vu('#text-toolbar [data-command="bold"]')
        };
    });
    r.verifie('DEUX BLOCS TENUS : la barre reste celle du TEXTE',
        /ctx-text/.test(deux.contexte) && !/ctx-line/.test(deux.contexte), JSON.stringify(deux));
    r.verifie('plus de pointillé ni de pointe de flèche sur du texte',
        !deux.pointilles && !deux.flecheDebut && !deux.flecheFin, JSON.stringify(deux));
    r.verifie('et la taille du texte ne disparaît plus',
        deux.taille && deux.gras, JSON.stringify(deux));
    // Et le gras s'applique AUX DEUX : c'est l'intérêt de les tenir ensemble.
    const lesDeuxEnGras = await page.evaluate(() => {
        document.querySelector('#text-toolbar [data-command="bold"]').click();
        return texts.map(t => t.content);
    });
    r.verifie('le gras habille LES DEUX blocs d\'un coup',
        lesDeuxEnGras.every(c => /<b>/.test(c)), JSON.stringify(lesDeuxEnGras));

    // ------------------------------------------------------------------
    // 5. UN BLOC VERROUILLÉ NE PROMET PLUS RIEN
    // ------------------------------------------------------------------
    await tenirUnBloc(CONTENU, { locked: true });
    const verrou = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        const offert = { couleur: vu('#btn-color-popover'), taille: vu('#btn-taille'),
                         opacite: vu('#btn-opacite'), barreDuTexte: vu('#text-toolbar') };
        const avant = { couleur: texts[0].color, taille: texts[0].fontSize };
        choisirLaCouleur('#2ecc71');
        reglerTailleTexte(60, 'essai');
        return { offert, avant, apres: { couleur: texts[0].color, taille: texts[0].fontSize } };
    });
    r.verifie('un verrou tient : ni la couleur ni la taille n\'entament le bloc',
        verrou.apres.couleur === verrou.avant.couleur && verrou.apres.taille === verrou.avant.taille,
        JSON.stringify(verrou));
    r.verifie('ET LA BARRE NE LES OFFRE PLUS : elle ne promet pas ce qu\'elle ne tiendra pas',
        !verrou.offert.couleur && !verrou.offert.taille && !verrou.offert.opacite
        && !verrou.offert.barreDuTexte, JSON.stringify(verrou));

    // ------------------------------------------------------------------
    // 6. EN ÉCRIVANT, RIEN DE TOUT CELA NE CHANGE
    // La seconde voie ne doit pas prendre la place de la première : une boîte
    // ouverte commande, et c'est la portion surlignée qui reçoit le style.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('text');
    });
    await page.mouse.click(700, 600);
    await page.waitForTimeout(200);
    await page.keyboard.type('trois plus deux');
    await page.waitForTimeout(150);
    const enEcrivant = await page.evaluate(() => {
        const w = document.getElementById('wysiwyg-text');
        // On surligne « trois », et on le met en gras par le bouton.
        const n = w.firstChild;
        const rg = document.createRange(); rg.setStart(n, 0); rg.setEnd(n, 5);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
        w.focus();
        document.querySelector('#text-toolbar [data-command="bold"]').click();
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return { html: w.innerHTML, blocsTenus: blocsDeTexteTenus().length,
                 symboles: vu('#text-toolbar .tt-tab[data-panel="symb"]'),
                 pastilleDuTexte: vu('#text-toolbar .tt-tab[data-panel="color"]') };
    });
    r.verifie('EN ÉCRIVANT, le gras ne prend que le mot surligné',
        /trois/.test(enEcrivant.html) && /deux/.test(enEcrivant.html)
        && !/<b>trois plus deux<\/b>/.test(enEcrivant.html)
        && /(<b>|font-weight)/i.test(enEcrivant.html), JSON.stringify(enEcrivant));
    r.egal('la seconde voie se tait tant que la boîte est ouverte',
        enEcrivant.blocsTenus, 0, JSON.stringify(enEcrivant));
    r.verifie('et les symboles et la pastille du texte reviennent, eux',
        enEcrivant.symboles && enEcrivant.pastilleDuTexte, JSON.stringify(enEcrivant));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('pointer');
        updateStyleBarContext(); draw();
    });

    // ------------------------------------------------------------------
    // 7. LES RÉGLETTES REPLIÉES
    //
    // Elles se replient derrière un bouton, et ce bouton porte la valeur : on
    // LIT le réglage sans l'ouvrir, on n'ouvre que pour le changer. C'est
    // toute la différence avec un bouton muet.
    // ------------------------------------------------------------------
    const lu = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        texts.push({ id: nextId++, type: 'text', x: 100, y: 100, fontSize: 31, lineHeight: 37,
            content: 'une lecon', color: '#e74c3c', strokeColor: '#e74c3c',
            fontFamily: 'sans-serif', align: 'left', opacity: 0.45, z: globalZ++ });
        setMode('pointer');
        selectObject({ type: 'text', id: texts[0].id });   // le vrai chemin
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return {
            boutonTaille: vu('#btn-taille'), boutonOpacite: vu('#btn-opacite'),
            regletteTaille: vu('#font-size'), regletteOpacite: vu('#stamp-opacity'),
            valeurTaille: document.getElementById('taille-val').innerText,
            valeurOpacite: document.getElementById('opacite-val').innerText
        };
    });
    r.verifie('REPLIÉES : on voit le bouton, pas la réglette',
        lu.boutonTaille && lu.boutonOpacite && !lu.regletteTaille && !lu.regletteOpacite,
        JSON.stringify(lu));
    r.egal('ET LE BOUTON PORTE LA VALEUR DE CE QU\'ON TIENT',
        { taille: lu.valeurTaille, opacite: lu.valeurOpacite }, { taille: '31', opacite: '45' },
        JSON.stringify(lu));

    const ouvre = await page.evaluate(() => {
        document.getElementById('btn-taille').click();
        const v = document.querySelector('.reglette-volet[data-reglette="taille"]');
        const r2 = v.getBoundingClientRect();
        const dessus = document.elementFromPoint(
            Math.round(r2.left + r2.width / 2), Math.round(r2.top + r2.height / 2));
        return { ouvert: v.classList.contains('ouvert'),
                 regletteVue: document.getElementById('font-size').offsetParent !== null,
                 peint: !!dessus && v.contains(dessus),
                 dedans: r2.top >= 0 && r2.left >= 0
                     && r2.bottom <= window.innerHeight && r2.right <= window.innerWidth };
    });
    r.verifie('un clic l\'ouvre, entière, dans l\'écran ET VRAIMENT PEINTE',
        ouvre.ouvert && ouvre.regletteVue && ouvre.dedans && ouvre.peint, JSON.stringify(ouvre));
    await page.mouse.click(700, 760);
    await page.waitForTimeout(150);
    const referme = await page.evaluate(() =>
        document.querySelectorAll('.reglette-volet.ouvert').length);
    r.egal('et un clic ailleurs la referme', referme, 0);

    // DEBOUT, le volet sort sur le côté — même leçon que les tiroirs.
    const debout = await page.evaluate(() => {
        if (typeof barreStyleDebout !== 'undefined') barreStyleDebout = true;
        if (typeof placerLaBarreStyle === 'function') placerLaBarreStyle();
        document.getElementById('bar-style').classList.add('vertical');
        selectObject({ type: 'text', id: texts[0].id });
        document.getElementById('btn-taille').click();
        const v = document.querySelector('.reglette-volet[data-reglette="taille"]');
        const r2 = v.getBoundingClientRect();
        const b = document.getElementById('btn-taille').getBoundingClientRect();
        const dessus = document.elementFromPoint(
            Math.round(r2.left + r2.width / 2), Math.round(r2.top + r2.height / 2));
        return { boite: [Math.round(r2.left), Math.round(r2.top), Math.round(r2.right), Math.round(r2.bottom)],
                 dedans: r2.top >= 0 && r2.left >= 0
                     && r2.bottom <= window.innerHeight && r2.right <= window.innerWidth,
                 peint: !!dessus && v.contains(dessus),
                 enFace: r2.bottom >= b.top - 2 && r2.top <= b.bottom + 2 };
    });
    r.verifie('BARRE DEBOUT : le volet est peint, dans l\'écran, à la hauteur de son bouton',
        debout.dedans && debout.enFace && debout.peint, JSON.stringify(debout));
    await page.evaluate(() => {
        if (typeof fermerLesReglettes === 'function') fermerLesReglettes();
        if (typeof barreStyleDebout !== 'undefined') barreStyleDebout = false;
        document.getElementById('bar-style').classList.remove('vertical');
        if (typeof placerLaBarreStyle === 'function') placerLaBarreStyle();
    });

    // LA VALEUR S'ÉDITE : c'est ce qui était demandé, et c'est ce qu'aucune
    // réglette seule ne permet — au-delà de sa course, on tape le nombre.
    const edite = await page.evaluate(() => {
        selectObject({ type: 'text', id: texts[0].id });
        const poser = (id, v) => {
            const e = document.getElementById(id);
            e.value = v; e.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const avant = { taille: texts[0].fontSize, opacite: texts[0].opacity };
        poser('font-size-num', 180);          // bien au-delà de la course (120)
        poser('opacite-num', 35);
        return { avant, taille: texts[0].fontSize, opacite: texts[0].opacity,
                 badgeTaille: document.getElementById('taille-val').innerText,
                 badgeOpacite: document.getElementById('opacite-val').innerText };
    });
    r.egal('LE NOMBRE S\'ÉDITE, au-delà même de la course de la réglette',
        edite.taille, 180, JSON.stringify(edite));
    r.verifie('l\'opacité se tape elle aussi, et les deux boutons le disent',
        Math.abs(edite.opacite - 0.35) < 0.01 && edite.badgeTaille === '180'
        && edite.badgeOpacite === '35', JSON.stringify(edite));

    // ET DANS LE TIROIR DU TEXTE : deux réglettes, deux nombres, qui disent la
    // même chose. Les « − » et « + » demandaient un clic par point.
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('text');
    });
    await page.mouse.click(700, 600);
    await page.waitForTimeout(200);
    const tiroir = await page.evaluate(() => {
        document.querySelector('#text-toolbar .tt-tab[data-panel="size"]').click();
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        const present = { regletteTaille: vu('#tt-taille'), nombreTaille: vu('#text-size-display-2'),
                          regletteInterligne: vu('#tt-interligne'), nombreInterligne: vu('#text-lh-display') };
        const poser = (id, v) => {
            const e = document.getElementById(id);
            e.value = v; e.dispatchEvent(new Event('input', { bubbles: true }));
        };
        poser('tt-taille', 48);
        const taille = { style: activeStyle.fontSize,
                         nombre: document.getElementById('text-size-display-2').value };
        poser('tt-interligne', 90);
        return { present, taille, interligne: activeStyle.lineHeight,
                 nombreInterligne: document.getElementById('text-lh-display').value };
    });
    r.verifie('LE TIROIR A SES DEUX RÉGLETTES, chacune avec son nombre',
        Object.values(tiroir.present).every(Boolean), JSON.stringify(tiroir));
    r.egal('la taille se pousse d\'un geste, et le nombre suit',
        { taille: tiroir.taille.style, nombre: tiroir.taille.nombre }, { taille: 48, nombre: '48' },
        JSON.stringify(tiroir));
    r.egal('l\'interligne aussi',
        { interligne: tiroir.interligne, nombre: tiroir.nombreInterligne },
        { interligne: 90, nombre: '90' }, JSON.stringify(tiroir));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('pointer');
        updateStyleBarContext(); draw();
    });

    // ------------------------------------------------------------------
    // 8. DEUX PORTES VISIBLES
    //
    // « Je trouve que l'édition n'est pas des plus pratiques pour ce qui est du
    // texte. » Mesuré : quinze commandes sur un bloc tenu, et PAS UNE ne disait
    // comment entrer dedans. La seule porte était un double-clic que rien
    // n'annonçait ; pour sortir, Échap, sur un tableau qui n'a pas de clavier.
    //
    // Le double-clic reste — « un double-clic pour valider sur ordi, c'est
    // courant », et c'est juste. Ces deux boutons s'ajoutent à côté, comme
    // « Modifier » s'est ajouté aux vignettes de plugins sans leur retirer le
    // double-clic.
    // ------------------------------------------------------------------
    await tenirUnBloc(CONTENU);
    const portes = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return { modifier: vu('#tt-modifier'), termine: vu('#tt-termine') };
    });
    r.egal('UN BLOC TENU OFFRE « MODIFIER », et pas « Terminé »',
        portes, { modifier: true, termine: false });

    const ouvrePorte = await page.evaluate(() => {
        document.getElementById('tt-modifier').click();
        return { saisie: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'block',
                 edite: !!editingTextId };
    });
    await page.waitForTimeout(250);
    const pendant = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return { contenu: document.getElementById('wysiwyg-text').innerText.replace(/\s+/g, ' ').trim(),
                 modifier: vu('#tt-modifier'), termine: vu('#tt-termine') };
    });
    r.verifie('IL OUVRE LE BLOC, avec son texte dedans',
        ouvrePorte.saisie && ouvrePorte.edite && /jhkhjkh/.test(pendant.contenu),
        JSON.stringify({ ouvrePorte, pendant }));
    r.egal('et les deux portes s\'échangent : « Terminé » prend la place',
        { modifier: pendant.modifier, termine: pendant.termine },
        { modifier: false, termine: true });

    await page.keyboard.type(' ajoute');
    await page.waitForTimeout(120);
    const sort = await page.evaluate(() => {
        document.getElementById('tt-termine').click();
        return { saisie: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'block',
                 edite: !!editingTextId, contenu: texts[0].content };
    });
    r.verifie('« TERMINÉ » REFERME ET GARDE CE QU\'ON VIENT D\'ÉCRIRE',
        !sort.saisie && !sort.edite && /ajoute/.test(sort.contenu), JSON.stringify(sort));

    // Plusieurs blocs tenus : « Modifier » n'ouvrirait pas lequel, il s'efface.
    const plusieurs = await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = [];
        for (const id of ['P1', 'P2']) {
            texts.push({ id, type: 'text', x: 200, y: id === 'P1' ? 250 : 450, fontSize: 32,
                lineHeight: 38, content: 'bloc', color: '#2d3436', strokeColor: '#2d3436',
                fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        }
        setMode('pointer');
        selectedItems = texts.map(t => ({ type: 'text', id: t.id }));
        updateStyleBarContext(); draw();
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        return { modifier: vu('#tt-modifier'), gras: vu('#text-toolbar [data-command="bold"]') };
    });
    r.verifie('PLUSIEURS BLOCS TENUS : « Modifier » s\'efface, le reste demeure',
        !plusieurs.modifier && plusieurs.gras, JSON.stringify(plusieurs));

    // Et sur un texte NEUF, « Terminé » le pose : c'est la sortie de celui qui
    // n'a pas de clavier.
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('text');
    });
    await page.mouse.click(600, 500);
    await page.waitForTimeout(220);
    await page.keyboard.type('un texte neuf');
    await page.waitForTimeout(120);
    const neuf = await page.evaluate(() => {
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        const avant = vu('#tt-termine');
        document.getElementById('tt-termine').click();
        return { avant, blocs: texts.length, contenu: texts.length ? texts[0].content : null,
                 saisie: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'block' };
    });
    r.verifie('UN TEXTE NEUF SE POSE PAR « TERMINÉ », sans toucher au clavier',
        neuf.avant && neuf.blocs === 1 && /un texte neuf/.test(neuf.contenu || '') && !neuf.saisie,
        JSON.stringify(neuf));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; selectedItems = []; setMode('pointer');
        updateStyleBarContext(); draw();
    });

    // ======================================================================
    // « J'AI JUSTE QUITTÉ L'ÉDITION ET APRÈS J'AI SÉLECTIONNÉ »
    //
    // Un bloc de cinq lignes perdait sa fin. Deux causes, sans rapport l'une
    // avec l'autre, et toutes deux mesurées ici.
    //
    // LA PREMIÈRE EST UNE PERTE SÈCHE. Le dépôt savait déjà qu'« on ne peut
    // plus modifier tant que la bande est ouverte » — mais il n'avait fermé
    // que la porte du canevas. Le double-clic, le bouton « Modifier » et les
    // vingt commandes de la barre de style passaient par ailleurs, et ce
    // qu'on écrivait alors n'était pas annulé : il n'existait jamais, car
    // « saveState » refuse d'écrire pendant la lecture. « Refaire » ne le
    // rendait pas.
    //
    // LA SECONDE EST UNE ÉTAPE FANTÔME. Un simple clic sur un bloc
    // enregistrait une étape d'historique : la sélection relisait l'épaisseur
    // de l'objet pour la poser sur la barre, et ce mouvement-là repartait
    // aussitôt dans l'autre sens. Le Ctrl+Z suivant défaisait donc le clic,
    // pas la phrase — il semblait ne rien faire.
    //
    // CE QUI SE VÉRIFIE ICI N'EST PAS QU'UN GARDE-FOU EXISTE, c'est qu'on ne
    // perd rien : le texte après le refus, le nombre d'étapes après un clic,
    // et ce que rend un unique Ctrl+Z.
    // ======================================================================

    // Deux étapes au moins, sinon la bande refuse de s'ouvrir.
    const deuxEtapes = () => page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1;
        panX = 0; panY = 0; zoom = 1; setMode('pointer');
        draw(); saveState();
        points.push({ id: 9801, type: 'point', x: 120, y: 120, color: '#2d3436' });
        draw(); saveState();
    });

    await deuxEtapes();
    const lecture = await page.evaluate(() => {
        texts.push({ id: 'LEC', type: 'text', x: 320, y: 320, fontSize: 32, lineHeight: 38,
            content: 'cinq lignes de cours', color: '#2d3436', strokeColor: '#2d3436',
            fontFamily: 'sans-serif', align: 'left', opacity: 1, z: 1 });
        draw(); saveState();
        selectedItems = [{ type: 'text', id: 'LEC' }];
        updateStyleBarContext(); updateQuickMenu(); draw();
        const ouvert = ouvrirLeLecteur(true);
        const vu = (s) => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; };
        const bouton = document.getElementById('tt-modifier');
        const offert = vu('#tt-modifier');
        if (bouton && offert) bouton.click();
        const parLaPorte = rouvrirLeTexte(texts.find(t => t.id === 'LEC'));
        return { ouvert, offert, parLaPorte, edite: !!editingTextId,
            saisie: getComputedStyle(document.getElementById('wysiwyg-text')).display === 'block',
            contenu: (texts.find(t => t.id === 'LEC') || {}).content,
            dit: (document.getElementById('toast-container') || {}).textContent || '' };
    });
    r.verifie('BANDE OUVERTE : « MODIFIER » REFUSE, ET LE DIT',
        lecture.ouvert && lecture.parLaPorte === false && !lecture.edite && !lecture.saisie
        && lecture.contenu === 'cinq lignes de cours' && /fermez la bande/i.test(lecture.dit),
        JSON.stringify(lecture));

    // La barre de style, elle, restait offerte sur le bloc tenu : chacune de
    // ses commandes finit dans « pushStyleToObject ». On en presse une.
    const styleEnLecture = await page.evaluate(() => {
        // La pastille de la vérification précédente est encore là : sans ce
        // nettoyage, le message qu'on va lire serait celui d'avant, et
        // l'assertion ne mesurerait rien.
        const bac = document.getElementById('toast-container');
        if (bac) bac.innerHTML = '';
        const t = texts.find(x => x.id === 'LEC');
        const avant = JSON.stringify(t);
        activeStyle.strokeColor = '#e74c3c'; activeStyle.fontSize = 12;
        pushStyleToObject();
        const apres = JSON.stringify(texts.find(x => x.id === 'LEC'));
        return { intact: avant === apres, taille: t.fontSize, couleur: t.color,
            n: history.length,
            dit: (document.getElementById('toast-container') || {}).textContent || '' };
    });
    r.verifie('BANDE OUVERTE : LA BARRE DE STYLE N\'ÉCRIT PAS SUR LE BLOC',
        styleEnLecture.intact && styleEnLecture.taille === 32
        && /fermez la bande/i.test(styleEnLecture.dit),
        JSON.stringify(styleEnLecture));

    // Et en refermant, on retrouve exactement son bloc.
    const apresBande = await page.evaluate(() => {
        ouvrirLeLecteur(false);
        const t = texts.find(x => x.id === 'LEC');
        return { blocs: texts.length, contenu: t ? t.content : null,
                 taille: t ? t.fontSize : null };
    });
    r.verifie('EN REFERMANT LA BANDE, LE BLOC EST CELUI QU\'ON AVAIT LAISSÉ',
        apresBande.contenu === 'cinq lignes de cours' && apresBande.taille === 32,
        JSON.stringify(apresBande));

    // Une frappe en cours au moment où l'on ouvre la bande : elle se pose
    // AVANT, pendant que « saveState » accepte encore d'écrire.
    await deuxEtapes();
    await page.evaluate(() => { setMode('text'); });
    await page.mouse.click(640, 520);
    await page.waitForTimeout(240);
    await page.keyboard.type('une phrase en cours');
    await page.waitForTimeout(140);
    const frappe = await page.evaluate(() => {
        const avant = { blocs: texts.length, n: history.length };
        const ouvert = ouvrirLeLecteur(true);
        const pendant = { blocs: texts.length, n: history.length };
        ouvrirLeLecteur(false);
        return { avant, ouvert, pendant, blocs: texts.length,
                 contenu: texts.length ? texts[0].content : null };
    });
    r.verifie('UNE FRAPPE EN COURS SE POSE AVANT LA BANDE, ET REVIENT APRÈS',
        frappe.ouvert && frappe.avant.blocs === 0 && frappe.pendant.blocs === 1
        && frappe.pendant.n === frappe.avant.n + 1
        && /une phrase en cours/.test(frappe.contenu || ''),
        JSON.stringify(frappe));

    // L'ÉTAPE FANTÔME. Un clic de sélection n'est pas une modification.
    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1;
        panX = 0; panY = 0; zoom = 1; setMode('text');
        draw(); saveState();
    });
    await page.mouse.click(620, 420);
    await page.waitForTimeout(240);
    await page.keyboard.type('bonjour la classe');
    await page.waitForTimeout(140);
    await page.evaluate(() => { finalizeText(); setMode('pointer'); draw(); });
    await page.waitForTimeout(180);
    const avantClic = await page.evaluate(() => ({ n: history.length, i: historyIndex }));
    const ou = await page.evaluate(() => {
        const t = texts[0];
        return { x: (t._cachedStartX !== undefined ? t._cachedStartX : t.x) + 20, y: t.y + 10 };
    });
    await page.mouse.click(ou.x, ou.y);
    await page.waitForTimeout(240);
    const apresClic = await page.evaluate(() => ({ n: history.length, i: historyIndex,
        sel: selectedItems.length }));
    r.verifie('SÉLECTIONNER UN BLOC N\'ÉCRIT AUCUNE ÉTAPE D\'HISTORIQUE',
        apresClic.sel === 1 && apresClic.n === avantClic.n && apresClic.i === avantClic.i,
        'avant ' + JSON.stringify(avantClic) + ' après ' + JSON.stringify(apresClic));

    // Le bloc est tenu : un seul Ctrl+Z doit défaire la PHRASE, pas le clic.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(260);
    const unSeulZ = await page.evaluate(() => ({ blocs: texts.length,
        contenu: texts.length ? texts[0].content : null, i: historyIndex }));
    r.verifie('UN SEUL CTRL+Z APRÈS « TERMINÉ » DÉFAIT LA PHRASE',
        unSeulZ.blocs === 0, JSON.stringify(unSeulZ));

    // Et le garde-fou d'égalité, mesuré pour lui-même : deux enregistrements
    // qui n'encadrent qu'un DESSIN ne font qu'une étape. C'est ce que les
    // clés de cache (« _cachedW », « __liens ») faisaient échouer : elles
    // naissent au premier dessin, pas à la création de l'objet.
    const garde = await page.evaluate(() => {
        texts.length = 0; selectedItems = []; history.length = 0; historyIndex = -1;
        draw(); saveState();
        // Posé SANS dessiner : l'étape ne porte encore aucune mesure.
        texts.push({ id: 'G', type: 'text', x: 300, y: 300, fontSize: 32, lineHeight: 38,
            content: 'une ligne', color: '#2d3436', fontFamily: 'sans-serif',
            align: 'left', opacity: 1, z: 1 });
        saveState();
        const n1 = history.length;
        // Puis dessiné : les mesures arrivent sur l'objet, et rien d'autre
        // n'a changé.
        draw(); saveState();
        const n2 = history.length;
        const caches = Object.keys(texts[0]).filter(k => k.charAt(0) === '_');
        const dansLHistoire = Object.keys(JSON.parse(history[history.length - 1]).texts[0])
            .filter(k => k.charAt(0) === '_');
        return { n1, n2, caches, dansLHistoire };
    });
    r.verifie('UN DESSIN N\'EST PAS UNE MODIFICATION : LES MESURES NE PASSENT PAS DANS L\'HISTORIQUE',
        garde.n2 === garde.n1 && garde.caches.length > 0 && garde.dansLHistoire.length === 0,
        JSON.stringify(garde));

    // Revenir en arrière peut effacer l'objet qu'on tenait : on ne garde pas
    // une sélection qui ne désigne plus rien.
    const orphelin = await page.evaluate(() => {
        texts.length = 0; selectedItems = []; history.length = 0; historyIndex = -1;
        setMode('pointer'); draw(); saveState();
        texts.push({ id: 'O', type: 'text', x: 400, y: 400, fontSize: 32, lineHeight: 38,
            content: 'bloc tenu', color: '#2d3436', fontFamily: 'sans-serif',
            align: 'left', opacity: 1, z: 1 });
        draw(); saveState();
        selectedItems = [{ type: 'text', id: 'O' }];
        updateStyleBarContext(); updateQuickMenu(); draw();
        const avant = { sel: selectedItems.length, barre: document.getElementById('bar-style').className };
        undo();
        return { avant, blocs: texts.length, sel: selectedItems.length,
            barre: document.getElementById('bar-style').className,
            existe: selectedItems.length ? !!getObjectById(selectedItems[0].type, selectedItems[0].id) : null };
    });
    r.verifie('UN RETOUR EN ARRIÈRE NE LAISSE PAS TENIR UN BLOC DISPARU',
        orphelin.avant.sel === 1 && /ctx-bloc/.test(orphelin.avant.barre)
        && orphelin.blocs === 0 && orphelin.sel === 0 && !/ctx-bloc/.test(orphelin.barre),
        JSON.stringify(orphelin));

    await page.evaluate(() => {
        if (typeof finalizeText === 'function') finalizeText();
        texts.length = 0; points.length = 0; selectedItems = [];
        history.length = 0; historyIndex = -1; setMode('pointer');
        updateStyleBarContext(); draw(); saveState();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
