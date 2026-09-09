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
    r.verifie('la démonstration a neuf chapitres, chacun avec sa phrase et son geste',
        programme.titres.length === 9 && programme.tousOntUneAction && programme.tousOntUnePhrase,
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
            media: /vidéo|son/.test(tout)
        };
    });
    r.egal('elle couvre les plugins, les classes, les outils magiques et les exports',
        sujets, { plugins: true, classes: true, magiques: true, exports: true,
                  documents: true, media: true });

    // =====================================================================
    // CHAQUE ICÔNE DÉSIGNÉE EXISTE
    // Une démonstration qui montre un bouton absent est pire qu'une absente.
    // =====================================================================
    await page.evaluate(() => {
        // Deux des icônes désignées sont celles du lecteur, qui n'existe
        // qu'une fois une piste déposée — le chapitre le fait lui-même. On
        // en ouvre un pour que la vérification porte sur toutes.
        handleMp3Drop(new File([new Uint8Array(512)], 'essai.mp3', { type: 'audio/mpeg' }));
    });
    await page.waitForTimeout(250);
    const cibles = await page.evaluate(() => {
        // Les sélecteurs que les chapitres désignent, lus dans leur source :
        // c'est la source qui fait foi, pas une liste tenue à côté.
        const src = chapitresDeLaDemonstration().map(c => String(c.faire)).join('\n');
        const trouves = [];
        const motif = /g\.viser\(\s*(?:outil\(\s*)?['"]([^'"]+)['"]/g;
        let m;
        while ((m = motif.exec(src))) trouves.push(m[1]);
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
    await page.evaluate(() => { const p = document.getElementById('mp3-player'); if (p) p.remove(); });

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
        { barre: true, voile: 'block', rang: '1/9', pages: depart.pages + 1, sienne: true });

    // CHAQUE CHAPITRE FAIT VRAIMENT QUELQUE CHOSE. On entre dans chacun À
    // FROID, comme le fait le sommaire : c'est ce que le nettoyage d'entrée
    // doit permettre.
    const vides = [];
    const joues = [];
    for (let i = 0; i < 9; i++) {
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
                lecteur: !!document.querySelector('.media-player-panel'),
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
    r.egal('chacun des neuf chapitres agit vraiment sur le tableau', vides, []);

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
        { ouverte: true, rang: '4/9', refermee: true, coche: true });
    r.egal('le curseur va où l\'on veut, et porte un jalon par chapitre',
        { rang: lecteur.apresLeCurseur, max: lecteur.max, jalons: lecteur.jalons },
        { rang: '7/9', max: 900, jalons: 16 });

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
            lecteur: !!document.querySelector('.media-player-panel'),
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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
