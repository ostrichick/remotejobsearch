import {rm,realpath} from 'node:fs/promises';
import path from 'node:path';
const root=await realpath(new URL('..',import.meta.url));
const output=path.resolve(root,'dist');
if(path.dirname(output)!==root||path.basename(output)!=='dist')throw new Error('Unexpected build output');
await rm(output,{recursive:true,force:true});
