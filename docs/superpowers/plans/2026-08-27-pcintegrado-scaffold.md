# PCintegrado Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Angular + Tailwind frontend scaffold and the Supabase schema/Edge Function for PCintegrado's Etapa 1 (auth, RBAC guards, responsive shell, admin user management), ready to push to GitHub and deploy on Vercel.

**Architecture:** Angular 21 standalone-component SPA (Tailwind v4, `@supabase/supabase-js` client) talking to a Supabase Cloud project (Postgres + Auth + one Deno Edge Function). RLS enforces read/write access; an `AuthService` holds session/role state that `authGuard`/`roleGuard` consume for route protection. No Docker, no Realtime, no local Supabase stack — schema and function ship straight to the cloud project via the Supabase CLI.

**Tech Stack:** Angular CLI 21.2.3, Node 22, Tailwind CSS v4, @supabase/supabase-js v2, Supabase CLI, Jasmine/Karma (Angular default).

**Spec:** `docs/superpowers/specs/2026-08-27-pcintegrado-scaffold-design.md`

## Global Constraints

- No Docker anywhere in this stack.
- No sidebar navigation — Top App Bar (desktop) / Bottom Navigation Bar (mobile), CSS-breakpoint only.
- `anon` key is public-by-design and committed in `environment*.ts`; `service_role` key must never appear in any committed file — the Edge Function reads it only from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.
- Supabase project ref: `lyeoxvvhwdhwrscnvwhl`. Supabase URL: `https://lyeoxvvhwdhwrscnvwhl.supabase.co`.
- GitHub remote: `https://github.com/yLucasG/PCintegrado.git`.
- Standalone components only, no NgModules.
- Realtime/polling is explicitly out of scope for this phase.

---

### Task 1: Angular + Tailwind scaffold, Git init

**Files:**
- Create: entire Angular CLI output at repo root (`angular.json`, `package.json`, `src/`, etc.)
- Create: `.postcssrc.json`
- Modify: `src/styles.css`
- Delete: stray empty file `a` at repo root (leftover, not part of the project)

**Interfaces:**
- Produces: a buildable Angular app (`npm run build` succeeds) with Tailwind utility classes available in templates.

- [ ] **Step 1: Remove the stray placeholder file**

Run: `rm -f "/c/Users/User/Desktop/PCintegrado/a"`

- [ ] **Step 2: Scaffold the Angular app at repo root**

Run (from `/c/Users/User/Desktop/PCintegrado`):
```bash
ng new pcintegrado --directory=. --standalone --routing --style=css --ssr=false --skip-git --package-manager=npm --force
```
When prompted (if not fully suppressed by flags), accept defaults / decline AI-tooling and zoneless prompts.

- [ ] **Step 3: Verify the scaffold builds**

Run: `npm run build`
Expected: build completes with `Application bundle generation complete.` and no errors.

- [ ] **Step 4: Install Tailwind CSS v4**

Run: `npm install tailwindcss @tailwindcss/postcss postcss --save-dev`

- [ ] **Step 5: Configure PostCSS for Tailwind**

Create `.postcssrc.json`:
```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

- [ ] **Step 6: Import Tailwind in the global stylesheet**

Replace the contents of `src/styles.css` with:
```css
@import "tailwindcss";

html,
body {
  height: 100%;
  margin: 0;
}
```

- [ ] **Step 7: Smoke-test Tailwind is wired up**

Temporarily set `src/app/app.html` (or `app.component.html`, matching whatever `ng new` generated) content to:
```html
<p class="text-3xl font-bold text-blue-600">Tailwind OK</p>
```
Run: `npm run build`
Expected: build succeeds. Open `dist/**/index.html`'s referenced CSS bundle and confirm it contains compiled Tailwind utility rules (e.g. grep for `text-3xl`).
Run: `grep -r "text-3xl" dist/ || echo "NOT FOUND"`
Expected: a match is found (confirms Tailwind's engine processed the class). Revert the temporary template edit back to the CLI-generated default afterward.

- [ ] **Step 8: Initialize git and set the remote**

```bash
cd "/c/Users/User/Desktop/PCintegrado"
git init
git add -A
git commit -m "chore: scaffold Angular app with Tailwind CSS v4"
git remote add origin https://github.com/yLucasG/PCintegrado.git
```

---

### Task 2: Environment configuration

**Files:**
- Create: `src/environments/environment.ts`
- Create: `src/environments/environment.development.ts`
- Modify: `angular.json` (fileReplacements for the `development` configuration, if not already wired by `ng new`)

**Interfaces:**
- Produces: `environment.supabaseUrl: string`, `environment.supabaseAnonKey: string` — consumed by `SupabaseService` in Task 3.

- [ ] **Step 1: Create the production/default environment file**

Create `src/environments/environment.ts`:
```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://lyeoxvvhwdhwrscnvwhl.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZW94dnZod2Rod3JzY252d2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MjA1MTMsImV4cCI6MjEwMzM5NjUxM30.5UmTJGS53A80R1MVBDc5bigGWjjxyvitPdL8VO_89zM',
};
```

- [ ] **Step 2: Create the development environment file**

Create `src/environments/environment.development.ts` with identical content but `production: false` (same Supabase project is fine for this MVP — there is no separate dev project yet):
```typescript
export const environment = {
  production: false,
  supabaseUrl: 'https://lyeoxvvhwdhwrscnvwhl.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZW94dnZod2Rod3JzY252d2hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MjA1MTMsImV4cCI6MjEwMzM5NjUxM30.5UmTJGS53A80R1MVBDc5bigGWjjxyvitPdL8VO_89zM',
};
```

- [ ] **Step 3: Wire the file replacement (only if `ng new` didn't already)**

Check `angular.json` under `projects.pcintegrado.architect.build.configurations.development`. If it does not already contain a `fileReplacements` block, add:
```json
"fileReplacements": [
  {
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.development.ts"
  }
]
```

- [ ] **Step 4: Verify the build still succeeds**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/environments angular.json
git commit -m "feat: add Supabase environment configuration"
```

