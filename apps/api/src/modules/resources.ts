import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@duali/database';
import {z,listSchema,pessoaSchema,unidadeSchema,equipeSchema,vinculoSchema,usuarioSchema} from '@duali/shared';
import argon2 from 'argon2';
import {audit,dateData,DomainError,model,paramsId,transaction,type Row,type Tx} from '../core.js';
export interface Resource {path:string;model:string;schema:z.ZodTypeAny;dates?:string[];search?:string;include?:Row;select?:Row;filters?:string[];before?:(tx:Tx,data:Row,previous:Row|null,userId:string)=>Promise<void>;after?:(tx:Tx,current:Row,previous:Row|null,userId:string)=>Promise<void>;}
export const resources:Resource[]=[
 {path:'pessoas',model:'pessoa',schema:pessoaSchema,dates:['dataNascimento'],search:'nomeCompleto'},
 {path:'unidades',model:'unidade',schema:unidadeSchema,search:'nome'},
 {path:'equipes',model:'equipe',schema:equipeSchema,search:'nome'},
 {path:'vinculos',model:'vinculo',schema:vinculoSchema,dates:['dataAdmissao','dataDesligamento'],filters:['pessoaId','unidadeId','equipeId','status','tipo'],include:{pessoa:true,unidade:true,equipe:true},before:async(tx,data,previous)=>{
  if(previous&&(previous.tipo!==data.tipo||String(previous.pessoaId)!==data.pessoaId||String((previous.dataAdmissao as Date).toISOString().slice(0,10))!==(data.dataAdmissao as Date).toISOString().slice(0,10)))throw new DomainError(409,'Pessoa, tipo e admissão são imutáveis; encerre e crie outro vínculo para preservar o histórico.');
  const unit=await tx.unidade.findUnique({where:{id:String(data.unidadeId)}});
  if(!unit?.ativa)throw new DomainError(422,'Selecione uma unidade ativa.');
  if(data.equipeId){const team=await tx.equipe.findUnique({where:{id:String(data.equipeId)}});if(!team?.ativa)throw new DomainError(422,'Selecione uma equipe ativa.');}
 },after:async(tx,current,previous)=>{if(current.equipeId!==previous?.equipeId){const now=new Date();await tx.vinculoEquipeHistorico.updateMany({where:{vinculoId:String(current.id),fimEm:null},data:{fimEm:now}});if(current.equipeId)await tx.vinculoEquipeHistorico.create({data:{vinculoId:String(current.id),equipeId:String(current.equipeId),inicioEm:now}});}}},
 {path:'usuarios',model:'usuario',schema:usuarioSchema,search:'nome',select:{id:true,nome:true,email:true,ativo:true,ultimoLoginEm:true,criadoEm:true},before:async(tx,data,previous,userId)=>{
  if(previous?.id===userId&&data.ativo===false)throw new DomainError(422,'Não é possível desativar seu próprio acesso.');
  if(!previous&&!data.senha)throw new DomainError(422,'Informe senha com pelo menos 12 caracteres.');
  if(typeof data.senha==='string')data.senhaHash=await argon2.hash(data.senha,{type:argon2.argon2id});
  delete data.senha;
  if(previous&&(data.senhaHash||data.ativo===false))await tx.sessao.deleteMany({where:{usuarioId:String(previous.id)}});
 }}
];
export function queryFor(resource:Resource,query:ReturnType<typeof listSchema.parse>):Row{
 const where:Row={};
 if(query.q&&resource.search)where[resource.search]={contains:query.q,mode:'insensitive'};
 for(const key of resource.filters??[]){const value=query[key as keyof typeof query];if(value)where[key]=value;}
 return where;
}
export async function saveResource(tx:Tx,resource:Resource,input:unknown,userId:string,recordId?:string){
 const data=dateData(resource.schema.parse(input) as Row,resource.dates??[]);
 const delegate=model(tx,resource.model);
 const previous=recordId?await delegate.findUnique({where:{id:recordId},...(resource.select?{select:resource.select}:{})}):null;
 if(recordId&&!previous)throw new DomainError(404,'Registro não encontrado.');
 await resource.before?.(tx,data,previous,userId);
 const args={data,...(resource.select?{select:resource.select}:{})};
 const current=recordId?await delegate.update({...args,where:{id:recordId}}):await delegate.create(args);
 await resource.after?.(tx,current,previous,userId);
 await audit(tx,userId,recordId?'ALTERAR':'CRIAR',resource.model,String(current.id),previous??undefined,current);
 return current;
}
export function registerResource(app:FastifyInstance,db:PrismaClient,resource:Resource){
 app.get('/api/'+resource.path,async req=>{const query=listSchema.parse(req.query);const where=queryFor(resource,query);const delegate=model(db,resource.model);const [items,total]=await Promise.all([delegate.findMany({where,orderBy:{id:'asc'},skip:(query.page-1)*query.pageSize,take:query.pageSize,...(resource.include?{include:resource.include}:{}),...(resource.select?{select:resource.select}:{})}),delegate.count({where})]);return {items,total,page:query.page,pageSize:query.pageSize};});
 app.get('/api/'+resource.path+'/:id',async req=>{const {id}=paramsId.parse(req.params);const item=await model(db,resource.model).findUnique({where:{id},...(resource.include?{include:resource.include}:{}),...(resource.select?{select:resource.select}:{})});if(!item)throw new DomainError(404,'Registro não encontrado.');return item;});
 app.post('/api/'+resource.path,async(req,reply)=>{const result=await transaction(db,tx=>saveResource(tx,resource,req.body,req.userId!));reply.code(201);return result;});
 app.put('/api/'+resource.path+'/:id',async req=>{const {id}=paramsId.parse(req.params);return transaction(db,tx=>saveResource(tx,resource,req.body,req.userId!,id));});
}
export function registerPeople(app:FastifyInstance,db:PrismaClient){
 for(const resource of resources)registerResource(app,db,resource);
 app.get('/api/vinculos/:id/equipes-historico',async req=>{const {id}=paramsId.parse(req.params);return db.vinculoEquipeHistorico.findMany({where:{vinculoId:id},include:{equipe:true},orderBy:{inicioEm:'desc'}});});
 app.get('/api/auditoria',async req=>{const query=listSchema.parse(req.query);const [items,total]=await Promise.all([db.auditoria.findMany({orderBy:{criadoEm:'desc'},skip:(query.page-1)*query.pageSize,take:query.pageSize,include:{usuario:{select:{nome:true}}}}),db.auditoria.count()]);return {items,total,page:query.page,pageSize:query.pageSize};});
}
