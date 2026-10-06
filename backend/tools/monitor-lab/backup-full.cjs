const path=require('node:path');
const {createBundle,verifyBundle,restoreBundle}=require('./recovery.cjs');
const {DatabaseSync}=require('node:sqlite');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const lab=path.join(root,'tmp/monitor-calendar-lab-v4');
const result=createBundle(lab,root);verifyBundle(result.bundle);
console.log('Vollständige Sicherung geprüft: '+result.bundle+' ('+result.files+' Dateien)');
if(process.argv.includes('--verify-restore')){
  const target=path.join(lab,'restore-checks',randomUUID());restoreBundle(result.bundle,target);
  const db=new DatabaseSync(path.join(target,'history.sqlite'),{readOnly:true});
  const activity=new DatabaseSync(path.join(target,'activity.sqlite'),{readOnly:true});
  try{console.log(JSON.stringify({restoredTo:target,events:db.prepare('SELECT count(*) AS n FROM events').get().n,
    sessions:activity.prepare('SELECT count(*) AS n FROM sessions').get().n,serverStarted:false}));}
  finally{db.close();activity.close();}
}
