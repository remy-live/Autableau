// LE CAHIER DE TEXTE : TROIS CHAMPS, MAIS PAS AU MÊME ENDROIT.
//
// « Tu vois, moi, pour mon cahier de texte, j'ai objectifs, séance et devoirs,
// et après je le copie dans Pronote. » Puis, sur le partage entre classes :
// « Ok, et on peut copier ce qu'on a déjà copié pour une classe. » Et sur la
// copie vers Pronote : « Deux copies séparées. »
//
// LES OBJECTIFS ET LE DÉROULÉ APPARTIENNENT À LA PRÉPARATION. Ils sont les
// mêmes pour les quatre cinquièmes, et les écrire quatre fois est justement le
// travail que ce logiciel doit épargner. LE TRAVAIL À FAIRE APPARTIENT À
// CHAQUE CLASSE : la 5e A n'a pas fini la même chose que la 5e B, et la date
// n'est pas la même. Le lien entre les reprises existait déjà — « Réinvestir
// la séance » écrit « seanceOrigine » — et c'est lui qu'on suit.
//
// ET LA DATE VIENT DE L'EMPLOI DU TEMPS. « Pour le jeudi 8 » est un calcul
// qu'on refait vingt fois par semaine et qu'on rate une fois sur vingt.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le cahier de texte');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // SANS SÉANCE ENREGISTRÉE, IL N'A RIEN À QUOI SE RATTACHER
    // ------------------------------------------------------------------
    const sansSeance = await page.evaluate(async () => {
        localStorage.removeItem('board_cahier');
        selectedBoardId = null;
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 120));
        return {
            ouverte: getComputedStyle(document.getElementById('cdt-modal')).display !== 'none',
            mot: document.getElementById('cdt-sans-seance').innerText,
            motVu: getComputedStyle(document.getElementById('cdt-sans-seance')).display !== 'none',
            champsVus: getComputedStyle(document.getElementById('cdt-corps')).display !== 'none'
        };
    });
    r.verifie('le cahier de texte s\'ouvre', sansSeance.ouverte, JSON.stringify(sansSeance));
    r.verifie('sans séance enregistrée, il dit pourquoi il ne peut rien',
        /enregistr/i.test(sansSeance.mot) && sansSeance.motVu, sansSeance.mot);
    r.egal('et ne montre pas de champs où écrire dans le vide', sansSeance.champsVus, false);

    // ------------------------------------------------------------------
    // UNE SÉANCE, PUIS SA REPRISE AVEC UNE AUTRE CLASSE
    // ------------------------------------------------------------------
    const seule = await page.evaluate(async () => {
        savedTableaux.length = 0;
        savedTableaux.push({ id: 'tb_a', name: 'Thalès — 5e A', type: 'file',
                             classeId: 'cl_a', classeNom: '5e A', timestamp: 100 });
        selectedBoardId = 'tb_a';
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 120));
        return {
            nom: document.getElementById('cdt-seance').innerText,
            classe: document.getElementById('cdt-classe').innerText,
            partage: document.getElementById('cdt-partage').innerText,
            reprise: getComputedStyle(document.getElementById('cdt-reprise')).display
        };
    });
    r.egal('il porte le nom de la séance', seule.nom, 'Thalès — 5e A');
    r.egal('et la classe avec qui elle s\'est faite', seule.classe, '5e A');
    // L'étiquette est mise en capitales par la feuille de style : on lit ce
    // qui est écrit, pas la casse que le navigateur lui donne.
    r.verifie('seule, elle ne partage rien avec personne',
        /de cette séance/i.test(seule.partage) && !/partag/i.test(seule.partage), seule.partage);
    r.egal('et rien à reprendre d\'ailleurs', seule.reprise, 'none');

    const ecrit = await page.evaluate(async () => {
        const mettre = (id, v) => {
            const c = document.getElementById(id);
            c.value = v;
            c.dispatchEvent(new Event('input', { bubbles: true }));
        };
        mettre('cdt-objectifs', 'Reconnaître une configuration de Thalès');
        mettre('cdt-seance-texte', 'Rappel, puis exercices 12 et 14 page 87.');
        mettre('cdt-devoirs', 'Finir l\'exercice 14.');
        await new Promise(ok => setTimeout(ok, 600));
        return JSON.parse(localStorage.getItem('board_cahier') || '{}');
    });
    r.egal('les objectifs vont à la préparation', (ecrit.familles || {}).tb_a && ecrit.familles.tb_a.objectifs,
        'Reconnaître une configuration de Thalès');
    r.egal('le déroulé aussi', ecrit.familles.tb_a.seance, 'Rappel, puis exercices 12 et 14 page 87.');
    r.egal('le travail à faire reste à la séance', (ecrit.seances || {}).tb_a && ecrit.seances.tb_a.devoirs,
        'Finir l\'exercice 14.');

    // LA REPRISE AVEC LA 5e B : même préparation, autre classe.
    const reprise = await page.evaluate(async () => {
        savedTableaux.push({ id: 'tb_b', name: 'Thalès — 5e B', type: 'file',
                             classeId: 'cl_b', classeNom: '5e B', timestamp: 200,
                             seanceOrigine: 'tb_a' });
        // Une troisième classe, qui n'a encore rien écrit : elle ne doit pas
        // être proposée. Reprendre le vide n'apporte rien.
        savedTableaux.push({ id: 'tb_c', name: 'Thalès — 5e C', type: 'file',
                             classeId: 'cl_c', classeNom: '5e C', timestamp: 300,
                             seanceOrigine: 'tb_a' });
        selectedBoardId = 'tb_b';
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 150));
        return {
            partage: document.getElementById('cdt-partage').innerText,
            objectifs: document.getElementById('cdt-objectifs').value,
            deroule: document.getElementById('cdt-seance-texte').value,
            devoirs: document.getElementById('cdt-devoirs').value,
            reprise: getComputedStyle(document.getElementById('cdt-reprise')).display,
            proposees: [...document.getElementById('cdt-soeurs').options].map(o => o.textContent)
        };
    });
    r.verifie('la reprise annonce ce qu\'elle partage',
        /partagés avec les 3 séances/i.test(reprise.partage), reprise.partage);
    r.egal('elle retrouve les objectifs écrits pour l\'autre classe',
        reprise.objectifs, 'Reconnaître une configuration de Thalès');
    r.egal('et le déroulé', reprise.deroule, 'Rappel, puis exercices 12 et 14 page 87.');
    r.egal('mais son travail à faire est vierge', reprise.devoirs, '');
    r.verifie('et l\'on peut reprendre celui de l\'autre classe',
        reprise.reprise !== 'none', reprise.reprise);
    r.egal('seules celles qui ont écrit quelque chose sont proposées',
        reprise.proposees, ['5e A']);

    const reprise2 = await page.evaluate(async () => {
        document.getElementById('cdt-reprendre').click();
        await new Promise(ok => setTimeout(ok, 150));
        const apres = document.getElementById('cdt-devoirs').value;

        // ON AJOUTE, ON NE REMPLACE PAS : ce qui était écrit ne disparaît pas
        // sous un clic, et l'on efface plus vite qu'on ne réécrit.
        const champ = document.getElementById('cdt-devoirs');
        champ.value = 'Apprendre la leçon.';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 500));
        document.getElementById('cdt-reprendre').click();
        await new Promise(ok => setTimeout(ok, 150));
        const cumule = champ.value;

        // Et l'on ne se propose pas de se reprendre soi-même : rouverte,
        // cette séance-ci a maintenant des devoirs, mais pas dans sa liste.
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 150));
        const saPropreListe = [...document.getElementById('cdt-soeurs').options].map(o => o.textContent);

        const memoire = JSON.parse(localStorage.getItem('board_cahier') || '{}');
        return { apres, cumule, saPropreListe, chezLAutre: memoire.seances.tb_a.devoirs };
    });
    r.egal('« Reprendre » apporte le travail de l\'autre classe',
        reprise2.apres, 'Finir l\'exercice 14.');
    r.egal('et il s\'ajoute à ce qui était écrit, sans l\'écraser',
        reprise2.cumule, 'Apprendre la leçon.\nFinir l\'exercice 14.');
    r.egal('la classe d\'origine, elle, n\'a pas bougé',
        reprise2.chezLAutre, 'Finir l\'exercice 14.');
    r.egal('et une séance ne se propose pas de se reprendre elle-même',
        reprise2.saPropreListe, ['5e A']);

    // ------------------------------------------------------------------
    // LES DEUX COPIES POUR PRONOTE
    // ------------------------------------------------------------------
    const copies = await page.evaluate(async () => {
        const vrai = window.mettreDansLePressePapiers;
        let copie = null;
        window.mettreDansLePressePapiers = async (t) => { copie = t; return true; };

        document.getElementById('cdt-copier-contenu').click();
        await new Promise(ok => setTimeout(ok, 150));
        const contenu = copie;

        copie = null;
        document.getElementById('cdt-copier-devoirs').click();
        await new Promise(ok => setTimeout(ok, 150));
        const devoirs = copie;

        // Un champ vide ne part pas dans le presse-papiers : on le dit.
        const champ = document.getElementById('cdt-devoirs');
        champ.value = '   ';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 500));
        copie = null;
        document.getElementById('cdt-copier-devoirs').click();
        await new Promise(ok => setTimeout(ok, 150));
        const vide = { copie, dit: ([...document.querySelectorAll('#toast-container .toast')].pop() || {}).innerText || '' };

        window.mettreDansLePressePapiers = vrai;
        return { contenu, devoirs, vide };
    });
    r.egal('le contenu de séance réunit les objectifs et le déroulé', copies.contenu,
        'Objectifs : Reconnaître une configuration de Thalès\n\nRappel, puis exercices 12 et 14 page 87.');
    r.verifie('le travail à faire part seul, sans les objectifs',
        /Finir l'exercice 14/.test(copies.devoirs) && !/Objectifs/.test(copies.devoirs), copies.devoirs);
    r.egal('un champ vide ne part pas dans le presse-papiers', copies.vide.copie, null);
    r.verifie('et on le dit', /vide/i.test(copies.vide.dit), copies.vide.dit);

    // ------------------------------------------------------------------
    // « POUR LE … » VIENT DE L'EMPLOI DU TEMPS
    // ------------------------------------------------------------------
    // C'est le premier dividende de l'agenda : la date du prochain cours de
    // cette classe, alternance comprise.
    const echeance = await page.evaluate(() => {
        agenda.alterne = false;
        agenda.ancre = null;
        agenda.entrees = [{ id: 'e_a', libelle: '5e A', classeId: 'cl_a', couleur: '#eee' }];
        agenda.creneaux = [
            { id: 'k0', jour: 2, debut: 16 * 60, duree: 55, semaine: 'toutes', entreeId: 'e_a', libelle: '5e A' },
            { id: 'k1', jour: 2, debut: 10 * 60, duree: 55, semaine: 'toutes', entreeId: 'e_a', libelle: '5e A' },
            { id: 'k2', jour: 4, debut: 14 * 60, duree: 55, semaine: 'toutes', entreeId: 'e_a', libelle: '5e A' }
        ];
        const entree = agenda.entrees[0];
        const quand = (d) => {
            const p = prochainCoursDe(entree, d);
            return p ? jourIso(p.jour) + ' ' + p.creneau.debut : null;
        };
        return {
            // Mardi 3 mars 2026, 8 h : le cours de 10 h est encore devant.
            memeJour: quand(new Date(2026, 2, 3, 8, 0)),
            // Mardi 11 h : celui de 10 h est passé, reste celui de 16 h — le
            // PREMIER à venir, et non le dernier de la journée.
            passe: quand(new Date(2026, 2, 3, 11, 0)),
            // Vendredi : le prochain est le mardi d'après.
            semaineSuivante: quand(new Date(2026, 2, 6, 9, 0)),
            // Mardi 17 h : la journée est finie, on passe à jeudi.
            soir: quand(new Date(2026, 2, 3, 17, 0)),
            // Une classe qui n'est pas dans l'emploi du temps n'invente rien.
            inconnue: prochainCoursDe({ id: 'e_zz' }, new Date(2026, 2, 3, 8, 0)),
            sansEntree: prochainCoursDe(null, new Date(2026, 2, 3, 8, 0))
        };
    });
    r.egal('le prochain cours du jour compte encore', echeance.memeJour, '2026-03-03 600');
    r.egal('une fois passé, on vise le premier d\'après, pas le dernier du jour',
        echeance.passe, '2026-03-03 960');
    r.egal('le soir, on passe au jour suivant', echeance.soir, '2026-03-05 840');
    r.egal('en fin de semaine, on vise la semaine d\'après', echeance.semaineSuivante, '2026-03-10 600');
    r.egal('une classe absente de l\'emploi du temps n\'a pas de date', echeance.inconnue, null);
    r.egal('ni une séance sans classe', echeance.sansEntree, null);

    // L'ALTERNANCE COMPTE AUSSI. Un cours de semaine A, vu en semaine A, n'est
    // pas pour la semaine prochaine : il est pour dans quinze jours.
    const enAlternance = await page.evaluate(() => {
        agenda.alterne = true;
        agenda.ancre = { lundi: '2026-03-02', lettre: 'A' };
        agenda.creneaux = [{ id: 'k3', jour: 2, debut: 10 * 60, duree: 55,
                             semaine: 'A', entreeId: 'e_a', libelle: '5e A' }];
        const p = prochainCoursDe(agenda.entrees[0], new Date(2026, 2, 3, 11, 0));
        return p ? jourIso(p.jour) : null;
    });
    r.egal('un cours de semaine A saute la semaine B', enAlternance, '2026-03-17');

    const affichee = await page.evaluate(async () => {
        agenda.alterne = false;
        agenda.creneaux = [{ id: 'k4', jour: 2, debut: 10 * 60, duree: 55,
                             semaine: 'toutes', entreeId: 'e_a', libelle: '5e A' }];
        ecrireLAgenda();
        selectedBoardId = 'tb_a';
        // On repart d'un cahier sans échéance pour voir celle que l'emploi du
        // temps propose de lui-même.
        delete cahier.seances.tb_a.pour;
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 150));
        const prochain = prochainCoursDe(agenda.entrees[0]);
        return {
            annonce: document.getElementById('cdt-quand').innerText,
            champ: document.getElementById('cdt-pour').value,
            attendu: prochain ? jourIso(prochain.jour) : null
        };
    });
    r.verifie('le cahier annonce le prochain cours de cette classe',
        /Prochain cours : \w+ \d+ \w+, \d+ h/.test(affichee.annonce), affichee.annonce);
    r.egal('et pose la date d\'échéance dessus', affichee.champ, affichee.attendu);

    const sansCreneau = await page.evaluate(async () => {
        agenda.creneaux = [];
        ecrireLAgenda();
        selectedBoardId = 'tb_b';
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 150));
        return document.getElementById('cdt-quand').innerText;
    });
    r.verifie('sans emploi du temps, il le dit plutôt que d\'inventer une date',
        /Aucun prochain cours/.test(sansCreneau), sansCreneau);

    // ------------------------------------------------------------------
    // CE QU'ON A ÉCRIT SURVIT À LA FERMETURE
    // ------------------------------------------------------------------
    const garde = await page.evaluate(async () => {
        selectedBoardId = 'tb_a';
        ouvrirLeCahier();
        await new Promise(ok => setTimeout(ok, 120));
        const champ = document.getElementById('cdt-objectifs');
        champ.value = 'Deuxième version des objectifs';
        // On ferme AVANT que l'écriture différée ne parte : fermer doit
        // enregistrer, sinon la dernière phrase tapée se perd.
        fermerLeCahier();
        await new Promise(ok => setTimeout(ok, 120));
        const memoire = JSON.parse(localStorage.getItem('board_cahier') || '{}');
        return {
            fermee: getComputedStyle(document.getElementById('cdt-modal')).display === 'none',
            garde: memoire.familles.tb_a.objectifs
        };
    });
    r.verifie('la fenêtre se referme', garde.fermee, JSON.stringify(garde));
    r.egal('et ce qui venait d\'être tapé est gardé', garde.garde, 'Deuxième version des objectifs');

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
