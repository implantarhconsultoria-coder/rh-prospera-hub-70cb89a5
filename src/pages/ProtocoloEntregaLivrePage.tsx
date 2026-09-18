import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DeliveryItem } from '@/data/deliveries';
import { ClipboardSignature, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const ProtocoloEntregaLivrePage: React.FC = () => {
  const { companies, employees, addDelivery } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<DeliveryItem[]>([]);

  const filteredEmployees = employees.filter((employee) => {
    if (employee.status !== 'ativo') return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return employee.name.toLowerCase().includes(query)
      || String(employee.cpf || '').includes(search)
      || String(employee.cargo || '').toLowerCase().includes(query)
      || String(employee.registro || '').toLowerCase().includes(query);
  });

  const employee = employees.find((item) => item.id === selectedEmpId);
  const company = employee ? companies.find((item) => item.id === employee.companyId) : null;

  const addItem = () => {
    setItems((current) => [...current, {
      tipo: '',
      descricao: '',
      ca: '',
      tamanho: '',
      quantidade: 1,
      observacao: '',
    }]);
  };

  const updateItem = (index: number, data: Partial<DeliveryItem>) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...data } : item));
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleGenerate = () => {
    if (!employee || !company) {
      toast.error('Selecione um funcionário.');
      return;
    }

    const normalizedItems = items
      .map((item) => ({
        ...item,
        tipo: item.tipo.trim(),
        descricao: item.descricao.trim(),
        ca: String(item.ca || '').trim(),
        tamanho: item.tamanho.trim(),
        observacao: item.observacao.trim(),
        quantidade: Math.max(1, Number(item.quantidade) || 1),
      }))
      .filter((item) => item.tipo || item.descricao);

    if (!normalizedItems.length) {
      toast.error('Adicione pelo menos um item e informe o que está sendo entregue.');
      return;
    }

    addDelivery({
      type: 'protocolo',
      employeeId: employee.id,
      companyId: employee.companyId,
      date: deliveryDate,
      items: normalizedItems,
    });

    navigate('/entrega-impressao', {
      state: {
        previewData: {
          delivery: {
            type: 'protocolo',
            date: deliveryDate,
            items: normalizedItems,
          },
          employee,
          company,
          returnPath: '/admin/epi',
        },
      },
    });

    toast.success('Protocolo de entrega gerado.');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <ClipboardSignature className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Protocolo de Entrega Livre</h1>
            <p className="text-primary-foreground/70 text-sm">
              Gere um protocolo no padrão da ficha de EPI para qualquer item entregue ao colaborador.
            </p>
          </div>
        </div>
      </div>

      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funcionário (nome, CPF, função, matrícula)..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="flex-1"
          />
        </div>

        {search && !selectedEmpId && (
          <div className="border rounded-lg max-h-56 overflow-y-auto">
            {filteredEmployees.map((item) => {
              const itemCompany = companies.find((companyItem) => companyItem.id === item.companyId);
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedEmpId(item.id);
                    setSearch('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm flex justify-between items-center gap-4 border-b last:border-0"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground text-right">
                    {itemCompany?.name} — {item.cargo}
                  </span>
                </button>
              );
            })}
            {!filteredEmployees.length && (
              <p className="p-3 text-sm text-muted-foreground">Nenhum funcionário ativo encontrado.</p>
            )}
          </div>
        )}

        {employee && company && (
          <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs block">Nome</span><strong>{employee.name}</strong></div>
            <div><span className="text-muted-foreground text-xs block">Empresa</span>{company.name}</div>
            <div><span className="text-muted-foreground text-xs block">Função</span>{employee.cargo}</div>
            <div><span className="text-muted-foreground text-xs block">CPF</span>{employee.cpf}</div>
            <div><span className="text-muted-foreground text-xs block">Matrícula</span>{employee.registro || '—'}</div>
            <div><span className="text-muted-foreground text-xs block">Unidade</span>{company.city || '—'}</div>
            <div>
              <span className="text-muted-foreground text-xs block">Data da Entrega</span>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedEmpId('');
                  setItems([]);
                }}
                className="text-xs text-destructive"
              >
                Trocar funcionário
              </Button>
            </div>
          </div>
        )}
      </div>

      {employee && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Itens da entrega</h2>
              <p className="text-xs text-muted-foreground mt-1">
                O campo “Item” é livre. CA e tamanho são opcionais.
              </p>
            </div>
            <Button size="sm" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar item
            </Button>
          </div>

          {items.map((item, index) => (
            <div key={index} className="border rounded-lg p-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] text-muted-foreground">Item</label>
                <Input
                  value={item.tipo}
                  onChange={(event) => updateItem(index, { tipo: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="Ex.: Chave de impacto"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Descrição</label>
                <Input
                  value={item.descricao}
                  onChange={(event) => updateItem(index, { descricao: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="Modelo, detalhe..."
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">CA</label>
                <Input
                  value={item.ca || ''}
                  onChange={(event) => updateItem(index, { ca: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Tamanho / Medida</label>
                <Input
                  value={item.tamanho}
                  onChange={(event) => updateItem(index, { tamanho: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Observação</label>
                <Input
                  value={item.observacao}
                  onChange={(event) => updateItem(index, { observacao: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="Opcional"
                />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground">Qtd</label>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={(event) => updateItem(index, { quantidade: Number(event.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}

          {!items.length && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Clique em “Adicionar item” e descreva livremente o que será entregue.
            </div>
          )}

          <Button onClick={handleGenerate} className="gradient-accent text-accent-foreground font-semibold">
            <FileText className="w-4 h-4 mr-2" />
            Gerar Protocolo de Entrega
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProtocoloEntregaLivrePage;
