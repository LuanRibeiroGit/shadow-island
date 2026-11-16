# Build no Windows

Pré-requisitos: Visual Studio Build Tools (C++), Rust estável (MSVC), Node 22, pnpm 10. WebView2 já vem no Windows 10/11
atualizados; o instalador baixa se faltar.

```powershell
pnpm install
node scripts/prepare-sidecar.mjs
cd apps/desktop; pnpm tauri build --bundles msi,nsis
```

Saída: `target\release\bundle\msi\*.msi` e `target\release\bundle\nsis\*-setup.exe` (instalação por usuário, sem admin).

O `settings.json` do Claude Code fica em `%USERPROFILE%\.claude\settings.json`. O hook é registrado com o caminho
absoluto de `ids-hook.exe` instalado junto do app.

A CI (`.github/workflows/ci.yml`) roda os testes e gera os pacotes em `windows-latest` e `ubuntu-22.04` a cada push.
