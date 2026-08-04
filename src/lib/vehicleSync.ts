export type VehicleSyncRecord = {
  id: string;
  descricao?: string | null;
  placa?: string | null;
  patrimonio?: string | null;
  renavam?: string | null;
  chassi?: string | null;
  ano_fabricacao?: string | null;
  ano_modelo?: string | null;
  empresa?: string | null;
  arquivo_url?: string | null;
  documento_url?: string | null;
  observacao?: string | null;
};

export type ProtocolVehicleFields = {
  ativoId: string;
  descricao: string;
  placa: string;
  patrimonio: string;
  renavam: string;
  chassi: string;
  anoFabricacao: string;
  anoModelo: string;
  empresa: string;
  pdfUrl: string;
  observacao: string;
};

export const normalizeVehiclePlate = (value: unknown) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '')
  .slice(0, 7);

export const normalizeRenavam = (value: unknown) => String(value || '').replace(/\D/g, '').slice(0, 11);

export const normalizeChassi = (value: unknown) => String(value || '')
  .toUpperCase()
  .replace(/[^A-HJ-NPR-Z0-9]/g, '')
  .slice(0, 17);

export const hasRequiredVehicleIdentity = (vehicle: Pick<VehicleSyncRecord, 'renavam' | 'chassi'>) =>
  normalizeRenavam(vehicle.renavam).length >= 9 && normalizeChassi(vehicle.chassi).length === 17;

export const vehicleIdentityWarnings = (vehicle: Pick<VehicleSyncRecord, 'renavam' | 'chassi'>) => {
  const warnings: string[] = [];
  if (normalizeRenavam(vehicle.renavam).length < 9) warnings.push('RENAVAM obrigatório não identificado.');
  if (normalizeChassi(vehicle.chassi).length !== 17) warnings.push('Chassi obrigatório não identificado ou incompleto.');
  return warnings;
};

export const findVehicleByPlate = <T extends VehicleSyncRecord>(vehicles: T[], plate: unknown): T | null => {
  const normalized = normalizeVehiclePlate(plate);
  if (normalized.length !== 7) return null;
  return vehicles.find((vehicle) => normalizeVehiclePlate(vehicle.placa) === normalized) || null;
};

export const toProtocolVehicleFields = (vehicle: VehicleSyncRecord): ProtocolVehicleFields => ({
  ativoId: vehicle.id,
  descricao: String(vehicle.descricao || '').trim(),
  placa: normalizeVehiclePlate(vehicle.placa),
  patrimonio: String(vehicle.patrimonio || '').trim(),
  renavam: normalizeRenavam(vehicle.renavam),
  chassi: normalizeChassi(vehicle.chassi),
  anoFabricacao: String(vehicle.ano_fabricacao || '').replace(/\D/g, '').slice(0, 4),
  anoModelo: String(vehicle.ano_modelo || '').replace(/\D/g, '').slice(0, 4),
  empresa: String(vehicle.empresa || '').trim(),
  pdfUrl: String(vehicle.documento_url || vehicle.arquivo_url || '').trim(),
  observacao: String(vehicle.observacao || '').trim(),
});
