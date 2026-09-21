// CE QU'ON NE VOIT PLUS NE DOIT PLUS RÉPONDRE.
//
// « Le PDF était affiché, les barres d'outils cachées par le PDF, tout est
// normal — mais en fait je pense que la barre devait être derrière, car quand
// j'ai cliqué à un endroit sur le PDF, il m'a lancé l'équerre. »
//
// La barre n'était pas derrière : rien ne passe devant elle, elle vit au-dessus
// du tableau. Elle était INVISIBLE ET TOUJOURS SENSIBLE. Le mode Focus l'efface
// — « opacity: 0 » — et la met hors d'atteinte — « pointer-events: none » —
// mais sa grille de boutons se rendait le clic à elle-même par un
// « pointer-events: auto » qui ne servait à rien le reste du temps. Vingt-deux
// boutons dormaient donc sur la page projetée : un clic sur le PDF, à l'endroit
// où dormait l'équerre, posait l'équerre en plein cours.
//
// CE QUE CETTE SUITE TIENT :
//
//   — en présentation, un clic là où dort un bouton de la barre tombe sur le
//     tableau et ne réveille aucun outil ;
//   — la règle vaut pour TOUS les boutons de TOUTES les barres, et pas
//     seulement pour celui qu'on a vu passer : on relit l'écran entier ;
//   — et l'on n'a rien cassé : les barres redevenues visibles répondent.
//
// S'Y AJOUTE LA LANGUETTE DU TIROIR DE DROITE. « Tu peux remettre la flèche
// pour le tiroir de droite » : elle avait été retirée avec le résidu qu'elle
// formait au bord. Elle revient — c'est par là qu'on ouvre ses tableaux — mais
// en se présentant : une flèche tracée, et non un pâté noir sans nom.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Un pixel, étiré aux dimensions d'une page projetée.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// TOUT CE QUI EST INVISIBLE ET REÇOIT ENCORE LE CLIC. On ne cherche pas un
// bouton nommé : on relit l'écran et l'on demande, pour chaque commande
// devenue invisible, qui recevrait un clic posé en son milieu.
const FANTOMES = () => {
    const efface = (el) => {
        let n = el;
        while (n && n.nodeType === 1) {
            const s = getComputedStyle(n);
            // « display:none » et « visibility:hidden » sont déjà hors d'atteinte :
            // ce n'est pas d'eux qu'on parle.
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            if (parseFloat(s.opacity) < 0.05) return true;
            n = n.parentElement;
        }
        return false;
    };
    const out = [];
    document.querySelectorAll('button, .btn, input, select, a, [data-mode], [data-widget]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight) return;
        if (!efface(el)) return;
        const cible = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!cible) return;
        if (cible === el || el.contains(cible) || cible.contains(el)) {
            const barre = el.closest('.custom-toolbar, .toolbar, .drawer, #dock, #barre-ecran');
            out.push((barre ? (barre.id || barre.className) : '?') + ' > '
                + (el.dataset.dragSourceToolId || el.id || el.title || 'sans nom'));
        }
    });
    return out;
};

