// ============================================================
// NEXTCLOUD (« le Nuage »), VU COMME UNE SOURCE DE L'EXPLORATEUR
// ============================================================
// Contrairement à Google Drive, il n'y a rien à déclarer côté développeur :
// pas de clé d'application, pas d'écran de consentement. Chaque enseignant a
// SON serveur (celui de son académie, le plus souvent) et SON compte. C'est
// donc lui qui donne, une fois pour toutes, sur sa machine :
//
//     • l'adresse WebDAV de ses fichiers, telle qu'elle apparaît tout en bas
//       de la page « Fichiers » de Nextcloud, par exemple
//       https://nuage00.apps.education.fr/remote.php/dav/files/prenomnom
//     • un MOT DE PASSE D'APPLICATION (Paramètres → Sécurité → « Créer un
//       nouveau mot de passe d'application »), jamais le mot de passe du
//       compte : il se révoque d'un clic, et il ne donne accès qu'aux
//       fichiers.
//
// Ces deux valeurs restent dans le navigateur de l'enseignant (localStorage)
// et ne sont écrites nulle part dans le code : rien à publier, rien à
// partager. Un collègue mettra les siennes.
//
// À savoir : le serveur doit accepter les requêtes venues du site
// (en-tête CORS). Les serveurs apps.education.fr le font ; sur un Nextcloud
// personnel, l'application « WebAppPassword » s'en charge.
// ============================================================
(function () {
    'use strict';

    const CLE = 'board_nextcloud';

    const compte = { url: '', utilisateur: '', motDePasse: '' };
    try {
        Object.assign(compte, JSON.parse(localStorage.getItem(CLE) || '{}'));
    } catch (e) { /* stockage refusé */ }

    function retenir() {
        try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch (e) { /* stockage refusé */ }
    }
    function oublier() {
        compte.url = ''; compte.utilisateur = ''; compte.motDePasse = '';
        try { localStorage.removeItem(CLE); } catch (e) { /* stockage refusé */ }
    }

    // L'adresse collée depuis Nextcloud finit par le nom d'utilisateur : on
    // le lit au passage, l'enseignant n'a donc qu'un seul champ à remplir.
    function lireAdresse(brut) {
        let a = String(brut || '').trim().replace(/\s+/g, '');
        if (!a) return null;
        if (!/^https?:\/\//i.test(a)) a = 'https://' + a;
        a = a.replace(/\/+$/, '');
        const m = a.match(/^(https?:\/\/[^/]+)\/remote\.php\/(?:web)?dav\/files\/([^/]+)/i);
        if (!m) return null;
        return { url: m[1] + '/remote.php/dav/files/' + m[2], utilisateur: decodeURIComponent(m[2]) };
    }

    function entete() {
        return { Authorization: 'Basic ' + btoa(compte.utilisateur + ':' + compte.motDePasse) };
    }

    // Un dossier est désigné par son chemin depuis la racine du compte
    function adresseDe(chemin) {
        const bout = String(chemin || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
        return compte.url + (bout ? '/' + bout : '');
    }

    const PROPFIND = '<?xml version="1.0"?>'
        + '<d:propfind xmlns:d="DAV:"><d:prop>'
        + '<d:displayname/><d:getcontentlength/><d:getcontenttype/><d:getlastmodified/><d:resourcetype/>'
        + '</d:prop></d:propfind>';

    function traduireErreur(r) {
        if (r.status === 401) return "Identifiants refusés : vérifiez l'adresse et le mot de passe d'application.";
        if (r.status === 404) return "Cette adresse ne répond pas. Recopiez le lien WebDAV affiché en bas de la page « Fichiers ».";
        if (r.status === 403) return "Le serveur refuse l'accès à ce dossier.";
        return 'Le serveur a répondu ' + r.status + '.';
    }

    const nextcloud = {
        cle: 'nextcloud', nom: 'Le nuage (Nextcloud)', icone: '🌥️',

        dispo: () => !!(compte.url && compte.motDePasse),
        raison: () => "Le nuage n'est pas encore relié à ce navigateur.",
        racine: () => ({ id: '', nom: compte.utilisateur || 'Mon nuage' }),

        async lister(dossier) {
            const r = await fetch(adresseDe(dossier), {
                method: 'PROPFIND',
                headers: Object.assign({ Depth: '1', 'Content-Type': 'application/xml' }, entete()),
                body: PROPFIND
            });
            if (!r.ok && r.status !== 207) throw new Error(traduireErreur(r));

            const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
            const reponses = Array.from(xml.getElementsByTagNameNS('DAV:', 'response'));
            const base = new URL(adresseDe(dossier)).pathname.replace(/\/+$/, '');

            const lu = (n, nom) => {
                const e = n.getElementsByTagNameNS('DAV:', nom)[0];
                return e ? e.textContent : '';
            };

            return reponses.map(n => {
                const href = decodeURIComponent(lu(n, 'href')).replace(/\/+$/, '');
                if (href === base) return null;                       // le dossier lui-même
                const nom = href.slice(href.lastIndexOf('/') + 1);
                if (!nom) return null;
                const estDossier = n.getElementsByTagNameNS('DAV:', 'collection').length > 0;
                const date = lu(n, 'getlastmodified');
                return {
                    id: (dossier ? dossier + '/' : '') + nom,
                    nom,
                    dossier: estDossier,
                    type: lu(n, 'getcontenttype') || '',
                    taille: parseInt(lu(n, 'getcontentlength'), 10) || 0,
                    date: date ? Date.parse(date) : 0
                };
            }).filter(Boolean);
        },

        async telecharger(fichier) {
            const r = await fetch(adresseDe(fichier.id), { headers: entete() });
            if (!r.ok) throw new Error(traduireErreur(r));
            const blob = await r.blob();
            return new File([blob], fichier.nom, { type: fichier.type || blob.type });
        },

        // Nextcloud fabrique les vignettes à la demande ; en cas de refus on
        // s'en passe, l'explorateur retombe alors sur son icône.
        async apercu(fichier) {
            if (fichier.dossier || !/^image\//.test(fichier.type || '')) return null;
            try {
                const serveur = compte.url.replace(/\/remote\.php\/.*$/, '');
                const chemin = encodeURIComponent('/' + fichier.id);
                const r = await fetch(serveur + '/index.php/core/preview.png?file=' + chemin + '&x=160&y=160&a=1',
                    { headers: entete() });
                if (!r.ok) return null;
                return URL.createObjectURL(await r.blob());
            } catch (e) { return null; }
        },

        // Le formulaire que l'explorateur affiche tant que la source n'est
        // pas reliée : chacun colle SON adresse, rien n'est écrit d'avance.
        configurer(zone, fait) {
            zone.innerHTML = `
                <div class="exp-reglage">
                    <h4>Relier votre nuage</h4>
                    <p>Ces informations restent dans ce navigateur. Elles ne sont ni envoyées
                       ailleurs, ni partagées avec les autres utilisateurs d'Au&nbsp;Tableau.</p>

                    <label for="nc-url">Adresse WebDAV de vos fichiers</label>
                    <input id="nc-url" type="url" spellcheck="false" autocomplete="off"
                           placeholder="https://mon-nuage.example/remote.php/dav/files/monidentifiant"
                           value="${(compte.url || '').replace(/"/g, '&quot;')}">
                    <small>Dans Nextcloud, ouvrez <b>Fichiers</b> : le lien est affiché tout en bas
                           à gauche, sous « WebDAV ». Copiez-le tel quel.</small>

                    <label for="nc-mdp">Mot de passe d'application</label>
                    <input id="nc-mdp" type="password" autocomplete="new-password" placeholder="••••••••••••">
                    <small>Nextcloud → <b>Paramètres personnels → Sécurité → Créer un nouveau mot de
                           passe d'application</b>. N'utilisez jamais le mot de passe de votre compte :
                           celui-ci se révoque d'un clic et ne donne accès qu'aux fichiers.</small>

                    <div class="exp-reglage-actions">
                        <button id="nc-relier" class="exp-bouton exp-bouton-fort">Relier</button>
                        ${compte.url ? '<button id="nc-oublier" class="exp-bouton">Oublier ce compte</button>' : ''}
                    </div>
                    <div id="nc-retour" class="exp-reglage-retour"></div>
                </div>`;

            const dire = (texte, erreur) => {
                const d = zone.querySelector('#nc-retour');
                d.textContent = texte;
                d.className = 'exp-reglage-retour' + (erreur ? ' erreur' : '');
            };

            const oubli = zone.querySelector('#nc-oublier');
            if (oubli) oubli.addEventListener('click', () => { oublier(); this.configurer(zone, fait); });

            zone.querySelector('#nc-relier').addEventListener('click', async () => {
                const adresse = lireAdresse(zone.querySelector('#nc-url').value);
                const mdp = zone.querySelector('#nc-mdp').value;
                if (!adresse) {
                    return dire("Cette adresse n'a pas la forme attendue : elle doit contenir "
                        + '« /remote.php/dav/files/ » suivi de votre identifiant.', true);
                }
                if (!mdp) return dire("Il manque le mot de passe d'application.", true);

                dire('Connexion au serveur…');
                const memoire = { url: compte.url, utilisateur: compte.utilisateur, motDePasse: compte.motDePasse };
                compte.url = adresse.url;
                compte.utilisateur = adresse.utilisateur;
                compte.motDePasse = mdp;
                try {
                    await this.lister('');            // un vrai essai vaut mieux qu'une promesse
                    retenir();
                    dire('Nuage relié.');
                    if (typeof fait === 'function') fait();
                } catch (e) {
                    Object.assign(compte, memoire);   // on ne garde pas des identifiants qui ne marchent pas
                    dire(e.message || 'Connexion impossible.', true);
                }
            });

            zone.querySelector('#nc-mdp').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') zone.querySelector('#nc-relier').click();
            });
        }
    };

    if (window.Explorateur) window.Explorateur.enregistrer(nextcloud);
    window.NuageNextcloud = nextcloud;
})();
