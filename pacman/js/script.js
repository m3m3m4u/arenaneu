// ======= Pac-Quiz mit Gegnern (statische Vorlage) =======
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Feste Grid-Dimensionen entsprechend der neuen Vorlage
const COLS = 21;
const ROWS = 20;
const tileSize = 40;

// Neue statische Vorlage (21 Spalten x 20 Zeilen)
const embeddedCSV=`1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1
1;A;A;A;A;A;1;1;1;1;1;1;1;1;1;B;B;B;B;B;1
1;A;A;A;A;A;0;0;0;0;0;0;0;0;0;B;B;B;B;B;1
1;A;A;A;A;A;1;0;1;1;0;1;1;0;1;B;B;B;B;B;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;1;G;0;0;0;0;0;0;0;0;0;0;0;0;0;0;G;0;1;1
1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1
1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1
1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1
1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1;1;0;1;1
1;1;G;0;0;0;0;0;0;0;0;0;0;0;0;0;0;G;0;1;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;1;0;1;1;1;1;0;1;1;0;1;1;0;1;1;1;1;0;1;1
1;C;C;C;C;C;1;0;1;1;0;1;1;0;1;D;D;D;D;D;1
1;C;C;C;C;C;0;0;0;0;0;0;0;0;0;D;D;D;D;D;1
1;C;C;C;C;C;1;1;1;1;1;1;1;1;1;D;D;D;D;D;1
1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1;1`;
// Maze parsen
let maze; // Array von Strings (Zeilen)
let ghostSpawnPoints=[]; // aus 'G' im Layout
function initMaze(){
    const lines=embeddedCSV.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length);
    canvas.width=COLS*tileSize; canvas.height=ROWS*tileSize;
    ghostSpawnPoints=[];
    maze=lines.map((line,rowIdx)=> line.split(/;|,/).map(c=>c.trim()).filter(c=>c.length).map((ch,colIdx)=>{
        if(ch==='G'){ ghostSpawnPoints.push({x:colIdx,y:rowIdx}); return '0'; }
        if(ch==='#') return '1';
        if(ch==='.') return '0';
        if('ABCD01'.includes(ch)) return ch;
        return '1';
    }).join(''));
}

// Fragen (Pool) – beliebig erweiterbar
const questions=[
    {id:0, question:'Ich lege das Besteck in ______ Lade. (Akkusativ)', answers:['die','das','der','dendendendendendendendendenden'], correct:0},
    // Weitere Beispiele / Platzhalter:
    {id:1, question:'Wir fahren morgen in ______ Stadt.', answers:['die','der','das','dendendendendendendendendenden'], correct:0},
    {id:2, question:'Er stellt das Glas auf ______ Tisch.', answers:['dem','den','der','des des des des des des des '], correct:1},
    {id:3, question:'Sie wohnt seit Jahren in ______ Schweiz.', answers:['den','der','die','des des des des des des des'], correct:1}
].map(q=>({...q, asked:0, correctCount:0, wrongCount:0, lastAsked:0}));
let currentQuestionIndex=null; // Index im questions Array

function pickNextQuestion(){
    if(!questions.length){ return null; }
    // Gewicht: (1 + wrongCount*2) / (1 + correctCount) mit Bonus für lange Nicht-Abfrage
    const now=performance.now();
    let totalWeight=0;
    const weights=questions.map((q,i)=>{
        // Minimale Cooldown: nicht direkt gleiche Frage, falls mehr als 1 Frage
        if(currentQuestionIndex!==null && questions.length>1 && i===currentQuestionIndex) return 0;
        const timeFactor = 1 + Math.min(3, (now - q.lastAsked)/15000); // bis zu x4 bei längerer Pause
        const w = ((1 + q.wrongCount*2) / (1 + q.correctCount)) * timeFactor;
        totalWeight += w; return w;
    });
    if(totalWeight===0){ // alle Gewichte 0 (z.B. nur eine Frage) -> fallback linear
        return currentQuestionIndex!==null ? currentQuestionIndex : 0;
    }
    let r=Math.random()*totalWeight;
    for(let i=0;i<weights.length;i++){
        r-=weights[i]; if(r<=0){ return i; }
    }
    return questions.length-1;
}

// Score & Leben
let score=0;
let lives=3;
function updateHUD(){
    const scoreEl=document.getElementById('score'); if(scoreEl) scoreEl.textContent=score;
    const livesEl=document.getElementById('lives');
    if(livesEl){
        livesEl.innerHTML='';
        for(let i=0;i<3;i++){
            const span=document.createElement('span');
            span.className='life'+(i>=lives?' lost':'');
            span.textContent='❤';
            livesEl.appendChild(span);
        }
    }
}

