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

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
