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

module.exports = { APP_URL, CHROMIUM, creerRapport, ouvrirApp, tableauVierge, petitPdf, fichePdf };
