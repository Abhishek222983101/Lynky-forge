import "./common/net/fast-dns"; // must run before any outbound fetch
import "reflect-metadata";
import express, { json, urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./common/config/env";
import { contentStorageDir } from "./modules/content/studio/content-storage";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Product photos are sent inline as base64 (content generation, inventory item
  // photos), so raise the default 100kb JSON limit to hold a real image.
  app.use(json({ limit: "12mb" }));
  app.use(urlencoded({ limit: "12mb", extended: true }));
  // Serve ONLY generated marketing images publicly (never the invoices dir).
  app.use("/media/content", express.static(contentStorageDir()));
  const origins = env.CORS_ORIGINS === "*" ? true : env.CORS_ORIGINS.split(",").map((origin) => origin.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix("api/v1");
  await app.listen(env.PORT);
}

void bootstrap();
