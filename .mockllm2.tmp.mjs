import http from "node:http";
import sharp from "sharp";
const png = await sharp({ create: { width: 1024, height: 683, channels: 3, background: "#3366aa" } }).png().toBuffer();
http.createServer((req, res) => { const c=[]; req.on("data",d=>c.push(d)); req.on("end",()=>{ res.setHeader("Content-Type","application/json");
  if (req.url.includes("/images/generations")) return res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
  res.end(JSON.stringify({choices:[{message:{content:"A calm city park with a tree inspection crew, soft daylight, photorealistic"}}]})); }); }).listen(54400, ()=>console.log("mock"));
