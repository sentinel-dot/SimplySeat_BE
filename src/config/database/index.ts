import mariadb, { PoolConnection } from 'mariadb';
import dotenv from 'dotenv';
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

const mysqlUrl = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_PRIVATE_URL || process.env.DATABASE_URL;
const fromUrl = mysqlUrl ? parseMysqlUrl(mysqlUrl) : null;

// Railway (und andere Cloud-Hosts) erwarten TCP (Host + Port), kein Unix-Socket.
// Lokal kann weiterhin das Socket genutzt werden.
const poolConfig: mariadb.PoolConfig = {
    user: fromUrl?.user ?? process.env.DB_USER,
    password: fromUrl?.password ?? process.env.DB_PASSWORD,
    database: fromUrl?.database ?? process.env.DB_NAME,
    connectionLimit: 10,
    dateStrings: true,
};

if (fromUrl) {
    poolConfig.host = fromUrl.host;
    poolConfig.port = fromUrl.port;
} else if (process.env.DB_HOST) {
    poolConfig.host = process.env.DB_HOST;
    poolConfig.port = parseInt(process.env.DB_PORT ?? '3306', 10);
} else {
    poolConfig.socketPath = '/run/mysqld/mysqld.sock';
}

const pool = mariadb.createPool(poolConfig);

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