# TOPAC — Rastreamento Operacional de Mecânicos

## Escopo desta entrega

- autorização explícita de localização ao entrar no TOPAC Field;
- captura por `navigator.geolocation` enquanto o aplicativo web permanece em execução;
- envio quando houver deslocamento de aproximadamente 500 metros ou a cada quatro minutos;
- armazenamento somente do último sinal de cada mecânico;
- RLS permitindo leitura apenas para Central autorizada;
- atualização do painel por Supabase Realtime, com consulta de contingência a cada 30 segundos;
- Mapa Operacional integrado ao módulo App Mecânico da Central.

## Privacidade e governança

- o rastreamento não é oculto;
- o mecânico precisa autorizar a localização;
- a tela informa a finalidade e a frequência aproximada;
- o envio termina quando a sessão/página do TOPAC Field é encerrada;
- a base não mantém histórico de rotas nesta fase;
- somente perfis `admin`, `diretor_geral` e `operacional` podem visualizar os sinais.

## Limite técnico do aplicativo web

O TOPAC Field atual é Vite/React executado no navegador. Navegadores móveis podem suspender JavaScript e geolocalização quando a página é minimizada, a tela é bloqueada ou o sistema entra em economia de bateria. Service Workers não fornecem acesso contínuo ao GPS.

Portanto, esta entrega oferece rastreamento foreground e continuidade em background apenas como melhor esforço do sistema operacional. Background confiável exige empacotamento nativo.

## Fase nativa necessária para background confiável

### Android

- empacotar o TOPAC Field com Capacitor ou projeto Android próprio;
- declarar `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` e, quando realmente necessário, `ACCESS_BACKGROUND_LOCATION`;
- declarar `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_LOCATION`;
- criar Foreground Service do tipo `location` iniciado com atividade visível;
- manter notificação persistente indicando rastreamento ativo;
- reiniciar o serviço apenas por fluxos permitidos pelo Android;
- orientar retirada de otimização de bateria somente quando operacionalmente indispensável.

### iOS

- empacotar o aplicativo nativamente;
- declarar `NSLocationWhenInUseUsageDescription` e, se aprovado para o caso, `NSLocationAlwaysAndWhenInUseUsageDescription`;
- habilitar Background Modes > Location updates;
- iniciar a sessão de localização em foreground;
- usar Core Location com indicador de localização em background;
- comunicar claramente ao usuário quando o rastreamento continuar fora da tela.

## Critério recomendado de produção

1. homologar o fluxo foreground no celular real;
2. validar pins e horário do último sinal na Central;
3. medir consumo de bateria durante uma jornada;
4. somente depois gerar APK/IPA com serviço nativo;
5. submeter Android/iOS com justificativa de uso de localização em background e política de privacidade atualizada.
