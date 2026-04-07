import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { RESPONSIBILITY_TEXT } from '@/data/deliveries';
import { formatDate } from '@/lib/calculations';

const EntregaImpressaoPage: React.FC = () => {
  const { companies, employees, deliveries } = useApp();
  const [searchParams] = useSearchParams();
  const deliveryId = searchParams.get('id') || '';

  // Try context first, then sessionStorage fallback (new tab has empty state)
  const { delivery, emp, company } = useMemo(() => {
    const ctxDelivery = deliveries.find(d => d.id === deliveryId);
    if (ctxDelivery) {
      return {
        delivery: ctxDelivery,
        emp: employees.find(e => e.id === ctxDelivery.employeeId),
        company: companies.find(c => c.id === ctxDelivery.companyId),
      };
    }
    // Fallback: read from sessionStorage
    try {
      const raw = sessionStorage.getItem('topac_print_delivery');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.delivery?.id === deliveryId) {
          return { delivery: parsed.delivery, emp: parsed.employee, company: parsed.company };
        }
      }
    } catch { /* ignore */ }
    return { delivery: null, emp: null, company: null };
  }, [deliveryId, deliveries, employees, companies]);

  if (!delivery) return <div className="p-10 text-center text-lg">Ficha não encontrada.</div>;
  if (!emp || !company) return <div className="p-10 text-center">Dados incompletos.</div>;

  const title = delivery.type === 'epi' ? 'FICHA DE ENTREGA DE EPI' : 'FICHA DE ENTREGA DE UNIFORMES';

  return (
    <div className="bg-white text-black min-h-screen print:bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div className="print:hidden flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
        <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/epi'}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          ← Voltar
        </button>
        <button onClick={() => window.print()}
          className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
          🖨 Imprimir / PDF
        </button>
      </div>
      <div className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
        {/* Header */}
        <div className="border-b-2 border-black pb-3 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-lg font-bold">{company.name}</h1>
              <p className="text-xs text-gray-600">CNPJ: {company.cnpj}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs">Data: {formatDate(delivery.date)}</p>
              <p className="text-xs">Emissão: {formatDate(new Date().toISOString())}</p>
            </div>
          </div>
        </div>

        {/* Employee data */}
        <div className="border border-gray-400 rounded p-3 mb-4">
          <p className="text-[9px] uppercase text-gray-500 mb-2 font-bold">DADOS DO COLABORADOR</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div><span className="text-gray-500">Nome:</span> <strong>{emp.name}</strong></div>
            <div><span className="text-gray-500">Função:</span> {emp.cargo}</div>
            <div><span className="text-gray-500">CPF:</span> {emp.cpf}</div>
            <div><span className="text-gray-500">Matrícula:</span> {emp.registro || '—'}</div>
            <div><span className="text-gray-500">Empresa:</span> {company.name}</div>
            <div><span className="text-gray-500">Unidade:</span> {company.city}</div>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full border-collapse mb-4" style={{ fontSize: '10px' }}>
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-2 py-1 text-left">Item</th>
              {delivery.type === 'epi' && <th className="border border-gray-400 px-2 py-1 text-left">CA</th>}
              <th className="border border-gray-400 px-2 py-1 text-left">Descrição</th>
              <th className="border border-gray-400 px-2 py-1 text-center">Tamanho</th>
              <th className="border border-gray-400 px-2 py-1 text-center">Qtd</th>
            </tr>
          </thead>
          <tbody>
            {delivery.items.map((item, i) => (
              <tr key={i} className="even:bg-gray-50">
                <td className="border border-gray-300 px-2 py-1">{item.tipo}</td>
                {delivery.type === 'epi' && <td className="border border-gray-300 px-2 py-1">{item.ca || '—'}</td>}
                <td className="border border-gray-300 px-2 py-1">{item.descricao || '—'}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.tamanho || '—'}</td>
                <td className="border border-gray-300 px-2 py-1 text-center">{item.quantidade}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Responsibility text */}
        <div className="border border-gray-400 rounded p-3 mb-6">
          <p className="text-[9px] uppercase text-gray-500 mb-1 font-bold">TERMO DE RESPONSABILIDADE</p>
          <p className="text-xs leading-relaxed text-justify">{RESPONSIBILITY_TEXT}</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-16 mt-16">
          <div className="text-center">
            <div className="border-t border-black pt-1">
              <p className="text-xs font-bold">{emp.name}</p>
              <p className="text-[9px] text-gray-500">Colaborador</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-black pt-1">
              <p className="text-xs font-bold">{delivery.responsavel}</p>
              <p className="text-[9px] text-gray-500">Responsável pela Entrega</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 pt-3 border-t border-gray-400 text-center text-[9px] text-gray-500">
          ImplantaRH ConsultoriaPRO — Topac RH Multiempresa PRO — Documento gerado em {formatDate(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
};

export default EntregaImpressaoPage;
