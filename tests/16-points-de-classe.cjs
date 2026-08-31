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
    const raz = await page.evaluate(() => {
        const p = PluginManager.plugins.classPointsTool;
        window.confirm = () => true;
        p.panneauReglages = true; p.rendre();
        document.getElementById('pts-raz').click();
        return p.classeCourante().students.map(s => s.pts);
    });
    r.verifie('la remise à zéro efface les points', raz.every(p => p.plus === 0 && p.moins === 0), JSON.stringify(raz));
    r.verifie('mais garde les étoiles gagnées', raz[0].etoiles === 1, JSON.stringify(raz[0]));

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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
