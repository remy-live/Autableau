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
        return { ouvert: v.classList.contains('ouvert'),
                 regletteVue: document.getElementById('font-size').offsetParent !== null,
                 dedans: r2.top >= 0 && r2.left >= 0
                     && r2.bottom <= window.innerHeight && r2.right <= window.innerWidth };
    });
    r.verifie('un clic l\'ouvre, entière et dans l\'écran',
        ouvre.ouvert && ouvre.regletteVue && ouvre.dedans, JSON.stringify(ouvre));
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
        return { boite: [Math.round(r2.left), Math.round(r2.top), Math.round(r2.right), Math.round(r2.bottom)],
                 dedans: r2.top >= 0 && r2.left >= 0
                     && r2.bottom <= window.innerHeight && r2.right <= window.innerWidth,
                 enFace: r2.bottom >= b.top - 2 && r2.top <= b.bottom + 2 };
    });
    r.verifie('BARRE DEBOUT : le volet reste dans l\'écran, à la hauteur de son bouton',
        debout.dedans && debout.enFace, JSON.stringify(debout));
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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
