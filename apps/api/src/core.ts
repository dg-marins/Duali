import { Prisma, type PrismaClient } from "@duali/database";
import { z } from "@duali/shared";
import { AsyncLocalStorage } from "node:async_hooks";
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Row = Record<string, unknown>;
export type Tx = Prisma.TransactionClient;
export interface Delegate {
  findMany(args?: Row): Promise<Row[]>;
  findUnique(args: Row): Promise<Row | null>;
  findFirst(args?: Row): Promise<Row | null>;
  count(args?: Row): Promise<number>;
  create(args: Row): Promise<Row>;
  update(args: Row): Promise<Row>;
}
export function model(db: Tx, name: string): Delegate {
  return (db as unknown as Record<string, Delegate>)[name]!;
}
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function audit(
  tx: Tx,
  userId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  before?: unknown,
  after?: unknown,
) {
  const clean = (value: unknown): Prisma.InputJsonValue => json(value);
  await tx.auditoria.create({
    data: {
      usuarioId: userId,
      acao,
      entidade,
      entidadeId,
      ...(requestContext.getStore()?.requestId
        ? { requestId: requestContext.getStore()!.requestId }
        : {}),
      ...(before === undefined ? {} : { dadosAnteriores: clean(before) }),
      ...(after === undefined ? {} : { dadosNovos: clean(after) }),
    },
  });
}
export async function transaction<T>(
  db: PrismaClient,
  work: (tx: Tx) => Promise<T>,
  timeout = 20000,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout,
        maxWait: 15000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        attempt < 2
      )
        continue;
      throw e;
    }
  }
}
export function dateData(data: Row, fields: string[]): Row {
  const result = { ...data };
  for (const key of fields) {
    if (typeof result[key] === "string")
      result[key] = new Date(result[key] as string);
  }
  return result;
}
export const paramsId = z.object({ id: z.string().uuid() });
