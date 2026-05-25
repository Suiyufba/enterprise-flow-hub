type ToolExecutor = (input: Record<string, unknown>) => Promise<string>;

const executors = new Map<string, ToolExecutor>();

export function registerTool(toolId: string, executor: ToolExecutor): void {
  executors.set(toolId, executor);
}

export function getExecutor(toolId: string): ToolExecutor | undefined {
  return executors.get(toolId);
}
