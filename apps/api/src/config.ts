import {config as dotenv} from 'dotenv';
import {fileURLToPath} from 'node:url';
import {z} from '@duali/shared';
dotenv({path:fileURLToPath(new URL('../../../.env',import.meta.url)),quiet:true});
export function readConfig(){return z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),API_HOST:z.string().default('127.0.0.1'),API_PORT:z.coerce.number().int().min(1).max(65535).default(3000),DATABASE_URL:z.string().min(1),APP_ORIGIN:z.string().url().default('http://localhost:5173'),SESSION_HOURS:z.coerce.number().positive().max(168).default(8),UPLOAD_DIR:z.string().default('./var/uploads')}).parse(process.env);}

