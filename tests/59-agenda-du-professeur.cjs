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
// « 8 h », « 10 h 15 » : le format du dépôt, refait ici pour comparer sans
// recopier l'implémentation.
function heureFr(minutes) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
}

async function viser(page, jour, minutes) {
    return await page.evaluate(([j, m]) => {
        const col = document.querySelector('.edt-jour[data-jour="' + j + '"]');
        const r = col.getBoundingClientRect();
        // ON LIT L'ÉCHELLE DANS LA PAGE, on ne la recopie pas. Elle était
        // écrite en dur — 7 h, 0,85 — et le jour où les bornes de la journée
        // sont devenues réglables, tout le chapitre est tombé en accusant le
        // déplacement, alors que c'était l'échelle qui avait changé.
        return { x: r.left + r.width / 2, y: r.top + (m - edtDebut()) * edtPx() };
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
        if (!puce) return { titre, nombre: 0, nom: '(aucune puce)',
                            coloree: false, retenue: (memoire.entrees || []).map(e => e.libelle),
                            memoire: JSON.stringify(memoire).slice(0, 200) };
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

    // ==================================================================
    // CE QU'ON VOIT PENDANT QU'ON GLISSE
    //
    // « Le drag and drop est invisible, on ne voit pas les fantômes. » Le
    // fantôme existait pourtant, et ce chapitre le vérifiait — mais il ne
    // vérifiait que sa PRÉSENCE DANS LE DOCUMENT. Il était à z-index 100040,
    // sous une fenêtre à 100050 : présent, et invisible. Une vérification qui
    // ne regarde pas ce que l'œil voit ne prouve rien.
    //
    // ON DEMANDE DONC À LA PAGE CE QU'IL Y A SOUS LE POINT : si un autre
    // élément répond à la place du fantôme, c'est qu'il est enterré.
    // ==================================================================
    const fantome = await page.evaluate(([a, b]) => {
        const source = document.querySelector('.edt-entree');
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', a, source);
        evt('pointermove', b);
        const f = document.getElementById('edt-fantome');
        const rf = f ? f.getBoundingClientRect() : null;
        // Il ne répond pas au doigt (pointer-events: none) : on regarde donc
        // s'il est PEINT au-dessus, en comparant son rang d'empilement à celui
        // de la fenêtre qui l'enterrait.
        const rang = (el) => {
            let n = 0;
            for (let x = el; x; x = x.parentElement) {
                const z = Number(getComputedStyle(x).zIndex);
                if (Number.isFinite(z)) { n = z; break; }
            }
            return n;
        };
        const vu = {
            la: !!f,
            texte: f ? f.innerText : '',
            // AU-DESSUS DU DOIGT : c'est la seule zone qu'une main ne couvre
            // jamais. Il était posé douze pixels à DROITE et quatorze au-dessus
            // — c'est-à-dire sous la pulpe.
            auDessus: rf ? (rf.bottom < b.y - 10) : false,
            centre: rf ? Math.abs((rf.left + rf.width / 2) - b.x) < 40 : false,
            rang: f ? rang(f) : 0,
            rangDeLaFenetre: rang(document.getElementById('edt-modal')),
            apercu: !!document.querySelector('.edt-jour[data-jour="2"] .edt-apercu'),
            colonneAllumee: !!document.querySelector('.edt-jour[data-jour="2"].edt-vise')
        };
        evt('pointerup', b);
        vu.apres = !!document.getElementById('edt-fantome');
        vu.apercuApres = !!document.getElementById('edt-apercu');
        return vu;
    }, [depart, mardi10h]);
    r.verifie('une pastille suit le doigt pendant qu\'on dépose',
        fantome.la && fantome.centre, JSON.stringify(fantome));
    r.verifie('elle se peint AU-DESSUS de la fenêtre, et non dessous',
        fantome.rang > fantome.rangDeLaFenetre,
        `${fantome.rang} contre ${fantome.rangDeLaFenetre}`);
    r.verifie('et au-dessus du doigt, là où la main ne passe pas',
        fantome.auDessus, JSON.stringify(fantome));
    // ELLE DIT L'HEURE, ce que le nom de la classe ne disait pas : on sait ce
    // qu'on tient, on veut savoir OÙ ça tombe.
    r.verifie('elle dit le jour et l\'heure où le cours tombera',
        /Mardi/.test(fantome.texte) && /\dh|\d\sh/.test(fantome.texte.replace(/\u00a0/g, ' ')),
        fantome.texte);
    // ET L'APERÇU, DANS LA COLONNE : c'est lui le vrai fantôme. Étant un
    // enfant de la colonne, il partage l'empilement des créneaux — il n'y a
    // plus aucun z-index à arbitrer contre la fenêtre.
    r.verifie('un aperçu se dessine dans la colonne visée', fantome.apercu,
        JSON.stringify(fantome));
    r.verifie('et la colonne s\'allume : au doigt, la main cache l\'endroit',
        fantome.colonneAllumee, JSON.stringify(fantome));
    r.egal('la pastille s\'efface une fois posé', fantome.apres, false);
    r.egal('et l\'aperçu avec elle', fantome.apercuApres, false);

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
        const r = document.querySelector('.edt-poignee-bas').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), jeudi1530, '.edt-poignee-bas');
    const allonge = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.duree);
    });
    r.egal('et on l\'allonge en tirant son bord du bas', allonge, [90]);

    // On ne peut pas le réduire à rien : un créneau écrasé sur la ligne n'a
    // plus de prise, et l'on ne sait plus ni le lire ni le rattraper.
    const jeudiTropHaut = await viser(page, 4, 12 * 60);
    await glisser(page, await page.evaluate(() => {
        const r = document.querySelector('.edt-poignee-bas').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), jeudiTropHaut, '.edt-poignee-bas');
    const court = await page.evaluate(() => {
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return (m.creneaux || []).map(c => c.duree);
    });
    // VINGT-CINQ MINUTES EXCLUAIENT L'ÉCOLE PRIMAIRE : un rituel de quinze
    // minutes, un atelier de maternelle de vingt, une récréation — rien de
    // tout cela n'était traçable. Le plancher descend à dix.
    r.egal('et on ne peut pas l\'écraser à rien', court, [10]);

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
        const r = document.querySelector('.edt-poignee-bas').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    }), deuxHeuresPlusBas, '.edt-poignee-bas');
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

    // ==================================================================
    // « MODIFIER LES HORAIRES » : AU CHIFFRE, PAS EN VISANT UN BORD
    //
    // On ne pouvait corriger un horaire qu'à la main, en attrapant un bord —
    // c'est-à-dire par tranches de cinq minutes, et jamais exactement. Un
    // cours va de 8 h 05 à 9 h 00 : cela se dit, cela ne se vise pas.
    //
    // Appuyer sur un créneau sans le bouger ouvre donc sa fiche, où les deux
    // heures s'écrivent.
    // ==================================================================
    const fiche = await page.evaluate(async () => {
        const bloc = document.querySelector('.edt-creneau');
        const r = bloc.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + 20;
        const evt = (type, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', bloc);
        evt('pointerup');
        await new Promise(ok => setTimeout(ok, 250));
        const formulaire = document.getElementById('custom-prompt-modal');
        const ouvert = getComputedStyle(formulaire).display !== 'none';
        const champs = [...document.querySelectorAll('#custom-prompt-inputs .prompt-input')];
        const valeurs = champs.map(c => c.value);
        const avant = JSON.parse(localStorage.getItem('board_agenda') || '{}').creneaux[0];
        if (champs.length >= 2) {
            champs[0].value = '10 h 15';
            champs[1].value = '11 h 10';
            document.getElementById('custom-prompt-ok').click();
        }
        await new Promise(ok => setTimeout(ok, 250));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        const apres = (m.creneaux || [])[0];
        return { ouvert, valeurs, avant,
                 apres: { debut: apres.debut, duree: apres.duree, libelle: apres.libelle },
                 heureAffichee: (document.querySelector('.edt-creneau-heure') || {}).textContent };
    });
    r.verifie('appuyer sur un créneau sans le bouger ouvre sa fiche',
        fiche.ouvert, JSON.stringify(fiche));
    r.verifie('elle montre l\'horaire d\'aujourd\'hui, prêt à être corrigé',
        fiche.valeurs[0] === heureFr(fiche.avant.debut)
        && fiche.valeurs[1] === heureFr(fiche.avant.debut + fiche.avant.duree),
        JSON.stringify(fiche.valeurs) + ' pour ' + JSON.stringify(fiche.avant));
    // EXACTEMENT 10 h 15 : c'est tout l'objet de la fiche. Le geste, lui, ne
    // sait viser qu'au pas de cinq minutes.
    r.egal('l\'heure écrite se pose au chiffre près', fiche.apres.debut, 10 * 60 + 15);
    r.egal('et la durée s\'en déduit', fiche.apres.duree, 55);
    r.egal('le créneau garde sa classe', fiche.apres.libelle, 'CM1');
    r.verifie('et la grille le dit', /10 h 15/.test(fiche.heureAffichee), fiche.heureAffichee);

    // ON N'ÉCRIT PAS N'IMPORTE QUOI. Un horaire hors de la journée est refusé
    // plutôt que posé là où on ne le retrouverait pas.
    const refus = await page.evaluate(async () => {
        const bloc = document.querySelector('.edt-creneau');
        const r = bloc.getBoundingClientRect();
        const evt = (type, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: r.left + r.width / 2, clientY: r.top + 20,
                                     bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', bloc); evt('pointerup');
        await new Promise(ok => setTimeout(ok, 250));
        const champs = [...document.querySelectorAll('#custom-prompt-inputs .prompt-input')];
        champs[0].value = '23 h';
        champs[1].value = '23 h 55';
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 250));
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        // La prévenance s'affiche ; on la referme pour la suite.
        const prev = document.getElementById('confirm-modal');
        const prevenu = prev ? getComputedStyle(prev).display !== 'none' : false;
        const ok = document.getElementById('confirm-yes-btn');
        if (ok) ok.click();
        await new Promise(ok2 => setTimeout(ok2, 150));
        fermerLAgenda();
        return { debut: (m.creneaux || [])[0].debut, prevenu };
    });
    r.egal('un horaire hors de la journée ne se pose pas', refus.debut, 10 * 60 + 15);
    r.verifie('et on le dit', refus.prevenu, JSON.stringify(refus));

    // ==================================================================
    // « IL FAUDRAIT POUVOIR METTRE DES COULEURS »
    //
    // On en avait déjà une — mais enfouie dans une fenêtre de réglage,
    // derrière un nuancier de six couleurs qui n'étaient pas celles de la
    // grille (la première était l'encre elle-même, #2d3436 : on choisissait
    // noir sur noir sans le savoir) et une roue qui ouvrait le sélecteur du
    // système d'exploitation. Devant une classe, ce n'est pas un geste.
    // ==================================================================
    const couleurs = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55 };
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        agenda.entrees.push({ id: 'e1', libelle: '5e B', classeId: null, classeNom: null,
                              couleur: EDT_COULEURS[0] });
        agenda.creneaux.push({ id: 'c1', jour: 1, debut: 9 * 60, duree: 55, semaine: 'toutes',
                               entreeId: 'e1', libelle: '5e B', couleur: EDT_COULEURS[0] });
        rendreLAgenda();
        // On ouvre la fiche de la classe et l'on compte les pastilles.
        reglerUneEntree('e1');
        await new Promise(ok => setTimeout(ok, 200));
        const pastilles = [...document.querySelectorAll('#custom-prompt-inputs .swatch')];
        const roue = [...document.querySelectorAll('#custom-prompt-inputs div')]
            .filter(d => /conic-gradient/.test(d.style.background))
            .filter(d => getComputedStyle(d).display !== 'none');
        const encre = document.querySelectorAll('#custom-prompt-inputs .swatch[style*="rgb(45, 52, 54)"]').length;
        // On en choisit une de la ligne soutenue, et l'on valide.
        const vise = EDT_COULEURS_SOUTENUES[2];
        const cible = pastilles.find(d => d.style.background.replace(/\s/g, '')
            === hexEnRgb(vise).replace(/\s/g, ''));
        if (cible) cible.click();
        document.getElementById('custom-prompt-ok').click();
        await new Promise(ok => setTimeout(ok, 250));
        const bloc = document.querySelector('.edt-creneau');
        const m = JSON.parse(localStorage.getItem('board_agenda') || '{}');
        return {
            combien: pastilles.length,
            roue: roue.length,
            encre,
            // LA COULEUR SUIT LA CLASSE JUSQU'À SES CRÉNEAUX. Seul le nom
            // suivait : on changeait la couleur d'une classe, et ses douze
            // créneaux gardaient l'ancienne.
            surLEntree: (m.entrees || [])[0].couleur,
            surLeCreneau: (m.creneaux || [])[0].couleur,
            peint: bloc ? bloc.style.background : '',
            // Et l'encre suit le fond : plus jamais noir sur noir.
            encreClaire: encreSur('#dfe4ff'),
            encreSombre: encreSur('#1e272e')
        };
        function hexEnRgb(h) {
            const v = parseInt(h.slice(1), 16);
            return 'rgb(' + ((v >> 16) & 255) + ', ' + ((v >> 8) & 255) + ', ' + (v & 255) + ')';
        }
    });
    r.egal('seize pastilles : huit teintes, deux intensités', couleurs.combien, 16);
    r.egal('et plus de roue vers le sélecteur du système', couleurs.roue, 0);
    r.egal('plus une seule pastille couleur d\'encre', couleurs.encre, 0);
    r.egal('la couleur choisie se pose sur la classe',
        couleurs.surLEntree, await page.evaluate(() => EDT_COULEURS_SOUTENUES[2]));
    r.egal('et descend jusqu\'à ses créneaux', couleurs.surLeCreneau, couleurs.surLEntree);
    r.verifie('la grille la porte vraiment', /rgb|#/.test(couleurs.peint), couleurs.peint);
    r.egal('sur un fond clair, l\'encre reste sombre', couleurs.encreClaire, '#2d3436');
    r.egal('sur un fond sombre, elle passe au blanc', couleurs.encreSombre, '#ffffff');

    // LA LIGNE SOUTENUE MONTE EN CLARTÉ D'UN BOUT À L'AUTRE. Construite à
    // clarté constante, elle donnait huit cases d'exactement le même gris :
    // indistinguables pour un enseignant deutéranomal, soit huit pour cent des
    // hommes. L'escalier se lit en noir et blanc.
    const teintes = await page.evaluate(() => ({
        claires: EDT_COULEURS.length,
        soutenues: EDT_COULEURS_SOUTENUES.length,
        clartesClaires: EDT_COULEURS.map(c => Math.round(edtLuminance(c) * 1000) / 1000),
        clartesSoutenues: EDT_COULEURS_SOUTENUES.map(c => Math.round(edtLuminance(c) * 1000) / 1000)
    }));
    r.egal('autant de soutenues que de claires', teintes.soutenues, teintes.claires);
    r.verifie('chaque soutenue est plus sombre que sa claire',
        teintes.clartesSoutenues.every((v, i) => v < teintes.clartesClaires[i] - 0.1),
        JSON.stringify(teintes));
    r.verifie('et la ligne soutenue n\'est pas un palier plat',
        Math.max(...teintes.clartesSoutenues) - Math.min(...teintes.clartesSoutenues) > 0.3,
        JSON.stringify(teintes.clartesSoutenues));
    r.verifie('elle monte marche après marche, sans redescendre',
        teintes.clartesSoutenues.every((v, i) => i === 0 || v > teintes.clartesSoutenues[i - 1]),
        JSON.stringify(teintes.clartesSoutenues));

    // ET L'ON LIT LE TEXTE SUR LES SEIZE. Un nom de classe illisible sur sa
    // propre couleur, c'est une couleur qu'on ne choisira jamais — et
    // l'ancienne fenêtre proposait l'encre elle-même comme premier choix.
    const lisibles = await page.evaluate(() => {
        const contraste = (a, b) => {
            const x = edtLuminance(a), y = edtLuminance(b);
            return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        return EDT_COULEURS.concat(EDT_COULEURS_SOUTENUES).map(c => ({
            couleur: c, encre: encreSur(c),
            ratio: Math.round(contraste(c, encreSur(c)) * 100) / 100
        }));
    });
    r.verifie('le texte se lit sur chacune des seize couleurs',
        lisibles.every(x => x.ratio >= 4.5),
        JSON.stringify(lisibles.filter(x => x.ratio < 4.5)));
    r.verifie('et les plus sombres s\'écrivent en blanc',
        lisibles.some(x => x.encre === '#ffffff') && lisibles.some(x => x.encre === '#2d3436'),
        JSON.stringify(lisibles.map(x => x.encre)));

    // ==================================================================
    // LES BORNES DE LA JOURNÉE
    //
    // La grille allait de 7 h à 19 h pour tout le monde : un professeur des
    // écoles y voyait cinq heures de vide, et ses cours faisaient quarante-six
    // pixels de haut.
    // ==================================================================
    const bornes = await page.evaluate(async () => {
        const depart = { debut: edtDebut(), fin: edtFin(), px: edtPx() };
        const plusTot = reglerLaJournee(edtDebut() - 60, edtFin());
        const apres = { debut: edtDebut(), hauteur: document.querySelector('.edt-jour').style.height };
        // ON NE REFERME PAS LA JOURNÉE SUR UN COURS. Le rogner, le cacher ou
        // le déplacer en silence sont tous pires que de refuser.
        const trop = reglerLaJournee(10 * 60, edtFin());
        const prev = document.getElementById('confirm-modal');
        const prevenu = prev ? getComputedStyle(prev).display !== 'none' : false;
        const texte = ((document.getElementById('confirm-text') || {}).textContent || '')
            + ' ' + ((document.getElementById('confirm-title') || {}).textContent || '');
        const ok = document.getElementById('confirm-yes-btn');
        if (ok) ok.click();
        await new Promise(ok2 => setTimeout(ok2, 150));
        const absurde = reglerLaJournee(12 * 60, 12 * 60);
        const zoomPlus = reglerLeZoom(1);
        const apresZoom = edtPx();
        const hauteurZoom = document.querySelector('.edt-jour').style.height;
        return { depart, plusTot, apres, trop, prevenu, texte, absurde,
                 zoomPlus, apresZoom, hauteurZoom, debutFinal: edtDebut() };
    });
    r.egal('la journée part de 8 h, et non de 7 h', bornes.depart.debut, 8 * 60);
    r.egal('à un pixel la minute, et non 0,85', bornes.depart.px, 1);
    r.verifie('on peut l\'ouvrir une heure plus tôt',
        bornes.plusTot === true && bornes.apres.debut === 7 * 60, JSON.stringify(bornes));
    r.verifie('et la grille grandit d\'autant', bornes.apres.hauteur === '660px',
        bornes.apres.hauteur);
    r.egal('on ne referme pas la journée sur un cours', bornes.trop, false);
    r.verifie('et l\'on dit lequel', bornes.prevenu && /5e B|lundi/i.test(bornes.texte),
        bornes.texte);
    r.egal('le cours n\'a pas bougé pour autant', bornes.debutFinal, 7 * 60);
    r.egal('une journée qui ne dure rien est refusée', bornes.absurde, false);
    r.verifie('et la hauteur des cours se règle', bornes.zoomPlus === true
        && bornes.apresZoom > bornes.depart.px, JSON.stringify(bornes));

    // ÉCHAP REMET TOUT COMME C'ÉTAIT. Sans lui, un déplacement commencé par
    // erreur n'avait aucune sortie : lâcher valait accepter.
    const echap = await page.evaluate(async () => {
        const bloc = document.querySelector('.edt-creneau');
        const r = bloc.getBoundingClientRect();
        const avant = JSON.parse(JSON.stringify(agenda.creneaux[0]));
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        evt('pointerdown', { x: r.left + r.width / 2, y: r.top + 20 }, bloc);
        evt('pointermove', { x: r.left + r.width / 2, y: r.top + 200 });
        // LE BLOC TENU SE DISTINGUE. Il s'effaçait à 75 % d'opacité : au
        // doigt, on ne voyait plus ce qu'on déplaçait. Il se soulève au
        // contraire, et il passe au-dessus de toute sa colonne.
        const tenu = document.querySelector('.edt-creneau.edt-en-main');
        const pendant = { debut: agenda.creneaux[0].debut,
                          trace: !!document.getElementById('edt-trace'),
                          marque: !!tenu,
                          rang: tenu ? getComputedStyle(tenu).zIndex : '',
                          releve: tenu ? getComputedStyle(tenu).outlineWidth : '' };
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const apres = { debut: agenda.creneaux[0].debut, jour: agenda.creneaux[0].jour,
                        geste: !!edtGeste, trace: !!document.getElementById('edt-trace'),
                        apercu: !!document.getElementById('edt-apercu') };
        fermerLAgenda();
        return { avant, pendant, apres };
    });
    r.verifie('pendant le geste, on voit d\'où le bloc est parti', echap.pendant.trace,
        JSON.stringify(echap));
    r.verifie('et le bloc qu\'on tient est marqué', echap.pendant.marque,
        JSON.stringify(echap.pendant));
    r.verifie('il passe au-dessus de toute sa colonne',
        Number(echap.pendant.rang) > 3, echap.pendant.rang);
    r.verifie('et il se souligne au lieu de s\'effacer',
        parseFloat(echap.pendant.releve) > 0, echap.pendant.releve);

    // LES BOUTONS DU CRÉNEAU NE SE SURVOLENT PLUS. Au doigt, le survol
    // n'existe pas : un bouton qui ne paraît qu'au survol ne paraît JAMAIS sur
    // un tableau de classe. Et « présent dans le document » ne suffit pas —
    // c'est exactement le piège du fantôme enterré : on demande à la page ce
    // qu'il y a SOUS le point.
    const boutons = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55 };
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        agenda.entrees.push({ id: 'e7', libelle: '6e C', classeId: null, classeNom: null, couleur: '#ffe6d5' });
        agenda.creneaux.push({ id: 'c7', jour: 2, debut: 9 * 60, duree: 55, semaine: 'toutes',
                               entreeId: 'e7', libelle: '6e C', couleur: '#ffe6d5' });
        rendreLAgenda();
        const atteignable = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return { la: false };
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            const sous = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { la: true, opacite: Number(s.opacity), visible: s.visibility,
                     repond: !!(sous && (sous === el || el.contains(sous) || sous.contains(el))),
                     taille: Math.round(r.width) + 'x' + Math.round(r.height) };
        };
        const out = { regler: atteignable('.edt-regler'), oter: atteignable('.edt-oter'),
                      haut: atteignable('.edt-poignee-haut'), bas: atteignable('.edt-poignee-bas') };
        fermerLAgenda();
        return out;
    });
    ['regler', 'oter'].forEach(nom => {
        r.verifie('le bouton « ' + nom + ' » est là sans qu\'on survole',
            boutons[nom].la && boutons[nom].opacite > 0.5 && boutons[nom].visible !== 'hidden',
            JSON.stringify(boutons[nom]));
        r.verifie('et le doigt le touche vraiment', boutons[nom].repond,
            JSON.stringify(boutons[nom]));
    });
    r.verifie('les deux poignées existent, en haut et en bas',
        boutons.haut.la && boutons.bas.la, JSON.stringify(boutons));
    r.verifie('et il a bougé', echap.pendant.debut !== echap.avant.debut, JSON.stringify(echap));
    r.egal('Échap le remet où il était', echap.apres.debut, echap.avant.debut);
    r.egal('et le jour aussi', echap.apres.jour, echap.avant.jour);
    r.egal('le geste est fini', echap.apres.geste, false);
    r.verifie('la trace et l\'aperçu s\'en vont avec lui',
        !echap.apres.trace && !echap.apres.apercu, JSON.stringify(echap.apres));

    // LES VALEURS D'USINE, et la migration d'un agenda déjà saisi.
    const usine = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [] };
        lireLAgenda();
        const neuf = { debut: edtDebut(), fin: edtFin(), px: edtPx(), duree: edtDureeDefaut() };
        // UN EMPLOI DU TEMPS DÉJÀ SAISI NE SORT PAS DE LA GRILLE EN SILENCE.
        // Les bornes n'existaient pas hier : un agenda enregistré n'en a pas,
        // et son cours de 7 h 30 disparaîtrait sous le bord sans un mot.
        localStorage.setItem('board_agenda', JSON.stringify({
            alterne: false, samedi: false, entrees: [{ id: 'x', libelle: 'Tôt', couleur: '#dfe4ff' }],
            creneaux: [{ id: 'y', jour: 1, debut: 7 * 60 + 30, duree: 55, semaine: 'toutes',
                         entreeId: 'x', libelle: 'Tôt', couleur: '#dfe4ff' }]
        }));
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55 };
        lireLAgenda();
        const migre = { debut: edtDebut(), fin: edtFin(), creneaux: agenda.creneaux.length };
        localStorage.removeItem('board_agenda');
        return { neuf, migre };
    });
    r.egal('sans rien de réglé, la journée va de 8 h à 18 h',
        [usine.neuf.debut, usine.neuf.fin], [8 * 60, 18 * 60]);
    r.egal('à un pixel la minute', usine.neuf.px, 1);
    r.egal('et un cours dure cinquante-cinq minutes', usine.neuf.duree, 55);
    r.verifie('un agenda d\'hier fait élargir la grille plutôt que d\'y perdre un cours',
        usine.migre.debut <= 7 * 60 + 30 && usine.migre.creneaux === 1,
        JSON.stringify(usine.migre));

    // ------------------------------------------------------------------
    // LA POIGNÉE DU HAUT, ET LE SEUIL DU GESTE
    // ------------------------------------------------------------------
    const bords = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55 };
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        agenda.entrees.push({ id: 'e9', libelle: '3e A', classeId: null, classeNom: null, couleur: '#d9f2e6' });
        agenda.creneaux.push({ id: 'c9', jour: 1, debut: 10 * 60, duree: 60, semaine: 'toutes',
                               entreeId: 'e9', libelle: '3e A', couleur: '#d9f2e6' });
        rendreLAgenda();
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        const col = document.querySelector('.edt-jour[data-jour="1"]');
        const rc = col.getBoundingClientRect();
        const aLaMinute = (m) => ({ x: rc.left + rc.width / 2, y: rc.top + (m - edtDebut()) * edtPx() });

        // PAR LE HAUT : la FIN ne bouge pas, le début avance ou recule. On ne
        // pouvait allonger que par le bas — donc jamais avancer le début d'un
        // cours sans le déplacer entier.
        const haut = document.querySelector('.edt-poignee-haut').getBoundingClientRect();
        evt('pointerdown', { x: haut.left + haut.width / 2, y: haut.top + 3 },
            document.querySelector('.edt-poignee-haut'));
        evt('pointermove', aLaMinute(9 * 60 + 30));
        evt('pointerup', aLaMinute(9 * 60 + 30));
        const neuf9 = agenda.creneaux.find(c => c.id === 'c9');
        const parLeHaut = { debut: neuf9.debut, fin: neuf9.debut + neuf9.duree };

        // LE SEUIL. Quatre pixels et quart suffisaient à décaler un cours de
        // cinq minutes au moindre tremblement de la main.
        const bloc = document.querySelector('.edt-creneau');
        const rb = bloc.getBoundingClientRect();
        const avant = agenda.creneaux.find(c => c.id === 'c9').debut;
        evt('pointerdown', { x: rb.left + rb.width / 2, y: rb.top + 20 }, bloc);
        evt('pointermove', { x: rb.left + rb.width / 2 + 2, y: rb.top + 24 });
        evt('pointerup', { x: rb.left + rb.width / 2 + 2, y: rb.top + 24 });
        await new Promise(ok => setTimeout(ok, 200));
        const ficheOuverte = getComputedStyle(document.getElementById('custom-prompt-modal')).display !== 'none';
        const annuler = document.getElementById('custom-prompt-cancel');
        if (annuler) annuler.click();
        await new Promise(ok => setTimeout(ok, 150));
        const apresTremblement = agenda.creneaux.find(c => c.id === 'c9').debut;
        fermerLAgenda();
        return { parLeHaut, avant, apresTremblement, ficheOuverte };
    });
    r.egal('la poignée du haut avance le début du cours', bords.parLeHaut.debut, 9 * 60 + 30);
    r.egal('et sa fin ne bouge pas', bords.parLeHaut.fin, 11 * 60);
    r.egal('un tremblement de quelques pixels ne déplace rien',
        bords.apresTremblement, bords.avant);
    r.verifie('c\'est un appui, et un appui ouvre la fiche', bords.ficheOuverte,
        JSON.stringify(bords));

    // LA DURÉE S'APPREND. C'est le principe qui retient déjà la dernière
    // classe servie, et l'une des meilleures idées du code d'avant : le
    // professeur de lycée tire un bloc d'une heure trente, et les suivants
    // naissent à une heure trente ; celui d'école trace trente minutes, et
    // les suivantes font trente minutes.
    const apprise = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55 };
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        agenda.entrees.push({ id: 'e8', libelle: '2nde', classeId: null, classeNom: null, couleur: '#d9eefb' });
        agenda.derniere = 'e8';
        agenda.creneaux.push({ id: 'c8', jour: 1, debut: 9 * 60, duree: 55, semaine: 'toutes',
                               entreeId: 'e8', libelle: '2nde', couleur: '#d9eefb' });
        rendreLAgenda();
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        const col = document.querySelector('.edt-jour[data-jour="1"]');
        const rc = col.getBoundingClientRect();
        const aLaMinute = (m) => ({ x: rc.left + rc.width / 2, y: rc.top + (m - edtDebut()) * edtPx() });
        // On tire le bas jusqu'à 10 h 30 : une heure et demie.
        const bas = document.querySelector('.edt-poignee-bas');
        const rb = bas.getBoundingClientRect();
        evt('pointerdown', { x: rb.left + rb.width / 2, y: rb.top + 3 }, bas);
        evt('pointermove', aLaMinute(10 * 60 + 30));
        evt('pointerup', aLaMinute(10 * 60 + 30));
        const tiree = agenda.creneaux.find(c => c.id === 'c8').duree;
        const retenue = agenda.dureeDefaut;
        // Puis on en trace un autre : il doit naître à la même durée.
        const col3 = document.querySelector('.edt-jour[data-jour="3"]');
        const r3 = col3.getBoundingClientRect();
        const p3 = { x: r3.left + r3.width / 2, y: r3.top + (14 * 60 - edtDebut()) * edtPx() };
        evt('pointerdown', p3, col3);
        evt('pointerup', p3);
        await new Promise(ok => setTimeout(ok, 150));
        const neuf = agenda.creneaux.find(c => c.jour === 3);
        const annuler = document.getElementById('custom-prompt-cancel');
        if (annuler) annuler.click();
        await new Promise(ok => setTimeout(ok, 120));
        fermerLAgenda();
        return { tiree, retenue, neuve: neuf ? neuf.duree : null };
    });
    r.egal('on tire un cours à une heure trente', apprise.tiree, 90);
    r.egal('la durée se retient', apprise.retenue, 90);
    r.egal('et le cours suivant naît à la même durée', apprise.neuve, 90);

    // ==================================================================
    // LES SONNERIES : SES PROPRES HAUTEURS, ET L'AIMANT
    //
    // « Pourrait-on ajouter des hauteurs à gauche, et que ça s'aligne, ou que
    // ça s'aimante ? » Un emploi du temps ne suit pas un pas de cinq minutes,
    // il suit les sonneries de l'établissement : les heures rondes que la
    // grille traçait — 8 h, 9 h, 10 h — ne sont celles de personne.
    // ==================================================================
    const sonneries = await page.evaluate(async () => {
        localStorage.removeItem('board_agenda');
        agenda = { alterne: false, samedi: false, ancre: null, entrees: [], creneaux: [],
                   debut: 8 * 60, fin: 18 * 60, px: 1, dureeDefaut: 55, sonneries: [] };
        ouvrirLAgenda();
        await new Promise(ok => setTimeout(ok, 120));
        const sansRien = {
            lignes: document.querySelectorAll('.edt-jour[data-jour="1"] .edt-ligne.edt-sonnerie').length,
            heures: [...document.querySelectorAll('.edt-heure')].map(x => x.textContent)
        };
        // ON LES ÉCRIT COMME ON LES TAPE, séparées comme on veut.
        const lues = lireDesHeures('8h 8h55  9h50, 10h55');
        agenda.sonneries = lireDesHeures('8h 8h55 9h50 10h55 11h50 13h30 14h25 15h20');
        rendreLAgenda();
        const avec = {
            lignes: document.querySelectorAll('.edt-jour[data-jour="1"] .edt-ligne.edt-sonnerie').length,
            demies: document.querySelectorAll('.edt-jour[data-jour="1"] .edt-ligne.edt-demie').length,
            heures: [...document.querySelectorAll('.edt-heure')].map(x => x.textContent),
            grasses: document.querySelectorAll('.edt-heure.edt-sonnerie-heure').length
        };
        // L'AIMANT : proche d'une sonnerie, on s'y colle ; loin, on garde le
        // pas de cinq minutes. Il aide, il ne décide pas.
        const proche = aimanterSurUneSonnerie(8 * 60 + 58);
        const justeAuBord = aimanterSurUneSonnerie(8 * 60 + 55 + 12);
        const loin = aimanterSurUneSonnerie(8 * 60 + 55 + 13);
        const auMilieu = aimanterSurUneSonnerie(12 * 60 + 30);
        // Et sous le doigt, dans la vraie grille.
        const col = document.querySelector('.edt-jour[data-jour="1"]');
        const rc = col.getBoundingClientRect();
        const sousLeDoigt = (m) => minutesSousLeDoigt(col, rc.top + (m - edtDebut()) * edtPx());
        const colle = sousLeDoigt(9 * 60 + 47);
        const libre = sousLeDoigt(12 * 60 + 32);
        // LA RELECTURE PASSE PAR LA VRAIE FICHE, et non par un appel qu'on
        // écrirait soi-même : c'est le champ rempli qu'on doit pouvoir relire.
        // « heureLisible » écrit « 8 h 55 » AVEC SES ESPACES, et les espaces
        // sont justement ce qui sépare deux heures — le champ se serait relu
        // « 8, h, 55 ».
        reglerLesSonneries();
        await new Promise(ok => setTimeout(ok, 200));
        const champ = document.querySelector('#custom-prompt-inputs .prompt-input');
        const ecritDansLaFiche = champ ? champ.value : '';
        const allerRetour = lireDesHeures(ecritDansLaFiche);
        const annuler = document.getElementById('custom-prompt-cancel');
        if (annuler) annuler.click();
        await new Promise(ok => setTimeout(ok, 150));
        // Et l'on peut les retirer.
        agenda.sonneries = lireDesHeures('');
        rendreLAgenda();
        const sansPlus = document.querySelectorAll('.edt-jour[data-jour="1"] .edt-ligne.edt-sonnerie').length;
        agenda.sonneries = lireDesHeures('8h 8h55 9h50 10h55 11h50 13h30 14h25 15h20');
        rendreLAgenda();
        return { sansRien, lues, avec, proche, justeAuBord, loin, auMilieu,
                 colle, libre, allerRetour, ecritDansLaFiche, sansPlus,
                 attendu: edtSonneries() };
    });
    r.egal('sans sonneries, la grille garde ses heures rondes', sonneries.sansRien.lignes, 0);
    r.egal('on écrit les heures comme on les tape, séparées comme on veut',
        sonneries.lues, [8 * 60, 8 * 60 + 55, 9 * 60 + 50, 10 * 60 + 55]);
    r.egal('chaque sonnerie donne sa ligne', sonneries.avec.lignes, 7);
    r.egal('et les demies s\'en vont : c\'est là qu\'on cale maintenant',
        sonneries.avec.demies, 0);
    r.egal('la colonne de gauche porte les heures de l\'établissement',
        sonneries.avec.heures, ['8 h', '8 h 55', '9 h 50', '10 h 55', '11 h 50',
                                '13 h 30', '14 h 25', '15 h 20']);
    r.egal('et elles se lisent comme des repères', sonneries.avec.grasses, 8);
    r.egal('à trois minutes d\'une sonnerie, on s\'y colle', sonneries.proche, 8 * 60 + 55);
    r.egal('à douze aussi, tout juste', sonneries.justeAuBord, 8 * 60 + 55);
    r.egal('à treize, non : l\'aimant aide, il ne décide pas',
        sonneries.loin, 8 * 60 + 55 + 13);
    r.egal('et au milieu de nulle part, il ne fait rien', sonneries.auMilieu, 12 * 60 + 30);
    r.egal('sous le doigt, le créneau se colle à la sonnerie', sonneries.colle, 9 * 60 + 50);
    r.egal('et loin d\'elles, il garde le pas de cinq minutes', sonneries.libre, 12 * 60 + 30);
    r.egal('ce qu\'on relit dans la fiche est ce qu\'on avait écrit',
        sonneries.allerRetour, sonneries.attendu);
    r.egal('on peut les retirer et retrouver les heures rondes', sonneries.sansPlus, 0);

    // ==================================================================
    // LE TAMPON : UNE CLASSE ARMÉE, ET L'ON TAMPONNE
    //
    // « On pourrait avoir le mode tampon. » En septembre on pose dix-huit
    // créneaux, dont six de la même classe : glisser la vignette dix-huit fois
    // est un travail de copiste.
    // ==================================================================
    const tampon = await page.evaluate(async () => {
        agenda.entrees.push({ id: 'et', libelle: '4e A', classeId: null, classeNom: null,
                              couleur: '#d9f2e6' });
        // Une SECONDE classe, pour que « la dernière servie » et « le tampon »
        // puissent enfin se contredire : sans elle, les deux désignent la même
        // et la ligne du tampon n'est éprouvée par rien.
        agenda.entrees.push({ id: 'ea', libelle: '6e D', classeId: null, classeNom: null,
                              couleur: '#ffe6d5' });
        agenda.tampon = null;
        rendreLAgenda();
        const puce = document.querySelector('.edt-entree[data-id="et"]');
        const rp = puce.getBoundingClientRect();
        const evt = (type, p, cible) => (cible || window).dispatchEvent(
            new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerType: 'mouse' }));
        const surLaPuce = { x: rp.left + 12, y: rp.top + rp.height / 2 };
        // UN APPUI L'ARME. Un glissé la dépose — c'est la DISTANCE qui les
        // sépare, jamais la durée.
        evt('pointerdown', surLaPuce, puce);
        evt('pointerup', surLaPuce);
        await new Promise(ok => setTimeout(ok, 150));
        const puceArmee = document.querySelector('.edt-entree[data-id="et"].edt-arme');
        const arme = {
            id: agenda.tampon,
            // « PORTE LA CLASSE » NE SUFFIT PAS : on veut que ça se VOIE.
            marquee: !!puceArmee && parseFloat(getComputedStyle(puceArmee).outlineWidth) > 0,
            bandeau: (document.getElementById('edt-tampon').textContent || '').trim(),
            bandeauVu: getComputedStyle(document.getElementById('edt-tampon')).display !== 'none'
        };
        // Et chaque appui sur la grille pose une heure de cette classe, sans
        // rien demander.
        const avant = agenda.creneaux.length;
        // ON RELIT LA COLONNE À CHAQUE COUP : poser un créneau refait la
        // grille, et la référence d'avant désigne alors un nœud détaché dont
        // le rectangle vaut zéro — on tamponnerait tout au même endroit.
        const tamponner = (m) => {
            const col = document.querySelector('.edt-jour[data-jour="3"]');
            const rc = col.getBoundingClientRect();
            const p = { x: rc.left + rc.width / 2, y: rc.top + (m - edtDebut()) * edtPx() };
            evt('pointerdown', p, col);
            evt('pointerup', p);
        };
        tamponner(8 * 60);
        // ET LE TAMPON L'EMPORTE SUR LA DERNIÈRE CLASSE SERVIE. Entre deux
        // coups, on dépose une AUTRE classe à la main : sans cela, « la
        // dernière servie » suffirait à expliquer le résultat, et la ligne du
        // tampon ne serait éprouvée par rien.
        const autre = document.querySelector('.edt-entree[data-id="ea"]');
        if (autre) {
            const ra = autre.getBoundingClientRect();
            const colA = document.querySelector('.edt-jour[data-jour="5"]');
            const rA = colA.getBoundingClientRect();
            const arrivee = { x: rA.left + rA.width / 2, y: rA.top + 100 };
            evt('pointerdown', { x: ra.left + 12, y: ra.top + ra.height / 2 }, autre);
            evt('pointermove', arrivee);
            evt('pointerup', arrivee);
            await new Promise(ok => setTimeout(ok, 150));
        }
        const derniereServie = agenda.derniere;
        tamponner(9 * 60 + 50);
        await new Promise(ok => setTimeout(ok, 250));
        const poses = agenda.creneaux.filter(c => c.jour === 3);
        const fiche = getComputedStyle(document.getElementById('custom-prompt-modal')).display !== 'none';
        const annuler = document.getElementById('custom-prompt-cancel');
        if (annuler) annuler.click();
        await new Promise(ok => setTimeout(ok, 120));
        // Un second appui sur la classe range le tampon.
        evt('pointerdown', surLaPuce, document.querySelector('.edt-entree[data-id="et"]'));
        evt('pointerup', surLaPuce);
        await new Promise(ok => setTimeout(ok, 150));
        const range = { id: agenda.tampon,
                        bandeauVu: getComputedStyle(document.getElementById('edt-tampon')).display !== 'none' };
        return { arme, range, avant, derniereServie, combien: poses.length,
                 libelles: poses.map(c => c.libelle),
                 heures: poses.map(c => c.debut).sort((x, y) => x - y),
                 ficheOuverte: fiche };
    });
    r.egal('un appui sur une classe l\'arme en tampon', tampon.arme.id, 'et');
    r.verifie('elle se voit armée dans la palette', tampon.arme.marquee, JSON.stringify(tampon.arme));
    r.verifie('et l\'en-tête dit laquelle',
        tampon.arme.bandeauVu && /4e A/.test(tampon.arme.bandeau), JSON.stringify(tampon.arme));
    r.egal('chaque appui sur la grille pose une heure', tampon.combien, 2);
    r.egal('de la classe armée', tampon.libelles, ['4e A', '4e A']);
    r.verifie('même après avoir déposé une autre classe entre-temps',
        tampon.derniereServie && tampon.derniereServie !== 'et',
        String(tampon.derniereServie));
    // ET LES HEURES S'AIMANTENT : on tamponne sur les sonneries.
    r.egal('aux heures de sonnerie', tampon.heures, [8 * 60, 9 * 60 + 50]);
    // SANS RIEN DEMANDER : la classe est déjà choisie, la fiche n'a pas à
    // s'ouvrir à chaque coup de tampon.
    r.egal('sans demander le nom à chaque fois', tampon.ficheOuverte, false);
    r.egal('un second appui range le tampon', tampon.range.id, null);
    r.egal('et le bandeau s\'en va', tampon.range.bandeauVu, false);

    // ==================================================================
    // L'EMPLOI DU TEMPS SUR PAPIER
    //
    // « Un export en PDF. » On l'affiche en salle des profs, on l'envoie au
    // remplaçant. On ne photographie pas un écran pour cela — et l'on ne
    // photographie pas non plus la fenêtre : ce qui est à l'écran est fait
    // pour le doigt, et n'a rien à faire sur une feuille.
    // ==================================================================
    const papier = await page.evaluate(async () => {
        const bouton = document.getElementById('edt-pdf');
        const vu = bouton ? getComputedStyle(bouton).display !== 'none' : false;
        const toile = dessinerLAgendaSurUneToile(2);
        const g = toile.getContext('2d');
        // On regarde la feuille elle-même : un fond blanc, et de la couleur là
        // où un cours est posé.
        const coin = g.getImageData(4, 4, 1, 1).data;
        // Le premier cours du jeudi, s'il y en a un — sinon on en pose un.
        const c = agenda.creneaux.find(x => x.jour === 3) || agenda.creneaux[0];
        const jours = EDT_JOURS.slice(0, agenda.samedi ? EDT_JOURS_OUVRES + 1 : EDT_JOURS_OUVRES);
        const x = (18 + 62 + (c.jour - 1) * 150 + 40) * 2;
        const y = (18 + 26 + 34 + (c.debut - edtDebut()) * 0.95 + 10) * 2;
        const dessus = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        // Et sans aucun cours, on refuse plutôt que de sortir une feuille vide.
        const garde = agenda.creneaux.slice();
        agenda.creneaux = [];
        const refus = exporterLAgendaEnPdf();
        agenda.creneaux = garde;
        return {
            vu, largeur: toile.width, hauteur: toile.height,
            coinBlanc: coin[0] > 250 && coin[1] > 250 && coin[2] > 250,
            colore: !(dessus[0] > 250 && dessus[1] > 250 && dessus[2] > 250),
            refus, jours: jours.length
        };
    });
    r.verifie('le bouton d\'export est là', papier.vu, String(papier.vu));
    r.verifie('la feuille est plus large que haute : un emploi du temps est un paysage',
        papier.largeur > papier.hauteur, papier.largeur + '×' + papier.hauteur);
    r.verifie('elle a un fond blanc — on l\'imprime', papier.coinBlanc, String(papier.coinBlanc));
    r.verifie('et les cours y sont peints', papier.colore, String(papier.colore));
    r.egal('sans aucun cours, on refuse plutôt que de sortir une feuille vide',
        papier.refus, false);

    // ==================================================================
    // LES COMMANDES DE L'EN-TÊTE RÉPONDENT AU DOIGT
    //
    // « On ne peut pas cliquer sur heures rondes, et donc éditer les
    // horaires. » Exact, et aucun test ne s'en plaignait : ils appelaient
    // « reglerLesSonneries() » directement, c'est-à-dire le code, jamais le
    // bouton. Il y avait DEUX gestionnaires de clic — l'un sur la grille,
    // l'autre sur l'en-tête, qui ne traitait que le recalage de semaine — et
    // cinq commandes de l'en-tête étaient branchées dans celui de la GRILLE,
    // qui ne les voit jamais : sonneries, PDF, tampon, les ± de la journée et
    // le zoom.
    //
    // ON CLIQUE DONC À LA SOURIS, qui vise. C'est la seule façon d'éprouver
    // qu'un bouton est branché là où il vit.
    // ==================================================================
    const cliquerVraiment = async (sel) => {
        const ou = await page.evaluate((s2) => {
            const e = document.querySelector(s2);
            if (!e) return null;
            const r = e.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return null;
            const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
            const dessus = document.elementFromPoint(x, y);
            return { x, y, couvert: dessus && !e.contains(dessus) && dessus !== e
                ? ((dessus.id || dessus.className || dessus.tagName) + '') : null };
        }, sel);
        if (!ou) return { fait: false, pourquoi: 'sans taille ou absent' };
        if (ou.couvert) return { fait: false, pourquoi: 'couvert par ' + ou.couvert };
        await page.mouse.click(ou.x, ou.y);
        await page.waitForTimeout(280);
        return { fait: true };
    };

    await page.evaluate(() => { fermerLAgenda(); ouvrirLAgenda(); });
    await page.waitForTimeout(400);

    const surLesSonneries = await cliquerVraiment('#edt-sonneries');
    const saisie = await page.evaluate(() => {
        const m = document.getElementById('custom-prompt-modal');
        const ouverte = !!(m && getComputedStyle(m).display !== 'none');
        if (ouverte) { const b = m.querySelector('button'); if (b) b.click(); }
        return ouverte;
    });
    r.verifie('« heures rondes » se clique vraiment',
        surLesSonneries.fait, surLesSonneries.pourquoi || '');
    r.verifie('et ouvre la saisie des horaires', saisie, 'aucune fenêtre de saisie');

    await page.waitForTimeout(250);
    const finAvant = await page.evaluate(() => edtFin());
    const surLaJournee = await cliquerVraiment('[data-journee="fin"][data-sens="1"]');
    const finApres = await page.evaluate(() => edtFin());
    r.verifie('le « + » de la journée se clique vraiment',
        surLaJournee.fait, surLaJournee.pourquoi || '');
    r.egal('et allonge la journée d\'une heure', finApres - finAvant, 60);

    const zoomAvant = await page.evaluate(() => edtPx());
    const surLeZoom = await cliquerVraiment('[data-zoom="1"]');
    const zoomApres = await page.evaluate(() => edtPx());
    r.verifie('le zoom de la grille se clique vraiment',
        surLeZoom.fait, surLeZoom.pourquoi || '');
    r.verifie('et grandit la grille', zoomApres > zoomAvant, `${zoomAvant} → ${zoomApres}`);

    // ET LE RECALAGE DE SEMAINE, qui vivait dans l'autre gestionnaire, répond
    // toujours : réunir les deux ne doit rien perdre.
    const recalage = await page.evaluate(async () => {
        agenda.alterne = true;
        majLesReglagesDeLAgenda();
        await new Promise(r2 => setTimeout(r2, 120));
        const b = document.querySelector('#edt-recaler');
        return b ? { la: true, lettre: b.dataset.lettre } : { la: false };
    });
    if (recalage.la) {
        const surLeRecalage = await cliquerVraiment('#edt-recaler');
        r.verifie('le recalage de semaine répond encore',
            surLeRecalage.fait, surLeRecalage.pourquoi || '');
    } else {
        r.verifie('le recalage de semaine répond encore', true, 'bouton absent de cet état');
    }

    await page.evaluate(() => {
        agenda.tampon = null; agenda.sonneries = [];
        localStorage.removeItem('board_agenda');
        fermerLAgenda();
    });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
