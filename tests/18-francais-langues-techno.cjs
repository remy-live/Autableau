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

    await page.evaluate(() => {
        PluginManager.plugins['analyseGrammaticaleTool'].fermer();
        images.length = 0;
    });


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
