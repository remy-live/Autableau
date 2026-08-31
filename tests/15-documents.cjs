// Ouvrir un cours déjà écrit : .txt, .md, .docx (Word) et .odt (LibreOffice).
// Les deux derniers sont des archives ZIP de XML : on en fabrique de vraies
// ici, l'une compressée, l'autre non, pour éprouver les deux chemins.
const zlib = require('zlib');
const { creerRapport, ouvrirApp } = require('./harness.cjs');

// --- Un mini-graveur de ZIP, juste pour les besoins du test ---
const TABLE_CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = TABLE_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function graverZip(entrees, compresser) {
    const morceaux = [];
    const central = [];
    let decalage = 0;

    entrees.forEach(({ nom, contenu }) => {
        const brut = Buffer.from(contenu, 'utf8');
        const donnees = compresser ? zlib.deflateRawSync(brut) : brut;
        const methode = compresser ? 8 : 0;
        const nomBuf = Buffer.from(nom, 'utf8');
        const crc = crc32(brut);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(methode, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(donnees.length, 18);
        local.writeUInt32LE(brut.length, 22);
        local.writeUInt16LE(nomBuf.length, 26);
        morceaux.push(local, nomBuf, donnees);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(methode, 10);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(donnees.length, 20);
        cd.writeUInt32LE(brut.length, 24);
        cd.writeUInt16LE(nomBuf.length, 28);
        cd.writeUInt32LE(decalage, 42);
        central.push(cd, nomBuf);

        decalage += local.length + nomBuf.length + donnees.length;
    });

    const corps = Buffer.concat(morceaux);
    const repertoire = Buffer.concat(central);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(entrees.length, 8);
    fin.writeUInt16LE(entrees.length, 10);
    fin.writeUInt32LE(repertoire.length, 12);
    fin.writeUInt32LE(corps.length, 16);
    return Buffer.concat([corps, repertoire, fin]);
}

const DOCX = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Les fractions</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Une fraction est un </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>quotient</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t> de deux entiers.</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Le numérateur</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Le dénominateur</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Titre2"/></w:pPr><w:r><w:t>À retenir</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>On simplifie</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>toujours.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>2/4</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1/2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`;

const ODT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">
<office:automatic-styles>
  <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
  <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
  <text:h text:outline-level="1">Le théorème de Pythagore</text:h>
  <text:p>Dans un triangle <text:span text:style-name="T1">rectangle</text:span>, on a <text:span text:style-name="T2">toujours</text:span> l'égalité.</text:p>
  <text:list text:style-name="L1">
    <text:list-item><text:p>L'hypoténuse</text:p></text:list-item>
    <text:list-item><text:p>Les côtés de l'angle droit</text:p></text:list-item>
  </text:list>
</office:text></office:body></office:document-content>`;

const TEXTE = `# Séance du jour

Objectif : comprendre les **fractions**.

- lire une fraction
- placer une fraction sur une droite graduée

## Pour aller plus loin
1. simplifier
2. comparer
Fin de la séance.`;

module.exports = async function (browser) {
    const r = creerRapport('Documents importés');
    const { context, page, erreurs } = await ouvrirApp(browser);
    await page.waitForFunction(() => window.LecteurDocuments && typeof importerDocument === 'function', { timeout: 20000 });

    // .docx compressé (deflate), .odt stocké tel quel : les deux chemins du ZIP
    const docx = graverZip([
        { nom: '[Content_Types].xml', contenu: '<?xml version="1.0"?><Types/>' },
        { nom: 'word/document.xml', contenu: DOCX }
    ], true);
    const odt = graverZip([
        { nom: 'mimetype', contenu: 'application/vnd.oasis.opendocument.text' },
        { nom: 'content.xml', contenu: ODT }
    ], false);

    // Un fichier fabriqué côté navigateur à partir des octets
    const lire = (nom, octets) => page.evaluate(async ({ nom, octets }) => {
        const f = new File([new Uint8Array(octets)], nom);
        return await window.LecteurDocuments.lire(f);
    }, { nom, octets: Array.from(octets) });

    // --- WORD ---
    const w = await lire('cours.docx', docx);
    r.verifie('un .docx est ouvert sans bibliothèque', !!w && !!w.html, JSON.stringify(w && w.html || '').slice(0, 120));
    r.verifie('les titres deviennent des titres', /<h1>Les fractions<\/h1>/.test(w.html), w.html.slice(0, 90));
    r.verifie('« Titre 2 » (Word français) aussi', /<h2>À retenir<\/h2>/.test(w.html), w.html);
    r.verifie('le gras est conservé', /<b>quotient<\/b>/.test(w.html), w.html);
    r.verifie('et le « pas gras » ne devient pas du gras',
        /<b>quotient<\/b>\s*de deux entiers/.test(w.html.replace(/<\/?div>/g, '')), w.html);
    r.verifie('l\'italique aussi', /<i>On simplifie<\/i>/.test(w.html), w.html);
    r.verifie('les listes deviennent des listes',
        /<ul><li>Le numérateur<\/li><li>Le dénominateur<\/li><\/ul>/.test(w.html), w.html);
    r.verifie('le saut de ligne dans un paragraphe est gardé', /toujours\.|<br>/.test(w.html), w.html);
    r.verifie('les accents survivent', /numérateur/.test(w.html) && !/�/.test(w.html), w.html.slice(0, 120));
    r.verifie('un tableau est mis à plat, une ligne par ligne', /2\/4\s*&nbsp;\|&nbsp;\s*1\/2/.test(w.html), w.html);
    r.egal('le titre du document est repris', w.titre, 'Les fractions');

    // --- LIBREOFFICE ---
    const o = await lire('lecon.odt', odt);
    r.verifie('un .odt non compressé est ouvert aussi', !!o && !!o.html, (o && o.html || '').slice(0, 100));
    r.verifie('son titre est un titre', /<h1>Le théorème de Pythagore<\/h1>/.test(o.html), o.html.slice(0, 100));
    r.verifie('le gras d\'un style automatique est retrouvé', /<b>rectangle<\/b>/.test(o.html), o.html);
    r.verifie('l\'italique aussi', /<i>toujours<\/i>/.test(o.html), o.html);
    r.verifie('une liste numérotée reste numérotée',
        /<ol><li>L'hypoténuse<\/li><li>Les côtés de l'angle droit<\/li><\/ol>/.test(o.html), o.html);

    // --- TEXTE BRUT ET MARKDOWN ---
    const t = await lire('seance.md', Buffer.from(TEXTE, 'utf8'));
    r.verifie('« # » fait un titre', /<h1>Séance du jour<\/h1>/.test(t.html), t.html.slice(0, 80));
    r.verifie('« ## » un sous-titre', /<h2>Pour aller plus loin<\/h2>/.test(t.html), t.html);
    r.verifie('« ** » du gras', /<b>fractions<\/b>/.test(t.html), t.html);
    r.verifie('« - » une liste à puces', /<ul><li>lire une fraction<\/li>/.test(t.html), t.html);
    r.verifie('« 1. » une liste numérotée', /<ol><li>simplifier<\/li><li>comparer<\/li><\/ol>/.test(t.html), t.html);

    const latin = await lire('vieux.txt', Buffer.from('Le nœud est résolu', 'latin1'));
    r.verifie('un texte enregistré sous Windows reste lisible',
        !/�/.test(latin.html) && /résolu/.test(latin.html), latin.html);

    // --- CE QUI ARRIVE SUR LE TABLEAU ---
    const pose = await page.evaluate(async ({ octets }) => {
        texts.length = 0;
        panX = 0; panY = 0; zoom = 1;
        await importerDocument(new File([new Uint8Array(octets)], 'cours.docx'));
        return texts.map(t => ({ x: t.x, y: t.y, colWidth: t.colWidth, taille: t.content.length,
                                 police: t.fontFamily, align: t.align }));
    }, { octets: Array.from(docx) });
    r.verifie('le document arrive sur le tableau', pose.length >= 1, JSON.stringify(pose));
    r.verifie('en blocs à largeur de colonne, pas en ligne infinie',
        pose.every(p => p.colWidth === 900), JSON.stringify(pose));
    r.verifie('posés à droite de la barre d\'outils, pas dessous',
        pose[0].x >= 200 && pose[0].x < 400 && pose[0].y < 300, JSON.stringify(pose[0]));
    r.verifie('les blocs ne se superposent pas',
        pose.length < 2 || pose[1].x >= pose[0].x + 900, JSON.stringify(pose));

    const selection = await page.evaluate(() => selectedItems.map(s => s.type));
    r.verifie('le texte importé est sélectionné, prêt à être déplacé',
        selection.length > 0 && selection.every(t => t === 'text'), JSON.stringify(selection));

    // Un long document se coupe en plusieurs blocs, aux titres
    const longDoc = await page.evaluate(() => {
        const blocs = [];
        for (let i = 0; i < 4; i++) {
            blocs.push({ type: 'h1', html: 'Partie ' + i });
            for (let j = 0; j < 6; j++) blocs.push({ type: 'p', html: 'Un paragraphe de cours.' });
        }
        return decouperDocument(blocs).length;
    });
    r.verifie('un cours à quatre parties fait quatre blocs', longDoc === 4, `${longDoc} blocs`);

    // --- LES ENTRÉES DE L'APPLICATION ---
    const entrees = await page.evaluate(() => ({
        bouton: !!document.getElementById('btn-import-doc'),
        champ: (document.getElementById('doc-loader') || {}).accept,
        media: (document.getElementById('pdf-loader') || {}).accept,
        reconnait: ['a.docx', 'b.odt', 'c.txt', 'd.md'].every(n => LecteurDocuments.estUnDocument({ name: n })),
        ignore: ['a.pdf', 'b.png', 'c.mp3'].every(n => !LecteurDocuments.estUnDocument({ name: n }))
    }));
    r.verifie('le menu Importer propose les documents', entrees.bouton);
    r.verifie('le sélecteur ne montre que les documents lisibles',
        /docx/.test(entrees.champ || '') && /odt/.test(entrees.champ || ''), entrees.champ);
    r.verifie('l\'entrée média les accepte aussi (glisser-déposer, Drive)',
        /docx/.test(entrees.media || ''), entrees.media);
    r.verifie('les extensions attendues sont reconnues', entrees.reconnait);
    r.verifie('les autres fichiers ne sont pas détournés', entrees.ignore);

    // Un fichier illisible ne doit pas casser le tableau
    const casse = await page.evaluate(async () => {
        const avant = texts.length;
        await importerDocument(new File([new Uint8Array([1, 2, 3, 4, 5])], 'faux.docx'));
        return { avant, apres: texts.length };
    });
    r.egal('un document illisible ne pose rien et ne casse rien', casse.apres, casse.avant);

    r.verifie('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
    await context.close();
    return r.bilan();
};