---

### Task 3: SupabaseService

**Files:**
- Create: `src/app/core/services/supabase.service.ts`
- Test: `src/app/core/services/supabase.service.spec.ts`

**Interfaces:**
- Consumes: `environment.supabaseUrl`, `environment.supabaseAnonKey` (Task 2).
- Produces: `SupabaseService.client: SupabaseClient` — consumed by `AuthService` (Task 4) and `AdminUsersService` (Task 11).

- [ ] **Step 1: Install the Supabase JS client**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: Write the failing test**

Create `src/app/core/services/supabase.service.spec.ts`:
```typescript
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
```

- [ ] **Step 2b: Run it to confirm it fails**

Run: `npm test -- --watch=false --include='**/supabase.service.spec.ts'`
Expected: FAIL — `Cannot find module './supabase.service'`.

- [ ] **Step 3: Implement the service**

Create `src/app/core/services/supabase.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- --watch=false --include='**/supabase.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/app/core/services/supabase.service.ts src/app/core/services/supabase.service.spec.ts
git commit -m "feat: add SupabaseService wrapping the JS client"
```

---

### Task 4: AuthService

**Files:**
- Create: `src/app/core/services/auth.service.ts`
- Test: `src/app/core/services/auth.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (Task 3).
- Produces:
  - `type RoleUsuario = 'ADMIN' | 'CIA_1' | 'CIA_2' | 'CIA_3' | 'PCTAT' | 'PJES' | 'PC_LANCAMENTO'`
  - `interface PerfilUsuario { id: string; role: RoleUsuario }`
  - `AuthService.session$: Observable<Session | null>`
  - `AuthService.perfil$: Observable<PerfilUsuario | null>`
  - `AuthService.initialized$: Observable<boolean>`
  - `AuthService.currentSession: Session | null` (getter)
  - `AuthService.currentPerfil: PerfilUsuario | null` (getter)
  - `AuthService.signIn(email: string, password: string): Promise<void>`
  - `AuthService.signOut(): Promise<void>`
  - Consumed by `authGuard`/`roleGuard` (Task 5), `LoginPageComponent` (Task 6), `TopBar`/`BottomNav` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/auth.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

describe('AuthService', () => {
  function buildSupabaseStub(sessionUserId: string | null) {
    const session = sessionUserId ? { user: { id: sessionUserId } } : null;
    return {
      client: {
        auth: {
          getSession: () => Promise.resolve({ data: { session } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: jasmine.createSpy().and.resolveTo({ error: null }),
          signOut: jasmine.createSpy().and.resolveTo({ error: null }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: sessionUserId ? { id: sessionUserId, role: 'ADMIN' } : null }),
            }),
          }),
        }),
      },
    };
  }

  it('marks itself initialized with no session when getSession resolves empty', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: buildSupabaseStub(null) }],
    });
    const service = TestBed.inject(AuthService);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.currentSession).toBeNull();
    expect(service.currentPerfil).toBeNull();
  });

  it('loads the perfil for an existing session', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: buildSupabaseStub('user-1') }],
    });
    const service = TestBed.inject(AuthService);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.currentSession?.user.id).toBe('user-1');
    expect(service.currentPerfil?.role).toBe('ADMIN');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- --watch=false --include='**/auth.service.spec.ts'`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Implement AuthService**

Create `src/app/core/services/auth.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import type { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type RoleUsuario =
  | 'ADMIN'
  | 'CIA_1'
  | 'CIA_2'
  | 'CIA_3'
  | 'PCTAT'
  | 'PJES'
  | 'PC_LANCAMENTO';

export interface PerfilUsuario {
  id: string;
  role: RoleUsuario;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  private readonly perfilSubject = new BehaviorSubject<PerfilUsuario | null>(null);
  private readonly initializedSubject = new BehaviorSubject<boolean>(false);

  readonly session$ = this.sessionSubject.asObservable();
  readonly perfil$ = this.perfilSubject.asObservable();
  readonly initialized$ = this.initializedSubject.asObservable();

  constructor() {
    this.supabase.client.auth.getSession().then(({ data }) => {
      this.sessionSubject.next(data.session);
      if (data.session) {
        this.loadPerfil(data.session.user.id).finally(() => this.initializedSubject.next(true));
      } else {
        this.initializedSubject.next(true);
      }
    });

    this.supabase.client.auth.onAuthStateChange((_event, session) => {
      this.sessionSubject.next(session);
      if (session) {
        this.loadPerfil(session.user.id);
      } else {
        this.perfilSubject.next(null);
      }
    });
  }

  get currentSession(): Session | null {
    return this.sessionSubject.value;
  }

  get currentPerfil(): PerfilUsuario | null {
    return this.perfilSubject.value;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  private async loadPerfil(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('perfis_usuarios')
      .select('id, role')
      .eq('id', userId)
      .single();
    this.perfilSubject.next((data as PerfilUsuario | null) ?? null);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- --watch=false --include='**/auth.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/auth.service.ts src/app/core/services/auth.service.spec.ts
git commit -m "feat: add AuthService with session and perfil state"
```

