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
    arrowStart: 0, arrowEnd: 0
};
let nextId = 1; let globalZ = 1; 
let points = []; let segments = []; let circles = []; let rectangles = []; let texts = [];    
let freehands = []; let curves = []; let polygons = []; let images = []; let arcs = [];  
const imageCache = {}; 

let history = []; let historyIndex = -1;

let mode = 'pointer'; let selectedItems = []; let hoveredObj = null; 

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
    register: function(name, pluginObj) {
        this.plugins[name] = pluginObj;
        if (typeof pluginObj.init === 'function') pluginObj.init();
        console.log(`🔌 Plugin chargé : ${name}`);
    },
    // Déclencher un événement pour tous les plugins
    trigger: function(eventName, ...args) {
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
        
        // --- NOUVEAU : On cache les boutons interactifs en mode tampon ---
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
        
        // --- NOUVEAU : On cache les boutons interactifs en mode tampon ---
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

document.getElementById('confirm-yes-btn').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('mousedown', function(e) {
            if(e.target === this) {
                if(this.id === 'donationModal') closeDonationModal();
                else if(this.id === 'confirm-modal') closeConfirmModal();
                else if(this.id === 'help-modal') this.style.display='none';
            }
        });
    });
    document.getElementById('btn-help').addEventListener('click', () => {
        document.getElementById('help-modal').style.display='flex';
    });
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => { showToast("Plein écran non supporté."); });
        } else {
            document.exitFullscreen();
        }
    });
    
    // Initialisation Mode Sombre
    document.getElementById('btn-dark-mode').addEventListener('click', () => {
        isDarkMode = !isDarkMode;
        document.body.classList.toggle('dark-mode', isDarkMode);
        document.getElementById('icon-dark-mode').innerHTML = isDarkMode ? 
            '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' : 
            '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        draw();
    });
    
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
            draw();
            e.stopPropagation();
        });
    });

    // Initialisation Enregistrement Vidéo
    document.getElementById('btn-record').addEventListener('click', () => {
        if (!isRecording) {
            try {
                const stream = canvas.captureStream(30);
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                recordedChunks = [];
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(recordedChunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'AuTableau_Enregistrement.webm'; a.click();
                    URL.revokeObjectURL(url);
                    showToast("Vidéo exportée !");
                };
                mediaRecorder.start();
                isRecording = true;
                document.getElementById('btn-record').classList.add('recording');
                showToast("🎥 Enregistrement démarré...");
            } catch (err) {
                showToast("L'enregistrement vidéo n'est pas supporté sur ce navigateur.");
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            document.getElementById('btn-record').classList.remove('recording');
            showToast("Arrêt de l'enregistrement...");
        }
    });
});

window.addEventListener('load', () => {
    const saved = localStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
        try {
            const s = JSON.parse(saved);
            let hasContent = false;
            if (s.pages) {
                hasContent = s.pages.some(p => (p.points && p.points.length > 0) || (p.images && p.images.length > 0) || (p.freehands && p.freehands.length > 0));
            } else {
                hasContent = (s.points && s.points.length > 0) || (s.images && s.images.length > 0) || (s.freehands && s.freehands.length > 0);
            }
            if (hasContent) {
                document.getElementById('restore-modal').style.display = 'flex';
            } else { initPages(); }
        } catch(e) { initPages(); }
    } else { initPages(); }
});

function confirmRestore() {
    const saved = localStorage.getItem(AUTO_SAVE_KEY);
    if (saved) { restoreState(saved); showToast("Session restaurée !"); }
    document.getElementById('restore-modal').style.display = 'none';
}

function cancelRestore() {
    localStorage.removeItem(AUTO_SAVE_KEY);
    document.getElementById('restore-modal').style.display = 'none';
    initPages();
}

// --- SAUVEGARDE ET HISTORIQUE ---
function saveAppLocal() {
    syncPage();
    let appState = { pages, nextId, globalZ, currentBgIndex };
    
    try {
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(appState));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22) {
            const cleanedPages = pages.map(p => ({
                ...p,
                images: (p.images || []).map(img => img.isBg ? { ...img, src: "" } : img)
            }));
            try {
                localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({ pages: cleanedPages, nextId, globalZ, currentBgIndex }));
                console.warn("Quota Storage dépassé. Arrière-plans PDF ignorés dans l'auto-save.");
            } catch (innerErr) {
                console.error("Impossible d'auto-sauvegarder les vecteurs.", innerErr);
            }
        } else {
            console.error("Erreur de stockage :", e);
        }
    }
}

function saveState() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    const state = JSON.stringify({ points, segments, circles, rectangles, texts, freehands, curves, polygons, images, arcs });
    if (historyIndex >= 0 && history[historyIndex] === state) return;
    history.push(state); historyIndex++;
    saveAppLocal();
}

function restoreState(stateStr) {
    currentPageIndex = -1;
    const state = JSON.parse(stateStr);

    if (state.pages) { 
        pages = state.pages; nextId = state.nextId || 1; globalZ = state.globalZ || 1; currentBgIndex = state.currentBgIndex || 0; 
    } 
    else { 
        pages = [{ points: state.points || [], segments: state.segments || [], circles: state.circles || [], rectangles: state.rectangles || [], texts: state.texts || [], freehands: state.freehands || [], curves: state.curves || [], polygons: state.polygons || [], images: state.images || [], arcs: state.arcs || [], history: state.history || [], historyIndex: state.historyIndex !== undefined ? state.historyIndex : -1, panX: window.innerWidth / 2, panY: window.innerHeight / 2, zoom: 1 }]; nextId = state.nextId || 1; globalZ = state.globalZ || 1; 
    }

    pages.forEach(p => {
        (p.images || []).forEach(img => { if(!imageCache[img.src] && img.src !== "") { const i = new Image(); i.src = img.src; imageCache[img.src] = i; i.onload = () => requestAnimationFrame(draw); } });
        (p.texts || []).forEach(t => { if (t.content.includes('$')) createMathImage(t.content, t.color || t.strokeColor, t.fontSize, (img, w, h) => { if(img) { t.mathImg = img; t.mathW = w; t.mathH = h; draw(); } }); });
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
    // Note : Si tu utilises ta modale de confirmation, 
    // mets ce code à l'intérieur du clic sur "confirm-yes-btn" à la place.

    // 1. On vide tous les objets de l'écran actuel
    images = []; polygons = []; curves = []; circles = []; arcs = [];
    rectangles = []; segments = []; freehands = []; points = []; texts = [];

    // 2. On réinitialise la mémoire des pages
    pages = []; 
    currentPageIndex = 0;
    
    // On sauvegarde cette page vierge comme étant la nouvelle page 1
    if (typeof saveCurrentPage === 'function') {
        saveCurrentPage(); 
    }

    // 3. On remet le compteur visuel à "1/1"
    const pageIndicator = document.getElementById('page-indicator');
    if (pageIndicator) {
        pageIndicator.innerText = '1/1';
    }

    // 4. On ferme les menus, on nettoie et on redessine
    if (typeof closeAllPopups === 'function') closeAllPopups();
    clearSelection();
    draw();
    
    showToast("✨ Nouveau document créé !");
});

document.getElementById('btn-save').addEventListener('click', () => {
    syncPage();
    const appState = { pages, nextId, globalZ, currentBgIndex };
    const blob = new Blob([JSON.stringify(appState)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "AuTableau_Projet.prof";
    a.click(); URL.revokeObjectURL(url); showToast("Projet sauvegardé !");
});

document.getElementById('btn-load').addEventListener('click', () => { document.getElementById('file-loader').click(); });
document.getElementById('file-loader').addEventListener('change', (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { restoreState(e.target.result); showToast("Projet chargé !"); };
    reader.readAsText(file); e.target.value = '';
});

// --- WIDGET TEMPS (Horloge / Chrono / Minuteur) ---
const timeWidget = document.getElementById('time-widget');
const timeTabs = document.querySelectorAll('.time-tab');
const timeDisplay = document.getElementById('time-display');
const timerInputs = document.getElementById('timer-inputs');
const inputMin = document.getElementById('timer-m');
const inputSec = document.getElementById('timer-s');
const btnPlay = document.getElementById('btn-time-play');
const btnPause = document.getElementById('btn-time-pause');
const btnReset = document.getElementById('btn-time-reset');
const btnTimeFs = document.getElementById('btn-time-fs');

let timeMode = 'clock'; 
let timerInterval = null;
let currentMs = 0;
let isTimeRunning = false;
let lastTimestamp = 0;

document.getElementById('btn-toggle-time').addEventListener('click', () => {
    timeWidget.classList.toggle('visible');
    if(timeWidget.classList.contains('visible') && timeMode === 'clock') updateClock();
});
document.getElementById('btn-time-close').addEventListener('click', () => timeWidget.classList.remove('visible'));

btnTimeFs.addEventListener('click', () => { timeWidget.classList.toggle('time-widget-fs'); });

function formatTime(ms, isStopwatch) {
    if (isStopwatch) {
        let date = new Date(ms);
        let m = String(date.getUTCMinutes()).padStart(2, '0');
        let s = String(date.getUTCSeconds()).padStart(2, '0');
        let mil = String(Math.floor(date.getUTCMilliseconds()/10)).padStart(2, '0');
        return `${m}:${s}<span style="font-size:0.6em">:${mil}</span>`;
    } else {
        let totalS = Math.ceil(ms / 1000);
        let m = String(Math.floor(totalS / 60)).padStart(2, '0');
        let s = String(totalS % 60).padStart(2, '0');
        return `${m}:${s}`;
    }
}

function updateClock() {
    if (timeMode !== 'clock') return;
    const now = new Date();
    timeDisplay.innerHTML = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + '<span style="font-size:0.6em">:' + String(now.getSeconds()).padStart(2, '0') + '</span>';
}

function timeTick(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (timeMode === 'clock') {
        updateClock();
    } else if (timeMode === 'stopwatch' && isTimeRunning) {
        currentMs += delta;
        timeDisplay.innerHTML = formatTime(currentMs, true);
    } else if (timeMode === 'timer' && isTimeRunning) {
        currentMs -= delta;
        if (currentMs <= 0) {
            currentMs = 0; isTimeRunning = false;
            btnPause.style.display = 'none'; btnPlay.style.display = 'inline-flex';
            showToast("⏳ Minuteur terminé !");
        }
        timeDisplay.innerHTML = formatTime(currentMs, false);
    }

    if (timeMode === 'clock' || isTimeRunning) {
        timerInterval = requestAnimationFrame(timeTick);
    }
}

function startTimerLoop() {
    if (timerInterval) cancelAnimationFrame(timerInterval);
    lastTimestamp = 0;
    timerInterval = requestAnimationFrame(timeTick);
}

timeTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        timeTabs.forEach(t => t.classList.remove('active')); tab.classList.add('active');
        timeMode = tab.dataset.tab;
        isTimeRunning = false;
        if(timerInterval) cancelAnimationFrame(timerInterval);

        btnPause.style.display = 'none'; btnPlay.style.display = 'inline-flex';

        if (timeMode === 'clock') {
            document.getElementById('time-controls').style.display = 'none';
            timeDisplay.style.display = 'block'; timerInputs.style.display = 'none';
            startTimerLoop();
        } else {
            document.getElementById('time-controls').style.display = 'flex';
            currentMs = 0;
            if (timeMode === 'stopwatch') {
                timeDisplay.style.display = 'block'; timerInputs.style.display = 'none';
                timeDisplay.innerHTML = formatTime(currentMs, true);
            } else {
                timeDisplay.style.display = 'none'; timerInputs.style.display = 'flex';
                inputMin.value = "05"; inputSec.value = "00";
            }
        }
    });
});

