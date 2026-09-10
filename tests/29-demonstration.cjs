// UNE AIDE QUI SE MONTRE AU LIEU DE SE LIRE.
//
// « Pour Géomaster, tu as fait un mode démonstration qui est génial. Pourrais-tu
// faire de même pour Au Tableau, avec la possibilité sur le lecteur de choisir
// le chapitre » — puis : « oui et puis l'utilisation de plugin, les classes, les
// outils un peu magiques, les exports », « oui sur un premier démarrage et dans
// l'aide », « tu pars sur une classe générique », « et tu mets un slide de
// vitesse ».
//
// L'ancienne « visite guidée » désignait les quatre coins de l'écran avec des
// bulles — « Barre EN HAUT », « Barre À GAUCHE » — et n'apprenait pas un geste :
// on savait où étaient les meubles, pas ce qu'on pouvait en faire. Celle-ci se
// joue sur le VRAI tableau. Rien n'y est simulé : aucune image, aucun film,
// aucun faux bouton. La main appuie sur les vraies icônes et le tableau fait
// vraiment ce qu'elle raconte.
//
// CE QUE CETTE SUITE TIENT :
//
//   — le sommaire de l'aide est écrit À PARTIR des chapitres, pas recopié à
//     côté. Une ligne ajoutée au programme s'ajoute toute seule, et ne peut pas
//     mentir sur ce que la démonstration montre ;
//   — CHAQUE chapitre fait vraiment quelque chose sur le tableau ;
//   — chaque icône que la démonstration désigne EXISTE dans la page : une
//     démonstration qui montre un bouton absent est pire qu'une absente ;
//   — on peut aller droit à un chapitre PAR SON NOM, et le curseur porte un
//     jalon par chapitre ;
//   — la vitesse se règle pendant qu'on regarde, et se retient ;
//   — la pause SUSPEND et ne recommence pas ;
//   — pendant la démonstration, la souris ne touche plus le tableau ;
//   — elle NE COÛTE RIEN à qui la demande : sa page est retirée, l'outil, les
//     tiroirs et la classe du moment sont rendus, et RIEN NE S'ÉCRIT dans les
//     classes — celle qu'elle montre est inventée et ne vit qu'en mémoire ;
//   — et l'on peut en sortir. Sans quoi une aide deviendrait une prison.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Démonstration');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1360, height: 860 } });

    // Les attentes se compriment ; les gestes, jamais. Ce qui est mesuré reste
    // donc ce qui se passe — seul le temps de regarder est raccourci.
    await page.evaluate(() => { facteurDAttenteDeLaDemo = 0.05; });

    // =====================================================================
    // LE PROGRAMME EST LA SEULE SOURCE
    // =====================================================================
    const programme = await page.evaluate(() => {
        const ch = chapitresDeLaDemonstration();
        const sommaire = [...document.querySelectorAll('#demo-sommaire li')].map(l => l.textContent);
        const listeBarre = [...document.querySelectorAll('#demo-liste [data-chapitre]')]
            .map(b => b.textContent.replace(/^\d+/, ''));
        return {
            titres: ch.map(c => c.titre),
            sommaire, listeBarre,
            tousOntUneAction: ch.every(c => typeof c.faire === 'function'),
            tousOntUnePhrase: ch.every(c => typeof c.dit === 'string' && c.dit.length > 20),
            // L'ancienne visite guidée a bien été retirée, pas laissée à côté.
            ancienne: typeof window.startGuidedTour === 'function'
                || !!document.getElementById('guided-tour-overlay')
        };
    });
    r.verifie('la démonstration a dix chapitres, chacun avec sa phrase et son geste',
        programme.titres.length === 10 && programme.tousOntUneAction && programme.tousOntUnePhrase,
        JSON.stringify({ n: programme.titres.length, action: programme.tousOntUneAction,
                         phrase: programme.tousOntUnePhrase }));
    r.egal('le sommaire de l\'aide est écrit à partir des chapitres, pas recopié',
        programme.sommaire, programme.titres);
    r.egal('et la liste de la barre les nomme tous, dans le même ordre',
        programme.listeBarre, programme.titres);
    r.verifie('l\'ancienne visite guidée, qui ne montrait que les meubles, a été retirée',
        !programme.ancienne, String(programme.ancienne));

    // CE QUE LA DÉMONSTRATION DEMANDE COUVRE BIEN CE QU'ON A DEMANDÉ D'Y METTRE.
    const sujets = await page.evaluate(() => {
        const tout = chapitresDeLaDemonstration()
            .map(c => (c.titre + ' ' + c.dit)).join(' ').toLowerCase();
        return {
            plugins: /tampon|générateur/.test(tout),
            classes: /classe/.test(tout),
            magiques: /redresse|repér|magiq/.test(tout),
            exports: /export/.test(tout),
            documents: /document|découp/.test(tout),
            media: /vidéo|son/.test(tout),
            // « Tu ne parles pas des tableaux et interface et de la
            // possibilité de créer ses toolbars. »
            tableaux: /tableau est un fichier|mes tableaux|dossiers/i.test(tout),
            interface: /interface/i.test(tout),
            barres: /barres d'outils|ses propres barres/i.test(tout)
        };
    });
    r.egal('elle couvre les plugins, les classes, les outils magiques et les exports',
        sujets, { plugins: true, classes: true, magiques: true, exports: true,
                  documents: true, media: true, tableaux: true, interface: true, barres: true });

    // =====================================================================
    // CHAQUE ICÔNE DÉSIGNÉE EXISTE
    // Une démonstration qui montre un bouton absent est pire qu'une absente.
    // =====================================================================
    await page.evaluate(() => {
        // Deux des icônes désignées sont celles du lecteur, qui n'existe
        // qu'une fois une piste déposée — le chapitre le fait lui-même. On
        // en ouvre un pour que la vérification porte sur toutes.
        handleMp3Drop(new File([new Uint8Array(512)], 'essai.mp3', { type: 'audio/mpeg' }));
        // Et la barre d'outils que le chapitre de l'interface fabrique : elle
        // n'existe que le temps de ce chapitre, comme le lecteur.
        renderFloatingToolbar({ id: 'floating-demo', name: 'Ma barre', x: 40, y: 40,
            palette: 'default', titlePalette: 'default', borderPalette: 'default',
            iconSize: '1', items: ['freehand'] });
    });
    await page.waitForTimeout(250);
    const cibles = await page.evaluate(() => {
        // Les sélecteurs que les chapitres désignent, lus dans leur source :
        // c'est la source qui fait foi, pas une liste tenue à côté.
        const src = chapitresDeLaDemonstration().map(c => String(c.faire)).join('\n');
        const trouves = [];
        // Le guillemet du dedans compte : « [data-plugin-key="Tableau de
        // Numération"] » est un sélecteur parfaitement valide, et une lecture
        // qui s'arrête au premier guillemet venu en fabriquait un cassé — le
        // test tombait sur sa propre coupure, pas sur un vrai manque.
        const motif = /g\.(?:viser|montrer)\(\s*(?:outil\(\s*)?(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
        let m;
        while ((m = motif.exec(src))) trouves.push(m[2]);
        const manquants = trouves.filter(sel => {
            const s = sel.startsWith('#') || sel.startsWith('.') ? sel
                : `#system-toolbar-main [data-mode="${sel}"]`;
            return !document.querySelector(s);
        });
        return { trouves, manquants };
    });
    r.verifie('la démonstration désigne au moins six icônes',
        cibles.trouves.length >= 6, JSON.stringify(cibles.trouves));
    r.egal('et chacune existe VRAIMENT dans la page', cibles.manquants, []);
    await page.evaluate(() => {
        // On le referme par son ✕, comme un professeur le ferait : le retirer
        // du DOM laisse l'objet lecteur pointer sur un panneau disparu, et la
        // piste suivante ne s'ouvre plus de la séance.
        const f = document.querySelector('#mp3-player [id$="-close"]');
        if (f) f.click();
        const b = document.getElementById('floating-demo'); if (b) b.remove();
    });

    // =====================================================================
    // ELLE SE JOUE, ET CHAQUE CHAPITRE FAIT QUELQUE CHOSE
    // =====================================================================
    const depart = await page.evaluate(() => {
        // Un tableau qui a déjà servi : c'est lui qu'on devra retrouver intact.
        texts.push({ id: nextId++, type: 'text', x: 40, y: 40, text: 'Le travail du professeur',
                     color: '#2d3436', size: 26, font: 'Roboto', z: globalZ++ });
        setMode('postit');
        draw();
        return { pages: pages.length, page: currentPageIndex, textes: texts.length, outil: mode,
                 classes: ClassesStore._cache };
    });

    await page.evaluate(() => demarrerLaDemonstration());
    await page.waitForTimeout(400);

    const lancee = await page.evaluate(() => ({
        barre: document.getElementById('demo-barre').classList.contains('visible'),
        voile: getComputedStyle(document.getElementById('demo-voile')).display,
        rang: document.getElementById('demo-rang').textContent,
        titre: document.getElementById('demo-titre').textContent,
        // ELLE A SA PAGE, ajoutée en dernier : les pages du professeur ne
        // changent pas de rang.
        pages: pages.length,
        surSaPage: currentPageIndex === pages.length - 1,
        travailIntact: texts.length === 0   // sa page à elle est vierge
    }));
    r.egal('elle s\'ouvre sur son premier chapitre, derrière un voile, sur une page à elle',
        { barre: lancee.barre, voile: lancee.voile, rang: lancee.rang,
          pages: lancee.pages, sienne: lancee.surSaPage },
        { barre: true, voile: 'block', rang: '1/10', pages: depart.pages + 1, sienne: true });

    // CHAQUE CHAPITRE FAIT VRAIMENT QUELQUE CHOSE. On entre dans chacun À
    // FROID, comme le fait le sommaire : c'est ce que le nettoyage d'entrée
    // doit permettre.
    const vides = [];
    const joues = [];
    for (let i = 0; i < 10; i++) {
        await page.evaluate((k) => allerAuChapitre(k), i);
        // CE QU'UN CHAPITRE FAIT SE VOIT PENDANT QU'IL JOUE. Certains
        // montrent un GESTE — on écrit, puis on efface, puis on annule — et
        // ne laissent volontairement rien derrière eux : les juger sur l'état
        // final, c'est les déclarer vides alors qu'ils ont tout montré.
        let agi = false, titre = '';
        for (let k = 0; k < 14 && !agi; k++) {
            await page.waitForTimeout(110);
            const fait = await page.evaluate(() => ({
                titre: document.getElementById('demo-titre').textContent,
                objets: images.length + texts.length + freehands.length + rectangles.length
                    + circles.length + polygons.length,
                lecteur: (() => { const p = document.querySelector('.media-player-panel');
                return !!p && getComputedStyle(p).display !== 'none'; })(),
                main: document.getElementById('demo-main').classList.contains('visible'),
                menu: !!document.querySelector('#classe-menu:not([hidden])')
                    || !!document.querySelector('#export-popup-menu.visible')
                    || !!document.querySelector('#bar-plugins:not(.closed)')
                    || !!document.querySelector('#bottom-drawer:not(.closed)')
            }));
            titre = fait.titre;
            agi = fait.objets > 0 || fait.lecteur || fait.menu || fait.main;
        }
        joues.push(titre);
        if (!agi) vides.push((i + 1) + ' ' + titre);
    }
    r.egal('chacun des dix chapitres agit vraiment sur le tableau', vides, []);

    // =====================================================================
    // LE LECTEUR : LE CHAPITRE PAR SON NOM, LES JALONS, LA VITESSE
    // =====================================================================
    const lecteur = await page.evaluate(async () => {
        // ON VA DROIT AU CHAPITRE PAR SON NOM. Neuf chapitres, c'est trop pour
        // avancer un par un quand on cherche celui du découpage.
        document.getElementById('demo-chapitres').click();
        const ouverte = document.getElementById('demo-liste').classList.contains('ouvert');
        document.querySelector('#demo-liste [data-chapitre="3"]').click();
        await new Promise(r => setTimeout(r, 120));
        const apresLeNom = { rang: document.getElementById('demo-rang').textContent,
                             refermee: !document.getElementById('demo-liste').classList.contains('ouvert'),
                             coche: document.querySelector('#demo-liste [data-chapitre="3"]').classList.contains('actif') };

        // LE CURSEUR TRAVAILLE EN CENTIÈMES : le chapitre est la partie
        // entière, ce qui laisse la pastille avancer À L'INTÉRIEUR d'un
        // chapitre au lieu de sauter d'un jalon au suivant.
        const c = document.getElementById('demo-curseur');
        const max = Number(c.max);
        versLeChapitreDuCurseur(650);
        await new Promise(r => setTimeout(r, 120));
        const apresLeCurseur = document.getElementById('demo-rang').textContent;
        // Un jalon par frontière de chapitre, dessiné dans le fond du curseur.
        const jalons = (c.style.background.match(/rgba\(\s*255,\s*255,\s*255,\s*0\.6\s*\)/g) || []).length;

        return { ouverte, apresLeNom, apresLeCurseur, max, jalons };
    });
    r.egal('la liste ouvre, mène au chapitre nommé, se referme et le coche',
        { ouverte: lecteur.ouverte, ...lecteur.apresLeNom },
        { ouverte: true, rang: '4/10', refermee: true, coche: true });
    r.egal('le curseur va où l\'on veut, et porte un jalon par chapitre',
        { rang: lecteur.apresLeCurseur, max: lecteur.max, jalons: lecteur.jalons },
        { rang: '7/10', max: 1000, jalons: 18 });

    const vitesse = await page.evaluate(() => {
        const c = document.getElementById('demo-vitesse');
        c.value = '1.75';
        c.dispatchEvent(new Event('input', { bubbles: true }));
        const rapide = { valeur: vitesseDeLaDemo,
                         mot: document.getElementById('demo-vitesse-mot').textContent,
                         retenue: localStorage.getItem('auTableau_lecteur_habillage') === null ? null : null };
        const retenue = localStorage.getItem('auTableau_demo_vitesse');
        // Bornée des deux côtés : une valeur bricolée ne dérègle rien.
        reglerLaVitesseDeLaDemo('9');
        const bornee = vitesseDeLaDemo;
        reglerLaVitesseDeLaDemo(1);
        return { valeur: rapide.valeur, mot: rapide.mot, retenue, bornee };
    });
    r.egal('la vitesse se règle pendant qu\'on regarde, se dit, et se retient',
        { valeur: vitesse.valeur, mot: vitesse.mot, retenue: vitesse.retenue },
        { valeur: 1.75, mot: '×1,75', retenue: '1.75' });
    r.egal('et une valeur hors des bornes retombe sur la normale', vitesse.bornee, 1);

    // LA PAUSE SUSPEND, ELLE NE RECOMMENCE PAS.
    const pause = await page.evaluate(async () => {
        const avant = laDemo.i;
        const arret = pauseDeLaDemonstration();
        const bouton = document.getElementById('demo-pause').textContent;
        await new Promise(r => setTimeout(r, 400));
        const pendant = { chapitre: laDemo.i, enPause: laDemo.pause };
        const reprise = pauseDeLaDemonstration();
        return { avant, arret, bouton, pendant, reprise, apres: laDemo.i };
    });
    r.egal('la pause suspend le chapitre en cours, sans le reprendre au début',
        { arret: pause.arret, memeChapitre: pause.pendant.chapitre === pause.avant,
          bouton: pause.bouton, reprise: pause.reprise, encoreLui: pause.apres === pause.avant },
        { arret: true, memeChapitre: true, bouton: '▶', reprise: false, encoreLui: true });

    // =====================================================================
    // LA CLASSE MONTRÉE EST INVENTÉE, ET RIEN NE S'ÉCRIT
    // =====================================================================
    const classes = await page.evaluate(async () => {
        const enMemoire = (ClassesStore._cache || []).map(c => c.name);
        // On force une écriture, comme le ferait un point donné à un élève
        // pendant la visite : elle ne doit PAS atteindre le disque.
        await ClassesStore._ecrire();
        let surLeDisque = null;
        try { surLeDisque = await localforage.getItem('auTableau_classes_v2'); } catch (e) { surLeDisque = 'refusé'; }
        return { enMemoire, surLeDisque: surLeDisque === null ? 'rien' : 'quelque chose',
                 pastille: (document.querySelector('#classe-pastille .cp-nom') || {}).textContent };
    });
    r.egal('la classe montrée est inventée, et le disque n\'a rien reçu',
        { classes: classes.enMemoire, disque: classes.surLeDisque },
        { classes: ['Démonstration — 6e B'], disque: 'rien' });
    r.egal('et la pastille du coin la nomme', classes.pastille, 'Démonstration — 6e B');

    // =====================================================================
    // ON EN SORT, ET ELLE NE COÛTE RIEN
    // =====================================================================
    const sortie = await page.evaluate(() => {
        arreterLaDemonstration();
        return {
            finie: !laDemo,
            barre: document.getElementById('demo-barre').classList.contains('visible'),
            voile: getComputedStyle(document.getElementById('demo-voile')).display,
            main: document.getElementById('demo-main').classList.contains('visible'),
            pages: pages.length,
            page: currentPageIndex,
            textes: texts.map(t => t.text),
            outil: mode,
            classesEnMemoire: ClassesStore._cache,
            // « Il s'en va » veut dire : plus rien à l'écran. Il se referme par
            // son ✕, comme chez un professeur — le panneau reste en coulisse,
            // éteint : l'arracher du DOM cassait le lecteur pour la séance.
            lecteur: (() => { const p = document.querySelector('.media-player-panel');
                return !!p && getComputedStyle(p).display !== 'none'; })(),
            classeDuMoment: localStorage.getItem('AuTableau_classe_du_moment')
        };
    });
    r.egal('elle s\'en va toute entière : barre, voile et main',
        { finie: sortie.finie, barre: sortie.barre, voile: sortie.voile, main: sortie.main },
        { finie: true, barre: false, voile: 'none', main: false });
    r.egal('sa page est retirée, et l\'on retrouve la sienne, telle qu\'on l\'avait laissée',
        { pages: sortie.pages, page: sortie.page, textes: sortie.textes },
        { pages: depart.pages, page: depart.page, textes: ['Le travail du professeur'] });
    r.egal('l\'outil et la classe du moment sont rendus, et le lecteur qu\'elle a ouvert s\'en va',
        { outil: sortie.outil, classes: sortie.classesEnMemoire,
          lecteur: sortie.lecteur, classeDuMoment: sortie.classeDuMoment },
        { outil: depart.outil, classes: depart.classes, lecteur: false, classeDuMoment: null });

    // ON PEUT AUSSI EN SORTIR AU CLAVIER : sans quoi une aide deviendrait une
    // prison — le voile avale justement tous les autres gestes.
    const echap = await page.evaluate(async () => {
        demarrerLaDemonstration();
        await new Promise(r => setTimeout(r, 150));
        const dedans = !!laDemo;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        return { dedans, dehors: !laDemo, pages: pages.length };
    });
    r.egal('Échap la referme, et rend sa page avec',
        echap, { dedans: true, dehors: true, pages: depart.pages });

    // =====================================================================
    // ON DOIT VOIR CE QU'ELLE FAIT
    // « Le trait ne suit pas exactement le curseur. Pars d'un fond blanc.
    //   On ne voit pas la barre du pdf, cachée par le lecteur. On ne voit pas
    //   sur quoi tu cliques ou les combinaisons de touches. J'ai l'impression
    //   de ne rien avoir appris. » — tout ce bloc répond à cela.
    // =====================================================================

    // LE FOND. Une visite ouverte sur du Seyes montrait ses traits par-dessus
    // une réglure : on ne voyait plus ce qu'elle dessinait.
    const fond = await page.evaluate(async () => {
        currentBgIndex = 2;                      // du Seyes avant la visite
        demarrerLaDemonstration();
        await new Promise(r => setTimeout(r, 150));
        const pendant = backgrounds[currentBgIndex];
        arreterLaDemonstration();
        await new Promise(r => setTimeout(r, 150));
        const apres = backgrounds[currentBgIndex];
        currentBgIndex = 0; draw();
        return { pendant, apres };
    });
    r.egal('elle part d\'une page blanche, et rend le fond d\'avant en sortant',
        fond, { pendant: 'blanc', apres: 'seyes' });

    // LA MAIN COLLE AU TRAIT. Elle se rendait au point suivant en 120 ms
    // d'animation, alors qu'un point tombe toutes les 38 ms : trois points de
    // retard en permanence, et le trait sortait DEVANT elle.
    const mainCollee = await page.evaluate(() => {
        const m = document.getElementById('demo-main');
        m.className = 'visible';
        const glisse = getComputedStyle(m).transitionProperty;
        m.classList.add('trace');
        const collee = getComputedStyle(m).transitionProperty;
        m.className = '';
        return { glisse, collee };
    });
    r.verifie('hors tracé, la main glisse jusqu\'à son point',
        /left/.test(mainCollee.glisse) && /top/.test(mainCollee.glisse), JSON.stringify(mainCollee));
    r.verifie('mais pendant un tracé elle est LÀ où le trait se pose, sans retard',
        !/left/.test(mainCollee.collee) && !/top/.test(mainCollee.collee), JSON.stringify(mainCollee));

    // L'ONDE DU CLIC ET LES TOUCHES. On voyait l'effet, jamais le geste.
    const gestesVus = await page.evaluate(async () => {
        demarrerLaDemonstration();
        const d = laDemo;
        const g = gestesDeLaDemo(d, d.jeton);
        // L'onde part du point touché, et repart d'un second clic au même
        // endroit : deux clics de suite ne doivent pas n'en montrer qu'un.
        g.onde(400, 300);
        const o = document.getElementById('demo-clic');
        const premiere = { visible: getComputedStyle(o).display, x: o.style.left, y: o.style.top,
                           anime: o.classList.contains('frappe') };
        g.onde(700, 500);
        const seconde = { x: o.style.left, anime: o.classList.contains('frappe') };

        // Le bouton visé se détache AVANT d'être cliqué.
        const crayon = document.querySelector('#system-toolbar-main [data-mode="freehand"]');
        g.souligner(crayon);
        const souligne = !!crayon && crayon.classList.contains('demo-vise');
        g.souligner(null);
        const relache = !!crayon && !crayon.classList.contains('demo-vise');

        // Les touches se montrent, s'enfoncent, et font l'action AU MOMENT où
        // elles sont enfoncées — pas avant.
        let faitQuand = null;
        const attente = g.touches(['Ctrl', 'Z'], () => {
            faitQuand = [...document.querySelectorAll('#demo-touches .demo-touche')]
                .every(c => c.classList.contains('enfoncee'));
        });
        await new Promise(r => setTimeout(r, 120));
        const boite = document.getElementById('demo-touches');
        const montrees = { visible: boite.classList.contains('visible'),
                           caps: [...boite.querySelectorAll('.demo-touche')].map(c => c.textContent),
                           plus: boite.querySelectorAll('.demo-plus').length };
        await attente;
        const rangees = !boite.classList.contains('visible') && boite.children.length === 0;
        arreterLaDemonstration();
        return { premiere, seconde, souligne, relache, montrees, faitQuand, rangees };
    });
    r.egal('l\'onde du clic part du point touché',
        { visible: gestesVus.premiere.visible, x: gestesVus.premiere.x, y: gestesVus.premiere.y,
          anime: gestesVus.premiere.anime },
        { visible: 'block', x: '400px', y: '300px', anime: true });
    r.egal('et un second clic la relance ailleurs', gestesVus.seconde, { x: '700px', anime: true });
    r.verifie('le bouton visé se détache avant d\'être cliqué, puis se relâche',
        gestesVus.souligne && gestesVus.relache, JSON.stringify(gestesVus));
    r.egal('les combinaisons de touches se montrent, touche par touche',
        gestesVus.montrees, { visible: true, caps: ['Ctrl', 'Z'], plus: 1 });
    r.verifie('et l\'action se fait quand les touches sont enfoncées, pas avant',
        gestesVus.faitQuand === true, String(gestesVus.faitQuand));
    r.verifie('puis le cartouche se range', gestesVus.rangees, String(gestesVus.rangees));

    // LA BARRE DE LA VISITE NE CACHE PLUS CELLE DU DOCUMENT. Le chapitre du
    // document passe en plein écran EN COURS DE ROUTE : la barre de la visite
    // restait alors en bas, exactement là où celle du document venait de se
    // poser.
    const deuxBarres = await page.evaluate(async () => {
        demarrerLaDemonstration();
        const barre = document.getElementById('demo-barre');
        const enBas = barre.classList.contains('en-haut');
        toggleFocusMode();
        await new Promise(r => setTimeout(r, 60));
        const enHaut = barre.classList.contains('en-haut');
        // Et elles ne se recouvrent pas : on mesure les deux rectangles.
        images.push({ id: nextId++, x: 40, y: 40, w: 300, h: 400, z: globalZ++ });
        selectedItems = [{ type: 'image', id: images[0].id }];
        majBarreDocument();
        await new Promise(r => setTimeout(r, 60));
        const a = barre.getBoundingClientRect();
        const b = document.getElementById('bar-document').getBoundingClientRect();
        const chevauche = !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
        toggleFocusMode();
        arreterLaDemonstration();
        return { enBas, enHaut, chevauche, demo: Math.round(a.top), doc: Math.round(b.top) };
    });
    r.verifie('la barre de la visite monte dès qu\'on passe en plein écran',
        gestesVus && deuxBarres.enBas === false && deuxBarres.enHaut === true, JSON.stringify(deuxBarres));
    r.verifie('et elle ne recouvre plus la barre du document',
        !deuxBarres.chevauche, JSON.stringify(deuxBarres));

    // LE CHAPITRE DES OUTILS OUVRE VRAIMENT LA FENÊTRE DU PLUGIN. Il appelait
    // la fonction du plugin en douce : on voyait le tableau apparaître sans
    // avoir rien vu ni choisi — « on ne voit pas l'ouverture des plugins ».
    await page.evaluate(() => { facteurDAttenteDeLaDemo = 0.05; });
    await page.evaluate(() => { demarrerLaDemonstration(); allerAuChapitre(4); });
    let fenetreVue = false, casesVues = 0;
    for (let k = 0; k < 60 && !fenetreVue; k++) {
        await page.waitForTimeout(150);
        const vu = await page.evaluate(() => {
            const m = document.getElementById('custom-prompt-modal');
            return { ouverte: !!m && getComputedStyle(m).display !== 'none',
                     cases: document.querySelectorAll('#custom-prompt-inputs .prompt-case').length };
        });
        if (vu.ouverte) { fenetreVue = true; casesVues = vu.cases; }
    }
    r.verifie('le chapitre des outils ouvre pour de vrai la fenêtre du plugin',
        fenetreVue && casesVues >= 3, JSON.stringify({ fenetreVue, casesVues }));

    // Et ce qu'il ouvre, il le referme. Deux sorties à vérifier, car ce sont
    // deux chemins différents : changer de chapitre en plein milieu, et
    // arrêter la visite.
    const fermee = () => page.evaluate(() => {
        const m = document.getElementById('custom-prompt-modal');
        return !m || getComputedStyle(m).display === 'none';
    });
    await page.evaluate(() => allerAuChapitre(0));
    await page.waitForTimeout(300);
    const apresChangement = await fermee();
    r.verifie('changer de chapitre referme la fenêtre du plugin restée ouverte',
        apresChangement, String(apresChangement));

    await page.evaluate(() => { allerAuChapitre(4); });
    for (let k = 0; k < 60; k++) {
        await page.waitForTimeout(150);
        if (!(await fermee())) break;
    }
    await page.evaluate(() => arreterLaDemonstration());
    await page.waitForTimeout(250);
    const apresLaFenetre = await fermee();
    r.verifie('et arrêter la visite la referme aussi',
        apresLaFenetre, String(apresLaFenetre));

    // =====================================================================
    // CE QU'ELLE MONTRE NE DÉRANGE RIEN, ET NE SE MET PAS EN TRAVERS
    // =====================================================================

    // LE HALO NE DÉPLACE PAS CE QU'IL DÉSIGNE. Il posait « position: relative »
    // pour que son z-index prenne : tout élément déjà positionné en « fixed »
    // — le tiroir du bas — retombait alors dans le flux et allait flotter au
    // milieu de la page. « Y a eu un décroché du tiroir du bas ! »
    const halo = await page.evaluate(async () => {
        demarrerLaDemonstration();
        const g = gestesDeLaDemo(laDemo, laDemo.jeton);
        const t = document.getElementById('bottom-drawer');
        if (t.classList.contains('closed')) toggleBottomDrawer();
        await new Promise(r => setTimeout(r, 300));
        const avant = Math.round(t.getBoundingClientRect().top);
        g.souligner(t);
        const pendant = { top: Math.round(t.getBoundingClientRect().top),
                          pos: getComputedStyle(t).position,
                          marque: t.classList.contains('demo-vise') };
        g.souligner(null);
        const apres = { top: Math.round(t.getBoundingClientRect().top),
                        style: t.getAttribute('style') || '' };
        // Et celui qui n'a AUCUNE position en reçoit une le temps du halo —
        // sans quoi son z-index ne prendrait pas — puis la rend.
        const sans = document.createElement('div');
        sans.style.width = '20px'; sans.style.height = '20px';
        document.body.appendChild(sans);
        const pretAvant = getComputedStyle(sans).position;
        g.souligner(sans);
        const pretPendant = getComputedStyle(sans).position;
        g.souligner(null);
        const pretApres = { pos: getComputedStyle(sans).position, style: sans.getAttribute('style') };
        sans.remove();
        if (!t.classList.contains('closed')) toggleBottomDrawer();
        arreterLaDemonstration();
        return { avant, pendant, apres, pretAvant, pretPendant, pretApres };
    });
    r.verifie('le halo désigne sans déplacer : un meuble en « fixed » ne décroche pas',
        halo.pendant.top === halo.avant && halo.pendant.pos === 'fixed' && halo.pendant.marque,
        JSON.stringify(halo));
    r.verifie('et il ne laisse rien derrière lui', halo.apres.top === halo.avant && !halo.apres.style,
        JSON.stringify(halo));
    r.egal('celui qui n\'a pas de position en reçoit une, puis la rend',
        { avant: halo.pretAvant, pendant: halo.pretPendant, apres: halo.pretApres.pos },
        { avant: 'static', pendant: 'relative', apres: 'static' });

    // LE DÉCOUPAGE SE MONTRE AVEC SON CADRE. Le chapitre appelait la fonction
    // de découpe en douce pendant que la main faisait le tour du rectangle :
    // on voyait la main bouger, jamais le cadre en pointillés.
    await page.evaluate(() => { demarrerLaDemonstration(); allerAuChapitre(3); });
    let ciseauxVus = false, cadreVu = false;
    for (let k = 0; k < 80 && !cadreVu; k++) {
        await page.waitForTimeout(120);
        const e = await page.evaluate(() => ({
            armes: typeof decoupeActive !== 'undefined' && decoupeActive,
            cadre: !!(typeof decoupeGeste !== 'undefined' && decoupeGeste && decoupeGeste.rect
                      && decoupeGeste.rect.l > 4 && decoupeGeste.rect.h > 4)
        }));
        if (e.armes) ciseauxVus = true;
        if (e.cadre) cadreVu = true;
    }
    let decoupes = 0;
    for (let k = 0; k < 60 && decoupes < 1; k++) {
        await page.waitForTimeout(150);
        decoupes = await page.evaluate(() => morceauxEnAttente.length);
    }
    await page.evaluate(() => arreterLaDemonstration());
    r.verifie('le chapitre du découpage arme pour de vrai les ciseaux', ciseauxVus, String(ciseauxVus));
    r.verifie('et le cadre en pointillés se trace sous la main', cadreVu, String(cadreVu));
    r.verifie('les morceaux partent bien au tiroir', decoupes >= 1, String(decoupes));

    // LA BARRE DE LA VISITE MONTE AUSSI QUAND LE TIROIR DU BAS S'OUVRE — le
    // chapitre des exports l'ouvre justement pour le montrer, et la visite
    // s'expliquait par-dessus.
    const placement = await page.evaluate(async () => {
        demarrerLaDemonstration();
        const barre = document.getElementById('demo-barre');
        const bas = document.getElementById('bottom-drawer');
        if (!bas.classList.contains('closed')) toggleBottomDrawer();
        await new Promise(r => setTimeout(r, 120));
        const ferme = barre.classList.contains('en-haut');
        toggleBottomDrawer();
        await new Promise(r => setTimeout(r, 120));
        const ouvert = barre.classList.contains('en-haut');
        toggleBottomDrawer();
        arreterLaDemonstration();
        return { ferme, ouvert };
    });
    r.egal('la barre de la visite monte dès que le tiroir du bas s\'ouvre',
        placement, { ferme: false, ouvert: true });

    // LE LECTEUR D'UN CHAPITRE S'EN VA AVEC LUI. Celui de la dictée restait
    // ouvert par-dessus le chapitre des exports, à jouer sa piste.
    await page.evaluate(() => { demarrerLaDemonstration(); allerAuChapitre(7); });
    let lecteurVu = false;
    for (let k = 0; k < 40 && !lecteurVu; k++) {
        await page.waitForTimeout(150);
        lecteurVu = await page.evaluate(() => !!document.querySelector('.media-player-panel'));
    }
    const lecteurRange = await page.evaluate(async () => {
        const ouverts = () => [...document.querySelectorAll('.media-player-panel')]
            .filter(p => getComputedStyle(p).display !== 'none').length;
        const avant = ouverts();
        allerAuChapitre(0);
        await new Promise(r => setTimeout(r, 250));
        const apres = ouverts();
        arreterLaDemonstration();
        return { avant, apres };
    });
    r.egal('le lecteur d\'un chapitre ne déborde pas sur le suivant',
        { avant: lecteurRange.avant > 0, apres: lecteurRange.apres }, { avant: true, apres: 0 });

    // ET LA BARRE D'OUTILS QU'ELLE FABRIQUE N'EST PAS ENREGISTRÉE. L'interface
    // du professeur est à lui : la visite la montre, elle ne la remplace pas.
    const avantInterface = await page.evaluate(() => {
        demarrerLaDemonstration(); allerAuChapitre(8);
        return localStorage.getItem('board_floating_toolbars');
    });
    let barreVue = false;
    for (let k = 0; k < 60 && !barreVue; k++) {
        await page.waitForTimeout(150);
        barreVue = await page.evaluate(() => !!document.getElementById('floating-demo'));
    }
    const interfaceIntacte = await page.evaluate(async (avant) => {
        arreterLaDemonstration();
        await new Promise(r => setTimeout(r, 250));
        return { intact: localStorage.getItem('board_floating_toolbars') === avant,
                 reste: !!document.getElementById('floating-demo') };
    }, avantInterface);
    interfaceIntacte.pendant = barreVue;
    r.verifie('la barre qu\'elle fabrique se voit vraiment…', interfaceIntacte.pendant,
        JSON.stringify(interfaceIntacte));
    r.verifie('…mais l\'interface du professeur n\'a rien reçu, et la barre s\'en va avec elle',
        interfaceIntacte.intact && !interfaceIntacte.reste, JSON.stringify(interfaceIntacte));

    // ET SI LE PROFESSEUR S'EST FAIT SA PANOPLIE ? « Est-ce que ça fonctionne
    // aussi ? » — non : la visite désigne les VRAIS boutons de la vraie barre
    // (« le crayon est le premier », et la main appuie dessus), et celle d'un
    // professeur qui s'est fait la sienne peut ne plus les contenir. La main
    // désignait alors le vide, et l'outil changeait tout seul. On repose donc
    // la barre d'origine pour la durée de la visite — SANS RIEN ÉCRIRE — et
    // l'on rend la sienne en sortant.
    const panoplie = await page.evaluate(async () => {
        const garde = localStorage.getItem('board_floating_toolbars');
        localStorage.setItem('board_floating_toolbars', JSON.stringify([
            { id: 'system-toolbar-main', name: 'Mes outils', x: 20, y: 80,
              titlePalette: 'default', palette: 'default', borderPalette: 'default',
              iconSize: '1', cols: 2, protected: true,
              initialItems: ['pointer', 'text', 'laser'], items: ['pointer', 'text', 'laser'] },
            { id: 'floating-perso', name: 'Géométrie', x: 400, y: 300,
              titlePalette: 'default', palette: 'default', borderPalette: 'default',
              iconSize: '1', cols: 2, items: ['segment', 'circle'] }
        ]));
        renderFloatingToolbars();
        const lire = () => ({
            barres: [...document.querySelectorAll('#custom-bars-container .custom-toolbar')].map(b => b.id),
            crayon: !!document.querySelector('#system-toolbar-main [data-mode="freehand"]'),
            gomme: !!document.querySelector('#system-toolbar-main [data-mode="eraser"]'),
            stock: (JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]')
                .find(t => t.id === 'system-toolbar-main') || {}).items
        });
        const sienne = lire();
        demarrerLaDemonstration();
        await new Promise(r => setTimeout(r, 250));
        const pendant = lire();
        // TOUT CE QUI RAFRAÎCHIT LES BARRES pendant la visite — l'arrimage des
        // favoris, une seconde et demie après le chargement — lui rendait sa
        // panoplie AU MILIEU d'un chapitre, et la main se remettait à désigner
        // des boutons absents.
        renderFloatingToolbars();
        const apresUnRafraichissement = lire();
        arreterLaDemonstration();
        await new Promise(r => setTimeout(r, 250));
        const apres = lire();
        if (garde === null) localStorage.removeItem('board_floating_toolbars');
        else localStorage.setItem('board_floating_toolbars', garde);
        renderFloatingToolbars();
        return { sienne, pendant, apresUnRafraichissement, apres };
    });
    r.egal('une panoplie personnalisée peut n\'avoir ni crayon ni gomme',
        { crayon: panoplie.sienne.crayon, gomme: panoplie.sienne.gomme,
          barres: panoplie.sienne.barres },
        { crayon: false, gomme: false, barres: ['system-toolbar-main', 'floating-perso'] });
    r.egal('la visite repose la barre d\'origine, et n\'écrit rien chez lui',
        { crayon: panoplie.pendant.crayon, gomme: panoplie.pendant.gomme,
          barres: panoplie.pendant.barres, stock: panoplie.pendant.stock },
        { crayon: true, gomme: true, barres: ['system-toolbar-main'],
          stock: ['pointer', 'text', 'laser'] });
    r.egal('un rafraîchissement au milieu de la visite ne lui rend pas la sienne trop tôt',
        { crayon: panoplie.apresUnRafraichissement.crayon,
          barres: panoplie.apresUnRafraichissement.barres },
        { crayon: true, barres: ['system-toolbar-main'] });
    r.egal('et elle lui est rendue en sortant, ses barres à lui comprises',
        { crayon: panoplie.apres.crayon, barres: panoplie.apres.barres,
          stock: panoplie.apres.stock },
        { crayon: false, barres: ['system-toolbar-main', 'floating-perso'],
          stock: ['pointer', 'text', 'laser'] });

    // ON VOIT L'ICÔNE PARTIR DU TIROIR. « On ne voit pas la création de toolbar
    // par glisser-déposer des icônes » : le chapitre le DISAIT, et la barre
    // apparaissait toute seule une seconde plus tard, ailleurs. Et « le lecteur
    // est en haut » : la barre de la visite était montée pour le tiroir du bas,
    // juste devant le tiroir des outils qu'on allait ouvrir.
    await page.evaluate(() => { demarrerLaDemonstration(); allerAuChapitre(8); });
    const glisse = { fantome: false, enHaut: true, outils: 0, tiroir: false };
    for (let k = 0; k < 220; k++) {
        await page.waitForTimeout(90);
        const e = await page.evaluate(() => ({
            fantome: getComputedStyle(document.getElementById('drag-ghost')).display !== 'none',
            enHaut: document.getElementById('demo-barre').classList.contains('en-haut'),
            tiroir: !document.getElementById('bar-plugins').classList.contains('closed'),
            outils: document.querySelectorAll('#floating-demo .cwrap .btn').length,
            dit: document.getElementById('demo-dit').textContent
        }));
        if (e.fantome) { glisse.fantome = true; glisse.enHaut = glisse.enHaut && e.enHaut; }
        if (e.tiroir) glisse.tiroir = true;
        glisse.outils = Math.max(glisse.outils, e.outils);
        if (/revient intacte/.test(e.dit)) break;
    }
    await page.evaluate(() => arreterLaDemonstration());
    r.verifie('le chapitre de l\'interface ouvre le tiroir des outils',
        glisse.tiroir, JSON.stringify(glisse));
    r.verifie('et l\'on voit l\'icône quitter le tiroir : le fantôme suit la main',
        glisse.fantome, JSON.stringify(glisse));
    r.verifie('la barre de la visite est redescendue : elle ne couvre plus le tiroir des outils',
        glisse.fantome && !glisse.enHaut, JSON.stringify(glisse));
    r.verifie('et la barre qui naît porte VRAIMENT les outils qu\'on y a déposés',
        glisse.outils >= 2, JSON.stringify(glisse));

    // LES INSTRUMENTS POSÉS D'AVANT NE RESTENT PAS PLANTÉS DANS LA VISITE.
    const instruments = await page.evaluate(async () => {
        document.querySelector('.btn[data-widget="compass"]').click();
        const avant = activeWidgets.compass;
        demarrerLaDemonstration();
        await new Promise(r => setTimeout(r, 250));
        const pendant = activeWidgets.compass;
        arreterLaDemonstration();
        await new Promise(r => setTimeout(r, 200));
        const apres = activeWidgets.compass;
        document.querySelector('.btn[data-widget="compass"]').click();
        return { avant, pendant, apres };
    });
    r.egal('un compas posé d\'avant ne reste pas planté au milieu de la visite…',
        { avant: instruments.avant, pendant: instruments.pendant }, { avant: true, pendant: false });
    r.egal('…et il est rendu en sortant', instruments.apres, true);

    // ON DIT AVANT D'OUVRIR. « N'ouvre peut-être pas le tiroir des tableaux et
    // des interfaces tout de suite » : les deux tiroirs se dépliaient dans la
    // première seconde du chapitre, avant qu'on ait lu d'où cela venait — le
    // temps de suivre la phrase, l'écran avait déjà changé deux fois.
    for (const [rang, nom] of [[8, 'des tableaux et de l\'interface'], [9, 'des exports']]) {
        await page.evaluate((k) => { demarrerLaDemonstration(); allerAuChapitre(k); }, rang);
        let tourDeLaPhrase = -1, tourDuTiroir = -1;
        for (let k = 0; k < 60 && tourDuTiroir < 0; k++) {
            await page.waitForTimeout(60);
            const e = await page.evaluate(() => ({
                dit: document.getElementById('demo-dit').textContent.trim().length > 0,
                // Le tiroir de droite s'ouvre par « open » quand les deux
                // autres se ferment par « closed » : le lire à l'envers, c'est
                // le croire ouvert en permanence.
                tiroir: !document.getElementById('bottom-drawer').classList.contains('closed')
                    || document.getElementById('right-drawer').classList.contains('open')
            }));
            if (e.dit && tourDeLaPhrase < 0) tourDeLaPhrase = k;
            if (e.tiroir && tourDuTiroir < 0) tourDuTiroir = k;
        }
        await page.evaluate(() => arreterLaDemonstration());
        r.verifie('le chapitre ' + nom + ' parle avant d\'ouvrir un tiroir',
            tourDeLaPhrase >= 0 && tourDuTiroir > tourDeLaPhrase,
            JSON.stringify({ phrase: tourDeLaPhrase, tiroir: tourDuTiroir }));
    }

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
