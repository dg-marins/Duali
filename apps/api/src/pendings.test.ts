import { expect, test } from "vitest";
import { fixture } from "./test-helper.js";
test("pending center aggregates persistent import review and dependencies", async () => {
  const f = await fixture();
  try {
    const batch = await f.db.importacao.create({
      data: {
        usuarioId: f.user.id,
        nomeArquivo: "synthetic.xlsx",
        arquivo: new Uint8Array([1]),
        planilhas: [],
        status: "PARCIAL",
      },
    });
    await f.db.importacaoItem.createMany({
      data: [
        {
          importacaoId: batch.id,
          ordem: 1,
          grupo: "pessoa",
          dominio: "pessoas",
          aba: "RJ",
          numeroLinha: 2,
          dadosOriginais: {},
          dadosNormalizados: { nomeCompleto: "Pessoa sintética" },
          referencias: {},
          status: "REVISAO",
          mensagens: ["cpf: CPF inválido"],
          candidatos: [],
          destinoId: crypto.randomUUID(),
        },
        {
          importacaoId: batch.id,
          ordem: 2,
          grupo: "vinculo",
          dominio: "vinculos",
          aba: "RJ",
          numeroLinha: 2,
          dadosOriginais: {},
          dadosNormalizados: {},
          referencias: {},
          status: "AGUARDANDO_DEPENDENCIA",
          acao: "CRIAR",
          mensagens: [],
          candidatos: [],
          destinoId: crypto.randomUUID(),
        },
      ],
    });
    const response = await f.app.inject({
      url: "/api/pendencias?modulo=IMPORTACAO&pageSize=100",
      headers: f.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<{
      items: { codigo: string }[];
      total: number;
    }>();
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.items.map((i) => i.codigo)).toEqual(
      expect.arrayContaining(["CPF_INVALIDO", "DEPENDENCIA_NAO_PUBLICADA"]),
    );
  } finally {
    await f.app.close();
  }
});