btnPlay.addEventListener('click', () => {
    if (timeMode === 'timer' && currentMs === 0) {
        currentMs = (parseInt(inputMin.value) * 60 + parseInt(inputSec.value)) * 1000;
        timeDisplay.style.display = 'block'; timerInputs.style.display = 'none';
        timeDisplay.innerHTML = formatTime(currentMs, false);
    }
    isTimeRunning = true; btnPlay.style.display = 'none'; btnPause.style.display = 'inline-flex';
    startTimerLoop();
});

btnPause.addEventListener('click', () => {
    isTimeRunning = false; btnPause.style.display = 'none'; btnPlay.style.display = 'inline-flex';
});

btnReset.addEventListener('click', () => {
    isTimeRunning = false; btnPause.style.display = 'none'; btnPlay.style.display = 'inline-flex';
    currentMs = 0;
    if (timeMode === 'stopwatch') {
        timeDisplay.innerHTML = formatTime(0, true);
    } else if (timeMode === 'timer') {
        timeDisplay.style.display = 'none'; timerInputs.style.display = 'flex';
    }
});

let isDraggingTime = false; let tStartX = 0, tStartY = 0;
timeWidget.querySelector('.drag-handle-time').addEventListener('mousedown', (e) => {
    if(e.target.closest('button')) return;
    isDraggingTime = true;
    tStartX = e.clientX - timeWidget.offsetLeft;
    tStartY = e.clientY - timeWidget.offsetTop;
});
window.addEventListener('mousemove', (e) => {
    if (isDraggingTime && !timeWidget.classList.contains('time-widget-fs')) {
        timeWidget.style.left = (e.clientX - tStartX) + 'px';
        timeWidget.style.top = (e.clientY - tStartY) + 'px';
        timeWidget.style.right = 'auto'; 
    }
});
window.addEventListener('mouseup', () => isDraggingTime = false);


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
        ctx.moveTo(tipX - l, l/2);
        ctx.lineTo(tipX, 0);
        ctx.lineTo(tipX - l, -l/2);
        ctx.stroke();
    } else if (type === 2) { // Triangle
        ctx.moveTo(tipX, 0);
        ctx.lineTo(tipX - l, l/2.5);
        ctx.lineTo(tipX - l, -l/2.5);
        ctx.closePath();
        ctx.fill();
    } else if (type === 3) { // Dart
        ctx.moveTo(tipX, 0);
        ctx.lineTo(tipX - l, l/2.5);
        ctx.lineTo(tipX - l + l/3, 0);
        ctx.lineTo(tipX - l, -l/2.5);
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
        d = `M ${tipX - l} ${l/2} L ${tipX} 0 L ${tipX - l} ${-l/2}`;
        stroke = color;
    } else if (type === 2) {
        d = `M ${tipX} 0 L ${tipX - l} ${l/2.5} L ${tipX - l} ${-l/2.5} Z`;
        fill = color;
    } else if (type === 3) {
        d = `M ${tipX} 0 L ${tipX - l} ${l/2.5} L ${tipX - l + l/3} 0 L ${tipX - l} ${-l/2.5} Z`;
        fill = color;
    }
    
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w*lw}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${x}, ${y}) rotate(${aDeg})" />`;
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
    const pts = ptIds.map(id => getObjectById('point', id)).filter(p => p); if(appendPos) pts.push(appendPos); if (pts.length < 2) return;
    ctx.beginPath();
    if (isClosed && pts.length > 2) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length; i++) {
            const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length], p3 = pts[(i + 2) % pts.length];
            ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
        }
    } else {
        ctx.moveTo(pts[0].x, pts[0].y); if(pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); return; }
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];
            ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
        }
    }
    ctx.stroke();
}

function drawSmoothFreehand(ctx, points, baseWidth, lw) {
    if (points.length < 2) return; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < points.length - 1; i++) {
        ctx.beginPath(); ctx.moveTo(points[i].x, points[i].y); ctx.lineTo(points[i+1].x, points[i+1].y);
        const p = points[i+1].p !== undefined ? points[i+1].p : 0.5; ctx.lineWidth = (baseWidth || 3) * (p * 2) * lw; ctx.stroke();
    }
}