---

### Task 5: AuthGuard and RoleGuard

**Files:**
- Create: `src/app/core/guards/auth.guard.ts`
- Test: `src/app/core/guards/auth.guard.spec.ts`
- Create: `src/app/core/guards/role.guard.ts`
- Test: `src/app/core/guards/role.guard.spec.ts`

**Interfaces:**
- Consumes: `AuthService.initialized$`, `AuthService.currentSession`, `AuthService.currentPerfil`, `RoleUsuario` (Task 4).
- Produces: `authGuard: CanActivateFn`, `roleGuard: CanActivateFn` — consumed by `app.routes.ts` (Task 6/8).

- [ ] **Step 1: Write the failing test for authGuard**

Create `src/app/core/guards/auth.guard.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
  }

  it('allows navigation when there is a session', async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: { initialized$: of(true), currentSession: { user: { id: '1' } } },
        },
      ],
    });

    const result = await runGuard();
    expect(result).toBe(true);
  });

  it('redirects to /login when there is no session', async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: { initialized$: of(true), currentSession: null } }],
    });

    const result = await runGuard();
    expect(result instanceof UrlTree).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/auth.guard.spec.ts'`
Expected: FAIL — `Cannot find module './auth.guard'`.

- [ ] **Step 3: Implement authGuard**

Create `src/app/core/guards/auth.guard.ts`:
```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(authService.initialized$.pipe(filter(Boolean)));

  if (authService.currentSession) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
```

- [ ] **Step 4: Confirm the authGuard test passes**

Run: `npm test -- --watch=false --include='**/auth.guard.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Write the failing test for roleGuard**

Create `src/app/core/guards/role.guard.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';

describe('roleGuard', () => {
  function runGuard(roles: string[] | undefined, currentPerfil: { id: string; role: string } | null) {
    const route = { data: { roles } } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(route, {} as any));
  }

  it('allows navigation when the perfil role is in the allowed list', async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            initialized$: of(true),
            currentSession: { user: { id: '1' } },
            currentPerfil: { id: '1', role: 'ADMIN' },
          },
        },
      ],
    });

    const result = await runGuard(['ADMIN'], { id: '1', role: 'ADMIN' });
    expect(result).toBe(true);
  });

  it('redirects to / when the perfil role is not allowed', async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: {
            initialized$: of(true),
            currentSession: { user: { id: '1' } },
            currentPerfil: { id: '1', role: 'PJES' },
          },
        },
      ],
    });

    const result = await runGuard(['ADMIN'], { id: '1', role: 'PJES' });
    expect(result instanceof UrlTree).toBe(true);
  });

  it('redirects to /login when there is no session', async () => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        {
          provide: AuthService,
          useValue: { initialized$: of(true), currentSession: null, currentPerfil: null },
        },
      ],
    });

    const result = await runGuard(['ADMIN'], null);
    expect(result instanceof UrlTree).toBe(true);
  });
});
```

- [ ] **Step 6: Confirm it fails**

Run: `npm test -- --watch=false --include='**/role.guard.spec.ts'`
Expected: FAIL — `Cannot find module './role.guard'`.

- [ ] **Step 7: Implement roleGuard**

Create `src/app/core/guards/role.guard.ts`:
```typescript
import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService, RoleUsuario } from '../services/auth.service';

export const roleGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await firstValueFrom(authService.initialized$.pipe(filter(Boolean)));

  if (!authService.currentSession) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data['roles'] as RoleUsuario[] | undefined;
  if (!allowedRoles || allowedRoles.length === 0) {
    return true;
  }

  const perfil = authService.currentPerfil;
  if (perfil && allowedRoles.includes(perfil.role)) {
    return true;
  }

  return router.createUrlTree(['/']);
};
```

- [ ] **Step 8: Confirm the roleGuard tests pass**

Run: `npm test -- --watch=false --include='**/role.guard.spec.ts'`
Expected: PASS (3 specs).

- [ ] **Step 9: Commit**

```bash
git add src/app/core/guards
git commit -m "feat: add authGuard and roleGuard"
```

---

### Task 6: Login page

**Files:**
- Create: `src/app/features/auth/login-page.component.ts`
- Create: `src/app/features/auth/login-page.component.html`
- Test: `src/app/features/auth/login-page.component.spec.ts`

**Interfaces:**
- Consumes: `AuthService.signIn` (Task 4).
- Produces: `LoginPageComponent` (standalone) — routed at `/login` in Task 8.

- [ ] **Step 1: Generate the component**

Run: `npx ng generate component features/auth/login-page --standalone --skip-tests=false --flat=false`
This creates the `.ts`/`.html`/`.css`/`.spec.ts` files with the default "should create" test.

- [ ] **Step 2: Run the generated test to confirm it passes as-is**

Run: `npm test -- --watch=false --include='**/login-page.component.spec.ts'`
Expected: PASS (default "should create" spec).

- [ ] **Step 3: Implement the component logic**

Replace `src/app/features/auth/login-page.component.ts` with:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);

  async onSubmit(): Promise<void> {
    this.errorMessage.set(null);
    this.submitting.set(true);
    try {
      await this.authService.signIn(this.email(), this.password());
      await this.router.navigate(['/']);
    } catch (err) {
      this.errorMessage.set('E-mail ou senha inválidos.');
    } finally {
      this.submitting.set(false);
    }
  }
}
```

