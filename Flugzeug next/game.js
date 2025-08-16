// Grundlegende Spiel-Implementierung

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const LOGICAL_WIDTH = canvas.width;
const LOGICAL_HEIGHT = canvas.height;
const questionEl = document.getElementById('question');
const livesEl = document.getElementById('lives');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('overlay');
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restartBtn');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');

// Pause Status
let paused = false;

// Obere Sicherheitszone: Bereich für Frage / UI, dort dürfen weder Flugzeug noch Wolken fliegen
const TOP_SAFE_ZONE = 45; // halbiert (vorher 90) – logische Pixel (Canvas-Koordinaten)

// Responsive Canvas (Letterbox)
const FORCE_MIN_DPR = 2; // erzwinge mindestens 2x Rendering für schärfere Darstellung
function resize(){
  const ratio = LOGICAL_WIDTH / LOGICAL_HEIGHT;
  let w = window.innerWidth; let h = window.innerHeight;
  if(w/h > ratio){ w = h * ratio; } else { h = w / ratio; }
  const sysDpr = window.devicePixelRatio || 1;
  const dpr = Math.max(sysDpr, FORCE_MIN_DPR);
  canvas.width = Math.round(LOGICAL_WIDTH * dpr);
  canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
window.addEventListener('resize', resize); resize();

// Assets (Originalqualität ohne Manipulation)
const PLANE_DISPLAY_WIDTH = 126; // Anzeige-Breite
const PLANE_MIRRORED = true; // horizontal spiegeln
const planeImg = new Image();
let planeReady = false;
planeImg.onload = () => {
  planeReady = true;
  // SVG hat evtl. keine nativen width/height Pixel Maße vor Laden, wir nutzen Standard-ViewBox 320x160 falls 0
  const w = planeImg.naturalWidth || 320;
  const h = planeImg.naturalHeight || 160;
  const aspect = h / w;
  plane.w = PLANE_DISPLAY_WIDTH;
  plane.h = PLANE_DISPLAY_WIDTH * aspect;
  console.log('[Plane] SVG geladen', w,'x',h,'-> display',plane.w,'x',plane.h);
};
planeImg.src = 'flugzeug.svg?v=1';

// Hintergrundbild
const bgImg = new Image();
let bgReady = false;
bgImg.onload = () => { bgReady = true; };
bgImg.src = 'hintergrundbild.png?v=1';

function autoCrop(canvasSrc){
  const ctx2 = canvasSrc.getContext('2d');
  const {width:w,height:h} = canvasSrc;
  const imgData = ctx2.getImageData(0,0,w,h).data;
  let minX=w, minY=h, maxX=0, maxY=0; let found=false;
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4+3;
      if(imgData[i]>10){
        found=true;
        if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
      }
    }
  }
  if(!found) return canvasSrc;
  const cw = maxX-minX+1, ch = maxY-minY+1;
  const out = document.createElement('canvas'); out.width=cw; out.height=ch;
  out.getContext('2d').drawImage(canvasSrc,minX,minY,cw,ch,0,0,cw,ch);
  return out;
}

// Game State
let lives = 3;
let score = 0;
let currentQuestion = null;
let clouds = []; // aktuelle Antwortwolken
let gameOver = false;
let started = false; // wurde das Spiel (erste Runde) gestartet?
let questionIdCounter = 0;
let activeQuestionId = 0;
// Fragenreihenfolge (einmal alle ohne Wiederholung, danach neu gemischt)
let questionOrder = [];
let questionIndex = 0;
// Keine Verzögerungs-Variable mehr nötig, neue Frage kommt sofort
let timeElapsed = 0; // Gesamtzeit

// Plane
const plane = {
  x: LOGICAL_WIDTH * 0.35,
  y: LOGICAL_HEIGHT/2,
  w: 120,
  h: 60,
  vy: 0,
  speed: 420,
  angle: 0,
  targetAngle: 0,
};

