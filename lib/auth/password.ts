import crypto from "crypto";

const ITERATIONS = 310_000; // NIST SP 800-132 recommended minimum for PBKDF2-SHA256
const KEY_LEN = 32;
const DIGEST = "sha256";
const SEP = "$";
const PREFIX = "pbkdf2";

/**
 * Hash a password using PBKDF2-SHA256.
 * Returns a self-describing string: pbkdf2$<iterations>$<salt-hex>$<hash-hex>
 * No third-party dependency — uses Node's built-in crypto module.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await pbkdf2Async(password, salt, ITERATIONS, KEY_LEN, DIGEST);
  return [PREFIX, ITERATIONS, salt, hash.toString("hex")].join(SEP);
}

/**
 * Verify a plaintext password against a stored PBKDF2 hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(SEP);
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;

  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = parts[2];
  const expected = Buffer.from(parts[3], "hex");

  const actual = await pbkdf2Async(password, salt, iterations, KEY_LEN, DIGEST);

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function pbkdf2Async(
  password: string,
  salt: string,
  iterations: number,
  keyLen: number,
  digest: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLen, digest, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
