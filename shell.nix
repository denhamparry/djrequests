{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [
    pkgs.git
    pkgs.playwright-driver
    pkgs.netlify-cli
    pkgs.nil
    pkgs.vite
  ];

  shellHook = ''
    export PLAYWRIGHT_BROWSERS_PATH=0
    if command -v npm >/dev/null 2>&1; then
      export NPM_CONFIG_PREFIX="$PWD/.npm-global"
      mkdir -p "$NPM_CONFIG_PREFIX"
      export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
      echo "npm $(npm -v)"
    else
      echo "npm not provided by nix shell; relying on system installation if present."
    fi
    echo "Playwright browsers available via nix derivation (no download needed)."
  '';
}
