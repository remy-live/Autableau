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

    // La date et l'horloge sont deux choses distinctes : le cadre ne disparaît
    // que lorsqu'il ne reste RIEN à montrer.
    const dateMasquee = await page.evaluate(() => {
        reglagesDate.heure = false; enregistrerReglagesDate();
        poserDateDansTitre(true); majAffichageDate();
        const cadre = document.getElementById('project-name-wrapper');
        document.getElementById('rp-date').click();
        const masque = getComputedStyle(cadre).display === 'none';
        document.getElementById('rp-date').click();
        return { masque, revenue: getComputedStyle(cadre).display !== 'none' };
    });
    r.verifie('la date se masque et revient', dateMasquee.masque && dateMasquee.revenue, JSON.stringify(dateMasquee));

    // L'HORLOGE SEULE : sans la date, elle doit rester à l'écran. C'était le
    // même interrupteur pour les deux — éteindre la date emportait l'heure.
    const horlogeSeule = await page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        const cadre = document.getElementById('project-name-wrapper');
        reglagesDate.affichee = false; reglagesDate.heure = true;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        const seule = { texte: champ.value, visible: getComputedStyle(cadre).display !== 'none' };
        reglagesDate.heure = false;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        const rien = { texte: champ.value, visible: getComputedStyle(cadre).display !== 'none' };
        reglagesDate.affichee = true;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        return { seule, rien, retour: champ.value };
    });
    r.verifie('l\'horloge tient debout sans la date',
        horlogeSeule.seule.visible && /^\d{1,2}:\d{2}$/.test(horlogeSeule.seule.texte),
        JSON.stringify(horlogeSeule.seule));
    r.verifie('ni l\'une ni l\'autre : le cadre s\'efface',
        !horlogeSeule.rien.visible && !horlogeSeule.rien.texte, JSON.stringify(horlogeSeule.rien));
    r.verifie('et la date revient quand on la rallume',
        /\d{4}|\d{2}\/\d{2}/.test(horlogeSeule.retour), horlogeSeule.retour);

    // --- LA DATE, L'HEURE, ET SA PLACE ---
    // Les deux interrupteurs sont offerts dans deux fenêtres : ils doivent
    // dire la même chose, sinon l'une paraît ne pas avoir compris l'autre.
    const deuxFenetres = await page.evaluate(() => {
        const etat = () => ({
            dansLaBarre: document.getElementById('rp-date').classList.contains('actif'),
            dansLaDate: document.getElementById('rd-date').classList.contains('actif'),
            visible: getComputedStyle(document.getElementById('project-name-wrapper')).display !== 'none'
        });
        reglagesDate.heure = false; enregistrerReglagesDate();
        poserDateDansTitre(true); majAffichageDate();
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

    // --- L'HEURE : EN CHIFFRES OU À AIGUILLES ---
    // La pastille rouge qui occupait ce coin est retirée : allumée au premier
    // geste et éteinte seulement en enregistrant un tableau nommé, elle était
    // allumée en permanence et ne signalait plus rien. Un cadran la remplace.
    r.verifie('la pastille « non enregistré » a disparu',
        await page.evaluate(() => !document.getElementById('unsaved-indicator')));

    // Le choix « chiffres / aiguilles » se voit MÊME quand l'heure est éteinte :
    // caché derrière l'interrupteur, il était introuvable. Et le demander
    // allume l'heure du même geste.
    const trouvable = await page.evaluate(() => {
        reglagesDate.heure = false; reglagesDate.horloge = 'chiffres';
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate(); majReglagesDate();
        const forme = document.getElementById('rd-forme-heure');
        const visibleEteint = getComputedStyle(forme).display !== 'none';
        document.querySelector('[data-horloge="aiguilles"]').click();
        return { visibleEteint, heure: reglagesDate.heure,
                 cadran: document.getElementById('titre-horloge').classList.contains('visible') };
    });
    r.verifie('le choix du cadran se voit même quand l\'heure est éteinte',
        trouvable.visibleEteint, JSON.stringify(trouvable));
    r.verifie('et le demander allume l\'heure',
        trouvable.heure && trouvable.cadran, JSON.stringify(trouvable));

    // La pastille de la date s'arrête au texte et n'est plus une gélule.
    const cadreDeLaDate = await page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        reglagesDate.affichee = true; reglagesDate.heure = false; reglagesDate.horloge = 'chiffres';
        enregistrerReglagesDate();
        document.querySelector('#reglages-date [data-format="chiffres"]').click();
        const cs = getComputedStyle(champ);
        return { arrondi: parseFloat(cs.borderRadius), plancher: parseFloat(cs.minWidth) || 0,
                 large: Math.round(champ.getBoundingClientRect().width), texte: champ.value };
    });
    r.verifie('le cadre de la date n\'est plus une gélule',
        cadreDeLaDate.arrondi > 0 && cadreDeLaDate.arrondi <= 12, JSON.stringify(cadreDeLaDate));
    r.verifie('et il s\'arrête au texte, sans largeur plancher',
        cadreDeLaDate.plancher < 10 && cadreDeLaDate.large < 160, JSON.stringify(cadreDeLaDate));

    const cadran = await page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        const svg = document.getElementById('titre-horloge');
        const cadre = document.getElementById('project-name-wrapper');
        const lire = () => ({
            texte: champ.value,
            champVisible: getComputedStyle(champ).display !== 'none',
            cadran: svg.classList.contains('visible'),
            cadre: getComputedStyle(cadre).display !== 'none',
            heure: document.getElementById('th-heure').style.transform,
            minute: document.getElementById('th-minute').style.transform
        });
        reglagesDate.affichee = true; reglagesDate.heure = true; reglagesDate.horloge = 'chiffres';
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        const chiffres = lire();
        document.querySelector('[data-horloge="aiguilles"]').click();
        const aiguilles = lire();
        // L'horloge seule : la date éteinte, il ne reste que le cadran.
        document.getElementById('rd-date').click();
        const seul = lire();
        document.getElementById('rd-date').click();
        document.querySelector('[data-horloge="chiffres"]').click();
        const retour = lire();
        const d = new Date();
        return { chiffres, aiguilles, seul, retour,
                 attendu: { h: (d.getHours() % 12) * 30 + d.getMinutes() * 0.5, m: d.getMinutes() * 6 } };
    });
    r.verifie('en chiffres, l\'heure est dans le texte et le cadran absent',
        /\d{1,2}:\d{2}/.test(cadran.chiffres.texte) && !cadran.chiffres.cadran,
        JSON.stringify(cadran.chiffres));
    r.verifie('à aiguilles, elle quitte le texte pour le cadran',
        cadran.aiguilles.cadran && !/\d{1,2}:\d{2}/.test(cadran.aiguilles.texte),
        JSON.stringify(cadran.aiguilles));
    // Les aiguilles disent VRAIMENT l'heure : celle des heures avance avec les
    // minutes, sinon elle sauterait d'un chiffre à l'autre et mentirait
    // cinquante-neuf minutes sur soixante.
    const angle = (t) => parseFloat(String(t).replace(/[^-\d.]/g, ''));
    r.verifie('et elles disent l\'heure qu\'il est',
        Math.abs(angle(cadran.aiguilles.heure) - cadran.attendu.h) < 1
        && Math.abs(angle(cadran.aiguilles.minute) - cadran.attendu.m) < 1,
        JSON.stringify({ lu: cadran.aiguilles, attendu: cadran.attendu }));
    r.verifie('l\'horloge tient seule : le champ vide s\'efface, le cadran reste',
        cadran.seul.cadran && cadran.seul.cadre && !cadran.seul.champVisible && !cadran.seul.texte,
        JSON.stringify(cadran.seul));
    r.verifie('et l\'on revient aux chiffres',
        !cadran.retour.cadran && /\d{1,2}:\d{2}/.test(cadran.retour.texte)
        && cadran.retour.champVisible, JSON.stringify(cadran.retour));

    // --- L'HORLOGE SE VOIT, SE CHOISIT ET S'AGRANDIT ---
    await page.evaluate(() => {
        reglagesDate.affichee = true; reglagesDate.heure = true;
        reglagesDate.horloge = 'aiguilles'; delete reglagesDate.taille;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
    });
    await page.waitForTimeout(200);

    // LE CADRAN EST VRAIMENT DESSINÉ. Ce n'est pas une évidence : en emballant
    // le <svg> dans une boîte, j'ai perdu le chevron qui fermait sa balise, et
    // tout son contenu est devenu des attributs. L'horloge s'affichait, ronde,
    // à la bonne taille — et parfaitement vide. Compter les éléments ne
    // suffirait pas : on regarde l'encre qu'elle pose.
    const dessin = await page.evaluate(async () => {
        const svg = document.getElementById('titre-horloge');
        const r = svg.getBoundingClientRect();
        const brut = new XMLSerializer().serializeToString(svg);
        // On repeint le cadran seul, sur du blanc, et l'on compte les pixels
        // qui ne le sont pas : un cadran vide n'en pose aucun.
        const style = `<style>
            .th-cadran{fill:none;stroke:#cbd5e1;stroke-width:1.8}
            .th-reperes{stroke:#94a3b8;stroke-width:1}
            .th-reperes .th-quart{stroke:#64748b;stroke-width:1.8}
            .th-heure{stroke:#334155;stroke-width:2.8}
            .th-minute{stroke:#334155;stroke-width:1.9}
            .th-axe{fill:#334155}</style>`;
        const src = brut.replace(/(<svg[^>]*>)/, '$1' + style);
        const img = new Image();
        const pret = new Promise(ok => { img.onload = ok; img.onerror = ok; });
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(src)));
        await pret;
        const c = document.createElement('canvas');
        c.width = 80; c.height = 80;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 80);
        try { g.drawImage(img, 0, 0, 80, 80); } catch (e) { /* rendu refusé */ }
        const px = g.getImageData(0, 0, 80, 80).data;
        let encre = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 235 || px[i + 1] < 235 || px[i + 2] < 235) encre++;
        }
        return { taille: Math.round(r.width), carre: Math.abs(r.width - r.height) < 2,
                 reperes: svg.querySelectorAll('.th-reperes line').length,
                 aiguilles: svg.querySelectorAll('.th-heure, .th-minute').length,
                 encre };
    });
    // Quarante-six pixels, c'était une vignette : au fond de la classe on n'y
    // lisait rien.
    r.verifie('l\'horloge s\'ouvre assez grande pour se lire de loin',
        dessin.taille >= 64 && dessin.carre, JSON.stringify(dessin));
    r.egal('elle a ses douze repères et ses deux aiguilles',
        { reperes: dessin.reperes, aiguilles: dessin.aiguilles }, { reperes: 12, aiguilles: 2 });
    r.verifie('et le cadran pose vraiment de l\'encre, il n\'est pas vide',
        dessin.encre > 200, `${dessin.encre} pixels dessinés sur 6400`);

    // UN CLIC pose le cadre et sa poignée. Il faut le prendre au relâcher et
    // non sur un « click » : le cadre de la date capture le pointeur dès
    // l'appui, et le navigateur lui porte alors le clic, jamais à l'horloge.
    const boiteH = await page.locator('#titre-horloge').boundingBox();
    await page.mouse.click(boiteH.x + boiteH.width / 2, boiteH.y + boiteH.height / 2);
    await page.waitForTimeout(150);
    const choisie = await page.evaluate(() => ({
        cadre: document.getElementById('titre-horloge-boite').classList.contains('choisie'),
        poignee: getComputedStyle(document.getElementById('th-poignee')).display !== 'none'
    }));
    r.egal('un clic sur l\'horloge pose un cadre et sa poignée', choisie, { cadre: true, poignee: true });
    // Sans le cadre, il n'y a pas de poignée à tirer : on l'ouvre à la main
    // pour que les vérifications suivantes disent quand même ce qu'elles ont à
    // dire, au lieu d'entraîner la suite dans leur chute.
    if (!choisie.poignee) {
        await page.evaluate(() => document.getElementById('titre-horloge-boite').classList.add('choisie'));
        await page.waitForTimeout(120);
    }

    // ON TIRE LA POIGNÉE : l'horloge grandit, et la taille se retient.
    const pg = await page.locator('#th-poignee').boundingBox();
    await page.mouse.move(pg.x + pg.width / 2, pg.y + pg.height / 2);
    await page.mouse.down();
    await page.mouse.move(pg.x + pg.width / 2 + 55, pg.y + pg.height / 2 + 55, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const agrandie = await page.evaluate(() => ({
        taille: Math.round(document.getElementById('titre-horloge').getBoundingClientRect().width),
        gardee: JSON.parse(localStorage.getItem('board_reglages_date') || '{}').taille
    }));
    r.verifie('tirer la poignée agrandit l\'horloge',
        agrandie.taille >= dessin.taille + 40, JSON.stringify({ avant: dessin.taille, apres: agrandie.taille }));
    r.verifie('et la taille choisie se retient',
        agrandie.gardee === agrandie.taille, JSON.stringify(agrandie));

    // ON MAINTIENT ET ON BOUGE : c'est le bloc entier qui se déplace, comme
    // avant — le clic qui choisit ne doit pas avoir mangé ce geste-là.
    const avantPose = await page.evaluate(() =>
        Math.round(document.getElementById('project-name-wrapper').getBoundingClientRect().left));
    const h3 = await page.locator('#titre-horloge').boundingBox();
    await page.mouse.move(h3.x + h3.width / 2, h3.y + h3.height / 2);
    await page.mouse.down();
    await page.mouse.move(h3.x + h3.width / 2 + 130, h3.y + h3.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const apresPose = await page.evaluate(() =>
        Math.round(document.getElementById('project-name-wrapper').getBoundingClientRect().left));
    r.verifie('maintenir et bouger déplace toujours le bloc de la date',
        apresPose - avantPose > 90, `${avantPose} -> ${apresPose}`);

    // On la déplace encore quand il ne reste que le cadran : la prise est sur
    // le cadre entier, pas sur le champ — qui est alors masqué.
    const priseAuCadran = await page.evaluate(() => {
        localStorage.removeItem('auTableau_titre_pose'); titrePose = null;
        reglagesDate.affichee = false; reglagesDate.heure = true; reglagesDate.horloge = 'aiguilles';
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        const cadre = document.getElementById('project-name-wrapper');
        const c = cadre.getBoundingClientRect();
        const x = c.left + c.width / 2, y = c.top + c.height / 2;
        cadre.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true,
            pointerId: 9, button: 0, clientX: x, clientY: y }));
        cadre.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true,
            pointerId: 9, clientX: x + 200, clientY: y + 150 }));
        cadre.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 9 }));
        const apres = cadre.getBoundingClientRect();
        const bouge = Math.round(apres.left - c.left);
        // On remet tout en ordre pour la suite
        titrePose = null; retenirLaPoseDuTitre(); majPoseDuTitre();
        reglagesDate.affichee = true; reglagesDate.horloge = 'chiffres'; reglagesDate.heure = false;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        return { bouge, pose: titrePose };
    });
    r.verifie('on la déplace encore quand il ne reste que le cadran',
        Math.abs(priseAuCadran.bouge - 200) <= 14, JSON.stringify(priseAuCadran));
    // Le cadre revient à sa place par une transition de 300 ms : sans cette
    // attente, la mesure suivante le saisirait en plein vol.
    await page.waitForTimeout(400);

    // La pastille EST la poignée : plus de petit ⠿ à viser. On la prend
    // n'importe où et on la pose ailleurs. La position est bornée
    // À L'ENREGISTREMENT : gardée hors de l'écran, elle reviendrait telle
    // quelle à la séance suivante.
    const barreDuHaut = await page.evaluate(() => {
        const cadre = document.getElementById('project-name-wrapper');
        const tiroir = document.querySelector('.drawer') || document.getElementById('bar-plugins');
        return { date: parseInt(getComputedStyle(cadre).zIndex, 10),
                 tiroir: tiroir ? parseInt(getComputedStyle(tiroir).zIndex, 10) : null };
    });
    r.verifie('le tiroir du haut passe devant la date',
        barreDuHaut.tiroir !== null && barreDuHaut.date < barreDuHaut.tiroir,
        JSON.stringify(barreDuHaut));

    const depart = await page.evaluate(() => {
        localStorage.removeItem('auTableau_titre_pose');
        titrePose = null; majPoseDuTitre();
        const cadre = document.getElementById('project-name-wrapper');
        const champ = document.getElementById('project-name-input');
        champ.blur();
        const p = champ.getBoundingClientRect();
        if (!p.width) return { rate: 'pastille sans taille' };
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
    r.verifie('on déplace la date en la tirant, d\'autant qu\'on a tiré',
        !!deplacee.pose && Math.abs(deplacee.gauche - (depart.gauche + 120)) <= 14
        && Math.abs(deplacee.haut - (depart.haut + 220)) <= 14,
        JSON.stringify({ depart, deplacee }));
    r.verifie('sans la laisser sortir de l\'écran', deplacee.dansEcran, JSON.stringify(deplacee));
    r.verifie('et la place choisie est retenue',
        !!deplacee.memoire && isFinite(deplacee.memoire.x), JSON.stringify(deplacee.memoire));

    // Un geste vif ne doit pas la mémoriser dehors
    const horsEcran = await page.evaluate(() => {
        const cadre = document.getElementById('project-name-wrapper');
        const champ = document.getElementById('project-name-input');
        champ.blur();
        const p = champ.getBoundingClientRect();
        champ.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true,
            pointerId: 7, button: 0, clientX: p.left + 5, clientY: p.top + 5 }));
        champ.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true,
            pointerId: 7, clientX: -4000, clientY: -4000 }));
        champ.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7 }));
        const c = cadre.getBoundingClientRect();
        return { pose: titrePose, dansEcran: c.left >= 0 && c.top >= 0,
                 memoire: JSON.parse(localStorage.getItem('auTableau_titre_pose') || 'null') };
    });
    r.verifie('un geste vif ne la mémorise pas hors de l\'écran',
        horsEcran.dansEcran && horsEcran.memoire && horsEcran.memoire.x >= 0 && horsEcran.memoire.y >= 0,
        JSON.stringify(horsEcran));

    // « Remettre en haut à gauche », dans les réglages : c'est ce qui remplace
    // le double-clic sur la poignée disparue.
    await page.evaluate(() => {
        basculerReglagesDate();
        document.getElementById('rd-replacer').click();
    });
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
    r.egal('« remettre en haut à gauche » défait le déplacement', remise.pose, null);
    r.verifie('elle retrouve le haut du tableau, à gauche',
        remise.haut < 40 && remise.gauche < 40, JSON.stringify(remise));
    r.verifie('sans recouvrir les onglets des plugins',
        !remise.chevauche, JSON.stringify(remise));
    r.egal('et l\'oubli est retenu', remise.memoire, null);

    // Le menu des réglages pend sous le titre, hors de la boîte qui reçoit le
    // survol : en descendant vers lui, on quittait le titre et il disparaissait
    // avant qu'on l'atteigne. On refait le trajet à la souris.
    const roueCachee = await page.evaluate(() =>
        getComputedStyle(document.getElementById('btn-reglages-date')).display);
    r.egal('à la souris, la roue ne s\'affiche pas', roueCachee, 'none');

    const pastille = await page.evaluate(() => {
        const b = document.getElementById('project-name-input').getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    });
    await page.mouse.move(pastille.x, pastille.y);
    await page.mouse.dblclick(pastille.x, pastille.y);
    await page.waitForTimeout(150);
    const ouvertAuDouble = await page.evaluate(() => ({
        visible: document.getElementById('reglages-date').classList.contains('visible'),
        actif: document.activeElement.id
    }));
    r.verifie('le double-clic sur la date ouvre ses réglages',
        ouvertAuDouble.visible, JSON.stringify(ouvertAuDouble));
    r.verifie('et ne laisse pas le curseur dans le titre',
        ouvertAuDouble.actif !== 'project-name-input', JSON.stringify(ouvertAuDouble));
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
    await page.mouse.click(640, 500);
    await page.waitForTimeout(150);
    const referme = await page.evaluate(() => ({
        visible: document.getElementById('reglages-date').classList.contains('visible'),
        classe: document.getElementById('project-name-wrapper').classList.contains('reglages-ouverts')
    }));
    r.verifie('et se referme d\'un clic à côté',
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
