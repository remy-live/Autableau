// L'AXE GRADUÉ : TROIS NIVEAUX DE TRAIT, ET DES POINTS DESSUS.
//
// « Pour le plugin axe gradué, j'aimerais la possibilité d'avoir des couleurs
// différentes pour les graduations (au millimètre) et milieu (et hauteurs
// différentes) et possibilité d'ajouter des points dessus. »
//
// CE QUE CETTE SUITE TIENT :
//
//   — l'unité, le demi et le dixième ont chacun leur couleur et leur hauteur ;
//   — on peut ne demander QUE les milieux, sans les millimètres ;
//   — « 3,5=A ; 7=B » pose deux pastilles nommées, à la virgule du cours ;
//   — un point hors de l'axe n'est pas dessiné dans le vide ;
//   — un nom de point n'est pas du code : il est échappé ;
//   — un axe enregistré AVANT ces réglages se rouvre sans se repeindre en noir
//     ni perdre quoi que ce soit.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// Les traits verticaux d'un SVG d'axe, avec leur couleur et leur demi-hauteur.
function traits(svg) {
    const out = [];
    const re = /<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="([^"]+)" stroke-width="([\d.]+)"\/>/g;
    let m;
    while ((m = re.exec(svg))) {
        const [, x1, y1, x2, y2, couleur, largeur] = m;
        if (x1 !== x2) continue;                       // l'axe lui-même est horizontal
        out.push({ x: +x1, couleur, largeur: +largeur, demiHauteur: (+y2 - +y1) / 2 });
    }
    return out;
}

