const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const frageEl = document.getElementById('frage');
const antwortenEl = document.getElementById('antworten');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');

// Game state
let currentQuestionIndex = 0;
let score = 0;
let lives = 3;
let gameOver = false;
let projectiles = [];
let orbs = []; // moving colored circles representing answer colors
let spawnEntries = []; // aktuelle Spawn-Einträge für die aktive Frage
let gameTime = 0; // akkumulierte Zeit (Sekunden)
let questionSolved = false; // wurde die richtige Antwort dieser Frage getroffen?
let pendingNextQuestionIndex = null; // Fragewechsel am Frame-Ende ausführen
let input = { up:false, down:false, shoot:false };
let shootCooldown = 0;
let particles = []; // Partikel für Trefferfeedback
let isPaused = false;
let pauseOverlayEl = null;

const COLORS = {
  red: '#e53935',
  blue: '#1e88e5',
  green: '#43a047',
  yellow: '#fdd835',
  black: '#111'
};

const ship = {
  x: 70,
  y: canvas.height/2,
  r: 20,
  speed: 300,
};

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()* (i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}

let questionPool = []; // {idx, weight}

function initQuestionPool(){
  questionPool = window.QUIZ_QUESTIONS.map((q,i)=>({idx:i, weight:5}));
}
function pickNextQuestionIndex(){
  if(!questionPool.length) initQuestionPool();
  const total = questionPool.reduce((s,q)=>s+q.weight,0);
  let r = Math.random()*total;
  for(const q of questionPool){
    if(r < q.weight) return q.idx;
    r -= q.weight;
  }
  return questionPool[0].idx;
}
function increaseWeight(idx, amount){
  const e = questionPool.find(q=>q.idx===idx); if(e) e.weight = Math.min(e.weight + amount, 60);
}
function decreaseWeight(idx, factor){
  const e = questionPool.find(q=>q.idx===idx); if(e) e.weight = Math.max(e.weight * factor, 1);
}

function loadQuestion(idx){
  if(idx==null || idx>=window.QUIZ_QUESTIONS.length) idx = pickNextQuestionIndex();
  currentQuestionIndex = idx;
  questionSolved = false;
  const q = window.QUIZ_QUESTIONS[idx];
  frageEl.textContent = q.q;
  antwortenEl.innerHTML = '';
  q.answers.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'antwort color-'+a.color;
    div.textContent = a.text;
    antwortenEl.appendChild(div);
  });
  spawnEntries = q.answers.map((a,i)=>({
    color: a.color,
    correct: a.correct,
    laneIndex: i,
    nextSpawn: 0,
  }));
}

let baseOrbSpeed = 70; // langsamerer Start

function trySpawnEntries(){
  if(gameOver) return;
  const activeQuestionEntries = spawnEntries; // nur für aktuelle Frage
  const q = window.QUIZ_QUESTIONS[currentQuestionIndex];
  const spacing = canvas.height / ( (q?.answers?.length || 4) + 1 );
  activeQuestionEntries.forEach(entry=>{
    // Prüfen ob bereits ein Orb dieser Entry aktiv ist
    const hasOrb = orbs.some(o=> o.spawnEntry === entry);
    if(!hasOrb && gameTime >= entry.nextSpawn){
      // Orb erzeugen
      const y = spacing*(entry.laneIndex+1) + (Math.random()*30 - 15);
      const orb = {
        x: canvas.width + 40 + Math.random()*80,
        y,
        r: 22,
        color: entry.color,
        correct: entry.correct,
        speed: baseOrbSpeed + Math.random()*30,
        spawnEntry: entry,
  inert: false,
      };
      orbs.push(orb);
      // Nächster Spawn wird erst gesetzt wenn dieser Orb verschwindet
    }
  });
}

// Partikel-Logik
function spawnParticles(x,y,{count=14,spread=Math.PI*2,speedMin=60,speedMax=260,color='#fff',life=0.6,size=5}={}){
  for(let i=0;i<count;i++){
    const ang = Math.random()*spread;
    const spd = speedMin + Math.random()*(speedMax-speedMin);
    particles.push({
      x,y,
      vx: Math.cos(ang)*spd,
      vy: Math.sin(ang)*spd,
      life,
      maxLife: life,
      color,
      size: size * (0.6 + Math.random()*0.5)
    });
  }
}

function resetGame(){
  score = 0; lives = 3; gameOver = false; projectiles=[]; orbs=[]; currentQuestionIndex=0; baseOrbSpeed=70; gameTime=0; spawnEntries=[]; initQuestionPool(); loadQuestion(0);
}

function endGame(){
  gameOver = true;
  frageEl.textContent = 'Game Over! Punkte: '+score+ ' (R zum Neustart)';
  antwortenEl.innerHTML = '';
}

