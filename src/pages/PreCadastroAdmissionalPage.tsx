import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';
import { supabase } from '@/integrations/supabase/client';
import { extractPdfText, renderPdfPagesToDataUrls } from '@/lib/pdf';
import { toast } from 'sonner';

const CUSTOM_FUNCAO_VALUE = '__topac_custom_funcao__';
const ASO_DATE_INPUT_ID = 'topac-aso-data-exame';
const ASO_DATE_STORAGE_KEY = 'topac_pre_cadastro_data_exame_aso';
const MULTI_UPLOAD_ATTR = 'data-topac-multi-upload';
const BATCH_RUNNING