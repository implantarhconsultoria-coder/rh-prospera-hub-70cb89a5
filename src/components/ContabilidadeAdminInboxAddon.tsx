import { Mail } from 'lucide-react';

export default function ContabilidadeAdminInboxAddon() {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = '/admin/central-contabilidade?emails=1';
      }}
      className="no-print fixed bottom-5 left-[292px] z-[45] flex items-center gap-2 rounded-full border border-[#6d28d9] bg-[#100918] px-4 py-3 text-sm font-semibold text-white shadow-lg"
      title="Central de E-mails RH"
    >
      <Mail className="h-5 w-5 text-[#f4b400]" />
      <span>Central de E-mails RH</span>
    </button>
  );
}
