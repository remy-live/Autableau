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
    r.egal('la palette offre seize couleurs', grille.combien, 16);
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
    await page.waitForTimeout(400);
    const demain = await page.evaluate(() => ({
        vues: document.querySelectorAll('#cr-liste .cr-pastille').length,
        cache: document.getElementById('color-recentes').hidden,
        lien: document.getElementById('btn-lier-fond-bord').getAttribute('aria-pressed')
    }));
    r.egal('mes couleurs sont toujours là à la séance suivante',
        { vues: demain.vues, cache: demain.cache }, { vues: 1, cache: false });
    r.egal('et le lien fond/bord aussi, tel qu\'on l\'a laissé', demain.lien, 'false');

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
