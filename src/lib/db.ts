import mongoose from "mongoose";
// Lazy Import für Event Persistierung
async function logDbEvent(kind: 'connect'|'disconnect'|'selfHeal'|'warn'|'hardCut', data: { active?: number; message?: string }){
  try {
    // Vermeide Re-Entrant Connect: nur loggen wenn bereits eine Verbindung besteht oder beim ersten Connect
    const active = (mongoose.connections||[]).filter(c=>c && c.readyState===1).length;
    const maxObserved = metrics.maxObservedConnections;
    // Dynamisch importieren um Zyklen zu vermeiden
    const mod = await import('@/models/DbConnEvent');
    const Model: any = mod.default;
    // Nur jede 5 Sekunden pro (kind) loggen um Spam zu vermeiden
    const key = `__last_log_${kind}`;
    const g: any = global as any;
    const now = Date.now();
    if(g[key] && now - g[key] < 5000) return;
    g[key] = now;
    await Model.create({ kind, active, maxObserved, message: data.message });
  } catch{}
}
// Globale Mongoose-Konfiguration (nur einmal pro Prozess)
if(!(global as any).__MGO_BASE_SETUP__){
  (global as any).__MGO_BASE_SETUP__ = true;
  mongoose.set('strictQuery', true);
  mongoose.set('bufferCommands', false);
  if(process.env.MONGOOSE_DEBUG === '1') mongoose.set('debug', true);
}

// Hinweis: Zugriff auf ENV erst bei Verbindungsaufbau, damit Build auf Vercel
// nicht fehlschlägt, falls PREVIEW ohne DB-Env gebaut wird.
const getMongoUri = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI nicht gesetzt – Verbindung erst bei Aufruf fehlschlägt.');
  }
  return uri;
};

// Erweitere das global-Objekt um mongoose
declare global {
  var mongoose: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Mongoose> | null;
  } | undefined;
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// Metriken & Event-Logging einmalig einrichten
interface DbMetrics { firstConnectedAt?: number; lastConnectedAt?: number; disconnects: number; errors: number; reconnects: number; lastError?: string; lastDisconnectAt?: number; lastReconnectAt?: number; attempts: number; }
const globalAny = global as unknown as { __DB_METRICS__?: DbMetrics };
if (!globalAny.__DB_METRICS__) {
  globalAny.__DB_METRICS__ = { disconnects:0, errors:0, reconnects:0, attempts:0 } as DbMetrics & { maxObservedConnections?: number; lastSelfHealAt?: number; selfHeals?: number };
}
const metrics = globalAny.__DB_METRICS__! as DbMetrics & { maxObservedConnections?: number; lastSelfHealAt?: number; selfHeals?: number };
// Zusatz-Diagnostik
if(!(metrics as any).firstConnectStack){ (metrics as any).firstConnectStack = undefined; }

// Einfacher Mutex zur Serialisierung des echten Verbindungsaufbaus, um Connection-Stürme zu verhindern
interface SimpleLock { busy: boolean; queue: Array<()=>void>; }
const gAny: any = global as any;
if(!gAny.__DB_CONNECT_LOCK__){ gAny.__DB_CONNECT_LOCK__ = { busy:false, queue:[] } as SimpleLock; }
const connectLock: SimpleLock = gAny.__DB_CONNECT_LOCK__;

async function withLock<T>(fn:()=>Promise<T>): Promise<T> {
  if(!connectLock.busy){
    connectLock.busy = true;
    try { return await fn(); }
    finally {
      connectLock.busy = false;
      const next = connectLock.queue.shift();
      if(next) next();
    }
  }
  return await new Promise<T>((resolve,reject)=>{
    connectLock.queue.push(async ()=>{
      try { resolve(await withLock(fn)); } catch(e){ reject(e); }
    });
  });
}

