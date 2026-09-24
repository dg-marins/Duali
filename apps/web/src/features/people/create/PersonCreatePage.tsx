import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, display, type ApiError, type Row } from "../../../api";
import {
  Button,
  Checkbox,
  ConfirmDialog,
  CurrencyInput,
  DateInput,
  FormField,
  Input,
  Notice,
  Select,
  Stepper,
  Textarea,
  type StepperItem,
} from "../../../components/ui";
import { PageHeader, formatDate, money } from "../../../ui";
import { registerNavigationGuard } from "../../../navigationGuard";
import { usePeopleOptions } from "../usePeopleOptions";
import {
  applicableSteps,
  buildPersonCreateRequest,
  initialPersonCreateState,
  validateCreateStep,
  type CreateStep,
  type FieldErrors,
  type PersonCreateState,
  type ScaleValue,
} from "./personCreateModel";

const stepLabels: Record<CreateStep, string> = {
  personal: "Dados pessoais",
  link: "Vínculo",
  internship: "Dados do estágio",
  review: "Revisão",
};
const weekdays = [
  ["SEGUNDA", "Segunda"],
  ["TERCA", "Terça"],
  ["QUARTA", "Quarta"],
  ["QUINTA", "Quinta"],
  ["SEXTA", "Sexta"],
  ["SABADO", "Sábado"],
  ["DOMINGO", "Domingo"],
] as const;

