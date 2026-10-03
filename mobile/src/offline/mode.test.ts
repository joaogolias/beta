import { describe, expect, it, vi } from 'vitest';
import { hasNoInternet, OfflineMode } from './mode';

function setup(initial = false, memory = { dismissed: false }) {
  let persisted = initial;
  const synchronize = vi.fn(async () => {});
  const canConnect = vi.fn(() => true);
  const write = vi.fn(async (offline: boolean) => {
    persisted = offline;
  });
  const dependencies = {
    read: async () => persisted,
    write,
    synchronize,
    canConnect,
    promptMemory: memory,
  };
  return {
    controller: new OfflineMode(dependencies),
    dependencies,
    synchronize,
    canConnect,
    write,
  };
}

describe('explicit offline study mode', () => {
  it('stops even manual synchronization while entering offline and persisting the choice', async () => {
    const { controller, write } = setup();
    let finish!: () => void;
    write.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await controller.load();
    const entering = controller.setOfflineMode(true);
    expect(controller.canSynchronize()).toBe(false);
    expect(controller.canSynchronize(true)).toBe(false);
    finish();
    await entering;
    expect(controller.canSynchronize(true)).toBe(false);
  });
  it('prompts on lost internet without entering offline or inferring loss from unknown network state', async () => {
    const { controller } = setup();
    expect(hasNoInternet({})).toBe(false);
    expect(
      hasNoInternet({ isConnected: true, isInternetReachable: false }),
    ).toBe(true);
    expect(hasNoInternet({ isConnected: false })).toBe(true);
    await controller.load();
    controller.networkChanged(true);
    expect(controller.getSnapshot()).toMatchObject({
      offlineMode: false,
      promptVisible: true,
    });
    controller.networkChanged(false);
    expect(controller.getSnapshot().promptVisible).toBe(false);
  });
  it('does not invite again after refusal in the same process, but permits manual entry', async () => {
    const memory = { dismissed: false };
    const { controller, dependencies } = setup(false, memory);
    await controller.load();
    controller.networkChanged(true);
    controller.dismissPrompt();
    controller.networkChanged(false);
    controller.networkChanged(true);
    expect(controller.getSnapshot().promptVisible).toBe(false);
    const remounted = new OfflineMode(dependencies);
    await remounted.load();
    remounted.networkChanged(true);
    expect(remounted.getSnapshot()).toMatchObject({
      promptVisible: false,
      promptDismissed: true,
    });
    await remounted.setOfflineMode(true);
    expect(remounted.getSnapshot().offlineMode).toBe(true);
    const restarted = setup(false).controller;
    await restarted.load();
    restarted.networkChanged(true);
    expect(restarted.getSnapshot().promptVisible).toBe(true);
  });
  it('persists accepted mode and never syncs or exits because connectivity returns', async () => {
    const { controller, dependencies, synchronize } = setup();
    await controller.load();
    controller.networkChanged(true);
    await controller.setOfflineMode(true);
    controller.networkChanged(false);
    expect(controller.canSynchronize()).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      offlineMode: true,
      promptVisible: false,
    });
    expect(synchronize).not.toHaveBeenCalled();
    const reopened = new OfflineMode(dependencies);
    await reopened.load();
    expect(reopened.getSnapshot().offlineMode).toBe(true);
    expect(reopened.canSynchronize()).toBe(false);
  });
  it('exits only after a successful user-requested sync', async () => {
    const { controller, synchronize, write } = setup(true);
    let finish!: () => void;
    synchronize.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await controller.load();
    const leaving = controller.setOfflineMode(false);
    expect(controller.getSnapshot()).toMatchObject({
      switchingMode: true,
      offlineMode: true,
    });
    expect(controller.canSynchronize()).toBe(false);
    expect(controller.canSynchronize(true)).toBe(true);
    expect(write).not.toHaveBeenCalled();
    finish();
    await leaving;
    expect(controller.getSnapshot()).toMatchObject({
      switchingMode: false,
      offlineMode: false,
    });
    expect(write).toHaveBeenCalledWith(false);
  });
  it('keeps offline preference and pending work when sync fails or there is no internet', async () => {
    const { controller, synchronize, canConnect, write } = setup(true);
    await controller.load();
    canConnect.mockReturnValue(false);
    await expect(controller.setOfflineMode(false)).rejects.toThrow(
      'Conecte-se',
    );
    expect(synchronize).not.toHaveBeenCalled();
    canConnect.mockReturnValue(true);
    synchronize.mockRejectedValue(new Error('Há uma pendência de estudo.'));
    await expect(controller.setOfflineMode(false)).rejects.toThrow('pendência');
    expect(controller.getSnapshot()).toMatchObject({
      offlineMode: true,
      switchingMode: false,
    });
    expect(write).not.toHaveBeenCalled();
  });
  it('fails closed until persisted mode can be read and rolls back a failed preference write', async () => {
    const { controller, dependencies, write } = setup();
    expect(controller.canSynchronize()).toBe(false);
    dependencies.read = vi.fn().mockRejectedValue(new Error('storage'));
    await controller.load();
    expect(controller.canSynchronize()).toBe(false);
    dependencies.read = async () => false;
    await controller.load();
    write.mockRejectedValue(new Error('storage'));
    await expect(controller.setOfflineMode(true)).rejects.toThrow('storage');
    expect(controller.getSnapshot()).toMatchObject({
      offlineMode: false,
      switchingMode: false,
    });
  });
});
