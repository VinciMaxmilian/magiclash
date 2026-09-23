/**
 * Tiny builder for HTML forms shown over the canvas (Phaser DOM layer). Text is always set
 * with textContent / value — never innerHTML with user data.
 */

export interface FieldSpec {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'file';
  value?: string;
  maxLength?: number;
  pattern?: string;
  autocomplete?: string;
  accept?: string;
}

export interface SelectSpec {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
}

export interface ButtonSpec {
  id: string;
  label: string;
  submit?: boolean;
  secondary?: boolean;
}

export class DomForm {
  readonly el: HTMLFormElement;
  private readonly msg: HTMLDivElement;

  constructor(fields: (FieldSpec | SelectSpec)[], buttons: ButtonSpec[][], onButton: (id: string, form: DomForm) => void) {
    this.el = document.createElement('form');
    this.el.className = 'mc-form';
    this.el.noValidate = true;
    this.el.autocomplete = 'on';

    for (const f of fields) {
      const label = document.createElement('label');
      label.textContent = f.label;
      if ('options' in f) {
        const sel = document.createElement('select');
        sel.name = f.name;
        for (const o of f.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        }
        if (f.value) sel.value = f.value;
        label.appendChild(sel);
      } else {
        const input = document.createElement('input');
        input.type = f.type;
        input.name = f.name;
        if (f.value !== undefined) input.value = f.value;
        if (f.maxLength) input.maxLength = f.maxLength;
        if (f.pattern) input.pattern = f.pattern;
        if (f.autocomplete) input.autocomplete = f.autocomplete as AutoFill;
        if (f.accept) input.accept = f.accept;
        input.spellcheck = false;
        label.appendChild(input);
      }
      this.el.appendChild(label);
    }

    this.msg = document.createElement('div');
    this.msg.className = 'mc-msg';
    this.msg.setAttribute('role', 'status');
    this.el.appendChild(this.msg);

    for (const row of buttons) {
      const r = document.createElement('div');
      r.className = 'mc-row';
      for (const b of row) {
        const btn = document.createElement('button');
        btn.type = b.submit ? 'submit' : 'button';
        btn.textContent = b.label;
        btn.dataset.id = b.id;
        if (b.secondary) btn.className = 'mc-secondary';
        if (!b.submit) btn.addEventListener('click', () => onButton(b.id, this));
        r.appendChild(btn);
      }
      this.el.appendChild(r);
    }
    const submitId = buttons.flat().find((b) => b.submit)?.id;
    this.el.addEventListener('submit', (e) => {
      e.preventDefault();
      if (submitId) onButton(submitId, this);
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onButton('back', this);
      }
    });
  }

  value(name: string): string {
    const el = this.el.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    return el ? el.value.trim() : '';
  }

  file(name: string): File | null {
    const el = this.el.elements.namedItem(name) as HTMLInputElement | null;
    return el?.files?.[0] ?? null;
  }

  message(text: string, ok = false): void {
    this.msg.textContent = text;
    this.msg.classList.toggle('ok', ok);
  }

  busy(on: boolean): void {
    for (const b of Array.from(this.el.querySelectorAll('button'))) b.disabled = on;
  }

  focusFirst(): void {
    (this.el.querySelector('input') as HTMLInputElement | null)?.focus();
  }
}
