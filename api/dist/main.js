"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const dotenv_1 = require("dotenv");
const path_1 = require("path");
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '../../MRP/.env') });
(0, dotenv_1.config)({ path: (0, path_1.resolve)(__dirname, '../.env') });
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const origins = (process.env.MRP_CORS_ORIGINS ||
        [
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'https://mobileresilienceplatform.web.app',
            'https://mobileresilienceplatform.firebaseapp.com',
        ].join(','))
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
    console.log(`MRP API listening on :${port}/v1`);
    console.log(`Firebase project: ${process.env.PUBLIC_FIREBASE_PROJECT_ID || '(unset)'}`);
}
bootstrap();
//# sourceMappingURL=main.js.map