// Spieler
// Spieler: 20% schneller als Geister (Geister ~1.6 => Spieler ~1.92)
const player={tileX:10,tileY:Math.floor(ROWS/2),x:0,y:0,r:14,dir:{x:0,y:-1},nextDir:{x:0,y:-1},progress:0,speed:1.92,canTurn:true};
player.x=player.tileX*tileSize+tileSize/2; player.y=player.tileY*tileSize+tileSize/2;

// Räume finden
function detectRooms(){
    const letters=['A','B','C','D'];
    const info={}; letters.forEach(l=>info[l]={minX:Infinity,maxX:-1,minY:Infinity,maxY:-1});
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const ch=maze[r][c]; if(info[ch]){const o=info[ch]; o.minX=Math.min(o.minX,c);o.maxX=Math.max(o.maxX,c);o.minY=Math.min(o.minY,r);o.maxY=Math.max(o.maxY,r);} }
    return letters
        .filter(l=>info[l].maxX>=0)
        .map(l=>({letter:l,x:info[l].minX*tileSize,y:info[l].minY*tileSize,w:(info[l].maxX-info[l].minX+1)*tileSize,h:(info[l].maxY-info[l].minY+1)*tileSize}));
}

let answerZones=[];
let correctFlash=null; // {x,y,w,h,start,duration}
let answerCooldown=false;
let showCorrectUntil=0;
let lastCorrectRoomIndex=null; // 0..3 (Reihenfolge A,B,C,D)
let ignoreZoneIndexWhileInside=null; // (veraltet, optional)
let requireExitBeforeAnswer=false; // Spieler muss erst einmal komplett raus
let paused=false;
function setPaused(p){
    paused=p;
    const btn=document.getElementById('pauseBtn'); if(btn){ btn.classList.toggle('paused',paused); btn.textContent=paused?'Weiter':'Pause'; }
    const statusEl=document.getElementById('status');
    if(paused){ if(statusEl){ statusEl.textContent='PAUSE'; statusEl.style.color='#ffc107'; statusEl.style.fontSize='24px'; statusEl.style.fontWeight='700'; }}
    else { if(statusEl && statusEl.textContent==='PAUSE'){ statusEl.textContent=''; } }
}
function centerPlayer(){
    player.tileX=Math.floor(COLS/2);
    player.tileY=Math.floor(ROWS/2);
    if(player.tileX<0) player.tileX=0; if(player.tileX>=COLS) player.tileX=COLS-1;
    if(player.tileY<0) player.tileY=0; if(player.tileY>=ROWS) player.tileY=ROWS-1;
    player.progress=0;
    player.dir={x:0,y:-1};
    player.nextDir={x:0,y:-1};
    player.x=player.tileX*tileSize+tileSize/2;
    player.y=player.tileY*tileSize+tileSize/2;
}
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.random()* (i+1) |0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function loadQuestion(skipRecenter=false){
    if(currentQuestionIndex===null){ currentQuestionIndex = Math.floor(Math.random()*questions.length); }
    const q=questions[currentQuestionIndex];
    const qEl=document.getElementById('question'); if(qEl) qEl.textContent=q.question;
    const statusEl=document.getElementById('status'); if(statusEl){ statusEl.textContent=''; statusEl.style.color=''; statusEl.style.fontSize='18px'; statusEl.style.fontWeight='600'; }
    const rects=detectRooms(); // Index 0..3 = Räume A,B,C,D

    // Raum für richtige Antwort wählen (nicht derselbe wie lastCorrectRoomIndex)
    let allowedRoomIndices=[0,1,2,3];
    if(lastCorrectRoomIndex!=null){
        allowedRoomIndices=allowedRoomIndices.filter(i=>i!==lastCorrectRoomIndex);
    }
    const correctRoomIndex=allowedRoomIndices[Math.random()*allowedRoomIndices.length|0];

    // Reihenfolge der übrigen Antworten zufällig
    const answerIndices=[...q.answers.keys? q.answers.keys(): q.answers.map((_,i)=>i)];
    const answerIdxArr = Array.isArray(answerIndices)? answerIndices : Array.from(answerIndices);
    const correctAnswerOriginalIndex=q.correct;
    const otherAnswerIndices=answerIdxArr.filter(i=>i!==correctAnswerOriginalIndex);
    shuffle(otherAnswerIndices);

    // Räume außer correctRoomIndex
    const otherRooms=[0,1,2,3].filter(r=>r!==correctRoomIndex);
    shuffle(otherRooms);

    // Mapping answer -> room
    const mapping=[]; // {roomIndex, answerIndex}
    mapping.push({roomIndex:correctRoomIndex, answerIndex:correctAnswerOriginalIndex});
    for(let k=0;k<otherRooms.length;k++) mapping.push({roomIndex:otherRooms[k], answerIndex:otherAnswerIndices[k]});

    // answerZones in fixer Raumreihenfolge erzeugen
    answerZones = mapping.map(m=>({
        roomIndex: m.roomIndex,
        x: rects[m.roomIndex].x,
        y: rects[m.roomIndex].y,
        w: rects[m.roomIndex].w,
        h: rects[m.roomIndex].h,
        text: q.answers[m.answerIndex],
        correct: m.answerIndex===correctAnswerOriginalIndex
    }));

    // Sortierung optional egal; für Zeichnen spielt Reihenfolge keine Rolle
    if(!skipRecenter){
        centerPlayer();
        requireExitBeforeAnswer=false;
    } else {
        // Spieler bleibt stehen -> wenn noch in einem Raum, erst nach Verlassen werten
        const inside = answerZones.some(z=> player.x>z.x && player.x<z.x+z.w && player.y>z.y && player.y<z.y+z.h );
        requireExitBeforeAnswer = inside;
        ignoreZoneIndexWhileInside=lastCorrectRoomIndex; // legacy (nicht mehr zwingend genutzt)
    }
    answerCooldown=false; correctFlash=null; showCorrectUntil=0;
    updateHUD();
}

