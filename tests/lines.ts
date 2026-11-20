// Builders for Claude Code transcript lines (the JSONL format in ~/.claude/projects/…/<session>.jsonl).
let n = 0;
const uuid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const base = (extra: object) => ({ parentUuid: null, isSidechain: false, uuid: uuid(), timestamp: "2026-01-01T00:00:00.000Z", sessionId: "s1", ...extra });
export const line = (o: object) => JSON.stringify(o);

export const user = (content: unknown, extra: object = {}) => line(base({ type: "user", message: { role: "user", content }, ...extra }));
export const assistant = (content: unknown[], extra: object = {}, usage?: object, model = "claude-opus-5-5") =>
  line(base({ type: "assistant", message: { role: "assistant", model, content, ...(usage ? { usage } : {}) }, ...extra }));
export const text = (t: string) => ({ type: "text", text: t });
export const toolUse = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input });
export const toolResult = (id: string, content: unknown, is_error = false) => ({ type: "tool_result", tool_use_id: id, content, is_error });
export const queueOp = (operation: string, content?: string) =>
  line({ type: "queue-operation", operation, timestamp: "2026-01-01T00:00:01.000Z", sessionId: "s1", ...(content !== undefined ? { content } : {}) });
export const queuedAttachment = (prompt: string) => line(base({ type: "attachment", attachment: { type: "queued_command", prompt } }));
export const aiTitle = (t: string) => line({ type: "ai-title", aiTitle: t, sessionId: "s1" });
export const apiRequest = () => line({ type: "api-request", sessionId: "s1", body: "x".repeat(2000) });
export const compactBoundary = (postTokens: number) => line(base({ type: "system", subtype: "compact_boundary", compactMetadata: { postTokens } }));
