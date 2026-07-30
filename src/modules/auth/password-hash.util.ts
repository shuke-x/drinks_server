// Keep the native Argon2 dependency explicit so production cannot silently
// fall back to a weaker password hashing implementation.
const argon2 = require("argon2") as {
  argon2id: number;
  hash(password: string, options: object): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
};

const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (password: string) =>
  argon2.hash(password, ARGON2ID_OPTIONS);

/**
 * Treat an invalid stored hash like a password mismatch. This keeps corrupted
 * or manually edited database values from turning a login attempt into a 500.
 */
export async function verifyPasswordHash(
  hash: string | null | undefined,
  password: string,
): Promise<boolean> {
  if (!hash || !password) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
