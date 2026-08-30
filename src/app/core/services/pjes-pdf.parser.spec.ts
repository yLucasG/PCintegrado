import { extrairEscalaPjes, ItemTextoPdf } from './pjes-pdf.parser';

function linha(page: number, y: number, ...textos: string[]): ItemTextoPdf[] {
  return textos.map((str, i) => ({ str, x: 10 + i * 60, y, page }));
}

describe('extrairEscalaPjes', () => {
  it('extrai data, GT e uma linha CMT com horário no formato "16h às 0h"', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 760, 'SERVIÇO: ESCALA – OPERAÇÃO PERNAMBUCO SEGURO'),
      ...linha(1, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      data: '2026-08-19',
      gtRotulo: 'GT 16100 - SUPERVISÃO',
      funcao: 'CMT',
      graduacao: 'TC',
      matricula: '102505-8',
      nomeGuerra: 'GRISI',
      telefone: '81986631816',
      horarioInicio: '16:00',
      horarioFim: '00:00',
    });
  });

  it('aplica horário mesclado do bloco às linhas seguintes sem horário e aceita "23:59 às 05:59"', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 720, 'GT16141', '1º CPM'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO:'),
      ...linha(1, 680, 'CMT', 'CB', '113595-3', 'MARTA', '16º BPM', '81996587352', '23:59 às 05:59'),
      ...linha(1, 660, 'MOT', 'SD', '130253-1', 'DIOGO', '16º BPM'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r).toHaveLength(2);
    expect(r[0].nomeGuerra).toBe('MARTA');
    expect(r[1]).toMatchObject({ funcao: 'MOT', nomeGuerra: 'DIOGO', matricula: '130253-1', telefone: null, horarioInicio: '23:59', horarioFim: '05:59' });
  });

  it('linha com número de 5 dígitos no lugar da função vira OUTRO', () => {
    const itens = [
      ...linha(1, 800, '20/agosto/2026 - QUINTA-FEIRA'),
      ...linha(1, 720, 'MO', 'OPERAÇÃO OCTOPUS'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO:'),
      ...linha(1, 680, '16431', '3º SGT', '109091-7', 'FAUSTO AUGUSTO', '16º BPM', '81999736189', '14h às 20h'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r[0]).toMatchObject({ funcao: 'OUTRO', graduacao: '3º SGT', matricula: '109091-7', nomeGuerra: 'FAUSTO AUGUSTO', horarioInicio: '14:00', horarioFim: '20:00' });
    expect(r[0].gtRotulo).toBe('MO - OPERAÇÃO OCTOPUS');
  });

  it('aceita "05h à 14h" e matrícula ausente (vem null)', () => {
    const itens = [
      ...linha(1, 800, '22/agosto/2026 - SÁBADO'),
      ...linha(1, 720, 'GT 16300', 'FISCALIZAÇÃO POG'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', '2º TEN', '130037-7', 'VALÉRIA DE DEUS', '16º BPM', '05h à 14h'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r[0]).toMatchObject({ graduacao: '2º TEN', nomeGuerra: 'VALÉRIA DE DEUS', telefone: null, horarioInicio: '05:00', horarioFim: '14:00' });
  });

  it('duas páginas → linhas de ambos os dias', () => {
    const itens = [
      ...linha(1, 800, '19/agosto/2026 - QUARTA-FEIRA'),
      ...linha(1, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
      ...linha(2, 800, '20/agosto/2026 - QUINTA-FEIRA'),
      ...linha(2, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(2, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(2, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r.map((l) => l.data)).toEqual(['2026-08-19', '2026-08-20']);
  });

  it('cabeçalho GT mesclado num único item ("GT 16300 - FISCALIZAÇÃO POG")', () => {
    const itens = [
      ...linha(1, 800, '22/agosto/2026 - SÁBADO'),
      ...linha(1, 720, 'GT 16300 - FISCALIZAÇÃO POG'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
    ];
    const { linhas: r } = extrairEscalaPjes(itens);
    expect(r).toHaveLength(1);
    expect(r[0].gtRotulo).toBe('GT 16300 - FISCALIZAÇÃO POG');
    expect(r[0].nomeGuerra).toBe('GRISI');
  });

  it('conta linhas ignoradas quando a página tem dados mas nenhuma data reconhecível', () => {
    const itens = [
      ...linha(1, 720, 'GT 16100', 'SUPERVISÃO'),
      ...linha(1, 700, 'GRAD.', 'MAT.', 'NOME DE GUERRA', 'OME', 'TELEFONE', 'HORÁRIO'),
      ...linha(1, 680, 'CMT', 'TC', '102505-8', 'GRISI', '16º BPM', '81986631816', '16h às 0h'),
      ...linha(1, 660, 'MOT', 'SD', '130253-1', 'DIOGO', '16º BPM'),
    ];
    const { linhas: r, ignoradas } = extrairEscalaPjes(itens);
    expect(r).toHaveLength(0);
    expect(ignoradas).toBeGreaterThan(0);
  });
});
