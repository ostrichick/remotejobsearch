export async function readResume(file:File):Promise<string>{
 if(file.size>5_000_000)throw new Error('5MB 이하 파일을 선택하세요.');
 const bytes=await file.arrayBuffer();
 if(/\.pdf$/i.test(file.name)){
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:bytes});
  const doc=await task.promise;
  try{
   if(doc.numPages>20)throw new Error('20페이지 이하 이력서를 사용하세요.');
   let text='';for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n),content=await page.getTextContent();text+=content.items.map(i=>'str' in i?i.str+('hasEOL' in i&&i.hasEOL?'\n':' '):'').join('')+'\n';}
   if(text.trim().length<40)throw new Error('스캔 PDF에서 텍스트를 읽지 못했습니다. OCR 처리 후 업로드하거나 텍스트를 붙여넣으세요.');return text;
  }finally{await task.destroy();}
 }
 if(/\.docx$/i.test(file.name)){
  const mammoth=await import('mammoth/mammoth.browser');return (await mammoth.extractRawText({arrayBuffer:bytes})).value;
 }
 throw new Error('PDF 또는 DOCX 형식만 지원합니다.');
}
