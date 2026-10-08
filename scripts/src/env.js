/** Loads `.env` into `process.env`. A missing file is fine: the variables may come from the process environment. */
export function loadEnv(path = '.env') {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
