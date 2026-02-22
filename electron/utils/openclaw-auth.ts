/**
 * OpenClaw Auth Profiles Utility
 * Writes API keys to ~/.openclaw/agents/main/agent/auth-profiles.json
 * so the OpenClaw Gateway can load them for AI provider calls.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  getProviderEnvVar,
  getProviderDefaultModel,
  getProviderConfig,
} from './provider-registry';

const AUTH_STORE_VERSION = 1;
const AUTH_PROFILE_FILENAME = 'auth-profiles.json';

/**
 * Auth profile entry for an API key
 */
interface AuthProfileEntry {
  type: 'api_key';
  provider: string;
  key: string;
}

/**
 * Auth profiles store format
 */
interface AuthProfilesStore {
  version: number;
  profiles: Record<string, AuthProfileEntry>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
}

/**
 * Get the path to the auth-profiles.json for a given agent
 */
function getAuthProfilesPath(agentId = 'main'): string {
  return join(homedir(), '.openclaw', 'agents', agentId, 'agent', AUTH_PROFILE_FILENAME);
}

/**
 * Read existing auth profiles store, or create an empty one
 */
function readAuthProfiles(agentId = 'main'): AuthProfilesStore {
  const filePath = getAuthProfilesPath(agentId);
  
  try {
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as AuthProfilesStore;
      // Validate basic structure
      if (data.version && data.profiles && typeof data.profiles === 'object') {
        return data;
      }
    }
  } catch (error) {
    console.warn('Failed to read auth-profiles.json, creating fresh store:', error);
  }
  
  return {
    version: AUTH_STORE_VERSION,
    profiles: {},
  };
}

/**
 * Write auth profiles store to disk
 */
