import {readConfig} from './config.js';
import {createApp} from './app.js';
const config=readConfig();
const app=createApp();
await app.listen({host:config.API_HOST,port:config.API_PORT});
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void app.close();});

