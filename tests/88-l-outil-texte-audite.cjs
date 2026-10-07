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
            taille: vu('#font-size')
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
    const interligne = await presser('#text-toolbar #btn-lh-up', 't.lineHeight', 'size');
    r.verifie('L\'INTERLIGNE AGIT', interligne.bouge, JSON.stringify(interligne));

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
            taille: vu('#font-size'), gras: vu('#text-toolbar [data-command="bold"]')
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
        const offert = { couleur: vu('#btn-color-popover'), taille: vu('#font-size'),
                         opacite: vu('#stamp-opacity'), barreDuTexte: vu('#text-toolbar') };
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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
