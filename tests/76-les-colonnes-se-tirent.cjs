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
            // LA CLÉ D'UNE CASE PORTE UNE VIRGULE, comme celle des bordures :
            // écrite avec un souligné, la case reste vide et le dessin n'a plus
            // aucune lettre — donc plus rien à mesurer.
            cells[li + ',' + co] = { t: 'A' + li + co };
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

    // ------------------------------------------------------------------
    // 4. LES LIGNES SE TIRENT AUSSI, DANS L'AUTRE SENS
    // ------------------------------------------------------------------
    // Une colonne se tire de gauche à droite, une ligne de haut en bas : c'est
    // le même geste, écrit une fois pour les deux. Il n'y avait aucune raison
    // d'offrir l'un sans l'autre.
    const lignes = await page.evaluate(async (id) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const my = P.bordsDuTableau(img, 'y');
        const mx = P.bordsDuTableau(img, 'x');
        const milieuX = (my.x0 + my.x1) / 2;
        const avant = { hauteurs: img.pluginData.state.rowH.slice(),
                        colonnes: img.pluginData.state.colW.slice(),
                        objet: [img.w, img.h] };
        const curseurs = {
            surUneLigne: P.curseurSousLePoint({ x: milieuX, y: my.bords[0].p }),
            surUneColonne: P.curseurSousLePoint({ x: mx.bords[0].p, y: (mx.y0 + mx.y1) / 2 }),
        };
        P.onPointerDown({ x: milieuX, y: my.bords[0].p });
        P.onPointerMove({ x: milieuX, y: my.bords[0].p + 40 });
        P.onPointerUp();
        await attendre(900);
        return { combien: my.bords.length, curseurs, avant,
                 apres: { hauteurs: img.pluginData.state.rowH.slice(),
                          colonnes: img.pluginData.state.colW.slice(),
                          objet: [img.w, img.h] } };
    }, pose.id);
    r.egal('un tableau de trois lignes a deux séparations horizontales', lignes.combien, 2);
    r.egal('le curseur distingue les deux sens',
        [lignes.curseurs.surUneLigne, lignes.curseurs.surUneColonne],
        ['row-resize', 'col-resize']);
    r.egal('la ligne tirée grandit', lignes.apres.hauteurs[0], 90, JSON.stringify(lignes));
    r.egal('et les autres ne bougent pas',
        [lignes.apres.hauteurs[1], lignes.apres.hauteurs[2]], [50, 50], JSON.stringify(lignes));
    r.egal('les colonnes non plus', lignes.apres.colonnes, lignes.avant.colonnes);
    r.verifie('l\'objet grandit en hauteur, et seulement en hauteur',
        Math.abs(lignes.apres.objet[0] - lignes.avant.objet[0]) < 1
        && Math.abs((lignes.apres.objet[1] - lignes.avant.objet[1]) - 40) < 2,
        JSON.stringify(lignes));

    // ------------------------------------------------------------------
    // 5. LA TAILLE ET LE STYLE, DANS LA BARRE DE L'OBJET
    // ------------------------------------------------------------------
    // « C'est dans le canvas qu'il serait pratique de pouvoir modifier en
    // taille, en style, en colonne le tableau. » Pour grossir les lettres il
    // n'y avait qu'une manière : étirer tout l'objet — ce qui étire la grille
    // avec. Les deux gestes sont maintenant séparés.
    const barre = await page.evaluate(async (id) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const P = PluginManager.plugins.tableStudioTool;
        const img = getObjectById('image', id);
        const presser = async (t) => {
            const a = P.actionsRapides(img).find(x => x.texte === t);
            if (!a) return false;
            a.faire();
            await attendre(800);
            return true;
        };
        // CE QUI EST DESSINÉ, et pas seulement ce qui est rangé. Le tampon est
        // un dessin vectoriel : on le relit et l'on y cherche la taille des
        // lettres. Sans cela, le réglage pourrait changer dans l'état sans
        // rien changer à l'image — et le sabotage l'a montré, ce contrôle-là
        // manquait.
        const corpsDessine = () => {
            const src = String(img.src || '');
            const virgule = src.indexOf(',');
            if (virgule < 0) return null;
            let texte;
            try { texte = src.includes('base64') ? atob(src.slice(virgule + 1))
                                                 : decodeURIComponent(src.slice(virgule + 1)); }
            catch (e) { return null; }
            const trouve = texte.match(/font-size="(\d+(?:\.\d+)?)"/g) || [];
            const tailles = trouve.map(t => Number(t.match(/[\d.]+/)[0]));
            return tailles.length ? Math.max(...tailles) : null;
        };
        const etiquettes = P.actionsRapides(img).map(a => a.texte || 'couleur');
        const avant = { corps: P.corpsDuTexte(img.pluginData.state),
                        dessine: corpsDessine(), objet: [img.w, img.h] };
        await presser('A⁺'); await presser('A⁺');
        const grandes = { corps: P.corpsDuTexte(img.pluginData.state),
                          dessine: corpsDessine(), objet: [img.w, img.h] };
        await presser('A⁻');
        const revenu = P.corpsDuTexte(img.pluginData.state);
        await presser('▤');
        const epaisseur = P.epaisseurDesTraits(img.pluginData.state);
        await presser('┅');
        const pointilles = P.traitsEnPointilles(img.pluginData.state);
        return { etiquettes, avant, grandes, revenu, epaisseur, pointilles };
    }, pose.id);
    r.verifie('la barre porte la taille et le style',
        ['A⁻', 'A⁺', '▤', '┅'].every(t => barre.etiquettes.includes(t)),
        JSON.stringify(barre.etiquettes));
    r.egal('les lettres grossissent', [barre.avant.corps, barre.grandes.corps], [16, 20]);
    // ET C'EST LE DESSIN QUI GROSSIT, pas seulement le réglage.
    r.egal('et c'+String.fromCharCode(39)+'est bien le DESSIN qui grossit',
        [barre.avant.dessine, barre.grandes.dessine], [16, 20], JSON.stringify(barre));
    r.egal('et elles redescendent', barre.revenu, 18);
    // C'EST TOUTE LA DEMANDE : le texte change de corps, l'objet ne bouge pas.
    r.verifie('L\'OBJET NE CHANGE PAS DE TAILLE POUR AUTANT',
        Math.abs(barre.grandes.objet[0] - barre.avant.objet[0]) < 1
        && Math.abs(barre.grandes.objet[1] - barre.avant.objet[1]) < 1,
        JSON.stringify(barre));
    r.egal('l\'épaisseur des traits change', barre.epaisseur, 2, JSON.stringify(barre));
    r.egal('et les traits passent en pointillés', barre.pointilles, true, JSON.stringify(barre));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