- [ ] **Step 4: Implement the template**

Replace `src/app/features/auth/login-page.component.html` with:
```html
<div class="flex min-h-screen items-center justify-center bg-slate-100">
  <form class="w-full max-w-sm rounded-lg bg-white p-8 shadow" (ngSubmit)="onSubmit()">
    <h1 class="mb-6 text-xl font-semibold text-slate-800">PCintegrado</h1>

    <label class="mb-1 block text-sm font-medium text-slate-600">E-mail</label>
    <input
      class="mb-4 w-full rounded border border-slate-300 px-3 py-2"
      type="email"
      name="email"
      required
      [ngModel]="email()"
      (ngModelChange)="email.set($event)"
    />

    <label class="mb-1 block text-sm font-medium text-slate-600">Senha</label>
    <input
      class="mb-4 w-full rounded border border-slate-300 px-3 py-2"
      type="password"
      name="password"
      required
      [ngModel]="password()"
      (ngModelChange)="password.set($event)"
    />

    @if (errorMessage()) {
      <p class="mb-4 text-sm text-red-600">{{ errorMessage() }}</p>
    }

    <button
      class="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      type="submit"
      [disabled]="submitting()"
    >
      Entrar
    </button>
  </form>
</div>
```

- [ ] **Step 5: Run the tests again**

Run: `npm test -- --watch=false --include='**/login-page.component.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/features/auth
git commit -m "feat: add login page"
```

---

### Task 7: Responsive shell layout (Top App Bar / Bottom Nav)

**Files:**
- Create: `src/app/layout/top-bar/top-bar.component.ts`
- Create: `src/app/layout/top-bar/top-bar.component.html`
- Create: `src/app/layout/bottom-nav/bottom-nav.component.ts`
- Create: `src/app/layout/bottom-nav/bottom-nav.component.html`
- Create: `src/app/layout/shell/shell.component.ts`
- Create: `src/app/layout/shell/shell.component.html`
- Test: `src/app/layout/shell/shell.component.spec.ts`

**Interfaces:**
- Consumes: `AuthService.perfil$`, `AuthService.signOut` (Task 4).
- Produces: `ShellComponent` (standalone, contains `<router-outlet>`) — routed as the parent of `/` in Task 8.

- [ ] **Step 1: Generate the three components**

```bash
npx ng generate component layout/top-bar --standalone --flat=false
npx ng generate component layout/bottom-nav --standalone --flat=false
npx ng generate component layout/shell --standalone --flat=false
```

- [ ] **Step 2: Confirm the generated specs pass as-is**

Run: `npm test -- --watch=false --include='**/layout/**/*.spec.ts'`
Expected: PASS (3 default "should create" specs).

- [ ] **Step 3: Implement TopBarComponent**

Replace `src/app/layout/top-bar/top-bar.component.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './top-bar.component.html',
})
export class TopBarComponent {
  readonly authService = inject(AuthService);

  signOut(): void {
    void this.authService.signOut();
  }
}
```

Replace `src/app/layout/top-bar/top-bar.component.html`:
```html
<header class="hidden h-16 items-center justify-between border-b border-slate-200 bg-white px-6 md:flex">
  <span class="text-lg font-semibold text-slate-800">PCintegrado</span>

  <nav class="flex items-center gap-6">
    <a class="text-slate-600 hover:text-blue-600" routerLink="/" routerLinkActive="text-blue-600" [routerLinkActiveOptions]="{ exact: true }">
      Painel
    </a>
    @if (authService.currentPerfil?.role === 'ADMIN') {
      <a class="text-slate-600 hover:text-blue-600" routerLink="/admin" routerLinkActive="text-blue-600">
        Admin
      </a>
    }
    <button class="text-sm text-slate-500 hover:text-red-600" (click)="signOut()">Sair</button>
  </nav>
</header>
```

- [ ] **Step 4: Implement BottomNavComponent**

Replace `src/app/layout/bottom-nav/bottom-nav.component.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
})
export class BottomNavComponent {
  readonly authService = inject(AuthService);
}
```

Replace `src/app/layout/bottom-nav/bottom-nav.component.html`:
```html
<nav class="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-slate-200 bg-white md:hidden">
  <a class="text-sm text-slate-600" routerLink="/" routerLinkActive="text-blue-600" [routerLinkActiveOptions]="{ exact: true }">
    Painel
  </a>
  @if (authService.currentPerfil?.role === 'ADMIN') {
    <a class="text-sm text-slate-600" routerLink="/admin" routerLinkActive="text-blue-600">
      Admin
    </a>
  }
</nav>
```

- [ ] **Step 5: Implement ShellComponent**

Replace `src/app/layout/shell/shell.component.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, TopBarComponent, BottomNavComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent {}
```

Replace `src/app/layout/shell/shell.component.html`:
```html
<div class="min-h-screen bg-slate-50 pb-16 md:pb-0">
  <app-top-bar />
  <main class="mx-auto max-w-5xl p-4">
    <router-outlet />
  </main>
  <app-bottom-nav />
</div>
```

- [ ] **Step 6: Run the layout tests again**

Run: `npm test -- --watch=false --include='**/layout/**/*.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout
git commit -m "feat: add responsive shell (top bar desktop / bottom nav mobile)"
```

