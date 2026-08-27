import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EscalaMensalPage } from './escala-mensal-page';

describe('EscalaMensalPage', () => {
  let component: EscalaMensalPage;
  let fixture: ComponentFixture<EscalaMensalPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EscalaMensalPage],
    }).compileComponents();

    fixture = TestBed.createComponent(EscalaMensalPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
