// index.js — Cep Doktorum WhatsApp Danışmanlık Akışı (TR)
// Node 20+, "type": "module" (package.json)

import express from "express";
import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

// ====== ENV ======
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;          // Meta WhatsApp token
const PHONE_ID     = process.env.PHONE_NUMBER_ID;       // "123456789012345"
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;          // webhook verify secret
const DATABASE_URL = process.env.DATABASE_URL || "";    // Render Postgres URL
const ADMIN_KEY    = process.env.ADMIN_KEY || "changeme-admin";

// ====== DB ======
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_sessions (
      id UUID PRIMARY KEY,
      wa_id TEXT NOT NULL,
      lang TEXT NOT NULL,
      state TEXT NOT NULL,          -- main|ortho_sub|aesthetic_sub|complaint|uploads|final
      main TEXT,                    -- Ortopedi|Dermatoloji|Medikal Estetik|Laboratuvar Testleri
      sub TEXT,                     -- alt kategori (varsa)
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_answers (
      id UUID PRIMARY KEY,
      session_id UUID REFERENCES wa_sessions(id) ON DELETE CASCADE,
      q_key TEXT NOT NULL,
      q_text TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wa_media (
      id UUID PRIMARY KEY,
      session_id UUID REFERENCES wa_sessions(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL,
      mime TEXT,
      caption TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_answers_session ON wa_answers(session_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wa_media_session ON wa_media(session_id);`);
  console.log("DB ready");
}

// ====== Constant texts ======
const WELCOME_1 =
  "Cep Doktorum'a hoşgeldiniz. Bu hizmet sayesinde belirli alanlarda yapay zeka destekli sağlık hizmeti alacaksınız. Konuşmaya devam ederek Gizlilik Politikamızı okuduğunuzu ve anladığınızı onaylamış olursunuz. Detaylı bilgiler için sitemizi ziyaret edebilirsiniz.";
const WELCOME_2 =
  "Merhaba! Hangi alanda desteğe ihtiyacınız var? Ortopedi ve Travmatoloji, Dermatoloji, Medikal Estetik ve Laboratuvar Testleri seçeneklerinden biri ile ilerleyebilirsiniz.";

const MAIN_CHOICES = [
  { id: "main_ortho",  title: "Ortopedi ve Travmatoloji" },
  { id: "main_derm",   title: "Dermatoloji" },
  { id: "main_aesth",  title: "Medikal Estetik" },
  { id: "main_lab",    title: "Laboratuvar Testleri" }
];

const ORTHO_SUBS = [
  "Ayak ve Ayak Bileği", "Dirsek", "Diz", "Kalça Bölgesi",
  "Kırık İyileşmesi ve Ameliyat Sonrası Dönemi",
  "El ve El Bileği", "Omuz", "Omurga ve Skolyoz Açıları", "Diğer"
];

const AESTH_SUBS = [
  "Alın", "Burun", "Altın Oran ve Genel Yüz Analizi",
  "Çene ve Çene Ucu", "Dudak ve Dudak Çevresi", "Elmacık ve Orta Yüz"
];

const Q_COMPLAINT = "Lütfen şikayetinizi kısaca yazar mısınız?";
const Q_UPLOADS   = "Şikayetinizle ilgili yorumlamamızı istediğiniz tetkik/görselleri/dosyaları gönderin (X-ray, MR, fotoğraf, PDF vb.). Gönderiminiz bittiğinde 'Tamam' yazınız.";
const THANKS_FINAL= "Teşekkürler, geçmiş olsun. Onay sürecimizi bekleyiniz; değerlendirme hazır olduğunda bilgilendireceğiz.";

// ====== Utils ======
function detectLang(text) {
  return /[çğıöşüÇĞİÖŞÜ]/.test(text) ? "tr" : "en";
}
function normalize(s){ return (s||"").toLowerCase("tr-TR"); }
function mapMainByText(t) {
  const x = normalize(t);
  if (x.includes("ortopedi")) return "Ortopedi ve Travmatoloji";
  if (x.includes("dermat")) return "Dermatoloji";
  if (x.includes("estetik")) return "Medikal Estetik";
  if (x.includes("laboratuvar") || x.includes("lab")) return "Laboratuvar Testleri";
  return null;
}

// ====== Express ======
const app = express();
app.use(express.json());

// Health
app.get("/", (_req, res) => res.status(200).send("OK"));

// Verify (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified.");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Admin: Report JSON / CSV
app.get("/admin/report", async (req, res) => {
  try {
    if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
    const sessionId = req.query.session;
    if (!sessionId) return res.status(400).json({ error: "missing session" });
    const s = await pool.query(`SELECT * FROM wa_sessions WHERE id=$1`, [sessionId]);
    if (!s.rows.length) return res.status(404).json({ error: "not found" });

    const answers = await pool.query(
      `SELECT q_key, q_text, answer, created_at FROM wa_answers WHERE session_id=$1 ORDER BY created_at ASC`,
      [sessionId]
    );
    const media = await pool.query(
      `SELECT media_id, mime, caption, created_at FROM wa_media WHERE session_id=$1 ORDER BY created_at ASC`,
      [sessionId]
    );

    if (req.query.format === "csv") {
      const a = answers.rows.map(r =>
        ["answer", r.q_key, r.q_text.replaceAll('"','""'), r.answer.replaceAll('"','""'), r.created_at.toISOString()]
        .map(v => `"${v}"`).join(",")
      );
      const m = media.rows.map(r =>
        ["media", r.media_id, r.mime||"", (r.caption||"").replaceAll('"','""'), r.created_at.toISOString()]
        .map(v => `"${v}"`).join(",")
      );
      const csv = ["type,key_or_media_id,q_text_or_mime,answer_or_caption,created_at", ...a, ...m].join("\n");
      res.setHeader("Content-Type","text/csv");
      res.setHeader("Content-Disposition",`attachment; filename=report_${sessionId}.csv`);
      return res.status(200).send(csv);
    }

    return res.status(200).json({
      session: s.rows[0],
      answers: answers.rows,
      media: media.rows,
      tip: "Medya içeriğini çekmek için /admin/media?media_id=...&key=... endpointini kullanın."
    });
  } catch (e) {
    console.error("Report error:", e);
    return res.status(500).json({ error: "server" });
  }
});

// Admin: Proxy media download from Graph (secured by ADMIN_KEY)
// Usage: /admin/media?media_id=<id>&key=<ADMIN_KEY>
app.get("/admin/media", async (req, res) => {
  try {
    if (req.query.key !== ADMIN_KEY) return res.status(403).send("forbidden");
    const mediaId = req.query.media_id;
    if (!mediaId) return res.status(400).send("missing media_id");

    // 1) Get media URL & mime
    const meta = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` }
    }).then(r => r.json());
    if (!meta || !meta.url) return res.status(404).send("media not found");

    // 2) Stream the file
    const f = await fetch(meta.url, { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } });
    if (!f.ok) return res.status(500).send("media fetch failed");
    if (meta.mime_type) res.setHeader("Content-Type", meta.mime_type);
    return f.body.pipe(res);
  } catch (e) {
    console.error("Media proxy error:", e);
    return res.status(500).send("server");
  }
});

