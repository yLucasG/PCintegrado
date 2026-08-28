import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  BaixaRow,
  FuncaoFixaRow,
  LancamentoService,
  OsRow,
  RosterRow,
} from '../../../core/services/lancamento.service';
import { GuarnicoesService, GuarnicaoRow } from '../../../core/services/guarnicoes.service';
import { PoliciaisService, PolicialRow } from '../../../core/services/policiais.service';
import {
  CampoComplemento,
  RelatorioSeiInput,
  RelatorioSeiService,
  montarRelatorioHtml,
} from '../../../core/services/relatorio-sei.service';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const COMPLEMENTOS: { campo: CampoComplemento; titulo: string }[] = [
  { campo: 'PJES_DIARIA', titulo: 'PJES / Diária' },
  { campo: 'FISCALIZACAO', titulo: 'Fiscalização' },
  { campo: 'POG', titulo: 'POG' },
  { campo: 'DIRESP', titulo: 'Viaturas DIRESP em apoio' },
  { campo: 'OBSERVACOES', titulo: 'Observações' },
];

@Component({
  selector: 'app-relatorio-sei-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorio-sei-page.html',
  styleUrl: './relatorio-sei-page.css',
})
export class RelatorioSeiPage {
  private readonly lancamentoService = inject(LancamentoService);
  private readonly guarnicoesService = inject(GuarnicoesService);
  private readonly policiaisService = inject(PoliciaisService);
  private readonly relatorioSeiService = inject(RelatorioSeiService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly data = signal(hojeIso());
  readonly roster = signal<RosterRow[]>([]);
  readonly baixas = signal<BaixaRow[]>([]);
  readonly osRows = signal<OsRow[]>([]);
  readonly funcoesFixas = signal<FuncaoFixaRow[]>([]);
  readonly guarnicoes = signal<GuarnicaoRow[]>([]);
  readonly policiais = signal<PolicialRow[]>([]);
  readonly complementos = signal<Record<CampoComplemento, string>>({
    PJES_DIARIA: '',
    FISCALIZACAO: '',
    POG: '',
    DIRESP: '',
    OBSERVACOES: '',
  });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly copiado = signal(false);

  readonly camposComplemento = COMPLEMENTOS;

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = this.data();
      const [roster, baixas, osRows, funcoesFixas, guarnicoes, policiais, complementoRows] = await Promise.all([
        this.lancamentoService.listRosterDoDia(data),
        this.lancamentoService.listBaixasDoDia(data),
        this.lancamentoService.listOsDoDia(data),
        this.lancamentoService.listFuncoesFixasDoDia(data),
        this.guarnicoesService.listGuarnicoes(),
        this.policiaisService.listPoliciais(),
        this.relatorioSeiService.listComplementos(data),
      ]);
      this.roster.set(roster);
      this.baixas.set(baixas);
      this.osRows.set(osRows);
      this.funcoesFixas.set(funcoesFixas);
      this.guarnicoes.set(guarnicoes);
      this.policiais.set(policiais);
      const complementos = { PJES_DIARIA: '', FISCALIZACAO: '', POG: '', DIRESP: '', OBSERVACOES: '' };
      for (const row of complementoRows) {
        complementos[row.campo] = row.conteudo;
      }
      this.complementos.set(complementos);
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

  private montarInput(): RelatorioSeiInput {
    return {
      data: this.data(),
      guarnicoes: this.guarnicoes(),
      policiais: this.policiais(),
      roster: this.roster(),
      baixas: this.baixas(),
      osRows: this.osRows(),
      funcoesFixas: this.funcoesFixas(),
      complementos: this.complementos(),
    };
  }

  get relatorioHtml(): string {
    return montarRelatorioHtml(this.montarInput());
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

  async onSalvarComplemento(campo: CampoComplemento): Promise<void> {
    try {
      await this.relatorioSeiService.salvarComplemento(this.data(), campo, this.complementos()[campo]);
    } catch {
      this.errorMessage.set('Não foi possível salvar o texto complementar.');
    }
  }

  updateComplemento(campo: CampoComplemento, valor: string): void {
    this.complementos.update((atual) => ({ ...atual, [campo]: valor }));
  }

  async copiarRelatorio(): Promise<void> {
    const html = this.relatorioHtml;
    const texto = this.gerarTexto();
    try {
      const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (ClipboardItemCtor && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItemCtor({
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
