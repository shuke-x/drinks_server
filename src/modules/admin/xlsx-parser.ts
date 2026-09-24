import { BadRequestException } from '@nestjs/common';
import { Worker } from 'worker_threads';

/** Parse untrusted ZIP/XML in a bounded worker; the API event loop never parses it. */
export function readSpreadsheet(payload:Buffer):Promise<Record<string,unknown>[]> {
 return new Promise((resolve,reject)=>{
  const worker=new Worker(`
   const {parentPort,workerData}=require('worker_threads');
   const ExcelJS=require(workerData.modulePath);
   const JSZip=require(workerData.zipModulePath);
   (async()=>{
    // Some Excel-compatible writers prefix the SpreadsheetML namespace (x:).
    // ExcelJS expects the standard unprefixed form, so normalize XML entries first.
    const zip=await JSZip.loadAsync(Buffer.from(workerData.payload));
    for(const name of Object.keys(zip.files)) {
     if(!name.endsWith('.xml') || zip.files[name].dir) continue;
     const xml=await zip.files[name].async('string');
     if(xml.includes('<x:') || xml.includes('<tableParts')) {
      const normalized=xml.replace(/(<\\/?)(?:x:)/g,'$1').replace(/\\s+xmlns:x=/g,' xmlns=')
       .replace(/<tableParts[\\s\\S]*?<\\/tableParts>/g,'').replace(/<tableParts[^>]*\\/>/g,'');
      zip.file(name,normalized);
     }
    }
    const normalizedPayload=await zip.generateAsync({type:'nodebuffer'});
    const book=new ExcelJS.Workbook();
    await book.xlsx.load(normalizedPayload);
    const sheet=book.worksheets[0];
    if(!sheet || sheet.rowCount>5001 || sheet.columnCount>64) throw Error('Invalid worksheet dimensions');
    const headers=[];
    sheet.getRow(1).eachCell((cell,col)=>{
     const key=cell.text.trim();
     if(!key || key.length>100 || ['__proto__','prototype','constructor'].includes(key) || headers.includes(key)) throw Error('Invalid header');
     headers[col]=key;
    });
    const rows=[];
    for(let index=2;index<=sheet.rowCount;index++) {
     const row=sheet.getRow(index);if(!row.hasValues) continue;
     const result={};
     for(let col=1;col<headers.length;col++) {
      if(!headers[col]) continue;
      const cell=row.getCell(col);
      if(cell.type===ExcelJS.ValueType.Formula) throw Error('Formula cells are not supported');
      const text=cell.text;if(text.length>100000) throw Error('Cell too large');
      result[headers[col]]=text;
     }
     rows.push(result);
    }
    parentPort.postMessage(rows);
   })().catch(error=>{process.exitCode=1;parentPort.postMessage({error: error instanceof Error ? error.message : String(error)});});
  `,{eval:true,workerData:{payload,modulePath:require.resolve('exceljs'),zipModulePath:require.resolve('jszip',{paths:[require.resolve('exceljs')]} )},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32}});
  let settled=false;
  const finish=(error?:Error,rows?:Record<string,unknown>[])=>{
   if(settled) return;settled=true;clearTimeout(timer);void worker.terminate();
   if(error) reject(new BadRequestException(error.message));else resolve(rows!);
  };
  const timer=setTimeout(()=>finish(new Error('Spreadsheet parsing timed out')),10000);
  worker.once('message',value=>Array.isArray(value)?finish(undefined,value):finish(new Error(typeof value?.error==='string'?value.error:'Invalid spreadsheet')));
  worker.once('error',()=>finish(new Error('Spreadsheet exceeds limits or is invalid')));
  worker.once('exit',()=>{if(!settled) finish(new Error('Spreadsheet parsing failed'));});
 });
}
