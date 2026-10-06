const { isIP } = require('node:net');
function scanContext(req) {
  let peerIp = String(req.socket?.remoteAddress || '');
  if (peerIp.startsWith('::ffff:') && isIP(peerIp.slice(7)) === 4) peerIp = peerIp.slice(7);
  return {
    peerIp: isIP(peerIp) ? peerIp : null,
    ipSource: 'socket.remoteAddress',
    authenticatedUser: { code: req.monitorUser.code, name: req.monitorUser.name || '' },
  };
}
module.exports = { scanContext };
