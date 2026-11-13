// ÉCRIRE EN BAS DE L'ÉCRAN.
//
//   « J'ai posé mon curseur pour écrire là où j'ai entouré, et en fait mon
//     curseur d'écriture s'est mis au-dessus : je ne peux pas écrire en bas. »
//
// MESURÉ AVANT LA CORRECTION, barre de style posée en bas d'un écran de 800 :
// un clic à 730 écrivait quinze pixels plus haut, un clic à 760 en écrivait
// quarante-cinq. Le bas de la feuille était hors d'atteinte — et c'est là
// qu'on écrit la consigne, la date, le mot de la fin.
//
// LES DEUX RÉPONSES D'AVANT ÉTAIENT MAUVAISES TOUTES LES DEUX. Déplacer le
// TABLEAU faisait sauter le polycopié sous les yeux de la classe — jusqu'à
// 297 pixels d'un coup, et cumulatif ; c'est pour cela qu'on l'a retiré.
// Déplacer la LIGNE, qui l'a remplacé, pose le texte ailleurs que là où le
// professeur a montré.
//
// LA TROISIÈME EST LA BONNE : ce qui s'écarte, c'est LA BARRE. Elle est le
// meuble de l'application ; le clic est l'intention du professeur.
const { creerRapport, ouvrirApp, tableauVierge, pdfA4 } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Écrire en bas de l\'écran');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    await page.waitForFunction(() => typeof poserPdfFeuilletable === 'function', { timeout: 20000 });
    await page.evaluate(async ({ octets }) => {
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'A4.pdf', { type: 'application/pdf' }));
        await new Promise(k => setTimeout(k, 900));
    }, { octets: Array.from(pdfA4()) });
    await page.waitForTimeout(500);

    // LA BARRE DE STYLE EN BAS, comme lorsqu'on l'y a glissée ou que la page
    // projetée l'y envoie. C'est la seule mise en scène du chapitre.
    await page.evaluate(() => {
        placeDeLaBarreStyle = { x: 500, y: window.innerHeight - 70 };
        placerLaBarreStyle();
    });
    await page.waitForTimeout(350);
    const barreEnBas = await page.evaluate(() => {
        const s = document.getElementById('bar-style').getBoundingClientRect();
        return { barre: [Math.round(s.top), Math.round(s.bottom)], h: window.innerHeight };
    });

    // LA BARRE NE SE MONTRE QU'EN ÉCRIVANT. Tant qu'elle est transparente,
    // elle ne gêne personne et ne fait pas plancher : l'attendre est donc
    // la mise en scène, pas une précaution contre la lenteur de la machine.
    const attendreLaBarre = () => page.waitForFunction(() => {
        const s = document.getElementById('bar-style');
        return s && parseFloat(getComputedStyle(s).opacity) > 0.9;
    }, { timeout: 4000 }).catch(() => null);

    const ecrire = async (y, quoi) => {
        await page.evaluate(() => setMode('text'));
        await attendreLaBarre();
        await page.waitForTimeout(200);
        await page.mouse.click(300, y);
        // ON ATTEND QUE LA BARRE SE POSE, et l'on ne compte pas en
        // millisecondes : elle glisse en douze centièmes de seconde, et une
        // mesure prise en plein vol lirait une position qui n'existe plus un
        // instant après. Deux lectures identiques à cent cinquante
        // millisecondes d'écart disent qu'elle est arrivée.
        await page.waitForFunction(() => {
            const s = document.getElementById('bar-style');
            if (!s) return true;
            const h = Math.round(s.getBoundingClientRect().top);
            const pareil = window.__dernierHautBarre === h;
            window.__dernierHautBarre = h;
            return pareil;
        }, { timeout: 4000, polling: 150 }).catch(() => null);
        await page.waitForTimeout(150);
        const vu = await page.evaluate((cy) => {
            const w = document.getElementById('wysiwyg-text');
            const b = w.getBoundingClientRect();
            const s = document.getElementById('bar-style');
            const q = s.getBoundingClientRect();
            return {
                clic: cy,
                ecart: Math.round(b.top + b.height / 2 - cy),
                boite: [Math.round(b.top), Math.round(b.bottom)],
                barre: [Math.round(q.top), Math.round(q.bottom)],
                ecartee: s.dataset.ecartee === '1',
                couvre: q.top < b.bottom && q.bottom > b.top,
                plafond: plafondDesBarresDuBas(), h: window.innerHeight,
                panY: Math.round(panY)
            };
        }, y);
        if (quoi) { await page.keyboard.type(quoi); await page.waitForTimeout(200); }
        return vu;
    };
    const refermer = async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        return page.evaluate(() => {
            const s = document.getElementById('bar-style');
            const q = s.getBoundingClientRect();
            return { barre: [Math.round(q.top), Math.round(q.bottom)],
                     ecartee: s.dataset.ecartee === '1' };
        });
    };

    // ------------------------------------------------------------------
    // 1. ON ÉCRIT LÀ OÙ L'ON A CLIQUÉ, MÊME SOUS LA BARRE.
    // ------------------------------------------------------------------
    const haut = await ecrire(700, null);
    await refermer();
    const bas = await ecrire(760, 'Devoirs');

    r.verifie('la barre de style fait bien plancher en bas',
        haut.plafond < haut.h, JSON.stringify(haut) + ' — elle est à '
        + JSON.stringify(barreEnBas.barre));
    r.verifie('un clic tout en bas écrit tout en bas',
        bas.ecart === 0, JSON.stringify(bas) + ' — quarante-cinq pixels plus haut avant');
    r.verifie('la barre s\'est écartée pour lui faire place',
        bas.ecartee === true, JSON.stringify(bas));
    r.verifie('et elle ne couvre plus la ligne qu\'on écrit',
        bas.couvre === false, JSON.stringify(bas));
    r.verifie('la barre est passée AU-DESSUS de la ligne, pas en dessous',
        bas.barre[1] <= bas.boite[0], JSON.stringify(bas));
    // JUSTE AU-DESSUS, ET PAS PLUS HAUT. C'est ici que se mesure l'écart lui-
    // même : la première version l'appliquait DEUX FOIS — 138 pixels au lieu
    // de 70 — parce qu'elle lisait la barre en plein vol. Le trou entre le bas
    // de la barre et le haut de la ligne doit faire les huit pixels prévus.
    r.verifie('et elle se range à huit pixels de la ligne, pas à soixante-dix',
        (bas.boite[0] - bas.barre[1]) >= 6 && (bas.boite[0] - bas.barre[1]) <= 12,
        'trou de ' + (bas.boite[0] - bas.barre[1]) + ' px — ' + JSON.stringify(bas));
    // ET ÉCARTÉE, ELLE NE POUSSE PLUS RIEN. Elle est montée AU-DESSUS de la
    // ligne, exprès : la compter encore comme plancher ferait remonter la
    // ligne vers elle, et tout ce qui se place « en bas faute de mieux »
    // irait se ranger sous une barre qui n'y est plus.
    r.egal('une barre écartée ne fait plus plancher', bas.plafond, bas.h,
        JSON.stringify(bas));

    // ------------------------------------------------------------------
    // 2. ET LE TABLEAU NE BOUGE PAS D'UN PIXEL.
    //
    //    La règle acquise de longue date : « faire sauter toute la page sous
    //    la main de celui qui vient de montrer un endroit serait un autre
    //    défaut, pas une correction. »
    // ------------------------------------------------------------------
    r.egal('le tableau ne bouge pas', bas.panY, haut.panY,
        'panY ' + haut.panY + ' puis ' + bas.panY);

    // ------------------------------------------------------------------
    // 3. ELLE REDESCEND EXACTEMENT À SA PLACE.
    // ------------------------------------------------------------------
    const rendue = await refermer();
    r.verifie('la barre redescend chez elle une fois la ligne posée',
        rendue.ecartee === false
        && rendue.barre[0] === barreEnBas.barre[0], JSON.stringify(rendue)
        + ' — elle était à ' + JSON.stringify(barreEnBas.barre));

    // ------------------------------------------------------------------
    // 4. ELLE NE S'ÉCARTE QUE SI LA LIGNE LA TOUCHE.
    // ------------------------------------------------------------------
    const loin = await ecrire(500, null);
    await refermer();
    r.verifie('une ligne loin de la barre ne la dérange pas',
        loin.ecartee === false && loin.ecart === 0, JSON.stringify(loin));

    // ------------------------------------------------------------------
    // 5. ELLE NE DÉRIVE PAS.
    //
    //    MESURÉ SUR LA PREMIÈRE VERSION : la barre s'écartait DEUX FOIS —
    //    138 pixels au lieu de 70. L'écart se calculait sur la position du
    //    moment, et la barre glisse en douze centièmes de seconde : le
    //    deuxième appel la mesurait en plein vol et ajoutait son retard.
    //    Deux ouvertures au même endroit doivent donner le MÊME écart.
    // ------------------------------------------------------------------
    // LA TABLE RASE EST NÉCESSAIRE : « Devoirs » est écrit à cet endroit-là,
    // et recliquer dessus rouvre CE bloc au lieu d'en ouvrir un neuf. Un bloc
    // qu'on rouvre garde sa place, et les barres ne s'écartent pas pour lui —
    // c'est la règle, pas un défaut.
    await page.evaluate(() => { texts.length = 0; selectedItems = []; draw(); });
    await page.waitForTimeout(200);
    const unFois = await ecrire(760, null);
    await refermer();
    const deuxFois = await ecrire(760, null);
    await refermer();
    r.verifie('les deux fois, la barre s\'écarte',
        unFois.ecartee === true && deuxFois.ecartee === true,
        JSON.stringify([unFois.barre, deuxFois.barre]));
    // ET DEUX APPELS EN PLEIN GLISSEMENT NE S'ADDITIONNENT PAS.
    //
    // C'est la panne de la première version, mesurée : 138 pixels au lieu de
    // 70. L'écart se calculait sur « getBoundingClientRect », qui rend la
    // position DU MOMENT ; la barre glissant en douze centièmes de seconde,
    // un second appel la mesurait en plein vol et ajoutait son retard. On
    // provoque donc exprès ce second appel, quarante millisecondes après le
    // premier — au milieu du glissement.
    const enPleinVol = await ecrire(760, null);
    const deuxAppels = await page.evaluate(async () => {
        // ON REPART DE LA BARRE AU REPOS : sinon le premier appel ne la fait
        // pas bouger — elle est déjà à sa place — aucun glissement ne
        // commence, et les suivants la lisent immobile. Le contrôle ne
        // mesurait alors rien du tout.
        rendreLesBarresDuBas();
        await new Promise(k => setTimeout(k, 300));
        const w = document.getElementById('wysiwyg-text');
        const haut = w.getBoundingClientRect().top;
        // QUATRE APPELS, pas deux : chacun lit la barre en plein vol et
        // ajoute son retard. Deux suffisaient à la faire dériver de quatre
        // pixels — trop peu pour qu'on puisse l'affirmer ; quatre la font
        // sortir de sa place sans ambiguïté possible.
        for (let i = 0; i < 4; i++) {
            ecarterLesBarresDuBas(haut);
            await new Promise(k => setTimeout(k, 40));
        }
        await new Promise(k => setTimeout(k, 400));
        const s = document.getElementById('bar-style').getBoundingClientRect();
        return { trou: Math.round(w.getBoundingClientRect().top - s.bottom) };
    });
    await refermer();
    r.verifie('deux écartements d\'affilée ne s\'additionnent pas',
        deuxAppels.trou >= 6 && deuxAppels.trou <= 12,
        'trou de ' + deuxAppels.trou + ' px après deux appels (huit attendus)'
        + ' — barre à ' + JSON.stringify(enPleinVol.barre));

    r.egal('deux fois le même clic, deux fois le même écartement',
        deuxFois.barre[0], unFois.barre[0],
        'barre à ' + unFois.barre[0] + ' puis ' + deuxFois.barre[0]);

    // ------------------------------------------------------------------
    // 6. UNE BARRE TROP HAUTE NE SORT PAS PAR LE HAUT.
    //
    //    L'écarter la mettrait hors de vue : on la laisse alors où elle est,
    //    et l'ancienne règle — remonter la ligne — reprend la main. Mieux
    //    vaut une ligne déplacée qu'une barre introuvable.
    // ------------------------------------------------------------------
    // LA MISE EN SCÈNE A DEMANDÉ TROIS ESSAIS, et les deux premiers ne
    // mesuraient rien — sabotés, ils passaient quand même :
    //
    //   — une barre de 700 pixels posée à 80 du haut n'avait besoin de monter
    //     que de 35 : elle tenait, et le garde-fou n'était jamais atteint ;
    //   — une barre haute comme l'écran recouvrait le point du clic, qui
    //     tombait sur elle ; et touchant aussi le bord HAUT, elle devenait un
    //     plancher du haut, où c'est l'autre règle qui joue.
    //
    // Il faut donc une barre qui touche le bord bas SANS toucher le haut, et
    // plus haute que la place libre au-dessus de la ligne : 460 pixels posés
    // à 300, et une ligne écrite à 400. La monter de 375 la mettrait à −75,
    // hors de vue — c'est exactement le cas que le garde-fou refuse.
    await page.evaluate(() => {
        const s = document.getElementById('bar-style');
        s.style.height = '460px';
        // Et LOIN du point du clic : posée au milieu, elle le recouvrirait.
        placeDeLaBarreStyle = { x: 900, y: 300 };
        placerLaBarreStyle();
    });
    await page.waitForTimeout(350);
    const geante = await ecrire(400, null);
    await refermer();
    r.verifie('une barre qui ne peut pas monter ne monte pas',
        geante.ecartee === false, JSON.stringify(geante));
    r.verifie('et c\'est l\'ancien secours qui reprend la main',
        geante.ecart !== 0 || geante.panY !== bas.panY, JSON.stringify(geante)
        + ' — faute de mieux, quelque chose cède : la ligne ou le tableau');
    await page.evaluate(() => {
        const s = document.getElementById('bar-style');
        s.style.height = '';
        placeDeLaBarreStyle = { x: 500, y: window.innerHeight - 70 };
        placerLaBarreStyle();
    });
    await page.waitForTimeout(300);

    // ------------------------------------------------------------------
    // 7. LES TEXTES POSÉS SONT BIEN À DES ENDROITS DIFFÉRENTS.
    //
    //    C'est la demande, en fin de compte : écrire plusieurs lignes au bas
    //    d'un polycopié sans qu'elles se rassemblent toutes à la même
    //    hauteur.
    // ------------------------------------------------------------------
    await page.evaluate(() => { texts.length = 0; draw(); });
    for (const y of [700, 740, 775]) { await ecrire(y, 'x'); await refermer(); }
    const poses = await page.evaluate(() => texts.map(t => Math.round(t.y)).sort((a, b) => a - b));
    r.egal('trois lignes écrites en bas font trois hauteurs', poses.length, 3,
        JSON.stringify(poses));
    r.verifie('et elles sont bien distinctes',
        poses.length === 3 && poses[1] - poses[0] > 20 && poses[2] - poses[1] > 20,
        JSON.stringify(poses));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
