import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RelatorioSeiPage } from './relatorio-sei-page';

describe('RelatorioSeiPage', () => {
  let component: RelatorioSeiPage;
  let fixture: ComponentFixture<RelatorioSeiPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RelatorioSeiPage],
    }).compileComponents();

    fixture = TestBed.createComponent(RelatorioSeiPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