function shoot(){
  projectiles.push({x: ship.x+ship.r+4, y: ship.y, vx: 480, r:6});
}

window.addEventListener('keydown', e=>{
  if(e.code === 'ArrowUp' || e.code==='KeyW') input.up=true;
  if(e.code === 'ArrowDown'|| e.code==='KeyS') input.down=true;
  if(e.code === 'Space') input.shoot=true; // Space nur Schießen
  if(e.code === 'KeyP'){ togglePause(); }
  if(e.code === 'KeyR' && gameOver) { resetGame(); }
});
window.addEventListener('keyup', e=>{
  if(e.code === 'ArrowUp' || e.code==='KeyW') input.up=false;
  if(e.code === 'ArrowDown'|| e.code==='KeyS') input.down=false;
  if(e.code === 'Space') input.shoot=false;
});

function togglePause(){
  if(gameOver) return; // kein Pause im GameOver Screen
  isPaused = !isPaused;
  canvas.classList.toggle('paused', isPaused);
  const btn = document.getElementById('pauseBtn');
  if(btn){ btn.classList.toggle('active', isPaused); btn.textContent = isPaused? 'Weiter' : 'Pause'; }
  if(isPaused){
    if(!pauseOverlayEl){
      pauseOverlayEl = document.createElement('div');
      pauseOverlayEl.className = 'pause-overlay';
      pauseOverlayEl.textContent = 'PAUSE';
      document.body.appendChild(pauseOverlayEl);
    }
  } else {
    if(pauseOverlayEl){ pauseOverlayEl.remove(); pauseOverlayEl=null; }
  }
}

const pauseBtn = document.getElementById('pauseBtn');
if(pauseBtn){ pauseBtn.addEventListener('click', togglePause); }

function update(dt){
  if(gameOver || isPaused) return;

  // move ship
  if(input.up) ship.y -= ship.speed*dt;
  if(input.down) ship.y += ship.speed*dt;
  ship.y = Math.max(ship.r, Math.min(canvas.height-ship.r, ship.y));

  // shooting
  if(shootCooldown>0) shootCooldown -= dt;
  if(input.shoot && shootCooldown<=0){
    shoot();
    shootCooldown = 0.25; // fire rate
  }

  // individuelle Respawns prüfen
  trySpawnEntries();

  // move orbs
  orbs.forEach(o=>{ o.x -= o.speed*dt; });
  // remove off-screen orbs (und Respawn setzen wenn zur aktuellen Frage gehörig)
  orbs.forEach(o=>{
    if(o.x + o.r <= 0){
      if(!o.inert && spawnEntries.includes(o.spawnEntry)){
        o.spawnEntry.nextSpawn = gameTime + 1; // 1 Sekunde später
      }
      o._despawn = true;
    }
  });
  orbs = orbs.filter(o=> !o._despawn);

  // move projectiles
  projectiles.forEach(p=>{ p.x += p.vx*dt; });
  projectiles = projectiles.filter(p=> p.x - p.r < canvas.width);

  // particles
  particles.forEach(pt=>{
    pt.x += pt.vx*dt;
    pt.y += pt.vy*dt;
    pt.life -= dt;
    // leichte Verlangsamung
    pt.vx *= (1 - 1.5*dt);
    pt.vy *= (1 - 1.5*dt);
    pt.vy += 40*dt*0.3; // leichter Drift nach unten
  });
  particles = particles.filter(p=> p.life>0);

  // collisions projectile-orb
  let clearAllOrbsNow = false;
  projectiles.forEach(p=>{
    // Korrekte zuerst prüfen, damit in demselben Frame keine falsche Bestrafung passiert
    const orbsOrdered = [...orbs].sort((a,b)=>{
      if(a.correct === b.correct) return 0;
      return a.correct ? -1 : 1;
    });
    orbsOrdered.forEach(o=>{
      if(o.inert) return; // Schwarze (alte) Orbs ignorieren
      if(circleIntersect(p,o)){
        p._hit = true;
        o._hit = true;
  if(o.correct){
          questionSolved = true; // ab jetzt keine Herzabzüge mehr für diese Frage
          score += 1; scoreEl.textContent = score;
          decreaseWeight(currentQuestionIndex, 0.6);
          // Partikel (grün)
          spawnParticles(o.x,o.y,{color:'#4ade80',count:18,speedMin:90,speedMax:320,life:0.7,size:6});
          // Alle anderen Orbs sofort explodieren lassen und entfernen
          orbs.forEach(rem=>{ if(rem!==o){
            // Partikel-Explosion (grau)
            spawnParticles(rem.x, rem.y, { color:'#bbbbbb', count:14, speedMin:70, speedMax:220, life:0.5, size:5 });
            rem.inert = true; // bis zur Entfernung keine Kollisionen mehr
            rem._hit = true;  // im selben Frame herausfiltern
          }});
          clearAllOrbsNow = true; // zusätzliche Sicherheit: alles sofort weg
          // Fragewechsel ans Frame-Ende verschieben
          if(pendingNextQuestionIndex==null){ pendingNextQuestionIndex = pickNextQuestionIndex(); }
          canvas.classList.add('flash');
          setTimeout(()=>canvas.classList.remove('flash'),300);
        } else {
          if(!questionSolved){
            score -= 1; if(score<0) score=0; scoreEl.textContent = score;
          }
          // Kein Herzabzug mehr, wenn richtige Antwort bereits getroffen wurde
          if(!questionSolved){
            lives -= 1; livesEl.textContent = lives;
          }
          increaseWeight(currentQuestionIndex, 4);
          // Partikel (rot)
          spawnParticles(o.x,o.y,{color:'#ff4444',count:12,speedMin:70,speedMax:250,life:0.55,size:5});
          shake();
          if(lives<=0) endGame();
        }
      }
    });
  });
  projectiles = projectiles.filter(p=>!p._hit);
  if(clearAllOrbsNow){
    // Spawns verzögern und alle Orbs sofort leeren
    spawnEntries.forEach(e=>{ e.nextSpawn = gameTime + 1; });
    orbs.length = 0;
  }
  orbs.forEach(o=>{
    if(o._hit){
      if(spawnEntries.includes(o.spawnEntry)){
  o.spawnEntry.nextSpawn = gameTime + 1; // Respawn nach Treffer
      }
    }
  });
  orbs = orbs.filter(o=>!o._hit);

  // collisions ship - orb
  orbs.forEach(o=>{
    if(o.inert) return; // schwarze Orbs kollidieren nicht
    if(circleIntersect(ship,o)){
      if(!o.correct){
        if(!questionSolved){
          score -=1; if(score<0) score=0; scoreEl.textContent = score;
        }
        if(!questionSolved){
          lives -=1; livesEl.textContent = lives;
        }
        o._remove = true; shake();
        spawnParticles(o.x,o.y,{color:'#ff4444',count:16,speedMin:60,speedMax:260,life:0.6,size:6});
        if(spawnEntries.includes(o.spawnEntry)){
          o.spawnEntry.nextSpawn = gameTime + 1;
        }
        if(lives<=0) endGame();
      }
    }
  });
  orbs = orbs.filter(o=>!o._remove);

  // Fragewechsel erst, wenn alle Orbs der alten Runde verschwunden sind
  if(pendingNextQuestionIndex!=null && orbs.length===0){
    const nextIdx = pendingNextQuestionIndex; pendingNextQuestionIndex = null;
    loadQuestion(nextIdx);
  }
}

