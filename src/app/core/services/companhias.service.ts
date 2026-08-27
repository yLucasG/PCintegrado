import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CompanhiaRow {
  id: string;
  nome: string;
}

@Injectable({ providedIn: 'root' })
export class CompanhiasService {
  private readonly supabase = inject(SupabaseService);

  async listCompanhias(): Promise<CompanhiaRow[]> {
    const { data, error } = await this.supabase.client
      .from('companhias')
      .select('id, nome')
      .order('nome');
    if (error) {
      throw error;
    }
    return (data ?? []) as CompanhiaRow[];
  }
}
