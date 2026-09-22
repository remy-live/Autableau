// LA BARRE DE STYLE NE DIT PAS DEUX FOIS LA MÊME CHOSE.
//
// « Je pense qu'il y a des doublons dans les barres de style, ça déconne un
// peu, ça ragrandit, ça diminue, ça bouge, bref ça ne va pas, regarde ce que
// cela donne avec les outils. »
//
// Un balayage de la barre pour chaque outil et chaque sélection a trouvé deux
// choses, de natures différentes :
//
//   — PENDANT LA SAISIE, deux pastilles rondes de couleur à quinze centimètres
//     l'une de l'autre : « Couleur et Opacité » (enfant direct de #bar-style,
//     hors de toute « .style-group ») et « Couleur » (la barre du texte, rangée
//     dans celle du haut). Elles ne font même pas la même chose — l'une colore
//     ce qu'on va taper, l'autre repeint le bloc entier — et rien ne disait
//     laquelle faisait foi. Le même défaut avait déjà été réglé pour la TAILLE ;
//     la couleur avait été oubliée parce que son bouton n'est dans aucun groupe.
//
//   — LA POIGNÉE « DÉPLACER » ÉTAIT BARRÉE d'un trait gris. La barre de style
//     et celle du document portent chacune un « .drag-handle.cbar-head », et
//     les règles écrites pour le chrome repliable des barres COMPOSÉES
//     n'étaient pas préfixées : leur barrette se peignait en travers de
//     l'icône. Un seul bouton, barré, que l'œil prend pour deux.
//
// CE QUE CETTE SUITE TIENT : aucune commande de la barre ne parle deux fois du
// même sujet, dans aucun état ; et le chrome des barres composées reste chez
// elles.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Ce qu'un professeur VOIT dans la barre : les commandes vraiment affichées,
// avec le nom que porte leur infobulle. Deux noms qui parlent du même sujet,
// ce sont deux boutons qu'on croit identiques.
const RELEVE = () => {
    const vraimentVu = (el) => {
        if (!el.getClientRects().length) return false;
        let n = el;
        while (n && n.nodeType === 1) {
            const s = getComputedStyle(n);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
            if (parseFloat(s.opacity) < 0.05) return false;
            n = n.parentElement;
        }
        return true;
    };
    const bs = document.getElementById('bar-style');
    if (!bs || !bs.classList.contains('visible')) return { visible: false, noms: [], largeur: 0 };
    const noms = [];
    bs.querySelectorAll('button, input, select, .drag-handle').forEach(el => {
        if (!vraimentVu(el)) return;
        const t = (el.title || el.dataset.tooltip || el.id || '').trim();
        if (t) noms.push({ nom: t, forme: el.tagName.toLowerCase() + (el.type ? ':' + el.type : '') });
    });
    return { visible: true, noms, largeur: Math.round(bs.getBoundingClientRect().width) };
};

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

