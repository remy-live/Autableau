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