function attachConnectionEvents(conn: mongoose.Connection){
  if ((conn as any).__listenersAttached) return;
  (conn as any).__listenersAttached = true;
  conn.on('connected', ()=>{
    metrics.lastConnectedAt = Date.now();
    if (!metrics.firstConnectedAt) metrics.firstConnectedAt = metrics.lastConnectedAt;
  logDbEvent('connect', { active: mongoose.connections.filter(c=>c.readyState===1).length }).catch(()=>undefined);
  });
  conn.on('disconnected', ()=>{
    metrics.disconnects++; metrics.lastDisconnectAt = Date.now();
  logDbEvent('disconnect', { active: mongoose.connections.filter(c=>c.readyState===1).length }).catch(()=>undefined);
  });
  conn.on('reconnected', ()=>{
    metrics.reconnects++; metrics.lastReconnectAt = Date.now();
  });
  conn.on('error', (err)=>{
    metrics.errors++; metrics.lastError = String((err as any)?.message || err);
  });
}

async function connectWithRetry(doConnect: ()=>Promise<mongoose.Mongoose>, maxAttempts: number){
  let lastErr: unknown;
  for (let attempt=1; attempt<=maxAttempts; attempt++){
    metrics.attempts++;
    try {
      const inst = await doConnect();
      return inst;
    } catch(e){
      lastErr = e;
      const delay = Math.min(500 * attempt, 2000);
      if (process.env.DB_LOG_ON_CONNECT === '1') {
        console.warn(`[db] connect attempt ${attempt} failed: ${(e as any)?.message||e}. retry in ${delay}ms`);
      }
      await new Promise(r=>setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function dbConnect() {
  if (cached!.conn) {
  // Bereits verbunden – optional Duplikate bereinigen
  enforceSingleConnection();
    return cached!.conn;
  }
  // Bereits ein laufender Verbindungsversuch? Warte darauf.
  if(cached!.promise){
    try { await cached!.promise; } catch {}
    if(cached!.conn) return cached!.conn;
  }
  if (!cached!.promise) {
    const uri = getMongoUri();
    if (!uri) throw new Error('MONGODB_URI env fehlt');
    // Optionale kleine Verzögerung nach Self-Heal um Sturm zu dämpfen
    const healBlockUntil = (gAny.__DB_HEAL_BLOCK_UNTIL__||0) as number;
    if(healBlockUntil && Date.now() < healBlockUntil){
      const waitMs = healBlockUntil - Date.now();
      if(waitMs > 0) await new Promise(r=>setTimeout(r, waitMs));
    }
    // Adaptive Pool Size
    const basePool = parseInt(process.env.MONGODB_POOL_SIZE || '3', 10); // konservativ für kleine Cluster
    let poolSize = basePool;
    if(process.env.DB_ADAPTIVE_POOL === '1'){
      const observed = metrics.maxObservedConnections || 1;
      poolSize = Math.min(basePool, Math.max(2, observed + 1));
    }
    const minPoolSize = Math.min(parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10), poolSize);
    const serverSelTimeout = parseInt(process.env.MONGODB_SRV_TIMEOUT || '5000', 10);
    const socketTimeout = parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000', 10);
    const heartbeat = parseInt(process.env.MONGODB_HEARTBEAT_MS || '10000', 10);
    const maxAttempts = parseInt(process.env.MONGODB_CONNECT_RETRIES || '3', 10);
    const maxIdle = parseInt(process.env.MONGODB_MAX_IDLE_TIME_MS || '30000', 10);
    const waitQueue = parseInt(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || '2000', 10);
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: poolSize,
      minPoolSize,
      serverSelectionTimeoutMS: serverSelTimeout,
      socketTimeoutMS: socketTimeout,
      heartbeatFrequencyMS: heartbeat,
      retryWrites: true,
      maxIdleTimeMS: maxIdle,
      waitQueueTimeoutMS: waitQueue,
    } as any;
    if (process.env.DB_LOG_ON_CONNECT === '1') {
      console.log(`[db] connecting uri=${uri.replace(/:[^:@/]+@/, ':***@')} pool=${minPoolSize}-${poolSize} attempts=${maxAttempts}`);
    }
    // Serialisierter Aufbau
    cached!.promise = withLock(()=>connectWithRetry(()=>mongoose.connect(uri, opts), maxAttempts));
  }

  try {
    const mongooseInstance = await cached!.promise;
    cached!.conn = mongooseInstance.connection;
    attachConnectionEvents(cached!.conn);
  enforceSingleConnection();
  warnOnConnectionCount();
  if(!(metrics as any).firstConnectStack){ (metrics as any).firstConnectStack = (new Error('first connect stack').stack); }
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  if (process.env.DB_LOG_ON_CONNECT === '1' && cached!.conn) {
    console.log('[db] readyState=' + cached!.conn.readyState + ` metrics=${JSON.stringify(metrics)}`);
  }
  return cached!.conn;
}

// Entfernt überzählige Verbindungen (kann bei Hot-Reload/Serverless-Caches auftreten)
function enforceSingleConnection(){
  try {
    const conns = mongoose.connections as any[];
    // Bewahre Index 0 (Standard) – schließe alle weiteren aktiven Connections
    for(let i=1;i<conns.length;i++){
      const c = conns[i];
      if(c && c.readyState === 1){
        // Soft-Close; Fehler ignorieren
        c.close().catch(()=>undefined);
      }
    }
  } catch{}
}

function softHeal(threshold: number){
  try {
    const active = mongoose.connections.filter(c=>c && c.readyState === 1).length;
    metrics.maxObservedConnections = Math.max(metrics.maxObservedConnections||0, active);
    if(active > threshold){
      if(!(global as any).__DB_HEALING__){
        (global as any).__DB_HEALING__ = true;
    // Kurzes Throttle, damit nach dem Heilen nicht sofort viele neue Connects anlaufen
    (global as any).__DB_HEAL_BLOCK_UNTIL__ = Date.now() + 150;
        enforceSingleConnection();
        metrics.lastSelfHealAt = Date.now();
        metrics.selfHeals = (metrics.selfHeals||0)+1;
        setTimeout(()=>{ (global as any).__DB_HEALING__ = false; }, 200);
      }
    }
  } catch{}
}

let lastWarnedCount = 0;
function warnOnConnectionCount(){
  try {
    const threshold = parseInt(process.env.DB_CONN_WARN_THRESHOLD || '5', 10);
    const hard = parseInt(process.env.DB_CONN_HARD_LIMIT || '15', 10);
    const count = mongoose.connections.filter(c=>c && c.readyState !== 0).length;
    metrics.maxObservedConnections = Math.max(metrics.maxObservedConnections||0, count);
    if(count >= threshold && count !== lastWarnedCount){
      console.warn(`[db] WARN Verbindungen aktiv=${count} threshold=${threshold}`);
      lastWarnedCount = count;
  logDbEvent('warn', { active: count, message:`threshold=${threshold}` }).catch(()=>undefined);
    }
    if(count > hard){
      console.error(`[db] NOTBREMSE aktiv=${count} > hard=${hard} – schließe Zusatzverbindungen`);
      enforceSingleConnection();
  logDbEvent('hardCut', { active: count, message:`hard=${hard}` }).catch(()=>undefined);
    }
    if(process.env.DB_AUTO_SELF_HEAL === '1'){
      const healThreshold = parseInt(process.env.DB_SELF_HEAL_THRESHOLD || String(Math.max(threshold, 3)), 10);
      softHeal(healThreshold);
    }
  } catch{}
}

// Aufräumen bei Prozessende (lokale Entwicklung / Serverless reclaimer)
if(!(global as any).__MGO_EXIT_HANDLER__){
  (global as any).__MGO_EXIT_HANDLER__ = true;
  const shutdown = ()=>{ try { mongoose.connections.forEach(c=>{ if(c.readyState===1) c.close().catch(()=>undefined); }); } catch{} };
  const proc: any = process as any;
  proc.on?.('SIGINT', shutdown);
  proc.on?.('SIGTERM', shutdown);
  proc.on?.('beforeExit', shutdown);
}

export default dbConnect;
