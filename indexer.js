import 'dotenv/config';
import fetch from 'node-fetch';
import { htmlToText } from 'html-to-text';
import OpenAI from 'openai';
import crypto from 'crypto';
import { chunk } from './chunk.js';
import { loadVectors, saveVectors, loadSigs, saveSigs } from './vectorStore.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const WP_BASE = process.env.WP_BASE;

// simple process-level mutex to prevent overlapping runs (server & cron)
let INDEXING = false;

function hash(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

async function embedMany(texts, batchSize = 100) {
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const slice = texts.slice(i, i + batchSize);
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: slice
    });
    for (const d of res.data) out.push(d.embedding);
  }
  return out;
}

function clean(html, title) {
  const t = htmlToText(html ?? '', {
    wordwrap: false,
    selectors: [{ selector: 'a', options: { ignoreHref: true } }]
  });
  return `${title ? `# ${title}\n` : ''}${t}`.trim();
}

async function fetchAll(endpoint) {
  // paginate up to 100 per page
  const perPage = 100;
  let page = 1;
  const all = [];
  while (true) {
    const url = `${WP_BASE}/wp-json/wp/v2/${endpoint}?orderby=modified&order=desc&per_page=${perPage}&page=${page}&_fields=id,modified,title,link,content`;
    const res = await fetch(url);
    if (res.status === 400 || res.status === 404) break; // endpoint might not exist (e.g., pages on some sites)
    if (!res.ok) throw new Error(`WP fetch ${endpoint} ${res.status}`);
    const items = await res.json();
    all.push(...items);
    if (items.length < perPage) break;
    page++;
  }
  return all;
}

export async function runIndexer() {
  if (INDEXING) return { updated: 0, note: 'already running' };
  INDEXING = true;
  try {
    // posts + pages (remove pages if you only want posts)
    const posts = await fetchAll('posts');
    const pages = await fetchAll('pages');
    const items = [...posts, ...pages];

    const sigs = loadSigs();
    const all = loadVectors();

    const changed = [];
    for (const p of items) {
      const body = clean(p.content?.rendered, p.title?.rendered);
      const sig  = hash(`${p.modified}|${body.slice(0, 4000)}`);
      if (sigs[p.id] !== sig) {
        changed.push({ ...p, body, sig });
      }
    }

    if (!changed.length) return { updated: 0 };

    // rebuild affected vectors per post, batching embeddings
    for (const p of changed) {
      const pieces = chunk(p.body, 900, 180);
      const embs = await embedMany(pieces);

      const kept = all.filter(v => v.metadata?.postId !== p.id);
      const next = kept.concat(
        embs.map((e, i) => ({
          id: `${p.id}::${i}`,
          values: e,
          metadata: {
            postId: p.id,
            title: p.title?.rendered ?? '',
            url: p.link,
            chunkIndex: i,
            preview: pieces[i].slice(0, 220)
          }
        }))
      );
      saveVectors(next);
      sigs[p.id] = p.sig;
    }
    saveSigs(sigs);
    return { updated: changed.length };
  } finally {
    INDEXING = false;
  }
}

if (process.argv[1].endsWith('indexer.js')) {
  runIndexer().then(r => {
    console.log('Indexed:', r.updated, r.note ? `(${r.note})` : '');
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
