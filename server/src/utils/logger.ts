type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    const metaStr = meta instanceof Error ? meta.stack || meta.message : JSON.stringify(meta);
    return `${prefix} ${message} ${metaStr}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  info: (msg: string, meta?: unknown) => console.log(formatMessage('info', msg, meta)),
  warn: (msg: string, meta?: unknown) => console.warn(formatMessage('warn', msg, meta)),
  error: (msg: string, meta?: unknown) => console.error(formatMessage('error', msg, meta)),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', msg, meta));
    }
  },
};
