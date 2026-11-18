const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = process.env.DATA_DIR || __dirname, FILE = path.join(DIR, 'data.json');
const DEFAULT_PIN = '7236', DEFAULT_PASSWORD = '11OctKofeelyCoffee';
const rnd = n => crypto.randomBytes(n).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const makeAdmin = pw => { const salt = rnd(8); return { salt, hash: hash(pw, salt) }; };

let db; try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = null; }
if (!db) db = { pin: DEFAULT_PIN, spins: [], offers: [
  ['5% OFF', 25], ['10% OFF', 20], ['15% OFF', 15], ['20% OFF', 10], ['Free Topping', 10],
  ['Rs 10 OFF', 8], ['Rs 20 OFF', 5], ['50% OFF', 3], ['Free Upgrade', 2], ['Better luck next time', 2]
].map(([label, weight]) => ({ label, weight })) };
if (!db.admin) { db.admin = makeAdmin(DEFAULT_PASSWORD); if (db.spins.length === 0) db.pin = DEFAULT_PIN; }
if (!db.secret) db.secret = rnd(32);
const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
save();

// Stateless signed admin sessions (12 h) - they survive server restarts.
const sign = exp => `${exp}.${crypto.createHmac('sha256', db.secret).update(String(exp)).digest('hex')}`;
const newToken = () => sign(Date.now() + 12 * 3600 * 1000);
const validToken = t => {
  const [exp, sig] = String(t).split('.');
  if (!sig || !(Number(exp) > Date.now())) return false;
  const ok = sign(exp).split('.')[1];
  return sig.length === ok.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok));
};
const passwordOk = pw => crypto.timingSafeEqual(Buffer.from(hash(String(pw), db.admin.salt)), Buffer.from(db.admin.hash));
const fails = new Map();
const blocked = ip => { const f = fails.get(ip); return f && f.n >= 10 && Date.now() - f.t < 900000; };
const fail = ip => { const f = fails.get(ip); fails.set(ip, { n: (f && Date.now() - f.t < 900000 ? f.n : 0) + 1, t: Date.now() }); };

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const getCookie = (req, name) => ((req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]*)')) || [])[1];
function deviceId(req, res) {
  let id = getCookie(req, 'did');
  if (!id) { id = rnd(12); res.setHeader('Set-Cookie', `did=${id}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`); }
  return id;
}
// Offers are only ever sent to a customer AFTER their spin is done.
const view = s => ({ index: s.index, label: s.label, code: s.code, offers: db.offers.map(o => o.label) });
const needAdmin = (req, res, next) => validToken((req.headers.authorization || '').slice(7)) ? next() : res.status(401).json({ error: 'Please log in first' });
const pinOk = (req, res) => { if (String(req.body.pin || '').trim() === db.pin) return true; res.status(403).json({ ok: false, error: 'Wrong PIN' }); return false; };

app.post('/api/check', (req, res) => {
  const id = deviceId(req, res); if (!pinOk(req, res)) return;
  const prior = db.spins.find(s => s.device === id);
  res.json({ ok: true, result: prior ? view(prior) : null });
});
app.post('/api/spin', (req, res) => {
  const id = deviceId(req, res); if (!pinOk(req, res)) return;
  const prior = db.spins.find(s => s.device === id);
  if (prior) return res.status(409).json({ ok: false, error: 'You have already spun', result: view(prior) });
  let r = Math.floor(Math.random() * 100), index = 0; // weights sum to 100
  while (index < db.offers.length - 1 && r >= db.offers[index].weight) { r -= db.offers[index].weight; index++; }
  const spin = { device: id, index, label: db.offers[index].label, code: rnd(3).toUpperCase(), at: Date.now() };
  db.spins.push(spin); save();
  res.json({ ok: true, result: view(spin) });
});

app.post('/api/admin/login', (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  if (!passwordOk(String(req.body.password || '').trim())) { fail(req.ip); return res.status(401).json({ error: 'Wrong password' }); }
  fails.delete(req.ip); res.json({ token: newToken() });
});
app.get('/api/admin/data', needAdmin, (req, res) => res.json({
  pin: db.pin, offers: db.offers, total: db.spins.length,
  recent: db.spins.slice(-15).reverse().map(({ label, code, at }) => ({ label, code, at }))
}));
app.put('/api/admin/data', needAdmin, (req, res) => {
  const { pin, offers } = req.body, p = String(pin || '').trim();
  if (p.length < 3 || p.length > 12) return res.status(400).json({ error: 'PIN must be 3 to 12 characters' });
  if (!Array.isArray(offers) || offers.length !== 10) return res.status(400).json({ error: 'Exactly 10 offers are required' });
  const clean = offers.map(o => ({ label: String(o.label || '').trim().slice(0, 40), weight: Number(o.weight) }));
  if (clean.some(o => !o.label || !Number.isInteger(o.weight) || o.weight < 0)) return res.status(400).json({ error: 'Every offer needs a name and a whole number of 0 or more' });
  const sum = clean.reduce((a, o) => a + o.weight, 0);
  if (sum !== 100) return res.status(400).json({ error: `Odds must add up to 100 (currently ${sum})` });
  db.pin = p; db.offers = clean; save(); res.json({ ok: true });
});
app.post('/api/admin/password', needAdmin, (req, res) => {
  const cur = String(req.body.current || '').trim(), next = String(req.body.next || '').trim();
  if (!passwordOk(cur)) return res.status(403).json({ error: 'Current password is incorrect' });
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  db.admin = makeAdmin(next); db.secret = rnd(32); save(); // new secret signs out all other sessions
  res.json({ ok: true, token: newToken() });
});
app.post('/api/admin/reset', needAdmin, (req, res) => { db.spins = []; save(); res.json({ ok: true }); });

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Kofeely Discount Wheel running on port ' + port));
