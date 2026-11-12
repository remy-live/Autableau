// LE MODE DÉMONSTRATION, ET CE QU'IL NE TOUCHE PAS.
//
// Montrer l'outil, l'éprouver, répondre à un enseignant qui demande « ça donne
// quoi, les classes ? » — tout cela butait sur la même chose : un tableau neuf
// n'a NI classe NI emploi du temps. Il fallait saisir trente élèves et douze
// créneaux à la main avant de pouvoir montrer quoi que ce soit.
//
// « ...../index.html?debug=true » installe trois classes et une semaine de
// cours.
//
// MAIS CE CHAPITRE EXISTE SURTOUT POUR UNE AUTRE RAISON. Ce lien va circuler :
// un collègue l'enverra à un autre, qui le cliquera sans savoir ce qu'il fait,
// sur l'ordinateur où vivent ses vraies listes d'élèves. Si la démonstration
// écrasait ça, elle ferait perdre une rentrée entière de saisie. Le contrôle
// central de ce chapitre n'est donc pas que la démonstration s'installe :
// c'est qu'elle REFUSE de s'installer par-dessus quoi que ce soit, et qu'elle
// le dise.
const { creerRapport, APP_URL, CHROMIUM } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le mode démonstration');

    // Chaque cas part d'un navigateur vierge : le mode lit l'adresse AU
    // CHARGEMENT, et une page déjà ouverte ne le reverrait jamais.
    const ouvrirSur = async (adresse) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        const erreurs = [];
        page.on('pageerror', e => erreurs.push(String(e).slice(0, 160)));
        await page.goto(adresse);
        await page.waitForTimeout(2600);
        return { context, page, erreurs };
    };

    const lire = (page) => page.evaluate(async () => {
        const b = document.getElementById('bandeau-demo');
        let classes = [];
        try { classes = (await ClassesStore.loadAll()) || []; } catch (e) { classes = []; }
        return {
            bandeau: b ? (b.textContent || '').trim() : null,
            etat: b ? (b.dataset.etat || null) : null,
            // ON NE LIT PAS « offsetParent » ICI. Il vaut null pour tout
            // élément en « position: fixed », et le bandeau en est un : ce
            // contrôle le déclarait invisible alors qu'il s'affichait. On
            // mesure donc ce que l'œil mesure — une boîte qui a une taille,
            // dans l'écran, et qui n'est ni transparente ni cachée.
            bandeauVu: (() => {
                if (!b) return false;
                const r = b.getBoundingClientRect();
                const cs = getComputedStyle(b);
                return r.width > 0 && r.height > 0
                    && r.bottom > 0 && r.top < window.innerHeight
                    && cs.display !== 'none' && cs.visibility !== 'hidden'
                    && parseFloat(cs.opacity) > 0.1;
            })(),
            classes: classes.map(c => ({ nom: c.name, eleves: (c.students || []).length,
                                         demo: !!c.demonstration })),
            creneaux: (typeof agenda !== 'undefined' && agenda.creneaux) ? agenda.creneaux.length : null,
            entrees: (typeof agenda !== 'undefined' && agenda.entrees) ? agenda.entrees.length : null,
            pluginVoit: (typeof PluginManager !== 'undefined' && PluginManager.plugins
                         && PluginManager.plugins.classPointsTool
                         && PluginManager.plugins.classPointsTool.classes)
                ? PluginManager.plugins.classPointsTool.classes.length : null
        };
    });

    // ------------------------------------------------------------------
    // 1. SANS LE PARAMÈTRE, IL NE SE PASSE RIEN.
    //
    //    C'est le cas de tous les enseignants, tous les jours : le mode ne
    //    doit pas exister pour eux.
    // ------------------------------------------------------------------
    let s = await ouvrirSur(APP_URL);
    const sans = await lire(s.page);
    r.egal('sans « ?debug », aucun bandeau', sans.bandeau, null, JSON.stringify(sans));
    r.egal('et aucune classe inventée', sans.classes.length, 0, JSON.stringify(sans));
    r.egal('ni aucun cours dans la semaine', sans.creneaux, 0, JSON.stringify(sans));
    // LA FONCTION SE GARDE ELLE-MÊME, et pas seulement le chargement.
    //
    // Deux gardes protègent l'installation : celle du « load », et celle que
    // la fonction porte en entrant. Casser la seconde ne faisait RIEN tomber —
    // parce que ce chapitre passait toujours par la première. Or cette
    // fonction est posée sur « window » : on peut l'appeler à la main, et elle
    // écrit des classes. Une garde sur un geste qui écrase des données vaut
    // qu'on l'éprouve pour elle-même.
    const aLaMain = await s.page.evaluate(async () => {
        const rendu = await window.installerLaDemonstration();
        let classes = [];
        try { classes = (await ClassesStore.loadAll()) || []; } catch (e) { classes = []; }
        return { rendu, classes: classes.length, bandeau: !!document.getElementById('bandeau-demo') };
    });
    r.egal('appelée à la main sans le paramètre, elle refuse et ne rend rien',
        aLaMain.rendu, null, JSON.stringify(aLaMain));
    r.egal('et elle n\'a toujours rien posé',
        [aLaMain.classes, aLaMain.bandeau], [0, false], JSON.stringify(aLaMain));

    r.verifie('aucune erreur de page sans le paramètre',
        s.erreurs.length === 0, s.erreurs.join(' | '));
    await s.context.close();

    // ------------------------------------------------------------------
    // 2. AVEC LE PARAMÈTRE, SUR UN TABLEAU NEUF : TOUT EST LÀ.
    // ------------------------------------------------------------------
    s = await ouvrirSur(APP_URL + '?debug=true');
    const avec = await lire(s.page);
    r.egal('trois classes s\'installent', avec.classes.length, 3, JSON.stringify(avec));
    r.egal('aux effectifs différents — une grille à moitié vide se comporte autrement',
        avec.classes.map(c => c.eleves), [28, 24, 19], JSON.stringify(avec.classes));
    r.egal('chacune se déclare « de démonstration »',
        avec.classes.every(c => c.demo), true, JSON.stringify(avec.classes));
    r.egal('la semaine porte ses douze cours', avec.creneaux, 12, JSON.stringify(avec));
    r.egal('et ses trois classes au programme', avec.entrees, 3, JSON.stringify(avec));
    // LE PLUGIN DES POINTS TIENT SA PROPRE COPIE : sans rafraîchissement, il
    // montrait une liste vide à côté d'un emploi du temps plein, et l'on
    // croyait la démonstration à moitié cassée.
    r.egal('le plugin des points voit les mêmes classes', avec.pluginVoit, 3,
        JSON.stringify(avec));

    // ON VOIT QU'ON EST EN DÉMONSTRATION. Des élèves inventés qu'on prend pour
    // les siens, c'est un appel fait sur une classe fantôme.
    r.egal('un bandeau est posé, et il est visible',
        [avec.etat, avec.bandeauVu], ['pose', true], JSON.stringify(avec));
    r.verifie('il dit en toutes lettres que rien n\'est réel',
        /démonstration/i.test(avec.bandeau || '') && /réel/i.test(avec.bandeau || ''),
        avec.bandeau);
    r.verifie('et il donne les chiffres, pour qu\'on sache ce qui a été posé',
        /3 classes/.test(avec.bandeau || '') && /12 cours/.test(avec.bandeau || ''),
        avec.bandeau);
    r.verifie('aucune erreur de page en démonstration',
        s.erreurs.length === 0, s.erreurs.join(' | '));
    await s.context.close();

    // ------------------------------------------------------------------
    // 3. LE CONTRÔLE QUI COMPTE : DE VRAIES CLASSES NE SONT PAS ÉCRASÉES.
    //
    //    Un collègue envoie le lien, on le clique sur l'ordinateur où vivent
    //    ses listes d'élèves. Rien ne doit bouger.
    // ------------------------------------------------------------------
    s = await ouvrirSur(APP_URL);
    await s.page.evaluate(async () => {
        await ClassesStore.saveAll([{
            id: 'vraie_4e', name: 'Ma vraie 4e 2', createdAt: Date.now(), updatedAt: Date.now(),
            students: [{ id: 'e1', name: 'Un élève', points: 7 },
                       { id: 'e2', name: 'Une élève', points: 3 }]
        }]);
    });
    await s.page.goto(APP_URL + '?debug=true');
    await s.page.waitForTimeout(2600);
    const refus = await lire(s.page);
    r.egal('la vraie classe est TOUJOURS LÀ, seule',
        refus.classes.map(c => c.nom), ['Ma vraie 4e 2'], JSON.stringify(refus));
    r.egal('avec ses deux élèves intacts',
        refus.classes[0] ? refus.classes[0].eleves : null, 2, JSON.stringify(refus));
    r.egal('aucune classe inventée ne s\'est glissée à côté',
        refus.classes.filter(c => c.demo).length, 0, JSON.stringify(refus));
    r.egal('et aucun cours n\'a été posé', refus.creneaux, 0, JSON.stringify(refus));

    // LE REFUS SE DIT. Le silence ferait croire que le mode n'a pas marché, et
    // l'on recommencerait en cherchant pourquoi.
    r.egal('le refus est annoncé', refus.etat, 'refus', JSON.stringify(refus));
    r.verifie('et il dit que rien n\'a été touché',
        /rien n'a été touché/i.test(refus.bandeau || ''), refus.bandeau);
    r.verifie('aucune erreur de page au refus',
        s.erreurs.length === 0, s.erreurs.join(' | '));
    await s.context.close();

    // ------------------------------------------------------------------
    // 4. UN EMPLOI DU TEMPS SEUL SUFFIT À REFUSER.
    //
    //    Poser « seulement les classes » parce que l'agenda existe laisserait
    //    un emploi du temps réel pointant sur des classes inventées : un
    //    mélange que personne ne saurait démêler.
    // ------------------------------------------------------------------
    s = await ouvrirSur(APP_URL);
    await s.page.evaluate(() => {
        localStorage.setItem('board_agenda', JSON.stringify({
            entrees: [{ id: 'e_vraie', libelle: 'Ma 4e', couleur: '#0984e3' }],
            creneaux: [{ id: 'c_vrai', jour: 2, debut: 540, duree: 55, semaine: 'T',
                         entreeId: 'e_vraie', libelle: 'Ma 4e', couleur: '#0984e3' }]
        }));
    });
    await s.page.goto(APP_URL + '?debug=true');
    await s.page.waitForTimeout(2600);
    const agendaSeul = await lire(s.page);
    r.egal('un seul vrai créneau suffit à tout refuser',
        agendaSeul.etat, 'refus', JSON.stringify(agendaSeul));
    r.egal('aucune classe inventée n\'est posée', agendaSeul.classes.length, 0,
        JSON.stringify(agendaSeul));
    r.egal('et le vrai cours est toujours seul dans la semaine',
        agendaSeul.creneaux, 1, JSON.stringify(agendaSeul));
    await s.context.close();

    // ------------------------------------------------------------------
    // 5. « ?debug » TOUT COURT MARCHE, ET « ?debug=false » N'INSTALLE RIEN.
    //
    //    Personne n'écrit « =true » de mémoire ; mais un « non » explicite
    //    doit rester un non.
    // ------------------------------------------------------------------
    s = await ouvrirSur(APP_URL + '?debug');
    const court = await lire(s.page);
    r.egal('« ?debug » tout court installe la démonstration', court.classes.length, 3,
        JSON.stringify(court));
    await s.context.close();

    s = await ouvrirSur(APP_URL + '?debug=false');
    const nonMerci = await lire(s.page);
    r.egal('« ?debug=false » n\'installe rien', nonMerci.classes.length, 0,
        JSON.stringify(nonMerci));
    r.egal('et ne pose aucun bandeau', nonMerci.bandeau, null, JSON.stringify(nonMerci));
    await s.context.close();

    return r.bilan();
};
