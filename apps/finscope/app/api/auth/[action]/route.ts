import { handleAuth } from "@/lib/auth";
export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  return handleAuth(request, (await context.params).action);
}
export const GET = handle;
export const POST = handle;
