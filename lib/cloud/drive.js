// ============================================================
// GOOGLE DRIVE, VU COMME UNE SOURCE DE L'EXPLORATEUR
// ============================================================
// Ce fichier ne connaît que Google : ouvrir une session, lister un dossier,
// télécharger un fichier, fournir une vignette. La fenêtre, la navigation et
// l'import sont écrits une seule fois dans explorateur.js — pour ajouter
// Dropbox ou Nextcloud, il suffit d'écrire le même petit objet et de
// l'enregistrer auprès de l'explorateur.
//
// Google exige une origine déclarée en http(s) : ouverte depuis un dossier
// (file://), la source s'annonce indisponible et dit pourquoi.
// ============================================================
(function () {
    'use strict';

    const enLigne = location.protocol === 'http:' || location.protocol === 'https:';
    const clientId = window.AUTABLEAU_DRIVE_CLIENT_ID || '';
    const CLE_JETON = 'board_drive_jeton';

    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // Un document Google n'est pas un fichier : Drive le convertit à la volée.
    const CONVERSIONS = {
        'application/vnd.google-apps.document': { mime: DOCX, ext: '.docx' },
        'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
        'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: '.csv' },
        'application/vnd.google-apps.drawing': { mime: 'image/png', ext: '.png' }
    };

    // Google renvoie des codes bruts : on dit ce qu'il y a à faire, et surtout
    // QUELLE origine déclarer — c'est l'erreur la plus fréquente et la plus opaque.
    function traduireErreur(code) {
        const c = String(code || '');
        if (/origin|redirect/i.test(c)) {
            return "Origine non autorisée par Google. Dans la console Google Cloud, ajoutez « "
                + location.origin + " » aux origines JavaScript autorisées de l'identifiant client "
                + "(Google refuse file:// : il faut une adresse http(s)).";
        }
        if (/popup_closed|popup_failed/i.test(c)) return "La fenêtre Google a été fermée avant la connexion.";
        if (/access_denied/i.test(c)) return "Accès refusé : le compte Google n'a pas autorisé la lecture de Drive.";
        return c;
    }

    // Le jeton vaut une heure. On le garde avec sa date de péremption : tant
    // qu'il est valide, on ne redemande rien — même après un rechargement de la
    // page. Ensuite Google le renouvelle sans réafficher le consentement.
    function jetonMemorise() {
        try {
            const m = JSON.parse(sessionStorage.getItem(CLE_JETON) || 'null');
            if (m && m.jeton && m.expire > Date.now() + 60000) return m.jeton;
        } catch (e) { /* stockage refusé */ }
        return null;
    }
    function memoriserJeton(jeton, duree) {
        try {
            sessionStorage.setItem(CLE_JETON, JSON.stringify({ jeton, expire: Date.now() + (duree || 3600) * 1000 }));
        } catch (e) { /* stockage refusé */ }
    }
    function oublierJeton() {
        try { sessionStorage.removeItem(CLE_JETON); } catch (e) { /* stockage refusé */ }
    }

    const drive = {
        cle: 'drive', nom: 'Google Drive', icone: '☁️',
        jeton: null,

        dispo: () => enLigne && !!clientId,
        raison() {
            if (!clientId) return "Google Drive n'est pas configuré sur cette installation.";
            return "Google Drive demande une adresse en http(s) : ouvert depuis un dossier (file://), "
                + "il ne peut pas fonctionner. Utilisez « Mon ordinateur ».";
        },
        racine: () => ({ id: 'root', nom: 'Mon Drive' }),

        connecter() {
            if (!this.jeton) this.jeton = jetonMemorise();
            if (this.jeton) return Promise.resolve(true);

            return new Promise((resolve, reject) => {
                if (!window.google || !google.accounts || !google.accounts.oauth2) {
                    return reject(new Error("La bibliothèque Google n'est pas chargée."));
                }
                try {
                    const client = google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        // Le périmètre le plus étroit qui permette de lire un fichier choisi
                        scope: 'https://www.googleapis.com/auth/drive.readonly',
                        callback: (r) => {
                            if (r.error) return reject(new Error(traduireErreur(r.error)));
                            this.jeton = r.access_token;
                            memoriserJeton(r.access_token, parseInt(r.expires_in, 10));
                            resolve(true);
                        },
                        error_callback: (err) => reject(new Error(traduireErreur((err && err.type) || 'popup_failed')))
                    });
                    // Sans « prompt », Google réutilise l'autorisation déjà donnée
                    // au lieu de réafficher l'écran de consentement.
                    client.requestAccessToken({ prompt: '' });
                } catch (e) {
                    reject(new Error("Connexion à Google impossible : " + e.message));
                }
            });
        },

        async appeler(url) {
            await this.connecter();
            let r = await fetch(url, { headers: { Authorization: 'Bearer ' + this.jeton } });
            if (r.status === 401) {                 // jeton périmé : on en redemande un
                oublierJeton();
                this.jeton = null;
                await this.connecter();
                r = await fetch(url, { headers: { Authorization: 'Bearer ' + this.jeton } });
            }
            return r;
        },

        async lister(dossier) {
            const requete = `'${dossier}' in parents and trashed = false`;
            const champs = 'files(id, name, mimeType, size, modifiedTime, thumbnailLink)';
            const url = 'https://www.googleapis.com/drive/v3/files'
                + `?q=${encodeURIComponent(requete)}&fields=${encodeURIComponent(champs)}`
                + '&orderBy=folder,name&pageSize=200';

            const r = await this.appeler(url);
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                throw new Error((err.error && err.error.message) || 'Lecture du dossier impossible');
            }
            const data = await r.json();
            return (data.files || []).map(f => ({
                id: f.id,
                nom: f.name,
                dossier: f.mimeType === 'application/vnd.google-apps.folder',
                type: f.mimeType,
                converti: !!CONVERSIONS[f.mimeType],
                taille: f.size ? parseInt(f.size, 10) : 0,
                date: f.modifiedTime ? Date.parse(f.modifiedTime) : 0,
                vignette: f.thumbnailLink || null
            }));
        },

        async telecharger(fichier) {
            const conv = CONVERSIONS[fichier.type];
            const url = conv
                ? `https://www.googleapis.com/drive/v3/files/${fichier.id}/export?mimeType=${encodeURIComponent(conv.mime)}`
                : `https://www.googleapis.com/drive/v3/files/${fichier.id}?alt=media`;
            const r = await this.appeler(url);
            if (!r.ok) throw new Error('Téléchargement impossible');
            const blob = await r.blob();
            const nom = conv && !new RegExp(conv.ext.replace('.', '\\.') + '$', 'i').test(fichier.nom)
                ? fichier.nom + conv.ext : fichier.nom;
            return new File([blob], nom, { type: conv ? conv.mime : (fichier.type || blob.type) });
        },

        // La vignette de Drive demande le jeton : on la récupère puis on en fait
        // une adresse locale, sinon l'image reste vide.
        async apercu(fichier) {
            if (!fichier.vignette) return null;
            try {
                const r = await this.appeler(fichier.vignette);
                if (!r.ok) return null;
                return URL.createObjectURL(await r.blob());
            } catch (e) { return null; }
        }
    };

    if (window.Explorateur) window.Explorateur.enregistrer(drive);
    window.driveDisponible = () => drive.dispo();
    window.ouvrirDrive = () => window.ouvrirExplorateur && window.ouvrirExplorateur('drive');

    // La bibliothèque Google n'est chargée que là où elle peut servir
    document.addEventListener('DOMContentLoaded', () => {
        if (!drive.dispo() || document.getElementById('google-identity')) return;
        const s = document.createElement('script');
        s.id = 'google-identity';
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    });
})();
