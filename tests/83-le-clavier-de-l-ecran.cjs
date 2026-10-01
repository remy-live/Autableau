// LE CLAVIER DE L'ÉCRAN
//
// « On pourrait rajouter un clavier optionnel pour le texte, comme cela on
// aura vraiment une appli qui peut se passer du clavier. »
// « Parfois on n'a pas besoin que ça s'ouvre tout seul, je suis plus souvent
// à l'ordi qu'au TBI. »
// « Il faut que le clavier puisse s'étendre en bas, se bouger voire changer
// de taille. »
//
// LE GESTE DIT L'OUTIL. La seconde phrase écarte toute règle de durée et tout
// réglage à retenir : ce qui sépare le TBI du bureau, c'est qu'au tableau on
// TOUCHE et qu'au bureau on CLIQUE. L'événement le dit lui-même —
// « pointerType » vaut « touch » ou « mouse » —, tout de suite, sans rien
// chronométrer. À la souris, le clavier ne paraît jamais.
//
// C'EST CE CHAPITRE QUI TIENT CETTE PROMESSE. Elle ne se voit pas à l'œil :
// qui essaie à la souris ne verra rien, et conclura que le clavier ne marche
// pas ; qui essaie au doigt ne saura pas qu'il aurait dû se taire ailleurs.
// Seules les deux mesures côte à côte disent la règle.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Le clavier de l\'écran');
    // « tactile » : le contexte doit savoir produire de VRAIES tapes, sans
    // quoi la moitié de ce chapitre ne mesurerait rien.
    const { context, page, erreurs } = await ouvrirApp(browser, {
        viewport: { width: 1280, height: 800 }, tactile: true });
    await page.waitForFunction(() => typeof basculerLeClavier === 'function', { timeout: 20000 });
    await tableauVierge(page);

    const etat = () => page.evaluate(() => {
        const e = document.getElementById('clavier-ecran');
        const q = e ? e.getBoundingClientRect() : null;
        return {
            ouvert: clavierEstOuvert(),
            saisie: wysiwygText.style.display,
            boite: q ? { l: Math.round(q.width), h: Math.round(q.height),
                         x: Math.round(q.left), bas: Math.round(q.bottom) } : null,
            enBas: !!(e && e.classList.contains('clavier-en-bas'))
        };
    });
    const toucheA = (sel) => page.evaluate((s) => {
        const e = document.querySelector('#clavier-ecran ' + s);
        if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: Math.round(q.left + q.width / 2), y: Math.round(q.top + q.height / 2) };
    }, sel);
    const frapper = async (sel) => {
        const p = await toucheA(sel);
        if (!p) return false;
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(110);
        return true;
    };

    // ------------------------------------------------------------------
    // 0. L'ENTRÉE DE MENU DIT CE QU'ELLE FERA, DÈS LA PREMIÈRE OUVERTURE
    //
    // Le libellé écrit dans la page n'est mesuré nulle part ailleurs : le
    // JavaScript le réécrit au premier basculement, si bien qu'un libellé
    // d'origine faux se corrigeait tout seul au premier clic et passait
    // inaperçu. Il se lit donc AVANT qu'on ait touché à quoi que ce soit.
    // ------------------------------------------------------------------
    r.egal('au départ, le bouton propose le clavier',
        await page.evaluate(() => {
            const b = document.getElementById('btn-clavier-ecran');
            return b ? b.getAttribute('data-tooltip') : '(absent)';
        }), 'Clavier à l\'écran');

    // ------------------------------------------------------------------
    // 1. À LA SOURIS, IL NE PARAÎT PAS
    // ------------------------------------------------------------------
    await page.evaluate(() => setMode('text'));
    await page.mouse.click(400, 300);
    await page.waitForTimeout(450);
    const souris = await etat();
    r.egal('la saisie s\'ouvre bien au clic', souris.saisie, 'block', JSON.stringify(souris));
    r.egal('ET LE CLAVIER NE PARAÎT PAS', souris.ouvert, false, JSON.stringify(souris));

    // ------------------------------------------------------------------
    // 2. AU DOIGT, IL PARAÎT
    // ------------------------------------------------------------------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(400, 300);
    await page.waitForTimeout(600);
    const doigt = await etat();
    r.egal('la saisie s\'ouvre aussi au doigt', doigt.saisie, 'block', JSON.stringify(doigt));
    r.egal('ET LE CLAVIER PARAÎT', doigt.ouvert, true, JSON.stringify(doigt));
    r.verifie('avec de quoi écrire : plus de quarante touches',
        (await page.evaluate(() => document.querySelectorAll('#clavier-ecran .clavier-touche').length)) >= 40,
        String(await page.evaluate(() => document.querySelectorAll('#clavier-ecran .clavier-touche').length)));

    // ------------------------------------------------------------------
    // 3. IL ÉCRIT, ET IL NE VOLE PAS LE CURSEUR
    //
    // Une touche d'écran est un BOUTON, et un bouton prend le focus : la
    // première frappe aurait écrit, et la seconde serait tombée dans le vide.
    // Chaque touche annule donc son « pointerdown ».
    // ------------------------------------------------------------------
    for (const l of ['b', 'o', 'n']) {
        r.verifie(`la touche « ${l} » existe`, await frapper(`.clavier-touche[data-lettre="${l}"]`), l);
    }
    const ecrit = await page.evaluate(() => ({
        texte: wysiwygText.textContent,
        focus: document.activeElement ? document.activeElement.id : null
    }));
    r.egal('TROIS TOUCHES ÉCRIVENT TROIS LETTRES', ecrit.texte, 'bon');
    r.egal('et le curseur n\'a pas quitté la saisie', ecrit.focus, 'wysiwyg-text');

    // ------------------------------------------------------------------
    // 4. LA MAJUSCULE NE VAUT QUE POUR LA LETTRE SUIVANTE
    //
    // C'est ce que fait le clavier d'un téléphone, et ce qu'on veut neuf fois
    // sur dix : un prénom, un début de phrase.
    // ------------------------------------------------------------------
    await frapper('.clavier-touche[data-act="majuscule"]');
    const montree = await page.evaluate(() =>
        document.querySelector('#clavier-ecran .clavier-touche[data-lettre="a"]').textContent);
    r.egal('les touches passent en majuscules', montree, 'A');
    await frapper('.clavier-touche[data-lettre="j"]');
    await frapper('.clavier-touche[data-lettre="o"]');
    r.egal('UNE SEULE MAJUSCULE, PUIS ON REDESCEND',
        await page.evaluate(() => wysiwygText.textContent), 'bonJo');
    r.egal('et les touches le montrent',
        await page.evaluate(() =>
            document.querySelector('#clavier-ecran .clavier-touche[data-lettre="a"]').textContent), 'a');

    // ------------------------------------------------------------------
    // 5. L'ESPACE ET L'EFFACEMENT
    // ------------------------------------------------------------------
    await frapper('.clavier-touche[data-act="espace"]');
    // UN ESPACE INSÉCABLE, ET C'EST LE NAVIGATEUR QUI A RAISON : un espace
    // ordinaire posé en fin de ligne dans un bloc éditable serait replié à
    // l'affichage, donc perdu. « execCommand » pose donc « \u00a0 ». Le
    // contrôle compare le NOMBRE de caractères et la nature du dernier, plutôt
    // que d'exiger un octet qui n'a pas lieu d'être.
    const apresEspace = await page.evaluate(() => wysiwygText.textContent);
    r.egal('l\'espace s\'écrit', apresEspace.length, 6, JSON.stringify(apresEspace));
    r.verifie('et c\'est bien une espace', /[\s\u00a0]$/.test(apresEspace), JSON.stringify(apresEspace));
    r.egal('le reste est intact', apresEspace.slice(0, 5), 'bonJo');
    await frapper('.clavier-touche[data-act="effacer"]');
    r.egal('et l\'effacement reprend la dernière lettre',
        await page.evaluate(() => wysiwygText.textContent), 'bonJo');

    // ------------------------------------------------------------------
    // 6. IL SE RANGE AU BORD BAS, SUR TOUTE LA LARGEUR
    //
    // L'équipement commun des fenêtres pose « max-width: calc(100vw - 16px) »
    // EN LIGNE, pour qu'aucune fenêtre flottante ne déborde. La règle est
    // bonne pour une fenêtre et fausse pour un clavier collé au bord : mesuré,
    // 1264 pixels au lieu de 1280, seize pixels de blanc à droite.
    // ------------------------------------------------------------------
    const avantRangement = await etat();
    r.egal('avant rangement, il flotte', avantRangement.enBas, false, JSON.stringify(avantRangement));
    await frapper('.clavier-ranger');
    const range = await etat();
    const ecran = await page.evaluate(() => ({ l: innerWidth, h: innerHeight }));
    r.egal('il se range', range.enBas, true, JSON.stringify(range));
    r.egal('IL PREND TOUTE LA LARGEUR', range.boite.l, ecran.l, JSON.stringify({ range, ecran }));
    r.egal('et il touche le bord bas', range.boite.bas, ecran.h, JSON.stringify({ range, ecran }));
    r.egal('depuis le bord gauche', range.boite.x, 0, JSON.stringify(range));

    // ------------------------------------------------------------------
    // 6 bis. ON NE LE RÉDUIT PAS SOUS CE QU'IL FAUT POUR L'AFFICHER
    //
    // « Le redimensionnement est particulier. » Mesuré : à 420 × 200, SOIXANTE
    // ET UNE paires de touches se chevauchaient ; à 300 × 150, quatre-vingt-
    // quatre. Les touches gardent une hauteur minimale, la rangée n'en a plus
    // assez à leur donner, et elles se grimpent dessus — le clavier devient
    // une bouillie dont aucune touche n'est sûre.
    //
    // CE QUE MESURE CE CONTRÔLE : zéro chevauchement, à TOUTE taille, y
    // compris celles qu'on demande et qui n'existent pas. Il ne fige aucun
    // nombre de pixels : une rangée ajoutée demain changera le plancher, pas
    // la règle.
    // ------------------------------------------------------------------
    const tailles = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const e = document.getElementById('clavier-ecran');
        e.classList.remove('clavier-en-bas');
        const essai = async (l, h) => {
            e.style.width = l + 'px'; e.style.height = h + 'px';
            await attendre(60);
            const q = e.getBoundingClientRect();
            const b = [...e.querySelectorAll('.clavier-touche')].map(t => t.getBoundingClientRect());
            let croisees = 0;
            for (let i = 0; i < b.length; i++) {
                for (let j = i + 1; j < b.length; j++) {
                    if (b[i].left < b[j].right - 1 && b[j].left < b[i].right - 1
                        && b[i].top < b[j].bottom - 1 && b[j].top < b[i].bottom - 1) croisees++;
                }
            }
            return { demande: l + '×' + h,
                     obtenu: Math.round(q.width) + '×' + Math.round(q.height),
                     croisees,
                     dehors: b.filter(t => t.bottom > q.bottom + 1 || t.right > q.right + 1).length,
                     touche: Math.round(b[0].width) + '×' + Math.round(b[0].height) };
        };
        const lu = [];
        for (const [l, h] of [[680, 300], [440, 290], [300, 150], [200, 100], [1100, 520]]) {
            lu.push(await essai(l, h));
        }
        e.style.width = ''; e.style.height = '';
        return lu;
    });
    r.egal('AUCUNE TOUCHE N\'EN CHEVAUCHE UNE AUTRE, À AUCUNE TAILLE',
        tailles.filter(t => t.croisees > 0).map(t => t.demande + ' : ' + t.croisees), []);
    r.egal('et aucune ne déborde du clavier',
        tailles.filter(t => t.dehors > 0).map(t => t.demande), []);
    // LE PLANCHER TIENT : réduit trop, il ne descend pas — et ce n'est pas la
    // même chose que « il n'a pas bougé », qu'un clavier figé satisferait
    // aussi. Agrandi, il grandit pour de bon : les touches passent de 32 à 89
    // pixels de large.
    r.verifie('réduit trop, il s\'arrête à son plancher',
        tailles[2].obtenu === tailles[1].obtenu && tailles[3].obtenu === tailles[1].obtenu,
        JSON.stringify(tailles));
    r.verifie('ET AGRANDI, LES TOUCHES GRANDISSENT AVEC',
        parseInt(tailles[4].touche, 10) > 2 * parseInt(tailles[1].touche, 10),
        tailles[1].touche + ' → ' + tailles[4].touche);

    // ------------------------------------------------------------------
    // 7. RANGÉ, IL DEVIENT UN MEUBLE DU BORD — FLOTTANT, NON
    //
    // Ce qui se place « en bas faute de mieux » doit s'arrêter au-dessus de
    // lui. Mais une fenêtre qu'on déplace d'un doigt n'est pas un meuble :
    // flottant, il se pose à vingt-quatre pixels du bord, ce qui suffisait à
    // le faire compter — le plafond tombait à 476 et les barres remontaient
    // pour rien.
    // ------------------------------------------------------------------
    const planchers = await page.evaluate(async () => {
        const attendre = (ms) => new Promise(ok => setTimeout(ok, ms));
        const lu = {};
        // ON LE RANGE ICI MÊME. La section d'avant l'a détaché pour éprouver
        // les tailles : hériter de son état ferait mesurer autre chose que ce
        // qu'on croit — ce contrôle est tombé pour cette seule raison.
        rangerLeClavierEnBas(true); await attendre(150);
        lu.range = plafondDesBarresDuBas();
        rangerLeClavierEnBas(false); await attendre(150);
        lu.flottant = plafondDesBarresDuBas();
        fermerLeClavier(true); await attendre(150);
        lu.ferme = plafondDesBarresDuBas();
        return Object.assign(lu, { ecran: innerHeight });
    });
    r.verifie('rangé, il relève le plancher des barres',
        planchers.range < planchers.ecran - 100, JSON.stringify(planchers));
    r.egal('FLOTTANT, IL NE LE RELÈVE PAS', planchers.flottant, planchers.ecran, JSON.stringify(planchers));
    r.egal('et fermé non plus', planchers.ferme, planchers.ecran, JSON.stringify(planchers));

    // ------------------------------------------------------------------
    // 8. UN REFUS VAUT POUR LA SÉANCE
    //
    // Qui le ferme à la main ne doit plus le voir s'ouvrir seul. C'est la
    // réponse directe à « parfois on n'a pas besoin que ça s'ouvre tout
    // seul » : une fois suffit à le dire, et son bouton le rappelle.
    // ------------------------------------------------------------------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(500, 320);
    await page.waitForTimeout(600);
    const apresRefus = await etat();
    r.egal('APRÈS L\'AVOIR FERMÉ, IL NE SE ROUVRE PLUS SEUL', apresRefus.ouvert, false,
        JSON.stringify(apresRefus));

    // MAIS SON ENTRÉE DE MENU LE RAPPELLE, et le redemander lève le refus.
    //
    // Elle n'est pas dans la barre du texte, et c'est une décision : l'y
    // mettre portait la barre à onze commandes et 404 pixels pour une limite
    // de 420 — le compte de dix protégeait les seize derniers pixels d'une
    // barre qui doit tenir sur une tablette. Sa place est d'ailleurs meilleure
    // au menu : le clavier écrit dans n'importe quel champ, là où la barre du
    // texte n'existe que pendant qu'on écrit sur le tableau.
    const auMenu = await page.evaluate(() => {
        const b = document.getElementById('btn-clavier-ecran');
        // UNE ABSENCE SE RAPPORTE, ELLE NE FAIT PAS PLANTER. Sabotage fait :
        // sans le bouton, l'épreuve s'arrêtait net sur « voisins » indéfini et
        // les quarante contrôles mouraient avec elle. Un contrôle qui plante
        // dit bien qu'il y a un problème, mais il ne dit pas LEQUEL.
        if (!b) return { absent: true, dansLaBarre: false, dansUnMenu: false, voisins: [] };
        b.click();
        return { absent: false,
                 dansLaBarre: !!document.querySelector('#text-toolbar #btn-clavier-ecran'),
                 // ET PAS ENTERRÉ DANS UN MENU. Il l'a été : dans celui de
                 // l'EXPORTATION, où personne ne cherche un clavier.
                 dansUnMenu: !!b.closest('.popup-content'),
                 // LE VOISINAGE SE LIT SUR LE BLOC, pas sur le parent
                 // immédiat : certains boutons vivent dans une enveloppe à
                 // eux, et l'on ne verrait alors que deux voisins.
                 voisins: (() => {
                     const bloc = b.closest('.tiroir-groupe') || b.parentElement;
                     return [...bloc.querySelectorAll('button.btn')]
                         .map(x => x.id).filter(Boolean).slice(0, 12);
                 })() };
    });
    await page.waitForTimeout(300);
    r.egal('le bouton existe', auMenu.absent, false, JSON.stringify(auMenu));
    r.egal('il n\'encombre pas la barre du texte', auMenu.dansLaBarre, false);
    r.egal('ET IL N\'EST PAS ENTERRÉ DANS UN MENU', auMenu.dansUnMenu, false, JSON.stringify(auMenu));
    r.verifie('il voisine les aides du tiroir : l\'aimant, le zoom, les raccourcis',
        auMenu.voisins.includes('btn-help') && auMenu.voisins.includes('btn-loupe'),
        JSON.stringify(auMenu.voisins));
    r.egal('son bouton le rappelle', (await etat()).ouvert, true);
    r.egal('et il dit alors comment le ranger',
        await page.evaluate(() => {
            const b = document.getElementById('btn-clavier-ecran');
            return b ? b.getAttribute('data-tooltip') : '(bouton absent)';
        }),
        'Ranger le clavier à l\'écran');
    // Et il revient à sa première phrase une fois le clavier rangé.
    await page.evaluate(() => { const b = document.getElementById('btn-clavier-ecran'); if (b) b.click(); });
    await page.waitForTimeout(250);
    r.egal('rangé, il repropose de l\'ouvrir',
        await page.evaluate(() => {
            const b = document.getElementById('btn-clavier-ecran');
            return b ? b.getAttribute('data-tooltip') : '(bouton absent)';
        }),
        'Clavier à l\'écran');
    await page.evaluate(() => { clavierEcarte = false; ouvrirLeClavier(); });
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => setMode('text'));
    await page.touchscreen.tap(560, 360);
    await page.waitForTimeout(600);
    r.egal('et le redemander lui rend sa spontanéité', (await etat()).ouvert, true);

    await page.evaluate(() => { fermerLeClavier(true); });
    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
