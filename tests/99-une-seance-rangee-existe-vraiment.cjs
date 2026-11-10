// UNE SÉANCE RANGÉE EXISTE VRAIMENT — ET UN ÉCHEC SE DIT.
//
// « L'enregistrement des séances n'est pas toujours évident. »
//
// Trois endroits mentaient quand le disque refusait d'écrire — et un disque
// refuse d'écrire plus souvent qu'on ne croit : navigation privée, quota de
// l'origine atteint, données du site bloquées par l'établissement.
//
// 1. « _doSaveBoard » ÉCRIVAIT L'ENTRÉE DE LA LISTE PUIS LES DONNÉES, sans
//    jamais vérifier que la seconde écriture aboutisse. Si elle échouait, la
//    séance paraissait dans « Mes tableaux » avec son nom, sa date et son
//    aperçu — et son contenu n'existait nulle part. Un fantôme.
//
// 2. « loadBoard » FAISAIT « if (data) { … } » SANS « else ». On cliquait sur
//    cette séance fantôme, et il ne se passait RIEN : pas d'erreur, pas de
//    message, pas de tableau. C'est très exactement « pas toujours évident ».
//
// 3. « writeAppLocal » MARQUAIT « enregistré à l'instant » DANS SON FINALLY,
//    même quand ses DEUX écritures avaient échoué. La pastille verte disait
//    que le cours était en sécurité ; il n'était nulle part.
//
// Ce chapitre fait refuser le disque, et vérifie qu'on le dit.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Une séance rangée existe vraiment');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 800 } });
    await tableauVierge(page);

    // On fait refuser l'écriture, pour les clés qu'on veut, quand on veut.
    const refuser = (motif) => page.evaluate((m) => {
        if (!window.__vraiSetItem) window.__vraiSetItem = localforage.setItem.bind(localforage);
        window.__refus = m;
        localforage.setItem = function (cle, val) {
            if (window.__refus && String(cle).includes(window.__refus)) {
                return Promise.reject(new Error('QuotaExceededError (simulé)'));
            }
            return window.__vraiSetItem(cle, val);
        };
    }, motif);
    const nePlusRefuser = () => page.evaluate(() => {
        window.__refus = null;
        if (window.__vraiSetItem) localforage.setItem = window.__vraiSetItem;
    });
    const mots = () => page.evaluate(() => (window.__toasts || []).slice());
    const ecouterLesToasts = () => page.evaluate(() => {
        window.__toasts = [];
        if (window.__toastsEcoutes) return;
        window.__toastsEcoutes = true;
        const vrai = window.showToast;
        window.showToast = function (t) { (window.__toasts = window.__toasts || []).push(String(t)); return vrai.apply(this, arguments); };
    });
    await ecouterLesToasts();

    // Un tableau qui a quelque chose dessus.
    await page.evaluate(() => {
        texts.push({ id: nextId++, x: 0, y: 0, content: 'SÉANCE DU JOUR', fontSize: 24, z: globalZ++ });
        saveState();
    });

    // ------------------------------------------------------------------
    // 1. UNE SÉANCE QU'ON NE PEUT PAS ÉCRIRE NE DOIT PAS PARAÎTRE RANGÉE.
    // ------------------------------------------------------------------
    await refuser('data_');
    await page.evaluate(() => { window.__toasts = []; });
    const avantListe = await page.evaluate(() => savedTableaux.length);
    const retour = await page.evaluate(async () => {
        try {
            currentBoardName = 'Séance refusée';
            const ok = await saveCurrentBoard(false);
            return 'rendu ' + JSON.stringify(ok);
        } catch (e) { return 'rejetée : ' + e.message; }
    });
    await page.waitForTimeout(300);
    const apres = await page.evaluate(() => ({
        liste: savedTableaux.length,
        noms: savedTableaux.map(t => t.name)
    }));
    r.egal('une séance dont les données n\'ont pas pu s\'écrire N\'EST PAS dans la liste',
        apres.liste, avantListe, JSON.stringify([retour, apres]));
    const ditLEchec = (await mots()).some(t => /impossible|pas pu|échou|refus/i.test(t));
    r.verifie('et l\'échec est DIT, au lieu de passer sous silence',
        ditLEchec, JSON.stringify(await mots()));
    const ditRange = (await mots()).some(t => /rangé dans Mes tableaux/i.test(t));
    r.egal('et surtout, on ne dit PAS qu\'elle est rangée', ditRange, false,
        JSON.stringify(await mots()));

    // ------------------------------------------------------------------
    // 2. L'ENREGISTREMENT LOCAL QUI ÉCHOUE NE DIT PAS « ENREGISTRÉ ».
    // ------------------------------------------------------------------
    await refuser('AutoSave');
    await page.evaluate(() => { window.__toasts = []; });
    await page.evaluate(async () => {
        try { await saveAppLocal(true); } catch (e) { /* on veut l'état, pas l'erreur */ }
    });
    await page.waitForTimeout(300);
    const etat = await page.evaluate(() => {
        const b = document.getElementById('etat-enregistrement');
        const e = (typeof etatDuRangement === 'function') ? etatDuRangement() : null;
        return {
            pastille: b ? b.dataset.etat : null,
            mot: document.getElementById('etat-mot') ? document.getElementById('etat-mot').textContent : null,
            aide: b ? b.title : null,
            echec: e && e.local ? !!e.local.echec : null
        };
    });
    r.egal('la pastille passe à l\'échec quand le disque refuse', etat.pastille, 'echec',
        JSON.stringify(etat));
    r.verifie('et elle ne prétend pas que c\'est enregistré',
        !/^Enregistré/.test(etat.mot || ''), JSON.stringify(etat));
    r.verifie('son infobulle dit quoi faire, pas seulement que ça a raté',
        /export|fichier|copie/i.test(etat.aide || ''), JSON.stringify(etat));
    r.egal('l\'état du rangement porte l\'échec, pour qui le relira', etat.echec, true,
        JSON.stringify(etat));

    // ------------------------------------------------------------------
    // 3. LE DISQUE REVIENT : LA PASTILLE REVIENT AU VERT.
    //    Un état d'échec qui ne se lève plus est aussi faux que l'inverse.
    // ------------------------------------------------------------------
    await nePlusRefuser();
    await page.evaluate(async () => { await saveAppLocal(true); });
    await page.waitForTimeout(400);
    const guéri = await page.evaluate(() => ({
        pastille: document.getElementById('etat-enregistrement').dataset.etat,
        mot: document.getElementById('etat-mot').textContent
    }));
    r.egal('le disque rendu, la pastille repasse au bon état', guéri.pastille, 'bon',
        JSON.stringify(guéri));
    r.verifie('et elle redit « Enregistré »', /^Enregistré/.test(guéri.mot || ''),
        JSON.stringify(guéri));

    // ------------------------------------------------------------------
    // 4. UNE SÉANCE DONT LES DONNÉES ONT DISPARU LE DIT, AU LIEU DE NE RIEN
    //    FAIRE. C'est le cas du fantôme déjà présent dans la liste d'un
    //    enseignant : le correctif de plus haut l'empêche d'en créer de
    //    nouveaux, celui-ci rend lisibles ceux qui existent déjà.
    // ------------------------------------------------------------------
    await page.evaluate(() => { window.__toasts = []; });
    const idFantome = await page.evaluate(async () => {
        const id = 'fantome-' + Date.now();
        savedTableaux.unshift({ id, name: 'Séance fantôme', date: '01/01/2026',
                                time: '08:00', timestamp: Date.now(), preview: null });
        await localforage.removeItem('data_' + id);   // ses données n'existent pas
        return id;
    });
    const nomAvant = await page.evaluate(() => currentBoardName);
    await page.evaluate((id) => loadBoard(id), idFantome);
    await page.waitForTimeout(400);
    const apresFantome = await page.evaluate(() => ({
        nom: currentBoardName,
        toasts: (window.__toasts || []).slice()
    }));
    r.verifie('ouvrir une séance sans contenu DIT que son contenu manque',
        apresFantome.toasts.some(t => /contenu|introuvable|vide|plus|manque/i.test(t)),
        JSON.stringify(apresFantome));
    r.egal('et le tableau sur lequel on travaillait n\'est pas remplacé par du vide',
        apresFantome.nom, nomAvant, JSON.stringify([nomAvant, apresFantome.nom]));

    // ------------------------------------------------------------------
    // 5. ET LE FANTÔME NE SURVIT PAS AU REDÉMARRAGE.
    //
    // C'est ce qui justifie d'écrire LE CONTENU D'ABORD et la fiche ensuite.
    // Défaire la fiche en mémoire ne suffit pas : dans l'ancien ordre, la
    // liste partait sur le DISQUE avant que le contenu échoue. Le lendemain,
    // l'enseignant rouvrait son navigateur et la séance était toujours là,
    // avec son nom et son aperçu, et toujours vide. La remise en ordre de la
    // liste vivante n'y changeait rien — c'est le disque qui mentait.
    //
    // Sans ce contrôle, l'inversion de l'ordre survivait à son sabotage : elle
    // ne mesurait rien, et une correction qu'on ne mesure pas n'en est pas une.
    // ------------------------------------------------------------------
    await nePlusRefuser();
    // « saveCurrentBoard » prend le nom DANS LE CHAMP du titre, pas dans
    // « currentBoardName » : c'est lui qu'on remplit, sinon la séance s'appelle
    // ce que le champ portait et le contrôle mesure autre chose.
    const nommerEtRanger = (nom) => page.evaluate(async (n) => {
        const champ = document.getElementById('project-name-input');
        if (champ) champ.value = n;
        selectedBoardId = null;
        return await saveCurrentBoard(true);
    }, nom);
    // Une séance bien rangée d'abord, pour que la liste du disque existe et
    // qu'on puisse voir ce que la suivante y ajoute — ou non.
    await nommerEtRanger('Séance qui tient');
    await page.waitForTimeout(300);
    await refuser('data_');
    await nommerEtRanger('Séance qui ne tient pas');
    await page.waitForTimeout(400);
    // On relit le disque : « getItem » n'est pas touché par le refus, qui ne
    // porte que sur l'écriture.
    const surLeDisque = await page.evaluate(async () => {
        const l = await localforage.getItem('auTableau_tableaux_list');
        return (l || []).map(t => t && t.name);
    });
    r.verifie('la séance bien rangée est sur le disque',
        surLeDisque.includes('Séance qui tient'), JSON.stringify(surLeDisque));
    r.egal('LA SÉANCE FANTÔME N\'Y EST PAS — la liste du disque n\'a jamais porté son nom',
        surLeDisque.includes('Séance qui ne tient pas'), false,
        JSON.stringify(surLeDisque));

    // ------------------------------------------------------------------
    // 6. ET L'ORDRE LUI-MÊME SE MESURE : LE CONTENU AVANT LA FICHE.
    //
    // Le contrôle du disque, juste au-dessus, dit l'état d'arrivée — aucun
    // fantôme — mais il ne tranche PAS l'ordre : « savedTableaux » est un
    // tableau vivant, et la remise en ordre du « catch » le modifie souvent
    // avant que localforage n'en ait fait sa copie. Le fantôme disparaissait
    // donc de l'écriture par une course, pas par une garantie — et l'ordre
    // inversé survivait à son sabotage sans rien faire tomber.
    //
    // On mesure donc la décision elle-même, qui EST un ordre : les données
    // partent les premières, et la fiche ne part qu'après elles. Dans ce
    // sens-là, une fiche n'est jamais écrite pour un contenu qui n'existe pas,
    // quelle que soit la vitesse de la copie.
    // ------------------------------------------------------------------
    await nePlusRefuser();
    await page.evaluate(() => {
        window.__ordre = [];
        const vrai = localforage.setItem.bind(localforage);
        localforage.setItem = function (cle, val) { window.__ordre.push(String(cle)); return vrai(cle, val); };
    });
    await nommerEtRanger('Séance pour l\'ordre');
    await page.waitForTimeout(400);
    const ordre = await page.evaluate(() => (window.__ordre || []).slice());
    const rangData = ordre.findIndex(c => c.startsWith('data_'));
    const rangListe = ordre.findIndex(c => c === 'auTableau_tableaux_list');
    r.verifie('les deux écritures ont bien eu lieu',
        rangData >= 0 && rangListe >= 0, JSON.stringify(ordre));
    r.verifie('LE CONTENU EST ÉCRIT AVANT LA FICHE DE LA LISTE',
        rangData >= 0 && rangListe >= 0 && rangData < rangListe, JSON.stringify(ordre));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
