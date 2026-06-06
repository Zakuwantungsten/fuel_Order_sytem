/**
 * Resolve the MongoDB connection string for standalone scripts (migrations, seeds, verifiers).
 *
 * Throws if the env var is not set, so a script can NEVER silently fall back to a default
 * localhost database and modify/seed the wrong data. Previously these scripts used
 * `process.env.MONGODB_URI || 'mongodb://localhost:27017/...'`, which risked running a
 * migration against localhost when the env var was missing (e.g. wrong shell, CI).
 */
export function requireMongoUri(envVar: string = 'MONGODB_URI'): string {
  const uri = process.env[envVar];
  if (!uri) {
    throw new Error(
      `${envVar} environment variable is required — refusing to run against a default/localhost database.`
    );
  }
  return uri;
}
