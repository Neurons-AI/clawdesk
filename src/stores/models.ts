/**
 * Models State Store
 * Fetches and caches the model catalog from the Gateway's models.list RPC.
 * Provides setSelectedModel which patches the session model via sessions.patch.
 */
import { create } from 'zustand';
import { useGatewayStore } from './gateway';

export interface ModelCatalogEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<'text' | 'image'>;
}

interface ModelsState {
  models: ModelCatalogEntry[];
  loading: boolean;
  error: string | null;
  selectedModel: string | null;

  fetchModels: () => Promise<void>;
  setSelectedModel: (modelId: string | null) => void;
  getModelsByProvider: (provider: string) => ModelCatalogEntry[];
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  loading: false,
  error: null,
  selectedModel: null,

  fetchModels: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'models.list',
        {},
      ) as { success: boolean; result?: { models?: ModelCatalogEntry[] }; error?: string };

      if (result.success && result.result?.models) {
        set({ models: result.result.models, loading: false });
      } else {
        set({ models: [], loading: false, error: result.error || 'No models returned' });
      }
    } catch (err) {
      console.warn('Failed to fetch model catalog:', err);
      set({ models: [], loading: false, error: String(err) });
    }
  },

  setSelectedModel: async (modelId) => {
    set({ selectedModel: modelId });

    // Patch the session model on the Gateway via sessions.patch
    try {
      const { useChatStore } = await import('./chat');
      const key = useChatStore.getState().currentSessionKey;
      await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'sessions.patch',
        { key, model: modelId || null },
      );
    } catch (err) {
      console.warn('Failed to patch session model:', err);
    }
  },

  getModelsByProvider: (provider) => {
    return get().models.filter((m) => m.provider === provider);
  },
}));

// Auto-fetch models when gateway transitions to 'running'
let _prevGatewayState: string | undefined;
useGatewayStore.subscribe((state) => {
  const currentState = state.status.state;
  if (currentState === 'running' && _prevGatewayState !== 'running') {
    useModelsStore.getState().fetchModels();
  }
  _prevGatewayState = currentState;
});

// Also check the current state immediately in case gateway is already running
// (subscription only fires on subsequent changes, not the initial state)
const initialState = useGatewayStore.getState().status.state;
if (initialState === 'running') {
  _prevGatewayState = 'running';
  useModelsStore.getState().fetchModels();
}
