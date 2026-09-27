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

    // ------------------------------------------------------------------
    // 6. LE CLAVIER A LA TÊTE D'UN CLAVIER
    // ------------------------------------------------------------------
    // « Elle est horrible, et des boutons écrasés. » La grille déclarait SEPT
    // rangées alors que le clavier du collège en compte NEUF : les sept
    // premières se partageaient la hauteur à parts égales, les deux autres
    // prenaient ce qui restait. On mesure donc LA RÈGLE, et non le nombre neuf —
    // une épreuve qui compterait les rangées aurait accompagné la faute.
    const clavier = await page.evaluate(() => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        const hauteurs = touches().map(t => t.getBoundingClientRect().height);
        const grille = document.querySelector('.calc-grid');
        const bas = grille.getBoundingClientRect().bottom;
        return {
            combien: touches().length,
            ecart: Math.max(...hauteurs) - Math.min(...hauteurs),
            plusPetite: Math.min(...hauteurs),
            depasse: touches().filter(t => t.getBoundingClientRect().bottom > bas + 1).length,
        };
    });
    r.verifie('le clavier a toutes ses touches', clavier.combien >= 45, String(clavier.combien));
    r.verifie('et elles ont toutes la même hauteur',
        clavier.ecart <= 1, 'écart de ' + clavier.ecart.toFixed(1) + ' px');
    r.verifie('aucune n\'est écrasée', clavier.plusPetite >= 30,
        'la plus petite fait ' + clavier.plusPetite.toFixed(0) + ' px');
    r.egal('et aucune ne déborde du clavier', clavier.depasse, 0);

    // LA RÈGLE, ET NON LE NOMBRE : on AJOUTE une rangée, et les touches doivent
    // rester de la même taille. C'est exactement ce qui a été cassé le jour où
    // l'on a ajouté les touches du collège à une grille qui comptait ses
    // rangées à la main.
    const apresAjout = await page.evaluate(() => {
        const grille = document.querySelector('.calc-grid');
        const ajoutees = [];
        for (let i = 0; i < 5; i++) {
            const b = document.createElement('button');
            b.className = 'calc-btn fn epreuve-rangee';
            b.textContent = 'ZZ' + i;
            grille.appendChild(b); ajoutees.push(b);
        }
        const h = [...grille.querySelectorAll('.calc-btn')].map(t => t.getBoundingClientRect().height);
        const bas = grille.getBoundingClientRect().bottom;
        const depasse = [...grille.querySelectorAll('.calc-btn')]
            .filter(t => t.getBoundingClientRect().bottom > bas + 1).length;
        ajoutees.forEach(b => b.remove());
        return { ecart: Math.max(...h) - Math.min(...h), depasse };
    });
    r.verifie('une rangée de plus ne réécrase rien',
        apresAjout.ecart <= 1, 'écart de ' + apresAjout.ecart.toFixed(1) + ' px');
    r.egal('et rien ne déborde pour autant', apresAjout.depasse, 0);

    // L'AFFICHEUR N'EST PLUS UN GRAND VIDE VERT. Il était centré dans
    // soixante-dix pixels de haut, avec un résultat de trente-deux : la ligne de
    // calcul vide laissait une large bande verte au-dessus du chiffre.
    //
    // ET L'ON MESURE ICI LE JEU, ET NON LA POSITION. Une première rédaction
    // vérifiait que « les témoins sont en haut » et que « le résultat est collé
    // en bas » : ces deux-là sont vraies SANS RIEN dans la feuille de style,
    // parce qu'à sa hauteur naturelle l'afficheur n'a aucune place à répartir.
    // Le sabotage l'a dit — retirer le calage ne changeait pas un pixel. On
    // mesure donc d'abord qu'il n'y a pas de place perdue, puis, EN FORÇANT de
    // la place, que le contenu se range bien en haut et en bas.
    const afficheur = await page.evaluate(() => {
        const e = document.querySelector('.calc-screen');
        const s = getComputedStyle(e);
        const contenu = [...e.children].reduce((t, c) => t + c.getBoundingClientRect().height, 0);
        const bords = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom);
        const naturelle = e.getBoundingClientRect().height;

        // On force maintenant cent soixante pixels : il y a de la place à
        // répartir, et c'est là que le rangement se voit.
        e.style.height = '160px';
        const r2 = e.getBoundingClientRect();
        const force = {
            temoinsEnHaut: Math.round(document.getElementById('calc-indicators').getBoundingClientRect().top - r2.top),
            resEnBas: Math.round(r2.bottom - document.getElementById('calc-res').getBoundingClientRect().bottom),
        };
        e.style.height = '';
        return {
            perdu: Math.round(naturelle - contenu - bords),
            hauteur: naturelle,
            fenetre: document.getElementById('calc-widget').getBoundingClientRect().height,
            force,
        };
    });
    r.verifie('l\'afficheur n\'a pas de place perdue', afficheur.perdu <= 10,
        afficheur.perdu + ' px de vert vide');
    r.verifie('l\'afficheur ne mange pas le cinquième de la fenêtre',
        afficheur.hauteur / afficheur.fenetre < 0.2,
        Math.round(100 * afficheur.hauteur / afficheur.fenetre) + ' %');
    r.verifie('agrandi, il garde ses témoins en haut',
        afficheur.force.temoinsEnHaut < 12, String(afficheur.force.temoinsEnHaut));
    r.verifie('et son résultat collé en bas',
        afficheur.force.resEnBas < 14, String(afficheur.force.resEnBas));

    // ------------------------------------------------------------------
    // 7. DEUX FONDS ET DEUX ENCRES
    // ------------------------------------------------------------------
    // Il y avait NEUF teintes pour cinquante touches : orange pour SHIFT, pour
    // DEG, pour les flèches, pour DEL ; rouge pour AC ; bleu pour « = » ; gris
    // pour les opérations ; bleu nuit pour les fonctions ; blanc pour les
    // chiffres — le tout sur une dalle gris clair posée dans une coque sombre.
    const teintes = await page.evaluate(() => {
        const fonds = {};
        document.querySelectorAll('#calc-widget .calc-btn').forEach(t => {
            const f = getComputedStyle(t).backgroundColor;
            fonds[f] = (fonds[f] || 0) + 1;
        });
        return fonds;
    });
    r.verifie('le clavier ne compte pas plus de cinq fonds',
        Object.keys(teintes).length <= 5, JSON.stringify(teintes));
    // ET LA DALLE CLAIRE A DISPARU. Les touches reposaient sur un rectangle
    // gris clair lui-même posé dans une coque sombre : deux objets pour un
    // seul clavier. Elles reposent maintenant sur la coque, comme sur une
    // calculatrice qu'on tient en main.
    const dalle = await page.evaluate(() => {
        const g = getComputedStyle(document.querySelector('.calc-grid')).backgroundColor;
        const c = getComputedStyle(document.getElementById('calc-widget')).backgroundColor;
        const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(g);
        return { grille: g, coque: c, memeFond: transparent || g === c };
    });
    r.verifie('les touches reposent sur la coque, sans dalle intermédiaire',
        dalle.memeFond, 'clavier ' + dalle.grille + ' / coque ' + dalle.coque);
    // ET LES DEUX COULEURS VIVES NE SERVENT QU'À UNE TOUCHE CHACUNE : l'ambre
    // pour SHIFT — sa couleur EST son sens, c'est elle qui est imprimée sur la
    // seconde fonction des touches — et le bleu pour « = ».
    const vives = await page.evaluate(() => {
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const compte = {};
        document.querySelectorAll('#calc-widget .calc-btn').forEach(t => {
            const v = getComputedStyle(t).backgroundColor.match(/[\d.]+/g).map(Number);
            const sat = Math.max(v[0], v[1], v[2]) - Math.min(v[0], v[1], v[2]);
            if (sat > 60) compte[t.innerText.trim()] = getComputedStyle(t).backgroundColor;
        });
        void lin;
        return compte;
    });
    r.egal('seules SHIFT et « = » portent une couleur vive',
        Object.keys(vives).sort(), ['=', 'SHIFT']);

    // TOUT CE QUI EST ÉCRIT SUR UNE TOUCHE SE LIT. Le barème vient de la norme :
    // 4,5:1, ou 3:1 pour un grand texte — l'épreuve le recalcule chez elle.
    const lisibilite = await page.evaluate(() => {
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const lum = (v) => 0.2126 * lin(v[0]) + 0.7152 * lin(v[1]) + 0.0722 * lin(v[2]);
        const nb = (s) => s.match(/[\d.]+/g).map(Number);
        const mauvais = [];
        document.querySelectorAll('#calc-widget .calc-btn').forEach(t => {
            const s = getComputedStyle(t);
            const a = lum(nb(s.color)), b = lum(nb(s.backgroundColor));
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            const taille = parseFloat(s.fontSize) || 16;
            const gras = (parseInt(s.fontWeight, 10) || 400) >= 700;
            const seuil = (taille >= 24 || (gras && taille >= 18.66)) ? 3 : 4.5;
            if (ratio < seuil) mauvais.push(t.innerText.trim() + ' : ' + ratio.toFixed(2) + ' < ' + seuil);
        });
        return mauvais;
    });
    r.egal('tout ce qui est écrit sur une touche se lit', lisibilite, []);
    // ET AUCUNE TOUCHE N'A BESOIN D'ÊTRE RATTRAPÉE. Le contrôle ci-dessus mesure
    // ce que VOIT le professeur — donc après le rattrapage d'encre, qui repeint
    // ce qui ne se lit pas. Saboté en écrivant une encre illisible dans la
    // feuille de style, il ne tombait pas : l'application corrigeait la faute
    // avant qu'il ne regarde. C'est une bonne nouvelle pour le professeur, mais
    // cela ne dit rien de la palette. Ceci le dit : une palette juste n'a rien à
    // faire rattraper, et le rattrapage marque ce qu'il touche.
    const rattrapees = await page.evaluate(() =>
        [...document.querySelectorAll('#calc-widget .calc-btn')]
            .filter(t => t.dataset.encreDorigine)
            .map(t => t.innerText.trim() + ' (' + t.dataset.encreDorigine + ')'));
    r.egal('et aucune n\'a eu besoin d\'être rattrapée', rattrapees, []);

    // ELLE A LA MÊME TÊTE DE JOUR ET DE NUIT. Une calculatrice posée sur le
    // bureau ne change pas de couleur quand on éteint la lumière ; seule sa
    // barre de titre suit le thème, comme celle de toutes les fenêtres.
    const memeTete = await page.evaluate(async () => {
        const lire = () => [...document.querySelectorAll('#calc-widget .calc-btn')]
            .map(t => getComputedStyle(t).backgroundColor + '/' + getComputedStyle(t).color).join('|');
        const jour = lire();
        document.body.classList.add('dark-mode');
        await new Promise(ok => setTimeout(ok, 500));
        const nuit = lire();
        document.body.classList.remove('dark-mode');
        await new Promise(ok => setTimeout(ok, 300));
        return { pareil: jour === nuit, jour: jour.slice(0, 80), nuit: nuit.slice(0, 80) };
    });
    r.verifie('le clavier a la même tête de jour et de nuit',
        memeTete.pareil, memeTete.jour + ' ≠ ' + memeTete.nuit);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
