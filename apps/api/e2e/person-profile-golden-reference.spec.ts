import { expect, test, type Page } from "@playwright/test";
import argon2 from "argon2";
import { PrismaClient } from "@duali/database";
import { testDatabaseUrl } from "../src/test-helper.js";

const email = "profile-golden@example.test";
const password = "ProfileGolden!2026";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral" }),
  ).toBeVisible();
}

test("Perfil e edição de Pessoa compõem as Golden References", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  try {
    const user = await db.usuario.upsert({
      where: { email },
      update: {
        nome: "Marina Perfil",
        senhaHash: await argon2.hash(password),
        ativo: true,
      },
      create: {
        nome: "Marina Perfil",
        email,
        senhaHash: await argon2.hash(password),
      },
    });
    const unit = await db.unidade.upsert({
      where: { sigla: "UPG" },
      update: { nome: "Unidade Perfil Golden", uf: "RJ", ativa: true },
      create: { nome: "Unidade Perfil Golden", sigla: "UPG", uf: "RJ" },
    });
    const team = await db.equipe.upsert({
      where: { nome: "Equipe Perfil Golden" },
      update: { ativa: true },
      create: { nome: "Equipe Perfil Golden" },
    });
    const existingInstitution = await db.instituicaoEnsino.findFirst({
      where: { nome: "Universidade Perfil Golden" },
    });
    const institution = existingInstitution
      ? await db.instituicaoEnsino.update({
          where: { id: existingInstitution.id },
          data: { sigla: "UPG", ativa: true },
        })
      : await db.instituicaoEnsino.create({
          data: { nome: "Universidade Perfil Golden", sigla: "UPG" },
        });
    const supplier = await db.fornecedor.upsert({
      where: { nome: "Fornecedor Perfil Golden" },
      update: { ativo: true },
      create: { nome: "Fornecedor Perfil Golden" },
    });
    const config = await db.configuracaoBeneficio.upsert({
      where: {
        unidadeId_tipo_fornecedorId: {
          unidadeId: unit.id,
          tipo: "ALIMENTACAO",
          fornecedorId: supplier.id,
        },
      },
      update: { ativa: true },
      create: {
        unidadeId: unit.id,
        tipo: "ALIMENTACAO",
        fornecedorId: supplier.id,
      },
    });
    const previousPerson = await db.pessoa.findFirst({
      where: { email: "marina.perfil@example.test" },
      include: { vinculos: true },
    });
    if (previousPerson) {
      const linkIds = previousPerson.vinculos.map((link) => link.id);
      const benefits = await db.beneficioVinculo.findMany({
        where: { vinculoId: { in: linkIds } },
        select: { id: true },
      });
      await db.auditoria.deleteMany({
        where: { entidadeId: previousPerson.id },
      });
      await db.beneficioCompetencia.deleteMany({
        where: { beneficioVinculoId: { in: benefits.map((item) => item.id) } },
      });
      await db.beneficioVinculo.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.descansoConsumo.deleteMany({
        where: { periodo: { vinculoId: { in: linkIds } } },
      });
      await db.descansoPeriodo.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.descansoDireito.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.descansoAjuste.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.documentoVinculo.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.seguroEstagio.deleteMany({
        where: { vinculoId: { in: linkIds } },
      });
      await db.estagio.deleteMany({ where: { vinculoId: { in: linkIds } } });
      await db.vinculo.deleteMany({ where: { id: { in: linkIds } } });
      await db.pessoa.delete({ where: { id: previousPerson.id } });
    }
    const person = await db.pessoa.create({
      data: {
        nomeCompleto: "Marina Oliveira Perfil",
        nomeSocial: "Registro histórico preservado",
        email: "marina.perfil@example.test",
        rg: "123456789",
        telefone: "21987654321",
        dataNascimento: new Date("1998-05-18"),
        observacoes: "Pessoa usada na referência visual do Perfil.",
      },
    });
    const link = await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        equipeId: team.id,
        tipo: "ESTAGIO",
        status: "ATIVO",
        dataAdmissao: new Date("2025-01-06"),
        matricula: "EST-2025-018",
        cargoFuncao: "Estágio em Produto",
        gestor: "Douglas Marins",
      },
    });
    await db.estagio.create({
      data: {
        vinculoId: link.id,
        instituicaoEnsinoId: institution.id,
        periodoAcademico: "5º período",
        valorBolsa: "1850.00",
        dataTerminoPrevista: new Date("2027-01-05"),
      },
    });
    const right = await db.descansoDireito.create({
      data: {
        vinculoId: link.id,
        dataAquisicao: new Date("2025-07-06"),
        inicioAquisitivo: new Date("2025-01-06"),
        fimAquisitivo: new Date("2025-07-05"),
        quantidadeDias: "15",
        prazoConcessivo: new Date("2026-01-05"),
      },
    });
    const period = await db.descansoPeriodo.create({
      data: {
        vinculoId: link.id,
        dataInicio: new Date("2026-10-05"),
        dataFim: new Date("2026-10-09"),
        quantidadeDias: "5",
        tipo: "DESCANSO_ESTAGIO",
        status: "PROGRAMADO",
        observacoes: "Programação de referência.",
      },
    });
    await db.descansoAjuste.create({
      data: {
        vinculoId: link.id,
        tipo: "CREDITO",
        quantidadeDias: "1",
        dataReferencia: new Date("2026-02-01"),
        motivo: "Ajuste de referência",
        criadoPor: user.id,
        criadoEm: new Date("2026-09-24T12:00:00.000Z"),
      },
    });
    await db.documentoVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "TCE",
        status: "VIGENTE",
        inicioVigencia: new Date("2025-01-06"),
        fimVigencia: new Date("2026-01-05"),
      },
    });
    await db.seguroEstagio.create({
      data: {
        vinculoId: link.id,
        seguradora: "Seguradora Perfil",
        numeroApolice: "AP-2026-018",
        inicioVigencia: new Date("2025-01-06"),
        fimVigencia: new Date("2026-01-05"),
        status: "ATIVO",
      },
    });
    const benefit = await db.beneficioVinculo.create({
      data: {
        vinculoId: link.id,
        tipo: "ALIMENTACAO",
        inicioVigencia: new Date("2026-01-01"),
        configuracaoRecorrenteId: config.id,
        valorMensalRecorrente: "700.00",
      },
    });
    await db.beneficioCompetencia.create({
      data: {
        beneficioVinculoId: benefit.id,
        configuracaoId: config.id,
        competencia: new Date("2026-09-01"),
        quantidadeDias: "21",
        valorUnitario: "33.33",
        valorMensalBase: "700.00",
        valorInformado: "700.00",
        status: "PENDENTE",
      },
    });
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    if (currentMonth.getTime() !== new Date("2026-09-01").getTime()) {
      await db.beneficioCompetencia.create({
        data: {
          beneficioVinculoId: benefit.id,
          configuracaoId: config.id,
          competencia: currentMonth,
          quantidadeDias: "21",
          valorUnitario: "33.33",
          valorMensalBase: "700.00",
          valorInformado: "700.00",
          status: "PENDENTE",
        },
      });
    }
    await db.auditoria.create({
      data: {
        usuarioId: user.id,
        acao: "CRIAR",
        entidade: "pessoa",
        entidadeId: person.id,
        criadoEm: new Date("2025-01-02T12:00:00Z"),
      },
    });

    await login(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(
      `/app/pessoas/${person.id}?tab=visao&competencia=2026-09-01`,
    );
    await expect(
      page.getByRole("heading", { name: person.nomeCompleto }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveScreenshot("perfil-visao-geral-1366x768.png");

    const snapshots = [
      ["Vínculo", "perfil-vinculo-1366x768.png"],
      ["Descanso", "perfil-ferias-1366x768.png"],
      ["Benefícios", "perfil-beneficios-1366x768.png"],
      ["Documentos", "perfil-documentos-1366x768.png"],
      ["Histórico", "perfil-historico-1366x768.png"],
    ] as const;
    for (const [tab, snapshot] of snapshots) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(
          `tab=${tab === "Vínculo" ? "vinculo" : tab === "Descanso" ? "descanso" : tab === "Benefícios" ? "beneficios" : tab === "Documentos" ? "documentos" : "historico"}`,
        ),
      );
      await expect(page).toHaveScreenshot(snapshot);
    }

    await page.getByRole("tab", { name: "Visão geral" }).click();
    await page.getByRole("tab", { name: "Visão geral" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Vínculo" })).toBeFocused();
    await page.goBack();
    await expect(
      page.getByRole("tab", { name: "Visão geral" }),
    ).toHaveAttribute("aria-selected", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { name: person.nomeCompleto }).click();
    await expect(page).toHaveScreenshot("perfil-mobile-390x844.png");
    await page.getByRole("tab", { name: "Descanso" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page).toHaveScreenshot("perfil-mobile-ferias-390x844.png");

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`/app/pessoas/${person.id}/editar`);
    await expect(page.getByLabel("Nome completo")).toHaveValue(
      person.nomeCompleto,
    );
    await expect(page.getByLabel("Nome social")).toHaveCount(0);
    await expect(page.getByText("Endereço", { exact: true })).toHaveCount(0);
    await expect(page).toHaveScreenshot("pessoa-edicao-1366x768.png");
    await page.getByLabel("Telefone").fill("21999998888");
    await page.getByRole("button", { name: "Pessoas", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await expect(page.getByLabel("Telefone")).toHaveValue("21999998888");
    await page.goBack();
    await expect(
      page.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continuar editando" }).click();
    await expect(page.getByLabel("Telefone")).toHaveValue("21999998888");
    const updateRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith(`/api/pessoas/${person.id}`) &&
        request.method() === "PUT",
    );
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    const payload = (await updateRequest).postDataJSON() as Record<
      string,
      unknown
    >;
    expect(Object.keys(payload).sort()).toEqual(
      [
        "cpf",
        "dataNascimento",
        "email",
        "nomeCompleto",
        "observacoes",
        "rg",
        "telefone",
      ].sort(),
    );
    expect(payload).not.toHaveProperty("nomeSocial");
    expect(
      (await db.pessoa.findUniqueOrThrow({ where: { id: person.id } }))
        .nomeSocial,
    ).toBe("Registro histórico preservado");

    expect(right.id).toBeTruthy();
    expect(period.id).toBeTruthy();
  } finally {
    await db.$disconnect();
  }
});
