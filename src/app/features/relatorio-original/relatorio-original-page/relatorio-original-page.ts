import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AlteracaoRow, BaixaRow, LancamentoService, RosterRow } from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import {
  CampoComplementoAlt,
  RelatorioAlteracoesInput,
  RelatorioAlteracoesService,
  montarRelatorioAlteracoesHtml,
} from '../../../core/services/relatorio-alteracoes.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const CAMPOS: { campo: CampoComplementoAlt; titulo: string }[] = [
  { campo: 'ALT_GRAD_MONITORAMENTO', titulo: 'Graduado de monitoramento' },
  { campo: 'ALT_ESCALA_1CIA', titulo: 'SEI da escala — 1ª Cia' },
  { campo: 'ALT_ESCALA_2CIA', titulo: 'SEI da escala — 2ª Cia' },
  { campo: 'ALT_ESCALA_3CIA', titulo: 'SEI da escala — 3ª Cia' },
  { campo: 'ALT_ESCALA_PJES', titulo: 'SEI da escala — PJES' },
  { campo: 'ALT_OBSERVACOES', titulo: 'Observações' },
];

@Component({
  selector: 'app-relatorio-original-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorio-original-page.html',
  styleUrl: './relatorio-original-page.css',
})
export class RelatorioOriginalPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly relatorioService = inject(RelatorioAlteracoesService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly alteracoes = signal<AlteracaoRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly complementos = signal<Record<CampoComplementoAlt, string>>({
    ALT_GRAD_MONITORAMENTO: '',
    ALT_ESCALA_1CIA: '',
    ALT_ESCALA_2CIA: '',
    ALT_ESCALA_3CIA: '',
    ALT_ESCALA_PJES: '',
    ALT_OBSERVACOES: '',
  });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copiado = signal(false);
  readonly campos = CAMPOS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      const [roster, baixas, alteracoes, guarnicoes, policiais, complementoRows] = await Promise.all([
        this.lancamentoService.listRosterDoDia(data),
        this.lancamentoService.listBaixasDoDia(data),
        this.lancamentoService.listAlteracoesDoDia(data),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.relatorioService.listComplementos(data),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.alteracoes.set(alteracoes);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      const c = {
        ALT_GRAD_MONITORAMENTO: '', ALT_ESCALA_1CIA: '', ALT_ESCALA_2CIA: '',
        ALT_ESCALA_3CIA: '', ALT_ESCALA_PJES: '', ALT_OBSERVACOES: '',
      };
      for (const row of complementoRows) {
        if (row.campo in c) (c as Record<string, string>)[row.campo] = row.conteudo;
      }
      this.complementos.set(c);
    } catch {
      this.errorMessage.set('Não foi possível carregar os dados do relatório.');
    } finally {
      this.loading.set(false);
    }
  }

  async onDataChange(novaData: string): Promise<void> {
    this.data.set(novaData);
    await this.reload();
  }

  updateComplemento(campo: CampoComplementoAlt, valor: string): void {
    this.complementos.update((atual) => ({ ...atual, [campo]: valor }));
  }

  async onSalvarComplemento(campo: CampoComplementoAlt): Promise<void> {
    try {
      await this.relatorioService.salvarComplemento(this.data(), campo, this.complementos()[campo]);
    } catch {
      this.errorMessage.set('Não foi possível salvar o campo.');
    }
  }

  private montarInput(): RelatorioAlteracoesInput {
    return {
      data: this.data(),
      guarnicoes: this.guarnicoes(),
      policiais: this.policiais(),
      roster: this.roster(),
      alteracoes: this.alteracoes(),
      baixas: this.baixas(),
      complementos: this.complementos(),
    };
  }

  get relatorioHtml(): string {
    return montarRelatorioAlteracoesHtml(this.montarInput());
  }

  get relatorioPreview(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.relatorioHtml);
  }

  gerarTexto(): string {
    return this.relatorioHtml
      .replace(/<\/(p|tr|table|thead|tbody|h[1-6])>/gi, '\n')
      .replace(/<td[^>]*>/gi, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async copiarRelatorio(): Promise<void> {
    const html = this.relatorioHtml;
    const texto = this.gerarTexto();
    try {
      const Ctor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (Ctor && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new Ctor({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([texto], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(texto);
      }
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.errorMessage.set('Não foi possível copiar — selecione a pré-visualização e copie manualmente.');
    }
  }
}
