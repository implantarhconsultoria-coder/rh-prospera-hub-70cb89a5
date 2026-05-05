export const STATUS_DN4 = [
  { value: 'pendente', label: 'Pendente', cls: 'bg-muted text-foreground' },
  { value: 'em_conferencia', label: 'Em conferência', cls: 'bg-warning/20 text-warning' },
  { value: 'emitido', label: 'Emitido', cls: 'bg-primary/15 text-primary' },
  { value: 'finalizado', label: 'Finalizado', cls: 'bg-success/20 text-success' },
  { value: 'cancelado', label: 'Cancelado', cls: 'bg-muted text-muted-foreground line-through' },
  { value: 'com_erro', label: 'Com erro', cls: 'bg-destructive/15 text-destructive' },
] as const;

export type StatusDN4 = typeof STATUS_DN4[number]['value'];

export const statusMeta = (s: string) =>
  STATUS_DN4.find((x) => x.value === s) ?? { value: s, label: s, cls: 'bg-muted text-foreground' };

export const fmtBRL = (n: number) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const competenciaAtual = () => new Date().toISOString().slice(0, 7);
