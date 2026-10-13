import fs from 'node:fs';

const replaceRequired = (source, before, after, label) => {
  if (!source.includes(before)) throw new Error(`[uniform-cancel] ponto não localizado: ${label}`);
  return source.replace(before, after);
};

// 1) Helper compartilhado: DATE puro nunca passa por new Date('YYYY-MM-DD').
{
  const file = 'src/lib/calculations.ts';
  let source = fs.readFileSync(file, 'utf8');
  if (!source.includes("import { formatTopacDate } from '@/lib/dateFormat';")) {
    source = replaceRequired(
      source,
      "import { getInsalubridadeAplicavel, getPericulosidadeAplicavel } from '@/lib/employeeRoleRules';",
      "import { getInsalubridadeAplicavel, getPericulosidadeAplicavel } from '@/lib/employeeRoleRules';\nimport { formatTopacDate } from '@/lib/dateFormat';",
      'import formatTopacDate',
    );
  }
  const oldFormat = `export const formatDate = (d: string) => {\n  if (!d) return '—';\n  return new Date(d).toLocaleDateString('pt-BR');\n};`;
  const newFormat = `export const formatDate = (d: string) => formatTopacDate(d);`;
  if (source.includes(oldFormat)) source = source.replace(oldFormat, newFormat);
  else if (!source.includes(newFormat)) throw new Error('[uniform-cancel] formatDate atual não reconhecido');
  fs.writeFileSync(file, source);
}

// 2) Documento: separar Data da Entrega de Emissão sem alterar EPI/Protocolo.
{
  const file = 'src/pages/EntregaImpressaoPage.tsx';
  let source = fs.readFileSync(file, 'utf8');
  const oldHeader = `<p className="text-xs">Data: {formatDate(delivery.date)}</p>`;
  const newHeader = `<p className="text-xs">{delivery.type === 'uniforme' ? 'Data da Entrega:' : 'Data:'} {formatDate(delivery.date)}</p>`;
  if (source.includes(oldHeader)) source = source.replace(oldHeader, newHeader);
  else if (!source.includes(newHeader)) throw new Error('[uniform-cancel] cabeçalho da data não localizado');
  fs.writeFileSync(file, source);
}

