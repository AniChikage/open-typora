import json,sys,unicodedata
from pathlib import Path
from pypdf import PdfReader
root=Path(sys.argv[1]);results=[]
for name in ['controlled-pagination.pdf','css-pagination.pdf']:
 reader=PdfReader(root/name);texts=[unicodedata.normalize('NFKC',page.extract_text()) for page in reader.pages]
 assert len(texts)==3,(name,texts)
 for page in reader.pages:assert abs(float(page.mediabox.width)-612)<1 and abs(float(page.mediabox.height)-792)<1
 assert 'Theme fixture' in texts[0] and 'Second chapter' in texts[1] and 'KEEP-A' in texts[1] and 'KEEP-B' in texts[2],(name,texts)
 results.append({'file':name,'pages':len(texts),'letter':True,'textOnExpectedPages':True})
reader=PdfReader(root/'table-pagination.pdf');texts=[page.extract_text() for page in reader.pages];joined='\n'.join(texts)
assert len(texts)>=3
assert 'Row-000' in texts[0],'A long table must use the first page below its title'
for number in range(200):assert joined.count(f'Row-{number:03}')==1,(number,joined.count(f'Row-{number:03}'))
for text in texts:
 if 'Row-' in text:assert 'Header-Key' in text and 'Header-Value' in text,text[:150]
results.append({'file':'table-pagination.pdf','pages':len(texts),'allRowsExactlyOnce':True,'headersOnEveryTablePage':True,'startsOnFirstPage':True})
(root/'pdf-verification.json').write_text(json.dumps(results,indent=2))
print('PASS: actual Letter PDFs honor explicit/chapter/custom-CSS page breaks; long table repeats headers and preserves every row once.')
