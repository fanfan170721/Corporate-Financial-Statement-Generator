import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { createAuth } from "./auth-core";
export type { AuthUser } from "./auth-core";

const auth = createAuth({ env, legacyIdentity: getChatGPTUser });

export async function getUser() {
  const incoming = await headers();
  const host = incoming.get("host") || "finscope.invalid";
  const local = env.AUTH_ALLOW_LOCAL_HTTP === "true" && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  const request = new Request(`${local ? "http" : "https"}://${host}/`, { headers: { Cookie: incoming.get("cookie") || "" } });
  return auth.getUser(request);
}

export const handleAuth = auth.handler;
