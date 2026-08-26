#!/usr/bin/env node
// Lance toute la suite de non-régression.
//   node tests/run.cjs            → tous les tests
//   node tests/run.cjs texte      → seulement ceux dont le nom contient « texte »
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CHROMIUM } = require('./harness.cjs');

const filtre = process.argv[2];

(async () => {
    const fichiers = fs.readdirSync(__dirname)
        .filter(f => /^\d+-.*\.cjs$/.test(f))
        .filter(f => !filtre || f.includes(filtre))
        .sort();

    if (fichiers.length === 0) {
        console.log('Aucun test correspondant.');
        process.exit(1);
    }

    const browser = await chromium.launch({ executablePath: CHROMIUM });
    let total = 0, echecs = 0;
    const debut = Date.now();

    for (const f of fichiers) {
        const test = require(path.join(__dirname, f));
        process.stdout.write(`\n── ${f}\n`);
        let bilan;
        try {
            bilan = await test(browser);
        } catch (e) {
            console.log(`   ✗ le test a planté : ${e.message}`);
            echecs++; total++;
            continue;
        }
        bilan.resultats.forEach(res => {
            const marque = res.ok ? '✓' : '✗';
            console.log(`   ${marque} ${res.nom}${res.detail && !res.ok ? '  — ' + res.detail : ''}`);
        });
        total += bilan.total;
        echecs += bilan.echecs;
    }

    await browser.close();
    const duree = ((Date.now() - debut) / 1000).toFixed(1);
    console.log(`\n${total - echecs}/${total} vérifications passées en ${duree} s`);
    process.exit(echecs === 0 ? 0 : 1);
})();