module.exports = async function (browser) {
    const r = creerRapport('L\'axe gradué');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.PluginManager && PluginManager.plugins['axeTool']
        && typeof pointsDeLAxe === 'function', { timeout: 20000 });

    const svgDe = (args) => page.evaluate(a => PluginManager.plugins['axeTool'].generateSVG(a, true), args);

    // ------------------------------------------------------------------
    // 1. LA LECTURE DES POINTS
    // ------------------------------------------------------------------
    const lus = await page.evaluate(() => ({
        courant: pointsDeLAxe('3,5=A ; 7=B'),
        sansNom: pointsDeLAxe('2'),
        vide: pointsDeLAxe(''),
        rien: pointsDeLAxe(undefined),
        // Une virgule décimale n'est PAS un séparateur : « 3,5 » est un nombre.
        virgule: pointsDeLAxe('3,5'),
        // Ce qui n'est pas un nombre n'est pas un point.
        bavardage: pointsDeLAxe('bonjour ; 4=C ;  ; =D'),
        point: pointsDeLAxe('3.5=E')
    }));
    // ON NE COMPARE QUE CE QU'ON EXIGE : LA VALEUR ET LE NOM.
    //
    // Ces six contrôles comparaient l'objet ENTIER, et ils sont tombés le jour
    // où un point a reçu de quoi se souvenir qu'il était une fraction —
    // « num » et « den », pour que « 7/4=A » s'écrive en quarts. Rien n'était
    // cassé : le contrôle figeait la FORME de l'objet là où il ne lui était
    // demandé que son contenu. Un point lu garde sa valeur et son nom ; ce
    // qu'il porte en plus ne regarde pas ce chapitre-ci.
    const nus = (l) => (l || []).map(p => ({ val: p.val, nom: p.nom }));
    r.egal('« 3,5=A ; 7=B » donne deux points nommés',
        nus(lus.courant), [{ val: 3.5, nom: 'A' }, { val: 7, nom: 'B' }]);
    r.egal('un point peut n\'avoir pas de nom', nus(lus.sansNom), [{ val: 2, nom: '' }]);
    r.egal('rien du tout ne donne rien', [lus.vide, lus.rien], [[], []]);
    r.egal('la virgule est la décimale du cours, pas un séparateur',
        nus(lus.virgule), [{ val: 3.5, nom: '' }]);
    r.egal('le point décimal marche aussi, pour qui tape au pavé numérique',
        nus(lus.point), [{ val: 3.5, nom: 'E' }]);
    r.egal('ce qui n\'est pas un nombre est laissé de côté',
        nus(lus.bavardage), [{ val: 4, nom: 'C' }]);

    // ------------------------------------------------------------------
    // 2. TROIS RANGS, TROIS COULEURS, TROIS HAUTEURS
    // Un axe de 0 à 2 au pas de 1 : trois unités, deux demis, seize dixièmes.
    // ------------------------------------------------------------------
    const svg = await svgDe(['0', '2', '1', 'yes', 'right', '#111111', '#22aa22', '#3333ff', '', '#d63031']);
    const t = traits(svg);
    const unites = t.filter(x => x.couleur === '#111111');
    const demis = t.filter(x => x.couleur === '#22aa22');
    const dixiemes = t.filter(x => x.couleur === '#3333ff');

    r.egal('trois unités, deux demis, seize dixièmes',
        [unites.length, demis.length, dixiemes.length], [3, 2, 16]);
    r.verifie('l\'unité est le trait le plus haut',
        unites.every(u => demis.every(d => u.demiHauteur > d.demiHauteur)),
        JSON.stringify([unites[0], demis[0]]));
    r.verifie('le demi est plus haut que le dixième',
        demis.every(d => dixiemes.every(m => d.demiHauteur > m.demiHauteur)),
        JSON.stringify([demis[0], dixiemes[0]]));
    r.verifie('les trois couleurs sont bien trois couleurs différentes',
        new Set(t.map(x => x.couleur)).size === 3, JSON.stringify([...new Set(t.map(x => x.couleur))]));
    // Le demi tombe AU MILIEU de deux unités : c'est tout ce qu'on lui demande.
    r.verifie('et le demi est posé à mi-chemin entre deux unités',
        Math.abs(demis[0].x - (unites[0].x + unites[1].x) / 2) < 0.51,
        JSON.stringify({ demi: demis[0].x, unites: [unites[0].x, unites[1].x] }));

    // ------------------------------------------------------------------
    // 3. LES MILIEUX SEULS, ET AUCUNE GRADUATION
    // ------------------------------------------------------------------
    const milieux = traits(await svgDe(['0', '2', '1', 'mid', 'right', '#111111', '#22aa22', '#3333ff', '', '#d63031']));
    r.egal('« les milieux seulement » donne trois unités, deux demis, zéro dixième',
        [milieux.filter(x => x.couleur === '#111111').length,
         milieux.filter(x => x.couleur === '#22aa22').length,
         milieux.filter(x => x.couleur === '#3333ff').length], [3, 2, 0]);

    const aucune = traits(await svgDe(['0', '2', '1', 'no', 'right', '#111111', '#22aa22', '#3333ff', '', '#d63031']));
    r.egal('« aucune » ne laisse que les unités', aucune.length, 3);

    // ------------------------------------------------------------------
    // 4. LES POINTS SUR L'AXE
    // ------------------------------------------------------------------
    const avecPoints = await svgDe(['0', '10', '1', 'yes', 'right', '#111111', '#22aa22', '#3333ff', '3,5=A ; 7=B', '#d63031']);
    const pastilles = [...avecPoints.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill="([^"]+)"\/>/g)];
    r.egal('deux pastilles, de la couleur demandée',
        [pastilles.length, pastilles[0] && pastilles[0][3]], [2, '#d63031']);
    r.verifie('leurs noms sont écrits au-dessus de l\'axe',
        /<text[^>]*fill="#d63031"[^>]*>A<\/text>/.test(avecPoints)
        && /<text[^>]*fill="#d63031"[^>]*>B<\/text>/.test(avecPoints),
        avecPoints.slice(-300));
    // Sur 0–10, 3,5 doit tomber entre la graduation 3 et la graduation 4.
    const unitesLongues = traits(avecPoints).filter(x => x.couleur === '#111111');
    r.verifie('« 3,5 » se pose bien entre 3 et 4',
        +pastilles[0][1] > unitesLongues[3].x && +pastilles[0][1] < unitesLongues[4].x,
        JSON.stringify({ point: +pastilles[0][1], trois: unitesLongues[3].x, quatre: unitesLongues[4].x }));
    r.verifie('et le nom du point est au-dessus du trait, pas dessous',
        (() => { const m = avecPoints.match(/<text x="[\d.]+" y="([\d.]+)"[^>]*fill="#d63031"/); const axe = avecPoints.match(/<line x1="\d+" y1="([\d.]+)"/); return m && axe && +m[1] < +axe[1]; })(),
        avecPoints.slice(0, 200));

    const dehors = await svgDe(['0', '10', '1', 'no', 'right', '#111111', '#111111', '#111111', '42=Z ; -3=Y ; 5=X', '#d63031']);
    r.egal('un point hors de l\'axe n\'est pas dessiné dans le vide',
        (dehors.match(/<circle/g) || []).length, 1);
    r.verifie('et c\'est bien celui qui était dedans qui reste',
        /<text[^>]*>X<\/text>/.test(dehors) && !/>Z</.test(dehors) && !/>Y</.test(dehors));

    // Sans point, l'axe garde sa hauteur d'avant : on ne rajoute du ciel que
    // lorsqu'il y a quelque chose à y écrire.
    const sansPoint = await svgDe(['0', '10', '1', 'no', 'right', '#111111', '#111111', '#111111', '', '#d63031']);
    const hauteur = s => +s.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1];
    // ON NE RÉSERVE DE CIEL QUE S'IL Y A QUELQUE CHOSE À Y ÉCRIRE.
    //
    // Ce contrôle exigeait la hauteur 100, écrite en dur. Elle est tombée à 78
    // quand le cadre a cessé de réserver une place fixe pour se tailler sur ce
    // qu'il porte — et 78 n'est pas une régression, c'est la même figure sans
    // le vide autour. Ce qu'on exige vraiment, c'est qu'un axe sans point ne
    // garde AUCUNE place au-dessus de son trait.
    const trait = s => +s.match(/<line x1="\d+" y1="([\d.]+)"/)[1];
    r.verifie('un axe sans point ne réserve aucun ciel au-dessus de son trait',
        trait(sansPoint) <= 50, JSON.stringify({ trait: trait(sansPoint), h: hauteur(sansPoint) }));
    r.verifie('et il ne traîne pas de blanc en dessous non plus',
        hauteur(sansPoint) - trait(sansPoint) <= 40,
        JSON.stringify({ trait: trait(sansPoint), h: hauteur(sansPoint) }));
    r.verifie('et un axe qui porte des points s\'en fait de la place au-dessus',
        hauteur(avecPoints) > hauteur(sansPoint),
        JSON.stringify([hauteur(sansPoint), hauteur(avecPoints)]));

    // ------------------------------------------------------------------
    // 5. UN NOM DE POINT N'EST PAS DU CODE
    // ------------------------------------------------------------------
    const mechant = await svgDe(['0', '10', '1', 'no', 'right', '#111111', '#111111', '#111111', '5=<script>x</script>', '#d63031']);
    r.verifie('le nom d\'un point est échappé avant d\'entrer dans le dessin',
        !/<script/.test(mechant) && /&lt;script&gt;/.test(mechant), mechant.slice(-260));

    // ------------------------------------------------------------------
    // 6. UN AXE D'HIER SE ROUVRE SANS RIEN PERDRE
    // Six réglages seulement : c'est ce que portent les tableaux déjà
    // enregistrés. Les couleurs nouvelles doivent reprendre celle de l'axe,
    // et non un noir posé d'office sur un axe rouge.
    // ------------------------------------------------------------------
    const ancien = await svgDe(['0', '5', '1', 'yes', 'both', '#e74c3c']);
    const tAncien = traits(ancien);
    r.verifie('un axe d\'hier garde une seule couleur, la sienne',
        tAncien.length > 6 && tAncien.every(x => x.couleur === '#e74c3c'),
        JSON.stringify([...new Set(tAncien.map(x => x.couleur))]));
    r.verifie('il n\'invente pas de point', !/<circle/.test(ancien));
    r.verifie('et ses deux flèches sont toujours là', (ancien.match(/<polygon/g) || []).length === 2);

    const champs = await page.evaluate(() =>
        PluginManager.plugins['axeTool'].champs(['0', '5', '1', 'yes', 'both', '#e74c3c'])
            .map(c => ({ label: c.label, value: c.value })));
    r.egal('et le formulaire qui le rouvre lui propose sa propre couleur partout',
        // « Millimètres » est devenu « dixièmes » : un axe de mathématiques
        // n'est pas une règle graduée, et ses sous-graduations sont des
        // dixièmes du pas. Le contrôle suit le mot de l'écran.
        champs.filter(c => /Couleur des (milieux|dixièmes)/.test(c.label)).map(c => c.value),
        ['#e74c3c', '#e74c3c']);
    r.egal('avec un champ de points vide, prêt à recevoir',
        champs.find(c => /Points/.test(c.label)).value, '');

    // ------------------------------------------------------------------
    // 7. ET L'AXE SE POSE VRAIMENT SUR LE TABLEAU
    // ------------------------------------------------------------------
    const pose = await page.evaluate(async () => {
        const p = PluginManager.plugins['axeTool'];
        const args = ['0', '10', '1', 'yes', 'right', '#111111', '#22aa22', '#3333ff', '4=A', '#d63031'];
        await new Promise(ok => createStampFromSVG(p.generateSVG(args, true), (stamp) => {
            p.currentStamp = stamp; p.currentArgs = args; ok();
        }));
        setMode('axe_math');
        const pris = p.onPointerDown({ x: 300, y: 300 });
        const img = images[images.length - 1];
        return { pris, args: img.pluginData.args, plugin: img.pluginData.id, largeur: img.w > 0 };
    });
    r.verifie('le tampon se pose et emporte ses dix réglages',
        pose.pris && pose.plugin === 'axeTool' && pose.args.length === 10 && pose.largeur,
        JSON.stringify(pose));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();

    // ------------------------------------------------------------------
    // 8. ET LA BOÎTE TIENT DANS L'ÉCRAN
    // Dix réglages font une boîte haute. Elle est posée à hauteur fixe et
    // n'avait pas d'ascenseur : l'aperçu — sa raison d'être — et les deux
    // boutons tombaient sous le bord de l'écran, hors d'atteinte. Ce sont les
    // réglages SEULS qui défilent ; le bas reste sous les yeux.
    // ------------------------------------------------------------------
    for (const hauteur of [800, 640, 560]) {
        const petit = await ouvrirApp(browser, { viewport: { width: 1280, height: hauteur } });
        await petit.page.waitForFunction(() => window.PluginManager && PluginManager.plugins['axeTool']);
        const mesure = await petit.page.evaluate(() => {
            const p = PluginManager.plugins['axeTool'];
            openCustomPrompt("Axe Mathématique", p.champs(), (res) => p.generateSVG(res), () => { });
            const m = document.getElementById('custom-prompt-modal').getBoundingClientRect();
            const ok = document.getElementById('custom-prompt-ok').getBoundingClientRect();
            const ap = document.getElementById('custom-prompt-preview').getBoundingClientRect();
            const reg = document.querySelector('.prompt-reglages');
            const doitDefiler = reg.scrollHeight > reg.clientHeight + 1;
            return {
                boite: m.top >= 0 && m.bottom <= innerHeight,
                ok: ok.top >= 0 && ok.bottom <= innerHeight,
                apercu: ap.top >= 0 && ap.bottom <= innerHeight,
                // Et l'on atteint bien le premier réglage comme le dernier.
                tousLesReglages: !doitDefiler || getComputedStyle(reg).overflowY === 'auto',
                // ON REMONTE AVANT DE RÉTRÉCIR. La boîte est posée à cent
                // cinquante pixels du haut : rogner les réglages en laissant
                // cent cinquante pixels de vide au-dessus, c'est perdre deux
                // fois. Dès qu'il faut un ascenseur, la boîte est en haut.
                remontee: !doitDefiler || m.top < 20
            };
        });
        r.egal(`sur un écran de ${hauteur} pixels, tout reste sous les yeux`,
            mesure, { boite: true, ok: true, apercu: true, tousLesReglages: true, remontee: true });
        await petit.context.close();
    }

    return r.bilan();
};
