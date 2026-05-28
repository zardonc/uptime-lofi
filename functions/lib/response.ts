export type StructuredErrorBody = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly request_id?: string;
  };
};

export function structuredError(code: string, message: string, requestId?: string): StructuredErrorBody {
  return {
    error: {
      code,
      message,
      ...(requestId ? { request_id: requestId } : {}),
    },
  };
}

export function normalizeError(error: unknown, requestId?: string): StructuredErrorBody {
  if (error instanceof Error) {
    return structuredError("internal_error", error.message, requestId);
  }

  if (typeof error === "string" && error.trim()) {
    return structuredError("internal_error", error, requestId);
  }

  return structuredError("internal_error", "Unexpected backend error", requestId);
}

export function jsonError(error: unknown, init: ResponseInit = {}, requestId?: string): Response {
  return Response.json(normalizeError(error, requestId), {
    status: init.status ?? 500,
    headers: init.headers,
  });
}
