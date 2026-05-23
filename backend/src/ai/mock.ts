import { MOCK_ANALYSIS, type AnalysisRequest, type AnalysisResult } from "shared";
import { randomUUID } from "node:crypto";

export function generateMockAnalysis(input: AnalysisRequest): AnalysisResult {
  const id = randomUUID();
  return {
    ...MOCK_ANALYSIS,
    id,
    summary: `This looks like a ${input.businessType ?? "business"} process. ${MOCK_ANALYSIS.summary}`,
    createdAt: new Date().toISOString(),
  };
}
