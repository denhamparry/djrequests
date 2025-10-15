{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.git
    pkgs.playwright-driver
    pkgs.netlify-cli
  ];

  shellHook = ''
    export PLAYWRIGHT_BROWSERS_PATH=0
    export NPM_CONFIG_PREFIX="$PWD/.npm-global"
    mkdir -p "$NPM_CONFIG_PREFIX"
    export PATH="$NPM_CONFIG_PREFIX/bin:$PATH"
    echo "Node $(node -v) | npm $(npm -v)"
    echo "Playwright browsers available via nix derivation (no download needed)."
  '';
}
