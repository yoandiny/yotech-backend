import { resolveCasdoorAccess } from './casdoorRoles.js';

const getCasdoorConfig = () => {
  const url = process.env.CASDOOR_URL?.replace(/\/$/, '');
  const clientId = process.env.CASDOOR_CLIENT_ID;
  const clientSecret = process.env.CASDOOR_CLIENT_SECRET;
  const redirectUri = process.env.CASDOOR_REDIRECT_URI;
  const organization = process.env.CASDOOR_ORGANIZATION || 'yotech';
  const application = process.env.CASDOOR_APP_NAME || 'yotech';
  const associateRole = process.env.CASDOOR_ASSOCIATE_ROLE || 'associe';

  const missing = [];
  if (!url) missing.push('CASDOOR_URL');
  if (!clientId) missing.push('CASDOOR_CLIENT_ID');
  if (!clientSecret) missing.push('CASDOOR_CLIENT_SECRET');
  if (!redirectUri) missing.push('CASDOOR_REDIRECT_URI');

  if (missing.length > 0) {
    throw new Error(`Configuration Casdoor incomplète : ${missing.join(', ')}`);
  }

  return { url, clientId, clientSecret, redirectUri, organization, application, associateRole };
};

const casdoorAdminHeaders = () => {
  const { clientId, clientSecret } = getCasdoorConfig();
  return {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
};

const casdoorAdminRequest = async (path, options = {}) => {
  const { url } = getCasdoorConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: { ...casdoorAdminHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') {
    throw new Error(data.msg || data.error_description || data.error || `Erreur Casdoor (${response.status})`);
  }
  return data;
};

const unwrapCasdoorUser = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const nested = payload.data?.user || payload.user || payload.data || payload;
  if (nested?.name || nested?.displayName || nested?.email || nested?.sub || nested?.preferred_username) {
    return nested;
  }
  return payload.data || payload;
};

const extractUserList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
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
    const account = unwrapCasdoorUser(payload);

    if (account?.name || account?.email || account?.displayName || account?.preferred_username) {
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

export const mapCasdoorAccountToUser = (account, accessToken) => {
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

  const access = resolveCasdoorAccess(account, accessToken);
  return {
    casdoorUserId,
    username,
    email,
    displayName,
    avatarUrl: avatar,
    provider: 'casdoor',
    role: access.appRole,
    casdoorRoles: access.roleNames,
    isAdmin: access.isAdmin
  };
};

export const mapAccessTokenRoles = (account, accessToken) => resolveCasdoorAccess(account, accessToken);

export const listCasdoorUsers = async () => {
  const { organization } = getCasdoorConfig();
  let users = [];
  try {
    const payload = await casdoorAdminRequest(
      `/api/get-users?owner=${encodeURIComponent(organization)}&p=1&pageSize=1000`
    );
    users = extractUserList(payload);
  } catch {
    users = [];
  }

  if (users.length === 0) {
    try {
      const payload = await casdoorAdminRequest('/api/get-global-users?p=1&pageSize=1000');
      users = extractUserList(payload).filter((user) => !user.owner || user.owner === organization);
    } catch {
      users = [];
    }
  }

  return users
    .filter((user) => user?.name || user?.id)
    .map((user) => {
      const access = resolveCasdoorAccess(user);
      return {
        casdoorUserId: user.id || `${user.owner || organization}/${user.name}`,
        username: user.name,
        email: user.email || null,
        displayName: user.displayName || user.name,
        avatarUrl: user.avatar || null,
        provider: 'casdoor',
        role: access.appRole,
        casdoorRoles: access.roleNames
      };
    });
};

const getCasdoorRole = async (owner, name) => {
  const payload = await casdoorAdminRequest(`/api/get-role?id=${encodeURIComponent(`${owner}/${name}`)}`);
  return payload?.data || null;
};

const ensureAssociateRole = async (username) => {
  const { organization, associateRole } = getCasdoorConfig();
  const userKey = `${organization}/${username}`;
  let role = null;
  try {
    role = await getCasdoorRole(organization, associateRole);
  } catch {
    role = null;
  }

  if (!role) {
    await casdoorAdminRequest('/api/add-role', {
      method: 'POST',
      body: JSON.stringify({
        owner: organization,
        name: associateRole,
        displayName: 'Associé',
        users: [userKey],
        isEnabled: true
      })
    });
    return;
  }

  const users = Array.isArray(role.users) ? role.users : [];
  if (!users.includes(userKey)) {
    await casdoorAdminRequest(`/api/update-role?id=${encodeURIComponent(`${organization}/${associateRole}`)}`, {
      method: 'POST',
      body: JSON.stringify({ ...role, users: [...users, userKey] })
    });
  }
};

export const createCasdoorAssociateUser = async ({ username, password, email, displayName }) => {
  const { organization, application, associateRole } = getCasdoorConfig();
  const name = username.trim();

  await casdoorAdminRequest('/api/add-user', {
    method: 'POST',
    body: JSON.stringify({
      owner: organization,
      name,
      displayName: displayName || name,
      email: email || '',
      password,
      signupApplication: application,
      type: 'normal-user'
    })
  });

  await ensureAssociateRole(name);

  const created = await casdoorAdminRequest(
    `/api/get-user?id=${encodeURIComponent(`${organization}/${name}`)}`
  );
  const user = created?.data || {};
  return {
    casdoorUserId: user.id || `${organization}/${name}`,
    username: name,
    email: user.email || email || null,
    displayName: user.displayName || displayName || name,
    avatarUrl: user.avatar || null,
    provider: 'casdoor',
    role: 'associate',
    casdoorRoles: [associateRole]
  };
};