function writeAuthProfiles(store: AuthProfilesStore, agentId = 'main'): void {
  const filePath = getAuthProfilesPath(agentId);
  const dir = join(filePath, '..');
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Save a provider API key to OpenClaw's auth-profiles.json
 * This writes the key in the format OpenClaw expects so the gateway
 * can use it for AI provider calls.
 * 
 * @param provider - Provider type (e.g., 'anthropic', 'openrouter', 'openai', 'google')
 * @param apiKey - The API key to store
 * @param agentId - Agent ID (defaults to 'main')
 */
export function saveProviderKeyToOpenClaw(
  provider: string,
  apiKey: string,
  agentId = 'main'
): void {
  const store = readAuthProfiles(agentId);
  
  // Profile ID follows OpenClaw convention: <provider>:default
  const profileId = `${provider}:default`;
  
  // Upsert the profile entry
  store.profiles[profileId] = {
    type: 'api_key',
    provider,
    key: apiKey,
  };
  
  // Update order to include this profile
  if (!store.order) {
    store.order = {};
  }
  if (!store.order[provider]) {
    store.order[provider] = [];
  }
  if (!store.order[provider].includes(profileId)) {
    store.order[provider].push(profileId);
  }
  
  // Set as last good
  if (!store.lastGood) {
    store.lastGood = {};
  }
  store.lastGood[provider] = profileId;
  
  writeAuthProfiles(store, agentId);
  console.log(`Saved API key for provider "${provider}" to OpenClaw auth-profiles (agent: ${agentId})`);
}

/**
 * Map ClawDesk provider type → all profile ID prefixes used in auth-profiles.json.
 * Google OAuth uses "google-gemini-cli" as the provider name in OpenClaw,
 * which differs from the ClawDesk type "google".
 */
const PROVIDER_PROFILE_PREFIXES: Record<string, string[]> = {
  google: ['google', 'google-gemini-cli'],
};

/**
 * Remove a provider's API key and OAuth credentials from OpenClaw auth-profiles.json.
 * Handles both API-key profiles (`provider:default`) and OAuth profiles that may
 * use a different prefix (e.g. `google-gemini-cli:email@example.com`).
 */
export function removeProviderKeyFromOpenClaw(
  provider: string,
  agentId = 'main'
): void {
  const store = readAuthProfiles(agentId);

  // All prefixes to match for this provider type
  const prefixes = PROVIDER_PROFILE_PREFIXES[provider] || [provider];

  // Remove all profiles whose key starts with any matching prefix
  for (const key of Object.keys(store.profiles)) {
    if (prefixes.some((prefix) => key === `${prefix}:default` || key.startsWith(`${prefix}:`))) {
      delete store.profiles[key];
    }
  }

  // Clean up order and lastGood for all prefixes
  for (const prefix of prefixes) {
    if (store.order?.[prefix]) {
      delete store.order[prefix];
    }
    if (store.lastGood?.[prefix]) {
      delete store.lastGood[prefix];
    }
  }

  writeAuthProfiles(store, agentId);
  console.log(`Removed credentials for provider "${provider}" (prefixes: ${prefixes.join(', ')}) from OpenClaw auth-profiles (agent: ${agentId})`);

  // Also clean up auth.json (written by OpenClaw gateway for OAuth providers)
  const authJsonPath = join(homedir(), '.openclaw', 'agents', agentId, 'agent', 'auth.json');
  try {
    if (existsSync(authJsonPath)) {
      const raw = readFileSync(authJsonPath, 'utf-8');
      const authData = JSON.parse(raw) as Record<string, unknown>;
      let authChanged = false;
      for (const prefix of prefixes) {
        if (authData[prefix]) {
          delete authData[prefix];
          authChanged = true;
        }
      }
      if (authChanged) {
        writeFileSync(authJsonPath, JSON.stringify(authData, null, 2), 'utf-8');
        console.log(`Removed credentials for provider "${provider}" from auth.json`);
      }
    }
  } catch (err) {
    console.warn('Failed to clean up auth.json:', err);
  }
}

/**
 * Remove a provider's configuration from ~/.openclaw/openclaw.json.
 * Cleans up models.providers[type] and agents.defaults.model if it references this provider.
 */
export function removeProviderFromOpenClawConfig(provider: string): void {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');

  let config: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch {
    return; // Nothing to clean up
  }

  let changed = false;

  // Remove models.providers[provider] entry
  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, unknown> | undefined;
  if (providers?.[provider]) {
    delete providers[provider];
    changed = true;
    console.log(`Removed models.providers.${provider} from openclaw.json`);
  }

  // Clear agents.defaults.model if it references this provider
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const modelCfg = defaults?.model as { primary?: string } | undefined;
  if (modelCfg?.primary) {
    // Also check google-gemini-cli prefix for Google provider
    const prefixes = PROVIDER_PROFILE_PREFIXES[provider] || [provider];
    if (prefixes.some((p) => modelCfg.primary!.startsWith(`${p}/`))) {
      delete defaults!.model;
      changed = true;
      console.log(`Cleared agents.defaults.model (was ${modelCfg.primary}) from openclaw.json`);
    }
  }

  if (changed) {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

/**
 * Build environment variables object with all stored API keys
 * for passing to the Gateway process
 */
export function buildProviderEnvVars(providers: Array<{ type: string; apiKey: string }>): Record<string, string> {
  const env: Record<string, string> = {};
  
  for (const { type, apiKey } of providers) {
    const envVar = getProviderEnvVar(type);
    if (envVar && apiKey) {
      env[envVar] = apiKey;
    }
  }
  
  return env;
}

/**
 * Update the OpenClaw config to use the given provider and model
 * Writes to ~/.openclaw/openclaw.json
 *
 * @param provider - Provider type (e.g. 'anthropic', 'siliconflow')
 * @param modelOverride - Optional model string to use instead of the registry default.
 *   For siliconflow this is the user-supplied model ID prefixed with "siliconflow/".
 */
export function setOpenClawDefaultModel(provider: string, modelOverride?: string): void {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  
  let config: Record<string, unknown> = {};
  
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('Failed to read openclaw.json, creating fresh config:', err);
  }
  
  const model = modelOverride || getProviderDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const modelId = model.startsWith(`${provider}/`)
    ? model.slice(provider.length + 1)
    : model;
  
  // Set the default model for the agents
  // model must be an object: { primary: "provider/model", fallbacks?: [] }
  const agents = (config.agents || {}) as Record<string, unknown>;
  const defaults = (agents.defaults || {}) as Record<string, unknown>;
  defaults.model = { primary: model };
  // Ensure bootstrap files (BOOTSTRAP.md etc.) are created in the workspace.
  // OpenClaw's --dev mode sets skipBootstrap: true by default; override it.
  defaults.skipBootstrap = false;
  agents.defaults = defaults;
  config.agents = agents;

  // Configure models.providers for providers that need explicit registration.
  // Built-in providers (anthropic, google) are part of OpenClaw's pi-ai catalog
  // and must NOT have a models.providers entry — it would override the built-in.
  const providerCfg = getProviderConfig(provider);
  if (providerCfg) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[provider] && typeof providers[provider] === 'object'
        ? (providers[provider] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const registryModels = (providerCfg.models ?? []).map((m) => ({ ...m })) as Array<Record<string, unknown>>;

    const mergedModels = [...registryModels];
    for (const item of existingModels) {
      const id = typeof item?.id === 'string' ? item.id : '';
      if (id && !mergedModels.some((m) => m.id === id)) {
        mergedModels.push(item);
      }
    }
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    providers[provider] = {
      ...existingProvider,
      baseUrl: providerCfg.baseUrl,
      api: providerCfg.api,
      apiKey: `\${${providerCfg.apiKeyEnv}}`,
      models: mergedModels,
    };
    console.log(`Configured models.providers.${provider} with baseUrl=${providerCfg.baseUrl}, model=${modelId}`);
    
    models.providers = providers;
    config.models = models;
  } else {
    // Built-in provider: remove any stale models.providers entry that may
    // have been written by an earlier version. Leaving it in place would
    // override the native pi-ai catalog and can break streaming/auth.
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;
    if (providers[provider]) {
      delete providers[provider];
      console.log(`Removed stale models.providers.${provider} (built-in provider)`);
      models.providers = providers;
      config.models = models;
    }
  }
  
  // Ensure gateway mode is set
  const gateway = (config.gateway || {}) as Record<string, unknown>;
  if (!gateway.mode) {
    gateway.mode = 'local';
  }
  config.gateway = gateway;
  
  // Ensure directory exists
  const dir = join(configPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`Set OpenClaw default model to "${model}" for provider "${provider}"`);
}

interface RuntimeProviderConfigOverride {
  baseUrl?: string;
  api?: string;
  apiKeyEnv?: string;
}

/**
 * Update OpenClaw model + provider config using runtime config values.
 * Useful for user-configurable providers (custom/ollama-like) where
 * baseUrl/model are not in the static registry.
 */
export function setOpenClawDefaultModelWithOverride(
  provider: string,
  modelOverride: string | undefined,
  override: RuntimeProviderConfigOverride
): void {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');

  let config: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('Failed to read openclaw.json, creating fresh config:', err);
  }

  const model = modelOverride || getProviderDefaultModel(provider);
  if (!model) {
    console.warn(`No default model mapping for provider "${provider}"`);
    return;
  }

  const modelId = model.startsWith(`${provider}/`)
    ? model.slice(provider.length + 1)
    : model;

  const agents = (config.agents || {}) as Record<string, unknown>;
  const defaults = (agents.defaults || {}) as Record<string, unknown>;
  defaults.model = { primary: model };
  defaults.skipBootstrap = false;
  agents.defaults = defaults;
  config.agents = agents;

  if (override.baseUrl && override.api) {
    const models = (config.models || {}) as Record<string, unknown>;
    const providers = (models.providers || {}) as Record<string, unknown>;

    const existingProvider =
      providers[provider] && typeof providers[provider] === 'object'
        ? (providers[provider] as Record<string, unknown>)
        : {};

    const existingModels = Array.isArray(existingProvider.models)
      ? (existingProvider.models as Array<Record<string, unknown>>)
      : [];
    const mergedModels = [...existingModels];
    if (modelId && !mergedModels.some((m) => m.id === modelId)) {
      mergedModels.push({ id: modelId, name: modelId });
    }

    const nextProvider: Record<string, unknown> = {
      ...existingProvider,
      baseUrl: override.baseUrl,
      api: override.api,
      models: mergedModels,
    };
    if (override.apiKeyEnv) {
      nextProvider.apiKey = `\${${override.apiKeyEnv}}`;
    }

    providers[provider] = nextProvider;
    models.providers = providers;
    config.models = models;
  }

  const gateway = (config.gateway || {}) as Record<string, unknown>;
  if (!gateway.mode) {
    gateway.mode = 'local';
  }
  config.gateway = gateway;

  const dir = join(configPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(
    `Set OpenClaw default model to "${model}" for provider "${provider}" (runtime override)`
  );
}

// Re-export for backwards compatibility
export { getProviderEnvVar } from './provider-registry';
