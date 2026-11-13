// LA CARTE S'AGRANDIT ET SE DÉPLACE.
//
//   « Pour les cartes, ce serait cool de pouvoir zoomer et se déplacer sur la
//     carte, avec la molette ou des boutons. »
//
// Le monde entier dans sept cents pixels, ce sont des pays de trois pixels :
// le Luxembourg, Malte, la Jamaïque ne se cliquent pas. La loupe n'est donc
// pas un confort, c'est ce qui rend la moitié de la carte atteignable.
//
// LE PIÈGE EST DANS LE GESTE, PAS DANS LE ZOOM. Déplacer la carte se fait en
// la tirant — et tirer finit par un relâchement sur un pays, que le navigateur
// annonce comme un clic. Sans garde, déplacer la carte colorie le pays qu'on
// avait sous le doigt en partant. Ce chapitre tient les deux bouts : un
// glissement ne choisit rien, un clic net choisit.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

module.exports = async function (browser) {
    const r = creerRapport('La carte s\'agrandit et se déplace');
    const { context, page, erreurs } = await ouvrirApp(browser,
        { viewport: { width: 1280, height: 900 } });
    await tableauVierge(page);

    await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('#plugins-grid .btn'))
            .find(x => (x.dataset.pluginKey || x.title || '') === 'Atelier cartes');
        if (b) b.click();
    });
    await page.waitForTimeout(1600);

    const vue = () => page.evaluate(() => {
        const t = PluginManager.plugins.mapTool;
        const svg = document.querySelector('#carte-dessin svg');
        return { v: t && t.vue ? { zoom: +t.vue.zoom.toFixed(3), x: Math.round(t.vue.x), y: Math.round(t.vue.y) } : null,
                 transform: svg ? svg.style.transform : null };
    });
    const retenus = () => page.evaluate(() => {
        const t = PluginManager.plugins.mapTool;
        return t && t.etat ? (t.etat.legendes || []).reduce((n, l) => n + (l.pays || []).length, 0) : null;
    });

    const depart = await vue();
    r.verifie('la carte s\'ouvre à sa taille normale',
        !!depart.v && depart.v.zoom === 1 && depart.v.x === 0, JSON.stringify(depart));

    // ------------------------------------------------------------------
    // 1. LES BOUTONS, POUR QUI N'A PAS DE MOLETTE.
    //
    //    Un tableau numérique se touche du doigt, un portable de classe n'a
    //    qu'un pavé tactile : les boutons ne sont pas un doublon.
    // ------------------------------------------------------------------
    const boutons = await page.evaluate(() => ['carte-plus', 'carte-moins', 'carte-recentrer']
        .map(id => { const e = document.getElementById(id); return e && !!e.getClientRects().length; }));
    r.egal('les trois boutons de la loupe sont là et se voient',
        JSON.stringify(boutons), JSON.stringify([true, true, true]), JSON.stringify(boutons));

    await page.click('#carte-plus');
    await page.click('#carte-plus');
    await page.waitForTimeout(200);
    const agrandie = await vue();
    r.verifie('deux appuis sur « + » agrandissent la carte',
        agrandie.v.zoom > depart.v.zoom * 1.5, JSON.stringify(agrandie));
    r.verifie('et le dessin porte vraiment l\'agrandissement',
        /scale\(/.test(agrandie.transform || ''), String(agrandie.transform));

    await page.click('#carte-moins');
    await page.waitForTimeout(150);
    const reduite = await vue();
    r.verifie('« − » revient en arrière', reduite.v.zoom < agrandie.v.zoom, JSON.stringify(reduite));

    // ------------------------------------------------------------------
    // 2. LA MOLETTE AGRANDIT LÀ OÙ L'ON REGARDE.
    // ------------------------------------------------------------------
    const zone = await page.$('#carte-dessin');
    const bb = await zone.boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.4);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(200);
    const aLaMolette = await vue();
    r.verifie('la molette agrandit encore',
        aLaMolette.v.zoom > reduite.v.zoom, JSON.stringify(aLaMolette));

    // ------------------------------------------------------------------
    // 3. ON DÉPLACE LA CARTE EN LA TIRANT — ET CELA NE CHOISIT AUCUN PAYS.
    // ------------------------------------------------------------------
    // ON TIRE DEPUIS UN PAYS, ET ON LÂCHE SUR UN PAYS.
    //
    // C'est tout l'intérêt : un glissement qui commence et finit sur l'océan
    // ne mesure rien, puisqu'il n'y avait rien à colorier. Mesuré : le
    // contrôle restait muet quand on sabordait la garde. On vise donc un vrai
    // pays, et un gros — la Russie, le Brésil — pour que le départ ET
    // l'arrivée tombent dedans.
    const surUnPays = await page.evaluate(() => {
        let meilleur = null, aire = 0;
        document.querySelectorAll('#carte-dessin path[data-pays]').forEach(p => {
            const r = p.getBoundingClientRect();
            if (r.width * r.height > aire) { aire = r.width * r.height; meilleur = r; }
        });
        return meilleur ? { x: meilleur.x + meilleur.width / 2, y: meilleur.y + meilleur.height / 2,
                            l: Math.round(meilleur.width), h: Math.round(meilleur.height) } : null;
    });
    r.verifie('un pays assez grand sert de cible au glissement',
        !!surUnPays && surUnPays.l > 40 && surUnPays.h > 30, JSON.stringify(surUnPays));

    const avantGlissement = await retenus();
    const avantLeGeste = await vue();
    // UN PETIT GLISSEMENT, JUSTE AU-DELÀ DU SEUIL.
    //
    // Et c'est le cas qui compte : une grande poussée fait défiler la carte
    // sous le curseur, si bien qu'au relâchement on n'est plus sur le même
    // pays — le navigateur ne lance alors aucun clic de pays, et la garde ne
    // sert à rien. Mesuré : sabordée, elle ne faisait tomber aucun contrôle.
    // Six pixels, en revanche, laissent le même pays dessous : le clic part
    // pour de bon, et c'est là qu'il faut le retenir.
    await page.mouse.move(surUnPays.x, surUnPays.y);
    await page.mouse.down();
    await page.mouse.move(surUnPays.x + 6, surUnPays.y + 5, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const apresGlissement = await vue();
    r.verifie('tirer la carte la déplace de ce qu\'on a tiré',
        Math.abs((apresGlissement.v.x - avantLeGeste.v.x) - 6) <= 2
        && Math.abs((apresGlissement.v.y - avantLeGeste.v.y) - 5) <= 2,
        JSON.stringify({ avant: avantLeGeste.v, apres: apresGlissement.v }));
    r.egal('et le glissement ne colorie aucun pays, même lâché sur l\'un d\'eux',
        await retenus(), avantGlissement, 'retenus avant ' + avantGlissement);

    // ------------------------------------------------------------------
    // 4. MAIS UN CLIC NET CHOISIT TOUJOURS.
    //
    //    C'est l'autre moitié : une garde trop large ferait une carte qu'on
    //    ne peut plus colorier du tout.
    // ------------------------------------------------------------------
    await page.click('#carte-recentrer');
    await page.waitForTimeout(250);
    const recentree = await vue();
    r.verifie('« Tout voir » rend la carte entière',
        recentree.v.zoom === 1 && recentree.v.x === 0 && recentree.v.y === 0,
        JSON.stringify(recentree));

    await page.mouse.click(bb.x + bb.width * 0.55, bb.y + bb.height * 0.45);
    await page.waitForTimeout(450);
    const apresClic = await retenus();
    r.verifie('un clic net choisit bien un pays',
        apresClic > avantGlissement, 'avant ' + avantGlissement + ', après ' + apresClic);

    // ------------------------------------------------------------------
    // 5. LA CARTE NE S'ÉCHAPPE PAS DE SON CADRE.
    //
    //    Agrandie puis poussée très loin, elle pourrait ne plus montrer
    //    qu'un coin vide — et il faudrait deviner dans quel sens revenir.
    // ------------------------------------------------------------------
    // ON POUSSE PLUSIEURS FOIS, SANS JAMAIS SORTIR DU CADRE.
    //
    // Un seul geste de quatre mille pixels sort de la carte dès le deuxième
    // pas, et le navigateur cesse alors de raconter le déplacement : le
    // contrôle ne mesurait rien. Trois poussées qui restent dedans font le
    // même chemin, et celui-là est vraiment parcouru.
    await page.click('#carte-plus');
    await page.waitForTimeout(150);
    for (let i = 0; i < 3; i++) {
        await page.mouse.move(bb.x + bb.width * 0.15, bb.y + bb.height * 0.15);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width * 0.9, bb.y + bb.height * 0.9, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(120);
    }
    const poussee = await vue();
    r.verifie('poussée à bout de bras, elle reste sous les yeux',
        poussee.v.x <= 0 && poussee.v.y <= 0, JSON.stringify(poussee));

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
