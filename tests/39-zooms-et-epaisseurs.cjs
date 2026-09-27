// LE DOCUMENT SE RÈGLE D'UN COUP, ET LES CRANS S'AFFINENT.
//
// Deux retours du même ordre — un réglage qui ne va pas là où on l'attend, et
// des crans trop gros pour ce qu'on veut viser.
//
// « Quand on importe un pdf et qu'on modifie le zoom, ça ne modifie que pour
// la page courante. Ce serait impeccable si le paramétrage était global pour
// tout le pdf. » Découpé en autant de pages de tableau qu'il a de pages, un
// PDF de douze feuilles donnait douze vues indépendantes : on réglait le
// grossissement pour lire, on tournait la page, tout était à refaire. Douze
// fois.
//
// « Les zooms sont trop brutaux en général. Je pense que laisser tel quel plus
// permettre de saisir le niveau de zoom en texte serait le mieux. » Et, pour
// le stylo : « la taille 2 est trop petite pour moi et la taille 3 est trop
// grande ! Bref, il me faudrait une taille 2,5 ! »
//
// CE QUE CETTE SUITE TIENT :
//
//   — les pages d'un même import partagent grossissement et cadrage, et elles
//     seules : celles que l'enseignant a créées gardent la leur ;
//   — deux imports restent deux documents ;
//   — l'épaisseur du trait accepte le demi-point, et le trait qu'on pose la
//     porte vraiment ;
//   — le grossissement se tape en pour cent, et le chiffre et le curseur
//     disent la même chose.
const { creerRapport, ouvrirApp, petitPdf, rechargerApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Zooms et épaisseurs');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    // =================================================================
    // 1. UN PDF SE RÈGLE D'UN SEUL COUP
    // =================================================================
    const octets = Array.from(petitPdf(['Une', 'Deux', 'Trois']));
    const importer = (nom) => page.evaluate(async ({ octets, nom }) => {
        reglerImportPdf(false);        // une page de tableau par page du PDF
        await loadPdf(new File([new Uint8Array(octets)], nom, { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 2500));
        return pages.length;
    }, { octets, nom });

    const vues = () => page.evaluate(() => pages.map(p => ({
        z: Math.round((p.zoom || 1) * 1000) / 1000,
        x: Math.round(p.panX), lot: !!lotDuDocument(p)
    })));

    await page.evaluate(() => { pages = [createNewPage()]; currentPageIndex = -1; loadPage(0); });
    const combien = await importer('cours.pdf');
    r.egal('le PDF de trois pages en pose trois', combien, 3);

    const depart = await vues();
    r.verifie('et les trois se reconnaissent comme un même document',
        depart.every(v => v.lot), JSON.stringify(depart));

    // On grossit sur la première, puis on tourne la page.
    await page.evaluate(() => { zoom = zoom * 2; panX += 40; draw(); });
    await page.evaluate(() => loadPage(1));
    await page.waitForTimeout(250);
    const suite = await vues();
    r.verifie('le grossissement réglé sur une page vaut pour tout le document',
        suite.every(v => v.z === suite[0].z && v.x === suite[0].x), JSON.stringify(suite));
    const surLaDeux = await page.evaluate(() => ({ z: Math.round(zoom * 1000) / 1000, x: Math.round(panX) }));
    r.egal('et la page où l\'on arrive le porte vraiment',
        surLaDeux, { z: suite[1].z, x: suite[1].x });

    // Une page créée à la main garde la sienne : rien ne dit qu'elle ressemble
    // au document.
    const perso = await page.evaluate(() => {
        pages.push(createNewPage());
        loadPage(3);
        zoom = 0.5; panX = 10;
        loadPage(0);
        return pages.map(p => Math.round((p.zoom || 1) * 1000) / 1000);
    });
    await page.waitForTimeout(200);
    r.verifie('une page du professeur garde son propre réglage',
        perso[3] === 0.5 && perso[0] !== 0.5, JSON.stringify(perso));

    // Deux imports = deux documents. On grossit sur le second, le premier ne
    // bouge pas.
    await page.evaluate(() => { pages = [createNewPage()]; currentPageIndex = -1; loadPage(0); });
    await importer('un.pdf');
    const lotUn = await page.evaluate(() => pages[0].lotPdf);
    await page.evaluate(() => loadPage(pages.length - 1));
    await importer('deux.pdf');
    const deuxLots = await page.evaluate((premier) => {
        const dernier = pages.length - 1;
        loadPage(dernier);
        zoom = 3.5; panX = 77;
        loadPage(0);
        return {
            lots: new Set(pages.map(p => p.lotPdf)).size,
            duPremier: pages.filter(p => p.lotPdf === premier).map(p => Math.round(p.zoom * 100) / 100),
            desAutres: pages.filter(p => p.lotPdf && p.lotPdf !== premier).map(p => Math.round(p.zoom * 100) / 100)
        };
    }, lotUn);
    await page.waitForTimeout(200);
    r.egal('deux imports font deux documents', deuxLots.lots, 2);
    r.verifie('le second se règle sans toucher au premier',
        deuxLots.desAutres.every(z => z === 3.5) && deuxLots.duPremier.every(z => z !== 3.5),
        JSON.stringify(deuxLots));

    // Un tableau enregistré avant que le lot porte un nom n'en a pas : on se
    // rabat sur l'empreinte du fichier, et le partage marche quand même.
    const ancien = await page.evaluate(() => {
        pages = [createNewPage(), createNewPage(), createNewPage()];
        pages.forEach((p, i) => {
            p.pdfMetadata = { fileName: 'vieux.pdf', fileHash: 'vieux.pdf_1234_5678', pageNum: i };
            p.zoom = 1; p.panX = 0; p.panY = 0;
        });
        currentPageIndex = -1; loadPage(0);
        zoom = 2.25; panX = 33;
        loadPage(1);
        return pages.map(p => Math.round(p.zoom * 100) / 100);
    });
    await page.waitForTimeout(200);
    r.egal('un ancien tableau se regroupe par l\'empreinte du fichier',
        ancien, [2.25, 2.25, 2.25]);

    // =================================================================
    // 2. L'ÉPAISSEUR AU DEMI-POINT
    // =================================================================
    await page.evaluate(() => { pages = [createNewPage()]; currentPageIndex = -1; loadPage(0); setMode('freehand'); });

    const crans = await page.evaluate(() => {
        const c = document.getElementById('line-width');
        const n = document.getElementById('line-width-num');
        return { curseur: c.step, champ: n.step, mini: c.min };
    });
    r.egal('le curseur avance par demi-points', { curseur: crans.curseur, champ: crans.champ },
        { curseur: '0.5', champ: '0.5' });

    const demi = await page.evaluate(() => {
        reglerEpaisseurTrait(2.5, 'test');
        return {
            style: activeStyle.lineWidth,
            curseur: document.getElementById('line-width').value,
            champ: document.getElementById('line-width-num').value
        };
    });
    r.egal('deux et demi existe, et les trois affichages s\'accordent',
        demi, { style: 2.5, curseur: '2.5', champ: '2.5' });

    const tape = await page.evaluate(() => {
        const n = document.getElementById('line-width-num');
        n.value = '2.5';
        n.dispatchEvent(new Event('input', { bubbles: true }));
        return activeStyle.lineWidth;
    });
    r.egal('et il se tape dans le champ', tape, 2.5);

    // LE CURSEUR AUSSI LE DONNE. Il avance par demis ; s'il rendait sa valeur
    // en nombre entier, le demi-point serait perdu à la lecture et le cran du
    // milieu ramènerait à deux — le curseur aurait l'air cassé.
    const parLeCurseur = await page.evaluate(() => {
        reglerEpaisseurTrait(7, 'test');
        const c = document.getElementById('line-width');
        c.value = '2.5';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return { style: activeStyle.lineWidth, champ: document.getElementById('line-width-num').value };
    });
    r.egal('et le curseur le donne aussi', parLeCurseur, { style: 2.5, champ: '2.5' });

    // Le trait posé le porte vraiment : le réglage ne sert à rien s'il
    // s'arrondit au moment d'écrire.
    const traitPose = await page.evaluate(() => {
        freehands.length = 0;
        reglerEpaisseurTrait(2.5, 'test');
        setMode('freehand');
        panX = 300; panY = 300; zoom = 1;
        return null;
    });
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(500, 460, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    r.egal('le trait qu\'on pose fait bien deux et demi',
        await page.evaluate(() => freehands.length ? freehands[0].width : null), 2.5);

    // Les bornes : on ne descend pas sous le demi-point, on ne monte pas
    // au-dessus de soixante, et un champ vidé ne pose pas « pas un nombre ».
    const bornes = await page.evaluate(() => {
        reglerEpaisseurTrait(0.01, 'test'); const bas = activeStyle.lineWidth;
        reglerEpaisseurTrait(900, 'test'); const haut = activeStyle.lineWidth;
        reglerEpaisseurTrait(NaN, 'test'); const apresRien = activeStyle.lineWidth;
        reglerEpaisseurTrait(2.5, 'test');
        return { bas, haut, apresRien };
    });
    r.egal('l\'épaisseur reste dans ses bornes, et un non-nombre ne change rien',
        bornes, { bas: 0.5, haut: 60, apresRien: 60 });

    // =================================================================
    // 3. LE GROSSISSEMENT SE TAPE
    // =================================================================
    const taperLeZoom = async (v) => {
        await page.evaluate((x) => {
            const n = document.getElementById('zoom-num');
            n.value = String(x);
            n.dispatchEvent(new Event('input', { bubbles: true }));
        }, v);
        await page.waitForTimeout(700);      // le zoom glisse vers sa cible
    };

    await taperLeZoom(150);
    r.egal('taper 150 pose le grossissement à 150 %',
        await page.evaluate(() => Math.round(zoom * 1000) / 1000), 1.5);
    r.egal('la pastille et le champ disent la même chose',
        await page.evaluate(() => ({
            pastille: document.getElementById('zoom-valeur').textContent,
            champ: document.getElementById('zoom-num').value
        })), { pastille: '150%', champ: '150' });

    // Un chiffre impossible ne fait pas disparaître le tableau.
    await taperLeZoom(99999);
    r.egal('au-delà du maximum, on s\'arrête au maximum',
        await page.evaluate(() => Math.round(zoom * 100) / 100 === Math.round(ZOOM_MAX * 100) / 100), true);
    await taperLeZoom(1);
    r.egal('au-dessous du minimum, on s\'arrête au minimum',
        await page.evaluate(() => Math.round(zoom * 100) / 100 === Math.round(ZOOM_MIN * 100) / 100), true);

    const videEtCurseur = await page.evaluate(() => {
        viserLeZoom(1, 700, 450);
        const n = document.getElementById('zoom-num');
        n.value = '';
        n.dispatchEvent(new Event('input', { bubbles: true }));
        return zoom;
    });
    await page.waitForTimeout(500);
    r.verifie('un champ vidé ne touche pas au grossissement',
        Number.isFinite(videEtCurseur), String(videEtCurseur));

    // Le curseur reste ce qu'il était : on n'a rien enlevé, on a ajouté.
    await page.evaluate(() => {
        const c = document.getElementById('zoom-slider');
        c.value = positionDuCurseur(2);
        c.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    r.egal('le curseur marche toujours, et le champ le suit',
        await page.evaluate(() => ({
            z: Math.round(zoom * 100) / 100, champ: document.getElementById('zoom-num').value
        })), { z: 2, champ: '200' });

    // ------------------------------------------------------------------
    // LA BARRE DIT CE QUE LE STYLO FAIT, MÊME APRÈS UN RECHARGEMENT
    // ------------------------------------------------------------------
    // « Je trace un trait que je mets à 7,5 px d'épaisseur, je recharge,
    // l'épaisseur affiche 3 px mais cela dessine à 7,5 px. »
    //
    // Le stylo était bien relu — il appartient à celui qui écrit, pas au
    // tableau, et il est rangé dans le navigateur. Ce sont les COMMANDES qui
    // gardaient la valeur écrite dans la page : « value=3 », « value=24 »,
    // le curseur d'opacité à 1. On lisait 3 et l'on dessinait à 7,5.
    //
    // ON MESURE LES TROIS, et non la seule épaisseur : la cause est unique —
    // personne ne posait le stylo sur ses commandes au démarrage — et un
    // contrôle qui ne regarderait qu'un réglage laisserait les deux autres
    // mentir en silence.
    await page.evaluate(() => {
        reglerEpaisseurTrait(7.5, 'objet');
        activeStyle.fontSize = 48;
        activeStyle.strokeOpacity = 0.4;
        activeStyle.lineDash = 'dashed';
    });
    await page.waitForTimeout(700);
    await rechargerApp(page);
    const repris = await page.evaluate(() => {
        const v = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
        return {
            stylo: { epaisseur: activeStyle.lineWidth, taille: activeStyle.fontSize,
                     opacite: activeStyle.strokeOpacity, tirets: activeStyle.lineDash },
            barre: { epaisseur: v('line-width'), epaisseurChiffres: v('line-width-num'),
                     taille: v('font-size'), tailleChiffres: v('font-size-num'),
                     opacite: v('opacity-slider') },
            // ET CE QUE LE TRAIT FAIT VRAIMENT : c'est le seul juge.
            trace: (() => {
                freehands.push({ id: nextId++, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
                                 color: activeStyle.strokeColor, width: activeStyle.lineWidth,
                                 z: globalZ++ });
                return freehands[freehands.length - 1].width;
            })()
        };
    });
    r.egal('le stylo, lui, a bien traversé le rechargement', repris.stylo,
        { epaisseur: 7.5, taille: 48, opacite: 0.4, tirets: 'dashed' });
    r.egal('et le trait qu\'on trace fait bien 7,5', repris.trace, 7.5);
    r.egal('l\'épaisseur affichée est celle qu\'on dessine', repris.barre.epaisseur, '7.5');
    r.egal('en chiffres aussi', repris.barre.epaisseurChiffres, '7.5');
    r.egal('la taille du texte ne ment pas non plus', repris.barre.taille, '48');
    r.egal('ni son champ', repris.barre.tailleChiffres, '48');
    r.egal('ni l\'opacité', repris.barre.opacite, '0.4');

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
