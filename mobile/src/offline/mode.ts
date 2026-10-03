export type ModeState = {
  ready: boolean;
  offlineMode: boolean;
  switchingMode: boolean;
  promptVisible: boolean;
  promptDismissed: boolean;
  modeError: string | null;
};

type Dependencies = {
  read: () => Promise<boolean>;
  write: (offline: boolean) => Promise<void>;
  synchronize: () => Promise<void>;
  canConnect: () => boolean;
  promptMemory: { dismissed: boolean };
};

// A refusal belongs to this app process; background/foreground and account
// provider remounts must not bring the invitation back.
const promptMemories = new Map<string, { dismissed: boolean }>();
export function promptMemoryFor(accountKey: string) {
  let memory = promptMemories.get(accountKey);
  if (!memory) {
    memory = { dismissed: false };
    promptMemories.set(accountKey, memory);
  }
  return memory;
}

export function hasNoInternet(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}) {
  return state.isConnected === false || state.isInternetReachable === false;
}

/** User choice controls synchronization; reconnecting the network never does. */
export class OfflineMode {
  private state: ModeState;
  private leavingOffline = false;
  private listeners = new Set<() => void>();
  constructor(private readonly deps: Dependencies) {
    this.state = {
      ready: false,
      offlineMode: false,
      switchingMode: false,
      promptVisible: false,
      promptDismissed: deps.promptMemory.dismissed,
      modeError: null,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ModeState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    try {
      const offlineMode = await this.deps.read();
      this.update({ ready: true, offlineMode, modeError: null });
    } catch {
      // Never start sending a saved journal if its mode preference could not be read.
      this.update({
        modeError: 'Não foi possível abrir suas preferências. Tente novamente.',
      });
    }
  }
  networkChanged(noInternet: boolean) {
    if (
      !this.state.ready ||
      this.state.offlineMode ||
      this.state.switchingMode ||
      this.state.promptDismissed
    )
      return;
    this.update({ promptVisible: noInternet });
  }
  dismissPrompt() {
    this.deps.promptMemory.dismissed = true;
    this.update({ promptVisible: false, promptDismissed: true });
  }
  async setOfflineMode(offlineMode: boolean) {
    if (
      !this.state.ready ||
      this.state.switchingMode ||
      this.state.offlineMode === offlineMode
    )
      return;
    this.leavingOffline = !offlineMode;
    this.update({ switchingMode: true, modeError: null });
    const previous = this.state.offlineMode;
    try {
      if (offlineMode) {
        // Pause automatic sync immediately, before the preference reaches disk.
        this.update({ offlineMode: true });
        await this.deps.write(true);
      } else {
        if (!this.deps.canConnect())
          throw new Error(
            'Conecte-se à internet para sincronizar e sair do modo offline.',
          );
        await this.deps.synchronize();
        if (!this.deps.canConnect())
          throw new Error(
            'A conexão caiu. Seu estudo continua salvo no modo offline.',
          );
        await this.deps.write(false);
        this.update({ offlineMode: false });
      }
      this.update({ promptVisible: false });
    } catch (cause) {
      this.update({
        offlineMode: previous,
        modeError:
          cause instanceof Error
            ? cause.message
            : 'Não foi possível mudar o modo agora. Seu estudo foi preservado.',
      });
      throw cause;
    } finally {
      this.leavingOffline = false;
      this.update({ switchingMode: false });
    }
  }
  canSynchronize(manual = false) {
    return (
      this.state.ready &&
      ((!this.state.offlineMode && !this.state.switchingMode) ||
        (manual && this.leavingOffline))
    );
  }
}
