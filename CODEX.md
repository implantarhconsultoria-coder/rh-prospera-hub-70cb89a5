# TOPAC RH PRO - Protocolo Codex

Este repositorio e o projeto real da TOPAC RH PRO:

- Repositorio: `https://github.com/implantarhconsultoria-coder/rh-prospera-hub-70cb89a5`
- Dominio de producao: `https://topacrh.pro`
- Branch estavel: `main`
- Branch padrao de trabalho mobile: `codex/mobile-work`

## Regra principal

O Codex nunca deve alterar, commitar ou fazer push direto na `main`.

Antes de qualquer alteracao:

1. Rodar `git status`.
2. Confirmar a branch atual.
3. Se estiver na `main`, criar ou trocar para uma branch de trabalho.
4. Para tarefas vindas do celular, usar preferencialmente:

```bash
git switch codex/mobile-work
```

Se a branch nao existir:

```bash
git switch -c codex/mobile-work
```

## Como o Codex deve trabalhar

- Ler o contexto antes de editar.
- Fazer mudancas pontuais e pequenas.
- Nao reconstruir sistema.
- Nao alterar layout aprovado sem pedido explicito.
- Nao mexer em modulos que nao estejam no prompt.
- Preservar tudo que ja foi aprovado e publicado.
- Gerar resumo claro das alteracoes no final.
- Informar arquivos alterados, branch, commit, push e status do build.

## Build e validacao obrigatorios

Antes de finalizar qualquer tarefa com codigo:

```bash
npm run build
```

Quando houver testes aplicaveis:

```bash
npm run test
```

Se build ou teste falhar, nao publicar e nao tratar como finalizado.

## Areas sensiveis

O Codex nao deve mexer nas areas abaixo sem aprovacao explicita do Rodrigo:

- Login/autenticacao.
- Banco de dados, migrations, RLS ou policies.
- Permissoes, perfis, acesso por filial ou bloqueios.
- Dados sensiveis de funcionarios.
- Variaveis de ambiente e chaves de API.
- Supabase Auth, SMTP, Resend, OAuth ou senhas/app passwords.
- Regras de folha, fechamento, VR, VT, rescisao e ponto ja aprovadas.

Se uma tarefa tocar qualquer item sensivel, o Codex deve parar, explicar o impacto e pedir aprovacao antes de alterar.

## Fluxo seguro para trabalhar pelo celular

Quando o Rodrigo pedir uma alteracao pelo celular:

1. Comecar na branch `codex/mobile-work`.
2. Fazer somente o que estiver no prompt.
3. Rodar build/teste.
4. Commitar na branch de trabalho.
5. Fazer push da branch de trabalho.
6. Enviar resumo objetivo.
7. A `main` so recebe alteracao depois de revisao/aprovacao.

## Protecao local contra main

Este repositorio possui hooks em `.githooks` para bloquear commit e push direto na `main`.

Ativar neste workspace com:

```bash
git config core.hooksPath .githooks
```

Se o projeto for clonado em outro computador ou usado pelo celular em outro ambiente, rodar o comando acima novamente.