// Lanes (4 mögliche vertikale Positionen)
// Berechnet nur einen normierten Lane-Faktor (0..3); tatsächliche y-Position hängt von Cloud-Höhe ab
function laneCenterY(laneIndex, cloudHeight){
  // Oben feste Sicherheitszone, unten 15% Rand frei lassen
  const bottomMargin = 0.15; // 15% unten frei
  const minCenter = TOP_SAFE_ZONE + cloudHeight/2 + 5; // etwas Abstand nach unten
  const maxCenter = LOGICAL_HEIGHT * (1 - bottomMargin) - cloudHeight/2;
  const usable = Math.max(20, maxCenter - minCenter);
  const step = usable / 3; // 4 Lanes => 3 Intervalle
  return minCenter + step * laneIndex;
}

// Textlayout (Mehrzeilig, bis zu 10 Zeilen, dynamische Schriftgröße)
function layoutCloudText(ctx, text, maxWidth, maxHeight, options={}){
  // Verbessertes Verfahren: Binäre Suche nach größter Schriftgröße, max 2 Zeilen, Wort-/Zeichen-Hyphenation.
  const maxLines = 2;
  const maxFont = options.maxFont || 24; // etwas kleinere Obergrenze für bessere Passung
  const minFont = options.minFont || 6;
  const lineSpacing = 1.08;
  const hPad = options.hPadding || 28;
  const vPad = options.vPadding || 12;
  const usableWidth = maxWidth - hPad;
  const usableHeight = maxHeight - vPad*2;

  function hyphenateWord(word, fs){
    // Naive Zeichen-Segmente mit Bindestrich wenn nötig
    ctx.font = `600 ${fs}px system-ui`;
    if(ctx.measureText(word).width <= usableWidth) return [word];
    const parts = [];
    let cur='';
    for(let i=0;i<word.length;i++){
      const ch = word[i];
      const test = cur + ch;
      if(ctx.measureText(test + '-').width <= usableWidth){
        cur = test;
      } else {
        if(cur.length){
          parts.push(cur + '-');
          cur = ch;
        } else {
          // Einzelnes Zeichen passt nicht mit '-' => ohne '-'
          parts.push(ch);
          cur='';
        }
      }
    }
    if(cur) parts.push(cur);
    return parts;
  }

  function wrap(fs){
    ctx.font = `600 ${fs}px system-ui`;
    const lineHeight = fs * lineSpacing;
    if(lineHeight > usableHeight) return null; // schon zu hoch
    const wordsRaw = text.trim().split(/\s+/).filter(Boolean);
    const tokens = [];
    for(const w of wordsRaw){
      if(ctx.measureText(w).width > usableWidth){
        const hy = hyphenateWord(w, fs);
        tokens.push(...hy);
      } else tokens.push(w);
    }
    let lines = [''];
    for(const tk of tokens){
      const candidate = lines[lines.length-1] ? lines[lines.length-1] + ' ' + tk : tk;
      if(ctx.measureText(candidate).width <= usableWidth){
        lines[lines.length-1] = candidate;
      } else {
        lines.push(tk);
        if(lines.length > maxLines) return null;
      }
    }
    // Höhe prüfen
    const totalH = lines.length * lineHeight;
    if(totalH > usableHeight) return null;
    return {lines, lineHeight};
  }

  // Binäre Suche nach größter funktionierender Schrift
  let lo = minFont, hi = maxFont, best = null;
  while(lo <= hi){
    const mid = Math.floor((lo+hi)/2);
    const fit = wrap(mid);
    if(fit){ best = { fs:mid, ...fit }; lo = mid + 1; } else { hi = mid - 1; }
  }
  if(best) return { fontSize: best.fs, lines: best.lines, lineHeight: best.lineHeight };
  // Fallback minimal
  const fs = minFont;
  const fw = wrap(fs) || {lines:[text.slice(0, Math.max(1, Math.min(20,text.length)))], lineHeight: fs*lineSpacing};
  return { fontSize: fs, lines: fw.lines, lineHeight: fw.lineHeight };
}

