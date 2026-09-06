import {z} from 'zod';
export const id = z.string().uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Use AAAA-MM-DD').refine(v=>!Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v,'Data inválida');
export const optionalText = z.string().trim().max(5000).nullable().optional();
export const shortText = z.string().trim().min(1).max(180);
export const optionalDate = date.nullable().optional();
export const money = z.coerce.number().finite().min(0).max(9999999999.99).multipleOf(0.01);
export function validCpf(value:string):boolean {
 if(!/^\d{11}$/.test(value)|| /^(\d)\1+$/.test(value)) return false;
 for(let n=9;n<=10;n++){let sum=0;for(let i=0;i<n;i++)sum+=Number(value[i])*(n+1-i);const digit=(sum*10)%11; if((digit===10?0:digit)!==Number(value[n]))return false;} return true;
}
export const pessoaSchema=z.object({nomeCompleto:shortText,nomeSocial:optionalText,cpf:z.string().transform(v=>v.replace(/\D/g,'')).refine(validCpf,'CPF inválido').nullable().optional(),rg:z.string().max(30).nullable().optional(),dataNascimento:optionalDate,email:z.string().email().max(180).nullable().optional(),telefone:z.string().max(30).nullable().optional(),endereco:optionalText,observacoes:optionalText,ativa:z.boolean().default(true)}).strict();
export const unidadeSchema=z.object({nome:shortText,sigla:z.string().trim().min(1).max(20),cidade:optionalText,uf:z.string().regex(/^[A-Z]{2}$/),ativa:z.boolean().default(true),diasAlerta:z.coerce.number().int().min(1).max(365).default(30)}).strict();
export const equipeSchema=z.object({nome:shortText,ativa:z.boolean().default(true),observacoes:optionalText}).strict();
export const vinculoSchema=z.object({pessoaId:id,unidadeId:id,equipeId:id.nullable().optional(),tipo:z.enum(['CLT','ESTAGIO']),status:z.enum(['ATIVO','AFASTADO','DESLIGADO']).default('ATIVO'),matricula:optionalText,dataAdmissao:date,dataDesligamento:optionalDate,cargoFuncao:optionalText,gestor:optionalText,observacoes:optionalText}).strict().superRefine((v,ctx)=>{if((v.status==='DESLIGADO')!==Boolean(v.dataDesligamento))ctx.addIssue({code:'custom',path:['dataDesligamento'],message:'Desligamento exige status DESLIGADO e data.'});if(v.dataDesligamento && v.dataDesligamento<v.dataAdmissao)ctx.addIssue({code:'custom',path:['dataDesligamento'],message:'Desligamento anterior à admissão.'});});
export const loginSchema=z.object({email:z.string().email().transform(v=>v.trim().toLowerCase()),senha:z.string().min(1).max(200)}).strict();
export const usuarioSchema=z.object({nome:shortText,email:z.string().email().max(180).transform(v=>v.trim().toLowerCase()),ativo:z.boolean().default(true),senha:z.string().min(12).max(200).optional()}).strict();
export const listSchema=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),q:z.string().max(180).optional(),unidadeId:id.optional(),equipeId:id.optional(),vinculoId:id.optional(),pessoaId:id.optional(),status:z.string().max(30).optional(),tipo:z.string().max(30).optional(),inicio:date.optional(),fim:date.optional()}).strict();
