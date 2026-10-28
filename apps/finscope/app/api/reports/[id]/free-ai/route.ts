import { handleReportFreeAI } from '@/lib/free-ai-access';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleReportFreeAI(request, id);
}
