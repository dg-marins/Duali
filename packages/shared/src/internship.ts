import {z} from 'zod';
import {id,shortText,optionalText,optionalDate,money,date} from './schemas.js';
export const instituicaoSchema=z.object({nome:shortText,sigla:optionalText,ativa:z.boolean().default(true),observacoes:optionalText}).strict();
export const estagioSchema=z.object({vinculoId:id,instituicaoEnsinoId:id.nullable().optional(),matriculaAcademica:optionalText,curso:optionalText,periodoAcademico:optionalText,valorBolsa:money.nullable().optional(),observacoes:optionalText}).strict();
function range(v:{inicioVigencia?:string|null|undefined;fimVigencia?:string|null|undefined},ctx:z.RefinementCtx){if(v.inicioVigencia&&v.fimVigencia&&v.fimVigencia<v.inicioVigencia)ctx.addIssue({code:'custom',path:['fimVigencia'],message:'Fim anterior ao início.'});}
export const documentoSchema=z.object({vinculoId:id,tipo:z.enum(['TCE','ADITIVO','RENOVACAO','DISTRATO','OUTRO']),numero:optionalText,inicioVigencia:optionalDate,fimVigencia:optionalDate,status:z.enum(['PENDENTE','VIGENTE','VENCIDO','CANCELADO']).default('PENDENTE'),observacoes:optionalText}).strict().superRefine(range);
export const seguroSchema=z.object({vinculoId:id,seguradora:shortText,numeroApolice:optionalText,inicioVigencia:optionalDate,fimVigencia:optionalDate,status:z.enum(['ATIVO','ENCERRADO','PENDENTE']).default('PENDENTE'),observacoes:optionalText}).strict().superRefine(range);
export const movimentacaoSchema=z.object({seguroEstagioId:id,tipo:z.enum(['INCLUSAO','EXCLUSAO','ALTERACAO']),dataMovimentacao:date,observacoes:optionalText}).strict();
