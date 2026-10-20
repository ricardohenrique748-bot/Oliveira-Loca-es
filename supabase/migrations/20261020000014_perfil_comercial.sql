-- =====================================================================
-- 0014 Perfil "comercial"
-- Arquivo separado: o valor novo do enum só pode ser usado depois que esta
-- transação terminar (políticas e funções ficam em 0015).
-- =====================================================================
alter type public.perfil_usuario add value if not exists 'comercial';