function ScaleFields({
  value,
  error,
  onChange,
}: {
  value: ScaleValue;
  error?: string | undefined;
  onChange: (value: ScaleValue) => void;
}) {
  const selected = value?.tipo === "DIAS_SEMANA" ? value.diasSemana : [];
  return (
    <fieldset
      className="person-create-scale"
      aria-describedby={error ? "scale-error" : undefined}
    >
      <legend>Escala de dias trabalhados</legend>
      <FormField label="Modalidade">
        <Select
          value={value?.tipo ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value === "DIAS_SEMANA"
                ? { tipo: "DIAS_SEMANA", diasSemana: [] }
                : event.target.value === "QUANTIDADE_SEMANAL"
                  ? { tipo: "QUANTIDADE_SEMANAL", quantidadeDiasSemana: 1 }
                  : null,
            )
          }
        >
          <option value="">Não informar agora</option>
          <option value="DIAS_SEMANA">Dias específicos da semana</option>
          <option value="QUANTIDADE_SEMANAL">
            Quantidade de dias por semana
          </option>
        </Select>
      </FormField>
      {value?.tipo === "QUANTIDADE_SEMANAL" && (
        <FormField label="Dias por semana" error={error}>
          <Input
            type="number"
            min={1}
            max={7}
            value={value.quantidadeDiasSemana}
            onChange={(event) =>
              onChange({
                tipo: "QUANTIDADE_SEMANAL",
                quantidadeDiasSemana: Number(event.target.value),
              })
            }
          />
        </FormField>
      )}
      {value?.tipo === "DIAS_SEMANA" && (
        <div
          className="person-create-weekdays"
          role="group"
          aria-label="Dias da semana"
        >
          {weekdays.map(([day, label]) => (
            <label
              key={day}
              className={selected.includes(day) ? "is-selected" : ""}
            >
              <Checkbox
                checked={selected.includes(day)}
                onChange={(event) =>
                  onChange({
                    tipo: "DIAS_SEMANA",
                    diasSemana: event.target.checked
                      ? [...selected, day]
                      : selected.filter((item) => item !== day),
                  })
                }
              />
              {label}
            </label>
          ))}
          {error && (
            <p id="scale-error" className="field-error">
              {error}
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}

function ReviewValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value === null || value === undefined || value === ""
          ? "—"
          : String(value)}
      </dd>
    </div>
  );
}

export function PersonCreatePage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const options = usePeopleOptions();
  const [form, setForm] = useState<PersonCreateState>(initialPersonCreateState);
  const [step, setStep] = useState<CreateStep>("personal");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    name: string;
    link: boolean;
  } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const releaseGuard = useRef<(() => void) | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const initialJson = useMemo(
    () => JSON.stringify(initialPersonCreateState),
    [],
  );
  const dirty = !created && JSON.stringify(form) !== initialJson;
  const steps = applicableSteps(form);
  const currentIndex = steps.indexOf(step);
  const listPath = `/app/pessoas${location.search || "?page=1"}`;

  useEffect(() => {
    if (!dirty) return;
    const unregister = registerNavigationGuard((_destination, proceed) => {
      pendingNavigation.current = proceed;
      setConfirmDiscard(true);
      return true;
    });
    releaseGuard.current = unregister;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const marker = { ...(history.state ?? {}), dualiCreateGuard: true };
    history.pushState(marker, "", location.href);
    let allowing = false;
    const back = () => {
      if (allowing) return;
      history.pushState(marker, "", location.href);
      pendingNavigation.current = () => {
        allowing = true;
        history.go(-2);
      };
      setConfirmDiscard(true);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [dirty]);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const updatePerson = (
    key: keyof PersonCreateState["pessoa"],
    value: string,
  ) =>
    setForm((current) => ({
      ...current,
      pessoa: { ...current.pessoa, [key]: value },
    }));
  const updateLink = (
    key: keyof PersonCreateState["vinculo"],
    value: unknown,
  ) =>
    setForm((current) => ({
      ...current,
      vinculo: { ...current.vinculo, [key]: value },
    }));
  const updateInternship = (
    key: keyof PersonCreateState["estagio"],
    value: string,
  ) =>
    setForm((current) => ({
      ...current,
      estagio: { ...current.estagio, [key]: value },
    }));

  const validate = (target: CreateStep) => {
    const nextErrors = validateCreateStep(form, target);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(
            `[data-field="${first}"], [data-field="${first}"] input, [data-field="${first}"] select, [data-field="${first}"] textarea`,
          )
          ?.focus(),
      );
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validate(step)) return;
    setStep(steps[currentIndex + 1] ?? "review");
  };
  const back = () =>
    setStep(steps[Math.max(0, currentIndex - 1)] ?? "personal");

  async function submit() {
    if (busy) return;
    for (const candidate of steps.filter((item) => item !== "review")) {
      if (!validate(candidate)) {
        setStep(candidate);
        return;
      }
    }
    setBusy(true);
    setGlobalError("");
    try {
      const request = buildPersonCreateRequest(form);
      const result = await api<Row>(request.endpoint, "POST", request.payload);
      const id = String(
        request.endpoint === "pessoas-com-vinculo"
          ? ((result.pessoa as Row | undefined)?.id ?? "")
          : (result.id ?? ""),
      );
      if (!id) throw new Error("A API não retornou a pessoa criada.");
      releaseGuard.current?.();
      setCreated({
        id,
        name: form.pessoa.nomeCompleto.trim(),
        link: form.incluirVinculo,
      });
    } catch (reason) {
      const apiError = reason as ApiError;
      setGlobalError((reason as Error).message);
      if (apiError.fields) {
        const mapped: FieldErrors = {};
        Object.entries(apiError.fields).forEach(([key, messages]) => {
          if (messages[0]) mapped[key.split(".").at(-1)!] = messages[0];
        });
        setErrors((current) => ({ ...current, ...mapped }));
      }
    } finally {
      setBusy(false);
    }
  }

  const stepper: StepperItem[] = steps.map((item, index) => ({
    id: item,
    label: stepLabels[item],
    status:
      index < currentIndex
        ? "complete"
        : index === currentIndex
          ? "current"
          : "upcoming",
  }));

  const leave = (destination: string, createdId?: string) => {
    if (createdId)
      sessionStorage.setItem(
        "duali.people.created",
        JSON.stringify({ id: createdId, url: listPath }),
      );
    navigate(destination);
  };

  const openCreatedProfile = () => {
    const stored = sessionStorage.getItem("duali.people.create");
    const scroll = stored
      ? ((JSON.parse(stored) as { scroll?: number }).scroll ?? 0)
      : 0;
    sessionStorage.setItem(
      "duali.people.return",
      JSON.stringify({ url: listPath, scroll, id: created!.id }),
    );
    leave(`/app/pessoas/${created!.id}`);
  };

  if (created)
    return (
      <main className="person-create-page person-create-success">
        <section
          className="panel"
          aria-labelledby="person-create-success-title"
        >
          <CheckCircle2 size={44} aria-hidden="true" />
          <h1 id="person-create-success-title">Pessoa cadastrada</h1>
          <p>
            <strong>{created.name}</strong> foi cadastrada{" "}
            {created.link ? "com vínculo ativo." : "sem vínculo inicial."}
          </p>
          <div className="person-create-success-actions">
            <Button onClick={openCreatedProfile}>Abrir perfil</Button>
            <Button
              variant="secondary"
              onClick={() => leave(listPath, created.id)}
            >
              Voltar para Pessoas
            </Button>
          </div>
        </section>
      </main>
    );

  const activeUnits = options.units.filter((row) => row.ativa !== false);
  const activeTeams = [...options.teams]
    .filter((row) => row.ativa !== false)
    .sort((a, b) =>
      display(a).localeCompare(display(b), "pt-BR", { sensitivity: "base" }),
    );
  const activeInstitutions = options.institutions.filter(
    (row) => row.ativa !== false,
  );

  return (
    <main className="person-create-page">
      <PageHeader
        title="Nova pessoa"
        description="Cadastre os dados da pessoa e, se desejar, seu vínculo inicial."
        breadcrumb={
          <button className="link-button" onClick={() => navigate(listPath)}>
            ← Pessoas
          </button>
        }
      />
      <section className="panel person-create-card">
        <Stepper steps={stepper} onStep={(id) => setStep(id as CreateStep)} />
        <div className="person-create-stage" aria-live="polite">
          <h2 ref={heading} tabIndex={-1}>
            {stepLabels[step]}
          </h2>
          {globalError && <Notice text={globalError} error />}

          {step === "personal" && (
            <div className="person-create-grid">
              <FormField
                label="Nome completo"
                required
                error={errors.nomeCompleto}
                className="wide"
              >
                <Input
                  data-field-input
                  data-field="nomeCompleto"
                  value={form.pessoa.nomeCompleto}
                  onChange={(e) => updatePerson("nomeCompleto", e.target.value)}
                />
              </FormField>
              <FormField label="CPF" error={errors.cpf}>
                <Input
                  data-field="cpf"
                  inputMode="numeric"
                  value={form.pessoa.cpf}
                  onChange={(e) =>
                    updatePerson("cpf", e.target.value.replace(/\D/g, ""))
                  }
                />
              </FormField>
              <FormField label="RG">
                <Input
                  value={form.pessoa.rg}
                  onChange={(e) =>
                    updatePerson("rg", e.target.value.replace(/\D/g, ""))
                  }
                />
              </FormField>
              <FormField
                label="Data de nascimento"
                error={errors.dataNascimento}
              >
                <DateInput
                  data-field="dataNascimento"
                  value={form.pessoa.dataNascimento}
                  onChange={(e) =>
                    updatePerson("dataNascimento", e.target.value)
                  }
                />
              </FormField>
              <FormField label="E-mail" error={errors.email}>
                <Input
                  data-field="email"
                  type="email"
                  value={form.pessoa.email}
                  onChange={(e) => updatePerson("email", e.target.value)}
                />
              </FormField>
              <FormField label="Telefone" error={errors.telefone}>
                <Input
                  data-field="telefone"
                  inputMode="tel"
                  value={form.pessoa.telefone}
                  onChange={(e) =>
                    updatePerson("telefone", e.target.value.replace(/\D/g, ""))
                  }
                />
              </FormField>
              <FormField label="Observações" className="wide">
                <Textarea
                  value={form.pessoa.observacoes}
                  onChange={(e) => updatePerson("observacoes", e.target.value)}
                />
              </FormField>
            </div>
          )}

          {step === "link" && (
            <div className="person-create-link-step">
              <label className="person-create-toggle">
                <Checkbox
                  checked={form.incluirVinculo}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      incluirVinculo: e.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>Adicionar vínculo inicial</strong>
                  <small>
                    Você também pode cadastrar apenas a pessoa e incluir o
                    vínculo depois.
                  </small>
                </span>
              </label>
              {form.incluirVinculo && (
                <div className="person-create-grid">
                  <FormField label="Unidade" required error={errors.unidadeId}>
                    <Select
                      data-field="unidadeId"
                      value={form.vinculo.unidadeId}
                      onChange={(e) => updateLink("unidadeId", e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {activeUnits.map((row) => (
                        <option key={String(row.id)} value={String(row.id)}>
                          {display(row)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Equipe">
                    <Select
                      value={form.vinculo.equipeId}
                      onChange={(e) => updateLink("equipeId", e.target.value)}
                    >
                      <option value="">Sem equipe</option>
                      {activeTeams.map((row) => (
                        <option key={String(row.id)} value={String(row.id)}>
                          {display(row)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Tipo" required>
                    <Select
                      value={form.vinculo.tipo}
                      onChange={(e) => updateLink("tipo", e.target.value)}
                    >
                      <option value="CLT">CLT</option>
                      <option value="ESTAGIO">Estágio</option>
                      <option value="APRENDIZ">Aprendiz</option>
                      <option value="TRAINEE">Trainee</option>
                    </Select>
                  </FormField>
                  <FormField
                    label="Admissão"
                    required
                    error={errors.dataAdmissao}
                  >
                    <DateInput
                      data-field="dataAdmissao"
                      value={form.vinculo.dataAdmissao}
                      onChange={(e) =>
                        updateLink("dataAdmissao", e.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Matrícula">
                    <Input
                      value={form.vinculo.matricula}
                      onChange={(e) => updateLink("matricula", e.target.value)}
                    />
                  </FormField>
                  <FormField label="Cargo/Função">
                    <Input
                      value={form.vinculo.cargoFuncao}
                      onChange={(e) =>
                        updateLink("cargoFuncao", e.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Gestor">
                    <Input
                      value={form.vinculo.gestor}
                      onChange={(e) => updateLink("gestor", e.target.value)}
                    />
                  </FormField>
                  <ScaleFields
                    value={form.vinculo.escalaEstruturada}
                    error={errors.escalaEstruturada}
                    onChange={(value) => updateLink("escalaEstruturada", value)}
                  />
                </div>
              )}
            </div>
          )}

          {step === "internship" && (
            <div className="person-create-grid">
              <FormField label="Instituição de ensino">
                <Select
                  value={form.estagio.instituicaoEnsinoId}
                  onChange={(e) =>
                    updateInternship("instituicaoEnsinoId", e.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  {activeInstitutions.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {display(row)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Período acadêmico">
                <Input
                  value={form.estagio.periodoAcademico}
                  onChange={(e) =>
                    updateInternship("periodoAcademico", e.target.value)
                  }
                />
              </FormField>
              <FormField label="Bolsa">
                <CurrencyInput
                  value={form.estagio.valorBolsa}
                  onValueChange={(value) =>
                    updateInternship("valorBolsa", value)
                  }
                />
              </FormField>
              <FormField
                label="Fim previsto do estágio"
                error={errors.dataTerminoPrevista}
              >
                <DateInput
                  data-field="dataTerminoPrevista"
                  value={form.estagio.dataTerminoPrevista}
                  onChange={(e) =>
                    updateInternship("dataTerminoPrevista", e.target.value)
                  }
                />
              </FormField>
              <FormField
                label="Periodicidade do TCE/aditivo (meses)"
                error={errors.periodicidadeDocumentoMeses}
              >
                <Input
                  data-field="periodicidadeDocumentoMeses"
                  type="number"
                  min={1}
                  max={120}
                  value={form.estagio.periodicidadeDocumentoMeses}
                  onChange={(e) =>
                    updateInternship(
                      "periodicidadeDocumentoMeses",
                      e.target.value,
                    )
                  }
                />
              </FormField>
              <FormField label="Situação inicial do TCE">
                <Select
                  value={form.estagio.tceStatus}
                  onChange={(e) =>
                    updateInternship("tceStatus", e.target.value)
                  }
                >
                  <option value="AGUARDANDO_ASSINATURA">
                    Aguardando assinatura
                  </option>
                  {form.vinculo.dataAdmissao &&
                    form.vinculo.dataAdmissao <=
                      new Date().toISOString().slice(0, 10) && (
                      <option value="ASSINADO">Assinado</option>
                    )}
                </Select>
              </FormField>
              <Notice text="O TCE e os aditivos serão gerados automaticamente conforme a admissão, o fim previsto e a periodicidade." />
            </div>
          )}

          {step === "review" && (
            <div className="person-create-review">
              <section>
                <header>
                  <h3>Dados pessoais</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("personal")}
                  >
                    Editar
                  </Button>
                </header>
                <dl>
                  <ReviewValue label="Nome" value={form.pessoa.nomeCompleto} />
                  <ReviewValue label="CPF" value={form.pessoa.cpf} />
                  <ReviewValue
                    label="Nascimento"
                    value={formatDate(form.pessoa.dataNascimento)}
                  />
                  <ReviewValue label="E-mail" value={form.pessoa.email} />
                  <ReviewValue label="Telefone" value={form.pessoa.telefone} />
                </dl>
              </section>
              <section>
                <header>
                  <h3>Vínculo</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("link")}
                  >
                    Editar
                  </Button>
                </header>
                {form.incluirVinculo ? (
                  <dl>
                    <ReviewValue
                      label="Tipo"
                      value={
                        form.vinculo.tipo === "ESTAGIO"
                          ? "Estágio"
                          : form.vinculo.tipo
                      }
                    />
                    <ReviewValue
                      label="Unidade"
                      value={display(
                        options.units.find(
                          (row) => row.id === form.vinculo.unidadeId,
                        ),
                      )}
                    />
                    <ReviewValue
                      label="Equipe"
                      value={display(
                        options.teams.find(
                          (row) => row.id === form.vinculo.equipeId,
                        ),
                      )}
                    />
                    <ReviewValue
                      label="Admissão"
                      value={formatDate(form.vinculo.dataAdmissao)}
                    />
                    <ReviewValue
                      label="Matrícula"
                      value={form.vinculo.matricula}
                    />
                    <ReviewValue
                      label="Cargo/Função"
                      value={form.vinculo.cargoFuncao}
                    />
                    <ReviewValue label="Gestor" value={form.vinculo.gestor} />
                    {form.vinculo.escalaEstruturada && (
                      <ReviewValue
                        label="Escala"
                        value={
                          form.vinculo.escalaEstruturada.tipo === "DIAS_SEMANA"
                            ? form.vinculo.escalaEstruturada.diasSemana
                                .map(
                                  (day) =>
                                    weekdays.find(
                                      ([value]) => value === day,
                                    )?.[1],
                                )
                                .join(", ")
                            : `${form.vinculo.escalaEstruturada.quantidadeDiasSemana} dias por semana`
                        }
                      />
                    )}
                  </dl>
                ) : (
                  <p>Esta pessoa será cadastrada sem vínculo inicial.</p>
                )}
              </section>
              {form.incluirVinculo && form.vinculo.tipo === "ESTAGIO" && (
                <section>
                  <header>
                    <h3>Dados do estágio</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep("internship")}
                    >
                      Editar
                    </Button>
                  </header>
                  <dl>
                    <ReviewValue
                      label="Instituição"
                      value={display(
                        options.institutions.find(
                          (row) => row.id === form.estagio.instituicaoEnsinoId,
                        ),
                      )}
                    />
                    <ReviewValue
                      label="Período"
                      value={form.estagio.periodoAcademico}
                    />
                    <ReviewValue
                      label="Bolsa"
                      value={
                        form.estagio.valorBolsa
                          ? money(form.estagio.valorBolsa)
                          : "—"
                      }
                    />
                    <ReviewValue
                      label="Fim previsto"
                      value={formatDate(form.estagio.dataTerminoPrevista)}
                    />
                    <ReviewValue
                      label="Periodicidade"
                      value={`${form.estagio.periodicidadeDocumentoMeses} meses`}
                    />
                    <ReviewValue
                      label="TCE"
                      value={
                        form.estagio.tceStatus === "ASSINADO"
                          ? "Assinado"
                          : "Aguardando assinatura"
                      }
                    />
                  </dl>
                  <p className="muted">
                    TCE e aditivos serão criados automaticamente.
                  </p>
                </section>
              )}
            </div>
          )}
        </div>
        <footer className="person-create-actions">
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            Cancelar
          </Button>
          <div>
            {currentIndex > 0 && (
              <Button variant="secondary" onClick={back}>
                Voltar
              </Button>
            )}
            {step === "review" ? (
              <Button loading={busy} onClick={() => void submit()}>
                Confirmar cadastro
              </Button>
            ) : (
              <Button onClick={next}>Próximo</Button>
            )}
          </div>
        </footer>
      </section>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={() => {
          releaseGuard.current?.();
          const proceed = pendingNavigation.current;
          pendingNavigation.current = null;
          proceed?.();
        }}
      />
    </main>
  );
}
