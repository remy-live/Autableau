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

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