// Input
const keys = { ArrowUp:false, ArrowDown:false };
window.addEventListener('keydown', e=>{ 
  if(e.code in keys){ keys[e.code]=true; e.preventDefault(); }
  if(!started && e.code==='Enter'){ start(); }
  if(gameOver && e.code==='Enter'){ restart(); }
  if(started && !gameOver && (e.code==='KeyP' || e.code==='Space')){ togglePause(); }
});
window.addEventListener('keyup', e=>{ if(e.code in keys){ keys[e.code]=false; e.preventDefault(); }});
restartBtn.addEventListener('click', restart);
startBtn.addEventListener('click', start);

function shuffleQuestions(){
  const n = window.QUIZ_QUESTIONS.length;
  questionOrder = [...Array(n).keys()];
  // Fisher-Yates
  for(let i=n-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [questionOrder[i], questionOrder[j]] = [questionOrder[j], questionOrder[i]];
  }
  questionIndex = 0;
}
function nextQuestion(){
  if(!window.QUIZ_QUESTIONS || window.QUIZ_QUESTIONS.length===0){ return null; }
  if(questionIndex >= questionOrder.length){ shuffleQuestions(); }
  const q = window.QUIZ_QUESTIONS[ questionOrder[questionIndex] ];
  questionIndex++;
  return q;
}

function spawnClouds(append=false){
  activeQuestionId = ++questionIdCounter;
  currentQuestion = nextQuestion();
  if(!currentQuestion){ console.error('Keine Frage verfügbar'); return; }
  questionEl.textContent = currentQuestion.prompt;
  // Alle 4 Antworten anzeigen (vorher nur 3 -> lange Antworten konnten fehlen)
  const indices = [0,1,2,3].sort(()=>Math.random()-0.5);
  const laneOrder = [0,1,2,3].sort(()=>Math.random()-0.5); // jede Lane nutzen
  const rightMostExisting = clouds.length ? Math.max(...clouds.map(c=>c.x + c.w/2)) : 0;
  const CLOUD_SCALE = 0.85; // 15% kleiner
  const baseW = 220 * CLOUD_SCALE; // Einheitliche Wolkengröße
  const baseH = 88 * CLOUD_SCALE;
  const newClouds = indices.map((ansIdx,i)=>({
    text: currentQuestion.answers[ansIdx],
    correct: ansIdx === currentQuestion.correctIndex,
    lane: laneOrder[i],
    x: Math.max(LOGICAL_WIDTH + 80 + i*200, rightMostExisting + 160 + i*55),
    y: 0,
    w: baseW,
    h: baseH,
    speed: 220 + Math.random()*40,
    hit:false,
    alpha:1,
    qid: activeQuestionId,
    pop:0,
    active:true,
    persistent:false,
    fontSize: 26,
    lines: null,
    lineHeight: 0,
  }));
  // Text anpassen & y setzen
  const maxFont = 26; // etwas größer erlauben für bessere Lesbarkeit
  const minFont = 4; // noch kleinere Mindestgröße für sehr lange Wörter
  const padding = 28; // horizontaler Innenabstand
  newClouds.forEach(c=>{
    c.y = laneCenterY(c.lane, c.h);
  const layout = layoutCloudText(ctx, c.text, c.w, c.h, {maxFont, minFont, hPadding:padding, vPadding:12});
    c.fontSize = layout.fontSize;
    c.lines = layout.lines;
    c.lineHeight = layout.lineHeight;
  });
  if(append){
    // Nur neue hinzufügen
    clouds.push(...newClouds);
  } else {
    clouds = newClouds;
  }
  // Overlap nur innerhalb neuer Gruppe relevant; global vermeiden (sicher) -> einfache Prüfung
  preventOverlap();
}

