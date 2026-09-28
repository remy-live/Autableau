// LE CAHIER DE TEXTE S'EMPORTE
//
// « Il faudrait pouvoir exporter le cahier de texte, soit par classe (ou
// plusieurs). Pour ma part j'aime bien un tableau avec en ligne la classe en
// haut et la date verticale à gauche et le contenu dans les cases ; on pourrait
// avoir quelque chose qui permet la mise en forme, l'aperçu et l'export. Et
// pouvoir choisir la période. »
//
// C'est la forme du cahier de texte papier : les jours descendent, les classes
// traversent, et l'on lit une semaine d'un coup d'œil. Rien ne la rendait : ce
// qu'on écrit heure par heure dans la grille n'en ressortait jamais, sinon une
// case à la fois, à l'écran.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — le tableau a bien les classes en colonnes et les dates en lignes ;
//   — deux heures de la même classe le même jour tiennent dans UNE case, et
//     l'heure les sépare — sinon on ne sait pas ce qui a été fait quand ;
//   — une heure ouverte mais laissée vide ne fait pas de ligne ;
//   — la période, les classes et la mise en forme changent le tableau, et
//     l'APERÇU EST CE QU'ON EMPORTE : les trois sorties partent du même
//     tableau, donc disent la même chose ;
//   — un cahier écrit avant le changement de clé se lit encore ;
//   — et quand il n'y a rien à emporter, on le dit AVANT, au lieu de rendre
//     une feuille à en-tête et sans une ligne.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un emploi du temps et un cahier fabriqués de toutes pièces : trois classes,
// quatre jours, et les cas qui comptent — deux heures d'une même classe le
// même jour, une case ouverte et vide, une clé de l'ancienne forme.
const POSER = () => {
    agenda.entrees = [
        { id: 'e1', libelle: '6EME A', couleur: '#dfe4ff' },
        { id: 'e2', libelle: '4EME B', couleur: '#d9f2e6' },
        { id: 'e3', libelle: '3EME C', couleur: '#ffe6d5' }
    ];
    agenda.creneaux = [
        { id: 'c1', jour: 1, debut: 485, duree: 55, semaine: 'toutes', entreeId: 'e1', libelle: '6EME A' },
        { id: 'c2', jour: 1, debut: 600, duree: 55, semaine: 'toutes', entreeId: 'e2', libelle: '4EME B' },
        { id: 'c3', jour: 2, debut: 485, duree: 55, semaine: 'toutes', entreeId: 'e1', libelle: '6EME A' },
        { id: 'c4', jour: 1, debut: 700, duree: 55, semaine: 'toutes', entreeId: 'e1', libelle: '6EME A' },
        { id: 'c5', jour: 3, debut: 540, duree: 55, semaine: 'toutes', entreeId: 'e3', libelle: '3EME C' }
    ];
    cahier.jours = {
        '2026-09-28|c1': { fait: 'Fractions', devoirs: 'Ex. 18 p. 47' },
        '2026-09-28|c4': { fait: 'Correction du contrôle', devoirs: '' },
        '2026-09-28|c2': { fait: 'Pythagore', devoirs: '' },
        '2026-09-29|c3': { fait: 'Symétrie axiale', devoirs: 'Finir la figure' },
        '2026-09-30|c5': { fait: 'Fonctions affines', devoirs: '' },
        '2026-10-02|c1': { fait: '', devoirs: '' },            // ouverte et vide
        '2026-10-12|c1': { fait: 'Nombres décimaux', devoirs: '' }   // hors période
    };
};

