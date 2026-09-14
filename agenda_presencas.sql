-- ═══════════════════════════════════════════════════════════════════════
-- EclesiaSync — Presenças nas Agendas Semanais
-- ═══════════════════════════════════════════════════════════════════════
--
-- O QUE É
-- Guarda a confirmação de presença de UMA congregação num evento da agenda
-- semanal de OUTRA congregação. O que aparece para todos é o nome da
-- congregação que confirmou (a coluna congregacao_id).
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase e clique em Run. É idempotente (pode rodar
-- mais de uma vez sem problema).
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists public.agenda_presencas (
  id             uuid primary key default gen_random_uuid(),
  -- o evento (dia) da agenda em que se confirmou presença
  agenda_id      uuid not null references public.agenda_semana(id) on delete cascade,
  -- a congregação que confirmou presença (é o nome que aparece para todos)
  congregacao_id uuid not null references public.congregacoes(id) on delete cascade,
  -- quem confirmou (auditoria; opcional)
  usuario_id     uuid references public.sistema_usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  -- uma congregação confirma presença UMA vez por evento
  unique (agenda_id, congregacao_id)
);

create index if not exists idx_agenda_presencas_agenda on public.agenda_presencas (agenda_id);
create index if not exists idx_agenda_presencas_cong   on public.agenda_presencas (congregacao_id);

-- RLS ligada, seguindo o mesmo modelo atual do app (permissão verificada no
-- front-end pela permissão "Atribuir presença nas agendas"). Quando o projeto
-- migrar para autenticação real / security_hardening.sql, dá para trocar esta
-- política "allow all" por uma que valide a permissão no servidor.
alter table public.agenda_presencas enable row level security;

drop policy if exists agenda_presencas_all on public.agenda_presencas;
create policy agenda_presencas_all on public.agenda_presencas
  for all to anon, authenticated using (true) with check (true);

-- (Opcional) Atualização em tempo real: se quiser que as presenças apareçam
-- na hora para quem está com o popup aberto, publique a tabela no Realtime:
--   alter publication supabase_realtime add table public.agenda_presencas;

-- ═══════════════════════════════════════════════════════════════════════
-- FIM. Depois de rodar, a tela "Agendas Semanais" já grava e mostra as
-- presenças. Nada mais precisa ser feito no banco.
-- ═══════════════════════════════════════════════════════════════════════
