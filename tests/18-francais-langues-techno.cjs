// Les outils de français, de langues et de technologie.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Français, langues et techno');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ==========================================================
    // ANALYSE GRAMMATICALE
    // ==========================================================
    const gram = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('Le petit chat de la voisine dort sur le canapé.');
        P.creerFenetre();
        const pose = (de, a, nom) => {
            P.debutChoisi = de; P.finChoisie = a;
            const et = P.ETIQUETTES.find(x => x.nom === nom);
            P.etiqueter(et.nom, et.couleur);
        };
        pose(0, 5, 'Sujet');
        pose(3, 5, 'Complément du nom');   // imbriqué dans le sujet
        pose(6, 6, 'Verbe');
        pose(7, 9, 'CC de lieu');
        const rang = (nom) => (P.etager().find(a => a.libelle === nom) || {}).rang;
        return {
            mots: P.mots.map(m => m.texte),
            mesures: P.mots.every(m => m.l > 0),
            rangSujet: rang('Sujet'),
            rangCDN: rang('Complément du nom'),
            rangVerbe: rang('Verbe'),
            rangCC: rang('CC de lieu'),
            analyses: P.analyses.length
        };
    });
    r.egal('la phrase est découpée en mots, ponctuation collée au dernier',
        gram.mots, ['Le', 'petit', 'chat', 'de', 'la', 'voisine', 'dort', 'sur', 'le', 'canapé.']);
    r.verifie('chaque mot est mesuré dans la scène', gram.mesures);
    r.egal('quatre analyses posées', gram.analyses, 4);
    r.egal('le sujet occupe le premier étage', gram.rangSujet, 0);
    r.egal('le verbe et le CC aussi : ils ne se chevauchent pas',
        [gram.rangVerbe, gram.rangCC], [0, 0]);
    r.egal('le complément du nom, niché dans le sujet, descend d\'un cran',
        gram.rangCDN, 1);

    // Les abscisses du tampon sont celles des mots à l'écran : sans quoi les
    // crochets se posent à côté du groupe qu'ils désignent.
    const alignement = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.mesurerLesMots();
        const svg = P.tracerSVG({ pourExport: true });
        const xs = [...svg.matchAll(/<tspan x="([\d.]+)"/g)].map(m => Number(m[1]));
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const crochets = [...doc.querySelectorAll('path')].map(p => {
            const d = p.getAttribute('d').match(/[\d.]+/g).map(Number);
            return { x1: d[0], x2: d[4] };
        });
        const sujet = crochets.find(c => Math.abs(c.x1 - P.mots[0].x) < 1);
        return {
            xs, motsX: P.mots.map(m => Math.round(m.x)),
            // Le crochet du sujet va du premier mot à la fin du sixième
            sujetJuste: !!sujet && Math.abs(sujet.x2 - (P.mots[5].x + P.mots[5].l)) < 1,
            mots: P.mots.length, tspans: xs.length,
            texteEnDur: /Le<\/tspan>/.test(svg),
            // L'espace entre deux mots doit rester HORS de leur boîte : s'il
            // est dedans, l'abscisse relevée est celle de l'espace et les
            // mots se collent deux à deux dans le tampon exporté.
            ecarts: P.mots.slice(1).map((m, i) => Math.round(m.x - (P.mots[i].x + P.mots[i].l)))
        };
    });
    r.egal('le tampon porte un tspan par mot', alignement.tspans, alignement.mots);
    r.egal('placés aux abscisses relevées à l\'écran',
        alignement.xs.map(Math.round), alignement.motsX);
    r.verifie('le crochet du sujet couvre exactement ses six mots', alignement.sujetJuste);
    r.verifie('et la phrase est écrite dans le tampon', alignement.texteEnDur);
    r.verifie('l\'espace entre deux mots reste hors de leur boîte mesurée',
        alignement.ecarts.every(e => e >= 4), JSON.stringify(alignement.ecarts));

    // Les gestes : deux clics désignent un groupe, un troisième se ravise
    const gestes = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = []; P.debutChoisi = P.finChoisie = null;
        P.peindre();
        const mot = (i) => P.widgetEl.querySelector(`.ag-mot[data-i="${i}"]`);
        mot(2).click();
        const unSeul = { de: P.debutChoisi, a: P.finChoisie,
                         peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length };
        mot(5).click();
        const etendu = P.widgetEl.querySelectorAll('.ag-mot.choisi').length;
        // On étiquette, la sélection se relâche
        P.etiqueter('COD', '#00b894');
        const apres = { sel: P.debutChoisi, n: P.analyses.length,
                        peints: P.widgetEl.querySelectorAll('.ag-mot.choisi').length };
        // Le crochet se retire d'un clic
        P.widgetEl.querySelector('.ag-trait').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const retire = P.analyses.length;
        // Reclic sur le même mot : on se ravise
        mot(1).click(); mot(1).click();
        return { unSeul, etendu, apres, retire, apresRavis: P.debutChoisi };
    });
    r.egal('un premier clic désigne un mot', [gestes.unSeul.de, gestes.unSeul.a], [2, 2]);
    r.egal('et le peint', gestes.unSeul.peints, 1);
    r.egal('le second clic étend le groupe', gestes.etendu, 4);
    r.egal('étiqueter pose l\'analyse', gestes.apres.n, 1);
    r.verifie('et relâche la sélection',
        gestes.apres.sel === null && gestes.apres.peints === 0, JSON.stringify(gestes.apres));
    r.egal('un clic sur le crochet le retire', gestes.retire, 0);
    r.verifie('recliquer le même mot annule la sélection', gestes.apresRavis === null);

    // Deux fois la même fonction sur les mêmes mots : on change d'avis
    const doublon = await page.evaluate(() => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.analyses = [];
        P.debutChoisi = 0; P.finChoisie = 2; P.etiqueter('Sujet', '#0984e3');
        P.debutChoisi = 0; P.finChoisie = 2; P.etiqueter('COD', '#00b894');
        return P.analyses.map(a => a.libelle);
    });
    r.egal('réétiqueter le même groupe remplace, sans empiler', doublon, ['COD']);

    // Le tampon posé se rouvre pour être corrigé
    const reedition = await page.evaluate(async () => {
        const P = PluginManager.plugins['analyseGrammaticaleTool'];
        P.poserPhrase('Marie lit un roman.');
        P.debutChoisi = 0; P.finChoisie = 0; P.etiqueter('Sujet', '#0984e3');
        images.length = 0;
        P.poserAuTableau();
        await new Promise(r => setTimeout(r, 300));
        const arme = !!P.currentStamp;
        // On pose le tampon d'un clic sur le tableau
        P.onPointerDown({ x: 300, y: 300 });
        const img = images[0];
        const pose = !!img && img.pluginData.id === 'analyseGrammaticaleTool';

        P.edit(img);
        return {
            arme, pose,
            phraseRelue: P.phrase,
            analysesRelues: P.analyses.length,
            fenetreOuverte: !!P.widgetEl,
            bouton: P.widgetEl.querySelector('#ag-poser').textContent
        };
    });
    r.verifie('« Poser au tableau » arme le tampon', reedition.arme);
    r.verifie('un clic sur le tableau le pose', reedition.pose);
    r.egal('le double-clic rouvre la phrase', reedition.phraseRelue, 'Marie lit un roman.');
    r.egal('avec ses étiquettes', reedition.analysesRelues, 1);
    r.verifie('et le bouton propose de mettre à jour',
        /Mettre à jour/.test(reedition.bouton), reedition.bouton);

    await page.evaluate(() => {
        PluginManager.plugins['analyseGrammaticaleTool'].fermer();
        images.length = 0;
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
