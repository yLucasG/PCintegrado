create policy "authenticated_delete_lancamento_faltas" on public.lancamento_faltas
  for delete to authenticated using (true);

create policy "authenticated_delete_lancamento_atrasos" on public.lancamento_atrasos
  for delete to authenticated using (true);
