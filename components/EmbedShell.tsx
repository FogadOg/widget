
'use client';

import type { Props } from './EmbedShell.types';
import MinimalEmbedShell from './layouts/MinimalEmbedShell';
import PanelEmbedShell from './layouts/PanelEmbedShell';

// Dispatches to the runtime-selected layout shell. Kept hook-free so the
// variant branch happens before any hooks run — the classic layout's hooks
// live in ClassicEmbedShell, which only mounts for the 'classic' variant.
import { useClassicShell } from './EmbedShell.useClassicShell';
import { EmbeddedView } from './EmbeddedView';
import { FloatingView } from './FloatingView';

export default function EmbedShell(props: Props) {
  const runtimeLayoutVariant = (props.widgetConfig?.layout_variant ?? 'classic') as 'classic' | 'minimal' | 'panel';
  if (runtimeLayoutVariant === 'minimal') return <MinimalEmbedShell {...props} />;
  if (runtimeLayoutVariant === 'panel') return <PanelEmbedShell {...props} />;
  return <ClassicEmbedShell {...props} />;
}


function ClassicEmbedShell(props: Props) {
  const vm = useClassicShell(props);
  return (
    <>
      {vm.isEmbedded ? <EmbeddedView vm={vm} /> : <FloatingView vm={vm} />}
    </>
  );
}
