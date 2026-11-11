// « EXPORTER CE TABLEAU » EXPORTE CE QUI EST À L'ÉCRAN.
//
// « Lorsque je souhaite exporter mon tableau avec la fonction "exporter ce
// tableau", j'ai ce message qui s'affiche... je ne comprends pas pourquoi.
// J'ai changé de navigateur, cela ne change rien. (mon tableau comporte 2
// pages sur lesquelles j'ai importé un pdf) »
//
// Le message était le filet de sécurité général — « un problème est survenu,
// votre travail est conservé » —, et le défaut était plus large que le retour
// ne le laissait croire : il touchait TOUT TABLEAU ENREGISTRÉ, avec ou sans
// PDF. Mesuré sur deux pages portant un simple texte : « Cannot read
// properties of undefined (reading 'pages') ».
//
// On allait chercher le tableau dans « savedTableaux », qui ne contient que
// les FICHES — identifiant, nom, date, aperçu. Le contenu vit ailleurs, sous
// « data_<id> ». La fiche n'a donc pas de « data ». Le tableau NON enregistré,
// lui, s'exportait très bien : c'est pourquoi le défaut a pu vivre.
//
// ET ON NE VA PAS LIRE LE CONTENU SUR LE DISQUE POUR AUTANT : ce serait
// réparer le symptôme et garder la faute. Le disque porte la dernière version
// ENREGISTRÉE, et l'on exporterait un tableau d'où manquerait tout ce qui a
// été écrit depuis, sans que rien ne le dise. On appuie sur « exporter ce
// tableau » en regardant son tableau.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Exporter ce tableau');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    // Les toasts, et les erreurs que le filet de sécurité rattraperait.
    await page.evaluate(() => {
        window.__toasts = [];
        const vrai = window.showToast;
        window.showToast = function (t) { window.__toasts.push(String(t)); return vrai.apply(this, arguments); };
        window.__jetees = [];
        window.addEventListener('error', (e) => window.__jetees.push(String(e.message)));
        window.addEventListener('unhandledrejection', (e) => window.__jetees.push(String((e.reason && e.reason.message) || e.reason)));
    });

    // Deux pages, comme dans le retour.
    await page.evaluate(() => {
        texts.push({ id: nextId++, x: 0, y: 0, content: 'PAGE UN', fontSize: 24, z: globalZ++ });
        saveState();
        ajouterUnePageVierge();
        texts.push({ id: nextId++, x: 0, y: 0, content: 'PAGE DEUX', fontSize: 24, z: globalZ++ });
        saveState();
    });
    await page.waitForTimeout(250);

    // ------------------------------------------------------------------
    // 1. UN TABLEAU NON ENREGISTRÉ S'EXPORTAIT DÉJÀ : on le fige, pour que le
    //    correctif ne le casse pas en réparant l'autre.
    // ------------------------------------------------------------------
    const libre = await page.evaluate(() => {
        const b = tableauDeLEcranPourExport();
        return { pages: b.data.pages.length,
                 mots: b.data.pages.map(p => (p.texts || []).map(t => t.content).join('')) };
    });
    r.egal('sans être rangé, le tableau de l\'écran porte ses deux pages',
        [libre.pages, libre.mots], [2, ['PAGE UN', 'PAGE DEUX']], JSON.stringify(libre));

    // ------------------------------------------------------------------
    // 2. LE DÉFAUT : LE TABLEAU RANGÉ DANS « MES TABLEAUX ».
    // ------------------------------------------------------------------
    await page.evaluate(async () => {
        const champ = document.getElementById('project-name-input');
        if (champ) champ.value = 'Ma séance';
        await saveCurrentBoard(true);
    });
    await page.waitForTimeout(450);
    const fiche = await page.evaluate(() => {
        const t = savedTableaux.find(x => x.id === selectedBoardId);
        return { rangee: !!t, nom: t ? t.name : null, porteLeContenu: !!(t && t.data) };
    });
    r.egal('la séance est rangée, et sa fiche NE PORTE PAS le contenu',
        [fiche.rangee, fiche.porteLeContenu], [true, false], JSON.stringify(fiche));

    // C'est exactement là que ça levait.
    const rangee = await page.evaluate(() => {
        try {
            const b = tableauDeLEcranPourExport();
            return { ok: true, pages: b.data.pages.length, nom: b.name,
                     mots: b.data.pages.map(p => (p.texts || []).map(t => t.content).join('')) };
        } catch (e) { return { ok: false, erreur: e.message }; }
    });
    r.egal('UNE FOIS RANGÉ, LE TABLEAU S\'EXPORTE ENCORE — c\'était la plainte',
        rangee.ok, true, JSON.stringify(rangee));
    r.egal('avec ses deux pages et leur contenu',
        [rangee.pages, rangee.mots], [2, ['PAGE UN', 'PAGE DEUX']], JSON.stringify(rangee));
    r.egal('et il porte le nom de la séance rangée', rangee.nom, 'Ma séance',
        JSON.stringify(rangee));

    // ------------------------------------------------------------------
    // 3. ET LE GESTE ENTIER NE LÈVE PLUS. « promptExportCurrentBoard » est ce
    //    que le bouton du menu appelle : c'est lui qui laissait passer
    //    l'erreur jusqu'au filet de sécurité général.
    // ------------------------------------------------------------------
    await page.evaluate(() => { window.__toasts = []; window.__jetees = []; });
    const appel = await page.evaluate(() => {
        try { promptExportCurrentBoard(); return 'tenu'; }
        catch (e) { return 'JETÉ : ' + e.message; }
    });
    await page.waitForTimeout(600);
    const suites = await page.evaluate(() => ({
        toasts: window.__toasts.slice(), jetees: window.__jetees.slice(),
        // La modale de nommage, ou celle des options : l'une des deux doit être là.
        modale: !!document.querySelector('.modal-backdrop')
    }));
    r.egal('« Exporter ce tableau » ne lève plus', appel, 'tenu', JSON.stringify(suites));
    r.egal('et rien ne tombe dans le filet de sécurité général',
        suites.jetees, [], JSON.stringify(suites));
    r.verifie('aucun message de panne n\'est montré à l\'enseignant',
        !suites.toasts.some(t => /problème est survenu|Erreur d'exportation/i.test(t)),
        JSON.stringify(suites.toasts));
    r.egal('la fenêtre d\'export s\'ouvre bel et bien', suites.modale, true,
        JSON.stringify(suites));

    // On referme ce qui s'est ouvert.
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
    });
    await page.waitForTimeout(150);

    // ------------------------------------------------------------------
    // 4. CE QU'ON VIENT D'ÉCRIRE PART AVEC. L'export lit « pages », où la
    //    feuille courante n'est rangée qu'au changement de page : sans le
    //    passage par « syncPage », on exportait la page en cours telle
    //    qu'elle était au dernier changement de feuille.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        texts.push({ id: nextId++, x: 0, y: 0, content: 'ÉCRIT À L\'INSTANT', fontSize: 24, z: globalZ++ });
        saveState();
    });
    await page.waitForTimeout(200);
    const frais = await page.evaluate(() => {
        const b = tableauDeLEcranPourExport();
        return b.data.pages.map(p => (p.texts || []).map(t => t.content));
    });
    r.verifie('le mot écrit à l\'instant, sans changer de page, est dans l\'export',
        JSON.stringify(frais).includes('ÉCRIT À L\'INSTANT'), JSON.stringify(frais));

    // ET LA VUE DE LA PAGE AUSSI — c'est elle qui demandait « syncPage ».
    //
    // Le CONTENU suivait déjà tout seul : les tableaux vivants et ceux de la
    // page sont les mêmes objets, si bien qu'y écrire les met à jour des deux
    // côtés. Ce qui ne suit pas, ce sont les SCALAIRES — le grossissement et
    // le cadrage —, qui sont recopiés par valeur au moment du rangement. Sans
    // le passage par « syncPage », l'export rendait la vue de la page courante
    // telle qu'elle était au dernier changement de feuille : un tableau rouvert
    // depuis ce fichier s'ouvrait ailleurs, à un autre grossissement, et l'on
    // croyait le travail déplacé.
    //
    // Sans ce contrôle, l'appel à « syncPage » survivait à son sabotage : il ne
    // mesurait rien.
    const vue = await page.evaluate(() => {
        zoom = 2.5; panX = -321; panY = -654;
        const b = tableauDeLEcranPourExport();
        const p = b.data.pages[currentPageIndex];
        return { exporte: [p.zoom, Math.round(p.panX), Math.round(p.panY)],
                 ecran: [zoom, Math.round(panX), Math.round(panY)] };
    });
    r.egal('le grossissement et le cadrage de la page en cours partent À JOUR',
        vue.exporte, vue.ecran, JSON.stringify(vue));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
