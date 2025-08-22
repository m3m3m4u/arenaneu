import mongoose from "mongoose";

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
  globalAny.__DB_METRICS__ = { disconnects:0, errors:0, reconnects:0, attempts:0 };
}
const metrics = globalAny.__DB_METRICS__!;

function attachConnectionEvents(conn: mongoose.Connection){
  if ((conn as any).__listenersAttached) return;
  (conn as any).__listenersAttached = true;
  conn.on('connected', ()=>{
    metrics.lastConnectedAt = Date.now();
    if (!metrics.firstConnectedAt) metrics.firstConnectedAt = metrics.lastConnectedAt;
  });
  conn.on('disconnected', ()=>{
    metrics.disconnects++; metrics.lastDisconnectAt = Date.now();
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
    return cached!.conn;
  }

  if (!cached!.promise) {
    const uri = getMongoUri();
    if (!uri) throw new Error('MONGODB_URI env fehlt');
    const poolSize = parseInt(process.env.MONGODB_POOL_SIZE || '5', 10); // klein für M0
    const minPoolSize = Math.min(parseInt(process.env.MONGODB_MIN_POOL_SIZE || '0', 10), poolSize);
    const serverSelTimeout = parseInt(process.env.MONGODB_SRV_TIMEOUT || '5000', 10);
    const socketTimeout = parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000', 10);
    const heartbeat = parseInt(process.env.MONGODB_HEARTBEAT_MS || '10000', 10);
    const maxAttempts = parseInt(process.env.MONGODB_CONNECT_RETRIES || '3', 10);
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: poolSize,
      minPoolSize,
      serverSelectionTimeoutMS: serverSelTimeout,
      socketTimeoutMS: socketTimeout,
      heartbeatFrequencyMS: heartbeat,
      retryWrites: true,
    } as any;
    if (process.env.DB_LOG_ON_CONNECT === '1') {
      console.log(`[db] connecting uri=${uri.replace(/:[^:@/]+@/, ':***@')} pool=${minPoolSize}-${poolSize} attempts=${maxAttempts}`);
    }
    cached!.promise = connectWithRetry(()=>mongoose.connect(uri, opts), maxAttempts);
  }

  try {
    const mongooseInstance = await cached!.promise;
    cached!.conn = mongooseInstance.connection;
    attachConnectionEvents(cached!.conn);
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  if (process.env.DB_LOG_ON_CONNECT === '1' && cached!.conn) {
    console.log('[db] readyState=' + cached!.conn.readyState + ` metrics=${JSON.stringify(metrics)}`);
  }
  return cached!.conn;
}

export default dbConnect;
