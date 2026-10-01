// LA FORME DES POINTS SE CHOISIT, ET « AUCUNE » EN EST UNE
//
// « Quand je trace des segments, j'ai forcément des croix, je n'ai plus
// l'option point, pixel, ou rien — idem avec demi-droite et courbe de
// Bézier. »
//
// DEUX MANQUES EN UN.
//
//   — Il n'y avait QUE QUATRE formes, et pas de « rien » : un segment portait
//     donc toujours deux marques à ses bouts, qu'on le veuille ou non. Et la
//     fonction qui lit la forme ramenait tout ce qu'elle ne connaissait pas à
//     la croix, si bien qu'aucune valeur ne pouvait signifier « aucune ».
//   — Le choix se faisait À L'AVEUGLE : un bouton qui tourne, sans jamais dire
//     lesquelles existent ni où l'on en est. Pour en essayer quatre, quatre
//     appuis et un regard sur le tableau entre chacun. C'est le défaut des
//     huit fonds du tableau, et il se soigne de la même façon : un panneau qui
//     NOMME et qui MONTRE.
//
// « AUCUNE » NE VEUT PAS DIRE « INTROUVABLE ». Un point qu'on ne dessine pas
// reste sélectionnable : invisible ET attrapable, c'est un piège — et c'était
// la raison même pour laquelle une forme manquante valait la croix. La règle
// est donc plus fine : rien pour la classe, une marque discrète dès qu'on le
// tient ou qu'on le survole.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La forme des points se choisit');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof formeDuPoint === 'function', { timeout: 20000 });
    await tableauVierge(page);

    // ------------------------------------------------------------------
    // 1. LE PANNEAU NOMME LES CINQ CHOIX, ET DIT OÙ L'ON EN EST
    // ------------------------------------------------------------------
    const panneau = await page.evaluate(async () => {
        setMode('segment');
        await new Promise(ok => setTimeout(ok, 200));
        const bs = document.getElementById('btn-shape');
        const q = bs.getBoundingClientRect();
        bs.click();
        await new Promise(ok => setTimeout(ok, 250));
        const p = document.getElementById('panneau-appui');
        return {
            visible: q.width > 10 && q.height > 10,
            titre: p ? p.querySelector('.rp-titre').textContent : null,
            choix: p ? [...p.querySelectorAll('.rp-case')].map(c => c.title) : [],
            actif: p ? [...p.querySelectorAll('.rp-case.actif')].map(c => c.title) : [],
            // Chaque case MONTRE sa marque : une case vide ne dirait rien.
            muettes: p ? [...p.querySelectorAll('.rp-case')]
                .filter(c => !c.querySelector('svg')).map(c => c.title) : ['(pas de panneau)']
        };
    });
    r.verifie('le bouton de forme est atteignable avec un segment en main',
        panneau.visible, JSON.stringify(panneau));
    r.egal('il ouvre un panneau nommé', panneau.titre, 'Forme des points');
    r.egal('QUI PROPOSE LES CINQ FORMES, « AUCUNE » COMPRISE', panneau.choix,
        ['Aucune marque', 'Rond', 'Croix', 'Carré', 'Point fin']);
    r.egal('et qui dit laquelle est en vigueur', panneau.actif, ['Croix']);
    r.egal('chaque case montre sa marque', panneau.muettes, []);

    // ------------------------------------------------------------------
    // 2. ET IL S'OUVRE POUR LES TROIS OUTILS NOMMÉS
    //
    // « Idem avec demi-droite et courbe de Bézier. » Trois outils, un seul
    // chemin : les mesurer tous les trois empêche de n'en réparer qu'un.
    // ------------------------------------------------------------------
    for (const outil of ['segment', 'demi-droite', 'curve']) {
        const vu = await page.evaluate(async (o) => {
            fermerPanneauAppui();
            setMode(o);
            await new Promise(ok => setTimeout(ok, 180));
            const bs = document.getElementById('btn-shape');
            const q = bs.getBoundingClientRect();
            const g = bs.closest('.style-group');
            return { l: Math.round(q.width), h: Math.round(q.height),
                     groupe: g ? getComputedStyle(g).display : '—' };
        }, outil);
        r.verifie(`« ${outil} » : la forme des points se règle`,
            vu.l > 10 && vu.h > 10 && vu.groupe === 'flex', JSON.stringify(vu));
    }

    // ------------------------------------------------------------------
    // 3. « AUCUNE » EFFACE LA MARQUE — ET LA REND DÈS QU'ON TIENT LE POINT
    //
    // ON COMPTE CE QUI N'EST PAS LE FOND, et non le rouge du trait : un point
    // SÉLECTIONNÉ se dessine dans la couleur de la sélection, et compter le
    // rouge faisait conclure à l'absence d'une chose présente.
    // ------------------------------------------------------------------
    const encre = await page.evaluate(async () => {
        fermerPanneauAppui();
        const poser = (forme) => {
            points.length = 0; segments.length = 0; selectedItems = [];
            panX = 700; panY = 450; zoom = 1;
            const a = nextId++, b = nextId++;
            points.push({ id: a, x: -100, y: 0, color: '#e74c3c', shape: forme, z: globalZ++ });
            points.push({ id: b, x: 100, y: 0, color: '#e74c3c', shape: forme, z: globalZ++ });
            segments.push({ id: nextId++, p1_id: a, p2_id: b, color: '#e74c3c', width: 3, z: globalZ++ });
            draw();
            return a;
        };
        const fond = (() => { const d = ctx.getImageData(40, 40, 1, 1).data; return [d[0], d[1], d[2]]; })();
        const lire = (x, y) => {
            const d = ctx.getImageData(x - 9, y - 9, 18, 18).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) {
                if (Math.abs(d[i] - fond[0]) + Math.abs(d[i + 1] - fond[1])
                    + Math.abs(d[i + 2] - fond[2]) > 60) n++;
            }
            return n;
        };
        const BOUT = [600, 450];
        poser('cross');
        const avecCroix = lire(...BOUT);
        const idAucun = poser('aucun');
        const sansRien = lire(...BOUT);
        selectedItems = [{ type: 'point', id: idAucun }];
        draw();
        const tenu = lire(...BOUT);
        selectedItems = [];
        draw();
        return { avecCroix, sansRien, tenu, lu: formeDuPoint({ shape: 'aucun' }) };
    });
    r.egal('« aucun » est une forme reconnue', encre.lu, 'aucun');
    r.verifie('LA CROIX MARQUE LE BOUT',
        encre.avecCroix > encre.sansRien + 15,
        `croix ${encre.avecCroix} px, aucune ${encre.sansRien} px`);
    r.verifie('ET « AUCUNE » LE LAISSE NU',
        encre.sansRien < encre.avecCroix,
        `croix ${encre.avecCroix} px, aucune ${encre.sansRien} px`);
    // LE GARDE-FOU : nu pour la classe, retrouvable pour le professeur.
    r.verifie('mais le point se montre dès qu\'on le tient',
        encre.tenu > encre.sansRien,
        `nu ${encre.sansRien} px, tenu ${encre.tenu} px`);

    // ------------------------------------------------------------------
    // 4. CE QUI N'A PAS DE FORME GARDE SA CROIX
    //
    // Un tableau d'une version plus ancienne n'écrit aucune forme sur ses
    // points. Si « rien d'écrit » valait « aucune marque », il perdrait toutes
    // ses extrémités d'un coup. Seul le mot « aucun », posé exprès, efface.
    // ------------------------------------------------------------------
    const vieux = await page.evaluate(() => ({
        sansRien: formeDuPoint({}),
        inconnue: formeDuPoint({ shape: 'zigzag' }),
        vide: formeDuPoint({ shape: '' })
    }));
    r.egal('une forme absente vaut toujours la croix', vieux.sansRien, 'cross');
    r.egal('une forme inconnue aussi', vieux.inconnue, 'cross');
    r.egal('et une forme vide également', vieux.vide, 'cross');

    // ------------------------------------------------------------------
    // 5. LE BOUTON MONTRE LA FORME EN VIGUEUR
    //
    // L'autre moitié de « où en suis-je ? » : la coche est dans le panneau,
    // mais le panneau est fermé le reste du temps.
    // ------------------------------------------------------------------
    const icone = await page.evaluate(async () => {
        const lu = [];
        for (const f of ['circle', 'aucun', 'cross']) {
            activeStyle.pointShape = f;
            majLIconeDeForme();
            await new Promise(ok => setTimeout(ok, 60));
            const b = document.getElementById('btn-shape');
            lu.push({ f, infobulle: b.getAttribute('data-tooltip'),
                      dessin: !!b.querySelector('svg') });
        }
        return lu;
    });
    r.egal('l\'infobulle nomme la forme en vigueur',
        icone.map(x => x.infobulle),
        ['Forme des points — Rond', 'Forme des points — Aucune marque',
         'Forme des points — Croix']);
    r.egal('et le bouton garde un dessin', icone.filter(x => !x.dessin), []);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
