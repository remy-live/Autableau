// CE QU'ON TAPE NE SE PERD PAS.
//
// « J'ai eu quelque bugs de texte qui disparaissent quand je me déplace dans
// la page. » — un enseignant qui s'en sert tous les jours en classe, et une
// collègue à qui il l'a conseillé, qui a eu les mêmes.
//
// Il n'y avait pas de bug du texte. Il y avait DEUX ENDROITS qui baissaient le
// rideau de la saisie sans rien enregistrer :
//
//   « setMode » — prendre un autre outil — faisait « display = none » et le
//   mot tapé n'existait plus nulle part ;
//   « loadPage » — changer de feuille — rangeait la page qu'on quitte AVANT
//   que le mot y soit, et rangeait donc une page sans lui.
//
// Mesuré avant correctif : on écrit « CORRECTION » sur la page 2, on va page
// 1, on revient — zéro texte sur les deux pages. Et le tampon de la saisie
// gardait la frappe perdue : le mot suivant sortait collé au précédent,
// « AAABBB », n'importe où sur le tableau. Ce qui disparaissait revenait en
// fantôme.
//
// Le clic ailleurs, Échap et le départ du curseur posaient DÉJÀ la ligne — ce
// chapitre le vérifie aussi, pour que le correctif n'ait rien défait. Les deux
// chemins fautifs y passent maintenant, et le tampon est vidé dans tous les
// cas : un rideau baissé ne garde rien derrière lui.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Ce qu\'on tape ne se perd pas');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 }, tactile: true });
    await tableauVierge(page);

    // On écrit, en laissant la saisie OUVERTE : c'est tout l'objet du chapitre.
    const ecrire = async (mot, x, y) => {
        await page.evaluate(() => { if (typeof setMode === 'function') setMode('text'); });
        await page.mouse.click(x, y);
        await page.waitForTimeout(260);
        await page.keyboard.type(mot);
        await page.waitForTimeout(140);
    };
    const etat = () => page.evaluate(() => ({
        n: texts.length,
        mots: texts.map(t => t.content),
        tampon: document.getElementById('wysiwyg-text').innerText,
        ouverte: document.getElementById('wysiwyg-text').style.display === 'block'
    }));
    const vider = () => page.evaluate(() => {
        texts.length = 0;
        const w = document.getElementById('wysiwyg-text');
        w.style.display = 'none'; w.innerHTML = '';
    });

    // ------------------------------------------------------------------
    // 1. PRENDRE UN AUTRE OUTIL POSE LE MOT.
    //
    // « setMode » est appelé de partout — le coin, les palettes des plugins,
    // le bouton d'un instrument qui rafraîchit la barre de style. Aucun de ces
    // chemins ne passe par le départ du curseur, et c'est là que le mot
    // mourait. On vise la fonction elle-même : c'est elle qui était en faute,
    // et la corriger là couvre les cent quatre-vingts appels d'un coup.
    // ------------------------------------------------------------------
    await vider();
    await ecrire('AVANT', 400, 300);
    const enFrappe = await etat();
    r.egal('la saisie est bien ouverte, le mot pas encore posé',
        [enFrappe.ouverte, enFrappe.n, enFrappe.tampon], [true, 0, 'AVANT'],
        JSON.stringify(enFrappe));

    await page.evaluate(() => setMode('freehand'));
    await page.waitForTimeout(200);
    const apresOutil = await etat();
    r.egal('prendre le crayon POSE le mot au lieu de le jeter',
        [apresOutil.n, apresOutil.mots], [1, ['AVANT']], JSON.stringify(apresOutil));
    r.egal('et le tampon de la saisie ne garde rien', apresOutil.tampon, '',
        JSON.stringify(apresOutil));

    // ------------------------------------------------------------------
    // 2. LE FANTÔME. La frappe perdue ne doit pas ressortir collée au mot
    //    suivant, écrit AILLEURS. Au même endroit ce serait une ré-édition
    //    légitime du bloc : le contrôle écrit donc loin du premier, sinon il
    //    ne mesure rien.
    // ------------------------------------------------------------------
    await ecrire('NEUF', 950, 620);
    await page.evaluate(() => poserLaFrappeEnCours());
    await page.waitForTimeout(180);
    const deuxBlocs = await page.evaluate(() => texts
        .map(t => t.content)
        .sort());
    r.egal('le mot suivant, écrit ailleurs, sort seul — aucun fantôme collé',
        deuxBlocs, ['AVANT', 'NEUF'], JSON.stringify(deuxBlocs));

    // ------------------------------------------------------------------
    // 3. CHANGER DE FEUILLE POSE LE MOT SUR LA FEUILLE QU'ON QUITTE.
    //
    // C'est la plainte, mot pour mot : « du texte qui disparaît quand je me
    // déplace dans la page ». Le mot doit être écrit AVANT que « syncPage »
    // range la page — sinon on range une page sans lui.
    // ------------------------------------------------------------------
    await vider();
    await page.evaluate(() => ajouterUnePageVierge());
    await page.waitForTimeout(200);
    const combien = await page.evaluate(() => ({ n: pages.length, ici: currentPageIndex }));
    r.egal('deux pages de tableau, on est sur la seconde',
        [combien.n >= 2, combien.ici >= 1], [true, true], JSON.stringify(combien));

    await ecrire('CORRECTION', 600, 400);
    await page.evaluate(() => loadPage(0));
    await page.waitForTimeout(220);
    const surLAutre = await etat();
    r.egal('sur l\'autre feuille, le tampon est vide — rien ne voyage',
        surLAutre.tampon, '', JSON.stringify(surLAutre));

    await page.evaluate(() => loadPage(1));
    await page.waitForTimeout(220);
    const revenu = await etat();
    r.egal('EN REVENANT, LE MOT EST LÀ — c\'était la plainte',
        [revenu.n, revenu.mots], [1, ['CORRECTION']], JSON.stringify(revenu));

    // Et il n'a pas non plus débordé sur la feuille d'à côté.
    const ailleurs = await page.evaluate(() => {
        if (typeof syncPage === 'function') syncPage();
        return (pages[0].texts || []).map(t => t.content);
    });
    r.egal('et il n\'est PAS sur l\'autre feuille', ailleurs, [],
        JSON.stringify(ailleurs));

    // ------------------------------------------------------------------
    // 4. CE QUI MARCHAIT DÉJÀ MARCHE TOUJOURS. Le correctif ajoute un chemin
    //    de pose ; il ne doit pas en casser un.
    // ------------------------------------------------------------------
    await vider();
    await ecrire('ECHAP', 500, 350);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const parEchap = await etat();
    r.egal('Échap pose la ligne, comme avant', [parEchap.n, parEchap.mots],
        [1, ['ECHAP']], JSON.stringify(parEchap));

    await vider();
    await ecrire('CLIC', 500, 350);
    await page.mouse.click(1000, 650);          // le clic ailleurs valide et rouvre
    await page.waitForTimeout(250);
    const parClic = await page.evaluate(() => texts.map(t => t.content));
    r.egal('le clic ailleurs pose la ligne, comme avant', parClic, ['CLIC'],
        JSON.stringify(parClic));

    // ------------------------------------------------------------------
    // 5. UNE SAISIE VIDE NE DOIT PAS CRÉER DE BLOC. Poser « ce qui est tapé »
    //    quand rien n'est tapé ne doit rien poser : sans cela, chaque
    //    changement d'outil sèmerait un bloc vide sur le tableau.
    // ------------------------------------------------------------------
    await vider();
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(700, 450);
    await page.waitForTimeout(260);
    await page.evaluate(() => setMode('pointer'));
    await page.waitForTimeout(200);
    const rienTape = await etat();
    r.egal('une saisie ouverte mais vide ne laisse aucun bloc derrière elle',
        rienTape.n, 0, JSON.stringify(rienTape));

    // ------------------------------------------------------------------
    // 6. LE FANTÔME D'AVANT LE CORRECTIF EST DÉSARMÉ.
    //
    // Un enseignant qui garde son tableau ouvert toute la journée reçoit la
    // nouvelle version par le service worker, sans recharger la page : son
    // tampon peut donc porter DÉJÀ une frappe perdue par l'ancien code,
    // rideau baissé. Elle ne doit pas ressortir collée au mot suivant.
    //
    // C'est ce qui justifie le vidage inconditionnel du tampon dans
    // « poserLaFrappeEnCours » : sans ce contrôle, cette ligne ne mesurait
    // rien — elle survivait à son sabotage, et une correction qu'on ne mesure
    // pas n'en est pas une.
    // ------------------------------------------------------------------
    await vider();
    await page.evaluate(() => {
        // L'état exact que laissait l'ancien « setMode » : rideau baissé,
        // tampon plein.
        const w = document.getElementById('wysiwyg-text');
        w.style.display = 'none';
        w.innerHTML = 'PERDU-AVANT-LA-MISE-A-JOUR';
    });
    await ecrire('PROPRE', 450, 520);
    await page.evaluate(() => poserLaFrappeEnCours());
    await page.waitForTimeout(200);
    const sansFantome = await page.evaluate(() => texts.map(t => t.content));
    r.egal('une frappe laissée par l\'ancienne version ne se recolle pas au mot suivant',
        sansFantome, ['PROPRE'], JSON.stringify(sansFantome));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
