import { DomainError, type Tx } from "../core.js";

export function currentEmployment<T extends { status: string }>(
  links: T[],
): T | null {
  const current = links.filter(
    (link) => link.status === "ATIVO" || link.status === "AFASTADO",
  );
  if (current.length > 1)
    throw new DomainError(
      409,
      "Mais de um vínculo atual encontrado. O RH deve resolver os vínculos ATIVO/AFASTADO antes de continuar.",
    );
  return current[0] ?? null;
}

export async function assertCurrentEmployment(
  tx: Tx,
  pessoaId: string,
  status: unknown,
  id?: string,
) {
  if (status !== "ATIVO" && status !== "AFASTADO") return;
  const existing = await tx.vinculo.findFirst({
    where: {
      pessoaId,
      status: { in: ["ATIVO", "AFASTADO"] },
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });
  if (existing)
    throw new DomainError(
      409,
      "Esta pessoa já possui um vínculo ATIVO ou AFASTADO. Encerre o vínculo atual antes de criar ou reativar outro.",
    );
}
