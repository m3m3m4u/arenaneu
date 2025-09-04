const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const DPR = Math.max(1, window.devicePixelRatio || 1);
const LOGICAL_W = canvas.width;
const LOGICAL_H = canvas.height;
canvas.width = LOGICAL_W * DPR;
canvas.height = LOGICAL_H * DPR;
canvas.style.width = LOGICAL_W + 'px';
canvas.style.height = LOGICAL_H + 'px';
ctx.scale(DPR, DPR);
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

// Layout / Lanes
const LANES = 4;
const ROAD_RATIO = 0.68; // Anteil der Canvasbreite der als Straße genutzt wird
const ROAD_WIDTH = LOGICAL_W * ROAD_RATIO;
const LANE_WIDTH = ROAD_WIDTH / LANES;
const LANE_START_X = (LOGICAL_W - ROAD_WIDTH) / 2; // zentriert

// Hilfsfunktion Mittelpunkt einer Lane
function laneCenter(l){ return LANE_START_X + l * LANE_WIDTH + LANE_WIDTH/2; }

// Car
// Auto etwas höher (mehr Platz unten zum Reagieren wenn Straße länger ist)
const CAR_TARGET_Y = LOGICAL_H * 0.8;
const CAR_SPEED_LERP = 0.18;
let CAR_WIDTH = 92;  // wird nach Bild-Load dynamisch gesetzt
let CAR_HEIGHT = 142; // Verhältnis wird angepasst

let carImage = null;
loadCar();

// Startwerte Auto (nach laneCenter definiert!)
let carLane = 1;
let carX = laneCenter(carLane);
let carY = CAR_TARGET_Y;
let desiredLane = carLane;

function loadCar() {
  const img = new Image();
  img.src = 'auto2.png?v=2';
  img.onload = () => {
    const targetWidth = LANE_WIDTH * 0.7;
    const aspect = (img.naturalHeight / img.naturalWidth) || 1.5;
    CAR_WIDTH = targetWidth;
    CAR_HEIGHT = targetWidth * aspect;
    carImage = beautifyCar(img, Math.ceil(window.devicePixelRatio||1)+1);
  };
  img.onerror = () => { console.warn('auto2.png konnte nicht geladen werden – verwende Platzhalter-Rechteck'); };
}

// Entfernt weißen / hellen Rand (Fringing) und erstellt hochauflösendes Canvas-Sprite
function beautifyCar(img, scaleFactor){
  try {
    // 1. Original in HighRes Offscreen zeichnen
    const srcW = img.naturalWidth, srcH = img.naturalHeight;
    const hiW = srcW * scaleFactor, hiH = srcH * scaleFactor;
    const hi = document.createElement('canvas'); hi.width = hiW; hi.height = hiH;
    const hictx = hi.getContext('2d');
    hictx.imageSmoothingEnabled = true; hictx.imageSmoothingQuality = 'high';
    hictx.drawImage(img,0,0,hiW,hiH);

    // 2. Pixel holen & Weiß-Freistellen + Rand-Entfernung
    const data = hictx.getImageData(0,0,hiW,hiH);
    const d = data.data;
    // Zuerst harte Entfernung sehr heller Pixel
    for(let i=0;i<d.length;i+=4){
      const r=d[i], g=d[i+1], b=d[i+2], a=d[i+3];
      if(a>0){
        const lum = (r+g+b)/3;
        if(lum>246){ d[i+3]=0; continue; }
        // Halbtransparente Aufheller -> Alphareduktion
        if(lum>235){ d[i+3] = Math.min(d[i+3], 90); }
      }
    }
    // 3. Rand-Korrektur: Pixel die hell & an Transparenz grenzen löschen
    const w=hiW, h=hiH;
    const idx=(x,y)=> (y*w + x)*4;
    const toClear = [];
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i = idx(x,y); const a=d[i+3]; if(a===0) continue;
        const r=d[i], g=d[i+1], b=d[i+2];
        const lum=(r+g+b)/3;
        if(lum>238){
          // Nachbarn prüfen
            let nearTrans=false;
            for(let ny=-1;ny<=1 && !nearTrans;ny++) for(let nx=-1;nx<=1 && !nearTrans;nx++) if(nx||ny){ if(d[idx(x+nx,y+ny)+3] < 30) nearTrans=true; }
            if(nearTrans) toClear.push(i);
        }
      }
    }
    for(const i of toClear){ d[i+3]=0; }
    hictx.putImageData(data,0,0);

    // 4. Downscale auf gewünschte Logikgröße (pro Frame skalieren wir nicht mehr)
    const finalCanvas = document.createElement('canvas');
    // Wir speichern im natürlichen (HighRes) Format und skalieren beim DrawImage -> so bleibt Schärfe
    finalCanvas.width = hiW; finalCanvas.height = hiH;
    finalCanvas.getContext('2d').drawImage(hi,0,0);
    const out = new Image(); out.src = finalCanvas.toDataURL();
    return out;
  } catch(e){
    console.warn('Beautify fehlgeschlagen', e);
    return img;
  }
}

