// ÉCHAP REFERME CE QU'ON A OUVERT
//
// « Je veux une cohérence absolue. » Mesuré sur les quatre-vingt-sept outils :
// Échap refermait ce qu'ouvraient soixante-quatre d'entre eux, et SEIZE
// résistaient — les palettes de « Mains & comptage », de « Tuiles algébriques »,
// de « Réglettes », les constructeurs du graphique et du tableau de
// proportionnalité, les quatre Studios, la frise, les cartes. Chaque outil avait
// pensé, ou non, à écouter la touche : soixante-quatre décisions séparées pour un
// geste que tout le monde connaît, et seize culs-de-sac au hasard.
//
// LA RÈGLE EST DÉSORMAIS PARTAGÉE : Échap appuie sur la croix de la fenêtre de
// devant — sa propre croix, celle qui sait ce que « fermer » veut dire pour cet
// outil-là : rendre un tampon, arrêter un minuteur, ranger une télécommande.
//
// ET SEULEMENT SI ÉCHAP N'AVAIT RIEN D'AUTRE À FAIRE. La même touche quitte le
// mode laser, annule un tampon en attente, referme un menu, sort du plein
// écran. On prend donc une empreinte de ce qui est ouvert avant, on regarde
// après, et l'on ne ferme que si rien n'a bougé : UN GESTE, UNE CONSÉQUENCE.
// C'est pour cela qu'un outil qui arme un tampon demande deux Échap — le
// premier désarme, le second referme —, et c'est ce que ce chapitre vérifie.
//
// ET UNE QUESTION QU'IL FAUT RÉPONDRE NE S'ESCAMOTE PAS. « Reprendre la séance
// d'hier ? » n'a pas de « plus tard » : escamotée, elle laisse le tableau sans
// page. C'est le chapitre 06 qui le tient depuis longtemps — « la reprise ne
// s'escamote pas par mégarde » —, et c'est lui qui a rattrapé cette règle
// partagée le jour où elle est arrivée. On ne le redit pas ici ; on le dit là.
//
// L'EXCEPTION, ET ELLE EST ASSUMÉE : « Formules mathématiques » garde le curseur
// dans son champ de formule, et Échap appartient à qui écrit. Une fenêtre ne se
// referme pas sous les doigts de quelqu'un qui tape — on perdrait la formule. Sa
// croix, elle, est à sa place, et ce chapitre le vérifie aussi.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Ce qu'un outil a posé par-dessus la page et qui se voit VRAIMENT. Un voile
// dissous couvre l'écran sans rien montrer : il ne compte que s'il porte encore
// quelque chose de visible.
const CE_QUI_SE_VOIT = () => {
    const MEUBLES = ['plugins-grid', 'thumbnail-drawer', 'custom-bars-container',
                     'html-postits-container', 'demo-barre', 'demo-liste'];
    const noms = [];
    document.querySelectorAll('body > *').forEach(el => {
        if (MEUBLES.includes(el.id)) return;
        if (el.closest('#board, .toolbar, .drawer')) return;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return;
        if (s.position !== 'fixed' && s.position !== 'absolute') return;
        const b = el.getBoundingClientRect();
        if (b.width < 150 || b.height < 110) return;
        if (el.dataset.voileDissous === '1'
            && ![...el.children].some(c => c.getClientRects().length)) return;
        noms.push(el.id || (typeof el.className === 'string' ? el.className : '') || el.tagName);
    });
    return noms;
};

