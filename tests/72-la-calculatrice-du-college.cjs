// LA CALCULATRICE DU COLLÈGE
//
// « Pour la calculatrice change le nom et ajoute d'autres fonctions pour que ça
// ressemble à la fx92 collège au niveau des fonctions. »
//
// LE NOM D'ABORD : elle s'appelait « CASIO FX-92 (Émulation) ». Ce n'est ni une
// Casio ni une émulation, et écrire le nom d'un fabricant sur un outil qu'on a
// fait soi-même n'est vrai pour personne.
//
// CE QUI FAIT UNE CALCULATRICE DE COLLÈGE, ce ne sont pas les fonctions
// savantes : c'est qu'elle répond EN FRACTIONS EXACTES — un tiers s'écrit 1/3 et
// non 0,333333 — et qu'elle sait faire ce qu'on fait au cycle 4 : le PGCD, le
// PPCM, la division euclidienne, la décomposition en facteurs premiers.
//
// ET CE CHAPITRE TIENT AUSSI LE GARDE-FOU DES FORMULES, parce qu'on vient de
// l'élargir deux fois. La calculatrice et le traceur de fonctions compilent ce
// qu'on leur donne : un tableau reçu d'ailleurs apporte ses propres formules, et
// les rouvrir exécuterait le code qu'elles contiennent. La règle tient en une
// phrase — on n'accepte QUE ce qu'une formule contient — et rien ne la tenait.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La calculatrice du collège');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    // ------------------------------------------------------------------
    // LE NOM
    // ------------------------------------------------------------------
    const nom = await page.evaluate(() => {
        const t = document.querySelector('#calc-widget .drag-handle-calc span');
        return t ? t.textContent.trim() : null;
    });
    r.egal('la fenêtre s\'appelle « Calculatrice collège »', nom, 'Calculatrice collège');
    r.verifie('et ne porte aucun nom de fabricant',
        !!nom && !/casio|texas|fx-?9\d|émulation/i.test(nom), String(nom));

    // ------------------------------------------------------------------
    // ON TAPE COMME UN PROFESSEUR : sur les touches.
    // ------------------------------------------------------------------
    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    await page.waitForTimeout(300);

    // Chaque touche est cherchée par ce qu'elle AFFICHE, et non par un
    // identifiant : c'est ce que voit le professeur, et cela vérifie du même
    // coup que la touche existe bien sur le clavier.
    const taper = (suite) => page.evaluate((s) => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        for (const t of s) {
            const b = touches().find(x => x.innerText.trim() === t);
            if (!b) return { erreur: 'touche introuvable : ' + t };
            b.click();
        }
        return { ecran: document.getElementById('calc-res').innerText.trim(),
                 expression: document.getElementById('calc-expr').innerText.trim() };
    }, suite);

    // ------------------------------------------------------------------
    // 1. ELLE RÉPOND EN FRACTIONS
    // ------------------------------------------------------------------
    r.egal('un tiers s\'écrit 1/3, pas 0,333333',
        (await taper(['AC', '1', '÷', '3', '='])).ecran, '1/3');
    r.egal('et un tiers plus un sixième font une moitié',
        (await taper(['AC', '1', '÷', '3', '+', '1', '÷', '6', '='])).ecran, '1/2');
    // S⇔D : la touche qui donne l'écriture décimale à qui la veut. CHAQUE
    // ÉTAPE EST MESURÉE, l'une après l'autre, et non rejouée depuis « AC » :
    // « S⇔D » est une BASCULE, et une épreuve qui la rejoue depuis le début
    // hérite de la parité laissée par le contrôle précédent. Écrite ainsi, elle
    // se trompait : en sabotant le retour à la fraction, c'est un autre
    // contrôle qui tombait, et celui qui portait le nom du défaut passait.
    const bascule = {};
    bascule.fraction = (await taper(['AC', '2', '÷', '3', '='])).ecran;
    bascule.decimal = (await taper(['S⇔D'])).ecran;
    bascule.retour = (await taper(['S⇔D'])).ecran;
    r.egal('un calcul s\'affiche d\'abord en fraction', bascule.fraction, '2/3');
    r.egal('« S⇔D » donne l\'écriture décimale', bascule.decimal, '0.666666666667');
    r.egal('et un second appui ramène la fraction', bascule.retour, '2/3');
    // ET UN NOUVEAU CALCUL REVIENT À LA FRACTION : « S⇔D » montre le résultat
    // qu'on a sous les yeux, il ne change pas la calculatrice pour la journée.
    // On laisse donc l'écran EXPRÈS en décimal avant de recalculer.
    bascule.laisseEnDecimal = (await taper(['S⇔D'])).ecran;
    bascule.apres = (await taper(['AC', '1', '÷', '4', '='])).ecran;
    r.egal('on peut laisser l\'écran en décimal', bascule.laisseEnDecimal, '0.666666666667');
    r.egal('un nouveau calcul repart quand même en fraction', bascule.apres, '1/4');

    // ------------------------------------------------------------------
    // 2. CE QU'ON FAIT AU CYCLE 4
    // ------------------------------------------------------------------
    // La virgule des fonctions à deux nombres est en SHIFT, sur la parenthèse.
    r.egal('PGCD(24,36) = 12',
        (await taper(['AC', 'PGCD', '2', '4', 'SHIFT', ',', '3', '6', ')', '='])).ecran, '12');
    r.egal('PPCM(4,6) = 12',
        (await taper(['AC', 'PPCM', '4', 'SHIFT', ',', '6', ')', '='])).ecran, '12');
    r.egal('la division euclidienne dit le quotient ET le reste',
        (await taper(['AC', '1', '7', '÷R', '5', '='])).ecran, '3 reste 2');
    r.egal('la décomposition s\'écrit comme au tableau',
        (await taper(['AC', 'FACT', '6', '0', ')', '='])).ecran, '60 = 2²×3×5');
    r.egal('et un nombre premier le dit',
        (await taper(['AC', 'FACT', '2', '3', ')', '='])).ecran, '23 est premier');

    // ------------------------------------------------------------------
    // 3. LES AUTRES TOUCHES
    // ------------------------------------------------------------------
    r.egal('la moitié en pourcentage', (await taper(['AC', '5', '0', '%', '='])).ecran, '1/2');
    r.egal('l\'inverse de quatre', (await taper(['AC', '4', 'x⁻¹', '='])).ecran, '1/4');
    // LA RACINE CUBIQUE NE MARCHAIT PAS. La touche existait depuis toujours —
    // en SHIFT sur la racine carrée — mais le signe « ∛ » n'était pas admis par
    // le garde-fou des formules : la calculatrice répondait « Erreur » à qui
    // demandait la racine cubique de huit.
    r.egal('la racine cubique de huit',
        (await taper(['AC', 'SHIFT', '∛', '8', ')', '='])).ecran, '2');
    r.egal('le carré de neuf', (await taper(['AC', '9', 'x²', '='])).ecran, '81');

    // La mémoire : on ajoute, on rappelle, on retranche.
    r.egal('la mémoire garde ce qu\'on lui ajoute',
        (await taper(['AC', '2', '5', 'M+', 'AC', 'MR', '='])).ecran, '25');
    r.egal('et elle sait aussi retrancher',
        (await taper(['AC', '1', '0', 'SHIFT', 'M−', 'AC', 'MR', '='])).ecran, '15');
    const memoire = await page.evaluate(() =>
        getComputedStyle(document.getElementById('ind-memoire')).opacity);
    r.verifie('une pastille « M » dit qu\'il y a quelque chose en mémoire',
        parseFloat(memoire) > 0.5, 'opacité ' + memoire);

    // Un entier au hasard reste entre ses bornes — on le tire vingt fois.
    const des = [];
    for (let i = 0; i < 20; i++) {
        des.push(Number((await taper(['AC', 'SHIFT', 'RanInt', '1', 'SHIFT', ',',
                                      '6', ')', '='])).ecran));
    }
    r.verifie('un dé tiré vingt fois tombe toujours entre 1 et 6',
        des.every(n => Number.isInteger(n) && n >= 1 && n <= 6), JSON.stringify(des));
    r.verifie('et il ne tombe pas vingt fois sur la même face',
        new Set(des).size > 1, JSON.stringify(des));

    // ------------------------------------------------------------------
    // 4. SHIFT NE VAUT QUE POUR LA TOUCHE SUIVANTE
    // ------------------------------------------------------------------
    // Il restait armé jusqu'à ce qu'on le rappuie : après une racine cubique,
    // « sin » donnait « arcsin » sans qu'on l'ait demandé.
    const apresShift = await page.evaluate(async () => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        const clic = (t) => { const b = touches().find(x => x.innerText.trim() === t); if (b) b.click(); };
        clic('AC'); clic('SHIFT');
        const pendant = touches().find(x => x.dataset.shift === 'arcsin').innerText.trim();
        clic('π');                       // une touche quelconque
        await new Promise(ok => setTimeout(ok, 60));
        const apres = touches().find(x => x.dataset.shift === 'arcsin').innerText.trim();
        return { pendant, apres,
                 pastille: getComputedStyle(document.getElementById('ind-shift')).opacity };
    });
    r.egal('SHIFT armé, la touche montre sa seconde fonction', apresShift.pendant, 'arcsin');
    r.egal('et il se désarme dès qu\'on appuie ailleurs', apresShift.apres, 'sin');
    r.verifie('la pastille SHIFT s\'éteint avec lui',
        parseFloat(apresShift.pastille) < 0.5, apresShift.pastille);

    // ------------------------------------------------------------------
    // 5. LE GARDE-FOU DES FORMULES
    // ------------------------------------------------------------------
    // Ce qui est compilé vient parfois d'un fichier reçu d'ailleurs. On
    // n'accepte QUE ce qu'une formule contient — et l'on vient d'élargir deux
    // fois la liste des signes admis : rien ne tenait cette règle.
    const garde = await page.evaluate(() => {
        const bonnes = ['2+3', 'sin(30)', '1÷3+1÷6', 'PGCD(24,36)', 'PPCM(4,6)', '∛(8)',
                        '4x⁻¹', '50%', 'π×2', 'Ans+1', 'RanInt(1,6)', 'x²+2x-3',
                        '√(2)', '2×10^3', 'arctan(1)', 'FACT(60)'];
        const mauvaises = ['fetch("a")', 'constructor', 'this', 'window', 'document',
                           'alert(1)', 'eval("1")', '[].map', 'import("a")',
                           "self['ale'+'rt'](1)", 'a=1', 'x.constructor', 'localStorage',
                           'new Function("")', 'globalThis', '`${1}`', 'x=>1',
                           'atob("YQ==")', 'top.location', 'x["c"]'];
        return {
            refuseesATort: bonnes.filter(f => !formuleAcceptable(f)),
            accepteesATort: mauvaises.filter(f => formuleAcceptable(f)),
            combien: bonnes.length + mauvaises.length
        };
    });
    r.verifie('assez de formules essayées pour que la mesure ait un sens',
        garde.combien >= 30, String(garde.combien));
    r.egal('aucune formule légitime n\'est refusée', garde.refuseesATort, []);
    r.egal('et rien de ce qui ressemble à du code ne passe', garde.accepteesATort, []);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