// 3) Uniformes: histórico auditável + cancelamento exclusivamente via RPC.
{
  const file = 'src/pages/UniformePage.tsx';
  let source = fs.readFileSync(file, 'utf8');
  if (!source.includes('cancelamento_motivo')) {
    source = replaceRequired(
      source,
      "import { toast } from 'sonner';",
      "import { toast } from 'sonner';\nimport { formatDate } from '@/lib/calculations';",
      'import formatDate',
    );

    source = replaceRequired(
      source,
      "type RecordedDelivery = { id:string; funcionario_id:string; company_id:string; unidade:Unidade; data_entrega:string; itens:DeliveryItem[]; gerado_por:string; criado_em:string };",
      "type RecordedDelivery = { id:string; funcionario_id:string; company_id:string; unidade:Unidade; data_entrega:string; itens:DeliveryItem[]; gerado_por:string; criado_em:string; cancelado_em:string|null; cancelado_por:string|null; cancelamento_motivo:string|null };",
      'RecordedDelivery cancelamento',
    );
    source = replaceRequired(
      source,
      "type Move={id:string;estoque_id:string;tipo:'entrada'|'contagem'|'saida';quantidade:number;saldo_antes:number;saldo_depois:number;funcionario_id:string|null;criado_em:string;observacao:string|null};",
      "type Move={id:string;estoque_id:string;tipo:'entrada'|'contagem'|'saida';quantidade:number;saldo_antes:number;saldo_depois:number;funcionario_id:string|null;criado_em:string;observacao:string|null;cancelado_em:string|null;cancelado_por:string|null};",
      'Move cancelamento',
    );

    source = replaceRequired(
      source,
      "  const [movements,setMovements]=useState<Move[]>([]);",
      "  const [movements,setMovements]=useState<Move[]>([]);\n  const [cancellerNames,setCancellerNames]=useState<Record<string,string>>({});",
      'state responsáveis',
    );

    source = replaceRequired(source, '    const [s,h,m]=await Promise.all([', '    const [s,h,m,p]=await Promise.all([', 'Promise.all refresh');
    source = replaceRequired(
      source,
      "      db.from('uniforme_entregas').select('id,funcionario_id,company_id,unidade,data_entrega,itens,gerado_por,criado_em').order('criado_em',{ascending:false}).limit(80),",
      "      db.from('uniforme_entregas').select('id,funcionario_id,company_id,unidade,data_entrega,itens,gerado_por,criado_em,cancelado_em,cancelado_por,cancelamento_motivo').order('criado_em',{ascending:false}).limit(80),",
      'select entregas canceladas',
    );
    source = replaceRequired(
      source,
      "      db.from('uniforme_movimentos').select('id,estoque_id,tipo,quantidade,saldo_antes,saldo_depois,funcionario_id,criado_em,observacao').order('criado_em',{ascending:false}).limit(200),",
      "      db.from('uniforme_movimentos').select('id,estoque_id,tipo,quantidade,saldo_antes,saldo_depois,funcionario_id,criado_em,observacao,cancelado_em,cancelado_por').order('criado_em',{ascending:false}).limit(200),\n      db.from('profiles').select('user_id,nome_completo,email'),",
      'select movimentos e responsáveis',
    );
    source = replaceRequired(
      source,
      "    if(m.error)toast.error('Movimentações de uniformes indisponíveis: '+m.error.message);\n    else setMovements((m.data||[]) as Move[]);\n    setLoading(false);",
      "    if(m.error)toast.error('Movimentações de uniformes indisponíveis: '+m.error.message);\n    else setMovements((m.data||[]) as Move[]);\n    if(!p.error)setCancellerNames(Object.fromEntries((p.data||[]).map((profile:any)=>[profile.user_id,profile.nome_completo||profile.email||'Usuário administrativo'])));\n    setLoading(false);",
      'responsáveis refresh',
    );

    const reprintTail = `  const reprint=(d:RecordedDelivery)=>{\n    const employee=employees.find(e=>e.id===d.funcionario_id);\n    const co=companies.find(c=>c.id===d.company_id);\n    if(!employee||!co){toast.error('Dados do funcionário ou da empresa indisponíveis para reimprimir.');return;}\n    navigate('/entrega-impressao',{state:{previewData:{delivery:{\n      id:d.id,type:'uniforme' as const,date:d.data_entrega,items:d.itens,\n    },employee,company:co,returnPath:'/admin/uniformes'}}});\n  };`;
    const reprintAndCancel = `${reprintTail}\n  const cancelDelivery=async(d:RecordedDelivery)=>{\n    if(busy||d.cancelado_em)return;\n    const motivo=window.prompt('Informe o motivo do cancelamento/estorno da entrega:');\n    if(motivo===null)return;\n    const motivoLimpo=motivo.trim();\n    if(motivoLimpo.length<5){toast.error('Informe um motivo com pelo menos 5 caracteres.');return;}\n    if(!window.confirm('Esta operação cancelará a entrega e devolverá as quantidades ao estoque. Deseja continuar?'))return;\n    setBusy(true);\n    const r=await db.rpc('uniforme_cancelar_entrega',{p_entrega_id:d.id,p_motivo:motivoLimpo});\n    setBusy(false);\n    if(r.error){toast.error('Entrega não cancelada: '+r.error.message);return;}\n    const result=(r.data||{}) as {already_cancelled?:boolean;total_pecas?:number};\n    await refresh();\n    if(result.already_cancelled){toast.info('Esta entrega já estava cancelada. O estoque não foi alterado novamente.');return;}\n    toast.success('Entrega cancelada. '+Number(result.total_pecas||0)+' peça(s) devolvida(s) ao estoque.');\n  };`;
    source = replaceRequired(source, reprintTail, reprintAndCancel, 'ação cancelar entrega');

    const oldHistory = `{history.filter(d=>d.unidade===unit).map(d=><div key={d.id} className="border-b py-3 flex flex-wrap items-center justify-between gap-3">\n        <div className="text-sm"><strong>{employees.find(e=>e.id===d.funcionario_id)?.name||'Funcionário cadastrado'}</strong>\n          <p className="text-xs text-muted-foreground">{new Date(d.criado_em).toLocaleString('pt-BR')} • {d.itens.map(i=>i.tipo+' '+i.tamanho+' x'+i.quantidade).join('; ')}</p></div>\n        <Button variant="outline" size="sm" onClick={()=>reprint(d)}>Reimprimir ficha</Button>\n      </div>)}`;
    const newHistory = `{history.filter(d=>d.unidade===unit).map(d=>{\n        const cancelled=Boolean(d.cancelado_em);\n        return <div key={d.id} className={\`border-b py-3 flex flex-wrap items-center justify-between gap-3 \${cancelled?'opacity-75':''}\`}>\n          <div className="text-sm min-w-0">\n            <div className="flex flex-wrap items-center gap-2"><strong>{employees.find(e=>e.id===d.funcionario_id)?.name||'Funcionário cadastrado'}</strong>\n              {cancelled&&<span className="rounded bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">CANCELADA</span>}\n            </div>\n            <p className="text-xs text-muted-foreground">Data da entrega: {formatDate(d.data_entrega)} • Registrada: {new Date(d.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} • {d.itens.map(i=>i.tipo+' '+i.tamanho+' x'+i.quantidade).join('; ')}</p>\n            {cancelled&&<div className="mt-1 text-xs text-destructive/90">\n              <p>Cancelada em: {d.cancelado_em?new Date(d.cancelado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</p>\n              <p>Motivo: {d.cancelamento_motivo||'—'}</p>\n              <p>Responsável: {(d.cancelado_por&&cancellerNames[d.cancelado_por])||'Usuário administrativo'}</p>\n            </div>}\n          </div>\n          <div className="flex flex-wrap gap-2">\n            {!cancelled&&<Button variant="outline" size="sm" onClick={()=>reprint(d)} disabled={busy}>Reimprimir ficha</Button>}\n            {!cancelled&&<Button variant="destructive" size="sm" onClick={()=>void cancelDelivery(d)} disabled={busy}>CANCELAR ENTREGA</Button>}\n            {cancelled&&<Button variant="outline" size="sm" disabled>Ficha cancelada</Button>}\n          </div>\n        </div>;\n      })}`;
    source = replaceRequired(source, oldHistory, newHistory, 'histórico de entregas');

    source = source.replace('Entregas confirmadas / reimpressão', 'Entregas confirmadas / cancelamento / reimpressão');
    source = source.replace('A reimpressão consulta a ficha já registrada: nenhuma segunda baixa de estoque.', 'A reimpressão consulta a ficha ativa já registrada e nunca movimenta estoque. Entregas canceladas permanecem visíveis para auditoria.');

    source = source.replace(
      "<strong>{m.tipo==='saida'?'Saída':m.tipo==='entrada'?'Entrada':'Contagem'}</strong>",
      "<strong>{m.tipo==='saida'?'Saída':m.tipo==='entrada'?'Entrada':'Contagem'}{m.cancelado_em?' • CANCELADA':''}</strong>",
    );
  }
  fs.writeFileSync(file, source);
}

console.log('[uniform-cancel] cancelamento transacional e data segura aplicados');
