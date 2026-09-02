# TOPAC Field — App Nativo

Aplicativo nativo dos mecânicos da TOPAC, separado da plataforma web/Vite.

## Estado desta branch

- React Native com Expo SDK 56;
- login pelo PIN já utilizado no TOPAC;
- validação do acesso ativo do mecânico no Supabase;
- sessão persistida no aparelho;
- consentimento explícito antes da localização contínua;
- Android com Foreground Service e notificação permanente;
- iOS com Core Location, permissão `Always` e background mode `location`;
- tarefa global de localização registrada antes da interface;
- envio do último sinal pela RPC `app_mecanico_registrar_localizacao`;
- fila local mínima: em caso de falha de internet, somente o último sinal pendente é mantido;
- controles de iniciar e encerrar jornada/GPS;
- diagnóstico local do último evento e do último envio aceito.

## Frequência inicial

A configuração inicial solicita atualização a cada 100 metros ou aproximadamente 60 segundos. O servidor mantém proteção adicional contra sinais repetidos em menos de 30 segundos e 50 metros.

Esse parâmetro será calibrado no teste físico considerando precisão, consumo de bateria e necessidade operacional.

## Requisitos obrigatórios

Background location não funciona no Expo Go. O teste deve utilizar Development Build ou APK/IPA gerado pelo EAS.

Variáveis:

```bash
cp .env.example .env
```

Preencher:

- `EXPO_PUBLIC_SUPABASE_URL`;
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`;
- `EXPO_PUBLIC_EAS_PROJECT_ID`.

## Desenvolvimento

```bash
npm install
npm run typecheck
npx expo prebuild --clean
```

Android local:

```bash
npm run android
```

APK interno pelo EAS:

```bash
npx eas-cli build --platform android --profile preview
```

iOS interno pelo EAS:

```bash
npx eas-cli build --platform ios --profile preview
```

## Homologação nativa

1. Entrar com PIN real de mecânico.
2. Iniciar jornada e aceitar localização precisa.
3. No Android, selecionar `Permitir o tempo todo` e confirmar a notificação permanente.
4. No iOS, conceder `Sempre` e confirmar o indicador de localização em background.
5. Percorrer pelo menos 2 km.
6. Bloquear a tela por 10 minutos durante o deslocamento.
7. Confirmar sinais durante o período bloqueado e recuperação após reabrir.
8. Medir bateria inicial/final, precisão e intervalos.
9. Encerrar a jornada e confirmar que o serviço parou.

## Critério Go/No-Go

**GO:** sinais continuam com tela bloqueada, serviço permanece visível, consumo é aceitável e o encerramento da jornada interrompe o GPS.

**NO-GO:** o sistema deixa de receber sinais com a tela bloqueada, o serviço é encerrado pelo sistema em uso normal, a permissão não permanece ativa ou o consumo é incompatível com a jornada.

## Limites do sistema operacional

- Bloquear a tela ou colocar o aplicativo em segundo plano não deve parar o serviço configurado.
- Se o usuário forçar o encerramento do aplicativo, revogar a permissão ou desativar o GPS, o sistema operacional pode interromper as atualizações.
- Fabricantes Android podem aplicar políticas adicionais de economia de bateria; isso deve ser verificado nos aparelhos utilizados pela TOPAC.

## Próximas migrações funcionais

A estrutura desta branch inicia o aplicativo nativo e o núcleo de GPS. Ponto externo, abastecimento, fotos, QR Code, chamados e histórico serão migrados do fluxo atual sem reutilizar o navegador como mecanismo de rastreamento.
