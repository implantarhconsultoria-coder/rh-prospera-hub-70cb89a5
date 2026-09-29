import React, { useMemo, useState } from 'react';
import { CalendarDays, Eye, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type Props = {
  chamados: any[];
  nomeTecnico: (funcionarioId: string | null) => string;
  onOpenDetail: (chamado: any) => void;
};

const STATUS_LABELS: Record<string,string> = {
  pendente: 'Aguardando aceite',
  aceito: 'Aceito',
  em_deslocamento: 'A caminho',
  no_local: 'No cliente',
  em_execucao: 'Em atendimento',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const statusClass: Record<string,string> = {
  pendente: 'border-amber-300 bg-amber-50 text-amber-800',
  aceito: 'border-blue-300 bg-blue-50 text-blue-800',
  em_deslocamento: 'border-violet-300 bg-violet-50 text-violet-800',
  no_local: 'border-indigo-300 bg-indigo-50 text-indigo-800',
  em_execucao: 'border-orange-300 bg-orange-50 text-orange-800',
  em_atendimento: 'border-orange-300 bg-orange-50 text-orange-800',
  concluido: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  cancelado: 'border-red-300 bg-red-50 text-red-800',
};

const dateKey = (value?: string | null) => {
  if (!value) return 'Sem data';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sem data';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const esc = (value: unknown) => String(value ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

const OperacionalOcorrenciasHistoricoPanel: React.FC<Props> = ({ chamados, nomeTecnico, onOpenDetail }) => {
  const [busca, setBusca] = useState('');

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return chamados
      .filter((c) => !q || [
        c.cliente, c.local_servico, c.tipo_servico, c.solicitante_nome,
        c.placa_snapshot, c.patrimonio_snapshot, nomeTecnico(c.colaborador_id),
      ].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a,b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [chamados, busca, nomeTecnico]);

  const grupos = useMemo(() => {
    const byClient = new Map<string, Map<string, any[]>>();
    for (const c of filtrados) {
      const cliente = String(c.cliente || 'SEM CLIENTE').trim() || 'SEM CLIENTE';
      const data = dateKey(c.created_at);
      if (!byClient.has(cliente)) byClient.set(cliente, new Map());
      const byDate = byClient.get(cliente)!;
      if (!byDate.has(data)) byDate.set(data, []);
      byDate.get(data)!.push(c);
    }
    return Array.from(byClient.entries())
      .sort(([a],[b]) => a.localeCompare(b,'pt-BR'))
      .map(([cliente, dates]) => ({
        cliente,
        datas: Array.from(dates.entries()).map(([data, rows]) => ({ data, rows })),
      }));
  }, [filtrados]);

  const gerarRelatorio = () => {
    if (!filtrados.length) {
      toast.error('Não há ocorrências para gerar o relatório.');
      return;
    }

    const rows = grupos.map((grupo) => {
      const sections = grupo.datas.map((dia) => {
        const items = dia.rows.map((c) => `
          <tr>
            <td>#${esc(c.numero || '—')}</td>
            <td>${esc(dateTime(c.created_at))}</td>
            <td>${esc(c.local_servico || '—')}</td>
            <td>${esc(c.patrimonio_snapshot || '—')}</td>
            <td>${esc(c.placa_snapshot || '—')}</td>
            <td>${esc(c.tipo_servico || '—')}</td>
            <td>${esc(nomeTecnico(c.colaborador_id))}</td>
            <td>${esc(STATUS_LABELS[c.status] || c.status || '—')}</td>
            <td>${esc(c.descricao_conclusao || c.cancelamento_motivo || '—')}</td>
          </tr>
        `).join('');
        return `
          <h3>${esc(dia.data)}</h3>
          <table>
            <thead><tr><th>Ocorr.</th><th>Data/Hora</th><th>Local</th><th>Patrimônio</th><th>Placa</th><th>Ocorrência</th><th>Mecânico</th><th>Status</th><th>Conclusão</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
        `;
      }).join('');
      return `<section><h2>${esc(grupo.cliente)}</h2>${sections}</section>`;
    }).join('');

    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      toast.error('O navegador bloqueou a abertura do relatório.');
      return;
    }

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Ocorrências - TOPAC</title>
      <style>
        @page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:10px}
        h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px;border-bottom:2px solid #222;padding-bottom:4px}
        h3{font-size:11px;margin:10px 0 4px;background:#eee;padding:5px}
        .meta{color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-bottom:8px}
        th,td{border:1px solid #bbb;padding:5px;vertical-align:top}th{background:#f3f3f3;text-align:left}
        section{break-inside:avoid-page}.footer{margin-top:16px;color:#666;font-size:9px}
      </style></head><body>
      <h1>TOPAC RH PRO — Relatório de Ocorrências</h1>
      <div class="meta">Organizado por cliente e data • Gerado em ${esc(new Date().toLocaleString('pt-BR'))} • Total: ${filtrados.length}</div>
      ${rows}
      <div class="footer">Relatório gerado a partir do histórico registrado na plataforma.</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="card-premium space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Histórico de ocorrências</h2>
            <p className="text-xs text-muted-foreground">Organizado por cliente e, dentro do cliente, por data.</p>
          </div>
          <Button onClick={gerarRelatorio}><FileText className="mr-2 h-4 w-4" />Gerar relatório</Button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, local, patrimônio, placa, mecânico..."
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
      </div>

      {!grupos.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma ocorrência encontrada.</div>
      ) : grupos.map((grupo) => (
        <section key={grupo.cliente} className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
            <div>
              <h3 className="font-black">{grupo.cliente}</h3>
              <p className="text-xs text-muted-foreground">{grupo.datas.reduce((n,d) => n + d.rows.length, 0)} ocorrência(s)</p>
            </div>
          </div>

          <div className="divide-y">
            {grupo.datas.map((dia) => (
              <div key={dia.data} className="p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> {dia.data}
                </div>
                <div className="space-y-2">
                  {dia.rows.map((c) => (
                    <div key={c.id} className="grid gap-2 rounded-xl border p-3 lg:grid-cols-[100px_1fr_180px_130px] lg:items-center">
                      <div>
                        <p className="font-black">#{c.numero || '—'}</p>
                        <p className="text-[10px] text-muted-foreground">{dateTime(c.created_at).split(' ')[1] || ''}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.tipo_servico || 'Ocorrência'}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.local_servico, c.patrimonio_snapshot && `Pat. ${c.patrimonio_snapshot}`, c.placa_snapshot && `Placa ${c.placa_snapshot}`].filter(Boolean).join(' • ')}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Mecânico: {nomeTecnico(c.colaborador_id)}</p>
                      </div>
                      <Badge variant="outline" className={statusClass[c.status] || ''}>{STATUS_LABELS[c.status] || c.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => onOpenDetail(c)}><Eye className="mr-1 h-4 w-4" />Detalhes</Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default OperacionalOcorrenciasHistoricoPanel;
