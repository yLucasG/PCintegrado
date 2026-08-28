import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TopBar } from './top-bar';
import { AuthService } from '../../core/services/auth.service';

describe('TopBar', () => {
  let component: TopBar;
  let fixture: ComponentFixture<TopBar>;

  const authStub = {
    currentPerfil: null,
    signOut: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    authStub.signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [provideRouter([]), { provide: AuthService, useValue: authStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TopBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('signs out and navigates to /login', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await component.signOut();

    expect(authStub.signOut).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });
});
