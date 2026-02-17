import mariadb, { PoolConnection } from 'mariadb';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createLogger } from '../utils/logger';

dotenv.config({ path: '.env' });

const logger = createLogger('database');

/** Parst mysql://user:password@host:port/database (z. B. Railway MYSQL_URL / MYSQL_PUBLIC_URL). */
function parseMysqlUrl(url: string): { host: string; port: number; user: string; password: string; database: string } | null {
    try {
        const u = new URL(url);
        if (!u.protocol.startsWith('mysql')) return null;
        const [user, password] = u.username ? [u.username, decodeURIComponent(u.password || '')] : ['', ''];
        const database = (u.pathname || '/').replace(/^\/+/, '') || undefined;
        const port = u.port ? parseInt(u.port, 10) : 3306;
        return {
            host: u.hostname,
            port: Number.isNaN(port) ? 3306 : port,
            user,
            password,
            database: database || '',
        };
    } catch {
        return null;
    }
}

// Railway: Im gleichen Projekt MYSQL_PRIVATE_URL bevorzugen (internes Netz). Sonst MYSQL_URL / MYSQL_PUBLIC_URL.
const isProduction = process.env.NODE_ENV === 'production';
const mysqlUrl = isProduction && process.env.MYSQL_PRIVATE_URL
    ? process.env.MYSQL_PRIVATE_URL
    : (process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_PRIVATE_URL || process.env.DATABASE_URL);
const fromUrl = mysqlUrl ? parseMysqlUrl(mysqlUrl) : null;

// Railway nutzt auch einzelne Variablen: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
const dbHost = process.env.DB_HOST || process.env.MYSQLHOST;
const dbUser = process.env.DB_USER || process.env.MYSQLUSER;
const dbPassword = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD;
const dbName = process.env.DB_NAME || process.env.MYSQLDATABASE;
const dbPort = parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10);

// Railway (und andere Cloud-Hosts) erwarten TCP (Host + Port), kein Unix-Socket.
// Lokal kann weiterhin das Socket genutzt werden.
const poolConfig: mariadb.PoolConfig = {
    user: fromUrl?.user ?? dbUser,
    password: fromUrl?.password ?? dbPassword,
    database: fromUrl?.database ?? dbName,
    connectionLimit: 10,
    dateStrings: true,
    // Längere Timeouts für Railway/Cold-Start (Standard connectTimeout 1s ist oft zu kurz)
    connectTimeout: 20000,
    acquireTimeout: 20000,
};

if (fromUrl) {
    poolConfig.host = fromUrl.host;
    poolConfig.port = fromUrl.port;
} else if (dbHost) {
    poolConfig.host = dbHost;
    poolConfig.port = Number.isNaN(dbPort) ? 3306 : dbPort;
} else {
    poolConfig.socketPath = '/run/mysqld/mysqld.sock';
}

// Log welcher DB-Quelle genutzt wird (ohne Passwort), hilft bei Railway-Debugging
const configSource = fromUrl
    ? (isProduction && process.env.MYSQL_PRIVATE_URL ? 'MYSQL_PRIVATE_URL' : 'MYSQL_URL/MYSQL_PUBLIC_URL')
    : (dbHost ? 'DB_HOST/MYSQLHOST' : 'socket');
logger.info(`Database config: ${configSource} (host: ${poolConfig.host ?? 'socket'})`);

const pool = mariadb.createPool(poolConfig);

/** Pfad zu einer SQL-Datei: zuerst neben der kompilierten Datei (dist), sonst src (Dev). */
function getSqlPath(filename: string): string {
    const inDist = path.join(__dirname, filename);
    if (fs.existsSync(inDist)) return inDist;
    const inSrc = path.join(process.cwd(), 'src', 'config', 'database', filename);
    if (fs.existsSync(inSrc)) return inSrc;
    return inDist;
}

