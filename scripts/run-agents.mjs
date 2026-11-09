const baseUrl = process.env.CHIT_BASE_URL;
const secret = process.env.CRON_SECRET;
if (!baseUrl || !secret) throw new Error('CHIT_BASE_URL and CRON_SECRET are required.');

const response = await fetch(new URL('/api/agents/run', baseUrl), {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
  body: '{}'
});
if (!response.ok) throw new Error(`Agent cycle failed (${response.status}): ${await response.text()}`);
console.log(await response.text());
