// LE DÉMARRAGE NE TIRE PLUS CE QUI NE SERT PAS.
// MathJax pèse 2,1 Mo et MathLive 1,3 Mo — 3,4 des 8,2 Mo du démarrage — et la
// plupart des séances ne composent jamais la moindre formule. Sur le réseau
// d'un établissement, avec trente tablettes, c'est la différence entre « ça
// marche » et « ça rame ».
//
// Le piège était que `init` d'un plugin est appelé pour TOUS les plugins à
// l'ouverture : ce qu'on y met est chargé par tout le monde, y compris par la
// séance d'histoire. Les deux moteurs sont donc allés là où ils servent.
const { creerRapport, ouvrirApp, tableauVierge } = require('./harness.cjs');

// Ce qui est réellement chargé dans la page. Le Resource Timing ne compte pas
// les fichiers d'un dossier : on regarde donc le DOM et les objets, ce qui est
// de toute façon plus proche de la question posée.
const CE_QUI_EST_CHARGE = () => ({
    mathjax: !!document.getElementById('MathJax-script'),
    mathjaxPret: !!(window.MathJax && window.MathJax.tex2svgPromise),
    mathlive: !!customElements.get('math-field'),
    scriptsLourds: Array.from(document.scripts).map(s => s.src)
        .filter(s => /mathjax|mathlive/i.test(s)).map(s => s.split('/').pop())
});

module.exports = async function (browser) {
    const r = creerRapport('Démarrage léger');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await tableauVierge(page);

    const auDepart = await page.evaluate(CE_QUI_EST_CHARGE);
    r.egal('au démarrage, ni MathJax ni MathLive ne sont chargés',
        { jax: auDepart.mathjax, live: auDepart.mathlive, scripts: auDepart.scriptsLourds },
        { jax: false, live: false, scripts: [] });

    // Et l'application marche : c'est la moitié de la question.
    const vivante = await page.evaluate(() => ({
        plugins: Object.keys(PluginManager.plugins).length,
        bouton: !!document.querySelector('#plugins-grid .btn[data-mode="math"]'),
        rates: Object.keys(PluginManager.faulty || {}).length
    }));
    r.verifie('les quatre-vingt-six outils sont là quand même',
        vivante.plugins > 80 && vivante.rates === 0, JSON.stringify(vivante));
    r.verifie('dont le bouton des formules, prêt à servir', vivante.bouton);

    // --- UN TEXTE SANS FORMULE NE CHARGE RIEN ---
    const sansFormule = await page.evaluate(async () => {
        await new Promise((res) => createMathImage('Un texte simple, 12 $ environ', '#000', 24, () => res()));
        await new Promise(res => setTimeout(res, 400));
        return !!document.getElementById('MathJax-script');
    });
    r.verifie('un texte sans formule ne va rien chercher', !sansFormule);

    // --- UNE FORMULE LE CHARGE, ET LA COMPOSE ---
    const formule = await page.evaluate(async () => {
        const t0 = performance.now();
        const rendu = await new Promise((res) => {
            createMathImage('Voici $x^2 + 1$ dans du texte', '#000', 24,
                (img, l, h) => res(img ? { l, h } : null));
        });
        return { rendu, ms: Math.round(performance.now() - t0) };
    });
    r.verifie('une formule dans du texte se compose bien',
        !!formule.rendu && formule.rendu.l > 20 && formule.rendu.h > 5,
        JSON.stringify(formule));
    const apresFormule = await page.evaluate(CE_QUI_EST_CHARGE);
    r.egal('elle a fait venir MathJax, et lui seul',
        { jax: apresFormule.mathjaxPret, live: apresFormule.mathlive },
        { jax: true, live: false });

    // Une deuxième formule ne recharge rien : le chargeur ne sert qu'une fois.
    const deuxieme = await page.evaluate(async () => {
        const avant = document.querySelectorAll('script[src*="tex-svg"]').length;
        const rendu = await new Promise((res) => createMathImage('$a+b$', '#000', 24, (img) => res(!!img)));
        return { rendu, memeNombre: document.querySelectorAll('script[src*="tex-svg"]').length === avant };
    });
    r.egal('une deuxième formule ne recharge rien', deuxieme, { rendu: true, memeNombre: true });

    // --- L'ATELIER DES FORMULES, dans un onglet neuf ---
    const { context: ctx2, page: page2, erreurs: err2 } = await ouvrirApp(browser);
    await tableauVierge(page2);
    const neuf = await page2.evaluate(CE_QUI_EST_CHARGE);
    r.egal('un onglet neuf repart léger',
        { jax: neuf.mathjax, live: neuf.mathlive }, { jax: false, live: false });

    await page2.evaluate(() => PluginManager.plugins.mathFormulaTool.openStudio('\\frac{1}{2}', () => { }));
    await page2.waitForTimeout(2500);
    const atelier = await page2.evaluate(() => ({
        champ: !!document.querySelector('math-field'),
        defini: !!customElements.get('math-field'),
        saisie: !!document.getElementById('latex-input')
    }));
    r.egal('ouvrir l\'atelier monte un éditeur complet',
        atelier, { champ: true, defini: true, saisie: true });
    const apresAtelier = await page2.evaluate(CE_QUI_EST_CHARGE);
    r.egal('et c\'est là, et seulement là, que les deux moteurs arrivent',
        { jax: apresAtelier.mathjaxPret, live: apresAtelier.mathlive },
        { jax: true, live: true });

    // On compose vraiment depuis l'atelier : le bouton doit aboutir, pas
    // renvoyer « réessayez dans un instant ».
    const compose = await page2.evaluate(async () => {
        const champ = document.getElementById('latex-input');
        if (!champ) return { erreur: 'pas de champ' };
        champ.value = 'x^2+1';
        document.getElementById('math-btn-valid').click();
        await new Promise(res => setTimeout(res, 1800));
        return { fenetreFermee: !document.querySelector('math-field') };
    });
    r.egal('valider compose la formule et referme l\'atelier',
        compose, { fenetreFermee: true });

    r.verifie('aucune erreur JS dans l\'atelier', err2.length === 0, err2.join(' | '));
    await ctx2.close();

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
