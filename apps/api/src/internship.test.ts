import {test,expect} from 'vitest';
import {fixture} from './test-helper.js';
import {internshipAlerts} from './modules/internship.js';
test('internship records, renewals and expiry alerts preserve history',async()=>{
 const f=await fixture();try{
 const p=await f.db.pessoa.create({data:{nomeCompleto:'Estagiário sintético'}});
 const u=await f.db.unidade.create({data:{nome:'Unidade',sigla:f.suffix,uf:'SP'}});
 const v=await f.db.vinculo.create({data:{pessoaId:p.id,unidadeId:u.id,tipo:'ESTAGIO',dataAdmissao:new Date('2020-01-01')}});
 for(const tipo of ['TCE','RENOVACAO','RENOVACAO']){
 const response=await f.app.inject({method:'POST',url:'/api/documentos',headers:f.headers,payload:{vinculoId:v.id,tipo,inicioVigencia:'2020-01-01',fimVigencia:'2020-12-31',status:'VIGENTE'}});
 expect(response.statusCode,response.body).toBe(201);
 }
 expect(await f.db.documentoVinculo.count({where:{vinculoId:v.id}})).toBe(3);
 expect((await internshipAlerts(f.db)).filter(a=>a.vinculoId===v.id)).toHaveLength(3);
 const invalid=await f.app.inject({method:'POST',url:'/api/seguros',headers:f.headers,payload:{vinculoId:v.id,seguradora:'Seguro',inicioVigencia:'2025-01-01',fimVigencia:'2024-01-01'}});
 expect(invalid.statusCode).toBe(422);
 }finally{await f.app.close();}
});
