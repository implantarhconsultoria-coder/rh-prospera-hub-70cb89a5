import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const BUCKET = 'ponto-veiculo';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
const normalizePlate = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const safePart = (v: unknown) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'na';
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function parsePhoto(value: any) {
  const data = String(value?.data || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '');
  const mimeType = String(value?.mimeType || 'image/jpeg').split(';')[0].toLowerCase();
  if (!data || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('foto_invalida');
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > 6291456) throw new Error('foto_tamanho_invalido');
  return { bytes, mimeType, ext: mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg' };
}

function platesFromObs(obs: unknown) {
  const text = String(obs || '').toUpperCase();
  const marker = text.match(/CARRO[S]?\s+VINCULADO[S]?\s*:/i);
  if (!marker?.index && marker?.index !== 0) return [] as string[];
  const after = text.slice((marker.index || 0) + marker[0].length);
  return [...new Set(after.split(/[,;/|\s]+/).map(normalizePlate).filter((p) => /^[A-Z]{3}[A-Z0-9][0-9][A-Z0-9][0-9]$/.test(p)))];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ ok: false, error: 'metodo_invalido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ ok: false, error: 'backend_indisponivel' }, 500);

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const rest = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`REST_${response.status}:${text.slice(0, 160)}`);
    return text ? JSON.parse(text) : [];
  };
  const upload = async (base: string, photo: any) => {
    const media = parsePhoto(photo);
    const path = `${base}-${crypto.randomUUID()}.${media.ext}`;
    const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': media.mimeType, 'x-upsert': 'false' },
      body: media.bytes,
    });
    if (!response.ok) throw new Error(`STORAGE_${response.status}`);
    return path;
  };
  const remove = async (path: string) => {
    if (!path) return;
    await fetch(`${url}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` } }).catch(() => undefined);
  };

  try {
    const body = await req.json().catch(() => ({}));
    const acessoId = String(body?.acessoId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(acessoId)) return reply({ ok: false, error: 'acesso_nao_autorizado' }, 403);

    const accessRows = await rest(`acessos_externos?id=eq.${encodeURIComponent(acessoId)}&modulo=eq.mecanico&status=eq.ativo&acesso_liberado=eq.true&ativo=eq.true&select=id,funcionario_id,nome,empresa,filial,observacoes&limit=1`);
    const access = accessRows[0];
    if (!access?.funcionario_id) return reply({ ok: false, error: 'acesso_nao_autorizado' }, 403);

    const funcionarioRows = await rest(`funcionarios?id=eq.${encodeURIComponent(access.funcionario_id)}&select=id,nome,empresa_id,company_id&limit=1`);
    const funcionario = funcionarioRows[0] || {};
    const links = await rest(`mecanico_veiculo_vinculos?funcionario_id=eq.${encodeURIComponent(access.funcionario_id)}&status=eq.ativo&select=ativo_id`);
    const linkedIds = links.map((x: any) => String(x.ativo_id || '')).filter(Boolean);
    const obsPlates = platesFromObs(access.observacoes);
    const branch = String(access.filial || '').toUpperCase();
    const sharedBranch = branch.includes('GOIAN') || branch.includes('PRAIA');
    const sharedPlates = new Set<string>();

    if (sharedBranch && branch) {
      const [fuelAuth, fuelRows, kmRows] = await Promise.all([
        rest(`abastecimento_autorizacoes?filial=eq.${encodeURIComponent(access.filial)}&placa=not.is.null&select=placa&order=created_at.desc&limit=80`).catch(() => []),
        rest(`abastecimentos?filial=eq.${encodeURIComponent(access.filial)}&placa=not.is.null&excluido=eq.false&select=placa&order=created_at.desc&limit=80`).catch(() => []),
        rest(`ponto_veiculo?filial=eq.${encodeURIComponent(access.filial)}&veiculo_placa=not.is.null&select=veiculo_placa&order=created_at.desc&limit=80`).catch(() => []),
      ]);
      for (const row of fuelAuth) { const p = normalizePlate(row.placa); if (p) sharedPlates.add(p); }
      for (const row of fuelRows) { const p = normalizePlate(row.placa); if (p) sharedPlates.add(p); }
      for (const row of kmRows) { const p = normalizePlate(row.veiculo_placa); if (p) sharedPlates.add(p); }
    }

    const allAssets = await rest('ativos?tipo=eq.veiculo&status=eq.ativo&select=id,placa,descricao,marca,modelo');
    const allowedPlates = new Set([...obsPlates, ...sharedPlates]);
    const vehicles = allAssets
      .map((a: any) => ({ id: a.id, placa: normalizePlate(a.placa), descricao: String(a.descricao || [a.marca, a.modelo].filter(Boolean).join(' ') || normalizePlate(a.placa)) }))
      .filter((a: any) => a.placa && (linkedIds.includes(String(a.id)) || allowedPlates.has(a.placa)));

    const recentRows = await rest(`ponto_veiculo?funcionario_id=eq.${encodeURIComponent(access.funcionario_id)}&select=employee_code,veiculo_placa,veiculo_descricao,ativo_id,data,status,km_saida,km_chegada&order=data.desc,created_at.desc&limit=1`);
    const recent = recentRows[0] || null;
    if (vehicles.length === 0 && recent?.veiculo_placa) {
      vehicles.push({ id: recent.ativo_id || null, placa: normalizePlate(recent.veiculo_placa), descricao: recent.veiculo_descricao || recent.veiculo_placa });
    }
    const uniqueVehicles = [...new Map(vehicles.map((v: any) => [v.placa, v])).values()];
    const date = todaySP();
    const todayRows = await rest(`ponto_veiculo?funcionario_id=eq.${encodeURIComponent(access.funcionario_id)}&data=eq.${date}&select=*&order=created_at.desc&limit=1`);
    const todayRecord = todayRows[0] || null;
    const action = String(body?.action || 'status');

    if (action === 'status') {
      return reply({ ok: true, vehicles: uniqueVehicles, record: todayRecord, date, allowManualPlate: sharedBranch });
    }

    if (action === 'start') {
      if (todayRecord) return reply({ ok: false, error: 'registro_dia_ja_existe', record: todayRecord }, 409);
      const plate = normalizePlate(body?.vehiclePlate);
      let vehicle = uniqueVehicles.find((v: any) => v.placa === plate);
      if (!vehicle && sharedBranch && plate) {
        const asset = allAssets.find((a: any) => normalizePlate(a.placa) === plate);
        if (asset) vehicle = { id: asset.id, placa: plate, descricao: String(asset.descricao || [asset.marca, asset.modelo].filter(Boolean).join(' ') || plate) };
      }
      if (!vehicle) return reply({ ok: false, error: uniqueVehicles.length || sharedBranch ? 'veiculo_nao_autorizado' : 'sem_veiculo_vinculado' }, 422);
      const km = Number(body?.km);
      const kmOcr = body?.kmOcr == null ? null : Number(body.kmOcr);
      const lat = Number(body?.latitude);
      const lng = Number(body?.longitude);
      if (!Number.isSafeInteger(km) || km < 0) return reply({ ok: false, error: 'km_invalido' }, 422);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return reply({ ok: false, error: 'gps_obrigatorio' }, 422);

      const lastRows = await rest(`ponto_veiculo?veiculo_placa=eq.${encodeURIComponent(plate)}&select=km_saida,km_chegada,data,status,saida_origem_km,chegada_origem_km&order=data.desc,created_at.desc&limit=20`);
      const lastReliable = lastRows.find((row: any) =>
        String(row.status || '').toLowerCase() === 'concluido'
        && Number(row.km_saida || 0) > 0
        && Number(row.km_chegada || 0) >= Number(row.km_saida || 0)
        && Number(row.km_chegada || 0) - Number(row.km_saida || 0) <= 2000
      ) || lastRows.find((row: any) =>
        (row.chegada_origem_km === 'ocr_confirmado' && Number(row.km_chegada || 0) > 0)
        || (row.saida_origem_km === 'ocr_confirmado' && Number(row.km_saida || 0) > 0)
      );
      const lastKm = lastReliable
        ? Number(
            lastReliable.chegada_origem_km === 'ocr_confirmado' && Number(lastReliable.km_chegada || 0) > 0
              ? lastReliable.km_chegada
              : lastReliable.status === 'concluido' && Number(lastReliable.km_chegada || 0) > 0
                ? lastReliable.km_chegada
                : lastReliable.km_saida || 0
          )
        : 0;
      if (lastKm > 0 && km < lastKm) return reply({ ok: false, error: 'km_menor_ultimo', ultimo_km: lastKm }, 422);

      const employeeCode = String(recent?.employee_code || `${safePart(access.nome).toLowerCase()}-${String(access.funcionario_id).slice(0, 8)}`);
      let photoPath = '';
      try {
        photoPath = await upload(`${date.slice(0, 7)}/${safePart(employeeCode)}/${safePart(plate)}/saida`, body?.photo);
        const rows = await rest('ponto_veiculo', {
          method: 'POST',
          body: JSON.stringify({
            funcionario_id: access.funcionario_id,
            empresa_id: funcionario.empresa_id || funcionario.company_id || null,
            ativo_id: vehicle.id || null,
            employee_code: employeeCode,
            funcionario_nome: access.nome,
            empresa_nome: access.empresa || '',
            filial: access.filial || '',
            data: date,
            veiculo_placa: plate,
            veiculo_descricao: vehicle.descricao || plate,
            km_saida: km,
            km_saida_ocr: Number.isFinite(kmOcr) ? Math.round(kmOcr) : null,
            saida_origem_km: Number.isFinite(kmOcr) && Math.round(kmOcr) === km ? 'ocr_confirmado' : 'manual_corrigido',
            saida_em: new Date().toISOString(),
            saida_latitude: lat,
            saida_longitude: lng,
            saida_precisao_metros: Number(body?.accuracy || 0) || null,
            saida_foto_path: photoPath,
            saida_device: String(body?.device || '').slice(0, 500),
            status: 'aberto',
          }),
        });
        return reply({ ok: true, record: rows[0] });
      } catch (error) {
        await remove(photoPath);
        throw error;
      }
    }

    if (action === 'finish') {
      const open = todayRecord && String(todayRecord.status || '').toLowerCase() === 'aberto' ? todayRecord : null;
      if (!open) return reply({ ok: false, error: 'sem_saida_aberta' }, 409);
      const km = Number(body?.km);
      const kmOcr = body?.kmOcr == null ? null : Number(body.kmOcr);
      const lat = Number(body?.latitude);
      const lng = Number(body?.longitude);
      if (!Number.isSafeInteger(km) || km < Number(open.km_saida || 0)) return reply({ ok: false, error: 'km_chegada_invalido', km_saida: open.km_saida }, 422);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return reply({ ok: false, error: 'gps_obrigatorio' }, 422);
      let photoPath = '';
      try {
        photoPath = await upload(`${date.slice(0, 7)}/${safePart(open.employee_code)}/${safePart(open.veiculo_placa)}/chegada`, body?.photo);
        const totalKm = Math.max(0, km - Number(open.km_saida || 0));
        const rows = await rest(`ponto_veiculo?id=eq.${encodeURIComponent(open.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            km_chegada: km,
            km_chegada_ocr: Number.isFinite(kmOcr) ? Math.round(kmOcr) : null,
            chegada_origem_km: Number.isFinite(kmOcr) && Math.round(kmOcr) === km ? 'ocr_confirmado' : 'manual_corrigido',
            chegada_em: new Date().toISOString(),
            chegada_latitude: lat,
            chegada_longitude: lng,
            chegada_precisao_metros: Number(body?.accuracy || 0) || null,
            chegada_foto_path: photoPath,
            chegada_device: String(body?.device || '').slice(0, 500),
            status: 'concluido',
            updated_at: new Date().toISOString(),
          }),
        });
        return reply({ ok: true, record: rows[0], km_total: totalKm });
      } catch (error) {
        await remove(photoPath);
        throw error;
      }
    }

    return reply({ ok: false, error: 'acao_invalida' }, 400);
  } catch (error) {
    console.error('app-mecanico-ponto-veiculo', error instanceof Error ? error.message : String(error));
    return reply({ ok: false, error: 'falha_ponto_veiculo' }, 500);
  }
});