// Geister
const ghostColors=['#ff4081','#40c4ff','#ff9100','#8bc34a'];
function createGhost(tileX,tileY,color,type,speed){return{tileX,tileY,x:tileX*tileSize+tileSize/2,y:tileY*tileSize+tileSize/2,dir:{x:0,y:1},progress:0,speed,r:12,color,type,lastTileKey:`${tileX},${tileY}`,straightCount:0};}
let ghosts=[];
let ghostSpawns=[]; // aktuelle genutzte Spawnpunkte

function findRoomDoorTiles(){
    // Liefert Array von {letter, x, y, outwardDir:{x,y}}
    const roomsInfo=[];
    const letters=['A','B','C','D'];
    // Rekonstruiere Bounding Boxes ähnlich detectRooms
    const bounds={}; letters.forEach(l=>bounds[l]={minX:Infinity,maxX:-1,minY:Infinity,maxY:-1});
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const ch=maze[y][x]; if(bounds[ch]){ const b=bounds[ch]; b.minX=Math.min(b.minX,x); b.maxX=Math.max(b.maxX,x); b.minY=Math.min(b.minY,y); b.maxY=Math.max(b.maxY,y);} }
    for(const l of letters){ const b=bounds[l]; if(b.maxX<0) continue; // sollte nicht passieren
        // Suche Tür (ein einzelnes '0' innerhalb der Raumfläche)
        let door=null;
        for(let y=b.minY;y<=b.maxY;y++) for(let x=b.minX;x<=b.maxX;x++) if(maze[y][x]==='0') door={x,y};
        if(door){
            const outwardY = door.y < Math.floor(ROWS/2) ? 1 : -1; // oben -> nach unten, unten -> nach oben
            roomsInfo.push({letter:l,x:door.x,y:door.y,outwardDir:{x:0,y:outwardY}});
        }
    }
    return roomsInfo;
}

function computeGhostSpawns(){
    // Falls G-Positionen vorhanden, direkt verwenden (max 4)
    if(ghostSpawnPoints.length){
        return ghostSpawnPoints.slice(0,4);
    }
    const doors=findRoomDoorTiles();
    // Für jede Tür versuche 2 Schritte nach außen (falls frei), sonst 1, sonst Tür selbst
    const spawns=[];
    for(const d of doors){
        let sx=d.x, sy=d.y;
        const nx1=d.x+d.outwardDir.x, ny1=d.y+d.outwardDir.y;
        const nx2=nx1+d.outwardDir.x, ny2=ny1+d.outwardDir.y;
        if(tileChar(nx2,ny2)==='0') { sx=nx2; sy=ny2; }
        else if(tileChar(nx1,ny1)==='0'){ sx=nx1; sy=ny1; }
        spawns.push({x:sx,y:sy});
    }
    // Falls weniger als 4 (sollten 4 sein) ergänze zufällige Korridor-Kacheln
    if(spawns.length<4){
        for(let y=1;y<ROWS-1 && spawns.length<4;y++) for(let x=1;x<COLS-1 && spawns.length<4;x++) if(maze[y][x]==='0') spawns.push({x,y});
    }
    return spawns.slice(0,4);
}

