import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  EscalaPjesRow,
  FuncaoPjes,
  NovaLinhaPjes,
  PjesService,
} from '../../../core/services/pjes.service';
import { PjesPdfService } from '../../../core/services/pjes-pdf.service';
import { extrairEscalaPjes, LinhaPjesExtraida } from '../../../core/services/pjes-pdf.parser';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const RE_HORA = /^\d{2}:\d{2}$/;

interface LinhaRevisao extends LinhaPjesExtraida {
  erros: string[];
}

function validar(l: LinhaPjesExtraida): string[] {
  const e: string[] = [];
  if (!l.data) e.push('data');
  if (!l.gtRotulo) e.push('GT');
  if (!l.nomeGuerra) e.push('nome');
  if (!RE_HORA.test(l.horarioInicio)) e.push('início');
  if (!RE_HORA.test(l.horarioFim)) e.push('fim');
  return e;
}

interface LinhaManual {
  funcao: FuncaoPjes;
  graduacao: string;
  matricula: string;
  nomeGuerra: string;
  telefone: string;
}

@Component({
  selector: 'app-escala-pjes-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './escala-pjes-page.html',
  styleUrl: './escala-pjes-page.css',
})
export class EscalaPjesPage {
  private readonly pjesService = inject(PjesService);
  private readonly pdfService = inject(PjesPdfService);

  readonly funcoes: FuncaoPjes[] = ['CMT', 'MOT', 'PAT', 'OUTRO'];

  readonly errorMessage = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  // Importação
  readonly lendo = signal(false);
  readonly linhasRevisao = signal<LinhaRevisao[]>([]);
  readonly salvandoImport = signal(false);

