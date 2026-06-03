import {
  registerInstance,
  deregisterInstance,
  listInstances,
  open,
  close,
  toggle,
  makeInstanceId,
  setGlobalPolicy,
  getInstance,
  sendEvent,
  onForInstance,
  on,
} from '../src/lib/widgetRegistry';

describe('widgetRegistry', () => {
  beforeEach(() => {
    // reset policy to defaults between tests
    setGlobalPolicy({ allowMultipleExpanded: true, baseZ: 1000 });
  });

  test('registers and deregisters instances and lists them', () => {
    const aId = makeInstanceId('c1', 'a1');
    const bId = makeInstanceId('c1', 'a2');

    const aContainer = document.createElement('div');
    const bContainer = document.createElement('div');

    registerInstance({ instanceId: aId, clientId: 'c1', agentId: 'a1', container: aContainer, state: 'collapsed' });
    registerInstance({ instanceId: bId, clientId: 'c1', agentId: 'a2', container: bContainer, state: 'collapsed' });

    const items = listInstances();
    expect(items.find(i => i.instanceId === aId)).toBeTruthy();
    expect(items.find(i => i.instanceId === bId)).toBeTruthy();

    // cleanup
    deregisterInstance(aId);
    deregisterInstance(bId);
    expect(listInstances().find(i => i.instanceId === aId)).toBeUndefined();
    expect(listInstances().find(i => i.instanceId === bId)).toBeUndefined();
  });

  test('open collapses others when policy disallows multiple expanded', () => {
    setGlobalPolicy({ allowMultipleExpanded: false, baseZ: 2000 });

    const aId = makeInstanceId('c2', 'a1');
    const bId = makeInstanceId('c2', 'a2');

    const aContainer = document.createElement('div');
    const bContainer = document.createElement('div');

    registerInstance({ instanceId: aId, clientId: 'c2', agentId: 'a1', container: aContainer, state: 'collapsed' });
    registerInstance({ instanceId: bId, clientId: 'c2', agentId: 'a2', container: bContainer, state: 'collapsed' });

    open(aId);
    expect(getInstance(aId)?.state).toBe('expanded');
    expect(getInstance(bId)?.state).toBe('collapsed');

    // opening B should collapse A
    open(bId);
    expect(getInstance(bId)?.state).toBe('expanded');
    expect(getInstance(aId)?.state).toBe('collapsed');

    // cleanup
    deregisterInstance(aId);
    deregisterInstance(bId);
  });

  test('sendEvent and onForInstance deliver namespaced events', () => {
    const aId = makeInstanceId('c3', 'a1');
    const aContainer = document.createElement('div');
    registerInstance({ instanceId: aId, clientId: 'c3', agentId: 'a1', container: aContainer, state: 'collapsed' });

    const handler = jest.fn();
    const off = onForInstance(aId, 'widget:event:custom', (d) => handler(d));

    // global listener also receives raw detailed payloads
    const globalHandler = jest.fn();
    on('widget:event:custom', (ev) => globalHandler((ev as CustomEvent).detail));

    sendEvent(aId, 'custom', { foo: 'bar' });

    expect(globalHandler).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ instanceId: aId, payload: { foo: 'bar' } }));

    off();
    deregisterInstance(aId);
  });

  test('toggle switches between open and close', () => {
    const id = makeInstanceId('c4', 'a1');
    const container = document.createElement('div');
    registerInstance({ instanceId: id, clientId: 'c4', agentId: 'a1', container, state: 'collapsed' });

    toggle(id);
    expect(getInstance(id)?.state).toBe('expanded');
    toggle(id);
    expect(getInstance(id)?.state).toBe('collapsed');

    deregisterInstance(id);
  });
});
