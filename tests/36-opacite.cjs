// LE CURSEUR D'OPACITÉ SE VOIT ET S'ATTRAPE.
//
// « Il semble manquer le slider d'opacité. »
//
// Il était bien là — mais sans hauteur. Un curseur « appearance: none » sans
// hauteur voit sa boîte se réduire à celle de sa piste : QUATRE PIXELS. La
// pastille dépassait donc de sa propre boîte : on la voyait, mais la bande
// sensible à la souris faisait quatre pixels de haut, et le geste ratait une
// fois sur deux. Rien ne disait non plus où l'on en était — pas de nombre,
// pas d'unité —, si bien qu'on ne pouvait ni régler à la souris ni lire le
// réglage : le plus simple était d'en conclure qu'il n'existait pas.
//
// CE QUE CETTE SUITE TIENT :
//
//   — la boîte du curseur est assez haute pour qu'on l'attrape ;
//   — le tirer change vraiment l'opacité, et le pour cent suit ;
//   — taper un pour cent déplace le curseur et l'applique ;
//   — le nombre suit ce que montre le curseur : au changement d'onglet
//     contour/fond, et sur un tampon sélectionné ;
//   — un nombre hors bornes ou illisible ne casse rien.
const { creerRapport, ouvrirApp } = require('./harness.cjs');

const HAUTEUR_MINI = 16;   // en pixels : au-dessous, on ne l'attrape plus

