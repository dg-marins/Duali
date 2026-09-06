import {z} from 'zod';
import {id,date,optionalDate,optionalText,shortText,money} from './schemas.js';
export const benefitTypes=['TRANSPORTE','ALIMENTACAO','CESTA_BASICA','PREMIACAO','OUTRO'] as const;
export const fornecedorSchema=z.object({nome:shortText,ativo:z.boolean().default(true)}).strict();
export const configuracaoBeneficioSchema=z.object({unidadeId:id,tipo:z.enum(benefitTypes),fornecedorId:id,ativa:z.boolean().default(true),observacoes:optionalText}).strict();
export const beneficioVinculoSchema=z.object({vinculoId:id,tipo:z.enum(benefitTypes),inicioVigencia:date,fimVigencia:optionalDate,status:z.enum(['ATIVO','ENCERRADO']).default('ATIVO'),observacoes:optionalText}).strict().superRefine((v,ctx)=>{if(v.fimVigencia&&v.fimVigencia<v.inicioVigencia)ctx.addIssue({code:'custom',path:['fimVigencia'],message:'Fim anterior ao início.'});});
const quantity=z.coerce.number().min(0).max(99999).multipleOf(.01).nullable().optional();
export const competenciaSchema=z.object({beneficioVinculoId:id,configuracaoId:id,componente:shortText.default('Principal'),competencia:date.refine(v=>v.endsWith('-01'),'Informe o primeiro dia do mês.'),quantidadeDias:quantity,quantidade:quantity,valorUnitario:money.nullable().optional(),valorInformado:money.nullable().optional(),status:z.enum(['PENDENTE','CONFERIDO','PAGO','CANCELADO']).default('PENDENTE'),observacoes:optionalText}).strict().superRefine((v,ctx)=>{if(v.quantidadeDias!=null&&v.quantidade!=null)ctx.addIssue({code:'custom',path:['quantidade'],message:'Informe dias ou quantidade, não ambos.'});});
export const beneficioAjusteSchema=z.object({competenciaId:id,tipo:z.enum(['CREDITO','DEBITO']),valor:money.refine(v=>v>0),motivo:shortText}).strict();
