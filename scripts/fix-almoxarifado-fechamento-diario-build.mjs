import fs from 'node:fs';

const file = 'src/components/AlmoxarifadoDesktopV2.tsx';
if (!fs.existsSync(file)) process.exit(0);
let source = fs.readFileSync(file, 'utf8');
let changed = false;

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    console.warn(`[almox-fechamento] trecho não encontrado: ${label}`);
    return;
  }
  source = source.replace(from, to);
  changed = true;
};

replaceOnce(
  "import { supabase } from '@/integrations/supabase/client';",
  "import { supabase } from '@/integrations/supabase/client';\nimport { jsPDF } from 'jspdf';",
  'import jsPDF',
);

source = source.replace(
  '  Trash2, Upload, UserRoundCog, Wrench,',
  '  Trash2, Upload, UserRoundCog, Wrench, Printer, BellRing,',
);

replaceOnce(
  "const date = (v: unknown) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';",
  "const date = (v: unknown) => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';\nconst brToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());\nconst brClock = () => { const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()); const m=Object.fromEntries(p.map(x=>[x.type,x.value])); return {weekday:String(m.weekday||''),minutes:Number(m.hour||0)*60+Number(m.minute||0)}; };",
  'helpers de data BR',
);

replaceOnce(
  "  const [assets,setAssets] = useState<any[]>([]);",
  "  const [assets,setAssets] = useState<any[]>([]);\n  const [dailyClosings,setDailyClosings] = useState<any[]>([]);\n  const [,setClockTick] = useState(0);",
  'estado fechamento diário',
);

replaceOnce(
  "  useEffect(()=>{void fetchData();},[]);",
  "  useEffect(()=>{void fetchData();},[]);\n  useEffect(()=>{const timer=window.setInterval(()=>setClockTick(v=>v+1),30000);return()=>window.clearInterval(timer);},[]);",
  'relógio alerta',
);

replaceOnce(
  "    if (!e.error) setEntries(e.data||[]); if(!x.error)setExits(x.data||[]); if(!a.error)setAlerts(a.data||[]); if(!c.error)setLoads(c.data||[]); if(!l.error)setLinks(l.data||[]); if(!v.error)setAssets(v.data||[]);\n    setLoading(false);",
  "    if (!e.error) setEntries(e.data||[]); if(!x.error)setExits(x.data||[]); if(!a.error)setAlerts(a.data||[]); if(!c.error)setLoads(c.data||[]); if(!l.error)setLinks(l.data||[]); if(!v.error)setAssets(v.data||[]);\n    const {data:daily,error:dailyError}=await db.from('almoxarifado_fechamentos_funcionario').select('*').eq('data',brToday()).order('funcionario_nome');\n    if(!dailyError)setDailyClosings(daily||[]);\n    setLoading(false);",
  'carregar fechamentos',
);

