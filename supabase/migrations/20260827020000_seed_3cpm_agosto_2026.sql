-- Viaturas (3ª CPM, Agosto/2026)
insert into public.viaturas (prefixo, area_atuacao) values
  ('16332', 'Boa Vista'),
  ('16331', 'Santo Amaro'),
  ('16333', 'Santo Amaro'),
  ('CP16331', 'Boa Vista'),
  ('CP16332', 'Boa Vista'),
  ('CP16333', 'Boa Vista');

-- Policiais (3ª CPM, Agosto/2026)
insert into public.policiais (matricula, graduacao, nome_guerra, telefone, companhia_id) values
  ('127934-3', 'SD', 'CARLOS MATIAS', '87981025092', (select id from public.companhias where nome = '3ª CPM')),
  ('127317-5', 'SD', 'M. COSTA', '81973400284', (select id from public.companhias where nome = '3ª CPM')),
  ('129414-8', 'SD', 'ERICK', '81997233320', (select id from public.companhias where nome = '3ª CPM')),
  ('128833-4', 'SD', 'ADAILTON JR', '79998846386', (select id from public.companhias where nome = '3ª CPM')),
  ('128282-4', 'SD', 'OLIVEIRA SILVA', '81984250883', (select id from public.companhias where nome = '3ª CPM')),
  ('127993-9', 'SD', 'DAIANE', '81996579823', (select id from public.companhias where nome = '3ª CPM')),
  ('129565-9', 'SD', 'WELLISON', '991303842', (select id from public.companhias where nome = '3ª CPM')),
  ('127347-7', 'SD', 'FELIX LIMA', '81982608811', (select id from public.companhias where nome = '3ª CPM')),
  ('129500-4', 'SD', 'FELIPE PEREIRA', '81982608811', (select id from public.companhias where nome = '3ª CPM')),
  ('128072-4', 'SD', 'V. MOURA', '81997634541', (select id from public.companhias where nome = '3ª CPM')),
  ('129274-9', 'SD', 'FRANÇA', '81993332471', (select id from public.companhias where nome = '3ª CPM')),
  ('129033-9', 'SD', 'MARCOS ANDRE', '81984267700', (select id from public.companhias where nome = '3ª CPM')),
  ('128996-9', 'SD', 'TOMAZ SANTOS', '81986301974', (select id from public.companhias where nome = '3ª CPM')),
  ('127637-9', 'SD', 'DOUGLAS BATISTA', '87998240194', (select id from public.companhias where nome = '3ª CPM')),
  ('128599-8', 'SD', 'B. JUNIOR', '87991991401', (select id from public.companhias where nome = '3ª CPM')),
  ('129017-7', 'SD', 'JUAN MENDONÇA', '81996167949', (select id from public.companhias where nome = '3ª CPM')),
  ('129347-8', 'SD', 'MEDEIROS COSTA', '81973278464', (select id from public.companhias where nome = '3ª CPM')),
  ('128134-8', 'SD', 'LUIS SILVA', '87991093514', (select id from public.companhias where nome = '3ª CPM')),
  ('129556-0', 'SD', 'J. GOMES', '81995670223', (select id from public.companhias where nome = '3ª CPM')),
  ('129522-5', 'SD', 'WANGLEBSON', null, (select id from public.companhias where nome = '3ª CPM')),
  ('128870-9', 'SD', 'B. SILVA', '81983459882', (select id from public.companhias where nome = '3ª CPM')),
  ('128508-4', 'SD', 'THALYS SARAIVA', '87996491001', (select id from public.companhias where nome = '3ª CPM')),
  ('129084-3', 'SD', 'OTÁVIO SILVA', '81991666552', (select id from public.companhias where nome = '3ª CPM')),
  ('128518-1', 'SD', 'TULIO BARROS', '81995355283', (select id from public.companhias where nome = '3ª CPM')),
  ('129324-9', 'SD', 'MAURÍCIO SOBRINHO', '81995089636', (select id from public.companhias where nome = '3ª CPM')),
  ('128808-3', 'SD', 'ANDYS', '87988284345', (select id from public.companhias where nome = '3ª CPM')),
  ('128059-7', 'SD', 'TIAGO LEITE', '87988777158', (select id from public.companhias where nome = '3ª CPM')),
  ('129327-3', 'SD', 'BRENO MARTINS', '81984695330', (select id from public.companhias where nome = '3ª CPM')),
  ('128667-6', 'SD', 'MOABE', '81993275815', (select id from public.companhias where nome = '3ª CPM')),
  ('129147-5', 'SD', 'DANIELY SOUZA', '81995461412', (select id from public.companhias where nome = '3ª CPM')),
  ('128969-1', 'SD', 'AUGUSTO SANTOS', '87999464698', (select id from public.companhias where nome = '3ª CPM')),
  ('129539-0', 'SD', 'PAIXÃO', '81997125266', (select id from public.companhias where nome = '3ª CPM')),
  ('128471-1', 'SD', 'SOUZA JUNIOR', '8197913596', (select id from public.companhias where nome = '3ª CPM')),
  ('127600-0', 'SD', 'AMADOR', '82999793135', (select id from public.companhias where nome = '3ª CPM')),
  ('128320-0', 'SD', 'CARDOSO', '81986521329', (select id from public.companhias where nome = '3ª CPM')),
  ('128611-0', 'SD', 'JACKSON FERREIRA', '87991990207', (select id from public.companhias where nome = '3ª CPM'));

