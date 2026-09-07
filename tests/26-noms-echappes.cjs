// UN NOM N'EST PAS DU CODE — LA GARDE PERMANENTE.
//
// L'affichage se construit par « innerHTML », partout : c'est le choix de ce
// projet, sans étape de compilation ni cadriciel, et il tient. Mais on y pose
// des noms d'élèves, des noms de classes, des titres de tableaux et des noms
// de fichiers — du texte que PERSONNE N'ÉCRIT ICI : il est collé depuis un
// logiciel de vie scolaire, lu dans un fichier de classes qu'un collègue a
// envoyé, ou pris au nom d'un fichier ouvert. Posé tel quel, un nom bien
// choisi s'exécute, et il a alors accès à tout ce que ce navigateur garde :
// les tableaux, les classes, le dossier de sauvegarde automatique, les jetons
// des services reliés.
//
// Un premier coup de balai ne suffit pas : la règle ne tient qu'à l'attention
// de celui qui écrit la ligne suivante. Ce test relit donc les sources et
// signale toute donnée d'origine extérieure posée dans un gabarit HTML sans
// passer par l'échappement. Ce qui vient de NOS PROPRES tables — le nom d'un
// modèle de salle, le libellé d'un raccourci — est écrit ici même, avec sa
// raison : la liste est la trace de la relecture, pas une exemption commode.
const fs = require('fs');
const path = require('path');
const { creerRapport } = require('./harness.cjs');

const SOURCES = ['script.js', 'plugin.js'];

// Les champs qui portent, quelque part, du texte venu du dehors.
const CHAMPS = /\.(name|nom|libelle|titre|memo|fileName|label|nomClasse|classeNom)\b/;

// Ce qui met à l'abri : un échappement, ou une expression qui ne rend pas du
// texte (une longueur, un nombre, une liste qu'on parcourt — ses propres
// interpolations sont examinées séparément).
const SUR = /echapper|echappe|Echappe|xmlEsc|escapeXml|escapeHtml|\besc\(|\bdit\(|initiales\(|\.replace\(|encodeURI|toFixed|\.length|JSON\.stringify|\.map\(/;

// On ne s'intéresse qu'aux gabarits qui fabriquent du HTML.
const BALISE = /<(div|span|button|input|option|td|th|tr|table|label|b|i|p|h[1-6]|text|rect|a|select|summary|details|img|svg|li|ul)\b|<\/[a-z]/i;

// RELU ET SANS DANGER : ces valeurs viennent de nos propres tables, écrites
// dans le code. Chaque motif porte sa raison.
const RELUS = [
    { motif: /^r\.nom$/, pourquoi: 'RACCOURCIS_OUTILS / RACCOURCIS_GESTES : notre table' },
    { motif: /^t\.label$/, pourquoi: 'SEATING_TEMPLATES et la table des éléments chimiques : nos tables' },
    { motif: /^s\.label$/, pourquoi: 'les couleurs des cartes à jouer : notre table' },
    { motif: /^d\.name$/, pourquoi: 'les thèmes de couleurs : notre table' },
    { motif: /^t\.nom\.toLowerCase\(\)$/, pourquoi: 'TYPES_OUBLI : nos quatre motifs' },
    { motif: /^outil\(s\.memo\)$/, pourquoi: 'rend un nom de classe CSS, pas le mémo' },
    { motif: /^eleve\.memo\s*\?/, pourquoi: 'le mémo n\'est qu\'une condition : les deux branches sont des littéraux' },
    { motif: /^spDonne\s*\?/, pourquoi: 'les deux branches sont des littéraux' }
];

// Toutes les interpolations d'un source, avec leur position.
function interpolations(src) {
    const out = [];
    for (let i = 0; i < src.length - 1; i++) {
        if (src[i] === '$' && src[i + 1] === '{') {
            let profondeur = 1, j = i + 2;
            while (j < src.length && profondeur > 0) {
                if (src[j] === '{') profondeur++;
                else if (src[j] === '}') profondeur--;
                j++;
            }
            out.push({ debut: i, expr: src.slice(i + 2, j - 1) });
            i = j - 1;
        }
    }
    return out;
}

module.exports = async function () {
    const r = creerRapport('Noms échappés');
    const racine = path.join(__dirname, '..');
    const suspects = [];
    let examinees = 0;
    const servis = new Set();

    SOURCES.forEach(fichier => {
        const src = fs.readFileSync(path.join(racine, fichier), 'utf8');
        const debuts = [];
        let position = 0;
        src.split('\n').forEach(l => { debuts.push(position); position += l.length + 1; });
        const ligneDe = (pos) => {
            let bas = 0, haut = debuts.length - 1;
            while (bas < haut) {
                const milieu = (bas + haut + 1) >> 1;
                if (debuts[milieu] <= pos) bas = milieu; else haut = milieu - 1;
            }
            return bas + 1;
        };

        interpolations(src).forEach(x => {
            if (!CHAMPS.test(x.expr) || SUR.test(x.expr)) return;
            const autour = src.slice(Math.max(0, x.debut - 220), x.debut + x.expr.length + 120);
            if (!BALISE.test(autour)) return;
            examinees++;
            const propre = x.expr.replace(/\s+/g, ' ').trim();
            const relu = RELUS.find(v => v.motif.test(propre));
            if (relu) { servis.add(relu.pourquoi); return; }
            suspects.push(`${fichier}:${ligneDe(x.debut)}  \${${propre.slice(0, 80)}}`);
        });
    });

    r.verifie('les deux sources sont bien relues', examinees > 8, `${examinees} interpolations examinées`);
    r.egal('aucune donnée du dehors ne part dans du HTML sans être échappée',
        suspects, []);

    // Une liste de relectures qui ne sert plus est une liste qui ment : on le
    // dit plutôt que de la laisser grossir.
    const morts = RELUS.filter(v => !servis.has(v.pourquoi)).map(v => v.pourquoi);
    r.egal('et chaque exception écrite ici sert encore à quelque chose', morts, []);

    return r.bilan();
};
