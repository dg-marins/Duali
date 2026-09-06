import type {FastifyInstance} from 'fastify';
import {Prisma,type PrismaClient} from '@duali/database';
import ExcelJS from 'exceljs';
import {z,listSchema} from '@duali/shared';
import {audit,DomainError,type Row} from '../core.js';
import {balance} from './leave-domain.js';
import {internshipAlerts} from './internship.js';
import {benefitAlerts,benefitCalculation} from './benefits.js';
import {leaveAlerts} from './leave.js';
export const reportKinds=['pessoas','estagios','descansos','beneficios','inconsistencias'] as const;
const kindSchema=z.enum(reportKinds);
type Query=ReturnType<typeof listSchema.parse>;
function linkWhere(q:Query):Prisma.VinculoWhereInput {
 return {...(q.unidadeId?{unidadeId:q.unidadeId}:{}),...(q.equipeId?{equipeId:q.equipeId}:{}),...(q.vinculoId?{id:q.vinculoId}:{}),...(q.status?{status:z.enum(['ATIVO','AFASTADO','DESLIGADO']).parse(q.status)}:{}),...(q.tipo?{tipo:z.enum(['CLT','ESTAGIO']).parse(q.tipo)}:{}),...(q.q?{pessoa:{nomeCompleto:{contains:q.q,mode:'insensitive'}}}:{})};
}
function range(q:Query){return {...(q.inicio?{gte:new Date(q.inicio)}:{}),...(q.fim?{lte:new Date(q.fim)}:{})};}
export async function operationalAlerts(db:PrismaClient){return [...await internshipAlerts(db),...await leaveAlerts(db),...await benefitAlerts(db)];}
export async function report(db:PrismaClient,kind:typeof reportKinds[number],q:Query):Promise<Row[]>{
 const where=linkWhere(q);let rows:Row[];
 if(kind==='beneficios'){
  const records=await db.beneficioCompetencia.findMany({where:{beneficioVinculo:{vinculo:where},competencia:range(q)},include:{ajustes:true,configuracao:{include:{fornecedor:true}},beneficioVinculo:{include:{vinculo:{include:{pessoa:true,unidade:true,equipe:true}}}}},orderBy:{competencia:'desc'},take:10001});
  rows=records.map(r=>{const v=r.beneficioVinculo.vinculo,c=benefitCalculation(r);return {Pessoa:v.pessoa.nomeCompleto,Unidade:v.unidade.nome,Equipe:v.equipe?.nome??'',Vínculo:v.tipo,Benefício:r.beneficioVinculo.tipo,Fornecedor:r.configuracao.fornecedor.nome,Componente:r.componente,Competência:r.competencia.toISOString().slice(0,10),Dias:r.quantidadeDias?.toString()??'',Quantidade:r.quantidade?.toString()??'','Valor unitário':r.valorUnitario?.toFixed(2)??'','Valor calculado':c.valorCalculado??'','Valor informado':r.valorInformado?.toFixed(2)??'',Ajustes:c.totalAjustes,Divergência:c.divergencia??'',Status:r.status,Observações:r.observacoes??''};});
 }else if(kind==='inconsistencias'){
  const links=await db.vinculo.findMany({where,select:{id:true}}),ids=new Set(links.map(v=>v.id));
  rows=(await operationalAlerts(db)).filter(a=>ids.has(a.vinculoId)&&(!a.prazo||(!q.inicio||a.prazo>=new Date(q.inicio))&&(!q.fim||a.prazo<=new Date(q.fim)))).map(a=>({Pessoa:a.pessoa,Tipo:a.tipo,Mensagem:a.mensagem,Prazo:a.prazo?.toISOString().slice(0,10)??''}));
 }else{
  const records=await db.vinculo.findMany({where:{...where,...(kind==='estagios'?{tipo:'ESTAGIO'}:{}),...(kind!=='descansos'?{dataAdmissao:range(q)}:q.inicio||q.fim?{direitos:{some:{dataAquisicao:range(q)}}}:{})},include:{pessoa:true,unidade:true,equipe:true,estagio:{include:{instituicaoEnsino:true}}},orderBy:{dataAdmissao:'desc'},take:10001});
  rows=await Promise.all(records.map(async v=>{
   const base={Pessoa:v.pessoa.nomeCompleto,Unidade:v.unidade.nome,Equipe:v.equipe?.nome??'',Vínculo:v.tipo,Status:v.status,Admissão:v.dataAdmissao.toISOString().slice(0,10)};
   if(kind==='descansos'){const b=await balance(db,v.id);return {...base,Adquiridos:b.adquiridos,Consumidos:b.consumidos,Ajustes:b.ajustes,Saldo:b.saldo,Programados:b.programados,Alertas:b.alertas.join(' | ')};}
   if(kind==='estagios')return {...base,Instituição:v.estagio?.instituicaoEnsino?.nome??'',Curso:v.estagio?.curso??'',Matrícula:v.estagio?.matriculaAcademica??'',Bolsa:v.estagio?.valorBolsa?.toFixed(2)??''};
   return {...base,CPF:v.pessoa.cpf??'','E-mail':v.pessoa.email??'',Telefone:v.pessoa.telefone??'',Cargo:v.cargoFuncao??'',Desligamento:v.dataDesligamento?.toISOString().slice(0,10)??''};
  }));
 }
 if(rows.length>10000)throw new DomainError(422,'Mais de 10.000 registros. Refine os filtros.');
 return rows;
}
export function safeCell(value:unknown):string|number|boolean {
 if(typeof value==='number'||typeof value==='boolean')return value;
 // Leading control characters can hide formula prefixes in spreadsheet readers.
 // eslint-disable-next-line no-control-regex
 const text=value==null?'':String(value);return /^[\s\u0000-\u001f]*[=+@-]/.test(text)?"'"+text:text;
}
export async function exportRows(rows:Row[],format:'csv'|'xlsx'){
 const headers=Object.keys(rows[0]??{Resultado:''});
 if(format==='csv'){const escape=(v:unknown)=>'"'+String(safeCell(v)).replace(/"/g,'""')+'"';return Buffer.from('\uFEFF'+[headers.map(escape).join(';'),...rows.map(row=>headers.map(k=>escape(row[k])).join(';'))].join('\r\n'),'utf8');}
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Relatório');sheet.columns=headers.map(header=>({header,key:header,width:24}));for(const row of rows)sheet.addRow(Object.fromEntries(headers.map(k=>[k,safeCell(row[k])])));sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];if(rows.length)sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length+1,column:headers.length}};
 return Buffer.from(await wb.xlsx.writeBuffer());
}
export function registerReporting(app:FastifyInstance,db:PrismaClient){
 app.get('/api/dashboard',async req=>{
  const q=listSchema.parse(req.query),where=linkWhere(q);
  const [pessoas,clt,estagios,alerts,recent]=await Promise.all([
   db.pessoa.count({where:{vinculos:{some:{...where,status:'ATIVO'}}}}),
   db.vinculo.count({where:{...where,tipo:'CLT',status:'ATIVO'}}),
   db.vinculo.count({where:{...where,tipo:'ESTAGIO',status:'ATIVO'}}),
   operationalAlerts(db),db.auditoria.findMany({orderBy:{criadoEm:'desc'},take:10,select:{id:true,acao:true,entidade:true,criadoEm:true,usuario:{select:{nome:true}}}})
  ]);
  const selected=(await db.vinculo.findMany({where,select:{id:true}})).map(v=>v.id),ids=new Set(selected),filtered=alerts.filter(a=>ids.has(a.vinculoId));
  return {pessoasAtivas:pessoas,cltsAtivos:clt,estagiariosAtivos:estagios,feriasProximas:filtered.filter(a=>a.mensagem==='Prazo de férias próximo.').length,feriasPendentes:filtered.filter(a=>/vencidas|anterior pendente/.test(a.mensagem)).length,descansosProximos:filtered.filter(a=>/descanso próxima/.test(a.mensagem)).length,documentosProximos:filtered.filter(a=>['DOCUMENTO','SEGURO'].includes(a.tipo)).length,beneficiosPendentes:filtered.filter(a=>a.tipo==='BENEFICIO').length,inconsistencias:filtered.length,alertas:filtered.slice(0,100),atividades:recent};
 });
 app.get('/api/relatorios/:tipo',async req=>{const {tipo}=z.object({tipo:kindSchema}).parse(req.params),q=listSchema.parse(req.query);const rows=await report(db,tipo,q);return {items:rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize),total:rows.length,page:q.page,pageSize:q.pageSize};});
 app.get('/api/exportacoes/:tipo/:formato',async(req,reply)=>{
  const {tipo,formato}=z.object({tipo:kindSchema,formato:z.enum(['csv','xlsx'])}).parse(req.params),q=listSchema.parse(req.query);
  const rows=await report(db,tipo,q),buffer=await exportRows(rows,formato);
  await audit(db,req.userId,'EXPORTAR','relatorio',null,undefined,{tipo,formato,filtros:q,registros:rows.length});
  reply.type(formato==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition','attachment; filename="duali-'+tipo+'.'+formato+'"');
  return buffer;
 });
}
