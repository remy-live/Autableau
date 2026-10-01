// LE CLAVIER DE L'ÉCRAN
//
// « On pourrait rajouter un clavier optionnel pour le texte, comme cela on
// aura vraiment une appli qui peut se passer du clavier. »
// « Parfois on n'a pas besoin que ça s'ouvre tout seul, je suis plus souvent
// à l'ordi qu'au TBI. »
// « Il faut que le clavier puisse s'étendre en bas, se bouger voire changer
// de taille. »
//
// LE GESTE DIT L'OUTIL. La seconde phrase écarte toute règle de durée et tout
// réglage à retenir : ce qui sépare le TBI du bureau, c'est qu'au tableau on
// TOUCHE et qu'au bureau on CLIQUE. L'événement le dit lui-même —
// « pointerType » vaut « touch » ou « mouse » —, tout de suite, sans rien
// chronométrer. À la souris, le clavier ne paraît jamais.
//
// C'EST CE CHAPITRE QUI TIENT CETTE PROMESSE. Elle ne se voit pas à l'œil :
// qui essaie à la souris ne verra rien, et conclura que le clavier ne marche
// pas ; qui essaie au doigt ne saura pas qu'il aurait dû se taire ailleurs.
// Seules les deux mesures côte à côte disent la règle.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le clavier de l\'écran');
    // « tactile » : le contexte doit savoir produire de VRAIES tapes, sans
    // quoi la moitié de ce chapitre ne mesurerait rien.
    const { context, page, erreurs } = await ouvrirApp(browser, {
        viewport: { width: 1280, height: 800 }, tactile: true });
    await page.waitForFunction(() => typeof basculerLeClavier === 'function', { timeout: 20000 });
    await tableauVierge(page);

    const etat = () => page.evaluate(() => {
        const e = document.getElementById('clavier-ecran');
        const q = e ? e.getBoundingClientRect() : null;
        return {
            ouvert: clavierEstOuvert(),
            saisie: wysiwygText.style.display,
            boite: q ? { l: Math.round(q.width), h: Math.round(q.height),
                         x: Math.round(q.left), bas: Math.round(q.bottom) } : null,
            enBas: !!(e && e.classList.contains('clavier-en-bas'))
        };
    });
    const toucheA = (sel) => page.evaluate((s) => {
        const e = document.querySelector('#clavier-ecran ' + s);
        if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) };
    }, sel);
    const frapper = async (sel) => {
        const p = await toucheA(sel);
        if (!p) return false;
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(110);
        return true;
    };

    // ------------------------------------------------------------------
    // 1. À LA SOURIS, IL NE PARAÎT PAS
    // ------------------------------------------------------------------
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 300);
    await page.waitForTimeout(450);
    const souris = await etat();
    r.egal('la saisie s\'ouvre bien au clic', souris.saisie, 'block', JSON.stringify(souris));
    r.egal('ET LE CLAVIER NE PARAÎT PAS', souris.ouvert, false, JSON.stringify(souris));

    // ------------------------------------------------------------------
    // 2. AU DOIGT, IL PARAÎT
    // ------------------------------------------------------------------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(400, 300);
    await page.waitForTimeout(600);
    const doigt = await etat();
    r.egal('la saisie s\'ouvre aussi au doigt', doigt.saisie, 'block', JSON.stringify(doigt));
    r.egal('ET LE CLAVIER PARAÎT', doigt.ouvert, true, JSON.stringify(doigt));
    r.verifie('avec de quoi écrire : plus de quarante touches',
        (await page.evaluate(() => document.querySelectorAll('#clavier-ecran .clavier-touche').length)) >= 40,
        String(await page.evaluate(() => document.querySelectorAll('#clavier-ecran .clavier-touche').length)));

    // ------------------------------------------------------------------
    // 3. IL ÉCRIT, ET IL NE VOLE PAS LE CURSEUR
    //
    // Une touche d'écran est un BOUTON, et un bouton prend le focus : la
    // première frappe aurait écrit, et la seconde serait tombée dans le vide.
    // Chaque touche annule donc son « pointerdown ».
    // ------------------------------------------------------------------
    for (const l of ['b', 'o', 'n']) {
        r.verifie(`la touche « ${l} » existe`, await frapper(`.clavier-touche[data-lettre="${l}"]`), l);
    }
    const ecrit = await page.evaluate(() => ({
        texte: wysiwygText.textContent,
        focus: document.activeElement ? document.activeElement.id : null
    }));
    r.egal('TROIS TOUCHES ÉCRIVENT TROIS LETTRES', ecrit.texte, 'bon');
    r.egal('et le curseur n\'a pas quitté la saisie', ecrit.focus, 'wysiwyg-text');

    // ------------------------------------------------------------------
    // 4. LA MAJUSCULE NE VAUT QUE POUR LA LETTRE SUIVANTE
    //
    // C'est ce que fait le clavier d'un téléphone, et ce qu'on veut neuf fois
    // sur dix : un prénom, un début de phrase.
    // ------------------------------------------------------------------
    await frapper('.clavier-touche[data-act="majuscule"]');
    const montree = await page.evaluate(() =>
        document.querySelector('#clavier-ecran .clavier-touche[data-lettre="a"]').textContent);
    r.egal('les touches passent en majuscules', montree, 'A');
    await frapper('.clavier-touche[data-lettre="j"]');
    await frapper('.clavier-touche[data-lettre="o"]');
    r.egal('UNE SEULE MAJUSCULE, PUIS ON REDESCEND',
        await page.evaluate(() => wysiwygText.textContent), 'bonJo');
    r.egal('et les touches le montrent',
        await page.evaluate(() =>
            document.querySelector('#clavier-ecran .clavier-touche[data-lettre="a"]').textContent), 'a');

    // ------------------------------------------------------------------
    // 5. L'ESPACE ET L'EFFACEMENT
    // ------------------------------------------------------------------
    await frapper('.clavier-touche[data-act="espace"]');
    // UN ESPACE INSÉCABLE, ET C'EST LE NAVIGATEUR QUI A RAISON : un espace
    // ordinaire posé en fin de ligne dans un bloc éditable serait replié à
    // l'affichage, donc perdu. « execCommand » pose donc « \u00a0 ». Le
    // contrôle compare le NOMBRE de caractères et la nature du dernier, plutôt
    // que d'exiger un octet qui n'a pas lieu d'être.
    const apresEspace = await page.evaluate(() => wysiwygText.textContent);
    r.egal('l\'espace s\'écrit', apresEspace.length, 6, JSON.stringify(apresEspace));
    r.verifie('et c\'est bien une espace', /[\s\u00a0]$/.test(apresEspace), JSON.stringify(apresEspace));
    r.egal('le reste est intact', apresEspace.slice(0, 5), 'bonJo');
    await frapper('.clavier-touche[data-act="effacer"]');
    r.egal('et l\'effacement reprend la dernière lettre',
        await page.evaluate(() => wysiwygText.textContent), 'bonJo');

    // ------------------------------------------------------------------
    // 6. IL SE RANGE AU BORD BAS, SUR TOUTE LA LARGEUR
    //
    // L'équipement commun des fenêtres pose « max-width: calc(100vw - 16px) »
    // EN LIGNE, pour qu'aucune fenêtre flottante ne déborde. La règle est
    // bonne pour une fenêtre et fausse pour un clavier collé au bord : mesuré,
    // 1264 pixels au lieu de 1280, seize pixels de blanc à droite.
    // ------------------------------------------------------------------
    const avantRangement = await etat();
    r.egal('avant rangement, il flotte', avantRangement.enBas, false, JSON.stringify(avantRangement));
    await frapper('.clavier-ranger');
    const range = await etat();
    const ecran = await page.evaluate(() => ({ l: innerWidth, h: innerHeight }));
    r.egal('il se range', range.enBas, true, JSON.stringify(range));
    r.egal('IL PREND TOUTE LA LARGEUR', range.boite.l, ecran.l, JSON.stringify({ range, ecran }));
    r.egal('et il touche le bord bas', range.boite.bas, ecran.h, JSON.stringify({ range, ecran }));
    r.egal('depuis le bord gauche', range.boite.x, 0, JSON.stringify(range));

    // ------------------------------------------------------------------
    // 7. RANGÉ, IL DEVIENT UN MEUBLE DU BORD — FLOTTANT, NON
    //
    // Ce qui se place « en bas faute de mieux » doit s'arrêter au-dessus de
    // lui. Mais une fenêtre qu'on déplace d'un doigt n'est pas un meuble :
    // flottant, il se pose à vingt-quatre pixels du bord, ce qui suffisait à
    // le faire compter — le plafond tombait à 476 et les barres remontaient
    // pour rien.
    // ------------------------------------------------------------------
    const planchers = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const lu = {};
        lu.range = plafondDesBarresDuBas();
        rangerLeClavierEnBas(false); await attendre(150);
        lu.flottant = plafondDesBarresDuBas();
        fermerLeClavier(true); await attendre(150);
        lu.ferme = plafondDesBarresDuBas();
        return Object.assign(lu, { ecran: innerHeight });
    });
    r.verifie('rangé, il relève le plancher des barres',
        planchers.range < planchers.ecran - 100, JSON.stringify(planchers));
    r.egal('FLOTTANT, IL NE LE RELÈVE PAS', planchers.flottant, planchers.ecran, JSON.stringify(planchers));
    r.egal('et fermé non plus', planchers.ferme, planchers.ecran, JSON.stringify(planchers));

    // ------------------------------------------------------------------
    // 8. UN REFUS VAUT POUR LA SÉANCE
    //
    // Qui le ferme à la main ne doit plus le voir s'ouvrir seul. C'est la
    // réponse directe à « parfois on n'a pas besoin que ça s'ouvre tout
    // seul » : une fois suffit à le dire, et son bouton le rappelle.
    // ------------------------------------------------------------------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(500, 320);
    await page.waitForTimeout(600);
    const apresRefus = await etat();
    r.egal('APRÈS L\'AVOIR FERMÉ, IL NE SE ROUVRE PLUS SEUL', apresRefus.ouvert, false,
        JSON.stringify(apresRefus));

    // Mais son bouton le rappelle, et le redemander lève le refus.
    await page.evaluate(() => basculerLeClavier());
    await page.waitForTimeout(300);
    r.egal('son bouton le rappelle', (await etat()).ouvert, true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(560, 360);
    await page.waitForTimeout(600);
    r.egal('et le redemander lui rend sa spontanéité', (await etat()).ouvert, true);

    await page.evaluate(() => { fermerLeClavier(true); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
