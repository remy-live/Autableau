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
        // « plus » : ce qu'on veut lire EN CAS D'ÉCHEC, et seulement alors.
        // Un contrôle qui tombe rarement ne se laisse pas reproduire à la
        // demande : la seule chance de comprendre est que sa plainte porte
        // déjà de quoi trancher. Rien n'est affiché quand tout va bien.
        egal(nom, obtenu, attendu, plus) {
            const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
            resultats.push({ nom, ok, detail: ok ? undefined
                : `obtenu ${JSON.stringify(obtenu)}, attendu ${JSON.stringify(attendu)}`
                  + (plus ? ` — ${plus}` : '') });
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
        deviceScaleFactor: options.deviceScaleFactor || 1,
        // Cette machine vit en temps universel, où l'heure ne change jamais.
        // Une suite qui a besoin des heures d'été et d'hiver — le compte des
        // semaines A et B en dépend — demande un vrai fuseau.
        ...(options.fuseau ? { timezoneId: options.fuseau } : {})
    });
    // UNE ÉPREUVE NE DOIT PAS DÉPENDRE DU JOUR OÙ ON LA LANCE.
    //
    // Le chapitre 67 vérifie qu'« aujourd'hui est marqué » dans la grille de la
    // semaine. Il passait du lundi au vendredi et tombait le samedi et le
    // dimanche : la grille n'a pas de colonne pour le week-end, donc aucune
    // n'est « aujourd'hui », et l'épreuve accusait le tableau d'un défaut qu'il
    // n'avait pas. Ce n'est pas une épreuve fragile qu'on tolère, c'est une
    // épreuve qui ne disait vrai que cinq jours sur sept.
    //
    // « jour » fixe donc l'horloge de la page — « setFixedTime » arrête les
    // dates, PAS les minuteries, et le tableau continue de vivre normalement.
    // On ne neutralise pas le contrôle en acceptant zéro le samedi : on se place
    // un jour d'école, et le contrôle reste entier tous les jours de l'année.
    if (options.jour) await context.clock.setFixedTime(new Date(options.jour));
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
    // L'invitation à la démonstration s'ouvre 1,8 s après le chargement, au
    // tout premier démarrage, et couvre l'écran : sur un navigateur neuf elle
    // paraîtrait dans toutes les suites. On fait comme si elle avait déjà été
    // proposée — sauf, bien sûr, pour celle qui l'éprouve.
    if (!options.invitation) {
        await context.addInitScript(() => {
            try { localStorage.setItem('auTableau_demo_vue', 'true'); } catch (e) { /* refusé */ }
        });
    }
    // LE PREMIER ÉCRAN couvre l'écran au tout premier démarrage pour dire où
    // va ce qu'on écrit. Sur un navigateur neuf — c'est-à-dire dans CHAQUE
    // suite — il intercepterait tous les clics. On fait comme s'il avait déjà
    // été vu ; celle qui l'éprouve le rouvre elle-même.
    if (!options.premierEcran) {
        await context.addInitScript(() => {
            try { localStorage.setItem('auTableau_premier_ecran_vu', 'true'); } catch (e) { /* refusé */ }
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

// RECHARGER, PUIS ATTENDRE QUE L'APPLICATION SOIT LÀ — et non attendre un
// temps.
//
// Plusieurs chapitres éprouvent qu'un réglage « traverse le rechargement » :
// on recharge, et l'on regarde. Ils dormaient une seconde et demie, deux
// secondes et demie — des durées choisies sur une machine au repos. Lancés
// derrière cinquante-trois autres fichiers, le démarrage prend plus longtemps
// que cela, et le test lisait l'état D'AVANT le rétablissement : le réglage
// paraissait perdu alors qu'il arrivait une demi-seconde plus tard.
//
// ATTENDRE LES OUTILS NE SUFFIT PAS, et c'est la deuxième leçon. Les plugins
// s'enregistrent pendant que les scripts s'exécutent, donc AVANT que les
// gestionnaires « DOMContentLoaded » ne tournent — et c'est là que les
// réglages reprennent leur place. À quarante fois plus lent, cette attente-là
// rendait encore l'état d'avant : elle visait un jalon trop tôt dans le
// démarrage. On attend donc que le document soit COMPLET, ce qui garantit que
// ces gestionnaires ont eu lieu. Le plafond est large — une attente longue ne
// coûte rien tant qu'elle aboutit.
// ET L'ON LAISSE AUX ÉCRITURES LE TEMPS DE PRENDRE. Trois chapitres — le 09,
// le 44, le 55 — tombaient de loin en loin sur « le réglage n'a pas survécu au
// rechargement », deux fois sur quinze suites, jamais reproductibles à la
// demande. Le 55 a fini par le dire, parce qu'il portait de quoi trancher dans
// sa plainte : « stockage=null, 12 clés ». La clé écrite manquait, les douze
// autres étaient là — et ces douze-là sont écrites par les scripts de départ,
// donc RÉÉCRITES à chaque chargement. Seule l'écriture faite en cours de route
// se perdait.
//
// MESURÉ, dans les conditions des suites : vingt rechargements immédiats après
// une écriture, une perte ; quarante rechargements précédés d'une attente,
// aucune. « setItem » ne refusait rien et la valeur se relisait dans la même
// page : elle disparaissait EN TRAVERSANT le rechargement. C'est une course du
// navigateur sur les origines « file:// », entre l'écriture confiée au
// processus du navigateur et le document suivant qui relit le stockage.
//
// CE N'EST PAS UNE ATTENTE QU'ON REMPLACE PAR UN ÉVÉNEMENT — et c'est la seule
// raison pour laquelle elle est ici. Rien, depuis une page, ne permet de savoir
// qu'une écriture est posée pour de bon : il n'y a pas d'événement à attendre.
// On ne mesure donc pas une durée à la place d'un signal, on accorde un délai à
// une course qu'on ne peut pas observer.
//
// ET L'ATTENTE NE SUFFIT PAS : elle raréfie la perte, elle ne la supprime pas —
// le chapitre 57 est tombé une fois AVEC elle. On la double donc d'un filet qui
// distingue les deux fautes possibles, ce qu'une attente ne saura jamais faire :
//
//   — l'application n'a RIEN ÉCRIT : la clé n'est pas dans le relevé d'avant,
//     rien n'est rendu, et le chapitre tombe. C'est une vraie régression, et
//     elle doit tomber.
//   — l'application avait écrit et le navigateur a perdu la clé en chemin :
//     elle est dans le relevé d'avant et absente après. On la rend, on
//     recharge une seconde fois — et on le DIT à l'écran, pour que personne ne
//     prenne ce filet pour un acquis.
//
// Le filet ne peut donc pas masquer un défaut du tableau : il ne rend que ce
// que le tableau avait lui-même écrit.
const REPOS_DU_STOCKAGE = 250;

const releverLeStockage = (page) => page.evaluate(() => {
    const out = {};
    try { for (const k of Object.keys(localStorage)) out[k] = localStorage.getItem(k); }
    catch (e) { /* stockage refusé */ }
    return out;
});

const attendreLApp = (page) => page.waitForFunction(
    () => document.readyState === 'complete'
        && window.PluginManager && Object.keys(PluginManager.plugins).length > 50,
    { timeout: 60000 }
);

async function rechargerApp(page) {
    const avant = await releverLeStockage(page);
    await page.waitForTimeout(REPOS_DU_STOCKAGE);
    await page.reload();
    await attendreLApp(page);

    // Ce que le navigateur a laissé tomber en route — et qu'on lui rend.
    const perdues = await page.evaluate((avant) => {
        const out = [];
        try {
            for (const k of Object.keys(avant)) {
                if (localStorage.getItem(k) === null) { localStorage.setItem(k, avant[k]); out.push(k); }
            }
        } catch (e) { /* stockage refusé */ }
        return out;
    }, avant);

    if (perdues.length) {
        // Les réglages se relisent AU CHARGEMENT : rendre la clé après coup ne
        // suffit pas, le document est déjà passé dessus. On recharge donc une
        // seconde fois, sur un stockage complet.
        console.log('   (le navigateur a perdu ' + perdues.length + ' clé(s) en rechargeant : '
            + perdues.join(', ') + ' — rendues, on recharge)');
        await page.waitForTimeout(REPOS_DU_STOCKAGE);
        await page.reload();
        await attendreLApp(page);
    }
    await page.waitForTimeout(400);
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

// UNE PAGE A4, aux vraies dimensions du format : 595,276 × 841,89 points,
// c'est-à-dire 21 × 29,7 cm. C'est ce que le tableau doit poser tel quel — la
// règle virtuelle mise en travers doit lire 29,7 cm, et non « à peine 10 ».
function pdfA4(pages) {
    pages = pages || 1;
    const kids = [];
    for (let i = 0; i < pages; i++) kids.push(`${3 + i} 0 R`);
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`
    ];
    for (let i = 0; i < pages; i++) {
        objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << >> >>');
    }
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(q => { out += String(q).padStart(10, '0') + ' 00000 n \n'; });
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

// LA VRAIE TABLE D'ADDITION D'UN POLYCOPIÉ. « Pas l'impression » : celle que
// j'avais fabriquée pour mesurer était stérile — traits pleins, fond blanc —
// et donnait ses cent cases. Une vraie table de manuel n'a RIEN de cela :
//   — ses séparateurs intérieurs sont en POINTILLÉS ;
//   — ses en-têtes sont des PAVÉS NOIRS à chiffres blancs ;
//   — ses cases sont TEINTÉES, une couleur par case, dont des jaunes francs.
// Les trois options permettent d'isoler ce qui casse quoi.
function tableDAddition(opts) {
    opts = opts || {};
    const ptH = opts.ptH !== undefined ? opts.ptH : true;
    const ptV = opts.ptV !== undefined ? opts.ptV : true;
    const entetes = opts.entetes !== false;
    const teintes = opts.teintes !== false;
    const jaune = opts.jaune !== false;
    const f = [];
    const x0 = 60, y0 = 740, cel = 46, lig = 46, n = 10;
    const pastels = jaune
        ? [[0.88, .93, .86], [0.87, .92, .94], [0.89, .87, .94], [0.93, .85, .90],
           [0.80, .87, .94], [0.98, .88, .91], [0.99, .90, .80], [1, .98, .85], [0.99, .91, .55]]
        : [[0.88, .93, .86], [0.87, .92, .94], [0.89, .87, .94], [0.93, .85, .90],
           [0.80, .87, .94], [0.98, .88, .91]];
    if (teintes) for (let r = 1; r <= 9; r++) for (let c = 1; c <= 9; c++) {
        const p = pastels[(r + c) % pastels.length];
        f.push(`${p[0]} ${p[1]} ${p[2]} rg ${x0 + c * cel} ${y0 - r * lig} ${cel} ${lig} re f`);
    }
    if (entetes) {
        f.push(`0.09 0.09 0.11 rg ${x0} ${y0} ${n * cel} ${lig} re f`);
        f.push(`0.09 0.09 0.11 rg ${x0} ${y0 - 9 * lig} ${cel} ${9 * lig} re f`);
        // LE PAVÉ ENTIÈREMENT À GAUCHE DES RÈGLES : c'est ainsi que sont faits
        // les vrais tableaux de polycopié. Les traits horizontaux commencent
        // APRÈS lui, et le balayage des montants, qui ne déborde que de huit
        // pixels, n'en voit qu'une tranche : il pose le montant au milieu de
        // CETTE TRANCHE, trois pixels trop à gauche. Le bord du pavé tombe
        // alors DANS la première case du corps, qui passe pour déjà écrite.
        if (opts.paveHorsDesRegles) {
            f.push(`1 1 1 rg ${x0} ${y0 - 9 * lig} ${cel} ${10 * lig} re f`);
            f.push(`0.09 0.09 0.11 rg ${x0 - cel} ${y0 - 9 * lig} ${cel} ${10 * lig} re f`);
        }
    }
    // SANS PAVÉ, LES CHIFFRES D'EN-TÊTE S'ÉCRIVENT EN NOIR — c'est une table
    // d'addition très ordinaire, et c'est surtout le cas qui éprouve qu'une
    // COLONNE DE CHIFFRES ALIGNÉS ne passe pas pour un montant : neuf « 1 »
    // empilés ont une hampe verticale sur plus de la moitié de la hauteur.
    f.push(entetes ? '1 1 1 rg' : '0 0 0 rg');
    f.push(`BT /F1 18 Tf ${x0 + 16} ${y0 + 14} Td (+) Tj ET`);
    for (let k = 1; k <= 9; k++) f.push(`BT /F1 18 Tf ${x0 + k * cel + 16} ${y0 + 14} Td (${k}) Tj ET`);
    for (let k = 1; k <= 9; k++) f.push(`BT /F1 18 Tf ${x0 + 16} ${y0 - k * lig + 14} Td (${k}) Tj ET`);
    f.push('0 0 0 RG 0.8 w');
    f.push(ptH ? '[3 3] 0 d' : '[] 0 d');
    for (let i = 1; i <= 9; i++) f.push(`${x0} ${y0 - i * lig} m ${x0 + n * cel} ${y0 - i * lig} l S`);
    f.push(ptV ? '[3 3] 0 d' : '[] 0 d');
    // LE BORD DU PAVÉ TIENT LIEU DE SÉPARATEUR, comme sur un vrai polycopié :
    // aucun trait n'est tracé entre la colonne des en-têtes et la première du
    // corps — c'est le changement de couleur qui fait la limite.
    for (let j = 1; j <= 9; j++) {
        if (j === 1 && opts.sansTraitSousLePave) continue;
        f.push(`${x0 + j * cel} ${y0 + lig} m ${x0 + j * cel} ${y0 - 9 * lig} l S`);
    }
    f.push('[] 0 d 1.4 w');
    f.push(`${x0} ${y0 - 9 * lig} ${n * cel} ${10 * lig} re S`);
    // LE SÉPARATEUR DE COLONNES DE LA PAGE, à deux points du tableau. Un vrai
    // polycopié est en trois colonnes, et le filet qui les sépare passe juste
    // à côté du tableau — assez près pour être happé par les huit pixels de
    // débordement du balayage des montants. Il devient alors un montant
    // FANTÔME, et l'intervalle de quelques pixels qu'il laisse entre lui et la
    // vraie bordure n'a JAMAIS d'encre, puisqu'il est hors des règles. Comme
    // une règle doit traverser tous les intervalles, plus aucune n'est
    // retenue : mesuré sur le vrai fichier, quarante-huit cases sur
    // quatre-vingt-une.
    if (opts.separateurDePage) {
        f.push('0.6 w');
        const xs = x0 + n * cel + (opts.separateurDePage === true ? 2 : opts.separateurDePage);
        f.push(`${xs} 820 m ${xs} 20 l S`);
    }
    const contenu = f.join('\n');
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
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

// UN EMPLOI DU TEMPS IMPRIMÉ, comme un établissement en distribue.
//
// INVENTÉ DE TOUTES PIÈCES, et c'est important : un vrai emploi du temps
// porte le nom d'un enseignant, celui de son collège et ses horaires — rien
// de tout cela n'a sa place dans un dépôt. Celui-ci est bâti sur les MESURES
// relevées sur un vrai fichier, et sur elles seules.
//
//   Page A4. Cinq colonnes de 113,4 pt à partir de x = 28,4.
//   Dix traits de grille, espacés de 78,8 pt, de y = 803,4 à y = 94,2.
//   Les heures dans la marge, dont une RÉCRÉATION : « 10h00 » au-dessus du
//   trait, « 10h15 » en dessous — le cours d'avant finit, le suivant commence.
//   Des cases pleine largeur, des DEMIES (classe dédoublée) avec leur
//   pastille « A » ou « B », une case de DEUX heures, et une case sans classe.
function edtPdf() {
    const X0 = 28.4, COL = 113.4, HAUT = 803.4, LIGNE = 78.8;
    const colonne = (j) => X0 + COL * (j - 1);
    const trait = (n) => HAUT - LIGNE * n;
    const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
    // Une largeur de texte approchée suffit à centrer un en-tête : ce qui
    // compte, c'est l'ÉCART entre deux centres, et il ne bouge pas.
    const large = (t, taille) => t.length * taille * 0.5;

    let f = '';
    const texte = (t, x, y, taille) =>
        (f += `BT /F1 ${taille} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${t}) Tj ET\n`);
    const pave = (x, y, l, h, c) =>
        (f += `${c} rg ${x.toFixed(1)} ${y.toFixed(1)} ${l.toFixed(1)} ${h.toFixed(1)} re f\n`);

    // Les en-têtes de colonne
    JOURS.forEach((j, i) => texte(j, colonne(i + 1) + COL / 2 - large(j, 8) / 2, 807.8, 8));
    // Les heures de la marge, avec la récréation entre le trait 2 et le suivant
    const MARGE = [[0, '8h00', -8], [1, '9h00', -8], [2, '10h00', 2.6], [2, '10h15', -8],
                   [3, '11h10', -8], [4, '12h05', -8], [5, '13h30', -8], [6, '14h25', -8],
                   [7, '15h20', -8], [8, '16h15', -8], [9, '17h10', 2.6]];
    MARGE.forEach(([n, t, d]) => texte(t, 5.8, trait(n) + d, 7));

    // Les cours. [jour, du trait, au trait, part, matière, classe, salle, semaine]
    // « part » : 0 = toute la colonne, 1 = moitié gauche, 2 = moitié droite.
    const COURS = [
        [1, 0, 1, 0, 'MATHEMATIQUES', '6EME A', '12', ''],
        [1, 1, 2, 1, 'MATHEMATIQUES', '[6EME AG1]', '12', 'A'],
        [1, 1, 2, 2, 'MATHEMATIQUES', '[6EME AG2]', '12', 'B'],
        [2, 2, 3, 0, 'MATHEMATIQUES', '5EME C', '14', ''],
        [3, 0, 1, 0, 'MATHEMATIQUES', '5EME C', '14', ''],
        [4, 3, 4, 0, 'CONCERTATION', '12', '', ''],
        [5, 5, 7, 0, 'MATHEMATIQUES', '4EME B', '9', '']
    ];
    COURS.forEach(([j, a, b, part, matiere, classe, salle, semaine]) => {
        const l = part ? COL / 2 - 0.1 : COL;
        const x = colonne(j) + (part === 2 ? COL / 2 : 0);
        const bas = trait(b), haut = trait(a);
        pave(x, bas, l, haut - bas, '0.86 0.47 0.48');
        const lignes = salle ? [matiere, classe, salle] : [matiere, classe];
        lignes.forEach((t, i) => {
            const taille = part ? 5.5 : 7;
            texte(t, x + l / 2 - large(t, taille) / 2, haut - 30.4 - i * 11.8, taille);
        });
        if (semaine) {
            pave(x + l - 7, bas, 7, 10.6, '1 1 1');
            texte(semaine, x + l - 5.5, bas + 2.6, 7);
        }
    });

    const objs = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
        `<< /Length ${f.length} >>\nstream\n${f}\nendstream`
    ];
    let out = '%PDF-1.4\n';
    const pos = [];
    objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    pos.forEach(q => { out += String(q).padStart(10, '0') + ' 00000 n \n'; });
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
}

module.exports = { APP_URL, CHROMIUM, creerRapport, ouvrirApp, tableauVierge, petitPdf, pdfA4, fichePdf, edtPdf, polyDense, polyEnCases, polyEnCouleur, tableDAddition, rechargerApp};
