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

    // ===================================================
    // L'EXPLORATEUR : UNE FENÊTRE DÉPLAÇABLE, DEUX SOURCES
    // À gauche, d'où vient le fichier : l'ordinateur ou le nuage. À droite,
    // ce qu'on y trouve. La fenêtre se déplace comme les autres outils du
    // tableau — on garde le tableau sous les yeux pendant qu'on cherche.
    // ===================================================
    let fournisseur = null;
    let chemin = [];
    let source = 'ordi';          // 'ordi' ou 'drive'

    const el = (id) => document.getElementById(id);

    function construireFenetre() {
        if (el('explorateur')) return;
        const f = document.createElement('div');
        f.id = 'explorateur';
        f.style.cssText = 'position:fixed; top:80px; left:140px; width:660px; max-width:94vw; height:460px;'
            + 'max-height:84vh; background:#fff; border:1px solid #dfe6e9; border-radius:14px;'
            + 'box-shadow:0 18px 46px rgba(0,0,0,0.25); z-index:100000; display:none; flex-direction:column;'
            + 'overflow:hidden; font-family:sans-serif;';
        f.innerHTML = `
            <div id="exp-entete" style="display:flex; align-items:center; gap:10px; padding:11px 14px;
                 background:#2d3436; color:#fff; cursor:grab; user-select:none;">
                <b style="flex:1; font-size:14px;">🗂️ Ouvrir un fichier</b>
                <button id="exp-fermer" title="Fermer"
                    style="background:none; border:none; color:#ff7675; font-size:17px; cursor:pointer; line-height:1;">✕</button>
            </div>
            <div style="display:flex; flex:1; min-height:0;">
                <div id="exp-sources" style="width:156px; border-right:1px solid #eef1f2; background:#f8f9fa;
                     padding:10px 8px; display:flex; flex-direction:column; gap:6px;"></div>
                <div style="flex:1; display:flex; flex-direction:column; min-width:0;">
                    <div id="exp-barre" style="display:flex; align-items:center; gap:8px; padding:9px 12px;
                         border-bottom:1px solid #eef1f2; min-height:24px;"></div>
                    <div id="exp-corps" style="flex:1; overflow-y:auto;"></div>
                </div>
            </div>`;
        document.body.appendChild(f);

        // La fenêtre se déplace par son bandeau, sans jamais sortir de l'écran
        const entete = el('exp-entete');
        let glisse = false, dx = 0, dy = 0;
        entete.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            glisse = true; dx = e.clientX - f.offsetLeft; dy = e.clientY - f.offsetTop;
            entete.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!glisse) return;
            f.style.left = Math.max(0, Math.min(window.innerWidth - 220, e.clientX - dx)) + 'px';
            f.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dy)) + 'px';
        });
        window.addEventListener('mouseup', () => { glisse = false; entete.style.cursor = 'grab'; });

        el('exp-fermer').addEventListener('click', fermer);

        // Glisser un fichier DANS la fenêtre revient à l'ouvrir
        f.addEventListener('dragover', (e) => { e.preventDefault(); f.style.outline = '2px dashed #0984e3'; });
        f.addEventListener('dragleave', () => { f.style.outline = ''; });
        f.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            f.style.outline = '';
            const fichiers = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
            if (fichiers.length) { remettreALApplication(fichiers); fermer(); }
        });

        rendreSources();
    }

    function rendreSources() {
        const zone = el('exp-sources');
        const choix = [
            { cle: 'ordi', icone: '💻', nom: 'Mon ordinateur', dispo: true },
            { cle: 'drive', icone: '☁️', nom: 'Google Drive', dispo: !!(enLigne && clientId) }
        ];
        zone.innerHTML = '';
        choix.forEach(c => {
            const b = document.createElement('button');
            b.className = 'exp-source';
            b.dataset.source = c.cle;
            b.style.cssText = 'display:flex; align-items:center; gap:9px; padding:10px 11px; border-radius:9px;'
                + 'border:none; text-align:left; font-size:13px; font-weight:600; cursor:pointer;'
                + 'background:' + (source === c.cle ? '#e8e3ff' : 'transparent')
                + '; color:' + (source === c.cle ? '#6c5ce7' : '#2d3436')
                + '; opacity:' + (c.dispo ? '1' : '0.5') + ';';
            b.innerHTML = `<span style="font-size:17px;">${c.icone}</span><span>${c.nom}</span>`;
            b.addEventListener('click', () => { source = c.cle; rendreSources(); rendrePanneau(); });
            zone.appendChild(b);
        });
        const aide = document.createElement('div');
        aide.style.cssText = 'margin-top:auto; font-size:10px; color:#b2bec3; line-height:1.45; padding:8px 4px;';
        aide.innerHTML = 'Images, PDF, sons, vidéos,<br>Word, LibreOffice, texte.';
        zone.appendChild(aide);
    }

    function message(texte, couleur) {
        el('exp-corps').innerHTML = `<div style="padding:30px 26px; text-align:center; color:${couleur || '#636e72'};
            font-size:13px; line-height:1.6; word-break:break-word;">${texte}</div>`;
    }

    function rendrePanneau() {
        if (source === 'ordi') return panneauOrdinateur();
        panneauDrive();
    }

    // --- L'ordinateur ---
    function panneauOrdinateur() {
        el('exp-barre').innerHTML = `<span style="font-size:12px; color:#636e72;">Depuis cet ordinateur</span>`;
        el('exp-corps').innerHTML = `
            <div id="exp-depot" style="margin:18px; height:calc(100% - 40px); min-height:180px; border:2px dashed #b2bec3;
                 border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center;
                 gap:10px; color:#636e72; cursor:pointer; text-align:center; padding:16px;">
                <div style="font-size:34px;">📥</div>
                <div style="font-size:14px; font-weight:600; color:#2d3436;">Glissez un fichier ici</div>
                <div style="font-size:12px;">ou</div>
                <button id="exp-parcourir" style="border:none; background:#0984e3; color:#fff; border-radius:8px;
                        padding:9px 16px; font-size:13px; font-weight:600; cursor:pointer;">Parcourir mes fichiers…</button>
            </div>`;
        const depot = el('exp-depot');
        const ouvrirDialogue = () => {
            const entree = document.getElementById('pdf-loader');
            if (entree) entree.click();
            fermer();
        };
        depot.addEventListener('click', ouvrirDialogue);
        el('exp-parcourir').addEventListener('click', (e) => { e.stopPropagation(); ouvrirDialogue(); });
    }

    // --- Le nuage ---
    function panneauDrive() {
        const barre = el('exp-barre');
        if (!enLigne || !clientId) {
            barre.innerHTML = `<span style="font-size:12px; color:#636e72;">Google Drive</span>`;
            message(!clientId
                ? "Google Drive n'est pas configuré sur cette installation."
                : "Google Drive demande une adresse en http(s) : ouvert depuis un dossier (file://), "
                  + "il ne peut pas fonctionner. Utilisez « Mon ordinateur ».");
            return;
        }
        if (!fournisseur) fournisseur = new FournisseurDrive(clientId);
        if (!chemin.length) chemin = [{ id: 'root', nom: 'Mon Drive' }];

        barre.innerHTML = '';
        if (chemin.length > 1) {
            const retour = document.createElement('button');
            retour.id = 'exp-retour';
            retour.style.cssText = 'border:1px solid #dfe6e9; background:#fff; border-radius:7px; padding:4px 9px;'
                + 'font-size:12px; cursor:pointer;';
            retour.innerText = '← Retour';
            retour.addEventListener('click', remonter);
            barre.appendChild(retour);
        }
        const fil = document.createElement('span');
        fil.id = 'exp-chemin';
        fil.style.cssText = 'flex:1; font-size:12px; color:#636e72; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        fil.innerText = chemin.map(c => c.nom).join(' › ');
        barre.appendChild(fil);
        charger();
    }

    // Le type annoncé par Drive est parfois vague : le nom du fichier tranche.
    function icone(f) {
        const nom = (f.nom || '').toLowerCase();
        const type = f.type || '';
        if (f.dossier) return '📁';
        if (/^image\//.test(type) || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(nom)) return '🖼️';
        if (type === 'application/pdf' || /\.pdf$/.test(nom)) return '📕';
        if (/^audio\//.test(type) || /\.(mp3|wav|ogg|m4a|aac)$/.test(nom)) return '🎵';
        if (/^video\//.test(type) || /\.(mp4|webm|mov|m4v)$/.test(nom)) return '🎬';
        if (/wordprocessing|opendocument\.text|google-apps\.document/.test(type) || /\.(docx|odt)$/.test(nom)) return '📝';
        if (/spreadsheet|csv/.test(type) || /\.csv$/.test(nom)) return '📊';
        if (/presentation/.test(type)) return '📽️';
        if (/^text\//.test(type) || /\.(txt|md)$/.test(nom)) return '📃';
        return '📄';
    }

    function poidsLisible(octets) {
        if (!octets) return '';
        if (octets < 1024) return octets + ' o';
        if (octets < 1048576) return Math.round(octets / 1024) + ' Ko';
        return (octets / 1048576).toFixed(1).replace('.', ',') + ' Mo';
    }

    function afficher(fichiers) {
        const corps = el('exp-corps');
        if (!fichiers.length) return message('Ce dossier est vide.');
        corps.innerHTML = '';
        fichiers.forEach(f => {
            const utilisable = estImportable(f);
            const poids = poidsLisible(f.taille);
            const ligne = document.createElement('div');
            ligne.className = 'exp-ligne';
            ligne.style.cssText = 'display:flex; align-items:center; gap:14px; padding:11px 16px;'
                + 'border-bottom:1px solid #f1f2f6; transition:background 0.15s;'
                + 'cursor:' + (utilisable ? 'pointer' : 'default') + '; opacity:' + (utilisable ? '1' : '0.45') + ';';
            ligne.innerHTML = `
                <span style="font-size:22px; width:26px; text-align:center;">${icone(f)}</span>
                <span style="flex:1; min-width:0;">
                    <span style="display:block; font-size:13px; font-weight:600; color:#2d3436;
                          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.nom}</span>
                    <span style="display:block; font-size:11px; color:#95a5a6; margin-top:2px;">${
                        f.dossier ? 'Dossier' : (utilisable ? (poids || 'Fichier') : 'non pris en charge')}</span>
                </span>`;
            if (utilisable) {
                ligne.addEventListener('mouseenter', () => ligne.style.background = '#f5f3ff');
                ligne.addEventListener('mouseleave', () => ligne.style.background = '');
                ligne.addEventListener('click', () => f.dossier ? entrer(f) : choisir(f));
            }
            corps.appendChild(ligne);
        });
    }

    async function charger() {
        const courant = chemin[chemin.length - 1];
        message('Chargement…');
        try {
            afficher(await fournisseur.lister(courant.id));
        } catch (e) {
            message('Erreur : ' + e.message, '#d63031');
        }
    }

    function entrer(dossier) { chemin.push({ id: dossier.id, nom: dossier.nom }); panneauDrive(); }
    function remonter() { if (chemin.length > 1) { chemin.pop(); panneauDrive(); } }
    function fermer() { const f = el('explorateur'); if (f) f.style.display = 'none'; }

    // Les fichiers repartent par le chemin habituel : l'import PDF, image,
    // audio, vidéo et document est déjà écrit, on ne le refait pas.
    function remettreALApplication(fichiers) {
        const entree = document.getElementById('pdf-loader');
        if (!entree) throw new Error("L'import n'est pas disponible");
        const dt = new DataTransfer();
        fichiers.forEach(f => dt.items.add(f));
        entree.files = dt.files;
        entree.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function choisir(fichier) {
        message('Téléchargement de « ' + fichier.nom + ' »…');
        try {
            const f = await fournisseur.telecharger(fichier);
            fermer();
            remettreALApplication([f]);
            if (typeof showToast === 'function') showToast('« ' + fichier.nom + ' » importé depuis Drive');
        } catch (e) {
            message('Erreur : ' + e.message, '#d63031');
        }
    }

    // L'explorateur s'ouvre sur la dernière source utilisée, et sur
    // l'ordinateur tant que Drive n'est pas utilisable.
    function ouvrir(sourceVoulue) {
        construireFenetre();
        if (sourceVoulue) source = sourceVoulue;
        if (source === 'drive' && !(enLigne && clientId)) source = 'ordi';
        el('explorateur').style.display = 'flex';
        rendreSources();
        rendrePanneau();
    }

    // Le bouton du menu ouvre l'explorateur partout : « Mon ordinateur »
    // fonctionne même hors ligne, et Drive s'explique quand il ne peut pas.
    document.addEventListener('DOMContentLoaded', () => {
        const bouton = document.getElementById('btn-drive');
        if (!bouton) return;
        bouton.addEventListener('click', () => ouvrir());

        // La bibliothèque Google n'est chargée que là où elle peut servir
        if (enLigne && clientId && !document.getElementById('google-identity')) {
            const s = document.createElement('script');
            s.id = 'google-identity';
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.defer = true;
            document.head.appendChild(s);
        }
    });

    window.ouvrirExplorateur = ouvrir;
    window.ouvrirDrive = () => ouvrir('drive');
    window.driveDisponible = () => !!(enLigne && clientId);
    window.driveImportable = estImportable;      // utile aux tests et au diagnostic
})();
