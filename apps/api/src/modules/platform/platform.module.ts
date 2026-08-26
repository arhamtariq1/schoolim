import { Module } from '@nestjs/common';

import { PasswordService } from '../../shared/auth/password.service';
import { TokenService } from '../../shared/auth/token.service';
import { clockProvider } from '../../shared/time/clock.provider';

import { PlatformAuthService } from './platform-auth.service';
import { PlatformSessionService } from './platform-session.service';
import { PlatformController } from './platform.controller';
import { SchoolsService } from './schools.service';

/**
 * The platform console.
 *
 * Kept as its own module with no dependency on `AuthModule` or any tenant
 * module — the separation in docs/04 §6 is structural here, not a convention.
 * `TokenService` and `PasswordService` are shared because they are pure
 * cryptography with no notion of a school; everything that knows what a tenant
 * is stays on the other side of the line.
 */
@Module({
  controllers: [PlatformController],
  providers: [
    clockProvider,
    PasswordService,
    TokenService,
    PlatformSessionService,
    PlatformAuthService,
    SchoolsService,
  ],
})
export class PlatformModule {}
