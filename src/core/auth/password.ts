import bcrypt from "bcryptjs";

const ROUNDS = 10;

/** Zahashuje heslo (pro seed / správu uživatelů). */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Ověří heslo proti hashi. */
export function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