// Farben / Antworten
const COLOR_MAP = [
  { name:'A', color:'#1e90ff'},
  { name:'B', color:'#ffb300'},
  { name:'C', color:'#6ecb3c'},
  { name:'D', color:'#ff4d4d'},
];

// Hindernisse
// Schmalere Hindernisse für mehr seitlichen Slalom-Spielraum
const OBSTACLE_WIDTH = LANE_WIDTH * 0.45; // schmaler für mehr seitlichen Platz
const OBSTACLE_HEIGHT = 74;
const OBSTACLE_SPEED_BASE = 285; // px/s

let currentQuestionIndex = 0;
let shuffledQuestions = [];
let score = 0;
let lives = 3;
let obstacles = [];
// Pro Lane Spawn-Cooldown für unregelmäßige Abstände
let laneCooldown = [];
const LANE_COOLDOWN_MIN = 0.80; // längere Mindestpause
const LANE_COOLDOWN_MAX = 1.90; // längere Max-Pause
const MAX_ACTIVE_OBSTACLES = 2; // noch mehr freie Lanes für Slalom
let gameOver = false;
let lastTime = performance.now();
let pendingGameOver = false;
let gameOverDelay = 0;

// Kollisions-/Bildschirm-Effekte
let shakeTime = 0; // Restzeit des Shakes
let shakeIntensity = 0;
let damageFlashTime = 0; // roter Screenflash bei falscher Antwort
let successFlashTime = 0; // grüner Flash bei richtiger Antwort
let carPulseTime = 0; // Puls beim Auto

// Partikel bei richtiger Antwort
let particles = [];
function spawnSuccessParticles(x,y,color){
  const count = 26;
  for(let i=0;i<count;i++){
    const a = Math.random()*Math.PI*2;
    const sp = 80 + Math.random()*260;
    particles.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 60, life:0.7+Math.random()*0.5, age:0, r:16+Math.random()*18, color, spin:(Math.random()*8-4) });
  }
}

// UI
const qEl = document.getElementById('questionText');
const answersEl = document.getElementById('answers');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const restartBtn = document.getElementById('restartBtn');

window.addEventListener('keydown', e=>{
  if(gameOver && e.key === 'Enter') restart();
  if(e.key === 'ArrowLeft') desiredLane = Math.max(0, desiredLane - 1);
  if(e.key === 'ArrowRight') desiredLane = Math.min(LANES-1, desiredLane + 1);
});
restartBtn.addEventListener('click', restart);

// --- Swipe / Touch Steuerung ---
let swipeStartX = null, swipeStartY = null, swipeTracking = false;
const SWIPE_MIN_DIST = 40; // Mindest-Pixel für Swipe
const SWIPE_DIR_RATIO = 1.2; // horizontale Dominanz gegenüber vertikal

