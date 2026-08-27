const config = require('./mongo-express.config');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { MongoClient, ObjectId } = require('mongodb');
const { EJSON } = require('bson');

const PORT = config.site.port;
const MONGO_URL = config.mongodb.connectionString;
const USERNAME = config.basicAuth.username;
const PASSWORD = config.basicAuth.password;
const DOCUMENTS_PER_PAGE = config.options.documentsPerPage || 20;
const BODY_LIMIT = config.site.requestSizeLimit || '50mb';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});
const AUTH_COOKIE = 'mongo_ui_auth';
const AUTH_TOKEN = crypto
  .createHash('sha256')
  .update(`${USERNAME}:${PASSWORD}:caip-mongo-ui`)
  .digest('hex');

const app = express();
let client;

app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));
app.use(express.json({ limit: BODY_LIMIT }));

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isAuthenticated(req) {
  return parseCookies(req)[AUTH_COOKIE] === AUTH_TOKEN;
}

function requireAuth(req, res, next) {
  if (req.path === '/login') return next();
  if (isAuthenticated(req)) return next();
  return res.redirect('/login');
}

function page(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #222; background: #fafafa; }
    a { color: #1a73e8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; background: #fff; table-layout: fixed; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    th.col-id, td.col-id { width: 220px; }
    th.col-actions, td.col-actions { width: 280px; background: #f8fbff; }
    th.col-doc, td.col-doc { width: auto; }
    pre, .json-view {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.45;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 12px;
    }
    .json-preview {
      max-height: 220px;
      overflow: auto;
    }
    .json-full {
      max-height: none;
    }
    .muted { color: #666; }
    .breadcrumb { margin-bottom: 20px; }
    .card {
      max-width: 420px;
      margin: 80px auto;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    label { display: block; margin-bottom: 6px; font-weight: 600; }
    input, textarea, select {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      margin-bottom: 16px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-family: Consolas, monospace;
    }
    textarea { min-height: 420px; resize: vertical; }
    button, .btn {
      display: inline-block;
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      background: #1a73e8;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
    }
    .btn-secondary { background: #5f6368; }
    .btn-danger { background: #d93025; }
    .btn-light { background: #fff; color: #1a73e8; border: 1px solid #1a73e8; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; align-items: center; }
    .help-box {
      background: #e8f0fe;
      border: 1px solid #c6dafc;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 20px;
    }
    .action-panel {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
    }
    .action-panel h3 { margin: 0 0 12px; }
    .badge {
      display: inline-block;
      background: #1a73e8;
      color: #fff;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      margin-left: 8px;
      vertical-align: middle;
    }
    .error { color: #d93025; margin-bottom: 12px; }
    .success { color: #188038; margin-bottom: 12px; }
    .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .inline-form { display: inline; }
    .danger-box {
      margin-top: 24px;
      padding: 16px;
      border: 1px solid #f5c2c0;
      background: #fff5f5;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;
  const formatted = size >= 100 || exponent === 0 ? size.toFixed(0) : size.toFixed(2);

  return `${formatted} ${units[exponent]}`;
}

function formatDocumentJson(doc) {
  return JSON.stringify(EJSON.serialize(doc), null, 2);
}

function readImportRaw(req) {
  if (req.file?.buffer) {
    return req.file.buffer.toString('utf8');
  }
  return (req.body.payload || '').toString();
}

function parseJsonImport(raw) {
  const text = raw.trim();
  if (!text) {
    throw new Error('Import JSON is required. Upload a file or paste JSON.');
  }
  return JSON.parse(text);
}

function deserializeDocuments(items) {
  if (!Array.isArray(items)) {
    throw new Error('Expected an array of documents.');
  }
  return items.map((item) => EJSON.deserialize(item));
}

function isDatabaseImportPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const keys = Object.keys(parsed);
  return keys.length > 0 && keys.every((key) => Array.isArray(parsed[key]));
}

async function importDocumentsToCollection(db, collectionName, documents, mode) {
  const collection = db.collection(collectionName);

  if (mode === 'replace') {
    await collection.deleteMany({});
  }

  if (!documents.length) {
    return 0;
  }

  const result = await collection.insertMany(documents, { ordered: false });
  return result.insertedCount;
}

function importFormPage({ title, breadcrumb, action, cancelHref, description, example, error = '' }) {
  return page(
    title,
    `${breadcrumb}
     ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
     <h1>${title}</h1>
     <p class="muted">${description}</p>
     <div class="help-box"><strong>JSON format example</strong><pre class="json-view json-preview">${escapeHtml(example)}</pre></div>
     <form method="POST" action="${action}" enctype="multipart/form-data">
       <label for="mode">Import mode</label>
       <select id="mode" name="mode">
         <option value="append">Append (keep existing records)</option>
         <option value="replace">Replace (delete existing records first)</option>
       </select>
       <label for="file">Upload JSON file</label>
       <input id="file" type="file" name="file" accept=".json,application/json" />
       <label for="payload">Or paste JSON</label>
       <textarea id="payload" name="payload" placeholder="Paste JSON here..."></textarea>
       <div class="toolbar">
         <button type="submit" class="btn">Import</button>
         <a class="btn btn-secondary" href="${cancelHref}">Cancel</a>
       </div>
     </form>`
  );
}

function tryParseObjectId(value) {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) return null;
  return new ObjectId(value);
}

function buildIdQuery(id) {
  const objectId = tryParseObjectId(id);
  return objectId ? { _id: objectId } : { _id: id };
}

function collectionPath(dbName, collectionName) {
  return `/db/${encodeURIComponent(dbName)}/${encodeURIComponent(collectionName)}`;
}

function documentPath(dbName, collectionName, id) {
  return `${collectionPath(dbName, collectionName)}/doc/${encodeURIComponent(id)}`;
}

function flashMessage(req) {
  const message = (req.query.message || '').toString().trim();
  const error = (req.query.error || '').toString().trim();
  if (message) return `<p class="success">${escapeHtml(message)}</p>`;
  if (error) return `<p class="error">${escapeHtml(error)}</p>`;
  return '';
}

function loginPage(errorMessage = '') {
  return page(
    'Mongo Web UI Login',
    `<div class="card">
      <h1>Mongo Web UI</h1>
      <p class="muted">Sign in to browse your local MongoDB.</p>
      ${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ''}
      <form method="POST" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Login</button>
      </form>
    </div>`
  );
}

app.get('/login', (req, res) => {
  if (isAuthenticated(req)) {
    return res.redirect('/');
  }
  return res.send(loginPage());
});

app.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (username === USERNAME && password === PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      `${AUTH_COOKIE}=${AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );
    return res.redirect('/');
  }

  return res.status(401).send(loginPage('Invalid username or password.'));
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; Max-Age=0`);
  return res.redirect('/login');
});

app.use(requireAuth);

app.get('/', async (req, res) => {
  try {
    const admin = client.db().admin();
    const { databases } = await admin.listDatabases();
    const rows = databases
      .map(
        (db) =>
          `<tr><td><a href="/db/${encodeURIComponent(db.name)}">${escapeHtml(db.name)}</a></td><td>${escapeHtml(
            formatBytes(db.sizeOnDisk || 0)
          )}</td><td><a class="btn btn-light" href="/db/${encodeURIComponent(db.name)}">Open</a></td></tr>`
      )
      .join('');

    res.send(
      page(
        'Mongo Web UI',
        `<div class="topbar">
           <h1>Mongo Web UI <span class="badge">CAIP</span></h1>
           <a href="/logout">Logout</a>
         </div>
         <table>
           <thead><tr><th>Database</th><th>Size</th><th>Open</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>`
      )
    );
  } catch (error) {
    res.status(500).send(page('Error', `<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName', async (req, res) => {
  try {
    const dbName = req.params.dbName;
    const collections = await client.db(dbName).listCollections().toArray();
    const rows = collections
      .map((collection) => {
        const href = collectionPath(dbName, collection.name);
        return `<tr>
          <td><a href="${href}">${escapeHtml(collection.name)}</a></td>
          <td>${escapeHtml(collection.type || 'collection')}</td>
          <td>
            <div class="actions">
              <a class="btn" href="${href}">Open</a>
              <a class="btn btn-light" href="${href}/export">Export</a>
              <a class="btn btn-secondary" href="${href}/import">Import</a>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    res.send(
      page(
        dbName,
        `<div class="breadcrumb"><a href="/">Home</a> / ${escapeHtml(dbName)} | <a href="/logout">Logout</a></div>
         ${flashMessage(req)}
         <h1>${escapeHtml(dbName)} <span class="badge">CAIP</span></h1>
         <div class="action-panel">
           <h3>Database Actions</h3>
           <div class="toolbar">
             <a class="btn" href="/db/${encodeURIComponent(dbName)}/export">⬇ Export Whole Database</a>
             <a class="btn btn-secondary" href="/db/${encodeURIComponent(dbName)}/import">⬆ Import Whole Database</a>
           </div>
         </div>
         <table>
           <thead><tr><th>Collection</th><th>Type</th><th>Actions</th></tr></thead>
           <tbody>${rows}</tbody>
         </table>`
      )
    );
  } catch (error) {
    res.status(500).send(page('Error', `<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName/export', async (req, res) => {
  try {
    const { dbName } = req.params;
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const payload = {};

    for (const col of collections) {
      if (col.type !== 'collection') continue;
      const docs = await db.collection(col.name).find({}).toArray();
      payload[col.name] = docs.map((doc) => EJSON.serialize(doc));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dbName}-database-export.json"`
    );
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return res.status(500).send(page('Error', `<h1>Database export failed</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName/import', (req, res) => {
  const { dbName } = req.params;
  const dbHref = `/db/${encodeURIComponent(dbName)}`;

  return res.send(
    importFormPage({
      title: `Import Database: ${dbName}`,
      breadcrumb: `<div class="breadcrumb"><a href="/">Home</a> / <a href="${dbHref}">${escapeHtml(dbName)}</a> / Import Database</div>`,
      action: `${dbHref}/import`,
      cancelHref: dbHref,
      description: 'Import all collections from a JSON file. Each top-level key is a collection name.',
      error: (req.query.error || '').toString(),
      example: `{
  "users": [
    { "_id": { "$oid": "..." }, "fullName": "John" }
  ],
  "leads": [
    { "_id": { "$oid": "..." }, "leadName": "Acme" }
  ]
}`,
    })
  );
});

app.post('/db/:dbName/import', upload.single('file'), async (req, res) => {
  const { dbName } = req.params;
  const dbHref = `/db/${encodeURIComponent(dbName)}`;
  const mode = (req.body.mode || 'append').toString();

  try {
    const parsed = parseJsonImport(readImportRaw(req));
    if (!isDatabaseImportPayload(parsed)) {
      return res.redirect(
        `${dbHref}/import?error=${encodeURIComponent('Database import expects JSON object with collection names as keys and document arrays as values.')}`
      );
    }

    const db = client.db(dbName);
    let totalInserted = 0;

    for (const [collectionName, items] of Object.entries(parsed)) {
      const documents = deserializeDocuments(items);
      totalInserted += await importDocumentsToCollection(db, collectionName, documents, mode);
    }

    return res.redirect(
      `${dbHref}?message=${encodeURIComponent(`Database import complete. Inserted ${totalInserted} document(s).`)}`
    );
  } catch (error) {
    return res.redirect(`${dbHref}/import?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/db/:dbName/:collectionName/export', async (req, res) => {
  try {
    const { dbName, collectionName } = req.params;
    const documents = await client.db(dbName).collection(collectionName).find({}).toArray();
    const exportPayload = `[\n${documents.map((doc) => formatDocumentJson(doc)).join(',\n')}\n]`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${collectionName}-${dbName}.json"`
    );
    return res.send(exportPayload);
  } catch (error) {
    return res.status(500).send(page('Error', `<h1>Export failed</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName/:collectionName/import', (req, res) => {
  const { dbName, collectionName } = req.params;
  const collectionHref = collectionPath(dbName, collectionName);
  const dbHref = `/db/${encodeURIComponent(dbName)}`;

  return res.send(
    importFormPage({
      title: `Import Collection: ${collectionName}`,
      breadcrumb: `<div class="breadcrumb"><a href="/">Home</a> / <a href="${dbHref}">${escapeHtml(dbName)}</a> / <a href="${collectionHref}">${escapeHtml(collectionName)}</a> / Import</div>`,
      action: `${collectionHref}/import`,
      cancelHref: collectionHref,
      description: 'Import documents into this collection from a JSON array or a single document object.',
      error: (req.query.error || '').toString(),
      example: `[
  {
    "_id": { "$oid": "..." },
    "leadName": "Acme Lead",
    "email": "test@example.com"
  }
]`,
    })
  );
});

app.post('/db/:dbName/:collectionName/import', upload.single('file'), async (req, res) => {
  const { dbName, collectionName } = req.params;
  const collectionHref = collectionPath(dbName, collectionName);
  const mode = (req.body.mode || 'append').toString();

  try {
    const parsed = parseJsonImport(readImportRaw(req));
    let documents;

    if (Array.isArray(parsed)) {
      documents = deserializeDocuments(parsed);
    } else if (isDatabaseImportPayload(parsed)) {
      return res.redirect(
        `${collectionHref}/import?error=${encodeURIComponent('This looks like a full database JSON. Use Import Whole Database instead.')}`
      );
    } else {
      documents = deserializeDocuments([parsed]);
    }

    const inserted = await importDocumentsToCollection(
      client.db(dbName),
      collectionName,
      documents,
      mode
    );

    return res.redirect(
      `${collectionHref}?message=${encodeURIComponent(`Collection import complete. Inserted ${inserted} document(s).`)}`
    );
  } catch (error) {
    return res.redirect(`${collectionHref}/import?error=${encodeURIComponent(error.message)}`);
  }
});

app.post('/db/:dbName/:collectionName/delete', async (req, res) => {
  try {
    const { dbName, collectionName } = req.params;
    const confirm = (req.body.confirm || '').toString().trim();

    if (confirm !== collectionName) {
      const href = collectionPath(dbName, collectionName);
      return res.redirect(`${href}?error=${encodeURIComponent('Type the collection name to confirm delete.')}`);
    }

    await client.db(dbName).collection(collectionName).drop();
    return res.redirect(
      `/db/${encodeURIComponent(dbName)}?message=${encodeURIComponent(`Collection "${collectionName}" deleted.`)}`
    );
  } catch (error) {
    const href = collectionPath(req.params.dbName, req.params.collectionName);
    return res.redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }
});

app.post('/db/:dbName/:collectionName/delete-all', async (req, res) => {
  try {
    const { dbName, collectionName } = req.params;
    const confirm = (req.body.confirm || '').toString().trim();
    const href = collectionPath(dbName, collectionName);

    if (confirm !== collectionName) {
      return res.redirect(`${href}?error=${encodeURIComponent('Type the collection name to confirm delete all records.')}`);
    }

    const result = await client.db(dbName).collection(collectionName).deleteMany({});
    return res.redirect(
      `${href}?message=${encodeURIComponent(`Deleted ${result.deletedCount} record(s). Collection kept empty.`)}`
    );
  } catch (error) {
    const href = collectionPath(req.params.dbName, req.params.collectionName);
    return res.redirect(`${href}?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/db/:dbName/:collectionName', async (req, res) => {
  try {
    const { dbName, collectionName } = req.params;
    const pageNumber = Math.max(Number(req.query.page) || 1, 1);
    const limit = DOCUMENTS_PER_PAGE;
    const skip = (pageNumber - 1) * limit;
    const basePath = collectionPath(dbName, collectionName);

    const collection = client.db(dbName).collection(collectionName);
    const [documents, total] = await Promise.all([
      collection.find({}).sort({ _id: -1 }).skip(skip).limit(limit).toArray(),
      collection.estimatedDocumentCount(),
    ]);

    const rows = documents
      .map((doc) => {
        const id = doc._id ? String(doc._id) : '';
        const detailUrl = id ? documentPath(dbName, collectionName, id) : '#';
        const jsonPreview = formatDocumentJson(doc);
        return `<tr>
          <td class="col-id">${id ? `<a href="${detailUrl}"><strong>${escapeHtml(id)}</strong></a>` : '-'}</td>
          <td class="col-actions">
            <div class="actions">
              ${id ? `<a class="btn btn-light" href="${detailUrl}">View</a>` : ''}
              ${id ? `<a class="btn btn-secondary" href="${detailUrl}/edit">Edit</a>` : ''}
              ${id ? `<form class="inline-form" method="POST" action="${detailUrl}/copy" onsubmit="return confirm('Copy this record?');"><button type="submit" class="btn btn-secondary">Copy</button></form>` : ''}
              ${id ? `<form class="inline-form" method="POST" action="${detailUrl}/delete" onsubmit="return confirm('Delete this record?');"><button type="submit" class="btn btn-danger">Delete</button></form>` : ''}
            </div>
          </td>
          <td class="col-doc"><pre class="json-view json-preview">${escapeHtml(jsonPreview)}</pre></td>
        </tr>`;
      })
      .join('');

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const prev = pageNumber > 1 ? pageNumber - 1 : null;
    const next = pageNumber < totalPages ? pageNumber + 1 : null;

    res.send(
      page(
        `${dbName}.${collectionName}`,
        `<div class="breadcrumb">
           <a href="/">Home</a> /
           <a href="/db/${encodeURIComponent(dbName)}">${escapeHtml(dbName)}</a> /
           ${escapeHtml(collectionName)} |
           <a href="/logout">Logout</a>
         </div>
         ${flashMessage(req)}
         <h1>${escapeHtml(collectionName)} <span class="badge">CAIP</span></h1>
         <div class="action-panel">
           <h3>Collection Actions</h3>
           <div class="toolbar">
             <a class="btn" href="${basePath}/export">⬇ Export Collection</a>
             <a class="btn btn-secondary" href="${basePath}/import">⬆ Import Collection</a>
           </div>
         </div>
         <p class="muted">Showing page ${pageNumber} of ${totalPages} (${total} documents)</p>
         <p>
           ${prev ? `<a href="?page=${prev}">Previous</a>` : 'Previous'}
           |
           ${next ? `<a href="?page=${next}">Next</a>` : 'Next'}
         </p>
         <table>
           <thead><tr><th class="col-id">_id</th><th class="col-actions">Record Actions</th><th class="col-doc">Document Preview</th></tr></thead>
           <tbody>${rows || '<tr><td colspan="3">No documents found.</td></tr>'}</tbody>
         </table>
         <p class="muted">Tip: scroll down for <strong>Delete All Records</strong> and <strong>Delete Collection</strong>.</p>
         <div class="danger-box">
           <h3>Delete All Records</h3>
           <p class="muted">Removes every document but keeps the collection. Type <strong>${escapeHtml(collectionName)}</strong> to confirm.</p>
           <form method="POST" action="${basePath}/delete-all" onsubmit="return confirm('Delete ALL records in this collection?');">
             <input name="confirm" placeholder="Collection name" required />
             <button type="submit" class="btn btn-danger">Delete All Records</button>
           </form>
         </div>
         <div class="danger-box">
           <h3>Delete Collection</h3>
           <p class="muted">Type <strong>${escapeHtml(collectionName)}</strong> to permanently delete this collection.</p>
           <form method="POST" action="${basePath}/delete" onsubmit="return confirm('Delete entire collection?');">
             <input name="confirm" placeholder="Collection name" required />
             <button type="submit" class="btn btn-danger">Delete Collection</button>
           </form>
         </div>`
      )
    );
  } catch (error) {
    res.status(500).send(page('Error', `<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName/:collectionName/doc/:id', async (req, res) => {
  try {
    const { dbName, collectionName, id } = req.params;
    const document = await client.db(dbName).collection(collectionName).findOne(buildIdQuery(id));

    if (!document) {
      return res.status(404).send(page('Not Found', '<h1>Document not found</h1>'));
    }

    const jsonText = formatDocumentJson(document);
    const basePath = documentPath(dbName, collectionName, id);
    const listPath = collectionPath(dbName, collectionName);

    res.send(
      page(
        `${collectionName} document`,
        `<div class="breadcrumb">
           <a href="/">Home</a> /
           <a href="/db/${encodeURIComponent(dbName)}">${escapeHtml(dbName)}</a> /
           <a href="${listPath}">${escapeHtml(collectionName)}</a> /
           ${escapeHtml(id)} |
           <a href="/logout">Logout</a>
         </div>
         ${flashMessage(req)}
         <h1>Document</h1>
         <div class="toolbar">
           <a class="btn btn-secondary" href="${basePath}/edit">Edit</a>
           <form class="inline-form" method="POST" action="${basePath}/copy" onsubmit="return confirm('Copy this record?');">
             <button type="submit" class="btn btn-secondary">Copy</button>
           </form>
           <button type="button" class="btn btn-light" onclick="copyJson()">Copy JSON</button>
           <form class="inline-form" method="POST" action="${basePath}/delete" onsubmit="return confirm('Delete this record?');">
             <button type="submit" class="btn btn-danger">Delete</button>
           </form>
         </div>
         <pre id="doc-json" class="json-view json-full">${escapeHtml(jsonText)}</pre>
         <script>
           function copyJson() {
             const text = document.getElementById('doc-json').innerText;
             navigator.clipboard.writeText(text).then(() => alert('JSON copied to clipboard.'));
           }
         </script>`
      )
    );
  } catch (error) {
    res.status(500).send(page('Error', `<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.get('/db/:dbName/:collectionName/doc/:id/edit', async (req, res) => {
  try {
    const { dbName, collectionName, id } = req.params;
    const document = await client.db(dbName).collection(collectionName).findOne(buildIdQuery(id));

    if (!document) {
      return res.status(404).send(page('Not Found', '<h1>Document not found</h1>'));
    }

    const jsonText = formatDocumentJson(document);
    const basePath = documentPath(dbName, collectionName, id);

    res.send(
      page(
        'Edit Document',
        `<div class="breadcrumb">
           <a href="/">Home</a> /
           <a href="${collectionPath(dbName, collectionName)}">${escapeHtml(collectionName)}</a> /
           <a href="${basePath}">${escapeHtml(id)}</a> / Edit
         </div>
         ${req.query.error ? `<p class="error">${escapeHtml(req.query.error)}</p>` : ''}
         <h1>Edit Document</h1>
         <form method="POST" action="${basePath}/edit">
           <label for="document">Document JSON</label>
           <textarea id="document" name="document" required>${escapeHtml(jsonText)}</textarea>
           <div class="toolbar">
             <button type="submit" class="btn">Save</button>
             <a class="btn btn-secondary" href="${basePath}">Cancel</a>
           </div>
         </form>`
      )
    );
  } catch (error) {
    res.status(500).send(page('Error', `<h1>Error</h1><pre>${escapeHtml(error.message)}</pre>`));
  }
});

app.post('/db/:dbName/:collectionName/doc/:id/edit', async (req, res) => {
  try {
    const { dbName, collectionName, id } = req.params;
    const basePath = documentPath(dbName, collectionName, id);
    const rawDocument = (req.body.document || '').toString();

    let parsedDocument;
    try {
      parsedDocument = EJSON.deserialize(JSON.parse(rawDocument));
    } catch (parseError) {
      return res.redirect(`${basePath}/edit?error=${encodeURIComponent('Invalid JSON format.')}`);
    }

    if (!parsedDocument || typeof parsedDocument !== 'object' || Array.isArray(parsedDocument)) {
      return res.redirect(`${basePath}/edit?error=${encodeURIComponent('Document must be a JSON object.')}`);
    }

    const objectId = tryParseObjectId(id);
    parsedDocument._id = objectId || id;

    await client.db(dbName).collection(collectionName).replaceOne(buildIdQuery(id), parsedDocument);
    return res.redirect(`${basePath}?message=${encodeURIComponent('Document updated successfully.')}`);
  } catch (error) {
    const basePath = documentPath(req.params.dbName, req.params.collectionName, req.params.id);
    return res.redirect(`${basePath}/edit?error=${encodeURIComponent(error.message)}`);
  }
});

app.post('/db/:dbName/:collectionName/doc/:id/copy', async (req, res) => {
  try {
    const { dbName, collectionName, id } = req.params;
    const document = await client.db(dbName).collection(collectionName).findOne(buildIdQuery(id));

    if (!document) {
      return res.status(404).send(page('Not Found', '<h1>Document not found</h1>'));
    }

    const copy = EJSON.parse(EJSON.stringify(document));
    delete copy._id;

    const result = await client.db(dbName).collection(collectionName).insertOne(copy);
    const newId = String(result.insertedId);
    const listPath = collectionPath(dbName, collectionName);

    return res.redirect(`${listPath}?message=${encodeURIComponent(`Record copied. New _id: ${newId}`)}`);
  } catch (error) {
    const basePath = documentPath(req.params.dbName, req.params.collectionName, req.params.id);
    return res.redirect(`${basePath}?error=${encodeURIComponent(error.message)}`);
  }
});

app.post('/db/:dbName/:collectionName/doc/:id/delete', async (req, res) => {
  try {
    const { dbName, collectionName, id } = req.params;
    await client.db(dbName).collection(collectionName).deleteOne(buildIdQuery(id));
    const listPath = collectionPath(dbName, collectionName);
    return res.redirect(`${listPath}?message=${encodeURIComponent('Record deleted successfully.')}`);
  } catch (error) {
    const basePath = documentPath(req.params.dbName, req.params.collectionName, req.params.id);
    return res.redirect(`${basePath}?error=${encodeURIComponent(error.message)}`);
  }
});

async function start() {
  client = new MongoClient(MONGO_URL);
  await client.connect();

  app.listen(PORT, () => {
    console.log(`Mongo Web UI running at http://localhost:${PORT}/login`);
    console.log(`Login: ${USERNAME} / ${PASSWORD}`);
  });
}

start().catch((error) => {
  console.error('Failed to start Mongo Web UI:', error.message);
  process.exit(1);
});
