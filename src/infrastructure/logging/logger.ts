import log from 'electron-log/main';
import path from 'path';
import { app } from 'electron';

// Optional: Format customization
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Maximum size of a log file in bytes (e.g., 5MB)
log.transports.file.maxSize = 5 * 1024 * 1024;

export const initLogger = () => {
  log.initialize();
  // We'll configure it to write to a 'logs' directory in the userData path for easier discovery
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');
};

export const logger = log;
