// L'AGENDA DU PROFESSEUR : L'EMPLOI DU TEMPS DE LA SEMAINE.
//
// « On pourrait envisager le fait de mettre son emploi du temps (avec semaine A
// / semaine B) et le logiciel passe automatiquement à la bonne classe. Un
// professeur des écoles pourrait mettre dans l'emploi du temps son programme. »
// Puis, sur la saisie : « Et du drag and drop facile. »
//
// TOUT SE JOUE SUR LA SAISIE. Vingt-cinq créneaux tapés dans un formulaire,
// personne ne le fait deux fois : le seul emploi du temps utile est celui qu'on
// remplit en dix minutes. On prend donc une classe dans la colonne de gauche,
// on la dépose sur la grille, on la déplace, on tire son bord. Ce chapitre
// éprouve ces quatre gestes, puis ce qui les rend supportables : le pas de cinq
// minutes, les bornes de la journée, et l'alternance A/B qui ne coûte rien à
// allumer — l'emploi du temps déjà saisi devient celui des deux semaines.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

// La grille place les minutes en pixels : pour viser une heure, on refait le
// même calcul qu'elle. Le test ne connaît que le haut de la colonne et le
// nombre de pixels par minute — s'ils changent, il suit.
async function viser(page, jour, minutes) {
    return await page.evaluate(([j, m]) => {
        const col = document.querySelector('.edt-jour[data-jour="' + j + '"]');
        const r = col.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + (m - 7 * 60) * 0.85 };
    }, [jour, minutes]);
}

