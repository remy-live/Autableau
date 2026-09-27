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
            // exposant, « x⁻¹ » un « −1 », et « ∛ » se dessine comme un petit
            // 3 posé sur un signe de racine : « 3√ ». Ces traductions-là ne
            // sont pas des pertes, ce sont justement les mathématiques que le
            // dessin fait apparaître.
            const attendu = e.replace(/x²/g, '2').replace(/x³/g, '3').replace(/x⁻¹/g, '−1')
                             .replace(/∛/g, '3√')
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
    // 6. LA TRAME DE POINTS — MESURÉE SUR LES VRAIS PIXELS
    // ------------------------------------------------------------------
    // C'EST ICI QU'UNE FAUTE A ÉTÉ PRISE, et elle mérite d'être racontée. La
    // trame était posée avec un pas de deux pixels. Sur l'écran d'épreuve, qui
    // compte deux points par pixel, les chiffres étaient joliment tramés — et
    // la photo était belle. Sur un écran ORDINAIRE, celui d'un vidéoprojecteur
    // ou d'un portable de salle de classe, elle ne faisait RIEN : mesuré,
    // exactement la même encre avec et sans. Une fonction que seul l'écran du
    // développeur pouvait voir.
    //
    // Aucune mesure de couleur ne pouvait l'attraper : la feuille de style dit
    // toujours « presque noir sur vert pâle », et c'est le découpage, après,
    // qui retire l'encre. On décode donc l'image.
    const tramePng = await page.locator('#calc-res').screenshot();
    const trame = mesurerLeTexte(tramePng);
    await page.evaluate(() => {
        const e = document.getElementById('calc-res');
        e.style.setProperty('-webkit-mask-image', 'none', 'important');
        e.style.setProperty('mask-image', 'none', 'important');
    });
    await page.waitForTimeout(250);
    const plein = mesurerLeTexte(await page.locator('#calc-res').screenshot());
    await page.evaluate(() => {
        const e = document.getElementById('calc-res');
        e.style.removeProperty('-webkit-mask-image');
        e.style.removeProperty('mask-image');
    });
    const part = trame.couverture / plein.couverture;
    r.verifie('le résultat est vraiment écrit en points sur un écran ordinaire',
        part < 0.8, Math.round(part * 100) + ' % de l\'encre — la trame ne retire rien');
    r.verifie('et la trame ne ronge pas les signes',
        part > 0.35, 'il ne reste que ' + Math.round(part * 100) + ' % de l\'encre');
    r.verifie('le cœur du trait reste lisible',
        trame.contrasteDuCoeur >= 4.5, trame.contrasteDuCoeur.toFixed(2) + ':1');

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
