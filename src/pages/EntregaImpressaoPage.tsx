import React, { useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { RESPONSIBILITY_TEXT, type Delivery } from '@/data/deliveries';
import type { Company } from '@/data/companies';
import type { Employee } from '@/data/employees';
import { formatDate } from '@/lib/calculations';

type DeliveryPreview = Pick<Delivery, 'type' | 'date' | 'items'> & { responsavel?: string };

interface EntregaPreviewData {
  delivery: DeliveryPreview;
  employee: Employee;
  company: Company;
  returnPath?: string;
}

interface EntregaLocationState {
  previewData?: EntregaPreviewData;
}

const EntregaImpressaoPage: React.FC = () => {
  const { companies, employees, deliveries } = useApp();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const deliveryId = searchParams.get('id') || '';
  const previewData = (location.state as EntregaLocationState | null)?.previewData;

  const { delivery, emp, company, returnPath } = useMemo(() => {
    if (previewData?.delivery && previewData.employee && previewData.company) {
      return {
        delivery: previewData.delivery,
        emp: previewData.employee,
        company: previewData.company,
        returnPath: previewData.returnPath || '/epi',
      };
    }

    const ctxDelivery = deliveries.find(d => d.id === deliveryId);
    if (ctxDelivery) {
      return {
        delivery: ctxDelivery,
        emp: employees.find(e => e.id === ctxDelivery.employeeId) || null,
        company: companies.find(c => c.id === ctxDelivery.companyId) || null,
        returnPath: ctxDelivery.type === 'uniforme' ? '/uniformes' : '/epi',
      };
    }

    try {
      const raw = sessionStorage.getItem('topac_print_delivery');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.delivery?.id === deliveryId) {
          return {
            delivery: parsed.delivery,
            emp: parsed.employee,
            company: parsed.company,
            returnPath: parsed.delivery?.type === 'uniforme' ? '/uniformes' : '/epi',
          };
        }
      }
    } catch {
      // ignore
    }

    return { delivery: null, emp: null, company: null, returnPath: '/epi' };
  }, [previewData, deliveryId, deliveries, employees, companies]);

  if (!delivery) return <div className="p-10 text-center text-lg">Documento indisponível. Gere novamente pela tela anterior.</div>;
  if (!emp || !company) return <div className="p-10 text-center">Dados incompletos.</div>;

  const isEpi = delivery.type === 'epi';
  const title = isEpi ? 'FICHA DE ENTREGA DE EPI' : 'FICHA DE ENTREGA DE UNIFORMES';
  const setor = emp.categoria === 'operacional' ? 'Operacional' : 'Sócio';

  return (
    <div className="bg-white text-black min-h-screen print:bg-white" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div className="print:hidden flex items-center gap-3 px-8 py-3 bg-gray-100 border-b">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
              return;
            }
            window.location.assign(returnPath);
          }}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          ← Voltar
        </button>
        <button onClick={() => window.print()}
          className="px-4 py-2 text-sm font-medium bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
          🖨 Imprimir / PDF
        </button>
      </div>
      <div className="max-w-[210mm] mx-auto px-8 py-6 print:px-6 print:py-4" style={{ fontSize: '11px' }}>
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

        {isEpi ? (
          <>
            <div className="border border-gray-400 rounded p-3 mb-4">
              <p className="text-[9px] uppercase text-gray-500 mb-2 font-bold">DADOS DO COLABORADOR</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><span className="text-gray-500">Nome:</span> <strong>{emp.name}</strong></div>
                <div><span className="text-gray-500">Função:</span> {emp.cargo}</div>
                <div><span className="text-gray-500">CPF:</span> {emp.cpf}</div>
                <div><span className="text-gray-500">RG:</span> {emp.rg || '—'}</div>
                <div><span className="text-gray-500">Matrícula:</span> {emp.registro || '—'}</div>
                <div><span className="text-gray-500">Setor:</span> {setor}</div>
                <div><span className="text-gray-500">Empresa:</span> {company.name}</div>
                <div><span className="text-gray-500">CNPJ:</span> {company.cnpj}</div>
                <div><span className="text-gray-500">Unidade:</span> {company.city}</div>
                <div><span className="text-gray-500">Admissão:</span> {emp.dataAdmissao ? formatDate(emp.dataAdmissao) : '—'}</div>
                <div><span className="text-gray-500">Data da Entrega:</span> {formatDate(delivery.date)}</div>
              </div>
            </div>


            <table className="w-full border-collapse mb-4" style={{ fontSize: '10px' }}>
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-gray-400 px-2 py-1 text-left">Item / Descrição</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">CA</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">Tamanho</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">Qtd</th>
                  <th className="border border-gray-400 px-2 py-1 text-left">Observação</th>
                </tr>
              </thead>
              <tbody>
                {delivery.items.map((item, i) => (
                  <tr key={i} className="even:bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1">{item.tipo}{item.descricao ? ` — ${item.descricao}` : ''}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.ca || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.tamanho || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.quantidade}</td>
                    <td className="border border-gray-300 px-2 py-1">{item.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
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

            <table className="w-full border-collapse mb-4" style={{ fontSize: '10px' }}>
              <thead>
                <tr className="bg-gray-200">
                  <th className="border border-gray-400 px-2 py-1 text-left">Item</th>
                  <th className="border border-gray-400 px-2 py-1 text-left">Descrição</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">Tamanho</th>
                  <th className="border border-gray-400 px-2 py-1 text-center">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {delivery.items.map((item, i) => (
                  <tr key={i} className="even:bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1">{item.tipo}</td>
                    <td className="border border-gray-300 px-2 py-1">{item.descricao || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.tamanho || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="border border-gray-400 rounded p-3 mb-6">
          <p className="text-[9px] uppercase text-gray-500 mb-1 font-bold">TERMO DE RESPONSABILIDADE</p>
          <p className="text-xs leading-relaxed text-justify">{RESPONSIBILITY_TEXT}</p>
        </div>

        <div className="grid grid-cols-2 gap-16 mt-16">
          <div className="text-center">
            <div className="border-t border-black pt-1">
              <p className="text-xs font-bold">{emp.name}</p>
              <p className="text-[9px] text-gray-500">Colaborador</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-black pt-1">
              <p className="text-xs font-bold">&nbsp;</p>
              <p className="text-[9px] text-gray-500">Responsável pela Entrega</p>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-3 border-t border-gray-400 text-center text-[9px] text-gray-500">
          ImplantaRH ConsultoriaPRO — Topac RH Multiempresa PRO — Documento gerado em {formatDate(new Date().toISOString())}
        </div>
      </div>
    </div>
  );
};

export default EntregaImpressaoPage;
