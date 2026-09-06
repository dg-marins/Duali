import {test,expect} from 'vitest';
import {fixture} from './test-helper.js';
import {benefitCalculation} from './modules/benefits.js';
test('benefit amounts use decimal arithmetic and retain discrepancies',()=>{
 const result=benefitCalculation({quantidadeDias:'3',valorUnitario:'.10',valorInformado:'.50',ajustes:[{tipo:'CREDITO',valor:'.05'}]});
 expect(result.valorCalculado).toBe('0.35');expect(result.divergencia).toBe('0.15');
});
test('unit configuration supports multiple monthly components and rejects incompatible unit',async()=>{
 const f=await fixture();try{
 const p=await f.db.pessoa.create({data:{nomeCompleto:'Pessoa benefícios'}});
 const unit=await f.db.unidade.create({data:{nome:'Unidade',sigla:f.suffix,uf:'DF'}});
 const v=await f.db.vinculo.create({data:{pessoaId:p.id,unidadeId:unit.id,tipo:'CLT',dataAdmissao:new Date('2025-01-01')}});
 const provider=await f.db.fornecedor.create({data:{nome:f.suffix}});
 const config=await f.db.configuracaoBeneficio.create({data:{unidadeId:unit.id,fornecedorId:provider.id,tipo:'TRANSPORTE'}});
 const benefit=await f.db.beneficioVinculo.create({data:{vinculoId:v.id,tipo:'TRANSPORTE',inicioVigencia:new Date('2025-01-01')}});
 for(const componente of ['Ônibus','Metrô']){
 const r=await f.app.inject({method:'POST',url:'/api/competencias',headers:f.headers,payload:{beneficioVinculoId:benefit.id,configuracaoId:config.id,componente,competencia:'2025-02-01',quantidadeDias:20,valorUnitario:5,valorInformado:101}});
 expect(r.statusCode,r.body).toBe(201);
 }
 expect(await f.db.beneficioCompetencia.count({where:{beneficioVinculoId:benefit.id}})).toBe(2);
 const invalid=await f.app.inject({method:'POST',url:'/api/competencias',headers:f.headers,payload:{beneficioVinculoId:benefit.id,configuracaoId:config.id,componente:'Outro',competencia:'2025-02-01',quantidadeDias:20,quantidade:1}});
 expect(invalid.statusCode).toBe(422);
 }finally{await f.app.close();}
});
