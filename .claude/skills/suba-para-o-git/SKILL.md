---
name: suba-para-o-git
description: Use SEMPRE que o usuário pedir para enviar as mudanças ao Git/GitHub — gatilhos como "suba para o git", "sobe pro git", "sobe isso", "commita e faz push", "manda pro github", "publica as mudanças". Faz o fluxo completo: revisa, commita e dá push com segurança.
---

# Subir para o Git (commit + push)

Quando o usuário disser "suba para o git" (ou equivalente), execute o fluxo
abaixo de ponta a ponta. O objetivo é um commit limpo e um push seguro, sem
vazar nada sensível.

## Passo a passo

1. **Revise o que vai entrar.** Rode e leia:
   ```bash
   git branch --show-current
   git status --short
   git diff --stat
   ```
   Confirme que os arquivos alterados fazem sentido para esta entrega.

2. **Verifique conteúdo sensível ANTES de commitar.** Nunca suba:
   - Segredos reais: `service_role` key, chaves privadas (VAPID/SSH/`BEGIN ... PRIVATE KEY`), tokens, `.env`.
   - Dumps de banco (`backup_*.sql`, `*.dump`) — contêm dados reais de usuários.
   - Config local de máquina (`.claude/settings.local.json`).
   Se algum aparecer no stage, pare e trate (adicione ao `.gitignore` e/ou
   `git rm --cached`) antes de continuar. A chave `anon` do Supabase em
   `app.js` é pública por design — não é vazamento.
   Faça uma varredura rápida:
   ```bash
   grep -rniE "service_role.*ey[A-Za-z0-9]|BEGIN .*PRIVATE KEY|VAPID_PRIVATE.*[A-Za-z0-9_-]{30}|\.env$" .
   ```

3. **Garanta que não quebrou.** Se `app.js` mudou:
   ```bash
   node --check app.js
   ```
   (e `node --check sw.js` se ele mudou). Não commite com erro de sintaxe.

4. **Stage.** `git add -A`, depois `git status --short` de novo para conferir
   o conjunto final staged.

5. **Commit com mensagem descritiva.** Escreva um título curto (≤ ~70 chars)
   em português + um corpo com bullets do que mudou. **Termine a mensagem
   com a linha de co-autoria.**

   IMPORTANTE — o shell aqui é Git Bash: use um **heredoc do bash** ou um
   **arquivo de mensagem**, NUNCA a here-string do PowerShell (`@'...'@`),
   que insere um `@` perdido no título. A forma segura:
   ```bash
   cat > /tmp/commitmsg.txt <<'EOF'
   Título curto do commit

   - Bullet do que mudou.
   - Outro bullet.

   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   EOF
   git commit -F /tmp/commitmsg.txt
   ```

6. **Push.** Para o upstream da branch atual (normalmente `main`):
   ```bash
   git push origin "$(git branch --show-current)"
   ```

7. **Confirme e relate.** Mostre o resultado e informe o usuário:
   ```bash
   git log --oneline -1
   git status -sb | head -1
   ```
   Relate o hash do commit e que o push foi concluído (`... -> main`).

## Regras

- Se **não houver nada para commitar** (`git status` limpo), diga isso em vez
  de criar um commit vazio.
- Se o push for **rejeitado** (remoto à frente), faça `git pull --rebase`,
  resolva se preciso, e tente de novo — nunca use `--force` sem o usuário pedir.
- Não pule hooks (`--no-verify`) nem desligue assinatura, a menos que o
  usuário peça explicitamente.
- Commite na branch em que já está; só crie branch se o usuário pedir.
