import { useEffect, useState } from "react";
import { api, type Row } from "../../api";

type ListResult = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};

export type PeopleOptions = {
  units: Row[];
  teams: Row[];
  institutions: Row[];
  suppliers: Row[];
};

export function usePeopleOptions() {
  const [options, setOptions] = useState<PeopleOptions>({
    units: [],
    teams: [],
    institutions: [],
    suppliers: [],
  });
  useEffect(() => {
    const loadAll = async (resource: string) => {
      const first = await api<ListResult>(`${resource}?page=1&pageSize=100`);
      const pages = Math.ceil(first.total / first.pageSize);
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          api<ListResult>(`${resource}?page=${index + 2}&pageSize=100`),
        ),
      );
      return [...first.items, ...remaining.flatMap((page) => page.items)];
    };
    void Promise.all([
      loadAll("unidades"),
      loadAll("equipes"),
      loadAll("instituicoes"),
      loadAll("fornecedores"),
    ]).then(([units, teams, institutions, suppliers]) =>
      setOptions({ units, teams, institutions, suppliers }),
    );
  }, []);
  return options;
}
