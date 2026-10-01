import React from 'react';
import { LockKeyhole } from 'lucide-react';

const AccessRestrictedScreen: React.FC = () => (
  <div className="min-h-screen bg-[#05070a] text-zinc-100 flex items-center justify-center p-6">
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0d12] p-7 text-center shadow-2xl">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-white/[.03]">
        <LockKeyhole className="h-8 w-8 text-zinc-300" />
      </div>
      <div className="mt-6 text-[10px] font-bold uppercase tracking-[.24em] text-zinc-600">System Status</div>
      <h1 className="mt-2 text-2xl font-black tracking-tight text-white">Access Temporarily Restricted</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-400">This module is currently unavailable.</p>
      <p className="mt-1 text-sm leading-6 text-zinc-500">Awaiting system synchronization.</p>
      <div className="mt-6 rounded-lg border border-white/[.06] bg-black/20 px-3 py-2 text-[10px] uppercase tracking-[.16em] text-zinc-600">
        Access service unavailable
      </div>
    </div>
  </div>
);

export default AccessRestrictedScreen;
