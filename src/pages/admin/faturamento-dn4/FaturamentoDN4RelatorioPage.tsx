import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, FileBarChart2 } from 'lucide-react';
import { fmtBRL, statusMeta } from '@/lib/dn4';
import { printDocumentInPage } from '@/lib/printInPage';

const FaturamentoDN4RelatorioPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [agrupar, setAgrupar] = useState<'cliente' | 'empresa' | 'competencia'>('cliente');
  const [mes, setMes] = useState('todos');

  useEffect(() => {
    supabase.from('faturamento_dn4' as any).select('*').order('competencia', { ascending: false })
      .then(({ data }) => setRows((data as any[]) || []));
  }, []);

  const meses = useMemo(() => Array.from(new Set(rows.map((r) => r.competencia).filter(Boolean))).sort().reverse(), [rows]);
  const filtrados = useMemo(() => mes === 'todos' ? rows : rows.filter((r) => r.competencia === mes), [rows, mes]);

  const grupos = useMemo(() => {
    const map = new Map<string, { itens: any[]; total: number }>();
    for (const r of filtrados) {
      const k = (r[agrupar === 'empresa' ? 'empresa_filial' : agrupar === 'competencia' ? 'competencia' : 'cliente_nome'] || '—') as string;
      const cur = map.get(k) || { itens: [], total: 0 };
      cur.itens.push(r);
      cur.total += Number(r.valor_total || 0);
      map.set(k, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [filtrados, agrupar]);

  const totalGeral = filtrados.reduce((s, r) => s + Number(r.valor_total || 0), 0);

  const imprimir = () => {
    const linhas = grupos.map(([k, g]) => `
      <tr><td colspan="5" style="background:#f3f4f6;font-weight:bold;padding:6px 8px">${k} — ${fmtBRL(g.total)}</td></tr>
      ${g.itens.map((r) => `
        <tr>
          <td style="padding:4px 8px">${r.competencia}</td>
          <td style="padding:4px 8px">${r.cliente_nome}</td>
          <td style="padding:4px 8px">${r.descricao}</td>
          <td style="padding:4px 8px;text-align:right">${fmtBRL(r.valor_total)}</td>
          <td style="padding:4px 8px">${statusMeta(r.status).label}</td>
        </tr>`).join('')}
    `).join('');
    const html = `<!DOCTYPE html><html><head><title>Relatório DN4</title>
      <style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:16px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #d1d5db;text-align:left}</style>
      </head><body>
      <h1>Relatório de Faturamento DN4 ${mes !== 'todos' ? '— ' + mes : ''}</h1>
      <p style="font-size:11px;color:#666">Agrupado por ${agrupar} • Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr>
        <th style="padding:6px 8px">Comp.</th><th style="padding:6px 8px">Cliente</th><th style="padding:6px 8px">Descrição</th>
        <th style="padding:6px 8px;text-align:right">Total</th><th style="padding:6px 8px">Status</th>
      </tr></thead><tbody>${linhas}</tbody>
      <tfoot><tr><td colspan="3" style="padding:8px;text-align:right;font-weight:bold">TOTAL GERAL</td>
      <td colspan="2" style="padding:8px;font-weight:bold;color:#1e40af">${fmtBRL(totalGeral)}</td></tr></tfoot>
      </table></body></html>`;
    printDocumentInPage(html);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileBarChart2 className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">Relatório</h2>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Agrupar por</p>
          <Select value={agrupar} onValueChange={(v: any) => setAgrupar(v)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cliente">Cliente</SelectItem>
              <SelectItem value="empresa">Empresa/filial</SelectItem>
              <SelectItem value="competencia">Competência</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Competência</p>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={imprimir}><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</Button>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Sem dados para o filtro escolhido.</p>
        ) : grupos.map(([k, g]) => (
          <div key={k} className="p-3">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">{k}</h3>
              <span className="text-sm font-bold text-primary">{fmtBRL(g.total)}</span>
            </div>
            <ul className="text-xs space-y-1">
              {g.itens.map((r) => (
                <li key={r.id} className="flex justify-between text-muted-foreground">
                  <span className="truncate pr-2">{r.competencia} • {r.descricao}</span>
                  <span>{fmtBRL(r.valor_total)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="px-4 py-3 bg-muted/30 flex justify-between font-semibold">
          <span>TOTAL GERAL</span>
          <span className="text-primary">{fmtBRL(totalGeral)}</span>
        </div>
      </div>
    </div>
  );
};

export default FaturamentoDN4RelatorioPage;