/** Prüft, ob die aktuelle DB leer ist (keine Tabelle `venues`). */
export async function isDatabaseEmpty(conn: PoolConnection): Promise<boolean> {
    const rows = await conn.query<{ c: number }[]>(
        "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'venues'"
    );
    const count = Array.isArray(rows) ? (rows[0]?.c ?? 0) : (rows as unknown as { c: number })?.c ?? 0;
    return Number(count) === 0;
}

/** Führt schema.sql aus (ohne CREATE DATABASE / USE simplyseatdb, damit die verbundene DB verwendet wird). */
export async function runSchema(conn: PoolConnection): Promise<void> {
    const filePath = getSqlPath('schema.sql');
    let sql = fs.readFileSync(filePath, 'utf-8');
    sql = sql
        .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+simplyseatdb\s*;/gi, '')
        .replace(/USE\s+simplyseatdb\s*;/gi, '');
    const statements = sql
        .split(/;\s*[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'))
        .map((s) => (s.endsWith(';') ? s : s + ';'));
    for (const stmt of statements) {
        if (stmt) await conn.query(stmt);
    }
    logger.info('Schema applied successfully');
}

/** Führt seed.sql aus (ohne USE simplyseatdb, damit die verbundene DB verwendet wird). */
export async function runSeed(conn: PoolConnection): Promise<void> {
    const filePath = getSqlPath('seed.sql');
    let sql = fs.readFileSync(filePath, 'utf-8');
    sql = sql.replace(/USE\s+simplyseatdb\s*;/gi, '');
    const statements = sql
        .split(/;\s*[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'))
        .map((s) => (s.endsWith(';') ? s : s + ';'));
    for (const stmt of statements) {
        if (stmt) await conn.query(stmt);
    }
    logger.info('Seed applied successfully');
}

/**
 * Wenn die DB leer ist (keine venues-Tabelle), Schema und Seed ausführen.
 * Sollte nach testConnection() beim Start aufgerufen werden.
 */
export async function ensureSchemaAndSeedIfEmpty(): Promise<void> {
    let conn: PoolConnection | null = null;
    try {
        conn = await pool.getConnection();
        const empty = await isDatabaseEmpty(conn);
        if (!empty) {
            logger.info('Database already has schema; skipping schema/seed');
            return;
        }
        logger.info('Database is empty; applying schema and seed...');
        await runSchema(conn);
        await runSeed(conn);
    } catch (error) {
        logger.error('Failed to apply schema/seed', error);
        throw error;
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Hole eine Datenbankverbindung aus dem Pool
 * Diese Funktion wirft einen Fehler, wenn keine Verbindung möglich ist
 */
export async function getConnection(): Promise<PoolConnection>
{
    try 
    {
        const conn = await pool.getConnection();
        logger.debug('Database connection acquired from pool');
        return conn;
    } 
    catch (error) 
    {
        logger.error('Failed to get database connection', error);
        throw new Error('Database connection failed');    
    }
}

/**
 * Teste die Datenbankverbindung beim Start
 */
export async function testConnection(): Promise<boolean>
{
    let conn: PoolConnection | null = null;
    try 
    {
        conn = await getConnection();
        logger.info('Database connection test successful');
        return true;    
    } 
    catch (error) 
    {
        logger.error('Database connection test failed', error);
        return false;
    }
    finally
    {
        if (conn)
        {
            conn.release();
            logger.debug('Test connection released');
        }
    }
}

/**
 * Schließe den Connection Pool sauber
 * Sollte beim Herunterfahren der App aufgerufen werden
 */
export async function closePool(): Promise<void>
{
    try 
    {
        await pool.end();
        logger.info('Database pool closed successfully');    
    } 
    catch (error) 
    {
        logger.error('Error closing database pool', error);
        throw error;
    }
}

/**
 * Graceful Shutdown Handler
 */
export function setupGracefulShutdown(): void
{
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received, closing database pool...`);
        try 
        {
            await closePool();
            process.exit(0);    
        } 
        catch (error) 
        {
            logger.error('Error during shutdown', error);
            process.exit(1);    
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}