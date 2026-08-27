import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  it('exposes a configured Supabase client', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(SupabaseService);
    expect(service.client).toBeTruthy();
    expect(typeof service.client.auth.getSession).toBe('function');
  });
});
