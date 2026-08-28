import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { GuarnicoesService } from '../../../core/services/guarnicoes.service';
import {
  EscalaMensalService,
  EscalaMensalRow,
  TipoRecorrencia,
} from '../../../core/services/escala-mensal.service';
import { AuthService, companhiaDoRole } from '../../../core/services/auth.service';

const RECORRENCIA_LABEL: Record<TipoRecorrencia, string> = {
  PARES: 'Pares',
  IMPARES: 'Ímpares',
  DIAS_ESPECIFICOS: 'Dias específicos',
  SEG_A_SEX: 'Seg–Sex',
  TODOS_OS_DIAS: 'Todos os dias',
};

/** Chave usada no filtro por escala: `DIAS_ESPECIFICOS` de passo 4 vira `24/72`. */
export type EscalaChave = 'PARES' | 'IMPARES' | '24/72' | 'DIAS_ESPECIFICOS' | 'SEG_A_SEX' | 'TODOS_OS_DIAS';

export const FILTROS_ESCALA: { chave: EscalaChave; label: string }[] = [
  { chave: 'PARES', label: 'Pares' },
  { chave: 'IMPARES', label: 'Ímpares' },
  { chave: '24/72', label: '24/72' },
  { chave: 'SEG_A_SEX', label: 'Seg–Sex' },
  { chave: 'TODOS_OS_DIAS', label: 'Todos os dias' },
  { chave: 'DIAS_ESPECIFICOS', label: 'Dias específicos (outros)' },
];

/** True quando a lista de dias é um ciclo de 4 dias (1 trabalha, 3 folga). */
export function eh24x72(dias: number[]): boolean {
  return dias.length >= 2 && dias.every((v, i) => i === 0 || v - dias[i - 1] === 4);
}

export function chaveEscala(r: TipoRecorrencia, dias: number[] | null): EscalaChave {
  if (r !== 'DIAS_ESPECIFICOS') return r;
  return eh24x72([...(dias ?? [])].sort((a, b) => a - b)) ? '24/72' : 'DIAS_ESPECIFICOS';
}

export function rotuloEscala(
  r: TipoRecorrencia,
  dias: number[] | null,
  inicio: string,
  fim: string,
): string {
  const horario = `${inicio.slice(0, 5)}–${fim.slice(0, 5)}`;
  if (r !== 'DIAS_ESPECIFICOS') return `${RECORRENCIA_LABEL[r]} · ${horario}`;
  const d = [...(dias ?? [])].sort((a, b) => a - b);
  const base = eh24x72(d) ? '24/72' : 'Dias específicos';
  return d.length ? `${base} · ${horario} · dias ${d.join('·')}` : `${base} · ${horario}`;
}

interface EscalaResumo {
  guarnicao: string;
  escala: string;
  chave: EscalaChave;
}

@Component({
  selector: 'app-policiais-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './policiais-page.html',
  styleUrl: './policiais-page.css',
})
export class PoliciaisPage {
  private readonly policiaisService = inject(PoliciaisService);
  private readonly companhiasService = inject(CompanhiasService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly escalaMensalService = inject(EscalaMensalService);
  private readonly authService = inject(AuthService);

  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly escalaPorMatricula = signal<Map<string, EscalaResumo[]>>(new Map());
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly busca = signal('');
  readonly filtroCompanhiaId = signal('');
  readonly filtroEscala = signal('');
  readonly filtrosEscala = FILTROS_ESCALA;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [policiais, companhias, guarnicoes, escala] = await Promise.all([
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
        this.guarnicoesService.listGuarnicoes(),
        this.escalaMensalService.listEscalaMensal(),
      ]);
      this.policiais.set(policiais);
      this.companhias.set(companhias);

      const nomePorGuarnicao = new Map(guarnicoes.map((g) => [g.id, g.nome]));
      const mapa = new Map<string, EscalaResumo[]>();
      for (const linha of escala as EscalaMensalRow[]) {
        const lista = mapa.get(linha.policial_matricula) ?? [];
        lista.push({
          guarnicao: nomePorGuarnicao.get(linha.guarnicao_id) ?? '—',
          escala: rotuloEscala(
            linha.tipo_recorrencia,
            linha.dias_especificos,
            linha.horario_inicio,
            linha.horario_fim,
          ),
          chave: chaveEscala(linha.tipo_recorrencia, linha.dias_especificos),
        });
        mapa.set(linha.policial_matricula, lista);
      }
      this.escalaPorMatricula.set(mapa);

      // Filtro inicia na companhia do próprio perfil, quando houver.
      const role = this.authService.currentPerfil?.role;
      const nomeCia = role ? companhiaDoRole(role) : null;
      if (nomeCia) {
        const cid = companhias.find((c) => c.nome === nomeCia)?.id;
        if (cid) this.filtroCompanhiaId.set(cid);
      }
    } catch {
      this.errorMessage.set('Não foi possível carregar os policiais.');
    } finally {
      this.loading.set(false);
    }
  }

  companhiaNome(id: string | null): string {
    return this.companhias().find((c) => c.id === id)?.nome ?? '—';
  }

  guarnicaoDe(matricula: string): string {
    const lista = this.escalaPorMatricula().get(matricula) ?? [];
    return lista.length ? lista.map((e) => e.guarnicao).join(' / ') : '—';
  }

  escalaDe(matricula: string): string {
    const lista = this.escalaPorMatricula().get(matricula) ?? [];
    return lista.length ? lista.map((e) => e.escala).join(' / ') : '—';
  }

  get policiaisFiltrados(): PolicialRow[] {
    const busca = this.busca().trim().toLowerCase();
    const cia = this.filtroCompanhiaId();
    const escala = this.filtroEscala();
    return this.policiais().filter((p) => {
      if (cia === '__sem__') {
        if (p.companhia_id) return false;
      } else if (cia && p.companhia_id !== cia) {
        return false;
      }
      if (escala) {
        const resumos = this.escalaPorMatricula().get(p.matricula) ?? [];
        if (!resumos.some((r) => r.chave === escala)) return false;
      }
      if (!busca) return true;
      return (
        p.nome_guerra.toLowerCase().includes(busca) || p.matricula.toLowerCase().includes(busca)
      );
    });
  }
}
