const isDev = process.env.NODE_ENV !== 'production';

const ts = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[INFO] ${ts()}`, ...args),
  warn: (...args) => console.warn(`[WARN] ${ts()}`, ...args),
  error: (...args) => console.error(`[ERROR] ${ts()}`, ...args),
  debug: (...args) => { if (isDev) console.debug(`[DEBUG] ${ts()}`, ...args); }
};

export default logger;
