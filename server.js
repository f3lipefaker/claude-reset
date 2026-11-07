// Reset Radar API: guarda as contas e envia push na hora certa, mesmo com o app fechado.
const http = require("http"), fs = require("fs"), webpush = require("web-push");
const DIR = process.env.DATA_DIR || "/data", FILE = DIR + "/db.json";
const TOKEN = process.env.TOKEN, PORT = process.env.PORT || 3000;
if (!TOKEN) { console.error("Defina a variável TOKEN."); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

let db = { vapid: null, subs: [], state: null, sent: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch (e) {}
if (!db.vapid) db.vapid = webpush.generateVAPIDKeys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", db.vapid.publicKey, db.vapid.privateKey);
const save = () => fs.writeFileSync(FILE, JSON.stringify(db));
save();

async function send(payload) {
  const dead = [];
  await Promise.all(db.subs.map(async s => {
    try { await webpush.sendNotification(s, JSON.stringify(payload)); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); }
  }));
  if (dead.length) { db.subs = db.subs.filter(s => !dead.includes(s.endpoint)); save(); }
}

setInterval(() => {
  const st = db.state; if (!st) return;
  const now = Date.now(), dur = (st.hours || 5) * 36e5, lead = (st.lead || 0) * 6e4; let ch = false;
  for (const a of st.accounts || []) {
    if (!a.startedAt) continue;
    const left = a.startedAt + dur - now, k = a.id + ":" + a.startedAt, nm = a.name || a.email;
    if (left <= 0 && !db.sent[k + ":r"]) { db.sent[k + ":r"] = 1; ch = true; send({ title: "Conta pronta", body: nm + " já pode receber novas mensagens.", tag: "reset-" + a.id }); }
    else if (lead && left > 0 && left <= lead && !db.sent[k + ":p"]) { db.sent[k + ":p"] = 1; ch = true; send({ title: "Quase pronta", body: nm + " libera em " + Math.ceil(left / 6e4) + " min.", tag: "pre-" + a.id }); }
  }
  for (const k of Object.keys(db.sent)) if (now - Number(k.split(":")[1]) > 2 * 864e5) { delete db.sent[k]; ch = true; }
  if (ch) save();
}, 20000);

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-token", "access-control-allow-methods": "GET,PUT,POST,OPTIONS" };
http.createServer((req, res) => {
  const out = (c, o) => { res.writeHead(c, { "content-type": "application/json", ...cors }); res.end(c === 204 ? "" : JSON.stringify(o)); };
  if (req.method === "OPTIONS") return out(204);
  const p = req.url.split("?")[0];
  if (p === "/api/vapid") return out(200, { key: db.vapid.publicKey });
  if (req.headers["x-token"] !== TOKEN) return out(401, { error: "token" });
  if (p === "/api/state" && req.method === "GET") return out(200, { state: db.state });
  let body = ""; req.on("data", c => { body += c; if (body.length > 5e6) req.destroy(); });
  req.on("end", () => {
    let j = {}; try { j = JSON.parse(body || "{}"); } catch (e) { return out(400, {}); }
    if (p === "/api/state" && req.method === "PUT") {
      if (j.state && (!db.state || (j.state.updatedAt || 0) >= (db.state.updatedAt || 0))) { db.state = j.state; save(); }
      return out(200, { ok: 1 });
    }
    if (p === "/api/subscribe" && req.method === "POST") {
      if (j.sub && j.sub.endpoint) { db.subs = db.subs.filter(s => s.endpoint !== j.sub.endpoint); db.subs.push(j.sub); save(); }
      return out(200, { ok: 1 });
    }
    if (p === "/api/test" && req.method === "POST") { send({ title: "Teste", body: "Push funcionando.", tag: "test" }); return out(200, { ok: 1 }); }
    out(404, {});
  });
}).listen(PORT, () => console.log("Reset Radar API na porta " + PORT));