---

### Task 8: Dashboard page and route wiring

**Files:**
- Create: `src/app/features/dashboard/dashboard-page.component.ts`
- Create: `src/app/features/dashboard/dashboard-page.component.html`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/app.ts` (or `app.component.ts`, whichever `ng new` generated) if it needs `<router-outlet>` wiring beyond the CLI default

**Interfaces:**
- Consumes: `authGuard`, `roleGuard` (Task 5), `ShellComponent` (Task 7), `LoginPageComponent` (Task 6).
- Produces: full routing tree — this is the task that makes the app navigable end-to-end.

- [ ] **Step 1: Generate the dashboard placeholder**

Run: `npx ng generate component features/dashboard/dashboard-page --standalone --flat=false`

- [ ] **Step 2: Implement the placeholder content**

Replace `src/app/features/dashboard/dashboard-page.component.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Painel</h1>
<p class="mt-2 text-slate-600">
  Bem-vindo ao PCintegrado. As telas de lançamento de efetivo e viaturas
  chegam nas próximas etapas.
</p>
```

Keep the generated `dashboard-page.component.ts` as-is (default standalone shell is sufficient — no logic needed yet).

- [ ] **Step 3: Write app.routes.ts**

Replace `src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then(
            (m) => m.DashboardPageComponent,
          ),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('./features/admin/admin-users-page/admin-users-page.component').then(
            (m) => m.AdminUsersPageComponent,
          ),
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  { path: '**', redirectTo: '' },
];
```

Note: this route references `AdminUsersPageComponent`, which is created in Task 11. The app will not build cleanly until Task 11 lands — that is expected; Tasks 9-10 (Supabase schema/function) don't touch the Angular build.

- [ ] **Step 4: Confirm the root component just renders `<router-outlet>`**

Open the CLI-generated root component template (`src/app/app.html`) and confirm it is exactly:
```html
<router-outlet />
```
If `ng new` scaffolded a marketing/default template instead, replace it with the line above.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.routes.ts src/app/app.html src/app/features/dashboard
git commit -m "feat: add dashboard page and wire up routing"
```

(Build verification for the full route tree happens at the end of Task 11, once `AdminUsersPageComponent` exists.)

---

### Task 9: Supabase CLI + `supabase init`

**Files:**
- Create: `supabase/config.toml` (generated)
- Create: `supabase/.gitignore` (generated)

**Interfaces:**
- Produces: the `supabase/` directory structure that Tasks 10-11 add files into.

- [ ] **Step 1: Install the Supabase CLI**

Run (Windows, via npm as a dev dependency so no global/Scoop install is required):
```bash
npm install supabase --save-dev
```

- [ ] **Step 2: Verify the CLI runs**

Run: `npx supabase --version`
Expected: prints a version number (e.g. `2.x.x`).

- [ ] **Step 3: Initialize the Supabase project structure**

Run (from repo root): `npx supabase init`
When prompted about generating VS Code settings, answer as convenient (either is fine — it does not affect the app).
Expected: creates `supabase/config.toml` and `supabase/.gitignore`.

- [ ] **Step 4: Commit**

```bash
git add supabase package.json package-lock.json
git commit -m "chore: initialize Supabase CLI project structure"
```

---

### Task 10: Database schema (`supabase/schema.sql`)

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: the full Postgres schema (enums, tables, triggers, RLS policies) that `AuthService`, `AdminUsersService`, and the `create-user` Edge Function depend on at runtime.

- [ ] **Step 1: Write the schema file**

