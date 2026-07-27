import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Global()
@Module({
  providers: [
    FirebaseAuthGuard,
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
  ],
  exports: [FirebaseAuthGuard],
})
export class AuthModule {}
