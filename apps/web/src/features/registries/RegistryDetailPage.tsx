import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import { RecordForm } from "../../components";
import {
  Button,
  DataTable,
  Dialog,
  EmptyState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  RefreshingContent,
  StatusBadge,
} from "../../components/ui";
import { screens } from "../../resources";

type Navigate = (path: string) => void;
type ListResult = { items: Row[] };

const registryRelations: Record<
  string,
  Array<{ title: string; endpoint: (id: string) => string }>
> = {
  unidades: [
    {
      title: "Vínculos da unidade",
      endpoint: (id) => `vinculos?unidadeId=${id}`,
    },
    {
      title: "Configurações de benefícios",
      endpoint: (id) => `configuracoes-beneficios?unidadeId=${id}`,
    },
  ],
  equipes: [
    {
      title: "Vínculos da equipe",
      endpoint: (id) => `vinculos?equipeId=${id}`,
    },
  ],
  instituicoes: [
    {
      title: "Estágios relacionados",
      endpoint: (id) => `estagios?instituicaoEnsinoId=${id}`,
    },
  ],
  fornecedores: [
    {
      title: "Configurações relacionadas",
      endpoint: (id) => `configuracoes-beneficios?fornecedorId=${id}`,
    },
  ],
};

function statusValue(value: unknown) {
  return typeof value === "boolean" ? (value ? "ATIVO" : "INATIVO") : value;
}

export function RegistryDetailPage({
  resource,
  id,
  navigate,
}: {
  resource: string;
  id: string;
  navigate: Navigate;
}) {
  const screen = screens.find((item) => item.path === resource)!;
  const [record, setRecord] = useState<Row | null>(null);
  const [relations, setRelations] = useState<
    Array<{ title: string; items: Row[] }>
  >([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const definitions = registryRelations[resource] ?? [];
    void Promise.all([
      api<Row>(`${resource}/${id}`),
      ...definitions.map((definition) =>
        api<ListResult>(definition.endpoint(id)).then((result) => ({
          title: definition.title,
          items: result.items,
        })),
      ),
    ])
      .then(([current, ...related]) => {
        if (!active) return;
        setRecord(current as Row);
        setRelations(related as Array<{ title: string; items: Row[] }>);
        setError("");
        setHasLoaded(true);
      })
      .catch((reason: unknown) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, resource, version]);

  if (loading && !hasLoaded)
    return <LoadingSkeleton variant="detail" label="Carregando detalhes…" />;

  if (!record)
    return (
      <div className="registry-detail-error">
        <Notice text={error || "Não foi possível carregar o cadastro."} error />
        <Button
          variant="secondary"
          onClick={() => setVersion((value) => value + 1)}
        >
          Tentar novamente
        </Button>
      </div>
    );

  return (
    <RefreshingContent refreshing={loading}>
      <div className="registry-detail-page">
        {error && <Notice text={error} error />}
        <PageHeader
          title={display(record)}
          description={`Detalhes e relacionamentos de ${screen.title.toLowerCase()}.`}
          breadcrumb={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/app/cadastros/${resource}`)}
            >
              ← {screen.title}
            </Button>
          }
          action={
            <Button onClick={() => setEditing(true)}>Editar cadastro</Button>
          }
        />

        <Dialog
          open={editing}
          onOpenChange={setEditing}
          title={`Editar · ${screen.title}`}
          description={screen.description}
          className="registry-dialog"
          size="lg"
        >
          {editing && (
            <RecordForm
              embedded
              screen={screen}
              record={record}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setVersion((value) => value + 1);
              }}
            />
          )}
        </Dialog>

        <section className="panel registry-detail-summary">
          <h2>Cadastro</h2>
          <dl>
            {screen.columns.map((key) => {
              const status = ["ativo", "ativa", "status"].includes(key);
              return (
                <div key={key}>
                  <dt>
                    {screen.fields.find((field) => field.key === key)?.label ??
                      key}
                  </dt>
                  <dd>
                    {status ? (
                      <StatusBadge value={statusValue(record[key])} />
                    ) : (
                      display(record[key])
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        {relations.map((relation) => (
          <section className="panel registry-relation" key={relation.title}>
            <h2>{relation.title}</h2>
            <DataTable
              rows={relation.items}
              responsiveStrategy="priority"
              primaryKey="registro"
              columns={[
                {
                  key: "registro",
                  label: "Registro",
                  priority: "primary",
                  render: (row) => display(row),
                },
                { key: "tipo", label: "Tipo", priority: "secondary" },
                {
                  key: "status",
                  label: "Situação",
                  priority: "always",
                  render: (row) => (
                    <StatusBadge value={statusValue(row.status)} />
                  ),
                },
              ]}
              empty={
                <EmptyState
                  title="Nenhum relacionamento"
                  description="Ainda não há registros relacionados."
                />
              }
            />
          </section>
        ))}
      </div>
    </RefreshingContent>
  );
}
