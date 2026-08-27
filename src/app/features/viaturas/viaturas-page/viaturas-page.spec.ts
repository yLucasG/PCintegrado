import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViaturasPage } from './viaturas-page';

describe('ViaturasPage', () => {
  let component: ViaturasPage;
  let fixture: ComponentFixture<ViaturasPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViaturasPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ViaturasPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
