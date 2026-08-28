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

interface EscalaResumo {
  guarnicao: string;
  escala: string;
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
          escala: `${RECORRENCIA_LABEL[linha.tipo_recorrencia]} · ${linha.horario_inicio.slice(0, 5)}–${linha.horario_fim.slice(0, 5)}`,
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
    return this.policiais().filter((p) => {
      if (cia === '__sem__') {
        if (p.companhia_id) return false;
      } else if (cia && p.companhia_id !== cia) {
        return false;
      }
      if (!busca) return true;
      return (
        p.nome_guerra.toLowerCase().includes(busca) || p.matricula.toLowerCase().includes(busca)
      );
    });
  }
}
