// LE CAHIER DE TEXTE SE REMPLIT DANS LA GRILLE
//
// « Où remplit-on son cahier de texte, car on pourrait le faire une fois
// l'emploi du temps fait ou même pas fini, et on a une fenêtre qui permet de
// le remplir. Il faut que ce soit beau, simple. » Puis : « j'aurais plutôt vu
// une petite popup à côté du jour (ou qui s'adapte), penses-tu qu'autre chose
// serait mieux ? »
//
// CE QUI DÉCIDAIT DE TOUT : la grille était une semaine TYPE, sans dates.
// « Mardi 13 h 40, 4EME AP1 » ne dit pas QUEL mardi — et l'on n'écrit pas un
// cahier de texte sans date : on écrirait dans le vide, et Pronote attend une
// date. Elle porte donc une semaine réelle, qu'on feuillette.
//
// CE QUE CE CHAPITRE TIENT :
//
//   — la grille montre une semaine datée, et l'on passe d'une à l'autre ;
//   — aujourd'hui se voit, sinon on remplit le cahier du mauvais jour ;
//   — un appui sur une case ouvre le mot du cours, ancré à côté d'elle ;
//   — il porte la DATE en toutes lettres, pas seulement « mardi » ;
//   — ce qu'on écrit s'enregistre en écrivant, sans bouton ;
//   — une pastille dit sur la grille ce qui est rempli : la semaine DEVIENT
//     le cahier ;
//   — et ce qu'on écrit un lundi ne reparaît pas le lundi suivant ;
//   — la popup n'est pas une fenêtre : ni barre de titre, ni croix.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le cahier dans la grille');
    const { page, context, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1600, height: 1000 }, fuseau: 'Europe/Paris' });

    // Un emploi du temps simple, posé à la main : ce chapitre ne parle pas de
    // l'import, il parle de ce qu'on écrit dans la grille.
    await page.evaluate(() => {
        cahier.jours = {};
        agenda.alterne = false;
        agenda.samedi = false;
        agenda.debut = 8 * 60; agenda.fin = 18 * 60;
        agenda.entrees = [
            { id: 'e1', libelle: '6EME B', classeId: null, classeNom: null, couleur: '#dfe4ff' },
            { id: 'e2', libelle: '4EME A', classeId: null, classeNom: null, couleur: '#d9f2e6' }
        ];
        agenda.creneaux = [
            { id: 'c1', jour: 1, debut: 8 * 60 + 5, duree: 60, semaine: 'toutes',
              entreeId: 'e1', libelle: '6EME B', couleur: '#dfe4ff' },
            { id: 'c2', jour: 4, debut: 10 * 60 + 15, duree: 55, semaine: 'toutes',
              entreeId: 'e2', libelle: '4EME A', couleur: '#d9f2e6' }
        ];
        ecrireLAgenda(); ecrireLeCahier();
        revenirACetteSemaine();
        ouvrirLAgenda();
        rendreLAgenda();
    });
    await page.waitForTimeout(600);

    // ==========================================================
    // 1. LA GRILLE EST UN CALENDRIER
    // ==========================================================
    const semaine = await page.evaluate(() => {
        const titres = [...document.querySelectorAll('#edt-grille .edt-titre')]
            .map(t => t.textContent.replace(/\s+/g, ' ').trim());
        const lundi = lundiDe(new Date());
        const attendu = String(lundi.getDate()).padStart(2, '0') + '/'
            + String(lundi.getMonth() + 1).padStart(2, '0');
        return { titres, attenduLundi: attendu,
                 libelle: document.getElementById('edt-semaine-lue').textContent,
                 aujourdhui: document.querySelectorAll('#edt-grille .edt-colonne.edt-aujourdhui').length };
    });
    r.verifie('chaque colonne porte sa date',
        semaine.titres.length >= 5 && semaine.titres[0].includes(semaine.attenduLundi),
        JSON.stringify(semaine.titres));
    r.verifie('et la barre dit quelle semaine on regarde',
        /^Semaine du /.test(semaine.libelle), semaine.libelle);
    // AUJOURD'HUI SE VOIT : sans cela on cherche sa colonne des yeux, et l'on
    // remplit le cahier du mauvais jour. Un seul jour, jamais deux.
    r.egal('aujourd\'hui est marqué, et lui seul', semaine.aujourdhui, 1);

    // ON FEUILLETTE, ET L'ON REVIENT.
    //
    // ON VÉRIFIE D'ABORD QUE LES COMMANDES SONT LÀ. Sabotée en les retirant,
    // l'épreuve plantait trente secondes plus loin sur un clic impossible, et
    // le chapitre y perdait tout le reste — un échec doit rester lisible.
    const commandes = await page.evaluate(() => ['edt-semaine-avant', 'edt-semaine-lue',
        'edt-semaine-apres'].filter(i => {
            const b = document.getElementById(i);
            return b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 2;
        }));
    r.egal('la barre porte ses trois commandes de semaine', commandes,
        ['edt-semaine-avant', 'edt-semaine-lue', 'edt-semaine-apres']);
    if (commandes.length !== 3) {
        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
        return r.bilan();
    }

    const avant = semaine.libelle;
    await page.click('#edt-semaine-apres');
    await page.waitForTimeout(400);
    const suivante = await page.evaluate(() => ({
        libelle: document.getElementById('edt-semaine-lue').textContent,
        aujourdhui: document.querySelectorAll('#edt-grille .edt-colonne.edt-aujourdhui').length,
        marque: document.getElementById('edt-semaine-lue').classList.contains('actif')
    }));
    r.verifie('la flèche emmène à la semaine suivante',
        suivante.libelle !== avant && /^Semaine du /.test(suivante.libelle), suivante.libelle);
    r.egal('et aucun jour n\'y est « aujourd\'hui »', suivante.aujourdhui, 0);
    r.egal('le libellé ne se marque plus comme la semaine en cours', suivante.marque, false);

    await page.click('#edt-semaine-lue');
    await page.waitForTimeout(400);
    r.egal('appuyer sur le libellé ramène à la semaine en cours',
        await page.evaluate(() => ({
            libelle: document.getElementById('edt-semaine-lue').textContent,
            marque: document.getElementById('edt-semaine-lue').classList.contains('actif')
        })), { libelle: avant, marque: true });

    // ==========================================================
    // 2. UN APPUI OUVRE LE MOT DU COURS, À CÔTÉ DE LA CASE
    //
    // On règle ses horaires trois fois en septembre, on remplit son cahier
    // deux cents fois dans l'année : le geste le plus court va au geste le
    // plus fréquent. La fiche d'horaire reste sur le « ⋯ ».
    // ==========================================================
    const appuyerSur = async (id) => {
        const p = await page.evaluate((i) => {
            const c = document.querySelector('#edt-grille .edt-creneau[data-id="' + i + '"]');
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
        }, id);
        if (!p) throw new Error('créneau ' + id + ' introuvable dans la grille');
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(400);
    };

    await appuyerSur('c1');
    const popup = await page.evaluate(() => {
        const b = document.getElementById('edt-mot-du-cours');
        if (!b) return { ouverte: false };
        const rb = b.getBoundingClientRect();
        const c = document.querySelector('#edt-grille .edt-creneau[data-id="c1"]');
        const rc = c.getBoundingClientRect();
        // « à côté du jour » : la popup doit toucher la case, pas s'ouvrir à
        // l'autre bout de l'écran — la leçon de la palette de couleurs.
        const ecart = Math.min(Math.abs(rb.left - rc.right), Math.abs(rc.left - rb.right));
        return {
            ouverte: b.classList.contains('ouvert'),
            classe: document.getElementById('emc-classe').textContent,
            quand: document.getElementById('emc-quand').textContent,
            ecart: Math.round(ecart),
            dansLEcran: rb.left >= 0 && rb.top >= 0
                     && rb.right <= window.innerWidth && rb.bottom <= window.innerHeight,
            // UNE POPUP ANCRÉE N'EST PAS UNE FENÊTRE : une barre de titre avec
            // son nom, son plein écran et sa croix lui prendrait le tiers de
            // sa hauteur.
            barreDeTitre: !!b.querySelector('.fen-tete'),
            champs: [...b.querySelectorAll('textarea')].length
        };
    });
    r.verifie('un appui sur une case ouvre le mot du cours', popup.ouverte, JSON.stringify(popup));
    // SI ELLE NE S'EST PAS OUVERTE, ON S'ARRÊTE ICI PROPREMENT. Sabotée, cette
    // épreuve plantait trente secondes plus loin sur un « fill » impossible,
    // et le chapitre y perdait ses vingt autres vérifications.
    if (!popup.ouverte) {
        r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
        await context.close();
        return r.bilan();
    }
    r.verifie('il s\'ancre contre la case, et non ailleurs',
        popup.ecart <= 24 && popup.dansLEcran, JSON.stringify(popup));
    r.egal('il nomme la classe', popup.classe, '6EME B');
    // LA DATE EN TOUTES LETTRES : « mardi » ne dit pas quel mardi, et c'est
    // toute la raison pour laquelle la grille est devenue un calendrier.
    const lundiLu = await page.evaluate(() => {
        const d = lundiDe(new Date());
        return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    });
    r.egal('et il porte la DATE, pas seulement le jour de la semaine',
        popup.quand, lundiLu + ' · 8 h 05');
    r.egal('deux champs, et pas trois : ce qu\'on écrit après un cours', popup.champs, 2);
    r.egal('et pas de barre de titre : ce n\'est pas une fenêtre', popup.barreDeTitre, false);

    // ==========================================================
    // 3. ON ÉCRIT, ÇA S'ENREGISTRE, ET LA GRILLE LE MONTRE
    //
    // Un bouton « Enregistrer » dans une popup qu'on ferme d'un clic à côté,
    // c'est du travail perdu un soir sur deux.
    // ==========================================================
    await page.fill('#emc-fait', 'Exercices 12 à 15');
    await page.fill('#emc-devoirs', 'Pour lundi : ex. 18 p. 47');
    await page.evaluate(() => document.getElementById('emc-devoirs').blur());
    await page.waitForTimeout(500);

    const ecrit = await page.evaluate(() => {
        const lundi = lundiDe(new Date());
        const cle = jourIso(lundi) + '|' + (8 * 60 + 5) + '|6EME B';
        return { cle, enregistre: cahier.jours[cle] || null,
                 pastilles: document.querySelectorAll('#edt-grille .edt-ecrit').length };
    });
    r.egal('ce qu\'on écrit est rangé à la date, à l\'heure et à la classe',
        ecrit.enregistre ? { fait: ecrit.enregistre.fait, devoirs: ecrit.enregistre.devoirs } : null,
        { fait: 'Exercices 12 à 15', devoirs: 'Pour lundi : ex. 18 p. 47' });
    // LA SEMAINE DEVIENT LE CAHIER : d'un coup d'œil on voit ce qui manque.
    r.egal('et une pastille le dit sur la grille, sur cette case-là seulement',
        ecrit.pastilles, 1);

    // ÇA TIENT APRÈS UN RECHARGEMENT — c'est du cahier, pas une note volante.
    r.egal('le cahier garde ce qu\'on y a mis',
        await page.evaluate(() => {
            const cle = jourIso(lundiDe(new Date())) + '|' + (8 * 60 + 5) + '|6EME B';
            cahier.jours = {};             // on oublie tout
            lireLeCahier();                // et l'on relit le stockage
            const m = cahier.jours && cahier.jours[cle];
            return m ? m.fait : '(perdu)';
        }), 'Exercices 12 à 15');

    // ==========================================================
    // 4. CE QU'ON ÉCRIT UN LUNDI NE REPARAÎT PAS LE LUNDI SUIVANT
    //
    // C'est toute la différence entre un cahier de texte et une semaine type.
    // ==========================================================
    await page.click('#edt-semaine-apres');
    await page.waitForTimeout(500);
    r.egal('la semaine suivante est vierge',
        await page.evaluate(() => document.querySelectorAll('#edt-grille .edt-ecrit').length), 0);
    r.egal('et changer de semaine referme le mot du cours',
        await page.evaluate(() => {
            const b = document.getElementById('edt-mot-du-cours');
            return !b || !b.classList.contains('ouvert');
        }), true);

    // ON Y ÉCRIT AUTRE CHOSE, et les deux semaines gardent chacune la sienne.
    await appuyerSur('c1');
    await page.fill('#emc-fait', 'Contrôle');
    await page.evaluate(() => document.getElementById('emc-fait').blur());
    await page.waitForTimeout(500);
    const deuxSemaines = await page.evaluate(() => {
        const lundi = lundiDe(new Date());
        const suivant = new Date(lundi); suivant.setDate(suivant.getDate() + 7);
        const cle = (d) => jourIso(d) + '|' + (8 * 60 + 5) + '|6EME B';
        return { cette: (cahier.jours[cle(lundi)] || {}).fait,
                 prochaine: (cahier.jours[cle(suivant)] || {}).fait };
    });
    r.egal('chaque semaine garde son mot', deuxSemaines,
        { cette: 'Exercices 12 à 15', prochaine: 'Contrôle' });

    // ==========================================================
    // 4 bis. UNE CASE CONTRE LE BORD : LA POPUP SE RABAT
    //
    // Elle s'ouvre à DROITE de la case, parce que c'est là qu'on regarde. Mais
    // sur une case du vendredi dans une fenêtre étroite, il n'y a pas trois
    // cents pixels à droite : elle doit passer à gauche, et tenir dans
    // l'écran. Un sabotage a montré que mes trois premiers cas ne l'obligeaient
    // jamais — toutes mes cases avaient de la place à leur droite.
    // ==========================================================
    await page.evaluate(() => {
        fermerLeMotDuCours();
        revenirACetteSemaine();
        agenda.creneaux.push({ id: 'c3', jour: 5, debut: 8 * 60 + 5, duree: 55,
                               semaine: 'toutes', entreeId: 'e1', libelle: '6EME B',
                               couleur: '#dfe4ff' });
        ecrireLAgenda(); rendreLAgenda();
    });
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForTimeout(400);
    await appuyerSur('c3');
    const auBord = await page.evaluate(() => {
        const b = document.getElementById('edt-mot-du-cours');
        const rb = b.getBoundingClientRect();
        const c = document.querySelector('#edt-grille .edt-creneau[data-id="c3"]');
        const rc = c.getBoundingClientRect();
        return {
            ouverte: b.classList.contains('ouvert'),
            aGauche: rb.right <= rc.left + 2,
            dansLEcran: rb.left >= 0 && rb.right <= window.innerWidth,
            popup: [Math.round(rb.left), Math.round(rb.right)],
            case: [Math.round(rc.left), Math.round(rc.right)],
            ecran: window.innerWidth
        };
    });
    r.verifie('contre le bord droit, la popup passe à gauche de la case',
        auBord.ouverte && auBord.aGauche, JSON.stringify(auBord));
    r.verifie('et elle tient entièrement dans l\'écran',
        auBord.dansLEcran, JSON.stringify(auBord));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => { fermerLeMotDuCours(); });

    // ==========================================================
    // 5. LE « ⋯ » GARDE LA FICHE D'HORAIRE
    //
    // On n'a pas supprimé le réglage, on l'a déplacé là où il était déjà.
    // ==========================================================
    await page.evaluate(() => { fermerLeMotDuCours(); revenirACetteSemaine(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const b = document.querySelector('#edt-grille .edt-creneau[data-id="c1"] .edt-regler');
        if (b) b.click();
    });
    await page.waitForTimeout(500);
    r.verifie('le « ⋯ » ouvre toujours la fiche d\'horaire',
        await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            return !!m && getComputedStyle(m).display !== 'none';
        }),
        'la fiche ne s\'est pas ouverte');
    await page.evaluate(() => {
        const m = document.getElementById('custom-prompt-modal');
        const b = document.getElementById('custom-prompt-cancel')
            || [...m.querySelectorAll('button')].find(x => /annul/i.test(x.textContent));
        if (b) b.click();
    });
    await page.waitForTimeout(300);

    // ==========================================================
    // 6. LE MOT S'EN VA AVEC LA GRILLE
    //
    // On écrit dans une case, on referme l'emploi du temps — et la petite
    // popup restait seule au-dessus du tableau, accrochée à une case qu'on
    // ne voyait plus. Posée à 200050, elle recouvrait ce qu'on venait
    // justement écrire.
    // ==========================================================
    const orphelin = await page.evaluate(async () => {
        const c = document.querySelector('#edt-grille .edt-creneau[data-id="c1"]');
        if (!c) return { ouvertAvant: false, pourquoi: 'la case c1 a disparu' };
        c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse',
            clientX: c.getBoundingClientRect().left + 10, clientY: c.getBoundingClientRect().top + 10 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse',
            clientX: c.getBoundingClientRect().left + 10, clientY: c.getBoundingClientRect().top + 10 }));
        await new Promise(ok => setTimeout(ok, 350));
        const vu = () => {
            const m = document.getElementById('edt-mot-du-cours');
            return !!m && getComputedStyle(m).display !== 'none';
        };
        const ouvertAvant = vu();
        fermerLAgenda();
        await new Promise(ok => setTimeout(ok, 250));
        return { ouvertAvant, encoreLa: vu() };
    });
    r.verifie('le mot du cours s\'ouvre bien avant qu\'on referme',
        orphelin.ouvertAvant, JSON.stringify(orphelin));
    r.verifie('refermer l\'emploi du temps emporte le mot du cours avec lui',
        orphelin.ouvertAvant && orphelin.encoreLa === false, JSON.stringify(orphelin));

    await page.evaluate(() => { fermerLeMotDuCours(); if (typeof fermerLAgenda === 'function') fermerLAgenda(); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
