**Frescobol Ramiro**

Aplicativo web/mobile para controle de partidas, histórico e administração.

**Stack**

- React
- Vite
- Tailwind CSS
- Capacitor para Android e iOS

**Rodar local**

```bash
npm install
npm run dev
```

**Rodar a stack completa**

```bash
npm run dev:all
```

Esse comando sobe o frontend e o backend local juntos. Se um processo cair, o outro é encerrado também.
No Windows, o browser abre automaticamente quando a stack fica pronta.

**Rodar em produção local**

```bash
npm run prod
```

Esse comando gera o build do frontend e arranca o backend a servir a app compilada e a API no mesmo processo.

**Build para mobile**

```bash
npm run build
npx cap sync
```

**Android**

```bash
npx cap open android
```

**iOS**

```bash
npx cap open ios
```

**Observação**

Este repositório está em migração para uma camada de dados própria. As contas, o histórico e as configurações já passam a usar o backend local compartilhado quando a stack completa é iniciada com `npm run dev:all`.

**Produção local e Raspberry**

- `npm run prod` gera o build do frontend e arranca o backend para servir a app compilada no mesmo processo.
- O template do serviço `systemd` para Raspberry está em `deploy/raspberry/fce-app.service`.
- As instruções de instalação para a Raspberry estão em `deploy/raspberry/README.md`.
- O mapa de arquitetura e finalização está em `docs/architecture-map.md`.
- O fluxo oficial de trabalho está em `docs/official-flow.md`.
- O plano de estabilização final está em `docs/stabilization-plan.md`.
