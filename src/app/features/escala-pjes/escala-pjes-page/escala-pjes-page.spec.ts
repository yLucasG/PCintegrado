import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EscalaPjesPage } from './escala-pjes-page';

describe('EscalaPjesPage', () => {
  let component: EscalaPjesPage;
  let fixture: ComponentFixture<EscalaPjesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EscalaPjesPage] }).compileComponents();
    fixture = TestBed.createComponent(EscalaPjesPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
