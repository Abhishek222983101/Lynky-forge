import { IncomingMessage } from "http";
import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { WebSocket, WebSocketServer } from "ws";
import { env } from "@/common/config/env";
import { PrismaService } from "@/common/database/prisma.service";
import { AuthUser } from "@/common/types/auth-user";
import { AuditLogsService } from "@/modules/audit-logs/audit-logs.service";
import { VoiceCommandBusService } from "@/modules/voice/voice-command-bus.service";
import { VoicePolicyService } from "@/modules/voice/voice-policy.service";
import { VoicePreviewService } from "@/modules/voice/voice-preview.service";
import { VoiceResolverService } from "@/modules/voice/voice-resolver.service";
import { GeminiLiveSession } from "./gemini-live.session";
import { languageName } from "./gemini-tools";

const LIVE_PATH = "/api/v1/voice/live";

/**
 * Attaches a WebSocket endpoint at /api/v1/voice/live. The browser connects with
 * its JWT; the Gemini API key stays server-side and the session is scoped to the
 * signed-in user's shop. Each browser socket gets its own GeminiLiveSession.
 */
@Injectable()
export class GeminiLiveGateway implements OnApplicationBootstrap {
  private wss?: WebSocketServer;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly resolver: VoiceResolverService,
    private readonly preview: VoicePreviewService,
    private readonly policy: VoicePolicyService,
    private readonly commandBus: VoiceCommandBusService,
    private readonly audit: AuditLogsService
  ) {}

  onApplicationBootstrap() {
    const server = this.adapterHost.httpAdapter?.getHttpServer();
    if (!server) return;
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", async (req: IncomingMessage, socket: any, head: Buffer) => {
      const url = new URL(req.url ?? "", "http://localhost");
      if (url.pathname !== LIVE_PATH) return; // not ours; leave other upgrade handlers alone

      const actor = await this.authenticate(url.searchParams.get("token"));
      if (!actor || !actor.shopId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const language = languageName(url.searchParams.get("lang") ?? undefined);
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, actor, actor.shopId as string, language));
    });
  }

  private async authenticate(token: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: env.JWT_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user?.isActive) return null;
      return { id: user.id, shopId: user.shopId, role: user.role, isActive: user.isActive };
    } catch {
      return null;
    }
  }

  private onConnection(ws: WebSocket, actor: AuthUser, shopId: string, language: string) {
    const session = new GeminiLiveSession(
      actor,
      shopId,
      { resolver: this.resolver, preview: this.preview, policy: this.policy, commandBus: this.commandBus, audit: this.audit, prisma: this.prisma },
      (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); },
      language
    );
    session.start();

    ws.on("message", (data) => {
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === "audio" && typeof msg.data === "string") session.sendAudio(msg.data);
      else if (msg.type === "text" && typeof msg.text === "string") session.sendText(msg.text);
      else if (msg.type === "choose" && typeof msg.id === "string") void session.resolveChoice(msg.id);
    });
    ws.on("close", () => session.close());
    ws.on("error", () => session.close());
  }
}
