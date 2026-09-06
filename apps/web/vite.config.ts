import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
const target=process.env.API_PROXY_TARGET??'http://127.0.0.1:3000';
export default defineConfig({plugins:[react(),tailwind()],server:{proxy:{'/api':target,'/health':target}}});
