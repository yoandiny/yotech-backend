const getCasdoorConfig = () => {
  const url = process.env.CASDOOR_URL?.replace(/\/$/, '');
  const clientId = process.env.CASDOOR_CLIENT_ID;
  const clientSecret = process.env.CASDOOR_CLIENT_SECRET;
  const redirectUri = process.env.CASDOOR_REDIRECT_URI;

  const missing = [];
  if (!url) missing.push('CASDOOR_URL');
  if (!clientId) missing.push('CASDOOR_CLIENT_ID');
  if (!clientSecret) missing.push('CASDOOR_CLIENT_SECRET');
  if (!redirectUri) missing.push('CASDOOR_REDIRECT_URI');

  if (missing.length > 0) {
    throw new Error(`Configuration Casdoor incomplète : ${missing.join(', ')}`);
  }

  return { url, clientId, clientSecret, redirectUri };
};

export const exchangeCodeForToken = async (code) => {
  const { url, clientId, clientSecret, redirectUri } = getCasdoorConfig();

  const response = await fetch(`${url}/api/login/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();

  if (!response.ok || data.error || data.status === 'error') {
    const message = data.msg || data.error_description || data.error || 'Échec de l’échange du code Casdoor';
    throw new Error(message);
  }

  if (!data.access_token) {
    throw new Error('Casdoor n’a pas retourné un access_token');
  }

  return data;
};

export const getCasdoorAccount = async (accessToken) => {
  const { url } = getCasdoorConfig();

  const accountResponse = await fetch(`${url}/api/get-account`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (accountResponse.ok) {
    const payload = await accountResponse.json();
    const account = payload?.data ?? payload;

    if (account?.name || account?.email || account?.displayName) {
      return account;
    }
  }

  const userinfoResponse = await fetch(`${url}/api/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const userinfo = await userinfoResponse.json();

  if (!userinfoResponse.ok) {
    throw new Error(userinfo?.msg || userinfo?.error || 'Impossible de récupérer le profil Casdoor');
  }

  return userinfo;
};

export const mapCasdoorAccountToUser = (account) => {
  const casdoorUserId = account.id || account.sub || account.name;
  const username = account.name || account.preferred_username || account.username || casdoorUserId;
  const displayName =
    account.displayName ||
    account.display_name ||
    account.preferredUsername ||
    account.name ||
    username;
  const email = account.email || account.mail || null;
  const avatar = account.avatar || account.picture || account.avatarUrl || null;

  return {
    casdoorUserId,
    username,
    email,
    displayName,
    avatarUrl: avatar,
    provider: 'casdoor',
  };
};
