// Socle commun des tests de non-régression d'Au Tableau.
// Aucune dépendance à installer hormis Playwright.
const path = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

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

module.exports = { APP_URL, CHROMIUM, creerRapport, ouvrirApp, tableauVierge };
