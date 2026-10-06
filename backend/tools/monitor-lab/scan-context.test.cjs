const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {History}=require('./history.cjs');
const {scanContext}=require('./scan-context.cjs');
test('Socket-IP und verifizierte Kennung statt manipulierbarer Weiterleitungsheader',()=>{
  const context=scanContext({socket:{remoteAddress:'::ffff:192.168.1.42'},monitorUser:{code:'PM',name:'Pit'},
    ip:'203.0.113.1',headers:{'x-forwarded-for':'203.0.113.1'},body:{actor:'FAKE',ip:'203.0.113.2'}});
  assert.deepEqual(context,{peerIp:'192.168.1.42',ipSource:'socket.remoteAddress',authenticatedUser:{code:'PM',name:'Pit'}});
});
test('IPv6 bleibt erhalten, fehlende IP wird nicht erfunden',()=>{
  assert.equal(scanContext({socket:{remoteAddress:'::1'},monitorUser:{code:'LAB'}}).peerIp,'::1');
  assert.equal(scanContext({monitorUser:{code:'LAB'}}).peerIp,null);
});
test('Wiederholter Scan nach IP-Wechsel bleibt einmalig und erhält ursprünglichen Nachweis',()=>{
  const file=path.resolve(__dirname,'../../tmp/monitor-calendar-lab-v4/test-runs',randomUUID(),'history.sqlite');
  const h=new History(file);
  try{
    const revision=h.append({orderId:'TEST',type:'requirements',actor:'LAB',payload:{previousRevision:null,parts:[{id:'p',label:'Teil',source:'production',required:1}]}}).id;
    const event={id:randomUUID(),orderId:'TEST',type:'scan',actor:'LAB',payload:{revision,partId:'p',action:'done',station:'TEST'}};
    h.append({...event,context:{peerIp:'192.168.1.42'}});
    assert.equal(h.append({...event,context:{peerIp:'192.168.1.43'}}).duplicate,true);
    assert.equal(h.state('TEST').scans.length,1);assert.equal(h.state('TEST').scans[0].context.peerIp,'192.168.1.42');
    assert.throws(()=>h.append({...event,actor:'OTHER',context:{peerIp:'192.168.1.42'}}),/anders verwendet/);
    assert.deepEqual(h.events('TEST')[0].context,{});
  }finally{h.close();}
});
