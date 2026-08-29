import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RelatorioOriginalPage } from './relatorio-original-page';

describe('RelatorioOriginalPage', () => {
  let component: RelatorioOriginalPage;
  let fixture: ComponentFixture<RelatorioOriginalPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelatorioOriginalPage],
    }).compileComponents();

    fixture = TestBed.createComponent(RelatorioOriginalPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
