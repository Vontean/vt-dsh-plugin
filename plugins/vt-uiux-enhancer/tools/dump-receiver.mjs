#!/usr/bin/env node
/**
 * Receiver for the opt-in probe in `client.js`.
 *
 * The probe answers questions that stylesheet text cannot: "did this patch win
 * the cascade on THIS element, right now, in this hover state". To read those
 * measurements the maintainer needs an endpoint the renderer can reach, so this
 * script prints nothing fancy — it appends each POST as one JSON line.
 *
 *   node tools/dump-receiver.mjs          # 127.0.0.1:8899, appends to the log
 *   tail -f /tmp/vt-dump.jsonl            # then read it
 *
 * The renderer only talks to it while the probe is on, so this script is idle
 * unless someone is debugging.
 */

import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.VT_DUMP_PORT || 8899);
const OUT = process.env.VT_DUMP_OUT || '/tmp/vt-dump.jsonl';
const REQUEST_LOG = `${OUT}.requests`;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-allow-private-network': 'true',
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let tag = 'unparsed';
      try {
        const parsed = JSON.parse(body);
        tag = parsed.kind || 'json';
        fs.appendFileSync(OUT, `${JSON.stringify(parsed)}\n`);
      } catch (error) {
        fs.appendFileSync(OUT, `${JSON.stringify({ kind: 'unparsed', body: body.slice(0, 500) })}\n`);
      }
      fs.appendFileSync(REQUEST_LOG, `${new Date().toISOString()} ${req.method} ${body.length}B ${tag}\n`);
      res.writeHead(204, CORS);
      res.end();
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`vt probe receiver: http://127.0.0.1:${PORT}/  ->  ${OUT}`);
  });
