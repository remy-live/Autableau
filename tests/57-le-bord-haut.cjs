// LE BORD HAUT DU TABLEAU : TROIS RETOUCHES.
//
// « Les petits bonhommes classes ne sont pas centrés. Le bouton "enregistré" à
// côté de l'horloge, ça fait trop gros, je mettrais plutôt le "enregistré"
// autre part. Une idée ? Pour l'horloge, on pourrait avoir le mode où on a
// l'horloge analogique et la date au-dessus, 02/06/26. Mais ça peut être une
// personnalisation. »
//
// 1. LA PASTILLE DE CLASSE était un emoji dans un bouton rond. L'encre d'un
//    emoji ne s'assied pas au centre de sa boîte de ligne, et le décalage
//    change avec la police système : aucune marge ne le rattrape partout. Il
//    ignorait aussi « color », si bien que la couleur de survol annoncée par
//    cette pastille n'arrivait jamais. C'est un dessin, maintenant.
//
//    ON MESURE L'ENCRE, ET NON LA BOÎTE. C'est tout le piège : la boîte d'un
//    emoji peut être parfaitement centrée pendant que son dessin penche. On
//    photographie donc la pastille et l'on cherche où sont les pixels sombres.
//
// 2. L'ÉTAT D'ENREGISTREMENT gardait son mot à l'écran. Le point dit déjà ce
//    qu'on lit en passant ; la phrase — « il y a trois minutes », « rangé dans
//    Mes tableaux » — vit dans l'infobulle, et plus complète.
//
// 3. LE COIN SE LIT DE HAUT EN BAS. « J'aime bien le système de page en haut à
//    droite (les pages, le projecteur, le plein écran), j'aimerais bien le
//    laisser et organiser pour que les boutons soient persistants et que
//    l'horloge de base soit en dessous : Boutons / Date (12/05/26) /
//    Horloges. » Trois blocs empilés dans cet ordre, des boutons qui ne s'en
//    vont plus — grisés quand ils ne servent pas — et la date au format bref,
//    le seul qui tienne dans cette colonne.
//
// 4. LA DATE PEUT SE TENIR À CÔTÉ DU CADRAN plutôt qu'au-dessus, en
//    personnalisation, et le format s'y choisit parmi cinq.
const { creerRapport, ouvrirApp, rechargerApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le bord haut du tableau');
    const { context, page, erreurs } = await ouvrirApp(browser);

    // ------------------------------------------------------------------
    // 1. LA PASTILLE DE CLASSE
    // ------------------------------------------------------------------
    // On photographie L'INTÉRIEUR de la pastille — quatre pixels en retrait,
    // pour laisser dehors son contour, qui prend la couleur d'accent quand une
    // classe est choisie et compterait pour de l'encre.
    const MARGE = 4;
    const boite = await page.evaluate((m) => {
        const p = document.getElementById('classe-pastille');
        const b = p.getBoundingClientRect();
        return { x: b.x + m, y: b.y + m, width: b.width - 2 * m, height: b.height - 2 * m,
                 large: Math.round(b.width), haut: Math.round(b.height) };
    }, MARGE);
    r.verifie('la pastille est bien le bouton rond qu\'on connaît',
        boite.large >= 28 && boite.large <= 36 && Math.abs(boite.large - boite.haut) <= 2,
        JSON.stringify(boite));

    const png = await page.screenshot({ clip: { x: boite.x, y: boite.y, width: boite.width, height: boite.height } });
    const encre = await page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        // L'encre du dessin est franchement sombre ; le fond est blanc et la
        // couleur d'accent, plus claire, reste au-dessus du seuil.
        let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
        for (let py = 0; py < c.height; py++) {
            for (let px = 0; px < c.width; px++) {
                const i = (py * c.width + px) * 4;
                const clarte = (d[i] + d[i + 1] + d[i + 2]) / 3;
                if (d[i + 3] > 40 && clarte < 140) {
                    n++;
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        }
        if (!n) return { n: 0, larg: c.width, haut: c.height };
        return { n, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
                 larg: c.width, haut: c.height,
                 dx: Math.round(((minX + maxX) / 2 - (c.width - 1) / 2) * 100) / 100,
                 dy: Math.round(((minY + maxY) / 2 - (c.height - 1) / 2) * 100) / 100 };
    }, png.toString('base64'));

    r.verifie('il y a bien un dessin dans la pastille, et pas un carré vide',
        encre.n > 30, JSON.stringify(encre));
    r.verifie('et son encre est centrée dans la pastille, à un pixel près',
        encre.n > 30 && Math.abs(encre.dx) <= 1.5 && Math.abs(encre.dy) <= 1.5,
        JSON.stringify(encre));

    // ET C'EST UN DESSIN, donc il prend la couleur du bouton — ce qu'un emoji
    // ne faisait pas : la pastille annonçait un survol coloré qui n'arrivait
    // jamais.
    const matiere = await page.evaluate(() => {
        const p = document.getElementById('classe-pastille');
        const svg = p.querySelector('.cp-ico svg');
        if (!svg) return { svg: false };
        const avant = getComputedStyle(svg).stroke;
        const couleurDuBouton = getComputedStyle(p).color;
        p.style.color = 'rgb(1, 2, 3)';
        const apres = getComputedStyle(svg).stroke;
        p.style.color = '';
        return { svg: true, suitLaCouleur: apres === 'rgb(1, 2, 3)', avant, couleurDuBouton };
    });
    r.verifie('l\'icône est un tracé qui suit la couleur du bouton',
        matiere.svg && matiere.suitLaCouleur && matiere.avant === matiere.couleurDuBouton,
        JSON.stringify(matiere));

    // ------------------------------------------------------------------
    // 2. L'ÉTAT D'ENREGISTREMENT : LE POINT RESTE, LE MOT S'EN VA
    // ------------------------------------------------------------------
    const etat = await page.evaluate(() => {
        if (typeof updateUnsavedIndicator === 'function') updateUnsavedIndicator();
        const b = document.getElementById('etat-enregistrement');
        const mot = document.getElementById('etat-mot');
        const point = b.querySelector('.etat-point');
        return {
            large: Math.round(b.getBoundingClientRect().width),
            motCache: getComputedStyle(mot).display === 'none',
            motEcrit: (mot.textContent || '').trim(),
            pointVu: getComputedStyle(point).display !== 'none'
                     && point.getBoundingClientRect().width >= 5,
            bulle: b.getAttribute('data-tooltip') || b.getAttribute('title') || '',
            drapeau: b.dataset.etat
        };
    });
    r.verifie('la pastille d\'enregistrement s\'est réduite à son point',
        etat.large <= 24 && etat.pointVu && etat.motCache, JSON.stringify(etat));
    r.verifie('le mot est toujours écrit par le code — il n\'est plus montré, il n\'est pas perdu',
        etat.motEcrit.length > 0, JSON.stringify(etat));
    r.verifie('et la phrase entière se lit dans l\'infobulle',
        /enregistr/i.test(etat.bulle) && etat.bulle.length > 20, etat.bulle);
    r.verifie('le point dit dans quel état on est', !!etat.drapeau, String(etat.drapeau));

    // Le clic ouvre toujours « Mes tableaux » : c'est un état ET une porte.
    const porte = await page.evaluate(async () => {
        document.getElementById('etat-enregistrement').click();
        await new Promise(ok => setTimeout(ok, 350));
        const t = document.getElementById('right-drawer');
        return t ? t.classList.contains('open') : null;
    });
    r.verifie('un clic dessus ouvre toujours la liste des tableaux', porte === true, String(porte));
    await page.evaluate(() => { if (typeof toggleRightDrawer === 'function') toggleRightDrawer(); });

    // ------------------------------------------------------------------
    // 3. LE COIN SE LIT DE HAUT EN BAS : BOUTONS / DATE / HORLOGE
    // ------------------------------------------------------------------
    // TOUT EST MESURÉ AU DÉMARRAGE, avant qu'aucun réglage n'ait été touché :
    // c'est la disposition que la classe trouve en ouvrant l'application, et
    // elle seule. Une page, aucun document, toutes les barres en place — le
    // cas le plus pauvre, donc celui où des boutons « persistants » se
    // seraient effacés dans l'ancien code.
    const coin = await page.evaluate(() => {
        const boite = id => {
            const e = document.getElementById(id);
            if (!e) return null;
            const b = e.getBoundingClientRect();
            return { haut: Math.round(b.top), bas: Math.round(b.bottom),
                     gauche: Math.round(b.left), droite: Math.round(b.right),
                     vu: getComputedStyle(e).display !== 'none' && b.width > 0 };
        };
        return {
            boutons: boite('barre-ecran'), pages: boite('ecran-pages'),
            presenter: boite('btn-ecran-presenter'), plein: boite('btn-ecran-plein'),
            date: boite('project-name-input'), cadran: boite('titre-horloge-boite'),
            rang: (document.getElementById('ecran-page-rang').textContent || '').trim(),
            precGrise: document.getElementById('btn-ecran-page-prec').disabled,
            suivGrise: document.getElementById('btn-ecran-page-suiv').disabled,
            presenterEteint: document.getElementById('btn-ecran-presenter').disabled,
            pages_: pages.length, large: window.innerWidth
        };
    });

    r.verifie('les trois boutons du coin sont là dès le démarrage : les pages, projeter, le plein écran',
        coin.pages.vu && coin.presenter.vu && coin.plein.vu, JSON.stringify(coin));

    // ET C'EST LE CAS LE PLUS PAUVRE QUI COMPTE : une seule page, aucun
    // document. Ils restent, éteints. Un bouton grisé dit ce qui manque ; un
    // bouton absent ne dit rien, et déplace ses voisins en revenant.
    r.verifie('sur une page seule, les deux flèches sont là mais grisées',
        coin.pages_ === 1 && coin.precGrise && coin.suivGrise, JSON.stringify(coin));
    r.verifie('sans document à projeter, « projeter » est là mais éteint',
        coin.presenterEteint, JSON.stringify(coin));
    r.egal('et le rang dit où l\'on est sans attendre un premier changement de page',
        coin.rang, '1/1');

    // L'ORDRE, MESURÉ : chaque bloc commence sous le précédent. On ne regarde
    // pas les classes CSS mais les pixels — c'est l'empilement qu'on a promis.
    r.verifie('la date est SOUS les boutons',
        coin.date.haut >= coin.boutons.bas - 2, JSON.stringify({ boutons: coin.boutons, date: coin.date }));
    r.verifie('et le cadran SOUS la date',
        coin.cadran.haut >= coin.date.bas - 2, JSON.stringify({ date: coin.date, cadran: coin.cadran }));
    r.verifie('les trois tiennent dans le même coin droit',
        coin.boutons.gauche > coin.large * 0.6 && coin.date.gauche > coin.large * 0.6
        && coin.cadran.gauche > coin.large * 0.6,
        JSON.stringify({ large: coin.large, b: coin.boutons.gauche, d: coin.date.gauche, c: coin.cadran.gauche }));

    // LA DATE Y EST AU FORMAT BREF. C'est le seul qui tienne dans cette
    // colonne sans l'élargir : « Date (12/05/26) ».
    const dateDuCoin = await page.evaluate(() => ({
        texte: document.getElementById('project-name-input').value,
        format: reglagesDate.format,
        empilee: document.getElementById('project-name-wrapper').classList.contains('date-dessus'),
        formatsOfferts: document.querySelectorAll('#reglages-date [data-format]').length
    }));
    r.verifie('la date du coin est écrite en bref, et elle est bien empilée',
        /^\d{2}\/\d{2}\/\d{2}$/.test(dateDuCoin.texte) && dateDuCoin.format === 'bref'
        && dateDuCoin.empilee, JSON.stringify(dateDuCoin));
    r.verifie('mais le choix du format reste entier dans les réglages',
        dateDuCoin.formatsOfferts >= 4, JSON.stringify(dateDuCoin));

    // ET LE TABLEAU NU NE LES EMPORTE PAS. C'est là qu'ils naissaient : ils
    // paraissaient AU tableau nu et nulle part ailleurs, si bien que le coin
    // changeait de contenu selon l'affichage.
    const auTableauNu = await page.evaluate(() => {
        document.body.classList.add('focus-mode');
        if (typeof majLesPagesDeLEcran === 'function') majLesPagesDeLEcran();
        const lu = id => getComputedStyle(document.getElementById(id)).display;
        const vu = { pages: lu('ecran-pages'), presenter: lu('btn-ecran-presenter'), plein: lu('btn-ecran-plein') };
        document.body.classList.remove('focus-mode');
        if (typeof majLesPagesDeLEcran === 'function') majLesPagesDeLEcran();
        return { nu: vu, revenu: { pages: lu('ecran-pages'), presenter: lu('btn-ecran-presenter'), plein: lu('btn-ecran-plein') } };
    });
    r.verifie('le tableau nu ne change rien au coin : les mêmes boutons, avant comme après',
        auTableauNu.nu.pages !== 'none' && auTableauNu.nu.presenter !== 'none'
        && auTableauNu.nu.plein !== 'none'
        && auTableauNu.revenu.pages !== 'none' && auTableauNu.revenu.presenter !== 'none',
        JSON.stringify(auTableauNu));

    // ------------------------------------------------------------------
    // 4. LA DATE À CÔTÉ DU CADRAN, POUR QUI LA PRÉFÈRE AINSI
    // ------------------------------------------------------------------
    const format = await page.evaluate(() => {
        const d = new Date(2026, 8, 17);
        return { bref: FORMATS_DATE.bref(d), chiffres: FORMATS_DATE.chiffres(d) };
    });
    r.egal('le format bref écrit l\'année sur deux chiffres', format.bref, '17/09/26');
    r.verifie('et il diffère bien de celui qui l\'écrit sur quatre',
        format.chiffres === '17/09/2026', JSON.stringify(format));

    r.verifie('le bouton du format bref est dans le panneau',
        await page.evaluate(() => !!document.querySelector('#reglages-date [data-format="bref"]')), '');

    // L'INTERRUPTEUR ne paraît qu'avec le cadran : sans cadran, « au-dessus du
    // cadran » promettrait un geste qui n'arrive pas.
    const offerte = await page.evaluate(() => {
        const b = document.getElementById('rd-date-dessus');
        const lu = () => getComputedStyle(b).display !== 'none';
        reglagesDate.horloge = 'chiffres'; majReglagesDate();
        const enChiffres = lu();
        reglagesDate.horloge = 'aiguilles'; majReglagesDate();
        return { enChiffres, enAiguilles: lu() };
    });
    r.egal('le réglage ne s\'offre qu\'avec un cadran', offerte, { enChiffres: false, enAiguilles: true });

    // LA MESURE : la date est-elle AU-DESSUS du cadran, ou à côté ?
    const disposition = () => page.evaluate(() => {
        const champ = document.getElementById('project-name-input');
        const cadran = document.getElementById('titre-horloge-boite');
        const a = champ.getBoundingClientRect(), b = cadran.getBoundingClientRect();
        return {
            dateSurLeCadran: Math.round(a.bottom) <= Math.round(b.top) + 2,
            dateACote: Math.round(a.right) <= Math.round(b.left) + 2
                       && Math.round(a.top) < Math.round(b.bottom),
            memeAxe: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 30,
            classe: document.getElementById('project-name-wrapper').classList.contains('date-dessus')
        };
    });

    await page.evaluate(() => {
        reglagesDate.affichee = true; reglagesDate.heure = true;
        reglagesDate.horloge = 'aiguilles'; reglagesDate.dateDessus = false;
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate(); majReglagesDate();
    });
    const enLigne = await disposition();
    r.verifie('éteint, le réglage remet la date À CÔTÉ du cadran',
        enLigne.dateACote && !enLigne.dateSurLeCadran && !enLigne.classe, JSON.stringify(enLigne));

    await page.evaluate(() => document.getElementById('rd-date-dessus').click());
    await page.waitForTimeout(150);
    const empilee = await disposition();
    r.verifie('et rallumé, elle remonte au-dessus du cadran, sur le même axe',
        empilee.dateSurLeCadran && empilee.memeAxe && empilee.classe, JSON.stringify(empilee));

    // ET CE SEUL CLIC L'A DÉJÀ ENREGISTRÉE. On le regarde ICI, avant de toucher
    // à quoi que ce soit d'autre : chacun des boutons de ce panneau enregistre
    // l'objet ENTIER, si bien qu'un voisin cliqué ensuite sauverait le réglage
    // à la place de celui qu'on éprouve — et l'on croirait tenir une garde
    // qu'on n'a pas.
    const ecritAussitot = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('board_reglages_date') || '{}').dateDessus; }
        catch (e) { return 'illisible'; }
    });
    r.egal('le clic seul suffit à l\'enregistrer', ecritAussitot, true);

    // Et le format bref y tient : c'est pour cela qu'il existe.
    await page.evaluate(() => document.querySelector('#reglages-date [data-format="bref"]').click());
    await page.waitForTimeout(150);
    const texteBref = await page.evaluate(() => document.getElementById('project-name-input').value);
    r.verifie('la date y est écrite en bref', /^\d{2}\/\d{2}\/\d{2}$/.test(texteBref), texteBref);

    // LE RÉGLAGE TRAVERSE LE RECHARGEMENT : c'est une personnalisation, pas
    // une bascule de séance.
    await rechargerApp(page);
    const apresRetour = await page.evaluate(() => ({
        dessus: !!reglagesDate.dateDessus,
        format: reglagesDate.format,
        classe: document.getElementById('project-name-wrapper').classList.contains('date-dessus')
    }));
    r.egal('la personnalisation tient après un rechargement',
        apresRetour, { dessus: true, format: 'bref', classe: true });

    // Et l'on peut revenir en arrière : une personnalisation qui ne se défait
    // pas est un piège.
    const defaite = await page.evaluate(async () => {
        reglagesDate.dateDessus = false; reglagesDate.format = 'long';
        enregistrerReglagesDate(); poserDateDansTitre(true); majAffichageDate();
        await new Promise(ok => setTimeout(ok, 100));
        return document.getElementById('project-name-wrapper').classList.contains('date-dessus');
    });
    r.egal('et elle se défait', defaite, false);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
