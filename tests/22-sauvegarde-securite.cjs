// LA SAUVEGARDE DE SÉCURITÉ.
// Tout le travail d'une année vit dans le stockage du navigateur : un
// « effacer les données de navigation » suffisait à le perdre. On désigne un
// dossier une fois, et une copie complète s'y écrit toute seule.
//
// Le sélecteur de dossier est une fenêtre du système : il ne s'automatise pas.
// On lui substitue un dossier de mensonge, qui note ce qu'on lui écrit comme le
// ferait le disque — c'est le CODE de la sauvegarde qu'on éprouve, pas le
// navigateur.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Le faux dossier, écrit en source pour traverser vers la page.
const FAUX_DOSSIER = `(nom) => {
    const fichiers = new Map();
    const handle = {
        name: nom, kind: 'directory', __fichiers: fichiers, __droit: 'granted',
        queryPermission: async () => handle.__droit,
        requestPermission: async () => { handle.__droit = 'granted'; return 'granted'; },
        getFileHandle: async (n, o) => {
            if (!fichiers.has(n)) { if (!o || !o.create) throw new Error('absent'); fichiers.set(n, ''); }
            return { name: n, createWritable: async () => ({
                write: async (c) => fichiers.set(n, c),
                close: async () => {}
            }) };
        },
        removeEntry: async (n) => { fichiers.delete(n); },
        values: async function* () { for (const n of Array.from(fichiers.keys())) yield { kind: 'file', name: n }; }
    };
    return handle;
}`;

const nomDuJour = () => {
    const d = new Date();
    const dd = n => (n < 10 ? '0' : '') + n;
    return `Au Tableau — ${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}.autableau`;
};

