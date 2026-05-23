import type { AnalysisResult } from "shared";

const store = new Map<string, AnalysisResult>();

export function saveAnalysis(analysis: AnalysisResult): void {
  store.set(analysis.id, analysis);
}

export function getAnalysis(id: string): AnalysisResult | undefined {
  return store.get(id);
}
