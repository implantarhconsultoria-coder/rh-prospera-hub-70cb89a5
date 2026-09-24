import {
  Archive, BarChart3, Building2, CalendarDays, Car, ClipboardCheck, ClipboardList,
  FileText, Fuel, HardHat, History, Package, ReceiptText, Search, Shirt, Stethoscope,
  Tags, Users, WalletCards, Wrench, ShoppingCart, Radar, UserCheck, Bus, FileCheck2,
  Settings, BookOpen, ClipboardPenLine,
} from 'lucide-react';

// Catálogo único de navegação administrativa: desktop, mobile, busca e menu lateral.
// Um módulo só entra aqui se a rota existir no App.tsx.
export const ADMIN_MODULE_GROUPS = [
  {
    id: 'frequentes', title: 'Acessos do dia a dia',
    subtitle: 'O que você consulta e movimenta com frequência',
    items: [
      {label:'VR',description:'Vale-refeição • relatório e conferência',path:'/admin/relatorio-vr',icon:WalletCards},
      {label:'VT',description:'Vale-transporte • relatório e conferência',path:'/admin/relatorio-vt',icon:Bus},
      {label:'Funcionários',description:'Cadastro e histórico por funcionário',path:'/admin/funcionarios',icon:Users},
      {label:'Uniformes',description:'Estoque, entrega e impressão',path:'/admin/uniformes',icon:Shirt},
      {label:'Estoque Interno',description:'Materiais do escritório',path:'/admin/estoque-interno',icon:Archive},
      {label:'Tela da Equipe',description:'Ver o estoque como os colaboradores',path:'/estoque-interno',icon:Package},
      {label:'Entrega de EPI',description:'Fichas e controle de entrega',path:'/admin/epi',icon:HardHat},
      {label:'Almoxarifado',description:'Estoque operacional',path:'/admin/almoxarifado',icon:Package},
      {label:'Ponto',description:'Conferência e registros',path:'/admin/fechamento-ponto',icon:ClipboardCheck},
      {label:'Assinatura Digital',description:'Holerites e recibos assinados',path:'/admin/folha-pagamento',icon:ReceiptText},
    ],
  },
  {
    id: 'rh', title: 'RH e benefícios',
    subtitle: 'Admissão, afastamentos, documentos e fechamento',
    items: [
      {label:'Empresas',description:'Empresas e filiais',path:'/admin/empresas',icon:Building2},
      {label:'Pré-cadastro admissional',description:'Preparar nova admissão',path:'/admin/pre-cadastro-admissional',icon:UserCheck},
      {label:'Férias',description:'Avisos e programação',path:'/admin/aviso-ferias',icon:CalendarDays},
      {label:'Atestados',description:'Conferência de justificativas',path:'/admin/atestados',icon:Stethoscope},
      {label:'ASO',description:'Exames ocupacionais',path:'/admin/aso',icon:Stethoscope},
      {label:'Central da Contabilidade',description:'Rotinas e solicitações contábeis',path:'/admin/central-contabilidade',icon:ClipboardList},
      {label:'Fechamento',description:'Conferência de pagamentos',path:'/admin/fechamento',icon:ClipboardCheck},
      {label:'Fechamentos das filiais',description:'Acompanhamento por unidade',path:'/admin/fechamentos-filiais',icon:FileCheck2},
      {label:'Rescisões',description:'Controle de desligamentos',path:'/admin/rescisoes',icon:ClipboardPenLine},
      {label:'Lançamentos',description:'Lançamentos de RH',path:'/admin/lancamentos',icon:FileText},
    ],
  },
  {
    id: 'materiais', title: 'Materiais e compras',
    subtitle: 'Controle e abastecimento dos estoques',
    items: [
      {label:'Compras',description:'Solicitações de compra',path:'/admin/compras',icon:ShoppingCart},
      {label:'Etiquetas',description:'Impressão e identificação',path:'/admin/etiquetas',icon:Tags},
      {label:'Prestadores',description:'Prestadores cadastrados',path:'/admin/prestadores',icon:UserCheck},
    ],
  },
  {
    id: 'operacional', title: 'Operacional e frota',
    subtitle: 'Mecânicos, veículos e combustíveis',
    items: [
      {label:'Operacional',description:'Chamados e solicitações',path:'/admin/operacional',icon:ClipboardList},
      {label:'App Mecânico',description:'Gestão do aplicativo',path:'/admin/app-mecanico',icon:Wrench},
      {label:'Abastecimento',description:'Relatório e comprovantes',path:'/admin/abastecimento-qrcode',icon:Fuel},
      {label:'Combustível',description:'Galões e controle',path:'/admin/galoes-combustivel',icon:Fuel},
      {label:'Frota / Documentos',description:'Veículos, IPVA e licenciamento',path:'/admin/documentos-ativos',icon:Car},
      {label:'Rastreamento da Frota',description:'Monitoramento de veículos',path:'/admin/monitoramento',icon:Radar},
    ],
  },
  {
    id: 'gestao', title: 'Gestão e consultas',
    subtitle: 'Relatórios, histórico e configurações',
    items: [
      {label:'Relatórios',description:'Indicadores da empresa',path:'/admin/relatorio',icon:BarChart3},
      {label:'Histórico',description:'Documentos e registros',path:'/admin/historico',icon:History},
      {label:'Base mestra',description:'Consolidação de cadastros',path:'/admin/base-mestra',icon:BookOpen},
      {label:'Configurações',description:'Preferências administrativas',path:'/admin/configuracoes',icon:Settings},
    ],
  },
] as const;
export const ADMIN_MODULES = ADMIN_MODULE_GROUPS.flatMap(group=>group.items);
export const findAdminModule=(path:string)=>ADMIN_MODULES.find(m=>m.path===path);
