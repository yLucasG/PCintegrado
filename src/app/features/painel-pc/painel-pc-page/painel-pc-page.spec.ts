import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PainelPcPage } from './painel-pc-page';
import { AuthService } from '../../../core/services/auth.service';

describe('PainelPcPage', () => {
  let fixture: ComponentFixture<PainelPcPage>;

  function build(role: string | null): PainelPcPage {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PainelPcPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentPerfil: role ? { id: 'u', role } : null } },
      ],
    });
    fixture = TestBed.createComponent(PainelPcPage);
    return fixture.componentInstance;
  }

  it('should create', () => {
    expect(build('PC_LANCAMENTO')).toBeTruthy();
  });

  it('podeEditar() só é true para PC_LANCAMENTO', () => {
    expect(build('PC_LANCAMENTO').podeEditar()).toBe(true);
    expect(build('ADMIN').podeEditar()).toBe(false);
    expect(build('CIA_3').podeEditar()).toBe(false);
    expect(build(null).podeEditar()).toBe(false);
  });
});
