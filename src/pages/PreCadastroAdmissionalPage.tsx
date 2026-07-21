import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText } from '@/lib/pdf';
import { toast } from 'sonner';

const MARK = 'data-topac-batch-upload';
const BUCKETS = ['documentos-admissionais', 'documentos-funcionarios', 'atestados', 'documentos-ativos'];

const clean