// Copy and verify before switching storage. Never removes the source files.
const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand}=require('@aws-sdk/client-s3');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const required=name=>{if(!process.env[name])throw Error(`${name} is required`);return process.env[name];};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function main(){
 const bucket=required('S3_BUCKET');
 const client=new S3Client({region:process.env.S3_REGION||'auto',endpoint:required('S3_ENDPOINT'),forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false',credentials:{accessKeyId:required('S3_ACCESS_KEY_ID'),secretAccessKey:required('S3_SECRET_ACCESS_KEY')},maxAttempts:3});
 const dir=path.resolve(process.env.MEDIA_SOURCE_DIR||'uploads');
 const report=[];const apply=process.argv.includes('--apply');
 try {
  for(const name of (await fs.readdir(dir)).sort()){
   if(name==='.gitkeep')continue;
   if(!/^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(name))throw Error(`Unsupported file name: ${name}`);
   const info=await fs.lstat(path.join(dir,name));if(!info.isFile()||info.isSymbolicLink())throw Error('Non-regular media file');
   const bytes=await fs.readFile(path.join(dir,name));const digest=hash(bytes);
   if(apply){
    let exists=true;
    try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:name}));}catch(error){if(error.$metadata?.httpStatusCode===404)exists=false;else throw error;}
    if(!exists)await client.send(new PutObjectCommand({Bucket:bucket,Key:name,Body:bytes,ContentType:name.endsWith('.webp')?'image/webp':name.endsWith('.png')?'image/png':'image/jpeg'}));
    const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:name}));
    if(hash(Buffer.from(await object.Body.transformToByteArray()))!==digest)throw Error(`Object checksum mismatch: ${name}`);
   }
   report.push({name,size:bytes.length,sha256:digest,verified:apply});
  }
  const reportPath=path.resolve(process.env.MEDIA_MIGRATION_REPORT||`media-migration-${Date.now()}.json`);
  await fs.writeFile(reportPath,JSON.stringify({bucket,apply,files:report},null,2),{mode:0o600,flag:'wx'});
  console.log(`${apply?'Copied and verified':'Dry run'}: ${report.length} files. Report: ${reportPath}`);
 }finally{client.destroy();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
