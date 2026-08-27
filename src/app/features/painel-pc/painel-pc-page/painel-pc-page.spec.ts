import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PainelPcPage } from './painel-pc-page';

describe('PainelPcPage', () => {
  let component: PainelPcPage;
  let fixture: ComponentFixture<PainelPcPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PainelPcPage],
    }).compileComponents();

    fixture = TestBed.createComponent(PainelPcPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
