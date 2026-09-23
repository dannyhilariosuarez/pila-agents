/**
 * Tap manifest schema — defines the shape of a tap.json file uploaded
 * via the web registration flow.
 *
 * A "Tap" is a web-registered manifest that declares tools.
 * ManifestExecutor always handles execution — Claude reasons about
 * which tools to use and how. Tools with a URL get HTTP calls.
 * Tools without a URL get their results through Claude's reasoning.
 * The developer just describes what each tool does in plain English.
 */

/** A single tool declared in a tap.json manifest. */
export interface TapTool {
  /** Short identifier for the tool (e.g. "get-stock-price"). */
  name: string;
  /** Plain-English description of what this tool does. Claude uses this to decide when and how to invoke it. */
  description: string;
  /** Optional API endpoint. If present, ManifestExecutor makes an HTTP call. If absent, Claude reasons the result. */
  url?: string;
  /** HTTP method — defaults to POST. Only relevant when url is set. */
  method?: "GET" | "POST";
  /** Static headers to send. Only relevant when url is set. */
  headers?: Record<string, string>;
  /** Template for the request body. Only relevant when url is set. */
  bodyTemplate?: Record<string, unknown>;
  /** Dot-notation path to extract from the JSON response (e.g. "data.result"). */
  resultPath?: string;
}

/** The validated shape of a tap.json file. */
export interface TapJson {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  capabilities: string[];
  tags: string[];
  tools: TapTool[];
}

/** Validation error returned when a tap.json file fails validation. */
export interface TapValidationError {
  field: string;
  message: string;
}

/**
 * Validate a parsed tap.json object. Returns an array of errors —
 * empty means valid. Uses plain validation (no zod dependency).
 */
export function validateTapJson(
  input: unknown,
):
  | { valid: true; tap: TapJson }
  | { valid: false; errors: TapValidationError[] } {
  const errors: TapValidationError[] = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ field: "root", message: "Must be a JSON object" }],
    };
  }

  const obj = input as Record<string, unknown>;

  // Required strings
  for (const field of ["id", "name", "description"] as const) {
    if (
      typeof obj[field] !== "string" ||
      (obj[field] as string).trim() === ""
    ) {
      errors.push({
        field,
        message: `"${field}" is required and must be a non-empty string`,
      });
    }
  }

  // Optional strings with defaults
  const version = typeof obj.version === "string" ? obj.version : "1.0.0";
  const author = typeof obj.author === "string" ? obj.author : "";
  const category = typeof obj.category === "string" ? obj.category : "general";

  // Optional string arrays
  const capabilities = Array.isArray(obj.capabilities)
    ? obj.capabilities.filter((c): c is string => typeof c === "string")
    : [];
  const tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t): t is string => typeof t === "string")
    : [];

  // Tools array — required, at least one
  const tools: TapTool[] = [];
  if (!Array.isArray(obj.tools) || obj.tools.length === 0) {
    errors.push({
      field: "tools",
      message: '"tools" is required and must be a non-empty array',
    });
  } else {
    for (let i = 0; i < obj.tools.length; i++) {
      const raw = obj.tools[i];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push({
          field: `tools[${i}]`,
          message: `Tool at index ${i} must be an object`,
        });
        continue;
      }
      const t = raw as Record<string, unknown>;

      if (typeof t.name !== "string" || t.name.trim() === "") {
        errors.push({
          field: `tools[${i}].name`,
          message: `Tool at index ${i} requires a "name"`,
        });
      }
      if (typeof t.description !== "string" || t.description.trim() === "") {
        errors.push({
          field: `tools[${i}].description`,
          message: `Tool at index ${i} requires a "description"`,
        });
      }

      // Validate optional URL
      let url: string | undefined;
      if (t.url !== undefined && t.url !== null && t.url !== "") {
        if (typeof t.url !== "string") {
          errors.push({
            field: `tools[${i}].url`,
            message: `Tool "${t.name}" url must be a string`,
          });
        } else {
          try {
            new URL(t.url);
            url = t.url;
          } catch {
            errors.push({
              field: `tools[${i}].url`,
              message: `Tool "${t.name}" url must be a valid URL`,
            });
          }
        }
      }

      // Validate optional method
      let method: "GET" | "POST" | undefined;
      if (t.method !== undefined) {
        if (t.method !== "GET" && t.method !== "POST") {
          errors.push({
            field: `tools[${i}].method`,
            message: `Tool "${t.name}" method must be "GET" or "POST"`,
          });
        } else {
          method = t.method;
        }
      }

      tools.push({
        name: String(t.name ?? "").trim(),
        description: String(t.description ?? "").trim(),
        ...(url !== undefined && { url }),
        ...(method !== undefined && { method }),
        ...(t.headers &&
        typeof t.headers === "object" &&
        !Array.isArray(t.headers)
          ? { headers: t.headers as Record<string, string> }
          : {}),
        ...(t.bodyTemplate &&
        typeof t.bodyTemplate === "object" &&
        !Array.isArray(t.bodyTemplate)
          ? { bodyTemplate: t.bodyTemplate as Record<string, unknown> }
          : {}),
        ...(typeof t.resultPath === "string"
          ? { resultPath: t.resultPath }
          : {}),
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    tap: {
      id: (obj.id as string).trim(),
      name: (obj.name as string).trim(),
      version,
      description: (obj.description as string).trim(),
      author,
      category,
      capabilities,
      tags,
      tools,
    },
  };
}
