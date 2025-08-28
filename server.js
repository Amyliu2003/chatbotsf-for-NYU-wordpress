import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import bodyParser from 'body-parser';
import { runIndexer } from './indexer.js';
import { topK } from './vectorStore.js';
import { scrubPII } from './privacy.js';
import { isOnTopic } from './moderation.js';

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ORIGIN = process.env.ALLOWED_ORIGIN;



app.use(cors({
  origin: ORIGIN,
  methods: ['GET','POST'],
  allowedHeaders: ['Content-Type'],
}));
app.use(bodyParser.json());
app.use(express.static('public'));   

app.get('/healthz', (_, res) => res.json({ ok: true }));

// cron-safe index endpoint
app.post('/api/index', async (_, res) => {
  try {
    const r = await runIndexer();
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// chat with citations
app.post('/api/chat', async (req, res) => {
  try {
    let { message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    const user = scrubPII(String(message));

    if (!isOnTopic(user)) {
      return res.json({
        answer: "I’m here for Campus Cravings—food around NYU, recipes, and your site content. Ask me about dishes, places to eat, or posts!",
        citations: []
      });
    }

    // embed query
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: user
    });
    const hits = topK(emb.data[0].embedding, 5);

    const context = hits.map(h => `• (${(h.score).toFixed(2)}) ${h.metadata.title}\n  ${h.metadata.preview}\n  ${h.metadata.url}`).join('\n\n');

    const sys = `You are Campus Cravings assistant. Be concise. Use the provided context only. Cite with [n] after sentences and include a "Sources" list of URLs. If unsure, say so.`;

    const prompt = [
      { role: 'system', content: sys },
      { role: 'user', content: `Question: ${user}\n\nContext:\n${context}` }
    ];

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: prompt,
      temperature: 0.2
    });

    // build citations list from hits order
    const citations = hits.map((h,i) => ({ n: i+1, title: h.metadata.title, url: h.metadata.url }));

    res.json({ answer: chat.choices[0].message.content, citations });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log('listening on', port));
