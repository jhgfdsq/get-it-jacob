// Modified for Get It Jacob: one verified runtime, no obsolete SDK binary.
import { runDocumentAI } from "../document-ai";
import type { AIProvider, RunOptions, RunJsonInThreadResult, RunJsonResult } from "../provider-types";
function jsonInput(input: string, schema: object) {
  return `${input}\n\nReturn only JSON conforming to this schema:\n${JSON.stringify(schema)}`;
}
function parse<T>(text: string): T {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()) as T;
}
export class CodexProvider implements AIProvider {
  readonly name = "codex" as const;
  async runJson<T>(prompt: string, schema: object, opts: RunOptions = {}): Promise<RunJsonResult<T>> {
    const r = await runDocumentAI({input: jsonInput(prompt, schema), signal: opts.signal, outputSchema:schema});
    return {data: parse<T>(r.text), usage: r.usage};
  }
  async runJsonInThread<T>(args: {outputSchema: object; opts?: RunOptions; resume?: {threadId: string; input: string}; start?: {input: string}}): Promise<RunJsonInThreadResult<T>> {
    const input = args.resume?.input ?? args.start?.input;
    if (!input) throw new Error("Missing conversation input");
    const r = await runDocumentAI({input: jsonInput(input, args.outputSchema), threadId: args.resume?.threadId, signal: args.opts?.signal, outputSchema:args.outputSchema});
    return {data: parse<T>(r.text), threadId: r.threadId, usage: r.usage};
  }
}
