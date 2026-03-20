// Supreme Raman AI — Zustand Store
import { create } from 'zustand';
import { getDesktopApi } from '@/lib/electron';
import type { WorkspaceSecurityState } from '@/lib/electron';
import type {
  AgentMode,
  OllamaRuntimeStatus,
  PrismProviderOverrideSettings,
  ProviderAuthProfile,
  ProviderId
} from '@supreme/shared';
import { useWorkspaceStore } from './workspace-store';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type RemoteProviderId = Exclude<ProviderId, 'ollama'>;
export type SettingsSection = 'runtime' | 'providers' | 'agents' | 'prism';

export interface SaveProviderProfileInput {
  id?: string;
  provider: RemoteProviderId;
  label: string;
  description?: string;
  apiKey?: string;
  token?: string;
  isDefault?: boolean;
}

export interface SettingsStoreState {
  providerProfiles: ProviderAuthProfile[];
  providerSelections: Record<RemoteProviderId, string | null>;
  prismOverride: PrismProviderOverrideSettings | null;
  workspaceSecurity: WorkspaceSecurityState | null;
  agentMode: AgentMode;
  ollamaStatus: OllamaRuntimeStatus | null;
  loading: boolean;
  activeSection: SettingsSection;
  refreshSecurityState: () => Promise<WorkspaceSecurityState>;
  refreshSettings: () => Promise<void>;
  setActiveSection: (section: SettingsSection) => void;
  saveProviderProfile: (input: SaveProviderProfileInput) => Promise<void>;
  deleteProviderProfile: (profile: ProviderAuthProfile) => Promise<void>;
  testProviderProfile: (profile: ProviderAuthProfile, probeWithRuntime?: boolean) => Promise<void>;
  installDefaultModels: () => Promise<void>;
  savePrismOverride: (override: PrismProviderOverrideSettings | null) => Promise<void>;
  saveAgentMode: (mode: AgentMode) => Promise<void>;
  setProviderSelection: (provider: RemoteProviderId, profileId: string | null) => Promise<void>;
  enableWorkspaceEncryption: (password: string) => Promise<void>;
  disableWorkspaceEncryption: (password: string) => Promise<void>;
}

const EMPTY_PROVIDER_SELECTIONS: Record<RemoteProviderId, string | null> = {
  openai: null,
  anthropic: null,
  google: null
};

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  providerProfiles: [],
  providerSelections: { ...EMPTY_PROVIDER_SELECTIONS },
  prismOverride: null,
  workspaceSecurity: null,
  agentMode: 'auto',
  ollamaStatus: null,
  loading: false,
  activeSection: 'runtime',
  async refreshSecurityState() {
    const security = await getDesktopApi().security.getState();
    set({ workspaceSecurity: security });
    return security;
  },
  async refreshSettings() {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      const api = getDesktopApi();
      const [providerProfiles, ollamaStatus, openaiSelection, anthropicSelection, googleSelection, prismOverride, agentMode, workspaceSecurity] =
        await Promise.all([
          api.settings.listProviderProfiles(),
          api.settings.getOllamaStatus(),
          api.settings.getProviderSelection('openai'),
          api.settings.getProviderSelection('anthropic'),
          api.settings.getProviderSelection('google'),
          api.settings.getPrismOverride(),
          api.settings.getAgentMode(),
          api.security.getState()
        ]);

      set({
        providerProfiles,
        providerSelections: {
          openai: openaiSelection?.profileId ?? null,
          anthropic: anthropicSelection?.profileId ?? null,
          google: googleSelection?.profileId ?? null
        },
        prismOverride,
        workspaceSecurity,
        agentMode: agentMode ?? 'auto',
        ollamaStatus,
        loading: false
      });
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  setActiveSection(activeSection) {
    if (get().activeSection === activeSection) {
      return;
    }

    set({ activeSection });
  },
  async saveProviderProfile(input) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      await getDesktopApi().settings.saveProviderProfile(input);
      await get().refreshSettings();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(`Saved ${input.provider} profile ${input.label}.`);
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async deleteProviderProfile(profile) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    if (profile.provider === 'ollama') {
      workspaceStore.setError('Ollama profiles cannot be deleted because they do not use remote credentials.');
      set({ loading: false });
      return;
    }

    try {
      await getDesktopApi().settings.deleteProviderProfile({
        provider: profile.provider,
        profileId: profile.id
      });
      await get().refreshSettings();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(`Deleted ${profile.label}.`);
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async testProviderProfile(profile, probeWithRuntime = false) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    if (profile.provider === 'ollama') {
      workspaceStore.setError('Ollama profiles do not support remote authentication tests.');
      set({ loading: false });
      return;
    }

    try {
      const result = await getDesktopApi().settings.testProviderProfile({
        provider: profile.provider,
        profileId: profile.id,
        ...(probeWithRuntime ? { probeWithRuntime: true } : {})
      });

      if (result.ok) {
        workspaceStore.setNotice(result.message);
      } else {
        workspaceStore.setError(result.message);
      }

      set({ loading: false });
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async installDefaultModels() {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      const ollamaStatus = await getDesktopApi().settings.installDefaultModels();

      set({
        ollamaStatus,
        loading: false
      });

      await workspaceStore.refreshSnapshot();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice('Requested installation of the default local models.');
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async savePrismOverride(prismOverride) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      await getDesktopApi().settings.savePrismOverride(prismOverride);
      await get().refreshSettings();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(prismOverride ? 'Saved Prism settings.' : 'Cleared Prism settings.');
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async saveAgentMode(mode) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      await getDesktopApi().settings.saveAgentMode(mode);
      set({ agentMode: mode, loading: false });
      await workspaceStore.refreshSnapshot();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(`Runtime mode set to ${mode}.`);
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async setProviderSelection(provider, profileId) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      await getDesktopApi().settings.setProviderSelection({ provider, profileId });
      await get().refreshSettings();
      if (useWorkspaceStore.getState().error === null) {
        workspaceStore.setNotice(
          profileId ? `Selected active ${provider} profile.` : `Cleared ${provider} profile selection.`
        );
      }
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async enableWorkspaceEncryption(password) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      const security = await getDesktopApi().security.enable(password);
      set({ workspaceSecurity: security, loading: false });
      await workspaceStore.refreshSnapshot();
      workspaceStore.setNotice('Workspace encryption enabled.');
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  },
  async disableWorkspaceEncryption(password) {
    const workspaceStore = useWorkspaceStore.getState();

    set({ loading: true });
    workspaceStore.clearError();

    try {
      const security = await getDesktopApi().security.disable(password);
      set({ workspaceSecurity: security, loading: false });
      await workspaceStore.refreshSnapshot();
      workspaceStore.setNotice('Workspace encryption disabled.');
    } catch (error) {
      workspaceStore.setError(getErrorMessage(error));
      set({ loading: false });
    }
  }
}));
