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

// Development: nur lokale MariaDB (DB_HOST, DB_USER, …). Production: nur MYSQL_URL (z. B. Railway).
const isProduction = process.env.NODE_ENV === 'production';
const mysqlUrl = isProduction
    ? (process.env.MYSQL_PRIVATE_URL || process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL)
    : null;
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
    // MySQL 8 caching_sha2_password: Client darf Public Key vom Server holen (Railway/Cloud-MySQL)
    allowPublicKeyRetrieval: true,
};

if (fromUrl) {
    poolConfig.host = fromUrl.host;
    // Railway: Privater Host (*.railway.internal) lauscht immer auf 3306; URL kann Public-Port enthalten → überschreiben.
    const isRailwayPrivate = /\.railway\.internal$/i.test(fromUrl.host);
    poolConfig.port = isRailwayPrivate ? 3306 : fromUrl.port;
    if (isRailwayPrivate) {
        (poolConfig as Record<string, unknown>).ssl = false;
    }
} else if (dbHost) {
    poolConfig.host = dbHost;
    poolConfig.port = Number.isNaN(dbPort) ? 3306 : dbPort;
    const isRailwayPrivate = /\.railway\.internal$/i.test(dbHost);
    if (isRailwayPrivate) {
        (poolConfig as Record<string, unknown>).ssl = false;
    }
} else {
    poolConfig.socketPath = '/run/mysqld/mysqld.sock';
}

// Log welcher DB-Quelle genutzt wird (ohne Passwort), hilft bei Railway-Debugging
const configSource = fromUrl
    ? 'MYSQL_URL (MYSQL_PRIVATE_URL / MYSQL_PUBLIC_URL)'
    : (dbHost ? 'DB_HOST (lokal)' : 'socket');
logger.info(`Database config: ${configSource} (host: ${poolConfig.host ?? 'socket'}, port: ${poolConfig.port ?? 'n/a'})`);

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

/** Entfernt SQL-Zeilenkommentare (-- ...), damit Statements mit vorangestelltem Kommentar nicht übersprungen werden. */
function stripSqlCommentLines(sql: string): string {
    return sql.replace(/^\s*--[^\r\n]*[\r\n]/gm, '\n');
}

/** Führt schema.sql aus (ohne CREATE DATABASE / USE simplyseatdb, damit die verbundene DB verwendet wird). */
export async function runSchema(conn: PoolConnection): Promise<void> {
    const filePath = getSqlPath('schema.sql');
    let sql = fs.readFileSync(filePath, 'utf-8');
    sql = sql
        .replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+simplyseatdb\s*;/gi, '')
        .replace(/USE\s+simplyseatdb\s*;/gi, '');
    sql = stripSqlCommentLines(sql);
    const statements = sql
        .split(/;\s*[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
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
    sql = stripSqlCommentLines(sql);
    const statements = sql
        .split(/;\s*[\r\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
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

/** Tabellen in Abhängigkeitsreihenfolge (Kind zuerst), für DROP. */
const TABLES_TO_DROP = [
    'booking_audit_log',
    'reviews',
    'loyalty_transactions',
    'customer_favorites',
    'customer_preferences',
    'bookings',
    'availability_rules',
    'staff_services',
    'services',
    'staff_members',
    'users',
    'venues',
    'customers',
    'loyalty_config',
] as const;

/**
 * Development: Alle Tabellen droppen, dann Schema und Seed neu anwenden.
 * Bei jedem Serverstart in NODE_ENV=development wird die DB so neu aufgesetzt.
 */
export async function resetSchemaAndSeedForDevelopment(): Promise<void> {
    let conn: PoolConnection | null = null;
    try {
        conn = await pool.getConnection();
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const table of TABLES_TO_DROP) {
            await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
        }
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        logger.info('Development: tables dropped; applying schema and seed...');
        await runSchema(conn);
        await runSeed(conn);
    } catch (error) {
        logger.error('Failed to reset schema/seed for development', error);
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

const DB_CONNECT_RETRIES = 5;
const DB_CONNECT_RETRY_DELAY_MS = 5000;

const DB_CONNECT_INITIAL_DELAY_MS = 3000;
/** Kürzerer Timeout für direkte Verbindung, damit wir den echten Fehler (ECONNREFUSED, ENOTFOUND) statt Pool-Timeout sehen. */
const DB_PROBE_CONNECT_TIMEOUT_MS = 10000;

/**
 * Teste die Datenbankverbindung beim Start.
 * Railway: Direkte Verbindung (createConnection) mit kürzerem Timeout, damit der echte Fehler geloggt wird; dann Retries.
 */
export async function testConnection(): Promise<boolean> {
    const isRailwayPrivate = poolConfig.host && /\.railway\.internal$/i.test(String(poolConfig.host));
    if (isRailwayPrivate) {
        logger.info(`Waiting ${DB_CONNECT_INITIAL_DELAY_MS / 1000}s for Railway private network...`);
        await new Promise((r) => setTimeout(r, DB_CONNECT_INITIAL_DELAY_MS));
    }
    const probeConfig: mariadb.PoolConfig = {
        ...poolConfig,
        connectTimeout: DB_PROBE_CONNECT_TIMEOUT_MS,
    };
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= DB_CONNECT_RETRIES; attempt++) {
        let conn: mariadb.Connection | null = null;
        try {
            conn = await mariadb.createConnection(probeConfig);
            logger.info('Database connection test successful');
            await conn.end();
            return true;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const err = error as NodeJS.ErrnoException & { code?: string; cause?: unknown };
            const code = err?.code ?? (err?.cause as NodeJS.ErrnoException)?.code;
            const msg = err?.message ?? String(error);
            logger.warn(
                `Database connection attempt ${attempt}/${DB_CONNECT_RETRIES} failed: ${msg}` +
                (code ? ` (code: ${code})` : '')
            );
            if (attempt < DB_CONNECT_RETRIES) {
                logger.info(`Retrying in ${DB_CONNECT_RETRY_DELAY_MS / 1000}s...`);
                await new Promise((r) => setTimeout(r, DB_CONNECT_RETRY_DELAY_MS));
            }
        } finally {
            if (conn) {
                try {
                    await conn.end();
                } catch {
                    // ignore
                }
            }
        }
    }
    logger.error('Database connection test failed after all retries', lastError);
    return false;
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