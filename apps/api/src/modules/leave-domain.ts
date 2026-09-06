import type {PrismaClient} from '@duali/database';
import {entitlements} from '@duali/shared';
import {audit,transaction,type Tx} from '../core.js';
export async function acquire(tx:Tx,vinculoId:string,userId:string|null,until=new Date()){
 const vinculo=await tx.vinculo.findUniqueOrThrow({where:{id:vinculoId}});
 let count=0;
 for(const event of entitlements(vinculo.dataAdmissao,vinculo.tipo,until,vinculo.dataDesligamento)){
  const existing=await tx.descansoDireito.findUnique({where:{vinculoId_dataAquisicao:{vinculoId,dataAquisicao:event.dataAquisicao}}});
  if(existing)continue;
  const result=await tx.descansoDireito.createMany({data:{vinculoId,...event,origem:'AUTOMATICA'},skipDuplicates:true});
  if(result.count){await audit(tx,userId,'ADQUIRIR_DIREITO','vinculo',vinculoId,undefined,event);count++;}
 }
 return count;
}
export async function synchronize(db:PrismaClient,userId:string|null){
 let cursor:string|undefined,created=0;
 for(;;){const items=await db.vinculo.findMany({take:100,orderBy:{id:'asc'},...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!items.length)break;
 for(const v of items)created+=await transaction(db,tx=>acquire(tx,v.id,userId));cursor=items.at(-1)!.id;}
 return {created};
}
export async function balance(tx:Tx,vinculoId:string){
 const [rights,adjustments,consumptions,periods,v]=await Promise.all([
  tx.descansoDireito.findMany({where:{vinculoId},orderBy:{dataAquisicao:'asc'}}),
  tx.descansoAjuste.findMany({where:{vinculoId}}),
  tx.descansoConsumo.findMany({where:{periodo:{vinculoId,status:{not:'CANCELADO'}}}}),
  tx.descansoPeriodo.findMany({where:{vinculoId}}),
  tx.vinculo.findUniqueOrThrow({where:{id:vinculoId},include:{unidade:true,pessoa:true}})
 ]);
 const acquired=rights.reduce((sum,r)=>sum+Number(r.quantidadeDias),0),adjusted=adjustments.reduce((sum,r)=>sum+(r.tipo==='CREDITO'?1:-1)*Number(r.quantidadeDias),0),consumed=consumptions.reduce((sum,r)=>sum+Number(r.quantidadeDias),0);
 const saldo=Math.round((acquired+adjusted-consumed)*100)/100;
 const now=new Date();now.setUTCHours(0,0,0,0);
 const pending=rights.map(r=>({...r,pendente:Math.max(0,Number(r.quantidadeDias)-consumptions.filter(c=>c.direitoId===r.id).reduce((sum,c)=>sum+Number(c.quantidadeDias),0))}));
 const alerts:string[]=[];
 if(saldo<0)alerts.push('Saldo negativo: revisar exceções e ajustes.');
 if(v.dataDesligamento&&rights.some(r=>r.dataAquisicao>v.dataDesligamento!))alerts.push('Direitos posteriores ao desligamento: revisar com ajuste auditado.');
 for(const r of pending.filter(r=>r.pendente>0)){
  if(v.tipo==='CLT'&&!r.prazoConcessivo)alerts.push('Prazo concessivo não informado.');
  if(r.prazoConcessivo){const days=(r.prazoConcessivo.getTime()-now.getTime())/86400000;if(days<0)alerts.push('Férias vencidas com direito pendente.');else if(days<=v.unidade.diasAlerta)alerts.push('Prazo de férias próximo.');}
  if(rights.some(next=>next.dataAquisicao>r.dataAquisicao))alerts.push('Nova aquisição com direito anterior pendente.');
 }
 const next=entitlements(v.dataAdmissao,v.tipo,new Date(now.getTime()+v.unidade.diasAlerta*86400000),v.dataDesligamento).filter(e=>e.dataAquisicao>now);
 if(v.tipo==='ESTAGIO'&&next.length)alerts.push('Nova aquisição de descanso próxima.');
 return {vinculoId,pessoa:v.pessoa.nomeCompleto,unidadeId:v.unidadeId,equipeId:v.equipeId,tipo:v.tipo,status:v.status,saldo,adquiridos:acquired,consumidos:consumed,ajustes:adjusted,programados:periods.filter(p=>p.status==='PROGRAMADO').reduce((sum,p)=>sum+Number(p.quantidadeDias),0),direitos:pending,periodos:periods,consumos:consumptions,ajustesHistorico:adjustments,alertas:[...new Set(alerts)]};
}
