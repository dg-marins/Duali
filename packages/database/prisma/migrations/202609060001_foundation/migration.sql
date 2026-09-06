-- CreateEnum
CREATE TYPE "TipoVinculo" AS ENUM ('CLT', 'ESTAGIO');

-- CreateEnum
CREATE TYPE "StatusVinculo" AS ENUM ('ATIVO', 'AFASTADO', 'DESLIGADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" UUID NOT NULL,
    "nomeCompleto" VARCHAR(180) NOT NULL,
    "nomeSocial" VARCHAR(180),
    "cpf" VARCHAR(11),
    "rg" VARCHAR(30),
    "dataNascimento" DATE,
    "email" VARCHAR(180),
    "telefone" VARCHAR(30),
    "endereco" TEXT,
    "observacoes" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidade" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" VARCHAR(2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "diasAlerta" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vinculo" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "unidadeId" UUID NOT NULL,
    "equipeId" UUID,
    "tipo" "TipoVinculo" NOT NULL,
    "status" "StatusVinculo" NOT NULL DEFAULT 'ATIVO',
    "matricula" TEXT,
    "dataAdmissao" DATE NOT NULL,
    "dataDesligamento" DATE,
    "cargoFuncao" TEXT,
    "gestor" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_cpf_key" ON "Pessoa"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_sigla_key" ON "Unidade"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_nome_key" ON "Equipe"("nome");

-- CreateIndex
CREATE INDEX "Vinculo_pessoaId_idx" ON "Vinculo"("pessoaId");

-- CreateIndex
CREATE INDEX "Vinculo_unidadeId_status_idx" ON "Vinculo"("unidadeId", "status");

-- CreateIndex
CREATE INDEX "Vinculo_equipeId_idx" ON "Vinculo"("equipeId");

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vinculo" ADD CONSTRAINT "Vinculo_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
