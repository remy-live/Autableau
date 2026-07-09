const AUTO_SAVE_KEY = 'AuTableau_AutoSave';
let pages = [];
let currentPageIndex = -1;

let zoom = 1; let panX = window.innerWidth / 2; let panY = window.innerHeight / 2;
let showAxes = 0; let magnetMode = false;
let isExportingTransparent = false;
let gridWeight = 1;
let hasShownResizeHelp = false;

let isLoupeActive = false;
let isCropMode = false;
let cropRect = null;

let laserStrokes = [];
let currentLaserStroke = null;

let backgrounds = ['blanc', 'carreau', 'seyes', 'millimetre', 'point', 'isometrique'];
const bgColors = { millimetre: '#fdf6e3', default: '#ffffff' };
let currentBgIndex = 0;

let isDarkMode = false;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];

let activeStyle = {
    strokeColor: '#e74c3c', strokeOpacity: 1.0,
    isFilled: false, fillColor: '#e74c3c', fillOpacity: 0.2,
    pointShape: 'circle', lineWidth: 3, lineDash: 'solid', fontSize: 24,
    lineHeight: 29, // <--- AJOUTE lineHeight ICI
    arrowStart: 0, arrowEnd: 0
};
let nextId = 1; let globalZ = 1;
let points = []; let segments = []; let circles = []; let rectangles = []; let texts = [];
let freehands = []; let curves = []; let polygons = []; let images = []; let arcs = [];
const imageCache = {};

let history = []; let historyIndex = -1;

const FLOAT_TOOLBAR_BTN_SIZE = 36;
const FLOAT_TOOLBAR_GAP = 2;
const FLOAT_TOOLBAR_PADDING = 12;

let mode = 'pointer'; let selectedItems = []; let hoveredObj = null;

function getGroupMembers(groupId) {
    if (!groupId) return [];
    let members = [];
    [{arr: points, t: 'point'}, {arr: segments, t: 'segment'}, {arr: circles, t: 'circle'}, {arr: rectangles, t: 'rectangle'}, {arr: texts, t: 'text'}, {arr: freehands, t: 'freehand'}, {arr: curves, t: 'curve'}, {arr: polygons, t: 'polygon'}, {arr: images, t: 'image'}, {arr: arcs, t: 'arc'}].forEach(collection => {
        collection.arr.forEach(obj => {
            if (obj.groupId === groupId) members.push({type: collection.t, id: obj.id, obj: obj});
        });
    });
    return members;
}
let isSelectingBox = false; let selectionBox = { startX: 0, startY: 0, endX: 0, endY: 0 };
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
    // Enregistrer un nouveau plugin
    register: function (name, pluginObj) {
        this.plugins[name] = pluginObj;
        if (typeof pluginObj.init === 'function') pluginObj.init();
        console.log(`🔌 Plugin chargé : ${name}`);
    },
    // Déclencher un événement pour tous les plugins
    trigger: function (eventName, ...args) {
        let handled = false;
        Object.values(this.plugins).forEach(plugin => {
            if (typeof plugin[eventName] === 'function') {
                if (plugin[eventName](...args)) handled = true; // Si un plugin renvoie "true", il prend la main
            }
        });
        return handled;
    }
};

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

// ==========================================
// OUTILS DE GÉOMÉTRIE (AVEC EXPORT SVG VECTORIEL)
// ==========================================

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
        if (MathUtils.dist(local.x, local.y, this.radius, 0) < 20) return 'trace';
        if (MathUtils.distanceToSegment(local.x, local.y, headX, headY - 30, 0, 0) < 15) return 'move';
        const legStartX = this.radius; const legStartY = 0;
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
        ctx.save(); ctx.translate(this.radius, 0);
        ctx.beginPath(); ctx.fillStyle = style.colors.lead; ctx.moveTo(0, 0); ctx.lineTo(1.5, -5); ctx.lineTo(-1.5, -5); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = style.colors.wood; ctx.moveTo(-1.5, -5); ctx.lineTo(1.5, -5); ctx.lineTo(5, -18); ctx.lineTo(-5, -18); ctx.fill();
        const penH = 55; ctx.fillStyle = style.colors.pencil; ctx.strokeStyle = style.colors.outline; ctx.lineWidth = 1; ctx.fillRect(-5, -18 - penH, 10, penH); ctx.strokeRect(-5, -18 - penH, 10, penH);
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.fillRect(-2, -18 - penH, 2, penH);
        ctx.translate(0, elbowY); ctx.beginPath(); ctx.fillStyle = style.colors.metalDark; ctx.strokeStyle = style.colors.outline; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.roundRect(-7, -8, 14, 16, 2); ctx.fill(); ctx.stroke(); } else { ctx.rect(-7, -8, 14, 16); ctx.fill(); ctx.stroke(); }
        ctx.restore();
        ctx.beginPath(); ctx.strokeStyle = style.colors.outline; ctx.lineWidth = style.widths.arm + 2; ctx.lineCap = "butt"; ctx.moveTo(elbowX - 10, elbowY - 10); ctx.lineTo(this.radius, elbowY - 10); ctx.stroke();
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

        svg += `<line x1="${elbowX - 10}" y1="${elbowY - 10}" x2="${this.radius}" y2="${elbowY - 10}" stroke="${style.colors.outline}" stroke-width="${style.widths.arm + 2}"/>`;
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
        const coll = 10; const l = this.toLocal(mx, my);
        if (Math.sqrt((l.x - this.width) ** 2 + (l.y) ** 2) < 30) return 'resizeWidth';
        if (Math.sqrt((l.x) ** 2 + (l.y - this.height) ** 2) < 30) return 'resizeHeight';
        if (l.x < coll && l.y < coll) return null;
        if (l.x > 35 && l.x < 65 && l.y > 35 && l.y < 65) return 'toggleSlide';
        if (l.x <= coll && l.y <= coll) return null;
        if (l.x >= 0 && l.y >= 0 && l.y <= -this.height / this.width * l.x + this.height) {
            if (l.y < 30) return this.slideMode ? 'slideX' : 'rotate';
            if (l.x < 30) return this.slideMode ? 'slideY' : 'rotate';
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
            if (i > 0 && i % cm === 0) {
                ctx.save(); ctx.translate(22, i); ctx.rotate(-Math.PI / 2); ctx.fillText(i / cm, 0, 0); ctx.restore();
            }
        }

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
        const l = this.toLocal(mx, my); const d = Math.sqrt(l.x * l.x + l.y * l.y);
        if (Math.abs(l.x) < 12 && l.y < -30 && l.y > -60) return 'toggleLock';
        if (Math.abs(l.x) < 12 && l.y >= -85 && l.y <= -61) return 'toggleSwap';
        if (Math.abs(l.x) < 12 && l.y >= -113 && l.y <= -89) return 'toggleDouble';
        if (this.isLocked) { if (d < 30) return 'traceAngle'; return null; }
        if (d < 20) return 'move'; if (d > this.radius - 30 && d < this.radius + 10 && l.y < 0) return 'rotate';
        if (d < this.radius && l.y < 0) return 'move'; return null;
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
        if (l.x >= 0 && l.x <= this.width && l.y >= 0 && l.y <= this.height) {
            if (l.x > this.width - 25) return 'resize';
            if (l.y < 25 || l.x < 25) return 'rotate';
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
        history: [], historyIndex: -1, panX: window.innerWidth / 2, panY: window.innerHeight / 2, zoom: 1
    };
}

function syncPage() {
    if (currentPageIndex === -1 || !pages[currentPageIndex]) return;
    pages[currentPageIndex] = { ...pages[currentPageIndex], points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs, history, historyIndex, panX, panY, zoom };
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
    freehands = p.freehands || []; curves = p.curves || []; polygons = p.polygons || []; images = p.images || []; arcs = p.arcs || [];
    history = p.history || []; historyIndex = p.historyIndex !== undefined ? p.historyIndex : -1;
    panX = p.panX || window.innerWidth / 2; panY = p.panY || window.innerHeight / 2; zoom = p.zoom || 1;

    document.getElementById('zoom-slider').value = zoom;
    if (history.length === 0) saveState();

    updatePageUI(); clearSelection(); draw();
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
function openConfirmModal(title, text, isDanger, callback) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-text').innerText = text;
    const yesBtn = document.getElementById('confirm-yes-btn');
    if (isDanger) { yesBtn.className = 'btn-action danger'; }
    else { yesBtn.className = 'btn-action primary'; }
    confirmCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}
function closeConfirmModal() { document.getElementById('confirm-modal').style.display = 'none'; confirmCallback = null; }

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
    const focusBtn = document.getElementById('btn-focus');
    if (focusBtn) {
        focusBtn.textContent = document.body.classList.contains('focus-mode') ? 'Quitter Focus' : 'Focus';
    }
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
        document.getElementById('help-modal').style.display = 'flex';
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

function cancelRestore() {
    localforage.removeItem(AUTO_SAVE_KEY).then(() => {
        document.getElementById('restore-modal').style.display = 'none';
        initPages();
    });
}

// --- SAUVEGARDE ET HISTORIQUE ---
function saveAppLocal() {
    syncPage();
    let appState = { pages, nextId, globalZ, currentBgIndex };

    // NOUVEAU : On utilise localforage. Plus besoin de JSON.stringify !
    localforage.setItem(AUTO_SAVE_KEY, appState).catch((e) => {
        console.error("Erreur de sauvegarde IndexedDB :", e);
        // Fallback de sécurité extrême au cas où
        const cleanedPages = pages.map(p => ({
            ...p, images: (p.images || []).map(img => img.isBg ? { ...img, src: "" } : img)
        }));
        localforage.setItem(AUTO_SAVE_KEY, { pages: cleanedPages, nextId, globalZ, currentBgIndex });
    });
}