function shake(){
  canvas.classList.add('shake');
  setTimeout(()=>canvas.classList.remove('shake'),350);
}

function circleIntersect(a,b){
  const dx = a.x-b.x; const dy = a.y-b.y; const r = a.r + b.r; return dx*dx+dy*dy <= r*r;
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // background stars (simple)
  // (Could add more effects later)

  // ship
  drawShip();

  // projectiles
  ctx.fillStyle = '#fff';
  projectiles.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fill();
  });

  // orbs
  orbs.forEach(o=>{
    ctx.beginPath();
    let col = COLORS[o.color] || '#888';
    if(o.color==='black') col = '#555'; // graue Darstellung
    ctx.fillStyle = col;
    ctx.arc(o.x,o.y,o.r,0,Math.PI*2);
    ctx.fill();
    // outline if correct? (optional) remove for challenge
    // if(o.correct){ ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke(); }
  });

  // particles
  particles.forEach(pt=>{
    const alpha = Math.max(pt.life / pt.maxLife,0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x,pt.y,pt.size*alpha,0,Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  if(gameOver){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '48px Arial';
    ctx.textAlign='center';
    ctx.fillText('Game Over', canvas.width/2, canvas.height/2-20);
    ctx.font = '26px Arial';
    ctx.fillText('Punkte: '+score+' | Drücke R für Neustart', canvas.width/2, canvas.height/2+26);
  }
}

function drawShip(){
  // simple triangle ship
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.fillStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(-ship.r*0.8, -ship.r*0.6);
  ctx.lineTo(-ship.r*0.8, ship.r*0.6);
  ctx.lineTo(ship.r,0);
  ctx.closePath();
  ctx.fill();
  // (Cockpit entfernt)
  ctx.restore();
}

let lastTime = 0;
function loop(ts){
  if(!lastTime) lastTime = ts;
  const dt = Math.min(0.033, (ts-lastTime)/1000);
  lastTime = ts;
  gameTime += dt;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(loop);
