import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import {
  pessoaSchema,
  unidadeSchema,
  vinculoSchema,
  estagioSchema,
  instituicaoSchema,
  documentoSchema,
  seguroSchema,
  movimentacaoSchema,
  validCpf,
} from "@duali/shared";
import { audit, json, type Row, type Tx } from "../core.js";
import type { Sheet } from "./import-files.js";

type SourceRow = { aba: string; linha: number; values: unknown[] };
type PersonRecord = {
  source: SourceRow;
  person: Row;
  unit?: "RJ" | "SP" | "DF";
  link?: Row;
  internship?: Row;
  institution?: string | undefined;
  documents: Row[];
  insurance?: Row | undefined;
};
const schemas: Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown; error?: { issues: { path: PropertyKey[]; message: string }[] } } }> = {
  pessoas: pessoaSchema, unidades: unidadeSchema, vinculos: vinculoSchema,
  estagios: estagioSchema, instituicoes: instituicaoSchema, documentos: documentoSchema,
  seguros: seguroSchema, "seguro-movimentacoes": movimentacaoSchema,
};
const scalar = (value: unknown): unknown => {
  if (value && typeof value === "object") {
    if ("result" in value && value.result !== undefined && value.result !== null) return value.result;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part: { text?: unknown }) => String(part.text ?? "")).join("");
    if ("text" in value) return scalar(value.text);
  }
  return value;
};
const normalizeKey = (value: unknown) => String(scalar(value) ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (value: unknown) => String(scalar(value) ?? "").trim().replace(/\s+/g, " ");
const present = (value: unknown) => value !== "" && value !== null && value !== undefined && !/^[-–—]+$/.test(text(value));
const excelDate = (value: unknown): string | null => {
  value = scalar(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const valueText = text(value);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valueText);
  if (match) return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  return null;
};
const money = (value: unknown): number | null => {
  value = scalar(value);
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  const cleaned = text(value).replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const result = Number(normalized);
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
};
const cpf = (value: unknown) => {
  const digits = text(value).replace(/\D/g, "");
  return validCpf(digits) ? digits : null;
};
const cellValue = (value: ExcelJS.CellValue): unknown => {
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) return { formula: "=" + String("formula" in value ? value.formula : value.sharedFormula), result: value.result ?? null };
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return scalar(value.text);
    if ("result" in value) return value.result ?? "";
  }
  return value ?? "";
};
const rawObject = (source: SourceRow) => Object.fromEntries(source.values.map((value, index) => [`coluna_${index + 1}`, value instanceof Date ? value.toISOString().slice(0, 10) : value]).filter(([, value]) => present(value)));
const appendNotes = (...parts: [string, unknown][]) => parts.filter(([, value]) => present(value)).map(([label, value]) => `${label}: ${text(value)}`).join("\n") || undefined;