  // Manual
  readonly manualData = signal(hojeIso());
  readonly manualGt = signal('');
  readonly manualInicio = signal('06:00');
  readonly manualFim = signal('18:00');
  readonly manualLinhas = signal<LinhaManual[]>([
    { funcao: 'CMT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    { funcao: 'MOT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    { funcao: 'PAT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
  ]);
  readonly salvandoManual = signal(false);

  // Salvas
  readonly data = signal(hojeIso());
  readonly salvas = signal<EscalaPjesRow[]>([]);
  readonly loadingSalvas = signal(true);

  constructor() {
    void this.reloadSalvas();
  }

  async onArquivo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.lendo.set(true);
    this.errorMessage.set(null);
    try {
      const itens = await this.pdfService.extrairItens(file);
      const { linhas, ignoradas } = extrairEscalaPjes(itens);
      this.linhasRevisao.set(linhas.map((l) => ({ ...l, erros: validar(l) })));
      if (ignoradas > 0) {
        this.errorMessage.set(
          `${ignoradas} linha(s) não reconhecida(s) no PDF — confira o arquivo e complete manualmente.`,
        );
      } else if (linhas.length === 0) {
        this.errorMessage.set('Não foi possível extrair linhas desse PDF. Confira o arquivo ou lance manualmente.');
      }
    } catch {
      this.errorMessage.set('Falha ao ler o PDF.');
    } finally {
      this.lendo.set(false);
      input.value = '';
    }
  }

  atualizarRevisao(i: number, campo: keyof LinhaPjesExtraida, valor: string): void {
    this.linhasRevisao.update((linhas) => {
      const copia = [...linhas];
      const l = { ...copia[i], [campo]: valor } as LinhaRevisao;
      l.erros = validar(l);
      copia[i] = l;
      return copia;
    });
  }

  removerRevisao(i: number): void {
    this.linhasRevisao.update((linhas) => linhas.filter((_, idx) => idx !== i));
  }

  get revisaoValida(): boolean {
    const linhas = this.linhasRevisao();
    return linhas.length > 0 && linhas.every((l) => l.erros.length === 0);
  }

  async salvarImportacao(): Promise<void> {
    if (!this.revisaoValida) return;
    this.salvandoImport.set(true);
    this.errorMessage.set(null);
    this.info.set(null);
    try {
      const porData = new Map<string, NovaLinhaPjes[]>();
      for (const l of this.linhasRevisao()) {
        const arr = porData.get(l.data) ?? [];
        arr.push({
          data: l.data,
          gt_rotulo: l.gtRotulo,
          funcao: l.funcao,
          graduacao: l.graduacao?.trim() || null,
          matricula: l.matricula?.trim() || null,
          nome_guerra: l.nomeGuerra,
          telefone: l.telefone?.trim() || null,
          horario_inicio: l.horarioInicio,
          horario_fim: l.horarioFim,
          origem: 'PDF',
        });
        porData.set(l.data, arr);
      }
      for (const [data, linhas] of porData) {
        await this.pjesService.substituirDiaImportado(data, linhas);
      }
      this.linhasRevisao.set([]);
      this.info.set('Escala importada e salva.');
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível salvar a escala importada.');
    } finally {
      this.salvandoImport.set(false);
    }
  }

  adicionarLinhaManual(): void {
    this.manualLinhas.update((linhas) => [
      ...linhas,
      { funcao: 'OUTRO', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
    ]);
  }

  removerLinhaManual(i: number): void {
    this.manualLinhas.update((linhas) => linhas.filter((_, idx) => idx !== i));
  }

  atualizarLinhaManual(i: number, campo: keyof LinhaManual, valor: string): void {
    this.manualLinhas.update((linhas) => {
      const copia = [...linhas];
      copia[i] = { ...copia[i], [campo]: valor } as LinhaManual;
      return copia;
    });
  }

  async salvarManual(): Promise<void> {
    const gt = this.manualGt().trim();
    if (!gt || !RE_HORA.test(this.manualInicio()) || !RE_HORA.test(this.manualFim())) {
      this.errorMessage.set('Preencha GT/setor e horários (HH:MM) do bloco.');
      return;
    }
    const linhas = this.manualLinhas().filter((l) => l.nomeGuerra.trim());
    if (linhas.length === 0) {
      this.errorMessage.set('Adicione ao menos uma pessoa.');
      return;
    }
    this.salvandoManual.set(true);
    this.errorMessage.set(null);
    this.info.set(null);
    try {
      await this.pjesService.inserirLinhas(
        linhas.map((l) => ({
          data: this.manualData(),
          gt_rotulo: gt,
          funcao: l.funcao,
          graduacao: l.graduacao.trim() || null,
          matricula: l.matricula.trim() || null,
          nome_guerra: l.nomeGuerra.trim(),
          telefone: l.telefone.trim() || null,
          horario_inicio: this.manualInicio(),
          horario_fim: this.manualFim(),
          origem: 'MANUAL',
        })),
      );
      this.manualGt.set('');
      this.manualLinhas.set([
        { funcao: 'CMT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
        { funcao: 'MOT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
        { funcao: 'PAT', graduacao: '', matricula: '', nomeGuerra: '', telefone: '' },
      ]);
      this.info.set('Bloco adicionado à escala.');
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível adicionar o bloco.');
    } finally {
      this.salvandoManual.set(false);
    }
  }

  async onDataChange(nova: string): Promise<void> {
    this.data.set(nova);
    await this.reloadSalvas();
  }

  async reloadSalvas(): Promise<void> {
    this.loadingSalvas.set(true);
    try {
      this.salvas.set(await this.pjesService.listEscalaPjesDoDia(this.data()));
    } catch {
      this.errorMessage.set('Não foi possível carregar a escala salva.');
    } finally {
      this.loadingSalvas.set(false);
    }
  }

  async remover(id: string): Promise<void> {
    try {
      await this.pjesService.removerLinha(id);
      await this.reloadSalvas();
    } catch {
      this.errorMessage.set('Não foi possível remover a linha.');
    }
  }
}
