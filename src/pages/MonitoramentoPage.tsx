import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Activity, Users, Clock, Monitor } from 'lucide-react';

interface ActivityLog {
  id: string; email: string; nome: string; module: string; route: string;
  filial: string; action: string; logged_in_at: string; last_activity_at: string;
  status: string;
}

const MonitoramentoPage: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const fetchLogs = async () => {
    const { data } = await supabase.from('activity_log').select('*').order('last_activity_at', { ascending: false }).limit(100);
    if (data) setLogs(data as unknown as ActivityLog[]);
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = logs.filter(l => l.status === 'online').length;
  const inactiveCount = logs.filter(l => l.status === 'inativo').length;

  const statusColor = (s: string) => {
    if (s === 'online') return 'default';
    if (s === 'inativo') return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="card-premium p-6 gradient-primary text-primary-foreground">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-primary-foreground/20 rounded-2xl flex items-center justify-center">
            <Monitor className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display">Monitoramento Central</h1>
            <p className="text-primary-foreground/70 text-sm">Painel em tempo real — somente administrador</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-premium p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Online Agora</p><p className="text-2xl font-bold text-foreground">{onlineCount}</p></div>
        </div>
        <div className="card-premium p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5 text-yellow-600" /></div>
          <div><p className="text-xs text-muted-foreground">Inativos</p><p className="text-2xl font-bold text-foreground">{inactiveCount}</p></div>
        </div>
        <div className="card-premium p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Activity className="w-5 h-5 text-blue-600" /></div>
          <div><p className="text-xs text-muted-foreground">Total Registros</p><p className="text-2xl font-bold text-foreground">{logs.length}</p></div>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 sticky top-0 z-10">
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Usuário</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">E-mail</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Filial</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Módulo</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tela</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Login</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Última Atividade</th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
          </tr></thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs font-medium">{log.nome || '—'}</td>
                <td className="px-3 py-2 text-xs">{log.email}</td>
                <td className="px-3 py-2 text-xs">{log.filial || 'Central'}</td>
                <td className="px-3 py-2 text-xs">{log.module || '—'}</td>
                <td className="px-3 py-2 text-xs">{log.route || '—'}</td>
                <td className="px-3 py-2 text-xs">{new Date(log.logged_in_at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-xs">{new Date(log.last_activity_at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2">
                  <Badge variant={statusColor(log.status) as any}>{log.status}</Badge>
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">Nenhum registro de atividade</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonitoramentoPage;
