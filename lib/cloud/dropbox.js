// ============================================================
// DROPBOX, VU COMME UNE SOURCE DE L'EXPLORATEUR
// ============================================================
// Dropbox demande une « App key » pour identifier l'application. Ce n'est PAS
// un secret : elle est visible dans la page, comme l'identifiant Google, et ce
// qui protège le compte c'est la liste des URL de redirection déclarées dans
// la console Dropbox. Le « App secret », lui, n'a jamais sa place dans une
// page web : le navigateur utilise le flux PKCE, qui n'en a pas besoin.
//
// Chacun peut donner SA clé (Réglages de la source), ou l'installation peut en
// fournir une par défaut dans lib/cloud/config.js. Elle reste dans le
// navigateur de l'enseignant ; chaque collègue se connecte ensuite à SON
// Dropbox et ne voit que SES fichiers.
//
// Comme Google, Dropbox exige une adresse en http(s) : ouverte depuis un
// dossier (file://), la source s'annonce indisponible et dit pourquoi.
// ============================================================
(function () {
    'use strict';

    const CLE_REGLAGES = 'board_dropbox';
    const CLE_JETON = 'board_dropbox_jeton';
    const enLigne = location.protocol === 'http:' || location.protocol === 'https:';

    const reglages = { appKey: window.AUTABLEAU_DROPBOX_APP_KEY || '' };
    try {
        const memoire = JSON.parse(localStorage.getItem(CLE_REGLAGES) || 'null');
        if (memoire && memoire.appKey) reglages.appKey = memoire.appKey;
    } catch (e) { /* stockage refusé */ }

    function retenirReglages() {
        try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages)); } catch (e) { /* stockage refusé */ }
    }

    // Le jeton vaut quelques heures : tant qu'il est valide, on ne redemande
    // rien, même après un rechargement de la page.
    function jetonMemorise() {
        try {
            const m = JSON.parse(sessionStorage.getItem(CLE_JETON) || 'null');
            if (m && m.jeton && m.expire > Date.now() + 60000) return m.jeton;
        } catch (e) { /* stockage refusé */ }
        return null;
    }
    function memoriserJeton(jeton, duree) {
        try {
            sessionStorage.setItem(CLE_JETON, JSON.stringify({ jeton, expire: Date.now() + (duree || 14400) * 1000 }));
        } catch (e) { /* stockage refusé */ }
    }
    function oublierJeton() {
        try { sessionStorage.removeItem(CLE_JETON); } catch (e) { /* stockage refusé */ }
    }

    // --- PKCE : un secret fabriqué à la volée, jamais écrit dans la page ---
    function auHasard(n) {
        const octets = new Uint8Array(n);
        crypto.getRandomValues(octets);
        return base64Url(octets);
    }
    function base64Url(octets) {
        let s = '';
        new Uint8Array(octets).forEach(o => { s += String.fromCharCode(o); });
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    async function empreinte(verifieur) {
        const somme = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifieur));
        return base64Url(somme);
    }

    const adresseRetour = () => location.origin + location.pathname;

    // Les fichiers importables : Dropbox rend tout, on ne montre pas le reste
    const EXTENSIONS = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|mp3|wav|ogg|mp4|webm|mov|txt|md|csv|docx|odt)$/i;

    const dropbox = {
        cle: 'dropbox', nom: 'Dropbox', icone: '📦',
        jeton: null,

        dispo: () => enLigne && !!reglages.appKey && !!jetonMemorise(),
        raison() {
            if (!enLigne) {
                return "Dropbox demande une adresse en http(s) : ouvert depuis un dossier (file://), "
                    + "il ne peut pas fonctionner. Utilisez « Mon ordinateur ».";
            }
            return "Dropbox n'est pas encore relié à ce navigateur.";
        },
        racine: () => ({ id: '', nom: 'Dropbox' }),

        // --- La connexion, en deux temps : on part chez Dropbox, on revient
        //     avec un code, on l'échange contre un jeton. ---
        async terminerRetour() {
            const params = new URLSearchParams(location.search);
            const code = params.get('code');
            let verifieur = null;
            try { verifieur = sessionStorage.getItem('board_dropbox_pkce'); } catch (e) { /* stockage refusé */ }
            if (!code || !verifieur) return false;

            // On nettoie l'adresse tout de suite : un code ne sert qu'une fois
            history.replaceState(null, '', adresseRetour());
            try { sessionStorage.removeItem('board_dropbox_pkce'); } catch (e) { /* stockage refusé */ }

            const corps = new URLSearchParams({
                code, grant_type: 'authorization_code',
                client_id: reglages.appKey,
                code_verifier: verifieur,
                redirect_uri: adresseRetour()
            });
            const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: corps
            });
            if (!r.ok) return false;
            const data = await r.json();
            if (!data.access_token) return false;
            memoriserJeton(data.access_token, parseInt(data.expires_in, 10));
            this.jeton = data.access_token;
            return true;
        },

        async connecter() {
            if (!this.jeton) this.jeton = jetonMemorise();
            if (this.jeton) return true;

            const verifieur = auHasard(48);
            try { sessionStorage.setItem('board_dropbox_pkce', verifieur); } catch (e) { /* stockage refusé */ }
            const defi = await empreinte(verifieur);
            const url = 'https://www.dropbox.com/oauth2/authorize?'
                + new URLSearchParams({
                    client_id: reglages.appKey,
                    response_type: 'code',
                    code_challenge: defi,
                    code_challenge_method: 'S256',
                    token_access_type: 'online',
                    redirect_uri: adresseRetour()
                });
            location.href = url;                 // on quitte la page, on reviendra
            throw new Error('Redirection vers Dropbox…');
        },

        async appeler(url, options) {
            await this.connecter();
            const poser = () => Object.assign({}, options, {
                headers: Object.assign({ Authorization: 'Bearer ' + this.jeton }, (options && options.headers) || {})
            });
            let r = await fetch(url, poser());
            if (r.status === 401) {              // jeton périmé : on repart en connexion
                oublierJeton();
                this.jeton = null;
                await this.connecter();
                r = await fetch(url, poser());
            }
            return r;
        },

        async lister(dossier) {
            const r = await this.appeler('https://api.dropboxapi.com/2/files/list_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dossier || '', limit: 500 })
            });
            if (!r.ok) {
                const err = await r.text();
                throw new Error(err.slice(0, 120) || 'Lecture du dossier impossible');
            }
            const data = await r.json();
            return (data.entries || [])
                .filter(e => e['.tag'] === 'folder' || EXTENSIONS.test(e.name))
                .map(e => ({
                    id: e.path_lower,
                    nom: e.name,
                    dossier: e['.tag'] === 'folder',
                    type: '',
                    taille: e.size || 0,
                    date: e.server_modified ? Date.parse(e.server_modified) : 0,
                    vignette: e['.tag'] === 'file' && /\.(png|jpe?g|gif|webp|bmp)$/i.test(e.name) ? e.path_lower : null
                }));
        },

        async telecharger(fichier) {
            const r = await this.appeler('https://content.dropboxapi.com/2/files/download', {
                method: 'POST',
                headers: { 'Dropbox-API-Arg': JSON.stringify({ path: fichier.id }) }
            });
            if (!r.ok) throw new Error('Téléchargement impossible');
            const blob = await r.blob();
            return new File([blob], fichier.nom, { type: blob.type });
        },

        async apercu(fichier) {
            if (!fichier.vignette) return null;
            try {
                const r = await this.appeler('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
                    method: 'POST',
                    headers: {
                        'Dropbox-API-Arg': JSON.stringify({
                            resource: { '.tag': 'path', path: fichier.vignette },
                            size: 'w256h256'
                        })
                    }
                });
                if (!r.ok) return null;
                return URL.createObjectURL(await r.blob());
            } catch (e) { return null; }
        },

        // Le formulaire tant que la source n'est pas reliée
        configurer(zone, fait) {
            if (!enLigne) {
                zone.innerHTML = '<div class="exp-message">' + this.raison() + '</div>';
                return;
            }
            zone.innerHTML = `
                <div class="exp-reglage">
                    <h4>Relier votre Dropbox</h4>
                    <p>Cette clé identifie <b>l'application</b>, pas votre compte : chacun se connecte
                       ensuite à son propre Dropbox et ne voit que ses fichiers.</p>

                    <label for="db-key">Clé d'application (App key)</label>
                    <input id="db-key" type="text" spellcheck="false" autocomplete="off"
                           placeholder="abcd1234efgh567"
                           value="${(reglages.appKey || '').replace(/"/g, '&quot;')}">
                    <small>Sur <b>dropbox.com/developers/apps</b> : créez une app « Scoped access » →
                           « Full Dropbox », puis relevez l'<b>App key</b>. Ne recopiez jamais l'App secret,
                           il n'a pas sa place dans une page web et n'est pas nécessaire ici.</small>

                    <small>Dans l'onglet <b>Settings</b> de l'app, ajoutez cette adresse aux
                           <b>Redirect URIs</b> :<br><code>${adresseRetour()}</code><br>
                           Dans l'onglet <b>Permissions</b>, cochez <code>files.metadata.read</code> et
                           <code>files.content.read</code>, puis <b>Submit</b>.</small>

                    <div class="exp-reglage-actions">
                        <button id="db-relier" class="exp-bouton exp-bouton-fort">Se connecter à Dropbox</button>
                        ${reglages.appKey ? '<button id="db-oublier" class="exp-bouton">Oublier cette clé</button>' : ''}
                    </div>
                    <div id="db-retour" class="exp-reglage-retour"></div>
                </div>`;

            const dire = (t, erreur) => {
                const d = zone.querySelector('#db-retour');
                d.textContent = t;
                d.className = 'exp-reglage-retour' + (erreur ? ' erreur' : '');
            };

            const oubli = zone.querySelector('#db-oublier');
            if (oubli) oubli.addEventListener('click', () => {
                reglages.appKey = '';
                retenirReglages();
                oublierJeton();
                this.jeton = null;
                this.configurer(zone, fait);
            });

            zone.querySelector('#db-relier').addEventListener('click', async () => {
                const cle = zone.querySelector('#db-key').value.trim();
                if (!cle) { return dire("Il manque la clé d'application.", true); }
                reglages.appKey = cle;
                retenirReglages();
                dire('Ouverture de Dropbox…');
                try { await this.connecter(); if (typeof fait === 'function') fait(); }
                catch (e) { /* la page part chez Dropbox */ }
            });
        }
    };

    if (window.Explorateur) window.Explorateur.enregistrer(dropbox);
    window.NuageDropbox = dropbox;

    // Au retour de Dropbox, on échange le code contre un jeton et on rouvre
    // l'explorateur sur la source : l'enseignant reprend où il en était.
    if (enLigne && /[?&]code=/.test(location.search)) {
        document.addEventListener('DOMContentLoaded', () => {
            dropbox.terminerRetour().then(ok => {
                if (ok && typeof window.ouvrirExplorateur === 'function') window.ouvrirExplorateur('dropbox');
            }).catch(() => { /* code périmé : on ne dérange pas */ });
        });
    }
})();
