// LES BLOCS DE L'ATELIER SCRATCH, ET CE QU'ILS FONT VRAIMENT.
//
// « Le bloc dire ne fait rien dire au chat, vérifie les blocs et leur
// exécution dans le plugin Scratch. »
//
// Le programme n'est pas joué : il est JOUÉ PUIS REJOUÉ. L'interprète le
// déroule d'abord sans rien afficher, en notant un instantané de la scène par
// bloc, puis rejoue ces instantanés à la vitesse du curseur. Tout ce qui DURE
// tombait donc dans le trou entre deux instantanés : la bulle de « dire » était
// posée et retirée avant que la scène ne soit notée, et le chat restait muet
// d'un bout à l'autre du film. C'est le défaut qui a ouvert cette suite.
//
// CE QU'ELLE TIENT :
//
//   — AUCUN bloc de la palette n'est ignoré par l'interprète. Le contrôle ne
//     se fait pas sur une liste tenue à côté : c'est la palette elle-même
//     qu'on déroule, bloc par bloc, et l'interprète tient le registre de ce
//     qu'il n'a pas su faire ;
//   — ce qui dure dure : la bulle reste le temps demandé, l'attente marque
//     le pas, et le son se fait entendre à la relecture — pas au démarrage ;
//   — chaque famille fait ce qu'elle annonce : le mouvement déplace, le stylo
//     trace, les variables comptent, les opérateurs calculent, le contrôle
//     répète et choisit, et le capteur du bord dit vrai au bord.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Atelier Scratch');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1360, height: 860 } });
    await page.waitForFunction(() => typeof ScratchInterpreter === 'function', { timeout: 25000 });

    // Un petit atelier de laboratoire : on fabrique des blocs comme le fait
    // l'interface, mais sans elle — c'est l'EXÉCUTION qu'on regarde ici.
    await page.evaluate(() => {
        window.scAtelier = {
            bloc(def, valeurs) {
                const vals = (valeurs || []).slice();
                const b = { id: 'b' + Math.random(), def, parts: [], next: null,
                            child: null, child2: null, parent: null };
                b.parts = def.parts.map(p => (typeof p === 'object')
                    ? { type: 'input', spec: { val: vals.length ? vals.shift() : p.v } }
                    : { type: 'label' });
                return b;
            },
            // Enchaîner des blocs sous un chapeau, et jouer le tout.
            async jouer(suite) {
                const cv = document.createElement('canvas');
                cv.width = 480; cv.height = 360;
                const i = new ScratchInterpreter(cv, { allBlocks: [] });
                for (let k = 0; k < suite.length - 1; k++) suite[k].next = suite[k + 1];
                await i.start(suite);
                i.stop();
                return i;
            },
            def(cherche) {
                const lib = PluginManager.plugins['scratchBlocksTool'].BLOCK_LIBRARY;
                return lib.find(d => d.parts.filter(p => typeof p === 'string').join(' ') === cherche);
            },
            drapeau() { return window.scAtelier.def('quand le drapeau vert est cliqué'); }
        };
    });

    // =====================================================================
    // AUCUN BLOC DE LA PALETTE N'EST IGNORÉ
    // C'est la palette qui fait foi, pas une liste tenue à côté : un bloc
    // ajouté demain sans branche dans l'interprète fera tomber ce contrôle.
    // =====================================================================
    const palette = await page.evaluate(async () => {
        const lib = PluginManager.plugins['scratchBlocksTool'].BLOCK_LIBRARY;
        const aExecuter = lib.filter(d => d.type !== 'reporter' && d.type !== 'boolean' && d.type !== 'hat');
        const inconnus = [];
        // « DEMANDER » ATTEND UNE RÉPONSE, et personne n'est là pour la donner.
        // L'interprète déroule le programme AVANT de le rejouer : la question
        // se pose donc pendant le calcul, fenêtre ouverte, et le contrôle
        // resterait là jusqu'à la fin des temps. On répond à sa place.
        const vraiDemander = window.demanderUneLigne;
        window.demanderUneLigne = () => Promise.resolve('Camille');
        for (const def of aExecuter) {
            const i = await window.scAtelier.jouer([
                window.scAtelier.bloc(window.scAtelier.drapeau()),
                window.scAtelier.bloc(def)
            ]);
            (i.blocsInconnus || []).forEach(t => { if (!inconnus.includes(t)) inconnus.push(t); });
        }
        window.demanderUneLigne = vraiDemander;
        return { combien: aExecuter.length, inconnus,
                 familles: [...new Set(lib.map(d => d.cat))].sort() };
    });
    r.verifie('la palette propose au moins vingt-cinq blocs à exécuter',
        palette.combien >= 25, JSON.stringify({ combien: palette.combien }));
    r.egal('et l\'interprète les connaît TOUS : aucun bloc posé pour rien',
        palette.inconnus, []);
    // ET LE REGISTRE EST VRAI DANS L'AUTRE SENS AUSSI : un bloc que l'interprète
    // ne connaît pas doit y paraître. Sans cette moitié-là, le contrôle
    // ci-dessus se contenterait d'un registre qui ne note jamais rien.
    const inventé = await page.evaluate(async () => {
        const a = window.scAtelier;
        const i = await a.jouer([a.bloc(a.drapeau()),
            a.bloc({ cat: 'motion', type: 'command', parts: ['danser la gigue'] })]);
        return i.blocsInconnus;
    });
    r.egal('un bloc inconnu, lui, est bel et bien signalé', inventé, ['danser la gigue']);

    r.egal('les neuf familles de Scratch sont là',
        palette.familles,
        ['control', 'events', 'looks', 'motion', 'operators', 'pen', 'sensing', 'sound', 'variables']);

    // =====================================================================
    // CE QUI DURE DURE
    // =====================================================================
    const parole = await page.evaluate(async () => {
        const a = window.scAtelier;
        const i = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def('dire pendant secondes'), ['Bonjour !', '2'])
        ]);
        const bulles = i.history.filter(h => h.sprite.say === 'Bonjour !').length;
        return { images: i.history.length, bulles,
                 dits: [...new Set(i.history.map(h => h.sprite.say))],
                 // Elle est retirée à la fin : le bloc dit « pendant ».
                 finale: i.history[i.history.length - 1].sprite.say };
    });
    r.verifie('« dire pendant 2 secondes » fait vraiment parler le chat',
        parole.bulles > 0, JSON.stringify(parole));
    r.verifie('et la bulle tient à peu près les deux secondes demandées',
        parole.bulles >= 10 && parole.bulles <= 16, JSON.stringify(parole));
    r.egal('puis elle s\'efface, comme le bloc l\'annonce', parole.finale, null);

    const paroleSansFin = await page.evaluate(async () => {
        const a = window.scAtelier;
        const i = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def('dire'), ['Je réfléchis…']),
            a.bloc(a.def('avancer de pas'), ['50']),
            a.bloc(a.def('dire'), [''])
        ]);
        const h = i.history;
        return { pendant: h.some(e => e.sprite.say === 'Je réfléchis…'),
                 finale: h[h.length - 1].sprite.say };
    });
    r.verifie('« dire » sans durée laisse la bulle pendant que le chat avance',
        paroleSansFin.pendant, JSON.stringify(paroleSansFin));
    r.egal('et « dire » avec un texte vide l\'efface', paroleSansFin.finale, null);

    const attente = await page.evaluate(async () => {
        const a = window.scAtelier;
        const court = await a.jouer([a.bloc(a.drapeau()), a.bloc(a.def('attendre secondes'), ['0'])]);
        const long = await a.jouer([a.bloc(a.drapeau()), a.bloc(a.def('attendre secondes'), ['3'])]);
        return { court: court.history.length, long: long.history.length };
    });
    r.verifie('« attendre 3 secondes » marque vraiment le pas dans le film',
        attente.long > attente.court + 10, JSON.stringify(attente));

    // LE SON SE FAIT ENTENDRE À LA RELECTURE, pas pendant que l'interprète
    // déroule le programme : tous les sons du script partaient d'un coup, au
    // démarrage, avant que la scène ait bougé d'un pixel.
    const son = await page.evaluate(async () => {
        const a = window.scAtelier;
        const messages = [];
        const vrai = window.showToast;
        window.showToast = (t) => { messages.push(String(t)); };
        const i = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def('avancer de pas'), ['40']),
            a.bloc(a.def("jouer le son jusqu'au bout"), ['Miaou'])
        ]);
        const pendantLeCalcul = messages.filter(m => /Miaou/.test(m)).length;
        // On rejoue le film à la main, image par image.
        i.history.forEach((_, k) => i.applyState(k));
        const aLaRelecture = messages.filter(m => /Miaou/.test(m)).length;
        window.showToast = vrai;
        return { pendantLeCalcul, aLaRelecture,
                 porteuses: i.history.filter(h => h.sprite.son === 'Miaou').length };
    });
    r.egal('le son ne part pas pendant que l\'interprète calcule', son.pendantLeCalcul, 0);
    r.egal('il se fait entendre à la relecture, et UNE seule fois', son.aLaRelecture, 1);
    r.verifie('le film porte bien le son sur ses images', son.porteuses > 0, JSON.stringify(son));

    // =====================================================================
    // LES COSTUMES : « basculer sur le costume » ne faisait rien du tout
    // =====================================================================
    const costumes = await page.evaluate(async () => {
        const a = window.scAtelier;
        const parNom = await a.jouer([
            a.bloc(a.drapeau()), a.bloc(a.def('basculer sur le costume'), ['costume3'])]);
        const parRang = await a.jouer([
            a.bloc(a.drapeau()), a.bloc(a.def('basculer sur le costume'), ['2'])]);
        // Un nom inconnu ne laisse pas le bloc sans effet : on passe au suivant.
        const inconnu = await a.jouer([
            a.bloc(a.drapeau()), a.bloc(a.def('basculer sur le costume'), ['pyjama'])]);
        const dernier = (i) => i.history[i.history.length - 1].sprite.costume;
        return { nom: dernier(parNom), rang: dernier(parRang), inconnu: dernier(inconnu),
                 combien: parNom.COSTUMES.length,
                 dessines: parNom.COSTUMES.every(n => !!parNom.costumeImgs[n]) };
    });
    r.egal('le chat a trois costumes, et chacun a son image',
        { combien: costumes.combien, dessines: costumes.dessines }, { combien: 3, dessines: true });
    r.egal('on bascule par son nom, par son rang, et un nom inconnu prend le suivant',
        costumes, { nom: 'costume3', rang: 'costume2', inconnu: 'costume2',
                    combien: 3, dessines: true });

    // =====================================================================
    // LE MOUVEMENT, LE STYLO
    // =====================================================================
    const geometrie = await page.evaluate(async () => {
        const a = window.scAtelier;
        const carre = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def('effacer tout')),
            a.bloc(a.def('aller à x: y:'), ['0', '0']),
            a.bloc(a.def("s'orienter à"), ['90']),
            a.bloc(a.def("stylo en position d'écriture")),
            (() => {
                const rep = a.bloc(a.def('répéter fois'), ['4']);
                const av = a.bloc(a.def('avancer de pas'), ['100']);
                const to = a.bloc(a.def('tourner ↻ de degrés'), ['90']);
                av.next = to; rep.child = av;
                return rep;
            })(),
            a.bloc(a.def('relever le stylo'))
        ]);
        const fin = carre.history[carre.history.length - 1];
        const traits = fin.penPaths.reduce((n, p) => n + p.lines.length, 0);
        return { traits, x: Math.round(fin.sprite.x), y: Math.round(fin.sprite.y),
                 dir: fin.sprite.dir, stylo: fin.pen.down };
    });
    r.egal('quatre « avancer » et quatre « tourner » tracent un carré fermé',
        { traits: geometrie.traits, x: geometrie.x, y: geometrie.y },
        { traits: 4, x: 0, y: 0 });
    r.egal('et le stylo est relevé à la fin', geometrie.stylo, false);

    const stylo = await page.evaluate(async () => {
        const a = window.scAtelier;
        const i = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def("stylo en position d'écriture")),
            a.bloc(a.def('mettre la couleur du stylo à'), ['#e74c3c']),
            a.bloc(a.def('mettre la taille du stylo à'), ['4']),
            a.bloc(a.def('avancer de pas'), ['60']),
            a.bloc(a.def('ajouter à la taille du stylo'), ['6']),
            a.bloc(a.def('avancer de pas'), ['60'])
        ]);
        const fin = i.history[i.history.length - 1];
        const traces = fin.penPaths.filter(p => p.lines.length);
        const efface = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def("stylo en position d'écriture")),
            a.bloc(a.def('avancer de pas'), ['60']),
            a.bloc(a.def('effacer tout'))
        ]);
        return { couleurs: [...new Set(traces.map(p => p.color))],
                 tailles: traces.map(p => p.size),
                 apresEffacement: efface.history[efface.history.length - 1].penPaths.length };
    });
    r.egal('la couleur et la taille du stylo prennent effet sur le tracé',
        { couleurs: stylo.couleurs, tailles: stylo.tailles },
        { couleurs: ['#e74c3c'], tailles: [4, 10] });
    r.egal('« effacer tout » efface tout', stylo.apresEffacement, 0);

    // =====================================================================
    // LES VARIABLES, LES OPÉRATEURS, LE CONTRÔLE, LE CAPTEUR
    // =====================================================================
    const compte = await page.evaluate(async () => {
        const a = window.scAtelier;
        const i = await a.jouer([
            a.bloc(a.drapeau()),
            a.bloc(a.def('mettre à'), ['var', '5']),
            (() => {
                const rep = a.bloc(a.def('répéter fois'), ['3']);
                rep.child = a.bloc(a.def('ajouter à'), ['2', 'var']);
                return rep;
            })()
        ]);
        return i.history[i.history.length - 1].vars['var'];
    });
    r.egal('« mettre à 5 » puis trois fois « ajouter 2 » donne 11', compte, 11);

    const calculs = await page.evaluate(async () => {
        const a = window.scAtelier;
        const cv = document.createElement('canvas'); cv.width = 480; cv.height = 360;
        const i = new ScratchInterpreter(cv, { allBlocks: [] });
        const lire = async (nom, vals) => i.evalReporter(a.bloc(a.def(nom), vals));
        const alea = [];
        for (let k = 0; k < 40; k++) alea.push(await lire('nombre aléatoire entre et', ['1', '6']));
        return {
            plus: await lire('+', ['3', '4']),
            moins: await lire('-', ['10', '4']),
            fois: await lire('*', ['6', '7']),
            sup: await lire('>', ['80', '50']),
            inf: await lire('<', ['80', '50']),
            egal: await lire('=', ['50', '50']),
            et: await lire('et', [true, false]),
            ou: await lire('ou', [true, false]),
            colle: await lire('regrouper et', ['bon', 'jour']),
            aleaDansLesBornes: alea.every(v => v >= 1 && v <= 6),
            aleaVarie: new Set(alea).size > 1
        };
    });
    r.egal('les opérateurs calculent',
        { plus: calculs.plus, moins: calculs.moins, fois: calculs.fois, colle: calculs.colle },
        { plus: 7, moins: 6, fois: 42, colle: 'bonjour' });
    r.egal('et les comparaisons répondent',
        { sup: calculs.sup, inf: calculs.inf, egal: calculs.egal, et: calculs.et, ou: calculs.ou },
        { sup: true, inf: false, egal: true, et: false, ou: true });
    r.verifie('« nombre aléatoire entre 1 et 6 » tient dans ses bornes, et varie',
        calculs.aleaDansLesBornes && calculs.aleaVarie, JSON.stringify(calculs));

    const choix = await page.evaluate(async () => {
        const a = window.scAtelier;
        const avecSi = async (condition) => {
            const si = a.bloc(a.def('si alors sinon'), [condition]);
            si.child = a.bloc(a.def('aller à x: y:'), ['100', '0']);
            si.child2 = a.bloc(a.def('aller à x: y:'), ['-100', '0']);
            const i = await a.jouer([a.bloc(a.drapeau()), si]);
            return Math.round(i.history[i.history.length - 1].sprite.x);
        };
        // « si » seul : rien ne se passe quand la condition est fausse.
        const siSeul = async (condition) => {
            const si = a.bloc(a.def('si alors'), [condition]);
            si.child = a.bloc(a.def('avancer de pas'), ['70']);
            const i = await a.jouer([a.bloc(a.drapeau()), si]);
            return Math.round(i.history[i.history.length - 1].sprite.x);
        };
        return { vrai: await avecSi(true), faux: await avecSi(false),
                 seulVrai: await siSeul(true), seulFaux: await siSeul(false) };
    });
    r.egal('« si … alors … sinon » prend la bonne branche',
        { vrai: choix.vrai, faux: choix.faux }, { vrai: 100, faux: -100 });
    r.egal('et « si » seul n\'agit que si la condition est vraie',
        { vrai: choix.seulVrai, faux: choix.seulFaux }, { vrai: 70, faux: 0 });

    const bord = await page.evaluate(async () => {
        const a = window.scAtelier;
        const cv = document.createElement('canvas'); cv.width = 480; cv.height = 360;
        const i = new ScratchInterpreter(cv, { allBlocks: [] });
        const capteur = a.bloc(a.def('touche le bord ?'));
        i.sprite.x = 0; i.sprite.y = 0;
        const auMilieu = await i.evalReporter(capteur);
        i.sprite.x = 235;
        const aDroite = await i.evalReporter(capteur);
        i.sprite.x = 0; i.sprite.y = -175;
        const enBas = await i.evalReporter(capteur);
        return { auMilieu, aDroite, enBas };
    });
    r.egal('« touche le bord ? » dit non au milieu et oui aux bords',
        bord, { auMilieu: false, aDroite: true, enBas: true });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));

    // « INDÉFINIMENT » NE FIGEAIT PAS LA PAGE : IL LA FIGEAIT VRAIMENT. Le
    // programme est déroulé d'un trait avant d'être rejoué, et le plafond de
    // deux mille pas se comptait dans les blocs EXÉCUTÉS. Une boucle sans rien
    // dedans n'en exécute aucun : elle tournait sans fin, sans rendu et sans
    // rendre la main — il ne restait qu'à fermer l'onglet. Or une boucle vide
    // est exactement ce qu'un élève pose en premier.
    //
    // CE CONTRÔLE SE TIENT DEPUIS NODE, et il vient EN DERNIER. Une page qui
    // se fige ne peut pas se réveiller elle-même : ni minuteur ni promesse n'y
    // reprennent la main, la file des tâches est affamée. C'est donc d'ici
    // qu'on compte, et l'on n'a plus rien à lui demander après.
    const avantQueLaPageNeGele = (promesse, ms) => Promise.race([
        promesse.catch(e => ({ panne: String(e).slice(0, 80) })),
        new Promise(ok => setTimeout(() => ok({ gele: true }), ms))
    ]);
    const sansFin = await avantQueLaPageNeGele(page.evaluate(async () => {
        const a = window.scAtelier;
        const avec = a.bloc(a.def('indéfiniment'));
        avec.child = a.bloc(a.def('avancer de pas'), ['1']);
        const pleine = await a.jouer([a.bloc(a.drapeau()), avec]);
        const vide = await a.jouer([a.bloc(a.drapeau()), a.bloc(a.def('indéfiniment'))]);
        return { pas: pleine.stepCount, arrete: pleine.isRunning === false,
                 videPas: vide.stepCount, videArretee: vide.isRunning === false };
    }), 20000);
    r.verifie('« indéfiniment » avec un contenu s\'arrête au plafond',
        !sansFin.gele && sansFin.arrete && sansFin.pas > 100 && sansFin.pas <= 2100,
        JSON.stringify(sansFin));
    r.verifie('et une boucle VIDE rend la main elle aussi, au lieu de figer la page',
        !sansFin.gele && sansFin.videArretee && sansFin.videPas > 100 && sansFin.videPas <= 2100,
        JSON.stringify(sansFin));

    // Si le contrôle ci-dessus est tombé, la page EST figée : on ne s'attarde
    // pas à la refermer poliment, le navigateur s'en chargera.
    await avantQueLaPageNeGele(context.close(), 5000);
    return r.bilan();
};
