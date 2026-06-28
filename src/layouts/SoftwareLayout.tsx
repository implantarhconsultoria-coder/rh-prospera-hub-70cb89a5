import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  Home,
  FileText,
  Wallet,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  Bell,
  Search,
  User,
  Building,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
  submenu?: NavItem[];
}

const SoftwareLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRoles, currentUser } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentCompany, setCurrentCompany] = useState('TOPAC Central');

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F: Busca global
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search');
        searchInput?.focus();
      }

      // Ctrl+S: Salvar (dispara evento customizado)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('save-shortcut'));
      }

      // Alt+1: Dashboard
      if (e.altKey && e.key === '1') {
        navigate('/dashboard');
      }

      // Alt+2: Faturamento
      if (e.altKey && e.key === '2') {
        navigate('/faturamento');
      }

      // Alt+3: Financeiro
      if (e.altKey && e.key === '3') {
        navigate('/financeiro');
      }

      // F1: Ajuda
      if (e.key === 'F1') {
        e.preventDefault();
        toast.info('Ajuda: Pressione Alt+1/2/3 para navegar. Ctrl+F para buscar. Ctrl+S para salvar.');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Home className="w-5 h-5" />,
      path: '/dashboard',
      badge: 0,
    },
    {
      id: 'faturamento',
      label: 'Faturamento',
      icon: <FileText className="w-5 h-5" />,
      path: '/faturamento',
      submenu: [
        { id: 'fat-dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4" />, path: '/faturamento' },
        { id: 'fat-clientes', label: 'Clientes', icon: <User className="w-4 h-4" />, path: '/faturamento/clientes' },
        { id: 'fat-contratos', label: 'Contratos', icon: <FileText className="w-4 h-4" />, path: '/faturamento/contratos' },
        { id: 'fat-medicoes', label: 'Medições', icon: <BarChart3 className="w-4 h-4" />, path: '/faturamento/medicoes' },
        { id: 'fat-faturas', label: 'Faturas', icon: <FileText className="w-4 h-4" />, path: '/faturamento/faturas' },
      ],
    },
    {
      id: 'financeiro',
      label: 'Financeiro',
      icon: <Wallet className="w-5 h-5" />,
      path: '/financeiro',
      submenu: [
        { id: 'fin-dashboard', label: 'Dashboard', icon: <Home className="w-4 h-4" />, path: '/financeiro' },
        { id: 'fin-receber', label: 'A Receber', icon: <CreditCard className="w-4 h-4" />, path: '/financeiro/receber' },
        { id: 'fin-pagar', label: 'A Pagar', icon: <CreditCard className="w-4 h-4" />, path: '/financeiro/pagar' },
        { id: 'fin-bancos', label: 'Contas Bancárias', icon: <Building className="w-4 h-4" />, path: '/financeiro/bancos' },
        { id: 'fin-conciliacao', label: 'Conciliação', icon: <BarChart3 className="w-4 h-4" />, path: '/financeiro/conciliacao' },
      ],
    },
    {
      id: 'relatorios',
      label: 'Relatórios',
      icon: <BarChart3 className="w-5 h-5" />,
      path: '/relatorios',
      submenu: [
        { id: 'rel-financeiro', label: 'Financeiro', icon: <BarChart3 className="w-4 h-4" />, path: '/relatorios/financeiro' },
        { id: 'rel-faturamento', label: 'Faturamento', icon: <FileText className="w-4 h-4" />, path: '/relatorios/faturamento' },
        { id: 'rel-fluxo', label: 'Fluxo de Caixa', icon: <Wallet className="w-4 h-4" />, path: '/relatorios/fluxo' },
      ],
    },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
    toast.success('Desconectado com sucesso');
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 text-white transition-all duration-300 flex flex-col border-r border-slate-800 overflow-hidden`}
      >
        {/* Logo/Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="text-lg font-bold">TOPAC</h1>
              <p className="text-xs text-slate-400">Software de Gestão</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-slate-800 rounded transition"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {navItems.map((item) => (
            <div key={item.id}>
              <button
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded transition ${
                  isActive(item.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={!sidebarOpen ? item.label : ''}
              >
                {item.icon}
                {sidebarOpen && (
                  <>
                    <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                    {item.badge ? (
                      <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </button>

              {/* Submenu */}
              {sidebarOpen && item.submenu && isActive(item.path) && (
                <div className="ml-4 mt-1 space-y-1 border-l border-slate-700 pl-2">
                  {item.submenu.map((subitem) => (
                    <button
                      key={subitem.id}
                      onClick={() => navigate(subitem.path)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition ${
                        location.pathname === subitem.path
                          ? 'bg-blue-500 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {subitem.icon}
                      <span>{subitem.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 p-3 space-y-2">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-slate-300 hover:bg-slate-800 hover:text-white transition"
            title={!sidebarOpen ? 'Configurações' : ''}
          >
            <Settings className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Configurações</span>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-slate-300 hover:bg-red-900/20 hover:text-red-400 transition"
            title={!sidebarOpen ? 'Sair' : ''}
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="text-sm">Sair</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="bg-white border-b border-border px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building className="w-4 h-4" />
              <span className="font-medium">{currentCompany}</span>
            </div>

            {/* Search Bar */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="global-search"
                type="text"
                placeholder="Busca global (Ctrl+F)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-muted rounded-lg text-sm border border-border focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="relative p-2 hover:bg-muted rounded-lg transition" title="Notificações">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {notifications > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>

            {/* User Menu */}
            <div className="flex items-center gap-3 pl-4 border-l border-border">
              <div className="text-right">
                <p className="text-sm font-medium">{currentUser?.email?.split('@')[0]}</p>
                <p className="text-xs text-muted-foreground">{userRoles?.[0] || 'Usuário'}</p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {currentUser?.email?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-slate-50">
          <div className="p-6">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoftwareLayout;
