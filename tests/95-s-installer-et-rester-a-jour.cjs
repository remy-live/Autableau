// S'INSTALLER POUR OUVRIR LES PDF — ET RESTER À JOUR.
//
// « Comment faire pour ouvrir un PDF par défaut avec Au Tableau, ou le rajouter
// dans le contextuel sous Windows ? »
//
// Windows n'associe un type de fichier qu'à un PROGRAMME INSTALLÉ. Une page web
// n'a rien à quoi s'accrocher, et aucune entrée de base de registre n'y change
// rien : une page ne peut pas lire un fichier local qu'on lui désigne — c'est
// une barrière de sécurité, pas un réglage. Le seul chemin qui ne transforme pas
// l'application en logiciel empaqueté est de la rendre INSTALLABLE.
//
// Puis, aussitôt : « et ça se met à jour avec la dernière version ??? »
//
// C'EST LA QUESTION QUI DÉCIDE DE TOUT. Un service worker ordinaire répond
// d'abord par son cache : l'application s'ouvre vite, et sert éternellement la
// version du jour de l'installation. On installe en novembre, on travaille en
// juin sur l'application de novembre, et rien ne le dit. Pour un dépôt qui
// publie plusieurs fois par jour, ce serait pire que de ne rien installer.
//
// CE CHAPITRE ÉPROUVE DONC LA PROMESSE, ET NON LE RÉGLAGE : on sert
// l'application depuis un vrai serveur, on CHANGE un fichier, on recharge, et
// l'on vérifie que c'est la nouvelle version qui arrive. Puis on coupe le
// serveur, et l'on vérifie que l'application s'ouvre quand même.
//
// Il faut un serveur pour cela : en « file:// », où tourne le reste de la
// suite, aucun service worker ne s'enregistre — et c'est voulu, l'application
// posée sur une clé USB doit marcher sans se plaindre.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { creerRapport } = require('./harness.cjs');

const RACINE = path.resolve(__dirname, '..');
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.mjs': 'text/javascript; charset=utf-8'
};

