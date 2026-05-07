import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, MicOff, Send, Loader2, Sparkles, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export interface AssistMsg {
  role: 'user' | 'assistant';
  content: string;
  proposta?: any;
}

interface Proposta {
  tipo: string;
  titulo: string;
  descricao: string;
  payload: any;
}

interface Props {
  /** Mostra título no topo */
  header?: boolean;
  /** Altura mínima/contêiner — em página dedicada use h-full */
  className?: string;
  /** Persiste em conversa do banco */
  conversaId?: string | null;
  onConversaCreated?: (id: string) => void;
}

const AssistenteChat: React.FC<Props> = ({ header = true, className = '', conversaId, onConversaCreated }) => {
  const { toast } = useToast();
  const nav = useNavigate();
  const [messages, setMessages] = useState<AssistMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const recRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const convIdRef = useRef<string | null>(conversaId ?? null);

  useEffect(() => {
    const W: any = window;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR) { setVoiceOk(false); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const txt = e.results[0]?.[0]?.transcript ?? '';
      setInput((prev) => (prev ? prev + ' ' : '') + txt);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Carrega histórico da conversa
  useEffect(() => {
    convIdRef.current = conversaId ?? null;
    if (!conversaId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from('assistente_mensagens')
        .select('role, content, data')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: true });
      setMessages((data || [])
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({ role: m.role, content: m.content, proposta: m.data?.proposta })));
    })();
  }, [conversaId]);

  const ensureConversa = async (firstUserText: string): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('assistente_conversas')
      .insert({ user_id: user.id, titulo: firstUserText.slice(0, 60) })
      .select('id')
      .single();
    if (error || !data) return null;
    convIdRef.current = data.id;
    onConversaCreated?.(data.id);
    return data.id;
  };

  const persistMessage = async (msg: AssistMsg) => {
    const cid = convIdRef.current;
    if (!cid) return;
    await supabase.from('assistente_mensagens').insert({
      conversa_id: cid,
      role: msg.role,
      content: msg.content,
      data: msg.proposta ? { proposta: msg.proposta } : null,
    });
  };

  const toggleMic = () => {
    if (!recRef.current) return;
    if (listening) { recRef.current.stop(); return; }
    try { recRef.current.start(); setListening(true); } catch {}
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    setProposta(null);

    const userMsg: AssistMsg = { role: 'user', content };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    const cid = await ensureConversa(content);
    if (cid) await persistMessage(userMsg);

    try {
      const { data, error } = await supabase.functions.invoke('assistente-operacional', {
        body: { messages: next.map(m => ({ role: m.role, content: m.content })) },
      });
      if (error) throw error;
      const reply: AssistMsg = {
        role: 'assistant',
        content: data?.reply || '...',
        proposta: data?.proposta || undefined,
      };
      setMessages([...next, reply]);
      if (reply.proposta) setProposta(reply.proposta);
      if (cid) await persistMessage(reply);
    } catch (e: any) {
      const msg = e?.message?.includes('429') ? 'Muitas requisições, aguarde um instante.'
        : e?.message?.includes('402') ? 'Créditos da IA esgotados.'
        : 'Erro ao consultar o assistente.';
      toast({ title: 'Falha', description: msg, variant: 'destructive' });
      setMessages([...next, { role: 'assistant', content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmarProposta = async () => {
    if (!proposta) return;
    try {
      switch (proposta.tipo) {
        case 'abrir_tela':
          if (proposta.payload?.route) nav(proposta.payload.route);
          break;
        case 'imprimir_documento':
          if (proposta.payload?.url) window.open(proposta.payload.url, '_blank');
          else if (proposta.payload?.route) nav(proposta.payload.route);
          break;
        case 'gerar_documento':
        case 'registrar_retirada_almoxarifado':
          // Encaminha para a tela correspondente com payload em query/state
          if (proposta.payload?.route) {
            nav(proposta.payload.route, { state: { assistentePayload: proposta.payload } });
          } else {
            toast({ title: 'Ação', description: 'Encaminhe para o módulo correspondente para concluir.' });
          }
          break;
      }
      toast({ title: 'Confirmado', description: proposta.titulo });
      setProposta(null);
    } catch (e) {
      toast({ title: 'Erro', description: 'Falha ao executar.', variant: 'destructive' });
    }
  };

  return (
    <div className={`flex flex-col bg-background ${className}`}>
      {header && (
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold leading-none">Assistente Operacional</div>
            <div className="text-xs text-muted-foreground mt-0.5">Pergunte em linguagem natural</div>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2 mt-4">
            <p>Exemplos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>"Atrasos e faltas do Rafael Olímpio neste mês"</li>
              <li>"Quantos abastecimentos o Diego fez do início do mês até agora?"</li>
              <li>"Mostra os EPIs entregues para o Júlio da Praia Grande"</li>
              <li>"Gera retirada de chave de fenda para o Edinaldo da Topac"</li>
            </ul>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            }`}>
              {m.role === 'assistant'
                ? <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-table:my-2"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                : <div className="whitespace-pre-wrap">{m.content}</div>}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pensando...
          </div>
        )}
      </div>

      {proposta && (
        <div className="border-t bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-sm">{proposta.titulo}</div>
              <div className="text-xs text-muted-foreground mt-1 prose prose-sm max-w-none">
                <ReactMarkdown>{proposta.descricao}</ReactMarkdown>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmarProposta}>Confirmar</Button>
            <Button size="sm" variant="ghost" onClick={() => setProposta(null)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="border-t p-3 flex items-end gap-2">
        <Button
          type="button"
          size="icon"
          variant={listening ? 'destructive' : 'outline'}
          onClick={toggleMic}
          disabled={!voiceOk || loading}
          title={voiceOk ? 'Falar' : 'Voz não suportada'}
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder={listening ? 'Ouvindo...' : 'Pergunte algo ou peça uma ação...'}
          rows={1}
          className="resize-none min-h-[40px] max-h-32"
          disabled={loading}
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

export default AssistenteChat;
