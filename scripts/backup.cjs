const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const os=require('node:os');
const path=require('node:path');
const {S3Client,ListObjectsV2Command,GetObjectCommand}=require('@aws-sdk/client-s3');
const magic=Buffer.from('TDRINKS1');
function key(){const value=Buffer.from(process.env.BACKUP_KEY_BASE64||'','base64');if(value.length!==32)throw Error('BACKUP_KEY_BASE64 must contain a 32-byte key');return value;}
async function run(command,args,env=process.env){
 let target;
 if(env.PG_DOCKER_CONTAINER && ['pg_dump','pg_restore','createdb','psql'].includes(command)) {
  const container=env.PG_DOCKER_CONTAINER;
  if(!/^[a-zA-Z0-9_.-]+$/.test(container))throw Error('Invalid PostgreSQL container');
  const forward={PGHOST:env.PGHOST,PGPORT:env.PGPORT,PGUSER:env.PGUSER,PGPASSWORD:env.PGPASSWORD,PGDATABASE:env.PGDATABASE};
  const dockerArgs=['exec','-i',...Object.keys(forward).filter(k=>forward[k]).flatMap(k=>['-e',k]),container,command];
  if(command==='pg_dump') {const i=args.indexOf('--file');if(i>=0){target=args[i+1];args=[...args.slice(0,i),...args.slice(i+2)];}}
  if(command==='pg_restore') {
   const file=args[args.length-1];args=args.slice(0,-1);
   const child=spawn('docker',[...dockerArgs,...args],{env:{...env,...forward},stdio:['pipe','inherit','inherit']});
   const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('pg_restore failed')));});
   await Promise.all([pipeline(createReadStream(file),child.stdin),done]);return;
  }
  const child=spawn('docker',[...dockerArgs,...args],{env:{...env,...forward},stdio:['ignore',target?'pipe':'inherit','inherit']});
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${command} failed`)));});
  if(target)await Promise.all([pipeline(child.stdout,createWriteStream(target,{mode:0o600})),done]);else await done;
  return;
 }
 await new Promise((resolve,reject)=>{const child=spawn(command,args,{env,stdio:['ignore','inherit','inherit']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${command} failed`)));});
}
async function seal(input,output){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(magic);
 await fs.writeFile(output,Buffer.concat([magic,iv]),{mode:0o600,flag:'wx'});
 await pipeline(createReadStream(input),cipher,createWriteStream(output,{flags:'a'}));
 await fs.appendFile(output,cipher.getAuthTag());
}
async function unseal(input,output){
 const handle=await fs.open(input,'r');const stat=await handle.stat();
 if(stat.size<36)throw Error('Invalid backup');
 const header=Buffer.alloc(20),tag=Buffer.alloc(16);await handle.read(header,0,20,0);await handle.read(tag,0,16,stat.size-16);await handle.close();
 if(!header.subarray(0,8).equals(magic))throw Error('Invalid backup format');
 const decipher=createDecipheriv('aes-256-gcm',key(),header.subarray(8));decipher.setAAD(magic);decipher.setAuthTag(tag);
 await pipeline(createReadStream(input,{start:20,end:stat.size-17}),decipher,createWriteStream(output,{flags:'wx',mode:0o600}));
}
async function backup(){
 if(process.env.BACKUP_WRITES_PAUSED!=='true')throw Error('Pause application writes, then set BACKUP_WRITES_PAUSED=true for a consistent snapshot');
 key();
 const target=path.resolve(process.env.BACKUP_DIR||'backups');await fs.mkdir(target,{recursive:true,mode:0o700});
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'tonight-backup-'));await fs.chmod(tmp,0o700);
 const output=path.join(target,`tonight-${new Date().toISOString().replace(/[:.]/g,'-')}.tdbackup`);
 try{
  const snapshot=path.join(tmp,'snapshot');await fs.mkdir(snapshot);await fs.mkdir(path.join(snapshot,'uploads'));
  const env={...process.env,PGHOST:process.env.DB_HOST||'localhost',PGPORT:process.env.DB_PORT||'5432',PGUSER:process.env.DB_USER||'drinks',PGPASSWORD:process.env.DB_PASS||'',PGDATABASE:process.env.DB_NAME||'tonight_drinks'};
  // Ephemeral seven-day records (including embedded photos and public snapshots)
  // are deliberately absent from backups, so a restore cannot resurrect them.
  await run('pg_dump',['--format=custom','--exclude-table-data=drink_records','--file',path.join(snapshot,'database.dump')],env);
  const files=[];
  const add=async(name,bytes)=>{if(!/^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(name))throw Error('Invalid media key');await fs.writeFile(path.join(snapshot,'uploads',name),bytes,{mode:0o600});files.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});};
  if(process.env.STORAGE_DRIVER==='s3'){
   const client=new S3Client({region:process.env.S3_REGION||'auto',endpoint:process.env.S3_ENDPOINT,forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});
   try{let token;do{const page=await client.send(new ListObjectsV2Command({Bucket:process.env.S3_BUCKET,ContinuationToken:token}));for(const entry of page.Contents||[]){const obj=await client.send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:entry.Key}));await add(entry.Key,Buffer.from(await obj.Body.transformToByteArray()));}token=page.NextContinuationToken;}while(token);}finally{client.destroy();}
  }else{
   const source=path.resolve(process.env.MEDIA_SOURCE_DIR||'uploads');for(const name of await fs.readdir(source)){if(name==='.gitkeep')continue;const file=path.join(source,name);const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Invalid local image file');await add(name,await fs.readFile(file));}
  }
  await fs.writeFile(path.join(snapshot,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),recordsExcluded:true,files}),{mode:0o600});
  const archive=path.join(tmp,'snapshot.tar');await run('tar',['-cf',archive,'-C',snapshot,'.']);await seal(archive,output);
  console.log(`Encrypted backup: ${output}`);
 }catch(error){await fs.rm(output,{force:true});throw error;}finally{await fs.rm(tmp,{recursive:true,force:true});}
}
async function restore(){
 if(process.env.RESTORE_CONFIRM!=='isolated')throw Error('Set RESTORE_CONFIRM=isolated; restore only to a new isolated database');
 if(!/^(restore_|verify_)[a-zA-Z0-9_]+$/.test(process.env.RESTORE_DB_NAME||''))throw Error('RESTORE_DB_NAME must start with restore_ or verify_');
 const source=path.resolve(process.argv[3]||'');const dest=path.resolve(process.env.RESTORE_DIR||'');
 if(!process.env.RESTORE_DIR)throw Error('RESTORE_DIR is required');
 try{await fs.access(dest);throw Error('RESTORE_DIR must not already exist');}catch(error){if(error.code!=='ENOENT')throw error;}
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'tonight-restore-'));await fs.chmod(tmp,0o700);
 try{
  const archive=path.join(tmp,'verified.tar');await unseal(source,archive);
  const snapshot=path.join(tmp,'snapshot');await fs.mkdir(snapshot);await run('tar',['-xf',archive,'-C',snapshot]);
  const manifest=JSON.parse(await fs.readFile(path.join(snapshot,'manifest.json'),'utf8'));
  if(manifest.recordsExcluded!==true)throw Error('Backup retention policy mismatch');
  for(const file of manifest.files){if(!/^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png|webp)$/.test(file.name))throw Error('Invalid image key');if(createHash('sha256').update(await fs.readFile(path.join(snapshot,'uploads',file.name))).digest('hex')!==file.sha256)throw Error('Media checksum mismatch');}
  const env={...process.env,PGHOST:process.env.RESTORE_DB_HOST||'localhost',PGPORT:process.env.RESTORE_DB_PORT||'5432',PGUSER:process.env.RESTORE_DB_USER||'drinks',PGPASSWORD:process.env.RESTORE_DB_PASS||'',PGDATABASE:process.env.RESTORE_DB_NAME};
  await run('createdb',[process.env.RESTORE_DB_NAME],env);
  await run('pg_restore',['--exit-on-error','--no-owner','--no-privileges','--dbname',process.env.RESTORE_DB_NAME,path.join(snapshot,'database.dump')],env);
  await run('psql',['--set','ON_ERROR_STOP=1','--command',`DELETE FROM admin_audit_logs WHERE "targetType"='drink_record';`],env);
  await fs.rename(path.join(snapshot,'uploads'),dest);
  console.log(`Restored to isolated database ${process.env.RESTORE_DB_NAME}; verified ${manifest.files.length} images in ${dest}`);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
if(require.main===module)(process.argv[2]==='restore'?restore():backup()).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={seal,unseal};
