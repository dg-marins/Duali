export type Row = Record<string, unknown>;
let csrf = "";
let unauthorizedHandler: (() => void) | null = null;
let unauthorizedNotified = false;

export function setCsrf(value: string) {
  csrf = value;
  if (value) unauthorizedNotified = false;
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public code: string,
    public fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = { notifyUnauthorized?: boolean };
type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    fields?: { fieldErrors?: Record<string, string[]> };
  };
};

async function request(
  path: string,
  method: string,
  body: unknown,
  options: RequestOptions,
) {
  let response: Response;
  const requestCsrf = csrf;
  try {
    response = await fetch("/api/" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "X-CSRF-Token": csrf,
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à API. Tente novamente.",
      null,
      "UNAVAILABLE",
    );
  }
  if (response.ok) return response;

  if (
    response.status === 401 &&
    options.notifyUnauthorized !== false &&
    requestCsrf !== "" &&
    requestCsrf === csrf &&
    !unauthorizedNotified
  ) {
    unauthorizedNotified = true;
    unauthorizedHandler?.();
  }
  let payload: ErrorPayload;
  try {
    payload = (await response.json()) as ErrorPayload;
  } catch {
    throw new ApiError(
      "A API retornou uma resposta inválida. Tente novamente.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  const error = payload.error;
  throw new ApiError(
    error?.message ?? "Não foi possível concluir.",
    response.status,
    error?.code ?? "REQUEST",
    error?.fields?.fieldErrors ?? {},
  );
}

export async function api<T = Row>(
  path: string,
  method = "GET",
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const response = await request(path, method, body, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      "A API retornou uma resposta inválida. Tente novamente.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

export async function apiBlob(path: string, options: RequestOptions = {}) {
  return (await request(path, "GET", undefined, options)).blob();
}
export function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") {
    const row = value as Row;
    if (row.pessoa) return display(row.pessoa) + " · " + display(row.tipo);
    return String(
      row.nomeCompleto ??
        row.nome ??
        row.seguradora ??
        (row.dataAquisicao
          ? "Aquisição " + display(row.dataAquisicao)
          : row.dataInicio
            ? "Período " + display(row.dataInicio)
            : (row.sigla ?? row.id ?? "")),
    );
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text))
    return text.slice(0, 10).split("-").reverse().join("/");
  return text;
}
