// ============================================================
// L'EXPLORATEUR DE FICHIERS
// ============================================================
// Une fenêtre déplaçable, redimensionnable et réductible, avec à gauche les
// SOURCES et à droite ce qu'elles contiennent. L'ordinateur est toujours là ;
// les autres (Google Drive, et demain Dropbox ou Nextcloud) s'ajoutent en
// écrivant un « fournisseur » et en l'enregistrant :
//
//     Explorateur.enregistrer({
//         cle: 'dropbox', nom: 'Dropbox', icone: '📦',
//         dispo()        → true si la source peut servir ici,
//         raison()       → pourquoi elle ne peut pas (affiché tel quel),
//         racine()       → { id, nom } du dossier de départ,
//         lister(id)     → [{ id, nom, dossier, type, taille, date }]  (Promise)
//         telecharger(f) → un File  (Promise)
//         apercu(f)      → une URL d'image, ou null  (Promise, facultatif)
//     });
//
// Rien d'autre n'est demandé : la fenêtre, la navigation, la recherche, les
// aperçus et la remise du fichier à l'application sont écrits une seule fois,
// ici.
// ============================================================
(function () {
    'use strict';

    const CLE_ETAT = 'board_explorateur';
    const MIN_L = 460, MIN_H = 320;

    const etat = {
        x: 140, y: 80, w: 720, h: 500,
        vue: 'liste',        // 'liste', 'details', 'apercus' ou 'mosaique'
        tri: 'nom',          // 'nom', 'date', 'taille'
        source: 'ordi',
        reduite: false
    };
    try { Object.assign(etat, JSON.parse(localStorage.getItem(CLE_ETAT) || '{}')); } catch (e) { /* stockage refusé */ }
    function retenir() {
        try { localStorage.setItem(CLE_ETAT, JSON.stringify(etat)); } catch (e) { /* stockage refusé */ }
    }

    const fournisseurs = [];
    let chemin = [];             // fil d'Ariane de la source courante
    let fichiers = [];           // ce que la source a renvoyé
    let recherche = '';
    let apercus = null;          // observateur de visibilité pour les vignettes

    const el = (id) => document.getElementById(id);
    const courant = () => fournisseurs.find(f => f.cle === etat.source) || fournisseurs[0];

    // ---------------------------------------------------------
    // LA SOURCE « MON ORDINATEUR »
    // Les navigateurs récents savent ouvrir un dossier et le parcourir
    // (File System Access). Là où ce n'est pas possible, on retombe sur le
    // dépôt de fichiers et la fenêtre du système.
    // ---------------------------------------------------------
    const ordinateur = {
        cle: 'ordi', nom: 'Mon ordinateur', icone: '💻',
        dossierRacine: null,
        dispo: () => true,
        arborescencePossible: () => typeof window.showDirectoryPicker === 'function',
        racine() { return this.dossierRacine ? { id: this.dossierRacine, nom: this.dossierRacine.name } : null; },

        async choisirDossier() {
            const poignee = await window.showDirectoryPicker({ mode: 'read' });
            this.dossierRacine = poignee;
            return { id: poignee, nom: poignee.name };
        },

        async lister(poignee) {
            const res = [];
            for await (const [nom, entree] of poignee.entries()) {
                if (nom.startsWith('.')) continue;
                if (entree.kind === 'directory') { res.push({ id: entree, nom, dossier: true, type: '' }); continue; }
                let taille = 0, date = 0, type = '';
                try { const f = await entree.getFile(); taille = f.size; date = f.lastModified; type = f.type; } catch (e) { /* fichier illisible */ }
                res.push({ id: entree, nom, dossier: false, type, taille, date });
            }
            return res;
        },

        async telecharger(fichier) { return await fichier.id.getFile(); },

        async apercu(fichier) {
            if (!/^image\//.test(fichier.type || '')) return null;
            try { return URL.createObjectURL(await fichier.id.getFile()); } catch (e) { return null; }
        }
    };

    // ---------------------------------------------------------
    // CE QUE LE TABLEAU SAIT OUVRIR
    // ---------------------------------------------------------
    const TYPES_OK = /^(image\/|application\/pdf|audio\/|video\/|text\/)/;
    const EXT_OK = /\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf|mp3|wav|ogg|m4a|aac|mp4|webm|mov|m4v|txt|md|csv|docx|odt)$/i;

    function importable(f) {
        if (f.dossier) return true;
        if (f.converti) return true;                                  // documents Google & co
        if (/^application\/vnd\.google-apps\./.test(f.type || '')) return false;
        return TYPES_OK.test(f.type || '') || EXT_OK.test(f.nom || '')
            || f.type === 'application/octet-stream' || !f.type;
    }

    function icone(f) {
        const nom = (f.nom || '').toLowerCase(), type = f.type || '';
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

    function dateLisible(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    function echapper(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    // ---------------------------------------------------------
    // LA FENÊTRE
    // ---------------------------------------------------------
    function construire() {
        if (el('explorateur')) return;
        const f = document.createElement('div');
        f.id = 'explorateur';
        f.innerHTML = `
            <div id="exp-entete">
                <b id="exp-titre">🗂️ Ouvrir un fichier</b>
                <button id="exp-reduire" title="Réduire">—</button>
                <button id="exp-fermer" title="Fermer">✕</button>
            </div>
            <div id="exp-contenu">
                <div id="exp-sources"></div>
                <div id="exp-droite">
                    <div id="exp-barre"></div>
                    <div id="exp-corps"></div>
                </div>
            </div>
            <div id="exp-poignee" title="Redimensionner"></div>`;
        document.body.appendChild(f);
        appliquerGeometrie();

        deplacer(f, el('exp-entete'));
        redimensionner(f, el('exp-poignee'));

        el('exp-fermer').addEventListener('click', fermer);
        el('exp-reduire').addEventListener('click', () => { etat.reduite = !etat.reduite; appliquerGeometrie(); retenir(); });

        // Glisser un fichier DANS la fenêtre revient à l'ouvrir
        f.addEventListener('dragover', (e) => { e.preventDefault(); f.classList.add('exp-survol'); });
        f.addEventListener('dragleave', () => f.classList.remove('exp-survol'));
        f.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            f.classList.remove('exp-survol');
            const liste = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
            if (liste.length) { remettre(liste); fermer(); }
        });
    }

    function appliquerGeometrie() {
        const f = el('explorateur');
        if (!f) return;
        etat.w = Math.max(MIN_L, Math.min(etat.w, window.innerWidth - 20));
        etat.h = Math.max(MIN_H, Math.min(etat.h, window.innerHeight - 20));
        etat.x = Math.max(0, Math.min(etat.x, window.innerWidth - 240));
        etat.y = Math.max(0, Math.min(etat.y, window.innerHeight - 60));
        f.style.left = etat.x + 'px';
        f.style.top = etat.y + 'px';
        f.style.width = etat.w + 'px';
        f.style.height = etat.reduite ? 'auto' : etat.h + 'px';
        f.classList.toggle('exp-reduite', !!etat.reduite);
        el('exp-reduire').innerText = etat.reduite ? '▢' : '—';
        el('exp-reduire').title = etat.reduite ? 'Agrandir' : 'Réduire';
    }

    function deplacer(fenetre, poignee) {
        let actif = false, dx = 0, dy = 0;
        poignee.addEventListener('pointerdown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            actif = true; dx = e.clientX - fenetre.offsetLeft; dy = e.clientY - fenetre.offsetTop;
            poignee.setPointerCapture(e.pointerId);
        });
        poignee.addEventListener('pointermove', (e) => {
            if (!actif) return;
            etat.x = e.clientX - dx; etat.y = e.clientY - dy;
            appliquerGeometrie();
        });
        const fin = () => { if (actif) { actif = false; retenir(); } };
        poignee.addEventListener('pointerup', fin);
        poignee.addEventListener('pointercancel', fin);
    }

    function redimensionner(fenetre, poignee) {
        let actif = false, x0 = 0, y0 = 0, l0 = 0, h0 = 0;
        poignee.addEventListener('pointerdown', (e) => {
            actif = true; x0 = e.clientX; y0 = e.clientY; l0 = fenetre.offsetWidth; h0 = fenetre.offsetHeight;
            poignee.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        poignee.addEventListener('pointermove', (e) => {
            if (!actif) return;
            etat.reduite = false;
            etat.w = l0 + (e.clientX - x0);
            etat.h = h0 + (e.clientY - y0);
            appliquerGeometrie();
        });
        const fin = () => { if (actif) { actif = false; retenir(); rendreCorps(); } };
        poignee.addEventListener('pointerup', fin);
        poignee.addEventListener('pointercancel', fin);
    }

    function fermer() {
        const f = el('explorateur');
        if (f) f.style.display = 'none';
        retenir();
        if (apercus) { apercus.disconnect(); apercus = null; }
    }

    // ---------------------------------------------------------
    // LES SOURCES
    // ---------------------------------------------------------
    function rendreSources() {
        const zone = el('exp-sources');
        zone.innerHTML = '';
        fournisseurs.forEach(f => {
            const dispo = f.dispo();
            const b = document.createElement('button');
            b.className = 'exp-source' + (etat.source === f.cle ? ' actif' : '') + (dispo ? '' : ' indispo');
            b.dataset.source = f.cle;
            b.innerHTML = `<span class="exp-source-icone">${f.icone}</span><span>${echapper(f.nom)}</span>`;
            b.addEventListener('click', () => allerA(f.cle));
            zone.appendChild(b);
        });
        const aide = document.createElement('div');
        aide.className = 'exp-aide';
        aide.innerHTML = 'Images, PDF, sons, vidéos,<br>Word, LibreOffice, texte.';
        zone.appendChild(aide);
    }

    async function allerA(cle) {
        etat.source = cle;
        retenir();
        chemin = [];
        recherche = '';
        rendreSources();
        await ouvrirRacine();
    }

    async function ouvrirRacine() {
        const source = courant();
        if (!source) return;
        if (!source.dispo()) { rendreBarre(); return message(source.raison ? source.raison() : 'Source indisponible.'); }
        const racine = await source.racine();
        if (!racine) { rendreBarre(); return rendreAccueilOrdinateur(); }
        chemin = [racine];
        await charger();
    }

    // ---------------------------------------------------------
    // LA BARRE : retour, chemin, recherche, tri, vue
    // ---------------------------------------------------------
    function rendreBarre() {
        const barre = el('exp-barre');
        const dansUnDossier = chemin.length > 0;
        barre.innerHTML = `
            ${chemin.length > 1 ? '<button id="exp-retour" class="exp-bouton">← Retour</button>' : ''}
            <span id="exp-chemin">${chemin.map(c => echapper(c.nom)).join(' › ') || echapper(courant() ? courant().nom : '')}</span>
            ${dansUnDossier ? `
                <input id="exp-recherche" type="search" placeholder="Rechercher…" value="${echapper(recherche)}">
                <select id="exp-tri" title="Trier">
                    <option value="nom">Nom</option>
                    <option value="date">Date</option>
                    <option value="taille">Taille</option>
                </select>
                <button id="exp-vue" class="exp-bouton" title="Présentation : ${VUES[etat.vue].nom} (cliquer pour changer)">${VUES[etat.vue].icone}</button>` : ''}`;

        if (el('exp-retour')) el('exp-retour').addEventListener('click', remonter);
        const rech = el('exp-recherche');
        if (rech) rech.addEventListener('input', () => { recherche = rech.value; rendreCorps(); });
        const tri = el('exp-tri');
        if (tri) {
            tri.value = etat.tri;
            tri.addEventListener('change', () => { etat.tri = tri.value; retenir(); rendreCorps(); });
        }
        const vue = el('exp-vue');
        if (vue) vue.addEventListener('click', () => {
            const ordre = Object.keys(VUES);
            etat.vue = ordre[(ordre.indexOf(etat.vue) + 1) % ordre.length];
            retenir(); rendreBarre(); rendreCorps();
            if (typeof showToast === 'function') showToast('Présentation : ' + VUES[etat.vue].nom);
        });
    }

    // Quatre façons de regarder un dossier : la liste sobre, le tableau
    // détaillé, les aperçus, et la mosaïque pour choisir une image à l'œil.
    const VUES = {
        liste:    { nom: 'Liste', icone: '☰', classe: '' },
        details:  { nom: 'Détails', icone: '▤', classe: 'exp-details' },
        apercus:  { nom: 'Aperçus', icone: '▦', classe: 'exp-grille' },
        mosaique: { nom: 'Mosaïque', icone: '⬛', classe: 'exp-grille exp-mosaique' }
    };

    function message(texte, couleur) {
        el('exp-corps').innerHTML = `<div class="exp-message" ${couleur ? `style="color:${couleur}"` : ''}>${texte}</div>`;
    }

    // ---------------------------------------------------------
    // L'ACCUEIL DE L'ORDINATEUR : dépôt, parcourir, ouvrir un dossier
    // ---------------------------------------------------------
    function rendreAccueilOrdinateur() {
        const arbre = ordinateur.arborescencePossible();
        el('exp-corps').innerHTML = `
            <div id="exp-depot">
                <div class="exp-depot-icone">📥</div>
                <div class="exp-depot-titre">Glissez un fichier ici</div>
                <div class="exp-depot-ou">ou</div>
                <div class="exp-depot-boutons">
                    <button id="exp-parcourir" class="exp-primaire">Parcourir mes fichiers…</button>
                    ${arbre ? '<button id="exp-dossier" class="exp-bouton">📂 Ouvrir un dossier</button>' : ''}
                </div>
                <div class="exp-depot-note">${arbre
                    ? "Ouvrir un dossier permet de le parcourir ici, sans repasser par la fenêtre du système."
                    : "Ce navigateur ne sait pas parcourir un dossier dans la page : la fenêtre du système s'ouvrira."}</div>
            </div>`;
        el('exp-parcourir').addEventListener('click', () => {
            const entree = document.getElementById('pdf-loader');
            if (entree) entree.click();
            fermer();
        });
        if (el('exp-dossier')) el('exp-dossier').addEventListener('click', async () => {
            try {
                const racine = await ordinateur.choisirDossier();
                chemin = [racine];
                await charger();
            } catch (e) { /* l'enseignant a annulé */ }
        });
    }

    // ---------------------------------------------------------
    // LA LISTE
    // ---------------------------------------------------------
    async function charger() {
        rendreBarre();
        message('Chargement…');
        try {
            fichiers = await courant().lister(chemin[chemin.length - 1].id);
            rendreCorps();
        } catch (e) {
            message('Erreur : ' + echapper(e.message || e), '#d63031');
        }
    }

    function trier(liste) {
        const cle = etat.tri;
        return liste.slice().sort((a, b) => {
            if (a.dossier !== b.dossier) return a.dossier ? -1 : 1;
            if (cle === 'date') return (b.date || 0) - (a.date || 0);
            if (cle === 'taille') return (b.taille || 0) - (a.taille || 0);
            return String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true });
        });
    }

    function rendreCorps() {
        if (!chemin.length) return;
        const corps = el('exp-corps');
        const filtre = recherche.trim().toLowerCase();
        const liste = trier(fichiers.filter(f => !filtre || String(f.nom).toLowerCase().includes(filtre)));

        if (!liste.length) return message(filtre ? 'Aucun fichier ne porte ce nom.' : 'Ce dossier est vide.');

        corps.innerHTML = '';
        corps.className = (VUES[etat.vue] || VUES.liste).classe;
        if (etat.vue === 'details') corps.appendChild(enteteDetails());
        liste.forEach(f => corps.appendChild(
            etat.vue === 'apercus' || etat.vue === 'mosaique' ? carte(f)
                : etat.vue === 'details' ? ligneDetaillee(f) : ligne(f)));
        observerApercus();
    }

    function meta(f) {
        if (f.dossier) return 'Dossier';
        if (!importable(f)) return 'non pris en charge';
        return [poidsLisible(f.taille), dateLisible(f.date)].filter(Boolean).join(' · ') || 'Fichier';
    }

    function brancher(element, f) {
        if (!importable(f)) { element.classList.add('exp-inactif'); return element; }
        element.addEventListener('click', () => f.dossier ? entrer(f) : choisir(f));
        return element;
    }

    function ligne(f) {
        const d = document.createElement('div');
        d.className = 'exp-ligne';
        d.dataset.apercu = (!f.dossier && importable(f)) ? '1' : '';
        d.innerHTML = `
            <span class="exp-vignette">${icone(f)}</span>
            <span class="exp-infos">
                <span class="exp-nom">${echapper(f.nom)}</span>
                <span class="exp-meta">${meta(f)}</span>
            </span>`;
        d._fichier = f;
        return brancher(d, f);
    }

    // La vue « détails » : un vrai tableau, une colonne par renseignement.
    function enteteDetails() {
        const d = document.createElement('div');
        d.className = 'exp-detail exp-detail-entete';
        d.innerHTML = '<span></span><span>Nom</span><span>Type</span><span>Taille</span><span>Modifié</span>';
        return d;
    }

    function nature(f) {
        if (f.dossier) return 'Dossier';
        const n = (f.nom || '').toLowerCase();
        const ext = n.includes('.') ? n.split('.').pop() : '';
        if (/^image\//.test(f.type || '') || /^(png|jpe?g|gif|webp|svg|bmp|avif)$/.test(ext)) return 'Image';
        if (/pdf/.test(f.type || '') || ext === 'pdf') return 'PDF';
        if (/^audio\//.test(f.type || '') || /^(mp3|wav|ogg|m4a|aac)$/.test(ext)) return 'Son';
        if (/^video\//.test(f.type || '') || /^(mp4|webm|mov|m4v)$/.test(ext)) return 'Vidéo';
        if (/wordprocessing|opendocument\.text|google-apps\.document/.test(f.type || '') || /^(docx|odt)$/.test(ext)) return 'Document';
        if (/spreadsheet|csv/.test(f.type || '') || ext === 'csv') return 'Tableur';
        if (/presentation/.test(f.type || '')) return 'Présentation';
        if (/^text\//.test(f.type || '') || /^(txt|md)$/.test(ext)) return 'Texte';
        return ext ? ext.toUpperCase() : 'Fichier';
    }

    function ligneDetaillee(f) {
        const d = document.createElement('div');
        d.className = 'exp-detail';
        d.dataset.apercu = (!f.dossier && importable(f)) ? '1' : '';
        d.innerHTML = `
            <span class="exp-vignette">${icone(f)}</span>
            <span class="exp-nom">${echapper(f.nom)}</span>
            <span class="exp-colonne">${importable(f) ? nature(f) : 'non pris en charge'}</span>
            <span class="exp-colonne">${f.dossier ? '' : poidsLisible(f.taille)}</span>
            <span class="exp-colonne">${dateLisible(f.date)}</span>`;
        d._fichier = f;
        return brancher(d, f);
    }

    function carte(f) {
        const d = document.createElement('div');
        d.className = 'exp-carte';
        d.dataset.apercu = (!f.dossier && importable(f)) ? '1' : '';
        d.innerHTML = `
            <div class="exp-carte-image"><span class="exp-vignette">${icone(f)}</span></div>
            <div class="exp-nom">${echapper(f.nom)}</div>
            <div class="exp-meta">${meta(f)}</div>`;
        d._fichier = f;
        return brancher(d, f);
    }

    // Les aperçus ne se chargent que pour ce qui est à l'écran : une classe
    // entière de photos ne doit pas partir en téléchargement d'un coup.
    function observerApercus() {
        if (apercus) apercus.disconnect();
        const source = courant();
        if (!source || typeof source.apercu !== 'function' || typeof IntersectionObserver !== 'function') return;

        apercus = new IntersectionObserver((entrees) => {
            entrees.forEach(async (e) => {
                if (!e.isIntersecting) return;
                const noeud = e.target;
                apercus.unobserve(noeud);
                const f = noeud._fichier;
                if (!f || !/^image\//.test(f.type || '') && !/\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(f.nom || '')) return;
                try {
                    const url = await source.apercu(f);
                    if (!url) return;
                    const cible = noeud.querySelector('.exp-vignette');
                    if (cible) cible.innerHTML = `<img src="${url}" alt="">`;
                } catch (err) { /* pas d'aperçu, ce n'est pas grave */ }
            });
        }, { root: el('exp-corps'), rootMargin: '120px' });

        el('exp-corps').querySelectorAll('[data-apercu="1"]').forEach(n => apercus.observe(n));
    }

    function entrer(dossier) { chemin.push({ id: dossier.id, nom: dossier.nom }); recherche = ''; charger(); }
    function remonter() { if (chemin.length > 1) { chemin.pop(); recherche = ''; charger(); } }

    // Les fichiers repartent par le chemin habituel de l'application : import
    // PDF, image, son, vidéo et document sont déjà écrits, on ne les refait pas.
    function remettre(liste) {
        const entree = document.getElementById('pdf-loader');
        if (!entree) throw new Error("L'import n'est pas disponible");
        const dt = new DataTransfer();
        liste.forEach(f => dt.items.add(f));
        entree.files = dt.files;
        entree.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function choisir(fichier) {
        message('Ouverture de « ' + echapper(fichier.nom) + ' »…');
        try {
            const f = await courant().telecharger(fichier);
            fermer();
            remettre([f]);
            if (typeof showToast === 'function') showToast('« ' + fichier.nom + ' » importé');
        } catch (e) {
            message('Erreur : ' + echapper(e.message || e), '#d63031');
        }
    }

    // ---------------------------------------------------------
    // OUVERTURE
    // ---------------------------------------------------------
    async function ouvrir(sourceVoulue) {
        construire();
        if (sourceVoulue) etat.source = sourceVoulue;
        if (!courant() || !courant().dispo()) etat.source = 'ordi';
        el('explorateur').style.display = 'flex';
        appliquerGeometrie();
        rendreSources();
        await ouvrirRacine();
    }

    window.Explorateur = {
        enregistrer(f) {
            if (!f || !f.cle) return;
            const i = fournisseurs.findIndex(x => x.cle === f.cle);
            if (i >= 0) fournisseurs[i] = f; else fournisseurs.push(f);
            if (el('explorateur')) rendreSources();
        },
        ouvrir,
        fermer,
        sources: () => fournisseurs.map(f => ({ cle: f.cle, nom: f.nom, dispo: f.dispo() })),
        importable,
        etat
    };
    window.ouvrirExplorateur = ouvrir;

    Explorateur.enregistrer(ordinateur);

    document.addEventListener('DOMContentLoaded', () => {
        ['btn-drive', 'btn-explorateur'].forEach(id => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => ouvrir());
        });
    });
})();
