const DEFAULT_MODEL = 'deepseek-chat';
const DEFAULT_URL = 'https://api.deepseek.com/chat/completions';

let transport = null;

const defaultTransport = async (url, options) => fetch(url, options);

export const setDeepSeekTransport = (fn) => {
  transport = fn;
};

export const deepSeekConfig = () => ({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  url: process.env.DEEPSEEK_URL || DEFAULT_URL,
  enabled: process.env.ACCOUNTING_AI !== 'false'
});

export const isDeepSeekConfigured = () => {
  const config = deepSeekConfig();
  if (!config.enabled || !config.apiKey) return false;
  if (process.env.NODE_TEST_CONTEXT && !transport) return false;
  return true;
};

export const completeJson = async ({ system, user, temperature = 0 } = {}) => {
  const config = deepSeekConfig();
  if (!config.apiKey) {
    throw new Error('DEEPSEEK_API_KEY manquante.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.DEEPSEEK_TIMEOUT_MS || 20000));
  try {
    const send = transport || defaultTransport;
    const response = await send(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`DeepSeek ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse DeepSeek vide.');
    return content;
  } finally {
    clearTimeout(timeout);
  }
};
