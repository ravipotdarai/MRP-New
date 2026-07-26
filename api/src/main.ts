import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Shared secrets live in MRP/.env (Firebase project + RTDB URL).
loadEnv({ path: resolve(__dirname, '../../MRP/.env') });
loadEnv({ path: resolve(__dirname, '../.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = (
    process.env.MRP_CORS_ORIGINS ||
    [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'https://mobileresilienceplatform.web.app',
      'https://mobileresilienceplatform.firebaseapp.com',
    ].join(',')
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`MRP API listening on :${port}/v1`);
  // eslint-disable-next-line no-console
  console.log(
    `Firebase project: ${process.env.PUBLIC_FIREBASE_PROJECT_ID || '(unset)'}`,
  );
}
bootstrap();
