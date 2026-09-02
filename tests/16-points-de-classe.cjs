// Le système de points : bonus, malus, seuils, avatars-monstres, et la feuille
// posée au tableau. Plus l'option « au plus grand » des deux générateurs.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Points de classe');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins.classPointsTool, { timeout: 20000 });

    // Une classe de démonstration, écrite directement dans « Mes classes »
    await page.evaluate(async () => {
        const eleves = ['Amel', 'Brice', 'Chloé', 'Dana', 'Elias', 'Fanny'].map((n, i) => ({ id: 'stu_' + i, name: n }));
        await ClassesStore.saveAll([{ id: 'cls_test', name: '5e B', students: eleves, updatedAt: Date.now() }]);
        ClassesStore._cache = null;
    });

    const t = () => page.evaluate(() => PluginManager.plugins.classPointsTool);

    // --- OUVERTURE ---
    await page.evaluate(async () => {
        const p = PluginManager.plugins.classPointsTool;
        p.classes = await ClassesStore.loadAll();
        p.classeId = 'cls_test';
        p.construire();
        p.rendre();
    });
    await page.waitForTimeout(200);

    const fenetre = await page.evaluate(() => {
        const el = document.getElementById('points-widget');
        const b = el.getBoundingClientRect();
        return {
            visible: getComputedStyle(el).display !== 'none',
            cartes: el.querySelectorAll('.pts-carte').length,
            avatars: el.querySelectorAll('.pts-carte svg').length,
            dansEcran: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1
        };
    });
    r.verifie('la fenêtre des points s\'ouvre', fenetre.visible);
    r.egal('une carte par élève', fenetre.cartes, 6);
    r.egal('chaque carte porte un avatar dessiné', fenetre.avatars, 6);
    r.verifie('la fenêtre tient dans l\'écran', fenetre.dansEcran, JSON.stringify(fenetre));

    // --- COMPTER ---
    const compte = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const cartes = () => document.querySelectorAll('#points-widget .pts-carte');
        cartes()[0].click(); cartes()[0].click(); cartes()[2].click();   // mode bonus par défaut
        document.getElementById('pts-mode-moins').click();
        cartes()[1].click();
        const cl = p.classeCourante();
        return cl.students.map(s => s.pts || { plus: 0, moins: 0 });
    });
    r.egal('un clic donne un point positif', compte[0], { plus: 2, moins: 0, etoiles: 0 });
    r.egal('en mode malus, un clic donne un point négatif', compte[1], { plus: 0, moins: 1, etoiles: 0 });
    r.egal('les autres élèves ne bougent pas', compte[3], { plus: 0, moins: 0, etoiles: 0 });

    const annule = await page.evaluate(() => {
        document.getElementById('pts-annuler').click();
        const p = PluginManager.plugins.classPointsTool;
        return p.classeCourante().students[1].pts;
    });
    r.egal('on peut annuler le dernier point', annule, { plus: 0, moins: 0, etoiles: 0 });

    const memorise = await page.evaluate(async () => {
        ClassesStore._cache = null;
        const relu = await ClassesStore.loadAll();
        return relu[0].students[0].pts;
    });
    r.egal('les points sont enregistrés avec la classe', memorise, { plus: 2, moins: 0, etoiles: 0 });

    // --- AFFICHAGE : DEUX TOTAUX OU SOLDE ---
    const affichage = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const lire = () => document.querySelectorAll('#points-widget .pts-carte')[0].innerText.replace(/\s+/g, ' ').trim();
        p.reglages.affichage = 'deux'; p.rendre();
        const deux = lire();
        p.reglages.affichage = 'solde'; p.rendre();
        const solde = lire();
        p.reglages.affichage = 'deux'; p.rendre();
        return { deux, solde };
    });
    r.verifie('en « deux totaux », les positifs et les négatifs sont séparés',
        /2\s*0/.test(affichage.deux), affichage.deux);
    r.verifie('en « solde », un seul nombre signé', /\+2/.test(affichage.solde), affichage.solde);

    // --- SEUIL : LA NOTE ET L'ÉTOILE ---
    const seuil = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const eleve = p.classeCourante().students[0];
        eleve.pts = { plus: 20, moins: 0, etoiles: 0 };
        p.rendre();
        const bouton = !!document.querySelectorAll('#points-widget .pts-carte')[0].querySelector('.pts-note');
        p.convertirEnNote(eleve.id);
        return { bouton, apres: eleve.pts };
    });
    r.verifie('à 20 points, la carte propose de mettre la note', seuil.bouton);
    r.egal('la note retire les 20 points et ajoute une étoile', seuil.apres, { plus: 0, moins: 0, etoiles: 1 });

    const seuilRegle = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        p.reglages.seuilNote = 10;
        const eleve = p.classeCourante().students[3];
        eleve.pts = { plus: 10, moins: 0, etoiles: 0 };
        p.rendre();
        const propose = !!document.querySelectorAll('#points-widget .pts-carte')[3].querySelector('.pts-note');
        p.reglages.seuilNote = 20;
        return propose;
    });
    r.verifie('le seuil est réglable', seuilRegle);

    // --- AVATARS ---
    const avatars = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const eleves = p.classeCourante().students;
        const traits = eleves.map(e => JSON.stringify(p.traitsAvatar(e)));
        const deuxFois = JSON.stringify(p.traitsAvatar(eleves[0]));
        return { distincts: new Set(traits).size, total: traits.length, stable: deuxFois === traits[0] };
    });
    r.verifie('chaque élève a son propre monstre', avatars.distincts >= 4, `${avatars.distincts}/${avatars.total} différents`);
    r.verifie('et c\'est toujours le même pour lui', avatars.stable);

    const perso = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const eleve = p.classeCourante().students[0];
        p.editionAvatar = eleve.id;
        p.rendre();
        const choix = document.querySelectorAll('#points-widget .pts-trait').length;
        // on choisit une couleur, puis un corps
        const bleu = Array.from(document.querySelectorAll('#points-widget .pts-trait'))
            .find(b => b.dataset.cle === 'teinte' && b.dataset.v === '#0984e3');
        bleu.click();
        const corps = Array.from(document.querySelectorAll('#points-widget .pts-trait'))
            .find(b => b.dataset.cle === 'corps' && b.dataset.v === 'bloc');
        corps.click();
        return { choix, avatar: eleve.avatar, svg: p.avatarSVG(eleve, 40) };
    });
    r.verifie('l\'éditeur propose les traits du monstre', perso.choix >= 20, `${perso.choix} choix`);
    r.verifie('la couleur choisie est retenue', perso.avatar.teinte === '#0984e3', JSON.stringify(perso.avatar));
    r.verifie('le corps choisi aussi', perso.avatar.corps === 'bloc', JSON.stringify(perso.avatar));
    r.verifie('et le dessin en tient compte', perso.svg.includes('#0984e3') && perso.svg.includes('<rect'), perso.svg.slice(0, 120));

    const hasard = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const eleve = p.classeCourante().students[0];
        document.getElementById('pts-hasard').click();
        const tire = JSON.stringify(eleve.avatar);
        document.getElementById('pts-defaut').click();
        return { tire, apresDefaut: eleve.avatar === undefined };
    });
    r.verifie('« au hasard » redessine le monstre', hasard.tire.length > 20, hasard.tire);
    r.verifie('« monstre d\'origine » efface la personnalisation', hasard.apresDefaut);

    await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        p.editionAvatar = null; p.rendre();
    });

    // --- RETIRER UN POINT À LA MAIN ---
    // L'annulation ne défait que le dernier geste : pour corriger une erreur
    // repérée plus tard, il faut pouvoir désigner le compteur fautif.
    const correction = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        const eleve = p.classeCourante().students[2];
        eleve.pts = { plus: 3, moins: 2, etoiles: 1 };
        p.mode = 'plus'; p.rendre();
        const enModeNormal = w.querySelectorAll('.pts-compteur').length;

        w.querySelector('#pts-mode-retirer').click();
        const carte = () => w.querySelector('.pts-carte[data-id="' + eleve.id + '"]');
        const cibles = carte().querySelectorAll('.pts-compteur').length;
        const consigne = !!w.querySelector('#pts-consigne');

        carte().querySelector('.pts-compteur[data-champ="plus"]').click();
        const apresPlus = Object.assign({}, eleve.pts);
        carte().querySelector('.pts-compteur[data-champ="moins"]').click();
        const apresMoins = Object.assign({}, eleve.pts);
        carte().querySelector('.pts-compteur[data-champ="etoiles"]').click();
        const apresEtoile = Object.assign({}, eleve.pts);

        // le plancher : on ne descend pas sous zéro
        eleve.pts = { plus: 0, moins: 0, etoiles: 0 }; p.rendre();
        carte().querySelector('.pts-compteur[data-champ="plus"]').click();
        const plancher = Object.assign({}, eleve.pts);

        // et l'annulation rend ce qui vient d'être retiré
        eleve.pts = { plus: 4, moins: 0, etoiles: 0 }; p.rendre();
        carte().querySelector('.pts-compteur[data-champ="plus"]').click();
        w.querySelector('#pts-annuler').click();
        const rendu = Object.assign({}, eleve.pts);

        p.mode = 'plus'; p.rendre();
        return { enModeNormal, cibles, consigne, apresPlus, apresMoins, apresEtoile, plancher, rendu };
    });
    r.egal('hors du mode « Retirer », aucun compteur n\'est cliquable', correction.enModeNormal, 0);
    r.egal('en mode « Retirer », les trois compteurs le deviennent', correction.cibles, 3);
    r.verifie('et la marche à suivre est écrite', correction.consigne);
    r.egal('cliquer le compteur vert retire un bonus', correction.apresPlus, { plus: 2, moins: 2, etoiles: 1 });
    r.egal('le rouge retire un malus', correction.apresMoins, { plus: 2, moins: 1, etoiles: 1 });
    r.egal('et l\'étoile se retire aussi', correction.apresEtoile, { plus: 2, moins: 1, etoiles: 0 });
    r.egal('on ne descend jamais sous zéro', correction.plancher, { plus: 0, moins: 0, etoiles: 0 });
    r.egal('un retrait s\'annule comme un point', correction.rendu, { plus: 4, moins: 0, etoiles: 0 });

    // --- BADGES ---
    const bande = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        return {
            livres: p.BADGES_LIVRES.length,
            affiches: w.querySelectorAll('.pts-badge').length,
            nommes: p.BADGES_LIVRES.every(b => b.nom && b.icone && /^#[0-9a-f]{6}$/i.test(b.couleur)),
            uniques: new Set(p.BADGES_LIVRES.map(b => b.id)).size === p.BADGES_LIVRES.length,
            creer: !!w.querySelector('#pts-badge-neuf'),
            // le bouton « créer » ne doit pas défiler hors de portée
            horsDuRail: !w.querySelector('#pts-rail #pts-badge-neuf')
        };
    });
    r.verifie('des badges sont fournis d\'avance', bande.livres >= 8, JSON.stringify(bande));
    r.egal('ils sont tous dans la bande', bande.affiches, bande.livres);
    r.verifie('chacun a un nom, un symbole et une couleur', bande.nommes);
    r.verifie('aucun identifiant en double', bande.uniques);
    r.verifie('« ＋ Nouveau » est là', bande.creer);
    r.verifie('et reste hors du défilement, toujours atteignable', bande.horsDuRail);

    const prendre = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        p.classeCourante().students.forEach(s => { s.badges = []; });
        p.badgeArme = null; p.mode = 'plus'; p.rendre();

        const clic = (el) => {
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5, button: 0 }));
            window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 }));
        };
        clic(w.querySelector('.pts-badge[data-id="b-entraide"]'));
        const arme = p.badgeArme;
        const reposer = !!w.querySelector('#pts-badge-poser');

        const cartes = w.querySelectorAll('.pts-carte');
        cartes[0].click(); cartes[1].click();
        const deux = [p.classeCourante().students[0].badges, p.classeCourante().students[1].badges];
        const pointsIntacts = p.classeCourante().students[0].pts.plus;

        // deux fois le même badge : c'est une distinction, pas un compteur
        w.querySelector('.pts-carte[data-id="' + p.classeCourante().students[0].id + '"]').click();
        const sansDoublon = p.classeCourante().students[0].badges.length;

        w.querySelector('#pts-badge-poser').click();
        return { arme, reposer, deux, pointsIntacts, sansDoublon, repose: p.badgeArme,
                 chips: w.querySelectorAll('.pts-chip').length };
    });
    r.egal('un clic met le badge en main', prendre.arme, 'b-entraide');
    r.verifie('et propose de le reposer', prendre.reposer);
    r.egal('badge en main, le clic sur un élève le lui donne', prendre.deux, [['b-entraide'], ['b-entraide']]);
    r.egal('sans lui compter de point au passage', prendre.pointsIntacts, 0);
    r.egal('un même badge ne se donne pas deux fois', prendre.sansDoublon, 1);
    r.egal('« Reposer » rend la main', prendre.repose, null);
    r.egal('chaque élève décoré porte sa pastille', prendre.chips, 2);

    const oter = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        const id = p.classeCourante().students[0].id;
        w.querySelector('.pts-carte[data-id="' + id + '"] .pts-chip').click();
        const apres = p.classeCourante().students[0].badges.slice();
        const points = p.classeCourante().students[0].pts.plus;
        w.querySelector('#pts-annuler').click();
        return { apres, points, revenu: p.classeCourante().students[0].badges.slice() };
    });
    r.egal('cliquer la pastille retire le badge', oter.apres, []);
    r.egal('sans donner de point non plus', oter.points, 0);
    r.egal('et l\'annulation le remet', oter.revenu, ['b-entraide']);

    const memoireBadges = await page.evaluate(async () => {
        ClassesStore._cache = null;
        const relu = await ClassesStore.loadAll();
        return relu[0].students[1].badges;
    });
    r.egal('les badges sont enregistrés avec la classe', memoireBadges, ['b-entraide']);

    const creation = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        const avant = p.badgesVisibles().length;
        w.querySelector('#pts-badge-neuf').click();

        // sans nom, on ne crée rien
        w.querySelector('#pts-badge-ok').click();
        const refuse = p.badgesVisibles().length === avant && !!w.querySelector('#pts-badge-nom');

        const nom = w.querySelector('#pts-badge-nom');
        nom.value = 'Table de 7'; nom.dispatchEvent(new Event('input'));
        w.querySelectorAll('.pts-emoji')[3].click();
        w.querySelectorAll('.pts-couleur')[4].click();
        const apercu = w.querySelector('#pts-badge-apercu').textContent.trim();
        w.querySelector('#pts-badge-ok').click();

        const neuf = p.badgesPerso[p.badgesPerso.length - 1];
        return {
            refuse, apercu, neuf,
            visibles: p.badgesVisibles().length,
            dansLaBande: !!w.querySelector('.pts-badge[data-id="' + (neuf || {}).id + '"]'),
            memoire: JSON.parse(localStorage.getItem('board_badges') || '{}')
        };
    });
    r.verifie('un badge sans nom n\'est pas créé', creation.refuse, JSON.stringify(creation));
    r.verifie('l\'aperçu suit ce que l\'on tape', /Table de 7/.test(creation.apercu), creation.apercu);
    r.verifie('le badge créé porte son nom, son symbole et sa couleur',
        creation.neuf && creation.neuf.nom === 'Table de 7' && !!creation.neuf.icone
        && /^#[0-9a-f]{6}$/i.test(creation.neuf.couleur), JSON.stringify(creation.neuf));
    r.verifie('il rejoint la bande', creation.dansLaBande, JSON.stringify(creation));
    r.verifie('et il est retenu d\'une séance à l\'autre',
        (creation.memoire.perso || []).some(b => b.nom === 'Table de 7'), JSON.stringify(creation.memoire));

    const ecarter = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        p.panneauReglages = true; p.rendre();
        const modifiables = w.querySelectorAll('.pts-badge-mod').length;
        w.querySelector('.pts-badge-mod[data-id="b-calme"]').click();
        const enEdition = !!w.querySelector('#pts-badge-suppr');
        w.querySelector('#pts-badge-suppr').click();
        const ecarte = !p.badgesVisibles().some(b => b.id === 'b-calme');
        // l'élève qui le portait le garde : on n'efface pas son passé
        p.classeCourante().students[2].badges = ['b-calme'];
        p.rendre();
        const garde = p.badgesDe(p.classeCourante().students[2]).length;

        p.panneauReglages = true; p.rendre();
        w.querySelector('#pts-badges-rendre').click();
        const revenu = p.badgesVisibles().some(b => b.id === 'b-calme');
        p.panneauReglages = false; p.rendre();
        return { modifiables, enEdition, ecarte, garde, revenu };
    });
    r.verifie('les réglages listent les badges à modifier', ecarter.modifiables >= 8, JSON.stringify(ecarter));
    r.verifie('on ouvre un badge fourni pour le retoucher', ecarter.enEdition);
    r.verifie('on peut l\'écarter de la bande', ecarter.ecarte);
    r.egal('mais l\'élève qui le portait le garde', ecarter.garde, 1);
    r.verifie('et les badges fournis se remettent tous d\'un coup', ecarter.revenu);

    // --- POSER AU TABLEAU ---
    const pose = await page.evaluate(async () => {
        const p = PluginManager.plugins.classPointsTool;
        panX = 0; panY = 0; zoom = 1;
        images.length = 0;
        p.poserAuTableau();
        await new Promise(r => setTimeout(r, 400));
        const stamp = p.currentStamp;
        if (!stamp) return null;
        p.onPointerDown({ x: 400, y: 300 });
        return { mode: mode, images: images.length, w: images[0] && images[0].w, cw: images[0] && images[0].cw };
    });
    r.verifie('« Poser au tableau » pose bien une feuille', !!pose && pose.images === 1, JSON.stringify(pose));
    r.verifie('la feuille est agrandie pour être lue de loin',
        !!pose && pose.w > pose.cw * 0.9, JSON.stringify(pose));

    // --- REMISE À ZÉRO ---
    const raz = await page.evaluate(async () => {
        const p = PluginManager.plugins.classPointsTool;
        p.panneauReglages = true; p.rendre();
        document.getElementById('pts-raz').click();
        // La remise à zéro passe par la modale de l'application, plus par le
        // confirm() du navigateur : on confirme comme le ferait le professeur.
        await new Promise(r => setTimeout(r, 200));
        const oui = document.getElementById('confirm-yes-btn');
        const modale = !!(oui && oui.getClientRects().length);
        if (oui) oui.click();
        await new Promise(r => setTimeout(r, 200));
        return { modale, pts: p.classeCourante().students.map(s => s.pts) };
    });
    r.verifie('la remise à zéro demande confirmation dans l\'application', raz.modale, JSON.stringify(raz));
    r.verifie('la remise à zéro efface les points',
        raz.pts.every(p => p.plus === 0 && p.moins === 0), JSON.stringify(raz.pts));
    r.verifie('mais garde les étoiles gagnées', raz.pts[0].etoiles === 1, JSON.stringify(raz.pts[0]));

    // --- L'OPTION « AU PLUS GRAND » ---
    const grand = await page.evaluate(() => {
        const avant = tamponEstAuPlusGrand();
        reglerTamponAuPlusGrand(false);
        const petit = ajusterTampon({ w: 400, h: 300 });
        reglerTamponAuPlusGrand(true);
        zoom = 1;
        const large = ajusterTampon({ w: 400, h: 300 });
        return { avant, petit, large, memoire: localStorage.getItem('board_tampon_grand') };
    });
    r.verifie('« au plus grand » est actif par défaut', grand.avant === true);
    r.egal('désactivé, le tampon garde sa taille', grand.petit.w, 400);
    r.verifie('activé, il occupe l\'écran',
        grand.large.w > 600 && grand.large.h > 450, JSON.stringify(grand.large));
    r.verifie('sans déformer la feuille',
        Math.abs(grand.large.w / grand.large.h - 400 / 300) < 0.01, JSON.stringify(grand.large));
    r.verifie('le découpage source garde la taille réelle de l\'image',
        grand.large.cw === 400 && grand.large.ch === 300, JSON.stringify(grand.large));
    r.egal('et le réglage est mémorisé', grand.memoire, '1');

    const boutons = await page.evaluate(() => {
        PluginManager.plugins.globalExerciseGenerator.openWidget();
        const geg = !!document.getElementById('geg-plus-grand');
        const coche = geg && document.getElementById('geg-plus-grand').checked;
        PluginManager.plugins.globalExerciseGenerator.widgetEl.style.display = 'none';
        PluginManager.plugins.flashMathTool.openWidget();
        const flash = !!document.getElementById('fl-btn-taille');
        PluginManager.plugins.flashMathTool.widgetEl.style.display = 'none';
        return { geg, coche, flash };
    });
    r.verifie('le générateur d\'exercices propose la case « au plus grand »', boutons.geg);
    r.verifie('et elle est cochée', boutons.coche);
    r.verifie('les questions flash aussi ont le réglage', boutons.flash);

    // --- LES AVATARS, PARTOUT OÙ IL Y A DES ÉLÈVES ---
    const partage = await page.evaluate(() => {
        const plugin = PluginManager.plugins.classPointsTool;
        const e = { id: 'stu_essai', name: 'Camille' };
        return {
            module: !!window.AvatarsEleves,
            memeDessin: plugin.avatarSVG(e, 40) === AvatarsEleves.svg(e, 40),
            memesTeintes: plugin.TEINTES === AvatarsEleves.TEINTES,
            stable: AvatarsEleves.svg(e, 40) === AvatarsEleves.svg(e, 40)
        };
    });
    r.verifie('le dessin des avatars est écrit une seule fois', partage.module && partage.memeDessin,
        JSON.stringify(partage));
    r.verifie('l\'outil Points et « Mes classes » partagent les mêmes traits', partage.memesTeintes);
    r.verifie('un même élève garde toujours le même monstre', partage.stable);

    const varies = await page.evaluate(() => {
        const eleves = Array.from({ length: 16 }, (_, i) => ({ id: 'stu_' + i, name: 'E' + i }));
        const dessins = eleves.map(e => AvatarsEleves.svg(e, 40));
        const cornes = eleves.map(e => AvatarsEleves.traits(e).cornes);
        return { distincts: new Set(dessins).size, cornes: new Set(cornes).size };
    });
    r.verifie('seize élèves voisins ont seize monstres différents', varies.distincts >= 14, JSON.stringify(varies));
    r.verifie('et pas tous les mêmes cornes', varies.cornes >= 3, JSON.stringify(varies));

    const regle = await page.evaluate(() => {
        const e = { id: 'stu_9', name: 'Sacha' };
        const avant = AvatarsEleves.traits(e);
        AvatarsEleves.poser(e, 'teinte', '#000000');
        const apres = AvatarsEleves.traits(e);
        const fige = apres.bouche === avant.bouche && apres.corps === avant.corps;
        AvatarsEleves.auHasard(e);
        const auHasard = Object.keys(e.avatar).sort().join(',');
        AvatarsEleves.dorigine(e);
        return { teinte: apres.teinte, fige, auHasard, remis: e.avatar === undefined,
                 dorigine: AvatarsEleves.traits(e).teinte === avant.teinte };
    });
    r.egal('changer un trait le change vraiment', regle.teinte, '#000000');
    r.verifie('sans faire bouger les autres', regle.fige, JSON.stringify(regle));
    r.egal('« au hasard » tire les cinq traits', regle.auHasard, 'bouche,cornes,corps,teinte,yeux');
    r.verifie('« monstre d\'origine » rend son avatar de départ',
        regle.remis && regle.dorigine, JSON.stringify(regle));

    const mesClasses = await page.evaluate(async () => {
        await ClassesStore.saveAll([{ id: 'cav', name: 'Essai avatars',
            students: ['Ana', 'Bo', 'Cy'].map((n, i) => ({ id: 'av_' + i, name: n })) }]);
        document.getElementById('btn-classes-menu').click();
        await new Promise(r => setTimeout(r, 600));
        const vignettes = document.querySelectorAll('.cm-avatar');
        const out = { vignettes: vignettes.length, distincts: new Set(Array.from(vignettes).map(v => v.innerHTML)).size };
        if (vignettes[1]) {
            vignettes[1].click();
            await new Promise(r => setTimeout(r, 300));
            const atelier = document.getElementById('avatar-atelier');
            out.atelier = !!atelier;
            if (atelier) {
                const avant = atelier.querySelector('#av-apercu').innerHTML;
                atelier.querySelector('#av-hasard').click();
                await new Promise(r => setTimeout(r, 300));
                const apres = document.getElementById('avatar-atelier');
                out.change = apres.querySelector('#av-apercu').innerHTML !== avant;
                const enregistre = await ClassesStore.loadAll();
                const classe = enregistre.find(c => c.id === 'cav');
                out.enregistre = !!(classe && classe.students[1].avatar);
                document.getElementById('avatar-atelier').querySelector('#av-fini').click();
                out.referme = !document.getElementById('avatar-atelier');
            }
        }
        return out;
    });
    r.egal('« Mes classes » montre un avatar par élève', mesClasses.vignettes, 3);
    r.egal('et ils sont tous différents', mesClasses.distincts, 3);
    r.verifie('cliquer l\'avatar ouvre son atelier', mesClasses.atelier, JSON.stringify(mesClasses));
    r.verifie('« au hasard » change le monstre sous les yeux', mesClasses.change, JSON.stringify(mesClasses));
    r.verifie('et le changement est enregistré sur l\'élève', mesClasses.enregistre, JSON.stringify(mesClasses));
    r.verifie('« Terminé » referme l\'atelier', mesClasses.referme, JSON.stringify(mesClasses));

    const plan = await page.evaluate(async () => {
        const ferme = document.querySelector('#class-manager-modal .modal-close, #avatar-atelier');
        if (ferme) ferme.remove();
        await openSeatingPlanEditor('cav');
        await new Promise(r => setTimeout(r, 500));
        const chips = document.querySelectorAll('.sp-chip-avatar').length;
        const t = document.getElementById('sp-template');
        if (t) { t.value = '0'; t.dispatchEvent(new Event('change', { bubbles: true })); }
        document.getElementById('sp-apply-template').click();
        await new Promise(r => setTimeout(r, 400));
        document.getElementById('sp-autofill').click();
        await new Promise(r => setTimeout(r, 400));
        return { chips, places: document.querySelectorAll('.sp-seat-avatar').length };
    });
    r.egal('le plan de classe montre l\'avatar des élèves non placés', plan.chips, 3);
    r.egal('et celui des élèves assis', plan.places, 3);

    // --- LES NOMS TIENNENT DANS LEUR PLACE ---
    const longsNoms = await page.evaluate(async () => {
        const noms = ['Marie-Charlotte Delaunay', 'Jean-Baptiste Rousseau', 'Anne-Sophie Vandenberghe',
                      'Youssef El Amrani', 'Abdoulaye Diallo', 'Zoé', 'Tom', 'Inès'];
        await ClassesStore.saveAll([{ id: 'clong', name: 'Noms longs',
            students: noms.map((n, i) => ({ id: 'ln' + i, name: n })) }]);
        document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
        await openSeatingPlanEditor('clong');
        await new Promise(r => setTimeout(r, 400));
        const choisir = async (v) => {
            const t = document.getElementById('sp-template');
            t.value = String(v); t.dispatchEvent(new Event('change', { bubbles: true }));
            document.getElementById('sp-apply-template').click();
            await new Promise(r => setTimeout(r, 250));
            document.getElementById('sp-autofill').click();
            await new Promise(r => setTimeout(r, 350));
        };

        await choisir(0);                               // 4×4 tables doubles
        const coupes = () => Array.from(document.querySelectorAll('.sp-seat.filled .sp-seat-name'))
            .filter(n => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1).length;
        const large = () => Math.round(document.querySelector('.sp-seat.filled').getBoundingClientRect().width);
        const serre = { coupes: coupes(), place: large() };

        await choisir(1);                               // 3×3 : moins de tables, plus de place
        const aere = { coupes: coupes(), place: large() };

        // La place ne descend jamais sous le minimum, quel que soit le modèle
        await choisir(3);                               // 6×5 tables simples
        const dense = { place: large() };

        const zone = document.querySelector('.sp-canvas-wrap').getBoundingClientRect();
        const tables = Array.from(document.querySelectorAll('.sp-table')).map(e => e.getBoundingClientRect());
        const largeurTotale = Math.max(...tables.map(b => b.right)) - Math.min(...tables.map(b => b.left));

        return { serre, aere, dense, occupation: Math.round(largeurTotale / zone.width * 100) };
    });
    r.egal('un nom composé n\'est plus coupé dans sa place', longsNoms.serre.coupes, 0);
    r.verifie('moins de tables : les places s\'élargissent',
        longsNoms.aere.place > longsNoms.serre.place, JSON.stringify(longsNoms));
    r.egal('et rien n\'est coupé non plus', longsNoms.aere.coupes, 0);
    r.verifie('une disposition dense garde une place lisible',
        longsNoms.dense.place >= 66, JSON.stringify(longsNoms.dense));
    r.verifie('les tables occupent la largeur du plan',
        longsNoms.occupation > 85, `${longsNoms.occupation} %`);

    const surLeTampon = await page.evaluate(() => {
        // Le tampon écrit les noms au pinceau : trois lignes, comme à l'écran
        const lignes = [];
        const faux = { measureText: (t) => ({ width: t.length * 9 }), fillText: (t) => lignes.push(t) };
        spWrapText(faux, 'Anne-Sophie Vandenberghe', 40, 20, 66, 11);
        return lignes;
    });
    r.verifie('le tampon écrit le nom sur plusieurs lignes', surLeTampon.length >= 2, JSON.stringify(surLeTampon));
    r.verifie('sans le tronquer', !surLeTampon.join(' ').includes('…'), JSON.stringify(surLeTampon));

    // --- L'AVATAR EST OPTIONNEL ---
    const sansMonstre = await page.evaluate(() => {
        const e = { id: 'stu_3', name: 'Ana Belle' };
        AvatarsEleves.regler(true);
        const avec = AvatarsEleves.svg(e, 40);
        AvatarsEleves.regler(false);
        const sans = AvatarsEleves.svg(e, 40);
        const memoire = localStorage.getItem('board_avatars');
        // une photo posée exprès survit à l'extinction des monstres
        const photo = { id: 'stu_4', name: 'Bo', avatar: { image: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } };
        const avecPhoto = AvatarsEleves.svg(photo, 40);
        AvatarsEleves.regler(true);
        return {
            avec, sans, memoire, avecPhoto,
            initiales: AvatarsEleves.initiales('Ana Belle'),
            uneLettre: AvatarsEleves.initiales('Zoé'),
            memeCouleur: AvatarsEleves.traits(e).teinte
        };
    });
    r.verifie('avec les monstres, on dessine un monstre',
        /path|circle|rect/.test(sansMonstre.avec) && !/<text/.test(sansMonstre.avec));
    r.verifie('sans les monstres, on écrit les initiales',
        /<text/.test(sansMonstre.sans) && sansMonstre.sans.includes('AB'), sansMonstre.sans.slice(0, 120));
    r.verifie('en gardant la couleur de l\'élève',
        sansMonstre.sans.includes(sansMonstre.memeCouleur), sansMonstre.memeCouleur);
    r.egal('deux prénoms donnent deux lettres', sansMonstre.initiales, 'AB');
    r.egal('un seul prénom en donne une', sansMonstre.uneLettre, 'Z');
    r.egal('le réglage se retient', sansMonstre.memoire, '0');
    r.verifie('une photo posée à la main reste affichée', /<img/.test(sansMonstre.avecPhoto));

    const dansLesClasses = await page.evaluate(async () => {
        document.getElementById('btn-classes-menu').click();
        await new Promise(r => setTimeout(r, 600));
        const boite = document.getElementById('cm-avatars');
        const out = { interrupteur: !!boite, coche: boite && boite.checked };
        if (boite) {
            boite.checked = false;
            boite.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));
            out.eteint = !AvatarsEleves.actifs;
            out.initialesAffichees = /<text/.test(document.querySelector('.cm-avatar').innerHTML);
            const re = document.getElementById('cm-avatars');
            re.checked = true;
            re.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));
            out.rallume = AvatarsEleves.actifs;
        }
        return out;
    });
    r.verifie('« Mes classes » propose l\'interrupteur', dansLesClasses.interrupteur, JSON.stringify(dansLesClasses));
    r.verifie('le décocher éteint les monstres partout', dansLesClasses.eteint, JSON.stringify(dansLesClasses));
    r.verifie('et la liste montre aussitôt les initiales', dansLesClasses.initialesAffichees, JSON.stringify(dansLesClasses));
    r.verifie('le recocher les rallume', dansLesClasses.rallume, JSON.stringify(dansLesClasses));

    // --- DONNER DES POINTS DEPUIS « MES CLASSES » ---
    const parLesClasses = await page.evaluate(async () => {
        await ClassesStore.saveAll([
            { id: 'cx', name: 'Autre', students: [{ id: 'x0', name: 'Xa' }] },
            { id: 'cav', name: 'Essai avatars', students: ['Ana', 'Bo', 'Cy'].map((n, i) => ({ id: 'av_' + i, name: n })) }
        ]);
        const modale = document.getElementById('class-manager-modal');
        if (modale) modale.remove();
        document.getElementById('btn-classes-menu').click();
        await new Promise(r => setTimeout(r, 600));
        // on sélectionne la deuxième classe avant d'ouvrir les points
        const ligne = document.querySelector('#class-manager-modal .cm-class-item[data-id="cav"]');
        if (ligne) ligne.click();
        await new Promise(r => setTimeout(r, 300));
        document.getElementById('cm-points').click();
        await new Promise(r => setTimeout(r, 700));
        const w = document.getElementById('points-widget');
        return {
            bouton: true,
            widget: !!w,
            modaleFermee: !document.getElementById('class-manager-modal'),
            classe: PluginManager.plugins.classPointsTool.classeId,
            cartes: w ? w.querySelectorAll('.pts-carte').length : 0
        };
    });
    r.verifie('« Mes classes » ouvre le tableau des points', parLesClasses.widget, JSON.stringify(parLesClasses));
    r.verifie('en refermant la fenêtre des classes', parLesClasses.modaleFermee, JSON.stringify(parLesClasses));
    r.verifie('sur la classe qu\'on regardait, pas la première venue',
        parLesClasses.classe === 'cav' && parLesClasses.cartes === 3, JSON.stringify(parLesClasses));

    const pointsDonnes = await page.evaluate(async () => {
        const outil = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        // On vise l'élève par son identifiant : l'ordre des cartes ne doit
        // pas décider de ce que le test vérifie.
        const carte = (id) => w.querySelector('.pts-carte[data-id="' + id + '"]');
        w.querySelector('#pts-mode-plus').click();
        carte('av_0').click();
        carte('av_0').click();
        w.querySelector('#pts-mode-moins').click();
        carte('av_1').click();
        await new Promise(r => setTimeout(r, 200));
        // On relève des nombres, pas l'objet : l'annulation qui suit le
        // modifierait sous nos pieds.
        const lire = (id) => {
            const c = outil.classes.find(x => x.id === 'cav');
            const e = (c.students || []).find(s => s.id === id);
            const p = (e && e.pts) || {};
            return { plus: p.plus || 0, moins: p.moins || 0 };
        };
        const av0 = lire('av_0'), av1 = lire('av_1');
        const enregistre = await ClassesStore.loadAll();
        const relu = enregistre.find(c => c.id === 'cav');
        const reluAv0 = relu && (relu.students || []).find(s => s.id === 'av_0');
        w.querySelector('#pts-annuler').click();
        await new Promise(r => setTimeout(r, 150));
        return {
            plus: av0.plus,
            moins: av1.moins,
            surLeleve: !!(reluAv0 && reluAv0.pts && reluAv0.pts.plus === 2),
            apresAnnulation: lire('av_1').moins
        };
    });
    r.egal('deux clics en Bonus donnent deux points', pointsDonnes.plus, 2);
    r.egal('un clic en Malus en retire un', pointsDonnes.moins, 1);
    r.verifie('les points sont écrits sur l\'élève, dans sa classe', pointsDonnes.surLeleve, JSON.stringify(pointsDonnes));
    r.egal('↶ annule le dernier point donné', pointsDonnes.apresAnnulation, 0);

    // --- LES CLASSES DANS UN FICHIER ---
    // Tout ce qui fait la classe vit dans le navigateur : un profil effacé et
    // c'est une année d'avatars, de points et de badges qui disparaît.
    const dansLaSauvegarde = await page.evaluate(async () => {
        await ClassesStore.saveAll([{ id: 'cs', name: '6e B', students: [
            { id: 'a', name: 'Alice', pts: { plus: 4, moins: 1, etoiles: 1 }, badges: ['b-entraide'] },
            { id: 'b', name: 'Bilal', frontRow: true, avatar: { teinte: '#0984e3' } }] }]);
        localStorage.setItem('board_badges', JSON.stringify({
            perso: [{ id: 'bx', icone: '🎯', nom: 'Table de 7', couleur: '#0984e3' }], masques: ['b-calme'] }));
        localStorage.setItem('board_points_reglages', JSON.stringify({ seuilNote: 15, seuilRetenue: 4, affichage: 'solde' }));
        const d = await getWorkspaceData();
        return {
            classes: (d.classes || []).length,
            points: d.classes && d.classes[0].students[0].pts,
            badgesEleve: d.classes && d.classes[0].students[0].badges,
            avatar: !!(d.classes && d.classes[0].students[1].avatar),
            premierRang: d.classes && d.classes[0].students[1].frontRow,
            catalogue: d.badges && d.badges.perso.length,
            ecartes: d.badges && d.badges.masques,
            seuil: d.reglagesPoints && d.reglagesPoints.seuilNote
        };
    });
    r.egal('la sauvegarde complète emporte les classes', dansLaSauvegarde.classes, 1);
    r.egal('avec les points de chacun', dansLaSauvegarde.points, { plus: 4, moins: 1, etoiles: 1 });
    r.egal('les badges portés', dansLaSauvegarde.badgesEleve, ['b-entraide']);
    r.verifie('les avatars personnalisés', dansLaSauvegarde.avatar);
    r.verifie('et les places du premier rang', dansLaSauvegarde.premierRang);
    r.egal('le catalogue des badges créés suit', dansLaSauvegarde.catalogue, 1);
    r.egal('ceux qu\'on avait écartés aussi', dansLaSauvegarde.ecartes, ['b-calme']);
    r.egal('et les seuils de la classe', dansLaSauvegarde.seuil, 15);

    const fichier = await page.evaluate(async () => {
        const bilan = await sauverLesClasses();
        return bilan;
    });
    r.verifie('« Sauvegarder » écrit un fichier et dit ce qu\'il contient',
        !!fichier && fichier.classes === 1 && fichier.eleves === 2, JSON.stringify(fichier));

    const relu = await page.evaluate(async () => {
        const contenu = JSON.stringify({ format: 'autableau-classes', version: 1, classes: [] });
        const bon = await lireFichierDeClasses(new File([contenu], 'c.json'));
        let refus = null;
        try { await lireFichierDeClasses(new File(['pas du json'], 'x.json')); }
        catch (e) { refus = e.message; }
        let sansClasses = null;
        try { await lireFichierDeClasses(new File([JSON.stringify({ a: 1 })], 'y.json')); }
        catch (e) { sansClasses = e.message; }
        return { bon: Array.isArray(bon.classes), refus, sansClasses };
    });
    r.verifie('un vrai fichier de classes est relu', relu.bon);
    r.verifie('un fichier illisible est refusé en clair',
        /sauvegarde de classes/.test(relu.refus || ''), relu.refus);
    r.verifie('un JSON sans classes aussi',
        /ne contient pas de classes/.test(relu.sansClasses || ''), relu.sansClasses);

    // « Compléter » : on récupère ce qui manque, sans rien abîmer de ce qu'on a
    const completer = await page.evaluate(async () => {
        const venu = { format: 'autableau-classes', version: 1, classes: [
            { id: 'cs', name: '6e B', students: [
                { id: 'a', name: 'Alice', pts: { plus: 99, moins: 99, etoiles: 9 } },
                { id: 'c', name: 'Chloé' }] },
            { id: 'autre', name: '5e A', students: [{ id: 'd', name: 'Diego' }] }] };
        const bilan = await poserLesClasses(venu, 'fusionner');
        const apres = await ClassesStore.loadAll();
        const sixieme = apres.find(c => c.name === '6e B');
        return {
            bilan, classes: apres.length,
            eleves: sixieme.students.map(s => s.name),
            alice: sixieme.students.find(s => s.name === 'Alice').pts,
            aliceBadges: sixieme.students.find(s => s.name === 'Alice').badges
        };
    });
    r.egal('« Compléter » ajoute la classe qui manque', completer.classes, 2);
    r.egal('et l\'élève qui manque', completer.eleves, ['Alice', 'Bilal', 'Chloé']);
    r.egal('sans écraser les points de ceux qui étaient là', completer.alice, { plus: 4, moins: 1, etoiles: 1 });
    r.egal('ni leurs badges', completer.aliceBadges, ['b-entraide']);
    r.egal('le bilan dit ce qui a été ajouté', completer.bilan.ajoutees, 1);
    r.egal('et combien d\'élèves', completer.bilan.elevesAjoutes, 1);

    const deuxFois = await page.evaluate(async () => {
        const venu = { format: 'autableau-classes', version: 1, classes: [
            { id: 'cs', name: '6e B', students: [{ id: 'c', name: 'Chloé' }] }] };
        await poserLesClasses(venu, 'fusionner');
        const apres = await ClassesStore.loadAll();
        return apres.find(c => c.name === '6e B').students.map(s => s.name);
    });
    r.egal('compléter deux fois ne fait pas de doublon', deuxFois, ['Alice', 'Bilal', 'Chloé']);

    const remplacer = await page.evaluate(async () => {
        const venu = { format: 'autableau-classes', version: 1,
            classes: [{ id: 'z', name: 'Terminale S', students: [{ id: 'z0', name: 'Zoé' }] }],
            badges: { perso: [], masques: [] } };
        await poserLesClasses(venu, 'remplacer');
        const apres = await ClassesStore.loadAll();
        return { n: apres.length, nom: apres[0].name,
                 badges: JSON.parse(localStorage.getItem('board_badges')) };
    });
    r.egal('« Tout remplacer » ne laisse que le fichier', remplacer.n, 1);
    r.egal('avec ses classes', remplacer.nom, 'Terminale S');
    r.egal('et son catalogue de badges', remplacer.badges, { perso: [], masques: [] });

    // --- L'APPEL, PARTAGÉ PAR TOUS LES OUTILS ---
    // Un absent n'est pas un élève supprimé : il garde ses points, ses badges
    // et sa place, il est seulement mis de côté pour la séance.
    const modele = await page.evaluate(() => {
        const c = { id: 'ca', name: 'Essai', students:
            ['Alice', 'Bilal', 'Chloé', 'Diego'].map((n, i) => ({ id: 'e' + i, name: n })) };
        Appel.basculer(c, 'e1');
        Appel.basculer(c, 'e3');
        const pose = { absents: Appel.absents(c).map(s => s.name), presents: Appel.presents(c).length,
                       resume: Appel.resume(c), jour: c.appelDu === Appel.aujourdHui() };
        Appel.basculer(c, 'e1');                     // Bilal revient
        const retour = Appel.absents(c).map(s => s.name);
        Appel.tousPresents(c);
        const vides = Appel.absents(c).length;

        // le lendemain : l'appel d'hier ne vaut plus
        Appel.basculer(c, 'e0');
        c.appelDu = '2020-01-01';
        const change = Appel.oublierLaVeille([c]);
        return { pose, retour, vides, change, restants: Appel.absents(c).length,
                 rienAJeter: Appel.oublierLaVeille([c]) };
    });
    r.egal('noter deux absents les met de côté', modele.pose.absents, ['Bilal', 'Diego']);
    r.egal('les présents sont comptés à part', modele.pose.presents, 2);
    r.egal('et le résumé se lit en clair', modele.pose.resume, '2 présents, 2 absents');
    r.verifie('l\'appel est daté du jour', modele.pose.jour);
    r.egal('un élève de retour redevient présent', modele.retour, ['Diego']);
    r.egal('« tous présents » efface l\'appel', modele.vides, 0);
    r.verifie('le lendemain, les absences d\'hier tombent d\'elles-mêmes', modele.change);
    r.egal('et il ne reste personne d\'absent', modele.restants, 0);
    r.verifie('sans rien réécrire s\'il n\'y a rien à effacer', !modele.rienAJeter);

    const appelUI = await page.evaluate(async () => {
        await ClassesStore.saveAll([{ id: 'cap', name: '6e Appel', students:
            ['Alice', 'Bilal', 'Chloé', 'Diego'].map((n, i) => ({ id: 'a' + i, name: n,
                pts: { plus: i, moins: 0, etoiles: 0 }, badges: i === 1 ? ['b-entraide'] : [] })) }]);
        const w = document.getElementById('points-widget');
        if (w) w.style.display = 'none';
        const ancienne = document.getElementById('class-manager-modal');
        if (ancienne) ancienne.remove();
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 500));
        document.querySelectorAll('.cm-presence')[1].click();
        await new Promise(r => setTimeout(r, 250));
        const cl = await ClassesStore.loadAll();
        const res = {
            enBase: cl[0].students[1].absent === true,
            barree: !!document.querySelector('.cm-student-row.absent'),
            resume: document.getElementById('cm-appel-resume').textContent,
            bouton: !!document.getElementById('cm-tous-presents'),
            pointsIntacts: cl[0].students[1].pts.plus,
            badgesIntacts: cl[0].students[1].badges
        };
        return res;
    });
    r.verifie('un clic sur ✓ note l\'élève absent', appelUI.enBase, JSON.stringify(appelUI));
    r.verifie('sa ligne se barre', appelUI.barree);
    r.egal('l\'en-tête compte les présents', appelUI.resume, '3 présents, 1 absent');
    r.verifie('et propose de tout remettre présent', appelUI.bouton);
    r.egal('l\'absent garde ses points', appelUI.pointsIntacts, 1);
    r.egal('et ses badges', appelUI.badgesIntacts, ['b-entraide']);

    const surLesPoints = await page.evaluate(async () => {
        const m = document.getElementById('class-manager-modal');
        if (m) m.remove();
        await PluginManager.plugins.classPointsTool.ouvrir('cap');
        await new Promise(r => setTimeout(r, 500));
        return { cartes: document.querySelectorAll('.pts-carte').length,
                 palies: document.querySelectorAll('.pts-carte.pts-absent').length };
    });
    r.egal('la grille des points montre toute la classe', surLesPoints.cartes, 4);
    r.egal('avec l\'absent pâli, pas retiré', surLesPoints.palies, 1);

    const surLeTirage = await page.evaluate(async () => {
        const p = PluginManager.plugins.randomDrawTool;
        p.loadClasses();
        await new Promise(r => setTimeout(r, 400));
        return { liste: p.savedClasses['6e Appel'], absents: (p.absentsDuJour || {})['6e Appel'] };
    });
    r.egal('le tirage au sort ne propose que les présents', surLeTirage.liste, ['Alice', 'Chloé', 'Diego']);
    r.egal('et sait dire qui manque', surLeTirage.absents, ['Bilal']);

    // Le tirage réécrit les classes : il ne doit rien perdre au passage.
    const apresEcriture = await page.evaluate(async () => {
        const p = PluginManager.plugins.randomDrawTool;
        const avant = await ClassesStore.loadAll();
        const autres = avant.length;
        p.saveClassesToStorage();
        await new Promise(r => setTimeout(r, 450));
        ClassesStore._cache = null;
        const cl = await ClassesStore.loadAll();
        const classe = cl.find(c => c.name === '6e Appel');
        return {
            classesAvant: autres, classesApres: cl.length,
            eleves: classe.students.map(s => s.name),
            toujoursAbsent: !!classe.students.find(s => s.name === 'Bilal' && s.absent),
            badges: (classe.students.find(s => s.name === 'Bilal') || {}).badges,
            points: (classe.students.find(s => s.name === 'Diego') || {}).pts
        };
    });
    r.egal('l\'absent n\'est pas supprimé quand le tirage enregistre', apresEcriture.eleves,
        ['Alice', 'Bilal', 'Chloé', 'Diego']);
    r.verifie('il reste noté absent', apresEcriture.toujoursAbsent, JSON.stringify(apresEcriture));
    r.egal('avec ses badges', apresEcriture.badges, ['b-entraide']);
    r.egal('et les points des autres sont intacts', apresEcriture.points, { plus: 3, moins: 0, etoiles: 0 });
    r.egal('les classes que cette fenêtre ne montre pas ne sont pas effacées',
        apresEcriture.classesApres, apresEcriture.classesAvant);

    // --- LE LOT D'ERGONOMIE ---
    const ergo = await page.evaluate(async () => {
        await ClassesStore.saveAll([{ id: 'ce', name: '6e E', students:
            ['Zoé', 'Alice', 'Manon', 'Bilal'].map((n, i) => ({ id: 'x' + i, name: n })) }]);
        const m = document.getElementById('class-manager-modal'); if (m) m.remove();
        const w = document.getElementById('points-widget'); if (w) w.style.display = 'none';
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 500));

        const avant = (await ClassesStore.loadAll())[0].students.map(s => s.name);
        document.getElementById('cm-trier').click();
        await new Promise(r => setTimeout(r, 200));
        const trie = (await ClassesStore.loadAll())[0].students.map(s => s.name);

        // le mémo
        document.querySelectorAll('.cm-memo')[0].click();
        await new Promise(r => setTimeout(r, 250));
        const champ = document.getElementById('memo-texte');
        champ.value = 'Tiers-temps';
        document.getElementById('memo-ok').click();
        await new Promise(r => setTimeout(r, 250));
        const memo = (await ClassesStore.loadAll())[0].students[0].memo;

        // dupliquer
        const cl0 = await ClassesStore.loadAll();
        cl0[0].students[0].pts = { plus: 7, moins: 0, etoiles: 1 };
        cl0[0].students[0].badges = ['b-entraide'];
        document.getElementById('cm-dupliquer').click();
        await new Promise(r => setTimeout(r, 300));
        const cl = await ClassesStore.loadAll();
        const copie = cl[cl.length - 1];

        // archiver
        document.getElementById('cm-archiver').click();
        await new Promise(r => setTimeout(r, 250));
        const archivee = !!(await ClassesStore.loadAll()).find(c => c.archivee);

        return {
            avant, trie, memo,
            copie: {
                nom: copie.name, eleves: copie.students.length,
                sansPoints: copie.students.every(s => !s.pts),
                sansBadges: copie.students.every(s => !s.badges || !s.badges.length),
                memoGarde: !!copie.students.find(s => s.memo === 'Tiers-temps'),
                idsNeufs: copie.students[0].id !== cl[0].students[0].id
            },
            archivee
        };
    });
    r.egal('une liste collée arrive dans le désordre', ergo.avant, ['Zoé', 'Alice', 'Manon', 'Bilal']);
    r.egal('« A→Z » la range, accents compris', ergo.trie, ['Alice', 'Bilal', 'Manon', 'Zoé']);
    r.egal('un mémo se note sur un élève', ergo.memo, 'Tiers-temps');
    r.egal('dupliquer garde le nom, avec « (copie) »', ergo.copie.nom, '6e E (copie)');
    r.egal('et tous les élèves', ergo.copie.eleves, 4);
    r.verifie('sans les points de l\'an dernier', ergo.copie.sansPoints);
    r.verifie('ni ses badges', ergo.copie.sansBadges);
    r.verifie('mais en gardant les mémos', ergo.copie.memoGarde);
    r.verifie('avec de nouveaux identifiants, pour ne rien mélanger', ergo.copie.idsNeufs);
    r.verifie('une classe peut être archivée plutôt que supprimée', ergo.archivee);

    // --- LES PAIRES À SÉPARER ---
    const paires = await page.evaluate(async () => {
        await ClassesStore.saveAll([{ id: 'cp', name: '5e P', students:
            ['Alice', 'Bilal', 'Chloé', 'Diego', 'Éva', 'Farid', 'Gaïa', 'Hugo']
                .map((n, i) => ({ id: 'p' + i, name: n })) }]);
        const m = document.getElementById('class-manager-modal'); if (m) m.remove();
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 500));

        document.getElementById('cm-sep-a').value = 'p0';
        document.getElementById('cm-sep-b').value = 'p1';
        document.getElementById('cm-sep-ajouter').click();
        await new Promise(r => setTimeout(r, 200));
        document.getElementById('cm-sep-a').value = 'p2';
        document.getElementById('cm-sep-b').value = 'p3';
        document.getElementById('cm-sep-ajouter').click();
        await new Promise(r => setTimeout(r, 200));

        // une paire déjà notée ne se note pas deux fois
        document.getElementById('cm-sep-a').value = 'p1';
        document.getElementById('cm-sep-b').value = 'p0';
        document.getElementById('cm-sep-ajouter').click();
        await new Promise(r => setTimeout(r, 200));

        const enregistrees = (await ClassesStore.loadAll())[0].aSeparer;
        const puces = document.querySelectorAll('.cm-paire').length;
        document.getElementById('class-manager-modal').remove();

        const p = PluginManager.plugins.randomDrawTool;
        p.loadClasses();
        await new Promise(r => setTimeout(r, 400));
        p.currentClassName = '5e P';
        p.sessionList = p.savedClasses['5e P'].map(n => ({ name: n, score: 0, active: true }));

        let echecs = 0, tailles = null;
        for (let essai = 0; essai < 30; essai++) {
            p.groupState = { groups: Array.from({ length: 3 }, (_, i) =>
                ({ id: 'g' + i, name: 'Îlot ' + (i + 1), students: [] })), unassigned: [], counter: 4 };
            const l = p.sessionList.map(s => s.name);
            for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
            l.forEach((s, i) => p.groupState.groups[i % 3].students.push(s));
            p.separerLesPaires();
            const ensemble = (a, b) => p.groupState.groups.some(g => g.students.includes(a) && g.students.includes(b));
            if (ensemble('Alice', 'Bilal') || ensemble('Chloé', 'Diego')) echecs++;
            tailles = p.groupState.groups.map(g => g.students.length);
        }
        return { enregistrees, puces, luesParLAtelier: p.paires['5e P'], echecs,
                 total: tailles.reduce((a, b) => a + b, 0), tailles };
    });
    r.egal('deux paires sont notées sur la classe', paires.enregistrees, [['p0', 'p1'], ['p2', 'p3']]);
    r.egal('la même paire ne se note pas deux fois, même à l\'envers', paires.enregistrees.length, 2);
    r.egal('elles s\'affichent en pastilles', paires.puces, 2);
    r.egal('l\'atelier les lit par leurs noms', paires.luesParLAtelier,
        [['Alice', 'Bilal'], ['Chloé', 'Diego']]);
    r.egal('et sur trente tirages, aucun ne les remet ensemble', paires.echecs, 0);
    r.egal('sans perdre personne', paires.total, 8);
    r.verifie('ni déséquilibrer les îlots',
        Math.max(...paires.tailles) - Math.min(...paires.tailles) <= 1, JSON.stringify(paires.tailles));

    // --- LE POINT À TOUTE LA CLASSE ---
    const tousLesPoints = await page.evaluate(async () => {
        const cl = await ClassesStore.loadAll();
        const c = cl.find(x => x.name === '5e P');
        c.students.forEach(s => { s.pts = { plus: 0, moins: 0, etoiles: 0 }; delete s.absent; });
        Appel.basculer(c, 'p1');                       // Bilal absent
        await ClassesStore.saveAll(cl);

        const p = PluginManager.plugins.classPointsTool;
        await p.ouvrir(c.id);
        await new Promise(r => setTimeout(r, 400));
        // les essais précédents ont pu laisser le mode sur Malus : le point
        // partirait alors dans l'autre compteur
        p.mode = 'plus'; p.rendre();
        const touches = p.pointATousLesPresents();
        const etat = p.classeCourante().students.map(s => ({ nom: s.name, plus: s.pts.plus }));
        document.getElementById('pts-annuler').click();
        const apres = p.classeCourante().students.map(s => s.pts.plus);

        p.mode = 'retirer';
        const refus = p.pointATousLesPresents();
        p.mode = 'plus';
        return { touches, etat, apres, refus, bouton: !!document.getElementById('pts-toute-classe') };
    });
    r.verifie('la barre porte le bouton « +1 à tous »', tousLesPoints.bouton);
    r.egal('il ne sert qu\'aux présents', tousLesPoints.touches, 7);
    r.egal('l\'absent ne reçoit rien',
        tousLesPoints.etat.find(e => e.nom === 'Bilal').plus, 0);
    r.verifie('les autres reçoivent leur point',
        tousLesPoints.etat.filter(e => e.nom !== 'Bilal').every(e => e.plus === 1),
        JSON.stringify(tousLesPoints.etat));
    r.verifie('et un seul ↶ défait toute la fournée',
        tousLesPoints.apres.every(v => v === 0), JSON.stringify(tousLesPoints.apres));
    r.egal('en mode « Retirer », le bouton ne fait rien', tousLesPoints.refus, 0);

    // --- La fenêtre « Mes classes » : la liste d'élèves d'abord ---
    // Elle était coupée à droite (la rangée d'actions débordait du cadre) et
    // la colonne de droite défilait EN PLUS de la liste, si bien que trente
    // élèves tenaient sur trois lignes.
    const miseEnPage = await page.evaluate(async () => {
        document.querySelectorAll('#class-manager-modal').forEach(m => m.remove());
        localStorage.removeItem('board_fenetres');
        await ClassesStore.saveAll([{
            id: 'cmep', name: '4A',
            students: Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'Élève numéro ' + i }))
        }]);
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 400));

        const box = document.querySelector('#class-manager-modal .modal-box');
        const detail = document.getElementById('cm-detail');
        const liste = document.getElementById('cm-students-list');

        // Rien ne dépasse du cadre, ni à droite ni à gauche. On mesure aussi
        // fenêtre rétrécie : c'est là que la rangée d'actions sortait du
        // cadre, « Supprimer » coupé en deux.
        const cequiDeborde = () => {
            const cadre = box.getBoundingClientRect();
            return [...box.querySelectorAll('button, input, select')]
                .filter(el => el.offsetParent !== null)
                .filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.right > cadre.right + 1 || r.left < cadre.left - 1;
                }).map(el => el.id || el.textContent.trim().slice(0, 20));
        };
        const debord = cequiDeborde();
        const largeurDorigine = box.style.width;
        box.style.width = '600px';
        const debordEtroit = cequiDeborde();
        box.style.width = largeurDorigine;

        const zone = liste.getBoundingClientRect();
        const visibles = [...liste.querySelectorAll('.cm-student-row')].filter(x => {
            const r = x.getBoundingClientRect();
            return r.top >= zone.top - 1 && r.bottom <= zone.bottom + 1;
        }).length;

        const replis = [...box.querySelectorAll('.cm-repli')];
        return {
            debord, debordEtroit,
            visibles,
            listeDefile: liste.scrollHeight > liste.clientHeight + 1,
            detailDefile: detail.scrollHeight > detail.clientHeight + 1,
            replies: replis.length,
            toutesRepliees: replis.every(d => !d.open),
            // Les réglages restent atteignables une fois dépliés
            separationDispo: (() => {
                replis.forEach(d => { d.open = true; });
                return !!document.getElementById('cm-sep-ajouter')
                    && !!document.getElementById('cm-import-paste-btn');
            })(),
            // Les actions de la classe sont toutes là, en version compacte
            actions: [...box.querySelectorAll('.cm-actions .btn-action')].map(b => b.id),
            supprimeAvecTitre: (document.getElementById('cm-delete-class').title || '').includes('Supprimer')
        };
    });
    r.egal('rien ne dépasse du cadre de la fenêtre', miseEnPage.debord, []);
    r.egal('ni une fois la fenêtre rétrécie : la rangée se replie',
        miseEnPage.debordEtroit, []);
    r.verifie('au moins huit élèves sont visibles d\'un coup',
        miseEnPage.visibles >= 8, 'visibles : ' + miseEnPage.visibles);
    r.verifie('la liste est bien ce qui défile', miseEnPage.listeDefile);
    r.verifie('et elle est le seul ascenseur de la colonne', !miseEnPage.detailDefile);
    r.egal('deux réglages sont repliés par défaut', miseEnPage.replies, 2);
    r.verifie('et ils le sont vraiment', miseEnPage.toutesRepliees);
    r.verifie('dépliés, ils rendent leurs commandes', miseEnPage.separationDispo);
    r.egal('les cinq actions de la classe sont conservées', miseEnPage.actions,
        ['cm-points', 'cm-seating-plan', 'cm-dupliquer', 'cm-archiver', 'cm-delete-class']);
    r.verifie('la corbeille réduite à son icône garde son infobulle',
        miseEnPage.supprimeAvecTitre);


    // --- Importer une liste d'élèves ---
    // Les tableurs n'exportent pas tous pareil. Excel en français sépare au
    // point-virgule et met des guillemets : la classe accueillait alors un
    // élève nommé « "Bernard";"Emma" ».
    const LISTES_DE_CLASSE = [
        ['un nom par ligne', 'Bernard Emma\nMartin Lucas', ['Bernard Emma', 'Martin Lucas']],
        ['guillemets simples', '"Bernard Emma"\n"Martin Lucas"', ['Bernard Emma', 'Martin Lucas']],
        ['Excel français : point-virgule et guillemets',
            '"Bernard";"Emma"\n"Martin";"Lucas"', ['Bernard Emma', 'Martin Lucas']],
        ['point-virgule sans guillemets', 'Bernard;Emma\nMartin;Lucas', ['Bernard Emma', 'Martin Lucas']],
        ['virgules', 'Bernard,Emma\nMartin,Lucas', ['Bernard Emma', 'Martin Lucas']],
        ['tabulations (copié d\'un tableur)', 'Bernard\tEmma\nMartin\tLucas', ['Bernard Emma', 'Martin Lucas']],
        ['colonnes en plus : on s\'arrête au premier champ qui n\'est pas un nom',
            '"Bernard";"Emma";"4A";"2011-03-12"\n"Martin";"Lucas";"4A";"2011-07-02"',
            ['Bernard Emma', 'Martin Lucas']],
        ['une virgule DANS un champ entre guillemets',
            '"Bernard, Emma"\n"Martin, Lucas"', ['Bernard, Emma', 'Martin, Lucas']],
        ['une liste inattendue n\'est pas perdue', 'Groupe 1\nGroupe 2', ['Groupe 1', 'Groupe 2']],
        ['caractère invisible en tête de fichier', '﻿"Bernard";"Emma"', ['Bernard Emma']],
        ['fins de ligne Windows', '"Bernard";"Emma"\r\n"Martin";"Lucas"\r\n', ['Bernard Emma', 'Martin Lucas']],
        ['ligne d\'en-tête', '"Nom";"Prénom"\n"Bernard";"Emma"', ['Bernard Emma']],
        ['un élève réellement nommé Nom reste s\'il est seul', 'Nom', ['Nom']],
        ['lignes vides ignorées', 'Bernard Emma\n\n\nMartin Lucas\n', ['Bernard Emma', 'Martin Lucas']],
        ['accents, traits d\'union, apostrophes',
            '"Lefèvre-Dubois";"Anne-Sophie"\n"D\'Artagnan";"Éloïse"',
            ['Lefèvre-Dubois Anne-Sophie', "D'Artagnan Éloïse"]],
        ['adresse électronique : ce n\'est pas un morceau de nom',
            'Bernard;Emma;emma@ecole.fr', ['Bernard Emma']],
        ['texte vide', '', []]
    ];

    const listes = await page.evaluate((cas) => cas.map(([nom, entree, attendu]) => {
        const obtenu = parseNamesFromText(entree);
        return { nom, attendu, obtenu, ok: JSON.stringify(obtenu) === JSON.stringify(attendu) };
    }), LISTES_DE_CLASSE);
    const ratees = listes.filter(x => !x.ok);
    r.verifie(`les ${listes.length} formes de liste d'élèves sont lues correctement`,
        ratees.length === 0,
        ratees.slice(0, 3).map(x => `${x.nom} -> ${JSON.stringify(x.obtenu)}`).join('  ///  '));

    // Le découpage lui-même : un guillemet doublé est un guillemet du texte
    const champs = await page.evaluate(() => ({
        double: decouperCSV(String.fromCharCode(34) + 'Dupont ' + String.fromCharCode(34, 34)
            + 'dit Le Grand' + String.fromCharCode(34, 34, 34), ';')[0],
        sepEntreGuillemets: decouperCSV('"Bernard; Emma";"4A"', ';')[0],
        vide: decouperCSV('', ';')
    }));
    r.egal('un guillemet doublé devient un guillemet du texte',
        champs.double, ['Dupont "dit Le Grand"']);
    r.egal('un séparateur entre guillemets ne coupe pas le champ',
        champs.sepEntreGuillemets, ['Bernard; Emma', '4A']);
    r.egal('un texte vide ne rend aucun enregistrement', champs.vide, []);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
