// LES LECTEURS AUDIO ET VIDÉO.
//
// Ils sortent de la même fabrique : ce qu'on vérifie ici vaut pour les deux.
// Trois choses manquaient à qui fait écouter une dictée devant une classe.
//
// LE SAUT EN ARRIÈRE. « Redites-moi la phrase » est le geste du cours de
// langue, et il n'existait pas : il fallait viser la barre de progression au
// pixel près, en direct. Le pas se change par un appui long sur le bouton
// lui-même — aucune fenêtre à ouvrir, aucun clavier, et le nombre est écrit
// dessus, donc on sait toujours ce qu'il fera.
//
// LES REPÈRES A ET B. Ils ne servent qu'à qui refait écouter trois secondes.
// Montrés à tous, ils encombraient la barre de deux poignées et de deux
// étiquettes que personne ne comprenait. Ils se demandent.
//
// DEUX LECTEURS. Pour comparer deux extraits, il en faut deux, chacun avec son
// bouton : on tire une piste hors de la liste, elle s'en va dans un lecteur
// à elle.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Lecteurs');
    const { page, context, erreurs } = await ouvrirApp(browser);

    const poser = (noms, type) => page.evaluate(({ noms, type }) => {
        noms.forEach(n => {
            const f = new File([new Uint8Array(2048)], n,
                { type: type === 'video' ? 'video/mp4' : 'audio/mpeg' });
            if (type === 'video') handleVideoDrop(f); else handleMp3Drop(f);
        });
    }, { noms, type });

    // ---------------------------------------------------------------
    // CE QU'ON VOIT EN ARRIVANT
    // ---------------------------------------------------------------
    await poser(['Dictée 1', 'Dictée 2', 'Compréhension orale'], 'audio');
    await page.waitForTimeout(300);

    const arrivee = await page.evaluate(() => {
        const p = document.getElementById('mp3-player');
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && e.getClientRects().length > 0;
        };
        return {
            ouvert: !!p && p.style.display !== 'none',
            // La rangée qu'on regarde en direct : cinq boutons, et le saut au milieu.
            commandes: Array.from(p.querySelectorAll('.media-commandes .media-btn'))
                .map(b => b.id.replace('mp3-', '')),
            saut: { arriere: vu('mp3-back'), avant: vu('mp3-fwd'),
                    pas: (document.getElementById('mp3-back-n') || {}).textContent },
            // A ET B NE SONT PAS LÀ : c'est le défaut demandé.
            reperes: { a: vu('mp3-ab-thumb-a'), b: vu('mp3-ab-thumb-b'),
                       boucle: vu('mp3-play-selection'), bascule: vu('mp3-ab-toggle') },
            pistes: p.querySelectorAll('.media-playlist li').length,
            aide: vu('mp3-playlist-aide')
        };
    });
    r.verifie('le lecteur s\'ouvre sur les pistes déposées',
        arrivee.ouvert && arrivee.pistes === 3, JSON.stringify(arrivee));
    r.egal('la rangée du direct : piste, saut, lecture, saut, piste',
        arrivee.commandes, ['prev', 'back', 'play', 'fwd', 'next']);
    r.egal('le saut est là, et il dit de combien il saute',
        arrivee.saut, { arriere: true, avant: true, pas: '5' });
    r.egal('mais A et B ne sont pas là : ils se demandent',
        arrivee.reperes, { a: false, b: false, boucle: false, bascule: true });
    r.verifie('la liste dit ce qu\'on peut y faire, dès qu\'il y a de quoi',
        arrivee.aide, String(arrivee.aide));

    // ---------------------------------------------------------------
    // LE SAUT EN ARRIÈRE, ET SON PAS
    // ---------------------------------------------------------------
    const saut = await page.evaluate(async () => {
        const m = document.getElementById('mp3-media');
        // On simule une piste d'une minute : le fichier d'essai n'a pas de son.
        Object.defineProperty(m, 'duration', { value: 60, configurable: true });
        m.currentTime = 30;
        document.getElementById('mp3-back').click();
        const apresArriere = m.currentTime;
        document.getElementById('mp3-fwd').click();
        const apresAvant = m.currentTime;
        // On ne sort pas de la piste, ni d'un côté ni de l'autre.
        m.currentTime = 2;
        document.getElementById('mp3-back').click();
        const auDebut = m.currentTime;
        m.currentTime = 58;
        document.getElementById('mp3-fwd').click();
        const aLaFin = m.currentTime;
        return { apresArriere, apresAvant, auDebut, aLaFin };
    });
    r.egal('le bouton recule de cinq secondes, et l\'autre avance d\'autant',
        { arriere: saut.apresArriere, avant: saut.apresAvant }, { arriere: 25, avant: 30 });
    r.egal('et l\'on ne sort pas de la piste',
        { debut: saut.auDebut, fin: saut.aLaFin }, { debut: 0, fin: 60 });

    // L'APPUI LONG CHANGE LE PAS — sans fenêtre ni clavier.
    const pas = await page.evaluate(async () => {
        const b = document.getElementById('mp3-back');
        const m = document.getElementById('mp3-media');
        const appuyer = async (duree) => {
            b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            await new Promise(r => setTimeout(r, duree));
            b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        };
        m.currentTime = 40;
        await appuyer(700);                       // long : on règle
        const apresLong = { pas: document.getElementById('mp3-back-n').textContent,
                            // ET L'APPUI LONG NE SAUTE PAS : on réglait ET on
                            // reculait du même geste, ce qui est déroutant.
                            temps: m.currentTime,
                            retenu: localStorage.getItem('auTableau_saut_audio') };
        m.currentTime = 40;
        await appuyer(30);                        // bref : on saute
        return { apresLong, apresBref: m.currentTime };
    });
    r.egal('un appui long fait passer le pas au cran suivant, et le retient',
        { pas: pas.apresLong.pas, retenu: pas.apresLong.retenu }, { pas: '10', retenu: '10' });
    r.egal('et il ne saute pas au passage', pas.apresLong.temps, 40);
    r.egal('l\'appui bref saute alors du nouveau pas', pas.apresBref, 30);

    // ---------------------------------------------------------------
    // A ET B, À LA DEMANDE
    // ---------------------------------------------------------------
    const ab = await page.evaluate(() => {
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && e.getClientRects().length > 0;
        };
        const p = document.getElementById('mp3-player');
        const hauteurSans = Math.round(p.getBoundingClientRect().height);
        document.getElementById('mp3-ab-toggle').click();
        const montres = { a: vu('mp3-ab-thumb-a'), b: vu('mp3-ab-thumb-b'),
                          boucle: vu('mp3-play-selection'),
                          allume: document.getElementById('mp3-ab-toggle').classList.contains('active-btn'),
                          retenu: localStorage.getItem('auTableau_reperes_ab'),
                          hauteur: Math.round(p.getBoundingClientRect().height) };
        document.getElementById('mp3-ab-toggle').click();
        const caches = { a: vu('mp3-ab-thumb-a'),
                         retenu: localStorage.getItem('auTableau_reperes_ab'),
                         hauteur: Math.round(p.getBoundingClientRect().height) };
        return { hauteurSans, montres, caches };
    });
    r.egal('la bascule montre A, B et la boucle, et le retient',
        { a: ab.montres.a, b: ab.montres.b, boucle: ab.montres.boucle,
          allume: ab.montres.allume, retenu: ab.montres.retenu },
        { a: true, b: true, boucle: true, allume: true, retenu: 'true' });
    r.verifie('cachés, ils ne laissent pas leur place vide : le lecteur est plus court',
        ab.hauteurSans < ab.montres.hauteur && ab.caches.hauteur === ab.hauteurSans,
        JSON.stringify(ab));
    r.egal('et la bascule inverse les range', 
        { a: ab.caches.a, retenu: ab.caches.retenu }, { a: false, retenu: 'false' });

    // ---------------------------------------------------------------
    // UNE PISTE TIRÉE DEHORS S'EN VA DANS UN LECTEUR À ELLE
    // ---------------------------------------------------------------
    const detachee = await page.evaluate(() => {
        const p = document.getElementById('mp3-player');
        const b = p.getBoundingClientRect();
        const li = p.querySelectorAll('.media-playlist li')[1];
        const nom = li.textContent.replace(/^\s*\d+\.\s*/, '').trim();
        const avant = p.querySelectorAll('.media-playlist li').length;

        // Lâchée franchement à côté du lecteur.
        li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
        li.dispatchEvent(new DragEvent('dragend', { bubbles: true,
            clientX: Math.round(b.left - 200), clientY: Math.round(b.top - 100) }));

        const second = document.getElementById('mp3-2-player');
        return {
            nom, avant,
            apres: p.querySelectorAll('.media-playlist li').length,
            second: !!second && second.style.display !== 'none',
            titreDuSecond: second ? document.getElementById('mp3-2-title').textContent : null,
            // Il a ses propres commandes : c'est ce qui fait « deux lecteurs ».
            saAvance: !!document.getElementById('mp3-2-back'),
            // Et il s'est posé là où on l'a lâché, pas dans le coin.
            aGauche: second ? second.getBoundingClientRect().left < b.left : false
        };
    });
    r.egal('la piste quitte la liste du premier',
        { avant: detachee.avant, apres: detachee.apres }, { avant: 3, apres: 2 });
    r.verifie('et un second lecteur s\'ouvre sur elle, avec ses propres commandes',
        detachee.second && detachee.titreDuSecond === detachee.nom && detachee.saAvance,
        JSON.stringify(detachee));
    r.verifie('posé là où on l\'a lâchée', detachee.aGauche, JSON.stringify(detachee));

    // Un lâcher DANS le lecteur ne détache rien : c'est un simple réordonnancement.
    const dedans = await page.evaluate(() => {
        const p = document.getElementById('mp3-player');
        const b = p.getBoundingClientRect();
        const li = p.querySelectorAll('.media-playlist li')[0];
        const avant = p.querySelectorAll('.media-playlist li').length;
        li.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
        li.dispatchEvent(new DragEvent('dragend', { bubbles: true,
            clientX: Math.round(b.left + b.width / 2), clientY: Math.round(b.top + b.height / 2) }));
        return { avant, apres: p.querySelectorAll('.media-playlist li').length,
                 troisieme: !!document.getElementById('mp3-3-player') };
    });
    r.egal('lâchée à l\'intérieur, elle reste où elle est',
        { avant: dedans.avant, apres: dedans.apres, troisieme: dedans.troisieme },
        { avant: 2, apres: 2, troisieme: false });

    // ---------------------------------------------------------------
    // UN NOM DE FICHIER N'EST PAS UN TITRE
    // « 2021_06_09_15_14_42 » occupait la plus grosse typographie du panneau
    // sans rien dire — ni ce qu'on écoute, ni pour quelle classe — et la liste
    // le redisait juste en dessous.
    // ---------------------------------------------------------------
    const renommer = await page.evaluate(async () => {
        const t = document.getElementById('mp3-title');
        const avant = t.textContent;
        const frapper = (touche) => t.dispatchEvent(
            new KeyboardEvent('keydown', { key: touche, bubbles: true, cancelable: true }));

        t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        const enSaisie = { editable: t.isContentEditable,
                           marque: t.classList.contains('en-saisie') };
        t.textContent = '  Dictée   n°3  ';
        frapper('Enter');
        await new Promise(r => setTimeout(r, 50));
        const apres = {
            titre: t.textContent,
            editable: t.isContentEditable,
            // LA LISTE SUIT : le nom vit avec la piste, pas avec l'en-tête.
            liste: (document.querySelector('#mp3-playlist li.active') || {}).textContent || ''
        };

        // ÉCHAP RENONCE.
        t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        t.textContent = 'zzz';
        frapper('Escape');
        await new Promise(r => setTimeout(r, 50));
        return { avant, enSaisie, apres, apresEchap: t.textContent };
    });
    r.egal('le double-clic ouvre la saisie du titre',
        renommer.enSaisie, { editable: true, marque: true });
    r.egal('Entrée le renomme, espaces en trop rabotés',
        { titre: renommer.apres.titre, ferme: renommer.apres.editable },
        { titre: 'Dictée n°3', ferme: false });
    r.verifie('et la liste porte le nouveau nom : il vit avec la piste',
        /Dictée n°3/.test(renommer.apres.liste), JSON.stringify(renommer.apres));
    r.egal('Échap renonce et rend le nom d\'avant', renommer.apresEchap, 'Dictée n°3');

    // ---------------------------------------------------------------
    // LA LISTE NE S'IMPOSE PLUS
    // À une seule piste elle redisait le titre et prenait le tiers du panneau.
    // ---------------------------------------------------------------
    const liste = await page.evaluate(() => {
        const p = document.getElementById('mp3-player');
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && e.getClientRects().length > 0;
        };
        const aDeux = { liste: vu('mp3-playlist'), chevron: vu('mp3-playlist-toggle'),
                        compte: (document.getElementById('mp3-compte') || {}).textContent,
                        hauteur: Math.round(p.getBoundingClientRect().height) };
        // Le chevron la referme.
        document.getElementById('mp3-playlist-toggle').click();
        const repliee = { liste: vu('mp3-playlist'), aide: vu('mp3-playlist-aide'),
                          hauteur: Math.round(p.getBoundingClientRect().height) };
        document.getElementById('mp3-playlist-toggle').click();
        const rouverte = vu('mp3-playlist');

        // On n'en garde qu'une : la liste et le chevron s'en vont.
        while (document.querySelectorAll('#mp3-playlist li').length > 1) {
            document.querySelector('#mp3-playlist li:last-child .media-delete-btn').click();
        }
        const aUne = { liste: vu('mp3-playlist'), chevron: vu('mp3-playlist-toggle'),
                       aide: vu('mp3-playlist-aide'),
                       hauteur: Math.round(p.getBoundingClientRect().height) };
        return { aDeux, repliee, rouverte, aUne };
    });
    r.egal('à deux pistes, la liste est là et le chevron les compte',
        { liste: liste.aDeux.liste, chevron: liste.aDeux.chevron, compte: liste.aDeux.compte },
        { liste: true, chevron: true, compte: '2' });
    r.egal('le chevron la replie et la rouvre',
        { repliee: liste.repliee.liste, aide: liste.repliee.aide, rouverte: liste.rouverte },
        { repliee: false, aide: false, rouverte: true });
    r.egal('à une seule piste, ni liste ni chevron : elle redirait le titre',
        { liste: liste.aUne.liste, chevron: liste.aUne.chevron, aide: liste.aUne.aide },
        { liste: false, chevron: false, aide: false });
    r.verifie('et le panneau y perd le tiers de sa hauteur',
        liste.aUne.hauteur < liste.aDeux.hauteur * 0.7,
        JSON.stringify({ aDeux: liste.aDeux.hauteur, aUne: liste.aUne.hauteur }));

    // ---------------------------------------------------------------
    // LA VITESSE N'EST PAS UNE GRANDEUR CONTINUE
    // Personne ne vise 1,3× : on ralentit un peu, ou l'on revient au normal.
    // Et deux curseurs côte à côte ne se distinguaient pas l'un de l'autre.
    // ---------------------------------------------------------------
    const vitesse = await page.evaluate(() => {
        const m = document.getElementById('mp3-media');
        const b = document.getElementById('mp3-speed');
        const curseurs = document.querySelectorAll('#mp3-player .media-reglages .media-slider').length;
        const crans = [];
        for (let i = 0; i < 5; i++) {
            crans.push({ mot: b.textContent, taux: m.playbackRate,
                         marque: b.classList.contains('active-btn') });
            b.click();
        }
        return { curseurs, crans, ab: document.getElementById('mp3-ab-toggle').textContent.trim() };
    });
    r.egal('il ne reste qu\'un seul curseur : celui du volume', vitesse.curseurs, 1);
    r.egal('la vitesse tourne sur quatre crans, et le bouton dit lequel',
        vitesse.crans.map(c => c.mot), ['1×', '0,75×', '1,25×', '1,5×', '1×']);
    r.egal('et elle agit vraiment sur la lecture',
        vitesse.crans.map(c => c.taux), [1, 0.75, 1.25, 1.5, 1]);
    r.egal('le bouton s\'allume dès qu\'on quitte la vitesse normale',
        vitesse.crans.map(c => c.marque), [false, true, true, true, false]);
    // Un dessin de dix-sept pixels ne dit pas « A-B » : les points et les
    // pointillés s'y rejoignent en une tache, et l'on confondait ce bouton
    // avec celui d'à côté.
    r.egal('« A-B » est écrit, pas dessiné', vitesse.ab, 'A-B');

    // ---------------------------------------------------------------
    // LE LECTEUR VIDÉO SORT DE LA MÊME FABRIQUE
    // ---------------------------------------------------------------
    await poser(['Extrait de film'], 'video');
    await page.waitForTimeout(200);
    const video = await page.evaluate(() => {
        const p = document.getElementById('vidp-player');
        const vu = (id) => {
            const e = document.getElementById(id);
            return !!e && e.getClientRects().length > 0;
        };
        return { ouvert: !!p && p.style.display !== 'none',
                 saut: vu('vidp-back') && vu('vidp-fwd'),
                 pas: (document.getElementById('vidp-back-n') || {}).textContent,
                 reperes: vu('vidp-ab-thumb-a'),
                 pleinEcran: vu('vidp-fullscreen') };
    });
    r.verifie('la vidéo a le même saut, le même défaut sans A-B, et son plein écran',
        video.ouvert && video.saut && !video.reperes && video.pleinEcran,
        JSON.stringify(video));
    r.egal('avec son propre pas, réglé de son côté', video.pas, '5');

    await page.evaluate(() => {
        ['mp3-player', 'mp3-2-player', 'vidp-player'].forEach(id => {
            const p = document.getElementById(id);
            if (p) p.remove();
        });
    });

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