module.exports = async function (browser) {
    const r = creerRapport('Opacité');
    const { page, context, erreurs } = await ouvrirApp(browser, { viewport: { width: 1400, height: 900 } });

    const ouvrirLaPastille = () => page.evaluate(() => {
        const p = document.getElementById('color-popover');
        if (getComputedStyle(p).display === 'none') document.getElementById('btn-color-popover').click();
    });

    const lire = () => page.evaluate(() => ({
        curseur: parseFloat(document.getElementById('opacity-slider').value),
        nombre: document.getElementById('opacity-num').value,
        trait: activeStyle.strokeOpacity,
        fond: activeStyle.fillOpacity
    }));

    await ouvrirLaPastille();
    await page.waitForTimeout(300);

    // ---------------------------------------------------------------
    // 1. On peut l'attraper
    // ---------------------------------------------------------------
    const boite = await page.evaluate(() => {
        const s = document.getElementById('opacity-slider');
        const b = s.getBoundingClientRect();
        const p = document.getElementById('color-popover').getBoundingClientRect();
        return {
            h: Math.round(b.height), l: Math.round(b.width),
            x: b.x, y: b.y,
            dedans: b.top >= p.top - 1 && b.bottom <= p.bottom + 1
        };
    });
    r.verifie('la bande sensible du curseur fait au moins seize pixels de haut',
        boite.h >= HAUTEUR_MINI, boite.h + ' px');
    r.verifie('le curseur tient dans la fenêtre de la pastille', boite.dedans, JSON.stringify(boite));

    const pourCent = await page.evaluate(() => {
        const n = document.getElementById('opacity-num');
        const b = n.getBoundingClientRect();
        return { present: !!n, l: Math.round(b.width), unite: !!document.querySelector('.opacity-pc') };
    });
    r.verifie('le pour cent se lit à côté, avec son unité',
        pourCent.present && pourCent.unite && pourCent.l >= 30, JSON.stringify(pourCent));

    // ---------------------------------------------------------------
    // 2. Le tirer règle l'opacité, et le nombre suit
    // ---------------------------------------------------------------
    await page.mouse.move(boite.x + boite.l * 0.5, boite.y + boite.h / 2);
    await page.mouse.down();
    await page.mouse.move(boite.x + boite.l * 0.3, boite.y + boite.h / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const tire = await lire();
    r.verifie('tirer le curseur descend l\'opacité du trait',
        tire.trait < 0.5 && tire.trait > 0.05, JSON.stringify(tire));
    r.verifie('et le pour cent dit exactement la même chose',
        Number(tire.nombre) === Math.round(tire.curseur * 100), JSON.stringify(tire));

    // ---------------------------------------------------------------
    // 3. Taper un pour cent déplace le curseur et l'applique
    // ---------------------------------------------------------------
    const taper = (v) => page.evaluate((v) => {
        const n = document.getElementById('opacity-num');
        n.value = v;
        n.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);

    await taper(40);
    await page.waitForTimeout(150);
    const tape = await lire();
    r.egal('taper 40 pose l\'opacité à 0,40',
        { curseur: tape.curseur, trait: tape.trait }, { curseur: 0.4, trait: 0.4 });

    // Hors bornes : on rabat, on ne casse pas.
    await taper(250);
    await page.waitForTimeout(150);
    const trop = await lire();
    r.egal('au-delà de cent, on rabat à cent', { curseur: trop.curseur, trait: trop.trait },
        { curseur: 1, trait: 1 });

    await taper(-30);
    await page.waitForTimeout(150);
    const sous = await lire();
    r.egal('au-dessous de zéro, on rabat à zéro', { curseur: sous.curseur, trait: sous.trait },
        { curseur: 0, trait: 0 });

    // Un champ vidé ne doit pas poser une opacité « pas un nombre ».
    await taper('');
    await page.waitForTimeout(150);
    const vide = await lire();
    r.verifie('un champ vidé laisse l\'opacité où elle est',
        Number.isFinite(vide.trait) && vide.trait === 0, JSON.stringify(vide));

    await taper(100);
    await page.waitForTimeout(150);

    // ---------------------------------------------------------------
    // 4. Le nombre suit ce que montre le curseur
    // ---------------------------------------------------------------
    await page.evaluate(() => { activeStyle.fillOpacity = 0.2; });
    await page.evaluate(() => document.querySelector('.popover-tab[data-target="fill"]').click());
    await page.waitForTimeout(200);
    const surLeFond = await lire();
    r.egal('l\'onglet « Fond » montre l\'opacité du fond, en toutes lettres',
        { curseur: surLeFond.curseur, nombre: surLeFond.nombre }, { curseur: 0.2, nombre: '20' });

    await page.evaluate(() => document.querySelector('.popover-tab[data-target="stroke"]').click());
    await page.waitForTimeout(200);
    const surLeTrait = await lire();
    r.egal('et l\'onglet « Contour » celle du trait',
        { curseur: surLeTrait.curseur, nombre: surLeTrait.nombre }, { curseur: 1, nombre: '100' });

    // Un tampon sélectionné : le curseur règle SON opacité, et le nombre aussi.
    // On le prend à la souris, comme on le ferait : c'est ce clic qui rend la
    // main au tableau — un curseur qui garde le focus ne se laisse pas
    // rafraîchir, et c'est voulu (on ne réécrit pas sous les doigts).
    const cible = await page.evaluate(async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70">'
            + '<rect width="120" height="70" fill="#3498db"/></svg>';
        images.length = 0; selectedItems = []; panX = 300; panY = 400; zoom = 1;
        setMode('pointer');
        const st = await new Promise(ok => createStampFromSVG(svg, ok));
        images.push({ id: nextId++, x: 0, y: 0, w: st.w, h: st.h, cx: 0, cy: 0,
            cw: st.w, ch: st.h, src: st.src, z: globalZ++, opacity: 0.35 });
        draw();
        return { x: panX + st.w / 2, y: panY + st.h / 2 };
    });
    await page.mouse.click(cible.x, cible.y);
    await page.waitForTimeout(350);
    await ouvrirLaPastille();
    await page.waitForTimeout(250);
    const surLeTampon = await page.evaluate(() => ({
        curseur: parseFloat(document.getElementById('opacity-slider').value),
        nombre: document.getElementById('opacity-num').value,
        libelle: document.querySelector('#color-popover .opacity-container').firstChild.textContent
    }));
    r.egal('un tampon sélectionné, le nombre montre SON opacité',
        { curseur: surLeTampon.curseur, nombre: surLeTampon.nombre }, { curseur: 0.35, nombre: '35' });
    r.verifie('et le libellé le dit', /tampon/i.test(surLeTampon.libelle), surLeTampon.libelle);

    r.verifie('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
