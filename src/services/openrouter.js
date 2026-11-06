const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_URL = 'https://openrouter.ai/api/v1/chat/completions';

let transport = null;

const defaultTransport = async (url, options) => fetch(url, options);

export const setOpenRouterTransport = (fn) => {
  transport = fn;
};

export const openRouterConfig = () => ({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  url: process.env.OPENROUTER_URL || DEFAULT_URL,
  siteUrl: process.env.OPENROUTER_SITE_URL || 'https://yotech.mg',
  appName: process.env.OPENROUTER_APP_NAME || 'YoTech ERP',
  enabled: process.env.ACCOUNTING_AI !== 'false'
});

export const isOpenRouterConfigured = () => {
  const config = openRouterConfig();
  if (!config.enabled || !config.apiKey) return false;
  if (process.env.NODE_TEST_CONTEXT && !transport) return false;
  return true;
};

export const completeJson = async ({ system, user, temperature = 0 } = {}) => {
  const config = openRouterConfig();
  if (!config.apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENROUTER_TIMEOUT_MS || 20000));
  try {
    const send = transport || defaultTransport;
    const response = await send(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.siteUrl,
        'X-Title': config.appName
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
      throw new Error(`OpenRouter ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse OpenRouter vide.');
    return content;
  } finally {
    clearTimeout(timeout);
  }
};