function updateLivesUI(){
  livesEl.textContent = '❤'.repeat(lives) + ' '.repeat(3-lives);
}
function updateScoreUI(){
  scoreEl.textContent = 'Punkte: ' + score;
}

function start(){
  started = true;
  startScreen.classList.add('hidden');
  lives=3; score=0; gameOver=false; overlay.classList.add('hidden');
  updateLivesUI(); updateScoreUI();
  shuffleQuestions();
  spawnClouds();
}

function restart(){ start(); }

function togglePause(){ paused = !paused; }

// Collision AABB
function collides(a,b){
  // Einfache, robuste AABB auf Basis von Mittelpunkt + volle Breite/Höhe
  return Math.abs(a.x - b.x) <= (a.w + b.w)*0.5 && Math.abs(a.y - b.y) <= (a.h + b.h)*0.5;
}

let debugHitboxes = false;
window.addEventListener('keydown', e=>{
  if(e.code==='KeyH') debugHitboxes = !debugHitboxes;
});

let lastTime=0;
function loop(ts){
  const dt = (ts - lastTime)/1000 || 0; lastTime=ts;
  if(!gameOver && !paused){
    lastFrameDt = dt;
    update(dt);
  } else {
    lastFrameDt = 0; // Hintergrund scrollt nicht weiter
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function update(dt){
  timeElapsed += dt;
  // Plane movement
  if(keys.ArrowUp) plane.y -= plane.speed * dt;
  if(keys.ArrowDown) plane.y += plane.speed * dt;
  // Clamp
  plane.y = Math.max(TOP_SAFE_ZONE + plane.h/2 + 5, Math.min(LOGICAL_HEIGHT-40, plane.y));
  // Zielwinkel setzen
  if(keys.ArrowUp && !keys.ArrowDown) plane.targetAngle = -30; else if(keys.ArrowDown && !keys.ArrowUp) plane.targetAngle = 30; else plane.targetAngle = 0;
  // Glatte Interpolation
  plane.angle += (plane.targetAngle - plane.angle) * Math.min(1, dt*10);

  // Clouds movement
  let correctHit = false;
  for(const c of clouds){
    c.prevX = c.x;
    c.x -= c.speed * dt; // alle bewegen weiter
    if(c.active && !c.hit && collides(plane,c)){
      c.hit = true;
  c.hitTime = 0; // für visuellen Effekt
      if(c.correct){
        score++; updateScoreUI(); correctHit = true; // richtige Antwort
      } else {
        lives--; updateLivesUI();
        if(lives <= 0){ triggerGameOver(); return; }
        // keine Unterbrechung, damit mehrere (theoretisch) in einem Frame getroffen werden könnten
      }
    }
  }
  // Wolken recyceln solange richtige nicht getroffen
  if(!correctHit){
    // Jede Wolke, die links raus ist, wird rechts neu gespawnt (recycelt)
    for(const c of clouds){
      if(c.active && c.x + c.w < -150 && !c.hit){
        // Lane wählen, die nicht von der anderen aktiven Wolke benutzt wird
        const others = clouds.filter(o=>o!==c && !o.hit);
        let attempts=0;
        do {
          c.lane = Math.floor(Math.random()*4);
          attempts++;
        } while(others.some(o=>o.lane===c.lane) && attempts<10);
        // Y neu anhand Höhe justieren
        c.y = laneCenterY(c.lane, c.h);
  // Layout bei Recycling neu berechnen (falls dynamisch)
  const layout = layoutCloudText(ctx, c.text, c.w, c.h, {maxFont:26, minFont:4, hPadding:28, vPadding:12});
  c.fontSize = layout.fontSize;
  c.lines = layout.lines;
  c.lineHeight = layout.lineHeight;
        c.speed = 220 + Math.random()*40;
        // neue X-Position rechts vom weitesten Punkt
        const rightMost = Math.max(...clouds.map(cl=>cl===c?-Infinity:cl.x + cl.w/2));
  c.x = Math.max(LOGICAL_WIDTH + 100 + Math.random()*120, rightMost + c.w/2 + 120);
  // gegen Überlappung schieben
  preventOverlap();
      }
    }
  }
  if(correctHit){
    // Alte Wolken der vorherigen Frage deaktivieren (keine weiteren Treffer), aber sichtbar lassen
    // (sie laufen einfach aus dem Bildschirm). Richtige Wolke bleibt ebenso aktiv=false, damit kein zweiter Punkt.
    const lastQ = activeQuestionId; // wurde oben schon erhöht? nein, erst in spawnClouds
    // Deaktiviere alle bisherigen (die noch kein qid der neuen Frage haben, wird gleich erzeugt)
  for(const c of clouds){ if(c.qid === lastQ){ c.active = false; } }
    // Neue Frage anhängen
    spawnClouds(true);
  }

  // Treffer-Animationen (kurzer Flash) für alle getroffenen Wolken
  for(const c of clouds){
    if(c.hit && !c.correct){
      c.hitTime += dt; // falsche Wolke Blink-Dauer
    }
    if(c.hit && c.correct){
      c.hitTime += dt; // auch grüner Flash für kurze Zeit
    }
  }
  // Entferne alle inaktiven Wolken (egal ob richtig/falsch), sobald sie links raus sind
  clouds = clouds.filter(c=> !( !c.active && c.x + c.w < -200));
}

function triggerGameOver(){
  gameOver = true;
  messageEl.textContent = 'Game Over! Punkte: ' + score;
  overlay.classList.remove('hidden');
}

// Render
function render(){
  ctx.clearRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
  drawScrollingBackground();
  // Clouds
  for(const c of clouds){ drawCloud(c); }
  if(debugHitboxes){ drawHitboxes(); }
  // Plane mit Rotation
  ctx.save();
  ctx.translate(plane.x, plane.y);
  ctx.rotate(plane.angle * Math.PI/180);
  if(planeReady){
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if(PLANE_MIRRORED){ ctx.scale(-1,1); }
    ctx.drawImage(planeImg, -plane.w/2, -plane.h/2, plane.w, plane.h);
  } else {
    ctx.fillStyle='#f33'; ctx.fillRect(-plane.w/2, -plane.h/2, plane.w, plane.h);
  }
  ctx.restore();
  if(paused && !gameOver){
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
    ctx.fillStyle='#fff';
    ctx.font='48px system-ui';
    ctx.textAlign='center';
    ctx.fillText('PAUSE', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2);
    ctx.font='20px system-ui';
    ctx.fillText('P oder Space zum Fortsetzen', LOGICAL_WIDTH/2, LOGICAL_HEIGHT/2 + 40);
  }
}

// Background (parallax simple)
let bgOffset = 0; // Pixel-Verschiebung nach links
let lastFrameDt = 0; // für Scrollgeschwindigkeit
const BG_SCROLL_SPEED = 60; // px pro Sekunde
function drawScrollingBackground(){
  if(bgReady){
    const iw = bgImg.width, ih = bgImg.height;
    // Höhe ausfüllen, Breite proportional
    const scale = LOGICAL_HEIGHT / ih;
    const tileW = iw * scale;
    const tileH = LOGICAL_HEIGHT;
    // Offset updaten (frame-time-basiert)
    bgOffset -= BG_SCROLL_SPEED * lastFrameDt;
    if(bgOffset <= -tileW) {
      // bei mehreren Tile-Längen springen, falls großer dt
      bgOffset = bgOffset % tileW;
    }
    // Startposition (erste Kachel so, dass nahtlos gefüllt wird)
    let startX = bgOffset;
    while(startX > 0) startX -= tileW;
    for(let x = startX; x < LOGICAL_WIDTH; x += tileW){
      ctx.drawImage(bgImg, x, 0, tileW, tileH);
    }
    // Leichtes Overlay zur Kontrastverbesserung
    ctx.fillStyle='rgba(255,255,255,0.08)';
    ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
  } else {
    const grad = ctx.createLinearGradient(0,0,0,LOGICAL_HEIGHT);
    grad.addColorStop(0,'#4c9be2'); grad.addColorStop(1,'#b5ddff');
    ctx.fillStyle = grad; ctx.fillRect(0,0,LOGICAL_WIDTH,LOGICAL_HEIGHT);
  }
}

function drawCloud(c){
  ctx.save();
  ctx.translate(c.x, c.y);
  const w=c.w, h=c.h;
  let scale=1;
  if(c.hit){
    const t = Math.min(0.25, c.hitTime||0)/0.25;
    const bump = c.correct ? 0.3 : 0.25;
    scale = 1 + bump*(1-t);
  }
  ctx.scale(scale,scale);
  ctx.beginPath();
  ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  const grad = ctx.createLinearGradient(0,-h/2,0,h/2);
  if(c.hit){
    if(c.correct){ grad.addColorStop(0,'#d5ffe0'); grad.addColorStop(1,'#63f78e'); }
    else { grad.addColorStop(0,'#ffe3e3'); grad.addColorStop(1,'#ff9d9d'); }
  } else { grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#e6f1ff'); }
  ctx.fillStyle=grad;
  ctx.shadowColor='rgba(0,0,0,0.18)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4; ctx.fill();
  ctx.shadowColor='transparent';
  ctx.lineWidth = c.hit?4:2;
  ctx.strokeStyle = c.hit ? (c.correct? 'rgba(0,160,40,0.9)' : 'rgba(220,0,0,0.85)') : 'rgba(0,0,0,0.12)';
  ctx.stroke();
  // Text
  ctx.fillStyle = c.hit && !c.correct ? '#400' : '#222';
  const fs = c.fontSize || 26;
  ctx.font = `600 ${fs}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle';
  if(c.lines && c.lines.length){
    const totalH = c.lines.length * c.lineHeight;
    // Genau mittig: jede Zeile auf Mitte ihres Zeilenkastens
    for(let i=0;i<c.lines.length;i++){
      const line = c.lines[i];
      const cy = (i + 0.5) * c.lineHeight - totalH/2; // Mittelpunkt der Zeile relativ zu 0
      ctx.fillText(line, 0, cy);
    }
  } else {
    ctx.fillText(c.text,0,2);
  }
  ctx.restore();
}

function drawHitboxes(){
  ctx.save();
  ctx.lineWidth=1.5;
  for(const c of clouds){
    ctx.strokeStyle = c.correct? 'rgba(0,200,0,0.8)' : 'rgba(200,0,0,0.8)';
    ctx.strokeRect(c.x - c.w/2, c.y - c.h/2, c.w, c.h);
  }
  ctx.strokeStyle='rgba(255,255,0,0.9)';
  ctx.strokeRect(plane.x - plane.w/2, plane.y - plane.h/2, plane.w, plane.h);
  ctx.restore();
}

function roundedRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// Verhindern, dass Wolken sich überlappen (einfache Verschiebung nach rechts)
function preventOverlap(){
  let changed=true; let guard=0;
  while(changed && guard<10){
    changed=false; guard++;
    for(let i=0;i<clouds.length;i++){
      for(let j=i+1;j<clouds.length;j++){
        const a=clouds[i], b=clouds[j];
        // nur gleiche Lane kritisch (da vertikal getrennt sein soll)
        if(a.lane===b.lane){
          const minGap = (a.w/2 + b.w/2) + 80;
            if(Math.abs(a.x - b.x) < minGap){
              changed=true;
              if(a.x < b.x){ b.x = a.x + minGap; }
              else { a.x = b.x + minGap; }
            }
        }
      }
    }
  }
}

// Automatischer Start (für sofortige Sichtbarkeit des Spiels)
start();
