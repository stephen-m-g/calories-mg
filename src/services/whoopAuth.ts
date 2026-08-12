import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { env } from '../utils/env';
import {
  setWhoopConnected,
  setWhoopDisconnected,
  updateWhoopTokenExpiry,
} from '../db';

/**
 * WHOOP OAuth 2.0 (authorization code flow).
 *
 * Tokens are kept in expo-secure-store (Keychain / Android Keystore), never in SQLite — they're
 * live account credentials, and the database is plain-text on disk and destined for cloud backup.
 * Only non-sensitive connection state goes in `whoop_connection`.
 */

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/token',
};

// `offline` is not optional: without it WHOOP issues no refresh token at all, and the
// connection would silently die every time the access token expires.
const SCOPES = ['read:cycles', 'offline'];

const ACCESS_TOKEN_KEY = 'whoop_access_token';
const REFRESH_TOKEN_KEY = 'whoop_refresh_token';
const EXPIRY_KEY = 'whoop_token_expiry';

// Refresh slightly early so a request can't be sent with a token that expires in flight.
const EXPIRY_SKEW_MS = 60_000;

export function isWhoopConfigured(): boolean {
  return Boolean(env.whoopClientId && env.whoopClientSecret);
}

/**
 * Whether the OAuth redirect can actually be received. Blocked under Expo Go — its redirect
 * resolves to `exp://<lan-ip>:8081/--/whoop-callback`, which changes with the network and can't
 * be pre-registered with WHOOP, so `promptAsync()` would open a real browser session to a
 * consent screen that has nowhere valid to send the user back to. Using the same
 * `executionEnvironment` check `expo-auth-session` itself uses internally to pick a redirect
 * shape, rather than re-deriving the condition separately.
 */
export function isWhoopAvailable(): boolean {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/**
 * In a development or production build this resolves to `caloriemate://whoop-callback`, matching
 * the app's `scheme`. Expo Go instead produces an `exp://<host>:8081/--/whoop-callback` URL,
 * which WHOOP will reject unless that exact address is also registered — so connecting realistically
 * requires a real build.
 */
export function getRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'caloriemate', path: 'whoop-callback' });
}

async function storeTokens(tokens: {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
}): Promise<string | null> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null;
  if (expiresAt) {
    await SecureStore.setItemAsync(EXPIRY_KEY, expiresAt);
  }
  return expiresAt;
}

export async function clearWhoopTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(EXPIRY_KEY),
  ]);
  await setWhoopDisconnected();
}

export type ConnectResult = 'connected' | 'cancelled' | 'not_configured';

/** Runs the full browser consent flow and persists the resulting tokens. */
export async function connectWhoop(): Promise<ConnectResult> {
  if (!isWhoopConfigured()) return 'not_configured';

  const redirectUri = getRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId: env.whoopClientId,
    scopes: SCOPES,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: false,
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) {
    if (result.type === 'error') {
      throw new Error(result.params.error_description || result.params.error || 'WHOOP sign-in failed');
    }
    return 'cancelled';
  }

  const tokens = await AuthSession.exchangeCodeAsync(
    {
      clientId: env.whoopClientId,
      code: result.params.code,
      redirectUri,
      // Passing `clientSecret` as its own field makes expo-auth-session authenticate via an HTTP
      // Basic header instead — WHOOP's token endpoint doesn't support that and rejects it as
      // invalid_client. Routing it through extraParams keeps it as a body field (client_secret_post),
      // which is the shape WHOOP's own docs use. Also carries the PKCE verifier when present.
      extraParams: {
        client_secret: env.whoopClientSecret,
        ...(request.codeVerifier ? { code_verifier: request.codeVerifier } : {}),
      },
    },
    DISCOVERY
  );

  const expiresAt = await storeTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  });

  // The WHOOP user id isn't in the token response; it comes from the first cycle fetched.
  await setWhoopConnected({ whoopUserId: null, tokenExpiresAt: expiresAt });
  return 'connected';
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const tokens = await AuthSession.refreshAsync(
    {
      clientId: env.whoopClientId,
      refreshToken,
      // WHOOP requires the scopes again on refresh, and dropping `offline` here would return a
      // token with no successor — the connection would work once, then expire permanently.
      scopes: SCOPES,
      // See the matching note in connectWhoop() — client_secret has to travel in the body, not
      // as a Basic auth header, or WHOOP rejects the request as invalid_client.
      extraParams: { client_secret: env.whoopClientSecret },
    },
    DISCOVERY
  );

  const expiresAt = await storeTokens({
    accessToken: tokens.accessToken,
    // Each refresh returns a new refresh token which supersedes the old one.
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  });
  await updateWhoopTokenExpiry(expiresAt);
  return tokens.accessToken;
}

/**
 * A usable access token, refreshing first if the stored one is expired or nearly so.
 * Returns null when there's no connection, or when the refresh token has been revoked —
 * in which case the stored connection is cleared so the UI can prompt to reconnect.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const [accessToken, refreshToken, expiry] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRY_KEY),
  ]);

  if (!accessToken && !refreshToken) return null;

  const expired = !expiry || Date.parse(expiry) - EXPIRY_SKEW_MS <= Date.now();
  if (accessToken && !expired) return accessToken;

  if (!refreshToken) return null;
  try {
    return await refreshAccessToken(refreshToken);
  } catch {
    // Refresh tokens are revoked when the user removes app access from their WHOOP account.
    await clearWhoopTokens();
    return null;
  }
}
