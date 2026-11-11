// LES MENUS DISENT LEUR VERBE.
//
// « Je trouve cela chargé », et c'était vrai — mais le défaut n'était pas le
// NOMBRE de lignes. C'était qu'un même mot en recouvrait deux :
//
//   « Exporter en image ou en PDF… »   → donner quelque chose aux élèves
//   « Exporter une partie »            → donner quelque chose aux élèves
//   « Exporter ce tableau »            → SAUVEGARDER un fichier .prof
//   « Exporter tous les tableaux »     → SAUVEGARDER un fichier .autableau
//
// Deux retours sont tombés là-dessus le même mois, chacun par un bout :
//
//   « Lorsque je souhaite exporter mon tableau avec la fonction "exporter ce
//    tableau" j'ai ce message qui s'affiche... mon tableau comporte 2 pages
//    sur lesquelles j'ai importé un pdf. »
//
//   « Je n'ai pas trouvé l'export pdf des pages... on peut exporter seulement
//    une page mais pas une collection de pages, j'ai l'impression. »
//
// Le premier a cliqué une sauvegarde en croyant demander un PDF. Le second
// cherchait le PDF et ne l'a pas reconnu au milieu de quatre « Exporter ».
// Le bug du premier a été corrigé au chapitre 101 — mais la moitié de son
// problème était l'ÉTIQUETTE, et aucun correctif de code ne la répare.
//
// CE CHAPITRE NE MESURE PAS LE GOÛT. Il tient quatre promesses vérifiables :
// que rien n'a été retiré, que chaque ligne vit sous le verbe qui la décrit,
// qu'aucune ligne ne déborde sur deux rangs, et que les trois réglages ont
// quitté la liste sans perdre leur branchement. Plus une cinquième, héritée du
// chapitre 17 : l'aide doit nommer les commandes comme l'écran les nomme.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Les menus disent leur verbe');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    // Lire un menu : ses rubriques, ses lignes, et SOUS QUELLE RUBRIQUE chaque
    // ligne tombe — c'est cette dernière qui porte tout le changement.
    const lireLeMenu = (sel) => page.evaluate((sel) => {
        const m = document.getElementById(sel);
        if (!m) return null;
        const lignes = [];
        let rubrique = null;
        for (const n of Array.from(m.children)) {
            if (n.classList && n.classList.contains('menu-titre-section')) {
                rubrique = (n.textContent || '').trim();
                continue;
            }
            // Une ligne peut être le bouton lui-même, ou une boîte qui le
            // porte avec son rouage.
            const b = (n.classList && n.classList.contains('menu-item'))
                ? n : n.querySelector ? n.querySelector('.menu-item') : null;
            if (!b) continue;
            // CETTE LIGNE PASSE-T-ELLE À LA LIGNE ?
            //
            // DEUX MESURES ONT ÉTÉ ESSAYÉES ET JETÉES. Comparer la hauteur du
            // bouton à celle du plus court du menu : un intitulé sur deux
            // rangs fait 52 px contre 39, un tiers de plus — sous n'importe
            // quel seuil qu'on oserait écrire, si bien que remettre l'ancien
            // intitulé long ne faisait rien tomber. Puis compter les
            // rectangles du texte : la suite grise, écrite plus petit, et les
            // blancs du code source en fabriquaient trois là où l'œil en voit
            // un.
            //
            // CELLE-CI NE DEMANDE RIEN À PERSONNE : on interdit à la ligne de
            // se couper, et l'on regarde si elle rapetisse. Si oui, c'est
            // qu'elle se coupait.
            let deborde = null;
            try {
                const avant = b.style.whiteSpace;
                const haut = b.offsetHeight;
                b.style.whiteSpace = 'nowrap';
                const platte = b.offsetHeight;
                b.style.whiteSpace = avant;
                deborde = haut > platte + 2;
            } catch (e) { deborde = null; }
            lignes.push({
                deborde,
                mot: (b.textContent || '').trim().replace(/\s+/g, ' '),
                // Une ligne sans « id » se reconnaît à ce qu'elle appelle. On
                // garde l'appel ENTIER : tronqué, « workspace-loader-global »
                // devenait « workspace-loa » et ne se retrouvait plus.
                id: b.id || (b.getAttribute('onclick') || ''),
                rubrique,
                hauteur: Math.round(b.getBoundingClientRect().height)
            });
        }
        return { rubriques: Array.from(m.querySelectorAll('.menu-titre-section'))
                    .map(t => (t.textContent || '').trim()),
                 lignes, largeur: Math.round(m.getBoundingClientRect().width) };
    }, sel);

    const ouvrir = async (bouton) => {
        await page.evaluate((b) => { document.getElementById(b).click(); }, bouton);
        await page.waitForTimeout(200);
    };

    // ------------------------------------------------------------------
    // 1. RIEN N'A ÉTÉ RETIRÉ. C'est le point sur lequel on ne transige pas :
    //    chacune des seize entrées porte une demande écrite derrière elle, et
    //    « c'est chargé » n'est pas une raison d'en supprimer une.
    // ------------------------------------------------------------------
    await ouvrir('btn-import-menu');
    const entree = await lireLeMenu('import-popup-menu');
    await ouvrir('btn-export-menu');
    const sortie = await lireLeMenu('export-popup-menu');

    r.verifie('les deux menus se lisent', !!entree && !!sortie,
        JSON.stringify({ entree: !!entree, sortie: !!sortie }));

    // ON NE DÉRÉFÉRENCE PAS CE QU'ON N'A PAS : sans menu lisible, les
    // contrôles qui suivent doivent TOMBER, pas planter — un chapitre qui
    // plante emporte avec lui tout ce qu'il savait par ailleurs.
    const lignesEntree = entree ? entree.lignes : [];
    const lignesSortie = sortie ? sortie.lignes : [];
    const toutes = lignesEntree.concat(lignesSortie);

    r.egal('le menu d\'entrée garde ses six entrées', lignesEntree.length, 6,
        JSON.stringify(lignesEntree.map(l => l.mot)));
    r.egal('le menu de sortie garde ses dix entrées', lignesSortie.length, 10,
        JSON.stringify(lignesSortie.map(l => l.mot)));

    // Les seize actions, nommées par ce qu'elles APPELLENT et non par ce
    // qu'elles affichent : un intitulé peut changer, une fonction non.
    const actions = await page.evaluate(() => {
        const parId = (id) => !!document.getElementById(id);
        const parAppel = (bout) => !!document.querySelector(
            `#import-popup-menu .menu-item[onclick*="${bout}"], #export-popup-menu .menu-item[onclick*="${bout}"]`);
        return {
            media: parId('btn-import-pdf'),
            document: parId('btn-import-doc'),
            nuage: parId('btn-drive'),
            imagesPerdues: parId('btn-retrouver-images'),
            ouvrirUn: parId('btn-load'),
            ouvrirTous: parAppel('workspace-loader-global'),
            imageOuPdf: parId('btn-export-page'),
            partie: parId('btn-capture'),
            imprimer: parId('btn-imprimer'),
            visionneuse: parId('btn-visionneuse'),
            filmer: parId('btn-record-canvas'),
            sauverUn: parId('btn-export-current-board'),
            sauverTous: parAppel('promptExportWorkspace'),
            auto: parId('btn-dossier-securite'),
            preparation: parId('btn-preparation'),
            refaire: parId('btn-refaire')
        };
    });
    const perdues = Object.keys(actions).filter(k => !actions[k]);
    r.egal('les seize actions répondent toujours, aucune perdue au rangement',
        perdues, [], JSON.stringify(actions));

    // ------------------------------------------------------------------
    // 2. LE VERBE EST AU-DESSUS, ET IL EST JUSTE.
    //
    //    C'est le cœur du retour de Matthieu : « Exporter ce tableau » écrit
    //    une sauvegarde, et sous le mot « Exporter » elle se faisait passer
    //    pour une sortie destinée aux élèves. Les deux ne doivent plus
    //    pouvoir être confondues — donc pas la même rubrique.
    // ------------------------------------------------------------------
    const rubriqueDe = (id) => {
        const l = toutes.find(x => x.id === id);
        return l ? l.rubrique : null;
    };
    r.egal('« En image ou en PDF… » est rangé sous ce qu\'on donne aux élèves',
        rubriqueDe('btn-export-page'), 'Donner aux élèves',
        JSON.stringify(toutes.map(l => [l.rubrique, l.mot])));
    r.egal('la sauvegarde .prof est rangée sous ce qu\'on sauvegarde',
        rubriqueDe('btn-export-current-board'), 'Sauvegarder',
        JSON.stringify(toutes.map(l => [l.rubrique, l.mot])));
    r.verifie('et les deux ne portent donc plus le même verbe — c\'était tout le piège',
        rubriqueDe('btn-export-page') !== rubriqueDe('btn-export-current-board'),
        JSON.stringify([rubriqueDe('btn-export-page'), rubriqueDe('btn-export-current-board')]));

    // MONTRER N'EST PAS EXPORTER. Ces deux-là vivaient sous « Exporter » alors
    // que ni l'une ni l'autre ne sort le moindre fichier.
    r.egal('la visionneuse et la caméra d\'écran ont quitté « Exporter »',
        [rubriqueDe('btn-visionneuse'), rubriqueDe('btn-record-canvas')],
        ['Montrer à la classe', 'Montrer à la classe'],
        JSON.stringify(toutes.map(l => [l.rubrique, l.mot])));

    // LA COPIE AUTOMATIQUE EST UNE SAUVEGARDE, et elle avait une rubrique pour
    // elle toute seule. Une rubrique d'une ligne ne range rien : elle ajoute
    // un titre à lire.
    r.egal('la copie automatique a rejoint les sauvegardes',
        rubriqueDe('btn-dossier-securite'), 'Sauvegarder',
        JSON.stringify(toutes.map(l => [l.rubrique, l.mot])));
    r.verifie('et plus aucune rubrique ne tient sur une seule ligne',
        (entree ? entree.rubriques : []).concat(sortie ? sortie.rubriques : [])
            .every(t => toutes.filter(l => l.rubrique === t).length >= 2),
        JSON.stringify((sortie ? sortie.rubriques : []).map(t =>
            [t, toutes.filter(l => l.rubrique === t).length])));

    // LE MÊME GESTE, ENFIN VOISIN. Rouvrir une sauvegarde se faisait par deux
    // lignes posées aux deux bouts opposés de la liste.
    const rangs = lignesEntree.map((l, i) => ({ i, id: l.id }));
    const iUn = rangs.findIndex(x => x.id === 'btn-load');
    const iTous = rangs.findIndex(x => (x.id || '').includes('workspace-loader-global'));
    r.egal('les deux façons de rouvrir une sauvegarde sont devenues voisines',
        iUn >= 0 && iTous >= 0 ? Math.abs(iUn - iTous) : null, 1,
        JSON.stringify({ iUn, iTous, ordre: lignesEntree.map(l => l.mot) }));
    r.egal('et elles portent le même verbe',
        [rubriqueDe('btn-load'), (toutes.find(l => (l.id || '').includes('workspace-loader-global')) || {}).rubrique],
        ['Rouvrir', 'Rouvrir'], JSON.stringify(lignesEntree.map(l => [l.rubrique, l.mot])));

    // ------------------------------------------------------------------
    // 3. AUCUNE LIGNE NE DÉBORDE SUR DEUX RANGS.
    //
    //    C'est là que la place se gagne, et non en supprimant des entrées :
    //    dans un menu de 220 px, cinq intitulés passaient à la ligne.
    //
    //    DEUX LIGNES Y ONT DROIT, ET ELLES SEULES : les deux phrases de la
    //    séance, gardées entières parce que l'aide et trois messages les
    //    citent mot pour mot. Les nommer ici n'est pas une exception
    //    commode — c'est la liste close de ce qu'on s'autorise, et toute
    //    autre ligne qui déborde fait tomber le contrôle.
    // ------------------------------------------------------------------
    const aLeDroit = ['btn-preparation', 'btn-refaire'];
    r.verifie('on a bien su mesurer chaque ligne',
        toutes.length > 0 && toutes.every(l => typeof l.deborde === 'boolean'),
        JSON.stringify(toutes.map(l => [l.mot, l.deborde])));
    r.egal('aucune ligne ne passe à la ligne, hormis les deux phrases de la séance',
        toutes.filter(l => l.deborde && aLeDroit.indexOf(l.id) < 0).map(l => l.mot), [],
        JSON.stringify(toutes.map(l => [l.mot, l.deborde])));
    // Et l'exception est bien UNE exception : ces deux-là débordent vraiment,
    // sinon la liste ci-dessus pardonnerait quelque chose qui n'existe pas et
    // ne dirait plus rien le jour où un intitulé rallonge.
    r.egal('et ces deux-là débordent bien — l\'exception n\'est pas gratuite',
        toutes.filter(l => aLeDroit.indexOf(l.id) >= 0).map(l => l.deborde), [true, true],
        JSON.stringify(toutes.filter(l => aLeDroit.indexOf(l.id) >= 0)));

    // Et le menu n'a pas gagné en largeur ce qu'il a perdu en hauteur.
    r.verifie('le menu de sortie reste un petit meuble : 320 px au plus',
        !!sortie && sortie.largeur > 0 && sortie.largeur <= 320,
        String(sortie && sortie.largeur));

    // ------------------------------------------------------------------
    // 4. LES TROIS RÉGLAGES ONT QUITTÉ LA LISTE — SANS PERDRE LEUR FIL.
    //
    //    Qualité, mode d'arrivée du PDF et marge se lisaient avant même qu'on
    //    ait choisi d'importer un PDF, et repoussaient les trois lignes
    //    suivantes hors de vue. Ils n'appartiennent qu'à « Un média ».
    // ------------------------------------------------------------------
    await ouvrir('btn-import-menu');
    const auRepos = await page.evaluate(() => {
        const c = document.getElementById('reglages-media');
        const rg = document.getElementById('btn-reglages-media');
        return {
            creux: !!c,
            replies: c ? c.hidden : null,
            rouage: !!rg,
            marque: rg ? rg.getAttribute('aria-expanded') : null,
            // Les trois réglages sont-ils DANS le creux, et non dans la liste ?
            qualite: !!document.querySelector('#reglages-media #pdf-quality-select'),
            mode: !!document.querySelector('#reglages-media #pdf-mode-select'),
            marge: !!document.querySelector('#reglages-media #pdf-margin-slider'),
            // Un réglage posé à même la liste est un réglage du menu qui ne
            // descend PAS du creux — c'est exactement ce qu'on vient de
            // défaire. Le creux lui-même en contient trois : les compter
            // serait se mentir.
            dansLaListe: Array.from(document.querySelectorAll(
                '#import-popup-menu select, #import-popup-menu input[type=range]'))
                .filter(e => !e.closest('#reglages-media')).length
        };
    });
    r.egal('les trois réglages vivent dans leur creux, replié au repos',
        [auRepos.creux, auRepos.replies, auRepos.qualite, auRepos.mode, auRepos.marge],
        [true, true, true, true, true], JSON.stringify(auRepos));
    r.egal('et plus aucun d\'eux n\'est posé à même la liste',
        auRepos.dansLaListe, 0, JSON.stringify(auRepos));
    r.egal('le rouage dit qu\'il est fermé', auRepos.marque, 'false', JSON.stringify(auRepos));

    // LE ROUAGE DÉPLIE — ET NE FERME PAS LE MENU. Sans « stopPropagation », il
    // dépliait les réglages puis emportait la fenêtre où ils paraissaient.
    const deplie = await page.evaluate(() => {
        const rg = document.getElementById('btn-reglages-media');
        const c = document.getElementById('reglages-media');
        if (!rg || !c) return null;
        rg.click();
        const m = document.getElementById('import-popup-menu');
        return { ouvert: !c.hidden, marque: rg.getAttribute('aria-expanded'),
                 menuVivant: !!m && !!m.offsetParent,
                 hauteur: Math.round(c.getBoundingClientRect().height) };
    });
    r.egal('un appui sur le rouage déplie les réglages',
        deplie && [deplie.ouvert, deplie.marque], [true, 'true'], JSON.stringify(deplie));
    r.verifie('et le menu ne se referme pas sous eux',
        !!deplie && deplie.menuVivant && deplie.hauteur > 20, JSON.stringify(deplie));

    // ET ILS RÈGLENT ENCORE QUELQUE CHOSE. Un réglage rangé mais débranché
    // serait pire qu'un réglage encombrant.
    const branches = await page.evaluate(() => {
        const q = document.getElementById('pdf-quality-select');
        const m = document.getElementById('pdf-margin-slider');
        if (!q || !m) return null;
        const avantQ = currentPdfQuality, avantM = currentPdfMargin;
        q.value = '4.0'; q.dispatchEvent(new Event('change', { bubbles: true }));
        m.value = '300'; m.dispatchEvent(new Event('input', { bubbles: true }));
        const apres = { q: currentPdfQuality, m: currentPdfMargin,
                        lu: (document.getElementById('pdf-margin-val') || {}).innerText };
        currentPdfQuality = avantQ; currentPdfMargin = avantM;
        return apres;
    });
    r.egal('la qualité et la marge règlent toujours l\'import',
        branches && [branches.q, branches.m], [4, 300], JSON.stringify(branches));
    r.verifie('et la marge s\'écrit en toutes lettres à côté du curseur',
        !!branches && /300/.test(branches.lu || ''), JSON.stringify(branches));

    // Un second appui replie : le rouage est un interrupteur, pas une porte.
    const replie = await page.evaluate(() => {
        const rg = document.getElementById('btn-reglages-media');
        const c = document.getElementById('reglages-media');
        if (!rg || !c) return null;
        rg.click();
        return { ferme: c.hidden, marque: rg.getAttribute('aria-expanded') };
    });
    r.egal('un second appui les replie', replie && [replie.ferme, replie.marque],
        [true, 'false'], JSON.stringify(replie));

    // ------------------------------------------------------------------
    // 5. L'AIDE NOMME LES COMMANDES COMME L'ÉCRAN LES NOMME.
    //
    //    La règle vient du chapitre 17, et c'est elle qui rend un renommage
    //    coûteux : chaque intitulé est cité ailleurs, et une citation périmée
    //    envoie l'enseignant chercher un bouton qui n'existe plus. On vérifie
    //    donc que l'aide ne cite AUCUN des intitulés qu'on vient de retirer.
    // ------------------------------------------------------------------
    const disparus = [
        'Exporter ce tableau',
        'Exporter tous les tableaux',
        'Exporter en image ou en PDF',
        'Exporter une partie',
        'Importer Média',
        'Importer tous les tableaux',
        'Visionneuse — projeter la caméra',
        'Ouvrir un fichier'
    ];
    const citations = await page.evaluate((disparus) => {
        const b = document.getElementById('btn-help');
        if (b) b.click();
        const p = document.getElementById('aide-pages');
        const texte = p ? (p.textContent || '') : '';
        const m = document.getElementById('help-modal');
        if (m) m.style.display = 'none';
        return { lu: texte.length, periment: disparus.filter(d => texte.includes(d)) };
    }, disparus);
    r.verifie('l\'aide a bien été lue', citations.lu > 2000, String(citations.lu));
    r.egal('elle ne cite plus un seul intitulé qui n\'existe plus',
        citations.periment, [], JSON.stringify(citations));

    // Et les deux phrases que le chapitre 17 fige sont intactes : on ne les a
    // PAS raccourcies, justement parce que l'aide et trois messages les citent.
    const figees = await page.evaluate(() => {
        const t = (id) => {
            const e = document.getElementById(id);
            return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : null;
        };
        return { garder: t('btn-preparation'), refaire: t('btn-refaire') };
    });
    r.egal('les deux lignes de la séance gardent leur phrase entière',
        [figees.garder, figees.refaire],
        ['Garder ce tableau comme préparation', 'Refaire cette séance avec une autre classe'],
        JSON.stringify(figees));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
