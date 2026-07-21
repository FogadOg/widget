/**
 * Unread-message count badge shown on the launcher button.
 *
 * Single source of truth for the badge that previously had four divergent
 * inline implementations across EmbedShell / MinimalEmbedShell (one of which
 * used the forbidden `bg-red-500` ramp). Colour comes from the `--destructive`
 * design token so it adapts to dark / branded widget themes instead of a baked
 * hex value.
 *
 * Variants:
 *  - `prominent` (default): the primary launcher badge — pulsing, white-bordered
 *    circle that grows for 2-digit counts.
 *  - `compact`: a small corner badge for secondary/minimal launchers.
 */
interface UnreadBadgeProps {
  count: number;
  variant?: 'prominent' | 'compact';
}

export function UnreadBadge({ count, variant = 'prominent' }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);

  if (variant === 'compact') {
    return (
      <span
        className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs text-white"
        style={{ backgroundColor: 'var(--destructive)' }}
      >
        {label}
      </span>
    );
  }

  const size = count > 9 ? '24px' : '20px';
  return (
    <span
      className="animate-pulse"
      style={{
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        backgroundColor: 'var(--destructive)',
        color: 'white',
        borderRadius: '50%',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: count > 9 ? '11px' : '12px',
        fontWeight: 'bold',
        border: '2px solid white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      }}
    >
      {label}
    </span>
  );
}
