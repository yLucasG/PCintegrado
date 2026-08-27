create policy "authenticated_delete_lancamento_remanejamentos" on public.lancamento_remanejamentos
  for delete to authenticated using (true);