function person(source: SourceRow, indexes: { name: number; cpf?: number | undefined; rg?: number | undefined; birth?: number | undefined; email?: number | undefined; phone?: number | undefined; address?: number | undefined; active?: boolean | undefined }): Row {
  const result: Row = { nomeCompleto: text(source.values[indexes.name]), ativa: indexes.active ?? true };
  if (indexes.cpf !== undefined && present(source.values[indexes.cpf])) result.cpf = text(source.values[indexes.cpf]).replace(/\D/g, "");
  if (indexes.rg !== undefined && present(source.values[indexes.rg])) result.rg = text(source.values[indexes.rg]);
  if (indexes.birth !== undefined && present(source.values[indexes.birth])) result.dataNascimento = excelDate(source.values[indexes.birth]) ?? text(source.values[indexes.birth]);
  if (indexes.email !== undefined && present(source.values[indexes.email])) result.email = text(source.values[indexes.email]).toLowerCase();
  if (indexes.phone !== undefined && present(source.values[indexes.phone])) result.telefone = text(source.values[indexes.phone]);
  if (indexes.address !== undefined && present(source.values[indexes.address])) result.endereco = text(source.values[indexes.address]);
  return result;
}
function doc(type: string, value: unknown, label: string): Row | null {
  if (!present(value)) return null;
  const date = excelDate(value);
  return { tipo: type, ...(date ? { dataReferencia: date } : {}), status: /assinado/i.test(text(value)) ? "VIGENTE" : "PENDENTE", observacoes: `${label}: ${text(value)}` };
}
function mainRecord(source: SourceRow): PersonRecord | null {
  const sheet = normalizeKey(source.aba);
  if (sheet === "rj") return activeRecord(source, "RJ", { name: 0, admission: 1, tce: 2, renewals: [3,4,5], end: 6, grant: 7, area: 8, period: 9, email: 10, cpf: 11 });
  if (sheet === "sp") return activeRecord(source, "SP", { name: 0, area: 1, admission: 2, tce: 3, renewals: [4,5,6], end: 7, distrato: 8, period: 9, grant: 10, phone: 11, email: 12, birth: 13, rg: 14, cpf: 15, enrollment: 16, address: 17, university: 18, notes: 19 });
  if (sheet === "bsb") return activeRecord(source, "DF", { name: 0, admission: 1, tce: 2, renewals: [3,4,5], end: 6, additives: [7,8,9], area: 10, manager: 11, period: 12, grant: 13, bank: 14, phone: 15, email: 16, birth: 17, rg: 18, cpf: 19, enrollment: 20, address: 21, university: 22, policy: 23, notes: 24 });
  return null;
}
type ActiveMap = { name:number; admission:number; tce:number; renewals:number[]; end:number; grant:number; area?:number; period:number; phone?:number; email?:number; birth?:number; rg?:number; cpf?:number; enrollment?:number; address?:number; university?:number; manager?:number; bank?:number; policy?:number; notes?:number; distrato?:number; additives?:number[] };
function activeRecord(source: SourceRow, unit: "RJ"|"SP"|"DF", m: ActiveMap): PersonRecord | null {
  const v = source.values, name = text(v[m.name]);
  if (!name || !/\s/.test(name) || /^(estagi[aá]rio|rio de janeiro|s[aã]o paulo|bras[ií]lia)$/i.test(name)) return null;
  const admission = excelDate(v[m.admission]);
  const documents = [doc("TCE", v[m.tce], "TCE"), ...m.renewals.map((i, n) => doc("RENOVACAO", v[i], `${n + 1}ª renovação`)), ...(m.additives ?? []).map((i,n) => doc("ADITIVO",v[i],`${n+1}º aditivo`)), ...(m.distrato === undefined ? [] : [doc("DISTRATO",v[m.distrato],"Distrato")])].filter(Boolean) as Row[];
  const result: PersonRecord = {
    source, person: person(source, { name:m.name, cpf:m.cpf, rg:m.rg, birth:m.birth, email:m.email, phone:m.phone, address:m.address }), unit,
    documents,
    internship: {
      periodoAcademico: text(v[m.period]) || undefined, valorBolsa: present(v[m.grant]) ? (money(v[m.grant]) ?? text(v[m.grant])) : undefined, dataTerminoPrevista: present(v[m.end]) ? (excelDate(v[m.end]) ?? text(v[m.end])) : undefined,
      area: m.area === undefined ? undefined : text(v[m.area]) || undefined,
      dadosBancarios: m.bank === undefined ? undefined : text(v[m.bank]) || undefined,
      matriculaAcademica: m.enrollment === undefined ? undefined : text(v[m.enrollment]) || undefined,
      observacoes: appendNotes(["Observações", m.notes === undefined ? "" : v[m.notes]]),
    },
    institution: m.university === undefined ? undefined : text(v[m.university]) || undefined,
  };
  result.link = { tipo:"ESTAGIO", status:"ATIVO", dataAdmissao:admission??"", matricula:m.enrollment===undefined?undefined:text(v[m.enrollment])||undefined, gestor:m.manager===undefined?undefined:text(v[m.manager])||undefined, observacoes:appendNotes(["Origem",`${source.aba}:${source.linha}`]) };
  if (m.policy !== undefined && present(v[m.policy])) result.insurance = { seguradora:"Não informada", numeroApolice:text(v[m.policy]), status:"ATIVO", observacoes:`Origem: ${source.aba}:${source.linha}` };
  return result;
}

