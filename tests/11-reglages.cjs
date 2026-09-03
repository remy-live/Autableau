// Réglages d'affichage : la roue de la date (format, heure), le panneau de la
// barre des plugins, la répartition des icônes, l'astuce du jour, et le
// panneau d'une barre flottante qui doit passer devant les autres.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Réglages');
    const { context, page, erreurs } = await ouvrirApp(browser, { astuces: true });
    await page.waitForFunction(() => typeof reglagesDate !== 'undefined', { timeout: 20000 });

    // --- ASTUCE DU JOUR ---
    await page.waitForTimeout(2600);
    const astuce = await page.evaluate(() => ({
        visible: getComputedStyle(document.getElementById('astuce-modal')).display !== 'none',
        titre: document.getElementById('astuce-titre').innerText,
        texte: document.getElementById('astuce-texte').innerText.length
    }));
    r.verifie('une astuce est proposée au démarrage', astuce.visible, JSON.stringify(astuce));
    r.verifie('elle a un titre et un texte', astuce.titre.length > 5 && astuce.texte > 60, astuce.titre);

    const suivante = await page.evaluate(() => {
        const avant = document.getElementById('astuce-titre').innerText;
        montrerAstuce(false, 1);
        return { avant, apres: document.getElementById('astuce-titre').innerText };
    });
    r.verifie('« astuce suivante » en montre une autre', suivante.avant !== suivante.apres, JSON.stringify(suivante));

    const uneParJour = await page.evaluate(() => {
        fermerAstuce();
        const ferme = getComputedStyle(document.getElementById('astuce-modal')).display === 'none';
        const memoire = JSON.parse(localStorage.getItem('board_astuces') || '{}');
        return { ferme, jour: memoire.jour, aujourdhui: new Date().toDateString() };
    });
    r.verifie('elle se ferme', uneParJour.ferme);
    r.egal('et ne revient pas le même jour', uneParJour.jour, uneParJour.aujourdhui);

    const desactivee = await page.evaluate(() => {
        basculerAstuces();
        const etat = JSON.parse(localStorage.getItem('board_astuces') || '{}');
        basculerAstuces();
        return etat.active;
    });
    r.egal('on peut les désactiver', desactivee, false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // --- LA DATE DANS LE TITRE ---
    const titreDepart = await page.evaluate(() => document.getElementById('project-name-input').value);
    r.verifie('le titre porte la date du jour', /\d{4}|\d{2}\/\d{2}/.test(titreDepart), titreDepart);

    const formats = await page.evaluate(() => {
        const res = {};
        ['long', 'moyen', 'court', 'chiffres'].forEach(f => {
            document.querySelector(`#reglages-date [data-format="${f}"]`).click();
            res[f] = document.getElementById('project-name-input').value;
        });
        return res;
    });
    r.verifie('format long : le jour de la semaine', /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i.test(formats.long), formats.long);
    r.verifie('format moyen : sans le jour de la semaine',
        !/lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i.test(formats.moyen) && /\d{4}/.test(formats.moyen), formats.moyen);
    r.verifie('format court : sans l\'année', !/\d{4}/.test(formats.court), formats.court);
    r.verifie('format chiffré', /^\d{2}\/\d{2}\/\d{4}$/.test(formats.chiffres), formats.chiffres);

    const avecHeure = await page.evaluate(() => {
        document.getElementById('rd-heure').click();
        return document.getElementById('project-name-input').value;
    });
    r.verifie('l\'heure s\'ajoute', /\d{2}:\d{2}/.test(avecHeure), avecHeure);

    // Le titre est un <input> : « width: auto » lui donne la largeur de son
    // attribut « size », pas celle de son contenu. La date longue avec
    // l'heure débordait — on lisait « Mercredi 2 septembre 20 ».
    // La largeur posée ne prend effet qu'à la mise en page suivante : on
    // mesure donc après, jamais dans la même tâche que l'écriture.
    const mesurerLeTitre = async () => page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        const cs = getComputedStyle(champ);
        const regle = document.createElement('span');
        regle.style.cssText = 'position:absolute; visibility:hidden; white-space:pre; top:-9999px;';
        regle.style.font = cs.font; regle.style.letterSpacing = cs.letterSpacing;
        regle.textContent = champ.value;
        document.body.appendChild(regle);
        const besoin = regle.offsetWidth; regle.remove();
        return { valeur: champ.value, besoin: Math.round(besoin),
                 dispo: Math.round(champ.clientWidth),
                 large: Math.round(champ.getBoundingClientRect().width),
                 entier: besoin <= champ.clientWidth,
                 dansEcran: champ.getBoundingClientRect().right <= window.innerWidth };
    });

    await page.evaluate(() => {
        document.querySelector('#reglages-date [data-format="long"]').click();
    });
    await page.waitForTimeout(200);
    const dateEtHeure = await mesurerLeTitre();
    r.verifie('la date longue ET l\'heure tiennent dans le titre, sans troncature',
        dateEtHeure.entier && /\d{2}:\d{2}/.test(dateEtHeure.valeur), JSON.stringify(dateEtHeure));

    // Un titre très long ne peut pas tout prendre : il s'arrête à la place que
    // laissent les barres flottantes, sans jamais sortir de l'écran.
    const TRES_LONG = 'Un titre vraiment très long écrit à la main par un enseignant bavard';
    await page.evaluate((t) => {
        const champ = document.getElementById('project-name-input');
        champ.value = t; ajusterLargeurDuTitre();
    }, TRES_LONG);
    await page.waitForTimeout(200);
    const tresLong = await mesurerLeTitre();
    r.verifie('un titre trop long s\'arrête à la place disponible',
        tresLong.dansEcran && tresLong.large <= 580, JSON.stringify(tresLong));

    // En mode Focus, les barres s'effacent : le titre a plus de place. Cela
    // ne se voit que sur un écran étroit — au large, le plafond décide.
    await page.setViewportSize({ width: 720, height: 800 });
    await page.evaluate(() => ajusterLargeurDuTitre());
    await page.waitForTimeout(200);
    const etroit = await mesurerLeTitre();
    await page.evaluate(() => {
        document.body.classList.add('focus-mode');
        ajusterLargeurDuTitre();
    });
    await page.waitForTimeout(200);
    const enFocus = await mesurerLeTitre();
    r.verifie('en mode Focus, le titre respire : les barres sont parties',
        enFocus.large > etroit.large, `focus ${enFocus.large} px, normal ${etroit.large} px`);
    r.verifie('et il ne sort pas de l\'écran pour autant', enFocus.dansEcran,
        JSON.stringify(enFocus));
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.evaluate(() => {
        document.body.classList.remove('focus-mode');
        // On rend au titre la date du jour, et le format que la suite attend
        document.querySelector('#reglages-date [data-format="chiffres"]').click();
    });
    await page.waitForTimeout(150);

    const respecte = await page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        champ.value = 'Ma leçon de géométrie';
        champ.dispatchEvent(new Event('change'));
        poserDateDansTitre(false);           // le rafraîchissement automatique
        return champ.value;
    });
    r.egal('un titre écrit à la main n\'est jamais remplacé', respecte, 'Ma leçon de géométrie');

    const memoire = await page.evaluate(() => JSON.parse(localStorage.getItem('board_reglages_date') || '{}'));
    r.verifie('les réglages de date sont mémorisés', memoire.format === 'chiffres' && memoire.heure === true,
        JSON.stringify(memoire));

    // --- PANNEAU DE LA BARRE DES PLUGINS ---
    const panneau = await page.evaluate(() => {
        document.getElementById('btn-reglages-barre').click();
        const el = document.getElementById('reglages-barre');
        const b = el.getBoundingClientRect();
        return {
            visible: el.classList.contains('visible'),
            dansEcran: b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1 && b.left >= -1,
            choix: el.querySelectorAll('.rp-choix').length
        };
    });
    r.verifie('le panneau de la barre s\'ouvre', panneau.visible);
    r.verifie('et tient dans l\'écran', panneau.dansEcran, JSON.stringify(panneau));
    r.verifie('il propose les trois formats d\'icônes plus la date et les astuces', panneau.choix >= 6, `${panneau.choix} choix`);

    for (const [format, classe] of [['couleur', 'libelles-couleur'], ['oui', 'libelles-outils'], ['non', null]]) {
        const applique = await page.evaluate((f) => {
            document.querySelector(`#reglages-barre [data-libelles="${f}"]`).click();
            return {
                outils: document.body.classList.contains('libelles-outils'),
                couleur: document.body.classList.contains('libelles-couleur'),
                memoire: localStorage.getItem('board_libelles')
            };
        }, format);
        const attendu = format === 'non' ? !applique.outils
            : format === 'oui' ? (applique.outils && !applique.couleur)
            : (applique.outils && applique.couleur);
        r.verifie(`format « ${format} » appliqué depuis le panneau`, attendu && applique.memoire === format,
            JSON.stringify(applique));
    }

    const dateMasquee = await page.evaluate(() => {
        document.getElementById('rp-date').click();
        const cadre = document.getElementById('project-name-wrapper');
        const masque = getComputedStyle(cadre).display === 'none';
        document.getElementById('rp-date').click();
        return { masque, revenue: getComputedStyle(cadre).display !== 'none' };
    });
    r.verifie('la date se masque et revient', dateMasquee.masque && dateMasquee.revenue, JSON.stringify(dateMasquee));

    // --- LA DATE, L'HEURE, ET SA PLACE ---
    // Les deux interrupteurs sont offerts dans deux fenêtres : ils doivent
    // dire la même chose, sinon l'une paraît ne pas avoir compris l'autre.
    const deuxFenetres = await page.evaluate(() => {
        const etat = () => ({
            dansLaBarre: document.getElementById('rp-date').classList.contains('actif'),
            dansLaDate: document.getElementById('rd-date').classList.contains('actif'),
            visible: getComputedStyle(document.getElementById('project-name-wrapper')).display !== 'none'
        });
        basculerReglagesDate();                     // ouvre la fenêtre de la date
        document.getElementById('rd-date').click(); // on masque depuis celle-ci
        const masquee = etat();
        document.getElementById('rp-date').click(); // on rétablit depuis l'autre
        const revenue = etat();
        return { masquee, revenue };
    });
    r.verifie('masquer la date depuis sa propre fenêtre marche',
        !deuxFenetres.masquee.visible, JSON.stringify(deuxFenetres.masquee));
    r.verifie('et les deux fenêtres s\'accordent',
        deuxFenetres.masquee.dansLaBarre === deuxFenetres.masquee.dansLaDate
        && deuxFenetres.revenue.dansLaBarre === deuxFenetres.revenue.dansLaDate,
        JSON.stringify(deuxFenetres));
    r.verifie('la date est revenue', deuxFenetres.revenue.visible, JSON.stringify(deuxFenetres.revenue));

    const heureIci = await page.evaluate(() => {
        // On part d'un état connu : la suite a déjà touché à ces réglages, et
        // le titre porte peut-être un nom écrit à la main.
        reglagesDate.heure = false;
        enregistrerReglagesDate();
        poserDateDansTitre(true);
        const sansHeure = document.getElementById('project-name-input').value;
        const b = document.getElementById('rd-heure');
        b.click();
        const avecHeure = document.getElementById('project-name-input').value;
        const allume = b.classList.contains('actif');
        b.click();
        return { sansHeure, avecHeure, allume, apres: document.getElementById('project-name-input').value };
    });
    r.verifie('l\'heure s\'ajoute à la date, dans la même fenêtre',
        heureIci.allume && /\d{1,2}:\d{2}/.test(heureIci.avecHeure)
        && !/\d{1,2}:\d{2}/.test(heureIci.sansHeure), JSON.stringify(heureIci));
    r.egal('et se retire', heureIci.apres, heureIci.sansHeure);

    // On la prend par sa poignée et on la pose ailleurs. La position est
    // bornée À L'ENREGISTREMENT : gardée hors de l'écran, elle reviendrait
    // telle quelle à la séance suivante.
    const depart = await page.evaluate(() => {
        localStorage.removeItem('auTableau_titre_pose');
        titrePose = null; majPoseDuTitre();
        const cadre = document.getElementById('project-name-wrapper');
        const prise = document.getElementById('titre-prise');
        cadre.classList.add('editing');           // les commandes se montrent au survol
        const p = prise.getBoundingClientRect();
        if (!p.width) return { rate: 'poignée sans taille' };
        const c = cadre.getBoundingClientRect();
        return { x: Math.round(p.left + p.width / 2), y: Math.round(p.top + p.height / 2),
                 gauche: Math.round(c.left), haut: Math.round(c.top) };
    });
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    await page.mouse.move(depart.x + 120, depart.y + 220, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const deplacee = await page.evaluate(() => {
        const c = document.getElementById('project-name-wrapper').getBoundingClientRect();
        return {
            gauche: Math.round(c.left), haut: Math.round(c.top),
            pose: titrePose && { x: Math.round(titrePose.x), y: Math.round(titrePose.y) },
            memoire: JSON.parse(localStorage.getItem('auTableau_titre_pose') || 'null'),
            dansEcran: c.left >= 0 && c.top >= 0 && c.right <= window.innerWidth + 1
                && c.bottom <= window.innerHeight + 1
        };
    });
    r.verifie('la poignée déplace la date, d\'autant qu\'on a tiré',
        !!deplacee.pose && Math.abs(deplacee.gauche - (depart.gauche + 120)) <= 14
        && Math.abs(deplacee.haut - (depart.haut + 220)) <= 14,
        JSON.stringify({ depart, deplacee }));
    r.verifie('sans la laisser sortir de l\'écran', deplacee.dansEcran, JSON.stringify(deplacee));
    r.verifie('et la place choisie est retenue',
        !!deplacee.memoire && isFinite(deplacee.memoire.x), JSON.stringify(deplacee.memoire));

    // Un geste vif ne doit pas la mémoriser dehors
    const horsEcran = await page.evaluate(() => {
        const cadre = document.getElementById('project-name-wrapper');
        const prise = document.getElementById('titre-prise');
        const p = prise.getBoundingClientRect();
        prise.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true,
            pointerId: 7, clientX: p.left + 5, clientY: p.top + 5 }));
        prise.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true,
            pointerId: 7, clientX: -4000, clientY: -4000, movementX: -4000, movementY: -4000 }));
        prise.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7 }));
        const c = cadre.getBoundingClientRect();
        return { pose: titrePose, dansEcran: c.left >= 0 && c.top >= 0,
                 memoire: JSON.parse(localStorage.getItem('auTableau_titre_pose') || 'null') };
    });
    r.verifie('un geste vif ne la mémorise pas hors de l\'écran',
        horsEcran.dansEcran && horsEcran.memoire && horsEcran.memoire.x >= 0 && horsEcran.memoire.y >= 0,
        JSON.stringify(horsEcran));

    // Le double-clic sur la poignée la remet en haut
    const prisePos = await page.evaluate(() => {
        const p = document.getElementById('titre-prise').getBoundingClientRect();
        return { x: Math.round(p.left + p.width / 2), y: Math.round(p.top + p.height / 2) };
    });
    await page.mouse.dblclick(prisePos.x, prisePos.y);
    await page.waitForTimeout(250);
    const remise = await page.evaluate(() => {
        const cadre = document.getElementById('project-name-wrapper');
        const c = cadre.getBoundingClientRect();
        // La bande d'onglets des plugins tient le haut au CENTRE. La date y
        // était dessus : cinq onglets devenaient inatteignables. Sa place par
        // défaut doit donc être ailleurs — en haut à GAUCHE, et sans mordre
        // sur la bande, même quand le tiroir est fermé (les onglets gardent
        // leur place, ils ne font que se replier).
        const onglets = document.getElementById('plugin-tabs');
        const t = onglets ? onglets.getBoundingClientRect() : null;
        const chevauche = !!(t && t.width && c.right > t.left && c.left < t.right
            && c.bottom > t.top && c.top < t.bottom);
        cadre.classList.remove('editing');
        return { pose: titrePose, haut: Math.round(c.top), gauche: Math.round(c.left),
                 chevauche, onglets: t && { g: Math.round(t.left), d: Math.round(t.right) },
                 memoire: localStorage.getItem('auTableau_titre_pose') };
    });
    r.egal('le double-clic défait le déplacement', remise.pose, null);
    r.verifie('elle retrouve le haut du tableau, à gauche',
        remise.haut < 40 && remise.gauche < 40, JSON.stringify(remise));
    r.verifie('sans recouvrir les onglets des plugins',
        !remise.chevauche, JSON.stringify(remise));
    r.egal('et l\'oubli est retenu', remise.memoire, null);

    // Le menu des réglages pend sous le titre, hors de la boîte qui reçoit le
    // survol : en descendant vers lui, on quittait le titre et il disparaissait
    // avant qu'on l'atteigne. On refait le trajet à la souris.
    const roue = await page.evaluate(() => {
        const b = document.getElementById('btn-reglages-date').getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    await page.mouse.move(roue.x, roue.y);
    await page.mouse.click(roue.x, roue.y);
    await page.waitForTimeout(150);
    const cible = await page.evaluate(() => {
        const b = document.getElementById('rd-heure').getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    // Le trajet passe par le vide entre la roue et le menu : c'est là que tout
    // s'effaçait.
    await page.mouse.move(cible.x, cible.y, { steps: 12 });
    await page.waitForTimeout(150);
    const survol = await page.evaluate(() => {
        const p = document.getElementById('reglages-date');
        const b = p.getBoundingClientRect();
        const st = getComputedStyle(p.parentElement);
        const dessus = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                                 Math.round(b.top + b.height / 2));
        return { visible: p.classList.contains('visible'), opacite: st.opacity,
                 clics: st.pointerEvents, atteint: !!(dessus && p.contains(dessus)) };
    });
    r.verifie('le menu des réglages reste là quand on va vers lui',
        survol.visible && survol.opacite === '1' && survol.clics !== 'none' && survol.atteint,
        JSON.stringify(survol));
    // Et il se referme d'un clic à côté.
    await page.mouse.click(roue.x, roue.y);
    await page.waitForTimeout(150);
    const referme = await page.evaluate(() => ({
        visible: document.getElementById('reglages-date').classList.contains('visible'),
        classe: document.getElementById('project-name-wrapper').classList.contains('reglages-ouverts')
    }));
    r.verifie('et se referme quand on rappuie sur la roue',
        !referme.visible && !referme.classe, JSON.stringify(referme));

    // --- RÉPARTITION DES ICÔNES ---
    await page.evaluate(() => choisirFormatIcones('couleur'));
    await page.evaluate(() => {
        const d = document.getElementById('bar-plugins');
        if (d) d.classList.add('open');
        const o = Array.from(document.querySelectorAll('.btn')).find(x => (x.getAttribute('data-tooltip') || '') === 'Maths - Numérique');
        if (o) o.click();
    });
    await page.waitForTimeout(800);
    const rangees = await page.evaluate(() => {
        const g = document.getElementById('plugins-grid');
        const btns = Array.from(g.querySelectorAll('.btn')).filter(x => x.offsetParent);
        const parLigne = {};
        btns.forEach(x => {
            const t = Math.round(x.getBoundingClientRect().top);
            parLigne[t] = (parLigne[t] || 0) + 1;
        });
        return { total: btns.length, repartition: Object.values(parLigne) };
    });
    const ecart = Math.max(...rangees.repartition) - Math.min(...rangees.repartition);
    r.verifie('les rangées d\'icônes sont équilibrées', ecart <= 1,
        `${rangees.total} outils répartis en ${JSON.stringify(rangees.repartition)}`);

    // --- PANNEAU D'UNE BARRE FLOTTANTE ---
    const dessus = await page.evaluate(() => {
        createFloatingToolbar(500, 400, ['Fraction Visuelle', 'Horloge Pédagogique']);
        createFloatingToolbar(560, 400, ['Dés à jouer']);
        const barres = Array.from(document.querySelectorAll('#custom-bars-container .custom-toolbar'));
        const cible = barres[barres.length - 2] || barres[0];
        cible.querySelector('.c-action.settings').click();
        const menu = cible.querySelector('.toolbar-menu');
        const b = menu.getBoundingClientRect();
        const dessous = document.elementFromPoint(b.left + b.width / 2, b.top + 30);
        return {
            marquee: cible.classList.contains('reglages-ouverts'),
            auDessus: !!(dessous && dessous.closest('.toolbar-menu'))
        };
    });
    r.verifie('le panneau d\'une barre passe devant les barres voisines',
        dessus.marquee && dessus.auDessus, JSON.stringify(dessus));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
