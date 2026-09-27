// UNE FENÊTRE QUI S'OUVRE PASSE DEVANT
//
// « Une fenêtre saisie passe au-dessus des autres quand elle est
// sélectionnée. »
//
// Elle le faisait déjà au premier geste : toucher une fenêtre la fait monter.
// Mais PAS à l'ouverture. Mesuré, trois outils ouverts l'un après l'autre :
// étages 100010, 100010 et « auto ». Trois fenêtres au même niveau — l'ordre à
// l'écran n'était donc plus celui de l'ouverture mais celui du code HTML. On
// cliquait sur un outil, sa fenêtre naissait DERRIÈRE une autre, parfois
// entièrement cachée, et rien ne semblait se produire.
//
// CE CHAPITRE NE COMPTE PAS LES ÉTAGES, IL DEMANDE LA PILE. Un numéro d'étage
// plus grand ne veut rien dire tout seul : deux fenêtres qui vivent dans deux
// contextes d'empilement différents ne se comparent pas par leur numéro. On
// demande donc au navigateur TOUT ce qu'il y a sous un point où les deux
// fenêtres se recouvrent, et l'on regarde laquelle vient en premier. C'est la
// seule question qui ait le même sens que celle du professeur — et une
// première rédaction, qui ne demandait que l'élément du dessus, accusait les
// fenêtres d'un tiers qui passait par là.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Une fenêtre qui s\'ouvre passe devant');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    // On pose les deux fenêtres EXACTEMENT au même endroit : sans recouvrement,
    // la question « laquelle est devant ? » n'a pas de réponse.
    const poser = (s) => page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        el.style.position = 'fixed';
        el.style.left = '320px'; el.style.top = '190px';
        el.style.width = '330px'; el.style.height = '270px';
        el.style.margin = '0'; el.style.transform = 'none';
        return true;
    }, s);

    // Laquelle des deux vient en premier dans la pile, au centre commun ?
    const laquelle = (a, b) => page.evaluate(({ a, b }) => {
        const pile = document.elementsFromPoint(320 + 165, 190 + 135);
        for (const el of pile) {
            if (el.closest(a)) return 'a';
            if (el.closest(b)) return 'b';
        }
        return 'ni l\'une ni l\'autre : ' + pile.slice(0, 3)
            .map(e => e.id || String(e.className).slice(0, 20) || e.tagName).join(' / ');
    }, { a, b });

    // ------------------------------------------------------------------
    // 1. DEUX FENÊTRES OUVERTES L'UNE APRÈS L'AUTRE
    // ------------------------------------------------------------------
    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    await page.waitForTimeout(400);
    await poser('#calc-widget');

    const second = await page.evaluate(async () => {
        const grille = document.getElementById('plugins-grid');
        if (grille) grille.style.display = 'grid';
        const compte = () => [...document.querySelectorAll('[data-equipee="1"]')]
            .filter(el => { const c = el.getBoundingClientRect(); return c.width > 80 && c.height > 80; })
            .filter(el => el.id && el.id !== 'calc-widget');
        for (const b of [...document.querySelectorAll('#plugins-grid .btn')]) {
            const avant = compte().length;
            try { b.click(); } catch (e) { /* cet outil refuse de s'ouvrir */ }
            await new Promise(ok => setTimeout(ok, 350));
            if (compte().length > avant) return compte().pop().id;
        }
        return null;
    });
    r.verifie('un second outil a bien ouvert sa fenêtre', !!second, String(second));
    const AUTRE = '#' + second;
    await poser(AUTRE);
    await page.waitForTimeout(250);

    // CELUI-CI DIT UNE VÉRITÉ SANS LA MESURER, ET IL FAUT LE SAVOIR. Le second
    // outil ouvre sa fenêtre dans un VOILE, qui naît après la calculatrice :
    // à étages égaux, il passait déjà devant tout seul. Saboté en débranchant
    // la correction, ce contrôle-ci reste vert. C'est « rouverte, elle revient
    // devant », plus bas, qui mord — et c'est exactement le geste décrit :
    // on range la calculatrice, on travaille ailleurs, on la redemande.
    r.egal('la fenêtre ouverte en dernier est devant',
        await laquelle('#calc-widget', AUTRE), 'b');

    // ------------------------------------------------------------------
    // 2. ON LA TOUCHE, ELLE REMONTE
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        document.getElementById('calc-widget')
            .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    r.egal('touchée, la première repasse devant',
        await laquelle('#calc-widget', AUTRE), 'a');

    // ------------------------------------------------------------------
    // 3. REFERMÉE PUIS ROUVERTE, ELLE REVIENT DEVANT
    // ------------------------------------------------------------------
    // C'est le geste du professeur : on range la calculatrice, on travaille
    // ailleurs, on la redemande. Elle ne doit pas revenir SOUS ce qu'on a
    // ouvert entre-temps — c'était exactement le défaut.
    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    await page.waitForTimeout(250);
    await page.evaluate((s) => {
        document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }, AUTRE);
    await page.waitForTimeout(150);
    r.egal('rangée, c\'est l\'autre qui est devant',
        await laquelle('#calc-widget', AUTRE), 'b');

    await page.evaluate(() => { document.getElementById('btn-toggle-calc').click(); });
    await page.waitForTimeout(450);
    await poser('#calc-widget');
    await page.waitForTimeout(250);
    r.egal('rouverte, elle revient devant',
        await laquelle('#calc-widget', AUTRE), 'a');

    // ------------------------------------------------------------------
    // 4. LA BANDE NE DÉBORDE PAS
    // ------------------------------------------------------------------
    // On renumérote au lieu d'empiler toujours plus haut : sans quoi la bande
    // finirait par passer devant les questions, et « Effacer le tableau ? »
    // repasserait derrière une fenêtre d'outil.
    const bande = await page.evaluate(() => {
        const etages = [...document.querySelectorAll('[data-equipee="1"]')]
            .map(el => parseInt(el.style.zIndex, 10)).filter(n => isFinite(n));
        return { plusHaut: Math.max(...etages), combien: etages.length };
    });
    r.verifie('plusieurs fenêtres sont bien en jeu', bande.combien >= 2, String(bande.combien));
    r.verifie('et aucune ne sort de sa bande',
        bande.plusHaut <= 100045, 'plus haut : ' + bande.plusHaut);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