module.exports = async function (browser) {
    const r = creerRapport('La barre de style sans doublons');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForFunction(() => typeof updateStyleBarContext === 'function'
        && typeof basculerLAncrageDuTexte === 'function', { timeout: 20000 });

    // ------------------------------------------------------------------
    // 1. LE BALAYAGE : AUCUN SUJET DIT DEUX FOIS, DANS AUCUN ÉTAT
    // C'est la vérification qui compte, parce qu'elle ne vise pas un bouton
    // connu : elle relit la barre entière dans vingt-trois états.
    // ------------------------------------------------------------------
    const OUTILS = ['pointer', 'freehand', 'highlighter', 'text', 'postit', 'point',
                    'segment', 'droite', 'curve', 'circle', 'polygon', 'rectangle'];
    const etats = [];

    for (const outil of OUTILS) {
        await page.evaluate((o) => { selectedItems = []; setMode(o); updateStyleBarContext(); }, outil);
        await page.waitForTimeout(120);
        etats.push({ nom: 'outil ' + outil, ...(await page.evaluate(RELEVE)) });
    }

    await page.evaluate((px) => {
        texts.length = 0; rectangles.length = 0; circles.length = 0; segments.length = 0;
        points.length = 0; freehands.length = 0; images.length = 0;
        texts.push({ id: 'T1', x: 100, y: 100, content: 'Leçon', fontSize: 24, color: '#e74c3c', z: 1 });
        rectangles.push({ id: 'R1', x: 300, y: 100, w: 120, h: 80, color: '#2d3436', lineWidth: 3, z: 2 });
        circles.push({ id: 'C1', cx: 500, cy: 140, r: 50, color: '#2d3436', lineWidth: 3, z: 3 });
        segments.push({ id: 'S1', x1: 600, y1: 100, x2: 700, y2: 180, color: '#2d3436', lineWidth: 3, z: 4 });
        points.push({ id: 'P1', x: 760, y: 140, color: '#2d3436', z: 5 });
        freehands.push({ id: 'F1', points: [{ x: 800, y: 100, p: .5 }, { x: 860, y: 160, p: .5 }], color: '#2d3436', width: 3, z: 6 });
        images.push({ id: 'I1', src: px, x: 900, y: 100, w: 120, h: 90, z: 7 });
        draw();
    }, PIXEL);

    for (const [nom, type, id] of [['texte', 'text', 'T1'], ['rectangle', 'rectangle', 'R1'],
                                   ['cercle', 'circle', 'C1'], ['segment', 'segment', 'S1'],
                                   ['point', 'point', 'P1'], ['tracé', 'freehand', 'F1']]) {
        await page.evaluate(({ type, id }) => {
            setMode('pointer'); selectedItems = [{ type, id }]; updateStyleBarContext();
        }, { type, id });
        await page.waitForTimeout(120);
        etats.push({ nom: 'sélection ' + nom, ...(await page.evaluate(RELEVE)) });
    }

    // La saisie, barre du texte rangée en haut : l'état de la capture d'écran.
    await page.evaluate(() => {
        selectedItems = []; basculerLAncrageDuTexte(true); setMode('text'); updateStyleBarContext();
    });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 500);
    await page.waitForTimeout(400);
    await page.keyboard.type('Tableau de numération');
    await page.waitForTimeout(300);
    const saisie = await page.evaluate(RELEVE);
    etats.push({ nom: 'saisie (barre rangée en haut)', ...saisie });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Debout, au bord droit : les mêmes commandes, la même exigence.
    await page.evaluate(() => {
        basculerLOrientationDeLaBarreStyle(true);
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
    });
    await page.waitForTimeout(300);
    etats.push({ nom: 'barre debout', ...(await page.evaluate(RELEVE)) });
    await page.evaluate(() => basculerLOrientationDeLaBarreStyle(false));
    await page.waitForTimeout(300);

    // LES SUJETS QU'UNE BARRE NE DOIT ABORDER QU'UNE FOIS.
    const SUJETS = { couleur: /couleur/i, taille: /taille du texte|^font-size$/i,
                     epaisseur: /épaisseur|^line-width$/i };
    // UNE RÉGLETTE ET SON NOMBRE NE SONT PAS DEUX COMMANDES. « Le nombre et le
    // curseur disent la même chose » (script.js:6478) : le champ existe pour
    // qu'on puisse TAPER 2,5, que la réglette ne sait pas viser. Les compter
    // comme un doublon condamnerait une paire voulue — et masquerait les vrais.
    const unePaireReglette = (pris) => pris.length === 2
        && pris.some(p => p.forme === 'input:range') && pris.some(p => p.forme === 'input:number');
    const fautes = [];
    etats.forEach(e => {
        if (!e.visible) return;
        Object.entries(SUJETS).forEach(([sujet, re]) => {
            const pris = e.noms.filter(n => re.test(n.nom));
            if (pris.length > 1 && !unePaireReglette(pris)) {
                fautes.push(e.nom + ' — ' + sujet + ' : ' + pris.map(p => p.nom).join(' + '));
            }
        });
        // Et jamais deux commandes strictement de même nom.
        const compte = {};
        e.noms.forEach(n => compte[n.nom] = (compte[n.nom] || 0) + 1);
        Object.entries(compte).filter(([, n]) => n > 1)
            .forEach(([n, c]) => fautes.push(e.nom + ' — « ' + n +' » ×' + c));
    });
    r.verifie('on a bien relu la barre dans une vingtaine d\'états',
        etats.filter(e => e.visible).length >= 18, etats.filter(e => e.visible).length + ' états où elle paraît');
    r.egal('aucune commande ne parle deux fois du même sujet, dans aucun état', fautes, []);

    // ------------------------------------------------------------------
    // 2. LE DOUBLON NOMMÉ : LES DEUX PASTILLES DE LA SAISIE
    // La relecture ci-dessus le couvre, mais elle passerait aussi si la barre
    // devenait vide. On nomme donc ce qui doit rester, et ce qui doit partir.
    // ------------------------------------------------------------------
    const couleursEnSaisie = saisie.noms.filter(n => /couleur/i.test(n.nom)).map(n => n.nom);
    r.egal('pendant la saisie, la pastille qui reste est celle du TEXTE',
        couleursEnSaisie, ['Couleur']);
    r.verifie('« Couleur et Opacité » s\'est retirée',
        !saisie.noms.some(n => /Couleur et Opacité/.test(n.nom)),
        JSON.stringify(saisie.noms.map(n => n.nom)));

    // SON SÉPARATEUR PART AVEC ELLE. Un trait vertical qui ne sépare plus rien
    // est exactement le genre de résidu qui fait croire à un bouton manquant.
    const separateur = await page.evaluate(() => {
        const b = document.getElementById('btn-color-popover');
        const d = b && b.nextElementSibling;
        if (!d || !d.classList.contains('divider')) return { trouve: false };
        const enSaisie = () => {
            setMode('text'); wysiwygText.style.display = 'block'; updateStyleBarContext();
            return getComputedStyle(d).display;
        };
        const vu = enSaisie();
        wysiwygText.style.display = 'none';
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
        return { trouve: true, enSaisie: vu, horsSaisie: getComputedStyle(d).display };
    });
    r.egal('le séparateur de la pastille se retire avec elle, et revient avec elle',
        separateur, { trouve: true, enSaisie: 'none', horsSaisie: 'block' });

    // Hors saisie, elle revient : on ne l'a pas supprimée, on l'a rangée.
    const horsSaisie = await page.evaluate(async () => {
        selectedItems = []; setMode('freehand'); updateStyleBarContext();
        await new Promise(ok => setTimeout(ok, 150));
        const b = document.getElementById('btn-color-popover');
        return { vue: getComputedStyle(b).display !== 'none',
                 ctxSaisie: document.getElementById('bar-style').classList.contains('ctx-saisie') };
    });
    r.egal('hors saisie, « Couleur et Opacité » est de retour',
        horsSaisie, { vue: true, ctxSaisie: false });

    // Et une fenêtre de couleur ouverte ne reste pas pendue à un bouton parti.
    const fenetre = await page.evaluate(async () => {
        document.getElementById('btn-color-popover').click();
        await new Promise(ok => setTimeout(ok, 150));
        const ouverte = document.getElementById('color-popover').classList.contains('visible');
        setMode('text');
        wysiwygText.style.display = 'block';
        updateStyleBarContext();
        await new Promise(ok => setTimeout(ok, 150));
        const apres = document.getElementById('color-popover').classList.contains('visible');
        wysiwygText.style.display = 'none';
        updateStyleBarContext();
        return { ouverte, apres };
    });
    r.egal('la fenêtre de couleur se ferme quand sa pastille se range',
        fenetre, { ouverte: true, apres: false });

    // ------------------------------------------------------------------
    // 3. LA POIGNÉE « DÉPLACER » N'EST PLUS BARRÉE
    // Le chrome repliable a été écrit pour les barres COMPOSÉES. Ses règles
    // n'étaient pas préfixées, et « .cbar-head » est aussi la classe de la
    // poignée de la barre de style et de celle du document.
    // ------------------------------------------------------------------
    await page.evaluate(() => { selectedItems = []; setMode('freehand'); updateStyleBarContext(); });
    await page.waitForTimeout(200);
    const poignees = await page.evaluate(() => {
        const lire = (sel) => {
            const p = document.querySelector(sel);
            if (!p) return null;
            const ap = getComputedStyle(p, '::after');
            const r = p.getBoundingClientRect();
            return { barrette: ap.content !== 'none' && ap.backgroundColor !== 'rgba(0, 0, 0, 0)',
                     hauteur: Math.round(r.height), position: getComputedStyle(p).position };
        };
        return { style: lire('#bar-style .drag-handle.cbar-head'),
                 composee: lire('#system-toolbar-main .cbar-head') };
    });
    r.verifie('la poignée de la barre de style n\'a plus de trait en travers',
        poignees.style && !poignees.style.barrette, JSON.stringify(poignees.style));
    // ET ELLE N'EST PLUS UN REPÈRE POUR LA BARRETTE. « position: relative »
    // est ce qui permettait au trait gris de se poser sur l'icône : sans lui,
    // même une règle oubliée n'aurait plus de quoi s'accrocher.
    r.egal('elle n\'offre plus d\'accroche à une barrette égarée',
        poignees.style && poignees.style.position, 'static');
    r.verifie('tandis que les barres composées gardent leur barrette et leurs 22 px',
        poignees.composee && poignees.composee.barrette && poignees.composee.hauteur === 22,
        JSON.stringify(poignees.composee));

    // ------------------------------------------------------------------
    // 4. LE BLOC EN COURS DE SAISIE NE CHANGE PAS DE COULEUR TOUT SEUL
    //
    // C'est l'autre moitié de « ça déconne ». « pushStyleToObject » repeignait
    // le bloc ENTIER pendant qu'on écrivait, et la validation rendait quand
    // même l'ancienne couleur — l'objet se pose avec « couleurBlocSaisie »,
    // figé à l'ouverture. Le professeur voyait son titre virer puis revenir.
    // La règle est pourtant écrite deux fois ailleurs dans le code.
    // ------------------------------------------------------------------
    await page.evaluate(() => {
        texts.length = 0;
        activeStyle.strokeColor = '#e74c3c';
        basculerLAncrageDuTexte(true);
        setMode('text');
    });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 420);          // on ouvre la saisie pour de vrai
    await page.waitForTimeout(350);
    await page.keyboard.type('Titre de la leçon');
    await page.waitForTimeout(200);
    const repeint = await page.evaluate(async () => {
        const avant = getComputedStyle(wysiwygText).color;
        // N'IMPORTE QUEL RÉGLAGE de la barre passe par là : l'épaisseur,
        // l'opacité, une couleur venue d'ailleurs.
        activeStyle.strokeColor = '#1abc9c';
        pushStyleToObject();
        const apres = getComputedStyle(wysiwygText).color;
        finalizeText();
        await new Promise(ok => setTimeout(ok, 250));
        const pose = texts[texts.length - 1];
        return { avant, apres, couleurPosee: pose && pose.color };
    });
    r.egal('ce qui est déjà écrit ne change pas de couleur sous les yeux',
        repeint.apres, repeint.avant);
    r.egal('et le bloc posé garde bien la couleur de son ouverture',
        repeint.couleurPosee, '#e74c3c');

    // MAIS LA TAILLE, ELLE, VAUT POUR TOUT LE BLOC — et doit continuer de
    // suivre. C'est la ligne voisine de celle qu'on vient de retirer : on
    // borne la correction en le disant, sinon le prochain qui nettoiera ce
    // bloc emportera les deux.
    await page.evaluate(() => { texts.length = 0; setMode('text'); });
    await page.waitForTimeout(200);
    await page.mouse.click(500, 420);
    await page.waitForTimeout(350);
    await page.keyboard.type('Grand titre');
    await page.waitForTimeout(200);
    const taille = await page.evaluate(() => {
        const avant = getComputedStyle(wysiwygText).fontSize;
        activeStyle.fontSize = (activeStyle.fontSize || 20) * 2;
        pushStyleToObject();
        const apres = getComputedStyle(wysiwygText).fontSize;
        finalizeText();
        return { avant, apres, aGrandi: parseFloat(apres) > parseFloat(avant) + 1 };
    });
    r.verifie('la taille, elle, suit bien tout le bloc pendant la saisie',
        taille.aGrandi, JSON.stringify(taille));

    // ------------------------------------------------------------------
    // 5. IL N'Y A PLUS « PLUSIEURS PLEIN ÉCRAN »
    //
    // « Je crois qu'il y a plusieurs plein écran. » Il y en avait quatre, pour
    // DEUX gestes seulement — et les quatre portaient les mêmes quatre coins :
    //
    //   projeter LA PAGE      → « doc-plein-ecran » (barre du document)
    //                           et « btn-ecran-presenter » (coin) ;
    //   agrandir LA FENÊTRE   → « btn-ecran-plein » (coin)
    //                           et « btn-fullscreen » (tiroir du bas).
    //
    // Les deux premiers sont voulus — deux portes vers le même geste, dans des
    // meubles différents, et l'on n'enlève pas une porte pour en ouvrir une
    // autre. Les deux suivants faisaient doublon : celui du coin est là en
    // permanence depuis qu'on l'a demandé, celui du tiroir menait au même
    // endroit après avoir ouvert un tiroir. Il est parti.
    //
    // Restait le pire : dans le coin, les deux gestes étaient MITOYENS et
    // portaient la même icône. Projeter pose désormais une page sur un écran ;
    // les quatre coins restent à qui agrandit vraiment la fenêtre.
    // ------------------------------------------------------------------
    const pleins = await page.evaluate((px) => {
        images.length = 0;
        images.push({ id: 'D1', type: 'image', src: px, x: 100, y: 100, w: 600, h: 800 });
        selectedItems = [{ type: 'image', id: 'D1' }];
        majBarreDocument();
        const vus = [];
        document.querySelectorAll('button').forEach(b => {
            const t = (b.dataset.tooltip || b.title || '');
            if (!/plein écran|projeter|présenter/i.test(t)) return;
            const svg = b.querySelector('svg');
            vus.push({ id: b.id || '(sans id)', nom: t.split('—')[0].trim(),
                       dessin: svg ? svg.innerHTML.replace(/\s+/g, ' ').trim() : '' });
        });
        return vus;
    }, PIXEL);

    // LE MENU DES RÉGLAGES N'EST PAS UNE PORTE. On y règle ce que
    // l'application fera ; on n'y fait pas le geste — un réglage n'a donc pas
    // sa place parmi les portes qu'on compte. Mais il doit parler la MÊME
    // LANGUE qu'elles : un réglage qui promettrait un « plein écran » pour ce
    // qui projette une page rouvrirait à lui seul la confusion qu'on vient de
    // fermer, et par la petite porte.
    const reglages = pleins.filter(v => /^rp-/.test(v.id));
    const portes = pleins.filter(v => !/^rp-/.test(v.id));
    r.verifie('un réglage ne promet jamais un « plein écran » : il parle de projeter',
        reglages.every(v => !/plein écran/i.test(v.nom)), JSON.stringify(reglages));

    const projeter = portes.filter(v => /projeter/i.test(v.nom));
    const agrandirLaFenetre = portes.filter(v => /plein écran/i.test(v.nom));
    r.egal('un seul bouton pour agrandir la fenêtre du navigateur',
        agrandirLaFenetre.map(v => v.id), ['btn-ecran-plein']);
    r.egal('et deux portes vers la projection de la page, voulues et jumelles',
        projeter.map(v => v.id).sort(), ['btn-ecran-presenter', 'doc-plein-ecran']);
    r.verifie('les deux portes jumelles portent bien le même dessin',
        projeter.length === 2 && projeter[0].dessin === projeter[1].dessin,
        JSON.stringify(projeter.map(v => v.dessin.slice(0, 50))));

    // LE CŒUR : les deux gestes ne se ressemblent plus.
    const memeDessin = projeter.some(p => agrandirLaFenetre.some(f => f.dessin === p.dessin));
    r.verifie('projeter la page et agrandir la fenêtre n\'ont plus la même icône',
        !memeDessin, JSON.stringify({ projeter: projeter[0] && projeter[0].dessin.slice(0, 60),
                                      fenetre: agrandirLaFenetre[0] && agrandirLaFenetre[0].dessin.slice(0, 60) }));
    r.verifie('et le mot « plein écran » est réservé à la fenêtre',
        projeter.every(v => !/plein écran/i.test(v.nom)),
        JSON.stringify(projeter.map(v => v.nom)));

    // L'icône du coin dit lequel des deux gestes elle fera — et elle ne se
    // réécrit pas à chaque image de l'animation du zoom, où cette fonction
    // repasse douze fois par demi-seconde.
    const bascule = await page.evaluate(async () => {
        const icone = document.getElementById('icone-ecran-presenter');
        const avant = icone.innerHTML;
        let ecritures = 0;
        const observateur = new MutationObserver(() => ecritures++);
        observateur.observe(icone, { childList: true, subtree: true });
        presenterCeQuOnRegarde();
        await new Promise(ok => setTimeout(ok, 300));
        const pendant = icone.innerHTML;
        const apresBascule = ecritures;
        // Dix rafraîchissements de barre sans changement d'état : aucun ne doit
        // toucher au dessin. LE DÉLAI N'EST PAS DÉCORATIF : un MutationObserver
        // livre ses lots en microtâche, donc APRÈS le bloc synchrone. Lire le
        // compteur tout de suite donnait toujours zéro — le contrôle passait
        // même sans le garde-fou, ce qu'un sabotage a montré.
        for (let i = 0; i < 10; i++) majBoutonPresenterDeLEcran();
        await new Promise(ok => setTimeout(ok, 60));
        const apresDix = ecritures;
        observateur.disconnect();
        quitterLaPresentation(); majBarreDocument();
        await new Promise(ok => setTimeout(ok, 200));
        return { change: avant !== pendant, revenu: icone.innerHTML === avant,
                 ecrituresALaBascule: apresBascule > 0, ecrituresEnTrop: apresDix - apresBascule };
    });
    r.verifie('en projetant, l\'icône change pour dire qu\'elle rendra la page',
        bascule.change && bascule.ecrituresALaBascule, JSON.stringify(bascule));
    r.verifie('et elle revient quand on sort', bascule.revenu, JSON.stringify(bascule));
    r.egal('mais dix rafraîchissements sans changement n\'écrivent rien',
        bascule.ecrituresEnTrop, 0);

    // ------------------------------------------------------------------
    // 6. LES QUATRE DU COIN SE LAISSENT COMPRENDRE
    //
    // « Je ne comprends pas le fonctionnement des 4. » Ils répondent à deux
    // questions sans rapport, et l'ordre les mélangeait — affichage,
    // projection, fenêtre, affichage. Trois choses ont changé :
    //
    //   ils sont rangés par famille, séparées par un trait ;
    //   les deux qui paraissent sur l'écran ordinaire sont contre le coin, et
    //   ne bougent donc pas quand les deux autres arrivent ;
    //   le bouton d'affichage ne récite plus la liste des trois états : il dit
    //   où l'on est et ce que l'appui suivant fera.
    // ------------------------------------------------------------------
    const coin = await page.evaluate(async (px) => {
        images.length = 0;
        images.push({ id: 'D1', type: 'image', src: px, x: 100, y: 100, w: 600, h: 800 });
        selectedItems = []; majBarreDocument();
        const lire = () => ['btn-ecran-suite', 'exit-focus-cross', 'ecran-sep',
                            'btn-ecran-presenter', 'btn-ecran-plein'].map(id => {
            const b = document.getElementById(id);
            return { id, vu: getComputedStyle(b).display !== 'none',
                     x: Math.round(b.getBoundingClientRect().x),
                     nom: b.getAttribute('data-tooltip') || '' };
        });
        const par = {};
        for (const e of [0, 1, 2]) {
            poserLAffichage(e);
            await new Promise(ok => setTimeout(ok, 450));
            par[e] = lire();
        }
        poserLAffichage(0);
        await new Promise(ok => setTimeout(ok, 300));
        return par;
    }, PIXEL);

    const place = (etat, id) => (coin[etat].find(b => b.id === id) || {}).x;
    const vu = (etat, id) => (coin[etat].find(b => b.id === id) || {}).vu;

    // LE CYCLE A REJOINT LES DEUX PERMANENTS. Il ne paraissait qu'aux états
    // réduits, parce que la pastille « Focus » du tiroir du bas le portait sur
    // l'écran ordinaire. Cette pastille est partie — elle commandait l'état
    // qui refermait le tiroir où elle vivait, et ne pouvait donc jamais servir
    // à revenir. Sans ce changement, il ne resterait plus aucun chemin vers le
    // cycle sans le clavier. La croix, elle, reste réservée aux états réduits :
    // elle n'a de sens que pour en SORTIR.
    r.egal('sur l\'écran ordinaire, le coin porte le cycle et les deux « en grand »',
        coin[0].filter(b => b.vu).map(b => b.id),
        ['btn-ecran-suite', 'ecran-sep', 'btn-ecran-presenter', 'btn-ecran-plein']);
    r.egal('mais pas la croix : elle ne sert qu\'à sortir d\'un affichage réduit',
        vu(0, 'exit-focus-cross'), false);
    r.verifie('en affichage réduit, les deux de l\'affichage arrivent avec leur trait',
        vu(1, 'btn-ecran-suite') && vu(1, 'exit-focus-cross') && vu(1, 'ecran-sep'),
        JSON.stringify(coin[1].map(b => b.id + ':' + b.vu)));

    // LE CŒUR : les deux permanents ne bougent pas quand les autres arrivent.
    r.egal('et les deux permanents ne bougent pas d\'un pixel',
        [place(1, 'btn-ecran-presenter') - place(0, 'btn-ecran-presenter'),
         place(2, 'btn-ecran-plein') - place(0, 'btn-ecran-plein')], [0, 0]);

    // Les familles se suivent : affichage, affichage, trait, grand, grand.
    const ordre = coin[1].filter(b => b.vu).map(b => b.id);
    r.egal('les deux familles se suivent, le trait entre elles',
        ordre, ['btn-ecran-suite', 'exit-focus-cross', 'ecran-sep',
                'btn-ecran-presenter', 'btn-ecran-plein']);
    // ET LE TRAIT RESTE, PARCE QU'IL A DE NOUVEAU DEUX FAMILLES À SÉPARER :
    // l'affichage à gauche, ce qui passe en grand à droite. Il s'effaçait du
    // temps où la famille de gauche était vide sur l'écran ordinaire.
    r.verifie('et le trait sépare les deux familles, à tous les états',
        vu(0, 'ecran-sep') && vu(1, 'ecran-sep'),
        `${vu(0, 'ecran-sep')} / ${vu(1, 'ecran-sep')}`);

    // LE BOUTON DIT OÙ L'ON EST, ET CE QUE L'APPUI SUIVANT FERA.
    r.verifie('en « barres seules », il dit où l\'on est et ce qui suit',
        /tiroirs sont rangés/.test(coin[1].find(b => b.id === 'btn-ecran-suite').nom)
        && /un appui/.test(coin[1].find(b => b.id === 'btn-ecran-suite').nom),
        coin[1].find(b => b.id === 'btn-ecran-suite').nom);
    r.verifie('en « tableau nu », il dit autre chose : l\'état a changé',
        /tableau nu/.test(coin[2].find(b => b.id === 'btn-ecran-suite').nom)
        && coin[2].find(b => b.id === 'btn-ecran-suite').nom
           !== coin[1].find(b => b.id === 'btn-ecran-suite').nom,
        coin[2].find(b => b.id === 'btn-ecran-suite').nom);
    r.verifie('et il ne récite plus la liste des trois états',
        !/tout \/ les barres seules/i.test(coin[1].find(b => b.id === 'btn-ecran-suite').nom),
        coin[1].find(b => b.id === 'btn-ecran-suite').nom);

    // ------------------------------------------------------------------
    // 6 bis. PERSONNE NE POUSSE PERSONNE
    //
    // « J'ai peur que ça manque de cohérence, ce que j'ai fait avec les boutons
    // en haut à droite. » Mesuré : « projeter » et le plein écran ne bougeaient
    // jamais, mais la VIGNETTE DE RETOUR s'insérait entre le rang des pages et
    // « projeter » — trente-sept pixels de décalage pour le rang. On visait le
    // « 1/2 », il avait glissé.
    //
    // La barre est calée contre le coin et grandit vers la GAUCHE : tout ce qui
    // va et vient doit donc arriver par la gauche. La vignette est passée avant
    // le rang, et plus rien ne pousse personne.
    //
    // ET LE SECOND TRAIT GROUPE CE QUI RESTE : à gauche où l'on en est dans le
    // tableau, à droite ce qui passe en grand. Le premier ne paraît qu'avec la
    // famille de l'affichage ; sans celui-ci, le coin montrait quatre boutons
    // en file où rien ne groupait rien.
    // ------------------------------------------------------------------
    const personneNePousse = await page.evaluate(async (px) => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        poserLAffichage(0);
        pages.length = 0; pages.push(createNewPage()); currentPageIndex = 0;
        images.length = 0; selectedItems = []; traceDesDocuments = [];
        panX = 0; panY = 0; zoom = 1;
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = px; });
        imageCache[px] = img;
        const doc = { id: nextId++, x: 60, y: 40, w: 300, h: 400, cx: 0, cy: 0, cw: 1, ch: 1,
                      src: px, fileName: 'poly.png', z: globalZ++,
                      pluginData: { id: 'pdfDoc', cle: 'coin', page: 1, pages: 3 } };
        images.push(doc);
        selectedItems = [{ type: 'image', id: doc.id }];
        majBarreDocument();
        await attendre(300);
        const ou = (id) => {
            const e = document.getElementById(id);
            // Un élément qui manque tout entier se DIT : un chapitre qui
            // s'arrête ne rend compte de rien.
            if (!e) return { vu: false, x: null, absent: true };
            const r = e.getBoundingClientRect();
            // Un trait fait UN pixel de large : on regarde sa hauteur pour
            // savoir s'il est là, sinon on le déclarerait absent à tort.
            return { vu: getComputedStyle(e).display !== 'none' && r.width >= 1 && r.height > 2,
                     x: Math.round(r.x) };
        };
        const lot = () => ({ pages: ou('ecran-pages'), presenter: ou('btn-ecran-presenter'),
                             plein: ou('btn-ecran-plein'), retour: ou('btn-ecran-retour'),
                             trait: ou('ecran-sep-2') });
        const seul = lot();

        // Une seconde page : on y va, et la vignette de retour paraît.
        pages.push(createNewPage());
        loadPage(pages.length - 1);
        if (typeof majLaPageDuTiroir === 'function') majLaPageDuTiroir();
        if (typeof majLaVignetteDeRetour === 'function') majLaVignetteDeRetour();
        await attendre(400);
        const avecRetour = lot();

        // Et le tableau nu, où la croix arrive elle aussi par la gauche.
        loadPage(0);
        poserLAffichage(2);
        await attendre(500);
        const auTableauNu = lot();
        poserLAffichage(0);
        pages.length = 0; pages.push(createNewPage()); currentPageIndex = 0;
        images.length = 0; selectedItems = []; majBarreDocument();
        await attendre(200);
        return { seul, avecRetour, auTableauNu };
    }, PIXEL);

    r.verifie('la vignette de retour paraît bien, et à GAUCHE du rang des pages',
        personneNePousse.avecRetour.retour.vu
        && personneNePousse.avecRetour.retour.x < personneNePousse.avecRetour.pages.x,
        JSON.stringify(personneNePousse.avecRetour));
    r.egal('et les trois permanents ne bougent pas d\'un pixel quand elle arrive',
        [personneNePousse.avecRetour.pages.x - personneNePousse.seul.pages.x,
         personneNePousse.avecRetour.presenter.x - personneNePousse.seul.presenter.x,
         personneNePousse.avecRetour.plein.x - personneNePousse.seul.plein.x], [0, 0, 0]);
    r.egal('ni quand le tableau nu ramène la croix',
        [personneNePousse.auTableauNu.pages.x - personneNePousse.seul.pages.x,
         personneNePousse.auTableauNu.presenter.x - personneNePousse.seul.presenter.x,
         personneNePousse.auTableauNu.plein.x - personneNePousse.seul.plein.x], [0, 0, 0]);
    r.verifie('le second trait est là en permanence, entre les pages et « projeter »',
        [personneNePousse.seul, personneNePousse.avecRetour, personneNePousse.auTableauNu]
            .every(e => e.trait.vu && e.trait.x > e.pages.x && e.trait.x < e.presenter.x),
        JSON.stringify(personneNePousse));

    // ------------------------------------------------------------------
    // 7. UN APPUI DE TROP SUR LE PLEIN ÉCRAN NE COMPTE PAS
    //
    // « Quand je clique sur le plein écran plusieurs fois, d'un coup je passe à
    // un autre navigateur. » « requestFullscreen » est lent — le gestionnaire
    // de fenêtres redimensionne la fenêtre — mais « fullscreenElement » ne
    // change qu'à la fin. On lisait cet état au moment du clic : deux appuis
    // rapprochés voyaient tous deux « pas en plein écran » et demandaient tous
    // deux d'y entrer. Le second arrive sans geste neuf, le navigateur le
    // refuse, la fenêtre entre et ressort — et celle de derrière remonte.
    //
    // Mesuré avant correction : CINQ appuis rapides envoyaient CINQ demandes.
    // ------------------------------------------------------------------
    const rapide = await page.evaluate(async () => {
        // On compte ce qui part VERS LE NAVIGATEUR, et non ce qu'on voit : le
        // plein écran réel n'est pas pilotable depuis un test.
        let demandes = 0, sorties = 0;
        const vraiDemander = Element.prototype.requestFullscreen;
        const vraiSortir = document.exitFullscreen && document.exitFullscreen.bind(document);
        Element.prototype.requestFullscreen = function () { demandes++; return Promise.resolve(); };
        document.exitFullscreen = function () { sorties++; return Promise.resolve(); };

        // CINQ APPUIS COMME UNE MAIN LES FAIT : espacés de quatre-vingts
        // millisecondes. Une boucle synchrone ne prouverait rien — le
        // garde-fou du verrou est un « setTimeout », et aucun délai ne peut
        // s'écouler entre deux tours d'une boucle serrée ; un garde-fou réglé
        // à zéro passerait le contrôle tout en laissant le bug entier.
        const rendus = [];
        for (let i = 0; i < 5; i++) {
            rendus.push(basculerPleinEcran());
            await new Promise(ok => setTimeout(ok, 80));
        }
        const pendant = { demandes, rendus: rendus.slice() };

        // Le navigateur répond enfin : le verrou s'ouvre, le bouton reprend.
        document.dispatchEvent(new Event('fullscreenchange'));
        await new Promise(ok => setTimeout(ok, 40));
        const repris = basculerPleinEcran();

        Element.prototype.requestFullscreen = vraiDemander;
        if (vraiSortir) document.exitFullscreen = vraiSortir;
        document.dispatchEvent(new Event('fullscreenchange'));
        await new Promise(ok => setTimeout(ok, 40));
        return { pendant, repris, enTout: demandes, sorties };
    });
    r.egal('cinq appuis rapides n\'envoient qu\'UNE demande au navigateur',
        rapide.pendant.demandes, 1);
    r.egal('et seul le premier appui est pris en compte',
        rapide.pendant.rendus, [true, false, false, false, false]);
    r.verifie('le navigateur ayant répondu, le bouton reprend aussitôt',
        rapide.repris === true && rapide.enTout === 2, JSON.stringify(rapide));

    // ET LE VERROU NE RESTE PAS FERMÉ si le navigateur ne répond jamais : sans
    // ce garde-fou, un refus silencieux condamnait le bouton pour la séance.
    const bloque = await page.evaluate(async () => {
        const vrai = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function () { return new Promise(() => { }); };
        basculerPleinEcran();                       // part, et rien ne revient
        const toutDeSuite = basculerPleinEcran();   // refusé, c'est voulu
        await new Promise(ok => setTimeout(ok, 1700));
        const apresLAttente = basculerPleinEcran();
        Element.prototype.requestFullscreen = vrai;
        document.dispatchEvent(new Event('fullscreenchange'));
        return { toutDeSuite, apresLAttente };
    });
    r.egal('un navigateur muet ne condamne pas le bouton pour la séance',
        bloque, { toutDeSuite: false, apresLAttente: true });

    // ET UN REFUS NET ROUVRE LE VERROU TOUT DE SUITE, sans attendre le
    // garde-fou : le navigateur refuse parfois (page pas au premier plan), et
    // faire patienter une seconde et demie après un refus n'a aucun sens.
    const refus = await page.evaluate(async () => {
        const vrai = Element.prototype.requestFullscreen;
        Element.prototype.requestFullscreen = function () { return Promise.reject(new Error('refusé')); };
        basculerPleinEcran();
        await new Promise(ok => setTimeout(ok, 120));   // bien avant le garde-fou
        const repris = basculerPleinEcran();
        Element.prototype.requestFullscreen = vrai;
        document.dispatchEvent(new Event('fullscreenchange'));
        await new Promise(ok => setTimeout(ok, 40));
        return { repris };
    });
    r.egal('un refus net rouvre le verrou sans attendre le garde-fou',
        refus, { repris: true });

    // LE BOUTON DIT OÙ L'ON EST : on appuyait plusieurs fois faute de le savoir.
    const ditOuOnEst = await page.evaluate(async () => {
        const b = document.getElementById('btn-ecran-plein');
        const dehors = { allume: b.classList.contains('actif'), nom: b.getAttribute('data-tooltip') };
        // On fait comme si le navigateur nous avait mis en plein écran.
        const vrai = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement');
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement });
        majBoutonDuPleinEcran();
        const dedans = { allume: b.classList.contains('actif'), nom: b.getAttribute('data-tooltip') };
        delete document.fullscreenElement;
        if (vrai) Object.defineProperty(Document.prototype, 'fullscreenElement', vrai);
        majBoutonDuPleinEcran();
        return { dehors, dedans, revenu: b.getAttribute('data-tooltip') };
    });
    r.verifie('dehors, il propose d\'entrer en plein écran',
        !ditOuOnEst.dehors.allume && !/Quitter/.test(ditOuOnEst.dehors.nom),
        JSON.stringify(ditOuOnEst.dehors));
    r.verifie('dedans, il s\'allume et propose d\'en sortir',
        ditOuOnEst.dedans.allume && /Quitter/.test(ditOuOnEst.dedans.nom),
        JSON.stringify(ditOuOnEst.dedans));
    r.verifie('et il reprend sa promesse en sortant',
        !/Quitter/.test(ditOuOnEst.revenu), ditOuOnEst.revenu);

    // ------------------------------------------------------------------
    // 8. LES QUATRE DU COIN ONT ENFIN UNE INFOBULLE
    //
    // « Tu me mets des tooltips sur les icônes en haut à droite. » Ils n'en
    // avaient AUCUNE, et c'est la vraie cause du « je ne comprends pas le
    // fonctionnement des 4 » : ils portaient « data-title », que rien ne lit —
    // ni le navigateur, qui ne connaît que « title », ni l'infobulle maison,
    // qui ne s'ouvre que sur « data-tooltip ». Quatre boutons muets.
    //
    // On éprouve ici que la bulle S'OUVRE VRAIMENT, et pas seulement que
    // l'attribut existe : c'était précisément l'erreur d'avant.
    // ------------------------------------------------------------------
    await page.evaluate(() => poserLAffichage(1));
    await page.waitForTimeout(450);

    const bulles = [];
    for (const id of ['btn-ecran-suite', 'exit-focus-cross', 'btn-ecran-presenter', 'btn-ecran-plein']) {
        const y = await page.evaluate((i) => {
            const b = document.getElementById(i);
            const r = b.getBoundingClientRect();
            return { vu: getComputedStyle(b).display !== 'none',
                     x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, id);
        if (!y.vu) { bulles.push({ id, texte: '(bouton caché)' }); continue; }
        await page.mouse.move(y.x, y.y);
        await page.waitForTimeout(900);
        bulles.push(await page.evaluate((i) => {
            const t = document.querySelector('.dt-tooltip, #dt-tooltip, [class*="dt-tooltip"]');
            const ouverte = t && t.classList.contains('visible');
            return { id: i, ouverte: !!ouverte, texte: ouverte ? t.textContent.trim() : '' };
        }, id));
        await page.mouse.move(700, 700);
        await page.waitForTimeout(350);
    }

    r.verifie('les quatre ouvrent une infobulle au survol',
        bulles.every(b => b.ouverte), JSON.stringify(bulles));
    r.verifie('et chacune dit quelque chose de différent',
        new Set(bulles.map(b => b.texte)).size === 4, JSON.stringify(bulles.map(b => b.texte)));
    // ET ELLES SUIVENT L'ÉTAT. Deux d'entre elles changent de texte selon ce
    // qu'un appui fera ; c'est le script qui les écrit, et c'est donc là qu'il
    // faut regarder — survoler dans un seul état ne prouverait rien.
    const apresBascule = await page.evaluate(async () => {
        const avant = {
            affichage: document.getElementById('btn-ecran-suite').getAttribute('data-tooltip'),
            projeter: document.getElementById('btn-ecran-presenter').getAttribute('data-tooltip')
        };
        poserLAffichage(2);
        images.length = 0;
        images.push({ id: 'DP', type: 'image', src: document.querySelector('img') ? '' : '', x: 0, y: 0, w: 10, h: 10 });
        images.length = 0;
        await new Promise(ok => setTimeout(ok, 350));
        const apres = {
            affichage: document.getElementById('btn-ecran-suite').getAttribute('data-tooltip')
        };
        poserLAffichage(1);
        await new Promise(ok => setTimeout(ok, 350));
        return { avant, apres };
    });
    r.verifie('celui de l\'affichage change de texte avec l\'état',
        apresBascule.avant.affichage && apresBascule.apres.affichage
        && apresBascule.avant.affichage !== apresBascule.apres.affichage,
        JSON.stringify(apresBascule));
    r.verifie('et celui de la projection dit ce qu\'il fera',
        /Projeter la page/.test(apresBascule.avant.projeter || ''),
        String(apresBascule.avant.projeter));

    r.verifie('celle du plein écran montre sa touche',
        /Ctrl\+Maj\+F/.test((bulles.find(b => b.id === 'btn-ecran-plein') || {}).texte || ''),
        (bulles.find(b => b.id === 'btn-ecran-plein') || {}).texte);
    // ET PAS DEUX FOIS : la touche vit dans « data-raccourci », l'infobulle la
    // pose elle-même. L'écrire aussi dans le texte la ferait paraître double.
    r.verifie('et une seule fois',
        ((bulles.find(b => b.id === 'btn-ecran-plein') || {}).texte || '')
            .split('Ctrl+Maj+F').length === 2,
        (bulles.find(b => b.id === 'btn-ecran-plein') || {}).texte);

    // ET AUCUNE NE RÉCITE SA TOUCHE EN PROSE. Celui qui projette la page
    // écrivait la sienne dans son propre texte — « Projeter la page en grand
    // (D) » — là où ses trois voisins la montrent comme une vraie touche,
    // posée à part. Quatre boutons mitoyens, deux façons de dire la même
    // chose : le professeur y lit deux mécaniques au lieu d'une.
    const enProse = bulles.filter(b => /[(（]\s*(Ctrl|Cmd|Alt|Maj|Shift|Suppr|Échap|Esc|D)\b[^)）]*[)）]/.test(b.texte));
    r.egal('aucune ne récite sa touche entre parenthèses', enProse.map(b => b.id), []);
    const touches = await page.evaluate(() =>
        ['btn-ecran-suite', 'exit-focus-cross', 'btn-ecran-presenter', 'btn-ecran-plein']
            .map(i => ({ id: i, t: document.getElementById(i).getAttribute('data-raccourci') })));
    r.egal('et celles qui ont une touche la portent dans l\'attribut prévu',
        touches.filter(x => x.t).map(x => x.id),
        ['exit-focus-cross', 'btn-ecran-presenter', 'btn-ecran-plein']);

    // PLUS AUCUN « data-title » ORPHELIN dans la page : c'est l'attribut qui
    // ne dit rien à personne, et il avait déjà rendu quatre boutons muets.
    const muets = await page.evaluate(() => [...document.querySelectorAll('[data-title]')]
        .filter(e => !e.hasAttribute('data-tooltip') && !e.hasAttribute('title')
                     && !/^(default|blue|green|purple|amber|pink|slate|teal)$/.test(e.getAttribute('data-title')))
        .map(e => e.id || e.className.toString().slice(0, 30)));
    r.egal('aucun bouton ne porte plus un nom que rien n\'affiche', muets, []);

    await page.evaluate(() => poserLAffichage(0));
    await page.waitForTimeout(350);

    // ==================================================================
    // ET AUCUNE FONCTION NE PORTE DEUX FOIS LE MÊME NOM.
    //
    // Ce n'est pas un doublon de barre, c'en est un de code, et il se termine
    // de la même façon : deux choses répondent au même nom, et l'on ne sait
    // plus laquelle fait foi. C'est arrivé pour de bon. « dureeLisible » était
    // la durée d'une étape de lecture, en MILLISECONDES ; l'emploi du temps en
    // a déclaré une seconde, en MINUTES, six mille lignes plus bas. Les
    // déclarations de fonction se hissent, la dernière l'emporte : le rythme de
    // lecture s'est mis à annoncer « 233 h 20 » au lieu de « 3,5 s ».
    //
    // AUCUN CHAPITRE N'AVAIT DE RAISON DE LE VOIR — celui qui éprouvait
    // l'emploi du temps passait, celui de la lecture était à l'autre bout de la
    // suite. Un défaut qui ne se révèle que par un croisement lointain demande
    // une garde de structure, pas une vérification de plus.
    //
    // ON LIT LES FICHIERS, et non la page : une fonction écrasée n'existe plus
    // qu'en un exemplaire dans « window », ce qui est précisément ce qui la
    // rend invisible.
    const fs = require('fs');
    const path = require('path');
    const racine = path.join(__dirname, '..');
    const doublons = {};
    ['script.js', 'plugin.js'].forEach(nom => {
        const source = fs.readFileSync(path.join(racine, nom), 'utf8');
        const vus = new Map();
        // Les déclarations de premier niveau seulement : celles qui se hissent
        // dans la portée du fichier. Une fonction indentée vit dans la sienne.
        const motif = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
        let m;
        while ((m = motif.exec(source)) !== null) {
            const ligne = source.slice(0, m.index).split('\n').length;
            vus.set(m[1], (vus.get(m[1]) || []).concat(ligne));
        }
        vus.forEach((lignes, nomFn) => {
            if (lignes.length > 1) doublons[nom + ' · ' + nomFn] = lignes;
        });
    });
    r.egal('aucune fonction de premier niveau n\'est déclarée deux fois',
        doublons, {});

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
