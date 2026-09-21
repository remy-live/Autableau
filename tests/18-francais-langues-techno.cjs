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

    // Les gestes : deux clics désignent un groupe, un troisième se ravise
    const gestes = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = []; P.debutChoisi = P.finChoisie = null;
        P.peindre();
        const mot = (i) => P.widgetEl.querySelector(`.ag-mot[data-i="${i}"]`);
        mot(2).click();
        const unSeul = { de: P.debutChoisi, a: P.finChoisie,
                         peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length };
        mot(5).click();
        const etendu = P.widgetEl.querySelectorAll('.ag-mot.choisi').length;
        // On étiquette, la sélection se relâche
        P.etiqueter('COD', '#00b894');
        const apres = { sel: P.debutChoisi, n: P.analyses.length,
                        peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length };
        // Le crochet se retire d'un clic
        P.widgetEl.querySelector('.ag-trait').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const retire = P.analyses.length;
        // Reclic sur le même mot : on se ravise
        mot(1).click(); mot(1).click();
        return { unSeul, etendu, apres, retire, apresRavis: P.debutChoisi };
    });
    r.egal('un premier clic désigne un mot', [gestes.unSeul.de, gestes.unSeul.a], [2, 2]);
    r.egal('et le peint', gestes.unSeul.peints, 1);
    r.egal('le second clic étend le groupe', gestes.etendu, 4);
    r.egal('étiqueter pose l\'analyse', gestes.apres.n, 1);
    r.verifie('et relâche la sélection',
        gestes.apres.sel === null && gestes.apres.peints === 0, JSON.stringify(gestes.apres));
    r.egal('un clic sur le crochet le retire', gestes.retire, 0);
    r.verifie('recliquer le même mot annule la sélection', gestes.apresRavis === null);

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
    // LE LECTEUR DE DICTÉE
    //
    // « Tu penses que tu pourrais faire un lecteur de dictée avec plusieurs
    // paramètres pour permettre une première lecture, lire par groupe, etc. ? »
    //
    // CETTE MACHINE N'A AUCUNE VOIX — l'API est là, la liste est vide. C'est
    // justement ce qui oblige à tout faire passer par un moteur qu'on peut
    // remplacer : le découpage, l'enchaînement, les répétitions et les pauses
    // s'éprouvent ici, et le son se juge sur la machine du professeur.
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
            espaces: D.decouperEnGroupes('  Le   chat\n\ndort.  ', 12)
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
    r.egal('les espaces et les retours à la ligne ne font pas de groupes fantômes',
        decoupe.espaces, ['Le chat dort.']);

    // L'ENCHAÎNEMENT, AVEC UN MOTEUR QU'ON REMPLACE. On note ce qui est dit et
    // l'on rend la main aussitôt : ce qu'on éprouve, c'est l'ordre des
    // groupes, les répétitions et les pauses, pas la voix.
    const enchaine = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = {
            disponible: () => true,
            voix: () => [],
            dire: (texte, opts, fini) => { dits.push(texte); setTimeout(fini, 0); },
            taire: () => { /* on ne note que ce qui est DIT */ }
        };
        D.texte = 'Un deux. Trois quatre. Cinq six.';
        D.reglages.longueur = 12; D.reglages.pause = 0; D.reglages.repetitions = 2;
        D.groupes = D.decouperEnGroupes(D.texte, D.reglages.longueur);

        D.lancer('dictee');
        // Six lectures séparées par les six dixièmes de seconde qui tiennent
        // deux répétitions à distance : on laisse la suite se dérouler.
        await new Promise(ok => setTimeout(ok, 4500));
        const enDictee = dits.slice();

        dits.length = 0;
        D.lancer('ensemble');
        await new Promise(ok => setTimeout(ok, 500));
        const enEnsemble = dits.slice();

        D.moteur = vrai;
        return { enDictee, enEnsemble, phase: D.phase };
    });
    r.egal('la dictée dit chaque groupe deux fois, dans l\'ordre',
        enchaine.enDictee,
        ['Un deux.', 'Un deux.', 'Trois quatre.', 'Trois quatre.', 'Cinq six.', 'Cinq six.']);
    r.egal('la lecture d\'ensemble ne répète rien',
        enchaine.enEnsemble, ['Un deux.', 'Trois quatre.', 'Cinq six.']);
    r.egal('et l\'on s\'arrête au bout', enchaine.phase, 'arret');

    // « REDITES » RECOMMENCE LE GROUPE, ses répétitions comprises : c'est le
    // geste de l'élève qui n'a pas entendu, et il ne doit pas le priver de la
    // seconde lecture qu'auront les autres.
    const commandes = await page.evaluate(async () => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        const vrai = D.moteur;
        const dits = [];
        D.moteur = { disponible: () => true, voix: () => [],
                     dire: (t, o, fini) => { dits.push(t); D.__fini = fini; },
                     taire: () => {} };
        D.texte = 'Un deux. Trois quatre. Cinq six.';
        D.reglages.longueur = 12; D.reglages.pause = 0; D.reglages.repetitions = 2;
        D.groupes = D.decouperEnGroupes(D.texte, D.reglages.longueur);
        D.lancer('dictee');                 // dit « Un deux. », attend la fin
        const auDepart = { rang: D.rang, restantes: D.restantes };

        dits.length = 0;
        D.redire();
        const apresRedites = { dits: dits.slice(), restantes: D.restantes };

        dits.length = 0;
        D.allerAuGroupe(2);
        const apresSaut = { dits: dits.slice(), rang: D.rang };

        const enPause = D.basculerLaPause();
        const reprise = D.basculerLaPause();

        D.arreter();
        D.moteur = vrai;
        return { auDepart, apresRedites, apresSaut, enPause, reprise, phaseFinale: D.phase };
    });
    r.egal('la dictée part sur le premier groupe, avec ses deux lectures',
        commandes.auDepart, { rang: 0, restantes: 2 });
    r.egal('« Redites » redit le groupe en cours', commandes.apresRedites.dits, ['Un deux.']);
    r.egal('et lui rend ses deux lectures', commandes.apresRedites.restantes, 2);
    r.egal('on saute au groupe qu\'on désigne', commandes.apresSaut.dits, ['Cinq six.']);
    r.egal('et le rang suit', commandes.apresSaut.rang, 2);
    r.egal('la pause s\'allume et s\'éteint', [commandes.enPause, commandes.reprise], [true, false]);
    r.egal('arrêter rend la main', commandes.phaseFinale, 'arret');

    // SANS VOIX FRANÇAISE, ON LE DIT. Lire une dictée avec l'accent anglais
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
                        balises: liste.querySelectorAll('b').length };

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
    r.egal('un nom de voix biscornu s\'affiche tel quel',
        sansVoix.tordu.etiquette, 'Voix « <b>Ré</b> » "grave"');
    r.egal('et sa valeur reste entière', sansVoix.tordu.valeur, 'Voix « <b>Ré</b> » "grave"');
    r.egal('sans qu\'aucune balise ne s\'y ouvre', sansVoix.tordu.balises, 0);

    // Les réglages se retiennent d'une séance à l'autre : on ne refait pas les
    // quatre curseurs à chaque dictée.
    const retenus = await page.evaluate(() => {
        const D = PluginManager.plugins['lecteurDicteeTool'];
        D.reglages.pause = 9; D.reglages.repetitions = 3; D.reglages.longueur = 5;
        D.ecrireLesReglages();
        D.reglages.pause = 0; D.reglages.repetitions = 1; D.reglages.longueur = 7;
        D.lireLesReglages();
        return [D.reglages.pause, D.reglages.repetitions, D.reglages.longueur];
    });
    r.egal('les réglages se retiennent', retenus, [9, 3, 5]);

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
