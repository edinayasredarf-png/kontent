import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { vk } from "../src/lib/publishing/vk";
import { PublishError } from "../src/lib/publishing/types";

test("VK six-slide carousel recovers a temporary HTML upload failure and API rate limit without losing order or publishing twice", async()=>{
 let base='', uploads=0, saved=0, rateLimited=false, posts=0; const prior=process.env.VK_API_BASE;
 const server=http.createServer(async(req,res)=>{
  let body=''; for await(const chunk of req) body+=chunk;
  const method=req.url!.split('/').at(-1), params=new URLSearchParams(body);
  const json=(response:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({response}));};
  if(method==='upload') { uploads++;if(uploads<=2){res.statusCode=500;return res.end('<html>temporarily unavailable</html>');}return res.end(JSON.stringify({server:1,photo:'[{}]',hash:'hash'})); }
  assert.equal(params.get('access_token'),'user-key');
  if(method==='photos.getWallUploadServer') return json({upload_url:`${base}/upload`});
  if(method==='photos.saveWallPhoto') {
   if(saved===2&&!rateLimited){rateLimited=true;return res.end(JSON.stringify({error:{error_code:6,error_msg:'Too many requests per second'}}));}
   saved++;return json([{id:100+saved,owner_id:42,access_key:'key'}]);
  }
  if(method==='wall.post'){posts++;assert.equal(params.get('attachments'),Array.from({length:6},(_,i)=>`photo42_${101+i}_key`).join(','));return json({post_id:99});}
  if(method==='wall.getById')return json({items:[{attachments:Array.from({length:6},(_,i)=>({type:'photo',photo:{id:501+i,owner_id:-7}}))}]});
  assert.fail(`Unexpected ${method}`);
 });
 try {
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;process.env.VK_API_BASE=base;
  const result=await vk.publish({text:'Carousel',images:Array.from({length:6},()=>({data:Buffer.from('jpeg'),mime:'image/jpeg'}))},{token:'group-key',photoToken:'user-key',target:'7'});
  assert.equal(result.url,'https://vk.com/wall-7_99');assert.equal(saved,6);assert.equal(uploads,8);assert.equal(posts,1);assert.ok(rateLimited);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(prior===undefined)delete process.env.VK_API_BASE;else process.env.VK_API_BASE=prior;}
});
test("more than ten images is rejected instead of silently dropping carousel slides",async()=>{
 await assert.rejects(vk.publish({text:'x',images:Array.from({length:11},()=>({data:Buffer.from('jpeg'),mime:'image/jpeg'}))},{token:'x',target:'7'}),e=>e instanceof PublishError&&!e.retryable&&/не более 10/.test(e.message));
});