Create `supabase/schema.sql`:
```sql
-- Enums
create type public.role_usuario as enum (
  'ADMIN', 'CIA_1', 'CIA_2', 'CIA_3', 'PCTAT', 'PJES', 'PC_LANCAMENTO'
);
create type public.funcao_escala as enum ('CMT', 'MOT', 'PAT');
create type public.status_escala as enum ('PREVISTO', 'PRESENTE', 'FALTA', 'ATESTADO');

-- Companhias (lookup table backing policiais.companhia_id)
create table public.companhias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

insert into public.companhias (nome) values
  ('1ª CPM'), ('2ª CPM'), ('3ª CPM'), ('PCTAT'), ('PJES');

-- Perfis (role assignment; rows are only ever written by the Edge Function
-- via the service_role key, which bypasses RLS)
create table public.perfis_usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.role_usuario not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Policiais
create table public.policiais (
  matricula varchar(20) primary key,
  graduacao text not null,
  nome_guerra text not null,
  telefone text,
  companhia_id uuid references public.companhias (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Viaturas
create table public.viaturas (
  prefixo varchar(20) primary key,
  area_atuacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Escalas
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  horario_inicio time not null,
  horario_fim time not null,
  policial_matricula varchar(20) not null references public.policiais (matricula),
  viatura_prefixo varchar(20) references public.viaturas (prefixo),
  funcao public.funcao_escala not null,
  status public.status_escala not null default 'PREVISTO',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id),
  atualizado_por uuid references auth.users (id)
);

-- Auditoria
create table public.auditoria_escalas (
  id uuid primary key default gen_random_uuid(),
  escala_id uuid not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antigos jsonb,
  dados_novos jsonb,
  usuario_id uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

-- Stamp criado_por/atualizado_por on insert
create or replace function public.fn_set_criado_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.criado_por = auth.uid();
  new.atualizado_por = auth.uid();
  return new;
end;
$$;

create trigger trg_escalas_set_criado_por
before insert on public.escalas
for each row execute function public.fn_set_criado_por();

create trigger trg_policiais_set_criado_por
before insert on public.policiais
for each row execute function public.fn_set_criado_por();

create trigger trg_viaturas_set_criado_por
before insert on public.viaturas
for each row execute function public.fn_set_criado_por();

-- Audit trigger for escalas
create or replace function public.fn_auditoria_escalas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.auditoria_escalas (escala_id, operacao, dados_novos, usuario_id)
    values (new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif (tg_op = 'UPDATE') then
    new.atualizado_em = now();
    new.atualizado_por = auth.uid();
    insert into public.auditoria_escalas (escala_id, operacao, dados_antigos, dados_novos, usuario_id)
    values (new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.auditoria_escalas (escala_id, operacao, dados_antigos, usuario_id)
    values (old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_auditoria_escalas
before insert or update or delete on public.escalas
for each row execute function public.fn_auditoria_escalas();

-- Row Level Security
alter table public.companhias enable row level security;
alter table public.perfis_usuarios enable row level security;
alter table public.policiais enable row level security;
alter table public.viaturas enable row level security;
alter table public.escalas enable row level security;
alter table public.auditoria_escalas enable row level security;

create policy "authenticated_select_companhias" on public.companhias
  for select to authenticated using (true);

create policy "authenticated_select_perfis" on public.perfis_usuarios
  for select to authenticated using (true);

create policy "authenticated_select_policiais" on public.policiais
  for select to authenticated using (true);
create policy "authenticated_insert_policiais" on public.policiais
  for insert to authenticated with check (true);
create policy "authenticated_update_policiais" on public.policiais
  for update to authenticated using (true);

create policy "authenticated_select_viaturas" on public.viaturas
  for select to authenticated using (true);
create policy "authenticated_insert_viaturas" on public.viaturas
  for insert to authenticated with check (true);
create policy "authenticated_update_viaturas" on public.viaturas
  for update to authenticated using (true);

create policy "authenticated_select_escalas" on public.escalas
  for select to authenticated using (true);
create policy "authenticated_insert_escalas" on public.escalas
  for insert to authenticated with check (true);
create policy "authenticated_update_escalas" on public.escalas
  for update to authenticated using (true);

create policy "authenticated_select_auditoria" on public.auditoria_escalas
  for select to authenticated using (true);
```

- [ ] **Step 2: Sanity-check the SQL with a syntax-only local parse**

There is no local Postgres instance in this environment (Docker is intentionally out of scope), so full execution can't happen here. Do a structural sanity check instead:

Run: `grep -c "create table" supabase/schema.sql`
Expected: `6` (companhias, perfis_usuarios, policiais, viaturas, escalas, auditoria_escalas).

Run: `grep -c "^create policy" supabase/schema.sql`
Expected: `11`.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema (tables, audit trigger, RLS)"
```

- [ ] **Step 4: Document the deploy command (do not run — requires interactive `supabase login`)**

Add a comment block at the very top of `supabase/schema.sql`:
```sql
-- Deploy with:
--   supabase login
--   supabase link --project-ref lyeoxvvhwdhwrscnvwhl
--   supabase db push
```

---

### Task 11: Edge Function `create-user`

**Files:**
- Create: `supabase/functions/create-user/index.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (env vars Supabase injects automatically into every deployed function).
- Produces: `POST /functions/v1/create-user` — consumed by `AdminUsersService` (Task 12).

- [ ] **Step 1: Write the function**

Create `supabase/functions/create-user/index.ts`:
```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerProfile, error: profileError } = await adminClient
    .from('perfis_usuarios')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || callerProfile?.role !== 'ADMIN') {
    return jsonResponse({ error: 'Forbidden: apenas ADMIN pode criar usuários' }, 403);
  }

  let body: { email?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
  }

  const { email, password, role } = body;
  if (!email || !password || !role) {
    return jsonResponse({ error: 'email, password e role são obrigatórios' }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? 'Falha ao criar usuário' }, 400);
  }

  const { error: insertProfileError } = await adminClient
    .from('perfis_usuarios')
    .insert({ id: created.user.id, role });

  if (insertProfileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: insertProfileError.message }, 400);
  }

  return jsonResponse({ id: created.user.id, email: created.user.email, role }, 201);
});
```

- [ ] **Step 2: Type-check the function**

The Supabase CLI bundles Deno; use it for a check without starting any local server (no Docker involved):
Run: `npx supabase --version` (confirms CLI presence, already done in Task 9)
Run: `npx --yes deno check supabase/functions/create-user/index.ts 2>&1 || echo "deno not directly invokable in this environment; skip to manual verification"`
If `deno` isn't available as a standalone binary here, skip execution and instead visually re-read the file for: matching braces, every branch returning a `Response`, and no `any` implicit type errors — this is a documented manual-verification fallback, not a placeholder, because installing a global Deno runtime is out of scope for this phase.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions
git commit -m "feat: add create-user Edge Function"
```

- [ ] **Step 4: Document the deploy command (do not run — requires interactive `supabase login`)**

Add a comment block at the very top of `supabase/functions/create-user/index.ts`:
```typescript
// Deploy with:
//   supabase login
//   supabase link --project-ref lyeoxvvhwdhwrscnvwhl
//   supabase functions deploy create-user
```

---

### Task 12: Admin Users feature

**Files:**
- Create: `src/app/core/services/admin-users.service.ts`
- Test: `src/app/core/services/admin-users.service.spec.ts`
- Create: `src/app/features/admin/admin-users-page/admin-users-page.component.ts`
- Create: `src/app/features/admin/admin-users-page/admin-users-page.component.html`
- Test: `src/app/features/admin/admin-users-page/admin-users-page.component.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (Task 3), `RoleUsuario` (Task 4).
- Produces: `AdminUsersService.listPerfis(): Promise<PerfilComEmail[]>`, `AdminUsersService.createUser(input: { email: string; password: string; role: RoleUsuario }): Promise<{ id: string; email: string; role: RoleUsuario }>` — satisfies the reference in `app.routes.ts` from Task 8.

