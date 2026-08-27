import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuarnicoesPage } from './guarnicoes-page';

describe('GuarnicoesPage', () => {
  let component: GuarnicoesPage;
  let fixture: ComponentFixture<GuarnicoesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuarnicoesPage],
    }).compileComponents();

    fixture = TestBed.createComponent(GuarnicoesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
