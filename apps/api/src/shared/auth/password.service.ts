import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id.
 *
 * docs/05: argon2id, not bcrypt. bcrypt silently truncates at 72 bytes and has
 * no memory-hardness, which is what makes GPU cracking cheap.
 *
 * The parameters below are the OWASP baseline: 19 MiB of memory, two passes,
 * one lane. Memory cost is what makes parallel cracking expensive; raising
 * iterations without raising memory buys much less than it appears to.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, OPTIONS);
  }

  /**
   * Verify a password against a stored hash.
   *
   * Returns `false` rather than throwing on a malformed hash: a corrupted or
   * legacy hash must read as "wrong password", not as a 500 that tells an
   * attacker the account exists and is in an unusual state.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext, OPTIONS);
    } catch {
      return false;
    }
  }
}
