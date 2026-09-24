const assert = require('node:assert/strict');
const { publicEncrypt, constants, randomUUID, randomBytes } = require('node:crypto');
const sharp = require('sharp');
const base = 'http://127.0.0.1:3007/api/v1';
async function call(path, {method='GET', token, data, expected=200, account}={}) {
 const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(account?{'X-Record-Account':account}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 const body=await response.json();
 assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(body).slice(0,300)}`);
 return body.data;
}
async function login(email) {
 const c=await call('/auth/challenge');
 const ciphertext=publicEncrypt({key:c.publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(JSON.stringify({email,password:'LocalSync123!',nonce:c.nonce}))).toString('base64');
 return call('/auth/login',{method:'POST',data:{challengeId:c.challengeId,ciphertext},expected:201});
}
async function main() {
 const [admin,user]=await Promise.all([login('local-admin@example.test'),login('local-user@example.test')]);
 const a={token:admin.accessToken},u={token:user.accessToken};
 const profile=await call('/users/me',u);
 const me=await call('/auth/me',a);
 assert.ok(me.permissions.some(p=>(typeof p==='string'?p:p.code)==='records.manage'));
 await call('/admin/drink-records',{...u,expected:403});
 const menu=await call('/cocktails?limit=5');
 assert.ok(menu.length>0,'Local public recipes must be seeded');
 const photo=(await sharp(randomBytes(600*600*3),{raw:{width:600,height:600,channels:3}}).jpeg().toBuffer()).toString('base64');
 assert.ok(photo.length>100*1024,'Exercise the record-specific larger body parser');
 const id=randomUUID();
 const record={id,name:'本地联调记录',occurredAt:new Date().toISOString(),scene:'home',verdict:'liked',note:'API 验收',reference:menu[0],actualRecipe:[{n:'Gin',ml:30},{n:'苦精',t:'2 dash'}],photoBase64:photo};
 await call('/users/me/drink-records',{...u,method:'POST',data:record,expected:201,account:profile.id});
 await call('/users/me/drink-records',{...u,method:'POST',data:record,expected:201});
 const list=await call(`/admin/drink-records?ownerId=${profile.id}&search=本地联调`,a);
 assert.ok(list.items.some(r=>r.id===id));
 await call(`/admin/drink-records/${profile.id}/${id}`,{...a,method:'PATCH',data:{...record,ownerId:profile.id,note:'后台更新'}});
 assert.equal((await call(`/users/me/drink-records/${id}`,u)).note,'后台更新');
 await call(`/users/me/drink-records/import`,{...u,method:'POST',data:record,expected:201});
 assert.equal((await call(`/users/me/drink-records/${id}`,u)).note,'后台更新');
 await call(`/admin/drink-records/${profile.id}/${id}`,{...a,method:'DELETE'});
 await call('/users/me/drink-records/import',{...u,method:'POST',data:record,expected:201});
 await call(`/users/me/drink-records/${id}`,{...u,expected:404});
 const flavor={id:`qa-${randomUUID()}`,zh:'本地测试风味',en:'Local test',zhSubtitle:'本地',enSubtitle:'Local',keywords:['gin'],icon:'fresh',color:'#64D2FF',primaryWeight:20,secondaryWeight:5,isActive:true,sortOrder:200};
 await call('/admin/flavor-directions',{...a,method:'POST',data:flavor,expected:201});
 assert.ok((await call('/flavor-directions')).some(f=>f.id===flavor.id&&f.primaryWeight===20));
 await call(`/admin/flavor-directions/${flavor.id}`,{...a,method:'PATCH',data:{...flavor,isActive:false}});
 assert.ok(!(await call('/flavor-directions')).some(f=>f.id===flavor.id));
 await call(`/admin/flavor-directions/${flavor.id}`,{...a,method:'DELETE'});
 const proxied=await fetch('http://127.0.0.1:5178/api/v1/flavor-directions');
 assert.equal(proxied.status,200);assert.equal((await proxied.json()).data.length,5);
 await call('/auth/logout',{...u,method:'POST',data:{refreshToken:user.refreshToken},expected:201});
 await call('/auth/logout',{...a,method:'POST',data:{refreshToken:admin.refreshToken},expected:201});
 console.log('PASS: real RSA login, RBAC, public recipes, photo request >100KB, account record CRUD, admin edits visible to app, import protection, flavor configuration CRUD, admin dev proxy.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
