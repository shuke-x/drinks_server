// Local drill only: requires the isolated compose.security-test.yml PostgreSQL.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {unseal}=require('./backup.cjs');
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tonight-drill-'));
 const source=path.join(root,'uploads'),backupDir=path.join(root,'backups');await fs.mkdir(source);
 const fixture=Buffer.from('fixture-for-checksum-verification');await fs.writeFile(path.join(source,'abcdefghijklmnop.webp'),fixture);
 const env={...process.env,PG_DOCKER_CONTAINER:'tonight-security-verification-postgres-1',DB_HOST:'localhost',DB_PORT:'5432',DB_NAME:'security_test',DB_USER:'drinks',DB_PASS:'drinks',STORAGE_DRIVER:'local',MEDIA_SOURCE_DIR:source,BACKUP_DIR:backupDir,BACKUP_WRITES_PAUSED:'true',BACKUP_KEY_BASE64:randomBytes(32).toString('base64')};
 const run=(command,args,vars=env)=>{const r=spawnSync(command,args,{env:vars,encoding:'utf8'});if(r.status!==0)throw Error(`${command} failed: ${r.stderr}`);return r.stdout;};
 const db=`verify_security_${Date.now()}`;
 try{
  run('docker',['exec',env.PG_DOCKER_CONTAINER,'psql','-U','drinks','-d','security_test','-v','ON_ERROR_STOP=1','-c',`INSERT INTO drink_records ("ownerId",id,"occurredAt",data) SELECT id,'backup-exclusion',NOW(),'{"note":"temporary-record-must-not-be-backed-up"}'::jsonb FROM users LIMIT 1 ON CONFLICT DO NOTHING;`]);
  run(process.execPath,[path.join(__dirname,'backup.cjs')]);
  const archive=path.join(backupDir,(await fs.readdir(backupDir))[0]);
  const bytes=await fs.readFile(archive);if(bytes.includes(Buffer.from('fixture-for-checksum')))throw Error('Backup is plaintext');
  process.env.BACKUP_KEY_BASE64=env.BACKUP_KEY_BASE64;
  const tampered=path.join(root,'tampered');bytes[25]^=1;await fs.writeFile(tampered,bytes);
  let rejected=false;try{await unseal(tampered,path.join(root,'invalid.tar'));}catch{rejected=true;}if(!rejected)throw Error('Tampering accepted');
  const dest=path.join(root,'restored');
  run(process.execPath,[path.join(__dirname,'backup.cjs'),'restore',archive],{...env,RESTORE_CONFIRM:'isolated',RESTORE_DB_NAME:db,RESTORE_DB_HOST:'localhost',RESTORE_DB_PORT:'5432',RESTORE_DB_USER:'drinks',RESTORE_DB_PASS:'drinks',RESTORE_DIR:dest});
  if(!(await fs.readFile(path.join(dest,'abcdefghijklmnop.webp'))).equals(fixture))throw Error('Restored image differs');
  const count=run('docker',['exec',env.PG_DOCKER_CONTAINER,'psql','-U','drinks','-d',db,'-tAc','SELECT count(*) FROM drink_records']).trim();if(count!=='0')throw Error('Ephemeral records were restored');
  console.log('PASS: encrypted PostgreSQL + image backup, tamper rejection, isolated restore, image checksum, ephemeral-record exclusion');
 }finally{
  spawnSync('docker',['exec',env.PG_DOCKER_CONTAINER,'dropdb','-U','drinks','--if-exists',db],{stdio:'ignore'});
  await fs.rm(root,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
