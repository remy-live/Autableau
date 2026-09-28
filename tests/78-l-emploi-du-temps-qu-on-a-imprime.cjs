// L'EMPLOI DU TEMPS QU'ON A IMPRIMÉ
//
// « As-tu réglé l'import d'emploi du temps dans Au tableau ? » — la question
// est venue deux fois, avec l'emploi du temps de l'établissement en pièce
// jointe. Un PDF, pas un .ics : c'est ce que tout le monde a sous la main,
// parce que c'est ce qu'on imprime et qu'on affiche au mur. L'import ne lisait
// jusqu'ici que l'export iCal de Pronote, qu'il faut aller chercher.
//
// UN TEL PDF N'EST PAS UNE PHOTO DE GRILLE : c'est une grille DESSINÉE, et
// tout y est encore lisible — les en-têtes de colonne, les heures dans la
// marge, un rectangle par cours, la matière, la classe, la salle, et les
// pastilles « A » et « B » des cours qui alternent.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — la géométrie se LIT, elle ne se suppose pas : les colonnes viennent des
//     en-têtes, les lignes des rectangles, les heures de la marge. Rien n'est
//     écrit en dur, sans quoi cela ne marcherait que sur le fichier qu'on
//     avait sous les yeux ;
//   — une récréation ne se mange pas : un cours de 10h15 à 11h10 dure
//     cinquante-cinq minutes, pas soixante-dix ;
//   — une classe dédoublée fait deux demi-cases côte à côte, et ce sont bien
//     deux cours différents, l'un en semaine A, l'autre en B ;
//   — une case de deux lignes dure deux heures ;
//   — une case sans classe — une concertation — n'invente pas une classe qui
//     s'appellerait « 12 » ;
//   — l'alternance vient du fichier, et un cours hebdomadaire est alors posé
//     DANS LES DEUX SEMAINES, sans quoi il ne paraîtrait ni en A ni en B ;
//   — le même bouton prend le .ics et le PDF ;
//   — un PDF qui n'est pas un emploi du temps le dit, au lieu de rendre une
//     grille vide.
//
// LE FICHIER EST FABRIQUÉ ICI, et c'est délibéré : un vrai emploi du temps
// porte le nom d'un enseignant, celui de son collège et ses horaires. Rien de
// tout cela n'a sa place dans un dépôt. Il est bâti sur les MESURES relevées
// sur un vrai fichier, et sur elles seules.
const { creerRapport, ouvrirApp, edtPdf, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('L\'emploi du temps qu\'on a imprimé');
    const { context, page, erreurs } = await ouvrirApp(browser, { viewport: { width: 1280, height: 800 } });
    await page.waitForFunction(() => typeof edtDepuisPdf === 'function'
        && typeof assemblerLEdt === 'function', { timeout: 20000 });

    const octets = Array.from(edtPdf());

    // ==================================================================
    // 1. LA LECTURE
    // ==================================================================
    const lu = await page.evaluate(async ({ octets }) => {
        const r = await edtDepuisPdf(new Uint8Array(octets));
        if (r.erreur) return { erreur: r.erreur };
        return {
            alterne: r.alterne,
            debut: r.debut, fin: r.fin,
            entrees: r.entrees.map(e => e.libelle).sort(),
            sonneries: r.sonneries.slice(),
            cours: r.cours.map(c => [c.jour, c.debut, c.duree, c.semaine,
                                     c.matiere, c.classe, c.salle])
                .sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[5] < b[5] ? -1 : 1))
        };
    }, { octets });
    r.verifie('le PDF se lit', !lu.erreur, lu.erreur || '');

    // LES SEPT COURS, TELS QU'ILS SONT IMPRIMÉS. Jour, début en minutes,
    // durée, semaine, matière, classe, salle.
    r.egal('les sept cours se lisent exactement', lu.cours, [
        [1, 480, 60, 'toutes', 'MATHEMATIQUES', '6EME A', '12'],
        [1, 540, 60, 'A', 'MATHEMATIQUES', '6EME AG1', '12'],
        [1, 540, 60, 'B', 'MATHEMATIQUES', '6EME AG2', '12'],
        [2, 615, 55, 'toutes', 'MATHEMATIQUES', '5EME C', '14'],
        [3, 480, 60, 'toutes', 'MATHEMATIQUES', '5EME C', '14'],
        [4, 670, 55, 'toutes', 'CONCERTATION', '', '12'],
        [5, 810, 110, 'toutes', 'MATHEMATIQUES', '4EME B', '9']
    ]);

    // LA RÉCRÉATION NE SE MANGE PAS. Le trait de 10 h porte deux heures : la
    // fin du cours d'avant (10h00, écrite au-dessus) et le début du suivant
    // (10h15, écrite en dessous). Sans cette distinction, le cours de mardi
    // durerait soixante-dix minutes au lieu de cinquante-cinq et avalerait la
    // récréation. C'est le contrôle le plus fin du chapitre.
    const mardi = (lu.cours || []).find(c => c[0] === 2);
    r.egal('un cours d\'après la récréation commence APRÈS elle',
        mardi && [mardi[1], mardi[2]], [615, 55],
        'attendu 10h15 et 55 min');
    const lundi = (lu.cours || []).find(c => c[0] === 1);
    r.egal('et un cours sans récréation en dessous dure l\'heure pleine',
        lundi && lundi[2], 60);

    // UNE CASE DE DEUX LIGNES DURE DEUX HEURES : la hauteur n'est pas
    // supposée, elle est lue.
    const vendredi = (lu.cours || []).find(c => c[0] === 5);
    r.egal('une case haute de deux lignes dure deux heures',
        vendredi && [vendredi[1], vendredi[2]], [810, 110]);

    // UNE CONCERTATION N'A PAS DE CLASSE, et sa salle n'en devient pas une.
    const jeudi = (lu.cours || []).find(c => c[0] === 4);
    r.egal('une case sans classe n\'invente pas de classe',
        jeudi && [jeudi[5], jeudi[6]], ['', '12']);
    r.verifie('et la palette la nomme par sa seule matière',
        (lu.entrees || []).indexOf('CONCERTATION') >= 0
        && !(lu.entrees || []).some(e => /12/.test(e)), JSON.stringify(lu.entrees));

    // LES DEUX DEMI-CASES SONT DEUX COURS, EN A ET EN B.
    r.egal('la classe dédoublée fait deux cours, l\'un en A l\'autre en B',
        (lu.cours || []).filter(c => c[0] === 1 && c[1] === 540).map(c => [c[3], c[5]]),
        [['A', '6EME AG1'], ['B', '6EME AG2']]);
    r.egal('et le fichier dit donc que la grille alterne', lu.alterne, true);

    // CE QUE LE FICHIER DIT DE L'ÉTABLISSEMENT : ses sonneries, et
    // l'amplitude de sa journée.
    r.egal('la journée va de 8 h à 16 h', [lu.debut, lu.fin], [480, 960]);
    r.egal('les sonneries se relèvent', lu.sonneries, [480, 540, 600, 615, 670, 725, 810, 920]);

    // ==================================================================
    // 2. LA GÉOMÉTRIE SE LIT, ELLE NE SE SUPPOSE PAS
    //
    // Sans ce contrôle, on pourrait lire ce fichier-ci en écrivant ses
    // mesures en dur, et rien ne marcherait chez quelqu'un d'autre.
    // ==================================================================
    const geometrie = await page.evaluate(() => ({
        // Deux en-têtes espacés de 200 pt donnent des colonnes de 200 pt.
        colonnes: colonnesDesJours([
            { t: 'lundi', x: 90, l: 20, y: 700 },
            { t: 'mardi', x: 290, l: 20, y: 700 },
            { t: 'mercredi', x: 490, l: 20, y: 700 }
        ]).map(c => [c.jour, Math.round(c.x0), Math.round(c.largeur)]),
        // Un seul jour ne dit pas la largeur d'une colonne : on ne devine pas.
        unSeulJour: colonnesDesJours([{ t: 'lundi', x: 90, l: 20, y: 700 }]),
        // Une heure écrite DANS la grille n'est pas une graduation.
        marge: heuresDeLaMarge([
            { t: '8h00', x: 5, l: 20, y: 700 },
            { t: '9h30', x: 300, l: 20, y: 600 }
        ], 30).map(m => m.minutes)
    }));
    r.egal('la largeur d\'une colonne vient de l\'écart des en-têtes',
        geometrie.colonnes, [[1, 0, 200], [2, 200, 200], [3, 400, 200]]);
    r.egal('un seul jour ne suffit pas à deviner une grille', geometrie.unSeulJour, null);
    r.egal('une heure écrite dans une case n\'est pas une graduation',
        geometrie.marge, [480]);

    // ==================================================================
    // 3. LE GESTE : LE MÊME BOUTON PREND LES DEUX FICHIERS
    // ==================================================================
    await page.evaluate(() => { if (typeof ouvrirLAgenda === 'function') ouvrirLAgenda(); });
    await page.waitForTimeout(500);
    const accepte = await page.evaluate(() => {
        const f = document.getElementById('edt-fichier');
        return f ? (f.getAttribute('accept') || '') : '(absent)';
    });
    r.verifie('le champ de fichier accepte le .ics ET le .pdf',
        /\.ics/.test(accepte) && /\.pdf/.test(accepte), accepte);

    // On pose un emploi du temps à la main : importer REMPLACE, et c'est ce
    // qu'il faut pouvoir refuser.
    await page.evaluate(() => {
        agenda.entrees = [{ id: 'edt-main', libelle: 'MA SAISIE', classeId: null,
                            classeNom: null, couleur: '#dfe4ff' }];
        agenda.creneaux = [{ id: 'cr-main', jour: 1, debut: 600, duree: 55,
                             semaine: 'toutes', entreeId: 'edt-main',
                             libelle: 'MA SAISIE', couleur: '#dfe4ff' }];
        agenda.alterne = false;
        ecrireLAgenda();
        if (typeof rendreLaGrilleDeLAgenda === 'function') rendreLaGrilleDeLAgenda();
    });

    const choisirLePdf = async (buffer, nom) => {
        await page.setInputFiles('#edt-fichier', {
            name: nom || 'EmploiDuTemps.pdf', mimeType: 'application/pdf', buffer
        });
        await page.waitForTimeout(900);
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

    await choisirLePdf(Buffer.from(edtPdf()));
    const question = await page.evaluate(() => {
        const m = document.getElementById('confirm-modal');
        return m && getComputedStyle(m).display !== 'none'
            ? (m.textContent || '').replace(/\s+/g, ' ') : '';
    });
    r.verifie('on demande AVANT de remplacer, et l\'on dit ce qu\'on a lu',
        /7 heures de cours/.test(question) && /REMPLACERA/.test(question),
        question.slice(0, 220));
    r.verifie('et l\'on annonce que les semaines A et B ont été distinguées',
        /semaines A et B/.test(question), question.slice(0, 260));
    // UN EMPLOI DU TEMPS IMPRIMÉ EST LA SEMAINE TYPE ELLE-MÊME : la réserve
    // du .ics — « une évaluation ponctuelle ressemble à un cours » — ne vaut
    // que pour un export d'UNE semaine, et n'a pas à paraître ici.
    r.verifie('et l\'on ne sert pas la réserve qui ne vaut que pour un .ics',
        !/ponctuelle/i.test(question), question.slice(0, 300));

    await repondre(false);
    r.egal('refuser laisse l\'emploi du temps intact',
        await page.evaluate(() => ({ entrees: agenda.entrees.map(e => e.libelle),
                                     creneaux: agenda.creneaux.length })),
        { entrees: ['MA SAISIE'], creneaux: 1 });

    await choisirLePdf(Buffer.from(edtPdf()));
    await repondre(true);
    const pose = await page.evaluate(() => ({
        alterne: !!agenda.alterne,
        vue: edtSemaineVue,
        entrees: agenda.entrees.map(e => e.libelle).sort(),
        semaines: [...new Set(agenda.creneaux.map(c => c.semaine))].sort(),
        creneaux: agenda.creneaux.length,
        // le cours du lundi 8 h revient toutes les semaines : il doit être
        // posé DANS LES DEUX, sinon il ne paraîtrait nulle part
        lundiHuitHeures: agenda.creneaux.filter(c => c.jour === 1 && c.debut === 480)
            .map(c => c.semaine).sort(),
        dedoublees: agenda.creneaux.filter(c => c.jour === 1 && c.debut === 540)
            .map(c => c.semaine + ':' + c.libelle).sort(),
        cases: document.querySelectorAll('#edt-grille .edt-creneau').length
    }));
    r.egal('la grille alterne, comme le fichier le dit', pose.alterne, true);
    r.egal('et c\'est la semaine A qu\'on regarde en sortant', pose.vue, 'A');
    r.egal('un cours de toutes les semaines est posé dans les deux',
        pose.lundiHuitHeures, ['A', 'B']);
    r.egal('une classe dédoublée reste dans sa semaine',
        pose.dedoublees, ['A:6EME AG1', 'B:6EME AG2']);
    r.egal('les créneaux ne portent plus « toutes » quand on alterne',
        pose.semaines, ['A', 'B']);
    r.verifie('et la grille montre bien des cases',
        pose.cases > 0, JSON.stringify(pose));

    // ==================================================================
    // 4. UN PDF QUI N'EST PAS UN EMPLOI DU TEMPS LE DIT
    //
    // Sans cela, on rendait une grille vide sans un mot, et l'emploi du temps
    // saisi à la main était remplacé par rien.
    // ==================================================================
    const refus = await page.evaluate(async ({ octets }) => {
        const r = await edtDepuisPdf(new Uint8Array(octets));
        return { erreur: r.erreur || '', cours: r.cours ? r.cours.length : 0 };
    }, { octets: Array.from(petitPdf()) });
    r.verifie('un PDF ordinaire ne donne pas un emploi du temps vide',
        !!refus.erreur && refus.cours === 0, JSON.stringify(refus));
    r.verifie('et l\'on dit pourquoi : les jours de la semaine manquent',
        /jours de la semaine/i.test(refus.erreur), refus.erreur);

    await page.evaluate(() => { if (typeof fermerLAgenda === 'function') fermerLAgenda(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
