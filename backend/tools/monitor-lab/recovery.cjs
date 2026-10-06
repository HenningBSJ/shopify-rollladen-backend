const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function regular(file){if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('Keine reguläre Datei: '+file);}
function checkDb(file){const db=new DatabaseSync(file,{readOnly:true});try{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Datenbanksicherung beschädigt');
}finally{db.close();}}
function safeRelative(name){
  if(typeof name!=='string'||!name||name.includes('\\')||name.includes(':')||name.split('/').some(s=>!s||s==='.'||s==='..')||path.isAbsolute(name))throw Error('Unsicherer Sicherungspfad');
  const allowed=['history.sqlite','activity.sqlite','calendar-catalog.json','slack-snapshot.json','access.json','baseline.json','package.json','package-lock.json'];
  if(!name.startsWith('app/')&&!name.startsWith('tools/monitor-lab/')&&!allowed.includes(name))throw Error('Unbekannter Sicherungspfad');
  return name;
}
function safeFile(root,name){
  safeRelative(name);let current=root;
  for(const part of name.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Verknüpfung im Sicherungspfad');}
  return current;
}
function createBundle(lab,repository){
  const base=path.join(lab,'backups');fs.mkdirSync(base,{recursive:true});
  const bundle=path.join(base,'full-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID());
  fs.mkdirSync(bundle);
  const entries=[];
  function remember(name){const file=safeFile(bundle,name);regular(file);entries.push({path:name,bytes:fs.statSync(file).size,sha256:hash(file)});}
  function copy(file,name){regular(file);const before=hash(file);const dest=safeFile(bundle,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);
    if(hash(file)!==before||hash(dest)!==before)throw Error('Datei wurde während der Sicherung verändert: '+name);remember(name);}
  function tree(source,prefix){
    if(fs.lstatSync(source).isSymbolicLink())throw Error('Quellverknüpfung nicht erlaubt');
    for(const e of fs.readdirSync(source,{withFileTypes:true})){const file=path.join(source,e.name);const name=prefix+'/'+e.name;
      if(e.isSymbolicLink())throw Error('Quellverknüpfung nicht erlaubt');
      if(e.isDirectory())tree(file,name);else copy(file,name);
    }
  }
  const startedAt=new Date().toISOString();
  for(const name of ['history.sqlite','activity.sqlite']){
    const source=path.join(lab,name);regular(source);const db=new DatabaseSync(source,{readOnly:true});
    const dest=path.join(bundle,name);
    try{db.exec('PRAGMA busy_timeout=1500');db.exec("VACUUM INTO '"+dest.replace(/'/g,"''")+"'");}finally{db.close();}
    checkDb(dest);remember(name);
  }
  for(const name of ['calendar-catalog.json','slack-snapshot.json','access.json','baseline.json'])copy(path.join(lab,name),name);
  for(const name of ['package.json','package-lock.json'])copy(path.join(repository,name),name);
  tree(path.join(lab,'app'),'app');tree(path.join(repository,'tools/monitor-lab'),'tools/monitor-lab');
  const manifest={version:1,startedAt,finishedAt:new Date().toISOString(),
    scope:'Monitor-Testbestand, ohne node_modules, ältere Backups und Testläufe',
    consistency:'SQLite jeweils transaktional; voneinander unabhängige Datenbanken zu separaten Zeitpunkten. Dateien einzeln auf Änderungen geprüft.',entries};
  const text=JSON.stringify(manifest,null,2);const fd=fs.openSync(path.join(bundle,'manifest.json'),'wx');
  try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  return {bundle,files:entries.length};
}
function verifyBundle(bundle){
  if(fs.lstatSync(bundle).isSymbolicLink())throw Error('Sicherungsordner ist eine Verknüpfung');
  const manifestFile=path.join(bundle,'manifest.json');regular(manifestFile);
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.entries))throw Error('Unbekanntes Sicherungsformat');
  const seen=new Set();
  for(const entry of manifest.entries){
    const file=safeFile(bundle,entry.path);const key=entry.path.toLowerCase();
    if(seen.has(key))throw Error('Doppelter Sicherungspfad');seen.add(key);regular(file);
    if(fs.statSync(file).size!==entry.bytes||hash(file)!==entry.sha256)throw Error('Prüfsumme stimmt nicht: '+entry.path);
  }
  for(const file of ['history.sqlite','activity.sqlite','calendar-catalog.json','slack-snapshot.json','access.json','app/src/index.js','package.json','package-lock.json']){
    if(!seen.has(file))throw Error('Unvollständige Sicherung: '+file);
  }
  checkDb(path.join(bundle,'history.sqlite'));checkDb(path.join(bundle,'activity.sqlite'));
  return manifest;
}
function restoreBundle(bundle,destination){
  const manifest=verifyBundle(bundle);
  if(fs.existsSync(destination))throw Error('Wiederherstellungsziel existiert bereits; kein Überschreiben');
  fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'.gitignore'),'*\n!.gitignore\n');
  for(const entry of manifest.entries){const dest=safeFile(destination,entry.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(safeFile(bundle,entry.path),dest);
    if(hash(dest)!==entry.sha256)throw Error('Wiederherstellung beschädigt: '+entry.path);
  }
  fs.copyFileSync(path.join(bundle,'manifest.json'),path.join(destination,'manifest.json'));
  verifyBundle(destination);
  return {destination,files:manifest.entries.length};
}
module.exports={createBundle,verifyBundle,restoreBundle};
