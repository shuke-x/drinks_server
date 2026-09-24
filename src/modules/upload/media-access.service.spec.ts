import { ConfigService } from '@nestjs/config';
import { MediaAccessService } from './media-access.service';

describe('private image authorization',()=>{
 const url='https://dash.shuke.me/static/abcdefghijklmnop.webp';
 const key='abcdefghijklmnop.webp';
 const db={query:jest.fn()};
 const config={get:(name:string,fallback:string)=>name==='PUBLIC_BASE_URL'?'https://dash.shuke.me':fallback,getOrThrow:()=> 'test-secret'} as unknown as ConfigService;
 const access=new MediaAccessService(db as never,config);
 beforeEach(()=>jest.resetAllMocks());
 it('denies anonymous private images even when the filename is known',async()=>{
  db.query.mockResolvedValue([]);await expect(access.assertReadable(key,undefined)).rejects.toThrow('Image not found');
 });
 it('allows published references without granting unrelated image access',async()=>{
  db.query.mockResolvedValueOnce([{}]);await expect(access.assertReadable(key,undefined)).resolves.toBeUndefined();
 });
 it('binds temporary grants to image and identity and rechecks ownership',async()=>{
  const token=new URL(access.sign(url,'owner')).searchParams.get('access');
  db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
  await expect(access.assertReadable(key,token)).resolves.toBeUndefined();
  db.query.mockResolvedValue([]);
  await expect(access.assertReadable('other.webp',token)).rejects.toThrow('Image not found');
  await expect(access.assertReadable(key,`${token}bad`)).rejects.toThrow('Image not found');
 });
 it('expires grants and prevents private uploads being reassigned by another user',async()=>{
  const token=new URL(access.sign(url,'owner')).searchParams.get('access');
  const time=jest.spyOn(Date,'now').mockReturnValue(Date.now()+301000);
  db.query.mockResolvedValue([]);
  try{await expect(access.assertReadable(key,token)).rejects.toThrow('Image not found');}finally{time.mockRestore();}
  await expect(access.assertOwned([url],'other')).rejects.toThrow('another account');
  await expect(access.assertOwned(['https://external.test/image.jpg'],'owner')).rejects.toThrow('uploaded');
 });
 it('does not sign external URLs and strips only managed grants before persistence',()=>{
  expect(access.sign('https://external.test/photo.jpg','owner')).toBe('https://external.test/photo.jpg');
  expect(access.map({images:[access.sign(url,'owner')],note:'private note'},undefined,true)).toEqual({images:[url],note:'private note'});
 });
});