function initGhosts(){
    ghostSpawns=computeGhostSpawns();
    // Typen + unterschiedliche Geschwindigkeiten (alle < Spieler)
    const baseSpeeds=[1.55,1.5,1.45,1.6];
    ghosts=ghostSpawns.map((s,i)=>createGhost(s.x,s.y,ghostColors[i%ghostColors.length],i,baseSpeeds[i%baseSpeeds.length]));
    // Anfangsrichtung: nach außen bewegen (anhand Tür-Outward falls passend sonst standard nach unten)
    const doors=findRoomDoorTiles();
    ghosts.forEach(g=>{
        const match=doors.find(d=>Math.abs(d.x-g.tileX)+Math.abs(d.y-g.tileY)<=2);
        if(match) g.dir={...match.outwardDir};
    });
}
function resetGhosts(){
    if(!ghostSpawns.length) ghostSpawns=computeGhostSpawns();
    ghosts.forEach((g,i)=>{ const s=ghostSpawns[i%ghostSpawns.length]; g.tileX=s.x; g.tileY=s.y; g.progress=0; g.dir={x:0,y:1}; g.x=g.tileX*tileSize+tileSize/2; g.y=g.tileY*tileSize+tileSize/2; g.straightCount=0; });
}
function fullRestartAfterCollision(){
    lives--;
    updateHUD();
    if(lives<=0){
        const statusEl=document.getElementById('status'); if(statusEl){ statusEl.textContent='Game Over'; statusEl.style.color='#ff5252'; }
        setTimeout(()=>{ lives=3; score=0; currentQuestion=0; loadQuestion(); centerPlayer(); resetGhosts(); },1800);
        return;
    }
    // Keine Textausgabe pro Leben mehr
    centerPlayer(); resetGhosts(); player.canTurn=true;
}
function tileChar(x,y){ if(x<0||x>=COLS||y<0||y>=ROWS) return '1'; return maze[y][x]; }
function canEnter(tx,ty){ return tileChar(tx,ty)!=='1'; }
// Für Geister nur reine Gänge '0' erlaubt, keine Antwort-Räume A-D
function ghostCanEnter(tx,ty){ return tileChar(tx,ty)==='0'; }
function ghostDirsAvailable(tx,ty,forbid){
    const list=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    const res=list.filter(d=>{ if(forbid && d.x===-forbid.x && d.y===-forbid.y) return false; return ghostCanEnter(tx+d.x,ty+d.y); });
    return res;
}
function chooseDir(g){
    const opts=ghostDirsAvailable(g.tileX,g.tileY,g.dir);
    if(!opts.length) return g.dir;
    if(opts.length===1) return opts[0];
    // Zieldefinitionen
    const playerTarget={x:player.tileX,y:player.tileY};
    let target;
    switch(g.type){
        case 0: // Chaser: direkt auf Spieler
            target=playerTarget; break;
        case 1: // Ambusher: 4 Felder voraus in Spieler-Richtung
            target={x:player.tileX+player.dir.x*4,y:player.tileY+player.dir.y*4}; break;
        case 2: // Random: leichtes Vermeiden der letzten Tile
            return opts[Math.random()*opts.length|0];
        case 3: // Evader: weg vom Spieler
            target=playerTarget; break;
    }
    // Scoring
    let best=opts[0], bestScore=Infinity;
    for(const d of opts){
        const nx=g.tileX+d.x, ny=g.tileY+d.y;
        let score;
        if(g.type===3){ // Evader maximiert Abstand
            score = -((nx-playerTarget.x)**2 + (ny-playerTarget.y)**2);
        } else {
            const tx=target.x, ty=target.y;
            score = (nx-tx)**2 + (ny-ty)**2;
        }
        // stärkere Zufallsstreuung für mehr Varianten
        score *= (0.8+Math.random()*0.4);
        // Bonus: bevorzuge Kurven gelegentlich (erhöhe Score von straight leicht, damit andere attraktiver)
        if(d.x===g.dir.x && d.y===g.dir.y && Math.random()<0.3) score*=1.15;
        if(score<bestScore){bestScore=score; best=d;}
    }
    // Mit kleiner Wahrscheinlichkeit komplett zufällige Kurve erzwingen (falls mehr als 2 Optionen)
    if(opts.length>=2 && Math.random()<0.12){
        const nonStraight = opts.filter(d=>!(d.x===g.dir.x && d.y===g.dir.y));
        if(nonStraight.length) return nonStraight[Math.random()*nonStraight.length|0];
    }
    return best;
}
function moveGhost(g){
    const CENTER_TOL=0.001;
    // Falls durch Gleitkommazahlen progress nahe 0: normalisieren
    if(g.progress<CENTER_TOL) g.progress=0;
    if(g.progress===0){
        const forwardOpen=ghostCanEnter(g.tileX+g.dir.x,g.tileY+g.dir.y);
        const opts=ghostDirsAvailable(g.tileX,g.tileY,g.dir); // ohne Rückwärts
        const atJunction=opts.length>1;
        if(!forwardOpen && opts.length===0){ // Dead-End -> 180°
            g.dir={x:-g.dir.x,y:-g.dir.y}; g.straightCount=0;
        } else if(!forwardOpen){
            g.dir=chooseDir(g); g.straightCount=0;
        } else if(atJunction){
            const nonStraight=opts.filter(d=>!(d.x===g.dir.x && d.y===g.dir.y));
            if((g.straightCount>=4 && nonStraight.length) || (Math.random()<0.35 && nonStraight.length)){
                g.dir=nonStraight[Math.random()*nonStraight.length|0]; g.straightCount=0;
            } else {
                const old=g.dir; g.dir=chooseDir(g); if(!(g.dir.x===old.x && g.dir.y===old.y)) g.straightCount=0; }
        } else {
            // Geradeaus, aber kleine Chance (10%) an langem Gang abzubiegen wenn seitlicher Weg da (dazu Optionen inkl Rückwärts prüfen)
            if(g.straightCount>=6){
                const sideCandidates=[{x:g.dir.y,y:-g.dir.x},{x:-g.dir.y,y:g.dir.x}].filter(d=>ghostCanEnter(g.tileX+d.x,g.tileY+d.y));
                if(sideCandidates.length && Math.random()<0.10){ g.dir=sideCandidates[Math.random()*sideCandidates.length|0]; g.straightCount=0; }
            }
        }
    }
    g.progress+=g.speed;
    if(g.progress>=tileSize){
        // Tile abgeschlossen
        g.tileX+=g.dir.x; g.tileY+=g.dir.y; g.lastTileKey=`${g.tileX},${g.tileY}`; g.progress=0;
        if(!g.prevDir || (g.prevDir.x===g.dir.x && g.prevDir.y===g.dir.y)) g.straightCount++; else g.straightCount=0;
        g.prevDir={x:g.dir.x,y:g.dir.y};
    }
    if(tileChar(g.tileX,g.tileY)!=='0'){ // Korrektur falls in Raum geraten
        g.tileX-=g.dir.x; g.tileY-=g.dir.y; g.progress=0; g.dir={x:0,y:1}; g.straightCount=0;
    }
    g.x=g.tileX*tileSize+tileSize/2+g.dir.x*g.progress;
    g.y=g.tileY*tileSize+tileSize/2+g.dir.y*g.progress;
}
function checkGhostCollision(){
    for(const g of ghosts){
        const dx=g.x-player.x, dy=g.y-player.y;
        if(dx*dx+dy*dy < (g.r+player.r-4)**2){
            const statusEl=document.getElementById('status'); if(statusEl){ statusEl.textContent='Kollision! Neustart'; statusEl.style.color='#ff9800'; }
            fullRestartAfterCollision();
            break;
        }
    }
}

