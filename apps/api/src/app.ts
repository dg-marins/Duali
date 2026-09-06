import Fastify from 'fastify';
import {PrismaClient} from '@duali/database';
export function createApp(db = new PrismaClient()) {
 const app = Fastify({logger:{redact:['req.headers.cookie','req.headers.authorization','res.headers.set-cookie']},disableRequestLogging:true});
 app.get('/health',async()=>{await db.$queryRaw`SELECT 1`;return {status:'ok'};});
 app.addHook('onClose',async()=>{await db.$disconnect();});
 return app;
}