function onPointerDown(e){
  if(gameOver) return; // im Game Over nicht reagieren
  swipeStartX = e.clientX; swipeStartY = e.clientY; swipeTracking = true;
}
function onPointerUp(e){
  if(!swipeTracking) return;
  const dx = e.clientX - swipeStartX; const dy = e.clientY - swipeStartY;
  const adx = Math.abs(dx); const ady = Math.abs(dy);
  if(adx >= SWIPE_MIN_DIST && adx > ady * SWIPE_DIR_RATIO){
    if(dx < 0) desiredLane = Math.max(0, desiredLane - 1); else desiredLane = Math.min(LANES-1, desiredLane + 1);
  }
  swipeTracking = false;
}
function onPointerMove(e){
  // optional: könnte man für Live-Vorschau nutzen; hier nicht nötig
}

canvas.addEventListener('pointerdown', onPointerDown, { passive:true });
canvas.addEventListener('pointerup', onPointerUp, { passive:true });
canvas.addEventListener('pointercancel', ()=> swipeTracking=false, { passive:true });
canvas.addEventListener('pointerleave', ()=> swipeTracking=false, { passive:true });
canvas.addEventListener('pointermove', onPointerMove, { passive:true });

function restart(){
  // Grundwerte
  score = 0; scoreEl.textContent = score;
  lives = 3; updateLives();
  // Game Over Flags & Verzögerungen
  gameOver = false; pendingGameOver = false; gameOverDelay = 0;
  // Effekte & Timers
  shakeTime = 0; shakeIntensity = 0; damageFlashTime = 0; successFlashTime = 0; carPulseTime = 0;
  // Partikel leeren
  particles = [];
  // Auto zurücksetzen (Lane wieder Mitte = 1)
  carLane = 1; desiredLane = carLane; carX = laneCenter(carLane); // carY bleibt auf CAR_TARGET_Y
  // Fragen neu mischen & erste setzen
  shuffleQuestions(); currentQuestionIndex = 0; setQuestionUI();
  // Eventuelle Flash-Klassen von Antwortreihen entfernen
  for(const row of answersEl.children){ row.classList.remove('flash-correct','flash-wrong'); }
  // Hindernisse frisch erzeugen
  initObstacles(true);
  // Restart Button verstecken
  restartBtn.hidden = true;
}

function shuffleQuestions(){
  shuffledQuestions = [...(window.QUIZ_QUESTIONS||[])];
  for(let i=shuffledQuestions.length-1;i>0;i--){
    const j = Math.random()*(i+1)|0; [shuffledQuestions[i], shuffledQuestions[j]]=[shuffledQuestions[j], shuffledQuestions[i]];
  }
}
function nextQuestion(){
  currentQuestionIndex++; if(currentQuestionIndex >= shuffledQuestions.length){ shuffleQuestions(); currentQuestionIndex=0; }
}

function setQuestionUI(){
  const q = shuffledQuestions[currentQuestionIndex];
  qEl.textContent = q.prompt;
  answersEl.innerHTML='';
  q.answers.forEach((ans,i)=>{
    const row = document.createElement('div'); row.className='answerRow';
    const box = document.createElement('div'); box.className='answerColor'; box.style.background = COLOR_MAP[i].color;
    const txt = document.createElement('div'); txt.className='answerText'; txt.textContent = ans;
    row.appendChild(box); row.appendChild(txt); answersEl.appendChild(row);
  });
}

function updateLives(){
  livesEl.innerHTML='';
  for(let i=0;i<lives;i++){ const s=document.createElement('span'); s.className='heart'; s.textContent='❤'; livesEl.appendChild(s); }
}

function initObstacles(initial=false){
  obstacles = [];
  laneCooldown = new Array(LANES).fill(0);
  if(initial){
    // Starte nur auf 2-3 zufälligen Lanes, damit gleich Slalom möglich
    const lanes = [...Array(LANES).keys()].sort(()=>Math.random()-0.5);
    const count = 2 + (Math.random()<0.5?1:0); // 2 oder 3
    for(let i=0;i<count;i++){
      const l = lanes[i];
      const y = - (OBSTACLE_HEIGHT + 80 + Math.random()*260);
      obstacles.push(makeObstacle(l, y));
    }
    // Sicherstellen, dass korrekte Lane existiert
    const q = shuffledQuestions[currentQuestionIndex];
    if(!obstacles.some(o=>o.lane===q.correctIndex)){
      obstacles.push(makeObstacle(q.correctIndex, - (OBSTACLE_HEIGHT + 120 + Math.random()*120)));
    }
  }
}

