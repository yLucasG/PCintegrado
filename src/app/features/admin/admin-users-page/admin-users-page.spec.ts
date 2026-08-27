import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminUsersPage } from './admin-users-page';

describe('AdminUsersPage', () => {
  let component: AdminUsersPage;
  let fixture: ComponentFixture<AdminUsersPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminUsersPage],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsersPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
