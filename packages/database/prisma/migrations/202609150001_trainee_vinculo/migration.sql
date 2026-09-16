-- Adiciona Trainee sem alterar registros existentes.
ALTER TYPE "TipoVinculo" ADD VALUE IF NOT EXISTS 'TRAINEE';