function makeObstacle(lane, y){
  const q = shuffledQuestions[currentQuestionIndex];
  return {
    lane,
    answerIndex: lane,
    isCorrect: lane === q.correctIndex,
    y,
    color: COLOR_MAP[lane].color,
    hit:false,
    removed:false,
    alpha:1
  };
}

function randomCooldown(){ return LANE_COOLDOWN_MIN + Math.random()*(LANE_COOLDOWN_MAX-LANE_COOLDOWN_MIN); }
function spawnNewForLane(lane){
  // Falls Cooldown noch läuft -> nichts
  if(laneCooldown[lane] > 0) return;
  // Globales Limit
  if(obstacles.length >= MAX_ACTIVE_OBSTACLES) return;
  // Bestimme höchste (negativste) Y dieser Lane um Mindestabstand sicherzustellen
  let topY = Infinity;
  for(const o of obstacles) if(o.lane===lane && !o.removed) topY = Math.min(topY, o.y);
  if(topY === Infinity) topY = LOGICAL_H; // Keine aktiven -> wir stehen frei
  // Mindestabstand nach oben
  const baseGap = 360 + Math.random()*400; // noch größere variable Lücke
  const y = Math.min(-OBSTACLE_HEIGHT - 40 - Math.random()*120, topY - baseGap);
  obstacles.push(makeObstacle(lane, y));
  // Setze direkt neuen Cooldown für nächste Erzeugung (erst aktiv wenn dieses raus ist)
  laneCooldown[lane] = randomCooldown();
}

function logic(dt){
  if(gameOver) return;
  const targetX = laneCenter(desiredLane); carX += (targetX - carX) * CAR_SPEED_LERP;
  const speed = OBSTACLE_SPEED_BASE;

  // Timers für Effekte
  if(shakeTime>0){ shakeTime -= dt; if(shakeTime<0) shakeTime=0; }
  if(damageFlashTime>0){ damageFlashTime -= dt; if(damageFlashTime<0) damageFlashTime=0; }
  if(successFlashTime>0){ successFlashTime -= dt; if(successFlashTime<0) successFlashTime=0; }
  if(carPulseTime>0){ carPulseTime -= dt; if(carPulseTime<0) carPulseTime=0; }

  // Cooldowns herunter zählen
  for(let l=0;l<LANES;l++) if(laneCooldown[l]>0) laneCooldown[l]-=dt;

  for(const o of obstacles){
    o.y += speed * dt;
    if(o.removed){ o.alpha -= dt*2.2; continue; }
    if(checkCollision(o)){
      if(o.isCorrect && !o.hit){
        o.hit = true; o.removed = true;
        flashAnswerRow(o.answerIndex,true); score++; scoreEl.textContent=score;
        successFlashTime = 0.35; carPulseTime = 0.45;
        const ox = laneCenter(o.lane); spawnSuccessParticles(ox, o.y + OBSTACLE_HEIGHT/2, o.color);
        nextQuestion(); setQuestionUI();
        const nq = shuffledQuestions[currentQuestionIndex];
        for(const other of obstacles){ if(!other.removed) other.isCorrect = (other.lane === nq.correctIndex); }
        if(!obstacles.some(p=>p.isCorrect && !p.removed)) spawnNewForLane(nq.correctIndex);
      } else if(!o.hit){
        o.hit = true; flashAnswerRow(o.answerIndex,false); lives--; updateLives();
  shakeTime = 0.45; shakeIntensity = 14; damageFlashTime = 0.35;
  if(lives<=0 && !pendingGameOver){ pendingGameOver=true; gameOverDelay=0.55; }
      }
    }
  }

  // Partikel aktualisieren
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i]; p.age += dt; if(p.age>=p.life){ particles.splice(i,1); continue; }
    p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 220*dt;
  }

  // Pending Game Over Verzögerung
  if(pendingGameOver && !gameOver){
    gameOverDelay -= dt;
    if(gameOverDelay <= 0){ gameOver=true; restartBtn.hidden=false; damageFlashTime=0; successFlashTime=0; shakeTime=0; shakeIntensity=0; }
  }

  // Entfernen & Respawn
  for(let i=obstacles.length-1;i>=0;i--){
    const o = obstacles[i];
    if(o.removed && o.alpha<=0){
      const lane = o.lane; obstacles.splice(i,1);
      // Startet neuen Cooldown bevor wieder etwas spawnt
      laneCooldown[lane] = randomCooldown();
      continue;
    }
    if(o.y > LOGICAL_H + 60){
      const lane = o.lane; obstacles.splice(i,1); laneCooldown[lane] = randomCooldown();
    }
  }

  // Nach Aufräumen versuchen neue zu erzeugen wenn Cooldowns abgelaufen
  // Priorität: korrekte Lane zuerst sicherstellen
  const q = shuffledQuestions[currentQuestionIndex];
  if(!obstacles.some(o=>o.isCorrect && !o.removed)){
    spawnNewForLane(q.correctIndex);
  }
  // Andere Lanes in zufälliger Reihenfolge prüfen, sofern Platz
  const laneOrder = [...Array(LANES).keys()].sort(()=>Math.random()-0.5);
  for(const l of laneOrder){
    if(obstacles.length >= MAX_ACTIVE_OBSTACLES) break;
    const active = obstacles.some(o=>o.lane===l);
    if(!active && laneCooldown[l]<=0){ spawnNewForLane(l); }
  }
}

