import * as fs from 'fs';
import * as path from 'path';

class Logger {
  private context: string;
  private logsDir: string;

  constructor(context: string) {
    this.context = context;
    // Absoluter Pfad zum logs-Verzeichnis
    this.logsDir = path.resolve(process.cwd(), 'logs');
    this.ensureLogDirectory();
    this.cleanOldLogs();
  }

  /**
   * Stellt sicher, dass das logs-Verzeichnis existiert
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Löscht Log-Dateien, die älter als gestern sind
   */
  private cleanOldLogs(): void {
    try {
      const files = fs.readdirSync(this.logsDir);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayStr = this.formatDateForFilename(today);
      const yesterdayStr = this.formatDateForFilename(yesterday);

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filename = file.replace('.log', '');
          // Behalte nur heute und gestern
          if (filename !== todayStr && filename !== yesterdayStr) {
            const filePath = path.join(this.logsDir, file);
            fs.unlinkSync(filePath);
            this.info(`Deleted old log file: ${file}`);
          }
        }
      });
    } catch (error) {
      this.error('Error cleaning old logs', error);
    }
  }

  /**
   * Formatiert Datum für Dateinamen (YYYY-MM-DD)
   */
  private formatDateForFilename(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Formatiert Timestamp für Log-Einträge (DD-MM-YYYY HH:MM:SS)
   */
  private formatTimestamp(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Formatiert Log-Nachricht
   */
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = this.formatTimestamp();
    let formatted = `[${timestamp}] [${this.context}] [${level}] ${message}`;
    if (data) {
      formatted += `\nData: ${JSON.stringify(data, null, 2)}`;
    }
    return formatted;
  }

  /**
   * Gibt den aktuellen Log-Dateinamen zurück
   */
  private getCurrentLogFile(): string {
    const today = new Date();
    const dateStr = this.formatDateForFilename(today);
    return path.join(this.logsDir, `${dateStr}.log`);
  }

  /**
   * Schreibt in Log-Datei
   */
  private writeToFile(message: string): void {
    try {
      const logFile = this.getCurrentLogFile();
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      // Fallback wenn Datei-Logging fehlschlägt (z. B. Verzeichnis fehlt)
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`[${this.context}] Error writing to log file: ${error}\n`);
      }
    }
  }

  info(message: string, data?: any): void {
    const formatted = this.formatMessage('INFO', message, data);
    this.writeToFile(formatted);
  }

  warn(message: string, data?: any): void {
    const formatted = this.formatMessage('WARN', message, data);
    this.writeToFile(formatted);
  }

  error(message: string, error?: Error | any): void {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error;
    const formatted = this.formatMessage('ERROR', message, errorData);
    this.writeToFile(formatted);
  }

  debug(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      const formatted = this.formatMessage('DEBUG', message, data);
      this.writeToFile(formatted);
    }
  }

  separator(char: string = '-', length: number = 135, label?: string): void {
    const line = char.repeat(length);
    if (label) {
      const padding = Math.floor((length - label.length - 2) / 2);
      const paddedLabel = char.repeat(padding) + ` ${label} ` + char.repeat(padding);
      this.writeToFile(paddedLabel);
    } else {
      this.writeToFile(line);
    }
  }
}

// Factory function um Logger mit Context zu erstellen
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Default Logger Export
export default new Logger('App');