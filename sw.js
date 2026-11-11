// ==============================================================================
// LE SERVICE WORKER — ET LA SEULE QUESTION QUI COMPTE
//
// « Oui go, et ça se met à jour avec la dernière version ??? »
//
// C'est LE piège de cette technique, et il est mortel pour un projet qui
// publie plusieurs fois par jour. Un service worker ordinaire répond d'abord
// par son cache : l'application s'ouvre instantanément, et sert éternellement
// la version du jour de l'installation. L'enseignant installe en novembre et
// travaille en juin sur l'application de novembre, sans que rien ne le lui
// dise. On aurait gagné une icône et perdu les mises à jour.
//
// CE SERVICE WORKER DEMANDE TOUJOURS LE RÉSEAU D'ABORD.
//
//   réseau joignable  → on sert ce que le serveur donne, c'est-à-dire la
//                       dernière version, et on en met une copie de côté ;
//   réseau absent     → on sert la copie, qui est la dernière version VUE.
//
// On paie cela d'un aller-retour réseau au démarrage. C'est le bon marché :
// une application de classe doit être à jour, et doit survivre à un wifi
// d'école qui tombe — dans cet ordre.
//
// IL NE FAUT DONC PAS LIRE CE CACHE COMME UNE OPTIMISATION DE VITESSE. C'est
// un filet : il ne sert que lorsque le réseau a dit non.
// ==============================================================================

// Le nom change à chaque version de l'application : l'ancien cache est jeté au
// lieu de traîner. Ce numéro suit ceux de « index.html ».
const CACHE = 'au-tableau-v449';

// Ce qu'on met de côté dès l'installation, pour qu'une première coupure de
// réseau ne trouve pas l'application vide. Le reste s'ajoute à l'usage.
const LE_NÉCESSAIRE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './plugin.js',
    './manifest.webmanifest',
    './icones/icone-192.png',
    './icones/icone-512.png'
];

self.addEventListener('install', (e) => {
    // ON N'ATTEND PAS QUE TOUS LES ONGLETS SE FERMENT. Sans « skipWaiting », un
    // service worker neuf reste en attente tant qu'une ancienne page vit — et
    // une application de tableau reste ouverte toute la journée. La mise à jour
    // n'arriverait qu'au prochain démarrage de l'ordinateur.
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(LE_NÉCESSAIRE))
            // UN FICHIER MANQUANT NE DOIT PAS EMPÊCHER L'INSTALLATION : « addAll »
            // échoue en bloc, et l'on se retrouverait sans service worker du tout
            // pour un chemin qui a bougé. Le filet serait alors vide, mais
            // l'application, elle, marche toujours par le réseau.
            .catch(() => { })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
            // Et l'on prend la main sur les pages déjà ouvertes, sans attendre
            // qu'elles soient rechargées.
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    // On ne se mêle que de ce qu'on sait rejouer : les lectures, sur notre
    // propre origine. Un envoi, une requête vers ailleurs — Dropbox, Google —
    // passent sans qu'on y touche.
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    e.respondWith(
        fetch(req)
            .then(rep => {
                // On ne garde que ce qui est bon : une erreur 404 mise en cache
                // serait servie hors ligne comme si c'était la page.
                if (rep && rep.ok && rep.type === 'basic') {
                    const copie = rep.clone();
                    caches.open(CACHE).then(c => c.put(req, copie)).catch(() => { });
                }
                return rep;
            })
            .catch(() => caches.match(req).then(vu => vu || caches.match('./index.html')))
    );
});