module.exports = async function (browser) {
    const r = creerRapport('S\'installer, et rester à jour');

    // ------------------------------------------------------------------
    // 1. CE QUE LE MANIFESTE PROMET À WINDOWS
    // ------------------------------------------------------------------
    const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifest.webmanifest'), 'utf8'));
    r.egal('l\'application s\'installe sous son nom, et en français',
        [manifeste.name, manifeste.lang, manifeste.display],
        ['Au Tableau !', 'fr', 'standalone'], JSON.stringify(manifeste.name));

    // LES DEUX TAILLES OBLIGATOIRES, et une « rognable ». Sous Windows comme
    // sous Android, le système découpe l'icône à sa guise : un dessin qui va
    // jusqu'au bord se fait manger les coins.
    const tailles = (manifeste.icons || []).map(i => i.sizes);
    const rognable = (manifeste.icons || []).some(i => (i.purpose || '').includes('maskable'));
    r.verifie('elle a les deux tailles d\'icône exigées, et une rognable pour les coins arrondis du système',
        tailles.includes('192x192') && tailles.includes('512x512') && rognable,
        JSON.stringify({ tailles, rognable }));
    r.verifie('et chaque icône est bien là, sur le disque',
        (manifeste.icons || []).every(i => fs.existsSync(path.join(RACINE, i.src))),
        JSON.stringify((manifeste.icons || []).map(i => i.src)));

    // C'EST CETTE CLÉ QUI MET L'APPLICATION DANS « OUVRIR AVEC ».
    const poignees = manifeste.file_handlers || [];
    const acceptePdf = poignees.some(h => h.accept && h.accept['application/pdf']
        && h.accept['application/pdf'].includes('.pdf'));
    r.verifie('LE MANIFESTE DEMANDE LES PDF : c\'est cette clé-là, et elle seule, qui met l\'application dans « Ouvrir avec » de Windows',
        acceptePdf, JSON.stringify(poignees));
    r.verifie('et la page qu\'il désigne est bien dans l\'application',
        poignees.every(h => typeof h.action === 'string' && h.action.startsWith('.')),
        JSON.stringify(poignees.map(h => h.action)));

    // ------------------------------------------------------------------
    // 2. EN « file:// », ON N'ESSAIE MÊME PAS
    //
    // Beaucoup de salles ouvrent une copie posée sur une clé. Le navigateur
    // refuse net un service worker sans origine sûre : tenter quand même
    // laisserait une erreur rouge dans la console à chaque début de séance, et
    // une erreur qu'on apprend à ignorer est une erreur qu'on n'ignorera pas
    // le jour où elle compte.
    // ------------------------------------------------------------------
    const { ouvrirApp } = require('./harness.cjs');
    const surUneCle = await ouvrirApp(browser, {});
    const enFichier = await surUneCle.page.evaluate(() => ({
        protocole: location.protocol,
        tente: installerLeServiceWorker(),
        enregistre: !!(navigator.serviceWorker && navigator.serviceWorker.controller)
    }));
    r.egal('OUVERTE DEPUIS UNE CLÉ USB, ELLE NE TENTE RIEN : pas de service worker sans origine sûre, et pas d\'erreur rouge au début de chaque séance',
        [enFichier.protocole, enFichier.tente, enFichier.enregistre],
        ['file:', false, false], JSON.stringify(enFichier));
    await surUneCle.context.close();

    // ------------------------------------------------------------------
    // 3. CE QU'ON LUI OUVRE ARRIVE SUR LE TABLEAU
    //
    // C'est le geste entier : double-clic sur un PDF dans l'explorateur, et
    // l'exercice est là. Le système dépose le fichier dans « launchQueue » ; si
    // personne ne vient le chercher, l'application s'ouvre sur un tableau vide
    // et l'enseignant croit que ça n'a pas marché.
    //
    // On ne peut pas demander à Windows de lancer l'application depuis une
    // épreuve. On éprouve donc le CHEMIN : une file de lancement comme le
    // navigateur en fabrique une, le fichier qu'on y dépose, et le PDF qui
    // doit se retrouver sur le tableau.
    // ------------------------------------------------------------------
    const { petitPdf } = require('./harness.cjs');
    const octets = Array.from(await petitPdf());
    const parDoubleClic = await ouvrirApp(browser, {});
    await require('./harness.cjs').tableauVierge(parDoubleClic.page);
    const recu = await parDoubleClic.page.evaluate(async ({ octets }) => {
        images.length = 0;
        // La file telle que le navigateur la pose : un objet avec un seul
        // « setConsumer », et des poignées qui rendent le fichier.
        // « launchQueue » est une propriété en LECTURE SEULE de la fenêtre :
        // une simple affectation échoue en silence, et c'est la vraie file du
        // navigateur qui répond — le contrôle lisait alors « aucun
        // consommateur » alors que le branchement marchait. On la remplace donc
        // comme il faut.
        let consommateur = null;
        Object.defineProperty(window, 'launchQueue', {
            value: { setConsumer: (f) => { consommateur = f; } },
            configurable: true, writable: true
        });
        const pose = recevoirLesFichiersDuSysteme();
        if (!pose || !consommateur) return { pose, consommateur: !!consommateur };
        // ON COMPTE LES DEMANDES DE PLEIN ÉCRAN, au lieu de guetter la bulle de
        // refus : en tête sans affichage, ce navigateur ACCORDE le plein écran
        // sans geste de l'usager, et la bulle n'apparaît jamais. Un sabotage
        // qui réclamait le plein écran ne faisait donc rien tomber — c'est le
        // contrôle qui ne mesurait pas. Ce qu'on veut savoir est plus simple et
        // ne dépend d'aucun navigateur : A-T-ON DEMANDÉ ?
        window.__demandesDePlein = 0;
        const vraiPlein = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function () {
            window.__demandesDePlein++;
            return Promise.reject(new Error('refusé : personne n\'a touché l\'écran'));
        };
        setTimeout(() => { Element.prototype.requestFullscreen = vraiPlein; }, 4000);
        const fichier = new File([new Uint8Array(octets)], 'exercice.pdf', { type: 'application/pdf' });
        await consommateur({ files: [{ getFile: async () => fichier }] });
        await new Promise(ok => setTimeout(ok, 2500));
        const bulles = [...document.querySelectorAll('#toast-container > *')]
            .map(e => (e.textContent || '').trim());
        // Voir plus bas : on a compté les demandes de plein écran AU LIEU
        // d'attendre une bulle de refus que ce navigateur ne produit pas.
        const demandesDePlein = window.__demandesDePlein || 0;
        return {
            pose, consommateur: true,
            surLeTableau: images.length,
            estUnPdf: images.some(o => o && o.pluginData && o.pluginData.id === 'pdfDoc'),
            // ET IL EST DÉJÀ PROJETÉ : état 1, la page seule, toute la largeur.
            etat: etatDuPleinEcran(),
            cadrage: cadrageDePresentation,
            // Sans réclamer le plein écran du navigateur, qui serait refusé.
            pleinRefuse: bulles.some(t => /Plein écran refusé/.test(t)),
            demandesDePlein
        };
    }, { octets });
    r.egal('UN PDF OUVERT DEPUIS WINDOWS ARRIVE SUR LE TABLEAU : c\'est le geste entier — double-clic dans l\'explorateur, et l\'exercice est là',
        [recu.pose, recu.consommateur, recu.estUnPdf], [true, true, true],
        JSON.stringify(recu));

    // ET IL EST DÉJÀ PROJETÉ, SANS QU'ON AIT RIEN À FAIRE.
    //
    // « Ça pourrait s'ouvrir en plein écran tout de suite, en mode projection. »
    // Le réglage « PDF déposé en grand » est éteint par défaut, et c'est juste :
    // poser un document sur un tableau en cours ne doit pas emporter l'écran.
    // Mais un double-clic dans l'explorateur ne veut rien dire d'autre que
    // « montre-moi ce document » — il n'y a pas de tableau à préserver,
    // l'application vient de s'ouvrir POUR LUI.
    r.egal('ET IL EST DÉJÀ PROJETÉ, TOUTE LA LARGEUR : un double-clic dans l\'explorateur ne veut rien dire d\'autre que « montre-moi ce document »',
        [recu.etat, recu.cadrage], [1, 'largeur'], JSON.stringify(recu));

    // SANS RÉCLAMER LE PLEIN ÉCRAN DU NAVIGATEUR. Il ne l'accorde qu'à la suite
    // d'un geste de l'usager : un lancement par le système n'en est pas un, la
    // demande serait refusée, et l'application annoncerait « Plein écran refusé
    // par le navigateur » à chaque ouverture. Dans l'application installée, la
    // fenêtre n'a d'ailleurs aucune barre à cacher.
    r.egal('et sans RIEN DEMANDER au navigateur : il n\'accorde le plein écran qu\'après un geste de l\'usager, un lancement n\'en est pas un — et la fenêtre installée n\'a aucune barre à cacher',
        [recu.demandesDePlein, recu.pleinRefuse], [0, false], JSON.stringify(recu));
    // ET IL PASSE PAR LA MÊME PORTE QUE LE GLISSER-DÉPOSER. Un second chemin
    // aurait divergé du premier au premier format ajouté.
    const memePorte = await parDoubleClic.page.evaluate(() => {
        const src = String(window.recevoirLesFichiersDuSysteme);
        return { parLaPorteCommune: /deposerDesFichiers/.test(src) };
    });
    r.verifie('et par la MÊME porte que le glisser-déposer : ce qui arrive d\'un double-clic et ce qui arrive d\'un fichier traîné sur la page sont la même chose, et doivent le rester',
        memePorte.parLaPorteCommune, JSON.stringify(memePorte));
    await parDoubleClic.context.close();

    // ------------------------------------------------------------------
    // 4. SUR UN VRAI SERVEUR : ELLE S'INSTALLE, ET ELLE SE MET À JOUR
    // ------------------------------------------------------------------
    // Le serveur sert le dépôt tel quel — sauf un fichier qu'on pourra
    // remplacer en vol, pour jouer la publication d'une nouvelle version.
    let versionServie = 'PREMIÈRE';
    const serveur = http.createServer((req, rep) => {
        const chemin = decodeURIComponent(req.url.split('?')[0]);
        if (chemin === '/version.js') {
            rep.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8',
                                 'Cache-Control': 'no-cache' });
            rep.end('window.__versionDeLApplication = ' + JSON.stringify(versionServie) + ';');
            return;
        }
        const f = path.join(RACINE, chemin === '/' ? 'index.html' : chemin);
        if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
            rep.writeHead(404); rep.end('rien ici'); return;
        }
        rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream',
                             'Cache-Control': 'no-cache' });
        fs.createReadStream(f).pipe(rep);
    });
    await new Promise(ok => serveur.listen(0, '127.0.0.1', ok));
    const port = serveur.address().port;
    const base = 'http://127.0.0.1:' + port + '/';

    const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await context.newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push(String(e && e.message || e)));

    await page.goto(base + 'index.html');
    // On attend que le service worker ait pris la main : « skipWaiting » et
    // « clients.claim » sont là pour que ce soit rapide, mais pas instantané.
    const pris = await page.waitForFunction(
        () => navigator.serviceWorker && navigator.serviceWorker.controller,
        { timeout: 20000 }).then(() => true).catch(() => false);
    r.verifie('SERVIE PAR UN VRAI SERVEUR, ELLE S\'INSTALLE : c\'est ce service worker qui la rend installable, donc visible de Windows',
        pris, 'service worker aux commandes : ' + pris);

    // LA PREUVE DE LA MISE À JOUR. On publie une nouvelle version pendant que
    // l'application tourne, on recharge, et l'on regarde ce qui arrive.
    await page.evaluate((u) => new Promise(ok => {
        const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = ok;
        document.head.appendChild(s);
    }), base + 'version.js');
    const avant = await page.evaluate(() => window.__versionDeLApplication);
    versionServie = 'SECONDE';
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller,
        { timeout: 20000 }).catch(() => { });
    // LA MÊME URL, EXACTEMENT. J'avais ajouté « ?rechargé » pour être sûr que
    // le navigateur reparte chercher le fichier — et cette adresse différente
    // contourne le cache QUELLE QUE SOIT la politique du service worker : le
    // contrôle passait même en « cache d'abord », c'est-à-dire même avec une
    // application qui ne se met jamais à jour. Un sabotage propre l'a dit en ne
    // faisant rien tomber.
    //
    // C'est donc la même adresse qu'on redemande, celle-là même que le cache
    // aurait gardée : si l'application lit encore « PREMIÈRE », c'est qu'elle
    // sert sa copie et non le serveur.
    await page.evaluate((u) => new Promise(ok => {
        const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = ok;
        document.head.appendChild(s);
    }), base + 'version.js');
    const apres = await page.evaluate(() => window.__versionDeLApplication);
    r.egal('ET ELLE SE MET À JOUR : une version publiée pendant qu\'elle tourne est servie au rechargement suivant — le service worker demande TOUJOURS le réseau d\'abord, et ne garde sa copie que pour le jour où le réseau manque',
        [avant, apres], ['PREMIÈRE', 'SECONDE'], JSON.stringify({ avant, apres }));

    // ET LE FILET : serveur coupé, l'application s'ouvre quand même. Un wifi
    // d'école qui tombe ne doit pas laisser la classe devant un écran blanc.
    await new Promise(ok => serveur.close(ok));
    const horsLigne = await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' })
        .then(() => page.evaluate(() => ({
            tableau: !!document.getElementById('board'),
            outils: !!document.getElementById('bar-tools')
        })))
        .catch(e => ({ erreur: String(e && e.message || e) }));
    r.verifie('SERVEUR COUPÉ, ELLE S\'OUVRE QUAND MÊME : la copie de côté n\'est pas une optimisation de vitesse, c\'est un filet pour le wifi d\'école qui tombe',
        !!(horsLigne && horsLigne.tableau && horsLigne.outils), JSON.stringify(horsLigne));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
