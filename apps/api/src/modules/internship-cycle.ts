import type { Row } from "../core.js";

type Document = {
  id: string;
  tipo: string;
  status: string;
  inicioVigencia: Date | null;
  fimVigencia: Date | null;
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function documentState(document: Document, now = new Date()) {
  const today = startOfDay(now);
  if (document.status === "CANCELADO") return "CANCELADO";
  if (!document.inicioVigencia || !document.fimVigencia)
    return "VIGENCIA_INCOMPLETA";
  if (document.inicioVigencia > today) return "PLANEJADO";
  if (document.fimVigencia <= today) return "VENCIDO";
  return document.status === "VIGENTE" ? "ASSINADO" : "AGUARDANDO_ASSINATURA";
}

export function resolveDocumentCycle(documents: Document[], now = new Date()) {
  const today = startOfDay(now);
  const relevant = documents.filter(
    (document) =>
      ["TCE", "ADITIVO", "RENOVACAO"].includes(document.tipo) &&
      document.status !== "CANCELADO",
  );
  const current = relevant.filter(
    (document) =>
      document.inicioVigencia &&
      document.fimVigencia &&
      document.inicioVigencia <= today &&
      document.fimVigencia > today,
  );
  const next = relevant
    .filter(
      (document) => document.inicioVigencia && document.inicioVigencia > today,
    )
    .sort(
      (left, right) =>
        left.inicioVigencia!.getTime() - right.inicioVigencia!.getTime(),
    )[0];
  const incomplete = relevant.filter(
    (document) => !document.inicioVigencia || !document.fimVigencia,
  );
  const last = [...relevant]
    .filter((document) => document.fimVigencia && document.fimVigencia <= today)
    .sort(
      (left, right) =>
        right.fimVigencia!.getTime() - left.fimVigencia!.getTime(),
    )[0];
  return {
    atual: current.length === 1 ? current[0] : null,
    proximo: next ?? null,
    sobreposto: current.length > 1,
    incompleto: incomplete.length > 0,
    vencidoSemSucessor: !current.length && !next && Boolean(last),
  };
}

export function presentDocument(document: Document, now = new Date()): Row {
  return { ...document, estadoOperacional: documentState(document, now) };
}