- [ ] **Step 1: Write the failing test for the service**

Create `src/app/core/services/admin-users.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { AdminUsersService } from './admin-users.service';
import { SupabaseService } from './supabase.service';

describe('AdminUsersService', () => {
  it('lists perfis via a select on perfis_usuarios', async () => {
    const rows = [{ id: '1', role: 'ADMIN' }];
    const supabaseStub = {
      client: {
        from: () => ({ select: () => Promise.resolve({ data: rows, error: null }) }),
        functions: { invoke: jasmine.createSpy() },
      },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(AdminUsersService);
    const result = await service.listPerfis();
    expect(result).toEqual(rows as any);
  });

  it('creates a user via the create-user Edge Function', async () => {
    const invokeSpy = jasmine
      .createSpy()
      .and.resolveTo({ data: { id: 'u1', email: 'a@b.com', role: 'ADMIN' }, error: null });
    const supabaseStub = {
      client: { functions: { invoke: invokeSpy } },
    };

    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: supabaseStub }],
    });

    const service = TestBed.inject(AdminUsersService);
    const result = await service.createUser({ email: 'a@b.com', password: 'x', role: 'ADMIN' });

    expect(invokeSpy).toHaveBeenCalledWith('create-user', {
      body: { email: 'a@b.com', password: 'x', role: 'ADMIN' },
    });
    expect(result.id).toBe('u1');
  });
});
```

- [ ] **Step 2: Confirm it fails**

Run: `npm test -- --watch=false --include='**/admin-users.service.spec.ts'`
Expected: FAIL — `Cannot find module './admin-users.service'`.

- [ ] **Step 3: Implement AdminUsersService**

Create `src/app/core/services/admin-users.service.ts`:
```typescript
import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { RoleUsuario } from './auth.service';

export interface PerfilUsuarioRow {
  id: string;
  role: RoleUsuario;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: RoleUsuario;
}

export interface CreateUserResult {
  id: string;
  email: string;
  role: RoleUsuario;
}

@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly supabase = inject(SupabaseService);

  async listPerfis(): Promise<PerfilUsuarioRow[]> {
    const { data, error } = await this.supabase.client.from('perfis_usuarios').select('id, role');
    if (error) {
      throw error;
    }
    return (data ?? []) as PerfilUsuarioRow[];
  }

  async createUser(input: CreateUserInput): Promise<CreateUserResult> {
    const { data, error } = await this.supabase.client.functions.invoke('create-user', {
      body: input,
    });
    if (error) {
      throw error;
    }
    return data as CreateUserResult;
  }
}
```

- [ ] **Step 4: Confirm the service tests pass**

Run: `npm test -- --watch=false --include='**/admin-users.service.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Generate the admin page component**

Run: `npx ng generate component features/admin/admin-users-page --standalone --flat=false`

- [ ] **Step 6: Confirm the generated spec passes as-is**

Run: `npm test -- --watch=false --include='**/admin-users-page.component.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Implement the component**

Replace `src/app/features/admin/admin-users-page/admin-users-page.component.ts`:
```typescript
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminUsersService, PerfilUsuarioRow } from '../../../core/services/admin-users.service';
import { RoleUsuario } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users-page.component.html',
})
export class AdminUsersPageComponent {
  private readonly adminUsersService = inject(AdminUsersService);

  readonly perfis = signal<PerfilUsuarioRow[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly creating = signal(false);

  readonly roles: RoleUsuario[] = [
    'ADMIN',
    'CIA_1',
    'CIA_2',
    'CIA_3',
    'PCTAT',
    'PJES',
    'PC_LANCAMENTO',
  ];

  readonly newEmail = signal('');
  readonly newPassword = signal('');
  readonly newRole = signal<RoleUsuario>('CIA_1');

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.perfis.set(await this.adminUsersService.listPerfis());
    } catch {
      this.errorMessage.set('Não foi possível carregar os usuários.');
    } finally {
      this.loading.set(false);
    }
  }

  async onCreateUser(): Promise<void> {
    this.creating.set(true);
    this.errorMessage.set(null);
    try {
      await this.adminUsersService.createUser({
        email: this.newEmail(),
        password: this.newPassword(),
        role: this.newRole(),
      });
      this.newEmail.set('');
      this.newPassword.set('');
      await this.reload();
    } catch {
      this.errorMessage.set('Não foi possível criar o usuário.');
    } finally {
      this.creating.set(false);
    }
  }
}
```

- [ ] **Step 8: Implement the template**

