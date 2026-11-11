// LE TIROIR DE DROITE NE SE RÉPÈTE PLUS.
//
// Avant de voir un seul tableau, son en-tête empilait deux onglets et DIX
// boutons-icônes sur trois rangs, tous muets. Quatre d'entre eux faisaient une
// action qui existait déjà ailleurs :
//
//   « Exporter tout »      = Exporter › Sauvegarder › Tous les tableaux
//   « Importer tout »      = Importer › Rouvrir › Tous les tableaux
//   « Ouvrir un .prof »    = Importer › Rouvrir › Un tableau
//   le disque muet         = le bouton « Enregistrer dans Mes tableaux »,
//                            écrit en toutes lettres SOIXANTE PIXELS plus bas,
//                            dans le même tiroir — les deux appelaient
//                            « saveCurrentBoard ».
//
// La règle était déjà écrite dans ce dépôt, à propos d'« Ouvrir un fichier » :
// « Un tiroir n'a pas à proposer deux fois la même chose. » Elle n'avait
// simplement jamais été appliquée ici.
//
// ET LES DEUX SEULS BOUTONS COLORÉS DU TIROIR étaient justement « Exporter
// tout » et « Importer tout » : l'œil était tiré, par du bleu et du vert, vers
// les deux actions les plus rares — et vers deux doublons.
//
// LE PIÈGE QU'ON A FAILLI POSER. Retirer le disque muet partout aurait
// supprimé LE SEUL MOYEN d'enregistrer une interface : le bandeau d'en
// dessous, lui, appelle « saveCurrentBoard » quel que soit l'onglet, et aurait
// donc enregistré le TABLEAU pendant qu'on range ses interfaces. Ce chapitre
// tient les deux cas, parce que c'est exactement là qu'un rangement bien
// intentionné casse quelque chose.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le tiroir ne se répète plus');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);
    await page.evaluate(() => {
        if (typeof toggleRightDrawer === 'function') toggleRightDrawer();
        if (typeof switchDrawerTab === 'function') switchDrawerTab('tableaux');
    });
    await page.waitForTimeout(400);

    const lireLEntete = () => page.evaluate(() => {
        const e = document.querySelector('#right-drawer .rd-actions');
        if (!e) return null;
        const vu = (n) => !!(n && n.offsetParent !== null);
        const boutons = Array.from(e.querySelectorAll('button'));
        return {
            visibles: boutons.filter(vu).map(b => ({
                nom: b.dataset.tooltip || b.title || '',
                appel: (b.getAttribute('onclick') || '') + (b.id || ''),
                // Un bouton est MUET s'il ne montre aucun mot : son nom ne
                // vit alors que dans l'infobulle, invisible au doigt sur le
                // tableau tactile d'une salle de classe.
                muet: !(b.textContent || '').trim()
            })),
            // Les deux taches de couleur étaient posées en style à la main.
            colores: boutons.filter(vu).filter(b =>
                /background:\s*rgba\(/.test(b.getAttribute('style') || '')).length,
            hauteur: Math.round(e.getBoundingClientRect().height)
        };
    });

    // ------------------------------------------------------------------
    // 1. LES TROIS DOUBLONS PURS ONT QUITTÉ L'EN-TÊTE — ET RESTENT
    //    ATTEIGNABLES LÀ OÙ LE MOT LES NOMME.
    //
    //    Retirer un raccourci sans vérifier que l'action survit ailleurs,
    //    c'est supprimer la fonction en croyant ranger le meuble.
    // ------------------------------------------------------------------
    const entete = await lireLEntete();
    r.verifie('l\'en-tête du tiroir se lit', !!entete, 'en-tête introuvable');

    const visibles = entete ? entete.visibles : [];
    const porte = (bout) => visibles.some(b => b.appel.indexOf(bout) >= 0);
    r.egal('« Exporter tout » a quitté l\'en-tête', porte('promptExportWorkspace'), false,
        JSON.stringify(visibles));
    r.egal('« Importer tout » aussi', porte('workspace-loader-global'), false,
        JSON.stringify(visibles));
    r.egal('et « Ouvrir un .prof » aussi', porte('file-loader'), false,
        JSON.stringify(visibles));

    // Mais les trois actions existent toujours, dans les menus, sous leur
    // verbe. On les cherche par ce qu'elles APPELLENT, pas par leur libellé.
    const ailleurs = await page.evaluate(() => {
        const dansLesMenus = (bout) => !!document.querySelector(
            `#import-popup-menu [onclick*="${bout}"], #export-popup-menu [onclick*="${bout}"]`);
        return {
            exporterTout: dansLesMenus('promptExportWorkspace'),
            importerTout: dansLesMenus('workspace-loader-global'),
            ouvrirUn: !!document.getElementById('btn-load')
        };
    });
    r.egal('les trois restent atteignables dans les menus, sous leur verbe',
        ailleurs, { exporterTout: true, importerTout: true, ouvrirUn: true },
        JSON.stringify(ailleurs));

    // ------------------------------------------------------------------
    // 2. UNE SEULE PORTE POUR ENREGISTRER UN TABLEAU — ET ELLE EST ÉCRITE.
    // ------------------------------------------------------------------
    const portes = await page.evaluate(() => {
        const vu = (n) => !!(n && n.offsetParent !== null);
        const disque = document.getElementById('btn-explorer-save');
        const bandeau = document.getElementById('ouje-ranger');
        return {
            disqueVu: vu(disque),
            bandeauVu: vu(bandeau),
            bandeauMot: bandeau ? (bandeau.textContent || '').trim() : null
        };
    });
    r.egal('le disque muet ne paraît plus du côté des tableaux',
        portes.disqueVu, false, JSON.stringify(portes));
    r.egal('et la porte qui reste est celle qui porte son nom',
        [portes.bandeauVu, /Enregistrer/.test(portes.bandeauMot || '')], [true, true],
        JSON.stringify(portes));

    // ------------------------------------------------------------------
    // 3. MAIS CÔTÉ INTERFACES, LA PORTE EXISTE — ET ELLE MÈNE AUX
    //    INTERFACES, PAS AUX TABLEAUX.
    //
    //    C'est le contrôle qui compte le plus de ce chapitre : sans lui, le
    //    rangement aurait supprimé une fonction entière sans que rien ne le
    //    dise.
    // ------------------------------------------------------------------
    await page.evaluate(() => switchDrawerTab('interfaces'));
    await page.waitForTimeout(250);
    const cotéInterfaces = await page.evaluate(() => {
        const d = document.getElementById('btn-explorer-save');
        return { vu: !!(d && d.offsetParent !== null),
                 bulle: d ? (d.dataset.tooltip || '') : null };
    });
    r.egal('du côté des interfaces, la porte d\'enregistrement est là',
        cotéInterfaces.vu, true, JSON.stringify(cotéInterfaces));
    r.verifie('et son infobulle parle bien d\'une interface, pas d\'un tableau',
        /interface/i.test(cotéInterfaces.bulle || ''), JSON.stringify(cotéInterfaces));

    // ET ELLE ENREGISTRE UNE INTERFACE. On ne va pas jusqu'au bout — cela
    // écrirait — mais on regarde ce que le geste OUVRE : la fenêtre de nom
    // d'une interface, et non celle d'un tableau.
    const ouvre = await page.evaluate(() => {
        const d = document.getElementById('btn-explorer-save');
        if (!d) return null;
        if (typeof selectedInterfaceId !== 'undefined') selectedInterfaceId = null;
        d.click();
        const t = document.getElementById('sys-prompt-title');
        const m = document.getElementById('sys-prompt-modal');
        const titre = t ? (t.innerText || '') : '';
        if (typeof closeSysPromptModal === 'function') closeSysPromptModal();
        else if (m) m.style.display = 'none';
        return { titre, ouverte: !!m };
    });
    r.verifie('et le geste ouvre bien l\'enregistrement d\'une INTERFACE',
        !!ouvre && /interface/i.test(ouvre.titre), JSON.stringify(ouvre));

    await page.evaluate(() => switchDrawerTab('tableaux'));
    await page.waitForTimeout(250);
    const retour = await page.evaluate(() =>
        !!(document.getElementById('btn-explorer-save') || {}).offsetParent);
    r.egal('et en revenant aux tableaux, elle se retire à nouveau', retour, false,
        String(retour));

    // ------------------------------------------------------------------
    // 4. LES TROIS OUTILS DU MÉTIER PORTENT LEUR NOM.
    //
    //    Le cahier de texte, l'emploi du temps et l'historique n'agissent pas
    //    sur la liste des tableaux : ils ouvrent autre chose. Mêlés aux
    //    actions de l'explorateur, en icônes muettes, ils ne disaient plus de
    //    quelle famille ils étaient.
    // ------------------------------------------------------------------
    const outils = await page.evaluate(() => Array.from(document.querySelectorAll('.rd-outil'))
        .map(b => ({ mot: (b.textContent || '').trim(),
                     vu: !!(b.offsetParent !== null),
                     appel: b.getAttribute('onclick') || '' })));
    r.egal('les trois outils du métier sont là, et visibles',
        outils.filter(o => o.vu).length, 3, JSON.stringify(outils));
    r.egal('chacun porte son nom en toutes lettres',
        outils.map(o => o.mot), ['Cahier de texte', 'Emploi du temps', 'Historique'],
        JSON.stringify(outils));
    r.verifie('et chacun ouvre toujours ce qu\'il ouvrait',
        outils.length === 3
        && /ouvrirLeCahier/.test(outils[0].appel)
        && /ouvrirLAgenda/.test(outils[1].appel)
        && /openCalendarModal/.test(outils[2].appel), JSON.stringify(outils));

    // ------------------------------------------------------------------
    // 5. CE QUI RESTE DANS L'EN-TÊTE EST COURT, ET PLUS RIEN N'Y EST COLORÉ.
    // ------------------------------------------------------------------
    const apres = await lireLEntete();
    const vus = apres ? apres.visibles : [];
    r.egal('l\'en-tête ne porte plus que six boutons', vus.length, 6,
        JSON.stringify(vus.map(b => b.nom)));
    r.egal('et les deux taches de couleur ont disparu',
        apres ? apres.colores : null, 0, JSON.stringify(apres));
    r.egal('la moitié d\'entre eux ne sont plus muets',
        vus.filter(b => !b.muet).length, 3, JSON.stringify(vus));

    // ------------------------------------------------------------------
    // 6. ON N'A RIEN EMPORTÉ D'AUTRE. Les onglets, le bandeau, l'arbre et la
    //    corbeille sont au même endroit : ranger un en-tête ne doit pas
    //    toucher au reste du meuble.
    // ------------------------------------------------------------------
    const reste = await page.evaluate(() => {
        const vu = (id) => !!((document.getElementById(id) || {}).offsetParent);
        return {
            ongletTableaux: vu('tab-tableaux'),
            ongletInterfaces: vu('tab-interfaces'),
            bandeau: vu('rd-ou-je-suis'),
            arbre: vu('file-tree-container'),
            corbeille: vu('trash-section'),
            recherche: !!document.getElementById('explorer-search-bar')
        };
    });
    r.egal('onglets, bandeau, arbre, corbeille et recherche sont intacts',
        reste, { ongletTableaux: true, ongletInterfaces: true, bandeau: true,
                 arbre: true, corbeille: true, recherche: true },
        JSON.stringify(reste));

    // ------------------------------------------------------------------
    // 7. LE DOUBLON QU'ON GARDE EXPRÈS.
    //
    //    L'emploi du temps est AUSSI à côté de la pastille de classe, et
    //    c'est voulu : « il faut le mettre en icône à côté de la classe,
    //    sinon on se perd encore. » Un chapitre qui chasse les doublons doit
    //    nommer celui qu'il épargne, sinon quelqu'un le supprimera demain en
    //    croyant bien faire.
    // ------------------------------------------------------------------
    const edt = await page.evaluate(() => Array.from(
        document.querySelectorAll('[onclick*="ouvrirLAgenda"]')).length);
    r.egal('l\'emploi du temps garde ses deux portes — celle-là est voulue',
        edt, 2, String(edt));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
