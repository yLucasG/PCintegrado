import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EscalaMensalService,
  EscalaMensalRow,
  TipoRecorrencia,
} from '../../../core/services/escala-mensal.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import { CompanhiasService, CompanhiaRow } from '../../../core/services/companhias.service';
import { AuthService, companhiaDoRole } from '../../../core/services/auth.service';

@Component({
  selector: 'app-escala-mensal-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './escala-mensal-page.html',
  styleUrl: './escala-mensal-page.css',
})
export class EscalaMensalPage {
  private readonly escalaMensalService = inject(EscalaMensalService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly companhiasService = inject(CompanhiasService);
  private readonly authService = inject(AuthService);

  readonly escalas = signal<EscalaMensalRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly companhias = signal<CompanhiaRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly funcoes: ('CMT' | 'MOT' | 'PAT')[] = ['CMT', 'MOT', 'PAT'];
  readonly tiposRecorrencia: TipoRecorrencia[] = [
    'PARES',
    'IMPARES',
    'DIAS_ESPECIFICOS',
    'SEG_A_SEX',
    'TODOS_OS_DIAS',
  ];

  readonly filtroGuarnicaoId = signal('');

  readonly novaGuarnicaoId = signal('');
  readonly novaMatricula = signal('');
  readonly novaFuncao = signal<'CMT' | 'MOT' | 'PAT'>('CMT');
  readonly novoHorarioInicio = signal('06:00');
  readonly novoHorarioFim = signal('18:00');
  readonly novoTipoRecorrencia = signal<TipoRecorrencia>('PARES');
  readonly novaVigenciaInicio = signal('');

  constructor() {
    void this.reload();
  }

  /** Companhia à qual o perfil está restrito (null = ADMIN vê tudo). */
  private get companhiaIdDoPerfil(): string | null {
    const role = this.authService.currentPerfil?.role;
    const nome = role ? companhiaDoRole(role) : null;
    return nome ? (this.companhias().find((c) => c.nome === nome)?.id ?? null) : null;
  }

  /** Guarnições visíveis: todas (ADMIN) ou só as da companhia do perfil. */
  get guarnicoesVisiveis(): GuarnicaoRow[] {
    const cid = this.companhiaIdDoPerfil;
    return cid ? this.guarnicoes().filter((g) => g.companhia_id === cid) : this.guarnicoes();
  }

  get escalasFiltradas(): EscalaMensalRow[] {
    const idsVisiveis = new Set(this.guarnicoesVisiveis.map((g) => g.id));
    const filtro = this.filtroGuarnicaoId();
    return this.escalas().filter(
      (e) => idsVisiveis.has(e.guarnicao_id) && (!filtro || e.guarnicao_id === filtro),
    );
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [escalas, guarnicoes, policiais, companhias] = await Promise.all([
        this.escalaMensalService.listEscalaMensal(),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.companhiasService.listCompanhias(),
      ]);
      this.escalas.set(escalas);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      this.companhias.set(companhias);
    } catch {
      this.errorMessage.set('Não foi possível carregar a escala mensal.');
    } finally {
      this.loading.set(false);
    }
  }

  guarnicaoNome(id: string): string {
    return this.guarnicoes().find((g) => g.id === id)?.nome ?? '—';
  }

  policialNome(matricula: string): string {
    return this.policiais().find((p) => p.matricula === matricula)?.nome_guerra ?? matricula;
  }

  async onCreate(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.escalaMensalService.createEscalaMensal({
        guarnicao_id: this.novaGuarnicaoId(),
        policial_matricula: this.novaMatricula(),
        funcao: this.novaFuncao(),
        horario_inicio: this.novoHorarioInicio(),
        horario_fim: this.novoHorarioFim(),
        tipo_recorrencia: this.novoTipoRecorrencia(),
        vigencia_inicio: this.novaVigenciaInicio(),
      });
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar a escala.');
    }
  }

  async onRemove(id: string): Promise<void> {
    try {
      await this.escalaMensalService.removeEscalaMensal(id);
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível remover a escala.');
    }
  }
}