-- Guarnições (3ª CPM, Agosto/2026)
insert into public.guarnicoes (id, nome, tipo, companhia_id, area_atuacao, prefixos) values
  ('a0000000-0000-4000-8000-000000000001', 'GT 16332 - Boa Vista', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Boa Vista', ARRAY['16332']),
  ('a0000000-0000-4000-8000-000000000002', 'GT 16331 - Santo Amaro', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Santo Amaro', ARRAY['16331']),
  ('a0000000-0000-4000-8000-000000000003', 'GT 16333 - Santo Amaro', 'GT_TATICO', (select id from public.companhias where nome = '3ª CPM'), 'Santo Amaro', ARRAY['16333']),
  ('a0000000-0000-4000-8000-000000000004', 'Ciclopatrulha 16331/16332/16333 - Boa Vista', 'CP', (select id from public.companhias where nome = '3ª CPM'), 'Boa Vista', ARRAY['CP16331', 'CP16332', 'CP16333']);

-- Escala Mensal (3ª CPM, Agosto/2026) — GT 16332
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000001', '127934-3', 'CMT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127317-5', 'MOT', '06:00', '18:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129414-8', 'PAT', '06:00', '18:00', 'PARES', '2026-08-20', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128833-4', 'CMT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128282-4', 'MOT', '18:00', '06:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127993-9', 'CMT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129565-9', 'MOT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '127347-7', 'PAT', '06:00', '18:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '129500-4', 'CMT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000001', '128072-4', 'MOT', '18:00', '06:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — GT 16331
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000002', '129274-9', 'CMT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129033-9', 'MOT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128996-9', 'PAT', '05:00', '17:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '127637-9', 'CMT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128599-8', 'MOT', '17:00', '05:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129017-7', 'CMT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129347-8', 'MOT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '128134-8', 'PAT', '05:00', '17:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129556-0', 'CMT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000002', '129522-5', 'MOT', '17:00', '05:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — GT 16333
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000003', '128870-9', 'CMT', '20:00', '08:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '128508-4', 'MOT', '20:00', '08:00', 'PARES', '2026-08-08', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '129084-3', 'CMT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000003', '128518-1', 'MOT', '20:00', '08:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');

-- Escala Mensal — Ciclopatrulha 16331/16332/16333
insert into public.escala_mensal (guarnicao_id, policial_matricula, funcao, horario_inicio, horario_fim, tipo_recorrencia, vigencia_inicio, escala_origem) values
  ('a0000000-0000-4000-8000-000000000004', '129324-9', 'CMT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128808-3', 'MOT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128059-7', 'PAT', '07:00', '15:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129327-3', 'CMT', '15:00', '23:00', 'IMPARES', '2026-08-15', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128667-6', 'MOT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129147-5', 'PAT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128969-1', 'PAT', '15:00', '23:00', 'IMPARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '129539-0', 'CMT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128471-1', 'MOT', '07:00', '15:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '127600-0', 'CMT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128320-0', 'MOT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026'),
  ('a0000000-0000-4000-8000-000000000004', '128611-0', 'PAT', '15:00', '23:00', 'PARES', '2026-08-01', 'Escala de Serviço 3ª CPM - Agosto 2026');
