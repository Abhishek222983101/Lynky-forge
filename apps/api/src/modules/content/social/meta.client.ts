// Meta (Facebook/Instagram) Graph API client: OAuth token exchange, listing the
// shop's Pages + linked Instagram Business accounts, and publishing a post.
// Instagram publishing is a two-step create-container then publish flow; a
// Facebook Page photo is a single call. Both need a public image URL.

import { Injectable } from "@nestjs/common";
import { env } from "@/common/config/env";
import { AppError } from "@/common/errors/app-error";

export interface MetaTarget {
  id: string; // pageId for facebook, ig user id for instagram
  service: "facebook" | "instagram";
  username: string;
  pageId: string;
  pageAccessToken: string;
  igUserId?: string;
}

@Injectable()
export class MetaClient {
  private graph(): string {
    return `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;
  }

  /** Build the Facebook Login dialog URL the owner is sent to. Facebook Login for
   * Business uses a Configuration (config_id); classic login uses a scope list. */
  authUrl(state: string): string {
    if (!env.META_APP_ID) throw new AppError("Meta app is not configured (META_APP_ID)", 503);
    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      state,
      response_type: "code",
    });
    if (env.META_LOGIN_CONFIG_ID) {
      // Business login: permissions + assets come from the configuration.
      params.set("config_id", env.META_LOGIN_CONFIG_ID);
    } else {
      params.set(
        "scope",
        ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"].join(","),
      );
    }
    return `https://www.facebook.com/${env.META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  }

  /** Exchange an OAuth code for a (short-lived) user access token. */
  async exchangeCode(code: string): Promise<string> {
    if (!env.META_APP_ID || !env.META_APP_SECRET) throw new AppError("Meta app is not configured", 503);
    const params = new URLSearchParams({
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      redirect_uri: env.META_OAUTH_REDIRECT_URI,
      code,
    });
    const res = await fetch(`${this.graph()}/oauth/access_token?${params.toString()}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body?.access_token) throw new AppError(`Meta token exchange failed: ${JSON.stringify(body)}`, 502);
    return String(body.access_token);
  }

  /** Upgrade a short-lived token to a long-lived (~60 day) one. */
  async longLivedToken(shortToken: string): Promise<string> {
    if (!env.META_APP_ID || !env.META_APP_SECRET) throw new AppError("Meta app is not configured", 503);
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    });
    const res = await fetch(`${this.graph()}/oauth/access_token?${params.toString()}`);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body?.access_token) return shortToken; // fall back to the short token
    return String(body.access_token);
  }

  /** List the Pages the user manages and their linked Instagram accounts. */
  async listTargets(userToken: string): Promise<MetaTarget[]> {
    const params = new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username}",
      access_token: userToken,
    });
    const res = await fetch(`${this.graph()}/me/accounts?${params.toString()}`);
    const body = (await res.json().catch(() => null)) as { data?: Array<Record<string, unknown>> } | null;
    if (!res.ok || !Array.isArray(body?.data)) throw new AppError(`Meta could not list pages: ${JSON.stringify(body)}`, 502);
    const targets: MetaTarget[] = [];
    for (const page of body.data) {
      const pageId = String(page.id ?? "");
      const pageToken = String(page.access_token ?? "");
      const name = String(page.name ?? "Facebook Page");
      if (!pageId || !pageToken) continue;
      targets.push({ id: pageId, service: "facebook", username: name, pageId, pageAccessToken: pageToken });
      const ig = page.instagram_business_account as Record<string, unknown> | undefined;
      if (ig?.id) {
        targets.push({
          id: String(ig.id),
          service: "instagram",
          username: String(ig.username ?? "instagram"),
          pageId,
          pageAccessToken: pageToken,
          igUserId: String(ig.id),
        });
      }
    }
    return targets;
  }

  /** Publish a photo post to a Facebook Page. */
  async publishFacebook(pageId: string, pageToken: string, message: string, imageUrl?: string): Promise<void> {
    const hasImage = Boolean(imageUrl && /^https?:\/\//i.test(imageUrl));
    const endpoint = hasImage ? `${this.graph()}/${pageId}/photos` : `${this.graph()}/${pageId}/feed`;
    const form = new URLSearchParams();
    form.set("access_token", pageToken);
    if (hasImage) {
      form.set("url", imageUrl as string);
      form.set("caption", message);
    } else {
      form.set("message", message);
    }
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || (body && body.error)) throw new AppError(`Facebook publish failed: ${JSON.stringify(body)}`, 502);
  }

  /** Publish a photo to Instagram (create container, then publish). */
  async publishInstagram(igUserId: string, pageToken: string, caption: string, imageUrl?: string): Promise<void> {
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      throw new AppError("Instagram requires a public image URL to publish", 400);
    }
    const createForm = new URLSearchParams({ image_url: imageUrl, caption, access_token: pageToken });
    const createRes = await fetch(`${this.graph()}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: createForm.toString(),
    });
    const createBody = (await createRes.json().catch(() => null)) as Record<string, unknown> | null;
    const creationId = createBody?.id ? String(createBody.id) : "";
    if (!createRes.ok || !creationId) throw new AppError(`Instagram container failed: ${JSON.stringify(createBody)}`, 502);

    const pubForm = new URLSearchParams({ creation_id: creationId, access_token: pageToken });
    const pubRes = await fetch(`${this.graph()}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: pubForm.toString(),
    });
    const pubBody = (await pubRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!pubRes.ok || (pubBody && pubBody.error) || !pubBody?.id) throw new AppError(`Instagram publish failed: ${JSON.stringify(pubBody)}`, 502);
  }
}
