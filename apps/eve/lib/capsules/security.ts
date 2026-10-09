import { CapsuleError, CAPSULE_LIMITS } from "./schema";

// Structural exclusion complements strict schemas and trusted source policy.
const forbiddenKey =
  /^(?:.*(?:passwords?|credentials?|secrets?|tokens?|cookies?|privatekeys?)|grants?|permissions?|approvals?|authorizations?|writer(?:lease|state|authority)|active(?:work|run)|workownership|pendingactions?|executioneligibility|factorydispatch|completionbudget|accountroles?|organizationmembership|provider(?:access|authority)|billingauthority|publicationauthority|approvalreceipts?|repositorygrants?|sessions?|billingconfig(?:uration)?|publicationconfig(?:uration)?|repositoryaccess|connectedapps?|relaygrants?)$/i;
const secrets = [
  /-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/i,
  /\b(?:sk-(?:proj-|ant-)?[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{12,}|github_pat_[a-zA-Z0-9_]{12,}|vcp_[a-zA-Z0-9_]{12,}|xox[baprs]-[a-zA-Z0-9-]{10,}|AKIA[A-Z0-9]{16})\b/,
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^\s/:]+:[^\s/@]+@/i,
  /\b(?:bearer|basic)\s+[a-zA-Z0-9+/_.=-]{8,}/i,
  /\b(?:api[ _-]?key|oauth|access[ _-]?token|refresh[ _-]?token|password|session[ _-]?(?:cookie|id)|secret|vercel[ _-]?token|relay[ _-]?(?:credential|token)|one[ _-]?time[ _-]?(?:code|secret)|otp)\b\s*["']?\s*[:=]\s*\S+/i,
  /\b(?:set-cookie|cookie)\s*:/i,
];
const authorityAssignment =
  /["']?\b(?:grants?|(?:tool|factory|repository|relay)[ _-]?permissions?|permissions?|approvals?|approval[ _-]?(?:state|receipt)|(?:repository|relay)[ _-]?grants?|publication[ _-]?authority|billing[ _-]?config(?:uration)?|account[ _-]?roles?|organization[ _-]?membership|execution[ _-]?eligibility|active[ _-]?(?:work|run)|writer[ _-]?(?:lease|authority)|provider[ _-]?authority|billing[ _-]?authority|completion[ _-]?budget|factory[ _-]?dispatch)["']?\s*[:=]\s*\S+/i;
const unsafeInstructions =
  /(?:ignore|override|bypass|disable)\s+(?:all\s+|the\s+|previous\s+|system\s+)*(?:instructions|polic(?:y|ies)|safety|permissions|approvals|guards)|(?:grant|enable)\s+(?:yourself|all tools|repository access)|<\/?(?:system|tool_call|script|iframe)\b|javascript:|<!--|<(?:tool|function|assistant|developer)\b|(?:hidden|silent)\s+(?:tool|function)\s*(?:call|instruction)/i;

export function scanText(text: string): void {
  const normalized = text
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(normalized))
    throw new CapsuleError(
      "binary",
      "Binary, compressed and executable content is not supported.",
    );
  if (secrets.some((pattern) => pattern.test(normalized)))
    throw new CapsuleError(
      "secret",
      "Sensitive credential material detected. Remove it at the source before exporting or importing.",
    );
  if (authorityAssignment.test(normalized))
    throw new CapsuleError(
      "authority",
      "Embedded authority configuration is not portable. Remove grants, permissions and live execution state.",
    );
  if (
    /data:[^\s]*;base64,|\b(?:base64|hex|rot13)\s*[:=]|(?:%[0-9a-f]{2}){3,}|(?:\\x[0-9a-f]{2}){3,}/i.test(
      normalized,
    )
  )
    throw new CapsuleError(
      "encoding",
      "Encoded payloads are not supported. Use readable experience text only.",
    );
  if (unsafeInstructions.test(normalized))
    throw new CapsuleError(
      "unsafe_guidance",
      "Possible policy override or executable content detected. Review and remove the unsafe guidance.",
    );
  // Opaque encoded strings are not needed for this text-only portable format.
  for (const token of normalized.match(/[A-Za-z0-9+/_=-]{40,}/g) ?? []) {
    if (
      /[A-Za-z]/.test(token) &&
      /[0-9]/.test(token) &&
      new Set(token).size > 15
    ) {
      throw new CapsuleError(
        "opaque_material",
        "Opaque or encoded sensitive material detected. Use readable experience text only.",
      );
    }
  }
}

export function scanStructure(value: unknown, depth = 0, field?: string): void {
  if (depth > CAPSULE_LIMITS.depth)
    throw new CapsuleError(
      "nesting",
      "Capsule nesting exceeds the supported limit.",
    );
  if (typeof value === "string") {
    // Canonical Agent IDs use a namespaced UUID. Treat that exact reference
    // shape as an identity, without exempting text or arbitrary opaque payloads.
    if (
      ["id", "eveRef", "sourceRef"].includes(field ?? "") &&
      /^(?:agent|sofie|eve)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      return;
    // Digests have a strictly validated non-secret representation.
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) scanText(value);
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (
        forbiddenKey.test(key.replace(/[^a-z0-9]/gi, "")) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      ) {
        throw new CapsuleError(
          "authority",
          "A prohibited authority or credential field was found. Transfer experience only.",
        );
      }
      scanStructure(item, depth + 1, key);
    }
  }
}

/** Reject duplicate keys before JSON.parse can discard shadowed sensitive fields. */
export function parseBoundedJson(raw: string): unknown {
  if (Buffer.byteLength(raw) > CAPSULE_LIMITS.bytes)
    throw new CapsuleError("size", "Capsules must be no larger than 1 MiB.");
  const stack: Array<{ kind: string; keys: Set<string> }> = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === '"') {
      const start = i++;
      while (i < raw.length) {
        if (raw[i] === "\\") i += 2;
        else if (raw[i++] === '"') break;
      }
      let next = i;
      while (/\s/.test(raw[next] ?? "") && next < raw.length) next++;
      if (raw[next] === ":") {
        let key: string;
        try {
          key = JSON.parse(raw.slice(start, i));
        } catch {
          throw new CapsuleError("json", "Invalid Capsule JSON.");
        }
        const frame = stack.at(-1);
        if (!frame || frame.kind !== "{" || frame.keys.has(key))
          throw new CapsuleError(
            "duplicate_key",
            "Duplicate or invalid JSON keys are not supported.",
          );
        frame.keys.add(key);
      }
      continue;
    }
    if (c === "{" || c === "[") stack.push({ kind: c, keys: new Set() });
    if (stack.length > CAPSULE_LIMITS.depth)
      throw new CapsuleError(
        "nesting",
        "Capsule nesting exceeds the supported limit.",
      );
    if (c === "}" || c === "]") stack.pop();
    i++;
  }
  try {
    const result: unknown = JSON.parse(raw);
    scanStructure(result);
    return result;
  } catch (error) {
    if (error instanceof CapsuleError) throw error;
    throw new CapsuleError("json", "Invalid Capsule JSON.");
  }
}
