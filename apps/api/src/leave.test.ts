import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { acquire, balance } from "./modules/leave-domain.js";
import { allPendings } from "./modules/pendings.js";
import { transaction } from "./core.js";
test("concurrent acquisitions, consumption, exception and cancellation reconstruct balance", async () => {
  const f = await fixture();
  try {
    const p = await f.db.pessoa.create({
      data: { nomeCompleto: "Pessoa descanso" },
    });
    const u = await f.db.unidade.create({
      data: { nome: "Unidade", sigla: f.suffix, uf: "RJ" },
    });
    const v = await f.db.vinculo.create({
      data: {
        pessoaId: p.id,
        unidadeId: u.id,
        tipo: "ESTAGIO",
        dataAdmissao: new Date("2024-01-31"),
        dataDesligamento: new Date("2024-08-01"),
        status: "DESLIGADO",
      },
    });
    await Promise.all([
      transaction(f.db, (tx) => acquire(tx, v.id, f.user.id)),
      transaction(f.db, (tx) => acquire(tx, v.id, f.user.id)),
    ]);
    expect(
      await f.db.descansoDireito.count({ where: { vinculoId: v.id } }),
    ).toBe(1);
    const right = await f.db.descansoDireito.findFirstOrThrow({
      where: { vinculoId: v.id },
    });
    const period = await f.db.descansoPeriodo.create({
      data: {
        vinculoId: v.id,
        dataInicio: new Date("2024-07-01"),
        dataFim: new Date("2024-07-20"),
        quantidadeDias: 20,
        tipo: "DESCANSO_ESTAGIO",
      },
    });
    const consume = async (motivo?: string) =>
      f.app.inject({
        method: "POST",
        url: "/api/consumos",
        headers: f.headers,
        payload: {
          periodoId: period.id,
          direitoId: right.id,
          quantidadeDias: 20,
          ...(motivo ? { motivo } : {}),
        },
      });
    expect((await consume()).statusCode).toBe(422);
    expect((await consume("Exceção sintética autorizada")).statusCode).toBe(
      201,
    );
    const ledger = await balance(f.db, v.id);
    expect(ledger.saldo).toBe(-5);
    expect(ledger.alertas.join(" ")).toContain("Saldo negativo");
    const cancel = await f.app.inject({
      method: "PUT",
      url: "/api/periodos/" + period.id,
      headers: f.headers,
      payload: {
        vinculoId: v.id,
        dataInicio: "2024-07-01",
        dataFim: "2024-07-20",
        quantidadeDias: 20,
        tipo: "DESCANSO_ESTAGIO",
        status: "CANCELADO",
        motivo: "Cancelado para correção",
      },
    });
    expect(cancel.statusCode, cancel.body).toBe(200);
    expect((await balance(f.db, v.id)).saldo).toBe(15);
    expect(
      await f.db.descansoConsumo.count({ where: { periodoId: period.id } }),
    ).toBe(1);
  } finally {
    await f.app.close();
  }
});

test("internship leave balance exposes the agreed 15, 30 and above-30 levels", async () => {
  const f = await fixture();
  try {
    const person = await f.db.pessoa.create({
      data: { nomeCompleto: "Saldo estágio" },
    });
    const unit = await f.db.unidade.create({
      data: {
        nome: `Unidade saldo ${f.suffix}`,
        sigla: f.suffix.slice(0, 8),
        uf: "RJ",
      },
    });
    const link = await f.db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "ESTAGIO",
        dataAdmissao: new Date("2024-01-01"),
      },
    });
    await f.db.descansoDireito.create({
      data: {
        vinculoId: link.id,
        dataAquisicao: new Date("2024-07-01"),
        quantidadeDias: 15,
        origem: "IMPORTACAO",
        observacoes: "Fixture",
      },
    });
    await f.db.descansoAjuste.create({
      data: {
        vinculoId: link.id,
        tipo: "DEBITO",
        quantidadeDias: 1,
        motivo: "Cenário de saldo normal",
        criadoPor: f.user.id,
      },
    });
    expect((await balance(f.db, link.id)).nivelSaldo).toBe("NORMAL");
    await f.db.descansoAjuste.create({
      data: {
        vinculoId: link.id,
        tipo: "CREDITO",
        quantidadeDias: 1,
        motivo: "Restaurar o saldo para o cenário",
        criadoPor: f.user.id,
      },
    });
    expect((await balance(f.db, link.id)).nivelSaldo).toBe("INFORMATIVA");
    const informative = await allPendings(f.db);
    expect(informative).toContainEqual(
      expect.objectContaining({
        codigo: "FERIAS_ESTAGIO_SALDO_15",
        severidade: "INFORMATIVA",
        pessoa: person.nomeCompleto,
      }),
    );
    await f.db.descansoDireito.create({
      data: {
        vinculoId: link.id,
        dataAquisicao: new Date("2025-01-01"),
        quantidadeDias: 15,
        origem: "IMPORTACAO",
        observacoes: "Fixture",
      },
    });
    expect((await balance(f.db, link.id)).nivelSaldo).toBe("ADVERTENCIA");
    await f.db.descansoAjuste.create({
      data: {
        vinculoId: link.id,
        tipo: "CREDITO",
        quantidadeDias: 1,
        motivo: "Ajuste de teste",
        criadoPor: f.user.id,
      },
    });
    const ledger = await balance(f.db, link.id);
    expect(ledger.nivelSaldo).toBe("ALERTA");
    expect(ledger.codigoAlerta).toBe("FERIAS_ESTAGIO_SALDO_ACIMA_30");
    expect(await allPendings(f.db)).toContainEqual(
      expect.objectContaining({
        codigo: "FERIAS_ESTAGIO_SALDO_ACIMA_30",
        severidade: "CRITICA",
        pessoa: person.nomeCompleto,
      }),
    );
  } finally {
    await f.app.close();
  }
});
