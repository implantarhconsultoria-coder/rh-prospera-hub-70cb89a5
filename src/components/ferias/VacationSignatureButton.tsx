import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { gerarAvisoFeriasPdf } from '@/lib/pdfGenerator';
import { sha256Browser } from '@/lib/payrollDocuments';

const BUCKET = 'payroll-private';
const DOCUMENT_TYPE = 'AVISO_FERIAS';

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const normalizeWhatsappPhone = (value: unknown) => {
  const phone = digits(value);
  if (phone.length === 10 || phone.length === 11) return `55${phone}`;
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) return phone;
  return '';
};

const safeFile = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '_')
  .slice(0, 100);

const formatDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

type VacationSignatureButtonProps = {
  employee: any;
  company: any;
  inicioFerias: string;
  fimFerias: string;
  retorno: string;
  diasFerias: number;
  session: any;
  onBeforePublish?: () => Promise<any>;
};

const VacationSignatureButton: React.FC<VacationSignatureButtonProps> = ({
  employee,
  company,
  inicioFerias,
  fimFerias,
  retorno,
  diasFerias,
  session,
  onBeforePublish,
}) => {
  const [publishing, setPublishing] = useState(false);

  const publish = async () => {
    if (!employee || !company || !inicioFerias || !fimFerias || !retorno) {
      toast.error('Preencha e salve o período de férias antes de enviar.');
      return;
    }
    if (!session?.user?.id) {
      toast.error('Sua sessão administrativa expirou. Entre novamente.');
      return;
    }

    setPublishing(true);
    try {
      if (onBeforePublish) {
        const saved = await onBeforePublish();
        if (!saved) throw new Error('Não foi possível salvar o aviso de férias antes do envio.');
      }

      const pdf = gerarAvisoFeriasPdf({
        empresa: company.name,
        cnpj: company.cnpj,
        nome: employee.name,
        cpf: employee.cpf,
        rg: employee.rg,
        matricula: employee.registro,
        funcao: employee.cargo,
        dataAdmissao: employee.dataAdmissao,
        inicioFerias,
        retornoFerias: retorno,
        diasFerias,
      });
      const documentHash = await sha256Browser(pdf.blob);
      const competencia = inicioFerias.slice(0, 7);

      const { data: current, error: currentError } = await (supabase as any)
        .from('payroll_documents')
        .select('id,document_version,document_sha256,storage_path,status')
        .eq('employee_id', employee.id)
        .eq('company_id', employee.companyId)
        .eq('competencia', competencia)
        .eq('document_type', DOCUMENT_TYPE)
        .eq('is_current', true)
        .maybeSingle();
      if (currentError) throw currentError;

      let documentId = current?.id || '';
      if (current?.document_sha256 === documentHash) {
        const { data: signature, error: signatureError } = await (supabase as any)
          .from('payroll_signatures')
          .select('id')
          .eq('document_id', current.id)
          .maybeSingle();
        if (signatureError) throw signatureError;
        if (signature) {
          toast.info('Este Aviso de Férias já foi assinado pelo funcionário.');
          return;
        }
      } else {
        const fileName = safeFile(pdf.fileName || `Aviso_Ferias_${employee.name}_${competencia}.pdf`);
        const storagePath = `${employee.companyId}/${competencia}/aviso-ferias/${employee.id}/${Date.now()}-${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, pdf.blob, { contentType: 'application/pdf', upsert: false });
        if (uploadError) throw uploadError;

        let oldReplaced = false;
        try {
          if (current?.id) {
            const { error: replaceError } = await (supabase as any)
              .from('payroll_documents')
              .update({ is_current: false, status: 'SUBSTITUIDO', updated_at: new Date().toISOString() })
              .eq('id', current.id);
            if (replaceError) throw replaceError;
            oldReplaced = true;
          }

          const { data: created, error: createError } = await (supabase as any)
            .from('payroll_documents')
            .insert({
              company_id: employee.companyId,
              employee_id: employee.id,
              competencia,
              document_type: DOCUMENT_TYPE,
              storage_bucket: BUCKET,
              storage_path: storagePath,
              original_filename: fileName,
              mime_type: 'application/pdf',
              file_size: pdf.blob.size,
              document_sha256: documentHash,
              document_version: Number(current?.document_version || 0) + 1,
              is_current: true,
              net_amount: null,
              extracted_data: {
                source: 'AVISO_FERIAS',
                ferias_inicio: inicioFerias,
                ferias_fim: fimFerias,
                retorno,
                dias_ferias: diasFerias,
              },
              status: 'AGUARDANDO_ASSINATURA',
              confirmed: true,
              confirmed_at: new Date().toISOString(),
              confirmed_by: session.user.id,
              created_by: session.user.id,
            })
            .select('id')
            .single();
          if (createError) throw createError;
          documentId = created.id;
        } catch (error) {
          if (oldReplaced && current?.id) {
            await (supabase as any)
              .from('payroll_documents')
              .update({ is_current: true, status: current.status || 'AGUARDANDO_ASSINATURA', updated_at: new Date().toISOString() })
              .eq('id', current.id);
          }
          await supabase.storage.from(BUCKET).remove([storagePath]);
          throw error;
        }
      }

      window.dispatchEvent(new Event('topac:refresh-current'));

      const phone = normalizeWhatsappPhone(employee.celular || employee.telefone);
      const portalSlug = String(company.codigo || '').trim().toLowerCase();
      if (!phone || !portalSlug) {
        toast.success('Aviso de Férias publicado para assinatura no portal do funcionário.');
        if (!phone) toast.warning('O funcionário está sem celular válido para abrir o WhatsApp automaticamente.');
        return;
      }

      const portalUrl = `${window.location.origin}/holerite/${encodeURIComponent(portalSlug)}`;
      const text = [
        `Olá, ${employee.name}! Seu Aviso de Férias está disponível no Portal TOPAC RH PRO da ${company.name || 'empresa'} para conferência e assinatura.`,
        '',
        `Período: ${formatDate(inicioFerias)} a ${formatDate(fimFerias)}`,
        `Retorno previsto: ${formatDate(retorno)}`,
        '',
        'Acesse pelo link abaixo e entre com seu CPF, data de nascimento e os 4 últimos números do celular cadastrado:',
        '',
        portalUrl,
      ].join('\n');

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      toast.success(`Aviso de Férias publicado para assinatura${documentId ? '' : '.'}`);
    } catch (error: any) {
      console.error('[vacation-signature-publish]', error);
      toast.error(error?.message || 'Não foi possível enviar o Aviso de Férias para assinatura.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={() => void publish()}
      disabled={publishing || !inicioFerias}
      className="bg-emerald-600 text-white hover:bg-emerald-500"
    >
      <MessageCircle className="mr-2 h-4 w-4" />
      {publishing ? 'Preparando assinatura...' : 'Enviar ao Funcionário para Assinar'}
    </Button>
  );
};

export default VacationSignatureButton;
