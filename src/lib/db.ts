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

async function dbConnect() {
  if (cached!.conn) {
    return cached!.conn;
  }

  if (!cached!.promise) {
    const uri = getMongoUri();
    if (!uri) throw new Error('MONGODB_URI env fehlt');
    const poolSize = parseInt(process.env.MONGODB_POOL_SIZE || '5', 10); // klein halten für M0
    const serverSelTimeout = parseInt(process.env.MONGODB_SRV_TIMEOUT || '5000', 10);
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: poolSize,
      serverSelectionTimeoutMS: serverSelTimeout,
      // keepAlive standardmäßig true beim Node Driver >= 4; explizit lassen wir es aktiv
    } as any;
    if (process.env.DB_LOG_ON_CONNECT === '1') {
      console.log(`[db] connecting uri=${uri.replace(/:[^:@/]+@/, ':***@')} poolSize=${poolSize}`);
    }
    cached!.promise = mongoose.connect(uri, opts);
  }

  try {
    const mongooseInstance = await cached!.promise;
    cached!.conn = mongooseInstance.connection;
  } catch (e) {
    cached!.promise = null;
    throw e;
  }

  if (process.env.DB_LOG_ON_CONNECT === '1' && cached!.conn) {
    // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    console.log('[db] connected readyState=' + cached!.conn.readyState);
  }
  return cached!.conn;
}

export default dbConnect;
