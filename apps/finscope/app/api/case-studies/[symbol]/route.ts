import { handleSaveCaseStudy } from "@/lib/server";

export async function POST(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  return handleSaveCaseStudy(request, symbol);
}
