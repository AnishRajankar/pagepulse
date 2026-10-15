const dns = require('node:dns').promises;
const net = require('node:net');
function isPublicIP(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99))) || (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
  }
  // Only globally routable unicast IPv6. Reject mapped IPv4 and special-use prefixes.
  if (net.isIP(ip) === 6) return /^[23]/i.test(ip) && !/^2001:(db8|0:|10:|20:)/i.test(ip) && !/^2002:/i.test(ip);
  return false;
}
function canonicalURL(raw) {
  let u; try { u = new URL(raw); } catch { throw new Error('Enter a valid public HTTP or HTTPS URL.'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw new Error('Only public HTTP/HTTPS URLs on standard ports, without credentials, are allowed.');
  u.hash = ''; return u.href;
}
async function assertPublic(raw) {
  const url = canonicalURL(raw); const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private network addresses are not allowed.');
  const addresses = net.isIP(host) ? [{address: host}] : await dns.lookup(host, {all:true});
  if (!addresses.length || addresses.some(a => !isPublicIP(a.address))) throw new Error('Private or reserved network addresses are not allowed.');
  return url;
}
module.exports = { isPublicIP, canonicalURL, assertPublic };