// Input
addEventListener('keydown',e=>{const k=e.key; if(k==='ArrowUp')player.nextDir={x:0,y:-1}; else if(k==='ArrowDown')player.nextDir={x:0,y:1}; else if(k==='ArrowLeft')player.nextDir={x:-1,y:0}; else if(k==='ArrowRight')player.nextDir={x:1,y:0}; else if(k==='g'||k==='G') showGrid=!showGrid; else if(k==='p'||k==='P'||k===' '){ setPaused(!paused); }});
window.addEventListener('load',()=>{ const btn=document.getElementById('pauseBtn'); if(btn){ btn.onclick=()=>setPaused(!paused); }});

// On-Screen-Steuerung (Buttons)
function bindControlButton(id, dir){
    const el=document.getElementById(id);
    if(!el) return;
    const apply=()=>{ player.nextDir = dir; };
    el.addEventListener('click', apply);
    el.addEventListener('touchstart', (e)=>{ e.preventDefault(); apply(); }, { passive:false });
}
bindControlButton('btnUp',    {x:0,y:-1});
bindControlButton('btnDown',  {x:0,y: 1});
bindControlButton('btnLeft',  {x:-1,y:0});
bindControlButton('btnRight', {x:1,y: 0});

function update(){
    if(paused) return; // Spielzustand einfrieren
    const EPS=0.001;
    // Spielerbewegung (Tile-basiert, Bounce nur im Zentrum)
        if(player.progress<=EPS){
        // Wunschrichtung übernehmen wenn frei
            if(player.canTurn){
                const nd=player.nextDir;
                if(canEnter(player.tileX+nd.x,player.tileY+nd.y)) player.dir={...nd};
            }
        // Vorwärts blockiert? -> Bounce 180° falls rückwärts frei
        if(!canEnter(player.tileX+player.dir.x,player.tileY+player.dir.y)){
            const backX=player.tileX-player.dir.x, backY=player.tileY-player.dir.y;
            if(canEnter(backX,backY)){
                    player.dir={x:-player.dir.x,y:-player.dir.y};
                    player.canTurn=false; // Sperre bis Tile verlassen
                    player.nextDir={...player.dir}; // Eingaben ignorieren diese Runde
            } else {
                // völlig blockiert -> stehen
                player.x=player.tileX*tileSize+tileSize/2; player.y=player.tileY*tileSize+tileSize/2; return;
            }
        }
    }
    // Fortschritt
    player.progress += player.speed;
    if(player.progress >= tileSize){
        // Wir überschreiten die Tile-Grenze -> exakt ins nächste Zentrum setzen (keinen Rest behalten für saubere Steuerung)
        // Ziel testen
        const nTx=player.tileX+player.dir.x, nTy=player.tileY+player.dir.y;
            if(canEnter(nTx,nTy)){
                player.tileX=nTx; player.tileY=nTy; player.progress=0; player.canTurn=true; // nach Verlassen wieder drehen erlaubt
        } else {
            // Bounce: Richtung invertieren, im selben Tile bleiben
            player.dir={x:-player.dir.x,y:-player.dir.y};
            player.progress=0; // zentrieren
                player.canTurn=false; player.nextDir={...player.dir};
        }
    }
    player.x=player.tileX*tileSize+tileSize/2 + player.dir.x*player.progress;
    player.y=player.tileY*tileSize+tileSize/2 + player.dir.y*player.progress;
    // Antworten
    if(!answerCooldown && !requireExitBeforeAnswer){
        for(const z of answerZones){
            if(player.x>z.x && player.x<z.x+z.w && player.y>z.y && player.y<z.y+z.h){
                if(z.correct){
                    score+=1;
                    answerCooldown=true;
                    correctFlash={x:z.x,y:z.y,w:z.w,h:z.h,start:performance.now(),duration:650};
                    showCorrectUntil=performance.now()+650;
                    const statusEl=document.getElementById('status');
                    if(statusEl){
                        statusEl.textContent='Richtig! +1';
                        statusEl.style.color='#76ff03';
                        statusEl.style.fontWeight='700';
                        statusEl.style.fontSize='26px';
                    }
                    setTimeout(()=>{
                        // Statistik aktualisieren
                        const qObj=questions[currentQuestionIndex];
                        qObj.correctCount++; qObj.asked++; qObj.lastAsked=performance.now();
                        // Nächste Frage auswählen
                        currentQuestionIndex = pickNextQuestion();
                        lastCorrectRoomIndex = z.roomIndex != null ? z.roomIndex : detectRooms().findIndex(r=>r.x===z.x&&r.y===z.y);
                        // Reset Status Stil leicht verkleinern
                        const st=document.getElementById('status'); if(st){ st.style.fontSize='18px'; st.style.fontWeight='600'; }
                        loadQuestion(true); // ohne Rezentrierung
                        correctFlash=null; answerCooldown=false;
                    },650);
                } else {
                    // Falsche Antwort -> Gewicht erhöhen
                    const qObj=questions[currentQuestionIndex]; qObj.wrongCount++; qObj.asked++; qObj.lastAsked=performance.now();
                    const statusEl=document.getElementById('status'); if(statusEl){ statusEl.textContent='Falsch'; statusEl.style.color='#f44336'; statusEl.style.fontSize='22px'; }
                }
                break;
            }
        }
    }
    // Exit-Gating: Sobald komplett außerhalb aller Antwortzonen -> Aktivierung erlauben
    if(requireExitBeforeAnswer){
        const stillInside = answerZones.some(z=> player.x>z.x && player.x<z.x+z.w && player.y>z.y && player.y<z.y+z.h );
        if(!stillInside){ requireExitBeforeAnswer=false; }
    }
    ghosts.forEach(moveGhost); checkGhostCollision();
}