function saveState() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    const state = JSON.stringify({ points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs });
    if (historyIndex >= 0 && history[historyIndex] === state) return;
    history.push(state); historyIndex++;
    
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

    if (state.pages) {
        pages = state.pages; nextId = state.nextId || 1; globalZ = state.globalZ || 1; currentBgIndex = state.currentBgIndex || 0;
    }
    else {
        pages = [{ points: state.points || [], segments: state.segments || [], circles: state.circles || [], rectangles: state.rectangles || [], texts: state.texts || [], freehands: state.freehands || [], curves: state.curves || [], polygons: state.polygons || [], images: state.images || [], arcs: state.arcs || [], history: state.history || [], historyIndex: state.historyIndex !== undefined ? state.historyIndex : -1, panX: window.innerWidth / 2, panY: window.innerHeight / 2, zoom: 1 }]; nextId = state.nextId || 1; globalZ = state.globalZ || 1;
    }

    pages.forEach(p => {
        (p.images || []).forEach(img => { if (!imageCache[img.src] && img.src !== "") { const i = new Image(); i.src = img.src; imageCache[img.src] = i; i.onload = () => requestAnimationFrame(draw); } });
        (p.texts || []).forEach(t => { if (t.content.includes('$')) createMathImage(t.content, t.color || t.strokeColor, t.fontSize, (img, w, h) => { if (img) { t.mathImg = img; t.mathW = w; t.mathH = h; draw(); } }); });
    });

    loadPage(0);
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        const state = JSON.parse(history[historyIndex]);
        points = state.points || []; segments = state.segments || []; circles = state.circles || []; rectangles = state.rectangles || [];
        texts = state.texts || []; freehands = state.freehands || []; curves = state.curves || [];
        polygons = state.polygons || []; images = state.images || []; arcs = state.arcs || [];
        creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; mouseLogicalPos = null; currentTracingArc = null;
        saveAppLocal(); draw();
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        const state = JSON.parse(history[historyIndex]);
        points = state.points || []; segments = state.segments || []; circles = state.circles || []; rectangles = state.rectangles || [];
        texts = state.texts || []; freehands = state.freehands || []; curves = state.curves || [];
        polygons = state.polygons || []; images = state.images || []; arcs = state.arcs || [];
        creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; mouseLogicalPos = null; currentTracingArc = null;
        saveAppLocal(); draw();
    }
}

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

document.getElementById('btn-clear').addEventListener('click', () => {
    openConfirmModal("Tout effacer", "Voulez-vous vraiment créer un nouveau document vide ?", true, clearBoardAndPages);
});

const btnTrashNow = document.getElementById('btn-trash-now');
if (btnTrashNow) {
    btnTrashNow.addEventListener('click', () => {
        openConfirmModal("Tout effacer", "Voulez-vous vraiment tout effacer ?", true, clearBoardAndPages);
    });
}

// btn-save listener is now overridden by the new Explorer save logic

document.getElementById('btn-load').addEventListener('click', () => { document.getElementById('file-loader').click(); });
document.getElementById('file-loader').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { restoreState(e.target.result); showToast("Projet chargé !"); };
    reader.readAsText(file); e.target.value = '';
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
        if (currentMs <= 0) {
            currentMs = 0; isTwRunning = false;
            btnPause.style.display = 'none'; btnPlay.style.display = 'block';
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
document.getElementById('btn-tw-close').addEventListener('click', () => twWidget.style.display = 'none');
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
            const p1Id = nextId++; const p2Id = nextId++;
            points.push({ id: p1Id, x: minX, y: minY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
            points.push({ id: p2Id, x: maxX, y: maxY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ });
            rectangles.push({
                id: nextId++, p1_id: p1Id, p2_id: p2Id, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash,
                isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++
            });
            recognized = true; shapeName = "Rectangle";
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
            if (obj.cw !== undefined && obj.ch !== undefined && imageCache[obj.src]) {
                const origW = imageCache[obj.src].width || obj.cw;
                const origH = imageCache[obj.src].height || obj.ch;
                svg += `<svg x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" viewBox="${obj.cx || 0} ${obj.cy || 0} ${obj.cw} ${obj.ch}"${transformAttr}><image href="${obj.src}" x="0" y="0" width="${origW}" height="${origH}" preserveAspectRatio="none" /></svg>`;
            } else {
                svg += `<image href="${obj.src}" x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}"${transformAttr} preserveAspectRatio="none" />`;
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
                svg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" />`;
                if (obj.arrowStart) {
                    const svgAngle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                    svg += getSvgArrowHead(p1.x, p1.y, svgAngle, color, w, 1, obj.arrowStart);
                }
                if (obj.arrowEnd) {
                    const svgAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    svg += getSvgArrowHead(p2.x, p2.y, svgAngle, color, w, 1, obj.arrowEnd);
                }
            }
        } else if (item.type === 'point') {
            if (hiddenPoints.has(obj.id)) return;
            const s = 4;
            if (obj.shape === 'circle') svg += `<circle cx="${obj.x}" cy="${obj.y}" r="${s}" fill="${color}" />`;
            else if (obj.shape === 'square') svg += `<rect x="${obj.x - s}" y="${obj.y - s}" width="${s * 2}" height="${s * 2}" fill="${color}" />`;
            else if (obj.shape === 'pixel') svg += `<rect x="${obj.x - 1.5}" y="${obj.y - 1.5}" width="3" height="3" fill="${color}" />`;
            else if (obj.shape === 'cross') {
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
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = obj.content;
                    const lines = []; let currentLine = [];

                    function parseNode(node, currentStyle) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const textParts = node.textContent.replace(/\u200B/g, '').split('\n');
                            textParts.forEach((txt, idx) => {
                                if (txt.length > 0) currentLine.push({ text: txt, style: { ...currentStyle } });
                                if (idx < textParts.length - 1) {
                                    lines.push(currentLine); currentLine = [];
                                }
                            });
                        } else if (node.nodeName === 'BR') {
                            lines.push(currentLine); currentLine = [];
                        } else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
                            if (currentLine.length > 0) { lines.push(currentLine); currentLine = []; }
                            const newStyle = { ...currentStyle };
                            Array.from(node.childNodes).forEach(c => parseNode(c, newStyle));
                            if (currentLine.length > 0) { lines.push(currentLine); currentLine = []; }
                        } else {
                            const newStyle = { ...currentStyle };
                            if (node.nodeName === 'B' || node.nodeName === 'STRONG' || (node.style && node.style.fontWeight === 'bold')) newStyle.bold = true;
                            if (node.nodeName === 'I' || node.nodeName === 'EM' || (node.style && node.style.fontStyle === 'italic')) newStyle.italic = true;
                            if (node.nodeName === 'U' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'))) newStyle.underline = true;
                            if (node.style && node.style.color) newStyle.color = node.style.color;
                            if (node.hasAttribute && node.hasAttribute('color')) newStyle.color = node.getAttribute('color');
                            Array.from(node.childNodes).forEach(c => parseNode(c, newStyle));
                        }
                    }
                    Array.from(tempDiv.childNodes).forEach(c => parseNode(c, {}));
                    if (currentLine.length > 0 || lines.length === 0) lines.push(currentLine);

                    const align = obj.align || 'left';
                    const fontSize = obj.fontSize || 24;
                    const fontFamily = obj.fontFamily || 'sans-serif';
                    const lineHeight = obj.lineHeight || Math.round(fontSize * 1.2);
                    let startY = obj.y + (fontSize * 0.1);

                    let maxW = 0;
                    const lineMetrics = lines.map(line => {
                        let textWidth = 0;
                        line.forEach(seg => {
                            // Pseudo-mesure via context existant ou estimation si indisponible
                            if (typeof ctx !== 'undefined') {
                                ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                                textWidth += ctx.measureText(seg.text).width;
                            } else {
                                textWidth += seg.text.length * (fontSize * 0.6); // Fallback très basique
                            }
                        });
                        if (textWidth > maxW) maxW = textWidth;
                        return textWidth;
                    });

                    // Forcer une largeur minimale si c'est une bulle vide
                    if (obj.isBubble && maxW < 20) { maxW = 150; }

                    let transformAttr = "";
                    const cx = obj.x + (maxW / 2);
                    const cy = obj.y + ((lines.length * lineHeight) / 2);
                    if (angle !== 0) {
                        transformAttr = ` transform="rotate(${angleDeg}, ${cx}, ${cy})"`;
                    }

                    if (transformAttr !== "") svg += `<g${transformAttr}>`;

                    // 🌟 EXPORT VECTORIEL DES BULLES INTERACTIVES
                    if (obj.isBubble) {
                        let pad = obj.bubblePad !== undefined ? obj.bubblePad : 25;
                        let bw = maxW + pad * 2; let bh = (lines.length * lineHeight) + pad * 2;
                        let bx = obj.x - pad; let by = obj.y - pad;

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
                    lines.forEach((line, i) => {
                        const lineWidth = lineMetrics[i];
                        let curX = obj.x;
                        if (align === 'center') curX = obj.x + (maxW / 2) - (lineWidth / 2);
                        else if (align === 'right') curX = obj.x + maxW - lineWidth;

                        svg += `<text x="${curX}" y="${startY + i * lineHeight}" font-family="${fontFamily}" font-size="${fontSize}px" dominant-baseline="hanging" xml:space="preserve">`;

                        line.forEach(seg => {
                            const fw = seg.style.bold ? 'bold' : 'normal';
                            const fs = seg.style.italic ? 'italic' : 'normal';
                            const td = seg.style.underline ? 'underline' : 'none';
                            const fc = seg.style.color || color;
                            const escapedText = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

                            svg += `<tspan font-weight="${fw}" font-style="${fs}" text-decoration="${td}" fill="${fc}">${escapedText}</tspan>`;
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
function performCapture(action) {
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

    let rx = wasCropMode && currentRect ? Math.min(currentRect.startX, currentRect.endX) : 0;
    let ry = wasCropMode && currentRect ? Math.min(currentRect.startY, currentRect.endY) : 0;
    let rw = wasCropMode && currentRect ? Math.abs(currentRect.endX - currentRect.startX) : canvas.width;
    let rh = wasCropMode && currentRect ? Math.abs(currentRect.endY - currentRect.startY) : canvas.height;

    // L'export SVG reste en Vectoriel (Qualité Infinie)
    if (action === 'svg') {
        const svgStr = generateSVGString({ x: rx, y: ry, w: rw, h: rh }, keepBg);
        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `AuTableau_${Date.now()}.svg`; a.click();
        URL.revokeObjectURL(url);
        showToast("Fichier SVG exporté !");

        selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
        cropRect = null; exportPopover.classList.remove('visible');
        syncStyleWithSelection(); draw();
        return;
    }

    // Rendu en image (PNG, PDF, Copie)
    setTimeout(() => {
        let targetCanvas = canvas;

        // C'est ici que la qualité opère ! On multiplie la taille du canvas
        if (wasCropMode && currentRect && rw > 10 && rh > 10) {
            targetCanvas = document.createElement('canvas');
            targetCanvas.width = rw * qualityScale;
            targetCanvas.height = rh * qualityScale;
            const tCtx = targetCanvas.getContext('2d');

            // On étire le dessin pour gagner en résolution
            tCtx.scale(qualityScale, qualityScale);
            tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
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
        const btnPdfAll = document.getElementById('btn-do-export-pdf-all');

        if (selectedFormat === 'png') {
            desc.innerText = "PNG : Idéal pour intégrer dans un document ou partager sur le web.";
            settings.style.display = 'block';
            if (btnPdfAll) btnPdfAll.style.display = 'none';
        } else if (selectedFormat === 'svg') {
            desc.innerText = "SVG : Format vectoriel parfait pour imprimer en grand ou modifier plus tard.";
            settings.style.display = 'none';
            if (btnPdfAll) btnPdfAll.style.display = 'none';
        } else if (selectedFormat === 'pdf') {
            desc.innerText = "PDF : Format idéal pour archiver ou imprimer des documents de cours.";
            settings.style.display = 'block';
            if (btnPdfAll) btnPdfAll.style.display = 'block';
        }
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
        performCapture(selectedFormat);
    });
}

// --- 3. Fonction de Capture ---
function performCapture(action) {
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

    let rx = wasCropMode && currentRect ? Math.min(currentRect.startX, currentRect.endX) : 0;
    let ry = wasCropMode && currentRect ? Math.min(currentRect.startY, currentRect.endY) : 0;
    let rw = wasCropMode && currentRect ? Math.abs(currentRect.endX - currentRect.startX) : canvas.width;
    let rh = wasCropMode && currentRect ? Math.abs(currentRect.endY - currentRect.startY) : canvas.height;

    // L'export SVG reste en Vectoriel (Qualité Infinie)
    if (action === 'svg') {
        const svgStr = generateSVGString({ x: rx, y: ry, w: rw, h: rh }, keepBg);
        const blob = new Blob([svgStr], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `AuTableau_${Date.now()}.svg`; a.click();
        URL.revokeObjectURL(url);
        showToast("Fichier SVG exporté !");

        selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
        cropRect = null; if (exportPopover) exportPopover.classList.remove('visible');
        syncStyleWithSelection(); draw();
        return;
    }

    // Rendu en image (PNG, PDF, Copie)
    setTimeout(() => {
        // C'est ici que la qualité opère ! On multiplie la taille du canvas
        let targetCanvas = document.createElement('canvas');
        targetCanvas.width = rw * qualityScale;
        targetCanvas.height = rh * qualityScale;
        const tCtx = targetCanvas.getContext('2d');

        // On étire le dessin pour gagner en résolution
        tCtx.scale(qualityScale, qualityScale);
        tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

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

        selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
        isCropMode = false; cropRect = null; if (exportPopover) exportPopover.classList.remove('visible');
        syncStyleWithSelection(); draw();
    }, 100);
}

// --- 4. LE BOUTON MAGIQUE : PDF DE TOUTES LES PAGES ---
const btnExportAllPdf = document.getElementById('btn-do-export-pdf-all');
if (btnExportAllPdf) {
    btnExportAllPdf.addEventListener('click', async () => {
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

            const tempC = document.createElement('canvas');
            tempC.width = rw * qualityScale;
            tempC.height = rh * qualityScale;
            const tCtx = tempC.getContext('2d');
            tCtx.scale(qualityScale, qualityScale);
            tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

            // Ajout dans le document PDF
            if (!pdf) {
                pdf = new window.jspdf.jsPDF({ orientation: rw > rh ? 'landscape' : 'portrait', unit: 'px', format: [rw, rh] });
            } else {
                pdf.addPage([rw, rh], rw > rh ? 'landscape' : 'portrait');
            }
            pdf.addImage(tempC.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, rw, rh);
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
    });
}
// --- HELPER DYNAMIQUE POUR L'EDITEUR WYSIWYG ---
function updateWysiwygPosition() {
    if (wysiwygText.style.display === 'block') {
        let currentSize = activeStyle.fontSize;
        let currentFont = activeStyle.fontFamily || 'sans-serif';

        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) {
                currentSize = t.fontSize || activeStyle.fontSize;
                currentFont = t.fontFamily || 'sans-serif';
                wysiwygText.style.left = (t.x * zoom + panX) + 'px';
                wysiwygText.style.top = (t.y * zoom + panY) + 'px';
            }
        } else if (tempTextLogicalPos) {
            wysiwygText.style.left = (tempTextLogicalPos.x * zoom + panX) + 'px';
            wysiwygText.style.top = (tempTextLogicalPos.y * zoom + panY) + 'px';
        }

        wysiwygText.style.fontSize = (currentSize * zoom) + 'px';
        wysiwygText.style.fontFamily = currentFont;
        let currentLH = activeStyle.lineHeight || Math.round(currentSize * 1.2);
        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t && t.lineHeight) currentLH = t.lineHeight;
        }
        wysiwygText.style.lineHeight = (currentLH * zoom) + 'px';
        wysiwygText.style.color = activeStyle.strokeColor;
        wysiwygText.style.textAlign = activeStyle.textAlign || 'left';
        wysiwygText.style.transform = `translate(0, 0)`;
    }
    if (typeof updateTextToolbarPosition === 'function') updateTextToolbarPosition();
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
// --- GESTION CLAVIER ---
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if ((e.key === 'l' || e.key === 'L') && !e.repeat) {
        toggleLoupe();
    }
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
    }
    if (e.ctrlKey || e.metaKey) { if (e.key === 'z') { e.preventDefault(); undo(); } if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); } }
    if (e.code === 'Space') { e.preventDefault(); isSpacePressed = true; updateCursor(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length > 0) {
        let deletedSomething = false;
        let itemsToDelete = new Map();
        selectedItems.forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if (!obj) return;
            if (obj.locked && !obj.groupId) return;
            itemsToDelete.set(item.type + '-' + item.id, item);
            if (obj.groupId) {
                getGroupMembers(obj.groupId).forEach(member => {
                    itemsToDelete.set(member.type + '-' + member.id, {type: member.type, id: member.id});
                });
            }
        });
        Array.from(itemsToDelete.values()).forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if (obj && (obj.groupId || !obj.locked)) { deleteObject(item.type, item.id); deletedSomething = true; }
        });
        if (deletedSomething) { clearSelection(); saveState(); draw(); }
    }
});



