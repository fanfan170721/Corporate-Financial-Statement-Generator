import { handleReportAI } from "@/lib/server";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReportAI(request, id);
}
