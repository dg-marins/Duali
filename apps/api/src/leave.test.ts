import {test,expect} from 'vitest';
import {fixture} from './test-helper.js';
import {acquire,balance} from './modules/leave-domain.js';
import {transaction} from './core.js';
test('concurrent acquisitions, consumption, exception and cancellation reconstruct balance',async()=>{
 const f=await fixture();try{
 const p=await f.db.pessoa.create({data:{nomeCompleto:'Pessoa descanso'}});
 const u=await f.db.unidade.create({data:{nome:'Unidade',sigla:f.suffix,uf:'RJ'}});
 const v=await f.db.vinculo.create({data:{pessoaId:p.id,unidadeId:u.id,tipo:'ESTAGIO',dataAdmissao:new Date('2024-01-31'),dataDesligamento:new Date('2024-08-01'),status:'DESLIGADO'}});
 await Promise.all([transaction(f.db,tx=>acquire(tx,v.id,f.user.id)),transaction(f.db,tx=>acquire(tx,v.id,f.user.id))]);
 expect(await f.db.descansoDireito.count({where:{vinculoId:v.id}})).toBe(1);
 const right=await f.db.descansoDireito.findFirstOrThrow({where:{vinculoId:v.id}});
 const period=await f.db.descansoPeriodo.create({data:{vinculoId:v.id,dataInicio:new Date('2024-07-01'),dataFim:new Date('2024-07-20'),quantidadeDias:20,tipo:'DESCANSO_ESTAGIO'}});
 const consume=async(motivo?:string)=>f.app.inject({method:'POST',url:'/api/consumos',headers:f.headers,payload:{periodoId:period.id,direitoId:right.id,quantidadeDias:20,...(motivo?{motivo}:{})}});
 expect((await consume()).statusCode).toBe(422);
 expect((await consume('Exceção sintética autorizada')).statusCode).toBe(201);
 const ledger=await balance(f.db,v.id);expect(ledger.saldo).toBe(-5);expect(ledger.alertas.join(' ')).toContain('Saldo negativo');
 const cancel=await f.app.inject({method:'PUT',url:'/api/periodos/'+period.id,headers:f.headers,payload:{vinculoId:v.id,dataInicio:'2024-07-01',dataFim:'2024-07-20',quantidadeDias:20,tipo:'DESCANSO_ESTAGIO',status:'CANCELADO',motivo:'Cancelado para correção'}});
 expect(cancel.statusCode,cancel.body).toBe(200);
 expect((await balance(f.db,v.id)).saldo).toBe(15);
 expect(await f.db.descansoConsumo.count({where:{periodoId:period.id}})).toBe(1);
 }finally{await f.app.close();}
});
