import React from 'react';
import { Monitor, Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cn } from '@/lib/utils';

type Props = {
  compact?: boolean;
};

const LayoutModeToggle: React.FC<Props> = ({ compact = false }) => {
  const { layoutMode, updateLayoutMode } = useApp();
  const isPremium = layoutMode === 'premium';

  return (
    <button
      type="button"
      onClick={() => updateLayoutMode(isPremium ? 'original' : 'premium')}
      className={cn(
        'inline-flex items-center rounded-full border border-emerald-400/30 bg-background/60 text-xs font-semibold text-foreground transition hover:border-emerald-300/60',
        compact ? 'gap-2 px-3 py-2' : 'gap-2 px-3 py-1.5',
      )}
      title={isPremium ? 'Alternar para Layout Original' : 'Alternar para Layout Premium'}
    >
      {isPremium ? <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> : <Monitor className="h-3.5 w-3.5 text-sky-300" />}
      <span>{isPremium ? 'Premium' : 'Original'}</span>
    </button>
  );
};

export default LayoutModeToggle;
