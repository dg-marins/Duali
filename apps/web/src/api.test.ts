import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiError, api, apiBlob, onUnauthorized, setCsrf } from "./api";

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  setCsrf("csrf-sintetico");
});

afterEach(() => {
  onUnauthorized(null);
  vi.unstubAllGlobals();
});

test("preserva status, código, mensagem e campos de erros HTTP", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "VALIDATION",
            message: "Confira os campos informados.",
            fields: { fieldErrors: { nome: ["Obrigatório"] } },
          },
        },
        422,
      ),
    ),
  );

  const error = await api("pessoas").catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status: 422,
    code: "VALIDATION",
    message: "Confira os campos informados.",
    fields: { nome: ["Obrigatório"] },
  });
});

test("notifica uma única vez diante de respostas 401 concorrentes", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            { error: { code: "DOMAIN", message: "Sessão expirada." } },
            401,
          ),
        ),
      ),
  );

  const results = await Promise.allSettled([api("pessoas"), api("unidades")]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(handler).toHaveBeenCalledTimes(1);
});

test("não trata login inválido como expiração global", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: "DOMAIN", message: "E-mail ou senha inválidos." } },
          401,
        ),
      ),
  );

  await expect(
    api("auth/login", "POST", {}, { notifyUnauthorized: false }),
  ).rejects.toMatchObject({ status: 401 });
  expect(handler).not.toHaveBeenCalled();
});

test("ignora 401 atrasado de uma sessão anterior", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  let resolveResponse!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    ),
  );

  const oldRequest = api("pessoas");
  setCsrf("csrf-da-nova-sessao");
  resolveResponse(
    jsonResponse(
      { error: { code: "DOMAIN", message: "Sessão expirada." } },
      401,
    ),
  );

  await expect(oldRequest).rejects.toMatchObject({ status: 401 });
  expect(handler).not.toHaveBeenCalled();
});

test("distingue indisponibilidade de erros HTTP", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

  await expect(api("auth/me")).rejects.toMatchObject({
    status: null,
    code: "UNAVAILABLE",
    message: "Não foi possível conectar à API. Tente novamente.",
  });
});

test("mantém 401 detectável mesmo quando a resposta não é JSON", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("indisponível", { status: 401 })),
  );

  await expect(api("pessoas")).rejects.toMatchObject({
    status: 401,
    code: "INVALID_RESPONSE",
  });
  expect(handler).toHaveBeenCalledOnce();
});

test("downloads usam o mesmo tratamento central de autenticação", async () => {
  const handler = vi.fn();
  onUnauthorized(handler);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response("arquivo", { status: 200 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "DOMAIN", message: "Sessão expirada." } },
          401,
        ),
      ),
  );

  expect(await (await apiBlob("exportacoes/pessoas/csv")).text()).toBe(
    "arquivo",
  );
  await expect(apiBlob("exportacoes/pessoas/csv")).rejects.toMatchObject({
    status: 401,
  });
  expect(handler).toHaveBeenCalledOnce();
});
