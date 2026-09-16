export type LabelSizeKey = 'small' | 'medium' | 'large';

export type EquipmentLabelTemplate = {
  id: string;
  category: string;
  title: string;
  brand: string;
  model: string;
  specs: string[];
  spriteIndex: number;
  recommendedSize: LabelSizeKey;
  specialTemplate?: 'm27';
};

export const LABEL_SIZES: Record<LabelSizeKey, { label: string; widthMm: number; heightMm: number }> = {
  small: { label: 'PEQUENO', widthMm: 60, heightMm: 90 },
  medium: { label: 'MÉDIO', widthMm: 90, heightMm: 130 },
  large: { label: 'GRANDE', widthMm: 130, heightMm: 180 },
};

export const EQUIPMENT_LABEL_CATALOG: EquipmentLabelTemplate[] = [
  { id:'m270', category:'Compressores de Ar', title:'Compressor de Ar', brand:'KAESER', model:'M-270', spriteIndex:0, recommendedSize:'large', specs:['Descarga efetiva: 900 PCM','Pressão de trabalho: 10 bar','Motor diesel Mercedes Benz OM501 LA','Peso operacional: 5.025 kg','Tanque de combustível: 560 litros','Dimensões: 6000 x 2000 x 2400 mm','Consumo: 42 a 45 litros/hora'] },
  { id:'m57', category:'Compressores de Ar', title:'Compressor de Ar', brand:'KAESER', model:'M-57', spriteIndex:1, recommendedSize:'large', specs:['Descarga efetiva: 210 PCM','Pressão de trabalho: 7 bar','Motor diesel Kubota V2403','Peso operacional: 1.225 kg','Tanque de combustível: 105 litros','Dimensões: 2142 x 1680 x 1480 mm'] },
  { id:'m122', category:'Compressores de Ar', title:'Compressor de Ar', brand:'KAESER', model:'M-122', spriteIndex:2, recommendedSize:'large', specs:['Descarga efetiva: 400 PCM','Pressão de trabalho: 7 bar','Motor diesel Deutz BF4M','Peso operacional: 1.865 kg','Tanque de combustível: 170 litros','Dimensões: 4710 x 1860 x 1600 mm','Nível de ruído: 72 dB'] },
  { id:'m27', category:'Compressores de Ar', title:'Compressor de Ar', brand:'KAESER', model:'M-27', spriteIndex:3, recommendedSize:'large', specialTemplate:'m27', specs:['Descarga efetiva: 92 PCM','Pressão de trabalho: 7 bar','Motor diesel Kubota D1105','Peso operacional: 574 kg','Tanque de combustível: 40 litros','Dimensões: 3250 x 1260 x 1240 mm','Nível de ruído: 60 dB'] },
  { id:'t6000', category:'Compressores de Ar', title:'Moto-Compressor', brand:'TOPAC', model:'T-6000', spriteIndex:4, recommendedSize:'medium', specs:['Motor gasolina Honda 4 tempos','Potência: 24 CV','Partida elétrica','Capacidade: 74 PCM','Pressão de trabalho máxima: 7 bar','Dimensões: 890 x 940 x 780 mm'] },

  { id:'t3', category:'Equipamentos Pneumáticos', title:'Rompedor', brand:'TOPAC', model:'T3', spriteIndex:5, recommendedSize:'small', specs:['Peso: 3,5 kg','Pistão: 37,4 mm','Curso: 34 mm','Golpes por minuto: 3800','Ferramenta: 3/4"','Consumo de ar: 12 PCM'] },
  { id:'t5', category:'Equipamentos Pneumáticos', title:'Rompedor', brand:'TOPAC', model:'T5', spriteIndex:6, recommendedSize:'small', specs:['Peso: 5 kg','Pistão: 28 mm','Curso: 63 mm','Golpes por minuto: 2650','Ferramenta: 3/4"','Consumo de ar: 15 PCM'] },
  { id:'t111', category:'Equipamentos Pneumáticos', title:'Acunhador', brand:'TOPAC', model:'T111', spriteIndex:7, recommendedSize:'small', specs:['Ideal para desmonte de rochas','Trabalha com cunhas colocadas nos furos previamente feitos','Detonação equivalente a dinamite ou cimento expansivo','Peso: 12 kg','Consumo de ar: 63 PCM'] },
  { id:'t8', category:'Equipamentos Pneumáticos', title:'Rompedor', brand:'TOPAC', model:'T8', spriteIndex:8, recommendedSize:'small', specs:['Peso: 8 kg','Pistão: 38 mm','Curso: 95 mm','Golpes por minuto: 1250','Ferramenta: cilíndrica','Consumo de ar: 31 PCM'] },
  { id:'t103', category:'Equipamentos Pneumáticos', title:'Rompedor', brand:'TOPAC', model:'T103', spriteIndex:9, recommendedSize:'small', specs:['Peso: 10,5 kg','Pistão: 38 mm','Curso: 95 mm','Golpes por minuto: 1250','Ferramenta: 7/8"','Consumo de ar: 31 PCM'] },
  { id:'t275', category:'Equipamentos Pneumáticos', title:'Rompedor', brand:'TOPAC', model:'T275', spriteIndex:10, recommendedSize:'medium', specs:['Peso: 27 kg','Pistão: 50 mm','Curso: 150 mm','Golpes por minuto: 1180','Ferramenta: 1 1/4"','Consumo de ar: 49 PCM'] },
  { id:'t43_68', category:'Equipamentos Pneumáticos', title:'Perfuratriz', brand:'TOPAC', model:'T43/68', spriteIndex:11, recommendedSize:'medium', specs:['Peso: 17 kg','Golpes por minuto: 2300','Ferramenta: broca','Encaixe: 7/8"','Consumo de ar: 50 PCM'] },
  { id:'t58_68', category:'Equipamentos Pneumáticos', title:'Perfuratriz', brand:'TOPAC', model:'T58/68', spriteIndex:12, recommendedSize:'medium', specs:['Peso: 25 kg','Golpes por minuto: 1800','Ferramenta: broca','Encaixe: 7/8"','Consumo de ar: 65 PCM'] },
  { id:'t1910', category:'Equipamentos Pneumáticos', title:'Pá Pneumática', brand:'TOPAC', model:'T1910', spriteIndex:13, recommendedSize:'small', specs:['Largura da pá: 80 cm','Peso: 6 kg','Pressão de trabalho: 7 bar','Golpes por minuto: 1960','Consumo de ar: 30 PCM'] },
  { id:'ram', category:'Equipamentos Pneumáticos', title:'Soquete', brand:'TOPAC', model:'RAM', spriteIndex:14, recommendedSize:'small', specs:['Peso: 18 kg','Consumo de ar: 30 PCM','Sapata em ferro e borracha'] },
  { id:'mole', category:'Equipamentos Pneumáticos', title:'Cabeça Móvel', brand:'TOPAC', model:'MOLE', spriteIndex:15, recommendedSize:'small', specs:['Velocidade de perfuração: 12 m/h','Diâmetro de perfuração: 2"','Consumo de ar: 21 PCM','Comprimento: 103 cm','Peso: 13 kg'] },

  { id:'gsh500', category:'Diversos', title:'Rompedor Elétrico 5 kg', brand:'BOSCH', model:'GSH500', spriteIndex:16, recommendedSize:'small', specs:['Monofásico: 220 Volts','Potência: 1150 W','Impactos por minuto: 1300 a 2900 rpm','Força de impacto: 13 J','Peso: 5,8 kg','Medidas: 480 x 105 x 235 mm','Encaixe da ferramenta: SDS-Max'] },
  { id:'gsh11de', category:'Diversos', title:'Rompedor Elétrico 10 kg', brand:'BOSCH', model:'GSH11DE', spriteIndex:17, recommendedSize:'small', specs:['Monofásico: 220 Volts','Potência: 1150 W','Impactos por minuto: 1100 a 2250 rpm','Força de impacto: 18 J','Peso: 11,1 kg','Medidas: 595 x 280 mm','Encaixe da ferramenta: SDS-Max'] },
  { id:'gsh16_28', category:'Diversos', title:'Rompedor Elétrico 17 kg', brand:'BOSCH', model:'GSH16-28', spriteIndex:18, recommendedSize:'medium', specs:['Monofásico: 220 Volts','Potência: 1750 W','Impactos por minuto: 1300 rpm','Força de impacto: 45 J','Peso: 17,9 kg','Medidas: 760 x 255 mm','Encaixe da ferramenta: sextavado'] },
  { id:'gsh27vc', category:'Diversos', title:'Rompedor Elétrico 30 kg', brand:'BOSCH', model:'GSH27VC', spriteIndex:19, recommendedSize:'medium', specs:['Monofásico: 220 Volts','Potência: 2000 W','Impactos por minuto: 1000 rpm','Força de impacto: 62 J','Peso: 29,5 kg','Encaixe da ferramenta: sextavado','Taxa de remoção em concreto médio duro: 3,2 ton/hora'] },
  { id:'mini_dumper', category:'Diversos', title:'Mini Dumper', brand:'TOPAC', model:'MINI DUMPER', spriteIndex:20, recommendedSize:'large', specs:['Capacidade em terreno plano: 650 kg','Capacidade em terreno com elevação: 500 kg','Dumper autocarregável com esteiras','Motor Honda GX-270 - 11 HP / 3600 rpm','Transmissão hidráulica','Velocidade máxima sem carga: 4,5 km/h','Reservatório de óleo: 18 l','Pressão de trabalho: 180 bar'] },
  { id:'ibix25p', category:'Diversos', title:'Ecojateadora Portátil', brand:'IBIX', model:'25P', spriteIndex:21, recommendedSize:'medium', specs:['Leve, fácil de operar e transportar','Máquina eficaz, limpa e extremamente versátil','Abrasivo tipo Garnet de baixo impacto ambiental','Abrasivos entre 38 µm e 1,8 mm','Redução de custos de elaboração','Melhoria das condições de trabalho do operador'] },

  { id:'srv620', category:'Corte e Compactação', title:'Compactador de Solo', brand:'WEBER', model:'SRV 620', spriteIndex:22, recommendedSize:'medium', specs:['Motor Honda 4 tempos','Potência: 3 HP / 3600 rpm','Peso: 65 kg','Dimensões da sapata: 280 x 320 mm','Força do golpe: 21 kN','Profundidade de compactação: até 60 cm','Área de compactação: 320 m²/h','Velocidade de avanço: 22 m/min'] },
  { id:'concret_cutter', category:'Corte e Compactação', title:'Cortadora de Pisos', brand:'TOPAC', model:'CONCRET CUTTER', spriteIndex:23, recommendedSize:'medium', specs:['Motor Honda 4 tempos','Combustível: gasolina','Potência: 13 HP','Capacidade máxima do disco: 14"','Profundidade máxima do corte: 165 mm','Capacidade do reservatório de água: 25 litros','Peso: 90 kg'] },
  { id:'rcw900', category:'Corte e Compactação', title:'Rolo Compactador', brand:'WEBER', model:'RCW 900', spriteIndex:24, recommendedSize:'large', specs:['Hidrostático com aspersor de água, horímetro, faróis e sirene','Peso: 1.580 kg','Dimensões: 1020 x 1820 x 2600 mm','Combustível: gasolina','Força centrífuga: 15,2 kN','Frequência: 63 Hz','Profundidade de compactação: 15 a 30 cm','Largura de rolagem: 90 cm','Tanque de combustível: 25 l','Área máxima de compactação: 2000 m²/h'] },
  { id:'cf2', category:'Corte e Compactação', title:'Placa Vibratória', brand:'WEBER', model:'CF 2', spriteIndex:25, recommendedSize:'medium', specs:['Motor Honda 4 tempos','Combustível: gasolina','Potência: 5,5 HP','Peso: 80 kg','Dimensões da placa: 45 x 55 cm','Força centrífuga: 15 kN','Frequência: 98 Hz','Profundidade máxima de compactação: até 30 cm','Velocidade de avanço: 25 m/min','Consumo: 1,5 litros/hora'] },
  { id:'gerador_portatil', category:'Geradores', title:'Gerador Portátil', brand:'DIVERSAS MARCAS', model:'5 A 15 KVA', spriteIndex:26, recommendedSize:'medium', specs:['Geradores portáteis','Combustível: gasolina ou diesel','Potência: 5 a 15 kVA'] },
  { id:'gerador_estacionario', category:'Geradores', title:'Gerador Estacionário', brand:'DIVERSAS MARCAS', model:'55 A 200 KVA', spriteIndex:27, recommendedSize:'large', specs:['Geradores estacionários a diesel de 55 a 200 kVA','Operação contínua em locais sem eletricidade da rede','Projetados para transporte rápido e ágil, seguro e de fácil manuseio','Carenagem silenciada para baixo nível de ruído','Facilidade de acesso aos pontos de serviço e manutenção'] },
];

export const EQUIPMENT_CATEGORIES = Array.from(new Set(EQUIPMENT_LABEL_CATALOG.map((item) => item.category)));