// Incoming (POST)
app.post("/webhook", async (req, res) => {
  console.log("INBOUND:", JSON.stringify(req.body, null, 2));

  try {
    const change  = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const waId = message.from;
    // Detect lang from any text field
    const anyText = message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || message.caption || "";
    const lang = detectLang(anyText);

    // Load or create session
    let session = await getOrCreateSession(waId, lang);

    // If new session, send two-part welcome + main menu and move to "main"
    if (!session.state) {
      await setState(session.id, "main");
      await sendText(waId, WELCOME_1);
      await sendText(waId, WELCOME_2);
      await sendMainMenu(waId);
      return res.sendStatus(200);
    }

    // Handle interactive buttons first
    if (message.type === "interactive") {
      const btnId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "";
      await handleButton(session, waId, btnId);
      return res.sendStatus(200);
    }

    // Handle media uploads in "uploads" state
    if (session.state === "uploads" && isMedia(message)) {
      await storeMediaMessage(session.id, message);
      // We don't ask anything; user types "Tamam" to finish.
      return res.sendStatus(200);
    }

    // Handle plain text
    const text = message.text?.body || message.caption || "";

    if (session.state === "main") {
      // allow typing the main domain
      const mapped = mapMainByText(text);
      if (mapped) {
        await pool.query(`UPDATE wa_sessions SET main=$1, updated_at=NOW() WHERE id=$2`, [mapped, session.id]);
        session = await loadSession(session.id);
        if (mapped === "Ortopedi ve Travmatoloji") {
          await setState(session.id, "ortho_sub");
          await sendOrthoSubs(waId);
        } else if (mapped === "Medikal Estetik") {
          await setState(session.id, "aesthetic_sub");
          await sendAestheticSubs(waId);
        } else {
          await setState(session.id, "complaint");
          await sendText(waId, Q_COMPLAINT);
        }
        return res.sendStatus(200);
      } else {
        await sendText(waId, "Lütfen aşağıdaki seçeneklerden birini seçin ya da yazın:");
        await sendMainMenu(waId);
        return res.sendStatus(200);
      }
    }

    if (session.state === "ortho_sub") {
      // treat as typed sub
      const ok = ORTHO_SUBS.find(x => normalize(text).includes(normalize(x)));
      if (ok) {
        await pool.query(`UPDATE wa_sessions SET sub=$1, updated_at=NOW() WHERE id=$2`, [ok, session.id]);
        await setState(session.id, "complaint");
        await sendText(waId, Q_COMPLAINT);
        return res.sendStatus(200);
      } else {
        await sendText(waId, "Lütfen bir alt kategori seçiniz:");
        await sendOrthoSubs(waId);
        return res.sendStatus(200);
      }
    }

    if (session.state === "aesthetic_sub") {
      const ok = AESTH_SUBS.find(x => normalize(text).includes(normalize(x)));
      if (ok) {
        await pool.query(`UPDATE wa_sessions SET sub=$1, updated_at=NOW() WHERE id=$2`, [ok, session.id]);
        await setState(session.id, "complaint");
        await sendText(waId, Q_COMPLAINT);
        return res.sendStatus(200);
      } else {
        await sendText(waId, "Lütfen bir alt kategori seçiniz:");
        await sendAestheticSubs(waId);
        return res.sendStatus(200);
      }
    }

    if (session.state === "complaint") {
      if (text.trim().length < 2) {
        await sendText(waId, "Şikayetinizi kısaca yazar mısınız?");
        return res.sendStatus(200);
      }
      await saveAnswer(session.id, "complaint", "Şikayet", text.trim());
      await setState(session.id, "uploads");
      await sendText(waId, Q_UPLOADS);
      return res.sendStatus(200);
    }

    if (session.state === "uploads") {
      if (normalize(text) === "tamam" || normalize(text) === "ok" || normalize(text) === "bitti") {
        await setState(session.id, "final");
        const reportText = await buildSummary(session.id);
        await sendText(waId, `Teşekkürler. Özetiniz:\n\n${reportText}\n\nRapor (JSON): /admin/report?session=${session.id}\nRapor (CSV): /admin/report?session=${session.id}&format=csv`);
        await sendText(waId, THANKS_FINAL);
        return res.sendStatus(200);
      } else {
        // not media + not tamam
        await sendText(waId, "Tetkikleri gönderebilir veya 'Tamam' yazarak bitirebilirsiniz.");
        return res.sendStatus(200);
      }
    }

    // final or unknown -> restart hint
    await sendText(waId, "Yeni bir görüşme başlatmak için 'Merhaba' yazabilirsiniz.");
    return res.sendStatus(200);

  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.sendStatus(200);
  }
});

