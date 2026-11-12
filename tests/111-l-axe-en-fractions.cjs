// L'AXE GRADUÉ SAIT ENFIN ÉCRIRE DES FRACTIONS.
//
// « Pour le plugin axe, fais mieux, permets de mettre des fractions, permets
//  de mettre le début et la fin, améliore-le vraiment même dans la
//  présentation. »
//
// UN AXE GRADUÉ SERT D'ABORD À PLACER DES FRACTIONS. C'est son emploi au
// collège — « place 7/4 sur la demi-droite graduée » —, et c'était exactement
// ce qu'on ne pouvait pas y écrire : les bornes et le pas passaient par un
// champ « number », qui refuse « 3/4 ». Le navigateur rendait une chaîne vide,
// et la borne retombait à zéro sans un mot.
//
// ET LES DEUX BOUTS NE SE RÉGLAIENT PAS À PART. Un seul choix — « à droite »
// ou « des deux côtés » — ne savait pas dire la demi-droite graduée d'origine
// O, trait net à gauche et flèche à droite, qui est pourtant LA figure du
// cours.
//
// CE CHAPITRE TIENT AUSSI CE QU'ON N'A PAS CASSÉ : un axe enregistré l'an
// dernier n'a pas les réglages d'aujourd'hui, et les réponses de la boîte sont
// un simple tableau où le rang vaut le sens. Ajouter deux réglages au milieu
// aurait rouvert les anciens axes avec leur couleur dans la case des
// graduations.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'axe en fractions');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. ON LIT LE NOMBRE COMME UN CAHIER L'ÉCRIT.
    // ------------------------------------------------------------------
    const lu = await page.evaluate(() => {
        const dit = (t) => {
            const l = lireUnNombre(t);
            return l ? [l.val, l.num, l.den] : null;
        };
        return {
            entier: dit('7'),
            decimal: dit('2,5'),
            fraction: dit('3/4'),
            negative: dit('-5/2'),
            mixte: dit('1 1/2'),
            reduite: dit('6/8'),
            decimalEnFraction: dit('0,25'),
            // CE N'EST PAS LE LECTEUR QUI RECONNAÎT LE QUART DANS « 0,25 »,
            // c'est la graduation : « denominateurDuPas » cherche la fraction
            // derrière un décimal court. Le lecteur, lui, rend ce qu'on lui a
            // écrit — un décimal — et c'est juste : « 2,5 » n'est pas « 5/2 »
            // dans la tête de qui l'écrit.
            denominateurDUnQuart: denominateurDuPas(lireUnNombre('0,25')),
            denominateurDUnTiers: denominateurDuPas(lireUnNombre('1/3')),
            denominateurDUnEntier: denominateurDuPas(lireUnNombre('2')),
            denominateurDUnVraiDecimal: denominateurDuPas(lireUnNombre('0,3333')),
            motVide: dit(''),
            nImporteQuoi: dit('bof'),
            parZero: dit('1/0')
        };
    });
    r.egal('un entier reste un entier', lu.entier, [7, null, null], JSON.stringify(lu));
    r.egal('la virgule du cahier français est comprise', lu.decimal, [2.5, null, null],
        JSON.stringify(lu));
    r.egal('« 3/4 » est une fraction, et on en garde les deux termes',
        lu.fraction, [0.75, 3, 4], JSON.stringify(lu));
    // LE SIGNE VA AU NUMÉRATEUR : « 3/-4 » s'écrirait au tableau comme
    // personne ne l'écrit.
    r.egal('« -5/2 » porte son signe au numérateur', lu.negative, [-2.5, -5, 2],
        JSON.stringify(lu));
    r.egal('« 1 1/2 » est un entier et sa fraction', lu.mixte, [1.5, 3, 2],
        JSON.stringify(lu));
    r.egal('une fraction se réduit', lu.reduite, [0.75, 3, 4], JSON.stringify(lu));
    r.egal('« 0,25 » est lu comme le décimal qu\'on a écrit',
        lu.decimalEnFraction, [0.25, null, null], JSON.stringify(lu));
    // MAIS LA GRADUATION, ELLE, Y VOIT UN QUART : un enseignant qui écrit
    // « 0,25 » dans le pas veut un axe en quarts, et il l'obtient.
    r.egal('mais un pas de 0,25 gradue bien en quarts',
        lu.denominateurDUnQuart, 4, JSON.stringify(lu));
    r.egal('un pas de 1/3 gradue en tiers', lu.denominateurDUnTiers, 3, JSON.stringify(lu));
    r.egal('un pas entier ne gradue en rien du tout', lu.denominateurDUnEntier, 1,
        JSON.stringify(lu));
    // ON NE PREND PAS « 0,3333 » POUR UN TIERS. Ce n'en est pas un, et le
    // prétendre mentirait sur l'axe.
    r.egal('et « 0,3333 » reste un décimal, pas un tiers',
        lu.denominateurDUnVraiDecimal, 1, JSON.stringify(lu));
    // CE QU'ON NE SAIT PAS LIRE, ON NE L'INVENTE PAS. Rendre zéro pour « bof »
    // ferait un axe qui commence à zéro sans que personne l'ait demandé.
    r.egal('ce qui n\'est pas un nombre n\'en devient pas un',
        [lu.motVide, lu.nImporteQuoi, lu.parZero], [null, null, null], JSON.stringify(lu));

    // ------------------------------------------------------------------
    // 2. UN AXE EN QUARTS S'ÉCRIT EN QUARTS.
    //
    //    Et « 1 » ne s'y écrit pas « 4/4 » : c'est le repère de l'unité, et
    //    l'effacer sous une fraction, c'est effacer ce qu'on vient enseigner.
    // ------------------------------------------------------------------
    const lireSVG = (args) => page.evaluate((args) =>
        PluginManager.plugins.axeTool.generateSVG(args, true), args);

    const quarts = await lireSVG(['0', '2', '1/4', 'auto', 'no', 'trait', 'fleche',
        '#2d3436', '#2d3436', '#2d3436', '', '#d63031']);
    const nombresDe = (svg) => (svg.match(/>([^<>]+)<\/text>/g) || [])
        .map(m => m.replace(/^>|<\/text>$/g, ''));
    const nQuarts = nombresDe(quarts);
    // ON COMPTE LES TRAITS, PAS LES TEXTES. Une fraction empilée en écrit
    // DEUX — son numérateur et son dénominateur —, si bien que neuf
    // graduations donnent quinze textes. Compter les textes, c'était compter
    // les chiffres et appeler cela des graduations.
    const traits = (quarts.match(/y1="\d+" x2="[\d.]+" y2="\d+" stroke="#2d3436" stroke-width="2"/g) || []).length;
    r.egal('neuf graduations de 0 à 2 au pas d\'un quart',
        (quarts.match(/<line [^>]*stroke-width="2"\/>/g) || []).length - 1, 9,
        JSON.stringify({ traits, nQuarts }));
    // Les numérateurs et dénominateurs sont écrits à part : on les lit dans
    // l'ordre où ils paraissent.
    r.egal('et ils s\'écrivent en quarts, les entiers restant entiers',
        nQuarts, ['0', '1', '4', '1', '2', '3', '4', '1', '5', '4', '3', '2', '7', '4', '2']
            .slice(0, nQuarts.length), JSON.stringify(nQuarts));
    r.verifie('une barre de fraction est tracée pour chacune des six fractions',
        (quarts.match(/stroke-linecap="round"/g) || []).length >= 6,
        String((quarts.match(/stroke-linecap="round"/g) || []).length));

    // ON NE DEMANDE PAS DES FRACTIONS QUAND LE PAS N'EN EST PAS UNE.
    const entiers = await lireSVG(['0', '5', '1', 'auto', 'no', 'trait', 'fleche',
        '#2d3436', '#2d3436', '#2d3436', '', '#d63031']);
    r.egal('un axe au pas de 1 n\'écrit aucune fraction',
        nombresDe(entiers), ['0', '1', '2', '3', '4', '5'], JSON.stringify(nombresDe(entiers)));

    // ET L'ON PEUT L'EXIGER, OU LE REFUSER.
    const force = await lireSVG(['0', '2', '1/4', 'decimal', 'no', 'trait', 'fleche',
        '#2d3436', '#2d3436', '#2d3436', '', '#d63031']);
    r.verifie('« en décimaux » écrit bien des décimaux, même au pas d\'un quart',
        nombresDe(force).indexOf('0,25') >= 0, JSON.stringify(nombresDe(force)));

    // ------------------------------------------------------------------
    // 3. PAS DE DÉRIVE DÉCIMALE.
    //
    //    Un axe en tiers, en additionnant 0,333…, n'atteint jamais 1 : la
    //    dernière étiquette aurait affiché 0,999.
    // ------------------------------------------------------------------
    const tiers = await lireSVG(['0', '1', '1/3', 'auto', 'no', 'trait', 'fleche',
        '#2d3436', '#2d3436', '#2d3436', '', '#d63031']);
    const nTiers = nombresDe(tiers);
    r.egal('un axe en tiers va de 0 à 1 en passant par 1/3 et 2/3',
        nTiers, ['0', '1', '3', '2', '3', '1'], JSON.stringify(nTiers));
    r.verifie('et rien n\'y traîne un 0,99 quelconque',
        !nTiers.some(t => /9{2}/.test(t)), JSON.stringify(nTiers));

    // ------------------------------------------------------------------
    // 4. CHAQUE BOUT SE RÈGLE À PART — C'EST LA DEMANDE.
    // ------------------------------------------------------------------
    const bouts = async (debut, fin) => {
        const svg = await lireSVG(['0', '5', '1', 'auto', 'no', debut, fin,
            '#000', '#000', '#000', '', '#d63031']);
        return { fleches: (svg.match(/<polygon/g) || []).length,
                 traits: (svg.match(/stroke-width="3"/g) || []).length };
    };
    const demiDroite = await bouts('trait', 'fleche');
    r.egal('la demi-droite graduée du cours : un trait net, puis une flèche',
        [demiDroite.traits, demiDroite.fleches], [1, 1], JSON.stringify(demiDroite));
    const deuxFleches = await bouts('fleche', 'fleche');
    r.egal('une droite entière porte ses deux flèches',
        [deuxFleches.traits, deuxFleches.fleches], [0, 2], JSON.stringify(deuxFleches));
    const nu = await bouts('rien', 'rien');
    r.egal('et « rien » ne promet rien aux deux bouts',
        [nu.traits, nu.fleches], [0, 0], JSON.stringify(nu));

    // ------------------------------------------------------------------
    // 5. LES POINTS À PLACER S'ÉCRIVENT AUSSI EN FRACTIONS.
    //
    //    « Place 7/4 » est la consigne même : c'était la seule chose qu'on ne
    //    pouvait pas écrire dans le champ des points.
    // ------------------------------------------------------------------
    const avecPoints = await lireSVG(['0', '2', '1/4', 'auto', 'no', 'trait', 'fleche',
        '#2d3436', '#2d3436', '#2d3436', '7/4=A ; 1/2=B ; 9=HORS', '#d63031']);
    r.egal('deux points sont posés', (avecPoints.match(/<circle/g) || []).length, 2,
        String((avecPoints.match(/<circle/g) || []).length));
    r.verifie('et ils portent leurs noms',
        />A<\/text>/.test(avecPoints) && />B<\/text>/.test(avecPoints), 'noms manquants');
    // UN POINT HORS DE L'AXE N'EST PAS UN POINT : on ne le dessine pas dans le
    // vide à côté de la flèche.
    r.verifie('le point hors de l\'axe est ignoré, pas dessiné dans le vide',
        !/>HORS</.test(avecPoints), 'HORS dessiné');

    // ------------------------------------------------------------------
    // 6. RIEN NE DÉBORDE DU CADRE.
    //
    //    Une fraction empilée prend deux lignes. Sur la hauteur d'avant, son
    //    dénominateur sortait du cadre et disparaissait au tamponnage — c'est
    //    exactement ce qui était arrivé aux noms des points.
    // ------------------------------------------------------------------
    const cadres = await page.evaluate(() => {
        const p = PluginManager.plugins.axeTool;
        const mesure = (args) => {
            const svg = p.generateSVG(args, true);
            const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
            if (!vb) return null;
            const haut = parseFloat(vb[2]);
            // Le plus bas de ce qui est écrit : les « y » des textes et des
            // traits. Rien ne doit dépasser le bas du cadre.
            let bas = 0;
            (svg.match(/y="([\d.]+)"/g) || []).forEach(m => {
                const v = parseFloat(m.slice(3, -1));
                if (v > bas) bas = v;
            });
            (svg.match(/y2="([\d.]+)"/g) || []).forEach(m => {
                const v = parseFloat(m.slice(4, -1));
                if (v > bas) bas = v;
            });
            return { haut, bas: Math.round(bas * 10) / 10 };
        };
        return {
            entiers: mesure(['0', '5', '1', 'auto', 'no', 'trait', 'fleche',
                '#000', '#000', '#000', '', '#d63031']),
            fractions: mesure(['0', '2', '1/4', 'auto', 'no', 'trait', 'fleche',
                '#000', '#000', '#000', '', '#d63031']),
            avecPoints: mesure(['0', '2', '1/4', 'auto', 'no', 'trait', 'fleche',
                '#000', '#000', '#000', '7/4=A', '#d63031'])
        };
    });
    ['entiers', 'fractions', 'avecPoints'].forEach(cas => {
        const m = cadres[cas];
        r.verifie(`rien ne dépasse du cadre — ${cas}`,
            !!m && m.bas <= m.haut, JSON.stringify({ cas, m }));
    });
    r.verifie('le cadre est plus haut quand il porte des fractions',
        cadres.fractions && cadres.entiers
        && cadres.fractions.haut > cadres.entiers.haut, JSON.stringify(cadres));

    // ------------------------------------------------------------------
    // 7. UN AXE ENREGISTRÉ HIER SE ROUVRE JUSTE.
    //
    //    Le contrôle qui compte : les réponses de la boîte sont un tableau où
    //    le rang vaut le sens, et deux réglages ont été ajoutés AU MILIEU.
    // ------------------------------------------------------------------
    const vieux = ['0', '10', '1', 'mid', 'both', '#0984e3', '#00b894', '#636e72',
        '3,5=A', '#d63031'];
    const repris = await page.evaluate((v) => {
        const p = PluginManager.plugins.axeTool;
        const a = p.argsModernes(v);
        const svg = p.generateSVG(v, true);
        return {
            a,
            axeBleu: /stroke="#0984e3"/.test(svg),
            milieuVert: /stroke="#00b894"/.test(svg),
            deuxFleches: (svg.match(/<polygon/g) || []).length,
            point: (svg.match(/<circle/g) || []).length,
            // Et les champs de la boîte repartent des bonnes valeurs.
            champs: p.champs(v).filter(c => c.type !== 'titre').map(c => String(c.value))
        };
    }, vieux);
    r.egal('« des deux côtés » devient deux flèches', repris.deuxFleches, 2,
        JSON.stringify(repris));
    r.egal('la couleur de l\'axe reste la sienne', repris.axeBleu, true, JSON.stringify(repris));
    r.egal('celle des milieux aussi', repris.milieuVert, true, JSON.stringify(repris));
    r.egal('et son point est toujours placé', repris.point, 1, JSON.stringify(repris));
    r.egal('la boîte rouvre l\'axe sur ses propres valeurs',
        repris.champs,
        ['0', '10', '1', 'auto', 'mid', 'fleche', 'fleche',
            '#0984e3', '#00b894', '#636e72', '3,5=A', '#d63031'],
        JSON.stringify(repris.champs));

    // ------------------------------------------------------------------
    // 8. LA BOÎTE EST RANGÉE EN RUBRIQUES — ET LES RUBRIQUES NE COMPTENT PAS.
    //
    //    Un intertitre ne rend aucune valeur : s'il en rendait une, tous les
    //    réglages se décaleraient d'un cran et l'axe se peindrait de travers.
    // ------------------------------------------------------------------
    const boite = await page.evaluate(() => {
        const p = PluginManager.plugins.axeTool;
        const champs = p.champs([]);
        openCustomPrompt('Essai', champs, () => '', () => {});
        const c = document.getElementById('custom-prompt-inputs');
        const rendu = {
            rubriques: Array.from(c.querySelectorAll('.cp-rubrique')).map(e => e.textContent),
            champsAttendus: champs.filter(f => f.type !== 'titre').length,
            entrees: c.querySelectorAll('input, select').length,
            // Les trois bornes sont des champs texte, pour accepter « 3/4 ».
            mesuresTexte: Array.from(c.querySelectorAll('input'))
                .filter(i => i.type === 'text' && i.inputMode === 'decimal').length
        };
        const m = document.getElementById('custom-prompt-modal');
        if (m) m.style.display = 'none';
        return rendu;
    });
    r.egal('la boîte porte ses cinq rubriques', boite.rubriques.length, 5,
        JSON.stringify(boite.rubriques));
    r.verifie('et elles disent de quoi parle ce qui suit',
        /étendue/i.test(boite.rubriques[0] || '') && /bouts/i.test((boite.rubriques[2] || '')),
        JSON.stringify(boite.rubriques));
    // Les couleurs posent un champ caché en plus de leur pastille : on ne
    // compte donc pas à l'unité près, mais aucune rubrique ne doit s'y être
    // glissée.
    r.verifie('aucune rubrique ne s\'est glissée parmi les réglages',
        boite.entrees >= boite.champsAttendus, JSON.stringify(boite));
    r.egal('les trois bornes acceptent d\'écrire une fraction',
        boite.mesuresTexte, 3, JSON.stringify(boite));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
