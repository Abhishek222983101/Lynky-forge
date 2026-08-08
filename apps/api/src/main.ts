import "dotenv/config";
import "./common/net/fast-dns"; // must run before any outbound fetch
import "reflect-metadata";
import express, { json, urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./common/config/env";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: "12mb" }));
  app.use(urlencoded({ limit: "12mb", extended: true }));
  const origins = env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((origin) => origin.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix("api/v1");

  // Vercel serverless doesn't use app.listen — the adapter handles requests
  if (!process.env.VERCEL) {
    await app.listen(env.PORT);
  } else {
    await app.init();
  }
}

void bootstrap();
