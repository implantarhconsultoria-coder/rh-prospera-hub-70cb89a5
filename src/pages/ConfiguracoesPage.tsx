import React from 'react';
import { Building2, Award, ShieldCheck, UserCog, Globe2, KeyRound, Database, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';

const ConfiguracoesPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useApp();
  const adminEmail = session?.user?.email || 'admin';

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
          <SlidersHorizontal className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Configuracao do Software</h1>
          <p className="text-sm text-muted-foreground">Painel responsavel pela plataforma, acessos e governanca operacional.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-3">
          <UserCog className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-bold">Usuario responsavel</h2>
            <p className="text-sm text-muted-foreground">{adminEmail}</p>
          </div>
          <Badge className="w-fit">ADM master</Badge>
        </Card>
        <Card className="p-5 space-y-3">
          <Globe2 className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-bold">Dominios de acesso</h2>
            <p className="text-sm text-muted-foreground">topacrh.pro para acesso por CPF. www.topacrh.pro para ADM.</p>
          </div>
          <Badge variant="secondary" className="w-fit">Preparado</Badge>
        </Card>
        <Card className="p-5 space-y-3">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <div>
            <h2 className="font-bold">Permissao</h2>
            <p className="text-sm text-muted-foreground">ADM e o unico acesso completo. Demais usuarios entram por CPF/PIN e modulo liberado.</p>
          </div>
          <Badge variant="secondary" className="w-fit">Controle total</Badge>
        </Card>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Regras de acesso</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-semibold">ADM central</h3>
            <p className="text-muted-foreground mt-1">Entra pelo dominio administrativo e gerencia todos os modulos, usuarios, dados e permissoes.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-semibold">Usuarios operacionais</h3>
            <p className="text-muted-foreground mt-1">Entram pelo acesso unico com os 4 ultimos digitos do CPF. A plataforma reconhece a pessoa pela base e libera somente o modulo autorizado.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-semibold">Filiais</h3>
            <p className="text-muted-foreground mt-1">Praia Grande e Goiania continuam com acesso limitado de RH, incluindo envio de documentos para historico do funcionario.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <h3 className="font-semibold">Financeiro, faturamento e operacional</h3>
            <p className="text-muted-foreground mt-1">Cada area recebe permissao de menu, rota e dados. Operacional consulta clientes/equipamentos sem exibir valores de contrato.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/admin/gerenciar-usuarios')}>Cadastro de usuarios</Button>
          <Button variant="outline" onClick={() => navigate('/admin/acessos-externos')}>Liberar modulos por CPF/PIN</Button>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Base operacional preparada</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="admin-metric-cell"><p>Faturamento</p><strong>clientes e contratos</strong></div>
          <div className="admin-metric-cell"><p>Operacional</p><strong>chamados sem valor</strong></div>
          <div className="admin-metric-cell"><p>RH filiais</p><strong>upload documental</strong></div>
        </div>
        <p className="text-sm text-muted-foreground">
          Quando um contrato e cadastrado no faturamento, o modulo operacional passa a enxergar o cliente, contratos ativos e equipamentos vinculados para abertura de chamados.
        </p>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold font-display">Sobre</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><strong>Produto:</strong> TOPAC RH PRO / Multiempresas</div>
          <div><strong>Responsavel:</strong> Administracao central</div>
          <div><strong>Finalidade:</strong> RH, operacional, faturamento, financeiro e app dos mecanicos.</div>
          <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /><span>Preparado para importacao de dados reais.</span></div>
        </div>
      </Card>
    </div>
  );
};

export default ConfiguracoesPage;
