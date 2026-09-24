import { type SchoolRole } from '@ilm/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { ENV, type Env } from '../../config/env';

import { loadJose } from './jose-loader';

/**
 * Access tokens.
 *
 * ADR-0003: authentication is owned, not delegated, so that migrating
 * PostgreSQL hosts is a data move rather than re-authenticating every user at
 * every school.
 *
 * Access tokens are short-lived (15 minutes) and stateless. Revocation is
 * handled by the refresh token, which is opaque, stored hashed and rotated —
 * a stateless token that could be revoked instantly would not be stateless.
 * `tokenVersion` is the escape hatch: bumping it on the user invalidates every
 * access token already issued, for a compromised account or a role change.
 */

/** Mirrors jose's JWTPayload without importing an ESM type into a CJS file. */
interface JwtPayloadBase {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  jti?: string;
  nbf?: number;
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
}

export interface AccessTokenClaims extends JwtPayloadBase {
  /** Subject: the user id. */
  sub: string;
  /**
   * The tenant. Checked against the request host by the tenant guard.
   *
   * Absent on a platform token, which belongs to no school. The tenant guard
   * rejects a non-`tenant` token before it reads this, so the two never meet.
   */
  sid?: string;
  /** Roles held, for the permission check. Absent on a platform token, whose
   *  role lives in `platform_users` and is re-read on every request. */
  rol?: readonly SchoolRole[];
  /** Token version, compared against the user's current value. */
  ver: number;
  /**
   * The platform user acting through impersonation, when there is one.
   * Present in the token so every audit row can name the real actor
   * (docs/17 section 5).
   */
  act?: string;
  /**
   * Token type. A platform token and a tenant token are different types and
   * one can never satisfy the other's guard (docs/04 section 6).
   */
  typ: 'tenant' | 'platform';
  /**
   * Whether the person has finished the first-login profile form.
   *
   * Optional so older tokens still verify. The portal proxy reads this (without
   * trusting it for authorisation — the API re-checks from the database) to
   * bounce incomplete profiles to `/profile/create` before a page renders.
   */
  pc?: boolean;
}

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;
  private readonly ttl: string;

  constructor(@Inject(ENV) env: Env) {
    this.secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    this.ttl = env.JWT_ACCESS_TTL;
  }

  async signAccessToken(claims: Omit<AccessTokenClaims, 'iat' | 'exp'>): Promise<string> {
    const { SignJWT } = await loadJose();
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.ttl)
      .sign(this.secret);
  }

  /**
   * Verify and decode. Throws on an expired, tampered or wrong-algorithm token.
   *
   * The algorithm is pinned: without `algorithms`, a token claiming `alg: none`
   * or a confused HS256/RS256 swap is a classic bypass.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { jwtVerify } = await loadJose();
    const { payload } = await jwtVerify<AccessTokenClaims>(token, this.secret, {
      algorithms: ['HS256'],
    });
    return payload;
  }
}
