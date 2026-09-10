// ÉCRIRE ET DESSINER PUISENT AU MÊME NUANCIER.
//
// « Quand on tape un texte, penses-tu qu'il faille plus de proposition de
// couleur ? »
//
// La barre de saisie proposait SIX pastilles à elle — et pas même les six
// premières de la palette des outils : un bleu, un rouge et un vert qui
// n'existaient nulle part ailleurs. Trois conséquences du même ordre : la
// couleur d'un titre ne pouvait pas être celle du trait qu'on venait de
// tracer ; la teinte cherchée à la roulette pour un mot était perdue au mot
// suivant ; et « mes couleurs », qui garde les huit dernières, ne se montrait
// pas là où l'on écrit.
//
// CE QUE CETTE SUITE TIENT :
//
//   — la grille de la saisie est celle des outils, pastille pour pastille, et
//     dans le même ordre ;
//   — une pastille écrit vraiment de cette couleur-là ;
//   — la roulette range sa teinte dans « mes couleurs », la même liste des
//     deux côtés, et une couleur jetée d'un côté disparaît de l'autre ;
//   — la pastille allumée suit le curseur.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const PANNEAU = '#text-toolbar .tt-panel[data-panel="color"]';

module.exports = async function (browser) {
    const r = creerRapport('Les couleurs du texte');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 900 } });

    // Ouvrir une saisie et taper un mot.
    const ecrire = async (mot) => {
        await page.evaluate(() => {
            texts.length = 0; images.length = 0; selectedItems = [];
            panX = 300; panY = 300; zoom = 1;
            setMode('text');
        });
        await page.mouse.click(500, 400);
        await page.waitForTimeout(200);
        await page.keyboard.type(mot);
        await page.waitForTimeout(150);
    };

    const ouvrirLeTiroir = async () => {
        const ouvert = await page.evaluate((sel) =>
            document.querySelector(sel).classList.contains('tt-open'), PANNEAU);
        if (!ouvert) {
            await page.click('#text-toolbar .tt-tab[data-panel="color"]');
            await page.waitForTimeout(150);
        }
    };

    await ecrire('Bonjour');
    await ouvrirLeTiroir();

    // ---------------------------------------------------------------
    // 1. La même palette, pastille pour pastille
    // ---------------------------------------------------------------
    const palettes = await page.evaluate((sel) => {
        const lire = (racine) => [...document.querySelectorAll(racine)].map(d => d.dataset.color);
        return {
            outils: lire('#color-popover .color-dot'),
            texte: lire(sel + ' #text-quick-colors .color-dot'),
            roue: !!document.querySelector(sel + ' #text-custom-color'),
            colonnes: getComputedStyle(document.querySelector(sel + ' #text-quick-colors .color-grid'))
                .gridTemplateColumns.split(' ').length
        };
    }, PANNEAU);

    r.verifie('la saisie propose quinze couleurs', palettes.texte.length === 15, String(palettes.texte.length));
    r.egal('et ce sont exactement celles des outils, dans le même ordre',
        palettes.texte, palettes.outils);
    r.verifie('la roulette ferme la grille', palettes.roue, String(palettes.roue));
    r.verifie('en deux rangées de huit', palettes.colonnes === 8, String(palettes.colonnes));

    // ---------------------------------------------------------------
    // 2. Une pastille écrit de cette couleur-là
    // ---------------------------------------------------------------
    await page.evaluate(() => {
        const z = document.getElementById('wysiwyg-text');
        const n = document.createTreeWalker(z, NodeFilter.SHOW_TEXT).nextNode();
        const r = document.createRange();
        r.setStart(n, 0); r.setEnd(n, 7);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await ouvrirLeTiroir();
    await page.click(`${PANNEAU} .color-dot[data-color="#8e6e53"]`);
    await page.waitForTimeout(150);
    const brun = await page.evaluate(() => ({
        html: document.getElementById('wysiwyg-text').innerHTML,
        arme: activeStyle.strokeColor
    }));
    r.verifie('le brun de la palette écrit vraiment en brun',
        /142,\s*110,\s*83|#8e6e53/i.test(brun.html), brun.html.slice(0, 160));
    r.verifie('et la frappe qui suit garde cette couleur',
        String(brun.arme).toLowerCase() === '#8e6e53', String(brun.arme));

    // LA PASTILLE ALLUMÉE SUIT LE CURSEUR. On peint la fin du mot d'une autre
    // couleur, puis on promène le curseur de l'une à l'autre : c'est la
    // relecture de ce que porte le texte qui doit rallumer la bonne pastille.
    const surLesLettres = (d, f) => page.evaluate(([d, f]) => {
        const z = document.getElementById('wysiwyg-text');
        const n = document.createTreeWalker(z, NodeFilter.SHOW_TEXT);
        const noeuds = []; while (n.nextNode()) noeuds.push(n.currentNode);
        // Le départ se prend DANS un nœud, jamais collé à sa fin : c'est ce
        // que donne une sélection à la souris, et la lecture du style suit le
        // nœud où commence la plage.
        let reste = d, depart = null, fin = null;
        for (const nd of noeuds) {
            if (depart === null && reste < nd.nodeValue.length) { depart = [nd, reste]; }
            reste -= nd.nodeValue.length;
        }
        if (depart === null) depart = [noeuds[noeuds.length - 1], noeuds[noeuds.length - 1].nodeValue.length];
        let r2 = f;
        for (const nd of noeuds) {
            if (fin === null && r2 <= nd.nodeValue.length) { fin = [nd, r2]; }
            r2 -= nd.nodeValue.length;
        }
        const r = document.createRange();
        r.setStart(depart[0], depart[1]); r.setEnd(fin[0], fin[1]);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }, [d, f]);

    await surLesLettres(4, 7);
    await ouvrirLeTiroir();
    await page.click(`${PANNEAU} .color-dot[data-color="#16a085"]`);
    await page.waitForTimeout(150);

    const suitLeCurseur = [];
    for (const [d, f] of [[0, 3], [4, 7]]) {
        await surLesLettres(d, f);
        await page.waitForTimeout(120);
        suitLeCurseur.push(await page.evaluate((sel) => {
            // On éteint tout d'abord : seule la relecture de ce que porte le
            // curseur peut rallumer la bonne pastille.
            document.querySelectorAll(sel + ' .color-dot.active').forEach(d => d.classList.remove('active'));
            syncBadgesTexte();
            return [...document.querySelectorAll(sel + ' #text-quick-colors .color-dot.active')]
                .map(d => d.dataset.color);
        }, PANNEAU));
    }
    r.egal('la pastille allumée suit la couleur sous le curseur',
        suitLeCurseur, [['#8e6e53'], ['#16a085']]);

    // ---------------------------------------------------------------
    // 3. La roulette range sa teinte dans « mes couleurs »
    // ---------------------------------------------------------------
    await page.evaluate(() => {
        couleursRecentes.length = 0;
        enregistrerLesCouleursRecentes();
        majLesCouleursRecentes();
    });

    await page.evaluate(() => {
        const champ = document.getElementById('text-color-picker');
        champ.value = '#7f1d9c';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);

    const apresLaRoue = await page.evaluate((sel) => ({
        memoire: couleursRecentes.slice(),
        dansLaSaisie: [...document.querySelectorAll(sel + ' #text-cr-liste .cr-pastille')].map(d => d.dataset.color),
        dansLesOutils: [...document.querySelectorAll('#cr-liste .cr-pastille')].map(d => d.dataset.color),
        bandeMontree: !document.getElementById('text-color-recentes').hidden,
        ecrit: document.getElementById('wysiwyg-text').innerHTML
    }), PANNEAU);

    r.egal('la teinte de la roulette entre dans « mes couleurs »', apresLaRoue.memoire, ['#7f1d9c']);
    r.egal('elle se montre sous la grille de la saisie', apresLaRoue.dansLaSaisie, ['#7f1d9c']);
    r.egal('et c\'est la même liste que dans la palette des outils',
        apresLaRoue.dansLesOutils, apresLaRoue.dansLaSaisie);
    r.verifie('la bande « mes couleurs » paraît alors', apresLaRoue.bandeMontree, String(apresLaRoue.bandeMontree));
    r.verifie('et le mot est écrit de cette teinte',
        /127,\s*29,\s*156|#7f1d9c/i.test(apresLaRoue.ecrit), apresLaRoue.ecrit.slice(0, 160));

    // Une couleur de la grille n'a rien à faire dans « mes couleurs » : elle
    // y est déjà, à demeure.
    await ouvrirLeTiroir();
    await page.click(`${PANNEAU} .color-dot[data-color="#1abc9c"]`);
    await page.waitForTimeout(120);
    const apresUnePastille = await page.evaluate(() => couleursRecentes.slice());
    r.egal('une couleur de la grille ne s\'ajoute pas à « mes couleurs »',
        apresUnePastille, ['#7f1d9c']);

    // Reprendre une couleur gardée, depuis la saisie.
    await page.evaluate((sel) => {
        document.querySelector(sel + ' #text-cr-liste .cr-pastille').click();
    }, PANNEAU);
    await page.waitForTimeout(120);
    const reprise = await page.evaluate(() => String(activeStyle.strokeColor).toLowerCase());
    r.verifie('une couleur gardée se reprend d\'un clic depuis la saisie',
        reprise === '#7f1d9c', reprise);

    // ---------------------------------------------------------------
    // 4. Jeter une couleur la retire des DEUX côtés
    // ---------------------------------------------------------------
    await page.evaluate((sel) => {
        document.querySelector(sel + ' #text-cr-liste .cr-jeter').click();
    }, PANNEAU);
    await page.waitForTimeout(120);
    const apresLaCroix = await page.evaluate((sel) => ({
        memoire: couleursRecentes.slice(),
        dansLaSaisie: document.querySelectorAll(sel + ' #text-cr-liste .cr-pastille').length,
        dansLesOutils: document.querySelectorAll('#cr-liste .cr-pastille').length,
        bandeMontree: !document.getElementById('text-color-recentes').hidden
    }), PANNEAU);
    r.egal('la croix jette la couleur', apresLaCroix.memoire, []);
    r.verifie('elle disparaît de la saisie comme des outils',
        apresLaCroix.dansLaSaisie === 0 && apresLaCroix.dansLesOutils === 0, JSON.stringify(apresLaCroix));
    r.verifie('et la bande se referme', apresLaCroix.bandeMontree === false, String(apresLaCroix.bandeMontree));

    // Le texte, lui, garde la couleur qu'on lui a donnée : jeter une teinte de
    // la liste n'efface pas ce qui est déjà écrit.
    const texteIntact = await page.evaluate(() => document.getElementById('wysiwyg-text').innerHTML);
    r.verifie('ce qui est écrit garde sa couleur',
        /127,\s*29,\s*156|#7f1d9c|172|26,\s*188,\s*156/i.test(texteIntact), texteIntact.slice(0, 160));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
