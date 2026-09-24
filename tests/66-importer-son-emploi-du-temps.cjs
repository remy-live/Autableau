// IMPORTER SON EMPLOI DU TEMPS DEPUIS PRONOTE
//
// « Ça c'est mon EDT, serais-tu capable de permettre au logiciel d'importer
// son EDT et de le mettre sur Au Tableau plutôt que de tout taper à la main ? »
//
// Pronote exporte un « .ics ». Tout y est — l'heure, la matière, la classe, la
// salle — mais quatre pièges s'y cachent, et chacun donne un emploi du temps
// FAUX sans rien annoncer.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — les heures sont en TEMPS UNIVERSEL, et se rendent dans le fuseau de la
//     machine : « 06:05Z » est 8 h 05 en France l'été, 7 h 05 l'hiver. C'est
//     la vérification la plus importante du chapitre, parce que l'erreur est
//     silencieuse et qu'elle CHANGE au passage à l'heure d'hiver ;
//   — les lignes pliées à soixante-quinze octets se redressent ;
//   — les vacances, qui sont des journées entières, ne vont pas dans la grille ;
//   — deux semaines importées ne font pas deux fois le même cours ;
//   — les sonneries de l'établissement se relèvent toutes seules ;
//   — chaque classe reçoit sa teinte, et non le rouge unique de la matière ;
//   — importer REMPLACE, donc on demande d'abord — et refuser ne change rien.
//
// LES FICHIERS SONT FABRIQUÉS ICI, et c'est délibéré : un vrai export porte le
// nom de l'enseignant, son établissement et ses horaires. Cela n'a rien à faire
// dans un dépôt.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un événement Pronote, écrit comme Pronote l'écrit.
const cours = (o) => [
    'BEGIN:VEVENT',
    'CATEGORIES:' + (o.categorie || 'Cours'),
    'UID:' + (o.uid || ('Cours-' + Math.random())),
    'DTSTART:' + o.debut,
    'DTEND:' + o.fin,
    'SUMMARY;LANGUAGE=fr:' + o.titre,
    'LOCATION;LANGUAGE=fr:' + (o.salle || '08'),
    'DESCRIPTION;LANGUAGE=fr:Matière : ' + o.matiere + '\\nProfesseur : DUPONT\\n'
        + (o.groupe ? 'Groupe : ' + o.groupe : 'Classe : ' + o.classe)
        + '\\nSalle : ' + (o.salle || '08') + '\\n',
    'COLOR:' + (o.couleur || '#FE0107'),
    'END:VEVENT'
].join('\r\n');

const calendrier = (corps) => [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID;LANGUAGE=fr:Copyright Index-Education - Index-Education - ProNote202',
    ' 6 2026',
    'METHOD:PUBLISH'
].join('\r\n') + '\r\n' + corps + '\r\nEND:VCALENDAR\r\n';

