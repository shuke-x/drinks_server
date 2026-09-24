const {spawn}=require('node:child_process');
const {generateKeyPairSync,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const env={...process.env,NODE_ENV:'production',PORT:'3019',DB_HOST:'127.0.0.1',DB_PORT:'55439',DB_NAME:'security_test',DB_USER:'drinks',DB_PASS:'drinks',DB_SYNC:'false',REDIS_HOST:'127.0.0.1',REDIS_PORT:'56389',STORAGE_DRIVER:'local',AUTH_JWT_SECRET:randomBytes(32).toString('hex'),AUTH_RSA_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}),ADMIN_BOOTSTRAP_EMAIL:'',PUBLIC_BASE_URL:'http://127.0.0.1:3019',SWAGGER_ENABLED:'false'};
async function main(){
 const log=fs.openSync('/private/tmp/drinks-security-boot.log','w',0o600);
 const child=spawn(process.execPath,['dist/src/main.js'],{env,stdio:['ignore',log,log]});
 try{
  let ready=false;
  for(let i=0;i<30;i++){
   if(child.exitCode!==null)throw Error('API exited during startup; inspect local boot log');
   try{const r=await fetch('http://127.0.0.1:3019/api/v1/health/ready');if(r.ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw Error('API readiness timed out');
  for(const [route,status] of [['/api/v1/health/live',200],['/api/v1/cocktail-categories',200],['/api/v1/cocktails?search=lime',200],['/static/unknown.webp',404],['/api/v1/admin/drink-records',401]]){
   const result=await fetch('http://127.0.0.1:3019'+route);if(result.status!==status)throw Error(`${route}: unexpected ${result.status}`);
  }
  console.log('PASS: full application startup, health, public lookup, guarded legacy media route, admin authentication');
 }finally{child.kill('SIGTERM');fs.closeSync(log);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
