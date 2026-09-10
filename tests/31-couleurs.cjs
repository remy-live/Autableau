// LA PASTILLE DE COULEUR : CE QU'ELLE OFFRE, ET CE QU'ELLE DIT.
//
// « J'aimerais pour les outils rectangles, traits et autres plus de couleurs
// (16), l'affichage des dernières couleurs personnalisées (avec possibilité
// de supprimer des couleurs) et la possibilité de lier le fond et le bord.
// Est-ce que la pastille de couleur est cohérente ? »
//
// Non, elle ne l'était pas. Elle montrait un ANNEAU — le trait — autour d'un
// DISQUE — le fond — quoi qu'on fasse : au crayon, à la gomme, sur un texte,
// sur un segment, ce disque intérieur annonçait un fond que rien ne pouvait
// porter, et l'onglet « Fond » restait là pour régler une chose sans effet.
// Le fond n'a de sens que sur ce qui a un dedans : cercle, rectangle,
// polygone, courbe fermée.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('Couleurs');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });
    await page.waitForFunction(() => typeof choisirLaCouleur === 'function', { timeout: 25000 });

    // =====================================================================
    // SEIZE COULEURS, ET DES COULEURS D'ÉCOLE
    // Sept, c'était la boîte de crayons la plus pauvre de l'armoire : pas de
    // blanc pour écrire sur un fond sombre, pas de brun, pas de rose, un
    // seul bleu et un seul vert.
    // =====================================================================
    const grille = await page.evaluate(() => {
        // LA GRILLE SE MESURE OUVERTE : repliée, « display:none » ramène ses
        // colonnes à rien, et l'on compterait la mise en page d'un tiroir
        // fermé au lieu de celle qu'on voit.
        document.getElementById('color-popover').classList.add('visible');
        const dots = [...document.querySelectorAll('#color-popover .color-dot')];
        const hex = dots.map(d => d.dataset.color.toLowerCase());
        // Une teinte, en degrés ; le blanc et les gris n'en ont pas.
        const teinte = (c) => {
            const n = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16) / 255);
            const max = Math.max(...n), min = Math.min(...n);
            if (max - min < 0.08) return null;
            let h;
            if (max === n[0]) h = (n[1] - n[2]) / (max - min);
            else if (max === n[1]) h = 2 + (n[2] - n[0]) / (max - min);
            else h = 4 + (n[0] - n[1]) / (max - min);
            return ((h * 60) + 360) % 360;
        };
        const clarte = (c) => {
            const n = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
            return (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255;
        };
        return {
            combien: hex.length,
            septPremieres: hex.slice(0, 7),
            cellules: document.querySelector('#color-popover .color-grid').children.length,
            colonnes: getComputedStyle(document.querySelector('#color-popover .color-grid'))
                .gridTemplateColumns.split(' ').length,
            dernier: document.querySelector('#color-popover .color-grid').lastElementChild.className,
            croixDansLaGrille: !!document.querySelector('#color-popover .color-grid #btn-no-fill'),
            doublons: hex.filter((c, i) => hex.indexOf(c) !== i),
            // Toutes lisibles ? Un jaune sur blanc reste un jaune : ce qu'on
            // vérifie, c'est qu'aucune n'est un doublon déguisé.
            teintes: [...new Set(hex.map(teinte).filter(t => t !== null).map(t => Math.round(t / 30)))].length,
            blanc: hex.includes('#ffffff'),
            noir: hex.some(c => clarte(c) < 0.2),
            // Le sélecteur du système et le « sans fond » sont toujours là.
            perso: !!document.getElementById('popover-custom-color'),
            sansFond: !!document.getElementById('btn-no-fill')
        };
    });
    r.egal('la palette offre quinze couleurs', grille.combien, 15);
    // DEUX RANGÉES DE HUIT, PLEINES. « Mets 15 couleurs pour avoir 2 lignes de
    // 8 couleurs (multicolore au fond). » Le nuancier ferme la marche : c'est
    // par lui qu'on sort de la palette.
    r.egal('avec le nuancier en seizième, cela fait deux rangées de huit',
        { cellules: grille.cellules, colonnes: grille.colonnes, dernier: grille.dernier },
        { cellules: 16, colonnes: 8, dernier: 'custom-color-btn' });
    // « NE METS PAS DE CROIX POUR LE COIN SUPÉRIEUR GAUCHE ET LE COIN INFÉRIEUR
    // DROIT. » « Sans fond » n'est pas une couleur : posé dans la grille, sa
    // croix occupait un coin et cassait les deux rangées.
    r.egal('et « sans fond » a quitté la grille : plus de croix dans un coin',
        grille.croixDansLaGrille, false);
    await page.evaluate(() => document.getElementById('color-popover').classList.remove('visible'));
    // LES SEPT PREMIÈRES NE BOUGENT PAS D'UN RANG : Ctrl+Maj+chiffre arme la
    // couleur de ce rang-là, et un enseignant les a dans la main.
    r.egal('et les sept premières sont restées à leur rang, pour les raccourcis',
        grille.septPremieres,
        ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#2d3436']);
    r.egal('et pas deux fois la même', grille.doublons, []);
    r.verifie('elles couvrent au moins six familles de teintes',
        grille.teintes >= 6, JSON.stringify(grille));
    r.verifie('le blanc et un noir profond en font partie : on écrit aussi sur fond sombre',
        grille.blanc && grille.noir, JSON.stringify(grille));
    r.verifie('le sélecteur libre et le « sans fond » restent à leur place',
        grille.perso && grille.sansFond, JSON.stringify(grille));

    // =====================================================================
    // LA PASTILLE DIT VRAI
    // =====================================================================
    const parOutil = await page.evaluate(() => {
        const lire = () => {
            const p = document.getElementById('color-indicator');
            const onglet = document.querySelector('#color-popover .popover-tab[data-target="fill"]');
            const lien = document.getElementById('btn-lier-fond-bord');
            return { sens: leFondADuSens(),
                     pleine: p.classList.contains('pastille-pleine'),
                     ongletFond: getComputedStyle(onglet).display !== 'none',
                     lien: getComputedStyle(lien).display !== 'none',
                     // Un disque plein : le dedans a la couleur du trait.
                     dedans: p.style.background, autour: p.style.borderColor };
        };
        const vu = {};
        ['freehand', 'text', 'segment', 'rectangle', 'circle', 'polygon'].forEach(m => {
            selectedItems = []; setMode(m);
            majCoherenceDeLaPastille(); updateColorIndicator();
            vu[m] = lire();
        });
        setMode('pointer'); selectedItems = [];
        majCoherenceDeLaPastille(); updateColorIndicator();
        return vu;
    });
    ['freehand', 'text', 'segment'].forEach(outil => {
        r.egal(`au ${outil === 'freehand' ? 'crayon' : outil === 'text' ? 'texte' : 'trait'}, `
            + 'le fond n\'a pas de sens : ni onglet, ni anneau creux',
            { sens: parOutil[outil].sens, pleine: parOutil[outil].pleine,
              onglet: parOutil[outil].ongletFond, lien: parOutil[outil].lien },
            { sens: false, pleine: true, onglet: false, lien: false });
    });
    ['rectangle', 'circle', 'polygon'].forEach(outil => {
        r.egal(`sur un ${outil}, le fond a un sens : l'onglet et le lien reviennent`,
            { sens: parOutil[outil].sens, pleine: parOutil[outil].pleine,
              onglet: parOutil[outil].ongletFond, lien: parOutil[outil].lien },
            { sens: true, pleine: false, onglet: true, lien: true });
    });
    r.verifie('et le disque plein porte bien la couleur du trait, pas une autre',
        parOutil.freehand.dedans === parOutil.freehand.autour,
        JSON.stringify(parOutil.freehand));

    // L'ONGLET « FOND » NE RESTE PAS CHOISI QUAND IL DISPARAÎT. Sans cela, la
    // pastille suivante allait peindre un fond invisible, et l'on croyait le
    // choix perdu.
    const ongletOrphelin = await page.evaluate(() => {
        selectedItems = []; setMode('rectangle'); majCoherenceDeLaPastille();
        document.querySelector('#color-popover .popover-tab[data-target="fill"]').click();
        const surLeFond = popoverTarget;
        setMode('freehand'); majCoherenceDeLaPastille();
        const apres = popoverTarget;
        const trait = activeStyle.strokeColor;
        choisirLaCouleur('#16a085');
        const ou = { trait: activeStyle.strokeColor, avant: trait };
        setMode('pointer'); majCoherenceDeLaPastille();
        return { surLeFond, apres, ou,
                 ongletActif: document.querySelector('#color-popover .popover-tab.active').dataset.target };
    });
    r.egal('l\'onglet « Fond » se choisit tant qu\'il est là', ongletOrphelin.surLeFond, 'fill');
    r.egal('mais il rend la main dès qu\'il n\'a plus de sens', ongletOrphelin.apres, 'stroke');
    r.egal('et la couleur suivante va au TRAIT, là où on la voit',
        ongletOrphelin.ou.trait, '#16a085');

    // =====================================================================
    // LIER LE FOND ET LE BORD
    // =====================================================================
    const lien = await page.evaluate(() => {
        selectedItems = []; setMode('rectangle'); majCoherenceDeLaPastille();
        lierLeFondEtLeBord(false);
        activeStyle.strokeColor = '#2d3436'; activeStyle.fillColor = '#f1c40f';
        choisirLaCouleur('#e74c3c');
        const delie = { trait: activeStyle.strokeColor, fond: activeStyle.fillColor };

        const allume = lierLeFondEtLeBord(true);
        // Lier prend effet TOUT DE SUITE sur ce qui est là : sinon on croirait
        // que le bouton n'a rien fait.
        const desQueLie = { trait: activeStyle.strokeColor, fond: activeStyle.fillColor };
        choisirLaCouleur('#3498db');
        const lie = { trait: activeStyle.strokeColor, fond: activeStyle.fillColor };
        // ET DANS L'AUTRE SENS AUSSI : depuis l'onglet « Fond », le trait doit
        // suivre. Sans cette moitié-là, le lien ne tiendrait que d'un côté.
        document.querySelector('#color-popover .popover-tab[data-target="fill"]').click();
        choisirLaCouleur('#9b59b6');
        const parLeFond = { trait: activeStyle.strokeColor, fond: activeStyle.fillColor };
        document.querySelector('#color-popover .popover-tab[data-target="stroke"]').click();
        const retenu = localStorage.getItem('auTableau_fond_lie_au_bord');
        const presse = document.getElementById('btn-lier-fond-bord').getAttribute('aria-pressed');

        // Au crayon, le lien n'a rien à lier : il ne s'applique pas.
        setMode('freehand'); majCoherenceDeLaPastille();
        const auCrayon = fondEtBordLies();
        lierLeFondEtLeBord(false);
        setMode('pointer'); majCoherenceDeLaPastille();
        return { delie, allume, desQueLie, lie, parLeFond, retenu, presse, auCrayon };
    });
    r.egal('délié, une couleur ne va qu\'à ce qu\'on peint',
        lien.delie, { trait: '#e74c3c', fond: '#f1c40f' });
    r.egal('le lier fait suivre le fond SUR-LE-CHAMP, sans attendre la couleur d\'après',
        lien.desQueLie, { trait: '#e74c3c', fond: '#e74c3c' });
    r.egal('et lié, une couleur va aux deux',
        lien.lie, { trait: '#3498db', fond: '#3498db' });
    r.egal('depuis l\'onglet « Fond » aussi : le trait suit',
        lien.parLeFond, { trait: '#9b59b6', fond: '#9b59b6' });
    r.egal('le lien est retenu d\'une séance à l\'autre, et le bouton le montre',
        { retenu: lien.retenu, presse: lien.presse, allume: lien.allume },
        { retenu: 'true', presse: 'true', allume: true });
    r.egal('mais au crayon il n\'a rien à lier', lien.auCrayon, false);

    // =====================================================================
    // MES COULEURS : les dernières mises au point à la main
    // =====================================================================
    const recentes = await page.evaluate(() => {
        localStorage.removeItem('auTableau_couleurs_recentes');
        couleursRecentes = []; majLesCouleursRecentes();
        const vide = { vues: document.querySelectorAll('#cr-liste .cr-pastille').length,
                       cache: document.getElementById('color-recentes').hidden };

        // Le geste réel : on cherche une teinte dans le sélecteur du système,
        // et on s'arrête dessus.
        const champ = document.getElementById('popover-custom-color');
        const poser = (c) => {
            champ.value = c;
            champ.dispatchEvent(new Event('input', { bubbles: true }));
            champ.dispatchEvent(new Event('change', { bubbles: true }));
        };
        poser('#7f5539');
        const une = { vues: document.querySelectorAll('#cr-liste .cr-pastille').length,
                      cache: document.getElementById('color-recentes').hidden,
                      trait: activeStyle.strokeColor };
        poser('#264653');
        // Une couleur DÉJÀ dans la grille n'a rien à faire dans « mes
        // couleurs » : elle y est déjà, à demeure.
        poser('#3498db');
        const memoire = JSON.parse(localStorage.getItem('auTableau_couleurs_recentes'));
        // La plus récente en tête, et pas deux fois la même.
        poser('#7f5539');
        const remontee = JSON.parse(localStorage.getItem('auTableau_couleurs_recentes'));
        return { vide, une, memoire, remontee,
                 vues: document.querySelectorAll('#cr-liste .cr-pastille').length };
    });
    r.egal('sans couleur mise de côté, la rangée ne paraît pas',
        recentes.vide, { vues: 0, cache: true });
    r.egal('une teinte cherchée à la main se range dans « mes couleurs »',
        { vues: recentes.une.vues, cache: recentes.une.cache, trait: recentes.une.trait },
        { vues: 1, cache: false, trait: '#7f5539' });
    r.egal('celle qui est déjà dans la grille n\'y est pas rangée en double',
        recentes.memoire, ['#264653', '#7f5539']);
    r.egal('et la reprendre la remonte en tête, sans la doubler',
        recentes.remontee, ['#7f5539', '#264653']);

    // ON PEUT EN JETER. Une palette qui ne fait que grossir devient un fouillis
    // au bout d'un trimestre.
    const jetee = await page.evaluate(async () => {
        const avant = document.querySelectorAll('#cr-liste .cr-pastille').length;
        const cible = document.querySelector('#cr-liste .cr-pastille[data-color="#264653"]');
        cible.querySelector('.cr-jeter').click();
        await new Promise(r => setTimeout(r, 60));
        return { avant, apres: document.querySelectorAll('#cr-liste .cr-pastille').length,
                 memoire: JSON.parse(localStorage.getItem('auTableau_couleurs_recentes')),
                 // Jeter n'est pas choisir : la couleur en cours ne bouge pas.
                 trait: activeStyle.strokeColor };
    });
    r.egal('la croix jette la couleur, et elle ne revient pas',
        { avant: jetee.avant, apres: jetee.apres, memoire: jetee.memoire },
        { avant: 2, apres: 1, memoire: ['#7f5539'] });
    r.egal('et jeter n\'est pas choisir : la couleur en cours ne bouge pas',
        jetee.trait, '#7f5539');

    // Et l'on reprend une couleur de « mes couleurs » d'un clic.
    const reprise = await page.evaluate(() => {
        activeStyle.strokeColor = '#2d3436';
        document.querySelector('#cr-liste .cr-pastille[data-color="#7f5539"]').click();
        return { trait: activeStyle.strokeColor,
                 allumee: document.querySelector('#cr-liste .cr-pastille[data-color="#7f5539"]')
                     .classList.contains('active') };
    });
    r.egal('un clic sur l\'une d\'elles la reprend, et elle s\'allume',
        reprise, { trait: '#7f5539', allumee: true });

    // ELLES SURVIVENT À LA SÉANCE. C'est tout l'intérêt : la teinte cherchée
    // pour la carte de géographie était à refaire chaque fois.
    await page.reload();
    await page.waitForFunction(() => typeof majLesCouleursRecentes === 'function', { timeout: 25000 });
    // ON ATTEND QUE LA RANGÉE SOIT DESSINÉE, et non un délai au jugé : elle se
    // remplit au chargement du document, et quatre cents millisecondes ne
    // suffisent pas toujours. Une attente qui EXPIRE ne doit pas faire tomber
    // la suite entière : c'est la vérification d'après qui dira ce qu'elle a
    // trouvé, avec le détail sous les yeux.
    await page.waitForFunction(
        () => document.querySelectorAll('#cr-liste .cr-pastille').length > 0,
        { timeout: 45000, polling: 150 }).catch(() => {});
    const demain = await page.evaluate(() => ({
        vues: document.querySelectorAll('#cr-liste .cr-pastille').length,
        cache: document.getElementById('color-recentes').hidden,
        lien: document.getElementById('btn-lier-fond-bord').getAttribute('aria-pressed')
    }));
    r.egal('mes couleurs sont toujours là à la séance suivante',
        { vues: demain.vues, cache: demain.cache }, { vues: 1, cache: false });
    r.egal('et le lien fond/bord aussi, tel qu\'on l\'a laissé', demain.lien, 'false');

    // =====================================================================
    // LE FANTÔME PORTE LES COULEURS DE CE QU'ON TRACE
    // « Le fantôme du rectangle devrait avoir les couleurs du rectangle
    // définitif et être moins opaque ; évidemment, on peut mettre un
    // rectangle sans fond. » Il était VIOLET, toujours — la même
    // « rgba(108, 92, 231, 0.5) » pour tout le monde : on choisissait du
    // rouge, on voyait naître un rectangle violet, et il changeait de couleur
    // au relâchement.
    // =====================================================================
    const fantome = await page.evaluate(() => {
        activeStyle.strokeColor = '#e74c3c'; activeStyle.strokeOpacity = 1;
        activeStyle.fillColor = '#3498db'; activeStyle.fillOpacity = 0.4;
        const lire = (t) => (t.match(/[\d.]+/g) || []).map(Number);
        activeStyle.isFilled = true;
        const rempli = { trait: lire(traitDuFantome()), fond: lire(fondDuFantome()) };
        activeStyle.isFilled = false;
        const creux = { trait: lire(traitDuFantome()), fond: fondDuFantome() };
        return { rempli, creux };
    });
    r.egal('le fantôme prend la couleur du trait, en plus pâle',
        { rvb: fantome.rempli.trait.slice(0, 3), opacite: fantome.rempli.trait[3] },
        { rvb: [231, 76, 60], opacite: 0.55 });
    r.egal('et la couleur du fond, plus pâle que l\'opacité réglée',
        { rvb: fantome.rempli.fond.slice(0, 3), opacite: Math.round(fantome.rempli.fond[3] * 100) / 100 },
        { rvb: [52, 152, 219], opacite: 0.22 });
    r.egal('sans fond, le fantôme reste creux : un contour se voit vide',
        fantome.creux.fond, null);
    r.egal('mais son trait, lui, garde la couleur choisie',
        fantome.creux.trait.slice(0, 3), [231, 76, 60]);

    // ET À L'ÉCRAN : on trace pour de vrai, et l'on compte les pixels.
    const surLeTableau = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        points.length = 0; rectangles.length = 0; freehands.length = 0; selectedItems = [];
        activeStyle.strokeColor = '#e74c3c'; activeStyle.isFilled = false; activeStyle.lineWidth = 5;
        setMode('rectangle'); draw();
        return true;
    });
    // LE RECTANGLE SE TRACE EN DEUX CLICS, pas en un glissement : un clic pose
    // le premier coin, on promène la souris — c'est LÀ que le fantôme vit —,
    // et le second clic arrête la figure.
    await page.mouse.click(420, 300);
    await page.waitForTimeout(120);
    await page.mouse.move(760, 520, { steps: 8 });
    await page.waitForTimeout(220);
    const pixels = await page.evaluate(() => {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let rouge = 0, violet = 0;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 30) continue;
            // ROUGE : le canal rouge domine nettement les deux autres. Le
            // fantôme est PÂLE — du rouge à 55 % sur du blanc donne un rose
            // clair —, et un seuil absolu passait à côté de tout le tracé.
            if (d[i] - d[i + 1] > 40 && d[i] - d[i + 2] > 40) rouge++;
            // VIOLET : celui d'autrefois, où le bleu domine le rouge.
            if (d[i + 2] - d[i] > 30 && d[i + 2] - d[i + 1] > 40) violet++;
        }
        return { rouge, violet };
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
        points.length = 0; rectangles.length = 0; selectedItems = [];
        setMode('pointer'); draw();
    });
    r.verifie('à l\'écran, le rectangle en cours de tracé est bien rouge',
        pixels.rouge > 200, JSON.stringify(pixels));
    r.egal('et plus un seul pixel violet : la couleur ne change plus au relâchement',
        pixels.violet, 0);

    // ET SON FOND SUIT L'OPACITÉ RÉGLÉE, pas une valeur écrite en dur. Le
    // remplissage du fantôme était figé à 0,2 : on réglait le fond à 0,8, on
    // voyait un voile, et la figure devenait franche au relâchement.
    const remplissages = [];
    for (const opacite of [0.15, 0.9]) {
        await page.evaluate((o) => {
            panX = 0; panY = 0; zoom = 1;
            points.length = 0; rectangles.length = 0; selectedItems = [];
            activeStyle.strokeColor = '#2d3436'; activeStyle.lineWidth = 2;
            activeStyle.fillColor = '#3498db'; activeStyle.fillOpacity = o; activeStyle.isFilled = true;
            setMode('rectangle'); draw();
        }, opacite);
        await page.mouse.click(420, 300);
        await page.waitForTimeout(110);
        await page.mouse.move(760, 520, { steps: 6 });
        await page.waitForTimeout(200);
        remplissages.push(await page.evaluate(() => {
            // Au centre du fantôme : la teinte du fond, mêlée au blanc.
            const d = ctx.getImageData(590, 410, 4, 4).data;
            return Math.round(255 - d[0]);   // plus le fond est dense, plus le rouge baisse
        }));
        await page.keyboard.press('Escape');
    }
    await page.evaluate(() => {
        points.length = 0; rectangles.length = 0; selectedItems = [];
        activeStyle.isFilled = false; setMode('pointer'); draw();
    });
    r.verifie('le fond du fantôme suit l\'opacité réglée, au lieu d\'un voile figé',
        remplissages[1] > remplissages[0] * 2.5, JSON.stringify(remplissages));

    // =====================================================================
    // ET LES FIGURES POSÉES SE MODIFIENT
    // « Il faut pouvoir modifier les figures. » Une figure tracée doit se
    // reprendre : sa couleur, son fond, son épaisseur.
    // =====================================================================
    const reprises = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        points.length = 0; rectangles.length = 0; circles.length = 0; polygons.length = 0;
        selectedItems = []; setMode('pointer');
        const a = { id: nextId++, x: 200, y: 200 }, b = { id: nextId++, x: 400, y: 320 };
        points.push(a, b);
        rectangles.push({ id: nextId++, p1_id: a.id, p2_id: b.id, color: '#e74c3c', width: 3,
                          isFilled: false, fillColor: '#3498db', fillOpacity: 0.2, z: globalZ++ });
        const rect = rectangles[0];
        selectedItems = [{ type: 'rectangle', id: rect.id }];
        popoverTarget = 'stroke';
        choisirLaCouleur('#16a085');
        const trait = rect.color;
        popoverTarget = 'fill';
        choisirLaCouleur('#f1c40f');
        const fond = { couleur: rect.fillColor, rempli: rect.isFilled };
        const champ = document.getElementById('line-width');
        champ.value = 8; champ.dispatchEvent(new Event('input', { bubbles: true }));
        const epaisseur = rect.width;
        // Et l'on peut la vider à nouveau.
        document.getElementById('btn-no-fill').click();
        const videe = rect.isFilled;
        popoverTarget = 'stroke';
        points.length = 0; rectangles.length = 0; selectedItems = []; draw();
        return { trait, fond, epaisseur, videe };
    });
    r.egal('une figure posée se repeint : trait, fond, épaisseur',
        { trait: reprises.trait, fond: reprises.fond.couleur, rempli: reprises.fond.rempli,
          epaisseur: reprises.epaisseur },
        { trait: '#16a085', fond: '#f1c40f', rempli: true, epaisseur: 8 });
    r.egal('et « sans fond » la vide de nouveau', reprises.videe, false);

    // =====================================================================
    // PAS DE CROIX AUX COINS DU RECTANGLE
    // « Ne mets pas de croix pour le coin supérieur gauche et le coin
    // inférieur droit. » Un rectangle est fait de deux points, et ces deux
    // points se dessinaient comme tous les autres : une croix au coin
    // haut-gauche, une autre au coin bas-droit, sur CHAQUE rectangle du
    // tableau. Personne ne les y a mises et elles n'apprennent rien.
    // =====================================================================
    const coins = await page.evaluate(() => {
        panX = 0; panY = 0; zoom = 1;
        points.length = 0; rectangles.length = 0; segments.length = 0;
        circles.length = 0; polygons.length = 0; curves.length = 0;
        selectedItems = []; setMode('pointer');
        const a = { id: nextId++, x: 300, y: 260 }, b = { id: nextId++, x: 620, y: 460 };
        points.push(a, b);
        rectangles.push({ id: nextId++, p1_id: a.id, p2_id: b.id, color: '#2d3436', width: 3,
                          isFilled: false, z: globalZ++ });
        draw();
        // On compte l'encre AUTOUR d'un coin, hors des côtés du rectangle :
        // une croix déborde en diagonale, un côté non.
        // Le carré en diagonale, JUSTE DEHORS : une croix y déborde, un côté
        // du rectangle non. Chaque coin se regarde du côté où il déborde.
        const encreAutour = (x, y, dx, dy) => {
            const d = ctx.getImageData(x + (dx < 0 ? -14 : 2), y + (dy < 0 ? -14 : 2), 12, 12).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] < 200) n++;
            return n;
        };
        const hautGauche = encreAutour(300, 260, -1, -1);
        const basDroit = encreAutour(620, 460, 1, 1);
        // ET LE POINT EST TOUJOURS LÀ : caché n'est pas retiré, on doit
        // pouvoir le reprendre pour déformer le rectangle.
        const vise = findObjectAt(300, 260);
        const attrapable = !!(vise && vise.type === 'point' && vise.id === a.id);
        // Un point qui sert AUSSI à autre chose se remontre : c'est alors un
        // vrai point de construction, et non un coin.
        segments.push({ id: nextId++, p1_id: a.id, p2_id: b.id, lineType: 'segment',
                        color: '#e74c3c', width: 3, z: globalZ++ });
        draw();
        const avecSegment = encreAutour(300, 260, -1, -1);
        points.length = 0; rectangles.length = 0; segments.length = 0; draw();
        return { hautGauche, basDroit, attrapable, avecSegment };
    });
    r.egal('les deux coins du rectangle ne portent plus de croix',
        { hautGauche: coins.hautGauche, basDroit: coins.basDroit }, { hautGauche: 0, basDroit: 0 });
    r.verifie('mais le point est toujours là, et se reprend pour déformer la figure',
        coins.attrapable, JSON.stringify(coins));
    r.verifie('et s\'il sert aussi à autre chose, il se remontre',
        coins.avecSegment > 0, JSON.stringify(coins));

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