// --- LOGIQUE UTILITAIRE RESTANTE ---
function hexToRgba(hex, alpha) {
    if(!hex) hex = '#000000';
    if(hex.startsWith('#')){
        let r=0, g=0, b=0;
        if(hex.length===4){ r=parseInt(hex[1]+hex[1],16); g=parseInt(hex[2]+hex[2],16); b=parseInt(hex[3]+hex[3],16); }
        else if(hex.length===7){ r=parseInt(hex.slice(1,3),16); g=parseInt(hex.slice(3,5),16); b=parseInt(hex.slice(5,7),16); }
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
        if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x; 
        if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y; 
    });
    const w = maxX - minX; const h = maxY - minY; const diag = Math.hypot(w, h);
    
    if (diag < 8 / zoom) return; 

    const first = pts[0]; const last = pts[pts.length-1];
    const isClosed = Math.hypot(first.x - last.x, first.y - last.y) < diag * 0.3;

    let recognized = false; let shapeName = "";

    if (isClosed) {
        let simPts = simplifyLine(pts, Math.max(diag * 0.07, 4/zoom));
        if (Math.hypot(simPts[0].x - simPts[simPts.length-1].x, simPts[0].y - simPts[simPts.length-1].y) < diag * 0.3) simPts.pop();

        const cx = minX + w/2; const cy = minY + h/2;
        let rSum = 0; pts.forEach(p => rSum += Math.hypot(p.x - cx, p.y - cy));
        const rAvg = rSum / pts.length;
        let variance = 0; pts.forEach(p => variance += Math.abs(Math.hypot(p.x - cx, p.y - cy) - rAvg));
        variance /= pts.length;
        const circularity = variance / rAvg;

        if (circularity < 0.09 || simPts.length > 6) {
            const cId = nextId++; const eId = nextId++;
            points.push({id: cId, x: cx, y: cy, z: globalZ++, shape: 'pixel', color: 'rgba(0,0,0,0)'}); 
            points.push({id: eId, x: cx + rAvg, y: cy, z: globalZ++, shape: 'pixel', color: 'rgba(0,0,0,0)'}); 
            circles.push({ 
                id: nextId++, center_id: cId, edge_id: eId, 
                color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash, 
                isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ 
            });
            recognized = true; shapeName = "Cercle";
        } else if (simPts.length === 4) {
             const p1Id = nextId++; const p2Id = nextId++;
             points.push({id: p1Id, x: minX, y: minY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
             points.push({id: p2Id, x: maxX, y: maxY, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
             rectangles.push({ 
                 id: nextId++, p1_id: p1Id, p2_id: p2Id, color: currentFreehand.color, width: currentFreehand.width, dash: currentFreehand.dash, 
                 isFilled: activeStyle.isFilled, fillColor: activeStyle.fillColor, fillOpacity: activeStyle.fillOpacity, z: globalZ++ 
             });
             recognized = true; shapeName = "Rectangle";
        } else if (simPts.length >= 3 && simPts.length <= 6) {
            let polyPointIds = [];
            simPts.forEach((p) => {
                const pId = nextId++;
                points.push({id: pId, x: p.x, y: p.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
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
        let simPts = simplifyLine(pts, Math.max(diag * 0.07, 4/zoom));
        if (simPts.length === 2) { 
            let p2x = simPts[1].x, p2y = simPts[1].y;
            if (Math.abs(simPts[0].x - p2x) < diag*0.1) p2x = simPts[0].x;
            if (Math.abs(simPts[0].y - p2y) < diag*0.1) p2y = simPts[0].y;

            const p1Id = nextId++; const p2Id = nextId++;
            points.push({id: p1Id, x: simPts[0].x, y: simPts[0].y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
            points.push({id: p2Id, x: p2x, y: p2y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
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
        if (type === 'dashed') return `${w*6},${w*4}`;
        if (type === 'dotted') return `${w},${w*3}`;
        return 'none';
    }

    let displayList = [];
    images.forEach(o => displayList.push({type: 'image', obj: o}));
    polygons.forEach(o => displayList.push({type: 'polygon', obj: o}));
    curves.forEach(o => displayList.push({type: 'curve', obj: o}));
    circles.forEach(o => displayList.push({type: 'circle', obj: o}));
    arcs.forEach(o => displayList.push({type: 'arc', obj: o}));
    rectangles.forEach(o => displayList.push({type: 'rectangle', obj: o}));
    segments.forEach(o => displayList.push({type: 'segment', obj: o}));
    freehands.forEach(o => displayList.push({type: 'freehand', obj: o}));
    points.forEach(o => displayList.push({type: 'point', obj: o}));
    texts.forEach(o => displayList.push({type: 'text', obj: o}));

    displayList.sort((a, b) => (a.obj.z || 0) - (b.obj.z || 0));

    const lw = 1 / zoom;
    
    // Calcul des points à cacher sous les flèches pour le SVG
    let hiddenPoints = new Set();
    segments.forEach(s => { if(s.arrowStart) hiddenPoints.add(s.p1_id); if(s.arrowEnd) hiddenPoints.add(s.p2_id); });
    curves.forEach(c => { if(c.points.length>1) { if(c.arrowStart) hiddenPoints.add(c.points[0]); if(c.arrowEnd) hiddenPoints.add(c.points[c.points.length-1]); } });

    displayList.forEach(item => {
        const obj = item.obj;
        const color = obj.strokeColor || obj.color || (isDarkMode ? '#fff' : '#000');
        const w = obj.width || 3;
        const dash = getDash(obj.dash, w);
        const fill = obj.isFilled ? hexToRgba(obj.fillColor || obj.color, obj.fillOpacity || 0.2) : 'none';

        if (item.type === 'image') {
            svg += `<image href="${obj.src}" x="${obj.x}" y="${obj.y}" width="${obj.w}" height="${obj.h}" />`;
        } else if (item.type === 'freehand') {
            if (obj.isHighlighter) {
                if (obj.points.length > 1) {
                    let d = `M ${obj.points[0].x} ${obj.points[0].y} `;
                    for(let i=1; i<obj.points.length; i++) d += `L ${obj.points[i].x} ${obj.points[i].y} `;
                    svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" style="mix-blend-mode: multiply;" opacity="0.85" />`;
                }
            } else {
                for(let i=0; i<obj.points.length-1; i++) {
                    let p = obj.points[i+1].p !== undefined ? obj.points[i+1].p : 0.5;
                    let sw = w * (p * 2);
                    svg += `<line x1="${obj.points[i].x}" y1="${obj.points[i].y}" x2="${obj.points[i+1].x}" y2="${obj.points[i+1].y}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash}" />`;
                }
            }
            if (obj.arrowStart && obj.points.length > 1 && !obj.isHighlighter) {
                const pA = obj.points[1]; const pB = obj.points[0];
                const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                svg += getSvgArrowHead(pB.x, pB.y, angle, color, w, 1, obj.arrowStart);
            }
            if (obj.arrowEnd && obj.points.length > 1 && !obj.isHighlighter) {
                const pA = obj.points[obj.points.length - 2]; const pB = obj.points[obj.points.length - 1];
                const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                svg += getSvgArrowHead(pB.x, pB.y, angle, color, w, 1, obj.arrowEnd);
            }
        } else if (item.type === 'polygon') {
            if (obj.points.length >= 2) {
                let d = ''; let valid = true;
                const p0 = getObjectById('point', obj.points[0]);
                if(p0) {
                    d += `M ${p0.x} ${p0.y} `;
                    for(let i=1; i<obj.points.length; i++) {
                        const p = getObjectById('point', obj.points[i]);
                        if(p) d += `L ${p.x} ${p.y} `; else valid = false;
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
                        d += `C ${p1.x + (p2.x - p0.x)/6} ${p1.y + (p2.y - p0.y)/6}, ${p2.x - (p3.x - p1.x)/6} ${p2.y - (p3.y - p1.y)/6}, ${p2.x} ${p2.y} `;
                    }
                } else {
                    if (pts.length === 2) d += `L ${pts[1].x} ${pts[1].y} `;
                    else {
                        for (let i = 0; i < pts.length - 1; i++) {
                            const p0 = pts[i === 0 ? 0 : i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 === pts.length ? i + 1 : i + 2];
                            d += `C ${p1.x + (p2.x - p0.x)/6} ${p1.y + (p2.y - p0.y)/6}, ${p2.x - (p3.x - p1.x)/6} ${p2.y - (p3.y - p1.y)/6}, ${p2.x} ${p2.y} `;
                        }
                    }
                }
                svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" />`;
                if (obj.arrowStart && !obj.closed && pts.length > 1) {
                    const pA = pts[1]; const pB = pts[0];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    svg += getSvgArrowHead(pB.x, pB.y, angle, color, w, 1, obj.arrowStart);
                }
                if (obj.arrowEnd && !obj.closed && pts.length > 1) {
                    const pA = pts[pts.length - 2]; const pB = pts[pts.length - 1];
                    const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                    svg += getSvgArrowHead(pB.x, pB.y, angle, color, w, 1, obj.arrowEnd);
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
                    const angle = Math.atan2(p1.y - p2.y, p1.x - p2.x);
                    svg += getSvgArrowHead(p1.x, p1.y, angle, color, w, 1, obj.arrowStart);
                }
                if (obj.arrowEnd) {
                    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    svg += getSvgArrowHead(p2.x, p2.y, angle, color, w, 1, obj.arrowEnd);
                }
            }
        } else if (item.type === 'point') {
            if (hiddenPoints.has(obj.id)) return; // Cache la géométrie du point si une flèche est posée dessus
            
            const s = 4;
            if (obj.shape === 'circle') svg += `<circle cx="${obj.x}" cy="${obj.y}" r="${s}" fill="${color}" />`;
            else if (obj.shape === 'square') svg += `<rect x="${obj.x-s}" y="${obj.y-s}" width="${s*2}" height="${s*2}" fill="${color}" />`;
            else if (obj.shape === 'pixel') svg += `<rect x="${obj.x-1.5}" y="${obj.y-1.5}" width="3" height="3" fill="${color}" />`;
            else if (obj.shape === 'cross') {
                svg += `<line x1="${obj.x-s}" y1="${obj.y-s}" x2="${obj.x+s}" y2="${obj.y+s}" stroke="${color}" stroke-width="2.5" />`;
                svg += `<line x1="${obj.x+s}" y1="${obj.y-s}" x2="${obj.x-s}" y2="${obj.y+s}" stroke="${color}" stroke-width="2.5" />`;
            }
        } else if (item.type === 'text') {
            if (obj.id !== editingTextId) {
                if (obj.mathImg) {
                    // Export SVG d'une formule Mathématique (Image)
                    svg += `<image href="${obj.mathImg.src}" x="${obj.x}" y="${obj.y}" width="${obj.mathW}" height="${obj.mathH}" />`;
                } else {
                    // 1. Parseur HTML identique à celui du Canvas
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

                    // 2. Variables de base
                    const align = obj.align || 'left';
                    const fontSize = obj.fontSize || 24; 
                    const fontFamily = obj.fontFamily || 'sans-serif';
                    const lineHeight = fontSize * 1.2;
                    let startY = obj.y + (fontSize * 0.1); 
                    
                    // 3. Calcul de la largeur pour l'alignement
                    let maxW = 0;
                    const lineMetrics = lines.map(line => {
                        let w = 0;
                        line.forEach(seg => {
                            ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
                            w += ctx.measureText(seg.text).width;
                        });
                        if (w > maxW) maxW = w;
                        return w;
                    });

                    // 4. Génération de la balise <text> SVG
                    lines.forEach((line, i) => {
                        const lineWidth = lineMetrics[i];
                        let curX = obj.x;
                        if (align === 'center') curX = obj.x + (maxW / 2) - (lineWidth / 2);
                        else if (align === 'right') curX = obj.x + maxW - lineWidth;
                        
                        // dominant-baseline="hanging" remplace le ctx.textBaseline='top' du Canvas !
                        svg += `<text x="${curX}" y="${startY + i * lineHeight}" font-family="${fontFamily}" font-size="${fontSize}px" dominant-baseline="hanging" xml:space="preserve">`;
                        
                        line.forEach(seg => {
                            const fw = seg.style.bold ? 'bold' : 'normal';
                            const fs = seg.style.italic ? 'italic' : 'normal';
                            const td = seg.style.underline ? 'underline' : 'none';
                            const fc = seg.style.color || color;
                            
                            // Sécurité pour ne pas casser le fichier SVG avec les caractères spéciaux HTML
                            const escapedText = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                            
                            svg += `<tspan font-weight="${fw}" font-style="${fs}" text-decoration="${td}" fill="${fc}">${escapedText}</tspan>`;
                        });
                        
                        svg += `</text>`;
                    });
                }
            }
        }
    });

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
        if(x < minX) minX = x; if(x > maxX) maxX = x;
        if(y < minY) minY = y; if(y > maxY) maxY = y;
        hasContent = true;
    }

    // Fonction pour récupérer un point par son ID en toute sécurité
    const checkPointId = (id) => { const p = getObjectById('point', id); if(p) addPt(p.x, p.y); };

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
        if(center && edge) {
            const r = Math.hypot(edge.x - center.x, edge.y - center.y);
            addPt(center.x - r, center.y - r); addPt(center.x + r, center.y + r);
        }
    });

    // Si la page est vide, on crée une fausse zone au milieu
    if (!hasContent) return { 
        startX: canvas.width/2 - 200, startY: canvas.height/2 - 200, 
        endX: canvas.width/2 + 200, endY: canvas.height/2 + 200 
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
        const svgStr = generateSVGString({x: rx, y: ry, w: rw, h: rh}, keepBg);
        const blob = new Blob([svgStr], {type: "image/svg+xml"});
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
document.getElementById('btn-do-copy').addEventListener('click', () => performCapture('copy'));
document.getElementById('btn-do-export-png').addEventListener('click', () => performCapture('png'));
document.getElementById('btn-do-export-svg').addEventListener('click', () => performCapture('svg'));
document.getElementById('btn-do-export-pdf').addEventListener('click', () => performCapture('pdf'));

// --- 4. LE BOUTON MAGIQUE : PDF DE TOUTES LES PAGES ---
// --- 4. LE BOUTON MAGIQUE : PDF DE TOUTES LES PAGES ---
const btnExportAllPdf = document.getElementById('btn-do-export-pdf-all');
if (btnExportAllPdf) {
    btnExportAllPdf.addEventListener('click', async () => {
        if (!window.jspdf || !window.jspdf.jsPDF) return showToast("Erreur : Moteur PDF non chargé.");
        
        showToast("Génération du PDF complet en cours... ⏳");
        
        const qualitySelect = document.getElementById('export-quality');
        const qualityScale = qualitySelect ? parseInt(qualitySelect.value) : 2;
        const keepBg = document.getElementById('export-bg').checked;
        
        // On mémorise la page actuelle
        const startIndex = currentPageIndex;
        let pdf = null;

        for (let i = 0; i < pages.length; i++) {
            currentPageIndex = i;
            loadPage(i);
            
            // Recadrage auto INVISIBLE pour chaque page !
            const box = getAutoBoundingBox(40);
            let rx = box.startX, ry = box.startY;
            let rw = Math.abs(box.endX - box.startX);
            let rh = Math.abs(box.endY - box.startY);
            
            // Sécurité : si la page est vraiment vide
            if(rw < 50) rw = canvas.width;
            if(rh < 50) rh = canvas.height;

            // Préparation visuelle sans sélection
            const oldSel = [...selectedItems]; clearSelection();
            let oldAxes = showAxes;
            if (!keepBg) { showAxes = 0; isExportingTransparent = true; }
            const wasCropMode = isCropMode; isCropMode = false;

            draw();
            
            // Petite pause pour garantir que le draw() est fini (images, maths)
            await new Promise(r => setTimeout(r, 50));

            const tempC = document.createElement('canvas');
            tempC.width = rw * qualityScale;
            tempC.height = rh * qualityScale;
            const tCtx = tempC.getContext('2d');
            tCtx.scale(qualityScale, qualityScale);
            tCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);

            // Restauration UI
            selectedItems = oldSel; showAxes = oldAxes; isExportingTransparent = false;
            isCropMode = wasCropMode;

            if (!pdf) {
                pdf = new window.jspdf.jsPDF({ orientation: rw > rh ? 'landscape' : 'portrait', unit: 'px', format: [rw, rh] });
            } else {
                pdf.addPage([rw, rh], rw > rh ? 'landscape' : 'portrait');
            }
            pdf.addImage(tempC.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, rw, rh);
        }

        // Retour à la page d'origine
        currentPageIndex = startIndex;
        loadPage(currentPageIndex);
        
        exportPopover.classList.remove('visible');
        isCropMode = false; cropRect = null;
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
    if (document.activeElement === wysiwygText) return;
 if (e.key === 'l' || e.key === 'L') { 
        toggleLoupe();
    }
    if (e.key === 'Escape' || e.key === 'Backspace') {
        if (isCropMode) { isCropMode = false; cropRect = null; exportPopover.classList.remove('visible'); draw(); return; }
        let canceledSomething = false;
        if (mode === 'polygon' && currentPolygonPoints.length > 0) { currentPolygonPoints.pop(); canceledSomething = true; }
        else if (mode === 'curve' && currentCurvePoints.length > 0) { currentCurvePoints.pop(); canceledSomething = true; }
        else if ((mode === 'segment' || mode === 'circle' || mode === 'rectangle') && creationStartPointId !== null) { creationStartPointId = null; canceledSomething = true; }
        if (canceledSomething) { mouseLogicalPos = null; draw(); if(e.key === 'Backspace') e.preventDefault(); return; }
    }
    if (e.ctrlKey || e.metaKey) { if (e.key === 'z') { e.preventDefault(); undo(); } if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redo(); } }
    if (e.code === 'Space') { e.preventDefault(); isSpacePressed = true; updateCursor(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItems.length > 0) {
        let deletedSomething = false;
        selectedItems.forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if (obj && !obj.locked) { deleteObject(item.type, item.id); deletedSomething = true; }
        });
        if (deletedSomething) { clearSelection(); saveState(); draw(); }
    }
});



// On cache la barre quand on a fini
wysiwygText.addEventListener('blur', () => { textToolbar.style.display = 'none'; });

window.addEventListener('keyup', (e) => { 
  
    if (e.code === 'Space') { isSpacePressed = false; isPanningView = false; updateCursor(); } });

// --- GLISSER DEPOSER IMAGE ET PDF ---
const dropOverlay = document.getElementById('drop-overlay');
document.addEventListener('dragenter', (e) => { e.preventDefault(); dropOverlay.style.display = 'flex'; }); document.addEventListener('dragover', (e) => { e.preventDefault(); dropOverlay.style.display = 'flex'; });
document.addEventListener('dragleave', (e) => { e.preventDefault(); if (e.relatedTarget === null || e.relatedTarget.nodeName === "HTML") dropOverlay.style.display = 'none'; });
document.addEventListener('drop', (e) => {
    e.preventDefault(); 
    dropOverlay.style.display = 'none';
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        
        if (file.type === 'application/pdf') {
            loadPdf(file);
            return;
        }
        
        if (!file.type.match('image.*')) { 
            showToast("Format non supporté (Image ou PDF uniquement)."); 
            return; 
        }
        
        const reader = new FileReader();
        reader.onload = (f) => {
            const src = f.target.result; const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height; if (w > 800) { h *= 800/w; w = 800; } 
                const lx = (e.clientX - panX) / zoom; const ly = (e.clientY - panY) / zoom;
                images.push({ id: nextId++, x: lx - w/2, y: ly - h/2, w: w, h: h, cx: 0, cy: 0, cw: img.width, ch: img.height, src: src, z: globalZ++ });
                imageCache[src] = img; saveState(); showToast("Image importée !"); draw();
            }; img.src = src;
        }; 
        reader.readAsDataURL(file);
    }
});

// --- DRAG BARRES ---
// --- DRAG BARRES ---
document.querySelectorAll('.toolbar').forEach(bar => {
    const handle = bar.querySelector('.drag-handle'); let isDraggingBar = false, startX, startY;
    if (handle) { // <-- LA SÉCURITÉ EST ICI
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
        window.addEventListener('mousemove', (e) => { if (isDraggingBar) { bar.style.left = (e.clientX - startX) + 'px'; bar.style.top = (e.clientY - startY) + 'px'; } });
        window.addEventListener('mouseup', () => isDraggingBar = false);
    }
});

// --- POPOVER COULEUR ---
const colorPopover = document.getElementById('color-popover'); const btnColorPopover = document.getElementById('btn-color-popover'); const colorIndicator = document.getElementById('color-indicator');
let popoverTarget = 'stroke';
function updateColorIndicator() { colorIndicator.style.borderColor = hexToRgba(activeStyle.strokeColor, activeStyle.strokeOpacity); colorIndicator.style.background = activeStyle.isFilled ? hexToRgba(activeStyle.fillColor, activeStyle.fillOpacity) : 'transparent'; }
btnColorPopover.addEventListener('click', (e) => { colorPopover.classList.toggle('visible'); e.stopPropagation(); });

document.querySelectorAll('.popover-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.popover-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active'); popoverTarget = tab.dataset.target;
        document.getElementById('opacity-slider').value = popoverTarget === 'stroke' ? activeStyle.strokeOpacity : activeStyle.fillOpacity;
        document.getElementById('btn-no-fill').style.display = popoverTarget === 'fill' ? 'flex' : 'none';
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        const activeC = popoverTarget === 'stroke' ? activeStyle.strokeColor : activeStyle.fillColor;
        const dot = document.querySelector(`.color-dot[data-color="${activeC}"]`); if(dot) dot.classList.add('active');
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
document.getElementById('btn-no-fill').addEventListener('click', () => { if(popoverTarget === 'fill') { activeStyle.isFilled = false; updateColorIndicator(); pushStyleToObject(); } });

// --- GESTION SELECTION ET STYLES ---
function updateStyleBarContext() {
    const barStyle = document.getElementById('bar-style'); barStyle.className = "toolbar visible";
    let targetType = mode; if (selectedItems.length === 1) targetType = selectedItems[0].type; else if (selectedItems.length > 1) targetType = 'multi'; 
    
    // --- NOUVEAU : On ajoute 'ctx-point' pour les outils segment, curve et polygon ---
    if (targetType === 'point') barStyle.classList.add('ctx-point');
    else if (['segment', 'curve', 'polygon'].includes(targetType)) barStyle.classList.add('ctx-line', 'ctx-point');
    else if (['circle', 'rectangle', 'freehand', 'highlighter', 'multi'].includes(targetType)) barStyle.classList.add('ctx-line');
    else if (targetType === 'text') barStyle.classList.add('ctx-text');
    else barStyle.classList.remove('visible'); 
    // ----------------------------------------------------------------------------------
    
    if (selectedItems.length > 0) {
        barStyle.classList.add('ctx-zindex', 'ctx-lock');
        
        // Synchro du bouton Verrouillage
        const isAllLocked = selectedItems.every(i => { const o = getObjectById(i.type, i.id); return o && o.locked; });
        const btnLock = document.getElementById('btn-lock');
        if(isAllLocked) {
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
    if (wysiwygText.style.display === 'block') {
        wysiwygText.style.fontSize = (activeStyle.fontSize * zoom) + 'px';
        wysiwygText.style.color = activeStyle.strokeColor;
    }
    if (selectedItems.length === 0) return;
    selectedItems.forEach(item => {
        const obj = getObjectById(item.type, item.id); if (!obj) return;
        
        if(!obj.locked) {
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
                        if(img) { obj.mathImg = img; obj.mathW = w; obj.mathH = h; draw(); }
                    });
                }
            }
        }
    }); saveState(); draw();
}

document.getElementById('btn-lock').addEventListener('click', () => {
    const isAllLocked = selectedItems.every(i => { const o = getObjectById(i.type, i.id); return o && o.locked; });
    const newState = !isAllLocked;
    selectedItems.forEach(i => { const o = getObjectById(i.type, i.id); if(o) o.locked = newState; });
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

document.getElementById('btn-z-up').addEventListener('click', () => { selectedItems.forEach(item => { const obj = getObjectById(item.type, item.id); if(obj && !obj.locked) obj.z = globalZ++; }); saveState(); draw(); showToast("Placé au premier plan"); });
document.getElementById('btn-z-down').addEventListener('click', () => { let minZ = 0; [points, segments, circles, rectangles, curves, polygons, freehands, images, texts].forEach(arr => { arr.forEach(o => { if(o.z !== undefined && o.z < minZ) minZ = o.z; }); }); selectedItems.forEach(item => { const obj = getObjectById(item.type, item.id); if(obj && !obj.locked) obj.z = minZ - 1; }); saveState(); draw(); showToast("Envoyé à l'arrière-plan"); });

document.getElementById('btn-shape').addEventListener('click', () => { const shapes = ['circle', 'cross', 'square', 'pixel']; const icons = { 'circle': '<circle cx="12" cy="12" r="6"/>', 'cross': '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="3"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="3"/>', 'square': '<rect x="6" y="6" width="12" height="12"/>', 'pixel': '<rect x="10" y="10" width="4" height="4" fill="currentColor"/>' }; activeStyle.pointShape = shapes[(shapes.indexOf(activeStyle.pointShape) + 1) % shapes.length]; document.getElementById('icon-shape').innerHTML = icons[activeStyle.pointShape]; pushStyleToObject(); });
document.getElementById('btn-dash').addEventListener('click', () => { const dashes = ['solid', 'dashed', 'dotted']; const icons = { 'solid': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3"/>', 'dashed': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3" stroke-dasharray="6,4"/>', 'dotted': '<line x1="4" y1="12" x2="20" y2="12" stroke-width="3" stroke-dasharray="2,4"/>' }; activeStyle.lineDash = dashes[(dashes.indexOf(activeStyle.lineDash) + 1) % dashes.length]; document.getElementById('icon-dash').innerHTML = icons[activeStyle.lineDash]; pushStyleToObject(); });
document.getElementById('line-width').addEventListener('input', (e) => { activeStyle.lineWidth = parseInt(e.target.value); pushStyleToObject(); });
document.getElementById('font-size').addEventListener('input', (e) => { activeStyle.fontSize = parseInt(e.target.value); pushStyleToObject(); });

// --- CHANGEMENT DE MODE ET GESTION UI ---
function setMode(newMode) {
    mode = newMode;
    document.querySelectorAll('#bar-tools .btn').forEach(b => b.classList.remove('active'));
    const modeBtn = document.querySelector(`#bar-tools .btn[data-mode="${mode}"]`);
    if(modeBtn) modeBtn.classList.add('active');
    
    creationStartPointId = null; currentCurvePoints = []; currentPolygonPoints = []; wysiwygText.style.display = 'none'; editingTextId = null;
    clearSelection();
    
    if (['point', 'segment', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon'].includes(mode)) updateStyleBarContext(); 
    else document.getElementById('bar-style').classList.remove('visible');
    
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
    if(obj.locked) return null;
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

    if (type === 'image') {
        const hx = [startX, startX+w/2, startX+w, startX+w, startX+w, startX+w/2, startX, startX];
        const hy = [startY, startY, startY, startY+h/2, startY+h, startY+h, startY+h, startY+h/2];
        const hNames = ['TL', 'T', 'TR', 'R', 'BR', 'B', 'BL', 'L'];
        for(let i=0; i<8; i++) { 
            if(Math.abs(unrotatedX - hx[i]) <= hw && Math.abs(unrotatedY - hy[i]) <= hw) return hNames[i]; 
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
        if(hn==='TL'||hn==='BR') canvas.classList.add('cursor-nwse-resize'); else if(hn==='TR'||hn==='BL') canvas.classList.add('cursor-nesw-resize');
        else if(hn==='T'||hn==='B') canvas.classList.add('cursor-ns-resize'); else canvas.classList.add('cursor-ew-resize'); return;
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
                <line x1="6" y1="1" x2="6" y2="${h-1}" stroke="${color}" stroke-width="2"/>
                <line x1="2" y1="1" x2="10" y2="1" stroke="${color}" stroke-width="2"/>
                <line x1="2" y1="${h-1}" x2="10" y2="${h-1}" stroke="${color}" stroke-width="2"/>
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
function distToSegment(px, py, x1, y1, x2, y2) { const l2 = (x1-x2)*(x1-x2) + (y1-y2)*(y1-y2); if (l2 === 0) return Math.hypot(px-x1, py-y1); let t = Math.max(0, Math.min(1, ((px-x1)*(x2-x1) + (py-y1)*(y2-y1)) / l2)); return Math.hypot(px - (x1 + t*(x2-x1)), py - (y1 + t*(y2-y1))); }

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
    const updateHit = (hit) => { const obj = getObjectById(hit.type, hit.id); if(obj && (obj.z || 0) > maxZ) { maxZ = obj.z || 0; bestHit = hit; } };
    
    // --- 3. Vérification des Textes (Avec rotation et boîte pleine) ---
    for (let i = texts.length - 1; i >= 0; i--) { 
        const t = texts[i]; 
        let w, h;
        if (t.mathImg) { 
            w = t.mathW; h = t.mathH; 
        } else { 
            ctx.font = `${t.fontSize || 24}px ${t.fontFamily || 'sans-serif'}`; 
            const cleanText = t.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' '); // Enlève le HTML pour mesurer
            const lines = cleanText.split('\n');
            let maxW = 0;
            lines.forEach(line => { const width = ctx.measureText(line).width; if (width > maxW) maxW = width; });
            w = maxW; 
            h = lines.length * (t.fontSize || 24) * 1.2; 
        }
        
        const align = t.align || 'left';
        let startX = t.x;
        if (align === 'center') startX = t.x - w / 2;
        else if (align === 'right') startX = t.x - w;

        // On "dés-tourne" les coordonnées de la souris pour compenser la rotation du texte
        let checkX = lx; let checkY = ly;
        if (t.angle) {
            const cx = startX + w/2; const cy = t.y + h/2;
            checkX = Math.cos(-t.angle) * (lx - cx) - Math.sin(-t.angle) * (ly - cy) + cx;
            checkY = Math.sin(-t.angle) * (lx - cx) + Math.cos(-t.angle) * (ly - cy) + cy;
        }

        // Hitzone parfaite : on clique n'importe où dans le rectangle du texte
        if (checkX >= startX && checkX <= startX + w && checkY >= t.y && checkY <= t.y + h) {
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

    for (let i = segments.length - 1; i >= 0; i--) { const s = segments[i], p1 = getObjectById('point', s.p1_id), p2 = getObjectById('point', s.p2_id); if (p1 && p2 && distToSegment(lx, ly, p1.x, p1.y, p2.x, p2.y) < hitZoneLine) updateHit({ type: 'segment', id: s.id }); }
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
        for (let j = 0; j < len; j++) { const pk_idx = (j + 1) % poly.points.length; const pj = getObjectById('point', poly.points[j]), pk = getObjectById('point', poly.points[pk_idx]); if(pj && pk && distToSegment(lx, ly, pj.x, pj.y, pk.x, pk.y) < hitZoneLine) { onBorder = true; break; } }
        let inside = false; if (poly.isClosed !== false && poly.isFilled) { for (let j = 0, k = poly.points.length - 1; j < poly.points.length; k = j++) { const pj = getObjectById('point', poly.points[j]), pk = getObjectById('point', poly.points[k]); if(!pj || !pk) break; const intersect = ((pj.y > ly) !== (pk.y > ly)) && (lx < (pk.x - pj.x) * (ly - pj.y) / (pk.y - pj.y) + pj.x); if (intersect) inside = !inside; } }
        if (onBorder || inside) updateHit({ type: 'polygon', id: poly.id });
    }
    
    for (let i = curves.length - 1; i >= 0; i--) { const c = curves[i]; for(let j=0; j<c.points.length; j++){ const p = getObjectById('point', c.points[j]); if(p && Math.hypot(p.x - lx, p.y - ly) < hitZoneLine) updateHit({ type: 'curve', id: c.id }); } }
    for (let i = freehands.length - 1; i >= 0; i--) { const f = freehands[i]; for (let j = 0; j < f.points.length; j++) if (Math.hypot(f.points[j].x - lx, f.points[j].y - ly) < hitZoneLine) updateHit({ type: 'freehand', id: f.id }); }
    
    // --- 5. Images (Avec compensation de la rotation) ---
    for (let i = images.length - 1; i >= 0; i--) { 
        const img = images[i]; 
        let checkX = lx; let checkY = ly;
        if (img.angle) {
            const cx = img.x + img.w/2; const cy = img.y + img.h/2;
            checkX = Math.cos(-img.angle) * (lx - cx) - Math.sin(-img.angle) * (ly - cy) + cx;
            checkY = Math.sin(-img.angle) * (lx - cx) + Math.cos(-img.angle) * (ly - cy) + cy;
        }
        if (checkX >= img.x && checkX <= img.x + img.w && checkY >= img.y && checkY <= img.y + img.h) {
            updateHit({ type: 'image', id: img.id }); 
        }
    }
    
    return bestHit;
}

function clearSelection() { selectedItems = []; if(!['point', 'segment', 'circle', 'rectangle', 'text', 'freehand', 'highlighter', 'curve', 'polygon'].includes(mode)) document.getElementById('bar-style').classList.remove('visible'); document.getElementById('bar-style').classList.remove('ctx-zindex', 'ctx-lock'); draw(); }
function isSelected(type, id) { return selectedItems.some(item => item.type === type && item.id === id); }
function selectObject(objInfo) {
    selectedItems = [objInfo];
    if (objInfo.type !== 'image') {
        const obj = getObjectById(selectedItems[0].type, selectedItems[0].id);
        if (obj) {
            activeStyle.strokeColor = obj.strokeColor || obj.color; activeStyle.strokeOpacity = obj.strokeOpacity !== undefined ? obj.strokeOpacity : 1;
            if(obj.fillColor !== undefined) { activeStyle.fillColor = obj.fillColor; activeStyle.fillOpacity = obj.fillOpacity; activeStyle.isFilled = obj.isFilled; }
            if (obj.shape !== undefined) activeStyle.pointShape = obj.shape; if (obj.width !== undefined) activeStyle.lineWidth = obj.width; if (obj.dash !== undefined) activeStyle.lineDash = obj.dash; if (obj.fontSize !== undefined) activeStyle.fontSize = obj.fontSize;
            
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
                if(t && !t.locked) {
                    if(t.content !== val || t.color !== activeStyle.strokeColor || t.fontSize !== activeStyle.fontSize) { 
                        t.content = val; t.color = activeStyle.strokeColor; t.fontSize = activeStyle.fontSize; 
                        hasChanged = true; processMath(t);
                    }
                }
            } else if (tempTextLogicalPos) { 
                const newText = { id: nextId++, x: tempTextLogicalPos.x, y: tempTextLogicalPos.y, content: val, color: activeStyle.strokeColor, fontSize: activeStyle.fontSize, z: globalZ++ };
                texts.push(newText); hasChanged = true; processMath(newText);
            }
        } else if (editingTextId) { deleteObject('text', editingTextId); hasChanged = true; }
        
        wysiwygText.style.display = 'none'; wysiwygText.innerText = ''; editingTextId = null; tempTextLogicalPos = null;
        if(hasChanged) { saveState(); draw(); }
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
        cropRect = {startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY};
        document.getElementById('export-popover').classList.remove('visible');
        return;
    }

    if (activePointers.size === 2) {
        isPanningView = true; const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        initialPinchCenter = { x: (pts[0].clientX + pts[1].clientX)/2, y: (pts[0].clientY + pts[1].clientY)/2 };
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
        currentLaserStroke.push({x: rawPos.x, y: rawPos.y, time: Date.now()});
        requestAnimationFrame(draw);
        return;
    }

    if (mode === 'eraser') { 
        if (clickedObj && clickedObj.type !== 'handle') { 
            const obj = getObjectById(clickedObj.type, clickedObj.id);
            if(obj && obj.locked) { showToast("Cet objet est verrouillé"); return; }
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
            points: [{x: actionPos.x, y: actionPos.y, p: pressure}], 
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
    else if (mode === 'segment' || mode === 'circle' || mode === 'rectangle') {
        let ptId = (clickedObj && clickedObj.type === 'point') ? clickedObj.id : nextId++;
        if (!clickedObj || clickedObj.type !== 'point') { points.push({ id: ptId, x: actionPos.x, y: actionPos.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++ }); saveState(); }

        if (creationStartPointId === null) { creationStartPointId = ptId; mouseLogicalPos = actionPos; }
        else {
            if (creationStartPointId !== ptId) {
                if (mode === 'segment') segments.push({ id: nextId++, p1_id: creationStartPointId, p2_id: ptId, color: activeStyle.strokeColor, width: activeStyle.lineWidth, dash: activeStyle.lineDash, arrowStart: activeStyle.arrowStart, arrowEnd: activeStyle.arrowEnd, z: globalZ++ });
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
            wysiwygText.style.lineHeight = '1.2';
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
        if(t.locked) return;
        editingTextId = t.id; 
        
        // NOUVEAU : On utilise innerHTML pour récupérer le gras/couleur sauvegardé !
        wysiwygText.innerHTML = t.content; 
        
        wysiwygText.style.display = 'block';
        wysiwygText.style.left = (t.x * zoom + panX) + 'px'; wysiwygText.style.top = (t.y * zoom + panY) + 'px'; 
        wysiwygText.style.fontFamily = 'sans-serif';
        wysiwygText.style.lineHeight = '1.2';
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
        const currentCenter = { x: (pts[0].clientX + pts[1].clientX)/2, y: (pts[0].clientY + pts[1].clientY)/2 };
        const zoomDelta = currentDist / initialPinchDist; let newZoom = initialZoom * zoomDelta;
        if (newZoom < 0.2) newZoom = 0.2; if (newZoom > 5) newZoom = 5;
        const mouseLogX = (currentCenter.x - initialPanX) / initialZoom; const mouseLogY = (currentCenter.y - initialPanY) / initialZoom;
        zoom = newZoom; document.getElementById('zoom-slider').value = zoom;
        panX = currentCenter.x - mouseLogX * zoom; panY = currentCenter.y - mouseLogY * zoom;
        updateWysiwygPosition();
        requestAnimationFrame(draw); return;
    }

    if (e.buttons === 0 && !activePointers.has(e.pointerId)) { isPanningView = false; isDraggingObjs = false; isDrawingFreehand = false; isSelectingBox = false; draggedHandle = null; activeGuides = {x:[], y:[]}; }
    
    if (mode === 'laser' && currentLaserStroke) {
        currentLaserStroke.push({x: rawPos.x, y: rawPos.y, time: Date.now()});
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
   //     smartPos = snapToGrid(rawPos.x, rawPos.y);
    }
    
    const isDrawingOrHovering = ['freehand', 'highlighter', 'segment', 'circle', 'rectangle', 'polygon', 'curve'].includes(mode);
    
    // --- VARIABLE POUR DÉSACTIVER L'AIMANTATION DES OUTILS ---
    const enableToolMagnetism = false; 

    // On a ajouté `enableToolMagnetism &&` ici :
    if (enableToolMagnetism && isDrawingOrHovering && !draggedWidget) {
        let toolSnap = null;
        const snapDist = 10 / zoom;
        const offset = activeStyle.lineWidth / 2; // <-- LE FAMEUX DÉCALAGE DE L'ÉPAISSEUR DE MINE
        
        if (activeWidgets.setsquare && widgets.setsquare) {
            const w = widgets.setsquare; const l = w.toLocal(rawPos.x, rawPos.y);
            if (l.x > 0 && l.x < w.width && Math.abs(l.y) < snapDist) toolSnap = w.toGlobal(l.x, -offset);
            else if (l.y > 0 && l.y < w.height && Math.abs(l.x) < snapDist) toolSnap = w.toGlobal(-offset, l.y);
            else if (l.x >= 0 && l.y >= 0 && Math.abs(l.y - (-w.height/w.width * l.x + w.height)) < snapDist) {
                const len = Math.hypot(w.height, w.width);
                const localProj = MathUtils.getProjectedPoint(l.x, l.y, {
                    constructor: {name: 'Segment'}, p1: {x: 0, y: w.height}, p2: {x: w.width, y: 0}
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
            currentFreehand.points.push({x: smartPos.x, y: smartPos.y, p: pressure}); 
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

    activeGuides = { x: [], y: [] };

  if (draggedHandle && selectedItems.length === 1 && (selectedItems[0].type === 'image' || selectedItems[0].type === 'text')) {
        const type = selectedItems[0].type;
        const obj = getObjectById(type, selectedItems[0].id); 
        if(!obj.locked) {
            if (draggedHandle === 'ROT') {
                let cx, cy;
                if (type === 'image') { cx = obj.x + obj.w / 2; cy = obj.y + obj.h / 2; }
                else { cx = (obj._cachedStartX || obj.x) + (obj._cachedW || 100) / 2; cy = obj.y + (obj._cachedH || 50) / 2; }
                obj.angle = Math.atan2(rawPos.y - cy, rawPos.x - cx) + Math.PI/2;
            } 
            else if (type === 'image') {
                const angle = obj.angle || 0;
                const dxRaw = rawPos.x - getRawLogicalPos({clientX: lastMouseX, clientY: lastMouseY}).x; 
                const dyRaw = rawPos.y - getRawLogicalPos({clientX: lastMouseX, clientY: lastMouseY}).y;
                
                const dx = Math.cos(-angle) * dxRaw - Math.sin(-angle) * dyRaw;
                const dy = Math.sin(-angle) * dxRaw + Math.cos(-angle) * dyRaw;

                const scaleX = obj.cw / obj.w; const scaleY = obj.ch / obj.h; 
                const natW = imageCache[obj.src].naturalWidth; const natH = imageCache[obj.src].naturalHeight;
                
                const keepRatio = obj.ratioLocked !== false; 
                const isCorner = ['TL', 'TR', 'BL', 'BR'].includes(draggedHandle);

                if (isCorner && keepRatio) {
                    const ratio = obj.w / obj.h; let newW = obj.w; let newH = obj.h;
                    if (draggedHandle.includes('R')) newW += dx; if (draggedHandle.includes('L')) newW -= dx;
                    newH = newW / ratio;
                    if (Math.abs(dy) > Math.abs(dx)) {
                        if (draggedHandle.includes('B')) newH = obj.h + dy; if (draggedHandle.includes('T')) newH = obj.h - dy;
                        newW = newH * ratio;
                    }
                    if (newW > 10 && newH > 10) {
                        if (draggedHandle.includes('L')) obj.x += (obj.w - newW); if (draggedHandle.includes('T')) obj.y += (obj.h - newH);
                        obj.w = newW; obj.h = newH;
                    }
                } else {
                    if (draggedHandle.includes('R')) { if (draggedHandle === 'R') { let nW = obj.w + dx; let nCW = obj.cw + dx * scaleX; if(nW>5 && obj.cx+nCW <= natW) { obj.w=nW; obj.cw=nCW; } } else { if (obj.w + dx > 5) obj.w += dx; } }
                    if (draggedHandle.includes('L')) { if (draggedHandle === 'L') { let nW = obj.w - dx; let nCX = obj.cx + dx * scaleX; let nCW = obj.cw - dx * scaleX; if(nW>5 && nCX>=0) { obj.x+=dx; obj.w=nW; obj.cx=nCX; obj.cw=nCW; } } else { if (obj.w - dx > 5) { obj.x += dx; obj.w -= dx; } } }
                    if (draggedHandle.includes('B')) { if (draggedHandle === 'B') { let nH = obj.h + dy; let nCH = obj.ch + dy * scaleY; if(nH>5 && obj.cy+nCH <= natH) { obj.h=nH; obj.ch=nCH; } } else { if (obj.h + dy > 5) obj.h += dy; } }
                    if (draggedHandle.includes('T')) { if (draggedHandle === 'T') { let nH = obj.h - dy; let nCY = obj.cy + dy * scaleY; let nCH = obj.ch - dy * scaleY; if(nH>5 && nCY>=0) { obj.y+=dy; obj.h=nH; obj.cy=nCY; obj.ch=nCH; } } else { if (obj.h - dy > 5) { obj.y += dy; obj.h -= dy; } } }
                }
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
        
        let dx = currentLog.x - getRawLogicalPos({clientX: lastMouseX, clientY: lastMouseY}).x; 
        let dy = currentLog.y - getRawLogicalPos({clientX: lastMouseX, clientY: lastMouseY}).y;

        let ptsToMove = new Set(); let txtsToMove = new Set(); let freehandsToMove = new Set(); let imgsToMove = new Set();
        selectedItems.forEach(item => {
            const obj = getObjectById(item.type, item.id);
            if(obj && obj.locked) return; 
            
            if(item.type === 'point') ptsToMove.add(item.id);
            else if(item.type === 'segment') { const s=getObjectById('segment',item.id); if(s){ptsToMove.add(s.p1_id); ptsToMove.add(s.p2_id);} }
            else if(item.type === 'circle') { const c=getObjectById('circle',item.id); if(c){ptsToMove.add(c.center_id); ptsToMove.add(c.edge_id);} }
            else if(item.type === 'rectangle') { const r=getObjectById('rectangle',item.id); if(r){ptsToMove.add(r.p1_id); ptsToMove.add(r.p2_id);} }
            else if(item.type === 'curve') { const cu=getObjectById('curve',item.id); if(cu){cu.points.forEach(p=>ptsToMove.add(p));} }
            else if(item.type === 'polygon') { const po=getObjectById('polygon',item.id); if(po){po.points.forEach(p=>ptsToMove.add(p));} }
            else if(item.type === 'text') txtsToMove.add(item.id); else if(item.type === 'freehand') freehandsToMove.add(item.id); else if(item.type === 'image') imgsToMove.add(item.id);
        });
        ptsToMove.forEach(pid => { const p=getObjectById('point',pid); if(p){p.x+=dx; p.y+=dy;} }); txtsToMove.forEach(tid => { const t=getObjectById('text',tid); if(t){t.x+=dx; t.y+=dy;} });
        freehandsToMove.forEach(fid => { const f=getObjectById('freehand',fid); if(f){f.points.forEach(pt=>{pt.x+=dx; pt.y+=dy;});} }); imgsToMove.forEach(iid => { const i=getObjectById('image',iid); if(i){i.x+=dx; i.y+=dy;} });
        
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
            points.push({id: p1Id, x: w.x, y: w.y, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
            
            const p2Id = nextId++;
            const rawAngle = Math.atan2(lastRawY - w.y, lastRawX - w.x);
            const px = w.x + Math.cos(rawAngle) * w.radius;
            const py = w.y + Math.sin(rawAngle) * w.radius;
            points.push({id: p2Id, x: px, y: py, color: activeStyle.strokeColor, shape: activeStyle.pointShape, z: globalZ++});
            
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
        points.forEach(p => { if(p.x>=minX && p.x<=maxX && p.y>=minY && p.y<=maxY) selectedItems.push({type:'point', id:p.id}); });
        texts.forEach(t => { if(t.x>=minX && t.x<=maxX && t.y>=minY && t.y<=maxY) selectedItems.push({type:'text', id:t.id}); });
        segments.forEach(s => { const p1=getObjectById('point',s.p1_id), p2=getObjectById('point',s.p2_id); if(p1&&p2 && p1.x>=minX&&p1.x<=maxX&&p1.y>=minY&&p1.y<=maxY && p2.x>=minX&&p2.x<=maxX&&p2.y>=minY&&p2.y<=maxY) selectedItems.push({type:'segment', id:s.id}); });
        circles.forEach(c => { const p=getObjectById('point',c.center_id); if(p && p.x>=minX&&p.x<=maxX&&p.y>=minY&&p.y<=maxY) selectedItems.push({type:'circle', id:c.id}); });
        rectangles.forEach(r => { const p1=getObjectById('point',r.p1_id), p2=getObjectById('point',r.p2_id); if (p1 && p2) { const rx1=Math.min(p1.x,p2.x), rx2=Math.max(p1.x,p2.x), ry1=Math.min(p1.y,p2.y), ry2=Math.max(p1.y,p2.y); if(rx1>=minX&&rx2<=maxX&&ry1>=minY&&ry2<=maxY) selectedItems.push({type:'rectangle', id:r.id}); } });
        curves.forEach(c => { let inside=true; c.points.forEach(pid=>{const p=getObjectById('point',pid); if(!p || p.x<minX||p.x>maxX||p.y<minY||p.y>maxY)inside=false;}); if(inside) selectedItems.push({type:'curve', id:c.id}); });
        polygons.forEach(po => { let inside=true; po.points.forEach(pid=>{const p=getObjectById('point',pid); if(!p || p.x<minX||p.x>maxX||p.y<minY||p.y>maxY)inside=false;}); if(inside) selectedItems.push({type:'polygon', id:po.id}); });
        freehands.forEach(f => { let inside=true; f.points.forEach(p=>{if(p.x<minX||p.x>maxX||p.y<minY||p.y>maxY)inside=false;}); if(inside) selectedItems.push({type:'freehand', id:f.id}); });
        images.forEach(img => { if(img.x>=minX && img.x+img.w<=maxX && img.y>=minY && img.y+img.h<=maxY) selectedItems.push({type:'image', id:img.id}); });
        if (selectedItems.length > 0) { updateStyleBarContext(); } draw();
    }

    if (isDraggingObjs || draggedHandle) { saveState(); isDraggingObjs = false; draggedHandle = null; activeGuides = {x:[], y:[]}; }
    if (isDrawingFreehand) { isDrawingFreehand = false; if(currentFreehand.points.length>1){ freehands.push(currentFreehand); saveState(); } currentFreehand = null; }
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
    const cX = canvas.width/2, cY = canvas.height/2; 
    panX = cX - (cX - panX) * (newZoom / zoom); 
    panY = cY - (cY - panY) * (newZoom / zoom); 
    zoom = newZoom; 
    updateWysiwygPosition();
    draw(); 
});

document.getElementById('grid-weight-slider').addEventListener('input', (e) => { gridWeight = parseFloat(e.target.value); draw(); });
const btnMagnet = document.getElementById('btn-magnet'); btnMagnet.addEventListener('click', () => { magnetMode = !magnetMode; btnMagnet.classList.toggle('active', magnetMode); draw(); });
document.getElementById('btn-cycle').onclick = () => { currentBgIndex = (currentBgIndex + 1) % backgrounds.length; draw(); };
const btnAxes = document.getElementById('btn-axes'); btnAxes.onclick = () => { showAxes = (showAxes + 1) % 3; btnAxes.classList.remove('active', 'active-1', 'active-2'); if(showAxes>0) btnAxes.classList.add('active', `active-${showAxes}`); draw(); };

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
        images.forEach(o => displayList.push({type: 'image', obj: o}));
        polygons.forEach(o => displayList.push({type: 'polygon', obj: o}));
        curves.forEach(o => displayList.push({type: 'curve', obj: o}));
        circles.forEach(o => displayList.push({type: 'circle', obj: o}));
        arcs.forEach(o => displayList.push({type: 'arc', obj: o}));
        rectangles.forEach(o => displayList.push({type: 'rectangle', obj: o}));
        segments.forEach(o => displayList.push({type: 'segment', obj: o}));
        freehands.forEach(o => displayList.push({type: 'freehand', obj: o}));
        points.forEach(o => displayList.push({type: 'point', obj: o}));
        texts.forEach(o => displayList.push({type: 'text', obj: o}));
        if (isDrawingFreehand && currentFreehand) {
            displayList.push({type: 'freehand', obj: currentFreehand});
        }
    
        displayList.sort((a, b) => (a.obj.z || 0) - (b.obj.z || 0));
        
        let hiddenPoints = new Set();
        segments.forEach(s => { if(s.arrowStart) hiddenPoints.add(s.p1_id); if(s.arrowEnd) hiddenPoints.add(s.p2_id); });
        curves.forEach(c => { if(c.points.length>1) { if(c.arrowStart) hiddenPoints.add(c.points[0]); if(c.arrowEnd) hiddenPoints.add(c.points[c.points.length-1]); } });

        displayList.forEach(item => {
            const obj = item.obj;
            const isSel = isSelected(item.type, obj.id);
            const isHov = hoveredObj && hoveredObj.type === item.type && hoveredObj.id === obj.id;
            const sc = isSel ? "#6c5ce7" : (isHov ? (mode==='eraser'?"#d63031":(isDarkMode?"#dfe6e9":"#b2bec3")) : null);
            if(sc && !isExportingTransparent) { ctx.shadowBlur = 10 * lw; ctx.shadowColor = sc; }
            
            const renderColor = (!isExportingTransparent && sc) ? sc : (obj.strokeColor || obj.color || (isDarkMode ? '#fff' : '#000'));

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
                    ctx.drawImage(imageCache[obj.src], obj.cx, obj.cy, obj.cw, obj.ch, -obj.w/2, -obj.h/2, obj.w, obj.h);
                }
                
                // 4. Dessiner le cadre de sélection et les poignées
                if (isSel && !isExportingTransparent) {
                    ctx.strokeStyle = "#6c5ce7"; 
                    ctx.lineWidth = lw * 2; 
                    const hw = 5 * lw; // Taille des poignées
                    
                    // Le cadre bleu principal
                    ctx.strokeRect(-obj.w/2, -obj.h/2, obj.w, obj.h);
                    
                    if(!obj.locked) {
                        ctx.fillStyle = "#ffffff";
                        // Dessin des 8 poignées de redimensionnement
                        const hx = [-obj.w/2, 0, obj.w/2, obj.w/2, obj.w/2, 0, -obj.w/2, -obj.w/2]; 
                        const hy = [-obj.h/2, -obj.h/2, -obj.h/2, 0, obj.h/2, obj.h/2, obj.h/2, 0];
                        for(let i=0; i<8; i++) { 
                            ctx.beginPath();
                            ctx.arc(hx[i], hy[i], hw, 0, Math.PI * 2);
                            ctx.fill(); ctx.stroke();
                        }

                        // Dessin de la poignée de ROTATION (au-dessus)
                        const rotY = -obj.h/2 - (30 * lw);
                        ctx.beginPath();
                        ctx.moveTo(0, -obj.h/2);
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
                        for(let i=1; i<obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
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
                        for(let i=1; i<obj.points.length; i++) { const p = getObjectById('point', obj.points[i]); if(p) ctx.lineTo(p.x, p.y); else valid = false; }
                        if (obj.isClosed !== false) ctx.closePath();
                        if(valid) {
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
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = renderColor; ctx.lineWidth = (obj.width || 3) * lw; setContextDash(ctx, obj.dash, lw); ctx.stroke(); ctx.setLineDash([]);
                    
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
            else if (item.type === 'point') {
                if (hiddenPoints.has(obj.id)) return;
                
                const s = lw * 4; ctx.beginPath();
                if (obj.shape === 'circle') { ctx.arc(obj.x, obj.y, s, 0, Math.PI * 2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'square') { ctx.rect(obj.x - s, obj.y - s, s*2, s*2); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'pixel') { ctx.rect(obj.x - 1.5*lw, obj.y - 1.5*lw, 3*lw, 3*lw); ctx.fillStyle = renderColor; ctx.fill(); }
                else if (obj.shape === 'cross') { ctx.lineWidth = lw * 2.5; ctx.moveTo(obj.x - s, obj.y - s); ctx.lineTo(obj.x + s, obj.y + s); ctx.moveTo(obj.x + s, obj.y - s); ctx.lineTo(obj.x - s, obj.y + s); ctx.strokeStyle = renderColor; ctx.stroke(); }
            }
           else if (item.type === 'text') {
            if (obj.id !== editingTextId) {
                // 1. Calculer la boîte englobante pour la rotation
                let w = 0, h = 0, startX = obj.x;
                if (obj.mathImg) {
                    w = obj.mathW; h = obj.mathH;
                } else {
                    ctx.font = `${obj.fontSize || 24}px ${obj.fontFamily || 'sans-serif'}`;
                    const cleanText = obj.content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ');
                    const lines = cleanText.split('\n');
                    lines.forEach(l => { const mw = ctx.measureText(l).width; if(mw>w) w=mw; });
                    h = lines.length * (obj.fontSize || 24) * 1.2;
                    const align = obj.align || 'left';
                    if (align === 'center') startX = obj.x - w / 2;
                    else if (align === 'right') startX = obj.x - w;
                }
                
                // On met en cache pour les hitzones !
                obj._cachedW = w; obj._cachedH = h; obj._cachedStartX = startX;

                ctx.save();
                const cx = startX + w / 2;
                const cy = obj.y + h / 2;
                ctx.translate(cx, cy);
                if (obj.angle) ctx.rotate(obj.angle);
                ctx.translate(-cx, -cy);

                if (obj.mathImg) {
                    ctx.shadowBlur = (!isExportingTransparent && sc) ? 10 * lw : 0; 
                    ctx.shadowColor = (!isExportingTransparent && sc) ? sc : "transparent";
                    ctx.drawImage(obj.mathImg, obj.x, obj.y, obj.mathW, obj.mathH);
                } else {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = obj.content;
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
                            if (node.hasAttribute && node.hasAttribute('color')) newStyle.color = node.getAttribute('color');
                            Array.from(node.childNodes).forEach(c => parseNode(c, newStyle));
                        }
                    }
                    Array.from(tempDiv.childNodes).forEach(c => parseNode(c, {}));
                    if (currentLine.length > 0 || lines.length === 0) lines.push(currentLine);

                    const align = obj.align || 'left';
                    const fontSize = obj.fontSize || 24; 
                    const fontFamily = obj.fontFamily || 'sans-serif';
                    const lineHeight = fontSize * 1.2;
                    let startY = obj.y + (fontSize * 0.1); 
                    ctx.textBaseline = 'top'; 
                    
                    const lineMetrics = lines.map(line => {
                        let w = 0; line.forEach(seg => { ctx.font = `${seg.style.italic ? 'italic ' : ''}${seg.style.bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`; w += ctx.measureText(seg.text).width; }); return w;
                    });

                    lines.forEach((line, i) => {
                        const lineWidth = lineMetrics[i];
                        let curX = obj.x;
                        if (align === 'center') curX = obj.x + (w / 2) - (lineWidth / 2);
                        else if (align === 'right') curX = obj.x + w - lineWidth;
                        
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
                ctx.shadowBlur = 0; 
                
                // Dessin de la sélection et du pointeur de rotation
                if (isSel && !isExportingTransparent) {
                    ctx.strokeStyle = "#6c5ce7"; ctx.lineWidth = lw * 2;
                    ctx.strokeRect(startX, obj.y, w, h);
                    if (!obj.locked) {
                        const rotY = obj.y - (30 * lw);
                        ctx.beginPath(); ctx.moveTo(cx, obj.y); ctx.lineTo(cx, rotY); ctx.stroke();
                        ctx.beginPath(); ctx.arc(cx, rotY, 6*lw, 0, Math.PI*2);
                        ctx.fillStyle = "#a29bfe"; ctx.fill(); ctx.stroke();
                    }
                }
                ctx.restore();
            }
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
            for(let i=1; i<currentPolygonPoints.length; i++) { const p = getObjectById('point', currentPolygonPoints[i]); if(p) ctx.lineTo(p.x, p.y); }
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
                if(pB && pA) {
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
            const startP = getObjectById('point', creationStartPointId); ctx.beginPath(); ctx.arc(startP.x, startP.y, Math.hypot(mouseLogicalPos.x - startP.x, mouseLogicalPos.y - startP.y), 0, Math.PI*2);
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
        if (mode === 'segment' && creationStartPointId && mouseLogicalPos) {
            const startP = getObjectById('point', creationStartPointId); ctx.beginPath(); ctx.moveTo(startP.x, startP.y); ctx.lineTo(mouseLogicalPos.x, mouseLogicalPos.y);
            ctx.strokeStyle = "rgba(108, 92, 231, 0.5)"; ctx.lineWidth = activeStyle.lineWidth * lw; setContextDash(ctx, activeStyle.lineDash, lw); ctx.stroke(); ctx.setLineDash([]);
            
            if(activeStyle.arrowStart) {
                const angle = Math.atan2(startP.y - mouseLogicalPos.y, startP.x - mouseLogicalPos.x);
                drawArrowHead(ctx, startP.x, startP.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowStart);
            }
            if(activeStyle.arrowEnd) {
                const angle = Math.atan2(mouseLogicalPos.y - startP.y, mouseLogicalPos.x - startP.x);
                drawArrowHead(ctx, mouseLogicalPos.x, mouseLogicalPos.y, angle, "rgba(108, 92, 231, 0.5)", activeStyle.lineWidth, lw, activeStyle.arrowEnd);
            }
        }

        if (activeGuides.x.length > 0 || activeGuides.y.length > 0) {
            ctx.strokeStyle = "#0984e3"; ctx.lineWidth = lw; ctx.setLineDash([4*lw, 4*lw]);
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
                    for(let i = 0; i < validPoints.length - 1; i++) {
                        const p1 = validPoints[i];
                        const p2 = validPoints[i+1];
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
                    ctx.beginPath(); ctx.arc(validPoints[0].x, validPoints[0].y, 3*lw, 0, Math.PI*2);
                    ctx.fillStyle = `rgba(231, 76, 60, ${Math.max(0, 1 - ((now - validPoints[0].time) / 1200))})`; ctx.fill();
                    
                    const lastP = validPoints[validPoints.length-1];
                    ctx.beginPath(); ctx.arc(lastP.x, lastP.y, 3*lw, 0, Math.PI*2);
                    ctx.fillStyle = `rgba(231, 76, 60, ${Math.max(0, 1 - ((now - lastP.time) / 1200))})`; ctx.fill();
                }
            });
            laserStrokes = laserStrokes.filter(stroke => stroke.length > 0 && now - stroke[stroke.length-1].time < 1200);
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

async function loadPdf(file) {
    showToast("Création des pages... Veuillez patienter.");
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

            let firstPageW = 0, firstPageH = 0; // Pour l'auto-zoom

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                
                // LA HAUTE DÉFINITION EST BIEN LÀ !
                const viewport = page.getViewport({scale: 2.5}); 
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = viewport.width; 
                tempCanvas.height = viewport.height;
                
                tempCtx.fillStyle = "white"; 
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                
                await page.render({canvasContext: tempCtx, viewport: viewport}).promise;
                
                const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85); 
                
                const targetIdx = startPageIdx + (i - 1);
                if (targetIdx >= pages.length) pages.push(createNewPage());
                
                await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const w = img.width; const h = img.height;
                        
                        // On mémorise la taille de la première page pour calculer le zoom global
                        if (i === 1) { firstPageW = w; firstPageH = h; }

                        const newImgObj = { id: nextId++, x: -w/2, y: -h/2, w: w, h: h, cx: 0, cy: 0, cw: w, ch: h, src: dataUrl, z: -999, isBg: true };
                        pages[targetIdx].images.push(newImgObj);
                        imageCache[dataUrl] = img;
                        resolve();
                    };
                    img.src = dataUrl;
                });
            }
            
            loadPage(startPageIdx);

            // --- L'AUTO-ZOOM SUR LE PDF EST ICI ---
            if (firstPageW > 0 && firstPageH > 0) {
                const padding = 50;
                const scaleX = canvas.width / (firstPageW + padding * 2);
                const scaleY = canvas.height / (firstPageH + padding * 2);

                zoom = Math.min(scaleX, scaleY);
                if (zoom < 0.1) zoom = 0.1;
                if (zoom > 5) zoom = 5;

                // Comme tu as placé l'image à x: -w/2, son centre est à 0,0.
                // Pour centrer 0,0 sur l'écran, c'est tout bête :
                panX = canvas.width / 2;
                panY = canvas.height / 2;

                // Mise à jour de l'interface (slider et bouton)
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
    
    if(importBtn && pdfLoader) {
        importBtn.addEventListener('click', () => pdfLoader.click());
        pdfLoader.addEventListener('change', (e) => { 
            const file = e.target.files[0]; 
            if(!file) return; 
            loadPdf(file); 
            e.target.value = ''; 
        });
    }
});

const textToolbar = document.getElementById('text-toolbar');

if (textToolbar) {
    // 1. CRUCIAL : On empêche TOUT clic de voler le focus de la zone de texte
    textToolbar.addEventListener('mousedown', (e) => {
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
                        if(t) t.align = alignMode; 
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
if (btnSizeUp) btnSizeUp.addEventListener('click', () => changeFontSize(1));
if (btnSizeDown) btnSizeDown.addEventListener('click', () => changeFontSize(-1));

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
        
        let topPos = rect.top - tbHeight - 15;
        if (topPos < 10) topPos = rect.bottom + 15; 
        
        textToolbar.style.left = rect.left + 'px';
        textToolbar.style.top = topPos + 'px';
    } else {
        textToolbar.style.display = 'none';
    }
}


// ===================================================
// WIDGET CALCULATRICE (FX-92 PRO)
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
    if(e.target === btnCalcClose) return;
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
                    sin: (a) => Math.sin(angleMode==='DEG' ? a*Math.PI/180 : a),
                    cos: (a) => Math.cos(angleMode==='DEG' ? a*Math.PI/180 : a),
                    tan: (a) => Math.tan(angleMode==='DEG' ? a*Math.PI/180 : a),
                    arcsin: (a) => (angleMode==='DEG' ? 180/Math.PI : 1) * Math.asin(a),
                    arccos: (a) => (angleMode==='DEG' ? 180/Math.PI : 1) * Math.acos(a),
                    arctan: (a) => (angleMode==='DEG' ? 180/Math.PI : 1) * Math.atan(a),
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
    if (previewBox) previewBox.innerHTML = '';
    
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
        const initialSvg = onChange(inputElements.map(i => i.value));
        if (initialSvg && previewBox) previewBox.innerHTML = initialSvg;
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
        let currentLeft = 20; 
        
        minimizedBars.forEach(bar => {
            bar.style.left = currentLeft + 'px';
            bar.style.top = '20px';
            bar.style.bottom = 'auto';
            bar.style.right = 'auto';
            bar.style.transform = 'none';
            currentLeft += 56; 
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
                // 1. Lire la position exacte actuelle à l'écran
                const rect = toolbar.getBoundingClientRect();
                
                // 2. Sauvegarder les styles d'origine
                toolbar.dataset.oldLeft = toolbar.style.left || '';
                toolbar.dataset.oldTop = toolbar.style.top || '';
                toolbar.dataset.oldBottom = toolbar.style.bottom || '';
                toolbar.dataset.oldRight = toolbar.style.right || '';
                toolbar.dataset.oldTransform = toolbar.style.transform || '';

                // 3. Forcer les positions en pixels absolus AVANT l'animation 
                // (Cela empêche la barre de s'étirer si elle était alignée à droite)
                toolbar.style.left = rect.left + 'px';
                toolbar.style.top = rect.top + 'px';
                toolbar.style.right = 'auto';
                toolbar.style.bottom = 'auto';
                toolbar.style.transform = 'none';

                // 4. Forcer le navigateur à appliquer ces coordonnées fixes avant de minimiser
                requestAnimationFrame(() => {
                    toolbar.classList.add('minimized');
                    localStorage.setItem('minimized_' + toolbarId, 'true');
                    updateDockPositions();
                });
                
                e.stopPropagation();
            });

            badgeBtn.addEventListener('click', (e) => {
                toolbar.classList.remove('minimized');
                
                // Restaurer la position d'origine
                toolbar.style.left = toolbar.dataset.oldLeft || '';
                toolbar.style.top = toolbar.dataset.oldTop || '';
                toolbar.style.bottom = toolbar.dataset.oldBottom || '';
                toolbar.style.right = toolbar.dataset.oldRight || '';
                toolbar.style.transform = toolbar.dataset.oldTransform || '';
                
                localStorage.setItem('minimized_' + toolbarId, 'false');
                updateDockPositions(); 
                e.stopPropagation();
            });
        }
    });

    setTimeout(updateDockPositions, 50); 
});

// =====================================
// --- GESTION DU MENU RAPIDE (SÉLECTION) ---
// =====================================

// --- GESTION DU MENU RAPIDE (SÉLECTION & COULEURS) ---
// =====================================
// --- GESTION DU MENU RAPIDE (SÉLECTION & COULEURS) ---
// =====================================

function updateQuickMenu() {
    const quickMenu = document.getElementById('quick-edit-menu');
    if (!quickMenu) return;

    // 1. Injection des pastilles de couleur (allégé)
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
            dot.style.width = '24px'; 
            dot.style.height = '24px'; 
            dot.style.borderRadius = '50%'; 
            dot.style.background = c; 
            dot.style.cursor = 'pointer'; 
            dot.style.flexShrink = '0';
            dot.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
            
            const handleColorChange = (e) => {
                e.preventDefault(); 
                e.stopPropagation();
                
                if (selectedItems.length === 1) {
                    const obj = getObjectById(selectedItems[0].type, selectedItems[0].id);
                    if (obj) {
                        // Uniquement pour les textes et formes simples
                        if (obj.strokeColor !== undefined) obj.strokeColor = c;
                        if (obj.color !== undefined) obj.color = c;
                        if (obj.fillColor && obj.isFilled) obj.fillColor = c;
                        
                        activeStyle.strokeColor = c; 
                        if (typeof updateColorIndicator === 'function') updateColorIndicator();
                        saveState(); draw(); updateQuickMenu(); 
                    }
                }
            };
            
            dot.onpointerdown = handleColorChange;
            dot.onclick = handleColorChange;
            colorContainer.appendChild(dot);
        });
        quickMenu.insertBefore(colorContainer, quickMenu.firstChild);
    }

    // 2. Affichage et positionnement du menu
    if (typeof selectedItems !== 'undefined' && selectedItems.length === 1) {
        const type = selectedItems[0].type;
        const obj = getObjectById(type, selectedItems[0].id);
        
        if (obj && ['image', 'text', 'point', 'polygon', 'rectangle', 'circle'].includes(type)) {
            let bx = obj.x, by = obj.y, bw = 0, bh = 0;
            if (type === 'image') { bx = obj.x; by = obj.y; bw = obj.w; bh = obj.h; }
            else if (type === 'text') { bx = obj._cachedStartX || obj.x; by = obj.y; bw = obj._cachedW || 100; bh = obj._cachedH || 50; }
            else { bw = 30; bh = 30; } 
            
            const screenX = (bx + bw / 2) * zoom + panX;
            const screenY = (by + bh) * zoom + panY + 20; 
            
            quickMenu.style.left = screenX + 'px';
            quickMenu.style.top = screenY + 'px';
            quickMenu.classList.add('visible');
            
            const btnRatio = document.getElementById('btn-quick-ratio');
            const iconRatio = document.getElementById('icon-quick-ratio');
            if (btnRatio && iconRatio) {
                if (type === 'image') {
                    btnRatio.style.display = 'flex';
                    if (obj.ratioLocked === false) { btnRatio.classList.add('active'); iconRatio.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`; } 
                    else { btnRatio.classList.remove('active'); iconRatio.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`; }
                } else btnRatio.style.display = 'none'; 
            }
            
            // 3. GESTION DE LA VISIBILITÉ DES COULEURS
            const colorContainer = document.getElementById('quick-colors-container');
            if (colorContainer) {
                // Si c'est un plugin (image), ON CACHE complètement les couleurs !
                if (type === 'image') {
                    colorContainer.style.display = 'none';
                } else {
                    // Sinon (Texte, Formes), on les affiche normalement
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
    draw = function() {
        originalDraw();
        updateQuickMenu();
    };
    window.hasInjectedQuickMenu = true;
}

// Ajout des événements une fois que le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    const btnRatio = document.getElementById('btn-quick-ratio');
    const btnDelete = document.getElementById('btn-quick-delete');
    
    if (btnRatio) {
        // Empêche le clic de "passer à travers" et de désélectionner l'image
        btnRatio.addEventListener('mousedown', (e) => e.stopPropagation()); 
        btnRatio.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedItems.length === 1) {
                const img = getObjectById(selectedItems[0].type, selectedItems[0].id);
                if (img) {
                    img.ratioLocked = img.ratioLocked === false ? true : false;
                    updateQuickMenu();
                    saveState();
                }
            }
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('mousedown', (e) => e.stopPropagation());
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            if (selectedItems.length > 0) {
                selectedItems.forEach(item => deleteObject(item.type, item.id));
                clearSelection();
                saveState(); draw();
            }
        });
    }
});

// Cacher le menu si on clique vraiment dans le vide sur le canvas
canvas.addEventListener('pointerdown', (e) => {
    const rawPos = getRawLogicalPos(e);
    const clickedObj = findObjectAt(rawPos.x, rawPos.y);
    if (!clickedObj && mode === 'pointer') {
        const quickMenu = document.getElementById('quick-edit-menu');
        if (quickMenu) quickMenu.classList.remove('visible');
    }
});

window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); });
canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw();
