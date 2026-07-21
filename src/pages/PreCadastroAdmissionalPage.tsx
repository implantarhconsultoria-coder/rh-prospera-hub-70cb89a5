import React, { useEffect } from 'react';
import PreCadastroAdmissionalOcrPage from './PreCadastroAdmissionalOcrPage';

const CUSTOM_FUNCAO_VALUE = '__topac_custom_funcao__';
const ASO_DATE_INPUT_ID = 'topac-aso-data-exame';
const ASO_DATE_STORAGE_KEY = 'topac_pre_cadastro_data_exame_aso';
const BATCH_HELPER_ID = 'topac-documentos-lote-helper';
const BATCH_PROCESSING_ATTR = 'data-topac-batch-processing';
const SYNTHETIC_CHANGE_ATTR = 'data-topac-synthetic