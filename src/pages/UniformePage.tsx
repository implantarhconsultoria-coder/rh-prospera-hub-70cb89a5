import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UNIFORM_TYPES, type DeliveryItem } from '@/data/deliveries';
import { Shirt, Plus, Trash2, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';

const UniformePage: React.FC = () => {
  const { companies, employees, addDelivery } = useApp();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [responsavel, setResponsavel] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));

  const filteredEmps = employees.filter(e =>
    e.status === 'ativo' && e.categoria === 'operacional' &&
    (e.name.toLowerCase().includes(search.toLowerCase()) ||
     e.cpf.includes(search) ||
     e.cargo.toLowerCase().includes(search.toLowerCase()) ||
     e.registro.includes(search))
  );

  const emp = employees.find(e => e.id === selectedEmpId);
  const company = emp ? companies.find(c => c.id === emp.companyId) : null;

  const addItem = () => {
    setItems(prev => [...prev, { tipo: UNIFORM_TYPES[0], descricao: '', tamanho: '', quantidade: 1, observacao: '' }]);
  };

  const updateItem = (idx: number, data: Partial<DeliveryItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...data } : it));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = () => {
    if (!emp) { toast.error('Selecione um funcionário'); return; }
    if (items.length === 0) { toast.error('Adicione pelo menos um item'); return; }
    if (!responsavel.trim()) { toast.error('Informe o responsável'); return; }

    const delivery = addDelivery({
      type: 'uniforme',
      employeeId: emp.id,
      companyId: emp.companyId,
      date: deliveryDate,
      items,
      responsavel,
    });

    const printData = {
      delivery,
      employee: emp,
      company,
    };
    sessionStorage.setItem('topac_print_delivery', JSON.stringify(printData));

    window.open(`/entrega-impressao?id=${delivery.id}`, '_blank');
    toast.success('Ficha de Uniforme gerada com sucesso!');
    setItems([]);
    setResponsavel('');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Shirt className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Entrega de Uniformes</h1>
            <p className="text-primary-foreground/70 text-sm">Controle de entrega de uniformes e vestimentas</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar funcionário (nome, CPF, função, matrícula)..." value={search}
            onChange={e => setSearch(e.target.value)} className="flex-1" />
        </div>

        {search && !selectedEmpId && (
          <div className="border rounded-lg max-h-48 overflow-y-auto">
            {filteredEmps.map(e => {
              const co = companies.find(c => c.id === e.companyId);
              return (
                <button key={e.id} onClick={() => { setSelectedEmpId(e.id); setSearch(''); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex justify-between items-center border-b last:border-0">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs text-muted-foreground">{co?.name} — {e.cargo}</span>
                </button>
              );
            })}
            {filteredEmps.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum encontrado</p>}
          </div>
        )}

        {emp && company && (
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{emp.name}</strong></div>
            <div><span className="text-muted-foreground text-xs block">Empresa</span>{company.name}</div>
            <div><span className="text-muted-foreground text-xs block">CNPJ</span>{company.cnpj}</div>
            <div><span className="text-muted-foreground text-xs block">Função</span>{emp.cargo}</div>
            <div><span className="text-muted-foreground text-xs block">CPF</span>{emp.cpf}</div>
            <div><span className="text-muted-foreground text-xs block">Matrícula</span>{emp.registro || '—'}</div>
            <div>
              <span className="text-muted-foreground text-xs block">Data da Entrega</span>
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-8 text-xs mt-1" />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => setSelectedEmpId('')} className="text-xs text-destructive">Trocar</Button>
            </div>
          </div>
        )}
      </div>

      {emp && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Itens de Uniforme</h2>
            <Button size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" />Adicionar Item</Button>
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div>
                <label className="text-[10px] text-muted-foreground">Tipo</label>
                <select value={item.tipo} onChange={e => updateItem(idx, { tipo: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-xs bg-background text-foreground">
                  {UNIFORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Descrição</label>
                <Input value={item.descricao} onChange={e => updateItem(idx, { descricao: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Tamanho</label>
                <Input value={item.tamanho} onChange={e => updateItem(idx, { tamanho: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">Qtd</label>
                  <Input type="number" min={1} value={item.quantidade} onChange={e => updateItem(idx, { quantidade: Number(e.target.value) })} className="h-8 text-xs" />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(idx)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Clique em "Adicionar Item" para lançar uniformes</p>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Responsável pela entrega</label>
            <Input value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome do responsável" className="max-w-xs" />
          </div>

          <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold">
            <FileText className="w-4 h-4 mr-2" /> Gerar Ficha de Uniforme
          </Button>
        </div>
      )}
    </div>
  );
};

export default UniformePage;
