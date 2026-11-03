import {test} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import sharp from "sharp";
import {newsMediaBytes} from "../src/lib/monitor/media";
import {parseTelegram} from "../src/lib/monitor/parse";

test("Telegram: video URL and publication date survive offline-card parsing",()=>{
 const [post]=parseTelegram(`<div class="tgme_widget_message_wrap"><video src="https://cdn.example.org/post.mp4"></video><a class="tgme_widget_message_date" href="https://t.me/example_channel/123"><time datetime="2026-11-03T06:02:41Z"></time></a></div>`,"example_channel");
 assert.equal(post.title,"Видео из Telegram");
 assert.equal(post.publishedAt.toISOString(),"2026-11-03T06:02:41.000Z");
 assert.deepEqual(post.media,[{type:"video",url:"https://cdn.example.org/post.mp4"}]);
});

test("Telegram image proxy downloads once, coalesces parallel requests and serves safe WebP",async()=>{
 const previous=process.env.ALLOW_PRIVATE_FETCH;process.env.ALLOW_PRIVATE_FETCH="1";
 const png=await sharp({create:{width:8,height:6,channels:3,background:"#136aab"}}).png().toBuffer();
 let hits=0;
 const server=http.createServer((_req,res)=>{hits++;res.writeHead(200,{"Content-Type":"image/png"});res.end(png);});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 try {
  const addr=server.address() as {port:number};
  const row={id:"test-post",url:"https://t.me/example_channel/123",media:[{type:"image" as const,url:`http://127.0.0.1:${addr.port}/photo`}]};
  const images=await Promise.all(Array.from({length:4},()=>newsMediaBytes("test-org",row,0)));
  assert.equal(hits,1);assert.equal(images[0].mime,"image/webp");
  assert.equal((await sharp(images[0].data).metadata()).width,8);
  assert.equal((await newsMediaBytes("test-org",row,0)).mime,"image/webp");
  assert.equal(hits,1);
 } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(previous===undefined)delete process.env.ALLOW_PRIVATE_FETCH;else process.env.ALLOW_PRIVATE_FETCH=previous;}
});
