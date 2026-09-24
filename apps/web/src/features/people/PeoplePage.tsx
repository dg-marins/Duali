import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { api, display, type Row } from "../../api";
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  LoadingSkeleton,
  Notice,
  Pagination,
  RefreshingContent,
  Select,
  StatusBadge,
  type DataTableColumn,
} from "../../components/ui";
import { PageHeader, formatDate } from "../../ui";
import { usePeopleOptions } from "./usePeopleOptions";

type Navigate = (path: string) => void;
type Filters = {
  q: string;
  status: string;
  tipo: string;
  instituicaoId: string;
  unidadeId: string;
  equipeId: string;
};
type ListResult = {
  items: Row[];
  total: number;
  totalPopulacao?: number;
  page: number;
  pageSize: number;
  segmentos?: Record<string, number>;
};

const segments = [
  ["", "Todos"],
  ["CLT", "CLT"],
  ["ESTAGIO", "Estágio"],
  ["APRENDIZ", "Aprendiz"],
  ["TRAINEE", "Trainee"],
  ["SEM_VINCULO", "Sem vínculo"],
  ["INATIVO", "Inativas"],
] as const;

function queryFor(filters: Filters, page: number) {
  const query = new URLSearchParams({ page: String(page) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

function optionName(options: Row[], id: string) {
  return display(options.find((row) => String(row.id) === id));
}

export function PeoplePage({ navigate }: { navigate: Navigate }) {
  const options = usePeopleOptions();
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const [filters, setFilters] = useState<Filters>({
    q: initial.get("q") ?? "",
    status: initial.get("status") ?? "",
    tipo: initial.get("segmento") ?? initial.get("tipo") ?? "",
    instituicaoId: initial.get("instituicaoId") ?? "",
    unidadeId: initial.get("unidadeId") ?? "",
    equipeId: initial.get("equipeId") ?? "",
  });
  const [page, setPage] = useState(Number(initial.get("page") ?? 1));
  const [data, setData] = useState<ListResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
  });
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [version, setVersion] = useState(0);
  const newPersonButton = useRef<HTMLButtonElement>(null);
  const query = queryFor(filters, page);
  const hasFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    let active = true;
    history.replaceState({}, "", `/app/pessoas?${query}`);
    setLoading(true);
    const timer = setTimeout(() => {
      void api<ListResult>(`pessoas-operacional?${query}`)
        .then((result) => {
          if (!active) return;
          setData(result);
          setError("");
          setHasLoaded(true);
        })
        .catch((reason) => {
          if (active) setError((reason as Error).message);
        })
        .finally(() => {
          if (!active) return;
          setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, version]);

  useEffect(() => {
    if (loading || !hasLoaded) return;
    const stored = sessionStorage.getItem("duali.people.return");
    if (stored) {
      const context = JSON.parse(stored) as {
        url: string;
        scroll: number;
        id: string;
      };
      if (context.url === location.pathname + location.search) {
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLElement>(`[data-person-id="${context.id}"]`)
            ?.focus({ preventScroll: true });
          window.scrollTo({ top: context.scroll });
          sessionStorage.removeItem("duali.people.return");
        });
      }
    }
    const createContext = sessionStorage.getItem("duali.people.create");
    if (createContext) {
      const context = JSON.parse(createContext) as {
        url: string;
        scroll: number;
      };
      if (context.url === location.pathname + location.search) {
        requestAnimationFrame(() => {
          newPersonButton.current?.focus({ preventScroll: true });
          window.scrollTo({ top: context.scroll });
          sessionStorage.removeItem("duali.people.create");
        });
      }
    }
    const createdContext = sessionStorage.getItem("duali.people.created");
    if (createdContext) {
      const context = JSON.parse(createdContext) as { id: string; url: string };
      if (context.url === location.pathname + location.search) {
        requestAnimationFrame(() => {
          const row = document.querySelector<HTMLElement>(
            `[data-person-id="${context.id}"]`,
          );
          (row ?? newPersonButton.current)?.focus({ preventScroll: true });
          setAnnouncement(
            row
              ? "Pessoa cadastrada e selecionada na listagem."
              : "Pessoa cadastrada. Ela não aparece nos filtros atuais.",
          );
          sessionStorage.removeItem("duali.people.created");
        });
      }
    }
  }, [hasLoaded, loading]);

  const update = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters({
      q: "",
      status: "",
      tipo: "",
      instituicaoId: "",
      unidadeId: "",
      equipeId: "",
    });
    setPage(1);
  };
  const storeProfileContext = (row: Row) => {
    sessionStorage.setItem(
      "duali.people.return",
      JSON.stringify({
        url: location.pathname + location.search,
        scroll: window.scrollY,
        id: row.id,
      }),
    );
  };
  const openProfile = (row: Row) => {
    storeProfileContext(row);
    navigate(`/app/pessoas/${row.id}`);
  };
  const openCreate = () => {
    const listUrl = `/app/pessoas?${query}`;
    sessionStorage.setItem(
      "duali.people.create",
      JSON.stringify({ url: listUrl, scroll: window.scrollY }),
    );
    navigate(`/app/pessoas/nova?${query}`);
  };

  const columns: DataTableColumn[] = [
    {
      key: "nomeCompleto",
      label: "Pessoa",
      priority: "primary",
      render: (row) => (
        <div className="people-identity">
          <button
            className="link-button people-name"
            data-person-id={String(row.id)}
            title={String(row.nomeCompleto)}
            onClick={(event) => {
              event.stopPropagation();
              openProfile(row);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {String(row.nomeCompleto)}
          </button>
        </div>
      ),
    },
    {
      key: "vinculo",
      label: "Vínculo",
      priority: "always",
      render: (row) =>
        (
          ({
            ESTAGIO: "Estágio",
            APRENDIZ: "Aprendiz",
            TRAINEE: "Trainee",
            CLT: "CLT",
          }) as Record<string, string>
        )[String(row.vinculo)] ?? "Sem vínculo",
    },
    {
      key: "unidade",
      label: "Unidade",
      priority: "secondary",
      render: (row) => display(row.unidade),
    },
    {
      key: "equipe",
      label: "Equipe",
      priority: "desktop",
      render: (row) => display(row.equipe),
    },
    ...(filters.tipo === "ESTAGIO"
      ? ([
          {
            key: "instituicao",
            label: "Instituição",
            priority: "secondary",
            render: (row: Row) => {
              const institution = row.instituicao as Row | null;
              if (!institution) return "—";
              const name = String(institution.nome ?? "");
              const abbreviation = String(institution.sigla ?? "").trim();
              const label = abbreviation ? `${abbreviation} - ${name}` : name;
              return (
                <span className="people-institution" title={label}>
                  {label}
                </span>
              );
            },
          },
          {
            key: "admissao",
            label: "Início",
            priority: "desktop",
            render: (row: Row) => formatDate(row.admissao),
          },
          {
            key: "terminoPrevisto",
            label: "Término",
            priority: "desktop",
            render: (row: Row) => formatDate(row.terminoPrevisto),
          },
        ] satisfies DataTableColumn[])
      : []),
    {
      key: "status",
      label: "Situação",
      priority: "always",
      render: (row) => (
        <div className="people-status">
          <StatusBadge value={row.status} />
          {Number(row.vinculosAtivos) > 1 && (
            <StatusBadge value="INCONSISTÊNCIA" />
          )}
        </div>
      ),
    },
  ];

  const activeFilters = [
    filters.unidadeId && {
      key: "unidade",
      label: `Unidade: ${optionName(options.units, filters.unidadeId)}`,
      onRemove: () => update("unidadeId", ""),
    },
    filters.status && {
      key: "status",
      label: `Status: ${filters.status}`,
      onRemove: () => update("status", ""),
    },
    filters.equipeId && {
      key: "equipe",
      label: `Equipe: ${optionName(options.teams, filters.equipeId)}`,
      onRemove: () => update("equipeId", ""),
    },
    filters.instituicaoId && {
      key: "instituicao",
      label: `Instituição: ${optionName(options.institutions, filters.instituicaoId)}`,
      onRemove: () => update("instituicaoId", ""),
    },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;

  const initialError = Boolean(error && !hasLoaded && !data.items.length);
  return (
    <div className="people-page golden-people">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      <PageHeader
        title="Pessoas"
        description="Gerencie pessoas e vínculos da organização."
        action={
          <Button
            ref={newPersonButton}
            aria-label="+ Nova pessoa"
            onClick={openCreate}
          >
            Nova pessoa
          </Button>
        }
      />
      <nav
        className="people-segment-nav"
        aria-label="Segmento atual das pessoas"
      >
        {segments.map(([value, title]) => (
          <button
            key={value || "todos"}
            type="button"
            className="people-segment people-segment-option"
            data-segment={value || "TODOS"}
            aria-pressed={filters.tipo === value}
            onClick={() => update("tipo", filters.tipo === value ? "" : value)}
          >
            <span>{title}</span>
            <strong>
              {value
                ? (data.segmentos?.[value] ?? "—")
                : (data.totalPopulacao ?? "—")}
            </strong>
          </button>
        ))}
      </nav>
      <FilterBar
        search={filters.q}
        searchLabel="Buscar pessoa"
        searchPlaceholder="Nome, CPF, e-mail ou matrícula"
        onSearchChange={(value) => update("q", value)}
        activeFilters={activeFilters}
        {...(hasFilters ? { onClear: clearFilters } : {})}
        primaryFilters={
          <label className="people-unit-filter">
            <span>Unidade</span>
            <Select
              aria-label="Unidade"
              value={filters.unidadeId}
              onChange={(event) => update("unidadeId", event.target.value)}
            >
              <option value="">Todas as unidades</option>
              {options.units.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </Select>
          </label>
        }
      >
        <div className="people-additional-filter-heading">
          <SlidersHorizontal size={16} aria-hidden="true" /> Filtros adicionais
        </div>
        <label>
          <span>Status</span>
          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="ATIVO">Ativo</option>
            <option value="AFASTADO">Afastado</option>
          </Select>
        </label>
        <label>
          <span>Equipe</span>
          <Select
            aria-label="Equipe"
            value={filters.equipeId}
            onChange={(event) => update("equipeId", event.target.value)}
          >
            <option value="">Todas</option>
            {options.teams.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {display(row)}
              </option>
            ))}
          </Select>
        </label>
        {(filters.tipo === "ESTAGIO" || Boolean(filters.instituicaoId)) && (
          <label>
            <span>Instituição</span>
            <Select
              aria-label="Instituição"
              value={filters.instituicaoId}
              onChange={(event) => update("instituicaoId", event.target.value)}
            >
              <option value="">Todas</option>
              {options.institutions.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </Select>
          </label>
        )}
      </FilterBar>
      {error && (
        <div className="people-error">
          <Notice text={error} error />
          <Button
            variant="secondary"
            onClick={() => setVersion((current) => current + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      <section
        className="panel people-results"
        aria-labelledby="people-result-count"
      >
        <div className="result-count" id="people-result-count">
          {data.total} pessoas encontradas
        </div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando pessoas…" />
        ) : initialError ? null : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={data.items}
              columns={columns}
              primaryKey="nomeCompleto"
              responsiveStrategy="expandable"
              getRowLabel={(row) => String(row.nomeCompleto)}
              onRow={openProfile}
              empty={
                <EmptyState
                  title={
                    hasFilters
                      ? "Nenhuma pessoa encontrada com estes filtros"
                      : "Nenhuma pessoa cadastrada"
                  }
                  description={
                    hasFilters
                      ? "Revise ou limpe os filtros para ampliar a busca."
                      : "Cadastre a primeira pessoa para começar."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Limpar filtros
                      </Button>
                    ) : (
                      <Button onClick={openCreate}>
                        Adicionar primeira pessoa
                      </Button>
                    )
                  }
                />
              }
            />
          </RefreshingContent>
        )}
        {!initialError && data.total > 0 && (
          <Pagination
            page={page}
            pageSize={data.pageSize}
            total={data.total}
            onChange={setPage}
          />
        )}
      </section>
    </div>
  );
}