function checkCollision(o){
  const carRect = { left:carX-CAR_WIDTH/2, right:carX+CAR_WIDTH/2, top:carY-CAR_HEIGHT/2, bottom:carY+CAR_HEIGHT/2 };
  const ox = laneCenter(o.lane) - OBSTACLE_WIDTH/2; const oy = o.y;
  const oRect = { left:ox, right:ox+OBSTACLE_WIDTH, top:oy, bottom:oy+OBSTACLE_HEIGHT };
  return !(carRect.right < oRect.left || carRect.left > oRect.right || carRect.bottom < oRect.top || carRect.top > oRect.bottom);
}

function flashAnswerRow(i, correct){
  const row = answersEl.children[i]; if(!row) return; row.classList.remove('flash-correct','flash-wrong'); void row.offsetWidth; row.classList.add(correct?'flash-correct':'flash-wrong');
}

function drawParticles(){
  for(const p of particles){
    const k = 1 - (p.age/p.life); const alpha = k*k; const r = p.r*(0.4+0.6*k);
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=p.color; ctx.translate(p.x,p.y); ctx.rotate(p.spin*p.age);
    ctx.beginPath(); ctx.moveTo(-r,0); ctx.lineTo(0,-r); ctx.lineTo(r*0.9,0); ctx.lineTo(0,r*0.9); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

function render(){
  ctx.clearRect(0,0,LOGICAL_W,LOGICAL_H);
  // Shake-Offset
  if(!gameOver && shakeTime>0){
    const f = shakeTime / 0.45; // normalisieren
    const mag = shakeIntensity * f*f; // easing out
    const ox = (Math.random()*2-1)*mag;
    const oy = (Math.random()*2-1)*mag;
    ctx.save(); ctx.translate(ox,oy);
  drawRoad(); drawCar(); drawObstacles(); drawParticles();
    ctx.restore();
  } else {
  drawRoad(); drawCar(); drawObstacles(); drawParticles();
  }
  if(damageFlashTime>0 && !gameOver){
    const a = (damageFlashTime/0.35)*0.55; ctx.fillStyle = 'rgba(255,0,0,'+a.toFixed(3)+')'; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);
  }
  if(successFlashTime>0){ const a=(successFlashTime/0.35)*0.45; ctx.fillStyle='rgba(0,255,120,'+a.toFixed(3)+')'; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); }
  if(gameOver){ ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H); ctx.fillStyle='#fff'; ctx.font='48px system-ui'; ctx.textAlign='center'; ctx.fillText('Game Over',LOGICAL_W/2,LOGICAL_H/2); ctx.font='24px system-ui'; ctx.fillText('Enter / Button = Neustart',LOGICAL_W/2,LOGICAL_H/2+40); }
}