// On cache la barre quand on a fini
wysiwygText.addEventListener('blur', () => { textToolbar.style.display = 'none'; });

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
        }, 150);
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
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        if (dropOverlay) dropOverlay.style.display = 'flex';
    }
});
document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        if (dropOverlay) dropOverlay.style.display = 'flex';
    }
});
document.addEventListener('dragleave', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        if (e.relatedTarget === null || e.relatedTarget.nodeName === "HTML") {
            if (dropOverlay) dropOverlay.style.display = 'none';
        }
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dropOverlay) dropOverlay.style.display = 'none';

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        let imageDropCount = 0;
        let pdfDropped = false;

        // On boucle sur TOUS les fichiers déposés !
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];

            // Si c'est un PDF
            if (file.type === 'application/pdf') {
                if (!pdfDropped) {
                    loadPdf(file);
                    pdfDropped = true; // On limite à 1 PDF à la fois pour ne pas faire exploser la mémoire
                } else {
                    if (typeof showToast === 'function') showToast("Veuillez importer un seul PDF à la fois.");
                }
                continue;
            }

            // Si c'est une image
            if (file.type.match('image.*')) {
                const reader = new FileReader();
                const currentOffsetIndex = imageDropCount; // On mémorise le numéro de l'image pour le décalage
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

                        images.push({
                            id: nextId++,
                            x: lx - w / 2, y: ly - h / 2,
                            w: w, h: h,
                            cx: 0, cy: 0, cw: img.width, ch: img.height,
                            src: src,
                            z: globalZ++
                        });

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
    });
});
document.getElementById('popover-custom-color').addEventListener('input', (e) => { document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active')); if (popoverTarget === 'stroke') activeStyle.strokeColor = e.target.value; else { activeStyle.fillColor = e.target.value; activeStyle.isFilled = true; } updateColorIndicator(); pushStyleToObject(); });
document.getElementById('opacity-slider').addEventListener('input', (e) => { if (popoverTarget === 'stroke') activeStyle.strokeOpacity = parseFloat(e.target.value); else { activeStyle.fillOpacity = parseFloat(e.target.value); activeStyle.isFilled = true; } updateColorIndicator(); pushStyleToObject(); });
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

    // --- NOUVEAU : On ajoute 'ctx-point' pour les outils segment, curve et polygon ---
    if (targetType === 'point') barStyle.classList.add('ctx-point');
    else if (['segment', 'curve', 'polygon'].includes(targetType)) barStyle.classList.add('ctx-line', 'ctx-point');
    else if (['circle', 'rectangle', 'freehand', 'highlighter', 'multi'].includes(targetType)) barStyle.classList.add('ctx-line');
    else if (targetType === 'text') barStyle.classList.add('ctx-text');
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
    } else {
        document.getElementById('btn-arrow-start').innerHTML = getArrowIcon(activeStyle.arrowStart, true);
        document.getElementById('btn-arrow-start').classList.toggle('active', activeStyle.arrowStart > 0);
        document.getElementById('btn-arrow-end').innerHTML = getArrowIcon(activeStyle.arrowEnd, false);
        document.getElementById('btn-arrow-end').classList.toggle('active', activeStyle.arrowEnd > 0);
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
    selectedItems.forEach(item => {
        const obj = getObjectById(item.type, item.id); if (!obj) return;

        if (!obj.locked) {
            obj.strokeColor = activeStyle.strokeColor; obj.strokeOpacity = activeStyle.strokeOpacity;
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
document.getElementById('line-width').addEventListener('input', (e) => { activeStyle.lineWidth = parseInt(e.target.value); pushStyleToObject(); });
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

    creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; wysiwygText.style.display = 'none'; editingTextId = null;
    clearSelection();

    if (['point', 'segment', 'droite', 'demi-droite', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon'].includes(mode)) {
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
    return null;
}

function updateCursor() {
    canvas.className = '';
    canvas.style.cursor = '';

    // --- Vérification si un outil de dessin est actif ---
    const isDrawingTool = ['segment', 'circle', 'rectangle', 'freehand', 'highlighter', 'curve', 'polygon', 'point'].includes(mode);

    let hoveredWidget = null;

    // On ne détecte le survol des instruments QUE si on n'utilise PAS un outil de dessin
    if (!isDrawingTool) {
        if (activeWidgets.compass && widgets.compass.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.compass;
        else if (activeWidgets.ruler && widgets.ruler.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.ruler;
        else if (activeWidgets.setsquare && widgets.setsquare.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.setsquare;
        else if (activeWidgets.protractor && widgets.protractor.getHitZone(lastRawX, lastRawY)) hoveredWidget = widgets.protractor;
    }

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

function snapToGrid(lx, ly) {
    const bg = backgrounds[currentBgIndex]; let snapX = 30, snapY = 30;
    if (bg === 'millimetre') { snapX = 10; snapY = 10; } else if (bg === 'seyes') { snapX = 40; snapY = 10; } else if (bg === 'isometrique') { snapX = 30 * Math.sqrt(3) / 2; snapY = 15; }
    return { x: Math.round(lx / snapX) * snapX, y: Math.round(ly / snapY) * snapY };
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

function clearSelection() { selectedItems = []; if (!['point', 'segment', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon'].includes(mode)) { document.getElementById('bar-style').classList.remove('visible'); document.getElementById('bar-style').removeAttribute('data-dragged'); } document.getElementById('bar-style').classList.remove('ctx-zindex', 'ctx-lock'); draw(); }
function isSelected(type, id) { return selectedItems.some(item => item.type === type && item.id === id); }
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
                    if (t.content !== val || t.color !== activeStyle.strokeColor || t.fontSize !== activeStyle.fontSize) {
                        t.content = val; t.color = activeStyle.strokeColor; t.fontSize = activeStyle.fontSize;
                        hasChanged = true; processMath(t);
                    }
                }
            } else if (tempTextLogicalPos) {
                const newText = { id: nextId++, x: tempTextLogicalPos.x, y: tempTextLogicalPos.y, content: val, color: activeStyle.strokeColor, fontSize: activeStyle.fontSize, lineHeight: activeStyle.lineHeight, z: globalZ++ };
                texts.push(newText); hasChanged = true; processMath(newText);
            }
        } else if (editingTextId) { deleteObject('text', editingTextId); hasChanged = true; }

        wysiwygText.style.display = 'none'; wysiwygText.innerText = ''; editingTextId = null; tempTextLogicalPos = null;
        if (hasChanged) { saveState(); draw(); }
    }
}
wysiwygText.addEventListener('blur', finalizeText);
wysiwygText.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finalizeText(); canvas.focus(); }
});

canvas.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas) return;
    activePointers.set(e.pointerId, e); canvas.setPointerCapture(e.pointerId);

    const rawPos = getRawLogicalPos(e);
    lastRawX = rawPos.x; lastRawY = rawPos.y;
    // Si un plugin gère le clic (ex: l'outil fraction est actif), on arrête le code normal
    if (PluginManager.trigger('onPointerDown', rawPos, e)) return;

    // --- INTERCEPTION INSTRUMENTS ---
    let targetWidget = null;
    let wType = '';

    // NOUVEAU : On gèle l'interception si on utilise un outil de dessin
    const isDrawingTool = ['segment', 'circle', 'rectangle', 'freehand', 'highlighter', 'curve', 'polygon', 'point'].includes(mode);

    if (!isDrawingTool) {
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

            // Si on attrape la mine du compas on lance le tracé
            if (targetWidget instanceof CompassWidget && zone === 'trace') {
                targetWidget.isTracing = true;
                targetWidget.startAngle = targetWidget.angle;
                targetWidget.lastMouseAngle = Math.atan2(rawPos.y - targetWidget.y, rawPos.x - targetWidget.x);
                targetWidget.totalRotation = 0;
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

    if (e.button === 2 || e.button === 1 || isSpacePressed || mode === 'move') { isPanningView = true; updateCursor(); return; }

    const clickedObj = findObjectAt(rawPos.x, rawPos.y);
    let actionPos = magnetMode ? snapToGrid(rawPos.x, rawPos.y) : rawPos;
    if (clickedObj && clickedObj.type === 'point') actionPos = { x: getObjectById('point', clickedObj.id).x, y: getObjectById('point', clickedObj.id).y };

    if (mode === 'laser') {
        currentLaserStroke = [];
        laserStrokes.push(currentLaserStroke);
        currentLaserStroke.push({ x: rawPos.x, y: rawPos.y, time: Date.now() });
        requestAnimationFrame(draw);
        return;
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

    if (clickedObj && clickedObj.type === 'handle') { draggedHandle = clickedObj.name; isDraggingObjs = true; return; }

    if (mode === 'pointer') {
        if (clickedObj) { if (!isSelected(clickedObj.type, clickedObj.id)) selectObject(clickedObj); isDraggingObjs = true; }
        else { clearSelection(); isSelectingBox = true; selectionBox = { startX: rawPos.x, startY: rawPos.y, endX: rawPos.x, endY: rawPos.y }; }
        updateCursor(); draw(); return;
    }

    clearSelection();

    if (mode === 'point') {
        if (!clickedObj) { points.push({ id: nextId++, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ }); saveState(); }
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

            wysiwygText.style.display = 'block';
            wysiwygText.style.fontFamily = 'sans-serif';
            const lh = activeStyle.lineHeight || Math.round(activeStyle.fontSize * 1.2);
            wysiwygText.style.lineHeight = (lh * zoom) + 'px';
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
    if (clickedObj && clickedObj.type === 'text') {
        const t = getObjectById('text', clickedObj.id);
        if (t.locked) return;
        editingTextId = t.id;

        // NOUVEAU : On utilise innerHTML pour récupérer le gras/couleur sauvegardé !
        wysiwygText.innerHTML = t.content;

        wysiwygText.style.display = 'block';
        wysiwygText.style.left = (t.x * zoom + panX) + 'px'; wysiwygText.style.top = (t.y * zoom + panY) + 'px';
        wysiwygText.style.fontFamily = 'sans-serif';
        const lh = t.lineHeight || Math.round(t.fontSize * 1.2);
        wysiwygText.style.lineHeight = (lh * zoom) + 'px';
        wysiwygText.style.fontSize = (t.fontSize * zoom) + 'px'; wysiwygText.style.color = t.color || t.strokeColor;
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
    if (isLoupeActive) requestAnimationFrame(draw);
    if (PluginManager.trigger('onPointerMove', rawPos, e)) return;

    if (draggedWidget) {
        const w = draggedWidget;
        const modeW = draggedWidgetMode;
        const rx = rawPos.x;
        const ry = rawPos.y;

        if (modeW === 'move') {
            w.x = rx - widgetOffset.x;
            w.y = ry - widgetOffset.y;
        } else if (modeW === 'slideX' || modeW === 'slideY') {
            const dx = rx - dragStartMouse.x;
            const dy = ry - dragStartMouse.y;
            let axisAngle = w.angle;
            if (modeW === 'slideY') axisAngle += Math.PI / 2;
            const dot = dx * Math.cos(axisAngle) + dy * Math.sin(axisAngle);
            w.x = dragStartWidget.x + dot * Math.cos(axisAngle);
            w.y = dragStartWidget.y + dot * Math.sin(axisAngle);
        } else if (modeW === 'rotate') {
            w.angle = Math.atan2(ry - w.y, rx - w.x) - widgetRotationOffset;
        } else if (modeW === 'resize' && w instanceof CompassWidget) {
            w.radius = Math.hypot(rx - w.x, ry - w.y);
            w.angle = Math.atan2(ry - w.y, rx - w.x);
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

            if (Math.abs(w.totalRotation) > 0.001) {
                const isCCW = (w.totalRotation < 0);
                const endAngle = w.startAngle + w.totalRotation;

                if (!currentTracingArc) {
                    currentTracingArc = {
                        id: nextId++,
                        type: 'arc',
                        cx: w.x, cy: w.y, radius: w.radius,
                        startAngle: w.startAngle, endAngle: endAngle,
                        counterClockwise: isCCW,
                        color: activeStyle.strokeColor,
                        width: activeStyle.lineWidth,
                        dash: activeStyle.lineDash,
                        z: globalZ++
                    };
                } else {
                    currentTracingArc.endAngle = endAngle;
                    currentTracingArc.counterClockwise = isCCW;
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
        if (newZoom < 0.2) newZoom = 0.2; if (newZoom > 5) newZoom = 5;
        const mouseLogX = (currentCenter.x - initialPanX) / initialZoom; const mouseLogY = (currentCenter.y - initialPanY) / initialZoom;
        zoom = newZoom; document.getElementById('zoom-slider').value = zoom;
        panX = currentCenter.x - mouseLogX * zoom; panY = currentCenter.y - mouseLogY * zoom;
        updateWysiwygPosition();
        requestAnimationFrame(draw); return;
    }

    if (e.buttons === 0 && !activePointers.has(e.pointerId)) { isPanningView = false; isDraggingObjs = false; isDrawingFreehand = false; isSelectingBox = false; draggedHandle = null; activeGuides = { x: [], y: [] }; }

    if (mode === 'laser' && currentLaserStroke) {
        currentLaserStroke.push({ x: rawPos.x, y: rawPos.y, time: Date.now() });
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
    let smartPos = { x: rawPos.x, y: rawPos.y };
    if (magnetMode && !isDraggingObjs && !draggedHandle) {
        // smartPos = snapToGrid(rawPos.x, rawPos.y);
    }

    const isDrawingOrHovering = ['freehand', 'highlighter', 'segment', 'circle', 'rectangle', 'polygon', 'curve'].includes(mode);
    const enableToolMagnetism = false;

    if (enableToolMagnetism && isDrawingOrHovering && !draggedWidget) {
        let toolSnap = null;
        const snapDist = 10 / zoom;
        const offset = activeStyle.lineWidth / 2;

        if (activeWidgets.setsquare && widgets.setsquare) {
            const w = widgets.setsquare; const l = w.toLocal(rawPos.x, rawPos.y);
            if (l.x > 0 && l.x < w.width && Math.abs(l.y) < snapDist) toolSnap = w.toGlobal(l.x, -offset);
            else if (l.y > 0 && l.y < w.height && Math.abs(l.x) < snapDist) toolSnap = w.toGlobal(-offset, l.y);
            else if (l.x >= 0 && l.y >= 0 && Math.abs(l.y - (-w.height / w.width * l.x + w.height)) < snapDist) {
                const len = Math.hypot(w.height, w.width);
                const localProj = MathUtils.getProjectedPoint(l.x, l.y, {
                    constructor: { name: 'Segment' }, p1: { x: 0, y: w.height }, p2: { x: w.width, y: 0 }
                });
                toolSnap = w.toGlobal(localProj.x + (w.height / len) * offset, localProj.y + (w.width / len) * offset);
            }
        }
        if (!toolSnap && activeWidgets.ruler && widgets.ruler) {
            const w = widgets.ruler; const l = w.toLocal(rawPos.x, rawPos.y);
            if (Math.abs(l.y) < snapDist && l.x > -50 && l.x < w.width + 50) toolSnap = w.toGlobal(l.x, -offset);
            else if (Math.abs(l.y - w.height) < snapDist && l.x > -50 && l.x < w.width + 50) toolSnap = w.toGlobal(l.x, w.height + offset);
        }
        if (!toolSnap && activeWidgets.protractor && widgets.protractor) {
            const w = widgets.protractor; const l = w.toLocal(rawPos.x, rawPos.y);
            if (Math.abs(l.y) < snapDist && l.x > -w.radius && l.x < w.radius) toolSnap = w.toGlobal(l.x, offset);
            else if (Math.abs(Math.hypot(l.x, l.y) - w.radius) < snapDist && l.y < 0) {
                const angle = Math.atan2(l.y, l.x);
                toolSnap = w.toGlobal((w.radius + offset) * Math.cos(angle), (w.radius + offset) * Math.sin(angle));
            }
        }
        if (toolSnap) smartPos = toolSnap;
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
            else if (type === 'image') {
                const angle = obj.angle || 0;
                const dxRaw = rawPos.x - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).x;
                const dyRaw = rawPos.y - getRawLogicalPos({ clientX: lastMouseX, clientY: lastMouseY }).y;

                const dx = Math.cos(-angle) * dxRaw - Math.sin(-angle) * dyRaw;
                const dy = Math.sin(-angle) * dxRaw + Math.cos(-angle) * dyRaw;

                const scaleX = obj.cw / obj.w;
                const scaleY = obj.ch / obj.h;
                const natW = imageCache[obj.src].naturalWidth;
                const natH = imageCache[obj.src].naturalHeight;

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

        let ptsToMove = new Set(); let txtsToMove = new Set(); let freehandsToMove = new Set(); let imgsToMove = new Set();
        let itemsToProcessMap = new Map();
        selectedItems.forEach(item => {
            itemsToProcessMap.set(item.type + '-' + item.id, item);
            const obj = getObjectById(item.type, item.id);
            if (obj && obj.groupId) {
                getGroupMembers(obj.groupId).forEach(member => {
                    itemsToProcessMap.set(member.type + '-' + member.id, {type: member.type, id: member.id});
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
            else if (item.type === 'text') txtsToMove.add(item.id); else if (item.type === 'freehand') freehandsToMove.add(item.id); else if (item.type === 'image') imgsToMove.add(item.id);
        });
        ptsToMove.forEach(pid => { const p = getObjectById('point', pid); if (p) { p.x += dx; p.y += dy; } }); txtsToMove.forEach(tid => { const t = getObjectById('text', tid); if (t) { t.x += dx; t.y += dy; } });
        freehandsToMove.forEach(fid => { const f = getObjectById('freehand', fid); if (f) { f.points.forEach(pt => { pt.x += dx; pt.y += dy; }); } }); imgsToMove.forEach(iid => { const i = getObjectById('image', iid); if (i) { i.x += dx; i.y += dy; } });

        lastMouseX = panX + currentLog.x * zoom;
        lastMouseY = panY + currentLog.y * zoom;
        updateWysiwygPosition();
    } else { lastMouseX = e.clientX; lastMouseY = e.clientY; }
    updateCursor(); requestAnimationFrame(draw);
});

canvas.addEventListener('pointerup', handlePointerUp); canvas.addEventListener('pointercancel', handlePointerUp); canvas.addEventListener('pointerout', handlePointerUp);

function handlePointerUp(e) {
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
        if (selectedItems.length > 0) { updateStyleBarContext(); } draw();
    }

    if (isDraggingObjs || draggedHandle) { saveState(); isDraggingObjs = false; draggedHandle = null; activeGuides = { x: [], y: [] }; }
    if (isDrawingFreehand) { isDrawingFreehand = false; if (currentFreehand.points.length > 1) { freehands.push(currentFreehand); saveState(); } currentFreehand = null; }
    updateCursor(); draw();
}

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (btnZoomToggle) btnZoomToggle.innerText = Math.round(zoom * 100) + '%';
    // 1. PINCH-TO-ZOOM (Trackpad Mac) ou Scroll + Ctrl (Souris classique)
    if (e.ctrlKey) {
        const mouseLogX = (e.clientX - panX) / zoom;
        const mouseLogY = (e.clientY - panY) / zoom;

        // Calcul du zoom (très fluide sur Trackpad)
        let zoomFactor = Math.exp(-e.deltaY / 100);
        let newZoom = zoom * zoomFactor;

        if (newZoom < 0.2) newZoom = 0.2;
        if (newZoom > 5) newZoom = 5;

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

document.getElementById('grid-weight-slider').addEventListener('input', (e) => { gridWeight = parseFloat(e.target.value); draw(); });
const btnMagnet = document.getElementById('btn-magnet'); btnMagnet.addEventListener('click', () => { magnetMode = !magnetMode; btnMagnet.classList.toggle('active', magnetMode); draw(); });
document.getElementById('btn-cycle').onclick = () => { currentBgIndex = (currentBgIndex + 1) % backgrounds.length; draw(); };
const btnAxes = document.getElementById('btn-axes'); btnAxes.onclick = () => { showAxes = (showAxes + 1) % 3; btnAxes.classList.remove('active', 'active-1', 'active-2'); if (showAxes > 0) btnAxes.classList.add('active', `active-${showAxes}`); draw(); };

function draw() {
    const bg = backgrounds[currentBgIndex]; const logicalStep = bg === 'seyes' ? 40 : (bg === 'millimetre' ? 100 : 30);

    if (isExportingTransparent) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = (bg === 'millimetre') ?
            (isDarkMode ? '#2d3436' : bgColors.millimetre) :
            (isDarkMode ? '#1e272e' : bgColors.default);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    try {
        ctx.translate(panX, panY); ctx.scale(zoom, zoom);
        const lw = 1 / zoom; const minX = -panX / zoom; const maxX = (canvas.width - panX) / zoom; const minY = -panY / zoom; const maxY = (canvas.height - panY) / zoom;

        if (!isExportingTransparent) {
            if (bg === 'carreau') drawCarreau(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'seyes') drawSeyes(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'millimetre') drawMillimetre(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'point') drawPoint(minX, maxX, minY, maxY, lw, gridWeight); else if (bg === 'isometrique') drawIsometrique(minX, maxX, minY, maxY, lw, gridWeight);

            if (showAxes > 0) {
                ctx.beginPath(); ctx.moveTo(0, minY); ctx.lineTo(0, maxY); ctx.moveTo(minX, 0); ctx.lineTo(maxX, 0); ctx.strokeStyle = showAxes === 2 ? (isDarkMode ? "#b2bec3" : "#000") : (isDarkMode ? "#636e72" : "#2d3436"); ctx.lineWidth = lw * 1.5 * gridWeight; ctx.stroke();
                if (showAxes === 2) {
                    ctx.fillStyle = isDarkMode ? "#b2bec3" : "#2d3436"; ctx.font = `${12 * lw}px sans-serif`; ctx.beginPath(); ctx.textAlign = "center"; ctx.textBaseline = "top";
                    for (let x = Math.floor(minX / logicalStep) * logicalStep; x <= maxX; x += logicalStep) if (x !== 0) { ctx.moveTo(x, -4 * lw); ctx.lineTo(x, 4 * lw); ctx.fillText(Math.round(x / logicalStep), x, 8 * lw); }
                    ctx.textAlign = "right"; ctx.textBaseline = "middle";
                    for (let y = Math.floor(minY / logicalStep) * logicalStep; y <= maxY; y += logicalStep) if (y !== 0) { ctx.moveTo(-4 * lw, y); ctx.lineTo(4 * lw, y); ctx.fillText(Math.round(-y / logicalStep), -8 * lw, y); }
                    ctx.stroke();
                }
            }
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
                if (imageCache[obj.src]) {
                    ctx.drawImage(imageCache[obj.src], obj.cx, obj.cy, obj.cw, obj.ch, -obj.w / 2, -obj.h / 2, obj.w, obj.h);
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

                const s = lw * 4; ctx.beginPath();
                if (obj.shape === 'circle') { ctx.arc(obj.x, obj.y, s, 0, Math.PI * 2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'square') { ctx.rect(obj.x - s, obj.y - s, s * 2, s * 2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'pixel') { ctx.rect(obj.x - 1.5 * lw, obj.y - 1.5 * lw, 3 * lw, 3 * lw); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'cross') { ctx.lineWidth = lw * 2.5; ctx.moveTo(obj.x - s, obj.y - s); ctx.lineTo(obj.x + s, obj.y + s); ctx.moveTo(obj.x + s, obj.y - s); ctx.lineTo(obj.x - s, obj.y + s); ctx.strokeStyle = renderColor; ctx.stroke(); }
            }
            else if (item.type === 'text') {
                let w = 0, h = 0, startX = obj._cachedStartX || obj.x;

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = obj.content || " ";
                const lines = []; let currentLine = [];

                function parseNode(node, currentStyle) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const textParts = node.textContent.replace(/\u200B/g, '').split('\n');
                        textParts.forEach((txt, idx) => {
                            if (txt.length > 0) currentLine.push({ text: txt, style: { ...currentStyle } });
                            if (idx < textParts.length - 1) { lines.push(currentLine); currentLine = []; }
                        });
                    } else if (node.nodeName === 'BR') { lines.push(currentLine); currentLine = []; }
                    else if (node.nodeName === 'DIV' || node.nodeName === 'P') {
                        if (currentLine.length > 0) { lines.push(currentLine); currentLine = []; }
                        const newStyle = { ...currentStyle };
                        Array.from(node.childNodes).forEach(c => parseNode(c, newStyle));
                        if (currentLine.length > 0) { lines.push(currentLine); currentLine = []; }
                    } else {
                        const newStyle = { ...currentStyle };
                        if (node.nodeName === 'B' || node.nodeName === 'STRONG' || (node.style && node.style.fontWeight === 'bold')) newStyle.bold = true;
                        if (node.nodeName === 'I' || node.nodeName === 'EM' || (node.style && node.style.fontStyle === 'italic')) newStyle.italic = true;
                        if (node.nodeName === 'U' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'))) newStyle.underline = true;
                        if (node.style && node.style.color) newStyle.color = node.style.color;
                        Array.from(node.childNodes).forEach(c => parseNode(c, newStyle));
                    }
                }
                if (!obj.mathImg) {
                    Array.from(tempDiv.childNodes).forEach(c => parseNode(c, {}));
                    if (currentLine.length > 0 || lines.length === 0) lines.push(currentLine);
                }

                const fontSize = obj.fontSize || 24;
                const fontFamily = obj.fontFamily || 'sans-serif';
                const lineHeight = obj.lineHeight || Math.round(fontSize * 1.2);
                let maxW = 0;

                if (obj.mathImg) {
                    w = obj.mathW; h = obj.mathH; startX = obj.x;
                } else {
                    const lineMetrics = lines.map(line => {
                        let lineW = 0;
                        line.forEach(seg => {
                            ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                            lineW += ctx.measureText(seg.text).width;
                        });
                        if (lineW > maxW) maxW = lineW;
                        return lineW;
                    });
                    w = maxW; h = lines.length * lineHeight; startX = obj.align === 'center' ? obj.x - maxW / 2 : obj.x;
                    if (obj.isBubble && w < 20) { w = 150; h = 30; }
                }

                obj._cachedW = w; obj._cachedH = h; obj._cachedStartX = startX;
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

                    } else {

                        ctx.ellipse(bcx, bcy, bw / 2, bh / 2, 0, 0, Math.PI * 2);
                    }

                    ctx.fill();
                    ctx.stroke();

                    // ==========================================
                    // 4. FAUSSE FUSION
                    // ==========================================

                    if (obj.bubbleShape !== "cloud") {

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
                if (obj.id !== editingTextId) {
                    if (obj.mathImg) {
                        ctx.shadowBlur = (!isExportingTransparent && sc && !obj.isBubble) ? 10 * lw : 0;
                        ctx.shadowColor = (!isExportingTransparent && sc && !obj.isBubble) ? sc : "transparent";
                        ctx.drawImage(obj.mathImg, startX, obj.y, w, h);
                    } else {
                        const align = obj.align || 'left';
                        let startY = obj.y + (fontSize * 0.1);
                        ctx.textBaseline = 'top';
                        ctx.textAlign = 'left'; // 🌟 C'EST CECI QUI RÉPARE LE DÉCALAGE !

                        lines.forEach((line, i) => {
                            let lineW = 0;
                            line.forEach(seg => {
                                ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                                lineW += ctx.measureText(seg.text).width;
                            });
                            let curX = startX;
                            if (align === 'center') curX = startX + (w / 2) - (lineW / 2);
                            else if (align === 'right') curX = startX + w - lineW;

                            line.forEach(seg => {
                                ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                                ctx.fillStyle = seg.style.color || renderColor;
                                ctx.fillText(seg.text, curX, startY + i * lineHeight);
                                if (seg.style.underline) {
                                    const sw = ctx.measureText(seg.text).width;
                                    ctx.beginPath(); ctx.moveTo(curX, startY + i * lineHeight + fontSize * 1.1); ctx.lineTo(curX + sw, startY + i * lineHeight + fontSize * 1.1);
                                    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, fontSize * 0.08); ctx.stroke();
                                }
                                curX += ctx.measureText(seg.text).width;
                            });
                        });
                    }
                }

                // ==========================================
                // 3. SÉLECTION GLOBALE
                // ==========================================
                ctx.shadowBlur = 0;
                if (isSel && !isExportingTransparent) {
                    ctx.strokeStyle = "#6c5ce7"; ctx.lineWidth = lw * 2;
                    if (!obj.isBubble) ctx.strokeRect(startX, obj.y, w, h);
                    if (!obj.locked) {
                        const rotY = obj.y - (30 * lw) - (obj.isBubble ? (obj.bubblePad || 20) * lw : 0);
                        ctx.beginPath(); ctx.moveTo(cx, obj.y - (obj.isBubble ? (obj.bubblePad || 20) * lw : 0)); ctx.lineTo(cx, rotY); ctx.stroke();
                        ctx.beginPath(); ctx.arc(cx, rotY, 6 * lw, 0, Math.PI * 2);
                        ctx.fillStyle = "#a29bfe"; ctx.fill(); ctx.stroke();
                    }
                }
                ctx.restore();
            }
            ctx.shadowBlur = 0;
        });

        // --- POINT FANTÔME DE L'AIMANT (SNAP À LA GRILLE) ---
        if (magnetMode && mouseLogicalPos && !draggedHandle && ['point', 'segment', 'circle', 'rectangle', 'text', 'curve', 'polygon', 'pointer'].includes(mode)) {
            if (!hoveredObj || hoveredObj.type !== 'point') {

                // 1. On calcule la position visuelle "aimantée"
                let ghostX = mouseLogicalPos.x;
                let ghostY = mouseLogicalPos.y;

                // On récupère le type de fond actuel
                const bg = backgrounds[currentBgIndex];

                // Si on a une grille (pas de fond uni), on "force" le point sur les intersections
                if (bg !== 'blanc' && bg !== 'noir') {
                    const step = (bg === 'seyes') ? 40 : (bg === 'millimetre' ? 100 : 30); // 30 est la valeur par défaut (carreaux)
                    ghostX = Math.round(mouseLogicalPos.x / step) * step;
                    ghostY = Math.round(mouseLogicalPos.y / step) * step;
                }

                // 2. On dessine le point pile sur l'intersection calculée
                ctx.beginPath();
                ctx.arc(ghostX, ghostY, lw * 2, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(108, 92, 231, 0.6)";
                ctx.fill();
                ctx.strokeStyle = "#6c5ce7";
                ctx.lineWidth = lw * 1.5;
                ctx.stroke();
            }
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

        if (mode === 'circle' && creationStartPointId && mouseLogicalPos) {
            const startP = getObjectById('point', creationStartPointId); ctx.beginPath(); ctx.arc(startP.x, startP.y, Math.hypot(mouseLogicalPos.x - startP.x, mouseLogicalPos.y - startP.y), 0, Math.PI * 2);
            if (activeStyle.isFilled) { ctx.fillStyle = hexToRgba(activeStyle.fillColor, 0.2); ctx.fill(); }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
        }
        if (mode === 'rectangle' && creationStartPointId && mouseLogicalPos) {
            const startP = getObjectById('point', creationStartPointId);
            ctx.beginPath();
            ctx.rect(Math.min(startP.x, mouseLogicalPos.x), Math.min(startP.y, mouseLogicalPos.y), Math.abs(mouseLogicalPos.x - startP.x), Math.abs(mouseLogicalPos.y - startP.y));
            if (activeStyle.isFilled) { ctx.fillStyle = hexToRgba(activeStyle.fillColor, 0.2); ctx.fill(); }
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
        }
        if ((mode === 'segment' || mode === 'droite' || mode === 'demi-droite') && creationStartPointId && mouseLogicalPos) {
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

        if (!isExportingTransparent && laserStrokes.length > 0) {
            let needsRedraw = false;
            const now = Date.now();
            laserStrokes.forEach(stroke => {
                const validPoints = stroke.filter(p => now - p.time < 1200);
                if (validPoints.length > 0) needsRedraw = true;

                if (validPoints.length > 1) {
                    for (let i = 0; i < validPoints.length - 1; i++) {
                        const p1 = validPoints[i];
                        const p2 = validPoints[i + 1];
                        const age = now - p1.time;
                        const opacity = Math.max(0, 1 - (age / 1200));

                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(231, 76, 60, ${opacity})`;
                        ctx.lineWidth = 6 * lw;
                        ctx.lineCap = 'butt';
                        ctx.lineJoin = 'round';
                        ctx.stroke();
                    }
                    ctx.beginPath(); ctx.arc(validPoints[0].x, validPoints[0].y, 3 * lw, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(231, 76, 60, ${Math.max(0, 1 - ((now - validPoints[0].time) / 1200))})`; ctx.fill();

                    const lastP = validPoints[validPoints.length - 1];
                    ctx.beginPath(); ctx.arc(lastP.x, lastP.y, 3 * lw, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(231, 76, 60, ${Math.max(0, 1 - ((now - lastP.time) / 1200))})`; ctx.fill();
                }
            });
            laserStrokes = laserStrokes.filter(stroke => stroke.length > 0 && now - stroke[stroke.length - 1].time < 1200);
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ==========================================
// MOTEUR D'IMPORTATION PDF (AVEC SÉLECTEUR DE QUALITÉ)
// ==========================================
let currentPdfQuality = 2.5; // Qualité standard par défaut

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function loadPdf(file) {
    showToast(`Création des pages (Qualité: ${currentPdfQuality}x)... Veuillez patienter ⏳`);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const typedarray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const numPages = pdf.numPages;

            syncPage();

            let startPageIdx = currentPageIndex;
            const p = pages[currentPageIndex];
            const isEmpty = (p.points.length === 0 && p.images.length === 0 && p.freehands.length === 0 && p.texts.length === 0 && p.segments.length === 0 && p.circles.length === 0 && p.rectangles.length === 0 && p.polygons.length === 0 && p.curves.length === 0 && p.arcs.length === 0);

            if (!isEmpty) startPageIdx = pages.length;

            let firstPageW = 0, firstPageH = 0;

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

                const targetIdx = startPageIdx + (i - 1);
                if (targetIdx >= pages.length) pages.push(createNewPage());

                await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const w = img.width; const h = img.height;

                        if (i === 1) { firstPageW = w; firstPageH = h; }

                        const newImgObj = { id: nextId++, x: -w / 2, y: -h / 2, w: w, h: h, cx: 0, cy: 0, cw: w, ch: h, src: dataUrl, z: -999, isBg: true };
                        pages[targetIdx].images.push(newImgObj);
                        imageCache[dataUrl] = img;
                        resolve();
                    };
                    img.src = dataUrl;
                });
            }

            loadPage(startPageIdx);

            if (firstPageW > 0 && firstPageH > 0) {
                const padding = 50;
                const scaleX = canvas.width / (firstPageW + padding * 2);
                const scaleY = canvas.height / (firstPageH + padding * 2);

                zoom = Math.min(scaleX, scaleY);
                if (zoom < 0.1) zoom = 0.1;
                if (zoom > 5) zoom = 5;

                panX = canvas.width / 2;
                panY = canvas.height / 2;

                const zoomSlider = document.getElementById('zoom-slider');
                const btnZoomToggle = document.getElementById('btn-zoom-toggle');
                if (zoomSlider) zoomSlider.value = zoom;
                if (btnZoomToggle) btnZoomToggle.innerText = Math.round(zoom * 100) + '%';

                draw();
            }

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

    if (importBtn && pdfLoader) {
        importBtn.addEventListener('click', () => pdfLoader.click());
        pdfLoader.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            loadPdf(file);
            e.target.value = '';
        });

        // 🌟 INJECTION DU SÉLECTEUR DE QUALITÉ 🌟
        // Vérifie si le sélecteur existe pour ne pas le créer deux fois
        if (!document.getElementById('pdf-quality-select')) {
            const selectContainer = document.createElement('div');
            selectContainer.style.cssText = "display:inline-flex; align-items:center; margin-left:10px; font-family:sans-serif; font-size:13px; color:#636e72;";

            selectContainer.innerHTML = `
                <label style="margin-right:5px; font-weight:bold;">Qualité :</label>
                <select id="pdf-quality-select" style="padding:4px; border-radius:4px; border:1px solid #ccc; outline:none; cursor:pointer; background:#f8f9fa;">
                    <option value="1.5">Basse (Rapide)</option>
                    <option value="2.5" selected>Standard</option>
                    <option value="4.0">Haute (HD)</option>
                    <option value="5.0">Ultra HD (Lent)</option>
                </select>
            `;

            // On glisse ce petit menu juste à côté du bouton "Importer PDF" dans ton HTML
            importBtn.parentNode.insertBefore(selectContainer, importBtn.nextSibling);

            document.getElementById('pdf-quality-select').addEventListener('change', (e) => {
                currentPdfQuality = parseFloat(e.target.value);
                showToast("Qualité d'importation fixée sur : " + e.target.options[e.target.selectedIndex].text);
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
                if (alignMode) {
                    activeStyle.textAlign = alignMode;
                    if (editingTextId) {
                        const t = getObjectById('text', editingTextId);
                        if (t) t.align = alignMode;
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
                document.execCommand('foreColor', false, c);
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
            document.execCommand('foreColor', false, c);
            activeStyle.strokeColor = c;
            updateActiveSwatch(''); // Efface la bordure des pastilles fixes
            wheelBtn.style.borderColor = '#b2bec3'; // Met la bordure sur la roulette
        });

        colorContainer.appendChild(wheelBtn);
        textToolbar.appendChild(colorContainer);
    }
}

// ===================================================
// GESTION DE LA POLICE ET DE LA TAILLE (VIA BOUTONS)
// ===================================================
const fonts = ['sans-serif', 'serif', 'monospace', "'Comic Sans MS', cursive"];
let currentFontIndex = 0;

const btnFontCycle = document.getElementById('btn-font-cycle');
if (btnFontCycle) {
    btnFontCycle.addEventListener('click', () => {
        currentFontIndex = (currentFontIndex + 1) % fonts.length;
        const newFont = fonts[currentFontIndex];

        activeStyle.fontFamily = newFont;
        btnFontCycle.style.fontFamily = newFont;

        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) t.fontFamily = newFont;
        }
        updateWysiwygPosition();
        draw();
    });
}

function changeFontSize(delta) {
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
function updateTextToolbarPosition() {
    if (!textToolbar || !wysiwygText) return;

    if (wysiwygText.style.display === 'block') {
        textToolbar.style.display = 'flex';

        // --- SYNCHRONISATION DES BOUTONS DE TAILLE ET POLICE ---
        const sizeDisplay = document.getElementById('text-size-display');
        let currentSize = activeStyle.fontSize;
        let currentFont = activeStyle.fontFamily || 'sans-serif';
        if (editingTextId) {
            const t = getObjectById('text', editingTextId);
            if (t) {
                currentSize = t.fontSize || activeStyle.fontSize;
                currentFont = t.fontFamily || 'sans-serif';
            }
        }
        if (sizeDisplay) sizeDisplay.innerText = currentSize;
        if (btnFontCycle) btnFontCycle.style.fontFamily = currentFont;
        // -------------------------------------------------------

        const rect = wysiwygText.getBoundingClientRect();
        const tbHeight = textToolbar.offsetHeight || 40;
        const tbWidth = textToolbar.offsetWidth || 350; // On récupère la largeur réelle de la barre

        // Calcul du positionnement vertical
        let topPos = rect.top - tbHeight - 15;
        if (topPos < 10) topPos = rect.bottom + 15;

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

const btnMainMenu = document.getElementById('btn-main-menu');
const popupMainMenu = document.getElementById('main-popup-menu');

const btnZoomToggle = document.getElementById('btn-zoom-toggle');
const popupZoom = document.getElementById('popup-zoom');

const btnGridToggle = document.getElementById('btn-grid-toggle');
const popupGrid = document.getElementById('popup-grid');

// Fonction pour tout fermer
function closeAllPopups() {
    if (popupMainMenu) popupMainMenu.classList.remove('show');
    if (popupZoom) popupZoom.classList.remove('show');
    if (popupGrid) popupGrid.classList.remove('show');
}

// Ajouter le Toggle sur les 3 boutons
[
    { btn: btnMainMenu, popup: popupMainMenu },
    { btn: btnZoomToggle, popup: popupZoom },
    { btn: btnGridToggle, popup: popupGrid }
].forEach(pair => {
    if (pair.btn && pair.popup) {
        pair.btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Empêche le clic de se propager
            const isShowing = pair.popup.classList.contains('show');
            closeAllPopups(); // Ferme les autres
            if (!isShowing) pair.popup.classList.add('show'); // Ouvre celui-ci
        });
    }
});

// Fermer les pop-ups si on clique n'importe où ailleurs sur la page
window.addEventListener('click', closeAllPopups);

// Empêcher la fermeture si on clique À L'INTÉRIEUR du pop-up (ex: manipuler le slider)
document.querySelectorAll('.popup-content').forEach(popup => {
    popup.addEventListener('click', (e) => e.stopPropagation());
});

// --- Mise à jour du texte du bouton Zoom en direct ---
const zoomSlider = document.getElementById('zoom-slider');
if (zoomSlider && btnZoomToggle) {
    zoomSlider.addEventListener('input', () => {
        // Met à jour le texte du bouton (ex: "120%")
        btnZoomToggle.innerText = Math.round(zoomSlider.value * 100) + '%';
    });
}

// Mettre à jour le bouton zoom aussi quand on pinch-to-zoom sur le trackpad
// Cherche ton canvas.addEventListener('wheel', ...) existant, et ajoute cette ligne dedans :
// if (btnZoomToggle) btnZoomToggle.innerText = Math.round(zoom * 100) + '%';
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
        else {
            inp = document.createElement('input');
            inp.type = field.type || 'text'; inp.value = field.value || '';
            inp.placeholder = field.placeholder || '';
            inp.className = 'prompt-input';
            inp.style.width = '100%';
        }

        inp.addEventListener(field.type === 'select' ? 'change' : 'input', () => {
            if (onChange && typeof onChange === 'function') {
                const results = inputElements.map(i => i.value);
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
        const initialSvg = onChange(inputElements.map(i => i.value), previewBox);
        // Si onChange retourne une chaîne, on l'injecte. Si elle gère l'injection elle-même (comme pour la pyramide), initialSvg sera vide, ce qui est parfait.
        if (initialSvg && previewBox && typeof initialSvg === 'string') previewBox.innerHTML = initialSvg;
    }

    const btnOk = document.getElementById('custom-prompt-ok'); const btnCancel = document.getElementById('custom-prompt-cancel');
    const newBtnOk = btnOk.cloneNode(true); const newBtnCancel = btnCancel.cloneNode(true);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk); btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

    newBtnOk.addEventListener('click', () => { promptModal.style.display = 'none'; if (onValidate) onValidate(inputElements.map(i => i.value)); });
    newBtnCancel.addEventListener('click', () => { promptModal.style.display = 'none'; });
}
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
    draw();
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) toggleFocusMode();
});

function updateQuickMenu() {
    const quickMenu = document.getElementById('quick-edit-menu');
    if (!quickMenu) return;

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
                if (selectedItems.length === 1) {
                    const obj = getObjectById(selectedItems[0].type, selectedItems[0].id);
                    if (obj) {
                        if (obj.strokeColor !== undefined) obj.strokeColor = c;
                        if (obj.color !== undefined) obj.color = c;
                        if (obj.fillColor && obj.isFilled) obj.fillColor = c;
                        activeStyle.strokeColor = c;
                        if (typeof updateColorIndicator === 'function') updateColorIndicator();
                        saveState(); draw(); updateQuickMenu();
                    }
                }
            };
            colorContainer.appendChild(dot);
        });
        quickMenu.insertBefore(colorContainer, quickMenu.firstChild);
    }

    // 2. Affichage et positionnement du menu
    if (typeof selectedItems !== 'undefined' && selectedItems.length === 1) {
        const type = selectedItems[0].type;
        const obj = getObjectById(type, selectedItems[0].id);

        if (obj && ['image', 'text', 'point', 'polygon', 'rectangle', 'circle'].includes(type)) {
            let bx = 0, by = 0, bw = 0, bh = 0;
            if (type === 'image') { bx = obj.x; by = obj.y; bw = obj.w; bh = obj.h; }
            else if (type === 'text') { bx = obj._cachedStartX || obj.x; by = obj.y; bw = obj._cachedW || 100; bh = obj._cachedH || 50; }
            else if (type === 'point') { bx = obj.x; by = obj.y; }
            else if (type === 'circle') {
                const c = getObjectById('point', obj.center_id), e = getObjectById('point', obj.edge_id);
                if (c && e) { const r = Math.hypot(e.x - c.x, e.y - c.y); bx = c.x - r; by = c.y - r; bw = 2 * r; bh = 2 * r; }
            }
            else if (type === 'rectangle') {
                const p1 = getObjectById('point', obj.p1_id), p2 = getObjectById('point', obj.p2_id);
                if (p1 && p2) { bx = Math.min(p1.x, p2.x); by = Math.min(p1.y, p2.y); bw = Math.abs(p2.x - p1.x); bh = Math.abs(p2.y - p1.y); }
            }
            else if (type === 'polygon' && obj.pointIds) {
                let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
                obj.pointIds.forEach(id => { const p = getObjectById('point', id); if (p) { mx = Math.min(mx, p.x); my = Math.min(my, p.y); Mx = Math.max(Mx, p.x); My = Math.max(My, p.y); } });
                if (mx !== Infinity) { bx = mx; by = my; bw = Mx - mx; bh = My - my; }
            }

            const screenX = (bx + bw / 2) * zoom + panX;
            const screenY = (by + bh) * zoom + panY + 20;

            quickMenu.style.left = screenX + 'px';
            quickMenu.style.top = screenY + 'px';
            quickMenu.classList.add('visible');

            // 3. GESTION DU CADENAS (Affichage + Action)
            const btnLock = document.getElementById('btn-quick-lock');
            const iconLock = document.getElementById('icon-quick-lock');
            if (btnLock && iconLock) {
                if (obj.locked) {
                    btnLock.classList.add('active');
                    iconLock.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;
                } else {
                    btnLock.classList.remove('active');
                    iconLock.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
                }

                // ACTION FORCÉE AU TOUCHER/CLIC
                btnLock.onpointerdown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    obj.locked = !obj.locked;
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
                        obj.ratioLocked = !isRatioActive; // Inverse l'état actuel
                        if (obj.ratioLocked) obj.isCropping = false; // Désactive le crop si on active le ratio
                        updateQuickMenu(); draw(); saveState();
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

            const btnDelete = document.getElementById('btn-quick-delete');
            if (btnDelete) {
                btnDelete.onpointerdown = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    let itemsToDelete = new Map();
                    selectedItems.forEach(item => {
                        const obj = getObjectById(item.type, item.id);
                        if (!obj) return;
                        itemsToDelete.set(item.type + '-' + item.id, item);
                        if (obj.groupId) {
                            getGroupMembers(obj.groupId).forEach(member => {
                                itemsToDelete.set(member.type + '-' + member.id, {type: member.type, id: member.id});
                            });
                        }
                    });
                    Array.from(itemsToDelete.values()).forEach(item => deleteObject(item.type, item.id));
                    clearSelection(); draw(); saveState(); hideQuickMenu();
                };
            }

            // 6. GESTION DE LA VISIBILITÉ DES COULEURS
            const colorContainer = document.getElementById('quick-colors-container');
            if (colorContainer) {
                if (type === 'image') {
                    colorContainer.style.display = 'none'; // Cache les couleurs pour les images/tampons
                } else {
                    colorContainer.style.display = 'flex';
                    let curColor = obj.color || obj.strokeColor || '#2d3436';

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
            document.getElementById('main-popup-menu').classList.remove('active'); // Ferme le menu
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

function saveStoredFloatingToolbars(toolbars) {
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
    settingsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

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

    if (!localStorage.getItem('board_toolbars_migrated_v2') || !hasMain) {
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
        localStorage.setItem('board_toolbars_migrated_v2', 'true');
    }

    container.innerHTML = '';
    getStoredFloatingToolbars().forEach(toolbar => renderFloatingToolbar(toolbar));
}

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
    if (isCtrl && e.key.toLowerCase() === 'c') {
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
        }
    }

    // ✂️ CTRL + X : Couper
    if (isCtrl && e.key.toLowerCase() === 'x') {
        if (selectedItems.length > 0) {
            // On fait exactement comme Copier...
            window.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'c', 'ctrlKey': true }));

            // ... Puis on supprime !
            selectedItems.forEach(item => deleteObject(item.type, item.id));
            clearSelection();
            if (typeof saveState === 'function') saveState();
            if (typeof draw === 'function') draw();
            if (typeof showToast === 'function') showToast("✂️ Éléments coupés");
        }
    }

    // 📥 CTRL + V : Coller
    if (isCtrl && e.key.toLowerCase() === 'v') {
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
                if (newObj.cx !== undefined) { newObj.cx += offset; newObj.cy += offset; }
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
        }
    }
});

// 🚀 Lancement blindé (Essaie au chargement, et force après 1.5s au cas où)
window.addEventListener('load', initFavoritesDock);
setTimeout(initFavoritesDock, 1500);

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
            img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
            box.appendChild(img);

            const num = document.createElement('div');
            num.innerText = index + 1;
            num.style.cssText = `
                position: absolute; bottom: 4px; right: 4px; background: ${isActive ? '#0984e3' : 'rgba(0,0,0,0.6)'}; 
                color: white; font-size: 11px; font-weight: bold; padding: 2px 7px; border-radius: 10px;
            `;
            box.appendChild(num);

            const delBtn = document.createElement('div');
            delBtn.innerHTML = '×';
            delBtn.title = "Supprimer cette page";
            delBtn.style.cssText = `
                position: absolute; top: 4px; right: 4px; background: #d63031;
                color: white; font-size: 15px; width: 20px; height: 20px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;
            `;
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
                if (!isActive) {
                    pages[currentPageIndex].thumbnail = capturePageThumb();
                    loadPage(index);
                    renderThumbnails();
                    setTimeout(window.syncActiveThumbnail, 100);
                }
            };

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

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
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

                    images.push({
                        id: nextId++,
                        x: lx - w / 2, y: ly - h / 2,
                        w: w, h: h,
                        cx: 0, cy: 0, cw: img.width, ch: img.height,
                        src: src,
                        z: globalZ++
                    });

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

    // 4. On affiche la notification une seule fois à la fin
    if (imagePasted && typeof showToast === 'function') {
        showToast("🖼️ Image(s) collée(s) !");
    }
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
            wysiwygText.style.lineHeight = (newLH * zoom) + 'px';
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
        if (bg === 'seyes') spacing = 40;
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
                wysiwygText.style.lineHeight = (spacing * zoom) + 'px';
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

window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); });
canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw();

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

function loadExplorerData() {
    // Interfaces in localStorage
    try {
        const intData = localStorage.getItem('auTableau_interfaces_list');
        if (intData) savedInterfaces = JSON.parse(intData);
    } catch (e) { }

    // Tableaux in localforage
    localforage.getItem('auTableau_tableaux_list').then(data => {
        if (data) savedTableaux = data;
        renderExplorerLists();
    });
}
let hasUnsavedChanges = false;
let currentBoardName = "";

function updateUnsavedIndicator() {
    const ind = document.getElementById('unsaved-indicator');
    if (ind) {
        if (hasUnsavedChanges) ind.classList.add('visible');
        else ind.classList.remove('visible');
    }
}

function initProjectName() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const defaultName = now.toLocaleDateString('fr-FR', options);
    currentBoardName = defaultName.charAt(0).toUpperCase() + defaultName.slice(1);
    const input = document.getElementById('project-name-input');
    if (input) input.value = currentBoardName;
}

document.addEventListener('DOMContentLoaded', () => {
    loadExplorerData();
    initProjectName();
    
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
    } else {
        container.innerHTML = `<div style="padding:10px; color:#636e72; font-size:12px; text-align:center;">Aucun document trouvé.</div>`;
    }
}

let isCompletingInline = false;
let draggedItemId = null;

function buildTree(items, parentId) {
    const ul = document.createElement('div');
    ul.className = parentId ? 'folder-children' : 'tree-root';

    let hasInlineInput = false;
    if (inlineCreationState && inlineCreationState.parentId === parentId && inlineCreationState.tab === currentExplorerTab) {
        hasInlineInput = true;
        const li = document.createElement('div');
        li.className = 'tree-item inline-create';
        li.innerHTML = `
            <span class="icon">${inlineCreationState.type === 'folder' ? '📁' : (currentExplorerTab === 'tableaux' ? '📄' : '🖼️')}</span>
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
                <span class="icon">📁</span> <span class="label" style="font-weight:600;">${item.name}</span>
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
            const icon = currentExplorerTab === 'tableaux' ? '📄' : '🖼️';
            treeItem.innerHTML = `<span class="icon" style="margin-left: 20px;">${icon}</span> <span class="label">${item.name}</span>`;

            treeItem.onclick = () => {
                selectedFolderId = null;
                if (currentExplorerTab === 'tableaux') {
                    selectedBoardId = item.id;
                    loadBoard(item.id);
                } else {
                    selectedInterfaceId = item.id;
                    loadInterface(item.id);
                }
                renderExplorerLists();
            };

            let hoverTimer;
            treeItem.onmouseenter = (e) => { hoverTimer = setTimeout(() => showTooltip(e, item), 400); };
            treeItem.onmouseleave = () => { clearTimeout(hoverTimer); hideTooltip(); };
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
        const nameSpan = document.createElement('span');
        nameSpan.className = 'label';
        nameSpan.innerText = (item.type === 'folder' ? '📁 ' : '📄 ') + item.name;
        const restoreBtn = document.createElement('button');
        restoreBtn.innerText = 'Restaurer';
        restoreBtn.style.fontSize = '10px';
        restoreBtn.style.padding = '2px 6px';
        restoreBtn.style.cursor = 'pointer';
        restoreBtn.style.borderRadius = '4px';
        restoreBtn.style.border = '1px solid var(--border)';
        restoreBtn.onclick = () => restoreFromTrash(item.id);
        div.appendChild(nameSpan);
        div.appendChild(restoreBtn);
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

document.getElementById('btn-save').addEventListener('click', handleSaveClick);

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
    const appState = { pages, nextId, globalZ, currentBgIndex };

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
    const intf = savedInterfaces.find(i => i.id === id);
    if (intf && intf.data) {
        if (intf.data.favorites) localStorage.setItem('board_favorites', JSON.stringify(intf.data.favorites));
        if (intf.data.toolbars) localStorage.setItem('board_floating_toolbars', JSON.stringify(intf.data.toolbars));
        if (intf.data.barStyleX) localStorage.setItem('bar_style_x', intf.data.barStyleX);
        if (intf.data.barStyleY) localStorage.setItem('bar_style_y', intf.data.barStyleY);
        showToast("Interface chargée ! L'application va redémarrer.");
        setTimeout(() => window.location.reload(), 1500);
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
        const savesForDay = savedTableaux.filter(t => t.date === dStr).concat(savedInterfaces.filter(i => i.date === dStr));
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

        const typeIcon = s.id.startsWith('tb_') ? '📄' : '🖼️';
        const typeStr = s.id.startsWith('tb_') ? 'Tableau' : 'Interface';

        d.innerHTML = `
            <div>
                <div style="font-weight:600; font-size:14px;">${typeIcon} ${s.name}</div>
                <div style="font-size:11px; color:var(--muted);">${typeStr} - ${s.time}</div>
            </div>
            <button class="btn-action secondary" style="padding:4px 12px; font-size:12px;">Ouvrir</button>
        `;

        d.querySelector('button').onclick = () => {
            closeCalendarModal();
            if (s.id.startsWith('tb_')) {
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

async function exportWorkspace() {
    try {
        if (typeof showToast === 'function') showToast("⏳ Préparation de l'exportation...");

        const tableaux = await localforage.getItem('auTableau_tableaux_list') || [];
        const autoSave = await localforage.getItem('AuTableau_AutoSave') || null;

        const interfaces = JSON.parse(localStorage.getItem('auTableau_interfaces_list') || '[]');
        const toolbars = JSON.parse(localStorage.getItem('board_floating_toolbars') || '[]');
        const favorites = JSON.parse(localStorage.getItem('board_favorites') || '[]');

        const workspaceData = {
            version: "1.0",
            timestamp: Date.now(),
            tableaux: tableaux,
            autoSave: autoSave,
            interfaces: interfaces,
            toolbars: toolbars,
            favorites: favorites
        };

        const dataStr = JSON.stringify(workspaceData);
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

        if (typeof showToast === 'function') showToast("✅ Espace exporté !");
    } catch (err) {
        console.error("Erreur export :", err);
        if (typeof showToast === 'function') showToast("❌ Erreur d'exportation.");
    }
}

function importWorkspace(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.version || (!data.tableaux && !data.interfaces)) throw new Error("Format invalide.");

            openConfirmModal(
                "Restaurer l'espace",
                "L'importation va remplacer tous les tableaux et interfaces actuels. Continuer ?",
                true,
                async () => {
                    if (typeof showToast === 'function') showToast("⏳ Restauration...");

                    if (data.tableaux) await localforage.setItem('auTableau_tableaux_list', data.tableaux);
                    if (data.autoSave) await localforage.setItem('AuTableau_AutoSave', data.autoSave);

                    if (data.interfaces) localStorage.setItem('auTableau_interfaces_list', JSON.stringify(data.interfaces));
                    if (data.toolbars) localStorage.setItem('board_floating_toolbars', JSON.stringify(data.toolbars));
                    if (data.favorites) localStorage.setItem('board_favorites', JSON.stringify(data.favorites));

                    if (typeof showToast === 'function') showToast("✅ Restauration réussie ! Rechargement...");
                    setTimeout(() => window.location.reload(), 1500);
                }
            );
        } catch (err) {
            console.error("Erreur import :", err);
            if (typeof showToast === 'function') showToast("❌ Fichier invalide.");
        }
    };
    reader.readAsText(file);
}