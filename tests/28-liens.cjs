// LES LIENS ÉCRITS SUR LE TABLEAU.
//
// « J'adorerais l'utiliser au quotidien mais il me manque la possibilité de
// cliquer sur des liens. » Une adresse posée sur le tableau n'était qu'un
// texte dessiné sur un canvas : rien ne disait que c'en était une, et rien ne
// s'ouvrait.
//
// Trois choses à tenir. Qu'on ne DEVINE pas — « 1.5 » et « M.Dupont » ne sont
// pas des adresses. Qu'un lien n'ouvre QUE LE WEB — un tableau se partage par
// un fichier, et une adresse « javascript: » qui s'y serait glissée
// s'exécuterait chez celui qui clique. Et qu'ouvrir ne VOLE PAS le glisser :
// on doit pouvoir déplacer un bloc qui porte une adresse.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Liens');
    const { page, context, erreurs } = await ouvrirApp(browser);

    // ---------------------------------------------------------------
    // CE QUI EST UNE ADRESSE, ET CE QUI N'EN EST PAS
    // ---------------------------------------------------------------
    const reconnu = await page.evaluate(() => {
        const decoupe = (t) => morceauxAvecLiens(t).map(p => (p.url ? '[' + p.texte + ']' : p.texte));
        return {
            https: decoupe('Voir https://learningapps.org/12345 pour demain'),
            www: decoupe('www.geogebra.org/calculator'),
            // On ne devine pas : sans http ni www, ce n'est pas une adresse.
            nombre: decoupe('Le résultat est 1.5 environ'),
            nom: decoupe('Demandez à M.Dupont'),
            fichierNu: decoupe('exercice.pdf est dans le dossier'),
            // La ponctuation finale n'appartient pas à l'adresse.
            ponctuation: decoupe('Allez sur https://eduscol.education.fr.'),
            deux: decoupe('https://a.fr et https://b.fr'),
            // « www. » reçoit son protocole : sinon le navigateur en ferait un
            // chemin relatif.
            normalise: morceauxAvecLiens('www.geogebra.org/calculator')[0].url
        };
    });
    r.egal('une adresse en https est reconnue au milieu d\'une phrase',
        reconnu.https, ['Voir ', '[https://learningapps.org/12345]', ' pour demain']);
    r.egal('« www. » aussi, et reçoit son protocole',
        { morceaux: reconnu.www, url: reconnu.normalise },
        { morceaux: ['[www.geogebra.org/calculator]'], url: 'https://www.geogebra.org/calculator' });
    r.egal('mais on ne devine pas : un nombre décimal n\'est pas une adresse',
        reconnu.nombre, ['Le résultat est 1.5 environ']);
    r.egal('ni un nom propre abrégé', reconnu.nom, ['Demandez à M.Dupont']);
    r.egal('ni un nom de fichier', reconnu.fichierNu, ['exercice.pdf est dans le dossier']);
    r.egal('le point final de la phrase n\'entre pas dans l\'adresse',
        reconnu.ponctuation, ['Allez sur ', '[https://eduscol.education.fr]', '.']);
    r.egal('deux adresses dans une ligne font deux liens',
        reconnu.deux, ['[https://a.fr]', ' et ', '[https://b.fr]']);

    // ---------------------------------------------------------------
    // UN LIEN N'OUVRE QUE LE WEB
    // Un tableau se partage entre collègues par un fichier : une adresse
    // « javascript: » ou « data: » qui s'y serait glissée s'exécuterait chez
    // celui qui clique, avec tout ce que son navigateur garde.
    // ---------------------------------------------------------------
    const sur = await page.evaluate(() => {
        const essais = ['https://ok.fr', 'http://ok.fr', 'www.ok.fr',
            'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
            'file:///etc/passwd', 'vbscript:msgbox(1)'];
        const ouverts = [];
        const vrai = window.open;
        window.open = (u) => { ouverts.push(u); return null; };
        const rendus = essais.map(u => !!ouvrirLeLien(u));
        window.open = vrai;
        return { rendus, ouverts };
    });
    r.egal('seules les adresses web s\'ouvrent',
        sur.rendus, [true, true, true, false, false, false, false]);
    r.egal('et rien d\'autre n\'a été ouvert',
        sur.ouverts, ['https://ok.fr', 'http://ok.fr', 'https://www.ok.fr']);

    // ---------------------------------------------------------------
    // L'ADRESSE SE VOIT ET SE CLIQUE SUR LE TABLEAU
    // ---------------------------------------------------------------
    const surLeTableau = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        texts.length = 0; images.length = 0; selectedItems = [];
        setMode('pointer');
        texts.push({
            id: nextId++, x: 200, y: 200, content: 'Exercice : https://learningapps.org/1 à faire',
            fontSize: 30, color: '#2d3436', z: globalZ++
        });
        draw();
        const t = texts[0];
        const liens = (t.__liens || []).map(l => ({
            url: l.url, x: Math.round(l.x), y: Math.round(l.y),
            w: Math.round(l.w), h: Math.round(l.h)
        }));
        const l = liens[0];
        // LE RECTANGLE TOMBE SUR L'ADRESSE, pas sur tout le bloc : le mot
        // « Exercice » est à sa gauche et n'en fait pas partie.
        const surLAdresse = l ? lienSousLePoint({ x: l.x + l.w / 2, y: l.y + l.h / 2 }) : null;
        const avant = l ? lienSousLePoint({ x: t.x + 4, y: l.y + l.h / 2 }) : null;
        const apres = l ? lienSousLePoint({ x: l.x + l.w + 30, y: l.y + l.h / 2 }) : null;
        return {
            combien: liens.length, lien: l,
            plusEtroitQueLeBloc: !!l && l.w < (t._cachedW || 0),
            surLAdresse: !!surLAdresse && surLAdresse.url === 'https://learningapps.org/1',
            avant: !!avant, apres: !!apres
        };
    });
    r.egal('une adresse écrite sur le tableau donne un lien, un seul',
        surLeTableau.combien, 1);
    r.verifie('son rectangle tombe sur l\'adresse, pas sur tout le bloc',
        surLeTableau.plusEtroitQueLeBloc && surLeTableau.surLAdresse
        && !surLeTableau.avant && !surLeTableau.apres, JSON.stringify(surLeTableau));

    // LE CLIC L'OUVRE — mais le GLISSER ne l'ouvre pas.
    const gestes = await page.evaluate(() => {
        const c = document.getElementById('board');
        const t = texts[0];
        const l = (t.__liens || [])[0];
        // Sans lien relevé, il n'y a pas de geste à éprouver : on le dit
        // plutôt que de partir en morceaux.
        if (!l) return { auClic: 0, apresGlisser: 0, ouverts: [], aucunLien: true };
        const ecran = (x, y) => ({ x: x * zoom + panX, y: y * zoom + panY });
        const p = ecran(l.x + l.w / 2, l.y + l.h / 2);
        const ouverts = [];
        const vrai = window.open;
        window.open = (u) => { ouverts.push(u); return null; };

        const opt = (x, y, boutons) => ({ pointerId: 31, pointerType: 'mouse', isPrimary: true,
            clientX: Math.round(x), clientY: Math.round(y), buttons: boutons, bubbles: true, cancelable: true });
        // Appui puis relâcher au même endroit : ça s'ouvre.
        c.dispatchEvent(new PointerEvent('pointerdown', opt(p.x, p.y, 1)));
        c.dispatchEvent(new PointerEvent('pointerup', opt(p.x, p.y, 0)));
        const auClic = ouverts.length;

        // Appui, on glisse de trente pixels, on relâche : ça n'ouvre pas.
        c.dispatchEvent(new PointerEvent('pointerdown', opt(p.x, p.y, 1)));
        c.dispatchEvent(new PointerEvent('pointermove', opt(p.x + 30, p.y + 10, 1)));
        c.dispatchEvent(new PointerEvent('pointerup', opt(p.x + 30, p.y + 10, 0)));
        const apresGlisser = ouverts.length;

        window.open = vrai;
        return { auClic, apresGlisser, ouverts };
    });
    r.egal('un clic sur l\'adresse l\'ouvre',
        { fois: gestes.auClic, url: gestes.ouverts[0] || null },
        { fois: 1, url: 'https://learningapps.org/1' });
    r.egal('mais glisser le bloc ne l\'ouvre pas : on déplace, on n\'ouvre pas',
        gestes.apresGlisser, 1);

    // ---------------------------------------------------------------
    // UN TEXTE SANS ADRESSE NE CHANGE PAS
    // Le chemin ordinaire reste intact : on ne découpe le segment que s'il
    // porte une adresse.
    // ---------------------------------------------------------------
    const sansLien = await page.evaluate(() => {
        texts.length = 0;
        texts.push({ id: nextId++, x: 100, y: 100, content: 'Une phrase ordinaire, sans rien à cliquer.',
            fontSize: 30, color: '#2d3436', z: globalZ++ });
        draw();
        return { liens: (texts[0].__liens || []).length,
                 rien: lienSousLePoint({ x: 150, y: 110 }) === null };
    });
    r.egal('un texte sans adresse ne porte aucun lien',
        { liens: sansLien.liens, rien: sansLien.rien }, { liens: 0, rien: true });

    await page.evaluate(() => { texts.length = 0; selectedItems = []; draw(); });
    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