module.exports = async function (browser) {
    const r = creerRapport('Importer son emploi du temps');
    // LE FUSEAU EST LE SUJET : on demande la France, sans quoi la machine
    // vivrait en temps universel et l'épreuve la plus importante du chapitre
    // ne prouverait rien — zéro heure de décalage se lit comme une réussite.
    const { page, context, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1500, height: 950 }, fuseau: 'Europe/Paris' });

    const lire = (texte) => page.evaluate((t) => {
        const lu = edtDepuisIcs(t);
        if (lu.erreur) return { erreur: lu.erreur };
        return {
            lus: lu.lus, uniques: lu.cours.length, matiere: lu.matiereDominante,
            debut: lu.debut, fin: lu.fin, sonneries: lu.sonneries,
            vacances: lu.vacances.map(v => v.titre),
            entrees: lu.entrees.map(e => ({ libelle: e.libelle, couleur: e.couleur, heures: e.heures })),
            cours: lu.cours.map(c => ({ jour: c.jour, debut: c.debut, duree: c.duree,
                                        classe: c.classe, matiere: c.matiere, salle: c.salle }))
        };
    }, texte);

    // ==========================================================
    // 1. LES HEURES SONT EN TEMPS UNIVERSEL
    //
    // « DTSTART:20260922T060500Z » n'est pas six heures cinq : c'est huit
    // heures cinq en France, l'été. Lues telles quelles, TOUTES les heures
    // reculent de deux heures — et l'erreur passe à une heure au changement
    // d'horaire, si bien qu'un import de septembre et un import de novembre ne
    // se ressembleraient pas.
    // ==========================================================
    const ete = await lire(calendrier(cours({
        debut: '20260922T060500Z', fin: '20260922T070500Z',
        titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B'
    })));
    r.egal('un cours de 06:05 UTC en septembre tombe à 8 h 05, heure française',
        { jour: ete.cours[0].jour, debut: ete.cours[0].debut, duree: ete.cours[0].duree },
        { jour: 2, debut: 8 * 60 + 5, duree: 60 });

    // LE MÊME COURS EN NOVEMBRE, à l'heure d'hiver : une heure de décalage au
    // lieu de deux. C'est cette différence-là qu'un calcul fixe raterait.
    const hiver = await lire(calendrier(cours({
        debut: '20261124T060500Z', fin: '20261124T070500Z',
        titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B'
    })));
    r.egal('et le même en novembre tombe à 7 h 05 : l\'heure d\'hiver est respectée',
        hiver.cours[0].debut, 7 * 60 + 5);

    // UNE HEURE LOCALE SANS « Z » SE LIT TELLE QUELLE.
    const locale = await lire(calendrier(cours({
        debut: '20260922T080500', fin: '20260922T090000',
        titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B'
    })));
    r.egal('une heure écrite sans « Z » est déjà locale', locale.cours[0].debut, 8 * 60 + 5);

    // ==========================================================
    // 2. LES LIGNES PLIÉES
    //
    // La norme coupe à soixante-quinze octets et poursuit après une espace.
    // Une description lue ligne à ligne perd un mot sur deux — et c'est dans la
    // description que vivent la matière et la classe.
    // ==========================================================
    const plie = await lire(calendrier([
        'BEGIN:VEVENT', 'CATEGORIES:Cours',
        'DTSTART:20260922T060500Z', 'DTEND:20260922T070500Z',
        'SUMMARY;LANGUAGE=fr:MATHEMATIQUES - 6EME B',
        'LOCATION;LANGUAGE=fr:104 Labo de langues',
        'DESCRIPTION;LANGUAGE=fr:Matière : MATHEMATIQUES\\nProfesseur : DEVODDER',
        ' E\\nClasse : 6EME B\\nSalle : 104 Labo de langues\\n',
        'COLOR:#FE0107', 'END:VEVENT'
    ].join('\r\n')));
    r.egal('une description pliée sur deux lignes se redresse',
        { classe: plie.cours[0].classe, matiere: plie.cours[0].matiere, salle: plie.cours[0].salle },
        { classe: '6EME B', matiere: 'MATHEMATIQUES', salle: '104 Labo de langues' });

    // UN GROUPE EST ÉCHAPPÉ : « &lt\;6EME EP1&gt\; ». Les crochets et chevrons
    // dont Pronote entoure les groupes n'ont rien à faire dans une case.
    const groupe = await lire(calendrier([
        'BEGIN:VEVENT', 'CATEGORIES:Cours',
        'DTSTART:20260925T070500Z', 'DTEND:20260925T080000Z',
        'SUMMARY;LANGUAGE=fr:MATHEMATIQUES - [6EME EP1] - <6EME EP1>',
        'LOCATION;LANGUAGE=fr:08',
        'DESCRIPTION;LANGUAGE=fr:Matière : MATHEMATIQUES\\nProfesseur : DUPONT\\nGr',
        ' oupe : [6EME EP1]\\nPartie de classe : &lt\\;6EME EP1&gt\\;\\nSalle : 08\\n',
        'COLOR:#FE0107', 'END:VEVENT'
    ].join('\r\n')));
    r.egal('un groupe perd ses crochets', groupe.cours[0].classe, '6EME EP1');

    // ==========================================================
    // 3. LES VACANCES NE SONT PAS DES COURS
    //
    // Elles sont des JOURNÉES ENTIÈRES — « DTSTART;VALUE=DATE:20261018 » — et
    // s'étalent sur deux semaines. Rangées parmi les cours, elles couvriraient
    // la grille de bandes grises.
    // ==========================================================
    const avecVacances = await lire(calendrier([
        cours({ debut: '20260922T060500Z', fin: '20260922T070500Z',
                titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        ['BEGIN:VEVENT', 'CATEGORIES:Jours fériés', 'DTSTART;VALUE=DATE:20261018',
         'DTEND;VALUE=DATE:20261102', 'SUMMARY;LANGUAGE=fr:Vacances', 'END:VEVENT'].join('\r\n'),
        ['BEGIN:VEVENT', 'CATEGORIES:Jours fériés', 'DTSTART;VALUE=DATE:20261111',
         'DTEND;VALUE=DATE:20261112', 'SUMMARY;LANGUAGE=fr:Férié', 'END:VEVENT'].join('\r\n')
    ].join('\r\n')));
    r.egal('les vacances et les fériés sortent de la grille',
        { cours: avecVacances.cours.length, vacances: avecVacances.vacances },
        { cours: 1, vacances: ['Vacances', 'Férié'] });

    // ==========================================================
    // 4. DEUX SEMAINES NE FONT PAS DEUX FOIS LE MÊME COURS
    //
    // Un export ne couvre qu'une semaine. Qui en importe plusieurs retrouverait
    // chaque cours autant de fois, empilés à la même heure.
    // ==========================================================
    const deuxSemaines = await lire(calendrier([
        cours({ debut: '20260922T060500Z', fin: '20260922T070500Z', uid: 'a',
                titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        cours({ debut: '20260929T060500Z', fin: '20260929T070500Z', uid: 'b',
                titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        cours({ debut: '20260929T081500Z', fin: '20260929T091000Z', uid: 'c',
                titre: 'MATHEMATIQUES - 4EME A', matiere: 'MATHEMATIQUES', classe: '4EME A' })
    ].join('\r\n')));
    r.egal('le même cours de deux semaines ne compte qu\'une fois',
        { lus: deuxSemaines.lus, gardes: deuxSemaines.uniques }, { lus: 3, gardes: 2 });

    // ==========================================================
    // 5. LES SONNERIES DE L'ÉTABLISSEMENT
    //
    // Les heures de début et de fin des cours SONT les sonneries. L'enseignant
    // les saisissait à la main en septembre ; elles se lisent dans le fichier.
    // Deux heures qui se touchent — un cours finit à 9 h 05, le suivant
    // commence à 9 h 05 — ne font qu'UNE sonnerie.
    // ==========================================================
    const sonne = await lire(calendrier([
        cours({ debut: '20260922T060500Z', fin: '20260922T070500Z', uid: 'a',
                titre: 'M - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        cours({ debut: '20260922T070500Z', fin: '20260922T080000Z', uid: 'b',
                titre: 'M - 4EME A', matiere: 'MATHEMATIQUES', classe: '4EME A' })
    ].join('\r\n')));
    r.egal('trois sonneries pour deux cours qui s\'enchaînent',
        sonne.sonneries, [8 * 60 + 5, 9 * 60 + 5, 10 * 60]);
    // ET LA JOURNÉE S'ARRONDIT À L'HEURE : une grille qui commence à 8 h 05 se
    // lit mal.
    r.egal('la journée est arrondie à l\'heure autour des cours',
        { debut: sonne.debut, fin: sonne.fin }, { debut: 8 * 60, fin: 10 * 60 });

    // ==========================================================
    // 6. LES INTITULÉS ET LES COULEURS
    //
    // Une case est petite : « MATHEMATIQUES - 6EME B » n'y tient pas, et la
    // matière est la même toute la journée. La classe suffit ; la matière ne
    // revient que lorsqu'elle CHANGE — une concertation, une évaluation.
    //
    // Et Pronote colore par MATIÈRE : onze entrées, trois couleurs, un mur
    // rouge où l'on ne distingue plus ses classes.
    // ==========================================================
    const melange = await lire(calendrier([
        cours({ debut: '20260921T060500Z', fin: '20260921T070500Z', uid: 'a',
                titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        cours({ debut: '20260921T070500Z', fin: '20260921T080000Z', uid: 'b',
                titre: 'MATHEMATIQUES - 4EME A', matiere: 'MATHEMATIQUES', classe: '4EME A' }),
        cours({ debut: '20260921T081500Z', fin: '20260921T091000Z', uid: 'c',
                titre: 'MATHEMATIQUES - 4EME C', matiere: 'MATHEMATIQUES', classe: '4EME C' }),
        cours({ debut: '20260922T104500Z', fin: '20260922T114000Z', uid: 'd',
                titre: 'CONCERTATION MATHS', matiere: 'CONCERTATION MATHS', classe: '',
                couleur: '#408DCC' })
    ].join('\r\n')));
    r.egal('la matière qu\'on enseigne disparaît des cases : la classe suffit',
        melange.entrees.map(e => e.libelle).slice(0, 3), ['6EME B', '4EME A', '4EME C']);
    r.verifie('mais une autre matière garde son nom',
        melange.entrees.some(e => /CONCERTATION/.test(e.libelle)),
        JSON.stringify(melange.entrees.map(e => e.libelle)));
    // CHAQUE ENTRÉE SA TEINTE : c'est ce qu'on ne peut pas obtenir de Pronote.
    r.egal('chaque classe reçoit une teinte différente',
        new Set(melange.entrees.map(e => e.couleur)).size, melange.entrees.length);
    r.verifie('et ce n\'est pas le rouge unique de la matière',
        melange.entrees.every(e => e.couleur.toUpperCase() !== '#FE0107'),
        JSON.stringify(melange.entrees.map(e => e.couleur)));

    // ==========================================================
    // 7. UN FICHIER QUI N'EST PAS UN EMPLOI DU TEMPS
    // ==========================================================
    r.egal('un fichier sans événement le dit',
        (await lire('ceci n\'est pas un calendrier')).erreur,
        'Ce fichier ne contient aucun événement');
    r.egal('un calendrier sans cours aussi',
        (await lire(calendrier(['BEGIN:VEVENT', 'CATEGORIES:Jours fériés',
            'DTSTART;VALUE=DATE:20261018', 'DTEND;VALUE=DATE:20261102',
            'SUMMARY;LANGUAGE=fr:Vacances', 'END:VEVENT'].join('\r\n')))).erreur,
        'Ce fichier ne contient aucun cours');

    // ==========================================================
    // 8. LE GESTE ENTIER, COMME L'ENSEIGNANT LE FAIT
    // ==========================================================
    const fichier = calendrier([
        cours({ debut: '20260921T060500Z', fin: '20260921T070500Z', uid: 'a',
                titre: 'MATHEMATIQUES - 6EME B', matiere: 'MATHEMATIQUES', classe: '6EME B' }),
        cours({ debut: '20260922T070500Z', fin: '20260922T080000Z', uid: 'b',
                titre: 'MATHEMATIQUES - 4EME A', matiere: 'MATHEMATIQUES', classe: '4EME A' }),
        cours({ debut: '20260926T060500Z', fin: '20260926T070500Z', uid: 'c',
                titre: 'MATHEMATIQUES - 4EME C', matiere: 'MATHEMATIQUES', classe: '4EME C' })
    ].join('\r\n'));

    await page.evaluate(() => { if (typeof ouvrirLAgenda === 'function') ouvrirLAgenda(); });
    await page.waitForTimeout(500);
    r.egal('le bouton d\'import est dans la barre de l\'agenda',
        await page.evaluate(() => {
            const b = document.getElementById('edt-importer');
            return b ? { vu: getComputedStyle(b).display !== 'none', dit: b.textContent.trim() }
                     : { vu: false, dit: '(absent)' };
        }), { vu: true, dit: '⬆ Importer' });

    // ON POSE UN EMPLOI DU TEMPS À LA MAIN D'ABORD : importer REMPLACE, et
    // c'est ce qu'il faut pouvoir refuser.
    await page.evaluate(() => {
        agenda.entrees = [{ id: 'edt-main', libelle: 'MA SAISIE', classeId: null,
                            classeNom: null, couleur: '#dfe4ff' }];
        agenda.creneaux = [{ id: 'cr-main', jour: 1, debut: 600, duree: 55,
                             semaine: 'toutes', entreeId: 'edt-main',
                             libelle: 'MA SAISIE', couleur: '#dfe4ff' }];
        ecrireLAgenda();
        if (typeof rendreLaGrilleDeLAgenda === 'function') rendreLaGrilleDeLAgenda();
    });

    const choisirLeFichier = async (contenu) => {
        await page.setInputFiles('#edt-fichier', {
            name: 'Calendrier.ics', mimeType: 'text/calendar', buffer: Buffer.from(contenu, 'utf8')
        });
        await page.waitForTimeout(600);
    };
    const repondre = async (oui) => {
        await page.evaluate((o) => {
            const m = document.getElementById('confirm-modal');
            if (!m) return;
            const boutons = [...m.querySelectorAll('button')];
            const b = o ? (document.getElementById('confirm-ok')
                           || boutons.find(x => !/annul/i.test(x.textContent)))
                        : (document.getElementById('confirm-cancel')
                           || boutons.find(x => /annul/i.test(x.textContent)));
            if (b) b.click();
        }, oui);
        await page.waitForTimeout(700);
    };

    await choisirLeFichier(fichier);
    const question = await page.evaluate(() => {
        const m = document.getElementById('confirm-modal');
        return m && getComputedStyle(m).display !== 'none'
            ? (m.textContent || '').replace(/\s+/g, ' ') : '';
    });
    r.verifie('on demande AVANT de remplacer, et l\'on dit ce qu\'on a lu',
        /3 heures de cours/.test(question) && /3 classes/.test(question)
        && /REMPLACERA/.test(question), question.slice(0, 200));
    // ET L'ON PRÉVIENT DE CE QU'UN EXPORT D'UNE SEMAINE NE PEUT PAS DIRE.
    r.verifie('et l\'on prévient qu\'une semaine ne dit pas ce qui revient',
        /une semaine/i.test(question) && /(évaluation|ponctuelle)/i.test(question),
        question.slice(0, 300));

    // REFUSER NE TOUCHE À RIEN.
    await repondre(false);
    r.egal('refuser laisse l\'emploi du temps intact',
        await page.evaluate(() => ({ entrees: agenda.entrees.map(e => e.libelle),
                                     creneaux: agenda.creneaux.length })),
        { entrees: ['MA SAISIE'], creneaux: 1 });

    // ACCEPTER REMPLACE, ET LA GRILLE SE REDESSINE.
    await choisirLeFichier(fichier);
    await repondre(true);
    const apres = await page.evaluate(() => ({
        entrees: agenda.entrees.map(e => e.libelle).sort(),
        creneaux: agenda.creneaux.length,
        jours: [...new Set(agenda.creneaux.map(c => c.jour))].sort(),
        semaine: [...new Set(agenda.creneaux.map(c => c.semaine))],
        sonneries: (agenda.sonneries || []).length,
        heuresDeSonnerie: (agenda.sonneries || []).slice(),
        samedi: agenda.samedi,
        cases: document.querySelectorAll('#edt-grille .edt-creneau').length
    }));
    r.egal('accepter remplace la saisie par l\'emploi du temps importé',
        { entrees: apres.entrees, creneaux: apres.creneaux },
        { entrees: ['4EME A', '4EME C', '6EME B'], creneaux: 3 });
    r.egal('les cours tombent aux bons jours', apres.jours, [1, 2, 6]);
    // LE SAMEDI NE PARAÎT QUE S'IL Y A COURS : une colonne vide rétrécit
    // toutes les autres.
    r.egal('un cours le samedi allume la colonne du samedi', apres.samedi, true);
    // UN EXPORT NE DIT PAS SI LA SEMAINE EST A OU B : il ne montre qu'une
    // semaine, sans dire laquelle.
    r.egal('tout est posé sur « toutes les semaines »', apres.semaine, ['toutes']);
    // LES SONNERIES SONT CELLES DU FICHIER, NI PLUS NI MOINS : trois cours
    // qui commencent à 8 h 05 et 9 h 05 et finissent à 9 h 05 et 10 h donnent
    // TROIS sonneries, pas quatre — celles qui se touchent n'en font qu'une.
    r.egal('les sonneries sont venues avec, fondues quand elles se touchent',
        apres.heuresDeSonnerie, [8 * 60 + 5, 9 * 60 + 5, 10 * 60]);
    r.egal('et la grille montre vraiment les cases', apres.cases, 3);

    // ==========================================================
    // 9. FUSIONNER DEUX CLASSES : ON LES APPELLE DU MÊME NOM
    //
    // « Tu as semaine A, semaine B. Parfois ce sont des groupes classes, donc
    // un peu la même classe. » — « Il faudrait dans ce cas pouvoir fusionner
    // facilement, il faut de l'ultra simple. »
    //
    // C'est visible dans n'importe quel export : « 6EME EP1 » et « 6EME EP2 »
    // sont les deux moitiés de « 6EME E ». Le geste le plus simple n'est pas
    // un bouton de plus — c'est de les appeler du même nom.
    // ==========================================================
    await page.evaluate(() => {
        agenda.entrees = [
            { id: 'e1', libelle: '6EME E', classeId: null, classeNom: null, couleur: '#dfe4ff' },
            { id: 'e2', libelle: '6EME EP1', classeId: null, classeNom: null, couleur: '#d9f2e6' },
            { id: 'e3', libelle: '4EME A', classeId: null, classeNom: null, couleur: '#ffe6d5' }
        ];
        agenda.creneaux = [
            { id: 'c1', jour: 1, debut: 480, duree: 55, semaine: 'toutes', entreeId: 'e1', libelle: '6EME E', couleur: '#dfe4ff' },
            { id: 'c2', jour: 2, debut: 480, duree: 55, semaine: 'toutes', entreeId: 'e2', libelle: '6EME EP1', couleur: '#d9f2e6' },
            { id: 'c3', jour: 3, debut: 480, duree: 55, semaine: 'toutes', entreeId: 'e2', libelle: '6EME EP1', couleur: '#d9f2e6' },
            { id: 'c4', jour: 4, debut: 480, duree: 55, semaine: 'toutes', entreeId: 'e3', libelle: '4EME A', couleur: '#ffe6d5' }
        ];
        ecrireLAgenda(); rendreLAgenda();
    });
    await page.waitForTimeout(300);

    // LE GESTE NE S'INVENTE PAS : la fenêtre doit le dire.
    await page.evaluate(() => reglerUneEntree('e2'));
    await page.waitForTimeout(400);
    r.verifie('la fenêtre de réglage annonce que le même nom fusionne',
        await page.evaluate(() => {
            const l = document.querySelector('#custom-prompt-inputs label');
            return !!l && /fusionn/i.test(l.textContent);
        }),
        await page.evaluate(() => {
            const l = document.querySelector('#custom-prompt-inputs label');
            return l ? l.textContent.trim() : '(pas de label)';
        }));

    const renommerEn = async (nom) => {
        await page.evaluate((n) => {
            const champ = document.querySelector('#custom-prompt-inputs input[type=text]');
            champ.value = n;
            champ.dispatchEvent(new Event('input', { bubbles: true }));
            const b = document.getElementById('custom-prompt-ok')
                || [...document.querySelectorAll('#custom-prompt-modal button')]
                    .find(x => !/annul/i.test(x.textContent));
            if (b) b.click();
        }, nom);
        await page.waitForTimeout(500);
    };
    await renommerEn('6EME E');
    const demande = await page.evaluate(() => {
        const m = document.getElementById('confirm-modal');
        return m && getComputedStyle(m).display !== 'none'
            ? (m.textContent || '').replace(/\s+/g, ' ') : '';
    });
    r.verifie('renommer avec un nom déjà pris propose la fusion, et dit ce qu\'elle emporte',
        /Fusionner avec « 6EME E »/.test(demande) && /2 heures/.test(demande)
        && /disparaîtra/.test(demande), demande.slice(0, 220));

    // REFUSER NE FUSIONNE PAS, et ne renomme pas non plus : on a dit non.
    await repondre(false);
    r.egal('refuser laisse les deux classes en place',
        await page.evaluate(() => agenda.entrees.map(e => e.libelle)),
        ['6EME E', '6EME EP1', '4EME A']);

    // ACCEPTER : les heures passent, la palette perd une ligne, et AUCUN
    // créneau ne se perd en route.
    await page.evaluate(() => reglerUneEntree('e2'));
    await page.waitForTimeout(400);
    await renommerEn('6EME E');
    await repondre(true);
    const fusionne = await page.evaluate(() => ({
        entrees: agenda.entrees.map(e => e.libelle),
        total: agenda.creneaux.length,
        pour6emeE: agenda.creneaux.filter(c => c.entreeId === 'e1').length,
        libelles: [...new Set(agenda.creneaux.map(c => c.libelle))].sort(),
        couleurs: [...new Set(agenda.creneaux.filter(c => c.entreeId === 'e1').map(c => c.couleur))]
    }));
    r.egal('les deux n\'en font plus qu\'une',
        { entrees: fusionne.entrees, total: fusionne.total },
        { entrees: ['6EME E', '4EME A'], total: 4 });
    r.egal('et toutes ses heures lui sont passées', fusionne.pour6emeE, 3);
    // LES CRÉNEAUX PORTENT LE NOM ET LA COULEUR DE CELLE QUI RESTE : sans
    // cela, la grille garderait trois cases vertes appelées « 6EME EP1 »
    // rattachées à une classe bleue.
    r.egal('ils prennent son nom', fusionne.libelles, ['4EME A', '6EME E']);
    r.egal('et sa couleur', fusionne.couleurs, ['#dfe4ff']);

    // LA CASSE ET LES ESPACES NE FONT PAS DEUX CLASSES : « 6eme  e » est
    // « 6EME E ». C'est ce qu'on tape à la main un soir de septembre.
    await page.evaluate(() => {
        agenda.entrees.push({ id: 'e4', libelle: 'TEMPORAIRE', classeId: null,
                              classeNom: null, couleur: '#fdf0c8' });
        agenda.creneaux.push({ id: 'c5', jour: 5, debut: 480, duree: 55, semaine: 'toutes',
                               entreeId: 'e4', libelle: 'TEMPORAIRE', couleur: '#fdf0c8' });
        ecrireLAgenda(); rendreLAgenda();
    });
    await page.evaluate(() => reglerUneEntree('e4'));
    await page.waitForTimeout(400);
    await renommerEn('  6eme   e  ');
    await repondre(true);
    r.egal('la casse et les espaces ne font pas deux classes',
        await page.evaluate(() => agenda.entrees.map(e => e.libelle)), ['6EME E', '4EME A']);

    await page.evaluate(() => { if (typeof fermerLAgenda === 'function') fermerLAgenda(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
