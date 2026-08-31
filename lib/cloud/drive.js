// ===================================================
// OUVRIR UN FICHIER DEPUIS GOOGLE DRIVE
//
// Le sélecteur est volontairement séparé en deux : un « fournisseur » qui sait
// parler à Drive, et une fenêtre qui ne connaît que des dossiers et des
// fichiers. Pour ajouter Nextcloud ou OneDrive un jour, il suffira d'écrire un
// second fournisseur.
//
// Le fichier choisi est remis à l'application par le MÊME chemin qu'un fichier
// glissé depuis le bureau : on ne duplique ni l'import PDF, ni l'import image.
//
// Google exige une origine déclarée en http(s) : ouverte depuis un dossier
// (file://), l'application masque le bouton au lieu de promettre une porte qui
// ne s'ouvrira pas.
// ===================================================
(function () {
    'use strict';

    const enLigne = location.protocol === 'http:' || location.protocol === 'https:';
    const clientId = window.AUTABLEAU_DRIVE_CLIENT_ID || '';

    // Ce que le tableau sait poser. On ne se fie pas au seul type MIME : Drive
    // renvoie souvent « application/octet-stream » pour un .docx, et une pièce
    // jointe mal typée passait alors pour « non prise en charge ».
    const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const TYPES_ACCEPTES = /^(image\/|application\/pdf|audio\/|video\/|text\/)/;
    const EXTENSIONS_OK = /\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf|mp3|wav|ogg|m4a|aac|mp4|webm|mov|m4v|txt|md|csv|docx|odt)$/i;

    // Les documents Google ne sont pas des fichiers : Drive les convertit à la
    // volée dans un format que le tableau lit.
    const CONVERSIONS = {
        'application/vnd.google-apps.document': { mime: DOCX, ext: '.docx' },
        'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
        'application/vnd.google-apps.spreadsheet': { mime: 'text/csv', ext: '.csv' },
        'application/vnd.google-apps.drawing': { mime: 'image/png', ext: '.png' }
    };

    function estImportable(f) {
        if (f.dossier) return true;
        if (CONVERSIONS[f.type]) return true;
        if (/^application\/vnd\.google-apps\./.test(f.type)) return false;   // formulaires, raccourcis…
        return TYPES_ACCEPTES.test(f.type || '') || EXTENSIONS_OK.test(f.nom || '')
            || f.type === 'application/octet-stream' || !f.type;
    }

    // Google renvoie des codes bruts : on dit à l'enseignant (ou à celui qui
    // héberge le tableau) ce qu'il y a à faire, et surtout QUELLE origine
    // déclarer — c'est l'erreur la plus fréquente et la plus opaque.
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

    class FournisseurDrive {
        constructor(id) { this.clientId = id; this.jeton = null; }

        // Demande l'autorisation une seule fois par session
        connecter() {
            return new Promise((resolve, reject) => {
                if (this.jeton) return resolve(true);
                if (!window.google || !google.accounts || !google.accounts.oauth2) {
                    return reject(new Error("La bibliothèque Google n'est pas chargée."));
                }
                try {
                    const client = google.accounts.oauth2.initTokenClient({
                        client_id: this.clientId,
                        // Le périmètre le plus étroit qui permette de lire un fichier choisi
                        scope: 'https://www.googleapis.com/auth/drive.readonly',
                        callback: (reponse) => {
                            if (reponse.error) return reject(new Error(traduireErreur(reponse.error)));
                            this.jeton = reponse.access_token;
                            resolve(true);
                        },
                        error_callback: (err) => reject(new Error(traduireErreur((err && err.type) || 'popup_failed')))
                    });
                    client.requestAccessToken();
                } catch (e) {
                    reject(new Error("Connexion à Google impossible : " + e.message));
                }
            });
        }

        async lister(dossier = 'root') {
            await this.connecter();
            const requete = `'${dossier}' in parents and trashed = false`;
            const champs = 'files(id, name, mimeType, size)';
            const url = 'https://www.googleapis.com/drive/v3/files'
                + `?q=${encodeURIComponent(requete)}&fields=${encodeURIComponent(champs)}`
                + '&orderBy=folder,name&pageSize=200';

            const r = await fetch(url, { headers: { Authorization: 'Bearer ' + this.jeton } });
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
                taille: f.size ? parseInt(f.size, 10) : 0
            }));
        }

        async telecharger(fichier) {
            await this.connecter();
            const conv = CONVERSIONS[fichier.type];
            const url = conv
                ? `https://www.googleapis.com/drive/v3/files/${fichier.id}/export?mimeType=${encodeURIComponent(conv.mime)}`
                : `https://www.googleapis.com/drive/v3/files/${fichier.id}?alt=media`;
            const r = await fetch(url, { headers: { Authorization: 'Bearer ' + this.jeton } });
            if (!r.ok) throw new Error('Téléchargement impossible');
            const blob = await r.blob();
            const nom = conv && !new RegExp(conv.ext.replace('.', '\\.') + '$', 'i').test(fichier.nom)
                ? fichier.nom + conv.ext : fichier.nom;
            return new File([blob], nom, { type: conv ? conv.mime : (fichier.type || blob.type) });
        }
    }

    // --- La fenêtre ---
    let fournisseur = null;
    let chemin = [];

    function construireFenetre() {
        if (document.getElementById('drive-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'drive-overlay';
        overlay.className = 'modal-backdrop';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="modal-box" style="max-width:560px; width:92%; padding:0; overflow:hidden;">
                <div style="display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--border, #dfe6e9);">
                    <button id="drive-retour" class="btn-action secondary"
                        style="display:none; padding:5px 10px; font-size:12px;">← Retour</button>
                    <strong id="drive-titre" style="flex:1; font-size:15px;">Mon Drive</strong>
                    <button id="drive-fermer" class="btn-action secondary" style="padding:5px 10px;">✕</button>
                </div>
                <div id="drive-liste" style="max-height:52vh; overflow-y:auto;"></div>
            </div>`;
        document.body.appendChild(overlay);

        document.getElementById('drive-fermer').addEventListener('click', fermer);
        document.getElementById('drive-retour').addEventListener('click', remonter);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) fermer(); });
    }

    const listeEl = () => document.getElementById('drive-liste');

    function message(texte, couleur) {
        listeEl().innerHTML = `<div style="padding:26px; text-align:center; color:${couleur || '#636e72'};
            font-size:13px; line-height:1.5; word-break:break-word;">${texte}</div>`;
    }

    function icone(f) {
        if (f.dossier) return '📁';
        if (/^image\//.test(f.type)) return '🖼️';
        if (f.type === 'application/pdf') return '📕';
        if (/^audio\//.test(f.type)) return '🎵';
        if (/^video\//.test(f.type)) return '🎬';
        if (/google-apps/.test(f.type)) return '📝';
        return '📄';
    }

    function afficher(fichiers) {
        const el = listeEl();
        if (!fichiers.length) return message('Ce dossier est vide.');
        el.innerHTML = '';
        fichiers.forEach(f => {
            const utilisable = estImportable(f);
            const ligne = document.createElement('div');
            ligne.style.cssText = 'display:flex; align-items:center; gap:12px; padding:11px 18px;'
                + 'border-bottom:1px solid var(--border, #eef1f2); cursor:' + (utilisable ? 'pointer' : 'default')
                + '; opacity:' + (utilisable ? '1' : '0.45') + ';';
            const poids = f.taille ? (f.taille / 1048576).toFixed(1) + ' Mo' : '';
            ligne.innerHTML = `<span style="font-size:19px;">${icone(f)}</span>
                <span style="flex:1; font-size:13px; font-weight:600;">${f.nom}</span>
                <span style="font-size:11px; color:#b2bec3;">${f.dossier ? 'Dossier' : (utilisable ? poids : 'non pris en charge')}</span>`;
            if (utilisable) {
                ligne.addEventListener('mouseenter', () => ligne.style.background = 'rgba(108,92,231,0.07)');
                ligne.addEventListener('mouseleave', () => ligne.style.background = '');
                ligne.addEventListener('click', () => f.dossier ? entrer(f) : choisir(f));
            }
            el.appendChild(ligne);
        });
    }

    async function charger() {
        const courant = chemin[chemin.length - 1];
        document.getElementById('drive-titre').innerText = courant.nom;
        document.getElementById('drive-retour').style.display = chemin.length > 1 ? 'inline-block' : 'none';
        message('Chargement…');
        try {
            afficher(await fournisseur.lister(courant.id));
        } catch (e) {
            message('Erreur : ' + e.message, '#d63031');
        }
    }

    function entrer(dossier) { chemin.push({ id: dossier.id, nom: dossier.nom }); charger(); }
    function remonter() { if (chemin.length > 1) { chemin.pop(); charger(); } }
    function fermer() { const o = document.getElementById('drive-overlay'); if (o) o.style.display = 'none'; }

    // Le fichier repart par le chemin habituel : l'import PDF, image, audio et
    // vidéo est déjà écrit, on ne le refait pas.
    async function choisir(fichier) {
        message('Téléchargement de « ' + fichier.nom + ' »…');
        try {
            const f = await fournisseur.telecharger(fichier);
            fermer();
            const entree = document.getElementById('pdf-loader');
            if (!entree) throw new Error("L'import n'est pas disponible");
            const dt = new DataTransfer();
            dt.items.add(f);
            entree.files = dt.files;
            entree.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof showToast === 'function') showToast('« ' + fichier.nom +' » importé depuis Drive');
        } catch (e) {
            message('Erreur : ' + e.message, '#d63031');
        }
    }

    function ouvrir() {
        if (!clientId) {
            if (typeof showToast === 'function') showToast("Google Drive n'est pas configuré sur cette installation");
            return;
        }
        construireFenetre();
        document.getElementById('drive-overlay').style.display = 'flex';
        if (!fournisseur) fournisseur = new FournisseurDrive(clientId);
        if (!chemin.length) chemin = [{ id: 'root', nom: 'Mon Drive' }];
        charger();
    }

    // Le bouton n'apparaît que là où Drive peut fonctionner
    document.addEventListener('DOMContentLoaded', () => {
        const bouton = document.getElementById('btn-drive');
        if (!bouton) return;
        if (!enLigne || !clientId) { bouton.style.display = 'none'; return; }
        bouton.addEventListener('click', ouvrir);

        // La bibliothèque Google n'est chargée que si le bouton sert
        if (!document.getElementById('google-identity')) {
            const s = document.createElement('script');
            s.id = 'google-identity';
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.defer = true;
            document.head.appendChild(s);
        }
    });

    window.ouvrirDrive = ouvrir;
    window.driveDisponible = () => !!(enLigne && clientId);
    window.driveImportable = estImportable;      // utile aux tests et au diagnostic
})();
