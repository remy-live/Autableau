// Le lot « confort » : molette plus douce, copie d'examen quadrillée, pas de
// graduation des axes, réglages retenus par le générateur d'exercices, feuille
// de questions flash à la taille du contenu, et l'ouverture depuis Drive qui ne
// se propose que là où elle peut marcher.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { creerRapport, ouvrirApp, CHROMIUM } = require('./harness.cjs');

const RACINE = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Un serveur de fichiers minimal : certaines fonctions (Drive) n'existent
// qu'en http(s), on ne peut donc pas les vérifier depuis file://.
function servir() {
    return new Promise((resolve) => {
        const serveur = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
            const fichier = path.join(RACINE, rel);
            if (!fichier.startsWith(RACINE) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
                res.writeHead(404); res.end('non'); return;
            }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
            fs.createReadStream(fichier).pipe(res);
        });
        serveur.listen(0, '127.0.0.1', () => resolve({ serveur, port: serveur.address().port }));
    });
}

module.exports = async function (browser) {
    const r = creerRapport('Générateurs, molette et Drive');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins.flashMathTool, { timeout: 20000 });

    // --- LA MOLETTE ---
    // Un cran de molette envoie deltaY ≈ 100. À /100 le zoom était multiplié
    // par 2,7 d'un seul cran : on veut un pas confortable.
    const molette = await page.evaluate(() => {
        const cv = document.getElementById('board');
        const cran = (delta) => {
            const av = zoom;
            cv.dispatchEvent(new WheelEvent('wheel', { deltaY: delta, ctrlKey: true, clientX: 640, clientY: 400, bubbles: true, cancelable: true }));
            return zoom / av;
        };
        zoom = 1; panX = 0; panY = 0;
        const avant = zoom;
        const arriere = cran(100);
        const avantRatio = cran(-100);
        // trois crans d'affilée, pour voir si ça reste maniable
        zoom = 1;
        for (let i = 0; i < 3; i++) cran(-100);
        const troisCrans = zoom;
        zoom = 1; draw();
        return { arriere, avantRatio, troisCrans, depart: avant };
    });
    r.verifie('un cran de molette zoome par petits pas',
        molette.avantRatio > 1.1 && molette.avantRatio < 1.35, `×${molette.avantRatio.toFixed(3)}`);
    r.verifie('et dézoome du même pas',
        Math.abs(molette.arriere * molette.avantRatio - 1) < 0.01, `×${molette.arriere.toFixed(3)}`);
    r.verifie('trois crans restent maniables',
        molette.troisCrans > 1.4 && molette.troisCrans < 2.2, `×${molette.troisCrans.toFixed(2)}`);

    // Le zoom reste ancré sous le curseur
    const ancre = await page.evaluate(() => {
        zoom = 1; panX = 0; panY = 0;
        const avant = { x: (640 - panX) / zoom, y: (400 - panY) / zoom };
        document.getElementById('board').dispatchEvent(new WheelEvent('wheel',
            { deltaY: -100, ctrlKey: true, clientX: 640, clientY: 400, bubbles: true, cancelable: true }));
        const apres = { x: (640 - panX) / zoom, y: (400 - panY) / zoom };
        zoom = 1; panX = 0; panY = 0; draw();
        return Math.abs(avant.x - apres.x) + Math.abs(avant.y - apres.y);
    });
    r.verifie('le point sous le curseur ne bouge pas', ancre < 0.5, `${ancre.toFixed(2)} px de dérive`);

    // --- LA COPIE D'EXAMEN EST QUADRILLÉE ---
    // Une copie de brevet, c'est des petits carreaux : donc des traits
    // VERTICAUX dans le corps de la feuille, que le Seyès n'a pas.
    const corps = (nom) => page.evaluate((n) => {
        currentBgIndex = backgrounds.indexOf(n);
        zoom = 1; panX = 0; panY = 0;
        [texts, freehands, images].forEach(a => a.length = 0);
        draw();
        const cv = document.getElementById('board');
        // une bande d'un pixel de haut, loin des lignes horizontales (pas de 30)
        const d = cv.getContext('2d').getImageData(200, 505, 600, 1).data;
        let colonnes = 0, dedans = false;
        for (let i = 0; i < d.length; i += 4) {
            const clair = d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240;
            if (!clair && !dedans) { colonnes++; dedans = true; }
            if (clair) dedans = false;
        }
        return colonnes;
    }, nom);

    const colonnesCopie = await corps('copie');
    const colonnesSeyes = await corps('seyes-marge');
    r.verifie('la copie d\'examen est quadrillée en petits carreaux',
        colonnesCopie >= 15 && colonnesCopie <= 25, `${colonnesCopie} traits verticaux sur 600 px`);
    r.verifie('le cahier, lui, reste réglé Seyès', colonnesSeyes <= 2, `${colonnesSeyes} traits verticaux`);

    // --- LE PAS DES GRADUATIONS ---
    const ouvrirAxes = async () => {
        const b = await page.evaluate(() => {
            const el = document.getElementById('btn-axes').getBoundingClientRect();
            return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
        });
        await page.mouse.move(b.x, b.y);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
        await page.waitForTimeout(200);
    };

    await ouvrirAxes();
    const choix = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#panneau-appui .rp-choix')).map(c => c.innerText.trim()));
    ['0,1', '1', '10'].forEach(pas =>
        r.verifie(`les axes proposent le pas « ${pas} »`, choix.includes(pas), choix.join(' · ')));

    const retenu = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('#panneau-appui .rp-choix')).find(x => x.innerText.trim() === '0,1');
        c.click();
        return { pas: pasAxes, memoire: localStorage.getItem('board_pas_axes'), axes: showAxes };
    });
    r.egal('le pas choisi est appliqué', retenu.pas, 0.1);
    r.egal('et mémorisé', retenu.memoire, '0.1');
    r.egal('choisir un pas allume les axes gradués', retenu.axes, 2);

    // Les nombres écrits le long de l'axe suivent le pas, avec une virgule
    const graduations = await page.evaluate(() => {
        panX = 640; panY = 400; zoom = 1;
        [texts, freehands, images].forEach(a => a.length = 0);
        currentBgIndex = backgrounds.indexOf('blanc');
        const lire = () => {
            draw();
            const d = document.getElementById('board').getContext('2d').getImageData(660, 410, 400, 22).data;
            let encre = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 3] > 100) encre++;
            return encre;
        };
        pasAxes = 1; const unites = lire();
        pasAxes = 0.1; const dixiemes = lire();
        pasAxes = 1; draw();
        return { unites, dixiemes };
    });
    r.verifie('des graduations sont écrites sous l\'axe', graduations.unites > 40, `${graduations.unites} pixels d'encre`);
    r.verifie('un pas décimal écrit des nombres plus longs',
        graduations.dixiemes > graduations.unites, `${graduations.dixiemes} contre ${graduations.unites}`);

    await page.evaluate(() => { pasAxes = 1; localStorage.setItem('board_pas_axes', '1'); showAxes = 0; draw(); });

    // --- LE GÉNÉRATEUR D'EXERCICES SE SOUVIENT ---
    const memoire = await page.evaluate(() => {
        const t = PluginManager.plugins.globalExerciseGenerator;
        t.memoriser({ theme: 'equation', types: ['equation_2m'], group: 'all', count: 15,
                      timer: 0, forceCols: '2', showAnswers: false, questions: [] });
        if (t.widgetEl) { t.widgetEl.remove(); t.widgetEl = null; }
        t.openWidget();
        const q = (s) => t.widgetEl.querySelector(s);
        const etat = {
            theme: t.currentTheme,
            count: q('#geg-count').value,
            colonnes: q('#geg-cols').value,
            coche: Array.from(t.widgetEl.querySelectorAll('.geg-opt-check')).filter(c => c.checked).map(c => c.value),
            bouton: q('#geg-generate').innerText,
            quantiteModifiable: !q('#geg-count').disabled,
            optionsModifiables: !Array.from(t.widgetEl.querySelectorAll('.geg-opt-check')).some(c => c.disabled),
            enReedition: t.currentState !== null
        };
        t.widgetEl.style.display = 'none';
        return etat;
    });
    r.egal('le générateur rouvre sur le dernier thème', memoire.theme, 'equation');
    r.egal('avec la même quantité', memoire.count, '15');
    r.egal('et la même mise en colonnes', memoire.colonnes, '2');
    r.verifie('les types cochés sont retrouvés', memoire.coche.includes('equation_2m'), memoire.coche.join(', '));
    // Réglages retenus ≠ réédition d'un tampon : tout doit rester modifiable
    r.verifie('la fenêtre reste en mode « générer »', /Générer/.test(memoire.bouton), memoire.bouton);
    r.verifie('la quantité reste modifiable', memoire.quantiteModifiable);
    r.verifie('les options aussi', memoire.optionsModifiables);
    r.verifie('et de nouvelles questions seront tirées', !memoire.enReedition);

    // Un tampon posé génère bien des questions, malgré les réglages mémorisés
    const tampon = await page.evaluate(() => {
        const t = PluginManager.plugins.globalExerciseGenerator;
        t.openWidget();
        let pose = null;
        const vrai = window.createStampFromSVG;
        window.createStampFromSVG = (svg) => { pose = svg; };
        t.generateAndStamp();
        window.createStampFromSVG = vrai;
        t.widgetEl.style.display = 'none';
        return { questions: t.currentStamp ? 0 : (pose ? (pose.match(/x/g) || []).length : 0), vide: !pose };
    });
    r.verifie('le tampon n\'est pas vide', !tampon.vide);
    r.verifie('il contient bien des équations', tampon.questions > 8, `${tampon.questions} « x » dans la feuille`);

    // --- LA FEUILLE DE QUESTIONS FLASH ---
    const feuille = await page.evaluate(() => {
        const t = PluginManager.plugins.flashMathTool;
        const vrai = window.createStampFromSVG;
        let svg = null;
        window.createStampFromSVG = (s) => { svg = s; };
        const mesurer = (n, format, avecFigure) => {
            t.state.questions = [];
            for (let i = 0; i < n; i++) {
                t.state.questions.push(avecFigure && i === 0
                    ? { q: 'Aire ? <svg width="10" height="10"></svg>', a: '12' }
                    : { q: 'Calcule 7 × ' + (i + 2), a: '' + (7 * (i + 2)) });
            }
            t.state.formatFeuille = format;
            svg = null;
            t.exportToBoard();
            return svg ? parseInt(svg.match(/viewBox="0 0 \d+ (\d+)"/)[1]) : 0;
        };
        const res = {
            juste4: mesurer(4, 'juste'),
            juste20: mesurer(20, 'juste'),
            a4_4: mesurer(4, 'a4')
        };
        // Répartition en hauteur : une question à figure pèse trois questions
        t.state.questions = [];
        for (let i = 0; i < 7; i++) {
            t.state.questions.push(i === 0
                ? { q: 'Aire ? <svg width="10" height="10"></svg>', a: '12' }
                : { q: 'Calcule 7 × ' + i, a: '' + (7 * i) });
        }
        t.state.formatFeuille = 'juste';
        svg = null;
        t.exportToBoard();
        res.melange = svg ? parseInt(svg.match(/viewBox="0 0 \d+ (\d+)"/)[1]) : 0;
        window.createStampFromSVG = vrai;
        return res;
    });
    r.verifie('quatre questions tiennent sur une feuille courte',
        feuille.juste4 > 100 && feuille.juste4 < 350, `${feuille.juste4} px de haut`);
    r.verifie('le format A4 garde toute la page', feuille.a4_4 >= 794, `${feuille.a4_4} px de haut`);
    r.verifie('vingt questions font une feuille plus grande',
        feuille.juste20 > feuille.juste4 + 300, `${feuille.juste20} contre ${feuille.juste4}`);
    // Sans équilibrage en hauteur, la figure resterait seule d'un côté et la
    // feuille ferait la hauteur de six lignes + la figure.
    // Coupées « la moitié à gauche, la moitié à droite », ces 7 questions
    // donneraient 525 px : la figure pèse trois lignes à elle seule.
    r.verifie('les deux colonnes sont remplies à hauteur égale',
        feuille.melange <= 470, `${feuille.melange} px de haut pour 7 questions dont une figure (525 sans équilibrage)`);

    const bascule = await page.evaluate(() => {
        const t = PluginManager.plugins.flashMathTool;
        if (!t.widgetEl) t.openWidget();
        const b = t.widgetEl.querySelector('#fl-btn-format');
        if (!b) return null;
        const depart = t.state.formatFeuille;
        b.click();
        const apres = { format: t.state.formatFeuille, texte: b.innerText };
        b.click();
        return { depart, apres, retour: t.state.formatFeuille, texteRetour: b.innerText };
    });
    r.verifie('un bouton bascule entre feuille juste et A4',
        !!bascule && bascule.apres.format !== bascule.depart && bascule.retour === bascule.depart,
        JSON.stringify(bascule));
    r.verifie('et le bouton dit lequel est actif',
        !!bascule && /A4|juste/i.test(bascule.apres.texte), bascule && bascule.apres.texte);

    // --- L'EXPLORATEUR : DEUX SOURCES, UNE FENÊTRE DÉPLAÇABLE ---
    const enLocal = await page.evaluate(() => {
        const b = document.getElementById('btn-drive');
        b.click();
        const f = document.getElementById('explorateur');
        const boite = f.getBoundingClientRect();
        return {
            existe: !!b,
            visible: b ? getComputedStyle(b).display !== 'none' : false,
            disponible: typeof driveDisponible === 'function' ? driveDisponible() : null,
            fenetre: getComputedStyle(f).display !== 'none',
            deplacable: !!document.getElementById('exp-entete'),
            sources: Array.from(f.querySelectorAll('.exp-source')).map(x => x.dataset.source),
            depot: !!document.getElementById('exp-depot'),
            dansEcran: boite.left >= 0 && boite.top >= 0 && boite.right <= window.innerWidth + 1 && boite.bottom <= window.innerHeight + 1
        };
    });
    r.verifie('le menu propose d\'ouvrir un fichier', enLocal.existe && enLocal.visible, JSON.stringify(enLocal));
    r.verifie('l\'explorateur s\'ouvre dans une fenêtre déplaçable',
        enLocal.fenetre && enLocal.deplacable, JSON.stringify(enLocal));
    r.verifie('et tient dans l\'écran', enLocal.dansEcran, JSON.stringify(enLocal));
    r.egal('il propose l\'ordinateur et le nuage', enLocal.sources, ['ordi', 'drive']);
    r.verifie('en local, il s\'ouvre sur « Mon ordinateur » et sa zone de dépôt', enLocal.depot, JSON.stringify(enLocal));
    r.egal('Drive, lui, s\'annonce indisponible', enLocal.disponible, false);

    const driveEnLocal = await page.evaluate(() => {
        document.querySelector('.exp-source[data-source="drive"]').click();
        const texte = document.getElementById('exp-corps').innerText;
        document.getElementById('exp-fermer').click();
        return { texte, ferme: getComputedStyle(document.getElementById('explorateur')).display === 'none' };
    });
    r.verifie('cliquer sur Drive en local explique pourquoi il ne peut pas marcher',
        /http|configur/i.test(driveEnLocal.texte), driveEnLocal.texte.slice(0, 120));
    r.verifie('et la fenêtre se ferme', driveEnLocal.ferme);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // --- DRIVE EN LIGNE ---
    const { serveur, port } = await servir();
    const ctxWeb = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageWeb = await ctxWeb.newPage();
    const errsWeb = [];
    pageWeb.on('pageerror', e => { if (!/jsPDF|pdfjsLib|localforage|accounts\.google/.test(e.message)) errsWeb.push(e.message.slice(0, 140)); });
    // La bibliothèque Google n'est pas joignable depuis les tests : on la neutralise
    await ctxWeb.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, body: '' }));
    await pageWeb.goto(`http://127.0.0.1:${port}/index.html`);
    await pageWeb.waitForFunction(() => window.PluginManager && Object.keys(PluginManager.plugins).length > 50, { timeout: 20000 });
    await pageWeb.waitForTimeout(400);

    const enLigne = await pageWeb.evaluate(() => {
        const b = document.getElementById('btn-drive');
        return {
            visible: b ? getComputedStyle(b).display !== 'none' : false,
            disponible: typeof driveDisponible === 'function' ? driveDisponible() : null,
            identifiant: typeof AUTABLEAU_DRIVE_CLIENT_ID === 'string' && AUTABLEAU_DRIVE_CLIENT_ID.length > 20,
            entree: !!document.getElementById('pdf-loader')
        };
    });
    r.verifie('en ligne, le bouton d\'ouverture est là', enLigne.visible, JSON.stringify(enLigne));
    r.egal('et Drive s\'annonce disponible', enLigne.disponible, true);
    r.verifie('l\'identifiant client est bien fourni par la configuration', enLigne.identifiant);
    r.verifie('l\'import réutilise l\'entrée de fichiers de l\'application', enLigne.entree);

    // Tout ce que le tableau sait ouvrir doit être proposé : Drive type mal
    // certains fichiers (un .docx en « octet-stream »), et ils passaient alors
    // pour « non pris en charge ».
    const types = await pageWeb.evaluate(() => {
        const ok = (nom, type) => driveImportable({ nom, type, dossier: false });
        return {
            image: ok('photo.jpg', 'image/jpeg'),
            pdf: ok('brevet.pdf', 'application/pdf'),
            docxMalType: ok('cours.docx', 'application/octet-stream'),
            sansType: ok('notes.txt', ''),
            csv: ok('classe.csv', 'text/csv'),
            docGoogle: ok('Mon cours', 'application/vnd.google-apps.document'),
            diapoGoogle: ok('Ma présentation', 'application/vnd.google-apps.presentation'),
            formulaire: ok('Sondage', 'application/vnd.google-apps.form'),
            dossier: driveImportable({ nom: 'Maths', dossier: true })
        };
    });
    ['image', 'pdf', 'docxMalType', 'sansType', 'csv', 'docGoogle', 'diapoGoogle', 'dossier'].forEach(cas =>
        r.verifie(`Drive propose « ${cas} »`, types[cas] === true, JSON.stringify(types)));
    r.verifie('mais pas un formulaire Google, qui ne s\'ouvre pas', types.formulaire === false, JSON.stringify(types));

    // Un faux Google et un faux Drive : on vérifie la liste, pas le réseau
    const liste = await pageWeb.evaluate(async () => {
        window.google = { accounts: { oauth2: { initTokenClient: (o) => ({
            requestAccessToken: () => o.callback({ access_token: 'faux' })
        }) } } };
        const vraiFetch = window.fetch;
        window.fetch = async (url, opt) => {
            if (String(url).includes('googleapis.com/drive')) {
                return { ok: true, json: async () => ({ files: [
                    { id: '1', name: 'Cours 5e', mimeType: 'application/vnd.google-apps.folder' },
                    { id: '2', name: 'Brevet blanc.pdf', mimeType: 'application/pdf', size: '2411724' },
                    { id: '3', name: 'Les fractions.docx', mimeType: 'application/octet-stream', size: '48213' },
                    { id: '4', name: 'Formulaire', mimeType: 'application/vnd.google-apps.form' }
                ] }) };
            }
            return vraiFetch(url, opt);
        };
        ouvrirDrive();
        await new Promise(r => setTimeout(r, 350));
        const f = document.getElementById('explorateur');
        const lignes = Array.from(f.querySelectorAll('.exp-ligne'));
        return {
            ouverte: getComputedStyle(f).display !== 'none',
            source: f.querySelector('.exp-source[data-source="drive"]').style.background,
            nombre: lignes.length,
            textes: lignes.map(l => l.innerText.replace(/\s+/g, ' ').trim()),
            grisees: lignes.filter(l => parseFloat(l.style.opacity) < 1).length
        };
    });
    r.verifie('la fenêtre s\'ouvre sur Drive quand on le demande', liste.ouverte, JSON.stringify(liste));
    r.egal('les fichiers du dossier sont listés', liste.nombre, 4);
    r.verifie('avec leur poids en clair', /47 Ko/.test(liste.textes.join(' | ')), liste.textes.join(' | '));
    r.verifie('les dossiers sont annoncés comme tels', /Cours 5e Dossier/.test(liste.textes.join(' | ')), liste.textes.join(' | '));
    r.egal('et seul le formulaire est grisé', liste.grisees, 1);

    const navigation = await pageWeb.evaluate(async () => {
        Array.from(document.querySelectorAll('#explorateur .exp-ligne'))
            .find(l => /Cours 5e/.test(l.innerText)).click();
        await new Promise(r => setTimeout(r, 300));
        const chemin = document.getElementById('exp-chemin').innerText;
        const retour = !!document.getElementById('exp-retour');
        document.getElementById('exp-retour').click();
        await new Promise(r => setTimeout(r, 300));
        return { chemin, retour, revenu: document.getElementById('exp-chemin').innerText };
    });
    r.verifie('entrer dans un dossier met à jour le chemin',
        /Mon Drive › Cours 5e/.test(navigation.chemin), JSON.stringify(navigation));
    r.verifie('un bouton « Retour » apparaît alors', navigation.retour);
    r.verifie('et il ramène au dossier parent', navigation.revenu === 'Mon Drive', JSON.stringify(navigation));

    r.verifie('aucune erreur JS en ligne', errsWeb.length === 0, errsWeb.join(' | '));
    await ctxWeb.close();
    serveur.close();

    return r.bilan();
};