async function glisser(page, depart, arrivee, selecteurDeprise) {
    await page.evaluate(([sel, a, b]) => {
        const source = document.querySelector(sel);
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', a, source);
        evt('pointermove', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        evt('pointermove', b);
        evt('pointerup', b);
    }, [selecteurDeprise, depart, arrivee]);
    await page.waitForTimeout(80);
}

module.exports = async function (browser) {
    const r = creerRapport('L\'agenda du professeur');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // LA FENÊTRE, ET LA PALETTE
    // ------------------------------------------------------------------
    const vide = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        const f = document.getElementById('edt-modal');
        return {
            ouverte: getComputedStyle(f).display !== 'none',
            entrees: document.querySelectorAll('.edt-entree').length,
            mot: (document.querySelector('.edt-palette-mot') || {}).innerText || '',
            colonnes: document.querySelectorAll('.edt-colonne').length,
            jours: [...document.querySelectorAll('.edt-titre')].map(t => t.innerText),
            // L'alternance et le samedi ne se paient que si on les demande.
            semaines: getComputedStyle(document.getElementById('edt-semaines')).display,
            recopier: getComputedStyle(document.getElementById('edt-recopier')).display
        };
    });
    r.verifie('l\'emploi du temps s\'ouvre', vide.ouverte, JSON.stringify(vide));
    r.egal('la palette est vide au départ', vide.entrees, 0);
    r.verifie('et dit ce qu\'il y a à faire',
        /déposez/i.test(vide.mot) && /classes/i.test(vide.mot), vide.mot);
    r.egal('la semaine va du lundi au vendredi', vide.jours,
        ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']);
    r.egal('la semaine A/B ne s\'affiche pas sans qu\'on l\'ait demandée', vide.semaines, 'none');
    r.egal('ni le bouton qui recopie une semaine sur l\'autre', vide.recopier, 'none');

    const ajoutee = await page.evaluate(async () => {
        reglerUneEntree(null);
        await new Promise(ok => setTimeout(ok, 120));
        const titre = document.getElementById('custom-prompt-title').innerText;
        const champ = document.querySelector('#custom-prompt-inputs .prompt-input');
        champ.value = '5e B';
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 150));
        const memoire = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        const puce = document.querySelector('.edt-entree');
        return {
            titre,
            nombre: document.querySelectorAll('.edt-entree').length,
            nom: puce.querySelector('.edt-entree-nom').innerText,
            coloree: !!puce.style.background,
            retenue: (memoire.entrees || []).map(e => e.libelle)
        };
    });
    r.verifie('on peut ajouter une classe ou une matière',
        /classe|matière/i.test(ajoutee.titre), ajoutee.titre);
    r.egal('elle rejoint la palette', ajoutee.nombre, 1);
    r.egal('sous son nom', ajoutee.nom, '5e B');
    r.verifie('avec une couleur à elle', ajoutee.coloree, JSON.stringify(ajoutee));
    r.egal('et elle est retenue', ajoutee.retenue, ['5e B']);

    // ------------------------------------------------------------------
    // DÉPOSER, DÉPLACER, ALLONGER, RETIRER
    // ------------------------------------------------------------------
    const depart = await page.evaluate(() => {
        const r = document.querySelector('.edt-entree').getBoundingClientRect();
        return { x: r.left + 20, y: r.top + r.height / 2 };
    });
    const mardi10h = await viser(page, 2, 10 * 60);

    // Le fantôme suit le doigt : sans lui, on dépose à l'aveugle.
    const fantome = await page.evaluate(([a, b]) => {
        const source = document.querySelector('.edt-entree');
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', a, source);
        evt('pointermove', b);
        const f = document.getElementById('edt-fantome');
        const vu = { la: !!f, texte: f ? f.innerText : '', suit: f ? Math.abs(f.getBoundingClientRect().left - b.x) < 40 : false };
        evt('pointerup', b);
        vu.apres = !!document.getElementById('edt-fantome');
        return vu;
    }, [depart, mardi10h]);
    r.verifie('un fantôme suit le doigt pendant qu\'on dépose',
        fantome.la && fantome.suit, JSON.stringify(fantome));
    r.egal('il porte le nom de ce qu\'on tient', fantome.texte, '5e B');
    r.egal('et s\'efface une fois posé', fantome.apres, false);

    const pose = await page.evaluate(() => {
        const memoire = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        const bloc = document.querySelector('.edt-creneau');
        return {
            nombre: document.querySelectorAll('.edt-creneau').length,
            nom: bloc.querySelector('.edt-creneau-nom').innerText,
            heure: bloc.querySelector('.edt-creneau-heure').innerText,
            creneaux: (memoire.creneaux || []).map(c => ({ jour: c.jour, debut: c.debut, duree: c.duree, libelle: c.libelle }))
        };
    });
    r.egal('déposer sur la grille pose un créneau', pose.nombre, 1);
    r.egal('le mardi, à dix heures, pour cinquante-cinq minutes', pose.creneaux,
        [{ jour: 2, debut: 600, duree: 55, libelle: '5e B' }]);
    r.egal('il porte le nom de la classe', pose.nom, '5e B');
    r.verifie('et son horaire en clair', /10 h – 10 h 55/.test(pose.heure), pose.heure);

    // RELÂCHÉ À CÔTÉ DE LA GRILLE, RIEN NE SE POSE. On attrape une classe, on
    // change d'avis : le geste doit pouvoir mourir sans laisser de trace.
    const ailleurs = await page.evaluate(() => {
        const source = document.querySelector('.edt-entree');
        const a = source.getBoundingClientRect();
        const p = document.getElementById('edt-palette').getBoundingClientRect();
        const evt = (type, x, y, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', a.left + 20, a.top + a.height / 2, source);
        evt('pointermove', p.left + p.width / 2, p.bottom - 6);
        evt('pointerup', p.left + p.width / 2, p.bottom - 6);
        return document.querySelectorAll('.edt-creneau').length;
    });
    r.egal('relâcher à côté de la grille ne pose rien', ailleurs, 1);

    // On prend le créneau tout en haut : là où le doigt se pose, c'est le haut
    // du bloc qui suit — sinon l'écart de prise décalerait l'heure d'arrivée.
    const jeudi14h = await viser(page, 4, 14 * 60);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-creneau').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 1 };
    }), jeudi14h, '.edt-creneau');
    const deplace = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => ({ jour: c.jour, debut: c.debut, duree: c.duree }));
    });
    r.egal('on déplace un créneau d\'un jour à l\'autre', deplace,
        [{ jour: 4, debut: 840, duree: 55 }]);

    const jeudi1530 = await viser(page, 4, 15 * 60 + 30);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-poignee').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), jeudi1530, '.edt-poignee');
    const allonge = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.duree);
    });
    r.egal('et on l\'allonge en tirant son bord du bas', allonge, [90]);

    // On ne peut pas le réduire à rien : un créneau écrasé sur la ligne n'a
    // plus de prise, et l'on ne sait plus ni le lire ni le rattraper.
    const jeudiTropHaut = await viser(page, 4, 12 * 60);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-poignee').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), jeudiTropHaut, '.edt-poignee');
    const court = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.duree);
    });
    r.egal('et on ne peut pas l\'écraser à rien', court, [25]);

    // LE PAS DE CINQ MINUTES. Une grille au pixel donnerait « 10 h 07 » : un
    // emploi du temps ne connaît pas ces heures-là.
    const jeudiTravers = await viser(page, 4, 9 * 60 + 2);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-creneau').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 6 };
    }), { x: jeudiTravers.x, y: jeudiTravers.y + 3 }, '.edt-creneau');
    const cale = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.debut);
    });
    r.verifie('les heures se calent sur cinq minutes', cale[0] % 5 === 0, String(cale[0]));

    // ------------------------------------------------------------------
    // LA PERSISTANCE
    // ------------------------------------------------------------------
    await rechargerApp(page);
    const retrouve = await page.evaluate(async () => {
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 150));
        return {
            entrees: [...document.querySelectorAll('.edt-entree-nom')].map(e => e.innerText),
            creneaux: document.querySelectorAll('.edt-creneau').length
        };
    });
    r.egal('la palette est encore là après un rechargement', retrouve.entrees, ['5e B']);
    r.egal('et le créneau aussi', retrouve.creneaux, 1);

    // ------------------------------------------------------------------
    // LES SEMAINES A ET B
    // ------------------------------------------------------------------
    const allumee = await page.evaluate(async () => {
        const b = document.getElementById('edt-alterne');
        b.checked = true;
        b.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 150));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return {
            semaines: getComputedStyle(document.getElementById('edt-semaines')).display,
            recopier: getComputedStyle(document.getElementById('edt-recopier')).display,
            actif: document.querySelector('.edt-semaine.actif').dataset.semaine,
            affiches: document.querySelectorAll('.edt-creneau').length,
            gardes: (m.creneaux || []).map(c => c.semaine).sort()
        };
    });
    r.verifie('allumer l\'alternance fait paraître les deux semaines',
        allumee.semaines !== 'none' && allumee.recopier !== 'none', JSON.stringify(allumee));
    r.egal('on regarde la A', allumee.actif, 'A');
    r.egal('l\'emploi du temps déjà saisi devient celui des deux', allumee.gardes, ['A', 'B']);
    r.egal('et l\'écran n\'en montre qu\'une à la fois', allumee.affiches, 1);

    const enB = await page.evaluate(async () => {
        [...document.querySelectorAll('.edt-semaine')].find(b => b.dataset.semaine === 'B').click();
        await new Promise(ok => setTimeout(ok, 120));
        const vu = { actif: document.querySelector('.edt-semaine.actif').dataset.semaine,
                     creneaux: document.querySelectorAll('.edt-creneau').length };
        // On retire le créneau de la semaine B : les deux semaines diffèrent.
        document.querySelector('.edt-oter').click();
        await new Promise(ok => setTimeout(ok, 120));
        vu.apresRetrait = document.querySelectorAll('.edt-creneau').length;
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        vu.restants = (m.creneaux || []).map(c => c.semaine);
        return vu;
    });
    r.egal('on passe à la semaine B', enB.actif, 'B');
    r.egal('qui a reçu le même créneau', enB.creneaux, 1);
    r.egal('on peut l\'y retirer', enB.apresRetrait, 0);
    r.egal('sans toucher à la semaine A', enB.restants, ['A']);

    const recopiee = await page.evaluate(async () => {
        [...document.querySelectorAll('.edt-semaine')].find(b => b.dataset.semaine === 'A').click();
        await new Promise(ok => setTimeout(ok, 120));
        document.getElementById('edt-recopier').click();
        await new Promise(ok => setTimeout(ok, 200));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.semaine).sort();
    });
    r.egal('« recopier sur l\'autre semaine » rend la B identique à la A', recopiee, ['A', 'B']);

    // ON DEMANDE, ET ON ÉCOUTE LA RÉPONSE. Une question dont le « non » ne
    // change rien n'est pas une question : c'est un avertissement déguisé.
    const refusee = await page.evaluate(async () => {
        const b = document.getElementById('edt-alterne');
        b.checked = false;
        b.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 150));
        const demande = getComputedStyle(document.getElementById('confirm-modal')).display !== 'none';
        document.getElementById('confirm-cancel-btn').click();
        await new Promise(ok => setTimeout(ok, 200));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return {
            demande, alterne: m.alterne,
            semaines: (m.creneaux || []).map(c => c.semaine).sort(),
            caseRevenue: document.getElementById('edt-alterne').checked
        };
    });
    r.verifie('éteindre l\'alternance se demande — la semaine B s\'y perd',
        refusee.demande, JSON.stringify(refusee));
    r.egal('et un refus ne change rien', [refusee.alterne, refusee.semaines], [true, ['A', 'B']]);
    r.egal('la case se remet comme elle était', refusee.caseRevenue, true);

    const eteinte = await page.evaluate(async () => {
        const b = document.getElementById('edt-alterne');
        b.checked = false;
        b.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 150));
        const demande = getComputedStyle(document.getElementById('confirm-modal')).display !== 'none';
        document.getElementById('confirm-yes-btn').click();
        await new Promise(ok => setTimeout(ok, 200));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return { demande, semaines: (m.creneaux || []).map(c => c.semaine), alterne: m.alterne };
    });
    r.verifie('on redemande, et cette fois on accepte', eteinte.demande, JSON.stringify(eteinte));
    r.egal('et il ne reste qu\'un emploi du temps', eteinte.semaines, ['toutes']);
    r.egal('l\'alternance est bien éteinte', eteinte.alterne, false);

    // ------------------------------------------------------------------
    // LE SAMEDI, ET LES BORNES DE LA JOURNÉE
    // ------------------------------------------------------------------
    const samedi = await page.evaluate(async () => {
        const b = document.getElementById('edt-samedi');
        b.checked = true;
        b.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 120));
        const avec = [...document.querySelectorAll('.edt-titre')].map(t => t.innerText);
        b.checked = false;
        b.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(ok => setTimeout(ok, 120));
        return { avec, sans: document.querySelectorAll('.edt-colonne').length };
    });
    r.egal('le samedi s\'ajoute pour qui en a besoin', samedi.avec.length, 6);
    r.verifie('et il s\'appelle samedi', samedi.avec[5] === 'Samedi', JSON.stringify(samedi.avec));
    r.egal('il repart aussi facilement', samedi.sans, 5);

    // On ne peut pas pousser un cours au-delà du bas de la grille : il
    // disparaîtrait sous le bord, et on ne pourrait plus l'attraper. On
    // l'allonge d'abord à deux heures — c'est SA FIN qui doit tenir dans la
    // journée, et un créneau court ne le dirait pas.
    const jourDuCreneau = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || [])[0].jour;
    });
    const deuxHeuresPlusBas = await viser(page, jourDuCreneau, 11 * 60);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-poignee').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), deuxHeuresPlusBas, '.edt-poignee');
    const longueur = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || [])[0].duree;
    });
    r.verifie('on peut faire un créneau de deux heures', longueur >= 110, String(longueur));

    const bas = await page.evaluate((j) => {
        const col = document.querySelector('.edt-jour[data-jour="' + j + '"]').getBoundingClientRect();
        return { x: col.left + col.width / 2, y: col.bottom + 260 };
    }, jourDuCreneau);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-creneau').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 6 };
    }), bas, '.edt-creneau');
    const borne = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        const c = (m.creneaux || [])[0];
        return { fin: c.debut + c.duree, visible: document.querySelectorAll('.edt-creneau').length };
    });
    r.verifie('un cours ne peut pas déborder de la journée', borne.fin <= 19 * 60,
        JSON.stringify(borne));
    r.egal('et il reste attrapable', borne.visible, 1);

    // RENOMMER SUIT PARTOUT. Le créneau porte le nom pour l'afficher sans rien
    // aller chercher : si le nom de la classe change, il doit changer avec.
    const renommee = await page.evaluate(async () => {
        document.querySelector('[data-regler]').click();
        await new Promise(ok => setTimeout(ok, 150));
        const champ = document.querySelector('#custom-prompt-inputs .prompt-input');
        const avant = champ.value;
        champ.value = '5e A';
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 200));
        return {
            avant,
            palette: document.querySelector('.edt-entree-nom').innerText,
            surLaGrille: [...document.querySelectorAll('.edt-creneau-nom')].map(n => n.innerText)
        };
    });
    r.egal('le formulaire s\'ouvre sur le nom actuel', renommee.avant, '5e B');
    r.egal('renommer change la palette', renommee.palette, '5e A');
    r.egal('et les créneaux déjà posés', renommee.surLaGrille, ['5e A']);

    // ------------------------------------------------------------------
    // RETIRER UNE ENTRÉE DE LA PALETTE EMPORTE SES CRÉNEAUX
    // ------------------------------------------------------------------
    const otee = await page.evaluate(async () => {
        document.querySelector('[data-oter-entree]').click();
        await new Promise(ok => setTimeout(ok, 150));
        const boite = document.getElementById('confirm-modal');
        // On regarde une boîte OUVERTE : le texte d'une boîte refermée traîne
        // dans la page et ferait passer la vérification pour rien.
        const texte = getComputedStyle(boite).display !== 'none' ? boite.innerText : '';
        document.getElementById('confirm-yes-btn').click();
        await new Promise(ok => setTimeout(ok, 200));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return { texte, entrees: (m.entrees || []).length, creneaux: (m.creneaux || []).length };
    });
    r.verifie('retirer une classe prévient que ses créneaux partent avec elle',
        /5e A/.test(otee.texte) && /créneau/i.test(otee.texte), otee.texte);
    r.egal('la palette se vide', otee.entrees, 0);
    r.egal('et la grille avec elle', otee.creneaux, 0);

    // ------------------------------------------------------------------
    // LA SEMAINE A OU B : UNE ANCRE, ET UNE CORRECTION EN UN GESTE
    // ------------------------------------------------------------------
    const ancre = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        lireLAgenda();
        agenda.alterne = false; agenda.ancre = null; agenda.entrees = []; agenda.creneaux = [];
        await basculerLAlternance(true);
        const dit = document.getElementById('edt-ancre');
        const vu = {
            posee: JSON.parse(localStorage.getItem('board_agenda') || '{}').ancre,
            texte: dit.innerText.replace(/\s+/g, ' ').trim(),
            montree: getComputedStyle(dit).display !== 'none',
            ici: semaineDe(new Date())
        };
        document.getElementById('edt-recaler').click();
        await new Promise(ok => setTimeout(ok, 120));
        vu.apres = semaineDe(new Date());
        vu.texteApres = dit.innerText.replace(/\s+/g, ' ').trim();
        return vu;
    });
    r.verifie('allumer l\'alternance pose l\'ancre sur cette semaine-ci',
        ancre.posee && ancre.posee.lettre === 'A' && /^\d{4}-\d{2}-\d{2}$/.test(ancre.posee.lundi),
        JSON.stringify(ancre.posee));
    r.verifie('et la lettre de la semaine est écrite', ancre.montree
        && /Cette semaine-ci : semaine A/.test(ancre.texte), ancre.texte);
    r.egal('on est donc en semaine A', ancre.ici, 'A');
    r.verifie('un bouton permet de dire le contraire',
        /non, c'est une B/.test(ancre.texte), ancre.texte);
    r.egal('et la correction prend tout de suite', ancre.apres, 'B');
    r.verifie('l\'offre s\'inverse alors',
        /semaine B/.test(ancre.texteApres) && /une A/.test(ancre.texteApres), ancre.texteApres);

    // LE COMPTE DES SEMAINES DOIT TENIR AU PRINTEMPS. La semaine du changement
    // d'heure ne dure que 167 heures : sans arrondi, elle basculerait, et l'on
    // se présenterait devant la mauvaise classe un lundi de mars.
    //
    // CETTE MACHINE VIT EN TEMPS UNIVERSEL, où l'heure ne change jamais : le
    // défaut y serait invisible. On ouvre donc une page à l'heure de Paris,
    // juste pour cette vérification-là — sans quoi elle ne vérifie rien.
    const paris = await ouvrirApp(browser, { fuseau: 'Europe/Paris' });
    const alternance = await paris.page.evaluate(() => {
        agenda.alterne = true;
        agenda.ancre = { lundi: '2026-03-09', lettre: 'A' };
        const le = (j) => semaineDe(new Date('2026-03-' + j + 'T10:00:00'));
        return {
            suite: ['09', '16', '23', '30'].map(le),
            avant: semaineDe(new Date('2026-03-02T10:00:00')),
            memeSemaine: ['09', '13', '15'].map(le),
            // Après le dernier dimanche de mars, Paris est à UTC+2.
            decalage: new Date('2026-03-30T10:00:00').getTimezoneOffset()
        };
    });
    r.egal('les semaines alternent une à une', alternance.suite, ['A', 'B', 'A', 'B']);
    r.egal('et le changement d\'heure ne les décale pas', alternance.suite[3], 'B');
    r.egal('la semaine d\'avant l\'ancre est l\'autre', alternance.avant, 'B');
    r.egal('tous les jours d\'une semaine portent sa lettre', alternance.memeSemaine, ['A', 'A', 'A']);
    r.verifie('et la page d\'épreuve était bien à l\'heure de Paris',
        alternance.decalage === -120, 'décalage en mars : ' + alternance.decalage);
    await paris.context.close();

    // ------------------------------------------------------------------
    // LE BANDEAU DU CRÉNEAU : PROPOSER, JAMAIS IMPOSER
    // ------------------------------------------------------------------
    const bandeau = await page.evaluate(async () => {
        fermerLAgenda();
        const d = new Date();
        const jour = (d.getDay() + 6) % 7 + 1;
        const minutes = d.getHours() * 60 + d.getMinutes();
        agenda.alterne = false;
        agenda.entrees = [{ id: 'e1', libelle: '3e A', classeId: null, classeNom: null, couleur: '#dfe4ff' }];
        agenda.creneaux = [{ id: 'c1', jour, debut: minutes - 10, duree: 55,
                             semaine: 'toutes', entreeId: 'e1', libelle: '3e A', couleur: '#dfe4ff' }];
        ecrireLAgenda();

        const b = document.getElementById('edt-bandeau');
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 80));
        const vu = {
            la: getComputedStyle(b).display !== 'none',
            texte: b.innerText.replace(/\s+/g, ' ').trim(),
            boutons: [...b.querySelectorAll('button')].map(x => x.id),
            // Le jour attendu, calculé ici : un décalage d'un cran annoncerait
            // le cours de la veille, et c'est très exactement l'erreur à ne pas
            // faire devant une classe.
            jourAttendu: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][(d.getDay() + 6) % 7],
            heureAttendue: (Math.floor((minutes - 10) / 60)) + ' h'
        };

        // Écarté, il ne revient pas de la journée.
        document.getElementById('edt-bandeau-fermer').click();
        vu.apresLaCroix = getComputedStyle(b).display !== 'none';
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 60));
        vu.revenu = getComputedStyle(b).display !== 'none';
        return vu;
    });
    r.verifie('le bandeau paraît quand l\'heure du créneau vient', bandeau.la, JSON.stringify(bandeau));
    r.verifie('il nomme la classe', /3e A/.test(bandeau.texte), bandeau.texte);
    r.verifie('et dit le bon jour', bandeau.texte.includes(bandeau.jourAttendu),
        bandeau.texte + ' — attendu ' + bandeau.jourAttendu);
    r.verifie('et la bonne heure', bandeau.texte.includes(bandeau.heureAttendue),
        bandeau.texte + ' — attendu ' + bandeau.heureAttendue);
    r.egal('il propose, il n\'impose pas', bandeau.boutons,
        ['edt-ouvrir-seance', 'edt-voir-agenda', 'edt-bandeau-fermer']);
    r.egal('la croix l\'écarte', bandeau.apresLaCroix, false);
    r.egal('et il ne revient pas de la journée', bandeau.revenu, false);

    // DIX MINUTES D'AVANCE, PAS UNE HEURE. On arrive avant la sonnerie ; on ne
    // veut pas qu'on nous parle du cours de l'après-midi.
    const avance = await page.evaluate(() => {
        agenda.alterne = false;
        agenda.creneaux = [{ id: 'c2', jour: 3, debut: 10 * 60, duree: 55,
                             semaine: 'toutes', entreeId: 'e1', libelle: '3e A' }];
        // Mercredi 4 mars 2026.
        const mercredi = (h, m) => new Date(2026, 2, 4, h, m);
        return {
            avant: !!creneauMaintenant(mercredi(9, 45)),
            juste: !!creneauMaintenant(mercredi(9, 52)),
            pendant: !!creneauMaintenant(mercredi(10, 30)),
            apres: !!creneauMaintenant(mercredi(11, 0)),
            autreJour: !!creneauMaintenant(new Date(2026, 2, 5, 10, 30))
        };
    });
    r.egal('un quart d\'heure avant, on ne dit rien encore', avance.avant, false);
    r.egal('dix minutes avant, on prévient', avance.juste, true);
    r.egal('pendant le cours, le bandeau vaut toujours', avance.pendant, true);
    r.egal('une fois le cours fini, plus rien', avance.apres, false);
    r.egal('et le créneau ne déborde pas sur le lendemain', avance.autreJour, false);

    // Une semaine B ne doit pas annoncer les créneaux de la A.
    const parSemaine = await page.evaluate(() => {
        agenda.alterne = true;
        agenda.ancre = { lundi: '2026-03-02', lettre: 'A' };
        agenda.creneaux = [{ id: 'c3', jour: 3, debut: 10 * 60, duree: 55,
                             semaine: 'A', entreeId: 'e1', libelle: '3e A' }];
        return {
            enA: !!creneauMaintenant(new Date(2026, 2, 4, 10, 30)),
            enB: !!creneauMaintenant(new Date(2026, 2, 11, 10, 30))
        };
    });
    r.egal('un créneau de semaine A s\'annonce en semaine A', parSemaine.enA, true);
    r.egal('et se tait en semaine B', parSemaine.enB, false);

    // ON NE PARLE PAS PAR-DESSUS L'EMPLOI DU TEMPS OUVERT : on y est déjà.
    const discret = await page.evaluate(async () => {
        const d = new Date();
        agenda.alterne = false;
        agenda.creneaux = [{ id: 'c4', jour: (d.getDay() + 6) % 7 + 1,
                             debut: d.getHours() * 60 + d.getMinutes() - 5, duree: 55,
                             semaine: 'toutes', entreeId: 'e1', libelle: '3e A' }];
        // L'ouverture relit le disque : ce qu'on a posé en mémoire doit y être.
        ecrireLAgenda();
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 60));
        const pendant = getComputedStyle(document.getElementById('edt-bandeau')).display !== 'none';
        fermerLAgenda();
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 60));
        const apres = getComputedStyle(document.getElementById('edt-bandeau')).display !== 'none';
        return { pendant, apres };
    });
    r.egal('le bandeau se tait tant que l\'emploi du temps est ouvert', discret.pendant, false);
    r.egal('et reprend la parole une fois refermé', discret.apres, true);

    // ------------------------------------------------------------------
    // « OUVRIR LA DERNIÈRE SÉANCE »
    // ------------------------------------------------------------------
    // Le tableau porte déjà sa classe : c'est ce lien qu'on suit, et c'est la
    // plus récente qu'on rouvre.
    const laquelle = await page.evaluate(() => {
        savedTableaux.push(
            { id: 'tb_vieux', name: 'Thalès — 3e A', type: 'file', classeId: 'cl3', timestamp: 1000 },
            { id: 'tb_recent', name: 'Pythagore — 3e A', type: 'file', classeId: 'cl3', timestamp: 9000 },
            { id: 'tb_autre', name: 'Fractions — 5e B', type: 'file', classeId: 'cl5', timestamp: 9999 });
        return {
            parClasse: (derniereSeanceDe({ id: 'e1', libelle: '3e A', classeId: 'cl3' }) || {}).id,
            parNom: (derniereSeanceDe({ id: 'e2', libelle: '5e B', classeId: null }) || {}).id,
            aucune: derniereSeanceDe({ id: 'e3', libelle: 'Arts plastiques', classeId: null }),
            sansEntree: derniereSeanceDe(null)
        };
    });
    r.egal('on rouvre la plus récente séance de cette classe', laquelle.parClasse, 'tb_recent');
    r.egal('une entrée sans classe se rabat sur le nom', laquelle.parNom, undefined);
    r.egal('et une matière sans séance n\'en invente pas', laquelle.aucune, null);
    r.egal('ni une entrée qui n\'existe pas', laquelle.sansEntree, null);

    // ET ON PASSE PAR LA PORTE PRUDENTE. « promptLoadBoard » propose d'abord
    // d'enregistrer ce qui est au tableau ; « loadBoard » l'écraserait. Une
    // proposition du logiciel n'a pas le droit d'emporter le travail de
    // quelqu'un — c'est là toute la différence entre proposer et imposer.
    const parLaBonnePorte = await page.evaluate(async () => {
        const d = new Date();
        const vraiPrudent = window.promptLoadBoard, vraiBrutal = window.loadBoard;
        let prudent = null, brutal = null;
        window.promptLoadBoard = (id) => { prudent = id; };
        window.loadBoard = (id) => { brutal = id; };

        agenda.entrees = [{ id: 'e3a', libelle: '3e A', classeId: 'cl3', couleur: '#eee' }];
        agenda.creneaux = [{ id: 'c6', jour: (d.getDay() + 6) % 7 + 1,
                             debut: d.getHours() * 60 + d.getMinutes() - 5, duree: 55,
                             semaine: 'toutes', entreeId: 'e3a', libelle: '3e A' }];
        agenda.alterne = false;
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 80));
        document.getElementById('edt-ouvrir-seance').click();
        await new Promise(ok => setTimeout(ok, 150));

        window.promptLoadBoard = vraiPrudent;
        window.loadBoard = vraiBrutal;
        return { prudent, brutal };
    });
    r.egal('« Ouvrir la dernière séance » ouvre bien la bonne', parLaBonnePorte.prudent, 'tb_recent');
    r.egal('en passant par la porte qui propose d\'enregistrer d\'abord',
        parLaBonnePorte.brutal, null);

    // RIEN NE S'EFFACE SANS QU'ON DEMANDE. Une proposition du logiciel n'a pas
    // le droit d'emporter ce qui est au tableau.
    const prudent = await page.evaluate(async () => {
        const d = new Date();
        agenda.entrees = [{ id: 'eX', libelle: 'Arts plastiques', classeId: null, couleur: '#eee' }];
        agenda.creneaux = [{ id: 'c5', jour: (d.getDay() + 6) % 7 + 1,
                             debut: d.getHours() * 60 + d.getMinutes() - 5, duree: 55,
                             semaine: 'toutes', entreeId: 'eX', libelle: 'Arts plastiques' }];
        agenda.alterne = false;
        battementDeLAgenda();
        await new Promise(ok => setTimeout(ok, 80));
        const avant = currentBoardName;
        document.getElementById('edt-ouvrir-seance').click();
        await new Promise(ok => setTimeout(ok, 250));
        return {
            bandeau: getComputedStyle(document.getElementById('edt-bandeau')).display !== 'none',
            tableauIntact: currentBoardName === avant,
            // Le dernier mot dit, et non le premier : les pastilles s'empilent.
            dit: ([...document.querySelectorAll('#toast-container .toast')].pop() || {}).innerText || ''
        };
    });
    r.egal('sans séance gardée, le bandeau s\'écarte quand même', prudent.bandeau, false);
    r.verifie('on le dit plutôt que de faire semblant',
        /Aucune séance/.test(prudent.dit), prudent.dit);
    r.verifie('et le tableau reste comme il est', prudent.tableauIntact, JSON.stringify(prudent));


    // ------------------------------------------------------------------
    // REFAIRE LA PRÉPARATION AVEC LA CLASSE QUI ARRIVE
    //
    // Le geste du mardi matin : on a fait Thalès avec la 3e A hier, on l'a
    // gardé comme préparation, et la 5e B arrive. Le mécanisme existait ;
    // l'emploi du temps sait maintenant quelle classe arrive.
    // ------------------------------------------------------------------
    const poser = async (creneauId, entree, tableaux) => await page.evaluate(
        ([id, e, tbx]) => {
            const d = new Date();
            savedTableaux.length = 0;
            tbx.forEach(t => savedTableaux.push(t));
            agenda.alterne = false;
            agenda.entrees = [e];
            agenda.creneaux = [{ id, jour: (d.getDay() + 6) % 7 + 1,
                                 debut: d.getHours() * 60 + d.getMinutes() - 5, duree: 55,
                                 semaine: 'toutes', entreeId: e.id, libelle: e.libelle }];
            battementDeLAgenda();
            return new Promise(ok => setTimeout(() => {
                const r = document.getElementById('edt-refaire');
                ok({
                    second: r ? 'refaire' : (document.getElementById('edt-voir-agenda') ? 'agenda' : 'rien'),
                    texte: r ? r.innerText.trim() : ''
                });
            }, 100));
        }, [creneauId, entree, tableaux]);

    const laPrep = { id: 'tb_prep', name: 'Thalès — 3e A', type: 'file', classeId: 'cl3',
                     classeNom: '3e A', timestamp: 5000, aPreparation: true };
    const cinqB = { id: 'e5b', libelle: '5e B', classeId: 'cl5', couleur: '#eee' };

    // Une préparation plus ancienne traîne aussi : c'est la PLUS RÉCENTE qu'on
    // refait, celle qu'on est en train de faire tourner dans ses classes.
    const vieillePrep = { id: 'tb_vieille', name: 'Pythagore — 4e C', type: 'file',
                          classeId: 'cl4', classeNom: '4e C', timestamp: 900, aPreparation: true };

    const offerte = await poser('cr_prep1', cinqB, [vieillePrep, laPrep]);
    r.egal('le second bouton propose de refaire la préparation', offerte.second, 'refaire');
    r.verifie('et il la nomme, sans le nom de l\'autre classe',
        /Thalès/.test(offerte.texte) && !/3e A/.test(offerte.texte), offerte.texte);
    r.verifie('c\'est la plus récente qu\'on propose',
        !/Pythagore/.test(offerte.texte), offerte.texte);

    const fait = await page.evaluate(async () => {
        const vraiRefaire = window.reinvestirLaSeance, vraiOuvrir = window.promptLoadBoard;
        let demande = null, ouvert = null;
        window.reinvestirLaSeance = async (id, classeId, nomClasse) => {
            demande = { id, classeId, nomClasse };
            return { id: 'tb_neuve' };
        };
        window.promptLoadBoard = (id) => { ouvert = id; };
        document.getElementById('edt-refaire').click();
        await new Promise(ok => setTimeout(ok, 200));
        const bandeau = getComputedStyle(document.getElementById('edt-bandeau')).display !== 'none';
        window.reinvestirLaSeance = vraiRefaire;
        window.promptLoadBoard = vraiOuvrir;
        return { demande, ouvert, bandeau };
    });
    r.egal('elle est refaite pour la classe du créneau', fait.demande,
        { id: 'tb_prep', classeId: 'cl5', nomClasse: '5e B' });
    r.egal('et la séance neuve s\'ouvre par la porte prudente', fait.ouvert, 'tb_neuve');
    r.egal('le bandeau s\'écarte', fait.bandeau, false);

    // DÉJÀ FAITE AVEC CETTE CLASSE, ON NE LA REPROPOSE PAS : ce serait la
    // refaire deux fois.
    const dejaFaite = await poser('cr_prep2', cinqB, [laPrep,
        { id: 'tb_dedans', name: 'Thalès — 5e B', type: 'file', classeId: 'cl5',
          classeNom: '5e B', timestamp: 6000, aPreparation: true, seanceOrigine: 'tb_prep' }]);
    r.egal('une préparation déjà faite avec cette classe ne se repropose pas',
        dejaFaite.second, 'agenda');

    // SANS PRÉPARATION GARDÉE, RIEN À REFAIRE : le second bouton redevient la
    // porte de l'emploi du temps.
    const sansPrep = await poser('cr_prep3', cinqB, [
        { id: 'tb_nue', name: 'Cours du lundi', type: 'file', timestamp: 7000 }]);
    r.egal('sans préparation gardée, on retrouve l\'emploi du temps',
        sansPrep.second, 'agenda');


    // ==================================================================
    // UNE QUESTION SE POSE PAR-DESSUS CE QU'ELLE CONCERNE
    //
    // « Le bouton Ajouter est inactif. » Il ne l'était pas : le formulaire
    // s'ouvrait DERRIÈRE l'emploi du temps, et l'on ne voyait rien bouger.
    //
    // MES ÉPREUVES NE POUVAIENT PAS LE VOIR. Elles appelaient la fonction et
    // cliquaient le bouton « OK » par son identifiant — ce qui marche aussi
    // bien sur une boîte enterrée sous une fenêtre. On regarde donc ici CE QUI
    // EST AU-DESSUS, au point même où le doigt se poserait.
    // ==================================================================
    const auDessus = await page.evaluate(async () => {
        // Qui répond au centre de cette boîte ? Si ce n'est pas elle, elle est
        // dessous, et l'appui va ailleurs.
        const quiRepond = (boite) => {
            const r = boite.getBoundingClientRect();
            const dessus = document.elementFromPoint(
                Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
            return !!(dessus && boite.contains(dessus));
        };

        localStorage.removeItem('board_agenda');
        lireLAgenda();
        agenda.alterne = false; agenda.ancre = null; agenda.entrees = []; agenda.creneaux = [];
        ecrireLAgenda();
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 150));

        // 1. « + Ajouter », pour de vrai : un appui sur le bouton visible.
        const bouton = document.getElementById('edt-ajouter');
        const b = bouton.getBoundingClientRect();
        const surLeBouton = document.elementFromPoint(
            Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
        const boutonAtteignable = !!(surLeBouton && bouton.contains(surLeBouton));
        bouton.click();
        await new Promise(ok => setTimeout(ok, 200));
        const formulaire = document.getElementById('custom-prompt-modal');
        const vu = {
            boutonAtteignable,
            formulaireOuvert: getComputedStyle(formulaire).display !== 'none',
            formulaireDevant: quiRepond(formulaire)
        };
        document.getElementById('custom-prompt-cancel').click();
        await new Promise(ok => setTimeout(ok, 150));

        // 2. La confirmation d'une suppression, elle aussi.
        agenda.entrees = [{ id: 'e9', libelle: '6e A', classeId: null, couleur: '#eee' }];
        agenda.creneaux = [];
        rendreLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        document.querySelector('[data-oter-entree]').click();
        await new Promise(ok => setTimeout(ok, 200));
        const question = document.getElementById('confirm-modal');
        vu.questionOuverte = getComputedStyle(question).display !== 'none';
        vu.questionDevant = quiRepond(question);
        document.getElementById('confirm-cancel-btn').click();
        await new Promise(ok => setTimeout(ok, 150));
        fermerLAgenda();
        return vu;
    });
    r.verifie('le bouton « + Ajouter » est bien sous le doigt', auDessus.boutonAtteignable,
        JSON.stringify(auDessus));
    r.verifie('il ouvre le formulaire', auDessus.formulaireOuvert, JSON.stringify(auDessus));
    r.verifie('ET LE FORMULAIRE EST DEVANT — pas enterré sous l\'emploi du temps',
        auDessus.formulaireDevant, JSON.stringify(auDessus));
    r.verifie('retirer une classe pose sa question', auDessus.questionOuverte,
        JSON.stringify(auDessus));
    r.verifie('et cette question est devant elle aussi', auDessus.questionDevant,
        JSON.stringify(auDessus));


    // ==================================================================
    // TRACER UNE HEURE SANS AVOIR RIEN PRÉPARÉ
    //
    // « Je ne peux pas créer une heure sans classe, c'est dommage. » La grille
    // est la première chose qu'on regarde : tracer dessus doit marcher, et
    // c'est le nom qu'on demande ensuite — quand on voit ce qu'on nomme.
    // ==================================================================
    const sansRien = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        lireLAgenda();
        agenda.alterne = false; agenda.ancre = null; agenda.entrees = []; agenda.creneaux = [];
        agenda.derniere = null;
        ecrireLAgenda();
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 150));
        const paletteVide = document.querySelectorAll('.edt-entree').length;

        const col = document.querySelector('.edt-jour[data-jour="1"]');
        const r = col.getBoundingClientRect();
        const y = (m) => r.top + (m - 7 * 60) * 0.85;
        const evt = (type, x, yy, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: x, clientY: yy, bubbles: true, pointerType: 'mouse' }));
        const x = r.left + r.width / 2;
        evt('pointerdown', x, y(9 * 60), col);
        evt('pointermove', x, y(10 * 60));
        evt('pointerup', x, y(10 * 60));
        await new Promise(ok => setTimeout(ok, 250));

        const formulaire = document.getElementById('custom-prompt-modal');
        const vu = {
            paletteVide,
            creneaux: document.querySelectorAll('.edt-creneau').length,
            entrees: document.querySelectorAll('.edt-entree').length,
            demandeLeNom: getComputedStyle(formulaire).display !== 'none'
        };
        const champ = document.querySelector('#custom-prompt-inputs .prompt-input');
        vu.nomPropose = champ ? champ.value : null;
        if (champ) { champ.value = 'CM1'; document.getElementById('custom-prompt-ok').click(); }
        await new Promise(ok => setTimeout(ok, 250));
        vu.surLaGrille = [...document.querySelectorAll('.edt-creneau-nom')].map(n => n.textContent);
        vu.dansLaPalette = [...document.querySelectorAll('.edt-entree-nom')].map(n => n.textContent);
        return vu;
    });
    r.egal('la palette est bien vide au départ', sansRien.paletteVide, 0);
    r.egal('tracer sur la grille crée quand même un créneau', sansRien.creneaux, 1);
    r.egal('et l\'entrée naît avec lui', sansRien.entrees, 1);
    r.verifie('on demande son nom une fois le trait posé', sansRien.demandeLeNom,
        JSON.stringify(sansRien));
    r.egal('le formulaire propose le nom provisoire', sansRien.nomPropose, 'Cours');
    r.egal('le nom donné se pose sur le créneau', sansRien.surLaGrille, ['CM1']);
    r.egal('et sur l\'entrée de la palette', sansRien.dansLaPalette, ['CM1']);

    // ET UN CRÉNEAU QU'ON TOUCHE SANS LE BOUGER DEMANDE À ÊTRE RENOMMÉ : on
    // trace vite, on corrige après.
    const renommeAuDoigt = await page.evaluate(async () => {
        const bloc = document.querySelector('.edt-creneau');
        const r = bloc.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + 8;
        const evt = (type, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', bloc);
        evt('pointerup');
        await new Promise(ok => setTimeout(ok, 250));
        const formulaire = document.getElementById('custom-prompt-modal');
        const ouvert = getComputedStyle(formulaire).display !== 'none';
        const champ = document.querySelector('#custom-prompt-inputs .prompt-input');
        const valeur = champ ? champ.value : null;
        if (champ) { champ.value = 'CM2'; document.getElementById('custom-prompt-ok').click(); }
        await new Promise(ok => setTimeout(ok, 250));
        const apres = [...document.querySelectorAll('.edt-creneau-nom')].map(n => n.textContent);
        fermerLAgenda();
        return { ouvert, valeur, apres };
    });
    r.verifie('appuyer sur un créneau sans le bouger rouvre son nom',
        renommeAuDoigt.ouvert, JSON.stringify(renommeAuDoigt));
    r.egal('avec le nom d\'aujourd\'hui dedans', renommeAuDoigt.valeur, 'CM1');
    r.egal('et le renommer suit sur la grille', renommeAuDoigt.apres, ['CM2']);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
