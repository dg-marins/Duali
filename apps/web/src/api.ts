export type Row=Record<string,unknown>;
let csrf='';
export function setCsrf(value:string){csrf=value;}
export class ApiError extends Error {constructor(message:string,public fields:Record<string,string[]>={}){super(message);}}
export async function api<T=Row>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch('/api/'+path,{method,credentials:'same-origin',headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),'X-CSRF-Token':csrf},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
 const data:unknown=await response.json();
 if(!response.ok){const error=(data as {error?:{message?:string;fields?:{fieldErrors?:Record<string,string[]>}}}).error;throw new ApiError(error?.message??'Não foi possível concluir.',error?.fields?.fieldErrors??{});}
 return data as T;
}
export function display(value:unknown):string {
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(typeof value==='object'){const row=value as Row;if(row.pessoa)return display(row.pessoa)+' · '+display(row.tipo);return String(row.nomeCompleto??row.nome??row.seguradora??(row.dataAquisicao?'Aquisição '+display(row.dataAquisicao):row.dataInicio?'Período '+display(row.dataInicio):row.sigla??row.id??''));}
 const text=String(value);
 if(/^\d{4}-\d{2}-\d{2}T/.test(text))return text.slice(0,10).split('-').reverse().join('/');
 return text;
}