module.exports = async function (browser) {
    const r = creerRapport('Sauvegarde de sécurité');
    // C'est ICI qu'on veut le rappel : la suite l'éprouve.
    const { context, page, erreurs } = await ouvrirApp(browser, { rappelSauvegarde: true });
    await tableauVierge(page);

    // L'API existe-t-elle seulement là où l'application est faite pour vivre ?
    // Ouverte depuis un dossier, elle doit pouvoir écrire dans un dossier.
    const terrain = await page.evaluate(() => ({
        protocole: location.protocol,
        contexteSur: window.isSecureContext,
        disponible: typeof sauvegardeDeSecuriteDisponible === 'function' && sauvegardeDeSecuriteDisponible()
    }));
    r.egal('ouverte depuis un dossier, la sauvegarde est possible',
        { p: terrain.protocole, sur: terrain.contexteSur, dispo: terrain.disponible },
        { p: 'file:', sur: true, dispo: true });

    // --- LA COPIE S'ÉCRIT, ET ELLE CONTIENT TOUT ---
    const ecriture = await page.evaluate(async (src) => {
        dossierSecurite = eval(src)('Mes cours');
        window.__d = dossierSecurite;
        majLibelleDeLaSecurite();
        freehands.push({ id: nextId++, points: [{ x: 5, y: 5 }, { x: 80, y: 90 }], color: '#ff0055', width: 7, z: globalZ++ });
        saveState();
        await saveAppLocal(true);
        const ok = await ecrireLaSauvegardeDeSecurite(true);
        const noms = Array.from(dossierSecurite.__fichiers.keys());
        let lu = null;
        try { lu = JSON.parse(dossierSecurite.__fichiers.get(noms[0]) || 'null'); } catch (e) { lu = null; }
        const p = lu && lu.autoSave && lu.autoSave.pages && lu.autoSave.pages[0];
        return {
            ok, noms,
            libelle: document.getElementById('lib-dossier-securite').textContent,
            cles: lu ? Object.keys(lu).sort() : [],
            traits: p ? (p.freehands || []).length : -1,
            couleur: p && p.freehands && p.freehands[0] ? p.freehands[0].color : null,
            dateNotee: !!localStorage.getItem('AuTableau_derniere_securite')
        };
    }, FAUX_DOSSIER);

    r.verifie('la copie s\'écrit dans le dossier choisi', ecriture.ok);
    r.egal('sous un nom daté du jour', ecriture.noms, [nomDuJour()]);
    r.verifie('le menu dit où elle va',
        /Mes cours/.test(ecriture.libelle), ecriture.libelle);
    r.verifie('elle emporte les tableaux, les classes et l\'interface',
        ['boardsData', 'classes', 'favorites', 'interfaces', 'tableaux', 'toolbars']
            .every(c => ecriture.cles.includes(c)),
        ecriture.cles.join(', '));
    // C'EST LE TRAVAIL EN COURS qu'on perd si le navigateur s'efface : une
    // copie qui ne contiendrait que les tableaux déjà rangés ne servirait à rien.
    r.egal('et surtout le tableau en cours, tel qu\'il est à l\'instant',
        { traits: ecriture.traits, couleur: ecriture.couleur },
        { traits: 1, couleur: '#ff0055' });
    r.verifie('la date de la copie est notée', ecriture.dateNotee);

    // --- LE MÉNAGE : dix jours derrière soi, pas davantage ---
    const menage = await page.evaluate(async () => {
        const d = window.__d;
        const dd = n => (n < 10 ? '0' : '') + n;
        const vieux = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const nomVieux = `Au Tableau — ${vieux.getFullYear()}-${dd(vieux.getMonth() + 1)}-${dd(vieux.getDate())}.autableau`;
        const hier = new Date(Date.now() - 24 * 3600 * 1000);
        const nomHier = `Au Tableau — ${hier.getFullYear()}-${dd(hier.getMonth() + 1)}-${dd(hier.getDate())}.autableau`;
        d.__fichiers.set(nomVieux, 'x');
        d.__fichiers.set(nomHier, 'x');
        d.__fichiers.set('Au Tableau — 2019-01-01.autableau', 'x');
        d.__fichiers.set('cours de maths.pdf', 'à ne pas toucher');
        const jetes = await rangerLesVieillesCopies();
        return { jetes, reste: Array.from(d.__fichiers.keys()).sort(), garde: nomHier };
    });
    r.egal('les copies de plus de dix jours s\'en vont', menage.jetes, 2);
    r.verifie('celle d\'hier reste', menage.reste.includes(menage.garde), menage.reste.join(' | '));
    r.verifie('et le ménage ne touche à RIEN d\'autre dans le dossier',
        menage.reste.includes('cours de maths.pdf'), menage.reste.join(' | '));

    // --- LA TEMPORISATION : on ne récrit pas trois mégaoctets à chaque trait ---
    const tempo = await page.evaluate(async () => {
        const d = window.__d;
        let ecrits = 0;
        const vrai = d.getFileHandle.bind(d);
        d.getFileHandle = async (...a) => { ecrits++; return vrai(...a); };
        clearTimeout(securiteMinuteur); securiteMinuteur = null;
        securiteDerniereEcriture = 0;
        signalerUnChangementASauver();
        signalerUnChangementASauver();
        signalerUnChangementASauver();
        await new Promise(res => setTimeout(res, 1400));
        const apresAttente = ecrits;
        const tropTot = await ecrireLaSauvegardeDeSecurite(false);
        d.getFileHandle = vrai;
        return { apresAttente, tropTot };
    });
    r.egal('trois changements coup sur coup ne font qu\'une copie', tempo.apresAttente, 1);
    r.verifie('et la copie suivante attend son tour', !tempo.tropTot);

    // --- LE DROIT D'ÉCRIRE : sans lui, on n'écrit pas, et on ne plante pas ---
    const refus = await page.evaluate(async () => {
        window.__d.__droit = 'prompt';
        const avant = window.__d.__fichiers.size;
        const ok = await ecrireLaSauvegardeDeSecurite(true);
        window.__d.__droit = 'granted';
        return { ok, intact: window.__d.__fichiers.size === avant };
    });
    r.egal('sans le droit d\'écrire, rien n\'est écrit et rien ne casse',
        refus, { ok: false, intact: true });

    // --- LE DOSSIER A DISPARU (clé retirée, disque débranché) ---
    const disparu = await page.evaluate(async () => {
        const d = window.__d;
        const vrai = d.getFileHandle.bind(d);
        d.getFileHandle = async () => { throw new Error('dossier introuvable'); };
        let planté = false;
        let ok = null;
        try { ok = await ecrireLaSauvegardeDeSecurite(true); } catch (e) { planté = true; }
        d.getFileHandle = vrai;
        return { ok, planté };
    });
    r.egal('un dossier disparu se signale, il ne fait pas tomber l\'application',
        disparu, { ok: false, planté: false });

    // --- LE RAPPEL, quand rien ne protège le travail ---
    const rappel = await page.evaluate(() => {
        dossierSecurite = null;
        localStorage.removeItem('AuTableau_derniere_securite');
        const affiche = rappelerLaSauvegarde();
        const b = document.getElementById('bandeau-securite');
        return { affiche, texte: b ? b.textContent : '' };
    });
    r.verifie('sans dossier ni copie, un bandeau le dit',
        rappel.affiche && /navigateur/.test(rappel.texte), rappel.texte);

    const apresCopie = await page.evaluate(() => {
        const b = document.getElementById('bandeau-securite');
        if (b) b.remove();
        localStorage.setItem('AuTableau_derniere_securite', String(Date.now()));
        return { affiche: rappelerLaSauvegarde(), bandeau: !!document.getElementById('bandeau-securite') };
    });
    r.egal('mais il se tait quand une copie vient d\'être faite',
        apresCopie, { affiche: false, bandeau: false });

    // Une semaine sans copie : le rappel revient, et il dit combien de jours.
    const vieuxRappel = await page.evaluate(() => {
        localStorage.setItem('AuTableau_derniere_securite', String(Date.now() - 9 * 24 * 3600 * 1000));
        const affiche = rappelerLaSauvegarde();
        const b = document.getElementById('bandeau-securite');
        const texte = b ? b.textContent : '';
        if (b) b.remove();
        return { affiche, texte };
    });
    r.verifie('après neuf jours sans copie, il revient et dit combien',
        vieuxRappel.affiche && /9 jours/.test(vieuxRappel.texte), vieuxRappel.texte);

    // « Plus tard » ne doit pas revenir à la prochaine ouverture : un rappel
    // qu'on voit tous les jours est un rappel qu'on n'écoute plus.
    const plusTard = await page.evaluate(() => {
        localStorage.setItem('AuTableau_derniere_securite', String(Date.now() - 9 * 24 * 3600 * 1000));
        rappelerLaSauvegarde();
        const b = document.getElementById('bandeau-securite');
        const boutons = Array.from(b.querySelectorAll('button'));
        boutons[boutons.length - 1].click();     // « Plus tard »
        return { parti: !document.getElementById('bandeau-securite'), revient: rappelerLaSauvegarde() };
    });
    r.egal('« Plus tard » repousse d\'une semaine, il ne revient pas aussitôt',
        plusTard, { parti: true, revient: false });

    // Le bouton du menu existe et porte le bon libellé quand rien n'est choisi.
    const menu = await page.evaluate(() => {
        dossierSecurite = null;
        majLibelleDeLaSecurite();
        const b = document.getElementById('btn-dossier-securite');
        return { existe: !!b, libelle: document.getElementById('lib-dossier-securite').textContent };
    });
    r.verifie('le menu d\'export propose de mettre la sauvegarde en place',
        menu.existe && /automatique/.test(menu.libelle), JSON.stringify(menu));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
