// Les outils de français, de langues et de technologie.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Français, langues et techno');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ==========================================================
    // ANALYSE GRAMMATICALE
    // ==========================================================
    const gram = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('Le petit chat de la voisine dort sur le canapé.');
        P.creerFenetre();
        const pose = (de, a, nom) => {
            P.debutChoisi = de; P.finChoisie = a;
            const et = P.ETIQUETTES.find(x => x.nom === nom);
            P.etiqueter(et.nom, et.couleur);
        };
        pose(0, 5, 'Sujet');
        pose(3, 5, 'Complément du nom');   // imbriqué dans le sujet
        pose(6, 6, 'Verbe');
        pose(7, 9, 'CC de lieu');
        const rang = (nom) => (P.etager().find(a => a.libelle === nom) || {}).rang;
        return {
            mots: P.mots.map(m => m.texte),
            mesures: P.mots.every(m => m.l > 0),
            rangSujet: rang('Sujet'),
            rangCDN: rang('Complément du nom'),
            rangVerbe: rang('Verbe'),
            rangCC: rang('CC de lieu'),
            analyses: P.analyses.length
        };
    });
    r.egal('la phrase est découpée en mots, ponctuation collée au dernier',
        gram.mots, ['Le', 'petit', 'chat', 'de', 'la', 'voisine', 'dort', 'sur', 'le', 'canapé.']);
    r.verifie('chaque mot est mesuré dans la scène', gram.mesures);
    r.egal('quatre analyses posées', gram.analyses, 4);
    r.egal('le sujet occupe le premier étage', gram.rangSujet, 0);
    r.egal('le verbe et le CC aussi : ils ne se chevauchent pas',
        [gram.rangVerbe, gram.rangCC], [0, 0]);
    r.egal('le complément du nom, niché dans le sujet, descend d\'un cran',
        gram.rangCDN, 1);

    // Les abscisses du tampon sont celles des mots à l'écran : sans quoi les
    // crochets se posent à côté du groupe qu'ils désignent.
    const alignement = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.mesurerLesMots();
        const svg = P.tracerSVG({ pourExport: true });
        const xs = [...svg.matchAll(/<tspan x="([\d.]+)"/g)].map(m => Number(m[1]));
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const crochets = [...doc.querySelectorAll('path')].map(p => {
            const d = p.getAttribute('d').match(/[\d.]+/g).map(Number);
            return { x1: d[0], x2: d[4] };
        });
        const sujet = crochets.find(c => Math.abs(c.x1 - P.mots[0].x) < 1);
        return {
            xs, motsX: P.mots.map(m => Math.round(m.x)),
            // Le crochet du sujet va du premier mot à la fin du sixième
            sujetJuste: !!sujet && Math.abs(sujet.x2 - (P.mots[5].x + P.mots[5].l)) < 1,
            mots: P.mots.length, tspans: xs.length,
            texteEnDur: /Le<\/tspan>/.test(svg),
            // L'espace entre deux mots doit rester HORS de leur boîte : s'il
            // est dedans, l'abscisse relevée est celle de l'espace et les
            // mots se collent deux à deux dans le tampon exporté.
            ecarts: P.mots.slice(1).map((m, i) => Math.round(m.x - (P.mots[i].x + P.mots[i].l)))
        };
    });
    r.egal('le tampon porte un tspan par mot', alignement.tspans, alignement.mots);
    r.egal('placés aux abscisses relevées à l\'écran',
        alignement.xs.map(Math.round), alignement.motsX);
    r.verifie('le crochet du sujet couvre exactement ses six mots', alignement.sujetJuste);
    r.verifie('et la phrase est écrite dans le tampon', alignement.texteEnDur);
    r.verifie('l\'espace entre deux mots reste hors de leur boîte mesurée',
        alignement.ecarts.every(e => e >= 4), JSON.stringify(alignement.ecarts));

    // ==========================================================
    // LES GESTES, AVEC UNE VRAIE SOURIS
    //
    // « Le clic simple sur un mot ne fonctionne plus. » C'était vrai, et ce
    // test-ci passait pourtant au vert : il appelait « .click() » SUR le mot,
    // c'est-à-dire le gestionnaire posé dessus. Or le déplacement des mots pose
    // « setPointerCapture » sur la phrase, et une capture de pointeur REDIRIGE
    // VERS L'ÉLÉMENT CAPTEUR le « click » qui suit : le gestionnaire du mot
    // n'était plus jamais appelé par une vraie main. Le test éprouvait un
    // chemin que personne n'emprunte.
    //
    // On clique donc à la souris, qui vise — et c'est le relâchement qui agit.
    // ==========================================================
    const viser = (i) => page.evaluate((n) => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        const el = P.widgetEl.querySelector(`.ag-mot[data-i="${n}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, i);
    const cliquerLeMot = async (i) => {
        const p = await viser(i);
        if (!p) return false;
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(90);
        return true;
    };
    const lire = () => page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        return { de: P.debutChoisi, a: P.finChoisie,
                 peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length,
                 analyses: P.analyses.length };
    });

    await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = []; P.debutChoisi = P.finChoisie = null; P.pile = [];
        P.peindre();
    });
    const vise = await cliquerLeMot(2);
    r.verifie('les mots de la phrase sont là où on les voit', vise, 'mot 2 introuvable');
    const unSeul = await lire();
    r.egal('un vrai clic désigne un mot', [unSeul.de, unSeul.a], [2, 2]);
    r.egal('et le peint', unSeul.peints, 1);
    await cliquerLeMot(5);
    const etendu = await lire();
    r.egal('le second clic étend le groupe', etendu.peints, 4);

    const apres = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.etiqueter('COD', '#00b894');
        return { sel: P.debutChoisi, n: P.analyses.length,
                 peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length };
    });
    r.egal('étiqueter pose l\'analyse', apres.n, 1);
    r.verifie('et relâche la sélection',
        apres.sel === null && apres.peints === 0, JSON.stringify(apres));

    // ET UN MOT ÉTIQUETÉ REND SON ÉTIQUETTE. « Il faudrait pouvoir aussi
    // enlever : si on a mis Sujet, en cliquant dessus ça peut l'enlever. » Le
    // crochet le faisait déjà — un trait de deux pixels que personne ne devine.
    await cliquerLeMot(3);
    const rendu = await lire();
    r.egal('cliquer un mot étiqueté retire son étiquette', rendu.analyses, 0);
    r.verifie('sans commencer une sélection au passage',
        rendu.de === null && rendu.peints === 0, JSON.stringify(rendu));
    const annulable = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.annuler();
        return P.analyses.length;
    });
    r.egal('et « Annuler » la remet', annulable, 1);

    // LA PLUS SERRÉE D'ABORD : trois groupes peuvent couvrir le même mot, on
    // retire le plus petit — le dernier posé, celui qu'on voit.
    const serree = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = []; P.pile = []; P.debutChoisi = P.finChoisie = null;
        P.debutChoisi = 0; P.finChoisie = 5; P.etiqueter('Sujet', '#0984e3');
        P.debutChoisi = 3; P.finChoisie = 5; P.etiqueter('Complément du nom', '#e17055');
        return { avant: P.analyses.map(a => a.libelle), vise: P.etiquetteLaPlusSerree(4) };
    });
    await cliquerLeMot(4);
    const reste = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        return P.analyses.map(a => a.libelle);
    });
    r.egal('sous deux étiquettes, c\'est la plus serrée qui part',
        reste, ['Sujet']);

    // ET LE CROCHET RESTE CLIQUABLE : deux chemins pour retirer, c'est bien —
    // celui qu'on devine et celui qu'on trouve.
    const parLeCrochet = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.widgetEl.querySelector('.ag-trait').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return P.analyses.length;
    });
    r.egal('un clic sur le crochet le retire aussi', parLeCrochet, 0);

    // RECLIQUER LE MÊME MOT ANNULE LA SÉLECTION — on se ravise devant la classe.
    await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = []; P.pile = []; P.debutChoisi = P.finChoisie = null; P.peindre();
    });
    await cliquerLeMot(1);
    await cliquerLeMot(1);
    const ravise = await lire();
    r.verifie('recliquer le même mot annule la sélection',
        ravise.de === null, JSON.stringify(ravise));

    // Deux fois la même fonction sur les mêmes mots : on change d'avis
    const doublon = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = [];
        P.debutChoisi = 0; P.finChoisie = 2; P.etiqueter('Sujet', '#0984e3');
        P.debutChoisi = 0; P.finChoisie = 2; P.etiqueter('COD', '#00b894');
        return P.analyses.map(a => a.libelle);
    });
    r.egal('réétiqueter le même groupe remplace, sans empiler', doublon, ['COD']);

    // Le tampon posé se rouvre pour être corrigé
    const reedition = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('Marie lit un roman.');
        P.debutChoisi = 0; P.finChoisie = 0; P.etiqueter('Sujet', '#0984e3');
        images.length = 0;
        P.poserAuTableau();
        await new Promise(r => setTimeout(r, 300));
        const arme = !!P.currentStamp;
        // On pose le tampon d'un clic sur le tableau
        P.onPointerDown({ x: 300, y: 300 });
        const img = images[0];
        const pose = !!img && img.pluginData.id === 'analyseGrammaticaleTool';

        P.edit(img);
        return {
            arme, pose,
            phraseRelue: P.phrase,
            analysesRelues: P.analyses.length,
            fenetreOuverte: !!P.widgetEl,
            bouton: P.widgetEl.querySelector('#ag-poser').textContent
        };
    });
    r.verifie('« Poser au tableau » arme le tampon', reedition.arme);
    r.verifie('un clic sur le tableau le pose', reedition.pose);
    r.egal('le double-clic rouvre la phrase', reedition.phraseRelue, 'Marie lit un roman.');
    r.egal('avec ses étiquettes', reedition.analysesRelues, 1);
    r.verifie('et le bouton propose de mettre à jour',
        /Mettre à jour/.test(reedition.bouton), reedition.bouton);

    // ==========================================================
    // DÉPLACER UN MOT, ET CHOISIR AU CADRE
    //
    // « Ce serait cool de pouvoir déplacer le mot : du genre "une fille jolie"
    // en "une jolie fille". On pourrait rendre les mots déplaçables, mais aussi
    // sélectionnables en traçant un cadre autour. »
    // ==========================================================
    const motEmporte = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('une fille jolie');
        if (!P.widgetEl) P.creerFenetre(); else { P.widgetEl.style.display = 'flex'; P.peindre(); }
        await new Promise(ok => setTimeout(ok, 120));
        const rendue = P.widgetEl.querySelector('#ag-phrase-rendue');
        const mots = () => [...rendue.querySelectorAll('.ag-mot')];
        const milieu = (el) => { const r = el.getBoundingClientRect();
                                 return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
        // LE DOIGT SE POSE SUR LE MOT, pas sur le conteneur : c'est « e.target »
        // qui dit lequel des deux gestes on fait, et le dispatcher ailleurs
        // ferait toujours croire à un cadre.
        const env = (t, x, y, cible) => (cible || rendue).dispatchEvent(new PointerEvent(t,
            { pointerId: 2, clientX: x, clientY: y, button: 0, bubbles: true, isPrimary: true }));

        // On emporte « jolie » et on le lâche devant « fille ».
        const surJolie = mots()[2];
        const jolie = milieu(surJolie);
        const fille = mots()[1].getBoundingClientRect();
        env('pointerdown', jolie.x, jolie.y, surJolie);
        env('pointermove', jolie.x - 30, jolie.y);
        const emporte = !!rendue.querySelector('.ag-emporte');
        const fenteVue = getComputedStyle(rendue.querySelector('#ag-fente')).display !== 'none';
        env('pointermove', fille.left + 2, jolie.y);
        env('pointerup', fille.left + 2, jolie.y);
        await new Promise(ok => setTimeout(ok, 120));
        return { emporte, fenteVue,
                 ordre: P.mots.map(m => m.texte),
                 phrase: P.phrase,
                 champ: P.widgetEl.querySelector('#ag-phrase').value };
    });
    r.verifie('le mot qu\'on emporte se marque', motEmporte.emporte, JSON.stringify(motEmporte));
    r.verifie('et la fente montre où il se posera', motEmporte.fenteVue, JSON.stringify(motEmporte));
    r.egal('« une fille jolie » devient « une jolie fille »',
        motEmporte.ordre, ['une', 'jolie', 'fille']);
    r.egal('la phrase suit ses mots', motEmporte.phrase, 'une jolie fille');
    r.egal('et le champ de saisie dit la même chose', motEmporte.champ, 'une jolie fille');

    // UN CLIC RESTE UN CLIC. Sans seuil, le moindre tremblement du doigt
    // volerait le geste qui choisit le premier mot du groupe.
    const clicIntact = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.debutChoisi = P.finChoisie = null;
        const rendue = P.widgetEl.querySelector('#ag-phrase-rendue');
        const el = rendue.querySelectorAll('.ag-mot')[1];
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const env = (t, dx, cible) => (cible || rendue).dispatchEvent(new PointerEvent(t,
            { pointerId: 3, clientX: x + dx, clientY: y, button: 0, bubbles: true, isPrimary: true }));
        env('pointerdown', 0, el);
        env('pointermove', 3);          // trois pixels : un doigt qui tremble
        // RIEN NE DOIT S'ÊTRE ARMÉ : ni le mot qui s'allège, ni la fente qui
        // montre où il irait. C'est là que le seuil se voit — le déplacement,
        // lui, retomberait de toute façon sur la même fente.
        const arme = { emporte: !!rendue.querySelector('.ag-emporte'),
                       fente: getComputedStyle(rendue.querySelector('#ag-fente')).display !== 'none' };
        env('pointerup', 3);
        el.click();
        await new Promise(ok => setTimeout(ok, 80));
        return { ordre: P.mots.map(m => m.texte), choisi: P.debutChoisi, arme };
    });
    r.egal('trois pixels de tremblement ne déplacent rien',
        clicIntact.ordre, ['une', 'jolie', 'fille']);
    r.verifie('et n\'arment même pas le geste : ni mot allégé, ni fente',
        !clicIntact.arme.emporte && !clicIntact.arme.fente, JSON.stringify(clicIntact.arme));
    r.egal('et le clic choisit toujours le mot', clicIntact.choisi, 1);

    // VERS LA DROITE, LA FENTE SE DÉCALE D'UN CRAN. Retirer le mot de sa place
    // fait glisser d'un rang tout ce qui le suivait : sans cette soustraction,
    // il se posait une case trop loin — et le défaut ne se voit QUE dans ce
    // sens-là, ce que le déplacement vers la gauche ne dit pas.
    const versLaDroite = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('une jolie fille');
        P.peindre();
        await new Promise(ok => setTimeout(ok, 80));
        P.deplacerLeMot(0, 2);          // « une » se pose après « jolie »
        return P.mots.map(m => m.texte);
    });
    r.egal('« une » passe bien après « jolie », et pas une case plus loin',
        versLaDroite, ['jolie', 'une', 'fille']);

    // LE CADRE CHOISIT CE QU'IL TOUCHE, au lieu de demander le premier mot
    // puis le dernier — ce qui suppose de savoir d'avance où le groupe s'arrête.
    const auCadre = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.debutChoisi = P.finChoisie = null;
        P.peindre();
        await new Promise(ok => setTimeout(ok, 80));
        const rendue = P.widgetEl.querySelector('#ag-phrase-rendue');
        const mots = [...rendue.querySelectorAll('.ag-mot')];
        const base = rendue.getBoundingClientRect();
        const a = mots[1].getBoundingClientRect(), b = mots[2].getBoundingClientRect();
        const env = (t, x, y) => rendue.dispatchEvent(new PointerEvent(t,
            { pointerId: 4, clientX: x, clientY: y, button: 0, bubbles: true, isPrimary: true }));
        // On part du fond, sous les mots, et l'on remonte en travers des deux
        // derniers : c'est le geste qu'on ferait au doigt.
        env('pointerdown', a.left - 4, base.bottom - 2);
        env('pointermove', b.right - 2, base.top + 2);
        const cadreVu = getComputedStyle(rendue.querySelector('#ag-cadre')).display !== 'none';
        env('pointerup', b.right - 2, base.top + 2);
        await new Promise(ok => setTimeout(ok, 80));
        return { cadreVu, de: P.debutChoisi, a: P.finChoisie };
    });
    r.verifie('le cadre se dessine pendant qu\'on le trace', auCadre.cadreVu, JSON.stringify(auCadre));
    r.egal('et il choisit tous les mots qu\'il touche', [auCadre.de, auCadre.a], [1, 2]);

    // UN GROUPE COUPÉ EN DEUX S'EN VA, ET ON LE DIT. Une étiquette ne sait pas
    // dire « ces deux mots-là, mais pas celui du milieu » : la garder en la
    // recalant sur min..max lui ferait avaler un mot qu'on ne lui a pas donné.
    const groupeCoupe = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('le chat noir dort');
        P.peindre();
        await new Promise(ok => setTimeout(ok, 80));
        P.debutChoisi = 0; P.finChoisie = 1;
        P.etiqueter('Sujet', '#0984e3');          // « le chat »
        P.debutChoisi = 3; P.finChoisie = 3;
        P.etiqueter('Verbe', '#d63031');          // « dort », groupeIntact
        const avant = P.analyses.length;
        let dit = null;
        const vrai = window.showToast; window.showToast = (m) => { dit = m; };
        // « dort » vient se glisser entre « le » et « chat ».
        P.deplacerLeMot(3, 1);
        window.showToast = vrai;
        return { avant, apres: P.analyses.length,
                 restant: P.analyses.map(a => a.libelle),
                 bornes: P.analyses.map(a => [a.de, a.a]),
                 ordre: P.mots.map(m => m.texte), dit };
    });
    r.egal('on part de deux groupes', groupeCoupe.avant, 2);
    r.egal('le mot s\'est bien glissé au milieu',
        groupeCoupe.ordre, ['le', 'dort', 'chat', 'noir']);
    r.egal('le groupe coupé en deux s\'en va, l\'autre reste',
        groupeCoupe.restant, ['Verbe']);
    r.egal('et celui qui reste est recalé sur son nouveau rang',
        groupeCoupe.bornes, [[1, 1]]);
    r.verifie('on le dit, au lieu de détruire en silence',
        /groupe retiré/i.test(groupeCoupe.dit || ''), String(groupeCoupe.dit));

    // ET UN GROUPE QUI SE SUIT ENCORE SUIT SON MOT, sans rien perdre.
    const groupeIntact = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('une fille jolie dort');
        P.peindre();
        await new Promise(ok => setTimeout(ok, 80));
        P.debutChoisi = 0; P.finChoisie = 2;
        P.etiqueter('Sujet', '#0984e3');          // tout le groupe nominal
        P.deplacerLeMot(2, 1);                    // « jolie » devant « fille »
        return { ordre: P.mots.map(m => m.texte),
                 analyses: P.analyses.length, bornes: P.analyses.map(a => [a.de, a.a]) };
    });
    r.egal('déplacer un mot DANS son groupe ne casse rien',
        groupeIntact.ordre, ['une', 'jolie', 'fille', 'dort']);
    r.egal('le groupe est toujours là', groupeIntact.analyses, 1);
    r.egal('et il couvre toujours les mêmes trois mots', groupeIntact.bornes, [[0, 2]]);

    await page.evaluate(() => {
        PluginManager.plugins['analyseGrammaticaleTool'].fermer();
        images.length = 0;
    });


    // ==========================================================
    // ANNULER
    //
    // « Et aussi pour l'analyse grammaticale un undo. » On étiquette devant la
    // classe, et l'on se trompe devant la classe : sans retour en arrière, il
    // fallait tout retirer et recommencer.
    // ==========================================================
    const annulation = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('le chat noir dort');
        if (!P.widgetEl) P.creerFenetre(); else { P.widgetEl.style.display = 'flex'; P.peindre(); }
        await new Promise(ok => setTimeout(ok, 100));
        const bouton = () => P.widgetEl.querySelector('#ag-annuler');
        const auDepart = bouton().disabled;

        P.debutChoisi = 0; P.finChoisie = 2;
        P.etiqueter('Sujet', '#0984e3');
        const apresEtiquette = { analyses: P.analyses.length, eteint: bouton().disabled };

        P.annuler();
        const defait = { analyses: P.analyses.length, eteint: bouton().disabled };

        // Un déplacement se défait aussi, MOTS ET GROUPES ENSEMBLE : c'est ce
        // qu'aucun « geste inverse » ne saurait rendre, puisque le déplacement
        // peut avoir retiré un groupe en chemin.
        P.debutChoisi = 0; P.finChoisie = 1;
        P.etiqueter('Sujet', '#0984e3');            // « le chat »
        P.deplacerLeMot(3, 1);                      // « dort » se glisse au milieu
        const casse = { ordre: P.mots.map(m => m.texte), analyses: P.analyses.length };
        P.annuler();
        const rendu = { ordre: P.mots.map(m => m.texte), analyses: P.analyses.length,
                        bornes: P.analyses.map(a => [a.de, a.a]) };

        // « Tout retirer » se défait comme le reste.
        P.widgetEl.querySelector('#ag-vider').click();
        const vide = P.analyses.length;
        P.annuler();
        const revenu = P.analyses.length;

        // Et une phrase neuve remet la pile à zéro : on ne défait pas vers un
        // texte qu'on croyait remplacé.
        P.poserPhrase('une autre phrase');
        const apresPhraseNeuve = { pile: P.pile.length, eteint: bouton().disabled };
        return { auDepart, apresEtiquette, defait, casse, rendu, vide, revenu, apresPhraseNeuve };
    });
    r.verifie('au départ, il n\'y a rien à défaire', annulation.auDepart, '');
    r.egal('poser une étiquette allume le bouton',
        annulation.apresEtiquette, { analyses: 1, eteint: false });
    r.egal('et l\'annuler la retire, le bouton s\'éteint',
        annulation.defait, { analyses: 0, eteint: true });
    r.egal('un déplacement casse le groupe coupé en deux',
        annulation.casse, { ordre: ['le', 'dort', 'chat', 'noir'], analyses: 0 });
    r.egal('l\'annuler rend les mots ET le groupe perdu en chemin',
        annulation.rendu,
        { ordre: ['le', 'chat', 'noir', 'dort'], analyses: 1, bornes: [[0, 1]] });
    r.egal('« Tout retirer » vide, et se défait aussi', [annulation.vide, annulation.revenu], [0, 1]);
    r.egal('une phrase neuve repart sans passé',
        annulation.apresPhraseNeuve, { pile: 0, eteint: true });

    await page.evaluate(() => PluginManager.plugins['analyseGrammaticaleTool'].fermer());


    // ==========================================================
    // LE FANTÔME DU MOT, ET LE FOND OÙ COMMENCER UN CADRE
    //
    // « Pour le drag and drop de l'analyse grammaticale, crée un fantôme du mot
    // ou groupe dragué. » Et : « On ne peut pas créer de cadre. »
    //
    // Le second était vrai pour une raison de géométrie : le tracé part du
    // FOND, et il n'y en avait pas — les mots remplissaient la ligne à quelques
    // pixels près. Il fallait viser une espace entre deux mots.
    // ==========================================================
    const gestesVisibles = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('une fille jolie');
        if (!P.widgetEl) P.creerFenetre(); else { P.widgetEl.style.display = 'flex'; P.peindre(); }
        await new Promise(ok => setTimeout(ok, 150));
        // « peindre » refait la phrase : on redemande le conteneur à chaque
        // fois plutôt que de garder une référence qui ne pointe plus sur rien.
        const laPhrase = () => P.widgetEl.querySelector('#ag-phrase-rendue');
        const mot = (i) => P.widgetEl.querySelector('.ag-mot[data-i="' + i + '"]');
        // LES GESTES SONT ÉCOUTÉS SUR LA PHRASE, et non sur la fenêtre : dans
        // un vrai navigateur c'est la capture du pointeur qui les y ramène,
        // mais un événement fabriqué et lancé sur « window » ne redescend
        // jamais jusqu'à elle. On l'envoie donc là où on l'écoute.
        const evt = (type, x, y, cible) => (cible || laPhrase()).dispatchEvent(
            new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));

        // 1. LE FANTÔME suit le doigt et porte le mot qu'on emporte.
        const m = mot(2).getBoundingClientRect();
        evt('pointerdown', m.left + 5, m.top + 5, mot(2));
        evt('pointermove', m.left + 60, m.top + 5);
        const f = document.getElementById('ag-fantome');
        const fantome = {
            la: !!f,
            texte: f ? f.textContent : '',
            suit: f ? Math.abs(f.getBoundingClientRect().left - (m.left + 60)) < 40 : false
        };
        evt('pointerup', m.left + 60, m.top + 5);
        await new Promise(ok => setTimeout(ok, 120));
        fantome.apres = !!document.getElementById('ag-fantome');

        // 2. LE FOND : il doit y avoir de la place au-dessus du premier mot
        // pour y poser le doigt et commencer un cadre.
        P.poserPhrase('une fille jolie');
        P.peindre();
        await new Promise(ok => setTimeout(ok, 120));
        const rendue = laPhrase();
        const base = rendue.getBoundingClientRect();
        const premier = mot(0).getBoundingClientRect();
        const bande = Math.round(premier.top - base.top);

        // On part du coin haut-gauche du fond, on traverse les deux premiers
        // mots, on relâche : c'est le geste décrit.
        const depart = { x: base.left + 3, y: base.top + 3 };
        const arrivee = { x: mot(1).getBoundingClientRect().right - 2,
                          y: premier.bottom + 2 };
        const surLeFond = document.elementFromPoint(Math.round(depart.x), Math.round(depart.y));
        evt('pointerdown', depart.x, depart.y, rendue);
        evt('pointermove', arrivee.x, arrivee.y);
        const cadre = P.widgetEl.querySelector('#ag-cadre');
        const trace = getComputedStyle(cadre).display !== 'none';
        evt('pointerup', arrivee.x, arrivee.y);
        await new Promise(ok => setTimeout(ok, 120));

        return {
            fantome, bande, trace,
            fondAtteignable: !!(surLeFond && (surLeFond === rendue || rendue.contains(surLeFond))
                && !surLeFond.classList.contains('ag-mot')),
            choisi: [P.debutChoisi, P.finChoisie]
        };
    });
    r.verifie('un fantôme suit le doigt pendant qu\'on emporte un mot',
        gestesVisibles.fantome.la && gestesVisibles.fantome.suit,
        JSON.stringify(gestesVisibles.fantome));
    r.egal('il porte le mot qu\'on tient', gestesVisibles.fantome.texte, 'jolie');
    r.egal('et s\'efface une fois lâché', gestesVisibles.fantome.apres, false);
    r.verifie('il y a du fond au-dessus des mots pour commencer un cadre',
        gestesVisibles.bande >= 10, gestesVisibles.bande + ' pixels au-dessus du premier mot');
    r.verifie('et ce fond répond au doigt', gestesVisibles.fondAtteignable,
        JSON.stringify(gestesVisibles));
    r.verifie('le cadre se trace', gestesVisibles.trace, JSON.stringify(gestesVisibles));
    r.egal('et il choisit les mots qu\'il touche', gestesVisibles.choisi, [0, 1]);

    await page.evaluate(() => PluginManager.plugins['analyseGrammaticaleTool'].fermer());
    // ==========================================================
    // LE LECTEUR DE DICTÉE — UNE LECTURE DICTÉE COMME LE FERAIT UN PROFESSEUR
    //
    // « On ne comprend rien, le son est nul, trop robot. » Puis : « il faut
    // une lecture dictée comme le ferait un professeur. »
    //
    // CETTE MACHINE N'A AUCUNE VOIX — l'API est là, la liste est vide. C'est
    // justement ce qui oblige à tout faire passer par un moteur qu'on peut
    // remplacer : le découpage, les annonces, l'enchaînement, les répétitions
    // et le temps d'écriture s'éprouvent ici, et le son se juge sur la machine
    // du professeur.
    // ==========================================================
    const decoupe = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        return {
            ponctuation: D.decouperEnGroupes(
                "Le chat dort. Le chien, lui, aboie très fort !", 12),
            // TREIZE MOTS PAR QUATRE : c'est là que les deux façons de couper
            // se séparent. En tranches pleines : 4-4-4-1, et l'élève reçoit un
            // mot tout seul à la fin. En parts égales : 4-3-3-3.
            longueur: D.decouperEnGroupes(
                'un deux trois quatre cinq six sept huit neuf dix onze douze treize', 4),
            vide: D.decouperEnGroupes('   ', 7),
            espaces: D.decouperEnGroupes('  Le   chat dort.  ', 12),
            // LES TROIS PIÈGES TROUVÉS EN SONDANT LE DÉCOUPAGE D'AVANT.
            abreviation: D.decouperEnGroupes('M. Dupont arrive. Il part.', 12),
            decimale: D.decouperEnGroupes('Il mesure 3,14 mètres.', 12),
            guillemets: D.decouperEnGroupes('« Viens ! » dit-il.', 12),
            suspension: D.decouperEnGroupes('Il attendait... puis partit.', 12),
            lignes: D.decouperEnGroupes('Le chat dort.\nLe chien aboie.', 12)
        };
    });
    r.egal('on coupe à la ponctuation, et elle reste collée au groupe',
        decoupe.ponctuation, ['Le chat dort.', 'Le chien,', 'lui,', 'aboie très fort !']);
    // DOUZE MOTS EN PARTS ÉGALES, et non deux tranches de quatre plus un reste
    // d'un seul mot : on dicte « quatre quatre quatre », pas « 4 4 4 » puis un
    // orphelin qui arrive tout seul.
    r.egal('ce qui reste trop long est partagé en parts égales',
        decoupe.longueur,
        ['un deux trois quatre', 'cinq six sept', 'huit neuf dix', 'onze douze treize']);
    r.egal('un texte vide ne donne aucun groupe', decoupe.vide, []);
    r.egal('les espaces en trop ne font pas de groupes fantômes',
        decoupe.espaces, ['Le chat dort.']);
    // « M. Dupont arrive » donnait ['M.', 'Dupont arrive.'] : la voix disait
    // « èm », toute seule, et s'arrêtait. Ce n'est pas une dictée, c'est un
    // hoquet.
    r.egal('une abréviation ne finit pas une phrase',
        decoupe.abreviation, ['M. Dupont arrive.', 'Il part.']);
    r.egal('et une virgule entre deux chiffres est un nombre, pas une pause',
        decoupe.decimale, ['Il mesure 3,14 mètres.']);
    // Le guillemet fermant commençait le groupe suivant : la voix ne le dit
    // pas, et l'élève ne peut pas le deviner.
    r.egal('le guillemet fermant reste avec ce qu\'il ferme',
        decoupe.guillemets, ['« Viens ! »', 'dit-il.']);
    r.egal('les trois points valent les points de suspension',
        decoupe.suspension, ['Il attendait…', 'puis partit.']);
    r.egal('un retour à la ligne sépare deux groupes',
        decoupe.lignes, ['Le chat dort.', 'Le chien aboie.']);

    // ==================================================================
    // ON NE DICTE PAS PAR TRANCHES DE QUATRE MOTS,
    // MAIS PAR MORCEAUX DE PHRASE
    //
    // « Quand on lit une dictée, on ne lit pas par groupe de 3 ou 4 mots mais
    // plutôt par parties de phrases. »
    //
    // C'est exact, et le découpage d'avant faisait tout le contraire : une
    // fois la ponctuation passée, il partageait ce qui restait en PARTS
    // ÉGALES, au mot près, sans regarder la langue. « Le vent d'automne
    // emportait les dernières feuilles » devenait « … emportait les » puis
    // « dernières feuilles » : on coupait entre un déterminant et son nom, ce
    // qu'aucun professeur ne fait — et ce qu'aucun élève ne peut écrire,
    // puisqu'il ne sait pas encore ce qui vient.
    // ==================================================================
    const phrase = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        return {
            ecole: D.decouperEnGroupes(
                'Les élèves de sixième ont rangé leurs affaires dans le couloir '
                + 'avant de partir en récréation.', 6),
            relatif: D.decouperEnGroupes(
                'Il regarda longuement la petite maison qui se tenait au bout du chemin '
                + 'et poussa la porte.', 6),
            exemple: D.decouperEnGroupes(D.TEXTE_EXEMPLE, 6),
            // Sans la moindre charnière, on retombe sur les parts égales.
            sansCharniere: D.decouperEnGroupes(
                'un deux trois quatre cinq six sept huit neuf dix onze douze treize', 4),
            // Et l'on éprouve la règle elle-même, mot à mot.
            apresUnDeterminant: D.coupureAutorisee(['les', 'dernières', 'feuilles'], 1),
            apresUnePreposition: D.coupureAutorisee(['dans', 'leurs', 'écharpes'], 1),
            apresUnPronom: D.coupureAutorisee(['il', 'regarda', 'la'], 1),
            apresUnAuxiliaire: D.coupureAutorisee(['ont', 'rangé', 'leurs'], 1),
            apresUneElision: D.coupureAutorisee(["l'", 'école', 'ferme'], 1),
            apresUnNom: D.coupureAutorisee(['feuilles', 'et', 'les'], 1),
            devantUneConjonction: D.poidsDeLaCharniere('et'),
            devantUnRelatif: D.poidsDeLaCharniere('qui'),
            devantUnePreposition: D.poidsDeLaCharniere('dans'),
            devantUnDeterminant: D.poidsDeLaCharniere('les'),
            devantUnNom: D.poidsDeLaCharniere('feuilles')
        };
    });
    // LA RÈGLE, MOT À MOT : on ne coupe jamais après ce qui appelle la suite.
    r.egal('on ne coupe pas entre un déterminant et son nom', phrase.apresUnDeterminant, false);
    r.egal('ni après une préposition', phrase.apresUnePreposition, false);
    r.egal('ni entre un pronom sujet et son verbe', phrase.apresUnPronom, false);
    r.egal('ni entre l\'auxiliaire et le participe', phrase.apresUnAuxiliaire, false);
    r.egal('ni après une élision', phrase.apresUneElision, false);
    r.egal('mais après un nom, oui', phrase.apresUnNom, true);
    // ET L'ON COUPE DEVANT CE QUI OUVRE UN MORCEAU DE PHRASE, du plus fort au
    // plus faible : conjonction, relatif, préposition, déterminant.
    r.verifie('une conjonction ouvre un morceau de phrase, un nom non',
        phrase.devantUneConjonction > 0 && phrase.devantUnNom === 0,
        JSON.stringify(phrase));
    r.verifie('et le relatif pèse plus lourd que le déterminant',
        phrase.devantUnRelatif > phrase.devantUnePreposition
        && phrase.devantUnePreposition > phrase.devantUnDeterminant,
        [phrase.devantUnRelatif, phrase.devantUnePreposition, phrase.devantUnDeterminant].join(' > '));

    // CE QUE CELA DONNE SUR DE VRAIES PHRASES.
    r.egal('la phrase se coupe là où elle respire', phrase.ecole,
        ['Les élèves de sixième ont rangé', 'leurs affaires dans le couloir',
         'avant de partir en récréation.']);
    r.egal('le relatif ouvre son propre morceau', phrase.relatif,
        ['Il regarda longuement la petite maison', 'qui se tenait au bout du chemin',
         'et poussa la porte.']);
    r.egal('et le texte d\'exemple aussi', phrase.exemple,
        ["Le vent d'automne emportait les dernières feuilles,", 'et les enfants,',
         'emmitouflés dans leurs écharpes,', "couraient vers l'école."]);
    // AUCUN GROUPE NE COMMENCE PAR UN MOT QUI APPELLE CE QUI PRÉCÈDE.
    r.verifie('aucun groupe ne commence au milieu d\'un groupe de mots',
        [].concat(phrase.ecole, phrase.relatif, phrase.exemple)
            .every((g, i, t) => i === 0 || !/^(dernières|écharpes|couloir|récréation|maison|chemin|porte)\b/.test(g)),
        JSON.stringify([].concat(phrase.ecole, phrase.relatif, phrase.exemple)));
    // SANS LA MOINDRE CHARNIÈRE, on retombe sur les parts égales — et non sur
    // des tranches pleines suivies d'un reste d'un seul mot.
    r.egal('sans charnière, on partage en parts égales', phrase.sansCharniere,
        ['un deux trois quatre', 'cinq six sept', 'huit neuf dix', 'onze douze treize']);
    // ET LA LONGUEUR EST UNE CIBLE, PAS UN PLAFOND : un groupe de sens fait
    // cinq mots ou neuf, et l'imposer à six exactement, c'est revenir à
    // couper au mot près.
    r.verifie('un morceau de phrase peut dépasser la cible d\'un mot ou deux',
        phrase.exemple[0].split(' ').length > 6, phrase.exemple[0]);

    // ----------------------------------------------------------
    // LA PONCTUATION DITE EN TOUTES LETTRES
    //
    // C'est la cause principale du « on ne comprend rien » : aucune voix de
    // synthèse ne marque une virgule de façon audible pour un enfant qui
    // écrit, et AUCUNE ne rend un guillemet ou un deux-points. Or la
    // ponctuation est notée sur la copie.
    // ----------------------------------------------------------
    const annonces = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const lire = (texte, position) => {
            D.reglages.ponctuation = position;
            return D.analyserLeTexte(texte, 12).map(g => ({
                texte: g.texte,
                avant: g.avant.filter(a => D.annonce(a.rang)).map(a => a.dit),
                apres: g.apres.filter(a => D.annonce(a.rang)).map(a => a.dit)
            }));
        };
        const phrase = '« Viens ! » dit-il.\nLe chien, lui, dort : il rêve.';
        return {
            tout: lire(phrase, 'tout'),
            essentiel: lire(phrase, 'essentiel'),
            rien: lire(phrase, 'rien'),
            paragraphe: lire('Premier.\n\nSecond.', 'essentiel'),
            // L'ABRÉVIATION ET LA DÉCIMALE NE S'ANNONCENT PAS NON PLUS : le
            // découpage les protège, l'annonce doit les protéger aussi.
            pieges: lire('M. Dupont a 3,14 euros.', 'tout')
        };
    });
    const dits = (liste) => liste.map(g => g.avant.concat(g.apres)).flat();
    r.egal('les guillemets s\'ouvrent avant et se ferment après',
        annonces.essentiel[0], { texte: '« Viens ! »',
            avant: ['ouvrez les guillemets'],
            apres: ['point d’exclamation', 'fermez les guillemets'] });
    r.verifie('« virgule » se dit en position « Tout »',
        dits(annonces.tout).includes('virgule'), JSON.stringify(dits(annonces.tout)));
    r.verifie('et pas en position « L\'essentiel » — l\'intonation la porte à peu près',
        !dits(annonces.essentiel).includes('virgule'), JSON.stringify(dits(annonces.essentiel)));
    r.verifie('« deux points » se dit dès « L\'essentiel » — aucune voix ne le rend',
        dits(annonces.essentiel).includes('deux points'), JSON.stringify(dits(annonces.essentiel)));
    r.egal('en position « Rien », la voix ne dit plus que le texte',
        dits(annonces.rien), []);
    r.verifie('« à la ligne » s\'annonce avant le groupe, jamais après',
        annonces.essentiel.some(g => g.avant.includes('à la ligne'))
        && !annonces.essentiel.some(g => g.apres.includes('à la ligne')),
        JSON.stringify(annonces.essentiel));
    r.verifie('une ligne vide annonce un nouveau paragraphe',
        dits(annonces.paragraphe).some(d => /nouveau paragraphe/.test(d)),
        JSON.stringify(dits(annonces.paragraphe)));
    // LE POINT FINAL SE DIT UNE FOIS, À LA TOUTE FIN : c'est le signal que
    // l'élève attend pour poser son stylo.
    r.egal('le dernier point est le point final',
        annonces.essentiel[annonces.essentiel.length - 1].apres, ['point final.']);
    r.verifie('et les points d\'avant sont de simples points',
        annonces.essentiel.slice(0, -1).every(g => !g.apres.includes('point final.')),
        JSON.stringify(annonces.essentiel.map(g => g.apres)));
    r.egal('le point d\'une abréviation ne s\'annonce pas, ni la virgule d\'un nombre',
        dits(annonces.pieges), ['point final.']);

    // ----------------------------------------------------------
    // LE TEMPS D'ÉCRITURE
    //
    // « Pause : 4 secondes, plafond 15 » ne pouvait exprimer aucune dictée
    // réelle : il en faut cinquante à soixante-dix, et proportionnelles à ce
    // qu'il y a à écrire. Le même blanc après « il dit » et après
    // « emmitouflés dans leurs écharpes » n'est pas un réglage, c'est une
    // erreur.
    // ----------------------------------------------------------
    const ecriture = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.choisirLeNiveau('cm');
        const court = D.cycleDuGroupe('il dit');
        const long = D.cycleDuGroupe('emmitouflés dans leurs écharpes');
        const nominal = D.reglages.longueur * D.reglages.secondesParMot;
        // LE CYCLE NOMINAL EST CELUI DE LA TABLE : un groupe plein, au niveau
        // choisi, doit retomber sur « mots × secondes par mot ». C'est ce que
        // la table promet, et la fonction doit le tenir — pas la table.
        const parNiveau = DIC_NIVEAUX.map(n => {
            D.choisirLeNiveau(n.cle);
            // Un groupe plein, écrit à la longueur moyenne d'un mot du niveau.
            const plein = 'a'.repeat(Math.round(n.longueur * n.signesParMot));
            return { niveau: n.cle, promis: n.longueur * n.secondesParMot,
                     rendu: Math.round(D.cycleDuGroupe(plein)) };
        });
        D.choisirLeNiveau('cm');
        // LE PLAFOND EST RELATIF au niveau, et non une constante : un plafond
        // absolu mordait là où le temps long est justifié.
        const enorme = D.cycleDuGroupe('a'.repeat(5000));
        // ON RETRANCHE LA PAROLE, jamais les consignes.
        const avecParole = D.tempsDEcriture('emmitouflés dans leurs écharpes', 8);
        const sansParole = D.tempsDEcriture('emmitouflés dans leurs écharpes', 0);
        const plancher = D.tempsDEcriture('a', 900);
        return { court, long, nominal, parNiveau, enorme, avecParole, sansParole,
                 plancher, minimum: D.ECRITURE_MINIMUM };
    });
    r.verifie('un groupe long demande plus de temps qu\'un groupe court',
        ecriture.long > ecriture.court + 10,
        `${ecriture.court.toFixed(1)} s contre ${ecriture.long.toFixed(1)} s`);
    r.verifie('et le temps d\'un groupe plein est celui du niveau',
        Math.abs(ecriture.long - ecriture.nominal) < ecriture.nominal * 0.25,
        `${ecriture.long.toFixed(1)} s pour un nominal de ${ecriture.nominal}`);
    // LA TABLE PROMET « mots × secondes par mot » : la fonction doit le tenir.
    // On a failli laisser passer l'inverse — une longueur moyenne de mot prise
    // au collège pour tous les niveaux rendait le CP quinze pour cent trop
    // court et le lycée dix-sept pour cent trop long, sans qu'aucune
    // vérification puisse le voir.
    r.verifie('à chaque niveau, un groupe plein tient la promesse de la table',
        ecriture.parNiveau.every(n => Math.abs(n.rendu - n.promis) <= 2),
        JSON.stringify(ecriture.parNiveau));
    r.verifie('le cycle reste entre cinquante et soixante-quinze secondes partout',
        ecriture.parNiveau.every(n => n.promis >= 50 && n.promis <= 75),
        JSON.stringify(ecriture.parNiveau.map(n => n.promis)));
    r.verifie('un groupe démesuré est plafonné à deux cycles du niveau',
        Math.abs(ecriture.enorme - 2 * ecriture.nominal) < 0.5,
        `${ecriture.enorme.toFixed(1)} s pour un nominal de ${ecriture.nominal}`);
    r.verifie('ce qu\'a duré la parole est retranché : l\'élève écrit déjà pendant qu\'on lit',
        Math.abs(ecriture.sansParole - ecriture.avecParole - 8) < 0.01,
        `${ecriture.sansParole.toFixed(1)} contre ${ecriture.avecParole.toFixed(1)}`);
    r.egal('et l\'on ne descend jamais sous le plancher',
        ecriture.plancher, ecriture.minimum);

    // LES NIVEAUX : UN APPUI RÈGLE TOUT. Personne ne veut déplacer quatre
    // curseurs au milieu d'un cours.
    const niveaux = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.choisirLeNiveau('lycee');
        const lycee = Object.assign({}, D.reglages);
        D.choisirLeNiveau('cp');
        const cp = Object.assign({}, D.reglages);
        const inconnu = D.choisirLeNiveau('maternelle');
        D.choisirLeNiveau('cm');
        return {
            cp, lycee, inconnu,
            // La table doit être monotone : un petit écrit moins vite, reçoit
            // des groupes plus courts et plus de répétitions.
            cadences: DIC_NIVEAUX.map(n => n.secondesParMot),
            longueurs: DIC_NIVEAUX.map(n => n.longueur)
        };
    });
    r.verifie('un niveau pose la vitesse, la longueur, les répétitions et la cadence',
        niveaux.cp.vitesse === 0.85 && niveaux.cp.longueur === 3
        && niveaux.cp.repetitions === 3 && niveaux.cp.secondesParMot === 24,
        JSON.stringify(niveaux.cp));
    r.verifie('le CP écrit plus lentement que le lycée',
        niveaux.cp.secondesParMot > niveaux.lycee.secondesParMot * 3,
        `${niveaux.cp.secondesParMot} contre ${niveaux.lycee.secondesParMot}`);
    r.verifie('et reçoit des groupes plus courts',
        niveaux.cp.longueur < niveaux.lycee.longueur, JSON.stringify(niveaux));
    r.egal('au primaire, la virgule se dit', niveaux.cp.ponctuation, 'tout');
    r.egal('au lycée, non', niveaux.lycee.ponctuation, 'essentiel');
    r.verifie('la cadence décroît du CP au lycée',
        niveaux.cadences.every((v, i) => i === 0 || v < niveaux.cadences[i - 1]),
        JSON.stringify(niveaux.cadences));
    r.verifie('et la longueur des groupes croît',
        niveaux.longueurs.every((v, i) => i === 0 || v > niveaux.longueurs[i - 1]),
        JSON.stringify(niveaux.longueurs));
    r.egal('un niveau inconnu ne casse rien', niveaux.inconnu, false);

    // ----------------------------------------------------------
    // L'ENCHAÎNEMENT, AVEC UN MOTEUR QU'ON REMPLACE
    // ----------------------------------------------------------
    const enchaine = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = {
            disponible: () => true,
            voix: () => [],
            dire: (texte, opts, fini) => { dits.push(texte); setTimeout(fini, 0); return {}; },
            taire: () => { /* on ne note que ce qui est DIT */ }
        };
        D.reglages.longueur = 12; D.reglages.repetitions = 2;
        D.reglages.secondesParMot = 0; D.reglages.ponctuation = 'tout';
        D.reglages.marche = 'minuteur';
        // CE QU'ON ÉPROUVE ICI, C'EST L'ORDRE, pas les durées — elles ont leur
        // propre section. On met donc les blancs à zéro : sans cela le
        // chapitre attendrait le vrai temps d'écriture d'une classe.
        D.ECRITURE_MINIMUM = 0; D.BLANC_ENTRE_LECTURES = 0; D.BLANC_AVANT_CONSIGNE = 0;
        D.poserLeTexte('Un deux. Trois quatre.');

        D.lancer('dictee');
        await new Promise(ok => setTimeout(ok, 800));
        const enDictee = dits.slice();

        dits.length = 0;
        D.lancer('ensemble');
        await new Promise(ok => setTimeout(ok, 500));
        const enEnsemble = dits.slice();

        D.ECRITURE_MINIMUM = 4; D.BLANC_ENTRE_LECTURES = 1.8; D.BLANC_AVANT_CONSIGNE = 0.4;
        D.moteur = vrai;
        return { enDictee, enEnsemble, phase: D.phase };
    });
    // LA DICTÉE DIT LE GROUPE, PUIS SON SIGNE, ET RECOMMENCE : c'est ce qu'on
    // entend en classe. Le nom du signe part dans une énonciation SÉPARÉE —
    // « virgule » n'est pas la phrase, c'est une consigne.
    r.egal('la dictée dit chaque groupe deux fois, avec sa ponctuation',
        enchaine.enDictee,
        ['Un deux.', 'point.', 'Un deux.', 'point.',
         'Trois quatre.', 'point final.', 'Trois quatre.', 'point final.']);
    // ET LA LECTURE D'ENSEMBLE N'ANNONCE RIEN : elle est là pour le sens.
    // Dire « virgule » pendant qu'on écoute l'histoire la hacherait.
    r.egal('la lecture d\'ensemble ne répète rien et n\'annonce rien',
        enchaine.enEnsemble, ['Un deux.', 'Trois quatre.']);
    r.egal('et l\'on s\'arrête au bout', enchaine.phase, 'arret');

    // LE JETON DE SÉRIE. Presser « Dictée » pendant qu'on lit laissait DEUX
    // chaînes piloter le même rang : les groupes se doublaient ou se
    // sautaient. C'est sans doute une bonne part du « on ne comprend rien »,
    // et ce n'était pas la voix.
    const jeton = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        let finirLeDernier = null;
        D.moteur = {
            disponible: () => true, voix: () => [],
            dire: (t, o, fini) => { dits.push(t); finirLeDernier = fini; return {}; },
            taire: () => { /* la vraie annulation ne rappelle pas ici */ }
        };
        D.reglages.longueur = 12; D.reglages.repetitions = 1;
        D.reglages.secondesParMot = 0; D.reglages.ponctuation = 'rien';
        // LE RAPPEL PÉRIMÉ NE FAIT PAS DE DÉGÂT TOUT DE SUITE : il arme le
        // temps d'écriture, et c'est au bout de celui-ci que la seconde chaîne
        // se met à piloter le rang. Sans ce zéro, l'éprouvette regardait avant
        // que le mal soit fait, et elle passait sur du code cassé — le
        // sabotage l'a montré.
        D.ECRITURE_MINIMUM = 0;
        D.poserLeTexte('Un. Deux. Trois.');

        D.lancer('dictee');                 // dit « Un. », attend la fin
        const finPerimee = finirLeDernier;  // le rappel de CETTE lecture
        D.lancer('dictee');                 // on repart : la série change
        dits.length = 0;
        finPerimee();                       // le rappel périmé revient
        await new Promise(ok => setTimeout(ok, 120));
        const apresLeRappelPerime = dits.slice();
        const rang = D.rang;

        // ET « REDITES » DOIT PROTÉGER AUTANT QUE « DICTÉE ». C'est même le
        // geste le plus courant : un élève lève le doigt pendant qu'on lit, on
        // appuie, et l'ancienne lecture revenait piloter le rang par derrière.
        D.lancer('dictee');
        const finAvantRedites = finirLeDernier;
        D.redire();
        dits.length = 0;
        finAvantRedites();
        await new Promise(ok => setTimeout(ok, 120));
        const apresRedites = { dits: dits.slice(), rang: D.rang };

        D.ECRITURE_MINIMUM = 4;
        D.arreter();
        D.moteur = vrai;
        return { apresLeRappelPerime, rang, serie: D.serie, apresRedites };
    });
    r.egal('un rappel périmé ne fait plus avancer la dictée',
        jeton.apresLeRappelPerime, []);
    r.egal('et le rang reste où la lecture en cours l\'a laissé', jeton.rang, 0);
    r.verifie('la série a bien changé', jeton.serie >= 2, String(jeton.serie));
    r.egal('« Redites » protège autant : le rappel d\'avant ne dit plus rien',
        jeton.apresRedites.dits, []);
    r.egal('et ne fait pas avancer le rang', jeton.apresRedites.rang, 0);

    // « REDITES » RECOMMENCE LE GROUPE, ses répétitions comprises : c'est le
    // geste de l'élève qui n'a pas entendu, et il ne doit pas le priver de la
    // seconde lecture qu'auront les autres.
    const commandes = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = { disponible: () => true, voix: () => [],
                     dire: (t, o, fini) => { dits.push(t); D.__fini = fini; return {}; },
                     taire: () => {} };
        D.reglages.longueur = 12; D.reglages.repetitions = 2;
        D.reglages.secondesParMot = 0; D.reglages.ponctuation = 'rien';
        D.reglages.marche = 'minuteur';
        D.poserLeTexte('Un deux. Trois quatre. Cinq six.');
        D.lancer('dictee');                 // dit « Un deux. », attend la fin
        const auDepart = { rang: D.rang, restantes: D.restantes };

        dits.length = 0;
        D.redire();
        const apresRedites = { dits: dits.slice(), restantes: D.restantes };

        dits.length = 0;
        D.allerAuGroupe(2);
        const apresSaut = { dits: dits.slice(), rang: D.rang };

        D.allerAuGroupe(0);
        dits.length = 0;
        D.suivant();
        const apresSuivant = { dits: dits.slice(), rang: D.rang };

        const enPause = D.basculerLaPause();
        const reprise = D.basculerLaPause();

        D.arreter();
        D.moteur = vrai;
        return { auDepart, apresRedites, apresSaut, apresSuivant, enPause, reprise,
                 phaseFinale: D.phase };
    });
    r.egal('la dictée part sur le premier groupe, avec ses deux lectures',
        commandes.auDepart, { rang: 0, restantes: 2 });
    r.egal('« Redites » redit le groupe en cours', commandes.apresRedites.dits, ['Un deux.']);
    r.egal('et lui rend ses deux lectures', commandes.apresRedites.restantes, 2);
    r.egal('on saute au groupe qu\'on désigne', commandes.apresSaut.dits, ['Cinq six.']);
    r.egal('et le rang suit', commandes.apresSaut.rang, 2);
    // LA TÉLÉCOMMANDE : « Suivant » passe au groupe d'après sans attendre le
    // minuteur — si toute la classe a posé son stylo, on n'attend pas.
    r.egal('« Suivant » passe au groupe d\'après', commandes.apresSuivant.rang, 1);
    r.egal('et le dit aussitôt', commandes.apresSuivant.dits, ['Trois quatre.']);
    r.egal('la pause s\'allume et s\'éteint', [commandes.enPause, commandes.reprise], [true, false]);
    r.egal('arrêter rend la main', commandes.phaseFinale, 'arret');

    // LES VITESSES SE DÉRIVENT DU TEMPS, elles ne s'ajoutent pas au réglage.
    // La première lecture est pour le SENS : elle va au débit naturel. La
    // dictée est plus lente. Et tout reste entre 0,80 et 1,00 — au-dessous,
    // les voix compactes étirent les voyelles et l'on comprend MOINS, pas
    // mieux : l'ancienne plage 0,5-1,2 invitait très exactement au geste dont
    // on se plaint.
    const debits = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = { disponible: () => true, voix: () => [],
                     dire: (t, o, fini) => { dits.push({ t, v: o.vitesse }); setTimeout(fini, 0); return {}; },
                     taire: () => {} };
        D.reglages.longueur = 12; D.reglages.repetitions = 1;
        D.reglages.ponctuation = 'essentiel'; D.reglages.vitesse = 0.88;
        D.poserLeTexte('Un deux.');
        const lire = async (phase) => {
            dits.length = 0;
            D.lancer(phase);
            // Le nom du signe part APRÈS un blanc — « virgule » ne doit pas se
            // coller à la fin de la phrase. On attend donc plus que ce blanc.
            await new Promise(ok => setTimeout(ok, 700));
            D.arreter();
            return dits.slice();
        };
        const ensemble = await lire('ensemble');
        const dictee = await lire('dictee');
        const relecture = await lire('relecture');
        // Et la plage : même poussé hors des bornes, le réglage s'y ramène.
        D.reglages.vitesse = 0.4;
        const trop_lent = D.vitesseDuTemps('dictee');
        D.reglages.vitesse = 1.9;
        const trop_vite = D.vitesseDuTemps('ensemble');
        D.reglages.vitesse = 0.88;
        D.moteur = vrai;
        return { ensemble, dictee, relecture, trop_lent, trop_vite };
    });
    const vTexte = (liste) => (liste.find(x => /Un deux/.test(x.t)) || {}).v;
    const vConsigne = (liste) => (liste.find(x => /point/.test(x.t)) || {}).v;
    r.verifie('la lecture d\'ensemble va au débit naturel, la dictée plus lentement',
        vTexte(debits.ensemble) > vTexte(debits.dictee),
        `${vTexte(debits.ensemble)} contre ${vTexte(debits.dictee)}`);
    r.verifie('et la relecture est entre les deux',
        vTexte(debits.relecture) > vTexte(debits.dictee)
        && vTexte(debits.relecture) <= vTexte(debits.ensemble),
        `${vTexte(debits.dictee)} · ${vTexte(debits.relecture)} · ${vTexte(debits.ensemble)}`);
    // « VIRGULE » N'EST PAS LA PHRASE, c'est une consigne : elle se dit un peu
    // moins vite, et l'on ne l'écrit pas.
    r.verifie('la consigne se dit moins vite que le texte',
        vConsigne(debits.dictee) < vTexte(debits.dictee),
        `${vConsigne(debits.dictee)} contre ${vTexte(debits.dictee)}`);
    r.verifie('aucun débit ne sort des bornes',
        [].concat(debits.ensemble, debits.dictee, debits.relecture)
            .every(x => x.v >= 0.8 && x.v <= 1),
        JSON.stringify([].concat(debits.ensemble, debits.dictee, debits.relecture)));
    r.egal('un réglage trop lent se ramène à 0,80', debits.trop_lent, 0.8);
    r.egal('et un réglage trop rapide à 1,00', debits.trop_vite, 1);

    // LA PAUSE GARDE CE QU'IL RESTAIT À ATTENDRE. L'ancienne reprenait en
    // REDISANT le groupe : on perdait le temps d'écriture déjà écoulé, et la
    // classe réentendait une phrase qu'elle venait d'écrire.
    const pause = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = { disponible: () => true, voix: () => [],
                     dire: (t, o, fini) => { dits.push(t); setTimeout(fini, 0); return {}; },
                     taire: () => {} };
        D.reglages.longueur = 12; D.reglages.repetitions = 1;
        D.reglages.ponctuation = 'rien'; D.reglages.marche = 'minuteur';
        D.ECRITURE_MINIMUM = 6;
        D.reglages.secondesParMot = 0;
        D.poserLeTexte('Un deux. Trois quatre.');
        D.lancer('dictee');
        await new Promise(ok => setTimeout(ok, 300));   // le groupe est dit, on attend
        dits.length = 0;
        D.basculerLaPause();
        const enPause = { reste: D.resteEnPause, dits: dits.slice() };
        await new Promise(ok => setTimeout(ok, 400));
        const pendant = dits.slice();                   // rien ne doit sortir
        D.basculerLaPause();
        await new Promise(ok => setTimeout(ok, 200));
        const apres = { dits: dits.slice(), rang: D.rang };
        D.ECRITURE_MINIMUM = 4;
        D.arreter();
        D.moteur = vrai;
        return { enPause, pendant, apres };
    });
    r.verifie('la pause retient ce qu\'il restait à attendre',
        pause.enPause.reste > 4000 && pause.enPause.reste <= 6000,
        String(Math.round(pause.enPause.reste)) + ' ms');
    r.egal('rien ne se dit pendant la pause', pause.pendant, []);
    // ELLE NE REDIT PAS LE GROUPE : on reprend le temps d'écriture là où il
    // en était, on ne recommence pas la phrase que la classe vient d'écrire.
    r.egal('et reprendre ne redit pas le groupe', pause.apres.dits, []);
    r.egal('on est toujours sur le même groupe', pause.apres.rang, 0);

    // LA MARCHE « QUAND J'APPUIE ». Le professeur seul voit les cahiers :
    // c'est lui qui dit quand on passe à la suite.
    const aLaMain = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = { disponible: () => true, voix: () => [],
                     dire: (t, o, fini) => { dits.push(t); setTimeout(fini, 0); return {}; },
                     taire: () => {} };
        D.reglages.longueur = 12; D.reglages.repetitions = 1;
        D.reglages.secondesParMot = 0; D.reglages.ponctuation = 'rien';
        D.reglages.marche = 'main';
        D.poserLeTexte('Un. Deux.');
        D.lancer('dictee');
        await new Promise(ok => setTimeout(ok, 400));
        const apresAttente = { dits: dits.slice(), rang: D.rang, attend: !!D.enAttenteDeLaMain };
        dits.length = 0;
        D.suivant();
        await new Promise(ok => setTimeout(ok, 200));
        const apresAppui = { dits: dits.slice(), rang: D.rang };
        D.arreter();
        D.reglages.marche = 'minuteur';
        D.moteur = vrai;
        return { apresAttente, apresAppui };
    });
    r.egal('à la main, la dictée s\'arrête après le groupe et attend',
        aLaMain.apresAttente, { dits: ['Un.'], rang: 0, attend: true });
    r.egal('et c\'est l\'appui qui la relance', aLaMain.apresAppui, { dits: ['Deux.'], rang: 1 });

    // ----------------------------------------------------------
    // LE TEXTE MASQUÉ
    //
    // La fenêtre est POSÉE SUR LE TABLEAU : afficher la dictée pendant la
    // séance, c'est la donner à recopier.
    // ----------------------------------------------------------
    const masque = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.texte = '';
        D.ouvrir();
        await new Promise(ok => setTimeout(ok, 150));
        const q = (s) => D.widgetEl.querySelector(s);
        const mots = D.texte.split(/\s+/).filter(Boolean);
        const lisible = () => (q('#dic-groupes').textContent || '')
            + ' ' + (getComputedStyle(q('#dic-texte')).display === 'none' ? '' : q('#dic-texte').value);
        const auDepart = {
            masque: D.reglages.masque,
            champCache: getComputedStyle(q('#dic-texte')).display === 'none',
            pastilles: q('#dic-groupes').querySelectorAll('.dic-pastille').length,
            groupes: D.groupes.length,
            resume: q('#dic-resume').textContent,
            rendu: lisible()
        };
        D.basculerLeMasque();
        const leve = { masque: D.reglages.masque, rendu: lisible(),
                       champVu: getComputedStyle(q('#dic-texte')).display !== 'none' };
        D.basculerLeMasque();
        // ET LE MASQUE SURVIT À UN REDESSIN : majEcran est appelée à chaque
        // groupe, elle ne doit pas rendre le texte en chemin.
        D.majEcran();
        const apresRedessin = { rendu: lisible(),
                                pastilles: q('#dic-groupes').querySelectorAll('.dic-pastille').length };
        const bouton = q('#dic-masque').textContent;
        D.fermer();
        return { auDepart, leve, apresRedessin, mots, bouton };
    });
    r.verifie('le texte d\'exemple a de quoi se trahir',
        masque.mots.length >= 8, String(masque.mots.length));
    r.egal('la fenêtre s\'ouvre texte masqué', masque.auDepart.masque, true);
    r.verifie('le champ est caché', masque.auDepart.champCache, JSON.stringify(masque.auDepart));
    r.egal('et les groupes ne sont que des numéros',
        masque.auDepart.pastilles, masque.auDepart.groupes);
    r.verifie('aucun mot de la dictée ne se lit',
        !masque.mots.some(m => m.length > 3 && masque.auDepart.rendu.includes(m)),
        masque.auDepart.rendu.slice(0, 120));
    r.verifie('le résumé dit ce qu\'on tient sans le montrer',
        /mots? · \d+ groupes? · /.test(masque.auDepart.resume), masque.auDepart.resume);
    r.verifie('et il annonce combien de temps la dictée prendra',
        /minute|moins d/.test(masque.auDepart.resume), masque.auDepart.resume);
    r.verifie('le bouton dit ce qu\'il fera', /afficher/i.test(masque.bouton), masque.bouton);
    r.verifie('levé, le texte se lit',
        masque.leve.champVu && masque.mots.some(m => masque.leve.rendu.includes(m)),
        masque.leve.rendu.slice(0, 120));
    r.verifie('remis, il se recache — et un redessin ne le trahit pas',
        !masque.mots.some(m => m.length > 3 && masque.apresRedessin.rendu.includes(m)),
        masque.apresRedessin.rendu.slice(0, 120));
    r.egal('les pastilles reviennent avec lui',
        masque.apresRedessin.pastilles, masque.auDepart.groupes);

    // SANS VOIX FRANÇAISE, ON LE DIT. Lire une dictée avec l'accent anglais
    // serait pire que de ne rien lire — et un silence sans explication passe
    // pour une panne de l'application.
    // serait pire que de ne rien lire — et un silence sans explication passe
    // pour une panne de l'application.
    const sansVoix = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.ouvrir();
        await new Promise(ok => setTimeout(ok, 150));
        const alerte = D.widgetEl.querySelector('#dic-sansvoix');
        const liste = D.widgetEl.querySelector('#dic-voix');
        const muette = { texte: alerte.textContent, vue: getComputedStyle(alerte).display !== 'none',
                         listeEteinte: liste.disabled };

        // Et avec une voix française, l'alerte s'en va et la voix se propose.
        const vrai = D.moteur;
        D.moteur = Object.assign({}, vrai, {
            disponible: () => true,
            voix: () => [{ name: 'Julie', lang: 'fr-FR' }, { name: 'Daniel', lang: 'en-GB' }]
        });
        D.majLesVoix();
        const avecVoix = { vue: getComputedStyle(alerte).display !== 'none',
                           texte: alerte.textContent,
                           options: [...liste.options].map(o => o.value),
                           choisie: D.voixChoisie().name };

        // UNE VOIX AMÉLIORÉE PASSE DEVANT LA VOIX COMPACTE, et le conseil
        // s'efface : il n'y a plus rien à conseiller.
        D.moteur = Object.assign({}, vrai, {
            disponible: () => true,
            voix: () => [{ name: 'Julie', lang: 'fr-FR' },
                         { name: 'Amélie (Premium)', lang: 'fr-FR' },
                         { name: 'Daniel', lang: 'en-GB' }]
        });
        D.majLesVoix();
        const avecPremium = { premiere: [...liste.options].map(o => o.value)[0],
                              etiquettePremiere: liste.options[0].textContent,
                              mot: D.widgetEl.querySelector('#dic-voix-mot').textContent,
                              choisie: D.voixChoisie().name,
                              conseil: getComputedStyle(alerte).display !== 'none' };

        // Le nom d'une voix vient du système d'exploitation : il peut porter
        // n'importe quoi. Posé en HTML, un chevron y ouvrirait une balise.
        D.moteur = Object.assign({}, vrai, {
            disponible: () => true,
            voix: () => [{ name: 'Voix « <b>Ré</b> » "grave"', lang: 'fr-FR' }]
        });
        D.majLesVoix();
        const tordu = { etiquette: liste.options[0].textContent,
                        valeur: liste.options[0].value,
                        balises: liste.querySelectorAll('b').length,
                        mot: D.widgetEl.querySelector('#dic-voix-mot').textContent };

        D.moteur = vrai;
        D.fermer();
        return { muette, avecVoix, avecPremium, tordu };
    });
    r.verifie('sans voix française, on le dit franchement',
        sansVoix.muette.vue && /voix française|lire à voix haute/i.test(sansVoix.muette.texte),
        JSON.stringify(sansVoix.muette));
    r.verifie('et la liste des voix est éteinte', sansVoix.muette.listeEteinte, '');
    // « ON NE COMPREND RIEN, LE SON EST NUL, TROP ROBOT. » La qualité ne vient
    // pas d'ici : elle vient de la voix installée. On le dit, plutôt que de
    // laisser croire que c'est la dictée qui lit mal.
    r.verifie('avec une voix compacte, on dit où en trouver une meilleure',
        sansVoix.avecVoix.vue && /améliorée|Gérer les voix/i.test(sansVoix.avecVoix.texte),
        sansVoix.avecVoix.texte);
    r.verifie('et l\'on précise que ce n\'est pas la dictée qui lit mal',
        /pas la dictée/i.test(sansVoix.avecVoix.texte), sansVoix.avecVoix.texte);
    r.egal('une voix améliorée passe devant la compacte',
        sansVoix.avecPremium.premiere, 'Amélie (Premium)');
    r.egal('et c\'est elle qu\'on prend d\'office',
        sansVoix.avecPremium.choisie, 'Amélie (Premium)');
    r.egal('le conseil s\'efface alors', sansVoix.avecPremium.conseil, false);
    r.egal('seules les voix françaises sont proposées',
        sansVoix.avecVoix.options, ['Julie']);
    r.egal('et c\'est celle-là qu\'on prend', sansVoix.avecVoix.choisie, 'Julie');
    // LE NOM, PUIS CE QUE LA VOIX VAUT. « On n'a pas la proposition des autres
    // voix » : la liste ne montrait que des noms, et l'on ne choisit pas entre
    // des noms qu'on ne connaît pas.
    r.verifie('un nom de voix biscornu s\'affiche tel quel',
        sansVoix.tordu.etiquette.startsWith('Voix « <b>Ré</b> » "grave"'),
        sansVoix.tordu.etiquette);
    r.verifie('et chaque voix dit ce qu\'elle vaut',
        / — (améliorée|du réseau|compacte|du système)$/.test(sansVoix.tordu.etiquette),
        sansVoix.tordu.etiquette);
    r.verifie('la meilleure est nommée « améliorée »',
        / — améliorée$/.test(sansVoix.avecPremium.etiquettePremiere || ''),
        sansVoix.avecPremium.etiquettePremiere);
    r.verifie('et l\'on dit combien il y en a',
        /voix françaises/.test(sansVoix.avecPremium.mot), sansVoix.avecPremium.mot);
    r.egal('et sa valeur reste entière', sansVoix.tordu.valeur, 'Voix « <b>Ré</b> » "grave"');
    r.egal('sans qu\'aucune balise ne s\'y ouvre', sansVoix.tordu.balises, 0);

    // Les réglages se retiennent d'une séance à l'autre : on ne refait pas les
    // curseurs à chaque dictée, ni le niveau de classe.
    const retenus = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.reglages.secondesParMot = 9; D.reglages.repetitions = 3; D.reglages.longueur = 5;
        D.reglages.ponctuation = 'tout'; D.reglages.niveau = 'ce1'; D.reglages.marche = 'main';
        // LE MASQUE, LUI, NE SE RETIENT PAS. On peut l'avoir levé hier pour
        // corriger ; le lever d'office aujourd'hui donnerait la dictée à
        // recopier avant qu'on s'en aperçoive.
        D.reglages.masque = false;
        D.ecrireLesReglages();
        D.reglages.secondesParMot = 0; D.reglages.repetitions = 1; D.reglages.longueur = 7;
        D.reglages.ponctuation = 'rien'; D.reglages.niveau = 'cm'; D.reglages.marche = 'minuteur';
        D.reglages.masque = true;
        D.lireLesReglages();
        return { curseurs: [D.reglages.secondesParMot, D.reglages.repetitions, D.reglages.longueur],
                 ponctuation: D.reglages.ponctuation, niveau: D.reglages.niveau,
                 marche: D.reglages.marche, masque: D.reglages.masque };
    });
    r.egal('les curseurs se retiennent', retenus.curseurs, [9, 3, 5]);
    r.egal('la position de la ponctuation aussi', retenus.ponctuation, 'tout');
    r.egal('et le niveau de classe', retenus.niveau, 'ce1');
    r.egal('et la façon de passer au groupe suivant', retenus.marche, 'main');
    r.egal('mais le masque revient toujours, lui', retenus.masque, true);

    // ==========================================================
    // CONJUGUEUR
    // Chaque forme ci-dessous a été vérifiée à la main. Une table fausse
    // au tableau vaut moins que pas de table du tout : ce test est la
    // seule chose qui autorise à faire confiance au moteur.
    // ==========================================================
const FORMES_DE_REFERENCE = [
    ['chanter', 'present', 'je chante|tu chantes|il chante|nous chantons|vous chantez|ils chantent'],
    ['chanter', 'imparfait', 'je chantais|tu chantais|il chantait|nous chantions|vous chantiez|ils chantaient'],
    ['chanter', 'futur', 'je chanterai|tu chanteras|il chantera|nous chanterons|vous chanterez|ils chanteront'],
    ['chanter', 'passeSimple', 'je chantai|tu chantas|il chanta|nous chantâmes|vous chantâtes|ils chantèrent'],
    ['chanter', 'conditionnel', 'je chanterais|tu chanterais|il chanterait|nous chanterions|vous chanteriez|ils chanteraient'],
    ['chanter', 'subjonctif', 'je chante|tu chantes|il chante|nous chantions|vous chantiez|ils chantent'],
    ['chanter', 'imperatif', 'chante|chantons|chantez'],
    ['chanter', 'passeCompose', 'j\'ai chanté|tu as chanté|il a chanté|nous avons chanté|vous avez chanté|ils ont chanté'],
    ['chanter', 'plusQueParfait', 'j\'avais chanté|tu avais chanté|il avait chanté|nous avions chanté|vous aviez chanté|ils avaient chanté'],

    // Accidents d'orthographe du 1er groupe
    ['manger', 'present', 'je mange|tu manges|il mange|nous mangeons|vous mangez|ils mangent'],
    ['manger', 'imparfait', 'je mangeais|tu mangeais|il mangeait|nous mangions|vous mangiez|ils mangeaient'],
    ['manger', 'passeSimple', 'je mangeai|tu mangeas|il mangea|nous mangeâmes|vous mangeâtes|ils mangèrent'],
    ['commencer', 'present', 'je commence|tu commences|il commence|nous commençons|vous commencez|ils commencent'],
    ['commencer', 'imparfait', 'je commençais|tu commençais|il commençait|nous commencions|vous commenciez|ils commençaient'],
    ['commencer', 'passeSimple', 'je commençai|tu commenças|il commença|nous commençâmes|vous commençâtes|ils commencèrent'],
    ['appeler', 'present', 'j\'appelle|tu appelles|il appelle|nous appelons|vous appelez|ils appellent'],
    ['appeler', 'futur', 'j\'appellerai|tu appelleras|il appellera|nous appellerons|vous appellerez|ils appelleront'],
    ['jeter', 'present', 'je jette|tu jettes|il jette|nous jetons|vous jetez|ils jettent'],
    ['acheter', 'present', 'j\'achète|tu achètes|il achète|nous achetons|vous achetez|ils achètent'],
    ['acheter', 'futur', 'j\'achèterai|tu achèteras|il achètera|nous achèterons|vous achèterez|ils achèteront'],
    ['mener', 'present', 'je mène|tu mènes|il mène|nous menons|vous menez|ils mènent'],
    ['espérer', 'present', 'j\'espère|tu espères|il espère|nous espérons|vous espérez|ils espèrent'],
    ['nettoyer', 'present', 'je nettoie|tu nettoies|il nettoie|nous nettoyons|vous nettoyez|ils nettoient'],
    ['nettoyer', 'futur', 'je nettoierai|tu nettoieras|il nettoiera|nous nettoierons|vous nettoierez|ils nettoieront'],

    // 2e groupe
    ['finir', 'present', 'je finis|tu finis|il finit|nous finissons|vous finissez|ils finissent'],
    ['finir', 'imparfait', 'je finissais|tu finissais|il finissait|nous finissions|vous finissiez|ils finissaient'],
    ['finir', 'passeSimple', 'je finis|tu finis|il finit|nous finîmes|vous finîtes|ils finirent'],
    ['finir', 'imperatif', 'finis|finissons|finissez'],

    // 3e groupe en -dre
    ['vendre', 'present', 'je vends|tu vends|il vend|nous vendons|vous vendez|ils vendent'],
    ['attendre', 'futur', 'j\'attendrai|tu attendras|il attendra|nous attendrons|vous attendrez|ils attendront'],
    ['vendre', 'passeCompose', 'j\'ai vendu|tu as vendu|il a vendu|nous avons vendu|vous avez vendu|ils ont vendu'],

    // Irréguliers
    ['être', 'present', 'je suis|tu es|il est|nous sommes|vous êtes|ils sont'],
    ['être', 'imparfait', 'j\'étais|tu étais|il était|nous étions|vous étiez|ils étaient'],
    ['être', 'conditionnel', 'je serais|tu serais|il serait|nous serions|vous seriez|ils seraient'],
    ['être', 'imperatif', 'sois|soyons|soyez'],
    ['avoir', 'present', 'j\'ai|tu as|il a|nous avons|vous avez|ils ont'],
    ['avoir', 'subjonctif', 'j\'aie|tu aies|il ait|nous ayons|vous ayez|ils aient'],
    ['aller', 'present', 'je vais|tu vas|il va|nous allons|vous allez|ils vont'],
    ['aller', 'passeCompose', 'je suis allé(e)|tu es allé(e)|il est allé(e)|nous sommes allé(e)s|vous êtes allé(e)s|ils sont allé(e)s'],
    ['faire', 'present', 'je fais|tu fais|il fait|nous faisons|vous faites|ils font'],
    ['dire', 'present', 'je dis|tu dis|il dit|nous disons|vous dites|ils disent'],
    ['pouvoir', 'futur', 'je pourrai|tu pourras|il pourra|nous pourrons|vous pourrez|ils pourront'],
    ['prendre', 'present', 'je prends|tu prends|il prend|nous prenons|vous prenez|ils prennent'],
    ['venir', 'passeSimple', 'je vins|tu vins|il vint|nous vînmes|vous vîntes|ils vinrent'],
    ['voir', 'conditionnel', 'je verrais|tu verrais|il verrait|nous verrions|vous verriez|ils verraient'],
    ['recevoir', 'present', 'je reçois|tu reçois|il reçoit|nous recevons|vous recevez|ils reçoivent'],

    // Composés : ils suivent leur base
    ['comprendre', 'present', 'je comprends|tu comprends|il comprend|nous comprenons|vous comprenez|ils comprennent'],
    ['apprendre', 'futur', 'j\'apprendrai|tu apprendras|il apprendra|nous apprendrons|vous apprendrez|ils apprendront'],
    ['revenir', 'present', 'je reviens|tu reviens|il revient|nous revenons|vous revenez|ils reviennent'],
    ['revenir', 'passeCompose', 'je suis revenu(e)|tu es revenu(e)|il est revenu(e)|nous sommes revenu(e)s|vous êtes revenu(e)s|ils sont revenu(e)s'],
    ['permettre', 'present', 'je permets|tu permets|il permet|nous permettons|vous permettez|ils permettent'],
    ['revoir', 'futur', 'je reverrai|tu reverras|il reverra|nous reverrons|vous reverrez|ils reverront'],
    ['décrire', 'present', 'je décris|tu décris|il décrit|nous décrivons|vous décrivez|ils décrivent'],

    // Ce qu'il refuse plutôt que d'inventer
    ['cueillir', 'present', 'ERREUR'],
    ['peindre', 'present', 'ERREUR'],
    ['prévoir', 'futur', 'ERREUR'],
    ['contredire', 'present', 'ERREUR'],
    ['haïr', 'present', 'ERREUR'],
    ['résoudre', 'present', 'ERREUR']
];

    const conj = await page.evaluate((cas) => cas.map(([v, t, attendu]) => {
        const r = Conjugaison.conjuguer(v, t);
        const obtenu = r.erreur ? 'ERREUR: ' + r.erreur
            : r.lignes.map(l => (l.pronom ? l.pronom + (l.pronom.endsWith("'") ? '' : ' ') : '') + l.forme).join('|');
        const ok = attendu === 'ERREUR' ? obtenu.startsWith('ERREUR') : obtenu === attendu;
        return { v, t, attendu, obtenu, ok };
    }), FORMES_DE_REFERENCE);

    const fausses = conj.filter(x => !x.ok);
    r.verifie(`les ${conj.length} conjugaisons de référence sont justes`,
        fausses.length === 0,
        fausses.slice(0, 3).map(x => `${x.v}/${x.t} → ${x.obtenu}`).join('  ///  '));

    // Le découpage radical / terminaison, celui qu'on met en couleur
    const coupe = await page.evaluate(() => {
        const decoupe = (v, t) => {
            const r = Conjugaison.conjuguer(v, t);
            return Conjugaison.couperTerminaisons(r.lignes.map(l => l.forme))
                .map(c => c.radical + '|' + c.terminaison);
        };
        return { chanter: decoupe('chanter', 'present'), etre: decoupe('être', 'present') };
    });
    r.egal('les terminaisons se détachent du radical commun', coupe.chanter,
        ['chant|e', 'chant|es', 'chant|e', 'chant|ons', 'chant|ez', 'chant|ent']);
    r.verifie('sur « être », rien n\'est commun — et c\'est ce qu\'il faut montrer',
        coupe.etre.every(c => c.startsWith('|')), JSON.stringify(coupe.etre));

    // Le tampon : une table lisible, ou un refus explicite
    const tampon = await page.evaluate(() => {
        const P = PluginManager.plugins['conjugueurTool'];
        const svgOk = P.genererSVG(['chanter', 'present', 'couleur', '#0984e3'], true);
        const svgNon = P.genererSVG(['cueillir', 'present', 'couleur', '#0984e3'], true);
        const svgMasque = P.genererSVG(['finir', 'imparfait', 'masquees', '#d63031'], true);
        return {
            titre: /chanter — Présent/.test(svgOk),
            sixLignes: (svgOk.match(/<text x="80"/g) || []).length,
            terminaisonEnCouleur: /<tspan fill="#0984e3" font-weight="bold">ons<\/tspan>/.test(svgOk),
            refus: /Verbe non conjugué/.test(svgNon),
            masque: /<tspan fill="#b2bec3">\.{3}<\/tspan>/.test(svgMasque),
            pasDeFormeInventee: !/cueill/.test(svgNon)
        };
    });
    r.verifie('le tampon porte le verbe et le temps', tampon.titre);
    r.egal('et les six personnes', tampon.sixLignes, 6);
    r.verifie('la terminaison est détachée en couleur', tampon.terminaisonEnCouleur);
    r.verifie('un verbe hors table donne un refus, pas une table',
        tampon.refus && tampon.pasDeFormeInventee);
    r.verifie('le mode « masquées » remplace la terminaison par des points', tampon.masque);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
