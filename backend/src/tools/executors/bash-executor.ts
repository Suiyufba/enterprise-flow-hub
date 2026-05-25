import { execSync } from "node:child_process";

function isSafe(command: string): boolean {
  const blocked = [
    "rm -rf /",
    "mkfs",
    "dd if=",
    ":(){ :|:& };:",
    "> /dev/sda",
    "chmod 777 /",
  ];
  return !blocked.some((b) => command.includes(b));
}

export async function bashExecute(input: Record<string, unknown>): Promise<string> {
  const command = (input.command as string) ?? (input.cmd as string);
  if (!command) {
    return JSON.stringify({
      error: "No command provided",
      usage: { command: "string", cwd: "string (optional)" },
    });
  }

  if (!isSafe(command)) {
    return JSON.stringify({ error: "Command blocked for safety" });
  }

  const cwd = (input.cwd as string) || process.cwd();

  try {
    const stdout = execSync(command, {
      cwd,
      timeout: 30000,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      env: { ...process.env },
    });
    return stdout || "(command completed with no output)";
  } catch (e: unknown) {
    const err = e as { stderr?: string; stdout?: string; message?: string; status?: number };
    const output = [err.stdout, err.stderr].filter(Boolean).join("\n");
    return JSON.stringify({
      error: err.message,
      exitCode: err.status,
      output: output || undefined,
    });
  }
}
