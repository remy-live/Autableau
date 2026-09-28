// LA CALCULATRICE ÉCRIT COMME ON ÉCRIT AU TABLEAU
//
// « Tu pourrais me faire une calculatrice qui affiche une police de
// calculatrice et la possibilité d'écrire les formules comme la fx-92 […] et
// on peut le tamponner sur le tableau. »
//
// TROIS CHOSES, ET ELLES TIENNENT ENSEMBLE.
//
// L'ÉCRITURE NATURELLE d'abord : une fraction s'écrit l'une sur l'autre avec
// une barre entre les deux, une racine passe SOUS son signe avec le trait qui
// dit jusqu'où elle prend, une puissance monte en exposant. L'écran rendait la
// suite des touches telle quelle — « 1/3+√(2)^2 » — et un élève qui recopie
// cela ne recopie pas des mathématiques.
//
// LA TRAME DE POINTS ensuite, qui est ce qui fait reconnaître un afficheur de
// calculatrice. Elle a failli n'exister nulle part : voir plus bas, c'est la
// mesure des VRAIS PIXELS qui l'a dit.
//
// LE TAMPON enfin : un calcul fait devant la classe ne sert que s'il reste, et
// le recopier à la main est une occasion de se tromper devant trente élèves.
const { creerRapport, ouvrirApp } = require('./harness.cjs');
const { mesurerLeTexte } = require('./pixels.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La calculatrice écrit comme au tableau');
    const { page, context, erreurs } = await ouvrirApp(browser, {});
    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    await page.waitForTimeout(400);

    const taper = (suite) => page.evaluate((s) => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        for (const t of s) {
            const b = touches().find(x => x.innerText.trim() === t);
            if (!b) return { erreur: 'touche introuvable : ' + t };
            b.click();
        }
        return { brut: document.getElementById('calc-expr').dataset.brut };
    }, suite);

    // ------------------------------------------------------------------
    // 1. LA FRACTION S'ÉCRIT L'UNE SUR L'AUTRE
    // ------------------------------------------------------------------
    // On ne vérifie pas qu'il existe une classe « fraction » — n'importe quel
    // nom de classe passerait. On mesure LA GÉOMÉTRIE : le haut est au-dessus
    // du bas, les deux sont centrés l'un sur l'autre, et une barre les sépare.
    await taper(['AC', '1', 'a/b', '2']);
    await page.waitForTimeout(150);
    const fraction = await page.evaluate(() => {
        const f = document.querySelector('#calc-expr .nat-frac');
        if (!f) return null;
        const haut = f.querySelector('.nat-haut').getBoundingClientRect();
        const bas = f.querySelector('.nat-bas').getBoundingClientRect();
        const s = getComputedStyle(f.querySelector('.nat-bas'));
        return {
            hautAuDessus: bas.top >= haut.bottom - 1,
            memeMilieu: Math.abs((haut.left + haut.right) / 2 - (bas.left + bas.right) / 2) < 2,
            barre: parseFloat(s.borderTopWidth),
            texteHaut: f.querySelector('.nat-haut').textContent,
            texteBas: f.querySelector('.nat-bas').textContent,
        };
    });
    r.verifie('« a/b » empile bien une fraction', !!fraction, 'aucune fraction dessinée');
    if (fraction) {
        r.egal('le numérateur est le premier nombre tapé', fraction.texteHaut, '1');
        r.egal('et le dénominateur le second', fraction.texteBas, '2');
        r.verifie('le haut est au-dessus du bas', fraction.hautAuDessus, JSON.stringify(fraction));
        r.verifie('et les deux sont centrés l\'un sur l\'autre', fraction.memeMilieu, JSON.stringify(fraction));
        r.verifie('une barre les sépare', fraction.barre >= 1, 'barre de ' + fraction.barre + ' px');
    }

    // ------------------------------------------------------------------
    // 2. LA RACINE COUVRE CE QU'ELLE PREND
    // ------------------------------------------------------------------
    // Sans le trait, « √2+3 » ne dit pas si le 3 est dessous. Le trait doit
    // donc couvrir TOUTE la largeur de ce qui est sous la racine.
    await taper(['AC', '√', '1', '2', '3', ')']);
    await page.waitForTimeout(150);
    const racine = await page.evaluate(() => {
        const sous = document.querySelector('#calc-expr .nat-rac .nat-sous');
        const signe = document.querySelector('#calc-expr .nat-rac .nat-signe');
        if (!sous || !signe) return null;
        const b = sous.getBoundingClientRect();
        return {
            texte: sous.textContent,
            trait: parseFloat(getComputedStyle(sous).borderTopWidth),
            signeAGauche: signe.getBoundingClientRect().right <= b.left + 2,
            largeur: b.width,
        };
    });
    r.verifie('la racine a bien un contenu sous son trait', !!racine, 'aucune racine dessinée');
    if (racine) {
        r.egal('tout ce qu\'on a tapé est sous le trait', racine.texte, '123');
        r.verifie('le trait le couvre', racine.trait >= 1 && racine.largeur > 10,
            JSON.stringify(racine));
        r.verifie('et le signe est à sa gauche', racine.signeAGauche, JSON.stringify(racine));
    }

    // ET SON SIGNE GRANDIT AVEC CE QU'IL COUVRE.
    //
    // « Petit bug de racine carrée, peu lisible. » Le « √ » d'une police a une
    // taille fixe : dès que la racine couvre une FRACTION — donc deux étages —
    // il restait petit en haut à gauche pendant que le trait filait tout seul
    // au-dessus du contenu. On ne reconnaissait plus une racine. Le signe est
    // maintenant dessiné, et c'est sa HAUTEUR qu'on mesure : sur un contenu
    // haut, il doit être haut.
    const racineHaute = await page.evaluate(async () => {
        const e = document.getElementById('calc-expr');
        const mesurer = (t) => {
            curseurCalc = null;
            montrerLExpression(e, t, false);
            const rac = e.querySelector('.nat-rac');
            if (!rac) return null;
            const signe = rac.querySelector('.nat-signe').getBoundingClientRect();
            const sous = rac.querySelector('.nat-sous').getBoundingClientRect();
            return { signe: signe.height, sous: sous.height,
                     hautsPareils: Math.abs(signe.top - sous.top) < 3 };
        };
        return { courte: mesurer('√(2)'), haute: mesurer('√(65+12/3)') };
    });
    r.verifie('sur un contenu court, le signe est court',
        racineHaute.courte && racineHaute.courte.signe < 30, JSON.stringify(racineHaute.courte));
    r.verifie('sur une fraction, il grandit avec elle',
        racineHaute.haute && racineHaute.haute.signe >= racineHaute.haute.sous - 2
        && racineHaute.haute.signe > racineHaute.courte.signe + 8,
        JSON.stringify(racineHaute));
    r.verifie('et son sommet rejoint le trait',
        racineHaute.haute && racineHaute.haute.hautsPareils, JSON.stringify(racineHaute.haute));

    // ------------------------------------------------------------------
    // 3. LA PUISSANCE MONTE, ET ELLE EST PLUS PETITE
    // ------------------------------------------------------------------
    await taper(['AC', '5', 'x²']);
    await page.waitForTimeout(150);
    const puissance = await page.evaluate(() => {
        const e = document.querySelector('#calc-expr .nat-exp');
        if (!e) return null;
        const ligne = document.getElementById('calc-expr').getBoundingClientRect();
        const s = getComputedStyle(e);
        const parent = getComputedStyle(document.getElementById('calc-expr'));
        return {
            texte: e.textContent,
            plusPetite: parseFloat(s.fontSize) < parseFloat(parent.fontSize),
            enHaut: e.getBoundingClientRect().top < ligne.top + ligne.height / 2,
        };
    });
    r.verifie('« x² » écrit un exposant', !!puissance, 'aucun exposant dessiné');
    if (puissance) {
        r.egal('qui vaut deux', puissance.texte, '2');
        r.verifie('il est plus petit que la ligne', puissance.plusPetite, JSON.stringify(puissance));
        r.verifie('et il monte', puissance.enHaut, JSON.stringify(puissance));
    }

    // ------------------------------------------------------------------
    // 4. LE CURSEUR DIT OÙ L'ON ÉCRIT
    // ------------------------------------------------------------------
    const curseur = await page.evaluate(() => {
        const c = document.querySelector('#calc-expr .nat-curseur');
        if (!c) return null;
        const b = c.getBoundingClientRect();
        return { large: b.width, haut: b.height };
    });
    r.verifie('un curseur montre où l\'on écrit',
        !!curseur && curseur.large >= 1 && curseur.haut >= 6, JSON.stringify(curseur));

    // ------------------------------------------------------------------
    // 4 bis. LE PAD DÉPLACE LE CURSEUR DANS LE CALCUL
    // ------------------------------------------------------------------
    // « Sur la fx-92 on a un pad qui permet de se déplacer de gauche à
    // droite. » C'est ce qui manquait pour corriger sans tout retaper : une
    // parenthèse oubliée au début d'un calcul de vingt touches obligeait à
    // recommencer.
    const pas = async (suite) => (await taper(suite)).brut;
    r.egal('on tape un calcul', await pas(['AC', '1', '2', '+', '3', '4']), '12+34');
    r.egal('trois reculs ramènent au début', await pas(['◀', '◀', '◀']), '12+34');
    r.egal('et ce qu\'on tape entre LÀ', await pas(['9']), '912+34');
    r.egal('« DEL » reprend ce qui est devant le curseur', await pas(['DEL']), '12+34');
    r.egal('on avance, et l\'on écrit au milieu', await pas(['▶', '7']), '127+34');
    r.egal('le calcul tient compte de l\'insertion', (await taper(['='])).brut, '127+34');
    const apresEgal = await page.evaluate(() => document.getElementById('calc-res').dataset.brut);
    r.egal('et il donne le bon résultat', apresEgal, '161');

    // LE CURSEUR NE S'ARRÊTE PAS AU MILIEU D'UNE TOUCHE. « x² » s'écrit avec
    // deux signes mais c'est UNE touche : un curseur entre le « x » et le
    // « ² » se tiendrait à un endroit où rien ne peut être inséré.
    const auMilieu = await page.evaluate(() => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        const clic = (t) => { const b = touches().find(x => x.innerText.trim() === t); if (b) b.click(); };
        ['AC', '5', 'x²'].forEach(clic);
        const places = [];
        for (let i = 0; i < 4; i++) { clic('◀'); places.push(curseurCalc); }
        return places;
    });
    r.egal('il saute la touche entière', auMilieu, [1, 0, 0, 0]);

    // ET ÉCRIRE AU MILIEU D'UN NOMBRE NE CASSE PAS LE DESSIN.
    //
    // Le curseur est glissé DANS l'expression pour être dessiné à sa place.
    // S'il coupait « 34 » en « 3 » et « 4 », la barre de fraction ne prendrait
    // que le « 3 » pour dénominateur et le « 4 » sortirait de la fraction —
    // un calcul juste, montré faux. Il fait donc partie du nombre où il se
    // tient. C'est le seul endroit où il a le droit d'être au milieu d'une
    // touche, parce que c'est là qu'on écrit vraiment.
    const dansLeNombre = await page.evaluate(() => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        const clic = (t) => { const b = touches().find(x => x.innerText.trim() === t); if (b) b.click(); };
        ['AC', '1', '2', 'a/b', '3', '4', '◀', '9'].forEach(clic);
        const e = document.getElementById('calc-expr');
        const bas = e.querySelector('.nat-bas');
        return { brut: e.dataset.brut, curseur: curseurCalc,
                 denominateur: bas ? bas.textContent : null,
                 fractions: e.querySelectorAll('.nat-frac').length };
    });
    r.egal('on écrit au milieu du dénominateur', dansLeNombre.brut, '12/934');
    r.egal('et le dénominateur garde ses trois chiffres',
        dansLeNombre.denominateur, '934', JSON.stringify(dansLeNombre));

    // ET LE TRAIT SE VOIT LÀ OÙ L'ON ÉCRIT.
    //
    // On ne mesure pas sa place dans la BOÎTE — elle est large et le calcul
    // s'y aligne à droite, si bien qu'un trait « au milieu du calcul » est aux
    // neuf dixièmes de la boîte. Une première rédaction s'y est trompée. Ce
    // qu'il faut mesurer, c'est qu'il AIT BOUGÉ : entre le curseur au bout et
    // le curseur après « 12 », il doit reculer de la largeur de « +34 ».
    const ouEstLeTrait = await page.evaluate(() => {
        const e = document.getElementById('calc-expr');
        const trait = (place) => {
            curseurCalc = place;
            montrerLExpression(e, '12+34');
            const c = e.querySelector('.nat-curseur');
            return c ? { x: c.getBoundingClientRect().left,
                         combien: e.querySelectorAll('.nat-curseur').length } : null;
        };
        return { bout: trait(null), milieu: trait(2) };
    });
    r.verifie('un seul trait, et un seul',
        ouEstLeTrait.bout && ouEstLeTrait.bout.combien === 1
        && ouEstLeTrait.milieu && ouEstLeTrait.milieu.combien === 1, JSON.stringify(ouEstLeTrait));
    r.verifie('et il recule quand le curseur recule',
        ouEstLeTrait.bout.x - ouEstLeTrait.milieu.x > 20,
        'il n\'a reculé que de ' + Math.round(ouEstLeTrait.bout.x - ouEstLeTrait.milieu.x) + ' px');

    // LE PAD RAPPELLE AUSSI LES CALCULS PRÉCÉDENTS, sans SHIFT.
    const rappel = await page.evaluate(async () => {
        const touches = () => [...document.querySelectorAll('#calc-widget .calc-btn')];
        const clic = (t) => { const b = touches().find(x => x.innerText.trim() === t); if (b) b.click(); };
        ['AC', '8', '+', '8', '=', 'AC'].forEach(clic);
        await new Promise(ok => setTimeout(ok, 80));
        clic('▲');
        return document.getElementById('calc-expr').dataset.brut;
    });
    r.egal('« ▲ » rappelle le calcul d\'avant', rappel, '8+8');

    // ------------------------------------------------------------------
    // 5. LE DESSIN NE PERD RIEN, ET N'INVENTE RIEN
    // ------------------------------------------------------------------
    // Le rendu ne doit jamais avaler un signe ni en ajouter. On compare donc,
    // pour une série d'expressions, les SIGNES du dessin à ceux de la suite
    // tapée — mise à part la ponctuation de structure, qui devient géométrie.
    const fidelite = await page.evaluate(() => {
        const essais = ['1/3+1/6', '√(2)/2', '∛(8)', '2^10', 'sin(30)+cos(60)',
                        'PGCD(24,36)', '5×10^3', '4x⁻¹', '17÷R5', '(1+2)/(3+4)',
                        '2^', '√(', '((1+2', '', '0.125'];
        const boite = document.createElement('div');
        const perdus = [];
        for (const e of essais) {
            boite.innerHTML = ecrireEnNaturel(e);
            // ON TRADUIT CE QUE LE DESSIN APPORTE. « x² » devient un « 2 » en
            // exposant, « x⁻¹ » un « −1 ». Le signe de la racine, lui, n'est
            // plus un caractère : il est DESSINÉ pour pouvoir s'étirer sur ce
            // qu'il couvre, et il ne laisse donc plus de texte derrière lui —
            // seul l'ordre de la racine cubique reste écrit. Ces traductions
            // ne sont pas des pertes : ce sont les mathématiques que le dessin
            // fait apparaître.
            const attendu = e.replace(/x²/g, '2').replace(/x³/g, '3').replace(/x⁻¹/g, '−1')
                             .replace(/∛/g, '3').replace(/√/g, '')
                             .replace(/[()^\/]/g, '').replace(/\s/g, '');
            const obtenu = boite.textContent.replace(/[()\s]/g, '');
            if (obtenu !== attendu) perdus.push(e + ' → « ' + obtenu + ' » au lieu de « ' + attendu + ' »');
        }
        return perdus;
    });
    r.egal('le dessin ne perd ni n\'invente aucun signe', fidelite, []);

    // ET IL NE PEUT PAS INJECTER DE CODE. L'expression finit dans la page :
    // c'est la même règle que la garde des formules, du côté de l'affichage.
    const injection = await page.evaluate(() => {
        const boite = document.createElement('div');
        boite.innerHTML = ecrireEnNaturel('<img src=x onerror=alert(1)>1/2');
        return { balises: boite.querySelectorAll('img, script').length,
                 texte: boite.textContent.slice(0, 20) };
    });
    r.egal('rien de ce qui est tapé ne devient une balise', injection.balises, 0);

    // ------------------------------------------------------------------
    // 6. LE RÉSULTAT SE LIT — MESURÉ SUR LES VRAIS PIXELS
    // ------------------------------------------------------------------
    // CE CONTRÔLE RACONTE UN RENONCEMENT, et c'est pour cela qu'il existe.
    //
    // Le résultat a d'abord été découpé en une matrice de points, pour
    // ressembler à l'afficheur d'une calculatrice. La trame était mesurée : on
    // avait même attrapé, ici, qu'à deux pixels de pas elle n'existait QUE sur
    // un écran à deux points par pixel — celui du développeur — et pas sur un
    // vidéoprojecteur. Corrigée à trois pixels, elle existait partout et le
    // cœur du trait tenait ses 7,19:1.
    //
    // Cela ne suffisait pas. « On a du mal à lire le 34/15. » À vingt-huit
    // pixels, un chiffre gras n'a que quatre ou cinq pixels d'épaisseur de
    // trait : un ou deux points par jambage. Et la barre de fraction, épaisse
    // d'un pixel et demi, devenait une ligne pointillée. Pour qu'une trame
    // DESSINE au lieu de RONGER, il lui faut des traits d'au moins deux fois
    // son pas — un résultat écrit en quarante pixels et plus, ce qui n'est pas
    // la taille d'une calculatrice posée dans un coin du tableau.
    //
    // La trame est donc restée dans le FOND de l'afficheur, où elle ne coûte
    // rien. Et ce chapitre garde la mesure des vrais pixels, retournée : elle
    // veille désormais à ce que plus rien ne ronge le résultat. Aucune mesure
    // de couleur ne pourrait le faire — la feuille de style dirait toujours
    // « presque noir sur vert pâle » pendant qu'un masque mangerait l'encre.
    const rendu = mesurerLeTexte(await page.locator('#calc-res').screenshot());
    await page.evaluate(() => {
        const e = document.getElementById('calc-res');
        e.style.setProperty('-webkit-mask-image', 'none', 'important');
        e.style.setProperty('mask-image', 'none', 'important');
    });
    await page.waitForTimeout(250);
    const sansMasque = mesurerLeTexte(await page.locator('#calc-res').screenshot());
    await page.evaluate(() => {
        const e = document.getElementById('calc-res');
        e.style.removeProperty('-webkit-mask-image');
        e.style.removeProperty('mask-image');
    });
    const part = rendu.couverture / sansMasque.couverture;
    r.verifie('rien ne ronge l\'encre du résultat',
        part > 0.97, 'il n\'en reste que ' + Math.round(part * 100) + ' %');
    r.verifie('le cœur du trait est bien noir sur le vert',
        rendu.contrasteDuCoeur >= 4.5, rendu.contrasteDuCoeur.toFixed(2) + ':1');
    // Le plancher est bas, et c'est normal : une fraction empilée occupe une
    // petite part d'une ligne large. Il ne sert qu'à dire qu'il y a de l'encre,
    // pour qu'un afficheur devenu vide ne passe pas pour un afficheur propre.
    r.verifie('et il y a vraiment quelque chose d\'écrit',
        rendu.couverture > 0.005, Math.round(rendu.couverture * 1000) / 10 + ' % de l\'image');

    // ------------------------------------------------------------------
    // 7. LE TAMPON
    // ------------------------------------------------------------------
    // On tape un calcul, on le pose, et l'on regarde ce qui arrive SUR LE
    // TABLEAU — pas ce que la fonction a répondu.
    await taper(['AC', '1', 'a/b', '2', '+', '1', 'a/b', '3', '=']);
    await page.waitForTimeout(200);
    const avant = await page.evaluate(() => images.length);
    await page.evaluate(() => { document.getElementById('btn-calc-tampon').click(); });
    // Le moteur de composition pèse deux mégaoctets : on attend qu'il arrive,
    // puis que le tampon soit posé — on n'attend pas une durée.
    const pose = await page.waitForFunction((n) => images.length > n, avant, { timeout: 40000 })
        .then(() => true).catch(() => false);
    r.verifie('« Poser sur le tableau » pose bien quelque chose', pose, 'rien n\'est arrivé');

    if (pose) {
        const tampon = await page.evaluate(() => {
            const i = images[images.length - 1];
            return { large: Math.round(i.w), haut: Math.round(i.h),
                     vectoriel: String(i.src).startsWith('data:image/svg+xml'),
                     sansPlugin: !i.pluginData };
        });
        r.verifie('le tampon est une image vectorielle', tampon.vectoriel, JSON.stringify(tampon));
        r.verifie('et il a une taille lisible au tableau',
            tampon.large > 40 && tampon.haut > 20, JSON.stringify(tampon));
        // Il se comporte comme n'importe quel objet du tableau : on l'annule.
        const annule = await page.evaluate(async () => {
            const avant = images.length;
            if (typeof undo === 'function') undo();
            await new Promise(ok => setTimeout(ok, 300));
            return { avant, apres: images.length };
        });
        r.verifie('et il s\'annule comme n\'importe quel objet du tableau',
            annule.apres < annule.avant, JSON.stringify(annule));
    }

    // ------------------------------------------------------------------
    // 8. CE QU'ON POSE EST CE QU'ON A CALCULÉ
    // ------------------------------------------------------------------
    // Deux cas méritent mieux qu'une recopie : au tableau, une division
    // euclidienne s'écrit « 17 = 5 × 3 + 2 » et non « 3 reste 2 ».
    const latex = await page.evaluate(() => ({
        fraction: latexDuCalcul('1/2+√(3)/2', '1.36602540378'),
        euclide: latexDuCalcul('17÷R5', '3 reste 2'),
        facteurs: latexDuCalcul('FACT(60)', '60 = 2²×3×5'),
        pgcd: latexDuCalcul('PGCD(24,36)', '12'),
        cube: latexDuCalcul('∛(8)', '2'),
        rien: latexDuCalcul('', ''),
    }));
    r.egal('une fraction posée est une vraie fraction',
        latex.fraction, '\\frac{1}{2} + \\frac{\\sqrt{3}}{2} = 1.36602540378');
    r.egal('la division euclidienne s\'écrit comme au tableau',
        latex.euclide, '17 = 5 \\times 3 + 2');
    r.egal('la décomposition garde ses puissances',
        latex.facteurs, '60 = 2^{2} \\times 3 \\times 5');
    r.egal('le PGCD garde son point-virgule français',
        latex.pgcd, '\\mathrm{PGCD}\\left(24 ; 36\\right) = 12');
    r.egal('la racine cubique garde son ordre', latex.cube, '\\sqrt[3]{8} = 2');
    r.egal('et il n\'y a rien à poser quand il n\'y a rien', latex.rien, null);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
