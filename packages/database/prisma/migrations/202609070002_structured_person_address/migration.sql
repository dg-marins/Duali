ALTER TABLE "Pessoa"
ADD COLUMN "cep" VARCHAR(9),
ADD COLUMN "logradouro" TEXT,
ADD COLUMN "numeroEndereco" VARCHAR(30),
ADD COLUMN "complemento" TEXT,
ADD COLUMN "bairro" TEXT,
ADD COLUMN "cidadeEndereco" TEXT,
ADD COLUMN "ufEndereco" VARCHAR(2);
