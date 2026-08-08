import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "../dist/src/app.module";

const server = express();
let app: express.Express;

async function bootstrap() {
  if (!app) {
    const nestApp = await NestFactory.create(AppModule, new ExpressAdapter(server));
    nestApp.enableCors({ origin: true, credentials: true });
    nestApp.setGlobalPrefix("api/v1");
    await nestApp.init();
    app = server;
  }
  return app;
}

export default async function handler(req: any, res: any) {
  const srv = await bootstrap();
  return srv(req, res);
}
