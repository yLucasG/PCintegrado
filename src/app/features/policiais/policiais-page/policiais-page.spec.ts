import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PoliciaisPage } from './policiais-page';

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