module.exports = async function (browser) {
    const r = creerRapport('Rien d\'invisible ne répond');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => typeof basculerLePleinEcranDuDocument === 'function'
        && document.getElementById('system-toolbar-main'), { timeout: 20000 });

    // ------------------------------------------------------------------
    // 1. LA BARRE EST BIEN LÀ, ET L'ÉQUERRE AUSSI
    // Sans ce préalable, tout le reste passerait pour de bonnes nouvelles
    // alors qu'on n'aurait rien mesuré du tout.
    // ------------------------------------------------------------------
    const depart = await page.evaluate(() => {
        const b = document.getElementById('system-toolbar-main');
        const btn = b && b.querySelector('[data-drag-source-tool-id="setsquare"]');
        const rect = btn && btn.getBoundingClientRect();
        return {
            barre: !!b, equerre: !!btn,
            visible: b ? parseFloat(getComputedStyle(b).opacity) : 0,
            rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null
        };
    });
    r.verifie('la barre principale porte l\'équerre, et on la voit',
        depart.barre && depart.equerre && depart.visible > 0.9, JSON.stringify(depart));

    // ------------------------------------------------------------------
    // 2. LE BOUTON RÉPOND QUAND ON LE VOIT
    // ------------------------------------------------------------------
    await page.mouse.click(depart.rect.x + depart.rect.w / 2, depart.rect.y + depart.rect.h / 2);
    await page.waitForTimeout(150);
    r.verifie('à découvert, un clic sur l\'équerre pose l\'équerre',
        await page.evaluate(() => activeWidgets.setsquare === true));
    // On la range : la suite doit la trouver éteinte.
    await page.mouse.click(depart.rect.x + depart.rect.w / 2, depart.rect.y + depart.rect.h / 2);
    await page.waitForTimeout(150);
    r.verifie('et un second clic la retire', await page.evaluate(() => activeWidgets.setsquare === false));

    // ------------------------------------------------------------------
    // 3. LA PAGE PROJETÉE : LE CLIC TOMBE SUR LE TABLEAU
    // ------------------------------------------------------------------
    const projection = await page.evaluate((px) => {
        images.push({ id: 'doc-projete', type: 'image', src: px, x: -400, y: -300, w: 2400, h: 1800 });
        selectedItems = [{ type: 'image', id: 'doc-projete' }];
        majBarreDocument();
        const ouvert = basculerLePleinEcranDuDocument();
        return { ouvert, focus: document.body.classList.contains('focus-mode'), etat: etatDuPleinEcran() };
    }, PIXEL);
    await page.waitForTimeout(500);
    r.verifie('la page se projette et le mode Focus range les barres',
        projection.ouvert && projection.focus && projection.etat === 1, JSON.stringify(projection));

    // ELLE N'EST PLUS EFFACÉE, ELLE EST RANGÉE — et c'est une garantie plus
    // forte que celle qu'on demandait ici. Une barre à opacité zéro garde sa
    // place et ses boutons : tout le chapitre existe parce qu'ils répondaient
    // quand même. Repliée au quai, elle n'a plus de boîte du tout, donc plus
    // rien à cliquer par mégarde — et une pastille en bas à gauche dit où elle
    // est passée, ce qu'une barre effacée ne disait pas.
    const effacee = await page.evaluate(() => {
        const b = document.getElementById('system-toolbar-main');
        const quai = document.getElementById('dock');
        const pastille = quai && quai.querySelector(`.dock-item[data-target-id='${b.id}']`);
        return {
            place: b.getBoundingClientRect().height > 0,
            pastille: !!(pastille && pastille.getBoundingClientRect().width > 4),
            quaiVu: !!(quai && getComputedStyle(quai).display !== 'none'
                       && Number(getComputedStyle(quai).opacity) > 0.5)
        };
    });
    r.verifie('la barre n\'est plus là du tout : elle est rangée au quai',
        !effacee.place, JSON.stringify(effacee));
    r.verifie('et une pastille dit où elle est passée',
        effacee.quaiVu && effacee.pastille, JSON.stringify(effacee));

    await page.mouse.click(depart.rect.x + depart.rect.w / 2, depart.rect.y + depart.rect.h / 2);
    await page.waitForTimeout(200);
    r.verifie('un clic sur la page projetée, là où dort l\'équerre, ne pose PAS l\'équerre',
        await page.evaluate(() => activeWidgets.setsquare === false));

    // Et ce n'est pas seulement l'équerre qui se tait : le crayon non plus.
    const crayon = await page.evaluate(() => {
        const b = document.getElementById('system-toolbar-main');
        const btn = b.querySelector('[data-drag-source-tool-id="freehand"]');
        const rect = btn.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, avant: mode };
    });
    await page.mouse.click(crayon.x, crayon.y);
    await page.waitForTimeout(200);
    r.egal('ni le crayon : le mode ne change pas sous un clic aveugle',
        await page.evaluate(() => mode), crayon.avant);

    // ------------------------------------------------------------------
    // 4. LA RELECTURE COMPLÈTE DE L'ÉCRAN
    // Le bouton de l'équerre était le symptôme, pas la maladie : on demande
    // qu'AUCUNE commande effacée ne reste sensible, où qu'elle vive.
    // ------------------------------------------------------------------
    const enPresentation = await page.evaluate(FANTOMES);
    r.egal('en présentation, plus une seule commande invisible ne répond', enPresentation, []);

    // Les barres rappelées par-dessus la page : elles doivent redevenir vivantes.
    await page.evaluate(() => basculerLesBarresDeLaPresentation());
    await page.waitForTimeout(500);
    const rappelees = await page.evaluate(() => {
        const b = document.getElementById('system-toolbar-main');
        const btn = b.querySelector('[data-drag-source-tool-id="setsquare"]');
        const rect = btn.getBoundingClientRect();
        return { opacite: getComputedStyle(b).opacity, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    r.verifie('rappelées par-dessus la page, les barres se revoient',
        parseFloat(rappelees.opacite) > 0.9, rappelees.opacite);
    await page.mouse.click(rappelees.x, rappelees.y);
    await page.waitForTimeout(200);
    r.verifie('et l\'équerre y répond de nouveau — on n\'a pas éteint la barre',
        await page.evaluate(() => activeWidgets.setsquare === true));

    await page.evaluate(() => { activeWidgets.setsquare = false; quitterLaPresentation(); });
    await page.waitForTimeout(500);

    // ------------------------------------------------------------------
    // 5. L'ÉCRAN NU : LES TIROIRS RANGÉS, LES BARRES RESTENT
    // ------------------------------------------------------------------
    await page.evaluate(() => document.body.classList.add('sans-tiroirs'));
    await page.waitForTimeout(500);
    r.egal('tiroirs rangés, aucune commande invisible ne répond non plus',
        await page.evaluate(FANTOMES), []);
    await page.evaluate(() => document.body.classList.remove('sans-tiroirs'));

    // ------------------------------------------------------------------
    // 6. LA LANGUETTE DU TIROIR DE DROITE
    // ------------------------------------------------------------------
    const languette = await page.evaluate(() => {
        const t = document.querySelector('#right-drawer .drawer-toggle-v');
        if (!t) return { absente: true };
        const s = getComputedStyle(t);
        const svg = t.querySelector('svg');
        const ss = svg && getComputedStyle(svg);
        const rect = t.getBoundingClientRect();
        return {
            vue: s.display, nom: t.getAttribute('data-tooltip'),
            largeur: rect.width, dansLEcran: rect.right > 0 && rect.right <= innerWidth + 1,
            remplissage: ss && ss.fill, trait: ss && ss.stroke
        };
    });
    r.verifie('la flèche du tiroir de droite est de retour, tiroir fermé',
        languette.vue === 'flex' && languette.largeur > 10, JSON.stringify(languette));
    // L'ATTRIBUT DOIT ÊTRE CELUI QU'ON LIT. « data-title » ne dit rien à
    // personne : ni au navigateur, qui ne connaît que « title », ni à
    // l'infobulle maison, qui ne s'ouvre que sur « data-tooltip ».
    r.verifie('elle porte le nom de ce qu\'elle ouvre, dans l\'attribut qui s\'affiche',
        /tableau/i.test(languette.nom || ''), String(languette.nom));
    r.verifie('et c\'est une flèche tracée, pas une forme pleine',
        languette.remplissage === 'none' && /rgb/.test(languette.trait || ''),
        JSON.stringify({ f: languette.remplissage, s: languette.trait }));

    const ouverture = await page.evaluate(() => {
        toggleRightDrawer();
        const ouvert = document.getElementById('right-drawer').classList.contains('open');
        const chev = document.getElementById('right-chev').innerHTML;
        toggleRightDrawer();
        return { ouvert, chev, refermeChev: document.getElementById('right-chev').innerHTML };
    });
    r.verifie('un clic dessus ouvre le tiroir', ouverture.ouvert, JSON.stringify(ouverture));
    r.verifie('et la flèche se retourne selon le sens où elle mène',
        ouverture.chev !== ouverture.refermeChev,
        JSON.stringify([ouverture.chev, ouverture.refermeChev]));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