module.exports = async function (browser) {
    const r = creerRapport('Le cahier de texte s\'emporte');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof tableauDuCahier === 'function'
        && typeof ouvrirLExportDuCahier === 'function', { timeout: 20000 });

    await page.evaluate(POSER);

    // ==================================================================
    // 1. LA FORME DEMANDÉE : LES CLASSES EN HAUT, LES DATES À GAUCHE
    // ==================================================================
    const t = await page.evaluate(() =>
        tableauDuCahier({ du: '2026-09-28', au: '2026-10-02' }));
    r.egal('les colonnes sont les classes', t.colonnes, ['6EME A', '4EME B', '3EME C']);
    r.egal('et les lignes sont les dates',
        t.lignes.map(l => l.date), ['2026-09-28', '2026-09-29', '2026-09-30']);
    r.egal('la ligne porte la date en toutes lettres', t.lignes[0].titre, 'lun. 28 sept.');
    r.egal('chaque ligne a une case par classe',
        t.lignes.map(l => l.cases.length), [3, 3, 3]);

    // DEUX HEURES DE LA MÊME CLASSE LE MÊME JOUR TIENNENT DANS UNE CASE, et
    // l'heure les sépare : sans elle, on ne saurait pas ce qui a été fait
    // quand, et deux lignes pour un même jour casseraient la forme demandée.
    r.egal('deux heures d\'une classe le même jour tiennent dans une case',
        t.lignes[0].cases[0],
        '8 h 05 — Fractions\nÀ faire : Ex. 18 p. 47\n11 h 40 — Correction du contrôle');
    r.egal('et une classe sans cours ce jour-là a une case vide',
        t.lignes[1].cases[1], '');

    // UNE HEURE OUVERTE MAIS VIDE N'EST PAS UN MOT. Le cahier en garde — on
    // ouvre une case, on n'écrit rien — et les compter ferait des lignes vides
    // qu'on n'a jamais écrites.
    r.egal('une heure ouverte et laissée vide ne fait pas de ligne',
        t.lignes.some(l => l.date === '2026-10-02'), false);
    r.egal('on compte les heures écrites, et elles seules', t.combien, 5);

    // ==================================================================
    // 2. LA PÉRIODE, LES CLASSES, LA MISE EN FORME
    // ==================================================================
    const reglages = await page.evaluate(() => ({
        // La période écarte ce qui est dehors.
        courte: tableauDuCahier({ du: '2026-09-29', au: '2026-09-29' }).lignes.length,
        tout: tableauDuCahier({}).lignes.length,
        // Une classe, ou plusieurs.
        uneClasse: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02', classes: ['6EME A'] }),
        deuxClasses: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02',
                                       classes: ['6EME A', '3EME C'] }).colonnes,
        // Une ligne par heure au lieu d'une par jour.
        parHeure: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02', parHeure: true })
            .lignes.map(l => l.titre.replace('\n', ' · ')),
        // Le travail à faire seul, et ce qu'on a fait seul.
        devoirs: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02', cases: 'devoirs' })
            .lignes.map(l => l.cases[0]),
        fait: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02', cases: 'fait' })
            .lignes[0].cases[0],
        // Les jours sans rien, quand on veut une feuille à remplir à la main.
        vides: tableauDuCahier({ du: '2026-09-28', au: '2026-10-02', videsGardees: true })
            .lignes.map(l => l.date)
    }));
    r.egal('une période d\'un jour ne garde que ce jour', reglages.courte, 1);
    r.verifie('« tout » va chercher au-delà', reglages.tout > 2, String(reglages.tout));
    r.egal('une seule classe ne fait qu\'une colonne', reglages.uneClasse.colonnes, ['6EME A']);
    r.egal('et seules ses heures comptent', reglages.uneClasse.combien, 3);
    r.egal('on peut en choisir plusieurs', reglages.deuxClasses, ['6EME A', '3EME C']);
    r.egal('« une ligne par heure » sépare les deux heures du lundi',
        reglages.parHeure,
        ['lun. 28 sept. · 8 h 05', 'lun. 28 sept. · 10 h', 'lun. 28 sept. · 11 h 40',
         'mar. 29 sept. · 8 h 05', 'mer. 30 sept. · 9 h']);
    // LE TRAVAIL À FAIRE SEUL : une case dont la classe n'a rien à faire reste
    // vide, et la ligne du lundi ne porte plus « Fractions ».
    r.egal('« le travail à faire » seul ne garde que lui',
        reglages.devoirs, ['8 h 05 — Ex. 18 p. 47', '8 h 05 — Finir la figure', '']);
    r.egal('et « ce qu\'on a fait » seul ne garde que lui',
        reglages.fait, '8 h 05 — Fractions\n11 h 40 — Correction du contrôle');
    r.egal('« garder les jours sans rien » ajoute les jours ouvrés vides',
        reglages.vides, ['2026-09-28', '2026-09-29', '2026-09-30',
                         '2026-10-01', '2026-10-02']);

    // ==================================================================
    // 3. L'APERÇU EST CE QU'ON EMPORTE
    //
    // Trois sorties bâties chacune de son côté finiraient par diverger, et
    // l'aperçu cesserait d'être un aperçu. Elles partent donc du même tableau,
    // et ce contrôle le vérifie sur ce qui se voit : les mêmes colonnes, les
    // mêmes lignes, le même texte dans les cases.
    // ==================================================================
    const sorties = await page.evaluate(() => {
        const t = tableauDuCahier({ du: '2026-09-28', au: '2026-10-02' });
        const boite = document.createElement('div');
        boite.innerHTML = cahierEnHtml(t, false);
        const tete = [...boite.querySelectorAll('thead th')].map(x => x.textContent);
        const corps = [...boite.querySelectorAll('tbody tr')].map(tr =>
            [...tr.children].map(c => c.textContent));
        const csv = cahierEnCsv(t);
        let pdf = null;
        try { const p = fabriquerLePdfDuCahier(t); pdf = p ? p.getNumberOfPages() : 0; }
        catch (e) { pdf = 'erreur : ' + e.message; }
        return {
            tete, premiereLigne: corps[0], combienDeLignes: corps.length,
            // Le CSV porte les mêmes colonnes, dans le même ordre.
            csvTete: csv.split('\r\n')[0].replace(/^﻿/, ''),
            csvCombien: csv.split('\r\n').filter(l => l.trim()).length,
            pdf,
            // Et la version qu'on colle emporte ses styles : un presse-papiers
            // ne transporte pas de feuille de style.
            colleStyle: /<table style=/.test(cahierEnHtml(t, true))
        };
    });
    r.egal('l\'aperçu a bien « Date » puis les classes',
        sorties.tete, ['Date', '6EME A', '4EME B', '3EME C']);
    r.egal('sa première ligne est celle du tableau',
        sorties.premiereLigne[0], 'lun. 28 sept.');
    r.egal('et il a autant de lignes que le tableau', sorties.combienDeLignes, 3);
    r.egal('le fichier .csv porte les mêmes colonnes',
        sorties.csvTete, '"Date";"6EME A";"4EME B";"3EME C"');
    r.egal('et autant de lignes, en-tête comprise', sorties.csvCombien, 4);
    r.verifie('le PDF se fabrique', sorties.pdf >= 1, String(sorties.pdf));
    r.verifie('et ce qu\'on colle porte ses styles avec lui', sorties.colleStyle,
        String(sorties.colleStyle));

    // ==================================================================
    // 4. UN CAHIER ÉCRIT AVANT LE CHANGEMENT DE CLÉ SE LIT ENCORE
    //
    // La clé du cahier a changé de forme en cours de route : « date | heure |
    // nom » est devenu « date | identifiant du créneau ». Un cahier enregistré
    // avant en contient, et l'export ne doit pas faire comme s'il n'y avait
    // rien écrit.
    // ==================================================================
    const vieux = await page.evaluate(() => {
        cahier.jours = { '2026-09-28|485|6EME A': { fait: 'Ancienne écriture', devoirs: '' } };
        const t = tableauDuCahier({});
        return { colonnes: t.colonnes, texte: t.lignes.length ? t.lignes[0].cases[0] : null };
    });
    r.egal('une clé de l\'ancienne forme donne sa classe', vieux.colonnes, ['6EME A']);
    r.egal('et son texte', vieux.texte, '8 h 05 — Ancienne écriture');

    // ==================================================================
    // 5. LA FENÊTRE : ON RÈGLE, ON VOIT, ON EMPORTE
    // ==================================================================
    const fenetre = await page.evaluate(async (source) => {
        // On repose le cahier d'essai : la partie précédente l'a remplacé par
        // une clé de l'ancienne forme.
        (new Function(source))();
        ouvrirLExportDuCahier();
        document.getElementById('cdx-du').value = '2026-09-28';
        document.getElementById('cdx-au').value = '2026-10-02';
        rendreLExportDuCahier();
        await new Promise(ok => setTimeout(ok, 60));
        const lire = () => ({
            colonnes: [...document.querySelectorAll('#cdx-apercu thead th')].map(x => x.textContent),
            lignes: document.querySelectorAll('#cdx-apercu tbody tr').length,
            compte: document.getElementById('cdx-compte').textContent,
            rien: getComputedStyle(document.getElementById('cdx-rien')).display !== 'none'
        });
        const depart = lire();
        // On décoche une classe : le tableau se redessine sous les yeux.
        const cases = [...document.querySelectorAll('#cdx-classes input')];
        cases.forEach(c => { c.checked = c.value === '6EME A'; });
        rendreLExportDuCahier();
        const uneSeule = lire();
        // Et une période sans rien le DIT, au lieu de rendre une feuille vide.
        document.getElementById('cdx-du').value = '2027-01-01';
        document.getElementById('cdx-au').value = '2027-01-31';
        rendreLExportDuCahier();
        const vide = lire();
        return { depart, uneSeule, vide,
                 boutons: ['cdx-pdf', 'cdx-copier', 'cdx-csv'].every(i => !!document.getElementById(i)) };
    }, '(' + POSER.toString() + ')()').catch(() => null);
    r.verifie('la fenêtre d\'export s\'ouvre et se remplit', !!fenetre, 'la page a rendu null');
    if (fenetre) {
        r.egal('elle montre les trois classes en colonnes',
            fenetre.depart.colonnes, ['Date', '6EME A', '4EME B', '3EME C']);
        r.egal('et trois lignes de dates', fenetre.depart.lignes, 3);
        r.egal('le compte dit ce qu\'on emporte', fenetre.depart.compte,
            '5 heures écrites · 3 classes');
        r.egal('décocher une classe redessine le tableau',
            fenetre.uneSeule.colonnes, ['Date', '6EME A']);
        r.egal('une période sans rien ne montre pas de tableau', fenetre.vide.lignes, 0);
        r.verifie('et elle le dit au lieu de laisser une feuille blanche',
            fenetre.vide.rien, JSON.stringify(fenetre.vide));
        r.verifie('les trois sorties sont là', fenetre.boutons, JSON.stringify(fenetre));
    }

    // LE BOUTON VIT DANS « MA SEMAINE » : c'est là qu'on remplit le cahier.
    const bouton = await page.evaluate(() => {
        const b = document.getElementById('edt-exporter');
        return b ? { la: true, dit: b.textContent.trim(),
                     pourLaSemaine: b.classList.contains('edt-pour-semaine') } : { la: false };
    });
    r.verifie('le bouton d\'export est dans la barre de l\'agenda', bouton.la, JSON.stringify(bouton));
    r.verifie('et il appartient à « Ma semaine », où l\'on remplit le cahier',
        bouton.pourLaSemaine, JSON.stringify(bouton));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
