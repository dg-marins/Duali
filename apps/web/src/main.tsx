import {Imports} from './Imports';
import {Ledger} from './Ledger';
import React,{useEffect,useState,type FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {api,setCsrf,type Row} from './api';
import {screens} from './resources';
import {Notice,Records} from './components';
import './style.css';
function App(){
 const [user,setUser]=useState<Row|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[screen,setScreen]=useState('pessoas'),[email,setEmail]=useState(''),[senha,setSenha]=useState('');
 useEffect(()=>{void api<{usuario:Row;csrf:string}>('auth/me').then(result=>{setUser(result.usuario);setCsrf(result.csrf);}).catch(()=>{}).finally(()=>setLoading(false));},[]);
 async function login(e:FormEvent){e.preventDefault();setError('');try{const result=await api<{usuario:Row;csrf:string}>('auth/login','POST',{email,senha});setUser(result.usuario);setCsrf(result.csrf);setSenha('');}catch(e){setError((e as Error).message);}}
 if(loading)return <main role="status">Carregando Duali…</main>;
 if(!user)return <div className="login"><section className="panel"><div className="brand">duali<span>GESTÃO DE PESSOAS</span></div><h1>Bem-vindo de volta</h1><p>Entre para acompanhar sua operação.</p><form onSubmit={e=>void login(e)}><Notice text={error} error/><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Senha<input type="password" required value={senha} onChange={e=>setSenha(e.target.value)} autoComplete="current-password"/></label><button>Entrar</button></form></section></div>;
 const selected=screens.find(s=>s.path===screen)??screens[0]!;
 return <div className="shell"><aside><div className="brand">duali<span>GESTÃO DE PESSOAS</span></div><nav><button className={screen==='importacoes'?'active':''} onClick={()=>setScreen('importacoes')}>Importa??es</button><button className={screen==='saldos'?'active':''} onClick={()=>setScreen('saldos')}>Saldo e hist?rico</button>{screens.map(s=><button className={s.path===screen?'active':''} key={s.path} onClick={()=>setScreen(s.path)}>{s.title}</button>)}</nav><div className="account"><strong>{String(user.nome)}</strong><span>Administrador</span><button className="secondary" onClick={()=>{void api('auth/logout','POST',{}).then(()=>{setUser(null);setCsrf('');}).catch(e=>setError((e as Error).message));}}>Sair</button></div></aside><main><header className="topbar"><span>Operação / {selected.title}</span><span>Duali · Gestão de Pessoas</span></header><Notice text={error} error/>{screen==='importacoes'?<Imports/>:screen==='saldos'?<Ledger/>:<Records key={screen} screen={selected}/>}</main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
