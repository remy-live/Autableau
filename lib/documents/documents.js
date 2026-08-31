// ============================================================
// LECTURE DES DOCUMENTS : .txt, .md, .docx (Word), .odt (LibreOffice)
// ============================================================
// Un .docx comme un .odt est une archive ZIP qui contient du XML. Le
// navigateur sait tout faire : dézipper (DecompressionStream), lire du XML
// (DOMParser). Aucune bibliothèque à charger, et l'import marche hors ligne.
//
// La sortie est le MÊME petit HTML que le collage depuis Word : b, i, u,
// h1/h2/h3, ul/ol/li, div, br. Rien d'autre n'entre sur le tableau.
// ============================================================
(function () {
    'use strict';

    const NS = {
        w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
        style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
        fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
        office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0'
    };

    const LIMITE_CARACTERES = 300000;   // au-delà, on coupe : c'est un tableau, pas un traitement de texte

    function echapper(t) {
        return String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    }

    // --- ZIP ---------------------------------------------------

    async function decompresser(donnees) {
        if (typeof DecompressionStream !== 'function') {
            throw new Error('Ce navigateur ne sait pas ouvrir les .docx / .odt (trop ancien)');
        }
        const flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(flux).arrayBuffer());
    }

    // Renvoie le contenu texte d'un fichier de l'archive.
    async function fichierDuZip(buffer, chemin) {
        const vue = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        // La fin du répertoire central est en queue d'archive, après un
        // commentaire éventuel : on la cherche à reculons.
        let fin = -1;
        for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
            if (vue.getUint32(i, true) === 0x06054b50) { fin = i; break; }
        }
        if (fin < 0) throw new Error("Ce fichier n'est pas une archive lisible");

        const nbEntrees = vue.getUint16(fin + 10, true);
        let p = vue.getUint32(fin + 16, true);
        const decodeur = new TextDecoder('utf-8');

        for (let i = 0; i < nbEntrees; i++) {
            if (vue.getUint32(p, true) !== 0x02014b50) break;
            const methode = vue.getUint16(p + 10, true);
            const tailleComp = vue.getUint32(p + 20, true);
            const lgNom = vue.getUint16(p + 28, true);
            const lgExtra = vue.getUint16(p + 30, true);
            const lgComm = vue.getUint16(p + 32, true);
            const debutLocal = vue.getUint32(p + 42, true);
            const nom = decodeur.decode(u8.subarray(p + 46, p + 46 + lgNom));

            if (nom === chemin) {
                if (tailleComp === 0xffffffff) throw new Error('Document trop volumineux (ZIP64)');
                const lgNomL = vue.getUint16(debutLocal + 26, true);
                const lgExtraL = vue.getUint16(debutLocal + 28, true);
                const debut = debutLocal + 30 + lgNomL + lgExtraL;
                const donnees = u8.subarray(debut, debut + tailleComp);
                if (methode === 0) return decodeur.decode(donnees);
                if (methode !== 8) throw new Error('Compression non gérée dans ce document');
                return decodeur.decode(await decompresser(donnees));
            }
            p += 46 + lgNom + lgExtra + lgComm;
        }
        throw new Error('Document incomplet : « ' + chemin + ' » est absent');
    }

    // --- BLOCS -------------------------------------------------
    // Un bloc = un paragraphe, un titre ou un élément de liste, déjà en HTML.

    function blocsVersHtml(blocs) {
        const morceaux = [];
        let liste = null;                     // 'ul' ou 'ol' en cours
        const fermerListe = () => { if (liste) { morceaux.push('</' + liste + '>'); liste = null; } };

        blocs.forEach(b => {
            if (b.type === 'li') {
                const voulue = b.ordonnee ? 'ol' : 'ul';
                if (liste !== voulue) { fermerListe(); morceaux.push('<' + voulue + '>'); liste = voulue; }
                morceaux.push('<li>' + (b.html || '') + '</li>');
                return;
            }
            fermerListe();
            if (b.type === 'p') morceaux.push('<div>' + (b.html || '<br>') + '</div>');
            else morceaux.push('<' + b.type + '>' + (b.html || '') + '</' + b.type + '>');
        });
        fermerListe();
        return morceaux.join('');
    }

    function envelopper(html, styles) {
        let out = html;
        if (styles.b) out = '<b>' + out + '</b>';
        if (styles.i) out = '<i>' + out + '</i>';
        if (styles.u) out = '<u>' + out + '</u>';
        return out;
    }

    // --- WORD (.docx) ------------------------------------------

    function attributW(el, nom) { return el ? el.getAttributeNS(NS.w, nom) : null; }
    function enfantW(el, nom) {
        if (!el) return null;
        for (const c of el.children) if (c.localName === nom && c.namespaceURI === NS.w) return c;
        return null;
    }
    function actif(el) {
        // <w:b/> vaut « gras » ; <w:b w:val="0"/> vaut « pas gras »
        if (!el) return false;
        const v = attributW(el, 'val');
        return v === null || !['0', 'false', 'off'].includes(v);
    }

    function runWord(r) {
        const pr = enfantW(r, 'rPr');
        const styles = {
            b: actif(enfantW(pr, 'b')),
            i: actif(enfantW(pr, 'i')),
            u: !!enfantW(pr, 'u') && attributW(enfantW(pr, 'u'), 'val') !== 'none'
        };
        let html = '';
        for (const c of r.children) {
            if (c.namespaceURI !== NS.w) continue;
            if (c.localName === 't') html += echapper(c.textContent);
            else if (c.localName === 'tab') html += ' ';
            else if (c.localName === 'br') html += '<br>';
        }
        if (!html) return '';
        return envelopper(html, styles);
    }

    function paragrapheWord(p) {
        const pr = enfantW(p, 'pPr');
        const style = (attributW(enfantW(pr, 'pStyle'), 'val') || '').toLowerCase();
        let html = '';
        for (const c of p.children) {
            if (c.namespaceURI !== NS.w) continue;
            if (c.localName === 'r') html += runWord(c);
            else if (c.localName === 'hyperlink') {
                for (const r of c.children) if (r.localName === 'r') html += runWord(r);
            }
        }

        const niveau = style.match(/(?:heading|titre)\s*([1-9])/);
        if (niveau) return { type: 'h' + Math.min(3, parseInt(niveau[1])), html };
        if (enfantW(pr, 'numPr')) return { type: 'li', ordonnee: /number|numero|décimal|decimal/.test(style), html };
        return { type: 'p', html };
    }

    async function lireDocx(buffer) {
        const xml = await fichierDuZip(buffer, 'word/document.xml');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Document Word illisible');

        const corps = doc.getElementsByTagNameNS(NS.w, 'body')[0];
        if (!corps) throw new Error('Document Word vide');

        const blocs = [];
        const parcourir = (parent) => {
            for (const n of parent.children) {
                if (n.namespaceURI !== NS.w) continue;
                if (n.localName === 'p') blocs.push(paragrapheWord(n));
                else if (n.localName === 'tbl') {
                    // Un tableau se met à plat : une ligne par ligne, cellules
                    // séparées par une barre. Mieux qu'un tableau perdu.
                    for (const tr of n.children) {
                        if (tr.localName !== 'tr') continue;
                        const cellules = [];
                        for (const tc of tr.children) {
                            if (tc.localName !== 'tc') continue;
                            const morceaux = [];
                            for (const pp of tc.getElementsByTagNameNS(NS.w, 'p')) morceaux.push(paragrapheWord(pp).html);
                            cellules.push(morceaux.filter(Boolean).join(' '));
                        }
                        blocs.push({ type: 'p', html: cellules.join(' &nbsp;|&nbsp; ') });
                    }
                }
            }
        };
        parcourir(corps);
        return blocs;
    }

    // --- LIBREOFFICE (.odt) ------------------------------------

    function stylesOdt(doc) {
        const table = {};
        const familles = doc.getElementsByTagNameNS(NS.style, 'style');
        for (const s of familles) {
            const nom = s.getAttributeNS(NS.style, 'name');
            if (!nom) continue;
            const tp = s.getElementsByTagNameNS(NS.style, 'text-properties')[0];
            table[nom] = {
                parent: s.getAttributeNS(NS.style, 'parent-style-name') || null,
                b: !!tp && /bold|^[6-9]00$/.test(tp.getAttributeNS(NS.fo, 'font-weight') || ''),
                i: !!tp && (tp.getAttributeNS(NS.fo, 'font-style') || '') === 'italic',
                u: !!tp && !!(tp.getAttributeNS(NS.style, 'text-underline-style') || '').replace('none', '')
            };
        }
        return table;
    }

    function styleOdt(table, nom, vus) {
        const base = { b: false, i: false, u: false };
        let s = table[nom];
        let garde = 0;
        while (s && garde++ < 5) {
            base.b = base.b || s.b; base.i = base.i || s.i; base.u = base.u || s.u;
            s = s.parent ? table[s.parent] : null;
        }
        return base;
    }

    function contenuOdt(noeud, table, herite) {
        let html = '';
        for (const n of noeud.childNodes) {
            if (n.nodeType === Node.TEXT_NODE) { html += echapper(n.textContent); continue; }
            if (n.nodeType !== Node.ELEMENT_NODE) continue;
            if (n.namespaceURI === NS.text && n.localName === 'line-break') { html += '<br>'; continue; }
            if (n.namespaceURI === NS.text && n.localName === 's') {
                html += ' '.repeat(Math.max(1, parseInt(n.getAttributeNS(NS.text, 'c') || '1')));
                continue;
            }
            if (n.namespaceURI === NS.text && n.localName === 'tab') { html += ' '; continue; }
            if (n.namespaceURI === NS.text && n.localName === 'span') {
                const s = styleOdt(table, n.getAttributeNS(NS.text, 'style-name'));
                html += envelopper(contenuOdt(n, table, s), s);
                continue;
            }
            html += contenuOdt(n, table, herite);   // liens, annotations… : on garde le texte
        }
        return html;
    }

    function listeOrdonnee(doc, nomStyle) {
        if (!nomStyle) return false;
        for (const ls of doc.getElementsByTagNameNS(NS.text, 'list-style')) {
            if (ls.getAttributeNS(NS.style, 'name') === nomStyle) {
                return ls.getElementsByTagNameNS(NS.text, 'list-level-style-number').length > 0;
            }
        }
        return false;
    }

    async function lireOdt(buffer) {
        const xml = await fichierDuZip(buffer, 'content.xml');
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Document LibreOffice illisible');

        const table = stylesOdt(doc);
        const corps = doc.getElementsByTagNameNS(NS.office, 'text')[0];
        if (!corps) throw new Error('Document LibreOffice vide');

        const blocs = [];
        const parcourir = (parent, dansListe) => {
            for (const n of parent.children) {
                if (n.namespaceURI !== NS.text) continue;
                if (n.localName === 'h') {
                    const niveau = Math.min(3, parseInt(n.getAttributeNS(NS.text, 'outline-level') || '1'));
                    blocs.push({ type: 'h' + niveau, html: contenuOdt(n, table, {}) });
                } else if (n.localName === 'p') {
                    const html = contenuOdt(n, table, {});
                    blocs.push(dansListe ? { type: 'li', ordonnee: dansListe.ordonnee, html } : { type: 'p', html });
                } else if (n.localName === 'list') {
                    const ordonnee = listeOrdonnee(doc, n.getAttributeNS(NS.text, 'style-name'));
                    for (const item of n.children) {
                        if (item.localName === 'list-item') parcourir(item, { ordonnee });
                        else if (item.localName === 'list-header') parcourir(item, null);
                    }
                } else if (n.localName === 'section') {
                    parcourir(n, dansListe);
                }
            }
        };
        parcourir(corps, null);
        return blocs;
    }

    // --- TEXTE BRUT (.txt, .md) --------------------------------

    function lireTexte(texte) {
        const enrichir = (l) => echapper(l)
            .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,;:!?])/g, '$1<i>$2</i>');

        return texte.replace(/\r\n?/g, '\n').split('\n').map(ligne => {
            const titre = ligne.match(/^(#{1,3})\s+(.*)$/);
            if (titre) return { type: 'h' + titre[1].length, html: enrichir(titre[2]) };
            const puce = ligne.match(/^\s*[-*•]\s+(.*)$/);
            if (puce) return { type: 'li', ordonnee: false, html: enrichir(puce[1]) };
            const numero = ligne.match(/^\s*\d+[.)]\s+(.*)$/);
            if (numero) return { type: 'li', ordonnee: true, html: enrichir(numero[1]) };
            return { type: 'p', html: enrichir(ligne) };
        });
    }

    // Un texte enregistré sous Windows arrive parfois en Latin-1 : si l'UTF-8
    // laisse des caractères de remplacement, on retente.
    function decoderTexte(buffer) {
        const utf8 = new TextDecoder('utf-8').decode(buffer);
        if (!utf8.includes('�')) return utf8;
        try { return new TextDecoder('windows-1252').decode(buffer); } catch (e) { return utf8; }
    }

    // --- ENTRÉE PUBLIQUE ---------------------------------------

    const EXTENSIONS = ['.txt', '.md', '.csv', '.docx', '.odt'];

    function estUnDocument(fichier) {
        if (!fichier) return false;
        const nom = (fichier.name || '').toLowerCase();
        return EXTENSIONS.some(e => nom.endsWith(e));
    }

    // Renvoie { html, blocs, titre, tronque }
    async function lire(fichier) {
        const nom = (fichier.name || '').toLowerCase();
        const buffer = await fichier.arrayBuffer();

        let blocs;
        if (nom.endsWith('.docx')) blocs = await lireDocx(buffer);
        else if (nom.endsWith('.odt')) blocs = await lireOdt(buffer);
        else blocs = lireTexte(decoderTexte(buffer));

        // On enlève les lignes vides du début et de la fin, et on ne garde
        // qu'une ligne vide d'affilée : Word en sème beaucoup.
        const utile = [];
        blocs.forEach(b => {
            const vide = !b.html || !b.html.replace(/<[^>]+>|&nbsp;|\s/g, '');
            if (vide && (utile.length === 0 || !utile[utile.length - 1].html)) return;
            utile.push(vide ? { type: 'p', html: '' } : b);
        });
        while (utile.length && !utile[utile.length - 1].html) utile.pop();

        let tronque = false;
        let total = 0;
        const gardes = [];
        for (const b of utile) {
            total += (b.html || '').length;
            if (total > LIMITE_CARACTERES) { tronque = true; break; }
            gardes.push(b);
        }

        const premierTitre = gardes.find(b => /^h[1-3]$/.test(b.type));
        return {
            blocs: gardes,
            html: blocsVersHtml(gardes),
            titre: (premierTitre ? premierTitre.html.replace(/<[^>]+>/g, '') : (fichier.name || '').replace(/\.[^.]+$/, '')).trim(),
            tronque
        };
    }

    window.LecteurDocuments = { lire, estUnDocument, blocsVersHtml, EXTENSIONS };
})();
