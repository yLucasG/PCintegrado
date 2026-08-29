-- Impede duas alterações para o mesmo policial no mesmo dia.
create unique index lancamento_alteracoes_dia_policial_uk
  on public.lancamento_alteracoes (data, policial_matricula);
