const AUTO_SAVE_KEY = 'AuTableau_AutoSave';
let pages = [];
let currentPageIndex = -1;

let zoom = 1; let panX = window.innerWidth / 2; let panY = window.innerHeight / 2;
let showAxes = 0; let magnetMode = false;
let isExportingTransparent = false;
let gridWeight = 1;
let hasShownResizeHelp = false;

// ---------------------------------------------------
// LES VALEURS DE LA BARRE DU BAS
// Le zoom et l'épaisseur du quadrillage gardent leur dessin d'outil ; leur
// valeur du moment se lit dans une petite pastille posée dessous. Les
// interrupteurs (Focus, Libellés, Mode Nuit), eux, portent un témoin allumé
// ou éteint : on voit d'un coup d'œil ce qui est en marche.
// ---------------------------------------------------
function ecrirePastille(id, valeur) {
    const el = document.getElementById(id);
    if (el && el.innerText !== valeur) el.innerText = valeur;
}
function majPastilleZoom(valeur) {
    ecrirePastille('zoom-valeur', Math.round((valeur === undefined ? zoom : valeur) * 100) + '%');
}
function majPastilleGrille(valeur) {
    ecrirePastille('grille-valeur', (valeur === undefined ? gridWeight : valeur).toFixed(1).replace('.', ','));
}
function allumerInterrupteur(id, actif) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('allume', !!actif);
}
function majInterrupteursBarre() {
    allumerInterrupteur('btn-focus', document.body.classList.contains('focus-mode'));
    allumerInterrupteur('btn-nuit', isDarkMode);
    // « Libellés » a trois états : c'est choisirFormatIcones qui l'allume.
}

let isLoupeActive = false;
let isCropMode = false;
let cropRect = null;
let hasUnsavedChanges = false;

let laserStrokes = [];
const LASER_LIFETIME = 1200;   // durée de vie d'un point du faisceau (ms)
const LASER_SMOOTHING = 0.5;   // 0 = figé, 1 = brut : lissage du tracé du laser
let currentLaserStroke = null;

let backgrounds = ['blanc', 'carreau', 'seyes', 'seyes-marge', 'copie', 'millimetre', 'point', 'isometrique'];
// Ce que vaut UNE case de la grille sur les axes gradués : 1 par défaut, mais
// on trace aussi bien des dixièmes que des dizaines.
let pasAxes = 1;
try { pasAxes = parseFloat(localStorage.getItem('board_pas_axes')) || 1; } catch (e) { pasAxes = 1; }
const bgColors = { millimetre: '#fdf6e3', copie: '#e6eaed', default: '#ffffff' };
// Une « page » de référence pour les fonds qui imitent une feuille : le
// tableau est infini, on répète donc la feuille au lieu d'en poser une seule.
const PAGE_L = 1600, PAGE_H = 2264, MARGE_X = 130, ESPACE_PAGE = 90;
let currentBgIndex = 0;

let isDarkMode = false;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];

let activeStyle = {
    strokeColor: '#e74c3c', strokeOpacity: 1.0,
    isFilled: false, fillColor: '#e74c3c', fillOpacity: 0.2,
    // La croix est la convention en géométrie : elle marque l'endroit exact
    pointShape: 'cross', lineWidth: 3, lineDash: 'solid', fontSize: 24,
    lineHeight: 29, // <--- AJOUTE lineHeight ICI
    arrowStart: 0, arrowEnd: 0
};
let nextId = 1; let globalZ = 1;
let points = []; let segments = []; let circles = []; let rectangles = []; let texts = []; let htmlPostits = [];
let freehands = []; let curves = []; let polygons = []; let images = []; let arcs = [];
const imageCache = {};

let history = []; let historyIndex = -1;

const FLOAT_TOOLBAR_BTN_SIZE = 36;
const FLOAT_TOOLBAR_GAP = 2;
const FLOAT_TOOLBAR_PADDING = 12;

let mode = 'pointer'; let selectedItems = []; let hoveredObj = null;

// ==========================================
// QUADTREE POUR OPTIMISATION DU RENDU
// ==========================================
class Quadtree {
    constructor(x, y, w, h, maxDepth = 4, maxObjects = 16) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.maxDepth = maxDepth; this.maxObjects = maxObjects;
        this.depth = 0;
        this.objects = [];
        this.nodes = [];
    }

    insert(obj) {
        if (this.nodes.length > 0) {
            const idx = this.getIndex(obj);
            if (idx !== -1) {
                this.nodes[idx].insert(obj);
                return;
            }
        }

        this.objects.push(obj);

        if (this.objects.length > this.maxObjects && this.depth < this.maxDepth) {
            this.split();
        }
    }

    split() {
        const subW = this.w / 2;
        const subH = this.h / 2;
        const x = this.x;
        const y = this.y;

        this.nodes[0] = new Quadtree(x + subW, y, subW, subH, this.maxDepth, this.maxObjects);
        this.nodes[1] = new Quadtree(x, y, subW, subH, this.maxDepth, this.maxObjects);
        this.nodes[2] = new Quadtree(x, y + subH, subW, subH, this.maxDepth, this.maxObjects);
        this.nodes[3] = new Quadtree(x + subW, y + subH, subW, subH, this.maxDepth, this.maxObjects);

        this.nodes.forEach(node => node.depth = this.depth + 1);

        for (let i = this.objects.length - 1; i >= 0; i--) {
            const idx = this.getIndex(this.objects[i]);
            if (idx !== -1) {
                this.nodes[idx].insert(this.objects[i]);
                this.objects.splice(i, 1);
            }
        }
    }

    getIndex(obj) {
        const verticalMidpoint = this.x + this.w / 2;
        const horizontalMidpoint = this.y + this.h / 2;

        const objBounds = this.getObjectBounds(obj);
        const inTop = objBounds.y + objBounds.h < horizontalMidpoint;
        const inBottom = objBounds.y >= horizontalMidpoint;
        const inLeft = objBounds.x + objBounds.w < verticalMidpoint;
        const inRight = objBounds.x >= verticalMidpoint;

        if (inRight && inTop) return 0;
        if (inLeft && inTop) return 1;
        if (inLeft && inBottom) return 2;
        if (inRight && inBottom) return 3;
        return -1;
    }

    getObjectBounds(obj) {
        if (obj.type === 'point') return { x: obj.x - 3, y: obj.y - 3, w: 6, h: 6 };
        if (obj.type === 'circle') return { x: obj.x - obj.r, y: obj.y - obj.r, w: obj.r * 2, h: obj.r * 2 };
        if (obj.type === 'segment' || obj.type === 'freehand' || obj.type === 'curve' || obj.type === 'polygon') {
            const bounds = this.getBoundsForPoints(obj.points || (obj.p1_id ? [] : []));
            if (obj.type === 'segment' && obj.p1_id) {
                const p1 = points.find(p => p.id === obj.p1_id);
                const p2 = points.find(p => p.id === obj.p2_id);
                if (p1 && p2) return this.getBoundsForPoints([p1, p2]);
            }
            return bounds;
        }
        if (obj.type === 'rectangle') return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
        if (obj.type === 'image') return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
        if (obj.type === 'text') return { x: obj.x, y: obj.y, w: obj.width || 100, h: obj.fontSize || 24 };
        if (obj.type === 'arc') {
            const bounds = this.getBoundsForPoints([obj.start, obj.mid, obj.end]);
            return bounds;
        }
        return { x: obj.x || 0, y: obj.y || 0, w: 10, h: 10 };
    }

    getBoundsForPoints(pts) {
        if (!pts || pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach(p => {
            if (p && typeof p.x !== 'undefined' && typeof p.y !== 'undefined') {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            }
        });
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    retrieve(rect) {
        let result = [];
        this.retrieveHelper(rect, result);
        return result;
    }

    retrieveHelper(rect, result) {
        if (this.objects.length > 0) {
            result.push(...this.objects);
        }

        if (this.nodes.length === 0) return;

        for (let node of this.nodes) {
            if (this.isRectOverlapping(rect, { x: node.x, y: node.y, w: node.w, h: node.h })) {
                node.retrieveHelper(rect, result);
            }
        }
    }

    isRectOverlapping(r1, r2) {
        return !(r1.x + r1.w < r2.x || r1.x > r2.x + r2.w ||
                 r1.y + r1.h < r2.y || r1.y > r2.y + r2.h);
    }

    clear() {
        this.objects = [];
        this.nodes = [];
    }
}

let renderQuadtree = null;

function getGroupMembers(groupId) {
    if (!groupId) return [];
    let members = [];
    [{ arr: points, t: 'point' }, { arr: segments, t: 'segment' }, { arr: circles, t: 'circle' }, { arr: rectangles, t: 'rectangle' }, { arr: texts, t: 'text' }, { arr: freehands, t: 'freehand' }, { arr: curves, t: 'curve' }, { arr: polygons, t: 'polygon' }, { arr: images, t: 'image' }, { arr: arcs, t: 'arc' }].forEach(collection => {
        collection.arr.forEach(obj => {
            if (obj.groupId === groupId) members.push({ type: collection.t, id: obj.id, obj: obj });
        });
    });
    return members;
}
let isSelectingBox = false; let selectionBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
let isZoomBoxing = false; let zoomBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
let isDrawingPostit = false; let postitBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
let isPanningView = false; let isSpacePressed = false;
let isDraggingObjs = false; let draggedHandle = null;
let lastMouseX = 0, lastMouseY = 0; let lastRawX = 0, lastRawY = 0;

let creationStartPointId = null; let mouseLogicalPos = null; let editingTextId = null; let tempTextLogicalPos = null;
let isDrawingFreehand = false;
let currentFreehand = null;
let currentCurvePoints = []; let currentPolygonPoints = [];
let currentTracingArc = null;

let activeGuides = { x: [], y: [] };

let activePointers = new Map();
// Pose de tampon au doigt/stylet : id du pointeur qui fait glisser le fantôme,
// la pose n'est validée qu'au relâchement (pointerup).
let touchStampPointerId = null;
let initialPinchDist = null; let initialPinchCenter = null;
let initialPanX = 0; let initialPanY = 0; let initialZoom = 1;

let shapeRecognitionTimeout = null;

let inkSmoothingMode = localStorage.getItem('AuTableau_InkSmoothing') || 'auto';
let _inkBg = null;
let _inkBgValid = false;
let _inkRafPending = false;
let _inkSpeed = 0;
let _inkLastT = 0;
const INK_FAST_THRESH = 1.0;

// ==========================================
// WIDGETS GÉOMÉTRIQUES (GéoMaster)
// ==========================================
const MathUtils = {
    dist(x1, y1, x2, y2) { return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2); },
    distanceToSegment(x, y, x1, y1, x2, y2) {
        const A = x - x1; const B = y - y1; const C = x2 - x1; const D = y2 - y1;
        const dot = A * C + B * D; const len_sq = C * C + D * D;
        let param = -1; if (len_sq != 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; } else if (param > 1) { xx = x2; yy = y2; } else { xx = x1 + param * C; yy = y1 + param * D; }
        return Math.sqrt((x - xx) ** 2 + (y - yy) ** 2);
    },
    getProjectedPoint(px, py, obj) {
        if (obj.constructor.name === 'Segment') {
            const A = obj.p1, B = obj.p2;
            const l2 = (A.x - B.x) ** 2 + (A.y - B.y) ** 2;
            if (l2 === 0) return { x: A.x, y: A.y };
            let t = ((px - A.x) * (B.x - A.x) + (py - A.y) * (B.y - A.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
        }
        return { x: px, y: py };
    }
};

// ==========================================
// SYSTÈME DE PLUGINS
// ==========================================
const PluginManager = {
    plugins: {},
    faulty: {},   // plugins mis en quarantaine après une erreur
    // Enregistrer un nouveau plugin
    register: function (name, pluginObj) {
        this.plugins[name] = pluginObj;
        try {
            if (typeof pluginObj.init === 'function') pluginObj.init();
        } catch (e) {
            console.error(`Plugin « ${name} » : échec de l'initialisation`, e);
            this.faulty[name] = true;
            return;
        }
        console.log(`🔌 Plugin chargé : ${name}`);
    },
    // Déclencher un événement pour tous les plugins.
    // Chaque plugin est isolé : une erreur dans l'un ne doit pas figer le
    // rendu ni les interactions de tout le tableau (c'est déjà arrivé).
    trigger: function (eventName, ...args) {
        let handled = false;
        for (const name in this.plugins) {
            if (this.faulty[name]) continue;
            const plugin = this.plugins[name];
            if (typeof plugin[eventName] !== 'function') continue;
            try {
                if (plugin[eventName](...args)) handled = true; // Si un plugin renvoie "true", il prend la main
            } catch (e) {
                console.error(`Plugin « ${name} » : erreur dans ${eventName}`, e);
                this.faulty[name] = true;   // on l'écarte pour ne pas répéter l'erreur à chaque image
                if (typeof showToast === 'function') showToast(`⚠️ Outil « ${name} » désactivé après une erreur`);
            }
        }
        return handled;
    }
};

// Filet de sécurité global : une erreur inattendue ne doit pas laisser
// l'enseignant devant un tableau figé sans explication.
(function installErrorSafetyNet() {
    let lastReport = 0;
    // Certaines alertes ne concernent pas l'enseignant : ouvert depuis un
    // dossier (file://), le lecteur de PDF n'arrive pas à démarrer son
    // « worker » et le dit — mais il rend quand même les pages. Inutile de
    // faire peur pour ça.
    const BRUIT = /importScripts|WorkerGlobalScope|pdf\.worker|ResizeObserver loop/i;
    const report = (msg) => {
        if (BRUIT.test(String(msg || ''))) { console.warn('Au Tableau (sans conséquence) :', msg); return; }
        const now = Date.now();
        if (now - lastReport < 8000) return; // on n'inonde pas la classe de messages
        lastReport = now;
        if (typeof showToast === 'function') showToast("⚠️ Un problème est survenu. Votre travail est conservé — enregistrez-le par sécurité.");
        console.error('Au Tableau :', msg);
    };
    window.addEventListener('error', (e) => report(e.message || e.error));
    window.addEventListener('unhandledrejection', (e) => report((e.reason && e.reason.message) || e.reason));
})();

const ToolStyleArray = {
    default: {
        name: "Défaut",
        compass: {
            colors: { metalLight: '#D97D55', metalDark: '#A05030', joint: '#F4E9D7', needle: '#000000', pencil: '#6FA4AF', wood: '#F4E9D7', lead: '#000000', knob: '#F4E9D7', outline: '#5e2a18' },
            widths: { outline: 14, body: 12, arm: 10 }
        },
        setSquare: {
            background: { color: '244, 233, 215', opacity: 0.85 },
            border: { color: '140, 70, 47', opacity: 1, width: 2 },
            graduations: { color: '#000000', width: 1.5, font: "bold 12px sans-serif" },
            toggleBtn: { active: '#6FA4AF', inactive: '#D97D55' }
        },
        ruler: {
            background: { color: '184, 196, 169', opacity: 0.8 },
            border: { color: '85, 96, 70', opacity: 1, width: 2 },
            graduations: { color: '#000000', strokeOpacity: 1, width: 1.5, font: "bold 12px sans-serif" },
        },
        protractor: {
            background: { color: '111, 164, 175', opacity: 0.7 },
            border: { color: '40, 62, 68', opacity: 1, width: 2 },
            graduations: { color: '#000000', strokeOpacity: 1, width: 1, widthMajor: 2, font: "bold 11px sans-serif" },
            components: { target: '#000000', lockActive: '#D97D55', lockInactive: '#B8C4A9', swap: '#F4E9D7' }
        }
    }
};
let ToolStyle = ToolStyleArray['default'];

// La poignée d'écartement du compas : une pastille ↔ posée à côté de la
// molette, comme celle de la rotation au-dessus de la tête. Sans elle, la
// zone de prise existait mais rien ne disait où saisir pour ouvrir.
// La pastille est contre-tournée : la flèche reste horizontale quel que soit
// l'angle du compas, sinon elle ne dit plus « ouvrir ».
function dessinerPoigneeEcartement(ctx, x, y, angleOutil, active) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-(angleOutil || 0));

    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#0984e3' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = active ? '#0b76c9' : '#1e3a5f';
    ctx.stroke();

    const trait = active ? '#ffffff' : '#1e3a5f';
    ctx.strokeStyle = trait;
    ctx.fillStyle = trait;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4.5, 0);
    ctx.lineTo(4.5, 0);
    ctx.stroke();
    // Les deux pointes
    [-1, 1].forEach(sens => {
        ctx.beginPath();
        ctx.moveTo(sens * 6.5, 0);
        ctx.lineTo(sens * 3, -3);
        ctx.lineTo(sens * 3, 3);
        ctx.closePath();
        ctx.fill();
    });
    ctx.restore();
}

function drawRotationHandle(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)"; // légère bordure noire
    ctx.stroke();
    
    // Cercle fléché (rotation)
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, -Math.PI/2, Math.PI);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#333333";
    ctx.stroke();
    
    // Tête de la flèche
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.beginPath();
    ctx.moveTo(4.5, -2.5);
    ctx.lineTo(7, 1.5);
    ctx.lineTo(2, 1.5);
    ctx.fillStyle = "#333333";
    ctx.fill();
    ctx.restore();
    
    ctx.restore();
}

// ==========================================
// OUTILS DE GÉOMÉTRIE (AVEC EXPORT SVG VECTORIEL)
// ==========================================

const POIGNEE_ECART = 30;      // distance de la poignée ↔ à la molette

class CompassWidget {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 120; this.angle = 0; this.legLength = 320; this.widgetRotationOffset = 0; }
    toGlobal(lx, ly) { return { x: this.x + lx * Math.cos(this.angle) - ly * Math.sin(this.angle), y: this.y + lx * Math.sin(this.angle) + ly * Math.cos(this.angle) }; }
    toLocal(mx, my) { const dx = mx - this.x; const dy = my - this.y; return { x: dx * Math.cos(-this.angle) - dy * Math.sin(-this.angle), y: dx * Math.sin(-this.angle) + dy * Math.cos(-this.angle) }; }
    getHitZone(mx, my) {
        const local = this.toLocal(mx, my);
        const baseLeg = this.legLength || 320;
        const currentLegLength = Math.max(baseLeg, (this.radius / 2) + 20);
        const h = Math.sqrt(currentLegLength ** 2 - (this.radius / 2) ** 2);
        const headX = this.radius / 2; const headY = -h;
        if (Math.hypot(local.x - headX, local.y - (headY - 35)) < 15) return 'rotate';
        if (MathUtils.dist(local.x, local.y, this.radius, 0) < 20) return 'trace';
        if (MathUtils.distanceToSegment(local.x, local.y, headX, headY - 30, 0, 0) < 15) return 'move';
        const legStartX = this.radius; const legStartY = 0;
        // La pastille ↔ d'abord : c'est elle qu'on vise à l'œil
        if (Math.hypot(local.x - (this.radius + POIGNEE_ECART), local.y - (-35)) < 16) return 'resize';
        const resizeEndPos = { x: legStartX + (headX - legStartX) * 0.15, y: legStartY + (headY - legStartY) * 0.15 };
        if (MathUtils.distanceToSegment(local.x, local.y, legStartX, legStartY - 20, resizeEndPos.x, resizeEndPos.y) < 20) return 'resize';
        const elbowX = this.radius; const elbowY = -25;
        if (MathUtils.distanceToSegment(local.x, local.y, headX, headY, elbowX, elbowY) < 25) return 'rotate';
        return null;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        const style = ToolStyle.compass;
        const baseLeg = this.legLength || 320;
        const currentLegLength = Math.max(baseLeg, (this.radius / 2) + 20);
        const h = Math.sqrt(currentLegLength ** 2 - (this.radius / 2) ** 2);
        const headX = this.radius / 2; const headY = -h;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.beginPath(); ctx.strokeStyle = style.colors.outline; ctx.lineWidth = style.widths.outline; ctx.moveTo(headX, headY); ctx.lineTo(0, -15); ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = style.colors.metalLight; ctx.lineWidth = style.widths.body; ctx.moveTo(headX, headY); ctx.lineTo(0, -15); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = style.colors.needle; ctx.moveTo(-3, -15); ctx.lineTo(3, -15); ctx.lineTo(0, 0); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; ctx.moveTo(-1, -14); ctx.lineTo(0, -2); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = style.colors.outline; ctx.arc(0, -15, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = style.colors.metalDark; ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = style.colors.joint; ctx.arc(0, -15, 2, 0, Math.PI * 2); ctx.fill();
        const elbowX = this.radius; const elbowY = -25;
        ctx.beginPath(); ctx.strokeStyle = style.colors.outline; ctx.lineWidth = style.widths.outline; ctx.moveTo(headX, headY); ctx.lineTo(elbowX - 6, elbowY - 10); ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = style.colors.metalLight; ctx.lineWidth = style.widths.body; ctx.moveTo(headX, headY); ctx.lineTo(elbowX - 6, elbowY - 10); ctx.stroke();
        // Pastille de l'ouverture : 50 px = 1 cm, comme les graduations de la
        // règle. Posée sous le milieu de l'écartement, contre-tournée pour
        // rester lisible quel que soit l'angle du compas. Pendant qu'on
        // écarte, elle s'allume et grossit : le geste et le nombre vont
        // ensemble, c'est là qu'on la cherche.
        const enTrainDecarter = (typeof draggedWidgetMode !== 'undefined'
            && draggedWidgetMode === 'resize' && widgets && widgets.compass === this);
        if (enTrainDecarter) {
        ctx.save();
        ctx.translate(this.radius / 2, 26);
        ctx.rotate(-this.angle);
        const texte = (this.radius / 50).toFixed(1).replace('.', ',') + ' cm';
        ctx.font = (enTrainDecarter ? '700 16px' : '600 13px') + ' sans-serif';
        const larg = ctx.measureText(texte).width + (enTrainDecarter ? 22 : 16);
        const haut = enTrainDecarter ? 28 : 22;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-larg / 2, -haut / 2, larg, haut, haut / 2);
        else ctx.rect(-larg / 2, -haut / 2, larg, haut);
        ctx.fillStyle = enTrainDecarter ? '#0984e3' : 'rgba(255,255,255,0.92)';
        ctx.fill();
        if (enTrainDecarter) {
            ctx.shadowColor = 'rgba(9,132,227,0.45)';
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.strokeStyle = enTrainDecarter ? '#0b76c9' : 'rgba(45,52,54,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = enTrainDecarter ? '#ffffff' : '#2d3436';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(texte, 0, 1);
        ctx.restore();
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
        }

        ctx.save(); ctx.translate(this.radius, 0);
        const activeColor = (typeof activeStyle !== 'undefined') ? activeStyle.strokeColor : style.colors.lead;
        const activeW = (typeof activeStyle !== 'undefined') ? Math.min(3, Math.max(0.5, activeStyle.lineWidth * 0.3)) : 1.5;
        ctx.beginPath(); ctx.fillStyle = activeColor; ctx.moveTo(0, 0); ctx.lineTo(activeW, -5); ctx.lineTo(-activeW, -5); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = style.colors.wood; ctx.moveTo(-1.5, -5); ctx.lineTo(1.5, -5); ctx.lineTo(5, -18); ctx.lineTo(-5, -18); ctx.fill();
        const penH = 55; ctx.fillStyle = activeColor; ctx.strokeStyle = style.colors.outline; ctx.lineWidth = 1; ctx.fillRect(-5, -18 - penH, 10, penH); ctx.strokeRect(-5, -18 - penH, 10, penH);
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(-2, -18 - penH, 2, penH);
        ctx.translate(0, elbowY); ctx.beginPath(); ctx.fillStyle = style.colors.metalDark; ctx.strokeStyle = style.colors.outline; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.roundRect(-7, -8, 14, 16, 2); ctx.fill(); ctx.stroke(); } else { ctx.rect(-7, -8, 14, 16); ctx.fill(); ctx.stroke(); }
        ctx.restore();
        ctx.beginPath(); ctx.strokeStyle = style.colors.outline; ctx.lineWidth = style.widths.outline + 2; ctx.lineCap = "butt"; ctx.moveTo(elbowX - 10, elbowY - 10); ctx.lineTo(this.radius, elbowY - 10); ctx.stroke();
        ctx.beginPath(); ctx.strokeStyle = style.colors.metalLight; ctx.lineWidth = style.widths.arm; ctx.lineCap = "butt"; ctx.moveTo(elbowX - 10, elbowY - 10); ctx.lineTo(this.radius, elbowY - 10); ctx.stroke();
        ctx.save(); ctx.translate(elbowX, elbowY - 10); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
        ctx.beginPath(); ctx.fillStyle = style.colors.knob; ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = "#000"; ctx.stroke();
        ctx.shadowBlur = 0; ctx.beginPath(); ctx.fillStyle = style.colors.metalDark; ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = "#dfe6e9"; ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) { ctx.save(); ctx.rotate((i / 12) * Math.PI * 2); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(14, 0); ctx.stroke(); ctx.restore(); }
        ctx.restore();
        ctx.save(); ctx.translate(headX, headY); ctx.beginPath(); ctx.fillStyle = style.colors.metalLight; ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = style.colors.outline; ctx.lineWidth = 1.5; ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = style.colors.joint; ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        
        drawRotationHandle(ctx, headX, headY - 35);
        dessinerPoigneeEcartement(ctx, this.radius + POIGNEE_ECART, elbowY - 10, this.angle,
            typeof draggedWidgetMode !== 'undefined' && draggedWidgetMode === 'resize'
            && typeof widgets !== 'undefined' && widgets && widgets.compass === this);
        ctx.restore();
    }
    toSVG() {
        const style = ToolStyle.compass;
        const baseLeg = this.legLength || 320;
        const currentLegLength = Math.max(baseLeg, (this.radius / 2) + 20);
        const h = Math.sqrt(currentLegLength ** 2 - (this.radius / 2) ** 2);
        const headX = this.radius / 2; const headY = -h;
        const elbowX = this.radius; const elbowY = -25;

        let svg = `<g transform="translate(${this.x}, ${this.y}) rotate(${this.angle * 180 / Math.PI})">`;
        svg += `<line x1="${headX}" y1="${headY}" x2="0" y2="-15" stroke="${style.colors.outline}" stroke-width="${style.widths.outline}" stroke-linecap="round"/>`;
        svg += `<line x1="${headX}" y1="${headY}" x2="0" y2="-15" stroke="${style.colors.metalLight}" stroke-width="${style.widths.body}" stroke-linecap="round"/>`;
        svg += `<polygon points="-3,-15 3,-15 0,0" fill="${style.colors.needle}"/>`;
        svg += `<line x1="-1" y1="-14" x2="0" y2="-2" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`;
        svg += `<circle cx="0" cy="-15" r="7" fill="${style.colors.outline}"/>`;
        svg += `<circle cx="0" cy="-15" r="6" fill="${style.colors.metalDark}"/>`;
        svg += `<circle cx="0" cy="-15" r="2" fill="${style.colors.joint}"/>`;
        svg += `<line x1="${headX}" y1="${headY}" x2="${elbowX - 6}" y2="${elbowY - 10}" stroke="${style.colors.outline}" stroke-width="${style.widths.outline}" stroke-linecap="round"/>`;
        svg += `<line x1="${headX}" y1="${headY}" x2="${elbowX - 6}" y2="${elbowY - 10}" stroke="${style.colors.metalLight}" stroke-width="${style.widths.body}" stroke-linecap="round"/>`;

        const penH = 55;
        svg += `<g transform="translate(${this.radius}, 0)">`;
        svg += `<polygon points="0,0 1.5,-5 -1.5,-5" fill="${style.colors.lead}"/>`;
        svg += `<polygon points="-1.5,-5 1.5,-5 5,-18 -5,-18" fill="${style.colors.wood}"/>`;
        svg += `<rect x="-5" y="${-18 - penH}" width="10" height="${penH}" fill="${style.colors.pencil}" stroke="${style.colors.outline}" stroke-width="1"/>`;
        svg += `<rect x="-2" y="${-18 - penH}" width="2" height="${penH}" fill="rgba(255,255,255,0.2)"/>`;
        svg += `<rect x="-7" y="${elbowY - 8}" width="14" height="16" rx="2" fill="${style.colors.metalDark}" stroke="${style.colors.outline}" stroke-width="1"/>`;
        svg += `</g>`;

        svg += `<line x1="${elbowX - 10}" y1="${elbowY - 10}" x2="${this.radius}" y2="${elbowY - 10}" stroke="${style.colors.outline}" stroke-width="${style.widths.outline + 2}"/>`;
        svg += `<line x1="${elbowX - 10}" y1="${elbowY - 10}" x2="${this.radius}" y2="${elbowY - 10}" stroke="${style.colors.metalLight}" stroke-width="${style.widths.arm}"/>`;
        svg += `<g transform="translate(${elbowX}, ${elbowY - 10})">`;
        svg += `<circle cx="0" cy="0" r="14" fill="${style.colors.knob}" stroke="#000" stroke-width="1"/>`;
        svg += `<circle cx="0" cy="0" r="8" fill="${style.colors.metalDark}"/>`;
        svg += `<circle cx="0" cy="0" r="3" fill="#dfe6e9"/>`;
        svg += `</g>`;

        svg += `<g transform="translate(${headX}, ${headY})">`;
        svg += `<circle cx="0" cy="0" r="13" fill="${style.colors.metalLight}" stroke="${style.colors.outline}" stroke-width="1.5"/>`;
        svg += `<circle cx="0" cy="0" r="5" fill="${style.colors.joint}"/>`;
        svg += `</g></g>`;

        return svg;
    }
}

class SetSquareWidget {
    constructor(x, y) { this.x = x; this.y = y; this.angle = 0; this.width = 400; this.height = 250; this.widgetRotationOffset = 0; this.slideMode = false; }
    toGlobal(lx, ly) { return { x: this.x + lx * Math.cos(this.angle) - ly * Math.sin(this.angle), y: this.y + lx * Math.sin(this.angle) + ly * Math.cos(this.angle) }; }
    toLocal(mx, my) { const dx = mx - this.x; const dy = my - this.y; return { x: dx * Math.cos(-this.angle) - dy * Math.sin(-this.angle), y: dx * Math.sin(-this.angle) + dy * Math.cos(-this.angle) }; }
    getHitZone(mx, my) {
        const l = this.toLocal(mx, my);
        if (Math.hypot(l.x - (this.width + 15), l.y - 0) < 15) return 'rotate';
        if (Math.hypot(l.x - 0, l.y - (this.height + 15)) < 15) return 'rotate';
        if (Math.sqrt((l.x - this.width) ** 2 + (l.y) ** 2) < 30) return 'resizeWidth';
        if (Math.sqrt((l.x) ** 2 + (l.y - this.height) ** 2) < 30) return 'resizeHeight';
        if (l.x > 35 && l.x < 65 && l.y > 35 && l.y < 65) return 'toggleSlide';
        if (l.x >= 0 && l.y >= 0 && l.y <= -this.height / this.width * l.x + this.height) {
            if (l.y < 30 && this.slideMode) return 'slideX';
            if (l.x < 30 && this.slideMode) return 'slideY';
            return 'move';
        } return null;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle); const style = ToolStyle.setSquare;
        const getContrastColor = (hex) => { if (!hex) return 'white'; hex = hex.replace('#', ''); const r = parseInt(hex.substr(0, 2), 16); const g = parseInt(hex.substr(2, 2), 16); const b = parseInt(hex.substr(4, 2), 16); const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#333333' : 'white'; };
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.width, 0); ctx.lineTo(0, this.height); ctx.closePath();
        ctx.fillStyle = `rgba(${style.background.color}, ${style.background.opacity})`; ctx.fill();
        ctx.lineWidth = style.border.width; ctx.strokeStyle = `rgba(${style.border.color}, ${style.border.opacity})`; ctx.stroke();
        const mm = 5; const cm = 50; const padding = 10;
        ctx.fillStyle = style.graduations.color; ctx.strokeStyle = style.graduations.color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = style.graduations.font; ctx.lineWidth = style.graduations.width;
        for (let i = 0; i <= this.width - padding; i += mm) {
            const hAvailable = this.height * ((this.width - i) / this.width); if (hAvailable < 35) break;
            let len = 6; if (i % cm === 0) len = 14; else if (i % (cm / 2) === 0) len = 9;
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, len); ctx.stroke();
            if (i > 0 && i % cm === 0) ctx.fillText(i / cm, i, 22);
        }
        for (let i = 0; i <= this.height - padding; i += mm) {
            const wAvailable = this.width * ((this.height - i) / this.height); if (wAvailable < 35) break;
            let len = 6; if (i % cm === 0) len = 14; else if (i % (cm / 2) === 0) len = 9;
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(len, i); ctx.stroke();
            if (i > 0 && i % cm === 0) { ctx.save(); ctx.translate(32, i); ctx.rotate(-Math.PI / 2); ctx.fillText(i / cm, 0, 0); ctx.restore(); }
        }

        drawRotationHandle(ctx, this.width + 15, 0);
        drawRotationHandle(ctx, 0, this.height + 15);

        if (!this.isStamp) {
            const btnColor = this.slideMode ? style.toggleBtn.active : style.toggleBtn.inactive;
            ctx.save(); ctx.translate(50, 50); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-13, -13, 26, 26, 6); else ctx.rect(-13, -13, 26, 26);
            ctx.fillStyle = btnColor; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "white"; ctx.stroke();
            const iconColor = getContrastColor(btnColor); ctx.strokeStyle = iconColor; ctx.fillStyle = iconColor; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
            if (this.slideMode) { ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(-4, -2); ctx.lineTo(-6, 0); ctx.lineTo(-4, 2); ctx.moveTo(4, -2); ctx.lineTo(6, 0); ctx.lineTo(4, 2); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.moveTo(-2, -4); ctx.lineTo(0, -6); ctx.lineTo(2, -4); ctx.moveTo(-2, 4); ctx.lineTo(0, 6); ctx.lineTo(2, 4); ctx.stroke(); }
            else { ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 3 * Math.PI / 2, false); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2, -7.5); ctx.lineTo(1, -5.5); ctx.lineTo(-2, -3.5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
        }
        ctx.restore();
    }
    toSVG() {
        const style = ToolStyle.setSquare;
        let svg = `<g transform="translate(${this.x}, ${this.y}) rotate(${this.angle * 180 / Math.PI})">`;
        svg += `<polygon points="0,0 ${this.width},0 0,${this.height}" fill="rgba(${style.background.color}, ${style.background.opacity})" stroke="rgba(${style.border.color}, ${style.border.opacity})" stroke-width="${style.border.width}"/>`;

        const mm = 5; const cm = 50; const padding = 10;
        for (let i = 0; i <= this.width - padding; i += mm) {
            const hAvailable = this.height * ((this.width - i) / this.width); if (hAvailable < 35) break;
            let len = (i % cm === 0) ? 14 : (i % (cm / 2) === 0 ? 9 : 6);
            svg += `<line x1="${i}" y1="0" x2="${i}" y2="${len}" stroke="${style.graduations.color}" stroke-width="${style.graduations.width}"/>`;
            if (i > 0 && i % cm === 0) svg += `<text x="${i}" y="22" fill="${style.graduations.color}" font-family="sans-serif" font-weight="bold" font-size="12px" text-anchor="middle" dominant-baseline="middle">${i / cm}</text>`;
        }
        for (let i = 0; i <= this.height - padding; i += mm) {
            const wAvailable = this.width * ((this.height - i) / this.height); if (wAvailable < 35) break;
            let len = (i % cm === 0) ? 14 : (i % (cm / 2) === 0 ? 9 : 6);
            svg += `<line x1="0" y1="${i}" x2="${len}" y2="${i}" stroke="${style.graduations.color}" stroke-width="${style.graduations.width}"/>`;
            if (i > 0 && i % cm === 0) svg += `<text x="22" y="${i}" fill="${style.graduations.color}" font-family="sans-serif" font-weight="bold" font-size="12px" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90, 22, ${i})">${i / cm}</text>`;
        }
        return svg + `</g>`;
    }
}

class ProtractorWidget {
    constructor(x, y) { this.x = x; this.y = y; this.angle = 0; this.radius = 180; this.isLocked = false; this.isReversed = false; this.showDouble = false; }
    toGlobal(lx, ly) { return { x: this.x + lx * Math.cos(this.angle) - ly * Math.sin(this.angle), y: this.y + lx * Math.sin(this.angle) + ly * Math.cos(this.angle) }; }
    toLocal(mx, my) { const dx = mx - this.x; const dy = my - this.y; return { x: dx * Math.cos(-this.angle) - dy * Math.sin(-this.angle), y: dx * Math.sin(-this.angle) + dy * Math.cos(-this.angle) }; }
    getHitZone(mx, my) {
        const l = this.toLocal(mx, my);
        if (Math.hypot(l.x - (this.radius + 20), l.y) < 15) return 'rotate';
        if (Math.hypot(l.x - (-this.radius - 20), l.y) < 15) return 'rotate';
        
        const d = Math.sqrt(l.x ** 2 + l.y ** 2);
        if (l.x > -12 && l.x < 12 && l.y < -35 && l.y > -110 && !this.isStamp) {
            if (l.y > -83) return 'toggleSwap';
            if (l.y > -55) return 'toggleLock';
            return 'toggleDouble';
        }
        if (d < 20) return 'move'; 
        if (d > this.radius - 30 && d < this.radius + 10 && l.y < 0) return 'traceAngle';
        if (l.y >= 0 && l.y <= 15 && l.x >= -this.radius && l.x <= this.radius) return 'move';
        if (d <= this.radius && l.y < 0) return 'move';
        return null;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        const style = ToolStyle.protractor; const r = this.radius; const skirt = 15;
        const getContrastColor = (hex) => { if (!hex) return 'white'; hex = hex.replace('#', ''); const r = parseInt(hex.substr(0, 2), 16); const g = parseInt(hex.substr(2, 2), 16); const b = parseInt(hex.substr(4, 2), 16); const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000; return (yiq >= 128) ? '#333333' : 'white'; };
        ctx.beginPath(); ctx.moveTo(-r, skirt); ctx.lineTo(r, skirt); ctx.lineTo(r, 0); ctx.arc(0, 0, r, 0, Math.PI, true); ctx.closePath();
        ctx.fillStyle = `rgba(${style.background.color}, 0.4)`; ctx.fill();
        if (style.border.width > 0) { ctx.lineWidth = style.border.width; ctx.strokeStyle = `rgba(${style.border.color}, ${style.border.opacity})`; ctx.stroke(); }
        const gap = 50; ctx.beginPath(); ctx.moveTo(-(r - gap), 0); ctx.lineTo((r - gap), 0); ctx.moveTo(0, -6); ctx.lineTo(0, 8); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineWidth = 1.5; ctx.strokeStyle = '#000000'; ctx.stroke();
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = style.graduations.font;
        for (let i = 0; i <= 180; i++) {
            const ang = Math.PI + (i * Math.PI / 180); const cos = Math.cos(ang); const sin = Math.sin(ang);
            let len = 6; ctx.lineWidth = style.graduations.width; ctx.strokeStyle = `rgba(0, 0, 0, ${style.graduations.strokeOpacity})`;
            if (i % 5 === 0) len = 10; if (i % 10 === 0) { len = 15; ctx.lineWidth = style.graduations.widthMajor; }
            ctx.beginPath(); ctx.moveTo(cos * (r - len), sin * (r - len)); ctx.lineTo(cos * r, sin * r); ctx.stroke();
            if (i % 10 === 0) {
                const valStandard = i; const valReverse = 180 - i;
                if (this.showDouble) {
                    ctx.fillStyle = style.graduations.color; ctx.font = style.graduations.font || "bold 12px sans-serif";
                    ctx.fillText(valStandard, cos * (r - 24), sin * (r - 24));
                    ctx.font = "normal 9px sans-serif"; ctx.fillStyle = "#222222";
                    ctx.fillText(valReverse, cos * (r - 40), sin * (r - 40));
                } else {
                    const val = this.isReversed ? valReverse : valStandard;
                    ctx.font = style.graduations.font || "bold 12px sans-serif"; ctx.fillStyle = style.graduations.color;
                    let ty = sin * (r - 25); if (i === 0 || i === 180) ty = 0;
                    ctx.fillText(val, cos * (r - 25), ty);
                }
            }
        }

        if (!this.isStamp) {
            const drawIconBtn = (y, btnColor, type) => {
                ctx.save(); ctx.translate(0, y); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-12, -12, 24, 24, 6); else ctx.rect(-12, -12, 24, 24);
                ctx.fillStyle = btnColor; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "white"; ctx.stroke();
                const iconColor = getContrastColor(btnColor); ctx.strokeStyle = iconColor; ctx.fillStyle = iconColor; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2;
                if (type === 'swap') { ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(-2.5, -2.5); ctx.lineTo(-5, 0); ctx.lineTo(-2.5, 2.5); ctx.moveTo(2.5, -2.5); ctx.lineTo(5, 0); ctx.lineTo(2.5, 2.5); ctx.stroke(); }
                else if (type === 'lock' || type === 'unlock') { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-5, 0, 10, 8, 2); else ctx.rect(-5, 0, 10, 8); ctx.fill(); ctx.beginPath(); const arcR = 3.5; if (type === 'lock') ctx.arc(0, -1, arcR, Math.PI, 0); else ctx.arc(2, -1, arcR, Math.PI, 0); ctx.stroke(); ctx.fillStyle = btnColor; ctx.beginPath(); ctx.arc(0, 4, 1.5, 0, Math.PI * 2); ctx.fill(); }
                else if (type === 'double') { ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("x2", 0, 1); }
                ctx.restore();
            };
            drawIconBtn(-73, style.components.swap, 'swap');
            const lockColor = this.isLocked ? style.components.lockActive : style.components.lockInactive; drawIconBtn(-45, lockColor, this.isLocked ? 'lock' : 'unlock');
            drawIconBtn(-101, this.showDouble ? "#3498db" : "#bdc3c7", 'double');
        }
        
        drawRotationHandle(ctx, -this.radius - 20, 0);
        drawRotationHandle(ctx, this.radius + 20, 0);
        
        ctx.restore();
    }
    toSVG() {
        const style = ToolStyle.protractor; const r = this.radius; const skirt = 15;
        let svg = `<g transform="translate(${this.x}, ${this.y}) rotate(${this.angle * 180 / Math.PI})">`;
        svg += `<path d="M ${-r} ${skirt} L ${r} ${skirt} L ${r} 0 A ${r} ${r} 0 0 0 ${-r} 0 Z" fill="rgba(${style.background.color}, 0.4)" stroke="rgba(${style.border.color}, ${style.border.opacity})" stroke-width="${style.border.width}"/>`;

        const gap = 50;
        svg += `<line x1="${-(r - gap)}" y1="0" x2="${r - gap}" y2="0" stroke="#000" stroke-width="1.5"/><line x1="0" y1="-6" x2="0" y2="8" stroke="#000" stroke-width="1.5"/><line x1="-6" y1="0" x2="6" y2="0" stroke="#000" stroke-width="1.5"/>`;

        for (let i = 0; i <= 180; i++) {
            const ang = Math.PI + (i * Math.PI / 180); const cos = Math.cos(ang); const sin = Math.sin(ang);
            let len = 6; let strokeW = style.graduations.width;
            if (i % 5 === 0) len = 10; if (i % 10 === 0) { len = 15; strokeW = style.graduations.widthMajor; }
            svg += `<line x1="${cos * (r - len)}" y1="${sin * (r - len)}" x2="${cos * r}" y2="${sin * r}" stroke="rgba(0,0,0,${style.graduations.strokeOpacity})" stroke-width="${strokeW}"/>`;

            if (i % 10 === 0) {
                const valStandard = i; const valReverse = 180 - i;
                if (this.showDouble) {
                    svg += `<text x="${cos * (r - 24)}" y="${sin * (r - 24)}" fill="${style.graduations.color}" font-family="sans-serif" font-weight="bold" font-size="12px" text-anchor="middle" dominant-baseline="middle">${valStandard}</text>`;
                    svg += `<text x="${cos * (r - 40)}" y="${sin * (r - 40)}" fill="#222" font-family="sans-serif" font-size="9px" text-anchor="middle" dominant-baseline="middle">${valReverse}</text>`;
                } else {
                    let ty = sin * (r - 25); if (i === 0 || i === 180) ty = 0;
                    svg += `<text x="${cos * (r - 25)}" y="${ty}" fill="${style.graduations.color}" font-family="sans-serif" font-weight="bold" font-size="12px" text-anchor="middle" dominant-baseline="middle">${this.isReversed ? valReverse : valStandard}</text>`;
                }
            }
        }
        return svg + `</g>`;
    }
}

class RulerWidget {
    constructor(x, y) { this.x = x; this.y = y; this.angle = 0; this.width = 400; this.height = 60; }
    toGlobal(lx, ly) { return { x: this.x + lx * Math.cos(this.angle) - ly * Math.sin(this.angle), y: this.y + lx * Math.sin(this.angle) + ly * Math.cos(this.angle) }; }
    toLocal(mx, my) { const dx = mx - this.x; const dy = my - this.y; return { x: dx * Math.cos(-this.angle) - dy * Math.sin(-this.angle), y: dx * Math.sin(-this.angle) + dy * Math.cos(-this.angle) }; }
    getHitZone(mx, my) {
        const l = this.toLocal(mx, my);
        if (Math.hypot(l.x - (this.width + 25), l.y - this.height / 2) < 15) return 'rotate';
        
        if (l.x >= 0 && l.x <= this.width && l.y >= 0 && l.y <= this.height) {
            if (l.x > this.width - 25) return 'resize';
            return 'move';
        } return null;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        const style = ToolStyle.ruler;
        ctx.fillStyle = `rgba(${style.background.color}, ${style.background.opacity})`; ctx.beginPath(); ctx.rect(0, 0, this.width, this.height); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(0, 0, this.width, this.height / 2);
        if (style.border.width > 0) { ctx.lineWidth = style.border.width; ctx.strokeStyle = `rgba(${style.border.color}, ${style.border.opacity})`; ctx.strokeRect(0, 0, this.width, this.height); }
        const mm = 5; const cm = 50;
        ctx.strokeStyle = `rgba(0, 0, 0, ${style.graduations.strokeOpacity})`; ctx.fillStyle = style.graduations.color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = style.graduations.font; ctx.lineWidth = style.graduations.width;
        for (let i = 0; i <= this.width - 5; i += mm) {
            let len = 6; if (i % cm === 0) len = 18; else if (i % (cm / 2) === 0) len = 12;
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, len); ctx.stroke();
            if (i > 0 && i % cm === 0) ctx.fillText(i / cm, i, 28);
        }
        
        drawRotationHandle(ctx, this.width + 25, this.height / 2);
        ctx.restore();
    }
    toSVG() {
        const style = ToolStyle.ruler;
        let svg = `<g transform="translate(${this.x}, ${this.y}) rotate(${this.angle * 180 / Math.PI})">`;
        svg += `<rect x="0" y="0" width="${this.width}" height="${this.height}" fill="rgba(${style.background.color}, ${style.background.opacity})" stroke="rgba(${style.border.color}, ${style.border.opacity})" stroke-width="${style.border.width}"/>`;
        svg += `<rect x="0" y="0" width="${this.width}" height="${this.height / 2}" fill="rgba(255,255,255,0.2)"/>`;

        const mm = 5; const cm = 50;
        for (let i = 0; i <= this.width - 5; i += mm) {
            let len = (i % cm === 0) ? 18 : (i % (cm / 2) === 0 ? 12 : 6);
            svg += `<line x1="${i}" y1="0" x2="${i}" y2="${len}" stroke="rgba(0, 0, 0, ${style.graduations.strokeOpacity})" stroke-width="${style.graduations.width}"/>`;
            if (i > 0 && i % cm === 0) svg += `<text x="${i}" y="28" fill="${style.graduations.color}" font-family="sans-serif" font-weight="bold" font-size="12px" text-anchor="middle" dominant-baseline="middle">${i / cm}</text>`;
        }
        return svg + `</g>`;
    }
}


// État des instruments
let activeWidgets = { compass: false, protractor: false, setsquare: false, ruler: false };
let widgets = { compass: null, protractor: null, setsquare: null, ruler: null };
let widgetZOrder = ['ruler', 'setsquare', 'protractor', 'compass'];
let draggedWidget = null;
let draggedWidgetMode = null;
let ecartPriseCompas = 0;      // écart entre le doigt et la mine, à la prise
let widgetOffset = { x: 0, y: 0 };
let widgetRotationOffset = 0;
let dragStartWidget = { x: 0, y: 0 };
let dragStartMouse = { x: 0, y: 0 };

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d', { alpha: true });
const wysiwygText = document.getElementById('wysiwyg-text');
canvas.addEventListener('contextmenu', e => e.preventDefault());



// --- GESTION DES PAGES ---
function createNewPage() {
    return {
        points: [], segments: [], circles: [], rectangles: [], texts: [], freehands: [], curves: [], polygons: [], images: [], arcs: [],
        htmlPostits: [],
        history: [], historyIndex: -1, panX: window.innerWidth / 2, panY: window.innerHeight / 2, zoom: 1
    };
}

function syncPage() {
    if (currentPageIndex === -1 || !pages[currentPageIndex]) return;
    pages[currentPageIndex] = { ...pages[currentPageIndex], points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs, htmlPostits, history, historyIndex, panX, panY, zoom, origineFeuille, origineAxes };
}

function initPages() {
    currentPageIndex = -1;
    pages = [createNewPage()];
    loadPage(0);
}

function loadPage(index) {
    syncPage();
    currentPageIndex = index;
    const p = pages[index];

    points = p.points || []; segments = p.segments || []; circles = p.circles || []; rectangles = p.rectangles || []; texts = p.texts || [];
    freehands = p.freehands || []; curves = p.curves || []; polygons = p.polygons || []; images = p.images || []; arcs = p.arcs || []; htmlPostits = p.htmlPostits || [];
    history = p.history || []; historyIndex = p.historyIndex !== undefined ? p.historyIndex : -1;
    panX = p.panX || window.innerWidth / 2; panY = p.panY || window.innerHeight / 2; zoom = p.zoom || 1;
    // Chaque page pose sa feuille où elle veut : elle la retrouve en revenant.
    origineFeuille = p.origineFeuille || { x: 0, y: 0 };
    origineAxes = p.origineAxes || { x: 0, y: 0 };

    // Un tableau enregistré avant que la feuille sache où elle est posée ne
    // porte pas cette position. Sa feuille se dessinait alors à l'origine du
    // tableau, souvent à mille pixels du travail : on rouvrait son cours et
    // l'écran paraissait vide, comme si le fond avait été perdu. On la
    // replace autour de ce qui est écrit, sans bouger la vue.
    if (!p.origineFeuille && typeof replacerLaFeuilleSiBesoin === 'function') {
        replacerLaFeuilleSiBesoin();
        p.origineFeuille = { ...origineFeuille };
    }

    document.getElementById('zoom-slider').value = zoom;
    majPastilleZoom();

    if (history.length === 0) saveState();

    updatePageUI(); clearSelection(); draw();
    if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
}

function updatePageUI() {
    document.getElementById('page-indicator').innerText = (currentPageIndex + 1) + '/' + pages.length;
    document.getElementById('btn-prev-page').style.opacity = currentPageIndex === 0 ? 0.3 : 1;
    document.getElementById('btn-prev-page').style.pointerEvents = currentPageIndex === 0 ? 'none' : 'auto';
    document.getElementById('btn-next-page').style.opacity = currentPageIndex === pages.length - 1 ? 0.3 : 1;
    document.getElementById('btn-next-page').style.pointerEvents = currentPageIndex === pages.length - 1 ? 'none' : 'auto';
}

document.getElementById('btn-prev-page').addEventListener('click', () => { if (currentPageIndex > 0) loadPage(currentPageIndex - 1); });
document.getElementById('btn-next-page').addEventListener('click', () => { if (currentPageIndex < pages.length - 1) loadPage(currentPageIndex + 1); });
document.getElementById('btn-add-page').addEventListener('click', () => { pages.push(createNewPage()); loadPage(pages.length - 1); });

// --- MODALES ET INITIALISATION ---
function openDonationModal() { document.getElementById('donationModal').style.display = 'flex'; }
function closeDonationModal() { document.getElementById('donationModal').style.display = 'none'; }

let confirmCallback = null;
let cancelCallback = null;
function openConfirmModal(title, text, isDanger, callback, onCancel = null) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-text').innerText = text;
    const yesBtn = document.getElementById('confirm-yes-btn');
    if (isDanger) { yesBtn.className = 'btn-action danger'; }
    else { yesBtn.className = 'btn-action primary'; }
    confirmCallback = callback;
    cancelCallback = onCancel;
    document.getElementById('confirm-modal').style.display = 'flex';
}
function closeConfirmModal() { 
    document.getElementById('confirm-modal').style.display = 'none'; 
    confirmCallback = null; 
    cancelCallback = null;
}
function triggerConfirmCancel() {
    if (cancelCallback) cancelCallback();
    closeConfirmModal();
}
function clearBoardAndPages() {
    images = []; polygons = []; curves = []; circles = []; arcs = [];
    rectangles = []; segments = []; freehands = []; points = []; texts = [];
    pages = [];
    currentPageIndex = 0;
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
    const pageIndicator = document.getElementById('page-indicator');
    if (pageIndicator) pageIndicator.innerText = '1/1';
    if (typeof closeAllPopups === 'function') closeAllPopups();
    clearSelection();
    draw();
    showToast("✨ Nouveau document créé !");
}

function handleWorkspaceArrange() {
    arrangeToolbars();

    const barStyle = document.getElementById('bar-style');
    if (barStyle) {
        barStyle.removeAttribute('data-dragged');
        localStorage.removeItem('bar_style_x');
        localStorage.removeItem('bar_style_y');
        barStyle.style.left = '50%';
        barStyle.style.top = '20px';
        barStyle.style.right = 'auto';
        barStyle.style.bottom = 'auto';
        barStyle.style.transform = 'translateX(-50%)';
    }

    const barTools = document.getElementById('bar-tools');
    if (barTools) {
        barTools.removeAttribute('data-dragged');
        localStorage.removeItem('bar_tools_x');
        localStorage.removeItem('bar_tools_y');
        barTools.style.left = '12px';
        barTools.style.top = '50%';
        barTools.style.right = 'auto';
        barTools.style.bottom = 'auto';
        barTools.style.transform = 'translateY(-50%)';
    }

    if (typeof htmlPostits !== 'undefined' && htmlPostits.length > 0) {
        let startX = -panX / zoom + 50 / zoom;
        let startY = -panY / zoom + 100 / zoom;
        htmlPostits.forEach((p, i) => {
            p.x = startX + i * (40 / zoom);
            p.y = startY + i * (40 / zoom);
        });
        saveState();
        if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
    }
}

function handleWorkspaceReset() {
    openConfirmModal("Réinitialiser l'espace", "Toutes vos palettes et l'organisation actuelle seront réinitialisées.", true, () => {
        localStorage.removeItem('auTableauV7');
        localStorage.removeItem('board_floating_toolbars');
        localStorage.removeItem('board_toolbars_migrated_v2');
        localStorage.removeItem('board_favorites');
        localStorage.removeItem('drawer_favorites_view');
        localStorage.removeItem('drawer_active_category');
        localforage.removeItem(AUTO_SAVE_KEY).finally(() => window.location.reload());
    });
}

function handleWorkspaceDarkMode() {
    toggleDarkMode();
}

function handleWorkspaceFocus() {
    toggleFocusMode();
}

function arrangeToolbars() {
    const bars = Array.from(document.querySelectorAll('.custom-toolbar:not([style*="display: none"])'));
    const rightDrawer = document.getElementById('right-drawer');
    const margin = 12;
    const rightMarginBase = rightDrawer?.classList.contains('open') ? 360 + margin : margin;
    const startX = window.innerWidth - rightMarginBase;
    const startY = margin;

    const placed = [];
    const gap = 12;
    const toolbars = getStoredFloatingToolbars();

    bars.forEach((bar) => {
        const w = bar.offsetWidth;
        const h = bar.offsetHeight;

        let bestX = startX - w;
        let bestY = startY;

        if (bar.id === 'system-toolbar-main') {
            bestX = 12;
            bestY = window.innerHeight / 2 - h / 2;
            
            bar.style.transform = 'none';
            bar.style.left = bestX + 'px';
            bar.style.top = bestY + 'px';
            bar.style.right = 'auto';
            bar.style.bottom = 'auto';
            
            let tConfig = toolbars.find(t => t.id === bar.id);
            if (tConfig) {
                tConfig.x = bestX;
                tConfig.y = bestY;
            }
            placed.push({ x: bestX, y: bestY, w: w, h: h });
            return;
        }

        let minDist = Infinity;

        const startXLeft = margin;
        const candidates = [
            { x: startX - w, y: startY },
            { x: startXLeft, y: startY }
        ];

        placed.forEach(p => {
            candidates.push({ x: p.x - w - gap, y: p.y });
            candidates.push({ x: p.x + p.w + gap, y: p.y });
            candidates.push({ x: p.x, y: p.y + p.h + gap });
            candidates.push({ x: p.x + p.w - w, y: p.y + p.h + gap });
            candidates.push({ x: p.x - w - gap, y: startY });
            candidates.push({ x: p.x + p.w + gap, y: startY });
        });

        candidates.forEach(c => {
            if (c.y < startY || c.x + w > startX || c.x < startXLeft || c.y + h > window.innerHeight - gap) return;

            let overlap = false;
            for (let p of placed) {
                if (c.x < p.x + p.w + gap && c.x + w > p.x - gap && c.y < p.y + p.h + gap && c.y + h > p.y - gap) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                const distRight = startX - (c.x + w);
                const distLeft = c.x - startXLeft;
                const edgeDist = Math.min(distRight, distLeft);
                const dist = edgeDist + (c.y - startY) * 10;
                if (dist < minDist) {
                    minDist = dist;
                    bestX = c.x;
                    bestY = c.y;
                }
            }
        });

        if (minDist === Infinity) {
            bestX = 20;
            bestY = 80;
        }

        placed.push({ x: bestX, y: bestY, w: w, h: h });

        bar.classList.add('animating');
        bar.style.left = `${bestX}px`;
        bar.style.top = `${bestY}px`;

        const tb = toolbars.find(t => t.id === bar.id);
        if (tb) {
            tb.x = bestX;
            tb.y = bestY;
        }

        setTimeout(() => bar.classList.remove('animating'), 400);
    });

    saveStoredFloatingToolbars(toolbars);
    setTimeout(() => { if (typeof saveAppLocal === 'function') saveAppLocal(); }, 500);
}

function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    majInterrupteursBarre();
}

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('mousedown', function (e) {
            if (e.target === this) {
                if (this.id === 'donationModal') closeDonationModal();
                else if (this.id === 'confirm-modal') closeConfirmModal();
                else if (this.id === 'help-modal') this.style.display = 'none';
            }
        });
    });
    document.getElementById('btn-help').addEventListener('click', () => {
        remplirAideRaccourcis();
        document.getElementById('help-modal').style.display = 'flex';
        const hasSeenWelcome = localStorage.getItem('auTableau_welcome_v2');
        if (!hasSeenWelcome) {
            localStorage.setItem('auTableau_welcome_v2', 'true');
        }
    });
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => { showToast("Plein écran non supporté."); });
        } else {
            document.exitFullscreen();
        }
    });

    // Initialisation Mode Sombre
    const darkModeBtn = document.getElementById('btn-dark-mode');
    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', toggleDarkMode);
    }

    // Boutons des instruments de géométrie
    document.querySelectorAll('.btn[data-widget]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const widgetName = btn.dataset.widget;
            activeWidgets[widgetName] = !activeWidgets[widgetName];
            btn.classList.toggle('widget-active', activeWidgets[widgetName]);

            if (activeWidgets[widgetName] && !widgets[widgetName]) {
                const screenCenterX = window.innerWidth / 2;
                const screenCenterY = window.innerHeight / 2;
                const worldX = (screenCenterX - panX) / zoom;
                const worldY = (screenCenterY - panY) / zoom;

                if (widgetName === 'ruler') widgets[widgetName] = new RulerWidget(worldX - 150, worldY);
                if (widgetName === 'setsquare') widgets[widgetName] = new SetSquareWidget(worldX - 100, worldY - 50);
                if (widgetName === 'protractor') widgets[widgetName] = new ProtractorWidget(worldX, worldY);
                if (widgetName === 'compass') {
                    widgets[widgetName] = new CompassWidget(worldX, worldY);
                    widgets[widgetName].radius = 150;
                    widgets[widgetName].legLength = 250;
                }
            }
            if (typeof syncToolbarActiveStates === 'function') syncToolbarActiveStates();
            setMode(mode); // Rafraîchit l'affichage de la barre de style si le compas est activé
            draw();
            e.stopPropagation();
        });
    });

    // Initialisation Enregistrement Vidéo

});

window.addEventListener('load', () => {
    // On essaie de charger la sauvegarde locale de manière asynchrone
    localforage.getItem(AUTO_SAVE_KEY).then((saved) => {
        if (saved) {
            try {
                let hasContent = false;
                if (saved.pages) {
                    hasContent = saved.pages.some(p => (p.points && p.points.length > 0) || (p.images && p.images.length > 0) || (p.freehands && p.freehands.length > 0));
                } else {
                    hasContent = (saved.points && saved.points.length > 0) || (saved.images && saved.images.length > 0) || (saved.freehands && saved.freehands.length > 0);
                }
                if (hasContent) {
                    document.getElementById('restore-modal').style.display = 'flex';
                } else { initPages(); }
            } catch (e) { initPages(); }
        } else {
            // Système de migration intelligent : S'il y a un vieux localStorage, on le transfert dans IndexedDB
            const oldSave = localStorage.getItem(AUTO_SAVE_KEY);
            if (oldSave) {
                localforage.setItem(AUTO_SAVE_KEY, JSON.parse(oldSave));
                localStorage.removeItem(AUTO_SAVE_KEY); // On nettoie
                document.getElementById('restore-modal').style.display = 'flex';
            } else {
                initPages();
            }
        }
    }).catch(err => {
        console.error("Erreur de chargement IndexedDB:", err);
        initPages();
    });
});

function confirmRestore() {
    localforage.getItem(AUTO_SAVE_KEY).then((saved) => {
        if (saved) { restoreState(saved); showToast("Session restaurée !"); }
        document.getElementById('restore-modal').style.display = 'none';
    });
}

// « Nouveau tableau » : la session précédente n'est pas jetée, elle rejoint
// « Mes tableaux ». Un clic trop rapide ne doit pas faire perdre un cours.
function cancelRestore() {
    const fermer = () => {
        document.getElementById('restore-modal').style.display = 'none';
        initPages();
    };

    localforage.getItem(AUTO_SAVE_KEY).then((saved) => {
        if (!saved) return null;
        const maintenant = new Date();
        const id = 'tb_' + Date.now();
        const fiche = {
            id,
            name: 'Session du ' + maintenant.toLocaleDateString()
                + ' à ' + maintenant.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: maintenant.toLocaleDateString(),
            time: maintenant.toLocaleTimeString(),
            timestamp: Date.now()
        };
        // La liste est relue dans la foulée : elle n'est pas forcément chargée
        // en mémoire au moment où la modale s'affiche.
        return localforage.getItem('auTableau_tableaux_list').then((liste) => {
            const l = Array.isArray(liste) ? liste : [];
            l.push(fiche);
            l.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            savedTableaux = l;
            return Promise.all([
                localforage.setItem('auTableau_tableaux_list', l),
                localforage.setItem('data_' + id, saved)
            ]);
        }).then(() => {
            if (typeof showToast === 'function') showToast('Session précédente rangée dans « Mes tableaux »');
        });
    }).catch(() => null).then(() => localforage.removeItem(AUTO_SAVE_KEY)).then(fermer, fermer);
}

// --- SAUVEGARDE ET HISTORIQUE ---
// Pages débarrassées de l'historique d'annulation : celui-ci ne survit pas au
// rechargement, il n'a donc rien à faire dans la sauvegarde ni dans un fichier.
// (Il pesait à lui seul 110 Mo réécrits à chaque action sur un tableau chargé.)
function pagesForStorage() {
    return pages.map(p => {
        const pCopy = { ...p };
        delete pCopy.history;
        delete pCopy.historyIndex;
        pCopy.images = packImages(p.images);   // sources mutualisées dans la table d'images
        return pCopy;
    });
}

// Charge utile complète d'un enregistrement : pages allégées + table d'images
function stateForStorage() {
    const storedPages = pagesForStorage();
    return { pages: storedPages, assets: collectAssets(storedPages), nextId, globalZ, currentBgIndex };
}

let autoSaveTimer = null;
let autoSaveWriting = false;

// Écriture réelle dans IndexedDB
function writeAppLocal() {
    syncPage();
    const appState = stateForStorage();
    const cleanedPages = appState.pages;

    autoSaveWriting = true;
    return localforage.setItem(AUTO_SAVE_KEY, appState).catch((e) => {
        console.error("Erreur de sauvegarde IndexedDB :", e);
        // Fallback de sécurité extrême au cas où
        const ultraCleanedPages = cleanedPages.map(p => ({
            ...p, images: (p.images || []).map(img => img.isBg ? { ...img, src: "" } : img)
        }));
        return localforage.setItem(AUTO_SAVE_KEY, { pages: ultraCleanedPages, assets: appState.assets, nextId, globalZ, currentBgIndex });
    }).finally(() => { autoSaveWriting = false; });
}

// Sauvegarde automatique temporisée : une écriture après la salve d'actions,
// au lieu d'une écriture complète à chaque clic.
function saveAppLocal(immediate) {
    if (immediate) {
        clearTimeout(autoSaveTimer); autoSaveTimer = null;
        return writeAppLocal();
    }
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { autoSaveTimer = null; writeAppLocal(); }, 1500);
}

// On n'attend pas la temporisation si l'onglet passe en arrière-plan ou se ferme
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && autoSaveTimer) saveAppLocal(true); });
window.addEventListener('pagehide', () => { if (autoSaveTimer) saveAppLocal(true); });

// === CALCUL DE TAILLE ===
// Poids réel d'un objet une fois écrit en JSON, EN OCTETS. Tout ce qui parle
// de taille dans l'application compte en octets : mélanger octets et mégaoctets
// est la façon la plus sûre d'annoncer « 0 KB » pour un fichier de 3 Mo.
function calculateObjectSize(obj) {
    try {
        return new Blob([JSON.stringify(obj)], { type: 'application/json' }).size;
    } catch (e) {
        return 0;
    }
}

function formatSize(octets) {
    const n = Number(octets) || 0;
    if (n < 1024) return Math.round(n) + ' octets';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',') + ' Ko';
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
}

function showMediasWarning(sizeWithMedias, sizeWithoutMedias) {
    return `
📊 Taille estimée:
   • Avec images/PDFs: ${formatSize(sizeWithMedias)}
   • Sans images: ${formatSize(sizeWithoutMedias)} (garde PDFs vectoriels)

⚠️  Pour une clé USB ou export rapide, choisir "Sans images"
    Les PDFs originaux seront toujours conservés.
    `;
}

// ==============================================================================
// RÉSERVOIR D'IMAGES
// Une même image (tampon posé dix fois, photo réutilisée) était recopiée en
// entier dans chaque objet, dans chaque instantané d'annulation et dans chaque
// fichier enregistré. On ne garde qu'un exemplaire de chaque source, désigné
// par une référence. Le code de dessin, lui, continue de voir un `src` normal.
// ==============================================================================
const assetIdBySrc = new Map();
const assetSrcById = new Map();

// Identifiant dérivé du contenu : deux fichiers différents ne peuvent pas
// réutiliser le même identifiant pour deux images différentes (import .prof).
function assetHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
}

function assetRef(src) {
    if (typeof src !== 'string' || src.length < 256) return null; // trop court : rien à gagner
    let id = assetIdBySrc.get(src);
    if (id === undefined) {
        id = 'a' + assetHash(src) + src.length.toString(36);
        assetIdBySrc.set(src, id);
        assetSrcById.set(id, src);
    }
    return id;
}

function packImages(arr) {
    return (arr || []).map(img => {
        if (!img) return img;
        const copy = { ...img };
        // IndexedDB ne sait pas cloner un élément du document : une image
        // laissée sur l'objet ferait échouer TOUTE la sauvegarde, en silence.
        // Le dessin vit dans imageCache, il n'a rien à faire ici.
        delete copy.img;
        if (copy.srcRef) return copy;
        const id = assetRef(copy.src);
        if (!id) return copy;
        copy.srcRef = id;
        delete copy.src;
        return copy;
    });
}

function unpackImages(arr) {
    return (arr || []).map(img => {
        if (!img || !img.srcRef) return img;
        const copy = { ...img, src: assetSrcById.get(img.srcRef) || '' };
        delete copy.srcRef;
        return copy;
    });
}

// Table des images à joindre à un enregistrement, pour les seules références utilisées
function collectAssets(pagesArr) {
    const used = {};
    (pagesArr || []).forEach(p => (p.images || []).forEach(img => {
        if (img && img.srcRef && assetSrcById.has(img.srcRef)) used[img.srcRef] = assetSrcById.get(img.srcRef);
    }));
    return used;
}

// Réinjecte les sources d'un fichier dans le réservoir avant de déballer
function adoptAssets(assets) {
    if (!assets) return;
    Object.keys(assets).forEach(id => {
        const src = assets[id];
        if (!src) return;
        assetSrcById.set(id, src);
        if (!assetIdBySrc.has(src)) assetIdBySrc.set(src, id);
    });
}

// Plafond de l'historique d'annulation : en nombre et en poids. Sans cela,
// 40 actions sur un tableau de 3,7 Mo occupaient 146 Mo de mémoire.
const HISTORY_MAX_ENTRIES = 200;
const HISTORY_MAX_BYTES = 24 * 1024 * 1024;

function trimHistory() {
    let bytes = 0;
    for (let i = 0; i < history.length; i++) bytes += history[i].length;
    while (history.length > 5 && (history.length > HISTORY_MAX_ENTRIES || bytes > HISTORY_MAX_BYTES)) {
        bytes -= history[0].length;
        history.shift();
        historyIndex--;
    }
    if (historyIndex < 0) historyIndex = 0;
}

function saveState() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    const state = JSON.stringify({ points, segments, circles, rectangles, texts, freehands, curves, polygons, images: packImages(images), arcs, htmlPostits });
    if (historyIndex >= 0 && history[historyIndex] === state) return;
    history.push(state); historyIndex++;
    trimHistory();

    if (typeof hasUnsavedChanges !== 'undefined') {
        hasUnsavedChanges = true;
        updateUnsavedIndicator();
    }

    saveAppLocal();
}

function restoreState(stateData) {
    currentPageIndex = -1;

    // NOUVEAU : Compatibilité hybride (Fichier texte VS Objet localForage)
    const state = typeof stateData === 'string' ? JSON.parse(stateData) : stateData;

    adoptAssets(state.assets);   // fichiers récents : les sources sont dans une table commune

    if (state.pages) {
        pages = state.pages; nextId = state.nextId || 1; globalZ = state.globalZ || 1; currentBgIndex = state.currentBgIndex || 0;
    }
    else {
        pages = [{ points: state.points || [], segments: state.segments || [], circles: state.circles || [], rectangles: state.rectangles || [], texts: state.texts || [], freehands: state.freehands || [], curves: state.curves || [], polygons: state.polygons || [], images: state.images || [], arcs: state.arcs || [], htmlPostits: state.htmlPostits || [], history: state.history || [], historyIndex: state.historyIndex !== undefined ? state.historyIndex : -1, panX: window.innerWidth / 2, panY: window.innerHeight / 2, zoom: 1 }]; nextId = state.nextId || 1; globalZ = state.globalZ || 1;
    }

    pages.forEach(p => {
        p.images = unpackImages(p.images);   // les anciens fichiers passent ici sans changement
        (p.images || []).forEach(img => { if (!imageCache[img.src] && img.src !== "") { const i = new Image(); i.src = img.src; imageCache[img.src] = i; i.onload = () => requestAnimationFrame(draw); } });
        (p.texts || []).forEach(t => { if (t.content.includes('$')) createMathImage(t.content, t.color || t.strokeColor, t.fontSize, (img, w, h) => { if (img) { t.mathImg = img; t.mathW = w; t.mathH = h; draw(); } }); });
    });

    loadPage(0);
    // Un tableau enregistré sans les fichiers arrive avec des trous : on le
    // dit tout de suite plutôt que de laisser croire à un tableau abîmé.
    if (typeof signalerImagesManquantes === 'function') setTimeout(signalerImagesManquantes, 400);
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        const state = JSON.parse(history[historyIndex]);
        points = state.points || []; segments = state.segments || []; circles = state.circles || []; rectangles = state.rectangles || [];
        texts = state.texts || []; freehands = state.freehands || []; curves = state.curves || [];
        polygons = state.polygons || []; images = unpackImages(state.images || []); arcs = state.arcs || []; htmlPostits = state.htmlPostits || [];
        creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; mouseLogicalPos = null; currentTracingArc = null;
        saveAppLocal(); draw();
        if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        const state = JSON.parse(history[historyIndex]);
        points = state.points || []; segments = state.segments || []; circles = state.circles || []; rectangles = state.rectangles || [];
        texts = state.texts || []; freehands = state.freehands || []; curves = state.curves || [];
        polygons = state.polygons || []; images = unpackImages(state.images || []); arcs = state.arcs || []; htmlPostits = state.htmlPostits || [];
        creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; mouseLogicalPos = null; currentTracingArc = null;
        saveAppLocal(); draw();
        if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
    }
}

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

const btnClearMenu = document.getElementById('btn-clear');
if (btnClearMenu) {
    btnClearMenu.addEventListener('click', () => {
        openConfirmModal("Tout effacer", "Voulez-vous vraiment créer un nouveau document vide ?", true, clearBoardAndPages);
    });
}

const btnTrashNow = document.getElementById('btn-trash-now');
if (btnTrashNow) {
    btnTrashNow.addEventListener('click', () => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').innerText = "Tout effacer";
        document.getElementById('confirm-text').innerText = "Voulez-vous vraiment tout effacer ? Vous pouvez aussi réinitialiser l'interface d'origine.";

        const btnContainer = modal.querySelector('div[style*="display: flex; gap"]');
        btnContainer.innerHTML = '';

        // Bouton Annuler
        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn-action secondary';
        btnCancel.textContent = 'Annuler';
        btnCancel.style.flex = '1';
        btnCancel.onclick = () => modal.style.display = 'none';
        btnContainer.appendChild(btnCancel);

        // Bouton Effacer
        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn-action danger';
        btnDelete.textContent = 'Effacer';
        btnDelete.style.flex = '1';
        btnDelete.onclick = () => { clearBoardAndPages(); modal.style.display = 'none'; };
        btnContainer.appendChild(btnDelete);

        // Bouton Réinitialiser interface
        const btnReset = document.createElement('button');
        btnReset.className = 'btn-action primary';
        btnReset.textContent = 'Réinitialiser l\'interface';
        btnReset.style.flex = '1';
        btnReset.onclick = () => {
            clearBoardAndPages();
            localStorage.clear();
            location.reload();
        };
        btnContainer.appendChild(btnReset);

        modal.style.display = 'flex';
    });
}

// btn-save listener is now overridden by the new Explorer save logic

document.getElementById('btn-load').addEventListener('click', () => { document.getElementById('file-loader').click(); });
document.getElementById('file-loader').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const fileSize = calculateObjectSize(JSON.parse(e.target.result));
            const data = JSON.parse(e.target.result);

            // Vérifier si c'est le nouveau format { id, name, data } ou l'ancien { pages }
            if (data.id && data.name && data.data) {
                // Nouveau format d'export de tableau
                const boardName = data.name || "Tableau importé";
                currentBoardName = boardName;
                const input = document.getElementById('project-name-input');
                if (input) input.value = boardName;

                // Charger les données
                restoreState(data.data);
                showToast(`📥 Tableau importé ! (${formatSize(fileSize)})`);

                // Vérifier s'il y a des PDFs manquants
                checkMissingPdfs();

                // ✅ Réconcilier les classes (élèves) éventuellement incluses dans l'export
                if (data.classes && typeof ClassesStore !== 'undefined') {
                    poserLesBadges(data);
                    await ClassesStore.reconcileImport(data.classes);
                }
            } else if (data.pages) {
                // Ancien format - juste les pages
                restoreState(data);
                showToast("Projet chargé !");

                // Vérifier aussi les PDFs manquants pour l'ancien format
                checkMissingPdfs();
            } else {
                showToast("❌ Format de fichier non reconnu");
            }
        } catch (err) {
            console.error("Erreur import :", err);
            showToast("❌ Erreur lors du chargement du fichier");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});
// ==========================================
// WIDGET TEMPS & GESTION DE CLASSE
// ==========================================
const twWidget = document.getElementById('time-widget');
const twTime = document.getElementById('tw-time');
const twInputs = document.getElementById('tw-inputs');
const inMin = document.getElementById('tw-min');
const inSec = document.getElementById('tw-sec');

const btnPlay = document.getElementById('btn-tw-play');
const btnPause = document.getElementById('btn-tw-pause');
const btnReset = document.getElementById('btn-tw-reset');
const btnLap = document.getElementById('btn-tw-lap');
const lapsContainer = document.getElementById('tw-laps');

let textResizeHint = null; // libellé affiché pendant le redimensionnement d'un texte

let twMode = 'clock';
let twInterval = null, currentMs = 0, isTwRunning = false, twLastTick = 0;
let recordedLaps = [];

// Variables Son & Pénalités
let cmAudioCtx = null, cmAnalyser = null, isMicActive = false;
let twThreshold = 75, twSmoothedVol = 0;
let twGraceLimit = 3000, twGraceTimer = 0;
let twPenaltyMode = 'alert', twPenaltySeconds = 10;
let twCooldown = 0;

function formatTwTime(ms, isStopwatch) {
    if (isStopwatch) {
        let date = new Date(ms);
        let m = String(date.getUTCMinutes()).padStart(2, '0');
        let s = String(date.getUTCSeconds()).padStart(2, '0');
        let mil = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, '0');
        return `${m}:${s}<span style="font-size:0.6em">:${mil}</span>`;
    } else {
        let totalS = Math.ceil(ms / 1000);
        let m = String(Math.floor(totalS / 60)).padStart(2, '0');
        let s = String(totalS % 60).padStart(2, '0');
        return `${m}:${s}`;
    }
}

// --- BOUCLE PRINCIPALE ---
function twTick(timestamp) {
    if (!twLastTick) twLastTick = timestamp;
    const delta = timestamp - twLastTick;
    twLastTick = timestamp;

    let timeIsFrozen = false;

    // MOTEUR DU SON ET DES PÉNALITÉS
    if (isMicActive && cmAnalyser) {
        const buffer = new Uint8Array(cmAnalyser.frequencyBinCount);
        cmAnalyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        let vol = Math.min(100, ((sum / buffer.length) / 120) * 100);

        twSmoothedVol = twSmoothedVol * 0.7 + vol * 0.3;

        // Affichage Barre
        document.getElementById('tw-sound-fill').style.width = twSmoothedVol + '%';
        if (twSmoothedVol > twThreshold) {
            document.getElementById('tw-sound-fill').style.background = '#d63031';
            document.getElementById('tw-emoji').innerText = '🤫';
        } else {
            document.getElementById('tw-sound-fill').style.background = '#00b894';
            document.getElementById('tw-emoji').innerText = '😊';
        }

        // Logique de sanction
        if (twCooldown > 0) {
            twCooldown -= delta;
        } else {
            if (twSmoothedVol > twThreshold) {
                twGraceTimer += delta;
                if (twGraceTimer >= twGraceLimit) {
                    twWidget.classList.add('danger-alert'); // Clignote rouge !

                    if (isTwRunning && twMode === 'timer') {
                        if (twPenaltyMode === 'pause') {
                            timeIsFrozen = true; // Suspend le timer
                        } else if (twPenaltyMode === 'malus') {
                            currentMs -= (twPenaltySeconds * 1000);
                            twCooldown = 5000; // 5s de répit après un malus
                            twGraceTimer = 0;
                            if (typeof showToast === 'function') showToast(`⚠️ Bruit ! -${twPenaltySeconds}s`);
                        }
                    }
                }
            } else {
                twGraceTimer = 0;
                twWidget.classList.remove('danger-alert');
            }
        }
    }

    // MOTEUR DU TEMPS
    if (twMode === 'clock') {
        const now = new Date();
        twTime.innerHTML = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + '<span style="font-size:0.6em">:' + String(now.getSeconds()).padStart(2, '0') + '</span>';
    } else if (twMode === 'stopwatch' && isTwRunning) {
        if (!timeIsFrozen) currentMs += delta;
        twTime.innerHTML = formatTwTime(currentMs, true);
    } else if (twMode === 'timer' && isTwRunning) {
        if (!timeIsFrozen) currentMs -= delta;

        // Décompte sonore des dernières secondes
        if (twAlarmCountdown && currentMs > 0) {
            const secLeft = Math.ceil(currentMs / 1000);
            if (secLeft <= 5 && secLeft !== twLastBeepSecond) {
                twLastBeepSecond = secLeft;
                twCountdownBeep(false);
            }
        }

        if (currentMs <= 0) {
            currentMs = 0; isTwRunning = false;
            twLastBeepSecond = null;
            btnPause.style.display = 'none'; btnPlay.style.display = 'block';
            playTwAlarm();
            twWidget.classList.add('danger-alert');
            setTimeout(() => twWidget.classList.remove('danger-alert'), 3000);
            if (typeof showToast === 'function') showToast("⏳ Minuteur terminé !");
        }
        twTime.innerHTML = formatTwTime(currentMs, false);
    }

    if (twMode === 'clock' || isTwRunning || isMicActive) {
        twInterval = requestAnimationFrame(twTick);
    }
}

function startTwLoop() {
    if (twInterval) cancelAnimationFrame(twInterval);
    twLastTick = 0;
    twInterval = requestAnimationFrame(twTick);
}

// --- ÉVÉNEMENTS INTERFACE ---
document.getElementById('btn-toggle-time').addEventListener('click', () => {
    twWidget.style.display = twWidget.style.display === 'flex' ? 'none' : 'flex';
    if (twWidget.style.display === 'flex' && twMode === 'clock') startTwLoop();
});
document.getElementById('btn-tw-close').addEventListener('click', () => {
    if (typeof twStopAlarm === 'function') twStopAlarm();
    twWidget.style.display = 'none';
});
document.getElementById('btn-tw-min').addEventListener('click', () => twWidget.classList.toggle('tw-min'));
document.getElementById('btn-tw-fs').addEventListener('click', () => twWidget.classList.toggle('tw-fs'));

document.getElementById('btn-tw-vol').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const soundPanel = document.getElementById('tw-sound');
    btn.classList.toggle('active-vol');
    soundPanel.style.display = btn.classList.contains('active-vol') ? 'block' : 'none';
});

// Onglets
document.querySelectorAll('.tw-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tw-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        twMode = tab.dataset.tab;

        isTwRunning = false;
        btnPause.style.display = 'none'; btnPlay.style.display = 'block';
        btnLap.style.display = 'none'; lapsContainer.style.display = 'none';

        twStopAlarm();
        twLastBeepSecond = null;
        const alarmBox = document.getElementById('tw-alarm');
        if (alarmBox) alarmBox.style.display = (twMode === 'timer') ? 'flex' : 'none';

        if (twMode === 'clock') {
            document.getElementById('tw-controls').style.display = 'none';
            twTime.style.display = 'block'; twInputs.style.display = 'none';
            startTwLoop();
        } else {
            document.getElementById('tw-controls').style.display = 'flex';
            currentMs = 0;
            if (twMode === 'stopwatch') {
                twTime.style.display = 'block'; twInputs.style.display = 'none';
                twTime.innerHTML = formatTwTime(0, true);
                renderLaps();
            } else {
                twTime.style.display = 'none'; twInputs.style.display = 'flex';
                inMin.value = "05"; inSec.value = "00";
            }
        }
    });
});

// Boutons de contrôle
btnPlay.addEventListener('click', () => {
    if (twMode === 'timer' && currentMs === 0) {
        currentMs = (parseInt(inMin.value) * 60 + parseInt(inSec.value)) * 1000;
        twTime.style.display = 'block'; twInputs.style.display = 'none';
        twTime.innerHTML = formatTwTime(currentMs, false);
    }
    isTwRunning = true;
    twLastBeepSecond = null;
    twAudioCtx(); // débloque le son : les navigateurs l'exigent sur un geste
    btnPlay.style.display = 'none'; btnPause.style.display = 'block';
    if (twMode === 'stopwatch') btnLap.style.display = 'block';
    startTwLoop();
});

btnPause.addEventListener('click', () => {
    isTwRunning = false;
    btnPause.style.display = 'none'; btnPlay.style.display = 'block';
    btnLap.style.display = 'none';
});

btnReset.addEventListener('click', () => {
    twStopAlarm(); twLastBeepSecond = null;
    twWidget.classList.remove('danger-alert');
    isTwRunning = false; btnPause.style.display = 'none'; btnPlay.style.display = 'block';
    btnLap.style.display = 'none'; currentMs = 0;
    if (twMode === 'stopwatch') { twTime.innerHTML = formatTwTime(0, true); recordedLaps = []; renderLaps(); }
    else if (twMode === 'timer') { twTime.style.display = 'none'; twInputs.style.display = 'flex'; }
});

btnLap.addEventListener('click', () => { recordedLaps.push(currentMs); renderLaps(); });
window.deleteLap = function (index) { recordedLaps.splice(index, 1); renderLaps(); }

function renderLaps() {
    if (twMode !== 'stopwatch' || recordedLaps.length === 0) { lapsContainer.style.display = 'none'; return; }
    lapsContainer.style.display = 'block';
    lapsContainer.innerHTML = recordedLaps.map((lap, i) => `
        <div class="tw-lap-item"><span>Tour ${i + 1}</span><span>${formatTwTime(lap, true)} <span class="tw-lap-del" onclick="deleteLap(${i})">✕</span></span></div>
    `).reverse().join('');
}

// ==============================================================================
// SONNERIE DU MINUTEUR
// Sons de synthèse (Web Audio) : aucun fichier, fonctionne hors ligne.
// ==============================================================================
let twAlarmSound = localStorage.getItem('autableau_tw_alarm') || 'carillon';
let twAlarmCountdown = localStorage.getItem('autableau_tw_alarm_countdown') === '1';
let twAlarmNodes = [];
let twLastBeepSecond = null;

function twAudioCtx() {
    try {
        if (typeof initAudio === 'function') return initAudio();
        if (!window.SharedAudioCtx) window.SharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (window.SharedAudioCtx.state === 'suspended') window.SharedAudioCtx.resume();
        return window.SharedAudioCtx;
    } catch (e) { return null; }
}

function twStopAlarm() {
    twAlarmNodes.forEach(n => { try { n.stop(); } catch (e) { } });
    twAlarmNodes = [];
}

// Une note : montée rapide puis extinction naturelle
function twNote(ctx, freq, start, dur, vol, type) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
    twAlarmNodes.push(osc);
}

function playTwAlarm(kind) {
    const sound = kind || twAlarmSound;
    if (sound === 'none') return;
    const ctx = twAudioCtx();
    if (!ctx) return;
    twStopAlarm();

    if (sound === 'bip') {
        for (let i = 0; i < 3; i++) twNote(ctx, 880, i * 0.24, 0.16, 0.28, 'square');
    } else if (sound === 'carillon') {
        // Do - Mi - Sol - Do, façon carillon d'école
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            twNote(ctx, f, i * 0.22, 1.1, 0.26, 'triangle');
            twNote(ctx, f * 2, i * 0.22, 0.55, 0.07, 'sine'); // harmonique, pour le timbre métallique
        });
    } else if (sound === 'minuterie') {
        // Sonnerie mécanique : petits coups très rapprochés
        for (let i = 0; i < 22; i++) {
            twNote(ctx, i % 2 ? 2100 : 2450, i * 0.07, 0.06, 0.16, 'square');
        }
    } else if (sound === 'alarme') {
        for (let i = 0; i < 8; i++) twNote(ctx, i % 2 ? 660 : 880, i * 0.22, 0.2, 0.25, 'sawtooth');
    }
}

// Petit bip de décompte des dernières secondes
function twCountdownBeep(isLast) {
    const ctx = twAudioCtx();
    if (!ctx) return;
    twNote(ctx, isLast ? 1200 : 800, 0, 0.09, 0.18, 'sine');
}

function twSyncAlarmUI() {
    const sel = document.getElementById('tw-alarm-sound');
    const chk = document.getElementById('tw-alarm-countdown');
    if (sel) sel.value = twAlarmSound;
    if (chk) chk.checked = twAlarmCountdown;
}

document.getElementById('tw-alarm-sound')?.addEventListener('change', (e) => {
    twAlarmSound = e.target.value;
    localStorage.setItem('autableau_tw_alarm', twAlarmSound);
    playTwAlarm(twAlarmSound); // aperçu immédiat du choix
});
document.getElementById('tw-alarm-countdown')?.addEventListener('change', (e) => {
    twAlarmCountdown = e.target.checked;
    localStorage.setItem('autableau_tw_alarm_countdown', twAlarmCountdown ? '1' : '0');
});
document.getElementById('btn-tw-alarm-test')?.addEventListener('click', () => playTwAlarm());
twSyncAlarmUI();

// --- REGLAGES DU SONOMÈTRE ---
document.getElementById('tw-slider-thresh').addEventListener('input', (e) => {
    twThreshold = e.target.value;
    document.getElementById('tw-sound-thresh').style.left = twThreshold + '%';
});

document.getElementById('tw-slider-grace').addEventListener('input', (e) => {
    twGraceLimit = parseInt(e.target.value) * 1000;
    document.getElementById('tw-grace-val').innerText = e.target.value + 's';
});

document.getElementById('tw-penalty-mode').addEventListener('change', (e) => {
    twPenaltyMode = e.target.value;
    document.getElementById('tw-malus-box').style.display = (twPenaltyMode === 'malus') ? 'flex' : 'none';
});

document.getElementById('tw-malus-sec').addEventListener('input', (e) => {
    twPenaltySeconds = parseInt(e.target.value) || 10;
});

document.getElementById('btn-tw-mic').addEventListener('click', async () => {
    if (isMicActive) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        cmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        cmAnalyser = cmAudioCtx.createAnalyser();
        cmAnalyser.fftSize = 256; cmAnalyser.smoothingTimeConstant = 0.8;
        cmAudioCtx.createMediaStreamSource(stream).connect(cmAnalyser);

        isMicActive = true;
        document.getElementById('btn-tw-mic').innerText = "🎙️ Micro On";
        document.getElementById('btn-tw-mic').style.background = "#00b894";
        document.getElementById('btn-tw-mic').style.color = "white";
        if (!twInterval) startTwLoop();
    } catch (e) { alert("Erreur micro."); }
});

// Drag
let isDraggingTw = false, twStartX = 0, twStartY = 0;
twWidget.querySelector('.drag-handle-time').addEventListener('mousedown', (e) => {
    if (e.target.closest('.tw-btn')) return;
    isDraggingTw = true;
    twStartX = e.clientX - twWidget.offsetLeft;
    twStartY = e.clientY - twWidget.offsetTop;
    twWidget.style.transition = 'none';
});
window.addEventListener('mousemove', (e) => {
    if (isDraggingTw && !twWidget.classList.contains('tw-fs')) {
        twWidget.style.left = (e.clientX - twStartX) + 'px';
        twWidget.style.top = (e.clientY - twStartY) + 'px';
    }
});
window.addEventListener('mouseup', () => {
    isDraggingTw = false;
    if (typeof twWidget !== 'undefined' && twWidget) twWidget.style.transition = '';
});

// --- FONCTIONS DE DESSIN DE BASE & FLECHES ---

function drawArrowHead(ctx, x, y, angle, color, width, lw, type) {
    if (!type || type === 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width * lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const l = (width * 2 + 6) * lw;
    const tipX = (width / 2) * lw; // On décale la pointe pour cacher l'arrondi (lineCap) de la ligne principale

    ctx.beginPath();
    if (type === 1) { // Chevron
        ctx.moveTo(tipX - l, l / 2);
        ctx.lineTo(tipX, 0);
        ctx.lineTo(tipX - l, -l / 2);
        ctx.stroke();
    } else if (type === 2) { // Triangle
        ctx.moveTo(tipX, 0);
        ctx.lineTo(tipX - l, l / 2.5);
        ctx.lineTo(tipX - l, -l / 2.5);
        ctx.closePath();
        ctx.fill();
    } else if (type === 3) { // Dart
        ctx.moveTo(tipX, 0);
        ctx.lineTo(tipX - l, l / 2.5);
        ctx.lineTo(tipX - l + l / 3, 0);
        ctx.lineTo(tipX - l, -l / 2.5);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function getSvgArrowHead(x, y, angle, color, w, lw, type) {
    if (!type || type === 0) return '';
    const l = (w * 2 + 6) * lw;
    const tipX = (w / 2) * lw;
    const aDeg = angle * 180 / Math.PI;

    let d = ''; let fill = 'none'; let stroke = 'none';
    if (type === 1) {
        d = `M ${tipX - l} ${l / 2} L ${tipX} 0 L ${tipX - l} ${-l / 2}`;
        stroke = color;
    } else if (type === 2) {
        d = `M ${tipX} 0 L ${tipX - l} ${l / 2.5} L ${tipX - l} ${-l / 2.5} Z`;
        fill = color;
    } else if (type === 3) {
        d = `M ${tipX} 0 L ${tipX - l} ${l / 2.5} L ${tipX - l + l / 3} 0 L ${tipX - l} ${-l / 2.5} Z`;
        fill = color;
    }

    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w * lw}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x}, ${y}) rotate(${aDeg})" />`;
}

function getArrowIcon(type, isStart) {
    let content = '';
    if (isStart) {
        if (type === 0) content = '<line x1="21" y1="12" x2="3" y2="12"/>';
        else if (type === 1) content = '<line x1="21" y1="12" x2="3" y2="12"/><polyline points="10 5 3 12 10 19"/>';
        else if (type === 2) content = '<line x1="21" y1="12" x2="3" y2="12"/><polygon points="3 12 11 5 11 19" fill="currentColor" stroke="none"/>';
        else if (type === 3) content = '<line x1="21" y1="12" x2="3" y2="12"/><polygon points="3 12 11 5 8 12 11 19" fill="currentColor" stroke="none"/>';
    } else {
        if (type === 0) content = '<line x1="3" y1="12" x2="21" y2="12"/>';
        else if (type === 1) content = '<line x1="3" y1="12" x2="21" y2="12"/><polyline points="14 5 21 12 14 19"/>';
        else if (type === 2) content = '<line x1="3" y1="12" x2="21" y2="12"/><polygon points="21 12 13 5 13 19" fill="currentColor" stroke="none"/>';
        else if (type === 3) content = '<line x1="3" y1="12" x2="21" y2="12"/><polygon points="21 12 13 5 16 12 13 19" fill="currentColor" stroke="none"/>';
    }
    return `<svg viewBox="0 0 24 24" class="stroke-icon">${content}</svg>`;
}

function drawCarreau(minX, maxX, minY, maxY, lw, gw) { ctx.beginPath(); for (let x = Math.floor(minX / 30) * 30; x < maxX; x += 30) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); } for (let y = Math.floor(minY / 30) * 30; y < maxY; y += 30) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); } ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"; ctx.lineWidth = lw * gw; ctx.stroke(); }
function drawPoint(minX, maxX, minY, maxY, lw, gw) { const radius = 1.5 * lw * gw; ctx.fillStyle = isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)"; ctx.beginPath(); for (let x = Math.floor(minX / 30) * 30; x < maxX; x += 30) { for (let y = Math.floor(minY / 30) * 30; y < maxY; y += 30) { ctx.moveTo(x, y); ctx.arc(x, y, radius, 0, Math.PI * 2); } } ctx.fill(); }
function drawMillimetre(minX, maxX, minY, maxY, lw, gw) { const size = 10; const drawLayer = (stepMult, color, widthMult) => { const step = size * stepMult; ctx.beginPath(); for (let x = Math.floor(minX / step) * step; x < maxX; x += step) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); } for (let y = Math.floor(minY / step) * step; y < maxY; y += step) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); } ctx.strokeStyle = color; ctx.lineWidth = lw * widthMult * gw; ctx.stroke(); }; drawLayer(1, isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(230, 126, 34, 0.18)", 1); drawLayer(5, isDarkMode ? "rgba(255,255,255,0.25)" : "rgba(230, 126, 34, 0.45)", 1.5); drawLayer(10, isDarkMode ? "rgba(255,255,255,0.4)" : "#e67e22", 2.2); }
function drawSeyes(minX, maxX, minY, maxY, lw, gw) { const size = 40; const sub = size / 4; ctx.beginPath(); for (let x = Math.floor(minX / size) * size; x < maxX; x += size) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); } ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(116, 185, 255, 0.35)"; ctx.lineWidth = lw * gw; ctx.stroke(); ctx.beginPath(); for (let y = Math.floor(minY / sub) * sub; y < maxY; y += sub) { if (y % size !== 0) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); } } ctx.stroke(); ctx.beginPath(); for (let y = Math.floor(minY / size) * size; y < maxY; y += size) { ctx.moveTo(minX, y); ctx.lineTo(maxX, y); } ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.25)" : "rgba(108, 92, 231, 0.45)"; ctx.lineWidth = lw * 1.6 * gw; ctx.stroke(); }
// --- FONDS « FEUILLE » ---------------------------------------------------
// Une seule feuille par ligne, empilées vers le bas comme un document, et du
// gris clair tout autour : c'est ce qu'on projette quand on montre une copie.
// (Une feuille répétée en damier faisait mosaïque, et pas copie d'examen.)
// UNE feuille, pas un rouleau. Le fond se répétait à l'infini vers le haut et
// vers le bas : on voyait deux en-têtes de copie l'un sous l'autre, ce qui ne
// veut rien dire — une copie d'examen, c'est une feuille. Pour en avoir une
// autre, on ajoute une page au tableau (le « + » de la barre du bas).
function feuillesVisibles(minY, maxY) {
    if (0 > maxY || PAGE_H < minY) return [];      // la feuille est hors de vue
    return [0];
}

// La réglure Seyès, tracée à l'intérieur d'un rectangle
function reglureSeyes(x0, y0, x1, y1, lw, gw) {
    const size = 40, sub = size / 4;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();

    ctx.beginPath();
    for (let y = Math.ceil(y0 / sub) * sub; y < y1; y += sub) {
        if (y % size === 0) continue;
        ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    }
    ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(116, 185, 255, 0.30)";
    ctx.lineWidth = lw * gw; ctx.stroke();

    ctx.beginPath();
    for (let y = Math.ceil(y0 / size) * size; y < y1; y += size) {
        ctx.moveTo(x0, y); ctx.lineTo(x1, y);
    }
    ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.20)" : "rgba(108, 92, 231, 0.38)";
    ctx.lineWidth = lw * 1.5 * gw; ctx.stroke();
    ctx.restore();
}

// Le quadrillage 5×5 des copies d'examen, tracé à l'intérieur d'un rectangle
function reglurePetitsCarreaux(x0, y0, x1, y1, lw, gw) {
    const pas = 30;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.beginPath();
    for (let x = Math.ceil(x0 / pas) * pas; x < x1; x += pas) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (let y = Math.ceil(y0 / pas) * pas; y < y1; y += pas) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.13)" : "rgba(116, 149, 185, 0.32)";
    ctx.lineWidth = lw * gw;
    ctx.stroke();
    ctx.restore();
}

// La feuille elle-même : blanche, posée sur le gris, avec une ombre douce
function poserFeuille(py, lw, gw) {
    ctx.save();
    ctx.shadowColor = isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(45, 52, 54, 0.18)';
    ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
    ctx.fillStyle = isDarkMode ? "#232a2d" : "#ffffff";
    ctx.fillRect(0, py, PAGE_L, PAGE_H);
    ctx.restore();
    ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.10)" : "rgba(45, 52, 54, 0.14)";
    ctx.lineWidth = lw * gw;
    ctx.strokeRect(0, py, PAGE_L, PAGE_H);
}

function margeRouge(px, y0, y1, lw, gw) {
    ctx.beginPath();
    ctx.moveTo(px + MARGE_X, y0); ctx.lineTo(px + MARGE_X, y1);
    ctx.strokeStyle = isDarkMode ? "rgba(255, 118, 117, 0.5)" : "rgba(214, 48, 49, 0.6)";
    ctx.lineWidth = lw * 1.8 * gw;
    ctx.stroke();
}

// Cahier : une feuille de Seyès avec sa marge, rien de plus.
function drawSeyesMarge(minX, maxX, minY, maxY, lw, gw) {
    feuillesVisibles(minY, maxY).forEach(py => {
        if (py > maxY || py + PAGE_H < minY) return;
        poserFeuille(py, lw, gw);
        reglureSeyes(0, py + 60, PAGE_L, py + PAGE_H - 60, lw, gw);
        margeRouge(0, py + 60, py + PAGE_H - 60, lw, gw);
    });
}

// Copie d'examen : la même feuille, avec l'en-tête à remplir et la case note.
function drawCopie(minX, maxX, minY, maxY, lw, gw) {
    const M = 70;                  // marge intérieure de la feuille
    const H = 200;                 // hauteur de l'en-tête
    const largeurNote = 260;
    const encre = isDarkMode ? "rgba(223, 230, 233, 0.75)" : "rgba(45, 52, 54, 0.62)";
    const trait = isDarkMode ? "rgba(255,255,255,0.28)" : "rgba(45, 52, 54, 0.42)";

    feuillesVisibles(minY, maxY).forEach(py => {
        if (py > maxY || py + PAGE_H < minY) return;
        poserFeuille(py, lw, gw);

        const hx = M, hy = py + 60, hw = PAGE_L - M * 2;
        const xNote = hx + hw - largeurNote;

        // Le cadre de l'en-tête, sa séparation horizontale et la case note
        ctx.strokeStyle = trait;
        ctx.lineWidth = lw * 1.6 * gw;
        ctx.strokeRect(hx, hy, hw, H);
        ctx.beginPath();
        ctx.moveTo(hx, hy + H / 2); ctx.lineTo(xNote, hy + H / 2);
        ctx.moveTo(xNote, hy); ctx.lineTo(xNote, hy + H);
        ctx.moveTo(hx + (xNote - hx) / 2, hy); ctx.lineTo(hx + (xNote - hx) / 2, hy + H);
        ctx.stroke();

        // Les intitulés, discrets : la copie doit rester à remplir
        ctx.fillStyle = encre;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `600 20px sans-serif`;
        const demi = hx + (xNote - hx) / 2;
        ctx.fillText('NOM', hx + 22, hy + H / 4);
        ctx.fillText('PRÉNOM', hx + 22, hy + (H * 3) / 4);
        ctx.fillText('CLASSE', demi + 22, hy + H / 4);
        ctx.fillText('DATE', demi + 22, hy + (H * 3) / 4);

        ctx.textAlign = 'center';
        ctx.font = `600 20px sans-serif`;
        ctx.fillText('NOTE', xNote + largeurNote / 2, hy + 34);
        ctx.font = `300 46px sans-serif`;
        ctx.fillText('/ 20', xNote + largeurNote / 2, hy + H - 52);
        ctx.textAlign = 'left';

        // Le corps de la copie : petits carreaux, comme une vraie copie
        // d'examen — et sans marge rouge, qui appartient au cahier.
        const hautLignes = hy + H + 60;
        const basLignes = py + PAGE_H - 70;
        reglurePetitsCarreaux(M, hautLignes, PAGE_L - M, basLignes, lw, gw);
    });
    ctx.textBaseline = 'alphabetic';
}

function drawIsometrique(minX, maxX, minY, maxY, lw, gw) { const h = 30 * Math.sqrt(3) / 2; ctx.beginPath(); for (let x = Math.floor(minX / h) * h; x < maxX; x += h) { ctx.moveTo(x, minY); ctx.lineTo(x, maxY); } const slope = 1 / Math.sqrt(3); for (let k = Math.floor((minY - maxX * slope) / 30); k <= Math.ceil((maxY - minX * slope) / 30); k++) { ctx.moveTo(minX, minX * slope + k * 30); ctx.lineTo(maxX, maxX * slope + k * 30); } for (let k = Math.floor((minY + minX * slope) / 30); k <= Math.ceil((maxY + maxX * slope) / 30); k++) { ctx.moveTo(minX, -minX * slope + k * 30); ctx.lineTo(maxX, -maxX * slope + k * 30); } ctx.strokeStyle = isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"; ctx.lineWidth = lw * gw; ctx.stroke(); }

function drawSpline(ctx, ptIds, appendPos, isClosed) {
    const pts = ptIds.map(id => getObjectById('point', id)).filter(p => p); if (appendPos) pts.push(appendPos); if (pts.length < 2) return;
    ctx.beginPath();
    if (isClosed && pts.length > 2) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
            ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
        }
    } else {
        ctx.moveTo(pts[0].x, pts[0].y); if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); return; }
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];
            ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
        }
    }
    ctx.stroke();
}

function drawSmoothFreehand(ctx, points, baseWidth, lw) {
    if (points.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let firstP = points[0].p !== undefined ? points[0].p : 0.5;
    let isConstantPressure = true;
    for (let i = 1; i < points.length; i++) {
        let p = points[i].p !== undefined ? points[i].p : 0.5;
        if (Math.abs(p - firstP) > 0.02) {
            isConstantPressure = false;
            break;
        }
    }

    if (isConstantPressure) {
        ctx.lineWidth = (baseWidth || 3) * (firstP * 2) * lw;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            let xc = (points[i].x + points[i + 1].x) / 2;
            let yc = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
    } else {
        let currentWidth = (baseWidth || 3) * (firstP * 2) * lw;
        ctx.lineWidth = currentWidth;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length - 1; i++) {
            let p = points[i].p !== undefined ? points[i].p : 0.5;
            let targetWidth = (baseWidth || 3) * (p * 2) * lw;

            let xc = (points[i].x + points[i + 1].x) / 2;
            let yc = (points[i].y + points[i + 1].y) / 2;

            if (Math.abs(targetWidth - currentWidth) > 0.2) {
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(xc, yc);
                currentWidth = targetWidth;
                ctx.lineWidth = currentWidth;
            } else {
                ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
    }
}


// --- LOGIQUE UTILITAIRE RESTANTE ---
function hexToRgba(hex, alpha) {
    if (!hex) hex = '#000000';
    if (hex.startsWith('#')) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) { r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16); }
        else if (hex.length === 7) { r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16); }
        return `rgba(${r},${g},${b},${alpha})`;
    } return hex;
}

function setContextDash(ctx, dashType, lw) {
    if (dashType === 'dashed') ctx.setLineDash([lw * 6, lw * 4]);
    else if (dashType === 'dotted') ctx.setLineDash([lw, lw * 3]);
    else ctx.setLineDash([]);
}

function simplifyLine(pts, epsilon) {
    if (pts.length < 3) return pts;
    let dmax = 0; let index = 0; const end = pts.length - 1;
    for (let i = 1; i < end; i++) {
        const d = distToSegment(pts[i].x, pts[i].y, pts[0].x, pts[0].y, pts[end].x, pts[end].y);
        if (d > dmax) { index = i; dmax = d; }
    }
    if (dmax > epsilon) {
        const rec1 = simplifyLine(pts.slice(0, index + 1), epsilon);
        const rec2 = simplifyLine(pts.slice(index), epsilon);
        return rec1.slice(0, -1).concat(rec2);
    } else { return [pts[0], pts[end]]; }
}

function recognizeShape() {
    if (!currentFreehand || currentFreehand.points.length < 10) return;
    const pts = currentFreehand.points;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX; const h = maxY - minY; const diag = Math.hypot(w, h);

    if (diag < 8 / zoom) return;

    const first = pts[0]; const last = pts[pts.length - 1];
    const isClosed = Math.hypot(first.x - last.x, first.y - last.y) < diag * 0.3;

    let recognized = false; let shapeName = "";

    if (isClosed) {
        let simPts = simplifyLine(pts, Math.max(diag * 0.07, 4 / zoom));
        if (Math.hypot(simPts[0].x - simPts[simPts.length - 1].x, simPts[0].y - simPts[simPts.length - 1].y) < diag * 0.3) simPts.pop();

        const cx = minX + w / 2; const cy = minY + h / 2;
        let rSum = 0; pts.forEach(p => rSum += Math.hypot(p.x - cx, p.y - cy));
        const rAvg = rSum / pts.length;
        let variance = 0; pts.forEach(p => variance += Math.abs(Math.hypot(p.x - cx, p.y - cy) - rAvg));
        variance /= pts.length;
        const circularity = variance / rAvg;

        if (circularity < 0.09 || simPts.length > 6) {
            const cId = nextId++; const eId = nextId++;
            points.push({ id: cId, x: cx, y: cy, z: globalZ++, shape: 'pixel', color: 'rgba(0,0,0,0)' });
            points.push({ id: eId, x: cx + rAvg, y: cy, z: globalZ++, shape: 'pixel', color: 'rgba(0,0,0,0)' });
            circles.push({
                id: nextId++, center_id: cId, edge_id: eId,
                color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash,
                isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++
            });
            recognized = true; shapeName = "Cercle";
        } else if (simPts.length === 4) {
            // Quatre sommets : rectangle droit, losange, ou quadrilatère quelconque.
            // Avant, tout finissait en rectangle construit sur la boîte englobante,
            // ce qui transformait n'importe quel losange en rectangle.
            const qcx = minX + w / 2, qcy = minY + h / 2;
            const diamond = [
                { x: qcx, y: minY }, { x: maxX, y: qcy }, { x: qcx, y: maxY }, { x: minX, y: qcy }
            ];
            // Un losange, c'est quatre côtés égaux. On ne le redresse sur la
            // boîte que s'il est déjà posé sur la pointe : sinon on garderait
            // l'aire mais on ferait pivoter le dessin de l'utilisateur.
            const sides = simPts.map((p, i) => {
                const q = simPts[(i + 1) % 4];
                return Math.hypot(q.x - p.x, q.y - p.y);
            });
            const avgSide = (sides[0] + sides[1] + sides[2] + sides[3]) / 4;
            const isDiamond = avgSide > 0 && sides.every(l => Math.abs(l - avgSide) < avgSide * 0.22);
            const upright = diamond.every(t => simPts.some(p => Math.hypot(p.x - t.x, p.y - t.y) < diag * 0.08));

            // Rectangle droit : chaque côté est à moins de 15° d'un axe.
            // (Test sur l'angle et non sur un écart en pixels : un carré incliné
            // passait pour un rectangle et se retrouvait redressé de force.)
            const isAxisRect = simPts.every((p, i) => {
                const q = simPts[(i + 1) % 4];
                const ang = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI) % 90;
                return ang < 15 || ang > 75;
            });

            if (isAxisRect) {
                const p1Id = nextId++; const p2Id = nextId++;
                points.push({ id: p1Id, x: minX, y: minY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
                points.push({ id: p2Id, x: maxX, y: maxY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
                rectangles.push({
                    id: nextId++, p1_id: p1Id, p2_id: p2Id, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash,
                    isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++
                });
                recognized = true; shapeName = "Rectangle";
            } else {
                // Le losange est redressé sur la boîte englobante ; les autres
                // quadrilatères gardent les sommets tracés.
                const corners = (isDiamond && upright) ? diamond : simPts;
                let quadIds = [];
                corners.forEach((p) => {
                    const pId = nextId++;
                    points.push({ id: pId, x: p.x, y: p.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
                    quadIds.push(pId);
                });
                polygons.push({
                    id: nextId++, points: quadIds, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash,
                    isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, isClosed: true, z: globalZ++
                });
                recognized = true;
                shapeName = isDiamond ? "Losange" : "Quadrilatère";
            }
        } else if (simPts.length >= 3 && simPts.length <= 6) {
            let polyPointIds = [];
            simPts.forEach((p) => {
                const pId = nextId++;
                points.push({ id: pId, x: p.x, y: p.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
                polyPointIds.push(pId);
            });
            polygons.push({
                id: nextId++, points: polyPointIds, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash,
                isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, isClosed: true, z: globalZ++
            });
            recognized = true;
            if (simPts.length === 3) shapeName = "Triangle";
            else shapeName = "Polygone";
        }
    } else {
        let simPts = simplifyLine(pts, Math.max(diag * 0.07, 4 / zoom));
        if (simPts.length === 2) {
            let p2x = simPts[1].x, p2y = simPts[1].y;
            if (Math.abs(simPts[0].x - p2x) < diag * 0.1) p2x = simPts[0].x;
            if (Math.abs(simPts[0].y - p2y) < diag * 0.1) p2y = simPts[0].y;

            const p1Id = nextId++; const p2Id = nextId++;
            points.push({ id: p1Id, x: simPts[0].x, y: simPts[0].y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
            points.push({ id: p2Id, x: p2x, y: p2y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
            segments.push({ id: nextId++, p1_id: p1Id, p2_id: p2Id, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash, arrowStart: currentFreehand.arrowStart, arrowEnd: currentFreehand.arrowEnd, z: globalZ++ });
            recognized = true; shapeName = "Ligne";
        }
    }

    if (recognized) {
        isDrawingFreehand = false; currentFreehand = null;
        saveState(); showToast("✨ " + shapeName + " magique !"); draw();
    }
}

// --- EXPORT SVG ---
function generateSVGString(rect, keepBg) {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rect.w} ${rect.h}" width="${rect.w}" height="${rect.h}">`;

    if (keepBg) {
        let bgColor = (backgrounds[currentBgIndex] === 'millimetre') ?
            (isDarkMode ? '#2d3436' : bgColors.millimetre) :
            (isDarkMode ? '#1e272e' : bgColors.default);
        svg += `<rect x="0" y="0" width="${rect.w}" height="${rect.h}" fill="${bgColor}"/>`;
    }

    const tx = panX - rect.x;
    const ty = panY - rect.y;
    svg += `<g transform="translate(${tx}, ${ty}) scale(${zoom})">`;

    function getDash(type, w) {
        if (type === 'dashed') return `${w * 6},${w * 4}`;
        if (type === 'dotted') return `${w},${w * 3}`;
        return 'none';
    }

    let displayList = [];
    images.forEach(o => displayList.push({ type: 'image', obj: o }));
    polygons.forEach(o => displayList.push({ type: 'polygon', obj: o }));
    curves.forEach(o => displayList.push({ type: 'curve', obj: o }));
    circles.forEach(o => displayList.push({ type: 'circle', obj: o }));
    arcs.forEach(o => displayList.push({ type: 'arc', obj: o }));
    rectangles.forEach(o => displayList.push({ type: 'rectangle', obj: o }));
    segments.forEach(o => displayList.push({ type: 'segment', obj: o }));
    freehands.forEach(o => displayList.push({ type: 'freehand', obj: o }));
    points.forEach(o => displayList.push({ type: 'point', obj: o }));
    texts.forEach(o => displayList.push({ type: 'text', obj: o }));

    displayList.sort((a, b) => (a.obj.z || 0) - (b.obj.z || 0));

    const lw = 1 / zoom;

    let hiddenPoints = new Set();
    segments.forEach(s => { if (s.arrowStart) hiddenPoints.add(s.p1_id); if (s.arrowEnd) hiddenPoints.add(s.p2_id); });
    curves.forEach(c => { if (c.points.length > 1) { if (c.arrowStart) hiddenPoints.add(c.points[0]); if (c.arrowEnd) hiddenPoints.add(c.points[c.points.length - 1]); } });

    displayList.forEach(item => {
        const obj = item.obj;
        const color = obj.strokeColor || obj.color || (isDarkMode ? '#fff' : '#000');
        const w = obj.width || 3;
        const dash = getDash(obj.dash, w);
        const fill = obj.isFilled ? hexToRgba(obj.fillColor || obj.color, obj.fillOpacity || 0.2) : 'none';

        // 🌟 GESTION DE LA ROTATION UNIVERSELLE (Radians vers Degrés)
        const angle = obj.angle || obj.rotation || 0;
        const angleDeg = angle * (180 / Math.PI);

        if (item.type === 'image') {
            let transformAttr = "";
            if (angle !== 0) {
                const cx = obj.x + (obj.w / 2);
                const cy = obj.y + (obj.h / 2);
                transformAttr = ` transform="rotate(${angleDeg}, ${cx}, ${cy})"`;
            }
            const opacityAttr = (obj.opacity !== undefined && obj.opacity < 1) ? ` opacity="${obj.opacity}"` : "";
            if (obj.cw !== undefined && obj.ch !== undefined && imageCache[obj.src]) {
                const origW = imageCache[obj.src].width || obj.cw;
                const origH = imageCache[obj.src].height || obj.ch;
                svg += `<svg x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" viewBox="${obj.cx || 0} ${obj.cy || 0} ${obj.cw} ${obj.ch}"${transformAttr}${opacityAttr}><image href="${obj.src}" x="0" y="0" width="${origW}" height="${origH}" preserveAspectRatio="none" /></svg>`;
            } else {
                svg += `<image href="${obj.src}" x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}"${transformAttr}${opacityAttr} preserveAspectRatio="none" />`;
            }

        } else if (item.type === 'freehand') {
            if (obj.isHighlighter) {
                if (obj.points.length > 1) {
                    let d = `M ${obj.points[0].x} ${obj.points[0].y} `;
                    for (let i = 1; i < obj.points.length; i++) d += `L ${obj.points[i].x} ${obj.points[i].y} `;
                    svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" style="mix-blend-mode: multiply;" opacity="0.85" />`;
                }
            } else {
                for (let i = 0; i < obj.points.length - 1; i++) {
                    let p = obj.points[i + 1].p !== undefined ? obj.points[i + 1].p : 0.5;
                    let sw = w * (p * 2);
                    svg += `<line x1="${obj.points[i].x}" y1="${obj.points[i].y}" x2="${obj.points[i + 1].x}" y2="${obj.points[i + 1].y}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash}" />`;
                }
            }
            if (obj.arrowStart && obj.points.length > 1 && !obj.isHighlighter) {
                const pA = obj.points[1]; const pB = obj.points[0];
                const svgAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                svg += getSvgArrowHead(pB.x, pB.y, svgAngle, color, w, 1, obj.arrowStart);
            }
            if (obj.arrowEnd && obj.points.length > 1 && !obj.isHighlighter) {
                const pA = obj.points[obj.points.length - 2]; const pB = obj.points[obj.points.length - 1];
                const svgAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                svg += getSvgArrowHead(pB.x, pB.y, svgAngle, color, w, 1, obj.arrowEnd);
            }

        } else if (item.type === 'polygon') {
            if (obj.points.length >= 2) {
                let d = ''; let valid = true;
                const p0 = getObjectById('point', obj.points[0]);
                if (p0) {
                    d += `M ${p0.x} ${p0.y} `;
                    for (let i = 1; i < obj.points.length; i++) {
                        const p = getObjectById('point', obj.points[i]);
                        if (p) d += `L ${p.x} ${p.y} `; else valid = false;
                    }
                    if (obj.isClosed !== false) d += 'Z';
                    if (valid) {
                        svg += `<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linejoin="round" />`;
                    }
                }
            }
        } else if (item.type === 'curve') {
            const pts = obj.points.map(id => getObjectById('point', id)).filter(p => p);
            if (pts.length >= 2) {
                let d = `M ${pts[0].x} ${pts[0].y} `;
                if (obj.closed && pts.length > 2) {
                    for (let i = 0; i < pts.length; i++) {
                        const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
                        d += `C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y} `;
                    }
                } else {
                    if (pts.length === 2) d += `L ${pts[1].x} ${pts[1].y} `;
                    else {
                        for (let i = 0; i < pts.length - 1; i++) {
                            const p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];
                            d += `C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y} `;
                        }
                    }
                }
                svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" />`;
                if (obj.arrowStart && !obj.closed && pts.length > 1) {
                    const pA = pts[1]; const pB = pts[0];
                    const svgAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    svg += getSvgArrowHead(pB.x, pB.y, svgAngle, color, w, 1, obj.arrowStart);
                }
                if (obj.arrowEnd && !obj.closed && pts.length > 1) {
                    const pA = pts[pts.length - 2]; const pB = pts[pts.length - 1];
                    const svgAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    svg += getSvgArrowHead(pB.x, pB.y, svgAngle, color, w, 1, obj.arrowEnd);
                }
            }
        } else if (item.type === 'circle') {
            const center = getObjectById('point', obj.center_id), edge = getObjectById('point', obj.edge_id);
            if (center && edge) {
                const r = Math.hypot(edge.x - center.x, edge.y - center.y);
                svg += `<circle cx="${center.x}" cy="${center.y}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" />`;
            }
        } else if (item.type === 'arc') {
            const startX = obj.cx + obj.radius * Math.cos(obj.startAngle);
            const startY = obj.cy + obj.radius * Math.sin(obj.startAngle);
            const endX = obj.cx + obj.radius * Math.cos(obj.endAngle);
            const endY = obj.cy + obj.radius * Math.sin(obj.endAngle);

            let diff = obj.endAngle - obj.startAngle;
            if (obj.counterClockwise) { if (diff > 0) diff -= 2 * Math.PI; }
            else { if (diff < 0) diff += 2 * Math.PI; }

            const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
            const sweep = obj.counterClockwise ? 0 : 1;

            svg += `<path d="M ${startX} ${startY} A ${obj.radius} ${obj.radius} 0 ${largeArc} ${sweep} ${endX} ${endY}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
        } else if (item.type === 'rectangle') {
            const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
            if (p1 && p2) {
                const minX = Math.min(p1.x, p2.x), minY = Math.min(p1.y, p2.y);
                const wRect = Math.abs(p2.x - p1.x), hRect = Math.abs(p2.y - p1.y);
                svg += `<rect x="${minX}" y="${minY}" width="${wRect}" height="${hRect}" fill="${fill}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" />`;
            }
        } else if (item.type === 'segment') {
            const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
            if (p1 && p2) {
                let x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
                if (obj.lineType === 'droite' || obj.lineType === 'demi-droite') {
                    const dx = x2 - x1, dy = y2 - y1;
                    if (dx !== 0 || dy !== 0) {
                        const len = 100000;
                        const mag = Math.hypot(dx, dy);
                        const nx = dx / mag, ny = dy / mag;
                        const isDemi = (obj.lineType === 'demi-droite');
                        x1 = isDemi ? p1.x : p1.x - nx * len;
                        y1 = isDemi ? p1.y : p1.y - ny * len;
                        x2 = p2.x + nx * len;
                        y2 = p2.y + ny * len;
                    }
                }
                svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
                if (obj.arrowStart && (!obj.lineType || obj.lineType === 'segment')) {
                    const svgAngle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                    svg += getSvgArrowHead(p1.x, p1.y, svgAngle, color, w, 1, obj.arrowStart);
                }
                if (obj.arrowEnd && (!obj.lineType || obj.lineType === 'segment')) {
                    const svgAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    svg += getSvgArrowHead(p2.x, p2.y, svgAngle, color, w, 1, obj.arrowEnd);
                }
            }
        } else if (item.type === 'point') {
            if (hiddenPoints.has(obj.id)) return;
            const forme = formeDuPoint(obj);
            const s = 4;
            if (forme === 'circle') svg += `<circle cx="${obj.x}" cy="${obj.y}" r="${s}" fill="${color}" />`;
            else if (forme === 'square') svg += `<rect x="${obj.x - s}" y="${obj.y - s}" width="${s * 2}" height="${s * 2}" fill="${color}" />`;
            else if (forme === 'pixel') svg += `<rect x="${obj.x - 1.5}" y="${obj.y - 1.5}" width="3" height="3" fill="${color}" />`;
            else {
                svg += `<line x1="${obj.x - s}" y1="${obj.y - s}" x2="${obj.x + s}" y2="${obj.y + s}" stroke="${color}" stroke-width="2.5" />`;
                svg += `<line x1="${obj.x + s}" y1="${obj.y - s}" x2="${obj.x - s}" y2="${obj.y + s}" stroke="${color}" stroke-width="2.5" />`;
            }

        } else if (item.type === 'text') {
            if (obj.id !== editingTextId) {
                if (obj.mathImg) {
                    let transformAttr = "";
                    if (angle !== 0) {
                        const cx = obj.x + (obj.mathW / 2);
                        const cy = obj.y + (obj.mathH / 2);
                        transformAttr = ` transform="rotate(${angleDeg}, ${cx}, ${cy})"`;
                    }
                    svg += `<image href="${obj.mathImg.src}" x="${obj.x}" y="${obj.y}" width="${obj.mathW}" height="${obj.mathH}"${transformAttr} />`;
                } else {
                    const align = obj.align || 'left';
                    const fontSize = obj.fontSize || 24;
                    const fontFamily = obj.fontFamily || 'sans-serif';
                    const lineHeight = obj.lineHeight || Math.round(fontSize * 1.2);

                    // Même moteur de mise en page que le rendu à l'écran
                    const measureCtx = (typeof ctx !== 'undefined') ? ctx : null;
                    const layout = layoutTextObject(obj, measureCtx);
                    const lines = layout.lines;
                    let maxW = layout.width;

                    // Forcer une largeur minimale si c'est une bulle vide
                    if (obj.isBubble && maxW < 20) { maxW = 150; }

                    let transformAttr = "";
                    // Convention canvas : en centré sans largeur fixe, obj.x est le CENTRE du bloc
                    // Même convention qu'à l'écran (voir le rendu canvas)
                    const exX = (align === 'center' && !obj.fixedWidth && !obj.colWidth) ? obj.x - maxW / 2 : obj.x;
                    const cx = exX + (maxW / 2);
                    const blockH = Math.max(layout.height, obj.minHeight || 0);
                    const cy = obj.y + (blockH / 2);
                    if (angle !== 0) {
                        transformAttr = ` transform="rotate(${angleDeg}, ${cx}, ${cy})"`;
                    }

                    if (transformAttr !== "") svg += `<g${transformAttr}>`;

                    // 🌟 EXPORT VECTORIEL DES BULLES INTERACTIVES
                    if (obj.isBubble) {
                        let pad = obj.bubblePad !== undefined ? obj.bubblePad : 25;
                        let bw = maxW + pad * 2; let bh = blockH + pad * 2;
                        let bx = exX - pad; let by = obj.y - pad;

                        let locTailX = obj.tailX; let locTailY = obj.tailY;
                        if (angle !== 0) {
                            locTailX = Math.cos(-angle) * (obj.tailX - cx) - Math.sin(-angle) * (obj.tailY - cy) + cx;
                            locTailY = Math.sin(-angle) * (obj.tailX - cx) + Math.cos(-angle) * (obj.tailY - cy) + cy;
                        }

                        let angleT = Math.atan2(locTailY - cy, locTailX - cx);
                        let baseW = Math.min(25, bw / 3);
                        let tpx = Math.cos(angleT + Math.PI / 2) * baseW;
                        let tpy = Math.sin(angleT + Math.PI / 2) * baseW;

                        let queuePath = `M ${cx + tpx} ${cy + tpy} L ${locTailX} ${locTailY} L ${cx - tpx} ${cy - tpy} Z`;

                        let shapePath = "";
                        if (obj.bubbleShape === 'rect') {
                            shapePath = `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="15" ry="15" />`;
                        } else if (obj.bubbleShape === 'cloud') {
                            shapePath = `<ellipse cx="${cx}" cy="${cy}" rx="${bw / 2}" ry="${bh / 2}" />
                                         <circle cx="${cx - bw * 0.2}" cy="${cy - bh * 0.2}" r="${bw * 0.3}" />
                                         <circle cx="${cx + bw * 0.2}" cy="${cy - bh * 0.2}" r="${bw * 0.3}" />
                                         <circle cx="${cx - bw * 0.3}" cy="${cy + bh * 0.1}" r="${bw * 0.3}" />
                                         <circle cx="${cx + bw * 0.3}" cy="${cy + bh * 0.1}" r="${bw * 0.3}" />`;
                        } else {
                            shapePath = `<ellipse cx="${cx}" cy="${cy}" rx="${bw / 2}" ry="${bh / 2}" />`;
                        }

                        let bColor = obj.color || color;
                        let bFill = obj.fillColor || "#ffffff";
                        let bWidth = obj.borderWidth || 3;
                        let bDash = obj.bubbleShape === 'whisper' ? '8,8' : 'none';

                        // Le masque de Remplissage Opaque (Fill)
                        svg += `<g fill="${bFill}" stroke="none">
                                    <path d="${queuePath}" />
                                    ${shapePath}
                                </g>`;

                        // Le Contour Net (Stroke)
                        svg += `<g fill="none" stroke="${bColor}" stroke-width="${bWidth}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${bDash}">
                                    <path d="${queuePath}" />
                                    ${shapePath}
                                </g>`;
                    }

                    // Export du texte
                    lines.forEach((L) => {
                        const lineY = obj.y + L.y + (L.demiInterligne !== undefined
                            ? L.demiInterligne
                            : (L.size * 0.1) + (L.lineHeight - L.size * 1.2) / 2);
                        const alignL = L.align || align;
                        let curX = exX + L.indent;
                        if (alignL === 'center') curX = exX + (maxW - L.contentW) / 2;
                        else if (alignL === 'right') curX = exX + maxW - L.contentW;

                        if (L.marker) {
                            svg += `<text x="${curX}" y="${lineY}" font-family="${fontFamily}" font-size="${L.size}px" font-weight="${L.bold ? 'bold' : 'normal'}" fill="${color}" dominant-baseline="hanging" xml:space="preserve">${L.marker}</text>`;
                        }
                        curX += L.markerW;

                        svg += `<text x="${curX}" y="${lineY}" font-family="${fontFamily}" font-size="${L.size}px" dominant-baseline="hanging" xml:space="preserve">`;
                        L.segs.forEach(seg => {
                            const fw = (seg.style.bold || L.bold) ? 'bold' : 'normal';
                            const fs = seg.style.italic ? 'italic' : 'normal';
                            const td = seg.style.underline ? 'underline' : 'none';
                            const fc = seg.style.color || color;
                            const ff = seg.style.fontFamily ? ` font-family="${seg.style.fontFamily}"` : '';
                            const sz = seg.style.fontSize ? ` font-size="${seg.style.fontSize * (L.size / (obj.fontSize || 24))}px"` : '';
                            const escapedText = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                            svg += `<tspan font-weight="${fw}" font-style="${fs}" text-decoration="${td}" fill="${fc}"${ff}${sz}>${escapedText}</tspan>`;
                        });
                        svg += `</text>`;
                    });

                    if (transformAttr !== "") svg += `</g>`;
                }
            }
        }
    });

    // 🌟 EXPORT VECTORIEL DES INSTRUMENTS DE GÉOMÉTRIE (Widgets)
    if (typeof widgetZOrder !== 'undefined' && typeof activeWidgets !== 'undefined' && typeof widgets !== 'undefined') {
        widgetZOrder.forEach(type => {
            if (activeWidgets[type] && widgets[type] && typeof widgets[type].toSVG === 'function') {
                svg += widgets[type].toSVG();
            }
        });
    }

    svg += `</g></svg>`;
    return svg;
}
// ==========================================
// MOTEUR D'EXPORTATION INTELLIGENT
// ==========================================

const exportPopover = document.getElementById('export-popover');
const btnCapture = document.getElementById('btn-capture');

// --- 1. L'Algorithme Magique de Recadrage ---
function getAutoBoundingBox(padding = 40) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    function addPt(x, y) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        hasContent = true;
    }

    // Fonction pour récupérer un point par son ID en toute sécurité
    const checkPointId = (id) => { const p = getObjectById('point', id); if (p) addPt(p.x, p.y); };

    // On scanne tous les tableaux d'objets existants
    if (typeof points !== 'undefined') points.forEach(p => addPt(p.x, p.y));
    if (typeof freehands !== 'undefined') freehands.forEach(f => f.points.forEach(p => addPt(p.x, p.y)));
    if (typeof images !== 'undefined') images.forEach(img => { addPt(img.x, img.y); addPt(img.x + img.w, img.y + img.h); });
    if (typeof texts !== 'undefined') texts.forEach(t => { addPt(t.x, t.y); addPt(t.x + 300, t.y + 100); });
    if (typeof segments !== 'undefined') segments.forEach(s => { checkPointId(s.p1_id); checkPointId(s.p2_id); });
    if (typeof polygons !== 'undefined') polygons.forEach(poly => poly.points.forEach(checkPointId));
    if (typeof curves !== 'undefined') curves.forEach(c => c.points.forEach(checkPointId));
    if (typeof rectangles !== 'undefined') rectangles.forEach(r => { checkPointId(r.p1_id); checkPointId(r.p2_id); });
    if (typeof circles !== 'undefined') circles.forEach(c => {
        const center = getObjectById('point', c.center_id), edge = getObjectById('point', c.edge_id);
        if (center && edge) {
            const r = Math.hypot(edge.x - center.x, edge.y - center.y);
            addPt(center.x - r, center.y - r); addPt(center.x + r, center.y + r);
        }
    });

    // Si la page est vide, on crée une fausse zone au milieu
    if (!hasContent) return {
        startX: canvas.width / 2 - 200, startY: canvas.height / 2 - 200,
        endX: canvas.width / 2 + 200, endY: canvas.height / 2 + 200
    };

    // On convertit les coordonnées logiques en coordonnées écran (Zoom & Pan)
    return {
        startX: (minX - padding) * zoom + panX,
        startY: (minY - padding) * zoom + panY,
        endX: (maxX + padding) * zoom + panX,
        endY: (maxY + padding) * zoom + panY
    };
}

// --- 2. Clic sur l'appareil photo ---
// --- 2. Clic sur l'appareil photo (RETOUR AU MANUEL) ---
btnCapture.addEventListener('click', (e) => {
    isCropMode = true;
    cropRect = null; // On réinitialise pour te laisser dessiner la zone
    exportPopover.classList.remove('visible'); // On cache la modale !

    setMode('pointer');
    document.querySelectorAll('#bar-tools .btn').forEach(b => b.classList.remove('active'));

    showToast("✂️ Dessinez un rectangle pour capturer la zone");
    draw();
    e.stopPropagation();
    if (typeof closeAllPopups === 'function') closeAllPopups();
});

document.getElementById('btn-cancel-export').addEventListener('click', () => {
    isCropMode = false; cropRect = null; exportPopover.classList.remove('visible'); draw();
});



// --- 3. Fonction de Capture Améliorée (Qualité) ---
async function performCapture(action) {
    const keepBg = document.getElementById('export-bg').checked;

    // Gestion de la Qualité (si le menu n'existe pas, on met 2 par défaut)
    const qualitySelect = document.getElementById('export-quality');
    const qualityScale = qualitySelect ? parseInt(qualitySelect.value) : 2;

    const oldSel = [...selectedItems]; clearSelection();

    let oldAxes = showAxes;
    if (!keepBg) { showAxes = 0; isExportingTransparent = true; }

    const wasCropMode = isCropMode; const currentRect = cropRect;
    isCropMode = false;

    draw();

    let rx, ry, rw, rh;
    if (wasCropMode && currentRect) {
        rx = Math.min(currentRect.startX, currentRect.endX);
        ry = Math.min(currentRect.startY, currentRect.endY);
        rw = Math.abs(currentRect.endX - currentRect.startX);
        rh = Math.abs(currentRect.endY - currentRect.startY);
    } else {
        const box = getAutoBoundingBox(40);
        rx = box.startX;
        ry = box.startY;
        rw = box.endX - box.startX;
        rh = box.endY - box.startY;
    }

    // L'export SVG reste en Vectoriel (Qualité Infinie)
    if (action === 'svg') {
        const svgStr = generateSVGString({ x: rx, y: ry, w: rw, h: rh }, keepBg);
        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `AuTableau_${Date.now()}.svg`; 
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 500);
        showToast("Fichier SVG exporté !");

        selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
        cropRect = null; exportPopover.classList.remove('visible');
        syncStyleWithSelection(); draw();
        return;
    }

    // Rendu en image (PNG, PDF, Copie)
    setTimeout(async () => {
        const oldW = canvas.width; const oldH = canvas.height;
        const oldPanX = panX; const oldPanY = panY; const oldZoom = zoom;
        let targetCanvas;

        try {
            // On recadre physiquement le canvas principal sur la zone d'export
            canvas.width = rw * qualityScale;
            canvas.height = rh * qualityScale;
            panX = (oldPanX - rx) * qualityScale;
            panY = (oldPanY - ry) * qualityScale;
            zoom = oldZoom * qualityScale;
            
            draw();

            // On copie le résultat dans un canvas secondaire pour éviter les problèmes asynchrones
            targetCanvas = document.createElement('canvas');
            targetCanvas.width = canvas.width;
            targetCanvas.height = canvas.height;
            targetCanvas.getContext('2d').drawImage(canvas, 0, 0);
        } finally {
            // On restaure IMMÉDIATEMENT le vrai canvas pour éviter les clignotements
            canvas.width = oldW; canvas.height = oldH;
            panX = oldPanX; panY = oldPanY; zoom = oldZoom;
            
            selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
            cropRect = null; exportPopover.classList.remove('visible');
            syncStyleWithSelection(); draw();
        }

        if (action === 'png') {
            const data = targetCanvas.toDataURL("image/png");
            const a = document.createElement('a'); a.href = data; a.download = `AuTableau_${Date.now()}.png`; a.click();
            showToast("Image PNG exportée !");
        }
        else if (action === 'copy') {
            targetCanvas.toBlob(async (blob) => {
                try {
                    const item = new ClipboardItem({ "image/png": blob });
                    await navigator.clipboard.write([item]);
                    showToast("Image copiée dans le presse-papiers !");
                } catch (err) { showToast("Erreur lors de la copie."); console.error(err); }
            }, 'image/png');
        }
        else if (action === 'pdf') {
            if (window.jspdf && window.jspdf.jsPDF) {
                const dataUrl = targetCanvas.toDataURL("image/jpeg", 1.0);
                const pdf = new window.jspdf.jsPDF({ orientation: rw > rh ? 'landscape' : 'portrait', unit: 'px', format: [rw, rh] });
                pdf.addImage(dataUrl, 'JPEG', 0, 0, rw, rh);
                pdf.save(`AuTableau_${Date.now()}.pdf`);
                showToast("Fichier PDF exporté !");
            } else { showToast("Erreur : Moteur PDF non chargé."); }
        }
        else if (action === 'pdf-vector') {
            console.log("=== EXPORT VECTORIEL (1 page) ===");
            console.log("window.jspdf présent:", !!window.jspdf);

            if (window.jspdf || window.jsPDF) {
                const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
                const pdfObj = new jsPDF({ orientation: rw > rh ? 'l' : 'p', unit: 'px', format: [rw, rh] });

                try {
                    // Police intégrée en base64 (corrige les accents, fonctionne aussi en file://)
                    if (!window.NUNITO_FONT_BASE64) throw new Error('Police Nunito non chargée');
                    pdfObj.addFileToVFS('Nunito-Regular.ttf', window.NUNITO_FONT_BASE64);
                    pdfObj.addFont('Nunito-Regular.ttf', 'Nunito', 'normal');
                    pdfObj.addFont('Nunito-Regular.ttf', 'sans-serif', 'normal');
                    pdfObj.addFont('Nunito-Regular.ttf', 'Helvetica', 'normal');
                    pdfObj.addFont('Nunito-Regular.ttf', 'Arial', 'normal');
                    pdfObj.addFont('Nunito-Regular.ttf', 'Verdana', 'normal');
                    pdfObj.addFont('Nunito-Regular.ttf', 'Tahoma', 'normal');
                } catch (err) {
                    console.warn("Impossible de charger la police UTF-8, les accents pourraient être corrompus", err);
                }

                console.log("typeof pdfObj.svg:", typeof pdfObj.svg);
                if (typeof pdfObj.svg !== 'function') {
                    console.error("Erreur critique : pdfObj.svg n'est pas une fonction. jsPDF ne trouve pas svg2pdf.");
                    return showToast("Erreur : svg2pdf n'est pas correctement chargé.");
                }

                let useHybrid = false;
                const pData = pages[currentPageIndex];
                let pdfBgImg = null;
                // Note: fusion PDF désactivée (PDFs stockés comme métadonnées, pas données binaires)
                // if (pData && pData.sourcePdfData && window.PDFLib) {
                //     pdfBgImg = pData.images.find(img => img.isBg) || (pData.images.length > 0 ? pData.images[0] : null);
                //     if (pdfBgImg) useHybrid = true;
                // }

                const oldImages = [...images];
                if (useHybrid) {
                    images = images.filter(img => img.id !== pdfBgImg.id);
                }

                const svgStr = generateSVGString({ x: rx, y: ry, w: rw, h: rh }, useHybrid ? false : keepBg);
                
                if (useHybrid) images = oldImages;

                console.log("Longueur du SVG généré:", svgStr.length);
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgStr, "image/svg+xml");
                const svgElement = svgDoc.documentElement;

                svgElement.style.position = 'absolute';
                svgElement.style.top = '-9999px';
                svgElement.style.left = '-9999px';
                document.body.appendChild(svgElement);

                console.log("Lancement de pdfObj.svg()...");
                pdfObj.svg(svgElement, { x: 0, y: 0, width: rw, height: rh }).then(async () => {
                    console.log("Génération terminée avec succès.");
                    document.body.removeChild(svgElement);
                    
                    if (useHybrid) {
                        try {
                            showToast("Fusion avec le PDF d'origine... ⏳");
                            const annotPdfBytes = pdfObj.output('arraybuffer');
                            
                            const { PDFDocument } = window.PDFLib;
                            const sourceDoc = await PDFDocument.load(pData.sourcePdfData);
                            const mergedDoc = await PDFDocument.create();
                            
                            const [copiedPage] = await mergedDoc.copyPages(sourceDoc, [pData.sourcePdfPageNum || 0]);
                            const mergedPage = mergedDoc.addPage(copiedPage);
                            
                            // Approche 100% robuste pour pdf-lib :
                            const annotDocLib = await PDFDocument.load(annotPdfBytes);
                            const [copiedAnnotPage] = await mergedDoc.copyPages(annotDocLib, [0]);
                            const annotEmbeddedPage = await mergedDoc.embedPage(copiedAnnotPage);
                            
                            const imgStartX = (pdfBgImg.x) * zoom + panX;
                            const imgStartY = (pdfBgImg.y) * zoom + panY;
                            const imgW = pdfBgImg.w * zoom;
                            const imgH = pdfBgImg.h * zoom;
                            
                            const drawX = (rx - imgStartX) / imgW * mergedPage.getWidth();
                            const drawY = mergedPage.getHeight() - (ry + rh - imgStartY) / imgH * mergedPage.getHeight();
                            const drawW = rw / imgW * mergedPage.getWidth();
                            const drawH = rh / imgH * mergedPage.getHeight();
                            
                            mergedPage.drawPage(annotEmbeddedPage, { x: drawX, y: drawY, width: drawW, height: drawH });
                            
                            if (wasCropMode) {
                                mergedPage.setCropBox(drawX, drawY, drawW, drawH);
                            }
                            
                            const finalPdfBytes = await mergedDoc.save();
                            const blob = new Blob([finalPdfBytes], { type: "application/pdf" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a'); 
                            a.href = url; 
                            a.download = `AuTableau_Hybride_${Date.now()}.pdf`; 
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                            }, 500);
                            showToast("Fichier PDF vectoriel exporté !");
                        } catch (err) {
                            console.error("Erreur hybrid:", err);
                            showToast("Erreur lors de la fusion vectorielle.");
                            pdfObj.save(`AuTableau_Vect_${Date.now()}.pdf`);
                        }
                    } else {
                        pdfObj.save(`AuTableau_Vect_${Date.now()}.pdf`);
                        showToast("Fichier PDF vectoriel exporté !");
                    }
                }).catch(err => {
                    if (document.body.contains(svgElement)) document.body.removeChild(svgElement);
                    showToast("Erreur lors de la génération vectorielle.");
                    console.error("Erreur dans pdfObj.svg() :", err);
                });
            } else {
                console.error("Erreur : jsPDF non trouvé.");
                showToast("Erreur : Moteur PDF non chargé.");
            }
        }

        selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
        isCropMode = false; cropRect = null; exportPopover.classList.remove('visible');
        syncStyleWithSelection(); draw();
    }, 100);
}

// Lier les boutons aux actions
// ==========================================
// 2. NOUVEL ASSISTANT D'EXPORTATION 
// ==========================================
const btnExportPage = document.getElementById('btn-export-page');
let selectedFormat = null;
let selectedScope = 'page';

function updateExportButtonLabel() {
    const btn = document.getElementById('btn-do-export');
    if (!btn) return;
    btn.innerText = selectedScope === 'all' ? 'Exporter TOUTES les pages' : 'Exporter la page';
}

// Action A : Bouton "Recadrer une zone"
if (btnCapture) {
    btnCapture.addEventListener('click', (e) => {
        isCropMode = true;
        cropRect = null;
        if (exportPopover) exportPopover.classList.remove('visible');

        const title = document.getElementById('export-popover-title');
        if (title) title.innerText = "Exporter une zone";

        setMode('pointer');
        document.querySelectorAll('#bar-tools .btn').forEach(b => b.classList.remove('active'));

        showToast("✂️ Dessinez un rectangle pour capturer la zone");
        draw();
        e.stopPropagation();
        if (typeof closeAllPopups === 'function') closeAllPopups();
    });
}

// Action B : Bouton "Exporter la page courante"
if (btnExportPage) {
    btnExportPage.addEventListener('click', (e) => {
        isCropMode = false;
        cropRect = null;

        const title = document.getElementById('export-popover-title');
        if (title) title.innerText = "Exporter la page courante";

        if (typeof closeAllPopups === 'function') closeAllPopups();
        if (exportPopover) exportPopover.classList.add('visible');
        e.stopPropagation();
    });
}

// Logique de sélection du format
document.querySelectorAll('.btn-format-choice').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedFormat = btn.dataset.format;

        // Mise en forme visuelle
        document.querySelectorAll('.btn-format-choice').forEach(b => b.style.borderColor = '#dfe6e9');
        btn.style.borderColor = '#0984e3';

        // Mise à jour de l'interface
        const desc = document.getElementById('format-description');
        const settings = document.getElementById('settings-png-pdf');
        const scopeContainer = document.getElementById('export-scope-container');
        const supportsMultiPage = (selectedFormat === 'pdf' || selectedFormat === 'pdf-vector');

        if (scopeContainer) scopeContainer.style.display = supportsMultiPage ? 'block' : 'none';
        if (!supportsMultiPage) {
            selectedScope = 'page';
            document.querySelectorAll('.btn-scope-choice').forEach(b => {
                b.style.borderColor = b.dataset.scope === 'page' ? '#0984e3' : '#dfe6e9';
            });
        }
        updateExportButtonLabel();

        if (selectedFormat === 'png') {
            desc.innerText = "PNG : Idéal pour intégrer dans un document ou partager sur le web.";
            settings.style.display = 'block';
        } else if (selectedFormat === 'svg') {
            desc.innerText = "SVG : Format vectoriel parfait pour imprimer en grand ou modifier plus tard.";
            settings.style.display = 'none';
        } else if (selectedFormat === 'pdf') {
            desc.innerText = "PDF : Format image classique, idéal pour archiver ou imprimer.";
            settings.style.display = 'block';
        } else if (selectedFormat === 'pdf-vector') {
            desc.innerText = "PDF Vect. : PDF vectoriel pur. Attention: les plugins complexes ne seront pas visibles.";
            settings.style.display = 'none'; // Pas besoin de qualité x2 pour du vectoriel
        }
    });
});

// Logique de sélection de la portée (page actuelle / toutes les pages)
document.querySelectorAll('.btn-scope-choice').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedScope = btn.dataset.scope;
        document.querySelectorAll('.btn-scope-choice').forEach(b => b.style.borderColor = '#dfe6e9');
        btn.style.borderColor = '#0984e3';
        updateExportButtonLabel();
    });
});

// Bouton Annuler
const btnCancelExport = document.getElementById('btn-cancel-export');
if (btnCancelExport) {
    btnCancelExport.addEventListener('click', () => {
        isCropMode = false; cropRect = null;
        if (exportPopover) exportPopover.classList.remove('visible');
        draw();
    });
}

// Bouton Exporter final
const btnDoExport = document.getElementById('btn-do-export');
if (btnDoExport) {
    btnDoExport.addEventListener('click', () => {
        if (!selectedFormat) return showToast("Veuillez choisir un format !");
        if (selectedScope === 'all' && (selectedFormat === 'pdf' || selectedFormat === 'pdf-vector')) {
            exportAllPagesPdf();
        } else {
            performCapture(selectedFormat);
        }
    });
}


// --- 4. LE BOUTON MAGIQUE : PDF DE TOUTES LES PAGES ---
async function exportAllPagesPdf() {
        if (!window.jspdf || !window.jspdf.jsPDF) return showToast("Erreur : Moteur PDF non chargé.");

        showToast("Génération du PDF complet en cours... ⏳");

        const qualitySelect = document.getElementById('export-quality');
        const qualityScale = qualitySelect ? parseInt(qualitySelect.value) : 2;
        const keepBg = document.getElementById('export-bg').checked;

        // 1. On sécurise et mémorise l'état de départ
        syncPage();
        const startIndex = currentPageIndex;
        const oldSel = [...selectedItems];
        let oldAxes = showAxes;
        const wasCropMode = isCropMode;

        let pdf = null;

        // 2. Boucle de capture sur toutes les pages
        for (let i = 0; i < pages.length; i++) {
            // C'EST ICI LA CORRECTION DU BUG !
            // loadPage() gère tout tout seul, il ne faut surtout pas forcer currentPageIndex
            loadPage(i);

            // Préparation visuelle (pas de cadres de sélection, pas de fond si demandé)
            clearSelection();
            if (!keepBg) { showAxes = 0; isExportingTransparent = true; }
            isCropMode = false;

            // Recadrage auto INVISIBLE pour chaque page !
            const box = getAutoBoundingBox(40);
            let rx = box.startX, ry = box.startY;
            let rw = Math.abs(box.endX - box.startX);
            let rh = Math.abs(box.endY - box.startY);

            // Sécurité : si la page est vraiment vide
            if (rw < 50) rw = canvas.width;
            if (rh < 50) rh = canvas.height;

            draw();

            // Petite pause pour garantir que le canvas a fini de charger les formules et images
            await new Promise(r => setTimeout(r, 100));

            // Ajout dans le document PDF
            if (!pdf) {
                pdf = new window.jspdf.jsPDF({ orientation: rw > rh ? 'landscape' : 'portrait', unit: 'px', format: [rw, rh] });

                if (selectedFormat === 'pdf-vector') {
                    try {
                        if (!window.NUNITO_FONT_BASE64) throw new Error('Police Nunito non chargée');
                        pdf.addFileToVFS('Nunito-Regular.ttf', window.NUNITO_FONT_BASE64);
                        pdf.addFont('Nunito-Regular.ttf', 'sans-serif', 'normal');
                        pdf.addFont('Nunito-Regular.ttf', 'Arial', 'normal');
                        pdf.addFont('Nunito-Regular.ttf', 'Verdana', 'normal');
                        pdf.addFont('Nunito-Regular.ttf', 'Tahoma', 'normal');
                    } catch (err) {
                        console.warn("Impossible de charger la police UTF-8", err);
                    }
                }
            } else {
                pdf.addPage([rw, rh], rw > rh ? 'landscape' : 'portrait');
            }

            if (selectedFormat === 'pdf-vector' && typeof pdf.svg === 'function') {
                console.log(`=== EXPORT VECTORIEL (PAGE ${i + 1}/${pages.length}) ===`);
                const svgStr = generateSVGString({ x: rx, y: ry, w: rw, h: rh }, keepBg);
                console.log("Longueur du SVG généré:", svgStr.length);
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgStr, "image/svg+xml");
                const svgElement = svgDoc.documentElement;

                svgElement.style.position = 'absolute';
                svgElement.style.top = '-9999px';
                svgElement.style.left = '-9999px';
                document.body.appendChild(svgElement);

                try {
                    console.log("Lancement de pdf.svg()...");
                    await pdf.svg(svgElement, { x: 0, y: 0, width: rw, height: rh });
                    console.log("Génération terminée avec succès.");
                } catch (e) { console.error("Erreur svg2pdf", e); }
                document.body.removeChild(svgElement);
            } else {
                if (selectedFormat === 'pdf-vector') {
                    console.warn(`Fallback bitmap utilisé pour la page ${i + 1} car pdf.svg n'est pas une fonction.`);
                }
                const tempC = document.createElement('canvas');
                tempC.width = rw * qualityScale;
                tempC.height = rh * qualityScale;
                const tCtx = tempC.getContext('2d');
                tCtx.scale(qualityScale, qualityScale);
                tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
                pdf.addImage(tempC.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, rw, rh);
            }
        }

        // 3. Restauration parfaite de l'état initial
        loadPage(startIndex);

        selectedItems = oldSel;
        showAxes = oldAxes;
        isExportingTransparent = false;
        isCropMode = wasCropMode;
        cropRect = null;

        const exportPopover = document.getElementById('export-popover');
        if (exportPopover) exportPopover.classList.remove('visible');

        draw();

        pdf.save(`AuTableau_Complet_${Date.now()}.pdf`);
        showToast("✅ PDF Multi-pages téléchargé !");
}
// --- HELPER DYNAMIQUE POUR L'EDITEUR WYSIWYG ---
function updateWysiwygPosition() {
    if (wysiwygText.style.display === 'block') {
        let currentSize = activeStyle.fontSize;
        let currentFont = activeStyle.fontFamily || 'sans-serif';
        let currentAlign = activeStyle.textAlign || 'left';
        let currentColor = couleurBlocSaisie || activeStyle.strokeColor;
        let anchorX = null, anchorY = null, fixedW = 0, colW = 0;

        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) {
                currentSize = t.fontSize || activeStyle.fontSize;
                currentFont = t.fontFamily || 'sans-serif';
                currentAlign = t.align || 'left';
                currentColor = t.color || t.strokeColor || activeStyle.strokeColor;
                anchorX = t.x; anchorY = t.y; fixedW = t.fixedWidth || 0;
                colW = t.colWidth || 0;
            }
        } else if (tempTextLogicalPos) {
            anchorX = tempTextLogicalPos.x; anchorY = tempTextLogicalPos.y;
            fixedW = tempTextLogicalPos.fixedWidth || 0;
            colW = tempTextLogicalPos.colWidth || 0;
        }

        // Colonne : la saisie se replie exactement comme le rendu final
        if (colW > 0) {
            wysiwygText.style.whiteSpace = 'pre-wrap';
            wysiwygText.style.width = (colW * zoom) + 'px';
            wysiwygText.style.maxWidth = 'none';
        } else {
            wysiwygText.style.whiteSpace = 'nowrap';
            wysiwygText.style.width = 'auto';
        }

        wysiwygText.style.fontSize = (currentSize * zoom) + 'px';
        wysiwygText.style.fontFamily = currentFont;
        let currentLH = activeStyle.lineHeight || Math.round(currentSize * 1.2);
        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t && t.lineHeight) currentLH = t.lineHeight;
        }
        appliquerInterligneSaisie(currentLH, currentSize);
        wysiwygText.style.color = currentColor;
        wysiwygText.style.textAlign = currentAlign;
        wysiwygText.style.transform = `translate(0, 0)`;

        // Même convention que le rendu canvas : en centré (sans largeur fixe), x est le CENTRE du texte.
        // La police/taille sont posées AVANT la mesure d'offsetWidth pour que la largeur soit juste.
        if (anchorX !== null) {
            let left = anchorX * zoom + panX;
            if (currentAlign === 'center' && !colW) left = (anchorX + fixedW / 2) * zoom + panX - wysiwygText.offsetWidth / 2;
            wysiwygText.style.left = left + 'px';
            wysiwygText.style.top = (anchorY * zoom + panY) + 'px';
        }
    }
    if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
    if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
}
function toggleLoupe() {
    isLoupeActive = !isLoupeActive;

    // Met à jour l'apparence du bouton s'il existe
    const btnLoupe = document.getElementById('btn-loupe');
    if (btnLoupe) {
        btnLoupe.classList.toggle('active', isLoupeActive);
    }

    requestAnimationFrame(draw);
}
// ===================================================
// LES RACCOURCIS DES OUTILS
// Une seule table : elle sert à la fois à écouter le clavier, à écrire la
// touche dans l'infobulle du bouton et à remplir l'aide. Ajouter un outil,
// c'est ajouter une ligne ici — rien d'autre à tenir à jour.
//
// Les outils de tous les jours prennent une lettre (l'initiale quand elle
// est libre), la géométrie prend les chiffres : ils forment une famille et
// se trouvent sans quitter la rangée du haut.
// ===================================================
const RACCOURCIS_OUTILS = [
    { touche: 'S', mode: 'pointer', nom: 'Sélection' },
    { touche: 'M', mode: 'move', nom: 'Main (déplacer la vue)' },
    { touche: 'C', mode: 'freehand', nom: 'Crayon' },
    { touche: 'U', mode: 'highlighter', nom: 'Surligneur' },
    { touche: 'G', mode: 'eraser', nom: 'Gomme' },
    { touche: 'T', mode: 'text', nom: 'Texte' },
    { touche: 'N', mode: 'postit', nom: 'Note (post-it)' },
    { touche: 'P', mode: 'laser', nom: 'Pointeur laser' },
    { touche: 'Z', mode: 'zoom-box', nom: 'Zoom sur une sélection' },
    { touche: '1', mode: 'point', nom: 'Point' },
    { touche: '2', mode: 'segment', nom: 'Segment' },
    { touche: '3', mode: 'droite', nom: 'Droite' },
    { touche: '4', mode: 'demi-droite', nom: 'Demi-droite' },
    { touche: '5', mode: 'circle', nom: 'Cercle' },
    { touche: '6', mode: 'rectangle', nom: 'Rectangle' },
    { touche: '7', mode: 'polygon', nom: 'Polygone' },
    { touche: '8', mode: 'curve', nom: 'Courbe' }
];

// Les gestes qui ne changent pas d'outil mais qu'on veut sous la main
const RACCOURCIS_GESTES = [
    { touche: 'L', bouton: 'btn-loupe', nom: 'Loupe' },
    { touche: 'A', bouton: 'btn-magnet', nom: 'Aimant' },
    { touche: 'X', bouton: 'btn-axes', nom: 'Axes' },
    { touche: 'F', bouton: 'btn-cycle', nom: 'Fond suivant' },
    { touche: 'R', bouton: 'btn-rideau', nom: 'Rideau' },
    { touche: 'E', bouton: 'btn-spot', nom: 'Projecteur (éclairer une zone)' }
];

// On ne détourne pas une frappe quand l'utilisateur écrit, ni quand une
// fenêtre est ouverte par-dessus le tableau.
function onEcritAilleurs(e) {
    // La cible de l'événement, mais aussi ce qui a vraiment le curseur :
    // certains claviers virtuels envoient la frappe à la fenêtre.
    const champ = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    if (champ(e.target) || champ(document.activeElement)) return true;
    if (typeof editingTextId !== 'undefined' && editingTextId) return true;
    // Les modales dorment dans la page en display:none : seule celle qu'on
    // voit vraiment doit garder le clavier pour elle. (Elles sont en position
    // fixe : « offsetParent » y vaut toujours null, il ne dit rien.)
    return Array.from(document.querySelectorAll('.modal-backdrop, #avatar-atelier, #points-widget'))
        .some(m => m.getClientRects().length > 0);
}

function declencherRaccourci(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
    if (onEcritAilleurs(e)) return false;

    const t = (e.key || '').toUpperCase();

    const outil = RACCOURCIS_OUTILS.find(r => r.touche === t);
    if (outil) {
        // On clique le vrai bouton : le post-it, la gomme et les autres ont
        // chacun leur petite cérémonie, on ne la refait pas ici.
        const btn = document.querySelector('.btn[data-mode="' + outil.mode + '"]');
        if (btn) btn.click();
        else setMode(outil.mode);
        if (typeof showToast === 'function') showToast(outil.nom);
        return true;
    }

    const geste = RACCOURCIS_GESTES.find(r => r.touche === t);
    if (geste) {
        const btn = document.getElementById(geste.bouton);
        if (btn) { btn.click(); return true; }
    }
    return false;
}

// L'aide se remplit depuis la même table : elle ne peut pas raconter
// autre chose que ce que le clavier fait vraiment.
function remplirAideRaccourcis() {
    const peindre = (id, lignes) => {
        const cible = document.getElementById(id);
        if (!cible) return;
        cible.innerHTML = lignes.map(r => `<div><code>${r.touche}</code> ${r.nom}</div>`).join('');
    };
    peindre('aide-raccourcis-outils', RACCOURCIS_OUTILS);
    peindre('aide-raccourcis-gestes', RACCOURCIS_GESTES);
}

// La touche s'écrit dans l'infobulle du bouton, dans un attribut à part :
// « data-tooltip » sert aussi de nom d'outil sous l'icône, il doit rester net.
function poserRaccourcisSurLesBoutons() {
    RACCOURCIS_OUTILS.forEach(r => {
        document.querySelectorAll('.btn[data-mode="' + r.mode + '"]')
            .forEach(b => b.setAttribute('data-raccourci', r.touche));
    });
    RACCOURCIS_GESTES.forEach(r => {
        const b = document.getElementById(r.bouton);
        if (b) b.setAttribute('data-raccourci', r.touche);
    });
}

// --- GESTION CLAVIER ---
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (declencherRaccourci(e)) { e.preventDefault(); return; }
    if (mode === 'randomClock') {
        setMode('pointer');

        document
            .querySelectorAll('#bar-tools .btn, #bar-plugins .btn')
            .forEach(btn => btn.classList.remove('active'));

        draw();

        return;
    }
    if (e.key === 'Escape' || e.key === 'Backspace') {
        if (isCropMode) { isCropMode = false; cropRect = null; exportPopover.classList.remove('visible'); draw(); return; }
        let canceledSomething = false;
        if (mode === 'polygon' && currentPolygonPoints.length > 0) { currentPolygonPoints.pop(); canceledSomething = true; }
        else if (mode === 'curve' && currentCurvePoints.length > 0) { currentCurvePoints.pop(); canceledSomething = true; }
        else if ((mode === 'segment' || mode === 'droite' || mode === 'demi-droite' || mode === 'circle' || mode === 'rectangle') && creationStartPointId !== null) { creationStartPointId = null; canceledSomething = true; }
        if (canceledSomething) { mouseLogicalPos = null; draw(); if (e.key === 'Backspace') e.preventDefault(); return; }

        // L'aide annonce « Échap : quitter le mode spécial ». Sans ceci, on
        // restait coincé en laser, gomme ou surligneur jusqu'à retrouver le
        // bouton flèche.
        if (e.key === 'Escape' && mode !== 'pointer'
            && !(typeof unMenuEstOuvert === 'function' && unMenuEstOuvert())) {
            setMode('pointer');
            document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn, #plugins-grid .btn')
                .forEach(b => b.classList.remove('active'));
            draw();
            return;
        }
    }
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); undo(); }
        if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); }
        if ((e.key === 'd' || e.key === 'D') && selectedItems.length > 0) { e.preventDefault(); duplicateSelection(); }
    }
    if (e.code === 'Space') { e.preventDefault(); isSpacePressed = true; updateCursor(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length > 0) {
        deleteSelection();
    }
});



// On cache la barre quand on a fini
wysiwygText.addEventListener('blur', () => { textToolbar.style.display = 'none'; if (typeof fermerTiroirsTexte === 'function') fermerTiroirsTexte(); });

window.addEventListener('keyup', (e) => {

    if (e.code === 'Space') { isSpacePressed = false; isPanningView = false; updateCursor(); }
});

// --- GLISSER DEPOSER IMAGE ET PDF ---
// --- GLISSER DEPOSER IMAGE ET PDF ---
const dropOverlay = document.getElementById('drop-overlay');
const dragGhost = document.getElementById('drag-ghost');
const transparentDragImage = (() => {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    return img;
})();
const pluginDragPlaceholder = document.createElement('div');
pluginDragPlaceholder.className = 'placeholder';
let draggedPluginTool = null;

function setDragGhostFromButton(button, x, y) {
    if (!dragGhost || !button) return;
    const svg = button.querySelector('svg');
    if (svg) {
        dragGhost.innerHTML = svg.outerHTML;
    }
    dragGhost.style.display = 'flex';
    dragGhost.style.left = `${Math.round(x - 22)}px`;
    dragGhost.style.top = `${Math.round(y - 22)}px`;
}

function hideDragGhost() {
    if (!dragGhost) return;
    dragGhost.style.display = 'none';
    dragGhost.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="ico sm" viewBox="0 0 24 24"></svg>';
}

function moveDragGhost(x, y) {
    if (!dragGhost || dragGhost.style.display === 'none') return;
    dragGhost.style.left = `${Math.round(x - 22)}px`;
    dragGhost.style.top = `${Math.round(y - 22)}px`;
}

function bindPluginDragGhost(button, toolId) {
    if (!button || button.dataset.dragGhostBound === 'true') return;
    button.dataset.dragGhostBound = 'true';
    button.removeAttribute('draggable');

    let holdTimer = null;
    button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.fav-star')) return;

        const normalizedId = normalizePluginId(toolId || button.dataset.pluginKey || button.getAttribute('data-tooltip') || button.title);
        if (!normalizedId) return;

        button.dataset.pluginKey = normalizedId;
        const sourceKind = button.dataset.dragSourceKind ||
            (button.closest('.cwrap') ? 'floating-toolbar' :
                (button.closest('#favorites-list') ? 'favorites' :
                    (button.closest('#bar-tools') ? 'system-toolbar' : 'drawer')));

        const sourceToolbarId = button.dataset.dragSourceToolbarId || button.closest('.cwrap')?.dataset.toolbarId || '';
        const sourceContainer = button.closest('.cwrap') || button.closest('#favorites-list') || button.closest('#plugins-grid') || button.closest('#bar-tools');
        let isCopy = sourceKind !== 'floating-toolbar';
        if (sourceToolbarId) {
            const tbData = getStoredFloatingToolbars().find(t => t.id === sourceToolbarId);
            if (tbData && tbData.protected) {
                isCopy = false;
            }
        }

        e.stopPropagation();
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            draggedPluginTool = {
                id: normalizedId,
                el: button,
                source: sourceContainer,
                sourceKind,
                sourceToolbarId,
                isCopy
            };

            if (!isCopy) {
                button.classList.add('is-held');
                button.style.display = 'none';
            }
            setDragGhostFromButton(button, e.clientX, e.clientY);
            setFloatingGhostState(false);
        }, 400);
    });

    button.addEventListener('pointermove', () => {
        if (!draggedPluginTool) clearTimeout(holdTimer);
    });

    const clearHold = () => {
        clearTimeout(holdTimer);
        if (!draggedPluginTool) button.classList.remove('is-held');
    };

    button.addEventListener('pointerup', clearHold);
    button.addEventListener('pointercancel', clearHold);
}

function setFloatingGhostState(active) {
    if (!dragGhost) return;
    dragGhost.classList.toggle('integrating', !!active);
}

function getFavoriteToolIds() {
    return JSON.parse(localStorage.getItem('board_favorites') || '[]');
}

function saveFavoriteToolIds(favs) {
    localStorage.setItem('board_favorites', JSON.stringify(favs));
}

function togglePluginFavorite(event, toolId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const normalizedId = normalizePluginId(toolId);
    if (!normalizedId) return;

    let favs = getFavoriteToolIds();
    if (favs.includes(normalizedId)) favs = favs.filter(id => id !== normalizedId);
    else favs.push(normalizedId);

    saveFavoriteToolIds(favs);
    syncDrawerFavoriteStars();
    renderFavorites();

    const activeTab = document.querySelector('#plugin-tabs .btn.active');
    if (activeTab?.dataset.cat === 'fav') {
        applyPluginDrawerFilter('fav');
    }
}

function syncDrawerFavoriteStars() {
    const favs = new Set(getFavoriteToolIds().map(normalizePluginId));
    document.querySelectorAll('#plugins-grid .btn').forEach(btn => {
        const toolId = normalizePluginId(btn.getAttribute('data-tooltip') || btn.title || btn.dataset.pluginId || btn.dataset.mode || '');
        if (!toolId) return;

        btn.classList.toggle('is-fav', favs.has(toolId));
        btn.querySelectorAll('.fav-star').forEach((star) => star.remove());
    });
}

function applyPluginDrawerFilter(categoryId) {
    const pluginsGrid = document.getElementById('plugins-grid');
    if (!pluginsGrid) return;

    const favs = new Set(getFavoriteToolIds().map(normalizePluginId));
    pluginsGrid.querySelectorAll('.btn').forEach((btn) => {
        const category = btn.dataset.category || btn.dataset.cat || '';
        const toolId = normalizePluginId(btn.dataset.pluginKey || btn.dataset.pluginId || btn.getAttribute('data-tooltip') || btn.title || '');
        let shouldShow = false;

        if (categoryId === 'fav') shouldShow = favs.has(toolId);
        else shouldShow = category === categoryId;

        btn.style.display = shouldShow ? 'flex' : 'none';
    });
}

function ensureFavoritesTab() {
    const tabContainer = document.getElementById('plugin-tabs');
    const favoritesToolbar = document.getElementById('favorites-toolbar');
    const pluginsGrid = document.getElementById('plugins-grid');
    if (!tabContainer || !favoritesToolbar || !pluginsGrid) return;

    let favTab = tabContainer.querySelector('[data-cat="fav"]');
    if (!favTab) {
        favTab = document.createElement('button');
        favTab.className = 'btn';
        favTab.dataset.cat = 'fav';
        favTab.title = 'Favoris';
        favTab.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="stroke-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
        tabContainer.prepend(favTab);
    } else if (tabContainer.firstElementChild !== favTab) {
        tabContainer.prepend(favTab);
    }

    const activateTab = (targetBtn) => {
        tabContainer.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
        if (targetBtn) targetBtn.classList.add('active');
    };

    const showFavorites = () => {
        activateTab(favTab);
        favoritesToolbar.style.display = 'none';
        pluginsGrid.style.display = 'none';
        pluginsGrid.style.display = 'flex';
        applyPluginDrawerFilter('fav');
        localStorage.setItem('drawer_favorites_view', 'true');
    };

    const showCategory = (categoryId, targetBtn) => {
        activateTab(targetBtn);
        favoritesToolbar.style.display = 'none';
        pluginsGrid.style.display = 'flex';
        applyPluginDrawerFilter(categoryId);
        localStorage.setItem('drawer_favorites_view', 'false');
        localStorage.setItem('drawer_active_category', categoryId);
    };

    if (tabContainer.dataset.favoritesTabBound !== 'true') {
        tabContainer.dataset.favoritesTabBound = 'true';
        tabContainer.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.btn');
            if (!targetBtn) return;
            e.preventDefault();
            e.stopPropagation();
            if (targetBtn.dataset.cat === 'fav') {
                showFavorites();
                return;
            }
            showCategory(targetBtn.dataset.cat, targetBtn);
        }, true);

        const tabObserver = new MutationObserver(() => {
            const currentFav = tabContainer.querySelector('[data-cat="fav"]');
            if (currentFav && tabContainer.firstElementChild !== currentFav) {
                tabContainer.prepend(currentFav);
            }
        });
        tabObserver.observe(tabContainer, { childList: true });
    }

    if (localStorage.getItem('drawer_favorites_view') === 'true') showFavorites();
    else {
        const savedCategory = localStorage.getItem('drawer_active_category');
        const activeCategoryBtn = (savedCategory && tabContainer.querySelector(`.btn[data-cat="${savedCategory}"]`)) || tabContainer.querySelector('.btn[data-cat]:not([data-cat="fav"])');
        if (activeCategoryBtn) showCategory(activeCategoryBtn.dataset.cat, activeCategoryBtn);
    }
}

function initSystemToolbarDragBridge() {
    const toolsBar = document.getElementById('bar-tools');
    if (!toolsBar || toolsBar.dataset.systemDragBound === 'true') return;
    toolsBar.dataset.systemDragBound = 'true';

    toolsBar.querySelectorAll('.btn').forEach((btn) => {
        const mode = btn.dataset.mode || '';
        const widget = btn.dataset.widget || '';
        const btnId = btn.id || '';
        const tooltip = btn.title || '';
        const keySource = mode || widget || btnId || tooltip;
        if (!keySource) return;
        const toolKey = normalizePluginId(`system:${keySource}`);
        btn.dataset.dragSourceKind = 'system-toolbar';
        btn.dataset.pluginKey = toolKey;
        bindPluginDragGhost(btn, toolKey);
    });
}

function bindDrawerFavoriteStars() {
    const grid = document.getElementById('plugins-grid');
    if (!grid || grid.dataset.favStarsBound === 'true') return;
    grid.dataset.favStarsBound = 'true';

    const refresh = () => {
        const favs = JSON.parse(localStorage.getItem('board_favorites') || '[]');
        grid.querySelectorAll('.btn').forEach(btn => {
            // Assurez-vous que le bouton est relatif pour l'absolute positioning de l'étoile
            if (getComputedStyle(btn).position === 'static') {
                btn.style.position = 'relative';
            }

            const toolId = normalizePluginId(btn.getAttribute('data-tooltip') || btn.title || btn.dataset.mode || btn.dataset.widget || btn.dataset.pluginId || '');
            if (!toolId) return;

            let star = btn.querySelector('.fav-star-icon');
            if (!star) {
                star = document.createElement('span');
                star.className = 'fav-star-icon';
                star.innerHTML = '★';
                star.title = 'Favoris';
                btn.appendChild(star);

                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    let currentFavs = JSON.parse(localStorage.getItem('board_favorites') || '[]');
                    if (currentFavs.includes(toolId)) {
                        removeFavorite(toolId);
                        star.classList.remove('is-favorite');
                    } else {
                        addFavorite(toolId);
                        star.classList.add('is-favorite');
                        createPoof(e.clientX, e.clientY);
                    }
                });
            }

            if (favs.includes(toolId)) {
                star.classList.add('is-favorite');
            } else {
                star.classList.remove('is-favorite');
            }

            if (!btn.dataset.dragGhostBound) {
                bindPluginDragGhost(btn, toolId);
            }

            if (btn.dataset.favoriteContextBound === 'true') return;
            btn.dataset.favoriteContextBound = 'true';
            btn.addEventListener('contextmenu', (e) => togglePluginFavorite(e, toolId));
        });
        syncDrawerFavoriteStars();
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(grid, { childList: true, subtree: true });
    setTimeout(refresh, 500);
}

function createPoof(x, y) {
    const poof = document.createElement('div');
    poof.className = 'poof-anim';
    poof.style.left = `${x - 25}px`;
    poof.style.top = `${y - 25}px`;
    document.body.appendChild(poof);
    setTimeout(() => poof.remove(), 300);
}

function isPluginDropInCanvas(y) {
    return y > 80 && y < window.innerHeight - 80;
}

function getFloatingToolbarDropIndex(pool) {
    if (!pool) return null;
    return Array.from(pool.children).indexOf(pluginDragPlaceholder);
}

window.addEventListener('pointermove', (e) => {
    if (!draggedPluginTool) return;
    moveDragGhost(e.clientX, e.clientY);

    let dropZone = null;
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (el.classList?.contains('cwrap') && !el.closest('.system-bar')) {
            dropZone = el;
            break;
        }
    }

    if (dropZone) {
        dropZone.classList.add('drag-over');
        const siblings = [...dropZone.querySelectorAll('.plugin-toolbar-btn:not([style*="display: none"]), .placeholder')];
        const nextSibling = siblings.find((sib) => {
            const rect = sib.getBoundingClientRect();
            return e.clientX < rect.left + rect.width / 2 && e.clientY >= rect.top && e.clientY <= rect.bottom;
        });
        if (nextSibling) dropZone.insertBefore(pluginDragPlaceholder, nextSibling);
        else dropZone.appendChild(pluginDragPlaceholder);
        setFloatingGhostState(true);
        return;
    }

    document.querySelectorAll('.cwrap.drag-over').forEach((pool) => pool.classList.remove('drag-over'));
    if (pluginDragPlaceholder.parentNode) pluginDragPlaceholder.parentNode.removeChild(pluginDragPlaceholder);
    setFloatingGhostState(false);
});

window.addEventListener('pointerup', (e) => {
    if (!draggedPluginTool) return;

    const currentDrag = draggedPluginTool;
    const sourceToolbarId = currentDrag.sourceToolbarId || currentDrag.el.dataset.dragSourceToolbarId || '';
    let targetPool = pluginDragPlaceholder.parentNode;
    let targetToolbarId = targetPool?.dataset?.toolbarId || '';
    const targetIndex = getFloatingToolbarDropIndex(targetPool);

    const toolbars = getStoredFloatingToolbars();
    const sourceToolbar = toolbars.find(t => t.id === sourceToolbarId);
    let isBaseTool = false;

    if (sourceToolbar && sourceToolbar.protected) {
        if (sourceToolbar.initialItems && sourceToolbar.initialItems.includes(currentDrag.id)) {
            isBaseTool = true;
        }

        // Les outils de base sont copiés lorsqu'ils sont glissés vers une autre barre ou le canvas
        if (isBaseTool && targetToolbarId !== sourceToolbarId) {
            currentDrag.isCopy = true;
        }
    }

    hideDragGhost();
    currentDrag.el.classList.remove('is-held');
    if (!currentDrag.isCopy) currentDrag.el.style.display = 'flex';

    document.querySelectorAll('.cwrap.drag-over').forEach((pool) => pool.classList.remove('drag-over'));

    if (targetPool && targetToolbarId) {
        insertPluginIntoFloatingToolbar(targetToolbarId, currentDrag.id, targetIndex, currentDrag.isCopy ? null : sourceToolbarId);
        pluginDragPlaceholder.remove();
        draggedPluginTool = null;
        setFloatingGhostState(false);
        return;
    }

    if (isPluginDropInCanvas(e.clientY)) {
        if (currentDrag.isCopy) {
            createFloatingToolbar(e.clientX, e.clientY, [currentDrag.id]);
        } else if (sourceToolbarId && !isBaseTool) {
            createPoof(e.clientX, e.clientY);
            removePluginFromFloatingToolbar(sourceToolbarId, currentDrag.id);
        }
    }

    if (pluginDragPlaceholder.parentNode) pluginDragPlaceholder.parentNode.removeChild(pluginDragPlaceholder);
    draggedPluginTool = null;
    setFloatingGhostState(false);
});

document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/json'))) {
        e.preventDefault();
        if (dropOverlay) dropOverlay.style.display = 'flex';
    }
});
document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/json'))) {
        e.preventDefault();
        if (dropOverlay) dropOverlay.style.display = 'flex';
    }
});
document.addEventListener('dragleave', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/json'))) {
        e.preventDefault();
        if (e.relatedTarget === null || e.relatedTarget.nodeName === "HTML") {
            if (dropOverlay) dropOverlay.style.display = 'none';
        }
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.style.display = 'none';

    // Vérifier si c'est un tableau dragué depuis l'explorateur
    const boardData = e.dataTransfer.getData('application/json');
    if (boardData) {
        try {
            const data = JSON.parse(boardData);
            if (data.type === 'board') {
                promptLoadBoard(data.id);
                return;
            }
        } catch (err) { }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        let imageDropCount = 0;
        let pdfDropped = false;

        // On boucle sur TOUS les fichiers déposés !
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];

            // Si c'est un PDF
            if (file.type === 'application/pdf') {
                if (!pdfDropped) {
                    if (importPdfFeuilletable) poserPdfFeuilletable(file); else loadPdf(file);
                    pdfDropped = true; // On limite à 1 PDF à la fois pour ne pas faire exploser la mémoire
                } else {
                    if (typeof showToast === 'function') showToast("Veuillez importer un seul PDF à la fois.");
                }
                continue;
            }

            // Si c'est un document texte (Word, LibreOffice, texte brut)
            if (window.LecteurDocuments && window.LecteurDocuments.estUnDocument(file)) {
                importerDocument(file, { x: e.clientX, y: e.clientY });
                continue;
            }

            // Si c'est un MP3
            if (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')) {
                handleMp3Drop(file);
                continue;
            }

            // Si c'est une vidéo
            if (file.type.match('video.*') || /\.(mp4|webm|mov|ogg)$/i.test(file.name)) {
                handleVideoDrop(file);
                continue;
            }

            // Si c'est une image
            if (file.type.match('image.*')) {
                const reader = new FileReader();
                const currentOffsetIndex = imageDropCount; // On mémorise le numéro de l'image pour le décalage
                const fileName = file.name; // ✅ Stocker le nom original du fichier
                imageDropCount++;

                reader.onload = (f) => {
                    const src = f.target.result;
                    const img = new Image();
                    img.onload = () => {
                        let w = img.width, h = img.height;
                        if (w > 800) { h *= 800 / w; w = 800; }

                        // Décalage pour éviter que les images ne se superposent parfaitement
                        const offset = currentOffsetIndex * (30 / zoom);

                        const lx = (e.clientX - panX) / zoom + offset;
                        const ly = (e.clientY - panY) / zoom + offset;

                        images.push(poserEnRognage({
                            id: nextId++,
                            x: lx - w / 2, y: ly - h / 2,
                            w: w, h: h,
                            cx: 0, cy: 0, cw: img.width, ch: img.height,
                            src: src,
                            fileName: fileName, // ✅ Ajouter le nom du fichier
                            z: globalZ++
                        }));

                        imageCache[src] = img;

                        // On sauvegarde et redessine seulement à la dernière image pour éviter les lags
                        if (typeof saveState === 'function') saveState();
                        if (typeof draw === 'function') draw();
                    };
                    img.src = src;
                };
                reader.readAsDataURL(file);
            }
        }

        // Notification de fin
        if (imageDropCount > 0 && typeof showToast === 'function') {
            showToast(imageDropCount > 1 ? `🖼️ ${imageDropCount} images importées !` : "🖼️ Image importée !");
        }
    }
});

// --- DRAG BARRES ---
// --- DRAG BARRES ---
document.querySelectorAll('.toolbar').forEach(bar => {
    const handle = bar.querySelector('.cbar-head') || bar.querySelector('.drag-handle'); let isDraggingBar = false, startX, startY;
    if (handle) {
        handle.style.cursor = 'grab';
        handle.addEventListener('mousedown', (e) => {
            isDraggingBar = true;

            const rect = bar.getBoundingClientRect();

            bar.style.transform = 'none';
            bar.style.left = rect.left + 'px';
            bar.style.top = rect.top + 'px';

            // IMPORTANT
            bar.style.right = 'auto';
            bar.style.bottom = 'auto';

            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
        });
        window.addEventListener('mousemove', (e) => { if (isDraggingBar) { bar.dataset.dragged = 'true'; bar.style.left = (e.clientX - startX) + 'px'; bar.style.top = (e.clientY - startY) + 'px'; } });
        window.addEventListener('mouseup', () => isDraggingBar = false);
    }
});

// --- RESTYLAGE DES TAMPONS DE PLUGINS DEPUIS LA BARRE DE STYLE ---
// Les pastilles de couleur et le curseur d'épaisseur agissent aussi sur les
// tampons (fractions, horloges, dés...) : le SVG du tampon est régénéré.
function applyPluginStampStyle(opts) {
    if (typeof selectedItems === 'undefined' || !selectedItems.length) return false;
    let touched = false;
    selectedItems.forEach(it => {
        if (it.type !== 'image') return;
        const o = getObjectById('image', it.id);
        if (!o || o.locked) return;
        if (opts.color && typeof recolorPluginImage === 'function' && recolorPluginImage(o, opts.color, opts.live)) touched = true;
        if (opts.widthScale && typeof restrokePluginImage === 'function' && restrokePluginImage(o, opts.widthScale, opts.live)) touched = true;
    });
    return touched;
}

// Le curseur d'épaisseur régénère le SVG des tampons : opération lourde.
// On n'en garde qu'une en vol à la fois et on n'écrit dans l'historique
// qu'au relâchement du curseur (sinon chaque cran sauvegarde tout le tableau).
let stampWidthBusy = false;
let stampWidthPending = null;
function applyPluginStampWidthLive(scale) {
    stampWidthPending = scale;
    if (stampWidthBusy) return;
    stampWidthBusy = true;
    const run = () => {
        const value = stampWidthPending;
        stampWidthPending = null;
        applyPluginStampStyle({ widthScale: value, live: true });
        // On laisse le navigateur peindre avant d'enchaîner
        requestAnimationFrame(() => {
            if (stampWidthPending !== null && stampWidthPending !== value) run();
            else stampWidthBusy = false;
        });
    };
    run();
}
function commitPluginStampWidth(scale) {
    stampWidthPending = null;
    stampWidthBusy = false;
    applyPluginStampStyle({ widthScale: scale });
    saveState();
}

// Opacité d'un tampon. Deux cas :
//  - le dessin a un remplissage translucide codé en dur (fractions, réglettes,
//    tuiles...) : c'est lui qu'on règle, sinon le tampon ne peut jamais devenir
//    opaque, quelle que soit la transparence globale de l'image ;
//  - sinon : simple alpha de l'image, instantané.
function applyPluginStampOpacity(value, commit) {
    if (typeof selectedItems === 'undefined' || !selectedItems.length) return false;
    let touched = false;
    let needsRegen = false;
    selectedItems.forEach(it => {
        if (it.type !== 'image') return;
        const o = getObjectById('image', it.id);
        if (!o || o.locked) return;
        if (typeof isFillOpacityStamp === 'function' && isFillOpacityStamp(o)) {
            if (typeof setPluginStampFillOpacity === 'function' && setPluginStampFillOpacity(o, value, !commit)) needsRegen = true;
            o.opacity = 1;
        } else {
            o.opacity = value;
        }
        touched = true;
    });
    if (touched && !needsRegen) { draw(); if (commit) saveState(); }
    else if (touched && commit) saveState();
    return touched;
}

// Le réglage du remplissage régénère le SVG : même cadence que l'épaisseur
let stampOpacityBusy = false;
let stampOpacityPending = null;
function applyPluginStampOpacityLive(value) {
    stampOpacityPending = value;
    if (stampOpacityBusy) return;
    stampOpacityBusy = true;
    const run = () => {
        const v = stampOpacityPending;
        stampOpacityPending = null;
        applyPluginStampOpacity(v, false);
        requestAnimationFrame(() => {
            if (stampOpacityPending !== null && stampOpacityPending !== v) run();
            else stampOpacityBusy = false;
        });
    };
    run();
}

// Valeur à afficher dans le curseur pour l'objet sélectionné
function currentStampOpacity(o) {
    if (!o) return 1;
    if (typeof isFillOpacityStamp === 'function' && isFillOpacityStamp(o)
        && typeof getPluginStampFillOpacity === 'function') return getPluginStampFillOpacity(o);
    return o.opacity === undefined ? 1 : o.opacity;
}

// Vrai si la sélection ne contient que des images
function selectionIsOnlyImages() {
    return selectedItems.length > 0 && selectedItems.every(i => i.type === 'image');
}

// --- POPOVER COULEUR ---
const colorPopover = document.getElementById('color-popover'); const btnColorPopover = document.getElementById('btn-color-popover'); const colorIndicator = document.getElementById('color-indicator');
let popoverTarget = 'stroke';
function updateColorIndicator() { colorIndicator.style.borderColor = hexToRgba(activeStyle.strokeColor, activeStyle.strokeOpacity); colorIndicator.style.background = activeStyle.isFilled ? hexToRgba(activeStyle.fillColor, activeStyle.fillOpacity) : 'transparent'; }
btnColorPopover.addEventListener('click', (e) => { colorPopover.classList.toggle('visible'); e.stopPropagation(); });
colorPopover.addEventListener('mousedown', (e) => e.stopPropagation());
colorPopover.addEventListener('pointerdown', (e) => e.stopPropagation());
colorPopover.addEventListener('click', (e) => e.stopPropagation());

document.querySelectorAll('.popover-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.popover-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); popoverTarget = tab.dataset.target;
        document.getElementById('opacity-slider').value = popoverTarget === 'stroke' ? activeStyle.strokeOpacity : activeStyle.fillOpacity;
        document.getElementById('btn-no-fill').style.display = popoverTarget === 'fill' ? 'flex' : 'none';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        const activeC = popoverTarget === 'stroke' ? activeStyle.strokeColor : activeStyle.fillColor;
        const dot = document.querySelector(`.color-dot[data-color="${activeC}"]`); if (dot) dot.classList.add('active');
    });
});

document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); dot.classList.add('active');
        if (popoverTarget === 'stroke') { activeStyle.strokeColor = dot.dataset.color; } else { activeStyle.fillColor = dot.dataset.color; activeStyle.isFilled = true; }
        updateColorIndicator(); pushStyleToObject();
        applyPluginStampStyle({ color: dot.dataset.color });
    });
});
document.getElementById('popover-custom-color').addEventListener('input', (e) => { document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); if (popoverTarget === 'stroke') activeStyle.strokeColor = e.target.value; else { activeStyle.fillColor = e.target.value; activeStyle.isFilled = true; } updateColorIndicator(); pushStyleToObject(); applyPluginStampStyle({ color: e.target.value }); });
document.getElementById('opacity-slider').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    // Sur une sélection de tampons, le curseur règle l'opacité de l'image
    if (selectionIsOnlyImages()) {
        applyPluginStampOpacityLive(v);
        const twin = document.getElementById('stamp-opacity');
        if (twin) twin.value = v;
        return;
    }
    if (popoverTarget === 'stroke') activeStyle.strokeOpacity = v; else { activeStyle.fillOpacity = v; activeStyle.isFilled = true; }
    updateColorIndicator(); pushStyleToObject();
});
document.getElementById('opacity-slider').addEventListener('change', (e) => {
    if (selectionIsOnlyImages()) applyPluginStampOpacity(parseFloat(e.target.value), true);
});
// Curseur d'opacité de la barre de style (visible dès qu'un tampon est sélectionné)
document.getElementById('stamp-opacity')?.addEventListener('input', (e) => {
    applyPluginStampOpacityLive(parseFloat(e.target.value));
    const twin = document.getElementById('opacity-slider');
    if (twin) twin.value = e.target.value;
});
document.getElementById('stamp-opacity')?.addEventListener('change', (e) => {
    stampOpacityPending = null; stampOpacityBusy = false;
    applyPluginStampOpacity(parseFloat(e.target.value), true);
});
document.getElementById('btn-no-fill').addEventListener('click', () => { if (popoverTarget === 'fill') { activeStyle.isFilled = false; updateColorIndicator(); pushStyleToObject(); } });

// --- GESTION SELECTION ET STYLES ---
function updateStyleBarContext() {
    const barStyle = document.getElementById('bar-style'); barStyle.className = "toolbar visible";
    if (barStyle.parentNode !== document.body) {
        document.body.appendChild(barStyle);
        localStorage.setItem('minimized_bar-style', 'false');
    }
    const pluginsDrawer = document.getElementById('bar-plugins');
    const isDrawerOpen = pluginsDrawer && !pluginsDrawer.classList.contains('closed');
    const drawerHeight = pluginsDrawer ? (pluginsDrawer.offsetHeight || 130) : 0;
    const minTop = isDrawerOpen ? drawerHeight + 12 : 20;
    const displayY = minTop;

    barStyle.removeAttribute('data-dragged');
    barStyle.style.left = '50%';
    barStyle.style.top = displayY + 'px';
    barStyle.style.right = 'auto';
    barStyle.style.bottom = 'auto';
    barStyle.style.transform = 'translateX(-50%)';
    let targetType = mode; if (selectedItems.length === 1) targetType = selectedItems[0].type; else if (selectedItems.length > 1) targetType = 'multi';
    if (selectedItems.length === 0 && typeof activeWidgets !== 'undefined' && activeWidgets['compass']) targetType = 'compass';

    // --- NOUVEAU : On ajoute 'ctx-point' pour les outils segment, curve et polygon ---
    if (targetType === 'point') barStyle.classList.add('ctx-point');
    else if (['segment', 'droite', 'demi-droite', 'curve', 'polygon'].includes(targetType)) barStyle.classList.add('ctx-line', 'ctx-point');
    else if (['circle', 'rectangle', 'freehand', 'highlighter', 'multi', 'postit', 'compass', 'arc'].includes(targetType)) barStyle.classList.add('ctx-line');
    else if (targetType === 'text') barStyle.classList.add('ctx-text');
    else if (targetType === 'image') { /* Afficher juste le cadenas et les calques */ }
    else {
        barStyle.classList.remove('visible');
        barStyle.removeAttribute('data-dragged');
    }
    // ----------------------------------------------------------------------------------

    if (selectedItems.length > 0) {
        barStyle.classList.add('ctx-zindex', 'ctx-lock');

        // Synchro du bouton Verrouillage
        const isAllLocked = selectedItems.every(i => { const o = getObjectById(i.type, i.id); return o && o.locked; });
        const btnLock = document.getElementById('btn-lock');
        if (isAllLocked) {
            btnLock.classList.add('active');
            document.getElementById('icon-lock').innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`; // Fermé
        } else {
            btnLock.classList.remove('active');
            document.getElementById('icon-lock').innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`; // Ouvert
        }

        // Synchro des boutons Flèche
        const hasAnyArrowStart = selectedItems.some(i => { const o = getObjectById(i.type, i.id); return o && o.arrowStart > 0; });
        const hasAnyArrowEnd = selectedItems.some(i => { const o = getObjectById(i.type, i.id); return o && o.arrowEnd > 0; });

        document.getElementById('btn-arrow-start').innerHTML = getArrowIcon(activeStyle.arrowStart, true);
        document.getElementById('btn-arrow-start').classList.toggle('active', activeStyle.arrowStart > 0 || hasAnyArrowStart);
        document.getElementById('btn-arrow-end').innerHTML = getArrowIcon(activeStyle.arrowEnd, false);
        document.getElementById('btn-arrow-end').classList.toggle('active', activeStyle.arrowEnd > 0 || hasAnyArrowEnd);

        // Synchro du bouton Global Lock (Barre du bas)
        const btnGlobalLock = document.getElementById('btn-global-lock');
        if (btnGlobalLock) {
            const svg = btnGlobalLock.querySelector('svg');
            if (isAllLocked) {
                btnGlobalLock.classList.add('active');
                if (svg) svg.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;
            } else {
                btnGlobalLock.classList.remove('active');
                if (svg) svg.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
            }
        }

        // Synchro du bouton Minimize Post-it
        const btnMinimizePostit = document.getElementById('btn-minimize-postit');
        if (btnMinimizePostit) {
            if (selectedItems.length === 1 && selectedItems[0].type === 'text') {
                const t = getObjectById('text', selectedItems[0].id);
                if (t && t.bubbleShape === 'postit') {
                    btnMinimizePostit.style.display = 'flex';
                    if (t.isMinimized) {
                        btnMinimizePostit.classList.add('active');
                    } else {
                        btnMinimizePostit.classList.remove('active');
                    }
                } else {
                    btnMinimizePostit.style.display = 'none';
                }
            } else {
                btnMinimizePostit.style.display = 'none';
            }
        }
    } else {
        document.getElementById('btn-arrow-start').innerHTML = getArrowIcon(activeStyle.arrowStart, true);
        document.getElementById('btn-arrow-start').classList.toggle('active', activeStyle.arrowStart > 0);
        document.getElementById('btn-arrow-end').innerHTML = getArrowIcon(activeStyle.arrowEnd, false);
        document.getElementById('btn-arrow-end').classList.toggle('active', activeStyle.arrowEnd > 0);

        const btnGlobalLock = document.getElementById('btn-global-lock');
        if (btnGlobalLock) {
            const svg = btnGlobalLock.querySelector('svg');
            btnGlobalLock.classList.remove('active');
            if (svg) svg.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
        }
    }

    syncStampStyleControls();
    syncTextStyleControls();
}

// Un texte n'a ni épaisseur de trait ni opacité de remplissage, et sa couleur
// se règle dans la barre d'édition. On n'affiche donc pas ces contrôles ici :
// ils n'agissaient sur rien et encombraient la barre.
function syncTextStyleControls() {
    const colorBtn = document.getElementById('btn-color-popover');
    const widthBox = document.getElementById('line-width')?.closest('.slider-container');
    const stampOpacityBox = document.getElementById('stamp-opacity-box');
    const quickColors = document.getElementById('quick-colors-container');
    const seulementDesTextes = typeof selectedItems !== 'undefined' && selectedItems.length > 0
        && selectedItems.every(i => i.type === 'text');
    if (!seulementDesTextes) return;

    if (colorBtn) colorBtn.style.display = 'none';
    if (widthBox) widthBox.style.display = 'none';
    if (stampOpacityBox) stampOpacityBox.style.display = 'none';
    if (quickColors) quickColors.style.display = 'none';
    document.getElementById('color-popover')?.classList.remove('visible');
}

// Sur une sélection d'images (tampons), on n'affiche la pastille de couleur et
// le curseur d'épaisseur que s'ils agissent vraiment sur le tampon — et jamais
// l'opacité : un tampon est opaque par nature.
function syncStampStyleControls() {
    const colorBtn = document.getElementById('btn-color-popover');
    const widthBox = document.getElementById('line-width')?.closest('.slider-container');
    const opacityBox = document.querySelector('#color-popover .opacity-container');
    if (!colorBtn || !widthBox) return;

    const stampOpacityBox = document.getElementById('stamp-opacity-box');

    if (!selectionIsOnlyImages()) {
        colorBtn.style.display = '';
        widthBox.style.display = '';
        if (stampOpacityBox) stampOpacityBox.style.display = 'none';
        if (opacityBox) {
            opacityBox.style.display = '';
            opacityBox.firstChild.textContent = 'Opacité : ';
        }
        document.querySelectorAll('#color-popover .color-grid, #color-popover .popover-tabs')
            .forEach(el => { el.style.display = ''; });
        return;
    }

    const objs = selectedItems.map(i => getObjectById('image', i.id)).filter(Boolean);
    const canColor = objs.some(o => typeof isRecolorablePluginImage === 'function' && isRecolorablePluginImage(o));
    const canWidth = objs.some(o => typeof isRestrokablePluginImage === 'function' && isRestrokablePluginImage(o));

    // Le bouton couleur reste accessible même sans recoloration possible :
    // il porte aussi le réglage d'opacité du tampon.
    colorBtn.style.display = '';
    widthBox.style.display = canWidth ? '' : 'none';
    if (opacityBox) {
        opacityBox.style.display = '';
        opacityBox.firstChild.textContent = 'Opacité du tampon : ';
        const op = objs.length ? currentStampOpacity(objs[0]) : 1;
        const input = document.getElementById('opacity-slider');
        if (input && document.activeElement !== input) input.value = op;
    }
    // Les onglets Contour/Fond n'ont pas de sens sur un tampon : la pastille
    // recolore le dessin entier.
    const tabs = document.querySelector('#color-popover .popover-tabs');
    if (tabs) tabs.style.display = 'none';
    const grid = document.querySelector('#color-popover .color-grid');
    if (grid) grid.style.display = canColor ? '' : 'none';

    // Curseur d'opacité, directement dans la barre (sans ouvrir le popover)
    if (stampOpacityBox) {
        stampOpacityBox.style.display = objs.length ? 'flex' : 'none';
        const input = document.getElementById('stamp-opacity');
        const op = objs.length ? currentStampOpacity(objs[0]) : 1;
        if (input && document.activeElement !== input) input.value = op;
    }

    // Le curseur reflète l'épaisseur courante du tampon sélectionné
    if (canWidth && objs.length && typeof getPluginStampStrokeScale === 'function') {
        const input = document.getElementById('line-width');
        const scale = getPluginStampStrokeScale(objs[0]);
        if (input && document.activeElement !== input) input.value = Math.round(scale * 3);
    }
}

function pushStyleToObject() {
    if (window.isEditingProjectTitle) {
        const projInput = document.getElementById('project-name-input');
        if (projInput) {
            projInput.style.fontSize = activeStyle.fontSize + 'px';
            projInput.style.color = activeStyle.strokeColor;
            if (activeStyle.fontFamily) projInput.style.fontFamily = activeStyle.fontFamily;

            const tempSpan = document.createElement('span');
            tempSpan.style.font = getComputedStyle(projInput).font;
            tempSpan.style.fontSize = activeStyle.fontSize + 'px';
            tempSpan.textContent = projInput.value || projInput.placeholder;
            document.body.appendChild(tempSpan);
            projInput.style.width = (tempSpan.offsetWidth + 20) + 'px';
            document.body.removeChild(tempSpan);

            if (!window.appState) window.appState = {};
            window.appState.projectTitleStyle = {
                fontSize: activeStyle.fontSize,
                color: activeStyle.strokeColor,
                fontFamily: activeStyle.fontFamily
            };
            saveState();
        }
        return; // Empecher d'agir sur les blocs quand on edite le titre
    }

    if (wysiwygText.style.display === 'block') {
        wysiwygText.style.fontSize = (activeStyle.fontSize * zoom) + 'px';
        wysiwygText.style.color = activeStyle.strokeColor;
    }
    if (selectedItems.length === 0) return;
    // Les images ne portent aucun de ces styles : inutile de sérialiser tout
    // le tableau à chaque cran de curseur (c'est ce qui faisait ramer).
    if (selectedItems.every(i => i.type === 'image')) return;
    selectedItems.forEach(item => {
        const obj = getObjectById(item.type, item.id); if (!obj) return;

        if (!obj.locked) {
            obj.strokeColor = activeStyle.strokeColor; obj.strokeOpacity = activeStyle.strokeOpacity;
            if (obj.color !== undefined) obj.color = activeStyle.strokeColor;
            if (obj.fillColor !== undefined) { obj.fillColor = activeStyle.fillColor; obj.fillOpacity = activeStyle.fillOpacity; obj.isFilled = activeStyle.isFilled; }
            if (obj.shape !== undefined) obj.shape = activeStyle.pointShape;
            if (obj.width !== undefined) obj.width = activeStyle.lineWidth;
            if (obj.dash !== undefined) obj.dash = activeStyle.lineDash;
            if (obj.arrowStart !== undefined || activeStyle.arrowStart !== undefined) obj.arrowStart = activeStyle.arrowStart;
            if (obj.arrowEnd !== undefined || activeStyle.arrowEnd !== undefined) obj.arrowEnd = activeStyle.arrowEnd;
            if (obj.fontSize !== undefined) {
                obj.fontSize = activeStyle.fontSize;
                if (obj.type === 'text' && obj.content.includes('$')) {
                    createMathImage(obj.content, obj.color || obj.strokeColor, obj.fontSize, (img, w, h) => {
                        if (img) { obj.mathImg = img; obj.mathW = w; obj.mathH = h; draw(); }
                    });
                }
            }
        }
    }); saveState(); draw();
}

document.getElementById('btn-global-lock')?.addEventListener('click', () => {
    if (selectedItems.length === 0) {
        showToast("Sélectionnez d'abord un objet à cadenasser/décadenasser");
        return;
    }
    const isAllLocked = selectedItems.every(i => { const o = getObjectById(i.type, i.id); return o && o.locked; });
    const newState = !isAllLocked;
    selectedItems.forEach(i => { const o = getObjectById(i.type, i.id); if (o) o.locked = newState; });
    updateStyleBarContext(); saveState(); draw();
    showToast(newState ? "Sélection verrouillée" : "Sélection déverrouillée");
});

document.getElementById('btn-lock').addEventListener('click', () => {
    const isAllLocked = selectedItems.every(i => { const o = getObjectById(i.type, i.id); return o && o.locked; });
    const newState = !isAllLocked;
    selectedItems.forEach(i => { const o = getObjectById(i.type, i.id); if (o) o.locked = newState; });
    updateStyleBarContext(); saveState(); draw();
    showToast(newState ? "Objet(s) verrouillé(s)" : "Objet(s) déverrouillé(s)");
});

document.getElementById('btn-arrow-start').addEventListener('click', () => {
    activeStyle.arrowStart = (activeStyle.arrowStart + 1) % 4;
    document.getElementById('btn-arrow-start').innerHTML = getArrowIcon(activeStyle.arrowStart, true);
    document.getElementById('btn-arrow-start').classList.toggle('active', activeStyle.arrowStart > 0);
    pushStyleToObject();
});

document.getElementById('btn-arrow-end').addEventListener('click', () => {
    activeStyle.arrowEnd = (activeStyle.arrowEnd + 1) % 4;
    document.getElementById('btn-arrow-end').innerHTML = getArrowIcon(activeStyle.arrowEnd, false);
    document.getElementById('btn-arrow-end').classList.toggle('active', activeStyle.arrowEnd > 0);
    pushStyleToObject();
});

document.getElementById('btn-z-up').addEventListener('click', () => { selectedItems.forEach(item => { const obj = getObjectById(item.type, item.id); if (obj && !obj.locked) obj.z = globalZ++; }); saveState(); draw(); showToast("Placé au premier plan"); });
document.getElementById('btn-z-down').addEventListener('click', () => { let minZ = 0;[points, segments, circles, rectangles, curves, polygons, freehands, images, texts].forEach(arr => { arr.forEach(o => { if (o.z !== undefined && o.z < minZ) minZ = o.z; }); }); selectedItems.forEach(item => { const obj = getObjectById(item.type, item.id); if (obj && !obj.locked) obj.z = minZ - 1; }); saveState(); draw(); showToast("Envoyé à l'arrière-plan"); });

document.getElementById('btn-shape').addEventListener('click', () => { const shapes = ['circle', 'cross', 'square', 'pixel']; const icons = { 'circle': '<circle cx="12" cy="12" r="6"/>', 'cross': '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="3"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="3"/>', 'square': '<rect x="6" y="6" width="12" height="12"/>', 'pixel': '<rect x="10" y="10" width="4" height="4" fill="currentColor"/>' }; activeStyle.pointShape = shapes[(shapes.indexOf(activeStyle.pointShape) + 1) % shapes.length]; document.getElementById('icon-shape').innerHTML = icons[activeStyle.pointShape]; pushStyleToObject(); });
document.getElementById('btn-dash').addEventListener('click', () => { const dashes = ['solid', 'dashed', 'dotted']; const icons = { 'solid': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3"/>', 'dashed': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3" stroke-dasharray="6,4"/>', 'dotted': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3" stroke-dasharray="2,4"/>' }; activeStyle.lineDash = dashes[(dashes.indexOf(activeStyle.lineDash) + 1) % dashes.length]; document.getElementById('icon-dash').innerHTML = icons[activeStyle.lineDash]; pushStyleToObject(); });
document.getElementById('line-width').addEventListener('input', (e) => {
    activeStyle.lineWidth = parseInt(e.target.value);
    pushStyleToObject();
    applyPluginStampWidthLive(activeStyle.lineWidth / 3);
});
document.getElementById('line-width').addEventListener('change', (e) => {
    // Relâchement du curseur : on fige la valeur dans l'historique
    if (selectionIsOnlyImages()) commitPluginStampWidth(parseInt(e.target.value) / 3);
});
document.getElementById('font-size').addEventListener('input', (e) => { activeStyle.fontSize = parseInt(e.target.value); pushStyleToObject(); });

// --- CHANGEMENT DE MODE ET GESTION UI ---
function syncToolbarActiveStates() {
    // Ensure drawer tools never stay active
    document.querySelectorAll('#bar-plugins .btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.custom-toolbar .btn, #bar-tools .btn').forEach(btn => {
        let btnMode = btn.dataset.mode || btn.dataset.tooltip || btn.dataset.pluginKey;
        if (btnMode && btnMode !== 'separator-bar') {
            btnMode = btnMode.replace(/^system:/, '');
            btn.classList.toggle('active', btnMode === mode);
        }
        let widget = btn.dataset.widget || btn.dataset.tooltip || btn.dataset.pluginKey;
        if (widget) {
            widget = widget.replace(/^system:/, '');
            if (typeof activeWidgets !== 'undefined' && activeWidgets.hasOwnProperty(widget)) {
                const isActive = !!activeWidgets[widget];
                btn.classList.toggle('active', isActive);
                btn.classList.toggle('widget-active', isActive);
            }
        }
    });
}

function setMode(newMode) {
    mode = newMode;
    window.isEditingProjectTitle = false;

    if (typeof syncToolbarActiveStates === 'function') syncToolbarActiveStates();

    creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; wysiwygText.style.display = 'none'; editingTextId = null; if (typeof oublierSelectionSaisie === 'function') oublierSelectionSaisie();
    clearSelection();

    if (['point', 'segment', 'droite', 'demi-droite', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon', 'postit'].includes(mode) || (typeof activeWidgets !== 'undefined' && activeWidgets['compass'])) {
        updateStyleBarContext();
    } else {
        const barStyle = document.getElementById('bar-style');
        barStyle.classList.remove('visible');
        barStyle.removeAttribute('data-dragged');
    }

    updateCursor(); draw();
}

// Gestion des clics sur la barre d'outils
document.querySelectorAll('.btn[data-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (btn.dataset.mode === 'eraser' && mode === 'eraser') setMode('pointer');
        else setMode(btn.dataset.mode);

        if (btn.dataset.mode === 'postit') {
            let s = 250;
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><defs><filter id="p-shd"><feDropShadow dx="2" dy="5" stdDeviation="4" flood-opacity="0.25"/></filter></defs><rect x="10" y="10" width="${s - 20}" height="${s - 20}" fill="#ffeaa7" filter="url(#p-shd)"/><polygon points="${s - 10},${s - 40} ${s - 40},${s - 10} ${s - 10},${s - 10}" fill="#000" opacity="0.12"/><path d="M ${s - 40} ${s - 10} Q ${s - 25} ${s - 25} ${s - 10} ${s - 40}" fill="none" stroke="#e5d443" stroke-width="1"/></svg>`;
            const b64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
            let img = new Image();
            img.onload = () => {
                window.postitStamp = { img: img, w: s, h: s, src: img.src };
                if (typeof showToast === 'function') showToast("📌 Cliquez sur le tableau pour coller le Post-It !");
            };
            img.src = b64;
        } else {
            window.postitStamp = null;
        }
        
        e.stopPropagation();
    });
});

// Fermeture du popover couleur quand on clique à l'extérieur
document.addEventListener('mousedown', (e) => {
    if (!colorPopover.contains(e.target) && e.target !== btnColorPopover && !btnColorPopover.contains(e.target)) colorPopover.classList.remove('visible');
    if (!exportPopover.contains(e.target) && e.target !== btnCapture && !btnCapture.contains(e.target)) {
        if (!isCropMode || cropRect) exportPopover.classList.remove('visible');
    }
});


function getHandleAt(lx, ly, obj, type) {
    if (obj.locked) return null;
    const hw = 12 / zoom;

    let cx, cy, startX, startY, w, h;
    if (type === 'image') {
        startX = obj.x; startY = obj.y; w = obj.w; h = obj.h;
    } else if (type === 'text') {
        startX = obj._cachedStartX || obj.x; startY = obj.y;
        w = obj._cachedW || 100; h = obj._cachedH || 50;
    } else return null;

    cx = startX + w / 2; cy = startY + h / 2;
    const angle = obj.angle || 0;

    const unrotatedX = Math.cos(-angle) * (lx - cx) - Math.sin(-angle) * (ly - cy) + cx;
    const unrotatedY = Math.sin(-angle) * (lx - cx) + Math.cos(-angle) * (ly - cy) + cy;

    const rotY = startY - (30 / zoom);
    if (Math.hypot(unrotatedX - cx, unrotatedY - rotY) <= hw * 1.5) return 'ROT';
    // Poignées de la bulle interactive
    if (obj.isBubble) {
        // 1. Poignée de la pointe (Absolue)
        if (Math.hypot(lx - obj.tailX, ly - obj.tailY) <= hw * 1.5) return 'TAIL';

        // 2. Poignée de redimensionnement (Relative à la rotation, en bas à droite)
        // 2. Poignée de redimensionnement (Relative à la rotation, en HAUT à droite)
        let pad = obj.bubblePad !== undefined ? obj.bubblePad : 20;
        let brX = obj._cachedStartX + obj._cachedW + pad; // Reste à droite
        let brY = obj.y - pad; // MODIFIÉ : On utilise le haut (y - pad)
        if (Math.hypot(unrotatedX - brX, unrotatedY - brY) <= hw * 1.5) return 'BUBBLE_RESIZE';
    }
    if (type === 'image') {
        const hx = [startX, startX + w / 2, startX + w, startX + w, startX + w, startX + w / 2, startX, startX];
        const hy = [startY, startY, startY, startY + h / 2, startY + h, startY + h, startY + h, startY + h / 2];
        const hNames = ['TL', 'T', 'TR', 'R', 'BR', 'B', 'BL', 'L'];
        for (let i = 0; i < 8; i++) {
            if (Math.abs(unrotatedX - hx[i]) <= hw && Math.abs(unrotatedY - hy[i]) <= hw) return hNames[i];
        }
    }
    // Texte : côtés = largeur de colonne, coins = agrandir tout le bloc
    if (type === 'text' && !obj.isBubble && !obj.mathImg) {
        const hx = [startX, startX + w, startX + w, startX, startX + w];
        const hy = [startY, startY, startY + h, startY + h, startY + h / 2];
        const hNames = ['TL', 'TR', 'BR', 'BL', 'R'];
        for (let i = 0; i < 5; i++) {
            if (Math.abs(unrotatedX - hx[i]) <= hw && Math.abs(unrotatedY - hy[i]) <= hw) return hNames[i];
        }
        if (Math.abs(unrotatedX - startX) <= hw && Math.abs(unrotatedY - (startY + h / 2)) <= hw) return 'L';
    }
    return null;
}

function updateCursor() {
    canvas.className = '';
    canvas.style.cursor = '';

    // Les instruments restent attrapables même en plein tracé : on les
    // déplace, on les tourne, on les rallonge, et l'outil en cours ne
    // change pas — comme une règle qu'on repousse du doigt sans lâcher son
    // crayon. (Avant, tout survol d'instrument était ignoré dès qu'un outil
    // de dessin était choisi : il fallait repasser par la flèche.)
    let hoveredWidget = null;
    if (activeWidgets.compass && widgets.compass.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.compass;
    else if (activeWidgets.ruler && widgets.ruler.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.ruler;
    else if (activeWidgets.setsquare && widgets.setsquare.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.setsquare;
    else if (activeWidgets.protractor && widgets.protractor.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.protractor;

    if (draggedWidget && draggedWidgetMode) {
        const cursors = {
            'move': 'move',
            'resize': 'ew-resize',
            'resizeWidth': 'ew-resize',
            'resizeHeight': 'ns-resize',
            'slideY': 'col-resize',
            'slideX': 'row-resize',
            'rotate': "url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22%3E%3Cpath d=%22M8.22673 13.3292C8.51492 14.1471 9.06116 14.8493 9.78313 15.3298C10.5051 15.8103 11.3637 16.0432 12.2296 15.9934C13.0954 15.9436 13.9216 15.6137 14.5837 15.0535C15.2458 14.4933 15.7078 13.7332 15.9003 12.8876C16.0927 12.042 16.0051 11.1567 15.6507 10.3652C15.2962 9.57374 14.6941 8.91887 13.9351 8.4993C13.176 8.07974 12.3012 7.91819 11.4424 8.03902C10.0777 8.23101 9.0827 9.23345 8 10M8 10V7M8 10H11%22 stroke=%22white%22 stroke-width=%224%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M8.22673 13.3292C8.51492 14.1471 9.06116 14.8493 9.78313 15.3298C10.5051 15.8103 11.3637 16.0432 12.2296 15.9934C13.0954 15.9436 13.9216 15.6137 14.5837 15.0535C15.2458 14.4933 15.7078 13.7332 15.9003 12.8876C16.0927 12.042 16.0051 11.1567 15.6507 10.3652C15.2962 9.57374 14.6941 8.91887 13.9351 8.4993C13.176 8.07974 12.3012 7.91819 11.4424 8.03902C10.0777 8.23101 9.0827 9.23345 8 10M8 10V7M8 10H11%22 stroke=%22black%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E') 16 16, auto",
            'trace': "url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 512 512%22%3E%3Cpath fill=%22black%22 stroke=%22white%22 stroke-width=%2215%22 d=%22M500.1 71.1l-59.2-59.2c-15.9-15.8-41.5-15.9-57.4 0l-38.4 38.4L57.3 338.2c-7.8 7.8-13.7 17.2-17.4 27.5L1.8 471.5c-4 11-1.2 23.4 7.1 31.7 8.3 8.3 20.6 11 31.7 7.1l105.8-38c10.3-3.7 19.7-9.7 27.5-17.4l277.9-277.9.1.1 10-10 38.4-38.4C515.9 112.6 516 86.9 500.1 71.1z M136.7 445.5l-67.4 24.2-27-27 24.2-67.4c.2-.5.4-1 .6-1.4l71 71c-.3.4-.8.6-1.4.6z M153.8 434.7c-1 1-2 1.8-3 2.7L74.6 361.3c.9-1 1.7-2.1 2.7-3L363.8 71.7l76.4 76.4L153.8 434.7z M480 108.4L451.7 136.7l-1.4 1.4-76.4-76.4 29.8-29.8c4.8-4.7 12.5-4.7 17.2 0l59.2 59.2c4.7 4.7 4.7 12.4-.1 17.3z%22/%3E%3C/svg%3E') 0 20, auto",
            'traceAngle': 'crosshair',
            'toggleLock': 'pointer',
            'toggleSwap': 'pointer',
            'toggleSlide': 'pointer',
            'toggleDouble': 'pointer'
        };
        if (cursors[draggedWidgetMode]) canvas.style.cursor = cursors[draggedWidgetMode];
        else canvas.style.cursor = 'pointer';
        return;
    }

    if (hoveredWidget && !isDraggingObjs && !isSelectingBox && !isDrawingFreehand) {
        const zone = hoveredWidget.getHitZone(lastRawX, lastRawY);
        const cursors = {
            'move': 'move',
            'resize': 'ew-resize',
            'resizeWidth': 'ew-resize',
            'resizeHeight': 'ns-resize',
            'slideY': 'col-resize',
            'slideX': 'row-resize',
            'rotate': "url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 24 24%22 fill=%22none%22%3E%3Cpath d=%22M8.22673 13.3292C8.51492 14.1471 9.06116 14.8493 9.78313 15.3298C10.5051 15.8103 11.3637 16.0432 12.2296 15.9934C13.0954 15.9436 13.9216 15.6137 14.5837 15.0535C15.2458 14.4933 15.7078 13.7332 15.9003 12.8876C16.0927 12.042 16.0051 11.1567 15.6507 10.3652C15.2962 9.57374 14.6941 8.91887 13.9351 8.4993C13.176 8.07974 12.3012 7.91819 11.4424 8.03902C10.0777 8.23101 9.0827 9.23345 8 10M8 10V7M8 10H11%22 stroke=%22white%22 stroke-width=%224%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M8.22673 13.3292C8.51492 14.1471 9.06116 14.8493 9.78313 15.3298C10.5051 15.8103 11.3637 16.0432 12.2296 15.9934C13.0954 15.9436 13.9216 15.6137 14.5837 15.0535C15.2458 14.4933 15.7078 13.7332 15.9003 12.8876C16.0927 12.042 16.0051 11.1567 15.6507 10.3652C15.2962 9.57374 14.6941 8.91887 13.9351 8.4993C13.176 8.07974 12.3012 7.91819 11.4424 8.03902C10.0777 8.23101 9.0827 9.23345 8 10M8 10V7M8 10H11%22 stroke=%22black%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E') 16 16, auto",
            'trace': "url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 512 512%22%3E%3Cpath fill=%22black%22 stroke=%22white%22 stroke-width=%2215%22 d=%22M500.1 71.1l-59.2-59.2c-15.9-15.8-41.5-15.9-57.4 0l-38.4 38.4L57.3 338.2c-7.8 7.8-13.7 17.2-17.4 27.5L1.8 471.5c-4 11-1.2 23.4 7.1 31.7 8.3 8.3 20.6 11 31.7 7.1l105.8-38c10.3-3.7 19.7-9.7 27.5-17.4l277.9-277.9.1.1 10-10 38.4-38.4C515.9 112.6 516 86.9 500.1 71.1z M136.7 445.5l-67.4 24.2-27-27 24.2-67.4c.2-.5.4-1 .6-1.4l71 71c-.3.4-.8.6-1.4.6z M153.8 434.7c-1 1-2 1.8-3 2.7L74.6 361.3c.9-1 1.7-2.1 2.7-3L363.8 71.7l76.4 76.4L153.8 434.7z M480 108.4L451.7 136.7l-1.4 1.4-76.4-76.4 29.8-29.8c4.8-4.7 12.5-4.7 17.2 0l59.2 59.2c4.7 4.7 4.7 12.4-.1 17.3z%22/%3E%3C/svg%3E') 0 20, auto",
            'traceAngle': 'crosshair',
            'toggleLock': 'pointer',
            'toggleSwap': 'pointer',
            'toggleSlide': 'pointer',
            'toggleDouble': 'pointer'
        };
        if (cursors[zone]) canvas.style.cursor = cursors[zone];
        else canvas.style.cursor = 'pointer';
        return;
    }

    if (isCropMode) { canvas.classList.add('cursor-crosshair'); return; }
    if (isPanningView || isSpacePressed || mode === 'move') { canvas.classList.add(isPanningView ? 'cursor-grabbing' : 'cursor-grab'); return; }
    if (isDraggingObjs) { canvas.classList.add('cursor-grabbing'); return; }
    if (hoveredObj && hoveredObj.type === 'handle') {
        const hn = hoveredObj.name;
        if (hn === 'ROT') { canvas.classList.add('cursor-rotate'); return; }
        if (hn === 'TAIL') { canvas.style.cursor = 'crosshair'; return; }
        if (hn === 'BUBBLE_RESIZE') { canvas.style.cursor = 'nwse-resize'; return; }
        if (hn === 'TL' || hn === 'BR') canvas.classList.add('cursor-nwse-resize'); else if (hn === 'TR' || hn === 'BL') canvas.classList.add('cursor-nesw-resize');
        else if (hn === 'T' || hn === 'B') canvas.classList.add('cursor-ns-resize'); else canvas.classList.add('cursor-ew-resize'); return;
    }
    if (mode === 'eraser') canvas.classList.add('cursor-eraser');
    else if (mode === 'text') {
        if (hoveredObj && hoveredObj.type === 'text') {
            canvas.style.cursor = 'grab';
        } else {
            // Création d'un curseur I-Beam dynamique (Taille max 128px pour éviter les bugs navigateurs)
            const h = Math.max(12, Math.min(128, activeStyle.fontSize * zoom));
            const color = activeStyle.strokeColor;

            // On dessine le SVG
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="${h}" viewBox="0 0 12 ${h}">
                <line x1="6" y1="1" x2="6" y2="${h - 1}" stroke="${color}" stroke-width="2"/>
                <line x1="2" y1="1" x2="10" y2="1" stroke="${color}" stroke-width="2"/>
                <line x1="2" y1="${h - 1}" x2="10" y2="${h - 1}" stroke="${color}" stroke-width="2"/>
            </svg>`;

            // On définit le "hotspot" (le point de clic exact) à x=6 et y=1 (le centre du trait supérieur)
            const svgUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
            canvas.style.cursor = `url('${svgUrl}') 6 1, text`;
        }
    }
    else if (mode === 'freehand' || mode === 'laser' || mode === 'highlighter') canvas.classList.add('cursor-pencil');
    else if (mode === 'pointer') canvas.classList.add(hoveredObj ? 'cursor-grab' : 'cursor-default');
    else canvas.classList.add('cursor-crosshair');
}

function getRawLogicalPos(e) { return { x: (e.clientX - panX) / zoom, y: (e.clientY - panY) / zoom }; }
function getObjectById(type, id) {
    if (type === 'point') return points.find(p => p.id === id); if (type === 'segment') return segments.find(s => s.id === id);
    if (type === 'circle') return circles.find(c => c.id === id); if (type === 'rectangle') return rectangles.find(r => r.id === id);
    if (type === 'text') return texts.find(t => t.id === id);
    if (type === 'freehand') return freehands.find(f => f.id === id); if (type === 'curve') return curves.find(c => c.id === id);
    if (type === 'polygon') return polygons.find(p => p.id === id); if (type === 'image') return images.find(i => i.id === id);
    if (type === 'arc') return arcs.find(a => a.id === id);
    return null;
}

// ==============================================================================
// MISE EN PAGE DU TEXTE (partagée par le rendu canvas et l'export SVG)
// Analyse le HTML du bloc (gras, italique, souligné, couleurs, titres, listes)
// puis calcule les lignes, en repliant le texte si le bloc a une largeur de
// colonne (obj.colWidth). Sans colonne, le comportement est celui d'avant :
// on ne coupe que sur les retours à la ligne explicites.
// ==============================================================================
const TEXT_HEADING_FACTOR = { H1: 1.6, H2: 1.3, H3: 1.15 };

function layoutTextObject(obj, measureCtx) {
    const baseSize = obj.fontSize || 24;
    const fontFamily = obj.fontFamily || 'sans-serif';
    const baseLH = obj.lineHeight || Math.round(baseSize * 1.2);
    const col = obj.colWidth || 0;

    // Taille et police d'un segment : celles qu'il porte, sinon celles du bloc
    const tailleSeg = (style, size) => (style && style.fontSize) ? style.fontSize * (size / baseSize) : size;
    const policeSeg = (style) => (style && style.fontFamily) || fontFamily;

    // Hauteur qu'occupe naturellement une ligne de cette police : c'est elle
    // que le navigateur centre dans l'interligne. On la MESURE au lieu de la
    // supposer, sinon le texte remonte dès qu'on élargit l'interligne.
    const hauteurNaturelle = (size, style) => {
        if (!measureCtx) return size * 1.15;
        measureCtx.font = `${style && style.italic ? 'italic ' : ''}${(style && style.bold) ? 'bold ' : ''}${size}px ${policeSeg(style)}`;
        const m = measureCtx.measureText('Mg');
        const h = (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0);
        return h > 0 ? h : size * 1.15;
    };

    const measure = (text, style, size) => {
        if (!text) return 0;
        const s = tailleSeg(style, size);
        if (!measureCtx) return text.length * s * 0.55; // secours si pas de contexte
        measureCtx.font = `${style && style.italic ? 'italic ' : ''}${(style && style.bold) ? 'bold ' : ''}${s}px ${policeSeg(style)}`;
        return measureCtx.measureText(text).width;
    };

    // --- 1. HTML -> paragraphes ---
    const paras = [];
    let cur = null;
    const openPara = (props) => { cur = { segs: [], marker: null, indent: 0, factor: 1, bold: false, align: null, ...(props || {}) }; paras.push(cur); return cur; };
    const para = () => cur || openPara();
    // Un paragraphe vide juste avant une liste ou un titre est un artefact du
    // HTML de l'éditeur, pas une ligne voulue : on le récupère.
    const reuseEmptyPara = () => {
        if (cur && cur.segs.length === 0 && paras[paras.length - 1] === cur) { paras.pop(); cur = null; }
    };

    const container = document.createElement('div');
    container.innerHTML = (obj.content === undefined || obj.content === null) ? ' ' : obj.content;

    // Alignement propre à un paragraphe (posé par les boutons d'alignement
    // pendant la saisie) : il l'emporte sur celui du bloc entier.
    const alignDe = (node) => {
        const v = (node.style && node.style.textAlign) || node.getAttribute?.('align') || '';
        return /^(left|center|right|justify)$/.test(v) ? (v === 'justify' ? 'left' : v) : null;
    };

    function walk(node, style, ctxBlock) {
        if (node.nodeType === Node.TEXT_NODE) {
            const parts = node.textContent.replace(/[\u200B\uFEFF]/g, '').split('\n');
            parts.forEach((txt, i) => {
                if (i > 0) openPara(ctxBlock);
                if (txt.length > 0) para().segs.push({ text: txt, style: { ...style } });
            });
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const name = node.nodeName;

        if (name === 'BR') {
            // Un <br> seul dans un bloc n'est qu'un repère pour rendre la ligne
            // vide visible : il ne doit pas créer une seconde ligne vide.
            const repere = !node.nextSibling && cur && cur.segs.length === 0;
            if (!repere) openPara(ctxBlock);
            return;
        }

        if (name === 'UL' || name === 'OL') {
            reuseEmptyPara();
            const ordered = (name === 'OL');
            let n = parseInt(node.getAttribute('start')) || 1;
            Array.from(node.children).forEach(li => {
                if (li.nodeName !== 'LI') { walk(li, style, ctxBlock); return; }
                openPara({ ...ctxBlock, marker: ordered ? `${n++}.` : '•', indent: (ctxBlock.indent || 0) + 1 });
                Array.from(li.childNodes).forEach(c => walk(c, style, { ...ctxBlock, indent: (ctxBlock.indent || 0) + 1 }));
            });
            openPara(ctxBlock); // on repart en paragraphe normal après la liste
            return;
        }

        if (TEXT_HEADING_FACTOR[name]) {
            reuseEmptyPara();
            const block = { ...ctxBlock, factor: TEXT_HEADING_FACTOR[name], bold: true };
            const alTitre = alignDe(node);
            if (alTitre) block.align = alTitre;
            openPara(block);
            Array.from(node.childNodes).forEach(c => walk(c, { ...style, bold: true }, block));
            openPara(ctxBlock);
            return;
        }

        if (name === 'DIV' || name === 'P' || name === 'LI') {
            reuseEmptyPara();   // sinon chaque bloc laisse derrière lui une ligne vide
            const propre = alignDe(node);
            let block = propre ? { ...ctxBlock, align: propre } : ctxBlock;
            if (name === 'LI') block = { ...block, marker: '•', indent: (ctxBlock.indent || 0) + 1 };
            openPara(block);
            Array.from(node.childNodes).forEach(c => walk(c, style, block));
            openPara(ctxBlock);
            return;
        }

        const st = { ...style };
        // Police et taille propres à une portion de texte (sélection)
        const famille = (node.style && node.style.fontFamily) || (node.getAttribute && node.getAttribute('face')) || '';
        if (famille) st.fontFamily = famille.replace(/^["']|["']$/g, '');
        // Taille propre à une portion : « em »/« % » sont relatifs à la taille
        // héritée (c'est ce qu'écrit la barre d'outils, insensible au zoom),
        // « px » est lu tel quel pour le contenu collé.
        const px = node.style && node.style.fontSize;
        if (px) {
            const herite = style.fontSize || baseSize;
            if (/px$/.test(px)) st.fontSize = parseFloat(px);
            else if (/em$/.test(px)) st.fontSize = parseFloat(px) * herite;
            else if (/%$/.test(px)) st.fontSize = parseFloat(px) / 100 * herite;
        }
        if (name === 'B' || name === 'STRONG' || (node.style && node.style.fontWeight === 'bold')) st.bold = true;
        if (name === 'I' || name === 'EM' || (node.style && node.style.fontStyle === 'italic')) st.italic = true;
        if (name === 'U' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'))) st.underline = true;
        if (node.style && node.style.color) st.color = node.style.color;
        if (node.hasAttribute && node.hasAttribute('color')) st.color = node.getAttribute('color');
        Array.from(node.childNodes).forEach(c => walk(c, st, ctxBlock));
    }

    // Pas de paragraphe ouvert d'avance : il naît au premier contenu rencontré,
    // sinon une liste ou un titre en tête de bloc créerait une ligne vide.
    if (!obj.mathImg) {
        Array.from(container.childNodes).forEach(c => walk(c, {}, {}));
    }
    // Un paragraphe vide en fin d'analyse est un artefact, sauf s'il est seul
    while (paras.length > 1 && paras[paras.length - 1].segs.length === 0) paras.pop();
    if (paras.length === 0) openPara();

    // --- 2. Repli d'un paragraphe dans la largeur disponible ---
    const wrap = (p, avail, size) => {
        const out = [];
        let line = [], lineW = 0;
        const flush = () => { out.push(line); line = []; lineW = 0; };

        p.segs.forEach(seg => {
            const style = { ...seg.style, bold: seg.style.bold || p.bold };
            const tokens = seg.text.match(/\s+|\S+/g) || [];
            tokens.forEach(tok => {
                const w = measure(tok, style, size);
                if (/^\s+$/.test(tok)) {
                    if (line.length === 0) return;      // pas d'espace en tête de ligne
                    line.push({ text: tok, style }); lineW += w;
                    return;
                }
                if (avail !== Infinity && lineW + w > avail && line.length > 0) {
                    while (line.length && /^\s+$/.test(line[line.length - 1].text)) {
                        lineW -= measure(line[line.length - 1].text, line[line.length - 1].style, size);
                        line.pop();
                    }
                    flush();
                }
                if (avail !== Infinity && w > avail) {
                    // Mot plus long que la colonne : coupure caractère par caractère
                    let chunk = '';
                    for (const ch of tok) {
                        if (measure(chunk + ch, style, size) > avail && chunk) {
                            line.push({ text: chunk, style }); flush(); chunk = ch;
                        } else chunk += ch;
                    }
                    if (chunk) { line.push({ text: chunk, style }); lineW += measure(chunk, style, size); }
                    return;
                }
                line.push({ text: tok, style }); lineW += w;
            });
        });
        if (line.length > 0 || out.length === 0) flush();
        return out;
    };

    // --- 3. Assemblage des lignes ---
    const lines = [];
    let y = 0, maxW = 0;
    paras.forEach(p => {
        const size = baseSize * p.factor;
        const lh = baseLH * p.factor;
        // Un peu d'air avant un titre, sauf s'il ouvre le bloc
        if (p.factor > 1 && lines.length > 0) y += baseLH * 0.4;
        const indentPx = (p.indent || 0) * size * 1.4;
        const markerW = p.marker ? measure(p.marker + ' ', { bold: p.bold }, size) : 0;
        const avail = col > 0 ? Math.max(size, col - indentPx - markerW) : Infinity;

        wrap(p, avail, size).forEach((segs, i) => {
            let segsW = 0;
            let tailleMax = size;
            segs.forEach(s => {
                segsW += measure(s.text, s.style, size);
                tailleMax = Math.max(tailleMax, tailleSeg(s.style, size));
            });
            const lhLigne = (tailleMax > size) ? lh * (tailleMax / size) : lh;
            // Le navigateur centre la ligne dans son interligne : on fait pareil.
            const demiInterligne = (lhLigne - hauteurNaturelle(tailleMax, { bold: p.bold })) / 2;
            const contentW = (i === 0 ? markerW : markerW) + segsW; // le retrait de continuation garde la gouttière
            maxW = Math.max(maxW, indentPx + contentW);
            lines.push({
                segs, size, lineHeight: lhLigne, y,
                indent: indentPx, marker: i === 0 ? p.marker : null, markerW,
                bold: p.bold, contentW, align: p.align || null, tailleMax, demiInterligne
            });
            y += lhLigne;
        });
    });

    return { lines, maxW, width: col > 0 ? col : maxW, height: y };
}

// ===================================================
// LE RÉSEAU DU FOND
// Le quadrillage plein écran est posé à l'origine du tableau ; une feuille,
// elle, porte sa réglure avec elle et se pose où il y a de la place. Tout ce
// qui doit tomber juste — l'aimant, les axes, leurs graduations — se règle
// donc ici, sur ces deux valeurs : d'où part le réseau, et de combien il
// avance. Les axes et l'aimant lisaient chacun les leurs, et se décalaient
// dès que la feuille n'était pas à l'origine.
// ===================================================
function origineDuReseau() {
    const bg = backgrounds[currentBgIndex];
    if (bg === 'seyes-marge' || bg === 'copie') return origineFeuille || { x: 0, y: 0 };
    return { x: 0, y: 0 };
}

function pasDuReseau() {
    const bg = backgrounds[currentBgIndex];
    if (bg === 'millimetre') return { x: 10, y: 10 };
    // Le Seyès n'a pas de verticales : son pas horizontal vaut l'interligne.
    if (bg === 'seyes' || bg === 'seyes-marge') return { x: 40, y: 10 };
    if (bg === 'copie') return { x: 30, y: 30 };          // ses petits carreaux
    if (bg === 'isometrique') return { x: 30 * Math.sqrt(3) / 2, y: 15 };
    return { x: 30, y: 30 };
}

function snapToGrid(lx, ly) {
    const o = origineDuReseau(), p = pasDuReseau();
    return {
        x: o.x + Math.round((lx - o.x) / p.x) * p.x,
        y: o.y + Math.round((ly - o.y) / p.y) * p.y
    };
}

// ===================================================
// AIMANTATION : LA GRILLE, LES OUTILS, LES INTERSECTIONS
// Trois sources indépendantes, réglées par un appui long sur l'aimant.
// L'ordre compte : une intersection est plus précise qu'un bord d'équerre,
// lui-même plus précis qu'un carreau.
// ===================================================
let aimant = { grille: true, outils: true, intersections: true };
try {
    const memoireAimant = JSON.parse(localStorage.getItem('board_aimant') || 'null');
    if (memoireAimant) Object.assign(aimant, memoireAimant);
} catch (e) { /* stockage refusé */ }

function enregistrerAimant() {
    try { localStorage.setItem('board_aimant', JSON.stringify(aimant)); } catch (e) { /* stockage refusé */ }
}

// Un point est-il sur la partie tracée de la droite ? (t : 0 = première
// extrémité, 1 = seconde)
function surLaPortion(t, type) {
    if (type === 'droite') return true;
    if (type === 'demi-droite') return t > -1e-9;
    return t > -1e-9 && t < 1 + 1e-9;
}

// Tous les traits droits du tableau (segments, droites, côtés de polygones et
// de rectangles), filtrés sur ce qui passe près du curseur.
function droitesGeometriques(pos, portee) {
    const res = [];
    const ajouter = (a, b, type, ref) => {
        if (!a || !b || (a.x === b.x && a.y === b.y)) return;
        if (pos) {
            const d = type === 'droite' ? distToLine(pos.x, pos.y, a.x, a.y, b.x, b.y)
                : type === 'demi-droite' ? distToRay(pos.x, pos.y, a.x, a.y, b.x, b.y)
                    : distToSegment(pos.x, pos.y, a.x, a.y, b.x, b.y);
            if (d > portee) return;
        }
        res.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, type, ref });
    };

    segments.forEach(s => ajouter(getObjectById('point', s.p1_id), getObjectById('point', s.p2_id),
        s.lineType || 'segment', { k: 'segment', id: s.id }));
    polygons.forEach(p => {
        const pts = (p.points || []).map(id => getObjectById('point', id)).filter(Boolean);
        for (let i = 0; i < pts.length - 1; i++) ajouter(pts[i], pts[i + 1], 'segment', { k: 'polygone', id: p.id, i });
        if (p.isClosed !== false && pts.length > 2) ajouter(pts[pts.length - 1], pts[0], 'segment', { k: 'polygone', id: p.id, i: pts.length - 1 });
    });
    rectangles.forEach(r => {
        const coins = coinsDuRectangle(r);
        if (!coins) return;
        for (let i = 0; i < 4; i++) ajouter(coins[i], coins[(i + 1) % 4], 'segment', { k: 'rectangle', id: r.id, i });
    });
    return res;
}

function coinsDuRectangle(r) {
    const p1 = getObjectById('point', r.p1_id), p2 = getObjectById('point', r.p2_id);
    if (!p1 || !p2) return null;
    return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }, { x: p2.x, y: p2.y }, { x: p1.x, y: p2.y }];
}

// Un arc tracé au compas n'est qu'un cercle dont on ne garde qu'une portion.
// On le décrit donc comme un cercle assorti de son étendue angulaire : le
// même calcul d'intersection sert pour les deux, il suffit d'écarter les
// solutions qui tombent en dehors de l'arc. Sans cela, un arc de compas ne
// croisait rien — ni une droite, ni un cercle, ni un autre arc.
function surLArc(c, x, y) {
    if (c.a0 === undefined || c.a1 === undefined) return true;   // un cercle entier
    const TOUR = Math.PI * 2;
    let etendue = c.a1 - c.a0;
    if (Math.abs(etendue) >= TOUR - 1e-9) return true;           // l'arc a fait le tour
    let t = Math.atan2(y - c.y, x - c.x) - c.a0;
    if (etendue < 0) { t = -t; etendue = -etendue; }
    t = ((t % TOUR) + TOUR) % TOUR;
    // Une petite marge : un point posé pile au bout de l'arc en fait partie
    const marge = Math.min(0.02, 6 / Math.max(1, c.r));
    return t <= etendue + marge || t >= TOUR - marge;
}

function cerclesGeometriques(pos, portee) {
    const res = [];
    circles.forEach(c => {
        const centre = getObjectById('point', c.center_id), bord = getObjectById('point', c.edge_id);
        if (!centre || !bord) return;
        const r = Math.hypot(bord.x - centre.x, bord.y - centre.y);
        if (r < 1) return;
        if (pos && Math.abs(Math.hypot(pos.x - centre.x, pos.y - centre.y) - r) > portee) return;
        res.push({ x: centre.x, y: centre.y, r, ref: { k: 'cercle', id: c.id } });
    });
    arcs.forEach(a => {
        if (!a || !(a.radius > 1)) return;
        if (pos && Math.abs(Math.hypot(pos.x - a.cx, pos.y - a.cy) - a.radius) > portee) return;
        res.push({ x: a.cx, y: a.cy, r: a.radius, a0: a.startAngle, a1: a.endAngle,
                   ref: { k: 'arc', id: a.id } });
    });
    return res;
}

// Retrouver la forme géométrique désignée par une référence : c'est ce qui
// permet à un point d'intersection de suivre les objets qui le portent.
function resoudreRef(ref) {
    if (!ref) return null;
    if (ref.k === 'segment') {
        const s = getObjectById('segment', ref.id);
        if (!s) return null;
        const a = getObjectById('point', s.p1_id), b = getObjectById('point', s.p2_id);
        if (!a || !b) return null;
        return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, type: s.lineType || 'segment' };
    }
    if (ref.k === 'polygone') {
        const p = getObjectById('polygon', ref.id);
        if (!p) return null;
        const pts = (p.points || []).map(id => getObjectById('point', id)).filter(Boolean);
        const a = pts[ref.i], b = pts[(ref.i + 1) % pts.length];
        if (!a || !b) return null;
        return { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, type: 'segment' };
    }
    if (ref.k === 'rectangle') {
        const r = getObjectById('rectangle', ref.id);
        const coins = r ? coinsDuRectangle(r) : null;
        if (!coins) return null;
        return { a: coins[ref.i], b: coins[(ref.i + 1) % 4], type: 'segment' };
    }
    if (ref.k === 'cercle') {
        const c = getObjectById('circle', ref.id);
        if (!c) return null;
        const centre = getObjectById('point', c.center_id), bord = getObjectById('point', c.edge_id);
        if (!centre || !bord) return null;
        return { x: centre.x, y: centre.y, r: Math.hypot(bord.x - centre.x, bord.y - centre.y) };
    }
    if (ref.k === 'arc') {
        const a = arcs.find(x => x && x.id === ref.id);
        if (!a || !(a.radius > 0)) return null;
        return { x: a.cx, y: a.cy, r: a.radius, a0: a.startAngle, a1: a.endAngle };
    }
    return null;
}

const estUnCercle = (o) => o && typeof o.r === 'number';

function intersectionsEntre(o1, o2) {
    if (!o1 || !o2) return [];
    if (estUnCercle(o1) && estUnCercle(o2)) return interCercles(o1, o2);
    if (estUnCercle(o1)) return interDroiteCercle(o2, o1);
    if (estUnCercle(o2)) return interDroiteCercle(o1, o2);
    return interDroites(o1, o2);
}

// Un point posé sur un croisement APPARTIENT aux deux objets : si l'un bouge,
// le point le suit. C'est le comportement de GeoMaster, et c'est ce qui rend
// les constructions vivantes (médiatrice, cercle circonscrit…).
function majPointsDependants() {
    for (const p of points) {
        if (!p.depend) continue;
        const o1 = resoudreRef(p.depend.refs[0]);
        const o2 = resoudreRef(p.depend.refs[1]);
        if (!o1 || !o2) { delete p.depend; continue; }   // l'objet a disparu : le point redevient libre
        const sols = intersectionsEntre(o1, o2);
        if (!sols.length) continue;                       // plus de croisement : le point reste où il est
        let meilleur = sols[0], min = Infinity;
        sols.forEach(s => {
            const d = Math.hypot(s.x - p.x, s.y - p.y);
            if (d < min) { min = d; meilleur = s; }
        });
        p.x = meilleur.x; p.y = meilleur.y;
    }
}

function interDroites(d1, d2) {
    const { a: A, b: B } = d1, { a: C, b: D } = d2;
    const den = (A.x - B.x) * (C.y - D.y) - (A.y - B.y) * (C.x - D.x);
    if (Math.abs(den) < 1e-9) return [];                       // parallèles
    const t = ((A.x - C.x) * (C.y - D.y) - (A.y - C.y) * (C.x - D.x)) / den;
    const u = ((A.x - C.x) * (A.y - B.y) - (A.y - C.y) * (A.x - B.x)) / den;
    if (!surLaPortion(t, d1.type) || !surLaPortion(u, d2.type)) return [];
    return [{ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }];
}

function interDroiteCercle(d, c) {
    const dx = d.b.x - d.a.x, dy = d.b.y - d.a.y;
    const fx = d.a.x - c.x, fy = d.a.y - c.y;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - c.r * c.r;
    const delta = B * B - 4 * A * C;
    if (delta < 0 || A === 0) return [];
    const rac = Math.sqrt(delta);
    const ts = delta < 1e-9 ? [-B / (2 * A)] : [(-B - rac) / (2 * A), (-B + rac) / (2 * A)];
    return ts.filter(t => surLaPortion(t, d.type))
        .map(t => ({ x: d.a.x + t * dx, y: d.a.y + t * dy }))
        .filter(p => surLArc(c, p.x, p.y));
}

function interCercles(c1, c2) {
    const dx = c2.x - c1.x, dy = c2.y - c1.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
    const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
    const mx = c1.x + a * dx / d, my = c1.y + a * dy / d;
    const sols = h < 1e-9
        ? [{ x: mx, y: my }]
        : [{ x: mx + h * dy / d, y: my - h * dx / d }, { x: mx - h * dy / d, y: my + h * dx / d }];
    // Deux arcs ne se croisent que là où ils existent tous les deux
    return sols.filter(p => surLArc(c1, p.x, p.y) && surLArc(c2, p.x, p.y));
}

// L'intersection la plus proche du curseur, s'il y en a une à portée.
// On ne compare que les objets qui passent eux-mêmes près du curseur : une
// intersection à 12 px suppose deux traits à moins de 12 px.
function intersectionProche(pos, tolerance) {
    const R = tolerance || 12 / zoom;
    const droites = droitesGeometriques(pos, R);
    const cercles = cerclesGeometriques(pos, R);
    if (droites.length + cercles.length < 2) return null;

    let meilleur = null;
    const garder = (o1, o2) => (p) => {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d <= R && (!meilleur || d < meilleur.d)) meilleur = { x: p.x, y: p.y, d, refs: [o1.ref, o2.ref] };
    };
    for (let i = 0; i < droites.length; i++) {
        for (let j = i + 1; j < droites.length; j++) interDroites(droites[i], droites[j]).forEach(garder(droites[i], droites[j]));
        cercles.forEach(c => interDroiteCercle(droites[i], c).forEach(garder(droites[i], c)));
    }
    for (let i = 0; i < cercles.length; i++) {
        for (let j = i + 1; j < cercles.length; j++) interCercles(cercles[i], cercles[j]).forEach(garder(cercles[i], cercles[j]));
    }
    return meilleur ? { x: meilleur.x, y: meilleur.y, refs: meilleur.refs } : null;
}

// Le point de la figure le plus proche, s'il est à portée.
function pointProche(pos, portee) {
    let meilleur = null, min = portee;
    points.forEach(p => {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < min) { min = d; meilleur = p; }
    });
    return meilleur ? { x: meilleur.x, y: meilleur.y } : null;
}

function projeterSurDroite(pos, d) {
    const dx = d.b.x - d.a.x, dy = d.b.y - d.a.y;
    const l2 = dx * dx + dy * dy;
    if (!l2) return null;
    let t = ((pos.x - d.a.x) * dx + (pos.y - d.a.y) * dy) / l2;
    if (d.type === 'segment') t = Math.max(0, Math.min(1, t));
    else if (d.type === 'demi-droite') t = Math.max(0, t);
    return { x: d.a.x + t * dx, y: d.a.y + t * dy };
}

// Le point du tracé le plus proche : sert à poser un outil LE LONG d'un
// trait ou d'un cercle, pas à guider le curseur.
function projectionSurTrace(pos, portee) {
    let meilleur = null, min = portee;
    droitesGeometriques(pos, portee).forEach(d => {
        const proj = projeterSurDroite(pos, d);
        if (!proj) return;
        const dist = Math.hypot(proj.x - pos.x, proj.y - pos.y);
        if (dist < min) { min = dist; meilleur = proj; }
    });
    cerclesGeometriques(pos, portee).forEach(c => {
        const dc = Math.hypot(pos.x - c.x, pos.y - c.y);
        if (dc < 1e-6) return;
        const dist = Math.abs(dc - c.r);
        if (dist < min) { min = dist; meilleur = { x: c.x + (pos.x - c.x) * c.r / dc, y: c.y + (pos.y - c.y) * c.r / dc }; }
    });
    return meilleur;
}

// Le bord d'une règle, d'une équerre ou d'un rapporteur posé sur le tableau.
// Le trait se pose contre l'outil, décalé d'une demi-épaisseur, comme un
// crayon qui longe le plastique. Les origines (angle de l'équerre, zéro de la
// règle, centre du rapporteur) attirent aussi : c'est de là qu'on mesure.
function accrocheOutils(raw) {
    const portee = 10 / zoom;
    const offset = (activeStyle.lineWidth || 2) / 2;

    for (const nom of ['setsquare', 'ruler', 'protractor', 'compass']) {
        if (!activeWidgets[nom] || !widgets[nom]) continue;
        const w = widgets[nom];
        const l = w.toLocal(raw.x, raw.y);
        if (Math.abs(l.x) < portee && Math.abs(l.y) < portee) return w.toGlobal(0, 0);
    }

    if (activeWidgets.setsquare && widgets.setsquare) {
        const w = widgets.setsquare, l = w.toLocal(raw.x, raw.y);
        if (l.x > 0 && l.x < w.width && Math.abs(l.y) < portee) return w.toGlobal(l.x, -offset);
        if (l.y > 0 && l.y < w.height && Math.abs(l.x) < portee) return w.toGlobal(-offset, l.y);
        if (l.x >= 0 && l.y >= 0 && Math.abs(l.y - (-w.height / w.width * l.x + w.height)) < portee) {
            const len = Math.hypot(w.height, w.width);
            const proj = MathUtils.getProjectedPoint(l.x, l.y, {
                constructor: { name: 'Segment' }, p1: { x: 0, y: w.height }, p2: { x: w.width, y: 0 }
            });
            return w.toGlobal(proj.x + (w.height / len) * offset, proj.y + (w.width / len) * offset);
        }
    }
    if (activeWidgets.ruler && widgets.ruler) {
        const w = widgets.ruler, l = w.toLocal(raw.x, raw.y);
        if (Math.abs(l.y) < portee && l.x > -50 && l.x < w.width + 50) return w.toGlobal(l.x, -offset);
        if (Math.abs(l.y - w.height) < portee && l.x > -50 && l.x < w.width + 50) return w.toGlobal(l.x, w.height + offset);
    }
    if (activeWidgets.protractor && widgets.protractor) {
        const w = widgets.protractor, l = w.toLocal(raw.x, raw.y);
        if (Math.abs(l.y) < portee && l.x > -w.radius && l.x < w.radius) return w.toGlobal(l.x, offset);
        if (Math.abs(Math.hypot(l.x, l.y) - w.radius) < portee && l.y < 0) {
            const angle = Math.atan2(l.y, l.x);
            return w.toGlobal((w.radius + offset) * Math.cos(angle), (w.radius + offset) * Math.sin(angle));
        }
    }
    return null;
}

// La position retenue pour un clic ou un tracé, aimant compris.
// L'ordre est celui de GeoMaster : l'outil qu'on a posé sur le tableau passe
// avant la figure, la figure avant le quadrillage.
// « source » sert au dessin du point fantôme.
function positionAimantee(raw, options = {}) {
    if (!magnetMode) return { x: raw.x, y: raw.y, source: null };
    if (aimant.outils) {
        const t = accrocheOutils(raw);
        if (t) return { x: t.x, y: t.y, source: 'outil' };
    }
    if (aimant.intersections && !options.sansIntersection) {
        const p = pointProche(raw, 12 / zoom);
        if (p) return { x: p.x, y: p.y, source: 'point' };
        const i = intersectionProche(raw);
        if (i) return { x: i.x, y: i.y, source: 'intersection', refs: i.refs };
    }
    if (aimant.grille && !options.sansGrille) {
        const g = snapToGrid(raw.x, raw.y);
        return { x: g.x, y: g.y, source: 'grille' };
    }
    return { x: raw.x, y: raw.y, source: null };
}

// ---------------------------------------------------
// L'OUTIL QU'ON DÉPLACE SE CALE, LUI AUSSI
// La règle se pose sur un point, le long d'un trait, ou s'aligne sur
// l'équerre (parallèles et perpendiculaires) ; la pointe du compas se pose
// sur le zéro de la règle pour reporter une longueur.
// ---------------------------------------------------
let reperOutil = null;      // petit repère dessiné quand un outil s'est calé

// Règle et équerre s'alignent l'une sur l'autre dès que leurs directions sont
// à 4° près, parallèles ou perpendiculaires.
function alignerOutils(w, cible, portee) {
    let autre = null;
    if (w instanceof RulerWidget && activeWidgets.setsquare && widgets.setsquare) autre = widgets.setsquare;
    else if (w instanceof SetSquareWidget && activeWidgets.ruler && widgets.ruler) autre = widgets.ruler;
    if (!autre) return null;

    const limite = 4 * Math.PI / 180;
    const modPi = (a) => { let r = a % Math.PI; if (r < 0) r += Math.PI; return r; };
    const ecart = (a, b) => { const d = Math.abs(modPi(a) - modPi(b)); return Math.min(d, Math.PI - d); };

    for (const angle of [autre.angle, autre.angle + Math.PI / 2]) {
        if (ecart(w.angle, angle) > limite) continue;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const v = (cible.x - autre.x) * dx + (cible.y - autre.y) * dy;
        const p = { x: autre.x + v * dx, y: autre.y + v * dy };
        if (Math.hypot(cible.x - p.x, cible.y - p.y) > portee) continue;
        // on garde le sens le plus proche de l'orientation actuelle
        const distAngle = (a) => Math.abs(Math.atan2(Math.sin(w.angle - a), Math.cos(w.angle - a)));
        w.angle = distAngle(angle) < distAngle(angle + Math.PI) ? angle : angle + Math.PI;
        return p;
    }
    return null;
}

// Le geste de la parallèle : l'équerre (ou la règle) posée le long d'une
// droite y reste collée et GLISSE dessus. Il faut qu'elle soit déjà presque
// parallèle — sinon l'instrument sauterait sur le premier trait venu.
function glisserLeLongDunTrait(w, cible, portee) {
    if (!(w instanceof RulerWidget) && !(w instanceof SetSquareWidget)) return null;
    const limite = 3 * Math.PI / 180;
    const modPi = (a) => { let r = a % Math.PI; if (r < 0) r += Math.PI; return r; };
    const ecart = (a, b) => { const d = Math.abs(modPi(a) - modPi(b)); return Math.min(d, Math.PI - d); };

    let meilleur = null, min = portee;
    droitesGeometriques(cible, portee).forEach(d => {
        const angleTrait = Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x);
        // l'équerre a deux bords perpendiculaires : les deux peuvent longer
        const bords = (w instanceof SetSquareWidget) ? [angleTrait, angleTrait - Math.PI / 2] : [angleTrait];
        bords.forEach(a => {
            if (ecart(w.angle, a) > limite) return;
            // projection sur la droite ENTIÈRE : on doit pouvoir glisser
            // au-delà des extrémités du segment tracé
            const dx = d.b.x - d.a.x, dy = d.b.y - d.a.y;
            const l2 = dx * dx + dy * dy;
            if (!l2) return;
            const t = ((cible.x - d.a.x) * dx + (cible.y - d.a.y) * dy) / l2;
            const p = { x: d.a.x + t * dx, y: d.a.y + t * dy };
            const dist = Math.hypot(p.x - cible.x, p.y - cible.y);
            if (dist < min) { min = dist; meilleur = { p, angle: a }; }
        });
    });
    if (!meilleur) return null;

    const distAngle = (a) => Math.abs(Math.atan2(Math.sin(w.angle - a), Math.cos(w.angle - a)));
    w.angle = distAngle(meilleur.angle) < distAngle(meilleur.angle + Math.PI) ? meilleur.angle : meilleur.angle + Math.PI;
    return meilleur.p;
}

// Le zéro d'un instrument : le coin de l'équerre, le début de la règle.
function originesInstruments(sauf) {
    const res = [];
    ['ruler', 'setsquare', 'protractor'].forEach(nom => {
        if (!activeWidgets[nom] || !widgets[nom] || widgets[nom] === sauf) return;
        const o = widgets[nom].toGlobal(0, 0);
        res.push({ x: o.x, y: o.y });
    });
    return res;
}

function poserOutil(w, cible) {
    reperOutil = null;
    if (!magnetMode || !aimant.outils) return cible;
    // Volontairement court : un aimant trop large attrape l'instrument dès
    // qu'on l'approche et devient pénible.
    const portee = 10 / zoom;

    const aligne = alignerOutils(w, cible, portee);
    if (aligne) return aligne;

    const long = glisserLeLongDunTrait(w, cible, portee);
    if (long) return long;

    // La pointe du compas sur le zéro d'un instrument : le geste du report de
    // longueur. Prioritaire, sinon un point voisin la volerait.
    if (w instanceof CompassWidget) {
        for (const org of originesInstruments(w)) {
            if (Math.hypot(cible.x - org.x, cible.y - org.y) < portee) { reperOutil = org; return org; }
        }
    }

    if (aimant.intersections) {
        const p = pointProche(cible, portee);
        if (p) { reperOutil = p; return p; }
        const i = intersectionProche(cible, portee);
        if (i) { reperOutil = i; return i; }
    }

    // Poser le CENTRE d'un instrument sur un trait n'a de sens que pour le
    // compas et le rapporteur. La règle et l'équerre, elles, longent un trait
    // quand elles sont parallèles (au-dessus) : les coller autrement rendait
    // l'aimant collant pour rien.
    if (!(w instanceof RulerWidget) && !(w instanceof SetSquareWidget)) {
        const proj = projectionSurTrace(cible, portee);
        if (proj) { reperOutil = proj; return proj; }
    }

    return cible;
}

// La pointe du compas est-elle posée sur le bord gradué d'un instrument ?
// On renvoie la direction de ce bord.
function bordSousLaPointe(w) {
    const tolerance = 4 / zoom;
    if (activeWidgets.ruler && widgets.ruler) {
        const r = widgets.ruler, l = r.toLocal(w.x, w.y);
        if (l.x > -20 && l.x < r.width + 20 && (Math.abs(l.y) < tolerance || Math.abs(l.y - r.height) < tolerance)) return r.angle;
    }
    if (activeWidgets.setsquare && widgets.setsquare) {
        const c = widgets.setsquare, l = c.toLocal(w.x, w.y);
        if (l.x > -20 && l.x < c.width + 20 && Math.abs(l.y) < tolerance) return c.angle;
        if (l.y > -20 && l.y < c.height + 20 && Math.abs(l.x) < tolerance) return c.angle + Math.PI / 2;
    }
    return null;
}

// L'écartement du compas : posé sur le bord d'un instrument, il s'ouvre LE
// LONG des graduations (et par millimètres) — c'est ainsi qu'on prend 4,5 cm.
// Sinon, il se prend sur un point de la figure : c'est le report de longueur.
function pointerCompasVers(w, x, y) {
    reperOutil = null;
    if (!magnetMode || !aimant.outils) return { x, y };

    const bord = bordSousLaPointe(w);
    if (bord !== null) {
        const dx = Math.cos(bord), dy = Math.sin(bord);
        let v = (x - w.x) * dx + (y - w.y) * dy;
        const mm = 5;                                   // le pas des graduations
        v = Math.round(v / mm) * mm;
        return { x: w.x + v * dx, y: w.y + v * dy };
    }

    const portee = 12 / zoom;
    const p = pointProche({ x, y }, portee) || (aimant.intersections ? intersectionProche({ x, y }, portee) : null);
    if (p) { reperOutil = p; return p; }
    return { x, y };
}

function distToSegment(px, py, x1, y1, x2, y2) { const l2 = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2); if (l2 === 0) return Math.hypot(px - x1, py - y1); let t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2)); return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
function distToLine(px, py, x1, y1, x2, y2) { const l2 = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2); if (l2 === 0) return Math.hypot(px - x1, py - y1); let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2; return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
function distToRay(px, py, x1, y1, x2, y2) { const l2 = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2); if (l2 === 0) return Math.hypot(px - x1, py - y1); let t = Math.max(0, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2); return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))); }
function drawExtendedLine(ctx, x1, y1, x2, y2, isDemi) {
    const dx = x2 - x1; const dy = y2 - y1;
    if (dx === 0 && dy === 0) return;
    const len = 100000;
    const mag = Math.hypot(dx, dy);
    const nx = dx / mag; const ny = dy / mag;
    ctx.moveTo(isDemi ? x1 : x1 - nx * len, isDemi ? y1 : y1 - ny * len);
    ctx.lineTo(x2 + nx * len, y2 + ny * len);
}

function findObjectAt(lx, ly) {
    const hitZonePt = 15 / zoom;
    const hitZoneLine = 8 / zoom;

    // --- 1. Vérification des poignées (Images ET Textes) ---
    if (selectedItems.length === 1 && (selectedItems[0].type === 'image' || selectedItems[0].type === 'text')) {
        const obj = getObjectById(selectedItems[0].type, selectedItems[0].id);
        if (obj) {
            const handle = getHandleAt(lx, ly, obj, selectedItems[0].type);
            if (handle) return { type: 'handle', name: handle, id: obj.id };
        }
    }

    // --- 2. Vérification des points (Priorité absolue pour aimantation) ---
    let bestPoint = null; let minDist = Infinity;
    for (let i = points.length - 1; i >= 0; i--) {
        const dist = Math.hypot(points[i].x - lx, points[i].y - ly);
        if (dist < hitZonePt && dist < minDist) { minDist = dist; bestPoint = { type: 'point', id: points[i].id }; }
    }
    if (bestPoint) return bestPoint;

    let bestHit = null; let maxZ = -Infinity;
    const updateHit = (hit) => { const obj = getObjectById(hit.type, hit.id); if (obj && (obj.z || 0) > maxZ) { maxZ = obj.z || 0; bestHit = hit; } };

    // --- 3. Vérification des Textes (Avec rotation et boîte pleine) ---
    // --- 3. Vérification des Textes (Avec rotation et boîte pleine) ---
    for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        const w = t._cachedW || 100;
        const h = t._cachedH || 50;
        const startX = t._cachedStartX || t.x;

        // On "dés-tourne" les coordonnées de la souris pour compenser la rotation du texte
        let checkX = lx; let checkY = ly;
        if (t.angle) {
            const cx = startX + w / 2; const cy = t.y + h / 2;
            checkX = Math.cos(-t.angle) * (lx - cx) - Math.sin(-t.angle) * (ly - cy) + cx;
            checkY = Math.sin(-t.angle) * (lx - cx) + Math.cos(-t.angle) * (ly - cy) + cy;
        }

        // Hitzone parfaite : on clique n'importe où dans le rectangle du texte
        // Hitzone parfaite élargie si c'est une bulle
        let padHit = t.isBubble ? 25 / zoom : 0;
        if (checkX >= startX - padHit && checkX <= startX + w + padHit && checkY >= t.y - padHit && checkY <= t.y + h + padHit) {
            updateHit({ type: 'text', id: t.id });
        }
    }

    // --- 4. Reste des objets ---
    for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        const d = Math.hypot(lx - a.cx, ly - a.cy);
        if (Math.abs(d - a.radius) < hitZoneLine) {
            let angle = Math.atan2(ly - a.cy, lx - a.cx);
            if (angle < 0) angle += Math.PI * 2;
            const PI2 = Math.PI * 2;
            let s = (a.startAngle % PI2 + PI2) % PI2;
            let e = (a.endAngle % PI2 + PI2) % PI2;
            let inside = false;
            if (a.counterClockwise) {
                if (s > e) inside = (angle <= s && angle >= e);
                else inside = (angle <= s || angle >= e);
            } else {
                if (s < e) inside = (angle >= s && angle <= e);
                else inside = (angle >= s || angle <= e);
            }
            if (inside) updateHit({ type: 'arc', id: a.id });
        }
    }

    for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i], p1 = getObjectById('point', s.p1_id), p2 = getObjectById('point', s.p2_id);
        if (p1 && p2) {
            let dist = Infinity;
            if (s.lineType === 'droite') dist = distToLine(lx, ly, p1.x, p1.y, p2.x, p2.y);
            else if (s.lineType === 'demi-droite') dist = distToRay(lx, ly, p1.x, p1.y, p2.x, p2.y);
            else dist = distToSegment(lx, ly, p1.x, p1.y, p2.x, p2.y);
            if (dist < hitZoneLine) updateHit({ type: 'segment', id: s.id });
        }
    }
    for (let i = circles.length - 1; i >= 0; i--) { const c = circles[i], center = getObjectById('point', c.center_id), edge = getObjectById('point', c.edge_id); if (center && edge && Math.abs(Math.hypot(lx - center.x, ly - center.y) - Math.hypot(edge.x - center.x, edge.y - center.y)) < hitZoneLine) updateHit({ type: 'circle', id: c.id }); }

    for (let i = rectangles.length - 1; i >= 0; i--) {
        const r = rectangles[i], p1 = getObjectById('point', r.p1_id), p2 = getObjectById('point', r.p2_id);
        if (p1 && p2) {
            const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x), minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
            const onBorder = (lx > minX - hitZoneLine && lx < maxX + hitZoneLine && Math.abs(ly - minY) < hitZoneLine) || (lx > minX - hitZoneLine && lx < maxX + hitZoneLine && Math.abs(ly - maxY) < hitZoneLine) || (ly > minY - hitZoneLine && ly < maxY + hitZoneLine && Math.abs(lx - minX) < hitZoneLine) || (ly > minY - hitZoneLine && ly < maxY + hitZoneLine && Math.abs(lx - maxX) < hitZoneLine);
            const inside = r.isFilled && lx > minX && lx < maxX && ly > minY && ly < maxY;
            if (onBorder || inside) updateHit({ type: 'rectangle', id: r.id });
        }
    }

    for (let i = polygons.length - 1; i >= 0; i--) {
        const poly = polygons[i]; let onBorder = false; const len = poly.isClosed === false ? poly.points.length - 1 : poly.points.length;
        for (let j = 0; j < len; j++) { const pk_idx = (j + 1) % poly.points.length; const pj = getObjectById('point', poly.points[j]), pk = getObjectById('point', poly.points[pk_idx]); if (pj && pk && distToSegment(lx, ly, pj.x, pj.y, pk.x, pk.y) < hitZoneLine) { onBorder = true; break; } }
        let inside = false; if (poly.isClosed !== false && poly.isFilled) { for (let j = 0, k = poly.points.length - 1; j < poly.points.length; k = j++) { const pj = getObjectById('point', poly.points[j]), pk = getObjectById('point', poly.points[k]); if (!pj || !pk) break; const intersect = ((pj.y > ly) !== (pk.y > ly)) && (lx < (pk.x - pj.x) * (ly - pj.y) / (pk.y - pj.y) + pj.x); if (intersect) inside = !inside; } }
        if (onBorder || inside) updateHit({ type: 'polygon', id: poly.id });
    }

    for (let i = curves.length - 1; i >= 0; i--) { const c = curves[i]; for (let j = 0; j < c.points.length; j++) { const p = getObjectById('point', c.points[j]); if (p && Math.hypot(p.x - lx, p.y - ly) < hitZoneLine) updateHit({ type: 'curve', id: c.id }); } }
    for (let i = freehands.length - 1; i >= 0; i--) { const f = freehands[i]; for (let j = 0; j < f.points.length; j++) if (Math.hypot(f.points[j].x - lx, f.points[j].y - ly) < hitZoneLine) updateHit({ type: 'freehand', id: f.id }); }

    // --- 5. Images (Avec compensation de la rotation) ---
    for (let i = images.length - 1; i >= 0; i--) {
        const img = images[i];
        let checkX = lx; let checkY = ly;
        if (img.angle) {
            const cx = img.x + img.w / 2; const cy = img.y + img.h / 2;
            checkX = Math.cos(-img.angle) * (lx - cx) - Math.sin(-img.angle) * (ly - cy) + cx;
            checkY = Math.sin(-img.angle) * (lx - cx) + Math.cos(-img.angle) * (ly - cy) + cy;
        }
        if (checkX >= img.x && checkX <= img.x + img.w && checkY >= img.y && checkY <= img.y + img.h) {
            updateHit({ type: 'image', id: img.id });
        }
    }

    return bestHit;
}

function clearSelection() { selectedItems = []; if (!['point', 'segment', 'droite', 'demi-droite', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon'].includes(mode) && !(typeof activeWidgets !== 'undefined' && activeWidgets['compass'])) { document.getElementById('bar-style').classList.remove('visible'); document.getElementById('bar-style').removeAttribute('data-dragged'); } document.getElementById('bar-style').classList.remove('ctx-zindex', 'ctx-lock'); draw(); }
// La forme d'un point, avec un repli sûr : un point existe, donc il se voit.
const FORMES_DE_POINT = ['circle', 'cross', 'square', 'pixel'];
function formeDuPoint(obj) {
    const f = obj && obj.shape;
    return FORMES_DE_POINT.includes(f) ? f : 'cross';
}

function isSelected(type, id) { return selectedItems.some(item => item.type === type && item.id === id); }

// L'objet cliqué fait-il DÉJÀ partie de ce qui est sélectionné, autrement que
// par lui-même ? Un point posé sur un segment sélectionné, ou un membre d'un
// groupe dont un autre membre est pris : cliquer dessus réduisait la sélection
// à ce seul objet, et le lot n'était plus déplaçable.
function appartientALaSelection(objInfo) {
    if (!objInfo || !selectedItems.length) return false;
    const obj = getObjectById(objInfo.type, objInfo.id);

    // Même groupe qu'un objet déjà sélectionné
    if (obj && obj.groupId && selectedItems.some(it => {
        const o = getObjectById(it.type, it.id);
        return o && o.groupId === obj.groupId;
    })) return true;

    // Un point qui porte une forme sélectionnée
    if (objInfo.type === 'point') {
        return selectedItems.some(it => {
            const o = getObjectById(it.type, it.id);
            if (!o) return false;
            if (o.p1_id === objInfo.id || o.p2_id === objInfo.id) return true;
            if (o.center_id === objInfo.id || o.edge_id === objInfo.id) return true;
            return Array.isArray(o.points) && o.points.includes(objInfo.id);
        });
    }
    return false;
}

// Ctrl+clic : l'objet entre dans la sélection s'il n'y est pas, en sort sinon.
function basculerDansLaSelection(objInfo) {
    const i = selectedItems.findIndex(it => it.type === objInfo.type && it.id === objInfo.id);
    if (i >= 0) selectedItems.splice(i, 1);
    else selectedItems.push({ type: objInfo.type, id: objInfo.id });
    if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
    if (typeof updateQuickMenu === 'function') updateQuickMenu();
}
function selectObject(objInfo) {
    selectedItems = [objInfo];
    if (objInfo.type !== 'image') {
        const obj = getObjectById(selectedItems[0].type, selectedItems[0].id);
        if (obj) {
            activeStyle.strokeColor = obj.strokeColor || obj.color; activeStyle.strokeOpacity = obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1;
            if (obj.fillColor !== undefined) { activeStyle.fillColor = obj.fillColor; activeStyle.fillOpacity = obj.fillOpacity; activeStyle.isFilled = obj.isFilled; }
            if (obj.shape !== undefined) activeStyle.pointShape = obj.shape; if (obj.width !== undefined) activeStyle.lineWidth = obj.width; if (obj.dash !== undefined) activeStyle.lineDash = obj.dash; if (obj.fontSize !== undefined) activeStyle.fontSize = obj.fontSize;
            if (obj.lineHeight !== undefined) activeStyle.lineHeight = obj.lineHeight;
            const lhInput = document.getElementById('text-line-height');
            if (lhInput) lhInput.value = activeStyle.lineHeight || Math.round(activeStyle.fontSize * 1.2);

            if (obj.arrowStart !== undefined) activeStyle.arrowStart = obj.arrowStart; else activeStyle.arrowStart = 0;
            if (obj.arrowEnd !== undefined) activeStyle.arrowEnd = obj.arrowEnd; else activeStyle.arrowEnd = 0;

            updateColorIndicator(); document.getElementById('line-width').value = activeStyle.lineWidth; document.getElementById('font-size').value = activeStyle.fontSize;
        }
    } updateStyleBarContext();
}
function syncStyleWithSelection() { if (selectedItems.length > 0) { selectObject(selectedItems[0]); } else { clearSelection(); } }

function deleteObject(type, id) {
    if (type === 'point') { points = points.filter(p => p.id !== id); segments = segments.filter(s => s.p1_id !== id && s.p2_id !== id); circles = circles.filter(c => c.center_id !== id && c.edge_id !== id); rectangles = rectangles.filter(r => r.p1_id !== id && r.p2_id !== id); curves = curves.filter(c => !c.points.includes(id)); polygons = polygons.filter(p => !p.points.includes(id)); }
    else if (type === 'segment') segments = segments.filter(s => s.id !== id);
    else if (type === 'circle') circles = circles.filter(c => c.id !== id);
    else if (type === 'rectangle') rectangles = rectangles.filter(r => r.id !== id);
    else if (type === 'text') texts = texts.filter(t => t.id !== id);
    else if (type === 'freehand') freehands = freehands.filter(f => f.id !== id);
    else if (type === 'curve') curves = curves.filter(c => c.id !== id);
    else if (type === 'polygon') polygons = polygons.filter(p => p.id !== id);
    else if (type === 'image') images = images.filter(i => i.id !== id);
    else if (type === 'arc') arcs = arcs.filter(a => a.id !== id);
}

// Couleur de base du bloc en cours de saisie (voir l'ouverture en mode texte)
let couleurBlocSaisie = null;

function finalizeText() {
    if (wysiwygText.style.display === 'block') {
        const val = wysiwygText.innerHTML.trim(); let hasChanged = false; // <-- On utilise innerHTML !

        const processMath = (textObj) => {
            if (val.includes('$')) {
                createMathImage(val, textObj.color || textObj.strokeColor, textObj.fontSize, (img, w, h) => {
                    if (img) { textObj.mathImg = img; textObj.mathW = w; textObj.mathH = h; }
                    else { textObj.mathImg = null; }
                    draw();
                });
            } else {
                textObj.mathImg = null;
            }
        };

        if (val !== '') {
            if (editingTextId) {
                const t = getObjectById('text', editingTextId);
                if (t && !t.locked) {
                    // Taille, police, alignement et interligne sont déjà écrits directement
                    // sur l'objet par la barre d'outils : seul le contenu se valide ici.
                    if (t.content !== val) {
                        t.content = val;
                        hasChanged = true; processMath(t);
                    }
                }
            } else if (tempTextLogicalPos) {
                const newText = { id: nextId++, x: tempTextLogicalPos.x, y: tempTextLogicalPos.y, content: val, color: couleurBlocSaisie || activeStyle.strokeColor, fontSize: activeStyle.fontSize, fontFamily: activeStyle.fontFamily || 'sans-serif', align: activeStyle.textAlign || 'left', lineHeight: activeStyle.lineHeight, z: globalZ++ };
                if (tempTextLogicalPos.colWidth) newText.colWidth = tempTextLogicalPos.colWidth;
                if (tempTextLogicalPos.isBubble) {
                    newText.isBubble = true;
                    newText.bubbleShape = tempTextLogicalPos.bubbleShape;
                    newText.bubblePad = tempTextLogicalPos.bubblePad;
                    newText.fixedWidth = tempTextLogicalPos.fixedWidth;
                    newText.fixedHeight = tempTextLogicalPos.fixedHeight;
                    newText.fillColor = tempTextLogicalPos.fillColor;
                }
                texts.push(newText); hasChanged = true; processMath(newText);
            }
        } else if (editingTextId) { deleteObject('text', editingTextId); hasChanged = true; }

        wysiwygText.style.display = 'none'; wysiwygText.innerText = ''; editingTextId = null; tempTextLogicalPos = null;
        couleurBlocSaisie = null;
        if (typeof oublierSelectionSaisie === 'function') oublierSelectionSaisie();
        if (hasChanged) { saveState(); draw(); }
    }
}
wysiwygText.addEventListener('blur', finalizeText);
// Le premier paragraphe d'une saisie est un simple nœud texte à la racine :
// aucune commande de bloc (titre, alignement, liste) ne peut s'y appliquer, et
// les rattrapages laissaient parfois une ligne vide surdimensionnée.
// On enveloppe donc toute suite d'éléments en ligne dans un <div>.
function normaliserLignesSaisie() {
    if (!wysiwygText) return;
    const estBloc = (n) => n.nodeType === 1 && /^(DIV|P|H1|H2|H3|UL|OL|LI|BLOCKQUOTE)$/.test(n.nodeName);

    // Repère la position du curseur pour la restituer après remaniement
    const sel = window.getSelection();
    let ancre = null, offset = 0;
    if (sel && sel.rangeCount && wysiwygText.contains(sel.anchorNode)) { ancre = sel.anchorNode; offset = sel.anchorOffset; }

    let modifie = false;
    let enfants = Array.from(wysiwygText.childNodes);
    let paquet = [];
    const vider = () => {
        if (!paquet.length) return;
        const vide = paquet.every(n => n.nodeType === Node.TEXT_NODE && !n.textContent.trim());
        if (!vide) {
            const bloc = document.createElement('div');
            wysiwygText.insertBefore(bloc, paquet[0]);
            paquet.forEach(n => bloc.appendChild(n));
            modifie = true;
        }
        paquet = [];
    };
    enfants.forEach(n => {
        if (estBloc(n)) { vider(); return; }
        if (n.nodeType === 1 && n.nodeName === 'BR') { paquet.push(n); vider(); return; }
        paquet.push(n);
    });
    vider();

    if (modifie && ancre && wysiwygText.contains(ancre)) {
        try {
            const r = document.createRange();
            r.setStart(ancre, Math.min(offset, ancre.length !== undefined ? ancre.length : offset));
            r.collapse(true);
            sel.removeAllRanges(); sel.addRange(r);
        } catch (e) { /* le curseur reste où le navigateur l'a laissé */ }
    }
}

// Applique un style de bloc (titre, paragraphe) à la ligne courante.
function applyBlockTag(tag) {
    normaliserLignesSaisie();
    const inTag = () => {
        const sel = window.getSelection();
        let n = sel && sel.anchorNode;
        while (n && n !== wysiwygText) {
            if (n.nodeType === 1 && n.nodeName.toLowerCase() === tag) return true;
            n = n.parentNode;
        }
        return false;
    };
    document.execCommand('formatBlock', false, tag === 'p' ? '<div>' : `<${tag}>`);
    if (tag === 'p' || inTag()) return;
    // Filet : uniquement si la zone est réellement dépourvue de bloc, sinon on
    // créerait un second bloc vide à côté de celui que formatBlock vient de poser
    if (wysiwygText.querySelector('div, p, h1, h2, h3, li')) return;

    document.execCommand('insertHTML', false, `<${tag}><span id="__cursor_anchor"></span></${tag}>`);
    const marker = document.getElementById('__cursor_anchor');
    if (marker && marker.parentNode) {
        const host = marker.parentNode;
        marker.remove();
        // Un bloc totalement vide ne peut pas recevoir le curseur : il lui faut
        // un <br>, sinon le curseur retombe avant le bloc et la frappe s'égare.
        if (!host.firstChild) host.appendChild(document.createElement('br'));
        const r = document.createRange();
        r.selectNodeContents(host); r.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
    }
}

wysiwygText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finalizeText(); canvas.focus(); }

    // Tabulation : retrait / retrait négatif dans les listes, sans quitter la saisie
    if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand(e.shiftKey ? 'outdent' : 'indent', false, null);
        return;
    }

    // Raccourcis de frappe : « - » puis espace = puce, « 1. » = liste numérotée,
    // « # » ou « ## » = titre. On les déclenche sur la barre d'espace.
    if (e.key === ' ') {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
        const node = sel.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const before = node.textContent.slice(0, sel.anchorOffset);
        // uniquement en tout début de ligne
        if (!/^\s*(-|\*|1\.|#|##)$/.test(before)) return;
        const token = before.trim();

        e.preventDefault();
        const range = document.createRange();
        range.setStart(node, sel.anchorOffset - token.length);
        range.setEnd(node, sel.anchorOffset);
        range.deleteContents();
        // Indispensable : on replace le curseur après la suppression, sinon la
        // commande suivante s'applique à une position périmée
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        // Une ligne vidée de son marqueur doit garder un <br>, sinon elle
        // fusionne avec la précédente et la commande porte sur la mauvaise ligne
        let blk = sel.anchorNode;
        while (blk && blk !== wysiwygText && !(blk.nodeType === 1 && /^(DIV|P|H1|H2|H3|LI)$/.test(blk.nodeName))) blk = blk.parentNode;
        if (blk && blk !== wysiwygText && !blk.textContent.trim() && !blk.querySelector('br')) {
            blk.appendChild(document.createElement('br'));
            const r2 = document.createRange();
            r2.selectNodeContents(blk); r2.collapse(true);
            sel.removeAllRanges(); sel.addRange(r2);
        }

        if (token === '-' || token === '*') document.execCommand('insertUnorderedList', false, null);
        else if (token === '1.') document.execCommand('insertOrderedList', false, null);
        else if (token === '#') applyBlockTag('h1');
        else if (token === '##') applyBlockTag('h2');
        if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
    }
});

// --- Collage depuis Word / LibreOffice / une page web ---
// On garde le sens (gras, italique, souligné, titres, listes, retours à la
// ligne) et on jette tout le reste : styles Word, polices, tableaux, images.
// Le petit HTML que le tableau sait rendre : b, i, u, listes, titres. Tout le
// reste du collage (styles Word, tableaux, images de puces…) est jeté.
function nettoyerHtmlColle(html) {
    const KEEP = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', UL: 'ul', OL: 'ol', LI: 'li', BR: 'br', P: 'div', DIV: 'div', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3' };
    // Word, Pages et LibreOffice envoient leur feuille de style avec le texte.
    // Sans cette liste, « p.p1 {margin: 0.0px…} » se collait tel quel sur le
    // tableau : ces balises et TOUT leur contenu partent à la poubelle.
    const POUBELLE = { STYLE: 1, SCRIPT: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1, NOSCRIPT: 1, BASE: 1, XML: 1, COLGROUP: 1, COL: 1 };
    const src = document.createElement('div');
    src.innerHTML = html;
    src.querySelectorAll('style, script, head, meta, link, title, noscript, base').forEach(n => n.remove());

    const clean = (node) => {
        const frag = document.createDocumentFragment();
        Array.from(node.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                frag.appendChild(document.createTextNode(child.textContent.replace(/\s+/g, ' ')));
                return;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) return;
            if (POUBELLE[child.nodeName]) return;

            // Word et LibreOffice portent le gras/italique par un style en ligne
            const cs = child.style || {};
            const emphases = [];
            if (/bold|^[6-9]00$/.test(cs.fontWeight || '')) emphases.push('b');
            if ((cs.fontStyle || '') === 'italic') emphases.push('i');
            if (((cs.textDecoration || '') + (cs.textDecorationLine || '')).includes('underline')) emphases.push('u');

            const tag = KEEP[child.nodeName];
            let inner = (tag === 'br') ? document.createDocumentFragment() : clean(child);
            emphases.forEach(t => { const e = document.createElement(t); e.appendChild(inner); inner = e; });

            if (!tag) { frag.appendChild(inner); return; } // on garde le contenu, pas la balise
            const el = document.createElement(tag);
            if (tag !== 'br') el.appendChild(inner);
            frag.appendChild(el);
        });
        return frag;
    };

    const outDiv = document.createElement('div');
    outDiv.appendChild(clean(src));

    // Entre deux paragraphes, le document d'origine laisse un saut de ligne.
    // Réduit à une espace par le nettoyage, il devenait une LIGNE VIDE entre
    // chaque ligne collée : le texte arrivait sur le tableau à double
    // interligne. Ces espaces entre blocs ne portent rien, on les retire.
    const BLOCS = new Set(['DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3']);
    const estBloc = (n) => n && n.nodeType === Node.ELEMENT_NODE && BLOCS.has(n.nodeName);
    Array.from(outDiv.childNodes).forEach(n => {
        if (n.nodeType !== Node.TEXT_NODE || n.textContent.trim()) return;
        if (estBloc(n.previousSibling) || estBloc(n.nextSibling)) n.remove();
    });
    outDiv.querySelectorAll('div, li, h1, h2, h3').forEach(bloc => {
        Array.from(bloc.childNodes).forEach(n => {
            if (n.nodeType !== Node.TEXT_NODE || n.textContent.trim()) return;
            if (estBloc(n.previousSibling) || estBloc(n.nextSibling)) n.remove();
        });
    });

    // Un paragraphe vraiment vide reste un saut de ligne voulu, pas deux.
    return outDiv.innerHTML.replace(/<div>\s*<\/div>/g, '<br>')
        .replace(/(<br>\s*){3,}/g, '<br><br>')
        .trim();
}

// Un texte sans mise en forme : une ligne du presse-papiers = une ligne sur
// le tableau. Les lignes vides en série sont ramenées à une seule — les
// traitements de texte en sèment beaucoup.
function texteBrutEnHtml(brut) {
    const lignes = String(brut || '').replace(/\r\n?/g, '\n').split('\n')
        .map(l => l.replace(/ /g, ' ').replace(/\s+$/, ''));
    const gardees = [];
    lignes.forEach(l => {
        if (l.trim() === '' && gardees.length && gardees[gardees.length - 1].trim() === '') return;
        gardees.push(l);
    });
    while (gardees.length && gardees[gardees.length - 1].trim() === '') gardees.pop();
    return gardees
        .map(l => '<div>' + (l.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) || '<br>') + '</div>')
        .join('');
}

// Ctrl+Maj+V colle SANS la mise en forme : c'est le geste habituel, et il
// évite d'avoir à nettoyer un collage trop riche après coup.
let collageSansMiseEnForme = false;

wysiwygText.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const html = collageSansMiseEnForme ? '' : dt.getData('text/html');
    const brut = (dt.getData('text/plain') || '').replace(/\r\n?/g, '\n');
    e.preventDefault();

    if (!html) {
        document.execCommand('insertHTML', false,
            brut.split('\n').map(l => l.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) || '<br>').join('<br>'));
    } else {
        document.execCommand('insertHTML', false, nettoyerHtmlColle(html) || '');
        if (typeof showToast === 'function') showToast('Collé avec la mise en forme — Ctrl+Maj+V pour ne coller que le texte');
    }

    // Rien ne reste en surbrillance : le curseur se pose à la fin du collage
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
    }
    collageSansMiseEnForme = false;
    if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
});

// Le raccourci arrive AVANT le collage : on lève un drapeau que le gestionnaire
// de collage consomme, ici comme sur le tableau.
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        collageSansMiseEnForme = true;
        setTimeout(() => { collageSansMiseEnForme = false; }, 400);
    }
}, true);

// Coller du texte SUR LE TABLEAU (hors saisie) : un bloc de texte apparaît,
// avec ses titres, son gras et ses listes. Avant, un Ctrl+V venu de Word ou
// de LibreOffice ne faisait rien du tout.
function collerTexteSurLeTableau(html, brut) {
    let contenu = html ? nettoyerHtmlColle(html) : '';
    if (!contenu) contenu = texteBrutEnHtml(brut);
    if (!contenu.replace(/<[^>]+>|&nbsp;|\s/g, '')) return false;

    const brutLisible = (brut || '').replace(/\s+/g, ' ').trim();
    const longue = brutLisible.length > 90 || /<(div|br|li|h[1-3])/i.test(contenu);
    const x = (mouseLogicalPos ? mouseLogicalPos.x : (window.innerWidth / 2 - panX) / zoom);
    const y = (mouseLogicalPos ? mouseLogicalPos.y : (window.innerHeight / 2 - panY) / zoom);

    const bloc = {
        id: nextId++, x, y, content: contenu,
        color: activeStyle.strokeColor, fontSize: activeStyle.fontSize,
        fontFamily: activeStyle.fontFamily || 'sans-serif', align: 'left',
        lineHeight: activeStyle.lineHeight, z: globalZ++
    };
    if (longue) bloc.colWidth = Math.min(900, Math.max(300, (window.innerWidth * 0.6) / zoom));
    texts.push(bloc);
    selectedItems = [{ type: 'text', id: bloc.id }];
    saveState();
    draw();
    if (typeof showToast === 'function') {
        showToast(html ? '📋 Texte collé — Ctrl+Maj+V pour ne coller que le texte' : '📋 Texte collé');
    }
    return true;
}
// Repli automatique : dès que la ligne atteint le bord du tableau, le bloc
// prend une largeur de colonne et le texte revient à la ligne tout seul.
// (Ajustable ensuite avec les poignées latérales.)
function autoWrapWhileTyping() {
    const t = editingTextId ? getObjectById('text', editingTextId) : null;
    const target = t || tempTextLogicalPos;
    if (!target || target.colWidth) return false;

    const left = wysiwygText.getBoundingClientRect().left;
    const available = (window.innerWidth - left - 30) / zoom;
    if (available < 120) return false;
    if (wysiwygText.scrollWidth / zoom <= available) return false;

    target.colWidth = Math.round(available);
    updateWysiwygPosition();
    if (t) draw();
    return true;
}

// Centrer ou aligner à droite n'a de sens que si le bloc est plus large que la
// ligne. Sans colonne, un bloc fait exactement la largeur de son texte : le
// bouton semblait mort. On lui donne donc un cadre, ajustable ensuite avec les
// poignées latérales.
function donnerUnCadreAuBloc(alignMode) {
    if (alignMode === 'left') return;
    const t = editingTextId ? getObjectById('text', editingTextId) : null;
    const cible = t || tempTextLogicalPos;
    if (!cible || cible.colWidth) return;

    const naturelle = Math.max(60, (wysiwygText.scrollWidth || 120) / (zoom || 1));
    const gauche = wysiwygText.getBoundingClientRect().left;
    const disponible = (window.innerWidth - gauche - 30) / (zoom || 1);
    // Un petit texte ne doit pas se retrouver avec un cadre large comme l'écran
    const plafond = Math.max(naturelle * 3, 280);
    const largeur = Math.round(Math.max(naturelle, Math.min(disponible, plafond)));
    if (largeur <= naturelle + 4) return;

    cible.colWidth = largeur;
    if (t && typeof draw === 'function') draw();
}

// En centré, la boîte de saisie doit rester centrée sur son ancre pendant la frappe
wysiwygText.addEventListener('input', () => {
    autoWrapWhileTyping();
    const t = editingTextId ? getObjectById('text', editingTextId) : null;
    const align = t ? (t.align || 'left') : (activeStyle.textAlign || 'left');
    if (align === 'center') updateWysiwygPosition();
    // Le bloc grandit à la frappe : la barre placée en dessous finirait par le
    // recouvrir si on ne la replaçait pas.
    else if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
});

canvas.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas) return;
    activePointers.set(e.pointerId, e); canvas.setPointerCapture(e.pointerId);

    const rawPos = getRawLogicalPos(e);
    lastRawX = rawPos.x; lastRawY = rawPos.y;

    // --- TAMPON TACTILE : au doigt/stylet, le contact affiche le fantôme, la pose se fait au relâcher ---
    if (touchStampPointerId !== null) return; // une pose de tampon est déjà en cours, on ignore les autres doigts
    if ((e.pointerType === 'touch' || e.pointerType === 'pen') && activePointers.size === 1
        && mode !== 'pointer' && typeof hasPendingStamp === 'function' && hasPendingStamp()) {
        touchStampPointerId = e.pointerId;
        mouseLogicalPos = { x: rawPos.x, y: rawPos.y };
        draw();
        return;
    }

    // Si un plugin gère le clic (ex: l'outil fraction est actif), on arrête le code normal
    const avantTampon = nextId;
    if (PluginManager.trigger('onPointerDown', rawPos, e)) { apresPoseDeTampon(avantTampon); return; }

    // --- INTERCEPTION INSTRUMENTS ---
    let targetWidget = null;
    let wType = '';

    // Un instrument attrapé reste attrapable quel que soit l'outil en cours :
    // on le pousse, on le tourne, on le rallonge, puis on reprend le tracé là
    // où on en était. Le trait, lui, se fait le long du bord — donc juste à
    // côté de l'instrument, pas dessus.
    for (let i = widgetZOrder.length - 1; i >= 0; i--) {
        const type = widgetZOrder[i];
        if (!activeWidgets[type]) continue;
        const widget = widgets[type];
        const zone = widget.getHitZone(rawPos.x, rawPos.y);
        if (zone) {
            targetWidget = widget; wType = type;
            // On remonte le widget cliqué
            widgetZOrder.splice(i, 1); widgetZOrder.push(type);
            break;
        }
    }

    if (targetWidget) {
        const zone = targetWidget.getHitZone(rawPos.x, rawPos.y);
        if (zone === 'toggleSwap' && targetWidget instanceof ProtractorWidget) targetWidget.isReversed = !targetWidget.isReversed;
        else if (zone === 'toggleLock' && targetWidget instanceof ProtractorWidget) targetWidget.isLocked = !targetWidget.isLocked;
        else if (zone === 'toggleDouble' && targetWidget instanceof ProtractorWidget) targetWidget.showDouble = !targetWidget.showDouble;
        else if (zone === 'toggleSlide' && targetWidget instanceof SetSquareWidget) targetWidget.slideMode = !targetWidget.slideMode;
        else {
            draggedWidget = targetWidget;
            draggedWidgetMode = zone;
            if (zone === 'rotate') widgetRotationOffset = Math.atan2(rawPos.y - targetWidget.y, rawPos.x - targetWidget.x) - targetWidget.angle;
            if (zone === 'slideX' || zone === 'slideY') { dragStartMouse = { x: rawPos.x, y: rawPos.y }; dragStartWidget = { x: targetWidget.x, y: targetWidget.y }; }
            if (zone === 'move') { widgetOffset.x = rawPos.x - targetWidget.x; widgetOffset.y = rawPos.y - targetWidget.y; }
            // La poignée ↔ est posée à côté de la mine, pas dessus : sans
            // mémoriser l'écart au moment de la prise, le compas s'ouvrirait
            // d'un coup de la largeur de la pastille.
            if (zone === 'resize' && targetWidget instanceof CompassWidget) {
                ecartPriseCompas = targetWidget.radius
                    - Math.hypot(rawPos.x - targetWidget.x, rawPos.y - targetWidget.y);
            }

            // Si on attrape la mine du compas on lance le tracé
            if (targetWidget instanceof CompassWidget && zone === 'trace') {
                targetWidget.isTracing = true;
                targetWidget.startAngle = targetWidget.angle;
                targetWidget.lastMouseAngle = Math.atan2(rawPos.y - targetWidget.y, rawPos.x - targetWidget.x);
                targetWidget.totalRotation = 0;
                targetWidget.minRotation = 0;
                targetWidget.maxRotation = 0;
            }
        }
        draw();
        return;
    }

    if (isCropMode) {
        cropRect = { startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY };
        document.getElementById('export-popover').classList.remove('visible');
        return;
    }

    if (activePointers.size === 2) {
        isPanningView = true; const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        initialPinchCenter = { x: (pts[0].clientX + pts[1].clientX) / 2, y: (pts[0].clientY + pts[1].clientY) / 2 };
        initialPanX = panX; initialPanY = panY; initialZoom = zoom; updateCursor(); return;
    }

    if (wysiwygText.style.display === 'block') { finalizeText(); return; }

    lastMouseX = e.clientX; lastMouseY = e.clientY;
    lastDownClientX = e.clientX; lastDownClientY = e.clientY;

    if (e.button === 2 || e.button === 1 || isSpacePressed || mode === 'move') { isPanningView = true; updateCursor(); return; }

    const clickedObj = findObjectAt(rawPos.x, rawPos.y);
    let actionPos = positionAimantee(rawPos);
    if (clickedObj && clickedObj.type === 'point') actionPos = { x: getObjectById('point', clickedObj.id).x, y: getObjectById('point', clickedObj.id).y };

    if (isZoomBoxing && zoomBox) {
        zoomBox.endX = rawPos.x;
        zoomBox.endY = rawPos.y;
        requestAnimationFrame(draw);
        return;
    }

    if (mode === 'laser') {
        currentLaserStroke = [];
        laserStrokes.push(currentLaserStroke);
        currentLaserStroke.push({ x: rawPos.x, y: rawPos.y, time: Date.now() });
        requestAnimationFrame(draw);
        return;
    }

    if (mode === 'postit') {
        clearSelection();
        isDrawingPostit = true;
        postitBox = { startX: rawPos.x, startY: rawPos.y, endX: rawPos.x, endY: rawPos.y };
        updateCursor(); draw(); return;
    }

    if (mode === 'eraser') {
        if (clickedObj && clickedObj.type !== 'handle') {
            const obj = getObjectById(clickedObj.type, clickedObj.id);
            if (obj && obj.locked) { showToast("Cet objet est verrouillé"); return; }
            deleteObject(clickedObj.type, clickedObj.id); clearSelection(); saveState(); draw();
        }
        return;
    }

    if (mode === 'freehand' || mode === 'highlighter') {
        isDrawingFreehand = true;
        const pressure = (e.pointerType === 'pen' && e.pressure > 0) ? e.pressure : 0.5;
        const isH = (mode === 'highlighter');

        currentFreehand = {
            id: nextId++,
            points: [{ x: actionPos.x, y: actionPos.y, p: pressure }],
            color: activeStyle.strokeColor,
            width: isH ? (activeStyle.lineWidth * 6) : activeStyle.lineWidth,
            dash: activeStyle.lineDash,
            isHighlighter: isH,
            arrowStart: activeStyle.arrowStart,
            arrowEnd: activeStyle.arrowEnd,
            z: globalZ++
        };
        clearSelection();
        return;
    }

    // En mode « page », glisser DANS le document le fait coulisser dans son
    // cadre : l'objet, lui, ne bouge pas.
    const docChoisi = (typeof documentSelectionne === 'function') ? documentSelectionne() : null;
    if (docChoisi && estUnDocumentPose(docChoisi) && modeDocument === 'page' && !docChoisi.locked
        && clickedObj && clickedObj.type === 'image' && clickedObj.id === docChoisi.id) {
        if (demarrerGlissePage(docChoisi, rawPos)) { updateCursor(); return; }
    }

    if (clickedObj && clickedObj.type === 'handle') { draggedHandle = clickedObj.name; isDraggingObjs = true; return; }

    if (mode === 'pointer') {
        // Ctrl (ou Cmd) et Maj ajoutent ou retirent un objet de la sélection,
        // sans repartir de zéro : c'est le geste attendu partout ailleurs.
        const enPlus = e && (e.ctrlKey || e.metaKey || e.shiftKey);
        if (clickedObj) {
            if (enPlus) {
                basculerDansLaSelection(clickedObj);
                updateCursor(); draw(); return;      // on ajuste, on ne déplace pas
            }
            // Cliquer la poignée d'un objet déjà pris dans la sélection ne doit
            // pas la réduire à ce seul point : on garde le lot pour le déplacer.
            if (!isSelected(clickedObj.type, clickedObj.id) && !appartientALaSelection(clickedObj)) {
                selectObject(clickedObj);
            }
            isDraggingObjs = true;
        }
        else if (enPlus) { /* on garde la sélection : Ctrl+clic dans le vide n'efface rien */ }
        else { clearSelection(); isSelectingBox = true; selectionBox = { startX: rawPos.x, startY: rawPos.y, endX: rawPos.x, endY: rawPos.y }; }
        updateCursor(); draw(); return;
    }

    if (mode === 'zoom-box') {
        clearSelection();
        isZoomBoxing = true;
        zoomBox = { startX: rawPos.x, startY: rawPos.y, endX: rawPos.x, endY: rawPos.y };
        updateCursor(); draw(); return;
    }

    clearSelection();

    if (mode === 'point') {
        // Un croisement est forcément « sur » deux tracés : sans cette
        // exception, on ne pourrait jamais y poser le point d'intersection.
        const surUnCroisement = actionPos.source === 'intersection' && (!clickedObj || clickedObj.type !== 'point');
        if (!clickedObj || surUnCroisement) {
            const pt = { id: nextId++, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ };
            // Posé sur un croisement, le point appartient aux deux objets : il
            // les suivra si on les déplace.
            if (surUnCroisement && actionPos.refs) pt.depend = { refs: actionPos.refs };
            points.push(pt);
            saveState();
        }
    }
    else if (mode === 'segment' || mode === 'droite' || mode === 'demi-droite' || mode === 'circle' || mode === 'rectangle') {
        let ptId = (clickedObj && clickedObj.type === 'point') ? clickedObj.id : nextId++;
        if (!clickedObj || clickedObj.type !== 'point') { points.push({ id: ptId, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ }); saveState(); }

        if (creationStartPointId === null) { creationStartPointId = ptId; mouseLogicalPos = actionPos; }
        else {
            if (creationStartPointId !== ptId) {
                if (mode === 'segment' || mode === 'droite' || mode === 'demi-droite') segments.push({ id: nextId++, p1_id: creationStartPointId, p2_id: ptId, lineType: mode, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, z: globalZ++ });
                if (mode === 'circle') circles.push({ id: nextId++, center_id: creationStartPointId, edge_id: ptId, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ });
                if (mode === 'rectangle') rectangles.push({ id: nextId++, p1_id: creationStartPointId, p2_id: ptId, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ });
                saveState();
            }
            creationStartPointId = null; mouseLogicalPos = null;
        }
    }
    else if (mode === 'curve') {
        if (currentCurvePoints.length > 2 && clickedObj && clickedObj.id === currentCurvePoints[0]) {
            curves.push({ id: nextId++, points: [...currentCurvePoints], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, closed: true, z: globalZ++ });
            saveState(); showToast("Boucle fermée !"); currentCurvePoints = []; mouseLogicalPos = null;
        } else {
            let ptId = (clickedObj && clickedObj.type === 'point') ? clickedObj.id : nextId++;
            if (!clickedObj || clickedObj.type !== 'point') { points.push({ id: ptId, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ }); saveState(); }
            currentCurvePoints.push(ptId); mouseLogicalPos = actionPos;
        }
    }
    else if (mode === 'polygon') {
        if (currentPolygonPoints.length >= 3 && clickedObj && clickedObj.id === currentPolygonPoints[0]) {
            polygons.push({ id: nextId++, points: [...currentPolygonPoints], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, isClosed: true, z: globalZ++ });
            saveState(); showToast("Polygone fermé !"); currentPolygonPoints = []; mouseLogicalPos = null;
        } else {
            let ptId = (clickedObj && clickedObj.type === 'point') ? clickedObj.id : nextId++;
            if (!clickedObj || clickedObj.type !== 'point') { points.push({ id: ptId, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ }); saveState(); }
            currentPolygonPoints.push(ptId); mouseLogicalPos = actionPos;
        }
    }

    else if (mode === 'text') {
        if (!clickedObj || clickedObj.type !== 'text') {
            const offsetY = activeStyle.fontSize * 0.12;
            tempTextLogicalPos = {
                x: actionPos.x,
                y: actionPos.y - offsetY
            };
            // Couleur du bloc = celle en vigueur À L'OUVERTURE. Choisir une
            // autre couleur ensuite ne doit repeindre que ce qui suit, pas ce
            // qui est déjà écrit.
            couleurBlocSaisie = activeStyle.strokeColor;

            wysiwygText.style.display = 'block';
            wysiwygText.style.fontFamily = 'sans-serif';
            const lh = activeStyle.lineHeight || Math.round(activeStyle.fontSize * 1.2);
            appliquerInterligneSaisie(lh, activeStyle.fontSize);
            wysiwygText.style.padding = '0';

            updateWysiwygPosition();

            setTimeout(() => {
                wysiwygText.focus();
                if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
            }, 10);
        } else {
            // CORRECTION : Si on clique sur un texte existant en mode "T", on l'attrape direct !
            setMode('pointer');
            selectObject(clickedObj);
            isDraggingObjs = true;
        }
    }

    updateCursor(); draw();
});

canvas.addEventListener('dblclick', (e) => {
    const rawPos = getRawLogicalPos(e); const clickedObj = findObjectAt(rawPos.x, rawPos.y);
    if (clickedObj && clickedObj.type === 'image') {
        const imgObj = getObjectById('image', clickedObj.id);
        if (imgObj && imgObj.pluginData && imgObj.pluginData.id) {
            const plugin = PluginManager.plugins[imgObj.pluginData.id];
            if (plugin && typeof plugin.edit === 'function') {
                // ✅ On ferme le menu contextuel d'image (cadenas/proportions/crop/corbeille)
                // avant d'ouvrir la modale du plugin, sinon il flotte par-dessus
                const quickMenu = document.getElementById('quick-edit-menu');
                if (quickMenu) quickMenu.classList.remove('visible');
                clearSelection();
                plugin.edit(imgObj);
                return;
            }
            // Tampon issu d'un plugin qui ne propose pas de réédition :
            // on le dit, plutôt que de laisser croire à un double-clic manqué.
            if (plugin) { showToast("Ce tampon ne se réédite pas."); return; }
        }
    }
    if (clickedObj && clickedObj.type === 'text') {
        const t = getObjectById('text', clickedObj.id);
        if (t.locked) return;
        editingTextId = t.id;

        // NOUVEAU : On utilise innerHTML pour récupérer le gras/couleur sauvegardé !
        wysiwygText.innerHTML = t.content;

        // La barre d'outils lit activeStyle : on la synchronise sur le texte édité
        activeStyle.textAlign = t.align || 'left';

        wysiwygText.style.display = 'block';
        // Position, police, taille, interligne, couleur et alignement : tout est
        // dérivé de l'objet édité, avec la même convention que le rendu canvas.
        updateWysiwygPosition();
        setTimeout(() => {
            wysiwygText.focus();
            const range = document.createRange(); range.selectNodeContents(wysiwygText); range.collapse(false); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);

            // --- NOUVEAU : On force l'affichage de la barre ici ! ---
            if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
        }, 10);
    }
    else if (mode === 'curve' && currentCurvePoints.length > 0) {
        if (currentCurvePoints.length > 2) { currentCurvePoints.pop(); curves.push({ id: nextId++, points: [...currentCurvePoints], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, closed: false, z: globalZ++ }); saveState(); showToast("Courbe validée !"); }
        else if (currentCurvePoints.length === 2) { segments.push({ id: nextId++, p1_id: currentCurvePoints[0], p2_id: currentCurvePoints[1], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, z: globalZ++ }); saveState(); }
        currentCurvePoints = []; mouseLogicalPos = null; draw();
    }
    else if (mode === 'polygon' && currentPolygonPoints.length > 0) {
        if (currentPolygonPoints.length >= 3) { currentPolygonPoints.pop(); polygons.push({ id: nextId++, points: [...currentPolygonPoints], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, isClosed: false, z: globalZ++ }); saveState(); showToast("Ligne brisée validée !"); }
        else if (currentPolygonPoints.length === 2) { segments.push({ id: nextId++, p1_id: currentPolygonPoints[0], p2_id: currentPolygonPoints[1], color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, z: globalZ++ }); saveState(); }
        currentPolygonPoints = []; mouseLogicalPos = null; draw();
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, e);
    const rawPos = getRawLogicalPos(e);
    lastRawX = rawPos.x; lastRawY = rawPos.y;

    // Tampon tactile en cours : le fantôme suit le doigt/stylet
    if (touchStampPointerId !== null) {
        if (e.pointerId === touchStampPointerId) {
            mouseLogicalPos = { x: rawPos.x, y: rawPos.y };
            requestAnimationFrame(draw);
        }
        return;
    }

    if (isLoupeActive) requestAnimationFrame(draw);
    if (PluginManager.trigger('onPointerMove', rawPos, e)) return;

    if (glissePage) { poursuivreGlissePage(rawPos); return; }

    if (draggedWidget) {
        const w = draggedWidget;
        const modeW = draggedWidgetMode;
        const rx = rawPos.x;
        const ry = rawPos.y;

        if (modeW === 'move') {
            const pose = poserOutil(w, { x: rx - widgetOffset.x, y: ry - widgetOffset.y });
            w.x = pose.x;
            w.y = pose.y;
        } else if (modeW === 'slideX' || modeW === 'slideY') {
            const dx = rx - dragStartMouse.x;
            const dy = ry - dragStartMouse.y;
            let axisAngle = w.angle;
            if (modeW === 'slideY') axisAngle += Math.PI / 2;
            const dot = dx * Math.cos(axisAngle) + dy * Math.sin(axisAngle);
            w.x = dragStartWidget.x + dot * Math.cos(axisAngle);
            w.y = dragStartWidget.y + dot * Math.sin(axisAngle);
        } else if (modeW === 'rotate') {
            if (w instanceof CompassWidget) {
                const bout = pointerCompasVers(w, w.x + w.radius * Math.cos(Math.atan2(ry - w.y, rx - w.x) - widgetRotationOffset),
                                                  w.y + w.radius * Math.sin(Math.atan2(ry - w.y, rx - w.x) - widgetRotationOffset));
                w.angle = Math.atan2(bout.y - w.y, bout.x - w.x);
            } else {
                w.angle = Math.atan2(ry - w.y, rx - w.x) - widgetRotationOffset;
            }
        } else if (modeW === 'resize' && w instanceof CompassWidget) {
            // On vise la mine, pas le doigt : on rend l'écart de la prise
            const dx = rx - w.x, dy = ry - w.y;
            const d = Math.hypot(dx, dy);
            const vise = Math.max(10, d + ecartPriseCompas);
            const mx = w.x + (d ? dx / d : 1) * vise;
            const my = w.y + (d ? dy / d : 0) * vise;
            // L'écartement se prend sur un point de la figure quand il y en a un
            const bout = pointerCompasVers(w, mx, my);
            w.radius = Math.hypot(bout.x - w.x, bout.y - w.y);
            w.angle = Math.atan2(bout.y - w.y, bout.x - w.x);
        } else if (modeW === 'resize' && w instanceof RulerWidget) {
            const local = w.toLocal(rx, ry);
            if (local.x > 100) w.width = local.x;
        } else if (modeW === 'resizeWidth' && w instanceof SetSquareWidget) {
            const local = w.toLocal(rx, ry);
            if (local.x > 80) w.width = local.x;
        } else if (modeW === 'resizeHeight' && w instanceof SetSquareWidget) {
            const local = w.toLocal(rx, ry);
            if (local.y > 80) w.height = local.y;
        } else if (modeW === 'trace' && w instanceof CompassWidget) {
            let mouseAngle = Math.atan2(ry - w.y, rx - w.x);
            let diff = mouseAngle - w.lastMouseAngle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            w.totalRotation += diff;
            w.angle = w.startAngle + w.totalRotation;
            w.lastMouseAngle = mouseAngle;

            // Un compas laisse son trait : revenir sur ses pas n'efface pas ce
            // qu'on vient de tracer. On garde donc le plus loin atteint de
            // chaque côté, et l'arc va de l'un à l'autre — repartir en sens
            // inverse au-delà du départ allonge l'arc de l'autre côté.
            w.minRotation = Math.min(w.minRotation || 0, w.totalRotation);
            w.maxRotation = Math.max(w.maxRotation || 0, w.totalRotation);
            const etendue = Math.min(w.maxRotation - w.minRotation, Math.PI * 2);
            const debut = w.startAngle + w.minRotation;

            if (etendue > 0.001) {
                if (!currentTracingArc) {
                    currentTracingArc = {
                        id: nextId++,
                        type: 'arc',
                        cx: w.x, cy: w.y, radius: w.radius,
                        startAngle: debut, endAngle: debut + etendue,
                        counterClockwise: false,
                        color: activeStyle.strokeColor,
                        width: activeStyle.lineWidth,
                        dash: activeStyle.lineDash,
                        z: globalZ++
                    };
                } else {
                    currentTracingArc.startAngle = debut;
                    currentTracingArc.endAngle = debut + etendue;
                    currentTracingArc.counterClockwise = false;
                    currentTracingArc.radius = w.radius;
                    currentTracingArc.cx = w.x;
                    currentTracingArc.cy = w.y;
                }
            }
        }
        requestAnimationFrame(draw);
        updateCursor();
        return;
    }

    if (isCropMode) {
        if (cropRect && activePointers.has(e.pointerId)) {
            cropRect.endX = e.clientX; cropRect.endY = e.clientY;
            requestAnimationFrame(draw);
        }
        return;
    }

    if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const currentDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        const currentCenter = { x: (pts[0].clientX + pts[1].clientX) / 2, y: (pts[0].clientY + pts[1].clientY) / 2 };
        const zoomDelta = currentDist / initialPinchDist; let newZoom = initialZoom * zoomDelta;
        if (newZoom < 0.2) newZoom = 0.2; if (newZoom > 10) newZoom = 10;
        // Le point du tableau saisi au départ reste sous le milieu des deux
        // doigts : le repère est le centre INITIAL, sinon deux doigts qui
        // glissent sans s'écarter ne déplacent pas la vue.
        const depart = initialPinchCenter || currentCenter;
        const mouseLogX = (depart.x - initialPanX) / initialZoom; const mouseLogY = (depart.y - initialPanY) / initialZoom;
        zoom = newZoom; document.getElementById('zoom-slider').value = zoom;
        panX = currentCenter.x - mouseLogX * zoom; panY = currentCenter.y - mouseLogY * zoom;
        updateWysiwygPosition();
        requestAnimationFrame(draw); return;
    }

    if (e.buttons === 0 && !activePointers.has(e.pointerId)) { isPanningView = false; isDraggingObjs = false; isDrawingFreehand = false; isSelectingBox = false; draggedHandle = null; textResizeHint = null; activeGuides = { x: [], y: [] }; }

    if (mode === 'laser' && currentLaserStroke) {
        // Lissage du tracé : on suit le pointeur avec un filtre passe-bas
        // pour éviter les angles vifs dus à l'échantillonnage.
        const last = currentLaserStroke[currentLaserStroke.length - 1];
        let nx = rawPos.x, ny = rawPos.y;
        if (last) {
            nx = last.x + (rawPos.x - last.x) * LASER_SMOOTHING;
            ny = last.y + (rawPos.y - last.y) * LASER_SMOOTHING;
            // Pointeur quasi immobile : on rafraîchit juste le point, sans en empiler
            if (Math.hypot(nx - last.x, ny - last.y) < 0.8 / zoom) {
                last.time = Date.now();
                requestAnimationFrame(draw);
                return;
            }
        }
        currentLaserStroke.push({ x: nx, y: ny, time: Date.now() });
        requestAnimationFrame(draw);
        return;
    }

    if (isPanningView && activePointers.size < 2) {
        panX += (e.clientX - lastMouseX);
        panY += (e.clientY - lastMouseY);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        updateWysiwygPosition();
        requestAnimationFrame(draw);
        return;
    }

    // --- MAGNÉTISME ---
    // À main levée, seuls les outils de géométrie aimantent : un tracé libre
    // qui saute de carreau en carreau ne ressemblerait plus à rien.
    let smartPos = { x: rawPos.x, y: rawPos.y };
    if (magnetMode && !isDraggingObjs && !draggedHandle && !draggedWidget) {
        const mainLevee = isDrawingFreehand || mode === 'freehand' || mode === 'highlighter';
        smartPos = positionAimantee(rawPos, mainLevee ? { sansGrille: true, sansIntersection: true } : {});
    }

    if (isDrawingFreehand && currentFreehand) {
        const lastPt = currentFreehand.points[currentFreehand.points.length - 1];
        if (Math.hypot(smartPos.x - lastPt.x, smartPos.y - lastPt.y) > 2 / zoom) {
            const pressure = (e.pointerType === 'pen' && e.pressure > 0) ? e.pressure : 0.5;
            currentFreehand.points.push({ x: smartPos.x, y: smartPos.y, p: pressure });
            requestAnimationFrame(draw);
        }
        if (!currentFreehand.isHighlighter) {
            clearTimeout(shapeRecognitionTimeout);
            shapeRecognitionTimeout = setTimeout(() => {
                if (isDrawingFreehand) recognizeShape();
            }, 600);
        }
        return;
    }

    if (isSelectingBox) { selectionBox.endX = rawPos.x; selectionBox.endY = rawPos.y; requestAnimationFrame(draw); return; }
    if (isZoomBoxing) { zoomBox.endX = rawPos.x; zoomBox.endY = rawPos.y; requestAnimationFrame(draw); return; }
    if (isDrawingPostit && postitBox) { postitBox.endX = rawPos.x; postitBox.endY = rawPos.y; requestAnimationFrame(draw); return; }

    hoveredObj = findObjectAt(rawPos.x, rawPos.y);

    if (mode === 'curve' && currentCurvePoints.length > 2 && !hoveredObj) { const firstPt = getObjectById('point', currentCurvePoints[0]); if (firstPt && Math.hypot(rawPos.x - firstPt.x, rawPos.y - firstPt.y) < 15 / zoom) hoveredObj = { type: 'point', id: firstPt.id }; }
    if (mode === 'polygon' && currentPolygonPoints.length > 2 && !hoveredObj) { const firstPt = getObjectById('point', currentPolygonPoints[0]); if (firstPt && Math.hypot(rawPos.x - firstPt.x, rawPos.y - firstPt.y) < 15 / zoom) hoveredObj = { type: 'point', id: firstPt.id }; }

    if (hoveredObj && hoveredObj.type === 'point') mouseLogicalPos = { x: getObjectById('point', hoveredObj.id).x, y: getObjectById('point', hoveredObj.id).y };
    else mouseLogicalPos = smartPos;

    if ((mode === 'segment' || mode === 'droite' || mode === 'demi-droite') && creationStartPointId && !hoveredObj) {
        const startP = getObjectById('point', creationStartPointId);
        if (startP) {
            const dx = mouseLogicalPos.x - startP.x; const dy = mouseLogicalPos.y - startP.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 5 / zoom) {
                const snapThresh = 8 / zoom; // Magnétisme "très proche" en pixels
                if (Math.abs(dy) < snapThresh) {
                    mouseLogicalPos.y = startP.y;
                } else if (Math.abs(dx) < snapThresh) {
                    mouseLogicalPos.x = startP.x;
                }
            }
        }
    }

    activeGuides = { x: [], y: [] };

    if (draggedHandle && selectedItems.length === 1 && (selectedItems[0].type === 'image' || selectedItems[0].type === 'text')) {
        const type = selectedItems[0].type;
        const obj = getObjectById(type, selectedItems[0].id);
        if (!obj.locked) {
            if (draggedHandle === 'ROT') {
                let cx, cy;
                if (type === 'image') { cx = obj.x + obj.w / 2; cy = obj.y + obj.h / 2; }
                else { cx = (obj._cachedStartX || obj.x) + (obj._cachedW || 100) / 2; cy = obj.y + (obj._cachedH || 50) / 2; }
                obj.angle = Math.atan2(rawPos.y - cy, rawPos.x - cx) + Math.PI / 2;
            }
            else if (draggedHandle === 'TAIL' && obj.isBubble) {
                obj.tailX = rawPos.x;
                obj.tailY = rawPos.y;
            }
            else if (draggedHandle === 'BUBBLE_RESIZE' && obj.isBubble) {
                let cx = obj._cachedStartX + obj._cachedW / 2;
                let cy = obj.y + obj._cachedH / 2;
                let uX = rawPos.x; let uY = rawPos.y;
                if (obj.angle) {
                    uX = Math.cos(obj.angle) * (rawPos.x - cx) - Math.sin(obj.angle) * (rawPos.y - cy) + cx;
                    uY = Math.sin(obj.angle) * (rawPos.x - cx) + Math.cos(obj.angle) * (rawPos.y - cy) + cy;
                }
                let dx = uX - (obj._cachedStartX + obj._cachedW);
                let dy = uY - (obj.y + obj._cachedH);
                obj.bubblePad = Math.max(10, Math.max(dx, dy));
            }
            else if (type === 'text') {
                // Côtés = largeur de colonne (le texte se replie, la police ne bouge pas)
                // Coins  = agrandissement proportionnel (police + colonne)
                const angle = obj.angle || 0;
                const wNow = obj._cachedW || 100, hNow = obj._cachedH || 50;
                const sxNow = obj._cachedStartX !== undefined ? obj._cachedStartX : obj.x;
                const cX = sxNow + wNow / 2, cY = obj.y + hNow / 2;
                const unrot = (px, py) => ({
                    x: Math.cos(-angle) * (px - cX) - Math.sin(-angle) * (py - cY) + cX,
                    y: Math.sin(-angle) * (px - cX) + Math.cos(-angle) * (py - cY) + cY
                });
                const now = unrot(rawPos.x, rawPos.y);
                const prevRaw = getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY });
                const prev = unrot(prevRaw.x, prevRaw.y);
                const isCorner = ['TL', 'TR', 'BL', 'BR'].includes(draggedHandle);
                const minCol = (obj.fontSize || 24) * 3;

                if (!isCorner) {
                    const dx = now.x - prev.x;
                    let col = obj.colWidth || wNow;
                    if (draggedHandle === 'R') col += dx;
                    else { col -= dx; }
                    col = Math.max(minCol, col);
                    if (draggedHandle === 'L') obj.x += (obj.colWidth || wNow) - col;
                    obj.colWidth = col;
                    textResizeHint = `Colonne : ${Math.round(col)} px`;
                } else {
                    // Facteur d'échelle : distance au coin opposé, qui reste fixe
                    const ax = draggedHandle.includes('L') ? sxNow + wNow : sxNow;
                    const ay = draggedHandle.includes('T') ? obj.y + hNow : obj.y;
                    const dNow = Math.hypot(now.x - ax, now.y - ay);
                    const dPrev = Math.hypot(prev.x - ax, prev.y - ay);
                    let k = (dPrev > 2) ? dNow / dPrev : 1;
                    k = Math.max(0.7, Math.min(1.4, k));

                    const oldSize = obj.fontSize || 24;
                    const newSize = Math.max(8, Math.min(400, oldSize * k));
                    const ratio = newSize / oldSize;
                    obj.fontSize = Math.round(newSize * 10) / 10;
                    if (obj.lineHeight) obj.lineHeight = Math.round(obj.lineHeight * ratio * 10) / 10;
                    if (obj.colWidth) obj.colWidth = obj.colWidth * ratio;
                    if (draggedHandle.includes('L')) obj.x -= wNow * (ratio - 1);
                    if (draggedHandle.includes('T')) obj.y -= hNow * (ratio - 1);
                    textResizeHint = `Taille : ${Math.round(obj.fontSize)} px`;
                }
            }
            else if (type === 'image') {
                const angle = obj.angle || 0;
                const dxRaw = rawPos.x - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).x;
                const dyRaw = rawPos.y - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).y;

                const dx = Math.cos(-angle) * dxRaw - Math.sin(-angle) * dyRaw;
                const dy = Math.sin(-angle) * dxRaw + Math.cos(-angle) * dyRaw;

                const scaleX = obj.cw / obj.w;
                const scaleY = obj.ch / obj.h;
                // Une image dont le fichier manque n'a pas de taille naturelle :
                // sans ce garde-fou, la saisie d'une poignée plantait le tableau.
                const source = imageCache[obj.src];
                const natW = source ? source.naturalWidth : (obj.cw || obj.w);
                const natH = source ? source.naturalHeight : (obj.ch || obj.h);

                // ========================================================
                // 🛠️ MOTEUR DE REDIMENSIONNEMENT & ROGNAGE "PRO"
                // ========================================================
                const isCropping = (obj.isCropping === true);
                const keepRatio = (obj.ratioLocked !== false);
                const isCorner = ['TL', 'TR', 'BL', 'BR'].includes(draggedHandle);
                const MIN_SIZE = 10;

                if (isCropping) {
                    // ✂️ MODE 1 : ROGNAGE (CROP)
                    let newX = obj.x, newY = obj.y, newW = obj.w, newH = obj.h;
                    let newCX = obj.cx, newCY = obj.cy, newCW = obj.cw, newCH = obj.ch;

                    if (draggedHandle.includes('R')) { newW += dx; newCW += dx * scaleX; }
                    if (draggedHandle.includes('L')) { newW -= dx; newX += dx; newCW -= dx * scaleX; newCX += dx * scaleX; }
                    if (draggedHandle.includes('B')) { newH += dy; newCH += dy * scaleY; }
                    if (draggedHandle.includes('T')) { newH -= dy; newY += dy; newCH -= dy * scaleY; newCY += dy * scaleY; }

                    if (newW >= MIN_SIZE && newH >= MIN_SIZE) {
                        if (newCX >= 0 && newCY >= 0 && newCX + newCW <= natW && newCY + newCH <= natH) {
                            obj.x = newX; obj.y = newY; obj.w = newW; obj.h = newH;
                            obj.cx = newCX; obj.cy = newCY; obj.cw = newCW; obj.ch = newCH;
                        }
                    }
                }
                else if (keepRatio && isCorner) {
                    // 🔗 MODE 2 : REDIMENSIONNEMENT PROPORTIONNEL (Coins uniquement)
                    const ratio = obj.w / obj.h;
                    let newW = obj.w;
                    let newH = obj.h;

                    let deltaW = draggedHandle.includes('R') ? dx : -dx;
                    let deltaH = draggedHandle.includes('B') ? dy : -dy;

                    if (Math.abs(deltaW) > Math.abs(deltaH)) {
                        newW += deltaW;
                        newH = newW / ratio;
                    } else {
                        newH += deltaH;
                        newW = newH * ratio;
                    }

                    if (newW >= MIN_SIZE && newH >= MIN_SIZE) {
                        if (draggedHandle.includes('L')) obj.x += (obj.w - newW);
                        if (draggedHandle.includes('T')) obj.y += (obj.h - newH);
                        obj.w = newW; obj.h = newH;
                    }
                }
                else {
                    // 🔓 MODE 3 : REDIMENSIONNEMENT LIBRE (Ou manipulation des côtés)
                    let newX = obj.x, newY = obj.y, newW = obj.w, newH = obj.h;

                    if (draggedHandle.includes('R')) newW += dx;
                    if (draggedHandle.includes('L')) { newW -= dx; newX += dx; }
                    if (draggedHandle.includes('B')) newH += dy;
                    if (draggedHandle.includes('T')) { newH -= dy; newY += dy; }

                    if (newW >= MIN_SIZE && newH >= MIN_SIZE) {
                        obj.x = newX; obj.y = newY; obj.w = newW; obj.h = newH;
                    }
                }
                // ========================================================
            }
        }
        lastMouseX = e.clientX; lastMouseY = e.clientY;
    }
    else if (isDraggingObjs && selectedItems.length > 0 && lastMouseX !== undefined) {
        let currentLog = getRawLogicalPos(e);

        if (selectedItems.length === 1 && ['point', 'text'].includes(selectedItems[0].type)) {
            let snapDist = 8 / zoom;
            points.forEach(p => {
                if (p.id === selectedItems[0].id && selectedItems[0].type === 'point') return;
                if (Math.abs(currentLog.x - p.x) < snapDist) { currentLog.x = p.x; activeGuides.x.push(p.x); snapDist = Math.abs(currentLog.x - p.x); }
                if (Math.abs(currentLog.y - p.y) < snapDist) { currentLog.y = p.y; activeGuides.y.push(p.y); snapDist = Math.abs(currentLog.y - p.y); }
            });
        }

        let dx = currentLog.x - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).x;
        let dy = currentLog.y - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).y;

        let ptsToMove = new Set(); let txtsToMove = new Set(); let freehandsToMove = new Set(); let imgsToMove = new Set(); let arcsToMove = new Set();
        let itemsToProcessMap = new Map();
        selectedItems.forEach(item => {
            itemsToProcessMap.set(item.type + '-' + item.id, item);
            const obj = getObjectById(item.type, item.id);
            if (obj && obj.groupId) {
                getGroupMembers(obj.groupId).forEach(member => {
                    itemsToProcessMap.set(member.type + '-' + member.id, { type: member.type, id: member.id });
                });
            }
        });

        Array.from(itemsToProcessMap.values()).forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if (!obj) return;
            // Ne pas ignorer si c'est locked, car les textes des groupes le sont !
            if (obj.locked && !obj.groupId) return;

            if (item.type === 'point') ptsToMove.add(item.id);
            else if (item.type === 'segment') { const s = getObjectById('segment', item.id); if (s) { ptsToMove.add(s.p1_id); ptsToMove.add(s.p2_id); } }
            else if (item.type === 'circle') { const c = getObjectById('circle', item.id); if (c) { ptsToMove.add(c.center_id); ptsToMove.add(c.edge_id); } }
            else if (item.type === 'rectangle') { const r = getObjectById('rectangle', item.id); if (r) { ptsToMove.add(r.p1_id); ptsToMove.add(r.p2_id); } }
            else if (item.type === 'curve') { const cu = getObjectById('curve', item.id); if (cu) { cu.points.forEach(p => ptsToMove.add(p)); } }
            else if (item.type === 'polygon') { const po = getObjectById('polygon', item.id); if (po) { po.points.forEach(p => ptsToMove.add(p)); } }
            else if (item.type === 'arc') arcsToMove.add(item.id);
            else if (item.type === 'text') txtsToMove.add(item.id); else if (item.type === 'freehand') freehandsToMove.add(item.id); else if (item.type === 'image') imgsToMove.add(item.id);
        });
        // Un point d'intersection n'est pas déplaçable : il est là où les deux
        // objets se croisent, et il y retournerait aussitôt.
        ptsToMove.forEach(pid => { const p = getObjectById('point', pid); if (p && !p.depend) { p.x += dx; p.y += dy; } }); txtsToMove.forEach(tid => { const t = getObjectById('text', tid); if (t) { t.x += dx; t.y += dy; } });
        freehandsToMove.forEach(fid => { const f = getObjectById('freehand', fid); if (f) { f.points.forEach(pt => { pt.x += dx; pt.y += dy; }); } }); imgsToMove.forEach(iid => { const i = getObjectById('image', iid); if (i) { i.x += dx; i.y += dy; } });
        arcsToMove.forEach(aid => { const a = getObjectById('arc', aid); if (a) { a.cx += dx; a.cy += dy; } });

        lastMouseX = panX + currentLog.x * zoom;
        lastMouseY = panY + currentLog.y * zoom;
        updateWysiwygPosition();
    } else { lastMouseX = e.clientX; lastMouseY = e.clientY; }
    updateCursor(); requestAnimationFrame(draw);
});

canvas.addEventListener('pointerup', handlePointerUp); canvas.addEventListener('pointercancel', handlePointerUp); canvas.addEventListener('pointerout', handlePointerUp);

function handlePointerUp(e) {
    // pointerout partage ce gestionnaire comme filet de sécurité, mais pendant un
    // vrai geste le canvas garde le pointeur capturé (setPointerCapture) : les
    // événements lui arrivent même hors de la fenêtre. Un pointerout SANS bouton
    // enfoncé n'est donc qu'un survol sortant (passage sous la barre d'outils, un
    // panneau, sortie de fenêtre) et ne doit rien valider — sinon le 2e point d'un
    // segment/cercle/rectangle se posait tout seul à l'endroit du survol.
    if (e.type === 'pointerout' && !e.buttons) return;

    // Tampon tactile : la pose est validée au relâchement du doigt/stylet
    if (touchStampPointerId !== null && e.pointerId === touchStampPointerId) {
        if (e.type === 'pointerout') return; // capture active, le doigt est toujours posé
        touchStampPointerId = null;
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) isPanningView = false;
        if (e.type === 'pointerup') {
            const rawPos = getRawLogicalPos(e);
            mouseLogicalPos = { x: rawPos.x, y: rawPos.y };
            const avantTampon = nextId;
            PluginManager.trigger('onPointerDown', rawPos, e); // les plugins valident la pose ici
            apresPoseDeTampon(avantTampon);
        }
        draw();
        return;
    }
    if (PluginManager.trigger('onPointerUp', e)) return;
    if (draggedWidget) {
        if (draggedWidget instanceof CompassWidget && draggedWidgetMode === 'trace') {
            draggedWidget.isTracing = false;
            if (currentTracingArc) {
                arcs.push(currentTracingArc);
                saveState();
            }
            currentTracingArc = null;
        }
        else if (draggedWidget instanceof ProtractorWidget && draggedWidgetMode === 'traceAngle') {
            const w = draggedWidget;
            const p1Id = nextId++;
            points.push({ id: p1Id, x: w.x, y: w.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });

            const p2Id = nextId++;
            const rawAngle = Math.atan2(lastRawY - w.y, lastRawX - w.x);
            const px = w.x + Math.cos(rawAngle) * w.radius;
            const py = w.y + Math.sin(rawAngle) * w.radius;
            points.push({ id: p2Id, x: px, y: py, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });

            segments.push({
                id: nextId++,
                p1_id: p1Id,
                p2_id: p2Id,
                color: activeStyle.strokeColor,
                width: activeStyle.lineWidth,
                dash: activeStyle.lineDash,
                arrowStart: 0,
                arrowEnd: 0,
                z: globalZ++
            });
            saveState();
        }

        draggedWidget = null;
        draggedWidgetMode = null;
        reperOutil = null;
    }

    clearTimeout(shapeRecognitionTimeout);
    activePointers.delete(e.pointerId); if (activePointers.size === 0) isPanningView = false;

    if (isCropMode && cropRect) {
        const cw = Math.abs(cropRect.endX - cropRect.startX);
        const ch = Math.abs(cropRect.endY - cropRect.startY);
        if (cw > 10 && ch > 10) {
            document.getElementById('export-popover').classList.add('visible');
        } else {
            cropRect = null;
            draw();
        }
        return;
    }

    if (creationStartPointId !== null && ['segment', 'droite', 'demi-droite', 'circle', 'rectangle'].includes(mode)) {
        const dist = Math.hypot(e.clientX - lastDownClientX, e.clientY - lastDownClientY);
        if (dist > 5) {
            let actionPos = positionAimantee(getRawLogicalPos(e));
            let ptId = nextId++;
            points.push({ id: ptId, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });

            if (mode === 'segment' || mode === 'droite' || mode === 'demi-droite') segments.push({ id: nextId++, p1_id: creationStartPointId, p2_id: ptId, lineType: mode, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, z: globalZ++ });
            if (mode === 'circle') circles.push({ id: nextId++, center_id: creationStartPointId, edge_id: ptId, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ });
            if (mode === 'rectangle') rectangles.push({ id: nextId++, p1_id: creationStartPointId, p2_id: ptId, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ });
            saveState();
            creationStartPointId = null; mouseLogicalPos = null;
        }
    }

    if (mode === 'laser') {
        currentLaserStroke = null;
        return;
    }

    if (isSelectingBox) {
        isSelectingBox = false; const minX = Math.min(selectionBox.startX, selectionBox.endX); const maxX = Math.max(selectionBox.startX, selectionBox.endX); const minY = Math.min(selectionBox.startY, selectionBox.endY); const maxY = Math.max(selectionBox.startY, selectionBox.endY);
        selectedItems = [];
        points.forEach(p => { if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) selectedItems.push({ type: 'point', id: p.id }); });
        texts.forEach(t => { if (t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY) selectedItems.push({ type: 'text', id: t.id }); });
        segments.forEach(s => { const p1 = getObjectById('point', s.p1_id), p2 = getObjectById('point', s.p2_id); if (p1 && p2 && p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY && p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY) selectedItems.push({ type: 'segment', id: s.id }); });
        circles.forEach(c => { const p = getObjectById('point', c.center_id); if (p && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) selectedItems.push({ type: 'circle', id: c.id }); });
        rectangles.forEach(r => { const p1 = getObjectById('point', r.p1_id), p2 = getObjectById('point', r.p2_id); if (p1 && p2) { const rx1 = Math.min(p1.x, p2.x), rx2 = Math.max(p1.x, p2.x), ry1 = Math.min(p1.y, p2.y), ry2 = Math.max(p1.y, p2.y); if (rx1 >= minX && rx2 <= maxX && ry1 >= minY && ry2 <= maxY) selectedItems.push({ type: 'rectangle', id: r.id }); } });
        curves.forEach(c => { let inside = true; c.points.forEach(pid => { const p = getObjectById('point', pid); if (!p || p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) inside = false; }); if (inside) selectedItems.push({ type: 'curve', id: c.id }); });
        polygons.forEach(po => { let inside = true; po.points.forEach(pid => { const p = getObjectById('point', pid); if (!p || p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) inside = false; }); if (inside) selectedItems.push({ type: 'polygon', id: po.id }); });
        freehands.forEach(f => { let inside = true; f.points.forEach(p => { if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) inside = false; }); if (inside) selectedItems.push({ type: 'freehand', id: f.id }); });
        images.forEach(img => { if (img.x >= minX && img.x + img.w <= maxX && img.y >= minY && img.y + img.h <= maxY) selectedItems.push({ type: 'image', id: img.id }); });
        arcs.forEach(a => { if (a.cx >= minX && a.cx <= maxX && a.cy >= minY && a.cy <= maxY) selectedItems.push({ type: 'arc', id: a.id }); });
        if (selectedItems.length > 0) { updateStyleBarContext(); } draw();
    }

    if (isZoomBoxing) {
        isZoomBoxing = false;
        const minX = Math.min(zoomBox.startX, zoomBox.endX);
        const maxX = Math.max(zoomBox.startX, zoomBox.endX);
        const minY = Math.min(zoomBox.startY, zoomBox.endY);
        const maxY = Math.max(zoomBox.startY, zoomBox.endY);
        const w = maxX - minX;
        const h = maxY - minY;
        if (w > 10 / zoom && h > 10 / zoom) {
            const margin = 50;
            const targetZoomX = (window.innerWidth - margin * 2) / w;
            const targetZoomY = (window.innerHeight - margin * 2) / h;
            let targetZoom = Math.min(targetZoomX, targetZoomY);
            if (targetZoom < 0.2) targetZoom = 0.2;
            if (targetZoom > 10) targetZoom = 10;
            zoom = targetZoom;
            panX = window.innerWidth / 2 - ((minX + maxX) / 2) * zoom;
            panY = window.innerHeight / 2 - ((minY + maxY) / 2) * zoom;
            const zoomSlider = document.getElementById('zoom-slider');
            if (zoomSlider) zoomSlider.value = zoom;
            majPastilleZoom();
            if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
        }
        setMode('pointer');
        draw(); return;
    }

    if (isDrawingPostit) {
        isDrawingPostit = false;
        const minX = Math.min(postitBox.startX, postitBox.endX);
        const maxX = Math.max(postitBox.startX, postitBox.endX);
        const minY = Math.min(postitBox.startY, postitBox.endY);
        const maxY = Math.max(postitBox.startY, postitBox.endY);
        const w = maxX - minX;
        const h = maxY - minY;

        if (w > 20 && h > 20) {
            const newHtmlPostit = {
                id: nextId++,
                x: minX,
                y: minY,
                w: Math.max(w, 150),
                h: Math.max(h, 150),
                content: "",
                bg: "#fdfd96", // retro yellow default
                minimized: false,
                z: globalZ++
            };
            htmlPostits.push(newHtmlPostit);
            saveState();
            if (typeof renderHtmlPostits === 'function') renderHtmlPostits();
        }
        
        setMode('pointer');
        postitBox = null;
        document.querySelectorAll('.btn[data-mode="postit"]').forEach(b => b.classList.remove('active'));
        draw(); return;
    }

    if (glissePage) { glissePage = null; saveState(); }

    if (isDraggingObjs || draggedHandle) { saveState(); isDraggingObjs = false; draggedHandle = null; textResizeHint = null; activeGuides = { x: [], y: [] }; }
    if (isDrawingFreehand) { isDrawingFreehand = false; if (currentFreehand.points.length > 1) { freehands.push(currentFreehand); saveState(); } currentFreehand = null; }
    updateCursor(); draw();
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    // En mode « page », la molette zoome la PAGE dans son cadre, pas le tableau
    const docPage = (typeof documentSelectionne === 'function') ? documentSelectionne() : null;
    if (docPage && estUnDocumentPose(docPage) && modeDocument === 'page' && !docPage.locked) {
        const p = getRawLogicalPos(e);
        if (p.x >= docPage.x && p.x <= docPage.x + docPage.w && p.y >= docPage.y && p.y <= docPage.y + docPage.h) {
            zoomerPage(docPage, p, Math.exp(-e.deltaY / 450));
            return;
        }
    }

    majPastilleZoom();
    // 1. PINCH-TO-ZOOM (Trackpad Mac) ou Scroll + Ctrl (Souris classique)
    if (e.ctrlKey) {
        const mouseLogX = (e.clientX - panX) / zoom;
        const mouseLogY = (e.clientY - panY) / zoom;

        // Un cran de molette envoie deltaY ≈ 100 : à /100, chaque cran
        // multipliait le zoom par 2,7 — beaucoup trop brutal. Le pavé tactile,
        // lui, envoie de petites valeurs en rafale : la formule exponentielle
        // reste, on l'adoucit seulement.
        let zoomFactor = Math.exp(-e.deltaY / 450);
        let newZoom = zoom * zoomFactor;

        if (newZoom < 0.2) newZoom = 0.2;
        if (newZoom > 10) newZoom = 10;

        document.getElementById('zoom-slider').value = newZoom;
        panX = e.clientX - mouseLogX * newZoom;
        panY = e.clientY - mouseLogY * newZoom;
        zoom = newZoom;
    }
    // 2. DÉPLACEMENT À DEUX DOIGTS (Trackpad) ou Molette classique
    else {
        // On modifie les coordonnées globales de la caméra
        panX -= e.deltaX;
        panY -= e.deltaY;
    }

    updateWysiwygPosition();
    draw();
}, { passive: false });

document.getElementById('zoom-slider').addEventListener('input', (e) => {
    const newZoom = parseFloat(e.target.value);
    const cX = canvas.width / 2, cY = canvas.height / 2;
    panX = cX - (cX - panX) * (newZoom / zoom);
    panY = cY - (cY - panY) * (newZoom / zoom);
    zoom = newZoom;
    updateWysiwygPosition();
    draw();
});

document.getElementById('grid-weight-slider').addEventListener('input', (e) => { gridWeight = parseFloat(e.target.value); majPastilleGrille(); draw(); });
// L'aimant dit sur quoi il attire : sans ça, on ne devine ni ce qu'il fait,
// ni qu'un appui long permet de le régler.
function resumeAimant() {
    const sources = [];
    if (aimant.grille) sources.push('quadrillage');
    if (aimant.outils) sources.push('outils');
    if (aimant.intersections) sources.push('points et intersections');
    return sources.join(' + ');
}
const btnMagnet = document.getElementById('btn-magnet');

// Les trois sources sont dans la barre, à côté de l'aimant, et n'apparaissent
// que quand il est allumé : un réglage caché dans un sous-menu ne se trouve
// pas, et trois boutons de plus en permanence encombreraient la barre.
const SOURCES_AIMANT = [
    ['grille', 'btn-aimant-grille'],
    ['outils', 'btn-aimant-outils'],
    ['intersections', 'btn-aimant-points']
];

function majBoutonsAimant() {
    btnMagnet.classList.toggle('active', magnetMode);
    const bande = document.getElementById('aimant-sources');
    if (bande) bande.style.display = magnetMode ? 'inline-flex' : 'none';
    SOURCES_AIMANT.forEach(([cle, id]) => {
        const b = document.getElementById(id);
        if (b) b.classList.toggle('active', !!aimant[cle]);
    });
}
window.majBoutonsAimant = majBoutonsAimant;

btnMagnet.addEventListener('click', () => {
    magnetMode = !magnetMode;
    majBoutonsAimant();
    if (typeof showToast === 'function') {
        showToast(magnetMode ? `🧲 Aimant : ${resumeAimant()}` : 'Aimant désactivé');
    }
    draw();
});

SOURCES_AIMANT.forEach(([cle, id]) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', (e) => {
        e.stopPropagation();
        aimant[cle] = !aimant[cle];
        // Éteindre la dernière source revient à éteindre l'aimant : on ne
        // laisse pas un aimant allumé qui n'attire rien.
        if (!aimant.grille && !aimant.outils && !aimant.intersections) {
            aimant[cle] = true;
            magnetMode = false;
        }
        enregistrerAimant();
        majBoutonsAimant();
        if (typeof showToast === 'function') {
            showToast(magnetMode ? `🧲 Aimant : ${resumeAimant()}` : 'Aimant désactivé');
        }
        draw();
    });
});
document.getElementById('btn-cycle').onclick = () => {
    currentBgIndex = (currentBgIndex + 1) % backgrounds.length;
    if (typeof cadrerSurLaFeuille === 'function') cadrerSurLaFeuille();
    draw();
};
const btnAxes = document.getElementById('btn-axes'); btnAxes.onclick = () => {
    const avant = showAxes;
    showAxes = (showAxes + 1) % 3;
    if (avant === 0 && showAxes > 0) centrerLesAxes();   // on les pose là où l'on regarde
    btnAxes.classList.remove('active', 'active-1', 'active-2');
    if (showAxes > 0) btnAxes.classList.add('active', `active-${showAxes}`);
    draw();
};

function buildRenderQuadtree(minX, maxX, minY, maxY) {
    const padding = 100;
    renderQuadtree = new Quadtree(minX - padding, minY - padding, (maxX - minX) + padding * 2, (maxY - minY) + padding * 2);

    images.forEach(o => renderQuadtree.insert({ ...o, type: 'image' }));
    polygons.forEach(o => renderQuadtree.insert({ ...o, type: 'polygon' }));
    curves.forEach(o => renderQuadtree.insert({ ...o, type: 'curve' }));
    circles.forEach(o => renderQuadtree.insert({ ...o, type: 'circle' }));
    arcs.forEach(o => renderQuadtree.insert({ ...o, type: 'arc' }));
    rectangles.forEach(o => renderQuadtree.insert({ ...o, type: 'rectangle' }));
    segments.forEach(o => renderQuadtree.insert({ ...o, type: 'segment' }));
    freehands.forEach(o => renderQuadtree.insert({ ...o, type: 'freehand' }));
    points.forEach(o => renderQuadtree.insert({ ...o, type: 'point' }));
    texts.forEach(o => renderQuadtree.insert({ ...o, type: 'text' }));
}

function draw() {
    // Les points posés sur un croisement suivent leurs objets
    majPointsDependants();
    if (typeof majBarreDocument === 'function') majBarreDocument();

    const bg = backgrounds[currentBgIndex];
    const logicalStep = pasDesGraduations();     // une graduation = une case du fond

    if (isExportingTransparent) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = (bg === 'millimetre') ? (isDarkMode ? '#2d3436' : bgColors.millimetre)
            : (bg === 'copie' || bg === 'seyes-marge') ? (isDarkMode ? '#15191b' : bgColors.copie)
            : (isDarkMode ? '#1e272e' : bgColors.default);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    try {
        ctx.translate(panX, panY); ctx.scale(zoom, zoom);
        const lw = 1 / zoom; const minX = -panX / zoom; const maxX = (canvas.width - panX) / zoom; const minY = -panY / zoom; const maxY = (canvas.height - panY) / zoom;

        if (!isExportingTransparent) {
            // Un document « sous le quadrillage » se dessine avant la réglure :
            // on écrit ensuite dessus comme sur une feuille quadrillée.
            images.filter(i => i.sousLaGrille).sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(obj => {
                if (!imageCache[obj.src]) return;
                ctx.save();
                ctx.translate(obj.x + obj.w / 2, obj.y + obj.h / 2);
                if (obj.angle) ctx.rotate(obj.angle);
                const a = (obj.opacity === undefined) ? 1 : obj.opacity;
                if (a < 1) ctx.globalAlpha = a;
                ctx.drawImage(imageCache[obj.src], obj.cx, obj.cy, obj.cw, obj.ch, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
                ctx.restore();
            });

            if (bg === 'seyes-marge' || bg === 'copie') {
                // La feuille est posée là où elle a été placée : on décale le
                // dessin plutôt que de reprendre toutes ses coordonnées.
                const o = origineFeuille || { x: 0, y: 0 };
                ctx.save();
                ctx.translate(o.x, o.y);
                if (bg === 'seyes-marge') drawSeyesMarge(minX - o.x, maxX - o.x, minY - o.y, maxY - o.y, lw, gridWeight);
                else drawCopie(minX - o.x, maxX - o.x, minY - o.y, maxY - o.y, lw, gridWeight);
                ctx.restore();
            }
            else if (bg === 'carreau') drawCarreau(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'seyes') drawSeyes(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'millimetre') drawMillimetre(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'point') drawPoint(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'isometrique') drawIsometrique(minX, maxX, minY, maxY, lw, gridWeight);

            if (showAxes > 0) {
                const oa = origineAxes || { x: 0, y: 0 };
                ctx.save();
                ctx.translate(oa.x, oa.y);
                // Le repère est translaté : ce que l'on voit, exprimé depuis son origine
                const axMinX = minX - oa.x, axMaxX = maxX - oa.x;
                const axMinY = minY - oa.y, axMaxY = maxY - oa.y;
                ctx.beginPath(); ctx.moveTo(0, axMinY); ctx.lineTo(0, axMaxY); ctx.moveTo(axMinX, 0); ctx.lineTo(axMaxX, 0); ctx.strokeStyle = showAxes === 2 ? (isDarkMode ? "#b2bec3" : "#000") : (isDarkMode ? "#636e72" : "#2d3436"); ctx.lineWidth = lw * 1.5 * gridWeight; ctx.stroke();
                if (showAxes === 2) {
                    ctx.fillStyle = isDarkMode ? "#b2bec3" : "#2d3436"; ctx.font = `${12 * lw}px sans-serif`; ctx.beginPath(); ctx.textAlign = "center"; ctx.textBaseline = "top";
                    // Une case vaut « pasAxes » : on affiche autant de décimales
                    // qu'il en faut, sans jamais écrire « 0.30000000000000004 ».
                    const decimales = Math.max(0, Math.min(4, String(pasAxes).replace(/^\d*\.?/, '').length));
                    const etiquette = (n) => {
                        const v = n * pasAxes;
                        return decimales ? v.toFixed(decimales).replace('.', ',') : String(Math.round(v));
                    };
                    for (let x = Math.floor(axMinX / logicalStep) * logicalStep; x <= axMaxX; x += logicalStep) if (x !== 0) { ctx.moveTo(x, -4 * lw); ctx.lineTo(x, 4 * lw); ctx.fillText(etiquette(Math.round(x / logicalStep)), x, 8 * lw); }
                    ctx.textAlign = "right"; ctx.textBaseline = "middle";
                    for (let y = Math.floor(axMinY / logicalStep) * logicalStep; y <= axMaxY; y += logicalStep) if (y !== 0) { ctx.moveTo(-4 * lw, y); ctx.lineTo(4 * lw, y); ctx.fillText(etiquette(Math.round(-y / logicalStep)), -8 * lw, y); }
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        buildRenderQuadtree(minX, maxX, minY, maxY);
        const viewportRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        const visibleObjects = renderQuadtree.retrieve(viewportRect);

        let displayList = [];
        visibleObjects.forEach(o => {
            displayList.push({ type: o.type, obj: o });
        });

        if (isDrawingFreehand && currentFreehand) {
            displayList.push({ type: 'freehand', obj: currentFreehand });
        }

        displayList.sort((a, b) => (a.obj.z || 0) - (b.obj.z || 0));

        let hiddenPoints = new Set();
        segments.forEach(s => { if (s.arrowStart) hiddenPoints.add(s.p1_id); if (s.arrowEnd) hiddenPoints.add(s.p2_id); });
        curves.forEach(c => { if (c.points.length > 1) { if (c.arrowStart) hiddenPoints.add(c.points[0]); if (c.arrowEnd) hiddenPoints.add(c.points[c.points.length - 1]); } });

        displayList.forEach(item => {
            const obj = item.obj;
            const isSel = isSelected(item.type, obj.id);
            const isHov = hoveredObj && hoveredObj.type === item.type && hoveredObj.id === obj.id;
            const sc = isSel ? "#6c5ce7" : (isHov ? (mode === 'eraser' ? "#d63031" : (isDarkMode ? "#dfe6e9" : "#b2bec3")) : null);
            if (sc && !isExportingTransparent) { ctx.shadowBlur = 10 * lw; ctx.shadowColor = sc; }

            const renderColor = (!isExportingTransparent && sc === "#d63031") ? sc : (obj.strokeColor || obj.color || (isDarkMode ? '#fff' : '#000'));

            if (item.type === 'image') {
                ctx.save();

                // 1. Déplacer le contexte au centre de l'image pour la rotation
                const centerX = obj.x + obj.w / 2;
                const centerY = obj.y + obj.h / 2;
                ctx.translate(centerX, centerY);

                // 2. Appliquer la rotation (si elle existe)
                if (obj.angle) ctx.rotate(obj.angle);

                // 3. Dessiner l'image (en compensant la translation)
                if (imageCache[obj.src] && !obj.sousLaGrille) {
                    // Opacité propre au tampon (1 = opaque, valeur par défaut)
                    const imgAlpha = (obj.opacity === undefined) ? 1 : obj.opacity;
                    const prevAlpha = ctx.globalAlpha;
                    if (imgAlpha < 1) ctx.globalAlpha = prevAlpha * imgAlpha;
                    ctx.drawImage(imageCache[obj.src], obj.cx, obj.cy, obj.cw, obj.ch, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
                    ctx.globalAlpha = prevAlpha;
                } else if (imageManquante(obj) && !isExportingTransparent) {
                    dessinerImageManquante(ctx, obj, lw);
                }

                // 4. Dessiner le cadre de sélection et les poignées
                if (isSel && !isExportingTransparent) {
                    ctx.strokeStyle = "#6c5ce7";
                    ctx.lineWidth = lw * 2;
                    const hw = 5 * lw; // Taille des poignées

                    // Le cadre bleu principal
                    ctx.strokeRect(-obj.w / 2, -obj.h / 2, obj.w, obj.h);

                    if (!obj.locked) {
                        ctx.fillStyle = "#ffffff";
                        // Dessin des 8 poignées de redimensionnement
                        const hx = [-obj.w / 2, 0, obj.w / 2, obj.w / 2, obj.w / 2, 0, -obj.w / 2, -obj.w / 2];
                        const hy = [-obj.h / 2, -obj.h / 2, -obj.h / 2, 0, obj.h / 2, obj.h / 2, obj.h / 2, 0];
                        for (let i = 0; i < 8; i++) {
                            ctx.beginPath();
                            ctx.arc(hx[i], hy[i], hw, 0, Math.PI * 2);
                            ctx.fill(); ctx.stroke();
                        }

                        // Dessin de la poignée de ROTATION (au-dessus)
                        const rotY = -obj.h / 2 - (30 * lw);
                        ctx.beginPath();
                        ctx.moveTo(0, -obj.h / 2);
                        ctx.lineTo(0, rotY);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(0, rotY, hw * 1.2, 0, Math.PI * 2);
                        ctx.fillStyle = "#a29bfe";
                        ctx.fill(); ctx.stroke();
                    }
                }
                ctx.restore();
            }
            else if (item.type === 'freehand') {
                if (obj.isHighlighter) ctx.globalCompositeOperation = isDarkMode ? 'screen' : 'multiply';
                ctx.strokeStyle = renderColor;
                setContextDash(ctx, obj.dash, lw);

                if (obj.isHighlighter) {
                    ctx.lineWidth = (obj.width || 3) * lw;
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    if (obj.points.length > 1) {
                        ctx.beginPath();
                        ctx.moveTo(obj.points[0].x, obj.points[0].y);
                        for (let i = 1; i < obj.points.length - 1; i++) {
                            let xc = (obj.points[i].x + obj.points[i + 1].x) / 2;
                            let yc = (obj.points[i].y + obj.points[i + 1].y) / 2;
                            ctx.quadraticCurveTo(obj.points[i].x, obj.points[i].y, xc, yc);
                        }
                        ctx.lineTo(obj.points[obj.points.length - 1].x, obj.points[obj.points.length - 1].y);
                        ctx.stroke();
                    }
                } else {
                    drawSmoothFreehand(ctx, obj.points, obj.width || 3, lw);
                }

                if (obj.arrowStart && obj.points.length > 1 && !obj.isHighlighter) {
                    const pA = obj.points[1]; const pB = obj.points[0];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    drawArrowHead(ctx, pB.x, pB.y, angle, renderColor, obj.width || 3, lw, obj.arrowStart);
                }
                if (obj.arrowEnd && obj.points.length > 1 && !obj.isHighlighter) {
                    const pA = obj.points[obj.points.length - 2]; const pB = obj.points[obj.points.length - 1];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    drawArrowHead(ctx, pB.x, pB.y, angle, renderColor, obj.width || 3, lw, obj.arrowEnd);
                }

                ctx.setLineDash([]);
                if (obj.isHighlighter) ctx.globalCompositeOperation = 'source-over';
            }
            else if (item.type === 'polygon') {
                if (obj.points.length >= 2) {
                    ctx.beginPath(); const p0 = getObjectById('point', obj.points[0]);
                    if (p0) {
                        ctx.moveTo(p0.x, p0.y); let valid = true;
                        for (let i = 1; i < obj.points.length; i++) { const p = getObjectById('point', obj.points[i]); if (p) ctx.lineTo(p.x, p.y); else valid = false; }
                        if (obj.isClosed !== false) ctx.closePath();
                        if (valid) {
                            if (obj.isFilled && obj.isClosed !== false) { ctx.fillStyle = hexToRgba(obj.fillColor || obj.color, obj.fillOpacity || 0.2); ctx.fill(); }
                            ctx.strokeStyle = renderColor; ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); ctx.stroke(); ctx.setLineDash([]);
                        }
                    }
                }
            }
            else if (item.type === 'curve') {
                ctx.strokeStyle = renderColor; ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); drawSpline(ctx, obj.points, null, obj.closed); ctx.setLineDash([]);
                const pts = obj.points.map(id => getObjectById('point', id)).filter(p => p);

                if (obj.arrowStart && !obj.closed && pts.length > 1) {
                    const pA = pts[1]; const pB = pts[0];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    drawArrowHead(ctx, pB.x, pB.y, angle, renderColor, obj.width || 3, lw, obj.arrowStart);
                }
                if (obj.arrowEnd && !obj.closed && pts.length > 1) {
                    const pA = pts[pts.length - 2]; const pB = pts[pts.length - 1];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    drawArrowHead(ctx, pB.x, pB.y, angle, renderColor, obj.width || 3, lw, obj.arrowEnd);
                }
            }
            else if (item.type === 'circle') {
                const center = getObjectById('point', obj.center_id), edge = getObjectById('point', obj.edge_id);
                if (center && edge) {
                    ctx.beginPath(); ctx.arc(center.x, center.y, Math.hypot(edge.x - center.x, edge.y - center.y), 0, Math.PI * 2);
                    if (obj.isFilled) { ctx.fillStyle = hexToRgba(obj.fillColor || obj.color, obj.fillOpacity || 0.2); ctx.fill(); }
                    ctx.strokeStyle = renderColor; ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); ctx.stroke(); ctx.setLineDash([]);
                }
            }
            else if (item.type === 'arc') {
                ctx.beginPath();
                ctx.strokeStyle = renderColor;
                ctx.lineWidth = (obj.width || 3) * lw;
                setContextDash(ctx, obj.dash, lw);
                ctx.arc(obj.cx, obj.cy, obj.radius, obj.startAngle, obj.endAngle, obj.counterClockwise);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            else if (item.type === 'rectangle') {
                const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.rect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
                    if (obj.isFilled) { ctx.fillStyle = hexToRgba(obj.fillColor || obj.color, obj.fillOpacity || 0.2); ctx.fill(); }
                    ctx.strokeStyle = renderColor;
                    ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); ctx.stroke(); ctx.setLineDash([]);
                }
            }
            else if (item.type === 'segment') {
                const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
                if (p1 && p2) {
                    ctx.beginPath();
                    if (obj.lineType === 'droite' || obj.lineType === 'demi-droite') {
                        drawExtendedLine(ctx, p1.x, p1.y, p2.x, p2.y, obj.lineType === 'demi-droite');
                    } else {
                        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    }
                    ctx.strokeStyle = renderColor; ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); ctx.stroke(); ctx.setLineDash([]);

                    if (!obj.lineType || obj.lineType === 'segment') {
                        if (obj.arrowStart) {
                            const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                            drawArrowHead(ctx, p1.x, p1.y, angle, renderColor, obj.width || 3, lw, obj.arrowStart);
                        }
                        if (obj.arrowEnd) {
                            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                            drawArrowHead(ctx, p2.x, p2.y, angle, renderColor, obj.width || 3, lw, obj.arrowEnd);
                        }
                    }
                }
            }
            else if (item.type === 'point') {
                if (hiddenPoints.has(obj.id)) return;

                // Un point sans forme ne dessinait RIEN : il restait là,
                // sélectionnable et invisible, et l'extrémité d'un segment
                // semblait avoir disparu. Une forme manquante vaut la croix.
                const forme = formeDuPoint(obj);
                const s = lw * 4; ctx.beginPath();
                if (forme === 'circle') { ctx.arc(obj.x, obj.y, s, 0, Math.PI * 2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (forme === 'square') { ctx.rect(obj.x - s, obj.y - s, s * 2, s * 2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (forme === 'pixel') { ctx.rect(obj.x - 1.5 * lw, obj.y - 1.5 * lw, 3 * lw, 3 * lw); ctx.fillStyle = renderColor; ctx.fill(); }
                else { ctx.lineWidth = lw * 2.5; ctx.moveTo(obj.x - s, obj.y - s); ctx.lineTo(obj.x + s, obj.y + s); ctx.moveTo(obj.x + s, obj.y - s); ctx.lineTo(obj.x - s, obj.y + s); ctx.strokeStyle = renderColor; ctx.stroke(); }
            }
            else if (item.type === 'text') {
                let w = 0, h = 0, startX = obj._cachedStartX || obj.x;

                const fontSize = obj.fontSize || 24;
                const fontFamily = obj.fontFamily || 'sans-serif';
                const lineHeight = obj.lineHeight || Math.round(fontSize * 1.2);
                const layout = obj.mathImg ? null : layoutTextObject(obj, ctx);
                const lines = layout ? layout.lines : [];

                if (obj.mathImg) {
                    w = obj.mathW; h = obj.mathH; startX = obj.x;
                } else {
                    if (obj.fixedWidth && obj.fixedHeight) {
                        w = Math.max(layout.width, obj.fixedWidth);
                        h = Math.max(layout.height, obj.fixedHeight);
                    } else {
                        w = layout.width;
                        h = Math.max(layout.height, obj.minHeight || 0);
                    }

                    if (obj.isMinimized && obj.bubbleShape === 'postit') {
                        w = 40; h = 40;
                    }

                    // Deux conventions selon que le bloc a un cadre ou non :
                    //  - avec une colonne, x est le bord GAUCHE et le centrage
                    //    se fait à l'intérieur du cadre (comme dans la saisie) ;
                    //  - sans colonne, la largeur est celle du texte : x est
                    //    alors le point d'ancrage, c'est-à-dire le CENTRE.
                    startX = (obj.align === 'center' && !obj.colWidth)
                        ? obj.x + (obj.fixedWidth ? obj.fixedWidth / 2 : 0) - w / 2
                        : obj.x;
                    if (obj.isBubble && w < 20 && !obj.isMinimized) { w = 150; h = 30; }
                }

                obj._cachedW = w; obj._cachedH = h; obj._cachedStartX = startX;
                // Le quadtree de rendu travaille sur des COPIES : on réécrit les métriques
                // sur l'objet d'origine, sinon le hit-test et la sélection lisent du vide
                const origText = getObjectById('text', obj.id);
                if (origText) { origText._cachedW = w; origText._cachedH = h; origText._cachedStartX = startX; }
                const cx = startX + w / 2; const cy = obj.y + h / 2;

                ctx.save();
                ctx.translate(cx, cy); if (obj.angle) ctx.rotate(obj.angle); ctx.translate(-cx, -cy);

                // ==========================================
                // 1. DESSIN DE LA BULLE
                // ==========================================
                if (obj.isBubble) {

                    // ==========================================
                    // 1. PARAMÈTRES GÉNÉRAUX
                    // ==========================================

                    ctx.shadowBlur = (!isExportingTransparent && sc) ? 10 * lw : 0;
                    ctx.shadowColor = (!isExportingTransparent && sc) ? sc : "transparent";

                    const pad = obj.bubblePad !== undefined ? obj.bubblePad : 20;

                    const bw = w + pad * 2;
                    const bh = h + pad * 2;

                    const bx = startX - pad;
                    const by = obj.y - pad;

                    const bcx = startX + w / 2;
                    const bcy = obj.y + h / 2;

                    let locTailX = obj.tailX;
                    let locTailY = obj.tailY;

                    if (obj.angle) {
                        locTailX = Math.cos(-obj.angle) * (obj.tailX - cx) -
                            Math.sin(-obj.angle) * (obj.tailY - cy) + cx;

                        locTailY = Math.sin(-obj.angle) * (obj.tailX - cx) +
                            Math.cos(-obj.angle) * (obj.tailY - cy) + cy;
                    }

                    const border = (obj.borderWidth || 3) * lw * 2;
                    const fillColor = obj.fillColor || "#ffffff";

                    ctx.lineWidth = border;
                    ctx.strokeStyle = obj.color || renderColor;
                    ctx.fillStyle = fillColor;
                    ctx.lineJoin = "round";
                    ctx.lineCap = "round";

                    if (obj.bubbleShape === "whisper") {
                        ctx.setLineDash([8, 8]);
                    } else {
                        ctx.setLineDash([]);
                    }

                    // ==========================================
                    // 2. QUEUE
                    // ==========================================

                    let angleT, baseW, tpx, tpy;

                    if (obj.bubbleShape === "cloud") {

                        ctx.beginPath();

                        const dist = Math.hypot(locTailX - bcx, locTailY - bcy);
                        const angle = Math.atan2(locTailY - bcy, locTailX - bcx);

                        const c1x = bcx + Math.cos(angle) * (dist * 0.6);
                        const c1y = bcy + Math.sin(angle) * (dist * 0.6);

                        const c2x = bcx + Math.cos(angle) * (dist * 0.85);
                        const c2y = bcy + Math.sin(angle) * (dist * 0.85);

                        ctx.moveTo(c1x + 10, c1y);
                        ctx.arc(c1x, c1y, 10, 0, Math.PI * 2);

                        ctx.moveTo(c2x + 5, c2y);
                        ctx.arc(c2x, c2y, 5, 0, Math.PI * 2);

                        ctx.fill();
                        ctx.stroke();

                    } else if (obj.bubbleShape === "postit") {
                        // Pas de queue pour le post-it !
                    } else {

                        angleT = Math.atan2(locTailY - bcy, locTailX - bcx);

                        baseW = Math.min(30, bw / 3);

                        tpx = Math.cos(angleT + Math.PI / 2) * baseW;
                        tpy = Math.sin(angleT + Math.PI / 2) * baseW;

                        ctx.beginPath();
                        ctx.moveTo(bcx + tpx, bcy + tpy);
                        ctx.lineTo(locTailX, locTailY);
                        ctx.lineTo(bcx - tpx, bcy - tpy);
                        ctx.closePath();

                        ctx.fill();
                        ctx.stroke();
                    }

                    // ==========================================
                    // 3. CORPS DE LA BULLE
                    // ==========================================

                    ctx.beginPath();

                    if (obj.bubbleShape === "rect") {

                        if (ctx.roundRect) {
                            ctx.roundRect(bx, by, bw, bh, 15);
                        } else {
                            ctx.rect(bx, by, bw, bh);
                        }

                    } else if (obj.bubbleShape === "cloud") {

                        ctx.ellipse(bcx, bcy, bw / 2, bh / 2, 0, 0, Math.PI * 2);

                        ctx.moveTo(bcx, bcy);
                        ctx.arc(bcx - bw * 0.35, bcy - bh * 0.35, Math.min(bw, bh) * 0.35, 0, Math.PI * 2);

                        ctx.moveTo(bcx, bcy);
                        ctx.arc(bcx + bw * 0.35, bcy - bh * 0.35, Math.min(bw, bh) * 0.35, 0, Math.PI * 2);

                        ctx.moveTo(bcx, bcy);
                        ctx.arc(bcx - bw * 0.35, bcy + bh * 0.35, Math.min(bw, bh) * 0.35, 0, Math.PI * 2);

                        ctx.moveTo(bcx, bcy);
                        ctx.arc(bcx + bw * 0.35, bcy + bh * 0.35, Math.min(bw, bh) * 0.35, 0, Math.PI * 2);

                    } else if (obj.bubbleShape === "shout") {

                        const pts = 14;

                        for (let i = 0; i <= pts * 2; i++) {

                            const r = (i % 2 === 0)
                                ? bw / 2 + pad * 0.8
                                : bw / 2 - pad * 0.2;

                            const a = (i * Math.PI) / pts;

                            const px = bcx + Math.cos(a) * r;
                            const py = bcy + Math.sin(a) * (r * (bh / bw));

                            if (i === 0) {
                                ctx.moveTo(px, py);
                            } else {
                                ctx.lineTo(px, py);
                            }
                        }

                        ctx.closePath();

                    } else if (obj.bubbleShape === "postit") {
                        ctx.rect(bx, by, bw, bh);
                    } else {

                        ctx.ellipse(bcx, bcy, bw / 2, bh / 2, 0, 0, Math.PI * 2);
                    }

                    ctx.fill();
                    ctx.stroke();

                    // --- Ajout du coin corné pour le Post-it ---
                    if (obj.bubbleShape === "postit" && !obj.isMinimized) {
                        const foldSize = Math.min(30, bw * 0.3, bh * 0.3); // Taille proportionnelle
                        const right = bx + bw;
                        const bottom = by + bh;

                        // Triangle d'ombre
                        ctx.beginPath();
                        ctx.moveTo(right, bottom - foldSize);
                        ctx.lineTo(right - foldSize, bottom);
                        ctx.lineTo(right, bottom);
                        ctx.closePath();
                        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
                        ctx.fill();

                        // Courbe du pli
                        ctx.beginPath();
                        ctx.moveTo(right - foldSize, bottom);
                        ctx.quadraticCurveTo(right - foldSize/2, bottom - foldSize/2, right, bottom - foldSize);
                        ctx.strokeStyle = "rgba(0,0,0,0.2)";
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        
                        // Masquer la bordure originale sous le pli (optionnel, mais la courbe s'en charge)
                    }

                    // ==========================================
                    // 4. FAUSSE FUSION
                    // ==========================================

                    if (obj.bubbleShape !== "cloud" && obj.bubbleShape !== "postit") {

                        const shrink = border / (2 * lw);

                        const innerBaseW = Math.max(baseW - shrink, 1);

                        const itpx = Math.cos(angleT + Math.PI / 2) * innerBaseW;
                        const itpy = Math.sin(angleT + Math.PI / 2) * innerBaseW;

                        const dx = locTailX - bcx;
                        const dy = locTailY - bcy;
                        const len = Math.hypot(dx, dy);

                        const ix = locTailX - (dx / len) * shrink;
                        const iy = locTailY - (dy / len) * shrink;

                        ctx.shadowBlur = 0;
                        ctx.setLineDash([]);

                        ctx.beginPath();
                        ctx.moveTo(bcx + itpx, bcy + itpy);
                        ctx.lineTo(ix, iy);
                        ctx.lineTo(bcx - itpx, bcy - itpy);
                        ctx.closePath();

                        ctx.fillStyle = fillColor;
                        ctx.fill();
                    }

                    ctx.setLineDash([]);

                    // ==========================================
                    // 5. POIGNÉES
                    // ==========================================

                    if (!isExportingTransparent && !obj.locked && isSel) {

                        ctx.beginPath();
                        ctx.arc(locTailX, locTailY, 6 * lw, 0, Math.PI * 2);

                        ctx.fillStyle = "#0984e3";
                        ctx.fill();

                        ctx.lineWidth = 2 * lw;
                        ctx.strokeStyle = "#ffffff";
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.rect(
                            bx + bw - 6 * lw,
                            by - 6 * lw,
                            12 * lw,
                            12 * lw
                        );

                        ctx.fillStyle = "#a29bfe";
                        ctx.fill();

                        ctx.lineWidth = 2 * lw;
                        ctx.strokeStyle = "#6c5ce7";
                        ctx.stroke();
                    }
                }
                // ==========================================
                // 2. DESSIN DU TEXTE 
                // ==========================================
                if (obj.id !== editingTextId && !obj.isMinimized) {
                    if (obj.mathImg) {
                        ctx.shadowBlur = (!isExportingTransparent && sc && !obj.isBubble) ? 10 * lw : 0;
                        ctx.shadowColor = (!isExportingTransparent && sc && !obj.isBubble) ? sc : "transparent";
                        ctx.drawImage(obj.mathImg, startX, obj.y, w, h);
                    } else {
                        const align = obj.align || 'left';
                        ctx.textBaseline = 'top';
                        ctx.textAlign = 'left'; // 🌟 C'EST CECI QUI RÉPARE LE DÉCALAGE !

                        lines.forEach((L) => {
                            // Le demi-interligne : le DOM centre chaque ligne dans sa
                            // line-box, on compense pour retomber sur la saisie
                            const grande = L.tailleMax || L.size;
                            const lineY = obj.y + L.y + (L.demiInterligne !== undefined
                                ? L.demiInterligne
                                : (grande * 0.1) + (L.lineHeight - grande * 1.2) / 2);
                            // Taille et police propres au segment (sélection partielle)
                            const tailleDe = (st) => (st && st.fontSize) ? st.fontSize * (L.size / (obj.fontSize || 24)) : L.size;
                            const setFont = (st) => {
                                ctx.font = `${st.italic ? 'italic ' : ''}${(st.bold || L.bold) ? 'bold ' : ''}${tailleDe(st)}px ${(st && st.fontFamily) || fontFamily}`;
                            };
                            // Les segments de tailles différentes partagent la même ligne de base
                            const basY = (st) => lineY + (grande - tailleDe(st));

                            const alignL = L.align || align;
                            let curX = startX + L.indent;
                            if (alignL === 'center') curX = startX + (w - L.contentW) / 2;
                            else if (alignL === 'right') curX = startX + w - L.contentW;

                            if (L.marker) {
                                setFont({ bold: L.bold });
                                ctx.fillStyle = renderColor;
                                ctx.fillText(L.marker, curX, basY({}));
                            }
                            curX += L.markerW;

                            L.segs.forEach(seg => {
                                setFont(seg.style);
                                const ty = basY(seg.style);
                                const ts = tailleDe(seg.style);
                                ctx.fillStyle = seg.style.color || renderColor;
                                ctx.fillText(seg.text, curX, ty);
                                const sw = ctx.measureText(seg.text).width;
                                if (seg.style.underline) {
                                    ctx.beginPath();
                                    ctx.moveTo(curX, ty + ts * 1.1); ctx.lineTo(curX + sw, ty + ts * 1.1);
                                    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, ts * 0.08); ctx.stroke();
                                }
                                curX += sw;
                            });
                        });
                    }
                }

                // ==========================================
                // 3. SÉLECTION GLOBALE
                // ==========================================
                ctx.shadowBlur = 0;
                // Pendant la saisie, le texte vit dans la zone HTML : le cadre
                // resterait figé sur les dimensions d'avant, à côté du texte
                // qu'on est en train de taper. On ne le dessine donc pas.
                if (isSel && !isExportingTransparent && obj.id !== editingTextId) {
                    ctx.strokeStyle = "#6c5ce7"; ctx.lineWidth = lw * 2;
                    if (!obj.isBubble) ctx.strokeRect(startX, obj.y, w, h);
                    if (!obj.locked) {
                        const rotY = obj.y - (30 * lw) - (obj.isBubble ? (obj.bubblePad || 20) * lw : 0);
                        ctx.beginPath(); ctx.moveTo(cx, obj.y - (obj.isBubble ? (obj.bubblePad || 20) * lw : 0)); ctx.lineTo(cx, rotY); ctx.stroke();
                        ctx.beginPath(); ctx.arc(cx, rotY, 6 * lw, 0, Math.PI * 2);
                        ctx.fillStyle = "#a29bfe"; ctx.fill(); ctx.stroke();

                        // Poignées du bloc de texte : coins = agrandir, côtés = colonne
                        if (!obj.isBubble && !obj.mathImg) {
                            const hr = 6 * lw;
                            ctx.lineWidth = lw * 2;
                            // Coins (ronds, violets) : agrandissement proportionnel
                            [[startX, obj.y], [startX + w, obj.y], [startX + w, obj.y + h], [startX, obj.y + h]].forEach(([px, py]) => {
                                ctx.beginPath(); ctx.arc(px, py, hr, 0, Math.PI * 2);
                                ctx.fillStyle = "#ffffff"; ctx.fill();
                                ctx.strokeStyle = "#6c5ce7"; ctx.stroke();
                            });
                            // Côtés (barrettes verticales bleues) : largeur de colonne
                            [[startX, obj.y + h / 2], [startX + w, obj.y + h / 2]].forEach(([px, py]) => {
                                ctx.beginPath();
                                if (ctx.roundRect) ctx.roundRect(px - hr * 0.55, py - hr * 1.6, hr * 1.1, hr * 3.2, hr * 0.5);
                                else ctx.rect(px - hr * 0.55, py - hr * 1.6, hr * 1.1, hr * 3.2);
                                ctx.fillStyle = "#0984e3"; ctx.fill();
                                ctx.strokeStyle = "#ffffff"; ctx.stroke();
                            });
                        }
                    }

                    // Indication pendant le redimensionnement
                    if (textResizeHint && draggedHandle && !isExportingTransparent) {
                        const pad = 6 * lw;
                        ctx.font = `bold ${13 * lw}px sans-serif`;
                        const tw = ctx.measureText(textResizeHint).width;
                        // au-dessus du bloc : le menu rapide occupe le dessous
                        const bxh = startX + w / 2 - tw / 2 - pad, byh = obj.y - 34 * lw;
                        ctx.fillStyle = "rgba(45,52,54,0.92)";
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(bxh, byh, tw + pad * 2, 22 * lw, 6 * lw);
                        else ctx.rect(bxh, byh, tw + pad * 2, 22 * lw);
                        ctx.fill();
                        ctx.fillStyle = "#ffffff"; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
                        ctx.fillText(textResizeHint, bxh + pad, byh + 4 * lw);
                    }
                }
                ctx.restore();
            }
            ctx.shadowBlur = 0;
        });

        // --- POINT FANTÔME DE L'AIMANT ---
        // Il montre où le clic va tomber : sur un carreau, contre un outil, ou
        // à l'intersection de deux tracés (le fantôme est alors plus marqué,
        // parce que c'est le point qui a de la valeur en géométrie).
        if (magnetMode && mouseLogicalPos && !draggedHandle && ['point', 'segment', 'droite', 'demi-droite', 'circle', 'rectangle', 'text', 'curve', 'polygon', 'pointer'].includes(mode)) {
            if (!hoveredObj || hoveredObj.type !== 'point') {
                const fantome = positionAimantee(mouseLogicalPos);
                if (fantome.source === 'intersection') {
                    ctx.beginPath();
                    ctx.arc(fantome.x, fantome.y, lw * 6, 0, Math.PI * 2);
                    ctx.strokeStyle = "rgba(0, 184, 148, 0.9)";
                    ctx.lineWidth = lw * 1.5;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(fantome.x, fantome.y, lw * 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = "#00b894";
                    ctx.fill();
                } else if (fantome.source) {
                    ctx.beginPath();
                    ctx.arc(fantome.x, fantome.y, lw * 2, 0, Math.PI * 2);
                    ctx.fillStyle = "rgba(108, 92, 231, 0.6)";
                    ctx.fill();
                    ctx.strokeStyle = "#6c5ce7";
                    ctx.lineWidth = lw * 1.5;
                    ctx.stroke();
                }
            }
        }

        // L'outil qu'on déplace s'est calé : on montre sur quoi.
        if (reperOutil && draggedWidget) {
            ctx.beginPath();
            ctx.arc(reperOutil.x, reperOutil.y, lw * 8, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(0, 184, 148, 0.9)";
            ctx.lineWidth = lw * 2;
            ctx.stroke();
        }

        if (currentTracingArc) {
            ctx.beginPath();
            ctx.strokeStyle = currentTracingArc.color || activeStyle.strokeColor;
            ctx.lineWidth = (currentTracingArc.width || activeStyle.lineWidth) * lw;
            setContextDash(ctx, currentTracingArc.dash, lw);
            ctx.arc(currentTracingArc.cx, currentTracingArc.cy, currentTracingArc.radius, currentTracingArc.startAngle, currentTracingArc.endAngle, currentTracingArc.counterClockwise);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (mode === 'polygon' && currentPolygonPoints.length > 0 && mouseLogicalPos) {
            ctx.beginPath(); const p0 = getObjectById('point', currentPolygonPoints[0]); if (p0) ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < currentPolygonPoints.length; i++) { const p = getObjectById('point', currentPolygonPoints[i]); if (p) ctx.lineTo(p.x, p.y); }
            ctx.lineTo(mouseLogicalPos.x, mouseLogicalPos.y);
            if (activeStyle.isFilled) { ctx.fillStyle = hexToRgba(activeStyle.fillColor, 0.2); ctx.fill(); }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
        }

        if (mode === 'curve' && currentCurvePoints.length > 0 && mouseLogicalPos) {
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); drawSpline(ctx, currentCurvePoints, mouseLogicalPos, false); ctx.setLineDash([]);

            if (activeStyle.arrowStart && currentCurvePoints.length > 0) {
                let pA, pB;
                if (currentCurvePoints.length === 1) { pA = mouseLogicalPos; pB = getObjectById('point', currentCurvePoints[0]); }
                else { pA = getObjectById('point', currentCurvePoints[1]); pB = getObjectById('point', currentCurvePoints[0]); }
                if (pB && pA) {
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    drawArrowHead(ctx, pB.x, pB.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowStart);
                }
            }
            if (activeStyle.arrowEnd) {
                const startP = getObjectById('point', currentCurvePoints[currentCurvePoints.length - 1]);
                if (startP) {
                    const angle = Math.atan2(mouseLogicalPos.y - startP.y, mouseLogicalPos.x - startP.x);
                    drawArrowHead(ctx, mouseLogicalPos.x, mouseLogicalPos.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowEnd);
                }
            }
        }

        if (mode === 'circle' && creationStartPointId && mouseLogicalPos && getObjectById('point', creationStartPointId)) {
            const startP = getObjectById('point', creationStartPointId); ctx.beginPath(); ctx.arc(startP.x, startP.y, Math.hypot(mouseLogicalPos.x - startP.x, mouseLogicalPos.y - startP.y), 0, Math.PI * 2);
            if (activeStyle.isFilled) { ctx.fillStyle = hexToRgba(activeStyle.fillColor, 0.2); ctx.fill(); }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
        }
        if (mode === 'rectangle' && creationStartPointId && mouseLogicalPos && getObjectById('point', creationStartPointId)) {
            const startP = getObjectById('point', creationStartPointId);
            ctx.beginPath();
            ctx.rect(Math.min(startP.x, mouseLogicalPos.x), Math.min(startP.y, mouseLogicalPos.y), Math.abs(mouseLogicalPos.x - startP.x), Math.abs(mouseLogicalPos.y - startP.y));
            if (activeStyle.isFilled) { ctx.fillStyle = hexToRgba(activeStyle.fillColor, 0.2); ctx.fill(); }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
        }
        if ((mode === 'segment' || mode === 'droite' || mode === 'demi-droite') && creationStartPointId && mouseLogicalPos && getObjectById('point', creationStartPointId)) {
            const startP = getObjectById('point', creationStartPointId);

            if (mouseLogicalPos.x === startP.x || mouseLogicalPos.y === startP.y) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)'; ctx.lineWidth = 1 / zoom; ctx.setLineDash([5 / zoom, 5 / zoom]);
                ctx.beginPath();
                if (mouseLogicalPos.y === startP.y) { ctx.moveTo(-100000, startP.y); ctx.lineTo(100000, startP.y); }
                else { ctx.moveTo(startP.x, -100000); ctx.lineTo(startP.x, 100000); }
                ctx.stroke();
                ctx.restore();
            }

            ctx.beginPath();
            if (mode === 'droite' || mode === 'demi-droite') {
                drawExtendedLine(ctx, startP.x, startP.y, mouseLogicalPos.x, mouseLogicalPos.y, mode === 'demi-droite');
            } else {
                ctx.moveTo(startP.x, startP.y); ctx.lineTo(mouseLogicalPos.x, mouseLogicalPos.y);
            }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);

            if (mode === 'segment') {
                if (activeStyle.arrowStart) {
                    const angle = Math.atan2(startP.y - mouseLogicalPos.y, startP.x - mouseLogicalPos.x);
                    drawArrowHead(ctx, startP.x, startP.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowStart);
                }
                if (activeStyle.arrowEnd) {
                    const angle = Math.atan2(mouseLogicalPos.y - startP.y, mouseLogicalPos.x - startP.x);
                    drawArrowHead(ctx, mouseLogicalPos.x, mouseLogicalPos.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowEnd);
                }
            }
        }

        if (activeGuides.x.length > 0 || activeGuides.y.length > 0) {
            ctx.strokeStyle = "#0984e3"; ctx.lineWidth = lw; ctx.setLineDash([4 * lw, 4 * lw]);
            activeGuides.x.forEach(gx => { ctx.beginPath(); ctx.moveTo(gx, minY); ctx.lineTo(gx, maxY); ctx.stroke(); });
            activeGuides.y.forEach(gy => { ctx.beginPath(); ctx.moveTo(minX, gy); ctx.lineTo(maxX, gy); ctx.stroke(); });
            ctx.setLineDash([]);
        }

        if (isSelectingBox && !isExportingTransparent) {
            ctx.fillStyle = "rgba(108, 92, 231, 0.1)"; ctx.strokeStyle = "#6c5ce7"; ctx.lineWidth = lw; ctx.setLineDash([lw * 5, lw * 5]);
            const w = selectionBox.endX - selectionBox.startX, h = selectionBox.endY - selectionBox.startY;
            ctx.fillRect(selectionBox.startX, selectionBox.startY, w, h); ctx.strokeRect(selectionBox.startX, selectionBox.startY, w, h); ctx.setLineDash([]);
        }

        if (isZoomBoxing && !isExportingTransparent) {
            ctx.fillStyle = "rgba(0, 184, 148, 0.1)"; ctx.strokeStyle = "#00b894"; ctx.lineWidth = lw; ctx.setLineDash([lw * 5, lw * 5]);
            const w = zoomBox.endX - zoomBox.startX, h = zoomBox.endY - zoomBox.startY;
            ctx.fillRect(zoomBox.startX, zoomBox.startY, w, h); ctx.strokeRect(zoomBox.startX, zoomBox.startY, w, h); ctx.setLineDash([]);
        }

        if (isDrawingPostit && !isExportingTransparent) {
            ctx.fillStyle = hexToRgba(activeStyle.fillColor || "#ffeaa7", 0.5); 
            ctx.strokeStyle = activeStyle.strokeColor || "#f1c40f"; 
            ctx.lineWidth = 2 * lw; 
            ctx.setLineDash([lw * 6, lw * 6]);
            const w = postitBox.endX - postitBox.startX, h = postitBox.endY - postitBox.startY;
            ctx.fillRect(postitBox.startX, postitBox.startY, w, h); 
            ctx.strokeRect(postitBox.startX, postitBox.startY, w, h); 
            ctx.setLineDash([]);
        }

        if (!isExportingTransparent && laserStrokes.length > 0) {
            let needsRedraw = false;
            const now = Date.now();
            ctx.save();
            // 'butt' : les quadratiques se raccordent tangentiellement, des bouts
            // ronds créeraient des perles plus opaques à chaque jonction.
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'round';
            laserStrokes.forEach(stroke => {
                const pts = stroke.filter(p => now - p.time < LASER_LIFETIME);
                if (pts.length > 0) needsRedraw = true;
                if (pts.length < 2) {
                    if (pts.length === 1) {
                        const op = Math.max(0, 1 - ((now - pts[0].time) / LASER_LIFETIME));
                        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3.2 * lw, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(231, 76, 60, ${op})`; ctx.fill();
                    }
                    return;
                }

                // Tracé adouci : chaque point devient le point de contrôle d'une
                // quadratique reliant les milieux de segments (Catmull-Rom simplifié).
                // Passe 0 = halo diffus, passe 1 = cœur du faisceau.
                for (let pass = 0; pass < 2; pass++) {
                    for (let i = 1; i < pts.length; i++) {
                        const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
                        const op = Math.max(0, 1 - ((now - p0.time) / LASER_LIFETIME));
                        if (op <= 0.01) continue;

                        const fromX = (i === 1) ? p0.x : (p0.x + p1.x) / 2;
                        const fromY = (i === 1) ? p0.y : (p0.y + p1.y) / 2;
                        const toX = p2 ? (p1.x + p2.x) / 2 : p1.x;
                        const toY = p2 ? (p1.y + p2.y) / 2 : p1.y;

                        ctx.beginPath();
                        ctx.moveTo(fromX, fromY);
                        ctx.quadraticCurveTo(p1.x, p1.y, toX, toY);
                        if (pass === 0) {
                            ctx.strokeStyle = `rgba(231, 76, 60, ${op * 0.16})`;
                            ctx.lineWidth = 13 * lw;
                        } else {
                            ctx.strokeStyle = `rgba(231, 76, 60, ${op})`;
                            ctx.lineWidth = 6 * lw * (0.55 + 0.45 * op); // s'affine en s'estompant
                        }
                        ctx.stroke();
                    }
                }

                // Pointe lumineuse
                const lastP = pts[pts.length - 1];
                const opTip = Math.max(0, 1 - ((now - lastP.time) / LASER_LIFETIME));
                const glow = ctx.createRadialGradient(lastP.x, lastP.y, 0, lastP.x, lastP.y, 11 * lw);
                glow.addColorStop(0, `rgba(255, 230, 225, ${opTip})`);
                glow.addColorStop(0.35, `rgba(231, 76, 60, ${opTip * 0.85})`);
                glow.addColorStop(1, 'rgba(231, 76, 60, 0)');
                ctx.beginPath(); ctx.arc(lastP.x, lastP.y, 11 * lw, 0, Math.PI * 2);
                ctx.fillStyle = glow; ctx.fill();
            });
            ctx.restore();
            laserStrokes = laserStrokes.filter(stroke => stroke.length > 0 && now - stroke[stroke.length - 1].time < LASER_LIFETIME);
            if (needsRedraw) requestAnimationFrame(draw);
        }

        widgetZOrder.forEach(type => {
            if (activeWidgets[type] && widgets[type]) {
                widgets[type].draw(ctx);
            }
        });

        if (draggedWidget instanceof ProtractorWidget && draggedWidgetMode === 'traceAngle') {
            const w = draggedWidget;
            const startX = w.x;
            const startY = w.y;
            const rawAngle = Math.atan2(lastRawY - startY, lastRawX - startX);

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = activeStyle.strokeColor;
            ctx.lineWidth = activeStyle.lineWidth * lw;
            ctx.setLineDash([5 * lw, 5 * lw]);
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + Math.cos(rawAngle) * 2000 * lw, startY + Math.sin(rawAngle) * 2000 * lw);
            ctx.stroke();

            let deg = (rawAngle - w.angle) * 180 / Math.PI;
            while (deg < 0) deg += 360;
            while (deg >= 360) deg -= 360;
            if (deg > 180) deg = 360 - deg;
            const val1 = Math.round(deg);
            const val2 = 180 - val1;
            const txt = w.isReversed ? `${val1}° / ${val2}°` : `${val2}° / ${val1}°`;

            ctx.font = `bold ${14 * lw}px Segoe UI`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const textDist = w.radius + 45;
            const labelX = startX + Math.cos(rawAngle) * textDist;
            const labelY = startY + Math.sin(rawAngle) * textDist;

            ctx.fillStyle = activeStyle.strokeColor;
            ctx.fillText(txt, labelX, labelY);
            ctx.restore();
        }

    } finally {
        ctx.restore();

        if (isCropMode) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
            if (cropRect) {
                const rx = Math.min(cropRect.startX, cropRect.endX);
                const ry = Math.min(cropRect.startY, cropRect.endY);
                const rw = Math.abs(cropRect.endX - cropRect.startX);
                const rh = Math.abs(cropRect.endY - cropRect.startY);

                ctx.beginPath();
                ctx.rect(0, 0, canvas.width, canvas.height);
                ctx.rect(rx, ry, rw, rh);
                ctx.fill("evenodd");

                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
                ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);
            } else {
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        if (isLoupeActive && lastMouseX !== undefined && lastMouseY !== undefined) {
            const r = 120;
            const z = 2.5;

            ctx.save();
            ctx.beginPath();
            ctx.arc(lastMouseX, lastMouseY, r, 0, Math.PI * 2);

            ctx.lineWidth = 6;
            ctx.strokeStyle = isDarkMode ? '#a29bfe' : '#6c5ce7';
            ctx.stroke();

            ctx.clip();

            ctx.drawImage(canvas,
                lastMouseX - r / z, lastMouseY - r / z, (r * 2) / z, (r * 2) / z,
                lastMouseX - r, lastMouseY - r, r * 2, r * 2
            );

            ctx.beginPath();
            ctx.moveTo(lastMouseX - 12, lastMouseY);
            ctx.lineTo(lastMouseX + 12, lastMouseY);
            ctx.moveTo(lastMouseX, lastMouseY - 12);
            ctx.lineTo(lastMouseX, lastMouseY + 12);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
            ctx.stroke();
            ctx.restore();
        }

        // 🌟 LE DESSIN DES TAMPONS FANTÔMES (RECALIBRÉ) 🌟
        // On replace le Canvas exactement sous ta souris en tenant compte du zoom et de la caméra !
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);
        
        PluginManager.trigger('onDraw', ctx, panX, panY, zoom);
        ctx.restore();

    } // Fin du bloc finally
} // Fin de la fonction draw()


// --- FONCTION NOTIFICATIONS ---
function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- MOTEUR D'IMPORTATION PDF ---
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.getPdfWorkerUrl ? window.getPdfWorkerUrl() : './lib/pdfjs/pdf.worker.min.js';
}

// ==========================================
// MOTEUR D'IMPORTATION PDF (AVEC SÉLECTEUR DE QUALITÉ)
// ==========================================
let currentPdfQuality = 2.5; // Qualité standard par défaut
let currentPdfMargin = 120; // Marge de sécurité par défaut

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.getPdfWorkerUrl ? window.getPdfWorkerUrl() : './lib/pdfjs/pdf.worker.min.js';
}

function createPdfMetadata(file, pageNum) {
    // Créer des métadonnées légères du PDF (pas les données binaires)
    return {
        fileName: file.name,
        fileSize: file.size,
        fileModified: file.lastModified,
        fileHash: `${file.name}_${file.size}_${file.lastModified}`, // Hash simple
        pageNum: pageNum,
        importedAt: Date.now()
    };
}

function checkMissingMedias() {
    // Détecter les médias manquants (PDFs + images) après import
    const missingMedias = [];
    pages.forEach((p, idx) => {
        if (p.pdfMetadata) {
            missingMedias.push({ pageIndex: idx, type: 'pdf', metadata: p.pdfMetadata });
        }
        // ✅ Images qui auraient dû être exportées mais sont manquantes
        if (p.images && p.images.length > 0) {
            p.images.forEach((img, iidx) => {
                // Si c'est une data URL vide ou un placeholder, l'image est manquante
                if (!img.src || img.src.length < 50) {
                    missingMedias.push({
                        pageIndex: idx,
                        type: 'image',
                        metadata: { fileName: img.fileName || `Image ${iidx + 1}` }
                    });
                }
            });
        }
    });

    if (missingMedias.length === 0) return; // Aucun média à réimporter

    // Créer modale pour réimporter les médias
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center;';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background: var(--surface); border-radius: 12px; padding: 25px; max-width: 500px; box-shadow: var(--shadow-hover);';

    box.innerHTML = `
        <h3 style="margin-top: 0; color: var(--accent); margin-bottom: 15px;">📄 Réimporter les PDFs</h3>
        <p style="font-size: 14px; color: var(--ink); margin-bottom: 15px;">
            Ce tableau contient ${missingMedias.length} PDF${missingMedias.length > 1 ? 's' : ''} qui doivent être réimportés pour retrouver vos annotations avec les bons PDFs en arrière-plan.
        </p>
        <div style="background: var(--bg); border-radius: 6px; padding: 12px; margin-bottom: 15px; font-size: 12px; max-height: 150px; overflow-y: auto;">
    `;

    missingMedias.forEach((item, idx) => {
        box.innerHTML += `
            <div style="padding: 6px 0; border-bottom: 1px solid var(--border);">
                <strong>Page ${item.pageIndex + 1}</strong> : ${item.metadata.fileName}
            </div>
        `;
    });

    box.innerHTML += `
        </div>
        <p style="font-size: 12px; color: var(--muted); margin-bottom: 15px;">
            ⚠️ Si vous ne trouvez pas les PDFs originaux, vos annotations restent sauvegardées, mais l'arrière-plan PDF ne s'affichera pas.
        </p>
        <div style="display: flex; gap: 10px;">
            <button id="media-skip-btn" class="btn-action secondary" style="flex: 1; padding: 10px;">Continuer sans PDFs</button>
            <button id="media-reload-btn" class="btn-action primary" style="flex: 1; padding: 10px;">Sélectionner les PDFs</button>
        </div>
    `;

    // ⚠️ IMPORTANT: Ajouter box à modal AVANT d'ajouter au DOM
    modal.appendChild(box);
    document.body.appendChild(modal);

    document.getElementById('media-skip-btn').onclick = () => {
        document.body.removeChild(modal);
    };

    document.getElementById('media-reload-btn').onclick = () => {
        document.body.removeChild(modal);
        promptReloadMedias(missingMedias);
    };
}

// Alias pour compatibilité
function checkMissingPdfs() {
    checkMissingMedias();
}

function promptReloadMedias(missingMedias) {
    // Créer un input file multi-select pour charger les PDFs
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf';

    input.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        showToast(`⏳ Chargement des ${files.length} PDF${files.length > 1 ? 's' : ''}...`);

        // Pour chaque média manquant, essayer de trouver le fichier correspondant
        missingMedias.forEach(item => {
            if (item.type !== 'pdf') return; // Seuls les PDFs sont réimportables

            const matchingFile = files.find(f => {
                const hash = `${f.name}_${f.size}_${f.lastModified}`;
                return hash === item.metadata.fileHash;
            });

            if (matchingFile) {
                // Charger le PDF à la bonne position dans la page
                loadPdfAtPageIndex(matchingFile, item.pageIndex, item.metadata.pageNum);
            } else {
                // Chercher par nom au moins
                const nameSimilar = files.find(f => f.name === item.metadata.fileName);
                if (nameSimilar) {
                    loadPdfAtPageIndex(nameSimilar, item.pageIndex, item.metadata.pageNum);
                }
            }
        });

        showToast("✅ PDFs réimportés !");
    };

    input.click();
}

function loadPdfAtPageIndex(file, pageIndex, pdfPageNum) {
    // Charger un PDF dans une page existante (lors de la réimportation)
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const originalBuffer = e.target.result;
            const pdfBytesForPdfJs = new Uint8Array(originalBuffer.slice(0));

            const pdf = await pdfjsLib.getDocument(pdfBytesForPdfJs).promise;
            const page = await pdf.getPage(pdfPageNum + 1);
            const viewport = page.getViewport({ scale: 2 });

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const context = tempCanvas.getContext('2d');

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const jpegQuality = 0.85;
            const dataUrl = tempCanvas.toDataURL('image/jpeg', jpegQuality);

            // Remplacer l'image de fond dans la page
            const targetPage = pages[pageIndex];
            if (targetPage) {
                const bgImg = targetPage.images.find(img => img.isBg);
                if (bgImg) {
                    bgImg.src = dataUrl;
                    imageCache[dataUrl] = new Image();
                    imageCache[dataUrl].src = dataUrl;
                } else {
                    // Ajouter l'image comme fond si elle n'existe pas
                    const w = viewport.width / 2, h = viewport.height / 2;
                    const newImgObj = { id: nextId++, x: -w / 2, y: -h / 2, w: w, h: h, cx: 0, cy: 0, cw: w, ch: h, src: dataUrl, z: -999, isBg: true };
                    targetPage.images.push(newImgObj);
                }
                targetPage.pdfMetadata = createPdfMetadata(file, pdfPageNum);
                renderThumbnails();
                draw();
            }
        } catch (err) {
            console.error("Erreur chargement PDF réimporté :", err);
            showToast("⚠️ Erreur lors du chargement du PDF");
        }
    };

    reader.readAsArrayBuffer(file);
}

// ===================================================
// UN PDF POSÉ SUR LE TABLEAU, QU'ON FEUILLETTE SUR PLACE
// L'import classique fabrique une page de tableau par page du document :
// parfait pour annoter tout un sujet. Mais pour montrer trois pages d'un
// manuel, c'est lourd. Ici, le document reste UN objet : on tourne ses pages
// avec deux flèches, sans multiplier les pages du tableau.
// (Le document vit le temps de la session : après un rechargement, l'image
// reste, mais il faut le rouvrir pour le feuilleter à nouveau.)
// ===================================================
const documentsPdf = new Map();          // clé → { doc, nom }
// Poser le document sur le tableau et le feuilleter sur place est le geste
// courant : c'est ce qu'on fait par défaut. Découper le PDF en autant de
// pages de tableau reste possible, mais c'est le cas particulier.
let importPdfFeuilletable = true;
try {
    const memoire = localStorage.getItem('board_pdf_feuilletable');
    if (memoire !== null) importPdfFeuilletable = memoire === '1';
} catch (e) { /* stockage refusé */ }

function reglerImportPdf(feuilletable) {
    importPdfFeuilletable = !!feuilletable;
    try { localStorage.setItem('board_pdf_feuilletable', importPdfFeuilletable ? '1' : '0'); } catch (e) { /* stockage refusé */ }
}

async function dessinerPagePdf(doc, numero) {
    const page = await doc.getPage(numero);
    const viewport = page.getViewport({ scale: currentPdfQuality });
    const c = document.createElement('canvas');
    c.width = viewport.width; c.height = viewport.height;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport }).promise;
    return { src: c.toDataURL('image/jpeg', currentPdfQuality > 3 ? 0.75 : 0.85), l: c.width, h: c.height };
}

function chargerImage(src) {
    return new Promise((resolve) => {
        const i = new Image();
        i.onload = () => { imageCache[src] = i; resolve(i); };
        i.onerror = () => resolve(null);
        i.src = src;
    });
}

async function poserPdfFeuilletable(file) {
    if (!window.pdfjsLib) { showToast('Le lecteur de PDF n\'est pas disponible'); return; }
    showToast('Ouverture du document…');
    try {
        const octets = new Uint8Array(await file.arrayBuffer());
        const doc = await pdfjsLib.getDocument(octets.slice(0)).promise;
        const cle = 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        documentsPdf.set(cle, { doc, nom: file.name });

        const rendu = await dessinerPagePdf(doc, 1);
        await chargerImage(rendu.src);        // remplit imageCache

        // La page occupe les trois quarts de ce qu'on voit, sans déformation
        const dispoL = (window.innerWidth * 0.75) / zoom;
        const dispoH = (window.innerHeight * 0.75) / zoom;
        const k = Math.min(dispoL / rendu.l, dispoH / rendu.h);
        const l = Math.round(rendu.l * k), h = Math.round(rendu.h * k);
        const cx = (window.innerWidth / 2 - panX) / zoom;
        const cy = (window.innerHeight / 2 - panY) / zoom;

        images.push(poserEnRognage({
            id: nextId++, x: cx - l / 2, y: cy - h / 2, w: l, h: h,
            cx: 0, cy: 0, cw: rendu.l, ch: rendu.h,
            src: rendu.src, fileName: file.name, z: globalZ++,
            pluginData: { id: 'pdfDoc', cle, page: 1, pages: doc.numPages, nom: file.name }
        }));
        selectedItems = [{ type: 'image', id: images[images.length - 1].id }];
        saveState(); draw();
        if (typeof updateQuickMenu === 'function') updateQuickMenu();
        showToast(`📄 « ${file.name} » posé — ${doc.numPages} page(s), utilisez ◀ ▶ pour feuilleter`);
    } catch (e) {
        console.error(e);
        showToast('PDF illisible : ' + (e.message || e));
    }
}

async function feuilleterPdf(imgObj, delta) {
    const d = imgObj && imgObj.pluginData && documentsPdf.get(imgObj.pluginData.cle);
    if (!d) return;
    const numero = Math.min(Math.max(1, imgObj.pluginData.page + delta), imgObj.pluginData.pages);
    if (numero === imgObj.pluginData.page) return;
    const rendu = await dessinerPagePdf(d.doc, numero);
    await chargerImage(rendu.src);            // remplit imageCache
    // Un cadrage posé sur une page vaut pour les suivantes TANT QUE les pages
    // se ressemblent : dans un cours scanné, couper l'en-tête une fois suffit.
    // Mais si la page change de format — une planche à l'italienne au milieu
    // d'un document à la française — le même découpage n'a plus de sens : on
    // remet la page entière plutôt que d'en montrer un morceau au hasard.
    const ancien = imageCache[imgObj.src];
    const memeFormat = ancien && ancien.naturalWidth
        && Math.abs((ancien.naturalWidth / ancien.naturalHeight) - (rendu.l / rendu.h)) < 0.01;
    const part = memeFormat
        ? { x: imgObj.cx / ancien.naturalWidth, y: imgObj.cy / ancien.naturalHeight,
            l: imgObj.cw / ancien.naturalWidth, h: imgObj.ch / ancien.naturalHeight }
        : { x: 0, y: 0, l: 1, h: 1 };
    const etaitRogne = memeFormat && (part.l < 0.999 || part.h < 0.999);

    imgObj.src = rendu.src;
    imgObj.cx = part.x * rendu.l; imgObj.cy = part.y * rendu.h;
    imgObj.cw = part.l * rendu.l; imgObj.ch = part.h * rendu.h;
    imgObj.pluginData.page = numero;
    if (!memeFormat && imgObj.pluginData.pageRognee && typeof showToast === 'function') {
        showToast('Cette page a un autre format : elle est montrée en entier');
    }
    imgObj.pluginData.pageRognee = etaitRogne;
    saveState(); draw();
    if (typeof updateQuickMenu === 'function') updateQuickMenu();
}

// ---------------------------------------------------
// LA BARRE DU DOCUMENT
// Deux gestes distincts : régler le CADRE (déplacer, redimensionner) ou
// faire coulisser la PAGE à l'intérieur. Plus l'opacité, le passage sous le
// quadrillage, le verrou et le retrait.
// ---------------------------------------------------
let modeDocument = 'cadre';
let glissePage = null;

// Toute image posée sur le tableau — PDF feuilletable, photo, capture — se
// règle avec la même barre : les gestes sont les mêmes. Un PDF y gagne en
// plus ses flèches de page.
// Le document est-il montré en entier, ou n'en voit-on qu'un morceau ?
// Un tableau enregistré « sans les fichiers », ou dont la table d'images est
// absente, garde ses objets mais plus leur contenu. Ne rien dessiner laissait
// un trou invisible et pourtant sélectionnable : on montre une vignette qui
// dit ce qui manque et de quel fichier il s'agit.
function imageManquante(obj) {
    return !!obj && obj.type !== 'text' && !imageCache[obj.src]
        && obj.w > 0 && obj.h > 0;
}

function dessinerImageManquante(ctx, obj, lw) {
    const w = obj.w, h = obj.h;
    ctx.save();
    ctx.fillStyle = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(45,52,54,0.04)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = isDarkMode ? '#7f8c8d' : '#b2bec3';
    ctx.lineWidth = Math.max(lw, 1) * 1.5;
    ctx.setLineDash([8 * lw, 6 * lw]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);

    const corps = Math.max(9, Math.min(16, Math.min(w, h) / 7));
    ctx.fillStyle = isDarkMode ? '#95a5a6' : '#8a9599';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = (corps * 2) + 'px sans-serif';
    ctx.fillText('🖼', 0, -corps * 1.1);
    ctx.font = '600 ' + corps + 'px sans-serif';
    ctx.fillText('Fichier manquant', 0, corps * 0.6);
    if (obj.fileName) {
        ctx.font = (corps * 0.85) + 'px sans-serif';
        const nom = obj.fileName.length > 28 ? obj.fileName.slice(0, 27) + '…' : obj.fileName;
        ctx.fillText(nom, 0, corps * 2);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
}

// Les images d'un tableau dont la source n'a pas pu être retrouvée, sur
// TOUTES les pages : le trou est souvent sur une page qu'on n'a pas ouverte.
function imagesManquantes() {
    const manquantes = [];
    (pages || []).forEach((p, i) => {
        const liste = (i === currentPageIndex) ? images : (p.images || []);
        (liste || []).forEach(o => { if (imageManquante(o)) manquantes.push({ page: i, obj: o }); });
    });
    return manquantes;
}

// Prévenir à l'ouverture, et proposer de retrouver les fichiers sur le disque.
// On les rattache par leur nom : c'est ce que l'enseignant reconnaît, et c'est
// la seule chose qu'un enregistrement « sans les fichiers » ait conservée.
function signalerImagesManquantes() {
    const manquantes = imagesManquantes();
    if (!manquantes.length) return;
    const noms = manquantes.map(m => m.obj.fileName).filter(Boolean);
    const combien = manquantes.length;
    if (typeof showToast === 'function') {
        showToast(`⚠️ ${combien} image${combien > 1 ? 's' : ''} sans fichier`
            + (noms.length ? ' : ' + noms.slice(0, 3).join(', ') + (noms.length > 3 ? '…' : '') : '')
            + ' — menu Importer › « Retrouver les images »');
    }
}

// Rattache les fichiers choisis aux images qui les attendent, par leur nom.
function retrouverLesImages(fichiers) {
    const manquantes = imagesManquantes();
    if (!manquantes.length) {
        if (typeof showToast === 'function') showToast('Aucune image ne manque sur ce tableau');
        return;
    }
    let rendues = 0, restant = fichiers.length;
    if (!restant) return;

    const fini = () => {
        if (--restant > 0) return;
        if (typeof saveState === 'function') saveState();
        if (typeof draw === 'function') draw();
        const reste = imagesManquantes().length;
        if (typeof showToast === 'function') {
            showToast(rendues
                ? `${rendues} image${rendues > 1 ? 's' : ''} retrouvée${rendues > 1 ? 's' : ''}`
                    + (reste ? ` — il en manque encore ${reste}` : '')
                : 'Aucun de ces fichiers ne correspond aux images manquantes');
        }
    };

    Array.from(fichiers).forEach(f => {
        const cibles = manquantes.filter(m => m.obj.fileName === f.name);
        if (!cibles.length) { fini(); return; }
        const lecteur = new FileReader();
        lecteur.onerror = fini;
        lecteur.onload = (ev) => {
            const src = ev.target.result;
            const img = new Image();
            img.onerror = fini;
            img.onload = () => {
                imageCache[src] = img;
                cibles.forEach(m => {
                    m.obj.src = src;
                    // Un enregistrement léger a pu perdre la découpe : on la
                    // remet sur l'image entière plutôt que sur du vide.
                    if (!(m.obj.cw > 0) || !(m.obj.ch > 0)) {
                        m.obj.cx = 0; m.obj.cy = 0;
                        m.obj.cw = img.naturalWidth; m.obj.ch = img.naturalHeight;
                    }
                    rendues++;
                });
                fini();
            };
            img.src = src;
        };
        lecteur.readAsDataURL(f);
    });
}

function documentEstRogne(obj) {
    const nat = obj && imageCache[obj.src];
    if (!nat || !nat.naturalWidth) return false;
    return obj.cx > 0.5 || obj.cy > 0.5
        || obj.cw < nat.naturalWidth - 0.5 || obj.ch < nat.naturalHeight - 0.5;
}

// Remettre la page entière dans le cadre, sans toucher au cadre lui-même :
// on garde la place prise sur le tableau, on remet juste tout le contenu.
function montrerToutLeDocument(obj) {
    const nat = obj && imageCache[obj.src];
    if (!nat || !nat.naturalWidth) return;
    obj.cx = 0; obj.cy = 0;
    obj.cw = nat.naturalWidth; obj.ch = nat.naturalHeight;
    obj.h = obj.w * (nat.naturalHeight / nat.naturalWidth);
    if (obj.pluginData) obj.pluginData.pageRognee = false;
}

// Une image ou un PDF qu'on vient de poser s'ajuste d'abord en OUVRANT ou en
// FERMANT ses bords : on cadre ce qu'on veut montrer, sans déformer ni
// changer l'échelle de ce qui est écrit dessus. C'est le geste courant sur un
// document scanné ou une capture d'écran. Le bouton ✂ de la barre le rend et
// le reprend ; les tampons des plugins, eux, se redimensionnent comme avant.
function poserEnRognage(obj) {
    obj.isCropping = true;
    obj.ratioLocked = false;
    return obj;
}

function documentSelectionne() {
    if (selectedItems.length !== 1 || selectedItems[0].type !== 'image') return null;
    return getObjectById('image', selectedItems[0].id) || null;
}

// Un tampon fabriqué par un plugin (une pyramide, une fraction, une figure)
// n'est pas un document : il n'y a rien à faire coulisser dans son cadre, tout
// ce qu'il contient est déjà visible. Les deux modes n'ont de sens que pour un
// PDF ou un fichier venu du disque.
function estUnDocumentPose(obj) {
    if (!obj) return false;
    if (obj.pluginData && obj.pluginData.id === 'pdfDoc') return true;
    if (obj.pluginData) return false;          // un tampon de plugin
    return true;                               // une image importée ou collée
}

function estUnPdfFeuilletable(obj) {
    return !!(obj && obj.pluginData && obj.pluginData.id === 'pdfDoc'
        && documentsPdf.has(obj.pluginData.cle));
}

function majBarreDocument() {
    const barre = document.getElementById('barre-document');
    if (!barre) return;
    const obj = documentSelectionne();
    if (!obj || (typeof unMasqueEstOuvert === 'function' && unMasqueEstOuvert())) {
        barre.classList.remove('visible');
        return;
    }
    barre.classList.add('visible');

    // Posée sous le cadre, et ramenée dans l'écran si le document en sort
    const cx = panX + (obj.x + obj.w / 2) * zoom;
    const bas = panY + (obj.y + obj.h) * zoom + 14;
    const demi = (barre.offsetWidth || 480) / 2 + 8;
    barre.style.left = Math.max(demi, Math.min(window.innerWidth - demi, cx)) + 'px';
    barre.style.top = Math.max(8, Math.min(window.innerHeight - barre.offsetHeight - 8, bas)) + 'px';

    // Les flèches n'ont de sens que pour un PDF qu'on peut encore feuilleter
    const feuilletable = estUnPdfFeuilletable(obj);
    document.getElementById('doc-pages').style.display = feuilletable ? 'flex' : 'none';
    document.getElementById('doc-pages-sep').style.display = feuilletable ? 'block' : 'none';
    if (feuilletable) {
        document.getElementById('doc-info').innerText = obj.pluginData.page + '/' + obj.pluginData.pages;
        document.getElementById('doc-prec').style.opacity = obj.pluginData.page > 1 ? '1' : '0.35';
        document.getElementById('doc-suiv').style.opacity = obj.pluginData.page < obj.pluginData.pages ? '1' : '0.35';
    }
    // Cadre / Page : réservés aux documents et aux images importées
    const unDocument = estUnDocumentPose(obj);
    if (!unDocument && modeDocument === 'page') modeDocument = 'cadre';
    document.getElementById('doc-modes').style.display = unDocument ? 'contents' : 'none';
    document.getElementById('doc-modes-sep').style.display = unDocument ? 'block' : 'none';
    document.getElementById('doc-mode-cadre').classList.toggle('actif', modeDocument === 'cadre' && !obj.locked);
    document.getElementById('doc-mode-page').classList.toggle('actif', modeDocument === 'page' && !obj.locked);
    document.getElementById('doc-opacite').value = (obj.opacity === undefined ? 1 : obj.opacity);
    document.getElementById('doc-grille').classList.toggle('actif', !!obj.sousLaGrille);
    document.getElementById('doc-proportions').classList.toggle('actif', obj.ratioLocked !== false);
    document.getElementById('doc-rogner').classList.toggle('actif', !!obj.isCropping);
    document.getElementById('doc-verrou').classList.toggle('actif', !!obj.locked);
    // Le retour à la page entière ne se propose que s'il y a un cadrage à défaire
    const entiere = document.getElementById('doc-entiere');
    if (entiere) entiere.style.display = documentEstRogne(obj) ? 'inline-flex' : 'none';
    document.getElementById('doc-fermer').title = feuilletable ? 'Retirer le document' : "Retirer l'image";
}

function brancherBarreDocument() {
    const b = (id) => document.getElementById(id);
    if (!b('barre-document')) return;

    b('doc-prec').addEventListener('click', () => { const o = documentSelectionne(); if (o) feuilleterPdf(o, -1); });
    b('doc-suiv').addEventListener('click', () => { const o = documentSelectionne(); if (o) feuilleterPdf(o, 1); });

    b('doc-mode-cadre').addEventListener('click', () => { modeDocument = 'cadre'; majBarreDocument(); draw(); });
    b('doc-mode-page').addEventListener('click', () => {
        modeDocument = 'page';
        majBarreDocument(); draw();
        if (typeof showToast === 'function') showToast('Faites glisser la page dans son cadre ; la molette la zoome');
    });

    b('doc-opacite').addEventListener('input', (e) => {
        const o = documentSelectionne(); if (!o) return;
        o.opacity = parseFloat(e.target.value);
        draw();
    });
    b('doc-opacite').addEventListener('change', () => saveState());

    b('doc-grille').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        o.sousLaGrille = !o.sousLaGrille;
        majBarreDocument(); draw(); saveState();
        if (typeof showToast === 'function') {
            showToast(o.sousLaGrille ? 'Le document passe SOUS le quadrillage' : 'Le document repasse au-dessus');
        }
    });

    b('doc-proportions').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        o.ratioLocked = (o.ratioLocked === false);
        majBarreDocument(); draw(); saveState();
    });

    b('doc-rogner').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        o.isCropping = !o.isCropping;
        if (o.isCropping) o.ratioLocked = false;   // on rogne librement
        majBarreDocument(); draw(); saveState();
    });

    b('doc-dupliquer').addEventListener('click', () => duplicateSelection());

    b('doc-entiere').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        montrerToutLeDocument(o);
        majBarreDocument(); draw(); saveState();
        if (typeof showToast === 'function') showToast('Document montré en entier');
    });

    b('doc-verrou').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        o.locked = !o.locked;
        majBarreDocument(); draw(); saveState();
    });

    b('doc-fermer').addEventListener('click', () => {
        const o = documentSelectionne(); if (!o) return;
        if (o.pluginData) documentsPdf.delete(o.pluginData.cle);
        deleteObject('image', o.id);
        selectedItems = [];
        majBarreDocument(); draw(); saveState();
    });
}

// Faire coulisser la page DANS son cadre : on ne bouge pas l'objet, on
// déplace la fenêtre de découpe (cx, cy) sur l'image d'origine.
function demarrerGlissePage(obj, pos) {
    const nat = imageCache[obj.src];
    if (!nat) return false;
    glissePage = {
        obj, x0: pos.x, y0: pos.y, cx0: obj.cx, cy0: obj.cy,
        natL: nat.naturalWidth, natH: nat.naturalHeight
    };
    return true;
}

function poursuivreGlissePage(pos) {
    if (!glissePage) return;
    const g = glissePage, o = g.obj;
    const kx = o.cw / o.w, ky = o.ch / o.h;          // pixels d'image par pixel d'écran
    o.cx = Math.max(0, Math.min(g.natL - o.cw, g.cx0 - (pos.x - g.x0) * kx));
    o.cy = Math.max(0, Math.min(g.natH - o.ch, g.cy0 - (pos.y - g.y0) * ky));
    requestAnimationFrame(draw);
}

// La molette zoome la page dans son cadre, autour du curseur.
function zoomerPage(obj, pos, facteur) {
    const nat = imageCache[obj.src];
    if (!nat) return;
    const ratioX = (pos.x - obj.x) / obj.w, ratioY = (pos.y - obj.y) / obj.h;
    const viseX = obj.cx + ratioX * obj.cw, viseY = obj.cy + ratioY * obj.ch;
    const min = 40;
    let cw = Math.max(min, Math.min(nat.naturalWidth, obj.cw / facteur));
    let ch = cw * (obj.ch / obj.cw);
    if (ch > nat.naturalHeight) { ch = nat.naturalHeight; cw = ch * (obj.cw / obj.ch); }
    obj.cw = cw; obj.ch = ch;
    obj.cx = Math.max(0, Math.min(nat.naturalWidth - cw, viseX - ratioX * cw));
    obj.cy = Math.max(0, Math.min(nat.naturalHeight - ch, viseY - ratioY * ch));
    requestAnimationFrame(draw);
}

async function loadPdf(file) {
    showToast(`Création des pages (Qualité: ${currentPdfQuality}x)... Veuillez patienter ⏳`);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            // Cloner le buffer pour éviter que pdf.js ne le détruise/transfère au Worker
            const originalBuffer = e.target.result;
            const pdfBytesForPdfLib = new Uint8Array(originalBuffer);
            const pdfBytesForPdfJs = new Uint8Array(originalBuffer.slice(0));
            
            const pdf = await pdfjsLib.getDocument(pdfBytesForPdfJs).promise;
            const numPages = pdf.numPages;

            syncPage();

            let startPageIdx = currentPageIndex;
            const p = pages[currentPageIndex];
            const isEmpty = (p.points.length === 0 && p.images.length === 0 && p.freehands.length === 0 && p.texts.length === 0 && p.segments.length === 0 && p.circles.length === 0 && p.rectangles.length === 0 && p.polygons.length === 0 && p.curves.length === 0 && p.arcs.length === 0);

            if (!isEmpty) startPageIdx = pages.length;

            let firstPageW = 0, firstPageH = 0;
            
            // 🌟 INJECTION DE LA BARRE DE CHARGEMENT 🌟
            let loadingOverlay = document.getElementById('pdf-loading-overlay');
            if (!loadingOverlay) {
                loadingOverlay = document.createElement('div');
                loadingOverlay.id = 'pdf-loading-overlay';
                loadingOverlay.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:white; padding:15px 25px; border-radius:30px; z-index:999999; font-family:sans-serif; font-size:14px; font-weight:bold; box-shadow:0 10px 25px rgba(0,0,0,0.3); display:flex; flex-direction:column; align-items:center; gap:10px; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1);';
                document.body.appendChild(loadingOverlay);
            }
            loadingOverlay.innerHTML = `
                <div id="pdf-loading-text">Chargement du PDF (0/${numPages})</div>
                <div style="width:200px;height:8px;background:rgba(255,255,255,0.2);border-radius:4px;overflow:hidden;">
                    <div id="pdf-loading-progress" style="width:0%;height:100%;background:#00d2d3;transition:width 0.2s;"></div>
                </div>
            `;
            loadingOverlay.style.display = 'flex';

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);

                // 🌟 LA MAGIE EST ICI : Le multiplicateur s'adapte au choix de l'utilisateur
                const viewport = page.getViewport({ scale: currentPdfQuality });
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;

                tempCtx.fillStyle = "white";
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                await page.render({ canvasContext: tempCtx, viewport: viewport }).promise;

                // Optimisation RAM : Si on est en Ultra HD (>3), on compresse un peu plus le JPEG (0.75)
                const jpegQuality = currentPdfQuality > 3 ? 0.75 : 0.85;
                const dataUrl = tempCanvas.toDataURL('image/jpeg', jpegQuality);

                // Génération de la miniature pour le panneau latéral
                const thumbCanvas = document.createElement('canvas');
                const scale = 160 / tempCanvas.width;
                thumbCanvas.width = 160;
                thumbCanvas.height = tempCanvas.height * scale;
                const thumbCtx = thumbCanvas.getContext('2d');
                thumbCtx.fillStyle = '#ffffff';
                thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
                thumbCtx.scale(scale, scale);
                thumbCtx.drawImage(tempCanvas, 0, 0);
                const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.5);

                const targetIdx = startPageIdx + (i - 1);
                if (targetIdx >= pages.length) pages.push(createNewPage());

                await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const w = img.width; const h = img.height;
                        const newImgObj = { id: nextId++, x: -w / 2, y: -h / 2, w: w, h: h, cx: 0, cy: 0, cw: w, ch: h, src: dataUrl, z: -999, isBg: true };
                        pages[targetIdx].images.push(newImgObj);
                        pages[targetIdx].thumbnail = thumbDataUrl;
                        // Stocker les métadonnées du PDF (pas les données binaires)
                        pages[targetIdx].pdfMetadata = createPdfMetadata(file, i - 1);
                        imageCache[dataUrl] = img;

                        if (i === 1) {
                            firstPageW = w; firstPageH = h;
                            
                            // AFFICHAGE IMMÉDIAT DE LA PREMIÈRE PAGE AVEC MARGE
                            let targetZoom = 1;
                            const padding = currentPdfMargin; // Marge paramétrable
                            const scaleX = canvas.width / (firstPageW + padding * 2);
                            const scaleY = canvas.height / (firstPageH + padding * 2);
            
                            targetZoom = Math.min(scaleX, scaleY);
                            if (targetZoom < 0.1) targetZoom = 0.1;
                            if (targetZoom > 10) targetZoom = 10;
                            
                            // Eviter que syncPage (dans loadPage) n'écrase notre nouveau zoom !
                            zoom = targetZoom;
                            panX = canvas.width / 2;
                            panY = canvas.height / 2;

                            pages[startPageIdx].zoom = targetZoom;
                            pages[startPageIdx].panX = panX;
                            pages[startPageIdx].panY = panY;
                            
                            loadPage(startPageIdx);
                            if (typeof renderThumbnails === 'function') renderThumbnails();
                        }

                        resolve();
                    };
                    img.src = dataUrl;
                });
                
                // Mise à jour de la barre de chargement
                const progress = Math.round((i / numPages) * 100);
                const progressEl = document.getElementById('pdf-loading-progress');
                const textEl = document.getElementById('pdf-loading-text');
                if (progressEl) progressEl.style.width = progress + '%';
                if (textEl) textEl.innerText = `Chargement du PDF (${i}/${numPages})`;
            }

            // Application du zoom à TOUTES les autres pages générées
            let finalZoom = pages[startPageIdx].zoom;
            let finalPanX = pages[startPageIdx].panX;
            let finalPanY = pages[startPageIdx].panY;

            for (let i = 1; i < numPages; i++) {
                const idx = startPageIdx + i;
                if (pages[idx]) {
                    pages[idx].zoom = finalZoom;
                    pages[idx].panX = finalPanX;
                    pages[idx].panY = finalPanY;
                }
            }

            if (typeof renderThumbnails === 'function') renderThumbnails();
            updatePageUI();
            
            // Masquer la barre de chargement
            if (loadingOverlay) loadingOverlay.style.display = 'none';

            showToast("PDF importé avec succès ! (" + numPages + " pages)");

        } catch (err) {
            console.error(err);
            showToast("Erreur lors de la lecture du fichier PDF.");
        }
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('btn-import-pdf');
    const pdfLoader = document.getElementById('pdf-loader');

    // Ouvrir un cours déjà écrit : Word, LibreOffice ou texte brut
    const btnDoc = document.getElementById('btn-import-doc');
    const docLoader = document.getElementById('doc-loader');
    if (btnDoc && docLoader) {
        btnDoc.addEventListener('click', () => docLoader.click());
        docLoader.addEventListener('change', (e) => {
            Array.from(e.target.files || []).forEach(f => importerDocument(f));
            e.target.value = '';        // pour pouvoir réimporter le même fichier
        });
    }

    if (importBtn && pdfLoader) {
        importBtn.addEventListener('click', () => pdfLoader.click());
        pdfLoader.addEventListener('change', (e) => {
            if (!e.target.files || e.target.files.length === 0) return;
            
            let imageDropCount = 0;
            let pdfDropped = false;

            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];

                if (file.type === 'application/pdf') {
                    if (!pdfDropped) {
                        if (importPdfFeuilletable) poserPdfFeuilletable(file); else loadPdf(file);
                        pdfDropped = true;
                    } else {
                        if (typeof showToast === 'function') showToast("Veuillez importer un seul PDF à la fois.");
                    }
                    continue;
                }

                if (window.LecteurDocuments && window.LecteurDocuments.estUnDocument(file)) {
                    importerDocument(file);
                    continue;
                }

                if (file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')) {
                    handleMp3Drop(file);
                    continue;
                }

                if (file.type.match('video.*') || /\.(mp4|webm|mov|ogg)$/i.test(file.name)) {
                    handleVideoDrop(file);
                    continue;
                }

                if (file.type.match('image.*')) {
                    const reader = new FileReader();
                    const currentOffsetIndex = imageDropCount;
                    imageDropCount++;

                    reader.onload = (f) => {
                        const src = f.target.result;
                        const img = new Image();
                        img.onload = () => {
                            let w = img.width, h = img.height;
                            if (w > 800) { h *= 800 / w; w = 800; }

                            const offset = currentOffsetIndex * (30 / zoom);
                            
                            // Placer l'image au centre de l'écran
                            const rect = canvas.getBoundingClientRect();
                            const cx = rect.width / 2;
                            const cy = rect.height / 2;

                            const lx = (cx - panX) / zoom + offset;
                            const ly = (cy - panY) / zoom + offset;

                            images.push(poserEnRognage({
                                id: nextId++,
                                x: lx - w / 2, y: ly - h / 2,
                                w: w, h: h,
                                cx: 0, cy: 0, cw: img.width, ch: img.height,
                                src: src,
                                z: globalZ++
                            }));

                            imageCache[src] = img;

                            if (typeof saveState === 'function') saveState();
                            if (typeof draw === 'function') draw();
                        };
                        img.src = src;
                    };
                    reader.readAsDataURL(file);
                    continue;
                }
            }
            e.target.value = '';
        });

        // 🌟 INJECTION DU SÉLECTEUR DE QUALITÉ ET MARGE 🌟
        // Vérifie si le sélecteur existe pour ne pas le créer deux fois
        if (!document.getElementById('pdf-quality-select')) {
            const selectContainer = document.createElement('div');
            selectContainer.style.cssText = "display:inline-flex; align-items:center; margin-left:10px; font-family:sans-serif; font-size:13px; color:#636e72;";

            selectContainer.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:8px; margin: 5px 0;">
                    <div style="display:flex; align-items:center;">
                        <label style="margin-right:5px; font-weight:bold; min-width: 65px;">Qualité :</label>
                        <select id="pdf-quality-select" style="padding:4px; border-radius:4px; border:1px solid #ccc; outline:none; cursor:pointer; background:#f8f9fa;">
                            <option value="1.5">Basse (Rapide)</option>
                            <option value="2.5" selected>Standard</option>
                            <option value="4.0">Haute (HD)</option>
                            <option value="5.0">Ultra HD (Lent)</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <label style="margin-right:5px; font-weight:bold; min-width: 65px;" title="Comment le PDF arrive sur le tableau">PDF :</label>
                        <select id="pdf-mode-select" style="padding:4px; border-radius:4px; border:1px solid #ccc; outline:none; cursor:pointer; background:#f8f9fa;">
                            <option value="feuillet">Document feuilletable (posé sur le tableau)</option>
                            <option value="pages">Une page de tableau par page</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <label style="margin-right:5px; font-weight:bold; min-width: 65px;" title="Marge de sécurité autour de la page">Marge :</label>
                        <input type="range" id="pdf-margin-slider" min="0" max="400" step="10" value="120" style="width:70px; margin-right:5px; cursor:pointer;">
                        <span id="pdf-margin-val" style="font-size:11px; min-width: 35px;">120px</span>
                    </div>
                </div>
            `;

            // On glisse ce petit menu juste à côté du bouton "Importer PDF" dans ton HTML
            importBtn.parentNode.insertBefore(selectContainer, importBtn.nextSibling);

            document.getElementById('pdf-quality-select').addEventListener('change', (e) => {
                currentPdfQuality = parseFloat(e.target.value);
                showToast("Qualité d'importation fixée sur : " + e.target.options[e.target.selectedIndex].text);
            });
            
            const choixPdf = document.getElementById('pdf-mode-select');
            if (choixPdf) {
                choixPdf.value = importPdfFeuilletable ? 'feuillet' : 'pages';
                choixPdf.addEventListener('change', (e) => {
                    reglerImportPdf(e.target.value === 'feuillet');
                    showToast(importPdfFeuilletable
                        ? 'Le PDF sera posé en un seul objet, feuilletable sur place'
                        : 'Le PDF remplira une page du tableau par page du document');
                });
            }

            document.getElementById('pdf-margin-slider').addEventListener('input', (e) => {
                currentPdfMargin = parseInt(e.target.value);
                document.getElementById('pdf-margin-val').innerText = currentPdfMargin + "px";
            });
        }
    }
});

const textToolbar = document.getElementById('text-toolbar');

if (textToolbar) {
    // 1. CRUCIAL : On empêche TOUT clic de voler le focus de la zone de texte
    textToolbar.addEventListener('mousedown', (e) => {
        // EXCEPTION : On laisse les inputs (couleur, nombre) fonctionner normalement !
        //  if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
    });

    // 2. Écouteurs pour TOUS les boutons de la barre d'outils (Alignement, Gras, etc.)
    document.querySelectorAll('#text-toolbar button').forEach(btn => {
        btn.addEventListener('click', () => {
            // --- Gestion de l'alignement ---
            if (btn.classList.contains('btn-align')) {
                const alignMode = btn.getAttribute('data-align');
                if (alignMode && wysiwygText && wysiwygText.style.display === 'block') {
                    // En saisie : on aligne la ligne (ou les lignes sélectionnées), pas tout le bloc
                    wysiwygText.focus();
                    normaliserLignesSaisie();
                    const cmd = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight' }[alignMode];
                    if (cmd) document.execCommand(cmd, false, null);
                    activeStyle.textAlign = alignMode;
                    donnerUnCadreAuBloc(alignMode);
                    fermerTiroirsTexte();
                    if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
                    if (typeof draw === 'function') draw();
                    return;
                }
                if (alignMode) {
                    activeStyle.textAlign = alignMode;
                    if (editingTextId) {
                        const t = getObjectById('text', editingTextId);
                        if (t) {
                            // En centré, x est le centre du bloc : on convertit l'ancre
                            // pour que le texte ne saute pas au changement d'alignement
                            if (!t.fixedWidth && (t.align || 'left') !== alignMode) {
                                const sx = (t._cachedStartX !== undefined) ? t._cachedStartX : t.x;
                                const w = t._cachedW || 0;
                                t.x = (alignMode === 'center') ? sx + w / 2 : sx;
                            }
                            t.align = alignMode;
                        }
                    }
                    if (typeof wysiwygText !== 'undefined' && wysiwygText) wysiwygText.style.textAlign = alignMode;
                    if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
                    if (typeof draw === 'function') draw();
                }
            }
            // --- Formatage (Gras, etc.) ---
            else if (btn.classList.contains('btn-format')) {
                const command = btn.getAttribute('data-command');
                if (command) document.execCommand(command, false, null);
            }
            // --- Listes à puces / numérotées ---
            else if (btn.classList.contains('btn-list')) {
                wysiwygText.focus();
                document.execCommand(btn.getAttribute('data-list'), false, null);
                if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
            }
        });
    });

    // --- Styles de paragraphe : Corps / Titre / Sous-titre ---
    document.querySelectorAll('#text-toolbar [data-block]').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = 'true';
        btn.addEventListener('click', () => {
            wysiwygText.focus();
            applyBlockTag(btn.getAttribute('data-block'));
            fermerTiroirsTexte();
            if (typeof updateWysiwygPosition === 'function') updateWysiwygPosition();
        });
    });

    // --- Tiroirs de la barre de texte ---
    document.querySelectorAll('#text-toolbar .tt-tab').forEach(tab => {
        if (tab.dataset.bound) return;
        tab.dataset.bound = 'true';
        tab.addEventListener('click', () => {
            const nom = tab.getAttribute('data-panel');
            const panneau = document.querySelector(`#text-toolbar .tt-panel[data-panel="${nom}"]`);
            const ouvert = panneau && panneau.classList.contains('tt-open');
            fermerTiroirsTexte();
            if (panneau && !ouvert) {
                panneau.classList.add('tt-open');
                tab.classList.add('tt-open');

                // Le tiroir s'ouvre du côté opposé au texte : si la barre est
                // au-dessus du bloc, il descendrait pile sur ce qu'on écrit.
                const barre = textToolbar.getBoundingClientRect();
                const saisie = wysiwygText.getBoundingClientRect();
                const barreAuDessus = barre.bottom <= saisie.top + 2;
                panneau.classList.toggle('tt-up', barreAuDessus);

                // ... et il doit rester dans l'écran
                panneau.style.left = '0px';
                const r = panneau.getBoundingClientRect();
                if (r.right > window.innerWidth - 8) {
                    panneau.style.left = Math.max(-r.left + 8, window.innerWidth - 8 - r.right) + 'px';
                }
            }
            wysiwygText.focus();
        });
    });

    // 3. Remplacement du sélecteur unique par les Pastilles + Roulette
    const textColorPicker = document.getElementById('text-color-picker');
    if (textColorPicker && !document.getElementById('text-quick-colors')) {
        textColorPicker.style.display = 'none'; // On cache la pipette native moche

        const colorContainer = document.createElement('div');
        colorContainer.id = 'text-quick-colors';
        colorContainer.style.display = 'flex';
        colorContainer.style.gap = '4px';
        colorContainer.style.alignItems = 'center';
        colorContainer.style.borderLeft = '1px solid #dfe6e9';
        colorContainer.style.paddingLeft = '6px';
        colorContainer.style.marginLeft = '2px';

        const colors = ['#2d3436', '#0984e3', '#d63031', '#00b894', '#e17055', '#6c5ce7'];

        // Fonction pour mettre en surbrillance la pastille active
        const updateActiveSwatch = (selectedColor) => {
            colorContainer.querySelectorAll('.swatch, .wheel').forEach(d => {
                if (d.dataset.color && d.dataset.color.toLowerCase() === selectedColor.toLowerCase()) {
                    d.style.borderColor = '#b2bec3';
                } else {
                    d.style.borderColor = 'transparent';
                }
            });
        };

        // Création des 6 pastilles de base
        colors.forEach(c => {
            const dot = document.createElement('div');
            dot.className = 'swatch';
            dot.dataset.color = c;
            dot.style.width = '20px'; dot.style.height = '20px';
            dot.style.borderRadius = '50%';
            dot.style.background = c;
            dot.style.cursor = 'pointer';
            dot.style.border = '2px solid transparent';

            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                appliquerCouleurTexte(c);
                activeStyle.strokeColor = c; // Applique la couleur pour la suite de la frappe
                updateActiveSwatch(c);
            });
            colorContainer.appendChild(dot);
        });

        // Bouton "Roulette" pour les couleurs sur-mesure
        const wheelBtn = document.createElement('div');
        wheelBtn.className = 'wheel';
        wheelBtn.style.width = '20px'; wheelBtn.style.height = '20px';
        wheelBtn.style.borderRadius = '50%';
        wheelBtn.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
        wheelBtn.style.cursor = 'pointer';
        wheelBtn.style.border = '2px solid transparent';

        wheelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            textColorPicker.click(); // Déclenche le sélecteur natif
        });

        // Quand l'utilisateur choisit une couleur dans la roulette
        textColorPicker.addEventListener('input', (e) => {
            const c = e.target.value;
            appliquerCouleurTexte(c);
            activeStyle.strokeColor = c;
            updateActiveSwatch(''); // Efface la bordure des pastilles fixes
            wheelBtn.style.borderColor = '#b2bec3'; // Met la bordure sur la roulette
        });

        colorContainer.appendChild(wheelBtn);
        // Les pastilles vivent dans le tiroir « couleur », pas dans la rangée
        const panneauCouleur = document.querySelector('#text-toolbar .tt-panel[data-panel="color"]');
        (panneauCouleur || textToolbar).appendChild(colorContainer);
    }
}

// ===================================================
// GESTION DE LA POLICE ET DE LA TAILLE (VIA BOUTONS)
// ===================================================
const fonts = ['sans-serif', 'serif', 'monospace', "'Comic Sans MS', cursive"];
let currentFontIndex = 0;

// Une sélection non vide dans la zone de saisie : police et taille ne doivent
// alors changer QUE sur les mots surlignés, pas sur tout le bloc.
//
// La sélection disparaît quand on tape un bouton de la barre sur tablette :
// on retient donc la dernière plage surlignée, et on ne l'oublie que si
// l'utilisateur reclique VOLONTAIREMENT dans le texte (ou ferme la saisie).
let dernierePlageSaisie = null;

function plageDansSaisie(r) {
    if (!r || !wysiwygText || wysiwygText.style.display !== 'block') return null;
    if (r.collapsed) return null;
    let n = r.commonAncestorContainer;
    if (n && n.nodeType === 3) n = n.parentNode;
    if (!n || !wysiwygText.contains(n)) return null;
    return r;
}

function selectionDansSaisie() {
    if (!wysiwygText || wysiwygText.style.display !== 'block') return null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
        const vive = plageDansSaisie(sel.getRangeAt(0));
        if (vive) return vive;
    }
    return plageDansSaisie(dernierePlageSaisie);
}

function oublierSelectionSaisie() { dernierePlageSaisie = null; }

document.addEventListener('selectionchange', () => {
    if (!wysiwygText || wysiwygText.style.display !== 'block') return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = plageDansSaisie(sel.getRangeAt(0));
    if (r) dernierePlageSaisie = r.cloneRange();
});

if (wysiwygText) {
    // Un clic dans le texte = nouvelle intention : la portion mémorisée saute
    wysiwygText.addEventListener('pointerdown', () => { dernierePlageSaisie = null; });
}

function tailleDeBaseSaisie() {
    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t && t.fontSize) return t.fontSize;
    }
    return activeStyle.fontSize || 24;
}

// Taille (logique) du texte à l'endroit où commence la sélection
function tailleSelectionCourante() {
    const st = styleSelectionCourante();
    return st && st.taille ? st.taille : null;
}

// L'élément qui porte réellement le style au début de la plage. Après un
// habillage, la borne est posée AVANT un <span> : il faut descendre dedans,
// sinon on relit le style du parent et un clic sur deux serait perdu.
function elementAuDebut(r) {
    let n = r.startContainer;
    if (n.nodeType === 1) {
        const enfant = n.childNodes[r.startOffset];
        if (enfant) n = enfant;
    }
    while (n && n.nodeType === 1 && n.firstChild) n = n.firstChild;
    if (n && n.nodeType === 3) n = n.parentNode;
    return (n && n.nodeType === 1) ? n : null;
}

// Taille (logique), police et couleur au début de la sélection
function styleSelectionCourante() {
    const r = selectionDansSaisie();
    if (!r) return null;
    const n = elementAuDebut(r);
    if (!n || !wysiwygText.contains(n)) return null;
    const cs = getComputedStyle(n);
    const px = parseFloat(cs.fontSize);
    return {
        taille: px ? px / (zoom || 1) : null,
        police: cs.fontFamily || null,
        couleur: cs.color || null
    };
}

// Les nœuds de texte réellement touchés par la plage
function noeudsTexteDeLaPlage(r) {
    let racine = r.commonAncestorContainer;
    if (racine.nodeType !== 1) racine = racine.parentNode;
    const sortie = [];
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    while (marcheur.nextNode()) {
        const n = marcheur.currentNode;
        if (!n.nodeValue || !n.nodeValue.length) continue;
        if (!wysiwygText.contains(n)) continue;
        if (r.intersectsNode(n)) sortie.push(n);
    }
    // Un nœud simplement frôlé par une borne ne compte pas
    return sortie.filter(n => {
        if (n === r.startContainer && r.startOffset >= n.nodeValue.length) return false;
        if (n === r.endContainer && r.endOffset <= 0) return false;
        return true;
    });
}

// Habille chaque morceau sélectionné d'un <span>, sans passer par execCommand :
// les couleurs, le gras et les liens déjà posés restent intacts.
function habillerSelection(decorer) {
    const r = selectionDansSaisie();
    if (!r) return false;
    const noeuds = noeudsTexteDeLaPlage(r);
    if (!noeuds.length) return false;

    const debutN = r.startContainer, debutO = r.startOffset;
    const finN = r.endContainer, finO = r.endOffset;
    const spans = [];

    noeuds.forEach(n => {
        let cible = n;
        // On coupe d'abord la fin, sinon les offsets de début ne valent plus rien
        if (cible === finN && finO < cible.nodeValue.length) cible.splitText(finO);
        if (cible === debutN && debutO > 0) cible = cible.splitText(debutO);
        if (!cible.nodeValue) return;
        // Un <span> qui n'habille QUE ce morceau est réutilisé : sans cela,
        // chaque clic empilerait une couche de plus.
        const p = cible.parentNode;
        let span;
        if (p && p.tagName === 'SPAN' && p.childNodes.length === 1) {
            span = p;
        } else {
            span = document.createElement('span');
            p.insertBefore(span, cible);
            span.appendChild(cible);
        }
        decorer(span);
        spans.push(span);
    });

    if (!spans.length) return false;

    // On remet le surlignage sur ce qu'on vient d'habiller
    const nouvelle = document.createRange();
    nouvelle.setStartBefore(spans[0]);
    nouvelle.setEndAfter(spans[spans.length - 1]);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(nouvelle);
    dernierePlageSaisie = nouvelle.cloneRange();
    return true;
}

// La couleur suit le même chemin : si une portion est surlignée (même si la
// tablette a escamoté le surlignage en tapant le bouton), elle seule change.
function appliquerCouleurTexte(c) {
    if (selectionDansSaisie() && habillerSelection(span => {
        span.style.color = c;
        span.querySelectorAll('[style*="color"], font[color]').forEach(d => {
            if (d.style) d.style.color = '';
            if (d.removeAttribute) d.removeAttribute('color');
        });
    })) return;
    document.execCommand('foreColor', false, c);
}

function appliquerPoliceSelection(font) {
    return habillerSelection(span => {
        span.style.fontFamily = font;
        span.querySelectorAll('[style*="font-family"], font[face]').forEach(d => {
            if (d.style) d.style.fontFamily = '';
            if (d.removeAttribute) d.removeAttribute('face');
        });
    });
}

// La taille d'une portion est écrite en « em », relative à ce dont elle hérite :
// elle suit le zoom de la vue et reste juste si l'on agrandit ensuite le bloc.
function appliquerTailleSelection(pxLogique) {
    return habillerSelection(span => {
        const parent = span.parentNode;
        let herite = tailleDeBaseSaisie();
        if (parent && parent.nodeType === 1) {
            const px = parseFloat(getComputedStyle(parent).fontSize);
            if (px) herite = px / (zoom || 1);
        }
        const ratio = Math.max(0.2, Math.min(8, pxLogique / (herite || 24)));
        span.style.fontSize = (Math.round(ratio * 1000) / 1000) + 'em';
        // Une taille imbriquée se cumulerait : on nettoie les descendants
        span.querySelectorAll('[style*="font-size"], font[size]').forEach(d => {
            if (d.style) d.style.fontSize = '';
            if (d.removeAttribute) d.removeAttribute('size');
        });
    });
}

function changeFontSize(delta) {
    // Sélection en cours : on ne touche qu'à elle
    if (selectionDansSaisie()) {
        const courante = tailleSelectionCourante() || tailleDeBaseSaisie();
        let cible = Math.round(courante) + delta;
        if (cible < 10) cible = 10;
        if (cible > 200) cible = 200;
        if (appliquerTailleSelection(cible)) {
            if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
            return;
        }
    }

    let currentSize = activeStyle.fontSize;
    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t) currentSize = t.fontSize || activeStyle.fontSize;
    }

    let newSize = currentSize + delta;
    if (newSize < 10) newSize = 10;
    if (newSize > 200) newSize = 200;

    activeStyle.fontSize = newSize;

    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t) t.fontSize = newSize;
    }
    updateWysiwygPosition();
    draw();
}

const btnFontCycle = document.getElementById('btn-font-cycle');
if (btnFontCycle) {
    btnFontCycle.addEventListener('click', () => {
        currentFontIndex = (currentFontIndex + 1) % fonts.length;
        const newFont = fonts[currentFontIndex];
        btnFontCycle.style.fontFamily = newFont;

        // Sélection en cours : seule la portion surlignée change de police
        if (selectionDansSaisie() && appliquerPoliceSelection(newFont)) return;

        activeStyle.fontFamily = newFont;
        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) t.fontFamily = newFont;
        }
        updateWysiwygPosition();
        draw();
    });
}

const btnSizeUp = document.getElementById('btn-size-up');
const btnSizeDown = document.getElementById('btn-size-down');
// --- GESTION DE L'INTERLIGNE MANUEL ---
// ===================================================
// GESTION DE L'INTERLIGNE ET DE L'AIMANT 🧲
// ===================================================
const textLineHeightInput = document.getElementById('text-line-height');
if (textLineHeightInput) {
    textLineHeightInput.addEventListener('input', (e) => {
        activeStyle.lineHeight = parseInt(e.target.value);

        const applyToText = (t) => { t.lineHeight = activeStyle.lineHeight; };

        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) applyToText(t);
        } else if (selectedItems.length > 0) {
            selectedItems.forEach(item => {
                const obj = getObjectById(item.type, item.id);
                if (obj && obj.type === 'text') applyToText(obj);
            });
        }
        updateWysiwygPosition();
        draw();
    });
}


if (btnSizeUp) btnSizeUp.addEventListener('click', () => changeFontSize(1));
if (btnSizeDown) btnSizeDown.addEventListener('click', () => changeFontSize(-1));

// ===================================================
// POSITIONNEMENT ET SYNCHRONISATION DE LA BARRE
// ===================================================
// ===================================================
// POSITIONNEMENT ET SYNCHRONISATION DE LA BARRE
// ===================================================
// Applique l'interligne à la zone de saisie. Valeur SANS unité : un titre en
// hérite proportionnellement à sa propre taille, exactement comme le fait le
// moteur de rendu du canvas. En px, les titres étaient décalés de 15 px.
function appliquerInterligneSaisie(lhLogique, sizeLogique) {
    if (!wysiwygText) return;
    const taille = sizeLogique || parseFloat(wysiwygText.style.fontSize) / (zoom || 1) || 24;
    wysiwygText.style.lineHeight = String((lhLogique / taille) || 1.2);
    wysiwygText.style.setProperty('--tt-lh', (lhLogique * zoom) + 'px');
}

function fermerTiroirsTexte() {
    document.querySelectorAll('#text-toolbar .tt-panel.tt-open, #text-toolbar .tt-tab.tt-open')
        .forEach(el => el.classList.remove('tt-open'));
}

// La barre affiche la taille, la police et la couleur de ce sur quoi le
// prochain clic va agir : la portion surlignée s'il y en a une, le bloc sinon.
function syncBadgesTexte() {
    if (!wysiwygText || wysiwygText.style.display !== 'block') return;

    let currentSize = activeStyle.fontSize;
    let currentFont = activeStyle.fontFamily || 'sans-serif';
    let couleur = activeStyle.strokeColor;
    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t) {
            currentSize = t.fontSize || activeStyle.fontSize;
            currentFont = t.fontFamily || 'sans-serif';
            couleur = t.color || t.strokeColor || couleur;
        }
    }

    const portion = styleSelectionCourante();
    if (portion) {
        if (portion.taille) currentSize = Math.round(portion.taille);
        if (portion.police) currentFont = portion.police;
        if (portion.couleur) couleur = portion.couleur;
    }

    const sizeDisplay = document.getElementById('text-size-display');
    if (sizeDisplay) sizeDisplay.innerText = Math.round(currentSize);
    const sizeDisplay2 = document.getElementById('text-size-display-2');
    if (sizeDisplay2) sizeDisplay2.innerText = Math.round(currentSize);
    const pastille = document.getElementById('tt-color-dot');
    if (pastille) pastille.style.background = couleur;
    if (btnFontCycle) btnFontCycle.style.fontFamily = currentFont;
}

// Rafraîchit les pastilles quand on surligne un mot à la souris ou au doigt
document.addEventListener('selectionchange', () => {
    if (wysiwygText && wysiwygText.style.display === 'block') syncBadgesTexte();
});

function updateTextToolbarPosition() {
    if (!textToolbar || !wysiwygText) return;

    if (wysiwygText.style.display === 'block') {
        textToolbar.style.display = 'flex';

        syncBadgesTexte();

        const rect = wysiwygText.getBoundingClientRect();
        const tbHeight = textToolbar.offsetHeight || 40;
        const tbWidth = textToolbar.offsetWidth || 350; // On récupère la largeur réelle de la barre

        // Positionnement vertical : au-dessus si la place existe, sinon en dessous
        // du bloc. La barre ne doit jamais recouvrir le texte qu'on est en train
        // d'écrire, ni sortir de l'écran.
        const marge = 14;
        const placeDessus = rect.top - tbHeight - marge;
        const placeDessous = rect.bottom + marge;
        let topPos;
        if (placeDessus >= 10) topPos = placeDessus;
        else if (placeDessous + tbHeight <= window.innerHeight - 10) topPos = placeDessous;
        else {
            // Ni au-dessus ni en dessous : on se colle au bord le plus dégagé
            topPos = (rect.top > window.innerHeight - rect.bottom)
                ? Math.max(10, rect.top - tbHeight - marge)
                : Math.min(window.innerHeight - tbHeight - 10, rect.bottom + marge);
        }

        // Calcul du positionnement horizontal avec ANTI-DÉBORDEMENT
        let leftPos = rect.left;

        // Si la barre dépasse à droite de l'écran
        if (leftPos + tbWidth > window.innerWidth - 15) {
            leftPos = window.innerWidth - tbWidth - 15; // On la décale vers la gauche avec 15px de marge
        }

        // Sécurité supplémentaire : Si la barre dépasse à gauche
        if (leftPos < 15) {
            leftPos = 15;
        }

        textToolbar.style.left = leftPos + 'px';
        textToolbar.style.top = topPos + 'px';
    } else {
        textToolbar.style.display = 'none';
    }
}


// ===================================================
// WIDGET CALCULATRICE 
// ===================================================

const calcWidget = document.getElementById('calc-widget');
const btnToggleCalc = document.getElementById('btn-toggle-calc');
const btnCalcClose = document.getElementById('btn-calc-close');
const calcExpr = document.getElementById('calc-expr');
const calcRes = document.getElementById('calc-res');

let expression = "";
let lastAnswer = "0";
let evaluated = false;

// Nouveautés : Historique et États
let calcHistory = [];
let calcHistoryIndex = -1; // <-- CORRIGÉ : Nom unique pour éviter le conflit
let isShifted = false;
let angleMode = 'DEG';

// --- Fonction Utilitaires : Décimal vers Fraction ---
function toFraction(x) {
    if (x === 0) return "0";
    if (Math.abs(x) % 1 === 0) return x.toString();

    let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = Math.abs(x);
    do {
        let a = Math.floor(b);
        let aux = h1; h1 = a * h1 + h2; h2 = aux;
        aux = k1; k1 = a * k1 + k2; k2 = aux;
        b = 1 / (b - a);
    } while (Math.abs(Math.abs(x) - h1 / k1) > Math.abs(x) * 1.0E-6 && k1 < 10000);

    if (k1 >= 10000) return parseFloat(x.toPrecision(12)).toString(); // Trop complexe
    return (x < 0 ? "-" : "") + h1 + " / " + k1;
}

// --- 1. Affichage / Masquage ---
if (btnToggleCalc) {
    btnToggleCalc.addEventListener('click', () => {
        calcWidget.style.display = calcWidget.style.display === 'none' ? 'flex' : 'none';
    });
}
if (btnCalcClose) btnCalcClose.addEventListener('click', () => calcWidget.style.display = 'none');

// --- 2. Déplacement (Drag & Drop) ---
let isDraggingCalc = false; let calcStartX = 0, calcStartY = 0;
const calcHandle = calcWidget.querySelector('.drag-handle-calc');

calcHandle.addEventListener('mousedown', (e) => {
    if (e.target === btnCalcClose) return;
    isDraggingCalc = true;
    calcStartX = e.clientX - calcWidget.offsetLeft;
    calcStartY = e.clientY - calcWidget.offsetTop;
});
window.addEventListener('mousemove', (e) => {
    if (isDraggingCalc) {
        calcWidget.style.left = (e.clientX - calcStartX) + 'px';
        calcWidget.style.top = (e.clientY - calcStartY) + 'px';
    }
});
window.addEventListener('mouseup', () => isDraggingCalc = false);


// --- 3. Moteur Mathématique Évolué ---
document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const val = btn.innerText;
        const id = btn.id;

        // -- GESTION DU SHIFT --
        if (id === 'btn-calc-shift') {
            isShifted = !isShifted;
            document.getElementById('ind-shift').style.opacity = isShifted ? 1 : 0;
            document.querySelectorAll('.shiftable').forEach(b => {
                if (isShifted) { b.dataset.norm = b.innerText; b.innerText = b.dataset.shift; }
                else { b.innerText = b.dataset.norm; }
            });
            return;
        }

        // -- GESTION DEG / RAD --
        if (id === 'btn-calc-deg') {
            angleMode = angleMode === 'DEG' ? 'RAD' : 'DEG';
            document.getElementById('ind-angle').innerText = angleMode;
            btn.innerText = angleMode;
            return;
        }

        // -- GESTION DE L'HISTORIQUE --
        if (id === 'btn-calc-up') {
            if (calcHistory.length > 0 && calcHistoryIndex > 0) {
                calcHistoryIndex--; expression = calcHistory[calcHistoryIndex]; calcExpr.innerText = expression;
            } return;
        }
        if (id === 'btn-calc-down') {
            if (calcHistoryIndex < calcHistory.length - 1 && calcHistoryIndex !== -1) {
                calcHistoryIndex++; expression = calcHistory[calcHistoryIndex];
            } else { calcHistoryIndex = calcHistory.length; expression = ""; }
            calcExpr.innerText = expression; return;
        }

        // -- NETTOYAGE SI NOUVEAU CALCUL --
        if (evaluated) {
            if (['×', '÷', '+', '-', '^', 'x²', 'x³'].includes(val)) {
                expression = "Ans";
            } else if (val !== '=' && val !== 'a/b') {
                expression = "";
            }
            evaluated = false;
        }

        if (val === 'AC') {
            expression = ""; calcRes.innerText = "0";
        }
        else if (val === 'DEL') {
            expression = expression.slice(0, -1);
        }
        else if (val === '=') {
            try {
                let evalStr = expression
                    .replace(/×/g, '*')
                    .replace(/÷/g, '/')
                    .replace(/\(-\)/g, '-')
                    .replace(/π/g, 'ctx.PI')
                    .replace(/Ans/g, 'ctx.Ans')
                    .replace(/×10\^/g, '*10**')
                    .replace(/arcsin\(/g, 'ctx.arcsin(')
                    .replace(/arccos\(/g, 'ctx.arccos(')
                    .replace(/arctan\(/g, 'ctx.arctan(')
                    .replace(/sin\(/g, 'ctx.sin(')
                    .replace(/cos\(/g, 'ctx.cos(')
                    .replace(/tan\(/g, 'ctx.tan(')
                    .replace(/∛\(/g, 'ctx.cbrt(')
                    .replace(/√\(/g, 'ctx.sqrt(')
                    .replace(/x³/g, '**3')
                    .replace(/x²/g, '**2')
                    .replace(/\^/g, '**');

                const ctxMath = {
                    sin: (a) => Math.sin(angleMode === 'DEG' ? a * Math.PI / 180 : a),
                    cos: (a) => Math.cos(angleMode === 'DEG' ? a * Math.PI / 180 : a),
                    tan: (a) => Math.tan(angleMode === 'DEG' ? a * Math.PI / 180 : a),
                    arcsin: (a) => (angleMode === 'DEG' ? 180 / Math.PI : 1) * Math.asin(a),
                    arccos: (a) => (angleMode === 'DEG' ? 180 / Math.PI : 1) * Math.acos(a),
                    arctan: (a) => (angleMode === 'DEG' ? 180 / Math.PI : 1) * Math.atan(a),
                    sqrt: Math.sqrt, cbrt: Math.cbrt, PI: Math.PI, Ans: parseFloat(lastAnswer) || 0
                };

                let execFn = new Function('ctx', 'return ' + evalStr);
                let result = execFn(ctxMath);

                if (result !== undefined && !isNaN(result)) {
                    result = parseFloat(result.toPrecision(12)).toString();
                    calcRes.innerText = result;
                    lastAnswer = result;
                    evaluated = true;

                    if (calcHistory[calcHistory.length - 1] !== expression) calcHistory.push(expression);
                    calcHistoryIndex = calcHistory.length;
                } else {
                    calcRes.innerText = "Erreur";
                }
            } catch (err) {
                calcRes.innerText = "Erreur syn.";
            }
        }
        else {
            let appendVal = val;

            if (['sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', '√', '∛'].includes(val)) appendVal += '(';
            else if (val === '×10ˣ') appendVal = '×10^';
            else if (val === 'a/b') {
                if (evaluated) {
                    calcRes.innerText = toFraction(parseFloat(lastAnswer));
                    return;
                } else {
                    appendVal = '/';
                }
            }

            expression += appendVal;
        }

        calcExpr.innerText = expression;
    });
});

// ==========================================
// GESTION DES MENUS DÉROULANTS ET SLIDERS
// ==========================================

const btnImportMenu = document.getElementById('btn-import-menu');
const popupImport = document.getElementById('import-popup-menu');

const btnExportMenu = document.getElementById('btn-export-menu');
const popupExport = document.getElementById('export-popup-menu');

const btnZoomToggle = document.getElementById('btn-zoom-toggle');
const popupZoom = document.getElementById('popup-zoom');

const btnGridToggle = document.getElementById('btn-grid-toggle');
const popupGrid = document.getElementById('popup-grid');

// Fonction pour tout fermer
function closeAllPopups() {
    if (popupImport) popupImport.classList.remove('show');
    if (popupExport) popupExport.classList.remove('show');
    if (popupZoom) popupZoom.classList.remove('show');
    if (popupGrid) popupGrid.classList.remove('show');
}

// Ajouter le Toggle sur les boutons
[
    { btn: btnImportMenu, popup: popupImport },
    { btn: btnExportMenu, popup: popupExport },
    { btn: btnZoomToggle, popup: popupZoom },
    { btn: btnGridToggle, popup: popupGrid }
].forEach(pair => {
    if (pair.btn && pair.popup) {
        pair.btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêche le clic de se propager
            const isShowing = pair.popup.classList.contains('show');
            closeAllPopups(); // Ferme les autres
            if (!isShowing) pair.popup.classList.add('show'); // Ouvre celui-ci
            // Le menu contextuel d'objet s'efface pendant qu'un menu est ouvert
            if (typeof updateQuickMenu === 'function') updateQuickMenu();
        });
    }
});

// Fermer les pop-ups si on clique n'importe où ailleurs sur la page
window.addEventListener('click', () => {
    closeAllPopups();
    if (typeof updateQuickMenu === 'function') updateQuickMenu();
});

// Empêcher la fermeture si on clique À L'INTÉRIEUR du pop-up (ex: manipuler le slider)
document.querySelectorAll('.popup-content').forEach(popup => {
    popup.addEventListener('click', (e) => e.stopPropagation());
});

// --- Mise à jour du texte du bouton Zoom en direct ---
const zoomSlider = document.getElementById('zoom-slider');
if (zoomSlider && btnZoomToggle) {
    zoomSlider.addEventListener('input', () => {
        majPastilleZoom(zoomSlider.value);
    });
}

// ==========================================
// MODALE FLOTTANTE ET TAMPON (POUR PLUGINS)
// ==========================================
let isDraggingPrompt = false; let promptStartX = 0; let promptStartY = 0;
const promptModal = document.getElementById('custom-prompt-modal');
const promptHandle = promptModal.querySelector('.drag-handle-prompt');

// Rendre la modale déplaçable
promptHandle.addEventListener('mousedown', (e) => {
    isDraggingPrompt = true;
    promptStartX = e.clientX - promptModal.offsetLeft;
    promptStartY = e.clientY - promptModal.offsetTop;
});
window.addEventListener('mousemove', (e) => {
    if (isDraggingPrompt) {
        promptModal.style.left = (e.clientX - promptStartX) + 'px';
        promptModal.style.top = (e.clientY - promptStartY) + 'px';
    }
});
window.addEventListener('mouseup', () => isDraggingPrompt = false);

// La fonction Universelle
// La fonction Universelle (avec Palette Rapide)
// ===================================================
// RENONCER À UN OUTIL SANS BLOQUER LE TABLEAU
// Une vingtaine de plugins arment leur mode AVANT d'ouvrir leur boîte de
// réglages. « Annuler » ne refermait que la boîte : le mode restait armé,
// aucun tampon ne suivait, et le tableau ne réagissait plus à rien — ni
// sélection, ni dessin. On croyait l'application plantée. Renoncer remet
// donc l'outil de sélection, une bonne fois pour toutes les boîtes.
// ===================================================
const MODES_DE_BASE = ['pointer', 'move', 'freehand', 'highlighter', 'eraser', 'text',
    'point', 'segment', 'droite', 'demi-droite', 'circle', 'rectangle', 'polygon',
    'curve', 'postit', 'laser', 'zoom-box'];

// Une fenêtre d'outil posée à des coordonnées et une largeur fixes sort de
// l'écran dès qu'on travaille sur une tablette : le pied de la fenêtre, avec
// son bouton « Poser au tableau », devient inatteignable. On la ramène.
// ==============================================================================
// LES FENÊTRES S'AGRANDISSENT
// ==============================================================================
// Chaque outil ouvrait une fenêtre à la taille que son auteur avait prévue.
// Une liste de trente élèves, un tableur, un texte long : on défilait dans un
// hublot. Toutes les fenêtres reçoivent donc la même paire de commandes, dans
// le coin bas-droit : le plein écran, et une poignée pour ajuster. La taille
// choisie est retenue d'une ouverture à l'autre.
const CLE_FENETRES = 'board_fenetres';
const FEN_MIN_L = 260, FEN_MIN_H = 170;

function taillesRetenues() {
    try { return JSON.parse(localStorage.getItem(CLE_FENETRES) || '{}') || {}; }
    catch (e) { return {}; }
}
function retenirTaille(cle, w, h) {
    if (!cle) return;
    try {
        const t = taillesRetenues();
        t[cle] = { w: Math.round(w), h: Math.round(h) };
        localStorage.setItem(CLE_FENETRES, JSON.stringify(t));
    } catch (e) { /* stockage refusé */ }
}

// Poser une hauteur sur une fenêtre qui ne sait pas répartir ses enfants la
// ferait déborder sans barre de défilement : on lui en donne une.
function accepteUneHauteur(el) {
    const d = getComputedStyle(el).display;
    return d === 'flex' || d === 'grid';
}

const ICONE_PLEIN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICONE_REDUIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

// Tout ce qui flotte n'est pas une fenêtre. Une télécommande est un bandeau
// de boutons : rien à y agrandir. Un jeu qui occupe déjà tout l'écran non
// plus. On ne les encombre pas de commandes inutiles.
function meriteDesCommandes(el) {
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return true;             // pas encore posée : on équipe
    if (b.height < 110) return false;                   // un bandeau, pas une fenêtre
    if (b.width >= window.innerWidth - 20 && b.height >= window.innerHeight - 20) return false;
    return true;
}

// Beaucoup d'outils posent leur fenêtre vide puis la remplissent : mesurée
// tout de suite, elle passerait pour un bandeau. On laisse donc deux images
// à l'affichage avant de juger — et si l'on a décliné, un prochain appel
// pourra reconsidérer, car une fenêtre grandit parfois avec son contenu.
function equiperFenetre(el, cle, options) {
    if (!el || el.dataset.equipee || el.dataset.fenAttente) return;
    el.dataset.fenAttente = '1';

    const juger = () => {
        delete el.dataset.fenAttente;
        if (el.dataset.equipee) return true;
        if (!(options && options.toujours) && !meriteDesCommandes(el)) return true;
        equiperVraiment(el, cle, options);
        return true;
    };

    requestAnimationFrame(() => requestAnimationFrame(() => {
        // Certaines fenêtres sont bâties repliées et ne s'ouvrent que plus
        // tard : on attend qu'elles occupent enfin une place pour juger.
        if (!el.getBoundingClientRect().width && typeof ResizeObserver === 'function') {
            const veille = new ResizeObserver(() => {
                if (!el.getBoundingClientRect().width) return;
                veille.disconnect();
                juger();
            });
            veille.observe(el);
            return;
        }
        juger();
    }));
}

function equiperVraiment(el, cle, options) {
    el.dataset.equipee = '1';
    cle = cle || el.id || el.dataset.fenetreCle || '';
    // L'explorateur de fichiers a déjà sa poignée : il ne prend que le plein écran.
    const saPoignee = !!(options && options.saPropreP) || el.dataset.fenetrePoignee === 'propre';

    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const outils = document.createElement('div');
    outils.className = 'fen-outils';
    outils.innerHTML = `<button type="button" class="fen-plein" title="Plein écran">${ICONE_PLEIN}</button>`
        + (saPoignee ? '' : `<div class="fen-poignee" title="Ajuster la taille"></div>`);
    el.appendChild(outils);

    // Beaucoup d'outils réécrivent tout leur contenu à chaque rafraîchissement :
    // les commandes disparaîtraient avec. On les remet dès qu'elles manquent.
    if (typeof MutationObserver === 'function') {
        new MutationObserver(() => {
            if (!el.contains(outils)) el.appendChild(outils);
        }).observe(el, { childList: true });
    }

    const bouton = outils.querySelector('.fen-plein');
    const poignee = outils.querySelector('.fen-poignee');

    // --- Plein écran ---
    let avantPlein = null;
    const basculerPlein = () => {
        if (avantPlein) {
            Object.assign(el.style, avantPlein);
            avantPlein = null;
            bouton.innerHTML = ICONE_PLEIN;
            bouton.title = 'Plein écran';
            el.classList.remove('fen-pleine');
        } else {
            const s = el.style;
            avantPlein = {
                left: s.left, top: s.top, width: s.width, height: s.height,
                maxWidth: s.maxWidth, maxHeight: s.maxHeight, transform: s.transform,
                boxSizing: s.boxSizing
            };
            const fixe = getComputedStyle(el).position === 'fixed';
            if (fixe) { el.style.left = '8px'; el.style.top = '8px'; el.style.transform = 'none'; }
            // Sans cela, les marges intérieures s'ajoutent à la taille demandée
            // et la fenêtre dépasse de l'écran de la valeur de son padding.
            el.style.boxSizing = 'border-box';
            el.style.maxWidth = 'none';
            el.style.maxHeight = 'none';
            el.style.width = (window.innerWidth - 16) + 'px';
            el.style.height = (window.innerHeight - 16) + 'px';
            bouton.innerHTML = ICONE_REDUIT;
            bouton.title = 'Quitter le plein écran';
            el.classList.add('fen-pleine');
        }
        if (typeof draw === 'function' && el.querySelector('canvas')) {
            window.dispatchEvent(new Event('resize'));   // les outils qui dessinent se remettent d'aplomb
        }
    };
    bouton.addEventListener('click', (e) => { e.stopPropagation(); basculerPlein(); });

    // Le double-clic sur la barre de titre : le geste que tout le monde essaie.
    // Il est délégué, car cette barre est souvent redessinée.
    el.addEventListener('dblclick', (e) => {
        const tete = el.firstElementChild;
        if (!tete || tete === outils) return;
        if (e.target.closest('button, input, select, textarea, a')) return;
        if (tete.contains(e.target)) basculerPlein();
    });

    // Échap rend l'écran : on ne reste pas prisonnier d'une fenêtre géante.
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && avantPlein && el.getClientRects().length) basculerPlein();
    });

    // --- La poignée ---
    if (poignee) poignee.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        if (avantPlein) basculerPlein();                 // on sort du plein écran pour ajuster
        const b = el.getBoundingClientRect();
        const depart = { x: e.clientX, y: e.clientY, w: b.width, h: b.height };
        el.style.boxSizing = 'border-box';       // ce que l'on tire est ce que l'on obtient
        el.style.maxWidth = 'none';
        el.style.maxHeight = 'none';
        const hauteurOk = accepteUneHauteur(el);
        if (!hauteurOk) el.style.overflowY = 'auto';
        poignee.setPointerCapture(e.pointerId);

        // Une fenêtre posée à un endroit ne peut grandir que jusqu'au bord ;
        // une modale, elle, se recentre en grandissant : elle a tout l'écran.
        const ancree = getComputedStyle(el).position === 'fixed';
        const maxL = ancree ? window.innerWidth - b.left - 8 : window.innerWidth - 16;
        const maxH = ancree ? window.innerHeight - b.top - 8 : window.innerHeight - 16;

        const bouger = (ev) => {
            const l = Math.max(FEN_MIN_L, Math.min(depart.w + ev.clientX - depart.x, maxL));
            const h = Math.max(FEN_MIN_H, Math.min(depart.h + ev.clientY - depart.y, maxH));
            el.style.width = l + 'px';
            el.style.height = h + 'px';
        };
        const finir = () => {
            poignee.removeEventListener('pointermove', bouger);
            poignee.removeEventListener('pointerup', finir);
            poignee.removeEventListener('pointercancel', finir);
            const f = el.getBoundingClientRect();
            retenirTaille(cle, f.width, f.height);
            if (typeof draw === 'function' && el.querySelector('canvas')) {
                window.dispatchEvent(new Event('resize'));
            }
        };
        poignee.addEventListener('pointermove', bouger);
        poignee.addEventListener('pointerup', finir);
        poignee.addEventListener('pointercancel', finir);
    });

    // --- La taille de la dernière fois ---
    const memoire = cle ? taillesRetenues()[cle] : null;
    if (memoire && memoire.w > FEN_MIN_L) {
        el.style.boxSizing = 'border-box';
        el.style.maxWidth = 'none';
        el.style.width = Math.min(memoire.w, window.innerWidth - 16) + 'px';
        if (memoire.h > FEN_MIN_H) {
            el.style.maxHeight = 'none';
            el.style.height = Math.min(memoire.h, window.innerHeight - 16) + 'px';
            if (!accepteUneHauteur(el)) el.style.overflowY = 'auto';
        }
    }
}
window.equiperFenetre = equiperFenetre;

function ramenerFenetreDansLecran(el) {
    if (!el) return;
    equiperFenetre(el);                 // même repliée : elle s'équipera en s'ouvrant
    if (!el.getClientRects().length) return;
    const marge = 8;
    // Une fenêtre agrandie à la main garde sa taille : la borne ne s'applique
    // qu'à celles qui n'ont pas été touchées.
    if (!el.style.width) el.style.maxWidth = 'calc(100vw - 16px)';
    if (!el.style.height) el.style.maxHeight = 'calc(100vh - 16px)';
    const b = el.getBoundingClientRect();
    const gauche = Math.max(marge, Math.min(b.left, window.innerWidth - b.width - marge));
    const haut = Math.max(marge, Math.min(b.top, window.innerHeight - b.height - marge));
    if (Math.abs(gauche - b.left) > 0.5 || Math.abs(haut - b.top) > 0.5) {
        el.style.left = gauche + 'px';
        el.style.top = haut + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
    }
}
window.ramenerFenetreDansLecran = ramenerFenetreDansLecran;

// Une fois le tampon posé, on revient à la flèche ET l'objet posé est
// sélectionné : c'est presque toujours pour le déplacer ou le redimensionner
// qu'on le regarde ensuite. La moitié des outils repassaient déjà en flèche,
// l'autre non — et aucun ne sélectionnait ce qu'il venait de poser.
// Les outils faits pour tamponner en rafale gardent leur tampon armé : on les
// laisse tranquilles.
function apresPoseDeTampon(idAvant) {
    if (typeof hasPendingStamp === 'function' && hasPendingStamp()) return;

    const nouveaux = [];
    const relever = (liste, type) => (liste || []).forEach(o => {
        if (o && typeof o.id === 'number' && o.id >= idAvant) nouveaux.push({ type, id: o.id });
    });
    relever(images, 'image'); relever(texts, 'text'); relever(htmlPostits, 'htmlPostit');
    relever(segments, 'segment'); relever(circles, 'circle'); relever(rectangles, 'rectangle');
    relever(freehands, 'freehand'); relever(curves, 'curve'); relever(polygons, 'polygon');
    relever(arcs, 'arc');
    if (!nouveaux.length) return;

    if (typeof setMode === 'function' && mode !== 'pointer') setMode('pointer');
    selectedItems = nouveaux;
    if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
    if (typeof updateQuickMenu === 'function') updateQuickMenu();
    if (typeof draw === 'function') draw();
}

function annulerModePlugin() {
    if (typeof mode === 'undefined' || MODES_DE_BASE.includes(mode)) return;
    if (typeof setMode === 'function') setMode('pointer');
    document.querySelectorAll('#bar-tools .btn, #bar-plugins .btn, #plugins-grid .btn, .custom-toolbar .btn')
        .forEach(b => b.classList.remove('active'));
    if (typeof window !== 'undefined') window.postitStamp = null;
    if (typeof draw === 'function') draw();
}
window.annulerModePlugin = annulerModePlugin;

function openCustomPrompt(title, fields, onChange, onValidate) {
    document.getElementById('custom-prompt-title').innerText = title;
    const container = document.getElementById('custom-prompt-inputs');
    const previewBox = document.getElementById('custom-prompt-preview');
    container.innerHTML = '';

    if (previewBox) {
        previewBox.innerHTML = '';
        // 🌟 CORRECTION ICI : Si onChange est null, on cache complètement la boîte pointillée !
        if (onChange && typeof onChange === 'function') {
            previewBox.style.display = 'flex'; // ou 'block' selon ton CSS initial
        } else {
            previewBox.style.display = 'none';
        }
    }

    // NOUVEAU DESIGN : Grille à 2 colonnes pour diviser la hauteur par 2
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '1fr 1fr';
    container.style.gap = '12px 16px';
    container.style.alignItems = 'end'; // Aligne les champs vers le bas si les labels diffèrent

    const inputElements = [];

    fields.forEach(field => {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '6px';

        // Si c'est la couleur ou un grand champ (comme les Textes), il prend toute la largeur (2 colonnes)
        if (field.type === 'color' || field.type === 'text') {
            wrap.style.gridColumn = '1 / -1';
        }

        // Label au style Premium (Petit, majuscule, discret)
        const lbl = document.createElement('label');
        lbl.innerText = field.label;
        lbl.style.fontSize = '10px';
        lbl.style.fontWeight = '700';
        lbl.style.textTransform = 'uppercase';
        lbl.style.letterSpacing = '0.5px';
        lbl.style.color = (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#b2bec3' : '#636e72';

        let inp;
        if (field.type === 'select') {
            inp = document.createElement('select');
            inp.className = 'prompt-input';
            inp.style.width = '100%';
            field.options.forEach(opt => {
                const optEl = document.createElement('option');
                optEl.value = opt.value; optEl.innerText = opt.label;
                inp.appendChild(optEl);
            });
            inp.value = field.value;
        }
        else if (field.type === 'color') {
            inp = document.createElement('input');
            inp.type = 'color'; inp.value = field.value || '#2d3436';
            inp.style.display = 'none';

            const colorWrap = document.createElement('div');
            colorWrap.style.display = 'flex'; colorWrap.style.gap = '10px'; colorWrap.style.alignItems = 'center';
            colorWrap.style.padding = '4px 0';

            const colors = ['#2d3436', '#0984e3', '#d63031', '#00b894', '#e17055', '#6c5ce7'];
            const wheelBtn = document.createElement('div');

            const renderSwatches = () => {
                colorWrap.querySelectorAll('.swatch').forEach(s => s.remove());
                colors.forEach(c => {
                    const dot = document.createElement('div');
                    dot.className = 'swatch';
                    dot.style.width = '26px';
                    dot.style.height = '26px';
                    dot.style.borderRadius = '50%';
                    dot.style.flexShrink = '0'; // CRUCIAL : Empêche l'écrasement en ovale !
                    dot.style.background = c;
                    dot.style.cursor = 'pointer';
                    dot.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';

                    // Style de sélection Premium
                    if (c.toLowerCase() === inp.value.toLowerCase()) {
                        dot.style.boxShadow = `0 0 0 2px #ffffff, 0 0 0 4px ${c}`;
                        dot.style.transform = 'scale(1.05)';
                    } else {
                        dot.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                    }

                    dot.onclick = () => { inp.value = c; renderSwatches(); inp.dispatchEvent(new Event('input')); };
                    colorWrap.insertBefore(dot, wheelBtn);
                });
            };

            wheelBtn.style.width = '26px'; wheelBtn.style.height = '26px';
            wheelBtn.style.borderRadius = '50%';
            wheelBtn.style.flexShrink = '0'; // Empêche l'écrasement
            wheelBtn.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
            wheelBtn.style.cursor = 'pointer';
            wheelBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
            wheelBtn.onclick = () => inp.click();

            inp.addEventListener('input', () => {
                renderSwatches();
                wheelBtn.style.boxShadow = (!colors.includes(inp.value.toLowerCase())) ? `0 0 0 2px #ffffff, 0 0 0 4px #b2bec3` : '0 2px 4px rgba(0,0,0,0.15)';
                if (onChange && typeof onChange === 'function') {
                    const svgPreview = onChange(inputElements.map(i => i.value));
                    if (svgPreview && previewBox) previewBox.innerHTML = svgPreview;
                }
            });

            colorWrap.appendChild(wheelBtn); colorWrap.appendChild(inp);
            renderSwatches();
            wrap.appendChild(lbl); wrap.appendChild(colorWrap);
            container.appendChild(wrap); inputElements.push(inp);
            return;
        }
        else if (field.type === 'checkbox') {
            inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = !!field.value;
            inp.style.width = '20px';
            inp.style.height = '20px';
            inp.style.cursor = 'pointer';
        }
        else {
            inp = document.createElement('input');
            inp.type = field.type || 'text'; inp.value = field.value || '';
            inp.placeholder = field.placeholder || '';
            inp.className = 'prompt-input';
            inp.style.width = '100%';
        }

        inp.addEventListener(field.type === 'select' ? 'change' : 'input', () => {
            if (onChange && typeof onChange === 'function') {
                const results = inputElements.map(i => i.type === 'checkbox' ? i.checked : i.value);
                const svgPreview = onChange(results);
                if (svgPreview && previewBox) previewBox.innerHTML = svgPreview;
            }
        });

        wrap.appendChild(lbl); wrap.appendChild(inp);
        container.appendChild(wrap); inputElements.push(inp);
    });

    promptModal.style.display = 'flex';
    if (inputElements.length > 0 && inputElements[0].focus) inputElements[0].focus();

    if (onChange && typeof onChange === 'function') {
        // Appelle la fonction onChange pour dessiner l'aperçu au chargement
        const initialSvg = onChange(inputElements.map(i => i.type === 'checkbox' ? i.checked : i.value), previewBox);
        // Si onChange retourne une chaîne, on l'injecte. Si elle gère l'injection elle-même (comme pour la pyramide), initialSvg sera vide, ce qui est parfait.
        if (initialSvg && previewBox && typeof initialSvg === 'string') previewBox.innerHTML = initialSvg;
    }

    const btnOk = document.getElementById('custom-prompt-ok'); const btnCancel = document.getElementById('custom-prompt-cancel');
    const newBtnOk = btnOk.cloneNode(true); const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk); btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

    newBtnOk.addEventListener('click', () => { promptModal.style.display = 'none'; if (onValidate) onValidate(inputElements.map(i => i.type === 'checkbox' ? i.checked : i.value)); });
    newBtnCancel.addEventListener('click', () => { promptModal.style.display = 'none'; annulerModePlugin(); });
}

// Échap referme la boîte de réglages comme le bouton « Annuler » : même
// geste, même conséquence, et surtout pas de tableau laissé inerte.
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const boite = document.getElementById('custom-prompt-modal');
    if (!boite || !boite.getClientRects().length) return;
    e.preventDefault();
    e.stopPropagation();
    boite.style.display = 'none';
    annulerModePlugin();
}, true);
// =========================================================
// GESTION DU DOCK (INJECTION DYNAMIQUE 100% SÉCURISÉE)
// =========================================================
// =========================================================
// GESTION DES BARRES D'OUTILS "MINIMISABLES" (DOCKING DYNAMIQUE)
// =========================================================
document.addEventListener('DOMContentLoaded', () => {

    function updateDockPositions() {
        const minimizedBars = Array.from(document.querySelectorAll('.toolbar.minimized'));
        const dock = ensureFloatingDock();

        minimizedBars.forEach(bar => {
            if (bar.parentNode !== dock) {
                dock.appendChild(bar);
            }
        });
    }

    document.querySelectorAll('.toolbar').forEach(toolbar => {
        const minimizeBtn = toolbar.querySelector('.btn-minimize');
        const badgeBtn = toolbar.querySelector('.toolbar-badge');
        const toolbarId = toolbar.id;

        if (minimizeBtn && badgeBtn) {
            if (localStorage.getItem('minimized_' + toolbarId) === 'true') {
                toolbar.classList.add('minimized');
            }

            minimizeBtn.addEventListener('click', (e) => {
                // Sauvegarder les styles d'origine
                toolbar.dataset.oldLeft = toolbar.style.left || '';
                toolbar.dataset.oldTop = toolbar.style.top || '';
                toolbar.dataset.oldBottom = toolbar.style.bottom || '';
                toolbar.dataset.oldRight = toolbar.style.right || '';
                toolbar.dataset.oldTransform = toolbar.style.transform || '';

                requestAnimationFrame(() => {
                    toolbar.classList.add('minimized');
                    localStorage.setItem('minimized_' + toolbarId, 'true');
                    updateDockPositions();
                });

                e.stopPropagation();
            });

            badgeBtn.addEventListener('click', (e) => {
                toolbar.classList.remove('minimized');

                document.body.appendChild(toolbar);

                // Restaurer la position d'origine
                toolbar.style.left = toolbar.dataset.oldLeft || '';
                toolbar.style.top = toolbar.dataset.oldTop || '';
                toolbar.style.bottom = toolbar.dataset.oldBottom || '';
                toolbar.style.right = toolbar.dataset.oldRight || '';
                toolbar.style.transform = toolbar.dataset.oldTransform || '';

                localStorage.setItem('minimized_' + toolbarId, 'false');
                e.stopPropagation();
            });
        }
    });

    setTimeout(updateDockPositions, 50);
});

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    majInterrupteursBarre();
    draw();
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) toggleFocusMode();
});

// Boîte englobante logique d'un objet, quel que soit son type (null si indéterminable)
function getItemLogicalBounds(type, obj) {
    if (!obj) return null;
    const fromPoints = (pts) => {
        let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
        pts.forEach(p => { if (p) { mx = Math.min(mx, p.x); my = Math.min(my, p.y); Mx = Math.max(Mx, p.x); My = Math.max(My, p.y); } });
        if (mx === Infinity) return null;
        return { bx: mx, by: my, bw: Mx - mx, bh: My - my };
    };
    if (type === 'image') return { bx: obj.x, by: obj.y, bw: obj.w, bh: obj.h };
    if (type === 'text') return { bx: obj._cachedStartX || obj.x, by: obj.y, bw: obj._cachedW || 100, bh: obj._cachedH || 50 };
    if (type === 'point') return { bx: obj.x, by: obj.y, bw: 0, bh: 0 };
    if (type === 'circle') {
        const c = getObjectById('point', obj.center_id), e = getObjectById('point', obj.edge_id);
        if (!c || !e) return null;
        const r = Math.hypot(e.x - c.x, e.y - c.y);
        return { bx: c.x - r, by: c.y - r, bw: 2 * r, bh: 2 * r };
    }
    if (type === 'rectangle') {
        const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
        return fromPoints([p1, p2]);
    }
    if (type === 'segment') {
        const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
        return fromPoints([p1, p2]);
    }
    if ((type === 'polygon' || type === 'curve') && obj.points) return fromPoints(obj.points.map(id => getObjectById('point', id)));
    if (type === 'freehand' && obj.points) return fromPoints(obj.points);
    if (type === 'arc' && obj.radius !== undefined) {
        return { bx: obj.cx - obj.radius, by: obj.cy - obj.radius, bw: 2 * obj.radius, bh: 2 * obj.radius };
    }
    return null;
}

// Boîte englobante de toute la sélection courante
function getSelectionLogicalBounds() {
    if (typeof selectedItems === 'undefined' || !selectedItems.length) return null;
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    selectedItems.forEach(item => {
        const b = getItemLogicalBounds(item.type, getObjectById(item.type, item.id));
        if (!b) return;
        mx = Math.min(mx, b.bx); my = Math.min(my, b.by);
        Mx = Math.max(Mx, b.bx + b.bw); My = Math.max(My, b.by + b.bh);
    });
    if (mx === Infinity) return null;
    return { bx: mx, by: my, bw: Mx - mx, bh: My - my };
}

// Supprime toute la sélection (et les groupes associés). Respecte le verrouillage.
function deleteSelection() {
    if (typeof selectedItems === 'undefined' || !selectedItems.length) return false;
    let itemsToDelete = new Map();
    let blockedByLock = false;
    selectedItems.forEach(item => {
        const obj = getObjectById(item.type, item.id);
        if (!obj) return;
        if (obj.locked && !obj.groupId) { blockedByLock = true; return; }
        itemsToDelete.set(item.type + '-' + item.id, item);
        if (obj.groupId) {
            getGroupMembers(obj.groupId).forEach(member => {
                itemsToDelete.set(member.type + '-' + member.id, { type: member.type, id: member.id });
            });
        }
    });
    let deletedSomething = false;
    Array.from(itemsToDelete.values()).forEach(item => {
        const obj = getObjectById(item.type, item.id);
        if (obj && (obj.groupId || !obj.locked)) { deleteObject(item.type, item.id); deletedSomething = true; }
        else if (obj) blockedByLock = true;
    });
    if (!deletedSomething) {
        if (blockedByLock && typeof showToast === 'function') showToast("Sélection verrouillée : déverrouille-la pour la supprimer.");
        return false;
    }
    clearSelection(); saveState(); draw();
    return true;
}

// Duplique la sélection. Les figures (segment, cercle, rectangle, polygone,
// courbe) ne portent pas leurs sommets : elles renvoient à des points. On
// recopie donc les points ET on redirige les renvois vers les copies, sinon
// déplacer la copie déplacerait aussi l'original.
const ECART_COPIE = 24;

function duplicateSelection() {
    if (typeof selectedItems === 'undefined' || !selectedItems.length) return false;

    // 1. Ce qu'on copie : la sélection, plus les groupes entiers
    const aCopier = new Map();
    let bloqueParVerrou = false;
    selectedItems.forEach(item => {
        const obj = getObjectById(item.type, item.id);
        if (!obj) return;
        if (obj.locked && !obj.groupId) { bloqueParVerrou = true; return; }
        aCopier.set(item.type + '-' + item.id, { type: item.type, id: item.id });
        if (obj.groupId) {
            getGroupMembers(obj.groupId).forEach(m => aCopier.set(m.type + '-' + m.id, { type: m.type, id: m.id }));
        }
    });
    if (!aCopier.size) {
        if (bloqueParVerrou && typeof showToast === 'function') showToast("Sélection verrouillée : déverrouille-la pour la dupliquer.");
        return false;
    }

    // 2. Les points dont dépendent les figures copiées suivent le mouvement
    const pointsUtiles = new Set();
    aCopier.forEach(item => {
        const obj = getObjectById(item.type, item.id);
        if (!obj) return;
        if (item.type === 'segment' || item.type === 'rectangle') { pointsUtiles.add(obj.p1_id); pointsUtiles.add(obj.p2_id); }
        if (item.type === 'circle') { pointsUtiles.add(obj.center_id); pointsUtiles.add(obj.edge_id); }
        if ((item.type === 'polygon' || item.type === 'curve') && Array.isArray(obj.points)) obj.points.forEach(id => pointsUtiles.add(id));
    });

    const tableau = { point: points, segment: segments, circle: circles, rectangle: rectangles,
                      text: texts, freehand: freehands, curve: curves, polygon: polygons,
                      image: images, arc: arcs };

    const nouveauxIds = new Map();       // ancien id de point -> nouvel id
    const nouveauxGroupes = new Map();   // ancien groupe -> nouveau groupe
    const copies = [];

    const copierPoint = (id) => {
        if (nouveauxIds.has(id)) return nouveauxIds.get(id);
        const p = getObjectById('point', id);
        if (!p) return null;
        const c = { ...p, id: nextId++, x: p.x + ECART_COPIE, y: p.y + ECART_COPIE, z: globalZ++ };
        delete c.groupId;
        points.push(c);
        nouveauxIds.set(id, c.id);
        return c.id;
    };

    pointsUtiles.forEach(id => { if (id !== undefined && id !== null) copierPoint(id); });

    // 3. Les objets eux-mêmes
    Array.from(aCopier.values()).forEach(item => {
        const obj = getObjectById(item.type, item.id);
        if (!obj || !tableau[item.type]) return;
        // Un point déjà recopié parce qu'une figure en dépend n'est pas dupliqué deux fois
        if (item.type === 'point' && nouveauxIds.has(obj.id)) {
            copies.push({ type: 'point', id: nouveauxIds.get(obj.id) });
            return;
        }

        const c = JSON.parse(JSON.stringify(obj));
        c.id = nextId++;
        c.z = globalZ++;
        delete c.locked;
        delete c._cachedW; delete c._cachedH; delete c._cachedStartX;

        if (obj.groupId) {
            if (!nouveauxGroupes.has(obj.groupId)) nouveauxGroupes.set(obj.groupId, 'g' + nextId++);
            c.groupId = nouveauxGroupes.get(obj.groupId);
        }

        switch (item.type) {
            case 'point':
                c.x += ECART_COPIE; c.y += ECART_COPIE;
                nouveauxIds.set(obj.id, c.id);
                break;
            case 'segment': case 'rectangle':
                c.p1_id = copierPoint(obj.p1_id); c.p2_id = copierPoint(obj.p2_id);
                break;
            case 'circle':
                c.center_id = copierPoint(obj.center_id); c.edge_id = copierPoint(obj.edge_id);
                break;
            case 'polygon': case 'curve':
                c.points = (obj.points || []).map(id => copierPoint(id)).filter(id => id !== null);
                break;
            case 'freehand':
                c.points = (obj.points || []).map(pt => ({ ...pt, x: pt.x + ECART_COPIE, y: pt.y + ECART_COPIE }));
                break;
            case 'text': case 'image':
                c.x += ECART_COPIE; c.y += ECART_COPIE;
                if (c.tailX !== undefined) { c.tailX += ECART_COPIE; c.tailY += ECART_COPIE; }
                if (item.type === 'text') { c.mathImg = obj.mathImg; }   // l'image de formule se partage
                break;
            case 'arc':
                c.cx += ECART_COPIE; c.cy += ECART_COPIE;
                break;
        }

        tableau[item.type].push(c);
        copies.push({ type: item.type, id: c.id });
    });

    if (!copies.length) return false;

    // 4. La copie devient la sélection : on peut la déplacer aussitôt
    selectedItems = copies.filter(c => c.type !== 'point' || copies.length === 1);
    if (!selectedItems.length) selectedItems = copies;
    saveState(); draw();
    if (typeof showToast === 'function') showToast(copies.length > 1 ? "Copie posée" : "Copie posée (glisse-la)");
    return true;
}

// Un menu ou une fenêtre ouverte prime sur le petit menu contextuel d'objet :
// celui-ci n'a pas à flotter par-dessus ce que l'enseignant vient d'ouvrir.
function unMenuEstOuvert() {
    if (document.querySelector('.popup-content.show')) return true;
    if (document.querySelector('#export-popover.visible, #color-popover.visible')) return true;
    const boites = document.querySelectorAll('#custom-prompt-modal, #confirm-modal, .live-modal-backdrop, [id$="-backdrop"]');
    for (const el of boites) {
        if (el.isConnected && getComputedStyle(el).display !== 'none') return true;
    }
    return false;
}

function updateQuickMenu() {
    const quickMenu = document.getElementById('quick-edit-menu');
    if (!quickMenu) return;
    // Un document PDF a sa propre barre : deux barres autour du même objet
    // se marcheraient dessus.
    if (typeof majBarreDocument === 'function') majBarreDocument();
    if (typeof documentSelectionne === 'function' && documentSelectionne()) {
        quickMenu.classList.remove('visible');
        return;
    }
    if (unMenuEstOuvert()) { quickMenu.classList.remove('visible'); return; }
    // En pleine saisie, la barre d'édition suffit : le menu rapide se poserait
    // en travers du texte voisin.
    if (editingTextId) { quickMenu.classList.remove('visible'); return; }
    if (typeof unMasqueEstOuvert === 'function' && unMasqueEstOuvert()) { quickMenu.classList.remove('visible'); return; }

    // 1. Injection des pastilles de couleur
    if (!document.getElementById('quick-colors-container')) {
        const colorContainer = document.createElement('div');
        colorContainer.id = 'quick-colors-container';
        colorContainer.style.display = 'flex';
        colorContainer.style.gap = '8px';
        colorContainer.style.paddingRight = '12px';
        colorContainer.style.borderRight = '1px solid #dfe6e9';
        colorContainer.style.marginRight = '8px';
        colorContainer.style.alignItems = 'center';

        const colors = ['#2d3436', '#0984e3', '#d63031', '#00b894', '#e17055', '#6c5ce7'];

        colors.forEach(c => {
            const dot = document.createElement('div');
            dot.dataset.color = c;
            dot.style.width = '24px'; dot.style.height = '24px'; dot.style.borderRadius = '50%';
            dot.style.background = c; dot.style.cursor = 'pointer'; dot.style.flexShrink = '0';
            dot.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';

            dot.onpointerdown = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (!selectedItems.length) return;
                let touched = false;
                selectedItems.forEach(item => {
                    const obj = getObjectById(item.type, item.id);
                    if (!obj) return;
                    if (item.type === 'image') {
                        if (typeof recolorPluginImage === 'function' && recolorPluginImage(obj, c)) touched = true;
                        return;
                    }
                    if (obj.strokeColor !== undefined) obj.strokeColor = c;
                    if (obj.color !== undefined) obj.color = c;
                    if (obj.fillColor && obj.isFilled) obj.fillColor = c;
                    touched = true;
                });
                if (!touched) return;
                activeStyle.strokeColor = c;
                if (typeof updateColorIndicator === 'function') updateColorIndicator();
                saveState(); draw(); updateQuickMenu();
            };
            colorContainer.appendChild(dot);
        });
        quickMenu.insertBefore(colorContainer, quickMenu.firstChild);
    }

    // 2. Affichage et positionnement du menu
    if (typeof selectedItems !== 'undefined' && selectedItems.length >= 1) {
        const isMulti = selectedItems.length > 1;
        const type = isMulti ? null : selectedItems[0].type;
        const obj = isMulti ? null : getObjectById(type, selectedItems[0].id);
        const bounds = getSelectionLogicalBounds();

        if (bounds && (isMulti || obj)) {
            const bx = bounds.bx, by = bounds.by, bw = bounds.bw, bh = bounds.bh;

            let screenX = (bx + bw / 2) * zoom + panX;
            let screenY = (by + bh) * zoom + panY + 20;

            quickMenu.classList.add('visible');
            // Maintient le menu dans l'écran (indispensable sur tablette)
            const mw = quickMenu.offsetWidth || 220, mh = quickMenu.offsetHeight || 40;
            const pad = 8;
            screenX = Math.max(mw / 2 + pad, Math.min(window.innerWidth - mw / 2 - pad, screenX));
            if (screenY + mh > window.innerHeight - pad) {
                const above = by * zoom + panY - mh - 20;
                screenY = above > pad ? above : Math.max(pad, window.innerHeight - mh - pad);
            }
            screenY = Math.max(pad, screenY);
            quickMenu.style.left = screenX + 'px';
            quickMenu.style.top = screenY + 'px';

            // 3. GESTION DU CADENAS (Affichage + Action)
            const btnLock = document.getElementById('btn-quick-lock');
            const iconLock = document.getElementById('icon-quick-lock');
            if (btnLock && iconLock) {
                const allLocked = selectedItems.every(it => { const o = getObjectById(it.type, it.id); return o && o.locked; });
                if (allLocked) {
                    btnLock.classList.add('active');
                    iconLock.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;
                } else {
                    btnLock.classList.remove('active');
                    iconLock.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
                }

                // ACTION FORCÉE AU TOUCHER/CLIC
                btnLock.onpointerdown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    selectedItems.forEach(it => { const o = getObjectById(it.type, it.id); if (o) o.locked = !allLocked; });
                    updateQuickMenu(); draw(); saveState();
                };
            }

            // 4. GESTION DE LA CHAÎNE ET ROGNAGE (Affichage + Action)
            const btnRatio = document.getElementById('btn-quick-ratio');
            const btnCrop = document.getElementById('btn-quick-crop');

            if (type === 'image') {
                // --- BOUTON PROPORTIONS (Chaîne) ---
                if (btnRatio) {
                    btnRatio.style.display = 'flex';
                    const isRatioActive = (obj.ratioLocked !== false);

                    if (isRatioActive) {
                        btnRatio.classList.add('active');
                        btnRatio.style.color = '#0984e3'; btnRatio.style.background = '#eff7fd';
                    } else {
                        btnRatio.classList.remove('active');
                        btnRatio.style.color = '#636e72'; btnRatio.style.background = 'transparent';
                    }

                    // ACTION FORCÉE
                    btnRatio.onpointerdown = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        obj.ratioLocked = (obj.ratioLocked === false) ? true : false;
                        updateQuickMenu(); saveState(); draw();
                    };
                }

                // --- BOUTON ROGNAGE (Ciseau/Crop) ---
                if (btnCrop) {
                    btnCrop.style.display = 'flex';
                    const isCropActive = !!obj.isCropping;

                    if (isCropActive) {
                        btnCrop.classList.add('active');
                        btnCrop.style.color = '#e17055'; btnCrop.style.background = '#fdf0ef';
                    } else {
                        btnCrop.classList.remove('active');
                        btnCrop.style.color = '#636e72'; btnCrop.style.background = 'transparent';
                    }

                    // ACTION FORCÉE
                    btnCrop.onpointerdown = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        obj.isCropping = !isCropActive; // Inverse l'état
                        if (obj.isCropping) obj.ratioLocked = false; // Désactive le ratio si on rogne
                        updateQuickMenu(); draw(); saveState();
                    };
                }
            } else {
                if (btnRatio) btnRatio.style.display = 'none';
                if (btnCrop) btnCrop.style.display = 'none';
            }

            const btnDup = document.getElementById('btn-quick-duplicate');
            if (btnDup) {
                btnDup.onpointerdown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    duplicateSelection();
                };
            }

            const btnDelete = document.getElementById('btn-quick-delete');
            if (btnDelete) {
                btnDelete.onpointerdown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    deleteSelection();
                };
            }

            // 6. GESTION DE LA VISIBILITÉ DES COULEURS
            const colorContainer = document.getElementById('quick-colors-container');
            if (colorContainer) {
                // Une image simple n'est recolorable que si c'est un tampon de plugin qui l'accepte
                const colorable = selectedItems.some(it => {
                    if (it.type === 'text') return false;   // la couleur d'un texte se règle en édition
                    if (it.type !== 'image') return true;
                    const o = getObjectById('image', it.id);
                    return o && typeof isRecolorablePluginImage === 'function' && isRecolorablePluginImage(o);
                });
                if (!colorable) {
                    colorContainer.style.display = 'none'; // Cache les couleurs pour les images/tampons non colorables
                } else {
                    colorContainer.style.display = 'flex';
                    const refObj = obj || getObjectById(selectedItems[0].type, selectedItems[0].id) || {};
                    let curColor = (refObj.pluginData && typeof getPluginStampColor === 'function' ? getPluginStampColor(refObj) : null)
                        || refObj.color || refObj.strokeColor || '#2d3436';

                    document.querySelectorAll('#quick-colors-container div').forEach(d => {
                        const c = d.dataset.color;
                        if (curColor && curColor.toLowerCase().includes(c.toLowerCase())) {
                            d.style.boxShadow = `0 0 0 2px #ffffff, 0 0 0 4px ${c}`;
                            d.style.transform = 'scale(1.15)';
                        } else {
                            d.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
                            d.style.transform = 'scale(1)';
                        }
                    });
                }
            }
            return;
        }
    }
    quickMenu.classList.remove('visible');
}

// On s'assure d'écraser proprement la fonction draw une seule fois
if (!window.hasInjectedQuickMenu) {
    const originalDraw = draw;
    draw = function () {
        originalDraw();
        updateQuickMenu();
    };
    window.hasInjectedQuickMenu = true;
}



// Cacher le menu si on clique vraiment dans le vide sur le canvas
canvas.addEventListener('pointerdown', (e) => {
    const rawPos = getRawLogicalPos(e);
    const clickedObj = findObjectAt(rawPos.x, rawPos.y);
    if (!clickedObj && mode === 'pointer') {
        const quickMenu = document.getElementById('quick-edit-menu');
        if (quickMenu) quickMenu.classList.remove('visible');
    }
});


// ==========================================
// MOTEUR D'ENREGISTREMENT VIDÉO (DOUBLE MODE)
// ==========================================



// --- 1. MODE ÉLÈVE : Enregistrement du dessin uniquement (Depuis le menu) ---
const btnRecordCanvas = document.getElementById('btn-record-canvas');
if (btnRecordCanvas) {
    btnRecordCanvas.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (isRecording) {
            // Arrêt
            mediaRecorder.stop();
            isRecording = false;
            btnRecordCanvas.innerHTML = btnRecordCanvas.dataset.originalHtml;
            btnRecordCanvas.style.color = '';
            showToast("Enregistrement terminé, téléchargement en cours...");
            return;
        }

        // Démarrage
        recordedChunks = [];
        try {
            if (typeof closeAllPopups === 'function') closeAllPopups(); // Ferme le menu Exporter
            const stream = canvas.captureStream(30);

            const options = { mimeType: 'video/webm; codecs=vp9' };
            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordedChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'Mon_Dessin.webm';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
            };

            mediaRecorder.start();
            isRecording = true;
            showToast("🔴 Enregistrement du dessin en cours...");

            // Changement visuel du bouton
            btnRecordCanvas.dataset.originalHtml = btnRecordCanvas.innerHTML;
            btnRecordCanvas.innerHTML = `<span class="icon">⏹️</span> Arrêter l'enregistrement`;
            btnRecordCanvas.style.color = '#d63031';
        } catch (err) {
            console.error("Erreur capture Canvas: ", err);
            showToast("Erreur lors de l'enregistrement.");
        }
    });
}

// --- 2. MODE ADMIN : Enregistrement Interface + Plein Écran (Bouton Flottant) ---
const btnFloatingRecord = document.getElementById('btn-floating-record');
if (btnFloatingRecord) {
    btnFloatingRecord.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (isRecording) {
            // Arrêt
            mediaRecorder.stop();
            isRecording = false;
            btnFloatingRecord.innerHTML = `<span class="icon">🎬</span> REC Tutoriel`;
            btnFloatingRecord.style.background = '#0984e3'; // Retour au bleu

            // Quitte le plein écran automatiquement
            if (document.fullscreenElement) {
                await document.exitFullscreen().catch(err => console.log(err));
            }
            showToast("Enregistrement terminé, téléchargement en cours...");

        } else {
            // Démarrage
            try {
                // 1. Passage en plein écran IMMÉDIAT
                await document.documentElement.requestFullscreen().catch(err => console.log("Plein écran refusé: ", err));

                // 2. Demande de partage d'écran (le navigateur ouvre la popup ici)
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

                // 3. Changement visuel du bouton flottant
                btnFloatingRecord.innerHTML = `<span class="icon">⏹️</span> STOP Tutoriel`;
                btnFloatingRecord.style.background = '#d63031'; // Passe en rouge

                // 4. Configuration et lancement
                recordedChunks = [];
                const options = { mimeType: 'video/webm; codecs=vp9' };
                mediaRecorder = new MediaRecorder(stream, options);

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) recordedChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = 'Tutoriel_Interface.webm';
                    document.body.appendChild(a);
                    a.click();
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);

                    // Coupe le flux de capture
                    stream.getTracks().forEach(track => track.stop());

                    // Sécurité : si on arrête via le bouton natif "Arrêter le partage" du navigateur
                    if (isRecording) {
                        isRecording = false;
                        btnFloatingRecord.innerHTML = `<span class="icon">🎬</span> REC Tutoriel`;
                        btnFloatingRecord.style.background = '#0984e3';
                        if (document.fullscreenElement) document.exitFullscreen().catch(e => e);
                    }
                };

                mediaRecorder.start();
                isRecording = true;
                showToast("🔴 Enregistrement de l'interface en cours...");

            } catch (err) {
                console.error("Erreur d'enregistrement: ", err);
                showToast("Enregistrement annulé.");
                if (document.fullscreenElement) document.exitFullscreen().catch(e => e);
            }
        }
    });
}

// ==============================================================================
// SYSTÈME DE FAVORIS (DRAG & DROP, DÉPLAÇABLE, LOCALSTORAGE) - VERSION ROBUSTE
// ==============================================================================

function initFavoritesDock() {
    const favBar = document.getElementById('favorites-toolbar');
    const favList = document.getElementById('favorites-list');
    const pluginGrid = document.getElementById('plugins-grid');
    if (!favBar || !favList || !pluginGrid) return;

    if (!window.__pluginDrawerDragBound) {
        window.__pluginDrawerDragBound = true;

        const bindPluginSourceButtons = () => {
            pluginGrid.querySelectorAll('.btn').forEach(btn => {
                const toolId = btn.getAttribute('data-tooltip') || btn.title;
                const normalizedId = normalizePluginId(toolId);
                if (normalizedId && !btn.dataset.pluginKey) {
                    btn.dataset.pluginKey = normalizedId;
                }
                bindPluginDragGhost(btn, toolId);
            });
        };

        bindPluginSourceButtons();
        setTimeout(bindPluginSourceButtons, 1000);
    }

    bindDrawerFavoriteStars();
    initSystemToolbarDragBridge();
    renderFavorites();
    if (typeof renderFloatingToolbars === 'function') renderFloatingToolbars();
    ensureFavoritesTab();
}

function addFavorite(toolId) {
    let favs = JSON.parse(localStorage.getItem('board_favorites') || '[]');
    if (!favs.includes(toolId)) {
        favs.push(toolId);
        localStorage.setItem('board_favorites', JSON.stringify(favs));
        if (typeof showToast === 'function') showToast("⭐ Ajouté aux favoris !");
    }
    renderFavorites();
}

function removeFavorite(toolId) {
    let favs = JSON.parse(localStorage.getItem('board_favorites') || '[]');
    favs = favs.filter(id => id !== toolId);
    localStorage.setItem('board_favorites', JSON.stringify(favs));
    if (typeof showToast === 'function') showToast("🧹 Retiré des favoris.");
    renderFavorites();
}

function renderFavorites() {
    const favList = document.getElementById('favorites-list');
    if (!favList) return;

    favList.innerHTML = '';
    favList.style.display = 'none';
}

function normalizePluginId(toolId) {
    return (toolId || '').trim().replace(/^system:/, '');
}

function getPluginSourceButton(toolId) {
    const normalized = normalizePluginId(toolId);
    if (!normalized) return null;
    return Array.from(document.querySelectorAll('.btn[data-plugin-key], #plugins-grid .btn, #bar-tools .btn, #bar-style .btn')).find(btn => {
        const candidate = normalizePluginId(btn.dataset.pluginKey || btn.dataset.pluginId || btn.dataset.mode || btn.dataset.widget || btn.id || btn.getAttribute('data-tooltip') || btn.title);
        return candidate === normalized;
    }) || null;
}

function clonePluginButton(sourceBtn, toolId) {
    if (!sourceBtn) return null;

    const clone = sourceBtn.cloneNode(true);
    clone.classList.add('plugin-toolbar-btn');
    delete clone.dataset.dragGhostBound;
    delete clone.dataset.favoriteContextBound;
    const originalTitle = sourceBtn.getAttribute('title') || sourceBtn.getAttribute('data-tooltip') || toolId;
    clone.removeAttribute('title');
    clone.removeAttribute('draggable');
    clone.style.display = 'flex'; // Fix: Always make the cloned button visible
    clone.querySelectorAll('.fav-star, .fav-star-icon').forEach(star => star.remove());
    clone.setAttribute('data-tooltip', originalTitle);
    clone.addEventListener('click', () => sourceBtn.click());
    // Les réglages cachés derrière un appui long suivent la copie
    if (sourceBtn.actionAppuiLong && typeof poserAppuiLong === 'function') {
        delete clone.dataset.appuiLong;
        poserAppuiLong(clone, () => sourceBtn.actionAppuiLong(clone));
    }
    bindPluginDragGhost(clone, toolId);
    return clone;
}

function updateFloatingToolbarButtonSize(bar, toolbarData = {}) {
    const scale = parseFloat(bar.dataset.iconSize || '1');
    const btnSize = FLOAT_TOOLBAR_BTN_SIZE * scale;
    const pool = bar.querySelector('.cwrap');
    if (!pool) return;

    const cols = toolbarData.cols || Math.max(2, Math.ceil(pool.children.length / 2));
    bar.style.setProperty('--toolbar-btn-size', `${btnSize}px`);
    bar.style.setProperty('--toolbar-cols', String(cols));
    pool.style.gridTemplateColumns = `repeat(${cols}, ${btnSize}px)`;

}

function ensureFloatingDock() {
    let dock = document.getElementById('dock');
    if (!dock) {
        dock = document.createElement('div');
        dock.id = 'dock';

        const handle = document.createElement('div');
        handle.className = 'dock-drag-handle';
        handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>';
        handle.style.cursor = 'grab';
        handle.style.display = 'flex';
        handle.style.alignItems = 'center';
        handle.style.justifyContent = 'center';
        handle.style.color = '#b2bec3';
        handle.style.padding = '0 4px';

        let isDraggingDock = false, startX, startY;
        handle.addEventListener('pointerdown', (e) => {
            isDraggingDock = true;
            const rect = dock.getBoundingClientRect();
            dock.style.left = rect.left + 'px';
            dock.style.top = rect.top + 'px';
            dock.style.bottom = 'auto';
            dock.style.right = 'auto';
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
            handle.setPointerCapture(e.pointerId);
            handle.style.cursor = 'grabbing';
            e.preventDefault();
        });
        handle.addEventListener('pointermove', (e) => {
            if (isDraggingDock) {
                dock.style.left = (e.clientX - startX) + 'px';
                dock.style.top = (e.clientY - startY) + 'px';
            }
        });
        handle.addEventListener('pointerup', (e) => {
            isDraggingDock = false;
            handle.releasePointerCapture(e.pointerId);
            handle.style.cursor = 'grab';
        });

        dock.appendChild(handle);
        document.body.appendChild(dock);
    }
    return dock;
}

function updateFloatingDockPositions() {
    // La flexbox du #dock gère déjà l'espacement et le placement via `gap: 8px` et `display: flex`.
    // Plus besoin de forcer les positions manuelles qui cassent l'alignement.
    const dock = ensureFloatingDock();
    // On garde la fonction au cas où d'autres parties du code l'appellent,
    // mais on la vide des forçages css 'left' et 'top'.
}

// Le dock d'en bas à gauche accueille tout ce qui est réduit. Il ne servait
// qu'aux palettes ; une fenêtre quelconque (l'explorateur de fichiers) peut
// désormais s'y ranger aussi, plutôt que de rester en bandeau sur le tableau.
function rangerDansLeDock(cle, titre, icone, auClic) {
    const dock = ensureFloatingDock();
    let item = dock.querySelector('.dock-item[data-fenetre="' + cle + '"]');
    if (!item) {
        item = document.createElement('div');
        item.className = 'dock-item';
        item.dataset.fenetre = cle;
        item.addEventListener('click', () => { retirerDuDock(cle); if (auClic) auClic(); });
        dock.appendChild(item);
    }
    item.title = titre || 'Rouvrir';
    item.innerHTML = '<span style="font-size:22px; line-height:1;">' + (icone || '🗂️') + '</span>';
    dock.style.display = 'flex';
    return item;
}

function retirerDuDock(cle) {
    const item = document.querySelector('#dock .dock-item[data-fenetre="' + cle + '"]');
    if (item) item.remove();
}
window.rangerDansLeDock = rangerDansLeDock;
window.retirerDuDock = retirerDuDock;

function dockFloatingToolbar(bar) {
    const dock = ensureFloatingDock();
    let item = dock.querySelector(`.dock-item[data-target-id='${bar.id}']`);
    if (!item) {
        item = document.createElement('div');
        item.className = 'dock-item';
        item.dataset.targetId = bar.id;
        item.title = 'Ouvrir palette';
        item.addEventListener('click', () => restoreFloatingToolbar(bar.id));
        dock.appendChild(item);
    }

    const tbData = getStoredFloatingToolbars().find(t => t.id === bar.id);
    const iconIndex = tbData ? (tbData.iconIndex || 0) : 0;

    if (iconIndex === 0 && tbData && tbData.items.length > 0) {
        // Option 0: Aperçu grille (4 icônes)
        const top4 = tbData.items.slice(0, 4);
        const gridHTML = top4.map(toolId => {
            const sourceBtn = getPluginSourceButton(toolId);
            let svgHtml = '';
            if (sourceBtn) {
                const svg = sourceBtn.querySelector('svg');
                if (svg) svgHtml = svg.outerHTML.replace('<svg', '<svg style="width:10px; height:10px; stroke-width: 1.5;"');
            }
            return `<div style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.05);border-radius:2px;overflow:hidden;width:100%;height:100%;">${svgHtml}</div>`;
        }).join('');
        item.innerHTML = `<div class="custom-icon-preview" style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 2px; width: 28px; height: 28px; pointer-events: none;">${gridHTML}</div>`;
    } else {
        // Autres icônes classiques
        const ICONS = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10V2z" fill="currentColor" fill-opacity="0.3"></path></svg>'
        ];
        const svg = ICONS[iconIndex] || ICONS[0];
        item.innerHTML = `<div class="custom-icon-preview" style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; pointer-events:none;">${svg}</div>`;
    }
    updateFloatingDockPositions();
}

function restoreFloatingToolbar(barId) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.classList.remove('minimized');
    bar.style.display = 'flex';
    const dock = document.getElementById('dock');
    const item = dock?.querySelector(`.dock-item[data-target-id='${barId}']`);
    if (item) item.remove();
    updateFloatingDockPositions();
    persistFloatingToolbar(bar);
}

function minimizeFloatingToolbar(bar) {
    if (!bar) return;
    bar.classList.add('minimized');
    bar.style.display = 'none';
    dockFloatingToolbar(bar);
    persistFloatingToolbar(bar);
}

function getStoredFloatingToolbars() {
    return JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]');
}

// Charger une interface écrit les barres puis laisse le temps de lire le
// message avant de redémarrer. Pendant cette seconde et demie, la session en
// cours continuait de vivre : le moindre rangement de barres réécrivait
// par-dessus, et l'on redémarrait avec l'ancienne panoplie — celle qu'on
// venait justement de remplacer. On ferme donc le robinet.
let interfaceEnChargement = false;

function saveStoredFloatingToolbars(toolbars) {
    if (interfaceEnChargement) return;
    localStorage.setItem('board_floating_toolbars', JSON.stringify(toolbars));
}

function createFloatingToolbar(x, y, toolIds = []) {
    const toolbars = getStoredFloatingToolbars();
    const normalizedItems = toolIds.map(normalizePluginId).filter(Boolean);
    if (normalizedItems.length === 0) return;

    toolbars.push({
        id: `floating-${Date.now()}`,
        name: '',
        x: Math.max(8, Math.round(x - 20)),
        y: Math.max(8, Math.round(y - 20)),
        titlePalette: 'default',
        palette: 'default',
        borderPalette: 'default',
        iconSize: '1',
        items: normalizedItems
    });

    saveStoredFloatingToolbars(toolbars);
    renderFloatingToolbars();
}

function insertPluginIntoFloatingToolbar(toolbarId, toolId, insertIndex = null, fromToolbarId = null) {
    const normalizedId = normalizePluginId(toolId);
    if (!normalizedId) return;

    const toolbars = getStoredFloatingToolbars();
    const toolbar = toolbars.find(entry => entry.id === toolbarId);
    if (!toolbar) return;

    if (fromToolbarId) {
        const source = toolbars.find(entry => entry.id === fromToolbarId);
        if (source) {
            const sourceIndex = source.items.findIndex(item => item === normalizedId);
            if (sourceIndex !== -1) {
                source.items.splice(sourceIndex, 1);
                if (source.id === toolbar.id && typeof insertIndex === 'number' && sourceIndex < insertIndex) {
                    insertIndex -= 1;
                }
            }
        }
    } else if (toolbar.items.includes(normalizedId)) {
        return;
    }

    const boundedIndex = typeof insertIndex === 'number'
        ? Math.max(0, Math.min(insertIndex, toolbar.items.length))
        : toolbar.items.length;

    toolbar.items.splice(boundedIndex, 0, normalizedId);
    saveStoredFloatingToolbars(toolbars.filter(entry => entry.items.length > 0));
    renderFloatingToolbars();
}

function addPluginToFloatingToolbar(toolbarId, toolId) {
    insertPluginIntoFloatingToolbar(toolbarId, toolId, null, null);
}

function removePluginFromFloatingToolbar(toolbarId, toolId) {
    const normalizedId = normalizePluginId(toolId);
    const toolbars = getStoredFloatingToolbars();
    const toolbar = toolbars.find(entry => entry.id === toolbarId);
    if (!toolbar) return;

    const index = toolbar.items.findIndex(item => item === normalizedId);
    if (index === -1) return;
    toolbar.items.splice(index, 1);
    saveStoredFloatingToolbars(toolbars.filter(entry => entry.items.length > 0));
    renderFloatingToolbars();
}

function renderFloatingToolbar(toolbar) {
    const container = document.getElementById('custom-bars-container');
    if (!container) return;

    const bar = document.createElement('div');
    bar.className = 'custom-toolbar';
    bar.id = toolbar.id;
    bar.dataset.toolbarId = toolbar.id;
    bar.dataset.palette = toolbar.palette || 'default';
    bar.dataset.titlePalette = toolbar.titlePalette || 'default';
    bar.dataset.borderPalette = toolbar.borderPalette || 'default';
    bar.dataset.iconSize = toolbar.iconSize || '1';
    bar.style.left = `${toolbar.x || 24}px`;
    bar.style.top = `${toolbar.y || 24}px`;
    applyFloatingToolbarStyle(bar);

    const head = document.createElement('div');
    head.className = 'cbar-head';
    head.setAttribute('data-title', 'Déplacer');

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'c-action settings';
    settingsBtn.title = 'Paramètres';
    settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M9.64 6.16L9.77 2.35L14.23 2.35L14.36 6.16A6.3 6.3 0 0 1 15.88 7.04L19.24 5.25L21.47 9.11L18.24 11.12A6.3 6.3 0 0 1 18.24 12.88L21.47 14.89L19.24 18.75L15.88 16.96A6.3 6.3 0 0 1 14.36 17.84L14.23 21.65L9.77 21.65L9.64 17.84A6.3 6.3 0 0 1 8.12 16.96L4.76 18.75L2.53 14.89L5.76 12.88A6.3 6.3 0 0 1 5.76 11.12L2.53 9.11L4.76 5.25L8.12 7.04A6.3 6.3 0 0 1 9.64 6.16Z"></path></svg>';

    const minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.className = 'c-action min';
    minBtn.title = 'Minimiser';
    minBtn.textContent = '–';
    minBtn.addEventListener('click', () => minimizeFloatingToolbar(bar));

    const menu = document.createElement('div');
    menu.className = 'toolbar-menu';
    menu.innerHTML = `
        <div class="menu-drag-handle" title="Déplacer le panneau">Paramètres</div>
        <div class="toolbar-section">
            <div class="toolbar-label">Fond</div>
            <div class="chip-row">
                <button type="button" class="color-chip bg-default" style="background: var(--surface);" data-bg="default"></button>
                <button type="button" class="color-chip bg-blue" style="background: #bbd4ff;" data-bg="blue"></button>
                <button type="button" class="color-chip bg-green" style="background: #b8f0c2;" data-bg="green"></button>
                <button type="button" class="color-chip bg-purple" style="background: #d8c3ff;" data-bg="purple"></button>
                <button type="button" class="color-chip bg-amber" style="background: #ffe38d;" data-bg="amber"></button>
                <button type="button" class="color-chip bg-pink" style="background: #ffcaea;" data-bg="pink"></button>
                <button type="button" class="color-chip bg-slate" style="background: #d9e4f4;" data-bg="slate"></button>
                <button type="button" class="color-chip bg-teal" style="background: #9ee8e5;" data-bg="teal"></button>
            </div>
        </div>
        <div class="toolbar-section">
            <div class="toolbar-label">Titre</div>
            <div class="chip-row">
                <button type="button" class="color-chip title-default" style="background: #f8f8fa;" data-title="default"></button>
                <button type="button" class="color-chip title-blue" style="background: #b6d6ff;" data-title="blue"></button>
                <button type="button" class="color-chip title-green" style="background: #b6f2d0;" data-title="green"></button>
                <button type="button" class="color-chip title-purple" style="background: #d5c2ff;" data-title="purple"></button>
                <button type="button" class="color-chip title-amber" style="background: #ffe28a;" data-title="amber"></button>
                <button type="button" class="color-chip title-pink" style="background: #ffb8dc;" data-title="pink"></button>
                <button type="button" class="color-chip title-slate" style="background: #d0e2f4;" data-title="slate"></button>
                <button type="button" class="color-chip title-teal" style="background: #afeae8;" data-title="teal"></button>
            </div>
        </div>
        <div class="toolbar-section">
            <div class="toolbar-label">Bordure</div>
            <div class="chip-row">
                <button type="button" class="color-chip border-default" style="background: #dfe6e9;" data-border="default"></button>
                <button type="button" class="color-chip border-blue" style="background: #3f6ee6;" data-border="blue"></button>
                <button type="button" class="color-chip border-green" style="background: #37ab73;" data-border="green"></button>
                <button type="button" class="color-chip border-purple" style="background: #6a53e2;" data-border="purple"></button>
                <button type="button" class="color-chip border-amber" style="background: #d38522;" data-border="amber"></button>
                <button type="button" class="color-chip border-pink" style="background: #c1467f;" data-border="pink"></button>
                <button type="button" class="color-chip border-slate" style="background: #5a768f;" data-border="slate"></button>
                <button type="button" class="color-chip border-teal" style="background: #10ac84;" data-border="teal"></button>
            </div>
        </div>
        <div class="toolbar-section">
            <div class="toolbar-label" style="display:flex; justify-content:space-between; width:100%;">
                <span>Taille</span>
                <span class="slider-value" style="font-weight:normal; opacity:0.8;">100%</span>
            </div>
            <input type="range" class="toolbar-slider" min="0.6" max="1.5" step="0.1" value="1" data-icon-size style="width:100%;">
        </div>
    `;



    // ICÔNES DISPONIBLES POUR LA MINIMISATION
    const ICONS = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10V2z" fill="currentColor" fill-opacity="0.3"></path></svg>'
    ];
    let currentIconIndex = toolbar.iconIndex || 0;

    const footerSection = document.createElement('div');
    footerSection.className = 'toolbar-section';
    footerSection.style.display = 'flex';
    footerSection.style.alignItems = 'center';
    footerSection.style.justifyContent = 'space-between';
    footerSection.style.marginTop = '12px';
    footerSection.style.paddingTop = '12px';
    footerSection.style.borderTop = '1px solid var(--border)';

    // Icon picker
    const iconPicker = document.createElement('div');
    iconPicker.style.display = 'flex';
    iconPicker.style.alignItems = 'center';
    iconPicker.style.gap = '8px';

    iconPicker.innerHTML = `
        <span style="font-size:10px; font-weight:700; color:var(--text-muted); margin-right:4px;">ICÔNE</span>
        <button type="button" class="btn btn-left" style="width:24px;height:24px;padding:0; border:none; background:transparent;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
        <div class="icon-display" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--text-color);">${ICONS[currentIconIndex]}</div>
        <button type="button" class="btn btn-right" style="width:24px;height:24px;padding:0; border:none; background:transparent;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    `;

    const updateIcon = () => {
        iconPicker.querySelector('.icon-display').innerHTML = ICONS[currentIconIndex];
        const toolbars = getStoredFloatingToolbars();
        const t = toolbars.find(tb => tb.id === toolbar.id);
        if (t) {
            t.iconIndex = currentIconIndex;
            saveStoredFloatingToolbars(toolbars);
            const dockItem = document.querySelector(`.dock-item[data-target-id='${toolbar.id}']`);
            if (dockItem && dockItem.querySelector('.custom-icon-preview')) {
                dockItem.querySelector('.custom-icon-preview').innerHTML = ICONS[currentIconIndex];
            } else if (dockItem) {
                dockFloatingToolbar(t); // re-render dock item
            }
        }
    };

    iconPicker.querySelector('.btn-left').addEventListener('click', (e) => {
        e.stopPropagation();
        currentIconIndex = (currentIconIndex - 1 + ICONS.length) % ICONS.length;
        updateIcon();
    });
    iconPicker.querySelector('.btn-right').addEventListener('click', (e) => {
        e.stopPropagation();
        currentIconIndex = (currentIconIndex + 1) % ICONS.length;
        updateIcon();
    });

    footerSection.appendChild(iconPicker);

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.title = 'Valider';
    okBtn.style.cssText = 'width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#00b894; background:rgba(0,184,148,0.1); border:none;';
    okBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    okBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.remove('active');
    });

    const rightContainer = document.createElement('div');
    rightContainer.style.display = 'flex';
    rightContainer.style.gap = '4px';

    if (!toolbar.protected) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.title = 'Supprimer la barre';
        deleteBtn.style.cssText = 'width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#d63031; background:rgba(214,48,49,0.1); border:none;';
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const toolbars = getStoredFloatingToolbars();
            saveStoredFloatingToolbars(toolbars.filter(t => t.id !== toolbar.id));
            renderFloatingToolbars();
        });
        rightContainer.appendChild(deleteBtn);
    }

    rightContainer.appendChild(okBtn);
    footerSection.appendChild(rightContainer);

    menu.appendChild(footerSection);


    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = menu.classList.toggle('active');
        // Le panneau vit DANS la barre : sans ceci, une barre voisine passait
        // par-dessus. On fait donc monter la barre entière le temps du réglage.
        document.querySelectorAll('.custom-toolbar.reglages-ouverts')
            .forEach(b => { if (b !== bar) b.classList.remove('reglages-ouverts'); });
        bar.classList.toggle('reglages-ouverts', isActive);
        if (isActive) {
            const barRect = bar.getBoundingClientRect();
            // Check if there is enough space on the left (assume menu is ~280px wide)
            if (barRect.left < 300) {
                // Not enough space on the left, place on the right
                menu.style.left = 'calc(100% + 8px)';
                menu.style.right = 'auto';
            } else {
                // Place on the left
                menu.style.right = 'calc(100% + 8px)';
                menu.style.left = 'auto';
            }
            menu.style.top = '0px';
            menu.style.bottom = 'auto';
        }
    });

    const menuHandle = menu.querySelector('.menu-drag-handle');
    let isMenuDragging = false;
    let menuDragStartX = 0;
    let menuDragStartY = 0;
    let menuInitialLeft = 0;
    let menuInitialTop = 0;
    const moveMenu = (e) => {
        if (!isMenuDragging) return;
        menu.style.left = `${menuInitialLeft + e.clientX - menuDragStartX}px`;
        menu.style.top = `${menuInitialTop + e.clientY - menuDragStartY}px`;
    };
    const stopMenu = () => {
        if (!isMenuDragging) return;
        isMenuDragging = false;
        document.removeEventListener('pointermove', moveMenu);
        document.removeEventListener('pointerup', stopMenu);
    };
    if (menuHandle) {
        menuHandle.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (!menu.classList.contains('active')) return;
            isMenuDragging = true;
            const rect = menu.getBoundingClientRect();
            const barRect = bar.getBoundingClientRect();
            menuDragStartX = e.clientX;
            menuDragStartY = e.clientY;
            menuInitialLeft = rect.left - barRect.left;
            menuInitialTop = rect.top - barRect.top;
            menu.style.right = 'auto';
            menu.style.left = `${menuInitialLeft}px`;
            menu.style.top = `${menuInitialTop}px`;
            document.addEventListener('pointermove', moveMenu);
            document.addEventListener('pointerup', stopMenu);
        });
    }

    menu.querySelectorAll('[data-bg]').forEach(chip => {
        chip.addEventListener('click', () => {
            bar.dataset.palette = chip.dataset.bg;
            applyFloatingToolbarStyle(bar);
            persistFloatingToolbar(bar);
        });
    });
    menu.querySelectorAll('[data-title]').forEach(chip => {
        chip.addEventListener('click', () => {
            bar.dataset.titlePalette = chip.dataset.title;
            applyFloatingToolbarStyle(bar);
            persistFloatingToolbar(bar);
        });
    });
    menu.querySelectorAll('[data-border]').forEach(chip => {
        chip.addEventListener('click', () => {
            bar.dataset.borderPalette = chip.dataset.border;
            applyFloatingToolbarStyle(bar);
            persistFloatingToolbar(bar);
        });
    });
    const sizeSlider = menu.querySelector('[data-icon-size]');
    const sizeValue = menu.querySelector('.slider-value');
    sizeSlider.value = bar.dataset.iconSize || '1';
    sizeValue.textContent = `${Math.round(parseFloat(sizeSlider.value || '1') * 100)}%`;
    sizeSlider.addEventListener('input', () => {
        const value = parseFloat(sizeSlider.value || '1');
        sizeValue.textContent = `${Math.round(value * 100)}%`;
        bar.dataset.iconSize = String(value);
        applyFloatingToolbarStyle(bar);
        persistFloatingToolbar(bar);
    });

    head.appendChild(settingsBtn);
    head.appendChild(minBtn);

    const pool = document.createElement('div');
    pool.className = 'cwrap';
    pool.dataset.toolbarId = toolbar.id;

    if (toolbar.items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fav-empty-text';
        empty.textContent = 'Déposez des outils ici';
        pool.appendChild(empty);
    } else {
        toolbar.items.forEach(toolId => {
            if (toolId === 'separator-bar') {
                const sep = document.createElement('div');
                sep.style.cssText = 'width: 100%; height: 2px; background: rgba(0,0,0,0.1); margin: 4px 0; border-radius: 1px; flex-shrink: 0;';
                sep.dataset.dragSourceKind = 'floating-toolbar';
                sep.dataset.dragSourceToolbarId = toolbar.id;
                sep.dataset.dragSourceToolId = toolId;
                sep.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (typeof draggedPluginTool !== 'undefined' && draggedPluginTool) return;
                    if (!toolbar.protected) removePluginFromFloatingToolbar(toolbar.id, toolId);
                });
                pool.appendChild(sep);
                return;
            }

            const sourceBtn = getPluginSourceButton(toolId);
            if (!sourceBtn) return;
            const clone = clonePluginButton(sourceBtn, toolId);
            if (!clone) return;
            clone.dataset.dragSourceKind = 'floating-toolbar';
            clone.dataset.dragSourceToolbarId = toolbar.id;
            clone.dataset.dragSourceToolId = toolId;
            clone.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (typeof draggedPluginTool !== 'undefined' && draggedPluginTool) return;
                if (!toolbar.protected) {
                    removePluginFromFloatingToolbar(toolbar.id, toolId);
                }
            });
            pool.appendChild(clone);
        });
    }

    const resizer = document.createElement('div');
    resizer.className = 'custom-resizer';
    resizer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v6h-6"></path><path d="M21 21l-7-7"></path></svg>';

    bar.appendChild(head);
    bar.appendChild(menu);
    bar.appendChild(pool);
    bar.appendChild(resizer);
    container.appendChild(bar);

    let isDraggingBar = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const moveBar = (e) => {
        if (!isDraggingBar) return;
        let newX = Math.max(0, initialLeft + e.clientX - startX);
        let newY = Math.max(0, initialTop + e.clientY - startY);

        const snapDist = 15;
        const w = bar.offsetWidth;
        const h = bar.offsetHeight;

        const margin = 12;
        if (Math.abs(newX - margin) < snapDist) newX = margin;
        if (Math.abs(newX + w - (window.innerWidth - margin)) < snapDist) newX = window.innerWidth - w - margin;
        if (Math.abs(newY - margin) < snapDist) newY = margin;
        if (Math.abs(newY + h - (window.innerHeight - margin)) < snapDist) newY = window.innerHeight - h - margin;

        const otherBars = Array.from(document.querySelectorAll('.custom-toolbar:not([style*="display: none"])')).filter(b => b.id !== bar.id);
        for (const other of otherBars) {
            const ox = other.offsetLeft;
            const oy = other.offsetTop;
            const ow = other.offsetWidth;
            const oh = other.offsetHeight;

            if (Math.abs(newX - ox) < snapDist) newX = ox;
            if (Math.abs(newX - (ox + ow)) < snapDist) newX = ox + ow;
            if (Math.abs(newX + w - ox) < snapDist) newX = ox - w;
            if (Math.abs(newX + w - (ox + ow)) < snapDist) newX = ox + ow - w;

            if (Math.abs(newY - oy) < snapDist) newY = oy;
            if (Math.abs(newY - (oy + oh)) < snapDist) newY = oy + oh;
            if (Math.abs(newY + h - oy) < snapDist) newY = oy - h;
            if (Math.abs(newY + h - (oy + oh)) < snapDist) newY = oy + oh - h;
        }

        bar.style.left = `${newX}px`;
        bar.style.top = `${newY}px`;
    };

    const stopBar = () => {
        if (!isDraggingBar) return;
        isDraggingBar = false;
        const toolbars = getStoredFloatingToolbars();
        const current = toolbars.find(entry => entry.id === toolbar.id);
        if (current) {
            current.x = bar.offsetLeft;
            current.y = bar.offsetTop;
            saveStoredFloatingToolbars(toolbars);
        }
        document.removeEventListener('pointermove', moveBar);
        document.removeEventListener('pointerup', stopBar);
    };

    head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.c-action')) return;
        isDraggingBar = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = bar.offsetLeft;
        initialTop = bar.offsetTop;
        head.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', moveBar);
        document.addEventListener('pointerup', stopBar);
        e.preventDefault();
    });

    bar.addEventListener('click', (e) => {
        if (!e.target.closest('.c-action.settings') && !e.target.closest('.toolbar-menu')) {
            menu.classList.remove('active');
        }
    });

    let isResizing = false;
    let resizeStartX = 0;
    let resizeInitialW = 0;
    const onResizeMove = (e) => {
        if (!isResizing) return;
        const delta = e.clientX - resizeStartX;
        const nextWidth = Math.max(FLOAT_TOOLBAR_BTN_SIZE * 2 + FLOAT_TOOLBAR_PADDING, resizeInitialW + delta);
        const cols = Math.max(2, Math.round((nextWidth - FLOAT_TOOLBAR_PADDING + FLOAT_TOOLBAR_GAP) / (FLOAT_TOOLBAR_BTN_SIZE * parseFloat(bar.dataset.iconSize || '1') + FLOAT_TOOLBAR_GAP)));
        const btnSize = FLOAT_TOOLBAR_BTN_SIZE * parseFloat(bar.dataset.iconSize || '1');
        bar.dataset.cols = cols;
        bar.style.setProperty('--toolbar-cols', String(cols));
        pool.style.gridTemplateColumns = `repeat(${cols}, ${btnSize}px)`;

    };
    const stopResize = () => {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('pointermove', onResizeMove);
        document.removeEventListener('pointerup', stopResize);
        saveStoredFloatingToolbars(getStoredFloatingToolbars().map(tb => tb.id === bar.id ? {
            ...tb,
            x: bar.offsetLeft,
            y: bar.offsetTop,
            palette: bar.dataset.palette || 'default',
            titlePalette: bar.dataset.titlePalette || 'default',
            borderPalette: bar.dataset.borderPalette || 'default',
            iconSize: bar.dataset.iconSize || '1',
            cols: parseInt(bar.dataset.cols) || tb.cols
        } : tb));
    };
    resizer.addEventListener('pointerdown', (e) => {
        isResizing = true;
        resizeStartX = e.clientX;
        resizeInitialW = bar.offsetWidth;
        resizer.setPointerCapture(e.pointerId);
        document.addEventListener('pointermove', onResizeMove);
        document.addEventListener('pointerup', stopResize);
        e.preventDefault();
        e.stopPropagation();
    });

    updateFloatingToolbarButtonSize(bar, toolbar);

    if (toolbar.minimized) {
        bar.classList.add('minimized');
        bar.style.display = 'none';
        dockFloatingToolbar(bar);
    }
}

function applyFloatingToolbarStyle(bar) {
    if (!bar) return;
    const palette = bar.dataset.palette || 'default';
    const titlePalette = bar.dataset.titlePalette || 'default';
    const borderPalette = bar.dataset.borderPalette || 'default';
    const iconSize = parseFloat(bar.dataset.iconSize || '1');

    const palettes = {
        default: { bg: 'var(--surface)', title: 'rgba(248,248,250,0.92)', border: 'var(--border)', shadow: 'var(--shadow)' },
        blue: { bg: 'rgba(235, 243, 255, 0.96)', title: 'rgba(220, 230, 255, 0.95)', border: 'rgba(100, 128, 235, 0.45)', shadow: '0 8px 24px rgba(93, 132, 232, 0.14)' },
        green: { bg: 'rgba(235, 251, 239, 0.96)', title: 'rgba(220, 246, 229, 0.95)', border: 'rgba(87, 178, 110, 0.45)', shadow: '0 8px 24px rgba(94, 187, 124, 0.14)' },
        purple: { bg: 'rgba(245, 240, 255, 0.96)', title: 'rgba(234, 228, 255, 0.95)', border: 'rgba(130, 109, 229, 0.45)', shadow: '0 8px 24px rgba(131, 108, 230, 0.14)' },
        amber: { bg: 'rgba(255, 247, 220, 0.96)', title: 'rgba(255, 241, 204, 0.95)', border: 'rgba(228, 150, 37, 0.45)', shadow: '0 8px 24px rgba(221, 170, 75, 0.14)' },
        pink: { bg: 'rgba(255, 236, 244, 0.96)', title: 'rgba(255, 227, 238, 0.95)', border: 'rgba(220, 111, 146, 0.45)', shadow: '0 8px 24px rgba(226, 126, 156, 0.14)' },
        slate: { bg: 'rgba(245, 248, 251, 0.96)', title: 'rgba(239, 244, 248, 0.95)', border: 'rgba(117, 137, 161, 0.45)', shadow: '0 8px 24px rgba(124, 145, 167, 0.14)' },
        teal: { bg: 'rgba(226, 249, 248, 0.96)', title: 'rgba(213, 247, 245, 0.95)', border: 'rgba(41, 191, 179, 0.45)', shadow: '0 8px 24px rgba(82, 210, 201, 0.14)' }
    };
    const borders = {
        default: 'var(--border)',
        blue: 'rgba(63, 110, 230, 0.9)',
        green: 'rgba(55, 171, 115, 0.9)',
        purple: 'rgba(106, 83, 226, 0.9)',
        amber: 'rgba(211, 133, 34, 0.9)',
        pink: 'rgba(193, 70, 127, 0.9)',
        slate: 'rgba(90, 118, 143, 0.9)',
        teal: 'rgba(36, 156, 146, 0.9)'
    };

    const paletteStyle = palettes[palette] || palettes.default;
    const titleStyle = palettes[titlePalette] || palettes.default;
    bar.style.background = paletteStyle.bg;
    bar.style.borderColor = borders[borderPalette] || paletteStyle.border;
    bar.style.boxShadow = paletteStyle.shadow;
    bar.style.setProperty('--toolbar-icon-scale', String(iconSize || 1));

    const head = bar.querySelector('.cbar-head');
    if (head) {
        head.style.background = titleStyle.title;
        head.style.borderBottom = `1px solid ${borders[borderPalette] || paletteStyle.border}`;
    }

    const barId = bar.dataset.toolbarId;
    const toolbars = getStoredFloatingToolbars();
    const toolbar = toolbars.find(tb => tb.id === barId) || {};
    updateFloatingToolbarButtonSize(bar, toolbar);
    updateFloatingToolbarMenuSelection(bar);
}

function updateFloatingToolbarMenuSelection(bar) {
    if (!bar) return;
    const palette = bar.dataset.palette || 'default';
    const titlePalette = bar.dataset.titlePalette || 'default';
    const borderPalette = bar.dataset.borderPalette || 'default';

    bar.querySelectorAll('.toolbar-menu .color-chip').forEach(chip => {
        chip.classList.remove('selected');
        if (chip.dataset.bg === palette || chip.dataset.title === titlePalette || chip.dataset.border === borderPalette) {
            chip.classList.add('selected');
        }
    });
}

function persistFloatingToolbar(bar) {
    const toolbars = getStoredFloatingToolbars();
    const entry = toolbars.find(tb => tb.id === bar.id);
    if (!entry) return;
    entry.titlePalette = bar.dataset.titlePalette || 'default';
    entry.palette = bar.dataset.palette || 'default';
    entry.borderPalette = bar.dataset.borderPalette || 'default';
    entry.iconSize = bar.dataset.iconSize || '1';
    entry.minimized = bar.classList.contains('minimized');
    entry.cols = parseInt(bar.dataset.cols) || entry.cols;
    saveStoredFloatingToolbars(toolbars);
}

function renderFloatingToolbars() {
    const container = document.getElementById('custom-bars-container');
    if (!container) return;

    let toolbars = getStoredFloatingToolbars();
    const hasMain = toolbars.some(t => t.id === 'system-toolbar-main');

    // On ne reconstruit la barre principale que s'il n'y en a PAS. Le
    // faisant à chaque premier démarrage, on écrasait la barre d'une interface
    // qu'on venait de charger : le collègue à qui l'on prépare une panoplie de
    // cinq outils retrouvait les vingt-deux par défaut.
    if (!hasMain) {
        toolbars = toolbars.filter(t => t.id !== 'system-toolbar-main');
        const barTools = document.getElementById('bar-tools');
        if (barTools) {
            const defaultIds = [];
            barTools.querySelectorAll('.btn').forEach(btn => {
                let id = btn.dataset.pluginKey || btn.dataset.pluginId || btn.dataset.mode || btn.dataset.widget || btn.id || btn.getAttribute('data-tooltip') || btn.title;
                if (id) {
                    id = normalizePluginId(id).replace(/^system:/, '');
                    defaultIds.push(id);
                }
            });
            if (defaultIds.length > 0) {
                toolbars.unshift({
                    id: 'system-toolbar-main',
                    name: 'Outils',
                    x: 20,
                    y: 80,
                    titlePalette: 'default',
                    palette: 'default',
                    borderPalette: 'default',
                    iconSize: '1',
                    cols: 2,
                    protected: true,
                    initialItems: [...defaultIds],
                    items: [...defaultIds]
                });
                saveStoredFloatingToolbars(toolbars);
            }
        }
    }
    localStorage.setItem('board_toolbars_migrated_v2', 'true');

    container.innerHTML = '';
    getStoredFloatingToolbars().forEach(toolbar => renderFloatingToolbar(toolbar));
}

let pluginSearchMatches = [];
let pluginSearchActiveIndex = -1;

function normalizePluginSearchText(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function togglePluginSearch() {
    const wrap = document.getElementById('plugin-search-wrap');
    const input = document.getElementById('plugin-search-input');
    if (!wrap || !input) return;
    const isOpen = wrap.classList.toggle('open');
    if (isOpen) {
        input.focus();
    } else {
        input.value = '';
        closePluginSearchResults();
    }
}

function closePluginSearchResults() {
    const resultsEl = document.getElementById('plugin-search-results');
    if (resultsEl) { resultsEl.classList.remove('open'); resultsEl.innerHTML = ''; }
    pluginSearchMatches = [];
    pluginSearchActiveIndex = -1;
}

function closePluginSearch() {
    const wrap = document.getElementById('plugin-search-wrap');
    const input = document.getElementById('plugin-search-input');
    if (wrap) wrap.classList.remove('open');
    if (input) input.value = '';
    closePluginSearchResults();
}

function filterPluginSearch(query) {
    const resultsEl = document.getElementById('plugin-search-results');
    if (!resultsEl) return;
    query = normalizePluginSearchText(query.trim());

    if (!query) { closePluginSearchResults(); return; }

    const getPluginName = (btn) => btn.getAttribute('data-tooltip') || btn.title || '';

    pluginSearchMatches = Array.from(document.querySelectorAll('#plugins-grid .btn'))
        .filter(btn => getPluginName(btn) && normalizePluginSearchText(getPluginName(btn)).includes(query))
        .slice(0, 8);
    pluginSearchActiveIndex = -1;

    if (pluginSearchMatches.length === 0) {
        resultsEl.innerHTML = `<div class="plugin-search-empty">Aucun outil trouvé</div>`;
    } else {
        resultsEl.innerHTML = pluginSearchMatches.map((btn, i) =>
            `<button type="button" class="plugin-search-item" data-idx="${i}">${getPluginName(btn)}<span class="cat">${btn.dataset.category || ''}</span></button>`
        ).join('');
        resultsEl.querySelectorAll('.plugin-search-item').forEach((el, i) => {
            el.addEventListener('click', () => selectPluginSearchResult(i));
        });
    }
    resultsEl.classList.add('open');
}

function selectPluginSearchResult(idx) {
    const btn = pluginSearchMatches[idx];
    if (!btn) return;
    const category = btn.dataset.category;
    if (category) {
        const tabBtn = document.querySelector(`#plugin-tabs .btn[data-cat="${CSS.escape(category)}"]`);
        if (tabBtn) tabBtn.click();
    }
    btn.click();
    closePluginSearch();
}

function handlePluginSearchKeydown(e) {
    const resultsEl = document.getElementById('plugin-search-results');
    if (e.key === 'Escape') {
        closePluginSearch();
        e.target.blur();
        return;
    }
    if (!pluginSearchMatches.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pluginSearchActiveIndex += (e.key === 'ArrowDown' ? 1 : -1);
        if (pluginSearchActiveIndex < 0) pluginSearchActiveIndex = pluginSearchMatches.length - 1;
        if (pluginSearchActiveIndex >= pluginSearchMatches.length) pluginSearchActiveIndex = 0;
        resultsEl.querySelectorAll('.plugin-search-item').forEach((el, i) => {
            el.classList.toggle('active', i === pluginSearchActiveIndex);
        });
        resultsEl.querySelectorAll('.plugin-search-item')[pluginSearchActiveIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        selectPluginSearchResult(pluginSearchActiveIndex >= 0 ? pluginSearchActiveIndex : 0);
    }
}

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('plugin-search-wrap');
    if (wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) {
        closePluginSearch();
    }
});

function togglePluginDrawer(event) {
    if (event) event.preventDefault();
    const drawer = document.getElementById('bar-plugins');
    const toggle = event && event.currentTarget ? event.currentTarget : document.querySelector('#bar-plugins .drawer-toggle');
    if (!drawer || !toggle) return;

    drawer.classList.toggle('closed');
    const icon = toggle.querySelector('svg');
    if (icon) {
        icon.innerHTML = drawer.classList.contains('closed')
            ? '<polyline points="6 9 12 15 18 9"/>'
            : '<polyline points="18 15 12 9 6 15"/>';
    }

    if (typeof updateStyleBarContext === 'function') {
        requestAnimationFrame(() => updateStyleBarContext());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pluginsGrid = document.getElementById('plugins-grid');
    if (pluginsGrid) {
        pluginsGrid.classList.add('compact-view');
    }

    document.addEventListener('pointerdown', (e) => {
        document.querySelectorAll('.toolbar-menu.active').forEach(menu => {
            const bar = menu.closest('.custom-toolbar');
            const settingsBtn = bar ? bar.querySelector('.c-action.settings') : null;
            if (!menu.contains(e.target) && (!settingsBtn || !settingsBtn.contains(e.target))) {
                menu.classList.remove('active');
            }
        });
    });
});

function toggleRightDrawer(event) {
    if (event) event.preventDefault();
    const drawer = document.getElementById('right-drawer');
    if (drawer) {
        drawer.classList.toggle('open');
        const chev = document.getElementById('right-chev');
        if (chev) {
            chev.innerHTML = drawer.classList.contains('open')
                ? '<polyline points="9 18 15 12 9 6"/>'
                : '<polyline points="15 18 9 12 15 6"/>';
        }
    }
}

function toggleBottomDrawer(event) {
    if (event) event.preventDefault();
    const drawer = document.getElementById('bottom-drawer');
    const icon = document.getElementById('bot-chev');
    if (!drawer || !icon) return;

    drawer.classList.toggle('closed');
    const isClosed = drawer.classList.contains('closed');
    icon.innerHTML = isClosed
        ? '<polyline points="18 15 12 9 6 15"/>'
        : '<polyline points="6 9 12 15 18 9"/>';
}

// ==============================================================================
// GESTION DES RACCOURCIS CLAVIER (VRAI CTRL+A, CTRL+C, CTRL+X, CTRL+V)
// ==============================================================================

// On crée un presse-papier intelligent qui garde les points d'ancrage en mémoire
let boardClipboard = { items: [], points: [] };

window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    const isCtrl = e.ctrlKey || e.metaKey;

    // 🎯 CTRL + A : Tout sélectionner VISUELLEMENT
    if (isCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();

        // On vide la sélection actuelle
        selectedItems = [];

        // On injecte chaque objet dans le tableau officiel des sélections
        const addAll = (arr, type) => {
            if (arr) arr.forEach(o => { if (!o.locked) selectedItems.push({ type: type, id: o.id }); });
        };

        addAll(points, 'point'); addAll(segments, 'segment'); addAll(circles, 'circle');
        addAll(rectangles, 'rectangle'); addAll(texts, 'text'); addAll(freehands, 'freehand');
        addAll(curves, 'curve'); addAll(polygons, 'polygon'); addAll(images, 'image'); addAll(arcs, 'arc');

        // On force l'affichage de la barre de style et le dessin
        if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast("🎯 Tout est sélectionné");
    }

    // 📋 CTRL + C : Copier
    if (isCtrl && e.key.toLowerCase() === 'c') { copierSelection(); }

    // ✂️ CTRL + X : Couper
    if (isCtrl && e.key.toLowerCase() === 'x') { couperSelection(); }

    // 📥 CTRL + V : Coller
    if (isCtrl && e.key.toLowerCase() === 'v') { collerDuTableau(); }
});

// Les quatre gestes, écrits une fois : les raccourcis les appellent, les
// boutons de la barre contextuelle aussi. Sur tablette il n'y a pas de
// clavier — les raccourcis seuls ne suffisaient pas.
function copierSelection() {
    {
        if (selectedItems.length > 0) {
            boardClipboard.items = [];
            boardClipboard.points = [];

            // 1. On mémorise d'abord tous les points impliqués pour ne pas casser la géométrie
            const pointsToCopy = new Set();
            selectedItems.forEach(item => {
                if (item.type === 'point') pointsToCopy.add(item.id);
                else {
                    const obj = getObjectById(item.type, item.id);
                    if (obj) {
                        if (obj.p1_id) { pointsToCopy.add(obj.p1_id); pointsToCopy.add(obj.p2_id); }
                        if (obj.center_id) { pointsToCopy.add(obj.center_id); pointsToCopy.add(obj.edge_id); }
                        if (obj.points && Array.isArray(obj.points)) obj.points.forEach(pid => { if (typeof pid === 'number') pointsToCopy.add(pid); });
                    }
                }
            });

            // On sauvegarde ces points
            pointsToCopy.forEach(pid => {
                const p = getObjectById('point', pid);
                if (p) boardClipboard.points.push(JSON.parse(JSON.stringify(p)));
            });

            // 2. On sauvegarde les formes
            selectedItems.forEach(item => {
                if (item.type !== 'point') { // Les points sont déjà gérés
                    const obj = getObjectById(item.type, item.id);
                    if (obj && !obj.locked) {
                        boardClipboard.items.push({ type: item.type, data: JSON.parse(JSON.stringify(obj)) });
                    }
                }
            });

            if (typeof showToast === 'function') showToast("📋 Éléments copiés");
            return true;
        }
        if (typeof showToast === 'function') showToast('Rien à copier : sélectionnez d\'abord');
        return false;
    }
}

function couperSelection() {
    {
        if (selectedItems.length > 0) {
            copierSelection();

            // ... Puis on supprime !
            selectedItems.forEach(item => deleteObject(item.type, item.id));
            clearSelection();
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof showToast === 'function') showToast("✂️ Éléments coupés");
            return true;
        }
        if (typeof showToast === 'function') showToast('Rien à couper : sélectionnez d\'abord');
        return false;
    }
}

function collerDuTableau() {
    {
        if (boardClipboard.items.length > 0 || boardClipboard.points.length > 0) {
            clearSelection();
            const offset = 30 / zoom; // Décalage visuel pour voir qu'on a collé
            const pointIdMapping = {}; // Essentiel pour relier les segments aux NOUVEAUX points

            // 1. On recrée d'abord les points et on mémorise leurs nouveaux IDs
            boardClipboard.points.forEach(pClip => {
                const newPoint = JSON.parse(JSON.stringify(pClip));
                const oldId = newPoint.id;
                newPoint.id = nextId++;
                newPoint.z = globalZ++;
                newPoint.x += offset;
                newPoint.y += offset;

                pointIdMapping[oldId] = newPoint.id;
                points.push(newPoint);
                selectedItems.push({ type: 'point', id: newPoint.id });
            });

            // 2. On recrée les objets et on remplace leurs "vieux" IDs de points par les nouveaux
            boardClipboard.items.forEach(clip => {
                const newObj = JSON.parse(JSON.stringify(clip.data));
                newObj.id = nextId++;
                newObj.z = globalZ++;

                // Décalage pour objets sans points (Images, Textes, Freehands, Arcs)
                if (newObj.x !== undefined) newObj.x += offset;
                if (newObj.y !== undefined) newObj.y += offset;
                // ✅ Ne pas décaler cx/cy (ce sont les coords de crop, pas de position)
                if (clip.type === 'freehand' && newObj.points) {
                    newObj.points.forEach(pt => { pt.x += offset; pt.y += offset; });
                }

                // Reconstruction des liens (Géométrie)
                if (newObj.p1_id) { newObj.p1_id = pointIdMapping[newObj.p1_id]; newObj.p2_id = pointIdMapping[newObj.p2_id]; }
                if (newObj.center_id) { newObj.center_id = pointIdMapping[newObj.center_id]; newObj.edge_id = pointIdMapping[newObj.edge_id]; }
                if (newObj.points && Array.isArray(newObj.points) && clip.type !== 'freehand') {
                    newObj.points = newObj.points.map(pid => pointIdMapping[pid]);
                }

                // Injection dans le bon tableau
                if (clip.type === 'segment') segments.push(newObj);
                else if (clip.type === 'circle') circles.push(newObj);
                else if (clip.type === 'rectangle') rectangles.push(newObj);
                else if (clip.type === 'curve') curves.push(newObj);
                else if (clip.type === 'polygon') polygons.push(newObj);
                else if (clip.type === 'freehand') freehands.push(newObj);
                else if (clip.type === 'text') texts.push(newObj);
                else if (clip.type === 'image') images.push(newObj);
                else if (clip.type === 'arc') arcs.push(newObj);

                // On sélectionne le nouvel objet !
                selectedItems.push({ type: clip.type, id: newObj.id });
            });

            if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof showToast === 'function') showToast("📥 Éléments collés");
            return true;
        }
        return false;
    }
}

// Dupliquer, c'est copier puis coller — mais sans écraser ce que l'on avait
// mis de côté : on prête le presse-papier et on le rend.
function dupliquerSelection() {
    if (!selectedItems.length) {
        if (typeof showToast === 'function') showToast('Rien à dupliquer : sélectionnez d\'abord');
        return false;
    }
    const garde = boardClipboard;
    boardClipboard = { items: [], points: [] };
    copierSelection();
    const fait = collerDuTableau();
    boardClipboard = garde;
    if (fait && typeof showToast === 'function') showToast('🧬 Copie posée à côté');
    return fait;
}

window.copierSelection = copierSelection;
window.couperSelection = couperSelection;
window.collerDuTableau = collerDuTableau;
window.dupliquerSelection = dupliquerSelection;

document.addEventListener('DOMContentLoaded', () => {
    const brancher = (id, action) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', action);
    };
    brancher('btn-copier', () => copierSelection());
    brancher('btn-couper', () => couperSelection());
    // Ctrl+D existe depuis longtemps et passe par duplicateSelection() :
    // le bouton fait exactement le même geste, pas un second.
    brancher('btn-dupliquer', () => {
        if (!selectedItems.length) {
            if (typeof showToast === 'function') showToast("Rien à dupliquer : sélectionnez d'abord");
            return;
        }
        if (typeof duplicateSelection === 'function') duplicateSelection();
        else dupliquerSelection();
    });
    // Le même geste, aux deux endroits : dans la barre de sélection, et dans
    // la barre du bas où il reste atteignable sans rien avoir sélectionné.
    const coller = () => {
        // Le presse-papier du tableau d'abord ; sinon celui du système.
        if (collerDuTableau()) return;
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(t => {
                if (t && collerTexteSurLeTableau('', t)) return;
                if (typeof showToast === 'function') showToast('Rien à coller');
            }).catch(() => {
                if (typeof showToast === 'function') showToast('Collage refusé par le navigateur — faites Ctrl+V');
            });
        } else if (typeof showToast === 'function') showToast('Rien à coller');
    };
    brancher('btn-coller', coller);
    brancher('btn-coller-tableau', coller);
});

// 🚀 Lancement blindé (Essaie au chargement, et force après 1.5s au cas où)
window.addEventListener('load', initFavoritesDock);
setTimeout(initFavoritesDock, 1500);

// ==============================================================================
// MODULE : TOOLTIPS DYNAMIQUES (élément unique positionné en JS, ne sort jamais de l'écran)
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const dtTooltip = document.createElement('div');
    dtTooltip.id = 'dt-tooltip';
    document.body.appendChild(dtTooltip);

    let dtShowTimer = null;
    let dtHideTimer = null;
    let dtCurrentEl = null;
    let dtLastPointerType = 'mouse';
    const DT_TOUCH_LIFETIME = 2200; // ms : durée d'affichage au doigt (pas de "mouseout" sur tablette)

    function hideDtTooltip() {
        clearTimeout(dtShowTimer);
        clearTimeout(dtHideTimer);
        dtCurrentEl = null;
        dtTooltip.classList.remove('visible');
    }

    function positionDtTooltip(el) {
        const r = el.getBoundingClientRect();
        dtTooltip.style.left = '0px';
        dtTooltip.style.top = '0px';
        const tw = dtTooltip.offsetWidth;
        const th = dtTooltip.offsetHeight;

        let left = r.left + r.width / 2 - tw / 2;
        let top = r.top - th - 10;

        if (top < 4) top = r.bottom + 10; // Pas de place au-dessus -> ouvre en dessous
        top = Math.min(top, window.innerHeight - th - 6);
        left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));

        dtTooltip.style.left = left + 'px';
        dtTooltip.style.top = top + 'px';
    }

    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest('[data-tooltip]');
        if (!el || el === dtCurrentEl) return;
        const text = el.getAttribute('data-tooltip');
        if (!text) return;

        clearTimeout(dtShowTimer);
        clearTimeout(dtHideTimer);
        dtCurrentEl = el;
        const isTouch = (dtLastPointerType === 'touch' || dtLastPointerType === 'pen');
        dtShowTimer = setTimeout(() => {
            if (dtCurrentEl !== el) return;
            dtTooltip.textContent = text;
            // La touche, s'il y en a une, se lit comme une petite touche de clavier
            const touche = el.getAttribute('data-raccourci');
            if (touche) {
                const k = document.createElement('kbd');
                k.className = 'dt-touche';
                k.textContent = touche;
                dtTooltip.appendChild(k);
            }
            dtTooltip.classList.add('visible');
            positionDtTooltip(el);
            // Au doigt/stylet, aucun "mouseout" ne viendra : on temporise la disparition
            if (isTouch) dtHideTimer = setTimeout(hideDtTooltip, DT_TOUCH_LIFETIME);
        }, isTouch ? 350 : 500);
    });

    document.addEventListener('mouseout', (e) => {
        const el = e.target.closest('[data-tooltip]');
        if (!el) return;
        hideDtTooltip();
    });

    // Sur tablette : mémorise le type de pointeur et masque l'infobulle dès qu'on touche
    document.addEventListener('pointerdown', (e) => {
        dtLastPointerType = e.pointerType || 'mouse';
        hideDtTooltip();
    }, true);
    document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') dtLastPointerType = 'mouse'; }, true);
    document.addEventListener('pointercancel', hideDtTooltip, true);
    window.addEventListener('blur', hideDtTooltip);

    window.addEventListener('scroll', hideDtTooltip, true);
});

// ==============================================================================
// MODULE : GESTION DES CLASSES (élèves) — stockage partagé (localforage)
// Utilisé par le gestionnaire de classes (bouton "Mes classes") et par les
// plugins pédagogiques comme randomDrawTool (tirage au sort & groupes).
// ==============================================================================
const CLASSES_STORAGE_KEY = 'auTableau_classes_v2';

const ClassesStore = {
    _cache: null,

    newId(prefix) {
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    },

    async loadAll() {
        if (this._cache) { this._purgerLAppel(this._cache); return this._cache; }
        let classes = await localforage.getItem(CLASSES_STORAGE_KEY);
        if (!classes) classes = await this._migrateLegacy();
        this._cache = classes || [];
        this._purgerLAppel(this._cache);
        return this._cache;
    },

    // L'appel d'hier n'est plus l'appel d'aujourd'hui : les absences tombent
    // d'elles-mêmes au changement de date, sans que personne ait à y penser.
    _purgerLAppel(classes) {
        if (typeof Appel === 'undefined') return;
        if (Appel.oublierLaVeille(classes)) {
            localforage.setItem(CLASSES_STORAGE_KEY, classes).catch(() => { /* écriture refusée */ });
        }
    },

    // Migration ponctuelle depuis l'ancien format de randomDrawTool
    // (localStorage['auTableau_classes'] = { nomClasse: ["Elève 1", ...] })
    async _migrateLegacy() {
        try {
            const legacy = localStorage.getItem('auTableau_classes');
            if (!legacy) return [];
            const parsed = JSON.parse(legacy);
            const migrated = Object.keys(parsed).map(name => ({
                id: this.newId('class'),
                name,
                students: (parsed[name] || []).map(sName => ({ id: this.newId('stu'), name: sName })),
                createdAt: Date.now(),
                updatedAt: Date.now()
            }));
            if (migrated.length > 0) await localforage.setItem(CLASSES_STORAGE_KEY, migrated);
            return migrated;
        } catch (e) {
            console.error('Erreur migration classes legacy', e);
            return [];
        }
    },

    async saveAll(classes) {
        this._cache = classes;
        await localforage.setItem(CLASSES_STORAGE_KEY, classes);
    },

    // Fusionne des classes importées avec le stock local. En cas de conflit
    // (même id ou même nom, mais liste d'élèves différente), affiche une popup
    // demandant à l'utilisateur de choisir : garder la mienne / garder l'importée / fusionner.
    async reconcileImport(importedClasses) {
        if (!importedClasses || importedClasses.length === 0) return this.loadAll();

        const local = await this.loadAll();
        const conflicts = [];
        const toAdd = [];

        importedClasses.forEach(importedC => {
            const match = local.find(c => c.id === importedC.id) || local.find(c => c.name === importedC.name);
            if (!match) {
                toAdd.push({ ...importedC, id: importedC.id || this.newId('class') });
            } else {
                const localNames = JSON.stringify((match.students || []).map(s => s.name).sort());
                const importedNames = JSON.stringify((importedC.students || []).map(s => s.name).sort());
                if (localNames !== importedNames) conflicts.push({ local: match, imported: importedC });
            }
        });

        if (toAdd.length > 0) await this.saveAll(local.concat(toAdd));
        if (conflicts.length === 0) return this.loadAll();

        for (const conflict of conflicts) {
            const resolution = await new Promise(resolve => showClassConflictModal(conflict, resolve));
            const all = await this.loadAll();
            const idx = all.findIndex(c => c.id === conflict.local.id);
            if (idx < 0) continue;

            if (resolution === 'imported') {
                all[idx] = { ...conflict.imported, id: conflict.local.id, updatedAt: Date.now() };
            } else if (resolution === 'merge') {
                const existingNames = new Set((conflict.local.students || []).map(s => s.name));
                const merged = [...(conflict.local.students || [])];
                (conflict.imported.students || []).forEach(s => {
                    if (!existingNames.has(s.name)) { merged.push({ id: s.id || this.newId('stu'), name: s.name }); existingNames.add(s.name); }
                });
                all[idx] = { ...conflict.local, students: merged, updatedAt: Date.now() };
            }
            // resolution === 'mine' -> ne rien changer
            await this.saveAll(all);
        }
        return this.loadAll();
    }
};
window.ClassesStore = ClassesStore;

// ===================================================
// L'APPEL
// Un élève absent n'est pas un élève supprimé : il garde ses points, ses
// badges et sa place. Il est simplement mis de côté pour la séance — le
// tirage au sort ne le désigne pas, les groupes ne comptent pas sur lui.
// L'absence ne vaut QUE pour la journée : elle s'efface d'elle-même au
// changement de date, sinon on traînerait les absents de la semaine dernière.
// ===================================================
const Appel = {
    aujourdHui() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
            + '-' + String(d.getDate()).padStart(2, '0');
    },

    // Rend true si quelque chose a été effacé : l'appelant enregistre alors.
    oublierLaVeille(classes) {
        const jour = this.aujourdHui();
        let change = false;
        (classes || []).forEach(c => {
            if (c.appelDu === jour) return;
            if ((c.students || []).some(s => s.absent)) {
                c.students.forEach(s => { delete s.absent; });
                change = true;
            }
            if (c.appelDu) { delete c.appelDu; change = true; }
        });
        return change;
    },

    estAbsent(eleve) { return !!(eleve && eleve.absent); },
    presents(classe) { return (classe && classe.students || []).filter(s => !s.absent); },
    absents(classe) { return (classe && classe.students || []).filter(s => s.absent); },

    basculer(classe, eleveId) {
        const e = (classe && classe.students || []).find(s => s.id === eleveId);
        if (!e) return null;
        if (e.absent) delete e.absent; else e.absent = true;
        classe.appelDu = this.aujourdHui();
        classe.updatedAt = Date.now();
        return !e.absent;
    },

    tousPresents(classe) {
        (classe && classe.students || []).forEach(s => { delete s.absent; });
        if (classe) { classe.appelDu = this.aujourdHui(); classe.updatedAt = Date.now(); }
    },

    // « 24 présents, 2 absents » — ou rien du tout si l'appel n'est pas fait
    resume(classe) {
        const tous = (classe && classe.students) || [];
        const abs = tous.filter(s => s.absent).length;
        if (!tous.length) return '';
        if (!abs) return `${tous.length} présents`;
        return `${tous.length - abs} présents, ${abs} absent${abs > 1 ? 's' : ''}`;
    }
};
window.Appel = Appel;

// ===================================================
// LES AVATARS DES ÉLÈVES
// Chaque élève a son petit monstre, tiré au sort à partir de son identifiant
// — donc toujours le même, d'une séance à l'autre et d'un écran à l'autre —
// que l'on peut ensuite personnaliser trait par trait, ou remplacer par une
// photo. L'avatar vit sur l'élève, dans « Mes classes » : il suit la classe
// partout (points, plan de classe, tirage au sort, export).
//
// Le dessin est écrit ici, une seule fois, pour que « Mes classes » et les
// plugins montrent exactement le même monstre.
// ===================================================
const AvatarsEleves = {
    TEINTES: ['#e17055', '#0984e3', '#00b894', '#6c5ce7', '#fdcb6e', '#d63031',
              '#00cec9', '#e84393', '#fd79a8', '#55efc4', '#a29bfe', '#fab1a0'],
    CORPS: ['rond', 'goutte', 'bloc', 'poilu'],
    BOUCHES: ['sourire', 'dents', 'o', 'trait'],
    CORNES: ['aucune', 'pointes', 'antennes', 'oreilles'],
    YEUX: [1, 2, 3],

    // Toujours le même monstre pour le même élève : on tire au sort à partir
    // de son identifiant, pas au hasard à chaque affichage.
    empreinte: function (texte) {
        let h = 0;
        const s = String(texte || '');
        for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
        // Deux identifiants voisins (« stu_1 » et « stu_2 ») ne diffèrent que
        // par les bits de poids faible : sans ce brassage, tous les élèves
        // d'une classe héritaient des mêmes cornes.
        h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
        h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
        h ^= h >>> 16;
        return h >>> 0;
    },

    traits: function (eleve) {
        const e = eleve || {};
        const h = this.empreinte(e.id || e.name);
        const auto = {
            teinte: this.TEINTES[h % this.TEINTES.length],
            corps: this.CORPS[(h >> 3) % this.CORPS.length],
            yeux: 1 + ((h >> 6) % 3),
            bouche: this.BOUCHES[(h >> 9) % this.BOUCHES.length],
            cornes: this.CORNES[(h >> 12) % this.CORNES.length]
        };
        return Object.assign(auto, e.avatar || {});
    },

    // Les monstres ne plaisent pas à tout le monde, et au lycée ils font
    // enfantins : on peut les éteindre. Le réglage est ici, une seule fois —
    // « Mes classes », le plan de classe et les points le suivent sans rien
    // avoir à savoir.
    CLE_ACTIFS: 'board_avatars',
    actifs: true,
    lireReglage: function () {
        try { this.actifs = localStorage.getItem(this.CLE_ACTIFS) !== '0'; } catch (e) { /* stockage refusé */ }
        return this.actifs;
    },
    regler: function (allumes) {
        this.actifs = !!allumes;
        try { localStorage.setItem(this.CLE_ACTIFS, this.actifs ? '1' : '0'); } catch (e) { /* stockage refusé */ }
    },

    initiales: function (nom) {
        const mots = String(nom || '?').trim().split(/[\s-]+/).filter(Boolean);
        return ((mots[0] || '?')[0] + (mots[1] ? mots[1][0] : '')).toUpperCase();
    },

    // Sans monstre, on garde la couleur et on écrit les initiales : la classe
    // reste lisible d'un coup d'œil, sans dessin.
    pastille: function (eleve, taille) {
        const T = taille || 64;
        const t = this.traits(eleve);
        return `<svg viewBox="0 0 100 100" width="${T}" height="${T}" style="display:block;">`
            + `<rect x="4" y="4" width="92" height="92" rx="22" fill="${t.teinte}"/>`
            + `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="#ffffff"`
            + ` font-family="sans-serif" font-weight="700" font-size="42">${this.initiales(eleve && eleve.name)}</text></svg>`;
    },

    svg: function (eleve, taille) {
        const t = this.traits(eleve);
        const T = taille || 64;
        if (t.image) {
            return `<img src="${t.image}" alt="" style="width:${T}px; height:${T}px; border-radius:${Math.round(T / 5)}px; object-fit:cover; display:block;">`;
        }
        // Une photo posée exprès reste affichée ; c'est le monstre qui s'éteint.
        if (!this.actifs) return this.pastille(eleve, T);

        const sombre = '#2d3436';
        let corps = '';
        if (t.corps === 'rond') corps = `<circle cx="50" cy="56" r="36" fill="${t.teinte}"/>`;
        else if (t.corps === 'goutte') corps = `<path d="M50 16 C74 34 86 50 86 62 A36 36 0 0 1 14 62 C14 50 26 34 50 16 Z" fill="${t.teinte}"/>`;
        else if (t.corps === 'bloc') corps = `<rect x="16" y="22" width="68" height="70" rx="16" fill="${t.teinte}"/>`;
        else {
            // le monstre poilu : un rond mordu tout autour
            let d = '';
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                const r = (i % 2 === 0) ? 38 : 30;
                const x = 50 + r * Math.cos(a), y = 56 + r * Math.sin(a);
                d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
            }
            corps = `<path d="${d}Z" fill="${t.teinte}"/>`;
        }

        let cornes = '';
        if (t.cornes === 'pointes') cornes = `<path d="M30 30 L18 2 L46 20 Z" fill="${t.teinte}"/><path d="M70 30 L82 2 L54 20 Z" fill="${t.teinte}"/>`;
        else if (t.cornes === 'antennes') cornes = `<line x1="34" y1="26" x2="26" y2="8" stroke="${sombre}" stroke-width="3"/><circle cx="26" cy="6" r="5" fill="${t.teinte}"/>`
            + `<line x1="66" y1="26" x2="74" y2="8" stroke="${sombre}" stroke-width="3"/><circle cx="74" cy="6" r="5" fill="${t.teinte}"/>`;
        else if (t.cornes === 'oreilles') cornes = `<ellipse cx="10" cy="48" rx="12" ry="16" fill="${t.teinte}"/><ellipse cx="90" cy="48" rx="12" ry="16" fill="${t.teinte}"/>`;

        let yeux = '';
        const oeil = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff"/><circle cx="${x}" cy="${y + 1}" r="${r * 0.45}" fill="${sombre}"/>`;
        if (t.yeux === 1) yeux = oeil(50, 50, 16);
        else if (t.yeux === 2) yeux = oeil(37, 50, 11) + oeil(63, 50, 11);
        else yeux = oeil(32, 48, 9) + oeil(50, 44, 9) + oeil(68, 48, 9);

        let bouche = '';
        if (t.bouche === 'sourire') bouche = `<path d="M36 72 Q50 84 64 72" stroke="${sombre}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
        else if (t.bouche === 'dents') bouche = `<path d="M34 70 h32 v10 h-32 Z" fill="#ffffff" stroke="${sombre}" stroke-width="2"/><line x1="42" y1="70" x2="42" y2="80" stroke="${sombre}" stroke-width="2"/><line x1="50" y1="70" x2="50" y2="80" stroke="${sombre}" stroke-width="2"/><line x1="58" y1="70" x2="58" y2="80" stroke="${sombre}" stroke-width="2"/>`;
        else if (t.bouche === 'o') bouche = `<ellipse cx="50" cy="75" rx="9" ry="7" fill="${sombre}"/>`;
        else bouche = `<line x1="38" y1="75" x2="62" y2="75" stroke="${sombre}" stroke-width="4" stroke-linecap="round"/>`;

        return `<svg viewBox="0 0 100 100" width="${T}" height="${T}" style="display:block;">${cornes}${corps}${yeux}${bouche}</svg>`;
    },

    // Changer un trait fige les autres tels qu'ils sont : sinon régler la
    // couleur ferait aussi bouger la bouche.
    poser: function (eleve, cle, valeur) {
        eleve.avatar = Object.assign({}, this.traits(eleve), { [cle]: valeur });
        delete eleve.avatar.image;
    },

    auHasard: function (eleve) {
        const pioche = (a) => a[Math.floor(Math.random() * a.length)];
        eleve.avatar = {
            teinte: pioche(this.TEINTES), corps: pioche(this.CORPS),
            yeux: pioche(this.YEUX), bouche: pioche(this.BOUCHES), cornes: pioche(this.CORNES)
        };
    },

    dorigine: function (eleve) { delete eleve.avatar; },

    // Une classe entière de photos en pleine taille ferait un fichier de
    // sauvegarde énorme : on recadre au carré et on réduit à 128 px.
    photo: function (eleve, fichier) {
        return new Promise((resolve, reject) => {
            const lecteur = new FileReader();
            lecteur.onerror = () => reject(new Error('Image illisible'));
            lecteur.onload = (ev) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Image illisible'));
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = c.height = 128;
                    const g = c.getContext('2d');
                    const cote = Math.min(img.width, img.height);
                    g.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 128, 128);
                    eleve.avatar = { image: c.toDataURL('image/jpeg', 0.8) };
                    resolve(eleve.avatar);
                };
                img.src = ev.target.result;
            };
            lecteur.readAsDataURL(fichier);
        });
    }
};
AvatarsEleves.lireReglage();
window.AvatarsEleves = AvatarsEleves;

// Le petit atelier qui s'ouvre quand on clique l'avatar d'un élève, dans
// « Mes classes ». « enregistrer » est rappelé à chaque changement : la
// fenêtre ne sait pas où vivent les données, elle ne fait que les modifier.
function ouvrirReglageAvatar(eleve, enregistrer) {
    const ancien = document.getElementById('avatar-atelier');
    if (ancien) ancien.remove();

    const fond = document.createElement('div');
    fond.id = 'avatar-atelier';
    fond.className = 'modal-backdrop';
    fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:100002;'
        + 'display:flex; align-items:center; justify-content:center;';

    const ligne = (titre, cle, valeurs, rendu) => {
        const t = AvatarsEleves.traits(eleve);
        return `<div style="margin-bottom:10px;">
            <div style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; margin-bottom:4px;">${titre}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${valeurs.map(v => `<button class="av-trait" data-cle="${cle}" data-v="${v}"
                    style="padding:5px 9px; border-radius:8px; cursor:pointer; font-size:12px; background:var(--bg); color:var(--ink);
                           border:2px solid ${String(t[cle]) === String(v) ? 'var(--accent)' : 'var(--border)'};">${rendu(v)}</button>`).join('')}
            </div></div>`;
    };

    const boite = document.createElement('div');
    boite.className = 'modal-box';
    boite.style.cssText = 'background:var(--panel, #fff); color:var(--ink); border-radius:14px; padding:18px;'
        + 'width:560px; max-width:94vw; max-height:90vh; overflow-y:auto; box-shadow:0 20px 50px rgba(0,0,0,0.3);'
        + 'text-align:left;';

    const peindre = () => {
        boite.innerHTML = `
            <div style="display:flex; gap:18px; align-items:flex-start;">
                <div style="text-align:center; flex:none;">
                    <div id="av-apercu" style="background:#fff; border:2px solid var(--border); border-radius:14px; padding:10px;">${AvatarsEleves.svg(eleve, 110)}</div>
                    <div style="font-size:12px; font-weight:600; margin-top:6px;">${eleve.name || ''}</div>
                    <button id="av-hasard" class="btn-action secondary" style="margin-top:8px; width:100%; padding:6px; font-size:12px;">🎲 Au hasard</button>
                    <button id="av-image" class="btn-action secondary" style="margin-top:6px; width:100%; padding:6px; font-size:12px;">🖼️ Une photo</button>
                    <input type="file" id="av-fichier" accept="image/*" style="display:none;">
                    <button id="av-defaut" class="btn-action secondary" style="margin-top:6px; width:100%; padding:6px; font-size:12px;">↺ Monstre d'origine</button>
                </div>
                <div style="flex:1;">
                    ${ligne('Couleur', 'teinte', AvatarsEleves.TEINTES, v => `<span style="display:inline-block; width:16px; height:16px; border-radius:4px; background:${v};"></span>`)}
                    ${ligne('Corps', 'corps', AvatarsEleves.CORPS, v => v)}
                    ${ligne('Yeux', 'yeux', AvatarsEleves.YEUX, v => v === 1 ? '1 œil' : v + ' yeux')}
                    ${ligne('Bouche', 'bouche', AvatarsEleves.BOUCHES, v => v)}
                    ${ligne('Sur la tête', 'cornes', AvatarsEleves.CORNES, v => v)}
                    <button id="av-fini" class="btn-action primary" style="margin-top:6px; padding:8px 18px;">Terminé</button>
                </div>
            </div>`;

        const change = () => { enregistrer(); peindre(); };

        boite.querySelectorAll('.av-trait').forEach(b => b.onclick = () => {
            AvatarsEleves.poser(eleve, b.dataset.cle, b.dataset.cle === 'yeux' ? parseInt(b.dataset.v, 10) : b.dataset.v);
            change();
        });
        boite.querySelector('#av-hasard').onclick = () => { AvatarsEleves.auHasard(eleve); change(); };
        boite.querySelector('#av-defaut').onclick = () => { AvatarsEleves.dorigine(eleve); change(); };

        const fichier = boite.querySelector('#av-fichier');
        boite.querySelector('#av-image').onclick = () => fichier.click();
        fichier.onchange = (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            AvatarsEleves.photo(eleve, f).then(change)
                .catch(() => { if (typeof showToast === 'function') showToast('Image illisible'); });
        };
        boite.querySelector('#av-fini').onclick = () => fond.remove();
    };

    peindre();
    fond.appendChild(boite);
    fond.addEventListener('click', (e) => { if (e.target === fond) fond.remove(); });
    document.body.appendChild(fond);
}
window.ouvrirReglageAvatar = ouvrirReglageAvatar;

function showClassConflictModal(conflict, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 100001; display: flex; justify-content: center; align-items: center;';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background: var(--surface); border-radius: 12px; padding: 25px; max-width: 480px; box-shadow: var(--shadow-hover);';

    const localNames = (conflict.local.students || []).map(s => s.name);
    const importedNames = (conflict.imported.students || []).map(s => s.name);
    const mergedCount = new Set([...localNames, ...importedNames]).size;

    box.innerHTML = `
        <h3 style="margin-top: 0; color: var(--accent);">⚠️ Conflit sur la classe "${conflict.local.name}"</h3>
        <p style="font-size: 13px; color: var(--muted);">Cette classe existe déjà avec une liste d'élèves différente. Que voulez-vous faire ?</p>
        <div style="display:flex; gap:12px; margin: 15px 0; font-size:12px;">
            <div style="flex:1; background:var(--bg); border-radius:6px; padding:8px; max-height:150px; overflow-y:auto;">
                <strong>Ma version (${localNames.length})</strong>
                <div style="color:var(--muted); margin-top:4px;">${localNames.join(', ') || '(vide)'}</div>
            </div>
            <div style="flex:1; background:var(--bg); border-radius:6px; padding:8px; max-height:150px; overflow-y:auto;">
                <strong>Version importée (${importedNames.length})</strong>
                <div style="color:var(--muted); margin-top:4px;">${importedNames.join(', ') || '(vide)'}</div>
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn-action secondary" id="cc-keep-mine">Garder la mienne</button>
            <button class="btn-action secondary" id="cc-keep-imported">Garder celle importée</button>
            <button class="btn-action primary" id="cc-merge">Fusionner (${mergedCount} élèves)</button>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const close = (resolution) => { document.body.removeChild(modal); callback(resolution); };
    box.querySelector('#cc-keep-mine').onclick = () => close('mine');
    box.querySelector('#cc-keep-imported').onclick = () => close('imported');
    box.querySelector('#cc-merge').onclick = () => close('merge');
}

// ==============================================================================
// MODULE : GESTIONNAIRE DE CLASSES (interface — bouton "Mes classes")
// ==============================================================================
async function openClassManagerModal() {
    // Deux appels de suite empilaient deux fenêtres identiques l'une sur
    // l'autre : la seconde cachait la première, qui restait là.
    const ancienne = document.getElementById('class-manager-modal');
    if (ancienne) ancienne.remove();

    const modal = document.createElement('div');
    modal.id = 'class-manager-modal';
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center;';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background: var(--surface); border-radius: 12px; padding: 20px; width: 720px; max-width: 92vw; max-height: 85vh; display: flex; flex-direction: column; box-shadow: var(--shadow-hover);';

    modal.appendChild(box);
    document.body.appendChild(modal);
    // Trente élèves dans une fenêtre de 720 px, cela défile beaucoup : elle
    // s'agrandit comme les autres, et retient la taille choisie.
    equiperFenetre(box, 'class-manager');

    const state = {
        classes: await ClassesStore.loadAll(),
        selectedId: null,
        dragIndex: null
    };
    state.selectedId = state.classes[0] ? state.classes[0].id : null;

    function getSelected() {
        return state.classes.find(c => c.id === state.selectedId) || null;
    }

    function persist() {
        ClassesStore.saveAll(state.classes);
    }

    function parseNamesFromText(text) {
        return text.split(/\r?\n/)
            .map(line => line.split(/\t|,/)[0].trim())
            .filter(name => name.length > 0);
    }

    function render() {
        const selected = getSelected();

        const listHtml = state.classes.length === 0
            ? `<div style="padding:12px; font-size:12px; color:var(--muted);">Aucune classe. Créez-en une !</div>`
            : state.classes.map(c => `
                <div class="cm-class-item" data-id="${c.id}"
                     style="padding:10px 12px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:4px; ${c.id === state.selectedId ? 'background:var(--accent-soft); color:var(--accent); font-weight:600;' : ''}">
                    <span>${c.name || '(sans nom)'}</span>
                    <span style="font-size:11px; color:var(--muted);">${(c.students || []).length}</span>
                </div>
            `).join('');

        let detailHtml = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--muted); font-size:13px;">Sélectionnez ou créez une classe</div>`;

        if (selected) {
            const studentsHtml = (selected.students || []).map((s, idx) => `
                <div class="cm-student-row${s.absent ? ' absent' : ''}" draggable="true" data-idx="${idx}"
                     style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; background:var(--bg); margin-bottom:4px; cursor:grab;">
                    <span style="color:var(--muted); font-size:12px;">⠿</span>
                    <button class="cm-avatar" data-idx="${idx}" title="Changer l'avatar de ${s.name}"
                            style="border:1px solid var(--border); background:#fff; border-radius:8px; padding:2px; cursor:pointer; line-height:0; flex:none;">${AvatarsEleves.svg(s, 30)}</button>
                    <span class="cm-nom" style="flex:1; font-size:13px; text-align:left;">${s.name}</span>
                    <button class="cm-presence" data-idx="${idx}"
                            title="${s.absent ? s.name + ' est noté absent — cliquer pour le remettre présent' : "Noter " + s.name + " absent aujourd'hui"}"
                            style="border:none; background:none; cursor:pointer; font-size:14px; opacity:${s.absent ? '1' : '0.28'};">${s.absent ? '🚫' : '✓'}</button>
                    <button class="cm-toggle-front" data-idx="${idx}" title="Prioritaire 1er rang"
                            style="border:none; background:none; cursor:pointer; font-size:14px; opacity:${s.frontRow ? '1' : '0.25'};">⭐</button>
                    <button class="cm-del-student" data-idx="${idx}" style="border:none; background:none; cursor:pointer; color:var(--muted); font-size:14px;">🗑️</button>
                </div>
            `).join('') || `<div style="font-size:12px; color:var(--muted); padding:8px;">Aucun élève. Ajoutez-en ou importez une liste.</div>`;

            detailHtml = `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                    <input type="text" id="cm-class-name" value="${selected.name || ''}" placeholder="Nom de la classe"
                           style="flex:1; padding:8px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--ink); font-size:14px; font-weight:600;">
                    <button id="cm-points" class="btn-action primary" style="padding:8px 12px;">🏅 Points</button>
                    <button id="cm-seating-plan" class="btn-action secondary" style="padding:8px 12px;">🪑 Plan de classe</button>
                    <button id="cm-delete-class" class="btn-action secondary" style="padding:8px 12px; color:#d63031;">🗑️ Supprimer</button>
                </div>

                <div style="display:flex; gap:6px; margin-bottom:10px;">
                    <input type="text" id="cm-add-student-input" placeholder="Nom de l'élève..." style="flex:1; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--ink); font-size:12px;">
                    <button id="cm-add-student-btn" class="btn-action primary" style="padding:6px 12px; font-size:12px;">+ Ajouter</button>
                </div>

                <div id="cm-students-list" style="flex:1 1 220px; min-height:140px; overflow-y:auto; margin-bottom:12px;">
                    ${studentsHtml}
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin:-6px 0 10px 2px;">
                    <div style="font-size:11px; color:var(--muted);">
                        <b id="cm-appel-resume">${Appel.resume(selected)}</b>
                        ${Appel.absents(selected).length
                            ? ` — ils sont mis de côté pour aujourd'hui : ni tirage au sort, ni groupes.
                                <button id="cm-tous-presents" style="border:none; background:none; color:var(--accent);
                                    cursor:pointer; font-size:11px; text-decoration:underline; padding:0;">Tous présents</button>`
                            : ' · ✓ pour noter une absence'}
                    </div>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin:-4px 0 12px 2px;">
                    <div style="font-size:11px; color:var(--muted);">⭐ = clique pour marquer un élève prioritaire au 1er rang (utilisé par le plan de classe)</div>
                    <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--muted); white-space:nowrap; cursor:pointer;">
                        <input type="checkbox" id="cm-avatars" ${AvatarsEleves.actifs ? 'checked' : ''}> Avatars dessinés
                    </label>
                </div>

                <div style="border-top:1px solid var(--border); padding-top:10px;">
                    <label style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase;">Importer une liste (copier-coller depuis un tableur, ou fichier .csv)</label>
                    <textarea id="cm-paste-area" placeholder="Collez ici une liste d'élèves (un par ligne, ou copié depuis Excel/Sheets)" style="width:100%; height:60px; margin-top:6px; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--ink); font-size:12px; box-sizing:border-box; resize:vertical;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:6px;">
                        <button id="cm-import-paste-btn" class="btn-action secondary" style="flex:1; padding:6px; font-size:12px;">📋 Importer le texte collé</button>
                        <button id="cm-import-file-btn" class="btn-action secondary" style="flex:1; padding:6px; font-size:12px;">📄 Importer un fichier .csv</button>
                        <input type="file" id="cm-import-file-input" accept=".csv,.txt" style="display:none;">
                    </div>
                </div>
            `;
        }

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; gap:10px;">
                <h3 style="margin:0; color:var(--accent);">👥 Mes classes</h3>
                <div style="flex:1;"></div>
                <button id="cm-sauver" class="btn-action secondary" style="padding:6px 10px; font-size:12px;"
                        title="Enregistrer un fichier contenant toutes vos classes">💾 Sauvegarder</button>
                <button id="cm-restaurer" class="btn-action secondary" style="padding:6px 10px; font-size:12px;"
                        title="Relire un fichier de classes">📂 Restaurer</button>
                <input type="file" id="cm-fichier-classes" accept=".json,application/json" style="display:none;">
                <button id="cm-close" style="border:none; background:none; font-size:20px; cursor:pointer; color:var(--muted);">&times;</button>
            </div>
            <div id="cm-restauration" style="display:none; margin-bottom:12px;"></div>
            <div style="display:flex; gap:15px; flex:1; min-height:0;">
                <div style="width:220px; flex-shrink:0; display:flex; flex-direction:column;">
                    <button id="cm-new-class" class="btn-action primary" style="margin-bottom:10px; padding:8px;">+ Nouvelle classe</button>
                    <div style="overflow-y:auto; flex:1;">${listHtml}</div>
                </div>
                <!-- Colonne souple : la liste d'élèves prend toute la hauteur
                     gagnée quand on agrandit la fenêtre, le reste suit. -->
                <div style="flex:1; min-width:0; border-left:1px solid var(--border); padding-left:15px;
                            display:flex; flex-direction:column; overflow-y:auto;">
                    ${detailHtml}
                </div>
            </div>
        `;

        attachEvents();
    }

    function attachEvents() {
        box.querySelector('#cm-close').onclick = () => document.body.removeChild(modal);

        // --- Sauvegarder / restaurer ---
        const zone = box.querySelector('#cm-restauration');
        const fichier = box.querySelector('#cm-fichier-classes');

        box.querySelector('#cm-sauver').onclick = () => sauverLesClasses();
        box.querySelector('#cm-restaurer').onclick = () => { fichier.value = ''; fichier.click(); };

        const dire = (html, erreur) => {
            zone.style.display = 'block';
            zone.innerHTML = `<div style="border:1px solid ${erreur ? '#d63031' : 'var(--border)'};
                background:${erreur ? 'rgba(214,48,49,0.08)' : 'var(--bg)'}; border-radius:8px;
                padding:10px 12px; font-size:12px; line-height:1.5;">${html}</div>`;
        };

        fichier.onchange = async () => {
            const f = fichier.files && fichier.files[0];
            if (!f) return;
            let data;
            try { data = await lireFichierDeClasses(f); }
            catch (e) { return dire(e.message, true); }

            const eleves = data.classes.reduce((n, c) => n + (c.students || []).length, 0);
            const noms = data.classes.map(c => c.name || '(sans nom)').join(', ');
            dire(`<b>${data.classes.length} classe(s), ${eleves} élève(s)</b> dans ce fichier :
                  ${noms.slice(0, 160)}${noms.length > 160 ? '…' : ''}
                  <div style="display:flex; gap:8px; margin-top:9px; flex-wrap:wrap;">
                    <button id="cm-fusionner" class="btn-action primary" style="padding:6px 12px; font-size:12px;">Compléter mes classes</button>
                    <button id="cm-remplacer" class="btn-action secondary" style="padding:6px 12px; font-size:12px; color:#d63031;">Tout remplacer</button>
                    <button id="cm-annuler-import" class="btn-action secondary" style="padding:6px 12px; font-size:12px;">Annuler</button>
                  </div>
                  <div style="color:var(--muted); margin-top:7px;">« Compléter » n'ajoute que les classes et les
                  élèves qui manquent : rien de ce que vous avez ici n'est modifié, ni les points, ni les badges.
                  « Tout remplacer » écrase vos classes actuelles par celles du fichier.</div>`);

            const poser = async (maniere) => {
                try {
                    const bilan = await poserLesClasses(data, maniere);
                    state.classes = await ClassesStore.loadAll();
                    state.selectedId = state.classes[0] ? state.classes[0].id : null;
                    zone.style.display = 'none';
                    render();
                    if (typeof showToast === 'function') {
                        showToast(maniere === 'remplacer'
                            ? `📂 ${bilan.classes} classe(s) restaurée(s)`
                            : `📂 ${bilan.ajoutees} classe(s) et ${bilan.elevesAjoutes} élève(s) ajoutés`);
                    }
                } catch (e) { dire('Restauration impossible : ' + (e.message || e), true); }
            };
            zone.querySelector('#cm-fusionner').onclick = () => poser('fusionner');
            zone.querySelector('#cm-annuler-import').onclick = () => { zone.style.display = 'none'; };
            zone.querySelector('#cm-remplacer').onclick = () => {
                const faire = () => poser('remplacer');
                if (typeof openConfirmModal === 'function') {
                    openConfirmModal('Tout remplacer',
                        `Vos ${state.classes.length} classe(s) actuelles seront effacées et remplacées par les `
                        + `${data.classes.length} du fichier — points et badges compris. Continuer ?`, true, faire);
                } else faire();
            };
        };

        box.querySelector('#cm-new-class').onclick = () => {
            const newClass = { id: ClassesStore.newId('class'), name: 'Nouvelle classe', students: [], createdAt: Date.now(), updatedAt: Date.now() };
            state.classes.push(newClass);
            state.selectedId = newClass.id;
            persist();
            render();
        };

        box.querySelectorAll('.cm-class-item').forEach(el => {
            el.onclick = () => { state.selectedId = el.dataset.id; render(); };
        });

        const nameInput = box.querySelector('#cm-class-name');
        if (nameInput) {
            nameInput.onchange = () => {
                const c = getSelected();
                if (c) { c.name = nameInput.value.trim() || 'Classe sans nom'; c.updatedAt = Date.now(); persist(); render(); }
            };
        }

        const delBtn = box.querySelector('#cm-delete-class');
        if (delBtn) {
            delBtn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                openConfirmModal(
                    "Supprimer la classe",
                    `Supprimer la classe "${c.name}" et ses ${(c.students || []).length} élève(s) ? Cette action est irréversible.`,
                    true,
                    () => {
                        state.classes = state.classes.filter(cl => cl.id !== c.id);
                        state.selectedId = state.classes[0] ? state.classes[0].id : null;
                        persist();
                        render();
                    }
                );
            };
        }

        const avatarsBox = box.querySelector('#cm-avatars');
        if (avatarsBox) {
            avatarsBox.onchange = () => {
                AvatarsEleves.regler(avatarsBox.checked);
                render();
                if (typeof showToast === 'function') {
                    showToast(avatarsBox.checked ? 'Avatars dessinés' : 'Initiales seulement');
                }
            };
        }

        // Le tableau des points : la classe s'affiche en grand, on donne les
        // points d'un doigt. C'est l'outil « Points de classe », ouvert ici
        // sur la classe qu'on est en train de regarder.
        const pointsBtn = box.querySelector('#cm-points');
        if (pointsBtn) {
            pointsBtn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                const outil = window.PluginManager && PluginManager.plugins.classPointsTool;
                if (!outil) { if (typeof showToast === 'function') showToast('L\'outil Points n\'est pas disponible'); return; }
                persist();
                modal.remove();
                outil.ouvrir(c.id);
            };
        }

        const seatingBtn = box.querySelector('#cm-seating-plan');
        if (seatingBtn) {
            seatingBtn.onclick = () => {
                const c = getSelected();
                if (c) openSeatingPlanEditor(c.id);
            };
        }

        box.querySelectorAll('.cm-avatar').forEach(btn => {
            btn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                const eleve = c.students[parseInt(btn.dataset.idx)];
                if (eleve) ouvrirReglageAvatar(eleve, () => { c.updatedAt = Date.now(); persist(); render(); });
            };
        });

        box.querySelectorAll('.cm-presence').forEach(btn => {
            btn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                const eleve = c.students[parseInt(btn.dataset.idx)];
                if (!eleve) return;
                Appel.basculer(c, eleve.id);
                persist();
                render();
                if (typeof showToast === 'function') {
                    showToast(eleve.absent ? `🚫 ${eleve.name} : absent aujourd'hui`
                                           : `✓ ${eleve.name} : de retour`);
                }
            };
        });

        const tousPresents = box.querySelector('#cm-tous-presents');
        if (tousPresents) tousPresents.onclick = () => {
            const c = getSelected();
            if (!c) return;
            Appel.tousPresents(c);
            persist();
            render();
            if (typeof showToast === 'function') showToast('Toute la classe est présente');
        };

        box.querySelectorAll('.cm-toggle-front').forEach(btn => {
            btn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                const idx = parseInt(btn.dataset.idx);
                c.students[idx].frontRow = !c.students[idx].frontRow;
                c.updatedAt = Date.now();
                persist();
                render();
            };
        });

        const addBtn = box.querySelector('#cm-add-student-btn');
        const addInput = box.querySelector('#cm-add-student-input');
        function addStudent() {
            const c = getSelected();
            if (!c || !addInput.value.trim()) return;
            c.students = c.students || [];
            c.students.push({ id: ClassesStore.newId('stu'), name: addInput.value.trim() });
            c.updatedAt = Date.now();
            persist();
            render();
        }
        if (addBtn) addBtn.onclick = addStudent;
        if (addInput) addInput.onkeydown = (e) => { if (e.key === 'Enter') addStudent(); };

        box.querySelectorAll('.cm-del-student').forEach(btn => {
            btn.onclick = () => {
                const c = getSelected();
                if (!c) return;
                const idx = parseInt(btn.dataset.idx);
                c.students.splice(idx, 1);
                c.updatedAt = Date.now();
                persist();
                render();
            };
        });

        // Réordonner par glisser-déposer
        box.querySelectorAll('.cm-student-row').forEach(row => {
            row.addEventListener('dragstart', () => { state.dragIndex = parseInt(row.dataset.idx); row.style.opacity = '0.4'; });
            row.addEventListener('dragend', () => { row.style.opacity = ''; });
            row.addEventListener('dragover', (e) => e.preventDefault());
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                const targetIdx = parseInt(row.dataset.idx);
                const c = getSelected();
                if (!c || state.dragIndex === null || state.dragIndex === targetIdx) return;
                const [moved] = c.students.splice(state.dragIndex, 1);
                c.students.splice(targetIdx, 0, moved);
                state.dragIndex = null;
                c.updatedAt = Date.now();
                persist();
                render();
            });
        });

        const importPasteBtn = box.querySelector('#cm-import-paste-btn');
        if (importPasteBtn) {
            importPasteBtn.onclick = () => {
                const c = getSelected();
                const textarea = box.querySelector('#cm-paste-area');
                if (!c || !textarea.value.trim()) return;
                const names = parseNamesFromText(textarea.value);
                const existing = new Set((c.students || []).map(s => s.name));
                let added = 0;
                names.forEach(name => {
                    if (!existing.has(name)) { c.students.push({ id: ClassesStore.newId('stu'), name }); existing.add(name); added++; }
                });
                c.updatedAt = Date.now();
                persist();
                render();
                if (typeof showToast === 'function') showToast(`✅ ${added} élève${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}`);
            };
        }

        const importFileBtn = box.querySelector('#cm-import-file-btn');
        const importFileInput = box.querySelector('#cm-import-file-input');
        if (importFileBtn && importFileInput) {
            importFileBtn.onclick = () => importFileInput.click();
            importFileInput.onchange = () => {
                const file = importFileInput.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const c = getSelected();
                    if (!c) return;
                    const names = parseNamesFromText(e.target.result);
                    const existing = new Set((c.students || []).map(s => s.name));
                    let added = 0;
                    names.forEach(name => {
                        if (!existing.has(name)) { c.students.push({ id: ClassesStore.newId('stu'), name }); existing.add(name); added++; }
                    });
                    c.updatedAt = Date.now();
                    persist();
                    render();
                    if (typeof showToast === 'function') showToast(`✅ ${added} élève${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}`);
                };
                reader.readAsText(file);
                importFileInput.value = '';
            };
        }
    }

    render();
}

document.addEventListener('DOMContentLoaded', () => {
    const btnClasses = document.getElementById('btn-classes-menu');
    if (btnClasses) btnClasses.addEventListener('click', () => openClassManagerModal());

    // ✅ "Plugin virtuel" : permet au double-clic natif sur une image (canvas.addEventListener('dblclick', ...))
    // de rouvrir l'éditeur de plan de classe quand l'image tamponnée porte pluginData.id === 'seatingPlan'.
    if (typeof PluginManager !== 'undefined') {
        PluginManager.register('seatingPlan', {
            edit: function (imgObj) {
                if (imgObj.pluginData && imgObj.pluginData.classId) {
                    openSeatingPlanEditor(imgObj.pluginData.classId);
                }
            }
        });
    }
});

// ==============================================================================
// MODULE : PLAN DE CLASSE (placement des élèves sur des tables/îlots)
// ==============================================================================
// Largeur d'une place. Elle était figée à 70 px : les tables restaient
// étroites au milieu d'un canevas presque vide, et les noms composés
// (« Marie-Charlotte », « Jean-Baptiste ») étaient coupés. Chaque plan retient
// désormais la largeur qui convient à sa disposition.
const SP_SEAT_W = 70;
const SP_SEAT_MIN = 70, SP_SEAT_MAX = 190;
const SP_SEAT_H = 56;
const SP_GRID_STEP = 20;
function spSnap(v) { return Math.round(v / SP_GRID_STEP) * SP_GRID_STEP; }
function spCols(capacity) { return Math.max(1, Math.ceil(Math.sqrt(capacity))); }

// Découpe un nom en lignes qui tiennent dans la largeur d'une place.
function spWrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
    const words = text.split(' ');
    let lines = [], line = '';
    words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
        else line = test;
    });
    if (line) lines.push(line);
    // Trois lignes plutôt que deux : un prénom composé suivi d'un nom de
    // famille tenait rarement en deux, et se retrouvait coupé sur le tampon
    // alors qu'il s'affichait entier dans l'éditeur.
    if (lines.length > 3) lines = [lines[0], lines[1], lines[2].slice(0, Math.max(0, lines[2].length - 1)) + '…'];
    const startY = cy - ((lines.length - 1) * lineHeight) / 2 + 4;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}

const SEATING_TEMPLATES = [
    { label: '4×4 tables doubles (32)', rows: 4, cols: 4, capacity: 2 },
    { label: '3×3 tables doubles (18)', rows: 3, cols: 3, capacity: 2 },
    { label: '5×3 tables doubles (30)', rows: 5, cols: 3, capacity: 2 },
    { label: '6×5 tables simples (30)', rows: 6, cols: 5, capacity: 1 },
    { label: '6 îlots de 4 (24)', rows: 2, cols: 3, capacity: 4 },
    { label: '4 îlots de 6 (24)', rows: 2, cols: 2, capacity: 6 }
];

async function openSeatingPlanEditor(classId) {
    const allClasses = await ClassesStore.loadAll();
    const classObj = allClasses.find(c => c.id === classId);
    if (!classObj) return;
    if (!classObj.seatingPlan || !Array.isArray(classObj.seatingPlan.tables)) classObj.seatingPlan = { tables: [] };
    const plan = classObj.seatingPlan;

    if (!document.getElementById('seating-plan-style')) {
        const style = document.createElement('style');
        style.id = 'seating-plan-style';
        style.innerHTML = `
            [class^="sp-"], [class*=" sp-"] { box-sizing: border-box; }
            .sp-canvas-wrap { flex:1; overflow:auto; position:relative;
                background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
                background-size: ${SP_GRID_STEP}px ${SP_GRID_STEP}px; }
            .sp-canvas { position:relative; min-width:100%; min-height:100%; }
            .sp-tool-btn { flex:1; padding:8px 4px; font-size:11px; }
            .sp-table { position:absolute; background:var(--surface); border:2px solid var(--muted); border-radius:10px; box-shadow:0 4px 10px rgba(0,0,0,0.15); }
            .sp-table-handle { height:20px; background:var(--bg); border-bottom:1px solid var(--border); border-radius:8px 8px 0 0; cursor:grab; display:flex; align-items:center; justify-content:space-between; padding:0 4px; }
            .sp-table-resize-group { display:flex; align-items:center; gap:2px; }
            .sp-table-resize { cursor:pointer; font-weight:900; color:var(--muted); padding:0 5px; font-size:13px; line-height:18px; border-radius:4px; }
            .sp-table-resize:hover { color:var(--accent); background:var(--accent-soft); }
            .sp-table-cap { font-size:10px; color:var(--muted); min-width:12px; text-align:center; }
            .sp-table-del { font-size:11px; color:#d63031; cursor:pointer; opacity:0; transition:opacity 0.15s; padding:0 2px; }
            .sp-table:hover .sp-table-del { opacity:1; }
            .sp-teacher-desk { border-color:#6c5ce7; background:rgba(108,92,231,0.08); }
            .sp-seats-grid { display:grid; gap:4px; padding:6px; }
            .sp-seat { background:var(--bg); border:1px dashed var(--border); border-radius:6px; font-size:12px; display:flex; align-items:center; justify-content:center; text-align:center; padding:4px 5px; overflow:hidden; min-width:64px; min-height:${SP_SEAT_H}px; color:var(--muted); }
            .sp-seat.filled { background:var(--accent-soft); border:1px solid var(--accent); font-weight:600; color:var(--ink); cursor:grab; }
            .sp-seat.dragover { border-color:#00b894 !important; background:rgba(0,184,148,0.15) !important; }
            .sp-seat { gap:2px; flex-direction:column; }
            /* L'avatar était POSÉ À CÔTÉ du nom et lui prenait un tiers de la
               largeur : c'est ce qui coupait « Marie-Charlotte ». Il passe
               au-dessus, le nom garde toute la place. */
            .sp-seat-avatar { flex:none; line-height:0; }
            .sp-chip-avatar { flex:none; line-height:0; display:inline-block; vertical-align:middle; margin-right:4px; }
            .sp-seat-name { width:100%; }
            .sp-seat-name { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis; overflow-wrap:anywhere; line-height:1.2; min-width:0; }
            .sp-sidebar { width:220px; flex-shrink:0; border-left:1px solid var(--border); padding:12px; overflow-y:auto; }
            .sp-chip { background:var(--bg); border:1px solid var(--border); padding:8px 10px; border-radius:6px; font-size:12px; margin-bottom:6px; cursor:grab; box-shadow:0 2px 4px rgba(0,0,0,0.06); word-break:break-word; }
            .sp-chip.frontrow { border-left:3px solid #fdcb6e; }
            .sp-left-col { width:210px; flex-shrink:0; border-right:1px solid var(--border); padding:14px 12px; overflow-y:auto; display:flex; flex-direction:column; gap:6px; }
            .sp-section-label { font-size:11px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.4px; margin:14px 0 2px; }
            .sp-section-label:first-child { margin-top:0; }
            .sp-left-btn { width:100%; padding:8px 10px; font-size:12px; text-align:left; box-sizing:border-box; }
            .sp-left-select { width:100%; padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--ink); font-size:12px; box-sizing:border-box; }
            .sp-checkbox-row { display:flex; align-items:center; gap:6px; font-size:12px; padding:4px 0; }
            .sp-front-marker { position:sticky; top:0; left:0; width:100%; text-align:center; padding:6px; font-size:11px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:var(--muted); background:linear-gradient(to bottom, var(--bg) 60%, transparent); z-index:5; pointer-events:none; }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.75); z-index: 100002; display:flex; justify-content:center; align-items:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background: var(--surface); border-radius: 12px; width: 96vw; height: 92vh; max-width: 1500px; display:flex; flex-direction:column; overflow:hidden; box-shadow: var(--shadow-hover);';

    modal.appendChild(box);
    document.body.appendChild(modal);

    let dragStudentId = null, dragFromTableId = null, dragFromSeatIdx = null;
    let currentTool = 'select';

    function persist() { ClassesStore.saveAll(allClasses); }

    function newTable(capacity) {
        const cols = spCols(capacity);
        const regularCount = plan.tables.filter(t => !t.isTeacherDesk).length;
        const offset = (regularCount % 6) * (SP_SEAT_W + 15);
        plan.tables.push({
            id: ClassesStore.newId('table'),
            x: spSnap(40 + offset), y: spSnap(70),
            capacity, cols,
            seats: Array(capacity).fill(null)
        });
        persist();
        render();
    }

    function addTeacherDesk() {
        if (plan.tables.some(t => t.isTeacherDesk)) {
            if (typeof showToast === 'function') showToast("Il y a déjà un bureau du prof — déplace-le si besoin.");
            return;
        }
        plan.tables.push({ id: ClassesStore.newId('desk'), x: spSnap(700), y: spSnap(15), isTeacherDesk: true, seats: [] });
        persist();
        render();
    }

    function resizeTable(tableId, delta) {
        const t = plan.tables.find(tt => tt.id === tableId);
        if (!t || t.isTeacherDesk) return;
        const newCapacity = Math.max(1, Math.min(12, t.capacity + delta));
        if (newCapacity === t.capacity) return;

        if (newCapacity < t.capacity) {
            const removed = t.seats.slice(newCapacity).filter(Boolean);
            t.seats = t.seats.slice(0, newCapacity);
            if (removed.length > 0 && typeof showToast === 'function') showToast(`${removed.length} élève(s) libéré(s) de la table`);
        } else {
            t.seats = t.seats.concat(Array(newCapacity - t.capacity).fill(null));
        }
        t.capacity = newCapacity;
        t.cols = spCols(newCapacity);
        persist();
        render();
    }

    // La largeur des places de CE plan : celle qui a été calculée pour lui,
    // sinon la valeur d'origine (les plans déjà enregistrés ne bougent pas).
    function largeurPlace() {
        return plan.seatW || SP_SEAT_W;
    }

    // Répartir la place disponible : on fixe un écart raisonnable entre les
    // tables, et tout le reste va DANS les tables. Un nom entier vaut mieux
    // qu'un grand vide entre deux tables.
    function calculerLargeurPlace(tmplCols, colsParTable, largeurDispo) {
        const ECART = 26;
        const partTable = (largeurDispo - (tmplCols - 1) * ECART) / tmplCols;
        const parPlace = (partTable - 12) / colsParTable;
        return Math.round(Math.max(SP_SEAT_MIN, Math.min(SP_SEAT_MAX, parPlace)));
    }

    function applyTemplate(idx) {
        const tmpl = SEATING_TEMPLATES[idx];
        if (!tmpl) return;

        const desk = plan.tables.find(t => t.isTeacherDesk);
        plan.tables = desk ? [desk] : [];

        const cols = spCols(tmpl.capacity);
        const rowsInTable = Math.ceil(tmpl.capacity / cols);

        // ✅ Étale la grille sur tout l'espace visible du canevas, pas juste un coin
        const wrapEl = box.querySelector('.sp-canvas-wrap');
        const startX = 30, startY = 60;
        const largeurVue = Math.max(320, wrapEl.clientWidth - startX * 2);
        plan.seatW = calculerLargeurPlace(tmpl.cols, cols, largeurVue);

        const tableW = cols * plan.seatW + 12;
        const tableH = rowsInTable * (SP_SEAT_H + 4) + 24;
        const availW = Math.max(largeurVue, tableW);
        const availH = Math.max(wrapEl.clientHeight - startY - 30, tableH);

        const stepX = tmpl.cols > 1 ? Math.max(tableW + 20, (availW - tableW) / (tmpl.cols - 1)) : 0;
        const stepY = tmpl.rows > 1 ? Math.max(tableH + 30, (availH - tableH) / (tmpl.rows - 1)) : 0;

        for (let r = 0; r < tmpl.rows; r++) {
            for (let c = 0; c < tmpl.cols; c++) {
                plan.tables.push({
                    id: ClassesStore.newId('table'),
                    x: spSnap(startX + c * stepX),
                    y: spSnap(startY + r * stepY),
                    capacity: tmpl.capacity, cols,
                    seats: Array(tmpl.capacity).fill(null)
                });
            }
        }
        persist();
        render();
        if (typeof showToast === 'function') showToast(`✅ Modèle appliqué (${tmpl.rows * tmpl.cols} tables)`);
    }

    function resetPlan() {
        openConfirmModal(
            "Réinitialiser le plan",
            "Supprimer toutes les tables et îlots du plan de classe ? (le bureau du prof est conservé)",
            true,
            () => {
                const desk = plan.tables.find(t => t.isTeacherDesk);
                plan.tables = desk ? [desk] : [];
                persist();
                render();
                if (typeof showToast === 'function') showToast("🔄 Plan réinitialisé");
            }
        );
    }

    function spRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }


    // Dessine le plan (indépendamment du zoom/scroll du modal) sur un <canvas> offscreen,
    // utilisé à la fois pour l'export PDF et pour le tampon sur le tableau.
    function renderSeatingPlanToCanvas() {
        const tables = plan.tables;
        if (tables.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        tables.forEach(t => {
            const w = t.isTeacherDesk ? 150 : (t.cols * largeurPlace() + 12);
            const rows = t.isTeacherDesk ? 1 : Math.ceil(t.capacity / t.cols);
            const h = t.isTeacherDesk ? 50 : (rows * 46 + 26);
            minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
            maxX = Math.max(maxX, t.x + w); maxY = Math.max(maxY, t.y + h);
        });

        const PAD = 30, TITLE_H = 34, scale = 2;
        const contentW = maxX - minX, contentH = maxY - minY;

        const canvasEl = document.createElement('canvas');
        canvasEl.width = (contentW + PAD * 2) * scale;
        canvasEl.height = (contentH + PAD * 2 + TITLE_H) * scale;
        const ctx = canvasEl.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, contentW + PAD * 2, contentH + PAD * 2 + TITLE_H);

        ctx.fillStyle = '#2d3436';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Plan de classe — ${classObj.name}`, PAD, 24);

        tables.forEach(t => {
            const tx = t.x - minX + PAD;
            const ty = t.y - minY + PAD + TITLE_H;

            if (t.isTeacherDesk) {
                ctx.fillStyle = 'rgba(108,92,231,0.12)';
                ctx.strokeStyle = '#6c5ce7';
                ctx.lineWidth = 2;
                spRoundRect(ctx, tx, ty, 150, 50, 8); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#2d3436';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🧑‍🏫 Bureau du prof', tx + 75, ty + 30);
                return;
            }

            const rows = Math.ceil(t.capacity / t.cols);
            const w = t.cols * largeurPlace() + 12;
            const h = rows * (SP_SEAT_H + 6) + 26;

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#636e72';
            ctx.lineWidth = 2;
            spRoundRect(ctx, tx, ty, w, h, 8); ctx.fill(); ctx.stroke();

            t.seats.forEach((sid, idx) => {
                const col = idx % t.cols, row = Math.floor(idx / t.cols);
                const sx = tx + 6 + col * largeurPlace();
                const sy = ty + 20 + row * 46;
                const sw = largeurPlace() - 6, sh = SP_SEAT_H;

                ctx.fillStyle = sid ? '#e8e4fd' : '#f1f2f6';
                ctx.strokeStyle = sid ? '#6c5ce7' : '#b2bec3';
                ctx.lineWidth = 1;
                ctx.setLineDash(sid ? [] : [3, 2]);
                spRoundRect(ctx, sx, sy, sw, sh, 5); ctx.fill(); ctx.stroke();
                ctx.setLineDash([]);

                if (sid) {
                    ctx.fillStyle = '#2d3436';
                    ctx.font = '600 10px sans-serif';
                    ctx.textAlign = 'center';
                    spWrapText(ctx, (isFrontRow(sid) ? '⭐ ' : '') + studentName(sid), sx + sw / 2, sy + sh / 2, sw - 4, 12);
                }
            });
        });

        return canvasEl;
    }

    function exportToPdf() {
        const canvasEl = renderSeatingPlanToCanvas();
        if (!canvasEl) { if (typeof showToast === 'function') showToast('Ajoute au moins une table avant d\'exporter.'); return; }
        try {
            if (!window.jspdf || !window.jspdf.jsPDF) { if (typeof showToast === 'function') showToast('❌ Moteur PDF non chargé.'); return; }
            const imgData = canvasEl.toDataURL('image/png');
            const w = canvasEl.width, h = canvasEl.height;
            const doc = new window.jspdf.jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h] });
            doc.addImage(imgData, 'PNG', 0, 0, w, h);
            doc.save(`Plan_de_classe_${(classObj.name || 'classe').replace(/[^a-z0-9]+/gi, '_')}.pdf`);
            if (typeof showToast === 'function') showToast('📄 PDF exporté !');
        } catch (e) {
            console.error('Erreur export PDF plan de classe', e);
            if (typeof showToast === 'function') showToast('❌ Erreur export PDF');
        }
    }

    function stampToBoard() {
        const canvasEl = renderSeatingPlanToCanvas();
        if (!canvasEl) { if (typeof showToast === 'function') showToast('Ajoute au moins une table avant de tamponner.'); return; }

        const dataUrl = canvasEl.toDataURL('image/png');
        let w = canvasEl.width / 2, h = canvasEl.height / 2; // /2 : compense le scale=2 utilisé pour la netteté
        if (w > 900) { h *= 900 / w; w = 900; }

        const curZoom = (typeof zoom !== 'undefined' && zoom) ? zoom : 1;
        const curPanX = typeof panX !== 'undefined' ? panX : 0;
        const curPanY = typeof panY !== 'undefined' ? panY : 0;
        const lx = (window.innerWidth / 2 - curPanX) / curZoom;
        const ly = (window.innerHeight / 2 - curPanY) / curZoom;

        const img = new Image();
        img.onload = () => {
            images.push({
                id: nextId++, x: lx - w / 2, y: ly - h / 2, w, h,
                cx: 0, cy: 0, cw: img.width, ch: img.height,
                src: dataUrl, fileName: `Plan_${classObj.name}.png`, z: globalZ++,
                // ✅ Permet le double-clic sur l'image pour rouvrir l'éditeur de plan de cette classe
                pluginData: { id: 'seatingPlan', classId: classObj.id }
            });
            imageCache[dataUrl] = img;
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof showToast === 'function') showToast('🖼️ Plan tamponné ! Double-clic dessus pour le rééditer.');
            // ✅ Fermer l'éditeur ET la fenêtre "Mes classes" ouverte derrière
            document.querySelectorAll('.modal-backdrop').forEach(m => m.remove());
        };
        img.src = dataUrl;
    }

    function getAssignedIds() {
        const set = new Set();
        plan.tables.forEach(t => t.seats.forEach(sid => { if (sid) set.add(sid); }));
        return set;
    }

    function getUnassignedStudents() {
        const assigned = getAssignedIds();
        return (classObj.students || []).filter(s => !assigned.has(s.id));
    }

    // Position approximative (en pixels) de chaque siège, calculée à partir de la table
    // et de la position du siège dans sa grille interne (col/row selon t.cols).
    function getSeatPositions() {
        const list = [];
        plan.tables.forEach(t => {
            if (t.isTeacherDesk) return;
            t.seats.forEach((_, idx) => {
                const col = idx % t.cols;
                const row = Math.floor(idx / t.cols);
                list.push({ tableId: t.id, seatIdx: idx, x: t.x + col * largeurPlace(), y: t.y + row * (SP_SEAT_H + 6) });
            });
        });
        return list;
    }

    // Regroupe les sièges par "lignes" selon primaryAxis (avec tolérance), trie les lignes,
    // puis trie les sièges de chaque ligne selon secondaryAxis.
    function clusterAndOrder(seatPositions, primaryAxis, secondaryAxis) {
        const sorted = [...seatPositions].sort((a, b) => a[primaryAxis] - b[primaryAxis]);
        const groups = [];
        sorted.forEach(s => {
            let g = groups.find(gr => Math.abs(gr.val - s[primaryAxis]) < 40);
            if (!g) { g = { val: s[primaryAxis], items: [] }; groups.push(g); }
            g.items.push(s);
        });
        groups.sort((a, b) => a.val - b.val);
        const ordered = [];
        groups.forEach(g => {
            g.items.sort((a, b) => a[secondaryAxis] - b[secondaryAxis]);
            ordered.push(...g.items);
        });
        return ordered;
    }

    // direction 'row' : rangée par rangée, du plus proche du tableau au plus loin (gauche → droite dans chaque rangée)
    // direction 'col' : colonne par colonne, de la gauche vers la droite (devant → derrière dans chaque colonne)
    function computeSeatOrder(direction) {
        const seatPositions = getSeatPositions();
        return direction === 'col'
            ? clusterAndOrder(seatPositions, 'x', 'y')
            : clusterAndOrder(seatPositions, 'y', 'x');
    }

    function autoFill(order, respectFrontRow, direction) {
        plan.tables.forEach(t => t.seats = t.seats.map(() => null));

        let roster = [...(classObj.students || [])];
        if (order === 'alpha') roster.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        else if (order === 'random') {
            for (let i = roster.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [roster[i], roster[j]] = [roster[j], roster[i]];
            }
        }

        const ordered = respectFrontRow
            ? [...roster.filter(s => s.frontRow), ...roster.filter(s => !s.frontRow)]
            : roster;

        const slots = computeSeatOrder(direction);
        let placed = 0;
        for (let i = 0; i < slots.length && i < ordered.length; i++) {
            const table = plan.tables.find(t => t.id === slots[i].tableId);
            table.seats[slots[i].seatIdx] = ordered[i].id;
            placed++;
        }

        persist();
        render();

        const leftover = ordered.length - placed;
        if (typeof showToast === 'function') {
            showToast(leftover > 0
                ? `⚠️ ${placed} placé(s), ${leftover} sans place (pas assez de sièges)`
                : `✅ ${placed} élève(s) placé(s)`);
        }
    }

    function studentName(id) {
        const s = (classObj.students || []).find(st => st.id === id);
        return s ? s.name : '?';
    }
    function isFrontRow(id) {
        const s = (classObj.students || []).find(st => st.id === id);
        return !!(s && s.frontRow);
    }
    // Sur un plan bien rempli, le petit monstre se repère plus vite qu'un nom
    function studentAvatar(id, taille) {
        const s = (classObj.students || []).find(st => st.id === id);
        return s ? AvatarsEleves.svg(s, taille) : '';
    }

    function render() {
        const unassigned = getUnassignedStudents();

        const tablesHtml = plan.tables.map(t => {
            if (t.isTeacherDesk) {
                return `
                    <div class="sp-table sp-teacher-desk" data-table="${t.id}" style="left:${t.x}px; top:${t.y}px; width:150px;">
                        <div class="sp-table-handle" data-table="${t.id}">
                            <span></span>
                            <span class="sp-table-del" data-table="${t.id}" title="Supprimer">🗑️</span>
                        </div>
                        <div style="padding:14px 10px; text-align:center; font-size:12px; font-weight:700; color:var(--ink);">🧑‍🏫 Bureau du prof</div>
                    </div>
                `;
            }
            const seatsHtml = t.seats.map((sid, idx) => sid
                ? `<div class="sp-seat filled" draggable="true" data-table="${t.id}" data-seat="${idx}" title="${studentName(sid)}"><span class="sp-seat-avatar">${studentAvatar(sid, 18)}</span><span class="sp-seat-name">${isFrontRow(sid) ? '⭐ ' : ''}${studentName(sid)}</span></div>`
                : `<div class="sp-seat" data-table="${t.id}" data-seat="${idx}">+</div>`
            ).join('');
            return `
                <div class="sp-table" data-table="${t.id}" style="left:${t.x}px; top:${t.y}px; width:${t.cols * largeurPlace() + 12}px;">
                    <div class="sp-table-handle" data-table="${t.id}">
                        <span class="sp-table-resize-group">
                            <span class="sp-table-resize" data-table="${t.id}" data-delta="-1" title="Retirer une place">−</span>
                            <span class="sp-table-cap">${t.capacity}</span>
                            <span class="sp-table-resize" data-table="${t.id}" data-delta="1" title="Ajouter une place">+</span>
                        </span>
                        <span class="sp-table-del" data-table="${t.id}" title="Supprimer la table">🗑️</span>
                    </div>
                    <div class="sp-seats-grid" style="grid-template-columns: repeat(${t.cols}, 1fr);">${seatsHtml}</div>
                </div>
            `;
        }).join('');

        const sidebarHtml = unassigned.length === 0
            ? `<div style="font-size:12px; color:var(--muted); text-align:center; margin-top:20px;">Tous les élèves sont placés 🎉</div>`
            : unassigned.map(s => `<div class="sp-chip ${s.frontRow ? 'frontrow' : ''}" draggable="true" data-student="${s.id}"><span class="sp-chip-avatar">${AvatarsEleves.svg(s, 20)}</span>${s.frontRow ? '⭐ ' : ''}${s.name}</div>`).join('');

        const templateOptions = SEATING_TEMPLATES.map((t, i) => `<option value="${i}">${t.label}</option>`).join('');

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                <h3 style="margin:0; color:var(--accent);">🪑 Plan de classe — ${classObj.name}</h3>
                <button id="sp-close" style="border:none; background:none; font-size:22px; cursor:pointer; color:var(--muted);">&times;</button>
            </div>
            <div style="display:flex; flex:1; min-height:0;">
                <div class="sp-left-col">
                    <label class="sp-section-label" style="margin-top:0;">Outil</label>
                    <div style="display:flex; gap:4px;">
                        <button class="btn-action ${currentTool === 'select' ? 'primary' : 'secondary'} sp-tool-btn" data-tool="select">🖱️ Sélection</button>
                        <button class="btn-action ${currentTool === 'hand' ? 'primary' : 'secondary'} sp-tool-btn" data-tool="hand">🖐️ Main</button>
                    </div>

                    <label class="sp-section-label">Tables & îlots</label>
                    <button data-add="1" class="btn-action secondary sp-left-btn">+ Table simple</button>
                    <button data-add="2" class="btn-action secondary sp-left-btn">+ Table double</button>
                    <button data-add="4" class="btn-action secondary sp-left-btn">+ Îlot (4)</button>
                    <button data-add="6" class="btn-action secondary sp-left-btn">+ Îlot (6)</button>
                    <button id="sp-add-desk" class="btn-action secondary sp-left-btn">+ 🧑‍🏫 Bureau du prof</button>

                    <label class="sp-section-label">Modèle de classe</label>
                    <select id="sp-template" class="sp-left-select">
                        <option value="">Choisir...</option>
                        ${templateOptions}
                    </select>
                    <button id="sp-apply-template" class="btn-action primary sp-left-btn">Appliquer</button>
                    <button id="sp-reset-plan" class="btn-action secondary sp-left-btn" style="color:#d63031;">🔄 Réinitialiser</button>

                    <label class="sp-section-label">Remplissage auto</label>
                    <select id="sp-order" class="sp-left-select">
                        <option value="alpha" selected>Ordre alphabétique</option>
                        <option value="list">Ordre de la liste</option>
                        <option value="random">Aléatoire</option>
                    </select>
                    <select id="sp-direction" class="sp-left-select" style="margin-top:6px;">
                        <option value="row" selected>Par rangée (⟶)</option>
                        <option value="col">Par colonne (⟱)</option>
                    </select>
                    <label class="sp-checkbox-row">
                        <input type="checkbox" id="sp-respect-front" checked> Priorité 1er rang ⭐
                    </label>
                    <button id="sp-autofill" class="btn-action primary sp-left-btn">🔀 Remplir auto</button>
                    <button id="sp-clear-seats" class="btn-action secondary sp-left-btn">Vider les places</button>

                    <label class="sp-section-label">Export</label>
                    <button id="sp-export-pdf" class="btn-action secondary sp-left-btn">📄 Export PDF</button>
                    <button id="sp-stamp-board" class="btn-action secondary sp-left-btn">🖼️ Tamponner sur le tableau</button>
                </div>
                <div class="sp-canvas-wrap">
                    <div class="sp-front-marker">⬆️ Tableau / avant de la classe</div>
                    <div class="sp-canvas" id="sp-canvas">${tablesHtml}</div>
                </div>
                <div class="sp-sidebar">
                    <label style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; display:block; margin-bottom:8px;">Non placés (${unassigned.length})</label>
                    ${sidebarHtml}
                </div>
            </div>
        `;

        attachEvents();
    }

    function attachEvents() {
        box.querySelector('#sp-close').onclick = () => document.body.removeChild(modal);

        box.querySelectorAll('[data-add]').forEach(btn => {
            btn.onclick = () => newTable(parseInt(btn.dataset.add));
        });

        box.querySelector('#sp-add-desk').onclick = addTeacherDesk;

        box.querySelector('#sp-apply-template').onclick = () => {
            const val = box.querySelector('#sp-template').value;
            if (val === '') { if (typeof showToast === 'function') showToast('Choisis un modèle dans la liste.'); return; }
            applyTemplate(parseInt(val));
        };

        box.querySelector('#sp-reset-plan').onclick = resetPlan;

        box.querySelector('#sp-export-pdf').onclick = exportToPdf;
        box.querySelector('#sp-stamp-board').onclick = stampToBoard;

        const canvasWrapEl = box.querySelector('.sp-canvas-wrap');
        box.querySelectorAll('.sp-tool-btn').forEach(btn => {
            btn.onclick = () => {
                currentTool = btn.dataset.tool;
                box.querySelectorAll('.sp-tool-btn').forEach(b => b.className = 'btn-action secondary sp-tool-btn');
                btn.className = 'btn-action primary sp-tool-btn';
                canvasWrapEl.style.cursor = currentTool === 'hand' ? 'grab' : 'default';
            };
        });
        canvasWrapEl.style.cursor = currentTool === 'hand' ? 'grab' : 'default';

        // Outil Main : glisser sur le canevas pour le faire défiler
        canvasWrapEl.addEventListener('mousedown', (e) => {
            if (currentTool !== 'hand' || e.target.closest('.sp-table')) return;
            e.preventDefault();
            const startX = e.clientX, startY = e.clientY;
            const scrollLeft0 = canvasWrapEl.scrollLeft, scrollTop0 = canvasWrapEl.scrollTop;
            canvasWrapEl.style.cursor = 'grabbing';

            function onMove(ev) {
                canvasWrapEl.scrollLeft = scrollLeft0 - (ev.clientX - startX);
                canvasWrapEl.scrollTop = scrollTop0 - (ev.clientY - startY);
            }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                canvasWrapEl.style.cursor = 'grab';
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        box.querySelectorAll('.sp-table-resize').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                resizeTable(el.dataset.table, parseInt(el.dataset.delta));
            };
        });

        box.querySelector('#sp-autofill').onclick = () => {
            const order = box.querySelector('#sp-order').value;
            const direction = box.querySelector('#sp-direction').value;
            const respect = box.querySelector('#sp-respect-front').checked;
            autoFill(order, respect, direction);
        };

        box.querySelector('#sp-clear-seats').onclick = () => {
            plan.tables.forEach(t => t.seats = t.seats.map(() => null));
            persist();
            render();
        };

        box.querySelectorAll('.sp-table-del').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                plan.tables = plan.tables.filter(t => t.id !== el.dataset.table);
                persist();
                render();
            };
        });

        // Déplacement des tables à la souris, aligné sur la grille
        const canvas = box.querySelector('#sp-canvas');
        box.querySelectorAll('.sp-table-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                if (currentTool !== 'select') return;
                if (e.target.classList.contains('sp-table-del') || e.target.classList.contains('sp-table-resize')) return;
                const table = plan.tables.find(t => t.id === handle.dataset.table);
                const canvasRect = canvas.getBoundingClientRect();
                const startX = e.clientX - canvasRect.left - table.x;
                const startY = e.clientY - canvasRect.top - table.y;
                const tableEl = handle.closest('.sp-table');

                function onMove(ev) {
                    table.x = Math.max(0, spSnap(ev.clientX - canvasRect.left - startX));
                    table.y = Math.max(0, spSnap(ev.clientY - canvasRect.top - startY));
                    tableEl.style.left = table.x + 'px';
                    tableEl.style.top = table.y + 'px';
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    persist();
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });

        // Glisser-déposer des élèves (liste <-> siège, siège <-> siège)
        box.querySelectorAll('.sp-chip').forEach(chip => {
            chip.addEventListener('dragstart', () => {
                dragStudentId = chip.dataset.student; dragFromTableId = null; dragFromSeatIdx = null;
            });
        });

        box.querySelectorAll('.sp-seat.filled').forEach(seat => {
            seat.addEventListener('dragstart', () => {
                dragStudentId = null;
                dragFromTableId = seat.dataset.table;
                dragFromSeatIdx = parseInt(seat.dataset.seat);
            });
        });

        box.querySelectorAll('.sp-seat').forEach(seat => {
            seat.addEventListener('dragover', (e) => { e.preventDefault(); seat.classList.add('dragover'); });
            seat.addEventListener('dragleave', () => seat.classList.remove('dragover'));
            seat.addEventListener('drop', (e) => {
                e.preventDefault();
                seat.classList.remove('dragover');
                const targetTable = plan.tables.find(t => t.id === seat.dataset.table);
                const targetSeatIdx = parseInt(seat.dataset.seat);

                if (dragFromTableId !== null) {
                    const fromTable = plan.tables.find(t => t.id === dragFromTableId);
                    const movingId = fromTable.seats[dragFromSeatIdx];
                    const targetCurrent = targetTable.seats[targetSeatIdx];
                    targetTable.seats[targetSeatIdx] = movingId;
                    fromTable.seats[dragFromSeatIdx] = targetCurrent;
                } else if (dragStudentId) {
                    // L'occupant éventuel du siège cible redevient automatiquement "non placé" au ré-affichage
                    targetTable.seats[targetSeatIdx] = dragStudentId;
                }
                dragStudentId = null; dragFromTableId = null; dragFromSeatIdx = null;
                persist();
                render();
            });
        });

        // Déposer un élève sur la barre latérale = le retirer de son siège
        const sidebar = box.querySelector('.sp-sidebar');
        sidebar.addEventListener('dragover', (e) => e.preventDefault());
        sidebar.addEventListener('drop', (e) => {
            e.preventDefault();
            if (dragFromTableId !== null) {
                const fromTable = plan.tables.find(t => t.id === dragFromTableId);
                fromTable.seats[dragFromSeatIdx] = null;
                dragFromTableId = null; dragFromSeatIdx = null;
                persist();
                render();
            }
        });
    }

    render();
}

// ==============================================================================
// MODULE : TRIEUR DE DIAPOSITIVES (MINIATURES LATÉRALES EN TEMPS RÉEL)
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Création de l'interface du Tiroir
    const drawer = document.createElement('div');
    drawer.id = 'thumbnail-drawer';
    drawer.style.cssText = `
        position: fixed; left: -190px; top: 70px; bottom: 20px; width: 170px;
        background: var(--panel-bg, #ffffff); border: 1px solid #dfe6e9; border-left: none;
        border-radius: 0 12px 12px 0; box-shadow: 4px 4px 15px rgba(0,0,0,0.08); z-index: 9999;
        transition: left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
        overflow-y: auto; display: flex; flex-direction: column;
        padding: 15px 10px; gap: 12px;
    `;
    document.body.appendChild(drawer);

    let isDrawerOpen = false;

    // 2. Fonction de Capture (Optimisée)
    window.capturePageThumb = function () {
        try {
            const tCan = document.createElement('canvas');
            const scale = 160 / canvas.width;
            tCan.width = 160;
            tCan.height = canvas.height * scale;
            const tCtx = tCan.getContext('2d');

            tCtx.fillStyle = (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#1e272e' : '#ffffff';
            tCtx.fillRect(0, 0, tCan.width, tCan.height);

            tCtx.scale(scale, scale);
            tCtx.drawImage(canvas, 0, 0);
            return tCan.toDataURL('image/jpeg', 0.5);
        } catch (e) { return null; }
    };

    // 🌟 3. LE MOTEUR TEMPS RÉEL (SYNC) 🌟
    window.syncActiveThumbnail = function () {
        if (currentPageIndex < 0 || !pages[currentPageIndex]) return;
        const dataUrl = capturePageThumb();
        if (dataUrl) {
            pages[currentPageIndex].thumbnail = dataUrl;
            // Si le tiroir est ouvert, on met à jour l'image en direct !
            const activeImg = document.getElementById('active-thumb-img');
            if (activeImg) activeImg.src = dataUrl;
        }
    };

    // On pirate gentiment ta fonction saveState pour qu'elle prenne une photo à chaque action !
    if (typeof window.saveState === 'function' && !window.isSaveStateThumbHooked) {
        const originalSaveState = window.saveState;
        window.saveState = function () {
            originalSaveState();
            // On attend 50ms que le canvas ait fini de se dessiner avant de flasher
            setTimeout(window.syncActiveThumbnail, 50);
        };
        window.isSaveStateThumbHooked = true;
    }

    // 4. Rendre le texte "1/4" cliquable pour ouvrir le tiroir
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
        indicator.style.cursor = 'pointer';
        indicator.title = "Ouvrir le trieur de diapositives";
        indicator.style.padding = '4px 10px';
        indicator.style.borderRadius = '6px';
        indicator.style.transition = 'background 0.2s';

        indicator.onmouseenter = () => indicator.style.background = (typeof isDarkMode !== 'undefined' && isDarkMode) ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
        indicator.onmouseleave = () => indicator.style.background = 'transparent';

        indicator.addEventListener('click', () => {
            isDrawerOpen = !isDrawerOpen;

            if (typeof isDarkMode !== 'undefined' && isDarkMode) {
                drawer.style.background = '#2d3436'; drawer.style.borderColor = '#636e72';
            } else {
                drawer.style.background = '#ffffff'; drawer.style.borderColor = '#dfe6e9';
            }

            if (isDrawerOpen) {
                // On s'assure que la miniature actuelle est à jour avant d'ouvrir
                setTimeout(() => {
                    window.syncActiveThumbnail();
                    renderThumbnails();
                    drawer.style.left = '0px';
                }, 50);
            } else {
                drawer.style.left = '-190px';
            }
        });
    }

    // Tirer une vignette pour changer l'ordre des pages. Le repère bleu montre
    // où la page atterrira ; relâcher hors du tiroir annule.
    function demarrerGlissementVignette(e, box, depuis) {
        const depart = { x: e.clientX, y: e.clientY };
        let repere = null, versIndex = null;

        const vignettes = () => Array.from(drawer.children)
            .filter(el => el.dataset && el.dataset.index !== undefined);

        const placerRepere = (y) => {
            const boites = vignettes();
            versIndex = boites.length;
            for (let i = 0; i < boites.length; i++) {
                const r = boites[i].getBoundingClientRect();
                if (y < r.top + r.height / 2) { versIndex = i; break; }
            }
            const cible = boites[versIndex];
            if (cible) drawer.insertBefore(repere, cible);
            else drawer.insertBefore(repere, box.nextSibling);
        };

        const bouger = (ev) => {
            if (!repere) {
                if (Math.abs(ev.clientY - depart.y) < 6 && Math.abs(ev.clientX - depart.x) < 6) return;
                repere = document.createElement('div');
                repere.className = 'vignette-repere';
                box.style.opacity = '0.35';
                box.dataset.aGlisse = '1';
            }
            placerRepere(ev.clientY);
        };

        const finir = (ev) => {
            window.removeEventListener('pointermove', bouger);
            window.removeEventListener('pointerup', finir);
            window.removeEventListener('pointercancel', finir);
            if (!repere) return;                       // simple clic
            repere.remove();
            box.style.opacity = '';

            const dansLeTiroir = drawer.getBoundingClientRect();
            const dehors = ev.clientX < dansLeTiroir.left - 40 || ev.clientX > dansLeTiroir.right + 40;
            let vers = versIndex;
            if (dehors || vers === null) { renderThumbnails(); return; }
            if (vers > depuis) vers -= 1;              // la page part de sa place avant d'arriver
            if (vers === depuis) { renderThumbnails(); return; }

            // La page courante doit rester la page courante, où qu'elle aille.
            const courante = pages[currentPageIndex];
            pages[currentPageIndex].thumbnail = capturePageThumb();
            const [deplacee] = pages.splice(depuis, 1);
            pages.splice(vers, 0, deplacee);
            currentPageIndex = pages.indexOf(courante);

            renderThumbnails();
            setTimeout(window.syncActiveThumbnail, 100);
            if (typeof saveAppLocal === 'function') saveAppLocal();
            if (typeof majCompteurPages === 'function') majCompteurPages();
            if (typeof showToast === 'function') {
                showToast('Page ' + (depuis + 1) + ' déplacée en ' + (vers + 1));
            }
        };

        window.addEventListener('pointermove', bouger);
        window.addEventListener('pointerup', finir);
        window.addEventListener('pointercancel', finir);
    }

    // 5. Rendu des miniatures
    function renderThumbnails() {
        drawer.innerHTML = '';

        const title = document.createElement('div');
        title.innerText = "Diapositives";
        title.style.cssText = "font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px;";
        title.style.color = (typeof isDarkMode !== 'undefined' && isDarkMode) ? '#b2bec3' : '#636e72';
        drawer.appendChild(title);

        pages.forEach((p, index) => {
            const box = document.createElement('div');
            const isActive = (index === currentPageIndex);

            box.style.cssText = `
                width: 100%; aspect-ratio: 16/9; background: #f1f2f6; 
                border: 3px solid ${isActive ? '#0984e3' : 'transparent'};
                border-radius: 8px; overflow: hidden; cursor: pointer; position: relative;
                flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transition: transform 0.15s ease;
            `;

            if (!isActive) {
                box.onmouseenter = () => box.style.transform = 'scale(1.04)';
                box.onmouseleave = () => box.style.transform = 'scale(1)';
            }

            // Image de la miniature (Gère le cas vide)
            const img = document.createElement('img');
            // Si pas d'image, pixel transparent en attendant le sync
            img.src = p.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            if (isActive) img.id = 'active-thumb-img'; // L'identifiant magique pour le Temps Réel
            img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain'; img.style.backgroundColor = '#ffffff';
            box.appendChild(img);

            const num = document.createElement('div');
            num.innerText = index + 1;
            num.style.cssText = `
                position: absolute; bottom: 4px; right: 4px; background: ${isActive ? '#0984e3' : 'rgba(0,0,0,0.6)'}; 
                color: white; font-size: 11px; font-weight: bold; padding: 2px 7px; border-radius: 10px;
            `;
            box.appendChild(num);

            const delBtn = document.createElement('div');
            delBtn.innerHTML = '🗑️';
            delBtn.title = "Supprimer cette page";
            delBtn.style.cssText = `
                position: absolute; top: 4px; right: 4px; background: rgba(214, 48, 49, 0.9);
                color: white; font-size: 14px; width: 24px; height: 24px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; opacity: 0; transition: all 0.2s; cursor: pointer;
            `;
            delBtn.addEventListener('mouseenter', () => delBtn.style.background = '#d63031');
            delBtn.addEventListener('mouseleave', () => delBtn.style.background = 'rgba(214, 48, 49, 0.9)');
            box.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
            box.addEventListener('mouseleave', () => delBtn.style.opacity = '0');

            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (pages.length <= 1) return showToast("Impossible de supprimer la dernière page.");

                openConfirmModal("Supprimer", `Supprimer la diapositive ${index + 1} ?`, true, () => {
                    pages.splice(index, 1);
                    if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
                    loadPage(currentPageIndex);
                    renderThumbnails();
                    setTimeout(window.syncActiveThumbnail, 100);
                    if (typeof saveAppLocal === 'function') saveAppLocal();
                });
            };
            box.appendChild(delBtn);

            box.onclick = () => {
                if (box.dataset.aGlisse === '1') { delete box.dataset.aGlisse; return; }
                if (!isActive) {
                    pages[currentPageIndex].thumbnail = capturePageThumb();
                    loadPage(index);
                    renderThumbnails();
                    setTimeout(window.syncActiveThumbnail, 100);
                }
            };

            // On réordonne les pages en tirant leur vignette. Au pointeur, donc
            // au doigt comme à la souris : le glisser-déposer natif ne marche
            // pas sur une tablette.
            box.dataset.index = index;
            box.style.touchAction = 'none';
            box.addEventListener('pointerdown', (e) => {
                if (e.target === delBtn || (e.button !== undefined && e.button !== 0)) return;
                demarrerGlissementVignette(e, box, index);
            });

            drawer.appendChild(box);
        });

        const addBtn = document.createElement('div');
        addBtn.innerHTML = '+ Nouvelle';
        addBtn.style.cssText = `
            width: 100%; padding: 12px 0; background: rgba(9, 132, 227, 0.1); color: #0984e3;
            text-align: center; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: bold;
            flex-shrink: 0; transition: background 0.2s; border: 1px dashed #0984e3;
        `;
        addBtn.onmouseenter = () => addBtn.style.background = 'rgba(9, 132, 227, 0.2)';
        addBtn.onmouseleave = () => addBtn.style.background = 'rgba(9, 132, 227, 0.1)';
        addBtn.onclick = () => {
            pages[currentPageIndex].thumbnail = capturePageThumb();
            pages.push(createNewPage());
            loadPage(pages.length - 1);
            renderThumbnails();
            // On attend que la page soit prête puis on prend la photo de la page blanche
            setTimeout(window.syncActiveThumbnail, 100);
        };
        drawer.appendChild(addBtn);
    }

    // 6. Remplacement des boutons Précédent/Suivant
    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');

    if (prevBtn) {
        const newPrev = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrev, prevBtn);
        newPrev.addEventListener('click', () => {
            if (currentPageIndex > 0) {
                pages[currentPageIndex].thumbnail = capturePageThumb();
                loadPage(currentPageIndex - 1);
                if (isDrawerOpen) renderThumbnails();
                setTimeout(window.syncActiveThumbnail, 100);
            }
        });
    }

    if (nextBtn) {
        const newNext = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNext, nextBtn);
        newNext.addEventListener('click', () => {
            if (currentPageIndex < pages.length - 1) {
                pages[currentPageIndex].thumbnail = capturePageThumb();
                loadPage(currentPageIndex + 1);
                if (isDrawerOpen) renderThumbnails();
                setTimeout(window.syncActiveThumbnail, 100);
            }
        });
    }

    // 7. Auto-fermeture
    canvas.addEventListener('pointerdown', () => {
        if (isDrawerOpen) {
            isDrawerOpen = false;
            drawer.style.left = '-190px';
        }
    });
});

// ==============================================================================
// GESTION DU COPIER-COLLER D'IMAGES (CTRL+V) - MULTIPLE
// ==============================================================================
window.addEventListener('paste', (e) => {
    // 1. Sécurité : on ignore si on est en train de taper du texte
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // « e.originalEvent » vient de jQuery : sans presse-papiers, cette ligne
    // levait une exception et le collage échouait sans un mot.
    const dtSource = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || null;
    if (!dtSource) {
        if (typeof showToast === 'function') showToast("Le navigateur n'a pas transmis le presse-papiers");
        return;
    }
    const items = dtSource.items || [];
    let imagePasted = false;
    let pasteCount = 0; // Compteur pour décaler les images multiples

    // 2. On parcourt TOUT le presse-papier
    for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 3. Si l'élément actuel est une image
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault(); // On bloque le collage natif
            imagePasted = true;

            const blob = item.getAsFile();
            const reader = new FileReader();

            reader.onload = (event) => {
                const src = event.target.result;
                const img = new Image();

                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > 800) { h *= 800 / w; w = 800; }

                    // Petit décalage dynamique pour ne pas superposer parfaitement les images multiples
                    const offset = pasteCount * (30 / zoom);

                    const lx = (window.innerWidth / 2 - panX) / zoom + offset;
                    const ly = (window.innerHeight / 2 - panY) / zoom + offset;

                    images.push(poserEnRognage({
                        id: nextId++,
                        x: lx - w / 2, y: ly - h / 2,
                        w: w, h: h,
                        cx: 0, cy: 0, cw: img.width, ch: img.height,
                        src: src,
                        z: globalZ++
                    }));

                    imageCache[src] = img;
                    if (typeof saveState === 'function') saveState();
                    if (typeof draw === 'function') draw();

                    pasteCount++; // On incrémente pour décaler la prochaine image
                };
                img.src = src;
            };
            reader.readAsDataURL(blob);
        }
    }

    // 4. Pas d'image ? Alors c'est peut-être du texte : Word, LibreOffice, une
    // page web… Il devient un bloc de texte posé sur le tableau.
    if (!imagePasted) {
        const html = collageSansMiseEnForme ? '' : (dtSource.getData('text/html') || '');
        const brut = dtSource.getData('text/plain') || '';
        collageSansMiseEnForme = false;
        if ((html || brut) && collerTexteSurLeTableau(html, brut)) { e.preventDefault(); return; }
        // Ne rien faire du tout laissait croire à une panne. On dit ce qui
        // s'est passé, avec ce que le presse-papiers contenait vraiment.
        if (typeof showToast === 'function') {
            const formats = Array.from(dtSource.types || []).join(', ');
            showToast(formats
                ? "Rien à coller ici — le presse-papiers ne contient ni texte ni image (" + formats + ')'
                : 'Le presse-papiers est vide');
        }
        return;
    }

    if (typeof showToast === 'function') showToast("🖼️ Image(s) collée(s) !");
});

// ===================================================
// GESTION DE L'INTERLIGNE ET DE L'AIMANT 🧲 (BOUTONS +/-)
// ===================================================

function changeLineHeight(delta) {
    let currentLH = activeStyle.lineHeight || 29;
    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t && t.lineHeight) currentLH = t.lineHeight;
    }

    let newLH = currentLH + delta;
    if (newLH < 10) newLH = 10;
    if (newLH > 150) newLH = 150;

    activeStyle.lineHeight = newLH;
    const display = document.getElementById('text-lh-display');
    if (display) display.innerText = newLH;

    const applyToText = (t) => { t.lineHeight = newLH; };

    if (editingTextId) {
        const t = getObjectById('text', editingTextId);
        if (t) {
            applyToText(t);
            appliquerInterligneSaisie(newLH, (editingTextId && getObjectById('text', editingTextId) ? getObjectById('text', editingTextId).fontSize : activeStyle.fontSize));
        }
    } else if (selectedItems.length > 0) {
        selectedItems.forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if (obj && obj.type === 'text') applyToText(obj);
        });
    }
    updateWysiwygPosition();
    draw();
}

const btnLhUp = document.getElementById('btn-lh-up');
const btnLhDown = document.getElementById('btn-lh-down');
if (btnLhUp) btnLhUp.addEventListener('click', () => changeLineHeight(1));
if (btnLhDown) btnLhDown.addEventListener('click', () => changeLineHeight(-1));

const btnTextSnap = document.getElementById('btn-text-snap');
if (btnTextSnap) {
    btnTextSnap.addEventListener('click', () => {
        const bg = backgrounds[currentBgIndex];
        let spacing = null;

        // Tailles de base de tes grilles
        if (bg === 'seyes' || bg === 'seyes-marge' || bg === 'copie') spacing = 40;
        else if (bg === 'carreau') spacing = 30;
        else if (bg === 'millimetre') spacing = 10;

        if (spacing) {
            const display = document.getElementById('text-lh-display');
            if (display) display.innerText = spacing;
            activeStyle.lineHeight = spacing;

            const applyToText = (t) => {
                t.lineHeight = spacing;
                t.y = Math.round(t.y / spacing) * spacing; // Aligne parfaitement sur la ligne
            };

            if (editingTextId) {
                const t = getObjectById('text', editingTextId);
                if (t) applyToText(t);
                wysiwygText.style.top = (t.y * zoom + panY) + 'px';
                appliquerInterligneSaisie(spacing, (t && t.fontSize) || activeStyle.fontSize);
            } else if (selectedItems.length > 0) {
                selectedItems.forEach(item => {
                    const obj = getObjectById(item.type, item.id);
                    if (obj && obj.type === 'text') applyToText(obj);
                });
            }
            updateWysiwygPosition();
            draw();
            if (typeof showToast === 'function') showToast(`🧲 Interligne fixé à ${spacing}px`);
        } else {
            if (typeof showToast === 'function') showToast("Fond uni : Réglez l'interligne manuellement");
        }
    });
}

// Le bitmap doit suivre la taille RÉELLEMENT affichée du canvas (CSS 100vw/100vh),
// pas window.innerHeight : sur téléphone, la barre d'adresse rend 100vh ≠ innerHeight
// et tout le tableau était étiré → clics et rendu décalés partout.
function resizeBoardCanvas() {
    canvas.width = canvas.clientWidth || window.innerWidth;
    canvas.height = canvas.clientHeight || window.innerHeight;
    draw();
}
window.addEventListener('resize', resizeBoardCanvas);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeBoardCanvas);
resizeBoardCanvas();

// ==========================================
// EXPLORATEUR, SAUVEGARDES & METADONNEES
// ==========================================

// --- SYSTEM MODALS ---
let sysPromptCallback = null;
function openSysPromptModal(title, msg, defaultValue, callback) {
    document.getElementById('sys-prompt-title').innerText = title;
    document.getElementById('sys-prompt-msg').innerText = msg;
    const input = document.getElementById('sys-prompt-input');
    input.value = defaultValue || '';

    sysPromptCallback = callback;
    document.getElementById('sys-prompt-modal').style.display = 'flex';
    input.focus();
    input.select();
}
function closeSysPromptModal() { document.getElementById('sys-prompt-modal').style.display = 'none'; sysPromptCallback = null; }

document.addEventListener('DOMContentLoaded', () => {
    const pCancel = document.getElementById('btn-sys-prompt-cancel');
    if (pCancel) pCancel.onclick = () => { closeSysPromptModal(); };

    const pConfirm = document.getElementById('btn-sys-prompt-confirm');
    if (pConfirm) pConfirm.onclick = () => {
        const val = document.getElementById('sys-prompt-input').value;
        closeSysPromptModal();
        if (sysPromptCallback) sysPromptCallback(val);
    };

    const pInput = document.getElementById('sys-prompt-input');
    if (pInput) pInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') pConfirm.click();
        if (e.key === 'Escape') pCancel.click();
    });
});

// --- ONGLETS EXPLORATEUR ---
let currentExplorerTab = 'tableaux'; // tableaux ou interfaces
let selectedBoardId = null; // ID du tableau actuellement ouvert ou cliqué
let selectedInterfaceId = null;
let selectedFolderId = null;
let inlineCreationState = null;

function switchDrawerTab(tab) {
    currentExplorerTab = tab;
    selectedFolderId = null;
    inlineCreationState = null;
    document.getElementById('tab-tableaux').classList.toggle('active', tab === 'tableaux');
    document.getElementById('tab-interfaces').classList.toggle('active', tab === 'interfaces');

    if (tab === 'tableaux') {
        document.getElementById('file-tree-container').classList.remove('hidden');
        document.getElementById('interfaces-container').classList.remove('active');
        document.getElementById('trash-section').style.display = 'block';
    } else {
        document.getElementById('file-tree-container').classList.add('hidden');
        document.getElementById('interfaces-container').classList.add('active');
        document.getElementById('trash-section').style.display = 'none';
    }
    document.getElementById('explorer-search-bar').value = '';
    renderExplorerLists();
    renderTrashList();
}

function toggleExplorerSearch() {
    const sb = document.getElementById('explorer-search-bar');
    sb.style.display = sb.style.display === 'none' ? 'block' : 'none';
    if (sb.style.display === 'block') sb.focus();
}

function filterExplorerTree() {
    renderExplorerLists();
}

// --- RENDU DES LISTES ---
let savedTableaux = [];
let savedInterfaces = [];



// ===================================================
// INTERFACES FOURNIES
// Un tableau de 83 outils fait peur. Ces interfaces prêtes à l'emploi ne
// montrent que ce dont on a besoin : les barres posées sur le tableau et les
// favoris changent, rien n'est supprimé — le tiroir complet reste accessible.
//
// Deux façons de désigner un outil, imposées par le reste du code :
//   - un outil du tableau par son identifiant ou son mode ('freehand', 'ruler')
//   - un plugin par son LIBELLÉ exact, celui de son infobulle.
// La barre principale garde l'identifiant « system-toolbar-main », sinon
// l'application la reconstruit complète au démarrage suivant.
// ===================================================
const OUTILS_ESSENTIELS = ['btn-undo', 'btn-redo', 'pointer', 'move', 'freehand', 'text', 'eraser'];

function barrePrincipale(items, y) {
    return {
        id: 'system-toolbar-main', name: 'Outils', x: 20, y: y || 80,
        titlePalette: 'default', palette: 'default', borderPalette: 'default',
        iconSize: '1', cols: 2, protected: true,
        initialItems: [...items], items: [...items]
    };
}

function barreSecondaire(id, name, x, items) {
    return {
        id, name, x, y: 80,
        titlePalette: 'default', palette: 'default', borderPalette: 'default',
        iconSize: '1', cols: 2, items: [...items]
    };
}

const INTERFACES_FOURNIES = [
    {
        cle: 'maternelle',
        nom: 'Maternelle — grande section',
        outils: [...OUTILS_ESSENTIELS, 'highlighter'],
        matiere: ['Mains & Comptage', 'Dés à jouer', 'Horloge Pédagogique',
                  'Calendrier & Affichages', 'Météo du Jour', 'Signalisation'],
        titreMatiere: 'En classe'
    },
    {
        cle: 'cycle2',
        nom: 'CP – CE1 (cycle 2)',
        outils: [...OUTILS_ESSENTIELS, 'highlighter', 'ruler'],
        matiere: ["Lignes d'écriture", 'Matériel Base 10', 'Réglettes Cuisenaire',
                  'Tableau de Numération', 'Kit Monnaie', 'Horloge Pédagogique',
                  'Mains & Comptage', 'Fraction Visuelle'],
        titreMatiere: 'Lire, écrire, compter'
    },
    {
        cle: 'cycle3',
        nom: 'CE2 – CM2 (cycle 3)',
        outils: [...OUTILS_ESSENTIELS, 'highlighter', 'segment', 'rectangle', 'circle',
                 'ruler', 'setsquare', 'compass'],
        matiere: ['Fraction Visuelle', 'Tableau de Conversion', 'Division Posée',
                  'Tableau de Proportionnalité', 'Symétrie', 'Pyramides Additives',
                  'Frise Historique', 'Cartes Géographiques'],
        titreMatiere: 'Cycle 3'
    },
    {
        cle: 'college',
        nom: 'Collège',
        outils: [...OUTILS_ESSENTIELS, 'point', 'segment', 'droite', 'circle', 'polygon',
                 'ruler', 'setsquare', 'protractor', 'compass'],
        matiere: ['Formules Mathématiques', 'Repère Cartésien', 'Figures Géométriques',
                  'Tuiles Algébriques', 'Angles à mesurer', 'Graphique Statistique',
                  'Molécules 2D', 'Circuits Électriques', 'Frise Historique'],
        titreMatiere: 'Collège'
    },
    {
        cle: 'lycee',
        nom: 'Lycée',
        outils: [...OUTILS_ESSENTIELS, 'point', 'segment', 'droite', 'curve', 'circle',
                 'polygon', 'ruler', 'compass'],
        matiere: ['Formules Mathématiques', 'Traceur de Fonctions', 'Tableau Signes & Variations',
                  'Repère Cartésien', 'Arbre de probabilités', 'Évolutions Successives',
                  'Tableur Interactif', 'Molécules 2D', 'Verrerie'],
        titreMatiere: 'Lycée'
    },
    {
        cle: 'minimale',
        nom: 'Minimale — écrire et dessiner',
        outils: ['btn-undo', 'pointer', 'freehand', 'text', 'eraser'],
        matiere: [],
        titreMatiere: null
    },
    {
        cle: 'conduite',
        nom: 'Conduite de classe',
        outils: OUTILS_ESSENTIELS,
        matiere: ['Tirage au sort & Groupes', 'Sonomètre de Classe', 'Signalisation',
                  'Calendrier & Affichages', 'Météo du Jour', 'Questions Flash',
                  'Popcorn', 'Le Défi du Prof'],
        titreMatiere: 'La classe'
    },
    {
        cle: 'complete',
        nom: 'Complète — tout sous la main',
        outils: ['btn-undo', 'btn-redo', 'pointer', 'move', 'freehand', 'highlighter', 'text',
                 'postit', 'point', 'segment', 'demi-droite', 'droite', 'curve', 'circle',
                 'polygon', 'rectangle', 'laser', 'eraser', 'ruler', 'setsquare',
                 'protractor', 'compass'],
        matiere: ['Formules Mathématiques', 'Fraction Visuelle', 'Repère Cartésien',
                  'Figures Géométriques', 'Tableau de Conversion', 'Graphique Statistique'],
        titreMatiere: 'Maths',
        classe: ['Tirage au sort & Groupes', 'Sonomètre de Classe', 'Calendrier & Affichages',
                 'Questions Flash']
    }
];

function fabriquerInterfaceFournie(modele) {
    const barres = [barrePrincipale(modele.outils)];
    const colonnesOutils = Math.ceil(modele.outils.length / 2);
    let x = 140;
    if (modele.matiere && modele.matiere.length) {
        barres.push(barreSecondaire('iface-' + modele.cle + '-matiere', modele.titreMatiere || 'Outils', x, modele.matiere));
        x += 120;
    }
    if (modele.classe && modele.classe.length) {
        barres.push(barreSecondaire('iface-' + modele.cle + '-classe', 'La classe', x, modele.classe));
    }
    return {
        id: 'iface_fournie_' + modele.cle,
        name: modele.nom,
        date: 'Interface fournie', time: '',
        timestamp: 0,          // les interfaces fournies restent en bas de liste
        fournie: true,
        colonnesOutils,
        data: {
            favorites: [...(modele.matiere || []), ...(modele.classe || [])],
            toolbars: barres,
            barStyleX: null,
            barStyleY: null
        }
    };
}

// Remet les interfaces fournies, y compris celles qui avaient été supprimées
function restaurerInterfacesFournies() {
    savedInterfaces = savedInterfaces.filter(i => !(i.fournie || String(i.id).startsWith('iface_fournie_')));
    semerInterfacesFournies();
    try {
        localStorage.setItem('auTableau_interfaces_list', JSON.stringify(savedInterfaces));
    } catch (e) { /* espace saturé */ }
    if (typeof renderExplorerLists === 'function') renderExplorerLists();
    if (typeof showToast === 'function') showToast('Interfaces fournies remises en place');
}

// Les interfaces fournies sont (re)posées au démarrage : elles complètent la
// liste sans écraser celles que l'enseignant a créées ou renommées.
function semerInterfacesFournies() {
    let touche = false;
    INTERFACES_FOURNIES.forEach(modele => {
        const id = 'iface_fournie_' + modele.cle;
        if (savedInterfaces.some(i => i.id === id)) return;
        savedInterfaces.push(fabriquerInterfaceFournie(modele));
        touche = true;
    });
    if (touche) {
        try {
            localStorage.setItem('auTableau_interfaces_list', JSON.stringify(savedInterfaces));
        } catch (e) { /* espace saturé : la liste reste en mémoire pour la session */ }
    }
    return touche;
}

function loadExplorerData() {
    // Interfaces in localStorage
    try {
        const intData = localStorage.getItem('auTableau_interfaces_list');
        if (intData) savedInterfaces = JSON.parse(intData);
    } catch (e) { }
    semerInterfacesFournies();

    // Tableaux in localforage
    localforage.getItem('auTableau_tableaux_list').then(data => {
        if (data) savedTableaux = data;
        renderExplorerLists();
    });
}
let currentBoardName = "";

function updateUnsavedIndicator() {
    const ind = document.getElementById('unsaved-indicator');
    if (ind) {
        if (hasUnsavedChanges) ind.classList.add('visible');
        else ind.classList.remove('visible');
    }
}

function initProjectName() {
    // Le format vient des réglages de la roue, à côté du titre
    const defaultName = (typeof texteDateDuJour === 'function')
        ? texteDateDuJour()
        : new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (typeof dernierTitreDate !== 'undefined') dernierTitreDate = defaultName;
    currentBoardName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
    const input = document.getElementById('project-name-input');
    if (input) input.value = currentBoardName;
}

document.addEventListener('DOMContentLoaded', () => {
    loadExplorerData();
    initProjectName();

    const btnMinPostit = document.getElementById('btn-minimize-postit');
    if (btnMinPostit) {
        btnMinPostit.addEventListener('click', (e) => {
            if (selectedItems.length === 1 && selectedItems[0].type === 'text') {
                const t = getObjectById('text', selectedItems[0].id);
                if (t && t.bubbleShape === 'postit') {
                    t.isMinimized = !t.isMinimized;
                    saveState();
                    if (typeof updateStyleBarContext === 'function') updateStyleBarContext();
                    draw();
                }
            }
        });
    }

    const projInput = document.getElementById('project-name-input');
    if (projInput) {
        projInput.addEventListener('change', (e) => {
            currentBoardName = e.target.value.trim() || "Sans titre";
            e.target.value = currentBoardName;
            hasUnsavedChanges = true;
            updateUnsavedIndicator();
        });
        projInput.addEventListener('click', (e) => {
            e.target.select();
        });
        const wrapper = document.getElementById('project-name-wrapper');
        if (wrapper) {
            projInput.addEventListener('focus', () => wrapper.classList.add('editing'));
            projInput.addEventListener('blur', () => {
                setTimeout(() => {
                    if (!wrapper.matches(':focus-within')) wrapper.classList.remove('editing');
                }, 200);
            });

            const btnPlus = document.getElementById('project-title-plus');
            const btnMinus = document.getElementById('project-title-minus');
            const colorPicker = document.getElementById('project-title-color');

            const updateTitleStyle = () => {
                const currentFontSize = parseInt(getComputedStyle(projInput).fontSize) || 24;
                const newColor = colorPicker.value;
                projInput.style.color = newColor;

                const tempSpan = document.createElement('span');
                tempSpan.style.font = getComputedStyle(projInput).font;
                tempSpan.style.fontSize = currentFontSize + 'px';
                tempSpan.textContent = projInput.value || projInput.placeholder;
                document.body.appendChild(tempSpan);
                projInput.style.width = (tempSpan.offsetWidth + 20) + 'px';
                document.body.removeChild(tempSpan);

                if (!window.appState) window.appState = {};
                window.appState.projectTitleStyle = {
                    fontSize: currentFontSize,
                    color: newColor,
                    fontFamily: window.appState.projectTitleStyle?.fontFamily || 'sans-serif'
                };
                saveState();
            };

            if (btnPlus) {
                btnPlus.addEventListener('mousedown', e => e.preventDefault());
                btnPlus.addEventListener('click', () => {
                    let sz = parseInt(getComputedStyle(projInput).fontSize) || 24;
                    sz = Math.min(100, sz + 2);
                    projInput.style.fontSize = sz + 'px';
                    updateTitleStyle();
                });
            }
            if (btnMinus) {
                btnMinus.addEventListener('mousedown', e => e.preventDefault());
                btnMinus.addEventListener('click', () => {
                    let sz = parseInt(getComputedStyle(projInput).fontSize) || 24;
                    sz = Math.max(12, sz - 2);
                    projInput.style.fontSize = sz + 'px';
                    updateTitleStyle();
                });
            }
            if (colorPicker) {
                // Initialize color picker value from appState if available
                setTimeout(() => {
                    if (window.appState && window.appState.projectTitleStyle && window.appState.projectTitleStyle.color) {
                        const col = window.appState.projectTitleStyle.color;
                        if (col.startsWith('#') && (col.length === 7 || col.length === 4)) {
                            colorPicker.value = col;
                        }
                    }
                }, 500);

                colorPicker.addEventListener('input', () => {
                    updateTitleStyle();
                });
            }
        }


    }
});
function renderExplorerLists() {
    const query = document.getElementById('explorer-search-bar').value.toLowerCase();

    const ftc = document.getElementById('file-tree-container');
    const ic = document.getElementById('interfaces-container');

    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const container = currentExplorerTab === 'tableaux' ? ftc : ic;

    ftc.innerHTML = '';
    ic.innerHTML = '';

    const filteredList = query ? list.filter(t => !t.deleted && ((t.name || '').toLowerCase().includes(query) || t.type === 'folder')) : list.filter(t => !t.deleted);

    const treeHtml = buildTree(filteredList, null);
    if (treeHtml) {
        container.appendChild(treeHtml);
    } else if (currentExplorerTab === 'interfaces' && !query) {
        container.innerHTML = `<div style="padding:14px; color:#636e72; font-size:12px; text-align:center; line-height:1.6;">
            Aucune interface.<br>
            <button class="btn-action" style="margin-top:10px; padding:6px 12px; font-size:12px;"
                onclick="restaurerInterfacesFournies()">Remettre les interfaces fournies</button>
        </div>`;
    } else {
        container.innerHTML = `<div style="padding:10px; color:#636e72; font-size:12px; text-align:center;">Aucun document trouvé.</div>`;
    }
}

let isCompletingInline = false;
let draggedItemId = null;

const TREE_ICON_FOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
const TREE_ICON_TABLEAU = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
const TREE_ICON_INTERFACE = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';

function buildTree(items, parentId) {
    const ul = document.createElement('div');
    ul.className = parentId ? 'folder-children' : 'tree-root';

    let hasInlineInput = false;
    if (inlineCreationState && inlineCreationState.parentId === parentId && inlineCreationState.tab === currentExplorerTab) {
        hasInlineInput = true;
        const li = document.createElement('div');
        li.className = 'tree-item inline-create';
        li.innerHTML = `
            <span class="icon">${inlineCreationState.type === 'folder' ? TREE_ICON_FOLDER : (currentExplorerTab === 'tableaux' ? TREE_ICON_TABLEAU : TREE_ICON_INTERFACE)}</span>
            <input type="text" id="inline-create-input" placeholder="Nom..." style="width:100%; border:none; outline:none; background:transparent; font-size:13px; color:inherit; padding-left: 8px;">
        `;
        ul.appendChild(li);

        setTimeout(() => {
            const input = document.getElementById('inline-create-input');
            if (input) {
                input.focus();
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') finishInlineCreation(input.value);
                    else if (e.key === 'Escape') cancelInlineCreation();
                };
                input.onblur = () => finishInlineCreation(input.value);
            }
        }, 10);
    }

    const children = items.filter(i => (i.parentId || null) === parentId);
    if (children.length === 0 && !hasInlineInput) return null;

    children.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
    });

    children.forEach(item => {
        const el = document.createElement('div');
        if (item.type === 'folder') {
            el.className = 'folder-item';
            if (item.isOpen) el.classList.add('open');
        }

        const treeItem = document.createElement('div');
        treeItem.className = 'tree-item file-item';

        if (item.type === 'folder' && selectedFolderId === item.id) {
            treeItem.classList.add('selected');
        }
        if (item.type !== 'folder' && ((currentExplorerTab === 'tableaux' && selectedBoardId === item.id) || (currentExplorerTab === 'interfaces' && selectedInterfaceId === item.id))) {
            treeItem.classList.add('selected');
        }

        treeItem.draggable = true;
        treeItem.ondragstart = (e) => {
            draggedItemId = item.id;
            e.dataTransfer.setData('text/plain', item.id);
            e.stopPropagation();
        };
        treeItem.ondragover = (e) => {
            if (item.type === 'folder' && draggedItemId !== item.id) {
                e.preventDefault();
                treeItem.classList.add('drag-over');
            }
        };
        treeItem.ondragleave = () => treeItem.classList.remove('drag-over');
        treeItem.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            treeItem.classList.remove('drag-over');
            if (draggedItemId && draggedItemId !== item.id && item.type === 'folder') {
                moveItemToFolder(draggedItemId, item.id);
            }
            draggedItemId = null;
        };

        if (item.type === 'folder') {
            treeItem.innerHTML = `
                <div class="folder-toggle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
                <span class="icon">${TREE_ICON_FOLDER}</span> <span class="label" style="font-weight:600;">${item.name}</span>
            `;
            treeItem.onclick = (e) => {
                if (e.target.closest('.folder-toggle')) {
                    toggleFolder(item.id);
                } else {
                    selectedFolderId = item.id;
                    renderExplorerLists();
                }
            };
        } else {
            const icon = currentExplorerTab === 'tableaux' ? TREE_ICON_TABLEAU : TREE_ICON_INTERFACE;
            const isRenaming = renamingItemId === item.id;
            const labelHTML = isRenaming
                ? `<input type="text" id="rename-input-${item.id}" class="rename-input" value="${item.name}" />`
                : `<span class="label">${item.name}</span>`;

            treeItem.innerHTML = `
                <span class="icon" style="margin-left: 20px;">${icon}</span>
                ${labelHTML}
                <div class="tree-item-actions">
                    <button class="tree-action-btn" title="Ouvrir" onclick="${currentExplorerTab === 'tableaux' ? `promptLoadBoard('${item.id}')` : `promptLoadInterface('${item.id}')`}; event.stopPropagation();" style="padding:4px 6px; font-size:12px;">⏎</button>
                    <button class="tree-action-btn" title="Renommer" onclick="renameItem('${item.id}', '${currentExplorerTab}'); event.stopPropagation();" style="padding:4px 6px; font-size:12px;">✎</button>
                    <button class="tree-action-btn danger" title="Supprimer" onclick="promptDeleteItem('${item.id}', '${currentExplorerTab}'); event.stopPropagation();" style="padding:4px 6px; font-size:12px;">🗑</button>
                </div>
            `;

            // Drag and drop sur le canvas
            if (currentExplorerTab === 'tableaux') {
                treeItem.draggable = true;
                treeItem.ondragstart = (e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'board', id: item.id }));
                    draggedItemId = item.id;
                };
            }


            let clickCount = 0;
            let clickTimer = null;

            treeItem.onclick = (e) => {
                if (e.target.closest('.tree-action-btn')) return;

                clickCount++;
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        // Simple clic : sélectionner seulement
                        selectedFolderId = null;
                        if (currentExplorerTab === 'tableaux') {
                            selectedBoardId = item.id;
                        } else {
                            selectedInterfaceId = item.id;
                        }
                        renderExplorerLists();
                        clickCount = 0;
                    }, 300);
                } else if (clickCount === 2) {
                    // Double-clic : renommer
                    clearTimeout(clickTimer);
                    renameItem(item.id, currentExplorerTab);
                    clickCount = 0;
                }
            };

            // Entrée pour charger le tableau sélectionné
            treeItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !renamingItemId) {
                    if (currentExplorerTab === 'tableaux') {
                        promptLoadBoard(item.id);
                    } else {
                        promptLoadInterface(item.id);
                    }
                }
            });

            let hoverTimer;
            if (currentExplorerTab === 'tableaux') {
                treeItem.onmouseenter = (e) => {
                    hoverTimer = setTimeout(() => showTooltip(e, item), 1500);
                };
                treeItem.onmouseleave = () => {
                    clearTimeout(hoverTimer);
                    hideTooltip();
                };
            }
        }

        el.appendChild(treeItem);

        if (item.type === 'folder') {
            const subTree = buildTree(items, item.id);
            if (subTree) el.appendChild(subTree);
        }

        ul.appendChild(el);
    });
    return ul;
}

function handleTreeDragOver(e) {
    e.preventDefault();
}
function handleTreeDrop(e, target) {
    e.preventDefault();
    if (draggedItemId && target === 'root') {
        moveItemToFolder(draggedItemId, null);
    }
    draggedItemId = null;
}

function handleTrashDragOver(e) {
    if (draggedItemId) {
        e.preventDefault();
        e.currentTarget.style.backgroundColor = 'rgba(214, 48, 49, 0.1)';
        e.currentTarget.style.border = '1px dashed #d63031';
    }
}
function handleTrashDrop(e) {
    e.preventDefault();
    e.currentTarget.style.backgroundColor = '';
    e.currentTarget.style.border = '';
    if (draggedItemId) {
        moveToTrash(draggedItemId);
        draggedItemId = null;
    }
}

document.getElementById('trash-section').ondragleave = (e) => {
    e.currentTarget.style.backgroundColor = '';
    e.currentTarget.style.border = '';
};

function moveToTrash(itemId) {
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const idsToTrash = new Set([itemId]);
    let added = true;
    while (added) {
        added = false;
        list.forEach(item => {
            if (idsToTrash.has(item.parentId) && !idsToTrash.has(item.id)) {
                idsToTrash.add(item.id);
                added = true;
            }
        });
    }
    list.forEach(item => { if (idsToTrash.has(item.id)) item.deleted = true; });
    saveExplorerList();
    renderExplorerLists();
    renderTrashList();
}

function restoreFromTrash(itemId) {
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const idsToRestore = new Set([itemId]);
    let added = true;
    while (added) {
        added = false;
        list.forEach(item => {
            if (idsToRestore.has(item.id) && item.parentId && !idsToRestore.has(item.parentId)) {
                idsToRestore.add(item.parentId);
                added = true;
            }
        });
    }
    list.forEach(item => { if (idsToRestore.has(item.id)) item.deleted = false; });
    saveExplorerList();
    renderExplorerLists();
    renderTrashList();
}

function emptyTrash() {
    if (!confirm("Vider définitivement la corbeille ? Cette action est irréversible.")) return;
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const deletedIds = list.filter(t => t.deleted).map(t => t.id);
    const newList = list.filter(t => !t.deleted);
    if (currentExplorerTab === 'tableaux') savedTableaux = newList;
    else savedInterfaces = newList;
    deletedIds.forEach(id => {
        if (id.startsWith('folder_')) return;
        if (currentExplorerTab === 'tableaux') localforage.removeItem('data_' + id);
    });
    saveExplorerList();
    renderTrashList();
}

function renderTrashList() {
    const trashListEl = document.getElementById('trash-list');
    if (!trashListEl) return;
    trashListEl.innerHTML = '';
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const deletedItems = list.filter(t => t.deleted);
    if (deletedItems.length === 0) {
        trashListEl.innerHTML = `<div style="padding:10px; color:#636e72; font-size:12px; text-align:center;">Corbeille vide</div>`;
        return;
    }
    deletedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'tree-item file-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '4px 8px';
        div.style.gap = '4px';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'label';
        nameSpan.innerHTML = `<span class="icon">${item.type === 'folder' ? TREE_ICON_FOLDER : TREE_ICON_TABLEAU}</span> ${item.name}`;

        const btnStyle = 'font-size: 10px; padding: 2px 6px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--ink); transition: all 0.2s;';

        const restoreBtn = document.createElement('button');
        restoreBtn.innerText = 'Restaurer';
        restoreBtn.style.cssText = btnStyle;
        restoreBtn.onclick = () => restoreFromTrash(item.id);

        const restoreResetBtn = document.createElement('button');
        restoreResetBtn.innerText = 'Réinit.';
        restoreResetBtn.style.cssText = btnStyle + ' background: rgba(231, 76, 60, 0.1); color: #e74c3c; border-color: #e74c3c;';
        restoreResetBtn.title = 'Restaurer et réinitialiser l\'interface';
        restoreResetBtn.onclick = () => {
            if (confirm('Cela réinitialisera le logiciel à son état initial. Êtes-vous sûr ?')) {
                restoreFromTrash(item.id);
                setTimeout(() => {
                    localStorage.clear();
                    location.reload();
                }, 500);
            }
        };

        div.appendChild(nameSpan);
        div.appendChild(restoreBtn);
        div.appendChild(restoreResetBtn);
        trashListEl.appendChild(div);
    });
}

function moveItemToFolder(itemId, targetFolderId) {
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const item = list.find(i => i.id === itemId);

    if (item && item.type === 'folder') {
        let curr = list.find(i => i.id === targetFolderId);
        while (curr) {
            if (curr.id === item.id) return;
            curr = list.find(i => i.id === curr.parentId);
        }
    }

    if (item) {
        item.parentId = targetFolderId;
        saveExplorerList();
        renderExplorerLists();
    }
}

let renamingItemId = null;

function promptLoadBoard(boardId) {
    // Check if canvas has content (not just unsavedChanges flag)
    const canvasHasContent = points.length > 0 || segments.length > 0 || circles.length > 0 ||
                             rectangles.length > 0 || texts.length > 0 || freehands.length > 0 ||
                             curves.length > 0 || polygons.length > 0 || images.length > 0 ||
                             arcs.length > 0 || htmlPostits.length > 0;

    // Demander de sauvegarder s'il y a des modifications
    if (canvasHasContent && hasUnsavedChanges) {
        openConfirmModal(
            "Enregistrer le tableau courant ?",
            "Vous avez des modifications non sauvegardées.",
            false,
            () => { saveState(); loadBoard(boardId); },
            () => { loadBoard(boardId); }
        );
    } else {
        loadBoard(boardId);
    }
}

function promptLoadInterface(interfaceId) {
    const canvasHasContent = points.length > 0 || segments.length > 0 || circles.length > 0 ||
                             rectangles.length > 0 || texts.length > 0 || freehands.length > 0 ||
                             curves.length > 0 || polygons.length > 0 || images.length > 0 ||
                             arcs.length > 0 || htmlPostits.length > 0;

    if (canvasHasContent && hasUnsavedChanges) {
        openConfirmModal(
            "Enregistrer le tableau courant ?",
            "Vous avez des modifications non sauvegardées.",
            false,
            () => { saveState(); loadInterface(interfaceId); },
            () => { loadInterface(interfaceId); }
        );
    } else {
        loadInterface(interfaceId);
    }
}

function promptDeleteItem(itemId, tab) {
    const list = tab === 'tableaux' ? savedTableaux : savedInterfaces;
    const item = list.find(i => i.id === itemId);
    if (!item) return;

    // Custom modal pour suppression avec option restauration
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').innerText = `Supprimer "${item.name}" ?`;
    document.getElementById('confirm-text').innerText = "Cet élément sera déplacé à la corbeille.";

    const btnContainer = modal.querySelector('div[style*="display: flex; gap"]');
    btnContainer.innerHTML = '';

    // Bouton Annuler
    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-action secondary';
    btnCancel.textContent = 'Annuler';
    btnCancel.style.flex = '1';
    btnCancel.onclick = () => modal.style.display = 'none';
    btnContainer.appendChild(btnCancel);

    // Bouton Supprimer
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-action danger';
    btnDelete.textContent = 'Supprimer';
    btnDelete.style.flex = '1';
    btnDelete.onclick = () => { moveToTrash(itemId); modal.style.display = 'none'; };
    btnContainer.appendChild(btnDelete);

    // Bouton Restaurer interface
    const btnRestore = document.createElement('button');
    btnRestore.className = 'btn-action primary';
    btnRestore.textContent = 'Restaurer interface';
    btnRestore.style.flex = '1';
    btnRestore.onclick = () => {
        moveToTrash(itemId);
        if (confirm('Cela réinitialisera le logiciel à son état initial. Êtes-vous sûr ?')) {
            localStorage.clear();
            location.reload();
        }
        modal.style.display = 'none';
    };
    btnContainer.appendChild(btnRestore);

    modal.style.display = 'flex';
}

function renameItem(itemId, tab) {
    const list = tab === 'tableaux' ? savedTableaux : savedInterfaces;
    const item = list.find(i => i.id === itemId);
    if (!item) return;

    renamingItemId = itemId;
    renderExplorerLists();

    setTimeout(() => {
        const input = document.getElementById(`rename-input-${itemId}`);
        if (input) {
            input.focus();
            input.select();
            input.addEventListener('blur', () => finishRename(itemId, tab));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRename(itemId, tab);
                else if (e.key === 'Escape') cancelRename();
            });
        }
    }, 10);
}

function finishRename(itemId, tab) {
    const input = document.getElementById(`rename-input-${itemId}`);
    if (!input) return;

    const newName = input.value.trim();
    const list = tab === 'tableaux' ? savedTableaux : savedInterfaces;
    const item = list.find(i => i.id === itemId);

    if (newName && item) {
        item.name = newName;
        saveExplorerList();
    }

    renamingItemId = null;
    renderExplorerLists();
}

function cancelRename() {
    renamingItemId = null;
    renderExplorerLists();
}

function saveExplorerList() {
    if (currentExplorerTab === 'tableaux') {
        localforage.setItem('auTableau_tableaux_list', savedTableaux);
    } else {
        localStorage.setItem('auTableau_interfaces_list', JSON.stringify(savedInterfaces));
    }
}

function toggleFolder(folderId) {
    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const item = list.find(i => i.id === folderId);
    if (item && item.type === 'folder') {
        item.isOpen = !item.isOpen;
        saveExplorerList();
        renderExplorerLists();
    }
}

// --- TOOLTIP ---
function showTooltip(e, item) {
    const tt = document.getElementById('hover-tooltip');
    const img = document.getElementById('tt-preview-img');
    const tdate = document.getElementById('tt-date');
    const ttime = document.getElementById('tt-time');

    if (item.preview) {
        img.src = item.preview;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
    }

    tdate.innerText = item.date || '';
    ttime.innerText = item.time || '';

    // Position it intelligently
    tt.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    tt.style.left = (e.clientX - 230) + 'px'; // Left of the mouse
    tt.classList.add('visible');
}

function hideTooltip() {
    document.getElementById('hover-tooltip').classList.remove('visible');
}

// --- LOGIQUE DE SAUVEGARDE (DISQUETTE) ---
const handleSaveClick = () => {
    syncPage();
    if (currentExplorerTab === 'tableaux') {
        saveCurrentBoard();
    } else {
        saveCurrentInterface();
    }
};

const btnSave = document.getElementById('btn-save');
if (btnSave) btnSave.addEventListener('click', handleSaveClick);

const btnExplorerSave = document.getElementById('btn-explorer-save');
if (btnExplorerSave) btnExplorerSave.addEventListener('click', handleSaveClick);

function getMiniPreview() {
    // Generate a tiny low-res thumbnail
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 300;
    tempCanvas.height = 300 * (canvas.height / canvas.width);
    const tctx = tempCanvas.getContext('2d');
    tctx.fillStyle = isDarkMode ? '#1e1e24' : '#f5f6fa';
    tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
    return tempCanvas.toDataURL('image/jpeg', 0.5);
}

function saveCurrentBoard() {
    const input = document.getElementById('project-name-input');
    let name = input ? input.value.trim() : "";
    if (!name) name = "Sans titre";
    currentBoardName = name;

    if (selectedBoardId) {
        _doSaveBoard(name, selectedBoardId);
    } else {
        _doSaveBoard(name, 'tb_' + Date.now());
    }
}

function _doSaveBoard(name, id) {
    const now = new Date();
    syncPage();
    // sans l'historique d'annulation, et images mutualisées
    const appState = stateForStorage();

    const existingIndex = savedTableaux.findIndex(t => t.id === id);
    let existingObj = {};
    if (existingIndex >= 0) existingObj = savedTableaux[existingIndex];

    const metadata = {
        ...existingObj,
        id: id,
        name: name,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timestamp: Date.now(),
        preview: getMiniPreview()
    };

    // Save metadata in list
    if (existingIndex >= 0) savedTableaux[existingIndex] = metadata;
    else savedTableaux.push(metadata);

    // Sort by most recent
    savedTableaux.sort((a, b) => b.timestamp - a.timestamp);

    // Store lists and real data
    localforage.setItem('auTableau_tableaux_list', savedTableaux);
    localforage.setItem('data_' + id, appState).then(() => {
        selectedBoardId = id;
        hasUnsavedChanges = false;
        updateUnsavedIndicator();
        renderExplorerLists();
        showToast("Tableau sauvegardé !");
    });
}

function loadBoard(id) {
    hideTooltip();
    localforage.getItem('data_' + id).then(data => {
        if (data) {
            restoreState(data);
            selectedBoardId = id;
            const t = savedTableaux.find(tb => tb.id === id);
            if (t) {
                currentBoardName = t.name;
                const input = document.getElementById('project-name-input');
                if (input) input.value = currentBoardName;
            }
            hasUnsavedChanges = false;
            updateUnsavedIndicator();
            showToast("Tableau chargé !");
        }
    });
}

function saveCurrentInterface() {
    if (selectedInterfaceId) {
        const existing = savedInterfaces.find(t => t.id === selectedInterfaceId);
        if (existing) {
            openConfirmModal("Écraser ?", `Voulez-vous écraser l'interface "${existing.name}" ?`, true, () => {
                _doSaveInterface(existing.name, existing.id);
            });
            return;
        }
    }

    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const defaultName = now.toLocaleDateString('fr-FR', options);
    const capitalizedName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);

    openSysPromptModal("Enregistrer l'interface", "Nom de l'interface :", capitalizedName, (name) => {
        if (!name) return;
        const exists = savedInterfaces.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            openConfirmModal("Écraser ?", "Une interface porte déjà ce nom. Écraser ?", true, () => {
                _doSaveInterface(name, exists.id);
            });
        } else {
            _doSaveInterface(name, 'iface_' + Date.now());
        }
    });
}

function _doSaveInterface(name, id) {
    const now = new Date();

    const existingIndex = savedInterfaces.findIndex(t => t.id === id);
    let existingObj = {};
    if (existingIndex >= 0) existingObj = savedInterfaces[existingIndex];

    const metadata = {
        ...existingObj,
        id: id,
        name: name,
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timestamp: Date.now(),
        preview: getMiniPreview(),
        data: {
            favorites: JSON.parse(localStorage.getItem('board_favorites') || '[]'),
            toolbars: JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]'),
            barStyleX: localStorage.getItem('bar_style_x'),
            barStyleY: localStorage.getItem('bar_style_y')
        }
    };

    if (existingIndex >= 0) savedInterfaces[existingIndex] = metadata;
    else savedInterfaces.push(metadata);

    savedInterfaces.sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem('auTableau_interfaces_list', JSON.stringify(savedInterfaces));

    selectedInterfaceId = id;
    renderExplorerLists();
    showToast("Interface sauvegardée !");
}

function loadInterface(id) {
    hideTooltip();
    const intf = savedInterfaces.find(i => i.id === id);
    if (intf && intf.data) {
        interfaceEnChargement = true;      // plus rien n'écrit les barres d'ici au redémarrage
        if (intf.data.favorites) localStorage.setItem('board_favorites', JSON.stringify(intf.data.favorites));
        if (intf.data.toolbars) localStorage.setItem('board_floating_toolbars', JSON.stringify(intf.data.toolbars));
        if (intf.data.barStyleX) localStorage.setItem('bar_style_x', intf.data.barStyleX);
        if (intf.data.barStyleY) localStorage.setItem('bar_style_y', intf.data.barStyleY);
        // On redémarre tout de suite. L'attente d'une seconde et demie ne
        // servait à rien — le message ne survit pas au rechargement — et
        // laissait à la session le temps de réécrire les barres par-dessus.
        showToast("Interface chargée ! L'application redémarre.");
        requestAnimationFrame(() => window.location.reload());
    }
}

// --- CALENDRIER ---
let currentCalMonth = new Date().getMonth();
let currentCalYear = new Date().getFullYear();

function openCalendarModal() {
    document.getElementById('calendar-modal').style.display = 'flex';
    renderCalendar();
}
function closeCalendarModal() {
    document.getElementById('calendar-modal').style.display = 'none';
}
function changeCalendarMonth(offset) {
    currentCalMonth += offset;
    if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
    else if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    document.getElementById('calendar-month-year').innerText = monthNames[currentCalMonth] + " " + currentCalYear;

    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    days.forEach(d => {
        const el = document.createElement('div');
        el.className = 'cal-day-header';
        el.innerText = d;
        grid.appendChild(el);
    });

    let firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
    if (firstDay === 0) firstDay = 7;
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();

    for (let i = 1; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day empty';
        grid.appendChild(el);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const el = document.createElement('div');
        el.className = 'cal-day';
        el.innerText = day;

        // Formater la date pour correspondre à "JJ/MM/AAAA"
        const dStr = new Date(currentCalYear, currentCalMonth, day).toLocaleDateString();

        // Vérifier les sauvegardes pour cette date
        const savesForDay = savedTableaux.filter(t => t.date === dStr).map(t => ({ ...t, _kind: 'tableau' }))
            .concat(savedInterfaces.filter(i => i.date === dStr).map(i => ({ ...i, _kind: 'interface' })));
        if (savesForDay.length > 0) {
            el.classList.add('has-save');
        }

        el.onclick = () => {
            document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('active'));
            el.classList.add('active');
            showCalendarResults(dStr, savesForDay);
        };

        grid.appendChild(el);
    }
}

function showCalendarResults(dateStr, saves) {
    const res = document.getElementById('calendar-results');
    res.innerHTML = `<div style="font-weight:bold; margin-bottom:10px;">Sauvegardes du ${dateStr}</div>`;

    if (saves.length === 0) {
        res.innerHTML += `<div class="modal-text" style="font-size:13px;">Aucune sauvegarde ce jour-là.</div>`;
        return;
    }

    saves.forEach(s => {
        const d = document.createElement('div');
        d.style.padding = '10px';
        d.style.border = '1px solid var(--border)';
        d.style.borderRadius = '6px';
        d.style.marginBottom = '8px';
        d.style.display = 'flex';
        d.style.justifyContent = 'space-between';
        d.style.alignItems = 'center';

        const typeIcon = s._kind === 'tableau' ? TREE_ICON_TABLEAU : TREE_ICON_INTERFACE;
        const typeStr = s._kind === 'tableau' ? 'Tableau' : 'Interface';

        d.innerHTML = `
            <div>
                <div style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:6px;"><span class="icon">${typeIcon}</span> ${s.name}</div>
                <div style="font-size:11px; color:var(--muted);">${typeStr} - ${s.time}</div>
            </div>
            <button class="btn-action secondary" style="padding:4px 12px; font-size:12px;">Ouvrir</button>
        `;

        d.querySelector('button').onclick = () => {
            closeCalendarModal();
            if (s._kind === 'tableau') {
                switchDrawerTab('tableaux');
                selectedBoardId = s.id;
                loadBoard(s.id);
            } else {
                switchDrawerTab('interfaces');
                selectedInterfaceId = s.id;
                loadInterface(s.id);
            }
        };

        res.appendChild(d);
    });
}

function finishInlineCreation(name) {
    if (isCompletingInline) return;
    isCompletingInline = true;

    if (!name || name.trim() === '') {
        inlineCreationState = null;
        renderExplorerLists();
        isCompletingInline = false;
        return;
    }

    const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
    const isFolder = inlineCreationState.type === 'folder';
    const newId = (isFolder ? 'folder_' : (currentExplorerTab === 'tableaux' ? 'tab_' : 'int_')) + Date.now();

    const newItem = {
        id: newId,
        name: name.trim(),
        type: isFolder ? 'folder' : 'file',
        parentId: inlineCreationState.parentId,
        timestamp: Date.now()
    };
    if (isFolder) newItem.isOpen = true;

    list.push(newItem);

    if (!isFolder) {
        if (currentExplorerTab === 'tableaux') {
            selectedBoardId = newId;
            const isEmpty = pages.length <= 1 && freehands.length === 0 && points.length === 0 && segments.length === 0 && rectangles.length === 0 && circles.length === 0 && arcs.length === 0 && texts.length === 0 && polygons.length === 0 && curves.length === 0 && images.length === 0;
            if (!isEmpty) {
                _doSaveBoard(newItem.name, newId);
            } else {
                clearBoardAndPages();
            }
        } else {
            selectedInterfaceId = newId;
        }
    }

    inlineCreationState = null;
    saveExplorerList();
    renderExplorerLists();
    isCompletingInline = false;
}

function cancelInlineCreation() {
    inlineCreationState = null;
    renderExplorerLists();
}

function createNewFile() {
    inlineCreationState = { type: 'file', parentId: selectedFolderId, tab: currentExplorerTab };
    if (selectedFolderId) {
        const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
        const parent = list.find(f => f.id === selectedFolderId);
        if (parent) parent.isOpen = true;
    }
    renderExplorerLists();
}

function createNewFolder() {
    inlineCreationState = { type: 'folder', parentId: selectedFolderId, tab: currentExplorerTab };
    if (selectedFolderId) {
        const list = currentExplorerTab === 'tableaux' ? savedTableaux : savedInterfaces;
        const parent = list.find(f => f.id === selectedFolderId);
        if (parent) parent.isOpen = true;
    }
    renderExplorerLists();
}

async function getWorkspaceData() {
    const tableaux = await localforage.getItem('auTableau_tableaux_list') || [];
    const autoSave = await localforage.getItem('AuTableau_AutoSave') || null;

    const interfaces = JSON.parse(localStorage.getItem('auTableau_interfaces_list') || '[]');
    const toolbars = JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]');
    const favorites = JSON.parse(localStorage.getItem('board_favorites') || '[]');

    // Le contenu réel de chaque tableau est stocké séparément (clé 'data_<id>'),
    // la liste ci-dessus ne contient que les métadonnées (nom, aperçu...).
    const boardsData = {};
    for (const t of tableaux) {
        if (t.type === 'folder') continue;
        const content = await localforage.getItem('data_' + t.id);
        if (content) boardsData[t.id] = content;
    }

    return {
        version: "1.0",
        timestamp: Date.now(),
        tableaux: tableaux,
        boardsData: boardsData,
        autoSave: autoSave,
        interfaces: interfaces,
        toolbars: toolbars,
        favorites: favorites,
        // La sauvegarde complète oubliait les classes : la restauration savait
        // pourtant les relire. Un enseignant sauvegardait « tout » et perdait
        // quand même ses élèves, leurs avatars, leurs points et leurs badges.
        ...(await chargeDesClasses())
    };
}

// ===================================================
// LES CLASSES DANS UN FICHIER
// Tout ce qui fait la classe vit dans le navigateur : un profil effacé, un
// changement d'ordinateur, et une année d'avatars, de points et de badges
// disparaît. Cette charge utile est la même pour la sauvegarde complète de
// l'application et pour le fichier de classes seul.
// ===================================================
const CLE_BADGES_CLASSE = 'board_badges';
const CLE_REGLAGES_POINTS = 'board_points_reglages';

async function chargeDesClasses() {
    const lire = (cle) => {
        try { return JSON.parse(localStorage.getItem(cle) || 'null'); } catch (e) { return null; }
    };
    const classes = (typeof ClassesStore !== 'undefined') ? await ClassesStore.loadAll() : [];
    return {
        classes: classes || [],
        // Les badges créés par l'enseignant vivent hors des élèves : sans eux,
        // les pastilles restaurées ne renverraient à rien.
        badges: lire(CLE_BADGES_CLASSE) || undefined,
        reglagesPoints: lire(CLE_REGLAGES_POINTS) || undefined
    };
}

function poserLesBadges(data) {
    try {
        if (data.badges) localStorage.setItem(CLE_BADGES_CLASSE, JSON.stringify(data.badges));
        if (data.reglagesPoints) localStorage.setItem(CLE_REGLAGES_POINTS, JSON.stringify(data.reglagesPoints));
    } catch (e) { /* stockage refusé */ }
}

// ===================================================
// ÉCRIRE DANS LE PRESSE-PAPIERS
// navigator.clipboard n'existe QUE dans un contexte sécurisé. Ouverte depuis
// un dossier — file://, c'est-à-dire la façon la plus courante d'utiliser
// l'application — la promesse échoue et le bouton « copier » semblait cassé.
// On retombe alors sur la vieille méthode, qui marche partout : un champ
// invisible, une sélection, execCommand.
// ===================================================
async function mettreDansLePressePapiers(texte) {
    if (!texte) return false;
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        try { await navigator.clipboard.writeText(texte); return true; }
        catch (e) { /* on tente l'autre voie */ }
    }
    try {
        const champ = document.createElement('textarea');
        champ.value = texte;
        champ.setAttribute('readonly', '');
        champ.style.cssText = 'position:fixed; top:0; left:0; width:1px; height:1px; opacity:0; pointer-events:none;';
        document.body.appendChild(champ);
        const avant = document.activeElement;
        champ.select();
        champ.setSelectionRange(0, texte.length);
        const ok = document.execCommand('copy');
        champ.remove();
        if (avant && avant.focus) avant.focus();
        return ok;
    } catch (e) { return false; }
}
window.mettreDansLePressePapiers = mettreDansLePressePapiers;

// Le fichier de classes seul : ce que l'on emporte sur une clé, ce que l'on
// dépose sur son nuage, ce que l'on rouvre sur l'ordinateur de la maison.
const FORMAT_CLASSES = 'autableau-classes';

async function sauverLesClasses() {
    const charge = await chargeDesClasses();
    if (!charge.classes.length) {
        if (typeof showToast === 'function') showToast('Aucune classe à sauvegarder');
        return null;
    }
    const contenu = JSON.stringify({
        format: FORMAT_CLASSES, version: 1,
        date: new Date().toISOString(),
        ...charge
    });
    const jour = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
    a.href = url;
    a.download = `mes-classes-${jour}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);

    const eleves = charge.classes.reduce((n, c) => n + (c.students || []).length, 0);
    if (typeof showToast === 'function') {
        showToast(`💾 ${charge.classes.length} classe(s), ${eleves} élève(s) sauvegardés`);
    }
    return { classes: charge.classes.length, eleves, octets: contenu.length };
}

// Lire un fichier de classes sans rien écrire : on montre d'abord ce qu'il
// contient, l'enseignant choisit ensuite ce qu'on en fait.
function lireFichierDeClasses(fichier) {
    return new Promise((resolve, reject) => {
        const lecteur = new FileReader();
        lecteur.onerror = () => reject(new Error('Fichier illisible'));
        lecteur.onload = () => {
            let data;
            try { data = JSON.parse(lecteur.result); }
            catch (e) { return reject(new Error("Ce fichier n'est pas une sauvegarde de classes.")); }
            if (!data || !Array.isArray(data.classes)) {
                return reject(new Error("Ce fichier ne contient pas de classes."));
            }
            resolve(data);
        };
        lecteur.readAsText(fichier);
    });
}

// Deux gestes clairement séparés, plutôt qu'un arbitrage silencieux :
//   « compléter » n'ajoute que ce qui manque et ne touche à rien d'existant ;
//   « remplacer » écrase tout par le fichier.
// Les points d'un même élève des deux côtés ne se fusionnent pas : personne
// ne saurait dire lequel garder.
async function poserLesClasses(data, maniere) {
    const locales = await ClassesStore.loadAll();
    poserLesBadges(data);

    if (maniere === 'remplacer') {
        await ClassesStore.saveAll(data.classes.map(c => ({ ...c, updatedAt: Date.now() })));
        return { classes: data.classes.length, ajoutees: data.classes.length, elevesAjoutes: 0 };
    }

    const clef = (t) => String(t || '').trim().toLowerCase();
    const fusion = locales.map(c => ({ ...c }));
    let ajoutees = 0, elevesAjoutes = 0;

    data.classes.forEach(venue => {
        const place = fusion.find(c => c.id === venue.id)
            || fusion.find(c => clef(c.name) === clef(venue.name));
        if (!place) {
            fusion.push({ ...venue, id: venue.id || ClassesStore.newId('class'), updatedAt: Date.now() });
            ajoutees++;
            return;
        }
        const connus = new Set((place.students || []).map(s => clef(s.name)));
        const ids = new Set((place.students || []).map(s => s.id));
        (venue.students || []).forEach(e => {
            if (connus.has(clef(e.name)) || ids.has(e.id)) return;
            place.students = (place.students || []).concat([
                { ...e, id: ids.has(e.id) ? ClassesStore.newId('stu') : (e.id || ClassesStore.newId('stu')) }
            ]);
            connus.add(clef(e.name));
            elevesAjoutes++;
        });
        place.updatedAt = Date.now();
    });

    await ClassesStore.saveAll(fusion);
    return { classes: fusion.length, ajoutees, elevesAjoutes };
}
window.sauverLesClasses = sauverLesClasses;
window.lireFichierDeClasses = lireFichierDeClasses;
window.poserLesClasses = poserLesClasses;

// === EXPORT CE TABLEAU ===
const btnExportCurrentBoard = document.getElementById('btn-export-current-board');
if (btnExportCurrentBoard) {
    btnExportCurrentBoard.addEventListener('click', promptExportCurrentBoard);
}

function hasMedias(boardData) {
    // Vérifier s'il y a des images
    if (boardData && boardData.pages) {
        return boardData.pages.some(p => p.images && p.images.length > 0);
    }
    return false;
}

function showExportOptionsModal(board) {
    debugLog("🎨 INFO", "showExportOptionsModal() appelée");

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center;';
    debugLog("📦 INFO", "Modal créée");

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background: var(--surface); border-radius: 12px; padding: 25px; max-width: 500px; box-shadow: var(--shadow-hover);';
    debugLog("📦 INFO", "Box créée");

    // Comptage rapide (sans deep copy)
    debugLog("🔢 INFO", "Comptage des médias...");
    const pagesTotalCount = board.data.pages.length;
    const filesList = [];
    let pdfCount = 0, imageCount = 0;

    const t0 = performance.now();
    board.data.pages.forEach((p, pidx) => {
        if (p.images && p.images.length > 0) {
            p.images.forEach((img, iidx) => {
                // ✅ Utiliser le nom original du fichier si disponible, sinon générer un nom
                const fname = img.fileName || `Image ${iidx + 1}`;
                if (!filesList.find(f => f.name === fname)) {
                    filesList.push({ name: fname, type: 'image', id: `img_${pidx}_${iidx}` });
                }
                imageCount++;
            });
        }
        if (p.pdfMetadata) {
            const pdfName = `PDF Page ${pidx + 1}`;
            if (!filesList.find(f => f.name === pdfName)) {
                filesList.push({ name: pdfName, type: 'pdf', id: `pdf_${pidx}` });
            }
            pdfCount++;
        }
    });
    const t1 = performance.now();
    debugLog("✅ OK", `Comptage terminé en ${(t1 - t0).toFixed(2)}ms`, { pdfCount, imageCount, filesList: filesList.length, pagesTotalCount });

    const state = {
        includeMedias: true, // Images + PDFs convertis en images
        includeHistory: false, // Désactivé par défaut (économise ~90%)
        includePdfs: true, // ✅ PDFs comme images - activé par défaut (avec position/taille/transformations)
        selectedFiles: new Set(filesList.map(f => f.id)),
        selectedPages: new Set(Array.from({length: pagesTotalCount}, (_, i) => i))
    };

    // Build HTML avec options avancées complètes
    let advancedHtml = '';

    // Section Fichiers importés
    if (filesList.length > 0) {
        advancedHtml += `
            <div style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;">
                <label style="display: block; font-size: 11px; font-weight: bold; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">Fichiers importés (${filesList.length})</label>
                <div style="max-height: 120px; overflow-y: auto; background: var(--bg); border-radius: 4px; padding: 8px;">
        `;
        filesList.forEach(file => {
            // Extraire extension et type
            const ext = file.name.split('.').pop().toUpperCase() || file.type.toUpperCase();
            const typeLabel = file.type === 'pdf' ? 'PDF' : 'IMAGE';
            const icon = file.type === 'pdf' ? '📄' : '🖼️';

            advancedHtml += `
                <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px;">
                    <input type="checkbox" class="export-file-checkbox" data-id="${file.id}" checked style="cursor: pointer;">
                    <span>${icon} ${file.name}</span>
                    <span style="color: var(--muted); font-size: 11px;">(${ext})</span>
                </label>
            `;
        });
        advancedHtml += `</div></div>`;
    }

    // Section Options supplémentaires
    advancedHtml += `
        <div style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;">
            <label style="display: block; font-size: 11px; font-weight: bold; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">Options</label>
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px;">
                <input type="checkbox" id="export-pdfs-checkbox" checked style="cursor: pointer;">
                <span>Inclure les PDFs (position/taille/rotation)</span>
                <span style="color: var(--muted); font-size: 10px;">+${pdfCount > 0 ? Math.round((imageCount * 50) / 1024) : 0} MB</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px;">
                <input type="checkbox" id="export-history-checkbox" style="cursor: pointer;">
                <span>Inclure l'historique (Undo/Redo)</span>
                <span style="color: var(--muted); font-size: 10px;">+90% taille</span>
            </label>
        </div>
    `;

    // Section Pages
    advancedHtml += `
        <div style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 15px;">
            <label style="display: block; font-size: 11px; font-weight: bold; color: var(--muted); text-transform: uppercase; margin-bottom: 8px;">Pages (${pagesTotalCount})</label>
            <div style="max-height: 120px; overflow-y: auto; background: var(--bg); border-radius: 4px; padding: 8px;">
    `;

    if (pagesTotalCount <= 5) {
        for (let i = 0; i < pagesTotalCount; i++) {
            advancedHtml += `
                <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px;">
                    <input type="checkbox" class="export-page-checkbox" data-page="${i}" checked style="cursor: pointer;">
                    <span>Page ${i + 1}</span>
                </label>
            `;
        }
    } else {
        advancedHtml += `
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px; margin-bottom: 8px;">
                <input type="radio" name="page-range" value="all" checked style="cursor: pointer;">
                <span>Toutes les ${pagesTotalCount} pages</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; font-size: 12px;">
                <input type="radio" name="page-range" value="specific" style="cursor: pointer;">
                <span>Pages spécifiques</span>
            </label>
            <div id="page-range-input" style="display: none; padding: 8px; background: var(--accent-soft); border-radius: 4px; margin-top: 8px; font-size: 11px;">
                <input type="text" id="pages-input" placeholder="Ex: 1,3,5-7" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; box-sizing: border-box;">
            </div>
        `;
    }

    advancedHtml += `</div></div>`;

    let summaryText = `${filesList.length} fichier${filesList.length !== 1 ? 's' : ''} — Toutes pages`;

    // ---------------------------------------------------
    // LE POIDS DU FICHIER
    // Il était deviné (100 octets par point, 50 000 par image) puis « corrigé »
    // par une mesure qui oubliait la table d'images : les deux chiffres étaient
    // faux, et le complet comptait même ses images deux fois. On mesure
    // maintenant exactement ce qui sera écrit, table comprise — c'est un
    // stringify, il est rapide, et il dit la vérité du premier coup.
    // ---------------------------------------------------
    const poidsDeLexport = (avecMedias) => {
        const pages = (board.data.pages || []).map(p => ({
            points: p.points || [], segments: p.segments || [], circles: p.circles || [],
            rectangles: p.rectangles || [], texts: p.texts || [], freehands: p.freehands || [],
            curves: p.curves || [], polygons: p.polygons || [], arcs: p.arcs || [],
            htmlPostits: p.htmlPostits || [],
            panX: p.panX || 0, panY: p.panY || 0, zoom: p.zoom || 1,
            pdfMetadata: p.pdfMetadata,
            images: avecMedias ? (p.images || []) : []
        }));
        const charge = {
            id: board.id, name: board.name,
            data: {
                pages,
                assets: (typeof collectAssets === 'function' && avecMedias) ? collectAssets(pages) : {},
                nextId: board.data.nextId, globalZ: board.data.globalZ,
                currentBgIndex: board.data.currentBgIndex
            }
        };
        return new Blob([JSON.stringify(charge)], { type: 'application/json' }).size;
    };

    let sizeLight, sizeComplete;
    try {
        sizeLight = poidsDeLexport(false);
        sizeComplete = poidsDeLexport(true);
    } catch (e) {
        debugLog("⚠️ WARN", "Poids de l'export incalculable", e);
        sizeLight = sizeComplete = 0;
    }

    let summaryTextSizes = `${filesList.length} fichier${filesList.length !== 1 ? 's' : ''} — Toutes pages`;

    box.innerHTML = `
        <h3 style="margin-top: 0; color: var(--accent); margin-bottom: 10px;">Exporter "${board.name}"</h3>

        <div style="margin-bottom: 20px;">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="export-light-btn" class="btn-action secondary" style="flex: 1; padding: 12px; font-size: 13px; font-weight: bold;">
                    📦 Léger<br/><span style="font-size: 11px; font-weight: normal;">${formatSize(sizeLight)}</span>
                </button>
                <button id="export-full-btn" class="btn-action primary" style="flex: 1; padding: 12px; font-size: 13px; font-weight: bold;">
                    📁 Complet<br/><span style="font-size: 11px; font-weight: normal;">${formatSize(sizeComplete)}</span>
                </button>
            </div>

            <div id="options-panel" style="border: 1px solid var(--border); border-radius: 6px; background: var(--bg-hover);">
                <button id="options-toggle" style="width: 100%; padding: 12px; background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: bold; color: var(--muted); text-transform: uppercase;">
                    <span>▼ Options avancées</span>
                    <span id="options-summary" style="font-size: 11px; font-weight: normal; color: var(--ink);">${summaryText}</span>
                </button>
                <div id="options-content" style="padding: 0 12px 12px 12px; display: none; border-top: 1px solid var(--border);">
                    ${advancedHtml}
                </div>
            </div>
        </div>

        <div style="display: flex; gap: 10px;">
            <button id="export-cancel-btn" class="btn-action secondary" style="flex: 1; padding: 10px;">Annuler</button>
            <button id="export-next-btn" class="btn-action primary" style="flex: 1; padding: 10px;">Suivant →</button>
        </div>
    `;

    debugLog("📝 INFO", "Construction du HTML terminée");

    // ⚠️ IMPORTANT: Ajouter box à modal AVANT d'ajouter au DOM
    modal.appendChild(box);

    debugLog("📍 INFO", "Ajout de la modal au DOM...");

    const t2 = performance.now();
    document.body.appendChild(modal);
    const t3 = performance.now();

    debugLog("✅ OK", `Modal ajoutée au DOM en ${(t3 - t2).toFixed(2)}ms`);

    // Event listeners - accéder aux éléments APRÈS les avoir ajoutés au DOM
    debugLog("🔗 INFO", "Configuration des event listeners...");

    const toggleBtn = document.getElementById('options-toggle');
    const content = document.getElementById('options-content');
    let isOpen = false;

    debugLog(`${toggleBtn ? '✅' : '❌'} INFO`, "Éléments trouvés", { toggleBtn: !!toggleBtn, content: !!content });

    if (toggleBtn) {
        debugLog("🎯 INFO", "Toggle button configuré");
        toggleBtn.onclick = () => {
            isOpen = !isOpen;
            content.style.display = isOpen ? 'block' : 'none';
            toggleBtn.querySelector('span').textContent = isOpen ? '▲ Options avancées' : '▼ Options avancées';
        };
    }

    // PDFs checkbox
    const pdfsCheckbox = document.getElementById('export-pdfs-checkbox');
    if (pdfsCheckbox) {
        pdfsCheckbox.onchange = () => {
            state.includePdfs = pdfsCheckbox.checked;
            updateOptionsSummary();
        };
    }

    // Historique checkbox
    const historyCheckbox = document.getElementById('export-history-checkbox');
    if (historyCheckbox) {
        historyCheckbox.onchange = () => {
            state.includeHistory = historyCheckbox.checked;
            updateOptionsSummary();
        };
    }

    // Fichiers checkboxes
    document.querySelectorAll('.export-file-checkbox').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) {
                state.selectedFiles.add(cb.dataset.id);
            } else {
                state.selectedFiles.delete(cb.dataset.id);
            }
            updateOptionsSummary();
        };
    });

    // Pages checkboxes
    document.querySelectorAll('.export-page-checkbox').forEach(cb => {
        cb.onchange = () => {
            if (cb.checked) {
                state.selectedPages.add(parseInt(cb.dataset.page));
            } else {
                state.selectedPages.delete(parseInt(cb.dataset.page));
            }
            updateOptionsSummary();
        };
    });

    // Radio pour pages
    document.querySelectorAll('input[name="page-range"]').forEach(radio => {
        radio.onchange = () => {
            const rangeInput = document.getElementById('page-range-input');
            if (radio.value === 'specific') {
                rangeInput.style.display = 'block';
            } else {
                rangeInput.style.display = 'none';
                state.selectedPages = new Set(Array.from({length: pagesTotalCount}, (_, i) => i));
            }
            updateOptionsSummary();
        };
    });

    function updateOptionsSummary() {
        const filesCount = state.selectedFiles.size;
        const pagesCount = state.selectedPages.size;
        let summary = filesCount === filesList.length ? 'Tous fichiers' : `${filesCount} fichier${filesCount > 1 ? 's' : ''}`;
        summary += ` — ${pagesCount === pagesTotalCount ? 'Toutes pages' : `${pagesCount} page${pagesCount > 1 ? 's' : ''}`}`;
        const el = document.getElementById('options-summary');
        if (el) el.textContent = summary;
    }

    debugLog("🔘 INFO", "Configuration des boutons...");

    const lightBtn = document.getElementById('export-light-btn');
    const fullBtn = document.getElementById('export-full-btn');
    const cancelBtn = document.getElementById('export-cancel-btn');
    const nextBtn = document.getElementById('export-next-btn');

    debugLog(`${lightBtn && fullBtn && cancelBtn && nextBtn ? '✅' : '❌'} INFO`, "Boutons trouvés", {
        lightBtn: !!lightBtn,
        fullBtn: !!fullBtn,
        cancelBtn: !!cancelBtn,
        nextBtn: !!nextBtn
    });

    if (lightBtn) lightBtn.onclick = () => { debugLog("💾 INFO", "Léger cliqué"); state.includeMedias = false; proceedToNaming(); };
    if (fullBtn) fullBtn.onclick = () => { debugLog("💾 INFO", "Complet cliqué"); state.includeMedias = true; proceedToNaming(); };
    if (cancelBtn) cancelBtn.onclick = () => { debugLog("❌ INFO", "Annuler cliqué"); document.body.removeChild(modal); };
    if (nextBtn) nextBtn.onclick = proceedToNaming;

    debugLog("✅ SUCCESS", "showExportOptionsModal() configurée complètement !");

    function proceedToNaming() {
        debugLog("➡️ INFO", "proceedToNaming() appelée", { includeMedias: state.includeMedias, includeHistory: state.includeHistory, selectedPages: state.selectedPages.size });

        document.body.removeChild(modal);
        debugLog("📍 INFO", "Modal fermée");

        // Créer le board filtré SANS deep copy (pour éviter de bloquer le navigateur)
        debugLog("📋 INFO", "Filtrage des pages...", { pagesSelected: state.selectedPages.size });
        const pagesArr = Array.from(state.selectedPages).sort((a, b) => a - b);

        // Créer un board simplifié avec juste les pages sélectionnées
        debugLog("🔧 INFO", "Création du board filtré");
        const filteredBoard = {
            id: board.id,
            name: board.name,
            data: {
                pages: pagesArr.map(i => board.data.pages[i]),
                nextId: board.data.nextId,
                globalZ: board.data.globalZ,
                currentBgIndex: board.data.currentBgIndex
            }
        };
        debugLog("✅ OK", "Board filtré créé", { pagesCount: filteredBoard.data.pages.length });

        // Stocker les options pour l'export
        window._exportOptions = { includeHistory: state.includeHistory, includePdfs: state.includePdfs };

        debugLog("📤 INFO", "Appel de exportCurrentBoard()");
        exportCurrentBoard(state.includeMedias, filteredBoard);
    }
}

function promptExportCurrentBoard() {
    debugLog("📤 START", "promptExportCurrentBoard() appelé", { selectedBoardId, currentBoardName });

    // Récupérer le tableau courant
    let board = null;

    if (selectedBoardId) {
        board = savedTableaux.find(t => t.id === selectedBoardId);
        debugLog("📋 INFO", "Board trouvé dans savedTableaux", { id: board?.id, name: board?.name });
    }

    if (!board) {
        const boardName = (currentBoardName && currentBoardName.trim()) ? currentBoardName : "Tableau sans titre";
        debugLog("📝 INFO", "Création d'un board temporaire", { boardName, pagesCount: pages.length });

        board = {
            id: 'current_export_' + Date.now(),
            name: boardName,
            data: { pages: pages.map((p, idx) => ({
                points: p.points || [],
                segments: p.segments || [],
                circles: p.circles || [],
                rectangles: p.rectangles || [],
                texts: p.texts || [],
                freehands: p.freehands || [],
                curves: p.curves || [],
                polygons: p.polygons || [],
                images: p.images || [],
                arcs: p.arcs || [],
                htmlPostits: p.htmlPostits || [],
                panX: p.panX || 0,
                panY: p.panY || 0,
                zoom: p.zoom || 1,
                pdfMetadata: p.pdfMetadata
            })), nextId, globalZ, currentBgIndex }
        };
    }

    if (!board) {
        debugLog("❌ ERROR", "Aucun board disponible");
        showToast("❌ Aucun tableau à exporter");
        return;
    }

    debugLog("✅ INFO", "Board créé/trouvé", { id: board.id, name: board.name, pagesCount: board.data.pages.length });

    // Vérifier s'il y a des médias
    debugLog("🔍 INFO", "Vérification des médias...");
    const hasMedia = hasMedias(board.data);
    debugLog(`${hasMedia ? '📸' : '📄'} INFO`, `Médias détectés: ${hasMedia}`);

    if (!hasMedia) {
        debugLog("🚀 INFO", "Pas de médias, aller direct au nommage");
        // Pas de médias → aller directement au nommage
        showExportNameModal(board.name, '.prof', (finalName) => {
            debugLog("📝 INFO", "Nom choisi", { finalName });
            doExportCurrentBoard(true, board, finalName);
        });
        return;
    }

    // Avec médias → afficher panneau d'options
    debugLog("⚙️ INFO", "Affichage du panneau d'options");
    showExportOptionsModal(board);
}

function generateNameProposals(baseName) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const h = String(today.getHours()).padStart(2, '0');
    const min = String(today.getMinutes()).padStart(2, '0');

    const monthFr = today.toLocaleDateString('fr-FR', { month: 'long' });
    const monthShort = monthFr.substring(0, 3);

    return [
        `${y}/${m}/${d} - ${baseName}`,
        `${y}/${m}/${d} ${h}:${min} - ${baseName}`,
        `${baseName} ${y}-${m}-${d}`,
        `${baseName}`,
        `${d} ${monthShort} ${y} - ${baseName}`,
        `${baseName} (${d}.${m}.${y})`,
        `${y}-${m}-${d}_${h}-${min} - ${baseName}`,
        `Tableau ${y}${m}${d}`
    ];
}

function showExportNameModal(baseName, extension, onConfirm) {
    const proposals = generateNameProposals(baseName);
    let selectedName = proposals[0];

    // Créer modale
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; justify-content: center; align-items: center;';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background: var(--surface); border-radius: 12px; padding: 25px; max-width: 650px; box-shadow: var(--shadow-hover);';

    // Propositions sur 2 colonnes
    let proposalsHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px;">';
    proposals.forEach((p, idx) => {
        proposalsHtml += `
            <button class="proposal-btn ${idx === 0 ? 'active' : ''}" data-name="${p}"
                style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--ink); cursor: pointer; transition: all 0.2s; font-size: 12px; text-align: left; font-family: monospace; word-break: break-word;">
                ${p}
            </button>
        `;
    });
    proposalsHtml += '</div>';

    box.innerHTML = `
        <h3 style="margin-top: 0; color: var(--accent); margin-bottom: 15px;">Nommer l'export</h3>

        <label style="display: block; font-size: 12px; font-weight: bold; color: var(--muted); margin-bottom: 10px; text-transform: uppercase;">Propositions rapides</label>
        ${proposalsHtml}

        <label style="display: block; font-size: 12px; font-weight: bold; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; margin-top: 15px;">Ou personnaliser</label>
        <input type="text" id="export-name-input" value="${selectedName}" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--ink); font-size: 14px; box-sizing: border-box; margin-bottom: 15px; font-family: monospace;">

        <div style="padding: 12px; background: var(--accent-soft); border-radius: 6px; margin-bottom: 20px; font-size: 12px; word-break: break-all;">
            <strong>Fichier :</strong> <span id="export-name-preview" style="font-family: monospace;">${selectedName}</span>${extension}
        </div>

        <div style="display: flex; gap: 10px;">
            <button id="export-cancel" class="btn-action secondary" style="flex: 1; padding: 10px;">Annuler</button>
            <button id="export-confirm" class="btn-action primary" style="flex: 1; padding: 10px;">Exporter</button>
        </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    const input = document.getElementById('export-name-input');
    const preview = document.getElementById('export-name-preview');
    const proposalBtns = box.querySelectorAll('.proposal-btn');
    const btnCancel = document.getElementById('export-cancel');
    const btnConfirm = document.getElementById('export-confirm');

    // Maj aperçu
    const updatePreview = () => {
        const name = input.value.trim() || proposals[0].label;
        preview.textContent = name;
        selectedName = name;
    };

    // Clic propositions
    proposalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            proposalBtns.forEach(b => {
                b.style.borderColor = 'var(--border)';
                b.style.backgroundColor = 'var(--bg)';
            });
            btn.style.borderColor = 'var(--accent)';
            btn.style.backgroundColor = 'var(--accent-soft)';
            input.value = btn.dataset.name;
            updatePreview();
        });
    });

    // Input personnalisé
    input.addEventListener('input', updatePreview);

    btnCancel.onclick = () => {
        document.body.removeChild(modal);
    };

    btnConfirm.onclick = () => {
        document.body.removeChild(modal);
        onConfirm(selectedName);
    };

    input.focus();
}

function promptExportName(includeMedias, boardObj) {
    showExportNameModal(boardObj.name, '.prof', (finalName) => {
        doExportCurrentBoard(includeMedias, boardObj, finalName);
    });
}

// Logger avec timestamp
function debugLog(level, msg, data = null) {
    const time = new Date().toLocaleTimeString();
    const prefix = `[${time}] ${level}`;
    console.log(`%c${prefix} ${msg}`, `color: ${level.includes('❌') ? 'red' : level.includes('✅') ? 'green' : 'blue'}; font-weight: bold;`);
    if (data) console.log(data);
}

async function doExportCurrentBoard(includeMedias, board, fileName) {
    try {
        debugLog("🚀 START", "Début export", { includeMedias, boardId: board.id, boardName: board.name });
        showToast("⏳ Préparation de l'export...");

        debugLog("📊 INFO", "Analyse du board", {
            pagesCount: board.data.pages.length,
            pagesContent: board.data.pages.map((p, i) => ({
                page: i,
                points: p.points?.length || 0,
                images: p.images?.length || 0,
                texts: p.texts?.length || 0,
                pdfMetadata: p.pdfMetadata ? '✅' : '❌'
            }))
        });

        // Construction du board à exporter
        debugLog("🔧 INFO", "Construction de dataToExport...", { includeHistory: window._exportOptions?.includeHistory, includePdfs: window._exportOptions?.includePdfs });
        const dataToExport = {
            id: board.id,
            name: board.name,
            data: {
                pages: board.data.pages.map(p => {
                    // ✅ Filtrer les images du PDF si includePdfs est false
                    let imagesToExport = includeMedias ? (p.images || []) : [];
                    let pdfMetadataToExport = p.pdfMetadata;

                    if (!window._exportOptions?.includePdfs && p.pdfMetadata) {
                        // Exclure les images du PDF (isBg: true) mais garder les images importées directement
                        imagesToExport = imagesToExport.filter(img => !img.isBg);
                    } else if (window._exportOptions?.includePdfs && p.pdfMetadata) {
                        // ✅ Si les images du PDF sont incluses, ne pas exporter les métadonnées (elles seraient inutiles)
                        pdfMetadataToExport = null;
                    }

                    return {
                        points: p.points || [],
                        segments: p.segments || [],
                        circles: p.circles || [],
                        rectangles: p.rectangles || [],
                        texts: p.texts || [],
                        freehands: p.freehands || [],
                        curves: p.curves || [],
                        polygons: p.polygons || [],
                        arcs: p.arcs || [],
                        htmlPostits: p.htmlPostits || [],
                        // ✅ Inclure l'historique seulement si l'option est activée
                        history: window._exportOptions?.includeHistory ? (p.history || []) : [],
                        historyIndex: window._exportOptions?.includeHistory ? (p.historyIndex !== undefined ? p.historyIndex : -1) : -1,
                        panX: p.panX || 0,
                        panY: p.panY || 0,
                        zoom: p.zoom || 1,
                        pdfMetadata: pdfMetadataToExport,
                        images: imagesToExport
                    };
                }),
                nextId: board.data.nextId,
                globalZ: board.data.globalZ,
                currentBgIndex: board.data.currentBgIndex
            }
        };

        // Les images d'un tableau ne sont plus recopiées dans chaque objet :
        // l'objet porte une référence, et les sources vivent dans une table
        // commune. Sans elle dans le fichier, l'export « Complet » ne
        // contenait que des références vides — toutes les images étaient
        // perdues à la réouverture, et le fichier pesait quelques octets.
        dataToExport.data.assets = collectAssets(dataToExport.data.pages);

        // ✅ Inclure les classes (élèves) stockées, utilisées par randomDrawTool etc.
        if (typeof ClassesStore !== 'undefined') {
            dataToExport.classes = await ClassesStore.loadAll();
        }

        debugLog("📦 INFO", "Objet prêt pour stringify");
        showToast("⏳ Sérialisation...");

        const t1 = performance.now();
        debugLog("⏱️ INFO", "Début JSON.stringify()...");
        const dataStr = JSON.stringify(dataToExport);
        const t2 = performance.now();
        debugLog("✅ OK", `Stringify terminé en ${(t2 - t1).toFixed(2)}ms`, { strLength: dataStr.length });

        showToast("⏳ Téléchargement...");
        debugLog("📝 INFO", "Création du Blob...");

        const blob = new Blob([dataStr], { type: "application/json" });
        const finalSize = blob.size;
        debugLog("✅ OK", "Blob créé", { sizeBytes: finalSize, sizeMB: (finalSize / 1024 / 1024).toFixed(2) });

        debugLog("🔗 INFO", "Création du lien de téléchargement...");
        const url = URL.createObjectURL(blob);
        debugLog("✅ OK", "ObjectURL créé");

        debugLog("⬇️ INFO", "Déclenchement du téléchargement...");
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.prof`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
            URL.revokeObjectURL(url);
            debugLog("🧹 INFO", "ObjectURL révoqué");
        }, 100);

        debugLog("✅ SUCCESS", "Export terminé avec succès !", { fileName, size: `${(finalSize / 1024 / 1024).toFixed(2)} MB` });
        showToast(`✅ Exporté ! ${formatSize(finalSize)}`);
    } catch (err) {
        debugLog("❌ ERROR", "Erreur dans l'export", { error: err.message, stack: err.stack });
        showToast("❌ Erreur d'exportation");
    }
}

function exportCurrentBoard(includeMedias = true, boardObj = null) {
    debugLog("📥 INFO", "exportCurrentBoard() appelée", { includeMedias, hasBoardObj: !!boardObj });

    let board = boardObj;

    if (!board) {
        debugLog("⚠️ INFO", "Pas de boardObj, chercher/créer un board");
        if (selectedBoardId) {
            board = savedTableaux.find(t => t.id === selectedBoardId);
        } else if (currentBoardName) {
            board = {
                id: 'current_export_' + Date.now(),
                name: currentBoardName,
                // sans l'historique d'annulation : il alourdissait le fichier sans servir
                data: { pages: [{ points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs, htmlPostits, panX, panY, zoom }], nextId, globalZ, currentBgIndex }
            };
        }
    }

    if (!board) return;

    promptExportName(includeMedias, board);
}

function promptExportWorkspace() {
    const modal = document.getElementById('workspace-options-modal');
    const titleEl = document.getElementById('ws-options-title');
    const textEl = document.getElementById('ws-options-text');

    titleEl.innerText = "Exporter tous les tableaus";
    titleEl.style.color = "#0984e3";

    // Estimer les tailles. « savedTableaux » n'est que la liste : le contenu
    // de chaque tableau vit à part, sous « data_<id> ». On lisait donc t.data,
    // qui n'existe pas, et l'on annonçait 0 octets quel que soit le travail
    // enregistré. La lecture est asynchrone : on affiche d'abord, on chiffre
    // ensuite, et les boutons se mettent à jour quand le compte est fait.
    let totalSizeWithImages = 0;
    let totalSizeWithoutImages = 0;
    let btnLightweight = null, btnComplete = null;

    textEl.innerHTML = `📊 Taille estimée : calcul en cours…`;

    const chiffrer = async () => {
        const liste = savedTableaux || [];
        for (const t of liste) {
            let contenu = t.data;
            if (!contenu) {
                try { contenu = await localforage.getItem('data_' + t.id); }
                catch (e) { contenu = null; }
            }
            if (!contenu) continue;
            totalSizeWithImages += calculateObjectSize(contenu);

            const copie = JSON.parse(JSON.stringify(contenu));
            if (copie.pages) copie.pages.forEach(p => { if (p.images) p.images = []; });
            // Vider les images sans vider la table où vivent leurs sources
            // laissait tout le poids dans la version « légère ».
            delete copie.assets;
            totalSizeWithoutImages += calculateObjectSize(copie);
        }
        textEl.innerHTML = showMediasWarning(totalSizeWithImages, totalSizeWithoutImages);
        if (btnLightweight) btnLightweight.textContent = `Léger (${formatSize(totalSizeWithoutImages)})`;
        if (btnComplete) btnComplete.textContent = `Complet (${formatSize(totalSizeWithImages)})`;
    };

    // Recréer les boutons (effacer tous les anciens)
    const modalBox = modal.querySelector('.modal-box');
    const existingBtns = modalBox.querySelectorAll('div[style*="display: flex"]');
    existingBtns.forEach(btn => {
        if (btn !== textEl && btn.parentNode === modalBox) {
            btn.remove();
        }
    });

    const newBtnDiv = document.createElement('div');
    newBtnDiv.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-action secondary';
    btnCancel.textContent = 'Annuler';
    btnCancel.style.flex = '1';
    btnCancel.onclick = () => { modal.style.display = 'none'; };
    newBtnDiv.appendChild(btnCancel);

    btnLightweight = document.createElement('button');
    btnLightweight.className = 'btn-action secondary';
    btnLightweight.textContent = 'Léger…';
    btnLightweight.style.flex = '1';
    btnLightweight.onclick = () => { modal.style.display = 'none'; exportWorkspace(true, false); };
    newBtnDiv.appendChild(btnLightweight);

    btnComplete = document.createElement('button');
    btnComplete.className = 'btn-action primary';
    btnComplete.textContent = 'Complet…';
    btnComplete.style.flex = '1';
    btnComplete.onclick = () => { modal.style.display = 'none'; exportWorkspace(true, true); };
    newBtnDiv.appendChild(btnComplete);

    modalBox.appendChild(newBtnDiv);
    modal.style.display = 'flex';
    return chiffrer();
}

async function exportWorkspace(includeInterface, includeMedias = true) {
    try {
        if (typeof showToast === 'function') showToast("⏳ Préparation de l'exportation...");

        const workspaceData = await getWorkspaceData();

        // ✅ Inclure les classes (élèves) stockées, utilisées par randomDrawTool etc.
        if (typeof ClassesStore !== 'undefined') {
            workspaceData.classes = await ClassesStore.loadAll();
        }

        if (!includeInterface) {
            delete workspaceData.interfaces;
            delete workspaceData.toolbars;
            delete workspaceData.favorites;
        }

        // Si export léger, supprimer les images ET la table où vivent leurs
        // sources : sans cela le fichier « léger » pesait aussi lourd que
        // l'autre, les images étant simplement devenues invisibles.
        if (!includeMedias && workspaceData.tableaux) {
            workspaceData.tableaux.forEach(t => {
                if (t.data && t.data.pages) {
                    t.data.pages.forEach(p => { if (p.images) p.images = []; });
                    delete t.data.assets;
                }
            });
        }

        const dataStr = JSON.stringify(workspaceData);
        const finalSize = new Blob([dataStr], { type: 'application/json' }).size;
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `Mon_Espace_AuTableau_${dateStr}.autableau`;

        document.body.appendChild(a);
        a.click();

        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        if (typeof showToast === 'function') showToast(`✅ Espace exporté ! (${formatSize(finalSize)})`);
    } catch (err) {
        console.error("Erreur export :", err);
        if (typeof showToast === 'function') showToast("❌ Erreur d'exportation.");
    }
}

function processWorkspaceData(data) {
    if (Array.isArray(data)) {
        console.log("Ancien format de sauvegarde détecté (tableau). Conversion en cours...");
        data = {
            version: "1.0",
            tableaux: data,
            autoSave: true
        };
    } else if (!data.version && !data.tableaux && !data.interfaces) {
        console.error("Données reçues :", data);
        throw new Error("Format invalide. Le fichier ne contient pas les données attendues.");
    }

    async function doImport(data, includeInterface) {
        if (typeof showToast === 'function') showToast("⏳ Restauration...");

        if (data.tableaux) await localforage.setItem('auTableau_tableaux_list', data.tableaux);
        if (data.autoSave) await localforage.setItem('AuTableau_AutoSave', data.autoSave);

        if (data.boardsData) {
            for (const id in data.boardsData) {
                await localforage.setItem('data_' + id, data.boardsData[id]);
            }
        }

        if (includeInterface) {
            if (data.interfaces) localStorage.setItem('auTableau_interfaces_list', JSON.stringify(data.interfaces));
            if (data.toolbars) localStorage.setItem('board_floating_toolbars', JSON.stringify(data.toolbars));
            if (data.favorites) localStorage.setItem('board_favorites', JSON.stringify(data.favorites));
        }

        // ✅ Réconcilier les classes (élèves) éventuellement incluses dans l'export
        // (avant le reload, pour laisser le temps à l'utilisateur de résoudre les conflits éventuels)
        if (data.classes && typeof ClassesStore !== 'undefined') {
            if (typeof showToast === 'function') showToast("✅ Restauration réussie !");
            poserLesBadges(data);
            await ClassesStore.reconcileImport(data.classes);
            showToast("🔄 Rechargement...");
            setTimeout(() => window.location.reload(), 800);
            return;
        }

        if (typeof showToast === 'function') showToast("✅ Restauration réussie ! Rechargement...");
        setTimeout(() => window.location.reload(), 1500);
    }

    if (data.interfaces || data.toolbars) {
        const modal = document.getElementById('workspace-options-modal');
        document.getElementById('ws-options-title').innerText = "Restaurer l'espace";
        document.getElementById('ws-options-title').style.color = "#d63031";
        document.getElementById('ws-options-text').innerText = "Ce fichier contient une interface (menus, favoris). Voulez-vous l'importer en plus de vos tableaux ? (Attention, cela remplacera vos données actuelles).";
        document.getElementById('ws-options-yes-btn').innerText = "Importer avec l'interface";
        document.getElementById('ws-options-no-btn').innerText = "Seulement les tableaux";
        
        modal.style.display = 'flex';
        document.getElementById('ws-options-yes-btn').onclick = () => {
            modal.style.display = 'none';
            doImport(data, true);
        };
        document.getElementById('ws-options-no-btn').onclick = () => {
            modal.style.display = 'none';
            doImport(data, false);
        };
    } else {
        openConfirmModal(
            "Restaurer l'espace",
            "L'importation va remplacer tous vos tableaux actuels. Continuer ?",
            true,
            () => doImport(data, false)
        );
    }
}

function importWorkspace(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            processWorkspaceData(data);
        } catch (err) {
            console.error("Erreur import :", err);
            if (typeof showToast === 'function') showToast("❌ Fichier invalide.");
        }
    };
    reader.readAsText(file);
}
// ==============================================================
// HTML DOM POST-ITS WIDGET
// ==============================================================

function renderHtmlPostits() {
    const container = document.getElementById('html-postits-container');
    if (!container) return;
    
    // On garde la trace des post-its rendus pour éviter de les recréer (on les met à jour)
    const existing = Array.from(container.children);
    const existingIds = existing.map(el => parseInt(el.dataset.id));
    
    // Supprimer ceux qui n'existent plus dans le state
    existing.forEach(el => {
        if (!htmlPostits.find(p => p.id === parseInt(el.dataset.id))) {
            el.remove();
        }
    });

    htmlPostits.forEach(p => {
        let el = container.querySelector(`[data-id="${p.id}"]`);
        
        if (!el) {
            el = document.createElement('div');
            el.className = 'html-postit';
            el.dataset.id = p.id;
            
            el.innerHTML = `
                <div class="html-postit-header">
                    <div class="html-postit-colors">
                        <span class="postit-dot cycle-color"></span>
                        <span class="postit-titre" title="Double-cliquer sur la barre pour donner un titre"></span>
                    </div>
                    <div class="html-postit-actions">
                        <span class="postit-avancement" title="Tâches faites"></span>
                        <button class="btn-copier-postit" title="Copier le contenu"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path></svg></button>
                        <button class="btn-coller-postit" title="Coller à la fin"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1"></rect></svg></button>
                        <button class="btn-liste-postit" title="Transformer en liste à cocher"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 5 9 9 5"></polyline><polyline points="3 16 5 18 9 14"></polyline><line x1="12" y1="7" x2="21" y2="7"></line><line x1="12" y1="17" x2="21" y2="17"></line></svg></button>
                        <button class="btn-min-postit" title="Minimiser"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
                        <button class="btn-close-postit" title="Fermer"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                </div>
                <textarea class="html-postit-body"></textarea>
                <div class="html-postit-liste"></div>
            `;
            el.style.backgroundColor = p.bg;
            container.appendChild(el);
            
            const header = el.querySelector('.html-postit-header');
            const body = el.querySelector('.html-postit-body');
            
            el.querySelector('.cycle-color').style.backgroundColor = p.bg;
            body.style.backgroundColor = p.bg; // Force body color explicitly
            body.style.fontSize = (p.fontSize || 20) + 'px';

            
            // Interaction: Colors
            const retroColors = ['#fdfd96', '#ffb7b2', '#b5ead7', '#c7ceea', '#e2f0cb', '#e0c3fc', '#ffdac1', '#f0e6ef', '#a0e8af', '#ffffff'];
            el.querySelector('.cycle-color').addEventListener('click', () => {
                const currentP = htmlPostits.find(hp => hp.id === p.id);
                if (currentP) {
                    let idx = retroColors.indexOf(currentP.bg);
                    idx = (idx + 1) % retroColors.length;
                    currentP.bg = retroColors[idx];
                    el.style.backgroundColor = currentP.bg;
                    body.style.backgroundColor = currentP.bg; // Force body color explicitly
                    el.querySelector('.cycle-color').style.backgroundColor = currentP.bg;
                    saveState();
                }
            });
            
            // La taille et la police se réglaient par trois boutons dans l'en-tête.
            // Ils encombraient une barre de 28 px pour un réglage qu'on touche
            // une fois par an : le post-it prend maintenant la police de
            // l'application. Les valeurs déjà choisies restent respectées.

            // ---- La liste à cocher ----------------------------------------
            // Le même post-it, dans un autre mode : on bascule sans rien
            // perdre, chaque ligne du texte devient une tâche, et l'inverse.
            const liste = el.querySelector('.html-postit-liste');
            const avancement = el.querySelector('.postit-avancement');

            const tachesDe = (o) => (o.taches || (o.taches = []));

            const majAvancement = (o) => {
                if (o.mode !== 'liste') { avancement.textContent = ''; return; }
                const t = tachesDe(o);
                const faites = t.filter(x => x.fait).length;
                avancement.textContent = t.length ? `${faites}/${t.length}` : '';
                avancement.classList.toggle('fini', !!t.length && faites === t.length);
            };

            // Une ligne de la liste. On la redessine entièrement à chaque
            // changement de structure : c'est court, et cela évite les
            // désynchronisations entre l'écran et les données.
            const peindreListe = (focusIdx) => {
                const o = htmlPostits.find(hp => hp.id === p.id) || p;
                liste.innerHTML = '';
                tachesDe(o).forEach((tache, i) => {
                    const ligne = document.createElement('div');
                    ligne.className = 'postit-tache' + (tache.fait ? ' faite' : '');
                    ligne.innerHTML = `<button class="postit-case" role="checkbox"
                            aria-checked="${tache.fait}" title="${tache.fait ? 'Pas encore fait' : 'C\'est fait'}">
                            ${tache.fait ? '<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"></polyline></svg>' : ''}
                        </button>
                        <div class="postit-tache-texte" spellcheck="false"></div>
                        <button class="postit-tache-oter" title="Retirer cette ligne">×</button>`;
                    const texte = ligne.querySelector('.postit-tache-texte');
                    texte.textContent = tache.t || '';
                    // Chaque ligne était une zone d'édition à part : le
                    // navigateur refuse alors toute sélection qui les traverse,
                    // même faite au programme — impossible de tout prendre pour
                    // le coller ailleurs. La ligne ne devient donc éditable
                    // qu'au moment où l'on clique dedans ; le reste du temps,
                    // la liste est du texte ordinaire, que l'on sélectionne
                    // d'un bout à l'autre comme partout ailleurs.
                    const ouvrirLaSaisie = () => {
                        if (texte.getAttribute('contenteditable') === 'true') return;
                        texte.setAttribute('contenteditable', 'true');
                    };
                    texte.addEventListener('pointerdown', ouvrirLaSaisie);
                    texte.addEventListener('focus', ouvrirLaSaisie);
                    liste.appendChild(ligne);

                    ligne.querySelector('.postit-case').addEventListener('click', () => {
                        tache.fait = !tache.fait;
                        majAvancement(o); peindreListe(); saveState();
                    });
                    ligne.querySelector('.postit-tache-oter').addEventListener('click', () => {
                        tachesDe(o).splice(i, 1);
                        majAvancement(o); peindreListe(Math.max(0, i - 1)); saveState();
                    });
                    texte.addEventListener('input', () => { tache.t = texte.textContent; });
                    texte.addEventListener('blur', () => {
                        tache.t = texte.textContent;
                        texte.removeAttribute('contenteditable');
                        saveState();
                    });
                    texte.addEventListener('paste', (e) => {
                        const brut = (e.clipboardData || window.clipboardData);
                        if (!brut) return;
                        const colle = brut.getData('text/plain') || '';
                        if (!/\r|\n/.test(colle)) return;      // une ligne : collage normal
                        e.preventDefault();
                        const lignes = String(colle).replace(/\r\n?/g, '\n').split('\n')
                            .map(l => l.replace(/\u00a0/g, ' ').replace(/^\s*[-*•]\s*/, '').trim())
                            .filter(l => l.length);
                        if (!lignes.length) return;
                        tache.t = ((texte.textContent || '') + lignes[0]).trim();
                        lignes.slice(1).forEach((l, k) => {
                            tachesDe(o).splice(i + 1 + k, 0, { t: l.replace(/^✔\s*/, ''), fait: /^✔/.test(l) });
                        });
                        majAvancement(o); peindreListe(i + lignes.length - 1); saveState();
                    });
                    texte.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            tache.t = texte.textContent;
                            tachesDe(o).splice(i + 1, 0, { t: '', fait: false });
                            majAvancement(o); peindreListe(i + 1); saveState();
                        } else if (e.key === 'Backspace' && !texte.textContent && tachesDe(o).length > 1) {
                            e.preventDefault();
                            tachesDe(o).splice(i, 1);
                            majAvancement(o); peindreListe(Math.max(0, i - 1)); saveState();
                        }
                    });
                });

                const ajouter = document.createElement('button');
                ajouter.className = 'postit-ajouter';
                ajouter.textContent = '＋ une tâche';
                ajouter.addEventListener('click', () => {
                    tachesDe(o).push({ t: '', fait: false });
                    majAvancement(o); peindreListe(tachesDe(o).length - 1); saveState();
                });
                liste.appendChild(ajouter);

                if (typeof focusIdx === 'number') {
                    const cible = liste.querySelectorAll('.postit-tache-texte')[focusIdx];
                    if (cible) {
                        cible.focus();
                        const s = getSelection(), r = document.createRange();
                        r.selectNodeContents(cible); r.collapse(false);
                        s.removeAllRanges(); s.addRange(r);
                    }
                }
            };

            const appliquerMode = (o, focusIdx) => {
                const enListe = o.mode === 'liste';
                el.classList.toggle('en-liste', enListe);
                body.style.display = enListe ? 'none' : '';
                liste.style.display = enListe ? '' : 'none';
                el.querySelector('.btn-liste-postit').title = enListe
                    ? 'Revenir à la note libre' : 'Transformer en liste à cocher';
                if (enListe) peindreListe(focusIdx);
                majAvancement(o);
            };

            el.querySelector('.btn-liste-postit').addEventListener('click', () => {
                const o = htmlPostits.find(hp => hp.id === p.id); if (!o) return;
                if (o.mode === 'liste') {
                    // On repart en note libre : les tâches redeviennent des
                    // lignes, cochées ou non, rien ne se perd.
                    o.content = tachesDe(o).map(t => (t.fait ? '✔ ' : '') + (t.t || '')).join('\n');
                    body.value = o.content;
                    o.mode = 'texte';
                } else {
                    o.content = body.value;
                    const lignes = String(o.content || '').split('\n')
                        .map(l => l.replace(/^\s*[-*•]\s*/, '').trim());
                    const dejaFaites = tachesDe(o);
                    o.taches = lignes.filter(l => l.length).map(l => ({
                        t: l.replace(/^✔\s*/, ''), fait: /^✔/.test(l)
                    }));
                    if (!o.taches.length) o.taches = dejaFaites.length ? dejaFaites : [{ t: '', fait: false }];
                    o.mode = 'liste';
                }
                appliquerMode(o, o.mode === 'liste' ? 0 : undefined);
                saveState();
            });

            el._postitAppliquerMode = appliquerMode;      // relu à chaque rendu

            // ---- Le titre --------------------------------------------------
            // Trois post-its jaunes se ressemblent tous. Un double-clic sur la
            // barre donne un nom à celui-ci ; vide, il redevient anonyme.
            const titreEl = el.querySelector('.postit-titre');
            const majTitre = (o) => {
                titreEl.textContent = o.titre || '';
                titreEl.classList.toggle('vide', !o.titre);
            };
            const renommer = () => {
                const o = htmlPostits.find(hp => hp.id === p.id); if (!o) return;
                const champ = document.createElement('input');
                champ.className = 'postit-titre-champ';
                champ.value = o.titre || '';
                champ.placeholder = 'Titre du post-it';
                champ.maxLength = 40;
                titreEl.replaceWith(champ);
                champ.focus();
                champ.select();
                // Entrée valide, puis le champ perd le focus et « blur » se
                // déclenche sur un champ déjà retiré : on ne finit qu'une fois.
                let fini = false;
                const finir = (garder) => {
                    if (fini) return;
                    fini = true;
                    if (garder) { o.titre = champ.value.trim(); saveState(); }
                    champ.replaceWith(titreEl);
                    majTitre(o);
                };
                champ.addEventListener('blur', () => finir(true));
                champ.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); finir(true); }
                    if (e.key === 'Escape') { e.preventDefault(); finir(false); }
                });
                champ.addEventListener('pointerdown', (e) => e.stopPropagation());
            };
            header.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, .postit-dot')) return;
                renommer();
            });
            el._postitMajTitre = majTitre;

            // ---- Copier, coller ---------------------------------------------
            // Le contenu se lit et s'écrit dans les deux modes : une note libre
            // donne son texte, une liste donne ses lignes (les faites marquées).
            const litLeContenu = () => {
                const o = htmlPostits.find(hp => hp.id === p.id) || p;
                if (o.mode === 'liste') {
                    return (o.taches || []).map(t => (t.fait ? '✔ ' : '') + (t.t || '')).join('\n');
                }
                return body.value || '';
            };

            el.querySelector('.btn-copier-postit').addEventListener('click', async () => {
                const texte = litLeContenu();
                if (!texte.trim()) {
                    if (typeof showToast === 'function') showToast('Ce post-it est vide');
                    return;
                }
                if (await mettreDansLePressePapiers(texte)) {
                    if (typeof showToast === 'function') {
                        showToast('📋 Contenu copié — collez-le où vous voulez');
                    }
                } else if (typeof showToast === 'function') {
                    showToast('Copie impossible : le navigateur refuse le presse-papiers');
                }
            });

            const o_mode = () => (htmlPostits.find(hp => hp.id === p.id) || p).mode;

            el.querySelector('.btn-coller-postit').addEventListener('click', async () => {
                let texte = '';
                try { texte = await navigator.clipboard.readText(); }
                catch (e) {
                    if (typeof showToast === 'function') {
                        showToast('Collage refusé par le navigateur — cliquez dans le post-it et faites Ctrl+V');
                    }
                    return;
                }
                if (!texte) { if (typeof showToast === 'function') showToast('Presse-papiers vide'); return; }
                ajouterDuTexte(texte);
            });

            // Le texte venu d'ailleurs arrive avec les fins de ligne de son
            // système et, souvent, une ligne vide entre chaque ligne : on
            // normalise avant d'écrire, sinon la liste double de longueur.
            const lignesPropres = (texte) => String(texte)
                .replace(/\r\n?/g, '\n')
                .split('\n')
                .map(l => l.replace(/\u00a0/g, ' ').replace(/^\s*[-*•]\s*/, '').trim())
                .filter(l => l.length);

            const ajouterDuTexte = (texte) => {
                const o = htmlPostits.find(hp => hp.id === p.id); if (!o) return;
                const lignes = lignesPropres(texte);
                if (!lignes.length) return;
                if (o.mode === 'liste') {
                    lignes.forEach(l => tachesDe(o).push({ t: l.replace(/^✔\s*/, ''), fait: /^✔/.test(l) }));
                    majAvancement(o); peindreListe(); saveState();
                } else {
                    o.content = (body.value ? body.value.replace(/\s*$/, '') + '\n' : '') + lignes.join('\n');
                    body.value = o.content;
                    saveState();
                }
                if (typeof showToast === 'function') {
                    showToast('📋 ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : '') + ' collée' + (lignes.length > 1 ? 's' : ''));
                }
            };

            // Un collage direct dans la note passe par le même nettoyage :
            // c'est là que se gagnait la ligne vide sur deux.
            body.addEventListener('paste', (e) => {
                const brut = (e.clipboardData || window.clipboardData);
                if (!brut) return;
                const texte = brut.getData('text/plain');
                if (!texte || !/\r|\n/.test(texte)) return;      // une seule ligne : rien à corriger
                e.preventDefault();
                const lignes = lignesPropres(texte);
                const d = body.selectionStart, f = body.selectionEnd;
                body.value = body.value.slice(0, d) + lignes.join('\n') + body.value.slice(f);
                body.selectionStart = body.selectionEnd = d + lignes.join('\n').length;
                const o = htmlPostits.find(hp => hp.id === p.id);
                if (o) { o.content = body.value; saveState(); }
            });

            el._postitColler = ajouterDuTexte;

            // Interaction: Minimize
            el.querySelector('.btn-min-postit').addEventListener('click', () => {
                const currentP = htmlPostits.find(hp => hp.id === p.id);
                if (currentP) {
                    currentP.minimized = !currentP.minimized;
                    if (currentP.minimized) {
                        el.classList.add('minimized');
                    } else {
                        el.classList.remove('minimized');
                    }
                    saveState();
                }
            });
            
            // Interaction: Close
            el.querySelector('.btn-close-postit').addEventListener('click', () => {
                htmlPostits = htmlPostits.filter(hp => hp.id !== p.id);
                saveState();
                renderHtmlPostits();
            });
            
            // Interaction: Text content
            body.value = p.content;
            body.addEventListener('input', () => {
                const currentP = htmlPostits.find(hp => hp.id === p.id);
                if (currentP) currentP.content = body.value;
                // on ne saveState pas à chaque frappe sinon ça lag
            });
            body.addEventListener('change', () => {
                const currentP = htmlPostits.find(hp => hp.id === p.id);
                if (currentP) {
                    currentP.content = body.value;
                    saveState();
                }
            });
            
            // Resize observer pour sauvegarder la taille
            let resizeTimeout = null;
            new ResizeObserver(() => {
                if (!p.minimized && el.offsetWidth > 0) {
                    // Convert back to logical coords
                    p.w = el.offsetWidth / zoom;
                    p.h = el.offsetHeight / zoom;
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => saveState(), 300);
                }
            }).observe(el);
            
            // Interaction: Dragging
            let isDragging = false;
            let startX, startY;
            header.addEventListener('pointerdown', (e) => {
                // Tout ce qui se clique dans l'en-tête n'est pas une prise pour
                // déplacer le post-it. La liste des boutons était nominative :
                // le premier bouton ajouté ensuite déclenchait un glissement,
                // et son clic n'arrivait jamais (l'en-tête captait le pointeur).
                if (e.target.closest('button, .postit-dot, .postit-avancement')) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                header.setPointerCapture(e.pointerId);
                e.preventDefault();
            });
            header.addEventListener('pointermove', (e) => {
                if (isDragging) {
                    const dx = (e.clientX - startX) / zoom;
                    const dy = (e.clientY - startY) / zoom;
                    p.x += dx;
                    p.y += dy;
                    startX = e.clientX;
                    startY = e.clientY;
                    renderHtmlPostits(); // update this postit visually
                }
            });
            header.addEventListener('pointerup', (e) => {
                if (isDragging) {
                    isDragging = false;
                    header.releasePointerCapture(e.pointerId);
                    saveState();
                }
            });
        }
        
        // Mise à jour de l'apparence
        el.style.backgroundColor = p.bg;
        el.querySelector('.html-postit-body').style.backgroundColor = p.bg;
        
        // La couleur du coin
        const afterStyle = document.createElement('style');
        afterStyle.innerHTML = `.html-postit[data-id="${p.id}"]::after { border-left-color: rgba(255,255,255,0.4); border-bottom-color: rgba(0,0,0,0.15); }`;
        if(!document.head.querySelector(`style[data-postit-id="${p.id}"]`)) {
            afterStyle.dataset.postitId = p.id;
            document.head.appendChild(afterStyle);
        }

        if (p.minimized) {
            el.classList.add('minimized');
            el.style.left = (p.x * zoom + panX) + 'px';
            el.style.top = (p.y * zoom + panY) + 'px';
            el.style.width = (p.w * zoom) + 'px';
            // height est forcé par CSS
        } else {
            el.classList.remove('minimized');
            el.style.left = (p.x * zoom + panX) + 'px';
            el.style.top = (p.y * zoom + panY) + 'px';
            el.style.width = (p.w * zoom) + 'px';
            el.style.height = (p.h * zoom) + 'px';
        }
        
        // Mise à l'échelle du texte si on zoome. On part de la taille choisie
        // pour ce post-it : elle était perdue au premier redessin.
        const body = el.querySelector('.html-postit-body');
        body.style.fontSize = ((p.fontSize || 20) * zoom) + 'px';
        const liste = el.querySelector('.html-postit-liste');
        if (liste) {
            liste.style.fontSize = ((p.fontSize || 20) * zoom) + 'px';

        }

        // Note libre ou liste à cocher : on ne repeint que si le mode change,
        // sinon on effacerait ce que l'on est en train d'écrire.
        if (el._postitMajTitre) el._postitMajTitre(p);

        const modeVoulu = p.mode === 'liste' ? 'liste' : 'texte';
        if (el.dataset.modeAffiche !== modeVoulu && el._postitAppliquerMode) {
            el.dataset.modeAffiche = modeVoulu;
            el._postitAppliquerMode(p);
        }

        el.style.zIndex = p.z || 10;
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function ensureMediaPlayerStyles() {
    if (document.getElementById('media-player-styles')) return;
    const style = document.createElement('style');
    style.id = 'media-player-styles';
    style.innerHTML = `
        .media-player-panel {
            position: fixed; bottom: 20px; right: 20px; width: 320px; min-width: 260px; max-width: 800px;
            display: flex; flex-direction: column;
            background: var(--surface, rgba(255, 255, 255, 0.92)); color: var(--ink, #2d3436); border-radius: 14px;
            box-shadow: var(--shadow-hover, 0 12px 32px rgba(0, 0, 0, .15));
            backdrop-filter: blur(16px);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            z-index: 100000;
            border: 1px solid var(--border, #dfe6e9);
            user-select: none;
            overflow: hidden;
        }
        .media-player-panel.video-panel { width: 420px; }
        .media-player-panel:fullscreen, .media-player-panel:-webkit-full-screen {
            width: 100vw !important; height: 100vh !important; max-width: 100vw;
            border-radius: 0; background: #000;
        }
        /* En plein écran, la vidéo est centrée en position fixe : elle ne bouge jamais,
           les contrôles deviennent une surcouche flottante par-dessus. */
        .media-player-panel:fullscreen .media-video-el, .media-player-panel:-webkit-full-screen .media-video-el {
            /* fixed (et non absolute) : la vidéo est nichée dans .media-body, position:fixed
               l'échappe de ce conteneur pour se centrer sur le viewport entier, indépendamment
               de l'affichage/masquage des contrôles. */
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1;
            width: auto; height: auto; max-width: 100vw; max-height: 100vh; object-fit: contain; margin: 0;
        }
        .media-player-panel:fullscreen .media-header, .media-player-panel:-webkit-full-screen .media-header {
            position: absolute; top: 0; left: 0; right: 0; z-index: 10;
            background: linear-gradient(rgba(0,0,0,0.7), transparent);
            padding: 16px; transition: opacity 0.25s ease;
        }
        .media-player-panel:fullscreen .media-body, .media-player-panel:-webkit-full-screen .media-body {
            position: absolute; left: 0; right: 0; bottom: 0; z-index: 10;
            background: linear-gradient(transparent, rgba(0,0,0,0.75) 45%);
            padding: 40px 20px 16px !important; transition: opacity 0.25s ease;
        }
        .media-player-panel:fullscreen .media-playlist, .media-player-panel:-webkit-full-screen .media-playlist {
            display: none;
        }
        .media-player-panel:fullscreen.controls-hidden .media-header,
        .media-player-panel:fullscreen.controls-hidden .media-body,
        .media-player-panel:-webkit-full-screen.controls-hidden .media-header,
        .media-player-panel:-webkit-full-screen.controls-hidden .media-body {
            opacity: 0; pointer-events: none;
        }
        .media-player-panel:fullscreen.controls-hidden,
        .media-player-panel:-webkit-full-screen.controls-hidden {
            cursor: none;
        }
        .media-player-panel.minimized { resize: none; min-height: 0; height: auto !important; }

        .media-header {
            background: transparent; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;
            cursor: grab;
        }
        .media-title { font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }

        .media-btn {
            background: none; border: none; color: var(--muted, #636e72); cursor: pointer;
            transition: all 0.15s; display: flex; align-items: center; justify-content: center;
            width: 30px; height: 30px; border-radius: 50%;
        }
        .media-btn:hover { color: var(--ink, #2d3436); background: var(--border, #dfe6e9); }
        .media-btn.active-btn { color: var(--accent, #6c5ce7); background: var(--accent-soft, rgba(108, 92, 231, 0.15)); }
        .media-btn:active { transform: scale(0.9); }
        .media-btn-play {
            width: 38px; height: 38px; background: var(--accent, #6c5ce7); color: #fff;
        }
        .media-btn-play:hover { background: var(--accent, #6c5ce7); opacity: 0.85; color: #fff; }

        .media-video-el {
            width: 100%; display: block; background: #000; border-radius: 10px; margin-bottom: 10px;
        }

        .media-progress-wrapper { position: relative; margin: 4px 0 22px; padding-top: 24px; }
        .media-progress-container {
            width: 100%; height: 6px; position: relative; cursor: pointer;
            background: var(--bg, #f5f6fa); border-radius: 999px; overflow: hidden;
        }
        .media-progress-bar { height: 100%; background: var(--accent, #6c5ce7); width: 0%; pointer-events: none; border-radius: 999px; }
        .media-ab-fill { position: absolute; top: 0; height: 100%; background: var(--accent-soft, rgba(108, 92, 231, 0.25)); z-index: 1; display: none; }
        .media-time-row { display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.68rem; font-family: monospace; color: var(--muted, #636e72); }

        .media-ab-pointer {
            position: absolute; top: 22px; cursor: ew-resize; transform: translateX(-50%); z-index: 5;
            width: 10px; height: 10px; border-radius: 50%;
            background: var(--muted, #636e72); border: 2px solid var(--surface, #fff);
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            transition: background-color 0.2s;
        }
        .media-ab-pointer:hover, .media-ab-pointer.active { background: var(--accent, #6c5ce7); }
        .media-ab-label {
            position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
            font-size: 0.55rem; color: var(--muted, #636e72); pointer-events: none; white-space: nowrap; font-family: monospace;
        }

        .media-slider-row { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--muted, #636e72); }
        .media-slider {
            -webkit-appearance: none; appearance: none; width: 60px; height: 4px; border-radius: 999px;
            background: var(--border, #dfe6e9); accent-color: var(--accent, #6c5ce7); cursor: pointer;
        }
        .media-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
            background: var(--accent, #6c5ce7); cursor: pointer;
        }
        .media-slider::-moz-range-thumb {
            width: 12px; height: 12px; border-radius: 50%; border: none;
            background: var(--accent, #6c5ce7); cursor: pointer;
        }

        .media-playlist {
            list-style: none; padding: 4px; margin: 0; overflow-y: auto; max-height: 150px;
            border-top: 1px solid var(--border, #dfe6e9); background: var(--bg, #f5f6fa);
        }
        .media-playlist li {
            padding: 7px 10px; font-size: 0.78rem; border-radius: 8px; margin-bottom: 2px;
            display: flex; justify-content: space-between; align-items: center;
            cursor: grab;
        }
        .media-playlist li.active { background: var(--accent, #6c5ce7); color: #fff; }
        .media-playlist li:hover:not(.active) { background: var(--accent-soft, rgba(108, 92, 231, 0.12)); }
        .media-delete-btn {
            background: none; border: none; color: var(--muted, #636e72); cursor: pointer; padding: 2px 6px; display:flex; align-items:center; justify-content:center; border-radius: 50%;
        }
        .media-delete-btn:hover { color: var(--red, #e74c3c); }
    `;
    document.head.appendChild(style);
}

function createMediaPlayer({ mediaType, idPrefix, defaultTitle, icon }) {
    let playlist = [];
    let currentIndex = 0;
    let container = null;
    let mediaEl = null;

    let loopStart = null, loopEnd = null, loopMode = 0; // 0: off, 1: all, 2: one
    let isABLooping = false;
    let isDragging = false, dragStartX = 0, dragStartY = 0;

    const svgPrev = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>`;
    const svgPlay = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const svgPause = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    const svgNext = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>`;
    const svgLoop = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`;
    const svgPlaySel = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/><path d="M3 4v16h2V4H3zm16 0v16h2V4h-2z"/></svg>`;
    const svgMin = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12h16v2H4z"/></svg>`;
    const svgClose = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    const svgFullscreen = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;

    const id = (suffix) => `${idPrefix}-${suffix}`;
    const el = (suffix) => document.getElementById(id(suffix));

    function build() {
        container = document.createElement('div');
        container.id = id('player');
        container.className = 'media-player-panel' + (mediaType === 'video' ? ' video-panel' : '');

        container.innerHTML = `
            <div id="${id('header')}" class="media-header">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;">
                    <span style="font-size: 0.9rem;">${icon}</span>
                    <span id="${id('title')}" class="media-title">${defaultTitle}</span>
                </div>

                <div id="${id('mini-controls')}" style="display: none; align-items: center; gap: 2px; margin: 0 10px;">
                    <button class="media-btn" id="${id('mini-prev')}" data-tooltip="Piste précédente">${svgPrev}</button>
                    <button class="media-btn" id="${id('mini-play')}" data-tooltip="Lecture / Pause">${svgPlay}</button>
                    <button class="media-btn" id="${id('mini-next')}" data-tooltip="Piste suivante">${svgNext}</button>
                </div>

                <div style="display: flex; align-items: center; gap: 2px;">
                    ${mediaType === 'video' ? `<button class="media-btn" id="${id('fullscreen')}" data-tooltip="Plein écran">${svgFullscreen}</button>` : ''}
                    <button class="media-btn" id="${id('minimize')}" data-tooltip="Réduire">${svgMin}</button>
                    <button class="media-btn" id="${id('close')}" data-tooltip="Fermer">${svgClose}</button>
                </div>
            </div>

            <div id="${id('body')}" class="media-body" style="padding: 4px 14px 14px; display: flex; flex-direction: column;">
                ${mediaType === 'video' ? `<${mediaType} id="${id('media')}" class="media-video-el"></${mediaType}>` : `<${mediaType} id="${id('media')}" style="display:none;"></${mediaType}>`}

                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="media-btn" id="${id('prev')}" data-tooltip="Piste précédente">${svgPrev}</button>
                        <button class="media-btn media-btn-play" id="${id('play')}" data-tooltip="Lecture / Pause">${svgPlay}</button>
                        <button class="media-btn" id="${id('next')}" data-tooltip="Piste suivante">${svgNext}</button>
                    </div>

                    <div class="media-slider-row">
                        <span>Vol</span>
                        <input type="range" class="media-slider" id="${id('volume')}" min="0" max="1" step="0.05" value="1">
                    </div>
                </div>

                <div id="${id('progress-wrapper')}" class="media-progress-wrapper">
                    <div id="${id('progress-container')}" class="media-progress-container">
                        <div id="${id('ab-fill')}" class="media-ab-fill" style="left: 0%; width: 100%;"></div>
                        <div id="${id('progress-bar')}" class="media-progress-bar"></div>
                    </div>
                    <div class="media-ab-pointer" id="${id('ab-thumb-a')}" style="left: 0%;" title="Point A">
                        <span class="media-ab-label" id="${id('ab-time-a')}">0:00</span>
                    </div>
                    <div class="media-ab-pointer" id="${id('ab-thumb-b')}" style="left: 100%;" title="Point B">
                        <span class="media-ab-label" id="${id('ab-time-b')}">0:00</span>
                    </div>
                    <div class="media-time-row">
                        <span id="${id('time-current')}">0:00</span>
                        <span id="${id('time-duration')}">0:00</span>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="media-btn" id="${id('toggle-loop')}" data-tooltip="Mode de boucle (Désactivé / Tout / Un)" style="position: relative;">
                            ${svgLoop}
                            <span id="${id('loop-badge')}" style="position:absolute; top:0px; right:0px; background:var(--accent, #6c5ce7); color:#fff; font-size:8px; border-radius:50%; width:12px; height:12px; display:none; align-items:center; justify-content:center; font-weight:bold;">1</span>
                        </button>
                        <button class="media-btn" id="${id('play-selection')}" data-tooltip="Activer boucle A-B">${svgPlaySel}</button>
                    </div>

                    <div class="media-slider-row">
                        <span>Vit.</span>
                        <input type="range" class="media-slider" id="${id('speed-slider')}" min="0.5" max="2" step="0.1" value="1">
                        <span id="${id('speed-display')}" style="min-width: 25px; text-align: right;">1.0x</span>
                    </div>
                </div>
            </div>

            <ul id="${id('playlist')}" class="media-playlist"></ul>
        `;
        document.body.appendChild(container);
        mediaEl = el('media');

        setupEvents();
        setupABSliders();
        setupDragMove();
        setupResizer();
    }

    function renderPlaylist() {
        const list = el('playlist');
        list.innerHTML = '';

        playlist.forEach((track, index) => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.index = index;
            if (index === currentIndex) li.classList.add('active');

            li.innerHTML = `
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${index + 1}. ${track.name}</span>
                <button class="media-delete-btn" title="Supprimer">${svgClose}</button>
            `;

            li.ondblclick = () => {
                currentIndex = index;
                playCurrent();
            };

            const delBtn = li.querySelector('.media-delete-btn');
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (playlist.length === 1) {
                    el('close').click();
                    return;
                }
                playlist.splice(index, 1);
                if (currentIndex === index) {
                    currentIndex = Math.min(index, playlist.length - 1);
                    playCurrent();
                } else if (currentIndex > index) {
                    currentIndex--;
                }
                renderPlaylist();
            };

            li.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', index);
                li.style.opacity = '0.5';
            };
            li.ondragend = () => { li.style.opacity = '1'; };
            li.ondragover = (e) => { e.preventDefault(); };
            li.ondrop = (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;
                if (fromIndex !== toIndex) {
                    const moved = playlist.splice(fromIndex, 1)[0];
                    playlist.splice(toIndex, 0, moved);
                    if (currentIndex === fromIndex) currentIndex = toIndex;
                    else if (currentIndex > fromIndex && currentIndex <= toIndex) currentIndex--;
                    else if (currentIndex < fromIndex && currentIndex >= toIndex) currentIndex++;
                    renderPlaylist();
                }
            };

            list.appendChild(li);
        });
    }

    function playCurrent() {
        if (playlist.length === 0) return;
        const track = playlist[currentIndex];
        el('title').textContent = track.name;

        mediaEl.src = track.url;
        mediaEl.play().catch(e => console.warn(e));

        el('play').innerHTML = svgPause;
        el('mini-play').innerHTML = svgPause;

        loopStart = null;
        loopEnd = null;
        const thumbA = el('ab-thumb-a');
        const thumbB = el('ab-thumb-b');
        const fill = el('ab-fill');
        if (thumbA && thumbB && fill) {
            thumbA.style.left = '0%';
            thumbB.style.left = '100%';
            fill.style.left = '0%';
            fill.style.width = '100%';
            fill.style.display = 'none';
            el('ab-time-a').textContent = "0:00";
            el('ab-time-b').textContent = "0:00";
        }

        renderPlaylist();
    }

    function setupEvents() {
        const playBtn = el('play');
        const miniPlayBtn = el('mini-play');
        const prevBtns = [el('prev'), el('mini-prev')];
        const nextBtns = [el('next'), el('mini-next')];
        const progressCont = el('progress-container');
        const progressBar = el('progress-bar');
        const timeCurrent = el('time-current');
        const timeDuration = el('time-duration');
        const volSlider = el('volume');

        const togglePlay = () => {
            if (mediaEl.paused) {
                mediaEl.play();
                playBtn.innerHTML = svgPause;
                miniPlayBtn.innerHTML = svgPause;
            } else {
                mediaEl.pause();
                playBtn.innerHTML = svgPlay;
                miniPlayBtn.innerHTML = svgPlay;
            }
        };
        playBtn.onclick = togglePlay;
        miniPlayBtn.onclick = togglePlay;

        const playNext = () => {
            if (playlist.length === 0) return;
            currentIndex = (currentIndex + 1) % playlist.length;
            playCurrent();
        };
        const playPrev = () => {
            if (playlist.length === 0) return;
            currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
            playCurrent();
        };

        nextBtns.forEach(btn => btn.onclick = playNext);
        prevBtns.forEach(btn => btn.onclick = playPrev);
        mediaEl.onended = () => {
            if (loopMode === 2) {
                mediaEl.currentTime = 0;
                mediaEl.play();
            } else if (loopMode === 1) {
                playNext();
            } else {
                if (currentIndex < playlist.length - 1) {
                    playNext();
                } else {
                    mediaEl.pause();
                    playBtn.innerHTML = svgPlay;
                    miniPlayBtn.innerHTML = svgPlay;
                }
            }
        };

        progressCont.onclick = (e) => {
            if (!mediaEl.duration) return;
            const rect = progressCont.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            mediaEl.currentTime = percent * mediaEl.duration;
        };

        mediaEl.ontimeupdate = () => {
            if (!mediaEl.duration) return;

            const validAB = (loopStart !== null && loopEnd !== null);

            if (isABLooping && validAB) {
                if (mediaEl.currentTime >= loopEnd) {
                    mediaEl.currentTime = loopStart;
                    mediaEl.play().catch(() => {});
                } else if (mediaEl.currentTime < loopStart) {
                    mediaEl.currentTime = loopStart;
                }
            }

            const percent = (mediaEl.currentTime / mediaEl.duration) * 100;
            timeCurrent.textContent = formatTime(mediaEl.currentTime);
            timeDuration.textContent = formatTime(mediaEl.duration);
            progressBar.style.width = Math.max(0, Math.min(100, percent)) + '%';

            if (loopEnd === null && mediaEl.duration > 0) {
                const timeB = el('ab-time-b');
                if (timeB && timeB.textContent === "0:00" && parseFloat(el('ab-thumb-b').style.left) === 100) {
                    timeB.textContent = formatTime(mediaEl.duration);
                }
            }
        };

        volSlider.oninput = (e) => { mediaEl.volume = e.target.value; };

        const speedSlider = el('speed-slider');
        const speedDisplay = el('speed-display');
        speedSlider.oninput = (e) => {
            const speed = parseFloat(e.target.value);
            mediaEl.playbackRate = speed;
            speedDisplay.textContent = speed.toFixed(1) + 'x';
        };

        const minBtn = el('minimize');
        const closeBtn = el('close');
        const bodyEl = el('body');
        const playlistEl = el('playlist');
        const miniControls = el('mini-controls');

        minBtn.onclick = () => {
            if (bodyEl.style.display === 'none') {
                bodyEl.style.display = 'flex';
                playlistEl.style.display = 'block';
                miniControls.style.display = 'none';
                container.classList.remove('minimized');
            } else {
                bodyEl.style.display = 'none';
                playlistEl.style.display = 'none';
                miniControls.style.display = 'flex';
                container.classList.add('minimized');
            }
        };

        closeBtn.onclick = () => {
            mediaEl.pause();
            container.style.display = 'none';
            playlist = [];
            currentIndex = 0;
        };

        if (mediaType === 'video') {
            const fsBtn = el('fullscreen');
            if (fsBtn) {
                fsBtn.onclick = () => {
                    // Plein écran du panneau entier (pas juste la vidéo) pour garder les contrôles visibles.
                    if (container.requestFullscreen) {
                        container.requestFullscreen().catch(() => {});
                    } else if (container.webkitRequestFullscreen) {
                        container.webkitRequestFullscreen();
                    } else if (mediaEl.webkitEnterFullscreen) {
                        // iOS Safari : pas de plein écran générique, seule la vidéo peut passer en plein écran natif.
                        mediaEl.webkitEnterFullscreen();
                    }
                };
            }

            // Masquage automatique des contrôles en plein écran si la souris ne bouge plus.
            let hideControlsTimer = null;
            const isThisFullscreen = () => {
                const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
                return fsEl === container;
            };
            const showControls = () => {
                if (!isThisFullscreen()) return;
                container.classList.remove('controls-hidden');
                clearTimeout(hideControlsTimer);
                hideControlsTimer = setTimeout(() => {
                    container.classList.add('controls-hidden');
                }, 3000);
            };
            container.addEventListener('mousemove', showControls);
            container.addEventListener('mouseleave', () => {
                if (isThisFullscreen()) container.classList.add('controls-hidden');
            });
            const onFullscreenChange = () => {
                clearTimeout(hideControlsTimer);
                container.classList.remove('controls-hidden');
                if (isThisFullscreen()) showControls();
            };
            document.addEventListener('fullscreenchange', onFullscreenChange);
            document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        }
    }

    function setupABSliders() {
        const track = el('progress-wrapper');
        const thumbA = el('ab-thumb-a');
        const thumbB = el('ab-thumb-b');
        const timeA = el('ab-time-a');
        const timeB = el('ab-time-b');
        const fill = el('ab-fill');
        const loopBtn = el('toggle-loop');
        const playSelBtn = el('play-selection');

        let activeThumb = null;

        const getPercent = (clientX) => {
            const rect = track.getBoundingClientRect();
            let p = (clientX - rect.left) / rect.width;
            return Math.max(0, Math.min(1, p));
        };

        const updateLoopState = () => {
            if (!mediaEl.duration) return;
            const pA = parseFloat(thumbA.style.left) / 100;
            const pB = parseFloat(thumbB.style.left) / 100;

            loopStart = pA * mediaEl.duration;
            loopEnd = pB * mediaEl.duration;

            timeA.textContent = formatTime(loopStart);
            timeB.textContent = formatTime(loopEnd);

            if (pA === 0 && pB === 1) {
                fill.style.display = 'none';
            } else {
                fill.style.display = 'block';
                if (isABLooping && (mediaEl.currentTime < loopStart || mediaEl.currentTime > loopEnd)) {
                    mediaEl.currentTime = loopStart;
                }
            }
        };

        const onMove = (e) => {
            if (!activeThumb) return;
            let percent = getPercent(e.clientX) * 100;

            const pA = parseFloat(thumbA.style.left);
            const pB = parseFloat(thumbB.style.left);

            if (activeThumb === thumbA) {
                if (percent > pB) percent = pB;
                thumbA.style.left = percent + '%';
                fill.style.left = percent + '%';
                fill.style.width = (pB - percent) + '%';
            } else {
                if (percent < pA) percent = pA;
                thumbB.style.left = percent + '%';
                fill.style.width = (percent - pA) + '%';
            }

            if (mediaEl.duration) {
                timeA.textContent = formatTime((parseFloat(thumbA.style.left) / 100) * mediaEl.duration);
                timeB.textContent = formatTime((parseFloat(thumbB.style.left) / 100) * mediaEl.duration);
            }
        };

        const syncABLoopUI = () => {
            if (isABLooping) {
                playSelBtn.classList.add('active-btn');
                playSelBtn.setAttribute('data-tooltip', 'Désactiver boucle A-B');
            } else {
                playSelBtn.classList.remove('active-btn');
                playSelBtn.setAttribute('data-tooltip', 'Activer boucle A-B');
            }
        };

        const onUp = () => {
            if (activeThumb) {
                activeThumb.classList.remove('active');
                activeThumb = null;
                if (parseFloat(thumbA.style.left) > 0 || parseFloat(thumbB.style.left) < 100) {
                    isABLooping = true;
                    syncABLoopUI();
                }
                updateLoopState();
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        const startDrag = (thumb, e) => {
            activeThumb = thumb;
            thumb.classList.add('active');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.stopPropagation();
        };

        thumbA.onmousedown = (e) => startDrag(thumbA, e);
        thumbB.onmousedown = (e) => startDrag(thumbB, e);

        const loopBadge = el('loop-badge');

        const syncLoopUI = () => {
            if (loopMode === 0) {
                loopBtn.classList.remove('active-btn');
                loopBadge.style.display = 'none';
            } else if (loopMode === 1) {
                loopBtn.classList.add('active-btn');
                loopBadge.style.display = 'none';
            } else if (loopMode === 2) {
                loopBtn.classList.add('active-btn');
                loopBadge.style.display = 'flex';
            }
        };

        loopBtn.onclick = () => {
            loopMode = (loopMode + 1) % 3;
            syncLoopUI();
        };

        playSelBtn.onclick = () => {
            if (!mediaEl.duration) return;
            isABLooping = !isABLooping;
            syncABLoopUI();
            if (isABLooping) {
                const pA = parseFloat(thumbA.style.left) / 100;
                mediaEl.currentTime = pA * mediaEl.duration;
                mediaEl.play().catch(() => {});
            }
        };
    }

    function setupDragMove() {
        const headerEl = el('header');
        headerEl.addEventListener('mousedown', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            isDragging = true;
            headerEl.style.cursor = 'grabbing';
            const rect = container.getBoundingClientRect();
            dragStartX = e.clientX - rect.left;
            dragStartY = e.clientY - rect.top;

            container.style.bottom = 'auto';
            container.style.right = 'auto';
            container.style.left = rect.left + 'px';
            container.style.top = rect.top + 'px';

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            container.style.left = (e.clientX - dragStartX) + 'px';
            container.style.top = (e.clientY - dragStartY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                headerEl.style.cursor = 'grab';
            }
        });
    }

    function setupResizer() {
        const resizer = document.createElement('div');
        resizer.style.cssText = 'position: absolute; top: 0; right: -3px; width: 6px; height: 100%; cursor: ew-resize; z-index: 100;';
        container.appendChild(resizer);

        let isResizing = false;
        let startW, startX;

        resizer.onmousedown = (e) => {
            isResizing = true;
            const rect = container.getBoundingClientRect();

            if (container.style.bottom || container.style.right) {
                container.style.bottom = 'auto';
                container.style.right = 'auto';
                container.style.left = rect.left + 'px';
                container.style.top = rect.top + 'px';
            }

            startW = rect.width;
            startX = e.clientX;
            e.stopPropagation();
            e.preventDefault();
        };

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            let newW = startW + (e.clientX - startX);
            newW = Math.max(260, Math.min(newW, 800));
            container.style.width = newW + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) isResizing = false;
        });
    }

    function handleDrop(file) {
        ensureMediaPlayerStyles();
        if (!container) build();

        playlist.push({
            id: 'track_' + Date.now() + Math.random(),
            name: file.name.replace(/\.[^/.]+$/, ""),
            url: URL.createObjectURL(file)
        });

        if (container.style.display === 'none' || playlist.length === 1) {
            container.style.display = 'block';
            currentIndex = playlist.length - 1;
            playCurrent();
        } else {
            renderPlaylist();
        }
    }

    return { handleDrop };
}

const audioMediaPlayer = createMediaPlayer({ mediaType: 'audio', idPrefix: 'mp3', defaultTitle: 'Lecteur Audio', icon: '🎵' });
const videoMediaPlayer = createMediaPlayer({ mediaType: 'video', idPrefix: 'vidp', defaultTitle: 'Lecteur Vidéo', icon: '🎬' });

function handleMp3Drop(file) { audioMediaPlayer.handleDrop(file); }
function handleVideoDrop(file) { videoMediaPlayer.handleDrop(file); }

// ===================================================
// IMPORTER UN DOCUMENT (.txt, .md, .docx, .odt)
// Le cours est déjà écrit dans un traitement de texte : on l'ouvre au lieu
// de le retaper. Le document devient des blocs de texte ordinaires, qu'on
// annote, déplace et efface comme le reste.
// ===================================================
const LARGEUR_COLONNE_DOC = 900;      // largeur d'un bloc importé
const ECART_COLONNE_DOC = 140;

// Un cours de six pages en un seul bloc serait ingérable : on coupe aux
// titres, et de toute façon tous les 30 paragraphes.
function decouperDocument(blocs) {
    const groupes = [];
    let courant = [];
    blocs.forEach(b => {
        const coupe = (/^h[12]$/.test(b.type) && courant.length >= 4) || courant.length >= 30;
        if (coupe) { groupes.push(courant); courant = []; }
        courant.push(b);
    });
    if (courant.length) groupes.push(courant);
    return groupes;
}

async function importerDocument(fichier, positionEcran) {
    if (!window.LecteurDocuments) {
        showToast("La lecture des documents n'est pas disponible ici");
        return;
    }
    let doc;
    try {
        doc = await window.LecteurDocuments.lire(fichier);
    } catch (e) {
        showToast('⚠️ ' + (e.message || 'document illisible'));
        return;
    }
    if (!doc.blocs.length) { showToast('Ce document ne contient pas de texte'); return; }

    const groupes = decouperDocument(doc.blocs);
    // Là où on a lâché le fichier ; sinon en haut à gauche de ce qu'on voit,
    // à droite de la barre d'outils et sous la barre du haut.
    const ancre = positionEcran || { x: 240, y: 160 };
    let x = (ancre.x - panX) / zoom;
    const y = (ancre.y - panY) / zoom;
    const poses = [];

    groupes.forEach(groupe => {
        const bloc = {
            id: nextId++,
            x, y,
            content: window.LecteurDocuments.blocsVersHtml(groupe),
            color: activeStyle.strokeColor,
            fontSize: activeStyle.fontSize,
            fontFamily: activeStyle.fontFamily || 'sans-serif',
            align: 'left',
            lineHeight: activeStyle.lineHeight,
            colWidth: LARGEUR_COLONNE_DOC,
            z: globalZ++
        };
        texts.push(bloc);
        poses.push(bloc);
        x += LARGEUR_COLONNE_DOC + ECART_COLONNE_DOC;
    });

    selectedItems = poses.map(t => ({ type: 'text', id: t.id }));
    saveState();
    draw();

    const nom = doc.titre || fichier.name;
    showToast(`📄 « ${nom} » importé${groupes.length > 1 ? ' en ' + groupes.length + ' blocs' : ''}`
        + (doc.tronque ? ' (document tronqué, il était très long)' : ''));
}

// ==========================================
// GUIDED TOUR SYSTEM
// ==========================================
let currentTourStep = 0;
const tourSteps = [
    {
        title: "✏️ Bienvenue dans Au Tableau",
        text: "Découvrez les 4 zones principales de ce tableau blanc numérique !",
        position: "center"
    },
    {
        title: "📦 Zone Plugins - En Haut",
        text: "Barre EN HAUT : créez vos toolbars personnalisées ou utilisez les modules (Mathjax, Python, Scratch, etc.).",
        elementId: "bar-plugins",
        position: "bottom"
    },
    {
        title: "🎨 Barre d'Outils Principale - À GAUCHE",
        text: "Tous vos outils : sélection, tracé libre, surligneur, gomme, formes géométriques, instruments, texte, etc.",
        elementId: "system-toolbar-main",
        position: "center"
    },
    {
        title: "🧲 Contrôles - En Bas",
        text: "Aimant magnétique, zoom, grille, calculatrice, horloge, chrono, sonomètre, et plus.",
        elementId: "bottom-drawer",
        position: "top"
    },
    {
        title: "📁 Mes Tableaux - À DROITE",
        text: "Explorez vos fichiers, créez de nouveaux tableaux, organisez vos dossiers.",
        elementId: "right-drawer",
        position: "left"
    },
    {
        title: "🎯 C'est parti !",
        text: "Vous connaissez les zones principales. Retrouvez l'aide (?) en bas à droite pour plus de détails.",
        position: "center"
    }
];

function startGuidedTour() {
    currentTourStep = 0;
    showTourStep(0);
}

function showTourStep(stepIdx) {
    if (stepIdx < 0 || stepIdx >= tourSteps.length) {
        closeTour();
        return;
    }

    currentTourStep = stepIdx;
    const step = tourSteps[stepIdx];

    const tooltip = document.getElementById('guided-tour-tooltip');
    tooltip.style.display = 'block';

    document.getElementById('tour-step-title').textContent = step.title;
    document.getElementById('tour-step-text').textContent = step.text;
    document.getElementById('tour-step-counter').textContent = `${stepIdx + 1}/${tourSteps.length}`;

    // Ouvrir/afficher les drawers et toolbar si nécessaire
    const needsDelay = step.elementId === 'bottom-drawer' || step.elementId === 'right-drawer';

    if (step.elementId === 'bar-plugins') {
        const barPlugins = document.getElementById('bar-plugins');
        if (barPlugins) barPlugins.style.display = 'flex';
    }
    if (step.elementId === 'bar-tools') {
        const toolbar = document.getElementById('bar-tools');
        if (toolbar) toolbar.style.display = 'block';
    }
    if (step.elementId === 'bottom-drawer') {
        const drawer = document.getElementById('bottom-drawer');
        if (drawer) drawer.classList.add('open');
    }
    if (step.elementId === 'right-drawer') {
        const drawer = document.getElementById('right-drawer');
        if (drawer) drawer.classList.add('open');
    }

    const doHighlight = () => {
        let highlightInfo = null;
        if (step.customRect) {
            highlightInfo = addHighlight(null, step.customRect);
        } else if (step.elementId) {
            highlightInfo = addHighlight(step.elementId);
        }
    };

    if (needsDelay) {
        setTimeout(doHighlight, 300);
    } else {
        doHighlight();
    }

    // Texte toujours au centre
    const tooltipWidth = 300;
    const tooltipHeight = 150;
    const left = Math.max(10, Math.min(window.innerWidth / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 10));
    const top = Math.max(10, Math.min(window.innerHeight / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - 10));

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';

    document.getElementById('btn-tour-prev').onclick = () => showTourStep(currentTourStep - 1);
    document.getElementById('btn-tour-next').onclick = () => showTourStep(currentTourStep + 1);
}

function addHighlight(elementId, customRect) {
    let rect;

    if (customRect) {
        rect = customRect;
    } else if (elementId) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const bRect = el.getBoundingClientRect();
        rect = { left: bRect.left, top: bRect.top, width: bRect.width, height: bRect.height };
    } else {
        return;
    }

    const padding = 15;

    let canvas = document.getElementById('tour-highlight-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'tour-highlight-canvas';
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            pointer-events: none;
            z-index: 9996;
        `;
        document.body.appendChild(canvas);
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.clearRect(
        rect.left - padding,
        rect.top - padding,
        rect.width + padding * 2,
        rect.height + padding * 2
    );

    ctx.strokeStyle = '#6c5ce7';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(108, 92, 231, 0.8)';
    ctx.shadowBlur = 15;
    ctx.strokeRect(
        rect.left - padding,
        rect.top - padding,
        rect.width + padding * 2,
        rect.height + padding * 2
    );

    document.body.appendChild(canvas);

    return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        rect: rect
    };
}

function removeHighlight() {
    const canvas = document.getElementById('tour-highlight-canvas');
    if (canvas) canvas.remove();
}

function closeTour() {
    document.getElementById('guided-tour-overlay').style.display = 'none';
    document.getElementById('guided-tour-tooltip').style.display = 'none';
    removeHighlight();
    localStorage.setItem('auTableau_tour_seen', 'true');
    currentTourStep = 0;
}

function processMath(textObj) {
    // LaTeX n'est pas supporté pour le rendu canvas - garder le texte brut
    // Les formules $...$ seront affichées comme texte ordinaire
}

function debugShowElements() {
    const canvas = document.createElement('canvas');
    canvas.id = 'debug-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 99999;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.font = '12px Arial';
    ctx.lineWidth = 2;

    const elements = [
        { id: 'bar-tools', color: '#FF6B6B', label: 'Bar Tools' },
        { id: 'bar-plugins', color: '#4ECDC4', label: 'Bar Plugins' },
        { id: 'btn-import-menu', color: '#45B7D1', label: 'Import Menu' },
        { id: 'btn-magnet', color: '#FFA07A', label: 'Magnet' },
        { id: 'btn-help', color: '#98D8C8', label: 'Help' },
        { id: 'right-drawer', color: '#F7DC6F', label: 'Right Drawer' },
        { id: 'bottom-drawer', color: '#BB8FCE', label: 'Bottom Drawer' },
    ];

    elements.forEach(el => {
        const elem = document.getElementById(el.id);
        if (elem) {
            const rect = elem.getBoundingClientRect();
            const surface = (rect.width * rect.height).toFixed(0);

            ctx.strokeStyle = el.color;
            ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

            ctx.fillStyle = el.color;
            const text = `${el.label} [${rect.left.toFixed(0)},${rect.top.toFixed(0)}] ${rect.width.toFixed(0)}x${rect.height.toFixed(0)} (${surface})`;
            ctx.fillText(text, rect.left + 5, rect.top + 15);

            console.log(`${el.label}: x=${rect.left.toFixed(0)}, y=${rect.top.toFixed(0)}, w=${rect.width.toFixed(0)}, h=${rect.height.toFixed(0)}, surface=${surface}`);
        }
    });

    console.log('\n✅ Elements visualisés sur le canvas !');
    console.log(`Window size: ${window.innerWidth} x ${window.innerHeight}`);
}

function debugRemoveElements() {
    const canvas = document.getElementById('debug-canvas');
    if (canvas) canvas.remove();
}

const btnStartTour = document.getElementById('btn-start-tour');
const btnHelpTour = document.getElementById('btn-help-tour');

if (btnStartTour) {
    btnStartTour.addEventListener('click', () => {
        document.getElementById('help-modal').style.display = 'none';
        startGuidedTour();
    });
}

if (btnHelpTour) {
    btnHelpTour.addEventListener('click', () => {
        document.getElementById('help-modal').style.display = 'none';
        startGuidedTour();
    });
}

setTimeout(() => {
    const hasSeenWelcome = localStorage.getItem('auTableau_welcome_v2');
    if (!hasSeenWelcome) {
        showToast("💡 Consultez l'aide (?) en bas à droite !");
        localStorage.setItem('auTableau_welcome_v2', 'true');
    }
}, 1000);

function openDonateModal() {
    document.getElementById('donate-modal').style.display = 'flex';
}

function closeDonateModal() {
    document.getElementById('donate-modal').style.display = 'none';
}

document.getElementById('donate-modal').addEventListener('click', function (e) {
    if (e.target === this) {
        closeDonateModal();
    }
});

function openFormulaModal() {
    const modal = document.getElementById('formula-modal');
    const input = document.getElementById('formula-input');
    const preview = document.getElementById('formula-preview');

    input.value = '';
    preview.innerHTML = 'Aperçu en temps réel';
    modal.style.display = 'flex';
    input.focus();
}

function closeFormulaModal() {
    document.getElementById('formula-modal').style.display = 'none';
}

function insertFormula() {
    const input = document.getElementById('formula-input');
    const formula = input.value.trim();
    if (!formula) return;

    showToast('✅ Formule insérée !');
    closeFormulaModal();
}

if (document.getElementById('formula-modal')) {
    document.getElementById('formula-modal').addEventListener('click', function (e) {
        if (e.target === this) {
            closeFormulaModal();
        }
    });
}

// Les fonds « feuille » posent une page à un endroit précis du tableau : si
// l'on se trouvait ailleurs, on ne voyait qu'un bout de feuille sur du gris.
// En choisissant l'un de ces fonds, on se recadre donc sur la page la plus
// proche, entière et centrée.
const FONDS_FEUILLE = ['seyes-marge', 'copie'];

// Où poser la feuille sur cette page. Elle vivait à l'origine du tableau ;
// si l'on avait travaillé ailleurs, elle apparaissait à côté du travail, voire
// hors de l'écran. Elle se pose donc AUTOUR de ce qui est déjà tracé.
let origineFeuille = { x: 0, y: 0 };

// Les axes vivaient à l'origine du tableau : allumés après avoir travaillé
// ailleurs, ils apparaissaient de travers, voire hors de l'écran. Ils se
// posent maintenant au milieu de ce qu'on regarde, sur un croisement du
// quadrillage pour que les graduations tombent juste.
let origineAxes = { x: 0, y: 0 };

// Une graduation vaut une case du fond : l'interligne du Seyès, le carreau
// de la copie d'examen, le centimètre du millimétré.
function pasDesGraduations() {
    const bg = backgrounds[currentBgIndex];
    if (bg === 'seyes' || bg === 'seyes-marge') return 40;
    if (bg === 'millimetre') return 100;
    return 30;                       // carreaux, copie d'examen, fond uni
}

function centrerLesAxes() {
    const cv = document.getElementById('board');
    const l = (cv && cv.clientWidth) || window.innerWidth;
    const h = (cv && cv.clientHeight) || window.innerHeight;
    const pas = pasDesGraduations();
    const o = origineDuReseau();     // sur une feuille, le réseau la suit
    origineAxes = {
        x: o.x + Math.round(((l / 2 - panX) / zoom - o.x) / pas) * pas,
        y: o.y + Math.round(((h / 2 - panY) / zoom - o.y) / pas) * pas
    };
}

// La boîte qui contient tout ce que porte la page (null si la page est vide)
function boiteDuTravail() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const prendre = (x, y) => {
        if (!isFinite(x) || !isFinite(y)) return;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    const boite = (b) => { if (b) { prendre(b.bx, b.by); prendre(b.bx + b.bw, b.by + b.bh); } };

    (points || []).forEach(p => prendre(p.x, p.y));
    (freehands || []).concat(curves || []).forEach(f => (f.points || []).forEach(p => prendre(p.x, p.y)));
    (images || []).forEach(o => { prendre(o.x, o.y); prendre(o.x + o.w, o.y + o.h); });
    (texts || []).forEach(o => boite(getItemLogicalBounds('text', o)));
    (htmlPostits || []).forEach(o => { prendre(o.x, o.y); prendre(o.x + (o.w || 200), o.y + (o.h || 150)); });
    (arcs || []).forEach(a => { prendre(a.cx - a.radius, a.cy - a.radius); prendre(a.cx + a.radius, a.cy + a.radius); });

    if (minX === Infinity) return null;
    return { x: minX, y: minY, l: maxX - minX, h: maxY - minY };
}

// Y a-t-il déjà quelque chose sur cette page ?
function pageEstVide() {
    const listes = [points, segments, circles, rectangles, texts, freehands,
                    curves, polygons, images, arcs, htmlPostits];
    return listes.every(l => !l || l.length === 0);
}

// Glisser la feuille SOUS le travail existant, sans toucher à la vue.
// Rend « true » quand elle a été déplacée.
function replacerLaFeuilleSiBesoin() {
    if (!FONDS_FEUILLE.includes(backgrounds[currentBgIndex])) return false;
    const travail = boiteDuTravail();
    if (!travail) return false;
    // Le tracé est centré en largeur et posé sous l'en-tête ; s'il est
    // plus grand que la feuille, on le cadre au mieux depuis son coin.
    const HAUT_UTILE = 300;                       // la place de l'en-tête
    origineFeuille = {
        x: travail.x + travail.l / 2 - PAGE_L / 2,   // centré en largeur
        y: travail.y - HAUT_UTILE                    // le tracé démarre sous l'en-tête
    };
    return true;
}

function cadrerSurLaFeuille() {
    const bg = backgrounds[currentBgIndex];
    if (!FONDS_FEUILLE.includes(bg)) return;
    const canvas = document.getElementById('board');
    if (!canvas) return;
    // Sur une page où l'on a déjà travaillé, on ne touche pas à la vue —
    // recadrer déplaçait tout le tracé sous les yeux du professeur — mais on
    // glisse la feuille SOUS ce travail, pour qu'elle apparaisse autour de lui
    // et non à l'autre bout du tableau.
    if (replacerLaFeuilleSiBesoin()) {
        if (typeof draw === 'function') draw();
        return;
    }
    origineFeuille = { x: 0, y: 0 };

    const largeurEcran = canvas.clientWidth || window.innerWidth;
    const hauteurEcran = canvas.clientHeight || window.innerHeight;

    // On la cadre sur la LARGEUR du tableau, en gardant une marge de chaque
    // côté : une A4 entière tenait dans la hauteur, mais à 30 % — illisible du
    // fond de la classe. La feuille remplit donc l'écran en largeur et on
    // descend dedans, comme sur une vraie copie.
    // Les barres sont en position fixe : « offsetParent » y vaut toujours null
    // et la mesure rendait 0 — l'en-tête de la copie finissait caché dessous.
    const hauteurBarre = (sel) => {
        const el = document.querySelector(sel);
        if (!el || !el.getClientRects().length) return 0;
        return Math.min(200, el.getBoundingClientRect().height + 16);
    };
    const enHaut = Math.max(30, hauteurBarre('#bar-plugins'));
    const enBas = Math.max(30, hauteurBarre('#bar-bottom, .drawer-bottom, #bottom-bar'));
    const libre = Math.max(200, hauteurEcran - enHaut - enBas);

    // Une marge d'environ 4 % de chaque côté, jamais moins de 24 px
    const marge = Math.max(24, Math.round(largeurEcran * 0.04));
    zoom = Math.max(0.15, Math.min(3, (largeurEcran - marge * 2) / PAGE_L));
    panX = (largeurEcran - PAGE_L * zoom) / 2;
    // Le haut de la feuille juste sous la barre du haut : on voit l'en-tête,
    // et le reste se découvre en descendant. Si elle tient en entier, on la
    // centre plutôt que de la coller en haut.
    const hauteurFeuille = PAGE_H * zoom;
    panY = hauteurFeuille <= libre ? enHaut + (libre - hauteurFeuille) / 2 : enHaut;

    const curseurZoom = document.getElementById('zoom-slider');
    if (curseurZoom) curseurZoom.value = zoom;
    majPastilleZoom();
}

// ===================================================
// APPUI LONG SUR UN BOUTON
// Certains boutons cachent des réglages : on garde le doigt appuyé une demi-
// seconde pour les ouvrir. Un geste invisible ne sert à personne : chaque
// bouton concerné reçoit un petit repère en coin (voir « .a-appui-long »).
// ===================================================
const DUREE_APPUI_LONG = 500;

function poserAppuiLong(bouton, action) {
    if (!bouton || bouton.dataset.appuiLong === 'oui') return;
    bouton.dataset.appuiLong = 'oui';
    bouton.classList.add('a-appui-long');
    // Mémorisée pour que les copies du bouton (barres flottantes, interfaces)
    // gardent leur appui long : sans ça, l'outil déplacé perdait ses réglages.
    bouton.actionAppuiLong = action;

    let minuteur = null;
    let declenche = false;

    const arreter = () => { clearTimeout(minuteur); minuteur = null; };

    bouton.addEventListener('pointerdown', (e) => {
        declenche = false;
        arreter();
        minuteur = setTimeout(() => {
            declenche = true;
            action(bouton, e);
        }, DUREE_APPUI_LONG);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
        bouton.addEventListener(ev, arreter));

    // Un appui long ne doit pas déclencher AUSSI l'action courte du bouton
    bouton.addEventListener('click', (e) => {
        if (declenche) { e.preventDefault(); e.stopImmediatePropagation(); declenche = false; }
    }, true);

    // Le clic droit ouvre le même panneau : c'est le réflexe sur ordinateur
    bouton.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        action(bouton, e);
    });
}

// Un panneau flottant partagé par tous les appuis longs
function ouvrirPanneauAppui(bouton, titre, entrees) {
    fermerPanneauAppui();
    const panneau = document.createElement('div');
    panneau.className = 'reglages-popup visible panneau-appui';
    panneau.id = 'panneau-appui';

    const t = document.createElement('div');
    t.className = 'rp-titre';
    t.innerText = titre;
    panneau.appendChild(t);

    entrees.forEach(entree => {
        if (entree.separateur) {
            const st = document.createElement('div');
            st.className = 'rp-titre';
            st.innerText = entree.separateur;
            panneau.appendChild(st);
            return;
        }
        const b = document.createElement('button');
        b.className = 'rp-choix' + (entree.actif ? ' actif' : '');
        b.innerText = entree.nom;
        b.addEventListener('click', () => {
            try { entree.action(); } catch (err) { console.error(err); }
            fermerPanneauAppui();
        });
        panneau.appendChild(b);
    });

    document.body.appendChild(panneau);

    // Posé près du bouton, sans jamais sortir de l'écran
    const r = bouton.getBoundingClientRect();
    const p = panneau.getBoundingClientRect();
    let gauche = Math.min(r.left, window.innerWidth - p.width - 10);
    let haut = r.top - p.height - 10;
    if (haut < 10) haut = Math.min(r.bottom + 10, window.innerHeight - p.height - 10);
    panneau.style.position = 'fixed';
    panneau.style.left = Math.max(10, gauche) + 'px';
    panneau.style.top = Math.max(10, haut) + 'px';
    panneau.style.right = 'auto';

    setTimeout(() => {
        document.addEventListener('pointerdown', fermerSiDehors, true);
    }, 0);
}

function fermerSiDehors(e) {
    const panneau = document.getElementById('panneau-appui');
    if (panneau && !panneau.contains(e.target)) fermerPanneauAppui();
}

function fermerPanneauAppui() {
    const panneau = document.getElementById('panneau-appui');
    if (panneau) panneau.remove();
    document.removeEventListener('pointerdown', fermerSiDehors, true);
}

const NOMS_FONDS = {
    blanc: 'Page blanche', carreau: 'Petits carreaux', seyes: 'Seyès',
    'seyes-marge': 'Cahier (Seyès et marge)', copie: "Copie d'examen",
    millimetre: 'Papier millimétré', point: 'Points', isometrique: 'Isométrique'
};

const TEINTES_PAPIER = [
    { nom: 'Blanc', valeur: '#ffffff' },
    { nom: 'Crème', valeur: '#fdf6e3' },
    { nom: 'Gris très clair', valeur: '#f2f4f6' },
    { nom: 'Vert d\'eau', valeur: '#eef7f2' },
    { nom: 'Bleu pâle', valeur: '#eef3fb' }
];

document.addEventListener('DOMContentLoaded', () => {
    if (typeof brancherBarreDocument === 'function') brancherBarreDocument();

    const btnRetrouver = document.getElementById('btn-retrouver-images');
    const entreeRetrouver = document.getElementById('retrouver-loader');
    if (btnRetrouver && entreeRetrouver) {
        btnRetrouver.addEventListener('click', () => {
            const combien = imagesManquantes().length;
            if (!combien) { if (typeof showToast === 'function') showToast('Aucune image ne manque sur ce tableau'); return; }
            if (typeof showToast === 'function') showToast(`Choisissez le${combien > 1 ? 's' : ''} fichier${combien > 1 ? 's' : ''} d'origine`);
            entreeRetrouver.click();
        });
        entreeRetrouver.addEventListener('change', (e) => {
            retrouverLesImages(e.target.files || []);
            e.target.value = '';
        });
    }
    majPastilleZoom(); majPastilleGrille(); majInterrupteursBarre();
    poserRaccourcisSurLesBoutons();
    // Les barres flottantes recopient les boutons : on repasse quand c'est fait
    window.addEventListener('load', () => setTimeout(poserRaccourcisSurLesBoutons, 800));

    // Fonds : choisir directement, au lieu de faire défiler huit fonds
    poserAppuiLong(document.getElementById('btn-cycle'), (bouton) => {
        const entrees = backgrounds.map((nom, i) => ({
            nom: NOMS_FONDS[nom] || nom,
            actif: i === currentBgIndex,
            action: () => { currentBgIndex = i; cadrerSurLaFeuille(); draw(); }
        }));
        entrees.push({ separateur: 'Couleur du papier' });
        TEINTES_PAPIER.forEach(t => entrees.push({
            nom: t.nom,
            actif: bgColors.default === t.valeur,
            action: () => { bgColors.default = t.valeur; draw(); }
        }));
        ouvrirPanneauAppui(bouton, 'Fond du tableau', entrees);
    });

    // Axes : les trois états, puis ce que vaut une case
    poserAppuiLong(document.getElementById('btn-axes'), (bouton) => {
        const etats = ['Aucun axe', 'Axes discrets', 'Axes marqués et gradués'];
        const entrees = etats.map((nom, i) => ({
            nom, actif: showAxes === i,
            action: () => {
                showAxes = i;
                const b = document.getElementById('btn-axes');
                b.classList.remove('active', 'active-1', 'active-2');
                if (showAxes > 0) b.classList.add('active', `active-${showAxes}`);
                draw();
            }
        }));

        entrees.push({ separateur: 'Une case vaut' });
        [0.1, 0.5, 1, 2, 5, 10, 100].forEach(pas => entrees.push({
            nom: String(pas).replace('.', ','),
            actif: Math.abs(pasAxes - pas) < 1e-9,
            action: () => {
                pasAxes = pas;
                try { localStorage.setItem('board_pas_axes', String(pas)); } catch (e) { /* stockage refusé */ }
                if (showAxes !== 2) {          // le pas ne se voit qu'en axes gradués
                    showAxes = 2;
                    const b = document.getElementById('btn-axes');
                    b.classList.add('active', 'active-2');
                }
                draw();
            }
        }));

        ouvrirPanneauAppui(bouton, 'Axes', entrees);
    });

    // Aimant : trois sources qu'on allume séparément. Le panneau reste ouvert
    // le temps de les régler.
    const ouvrirPanneauAimant = (bouton) => {
        const bascule = (cle) => {
            aimant[cle] = !aimant[cle];
            if (!aimant.grille && !aimant.outils && !aimant.intersections) aimant[cle] = true;  // jamais tout éteint
            enregistrerAimant();
            if (!magnetMode) magnetMode = true;
            if (typeof majBoutonsAimant === 'function') majBoutonsAimant();
            draw();
            setTimeout(() => ouvrirPanneauAimant(bouton), 0);
        };
        ouvrirPanneauAppui(bouton, 'Aimant', [
            { separateur: "S'aimanter sur" },
            { nom: 'Le quadrillage', actif: aimant.grille, action: () => bascule('grille') },
            { nom: 'Les outils de géométrie', actif: aimant.outils, action: () => bascule('outils') },
            { nom: 'Les points et les intersections', actif: aimant.intersections, action: () => bascule('intersections') }
        ]);
    };
    poserAppuiLong(document.getElementById('btn-magnet'), ouvrirPanneauAimant);

    // Classes : les outils qui s'appuient sur la liste des élèves
    poserAppuiLong(document.getElementById('btn-classes-menu'), (bouton) => {
        const outils = ['Points de classe', 'Tirage au sort & Groupes', 'Le Défi du Prof', 'Popcorn', 'Questions Flash'];
        const entrees = [{
            nom: 'Gérer mes classes',
            action: () => { if (typeof openClassManagerModal === 'function') openClassManagerModal(); }
        }, { separateur: 'Outils qui utilisent les classes' }];
        outils.forEach(nom => {
            const source = (typeof getPluginSourceButton === 'function') ? getPluginSourceButton(nom) : null;
            if (source) entrees.push({ nom, action: () => source.click() });
        });
        ouvrirPanneauAppui(bouton, 'Mes classes', entrees);
    });
});

// ===================================================
// RÉPARTITION DES ICÔNES SUR DEUX RANGÉES
// Une rubrique de 20 outils s'affichait 12 + 8 : la deuxième rangée avait
// l'air d'un reste. On calcule la largeur pour que les rangées soient égales
// (10 + 10), sans changer l'ordre ni la taille des boutons.
// ===================================================
function equilibrerGrillePlugins() {
    const grille = document.getElementById('plugins-grid');
    if (!grille) return;
    const visibles = Array.from(grille.querySelectorAll('.btn')).filter(b => b.offsetParent);
    if (visibles.length < 3) { grille.style.removeProperty('max-width'); return; }
    // La feuille de style pose un plafond « !important » pour le mode libellés :
    // notre largeur calculée doit peser au moins aussi lourd.

    const style = getComputedStyle(grille);
    const ecart = parseFloat(style.columnGap || style.gap || '0') || 0;
    const large = visibles[0].getBoundingClientRect().width + ecart;
    if (!large) return;

    // Largeur disponible : celle du parent, jamais celle de l'écran entier
    const parent = grille.parentElement ? grille.parentElement.getBoundingClientRect().width : 0;
    // Barre encore repliée ou pas encore mesurée : on ne décide rien
    const plafond = Math.min(parent > 200 ? parent : window.innerWidth - 40, window.innerWidth - 40);
    const maxParRangee = Math.max(1, Math.floor(plafond / large));
    const rangees = Math.max(1, Math.ceil(visibles.length / maxParRangee));
    const parRangee = Math.ceil(visibles.length / rangees);

    grille.style.setProperty('max-width', Math.ceil(parRangee * large) + 'px', 'important');
}

// À l'ouverture d'une rubrique, au changement de taille de fenêtre, et quand
// la grille change de contenu.
(function () {
    const relancer = () => requestAnimationFrame(equilibrerGrillePlugins);
    window.addEventListener('resize', relancer);
    document.addEventListener('DOMContentLoaded', () => {
        const grille = document.getElementById('plugins-grid');
        if (!grille) return;
        grille.addEventListener('click', relancer, true);
        document.querySelectorAll('#plugin-tabs .btn, .category-tab').forEach(b => b.addEventListener('click', relancer));
        if (window.MutationObserver) {
            new MutationObserver(relancer).observe(grille, { childList: true, attributes: true, subtree: true, attributeFilter: ['style'] });
        }
        window.addEventListener('load', () => setTimeout(relancer, 400));
    });
})();

// ===================================================
// ESSAI : LIBELLÉS SOUS LES ICÔNES
// Deux enseignants ont dit la même chose : on ne reconnaît pas les icônes
// sans les survoler. Le nom de chaque outil est déjà dans son attribut
// « data-tooltip » et sa rubrique dans « data-category » — il suffit de les
// afficher. L'essai est derrière une adresse pour ne rien imposer :
//     index.html?libelles      (noms sous les icônes)
//     index.html?libelles=couleur   (noms + une teinte par rubrique)
// Sans paramètre, l'affichage ne change pas d'un pixel.
// ===================================================
(function () {
    // Trois états : rien, les noms, les noms avec une teinte par rubrique.
    // Le réglage se garde d'une fois sur l'autre ; l'adresse ?libelles=... reste
    // utile pour montrer l'essai à quelqu'un sans toucher à ses réglages.
    const CLE = 'board_libelles';
    const ETATS = ['non', 'oui', 'couleur'];
    let valeur = 'non';
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.has('libelles')) valeur = params.get('libelles') || 'oui';
        else valeur = localStorage.getItem(CLE) || 'non';
    } catch (e) { valeur = 'non'; }
    if (valeur === 'couleurs') valeur = 'couleur';
    if (!ETATS.includes(valeur)) valeur = 'oui';

    // Sous une icône, « Tableau de Proportionnalité » se coupe. Ces noms courts
    // ne servent QUE dans cet essai : les infobulles gardent le nom complet.
    const NOMS_COURTS = {
        'Formules Mathématiques': 'Formules', 'Matériel Base 10': 'Base 10',
        'Fraction Visuelle': 'Fractions', 'Cartes à jouer': 'Cartes',
        'Tableau de Conversion': 'Conversions', 'Tableau de Numération': 'Numération',
        'Tableau de Proportionnalité': 'Proportions', 'Tableau Signes & Variations': 'Signes & variations',
        'Axe Mathématique': 'Axe gradué', 'Repère Cartésien': 'Repère',
        'Horloge Pédagogique': 'Horloge', 'Horloge aléatoire': 'Horloge au hasard',
        'Mains & Comptage': 'Comptage', 'Tuiles Algébriques': 'Tuiles algébriques',
        'Graphique Statistique': 'Statistiques', 'Cible (Probas)': 'Cible',
        'Kit Monnaie': 'Monnaie', 'Arbre de probabilités': 'Arbre de probas',
        'Réglettes Cuisenaire': 'Cuisenaire', 'Tableur Interactif': 'Tableur',
        'Tables de Pythagore': 'Pythagore', 'Laboratoire Aléatoire': 'Labo au hasard',
        'Évolutions Successives': 'Évolutions', 'Division Posée': 'Division',
        'Traceur de Fonctions': 'Fonctions', 'Super Fractales': 'Fractales',
        'Solides 3D': 'Solides', 'Patrons de Solides': 'Patrons', 'Visionneuse 3D': 'Vue 3D',
        'Polygones Réguliers': 'Polygones', 'Figures Géométriques': 'Figures',
        'Fabrique à Flèches': 'Flèches', 'Tampon Instruments': 'Instruments',
        'Circuits Électriques': 'Circuits', 'Composants Électriques': 'Composants',
        'Molécules 2D': 'Molécules', 'Sonomètre de Classe': 'Sonomètre',
        'Piano Virtuel': 'Piano', 'Métronome Pro': 'Métronome', 'Accordeur Pro': 'Accordeur',
        'Portée Musicale': 'Portée', 'Frise Historique': 'Frise', 'Cartes Géographiques': 'Cartes',
        "Lignes d'écriture": 'Lignes', 'Météo du Jour': 'Météo',
        'Calendrier & Affichages': 'Calendrier', 'Tableaux & Logigrammes': 'Logigrammes',
        'Tirage au sort & Groupes': 'Tirage au sort', 'Bulles BD Interactives': 'Bulles BD',
        'Générateur de Labyrinthes': 'Labyrinthes', 'Générateur de Dominos': 'Dominos',
        'Générateur de Binaro': 'Binaro', "Générateur d'Exercices": 'Exercices',
        'Grille de Sudoku': 'Sudoku', 'Grille Boggle': 'Boggle',
        'Le Mot le Plus Long': 'Mot le plus long', 'Le Compte est Bon': 'Compte est bon',
        'Le Défi du Prof': 'Défi du prof', 'Jeu du Pendu': 'Pendu', 'Jeu de Dames': 'Dames',
        'Jeu de Tangram': 'Tangram', "Jeu d'Échecs (Clic Droit pour designs)": 'Échecs',
        'Pyramides Additives': 'Pyramides', 'Angles à mesurer': 'Angles',
        'Dés à jouer': 'Dés', 'Algorithmes (Scratch)': 'Scratch',
        "Feux d'artifice (Audio & FX)": "Feux d'artifice", 'Super Taupe Deluxe': 'Super Taupe',
        'Ménagerie Mathématique': 'Ménagerie', 'Mascotte Top-Down': 'Mascotte',
        'Tampon Extrême': 'Tampons', 'Pixel Studio': 'Pixels'
    };

    const nommer = () => {
        const grille = document.getElementById('plugins-grid');
        if (!grille) return;
        grille.querySelectorAll('.btn').forEach(btn => {
            const complet = btn.getAttribute('data-tooltip') || btn.title || '';
            if (!complet) return;
            const court = NOMS_COURTS[complet] || complet;
            if (btn.dataset.libelle !== court) btn.dataset.libelle = court;
        });
    };

    const appliquer = () => {
        document.body.classList.toggle('libelles-outils', valeur !== 'non');
        document.body.classList.toggle('libelles-couleur', valeur === 'couleur');
        const pastille = document.getElementById('btn-libelles');
        if (pastille) {
            pastille.classList.toggle('active', valeur !== 'non');
            pastille.classList.toggle('allume', valeur !== 'non');
        }
        if (valeur !== 'non') nommer();
    };

    const poser = () => {
        appliquer();
        // Les plugins garnissent la grille après nous : on repasse à leur suite
        const grille = document.getElementById('plugins-grid');
        if (grille && window.MutationObserver) {
            new MutationObserver(() => { if (valeur !== 'non') nommer(); })
                .observe(grille, { childList: true, subtree: true });
        }
        window.addEventListener('load', () => setTimeout(() => { if (valeur !== 'non') nommer(); }, 300));
    };
    if (document.body) poser();
    else document.addEventListener('DOMContentLoaded', poser);

    // La pastille « Libellés » de la barre du bas fait le tour des trois états
    window.basculerLibelles = function () {
        window.choisirFormatIcones(ETATS[(ETATS.indexOf(valeur) + 1) % ETATS.length], true);
    };

    // Le panneau de réglages de la barre choisit directement un format
    window.choisirFormatIcones = function (nouveau, avecMessage) {
        if (!ETATS.includes(nouveau)) return;
        valeur = nouveau;
        try { localStorage.setItem(CLE, valeur); } catch (e) { /* stockage refusé */ }
        appliquer();
        if (typeof equilibrerGrillePlugins === 'function') requestAnimationFrame(equilibrerGrillePlugins);
        if (typeof majReglagesBarre === 'function') majReglagesBarre();
        if (avecMessage && typeof showToast === 'function') {
            showToast(valeur === 'non' ? 'Icônes seules'
                : valeur === 'oui' ? 'Nom des outils affiché'
                : 'Nom des outils, avec une couleur par rubrique');
        }
    };
    window.formatIcones = () => valeur;
})();

// ===================================================
// TITRE DU TABLEAU : LA DATE, SON FORMAT, L'HEURE
// Le titre porte la date du jour. Une roue à côté permet d'en changer le
// format et d'y ajouter l'heure — le tout se retient d'une fois sur l'autre.
// Un titre écrit à la main n'est JAMAIS remplacé.
// ===================================================
const CLE_DATE = 'board_reglages_date';
let reglagesDate = { format: 'long', heure: false, affichee: true };
let dernierTitreDate = '';

try {
    const brut = localStorage.getItem(CLE_DATE);
    if (brut) reglagesDate = { ...reglagesDate, ...JSON.parse(brut) };
} catch (e) { /* réglages illisibles : on garde les valeurs par défaut */ }

const FORMATS_DATE = {
    long: (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    moyen: (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    court: (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    chiffres: (d) => d.toLocaleDateString('fr-FR')
};

function texteDateDuJour() {
    const d = new Date();
    const f = FORMATS_DATE[reglagesDate.format] || FORMATS_DATE.long;
    let t = f(d);
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (reglagesDate.heure) t += ' — ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return t;
}

function enregistrerReglagesDate() {
    try { localStorage.setItem(CLE_DATE, JSON.stringify(reglagesDate)); } catch (e) { /* stockage refusé */ }
}

// Écrit la date dans le titre. « force » sert quand l'enseignant choisit
// lui-même un format ; sinon on ne touche qu'à un titre encore automatique.
function poserDateDansTitre(force) {
    const champ = document.getElementById('project-name-input');
    if (!champ) return;
    const ancien = champ.value.trim();
    const automatique = !ancien || ancien === dernierTitreDate;
    if (!force && !automatique) return;
    const texte = texteDateDuJour();
    dernierTitreDate = texte;
    champ.value = texte;
    if (typeof currentBoardName !== 'undefined') currentBoardName = texte;
}

// L'heure suit, mais seulement tant que le titre reste celui qu'on a écrit
setInterval(() => {
    if (reglagesDate.heure) poserDateDansTitre(false);
}, 30000);

function majAffichageDate() {
    const cadre = document.getElementById('project-name-wrapper');
    if (cadre) cadre.style.display = reglagesDate.affichee ? '' : 'none';
}

function majReglagesDate() {
    const popup = document.getElementById('reglages-date');
    if (!popup) return;
    popup.querySelectorAll('[data-format]').forEach(b => {
        b.classList.toggle('actif', b.dataset.format === reglagesDate.format);
    });
    const h = document.getElementById('rd-heure');
    if (h) h.classList.toggle('actif', !!reglagesDate.heure);
}

function basculerReglagesDate(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('reglages-date');
    if (!popup) return;
    if (popup.classList.toggle('visible')) majReglagesDate();
}

document.addEventListener('click', (e) => {
    const popup = document.getElementById('reglages-date');
    const bouton = document.getElementById('btn-reglages-date');
    if (!popup || !popup.classList.contains('visible')) return;
    if (popup.contains(e.target) || (bouton && bouton.contains(e.target))) return;
    popup.classList.remove('visible');
});

document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('reglages-date');
    if (!popup) return;
    popup.querySelectorAll('[data-format]').forEach(b => {
        b.addEventListener('click', () => {
            reglagesDate.format = b.dataset.format;
            enregistrerReglagesDate();
            poserDateDansTitre(true);
            majReglagesDate();
        });
    });
    const h = document.getElementById('rd-heure');
    if (h) h.addEventListener('click', () => {
        reglagesDate.heure = !reglagesDate.heure;
        enregistrerReglagesDate();
        poserDateDansTitre(true);
        majReglagesDate();
    });
    const remettre = document.getElementById('rd-remettre');
    if (remettre) remettre.addEventListener('click', () => {
        poserDateDansTitre(true);
        if (typeof showToast === 'function') showToast('Date du jour remise dans le titre');
    });
});

// ===================================================
// ASTUCE DU JOUR
// Une astuce au démarrage, une par jour au maximum. Beaucoup de ces outils
// ne se devinent pas : autant les faire connaître un par un.
// ===================================================
const ASTUCES = [
    { titre: 'Le stylo qui redresse les formes',
      texte: "Dessinez un cercle, un triangle ou un rectangle à main levée, puis GARDEZ le doigt ou la souris appuyé une seconde à la fin du tracé : la forme se redresse toute seule. Les losanges et les parallélogrammes sont reconnus aussi." },
    { titre: 'Vos propres barres d\'outils',
      texte: "Faites glisser un outil du tiroir vers le tableau : il crée une petite barre flottante. Ajoutez-en d'autres dedans, déplacez-la, changez sa couleur avec la roue. Vous pouvez ensuite enregistrer toute votre disposition dans l'onglet « Interfaces »." },
    { titre: 'Le rideau et le projecteur',
      texte: "Le bouton « rideau » masque le tableau : tirez une poignée pour dévoiler la correction ligne par ligne. Le « projecteur » n'éclaire qu'une zone, et suit votre doigt." },
    { titre: 'Dupliquer d\'un geste',
      texte: "Sélectionnez une figure et faites Ctrl+D, ou touchez le bouton copie du petit menu : la copie arrive à côté, prête à être déplacée. Pratique pour la même figure à annoter quatre fois." },
    { titre: 'Des interfaces toutes prêtes',
      texte: "Dans le tiroir de droite, onglet « Interfaces », huit configurations vous attendent : par niveau (maternelle à lycée), minimale, conduite de classe, complète. Elles ne suppriment rien, elles rangent." },
    { titre: 'Écrire comme sur une copie',
      texte: "Le bouton « Fonds » propose un cahier Seyès avec marge et une copie d'examen avec en-tête. Le texte s'aligne tout seul sur les lignes." },
    { titre: 'Deux doigts pour se déplacer',
      texte: "Sur tablette, deux doigts qui glissent déplacent le tableau, et deux doigts qui s'écartent zooment. Un seul doigt continue d'écrire." },
    { titre: 'Mettre un mot en couleur',
      texte: "Pendant la saisie, surlignez un mot : la couleur, la taille et la police ne s'appliquent qu'à lui. Sans surlignage, elles agissent sur tout le bloc." },
    { titre: 'Retrouver un outil par son nom',
      texte: "La loupe de la barre des outils cherche parmi les 83 outils. Tapez « fraction », « horloge » ou « tirage » : c'est plus rapide que de parcourir les rubriques." },
    { titre: 'Les points de la classe',
      texte: "Dans « Outils Profs », l'outil « Points de classe » affiche vos élèves avec un petit monstre. Un clic donne un bonus, le bouton « Malus » inverse le geste, et l'on peut poser le tableau des points sur le tableau. À 20 points, l'élève gagne une étoile et le compteur repart à zéro — le seuil se règle." },
    { titre: 'Votre cours arrive tel quel',
      texte: "Glissez un fichier Word (.docx), LibreOffice (.odt) ou texte sur le tableau — ou passez par le menu « Importer ». Les titres, le gras, l'italique et les listes sont conservés, et le texte reste modifiable comme si vous l'aviez tapé." },
    { titre: 'Le point d\'intersection',
      texte: "Avec l'aimant allumé, approchez le curseur du croisement de deux tracés : un point vert apparaît, et le clic tombe pile dessus. Un appui long sur l'aimant permet de choisir ce qui attire : le quadrillage, les bords de la règle et de l'équerre, les intersections." },
    { titre: 'Le tableau se souvient',
      texte: "Votre travail est enregistré tout seul. Au prochain démarrage, le tableau vous propose de reprendre la session — et si vous choisissez « Nouveau tableau », l'ancienne est rangée dans « Mes tableaux »." }
];

const CLE_ASTUCES = 'board_astuces';
let etatAstuces = { active: true, jour: '', index: 0 };
try {
    const brut = localStorage.getItem(CLE_ASTUCES);
    if (brut) etatAstuces = { ...etatAstuces, ...JSON.parse(brut) };
} catch (e) { /* illisible : valeurs par défaut */ }

function enregistrerAstuces() {
    try { localStorage.setItem(CLE_ASTUCES, JSON.stringify(etatAstuces)); } catch (e) { /* stockage refusé */ }
}

function astucesActivees() { return !!etatAstuces.active; }

function basculerAstuces() {
    etatAstuces.active = !etatAstuces.active;
    enregistrerAstuces();
    if (typeof showToast === 'function') {
        showToast(etatAstuces.active ? 'Une astuce par jour au démarrage' : 'Astuces désactivées');
    }
}

function montrerAstuce(manuelle, decalage) {
    const boite = document.getElementById('astuce-modal');
    if (!boite) return;
    if (decalage) etatAstuces.index = (etatAstuces.index + decalage + ASTUCES.length) % ASTUCES.length;
    const a = ASTUCES[etatAstuces.index % ASTUCES.length];
    document.getElementById('astuce-titre').innerText = a.titre;
    document.getElementById('astuce-texte').innerText = a.texte;
    document.getElementById('astuce-compte').innerText = `${(etatAstuces.index % ASTUCES.length) + 1} / ${ASTUCES.length}`;
    boite.style.display = 'flex';
    if (manuelle) {
        const popup = document.getElementById('reglages-barre');
        if (popup) popup.classList.remove('visible');
    }
}

function fermerAstuce() {
    const boite = document.getElementById('astuce-modal');
    if (boite) boite.style.display = 'none';
    // L'astuce suivante sera proposée demain, pas dans cinq minutes
    etatAstuces.index = (etatAstuces.index + 1) % ASTUCES.length;
    etatAstuces.jour = new Date().toDateString();
    enregistrerAstuces();
}

// Au démarrage : une seule fois par jour, et jamais par-dessus quelqu'un qui
// a déjà commencé à travailler — une astuce ne doit pas couper un geste.
let aDejaAgi = false;
['pointerdown', 'keydown', 'wheel'].forEach(ev =>
    window.addEventListener(ev, () => { aDejaAgi = true; }, { once: true, capture: true }));

window.addEventListener('load', () => {
    setTimeout(() => {
        if (!astucesActivees() || aDejaAgi) return;
        if (etatAstuces.jour === new Date().toDateString()) return;
        const modaleReprise = document.getElementById('restore-modal');
        if (modaleReprise && getComputedStyle(modaleReprise).display !== 'none') return; // on ne s'empile pas
        montrerAstuce(false);
    }, 2500);
});

// Échap referme l'astuce, comme tout le reste
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const boite = document.getElementById('astuce-modal');
    if (boite && getComputedStyle(boite).display !== 'none') { fermerAstuce(); e.stopImmediatePropagation(); }
}, true);

// ===================================================
// RÉGLAGES DE LA BARRE DES PLUGINS
// ===================================================
function majReglagesBarre() {
    const popup = document.getElementById('reglages-barre');
    if (!popup) return;
    const format = (typeof formatIcones === 'function') ? formatIcones() : 'non';
    popup.querySelectorAll('[data-libelles]').forEach(b => {
        b.classList.toggle('actif', b.dataset.libelles === format);
    });
    const bDate = document.getElementById('rp-date');
    if (bDate) bDate.classList.toggle('actif', reglagesDate.affichee);
    const bAstuces = document.getElementById('rp-astuces');
    if (bAstuces) bAstuces.classList.toggle('actif', astucesActivees());
}

function basculerReglagesBarre(e) {
    if (e) e.stopPropagation();
    const popup = document.getElementById('reglages-barre');
    if (!popup) return;
    const ouvert = popup.classList.toggle('visible');
    if (ouvert) majReglagesBarre();
}

document.addEventListener('click', (e) => {
    const popup = document.getElementById('reglages-barre');
    const bouton = document.getElementById('btn-reglages-barre');
    if (!popup || !popup.classList.contains('visible')) return;
    if (popup.contains(e.target) || (bouton && bouton.contains(e.target))) return;
    popup.classList.remove('visible');
});

document.addEventListener('DOMContentLoaded', () => {
    const popup = document.getElementById('reglages-barre');
    if (!popup) return;

    popup.querySelectorAll('[data-libelles]').forEach(b => {
        b.addEventListener('click', () => {
            if (typeof choisirFormatIcones === 'function') choisirFormatIcones(b.dataset.libelles, true);
        });
    });

    const bDate = document.getElementById('rp-date');
    if (bDate) bDate.addEventListener('click', () => {
        reglagesDate.affichee = !reglagesDate.affichee;
        enregistrerReglagesDate();
        majAffichageDate();
        majReglagesBarre();
    });

    const bAstuces = document.getElementById('rp-astuces');
    if (bAstuces) bAstuces.addEventListener('click', () => {
        basculerAstuces();
        majReglagesBarre();
    });

    majAffichageDate();
});



// ===================================================
// RIDEAU ET PROJECTEUR
// Deux gestes de tableau blanc que les logiciels de TBI ont tous :
//  - le rideau masque une partie du tableau et se retire à la demande,
//    pour dévoiler une correction ligne par ligne ;
//  - le projecteur n'éclaire qu'une zone, pour concentrer l'attention.
// Ce sont des calques HTML posés par-dessus le tableau : ils ne modifient
// pas le dessin, n'apparaissent ni à l'export ni dans la sauvegarde, et
// disparaissent au rechargement.
// ===================================================
(function () {
    const rideau = document.getElementById('rideau');
    const spotCalque = document.getElementById('spot-calque');
    const spotTrou = document.getElementById('spot-trou');
    const btnRideau = document.getElementById('btn-rideau');
    const btnSpot = document.getElementById('btn-spot');
    const btnFermer = document.getElementById('masque-fermer');
    if (!rideau || !spotCalque) return;

    // Le rideau couvre toute l'interface : sans cette croix, on ne pourrait
    // plus rien fermer sur une tablette, faute de touche Échap.
    const majFermeture = () => {
        if (!btnFermer) return;
        btnFermer.classList.toggle('visible', !rideau.hidden || !spotCalque.hidden);
    };

    // --- RIDEAU ---
    // Bornes en pixels écran : le rideau ne suit ni le zoom ni le
    // déplacement du tableau, il masque une portion de l'ÉCRAN.
    let cadre = null;

    const poserCadre = () => {
        rideau.style.left = cadre.gauche + 'px';
        rideau.style.top = cadre.haut + 'px';
        rideau.style.width = Math.max(0, cadre.droite - cadre.gauche) + 'px';
        rideau.style.height = Math.max(0, cadre.bas - cadre.haut) + 'px';
    };

    const cadrePlein = () => ({ gauche: 0, haut: 0, droite: window.innerWidth, bas: window.innerHeight });

    function rideauVisible() { return !rideau.hidden; }

    function basculerRideau() {
        if (rideauVisible()) {
            rideau.hidden = true;
            btnRideau.classList.remove('active');
            majFermeture();
            if (typeof draw === 'function') draw();
            return;
        }
        cadre = cadrePlein();
        poserCadre();
        rideau.hidden = false;
        btnRideau.classList.add('active');
        majFermeture();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast('Rideau : glisse les poignées pour dévoiler');
    }

    // Glisser le rideau entier, ou l'un de ses bords
    let prise = null;
    rideau.addEventListener('pointerdown', (e) => {
        const bord = e.target.dataset ? e.target.dataset.bord : null;
        prise = { bord: bord || null, x: e.clientX, y: e.clientY, depart: { ...cadre } };
        rideau.setPointerCapture(e.pointerId);
        e.preventDefault(); e.stopPropagation();
    });

    rideau.addEventListener('pointermove', (e) => {
        if (!prise) return;
        const dx = e.clientX - prise.x, dy = e.clientY - prise.y;
        const d = prise.depart;
        if (!prise.bord) {
            cadre = { gauche: d.gauche + dx, droite: d.droite + dx, haut: d.haut + dy, bas: d.bas + dy };
        } else if (prise.bord === 'haut') {
            cadre.haut = Math.min(d.haut + dy, d.bas - 20);
        } else if (prise.bord === 'bas') {
            cadre.bas = Math.max(d.bas + dy, d.haut + 20);
        } else if (prise.bord === 'gauche') {
            cadre.gauche = Math.min(d.gauche + dx, d.droite - 20);
        } else if (prise.bord === 'droite') {
            cadre.droite = Math.max(d.droite + dx, d.gauche + 20);
        }
        poserCadre();
        e.preventDefault();
    });

    const lacherRideau = (e) => {
        if (!prise) return;
        prise = null;
        if (rideau.hasPointerCapture && e.pointerId !== undefined && rideau.hasPointerCapture(e.pointerId)) {
            rideau.releasePointerCapture(e.pointerId);
        }
    };
    rideau.addEventListener('pointerup', lacherRideau);
    rideau.addEventListener('pointercancel', lacherRideau);

    // --- PROJECTEUR ---
    let spot = { x: 0, y: 0, r: 160 };

    const poserSpot = () => {
        spotTrou.style.left = spot.x + 'px';
        spotTrou.style.top = spot.y + 'px';
        spotTrou.style.width = (spot.r * 2) + 'px';
        spotTrou.style.height = (spot.r * 2) + 'px';
    };

    function spotVisible() { return !spotCalque.hidden; }

    function basculerSpot() {
        if (spotVisible()) {
            spotCalque.hidden = true;
            btnSpot.classList.remove('active');
            majFermeture();
            if (typeof draw === 'function') draw();
            return;
        }
        spot = { x: window.innerWidth / 2, y: window.innerHeight / 2, r: Math.min(200, window.innerWidth / 5) };
        poserSpot();
        spotCalque.hidden = false;
        btnSpot.classList.add('active');
        majFermeture();
        if (typeof draw === 'function') draw();
        if (typeof showToast === 'function') showToast('Projecteur : glisse pour déplacer, molette ou pincement pour la taille');
    }

    let priseSpot = false;
    spotCalque.addEventListener('pointerdown', (e) => {
        priseSpot = true;
        spot.x = e.clientX; spot.y = e.clientY;
        poserSpot();
        spotCalque.setPointerCapture(e.pointerId);
        e.preventDefault(); e.stopPropagation();
    });
    spotCalque.addEventListener('pointermove', (e) => {
        if (!priseSpot) return;
        spot.x = e.clientX; spot.y = e.clientY;
        poserSpot();
        e.preventDefault();
    });
    const lacherSpot = (e) => {
        priseSpot = false;
        if (spotCalque.hasPointerCapture && e.pointerId !== undefined && spotCalque.hasPointerCapture(e.pointerId)) {
            spotCalque.releasePointerCapture(e.pointerId);
        }
    };
    spotCalque.addEventListener('pointerup', lacherSpot);
    spotCalque.addEventListener('pointercancel', lacherSpot);

    spotCalque.addEventListener('wheel', (e) => {
        e.preventDefault();
        spot.r = Math.max(40, Math.min(900, spot.r - e.deltaY * 0.3));
        poserSpot();
    }, { passive: false });

    // Pincer à deux doigts règle le diamètre
    let ecartDepart = null, rayonDepart = null;
    spotCalque.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 2) return;
        ecartDepart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        rayonDepart = spot.r;
    }, { passive: true });
    spotCalque.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 2 || !ecartDepart) return;
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        spot.r = Math.max(40, Math.min(900, rayonDepart * (d / ecartDepart)));
        spot.x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        spot.y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        poserSpot();
        e.preventDefault();
    }, { passive: false });
    spotCalque.addEventListener('touchend', () => { ecartDepart = null; }, { passive: true });

    // --- Commandes ---
    if (btnRideau) btnRideau.addEventListener('click', basculerRideau);
    if (btnSpot) btnSpot.addEventListener('click', basculerSpot);
    if (btnFermer) btnFermer.addEventListener('click', () => {
        if (spotVisible()) basculerSpot();
        if (rideauVisible()) basculerRideau();
    });

    // Échap referme ce qui masque le tableau, avant tout le reste
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (spotVisible()) { basculerSpot(); e.stopImmediatePropagation(); return; }
        if (rideauVisible()) { basculerRideau(); e.stopImmediatePropagation(); }
    }, true);

    // La fenêtre change de taille : le rideau garde ses proportions
    window.addEventListener('resize', () => {
        if (!rideauVisible() || !cadre) return;
        const plein = cadrePlein();
        cadre.droite = Math.min(cadre.droite, plein.droite);
        cadre.bas = Math.min(cadre.bas, plein.bas);
        poserCadre();
    });

    window.basculerRideau = basculerRideau;
    window.basculerSpot = basculerSpot;
    // Le menu rapide n'a rien à faire par-dessus un tableau masqué
    window.unMasqueEstOuvert = () => rideauVisible() || spotVisible();
})();