const fnMarker = "  const signLoad=async(row:any)=>{const signer=window.prompt('Nome de quem está assinando o protocolo:',row.funcionario_nome||'');if(!signer)return;const {error}=await db.rpc('almoxarifado_assinar_carga_v2',{p_carga_id:row.id,p_nome:signer});if(error)return toast.error(error.message);toast.success('Protocolo assinado e enviado ao histórico do funcionário.');await fetchData();};";
if (source.includes(fnMarker) && !source.includes('const generateDailyClosings=')) {
  const extra = `${fnMarker}\n\n  const generateDailyClosings=async()=>{setBusy(true);try{const {data,error}=await db.rpc('almoxarifado_gerar_fechamentos_diarios',{p_data:brToday()});if(error)throw error;setDailyClosings(data||[]);toast.success((data||[]).length?\`Fechamento diário gerado para \${(data||[]).length} funcionário(s).\`:'Nenhuma retirada registrada hoje.');setMode('assinatura');}catch(err:any){toast.error(err?.message||'Não foi possível gerar o fechamento diário.');}finally{setBusy(false);}};\n\n  const signDaily=async(row:any)=>{const signer=window.prompt('Confirme o nome de quem está assinando digitalmente:',row.funcionario_nome||'');if(!signer)return;const {error}=await db.rpc('almoxarifado_assinar_fechamento_diario',{p_fechamento_id:row.id,p_nome:signer});if(error)return toast.error(error.message);toast.success('Relatório diário assinado digitalmente.');await fetchData();};\n\n  const printDaily=async(row:any)=>{try{const doc=new jsPDF({unit:'mm',format:'a4'});const moves=Array.isArray(row.movimentacoes)?row.movimentacoes:[];doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('TOPAC RH PRO',14,16);doc.setFontSize(12);doc.text('RELATÓRIO DIÁRIO DE RETIRADAS - ALMOXARIFADO',14,24);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(\`Funcionário: \${row.funcionario_nome}\`,14,33);doc.text(\`Empresa: \${row.empresa_nome||'—'}\`,14,39);doc.text(\`Data: \${date(row.data)}   Protocolo: \${row.protocolo}\`,14,45);doc.line(14,49,196,49);let y=57;doc.setFont('helvetica','bold');doc.text('HORÁRIO',14,y);doc.text('CÓDIGO',35,y);doc.text('MATERIAL / RETIRADA',62,y);doc.text('QTD.',181,y);doc.setFont('helvetica','normal');y+=6;moves.forEach((m:any)=>{const material=String(m.item||'Item');const lines=doc.splitTextToSize(material,112);const h=Math.max(6,lines.length*4.5);if(y+h>255){doc.addPage();y=20;doc.setFont('helvetica','bold');doc.text('HORÁRIO',14,y);doc.text('CÓDIGO',35,y);doc.text('MATERIAL / RETIRADA',62,y);doc.text('QTD.',181,y);doc.setFont('helvetica','normal');y+=6;}doc.text(String(m.horario||'--:--'),14,y);doc.text(String(m.codigo||'—').slice(0,14),35,y);doc.text(lines,62,y);doc.text(String(m.quantidade??''),181,y);y+=h;});if(y>230){doc.addPage();y=25;}y+=10;doc.line(14,y,92,y);doc.line(112,y,196,y);doc.setFontSize(8);doc.text('Assinatura do funcionário',34,y+5);doc.text('Responsável pelo Almoxarifado',132,y+5);doc.setFontSize(7);doc.text('Documento emitido pelo TOPAC RH PRO. O registro digital permanece vinculado ao histórico do funcionário.',14,287);doc.save(\`Almoxarifado_\${row.funcionario_nome.replace(/[^a-zA-Z0-9À-ÿ]+/g,'_')}_\${row.data}.pdf\`);await db.rpc('almoxarifado_marcar_fechamento_impresso',{p_fechamento_id:row.id});toast.success('PDF diário gerado para impressão e arquivo físico.');await fetchData();}catch(err:any){toast.error(err?.message||'Erro ao gerar o PDF.');}};\n\n  const clock=brClock();\n  const closingDue=clock.weekday!=='Sat'&&clock.weekday!=='Sun'&&clock.minutes>=(clock.weekday==='Fri'?16*60+30:17*60);`;
  source = source.replace(fnMarker, extra);
  changed = true;
}

source = source
  .replaceAll("loads.filter((x:any)=>x.status_assinatura==='assinado').length", "dailyClosings.filter((x:any)=>x.status==='assinado').length")
  .replaceAll("loads.filter((x:any)=>x.status_assinatura!=='assinado').length", "dailyClosings.filter((x:any)=>x.status!=='assinado').length")
  .replace('Protocolos do Almoxarifado</div>', 'Fechamentos diários por funcionário</div>');

if (!source.includes('FECHAMENTO DO DIA DISPONÍVEL')) {
  const signatureButton = "    <button onClick={()=>setMode('assinatura')}";
  if (source.includes(signatureButton)) {
    const alert = `    {closingDue&&<div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-500"><BellRing className="h-5 w-5"/></span><div><div className="text-xs font-black uppercase tracking-[.14em] text-amber-500">FECHAMENTO DO DIA DISPONÍVEL</div><div className="mt-1 font-bold text-foreground">Gerar os relatórios individuais de quem retirou material hoje.</div><div className="text-xs text-muted-foreground">Cada funcionário recebe um relatório com item, quantidade e horário para assinatura digital e impressão.</div></div></div><Button onClick={generateDailyClosings} disabled={busy} className="shrink-0">{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileSignature className="mr-2 h-4 w-4"/>}Gerar fechamento diário</Button></div></div>}\n`;
    source = source.replace(signatureButton, alert + signatureButton);
    changed = true;
  }
}

