// Lightweight runtime registry for coordinating multiple widget instances on a page.
// Responsibilities:
// - track live instances and their DOM containers
// - namespaced event bus for instance-scoped events
// - simple z-index stacking and open/close coordination policies

type InstanceState = 'collapsed' | 'expanded';

export type InstanceRef = {
  instanceId: string;
  clientId?: string;
  agentId?: string;
  container?: HTMLElement | null;
  metadata?: Record<string, unknown>;
  state?: InstanceState;
};

const instances = new Map<string, InstanceRef>();
let zStack: string[] = [];

type GlobalPolicy = {
  allowMultipleExpanded: boolean;
  baseZ: number;
};

let globalPolicy: GlobalPolicy = { allowMultipleExpanded: true, baseZ: 1000 };

const bus = new EventTarget();

export function on(eventName: string, handler: EventListener) {
  bus.addEventListener(eventName, handler);
}

export function off(eventName: string, handler: EventListener) {
  bus.removeEventListener(eventName, handler);
}

export function emit(eventName: string, detail: unknown) {
  bus.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function registerInstance(ref: InstanceRef) {
  // If an instance with the same id already exists, replace it and avoid
  // duplicating entries in the z-order stack.
  if (instances.has(ref.instanceId)) {
    // replace stored ref
    instances.set(ref.instanceId, ref);
    // remove any previous zStack entry for this id
    zStack = zStack.filter((id) => id !== ref.instanceId);
  } else {
    instances.set(ref.instanceId, ref);
  }

  zStack.push(ref.instanceId);
  emit('widget:register', { instanceId: ref.instanceId, ref });
  computeZIndices();
  return ref.instanceId;
}

export function deregisterInstance(instanceId: string) {
  const ref = instances.get(instanceId);
  instances.delete(instanceId);
  zStack = zStack.filter((id) => id !== instanceId);
  emit('widget:deregister', { instanceId, ref });
  computeZIndices();
}

export function getInstance(instanceId: string) {
  return instances.get(instanceId) ?? null;
}

export function listInstances() {
  return Array.from(instances.values());
}

export function setGlobalPolicy(p: Partial<GlobalPolicy>) {
  globalPolicy = { ...globalPolicy, ...p };
  computeZIndices();
}

function computeZIndices() {
  zStack.forEach((id, idx) => {
    const ref = instances.get(id);
    if (ref && ref.container) {
      try {
        // Defensive: some containers may come from other documents/iframes
        // or be detached; guard DOM mutations accordingly.
        const c = ref.container;
        if (c && c.ownerDocument === document && c.style) {
          (c.style as any).zIndex = String(globalPolicy.baseZ + idx);
        }
      } catch (err) {
        // ignore DOM mutation errors
      }
    }
  });
}

function bringToFront(instanceId: string) {
  zStack = zStack.filter((id) => id !== instanceId);
  zStack.push(instanceId);
  computeZIndices();
  emit('widget:bringToFront', { instanceId });
}

export function open(instanceId: string, opts?: { minimizeOthers?: boolean }) {
  const inst = instances.get(instanceId);
  if (!inst) return;
  const minimizeOthers = opts?.minimizeOthers ?? !globalPolicy.allowMultipleExpanded;
  if (minimizeOthers) {
    for (const [id, other] of instances.entries()) {
      if (id !== instanceId && other.state === 'expanded') {
        other.state = 'collapsed';
        if (other.container) {
          try { other.container.dataset.widgetState = 'collapsed'; } catch { /* ignore */ }
        }
        emit('widget:state', { instanceId: id, state: 'collapsed' });
      }
    }
  }
  inst.state = 'expanded';
  if (inst.container) {
    try { inst.container.dataset.widgetState = 'expanded'; } catch { /* ignore */ }
  }
  bringToFront(instanceId);
  emit('widget:state', { instanceId, state: 'expanded' });
}

export function close(instanceId: string) {
  const inst = instances.get(instanceId);
  if (!inst) return;
  inst.state = 'collapsed';
  if (inst.container) {
    try { inst.container.dataset.widgetState = 'collapsed'; } catch { /* ignore */ }
  }
  emit('widget:state', { instanceId, state: 'collapsed' });
}

export function toggle(instanceId: string) {
  const inst = instances.get(instanceId);
  if (!inst) return;
  if (inst.state === 'expanded') close(instanceId);
  else open(instanceId);
}

export function sendEvent(instanceId: string, eventName: string, payload?: unknown) {
  // emit namespaced event; listeners may filter by detail.instanceId
  emit(`widget:event:${eventName}`, { instanceId, payload });
}

export function onForInstance(instanceId: string, eventName: string, handler: (detail: any) => void) {
  const wrapped = (e: Event) => {
    const ce = e as CustomEvent;
    if (!ce?.detail) return;
    if (ce.detail.instanceId === instanceId) handler(ce.detail);
  };
  bus.addEventListener(eventName, wrapped);
  return () => bus.removeEventListener(eventName, wrapped);
}

// Convenience: generate a simple instance id
export function makeInstanceId(clientId?: string, agentId?: string) {
  const base = `${clientId ?? 'c'}-${agentId ?? 'a'}`;
  const rand = Math.random().toString(36).slice(2, 9);
  return `${base}-${rand}`;
}
