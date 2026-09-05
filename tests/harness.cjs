// Socle commun des tests de non-régression d'Au Tableau.
// Aucune dépendance à installer hormis Playwright.
const path = require('path');
const fs = require('fs');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

// Quel navigateur piloter ? CHROMIUM_PATH s'il est donné ; sinon le Chromium
// déjà présent sur la machine de développement ; sinon RIEN — et Playwright
// prend alors celui qu'il a installé lui-même. C'est ce dernier cas qui vaut
// sur un serveur d'intégration : un chemin en dur ne s'y trouve pas.
const CHROMIUM = (() => {
    const choisi = process.env.CHROMIUM_PATH;
    if (choisi) return choisi;
    const local = '/opt/pw-browsers/chromium';
    try { if (fs.existsSync(local)) return local; } catch (e) { /* pas d'accès */ }
    return undefined;
})();

// Erreurs de chargement sans rapport avec le code testé
const BRUIT = /jsPDF|pdfjsLib|localforage is not defined|getUserMedia|mediaDevices|ResizeObserver loop/;

function creerRapport(titre) {
    const resultats = [];
    return {
        titre,
        // verifie('ce qui est attendu', condition, detailAffiche)
        verifie(nom, condition, detail) {
            resultats.push({ nom, ok: !!condition, detail });
        },
        egal(nom, obtenu, attendu) {
            const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
            resultats.push({ nom, ok, detail: ok ? undefined : `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}` });
        },
        resultats,
        bilan() {
            const echecs = resultats.filter(r => !r.ok);
            return { total: resultats.length, echecs: echecs.length, resultats };
        }
    };
}

// Ouvre l'application et attend que les plugins soient enregistrés
async function ouvrirApp(browser, options = {}) {
    const context = await browser.newContext({
        viewport: options.viewport || { width: 1280, height: 800 },
        hasTouch: !!options.tactile,
        deviceScaleFactor: options.deviceScaleFactor || 1
    });
    const page = await context.newPage();
    // L'astuce du jour s'ouvre 2,5 s après le chargement et intercepte les
    // clics : on la désactive partout, sauf pour la suite qui la teste.
    if (!options.astuces) {
        await context.addInitScript(() => {
            try {
                localStorage.setItem('board_astuces', JSON.stringify({ active: false, jour: '', index: 0 }));
            } catch (e) { /* stockage refusé */ }
        });
    }
    // Le rappel de sauvegarde se pose EN HAUT, trois secondes après le
    // chargement, et intercepte lui aussi les clics : sur un navigateur neuf
    // aucune copie n'a jamais été faite, il s'affiche donc dans toutes les
    // suites. On fait comme si une copie venait d'avoir lieu — sauf, bien sûr,
    // pour la suite qui éprouve le rappel lui-même.
    if (!options.rappelSauvegarde) {
        await context.addInitScript(() => {
            try {
                localStorage.setItem('AuTableau_derniere_securite', String(Date.now()));
            } catch (e) { /* stockage refusé */ }
        });
    }
    const erreurs = [];
    page.on('pageerror', e => { if (!BRUIT.test(e.message)) erreurs.push(e.message.slice(0, 160)); });
    await page.goto(APP_URL);
    await page.waitForFunction(
        () => window.PluginManager && Object.keys(PluginManager.plugins).length > 50,
        { timeout: 20000 }
    );
    await page.waitForTimeout(300);
    return { context, page, erreurs };
}

// Vide le tableau entre deux cas de test
async function tableauVierge(page) {
    await page.evaluate(() => {
        points.length = 0; segments.length = 0; circles.length = 0; rectangles.length = 0;
        texts.length = 0; freehands.length = 0; curves.length = 0; polygons.length = 0;
        images.length = 0; arcs.length = 0; htmlPostits.length = 0;
        selectedItems = [];
        setMode('pointer');
        draw();
    });
}