// ====== State & Storage helpers ======
async function getOrCreateSession(waId, lang) {
  const s = await pool.query(`SELECT * FROM wa_sessions WHERE wa_id=$1 ORDER BY updated_at DESC LIMIT 1`, [waId]);
  if (s.rows.length) return s.rows[0];
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO wa_sessions (id, wa_id, lang, state) VALUES ($1,$2,$3,'')`, [id, waId, lang]);
  return (await loadSession(id));
}
async function loadSession(id) {
  const { rows } = await pool.query(`SELECT * FROM wa_sessions WHERE id=$1`, [id]);
  return rows[0];
}
async function setState(id, state) {
  await pool.query(`UPDATE wa_sessions SET state=$1, updated_at=NOW() WHERE id=$2`, [state, id]);
}
async function saveAnswer(sessionId, qKey, qText, answer) {
  await pool.query(
    `INSERT INTO wa_answers (id, session_id, q_key, q_text, answer) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), sessionId, qKey, qText, answer]
  );
}
async function storeMediaMessage(sessionId, msg) {
  // image / document / video / audio
  let mediaId = null, mime = null, caption = msg.caption || "";
  if (msg.image)   { mediaId = msg.image.id;   mime = msg.image.mime_type || null; }
  if (msg.document){ mediaId = msg.document.id; mime = msg.document.mime_type || null; caption = msg.document.caption || caption; }
  if (msg.video)   { mediaId = msg.video.id;   mime = msg.video.mime_type || null; caption = msg.video.caption || caption; }
  if (msg.audio)   { mediaId = msg.audio.id;   mime = msg.audio.mime_type || null; }

  if (!mediaId) return;
  await pool.query(
    `INSERT INTO wa_media (id, session_id, media_id, mime, caption) VALUES ($1,$2,$3,$4,$5)`,
    [crypto.randomUUID(), sessionId, mediaId, mime, caption || ""]
  );
}

