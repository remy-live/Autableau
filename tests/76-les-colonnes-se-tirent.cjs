// LES COLONNES D'UN TABLEAU SE TIRENT, ET ÇA SE VOIT
//
// « Quand on redimensionne un tableau, ça modifie les tailles dedans — d'un
// côté c'est normal, mais comment, pour une fois, pour le tableau, changer
// juste la taille des colonnes sans changer l'échelle ? »
//
// LE GESTE EXISTAIT DÉJÀ : tirer une séparation de colonne élargit LA COLONNE
// et refait la grille, sans toucher au corps du texte. Mais RIEN NE LE DISAIT
// — ni dessin, ni curseur. Un geste que personne ne peut deviner n'existe pas,
// et le professeur n'avait d'autre choix que d'étirer tout l'objet, ce qui
// étire aussi ce qui est écrit dedans.
//
// Dès que le tableau est pris en main, ses séparations se montrent : un trait
// bleu et deux petites flèches, à l'endroit exact où l'on peut tirer ; et le
// curseur le dit avant même qu'on clique.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Les colonnes d\'un tableau se tirent');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    // Un vrai tableau de trois colonnes, posé au tableau.
    const pose = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        if (!P) return null;
        const cells = {}, hB = {}, vB = {};
        const trait = { w: 1, c: '#2d3436', d: '' };
        for (let li = 0; li < 3; li++) for (let co = 0; co < 3; co++) {
            cells[li + '_' + co] = { t: 'x' };
            hB[li + ',' + co] = { ...trait }; hB[(li + 1) + ',' + co] = { ...trait };
            vB[li + ',' + co] = { ...trait }; vB[li + ',' + (co + 1)] = { ...trait };
        }
        images.push({
            id: nextId++, x: -190, y: -85, w: 380, h: 170, cx: 0, cy: 0, cw: 380, ch: 170,
            src: '', z: globalZ++,
            pluginData: { id: 'tableStudioTool', state: {
                rows: 3, cols: 3, rowH: [50, 50, 50], colW: [120, 120, 120],
                cells, hBorders: hB, vBorders: vB } }
        });
        const img = images[images.length - 1];
        P.surCeTableau(img, () => true);
        await attendre(900);
        return { id: img.id, boite: [Math.round(img.x), Math.round(img.y),
                                     Math.round(img.w), Math.round(img.h)] };
    });
    r.verifie('un tableau de trois colonnes est posé', !!pose, JSON.stringify(pose));
    if (!pose) { await context.close(); return r.bilan(); }

    // ------------------------------------------------------------------
    // 1. LES SÉPARATIONS SE MONTRENT — ET SEULEMENT QUAND ON LE TIENT
    // ------------------------------------------------------------------
    // On ne se contente pas de demander au code où il CROIT dessiner : on
    // compte l'encre posée sur le tableau, à l'endroit de la séparation.
    const vu = await page.evaluate(async (id) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const cv = document.getElementById('board');
        // Le bleu de l'application, et lui seul.
        const bleu = (x, y, l, h) => {
            const d = cv.getContext('2d').getImageData(x * devicePixelRatio, y * devicePixelRatio,
                l * devicePixelRatio, h * devicePixelRatio).data;
            let n = 0;
            for (let j = 0; j < d.length; j += 4)
                if (d[j] < 120 && d[j + 1] > 90 && d[j + 1] < 190 && d[j + 2] > 180) n++;
            return Math.round(n / (devicePixelRatio * devicePixelRatio));
        };
        const ecran = (x, y) => [panX + x * zoom, panY + y * zoom];

        setMode('pointer'); selectedItems = []; draw(); await attendre(250);
        const m0 = P.bordsDesColonnes(img);
        const e0 = ecran(m0.bords[0].x, (m0.y0 + m0.y1) / 2);
        const sansSelection = bleu(e0[0] - 14, e0[1] - 14, 28, 28);

        selectedItems = [{ type: 'image', id }]; draw(); await attendre(250);
        const m = P.bordsDesColonnes(img);
        const e1 = ecran(m.bords[0].x, (m.y0 + m.y1) / 2);
        const avecSelection = bleu(e1[0] - 14, e1[1] - 14, 28, 28);
        // Et une case, loin de toute séparation, ne reçoit rien.
        const dansUneCase = ecran(m.bords[0].x - 50, (m.y0 + m.y1) / 2);
        const case_ = bleu(dansUneCase[0] - 10, dansUneCase[1] - 10, 20, 20);
        return { combien: m.bords.length, sansSelection, avecSelection, case_ };
    }, pose.id);
    r.egal('un tableau de trois colonnes a deux séparations', vu.combien, 2, JSON.stringify(vu));
    r.egal('sans rien tenir, rien n\'est marqué', vu.sansSelection, 0, JSON.stringify(vu));
    r.verifie('pris en main, la séparation se voit',
        vu.avecSelection >= 30, JSON.stringify(vu));
    r.egal('et le milieu d\'une case ne reçoit rien', vu.case_, 0, JSON.stringify(vu));

    // ------------------------------------------------------------------
    // 2. LE CURSEUR LE DIT AVANT QU'ON CLIQUE
    // ------------------------------------------------------------------
    const curseur = await page.evaluate((id) => {
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const m = P.bordsDesColonnes(img);
        const y = (m.y0 + m.y1) / 2;
        return {
            surLaSeparation: P.curseurSousLePoint({ x: m.bords[0].x, y }),
            dansUneCase: P.curseurSousLePoint({ x: m.bords[0].x - 50, y }),
            dehors: P.curseurSousLePoint({ x: img.x - 60, y }),
        };
    }, pose.id);
    r.egal('le curseur annonce qu\'on peut tirer', curseur.surLaSeparation, 'col-resize');
    r.egal('au milieu d\'une case, il ne dit rien', curseur.dansUneCase, null);
    r.egal('et dehors non plus', curseur.dehors, null);

    // ET C'EST LE VRAI CURSEUR DU TABLEAU QU'ON MESURE, pas seulement ce que
    // l'outil répond. Entre les deux il y a le raccord : l'outil peut avoir
    // raison et le raccord être débranché — le sabotage l'a montré, ce
    // contrôle-là manquait.
    const vraiCurseur = await page.evaluate(async (id) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const cv = document.getElementById('board');
        const m = P.bordsDesColonnes(img);
        const y = (m.y0 + m.y1) / 2;
        const bouger = async (bx, by) => {
            const [sx, sy] = [panX + bx * zoom, panY + by * zoom];
            cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true,
                clientX: sx, clientY: sy, pointerId: 9, isPrimary: true }));
            await attendre(120);
            return cv.style.cursor;
        };
        const surLaSeparation = await bouger(m.bords[0].x, y);
        const dansUneCase = await bouger(m.bords[0].x - 50, y);
        return { surLaSeparation, dansUneCase };
    }, pose.id);
    r.egal('le tableau montre vraiment ce curseur-là',
        vraiCurseur.surLaSeparation, 'col-resize', JSON.stringify(vraiCurseur));
    r.verifie('et il ne le montre pas au milieu d\'une case',
        vraiCurseur.dansUneCase !== 'col-resize', JSON.stringify(vraiCurseur));

    // ------------------------------------------------------------------
    // 3. ON TIRE, ET C'EST LA COLONNE QUI CHANGE — PAS L'ÉCHELLE
    // ------------------------------------------------------------------
    // C'est la question posée mot pour mot : « changer juste la taille des
    // colonnes SANS CHANGER L'ÉCHELLE ». L'échelle, c'est le rapport entre la
    // taille de l'objet au tableau et la taille de la grille dessinée : c'est
    // lui qui étire ou non ce qui est écrit dans les cases.
    const tire = await page.evaluate(async (id) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const echelle = () => {
            const s = img.pluginData.state;
            return img.w / (s.colW.reduce((a, b) => a + b, 0) + 20);
        };
        const avant = { colonnes: img.pluginData.state.colW.slice(),
                        objet: img.w, hauteur: img.h, echelle: echelle() };
        const m = P.bordsDesColonnes(img);
        const y = (m.y0 + m.y1) / 2;
        P.onPointerDown({ x: m.bords[0].x, y });
        P.onPointerMove({ x: m.bords[0].x + 60, y });
        P.onPointerUp();
        await attendre(900);
        return { avant, apres: { colonnes: img.pluginData.state.colW.slice(),
                                 objet: img.w, hauteur: img.h, echelle: echelle() } };
    }, pose.id);
    r.egal('la colonne tirée s\'élargit', tire.apres.colonnes[0], 180, JSON.stringify(tire));
    r.egal('et les autres ne bougent pas',
        [tire.apres.colonnes[1], tire.apres.colonnes[2]], [120, 120], JSON.stringify(tire));
    r.verifie('l\'objet s\'élargit d\'autant',
        Math.abs((tire.apres.objet - tire.avant.objet) - 60) < 2, JSON.stringify(tire));
    r.verifie('L\'ÉCHELLE NE CHANGE PAS — ce qui est écrit n\'est pas étiré',
        Math.abs(tire.apres.echelle - tire.avant.echelle) < 0.002,
        tire.avant.echelle.toFixed(4) + ' → ' + tire.apres.echelle.toFixed(4));
    r.verifie('et la hauteur ne bouge pas non plus',
        Math.abs(tire.apres.hauteur - tire.avant.hauteur) < 1, JSON.stringify(tire));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