const signaturePattern = /\{mode==='assinatura'&&<div><Back\/>[\s\S]*?\}\n    \{mode==='config'/;
if (signaturePattern.test(source)) {
  const replacement = `{mode==='assinatura'&&<div><Back/><div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-2xl font-black text-foreground">Assinatura Digital • Almoxarifado</h2><p className="text-sm text-muted-foreground">Fechamento diário consolidado por funcionário, com assinatura digital e via física para arquivo.</p></div><Button onClick={generateDailyClosings} disabled={busy}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileSignature className="mr-2 h-4 w-4"/>}Atualizar fechamento de hoje</Button></div><div className="rounded-xl border border-border bg-card shadow-sm"><div className="border-b border-border p-4"><b>Relatórios diários • {date(brToday())}</b><div className="text-xs text-muted-foreground">O relatório pode ser atualizado enquanto estiver pendente. Depois da assinatura digital ele fica travado como registro do dia.</div></div><div className="overflow-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/40"><tr>{['Protocolo','Funcionário','Movimentações','Itens','Digital','Papel','Ações'].map(h=><th key={h} className="p-3 text-left text-xs uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{dailyClosings.map((r:any)=><tr key={r.id} className="border-t border-border"><td className="p-3 font-bold text-primary">{r.protocolo}</td><td className="p-3"><b>{r.funcionario_nome}</b><div className="text-xs text-muted-foreground">{r.empresa_nome||'—'}</div></td><td className="p-3">{r.total_movimentacoes}</td><td className="p-3">{fmt(r.total_itens)}</td><td className="p-3">{r.status==='assinado'?<span className="inline-flex items-center gap-1 font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4"/>Assinado</span>:<span className="font-bold text-amber-500">Pendente</span>}</td><td className="p-3">{r.impresso_em?<span className="font-bold text-emerald-600">PDF gerado</span>:<span className="text-muted-foreground">Pendente</span>}</td><td className="p-3"><div className="flex gap-2">{r.status!=='assinado'&&<Button size="sm" onClick={()=>signDaily(r)}>Assinar digital</Button>}<Button size="sm" variant="outline" onClick={()=>printDaily(r)}><Printer className="mr-1 h-4 w-4"/>PDF / Imprimir</Button></div></td></tr>)}{!dailyClosings.length&&<tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">Nenhum fechamento gerado para hoje. Clique em “Atualizar fechamento de hoje”.</td></tr>}</tbody></table></div></div><div className="mt-6"><div className="mb-3"><b className="text-foreground">Protocolos individuais</b><div className="text-xs text-muted-foreground">Mantidos para consulta; o fechamento diário é o documento consolidado de assinatura.</div></div><div className="rounded-xl border border-border bg-card shadow-sm overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/40"><tr>{['Protocolo','Data','Tipo','Funcionário','Veículo','Status'].map(h=><th key={h} className="p-3 text-left text-xs uppercase text-muted-foreground">{h}</th>)}</tr></thead><tbody>{loads.map((r:any)=><tr key={r.id} className="border-t border-border"><td className="p-3 font-bold text-primary">{r.protocolo||'—'}</td><td className="p-3">{date(r.data_carga)}</td><td className="p-3 capitalize">{r.tipo||'mecânico'}</td><td className="p-3">{r.funcionario_nome}</td><td className="p-3">{[r.veiculo,r.placa].filter(Boolean).join(' • ')||'—'}</td><td className="p-3">{r.status_assinatura==='assinado'?'Assinado individualmente':'Registrado'}</td></tr>)}</tbody></table></div></div></div>}
    {mode==='config'`;
  source = source.replace(signaturePattern, replacement);
  changed = true;
} else if (!source.includes('Relatórios diários •')) {
  console.warn('[almox-fechamento] bloco de assinatura não encontrado');
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('[almox-fechamento] fechamento diário por funcionário + PDF + assinatura digital aplicado');
} else {
  console.log('[almox-fechamento] nenhuma alteração necessária');
}