module.exports = async function (browser) {
    const r = creerRapport('Échap referme ce qu\'on a ouvert');
    const { page, context, erreurs } = await ouvrirApp(browser, {});

    const outils = await page.evaluate(() => {
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        return [...document.querySelectorAll('#plugins-grid .btn')].map((b, i) => ({
            i, nom: (b.dataset.pluginKey || b.getAttribute('data-tooltip') || b.title || '?').slice(0, 26)
        }));
    });

    const faireLePropre = () => page.evaluate(() => {
        document.querySelectorAll('body > *').forEach(el => {
            if (['plugins-grid', 'thumbnail-drawer', 'custom-bars-container',
                 'html-postits-container'].includes(el.id)) return;
            if (el.closest('#board, .toolbar, .drawer')) return;
            const s = getComputedStyle(el);
            if (s.display === 'none') return;
            if (s.position !== 'fixed' && s.position !== 'absolute') return;
            if (el.getBoundingClientRect().width < 150) return;
            el.style.display = 'none';
        });
        if (typeof setMode === 'function') setMode('pointer');
    });

    // L'EXCEPTION EST NOMMÉE, et son sort est vérifié plus bas.
    const AVEC_UN_CHAMP_DE_FORMULE = /Formules/i;

    const resistent = [], obeissent = [], deuxEchap = [], rienOuvert = [];
    for (const { i, nom } of outils) {
        await faireLePropre();
        await page.evaluate((k) => {
            const g = document.getElementById('plugins-grid');
            if (g) g.style.display = 'grid';
            [...document.querySelectorAll('#plugins-grid .btn')][k].click();
        }, i);
        await page.waitForTimeout(220);
        const avant = await page.evaluate(CE_QUI_SE_VOIT);
        if (!avant.length) { rienOuvert.push(nom); continue; }
        // On rend le focus avant d'appuyer : Échap dans un champ appartient au
        // champ, et ce n'est pas ce qu'on mesure ici.
        await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(220);
        let apres = await page.evaluate(CE_QUI_SE_VOIT);
        let deux = false;
        if (apres.length >= avant.length) {
            // Le premier Échap a peut-être désarmé un tampon : on redemande.
            deux = true;
            await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
            await page.keyboard.press('Escape');
            await page.waitForTimeout(220);
            apres = await page.evaluate(CE_QUI_SE_VOIT);
        }
        if (apres.length < avant.length) {
            (deux ? deuxEchap : obeissent).push(nom);
        } else if (AVEC_UN_CHAMP_DE_FORMULE.test(nom)) {
            deuxEchap.push(nom + ' (champ de formule : Échap est à lui)');
        } else {
            resistent.push(nom + ' [' + avant.join(', ').slice(0, 70) + ']');
        }
    }

    r.verifie('les quatre-vingt-sept outils ont été essayés',
        outils.length >= 80, String(outils.length));
    r.verifie('et la plupart ouvrent bien quelque chose à refermer',
        obeissent.length + deuxEchap.length >= 60,
        JSON.stringify({ unEchap: obeissent.length, deuxEchap: deuxEchap.length,
                         rien: rienOuvert.length, resistent: resistent.length }));
    r.egal('aucun outil ne résiste à Échap', resistent, []);

    // ------------------------------------------------------------------
    // UN GESTE, UNE CONSÉQUENCE
    // ------------------------------------------------------------------
    // Un outil qui arme un tampon : le premier Échap désarme et ne referme
    // RIEN — sinon la même touche ferait deux choses d'un coup, et l'on
    // perdrait la fenêtre en voulant seulement lâcher le tampon.
    const armant = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        if (typeof setMode === 'function') setMode('pointer');
        for (const b of [...document.querySelectorAll('#plugins-grid .btn')]) {
            document.querySelectorAll('body > *').forEach(el => {
                if (el.closest('#board, .toolbar, .drawer')) return;
                const s = getComputedStyle(el);
                if (s.display === 'none' || (s.position !== 'fixed' && s.position !== 'absolute')) return;
                if (el.getBoundingClientRect().width < 150) return;
                el.style.display = 'none';
            });
            if (typeof setMode === 'function') setMode('pointer');
            b.click();
            await attendre(220);
            const a = document.activeElement; if (a && a.blur) a.blur();
            // PAS LA BOÎTE DE RÉGLAGES DES TAMPONS : celle-là a son propre Échap
            // depuis longtemps, et il fait exactement une chose — « Annuler »,
            // qui referme la boîte ET rend la flèche, parce que c'est le même
            // geste. On cherche un outil qui arme un mode SANS boîte, pour
            // éprouver la règle partagée et non celle-là.
            const boite = document.getElementById('custom-prompt-modal');
            const boiteOuverte = boite && boite.getClientRects().length;
            // ET IL DOIT Y AVOIR UNE FENÊTRE À REFERMER : sept outils arment un
            // tampon sans rien ouvrir du tout — l'horloge aléatoire, le
            // tangram —, et l'on ne prouve rien sur une fenêtre absente.
            const aQuoiFermer = [...document.querySelectorAll('[data-equipee="1"]')]
                .some(f => f.getClientRects().length
                    && f.querySelector(':scope > .fen-tete .fen-fermer'));
            if (typeof mode !== 'undefined' && mode !== 'pointer' && !boiteOuverte && aQuoiFermer
                && !/Formules/i.test(b.getAttribute('data-tooltip') || b.title || '')) {
                return { nom: (b.getAttribute('data-tooltip') || b.title || '?').slice(0, 26),
                         mode, calques: window.__vu ? window.__vu() : null };
            }
        }
        return null;
    });
    if (armant) {
        const avant = await page.evaluate(CE_QUI_SE_VOIT);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const apres = await page.evaluate(CE_QUI_SE_VOIT);
        const modeApres = await page.evaluate(() => (typeof mode !== 'undefined') ? mode : '?');
        r.egal('le premier Échap rend la flèche', modeApres, 'pointer',
            'outil : ' + armant.nom + ', mode armé : ' + armant.mode);
        r.egal('et il ne referme pas la fenêtre en même temps', apres.length, avant.length,
            'outil : ' + armant.nom + ' — ' + JSON.stringify({ avant, apres }));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        r.verifie('c\'est le second qui referme',
            (await page.evaluate(CE_QUI_SE_VOIT)).length < avant.length,
            'outil : ' + armant.nom);
    } else {
        r.verifie('un outil qui arme un mode a bien été trouvé', false, 'aucun');
    }

    // ------------------------------------------------------------------
    // ÉCHAP NE FERME RIEN SOUS LES DOIGTS DE QUELQU'UN QUI ÉCRIT
    // ------------------------------------------------------------------
    await faireLePropre();
    const champ = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        for (const b of [...document.querySelectorAll('#plugins-grid .btn')]) {
            b.click();
            await attendre(220);
            const f = [...document.querySelectorAll('[data-equipee="1"]')]
                .find(x => x.getClientRects().length && x.querySelector('input[type="text"], textarea'));
            if (f) {
                const inp = f.querySelector('input[type="text"], textarea');
                inp.focus();
                return { nom: (b.getAttribute('data-tooltip') || b.title || '?').slice(0, 26),
                         focus: document.activeElement === inp };
            }
            document.querySelectorAll('body > *').forEach(el => {
                if (el.closest('#board, .toolbar, .drawer')) return;
                const s = getComputedStyle(el);
                if (s.display === 'none' || (s.position !== 'fixed' && s.position !== 'absolute')) return;
                if (el.getBoundingClientRect().width < 150) return;
                el.style.display = 'none';
            });
        }
        return null;
    });
    if (champ && champ.focus) {
        const avant = await page.evaluate(CE_QUI_SE_VOIT);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(250);
        const apres = await page.evaluate(CE_QUI_SE_VOIT);
        r.egal('le curseur dans un champ, Échap ne jette pas la fenêtre',
            apres.length, avant.length, 'outil : ' + champ.nom);
    } else {
        r.verifie('un outil avec un champ de saisie a bien été trouvé', false, JSON.stringify(champ));
    }

    // ------------------------------------------------------------------
    // ET LA CROIX FERME TOUJOURS, MÊME QUAND ÉCHAP EST À QUELQU'UN D'AUTRE
    // ------------------------------------------------------------------
    await faireLePropre();
    const croix = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const g = document.getElementById('plugins-grid');
        if (g) g.style.display = 'grid';
        const b = [...document.querySelectorAll('#plugins-grid .btn')]
            .find(x => /Formules/i.test(x.getAttribute('data-tooltip') || x.title || ''));
        if (!b) return null;
        b.click();
        await attendre(700);
        const f = [...document.querySelectorAll('[data-equipee="1"]')]
            .find(x => x.getClientRects().length && x.querySelector(':scope > .fen-tete .fen-fermer'));
        if (!f) return { ouverte: false };
        f.querySelector(':scope > .fen-tete .fen-fermer').click();
        await attendre(400);
        return { ouverte: true, refermee: !f.getClientRects().length };
    });
    r.verifie('la croix de « Formules mathématiques » referme sa fenêtre',
        croix && croix.ouverte && croix.refermee, JSON.stringify(croix));

    // ------------------------------------------------------------------
    // ET LA BOÎTE DE RÉGLAGES A UNE CROIX, ELLE AUSSI
    // ------------------------------------------------------------------
    // Elle a sa barre à elle — elle n'est pas équipée par le mécanisme commun —
    // et elle n'avait donc jamais eu de croix : on en sortait par « Annuler », en
    // bas, ou par Échap, qu'il faut connaître. Chercher la croix en haut à droite
    // est le geste le plus ordinaire qu'il y ait. Elle fait ce que fait
    // « Annuler » : elle referme ET elle prévient celui qui attendait une
    // réponse, sinon un outil resterait suspendu à une promesse.
    await faireLePropre();
    const boite = await page.evaluate(async () => {
        if (typeof openCustomPrompt !== 'function') return null;
        let annule = false;
        openCustomPrompt('Essai de la croix', [{ label: 'Nombre', type: 'number', value: '3' }],
            null, () => {}, () => { annule = true; });
        await new Promise(ok => setTimeout(ok, 300));
        const m = document.getElementById('custom-prompt-modal');
        const croix = document.getElementById('custom-prompt-fermer');
        if (!m || !m.getClientRects().length || !croix) {
            return { ouverte: !!(m && m.getClientRects().length), croix: !!croix };
        }
        const rc = croix.getBoundingClientRect();
        const rm = m.getBoundingClientRect();
        // Elle est bien en haut à DROITE, et de la taille des autres.
        const place = { droite: Math.round(rm.right - rc.right), haut: Math.round(rc.top - rm.top),
                        taille: [Math.round(rc.width), Math.round(rc.height)] };
        // Et on la vise pour de vrai, là où elle est.
        const sous = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
        const atteinte = !!(sous && (sous === croix || croix.contains(sous) || sous.contains(croix)));
        croix.click();
        await new Promise(ok => setTimeout(ok, 250));
        return { ouverte: true, croix: true, place, atteinte,
                 refermee: !m.getClientRects().length, annule };
    });
    if (boite && boite.ouverte && boite.croix) {
        r.verifie('la croix est en haut à droite, à la taille des autres',
            boite.place.droite >= 0 && boite.place.droite <= 12 && boite.place.haut <= 12
            && boite.place.taille[0] >= 24 && boite.place.taille[1] >= 24,
            JSON.stringify(boite.place));
        r.egal('on peut la viser', boite.atteinte, true, JSON.stringify(boite));
        r.egal('elle referme la boîte', boite.refermee, true, JSON.stringify(boite));
        r.egal('et elle prévient celui qui attendait une réponse', boite.annule, true,
            JSON.stringify(boite));
    } else {
        r.verifie('la boîte de réglages s\'ouvre et porte une croix', false, JSON.stringify(boite));
    }

    // ------------------------------------------------------------------
    // UNE FENÊTRE AGRANDIE : ÉCHAP REND L'ÉCRAN, ET NE FERME RIEN
    // ------------------------------------------------------------------
    // L'empreinte compte les fenêtres agrandies — c'est bien ce terme-là qui
    // devait empêcher la fermeture. Mais elle est relevée AVANT et APRÈS la
    // touche, et la sortie du plein écran n'a pas encore eu lieu quand on
    // regarde : elle est branchée FENÊTRE PAR FENÊTRE, au moment de
    // l'équipement, donc après la règle globale, posée au chargement. L'ordre
    // des écoutes décidait du comportement, et il décidait mal : Échap fermait
    // la fenêtre de devant, PUIS sortait du plein écran de l'autre.
    //
    // Cela ne se voyait pas tant que la fenêtre de devant n'était presque
    // jamais celle qu'on regardait. Le jour où les fenêtres ont commencé à
    // passer devant en s'ouvrant, la victime est devenue celle qu'on venait
    // d'agrandir — et « Échap rend l'écran » la refermait pour de bon.
    // ON PREND « MES CLASSES », ET C'EST MESURÉ, PAS CHOISI AU HASARD. La même
    // épreuve montée sur la calculatrice reste verte même en débranchant la
    // correction : la calculatrice est équipée TÔT, sa sortie du plein écran
    // passe donc avant la règle globale et l'empreinte change à temps. C'est
    // une fenêtre équipée TARD — une modale, avec son voile — qui met l'ordre
    // des écoutes en défaut. Une épreuve qui n'aurait rien mesuré aurait été
    // pire que pas d'épreuve du tout.
    const agrandie = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        // Deux fenêtres, pour que « celle de devant » ait un sens.
        document.getElementById('btn-toggle-calc').click();
        await attendre(300);
        await ClassesStore.saveAll([{ id: 'ec', name: 'Épreuve',
            students: [{ id: 'a', name: 'Alix' }, { id: 'b', name: 'Bo' }] }]);
        await openClassManagerModal(null, 'eleves');
        await attendre(700);
        const boite = document.querySelector('#class-manager-modal .modal-box');
        if (!boite || !boite.querySelector('.fen-plein')) return { sansBouton: true };
        const combien = () => [...document.querySelectorAll('[data-equipee="1"]')]
            .filter(f => f.getClientRects().length).length;
        const avant = combien();
        const large = boite.getBoundingClientRect().width;
        boite.querySelector('.fen-plein').click();
        await attendre(250);
        const agrandi = boite.getBoundingClientRect().width;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await attendre(350);
        return {
            avant, apres: combien(),
            largeurs: [Math.round(large), Math.round(agrandi),
                       Math.round(boite.getBoundingClientRect().width)],
            toujoursLa: !!document.querySelector('#class-manager-modal .modal-box'),
            calcLa: document.getElementById('calc-widget').getClientRects().length > 0,
            pleines: document.querySelectorAll('.fen-pleine').length,
        };
    });
    if (agrandie.sansBouton) {
        r.verifie('« Mes classes » s\'ouvre et porte un bouton d\'agrandissement', false, 'pas de bouton');
    } else {
        r.verifie('il y a bien plusieurs fenêtres ouvertes', agrandie.avant >= 2, JSON.stringify(agrandie));
        r.verifie('Échap rend l\'écran à la fenêtre agrandie',
            agrandie.largeurs[1] > agrandie.largeurs[0]
            && Math.abs(agrandie.largeurs[2] - agrandie.largeurs[0]) < 3, JSON.stringify(agrandie));
        r.egal('elle est toujours là', agrandie.toujoursLa, true, JSON.stringify(agrandie));
        r.egal('et l\'autre aussi', agrandie.calcLa, true, JSON.stringify(agrandie));
        r.egal('il ne s\'en ferme aucune au passage',
            agrandie.apres, agrandie.avant, JSON.stringify(agrandie));
        r.egal('plus rien n\'est agrandi', agrandie.pleines, 0, JSON.stringify(agrandie));
    }

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
