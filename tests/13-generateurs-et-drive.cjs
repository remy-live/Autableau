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
            // « currentState » porte désormais le tirage de l'aperçu : ce qui
            // dit qu'on rédite un tampon, c'est l'objet qu'on est en train de
            // modifier.
            enReedition: t.editingImgObj !== null && t.editingImgObj !== undefined
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
    const enLocal = await page.evaluate(async () => {
        const b = document.getElementById('btn-drive');
        b.click();
        await new Promise(r => setTimeout(r, 250));
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
    r.egal('il propose l\'ordinateur et les nuages', enLocal.sources, ['ordi', 'drive', 'nextcloud', 'dropbox']);
    r.verifie('en local, il s\'ouvre sur « Mon ordinateur » et sa zone de dépôt', enLocal.depot, JSON.stringify(enLocal));
    r.egal('Drive, lui, s\'annonce indisponible', enLocal.disponible, false);

    const driveEnLocal = await page.evaluate(async () => {
        document.querySelector('.exp-source[data-source="drive"]').click();
        await new Promise(r => setTimeout(r, 250));
        const texte = document.getElementById('exp-corps').innerText;
        document.getElementById('exp-fermer').click();
        return { texte, ferme: getComputedStyle(document.getElementById('explorateur')).display === 'none' };
    });
    r.verifie('cliquer sur Drive en local explique pourquoi il ne peut pas marcher',
        /http|configur/i.test(driveEnLocal.texte), driveEnLocal.texte.slice(0, 120));
    r.verifie('et la fenêtre se ferme', driveEnLocal.ferme);

    // Réduire, redimensionner, et retrouver la fenêtre comme on l'a laissée
    const fenetre = await page.evaluate(async () => {
        await ouvrirExplorateur('ordi');
        await new Promise(r => setTimeout(r, 200));
        const f = document.getElementById('explorateur');
        const hauteurPleine = f.getBoundingClientRect().height;

        // on redimensionne comme le ferait la poignée
        Explorateur.etat.w = 820; Explorateur.etat.h = 560;
        await ouvrirExplorateur('ordi');
        await new Promise(r => setTimeout(r, 150));
        const apresTaille = f.getBoundingClientRect();
        document.getElementById('exp-fermer').click();      // la fermeture enregistre la géométrie
        return {
            hauteurPleine,
            largeur: Math.round(apresTaille.width), hauteur: Math.round(apresTaille.height),
            memoire: JSON.parse(localStorage.getItem('board_explorateur') || '{}')
        };
    });
    r.verifie('la fenêtre s\'ouvre à une taille utile', fenetre.hauteurPleine > 200, JSON.stringify(fenetre));
    r.verifie('elle est dimensionnable', fenetre.largeur === 820 && fenetre.hauteur === 560, JSON.stringify(fenetre));
    r.verifie('sa géométrie est retenue d\'une fois sur l\'autre',
        fenetre.memoire.w === 820 || fenetre.memoire.h === 560, JSON.stringify(fenetre.memoire));

    // --- RÉDUIRE L'EXPLORATEUR : IL VA DANS LE DOCK ---
    const reduction = await page.evaluate(async () => {
        await ouvrirExplorateur();
        await new Promise(r => setTimeout(r, 300));
        const f = () => document.getElementById('explorateur');
        const ouvert = getComputedStyle(f()).display;
        document.getElementById('exp-reduire').click();
        await new Promise(r => setTimeout(r, 200));
        const icone = document.querySelector('#dock .dock-item[data-fenetre="explorateur"]');
        const reduit = { fenetre: getComputedStyle(f()).display, icone: !!icone };
        if (icone) icone.click();
        await new Promise(r => setTimeout(r, 350));
        const rouvert = {
            fenetre: getComputedStyle(f()).display,
            icone: !!document.querySelector('#dock .dock-item[data-fenetre="explorateur"]')
        };
        // Fermer ne doit pas laisser d'icône derrière soi
        document.getElementById('exp-reduire').click();
        await new Promise(r => setTimeout(r, 150));
        await ouvrirExplorateur();
        await new Promise(r => setTimeout(r, 250));
        document.getElementById('exp-fermer').click();
        await new Promise(r => setTimeout(r, 150));
        const apresFermeture = !!document.querySelector('#dock .dock-item[data-fenetre="explorateur"]');
        return { ouvert, reduit, rouvert, apresFermeture };
    });
    r.egal('la fenêtre s\'ouvre', reduction.ouvert, 'flex');
    r.egal('réduire la range : la fenêtre disparaît', reduction.reduit.fenetre, 'none');
    r.verifie('et une icône apparaît dans le dock du bas', reduction.reduit.icone, JSON.stringify(reduction));
    r.egal('cliquer l\'icône la rouvre', reduction.rouvert.fenetre, 'flex');
    r.verifie('et l\'icône disparaît du dock', !reduction.rouvert.icone, JSON.stringify(reduction));
    r.verifie('fermer ne laisse pas d\'icône derrière soi', !reduction.apresFermeture, JSON.stringify(reduction));

    // --- PARCOURIR SON ORDINATEUR DANS LA FENÊTRE ---
    const ordi = await page.evaluate(async () => {
        await ouvrirExplorateur('ordi');
        await new Promise(r => setTimeout(r, 300));
        const principal = document.querySelector('#exp-depot .exp-primaire');
        return {
            possible: typeof window.showDirectoryPicker === 'function',
            boutonDossier: !!document.getElementById('exp-dossier'),
            principalEstLeDossier: !!(principal && principal.id === 'exp-dossier'),
            note: (document.querySelector('.exp-depot-note') || {}).innerText || ''
        };
    });
    r.verifie('ce navigateur sait parcourir un dossier', ordi.possible);
    r.verifie('le bouton « parcourir ici » est proposé', ordi.boutonDossier);
    r.verifie('et c\'est lui l\'action principale, pas la fenêtre du système',
        ordi.principalEstLeDossier, JSON.stringify(ordi));
    r.verifie('on annonce l\'autorisation unique du navigateur',
        /autorisation|une fois/i.test(ordi.note), ordi.note.slice(0, 100));

    // Le navigateur refuse certains dossiers (racine du disque, dossier
    // personnel) avec un message trompeur sur des « fichiers système ».
    // On ne peut pas l'empêcher : on peut expliquer, et repartir proprement.
    const dossierRefuse = await page.evaluate(async () => {
        await ouvrirExplorateur('ordi');
        await new Promise(r => setTimeout(r, 250));
        const vrai = window.showDirectoryPicker;
        window.showDirectoryPicker = () => Promise.reject(new DOMException('abandon', 'AbortError'));
        document.getElementById('exp-dossier').click();
        await new Promise(r => setTimeout(r, 250));
        window.showDirectoryPicker = vrai;
        const remarque = document.querySelector('.exp-depot-remarque');
        return {
          remarque: remarque ? remarque.innerText : '',
          onPeutReessayer: !!document.getElementById('exp-dossier'),
          depart: !!document.getElementById('exp-depot')
        };
    });
    r.verifie('un dossier refusé ramène à l\'accueil, sans page blanche',
        dossierRefuse.depart && dossierRefuse.onPeutReessayer, JSON.stringify(dossierRefuse));
    r.verifie('et on explique quels dossiers le navigateur refuse',
        /racine|personnel/i.test(dossierRefuse.remarque), dossierRefuse.remarque.slice(0, 90));
    r.verifie('en corrigeant son message trompeur',
        /emplacement|pas le contenu/i.test(dossierRefuse.remarque), dossierRefuse.remarque.slice(0, 160));

    const demarrage = await page.evaluate(() => {
        let recu = null;
        const vrai = window.showDirectoryPicker;
        window.showDirectoryPicker = (o) => { recu = o; return Promise.reject(new DOMException('x', 'AbortError')); };
        document.getElementById('exp-dossier').click();
        window.showDirectoryPicker = vrai;
        return recu;
    });
    r.egal('le sélecteur s\'ouvre dans les Documents, pas à la racine',
        demarrage && demarrage.startIn, 'documents');
    r.verifie('et retient le dernier dossier choisi', !!(demarrage && demarrage.id), JSON.stringify(demarrage));

    // --- LES DEUX FENÊTRES SUIVENT LA MÊME CHARTE ---
    const charte = await page.evaluate(async () => {
        PluginManager.plugins.globalExerciseGenerator.openWidget();
        PluginManager.plugins.flashMathTool.openWidget();
        await new Promise(r => setTimeout(r, 500));
        const geg = document.getElementById('geg-widget');
        const fl = document.getElementById('fl-widget');
        const lu = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
        return {
            deux: !!geg && !!fl,
            classees: !!geg && geg.classList.contains('pw') && !!fl && fl.classList.contains('pw'),
            memeAccent: lu(geg, '--pw-accent') === lu(fl, '--pw-accent'),
            accentClair: lu(geg, '--pw-accent'),
            fondClair: lu(geg, '--pw-fond'),
            rail: !!geg.querySelector('.pw-rail-item.actif'),
            pastilles: geg.querySelectorAll('.pw-pastille').length,
            pastilleAllumee: geg.querySelectorAll('.pw-pastille.actif').length,
            jauge: (geg.querySelector('#geg-jauge') || {}).innerText,
            piedFlash: fl.querySelectorAll('.fl-footer-actions .pw-btn').length,
            uneSeuleAction: fl.querySelectorAll('.fl-footer-actions .fl-btn-poser').length,
            actionsEpinglees: !!fl.querySelector('.fl-sidebar-actions #fl-btn-gen')
        };
    });
    r.verifie('les deux fenêtres existent', charte.deux, JSON.stringify(charte));
    r.verifie('et portent toutes deux la charte commune', charte.classees, JSON.stringify(charte));
    r.verifie('avec la même couleur d\'accent', charte.memeAccent, charte.accentClair);
    r.verifie('le rail du générateur montre le thème choisi', charte.rail);
    r.verifie('ses types d\'exercices sont des pastilles',
        charte.pastilles >= 4 && charte.pastilleAllumee >= 1, JSON.stringify(charte));
    r.verifie('l\'en-tête annonce ce que contiendra la feuille',
        /\d+ question/.test(charte.jauge || ''), charte.jauge);
    r.verifie('le pied des questions flash n\'a qu\'une action colorée',
        charte.uneSeuleAction === 1 && charte.piedFlash >= 4, JSON.stringify(charte));
    r.verifie('« Générer la série » reste sous la main quand la liste défile',
        charte.actionsEpinglees, JSON.stringify(charte));

    // --- L'ERGONOMIE : AJOUTER, RELANCER, GARDER ---
    const gestes = await page.evaluate(async () => {
        const fl = PluginManager.plugins.flashMathTool;
        fl.openWidget();
        await new Promise(r => setTimeout(r, 300));
        const el = document.getElementById('fl-widget');

        // Le « + » d'un thème ajoute une question sans glisser-déposer
        const avant = fl.state.questions.length;
        const plus = el.querySelector('.fl-chip-plus');
        const themeVise = plus.dataset.theme;
        plus.click();
        await new Promise(r => setTimeout(r, 150));
        const apresPlus = fl.state.questions.length;
        const derniere = fl.state.questions[fl.state.questions.length - 1];

        // Le clic sur la chip elle-même garde son sens : allumer le thème
        const chip = el.querySelector('.fl-chip');
        const themeChip = chip.dataset.theme;
        const etaitAllume = fl.state.themes.includes(themeChip);
        chip.click();
        await new Promise(r => setTimeout(r, 150));
        const bascule = fl.state.themes.includes(themeChip) !== etaitAllume;
        el.querySelector('.fl-chip').click();          // on remet comme avant
        await new Promise(r => setTimeout(r, 150));

        return {
            avant, apresPlus, themeVise,
            questionDuBonTheme: derniere && derniere.theme === themeVise,
            bascule
        };
    });
    r.egal('le « + » d\'un thème ajoute une question', gestes.apresPlus, gestes.avant + 1);
    r.verifie('et c\'est une question de ce thème-là', gestes.questionDuBonTheme, JSON.stringify(gestes));
    r.verifie('cliquer la pastille allume toujours le thème', gestes.bascule, JSON.stringify(gestes));

    const relance = await page.evaluate(async () => {
        const fl = PluginManager.plugins.flashMathTool;
        const el = document.getElementById('fl-widget');
        fl.state.count = 5;
        fl.generateQuestions();
        fl.renderGrid();
        await new Promise(r => setTimeout(r, 150));

        // On vise un thème qui a de quoi renouveler ses questions : certains
        // n'en ont qu'une poignée, et l'outil le dit alors au lieu de mentir.
        fl.state.questions = Array.from({ length: 5 }, () => fl.makeOneQuestion('equations'));
        fl.renderGrid();
        await new Promise(r => setTimeout(r, 150));
        const textes = () => fl.state.questions.map(q => q.q);
        const avant = textes();
        el.querySelectorAll('.fl-btn-relancer')[1].click();
        await new Promise(r => setTimeout(r, 150));
        const apres = textes();
        const changees = apres.filter((t, i) => t !== avant[i]).length;

        // Épingler puis relancer toute la série : la question reste
        el.querySelectorAll('.fl-btn-epingle')[0].click();
        await new Promise(r => setTimeout(r, 150));
        const gardee = fl.state.questions[0].q;
        const epinglee = !!fl.state.questions[0].epinglee;
        el.querySelector('#fl-btn-gen').click();
        await new Promise(r => setTimeout(r, 250));
        const survit = fl.state.questions.some(q => q.q === gardee && q.epinglee);

        // Une question écrite à la main survit aussi
        fl.state.questions.push({ q: 'Ma question à moi', a: '42', isCustom: true });
        el.querySelector('#fl-btn-gen').click();
        await new Promise(r => setTimeout(r, 250));
        const custom = fl.state.questions.some(q => q.isCustom && q.q === 'Ma question à moi');

        return { changees, epinglee, survit, custom, total: fl.state.questions.length };
    });
    r.egal('🎲 ne relance qu\'une seule question', relance.changees, 1);
    r.verifie('📍 épingle la question', relance.epinglee, JSON.stringify(relance));
    r.verifie('et elle survit à une nouvelle série', relance.survit, JSON.stringify(relance));
    r.verifie('une question écrite à la main survit aussi', relance.custom, JSON.stringify(relance));
    r.verifie('sans que la feuille déborde du nombre demandé', relance.total <= 6, JSON.stringify(relance));

    const tirage = await page.evaluate(async () => {
        const geg = PluginManager.plugins.globalExerciseGenerator;
        geg.openWidget();
        await new Promise(r => setTimeout(r, 300));
        const el = document.getElementById('geg-widget');
        const relancer = el.querySelector('#geg-relancer');
        geg.updatePreview();
        const avant = JSON.stringify(geg.currentState && geg.currentState.questions);
        const apercuTenu = !!(geg.currentState && geg.currentState.questions);
        relancer.click();
        await new Promise(r => setTimeout(r, 250));
        const apres = JSON.stringify(geg.currentState && geg.currentState.questions);

        // Sans type coché, le bouton disait tout et ne faisait rien
        el.querySelectorAll('.geg-opt-check').forEach(c => { c.checked = false; });
        const cartes = images.length;
        el.querySelector('#geg-generate').click();
        await new Promise(r => setTimeout(r, 200));
        const rienPose = images.length === cartes;
        const signale = el.querySelector('#geg-options').classList.contains('geg-manque');
        el.querySelectorAll('.geg-opt-check')[0].checked = true;
        return { boutonLa: !!relancer, apercuTenu, change: avant !== apres, rienPose, signale };
    });
    r.verifie('le générateur propose un autre tirage', tirage.boutonLa);
    r.verifie('l\'aperçu retient son tirage : on tamponne ce qu\'on voit',
        tirage.apercuTenu, JSON.stringify(tirage));
    r.verifie('et il change vraiment les questions', tirage.change, JSON.stringify(tirage));
    r.verifie('sans type coché, rien n\'est posé sur le tableau', tirage.rienPose, JSON.stringify(tirage));
    r.verifie('mais on le signale au lieu de ne rien faire', tirage.signale, JSON.stringify(tirage));

    const nuit = await page.evaluate(async () => {
        toggleDarkMode();
        await new Promise(r => setTimeout(r, 200));
        const geg = document.getElementById('geg-widget');
        const fond = getComputedStyle(geg).backgroundColor;
        // « rgb(30, 38, 43) » : on veut simplement du sombre, pas du blanc
        const n = (fond.match(/\d+/g) || []).map(Number);
        const sombre = n.length >= 3 && (n[0] + n[1] + n[2]) / 3 < 90;
        // La feuille d'aperçu, elle, reste du papier blanc
        const feuille = document.querySelector('#fl-widget .fl-sheet');
        const p = (getComputedStyle(feuille).backgroundColor.match(/\d+/g) || []).map(Number);
        const blanche = p.length >= 3 && (p[0] + p[1] + p[2]) / 3 > 230;
        toggleDarkMode();
        return { fond, sombre, blanche };
    });
    r.verifie('en mode nuit, la fenêtre s\'assombrit', nuit.sombre, nuit.fond);
    r.verifie('mais la feuille reste du papier blanc', nuit.blanche, JSON.stringify(nuit));

    // --- DROPBOX ---
    const dbx = await page.evaluate(async () => {
        await ouvrirExplorateur('dropbox');
        await new Promise(r => setTimeout(r, 300));
        return {
            source: !!document.querySelector('.exp-source[data-source="dropbox"]'),
            // Sous file://, Dropbox ne peut pas fonctionner et le dit
            message: (document.getElementById('exp-corps').innerText || ''),
            aucunSecret: !JSON.stringify(window.NuageDropbox).includes('secret')
        };
    });
    r.verifie('Dropbox figure parmi les sources', dbx.source, JSON.stringify(dbx));
    r.verifie('et explique pourquoi il ne marche pas depuis un dossier',
        /http\(s\)/.test(dbx.message), dbx.message.slice(0, 90));

    // Le fichier de configuration ne doit contenir aucun secret d'application
    const config = await page.evaluate(() => ({
        cleParDefaut: window.AUTABLEAU_DROPBOX_APP_KEY,
        typeCle: typeof window.AUTABLEAU_DROPBOX_APP_KEY
    }));
    r.egal('aucune clé Dropbox n\'est livrée avec le dépôt', config.cleParDefaut, '');
    r.egal('mais la place existe pour en mettre une', config.typeCle, 'string');

    // --- LE NUAGE : CHACUN RELIE LE SIEN ---
    const nuage = await page.evaluate(async () => {
        // Aucune adresse ne doit être écrite d'avance dans le code
        const enDur = /remote\.php\/dav\/files\/[a-z]/i.test(
            Array.from(document.scripts).map(s => s.src).join(' '));
        await ouvrirExplorateur('nextcloud');
        await new Promise(r => setTimeout(r, 350));
        return {
            enDur,
            source: !!document.querySelector('.exp-source[data-source="nextcloud"]'),
            cliquable: !document.querySelector('.exp-source[data-source="nextcloud"]').classList.contains('indispo'),
            formulaire: !!document.getElementById('nc-url'),
            adresseVide: (document.getElementById('nc-url') || {}).value,
            motDePasseMasque: (document.getElementById('nc-mdp') || {}).type,
            memoire: localStorage.getItem('board_nextcloud')
        };
    });
    r.verifie('le nuage figure parmi les sources', nuage.source, JSON.stringify(nuage));
    r.verifie('et reste cliquable tant qu\'il n\'est pas relié', nuage.cliquable, JSON.stringify(nuage));
    r.verifie('il propose son formulaire au lieu d\'un refus', nuage.formulaire, JSON.stringify(nuage));
    r.egal('aucune adresse n\'est écrite d\'avance', nuage.adresseVide, '');
    r.egal('le mot de passe ne s\'affiche pas en clair', nuage.motDePasseMasque, 'password');
    r.egal('et rien n\'est retenu tant qu\'on n\'a pas relié', nuage.memoire, null);

    const refus = await page.evaluate(async () => {
        const dire = () => document.getElementById('nc-retour').textContent;
        const essayer = (adresse, mdp) => {
            document.getElementById('nc-url').value = adresse;
            document.getElementById('nc-mdp').value = mdp || '';
            document.getElementById('nc-relier').click();
            return dire();
        };
        return {
            vide: essayer('', 'x'),
            malFormee: essayer('https://nuage.example/fichiers', 'x'),
            sansMdp: essayer('https://nuage.example/remote.php/dav/files/moi', ''),
            memoire: localStorage.getItem('board_nextcloud')
        };
    });
    r.verifie('une adresse vide est refusée avec la marche à suivre',
        /remote\.php/.test(refus.vide), refus.vide);
    r.verifie('une adresse qui n\'est pas du WebDAV aussi',
        /remote\.php/.test(refus.malFormee), refus.malFormee);
    r.verifie('le mot de passe manquant est signalé',
        /mot de passe/i.test(refus.sansMdp), refus.sansMdp);
    r.egal('aucun de ces essais n\'est mémorisé', refus.memoire, null);

    // Un serveur WebDAV simulé : on vérifie l'appel, la lecture et le refus
    const branche = await page.evaluate(async () => {
        const XML = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
            <d:response><d:href>/remote.php/dav/files/moi/</d:href><d:propstat><d:prop>
              <d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
            <d:response><d:href>/remote.php/dav/files/moi/Cours/</d:href><d:propstat><d:prop>
              <d:resourcetype><d:collection/></d:resourcetype>
              <d:getlastmodified>Mon, 01 Sep 2025 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
            <d:response><d:href>/remote.php/dav/files/moi/le%20cours.pdf</d:href><d:propstat><d:prop>
              <d:resourcetype/><d:getcontentlength>2048</d:getcontentlength>
              <d:getcontenttype>application/pdf</d:getcontenttype>
              <d:getlastmodified>Tue, 02 Sep 2025 08:30:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
          </d:multistatus>`;
        const vrai = window.fetch;
        const vus = [];
        window.fetch = async (url, opts = {}) => {
            vus.push({ url: String(url), methode: opts.method || 'GET', auth: (opts.headers || {}).Authorization || '' });
            if ((opts.method || '') === 'PROPFIND') {
                const jeton = String((opts.headers || {}).Authorization || '').replace(/^Basic /, '');
                let clair = ''; try { clair = atob(jeton); } catch (e) { /* pas du base64 */ }
                if (clair !== 'moi:mapasse') {
                    return new Response('', { status: 401 });
                }
                return new Response(XML, { status: 207 });
            }
            return new Response(new Blob(['%PDF-1.4']), { status: 200 });
        };
        const out = {};
        try {
            // mauvais mot de passe d'abord
            document.getElementById('nc-url').value = 'https://nuage09.example.fr/remote.php/dav/files/moi';
            document.getElementById('nc-mdp').value = 'pasbon';
            document.getElementById('nc-relier').click();
            await new Promise(r => setTimeout(r, 250));
            out.refuse = document.getElementById('nc-retour').textContent;
            out.riendedanslamemoire = localStorage.getItem('board_nextcloud');

            document.getElementById('nc-mdp').value = 'mapasse';
            document.getElementById('nc-relier').click();
            await new Promise(r => setTimeout(r, 450));
            out.relie = NuageNextcloud.dispo();
            out.retenu = JSON.parse(localStorage.getItem('board_nextcloud') || '{}');
            out.lignes = Array.from(document.querySelectorAll('.exp-ligne, .exp-item, .exp-case')).length;

            const liste = await NuageNextcloud.lister('');
            out.contenu = liste.map(f => ({ nom: f.nom, dossier: f.dossier, taille: f.taille }));
            const fichier = await NuageNextcloud.telecharger(liste.find(f => !f.dossier));
            out.fichier = { nom: fichier.name, type: fichier.type, octets: fichier.size };
            out.appels = vus.length;
            out.auth = vus.some(v => /^Basic /.test(v.auth));
            out.propfind = vus.some(v => v.methode === 'PROPFIND');
        } finally {
            window.fetch = vrai;
            localStorage.removeItem('board_nextcloud');
        }
        return out;
    });
    r.verifie('un mot de passe refusé est annoncé clairement',
        /refus/i.test(branche.refuse || ''), branche.refuse);
    r.egal('et il n\'est surtout pas mémorisé', branche.riendedanslamemoire, null);
    r.verifie('des identifiants valides relient la source', branche.relie, JSON.stringify(branche));
    r.verifie('l\'adresse et l\'identifiant sont retenus, lus dans le lien collé',
        branche.retenu.utilisateur === 'moi' && /nuage09\.example\.fr/.test(branche.retenu.url || ''),
        JSON.stringify(branche.retenu));
    r.verifie('le serveur est interrogé en PROPFIND, avec l\'authentification',
        branche.propfind && branche.auth, JSON.stringify(branche));
    r.egal('le dossier est lu : ses sous-dossiers et ses fichiers',
        branche.contenu, [{ nom: 'Cours', dossier: true, taille: 0 },
                          { nom: 'le cours.pdf', dossier: false, taille: 2048 }]);
    r.verifie('un fichier revient avec son nom décodé et son type',
        branche.fichier.nom === 'le cours.pdf' && branche.fichier.type === 'application/pdf',
        JSON.stringify(branche.fichier));

    // --- LES FENÊTRES S'AGRANDISSENT ---
    // Chaque outil ouvrait sa fenêtre à la taille prévue par son auteur : une
    // liste de trente élèves tenait dans un hublot. Toutes reçoivent les mêmes
    // commandes, et la taille choisie est retenue.
    const equipement = await page.evaluate(async () => {
        localStorage.removeItem('board_fenetres');
        await ClassesStore.saveAll([{ id: 'cf', name: 'Test', students:
            Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, name: 'Élève ' + i })) }]);
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 700));
        const box = document.querySelector('#class-manager-modal .modal-box');
        return {
            outils: !!box.querySelector(':scope > .fen-outils'),
            plein: !!box.querySelector('.fen-plein'),
            poignee: !!box.querySelector('.fen-poignee'),
            place: getComputedStyle(box).position !== 'static'
        };
    });
    r.verifie('« Mes classes » reçoit les commandes de fenêtre', equipement.outils, JSON.stringify(equipement));
    r.verifie('le plein écran', equipement.plein);
    r.verifie('et la poignée pour ajuster', equipement.poignee);
    r.verifie('posées dans un repère qui les tient au coin', equipement.place);

    const pleinEcran = await page.evaluate(async () => {
        const box = document.querySelector('#class-manager-modal .modal-box');
        const liste = () => document.getElementById('cm-students-list').getBoundingClientRect().height;
        const rAvant = box.getBoundingClientRect();
        const avant = { l: rAvant.width, h: rAvant.height, liste: liste() };
        box.querySelector('.fen-plein').click();
        await new Promise(r => setTimeout(r, 200));
        const b = box.getBoundingClientRect();
        const plein = {
            l: Math.round(b.width), h: Math.round(b.height),
            attendu: [window.innerWidth - 16, window.innerHeight - 16],
            liste: liste(),
            marque: box.classList.contains('fen-pleine'),
            poigneeCachee: getComputedStyle(box.querySelector('.fen-poignee')).display === 'none'
        };
        // un re-rendu complet du contenu ne doit pas emporter les commandes
        const item = document.querySelector('.cm-class-item');
        if (item) item.click();
        await new Promise(r => setTimeout(r, 150));
        plein.survitAuRerendu = !!box.querySelector('.fen-plein');

        box.querySelector('.fen-plein').click();
        await new Promise(r => setTimeout(r, 150));
        plein.revenu = Math.abs(box.getBoundingClientRect().width - avant.l) < 2;
        plein.listeAvant = Math.round(avant.liste);
        plein.hauteurGagnee = Math.round(plein.h - avant.h);
        plein.listeGagnee = Math.round(plein.liste - avant.liste);
        return plein;
    });
    r.egal('le plein écran occupe l\'écran, aux marges près',
        [pleinEcran.l, pleinEcran.h], pleinEcran.attendu);
    // Toute la hauteur gagnée par la fenêtre va à la liste, et rien qu'à elle :
    // c'est la seule chose qui mérite de s'étirer. (Le seuil était naguère
    // « +100 px » ; depuis que la liste est correctement dimensionnée au repos,
    // le plein écran n'ajoute plus que la différence — d'où cette mesure-ci,
    // qui dit la vraie propriété.)
    r.verifie('toute la hauteur gagnée revient à la liste d\'élèves',
        pleinEcran.listeGagnee >= pleinEcran.hauteurGagnee - 8, JSON.stringify(pleinEcran));
    r.verifie('la fenêtre se sait en plein écran', pleinEcran.marque);
    r.verifie('la poignée s\'efface, elle n\'a plus rien à ajuster', pleinEcran.poigneeCachee);
    r.verifie('les commandes survivent au redessin du contenu', pleinEcran.survitAuRerendu);
    r.verifie('et un second clic rend la taille d\'avant', pleinEcran.revenu, JSON.stringify(pleinEcran));

    const echap = await page.evaluate(async () => {
        const box = document.querySelector('#class-manager-modal .modal-box');
        const avant = box.getBoundingClientRect().width;
        box.querySelector('.fen-plein').click();
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
        return Math.abs(box.getBoundingClientRect().width - avant) < 2;
    });
    r.verifie('Échap rend l\'écran, on n\'y reste pas prisonnier', echap);

    const poignee = await page.evaluate(async () => {
        const box = document.querySelector('#class-manager-modal .modal-box');
        const p = box.querySelector('.fen-poignee');
        const b = box.getBoundingClientRect();
        const g = p.getBoundingClientRect();
        const ev = (t, x, y) => p.dispatchEvent(new PointerEvent(t, {
            bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1
        }));
        p.setPointerCapture = () => { };
        ev('pointerdown', g.left + 8, g.top + 8);
        ev('pointermove', g.left + 158, g.top + 118);
        ev('pointerup', g.left + 158, g.top + 118);
        await new Promise(r => setTimeout(r, 150));
        const a = box.getBoundingClientRect();
        return {
            grandi: Math.round(a.width - b.width), plusHaut: Math.round(a.height - b.height),
            // la hauteur ne dépasse pas l'écran, marges comprises
            tientDansLEcran: a.height <= window.innerHeight - 15,
            // et si elle touche déjà le plafond, elle ne peut plus grandir :
            // ce n'est pas un défaut, c'est la limite de l'écran
            auPlafond: a.height >= window.innerHeight - 17,
            memoire: JSON.parse(localStorage.getItem('board_fenetres') || '{}')['class-manager'],
            // ce que l'on tire est ce que l'on obtient : les marges intérieures
            // ne doivent pas s'ajouter par-dessus
            exact: Math.abs(a.width - Math.round(b.width + 150)) < 2
        };
    });
    r.verifie('tirer la poignée agrandit la fenêtre',
        poignee.grandi > 130 && (poignee.plusHaut > 105 || poignee.auPlafond), JSON.stringify(poignee));
    r.verifie('exactement de ce que l\'on a tiré', poignee.exact, JSON.stringify(poignee));
    r.verifie('sans jamais déborder de l\'écran', poignee.tientDansLEcran, JSON.stringify(poignee));
    r.verifie('et la taille est retenue', !!poignee.memoire && poignee.memoire.w > 800, JSON.stringify(poignee));

    const reouverture = await page.evaluate(async () => {
        const vise = JSON.parse(localStorage.getItem('board_fenetres'))['class-manager'];
        document.getElementById('class-manager-modal').remove();
        await openClassManagerModal();
        await new Promise(r => setTimeout(r, 700));
        const r2 = document.querySelector('#class-manager-modal .modal-box').getBoundingClientRect();
        document.getElementById('class-manager-modal').remove();
        return { vise, obtenu: { w: Math.round(r2.width), h: Math.round(r2.height) } };
    });
    r.verifie('la fenêtre rouvre à la taille de la dernière fois',
        Math.abs(reouverture.obtenu.w - reouverture.vise.w) < 2
        && Math.abs(reouverture.obtenu.h - reouverture.vise.h) < 2, JSON.stringify(reouverture));

    // Un bandeau de télécommande n'est pas une fenêtre : on ne l'encombre pas.
    const tri = await page.evaluate(async () => {
        const faire = (l, h) => {
            const d = document.createElement('div');
            d.style.cssText = `position:fixed; left:20px; top:20px; width:${l}px; height:${h}px; background:#fff;`;
            document.body.appendChild(d);
            return d;
        };
        const bandeau = faire(400, 60);
        const fenetre = faire(400, 300);
        const tout = faire(window.innerWidth, window.innerHeight);
        equiperFenetre(bandeau); equiperFenetre(fenetre); equiperFenetre(tout);
        await new Promise(r => setTimeout(r, 250));
        const lu = { bandeau: !!bandeau.querySelector('.fen-outils'),
                     fenetre: !!fenetre.querySelector('.fen-outils'),
                     tout: !!tout.querySelector('.fen-outils') };
        [bandeau, fenetre, tout].forEach(d => d.remove());
        return lu;
    });
    r.verifie('une vraie fenêtre reçoit les commandes', tri.fenetre, JSON.stringify(tri));
    r.verifie('un bandeau de télécommande, non', !tri.bandeau, JSON.stringify(tri));
    r.verifie('un jeu déjà plein écran non plus', !tri.tout, JSON.stringify(tri));

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
        const ok = (nom, type) => Explorateur.importable({ nom, type, dossier: false });
        return {
            image: ok('photo.jpg', 'image/jpeg'),
            pdf: ok('brevet.pdf', 'application/pdf'),
            docxMalType: ok('cours.docx', 'application/octet-stream'),
            sansType: ok('notes.txt', ''),
            csv: ok('classe.csv', 'text/csv'),
            docGoogle: Explorateur.importable({ nom: 'Mon cours', type: 'application/vnd.google-apps.document', converti: true }),
            diapoGoogle: Explorateur.importable({ nom: 'Ma présentation', type: 'application/vnd.google-apps.presentation', converti: true }),
            formulaire: ok('Sondage', 'application/vnd.google-apps.form'),
            dossier: Explorateur.importable({ nom: 'Maths', dossier: true })
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
            grisees: lignes.filter(l => l.classList.contains('exp-inactif')).length
        };
    });
    r.verifie('la fenêtre s\'ouvre sur Drive quand on le demande', liste.ouverte, JSON.stringify(liste));
    r.egal('les fichiers du dossier sont listés', liste.nombre, 4);
    r.verifie('avec leur poids en clair', /47 Ko/.test(liste.textes.join(' | ')), liste.textes.join(' | '));
    r.verifie('les dossiers sont annoncés comme tels', /Cours 5e Dossier/.test(liste.textes.join(' | ')), liste.textes.join(' | '));
    r.egal('et seul le formulaire est grisé', liste.grisees, 1);

    const vues = await pageWeb.evaluate(async () => {
        const suivant = async () => { document.getElementById('exp-vue').click(); await new Promise(r => setTimeout(r, 130)); };
        while (Explorateur.etat.vue !== 'apercus') await suivant();
        const grille = { classe: document.getElementById('exp-corps').className, cartes: document.querySelectorAll('.exp-carte').length };
        while (Explorateur.etat.vue !== 'liste') await suivant();
        const liste = { classe: document.getElementById('exp-corps').className, lignes: document.querySelectorAll('.exp-ligne').length };
        // la recherche filtre la liste
        const champ = document.getElementById('exp-recherche');
        champ.value = 'brevet';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        const filtre = document.querySelectorAll('.exp-ligne').length;
        champ.value = '';
        champ.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        // le tri par taille remonte le plus gros fichier
        const tri = document.getElementById('exp-tri');
        tri.value = 'taille';
        tri.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 100));
        const premier = document.querySelectorAll('.exp-ligne .exp-nom')[1];
        tri.value = 'nom';
        tri.dispatchEvent(new Event('change', { bubbles: true }));
        return { grille, liste, filtre, premierParTaille: premier ? premier.innerText : '' };
    });
    r.verifie('on peut passer en aperçus', /exp-grille/.test(vues.grille.classe) && vues.grille.cartes === 4, JSON.stringify(vues.grille));
    r.verifie('et revenir à la liste', !/exp-grille/.test(vues.liste.classe) && vues.liste.lignes === 4, JSON.stringify(vues.liste));

    // Quatre présentations en tout, dont un tableau détaillé et une mosaïque
    const quatre = await pageWeb.evaluate(async () => {
        const vus = [];
        for (let i = 0; i < 4; i++) {
            vus.push({
                vue: Explorateur.etat.vue,
                classe: document.getElementById('exp-corps').className,
                colonnes: document.querySelectorAll('.exp-detail-entete span').length,
                elements: document.querySelectorAll('.exp-ligne, .exp-carte, .exp-detail:not(.exp-detail-entete)').length
            });
            document.getElementById('exp-vue').click();
            await new Promise(r => setTimeout(r, 120));
        }
        return vus;
    });
    r.egal('quatre présentations se succèdent', quatre.map(v => v.vue), ['liste', 'details', 'apercus', 'mosaique']);
    r.verifie('la vue « détails » a ses colonnes',
        quatre[1].colonnes === 5 && /exp-details/.test(quatre[1].classe), JSON.stringify(quatre[1]));
    r.verifie('la mosaïque garde les mêmes fichiers',
        quatre[3].elements === 4 && /exp-mosaique/.test(quatre[3].classe), JSON.stringify(quatre[3]));
    r.egal('la recherche filtre les fichiers', vues.filtre, 1);
    r.verifie('le tri par taille met le plus gros devant',
        /Brevet blanc/.test(vues.premierParTaille), vues.premierParTaille);

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

    // --- LES RACCOURCIS DE CHEMIN ---
    // On revient toujours aux mêmes dossiers. Un raccourci retient la source
    // ET le chemin complet : deux dossiers de même nom restent distincts.
    const naviguer = async (nom) => {
        await pageWeb.evaluate((n) => {
            Array.from(document.querySelectorAll('#explorateur .exp-ligne'))
                .find(l => l.innerText.includes(n)).click();
        }, nom);
        await pageWeb.waitForTimeout(350);
    };

    await pageWeb.evaluate(async () => {
        const arbre = {
            '': [{ id: 'cours', nom: 'Cours', dossier: true }, { id: 'im', nom: 'Images', dossier: true }],
            cours: [{ id: 'c5', nom: '5e', dossier: true }],
            c5: [{ id: 'f1', nom: 'chapitre1.pdf', dossier: false, type: 'application/pdf', taille: 900 }],
            im: [{ id: 'f2', nom: 'schema.png', dossier: false, type: 'image/png', taille: 400 }]
        };
        Explorateur.enregistrer({
            cle: 'essai', nom: 'Essai', icone: '🧪', dispo: () => true,
            racine: () => ({ id: '', nom: 'Essai' }),
            lister: async (d) => arbre[d] || [], telecharger: async () => new File([''], 'x')
        });
        localStorage.removeItem('board_explorateur');
        await Explorateur.ouvrir('essai');
        await new Promise(r => setTimeout(r, 400));
    });
    await naviguer('Cours');
    await naviguer('5e');

    const pose = await pageWeb.evaluate(() => {
        const avant = document.getElementById('exp-raccourci').textContent.trim();
        document.getElementById('exp-raccourci').click();
        const memoire = JSON.parse(localStorage.getItem('board_explorateur') || '{}').raccourcis || [];
        return {
            avant, apres: document.getElementById('exp-raccourci').textContent.trim(),
            allumee: document.getElementById('exp-raccourci').classList.contains('actif'),
            bande: getComputedStyle(document.getElementById('exp-raccourcis')).display,
            puces: document.querySelectorAll('.exp-raccourci').length,
            nom: memoire[0] && memoire[0].nom,
            source: memoire[0] && memoire[0].source,
            chemin: memoire[0] && memoire[0].chemin.map(c => c.nom)
        };
    });
    r.egal('l\'étoile de la barre est vide au départ', pose.avant, '☆');
    r.egal('elle s\'allume quand on garde le dossier', pose.apres, '★');
    r.verifie('et se marque comme active', pose.allumee, JSON.stringify(pose));
    r.verifie('la bande des raccourcis apparaît', pose.bande !== 'none', pose.bande);
    r.egal('avec une puce', pose.puces, 1);
    r.egal('qui porte le nom du dossier', pose.nom, '5e');
    r.egal('sa source', pose.source, 'essai');
    r.egal('et le chemin complet pour y revenir', pose.chemin, ['Essai', 'Cours', '5e']);

    await pageWeb.evaluate(async () => { await Explorateur.ouvrir('essai'); });
    await pageWeb.waitForTimeout(400);
    await naviguer('Images');
    const parti = await pageWeb.evaluate(() => document.getElementById('exp-chemin').innerText);
    r.verifie('on peut repartir ailleurs', /Images/.test(parti), parti);

    await pageWeb.evaluate(() => document.querySelector('.exp-raccourci').click());
    await pageWeb.waitForTimeout(450);
    const revenu = await pageWeb.evaluate(() => ({
        chemin: document.getElementById('exp-chemin').innerText,
        fichiers: Array.from(document.querySelectorAll('#explorateur .exp-ligne')).map(l => l.innerText.trim())
    }));
    r.verifie('un clic sur la puce ramène au bon dossier',
        /Essai › Cours › 5e/.test(revenu.chemin), revenu.chemin);
    r.verifie('et son contenu est bien là',
        revenu.fichiers.some(f => /chapitre1\.pdf/.test(f)), JSON.stringify(revenu.fichiers));

    const oté = await pageWeb.evaluate(() => {
        document.querySelector('.exp-raccourci-oter').click();
        return {
            bande: getComputedStyle(document.getElementById('exp-raccourcis')).display,
            memoire: (JSON.parse(localStorage.getItem('board_explorateur') || '{}').raccourcis || []).length,
            etoile: document.getElementById('exp-raccourci').textContent.trim()
        };
    });
    r.egal('la croix retire le raccourci', oté.memoire, 0);
    r.egal('la bande se referme', oté.bande, 'none');
    r.egal('et l\'étoile de la barre s\'éteint', oté.etoile, '☆');

    r.verifie('aucune erreur JS en ligne', errsWeb.length === 0, errsWeb.join(' | '));
    await ctxWeb.close();
    serveur.close();

    return r.bilan();
};