function secondaryRecord(source: SourceRow): PersonRecord | null {
  const v=source.values, sheet=normalizeKey(source.aba), name=text(v[0]);
  if (!name || !/\s/.test(name) || /^(estagi[aá]rio|equipe|rio de janeiro|s[aã]o paulo|bras[ií]lia)$/i.test(name)) return null;
  if (sheet === "estagiarios") return { source, person: person(source,{name:0,birth:1,rg:2,cpf:3,active:!/^inativo$/i.test(text(v[4]))}), documents:[] };
  if (sheet === "desligados") return disconnectedRecord(source,"RJ",{admission:1,exit:2,address:3,birth:4,rg:5,cpf:6,enrollment:7,policy:8,university:9,agent:10,renewals:[11,12,13]});
  if (sheet === "desligadossp") {
    if(cpf(v[13])&&/^\(?61/.test(text(v[9])))return disconnectedRecord(source,"DF",{team:1,representative:2,admission:3,schedule:4,period:6,grant:7,address:8,phone:9,email:10,birth:11,rg:12,cpf:13,enrollment:14,policy:15,university:16,exit:17,notes:18});
    if(cpf(v[12])||/@/.test(text(v[10])))return disconnectedRecord(source,"SP",{team:1,admission:2,end:3,schedule:6,period:7,grant:8,phone:9,email:10,rg:11,cpf:12,address:13,enrollment:14,university:15,notes:4,exit:5});
    return disconnectedRecord(source,"SP",{team:1,admission:2,end:3,schedule:4,period:5,grant:6,phone:7,email:8,rg:9,cpf:10,address:11,enrollment:12,university:13,notes:14,exit:15});
  }
  if (sheet === "desligadosrj") {
    if (cpf(v[21])) {
      const record=activeRecord(source,"RJ",{name:0,admission:1,tce:2,renewals:[3,4,5],end:6,additives:[7,8,9],distrato:11,grant:12,area:14,manager:15,period:16,phone:17,email:18,birth:19,rg:20,cpf:21,enrollment:22,address:23,policy:24,university:26,notes:28});
      if(record){record.person.ativa=!/^inativo$/i.test(text(v[27]));record.internship!.observacoes=appendNotes(["Status original",v[27]],["Benefícios",v[28]]);}
      return record;
    }
    if (cpf(v[11])) return disconnectedRecord(source,"RJ",{team:1,representative:1,admission:2,period:3,grant:4,schedule:5,address:6,phone:7,email:8,birth:9,rg:10,cpf:11,enrollment:12,policy:13,university:15,notes:16,end:20,exit:16});
    if (cpf(v[9])) return disconnectedRecord(source,"RJ",{team:1,representative:1,admission:2,period:3,address:4,phone:5,email:6,birth:7,rg:8,cpf:9,enrollment:10,policy:11,university:13,exit:14,notes:15});
    const admission=excelDate(v[1]);
    return {source,person:{nomeCompleto:name,ativa:false},unit:"RJ",documents:[],institution:text(v[3])||undefined,link:{tipo:"ESTAGIO",status:"ATIVO",dataAdmissao:admission??"",observacoes:appendNotes(["Equipe",v[2]],["Pendência",v[4]])},internship:{area:text(v[2])||undefined,dataTerminoPrevista:present(v[6])?(excelDate(v[6])??text(v[6])):undefined,observacoes:appendNotes(["Pendência",v[4]])}};
  }
  if (sheet === "desligadosdf") return cpf(v[12])
    ? disconnectedRecord(source,"DF",{team:1,representative:2,admission:3,schedule:4,period:5,grant:6,address:7,phone:8,email:9,birth:10,rg:11,cpf:12,enrollment:13,policy:14,university:15,notes:16,exit:17})
    : disconnectedRecord(source,"DF",{team:1,representative:2,admission:3,period:6,grant:7,address:8,phone:9,email:10,birth:11,rg:12,cpf:13,enrollment:14,policy:15,university:16,exit:17,notes:18});
  return null;
}
type DisconnectedMap={team?:number;representative?:number;admission:number;exit:number;end?:number;schedule?:number;period?:number;grant?:number;phone?:number;email?:number;birth?:number;rg?:number;cpf?:number;address?:number;enrollment?:number;policy?:number;university?:number;agent?:number;notes?:number;renewals?:number[]};
function disconnectedRecord(source:SourceRow,unit:"RJ"|"SP"|"DF",m:DisconnectedMap):PersonRecord {
  const v=source.values, admission=excelDate(v[m.admission]), exit=excelDate(v[m.exit]);
  const documents=(m.renewals??[]).map((i,n)=>doc("RENOVACAO",v[i],`${n+1}ª renovação`)).filter(Boolean) as Row[];
  const result:PersonRecord={source,person:person(source,{name:0,cpf:m.cpf,rg:m.rg,birth:m.birth,email:m.email,phone:m.phone,address:m.address,active:false}),unit,documents,
    institution:m.university===undefined?undefined:text(v[m.university])||undefined,
    internship:{periodoAcademico:m.period===undefined?undefined:text(v[m.period])||undefined,valorBolsa:m.grant===undefined||!present(v[m.grant])?undefined:(money(v[m.grant])??text(v[m.grant])),dataTerminoPrevista:m.end===undefined||!present(v[m.end])?undefined:(excelDate(v[m.end])??text(v[m.end])),horario:m.schedule===undefined?undefined:text(v[m.schedule])||undefined,matriculaAcademica:m.enrollment===undefined?undefined:text(v[m.enrollment])||undefined,representanteTce:m.representative===undefined?undefined:text(v[m.representative])||undefined,agenteIntegracao:m.agent===undefined?undefined:text(v[m.agent])||undefined,observacoes:appendNotes(["Pendências/observações",m.notes===undefined?"":v[m.notes]])}};
  result.link={tipo:"ESTAGIO",status:exit?"DESLIGADO":"ATIVO",dataAdmissao:admission??"",...(exit?{dataDesligamento:exit}:{}),matricula:m.enrollment===undefined?undefined:text(v[m.enrollment])||undefined,observacoes:appendNotes(["Equipe/representante",m.team===undefined?"":v[m.team]],["Origem",`${source.aba}:${source.linha}`])};
  if(m.policy!==undefined&&present(v[m.policy])) result.insurance={seguradora:"Não informada",numeroApolice:text(v[m.policy]),status:"ENCERRADO",observacoes:`Origem: ${source.aba}:${source.linha}`};
  return result;
}

export function isGeneralInternList(filename:string){return normalizeKey(filename).includes("listagemestagiariosgeral")&&filename.toLowerCase().endsWith(".xlsx");}
export async function readGeneralInternList(buffer:Buffer):Promise<{sheets:Sheet[];records:PersonRecord[];movements:SourceRow[];auxiliary:SourceRow[]}> {
  const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheets:Sheet[]=[],records:PersonRecord[]=[],movements:SourceRow[]=[],auxiliary:SourceRow[]=[];
  for(const ws of workbook.worksheets){
    const lines:{numero:number;dados:Row}[]=[];
    for(let row=1;row<=ws.rowCount;row++){
      const values=Array.from({length:ws.columnCount},(_,i)=>cellValue(ws.getRow(row).getCell(i+1).value));
      if(!values.some(present))continue;
      const source={aba:ws.name,linha:row,values}; lines.push({numero:row,dados:rawObject(source)});
      const normalized=normalizeKey(ws.name);
      const firstData={rj:4,sp:4,bsb:4,estagiarios:2,desligados:2,desligadossp:3,desligadosrj:3,desligadosdf:3}[normalized];
      if(firstData&&row>=firstData){const parsed=mainRecord(source)??secondaryRecord(source);if(parsed)records.push(parsed);}
      if((normalized==="seguroestagiarios"&&row>=3)||(normalized==="pagina5"&&row>=2))movements.push(source);
      if(normalized==="obs")auxiliary.push(source);
    }
    sheets.push({nome:ws.name,colunas:Array.from({length:ws.columnCount},(_,i)=>`coluna_${i+1}`),linhas:lines});
  }
  return {sheets,records,movements,auxiliary};
}

export async function stageGeneralInternList(tx:Tx,importId:string,userId:string,parsed:Awaited<ReturnType<typeof readGeneralInternList>>){
  const groups=new Map<string,PersonRecord[]>(), byName=new Map<string,string>(), byCpf=new Map<string,string>();
  for(const record of parsed.records){
    const name=normalizeKey(record.person.nomeCompleto),document=record.person.cpf?String(record.person.cpf):"";
    const key=(document&&byCpf.get(document))||byName.get(name)||(document?`cpf:${document}`:`nome:${name}`);
    const list=groups.get(key)??[];list.push(record);groups.set(key,list);byName.set(name,key);if(document)byCpf.set(document,key);
  }
  let order=0,pending=0;
  const targetByUnit=new Map<string,string>();
  for(const [sigla,nome,uf,cidade] of [["RJ","Rio de Janeiro","RJ","Rio de Janeiro"],["SP","São Paulo","SP","São Paulo"],["DF","Brasília","DF","Brasília"]] as const){
    const target=randomUUID(),existing=await tx.unidade.findUnique({where:{sigla}});targetByUnit.set(sigla,target);
    await createItem(tx,{importId,order:order++,group:`unidade_${sigla}`,domain:"unidades",source:{aba:"Configuração",linha:1,values:[]},data:{nome,sigla,uf,cidade,ativa:true,diasAlerta:30},target,existing});
  }
  const auxiliaryInstitutions=parsed.auxiliary.filter(r=>present(r.values[0])&&!/periodo|^rj$|^sp$|^bsb$/i.test(text(r.values[0]))).map(r=>text(r.values[0]));
  const institutionTargets=new Map<string,string>();
  for(const name of [...new Set([...(parsed.records.map(r=>r.institution).filter(Boolean) as string[]),...auxiliaryInstitutions])]){
    const key=normalizeKey(name);if(institutionTargets.has(key))continue;const target=randomUUID();institutionTargets.set(key,target);
    const existing=await tx.instituicaoEnsino.findFirst({where:{nome:{equals:name,mode:"insensitive"}}});
    const auxiliary=parsed.auxiliary.find(r=>normalizeKey(r.values[0])===key);
    await createItem(tx,{importId,order:order++,group:"instituicao",domain:"instituicoes",source:auxiliary??{aba:"Instituições",linha:1,values:[name]},data:{nome:name,ativa:true,...(auxiliary?{observacoes:appendNotes(["Período de contrato/aditivos",auxiliary.values[1]],["Contato",auxiliary.values[2]])}:{})},target,existing});
  }
  const linkTargets=new Map<string,string>(),insuranceTargets=new Map<string,string>();
  for(const [identity,entries] of groups){
    entries.sort((a,b)=>Number(Boolean(b.link&&b.link.status==="ATIVO"))-Number(Boolean(a.link&&a.link.status==="ATIVO")));
    const primary=entries[0]!,personData={...primary.person};
    for(const entry of entries.slice(1))for(const key of ["cpf","rg","dataNascimento","email","telefone","endereco"]){if(!personData[key]&&entry.person[key])personData[key]=entry.person[key];}
    personData.observacoes=appendNotes(["Ocorrências de origem",entries.map(e=>`${e.source.aba}:${e.source.linha}`).join(", ")]);
    const conflicts:string[]=[];for(const key of ["cpf","dataNascimento","email"]){const values=new Set(entries.map(e=>e.person[key]).filter(Boolean));if(values.size>1)conflicts.push(`${key} divergente entre abas`);}
    const personTarget=randomUUID(),existingPeople=await tx.pessoa.findMany({where:{OR:[...(personData.cpf?[{cpf:String(personData.cpf)}]:[]),{nomeCompleto:{equals:String(personData.nomeCompleto),mode:"insensitive"}}]}});
    const existing=existingPeople.length===1&&!conflicts.length?(existingPeople[0]??null):null;
    const personStatus=conflicts.length||existingPeople.length>1?"REVISAO":undefined;if(personStatus)pending++;
    await createItem(tx,{importId,order:order++,group:"pessoa",domain:"pessoas",source:primary.source,data:personData,target:personTarget,existing,status:personStatus,messages:conflicts,candidates:existingPeople});
    const record=entries.find(e=>e.link?.status==="ATIVO")??entries.find(e=>e.link)??primary;
    if(!record.link||!record.unit)continue;
    const linkTarget=randomUUID(),linkData={...record.link,pessoaId:personTarget,unidadeId:targetByUnit.get(record.unit)!};
    linkTargets.set(identity,linkTarget);
    await createItem(tx,{importId,order:order++,group:"vinculo",domain:"vinculos",source:record.source,data:linkData,target:linkTarget,refs:{pessoaId:personTarget,unidadeId:targetByUnit.get(record.unit)!}});
    if(record.internship){const institutionTarget=record.institution?institutionTargets.get(normalizeKey(record.institution)):undefined;const internshipData={...record.internship,vinculoId:linkTarget,...(institutionTarget?{instituicaoEnsinoId:institutionTarget}:{})};
      await createItem(tx,{importId,order:order++,group:"estagio",domain:"estagios",source:record.source,data:internshipData,target:randomUUID(),refs:{vinculoId:linkTarget,...(institutionTarget?{instituicaoEnsinoId:institutionTarget}:{})}});}
    for(const entry of entries)for(const document of entry.documents){const data={...document,vinculoId:linkTarget};await createItem(tx,{importId,order:order++,group:"documento",domain:"documentos",source:entry.source,data,target:randomUUID(),refs:{vinculoId:linkTarget}});}
    const sourceMovement=parsed.movements.find(m=>{const document=cpf(m.values[1]);return(document&&byCpf.get(document)===identity)||byName.get(normalizeKey(m.values[0]))===identity;});
    const insuranceEntry=entries.find(e=>e.insurance),insurance=insuranceEntry?.insurance;
    if(insurance||sourceMovement){
      const target=randomUUID(),insurer=sourceMovement&&present(sourceMovement.values[4])?text(sourceMovement.values[4]):String(insurance?.seguradora??"Não informada");
      const data={...(insurance??{}),vinculoId:linkTarget,seguradora:insurer,status:/exclus[aã]o/i.test(text(sourceMovement?.values[5]))?"ENCERRADO":String(insurance?.status??"PENDENTE")};
      insuranceTargets.set(identity,target);await createItem(tx,{importId,order:order++,group:"seguro",domain:"seguros",source:sourceMovement??insuranceEntry?.source??record.source,data,target,refs:{vinculoId:linkTarget}});
    }
  }
  for(const source of parsed.movements){
    const document=cpf(source.values[1]),identity=(document&&byCpf.get(document))||byName.get(normalizeKey(source.values[0]));
    const insuranceTarget=identity?insuranceTargets.get(identity):undefined;if(!insuranceTarget)continue;
    for(const [typeIndex,dateIndex] of [[5,6],[7,8]] as const){if(!present(source.values[typeIndex]))continue;const date=excelDate(source.values[dateIndex]);
      const typeText=text(source.values[typeIndex]),type=/exclus/i.test(typeText)?"EXCLUSAO":/alter/i.test(typeText)?"ALTERACAO":"INCLUSAO";
      const data={seguroEstagioId:insuranceTarget,tipo:type,dataMovimentacao:date??"",observacoes:appendNotes(["Valor original",typeText],["Observação",source.values[9]])};
      await createItem(tx,{importId,order:order++,group:"seguro_movimentacao",domain:"seguro-movimentacoes",source,data,target:randomUUID(),refs:{seguroEstagioId:insuranceTarget}});
    }
  }
  pending=await tx.importacaoItem.count({where:{importacaoId:importId,acao:"PENDENTE"}});
  await tx.importacao.update({where:{id:importId},data:{status:"REVISAO",mapeamento:json({perfil:"LISTAGEM_ESTAGIARIOS_GERAL",ocorrencias:parsed.records.length,pessoas:groups.size,pendencias:pending,abasAuxiliares:parsed.auxiliary.length,movimentacoesSeguro:parsed.movements.length})}});
  await audit(tx,userId,"ANALISAR_IMPORTACAO","importacao",importId,undefined,{perfil:"LISTAGEM_ESTAGIARIOS_GERAL",registros:order,pendencias:pending});
  return {registros:order,pessoas:groups.size,pendencias:pending,perfil:"LISTAGEM_ESTAGIARIOS_GERAL"};
}
async function createItem(tx:Tx,input:{importId:string;order:number;group:string;domain:string;source:SourceRow;data:Row;target:string;refs?:Row|undefined;existing?:Row|null|undefined;status?:string|undefined;messages?:string[]|undefined;candidates?:Row[]|undefined}){
  const parsed=schemas[input.domain]!.safeParse(input.data),messages=[...(input.messages??[]),...(!parsed.success?(parsed.error?.issues??[]).map(i=>`${i.path.join(".")}: ${i.message}`):[])];
  const review=Boolean(input.status)||!parsed.success;const existing=input.existing;
  await tx.importacaoItem.create({data:{importacaoId:input.importId,ordem:input.order,grupo:input.group,dominio:input.domain,aba:input.source.aba,numeroLinha:input.source.linha,dadosOriginais:json(rawObject(input.source)),dadosNormalizados:json(parsed.success?parsed.data:input.data),referencias:json(input.refs??{}),...(existing?{dadosAnteriores:json(existing),alvoId:String(existing.id)}:{}),status:review?"REVISAO":"VALIDO",acao:review?"PENDENTE":existing?"VINCULAR":"CRIAR",mensagens:json(messages),candidatos:json((input.candidates??(existing?[existing]:[])).map(c=>({id:c.id,nome:c.nomeCompleto??c.nome??c.sigla,evidencia:"Correspondência exata"}))),destinoId:input.target,revisado:!review}});
}
