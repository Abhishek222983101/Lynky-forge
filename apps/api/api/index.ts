import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { json, urlencoded } from 'express';
import { AppModule } from '../src/app.module';

const server = express();
let app: any;

async function bootstrap() {
  if (!app) {
    server.use(json({ limit: '12mb' }));
    server.use(urlencoded({ limit: '12mb', extended: true }));
    app = await NestFactory.create(AppModule, new ExpressAdapter(server), { bodyParser: false });
    app.enableCors({ origin: true, credentials: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
  }
  return server;
}

export default async function handler(req: any, res: any) {
  const srv = await bootstrap();
  return srv(req, res);
}
