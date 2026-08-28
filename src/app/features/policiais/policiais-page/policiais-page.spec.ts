import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PoliciaisPage, chaveEscala, eh24x72, rotuloEscala } from './policiais-page';

describe('PoliciaisPage', () => {
  let component: PoliciaisPage;
  let fixture: ComponentFixture<PoliciaisPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PoliciaisPage],
    }).compileComponents();

    fixture = TestBed.createComponent(PoliciaisPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('escala helpers', () => {
  it('eh24x72: só quando os dias andam de 4 em 4', () => {
    expect(eh24x72([4, 8, 12, 16, 20, 24, 28])).toBe(true);
    expect(eh24x72([1, 5, 9, 13, 17, 21, 25, 29])).toBe(true);
    expect(eh24x72([2, 6, 10])).toBe(true);
    expect(eh24x72([1, 3, 5])).toBe(false);
    expect(eh24x72([4])).toBe(false);
  });

  it('chaveEscala: DIAS_ESPECIFICOS de passo 4 vira 24/72', () => {
    expect(chaveEscala('DIAS_ESPECIFICOS', [4, 8, 12, 16, 20, 24, 28])).toBe('24/72');
    expect(chaveEscala('DIAS_ESPECIFICOS', [1, 2, 10])).toBe('DIAS_ESPECIFICOS');
    expect(chaveEscala('PARES', null)).toBe('PARES');
    expect(chaveEscala('IMPARES', null)).toBe('IMPARES');
  });

  it('rotuloEscala: mostra 24/72 + a lista de dias trabalhados', () => {
    expect(rotuloEscala('DIAS_ESPECIFICOS', [4, 8, 12, 16, 20, 24, 28], '06:00:00', '06:00:00')).toBe(
      '24/72 · 06:00–06:00 · dias 4·8·12·16·20·24·28',
    );
    expect(rotuloEscala('IMPARES', null, '06:00:00', '18:00:00')).toBe('Ímpares · 06:00–18:00');
    expect(rotuloEscala('DIAS_ESPECIFICOS', [3, 7, 20], '07:00:00', '19:00:00')).toBe(
      'Dias específicos · 07:00–19:00 · dias 3·7·20',
    );
  });
});
