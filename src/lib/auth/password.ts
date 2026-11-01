import { compare, hash } from "bcryptjs";

/** Laravel bcrypt hashes use the $2y$ prefix. bcryptjs verifies the same digest as $2a$. */
export function normalizeBcryptHash(storedHash: string): string {
  return storedHash.replace(/^\$2y\$/, "$2a$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !password) return false;
  return compare(password, normalizeBcryptHash(storedHash));
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}
