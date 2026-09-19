// CE QU'ON VOIT DE L'ÉCRAN : TROIS TEMPS, ET DEUX GESTES DISTINCTS.
//
// « Je pense qu'il faudrait un bouton pour juste remettre les toolbar, puis
// toolbar + tiroir + rien, et un bouton pour le plein écran / sortie plein
// écran. »
// « Rajoute pour la barre du pdf la sortie ou non du plein écran (enlève le
// cycle) et une icône pour l'affichage ou non des toolbar. »
//
// DEUX DÉFAUTS DE MÊME NATURE : un réglage qui n'avait que deux positions là
// où il en fallait trois, et un bouton qui en disait trois là où il fallait
// deux boutons.
//
//   — L'affichage n'allait que de « tout » à « rien ». Or l'écran du cours,
//     c'est LES BARRES SANS LES TIROIRS : on écrit, on trace, et rien ne
//     mange le tableau ; les tiroirs ne servent qu'à préparer. Il fallait
//     choisir entre un écran encombré et un écran nu où l'on n'a plus un
//     outil sous la main.
//   — Le plein écran d'un document était un cycle à trois temps qui mêlait
//     deux questions sans rapport : la page est-elle en grand, et voit-on
//     ses outils ? Pour retrouver ses outils sur la page projetée il fallait
//     appuyer DEUX fois, et un appui de trop refermait tout.
//
// ET L'AFFICHAGE RÉDUIT ÉTAIT UN CUL-DE-SAC : la commande qui le règle vit
// dans le tiroir du bas, lequel est justement caché. On n'en sortait qu'à la
// touche Échap, pour qui la connaissait.
const { creerRapport, ouvrirApp, petitPdf } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Affichage et plein écran');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    const vu = (sel) => page.evaluate((s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const c = getComputedStyle(e);
        return c.display !== 'none' && c.visibility !== 'hidden' && c.opacity !== '0';
    }, sel);

    // « sortie » : LA CROIX, celle qui ramène tout. C'était le bouton du cycle
    // qu'on mesurait ici — mais lui n'est pas une sortie : les tiroirs rangés,
    // il va PLUS LOIN. Et au tableau nu, où il ne pouvait plus que revenir, il
    // s'efface désormais pour ne pas faire double emploi avec la croix. La
    // croix, elle, est la sortie aux deux états réduits, et à eux seuls.
    // « coin » : le plein écran du navigateur, qui lui est là en permanence —
    // « j'aimerais un tout petit bouton vraiment collé en haut à droite pour
    // le plein écran ». La barre du coin ne se juge donc plus en bloc : elle
    // existe toujours, et ce sont ses boutons qui vont et viennent.
    const ecran = async () => ({
        etat: await page.evaluate(() => etatDeLAffichage()),
        mot: await page.evaluate(() => document.getElementById('btn-focus-mot').textContent),
        outils: await vu('.custom-toolbar'),
        tiroirBas: await vu('#bottom-drawer'),
        tiroirHaut: await vu('#bar-plugins'),
        sortie: await vu('#exit-focus-cross'),
        coin: await vu('#btn-ecran-plein')
    });

    // =================================================================
    // 1. TROIS TEMPS, ET LE TEMPS DU MILIEU EXISTE
    // =================================================================
    r.egal('au départ, tout est là et le coin ne porte que le plein écran',
        await ecran(),
        { etat: 0, mot: 'Tout', outils: true, tiroirBas: true, tiroirHaut: true, sortie: false, coin: true });

    await page.evaluate(() => cyclerLAffichage());
    await page.waitForTimeout(450);
    r.egal('un appui range les tiroirs et GARDE les outils',
        await ecran(),
        { etat: 1, mot: 'Barres', outils: true, tiroirBas: false, tiroirHaut: false, sortie: true, coin: true });

    await page.evaluate(() => cyclerLAffichage());
    await page.waitForTimeout(450);
    r.egal('le suivant ne laisse que le tableau',
        await ecran(),
        { etat: 2, mot: 'Focus', outils: false, tiroirBas: false, tiroirHaut: false, sortie: true, coin: true });

    await page.evaluate(() => cyclerLAffichage());
    await page.waitForTimeout(450);
    r.egal('et le troisième remet tout',
        await ecran(),
        { etat: 0, mot: 'Tout', outils: true, tiroirBas: true, tiroirHaut: true, sortie: false, coin: true });

    // La pastille du tiroir du bas mène le cycle, et s'allume dès qu'on a
    // quitté « tout ».
    const pastille = await page.evaluate(() => {
        const b = document.getElementById('btn-focus');
        const lu = () => ({ mot: document.getElementById('btn-focus-mot').textContent,
                            allume: b.classList.contains('allume') });
        const suite = [lu()];
        for (let i = 0; i < 3; i++) { b.click(); suite.push(lu()); }
        return suite;
    });
    r.egal('la pastille dit où l\'on est, et s\'allume hors de « tout »',
        pastille, [
            { mot: 'Tout', allume: false },
            { mot: 'Barres', allume: true },
            { mot: 'Focus', allume: true },
            { mot: 'Tout', allume: false }
        ]);

    // =================================================================
    // 2. L'AFFICHAGE RÉDUIT N'EST PLUS UN CUL-DE-SAC
    // =================================================================
    await page.evaluate(() => poserLAffichage(1));
    await page.waitForTimeout(450);
    const boutonsDeSortie = await page.evaluate(() => {
        const b = document.getElementById('barre-ecran');
        // DEUX BOUTONS NE COMPTENT PAS ICI, parce qu'ils ne parlent pas de
        // l'affichage mais de ce qu'il y a sur le tableau : « Présenter »
        // n'existe que s'il y a une page à projeter, et la vignette du retour
        // que s'il y a un document où revenir. Ce tableau-ci est nu : ni l'un
        // ni l'autre n'a de raison d'être là, et c'est très bien ainsi.
        // Les pages du coin sont du même bois : elles ne paraissent qu'au
        // tableau nu ET s'il y a plus d'une page. Ici il n'y en a qu'une.
        // Leur RANG en est aussi : c'est un bouton depuis qu'on peut jeter la
        // page en appuyant dessus, mais il vit et meurt avec ses deux flèches.
        const CONDITIONNELS = ['btn-ecran-presenter', 'btn-ecran-retour',
                               'btn-ecran-page-prec', 'btn-ecran-page-suiv',
                               'ecran-page-rang'];
        return [...b.querySelectorAll('button')]
            .filter(x => !CONDITIONNELS.includes(x.id))
            .map(x => ({ id: x.id, atteignable: x.getBoundingClientRect().width > 10 }));
    });
    // L'ORDRE EST CELUI DES FAMILLES, et non celui d'hier : « je ne comprends
    // pas le fonctionnement des 4 ». D'abord ce qu'on voit de l'application —
    // le cycle d'affichage et la croix qui ramène tout —, puis ce qui passe en
    // grand. Les seconds sont contre le coin et ne bougent donc pas quand les
    // premiers arrivent.
    r.egal('trois boutons flottent alors dans le coin, rangés par famille',
        boutonsDeSortie, [
            { id: 'btn-ecran-suite', atteignable: true },
            { id: 'exit-focus-cross', atteignable: true },
            { id: 'btn-ecran-plein', atteignable: true }
        ]);

    // AU TABLEAU NU, LE CYCLE S'EFFACE — ET C'EST TOUT LE PROPOS.
    //
    // « Je ne comprends pas la différence entre Tout remettre et Tout est là. »
    // Il n'y en avait pas, au dernier état. Les tiroirs rangés, les deux
    // boutons s'opposent : l'un va plus loin, l'autre revient. Le tableau nu,
    // le cycle n'a plus qu'une destination — celle de la croix. Deux boutons
    // voisins, deux icônes, un seul effet.
    //
    // ON ÉPROUVE LES DEUX ÉTATS, et pas seulement celui qu'on corrige : dire
    // « le cycle est caché » sans montrer qu'il est LÀ juste avant ne
    // distinguerait pas la correction d'un bouton disparu pour de bon.
    const auTableauNu = await page.evaluate(async () => {
        const vu = (id) => {
            const e = document.getElementById(id);
            const r = e.getBoundingClientRect();
            return getComputedStyle(e).display !== 'none' && r.width > 4;
        };
        poserLAffichage(1); await new Promise(ok => setTimeout(ok, 450));
        const ranges = { cycle: vu('btn-ecran-suite'), croix: vu('exit-focus-cross') };
        poserLAffichage(2); await new Promise(ok => setTimeout(ok, 450));
        const nu = { cycle: vu('btn-ecran-suite'), croix: vu('exit-focus-cross') };
        // Et la croix, seule, ramène bien tout.
        document.getElementById('exit-focus-cross').click();
        await new Promise(ok => setTimeout(ok, 450));
        return { ranges, nu, apres: etatDeLAffichage() };
    });
    r.egal('tiroirs rangés, les deux boutons sont là : ils font deux choses opposées',
        auTableauNu.ranges, { cycle: true, croix: true });
    r.egal('mais au tableau nu, le cycle s\'efface : il ferait double emploi',
        auTableauNu.nu, { cycle: false, croix: true });
    r.egal('et la croix, seule, remet tout', auTableauNu.apres, 0);

    // ILS NE DOIVENT PAS COUVRIR L'HORLOGE : le cartouche de la date et
    // l'horloge de classe vivent sur le même bord.
    const chevauchement = await page.evaluate(() => {
        const boite = (s) => {
            const e = document.querySelector(s);
            if (!e) return null;
            const b = e.getBoundingClientRect();
            return { t: b.top, b: b.bottom, l: b.left, r: b.right };
        };
        const a = boite('#barre-ecran'), h = boite('.project-name-wrapper');
        if (!a || !h) return null;
        return !(a.b <= h.t || h.b <= a.t || a.r <= h.l || h.r <= a.l);
    });
    r.egal('et ils ne passent pas par-dessus l\'horloge', chevauchement, false);

    await page.evaluate(() => poserLAffichage(2));
    await page.waitForTimeout(450);
    await page.evaluate(() => document.getElementById('btn-ecran-suite').click());
    await page.waitForTimeout(450);
    r.egal('le bouton du coin fait avancer le cycle',
        await page.evaluate(() => etatDeLAffichage()), 0);

    // DEUX BOUTONS POUR LE MÊME CYCLE — ET C'EST VOULU. La pastille « Focus »
    // vit dans le tiroir du bas, avec les autres interrupteurs ; le bouton du
    // coin reste sous la main quand, justement, les tiroirs sont rangés. Ce
    // qu'on ne veut pas, c'est qu'ils ne disent pas la même chose : deux mots
    // pour un geste, et le professeur croit à deux gestes.
    const deuxVoix = await page.evaluate(async () => {
        const p = document.getElementById('btn-focus');
        const c = document.getElementById('btn-ecran-suite');
        const lire = () => ({ pastille: p.getAttribute('title'), coin: c.getAttribute('data-tooltip') });
        poserLAffichage(0); await new Promise(ok => setTimeout(ok, 250));
        const tout = lire();
        poserLAffichage(1); await new Promise(ok => setTimeout(ok, 250));
        const ranges = lire();
        poserLAffichage(0); await new Promise(ok => setTimeout(ok, 250));
        return { tout, ranges };
    });
    r.egal('la pastille « Focus » et le bouton du coin disent où l\'on en est, du même mot',
        [deuxVoix.tout.pastille, deuxVoix.ranges.pastille],
        [deuxVoix.tout.coin, deuxVoix.ranges.coin]);
    r.verifie('et ce mot suit l\'état : il dit où l\'on EST, non le cycle par cœur',
        !!deuxVoix.tout.pastille && !!deuxVoix.ranges.pastille
        && deuxVoix.tout.pastille !== deuxVoix.ranges.pastille, JSON.stringify(deuxVoix));

    await page.evaluate(() => poserLAffichage(2));
    await page.waitForTimeout(450);
    await page.evaluate(() => document.getElementById('exit-focus-cross').click());
    await page.waitForTimeout(450);
    r.egal('et la croix remet tout d\'un coup',
        await page.evaluate(() => etatDeLAffichage()), 0);

    // Poser deux fois le même état ne fait rien de travers.
    const deuxFois = await page.evaluate(() => {
        poserLAffichage(1); poserLAffichage(1);
        const a = etatDeLAffichage();
        poserLAffichage(0);
        return { a, b: etatDeLAffichage() };
    });
    r.egal('poser deux fois le même état ne dérange rien', deuxFois, { a: 1, b: 0 });

    // =================================================================
    // 3. LE DOCUMENT : DEUX BOUTONS, DEUX QUESTIONS
    // =================================================================
    const octets = Array.from(petitPdf());
    await page.evaluate(async ({ octets }) => {
        poserLAffichage(0);
        panX = 0; panY = 0; zoom = 1; images.length = 0;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], 'cours.pdf', { type: 'application/pdf' }));
        await new Promise(res => setTimeout(res, 1500));
        setMode('pointer'); selectObject({ type: 'image', id: images[0].id });
        majBarreDocument(); draw();
    }, { octets });
    await page.waitForTimeout(400);

    const doc = async () => ({
        plein: await page.evaluate(() => etatDuPleinEcran()),
        barres: await page.evaluate(() => !!presentationAvecBarres),
        boutonDesBarres: await vu('#doc-barres')
    });

    r.egal('hors présentation, le bouton des outils n\'a rien à dire : il ne paraît pas',
        await doc(), { plein: 0, barres: false, boutonDesBarres: false });

    await page.evaluate(() => document.getElementById('doc-plein-ecran').click());
    await page.waitForTimeout(450);
    r.egal('un appui met la page en grand, sans les outils',
        await doc(), { plein: 1, barres: false, boutonDesBarres: true });

    await page.evaluate(() => document.getElementById('doc-barres').click());
    await page.waitForTimeout(450);
    r.egal('l\'AUTRE bouton rappelle les outils, et la page reste en grand',
        await doc(), { plein: 2, barres: true, boutonDesBarres: true });

    await page.evaluate(() => document.getElementById('doc-barres').click());
    await page.waitForTimeout(450);
    r.egal('le même les range, toujours sans quitter le plein écran',
        await doc(), { plein: 1, barres: false, boutonDesBarres: true });

    // LE POINT DU RETOUR : d'OÙ QU'ON PARTE, le bouton du plein écran sort.
    // C'était le piège du cycle — depuis la page seule, un appui menait au
    // temps suivant, et il en fallait un troisième pour en sortir.
    r.egal('depuis la page seule, le bouton du plein écran sort tout de suite',
        await page.evaluate(async () => {
            document.getElementById('doc-plein-ecran').click();
            await new Promise(ok => setTimeout(ok, 400));
            return etatDuPleinEcran();
        }), 0);

    await page.evaluate(async () => {
        document.getElementById('doc-plein-ecran').click();
        await new Promise(ok => setTimeout(ok, 400));
        document.getElementById('doc-barres').click();
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => document.getElementById('doc-plein-ecran').click());
    await page.waitForTimeout(450);
    r.egal('et depuis la page AVEC les outils, il sort aussi',
        await doc(), { plein: 0, barres: false, boutonDesBarres: false });

    // Le second bouton ne fait rien quand il n'y a pas de présentation.
    r.egal('hors présentation, montrer les outils n\'a pas de sens',
        await page.evaluate(() => basculerLesBarresDeLaPresentation()), false);

    // ==================================================================
    // « PRÉSENTER » A UNE PLACE FIXE, AU COIN DE L'ÉCRAN
    // « Ce qui me sert le plus, c'est quand même le bouton plein écran. » Il
    // ne vivait que dans la barre du DOCUMENT — celle qui paraît et disparaît
    // avec la sélection : on prenait le crayon, la sélection se vidait, la
    // barre s'en allait, et il fallait recliquer la page pour retrouver le
    // bouton le plus utilisé de l'application.
    // ==================================================================
    const fixe = await page.evaluate(async () => {
        // On repart d'un tableau nu, sans document : rien à présenter.
        if (presentationEnCours) quitterLaPresentation();
        poserLAffichage(0);
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        if (typeof docEnAnnotation !== 'undefined') docEnAnnotation = null;
        majBarreDocument();
        await new Promise(ok => setTimeout(ok, 120));
        const b = document.getElementById('btn-ecran-presenter');
        const lire = () => ({ vu: getComputedStyle(b).display, grise: b.disabled,
                              barre: getComputedStyle(document.getElementById('barre-ecran')).opacity,
                              titre: b.getAttribute('data-tooltip'),
                              actif: b.classList.contains('actif') });
        const sansDocument = lire();

        // Une page arrive, mais personne ne la tient : c'est l'état où l'on a
        // le crayon en main.
        images.push({ id: nextId++, x: 40, y: 40, w: 500, h: 620, z: globalZ++,
                      nomFichier: 'doc.pdf', src: 'x' });
        setMode('freehand');
        selectedItems = [];
        majBarreDocument();
        // La barre glisse en 0,3 s : on la mesure une fois posée.
        await new Promise(ok => setTimeout(ok, 450));
        const tenuParPersonne = { ...lire(),
            barreDuDocument: getComputedStyle(document.getElementById('bar-document')).opacity };
        return { sansDocument, tenuParPersonne };
    });
    // IL RESTE LÀ, MAIS GRISÉ. « J'aimerais bien organiser pour que les boutons
    // soient persistants. » Il s'effaçait faute de page à projeter, et le coin
    // changeait de forme selon ce qu'on tenait : les voisins se déplaçaient
    // sous le doigt qui les visait. Un bouton éteint dit ce qui manque ; un
    // bouton absent ne dit rien.
    r.egal('sans document, le bouton fixe est là mais éteint : rien à présenter',
        { vu: fixe.sansDocument.vu, grise: fixe.sansDocument.grise },
        { vu: 'flex', grise: true });
    r.verifie('et dès qu\'une page est à l\'écran, il s\'allume — même sans la tenir',
        fixe.tenuParPersonne.vu === 'flex' && fixe.tenuParPersonne.grise === false
        && Number(fixe.tenuParPersonne.barre) > 0.9,
        JSON.stringify(fixe.tenuParPersonne));

    // Et il présente, puis il en sort — sans qu'on ait rien sélectionné.
    const presente = await page.evaluate(async () => {
        const b = document.getElementById('btn-ecran-presenter');
        b.click();
        await new Promise(ok => setTimeout(ok, 500));
        const dedans = { etat: etatDuPleinEcran(), titre: b.getAttribute('data-tooltip'),
                         actif: b.classList.contains('actif'),
                         focus: document.body.classList.contains('focus-mode') };
        b.click();
        await new Promise(ok => setTimeout(ok, 500));
        const dehors = { etat: etatDuPleinEcran(), titre: b.getAttribute('data-tooltip'),
                         actif: b.classList.contains('actif') };
        return { dedans, dehors };
    });
    r.egal('un appui présente la page qu\'on regarde, sans l\'avoir choisie',
        { etat: presente.dedans.etat, focus: presente.dedans.focus,
          actif: presente.dedans.actif },
        { etat: 1, focus: true, actif: true });
    r.verifie('et le bouton dit alors qu\'il rend la page au tableau',
        /[Rr]endre la page au tableau/.test(presente.dedans.titre), presente.dedans.titre);
    r.egal('le même appui en sort, et le bouton reprend sa promesse',
        { etat: presente.dehors.etat, actif: presente.dehors.actif },
        { etat: 0, actif: false });
    // ET IL NE DIT PLUS « PLEIN ÉCRAN » : son voisin de coin porte ce mot-là
    // pour le plein écran du NAVIGATEUR. « Je crois qu'il y a plusieurs plein
    // écran » venait d'abord de ces deux boutons mitoyens qui le disaient tous
    // les deux, sous la même icône.
    r.verifie('« Projeter la page » de nouveau, et jamais « plein écran »',
        /[Pp]rojeter la page/.test(presente.dehors.titre)
        && !/plein écran/i.test(presente.dehors.titre),
        presente.dehors.titre);

    // DEUX PAGES À L'ÉCRAN : on ne devine pas laquelle projeter.
    const deuxPages = await page.evaluate(async () => {
        images.push({ id: nextId++, x: 600, y: 40, w: 400, h: 500, z: globalZ++,
                      nomFichier: 'autre.pdf', src: 'y' });
        selectedItems = []; docEnAnnotation = null;
        majBarreDocument();
        await new Promise(ok => setTimeout(ok, 120));
        const b = document.getElementById('btn-ecran-presenter');
        const vu = getComputedStyle(b).display;
        document.querySelectorAll('#toast-container > *').forEach(t => t.remove());
        const fait = presenterCeQuOnRegarde();
        await new Promise(ok => setTimeout(ok, 200));
        const message = [...document.querySelectorAll('#toast-container *')]
            .map(t => t.textContent).join(' ');
        // On laisse le tableau comme on l'a trouvé.
        images.length = 0; selectedItems = []; majBarreDocument();
        return { vu, fait, etat: etatDuPleinEcran(), message };
    });
    r.egal('à deux pages visibles, on ne devine pas : rien n\'est projeté',
        { fait: deuxPages.fait, etat: deuxPages.etat }, { fait: false, etat: 0 });
    r.verifie('et l\'on demande laquelle',
        /[Cc]hoisissez/.test(deuxPages.message), deuxPages.message);

    // ------------------------------------------------------------------
    // LA BARRE DU DOCUMENT A UNE PLACE, ET ELLE Y RESTE
    //
    // « Pourquoi la barre du PDF va une fois en haut, une fois en bas, selon
    // qu'on mette les toolbars ou non ? » Elle descendait au bas de l'écran
    // dès que le mode Focus rangeait les barres : six cents pixels de saut à
    // chaque appui. Elle ne s'écarte plus que pour une raison qu'on voit
    // arriver — le tiroir du haut, ouvert, occupe sa place.
    // ------------------------------------------------------------------
    const place = await page.evaluate(async (px) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const tiroir = document.getElementById('bar-plugins');
        const ou = () => Math.round(document.getElementById('bar-document').getBoundingClientRect().top);

        images.length = 0; selectedItems = [];
        images.push({ id: 'doc-place', type: 'image', src: px, x: 100, y: 50, w: 600, h: 850 });
        selectedItems = [{ type: 'image', id: 'doc-place' }];
        majBarreDocument();
        await attendre(450);

        // a) Le tiroir du haut fermé : la barre ne bouge pas d'un pixel.
        if (!tiroir.classList.contains('closed')) togglePluginDrawer();
        await attendre(450);
        majBarreDocument();
        const ferme = { avant: ou() };
        basculerLePleinEcranDuDocument();
        await attendre(450);
        ferme.projete = ou();
        basculerLesBarresDeLaPresentation();
        await attendre(450);
        ferme.avecBarres = ou();
        quitterLaPresentation(); majBarreDocument();
        await attendre(450);

        // b) Le tiroir du haut ouvert : elle se gare dessous, et remonte
        //    quand il s'en va — une place libérée, pas un saut inexpliqué.
        if (tiroir.classList.contains('closed')) togglePluginDrawer();
        await attendre(450);
        majBarreDocument();
        const ouvert = { avant: ou(), hauteurDuTiroir: Math.round(tiroir.getBoundingClientRect().bottom) };
        basculerLePleinEcranDuDocument();
        await attendre(450);
        ouvert.projete = ou();
        quitterLaPresentation(); majBarreDocument();
        await attendre(450);
        ouvert.apres = ou();
        if (!tiroir.classList.contains('closed')) togglePluginDrawer();
        images.length = 0; selectedItems = []; majBarreDocument();
        return { ferme, ouvert };
    }, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

    r.verifie('tiroir du haut fermé, la barre du document reste en haut',
        place.ferme.avant === 20, JSON.stringify(place.ferme));
    r.egal('et projeter la page, avec ou sans les outils, ne la déplace pas',
        [place.ferme.projete, place.ferme.avecBarres],
        [place.ferme.avant, place.ferme.avant]);
    r.verifie('tiroir du haut ouvert, elle se gare juste dessous',
        place.ouvert.avant > 20 && place.ouvert.avant >= place.ouvert.hauteurDuTiroir,
        JSON.stringify(place.ouvert));
    r.verifie('la place libérée, elle remonte en haut — elle ne descend jamais',
        place.ouvert.projete === 20, JSON.stringify(place.ouvert));
    r.egal('et elle retrouve sa place sous le tiroir au retour',
        place.ouvert.apres, place.ouvert.avant);

    // ==================================================================
    // LE POLYCOPIÉ QUI ARRIVE PART EN GRAND, SI ON L'A DEMANDÉ
    // « On pourrait avoir dans les paramètres une option où, lorsque l'on fait
    // glisser un PDF, cela se met en pleine largeur et en plein écran. » Deux
    // gestes qui n'en font qu'un pour qui les enchaîne toujours — mais éteint
    // par défaut : poser un document ne doit pas emporter l'écran.
    // ==================================================================
    const poserUnPdf = (octets, nom) => page.evaluate(async ({ octets, nom }) => {
        if (presentationEnCours) quitterLaPresentation();
        poserLAffichage(0);
        images.length = 0; selectedItems = []; panX = 0; panY = 0; zoom = 1;
        await poserPdfFeuilletable(new File([new Uint8Array(octets)], nom, { type: 'application/pdf' }));
        await new Promise(ok => setTimeout(ok, 1500));
        return { etat: etatDuPleinEcran(), cadrage: cadrageDePresentation,
                 focus: document.body.classList.contains('focus-mode') };
    }, { octets, nom });

    const reglageEteint = await page.evaluate(() => {
        const auDepart = pdfDeposeEnGrand;
        // Et l'on repart de l'état éteint, quoi qu'on ait trouvé.
        if (pdfDeposeEnGrand) basculerLePdfEnGrand();
        majReglagesBarre();
        const b = document.getElementById('rp-pdf-en-grand');
        return { auDepart, actif: !!(b && b.classList.contains('actif')), regle: pdfDeposeEnGrand };
    });
    r.egal('le réglage existe, et il est éteint par défaut',
        reglageEteint, { auDepart: false, actif: false, regle: false });

    const sansLOption = await poserUnPdf(octets, 'pose.pdf');
    r.egal('éteint, un PDF posé reste sur le tableau', sansLOption.etat, 0);

    const allume = await page.evaluate(() => {
        const b = document.getElementById('rp-pdf-en-grand');
        b.click();                       // le bouton des réglages, pas la fonction
        return { actif: b.classList.contains('actif'), regle: pdfDeposeEnGrand };
    });
    r.egal('le bouton des réglages l\'allume, et se marque',
        allume, { actif: true, regle: true });

    const avecLOption = await poserUnPdf(octets, 'grand.pdf');
    r.egal('allumé, le PDF part en grand tout seul, sur toute la largeur',
        { etat: avecLOption.etat, cadrage: avecLOption.cadrage, focus: avecLOption.focus },
        { etat: 1, cadrage: 'largeur', focus: true });

    const retenu = await page.evaluate(() => {
        if (presentationEnCours) quitterLaPresentation();
        images.length = 0; selectedItems = []; majBarreDocument();
        return localStorage.getItem('board_pdf_en_grand');
    });
    r.egal('et le choix est retenu d\'une séance à l\'autre', retenu, 'oui');
    await page.evaluate(() => { if (pdfDeposeEnGrand) basculerLePdfEnGrand(); });

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
