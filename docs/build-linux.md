# Build no Linux

Dependências (Debian/Ubuntu 22.04+):

```bash
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libxdo-dev build-essential
```

Fedora: `webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel`.

```bash
pnpm install
node scripts/prepare-sidecar.mjs        # compila o relay ids-hook
cd apps/desktop && pnpm tauri build --bundles deb,appimage
```

Saída: `target/release/bundle/deb/*.deb` e `target/release/bundle/appimage/*.AppImage`.

## Notas de ambiente gráfico

- **Wayland**: o protocolo não deixa um app se posicionar nem ficar sempre no topo. Por padrão o app roda via XWayland
  (desligue em Configurações › Área de trabalho). Algumas placas exigem `WEBKIT_DISABLE_DMABUF_RENDERER=1`, que o app
  define automaticamente.
- **GNOME**: a bandeja precisa da extensão "AppIndicator and KStatusNotifierItem Support". Sem ela, fechar o castelo
  minimiza a janela e o atalho global continua funcionando quando o compositor permite.
- **KDE / XFCE / X11**: suporte completo.
- Transparência real precisa de compositor ativo.
