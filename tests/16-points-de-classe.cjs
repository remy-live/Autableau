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
        // ON ARME D'ABORD. Rien n'est armé à l'ouverture depuis qu'un clic sur
        // un élève ouvre sa fiche au lieu de lui donner un point. Et comme les
        // boutons BASCULENT, on repart d'un état neutre : sinon le clic
        // éteindrait le bonus au lieu de l'allumer.
        p.mode = null; p.rendre();
        document.getElementById('pts-mode-plus').click();
        cartes()[0].click(); cartes()[0].click(); cartes()[2].click();
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

    // L'écriture sur le disque est temporisée : on laisse passer le délai
    // avant de relire le stock.
    await page.waitForTimeout(1000);
    const memorise = await page.evaluate(async () => {
        ClassesStore._cache = null;
        const relu = await ClassesStore.loadAll();
        return relu[0].students[0].pts;
    });
    r.egal('les points sont enregistrés avec la classe', memorise, { plus: 2, moins: 0, etoiles: 0 });

    // Une salve de clics ne doit plus faire une écriture par clic : chacune
    // réécrit TOUT le stock, journal compris.
    const salve = await page.evaluate(async () => {
        const p = PluginManager.plugins.classPointsTool;
        const vrai = localforage.setItem;
        let ecritures = 0;
        localforage.setItem = function (...a) { ecritures++; return vrai.apply(this, a); };
        const id = p.classeCourante().students[0].id;
        for (let i = 0; i < 8; i++) p.compter(id, 1);
        await new Promise(r => setTimeout(r, 1000));
        localforage.setItem = vrai;
        for (let i = 0; i < 8; i++) p.annuler();
        await p.sauverMaintenant();
        return ecritures;
    });
    r.verifie('huit clics ne font qu\'une écriture, pas huit',
        salve === 1, salve + ' écriture(s)');

    // Quitter ne doit rien perdre : la file en attente est vidée sur-le-champ
    const vidage = await page.evaluate(async () => {
        const p = PluginManager.plugins.classPointsTool;
        p.compter(p.classeCourante().students[0].id, 1);
        await p.sauverMaintenant();
        ClassesStore._cache = null;
        const relu = await ClassesStore.loadAll();
        const ok = relu[0].students[0].pts.plus;
        p.annuler(); await p.sauverMaintenant();
        return ok;
    });
    r.egal('« enregistrer maintenant » écrit sans attendre', vidage, 3);

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
        if (!bleu) return { sonde: { mode: p.mode, fiche: p.ficheEleve, bilan: p.panneauBilan,
            reglages: p.panneauReglages, badge: p.editionBadge, avatar: p.editionAvatar,
            classe: p.classeId, traits: document.querySelectorAll('#points-widget .pts-trait').length } };
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

    // Même remarque que pour les points : le disque reçoit la salve groupée.
    await page.waitForTimeout(1000);
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
        // Les symboles sont maintenant des icônes dessinées, pas des émojis
        const glyphes = w.querySelectorAll('.pts-glyphe');
        glyphes[3].click();
        w.querySelectorAll('.pts-couleur')[4].click();
        const apercu = w.querySelector('#pts-badge-apercu').textContent.trim();
        const apercuDessine = !!w.querySelector('#pts-badge-apercu-icone svg');
        const choisiMarque = glyphes[3].style.borderColor === 'rgb(45, 52, 54)';
        w.querySelector('#pts-badge-ok').click();

        const neuf = p.badgesPerso[p.badgesPerso.length - 1];
        return {
            refuse, apercu, neuf, apercuDessine, choisiMarque, nbGlyphes: glyphes.length,
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
    r.verifie('le choix du symbole propose des icônes dessinées',
        creation.nbGlyphes >= 20, String(creation.nbGlyphes));
    r.verifie('l\'aperçu montre l\'icône dessinée', creation.apercuDessine);
    r.verifie('et l\'icône choisie est marquée', creation.choisiMarque);
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
        const volet = document.querySelector('#cm-detail');
        return {
            widget: !!w,
            // La feuille de points ne remplace plus « Mes classes » : elle s'y
            // POSE, sous son onglet. On ne perd donc plus la classe de vue en
            // allant voir ses points.
            dansLeVolet: !!(volet && volet.contains(w)),
            fenetreEncoreLa: !!document.getElementById('class-manager-modal'),
            classe: PluginManager.plugins.classPointsTool.classeId,
            cartes: w ? w.querySelectorAll('.pts-carte').length : 0
        };
    });
    r.verifie('« Mes classes » ouvre le tableau des points', parLesClasses.widget, JSON.stringify(parLesClasses));
    r.verifie('sans refermer la fenêtre des classes : il s\'y pose',
        parLesClasses.fenetreEncoreLa && parLesClasses.dansLeVolet, JSON.stringify(parLesClasses));
    r.verifie('sur la classe qu\'on regardait, pas la première venue',
        parLesClasses.classe === 'cav' && parLesClasses.cartes === 3, JSON.stringify(parLesClasses));

    const pointsDonnes = await page.evaluate(async () => {
        const outil = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        // On vise l'élève par son identifiant : l'ordre des cartes ne doit
        // pas décider de ce que le test vérifie.
        const carte = (id) => w.querySelector('.pts-carte[data-id="' + id + '"]');
        // Les boutons de mode BASCULENT : cliquer celui qui est déjà armé le
        // désarme. On repart donc d'un état neutre, sinon le clic suivant
        // éteindrait le bonus au lieu de l'allumer.
        outil.mode = null; outil.rendre();
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
            // La liste défile-t-elle QUAND il le faut ? On la rétrécit pour
            // forcer le débordement : c'est elle qui doit défiler, pas le
            // panneau entier — sinon les réglages du bas partent avec.
            defilement: (() => {
                const avant = liste.style.maxHeight;
                liste.style.maxHeight = '60px';
                const r = { liste: liste.scrollHeight > liste.clientHeight + 1,
                            detail: detail.scrollHeight > detail.clientHeight + 1 };
                liste.style.maxHeight = avant;
                return r;
            })(),
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
    r.verifie('c\'est la liste qui défile quand elle déborde, pas le panneau',
        miseEnPage.defilement.liste && !miseEnPage.defilement.detail,
        JSON.stringify(miseEnPage.defilement));
    r.verifie('et elle est le seul ascenseur de la colonne', !miseEnPage.defilement.detail);
    r.egal('deux réglages sont repliés par défaut', miseEnPage.replies, 2);
    r.verifie('et ils le sont vraiment', miseEnPage.toutesRepliees);
    r.verifie('dépliés, ils rendent leurs commandes', miseEnPage.separationDispo);
    r.egal('les cinq actions de la classe sont conservées', miseEnPage.actions,
        ['cm-points', 'cm-seating-plan', 'cm-dupliquer', 'cm-archiver', 'cm-delete-class']);
    r.verifie('la corbeille réduite à son icône garde son infobulle',
        miseEnPage.supprimeAvecTitre);



    // --- Importer une liste : la reconnaissance doit être AUTOMATIQUE ---
    // Un export de vie scolaire porte douze colonnes ; le professeur ne doit
    // pas avoir à désigner lesquelles forment le nom. Chaque forme ci-dessous
    // vient d'un cas réel.
    const T = String.fromCharCode(9);
    const N4 = ['ALMEIDA Alicia', 'ANGARD Lily', 'BENALI Yanis', 'CHEN Mei-Lin'];
    const FORMES_DE_LISTE = [
      ['export tabulé avec en-tête (Pronote)',
       [['Nom','Prénom','"Né(e) le"','"Prénom d\'usage"','Sexe','Classe','Allergies','Formation','Groupes','"Toutes les options"'].join(T),
        ['ALMEIDA','Alicia','19/06/2013','','Féminin','"4EME A"','','4EME','"4EME AP1"','"ANGLAIS LV1, ESPAGNOL LV2"'].join(T),
        ['ANGARD','Lily'].join(T),
        ['BENALI','Yanis','03/01/2013','','Masculin','"4EME A"','','4EME','"4EME AP2"','"ANGLAIS LV1"'].join(T),
        ['CHEN','Mei-Lin','22/11/2012','','Féminin','"4EME A"','','4EME','"4EME AP1"','"ANGLAIS LV1"'].join(T)].join('\n'), N4],

      ['point-virgule avec guillemets et en-tête',
       '"Nom";"Prénom";"Classe"\n"ALMEIDA";"Alicia";"4A"\n"ANGARD";"Lily";"4A"\n"BENALI";"Yanis";"4A"\n"CHEN";"Mei-Lin";"4A"', N4],

      ['point-virgule sans en-tête',
       'ALMEIDA;Alicia\nANGARD;Lily\nBENALI;Yanis\nCHEN;Mei-Lin', N4],

      ['virgules',
       'ALMEIDA,Alicia\nANGARD,Lily\nBENALI,Yanis\nCHEN,Mei-Lin', N4],

      ['une seule colonne, nom complet',
       'ALMEIDA Alicia\nANGARD Lily\nBENALI Yanis\nCHEN Mei-Lin', N4],

      ['prénom puis nom',
       'Alicia;ALMEIDA\nLily;ANGARD\nYanis;BENALI\nMei-Lin;CHEN',
       ['Alicia ALMEIDA', 'Lily ANGARD', 'Yanis BENALI', 'Mei-Lin CHEN']],

      ['numérotation en tête de ligne',
       '1;ALMEIDA;Alicia\n2;ANGARD;Lily\n3;BENALI;Yanis\n4;CHEN;Mei-Lin', N4],

      ['colonne civilité : trois valeurs suffisent à la remplir',
       'Mme;ALMEIDA;Alicia\nMme;ANGARD;Lily\nM;BENALI;Yanis\nMme;CHEN;Mei-Lin', N4],

      ['colonne sexe après le prénom',
       'Nom;Prénom;Sexe\nALMEIDA;Alicia;Féminin\nANGARD;Lily;Féminin\nBENALI;Yanis;Masculin\nCHEN;Mei-Lin;Féminin', N4],

      ['classe alphanumérique',
       'ALMEIDA;Alicia;4EME A\nANGARD;Lily;4EME A\nBENALI;Yanis;4EME A\nCHEN;Mei-Lin;4EME A', N4],

      ['adresse électronique en 3e colonne',
       'ALMEIDA;Alicia;a.almeida@ecole.fr\nANGARD;Lily;l.angard@ecole.fr\nBENALI;Yanis;y.benali@ecole.fr\nCHEN;Mei-Lin;m.chen@ecole.fr', N4],

      ['copie d\'écran d\'un tableur : tabulations, pas d\'en-tête',
       'ALMEIDA\tAlicia\nANGARD\tLily\nBENALI\tYanis\nCHEN\tMei-Lin', N4],

      ['caractère invisible en tête et fins de ligne Windows',
       '﻿"Nom";"Prénom"\r\n"ALMEIDA";"Alicia"\r\n"ANGARD";"Lily"\r\n"BENALI";"Yanis"\r\n"CHEN";"Mei-Lin"\r\n', N4],

      ['nom composé entre guillemets contenant une virgule',
       '"ALMEIDA, Alicia"\n"ANGARD, Lily"', ['ALMEIDA, Alicia', 'ANGARD, Lily']],

      ['liste qui ne ressemble pas à des noms : rien n\'est perdu',
       'Groupe 1\nGroupe 2\nGroupe 3', ['Groupe 1', 'Groupe 2', 'Groupe 3']],

      ['une seule ligne', 'ALMEIDA;Alicia', ['ALMEIDA Alicia']],
      ['texte vide', '', []]
    ];

    const formes = await page.evaluate((cas) => cas.map(([nom, entree, attendu]) => {
        const obtenu = parseNamesFromText(entree);
        return { nom, obtenu, ok: JSON.stringify(obtenu) === JSON.stringify(attendu) };
    }), FORMES_DE_LISTE);
    const perdues = formes.filter(x => !x.ok);
    r.verifie(`les ${formes.length} formes de liste sont reconnues sans rien demander`,
        perdues.length === 0,
        perdues.slice(0, 2).map(x => `${x.nom} -> ${JSON.stringify(x.obtenu)}`).join('  ///  '));

    // Ce que l'aperçu montre : les colonnes retenues, avec leur intitulé
    const lecture = await page.evaluate((txt) => {
        const a = analyserListe(txt);
        return {
            separateur: a.separateur === String.fromCharCode(9) ? 'TAB' : a.separateur,
            entete: a.entete,
            choisies: a.choisies.map(i => a.colonnes[i].titre),
            colonnes: a.colonnes.length,
            noms: a.noms.length
        };
    }, FORMES_DE_LISTE[0][1]);
    r.egal('le séparateur tabulé est reconnu', lecture.separateur, 'TAB');
    r.verifie('la ligne d\'en-tête est reconnue', lecture.entete);
    r.egal('et ce sont bien Nom et Prénom qui sont retenus', lecture.choisies, ['Nom', 'Prénom']);
    r.egal('les colonnes sont toutes proposées à la correction', lecture.colonnes, 10);

    // Forcer d'autres colonnes : c'est le recours quand la lecture se trompe
    const force = await page.evaluate((txt) =>
        analyserListe(txt, { colonnes: [1] }).noms, FORMES_DE_LISTE[0][1]);
    r.egal('on peut n\'en retenir qu\'une', force, ['Alicia', 'Lily', 'Yanis', 'Mei-Lin']);

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

    // --- LES ICÔNES DESSINÉES ---
    // Un émoji est dessiné par le système et change d'un appareil à l'autre ;
    // ces icônes-là sont les mêmes partout et prennent la couleur du badge.
    const icones = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const glyphes = Object.keys(p.GLYPHES_BADGE);
        return {
            combien: glyphes.length,
            tousDessines: p.BADGES_LIVRES.every(b => !!p.GLYPHES_BADGE[b.icone]),
            tousAvecEmoji: glyphes.every(g => !!p.GLYPHES_BADGE[g].emoji),
            // Le trait est bien du SVG, et il prend la couleur du badge
            svg: p.iconeBadge({ icone: 'coupe', couleur: '#f39c12' }, 24),
            // Un ancien badge à émoji continue de s'afficher
            ancien: p.iconeBadge({ icone: '🐝', couleur: '#f39c12' }, 24),
            emojiJumeau: p.emojiDe('coupe'),
            emojiInconnu: p.emojiDe('🐝'),
            // Le tampon du tableau des points sait les poser aussi
            brut: p.glypheSVGBrut({ icone: 'coupe', couleur: '#f39c12' }, 10, 20, 16)
        };
    });
    r.verifie('une vingtaine d\'icônes au choix', icones.combien >= 20, String(icones.combien));
    r.verifie('les badges fournis en ont tous une', icones.tousDessines);
    r.verifie('chacune garde un émoji jumeau pour les messages', icones.tousAvecEmoji);
    r.verifie('l\'icône est un vrai dessin', /^<svg/.test(icones.svg.trim()), icones.svg.slice(0, 60));
    r.verifie('posée sur une pastille de la couleur du badge',
        /f39c12/.test(icones.svg), icones.svg.slice(0, 120));
    r.verifie('un badge fait avec un émoji continue de s\'afficher',
        /🐝/.test(icones.ancien), icones.ancien);
    r.egal('l\'émoji jumeau sert aux messages', icones.emojiJumeau, '🏆');
    r.egal('et un émoji reste lui-même', icones.emojiInconnu, '🐝');
    r.verifie('le tampon du tableau les dessine aussi',
        /^<g transform/.test(icones.brut.trim()) && /f39c12/.test(icones.brut), icones.brut.slice(0, 80));

    // Infobulle : au survol à la souris, et à la tape sur tablette — c'est
    // « data-tooltip » qui sait faire les deux, « title » ne fait que le survol.
    const bulles = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        p.panneauReglages = false; p.editionBadge = null; p.rendre();
        const w = document.getElementById('points-widget');
        const badge = w.querySelector('.pts-badge');
        return {
            surLaBande: !!(badge && badge.getAttribute('data-tooltip')),
            sansTitle: !!(badge && !badge.getAttribute('title')),
            texte: badge ? badge.getAttribute('data-tooltip') : '',
            iconeDansLaBande: !!(badge && badge.querySelector('svg'))
        };
    });
    r.verifie('les badges de la bande portent une infobulle maison', bulles.surLaBande, bulles.texte);
    r.verifie('et plus l\'infobulle du navigateur, qui ne marche pas au doigt', bulles.sansTitle);
    r.verifie('elle dit quoi faire, au doigt comme à la souris',
        /toucher/i.test(bulles.texte), bulles.texte);
    r.verifie('la bande montre les icônes dessinées', bulles.iconeDansLaBande);

    await page.evaluate(() => {
        const b = document.querySelector('#points-widget .pts-badge');
        b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    const ouverte = await page.evaluate(() => {
        const t = document.getElementById('dt-tooltip');
        return { visible: t.classList.contains('visible'), texte: t.textContent };
    });
    r.verifie('elle s\'ouvre vraiment au survol', ouverte.visible, JSON.stringify(ouverte));
    r.verifie('et nomme le badge', /Entraide/.test(ouverte.texte), ouverte.texte);

    // --- LES OUBLIS ---
    // Un badge se donne, un oubli se constate : deux catégories distinctes,
    // et chaque oubli est daté — c'est ce qui rend le suivi possible.
    const oublis = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const classe = p.classeCourante();
        // On repart d'une classe propre, et de la grille : un test précédent
        // a pu laisser un panneau ouvert à la place des cartes.
        (classe.students || []).forEach(e => { e.journal = []; e.badges = []; e.pts = { plus: 0, moins: 0, etoiles: 0 }; });
        p.historique = [];
        p.panneauReglages = false; p.panneauBilan = false;
        p.editionBadge = null; p.editionAvatar = null; p.badgeArme = null; p.oubliArme = null;
        p.mode = 'plus';
        p.rendre();
        // Les identifiants dépendent de la classe en place : on les relit.
        const A = classe.students[0].id, C = classe.students[2].id;
        p.noterOubli(A, 'materiel');
        p.noterOubli(A, 'materiel');
        p.noterOubli(A, 'carnet');
        p.noterOubli(C, 'devoirs');
        const eleve = classe.students[0];
        return {
            types: p.TYPES_OUBLI.length,
            materiel: p.compterOublis(eleve, 'materiel'),
            carnet: p.compterOublis(eleve, 'carnet'),
            tous: p.compterOublis(eleve),
            // Chaque trace porte sa date
            datees: p.journalDe(eleve).every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d)),
            dates: p.datesDesOublis(eleve, 'materiel'),
            // Un oubli n'est pas un badge
            pasUnBadge: (eleve.badges || []).length === 0,
            // Il apparaît sur la carte, avec son compte
            surLaCarte: document.querySelectorAll('.pts-carte[data-id="' + A + '"] .pts-oubli-chip').length,
            infobulle: (document.querySelector('.pts-carte[data-id="' + A + '"] .pts-oubli-chip') || {})
                .getAttribute ? document.querySelector('.pts-carte[data-id="' + A + '"] .pts-oubli-chip').getAttribute('data-tooltip') : ''
        };
    });
    r.egal('quatre motifs d\'oubli, pas davantage', oublis.types, 4);
    r.egal('deux oublis de matériel comptés', oublis.materiel, 2);
    r.egal('et un de carnet', oublis.carnet, 1);
    r.egal('trois oublis en tout', oublis.tous, 3);
    r.verifie('chaque oubli porte sa date', oublis.datees);
    r.egal('les dates sont lisibles pour le suivi', oublis.dates.length, 2);
    r.verifie('un oubli n\'est pas un badge', oublis.pasUnBadge);
    r.egal('la carte montre une pastille par motif', oublis.surLaCarte, 2);
    r.verifie('et l\'infobulle donne le compte et les dates',
        /2 oublis de matériel/.test(oublis.infobulle) && /\d{2}\/\d{2}/.test(oublis.infobulle), oublis.infobulle);

    const retraits = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const eleve = p.classeCourante().students[0];
        p.retirerOubli(eleve.id, 'materiel');
        const apresRetrait = p.compterOublis(eleve, 'materiel');
        p.noterOubli(eleve.id, 'carnet');
        p.annuler();                       // le ↶ défait le dernier oubli
        return { apresRetrait, apresAnnulation: p.compterOublis(eleve, 'carnet') };
    });
    r.egal('la pastille en retire un', retraits.apresRetrait, 1);
    r.egal('et le ↶ défait le dernier oubli posé', retraits.apresAnnulation, 1);

    // Poser un oubli passe par la bande, comme un badge, mais les deux ne se
    // tiennent pas en même temps.
    const bandeOublis = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        p.panneauReglages = false; p.panneauBilan = false; p.editionBadge = null; p.editionAvatar = null;
        p.badgeArme = 'b-entraide'; p.rendre();
        w.querySelector('.pts-oubli[data-id="carnet"]').click();
        const armé = { oubli: p.oubliArme, badge: p.badgeArme };
        // Le quatrième élève de la classe, quel que soit son identifiant :
        // les tests précédents ont pu en ajouter ou en retirer.
        const cible = p.classeCourante().students[3];
        const avant = p.compterOublis(cible, 'carnet');
        w.querySelector('.pts-carte[data-id="' + cible.id + '"]').click();
        const apres = p.compterOublis(cible, 'carnet');
        w.querySelector('.pts-oubli[data-id="carnet"]').click();
        return { armé, avant, apres, desarme: p.oubliArme,
                 boutons: w.querySelectorAll('.pts-oubli').length,
                 badgesTouj: w.querySelectorAll('.pts-badge').length };
    });
    r.egal('la bande porte les quatre motifs', bandeOublis.boutons, 4);
    r.verifie('les badges restent dans leur propre rangée', bandeOublis.badgesTouj >= 9,
        String(bandeOublis.badgesTouj));
    r.egal('prendre un oubli repose le badge qu\'on tenait', bandeOublis.armé.badge, null);
    r.egal('désigner un élève lui pose l\'oubli', [bandeOublis.avant, bandeOublis.apres], [0, 1]);
    r.egal('recliquer le motif le repose', bandeOublis.desarme, null);

    // --- LE BILAN ---
    const bilan = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const classe = p.classeCourante();
        (classe.students || []).forEach(e => { e.journal = []; e.badges = []; });
        const eleve = classe.students[0];
        // Des traces d'aujourd'hui, plus deux très anciennes
        p.compter(eleve.id, 1); p.compter(eleve.id, 1); p.compter(eleve.id, -1);
        p.noterOubli(eleve.id, 'materiel');
        p.poserBadge(eleve.id, 'b-entraide', true);
        eleve.journal.push({ d: '2001-01-15', t: 'p' });
        eleve.journal.push({ d: '2001-01-15', t: 'o', v: 'carnet' });

        p.bilanPeriode = 'tout';
        const tout = p.lignesDuBilan().find(l => l.id === eleve.id);
        p.bilanPeriode = 'mois';
        const mois = p.lignesDuBilan().find(l => l.id === eleve.id);
        p.bilanPeriode = 'perso';
        p.bilanDebut = '2001-01-01'; p.bilanFin = '2001-12-31';
        const ancien = p.lignesDuBilan().find(l => l.id === eleve.id);
        p.bilanPeriode = 'mois';

        p.panneauBilan = true; p.rendre();
        const w = document.getElementById('points-widget');
        return {
            tout, mois, ancien,
            colonnes: w.querySelectorAll('#pts-bilan-table thead th').length,
            lignes: w.querySelectorAll('#pts-bilan-table tbody tr').length,
            eleves: (classe.students || []).length,
            premier: eleve.name,
            periodes: w.querySelectorAll('.pts-bilan-periode').length,
            boutonPdf: !!w.querySelector('#pts-bilan-pdf')
        };
    });
    r.egal('depuis le début : tout est compté',
        [bilan.tout.plus, bilan.tout.moins, bilan.tout.badges, bilan.tout.totalOublis], [3, 1, 1, 2]);
    r.egal('ce mois-ci : les traces anciennes sortent du compte',
        [bilan.mois.plus, bilan.mois.moins, bilan.mois.badges, bilan.mois.totalOublis], [2, 1, 1, 1]);
    r.egal('deux dates : on ne garde que la période demandée',
        [bilan.ancien.plus, bilan.ancien.totalOublis], [1, 1]);
    r.egal('le solde est la différence', bilan.mois.solde, 1);
    // LES QUATRE NATURES D'OUBLI ONT QUITTÉ L'EN-TÊTE. Elles y tenaient quatre
    // colonnes, plus un total, presque toujours vides : elles sont devenues des
    // pastilles dans une seule colonne, qui ne paraissent que si elles ont
    // quelque chose à dire. Restent : l'élève, ses points, ses badges, ses
    // absences, ses oublis.
    r.egal('le tableau tient en cinq colonnes', bilan.colonnes, 5);
    r.egal('une ligne par élève', bilan.lignes, bilan.eleves);
    r.egal('trois trimestres et cinq autres périodes', bilan.periodes, 8);
    r.verifie('et un bouton d\'export PDF', bilan.boutonPdf);

    const tri = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const w = document.getElementById('points-widget');
        const noms = () => Array.from(w.querySelectorAll('#pts-bilan-table tbody tr td:first-child'))
            .map(td => td.textContent.trim());
        const alpha = noms();
        w.querySelector('.pts-bilan-col[data-col="totalOublis"]').click();
        const parOublis = noms();
        w.querySelector('.pts-bilan-col[data-col="totalOublis"]').click();
        const inverse = noms();
        return { alpha, parOublis, inverse };
    });
    r.egal('le tableau part par ordre alphabétique', tri.alpha[0], bilan.premier);
    r.verifie('un clic sur une colonne trie dessus : le plus étourdi passe en bas',
        tri.parOublis[tri.parOublis.length - 1] === bilan.premier, JSON.stringify(tri.parOublis));
    r.verifie('un second clic inverse le tri, il repasse en haut',
        tri.inverse[0] === bilan.premier, JSON.stringify(tri.inverse));

    const pdf = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        // On intercepte l'enregistrement : le test ne veut pas d'un fichier,
        // il veut savoir que le document est bien fabriqué.
        const ctor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!ctor) return { absent: true };
        // On intercepte la CONSTRUCTION : « save » écrirait vraiment un
        // fichier, et le test n'en veut pas — il veut le document.
        let recu = null, pages = 0;
        const faux = function (...args) {
            const doc = new ctor(...args);
            doc.save = (nom) => { recu = nom; pages = doc.internal.getNumberOfPages(); };
            return doc;
        };
        if (window.jspdf && window.jspdf.jsPDF) window.jspdf.jsPDF = faux; else window.jsPDF = faux;
        const rendu = p.exporterLeBilan();
        if (window.jspdf && window.jspdf.jsPDF === faux) window.jspdf.jsPDF = ctor; else window.jsPDF = ctor;
        return { rendu, recu, pages, periode: p.nomDeLaPeriode() };
    });
    if (pdf.absent) {
        r.verifie('jsPDF n\'est pas chargé dans ce contexte : export non testé', true);
    } else {
        r.verifie('le bilan s\'exporte en PDF', !!pdf.rendu && pdf.rendu === pdf.recu, JSON.stringify(pdf));
        r.verifie('le fichier porte le nom de la classe et la date',
            /^bilan-.+-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.recu || ''), String(pdf.recu));
        r.verifie('et tient au moins sur une page', pdf.pages >= 1, String(pdf.pages));
    }
    r.verifie('la période est dite en toutes lettres',
        /ce mois-ci/.test(pdf.periode || ''), String(pdf.periode));

    await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        p.panneauBilan = false; p.oubliArme = null; p.rendre();
    });

    // --- L'APPEL LAISSE UNE TRACE ---
    // L'appel ne gardait rien : demain, l'absence d'hier avait disparu. Le
    // bilan ne pouvait donc pas la montrer.
    const absences = await page.evaluate(() => {
        const c = { id: 'cj', name: 'Journal', students:
            ['Alice', 'Bilal'].map((n, i) => ({ id: 'j' + i, name: n })) };
        const alice = c.students[0];
        Appel.basculer(c, 'j0');
        const posee = Journal.de(alice).filter(x => x.t === 'a').length;
        Appel.basculer(c, 'j0');                      // Alice était là, en fait
        const corrigee = Journal.de(alice).filter(x => x.t === 'a').length;
        Appel.basculer(c, 'j0');
        Appel.basculer(c, 'j0');
        Appel.basculer(c, 'j0');                      // on hésite trois fois
        const uneSeule = Journal.de(alice).filter(x => x.t === 'a').length;
        // Une absence d'un autre jour ne se laisse pas effacer par l'appel du jour
        Journal.de(alice).push({ d: '2001-03-04', t: 'a' });
        Appel.tousPresents(c);
        return {
            posee, corrigee, uneSeule,
            resteAncienne: Journal.de(alice).filter(x => x.t === 'a').length,
            surLaPeriode: Appel.absencesSur(alice, '2001-01-01', '2001-12-31'),
            datee: Journal.de(alice)[0].d
        };
    });
    r.egal('noter un absent laisse une trace', absences.posee, 1);
    r.egal('corriger l\'appel la retire', absences.corrigee, 0);
    r.egal('hésiter trois fois n\'en fait pas trois', absences.uneSeule, 1);
    r.egal('« tous présents » n\'efface que le jour même', absences.resteAncienne, 1);
    r.egal('et l\'on sait compter les absences d\'une période', absences.surLaPeriode, 1);
    r.verifie('la trace est datée', /^\d{4}-\d{2}-\d{2}$/.test(absences.datee), absences.datee);

    const colonneAbs = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const classe = p.classeCourante();
        const eleve = classe.students[0];
        eleve.journal = [{ d: Journal.jour(), t: 'a' }, { d: '2001-05-05', t: 'a' }];
        p.bilanPeriode = 'mois';
        const mois = p.lignesDuBilan().find(l => l.id === eleve.id);
        p.bilanPeriode = 'tout';
        const tout = p.lignesDuBilan().find(l => l.id === eleve.id);
        p.panneauBilan = true; p.bilanPeriode = 'mois'; p.rendre();
        const w = document.getElementById('points-widget');
        const entetes = Array.from(w.querySelectorAll('#pts-bilan-table thead th')).map(t => t.textContent.trim());
        return { mois: mois.absences, tout: tout.absences, entetes };
    });
    r.egal('le bilan compte les absences de la période', colonneAbs.mois, 1);
    r.egal('et toutes, quand on demande tout', colonneAbs.tout, 2);
    r.verifie('la colonne est dans le tableau',
        colonneAbs.entetes.some(t => /Abs/.test(t)), JSON.stringify(colonneAbs.entetes));

    // --- LES TRIMESTRES ---
    const trimestres = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        const t = p.trimestres();
        // On les fixe pour pouvoir vérifier le découpage
        t[0] = { nom: '1er trimestre', debut: '2026-09-01', fin: '2026-11-30' };
        t[1] = { nom: '2e trimestre', debut: '2026-12-01', fin: '2027-03-15' };
        t[2] = { nom: '3e trimestre', debut: '2027-03-16', fin: '2027-07-06' };
        const eleve = p.classeCourante().students[0];
        eleve.journal = [
            { d: '2026-09-10', t: 'p' }, { d: '2026-10-02', t: 'o', v: 'carnet' },
            { d: '2027-01-12', t: 'p' }, { d: '2027-05-20', t: 'a' }
        ];
        const lire = (periode) => {
            p.bilanPeriode = periode;
            const l = p.lignesDuBilan().find(x => x.id === eleve.id);
            return { plus: l.plus, oublis: l.totalOublis, abs: l.absences, nom: p.nomDeLaPeriode() };
        };
        const un = lire('tri0'), deux = lire('tri1'), trois = lire('tri2');
        p.panneauBilan = true; p.rendre();
        const w = document.getElementById('points-widget');
        return { un, deux, trois,
                 boutons: Array.from(w.querySelectorAll('.pts-bilan-periode')).map(b => b.textContent.trim()),
                 defaut: p.reglages.trimestres.length };
    });
    r.egal('le 1er trimestre ne garde que ce qui s\'y est passé',
        [trimestres.un.plus, trimestres.un.oublis, trimestres.un.abs], [1, 1, 0]);
    r.egal('le 2e aussi', [trimestres.deux.plus, trimestres.deux.oublis, trimestres.deux.abs], [1, 0, 0]);
    r.egal('et le 3e', [trimestres.trois.plus, trimestres.trois.oublis, trimestres.trois.abs], [0, 0, 1]);
    r.verifie('la période est nommée avec ses dates',
        /1er trimestre \(du 01\/09\/2026 au 30\/11\/2026\)/.test(trimestres.un.nom), trimestres.un.nom);
    r.verifie('les trois trimestres sont proposés dans le bilan',
        trimestres.boutons.slice(0, 3).join('|') === '1er trimestre|2e trimestre|3e trimestre',
        JSON.stringify(trimestres.boutons));
    r.egal('trois trimestres sont préremplis', trimestres.defaut, 3);

    const reglagesTri = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        p.panneauBilan = false; p.panneauReglages = true; p.rendre();
        const w = document.getElementById('points-widget');
        const champs = w.querySelectorAll('.pts-tri-debut').length;
        const nom = w.querySelector('.pts-tri-nom[data-i="0"]');
        nom.value = 'Semestre 1';
        nom.dispatchEvent(new Event('change', { bubbles: true }));
        const debut = w.querySelector('.pts-tri-debut[data-i="0"]');
        debut.value = '2026-09-15';
        debut.dispatchEvent(new Event('change', { bubbles: true }));
        const relu = JSON.parse(localStorage.getItem('board_points_reglages') || '{}');
        p.panneauReglages = false; p.rendre();
        return { champs, nom: p.trimestres()[0].nom, debut: p.trimestres()[0].debut,
                 enregistre: (relu.trimestres || [])[0] };
    });
    r.egal('les réglages proposent les trois trimestres', reglagesTri.champs, 3);
    r.egal('on peut les renommer', reglagesTri.nom, 'Semestre 1');
    r.egal('et changer leurs dates', reglagesTri.debut, '2026-09-15');
    r.verifie('c\'est retenu d\'une séance à l\'autre',
        reglagesTri.enregistre && reglagesTri.enregistre.nom === 'Semestre 1',
        JSON.stringify(reglagesTri.enregistre));

    // --- LA PURGE DES VIEILLES TRACES ---
    const purge = await page.evaluate(() => {
        const eleve = { id: 'x', name: 'X', journal: [
            { d: '2001-01-01', t: 'p' },                 // il y a vingt ans
            { d: Journal.debutAnneeScolaire(), t: 'p' }, // cette année
            { d: Journal.jour(), t: 'o', v: 'carnet' }
        ] };
        const jetees = Journal.purger(eleve);
        return { jetees, reste: eleve.journal.length,
                 borne: Journal.debutAnneeScolaire(),
                 // Le 1er août : la seule coupure qui ne tombe pas dans un trimestre
                 aout: Journal.debutAnneeScolaire(new Date('2026-09-15')),
                 juin: Journal.debutAnneeScolaire(new Date('2026-06-15')) };
    });
    r.egal('les traces d\'avant-hier scolaire sont oubliées', purge.jetees, 1);
    r.egal('celles des deux dernières années restent', purge.reste, 2);
    r.egal('l\'année scolaire commence le 1er août', purge.aout, '2026-08-01');
    r.egal('et en juin, on est encore dans celle d\'avant', purge.juin, '2025-08-01');

    // --- LE FILET DE SÉCURITÉ ---
    const filet = await page.evaluate(async () => {
        localStorage.removeItem('auTableau_classes_sauvees');
        localStorage.removeItem('auTableau_rappel_classes_reporte');
        const avecEleves = [{ id: 'c1', name: 'A', students: [{ id: 's1', name: 'Zoé' }] }];
        const jamais = rappelSauvegardeUtile(avecEleves);
        const rien = rappelSauvegardeUtile([{ id: 'c2', name: 'Vide', students: [] }]);
        const texteJamais = texteDerniereSauvegarde();
        noterSauvegardeDesClasses();
        const apresSauvegarde = rappelSauvegardeUtile(avecEleves);
        const texteAujourdHui = texteDerniereSauvegarde();
        // Un mois plus tard, le rappel revient
        localStorage.setItem('auTableau_classes_sauvees', String(Date.now() - 40 * 24 * 3600 * 1000));
        const unMoisApres = rappelSauvegardeUtile(avecEleves);
        reporterLeRappelDesClasses();
        const reporte = rappelSauvegardeUtile(avecEleves);
        return { jamais, rien, texteJamais, apresSauvegarde, texteAujourdHui, unMoisApres, reporte };
    });
    r.verifie('jamais sauvegardé : on le rappelle', filet.jamais);
    r.verifie('mais pas quand il n\'y a rien à perdre', !filet.rien);
    r.egal('et l\'on dit franchement depuis quand', filet.texteJamais, 'jamais');
    r.verifie('sauvegardé : on se tait', !filet.apresSauvegarde);
    r.egal('en le disant', filet.texteAujourdHui, "aujourd'hui");
    r.verifie('un mois plus tard, le rappel revient', filet.unMoisApres);
    r.verifie('« plus tard » le repousse d\'un mois', !filet.reporte);

    const bandeau = await page.evaluate(async () => {
        localStorage.removeItem('auTableau_classes_sauvees');
        localStorage.removeItem('auTableau_rappel_classes_reporte');
        const ancienne = document.getElementById('class-manager-modal');
        if (ancienne) ancienne.remove();
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 400));
        const visible = !!document.getElementById('cm-rappel');
        const texte = (document.getElementById('cm-rappel') || {}).textContent || '';
        document.getElementById('cm-rappel-plus-tard').click();
        await new Promise(r => setTimeout(r, 300));
        const apres = !!document.getElementById('cm-rappel');
        const modal = document.getElementById('class-manager-modal');
        if (modal) modal.remove();
        return { visible, texte: texte.replace(/\s+/g, ' ').trim(), apres };
    });
    r.verifie('« Mes classes » porte le rappel', bandeau.visible);
    r.verifie('qui dit le risque et la date', /ce navigateur/.test(bandeau.texte)
        && /jamais/.test(bandeau.texte), bandeau.texte.slice(0, 140));
    r.verifie('et « Plus tard » le referme', !bandeau.apres);

    // --- « MES CLASSES » : LA CLASSE ENTIÈRE, ET LA FICHE D'UN ÉLÈVE ---
    // En une seule colonne, onze élèves sur vingt-cinq tenaient à l'écran :
    // on cherchait un nom au lieu de le désigner.
    const NOMS = ['ALMEIDA Alicia', 'ANGARD Lily', 'BENALI Yanis', 'BERTRAND Maël', 'CHEN Mei-Lin',
        'DA SILVA Enzo', 'DUBOIS Camille', 'DUPONT Léa', 'FAURE Noah', 'GARCIA Inès', 'GIRARD Tom',
        'HAMDI Sofiane', 'JACQUET Manon', 'KOWALSKI Adam', 'LAMBERT Jules', 'LEROY Chloé',
        'MARTIN Hugo', 'MOREAU Éva', 'NGUYEN Kim', 'PETIT Louise', 'RENAUD Théo', 'ROUX Sarah',
        'SIMON Lucas', 'TRAORÉ Awa', 'VINCENT Alice'];
    await page.evaluate(async (noms) => {
        await ClassesStore.saveAll([{ id: 'cgrande', name: '4e A', updatedAt: Date.now(),
            students: noms.map((n, i) => ({ id: 'g' + i, name: n })) }]);
        await ClassesStore.ecrireMaintenant();
        ClassesStore._cache = null;
        const p = PluginManager.plugins.classPointsTool;
        p.classes = await ClassesStore.loadAll(); p.classeId = 'cgrande'; p.lireBadges();
        const e = p.classeCourante().students[3];
        for (let i = 0; i < 7; i++) p.compter(e.id, 1);
        p.compter(e.id, -1); p.compter(e.id, -1);
        e.pts.etoiles = 2;
        p.poserBadge(e.id, 'b-entraide', true);
        p.poserBadge(e.id, 'b-idee', true);
        p.noterOubli(e.id, 'materiel'); p.noterOubli(e.id, 'materiel'); p.noterOubli(e.id, 'carnet');
        e.journal.push({ d: '2001-05-05', t: 'p' });      // une trace très ancienne
        Journal.noterUneFoisParJour(e, 'a');
        await p.sauverMaintenant();
        const ancienne = document.getElementById('class-manager-modal');
        if (ancienne) ancienne.remove();
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 500));
        document.querySelectorAll('.cm-class-item')[0].click();
        await new Promise(r => setTimeout(r, 300));
    }, NOMS);
    await page.waitForTimeout(400);

    const grille = await page.evaluate(() => {
        const lignes = Array.from(document.querySelectorAll('.cm-student-row'));
        const zone = document.getElementById('cm-students-list');
        const zr = zone.getBoundingClientRect();
        const dansLEcran = lignes.filter(l => {
            const b = l.getBoundingClientRect();
            return b.top >= zr.top - 1 && b.bottom <= zr.bottom + 1;
        });
        return {
            eleves: lignes.length,
            visibles: dansLEcran.length,
            colonnes: new Set(lignes.map(l => Math.round(l.getBoundingClientRect().left))).size,
            // Les noms ne doivent pas être rognés par leur propre boîte
            rognes: lignes.filter(l => {
                const n = l.querySelector('.cm-nom');
                return n && n.scrollWidth > n.clientWidth + 1;
            }).length,
            // La légende du bas a laissé la place : l'infobulle dit tout
            legende: (document.querySelector('.cm-appel') || {}).textContent || '',
            infobulles: lignes[0].querySelectorAll('[data-tooltip]').length
        };
    });
    r.egal('vingt-cinq élèves dans la liste', grille.eleves, 25);
    r.egal('et toute la classe tient à l\'écran, sans défiler', grille.visibles, 25);
    r.verifie('la liste se range en colonnes', grille.colonnes >= 2, String(grille.colonnes));
    r.egal('aucun nom n\'est coupé', grille.rognes, 0);
    r.verifie('la légende des icônes a cédé la place aux infobulles',
        !/pour noter une absence/.test(grille.legende) && grille.infobulles >= 4,
        JSON.stringify({ legende: grille.legende.slice(0, 60), infobulles: grille.infobulles }));

    // Cliquer un élève ouvre sa fiche
    const fiche = await page.evaluate(async () => {
        const lignes = document.querySelectorAll('.cm-student-row');
        lignes[3].click();
        await new Promise(r => setTimeout(r, 250));
        const f = document.querySelector('.cm-fiche');
        const tuiles = Array.from(document.querySelectorAll('.cm-tuile'))
            .map(t => t.querySelector('b').textContent.trim() + ' ' + t.querySelector('span').textContent.trim());
        return {
            ouverte: !!f,
            nom: (document.querySelector('.cm-fiche-qui b') || {}).textContent,
            tuiles,
            badges: Array.from(document.querySelectorAll('.cm-fiche-badge')).map(b => b.textContent.trim()),
            oublis: Array.from(document.querySelectorAll('.cm-fiche-bloc')).map(b => b.textContent.replace(/\s+/g, ' ').trim()),
            periodes: document.querySelectorAll('.cm-fiche-periode').length,
            active: (document.querySelector('.cm-fiche-periode.actif') || {}).textContent,
            memo: !!document.getElementById('cm-fiche-memo')
        };
    });
    r.verifie('cliquer un élève ouvre sa fiche', fiche.ouverte);
    r.egal('et c\'est bien la sienne', fiche.nom, 'BERTRAND Maël');
    r.verifie('la fiche compte ses points, ses étoiles, ses oublis et ses absences',
        fiche.tuiles.join(' | ').includes('7 bonus') && fiche.tuiles.join(' | ').includes('2 malus')
        && fiche.tuiles.join(' | ').includes('+5 solde') && fiche.tuiles.join(' | ').includes('2 étoiles')
        && fiche.tuiles.join(' | ').includes('3 oublis') && fiche.tuiles.join(' | ').includes('1 absences'),
        JSON.stringify(fiche.tuiles));
    r.egal('ses récompenses sont nommées', fiche.badges.length, 2);
    r.verifie('les oublis sont détaillés par motif, avec leurs dates',
        /Matériel 2/.test(fiche.oublis.join(' ')) && /Carnet 1/.test(fiche.oublis.join(' '))
        && /\d{2}\/\d{2}/.test(fiche.oublis.join(' ')), fiche.oublis.join(' ').slice(0, 200));
    r.verifie('elle propose les mêmes périodes que le bilan', fiche.periodes >= 7, String(fiche.periodes));
    r.verifie('et s\'ouvre sur le trimestre en cours',
        /trimestre|année/i.test(fiche.active || ''), String(fiche.active));
    r.verifie('le mot noté sur l\'élève y est modifiable', fiche.memo);

    // La période filtre bien : « depuis le début » rattrape la trace de 2001
    const parPeriode = await page.evaluate(async () => {
        const lire = async (nom) => {
            const b = Array.from(document.querySelectorAll('.cm-fiche-periode'))
                .find(x => x.textContent.trim() === nom);
            b.click();
            await new Promise(r => setTimeout(r, 200));
            return document.querySelector('.cm-tuile b').textContent.trim();
        };
        const tout = await lire('Depuis le début');
        const semaine = await lire('Cette semaine');
        return { tout, semaine };
    });
    r.egal('depuis le début, la trace de 2001 est comptée', parPeriode.tout, '8');
    r.egal('cette semaine, non', parPeriode.semaine, '7');

    // On revient à la classe
    const retour = await page.evaluate(async () => {
        document.getElementById('cm-fiche-retour').click();
        await new Promise(r => setTimeout(r, 250));
        return { fiche: !!document.querySelector('.cm-fiche'),
                 lignes: document.querySelectorAll('.cm-student-row').length };
    });
    r.verifie('le retour ramène la classe', !retour.fiche && retour.lignes === 25, JSON.stringify(retour));

    await page.evaluate(() => {
        const m = document.getElementById('class-manager-modal');
        if (m) m.remove();
    });

    // =====================================================================
    // « MES CLASSES » : DES ONGLETS, ET PLUS UNE MODALE
    // Une colonne de 172 px pour six noms de classe prenait un sixième de la
    // fenêtre à la liste d'élèves. Et le voile noir interdisait de regarder
    // son cours en pointant un élève : ce n'est pas une question à laquelle
    // il faut répondre avant de continuer, c'est un endroit où l'on reste.
    // =====================================================================
    await page.evaluate(async () => {
        await ClassesStore.saveAll([
            { id: 'o1', name: '4e B', students: [{ id: 'a', name: 'Léa' }, { id: 'b', name: 'Malo' }] },
            { id: 'o2', name: '3e A', students: [{ id: 'c', name: 'Zoé' }] },
            { id: 'o3', name: '6e C', students: [] }
        ]);
        await openClassManagerModal();
        await new Promise(res => setTimeout(res, 400));
    });

    const onglets = await page.evaluate(() => {
        const f = document.getElementById('class-manager-modal');
        const boite = f.querySelector('.modal-box');
        const tousLesOnglets = [...f.querySelectorAll('.cm-class-item')];
        return {
            voile: getComputedStyle(f).backgroundColor,
            fondTraversable: getComputedStyle(f).pointerEvents,
            fenetreCliquable: getComputedStyle(boite).pointerEvents,
            noms: tousLesOnglets.map(o => (o.querySelector('span') || {}).textContent.trim()),
            comptes: tousLesOnglets.map(o => o.querySelector('.cm-onglet-compte').textContent.trim()),
            actifs: tousLesOnglets.filter(o => o.classList.contains('actif')).map(o => o.dataset.id),
            plus: !!f.querySelector('#cm-new-class'),
            // CE QU'IL Y A JUSTE À CÔTÉ DE LA FENÊTRE. Un point pris à mi-hauteur,
            // à vingt pixels de son bord gauche : avec un voile, on y trouvait le
            // voile ; sans lui, on doit trouver ce qui est dessous.
            aCote: (() => {
                const r = boite.getBoundingClientRect();
                const el = document.elementFromPoint(Math.max(2, r.left - 20), r.top + r.height / 2);
                if (!el) return 'rien';
                return el.closest('#class-manager-modal') ? 'la fenêtre elle-même' : (el.id || el.tagName);
            })(),
            largeurDetail: Math.round(f.querySelector('#cm-detail').getBoundingClientRect().width)
        };
    });

    r.egal('une classe, un onglet', onglets.noms, ['4e B', '3e A', '6e C']);
    r.egal('et chacun dit son effectif', onglets.comptes, ['2', '1', '0']);
    r.egal('un seul onglet est ouvert à la fois', onglets.actifs, ['o1']);
    r.verifie('le « + » crée une classe de plus', onglets.plus);

    // LE VOILE NOIR A DISPARU : on peut regarder son tableau en pointant un élève.
    r.egal('plus de fond sombre par-dessus le tableau',
        onglets.voile, 'rgba(0, 0, 0, 0)');
    r.egal('les clics passent à côté de la fenêtre, mais pas au travers',
        { fond: onglets.fondTraversable, fenetre: onglets.fenetreCliquable },
        { fond: 'none', fenetre: 'auto' });
    r.verifie('et ce qui est à côté reste atteignable, pas masqué par un voile',
        onglets.aCote !== 'la fenêtre elle-même' && onglets.aCote !== 'rien', onglets.aCote);

    // LA PLACE RENDUE : la liste d'élèves prend toute la largeur.
    r.verifie('la liste d\'élèves occupe toute la largeur de la fenêtre',
        onglets.largeurDetail > 900, onglets.largeurDetail + ' px');

    // Un vrai clic, à la souris : si un outil flottant repasse par-dessus les
    // onglets, il faut que cette ligne-là le dise — pas que la suite entière
    // s'arrête sur une attente de trente secondes.
    let onglietCliquable = true;
    try {
        await page.click('.cm-class-item[data-id="o2"]', { timeout: 3000 });
    } catch (e) { onglietCliquable = false; }
    await page.waitForTimeout(300);
    r.verifie('l\'onglet est vraiment cliquable, rien ne passe par-dessus', onglietCliquable);
    const change = await page.evaluate(() => {
        const f = document.getElementById('class-manager-modal');
        return {
            actifs: [...f.querySelectorAll('.cm-class-item.actif')].map(o => o.dataset.id),
            eleves: f.querySelectorAll('.cm-student-row').length
        };
    });
    r.egal('un clic sur un onglet change de classe',
        change, { actifs: ['o2'], eleves: 1 });

    // =====================================================================
    // RIEN N'EST ARMÉ AU DÉPART
    // « Bonus » était allumé dès l'ouverture : cliquer un élève pour voir où
    // il en est lui donnait un point. Un geste de curiosité devenait une note,
    // et l'on ne s'en apercevait pas toujours.
    // =====================================================================
    // ONGLET NEUF. Les épreuves précédentes ont armé des modes : pour juger de
    // ce qui est armé À L'OUVERTURE, il faut une page qui n'a rien vécu — sinon
    // c'est l'état qu'on vient de poser qu'on mesure, et le test ne dit plus
    // rien du défaut.
    const { context: ctxPts, page: pagePts, erreurs: errPts } = await ouvrirApp(browser);
    await pagePts.waitForFunction(() => window.PluginManager && PluginManager.plugins.classPointsTool, { timeout: 20000 });
    await pagePts.evaluate(async () => {
        await ClassesStore.saveAll([{
            id: 'cp', name: '4A',
            students: [{ id: 'e1', name: 'Léa' }, { id: 'e2', name: 'Malo' }]
        }]);
        PluginManager.plugins.classPointsTool.ouvrir('cp');
        await new Promise(res => setTimeout(res, 800));
    });

    const etatPoints = () => pagePts.evaluate(() => {
        const P = PluginManager.plugins.classPointsTool;
        const e = P.classes.find(x => x.id === 'cp').students.find(s => s.id === 'e1');
        const prive = document.querySelector('.cm-fiche-prive');
        return {
            mode: P.mode,
            plus: (e.pts && e.pts.plus) || 0,
            fiche: !!document.querySelector('.cm-fiche'),
            prive: !!prive,
            priveOuvert: !!(prive && prive.open)
        };
    });

    r.egal('à l\'ouverture, aucun mode n\'est armé',
        await etatPoints(), { mode: null, plus: 0, fiche: false, prive: false, priveOuvert: false });

    await pagePts.click('.pts-carte[data-id="e1"]');
    await pagePts.waitForTimeout(400);
    const clicSimple = await etatPoints();
    r.egal('cliquer un élève ouvre sa fiche, et ne lui donne RIEN',
        { plus: clicSimple.plus, fiche: clicSimple.fiche }, { plus: 0, fiche: true });

    // CE QUI NE SE PROJETTE PAS : la fiche s'ouvre souvent devant la classe.
    r.verifie('les informations personnelles existent, mais repliées',
        clicSimple.prive && !clicSimple.priveOuvert, JSON.stringify(clicSimple));
    const contenuPrive = await pagePts.evaluate(() => {
        const d = document.querySelector('.cm-fiche-prive');
        // Bloc absent : on le dit dans les lignes qui le concernent, plutôt
        // que de planter et d'emporter les trois cents autres.
        if (!d) return { resume: '(pas de bloc replié)', memoDedans: false,
                         memoDehors: !!document.querySelector('#cm-fiche-memo') };
        return {
            resume: d.querySelector('summary').textContent.trim(),
            memoDedans: !!d.querySelector('#cm-fiche-memo'),
            memoDehors: !!document.querySelector('.cm-fiche > #cm-fiche-memo')
        };
    });
    r.verifie('le résumé dit ce qu\'on va ouvrir', /Autres informations/.test(contenuPrive.resume), contenuPrive.resume);
    r.egal('la note personnelle est bien à l\'intérieur, pas à découvert',
        { dedans: contenuPrive.memoDedans, dehors: contenuPrive.memoDehors }, { dedans: true, dehors: false });

    try { await pagePts.click('#cm-fiche-retour', { timeout: 3000 }); } catch (e) { /* pas de fiche ouverte */ }
    await pagePts.waitForTimeout(300);
    await pagePts.click('#pts-mode-plus');
    await pagePts.waitForTimeout(300);
    r.egal('armer « Bonus » referme la fiche',
        await etatPoints(), { mode: 'plus', plus: 0, fiche: false, prive: false, priveOuvert: false });

    await pagePts.click('.pts-carte[data-id="e1"]');
    await pagePts.waitForTimeout(400);
    r.egal('et c\'est ALORS que le clic donne un point',
        (await etatPoints()).plus, 1);

    await pagePts.click('#pts-mode-plus');
    await pagePts.waitForTimeout(300);
    const desarme = await etatPoints();
    r.egal('recliquer le bouton armé désarme', desarme.mode, null);

    await pagePts.click('.pts-carte[data-id="e1"]');
    await pagePts.waitForTimeout(400);
    const apresDesarme = await etatPoints();
    r.egal('et l\'on revient à la consultation : le point ne bouge plus',
        { plus: apresDesarme.plus, fiche: apresDesarme.fiche }, { plus: 1, fiche: true });

    r.verifie('aucune erreur JS sur la feuille de points', errPts.length === 0, errPts.join(' | '));
    await ctxPts.close();

    // =====================================================================
    // LES VUES D'UNE CLASSE SONT DES ONGLETS, PAS DES FENÊTRES
    // « Points » refermait « Mes classes » pour ouvrir sa propre fenêtre ;
    // « Plan » en empilait une par-dessus. Ce sont trois façons de regarder LA
    // MÊME classe : elles n'ont aucune raison d'être trois fenêtres.
    // =====================================================================
    const fenetresOuvertes = () => page.evaluate(() => {
        // Ce qui flotte par-dessus la page : c'est cela qui s'empilait.
        return [...document.querySelectorAll('body > div')].filter(el => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && cs.position === 'fixed'
                && (parseInt(cs.zIndex, 10) || 0) >= 100000;
        }).map(el => el.id).filter(id => id === 'class-manager-modal' || id === 'points-widget');
    });
    const vueOuverte = () => page.evaluate(() => {
        const a = document.querySelector('.cm-vue.actif');
        const volet = document.querySelector('#cm-detail');
        return {
            vue: a ? a.textContent.trim() : null,
            points: !!(volet && volet.querySelector('#points-widget')),
            plan: !!(volet && volet.querySelector('.sp-canvas')),
            eleves: !!(volet && volet.querySelector('#cm-students-list'))
        };
    });

    // On repart d'un écran net : les épreuves précédentes ont pu laisser la
    // feuille de points ouverte en fenêtre libre.
    await page.evaluate(async () => {
        const outil = PluginManager.plugins.classPointsTool;
        if (outil.accueillirDans) outil.accueillirDans(null);
        if (outil.widgetEl) outil.widgetEl.style.display = 'none';
        const m = document.getElementById('class-manager-modal');
        if (m) m.remove();
        await openClassManagerModal();
        await new Promise(res => setTimeout(res, 400));
    });
    r.egal('une seule fenêtre à l\'ouverture', await fenetresOuvertes(), ['class-manager-modal']);
    r.egal('trois vues sont proposées',
        await page.evaluate(() => [...document.querySelectorAll('.cm-vue')].map(b => b.textContent.trim())),
        ['Élèves', 'Points', 'Plan de classe']);
    r.egal('on arrive sur les élèves', await vueOuverte(),
        { vue: 'Élèves', points: false, plan: false, eleves: true });

    await page.click('.cm-vue[data-vue="points"]');
    await page.waitForTimeout(1200);
    r.egal('la feuille de points se pose DANS la fenêtre', await vueOuverte(),
        { vue: 'Points', points: true, plan: false, eleves: false });
    r.egal('et rien ne s\'est ouvert par-dessus', await fenetresOuvertes(), ['class-manager-modal']);
    r.egal('son bandeau et son menu de classe s\'effacent, ils feraient doublon',
        await page.evaluate(() => {
            const e = document.querySelector('#pts-entete'), c = document.querySelector('#pts-classe');
            return { entete: e ? getComputedStyle(e).display : '?', classe: c ? getComputedStyle(c).display : '?' };
        }), { entete: 'none', classe: 'none' });

    await page.click('.cm-vue[data-vue="plan"]');
    await page.waitForTimeout(1200);
    r.egal('le plan de classe aussi', await vueOuverte(),
        { vue: 'Plan de classe', points: false, plan: true, eleves: false });
    r.egal('et toujours une seule fenêtre', await fenetresOuvertes(), ['class-manager-modal']);

    await page.click('.cm-vue[data-vue="eleves"]');
    await page.waitForTimeout(600);
    r.egal('on revient aux élèves sans rien laisser derrière', await vueOuverte(),
        { vue: 'Élèves', points: false, plan: false, eleves: true });

    // Les anciens boutons conduisent aux mêmes onglets, sans ouvrir de fenêtre.
    await page.click('#cm-points');
    await page.waitForTimeout(1000);
    r.egal('le bouton « Points » mène à l\'onglet, il n\'ouvre plus de fenêtre',
        { vue: (await vueOuverte()).vue, fenetres: await fenetresOuvertes() },
        { vue: 'Points', fenetres: ['class-manager-modal'] });

    // Refermer « Mes classes » doit rendre la feuille à sa vie de fenêtre :
    // sinon on la rouvrirait depuis le tableau dans un volet disparu.
    await page.click('#cm-close');
    await page.waitForTimeout(400);
    const apresFermeture = await page.evaluate(() => {
        const outil = PluginManager.plugins.classPointsTool;
        return { hote: !!outil.hote, dansLeCorps: outil.widgetEl ? outil.widgetEl.parentNode === document.body : null };
    });
    r.egal('refermée, la feuille de points redevient une fenêtre libre',
        apresFermeture, { hote: false, dansLeCorps: true });

    await page.evaluate(() => {
        const m = document.getElementById('class-manager-modal');
        if (m) m.remove();
        const outil = PluginManager.plugins.classPointsTool;
        if (outil && outil.widgetEl) outil.widgetEl.style.display = 'none';
    });

    // =====================================================================
    // LE BILAN : LES DATES, LA PLACE, ET LES RÉCIDIVES
    // Le tableau comptait onze colonnes, dont cinq presque toujours vides, et
    // il ne disait nulle part QUAND un oubli avait eu lieu — la date était
    // pourtant dans le journal. Et il ne distinguait pas trois oublis
    // dispersés de trois oublis d'affilée, qui n'ont rien à voir.
    // =====================================================================
    const releveBilan = await page.evaluate(() => {
        const P = PluginManager.plugins.classPointsTool;
        const dd = x => (x < 10 ? '0' : '') + x;
        const j = (n) => {
            const d = new Date(Date.now() - n * 86400000);
            return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());
        };
        // Cinq jours où l'on a vu la classe
        const J = [j(8), j(6), j(4), j(2), j(0)];
        const eleve = (nom, journal) => ({ id: 'b_' + nom, name: nom, journal });
        P.classes = [{
            id: 'cbilan', name: '4e B', students: [
                // Léa oublie sa signature aux TROIS derniers cours : cela dure
                eleve('Léa', [{ d: J[2], t: 'o', v: 'signature' }, { d: J[3], t: 'o', v: 'signature' },
                              { d: J[4], t: 'o', v: 'signature' }, { d: J[4], t: 'p' }]),
                // Malo oublie deux fois, mais jamais deux cours de suite
                eleve('Malo', [{ d: J[0], t: 'o', v: 'materiel' }, { d: J[3], t: 'o', v: 'materiel' },
                               { d: J[1], t: 'a' }]),
                // Théo : deux cours de suite, mais c'était il y a longtemps
                eleve('Théo', [{ d: J[0], t: 'o', v: 'devoirs' }, { d: J[1], t: 'o', v: 'devoirs' },
                               { d: J[2], t: 'm' }]),
                eleve('Zoé', [{ d: J[1], t: 'p' }, { d: J[3], t: 'b' }])
            ]
        }];
        P.classeId = 'cbilan';
        P.bilanPeriode = 'tout';
        const lignes = P.lignesDuBilan();
        const par = (n) => lignes.find(l => l.nom === n);
        const html = P.htmlBilan();
        return {
            jours: P.joursDeClasse('', '').length,
            colonnes: (html.match(/<th /g) || []).length,
            lea: {
                dates: par('Léa').datesOublis.signature,
                suite: par('Léa').suites.signature.suite,
                enCours: par('Léa').suites.signature.enCours
            },
            malo: { total: par('Malo').totalOublis, pire: par('Malo').pireSuite,
                    absences: par('Malo').datesAbsences },
            theo: { suite: par('Théo').suites.devoirs.suite, enCours: par('Théo').suites.devoirs.enCours },
            zoe: { total: par('Zoé').totalOublis, pire: par('Zoé').pireSuite },
            pastilles: (html.match(/pts-oubli-pastille/g) || []).length,
            alternance: (html.match(/#fbfcfd/g) || []).length,
            suivi: /À suivre/.test(html),
            texteSuivi: (html.match(/À suivre[\s\S]{0,200}/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            infobulleDate: /data-tooltip="[^"]*Signature[^"]*\/[^"]*"/.test(html)
        };
    });

    // LES JOURS DE COURS : on ne tient pas d'emploi du temps, et il n'en faut
    // pas — un jour où l'on a noté quelque chose est un jour où on les avait.
    r.egal('les jours où l\'on a vu la classe se déduisent du journal', releveBilan.jours, 5);

    r.verifie('le tableau tient en cinq colonnes, au lieu de onze',
        releveBilan.colonnes === 5, releveBilan.colonnes + ' colonnes');
    r.verifie('une ligne sur deux est teintée', releveBilan.alternance >= 2, String(releveBilan.alternance));

    // LES DATES : elles étaient dans le journal, jamais à l'écran.
    r.egal('les dates de chaque oubli sont là', releveBilan.lea.dates.length, 3);
    r.verifie('et elles s\'écrivent en clair, jour et mois',
        /^\d{2}\/\d{2}$/.test(releveBilan.lea.dates[0]), releveBilan.lea.dates.join(', '));
    r.verifie('on les retrouve au survol de la pastille', releveBilan.infobulleDate);
    r.egal('les dates d\'absence aussi', releveBilan.malo.absences.length, 1);

    // LA RÉCIDIVE : trois oublis dispersés et trois d'affilée ne se valent pas.
    r.egal('trois oublis aux trois derniers cours font une suite de trois',
        { suite: releveBilan.lea.suite, enCours: releveBilan.lea.enCours }, { suite: 3, enCours: true });
    r.egal('deux oublis espacés ne font pas une suite',
        { total: releveBilan.malo.total, pire: releveBilan.malo.pire }, { total: 2, pire: 1 });
    r.egal('une suite ancienne se voit, mais elle ne « dure » plus',
        { suite: releveBilan.theo.suite, enCours: releveBilan.theo.enCours }, { suite: 2, enCours: false });
    r.egal('un élève sans oubli n\'a rien à signaler',
        { total: releveBilan.zoe.total, pire: releveBilan.zoe.pire }, { total: 0, pire: 0 });

    // CE QUI DOIT SAUTER AUX YEUX : celui qui recommence en ce moment.
    r.verifie('un bandeau nomme ceux dont la suite court encore', releveBilan.suivi);
    r.verifie('et il dit qui, quoi, et combien de cours de suite',
        /Léa/.test(releveBilan.texteSuivi) && /signature/.test(releveBilan.texteSuivi) && /3 cours de suite/.test(releveBilan.texteSuivi),
        releveBilan.texteSuivi);
    r.verifie('Théo, dont la suite est finie, n\'y figure pas',
        !/Théo/.test(releveBilan.texteSuivi), releveBilan.texteSuivi);
    r.verifie('trois pastilles d\'oubli, une par élève concerné',
        releveBilan.pastilles === 3, String(releveBilan.pastilles));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