// Un PDF de trois pages, écrit à la main : aucune dépendance à installer.
// Chaque page porte un mot qui n'est que sur elle — de quoi éprouver la
// recherche autant que le feuilletage.
function petitPdf(pages) {
    pages = pages || ['Page une', 'Page deux', 'Page trois'];
    const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    pages.forEach((t, i) => {
        objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
        const flux = `BT /F1 24 Tf 40 150 Td (${t}) Tj ET`;
        objs.push(`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`);
    });
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

// UNE FICHE D'EXERCICE, comme un polycopié propre : des lignes réglées à
// écrire, des cases vides à remplir, des cases DÉJÀ remplies, un bandeau de
// titre en couleur, et un tableau serré. La détection doit retenir les
// premières et écarter les autres — c'est exactement ce qui se joue sur un
// vrai poly, en plus petit.
//
//   Page 400 x 300, repère PDF (origine en bas à gauche).
//   - bandeau de titre plein, en haut          -> écarté (coloré, avec du texte)
//   - trois lignes réglées, longues            -> RETENUES
//   - deux cases vides                         -> RETENUES
//   - une case vide tracée en quatre segments  -> RETENUE
//   - une case avec une lettre dedans          -> écartée (de l'encre)
//   - une grille de six cases serrées          -> écartées (des lettres)
function fichePdf() {
    const flux = [];
    // bandeau de titre : rectangle plein orange + texte blanc
    flux.push('0.95 0.55 0.25 rg 20 265 360 22 re f');
    flux.push('BT 1 1 1 rg /F1 12 Tf 30 272 Td (EXERCICE) Tj ET');
    // trois lignes réglées à écrire (traits horizontaux longs, rien au-dessus)
    flux.push('0 0 0 RG 0.8 w');
    [230, 205, 180].forEach(y => flux.push(`20 ${y} m 250 ${y} l S`));
    // Deux cases vides, dessinées DANS un bloc « q … cm … Q » : c'est le cas
    // ordinaire d'un vrai document, et celui qui fait tout rater si l'on ne
    // suit pas la matrice courante — les cases atterrissent alors à l'origine.
    flux.push('q 1 0 0 1 30 120 cm 0 0 60 20 re S Q');
    flux.push('q 1 0 0 1 110 120 cm 0 0 60 20 re S Q');
    // Une case vide dessinée en QUATRE SEGMENTS et non par « re » : c'est
    // ainsi qu'étaient les cases de dominos du poly qui a servi d'étalon, et
    // elles passaient au travers.
    flux.push('260 55 m 320 55 l 320 88 l 260 88 l h S');
    // une case déjà remplie
    flux.push('190 120 60 20 re S');
    flux.push('BT 0 0 0 rg /F1 12 Tf 205 126 Td (A) Tj ET');
    // une grille serrée, chaque case portant une lettre
    for (let i = 0; i < 6; i++) {
        const x = 30 + i * 22;
        flux.push(`${x} 60 20 20 re S`);
        flux.push(`BT /F1 11 Tf ${x + 6} 66 Td (${'MOTSCR'[i]}) Tj ET`);
    }
    const contenu = flux.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
        `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`
    ];
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

// UN POLYCOPIÉ DENSE, comme ceux qu'on distribue vraiment : A4 PAYSAGE, trois
// colonnes, du texte de 11 points, et des lignes à remplir COURTES posées
// juste après leur libellé — « 3456 = ______ », « 0 : ______ ».
// C'est le cas qui tombait quand les seuils se mesuraient en proportions de la
// page : sur 1190 points de large, « 4 % » fait 48 points, et toutes ces
// courtes lignes passaient à la trappe.
function polyDense() {
    const f = ['0.6 w'];
    const COL = [40, 440, 840];
    COL.forEach((cx, ci) => {
        // un titre de colonne
        f.push(`BT /F1 12 Tf ${cx} 800 Td (Exercice ${ci + 1}) Tj ET`);
        for (let i = 0; i < 8; i++) {
            const y = 760 - i * 34;
            f.push(`BT /F1 11 Tf ${cx} ${y} Td (${1000 + i * 111} = ) Tj ET`);
            // le trait : court (90 points), juste après le libellé
            f.push(`${cx + 60} ${y - 3} m ${cx + 150} ${y - 3} l S`);
        }
        // ET UN TRAIT TRÈS COURT, comme « 9 607 est un nombre de ___ chiffres » :
        // trente-cinq points. Avec des seuils en proportions de la page, le
        // minimum valait quarante-huit points sur ce format et il tombait.
        f.push(`BT /F1 11 Tf ${cx} 470 Td (un nombre de) Tj ET`);
        f.push(`${cx + 75} 467 m ${cx + 110} 467 l S`);
    });
    const contenu = f.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
        `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`
    ];
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

// LE POLYCOPIÉ EN CASES — le motif qui faisait tout manquer. Chaque ligne à
// remplir est posée DANS une case, huit points au-dessus de la bordure basse
// de cette case. La bordure, horizontale et proche, était comptée comme un
// « montant » aux deux bouts du trait : celui-ci passait pour le bord d'un
// rectangle et disparaissait. Sur un vrai poly fait de tableaux, c'était
// presque toutes les lignes.
function polyEnCases() {
    const f = ['0.6 w'];
    for (let r = 0; r < 6; r++) {
        const y = 700 - r * 40;
        for (let c = 0; c < 3; c++) {
            const x = 40 + c * 360;
            f.push(`${x} ${y} 350 40 re S`);
            f.push(`BT /F1 11 Tf ${x + 8} ${y + 14} Td (${r * 3 + c} :) Tj ET`);
            f.push(`${x + 50} ${y + 8} m ${x + 330} ${y + 8} l S`);
        }
    }
    const contenu = f.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1190 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
        `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`
    ];
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

// UN POLYCOPIÉ EN COULEUR — celui d'un collègue qui soigne ses fiches, et qui
// a mis en défaut trois règles d'un coup :
//
//   • ses lignes à remplir sont tracées EN SAUMON, rgb(243,172,134). Elles sont
//     claires : luminance 189. Le seuil hérité de PDF-fill ne comptait comme
//     de l'encre que ce qui est plus sombre que 170, et la moitié des lignes de
//     la page n'existait tout simplement pas.
//   • ses cases de tableau ont un fond MAUVE PÂLE, rgb(209,196,233), dont la
//     luminance est 204 : PLUS SOMBRE que le bord de la ligne saumon. Aucune
//     coupure de luminance ne sépare les deux ; il faut regarder la saturation.
//   • il SOULIGNE ses mots de vocabulaire, neuf points sous la ligne de base.
//     Ces traits-là passaient pour des lignes à remplir.
//
// Et une ligne à remplir peut être courte : « un nombre de ___ chiffres ».
function polyEnCouleur(taille) {
    const T = taille || 11;
    const f = [];
    // UN TITRE, en gros et en peu de signes : la taille d'écriture doit se
    // régler sur le CORPS du texte, pas sur ce qui est le plus grand.
    f.push('BT 0 0 0 rg /F1 26 Tf 40 560 Td (FICHE) Tj ET');
    // — colonne de gauche : les lignes à remplir, en saumon
    f.push('0.953 0.675 0.525 RG 0.9 w');
    ['3456 =', '12345 =', '100000 =', '1000 ='].forEach((t, i) => {
        const y = 520 - i * 40;
        f.push(`BT 0 0 0 rg /F1 ${T} Tf 40 ${y} Td (${t}) Tj ET`);
        f.push(`90 ${y - 3} m 280 ${y - 3} l S`);
    });
    // une ligne COURTE : dix-huit points, une fois et demie la hauteur du texte
    f.push(`BT 0 0 0 rg /F1 ${T} Tf 40 340 Td (un nombre de) Tj ET`);
    f.push('110 337 m 128 337 l S');

    // — colonne du milieu : des cases teintées, et un filet gris décoratif.
    // Ni les unes ni l'autre ne sont des zones à remplir.
    ['367,8', '987,123', '5 903'].forEach((t, i) => {
        const y = 480 - i * 40;
        f.push(`0.82 0.769 0.914 rg 340 ${y} 240 26 re f`);
        f.push(`BT 0 0 0 rg /F1 ${T} Tf 350 ${y + 8} Td (${t}) Tj ET`);
    });
    f.push('0.82 0.82 0.82 RG 340 360 m 580 360 l S');

    // — colonne de droite : un paragraphe serré, deux mots soulignés
    f.push('0 0 0 rg 0 0 0 RG');
    ['La tour Eiffel est une', 'tour de fer de trois cent', 'vingt-quatre metres de',
     'hauteur construite pour', 'l Exposition universelle'].forEach((t, i) => {
        f.push(`BT /F1 ${T} Tf 620 ${520 - i * 24} Td (${t}) Tj ET`);
    });
    f.push('620 487 m 760 487 l S');
    f.push('620 439 m 780 439 l S');

    const contenu = f.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
        `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`
    ];
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(p => { out += String(p).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

module.exports = { APP_URL, CHROMIUM, creerRapport, ouvrirApp, tableauVierge, petitPdf, fichePdf, polyDense, polyEnCases, polyEnCouleur };