let showGrid=false;
function drawGrid(){ ctx.strokeStyle='rgba(255,255,255,0.08)'; for(let c=0;c<=COLS;c++){ ctx.beginPath(); ctx.moveTo(c*tileSize,0); ctx.lineTo(c*tileSize,ROWS*tileSize); ctx.stroke(); } for(let r=0;r<=ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*tileSize); ctx.lineTo(COLS*tileSize,r*tileSize); ctx.stroke(); } }
function draw(){
    ctx.fillStyle='#0a0a0a';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // Boden für Korridore zeichnen
    for(let r=0;r<ROWS;r++){
        for(let c=0;c<COLS;c++){
            const ch=maze[r][c];
            if(ch==='1') continue; // Wand später
            if(ch==='0'){
                ctx.fillStyle='#1e1e1e'; // dunkler Boden
                ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize);
                // kleines Punkt-Highlight für bessere Orientierung
                ctx.fillStyle='#303030';
                ctx.beginPath();
                ctx.arc(c*tileSize+tileSize/2,r*tileSize+tileSize/2,4,0,Math.PI*2);
                ctx.fill();
            } else if(['A','B','C','D'].includes(ch)) {
                // Raumfläche neutraler Boden (etwas heller)
                ctx.fillStyle='#242424';
                ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize);
            }
        }
    }
    // Wände obendrauf
    for(let r=0;r<ROWS;r++){
        for(let c=0;c<COLS;c++) if(maze[r][c]==='1'){
            ctx.fillStyle='#0b3d91';
            ctx.fillRect(c*tileSize,r*tileSize,tileSize,tileSize);
        }
    }
    // Antwort-Raum Overlays / Labels (mit automatischer Zeilenumbruch / Skalierung)
    function drawAnswerText(z){
        const padding=10;
        const maxW=z.w - padding*2;
        const cx=z.x+z.w/2;
        const cy=z.y+z.h/2;
        const sizes=[26,24,22,20,18,16];
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff';
        // Heuristische Silbentrennung für langes Einzelwort (>12, keine Leerzeichen)
        const raw=z.text;
        if(!raw.includes(' ') && raw.length>12){
            function hyphenate(word){
                const vowels='aeiouäöüAEIOUÄÖÜ';
                const candidates=[]; // {i,score}
                for(let i=2;i<word.length-2;i++){
                    const a=word[i-1], b=word[i];
                    // Muster: Vokal + Konsonant oder Doppelkonsonant / ck / ch / st
                    const isVowel=vowels.includes(a);
                    const isVowelNext=vowels.includes(b);
                    if(isVowel && !isVowelNext){
                        let score=0;
                        // Nähe zur Wortmitte bevorzugen
                        const center=word.length/2;
                        score+= 50 - Math.abs(i-center);
                        // Bevorzuge Trennung vor bekannten Clustern
                        const cluster=word.slice(i,i+2).toLowerCase();
                        if(['ch','ck','st','ng','rt','nd','tt','ll','mm','nn'].includes(cluster)) score+=4;
                        // Bestrafe sehr kurze Restsegmente
                        if(i<4 || word.length-i<4) score-=25;
                        candidates.push({i,score});
                    }
                }
                if(!candidates.length){
                    return [word.slice(0,Math.ceil(word.length/2)), word.slice(Math.ceil(word.length/2))];
                }
                candidates.sort((a,b)=>b.score-a.score);
                const pos=candidates[0].i;
                return [word.slice(0,pos), word.slice(pos)];
            }
            let [part1,part2]=hyphenate(raw);
            // Bindestrich anhängen an erste Zeile falls nicht schon vorhanden
            if(!part1.endsWith('-')) part1+='-';
            for(const size of sizes){
                ctx.font='bold '+size+'px Arial';
                if(ctx.measureText(part1).width<=maxW && ctx.measureText(part2).width<=maxW){
                    const shift=size*0.6;
                    ctx.fillText(part1,cx,cy-shift);
                    ctx.fillText(part2,cx,cy+shift);
                    return;
                }
            }
            // Fallback kleiner
            ctx.font='bold 14px Arial';
            const shift=14*0.6;
            // Kürze falls immer noch zu breit
            while(ctx.measureText(part1).width>maxW && part1.length>4){ part1=part1.slice(0,-2)+'…'; }
            while(ctx.measureText(part2).width>maxW && part2.length>4){ part2=part2.slice(0,-2)+'…'; }
            ctx.fillText(part1,cx,cy-shift);
            ctx.fillText(part2,cx,cy+shift);
            return;
        }
        for(const size of sizes){
            ctx.font='bold '+size+'px Arial';
            const fullWidth=ctx.measureText(z.text).width;
            if(fullWidth<=maxW){
                ctx.fillText(z.text,cx,cy);
                return;
            }
            // zweizeilig versuchen
            const words=z.text.split(' ');
            if(words.length>1){
                let line1=''; let line2='';
                for(let i=0;i<words.length;i++){
                    const candidate=line1? line1+' '+words[i] : words[i];
                    if(ctx.measureText(candidate).width<=maxW){
                        line1=candidate;
                    } else {
                        line2=words.slice(i).join(' ');
                        break;
                    }
                }
                if(line2){
                    if(ctx.measureText(line2).width<=maxW){
                        const shift=size*0.6;
                        ctx.fillText(line1,cx,cy-shift);
                        ctx.fillText(line2,cx,cy+shift);
                        return;
                    }
                }
            }
        }
        // Fallback sehr klein + evtl. Ellipsis
        ctx.font='bold 14px Arial';
        let txt=z.text;
        while(ctx.measureText(txt).width>maxW && txt.length>4){
            txt=txt.slice(0,-2)+'…';
        }
        ctx.fillText(txt,cx,cy);
    }
    answerZones.forEach(z=>{
        ctx.fillStyle='rgba(140,120,200,0.18)';
        ctx.fillRect(z.x,z.y,z.w,z.h);
        ctx.strokeStyle='#b39ddb';
        ctx.lineWidth=2; ctx.strokeRect(z.x,z.y,z.w,z.h);
        drawAnswerText(z);
    });
    // Flash bei korrekter Antwort
    if(correctFlash){
        const now=performance.now();
        const t=(now-correctFlash.start)/correctFlash.duration;
        if(t<=1){
            const alpha=0.65*(1-Math.min(1,t));
            ctx.save();
            ctx.fillStyle=`rgba(80,255,120,${alpha.toFixed(3)})`;
            ctx.fillRect(correctFlash.x,correctFlash.y,correctFlash.w,correctFlash.h);
            ctx.strokeStyle=`rgba(180,255,200,${(alpha+0.2).toFixed(3)})`;
            ctx.lineWidth=4;
            ctx.strokeRect(correctFlash.x+2,correctFlash.y+2,correctFlash.w-4,correctFlash.h-4);
            ctx.restore();
        } else {
            correctFlash=null; // falls Timeout wegen Tab-Wechsel nicht griff
        }
    }
    // Großes Banner zentriert
    if(showCorrectUntil && performance.now()<showCorrectUntil){
        const centerText='RICHTIG!';
        const remain=(showCorrectUntil-performance.now())/650; // 0..1
        const scale=0.9+0.2*Math.sin((1-remain)*Math.PI);
        ctx.save();
        ctx.translate(canvas.width/2, canvas.height/2);
        ctx.scale(scale,scale);
        ctx.font='bold 72px Arial';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        const grd=ctx.createLinearGradient(-150,-50,150,50);
        grd.addColorStop(0,'#b9ff8a');
        grd.addColorStop(1,'#4caf50');
        ctx.fillStyle=grd;
        ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=8; ctx.lineJoin='round';
        ctx.strokeText(centerText,0,0);
        ctx.fillText(centerText,0,0);
        ctx.restore();
    }
    // Spieler
    ctx.fillStyle='#ffeb3b'; ctx.beginPath(); ctx.arc(player.x,player.y,player.r,0,Math.PI*2); ctx.fill();
    // Geister
    ghosts.forEach(g=>{ ctx.fillStyle=g.color; ctx.beginPath(); ctx.arc(g.x,g.y,g.r,0,Math.PI*2); ctx.fill(); });
    if(showGrid) drawGrid();
    // Keine CSV-Statusanzeigen mehr
}
function loop(){ update(); draw(); requestAnimationFrame(loop); }

// Start
initMaze();
initGhosts();
loadQuestion();
loop();
updateHUD();