function drawRoad(){
  // Hintergrund (Umgebung)
  ctx.fillStyle='#20351d'; // leicht grünlich für Wiese
  ctx.fillRect(0,0,LOGICAL_W,LOGICAL_H);

  // Randstreifen
  const shoulder = 18;
  ctx.fillStyle='#d9d9d9';
  ctx.fillRect(LANE_START_X - shoulder,0,shoulder,LOGICAL_H);
  ctx.fillRect(LANE_START_X + ROAD_WIDTH,0,shoulder,LOGICAL_H);

  // Straße
  ctx.fillStyle='#2c3038';
  ctx.fillRect(LANE_START_X,0,ROAD_WIDTH,LOGICAL_H);

  // Außenlinien
  ctx.strokeStyle='#ffffffdd';
  ctx.lineWidth=5;
  ctx.strokeRect(LANE_START_X+2.5,2.5,ROAD_WIDTH-5,LOGICAL_H-5);

  // Fahrbahnmarkierungen
  ctx.strokeStyle='#eeeeee99';
  ctx.lineWidth=4;
  ctx.setLineDash([34,34]);
  ctx.lineDashOffset = -(performance.now()/14);
  for(let l=1;l<LANES;l++){
    const x=LANE_START_X + l*LANE_WIDTH;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,LOGICAL_H); ctx.stroke();
  }
  ctx.setLineDash([]);
}
function drawCar(){
  ctx.save();
  ctx.translate(carX,carY);
  // Neigung nur während aktivem Spiel anzeigen; bei Game Over (inkl. Verzögerung) wieder gerade.
  let lean = 0;
  if(!gameOver && !pendingGameOver){
    const dx = (laneCenter(desiredLane) - carX);
    lean = dx * 0.0045;
  }
  ctx.rotate(lean);
  let scale=1;
  if(carPulseTime>0){
    const t=carPulseTime/0.45;
    scale=1+Math.sin((1-t)*Math.PI)*0.22*t;
  }
  ctx.scale(scale,scale);
  if(carImage){
    ctx.drawImage(carImage,-CAR_WIDTH/2,-CAR_HEIGHT/2,CAR_WIDTH,CAR_HEIGHT);
  } else {
    ctx.fillStyle='#c00';
    ctx.fillRect(-CAR_WIDTH/2,-CAR_HEIGHT/2,CAR_WIDTH,CAR_HEIGHT);
  }
  ctx.restore();
}
function drawObstacles(){
  for(const o of obstacles){
    const x=laneCenter(o.lane)-OBSTACLE_WIDTH/2; const y=o.y;
    ctx.save();
    ctx.globalAlpha = (o.removed? o.alpha : (o.hit?0.55:1));
    ctx.fillStyle=o.color;
  // Einheitlicher Rand ohne Hinweis auf richtige Lösung
  ctx.strokeStyle='#00000055';
  ctx.lineWidth=1.4;
    roundRect(ctx,x,y,OBSTACLE_WIDTH,OBSTACLE_HEIGHT,16); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
function drawParticles(){ for(const p of particles){ const k=1-(p.age/p.life); const alpha=k*k; const r=p.r*(0.4+0.6*k); ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle=p.color; ctx.translate(p.x,p.y); ctx.rotate(p.spin*p.age); ctx.beginPath(); ctx.moveTo(-r,0); ctx.lineTo(0,-r); ctx.lineTo(r*0.9,0); ctx.lineTo(0,r*0.9); ctx.closePath(); ctx.fill(); ctx.restore(); } }
// Textfunktionen nicht mehr benötigt, bleiben kommentiert für evtl. spätere Nutzung
// function wrapTextCentered(...) { }
// function breakTwoLines(...) { }
function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath(); }

function loop(t){ const dt=Math.min(0.033,(t-lastTime)/1000); lastTime=t; logic(dt); render(); requestAnimationFrame(loop); }
function init(){ shuffleQuestions(); currentQuestionIndex=0; updateLives(); setQuestionUI(); initObstacles(true); requestAnimationFrame(loop); }
init();
