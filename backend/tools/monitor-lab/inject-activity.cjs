module.exports=(req,res,next)=>{
  const page = /^\/(?:lab|display|intake)(?:\/|$)/.test(req.path)
    && !req.path.startsWith('/lab/api/') && req.path!=='/lab/activity';
  if(page){
    const send=res.send;
    res.send=function(body){
      if(typeof body==='string' && /<body\b/i.test(body) && /<\/body>/i.test(body)) {
        body=body.replace(/<body([^>]*)>/i,'<body$1><script src="/lab/activity-client.js" defer></script>');
      }
      return send.call(this,body);
    };
  }
  next();
};
