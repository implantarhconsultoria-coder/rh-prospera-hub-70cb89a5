import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type HistoricoDocumento = {
  id: string;
  descricao?: string | null;
  placa?: string | null;
  patrimonio?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  empresa?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  arquivado_em?: string | null;
  documento_url?: string | null;
  documento_nome?: string | null;
};

type Props = { busca?: string };

const normalizarBusca = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const correspondeAoDocumento = (row: HistoricoDocumento, texto: string) => {
  const termo = normalizarBusca(texto);
  if (!termo) return true;
  const dados = [
    row.descricao, row.placa, row.patrimonio, row.renavam, row.chassi,
    row.empresa, row.ano_fabricacao, row.ano_modelo, row.documento_nome,
  ];
  const conteudo = normalizarBusca(dados.filter(Boolean).join(' '));
  if (conteudo.includes(termo)) return true;
  const simplificar = (s: string) => s.replace(/[^a-z0-9]/g, '');
  const simplificado = simplificar(termo);
  return simplificado.length >= 2 && simplificar(conteudo).includes(simplificado);
};

const FrotaHistoricoDocumentos: React.FC<Props> = ({ busca = '' }) => {
  const [rows, setRows] = useState<HistoricoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [empresa, setEmpresa] = useState('');

  useEffect(() => {
    let ativo = true;
    void supabase.from('ativos_documentos_historico' as any)
      .select('*')
      .order('descricao', { ascending: true })
      .order('arquivado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return;
        setRows((data as unknown as HistoricoDocumento[]) || []);
        setErro(error?.message || '');
        setLoading(false);
      });
    return () => { ativo = false; };
  }, []);

  const empresas = useMemo(
    () => Array.from(new Set(rows.map((row) => row.empresa).filter((nome): nome is string => Boolean(nome)))).sort(),
    [rows],
  );

  const list = useMemo(() => rows.filter((row) =>
    (!empresa || row.empresa === empresa) && correspondeAoDocumento(row, busca)
  ), [rows, empresa, busca]);

  return (
    <section className="card-premium p-5">
      <div className="flex items-center gap-2">
        <Archive className="h-5 w-5 text-primary" />
        <div>
          <h2 className="font-bold">Histórico de documentos anteriores</h2>
          <p className="text-xs text-muted-foreground">Versões anteriores preservadas automaticamente por veículo.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Filtrar histórico por empresa"
          className="h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm"
          value={empresa}
          onChange={(event) => setEmpresa(event.target.value)}
        >
          <option value="">Todas as empresas</option>
          {empresas.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
        </select>
        {!loading && !erro && (
          <span role="status" className="text-xs text-muted-foreground">
            {list.length} {list.length === 1 ? 'documento encontrado' : 'documentos encontrados'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : erro ? (
        <p role="alert" className="mt-4 text-sm text-destructive">Não foi possível carregar o histórico: {erro}</p>
      ) : (
        <div className="mt-4 space-y-2">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {busca.trim() || empresa ? 'Nenhum documento anterior corresponde à pesquisa ou aos filtros.' : 'Nenhum documento anterior arquivado ainda.'}
            </p>
          ) : list.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="font-bold">{row.descricao || 'Veículo'} {row.placa ? `• ${row.placa}` : ''}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.empresa || '—'} • {row.ano_fabricacao || '—'}/{row.ano_modelo || '—'} • RENAVAM {row.renavam || '—'} • Chassi {row.chassi || '—'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Arquivado em {row.arquivado_em ? new Date(row.arquivado_em).toLocaleString('pt-BR') : '—'}
              </div>
              {row.documento_url && (
                <a className="mt-2 inline-block text-xs font-semibold text-primary underline"
                   href={row.documento_url} target="_blank" rel="noreferrer">
                  Abrir documento anterior
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default FrotaHistoricoDocumentos;