Replace `src/app/features/admin/admin-users-page/admin-users-page.component.html`:
```html
<h1 class="text-2xl font-semibold text-slate-800">Administração de Usuários</h1>

@if (errorMessage()) {
  <p class="mt-2 text-sm text-red-600">{{ errorMessage() }}</p>
}

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Novo usuário</h2>
  <form class="grid gap-3 sm:grid-cols-4" (ngSubmit)="onCreateUser()">
    <input
      class="rounded border border-slate-300 px-3 py-2 sm:col-span-2"
      type="email"
      placeholder="E-mail"
      required
      [ngModel]="newEmail()"
      (ngModelChange)="newEmail.set($event)"
      name="newEmail"
    />
    <input
      class="rounded border border-slate-300 px-3 py-2"
      type="password"
      placeholder="Senha"
      required
      [ngModel]="newPassword()"
      (ngModelChange)="newPassword.set($event)"
      name="newPassword"
    />
    <select
      class="rounded border border-slate-300 px-3 py-2"
      [ngModel]="newRole()"
      (ngModelChange)="newRole.set($event)"
      name="newRole"
    >
      @for (role of roles; track role) {
        <option [value]="role">{{ role }}</option>
      }
    </select>
    <button
      class="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50 sm:col-span-4"
      type="submit"
      [disabled]="creating()"
    >
      Criar usuário
    </button>
  </form>
</section>

<section class="mt-6 rounded-lg bg-white p-4 shadow">
  <h2 class="mb-3 text-lg font-medium text-slate-700">Usuários existentes</h2>
  @if (loading()) {
    <p class="text-slate-500">Carregando...</p>
  } @else {
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-slate-500">
          <th class="py-2">ID</th>
          <th class="py-2">Role</th>
        </tr>
      </thead>
      <tbody>
        @for (perfil of perfis(); track perfil.id) {
          <tr class="border-b border-slate-100">
            <td class="py-2 text-slate-700">{{ perfil.id }}</td>
            <td class="py-2 text-slate-700">{{ perfil.role }}</td>
          </tr>
        }
      </tbody>
    </table>
  }
</section>
```

- [ ] **Step 9: Confirm the component test still passes**

Run: `npm test -- --watch=false --include='**/admin-users-page.component.spec.ts'`
Expected: PASS.

- [ ] **Step 10: Run the full test suite**

Run: `npm test -- --watch=false`
Expected: all specs across the project PASS.

- [ ] **Step 11: Run a full production build (this is the task that finally makes `app.routes.ts` resolvable end-to-end)**

Run: `npm run build`
Expected: build succeeds with no errors, confirming every `loadComponent()` import in `app.routes.ts` resolves.

- [ ] **Step 12: Commit**

```bash
git add src/app/core/services/admin-users.service.ts src/app/core/services/admin-users.service.spec.ts src/app/features/admin
git commit -m "feat: add admin users list and create-user form"
```

---

### Task 13: Vercel config, push to GitHub, deployment handoff

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore` (ensure `node_modules`, `dist`, `.angular` are excluded — normally already handled by `ng new`)

**Interfaces:**
- Produces: a pushed `main` branch on `https://github.com/yLucasG/PCintegrado.git`, ready to import into Vercel.

- [ ] **Step 1: Add an SPA rewrite rule for Vercel**

Create `vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Confirm `.gitignore` excludes build artifacts**

Run: `grep -E "node_modules|dist|\.angular" .gitignore`
Expected: all three present (added automatically by `ng new`). If any is missing, append it.

- [ ] **Step 3: Commit the Vercel config**

```bash
git add vercel.json .gitignore
git commit -m "chore: add Vercel SPA rewrite config"
```

- [ ] **Step 4: Push to GitHub**

```bash
git branch -M main
git push -u origin main
```
Expected: push succeeds (assumes the user is already authenticated with GitHub in this environment's git credential store — if it prompts for credentials, stop and report back rather than guessing).

- [ ] **Step 5: Document the remaining manual deployment steps**

These require interactive auth this session cannot perform; report them back to the user as next steps rather than attempting them:
1. `supabase login` (opens a browser for OAuth)
2. `supabase link --project-ref lyeoxvvhwdhwrscnvwhl`
3. `supabase db push` (applies `supabase/schema.sql`)
4. `supabase functions deploy create-user`
5. In the Vercel dashboard: "Import Project" → select `yLucasG/PCintegrado` → framework preset "Angular" → deploy.
6. Create the first `ADMIN` user directly in the Supabase Studio (Authentication → Add user), then manually insert a matching row into `perfis_usuarios` with `role = 'ADMIN'` — bootstrapping the very first admin can't go through the `create-user` function, since that function requires an existing ADMIN to call it.

---

## Self-Review Notes

- **Spec coverage:** every section of the spec (`companhias` table, RLS on all operational tables, audit trigger with `auth.uid()`, `create-user` Edge Function with rollback, standalone Angular structure, guards, responsive shell, no Realtime) maps to a task above.
- **First-admin bootstrap gap:** the spec didn't address how the very first `ADMIN` gets created, since `create-user` requires an existing `ADMIN` caller. Documented as a manual Supabase Studio step in Task 13, Step 5.
- **Type consistency:** `RoleUsuario` is defined once in `auth.service.ts` (Task 4) and imported everywhere else (`role.guard.ts`, `admin-users.service.ts`, `admin-users-page.component.ts`) rather than redefined.
- **Build-order dependency:** `app.routes.ts` (Task 8) references `AdminUsersPageComponent` before it exists (Task 12) — called out explicitly in Task 8 so the executor doesn't treat the interim non-building state as a bug.