// ====== UI helpers ======
async function sendText(to, body) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const payload = { messaging_product: "whatsapp", to, type: "text", text: { body } };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) console.error("SEND TEXT ERROR:", r.status, await r.text());
}

async function sendButtons(to, bodyText, buttons) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: buttons.map(b => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0,20) } })) }
    }
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) console.error("SEND BUTTONS ERROR:", r.status, await r.text());
}

async function sendMainMenu(to) {
  const groups = chunk(MAIN_CHOICES, 3); // reuse your chunk helper
  for (const g of groups) {
    await sendButtons(to, "Lütfen bir alan seçiniz:", g);
  }
}
async function sendOrthoSubs(to) {
  // 3'lü buton limitine sığmak için sıralı gönderiyoruz
  const groups = chunk(ORTHO_SUBS, 3);
  for (const g of groups) {
    await sendButtons(to, "Ortopedi alt kategorisi seçiniz:", g.map(v => ({ id: "ortho_" + normalize(v).slice(0,18), title: v })));
  }
}
async function sendAestheticSubs(to) {
  const groups = chunk(AESTH_SUBS, 3);
  for (const g of groups) {
    await sendButtons(to, "Medikal Estetik alt kategorisi seçiniz:", g.map(v => ({ id: "aesth_" + normalize(v).slice(0,18), title: v })));
  }
}
function chunk(arr, n) {
  const out = [];
  for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n));
  return out;
}

// Handle interactive button IDs
async function handleButton(session, waId, btnId) {
  if (btnId.startsWith("main_")) {
    let chosen = null;
    if (btnId === "main_ortho") chosen = "Ortopedi ve Travmatoloji";
    if (btnId === "main_derm")  chosen = "Dermatoloji";
    if (btnId === "main_aesth") chosen = "Medikal Estetik";
    if (btnId === "main_lab")   chosen = "Laboratuvar Testleri";

    await pool.query(`UPDATE wa_sessions SET main=$1, updated_at=NOW() WHERE id=$2`, [chosen, session.id]);

    if (chosen === "Ortopedi ve Travmatoloji") {
      await setState(session.id, "ortho_sub");
      await sendOrthoSubs(waId);
    } else if (chosen === "Medikal Estetik") {
      await setState(session.id, "aesthetic_sub");
      await sendAestheticSubs(waId);
    } else {
      await setState(session.id, "complaint");
      await sendText(waId, Q_COMPLAINT);
    }
    return;
  }

  if (btnId.startsWith("ortho_")) {
    const title = ORTHO_SUBS.find(x => ("ortho_" + normalize(x).slice(0,18)) === btnId);
    if (title) {
      await pool.query(`UPDATE wa_sessions SET sub=$1, updated_at=NOW() WHERE id=$2`, [title, session.id]);
      await setState(session.id, "complaint");
      await sendText(waId, Q_COMPLAINT);
    }
    return;
  }

  if (btnId.startsWith("aesth_")) {
    const title = AESTH_SUBS.find(x => ("aesth_" + normalize(x).slice(0,18)) === btnId);
    if (title) {
      await pool.query(`UPDATE wa_sessions SET sub=$1, updated_at=NOW() WHERE id=$2`, [title, session.id]);
      await setState(session.id, "complaint");
      await sendText(waId, Q_COMPLAINT);
    }
    return;
  }

  // fallback
  await sendText(waId, "Seçiminizi anlayamadık, lütfen tekrar dener misiniz?");
}

// Media type detector
function isMedia(msg) {
  return !!(msg.image || msg.document || msg.video || msg.audio);
}

// ====== Boot ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log("Webhook up on port", PORT);
  if (pool) await initDb();
});
