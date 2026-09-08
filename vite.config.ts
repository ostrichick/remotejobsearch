import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sites } from '@openai/sites-vite-plugin';
import { getPlatformProxy } from 'wrangler';
import { api } from './server/worker';
import type { Env } from './server/env';

export default defineConfig({
  plugins: [react(), sites(), {
    name:'rolescout-api',
    async configureServer(server) {
      const proxy=await getPlatformProxy<Env>({configPath:'wrangler.jsonc'});
      server.httpServer?.on('close',()=>void proxy.dispose());
      server.middlewares.use(async(req,res,next)=>{
        if(!req.url?.startsWith('/api/'))return next();
        try{
          const chunks:Buffer[]=[];let size=0;
          for await(const chunk of req){size+=chunk.length;if(size>6_000_000){res.statusCode=413;res.end();return;}chunks.push(chunk);}
          const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
          const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method??'GET')?undefined:Buffer.concat(chunks)});
          const result=await api(request,proxy.env);res.statusCode=result.status;result.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await result.arrayBuffer()));
        }catch{res.statusCode=500;res.end(JSON.stringify({error:'로컬 서버 오류'}));}
      });
    }
  }],
  build:{outDir:'dist/client'},
});
